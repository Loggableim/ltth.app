const MusicBotPlugin = require('../plugins/music-bot/main');

function createApi() {
  const handlers = {};
  return {
    handlers,
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(),
      transaction: jest.fn((fn) => fn())
    })),
    ensurePluginDataDir: jest.fn(() => 'C:/tmp/music-bot-test'),
    getSocketIO: jest.fn(() => ({ emit: jest.fn(), on: jest.fn(), off: jest.fn() })),
    registerRoute: jest.fn((method, path, handler) => {
      handlers[`${method.toUpperCase()}:${path}`] = handler;
    }),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    setConfig: jest.fn(async () => true),
    log: jest.fn(),
    emit: jest.fn()
  };
}

function createResponseMock() {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn();
  return response;
}

function hydratePluginForConfigRoute(plugin) {
  plugin.config = {
    ...plugin.config,
    moderation: {
      rejectAgeRestricted: true,
      rejectExplicit: false,
      blockedKeywords: ['legacy-blocked']
    },
    monetization: {
      payToPlayEnabled: false,
      payToPlayGiftCatalog: ['legacy-play'],
      payToPlayMinCoins: 0,
      payToSkipEnabled: false,
      payToSkipGiftCatalog: ['legacy-skip'],
      likeGateEnabled: false,
      minLikesPerUser: 1
    },
    commandAliases: {
      request: ['old-request'],
      skip: ['old-skip'],
      queue: ['q'],
      nowPlaying: ['np'],
      volume: ['v'],
      pause: ['hold'],
      resume: ['continue'],
      clear: [],
      mysong: ['my'],
      help: ['cmds'],
      remove: ['rem']
    },
    queue: { ...plugin.config.queue },
    playback: { ...plugin.config.playback },
    resolver: { ...plugin.config.resolver },
    audio: { ...plugin.config.audio },
    commands: { ...plugin.config.commands },
    giftIntegration: { ...plugin.config.giftIntegration },
    onboarding: { ...plugin.config.onboarding }
  };

  plugin.queueManager = {
    config: null,
    queueConfig: null
  };
  plugin.playbackEngine = {
    config: null,
    setVolume: jest.fn(async () => true)
  };
  plugin.musicResolver = { updateConfig: jest.fn() };
  plugin.autoDJ = { updateConfig: jest.fn() };
}

