'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const { prepareDocsPluginFixture, isPathInside } = require('../../lib/docs-capture-plugin-fixture');
const { createDocsCaptureChildEnvironment } = require('../../lib/docs-capture-child-env');
const {
  createPluginDependencyResolverSource,
  writePluginDependencyResolver
} = require('../../lib/docs-capture-plugin-dependency-resolver');
const { createViewerXpReadinessGate } = require('../lib/viewer-xp-readiness-gate');
const { isOwnedServer, stopOwnedChild } = require('../lib/quick-tunnel-cleanup');

const RUNNER_PATH = path.resolve(__dirname, '../viewer-xp-quick-tunnel-session.js');
const ROOT = path.resolve(__dirname, '../../..');
const PLUGIN_ID = 'milestone-leaderboard';
const PROBE_PACKAGE = 'ltth-fixture-scoped-resolution-probe';
const ROUTE_REGISTRATION_SNAPSHOT_FILES = [
  'app/server.js',
  'app/package.json',
  'app/package-lock.json',
  'app/modules/config-path-manager.js',
  'app/modules/database.js',
  'app/modules/docs-capture-policy.js',
  'app/modules/logger.js',
  'app/modules/network-manager.js',
  'app/modules/plugin-loader.js',
  'app/modules/plugin-release-policy.js',
  'app/modules/user-profiles.js',
  'app/config/plugin-release-policy.json',
  'app/plugins/milestone-leaderboard/plugin.json',
  'app/plugins/milestone-leaderboard/main.js',
  'app/plugins/milestone-leaderboard/vendor/gift-milestone/main.js',
  'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/main.js',
  'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl.js',
  'scripts/lib/docs-capture-plugin-fixture.js',
  'scripts/lib/docs-capture-child-env.js',
  'scripts/lib/docs-capture-plugin-dependency-resolver.js',
  'scripts/obs-pilot/viewer-xp-quick-tunnel-session.js',
  'scripts/obs-pilot/lib/quick-tunnel-cleanup.js',
  'scripts/obs-pilot/lib/viewer-xp-readiness-gate.js',
  'scripts/obs-pilot/test/viewer-xp-quick-tunnel-resolver.test.js'
];

function captureRouteRegistrationSnapshot() {
  const files = Object.fromEntries(ROUTE_REGISTRATION_SNAPSHOT_FILES.map(relativePath => {
    const source = fs.readFileSync(path.join(ROOT, relativePath));
    const digest = crypto.createHash('sha256').update(source).digest('hex');
    return [relativePath, digest];
  }));
  const entries = Object.entries(files).map(([relativePath, digest]) => `${relativePath}\0${digest}`);
  return {
    fileCount: entries.length,
    sha256: crypto.createHash('sha256').update(entries.join('\n')).digest('hex'),
    files
  };
}

async function reserveEphemeralLoopbackPort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

async function requestLocalJson(url, { method = 'GET', timeoutMs = 5000 } = {}) {
  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(timeoutMs)
  });
  let json = null;
  try { json = await response.json(); } catch (_) {}
  return { status: response.status, json };
}

async function findOwnedLocalServer(child, preferredPort) {
  for (let offset = 0; offset <= 50 && preferredPort + offset <= 65535; offset += 1) {
    const port = preferredPort + offset;
    const origin = `http://127.0.0.1:${port}`;
    try {
      const health = await requestLocalJson(`${origin}/api/health`, { timeoutMs: 500 });
      if (health.status === 200 && health.json?.status === 'ok' && health.json.pid === child.pid) {
        return { port, origin };
      }
    } catch (_) {}
  }
  return null;
}

async function waitForOwnedLocalServer(child, preferredPort, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`APP_CHILD_EXITED_BEFORE_HEALTH_${child.exitCode ?? child.signalCode}`);
    }
    const ownedServer = await findOwnedLocalServer(child, preferredPort);
    if (ownedServer) return ownedServer;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('OWNED_TEMP_APP_HEALTH_TIMEOUT');
}

