'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');

const ConfigPathManager = require('../modules/config-path-manager');
const PluginLoader = require('../modules/plugin-loader');
const { PluginAPI } = require('../modules/plugin-loader');

function logger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
}

function createLoader(root) {
  return new PluginLoader(
    root,
    express(),
    { emit: jest.fn(), sockets: { sockets: new Map() } },
    {},
    logger(),
    { getPluginDataDir: id => path.join(root, 'data', id) }
  );
}

function settingsDatabase() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  return db;
}

function createApi(db, root) {
  return new PluginAPI(
    'streamalchemy',
    root,
    express(),
    { emit: jest.fn(), sockets: { sockets: new Map() } },
    db,
    logger(),
    {
      plugins: new Map(),
      loadedPlugins: new Map(),
      getPluginRouter: jest.fn(() => express.Router()),
      removePluginRouter: jest.fn(),
      unregisterPluginConnectionHandlers: jest.fn()
    },
    { getPluginDataDir: id => path.join(root, id) }
  );
}

function readSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : undefined;
}

describe('canonical plugin state compatibility', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-state-alias-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('migrates legacy-only state and atomically dual-writes equivalent entries', () => {
    const statePath = path.join(root, 'plugins_state.json');
    fs.writeFileSync(statePath, JSON.stringify({
      streamalchemy: { enabled: false, rollbackField: 'kept' }
    }));
    const rename = jest.spyOn(fs, 'renameSync');
    const loader = createLoader(root);

    expect(loader.state['stream-monsters']).toEqual({
      enabled: false,
      rollbackField: 'kept'
    });
    expect(loader.state.streamalchemy).toEqual(loader.state['stream-monsters']);

    loader.state['stream-monsters'] = { enabled: true, rollbackField: 'kept' };
    expect(loader.saveState()).toBe(true);

    const persisted = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(persisted['stream-monsters']).toEqual(persisted.streamalchemy);
    expect(persisted['stream-monsters'].enabled).toBe(true);
    expect(rename).toHaveBeenCalled();
    expect(fs.existsSync(`${statePath}.tmp`)).toBe(false);
    rename.mockRestore();
  });

  test('fails closed with a stable code when both state shadows were independently edited', () => {
    const statePath = path.join(root, 'plugins_state.json');
    fs.writeFileSync(statePath, JSON.stringify({
      streamalchemy: { enabled: true }
    }));
    const first = createLoader(root);
    expect(first.saveState()).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    persisted['stream-monsters'] = { enabled: false, editor: 'canonical' };
    persisted.streamalchemy = { enabled: true, editor: 'legacy' };
    fs.writeFileSync(statePath, JSON.stringify(persisted));

    const conflicted = createLoader(root);

    expect(conflicted.stateSyncError).toEqual(expect.objectContaining({
      code: 'PLUGIN_IDENTITY_STATE_CONFLICT'
    }));
    expect(conflicted.saveState()).toBe(false);
    expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toEqual(persisted);
  });
});

