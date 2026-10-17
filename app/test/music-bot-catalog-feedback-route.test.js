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
  return { api, handler: routes.get('post:/api/plugins/music-bot/catalog/songs/:songId/feedback') };
}

function response() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('music-bot catalog feedback route', () => {
  test('returns generic 500 for unexpected catalog or SQLite errors without leaking details', async () => {
    const privateMessage = 'SQLITE path=C:\\profiles\\private\\music.db CANARY';
    const privateCode = 'SQLITE_INTERNAL_CANARY';
    const { handler } = createPlugin({
      setFeedback: jest.fn(() => { throw Object.assign(new Error(privateMessage), { code: privateCode }); })
    });
    const res = response();

    await handler({ params: { songId: '17' }, body: { state: 'up' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Catalog feedback could not be updated' });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(privateMessage);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(privateCode);
  });

  test('preserves documented invalid-input and missing-song responses', async () => {
    const setFeedback = jest.fn()
      .mockImplementationOnce(() => { throw new Error('Invalid feedback state'); })
      .mockImplementationOnce(() => { throw Object.assign(new Error('internal lookup detail'), { code: 'CATALOG_SONG_NOT_FOUND' }); });
    const { handler } = createPlugin({ setFeedback });

    const invalidState = response();
    await handler({ params: { songId: '17' }, body: { state: 'invalid' } }, invalidState);
    expect(invalidState.status).toHaveBeenCalledWith(400);
    expect(invalidState.json).toHaveBeenCalledWith({ success: false, error: 'Invalid feedback state' });

    const missingSong = response();
    await handler({ params: { songId: '17' }, body: { state: 'up' } }, missingSong);
    expect(missingSong.status).toHaveBeenCalledWith(404);
    expect(missingSong.json).toHaveBeenCalledWith({
      success: false, error: 'Catalog song not found', code: 'CATALOG_SONG_NOT_FOUND'
    });
  });

  test('rejects invalid song IDs before catalog access', async () => {
    const setFeedback = jest.fn();
    const { handler } = createPlugin({ setFeedback });
    const res = response();

    await handler({ params: { songId: '0' }, body: { state: 'up' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid song ID' });
    expect(setFeedback).not.toHaveBeenCalled();
  });
});
