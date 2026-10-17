const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const SchnorrbecherPlugin = require('../main');

function createApi(dataDir, legacyDir = dataDir) {
  const app = express();
  app.use(express.json());
  const routes = express.Router();
  app.use(routes);
  const emissions = [];
  const tikTokEvents = new Map();
  const socketEvents = new Map();
  const socketConnections = [];
  const registerRoute = jest.fn((method, route, handler) => {
    routes[method.toLowerCase()](route, handler);
  });

  return {
    app,
    emissions,
    tikTokEvents,
    socketEvents,
    socketConnections,
    getSocketIO: () => ({ emit: (event, payload) => emissions.push({ event, payload }) }),
    emit: (event, payload) => emissions.push({ event, payload }),
    getPluginDataDir: () => dataDir,
    getConfigPathManager: () => ({ getPluginDataDir: () => legacyDir }),
    ensurePluginDataDir: () => {},
    getDatabase: () => ({
      getGift: id => id === 'rose' ? { id: 'rose', name: 'Rose', image_url: 'https://catalog.example/rose.png' } : null,
      getGiftCatalog: () => [{ id: 'rose', name: 'Rose', image_url: 'https://catalog.example/rose.png' }]
    }),
    log: jest.fn(),
    registerRoute,
    registerTikTokEvent: jest.fn((event, handler) => tikTokEvents.set(event, handler)),
    registerSocket: jest.fn((event, handler) => socketEvents.set(event, handler)),
    registerSocketConnection: jest.fn(handler => socketConnections.push(handler))
  };
}

