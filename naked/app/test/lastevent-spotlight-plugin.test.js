const LastEventSpotlightPlugin = require('../plugins/lastevent-spotlight/main');

function createMockApi(initialConfig = {}) {
  const routes = new Map();
  const config = new Map(Object.entries(initialConfig));

  return {
    routes,
    config,
    registerRoute: jest.fn((method, routePath, handler) => {
      routes.set(`${method} ${routePath}`, handler);
    }),
    registerTikTokEvent: jest.fn(),
    getConfig: jest.fn(async key => config.get(key)),
    setConfig: jest.fn(async (key, value) => {
      config.set(key, value);
    }),
    getDatabase: jest.fn(() => null),
    emit: jest.fn(),
    log: jest.fn()
  };
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function json(payload) {
      this.body = payload;
      return this;
    }),
    sendFile: jest.fn()
  };
}

describe('LastEvent Spotlight plugin test events', () => {
  test('single-overlay test events also update Multi-HUD rotation data', async () => {
    const api = createMockApi();
    const plugin = new LastEventSpotlightPlugin(api);
    plugin.registerRoutes();

    const route = api.routes.get('POST /api/lastevent/test/:type');
    const res = createMockResponse();

    await route({ params: { type: 'follower' } }, res);

    expect(res.body).toEqual(expect.objectContaining({ success: true }));
    expect(api.setConfig).toHaveBeenCalledWith(
      'lastuser:follower',
      expect.objectContaining({ eventType: 'follower' })
    );
    expect(api.emit).toHaveBeenCalledWith(
      'lastevent.update.follower',
      expect.objectContaining({ eventType: 'follower' })
    );
    expect(api.emit).toHaveBeenCalledWith(
      'lastevent.multihud.update',
      expect.objectContaining({
        type: 'follower',
        user: expect.objectContaining({ eventType: 'follower' })
      })
    );
  });

  test('Multi-HUD test action seeds selected event types instead of an unrotated multihud pseudo-event', async () => {
    const api = createMockApi({
      'settings:multihud': {
        selectedEvents: ['follower', 'topgift'],
        rotationIntervalSeconds: 5
      }
    });
    const plugin = new LastEventSpotlightPlugin(api);
    plugin.registerRoutes();

    const route = api.routes.get('POST /api/lastevent/test/:type');
    const res = createMockResponse();

    await route({ params: { type: 'multihud' } }, res);

    expect(res.body).toEqual(expect.objectContaining({
      success: true,
      users: expect.objectContaining({
        follower: expect.objectContaining({ eventType: 'follower' }),
        topgift: expect.objectContaining({ eventType: 'topgift' })
      })
    }));
    expect(api.setConfig).toHaveBeenCalledWith(
      'lastuser:follower',
      expect.objectContaining({ eventType: 'follower' })
    );
    expect(api.setConfig).toHaveBeenCalledWith(
      'lastuser:topgift',
      expect.objectContaining({
        eventType: 'topgift',
        metadata: expect.objectContaining({
          giftName: 'Rose',
          coins: 100
        })
      })
    );
    expect(api.emit).toHaveBeenCalledWith(
      'lastevent.multihud.update',
      expect.objectContaining({
        type: 'follower',
        user: expect.objectContaining({ eventType: 'follower' })
      })
    );
    expect(api.emit).toHaveBeenCalledWith(
      'lastevent.multihud.update',
      expect.objectContaining({
        type: 'topgift',
        user: expect.objectContaining({ eventType: 'topgift' })
      })
    );
    expect(api.emit).not.toHaveBeenCalledWith('lastevent.update.multihud', expect.anything());
  });
});
