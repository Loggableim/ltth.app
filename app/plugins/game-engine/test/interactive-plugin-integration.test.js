const GameEnginePlugin = require('../main');

function createPlugin() {
  const io = { emit: jest.fn(), on: jest.fn() };
  const routes = [];
  let connectionHandler;
  const api = {
    log: jest.fn(),
    getSocketIO: () => io,
    getDatabase: () => ({
      db: {
        exec: jest.fn(),
        prepare: jest.fn(() => ({
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn(() => [])
        }))
      }
    }),
    registerRoute: jest.fn((method, path, handler) => routes.push({ method, path, handler })),
    registerSocketConnection: jest.fn(handler => {
      connectionHandler = handler;
      return true;
    }),
    registerTikTokEvent: jest.fn(),
    pluginLoader: {
      activeProfile: 'ProfileHost',
      loadedPlugins: new Map()
    },
    tiktok: {
      currentUsername: '@LiveHost'
    }
  };
  const plugin = new GameEnginePlugin(api);
  return { plugin, api, io, routes, getConnectionHandler: () => connectionHandler };
}

function socket(role = 'admin') {
  const handlers = new Map();
  return {
    handshake: {
      address: '127.0.0.1',
      auth: { role },
      headers: { referer: role === 'admin' ? 'http://localhost:3000/game-engine/ui' : 'http://localhost:3000/overlay/game-engine/unified' }
    },
    on: jest.fn((event, handler) => handlers.set(event, handler)),
    emit: jest.fn(),
    trigger(event, payload) {
      return handlers.get(event)?.(payload);
    }
  };
}

