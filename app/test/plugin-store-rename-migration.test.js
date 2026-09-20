'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { archiveFolder } = require('zip-lib');
const { PluginStore } = require('../modules/plugin-store');

const HISTORICAL_HASH = '46918c6c52bd0bcae123950e038e4db3feadd30fa1bc514758e8e411d00c3b60';
const HISTORICAL_PACKAGE = path.resolve(
  __dirname, '..', '..', 'plugin-store', 'packages', 'streamalchemy-1.11.1.zip'
);

function writePlugin(pluginsDir, directoryName, manifestId, version) {
  const pluginDir = path.join(pluginsDir, directoryName);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = class Plugin {}\n');
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
    id: manifestId,
    name: 'Stream Monsters',
    version,
    entry: 'index.js',
    enabled: true
  }));
  return pluginDir;
}

async function package112(root) {
  const source = path.join(root, 'package-source');
  const zipPath = path.join(root, 'stream-monsters-1.12.0.zip');
  writePlugin(root, 'package-source', 'stream-monsters', '1.12.0');
  await archiveFolder(source, zipPath);
  return {
    zipPath,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex')
  };
}

function registry(sha256) {
  return {
    schemaVersion: 1,
    plugins: [{
      id: 'stream-monsters',
      aliases: ['streamalchemy'],
      replaces: ['streamalchemy'],
      name: { en: 'Stream Monsters' },
      description: { en: 'Portrait battle arena' },
      version: '1.12.0',
      minLtthVersion: '1.4.2',
      packageUrl: 'https://example.com/stream-monsters-1.12.0.zip',
      sha256,
      rollbackVersions: [{
        version: '1.11.1',
        manifestId: 'streamalchemy',
        packageUrl: 'https://ltth.app/plugin-store/packages/streamalchemy-1.11.1.zip',
        sha256: HISTORICAL_HASH
      }]
    }]
  };
}

function createHarness(root, registryData, newPackage, overrides = {}) {
  const pluginsDir = path.join(root, 'plugins');
  const dataDir = path.join(root, 'persistent', 'plugins', 'streamalchemy', 'data');
  fs.mkdirSync(pluginsDir, { recursive: true });
  const db = new Database(':memory:');
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
  const loader = {
    pluginsDir,
    plugins: new Map(),
    state: { streamalchemy: { enabled: true, token: 'legacy' } },
    db,
    configPathManager: { getPluginDataDir: () => dataDir },
    saveState: jest.fn(() => true),
    isPluginEnabledFromDisk: jest.fn(() => true),
    unloadPlugin: jest.fn(async () => true),
    loadPlugin: jest.fn(async target => ({ path: target })),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides
  };
  const fetchImpl = jest.fn(async url => {
    if (String(url).endsWith('stream-monsters-1.12.0.zip')) {
      return { ok: true, status: 200, arrayBuffer: async () => fs.readFileSync(newPackage) };
    }
    if (String(url).endsWith('streamalchemy-1.11.1.zip')) {
      return { ok: true, status: 200, arrayBuffer: async () => fs.readFileSync(HISTORICAL_PACKAGE) };
    }
    return { ok: true, status: 200, json: async () => registryData };
  });
  const store = new PluginStore(loader, {
    fetchImpl,
    officialStoreUrl: 'https://example.com/store.json',
    stateFile: path.join(root, 'store-state.json'),
    ltthVersion: '1.4.2'
  });
  return { db, dataDir, loader, pluginsDir, store };
}

