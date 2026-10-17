'use strict';

// Isolated manual harness for profile data lifecycle and the real plugin UIs.
// Run with the bundled Node 22 from app/: ..\runtime\node\node.exe test\helpers\profile-data-lifecycle-harness.js

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');

const appDir = path.resolve(__dirname, '..', '..');
const pluginSourceDir = path.join(appDir, 'plugins');
const requestedRoot = process.env.LTTH_PROFILE_REVIEW_ROOT;
const testRoot = requestedRoot
  ? path.resolve(requestedRoot)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-profile-data-review-'));
const ownsTestRoot = !requestedRoot;
if (requestedRoot && !fs.existsSync(requestedRoot)) throw new Error(`Requested harness root does not exist: ${requestedRoot}`);
const configRoot = path.join(testRoot, 'config-root');
const isolatedPluginsDir = path.join(testRoot, 'plugins-runtime');
const profiles = ['review_active', 'review_target'];
const integrationTargetProfile = 'review_import_target';
const pluginIds = ['advanced-timer', 'schnorrbecher', 'config-import'];
const ownedServers = [];
let socketServer;
const ownedDatabases = [];
let pluginLoader;
let isCleaning = false;
let baseUrl;
let backupManager;

const logger = {
  debug() {},
  info() {},
  warn() {},
  error(...args) { process.stderr.write(`[harness error] ${args.join(' ')}\n`); }
};

