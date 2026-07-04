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

describe('music-bot POST /api/plugins/music-bot/config', () => {
  test('merges arrays and persists merged config including blocked keywords, aliases and gift catalogs', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);

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
});