describe('GameEnginePlugin interactive controller integration', () => {
  test('resolves the host name from live TikTok, profile, then fallback', () => {
    const { plugin, api } = createPlugin();

    expect(plugin._resolveHostDisplayName()).toBe('LiveHost');
    api.tiktok.currentUsername = '';
    expect(plugin._resolveHostDisplayName()).toBe('ProfileHost');
    api.pluginLoader.activeProfile = '';
    expect(plugin._resolveHostDisplayName()).toBe('Streamer');
  });

  test.each(['c', '!c', 'c4 c', '/c4 c'])('routes a live host chat column %s through the revisioned Connect4 host move', command => {
    const { plugin } = createPlugin();
    plugin.db = {
      getGameConfig: jest.fn(() => null),
      getTriggers: jest.fn(() => [])
    };
    plugin.wheelGame = {
      findWheelByChatCommand: jest.fn(() => null)
    };
    plugin.slotGame = {
      findMachineByChatCommand: jest.fn(() => null)
    };
    plugin.interactiveController = {
      getState: jest.fn(() => ({
        display: {
          displaySessionId: 11,
          gameType: 'connect4',
          sessionRevision: 2,
          displayRevision: 2
        }
      })),
      applyHostMove: jest.fn(() => ({ success: true, sessionId: 11 }))
    };
    plugin.handleViewerMove = jest.fn();

    plugin.handleChatCommand({
      username: 'LiveHost',
      userId: '7421356832385664032',
      nickname: 'Cid',
      comment: command,
      msgId: `host-${command}`
    });

    expect(plugin.interactiveController.applyHostMove).toHaveBeenCalledWith({
      sessionId: 11,
      gameType: 'connect4',
      sessionRevision: 2,
      displayRevision: 2,
      move: { column: 'C' },
      moveIdentity: `chat:host-${command}`
    });
    expect(plugin.handleViewerMove).not.toHaveBeenCalled();
  });

  test('routes a GCCE Connect4 command from the live host through the host move path', async () => {
    const { plugin } = createPlugin();
    plugin.interactiveController = {
      getState: jest.fn(() => ({
        display: {
          displaySessionId: 11,
          gameType: 'connect4',
          sessionRevision: 2,
          displayRevision: 2
        }
      })),
      applyHostMove: jest.fn(() => ({ success: true, sessionId: 11 }))
    };
    plugin.handleViewerMove = jest.fn();

    await plugin.handleConnect4Command(['C'], {
      username: 'Cid',
      userId: '7421356832385664032',
      rawData: { username: 'LiveHost', msgId: 'host-gcce-c' }
    });

    expect(plugin.interactiveController.applyHostMove).toHaveBeenCalledWith({
      sessionId: 11,
      gameType: 'connect4',
      sessionRevision: 2,
      displayRevision: 2,
      move: { column: 'C' },
      moveIdentity: 'chat:host-gcce-c'
    });
    expect(plugin.handleViewerMove).not.toHaveBeenCalled();
  });

  test('discards an orphaned legacy game instance after failed interactive recovery', () => {
    const { plugin } = createPlugin();
    plugin.activeSessions.set(17, { status: 'active' });

    plugin._discardRestoredInteractiveGame(17);

    expect(plugin.activeSessions.has(17)).toBe(false);
  });

  test('starts interactive games immediately instead of adding them to UnifiedQueueManager', () => {
    const { plugin } = createPlugin();
    plugin.interactiveController = {
      startMatch: jest.fn(() => ({ success: true, started: true, sessionId: 7 }))
    };
    const queueConnect4 = jest.spyOn(plugin.unifiedQueue, 'queueConnect4');

    const result = plugin.handleGameStart('connect4', 'viewer-7', 'Viewer Seven', 'command', '/c4start');

    expect(result).toMatchObject({ success: true, started: true, sessionId: 7 });
    expect(plugin.interactiveController.startMatch).toHaveBeenCalledWith(expect.objectContaining({
      gameType: 'connect4',
      viewerId: 'viewer-7',
      viewerDisplayName: 'Viewer Seven'
    }));
    expect(queueConnect4).not.toHaveBeenCalled();
  });

  test('routes viewer moves by stable identity and maps chat result messages', () => {
    const { plugin } = createPlugin();
    plugin.interactiveController = {
      applyViewerMove: jest.fn(() => ({ success: true, sessionId: 8 }))
    };

    const result = plugin.handleViewerMove('stable-id', 'Display Name', 'connect4', 'D');

    expect(plugin.interactiveController.applyViewerMove).toHaveBeenCalledWith(expect.objectContaining({
      viewerId: 'stable-id',
      gameType: 'connect4',
      move: { column: 'D' }
    }));
    expect(result).toMatchObject({ success: true, displayOverlay: true });
  });

  test('rejects invalid Connect4 configuration with a stable error code', () => {
    const { plugin, routes } = createPlugin();
    plugin.db = {
      getGameConfig: jest.fn(() => null),
      saveGameConfig: jest.fn()
    };
    plugin.registerRoutes();
    const route = routes.find(item => item.method === 'POST' && item.path === '/api/game-engine/config/:gameType');
    const res = {
      status: jest.fn(function status(code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn()
    };

    route.handler({ params: { gameType: 'connect4' }, body: { soundVolume: 1.5 } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_connect4_config' });
    expect(plugin.db.saveGameConfig).not.toHaveBeenCalled();
  });

  test('normalizes invalid stored Connect4 configuration values on read', () => {
    const { plugin } = createPlugin();

    expect(plugin._getConfigWithDefaults('connect4', {
      streamerRole: 'admin',
      animationSpeed: 0,
      chatCommand: 'bad command!',
      player1Color: 'red',
      soundVolume: 2,
      leaderboardTypes: ['daily', 'unknown', 'daily'],
      leaderboardDisplayTime: 99,
      roundTimeLimit: 2,
      roundWarningTime: 100
    })).toMatchObject({
      streamerRole: 'player2',
      animationSpeed: 500,
      chatCommand: 'c4start',
      player1Color: '#E74C3C',
      soundVolume: 0.5,
      leaderboardTypes: ['daily', 'season', 'lifetime', 'elo'],
      leaderboardDisplayTime: 3,
      roundTimeLimit: 30,
      roundWarningTime: 10
    });
  });

  test.each([
    { streamerRole: 'host' },
    { chatCommand: 'bad command!' },
    { player2Color: '#GG0000' },
    { roundTimeLimit: 5, roundWarningTime: 10 }
  ])('rejects invalid Connect4 configuration field combinations: %o', body => {
    const { plugin, routes } = createPlugin();
    plugin.db = {
      getGameConfig: jest.fn(() => null),
      saveGameConfig: jest.fn()
    };
    plugin.registerRoutes();
    const route = routes.find(item => item.method === 'POST' && item.path === '/api/game-engine/config/:gameType');
    const res = {
      status: jest.fn(function status(code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn()
    };

    route.handler({ params: { gameType: 'connect4' }, body }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_connect4_config' });
    expect(plugin.db.saveGameConfig).not.toHaveBeenCalled();
  });

  test('falls back to the default Connect4 command when stored configuration is invalid', () => {
    const { plugin } = createPlugin();
    plugin.db = {
      getGameConfig: jest.fn(() => ({ chatCommand: 'invalid command!' }))
    };

    expect(plugin.getConnect4StartCommandName()).toBe('c4start');
  });

  test('accepts the revisioned host envelope and enriches the legacy streamer event', () => {
    const { plugin } = createPlugin();
    plugin.interactiveController = {
      getState: jest.fn(() => ({
        display: {
          displaySessionId: 9,
          gameType: 'connect4',
          sessionRevision: 4,
          displayRevision: 11
        }
      })),
      applyHostMove: jest.fn(() => ({ success: true }))
    };

    plugin.handleStreamerMove({
      sessionId: 9,
      gameType: 'connect4',
      sessionRevision: 4,
      displayRevision: 11,
      move: { column: 'C' },
      moveIdentity: 'forged-dashboard-identity'
    });

    expect(plugin.interactiveController.applyHostMove).toHaveBeenCalledWith({
      sessionId: 9,
      gameType: 'connect4',
      sessionRevision: 4,
      displayRevision: 11,
      move: { column: 'C' }
    });
  });

  test('serves authoritative interactive state and delegates active-session to the displayed board', () => {
    const { plugin, routes } = createPlugin();
    const state = {
      display: {
        displaySessionId: 12,
        gameType: 'chess',
        state: { fen: 'test' }
      },
      hostQueue: [],
      activeSessions: []
    };
    plugin.db = {
      getGameConfig: jest.fn(() => null),
      getOverlaySettings: jest.fn(() => ({}))
    };
    plugin.interactiveController = { getState: jest.fn(() => state) };
    plugin.registerRoutes();

    const interactiveRoute = routes.find(route => route.method === 'GET' && route.path === '/api/game-engine/interactive/state');
    const activeRoute = routes.find(route => route.method === 'GET' && route.path === '/api/game-engine/active-session');
    const interactiveRes = { json: jest.fn() };
    const activeRes = { json: jest.fn() };
    interactiveRoute.handler({}, interactiveRes);
    activeRoute.handler({}, activeRes);

    expect(interactiveRes.json).toHaveBeenCalledWith(state);
    expect(activeRes.json).toHaveBeenCalledWith({
      sessionId: 12,
      gameType: 'chess',
      state: { fen: 'test' }
    });
  });

  test('authorizes revisioned host socket moves and reconnect state requests', () => {
    const { plugin, getConnectionHandler } = createPlugin();
    plugin.interactiveController = {
      applyHostMove: jest.fn(() => ({ success: true })),
      emitState: jest.fn()
    };
    plugin.registerSocketEvents();
    const admin = socket('admin');
    getConnectionHandler()(admin);
    const envelope = {
      sessionId: 3,
      gameType: 'chess',
      sessionRevision: 2,
      displayRevision: 6,
      move: { move: 'e4' },
      moveIdentity: 'forged-socket-identity'
    };

    admin.trigger('game-engine:interactive-host-move', envelope);
    admin.trigger('game-engine:request-state');

    expect(plugin.interactiveController.applyHostMove).toHaveBeenCalledWith({
      sessionId: 3,
      gameType: 'chess',
      sessionRevision: 2,
      displayRevision: 6,
      move: { move: 'e4' }
    });
    expect(plugin.interactiveController.emitState).toHaveBeenCalledWith(admin);
  });

  test('plugin destroy clears in-memory interactive timers without ending persisted matches', async () => {
    const { plugin } = createPlugin();
    const game = { timerInterval: null };
    plugin.activeSessions.set(20, game);
    plugin.interactiveController = {
      registry: { list: () => [{ sessionId: 20 }] },
      destroy: jest.fn()
    };
    plugin.unifiedQueue.destroy = jest.fn();
    plugin.endGame = jest.fn();

    await plugin.destroy();

    expect(plugin.interactiveController).toBeNull();
    expect(plugin.endGame).not.toHaveBeenCalledWith(20, null, 'plugin_shutdown');
    expect(plugin.activeSessions.has(20)).toBe(false);
  });
});