function copyPluginManifest(id) {
  const source = path.join(pluginSourceDir, id);
  const destination = path.join(isolatedPluginsDir, id);
  fs.mkdirSync(destination, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'plugin.json'), 'utf8'));
  manifest.enabled = true;
  fs.writeFileSync(path.join(destination, 'plugin.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(destination, 'main.js'), `module.exports = require(${JSON.stringify(path.join(source, manifest.entry))});\n`);
  return destination;
}

function createConfigPathManager() {
  const ConfigPathManager = require(path.join(appDir, 'modules', 'config-path-manager'));
  const originalReadFileSync = fs.readFileSync;
  const bootstrapSettingsPath = path.join(appDir, '.config_path');
  fs.readFileSync = function guardedReadFileSync(filePath, ...args) {
    if (path.resolve(String(filePath)) === path.resolve(bootstrapSettingsPath)) {
      throw new Error('Harness refused to read app/.config_path');
    }
    return originalReadFileSync.call(this, filePath, ...args);
  };
  const manager = new ConfigPathManager();
  fs.readFileSync = originalReadFileSync;
  manager.customConfigPath = configRoot;
  fs.mkdirSync(configRoot, { recursive: true });
  return manager;
}

function createDatabaseManager() {
  const db = new Database(':memory:');
  ownedDatabases.push(db);
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
  const manager = {
    db,
    prepare: (...args) => db.prepare(...args),
    transaction: (...args) => db.transaction(...args),
    getConfigPathManager: () => configPathManager,
    getGift: () => null,
    getGiftCatalog: () => []
  };
  return manager;
}

const configPathManager = createConfigPathManager();
if (requestedRoot) {
  const existingProfiles = path.join(configRoot, 'user_configs');
  if (!fs.existsSync(existingProfiles)) throw new Error(`Expected isolated profile root missing: ${existingProfiles}`);
}
fs.mkdirSync(isolatedPluginsDir, { recursive: true });
if (!requestedRoot) {
  for (const profile of profiles) {
    fs.mkdirSync(path.join(configPathManager.getUserConfigsDir(), profile), { recursive: true });
    fs.writeFileSync(path.join(configPathManager.getUserConfigsDir(), `${profile}.marker`), 'isolated fixture only');
  }
  fs.mkdirSync(isolatedPluginsDir, { recursive: true });
  for (const id of pluginIds) copyPluginManifest(id);
}
if (process.argv.includes('--integration')) {
  const UserProfileManager = require(path.join(appDir, 'modules', 'user-profiles'));
  const profileManager = new UserProfileManager(configPathManager);
  assert.strictEqual(profileManager.profileExists(integrationTargetProfile), false, 'Integration target must be new and empty');
  profileManager.createProfile(integrationTargetProfile);
  process.stdout.write(`IMPORT_TARGET_PROFILE=${integrationTargetProfile}\n`);
}
const pluginPaths = Object.fromEntries(pluginIds.map(id => [id, path.join(isolatedPluginsDir, id)]));
const databaseManager = createDatabaseManager();
if (process.argv.includes('--integration')) {
  databaseManager.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('review.integration.global', 'source-global-value');
  databaseManager.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('plugin:advanced-timer:review.integration', JSON.stringify({ source: true }));
}

// The shared legacy Advanced Timer database and frame are wholly synthetic.
const TimerDatabase = require(path.join(pluginSourceDir, 'advanced-timer', 'backend', 'database'));
const legacyTimerApi = {
  getConfigPathManager: () => configPathManager,
  getPluginDataDir: () => configPathManager.getPluginDataDir('advanced-timer'),
  getActiveProfile: () => null,
  getPluginDir: () => pluginPaths['advanced-timer'],
  log() {}
};
const legacyTimerDb = new TimerDatabase(legacyTimerApi);
const sharedTimerDir = configPathManager.getPluginDataDir('advanced-timer');
if (!requestedRoot) {
  legacyTimerDb.initialize();
  legacyTimerDb.db.prepare(`
    INSERT INTO advanced_timers(id,name,mode,initial_duration,current_value,target_value,state,created_at,updated_at,config)
    VALUES(?,?,?,?,?,?,?,?,?,?)
  `).run('review-legacy-timer', 'Review Legacy Timer', 'countdown', 120, 120, 0, 'stopped', 1, 1, '{}');
  legacyTimerDb.db.close();
  fs.mkdirSync(path.join(sharedTimerDir, 'frames'), { recursive: true });
  fs.writeFileSync(path.join(sharedTimerDir, 'frames', 'review-frame.png'), Buffer.from('synthetic-frame-only'));
}

// Synthetic shared Schnorrbecher files exercise the explicit import preview.
const sharedJarDir = configPathManager.getPluginDataDir('schnorrbecher');
if (!requestedRoot) {
  fs.mkdirSync(sharedJarDir, { recursive: true });
  fs.writeFileSync(path.join(sharedJarDir, 'coin-jar-config.json'), JSON.stringify({ jarLabel: 'Review Legacy Jar', persistenceMode: 'session' }));
  fs.writeFileSync(path.join(sharedJarDir, 'coin-jar-state.json'), JSON.stringify({
    totalCoinValue: 73,
    visualCoinCount: 2,
    lastProcessedEventIds: ['synthetic-review-session-event']
  }));
}

const expressApp = express();
expressApp.use(express.json({ limit: '2mb' }));
expressApp.use(express.urlencoded({ extended: true }));
expressApp.use('/js', express.static(path.join(appDir, 'public', 'js')));
expressApp.use('/css', express.static(path.join(appDir, 'public', 'css')));
expressApp.use('/plugins/schnorrbecher', express.static(path.join(pluginSourceDir, 'schnorrbecher')));
expressApp.use('/plugins/advanced-timer', express.static(path.join(pluginSourceDir, 'advanced-timer')));
expressApp.use('/plugins/config-import', express.static(path.join(pluginSourceDir, 'config-import')));
// Socket.IO serves its actual client bundle from the attached local test server.
expressApp.get('/api/profiles', (_req, res) => res.json({
  success: true,
  activeProfile: 'review_active',
  profiles: profiles.map(username => ({ username, isActive: username === 'review_active' }))
}));
expressApp.get('/api/i18n/locales', (_req, res) => res.json({ locales: ['en', 'de', 'es', 'fr'], defaultLocale: 'de' }));

// The real i18n module reads plugin locale directories from the normal source tree.
const oldConsoleLog = console.log;
let i18n;
try {
  console.log = () => {};
  i18n = require(path.join(appDir, 'modules', 'i18n'));
} finally {
  console.log = oldConsoleLog;
}
expressApp.get('/api/i18n/translations', (req, res) => {
  const locale = String(req.query.locale || 'de');
  res.json(i18n.getAllTranslations(locale));
});
expressApp.get('/api/i18n/translations/:locale', (req, res) => {
  res.json(i18n.getAllTranslations(req.params.locale));
});
// PluginLoader mounts its real dedicated plugin router on the Express app.
const PluginLoader = require(path.join(appDir, 'modules', 'plugin-loader'));
pluginLoader = new PluginLoader(isolatedPluginsDir, expressApp, null, databaseManager, logger, configPathManager, 'review_active');
assert.strictEqual(path.resolve(configPathManager.getConfigDir()), path.resolve(configRoot), 'Config root must be isolated before plugin loader construction');
assert.strictEqual(path.resolve(pluginLoader.configPathManager.getConfigDir()), path.resolve(configRoot), 'Plugin loader must be bound to isolated root');
assert.ok(pluginLoader.stateFile.startsWith(configRoot), 'Plugin state file must be under isolated root');
pluginLoader.state = Object.fromEntries(pluginIds.map(id => [id, { enabled: true }]));
pluginLoader.saveState = () => true;
pluginLoader.getPluginEnabledPreference = manifest => pluginLoader.state[manifest.id]?.enabled === true;
pluginLoader.plugins = new Map();
expressApp.get('/advanced-timer/ui', (_req, res) => res.sendFile(path.join(pluginPaths['advanced-timer'], 'ui.html')));
expressApp.get('/schnorrbecher/ui', (_req, res) => res.sendFile(path.join(pluginPaths.schnorrbecher, 'ui.html')));
expressApp.get('/config-import/ui', (_req, res) => res.sendFile(path.join(pluginPaths['config-import'], 'ui.html')));
const BackupManager = require(path.join(appDir, 'modules', 'backup-manager'));
backupManager = new BackupManager({
  db: databaseManager,
  configPathManager,
  pluginLoader,
  logger,
  appVersion: 'isolated-review',
  activeProfile: 'review_active'
});
pluginLoader.setBackupManager(backupManager);

function hashTree(root) {
  if (!fs.existsSync(root)) return null;
  const result = {};
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(root, fullPath).split(path.sep).join('/');
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) {
        const data = fs.readFileSync(fullPath);
        result[relativePath] = { bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
      }
    }
  };
  visit(root);
  return result;
}

