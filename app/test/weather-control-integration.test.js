const EventEmitter = require('events');
const express = require('express');
const request = require('supertest');
const WeatherControlPlugin = require('../plugins/weather-control/main');

describe('Weather Control runtime integration', () => {
  const originalAdminToken = process.env.LTTH_ADMIN_TOKEN;
  let app;
  let io;
  let api;
  let plugin;
  let flowActions;

  beforeEach(async () => {
    process.env.LTTH_ADMIN_TOKEN = 'weather-admin-token';
    app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    io = new EventEmitter();
    flowActions = new Map();

    const database = {
      getAllGiftWeatherMappings: jest.fn(() => []),
      getGiftWeatherMapping: jest.fn(() => null),
      setGiftWeatherMapping: jest.fn(),
      deleteGiftWeatherMapping: jest.fn()
    };

    api = {
      log: jest.fn(),
      getConfig: jest.fn(async () => null),
      setConfig: jest.fn(async () => true),
      getDatabase: jest.fn(() => database),
      getSocketIO: jest.fn(() => io),
      emit: jest.fn(),
      registerRoute: jest.fn((method, routePath, handler) => {
        app[method.toLowerCase()](routePath, handler);
      }),
      registerTikTokEvent: jest.fn(),
      registerFlowAction: jest.fn((name, handler) => flowActions.set(name, handler)),
      pluginLoader: { loadedPlugins: new Map() }
    };

    plugin = new WeatherControlPlugin(api);
    await plugin.init();
    api.emit.mockClear();
    api.setConfig.mockClear();
  });

  afterEach(async () => {
    if (plugin) {
      await plugin.destroy();
    }
    if (originalAdminToken === undefined) {
      delete process.env.LTTH_ADMIN_TOKEN;
    } else {
      process.env.LTTH_ADMIN_TOKEN = originalAdminToken;
    }
  });

  test('keeps the API key out of the public config response', async () => {
    const response = await request(app).get('/api/weather/config').expect(200);

    expect(response.body.config.apiKey).toBeUndefined();
    expect(response.body.config.hasApiKey).toBe(true);
  });

  test('rejects remote config mutation without global admin auth and accepts a valid token', async () => {
    await request(app)
      .post('/api/weather/config')
      .set('x-forwarded-for', '10.10.10.25')
      .send({ qualityPreset: 'low' })
      .expect(401);

    const response = await request(app)
      .post('/api/weather/config')
      .set('x-forwarded-for', '10.10.10.25')
      .set('x-ltth-admin-token', 'weather-admin-token')
      .send({ qualityPreset: 'low' })
      .expect(200);

    expect(response.body.config.qualityPreset).toBe('low');
  });

  test('broadcasts every runtime config update to already-open overlays', async () => {
    await request(app)
      .post('/api/weather/config')
      .send({ qualityPreset: 'medium', maxConcurrentEffects: 2 })
      .expect(200);

    expect(api.emit).toHaveBeenCalledWith('weather:config-changed', expect.objectContaining({
      enabled: true,
      permanentEffects: []
    }));
  });

  test('the main switch stops effects and blocks API, flow, permanent, and gamification triggers', async () => {
    plugin.config.effects.rain.permanent = true;
    plugin.activePermanentEffects.add('rain');

    await request(app)
      .post('/api/weather/config')
      .send({ enabled: false })
      .expect(200);

    expect(api.emit).toHaveBeenCalledWith('weather:stop', expect.objectContaining({
      meta: { triggeredBy: 'plugin-disabled' }
    }));
    expect(api.emit).toHaveBeenCalledWith('weather:stop-effect', expect.objectContaining({ action: 'rain' }));
    expect(plugin.getDesiredPermanentEffects()).toEqual(new Set());

    await request(app)
      .post('/api/weather/trigger')
      .send({ action: 'rain' })
      .expect(403);

    await expect(flowActions.get('weather.trigger')({ action: 'rain' })).resolves.toEqual({
      success: false,
      error: 'Weather Control is disabled'
    });
    expect(plugin.applyGamificationEvent('chat', { username: 'viewer' })).toBeNull();
  });

  test('sanitizes overlay state and removes socket listeners during destroy', async () => {
    const socket = new EventEmitter();
    expect(io.listenerCount('connection')).toBe(1);

    io.emit('connection', socket);
    api.emit.mockClear();
    socket.emit('weather:overlay-state', {
      activeEffects: [
        { type: '<img src=x onerror=alert(1)>', intensity: 99 },
        { type: 'rain', intensity: 3, duration: 999999, layer: -5 }
      ],
      fps: 999,
      particles: 999999,
      quality: 'invalid'
    });

    expect(api.emit).toHaveBeenCalledWith('weather:active-state', expect.objectContaining({
      activeEffects: [{
        type: 'rain',
        intensity: 1,
        permanent: false,
        duration: 60000,
        startedAt: 0,
        layer: 0
      }],
      fps: 240,
      particles: 10000,
      quality: 'high'
    }));

    await plugin.destroy();
    plugin = null;

    expect(io.listenerCount('connection')).toBe(0);
    expect(socket.listenerCount('weather:overlay-state')).toBe(0);
    expect(socket.listenerCount('weather:client-ready')).toBe(0);
  });

  test('cancels pending sequences and flushes gamification state during destroy', async () => {
    await request(app)
      .post('/api/weather/sequence/trigger')
      .send({
        steps: [{ action: 'rain', delay: 300000, intensity: 0.5, duration: 1000 }]
      })
      .expect(200);
    expect(plugin.sequenceTimers.size).toBe(1);

    plugin.applyGamificationEvent('chat', { username: 'viewer' });
    await plugin.destroy();
    plugin = null;

    expect(api.setConfig).toHaveBeenLastCalledWith(
      'weather_config',
      expect.objectContaining({
        gamification: expect.objectContaining({
          state: expect.objectContaining({
            communityMeter: expect.objectContaining({ total: expect.any(Number) })
          })
        })
      })
    );
  });
});
