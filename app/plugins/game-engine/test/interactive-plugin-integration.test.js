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

  test('persists a two-viewer legacy move under the active participant identity', () => {
    const { plugin } = createPlugin();
    plugin.db = { saveMove: jest.fn() };
    plugin._emitInteractiveLegacyEvent('move', {
      session: { sessionId: 8, gameType: 'connect4', viewerId: 'viewer-one', adapter: { getState: () => ({}) } },
      actorRole: 'viewer',
      actorId: 'viewer-two',
      actorDisplayName: 'Viewer Two',
      result: { move: { column: 'B', moveNumber: 2 } }
    });

    expect(plugin.db.saveMove).toHaveBeenCalledWith(
      8,
      'viewer-two',
      { column: 'B', moveNumber: 2 },
      2
    );
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

  test('defaults Connect4 sounds to muted and validates the master sound toggle', () => {
    const { plugin, routes } = createPlugin();
    let savedConfig = null;
    plugin.db = {
      getGameConfig: jest.fn(() => null),
      saveGameConfig: jest.fn((gameType, config) => {
        savedConfig = { gameType, config };
      })
    };
    plugin.registerRoutes();
    const route = routes.find(item => item.method === 'POST' && item.path === '/api/game-engine/config/:gameType');
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    expect(plugin._getConfigWithDefaults('connect4', {})).toMatchObject({
      soundEnabled: false,
      soundVolume: 0.5
    });
    expect(plugin._isValidConnect4Config({ soundEnabled: 'yes' })).toBe(false);

    route.handler({ params: { gameType: 'connect4' }, body: { soundEnabled: true, soundVolume: 0.25 } }, res);

    expect(plugin.db.saveGameConfig).toHaveBeenCalled();
    expect(savedConfig).toMatchObject({
      gameType: 'connect4',
      config: {
        soundEnabled: true,
        soundVolume: 0.25
      }
    });
    expect(res.json).toHaveBeenCalledWith({ success: true });
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

  test('accepts custom Connect4 audio when the browser sends a generic MIME type', () => {
    const { plugin, routes } = createPlugin();
    plugin.db = {
      getGameMedia: jest.fn(() => null),
      saveGameMedia: jest.fn()
    };
    plugin.registerRoutes();
    const route = routes.find(item => (
      item.method === 'POST' &&
      item.path === '/api/game-engine/media/:gameType/:mediaEvent'
    ));
    const uploadedPath = path.join(testPluginDataDir, 'game-media', 'connect4', 'timer_warning.mp3');
    const res = { json: jest.fn(), status: jest.fn(() => res) };

    route.handler({
      params: { gameType: 'connect4', mediaEvent: 'timer_warning' },
      file: {
        path: uploadedPath,
        mimetype: 'application/octet-stream',
        originalname: 'timer-warning.MP3'
      }
    }, res);

    expect(plugin.db.saveGameMedia).toHaveBeenCalledWith(
      'connect4',
      'timer_warning',
      uploadedPath,
      'audio/mpeg'
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      filename: 'timer_warning.mp3'
    }));
  });

  test('locks out a timed-out interactive viewer from starting another game for 24 hours', () => {
    const { plugin, io } = createPlugin();
    plugin.endGame = jest.fn();
    plugin.db = {
      getGameConfig: jest.fn(() => null),
      getActiveSessionForPlayer: jest.fn(() => null),
      setGamePlayerLockout: jest.fn(() => ({
        username: 'slow-viewer',
        reason: 'viewer_timeout',
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        remainingMs: 24 * 60 * 60 * 1000
      })),
      getActiveGamePlayerLockout: jest.fn(() => ({
        username: 'slow-viewer',
        reason: 'viewer_timeout',
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        remainingMs: 24 * 60 * 60 * 1000
      }))
    };
    plugin.interactiveController = {
      startMatch: jest.fn()
    };

    plugin._finishInteractiveGame({
      sessionId: 123,
      viewerId: 'slow-viewer',
      winner: 'streamer',
      reason: 'viewer_timeout',
      gameResult: { timeout: true }
    });
    const result = plugin.handleGameStart('connect4', 'slow-viewer', 'Slow Viewer', 'command', '/c4start');

    expect(plugin.db.setGamePlayerLockout).toHaveBeenCalledWith(
      'slow-viewer',
      'viewer_timeout',
      24 * 60 * 60 * 1000
    );
    expect(plugin.interactiveController.startMatch).not.toHaveBeenCalled();
    expect(io.emit).toHaveBeenCalledWith('game-engine:player-lockout', expect.objectContaining({
      username: 'slow-viewer',
      reason: 'viewer_timeout'
    }));
    expect(result).toMatchObject({
      success: false,
      error: 'game_lockout'
    });
    expect(result.remainingMs).toBeGreaterThan(0);
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

  test.each(['connect4', '!connect4', '/connect4', '4gewinnt', '!4gewinnt', '/4gewinnt'])(
    'routes the fixed Connect4 matchmaking alias %s before generic chat triggers',
    alias => {
      const { plugin } = createPlugin();
      plugin.db = {
        getGameConfig: jest.fn(() => null),
        getTriggers: jest.fn(() => [{ trigger_type: 'command', trigger_value: alias, game_type: 'plinko' }])
      };
      plugin.wheelGame = { findWheelByChatCommand: jest.fn(() => null) };
      plugin.slotGame = { findMachineByChatCommand: jest.fn(() => null) };
      plugin.handleConnect4StartCommand = jest.fn();
      plugin.handleGameStart = jest.fn();

      plugin.handleChatCommand({
        uniqueId: 'viewer-one',
        nickname: 'Viewer One',
        profilePictureUrl: 'https://p16-sign-va.tiktokcdn.com/avatar.webp',
        comment: alias,
        msgId: `fixed-${alias}`
      });

      expect(plugin.handleConnect4StartCommand).toHaveBeenCalledWith([], expect.objectContaining({
        userId: 'viewer-one',
        nickname: 'Viewer One',
        profilePictureUrl: 'https://p16-sign-va.tiktokcdn.com/avatar.webp'
      }));
      expect(plugin.handleGameStart).not.toHaveBeenCalled();
    }
  );

  test('routes every Connect4 start through FIFO matchmaking and preserves opened or matched responses', async () => {
    const { plugin } = createPlugin();
    plugin.interactiveController = {
      startOrJoinConnect4Matchmaking: jest.fn()
        .mockReturnValueOnce({ success: true, action: 'opened', challenge: { challengeId: 41, status: 'open', expiresAtMs: Date.now() + 30000 } })
        .mockReturnValueOnce({ success: true, action: 'matched', challenge: { challengeId: 41, status: 'claimed' }, sessionId: 77 })
        .mockReturnValueOnce({ success: true, action: 'opened', challenge: { challengeId: 42, status: 'open', expiresAtMs: Date.now() + 30000 } })
        .mockReturnValueOnce({ success: true, action: 'matched', challenge: { challengeId: 42, status: 'claimed' }, sessionId: 78 })
    };

    const results = [];
    for (const [userId, username] of [
      ['viewer-one', 'Viewer One'], ['viewer-two', 'Viewer Two'],
      ['viewer-three', 'Viewer Three'], ['viewer-four', 'Viewer Four']
    ]) {
      results.push(await plugin.handleConnect4StartCommand([], {
        userId,
        username,
        profilePictureUrl: 'https://p16-sign-va.tiktokcdn.com/avatar.webp'
      }));
    }

    expect(results.map(result => result.action)).toEqual(['opened', 'matched', 'opened', 'matched']);
    expect(results[0]).toMatchObject({ success: true, challenge: true, challengeId: 41, displayOverlay: true });
    expect(results[1]).toMatchObject({ success: true, accepted: true, sessionId: 77, displayOverlay: true });
    expect(results[2]).toMatchObject({ success: true, challenge: true, challengeId: 42, displayOverlay: true });
    expect(results[3]).toMatchObject({ success: true, accepted: true, sessionId: 78, displayOverlay: true });
    expect(plugin.interactiveController.startOrJoinConnect4Matchmaking).toHaveBeenNthCalledWith(1, expect.objectContaining({
      participantId: 'viewer-one',
      participantDisplayName: 'Viewer One',
      participantAvatarSource: expect.stringMatching(/^\/api\/game-engine\/avatar\?url=/),
      triggerType: 'matchmaking_accept',
      triggerValue: 'connect4'
    }));
    expect(plugin.interactiveController.startOrJoinConnect4Matchmaking).toHaveBeenCalledTimes(4);
  });

  test('rejects Connect4 starts while the FIFO controller is unavailable without starting a legacy game', async () => {
    const { plugin } = createPlugin();
    plugin.handleGameStart = jest.fn(() => ({ success: true, sessionId: 99 }));

    const result = await plugin.handleConnect4StartCommand([], {
      userId: 'viewer-one',
      username: 'Viewer One',
      profilePictureUrl: 'https://p16-sign-va.tiktokcdn.com/avatar.webp'
    });

    expect(result).toMatchObject({
      success: false,
      error: 'interactive_controller_unavailable',
      displayOverlay: true
    });
    expect(plugin.handleGameStart).not.toHaveBeenCalled();
  });

  test('clears only the claimed matchmaking timer while later searches remain scheduled', () => {
    const { plugin } = createPlugin();
    plugin._scheduleConnect4MatchmakingExpiry({ challengeId: 41, status: 'open', expiresAtMs: Date.now() + 30000 });
    plugin._scheduleConnect4MatchmakingExpiry({ challengeId: 42, status: 'open', expiresAtMs: Date.now() + 30000 });

    expect(plugin.connect4MatchmakingTimeouts).toBeInstanceOf(Map);
    expect(plugin.connect4MatchmakingTimeouts.has(41)).toBe(true);
    expect(plugin.connect4MatchmakingTimeouts.has(42)).toBe(true);

    plugin._clearConnect4MatchmakingExpiry(41);

    expect(plugin.connect4MatchmakingTimeouts.has(41)).toBe(false);
    expect(plugin.connect4MatchmakingTimeouts.has(42)).toBe(true);
    plugin._clearConnect4MatchmakingExpiry(42);
  });

  test('expires independently scheduled searches into their own streamer fallbacks', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1000000);
    const { plugin } = createPlugin();
    plugin.interactiveController = {
      beginExpiredConnect4Fallback: jest.fn(challengeId => ({ success: true, challenge: { challengeId, status: 'fallback_pending' } })),
      startPendingConnect4Fallback: jest.fn(challengeId => ({ success: true, sessionId: challengeId }))
    };

    plugin._scheduleConnect4MatchmakingExpiry({ challengeId: 41, status: 'open', expiresAtMs: 1030000 });
    plugin._scheduleConnect4MatchmakingExpiry({ challengeId: 42, status: 'open', expiresAtMs: 1040000 });
    jest.advanceTimersByTime(30000);
    await Promise.resolve();
    expect(plugin.interactiveController.startPendingConnect4Fallback).toHaveBeenCalledWith(41, 'LiveHost');
    expect(plugin.interactiveController.startPendingConnect4Fallback).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10000);
    await Promise.resolve();
    expect(plugin.interactiveController.startPendingConnect4Fallback).toHaveBeenLastCalledWith(42, 'LiveHost');
    expect(plugin.interactiveController.startPendingConnect4Fallback).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  test('recovers every unexpired viewer search and starts only elapsed rows as fallbacks', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1000000);
    const { plugin } = createPlugin();
    const openFirst = { challengeId: 51, status: 'open', expiresAtMs: 1030000 };
    const openSecond = { challengeId: 52, status: 'open', expiresAtMs: 1040000 };
    const elapsed = { challengeId: 53, status: 'open', expiresAtMs: 999999 };
    plugin.interactiveController = {
      listRecoverableConnect4Challenges: jest.fn(() => [openFirst, openSecond, elapsed]),
      beginExpiredConnect4Fallback: jest.fn(challengeId => ({ success: true, challenge: { challengeId, status: 'fallback_pending' } })),
      startPendingConnect4Fallback: jest.fn(challengeId => ({ success: true, sessionId: challengeId }))
    };

    const recovered = plugin._recoverConnect4MatchmakingChallenges();
    await Promise.all(recovered.filter(result => result?.then));

    expect(plugin.connect4MatchmakingTimeouts.has(51)).toBe(true);
    expect(plugin.connect4MatchmakingTimeouts.has(52)).toBe(true);
    expect(plugin.interactiveController.beginExpiredConnect4Fallback).toHaveBeenCalledWith(53);
    expect(plugin.interactiveController.startPendingConnect4Fallback).toHaveBeenCalledWith(53, 'LiveHost');
    plugin._clearConnect4MatchmakingExpiry(51);
    plugin._clearConnect4MatchmakingExpiry(52);
    jest.useRealTimers();
  });

  test('drains a capacity-blocked fallback when an interactive session finishes without pairing it to a later viewer', async () => {
    jest.useFakeTimers();
    const { plugin } = createPlugin();
    let pending = true;
    let capacityAvailable = false;
    plugin.interactiveController = {
      listRecoverableConnect4Challenges: jest.fn(() => pending
        ? [{ challengeId: 61, status: 'fallback_pending', openerId: 'waiting-viewer' }]
        : []),
      beginExpiredConnect4Fallback: jest.fn(() => ({ success: true, challenge: { challengeId: 61, status: 'fallback_pending' } })),
      startPendingConnect4Fallback: jest.fn(challengeId => {
        if (!capacityAvailable) return { success: false, error: 'interactive_session_limit' };
        pending = false;
        return { success: true, action: 'fallback_started', sessionId: challengeId };
      })
    };
    plugin.endGame = jest.fn();

    await expect(plugin._expireConnect4MatchmakingChallenge({ challengeId: 61, status: 'open' }))
      .resolves.toMatchObject({ success: false, error: 'interactive_session_limit' });
    expect(plugin.connect4MatchmakingDrainTimeout).not.toBeNull();

    capacityAvailable = true;
    plugin._finishInteractiveGame({ sessionId: 9, winner: null, reason: 'cancelled', gameResult: null });

    expect(plugin.interactiveController.startPendingConnect4Fallback).toHaveBeenCalledTimes(2);
    expect(plugin.interactiveController.startPendingConnect4Fallback).toHaveBeenLastCalledWith(61, 'LiveHost');
    expect(plugin.connect4MatchmakingDrainTimeout).toBeNull();
    jest.useRealTimers();
  });

  test('keeps a configured bare c4 start alias distinct from c4 column moves in fallback chat', () => {
    const { plugin } = createPlugin();
    plugin.db = {
      getGameConfig: jest.fn(gameType => gameType === 'connect4'
        ? { ...plugin.defaultConfigs.connect4, chatCommand: 'c4' }
        : null),
      getTriggers: jest.fn(() => [])
    };
    plugin.wheelGame = { findWheelByChatCommand: jest.fn(() => null) };
    plugin.slotGame = { findMachineByChatCommand: jest.fn(() => null) };
    plugin.handleConnect4StartCommand = jest.fn();
    plugin.handleViewerMove = jest.fn();

    plugin.handleChatCommand({ uniqueId: 'viewer-one', nickname: 'Viewer One', comment: 'c4' });
    plugin.handleChatCommand({ uniqueId: 'viewer-one', nickname: 'Viewer One', comment: 'c4 A' });

    expect(plugin.handleConnect4StartCommand).toHaveBeenCalledTimes(1);
    expect(plugin.handleViewerMove).toHaveBeenCalledWith(
      'viewer-one',
      'Viewer One',
      'connect4',
      'A',
      null
    );
  });

  test('keeps the legacy Arena avatar route while registering the general avatar proxy', () => {
    const { plugin, routes } = createPlugin();
    plugin.registerRoutes();

    expect(routes.some(route => route.path === '/api/game-engine/arena/avatar')).toBe(true);
    expect(routes.some(route => route.path === '/api/game-engine/avatar')).toBe(true);
  });

  test('locks the actual timed-out viewer in a two-viewer Connect4 session', () => {
    const { plugin, io } = createPlugin();
    plugin.db = {
      setGamePlayerLockout: jest.fn(() => ({
        reason: 'viewer_timeout',
        expiresAt: Date.now() + 86400000,
        remainingMs: 86400000
      }))
    };

    plugin._applyViewerTimeoutLockout({
      reason: 'viewer_timeout',
      viewerId: 'viewer-one',
      timedOutPlayerId: 'viewer-two',
      participants: [
        { id: 'viewer-one', displayName: 'Viewer One' },
        { id: 'viewer-two', displayName: 'Viewer Two' }
      ]
    });

    expect(plugin.db.setGamePlayerLockout).toHaveBeenCalledWith('viewer-two', 'viewer_timeout', 86400000);
    expect(io.emit).toHaveBeenCalledWith('game-engine:player-lockout', expect.objectContaining({
      username: 'viewer-two',
      nickname: 'Viewer Two'
    }));
  });

  test('keeps the opener avatar when a matchmaking challenge falls back to the streamer', () => {
    const { plugin } = createPlugin();
    plugin.db = {
      createSession: jest.fn(() => 91),
      addPlayer2: jest.fn()
    };
    const avatarSource = '/api/game-engine/avatar?url=https%3A%2F%2Fp16.tiktokcdn.com%2Fopener.webp';

    const created = plugin._createInteractiveGame({
      gameType: 'connect4',
      viewerId: 'opener',
      viewerDisplayName: 'Opener',
      hostDisplayName: 'Host',
      participants: [
        { id: 'opener', displayName: 'Opener', role: 'viewer', avatarSource },
        { id: 'streamer', displayName: 'Host', role: 'host', avatarSource: '' }
      ],
      config: { streamerRole: 'player2', player1Color: '#f00', player2Color: '#ff0' },
      triggerType: 'matchmaking_timeout',
      triggerValue: 'connect4'
    });

    expect(created.game.player1).toMatchObject({ username: 'opener', avatarSource });
    expect(created.game.player2).toMatchObject({ username: 'streamer', avatarSource: '' });
  });

  test('expires old matchmaking chat identities while still suppressing a duplicate event', () => {
    const { plugin } = createPlugin();
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    expect(plugin._isDuplicateConnect4MatchmakingEvent({ msgId: 'same' })).toBe(false);
    expect(plugin._isDuplicateConnect4MatchmakingEvent({ msgId: 'same' })).toBe(true);
    Date.now.mockReturnValue(62001);

    expect(plugin._isDuplicateConnect4MatchmakingEvent({ msgId: 'fresh' })).toBe(false);
    expect(plugin.recentConnect4MatchmakingEvents.has('chat:same')).toBe(false);
    Date.now.mockRestore();
  });

  test('does not open or match twice for a deduplicated Connect4 chat event', async () => {
    const { plugin } = createPlugin();
    plugin.interactiveController = {
      startOrJoinConnect4Matchmaking: jest.fn(() => ({
        success: true,
        action: 'opened',
        challenge: { challengeId: 64, status: 'open', expiresAtMs: Date.now() + 30000 }
      }))
    };
    const context = {
      userId: 'deduplicated-viewer',
      username: 'Deduplicated Viewer',
      profilePictureUrl: 'https://p16-sign-va.tiktokcdn.com/avatar.webp',
      rawData: { msgId: 'same-connect4-event' }
    };

    await plugin.handleConnect4StartCommand([], context);
    await expect(plugin.handleConnect4StartCommand([], context)).resolves.toMatchObject({ duplicate: true });

    expect(plugin.interactiveController.startOrJoinConnect4Matchmaking).toHaveBeenCalledTimes(1);
    plugin._clearConnect4MatchmakingExpiry(64);
  });

  test('keeps a recovered unexpired challenge scheduled after plugin reload', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1000000);
    const { plugin } = createPlugin();
    const challenge = {
      challengeId: 71,
      status: 'open',
      openerId: 'reload-opener',
      openerDisplayName: 'Reload Opener',
      expiresAtMs: 1030000
    };
    jest.spyOn(plugin, '_scheduleConnect4MatchmakingExpiry').mockImplementation(() => {});
    plugin._recoverConnect4MatchmakingChallenge(challenge);

    expect(plugin._scheduleConnect4MatchmakingExpiry).toHaveBeenCalledWith(challenge);
    jest.useRealTimers();
  });

  test('starts streamer fallback for an elapsed open challenge during plugin reload recovery', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1040000);
    const { plugin } = createPlugin();
    plugin.interactiveController = {
      beginExpiredConnect4Fallback: jest.fn(() => ({
        success: true,
        challenge: { challengeId: 72, status: 'fallback_pending' }
      })),
      startPendingConnect4Fallback: jest.fn(() => ({ success: true, sessionId: 72 }))
    };
    plugin._resolveHostDisplayName = jest.fn(() => 'Reload Host');
    const challenge = {
      challengeId: 72,
      status: 'open',
      openerId: 'reload-opener',
      openerDisplayName: 'Reload Opener',
      openerAvatarSource: '/api/game-engine/avatar?url=opener',
      expiresAtMs: 1030000
    };

    await expect(plugin._recoverConnect4MatchmakingChallenge(challenge))
      .resolves.toMatchObject({ success: true, sessionId: 72 });
    expect(plugin.interactiveController.beginExpiredConnect4Fallback).toHaveBeenCalledWith(72);
    expect(plugin.interactiveController.startPendingConnect4Fallback).toHaveBeenCalledWith(72, 'Reload Host');
    jest.useRealTimers();
  });

  test('starts exactly one streamer fallback when a later matchmaking event promotes the elapsed challenge before its timer callback', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1000000);
    const { plugin } = createPlugin();
    let fallbackPending = false;
    plugin.interactiveController = {
      startOrJoinConnect4Matchmaking: jest.fn(() => {
        fallbackPending = true;
        return { success: true, action: 'opened' };
      }),
      beginExpiredConnect4Fallback: jest.fn(challengeId => fallbackPending
        ? { success: true, challenge: { challengeId, status: 'fallback_pending' } }
        : { success: false, error: 'challenge_not_expired' }),
      startPendingConnect4Fallback: jest.fn(() => ({ success: true, sessionId: 73 }))
    };
    plugin._resolveHostDisplayName = jest.fn(() => 'Timer Host');
    const challenge = {
      challengeId: 73,
      status: 'open',
      openerId: 'elapsed-opener',
      openerDisplayName: 'Elapsed Opener',
      expiresAtMs: 1030000
    };

    plugin._scheduleConnect4MatchmakingExpiry(challenge);
    jest.advanceTimersByTime(29999);
    plugin.interactiveController.startOrJoinConnect4Matchmaking({
      participantId: 'later-viewer', participantDisplayName: 'Later Viewer'
    });
    jest.advanceTimersByTime(1);
    await Promise.resolve();

    expect(plugin.interactiveController.beginExpiredConnect4Fallback).toHaveBeenCalledWith(73);
    expect(plugin.interactiveController.startPendingConnect4Fallback).toHaveBeenCalledTimes(1);
    expect(plugin.interactiveController.startPendingConnect4Fallback).toHaveBeenCalledWith(73, 'Timer Host');
    jest.useRealTimers();
  });

  test('retains a pending Connect4 fallback at the interactive session limit and never starts an invalidated row', async () => {
    const { plugin } = createPlugin();
    const pending = { challengeId: 74, status: 'fallback_pending' };
    plugin.interactiveController = {
      beginExpiredConnect4Fallback: jest.fn(() => ({ success: true, challenge: pending })),
      startPendingConnect4Fallback: jest.fn(() => ({ success: false, error: 'interactive_session_limit' }))
    };

    await expect(plugin._expireConnect4MatchmakingChallenge({ challengeId: 74, status: 'open' }))
      .resolves.toEqual({ success: false, error: 'interactive_session_limit' });
    expect(pending.status).toBe('fallback_pending');

    plugin.interactiveController.beginExpiredConnect4Fallback.mockReturnValue({
      success: false,
      error: 'challenge_not_expired'
    });
    await expect(plugin._expireConnect4MatchmakingChallenge({ challengeId: 75, status: 'claimed' }))
      .resolves.toEqual({ success: false, error: 'challenge_not_expired' });
    expect(plugin.interactiveController.startPendingConnect4Fallback).toHaveBeenCalledTimes(1);
  });
});