if (process.argv.includes('--integration')) {
  expressApp.get('/__review__/integration-state', (_req, res) => {
    const data = {};
    for (const pluginId of ['advanced-timer', 'schnorrbecher']) {
      data[pluginId] = {
        legacy: hashTree(configPathManager.getPluginDataDir(pluginId)),
        sourceProfile: hashTree(configPathManager.getPluginDataDir(pluginId, { profileId: 'review_active' })),
        targetProfile: hashTree(configPathManager.getPluginDataDir(pluginId, { profileId: integrationTargetProfile }))
      };
    }
    const targetDbPath = path.join(configPathManager.getUserConfigsDir(), `${integrationTargetProfile}.db`);
    const targetDb = fs.readFileSync(targetDbPath);
    const targetTimerPath = path.join(configPathManager.getPluginDataDir('advanced-timer', { profileId: integrationTargetProfile }), 'timers.db');
    let targetTimerRows = null;
    if (fs.existsSync(targetTimerPath)) {
      const targetTimerDb = new Database(targetTimerPath, { readonly: true, fileMustExist: true });
      try { targetTimerRows = targetTimerDb.prepare('SELECT id, name FROM advanced_timers ORDER BY id').all(); }
      finally { targetTimerDb.close(); }
    }
    const targetJarDir = configPathManager.getPluginDataDir('schnorrbecher', { profileId: integrationTargetProfile });
    const targetJarConfigPath = path.join(targetJarDir, 'coin-jar-config.json');
    const targetJarStatePath = path.join(targetJarDir, 'coin-jar-state.json');
    res.json({
      settings: databaseManager.db.prepare('SELECT key, value FROM settings ORDER BY key').all(),
      targetProfileDb: { bytes: targetDb.length, sha256: crypto.createHash('sha256').update(targetDb).digest('hex') },
      targetTimerRows,
      targetJarConfig: fs.existsSync(targetJarConfigPath) ? JSON.parse(fs.readFileSync(targetJarConfigPath, 'utf8')) : null,
      targetJarStateExists: fs.existsSync(targetJarStatePath),
      data
    });
  });
}