describe('music-bot POST /api/plugins/music-bot/config', () => {
  test('applies the persisted Crossfade duration to the playback engine', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    plugin._registerRoutes();
    const response = createResponseMock();

    await api.handlers['POST:/api/plugins/music-bot/config']({
      body: { playback: { crossfadeDuration: 8000 } }
    }, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(plugin.config.playback.crossfadeDuration).toBe(8000);
    expect(plugin.playbackEngine.config.crossfadeDuration).toBe(8000);
  });

  test('schedules cache cleanup after a config update without awaiting it in the request', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    const cleanup = new Promise(() => {});
    plugin.mediaCache = { schedulePrune: jest.fn(() => cleanup) };
    plugin._registerRoutes();
    const response = createResponseMock();

    await api.handlers['POST:/api/plugins/music-bot/config']({
      body: { queue: { maxLength: 61 } }
    }, response);

    expect(plugin.mediaCache.schedulePrune).toHaveBeenCalledWith({ protectedKeys: [] });
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('rejects malformed nested sections without mutating or persisting runtime config', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    const previousConfig = plugin.config;
    plugin._registerRoutes();
    const response = createResponseMock();

    await api.handlers['POST:/api/plugins/music-bot/config']({ body: { queue: null } }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(plugin.config).toBe(previousConfig);
    expect(api.setConfig).not.toHaveBeenCalled();
    expect(plugin.musicResolver.updateConfig).not.toHaveBeenCalled();
    expect(plugin.autoDJ.updateConfig).not.toHaveBeenCalled();
  });

  test('persistence failure leaves all runtime consumers on the previous config snapshot', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    const previousConfig = plugin.config;
    api.setConfig.mockRejectedValueOnce(new Error('config database unavailable'));
    plugin._registerRoutes();
    const response = createResponseMock();

    await api.handlers['POST:/api/plugins/music-bot/config']({
      body: { queue: { maxLength: previousConfig.queue.maxLength + 10 } }
    }, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(plugin.config).toBe(previousConfig);
    expect(plugin.queueManager.config).toBe(previousConfig);
    expect(plugin.queueManager.queueConfig).toBe(previousConfig.queue);
    expect(plugin.playbackEngine.setVolume).not.toHaveBeenCalled();
    expect(api.setConfig).toHaveBeenCalledTimes(1);
  });

  test('treats the production setConfig false result as a failed commit', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    const previousConfig = plugin.config;
    api.setConfig.mockResolvedValueOnce(false);
    plugin._registerRoutes();
    const response = createResponseMock();

    await api.handlers['POST:/api/plugins/music-bot/config']({
      body: { queue: { maxLength: previousConfig.queue.maxLength + 10 } }
    }, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.stringContaining('persist')
    }));
    expect(plugin.config).toBe(previousConfig);
    expect(plugin.queueManager.config).toBe(previousConfig);
    expect(plugin.playbackEngine.setVolume).not.toHaveBeenCalled();
    expect(api.setConfig).toHaveBeenCalledTimes(1);
  });

  test('component failure rolls back the persisted and distributed config snapshot', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    const previousConfig = plugin.config;
    plugin.playbackEngine.updateConfig = jest.fn()
      .mockImplementationOnce(() => { throw new Error('controller rejected config'); })
      .mockImplementationOnce(() => {});
    plugin._registerRoutes();
    const response = createResponseMock();

    await api.handlers['POST:/api/plugins/music-bot/config']({
      body: { playback: { crossfadeDuration: 4321 } }
    }, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(plugin.config).toBe(previousConfig);
    expect(plugin.queueManager.config).toBe(previousConfig);
    expect(plugin.playbackEngine.updateConfig).toHaveBeenCalledTimes(2);
    expect(api.setConfig).toHaveBeenNthCalledWith(1, 'config', expect.objectContaining({
      playback: expect.objectContaining({ crossfadeDuration: 4321 })
    }));
    expect(api.setConfig).toHaveBeenNthCalledWith(2, 'config', previousConfig);
  });

  test('reports a false setConfig result while rolling back a failed runtime distribution', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    const previousConfig = plugin.config;
    plugin.playbackEngine.updateConfig = jest.fn()
      .mockImplementationOnce(() => { throw new Error('controller rejected config'); })
      .mockImplementationOnce(() => {});
    api.setConfig
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    plugin._registerRoutes();
    const response = createResponseMock();

    await api.handlers['POST:/api/plugins/music-bot/config']({
      body: { playback: { crossfadeDuration: 5432 } }
    }, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(api.setConfig).toHaveBeenNthCalledWith(2, 'config', previousConfig);
    expect(api.log).toHaveBeenCalledWith(
      expect.stringContaining('persistence rollback failed'),
      'error'
    );
  });

  test('serializes overlapping updates so a late A rollback cannot overwrite successful B', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    const baselineCrossfade = plugin.config.playback.crossfadeDuration;
    const persistedSnapshots = [];
    api.setConfig.mockImplementation(async (_key, config) => {
      persistedSnapshots.push(structuredClone(config));
      return true;
    });
    plugin.playbackEngine.updateConfig = jest.fn();
    let rejectFirstVolume;
    let markFirstVolumeStarted;
    const firstVolumeStarted = new Promise((resolve) => {
      markFirstVolumeStarted = resolve;
    });
    plugin.playbackEngine.setVolume
      .mockImplementationOnce(() => {
        markFirstVolumeStarted();
        return new Promise((_resolve, reject) => {
          rejectFirstVolume = reject;
        });
      })
      .mockResolvedValue(true);
    plugin._registerRoutes();
    const handler = api.handlers['POST:/api/plugins/music-bot/config'];
    const responseA = createResponseMock();
    const responseB = createResponseMock();

    const requestA = handler({
      body: { playback: { crossfadeDuration: baselineCrossfade + 111 } }
    }, responseA);
    await firstVolumeStarted;
    const requestB = handler({
      body: { queue: { maxLength: 77 } }
    }, responseB);
    await Promise.resolve();
    await Promise.resolve();

    expect(api.setConfig).toHaveBeenCalledTimes(1);
    rejectFirstVolume(new Error('late A volume failure'));
    await Promise.all([requestA, requestB]);

    expect(responseA.status).toHaveBeenCalledWith(500);
    expect(responseB.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(api.setConfig).toHaveBeenCalledTimes(3);
    expect(persistedSnapshots.at(-1)).toEqual(plugin.config);
    expect(plugin.config.queue.maxLength).toBe(77);
    expect(plugin.config.playback.crossfadeDuration).toBe(baselineCrossfade);
    expect(plugin.queueManager.config).toBe(plugin.config);
  });

  test('serializes a volume update ahead of a concurrent general config save', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    const persistedSnapshots = [];
    api.setConfig.mockImplementation(async (_key, config) => {
      persistedSnapshots.push(structuredClone(config));
      return true;
    });
    let releaseVolume;
    let markVolumeStarted;
    const volumeStarted = new Promise((resolve) => { markVolumeStarted = resolve; });
    plugin._applyAudioVolume = jest.fn()
      .mockImplementationOnce(() => {
        markVolumeStarted();
        return new Promise((resolve) => { releaseVolume = resolve; });
      })
      .mockResolvedValue(40);
    plugin._registerRoutes();
    const volumeResponse = createResponseMock();
    const configResponse = createResponseMock();

    const volumeRequest = api.handlers['POST:/api/plugins/music-bot/volume']({
      body: { sourceVolume: 80 }
    }, volumeResponse);
    await volumeStarted;
    const configRequest = api.handlers['POST:/api/plugins/music-bot/config']({
      body: { queue: { maxLength: 77 } }
    }, configResponse);
    await Promise.resolve();
    await Promise.resolve();

    expect(persistedSnapshots).toHaveLength(1);
    expect(persistedSnapshots[0]).toMatchObject({
      audio: { sourceVolume: 80 },
      queue: { maxLength: plugin.config.queue.maxLength }
    });

    releaseVolume(40);
    await Promise.all([volumeRequest, configRequest]);

    expect(persistedSnapshots).toHaveLength(2);
    expect(persistedSnapshots.at(-1)).toEqual(plugin.config);
    expect(plugin.config.queue.maxLength).toBe(77);
  });

  test('rejects a queued update when the plugin lifecycle ends before its turn', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    plugin.playbackEngine.updateConfig = jest.fn();
    let rejectFirstVolume;
    let markFirstVolumeStarted;
    const firstVolumeStarted = new Promise((resolve) => {
      markFirstVolumeStarted = resolve;
    });
    plugin.playbackEngine.setVolume
      .mockImplementationOnce(() => {
        markFirstVolumeStarted();
        return new Promise((_resolve, reject) => {
          rejectFirstVolume = reject;
        });
      })
      .mockResolvedValue(true);
    plugin._registerRoutes();
    const handler = api.handlers['POST:/api/plugins/music-bot/config'];
    const responseA = createResponseMock();
    const responseB = createResponseMock();

    const requestA = handler({
      body: { playback: { crossfadeDuration: 4100 } }
    }, responseA);
    await firstVolumeStarted;
    const requestB = handler({
      body: { queue: { maxLength: 88 } }
    }, responseB);
    const destroying = plugin.destroy();
    rejectFirstVolume(new Error('A aborted during destroy'));
    await Promise.all([requestA, requestB, destroying]);

    expect(responseA.status).toHaveBeenCalledWith(503);
    expect(responseB.status).toHaveBeenCalledWith(503);
    expect(responseB.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(api.setConfig).toHaveBeenCalledTimes(2);
    expect(api.setConfig.mock.calls.some(([, config]) => config.queue.maxLength === 88)).toBe(false);
  });

  test('merges arrays and persists merged config including blocked keywords, aliases and gift catalogs', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);

    const payload = {
      moderation: {
        blockedKeywords: ['api-blocked-a', 'api-blocked-b']
      },
      monetization: {
        payToPlayEnabled: true,
        payToPlayGiftCatalog: ['  api gift one ', 'api gift two  '],
        payToPlayMinCoins: 5,
        payToSkipGiftCatalog: ['skip gift'],
        payToSkipEnabled: true,
        likeGateEnabled: false,
        minLikesPerUser: 2
      },
      commandAliases: {
        request: ['SR2', 'Song2']
      }
    };

    plugin._registerRoutes();
    const handler = api.handlers['POST:/api/plugins/music-bot/config'];
    const req = { body: payload };
    const res = createResponseMock();

    await handler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.config.moderation.blockedKeywords).toEqual(['api-blocked-a', 'api-blocked-b']);
    expect(body.config.monetization.payToPlayGiftCatalog).toEqual(['api gift one', 'api gift two']);
    expect(body.config.monetization.payToSkipGiftCatalog).toEqual(['skip gift']);
    expect(body.config.commandAliases.request).toEqual(['sr2', 'song2']);
    expect(body.config.commandAliases.skip).toEqual(['old-skip']);

    expect(payload.monetization.payToPlayGiftCatalog).toEqual(['  api gift one ', 'api gift two  ']);
    expect(payload.commandAliases.request).toEqual(['SR2', 'Song2']);

    const persisted = api.setConfig.mock.calls[0][1];
    expect(persisted).toEqual(body.config);
    expect(api.setConfig).toHaveBeenCalledTimes(1);
    expect(api.setConfig).toHaveBeenCalledWith('config', body.config);
    expect(plugin.playbackEngine.setVolume).toHaveBeenCalled();
    expect(plugin.musicResolver.updateConfig).toHaveBeenCalled();
    expect(plugin.autoDJ.updateConfig).toHaveBeenCalled();
  });

  test('keeps merged config persisted and readable by the next GET after POST', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);

    plugin._registerRoutes();
    const postHandler = api.handlers['POST:/api/plugins/music-bot/config'];
    const getHandler = api.handlers['GET:/api/plugins/music-bot/config'];

    const payload = {
      moderation: {
        blockedKeywords: ['vip', 'scam']
      },
      monetization: {
        payToPlayEnabled: true,
        payToPlayGiftCatalog: ['  rose ', 'gg  '],
        payToPlayMinCoins: 4,
        payToSkipGiftCatalog: ['Star', ' '],
        payToSkipEnabled: true,
        likeGateEnabled: false,
        minLikesPerUser: 2
      },
      commandAliases: {
        request: ['SRX']
      }
    };

    const postReq = { body: payload };
    const postRes = createResponseMock();
    await postHandler(postReq, postRes);

    expect(postRes.status).not.toHaveBeenCalledWith(400);
    expect(postRes.json).toHaveBeenCalled();
    const postBody = postRes.json.mock.calls[0][0];
    expect(postBody.success).toBe(true);

    const persisted = api.setConfig.mock.calls[api.setConfig.mock.calls.length - 1][1];
    expect(persisted).toEqual(postBody.config);

    const getReq = {};
    const getRes = createResponseMock();
    await getHandler(getReq, getRes);

    expect(getRes.json).toHaveBeenCalled();
    const getBody = getRes.json.mock.calls[0][0];
    expect(getBody.success).toBe(true);
    expect(getBody.config).toEqual(persisted);
    expect(getBody.config.moderation.blockedKeywords).toEqual(['vip', 'scam']);
    expect(getBody.config.monetization.payToPlayGiftCatalog).toEqual(['rose', 'gg']);
    expect(getBody.config.monetization.payToSkipGiftCatalog).toEqual(['Star']);
    expect(getBody.config.commandAliases.request).toEqual(['srx']);
    expect(getBody.config.commandAliases.skip).toEqual(['old-skip']);
  });

  test('normalizes Radio-Mix values submitted through the general config route', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    plugin._applyAudioVolume = jest.fn(async () => {});
    plugin._registerRoutes();

    const handler = api.handlers['POST:/api/plugins/music-bot/config'];
    const res = createResponseMock();
    await handler({ body: {
      autoDJ: {
        mode: 'mix',
        mixHistoryPercent: -12,
        repeatCooldownHours: 300,
        genreFilterEnabled: true,
        selectedGenres: ['Rock', 'Electronic', 'rock'],
        artistSpacingMinutes: -10,
        albumSpacingMinutes: 999999,
        noveltyBudgetPercent: 20.9,
        requestSeedsEnabled: false,
        liveFeedbackEnabled: false,
        previewEnabled: false,
        chatVotingEnabled: true,
        chatVoteCloseBeforeEndSeconds: 1
      }
    } }, res);

    const persisted = api.setConfig.mock.calls[0][1];
    expect(persisted.autoDJ).toMatchObject({
      mode: 'mix',
      mixHistoryPercent: 0,
      repeatCooldownHours: 168,
      selectedGenres: ['rock', 'electronic'],
      artistSpacingMinutes: 0,
      albumSpacingMinutes: 10080,
      noveltyBudgetPercent: 20,
      requestSeedsEnabled: false,
      liveFeedbackEnabled: false,
      previewEnabled: false,
      chatVotingEnabled: true,
      chatVoteCloseBeforeEndSeconds: 5
    });
    expect(plugin.autoDJ.updateConfig).toHaveBeenCalledWith(persisted.autoDJ);
  });

  test('regression: merges and persists blocked keywords, aliases and both gift catalogs in one API update path', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);

    const payload = {
      moderation: {
        blockedKeywords: ['vip', 'scam']
      },
      commandAliases: {
        request: ['SR2', 'Song2']
      },
      monetization: {
        payToPlayGiftCatalog: ['  rose ', ' gg '],
        payToSkipGiftCatalog: ['  star '],
        payToPlayEnabled: true,
        payToSkipEnabled: true,
        payToPlayMinCoins: 5,
        likeGateEnabled: false,
        minLikesPerUser: 2
      }
    };

    plugin._registerRoutes();
    const postHandler = api.handlers['POST:/api/plugins/music-bot/config'];
    const getHandler = api.handlers['GET:/api/plugins/music-bot/config'];
    const postReq = { body: payload };
    const postRes = createResponseMock();

    await postHandler(postReq, postRes);

    expect(postRes.status).not.toHaveBeenCalledWith(400);
    expect(postRes.json).toHaveBeenCalled();
    const postBody = postRes.json.mock.calls[0][0];
    expect(postBody.success).toBe(true);
    expect(postBody.config.moderation.blockedKeywords).toEqual(['vip', 'scam']);
    expect(postBody.config.commandAliases.request).toEqual(['sr2', 'song2']);
    expect(postBody.config.commandAliases.skip).toEqual(['old-skip']);
    expect(postBody.config.monetization.payToPlayGiftCatalog).toEqual(['rose', 'gg']);
    expect(postBody.config.monetization.payToSkipGiftCatalog).toEqual(['star']);
    expect(postBody.config.queue).toEqual(plugin.config.queue);
    expect(postBody.config.commandAliases.queue).toEqual(['q']);

    const persisted = api.setConfig.mock.calls[api.setConfig.mock.calls.length - 1][1];
    expect(api.setConfig).toHaveBeenCalledTimes(1);
    expect(persisted).toEqual(postBody.config);

    const getRes = createResponseMock();
    await getHandler({}, getRes);
    const getBody = getRes.json.mock.calls[0][0];
    expect(getBody.success).toBe(true);
    expect(getBody.config).toEqual(persisted);
    expect(getBody.config.moderation.blockedKeywords).toEqual(['vip', 'scam']);
    expect(getBody.config.commandAliases.request).toEqual(['sr2', 'song2']);
    expect(getBody.config.commandAliases.skip).toEqual(['old-skip']);
    expect(getBody.config.monetization.payToPlayGiftCatalog).toEqual(['rose', 'gg']);
    expect(getBody.config.monetization.payToSkipGiftCatalog).toEqual(['star']);
  });
});