describe('Schnorrbecher plugin integration', () => {
  let dataDir;
  let api;
  let plugin;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schnorrbecher-plugin-'));
    api = createApi(dataDir);
    plugin = new SchnorrbecherPlugin(api);
    await plugin.init();
  });

  afterEach(() => {
    plugin.destroy();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('serves state, adds values, resets and registers the exact OBS route', async () => {
    await request(api.app)
      .post('/api/coin-jar/add')
      .send({ value: 100, giftId: 'rose' })
      .expect(200)
      .expect(response => expect(response.body.result.totalValue).toBe(100));

    await request(api.app)
      .get('/api/coin-jar/state')
      .expect(200)
      .expect(response => {
        expect(response.body.state.totalCoinValue).toBe(100);
        expect(response.body.physicalCoinCount).toBe(10);
      });

    await request(api.app).post('/api/coin-jar/reset').send({}).expect(200);
    expect(api.registerRoute).toHaveBeenCalledWith('get', '/overlay/coincup', expect.any(Function));
    expect(api.registerRoute).toHaveBeenCalledWith('get', '/schnorrbecher/ui', expect.any(Function));
    expect(api.registerTikTokEvent).toHaveBeenCalledWith('gift', expect.any(Function));
    expect(api.registerSocket).toHaveBeenCalledWith('coinJar.sync.request', expect.any(Function));
  });

  test('enriches TikTok gifts from the local catalog and emits a visual command', async () => {
    await api.tikTokEvents.get('gift')({
      eventId: 'gift-rose',
      giftId: 'rose',
      diamondValue: 1,
      repeatCount: 1,
      repeatEnd: true
    });

    expect(api.emissions).toContainEqual(expect.objectContaining({
      event: 'coinJar.add',
      payload: expect.objectContaining({
        giftImage: 'https://catalog.example/rose.png',
        totalValue: 1
      })
    }));
  });

  test('uses a catalog gift image for the Test Gift action', async () => {
    await request(api.app)
      .post('/api/coin-jar/test-gift')
      .send({ value: 100 })
      .expect(200)
      .expect(response => {
        expect(response.body.result).toMatchObject({
          giftId: 'rose',
          giftName: 'Rose',
          giftImage: 'https://catalog.example/rose.png'
        });
      });
  });

  test('previews and explicitly imports legacy config while preserving the shared original', async () => {
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schnorrbecher-legacy-'));
    const legacyConfig = path.join(legacyDir, 'coin-jar-config.json');
    const legacyState = path.join(legacyDir, 'coin-jar-state.json');
    fs.writeFileSync(legacyConfig, JSON.stringify({ jarLabel: 'Legacy retained', persistenceMode: 'session' }));
    fs.writeFileSync(legacyState, JSON.stringify({ totalCoinValue: 987 }));
    plugin.destroy();
    api = createApi(dataDir, legacyDir);
    plugin = new SchnorrbecherPlugin(api);
    await plugin.init();

    const preview = await request(api.app).get('/api/coin-jar/legacy-data/preview').expect(200);
    expect(preview.body.config.canImport).toBe(true);
    expect(preview.body.state.importAllowed).toBe(false);
    await request(api.app).post('/api/coin-jar/legacy-data/import')
      .send({ confirm: true, includeConfig: false, includePersistentState: true }).expect(409);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'coin-jar-state.json'), 'utf8')).totalCoinValue).toBe(0);
    await request(api.app).post('/api/coin-jar/legacy-data/import')
      .send({ confirm: true, includeConfig: true, includePersistentState: false }).expect(200);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'coin-jar-config.json'), 'utf8')).jarLabel).toBe('Legacy retained');
    expect(fs.readFileSync(legacyConfig, 'utf8')).toContain('Legacy retained');
    fs.rmSync(legacyDir, { recursive: true, force: true });
  });

  test('imports explicitly selected persistent state over only a verified empty initialization file', async () => {
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schnorrbecher-persistent-legacy-'));
    fs.writeFileSync(path.join(legacyDir, 'coin-jar-config.json'), JSON.stringify({ jarLabel: 'Persistent legacy', persistenceMode: 'persistent' }));
    fs.writeFileSync(path.join(legacyDir, 'coin-jar-state.json'), JSON.stringify({ totalCoinValue: 321, visualCoinCount: 4 }));
    plugin.destroy();
    api = createApi(dataDir, legacyDir);
    plugin = new SchnorrbecherPlugin(api);
    await plugin.init();

    const preview = await request(api.app).get('/api/coin-jar/legacy-data/preview').expect(200);
    expect(preview.body.state.importAllowed).toBe(true);
    expect(preview.body.state.targetIsInitializedEmpty).toBe(true);
    await request(api.app).post('/api/coin-jar/legacy-data/import')
      .send({ confirm: true, includeConfig: true, includePersistentState: true }).expect(200);
    expect(plugin.engine.state.totalCoinValue).toBe(321);
    expect(JSON.parse(fs.readFileSync(path.join(legacyDir, 'coin-jar-state.json'), 'utf8')).totalCoinValue).toBe(321);
    fs.rmSync(legacyDir, { recursive: true, force: true });
  });

  test('sends state to a reconnecting overlay and routes local socket commands through the engine', () => {
    const overlaySocket = { emit: jest.fn() };
    api.socketEvents.get('coinJar.sync.request')(overlaySocket);
    expect(overlaySocket.emit).toHaveBeenCalledWith('coinJar.sync', expect.objectContaining({
      totalCoinValue: 0,
      config: expect.any(Object)
    }));

    api.socketEvents.get('coinJar.add')(overlaySocket, { value: 50, eventId: 'socket-add' });
    expect(plugin.getStatus().state.totalCoinValue).toBe(50);
    api.socketEvents.get('coinJar.reset')(overlaySocket, { reason: 'socket' });
    expect(plugin.getStatus().state.totalCoinValue).toBe(0);
  });

  test('keeps the live status transient while persistent jar data survives', async () => {
    plugin.config = plugin.store.saveConfig({ ...plugin.config, persistenceMode: 'persistent' });
    plugin._handleAdd({ value: 200, eventId: 'persistent-live' });
    api.tikTokEvents.get('streamSessionStarted')({ streamIdentity: 'room:persistent', isNewStream: true });

    await request(api.app)
      .get('/api/coin-jar/state')
      .expect(200)
      .expect(response => {
        expect(response.body.livestreamStatus).toBe('active');
        expect(response.body.state.totalCoinValue).toBe(200);
      });

    const overlaySocket = { emit: jest.fn() };
    api.socketEvents.get('coinJar.sync.request')(overlaySocket);
    expect(overlaySocket.emit).toHaveBeenCalledWith('coinJar.sync', expect.objectContaining({
      livestreamStatus: 'active'
    }));

    await request(api.app).post('/api/coin-jar/event-cache/clear').send({}).expect(200);
    expect(api.emissions.at(-1)).toMatchObject({
      event: 'coinJar.sync',
      payload: expect.objectContaining({
        config: expect.any(Object),
        livestreamStatus: 'active'
      })
    });

    api.tikTokEvents.get('disconnected')({ reason: 'test' });
    expect(plugin.getStatus().livestreamStatus).toBe('waiting');
  });

  test('validates config and tracks renderer telemetry for the admin status', async () => {
    await request(api.app)
      .post('/api/coin-jar/config')
      .send({ maxPhysicalIcons: 99999, jarLabel: 'My Jar' })
      .expect(200)
      .expect(response => expect(response.body.config.maxPhysicalIcons).toBe(3000));

    api.socketEvents.get('coinJar.telemetry')({}, { physicalCoinCount: 200, pendingSpawns: 7 });
    expect(plugin.getStatus()).toMatchObject({ physicalCoinCount: 200, pendingSpawns: 7 });
  });

  test('synchronizes the same state to two concurrently opened overlays', () => {
    plugin._handleAdd({ value: 500, eventId: 'shared-state' });
    const firstOverlay = { emit: jest.fn() };
    const secondOverlay = { emit: jest.fn() };

    api.socketEvents.get('coinJar.sync.request')(firstOverlay);
    api.socketEvents.get('coinJar.sync.request')(secondOverlay);

    const firstPayload = firstOverlay.emit.mock.calls[0][1];
    const secondPayload = secondOverlay.emit.mock.calls[0][1];
    expect(firstPayload.totalCoinValue).toBe(500);
    expect(secondPayload).toEqual(firstPayload);
  });

  test('declares generated branding and glass assets and exposes an enabled-only Visual FX view', () => {
    const pluginRoot = path.join(__dirname, '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf8'));
    const dashboardHtml = fs.readFileSync(path.join(pluginRoot, '..', '..', 'public', 'dashboard.html'), 'utf8');
    const readme = fs.readFileSync(path.join(pluginRoot, 'README.md'), 'utf8');

    expect(manifest.icon).toBe('/plugins/schnorrbecher/assets/branding/schnorrbecher-icon.png');
    expect(manifest.logo).toBe('/plugins/schnorrbecher/assets/branding/schnorrbecher-logo.png');
    for (const asset of [
      'branding/schnorrbecher-icon.png',
      'branding/schnorrbecher-logo.png',
      'jars/classic.png',
      'jars/mason.png',
      'jars/arcade.png'
    ]) {
      expect(fs.existsSync(path.join(pluginRoot, 'assets', asset))).toBe(true);
    }
    expect(dashboardHtml).toContain('data-view="schnorrbecher"');
    expect(dashboardHtml).toContain('data-plugin="schnorrbecher"');
    expect(dashboardHtml).toContain('data-src="/schnorrbecher/ui"');
    expect(readme).toContain('maxCoins=<20-3000>');
    expect(readme).toContain('5000+ Coins');
  });
});
