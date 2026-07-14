const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const SchnorrbecherPlugin = require('../main');

function createApi(dataDir) {
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
    ensurePluginDataDir: () => {},
    getDatabase: () => ({
      getGift: id => id === 'rose' ? { image_url: 'https://catalog.example/rose.png' } : null
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

  test('validates config and tracks renderer telemetry for the admin status', async () => {
    await request(api.app)
      .post('/api/coin-jar/config')
      .send({ maxPhysicalIcons: 99999, jarLabel: 'My Jar' })
      .expect(200)
      .expect(response => expect(response.body.config.maxPhysicalIcons).toBe(600));

    api.socketEvents.get('coinJar.telemetry')({}, { physicalCoinCount: 200, pendingSpawns: 7 });
    expect(plugin.getStatus()).toMatchObject({ physicalCoinCount: 200, pendingSpawns: 7 });
  });
});