describe('music-bot Auto-DJ routes', () => {
  test('queues a viewer request behind an active track without skipping it', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.config = {
      ...plugin.config,
      playback: { ...plugin.config.playback, autoPlay: true },
      monetization: { ...plugin.config.monetization, likeGateEnabled: false, payToPlayEnabled: false }
    };
    plugin.banList = {
      isUserBanned: jest.fn(() => ({ banned: false })),
      isUrlBanned: jest.fn(() => ({ banned: false })),
      isKeywordBanned: jest.fn(() => ({ banned: false })),
      isChannelBanned: jest.fn(() => ({ banned: false }))
    };
    plugin.musicResolver = {
      resolve: jest.fn(async () => ({
        success: true,
        song: { id: 'requested-song', title: 'I Need a Hero', url: 'https://example.test/hero.mp3' }
      }))
    };
    plugin.queueManager = { addSong: jest.fn(() => ({ success: true, song: { id: 'requested-song' }, position: 1 })) };
    plugin.autoDJ = { onSongRequested: jest.fn() };
    plugin.playbackEngine = { getState: jest.fn(() => 'playing') };
    plugin._schedulePreCache = jest.fn();
    plugin._emitSongAdded = jest.fn();
    plugin._emitChatResponse = jest.fn();
    plugin._emitToast = jest.fn();
    plugin._skipCurrent = jest.fn();
    plugin._playNextFromQueue = jest.fn();

    await plugin._handleRequest('I Need a Hero', 'viewer');

    expect(plugin.queueManager.addSong).toHaveBeenCalledTimes(1);
    expect(plugin._skipCurrent).not.toHaveBeenCalled();
    expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
  });

  test('starts Auto-DJ immediately when it is enabled while the player and queue are idle', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.queueManager = { getQueue: jest.fn(() => []) };
    plugin.playbackEngine = { isPlaying: jest.fn(() => false) };
    plugin.autoDJ = {
      updateConfig: jest.fn(),
      activate: jest.fn(),
      getStatus: jest.fn(() => ({ enabled: true, lastResult: { state: 'playing' } }))
    };
    const track = { title: 'Auto-DJ Song', youtubeId: 'autodj123' };
    plugin._maybePlayAutoDJ = jest.fn(async () => track);
    plugin._registerRoutes();

    const handler = api.handlers['POST:/api/plugins/music-bot/auto-dj/toggle'];
    const res = createResponseMock();
    await handler({ body: { enabled: true, mode: 'random' } }, res);

    expect(plugin.autoDJ.activate).toHaveBeenCalledTimes(1);
    expect(plugin._maybePlayAutoDJ).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, track }));
  });

  test('normalizes Radio-Mix config before persisting the Auto-DJ toggle payload', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.queueManager = { getQueue: jest.fn(() => []) };
    plugin.playbackEngine = { isPlaying: jest.fn(() => true) };
    plugin.autoDJ = {
      updateConfig: jest.fn(),
      getStatus: jest.fn(() => ({ enabled: false }))
    };
    plugin._registerRoutes();

    const handler = api.handlers['POST:/api/plugins/music-bot/auto-dj/toggle'];
    const res = createResponseMock();
    await handler({ body: {
      enabled: false,
      mode: 'mix',
      mixHistoryPercent: 140.9,
      repeatCooldownHours: 0
    } }, res);

    const persisted = api.setConfig.mock.calls[0][1];
    expect(persisted.autoDJ).toMatchObject({
      enabled: false,
      mode: 'mix',
      mixHistoryPercent: 100,
      repeatCooldownHours: 1
    });
    expect(plugin.autoDJ.updateConfig).toHaveBeenCalledWith(persisted.autoDJ);
  });

  test('rejects a string Auto-DJ enabled flag instead of treating it as true', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.queueManager = { getQueue: jest.fn(() => []) };
    plugin.playbackEngine = { isPlaying: jest.fn(() => true) };
    plugin.autoDJ = {
      updateConfig: jest.fn(),
      activate: jest.fn(),
      getStatus: jest.fn(() => ({ enabled: false }))
    };
    plugin._registerRoutes();
    const response = createResponseMock();

    await api.handlers['POST:/api/plugins/music-bot/auto-dj/toggle']({
      body: { enabled: 'false' }
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.stringContaining('enabled')
    }));
    expect(api.setConfig).not.toHaveBeenCalled();
    expect(plugin.autoDJ.updateConfig).not.toHaveBeenCalled();
  });

  test('serializes an Auto-DJ toggle with a concurrent general config save', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    hydratePluginForConfigRoute(plugin);
    plugin.playbackEngine.isPlaying = jest.fn(() => true);
    plugin.autoDJ = {
      updateConfig: jest.fn(),
      activate: jest.fn(),
      getStatus: jest.fn(() => ({ enabled: true }))
    };
    plugin.queueManager.getQueue = jest.fn(() => []);
    let releaseFirstPersist;
    let markFirstPersistStarted;
    const firstPersistStarted = new Promise((resolve) => { markFirstPersistStarted = resolve; });
    api.setConfig.mockImplementationOnce(() => {
      markFirstPersistStarted();
      return new Promise((resolve) => { releaseFirstPersist = resolve; });
    }).mockResolvedValue(true);
    plugin._registerRoutes();
    const toggleResponse = createResponseMock();
    const configResponse = createResponseMock();

    const toggleRequest = api.handlers['POST:/api/plugins/music-bot/auto-dj/toggle']({
      body: { enabled: true }
    }, toggleResponse);
    await firstPersistStarted;
    const configRequest = api.handlers['POST:/api/plugins/music-bot/config']({
      body: { queue: { maxLength: 77 } }
    }, configResponse);
    await Promise.resolve();
    await Promise.resolve();

    expect(api.setConfig).toHaveBeenCalledTimes(1);

    releaseFirstPersist(true);
    await Promise.all([toggleRequest, configRequest]);

    expect(api.setConfig).toHaveBeenCalledTimes(2);
    expect(plugin.config).toMatchObject({
      autoDJ: { enabled: true },
      queue: { maxLength: 77 }
    });
  });

  test('starts a selected queue item when the player has no current track', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    const selected = { id: 'queued-song', title: 'Queued Song' };
    plugin.queueManager = {
      reorderSong: jest.fn(() => ({ success: true })),
      getQueue: jest.fn(() => [selected])
    };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => null) };
    plugin._playNextFromQueue = jest.fn(async () => ({ success: true, song: selected }));
    plugin._emitQueue = jest.fn();
    plugin._registerRoutes();

    const handler = api.handlers['POST:/api/plugins/music-bot/queue/:index/play'];
    const res = createResponseMock();
    await handler({ params: { index: '0' } }, res);

    expect(plugin.queueManager.reorderSong).toHaveBeenCalledWith(0, 0);
    expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      track: selected
    }));
  });

  test('starts the selected song by ID when its rendered queue index is stale', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    const selected = { id: 'queued-song', title: 'Queued Song' };
    plugin.queueManager = {
      reorderSong: jest.fn(() => ({ success: true })),
      getQueue: jest.fn(() => [{ id: 'new-first-song', title: 'New First Song' }, selected])
    };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => null) };
    plugin._playNextFromQueue = jest.fn(async () => ({ success: true, song: selected }));
    plugin._emitQueue = jest.fn();
    plugin._registerRoutes();

    const handler = api.handlers['POST:/api/plugins/music-bot/queue/:index/play'];
    const res = createResponseMock();
    await handler({ params: { index: '3' }, body: { songId: selected.id } }, res);

    expect(plugin.queueManager.reorderSong).toHaveBeenCalledWith(1, 0);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      track: selected
    }));
  });

  test('treats a stale Queue Play click for the current track as already playing', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    const current = { id: 'requested-song', title: 'I Need a Hero' };
    plugin.queueManager = {
      reorderSong: jest.fn(() => ({ success: false, error: 'Invalid source position' })),
      getQueue: jest.fn(() => [])
    };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => current) };
    plugin._emitQueue = jest.fn();
    plugin._registerRoutes();

    const handler = api.handlers['POST:/api/plugins/music-bot/queue/:index/play'];
    const res = createResponseMock();
    await handler({ params: { index: '0' }, body: { songId: current.id } }, res);

    expect(plugin.queueManager.reorderSong).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      track: current,
      alreadyPlaying: true
    }));
  });

  test('returns a stale Queue Play response when the selected ID is absent', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.queueManager = {
      reorderSong: jest.fn(() => ({ success: false, error: 'Invalid source position' })),
      getQueue: jest.fn(() => [])
    };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => null) };
    plugin._emitQueue = jest.fn();
    plugin._registerRoutes();

    const handler = api.handlers['POST:/api/plugins/music-bot/queue/:index/play'];
    const res = createResponseMock();
    await handler({ params: { index: '0' }, body: { songId: 'removed-song' } }, res);

    expect(plugin.queueManager.reorderSong).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      staleQueue: true
    }));
  });

  test('reorders songs by ID when rendered queue indices are stale', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    const source = { id: 'second-song', title: 'Second Song' };
    const target = { id: 'first-song', title: 'First Song' };
    plugin.queueManager = {
      reorderSong: jest.fn(() => ({ success: true })),
      getQueue: jest.fn(() => [target, source])
    };
    plugin._emitQueue = jest.fn();
    plugin._registerRoutes();

    const handler = api.handlers['POST:/api/plugins/music-bot/queue/reorder'];
    const res = createResponseMock();
    await handler({
      body: {
        fromIndex: 4,
        toIndex: 3,
        sourceSongId: source.id,
        targetSongId: target.id
      }
    }, res);

    expect(plugin.queueManager.reorderSong).toHaveBeenCalledWith(1, 0);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('uses resume as a recovery action when a queue is waiting without a current track', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    const queued = { id: 'queued-song', title: 'Queued Song' };
    plugin.queueManager = { getQueue: jest.fn(() => [queued]) };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => null) };
    plugin._playNextFromQueue = jest.fn(async () => ({ success: true, song: queued }));
    plugin._registerRoutes();

    const handler = api.handlers['POST:/api/plugins/music-bot/resume'];
    const res = createResponseMock();
    await handler({}, res);

    expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      track: queued,
      resumed: false
    }));
  });
});
