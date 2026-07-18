jest.mock('../plugins/music-bot/lib/music-catalog', () => jest.fn());

const MusicCatalog = require('../plugins/music-bot/lib/music-catalog');
const MusicBotPlugin = require('../plugins/music-bot/main');

function createApi() {
  return {
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    getDatabase: jest.fn(() => ({})),
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(),
    ensurePluginDataDir: jest.fn(() => require('path').join(require('os').tmpdir(), 'music-bot-catalog-lifecycle')),
    log: jest.fn(),
    emit: jest.fn()
  };
}

describe('music-bot catalog lifecycle', () => {
  beforeEach(() => {
    MusicCatalog.mockReset();
  });

  it('keeps construction inert, then initializes and migrates the catalog during plugin init', async () => {
    const migration = jest.fn(() => ({ imported: 2, skipped: 1 }));
    MusicCatalog.mockImplementation(() => ({ migrateLegacyHistory: migration }));
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin._ensureYtDlp = jest.fn(async () => {});
    plugin._ensureMpv = jest.fn(async () => {});
    plugin._reconcilePlaybackProcessesAtInit = jest.fn(async () => {});
    plugin._registerPlaybackEvents = jest.fn();
    plugin._registerRoutes = jest.fn();
    plugin._registerSocketEvents = jest.fn();
    plugin._registerTikTokEvents = jest.fn();
    plugin._registerDuckingHooks = jest.fn();
    plugin._restoreState = jest.fn(async () => {});
    plugin._emitSetupStatus = jest.fn();

    expect(plugin.musicCatalog).toBeNull();
    await plugin.init();

    expect(MusicCatalog).toHaveBeenCalledWith(api);
    expect(plugin.musicCatalog).toEqual(expect.objectContaining({ migrateLegacyHistory: migration }));
    expect(migration).toHaveBeenCalledTimes(1);
    expect(api.log).toHaveBeenCalledWith(
      '[music-bot] Catalog history migration: 2 imported, 1 already linked',
      'info'
    );
  });
});
