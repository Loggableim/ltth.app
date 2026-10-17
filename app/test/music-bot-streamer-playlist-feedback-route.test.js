const MusicBotPlugin = require('../plugins/music-bot/main');

function createPlugin({ catalog, playlistStore, currentTrack = { title: 'Fixture song' } }) {
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
  plugin.playlistStore = playlistStore;
  plugin.playbackEngine = { getNowPlaying: jest.fn(() => currentTrack) };
  plugin._rebuildStreamerPlaylistSuggestions = jest.fn(async () => []);
  plugin._invalidateRadioPrefetch = jest.fn();
  plugin._registerRoutes();
  return { api, handler: routes.get('post:/api/plugins/music-bot/streamer-playlist/feedback') };
}

function response() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

function fixtureOptions(setStreamerPlaylistFeedback) {
  return {
    catalog: {
      resolveOrUpsert: jest.fn(() => ({ song: { id: 42 } })),
      setStreamerPlaylistFeedback
    },
    playlistStore: { getStreamerPlaylist: jest.fn(() => ({ id: 'streamer-playlist', revision: 2, items: [] })) }
  };
}

describe('music-bot Streamer Playlist feedback route', () => {
  test('returns generic 500 for unexpected catalog or SQLite errors without leaking details', async () => {
    const privateMessage = 'SQLITE path=C:\\profiles\\private\\music.db CANARY';
    const privateCode = 'SQLITE_INTERNAL_CANARY';
    const { handler } = createPlugin(fixtureOptions(jest.fn(() => {
      throw Object.assign(new Error(privateMessage), { code: privateCode });
    })));
    const res = response();

    await handler({ body: { direction: 'up' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false, error: 'Streamer Playlist feedback could not be updated'
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(privateMessage);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(privateCode);
  });

  test('preserves known direction, missing-track, and missing-catalog-song responses', async () => {
    const setStreamerPlaylistFeedback = jest.fn(() => {
      throw Object.assign(new Error('internal lookup detail'), { code: 'CATALOG_SONG_NOT_FOUND' });
    });
    const { handler } = createPlugin(fixtureOptions(setStreamerPlaylistFeedback));

    const invalidDirection = response();
    await handler({ body: { direction: 'neutral' } }, invalidDirection);
    expect(invalidDirection.status).toHaveBeenCalledWith(400);
    expect(invalidDirection.json).toHaveBeenCalledWith({ success: false, error: 'direction must be up or down' });
    expect(setStreamerPlaylistFeedback).not.toHaveBeenCalled();

    const missingSong = response();
    await handler({ body: { direction: 'up' } }, missingSong);
    expect(missingSong.status).toHaveBeenCalledWith(404);
    expect(missingSong.json).toHaveBeenCalledWith({
      success: false, error: 'Catalog song not found', code: 'CATALOG_SONG_NOT_FOUND'
    });

    const noCurrentTrack = createPlugin({
      ...fixtureOptions(setStreamerPlaylistFeedback),
      currentTrack: null
    });
    const missingTrack = response();
    await noCurrentTrack.handler({ body: { direction: 'up' } }, missingTrack);
    expect(missingTrack.status).toHaveBeenCalledWith(404);
    expect(missingTrack.json).toHaveBeenCalledWith({
      success: false, error: 'No current track is available for Streamer Playlist feedback'
    });
  });
});