expressApp.get('/__review__/backup.zip', async (_req, res, next) => {
  try {
    const { stream } = await backupManager.export({
      includeGlobalSettings: true,
      includePluginSettings: true,
      includePluginData: true,
      includeUserConfigs: false,
      includeUploads: false,
      includeUserData: false,
      profileScopedDataPlugins: ['advanced-timer', 'schnorrbecher'],
      includeSchnorrbecherPersistentState: false
    }, 'review_active');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="isolated-profile-review.zip"');
    stream.on('error', next);
    stream.pipe(res);
  } catch (error) { next(error); }
});

function assertPluginPaths() {
  assert.strictEqual(path.resolve(pluginLoader.configPathManager.getConfigDir()), path.resolve(configRoot));
  for (const id of ['advanced-timer', 'schnorrbecher']) {
    const loaded = pluginLoader.plugins.get(id);
    assert.ok(loaded, `${id} should be loaded`);
    assert.strictEqual(loaded.api.getActiveProfile(), 'review_active');
    const scoped = loaded.api.getPluginDataDir({ profileScoped: true });
    assert.ok(scoped.startsWith(configRoot), `${id} data path must stay under isolated root: ${scoped}`);
    assert.ok(scoped.includes(path.join('profiles', 'review_active')));
  }
}

async function startPlugins() {
  for (const id of pluginIds) {
    const loaded = await pluginLoader.loadPlugin(pluginPaths[id]);
    assert.ok(loaded, `Plugin load failed: ${id}`);
  }
  assertPluginPaths();
}

async function exerciseLifecycle() {
  await startPlugins();
  const timer = pluginLoader.plugins.get('advanced-timer').instance;
  const jar = pluginLoader.plugins.get('schnorrbecher').instance;
  assert.strictEqual(timer.db.getAllTimers().length, 0, 'Active profile starts empty');
  assert.strictEqual(jar.getStatus().state.totalCoinValue, 0, 'Active Schnorrbecher session starts empty');

  const preview = await fetchJson(`${baseUrl}/api/advanced-timer/legacy-data/preview`);
  assert.strictEqual(preview.rows.advanced_timers, 1);
  assert.deepStrictEqual(preview.frames, ['review-frame.png']);
  assert.strictEqual(preview.targetProfile, 'review_active');
  assert.strictEqual(preview.canImport, true);
  const imported = await fetchJson(`${baseUrl}/api/advanced-timer/legacy-data/import`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true })
  });
  assert.strictEqual(imported.success, true);
  assert.strictEqual(fs.readFileSync(path.join(timer.api.getPluginDataDir({ profileScoped: true }), 'frames', 'review-frame.png'), 'utf8'), 'synthetic-frame-only');

  const jarPreview = await fetchJson(`${baseUrl}/api/coin-jar/legacy-data/preview`);
  assert.strictEqual(jarPreview.config.canImport, true);
  assert.strictEqual(jarPreview.state.available, true);
  const jarResult = await fetchJson(`${baseUrl}/api/coin-jar/legacy-data/import`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: true, includeConfig: true, includePersistentState: false })
  });
  assert.strictEqual(jarResult.success, true);
  assert.deepStrictEqual(jarResult.imported, ['config']);
  assert.strictEqual(jar.getStatus().state.totalCoinValue, 0, 'Session state must remain isolated from the synthetic shared state');
  assert.strictEqual(jar.getStatus().config.jarLabel, 'Review Legacy Jar');

  assert.strictEqual(await pluginLoader.unloadPlugin('advanced-timer'), true);
  assert.strictEqual(await pluginLoader.unloadPlugin('schnorrbecher'), true);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${options?.method || 'GET'} ${url}: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function run() {
  let keepServer = false;
  let completedLifecycle = false;
  try {
    const server = http.createServer(expressApp);
    ownedServers.push(server);
    socketServer = new SocketIOServer(server, { serveClient: true, cors: { origin: false } });
    pluginLoader.io = socketServer;
    const reviewStatePath = path.join(configRoot, 'user_configs', 'review_active_plugins_state.json');
    fs.writeFileSync(reviewStatePath, JSON.stringify(Object.fromEntries(pluginIds.map(id => [id, { enabled: true }])), null, 2));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
    process.stdout.write(`HARNESS_ROOT=${testRoot}\nHARNESS_CONFIG_ROOT=${configRoot}\nHARNESS_URL=${baseUrl}\n`);

    if (process.argv.includes('--reopen')) {
      await startPlugins();
      const timer = pluginLoader.plugins.get('advanced-timer').instance;
      const jar = pluginLoader.plugins.get('schnorrbecher').instance;
      assert.strictEqual(timer.db.getAllTimers().length, 1);
      assert.strictEqual(timer.db.getAllTimers()[0].id, 'review-legacy-timer');
      assert.strictEqual(fs.readFileSync(path.join(timer.api.getPluginDataDir({ profileScoped: true }), 'frames', 'review-frame.png'), 'utf8'), 'synthetic-frame-only');
      assert.strictEqual(jar.getStatus().config.jarLabel, 'Review Legacy Jar');
      assert.strictEqual(jar.getStatus().state.totalCoinValue, 0);
      process.stdout.write('REOPEN_PASS: timer, frame, Schnorrbecher config persisted; session state remains empty\n');
      completedLifecycle = true;
    } else if (process.argv.includes('--serve')) {
      await startPlugins();
      process.stdout.write('HARNESS_READY; open /advanced-timer/ui?lang=de, /schnorrbecher/ui?lang=de, /config-import/ui?tab=import&lang=de\n');
      keepServer = true;
    } else {
      await exerciseLifecycle();
      completedLifecycle = true;
    }
  } finally {
    if (!keepServer) await cleanup();
  }
  if (completedLifecycle && !process.argv.includes('--reopen')) {
    process.stdout.write(`LIFECYCLE_PHASE1_PASS\nREOPEN_COMMAND=$env:LTTH_PROFILE_REVIEW_ROOT='${testRoot}'; ..\runtime\node\node.exe app\test\helpers\profile-data-lifecycle-harness.js --reopen\n`);
  }
}

