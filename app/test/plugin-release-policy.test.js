const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { archiveFolder } = require('zip-lib');
const PluginLoader = require('../modules/plugin-loader');
const { PluginStore } = require('../modules/plugin-store');
const { createPluginReleasePolicy } = require('../modules/plugin-release-policy');
const { setupPluginRoutes } = require('../routes/plugin-routes');

const closedBeta = [
  'animazingpal', 'interactive-story', 'music-bot', 'osc-bridge', 'schnorrbecher',
  'sidekick', 'stream-monsters', 'talking-heads', 'visual-fx-frame-webgpu',
  'webgpu-emoji-rain', 'webgpu-weather-control'
];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writePlugin(root, id) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id, name: id, entry: 'index.js', enabled: true }));
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = class Plugin {};');
}

describe('public distribution plugin release policy', () => {
  let root;
  let appRoot;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-release-policy-'));
    appRoot = path.join(root, 'app');
    writeJson(path.join(appRoot, 'config', 'plugin-release-policy.json'), {
      schemaVersion: 1,
      closedBeta,
      aliases: { streamalchemy: 'stream-monsters' }
    });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('missing distribution marker preserves local discovery and explicit policy checks', () => {
    const policy = createPluginReleasePolicy({ appRoot });
    expect(policy.isClosedBetaId('music-bot')).toBe(false);
    expect(policy.assertAllowed('music-bot')).toBe('music-bot');
  });

  test('public loader hides all closed-beta manifests including aliases without pruning saved state', async () => {
    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'public' });
    for (const id of closedBeta) writePlugin(path.join(root, 'plugins'), id);
    writePlugin(path.join(root, 'plugins'), 'streamalchemy');
    writePlugin(path.join(root, 'plugins'), 'tts');

    const loader = new PluginLoader(
      path.join(root, 'plugins'), express(), { emit: jest.fn(), sockets: { sockets: new Map() } }, {},
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      { getPluginDataDir: id => path.join(root, 'data', id) },
      null,
      { releasePolicy: { appRoot } }
    );
    const savedState = Object.fromEntries([...closedBeta, 'streamalchemy'].map(id => [id, {
      enabled: true, enabledAt: 123, preferences: { label: id }
    }]));
    loader.state = JSON.parse(JSON.stringify(savedState));
    const saveState = jest.spyOn(loader, 'saveState').mockReturnValue(true);
    const inventory = loader.buildPluginInventory(fs.readdirSync(path.join(root, 'plugins'), { withFileTypes: true }));

    expect(inventory.map(item => item.canonicalId)).toEqual(['tts']);
    expect(loader.resolvePluginInstallation('streamalchemy')).toBeNull();
    expect(loader.getPlugin('music-bot')).toBeNull();
    expect(loader.isPluginEnabledFromDisk('music-bot')).toBe(false);
    await expect(loader.enablePlugin('music-bot')).rejects.toMatchObject({ code: 'PLUGIN_CLOSED_BETA_PUBLIC' });
    loader.pruneStalePluginState(inventory);
    expect(loader.state).toEqual(savedState);
    expect(saveState).not.toHaveBeenCalled();
  });

  test('explicit local marker keeps all eleven apps discoverable and store-listed', async () => {
    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'local' });
    const pluginsDir = path.join(root, 'local-plugins');
    for (const id of closedBeta) writePlugin(pluginsDir, id);
    const loader = new PluginLoader(
      pluginsDir, express(), { emit: jest.fn(), sockets: { sockets: new Map() } }, {},
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      { getPluginDataDir: id => path.join(root, 'data', id) },
      null,
      { releasePolicy: { appRoot } }
    );
    const inventoryIds = loader.buildPluginInventory(fs.readdirSync(pluginsDir, { withFileTypes: true }))
      .map(plugin => plugin.canonicalId).sort();
    const registry = { schemaVersion: 1, plugins: closedBeta.map(id => ({ id, name: { en: id } })) };
    const store = new PluginStore({
      pluginsDir,
      plugins: new Map(),
      state: {},
      releasePolicy: loader.releasePolicy,
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
    }, {
      fetchImpl: jest.fn(async () => ({ ok: true, status: 200, json: async () => registry })),
      officialStoreUrl: 'https://official.example/store.json',
      stateFile: path.join(root, 'local-state.json')
    });
    const listedIds = (await store.listPlugins()).plugins.map(plugin => plugin.id).sort();

    expect(inventoryIds).toEqual([...closedBeta].sort());
    expect(listedIds).toEqual([...closedBeta].sort());
  });

  test('filters alternate registry before cache and rejects direct installs and manifest aliases', async () => {
    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'public' });
    const cacheDir = path.join(root, 'plugins');
    fs.mkdirSync(cacheDir, { recursive: true });
    const registry = { schemaVersion: 1, plugins: [
      { id: 'music-bot', name: { en: 'Music Bot' } },
      { id: 'streamalchemy', name: { en: 'Stream Monsters' } },
      { id: 'tts', name: { en: 'TTS' } }
    ] };
    const communityRegistry = { schemaVersion: 1, plugins: [
      { id: 'music-bot', name: { en: 'Music Bot' } },
      { id: 'stream-monsters', name: { en: 'Stream Monsters' } },
      { id: 'tts', name: { en: 'TTS' } }
    ] };
    const fetchImpl = jest.fn(async url => ({
      ok: true,
      status: 200,
      json: async () => String(url).includes('community') ? communityRegistry : registry
    }));
    const loader = {
      pluginsDir: cacheDir,
      plugins: new Map(),
      state: { 'music-bot': { enabled: true } },
      releasePolicy: createPluginReleasePolicy({ appRoot }),
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
      resolvePluginInstallation: jest.fn(),
      saveState: jest.fn()
    };
    const store = new PluginStore(loader, {
      fetchImpl,
      officialStoreUrl: 'https://official.example/store.json',
      stateFile: path.join(root, 'state.json')
    });
    store.state = {
      communityEnabled: true,
      sources: [{ id: 'community', name: 'Community', url: 'https://community.example/store.json', enabled: true }]
    };

    const result = await store.listPlugins();
    expect(result.plugins.map(plugin => plugin.id)).toEqual(['tts']);
    expect(store.cache.get('official').registry.plugins.map(plugin => plugin.id)).toEqual(['tts']);
    expect(store.cache.get('community').registry.plugins.map(plugin => plugin.id)).toEqual(['tts']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(store.buildBundledOfficialRegistry().plugins.some(plugin => closedBeta.includes(plugin.id))).toBe(false);
    await expect(store.findPlugin('official', 'music-bot')).rejects.toMatchObject({ code: 'PLUGIN_CLOSED_BETA_PUBLIC' });
    await expect(store.installPlugin('official', 'music-bot', { plugin: { id: 'music-bot' } }))
      .rejects.toMatchObject({ code: 'PLUGIN_CLOSED_BETA_PUBLIC' });
    expect(fs.existsSync(path.join(cacheDir, 'music-bot'))).toBe(false);

    const packageDir = path.join(root, 'manifest-probe');
    writePlugin(path.dirname(packageDir), 'manifest-probe');
    const manifestPath = path.join(packageDir, 'plugin.json');
    writeJson(manifestPath, { id: 'streamalchemy', name: 'Stream Monsters', entry: 'index.js', version: '1.0.0' });
    fs.writeFileSync(path.join(packageDir, 'index.js'), 'module.exports = class Plugin {};');
    expect(() => store.validateExtractedPackage(packageDir, 'stream-monsters', '1.0.0'))
      .toThrow(expect.objectContaining({ code: 'PLUGIN_CLOSED_BETA_PUBLIC' }));
  });

  test('malformed public policy fails closed while non-public marker remains local', () => {
    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'local' });
    expect(createPluginReleasePolicy({ appRoot }).isClosedBetaId('talking-heads')).toBe(false);
    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'public' });
    writeJson(path.join(appRoot, 'config', 'plugin-release-policy.json'), { schemaVersion: 1, closedBeta: 'invalid' });
    expect(() => createPluginReleasePolicy({ appRoot }).assertAllowed('tts'))
      .toThrow(expect.objectContaining({ code: 'PLUGIN_RELEASE_POLICY_INVALID' }));
    writeJson(path.join(appRoot, 'config', 'plugin-release-policy.json'), {
      schemaVersion: 1,
      closedBeta,
      aliases: 'streamalchemy'
    });
    expect(() => createPluginReleasePolicy({ appRoot }).assertAllowed('tts'))
      .toThrow(expect.objectContaining({ code: 'PLUGIN_RELEASE_POLICY_INVALID' }));
    writeJson(path.join(appRoot, 'config', 'plugin-release-policy.json'), {
      schemaVersion: 1,
      closedBeta: [...closedBeta, 'music-bot']
    });
    expect(() => createPluginReleasePolicy({ appRoot }).assertAllowed('tts'))
      .toThrow(expect.objectContaining({ code: 'PLUGIN_RELEASE_POLICY_INVALID' }));
    writeJson(path.join(appRoot, 'config', 'plugin-release-policy.json'), { schemaVersion: 1, closedBeta });
    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'publc' });
    expect(() => createPluginReleasePolicy({ appRoot }).assertAllowed('tts'))
      .toThrow(expect.objectContaining({ code: 'PLUGIN_RELEASE_POLICY_INVALID' }));
    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'public' });
    fs.writeFileSync(path.join(appRoot, 'config', 'distribution-mode.json'), '{invalid');
    expect(() => createPluginReleasePolicy({ appRoot }).assertAllowed('tts'))
      .toThrow(expect.objectContaining({ code: 'PLUGIN_RELEASE_POLICY_INVALID' }));
  });

  test('guards closed-beta plugin assets and canonical API routes only in public mode', async () => {
    const pluginRoot = path.join(root, 'plugins');
    writePlugin(pluginRoot, 'music-bot');
    writePlugin(pluginRoot, 'stream-monsters');
    writePlugin(pluginRoot, 'renamed-source');
    writeJson(path.join(pluginRoot, 'renamed-source', 'plugin.json'), {
      id: 'music-bot', name: 'Music Bot', entry: 'index.js'
    });
    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'public' });
    const policy = createPluginReleasePolicy({ appRoot });
    const app = express();
    app.use(policy.createRequestGuard({ pluginsDir: pluginRoot }));
    app.use('/plugins', express.static(pluginRoot));
    app.get('/api/plugins/music-bot/status', (_req, res) => res.json({ live: true }));
    app.get('/api/plugins/tts/status', (_req, res) => res.json({ live: true }));

    await request(app).get('/plugins/music-bot/plugin.json').expect(404);
    await request(app).get('/Plugins/Music-Bot/plugin.json').expect(404);
    await request(app).get('/plugins/streamalchemy/plugin.json').expect(404);
    await request(app).get('/plugins/renamed-source/plugin.json').expect(404);
    await request(app).get('/api/plugins/music-bot/status').expect(404);
    await request(app).get('/api/plugins/tts/status').expect(200);

    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'local' });
    const localApp = express();
    localApp.use(createPluginReleasePolicy({ appRoot }).createRequestGuard({ pluginsDir: pluginRoot }));
    localApp.use('/plugins', express.static(pluginRoot));
    localApp.get('/api/plugins/music-bot/status', (_req, res) => res.json({ live: true }));
    await request(localApp).get('/plugins/music-bot/plugin.json').expect(200);
    await request(localApp).get('/api/plugins/music-bot/status').expect(200);
  });

  test('server wires the request guard before static assets and plugin routes', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const guardIndex = source.indexOf('app.use(createPluginReleasePolicy({ appRoot: __dirname }).createRequestGuard({ pluginsDir: () => pluginsDir }))');
    const publicStaticIndex = source.indexOf("app.use(express.static(path.join(__dirname, 'public')))");
    const pluginRoutesIndex = source.indexOf('setupPluginRoutes(app, pluginLoader');
    const pluginStaticIndex = source.indexOf("app.use('/plugins', express.static(pluginsDir))");

    expect(guardIndex).toBeGreaterThan(-1);
    expect(publicStaticIndex).toBeGreaterThan(guardIndex);
    expect(pluginRoutesIndex).toBeGreaterThan(guardIndex);
    expect(pluginStaticIndex).toBeGreaterThan(guardIndex);
  });

  test('rejects a closed-beta manifest through the original Express ZIP upload route before install', async () => {
    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'public' });
    const pluginsDir = path.join(root, 'installed-plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    const uploadDir = path.join(root, 'uploads');
    const loader = new PluginLoader(
      pluginsDir, express(), { emit: jest.fn(), sockets: { sockets: new Map() } }, {},
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      { getPluginDataDir: id => path.join(root, 'data', id) },
      null,
      { releasePolicy: { appRoot } }
    );
    const app = express();
    app.use(loader.releasePolicy.createRequestGuard());
    setupPluginRoutes(app, loader, (_req, _res, next) => next(), (_req, _res, next) => next(),
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() }, null, null, {
        pluginUploadDir: uploadDir,
        storeAuth: (_req, _res, next) => next(),
        freshStoreAuth: (_req, _res, next) => next()
      });

    const packageDir = path.join(root, 'music-bot-package');
    writePlugin(root, 'music-bot-package');
    writeJson(path.join(packageDir, 'plugin.json'), {
      id: 'music-bot', name: 'Music Bot', version: '1.0.0', entry: 'index.js'
    });
    const zipPath = path.join(root, 'arbitrary-name.zip');
    await archiveFolder(packageDir, zipPath);

    await request(app).post('/api/plugins/upload').attach('plugin', zipPath).expect(400);
    expect(fs.existsSync(path.join(pluginsDir, 'music-bot'))).toBe(false);
    expect(fs.readdirSync(uploadDir)).toHaveLength(0);
  });
});
