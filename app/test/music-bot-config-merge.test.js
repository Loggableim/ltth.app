const MusicBotPlugin = require('../plugins/music-bot/main');

function createPluginWithSavedConfig(savedConfig) {
  const db = {
    prepare: jest.fn(() => ({
      run: jest.fn(),
      get: jest.fn(() => ({ count: 0 })),
      all: jest.fn(() => []),
      transaction: jest.fn((fn) => fn())
    }))
  };

  const api = {
    getConfig: jest.fn(() => savedConfig),
    setConfig: jest.fn(),
    ensurePluginDataDir: jest.fn(() => '/tmp/music-bot'),
    getSocketIO: jest.fn(() => ({ emit: jest.fn(), on: jest.fn() })),
    getDatabase: jest.fn(() => db),
    log: jest.fn(),
    emit: jest.fn()
  };

  return {
    plugin: new MusicBotPlugin(api),
    api
  };
}

describe('music-bot config merge behavior', () => {
  test('keeps nested moderation, gift and alias arrays isolated from saved config object', () => {
    const savedConfig = {
      moderation: {
        blockedKeywords: ['blocked-word']
      },
      monetization: {
        payToPlayGiftCatalog: ['Flower', 'Star'],
        payToSkipGiftCatalog: ['SkipGift'],
        payToPlayMinCoins: 25,
        minLikesPerUser: 7
      },
      commandAliases: {
        request: ['rq', 'song'],
        skip: ['skipme']
      }
    };

    const originalSavedConfig = JSON.parse(JSON.stringify(savedConfig));
    const { plugin } = createPluginWithSavedConfig(savedConfig);

    plugin._loadConfig();

    expect(plugin.config.moderation.blockedKeywords).toEqual(['blocked-word']);
    expect(plugin.config.monetization.payToPlayGiftCatalog).toEqual(['Flower', 'Star']);
    expect(plugin.config.monetization.payToSkipGiftCatalog).toEqual(['SkipGift']);
    expect(plugin.config.commandAliases.request).toEqual(['rq', 'song']);
    expect(plugin.config.commandAliases.skip).toEqual(['skipme']);

    plugin.config.moderation.blockedKeywords.push('second');
    plugin.config.monetization.payToPlayGiftCatalog.push('Moon');
    plugin.config.commandAliases.request.push('alias2');

    expect(savedConfig).toEqual(originalSavedConfig);
  });

  test('merges arrays in direct merge calls by copying values, not reusing references', () => {
    const { plugin } = createPluginWithSavedConfig();
    const base = {
      moderation: {
        blockedKeywords: ['one']
      },
      monetization: {
        payToPlayGiftCatalog: ['old-play']
      },
      commandAliases: {
        request: ['old-request']
      }
    };
    const update = {
      moderation: {
        blockedKeywords: ['new-blocked']
      },
      monetization: {
        payToPlayGiftCatalog: ['new-gift']
      },
      commandAliases: {
        request: ['req2']
      }
    };

    const merged = plugin._mergeDeep(base, update);

    expect(merged).toEqual({
      moderation: {
        blockedKeywords: ['new-blocked']
      },
      monetization: {
        payToPlayGiftCatalog: ['new-gift']
      },
      commandAliases: {
        request: ['req2']
      }
    });

    merged.moderation.blockedKeywords.push('another');
    merged.monetization.payToPlayGiftCatalog.push('other');
    merged.commandAliases.request.push('another');

    expect(update.moderation.blockedKeywords).toEqual(['new-blocked']);
    expect(update.monetization.payToPlayGiftCatalog).toEqual(['new-gift']);
    expect(update.commandAliases.request).toEqual(['req2']);
  });
});
