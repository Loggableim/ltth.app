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

  test('reset rotates the public overlay token while preserving separate internal session persistence', async () => {
    const api = createMockApi();
    const plugin = new LastEventSpotlightPlugin(api);
    const oldSessionId = plugin.sessionId;
    const oldOverlayToken = plugin.overlaySessionToken;
    plugin.registerRoutes();

    const response = createMockResponse();
    await api.routes.get('POST /api/lastevent/reset-session')({ params: {}, query: {} }, response);

    expect(plugin.sessionId).not.toBe(oldSessionId);
    expect(plugin.overlaySessionToken).not.toBe(oldOverlayToken);
    expect(api.setConfig).toHaveBeenCalledWith('session:id', plugin.sessionId);
    expect(response.body).not.toHaveProperty('sessionId');
    expect(api.emit).toHaveBeenCalledWith('lastevent.session.reset', expect.objectContaining({
      overlaySessionToken: plugin.overlaySessionToken
    }));
    const resetPayload = api.emit.mock.calls.find(([name]) => name === 'lastevent.session.reset')[1];
    expect(resetPayload).not.toHaveProperty('sessionId');
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
      overlaySessionToken: plugin.overlaySessionToken,
      users: {
        follower: { ...plugin.lastUsers.follower, overlaySessionToken: plugin.overlaySessionToken },
        topgift: { ...plugin.lastUsers.topgift, overlaySessionToken: plugin.overlaySessionToken }
      }
    });
  });

  test('public LastEvent responses expose only renderer display fields', async () => {
    const api = createMockApi();
    const plugin = new LastEventSpotlightPlugin(api);
    plugin.lastUsers.chatter = {
      uniqueId: 'private-platform-id',
      nickname: '<img id="name-injection" onerror="bad()">',
      profilePictureUrl: '/fixture/avatar.png',
      timestamp: '2026-10-07T00:00:00.000Z',
      eventType: 'chatter',
      label: 'New Chat',
      sessionId: 'fixture-private-session',
      userData: { uniqueId: 'nested-private-id' },
      internalFixture: 'must-not-leak',
      metadata: {
        message: '<script id="message-injection">bad()</script>',
        giftId: 'private-gift-id',
        giftName: '<svg id="gift-injection" onload="bad()">',
        giftPictureUrl: '/fixture/gift.png',
        giftCount: 3,
        streakLength: 3,
        coins: 15,
        privateField: 'must-not-leak'
      }
    };
    plugin.registerRoutes();

    const response = createMockResponse();
    await api.routes.get('GET /api/lastevent/last/:type')({ params: { type: 'chatter' } }, response);

    expect(response.body.user).toEqual({
      nickname: '<img id="name-injection" onerror="bad()">',
      profilePictureUrl: '/fixture/avatar.png',
      eventType: 'chatter',
      label: 'New Chat',
      overlaySessionToken: plugin.overlaySessionToken,
      metadata: {
        giftName: '<svg id="gift-injection" onload="bad()">',
        giftPictureUrl: '/fixture/gift.png',
        giftCount: 3,
        coins: 15
      }
    });
    expect(JSON.stringify(response.body)).not.toContain('private-platform-id');
    expect(JSON.stringify(response.body)).not.toContain('nested-private-id');
    expect(JSON.stringify(response.body)).not.toContain('gift-injection" onload');
    expect(JSON.stringify(response.body)).not.toContain('message-injection');
    expect(JSON.stringify(response.body)).not.toContain('must-not-leak');
    expect(JSON.stringify(response.body)).not.toContain('fixture-private-session');
    expect(JSON.stringify(response.body)).not.toContain('streakLength');
    expect(JSON.stringify(response.body)).not.toContain('private-gift-id');

    const allResponse = createMockResponse();
    await api.routes.get('GET /api/lastevent/all')({ query: { selected: 'chatter' } }, allResponse);
    expect(allResponse.body.users.chatter).toEqual(response.body.user);
    expect(allResponse.body).toHaveProperty('overlaySessionToken', plugin.overlaySessionToken);
    expect(allResponse.body).not.toHaveProperty('sessionId');
  });

  test('broadcasts the same display projection while retaining internal user state for plugin logic', async () => {
    const api = createMockApi();
    const plugin = new LastEventSpotlightPlugin(api);
    const event = {
      uniqueId: 'private-platform-id',
      nickname: '<b>Fixture Viewer</b>',
      comment: '<script>private raw chat</script>',
      profilePictureUrl: '/fixture/avatar.png'
    };

    await plugin.handleEvent('chat', 'chatter', event);

    const publicUpdate = api.emit.mock.calls.find(([name]) => name === 'lastevent.update.chatter')[1];
    const multiUpdate = api.emit.mock.calls.find(([name]) => name === 'lastevent.multihud.update')[1];
    expect(publicUpdate).toEqual({
      nickname: '<b>Fixture Viewer</b>',
      profilePictureUrl: '/fixture/avatar.png',
      eventType: 'chatter',
      label: 'New Chat',
      overlaySessionToken: plugin.overlaySessionToken,
      metadata: { giftPictureUrl: '', giftCount: 1, coins: 0 }
    });
    expect(multiUpdate).toEqual({ type: 'chatter', overlaySessionToken: plugin.overlaySessionToken, user: publicUpdate });
    expect(JSON.stringify(publicUpdate)).not.toContain('private-platform-id');
    expect(JSON.stringify(publicUpdate)).not.toContain('private raw chat');
    expect(JSON.stringify(multiUpdate)).not.toContain('private-platform-id');
    expect(JSON.stringify(multiUpdate)).not.toContain('private raw chat');
    expect(JSON.stringify(multiUpdate)).not.toContain('streakLength');
    expect(JSON.stringify(multiUpdate)).not.toContain('sessionId');
    expect(plugin.lastUsers.chatter.uniqueId).toBe('private-platform-id');
    expect(plugin.lastUsers.chatter.sessionId).toBe(plugin.sessionId);
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
