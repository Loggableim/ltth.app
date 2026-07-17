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

    plugin.handleStreamerMove({ sessionId: 9, column: 'C' });

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
      move: { move: 'e4' }
    };

    admin.trigger('game-engine:interactive-host-move', envelope);
    admin.trigger('game-engine:request-state');

    expect(plugin.interactiveController.applyHostMove).toHaveBeenCalledWith(envelope);
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
