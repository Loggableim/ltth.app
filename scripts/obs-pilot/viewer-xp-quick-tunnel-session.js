'use strict';

// One-session, synthetic-only proof for the maintained Viewer-XP public surface.
// URLs and clipboard text stay in memory and are deliberately omitted from receipts.
const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('../../app/node_modules/playwright');
const { CLOUDFLARED_MANIFEST, CLOUDFLARED_VERSION, CloudflaredBinaryManager } = require('../../app/modules/cloudflared-binary-manager');
const { prepareDocsPluginFixture, isPathInside } = require('../lib/docs-capture-plugin-fixture');
const { createDocsCaptureChildEnvironment } = require('../lib/docs-capture-child-env');
const { writePluginDependencyResolver } = require('../lib/docs-capture-plugin-dependency-resolver');
const { isOwnedServer, restoreClipboard, stopOwnedChild } = require('./lib/quick-tunnel-cleanup');
const { createViewerXpReadinessGate } = require('./lib/viewer-xp-readiness-gate');
const { resolvePinnedSource, stagePinnedCloudflared } = require('./lib/cloudflared-temp-stager');

const ROOT = path.resolve(__dirname, '../..');
const MANIFEST_REL = 'docs/coordination/evidence/public-overlay-smoke/milestone-leaderboard/viewer-xp-quick-tunnel-manifest-20261008.json';
const RUNNER_REL = 'scripts/obs-pilot/viewer-xp-quick-tunnel-session.js';
const RUNNER_CLEANUP_REL = 'scripts/obs-pilot/lib/quick-tunnel-cleanup.js';
const RUNNER_READINESS_REL = 'scripts/obs-pilot/lib/viewer-xp-readiness-gate.js';
const RUNNER_READINESS_TEST_REL = 'scripts/obs-pilot/test/viewer-xp-quick-tunnel-resolver.test.js';
const RUNNER_STAGER_REL = 'scripts/obs-pilot/lib/cloudflared-temp-stager.js';
const RUNNER_STAGER_TEST_REL = 'scripts/obs-pilot/test/cloudflared-temp-stager.test.js';
const EXPECTED_NODE = '22.14.0';
const EXPECTED_CLOUDFLARED_SHA256 = 'cdb5d4432f6ae1595654a692a51308b69d2bf7af961f5578d9391837cf072df9';
const PLUGIN_ID = 'milestone-leaderboard';
const USERNAME = 'Synthetic_ViewerXP_Probe';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha256 = file => sha256(fs.readFileSync(file));
const inTemp = target => isPathInside(os.tmpdir(), target);

function collectRegularFiles(directory, relativeRoot, output) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(relativeRoot, entry.name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error('SNAPSHOT_LINK_REJECTED');
    if (stat.isDirectory()) collectRegularFiles(absolute, relative, output);
    else if (stat.isFile()) output.add(relative);
    else throw new Error('SNAPSHOT_SPECIAL_FILE_REJECTED');
  }
}

function snapshot(manifest) {
  const files = new Set(manifest.sourceFiles);
  files.add(MANIFEST_REL);
  files.add(RUNNER_REL);
  files.add(RUNNER_CLEANUP_REL);
  files.add(RUNNER_READINESS_REL);
  files.add(RUNNER_READINESS_TEST_REL);
  files.add(RUNNER_STAGER_REL);
  files.add(RUNNER_STAGER_TEST_REL);
  for (const relative of manifest.sourceDirectories) {
    collectRegularFiles(path.join(ROOT, relative), relative, files);
  }
  const entries = [...files].sort().map(relative => {
    const absolute = path.join(ROOT, relative);
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('SNAPSHOT_FILE_INVALID');
    return [relative, fileSha256(absolute)];
  });
  return { count: entries.length, digest: sha256(JSON.stringify(entries)), entries };
}