describe('PluginStore Stream Monsters rename migration', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-store-rename-'));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('shows one canonical tile, upgrades legacy 1.11.1, then rolls back through the mapped package', async () => {
    expect(crypto.createHash('sha256').update(fs.readFileSync(HISTORICAL_PACKAGE)).digest('hex')).toBe(HISTORICAL_HASH);
    const built = await package112(path.join(root, 'packages'));
    const harness = createHarness(root, registry(built.sha256), built.zipPath);
    writePlugin(harness.pluginsDir, 'streamalchemy', 'streamalchemy', '1.11.1');
    fs.mkdirSync(harness.dataDir, { recursive: true });
    fs.writeFileSync(path.join(harness.dataDir, 'save.bin'), 'player-progress');

    const listing = await harness.store.listPlugins();
    expect(listing.plugins.filter(plugin => plugin.id === 'stream-monsters')).toHaveLength(1);
    expect(listing.plugins[0]).toEqual(expect.objectContaining({
      id: 'stream-monsters',
      installed: true,
      installedVersion: '1.11.1',
      updateAvailable: true,
      aliases: ['streamalchemy'],
      replaces: ['streamalchemy']
    }));

    await expect(harness.store.installPlugin('official', 'streamalchemy')).resolves.toEqual(
      expect.objectContaining({ id: 'stream-monsters', version: '1.12.0' })
    );
    expect(fs.existsSync(path.join(harness.pluginsDir, 'streamalchemy'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(harness.pluginsDir, 'stream-monsters', 'plugin.json'))).id)
      .toBe('stream-monsters');
    expect(harness.loader.state).toEqual(expect.objectContaining({
      streamalchemy: expect.objectContaining({ token: 'legacy' }),
      'stream-monsters': expect.objectContaining({ token: 'legacy' })
    }));
    expect(fs.readFileSync(path.join(harness.dataDir, 'save.bin'), 'utf8')).toBe('player-progress');

    await expect(harness.store.rollbackPlugin('official', 'stream-monsters', '1.11.1'))
      .resolves.toEqual(expect.objectContaining({
        id: 'stream-monsters', version: '1.11.1', rolledBackTo: '1.11.1'
      }));
    const rolledBack = JSON.parse(fs.readFileSync(
      path.join(harness.pluginsDir, 'stream-monsters', 'plugin.json'), 'utf8'
    ));
    expect(rolledBack.id).toBe('streamalchemy');
    expect(rolledBack.version).toBe('1.11.1');
    expect(fs.readFileSync(path.join(harness.dataDir, 'save.bin'), 'utf8')).toBe('player-progress');
    harness.db.close();
  });

  test('restores directory, dual config rows, data, state, and runtime after injected init failure', async () => {
    const built = await package112(path.join(root, 'packages'));
    const harness = createHarness(root, registry(built.sha256), built.zipPath);
    const legacyDir = writePlugin(harness.pluginsDir, 'streamalchemy', 'streamalchemy', '1.11.1');
    harness.loader.plugins.set('stream-monsters', {});
    fs.mkdirSync(harness.dataDir, { recursive: true });
    fs.writeFileSync(path.join(harness.dataDir, 'save.bin'), 'before');
    const oldConfig = JSON.stringify({ streamMonsters: { future112Field: 'keep' } });
    harness.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run('plugin:stream-monsters:config', oldConfig);
    harness.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run('plugin:streamalchemy:streamalchemy_config', oldConfig);
    let loadCount = 0;
    harness.loader.loadPlugin = jest.fn(async target => {
      loadCount += 1;
      if (loadCount === 1) {
        harness.db.prepare('UPDATE settings SET value = ? WHERE key LIKE ?')
          .run(JSON.stringify({ corrupted: true }), 'plugin:%');
        fs.writeFileSync(path.join(harness.dataDir, 'save.bin'), 'corrupted');
        return null;
      }
      return { path: target };
    });

    await expect(harness.store.installPlugin('official', 'stream-monsters'))
      .rejects.toThrow(/transaction failed/i);

    expect(JSON.parse(fs.readFileSync(path.join(legacyDir, 'plugin.json'))).version).toBe('1.11.1');
    expect(fs.existsSync(path.join(harness.pluginsDir, 'stream-monsters'))).toBe(false);
    expect(harness.db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('plugin:stream-monsters:config').value).toBe(oldConfig);
    expect(harness.db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('plugin:streamalchemy:streamalchemy_config').value).toBe(oldConfig);
    expect(fs.readFileSync(path.join(harness.dataDir, 'save.bin'), 'utf8')).toBe('before');
    expect(harness.loader.state).toEqual({ streamalchemy: { enabled: true, token: 'legacy' } });
    expect(harness.loader.loadPlugin).toHaveBeenLastCalledWith(legacyDir);
    harness.db.close();
  });

  test('rejects a community registry that claims the reserved alias', async () => {
    const built = await package112(path.join(root, 'packages'));
    const harness = createHarness(root, registry(built.sha256), built.zipPath);
    harness.store.enableCommunitySources();
    harness.store.addCommunitySource({
      id: 'community', name: 'Community', url: 'https://example.com/community.json'
    });
    harness.store.fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: 1,
        plugins: [{
          id: 'streamalchemy', version: '9.9.9',
          packageUrl: 'https://evil.example/streamalchemy.zip', sha256: '0'.repeat(64)
        }]
      })
    }));

    await expect(harness.store.fetchRegistry(harness.store.getSources().find(source => source.id === 'community')))
      .rejects.toEqual(expect.objectContaining({ code: 'PLUGIN_IDENTITY_RESERVED_ALIAS' }));
    harness.db.close();
  });
});
