const GameEnginePlugin = require('../main');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testPluginDataDir = path.join(os.tmpdir(), `ltth-connect4-media-${process.pid}`);

beforeAll(() => {
  fs.mkdirSync(testPluginDataDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(testPluginDataDir, { recursive: true, force: true });
});

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
    registerRoute: jest.fn((method, path, ...handlers) => routes.push({
      method,
      path,
      handlers,
      handler: handlers.at(-1)
    })),
    getPluginDataDir: () => testPluginDataDir,
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

  test('registers a real Connect4 audio upload and persists the uploaded file', () => {
    const { plugin, routes, io } = createPlugin();
    plugin.db = {
      getGameMedia: jest.fn(() => null),
      saveGameMedia: jest.fn()
    };
    plugin.registerRoutes();
    const route = routes.find(item => (
      item.method === 'POST' &&
      item.path === '/api/game-engine/media/:gameType/:mediaEvent'
    ));
    const uploadedPath = path.join(testPluginDataDir, 'game-media', 'connect4', 'piece_drop.mp3');
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    expect(route.handlers).toHaveLength(3);
    route.handler({
      params: { gameType: 'connect4', mediaEvent: 'piece_drop' },
      file: {
        path: uploadedPath,
        mimetype: 'audio/mpeg',
        originalname: 'my-drop.mp3'
      }
    }, res);

    expect(plugin.db.saveGameMedia).toHaveBeenCalledWith(
      'connect4',
      'piece_drop',
      uploadedPath,
      'audio/mpeg'
    );
    expect(io.emit).toHaveBeenCalledWith('game-engine:media-updated', {
      gameType: 'connect4',
      mediaEvent: 'piece_drop'
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      filename: 'piece_drop.mp3',
      url: '/game-engine/media/connect4/piece_drop'
    }));
  });

  test('rejects unknown Connect4 audio events before accepting a file', () => {
    const { plugin, routes } = createPlugin();
    plugin.db = { getGameMedia: jest.fn(), saveGameMedia: jest.fn() };
    plugin.registerRoutes();
    const route = routes.find(item => (
      item.method === 'POST' &&
      item.path === '/api/game-engine/media/:gameType/:mediaEvent'
    ));
    const next = jest.fn();
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    route.handlers[0]({
      params: { gameType: 'connect4', mediaEvent: '../piece_drop' }
    }, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'invalid_connect4_media_event'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('updates scoped audio states and exposes enabled defaults for every known event', () => {
    const { plugin, routes, io } = createPlugin();
    const states = new Map();
    const stateKey = (gameType, scopeId, audioEvent) => `${gameType}:${scopeId}:${audioEvent}`;
    plugin.db = {
      getGameMedia: jest.fn(() => []),
      getWheelAudioSettings: jest.fn(() => ({})),
      getSlotAudioSettings: jest.fn(() => ({})),
      isGameAudioEnabled: jest.fn((gameType, scopeId, audioEvent) => (
        states.get(stateKey(gameType, scopeId, audioEvent)) ?? true
      )),
      setGameAudioEnabled: jest.fn((gameType, scopeId, audioEvent, enabled) => {
        states.set(stateKey(gameType, scopeId, audioEvent), enabled);
        return true;
      })
    };
    plugin.registerRoutes();

    const audioStateRoute = routes.find(item => (
      item.method === 'PUT' &&
      item.path === '/api/game-engine/audio-state/:gameType/:audioEvent'
    ));
    expect(audioStateRoute).toBeDefined();

    const invoke = (route, req) => {
      const result = { status: 200, body: null };
      const res = {
        status: jest.fn(code => {
          result.status = code;
          return res;
        }),
        json: jest.fn(body => {
          result.body = body;
          return res;
        })
      };
      route.handler(req, res);
      return result;
    };

    expect(invoke(audioStateRoute, {
      params: { gameType: 'connect4', audioEvent: 'unknown' },
      body: { scopeId: 'default', enabled: false }
    })).toMatchObject({ status: 400, body: { error: 'invalid_audio_event' } });
    expect(invoke(audioStateRoute, {
      params: { gameType: 'unknown', audioEvent: 'piece_drop' },
      body: { scopeId: 'default', enabled: false }
    })).toMatchObject({ status: 400, body: { error: 'invalid_game_type' } });
    expect(invoke(audioStateRoute, {
      params: { gameType: 'connect4', audioEvent: 'piece_drop' }
    })).toMatchObject({ status: 400, body: { error: 'invalid_audio_enabled' } });
    expect(invoke(audioStateRoute, {
      params: { gameType: 'connect4', audioEvent: 'piece_drop' },
      body: { enabled: 'false' }
    })).toMatchObject({ status: 400, body: { error: 'invalid_audio_enabled' } });
    expect(invoke(audioStateRoute, {
      params: { gameType: 'connect4', audioEvent: 'piece_drop' },
      body: { scopeId: 'not-a-connect4-scope', enabled: true }
    }).body).toMatchObject({ success: true, scopeId: 'default', enabled: true });
    expect(invoke(audioStateRoute, {
      params: { gameType: 'wheel', audioEvent: 'spinning' },
      body: { scopeId: '007', enabled: true }
    }).body).toMatchObject({ success: true, scopeId: '7', enabled: true });
    expect(invoke(audioStateRoute, {
      params: { gameType: 'wheel', audioEvent: 'spinning' },
      body: { enabled: true }
    })).toMatchObject({ status: 400, body: { error: 'invalid_audio_scope' } });
    expect(invoke(audioStateRoute, {
      params: { gameType: 'slot', audioEvent: 'spin' },
      body: { scopeId: 'invalid', enabled: true }
    })).toMatchObject({ status: 400, body: { error: 'invalid_audio_scope' } });

    expect(invoke(audioStateRoute, {
      params: { gameType: 'connect4', audioEvent: 'piece_drop' },
      body: { scopeId: 'default', enabled: false }
    }).body).toMatchObject({ success: true, scopeId: 'default', enabled: false });
    expect(invoke(audioStateRoute, {
      params: { gameType: 'wheel', audioEvent: 'spinning' },
      body: { scopeId: '7', enabled: false }
    }).body).toMatchObject({ success: true, scopeId: '7', enabled: false });
    expect(invoke(audioStateRoute, {
      params: { gameType: 'slot', audioEvent: 'spin' },
      body: { scopeId: '9', enabled: false }
    }).body).toMatchObject({ success: true, scopeId: '9', enabled: false });

    const connect4SettingsRoute = routes.find(item => (
      item.method === 'GET' && item.path === '/api/game-engine/media/:gameType'
    ));
    const wheelSettingsRoute = routes.find(item => (
      item.method === 'GET' && item.path === '/api/game-engine/wheel/audio/settings'
    ));
    const slotSettingsRoute = routes.find(item => (
      item.method === 'GET' && item.path === '/api/game-engine/slot/audio/settings'
    ));
    const connect4Settings = invoke(connect4SettingsRoute, { params: { gameType: 'connect4' } });
    const wheelSettings = invoke(wheelSettingsRoute, { query: { wheelId: '7' } });
    const slotSettings = invoke(slotSettingsRoute, { query: { machineId: '9' } });

    expect(connect4Settings.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ media_event: 'piece_drop', enabled: false }),
      expect.objectContaining({ media_event: 'timer_warning', enabled: true })
    ]));
    expect(wheelSettings.body).toMatchObject({
      spinning: { enabled: false },
      prize1: { enabled: true },
      lost: { enabled: true }
    });
    expect(slotSettings.body).toMatchObject({
      spin: { enabled: false },
      jackpot: { enabled: true },
      reel_stop: { enabled: true }
    });
    expect(io.emit).toHaveBeenCalledWith('game-engine:audio-state-updated', {
      gameType: 'slot',
      scopeId: '9',
      audioEvent: 'spin',
      enabled: false
    });
  });

  test('exposes only browser-safe Connect4 audio metadata and serves the owned file', () => {
    const { plugin, routes } = createPlugin();
    const mediaDir = path.join(testPluginDataDir, 'game-media', 'connect4');
    const mediaPath = path.join(mediaDir, 'piece_drop.mp3');
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.writeFileSync(mediaPath, 'audio');
    const row = {
      game_type: 'connect4',
      media_type: 'audio',
      media_event: 'piece_drop',
      file_path: mediaPath,
      file_type: 'audio/mpeg',
      enabled: 1
    };
    plugin.db = {
      getGameMedia: jest.fn((gameType, mediaEvent) => mediaEvent ? row : [row]),
      isGameAudioEnabled: jest.fn(() => true)
    };
    plugin.registerRoutes();
    const metadataRoute = routes.find(item => (
      item.method === 'GET' && item.path === '/api/game-engine/media/:gameType'
    ));
    const fileRoute = routes.find(item => (
      item.method === 'GET' && item.path === '/game-engine/media/:gameType/:mediaEvent'
    ));
    const metadataRes = { json: jest.fn(), status: jest.fn(() => metadataRes) };
    const fileRes = { sendFile: jest.fn(), status: jest.fn(() => fileRes), json: jest.fn() };

    metadataRoute.handler({ params: { gameType: 'connect4' } }, metadataRes);
    fileRoute.handler({ params: { gameType: 'connect4', mediaEvent: 'piece_drop' } }, fileRes);

    expect(metadataRes.json).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        media_event: 'piece_drop',
        filename: 'piece_drop.mp3',
        enabled: true,
        url: expect.stringMatching(/^\/game-engine\/media\/connect4\/piece_drop\?v=\d+$/)
      })
    ]));
    expect(metadataRes.json.mock.calls[0][0][0]).not.toHaveProperty('file_path');
    expect(fileRes.sendFile).toHaveBeenCalledWith(mediaPath);
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
      roundTimerEnabled: 'yes',
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
      roundTimerEnabled: false,
      roundTimeLimit: 30,
      roundWarningTime: 10
    });
  });

  test('derives interactive Connect4 timer settings from the canonical Connect4 configuration', () => {
    const { plugin } = createPlugin();
    plugin.db = {
      getGameConfig: jest.fn(gameType => gameType === 'connect4'
        ? {
          roundTimerEnabled: true,
          roundTimeLimit: 45,
          roundWarningTime: 12
        }
        : {
          connect4ViewerResponseSeconds: 99,
          chessViewerResponseSeconds: 60,
          maxConcurrentInteractiveSessions: 20,
          interactiveResultDisplaySeconds: 3
        })
    };

    expect(plugin._getInteractiveSettings()).toMatchObject({
      connect4ViewerTimeoutEnabled: true,
      connect4ViewerResponseSeconds: 45,
      connect4ViewerWarningSeconds: 12
    });
  });

  test.each([
    [true, 45, 12],
    [false, 30, 10]
  ])('serves canonical Connect4 timer values through the interactive config API (%s)', (
    roundTimerEnabled,
    roundTimeLimit,
    roundWarningTime
  ) => {
    const { plugin, routes } = createPlugin();
    plugin.db = {
      getGameConfig: jest.fn(gameType => gameType === 'connect4'
        ? { roundTimerEnabled, roundTimeLimit, roundWarningTime }
        : {
          chessViewerResponseSeconds: 60,
          maxConcurrentInteractiveSessions: 20,
          interactiveResultDisplaySeconds: 3
        })
    };
    plugin.registerRoutes();
    const route = routes.find(item => item.method === 'GET' && item.path === '/api/game-engine/config/:gameType');
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    route.handler({ params: { gameType: 'interactive' } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      connect4ViewerTimeoutEnabled: roundTimerEnabled,
      connect4ViewerResponseSeconds: roundTimeLimit,
      connect4ViewerWarningSeconds: roundWarningTime
    }));
  });

  test('returns freshly derived interactive settings after saving them', () => {
    const { plugin, routes } = createPlugin();
    let interactiveConfig = {};
    plugin.db = {
      getGameConfig: jest.fn(gameType => gameType === 'connect4'
        ? { roundTimerEnabled: true, roundTimeLimit: 40, roundWarningTime: 8 }
        : interactiveConfig),
      saveGameConfig: jest.fn((gameType, config) => {
        if (gameType === 'interactive') interactiveConfig = config;
      })
    };
    plugin.registerRoutes();
    const route = routes.find(item => item.method === 'POST' && item.path === '/api/game-engine/config/:gameType');
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    route.handler({
      params: { gameType: 'interactive' },
      body: {
        chessViewerResponseSeconds: 75,
        maxConcurrentInteractiveSessions: 12,
        interactiveResultDisplaySeconds: 4
      }
    }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      config: expect.objectContaining({
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 40,
        connect4ViewerWarningSeconds: 8,
        chessViewerResponseSeconds: 75,
        maxConcurrentInteractiveSessions: 12,
        interactiveResultDisplaySeconds: 4
      })
    });
  });

  test('reconciles active Connect4 viewer timers after saving canonical configuration', () => {
    const { plugin, routes } = createPlugin();
    plugin.db = {
      saveGameConfig: jest.fn()
    };
    plugin.interactiveController = {
      refreshConnect4TimerConfiguration: jest.fn(() => ({ updatedSessions: 1 }))
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

    route.handler({
      params: { gameType: 'connect4' },
      body: {
        roundTimerEnabled: false,
        roundTimeLimit: 30,
        roundWarningTime: 10
      }
    }, res);

    expect(plugin.interactiveController.refreshConnect4TimerConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        roundTimerEnabled: false,
        roundTimeLimit: 30,
        roundWarningTime: 10
      })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test.each([
    { streamerRole: 'host' },
    { chatCommand: 'bad command!' },
    { player2Color: '#GG0000' },
    { roundTimerEnabled: 'yes' },
    { roundTimeLimit: 5, roundWarningTime: 10 },
    { animationSpeed: 50 },
    { leaderboardTypes: ['daily', 'unknown'] },
    { leaderboardDisplayTime: 11 }
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

  test('authorizes revisioned host-turn skips and reports stable controller errors to the admin socket', () => {
    const { plugin, getConnectionHandler } = createPlugin();
    plugin.interactiveController = {
      skipHostTurn: jest.fn(() => ({ success: false, error: 'queue_too_short' })),
      emitState: jest.fn()
    };
    plugin.registerSocketEvents();
    const admin = socket('admin');
    getConnectionHandler()(admin);

    admin.trigger('game-engine:interactive-skip-host-turn', {
      sessionId: 3,
      gameType: 'chess',
      sessionRevision: 2,
      displayRevision: 6
    });

    expect(plugin.interactiveController.skipHostTurn).toHaveBeenCalledWith({
      sessionId: 3,
      gameType: 'chess',
      sessionRevision: 2,
      displayRevision: 6
    });
    expect(admin.emit).toHaveBeenCalledWith('game-engine:error', {
      sessionId: 3,
      error: 'queue_too_short'
    });
    expect(plugin.interactiveController.emitState).toHaveBeenCalledWith(admin);
  });

  test('passes revisioned cancellation envelopes to the interactive controller while preserving legacy session-only cancellation', () => {
    const { plugin, getConnectionHandler } = createPlugin();
    plugin.interactiveController = {
      registry: { get: jest.fn(() => ({ sessionId: 3 })) },
      cancel: jest.fn(() => ({ success: false, error: 'stale_display_revision' })),
      emitState: jest.fn()
    };
    plugin.registerSocketEvents();
    const admin = socket('admin');
    getConnectionHandler()(admin);

    admin.trigger('game-engine:cancel-game', {
      sessionId: 3,
      gameType: 'connect4',
      sessionRevision: 2,
      displayRevision: 6
    });

    expect(plugin.interactiveController.cancel).toHaveBeenCalledWith({
      sessionId: 3,
      gameType: 'connect4',
      sessionRevision: 2,
      displayRevision: 6
    });
    expect(admin.emit).toHaveBeenCalledWith('game-engine:error', {
      sessionId: 3,
      error: 'stale_display_revision'
    });
    expect(plugin.interactiveController.emitState).toHaveBeenCalledWith(admin);
    expect(() => plugin.cancelGame(3)).not.toThrow();
    expect(plugin.interactiveController.cancel).toHaveBeenLastCalledWith({ sessionId: 3 });
  });

  test('marks neutral interactive cancellation as non-accounting when it reaches the legacy end-game path', () => {
    const { plugin } = createPlugin();
    plugin.endGame = jest.fn();

    plugin._finishInteractiveGame({
      sessionId: 12,
      winner: null,
      reason: 'cancelled',
      gameResult: { cancelled: true },
      skipAccounting: true
    });

    expect(plugin.endGame).toHaveBeenCalledWith(
      12,
      null,
      'cancelled',
      { cancelled: true },
      { interactive: true, skipAccounting: true }
    );
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