function assertSameSnapshot(expected, actual, phase) {
  if (expected.digest !== actual.digest || expected.count !== actual.count) {
    const before = new Map(expected.entries);
    const after = new Map(actual.entries);
    const changed = [...new Set([...before.keys(), ...after.keys()])]
      .filter(file => before.get(file) !== after.get(file));
    const error = new Error('SOURCE_SNAPSHOT_MISMATCH');
    error.phase = phase;
    error.changedPaths = changed;
    throw error;
  }
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitFor(predicate, timeoutMs = 15000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (_) {}
    await sleep(intervalMs);
  }
  throw new Error('WAIT_TIMEOUT');
}

async function requestJson(url, { method = 'GET', body, timeout = 12000 } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout)
  });
  let json = null;
  try { json = await response.json(); } catch (_) {}
  return { status: response.status, json };
}

async function findOwnedServer(childPid, preferredPort) {
  const ports = Array.from({ length: 51 }, (_, offset) => preferredPort + offset)
    .filter(candidate => candidate <= 65535);
  const matches = await Promise.all(ports.map(async candidate => {
    try {
      const response = await fetch(`http://127.0.0.1:${candidate}/api/health`, {
        signal: AbortSignal.timeout(500)
      });
      if (!response.ok) return null;
      const health = await response.json();
      return health?.status === 'ok' && health.pid === childPid
        ? { port: candidate, origin: `http://127.0.0.1:${candidate}` }
        : null;
    } catch (_) {
      return null;
    }
  }));
  return matches.find(Boolean) || null;
}

