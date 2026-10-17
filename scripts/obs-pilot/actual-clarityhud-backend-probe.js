'use strict';

// Isolated maintained-server probe for ClarityHUD's actual full-overlay route.
// Run with runtime/node/node.exe. It creates one temporary profile, enables only
// clarityhud through the docs-capture policy, performs only GETs for ClarityHUD
// routes, and uses the app's loopback shutdown API for lifecycle cleanup.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createDocsCaptureChildEnvironment } = require('../lib/docs-capture-child-env');
const { prepareDocsPluginFixture } = require('../lib/docs-capture-plugin-fixture');
const docsCapturePolicy = require('../../app/modules/docs-capture-policy');

const ROOT = path.resolve(__dirname, '../..');
const APP_ROOT = path.join(ROOT, 'app');
const ALLOWED_PLUGIN_IDS = ['clarityhud'];
const PROFILE_PREFIX = 'ltth-clarityhud-backend-probe-';
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const SOURCE_PATHS = [
  'app/server.js',
  'app/modules/docs-capture-policy.js',
  'app/modules/plugin-loader.js',
  'app/modules/config-path-manager.js',
  'app/modules/user-profiles.js',
  'app/modules/database.js',
  'app/modules/network-manager.js',
  'app/modules/public-overlay-access.js',
  'app/modules/public-overlay-registry.js',
  'app/public/js/i18n-client.js',
  'app/public/fonts/open-sans.css',
  'app/public/fonts/opendyslexic.css',
  'app/node_modules/socket.io/client-dist/socket.io.js',
  'scripts/lib/docs-capture-child-env.js',
  'scripts/lib/docs-capture-plugin-fixture.js',
  'scripts/obs-pilot/actual-clarityhud-backend-probe.js'
];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function inventoryDirectory(directory) {
  const files = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in source closure: ${absolute}`);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        const bytes = fs.readFileSync(absolute);
        files.push({ path: path.relative(directory, absolute).split(path.sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) });
      } else {
        throw new Error(`Unexpected non-file source entry: ${absolute}`);
      }
    }
  };
  visit(directory);
  files.sort((left, right) => left.path.localeCompare(right.path));
  const canonical = files.map(file => `${file.path}\0${file.bytes}\0${file.sha256}`).join('\n');
  return {
    files,
    count: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    sha256: sha256(Buffer.from(canonical))
  };
}

function sourceRecord(relativePath) {
  const bytes = fs.readFileSync(path.join(ROOT, relativePath));
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

async function reserveLoopbackPort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  return port;
}

async function isPortClosed(port) {
  return new Promise(resolve => {
    const probe = net.connect({ host: '127.0.0.1', port });
    probe.once('connect', () => { probe.destroy(); resolve(false); });
    probe.once('error', error => { probe.destroy(); resolve(error.code === 'ECONNREFUSED'); });
    probe.setTimeout(1500, () => { probe.destroy(); resolve(false); });
  });
}

function assertNoCheckoutDatabase() {
  for (const relativePath of [
    'app/database.db', 'app/database.db-wal', 'app/database.db-shm',
    'app/database.db.backup', 'app/database.db.backup-wal', 'app/database.db.backup-shm'
  ]) {
    if (fs.existsSync(path.join(ROOT, relativePath))) {
      throw new Error(`Refusing to start: a checkout legacy database could be migrated: ${relativePath}`);
    }
  }
}

async function main() {
  assert.equal(process.versions.node.split('.')[0], '22', 'Run this probe with the bundled Node 22 runtime');
  assertNoCheckoutDatabase();

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), PROFILE_PREFIX));
  let port;
  let pluginDir;
  let childEnv;
  let pluginSourceBefore;
  let pluginFixtureBefore;
  let sourceFilesBefore;
  let sourceManifestBefore;
  try {
    port = await reserveLoopbackPort();
    pluginDir = prepareDocsPluginFixture(ROOT, profileDir, ALLOWED_PLUGIN_IDS);
    childEnv = createDocsCaptureChildEnvironment({
      profileDir,
      port,
      pluginDir,
      allowedPluginIds: ALLOWED_PLUGIN_IDS
    });
    const validatedIds = docsCapturePolicy.validateDocumentationCaptureEnvironment(childEnv);
    assert.deepEqual([...validatedIds], ALLOWED_PLUGIN_IDS);

    pluginSourceBefore = inventoryDirectory(path.join(APP_ROOT, 'plugins', 'clarityhud'));
    pluginFixtureBefore = inventoryDirectory(path.join(pluginDir, 'clarityhud'));
    assert.deepEqual(pluginFixtureBefore, pluginSourceBefore, 'The isolated ClarityHUD copy differs from source');
    sourceFilesBefore = SOURCE_PATHS.map(sourceRecord);
    sourceManifestBefore = {
      original: JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'plugins', 'clarityhud', 'plugin.json'), 'utf8')),
      staged: JSON.parse(fs.readFileSync(path.join(pluginDir, 'clarityhud', 'plugin.json'), 'utf8'))
    };
  } catch (error) {
    const tempRoot = fs.realpathSync(os.tmpdir());
    const resolvedProfile = fs.realpathSync(profileDir);
    if (path.dirname(resolvedProfile) === tempRoot && path.basename(resolvedProfile).startsWith(PROFILE_PREFIX)) {
      fs.rmSync(resolvedProfile, { recursive: true, force: true });
    }
    throw error;
  }

  const sourcePluginRoot = path.join(APP_ROOT, 'plugins', 'clarityhud');
  const fixturePluginRoot = path.join(pluginDir, 'clarityhud');

  const evidence = {
    schemaVersion: 1,
    scope: 'actual maintained app/server.js + only ClarityHUD, one temporary profile and loopback listener; ClarityHUD requests are GET-only; one POST to the owned app loopback /api/shutdown is used only for lifecycle cleanup; synthetic/empty state only; no providers, product profiles, audio or OBS',
    startedAtUtc: new Date().toISOString(),
    allowedPluginIds: ALLOWED_PLUGIN_IDS,
    childEnvironmentKeys: Object.keys(childEnv).sort(),
    childEnvironmentCredentialValueCount: Object.entries(childEnv).filter(([key, value]) => /key|token|secret|password|credential/i.test(key) && String(value || '').length > 0).length,
    port,
    sourceFiles: sourceFilesBefore,
    pluginManifest: {
      originalId: sourceManifestBefore.original.id,
      originalEnabled: sourceManifestBefore.original.enabled,
      stagedId: sourceManifestBefore.staged.id,
      stagedEnabled: sourceManifestBefore.staged.enabled,
      enabledWasChanged: sourceManifestBefore.original.enabled !== sourceManifestBefore.staged.enabled,
      onlyEnabledFieldDiffers: (() => {
        const normalized = { ...sourceManifestBefore.staged, enabled: sourceManifestBefore.original.enabled };
        return JSON.stringify(normalized) === JSON.stringify(sourceManifestBefore.original);
      })()
    },
    pluginSourceInventory: pluginSourceBefore,
    pluginFixtureInventory: pluginFixtureBefore,
    sourcePrePost: {},
    api: [],
    browser: null,
    cleanup: null,
    result: 'RUNNING'
  };

  let child;
  let childClosePromise = Promise.resolve(null);
  let browser;
  let browserContext;
  let page;
  let output = '';
  let logCapturePath = null;
  let spawnError = null;
  let pageErrors = [];
  let consoleErrors = [];
  let requestFailures = [];
  let externalRequestsBlocked = [];
  let websocketOrigins = [];
  let screenshotPath = null;
  let evidenceDir = path.join(ROOT, 'docs', 'coordination', 'evidence', 'actual-clarityhud-backend-20261007');
  if (fs.existsSync(evidenceDir)) evidenceDir += `-${crypto.randomUUID().slice(0, 8)}`;
  fs.mkdirSync(evidenceDir, { recursive: true });

  try {
    assertNoCheckoutDatabase();
    const portOrigin = `http://127.0.0.1:${port}`;
    child = spawn(path.join(ROOT, 'runtime', 'node', 'node.exe'), [path.join(APP_ROOT, 'server.js')], {
      cwd: APP_ROOT,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    childClosePromise = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    evidence.pid = child.pid;
    child.stdout.on('data', data => { output = `${output}${data}`.slice(-250000); });
    child.stderr.on('data', data => { output = `${output}${data}`.slice(-250000); });
    child.once('error', error => { spawnError = error; });

    const fetchJson = async (route, expectedMethod = 'GET') => {
      const response = await fetch(`${portOrigin}${route}`, {
        method: expectedMethod,
        headers: { Origin: portOrigin },
        signal: AbortSignal.timeout(5000)
      });
      const bodyBytes = Buffer.from(await response.arrayBuffer());
      let body;
      try { body = JSON.parse(bodyBytes.toString('utf8')); } catch { throw new Error(`${route} did not return JSON`); }
      const record = {
        route,
        method: expectedMethod,
        status: response.status,
        responseBytes: bodyBytes.length,
        responseSha256: sha256(bodyBytes),
        success: body.success === true,
        dock: body.dock || null
      };
      if (route === '/api/clarityhud/settings/full') {
        record.settingKeys = Object.keys(body.settings || {}).sort();
      }
      if (route === '/api/clarityhud/state/full') {
        const events = body.events || {};
        record.eventKeys = Object.keys(events).sort();
        record.eventCounts = Object.fromEntries(Object.entries(events).map(([key, value]) => [key, Array.isArray(value) ? value.length : null]));
        assert(Object.values(events).every(value => Array.isArray(value) && value.length === 0), 'Fresh isolated state unexpectedly contains events');
      }
      evidence.api.push(record);
      assert.equal(response.status, 200, `${route} must return HTTP 200`);
      assert.equal(body.success, true, `${route} response must report success`);
      return { response, body, bytes: bodyBytes };
    };

    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Isolated app exited before readiness (exit=${child.exitCode}, signal=${child.signalCode})`);
      }
      try {
        const response = await fetch(`${portOrigin}/overlay/clarity/full?lang=de`, { signal: AbortSignal.timeout(500) });
        ready = response.status === 200;
      } catch (_error) {
        // The isolated child may still be starting; no other URL is probed.
      }
      if (ready) break;
      await delay(250);
    }
    assert(ready, 'Actual /overlay/clarity/full route did not become ready on loopback');

    const originResponse = await fetch(`${portOrigin}/overlay/clarity/full?lang=de`, { signal: AbortSignal.timeout(5000) });
    const servedHtml = Buffer.from(await originResponse.arrayBuffer());
    const originalHtmlPath = path.join(sourcePluginRoot, 'overlays', 'full.html');
    const originalHtml = fs.readFileSync(originalHtmlPath);
    assert.equal(originResponse.status, 200);
    assert(servedHtml.equals(originalHtml), 'Actual route HTML response differs from the original ClarityHUD page');
    evidence.servedHtml = {
      route: '/overlay/clarity/full?lang=de',
      status: originResponse.status,
      bytes: servedHtml.length,
      sha256: sha256(servedHtml),
      sourcePath: 'app/plugins/clarityhud/overlays/full.html',
      sourceSha256: sha256(originalHtml),
      byteExactMatch: true
    };

    const settings = await fetchJson('/api/clarityhud/settings/full');
    assert(settings.body.settings && typeof settings.body.settings === 'object');
    const state = await fetchJson('/api/clarityhud/state/full');
    assert(state.body.events && typeof state.body.events === 'object');

    const { chromium } = require('../../app/node_modules/playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-background-networking', '--disable-component-update', '--disable-sync']
    });
    evidence.browser = {
      version: browser.version(),
      playwrightVersion: require('../../app/node_modules/playwright/package.json').version,
      viewport: { width: 1280, height: 720 },
      url: `${portOrigin}/overlay/clarity/full?lang=de`,
      pageErrors,
      consoleErrors,
      requestFailures,
      externalRequestsBlocked,
      websocketOrigins
    };
    browserContext = await browser.newContext({ viewport: evidence.browser.viewport });
    page = await browserContext.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('requestfailed', request => requestFailures.push({
      origin: (() => { try { return new URL(request.url()).origin; } catch { return 'invalid'; } })(),
      resourceType: request.resourceType(),
      errorText: request.failure()?.errorText || null
    }));
    page.on('websocket', websocket => {
      let websocketOrigin = 'invalid';
      try { const url = new URL(websocket.url()); websocketOrigin = `${url.protocol}//${url.host}`; } catch (_error) {}
      websocketOrigins.push(websocketOrigin);
    });
    await page.route('**/*', route => {
      let requestOrigin = '';
      try { requestOrigin = new URL(route.request().url()).origin; } catch (_error) {}
      if (requestOrigin === portOrigin) return route.continue();
      let host = 'invalid';
      try { host = new URL(route.request().url()).host; } catch (_error) {}
      externalRequestsBlocked.push({ host, resourceType: route.request().resourceType() });
      return route.abort('blockedbyclient');
    });

    const pageResponse = await page.goto(evidence.browser.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    assert.equal(pageResponse.status(), 200, 'Chromium must receive the original full overlay');
    await page.locator('#overlay-container.layout-singleStream .feed-container').waitFor({ state: 'attached', timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('#overlay-container .loading') === null, null, { timeout: 15000 });
    await page.waitForTimeout(600);

    const renderedHtml = Buffer.from(await pageResponse.body());
    assert(renderedHtml.equals(originalHtml), 'Chromium response differs from the original ClarityHUD page');
    const eventItemCount = await page.locator('#overlay-container .event-item').count();
    assert.equal(eventItemCount, 0, 'Empty isolated backend state must render without event items');
    assert.deepEqual(pageErrors, [], 'Original renderer produced page errors');
    assert.deepEqual(consoleErrors, [], 'Original renderer produced console errors');
    assert.deepEqual(requestFailures.filter(failure => failure.origin === portOrigin), [], 'Same-origin renderer request failed');
    assert(websocketOrigins.every(origin => origin === portOrigin.replace('http:', 'ws:')), 'Renderer attempted a non-loopback WebSocket');

    fs.mkdirSync(evidenceDir, { recursive: true });
    screenshotPath = path.join(evidenceDir, 'full-de-empty-state.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    evidence.browser = {
      ...evidence.browser,
      title: await page.title(),
      localeAttribute: await page.locator('html').getAttribute('lang'),
      layoutClass: await page.locator('#overlay-container').getAttribute('class'),
      feedContainerCount: await page.locator('#overlay-container .feed-container').count(),
      renderedEventItems: eventItemCount,
      sameOriginHttpResponseSha256: sha256(renderedHtml),
      screenshot: {
        path: path.relative(ROOT, screenshotPath).split(path.sep).join('/'),
        bytes: fs.statSync(screenshotPath).size,
        sha256: sha256(fs.readFileSync(screenshotPath))
      },
      outcome: 'original renderer completed its actual settings/state GETs and rendered empty isolated state'
    };
    evidence.browser.externalRequestsBlocked = externalRequestsBlocked;
    evidence.browser.pageErrors = pageErrors;
    evidence.browser.consoleErrors = consoleErrors;
    evidence.browser.requestFailures = requestFailures;
    evidence.browser.websocketOrigins = websocketOrigins;
    evidence.result = 'PASS';
  } catch (error) {
    evidence.result = 'FAIL';
    evidence.error = error.message;
  } finally {
    try { if (browserContext) await browserContext.close(); } catch (_error) {}
    try { if (browser) await browser.close(); } catch (_error) {}
    evidence.browserClosed = !browser || !browser.isConnected();

    let shutdownResponse = null;
    let shutdownRequestError = null;
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
          method: 'POST',
          headers: { Origin: `http://127.0.0.1:${port}` },
          signal: AbortSignal.timeout(3000)
        });
        shutdownResponse = { status: response.status, body: await response.json(), targetPid: child.pid, targetPort: port };
        for (let attempt = 0; attempt < 40 && child.exitCode === null && child.signalCode === null; attempt += 1) await delay(250);
      } catch (error) {
        shutdownRequestError = error.message;
      }
    }
    evidence.shutdownResponse = shutdownResponse;
    if (shutdownRequestError) evidence.shutdownRequestError = shutdownRequestError;

    let forced = false;
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      for (let attempt = 0; attempt < 40 && child.exitCode === null && child.signalCode === null; attempt += 1) await delay(250);
      if (child.exitCode === null && child.signalCode === null) {
        forced = true;
        child.kill('SIGKILL');
      }
      for (let attempt = 0; attempt < 40 && child.exitCode === null && child.signalCode === null; attempt += 1) await delay(250);
    }

    const childCloseResult = await Promise.race([
      childClosePromise,
      delay(2000).then(() => null)
    ]);
    evidence.childCloseEvent = childCloseResult;

    const portClosed = await isPortClosed(port);
    const databasePath = path.join(profileDir, 'ltth.app', 'user_configs', 'default.db');
    let databaseReopenCheck = { path: path.relative(ROOT, databasePath).split(path.sep).join('/'), passed: false };
    try {
      const BetterSqlite3 = require('../../app/node_modules/better-sqlite3');
      const database = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true });
      const quickCheck = database.pragma('quick_check');
      database.close();
      databaseReopenCheck = {
        path: path.relative(ROOT, databasePath).split(path.sep).join('/'),
        passed: Array.isArray(quickCheck) && quickCheck.length === 1 && quickCheck[0].quick_check === 'ok',
        quickCheck
      };
    } catch (error) {
      databaseReopenCheck.error = error.message;
    }
    logCapturePath = path.join(evidenceDir, 'backend-output.txt');
    fs.writeFileSync(logCapturePath, output, 'utf8');
    evidence.backendOutput = {
      path: path.relative(ROOT, logCapturePath).split(path.sep).join('/'),
      bytes: Buffer.byteLength(output),
      sha256: sha256(Buffer.from(output)),
      includesDatabaseClosed: /(?:database closed|Database.*closed)/i.test(output),
      includesClarityhudLoaded: /ClarityHUD plugin loaded successfully/i.test(output),
      includesClarityhudUnloaded: /Unloaded plugin: clarityhud/i.test(output),
      includesServerClosed: /Server closed/i.test(output),
      includesShutdownTimeout: /Graceful shutdown timed out/i.test(output),
      stdioClosedBeforeLogSnapshot: childCloseResult !== null,
      tail: output.slice(-12000)
    };
    evidence.databaseCloseVerification = {
      sourceCall: 'app/server.js calls db.close() before server.close()',
      sourceCallsDatabaseManagerClose: /db\.close\(\);[\s\S]{0,160}server\.close\(/.test(fs.readFileSync(path.join(APP_ROOT, 'server.js'), 'utf8')) && /this\.db\.close\(\)/.test(fs.readFileSync(path.join(APP_ROOT, 'modules', 'database.js'), 'utf8')),
      directDatabaseCloseSuccessLogExists: /database closed|Database.*closed/i.test(output),
      sourceFileSha256: sourceRecord('app/server.js').sha256,
      processExitCode: child?.exitCode ?? null,
      reopenAndQuickCheckAfterExit: databaseReopenCheck
    };
    const pluginSourceAfter = inventoryDirectory(sourcePluginRoot);
    const pluginFixtureAfter = inventoryDirectory(fixturePluginRoot);
    const sourceFilesAfter = SOURCE_PATHS.map(sourceRecord);
    const sourceChanges = sourceFilesBefore.map((before, index) => ({
      path: before.path,
      beforeSha256: before.sha256,
      afterSha256: sourceFilesAfter[index].sha256,
      stable: before.sha256 === sourceFilesAfter[index].sha256
    }));
    evidence.sourcePrePost = {
      allPinnedSourcesStable: sourceChanges.every(record => record.stable),
      sourceChanges,
      clarityhudSourceStable: pluginSourceBefore.sha256 === pluginSourceAfter.sha256,
      clarityhudFixtureStable: pluginFixtureBefore.sha256 === pluginFixtureAfter.sha256,
      fixtureStillMatchesSource: JSON.stringify(pluginSourceAfter) === JSON.stringify(pluginFixtureAfter),
      originalManifestUnchanged: JSON.stringify(sourceManifestBefore.original) === JSON.stringify(JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'plugins', 'clarityhud', 'plugin.json'), 'utf8'))),
      stagedManifestUnchanged: JSON.stringify(sourceManifestBefore.staged) === JSON.stringify(JSON.parse(fs.readFileSync(path.join(fixturePluginRoot, 'plugin.json'), 'utf8')))
    };

    // Preserve diagnostics before deleting the temporary profile that held
    // the isolated database. The evidence directory is unique per run.
    const diagnosticPath = path.join(evidenceDir, 'pre-cleanup-diagnostics.json');
    fs.writeFileSync(diagnosticPath, `${JSON.stringify({
      result: evidence.result,
      error: evidence.error || null,
      api: evidence.api,
      browser: evidence.browser,
      shutdownResponse: evidence.shutdownResponse || null,
      shutdownRequestError: evidence.shutdownRequestError || null,
      backendOutput: evidence.backendOutput,
      sourcePrePost: evidence.sourcePrePost,
      pluginManifest: evidence.pluginManifest,
      databaseCloseVerification: evidence.databaseCloseVerification,
      profilePath: profileDir
    }, null, 2)}\n`, 'utf8');
    evidence.preCleanupDiagnosticsPath = path.relative(ROOT, diagnosticPath).split(path.sep).join('/');

    let profileRemoved = false;
    try {
      const tempRoot = fs.realpathSync(os.tmpdir());
      const resolvedProfile = fs.realpathSync(profileDir);
      assert.equal(path.dirname(resolvedProfile), tempRoot, 'Refusing to remove a path outside the system temp root');
      assert(path.basename(resolvedProfile).startsWith(PROFILE_PREFIX), 'Refusing to remove a path without the probe-owned prefix');
      fs.rmSync(resolvedProfile, { recursive: true, force: true });
      profileRemoved = !fs.existsSync(resolvedProfile);
    } catch (error) {
      evidence.cleanupError = error.message;
    }

    const gracefulAppShutdownProven = shutdownResponse?.status === 200 && shutdownResponse.body?.success === true && shutdownResponse.targetPid === child?.pid && shutdownResponse.targetPort === port && child?.exitCode === 0 && child?.signalCode === null && childCloseResult !== null && evidence.databaseCloseVerification.sourceCallsDatabaseManagerClose && evidence.databaseCloseVerification.reopenAndQuickCheckAfterExit.passed && evidence.backendOutput.includesClarityhudLoaded && evidence.backendOutput.includesClarityhudUnloaded && evidence.backendOutput.includesServerClosed && !evidence.backendOutput.includesShutdownTimeout && !forced;
    evidence.cleanup = {
      pid: child?.pid || null,
      childExitCode: child?.exitCode ?? null,
      childSignalCode: child?.signalCode || null,
      terminalConfirmed: !child?.pid || child.exitCode !== null || child.signalCode !== null,
      forced,
      portClosed,
      browserClosed: evidence.browserClosed,
      tempProfileRemoved: profileRemoved,
      gracefulAppShutdownProven
    };
    if (!portClosed || !evidence.cleanup.terminalConfirmed || forced || !profileRemoved || !evidence.sourcePrePost.allPinnedSourcesStable || !evidence.sourcePrePost.clarityhudSourceStable || !evidence.sourcePrePost.clarityhudFixtureStable || !evidence.sourcePrePost.fixtureStillMatchesSource || !evidence.sourcePrePost.originalManifestUnchanged || !evidence.sourcePrePost.stagedManifestUnchanged || !gracefulAppShutdownProven) {
      evidence.result = 'FAIL';
      evidence.error = evidence.error || 'Cleanup or source stability was not confirmed';
    }

    evidence.result = evidence.result === 'PASS' && !evidence.error ? 'PASS' : 'FAIL';

    evidence.finishedAtUtc = new Date().toISOString();
    if (fs.existsSync(evidenceDir)) {
      const receiptPath = path.join(evidenceDir, 'receipt.json');
      evidence.receiptPath = path.relative(ROOT, receiptPath).split(path.sep).join('/');
      fs.writeFileSync(receiptPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
      process.stdout.write(`${JSON.stringify({ result: evidence.result, error: evidence.error, pid: child?.pid || null, port, receipt: evidence.receiptPath, screenshot: evidence.browser?.screenshot?.path || null, cleanup: evidence.cleanup })}\n`);
    } else {
      process.stderr.write(`${JSON.stringify({ result: evidence.result, error: evidence.error, pid: child?.pid || null, port, cleanup: evidence.cleanup })}\n`);
    }
  }

  if (evidence.result !== 'PASS') process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
