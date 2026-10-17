'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');
const express = require('express');
const request = require('supertest');
const Database = require('better-sqlite3');

const PluginLoader = require('../modules/plugin-loader');
const { PluginStore } = require('../modules/plugin-store');
const { createPluginReleasePolicy } = require('../modules/plugin-release-policy');
const { setupPluginRoutes } = require('../routes/plugin-routes');
const { createManifest } = require('../modules/backup/manifest');
const { parseBackupZip, performImport, cleanupTempDir } = require('../modules/backup/importer');
const { exportBackup } = require('../modules/backup/exporter');

describe('removed Chatango plugin backend', () => {
  test('backup export-import preserves a Chatango data script without installing or executing it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-retired-chatango-backup-export-'));
    const pluginDataRoot = path.join(root, 'plugins-data');
    const chatangoDataDir = path.join(pluginDataRoot, 'chatango', 'data');
    const appPluginDir = path.join(root, 'app', 'plugins', 'chatango');
    const archivePath = path.join(root, 'synthetic-backup.zip');
    const importedPluginDataDir = path.join(root, 'imported-plugin-data', 'chatango');
    const runtimePluginsDir = path.join(root, 'runtime', 'app', 'plugins');
    const scriptContents = 'global.__retiredChatangoDataScriptExecuted = true;';
    let archiveClosed;
    let parsed;
    fs.mkdirSync(chatangoDataDir, { recursive: true });
    fs.mkdirSync(appPluginDir, { recursive: true });
    fs.writeFileSync(path.join(chatangoDataDir, 'legacy-settings.json'), JSON.stringify({ room: 'synthetic-room' }));
    fs.writeFileSync(path.join(chatangoDataDir, 'legacy-script.js'), scriptContents);
    fs.writeFileSync(path.join(appPluginDir, 'plugin.json'), JSON.stringify({ id: 'chatango', entry: 'main.js' }));
    fs.writeFileSync(path.join(appPluginDir, 'main.js'), 'module.exports = class SyntheticRetiredPlugin {};');

    const db = new Database(':memory:');
    const importedDb = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    importedDb.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    db.prepare('INSERT INTO settings(key, value) VALUES (?, ?)').run(
      'plugin:chatango:config', JSON.stringify({ room: 'synthetic-room', preserved: true })
    );

    try {
      await exportBackup({
        db,
        configPathManager: {
          getPluginsDir: () => pluginDataRoot,
          getPluginDataDir: id => path.join(pluginDataRoot, id, 'data')
        },
        pluginLoader: null,
        archiveFactory: () => {
          const archive = archiver('zip');
          const output = fs.createWriteStream(archivePath);
          archive.pipe(output);
          archiveClosed = new Promise((resolve, reject) => {
            output.once('close', resolve);
            output.once('error', reject);
            archive.once('error', reject);
          });
          return archive;
        }
      }, {
        includeGlobalSettings: false,
        includePluginSettings: true,
        includePluginData: true,
        includeUserConfigs: false,
        includeUploads: false,
        includeUserData: false
      });

      await archiveClosed;
      parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
      expect(parsed.errors).toEqual([]);
      expect(parsed.integrity.status).toBe('verified');
      expect(parsed.pluginSettings.chatango)
        .toEqual({ config: { room: 'synthetic-room', preserved: true } });
      expect(parsed.dataFiles.chatango.map(file => file.relPath).sort()).toEqual([
        'legacy-script.js',
        'legacy-settings.json'
      ]);
      expect(fs.existsSync(path.join(parsed.tmpDir, 'plugins', 'chatango', 'plugin.json'))).toBe(false);
      expect(fs.existsSync(path.join(parsed.tmpDir, 'plugins', 'chatango', 'main.js'))).toBe(false);

      const importResult = await performImport(parsed, {
        db: importedDb,
        configPathManager: {
          getPluginDataDir: id => path.join(root, 'imported-plugin-data', id),
          getUserConfigsDir: () => path.join(root, 'user_configs'),
          getUserDataDir: () => path.join(root, 'user_data'),
          getUploadsDir: () => path.join(root, 'uploads')
        }
      }, {
        mode: 'merge',
        includeGlobalSettings: false,
        includePluginSettings: true,
        includePluginData: true,
        includeUserConfigs: false,
        includeUploads: false,
        includeUserData: false
      });

      expect(importResult.success).toBe(true);
      expect(fs.readFileSync(path.join(importedPluginDataDir, 'legacy-script.js'), 'utf8')).toBe(scriptContents);
      expect(fs.readFileSync(path.join(importedPluginDataDir, 'legacy-settings.json'), 'utf8'))
        .toBe(JSON.stringify({ room: 'synthetic-room' }));
      expect(fs.existsSync(path.join(runtimePluginsDir, 'chatango'))).toBe(false);

      const loader = new PluginLoader(
        runtimePluginsDir,
        express(),
        { emit: jest.fn(), sockets: { sockets: new Map() } },
        importedDb,
        { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
        { getUserConfigsDir: () => path.join(root, 'user_configs'), getPluginDataDir: id => path.join(root, 'imported-plugin-data', id) }
      );
      expect(await loader.loadAllPlugins()).toEqual([]);
      expect(loader.plugins.size).toBe(0);
      expect(global.__retiredChatangoDataScriptExecuted).toBeUndefined();
    } finally {
      if (parsed?.tmpDir) cleanupTempDir(parsed.tmpDir);
      if (db.open) db.close();
      if (importedDb.open) importedDb.close();
      delete global.__retiredChatangoDataScriptExecuted;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('malicious legacy ZIP paths cannot escape temp extraction or overwrite retired app code', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-retired-chatango-zip-paths-'));
    const extractionRoot = path.join(root, 'isolated-extraction');
    const protectedAppPath = path.join(root, 'app', 'plugins', 'chatango', 'main.js');
    const runtimePluginsDir = path.join(root, 'runtime', 'app', 'plugins');
    const pluginDataDir = path.join(root, 'imported-plugin-data', 'chatango');
    const protectedBytes = Buffer.from('SYNTHETIC_APP_CODE_MUST_REMAIN_UNCHANGED');
    const maliciousPaths = [
      'plugins/chatango/../../app/plugins/chatango/main.js',
      'plugins/chatango/../../../app/plugins/chatango/main.js',
      '/app/plugins/chatango/main.js',
      'C:/app/plugins/chatango/main.js',
      'plugins/chatango/data/C:../app/plugins/chatango/main.js',
      'plugins/chatango/data/C:/app/plugins/chatango/main.js',
      'plugins//chatango/data/./../../../../app/plugins/chatango/main.js',
      'plugins/chatango/data/%252e%252e/%252e%252e/app/plugins/chatango/main.js'
    ];
    fs.mkdirSync(extractionRoot, { recursive: true });
    fs.mkdirSync(path.dirname(protectedAppPath), { recursive: true });
    fs.writeFileSync(protectedAppPath, protectedBytes);
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const originalCreateWriteStream = fs.createWriteStream;
    const originalMkdir = fs.promises.mkdir;
    const isWithin = (base, target) => {
      const relative = path.relative(path.resolve(base), path.resolve(target));
      return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
    };
    const outsideExtractionWrites = [];
    const tempDirSpy = jest.spyOn(os, 'tmpdir').mockReturnValue(extractionRoot);
    let createWriteStreamSpy;
    let mkdirSpy;

    try {
      for (const [index, maliciousPath] of maliciousPaths.entries()) {
        const archivePath = path.join(root, `malicious-${index}.zip`);
        const placeholder = 'Z'.repeat(Buffer.byteLength(maliciousPath));
        const manifest = createManifest({
          appVersion: '1.2.0',
          profile: 'synthetic',
          options: { includePluginData: true },
          plugins: [{ id: 'chatango', name: 'Legacy Chatango' }]
        });
        manifest.formatVersion = '0.9.0';
        const archive = archiver('zip');
        const output = fs.createWriteStream(archivePath);
        archive.pipe(output);
        archive.append(JSON.stringify(manifest), { name: 'manifest.json' });
        archive.append('global.__retiredChatangoMaliciousPathExecuted = true;', { name: placeholder });
        await new Promise((resolve, reject) => {
          output.once('close', resolve);
          output.once('error', reject);
          archive.once('error', reject);
          archive.finalize();
        });

        const zipBytes = fs.readFileSync(archivePath);
        const from = Buffer.from(placeholder);
        const to = Buffer.from(maliciousPath);
        expect(to.length).toBe(from.length);
        let searchFrom = 0;
        let replacements = 0;
        while ((searchFrom = zipBytes.indexOf(from, searchFrom)) >= 0) {
          to.copy(zipBytes, searchFrom);
          searchFrom += to.length;
          replacements += 1;
        }
        expect(replacements).toBeGreaterThanOrEqual(2);
        fs.writeFileSync(archivePath, zipBytes);

        createWriteStreamSpy = jest.spyOn(fs, 'createWriteStream').mockImplementation((target, ...args) => {
          if (!isWithin(extractionRoot, String(target))) outsideExtractionWrites.push(String(target));
          if (!isWithin(extractionRoot, String(target))) throw new Error('Blocked write outside synthetic extraction root');
          return originalCreateWriteStream.call(fs, target, ...args);
        });
        mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockImplementation((target, ...args) => {
          if (!isWithin(extractionRoot, String(target))) outsideExtractionWrites.push(String(target));
          if (!isWithin(extractionRoot, String(target))) throw new Error('Blocked directory creation outside synthetic extraction root');
          return originalMkdir.call(fs.promises, target, ...args);
        });

        let parsed;
        try {
          parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
        } finally {
          createWriteStreamSpy.mockRestore();
          mkdirSpy.mockRestore();
          createWriteStreamSpy = null;
          mkdirSpy = null;
        }

        expect(outsideExtractionWrites).toEqual([]);
        expect(fs.readFileSync(protectedAppPath)).toEqual(protectedBytes);
        expect(isWithin(extractionRoot, parsed.tmpDir || extractionRoot)).toBe(true);
        if (parsed.errors.length === 0) {
          const importResult = await performImport(parsed, {
            db,
            configPathManager: {
              getPluginDataDir: id => path.join(root, 'imported-plugin-data', id),
              getUserConfigsDir: () => path.join(root, 'user_configs'),
              getUserDataDir: () => path.join(root, 'user_data'),
              getUploadsDir: () => path.join(root, 'uploads')
            }
          }, {
            mode: 'merge',
            includeGlobalSettings: false,
            includePluginSettings: false,
            includePluginData: true,
            includeUserConfigs: false,
            includeUploads: false,
            includeUserData: false
          });
          expect(importResult.success).toBe(true);
        }
        expect(fs.readFileSync(protectedAppPath)).toEqual(protectedBytes);
        expect(fs.existsSync(path.join(runtimePluginsDir, 'chatango'))).toBe(false);
        expect(global.__retiredChatangoMaliciousPathExecuted).toBeUndefined();
        if (parsed.tmpDir) cleanupTempDir(parsed.tmpDir);
      }

      const loader = new PluginLoader(
        runtimePluginsDir,
        express(),
        { emit: jest.fn(), sockets: { sockets: new Map() } },
        db,
        { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
        { getUserConfigsDir: () => path.join(root, 'user_configs'), getPluginDataDir: id => path.join(root, 'imported-plugin-data', id) }
      );
      expect(await loader.loadAllPlugins()).toEqual([]);
      expect(loader.plugins.size).toBe(0);
    } finally {
      if (createWriteStreamSpy) createWriteStreamSpy.mockRestore();
      if (mkdirSpy) mkdirSpy.mockRestore();
      tempDirSpy.mockRestore();
      if (db.open) db.close();
      delete global.__retiredChatangoMaliciousPathExecuted;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('startup preserves persisted Chatango state while loading no plugin and exposing no runtime UI', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-retired-chatango-startup-'));
    const pluginsDir = path.join(root, 'plugins');
    const configDir = path.join(root, 'user_configs');
    const pluginDir = path.join(pluginsDir, 'chatango');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
      id: 'chatango', name: 'Legacy fixture', entry: 'main.js', enabled: true
    }));
    fs.writeFileSync(path.join(pluginDir, 'main.js'), 'global.__retiredChatangoStarted = true; module.exports = class Legacy {};');
    fs.writeFileSync(path.join(pluginDir, 'ui.html'), '<h1>legacy fixture</h1>');
    const savedBytes = Buffer.from('{\n  "chatango": {"enabled": true, "config": {"room": "fixture-preserve"}, "custom": 17}\n}\n');
    const stateFile = path.join(configDir, 'plugins_state.json');
    fs.writeFileSync(stateFile, savedBytes);
    fs.writeFileSync(path.join(root, 'plugin-release-policy.json'), JSON.stringify({
      schemaVersion: 1, closedBeta: [], aliases: {}, publicAssetPathOwners: {}
    }));
    fs.writeFileSync(path.join(root, 'distribution-mode.json'), JSON.stringify({ channel: 'developer' }));

    const logger = { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() };
    const app = express();
    const loader = new PluginLoader(
      pluginsDir,
      app,
      { emit: jest.fn(), sockets: { sockets: new Map() } },
      {},
      logger,
      {
        getUserConfigsDir: () => configDir,
        getPluginDataDir: id => path.join(root, 'plugin-data', id)
      }
    );
    const saveStateSpy = jest.spyOn(loader, 'saveState');
    const runtimePolicy = createPluginReleasePolicy({
      appRoot: root,
      policyPath: path.join(root, 'plugin-release-policy.json'),
      modePath: path.join(root, 'distribution-mode.json')
    });

    try {
      const loaded = await loader.loadAllPlugins();
      expect(loaded).toEqual([]);
      expect(loader.plugins.size).toBe(0);
      expect(loader.state).toEqual({
        chatango: { enabled: true, config: { room: 'fixture-preserve' }, custom: 17 }
      });
      expect(fs.readFileSync(stateFile)).toEqual(savedBytes);
      expect(saveStateSpy).not.toHaveBeenCalled();
      expect(global.__retiredChatangoStarted).toBeUndefined();

      setupPluginRoutes(app, loader, (_req, _res, next) => next(), (_req, _res, next) => next(), logger);
      app.use(runtimePolicy.createRequestGuard({ pluginsDir }));
      app.use('/plugins', express.static(pluginsDir));
      app.use((_req, res) => res.status(404).end());

      const registry = await request(app).get('/api/plugins').expect(200);
      expect(registry.body.plugins.map(plugin => plugin.id)).not.toContain('chatango');
      await request(app).get('/api/plugins/chatango').expect(404);
      await request(app).post('/api/plugins/chatango/enable').expect(410);
      await request(app).get('/plugins/chatango/ui.html').expect(404);
      expect(loader.plugins.size).toBe(0);
      expect(loader.state.chatango.config.room).toBe('fixture-preserve');
      expect(fs.readFileSync(stateFile)).toEqual(savedBytes);
      expect(saveStateSpy).not.toHaveBeenCalled();
    } finally {
      delete global.__retiredChatangoStarted;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('legacy backup import preserves Chatango settings and activation preference without restoring the retired plugin', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-retired-chatango-backup-import-'));
    const configDir = path.join(root, 'user_configs');
    const pluginsDir = path.join(root, 'plugins');
    const pluginDir = path.join(pluginsDir, 'chatango');
    const archivePath = path.join(root, 'legacy-backup.zip');
    const activeDbPath = path.join(configDir, 'default.db');
    const pluginSettings = { config: { room: 'legacy-room-fixture' }, migratedFlag: 'keep-this-value' };
    const profileState = { chatango: { enabled: true, legacyMarker: 'keep-enabled-state' } };
    const profileStateBytes = Buffer.from(JSON.stringify(profileState));
    let parsed;
    let db;

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(activeDbPath, 'SYNTHETIC_ACTIVE_PROFILE_DATABASE');
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
      id: 'chatango', name: 'Legacy backup fixture', entry: 'main.js', enabled: true
    }));
    fs.writeFileSync(path.join(pluginDir, 'main.js'), 'global.__retiredChatangoBackupStarted = true; module.exports = class Legacy {};');
    fs.writeFileSync(path.join(pluginDir, 'ui.html'), '<h1>legacy backup fixture</h1>');

    const manifest = createManifest({
      appVersion: '1.2.0',
      profile: 'default',
      options: { includePluginSettings: true, includeUserConfigs: true },
      plugins: [{ id: 'chatango', name: 'Legacy Chatango' }]
    });
    manifest.formatVersion = '0.9.0'; // Legacy pre-checksum backup format.
    const archive = archiver('zip');
    const output = fs.createWriteStream(archivePath);
    archive.pipe(output);
    archive.append(JSON.stringify(manifest), { name: 'manifest.json' });
    archive.append(JSON.stringify(pluginSettings), { name: 'plugins/chatango/settings.json' });
    archive.append('SYNTHETIC_IMPORTED_PROFILE_DATABASE', { name: 'user_configs/default.db' });
    archive.append(profileStateBytes, { name: 'user_configs/default_plugins_state.json' });
    archive.append('default', { name: 'user_configs/.active_profile' });
    const archiveClosed = new Promise((resolve, reject) => {
      output.once('close', resolve);
      output.once('error', reject);
      archive.once('error', reject);
    });
    archive.finalize();

    try {
      await archiveClosed;
      db = new Database(':memory:');
      db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
      db.dbPath = activeDbPath;

      parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
      expect(parsed.errors).toEqual([]);
      expect(parsed.integrity.status).toBe('unverified-legacy');
      expect(parsed.pluginSettings.chatango).toEqual(pluginSettings);
      expect(parsed.userConfigsFiles.map(file => file.relPath).sort()).toEqual([
        '.active_profile',
        'default.db',
        'default_plugins_state.json'
      ]);

      const result = await performImport(parsed, {
        db,
        configPathManager: {
          getUserConfigsDir: () => configDir,
          getUserDataDir: () => path.join(root, 'user_data'),
          getUploadsDir: () => path.join(root, 'uploads'),
          getPluginDataDir: id => path.join(root, 'plugin-data', id)
        }
      }, {
        mode: 'replace',
        includeGlobalSettings: false,
        includePluginSettings: true,
        includePluginData: false,
        includeUserConfigs: true,
        includeUploads: false,
        includeUserData: false,
        confirmProfileReplacement: true
      });

      expect(result.success).toBe(true);
      const storedSettings = db.prepare('SELECT value FROM settings WHERE key = ?').get('plugin:chatango:config');
      const storedLegacyMarker = db.prepare('SELECT value FROM settings WHERE key = ?').get('plugin:chatango:migratedFlag');
      expect(storedSettings.value).toBe(JSON.stringify(pluginSettings.config));
      expect(storedLegacyMarker.value).toBe(JSON.stringify(pluginSettings.migratedFlag));
      expect(JSON.parse(storedSettings.value)).toEqual(pluginSettings.config);
      expect(JSON.parse(storedLegacyMarker.value)).toBe(pluginSettings.migratedFlag);

      const importedProfile = fs.readFileSync(path.join(configDir, '.active_profile'), 'utf8');
      expect(importedProfile).toMatch(/^default-restored-/);
      const stateFile = path.join(configDir, `${importedProfile}_plugins_state.json`);
      expect(JSON.parse(fs.readFileSync(stateFile, 'utf8'))).toEqual(profileState);
      expect(fs.readFileSync(stateFile)).toEqual(profileStateBytes);
      expect(fs.readFileSync(path.join(configDir, `${importedProfile}.db`), 'utf8')).toBe('SYNTHETIC_IMPORTED_PROFILE_DATABASE');
      expect(fs.readFileSync(activeDbPath, 'utf8')).toBe('SYNTHETIC_ACTIVE_PROFILE_DATABASE');

      fs.writeFileSync(path.join(root, 'plugin-release-policy.json'), JSON.stringify({
        schemaVersion: 1, closedBeta: [], aliases: {}, publicAssetPathOwners: {}
      }));
      fs.writeFileSync(path.join(root, 'distribution-mode.json'), JSON.stringify({ channel: 'developer' }));
      const runtimePolicy = createPluginReleasePolicy({
        appRoot: root,
        policyPath: path.join(root, 'plugin-release-policy.json'),
        modePath: path.join(root, 'distribution-mode.json')
      });
      const logger = { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() };
      const app = express();
      const loader = new PluginLoader(
        pluginsDir,
        app,
        { emit: jest.fn(), sockets: { sockets: new Map() } },
        db,
        logger,
        {
          getUserConfigsDir: () => configDir,
          getPluginDataDir: id => path.join(root, 'plugin-data', id)
        },
        importedProfile
      );
      const saveStateSpy = jest.spyOn(loader, 'saveState');
      const loaded = await loader.loadAllPlugins();

      expect(loaded).toEqual([]);
      expect(loader.plugins.size).toBe(0);
      expect(loader.state.chatango).toEqual(profileState.chatango);
      expect(loader.isPluginEnabledFromDisk('chatango')).toBe(false);
      expect(loader.getAllPlugins().map(plugin => plugin.id)).not.toContain('chatango');
      expect(global.__retiredChatangoBackupStarted).toBeUndefined();
      expect(saveStateSpy).not.toHaveBeenCalled();

      const passThrough = (_req, _res, next) => next();
      const pluginStore = { findPlugin: jest.fn(), installPlugin: jest.fn(), getInstalledPlugins: () => new Map() };
      setupPluginRoutes(app, loader, passThrough, passThrough, logger, null, null, {
        pluginStore,
        storeAuth: (req, _res, next) => {
          req.storeAccount = { license: { active: true } };
          next();
        },
        freshStoreAuth: passThrough
      });
      app.use(runtimePolicy.createRequestGuard({ pluginsDir }));
      app.use('/plugins', express.static(pluginsDir));
      app.use((_req, res) => res.status(404).end());

      const registry = await request(app).get('/api/plugins').expect(200);
      expect(registry.body.plugins.map(plugin => plugin.id)).not.toContain('chatango');
      await request(app).get('/api/plugins/chatango').expect(404);
      await request(app).post('/api/plugins/chatango/enable').expect(410);
      const installResponse = await request(app).post('/api/plugin-store/official/chatango/install').expect(410);
      expect(installResponse.body.code).toBe('PLUGIN_RETIRED');
      expect(pluginStore.findPlugin).not.toHaveBeenCalled();
      expect(pluginStore.installPlugin).not.toHaveBeenCalled();
      await request(app).get('/plugins/chatango/ui.html').expect(404);
      expect(db.prepare('SELECT value FROM settings WHERE key = ?').get('plugin:chatango:config').value)
        .toBe(JSON.stringify(pluginSettings.config));
      expect(db.prepare('SELECT value FROM settings WHERE key = ?').get('plugin:chatango:migratedFlag').value)
        .toBe(JSON.stringify(pluginSettings.migratedFlag));
      expect(fs.readFileSync(stateFile)).toEqual(profileStateBytes);
      expect(loader.state.chatango).toEqual(profileState.chatango);
      expect(JSON.parse(fs.readFileSync(stateFile, 'utf8'))).toEqual(profileState);
      expect(saveStateSpy).not.toHaveBeenCalled();
    } finally {
      if (parsed?.tmpDir) cleanupTempDir(parsed.tmpDir);
      if (db) db.close();
      delete global.__retiredChatangoBackupStarted;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('legacy backup plugin executables remain archive-only and never enter the runtime plugin folder', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-retired-chatango-backup-code-'));
    const archivePath = path.join(root, 'legacy-backup.zip');
    const runtimePluginsDir = path.join(root, 'runtime-plugins');
    const pluginDataDir = path.join(root, 'plugin-data', 'chatango');
    const pluginSettings = { config: { room: 'synthetic-room' } };
    let parsed;
    let db;

    const manifest = createManifest({
      appVersion: '1.2.0',
      profile: 'default',
      options: { includePluginSettings: true, includePluginData: true },
      plugins: [{ id: 'chatango', name: 'Legacy Chatango' }]
    });
    manifest.formatVersion = '0.9.0';
    const archive = archiver('zip');
    const output = fs.createWriteStream(archivePath);
    archive.pipe(output);
    archive.append(JSON.stringify(manifest), { name: 'manifest.json' });
    archive.append(JSON.stringify(pluginSettings), { name: 'plugins/chatango/settings.json' });
    archive.append(JSON.stringify({ id: 'chatango', entry: 'main.js' }), { name: 'plugins/chatango/plugin.json' });
    archive.append('module.exports = class SyntheticLegacyPlugin {};', { name: 'plugins/chatango/main.js' });
    archive.append('<h1>Synthetic legacy UI</h1>', { name: 'plugins/chatango/ui.html' });
    archive.append('synthetic legacy data only', { name: 'plugins/chatango/data/legacy.txt' });
    const archiveClosed = new Promise((resolve, reject) => {
      output.once('close', resolve);
      output.once('error', reject);
      archive.once('error', reject);
    });
    archive.finalize();

    try {
      await archiveClosed;
      db = new Database(':memory:');
      db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
      parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);

      expect(parsed.errors).toEqual([]);
      expect(parsed.pluginSettings.chatango).toEqual(pluginSettings);
      expect(parsed.dataFiles.chatango.map(file => file.relPath)).toEqual(['legacy.txt']);
      expect(fs.readFileSync(path.join(parsed.tmpDir, 'plugins', 'chatango', 'main.js'), 'utf8'))
        .toContain('SyntheticLegacyPlugin');

      const result = await performImport(parsed, {
        db,
        configPathManager: {
          getPluginDataDir: id => path.join(root, 'plugin-data', id),
          getUserConfigsDir: () => path.join(root, 'user_configs'),
          getUserDataDir: () => path.join(root, 'user_data'),
          getUploadsDir: () => path.join(root, 'uploads')
        }
      }, {
        mode: 'merge',
        includeGlobalSettings: false,
        includePluginSettings: true,
        includePluginData: true,
        includeUserConfigs: false,
        includeUploads: false,
        includeUserData: false
      });

      expect(result.success).toBe(true);
      expect(fs.readFileSync(path.join(pluginDataDir, 'legacy.txt'), 'utf8')).toBe('synthetic legacy data only');
      expect(fs.existsSync(runtimePluginsDir)).toBe(false);
      const loader = new PluginLoader(
        runtimePluginsDir,
        express(),
        { emit: jest.fn(), sockets: { sockets: new Map() } },
        db,
        { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
        { getUserConfigsDir: () => path.join(root, 'user_configs'), getPluginDataDir: id => path.join(root, 'plugin-data', id) }
      );
      expect(await loader.loadAllPlugins()).toEqual([]);
      expect(loader.plugins.size).toBe(0);
      expect(fs.existsSync(path.join(runtimePluginsDir, 'chatango'))).toBe(false);
      expect(fs.existsSync(path.join(pluginDataDir, 'main.js'))).toBe(false);
      expect(fs.existsSync(path.join(pluginDataDir, 'plugin.json'))).toBe(false);
    } finally {
      if (parsed?.tmpDir) cleanupTempDir(parsed.tmpDir);
      if (db) db.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('plugin discovery ignores the remaining locale-only directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-removed-chatango-'));
    const pluginsDir = path.join(root, 'plugins');
    const chatangoDir = path.join(pluginsDir, 'chatango');
    fs.mkdirSync(path.join(chatangoDir, 'locales'), { recursive: true });

    try {
      const loader = Object.create(PluginLoader.prototype);
      loader.pluginsDir = pluginsDir;
      loader.logger = { warn: jest.fn() };
      const pluginDirs = fs.readdirSync(pluginsDir, { withFileTypes: true }).filter(entry => (
        entry.isDirectory() &&
        !entry.name.startsWith('_') &&
        fs.existsSync(path.join(pluginsDir, entry.name, 'plugin.json'))
      ));

      expect(loader.buildPluginInventory(pluginDirs)).toEqual([]);
      expect(fs.existsSync(path.join(chatangoDir, 'plugin.json'))).toBe(false);
      expect(fs.existsSync(path.join(chatangoDir, 'main.js'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('startup stale-state pruning preserves saved Chatango preferences without writing them', () => {
    const loader = Object.create(PluginLoader.prototype);
    const savedState = { enabled: true, config: { room: 'preserve-me' } };
    loader.releasePolicy = { isClosedBetaId: () => false, assertAllowed: id => id };
    loader.state = { chatango: savedState };
    loader.logger = { info: jest.fn(), warn: jest.fn() };
    loader.saveState = jest.fn(() => true);

    loader.pruneStalePluginState([]);

    expect(loader.state.chatango).toBe(savedState);
    expect(loader.saveState).not.toHaveBeenCalled();
  });

  test('retired Chatango case variants keep opaque state and remain undiscoverable and blocked', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-retired-chatango-case-state-'));
    const pluginsDir = path.join(root, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    const identifiers = ['chatango', 'Chatango', 'cHaTaNgO', 'Ｃｈａｔａｎｇｏ'];
    const pluginDirs = identifiers.map((id, index) => {
      const directoryName = `retired-fixture-${index}`;
      const directory = path.join(pluginsDir, directoryName);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'plugin.json'), JSON.stringify({
        id,
        name: `Retired fixture ${index}`,
        entry: 'main.js',
        enabled: true
      }));
      fs.writeFileSync(path.join(directory, 'main.js'), 'module.exports = class RetiredFixture {};');
      return { name: directoryName };
    });
    const savedState = Object.fromEntries(identifiers.map((id, index) => [id, {
      enabled: true,
      config: { marker: `opaque-${index}` }
    }]));
    const loader = Object.create(PluginLoader.prototype);
    Object.assign(loader, {
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
      releasePolicy: { isClosedBetaId: () => false, assertAllowed: id => id },
      pluginsDir,
      plugins: new Map(),
      state: structuredClone(savedState),
      saveState: jest.fn(() => true)
    });

    try {
      const discovered = loader.buildPluginInventory(pluginDirs);
      expect(discovered).toEqual([]);

      loader.pruneStalePluginState(discovered);
      expect(loader.state).toEqual(savedState);
      expect(loader.saveState).not.toHaveBeenCalled();

      for (const [index, id] of identifiers.entries()) {
        expect(loader.resolvePluginInstallation(id)).toBeNull();
        await expect(loader.enablePlugin(id)).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });
        await expect(loader.loadPlugin(path.join(pluginsDir, pluginDirs[index].name))).resolves.toBeNull();
      }
      expect(loader.plugins.size).toBe(0);
      expect(loader.state).toEqual(savedState);
      expect(loader.saveState).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a valid legacy Chatango manifest is excluded from inventory and direct loader paths without changing saved state', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-retired-chatango-loader-'));
    const pluginsDir = path.join(root, 'plugins');
    const chatangoDir = path.join(pluginsDir, 'chatango');
    fs.mkdirSync(chatangoDir, { recursive: true });
    fs.writeFileSync(path.join(chatangoDir, 'plugin.json'), JSON.stringify({
      id: 'chatango', name: 'Legacy Chatango', entry: 'main.js', enabled: true
    }));
    fs.writeFileSync(path.join(chatangoDir, 'main.js'), 'module.exports = class LegacyChatango {};');
    const aliasDir = path.join(pluginsDir, 'legacy-wrapper');
    fs.mkdirSync(aliasDir, { recursive: true });
    fs.writeFileSync(path.join(aliasDir, 'plugin.json'), JSON.stringify({
      id: 'legacy-wrapper', name: 'Legacy wrapper', aliases: ['%2563hatango'], entry: 'main.js', enabled: true
    }));
    fs.writeFileSync(path.join(aliasDir, 'main.js'), 'module.exports = class LegacyWrapper {};');

    const savedState = { enabled: true, config: { room: 'preserve-me' }, opaque: { revision: 7 } };
    const loader = Object.create(PluginLoader.prototype);
    Object.assign(loader, {
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
      releasePolicy: { isClosedBetaId: () => false, assertAllowed: id => id },
      pluginsDir,
      plugins: new Map(),
      state: { chatango: structuredClone(savedState) },
      saveState: jest.fn(() => true)
    });

    try {
      const discovered = loader.buildPluginInventory([{ name: 'chatango' }, { name: 'legacy-wrapper' }]);
      expect(discovered).toEqual([]);
      expect(loader.resolvePluginInstallation('chatango')).toBeNull();
      expect(loader.resolvePluginInstallation('legacy-wrapper')).toBeNull();
      expect(loader.isPluginEnabledFromDisk('chatango')).toBe(false);
      expect(await loader.loadPlugin(chatangoDir)).toBeNull();
      expect(await loader.loadPlugin(aliasDir)).toBeNull();
      await expect(loader.enablePlugin('chatango')).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });
      await expect(loader.disablePlugin('%2563hatango')).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });
      await expect(loader.disablePlugin('chatango')).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });
      await expect(loader.reloadPlugin('chatango')).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });
      await expect(loader.deletePlugin('chatango')).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });
      expect(loader.plugins.has('chatango')).toBe(false);
      expect(fs.existsSync(path.join(chatangoDir, 'plugin.json'))).toBe(true);
      expect(loader.state.chatango).toEqual(savedState);
      expect(loader.saveState).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('plugin routes hide stale Chatango state and deny direct access without rewriting the saved preference', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-chatango-registry-'));
    const pluginsDir = path.join(root, 'plugins');
    const chatangoDir = path.join(pluginsDir, 'chatango');
    const uploadDir = path.join(root, 'uploads');
    fs.mkdirSync(path.join(chatangoDir, 'locales'), { recursive: true });

    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn()
    };
    const savedState = { enabled: true, config: { room: 'historical-room' }, custom: 'keep' };
    const loader = Object.create(PluginLoader.prototype);
    Object.assign(loader, {
      logger,
      releasePolicy: { isClosedBetaId: () => false, assertAllowed: id => id },
      pluginsDir,
      plugins: new Map(),
      state: { chatango: structuredClone(savedState) },
      saveState: jest.fn(() => true)
    });
    const passThrough = (_req, _res, next) => next();
    const licensedStoreAuth = (req, _res, next) => {
      req.storeAccount = { license: { active: true } };
      next();
    };
    const app = express();
    const pluginStore = {
      getInstalledPlugins: () => new Map(),
      findPlugin: jest.fn(),
      installPlugin: jest.fn()
    };

    try {
      setupPluginRoutes(app, loader, passThrough, passThrough, logger, null, null, {
        env: {},
        pluginStore,
        pluginUploadDir: uploadDir,
        storeAuth: licensedStoreAuth,
        freshStoreAuth: passThrough
      });

      const registry = await request(app).get('/api/plugins').expect(200);
      expect(registry.body.plugins.map(plugin => plugin.id)).not.toContain('chatango');

      // Stale identifiers are rejected at the route validation boundary before
      // plugin lookup; this must not mutate the preserved state either.
      await request(app).get('/api/plugins/chatango').expect(404);
      await request(app).get('/api/plugins/%2563hatango').expect(404);
      await request(app).get('/api/plugins/chatango/log').expect(404);
      await request(app).get('/api/plugins/%2563hatango/log').expect(404);
      await request(app).post('/api/plugins/chatango/disable').expect(410);
      await request(app).post('/api/plugins/%2563hatango/disable').expect(410);
      await request(app).post('/api/plugins/chatango/reload').expect(410);
      await request(app).delete('/api/plugins/chatango').expect(410);
      await request(app).delete('/api/plugins/%2563hatango').expect(410);
      const enableResponse = await request(app).post('/api/plugins/chatango/enable').expect(410);
      expect(enableResponse.body).toMatchObject({
        success: false,
        code: 'PLUGIN_RETIRED'
      });
      expect(loader.plugins.has('chatango')).toBe(false);
      expect(loader.state.chatango).toEqual(savedState);
      expect(loader.saveState).not.toHaveBeenCalled();

      for (const endpoint of [
        '/api/plugin-store/official/chatango/install',
        '/api/plugin-store/official/CHATANGO/install?source=direct',
        '/api/plugin-store/official/%63hatango/install',
        '/api/plugin-store/official/%2563hatango/install/',
        '/api/plugin-store/official/chatango/install/?source=direct'
      ]) {
        const retiredInstall = await request(app).post(endpoint).expect(410);
        expect(retiredInstall.body.code).toBe('PLUGIN_RETIRED');
      }
      expect(pluginStore.findPlugin).not.toHaveBeenCalled();
      expect(pluginStore.installPlugin).not.toHaveBeenCalled();
      const retiredRollback = await request(app)
        .post('/api/plugin-store/official/%2563hatango/rollback/?source=direct')
        .expect(410);
      expect(retiredRollback.body.code).toBe('PLUGIN_RETIRED');

      const directStore = new PluginStore({
        pluginsDir,
        releasePolicy: { assertAllowed: jest.fn() },
        state: {}
      }, {
        fetchImpl: jest.fn(),
        stateFile: path.join(root, 'plugin-store-state.json')
      });
      await expect(directStore.installPlugin('official', 'chatango')).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });
      await expect(directStore.rollbackPlugin('official', 'chatango')).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });
      expect(directStore.fetchImpl).not.toHaveBeenCalled();

      const zipPath = path.join(root, 'chatango.zip');
      const archive = archiver('zip');
      const output = fs.createWriteStream(zipPath);
      archive.pipe(output);
      archive.append(JSON.stringify({ id: 'chatango', name: 'Legacy Chatango', entry: 'main.js' }), { name: 'plugin.json' });
      archive.append('module.exports = class LegacyChatango {};', { name: 'main.js' });
      const archiveClosed = new Promise((resolve, reject) => {
        output.once('close', resolve);
        output.once('error', reject);
      });
      archive.finalize();
      await archiveClosed;

      const uploaded = await request(app)
        .post('/api/plugins/upload')
        .attach('plugin', zipPath)
        .expect(410);
      expect(uploaded.body.code).toBe('PLUGIN_RETIRED');
      expect(loader.plugins.has('chatango')).toBe(false);
      expect(loader.state.chatango).toEqual(savedState);
      expect(loader.saveState).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Chatango is absent from the backend preinstalled-plugin set and bundled code entrypoints', () => {
    const appRoot = path.join(__dirname, '..');
    const pluginStoreSource = fs.readFileSync(path.join(appRoot, 'modules', 'plugin-store.js'), 'utf8');
    const preinstalledSet = pluginStoreSource.match(/const PREINSTALLED_PLUGIN_IDS = new Set\(\[([\s\S]*?)\]\);/);

    expect(preinstalledSet).not.toBeNull();
    expect(preinstalledSet[1]).not.toMatch(/chatango/i);
    expect(fs.existsSync(path.join(appRoot, 'plugins', 'chatango', 'plugin.json'))).toBe(false);
    expect(fs.existsSync(path.join(appRoot, 'plugins', 'chatango', 'main.js'))).toBe(false);
    expect(fs.existsSync(path.join(appRoot, 'plugins', 'chatango', 'ui.html'))).toBe(false);
  });

  test('runtime navigation and static plugin assets do not expose a retired Chatango directory', async () => {
    const appRoot = path.join(__dirname, '..');
    const dashboard = fs.readFileSync(path.join(appRoot, 'public', 'dashboard.html'), 'utf8');
    const navigation = fs.readFileSync(path.join(appRoot, 'public', 'js', 'navigation.js'), 'utf8');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-retired-chatango-static-'));
    const pluginsDir = path.join(root, 'plugins');
    const chatangoDir = path.join(pluginsDir, 'chatango');
    fs.mkdirSync(chatangoDir, { recursive: true });
    fs.writeFileSync(path.join(chatangoDir, 'ui.html'), '<h1>legacy</h1>');
    const aliasDir = path.join(pluginsDir, 'legacy-wrapper');
    fs.mkdirSync(aliasDir, { recursive: true });
    fs.writeFileSync(path.join(aliasDir, 'plugin.json'), JSON.stringify({
      id: 'legacy-wrapper', aliases: ['chatango'], entry: 'index.js'
    }));
    fs.writeFileSync(path.join(aliasDir, 'ui.html'), '<h1>aliased legacy</h1>');
    const app = express();
    const policy = createPluginReleasePolicy({
      appRoot: root,
      policyPath: path.join(root, 'policy.json'),
      modePath: path.join(root, 'mode.json')
    });

    try {
      expect(dashboard.toLowerCase()).not.toContain('chatango');
      expect(navigation.toLowerCase()).not.toContain('chatango');
      app.use(policy.createRequestGuard({ pluginsDir }));
      app.use('/plugins', express.static(pluginsDir));
      app.use((_req, res) => res.status(418).end());
      let deeplyEncodedChatango = 'chatango';
      for (let depth = 0; depth < 12; depth += 1) {
        deeplyEncodedChatango = encodeURIComponent(deeplyEncodedChatango);
      }
      await request(app).get('/plugins/chatango/ui.html').expect(404);
      for (const url of [
        '/plugins/CHATANGO/ui.html?cache=1',
        '/plugins/chatango/?cache=1',
        '/plugins/%63hatango/ui.html',
        '/plugins/%2563hatango/ui.html',
        `/plugins/${deeplyEncodedChatango}/ui.html`,
        '/plugins%2fchatango/ui.html',
        '/plugins%252fchatango/ui.html',
        '/plugins%5cchatango/ui.html',
        '/plugins%255cchatango/ui.html',
        '/plugins/legacy-wrapper/ui.html'
      ]) {
        await request(app).get(url).expect(404);
      }
      await request(app).get('/api/plugins/chatango/config').expect(404);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('official catalog and its offline fallback filter retired Chatango manifests', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-retired-chatango-catalog-'));
    const pluginsDir = path.join(root, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    for (const id of ['chatango', 'safe-plugin', 'legacy-wrapper']) {
      const pluginDir = path.join(pluginsDir, id);
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        id,
        name: id,
        entry: 'main.js',
        version: '1.0.0',
        ...(id === 'legacy-wrapper' ? { aliases: ['%2563hatango'] } : {})
      }));
    }
    const releasePolicy = {
      assertAllowed: id => id,
      filterRegistry: registry => registry,
      isClosedBetaId: () => false
    };
    const pluginLoader = {
      logger: { warn: jest.fn() },
      pluginsDir,
      releasePolicy,
      isPluginEnabledFromDisk: () => true
    };
    const plugin = (id) => ({
      id,
      ...(id === 'legacy-wrapper' ? { aliases: ['%2563hatango'] } : {}),
      name: { en: id },
      description: { en: 'fixture' },
      version: '1.0.0'
    });

    try {
      const remoteStore = new PluginStore(pluginLoader, {
        stateFile: path.join(root, 'remote-state.json'),
        fetchImpl: jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ plugins: [plugin('chatango'), plugin('legacy-wrapper'), plugin('safe-plugin')] })
        })
      });
      const remoteListing = await remoteStore.listPlugins();
      expect(remoteListing.plugins.map(item => item.id)).toEqual(['safe-plugin']);

      const offlineFetch = jest.fn().mockRejectedValue(new Error('offline'));
      const offlineStore = new PluginStore(pluginLoader, {
        stateFile: path.join(root, 'offline-state.json'),
        fetchImpl: offlineFetch
      });
      const officialFallbackSpy = jest.spyOn(offlineStore, 'buildBundledOfficialRegistry').mockReturnValue({
        plugins: [plugin('chatango'), plugin('legacy-wrapper'), plugin('safe-plugin')]
      });
      const offlineListing = await offlineStore.listPlugins();
      expect(offlineListing.plugins.map(item => item.id)).toEqual(['safe-plugin']);
      offlineFetch.mockClear();
      await expect(offlineStore.findPlugin('official', 'chatango')).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });
      expect(offlineFetch).not.toHaveBeenCalled();
      expect(() => offlineStore.normalizeStorePlugin(plugin('chatango'), { id: 'official', name: 'Official', official: true }, 'en', new Map()))
        .toThrow(expect.objectContaining({ code: 'PLUGIN_RETIRED' }));
      expect(() => offlineStore.normalizeStorePlugin(plugin('legacy-wrapper'), { id: 'official', name: 'Official', official: true }, 'en', new Map()))
        .toThrow(expect.objectContaining({ code: 'PLUGIN_RETIRED' }));
      await expect(offlineStore.installPlugin('official', 'safe-plugin', {
        plugin: { ...plugin('safe-plugin'), aliases: ['chatango'] }
      })).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });

      officialFallbackSpy.mockRestore();
      const officialRegistryPath = path.resolve(__dirname, '..', '..', 'plugin-store.json');
      const originalExistsSync = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(targetPath => (
        path.resolve(String(targetPath)) === officialRegistryPath
          ? false
          : originalExistsSync.call(fs, targetPath)
      ));
      try {
        const localFallback = offlineStore.buildBundledOfficialRegistry();
        expect(localFallback.plugins.map(item => item.id)).toEqual(['safe-plugin']);
        expect(offlineStore.getInstalledPlugins().has('chatango')).toBe(false);
      } finally {
        existsSpy.mockRestore();
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

});
