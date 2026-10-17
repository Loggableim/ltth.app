const MusicBotPlugin = require('../plugins/music-bot/main');

function createPlugin(catalog) {
  const routes = new Map();
  const api = {
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    getDatabase: jest.fn(() => ({})),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin.musicCatalog = catalog;
  plugin._registerRoutes();
  return { api, handler: routes.get('put:/api/plugins/music-bot/catalog/songs/:songId/genres') };
}

function response() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('music-bot catalog genres route', () => {
  test('returns generic 500 for unexpected catalog or SQLite errors without leaking details', async () => {
    const privateMessage = 'SQLITE path=C:\\profiles\\private\\music.db CANARY';
    const privateCode = 'SQLITE_INTERNAL_CANARY';
    const { handler } = createPlugin({
      setSongGenres: jest.fn(() => { throw Object.assign(new Error(privateMessage), { code: privateCode }); })
    });
    const res = response();

    await handler({ params: { songId: '17' }, body: { genres: ['Rock'] } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Catalog genres could not be updated' });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(privateMessage);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(privateCode);
  });

  test('preserves invalid song ID and catalog not-found responses', async () => {
    const setSongGenres = jest.fn()
      .mockImplementationOnce(() => { throw Object.assign(new Error('internal lookup detail'), { code: 'CATALOG_SONG_NOT_FOUND' }); });
    const { handler } = createPlugin({ setSongGenres });

    const invalidId = response();
    await handler({ params: { songId: '0' }, body: { genres: ['Rock'] } }, invalidId);
    expect(invalidId.status).toHaveBeenCalledWith(400);
    expect(invalidId.json).toHaveBeenCalledWith({ success: false, error: 'Invalid song ID' });
    expect(setSongGenres).not.toHaveBeenCalled();

    const missingSong = response();
    await handler({ params: { songId: '17' }, body: { genres: ['Rock'] } }, missingSong);
    expect(missingSong.status).toHaveBeenCalledWith(404);
    expect(missingSong.json).toHaveBeenCalledWith({
      success: false, error: 'Catalog song not found', code: 'CATALOG_SONG_NOT_FOUND'
    });
  });
});
