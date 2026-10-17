const Database = require('better-sqlite3');
const MusicBotPlugin = require('../plugins/music-bot/main');
const MusicCatalog = require('../plugins/music-bot/lib/music-catalog');

describe('music-bot catalog search route', () => {
  it('returns locally indexed title, artist, and genre matches from the real catalog service', async () => {
    const db = new Database(':memory:');
    const routes = new Map();
    const api = {
      getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
      getDatabase: () => db,
      registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
      log: jest.fn()
    };
    const plugin = new MusicBotPlugin(api);
    plugin.musicCatalog = new MusicCatalog(api);

    try {
      plugin.musicCatalog.resolveOrUpsert({
        title: 'Fixture Search Song',
        artist: 'Fixture Search Artist',
        genres: ['Electronic'],
        provider: 'youtube',
        providerId: 'fixture-search-only'
      });
      plugin._registerRoutes();
      const handler = routes.get('get:/api/plugins/music-bot/catalog/search');
      expect(handler).toEqual(expect.any(Function));

      const response = { json: jest.fn() };
      await handler({ query: { q: 'fixture search artist', limit: '5' } }, response);

      expect(response.json).toHaveBeenCalledWith({
        success: true,
        songs: [expect.objectContaining({
          title: 'Fixture Search Song',
          artist: 'Fixture Search Artist',
          genres: ['electronic']
        })]
      });
    } finally {
      db.close();
    }
  });
});
