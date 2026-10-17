const fs = require('fs');
const path = require('path');
const MusicBotPlugin = require('../plugins/music-bot/main');

function createFixture({ action, initialItems, transactional }) {
  let items = initialItems.slice();
  let revision = 4;
  const state = () => ({ id: 'streamer-playlist', revision, items: items.map((songId) => ({ songId })) });
  const database = {};
  if (transactional) {
    database.transaction = jest.fn((callback) => () => {
      const before = { items: items.slice(), revision };
      try {
        return callback();
      } catch (error) {
        items = before.items;
        revision = before.revision;
        throw error;
      }
    });
  }

  const handlers = new Map();
  const api = {
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    getDatabase: jest.fn(() => database),
    registerRoute: jest.fn((method, route, handler) => handlers.set(`${method}:${route}`, handler)),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    emit: jest.fn(() => true),
    log: jest.fn()
  };
  const playlistStore = {
    getStreamerPlaylist: jest.fn(() => state()),
    addItem: jest.fn((playlistId, songId) => {
      const added = !items.includes(songId);
      if (added) {
        items.push(songId);
        revision += 1;
      }
      return { added, duplicate: !added, playlist: state() };
    }),
    removeItem: jest.fn((playlistId, songId) => {
      const index = items.indexOf(songId);
      if (index < 0) throw Object.assign(new Error('Playlist item not found'), { code: 'PLAYLIST_ITEM_NOT_FOUND' });
      items.splice(index, 1);
      revision += 1;
      return { removed: true, playlist: state() };
    })
  };
  const musicCatalog = {
    updateStreamerPlaylistSuggestionStatus: jest.fn(() => {
      throw Object.assign(new Error('Streamer playlist suggestion not found'), {
        code: 'STREAMER_PLAYLIST_SUGGESTION_NOT_FOUND'
      });
    }),
    listStreamerPlaylistSuggestions: jest.fn(() => [])
  };
  const plugin = new MusicBotPlugin(api);
  plugin.playlistStore = playlistStore;
  plugin.musicCatalog = musicCatalog;
  plugin.autoDJ = { invalidateRadioPlan: jest.fn() };
  plugin._invalidateRadioPrefetch = jest.fn();
  plugin._registerRoutes();

  return {
    action,
    api,
    database,
    handler: handlers.get('post:/api/plugins/music-bot/streamer-playlist/suggestions/:songId'),
    items: () => items.slice(),
    playlistStore,
    transactional,
    response: () => ({ status: jest.fn(function status() { return this; }), json: jest.fn() })
  };
}

describe('Streamer Playlist suggestion partial commits', () => {
  test.each([
    ['accept', []],
    ['reject', [42]]
  ])('%s stays truthful when the status write fails after membership changes', async (action, initialItems) => {
    const fallback = createFixture({ action, initialItems, transactional: false });
    const fallbackResponse = fallback.response();
    await fallback.handler({ params: { songId: '42' }, body: { action } }, fallbackResponse);

    expect(fallback.items()).toEqual(action === 'accept' ? [42] : []);
    expect(fallbackResponse.status).toHaveBeenCalledWith(200);
    expect(fallbackResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      partial: true,
      playlistChanged: true,
      suggestionUpdated: false,
      code: 'SUGGESTION_STATUS_UPDATE_FAILED'
    }));
    expect(fallback.api.emit).toHaveBeenCalledWith('musicbot:playlist-update', expect.objectContaining({
      reason: 'streamer-suggestion-partial'
    }));
    expect(fallback.api.emit).toHaveBeenCalledWith('musicbot:streamer-playlist', expect.objectContaining({
      action,
      partial: true
    }));

    const transactional = createFixture({ action, initialItems, transactional: true });
    const transactionalResponse = transactional.response();
    await transactional.handler({ params: { songId: '42' }, body: { action } }, transactionalResponse);

    expect(transactional.items()).toEqual(initialItems);
    expect(transactional.database.transaction).toHaveBeenCalledTimes(1);
    expect(transactionalResponse.status).toHaveBeenCalledWith(404);
    expect(transactionalResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'STREAMER_PLAYLIST_SUGGESTION_NOT_FOUND'
    }));
    expect(transactional.api.emit).not.toHaveBeenCalled();
  });

  test('UI refreshes persisted playlist state and shows the localized partial warning', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8');
    expect(ui).toContain('result?.partial && (result.playlistChanged || result.suggestionUpdated)');
    expect(ui).toContain('refreshStreamerPlaylistCuration(), refreshPlaylists()');
    expect(ui).toMatch(/streamerSuggestionRejected streamerSuggestionPartial/);
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../plugins/music-bot/locales', `${locale}.json`), 'utf8'));
      expect(data.plugins['music-bot'].music_bot.ui.autoDj.streamerSuggestionPartial).toEqual(expect.any(String));
    }
  });
});
