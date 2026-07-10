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
});