async function isLoopbackPortClosed(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', error => resolve(error.code === 'ECONNREFUSED'));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

function assertWritableTempDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const probe = path.join(directory, `.route-smoke-write-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  const renamed = `${probe}.renamed`;
  try {
    fs.writeFileSync(probe, 'synthetic route smoke');
    fs.renameSync(probe, renamed);
  } finally {
    for (const candidate of [probe, renamed]) {
      if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
    }
  }
}

test('fixture preload adds app dependencies only for exact fixture descendants', () => {
  const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-resolver-contract-'));
  const fixtureRoot = path.join(tempProfile, 'docs-capture-app', 'plugins');
  const appNodeModules = path.join(tempProfile, 'app-node-modules');
  const packageDir = path.join(appNodeModules, PROBE_PACKAGE);
  const pluginEntry = path.join(fixtureRoot, 'milestone-leaderboard', 'main.js');
  const outsideEntry = path.join(tempProfile, 'unrelated-plugin', 'main.js');
  const prefixSiblingRoot = `${fixtureRoot}-sibling`;
  const prefixSiblingEntry = path.join(prefixSiblingRoot, 'milestone-leaderboard', 'main.js');
  const originalNodeModulePaths = Module._nodeModulePaths;

  try {
    fs.mkdirSync(path.dirname(pluginEntry), { recursive: true });
    fs.mkdirSync(path.dirname(outsideEntry), { recursive: true });
    fs.mkdirSync(path.dirname(prefixSiblingEntry), { recursive: true });
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: PROBE_PACKAGE, main: 'index.js' }));
    fs.writeFileSync(path.join(packageDir, 'index.js'), "module.exports = 'fixture-dependency';\n");

    assert.throws(() => Module.createRequire(pluginEntry).resolve(PROBE_PACKAGE), { code: 'MODULE_NOT_FOUND' });
    const resolverPath = writePluginDependencyResolver({
      profileDir: tempProfile,
      fixtureRoot,
      appNodeModules
    });
    require(resolverPath);

    const resolved = Module.createRequire(pluginEntry).resolve(PROBE_PACKAGE);
    assert.equal(resolved, path.join(packageDir, 'index.js'));
    assert.throws(() => Module.createRequire(outsideEntry).resolve(PROBE_PACKAGE), { code: 'MODULE_NOT_FOUND' });
    assert.throws(() => Module.createRequire(prefixSiblingEntry).resolve(PROBE_PACKAGE), { code: 'MODULE_NOT_FOUND' });
  } finally {
    Module._nodeModulePaths = originalNodeModulePaths;
    const tempRoot = path.resolve(os.tmpdir());
    const profilePath = path.resolve(tempProfile);
    const relative = path.relative(tempRoot, profilePath);
    assert.notEqual(relative, '');
    assert.notEqual(relative, '..');
    assert.equal(relative.startsWith(`..${path.sep}`), false);
    fs.rmSync(profilePath, { recursive: true, force: true });
  }
});

test('resolver preload stays in the isolated child and resolves installed multer without NODE_PATH', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-resolver-child-'));
  const profileDir = path.join(tempRoot, 'capture-profile');
  const fixtureRoot = path.join(profileDir, 'docs-capture-app', 'plugins');
  const appNodeModules = path.resolve(__dirname, '../../../app/node_modules');
  const fixtureEntry = path.join(fixtureRoot, 'milestone-leaderboard', 'main.js');
  const outsideEntry = path.join(tempRoot, 'outside', 'main.js');
  const parentNodeModulePaths = Module._nodeModulePaths;
  const parentEnv = {
    hasNodePath: Object.prototype.hasOwnProperty.call(process.env, 'NODE_PATH'),
    nodePath: process.env.NODE_PATH,
    hasNodeOptions: Object.prototype.hasOwnProperty.call(process.env, 'NODE_OPTIONS'),
    nodeOptions: process.env.NODE_OPTIONS
  };

  try {
    fs.mkdirSync(path.dirname(fixtureEntry), { recursive: true });
    fs.mkdirSync(path.dirname(outsideEntry), { recursive: true });

    const inheritedEnv = {
      ...process.env,
      NODE_PATH: path.join(tempRoot, 'parent-only-node-path'),
      NODE_OPTIONS: '--require parent-only-preload-must-not-run'
    };
    const childEnv = createDocsCaptureChildEnvironment({
      profileDir,
      port: 60789,
      allowedPluginIds: [],
      inheritedEnv,
      tempDir: os.tmpdir()
    });
    assert.equal(Object.prototype.hasOwnProperty.call(childEnv, 'NODE_PATH'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(childEnv, 'NODE_OPTIONS'), false);
    assert.equal(inheritedEnv.NODE_PATH, path.join(tempRoot, 'parent-only-node-path'));
    assert.equal(inheritedEnv.NODE_OPTIONS, '--require parent-only-preload-must-not-run');
    assert.equal(fs.existsSync(path.join(appNodeModules, 'multer', 'package.json')), true);

    const resolverPath = writePluginDependencyResolver({ profileDir, fixtureRoot, appNodeModules });
    const probe = `
      const Module = require('module');
      const options = ${JSON.stringify({ fixtureEntry, outsideEntry, appNodeModules })};
      const fixtureRequire = Module.createRequire(options.fixtureEntry);
      let outsideError = null;
      try { Module.createRequire(options.outsideEntry).resolve('multer'); }
      catch (error) { outsideError = error.code; }
      process.stdout.write(JSON.stringify({
        fixtureMulter: fixtureRequire.resolve('multer'),
        fixtureSearchPaths: fixtureRequire.resolve.paths('multer'),
        outsideError,
        outsideHasAppNodeModules: Module.createRequire(options.outsideEntry).resolve.paths('multer').includes(options.appNodeModules),
        globalPathsHaveAppNodeModules: Module.globalPaths.includes(options.appNodeModules),
        nodePath: process.env.NODE_PATH || null
      }));
    `;

    const expectedMulter = Module.createRequire(path.join(__dirname, '../../../app/server.js')).resolve('multer');
    const childRuns = [
      { label: 'missing NODE_PATH', env: { ...childEnv } },
      { label: 'invalid NODE_PATH', env: { ...childEnv, NODE_PATH: path.join(tempRoot, 'missing-node-path') } }
    ];
    for (const run of childRuns) {
      const child = spawnSync(process.execPath, ['--require', resolverPath, '-e', probe], {
        cwd: tempRoot,
        env: run.env,
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true
      });
      assert.equal(child.error, undefined, `${run.label}: ${child.error?.message || ''}`);
      assert.equal(child.status, 0, `${run.label}: ${child.stderr}`);
      const result = JSON.parse(child.stdout);
      assert.equal(result.fixtureMulter, expectedMulter, `${run.label}: installed multer should resolve from app/node_modules`);
      assert.equal(result.fixtureSearchPaths.includes(appNodeModules), true);
      assert.equal(result.outsideError, 'MODULE_NOT_FOUND');
      assert.equal(result.outsideHasAppNodeModules, false);
      assert.equal(result.globalPathsHaveAppNodeModules, false);
      assert.equal(result.nodePath, run.env.NODE_PATH || null);
    }

    assert.equal(Module._nodeModulePaths, parentNodeModulePaths);
    assert.equal(Object.prototype.hasOwnProperty.call(process.env, 'NODE_PATH'), parentEnv.hasNodePath);
    assert.equal(process.env.NODE_PATH, parentEnv.nodePath);
    assert.equal(Object.prototype.hasOwnProperty.call(process.env, 'NODE_OPTIONS'), parentEnv.hasNodeOptions);
    assert.equal(process.env.NODE_OPTIONS, parentEnv.nodeOptions);
    assert.equal(Module.createRequire(path.join(__dirname, '../../../app/server.js')).resolve('multer'), expectedMulter);

    assert.throws(() => createPluginDependencyResolverSource({ fixtureRoot, appNodeModules: undefined }), {
      name: 'TypeError',
      message: 'appNodeModules must be an absolute path'
    });
    assert.throws(() => createPluginDependencyResolverSource({ fixtureRoot, appNodeModules: 'relative/node_modules' }), {
      name: 'TypeError',
      message: 'appNodeModules must be an absolute path'
    });
  } finally {
    const root = path.resolve(os.tmpdir());
    const profile = path.resolve(tempRoot);
    const relative = path.relative(root, profile);
    assert.notEqual(relative, '');
    assert.notEqual(relative, '..');
    assert.equal(relative.startsWith(`..${path.sep}`), false);
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test('runner delegates fail-closed shutdown and clipboard cleanup to the synthetic-tested helpers', () => {
  const runner = fs.readFileSync(RUNNER_PATH, 'utf8');
  assert.match(runner, /require\('\.\/lib\/quick-tunnel-cleanup'\)/);
  assert.match(runner, /stopOwnedChild\(\{ child: appChild, origin, requestJson \}\)/);
  assert.match(runner, /report\.appChildExitConfirmed !== true/);
  assert.match(runner, /clipboardMayHaveChanged && report\.clipboardRestored !== true/);
  assert.match(runner, /await isOwnedServer\(\{ child: appChild, origin, requestJson \}\)/);
  assert.match(runner, /files\.add\(RUNNER_CLEANUP_REL\)/);
  assert.match(runner, /files\.add\(RUNNER_READINESS_REL\)/);
  assert.match(runner, /files\.add\(RUNNER_READINESS_TEST_REL\)/);
  assert.match(runner, /return findOwnedServer\(appChild\.pid, preferredPort\)/);
  assert.match(runner, /isPathInside\(profile, row\.Path\)/);
});

test('runner requires PID-bound health and both Viewer-XP routes before any tunnel ensure', () => {
  const runner = fs.readFileSync(RUNNER_PATH, 'utf8');
  const healthGate = runner.indexOf('report.appPidVerified = true;');
  const statsRequest = runner.indexOf('const statsReady = await requestJson(');
  const leaderboardRequest = runner.indexOf('const leaderboardReady = await requestJson(');
  const firstTunnel = runner.indexOf('const firstStart = await readinessGate.ensure(');
  const browserStart = runner.indexOf('report.browserStarted = true;');
  const markReady = runner.indexOf('readinessGate.markReady({');
  const gatedEnsures = [...runner.matchAll(/readinessGate\.ensure\(\(\) => requestJson\(/g)];
  const ensures = [...runner.matchAll(/body:\s*\{\s*overlayURL:\s*`([^`]+)`\s*\}/g)]
    .map(match => match[1]);

  assert.ok(healthGate >= 0 && healthGate < statsRequest);
  assert.ok(statsRequest < leaderboardRequest && leaderboardRequest < markReady);
  assert.ok(markReady < browserStart && markReady < firstTunnel);
  assert.ok(browserStart < firstTunnel);
  assert.equal(gatedEnsures.length, 2);
  assert.equal(ensures.length, 2);
  for (const overlayURL of ensures) {
    assert.match(overlayURL, /\/overlay\/viewer-xp\/xp-bar\?username=\$\{encodeURIComponent\(USERNAME\)\}$/);
  }
});

