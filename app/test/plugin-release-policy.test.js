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
const publicAssetPathOwners = require('../config/plugin-release-policy.json').publicAssetPathOwners;

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
      publicRuntimeExcluded: ['gift-catalog'],
      aliases: { streamalchemy: 'stream-monsters' },
      publicAssetPathOwners
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
    for (const id of [...closedBeta, 'chatango']) writePlugin(path.join(root, 'plugins'), id);
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
    for (const id of closedBeta) {
      expect(loader.resolvePluginInstallation(id)).toBeNull();
      expect(loader.getPlugin(id)).toBeNull();
      expect(loader.isPluginEnabledFromDisk(id)).toBe(false);
      await expect(loader.enablePlugin(id)).rejects.toMatchObject({ code: 'PLUGIN_CLOSED_BETA_PUBLIC' });
    }
    expect(loader.resolvePluginInstallation('chatango')).toBeNull();
    loader.pruneStalePluginState(inventory);
    expect(loader.state).toEqual(savedState);
    expect(saveState).not.toHaveBeenCalled();
  });

  test('runtime-only plugin IDs are not mislabeled as Closed Beta', () => {
    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'public' });
    const policy = createPluginReleasePolicy({ appRoot });
    for (const id of ['gift-catalog', 'minecraft-connect', 'webgpu-fireworks', 'fireworks']) {
      expect(closedBeta).not.toContain(id);
      expect(policy.isClosedBetaId(id)).toBe(false);
    }
    expect([...policy.getSnapshot().publicRuntimeExcludedIds]).toEqual(['gift-catalog']);
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
      ...closedBeta.map(id => ({ id, name: { en: id } })),
      { id: 'chatango', name: { en: 'Chatango' } },
      { id: 'streamalchemy', name: { en: 'Stream Monsters' } },
      { id: 'tts', name: { en: 'TTS' } }
    ] };
    const communityRegistry = { schemaVersion: 1, plugins: [
      ...closedBeta.map(id => ({ id, name: { en: id } })),
      { id: 'chatango', name: { en: 'Chatango' } },
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
    for (const id of closedBeta) {
      await expect(store.findPlugin('official', id)).rejects.toMatchObject({ code: 'PLUGIN_CLOSED_BETA_PUBLIC' });
      await expect(store.installPlugin('official', id, { plugin: { id } }))
        .rejects.toMatchObject({ code: 'PLUGIN_CLOSED_BETA_PUBLIC' });
    }
    await expect(store.findPlugin('official', 'chatango')).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });
    await expect(store.installPlugin('official', 'chatango', { plugin: { id: 'chatango' } }))
      .rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });
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
    for (const id of [...closedBeta, 'chatango']) writePlugin(pluginRoot, id);
    writePlugin(pluginRoot, 'tts');
    writePlugin(pluginRoot, 'renamed-source');
    writeJson(path.join(pluginRoot, 'renamed-source', 'plugin.json'), {
      id: 'music-bot', name: 'Music Bot', entry: 'index.js'
    });
    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'public' });
    const policy = createPluginReleasePolicy({ appRoot });
    const app = express();
    app.use(policy.createRequestGuard({ pluginsDir: pluginRoot }));
    app.use('/plugins', express.static(pluginRoot));
    app.get('/api/plugins/:pluginId/status', (_req, res) => res.json({ live: true }));

    for (const id of [...closedBeta, 'chatango', 'streamalchemy']) {
      await request(app).get(`/plugins/${id}/plugin.json`).expect(404);
      await request(app).get(`/api/plugins/${id}/status`).expect(404);
    }
    await request(app).get('/Plugins/Music-Bot/plugin.json').expect(404);
    await request(app).get('/plugins/renamed-source/plugin.json').expect(404);
    await request(app).get('/api/plugins/tts/status').expect(200);

    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'local' });
    const localApp = express();
    localApp.use(createPluginReleasePolicy({ appRoot }).createRequestGuard({ pluginsDir: pluginRoot }));
    localApp.use('/plugins', express.static(pluginRoot));
    localApp.get('/api/plugins/music-bot/status', (_req, res) => res.json({ live: true }));
    await request(localApp).get('/plugins/music-bot/plugin.json').expect(200);
    await request(localApp).get('/api/plugins/music-bot/status').expect(200);
  });

  test('guards only mapped public assets by their existing closed-beta plugin policy', async () => {
    const publicDir = path.join(root, 'public');
    for (const assetPath of Object.keys(publicAssetPathOwners)) {
      const relativePath = assetPath.replace(/^\//, '');
      const assetFile = path.join(publicDir, relativePath);
      fs.mkdirSync(path.dirname(assetFile), { recursive: true });
      fs.writeFileSync(assetFile, 'asset');
    }
    fs.mkdirSync(path.join(publicDir, 'js'), { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'js', 'unrelated.js'), 'public');

    const createApp = () => {
      const app = express();
      app.use(createPluginReleasePolicy({ appRoot }).createRequestGuard());
      app.use(express.static(publicDir));
      return app;
    };

    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'public' });
    const publicPolicy = createPluginReleasePolicy({ appRoot });
    expect(publicPolicy.getSnapshot().publicMode).toBe(true);
    expect([...publicPolicy.getSnapshot().publicAssetPathOwners.keys()]).toEqual(Object.keys(publicAssetPathOwners));
    const publicApp = createApp();
    for (const assetPath of Object.keys(publicAssetPathOwners)) {
      await request(publicApp).get(assetPath).expect(404);
    }
    await request(publicApp).get('/js/%6fsc-bridge-ui.js').expect(404);
    const publicUnrelated = await request(publicApp).get('/js/unrelated.js').expect(200);
    expect(publicUnrelated.text).toBe('public');

    writeJson(path.join(appRoot, 'config', 'distribution-mode.json'), { channel: 'local' });
    const localApp = createApp();
    for (const assetPath of Object.keys(publicAssetPathOwners)) {
      const response = await request(localApp).get(assetPath).expect(200);
      const content = Buffer.isBuffer(response.body) ? response.body.toString('utf8') : response.text;
      expect(content).toBe('asset');
    }

    fs.writeFileSync(path.join(appRoot, 'config', 'distribution-mode.json'), '{invalid');
    const unknownModeApp = createApp();
    await request(unknownModeApp).get('/js/osc-bridge-ui.js').expect(404);
    const unknownUnrelated = await request(unknownModeApp).get('/js/unrelated.js').expect(200);
    expect(unknownUnrelated.text).toBe('public');
  });

  test('server wires the request guard before static assets and plugin routes', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const guardIndex = source.indexOf('app.use(pluginReleasePolicy.createRequestGuard({');
    const publicStaticIndex = source.indexOf("app.use(express.static(path.join(__dirname, 'public')))");
    const pluginRoutesIndex = source.indexOf('setupPluginRoutes(app, pluginLoader');
    const pluginStaticIndex = source.indexOf("app.use('/plugins', express.static(pluginsDir))");

    expect(guardIndex).toBeGreaterThan(-1);
    expect(publicStaticIndex).toBeGreaterThan(guardIndex);
    expect(pluginRoutesIndex).toBeGreaterThan(guardIndex);
    expect(pluginStaticIndex).toBeGreaterThan(guardIndex);
    expect(source).toContain('pluginReleasePolicy.createRequestGuard');
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
