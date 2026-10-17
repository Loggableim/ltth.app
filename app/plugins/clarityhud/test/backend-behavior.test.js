const EventEmitter = require('events');

class MockTikTokConnector extends EventEmitter {
  constructor() {
    super();
    this.username = null;
    this.connected = false;
    MockTikTokConnector.instances.push(this);
  }

  async connect(username, options = {}) {
    this.username = username;
    this.connectOptions = options;
    if (MockTikTokConnector.failUsernames.has(username)) {
      throw MockTikTokConnector.failUsernames.get(username);
    }
    this.connected = true;
    this.emit('connected', { username });
  }

  async disconnect() {
    this.connected = false;
    this.emit('disconnected', { username: this.username });
  }

  isActive() {
    return this.connected;
  }
}

MockTikTokConnector.instances = [];
MockTikTokConnector.failUsernames = new Map();

jest.mock('../../../modules/tiktok', () => MockTikTokConnector);

const ClarityHUDBackend = require('../backend/api');
const ClarityHUDPlugin = require('../main');
const schema = require('../lib/settings-schema');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function createBackend() {
  const routes = new Map();
  const config = {};
  const api = {
    getConfig: jest.fn(async (key) => config[key] || null),
    setConfig: jest.fn(async (key, value) => {
      config[key] = value;
    }),
    registerRoute: jest.fn((method, route, handler) => {
      routes.set(`${method.toLowerCase()} ${route}`, handler);
    }),
    emit: jest.fn(),
    log: jest.fn(),
    getSocketIO: jest.fn(() => ({})),
    getDatabase: jest.fn(() => ({
      getSetting: jest.fn(() => null),
      getGift: jest.fn(() => null),
      getGiftCatalog: jest.fn(() => [])
    }))
  };

  const backend = new ClarityHUDBackend(api);
  backend.registerRoutes();
  return { backend, api, routes, config };
}

async function callRoute(routes, key, req = {}) {
  const handler = routes.get(key);
  expect(handler).toBeDefined();
  const res = createResponse();
  await handler({
    params: {},
    body: {},
    ...req
  }, res);
  return res;
}