test('synthetic readiness gate makes ensure call count zero until PID health and both routes pass', async t => {
  const invalidReadiness = [
    ['unverified PID', { appPidVerified: false, statsStatus: 200, leaderboardStatus: 200 }, 'APP_PID_NOT_VERIFIED'],
    ['stats 404', { appPidVerified: true, statsStatus: 404, leaderboardStatus: 200 }, 'VIEWER_XP_ROUTE_NOT_READY'],
    ['stats 503', { appPidVerified: true, statsStatus: 503, leaderboardStatus: 200 }, 'VIEWER_XP_ROUTE_NOT_READY'],
    ['leaderboard 404', { appPidVerified: true, statsStatus: 200, leaderboardStatus: 404 }, 'VIEWER_XP_PLUGIN_NOT_READY'],
    ['leaderboard invalid status', { appPidVerified: true, statsStatus: 200, leaderboardStatus: null }, 'VIEWER_XP_PLUGIN_NOT_READY']
  ];

  for (const [label, readiness, errorCode] of invalidReadiness) {
    await t.test(label, async () => {
      const gate = createViewerXpReadinessGate();
      let ensureCalls = 0;
      assert.throws(() => gate.markReady(readiness), { message: errorCode });
      assert.throws(() => gate.ensure(() => { ensureCalls += 1; }), {
        message: 'VIEWER_XP_READINESS_REQUIRED'
      });
      assert.equal(ensureCalls, 0);
    });
  }

  await t.test('only complete readiness permits an ensure callback', () => {
    const gate = createViewerXpReadinessGate();
    let ensureCalls = 0;
    gate.markReady({ appPidVerified: true, statsStatus: 200, leaderboardStatus: 200 });
    assert.equal(gate.ensure(() => { ensureCalls += 1; return 'synthetic-success'; }), 'synthetic-success');
    assert.equal(ensureCalls, 1);
  });
});

