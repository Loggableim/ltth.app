'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');
const Database = require('better-sqlite3');
const BackupManager = require('../modules/backup-manager');
const { createManifest } = require('../modules/backup/manifest');
const {
  discoverAllPluginSettings,
  discoverPluginSettings,
  restorePluginSettings
} = require('../modules/backup/plugin-discovery');
const { parseBackupZip, cleanupTempDir } = require('../modules/backup/importer');

function database() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
  return db;
}

function set(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

async function zip(entries) {
  const file = path.join(os.tmpdir(), `stream-monsters-backup-${process.pid}-${Date.now()}-${Math.random()}.zip`);
  const output = fs.createWriteStream(file);
  const archive = archiver('zip');
  archive.pipe(output);
  for (const [name, content] of Object.entries(entries)) {
    archive.append(Buffer.isBuffer(content) ? content : JSON.stringify(content), { name });
  }
  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.finalize();
  });
  return file;
}

describe('backup plugin identity aliases', () => {
  test('projects equivalent dual settings and providers as one canonical plugin', () => {
    const db = database();
    const config = { streamMonsters: { enabled: true } };
    set(db, 'plugin:stream-monsters:config', config);
    set(db, 'plugin:streamalchemy:streamalchemy_config', config);
    set(db, 'plugin:stream-monsters:config_identity_sync', { version: 1, hash: 'internal' });

    expect(discoverAllPluginSettings(db)).toEqual({
      'stream-monsters': { config }
    });
    expect(discoverPluginSettings(db, 'streamalchemy')).toEqual({ config });

    const manager = new BackupManager({
      db,
      configPathManager: {},
      pluginLoader: null,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    });
    const provider = {};
    manager.registerBackupProvider('streamalchemy', provider);
    expect(manager.getBackupProvider('stream-monsters')).toBe(provider);
    expect(manager.getCapabilities().customBackupProviders).toEqual(['stream-monsters']);
    db.close();
  });

  test('fails closed when dual settings were independently edited', () => {
    const db = database();
    set(db, 'plugin:stream-monsters:config', { value: 'canonical' });
    set(db, 'plugin:streamalchemy:streamalchemy_config', { value: 'legacy' });

    expect(() => discoverAllPluginSettings(db)).toThrow(expect.objectContaining({
      code: 'PLUGIN_IDENTITY_BACKUP_CONFLICT'
    }));
    db.close();
  });

  test('restores a legacy config transactionally to both storage keys', () => {
    const db = database();
    const config = { streamMonsters: { future112Field: 'preserved' } };

    expect(restorePluginSettings(db, 'streamalchemy', {
      streamalchemy_config: config
    }, 'replace')).toEqual({ imported: ['config'], skipped: [] });

    const rows = db.prepare(
      "SELECT key, value FROM settings WHERE key IN ('plugin:stream-monsters:config', 'plugin:streamalchemy:streamalchemy_config') ORDER BY key"
    ).all();
    expect(rows).toHaveLength(2);
    expect(rows.map(row => JSON.parse(row.value))).toEqual([config, config]);
    expect(discoverAllPluginSettings(db)).toEqual({ 'stream-monsters': { config } });
    db.close();
  });

  test('imports legacy backup folders canonically and rejects dual-folder conflicts', async () => {
    const manifest = createManifest({
      appVersion: '1.4.1',
      plugins: [{ id: 'streamalchemy' }],
      warnings: []
    });
    const legacyZip = await zip({
      'manifest.json': manifest,
      'plugins/streamalchemy/settings.json': {
        streamalchemy_config: { streamMonsters: { enabled: true } }
      },
      'plugins/streamalchemy/data/state.bin': Buffer.from('legacy-data')
    });
    const parsed = await parseBackupZip(legacyZip, fs.statSync(legacyZip).size);
    expect(parsed.errors).toEqual([]);
    expect(parsed.manifest.plugins).toEqual([{ id: 'stream-monsters' }]);
    expect(parsed.pluginSettings).toEqual({
      'stream-monsters': { config: { streamMonsters: { enabled: true } } }
    });
    expect(parsed.dataFiles['stream-monsters']).toHaveLength(1);
    cleanupTempDir(parsed.tmpDir);
    fs.unlinkSync(legacyZip);

    const conflictZip = await zip({
      'manifest.json': manifest,
      'plugins/stream-monsters/settings.json': { config: { value: 'canonical' } },
      'plugins/streamalchemy/settings.json': { streamalchemy_config: { value: 'legacy' } }
    });
    const conflict = await parseBackupZip(conflictZip, fs.statSync(conflictZip).size);
    expect(conflict.errors).toContainEqual(expect.stringContaining('PLUGIN_IDENTITY_BACKUP_CONFLICT'));
    cleanupTempDir(conflict.tmpDir);
    fs.unlinkSync(conflictZip);
  });
});