describe('ClarityHUD backend behavior', () => {
  beforeEach(() => {
    MockTikTokConnector.instances = [];
    MockTikTokConnector.failUsernames = new Map();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('uses a shared settings schema with the plugin version and defaults', () => {
    expect(schema.VERSION).toBe('1.1.0');
    expect(schema.DEFAULT_SETTINGS.chat.maxLines).toBeGreaterThan(0);
    expect(schema.DEFAULT_SETTINGS.full.likeAggregationWindowMs).toBeGreaterThan(0);
    expect(schema.DEFAULT_SETTINGS.multi.reconnectMaxAttempts).toBeGreaterThan(0);
  });

  test('does not map raw superfan to subscribe while normal subscribe events still work', async () => {
    const { api, backend } = createBackend();
    const handlers = new Map();
    api.registerTikTokEvent = jest.fn((eventName, handler) => handlers.set(eventName, handler));
    const plugin = new ClarityHUDPlugin(api);
    plugin.backend = backend;
    plugin.registerEventListeners();

    expect(handlers.has('superfan')).toBe(false);
    expect(handlers.has('subscribe')).toBe(true);

    const emitTikTokEvent = async (eventName, data) => handlers.get(eventName)?.(data);
    await emitTikTokEvent('superfan', { nickname: 'Raw SuperFan payload', userId: 'private-id' });
    expect(backend.eventQueues.subscribe).toEqual([]);
    expect(api.emit).not.toHaveBeenCalledWith('clarityhud.update.subscribe', expect.anything());

    await emitTikTokEvent('subscribe', { nickname: 'Real subscriber', uniqueId: 'subscriber-1' });
    expect(backend.eventQueues.subscribe).toHaveLength(1);
    expect(api.emit).toHaveBeenCalledWith('clarityhud.update.subscribe', expect.objectContaining({
      username: 'Real subscriber'
    }));
  });

  test('rejects invalid settings without persisting them', async () => {
    const { api, routes } = createBackend();

    const res = await callRoute(routes, 'post /api/clarityhud/settings/:dock', {
      params: { dock: 'chat' },
      body: {
        maxLines: 10000,
        fontSize: 'url(javascript:alert(1))',
        backgroundColor: 'definitely-not-a-color',
        unknownSetting: true
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.validationErrors).toEqual(expect.arrayContaining([
      expect.stringContaining('maxLines'),
      expect.stringContaining('fontSize'),
      expect.stringContaining('backgroundColor'),
      expect.stringContaining('unknownSetting')
    ]));
    expect(api.setConfig).not.toHaveBeenCalled();
  });

  test('accepts valid settings and strips unknown-free payloads through the schema', async () => {
    const { api, routes } = createBackend();

    const res = await callRoute(routes, 'post /api/clarityhud/settings/:dock', {
      params: { dock: 'chat' },
      body: {
        maxLines: 12,
        fontSize: '52px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        transparency: 80
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.settings).toEqual(expect.objectContaining({
      maxLines: 12,
      fontSize: '52px',
      transparency: 80
    }));
    expect(api.setConfig).toHaveBeenCalledWith('clarityhud.settings.chat', expect.objectContaining({
      maxLines: 12
    }));
  });

  test('sends multi-stream test events from the API', async () => {
    const { api, routes } = createBackend();

    const res = await callRoute(routes, 'post /api/clarityhud/test/multi', {
      body: { type: 'chat' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(api.emit).toHaveBeenCalledWith('clarityhud:multi:chat', expect.objectContaining({
      sourceId: 'test',
      sourceLabel: 'Test Stream',
      message: expect.stringContaining('test')
    }));
  });

  test('exports and imports complete ClarityHUD profiles', async () => {
    const { api, routes } = createBackend();

    const exported = await callRoute(routes, 'get /api/clarityhud/profile/export');
    expect(exported.body.profile).toEqual(expect.objectContaining({
      plugin: 'clarityhud',
      version: '1.1.0',
      settings: expect.objectContaining({
        chat: expect.any(Object),
        full: expect.any(Object),
        multi: expect.any(Object),
        stream: expect.any(Object)
      })
    }));

    const imported = await callRoute(routes, 'post /api/clarityhud/profile/import', {
      body: {
        profile: {
          plugin: 'clarityhud',
          settings: {
            chat: { maxLines: 7 },
            full: { likeAggregationWindowMs: 750 },
            multi: { maxMessages: 250 },
            stream: { tickerEnabled: true }
          }
        }
      }
    });

    expect(imported.statusCode).toBe(200);
    expect(imported.body.success).toBe(true);
    expect(api.setConfig).toHaveBeenCalledWith('clarityhud.settings.chat', expect.objectContaining({
      maxLines: 7
    }));
    expect(api.emit).toHaveBeenCalledWith('clarityhud.settings.full', expect.objectContaining({
      likeAggregationWindowMs: 750
    }));
  });

  test('round-trips its full export, including boolean color options and an empty preset list', async () => {
    const { api, routes, backend } = createBackend();
    backend.customPresets = [];
    const exported = await callRoute(routes, 'get /api/clarityhud/profile/export');
    const imported = await callRoute(routes, 'post /api/clarityhud/profile/import', {
      body: { profile: exported.body.profile }
    });

    expect(imported.statusCode).toBe(200);
    expect(imported.body.success).toBe(true);
    expect(api.setConfig).toHaveBeenCalledWith('clarityhud.customPresets', []);
  });

  test('restores an explicitly empty preset list and persists the clearing operation', async () => {
    const { api, routes, backend } = createBackend();
    backend.customPresets = [{ id: 'custom-old', name: 'Old', settings: {} }];
    const imported = await callRoute(routes, 'post /api/clarityhud/profile/import', {
      body: { profile: { plugin: 'clarityhud', settings: {}, customPresets: [] } }
    });

    expect(imported.statusCode).toBe(200);
    expect(imported.body.customPresets).toEqual([]);
    expect(api.setConfig).toHaveBeenCalledWith('clarityhud.customPresets', []);
  });

  test('stores custom presets through the presets API', async () => {
    const { api, routes } = createBackend();

    const saved = await callRoute(routes, 'post /api/clarityhud/presets', {
      body: {
        name: 'My VR Preset',
        settings: {
          chat: { fontSize: '56px', maxLines: 8 },
          full: { reduceMotion: true }
        }
      }
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.body.success).toBe(true);
    expect(saved.body.preset).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^custom-/),
      name: 'My VR Preset'
    }));
    expect(api.setConfig).toHaveBeenCalledWith('clarityhud.customPresets', expect.arrayContaining([
      expect.objectContaining({ name: 'My VR Preset' })
    ]));

    const listed = await callRoute(routes, 'get /api/clarityhud/presets');
    expect(listed.body.presets.builtin).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'vrchat-readable' })
    ]));
  });

  test('uses the configured like aggregation window', async () => {
    jest.useFakeTimers();
    const { backend, api } = createBackend();
    backend.settings.full.showLikes = true;
    backend.settings.full.likeAggregationWindowMs = 100;

    await backend.handleLikeEvent({ uniqueId: 'viewer1', nickname: 'Viewer One', likeCount: 3 });
    expect(api.emit).not.toHaveBeenCalledWith('clarityhud.update.like', expect.any(Object));

    jest.advanceTimersByTime(99);
    expect(api.emit).not.toHaveBeenCalledWith('clarityhud.update.like', expect.any(Object));

    jest.advanceTimersByTime(1);
    expect(api.emit).toHaveBeenCalledWith('clarityhud.update.like', expect.objectContaining({
      likeCount: 3,
      userCount: 1
    }));
  });

  test('can defer gift streak display until the final repeat event', async () => {
    const { backend, api } = createBackend();
    backend.settings.full.showGifts = true;
    backend.settings.full.giftStreakMode = 'finalOnly';

    await backend.handleGiftEvent({
      uniqueId: 'gifter',
      nickname: 'Gifter',
      giftName: 'Rose',
      repeatCount: 1,
      coins: 1,
      repeatEnd: false
    });

    expect(api.emit).not.toHaveBeenCalledWith('clarityhud.update.gift', expect.any(Object));

    await backend.handleGiftEvent({
      uniqueId: 'gifter',
      nickname: 'Gifter',
      giftName: 'Rose',
      repeatCount: 5,
      coins: 5,
      repeatEnd: true
    });

    expect(api.emit).toHaveBeenCalledWith('clarityhud.update.gift', expect.objectContaining({
      gift: expect.objectContaining({
        name: 'Rose',
        count: 5
      })
    }));
  });

  test('tracks multi-stream connection status and failed reconnect attempts', async () => {
    MockTikTokConnector.failUsernames.set('offline_stream', new Error('Unable to connect to offline_stream'));
    const { backend, routes } = createBackend();
    backend.settings.multi.enabled = true;
    backend.settings.multi.reconnectMaxAttempts = 2;
    backend.settings.multi.reconnectBaseDelayMs = 25;
    backend.settings.multi.streams = [
      {
        enabled: true,
        username: 'online_stream',
        displayName: 'Online',
        textColor: '#ffffff',
        bgColor: '#000000',
        accentColor: '#00ff00'
      },
      {
        enabled: true,
        username: 'offline_stream',
        displayName: 'Offline',
        textColor: '#ffffff',
        bgColor: '#000000',
        accentColor: '#ff0000'
      }
    ];

    await backend.reconnectMultiStreams();

    const statusRes = await callRoute(routes, 'get /api/clarityhud/multi/status');
    expect(statusRes.body.streams).toEqual([
      expect.objectContaining({ username: 'online_stream', status: 'connected', attempts: 0 }),
      expect.objectContaining({ username: 'offline_stream', status: 'reconnecting', attempts: 1, nextRetryAt: expect.any(Number) })
    ]);

    await backend.cleanup();
  });

  test('requires explicit fallback-key confirmation and passes it through only after user approval', async () => {
    const fallbackError = new Error('Fallback-Key-Bestätigung erforderlich');
    fallbackError.connectionStatus = 'fallback_confirmation_required';
    MockTikTokConnector.failUsernames.set('audit_secondary', fallbackError);
    const { backend, routes } = createBackend();
    backend.settings.multi.streams = [{
      enabled: true, username: 'audit_secondary', displayName: 'Audit secondary',
      textColor: '#ffffff', bgColor: '#000000', accentColor: '#00ff00'
    }];

    await backend.connectMultiStream(0, 0);
    expect(MockTikTokConnector.instances[0].connectOptions).toEqual({});
    expect(backend.getMultiStreamStatus()[0]).toMatchObject({ status: 'failed', confirmationRequired: true });
    expect(backend.multiStreamReconnectTimers.size).toBe(0);

    const rejected = await callRoute(routes, 'post /api/clarityhud/multi/confirm-fallback/:index', {
      params: { index: '0' }, body: { confirmed: false }
    });
    expect(rejected.statusCode).toBe(400);
    expect(MockTikTokConnector.instances).toHaveLength(1);

    MockTikTokConnector.failUsernames.delete('audit_secondary');
    const accepted = await callRoute(routes, 'post /api/clarityhud/multi/confirm-fallback/:index', {
      params: { index: '0' }, body: { confirmed: true }
    });
    expect(accepted.body.success).toBe(true);
    expect(MockTikTokConnector.instances[1].connectOptions).toEqual({ fallbackKeyConfirmed: true });
    expect(backend.getMultiStreamStatus()[0]).toMatchObject({ status: 'connected', confirmationRequired: false });
    await backend.cleanup();
  });
});