describe('canonical plugin config compatibility', () => {
  let root;
  let db;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-config-alias-'));
    db = settingsDatabase();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('uses legacy as the one-time migration source and transactionally dual-writes both keys', () => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
      'plugin:streamalchemy:streamalchemy_config',
      JSON.stringify({ enabled: true, streamMonsters: { hatchDurationMs: 120000 } })
    );
    const api = createApi(db, root);

    expect(api.getConfig('config')).toEqual(expect.objectContaining({
      streamMonsters: { hatchDurationMs: 120000 }
    }));
    expect(readSetting(db, 'plugin:stream-monsters:config'))
      .toEqual(readSetting(db, 'plugin:streamalchemy:streamalchemy_config'));

    const next = { enabled: true, streamMonsters: { hatchDurationMs: 90000 } };
    expect(api.setConfig('streamalchemy_config', next)).toBe(true);
    expect(readSetting(db, 'plugin:stream-monsters:config')).toEqual(next);
    expect(readSetting(db, 'plugin:streamalchemy:streamalchemy_config')).toEqual(next);
  });

  test('preserves first-migration conflict snapshots while selecting legacy once', () => {
    const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insert.run('plugin:stream-monsters:config', JSON.stringify({ canonical: true }));
    insert.run('plugin:streamalchemy:streamalchemy_config', JSON.stringify({ legacy: true }));
    const api = createApi(db, root);

    expect(api.getConfig()).toEqual({ legacy: true });
    expect(readSetting(db, 'plugin:stream-monsters:config_migration_snapshot_canonical'))
      .toEqual({ canonical: true });
    expect(readSetting(db, 'plugin:stream-monsters:config_migration_snapshot_legacy'))
      .toEqual({ legacy: true });
    expect(readSetting(db, 'plugin:stream-monsters:config')).toEqual({ legacy: true });
  });

  test('imports a later legacy-only rollback edit without dropping canonical-only fields', () => {
    const api = createApi(db, root);
    const original = {
      enabled: true,
      streamMonsters: { shared: 'base', release112Only: 'keep-me' }
    };
    expect(api.setConfig('config', original)).toBe(true);
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
      JSON.stringify({ enabled: false, streamMonsters: { shared: 'rollback' } }),
      'plugin:streamalchemy:streamalchemy_config'
    );

    expect(api.getConfig('streamalchemy_config')).toEqual({
      enabled: false,
      streamMonsters: { shared: 'rollback', release112Only: 'keep-me' }
    });
    expect(readSetting(db, 'plugin:stream-monsters:config'))
      .toEqual(readSetting(db, 'plugin:streamalchemy:streamalchemy_config'));
  });

  test('fails closed on independent config edits and rolls back a failed shadow write', () => {
    const api = createApi(db, root);
    expect(api.setConfig('config', { value: 1 })).toBe(true);
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
      JSON.stringify({ value: 2 }),
      'plugin:stream-monsters:config'
    );
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
      JSON.stringify({ value: 3 }),
      'plugin:streamalchemy:streamalchemy_config'
    );

    expect(api.getConfig()).toBeNull();
    expect(api.lastConfigError).toEqual(expect.objectContaining({
      code: 'PLUGIN_IDENTITY_CONFIG_CONFLICT'
    }));

    db.exec(`
      DROP TRIGGER IF EXISTS reject_legacy;
      CREATE TRIGGER reject_legacy BEFORE UPDATE ON settings
      WHEN NEW.key = 'plugin:streamalchemy:streamalchemy_config'
      BEGIN SELECT RAISE(ABORT, 'legacy write rejected'); END;
    `);
    const canonicalBefore = readSetting(db, 'plugin:stream-monsters:config');
    const legacyBefore = readSetting(db, 'plugin:streamalchemy:streamalchemy_config');
    expect(api.setConfig('config', { value: 4 })).toBe(false);
    expect(readSetting(db, 'plugin:stream-monsters:config')).toEqual(canonicalBefore);
    expect(readSetting(db, 'plugin:streamalchemy:streamalchemy_config')).toEqual(legacyBefore);
  });
});

describe('persistent Stream Monsters data identity', () => {
  test('uses the legacy directory and imports only missing canonical files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-data-alias-'));
    const manager = Object.create(ConfigPathManager.prototype);
    manager.getPluginsDir = () => root;
    const legacy = path.join(root, 'streamalchemy', 'data');
    const canonical = path.join(root, 'stream-monsters', 'data');
    fs.mkdirSync(legacy, { recursive: true });
    fs.mkdirSync(canonical, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'conflict.bin'), 'legacy-bytes');
    fs.writeFileSync(path.join(canonical, 'conflict.bin'), 'canonical-bytes');
    fs.writeFileSync(path.join(canonical, 'missing.json'), '{"from":"canonical"}');

    expect(manager.getPluginDataDir('stream-monsters')).toBe(legacy);
    expect(manager.getPluginDataDir('streamalchemy')).toBe(legacy);
    expect(fs.readFileSync(path.join(legacy, 'conflict.bin'), 'utf8')).toBe('legacy-bytes');
    expect(fs.readFileSync(path.join(legacy, 'missing.json'), 'utf8'))
      .toBe('{"from":"canonical"}');
    expect(fs.readFileSync(path.join(canonical, 'conflict.bin'), 'utf8'))
      .toBe('canonical-bytes');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