async function isPortClosed(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', error => resolve(error.code === 'ECONNREFUSED'));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

function listOwnedCloudflaredProcesses(profile) {
  const { execFileSync } = require('child_process');
  const command = '$ErrorActionPreference="SilentlyContinue"; $items=@(Get-Process -Name cloudflared -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ Id=$_.Id; Path=$_.Path } }); ConvertTo-Json -InputObject $items -Compress';
  try {
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (!raw) return [];
    const rows = JSON.parse(raw);
    return (Array.isArray(rows) ? rows : [rows]).filter(row =>
      typeof row.Path === 'string' && isPathInside(profile, row.Path)
    );
  } catch (_) {
    throw new Error('OWNED_PROCESS_AUDIT_UNAVAILABLE');
  }
}

async function main() {
  assert.equal(process.versions.node, EXPECTED_NODE, 'PINNED_NODE_MISMATCH');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST_REL), 'utf8'));
  assert.equal(manifest.pluginId, PLUGIN_ID, 'PLUGIN_ALLOWLIST_MISMATCH');
  assert.equal(manifest.runtimePins.cloudflaredVersion, CLOUDFLARED_VERSION, 'CLOUDFLARED_VERSION_MISMATCH');
  assert.equal(manifest.runtimePins.cloudflaredSha256, EXPECTED_CLOUDFLARED_SHA256, 'CLOUDFLARED_PIN_MISMATCH');
  assert.equal(CLOUDFLARED_MANIFEST['win32:x64'].sha256, EXPECTED_CLOUDFLARED_SHA256, 'CLOUDFLARED_SOURCE_PIN_MISMATCH');

  const first = snapshot(manifest);
  const second = snapshot(manifest);
  assertSameSnapshot(first, second, 'initial-two-snapshots');
  const report = {
    schemaVersion: 1,
    result: 'RUNNING',
    sourceSnapshotSha256: first.digest,
    sourceFileCount: first.count,
    sourceStableInitial: true,
    cloudflaredPinned: false,
    exactPluginAllowlist: true,
    appStarted: false,
    appPidVerified: false,
    viewerXpStatsStatus: null,
    viewerXpLeaderboardStatus: null,
    browserStarted: false,
    tunnelStarts: 0,
    tunnelStops: 0,
    publicHttpsLoads: 0,
    publicSocketsConnected: 0,
    appChildExitConfirmed: null,
    syntheticUpdateObserved: false,
    firstCopyVerified: false,
    secondCopyVerified: false,
    hostRotated: false,
    oldHostUnavailableAfterStop: false,
    unexpectedExternalBrowserRequests: 0,
    portClosed: false,
    ownedCloudflaredProcessesAfterCleanup: null,
    profileRemoved: false,
    clipboardRestoreAttempted: false,
    clipboardRestored: null,
    cleanupFailureCodes: [],
    failurePhase: null
  };

  let profile = null;
  let appChild = null;
  let context = null;
  let dashboard = null;
  let xpPage = null;
  let levelPage = null;
  let origin = null;
  let port = null;
  let firstRootUrl = null;
  let firstEntryUrl = null;
  let secondRootUrl = null;
  let secondEntryUrl = null;
  let savedClipboardText = null;
  let clipboardCaptured = false;
  let clipboardMayHaveChanged = false;
  const readinessGate = createViewerXpReadinessGate();
  const approvedBrowserHosts = new Set();
  let failure = null;

  try {
    report.failurePhase = 'create-temp-profile-and-plugin-fixture';
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-viewerxp-quick-tunnel-'));
    assert(inTemp(profile), 'PROFILE_OUTSIDE_TEMP');
    const pluginDir = prepareDocsPluginFixture(ROOT, profile, [PLUGIN_ID]);
    assert.deepEqual(fs.readdirSync(pluginDir).sort(), [PLUGIN_ID], 'PLUGIN_FIXTURE_NOT_EXACT');
    const pluginDependencyResolver = writePluginDependencyResolver({
      profileDir: profile,
      fixtureRoot: pluginDir,
      appNodeModules: path.join(ROOT, 'app', 'node_modules')
    });

    report.failurePhase = 'stage-and-pin-check';
    const toolsRoot = path.join(profile, 'ltth.app', 'runtime-tools');
    const sourcePath = resolvePinnedSource({ homeDir: os.homedir(), localAppData: process.env.LOCALAPPDATA });
    stagePinnedCloudflared({ sourcePath, toolsRoot });
    const binaryManager = new CloudflaredBinaryManager({
      toolsRoot,
      logger: { info() {}, warn() {}, error() {} }
    });
    const cloudflaredPath = await binaryManager.ensureInstalled();
    assert(isPathInside(profile, cloudflaredPath), 'CLOUDFLARED_OUTSIDE_TEMP_PROFILE');
    assert.equal(await fileSha256(cloudflaredPath), EXPECTED_CLOUDFLARED_SHA256, 'CLOUDFLARED_SHA256_MISMATCH');
    report.cloudflaredPinned = true;

    const beforeStart = snapshot(manifest);
    assertSameSnapshot(first, beforeStart, 'before-app-start');

    report.failurePhase = 'start-isolated-app';
    const preferredPort = await getFreePort();
    port = preferredPort;
    appChild = spawn(process.execPath, ['--require', pluginDependencyResolver, path.join(ROOT, 'app/server.js')], {
      cwd: path.join(ROOT, 'app'),
      env: createDocsCaptureChildEnvironment({
        profileDir: profile,
        port,
        pluginDir,
        allowedPluginIds: [PLUGIN_ID]
      }),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    report.appStarted = true;
    appChild.stdout.resume();
    appChild.stderr.resume();
    let ready;
    try {
      ready = await waitFor(async () => {
        if (appChild.exitCode !== null) return { exited: true };
        return findOwnedServer(appChild.pid, preferredPort);
      }, 30000);
    } catch (_) {
      throw new Error('OWNED_APP_SERVER_NOT_READY');
    }
    assert.notEqual(ready?.exited, true, 'APP_EXITED_EARLY');
    port = ready.port;
    origin = ready.origin;
    report.appPidVerified = true;
    report.failurePhase = 'verify-pid-bound-viewer-xp-routes';
    const statsReady = await requestJson(`${origin}/api/viewer-xp/stats`, { timeout: 5000 });
    report.viewerXpStatsStatus = statsReady.status;
    const leaderboardReady = await requestJson(`${origin}/api/viewer-xp/leaderboard`, { timeout: 5000 });
    report.viewerXpLeaderboardStatus = leaderboardReady.status;
    readinessGate.markReady({
      appPidVerified: report.appPidVerified,
      statsStatus: statsReady.status,
      leaderboardStatus: leaderboardReady.status
    });
    assertSameSnapshot(first, snapshot(manifest), 'before-first-tunnel-start');

    report.failurePhase = 'prepare-dashboard-and-clipboard';
    const browserDir = path.join(profile, 'browser');
    fs.mkdirSync(browserDir);
    context = await chromium.launchPersistentContext(browserDir, {
      executablePath: manifest.runtimePins.browserExecutable,
      headless: false,
      viewport: { width: 1400, height: 900 },
      locale: 'de-DE',
      args: ['--no-first-run', '--disable-default-apps']
    });
    report.browserStarted = true;
    await context.route('**/*', async route => {
      const requestUrl = route.request().url();
      if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) return route.continue();
      let parsed;
      try { parsed = new URL(requestUrl); } catch (_) { return route.abort(); }
      if (parsed.origin === origin || approvedBrowserHosts.has(parsed.hostname)) return route.continue();
      report.unexpectedExternalBrowserRequests += 1;
      return route.abort();
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    dashboard = context.pages()[0] || await context.newPage();
    dashboard.on('pageerror', () => {});
    await dashboard.goto(origin, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitFor(async () => dashboard.locator('nav.sidebar-nav .sidebar-category[data-category="management"] a.sidebar-item[data-view="settings"]').count() === 1, 15000);
    savedClipboardText = await dashboard.evaluate(async () => navigator.clipboard.readText());
    clipboardCaptured = true;

    report.failurePhase = 'first-tunnel-and-public-https';
    const firstStart = await readinessGate.ensure(() => requestJson(`${origin}/api/network/overlay-tunnel/ensure`, {
      method: 'POST',
      body: { overlayURL: `${origin}/overlay/viewer-xp/xp-bar?username=${encodeURIComponent(USERNAME)}` },
      timeout: 90000
    }));
    assert.equal(firstStart.status, 200, 'FIRST_TUNNEL_START_FAILED');
    firstRootUrl = firstStart.json?.tunnelURL;
    firstEntryUrl = firstStart.json?.publicURL;
    assert.match(firstRootUrl || '', /^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/$/i, 'FIRST_TUNNEL_URL_INVALID');
    assert.match(firstEntryUrl || '', /^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/overlay\/viewer-xp\/xp-bar\?/i, 'FIRST_PUBLIC_ENTRY_INVALID');
    approvedBrowserHosts.add(new URL(firstRootUrl).hostname);
    report.tunnelStarts += 1;
    report.failurePhase = 'first-copy';
    await dashboard.locator('nav.sidebar-nav .sidebar-category[data-category="management"] a.sidebar-item[data-view="settings"]').click();
    await dashboard.locator('#network-overlay-tunnel-copy:not([disabled])').waitFor({ state: 'visible', timeout: 15000 });
    clipboardMayHaveChanged = true;
    await dashboard.locator('#network-overlay-tunnel-copy').click();
    const firstClipboard = await dashboard.evaluate(async () => navigator.clipboard.readText());
    assert.equal(firstClipboard, firstRootUrl, 'FIRST_OS_CLIPBOARD_COPY_MISMATCH');
    report.firstCopyVerified = true;

    report.failurePhase = 'first-public-render-and-synthetic-update';
    xpPage = await context.newPage();
    levelPage = await context.newPage();
    const publicErrors = [];
    for (const page of [xpPage, levelPage]) page.on('pageerror', error => publicErrors.push(error.name));
    const levelUrl = new URL('/overlay/viewer-xp/level-up?lang=de&sound=false&duration=60000', firstRootUrl).href;
    const xpResponse = await xpPage.goto(firstEntryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.equal(xpResponse.status(), 200, 'FIRST_XP_BAR_HTTPS_FAILED');
    report.publicHttpsLoads += 1;
    await xpPage.waitForFunction(() => window.socket?.connected === true, null, { timeout: 30000 });
    await xpPage.waitForFunction(() => document.querySelector('#username')?.textContent === 'Synthetic_ViewerXP_Probe', null, { timeout: 30000 });
    report.publicSocketsConnected += 1;
    const levelResponse = await levelPage.goto(levelUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.equal(levelResponse.status(), 200, 'FIRST_LEVEL_UP_HTTPS_FAILED');
    report.publicHttpsLoads += 1;
    await levelPage.waitForFunction(() => window.socket?.connected === true, null, { timeout: 30000 });
    report.publicSocketsConnected += 1;

    const award = await requestJson(`${origin}/api/viewer-xp/award`, {
      method: 'POST',
      body: { username: USERNAME, amount: 250, reason: 'isolated synthetic public overlay verification' }
    });
    assert.equal(award.status, 200, 'SYNTHETIC_XP_AWARD_FAILED');
    await levelPage.waitForFunction(() => document.querySelector('#levelUpContainer')?.classList.contains('show') === true, null, { timeout: 15000 });
    await xpPage.waitForFunction(() => document.querySelector('#xp-gain') || Number((document.querySelector('#xpText')?.textContent || '').match(/\d+/)?.[0] || 0) >= 250, null, { timeout: 12000 }).catch(() => {});
    const updateObserved = await xpPage.evaluate(() => {
      const text = document.querySelector('#xpText')?.textContent || '';
      const current = Number(text.match(/\d+/)?.[0] || 0);
      return current >= 250;
    });
    assert(updateObserved, 'PUBLIC_XP_PROFILE_UPDATE_NOT_RENDERED');
    assert.deepEqual(publicErrors, [], 'PUBLIC_RENDERER_PAGE_ERROR');
    report.syntheticUpdateObserved = true;

    report.failurePhase = 'stop-first-tunnel-and-disconnect';
    await dashboard.locator('#network-overlay-tunnel-stop:not([disabled])').click();
    await dashboard.locator('#network-overlay-tunnel-stop[disabled]').waitFor({ state: 'visible', timeout: 15000 });
    await dashboard.waitForFunction(() => document.querySelector('#network-overlay-tunnel-url')?.style.display === 'none', null, { timeout: 15000 });
    await waitFor(() => Promise.resolve(xpPage.evaluate(() => window.socket?.connected === false)), 20000);
    await waitFor(() => Promise.resolve(levelPage.evaluate(() => window.socket?.connected === false)), 20000);
    report.tunnelStops += 1;
    const oldHostCheck = await fetch(firstEntryUrl, { signal: AbortSignal.timeout(12000) }).then(response => response.status).catch(() => 0);
    assert.notEqual(oldHostCheck, 200, 'OLD_PUBLIC_HOST_STILL_SERVING_AFTER_STOP');
    report.oldHostUnavailableAfterStop = true;

    report.failurePhase = 'second-tunnel-rotation-and-copy';
    assertSameSnapshot(first, snapshot(manifest), 'before-second-tunnel-start');
    const secondStart = await readinessGate.ensure(() => requestJson(`${origin}/api/network/overlay-tunnel/ensure`, {
      method: 'POST',
      body: { overlayURL: `${origin}/overlay/viewer-xp/xp-bar?username=${encodeURIComponent(USERNAME)}` },
      timeout: 90000
    }));
    assert.equal(secondStart.status, 200, 'SECOND_TUNNEL_START_FAILED');
    secondRootUrl = secondStart.json?.tunnelURL;
    secondEntryUrl = secondStart.json?.publicURL;
    assert.match(secondRootUrl || '', /^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/$/i, 'SECOND_TUNNEL_URL_INVALID');
    assert.notEqual(new URL(firstRootUrl).hostname, new URL(secondRootUrl).hostname, 'TUNNEL_HOST_DID_NOT_ROTATE');
    approvedBrowserHosts.add(new URL(secondRootUrl).hostname);
    report.hostRotated = true;
    report.tunnelStarts += 1;
    await dashboard.locator('#network-overlay-tunnel-copy:not([disabled])').waitFor({ state: 'visible', timeout: 15000 });
    clipboardMayHaveChanged = true;
    await dashboard.locator('#network-overlay-tunnel-copy').click();
    const secondClipboard = await dashboard.evaluate(async () => navigator.clipboard.readText());
    assert.equal(secondClipboard, secondRootUrl, 'SECOND_OS_CLIPBOARD_COPY_MISMATCH');
    report.secondCopyVerified = true;

    report.failurePhase = 'second-public-load-and-final-stop';
    await xpPage.goto('about:blank');
    const secondResponse = await xpPage.goto(secondEntryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.equal(secondResponse.status(), 200, 'SECOND_XP_BAR_HTTPS_FAILED');
    report.publicHttpsLoads += 1;
    await xpPage.waitForFunction(() => window.socket?.connected === true, null, { timeout: 30000 });
    await xpPage.waitForFunction(() => document.querySelector('#username')?.textContent === 'Synthetic_ViewerXP_Probe', null, { timeout: 30000 });
    report.publicSocketsConnected += 1;
    await dashboard.locator('#network-overlay-tunnel-stop:not([disabled])').click();
    await dashboard.locator('#network-overlay-tunnel-stop[disabled]').waitFor({ state: 'visible', timeout: 15000 });
    await dashboard.waitForFunction(() => document.querySelector('#network-overlay-tunnel-url')?.style.display === 'none', null, { timeout: 15000 });
    await waitFor(() => Promise.resolve(xpPage.evaluate(() => window.socket?.connected === false)), 20000);
    report.tunnelStops += 1;
    report.result = 'PASS_LOCAL_SYNTHETIC_QUICK_TUNNEL';
  } catch (error) {
    failure = error;
    report.result = 'FAIL_OR_BLOCKED';
    report.failurePhase ||= error.phase || 'preflight';
    report.failureCode = /^[A-Z0-9_]+$/.test(error.code) ? error.code
      : /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'UNEXPECTED_FAILURE';
    if (/^[A-Z0-9_]+$/.test(error.cause?.code)) report.failureCauseCode = error.cause.code;
    if (Array.isArray(error.changedPaths)) report.changedSourceCount = error.changedPaths.length;
  } finally {
    const clipboardCleanup = await restoreClipboard({
      shouldRestore: clipboardMayHaveChanged,
      captured: clipboardCaptured,
      savedText: savedClipboardText,
      restore: async value => {
        if (!context || !dashboard) return false;
        return dashboard.evaluate(async saved => {
          await navigator.clipboard.writeText(saved);
          return await navigator.clipboard.readText() === saved;
        }, value);
      }
    });
    report.clipboardRestoreAttempted = clipboardCleanup.attempted;
    report.clipboardRestored = clipboardCleanup.restored;
    if (clipboardCleanup.errorCode) report.cleanupFailureCodes.push(clipboardCleanup.errorCode);

    if (origin && appChild && appChild.exitCode === null && appChild.signalCode === null) {
      try {
        if (await isOwnedServer({ child: appChild, origin, requestJson })) {
          const state = await requestJson(`${origin}/api/network/config`, { timeout: 3000 });
          if (state.status === 200 && (state.json?.config?.overlayTunnel?.active || state.json?.config?.overlayTunnel?.starting) &&
              await isOwnedServer({ child: appChild, origin, requestJson })) {
            const stopped = await requestJson(`${origin}/api/network/overlay-tunnel/stop`, { method: 'POST', timeout: 10000 });
            if (stopped.status === 200 && stopped.json?.success) report.tunnelStops += 1;
          }
        }
      } catch (_) {}
    }
    if (context) await context.close().catch(() => {});
    const childCleanup = await stopOwnedChild({ child: appChild, origin, requestJson });
    report.appChildExitConfirmed = childCleanup.exitConfirmed;
    if (!childCleanup.exitConfirmed) {
      report.cleanupFailureCodes.push(childCleanup.errorCode || 'APP_CHILD_EXIT_NOT_CONFIRMED');
    }
    report.portClosed = port === null ? true : await isPortClosed(port);
    try {
      report.ownedCloudflaredProcessesAfterCleanup = profile ? listOwnedCloudflaredProcesses(profile).length : 0;
    } catch (_) {
      report.ownedCloudflaredProcessesAfterCleanup = null;
    }
    if (profile && inTemp(profile) && fs.existsSync(profile)) {
      if (report.ownedCloudflaredProcessesAfterCleanup === 0 && report.portClosed && report.appChildExitConfirmed) {
        fs.rmSync(profile, { recursive: true, force: false });
        report.profileRemoved = !fs.existsSync(profile);
      }
    }
    const finalSnapshot = snapshot(manifest);
    report.sourceStableFinal = finalSnapshot.digest === first.digest && finalSnapshot.count === first.count;
    if (!report.sourceStableFinal && report.result.startsWith('PASS')) report.result = 'FAIL_SOURCE_CHANGED';
    report.appExitCode = appChild?.exitCode ?? null;
    report.appSignal = appChild?.signalCode ?? null;
    if (report.cleanupFailureCodes.length && report.result.startsWith('PASS')) {
      report.result = 'FAIL_CLEANUP';
      report.failurePhase = 'cleanup';
      report.failureCode = report.cleanupFailureCodes[0];
    }
    report.failureCode ||= failure && (/^[A-Z0-9_]+$/.test(failure.code) ? failure.code
      : /^[A-Z0-9_]+$/.test(failure.message) ? failure.message : undefined);
    if (!report.failureCauseCode && /^[A-Z0-9_]+$/.test(failure?.cause?.code)) report.failureCauseCode = failure.cause.code;
    report.failurePhase ||= null;
    const receipt = path.join(ROOT, 'docs/coordination/evidence/public-overlay-smoke/milestone-leaderboard', `viewer-xp-quick-tunnel-result-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(receipt, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`${JSON.stringify({ result: report.result, sourceFileCount: report.sourceFileCount, sourceSnapshotSha256: report.sourceSnapshotSha256, cloudflaredPinned: report.cloudflaredPinned, tunnelStarts: report.tunnelStarts, tunnelStops: report.tunnelStops, publicHttpsLoads: report.publicHttpsLoads, publicSocketsConnected: report.publicSocketsConnected, hostRotated: report.hostRotated, firstCopyVerified: report.firstCopyVerified, secondCopyVerified: report.secondCopyVerified, portClosed: report.portClosed, ownedCloudflaredProcessesAfterCleanup: report.ownedCloudflaredProcessesAfterCleanup, profileRemoved: report.profileRemoved, sourceStableFinal: report.sourceStableFinal, failurePhase: report.failurePhase, failureCode: report.failureCode, receipt })}\n`);
    if (!report.result.startsWith('PASS') || report.appChildExitConfirmed !== true ||
        (clipboardMayHaveChanged && report.clipboardRestored !== true) || !report.portClosed ||
        report.ownedCloudflaredProcessesAfterCleanup !== 0 || !report.profileRemoved || !report.sourceStableFinal) {
      process.exitCode = 1;
    }
  }
}

main().catch(error => {
  process.stderr.write(`${/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'RUNNER_PREFLIGHT_FAILED'}\n`);
  process.exitCode = 1;
});