test('isolated Temp fixture registers both Viewer-XP readiness GET routes after resolver preload', async t => {
  assert.equal(process.versions.node, '22.14.0', 'PINNED_NODE_MISMATCH');
  const sourceSnapshotBefore = captureRouteRegistrationSnapshot();
  t.diagnostic(`source snapshot before app child: ${sourceSnapshotBefore.fileCount} files, sha256=${sourceSnapshotBefore.sha256}`);

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-viewerxp-route-registration-'));
  assert.equal(isPathInside(os.tmpdir(), profileDir), true);
  let child = null;
  let port = null;
  let portCandidate = null;
  let origin = null;
  let childExited = false;
  let portClosed = false;
  let childLogs = '';
  let operationError = null;

  try {
    const pluginDir = prepareDocsPluginFixture(ROOT, profileDir, [PLUGIN_ID]);
    assert.deepEqual(
      fs.readdirSync(pluginDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name),
      [PLUGIN_ID],
      'PLUGIN_FIXTURE_NOT_EXACT'
    );
    const resolverPath = writePluginDependencyResolver({
      profileDir,
      fixtureRoot: pluginDir,
      appNodeModules: path.join(ROOT, 'app', 'node_modules')
    });
    const appConfigDir = path.join(profileDir, 'ltth.app');
    const userConfigsDir = path.join(appConfigDir, 'user_configs');
    const expectedTempDirectories = [
      profileDir,
      path.join(profileDir, 'logs'),
      appConfigDir,
      userConfigsDir,
      path.join(appConfigDir, 'user_data'),
      path.join(appConfigDir, 'uploads'),
      path.join(appConfigDir, 'runtime-tools'),
      pluginDir
    ];
    for (const directory of expectedTempDirectories) {
      assert.equal(isPathInside(os.tmpdir(), directory), true, `TEMP_PATH_ESCAPE:${path.relative(os.tmpdir(), directory)}`);
      assertWritableTempDirectory(directory);
    }
    const legacyDatabasePaths = [
      path.join(ROOT, 'app', 'database.db'),
      path.join(ROOT, 'app', 'database.db-wal'),
      path.join(ROOT, 'app', 'database.db-shm')
    ];
    for (const legacyPath of legacyDatabasePaths) {
      assert.equal(fs.existsSync(legacyPath), false, `LEGACY_DATABASE_OUTSIDE_TEMP_PRESENT:${path.basename(legacyPath)}`);
    }
    const expectedStatePaths = {
      profileDatabase: path.join(userConfigsDir, 'default.db'),
      activeProfileMarker: path.join(userConfigsDir, '.active_profile'),
      pluginState: path.join(userConfigsDir, 'default_plugins_state.json'),
      pluginStateTemp: path.join(userConfigsDir, 'default_plugins_state.json.tmp'),
      logDirectory: path.join(profileDir, 'logs'),
      runtimeTools: path.join(appConfigDir, 'runtime-tools')
    };
    for (const filePath of Object.values(expectedStatePaths)) {
      assert.equal(isPathInside(profileDir, filePath), true, `TEMP_FILE_PATH_ESCAPE:${path.relative(profileDir, filePath)}`);
    }
    t.diagnostic(`synthetic child paths: ${JSON.stringify(Object.fromEntries(Object.entries(expectedStatePaths).map(([key, value]) => [key, path.relative(profileDir, value)])))}`);
    portCandidate = await reserveEphemeralLoopbackPort();
    const childEnv = createDocsCaptureChildEnvironment({
      profileDir,
      port: portCandidate,
      pluginDir,
      allowedPluginIds: [PLUGIN_ID]
    });
    assert.equal(childEnv.LTTH_DOCS_CAPTURE, 'true');
    assert.equal(childEnv.LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS, PLUGIN_ID);
    assert.equal(childEnv.LTTH_BIND_ADDRESS, '127.0.0.1');
    assert.equal(childEnv.LTTH_NO_BROWSER, 'true');
    assert.equal(Object.hasOwn(childEnv, 'NODE_PATH'), false);

    child = spawn(process.execPath, [
      '--require', resolverPath,
      path.join(ROOT, 'app', 'server.js')
    ], {
      cwd: path.join(ROOT, 'app'),
      env: childEnv,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', chunk => { childLogs = `${childLogs}${chunk}`.slice(-20000); });
    }
    const ownedServer = await waitForOwnedLocalServer(child, portCandidate);
    origin = ownedServer.origin;
    port = ownedServer.port;

    const stats = await requestLocalJson(`${origin}/api/viewer-xp/stats`);
    assert.equal(stats.status, 200, 'VIEWER_XP_STATS_ROUTE_NOT_REGISTERED');
    assert.equal(stats.json && typeof stats.json, 'object', 'VIEWER_XP_STATS_RESPONSE_INVALID');
    t.diagnostic('synthetic GET /api/viewer-xp/stats returned 200');

    const leaderboard = await requestLocalJson(`${origin}/api/viewer-xp/leaderboard`);
    assert.equal(leaderboard.status, 200, 'VIEWER_XP_LEADERBOARD_ROUTE_NOT_REGISTERED');
    assert.equal(Array.isArray(leaderboard.json), true, 'VIEWER_XP_LEADERBOARD_RESPONSE_INVALID');
    t.diagnostic('synthetic GET /api/viewer-xp/leaderboard returned 200');
  } catch (error) {
    operationError = error;
  } finally {
    if (child) {
      const cleanup = await stopOwnedChild({
        child,
        origin,
        requestJson: requestLocalJson
      });
      childExited = cleanup.exitConfirmed === true;
      assert.equal(childExited, true, `TEMP_APP_CHILD_NOT_STOPPED:${cleanup.errorCode || 'unknown'}`);
    } else {
      childExited = true;
    }

    if (port !== null) {
      portClosed = await isLoopbackPortClosed(port);
      assert.equal(portClosed, true, 'TEMP_APP_LOOPBACK_PORT_STILL_OPEN');
    } else {
      portClosed = childExited;
    }

    if (childExited && portClosed && fs.existsSync(profileDir)) {
      const tempRoot = path.resolve(os.tmpdir());
      const resolvedProfile = path.resolve(profileDir);
      assert.equal(isPathInside(tempRoot, resolvedProfile), true, 'PROFILE_OUTSIDE_TEMP');
      assert.equal(fs.lstatSync(resolvedProfile).isSymbolicLink(), false, 'PROFILE_IS_LINK');
      fs.rmSync(resolvedProfile, { recursive: true, force: false });
    }

    const sourceSnapshotAfter = captureRouteRegistrationSnapshot();
    const changedSourceFiles = Object.keys(sourceSnapshotBefore.files)
      .filter(relativePath => sourceSnapshotBefore.files[relativePath] !== sourceSnapshotAfter.files[relativePath]);
    t.diagnostic(`source snapshot after app child: ${sourceSnapshotAfter.fileCount} files, sha256=${sourceSnapshotAfter.sha256}`);
    if (changedSourceFiles.length) {
      t.diagnostic(`source snapshot changed files: ${changedSourceFiles.join(', ')}`);
      operationError ||= new Error('SOURCE_CHANGED_DURING_ROUTE_SMOKE');
    }
    if (operationError) {
      const relevantLogs = childLogs.split(/\r?\n/).filter(line =>
        /ConfigPathManager|Settings stored at|User configs|Database initialized|Aktives User-Profil|Loading plugins|Found \d+ logical plugins|Registered route: GET \/api\/viewer-xp|Plugin loading complete|Failed to save plugin state|Failed to ensure plugin state directory|Failed to persist loaded plugin state|Failed to require plugin entry file|Plugin initialization failed|failed to load|Server started|listening at/i.test(line)
      ).slice(-24);
      if (relevantLogs.length) t.diagnostic(`isolated child startup summary:\n${relevantLogs.join('\n')}`);
      throw operationError;
    }
  }
});