async function cleanup() {
  if (isCleaning) return;
  isCleaning = true;
  const errors = [];
  for (const id of [...pluginIds].reverse()) {
    if (pluginLoader?.plugins.has(id)) {
      try {
        if (!await pluginLoader.unloadPlugin(id)) errors.push(`Plugin unload returned false: ${id}`);
      } catch (error) { errors.push(`Plugin unload ${id}: ${error.stack || error}`); }
    }
  }
  if (socketServer) {
    try { await new Promise(resolve => socketServer.close(resolve)); } catch (error) { errors.push(`Socket.IO close: ${error.message}`); }
  }
  for (const server of ownedServers) {
    if (server.listening) {
      try { await new Promise(resolve => server.close(resolve)); } catch (error) { errors.push(`HTTP close: ${error.message}`); }
    }
  }
  for (const db of ownedDatabases) {
    try { if (db.open) db.close(); } catch (error) { errors.push(`SQLite close: ${error.message}`); }
  }
  try { if (ownsTestRoot && process.argv.includes('--cleanup')) fs.rmSync(testRoot, { recursive: true, force: true }); }
  catch (error) { errors.push(`Fixture cleanup ${testRoot}: ${error.message}`); }
  if (errors.length) process.stderr.write(`HARNESS_CLEANUP_ERRORS=${JSON.stringify(errors)}\n`);
  else process.stdout.write('HARNESS_CLEANUP=complete\n');
}

process.once('SIGINT', () => cleanup().then(() => process.exit(0)));
process.once('SIGTERM', () => cleanup().then(() => process.exit(0)));
process.once('uncaughtException', error => {
  process.stderr.write(`HARNESS_UNCAUGHT=${error.stack || error}\n`);
  cleanup().finally(() => process.exit(1));
});
process.once('unhandledRejection', error => {
  process.stderr.write(`HARNESS_REJECTION=${error?.stack || error}\n`);
  cleanup().finally(() => process.exit(1));
});

run().catch(error => {
  process.stderr.write(`HARNESS_FAILURE=${error.stack || error}\n`);
  process.exitCode = 1;
});


