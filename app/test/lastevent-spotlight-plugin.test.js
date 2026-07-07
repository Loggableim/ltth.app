const LastEventSpotlightPlugin = require('../plugins/spotlight/main');

function createMockApi(initialConfig = {}, overrides = {}) {
  const routes = new Map();
  const config = new Map(Object.entries(initialConfig));

  const api = {
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

  return Object.assign(api, overrides);
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

describe('Spotlight plugin test events', () => {
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

  test('gift events normalize object image URLs before saving display data', () => {
    const api = createMockApi();
    const plugin = new LastEventSpotlightPlugin(api);

    const userData = plugin.extractUserData('gift', 'gifter', {
      uniqueId: 'giftuser',
      nickname: 'Gift User',
      giftName: 'Rose',
      giftId: '123',
      giftPictureUrl: {
        url: ['https://example.com/rose.png']
      },
      repeatCount: 1,
      coins: 1
    });

    expect(userData.metadata.giftPictureUrl).toBe('https://example.com/rose.png');
  });

  test('loads current session state back into top gift and gift streak trackers', async () => {
    const sessionId = 'session_existing';
    const topGift = {
      uniqueId: 'topuser',
      nickname: 'Top User',
      profilePictureUrl: '',
      timestamp: '2026-04-30T00:00:00.000Z',
      eventType: 'topgift',
      label: 'Top Gift',
      sessionId,
      metadata: {
        giftName: 'Diamond',
        giftPictureUrl: 'https://example.com/diamond.png',
        giftCount: 1,
        coins: 500
      }
    };
    const giftStreak = {
      uniqueId: 'streakuser',
      nickname: 'Streak User',
      profilePictureUrl: '',
      timestamp: '2026-04-30T00:00:05.000Z',
      eventType: 'giftstreak',
      label: 'Gift Streak',
      sessionId,
      metadata: {
        giftName: 'Rose',
        giftPictureUrl: 'https://example.com/rose.png',
        giftCount: 8,
        coins: 8,
        streakLength: 8
      }
    };

    const api = createMockApi({
      'session:id': sessionId,
      'lastuser:topgift': topGift,
      'lastuser:giftstreak': giftStreak
    });
    const plugin = new LastEventSpotlightPlugin(api);

    await plugin.loadSession();
    await plugin.loadLastUsers();

    expect(plugin.topGift).toEqual(topGift);
    expect(plugin.longestStreak).toEqual(expect.objectContaining({
      giftName: 'Rose',
      count: 8,
      user: 'streakuser',
      totalCoins: 8
    }));
    expect(plugin.currentStreak).toEqual(expect.objectContaining({
      giftName: 'Rose',
      count: 8,
      user: 'streakuser'
    }));
  });

  test('reset-session returns an error when persistence fails', async () => {
    const api = createMockApi({}, {
      setConfig: jest.fn(async () => {
        throw new Error('database unavailable');
      })
    });
    const plugin = new LastEventSpotlightPlugin(api);
    plugin.registerRoutes();

    const route = api.routes.get('POST /api/lastevent/reset-session');
    const res = createMockResponse();

    await route({ params: {}, query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual(expect.objectContaining({
      success: false,
      error: 'database unavailable'
    }));
  });

  test('all users endpoint can filter to selected event types', async () => {
    const api = createMockApi();
    const plugin = new LastEventSpotlightPlugin(api);
    plugin.lastUsers.follower = { nickname: 'Follower', eventType: 'follower' };
    plugin.lastUsers.like = { nickname: 'Like', eventType: 'like' };
    plugin.lastUsers.topgift = { nickname: 'Top Gift', eventType: 'topgift' };
    plugin.registerRoutes();

    const route = api.routes.get('GET /api/lastevent/all');
    const res = createMockResponse();

    await route({ query: { selected: 'follower,topgift,invalid,multihud' } }, res);

    expect(res.body).toEqual({
      success: true,
      sessionId: plugin.sessionId,
      users: {
        follower: plugin.lastUsers.follower,
        topgift: plugin.lastUsers.topgift
      }
    });
  });

  test('Multi-HUD settings reject an empty event selection', async () => {
    const api = createMockApi();
    const plugin = new LastEventSpotlightPlugin(api);
    plugin.registerRoutes();

    const route = api.routes.get('POST /api/lastevent/settings/:type');
    const res = createMockResponse();

    await route({
      params: { type: 'multihud' },
      body: { selectedEvents: [] }
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(expect.objectContaining({
      success: false
    }));
  });

  test('settings endpoint normalizes unsupported options and unsafe CSS values', async () => {
    const api = createMockApi();
    const plugin = new LastEventSpotlightPlugin(api);
    plugin.registerRoutes();

    const route = api.routes.get('POST /api/lastevent/settings/:type');
    const res = createMockResponse();

    await route({
      params: { type: 'follower' },
      body: {
        designVariant: 'not-real',
        fontSize: 'url(javascript:alert(1))',
        fontColor: '#fff; background: red',
        inAnimationType: 'spin-forever',
        refreshIntervalSeconds: -12
      }
    }, res);

    expect(res.body).toEqual(expect.objectContaining({
      success: true,
      settings: expect.objectContaining({
        designVariant: 'default',
        fontSize: '32px',
        fontColor: '#FFFFFF',
        inAnimationType: 'fade',
        refreshIntervalSeconds: 0
      })
    }));
  });

  test('chatter persistence is debounced but reset cancels pending writes', async () => {
    jest.useFakeTimers();
    try {
      const api = createMockApi();
      const plugin = new LastEventSpotlightPlugin(api);
      plugin.chatterPersistDelayMs = 100;

      const user = { nickname: 'Chat User', eventType: 'chatter' };

      await plugin.saveLastUser('chatter', user);

      expect(plugin.lastUsers.chatter).toEqual(expect.objectContaining(user));
      expect(api.setConfig.mock.calls.filter(([key]) => key === 'lastuser:chatter')).toHaveLength(0);

      await plugin.resetSession();
      await jest.advanceTimersByTimeAsync(100);

      expect(api.setConfig.mock.calls.filter(([key, value]) => {
        return key === 'lastuser:chatter' && value && value.nickname === 'Chat User';
      })).toHaveLength(0);
      expect(plugin.lastUsers.chatter).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
