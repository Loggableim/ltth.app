const fs = require('fs');
const path = require('path');

describe('Music Bot catalog and playlist admin UI contract', () => {
  let html;
  let script;
  let main;

  beforeAll(() => {
    const root = path.join(__dirname, '..', 'plugins', 'music-bot');
    html = fs.readFileSync(path.join(root, 'ui.html'), 'utf8');
    script = fs.readFileSync(path.join(root, 'assets', 'ui.js'), 'utf8');
    main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  });

  test('uses an accessible seek scrubber with local preview and one authoritative confirmation', () => {
    expect(html).toContain('id="np-seek-input"');
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-valuetext');
    expect(html).not.toContain('id="np-progress-fill"');
    expect(script).toContain("npSeekInput?.addEventListener('input'");
    expect(script).toContain("npSeekInput?.addEventListener('change'");
    expect(script).toContain("post('/seek', { playbackId, positionSeconds }");
    expect(script).toContain('isSeekAvailable');
    expect(script).toContain('lastConfirmedSeekPosition');
    expect(script).toContain("socket.on('musicbot:playback-sync'");
    expect(script).toContain('payload.playbackId !== activePlaybackId');
    expect(script).not.toContain('latestRuntime?.activePlaybackId || track?.id || null');
  });

  test('renders filtered paginated history with canonical feedback, replay, and playlist actions', () => {
    ['history-load-more', 'history-page-status', 'history-list'].forEach((id) => {
      expect(html).toContain(`id="${id}"`);
    });
    ['history-search', 'history-period', 'history-outcome', 'history-feedback-filter', 'history-banned', 'history-sort', 'history-reset', 'history-previous', 'history-next'].forEach((id) => {
      expect(html).toContain(`id="${id}"`);
    });
    expect(script).toContain('const historyFilters =');
    expect(script).toContain('URLSearchParams');
    expect(script).toContain('historyRequestGeneration');
    expect(script).toContain('const HISTORY_PAGE_SIZE = 50;');
    expect(script).toContain("post(`/catalog/songs/${songId}/feedback`");
    expect(script).toContain('canonicalSongState');
    expect(script).toContain('history-feedback');
    expect(script).toContain('history-ban-badge');
    expect(script).toContain('data-history-replay');
    expect(script).toContain('data-history-copy');
    expect(script).toContain('data-history-playlist');
    expect(script).toContain('`/history/${encodeURIComponent(eventId)}/replay`');
    expect(script).toContain("socket.on('musicbot:history-update'");
  });

  test('provides catalog search and a full protected playlist editor', () => {
    [
      'catalog-search-input', 'catalog-search-results', 'playlist-create-name', 'playlist-create-btn',
      'playlist-list', 'playlist-editor', 'playlist-items', 'playlist-import-url', 'playlist-import-btn',
      'playlist-radio-sources', 'playlist-conflict-feedback'
    ].forEach((id) => expect(html).toContain(`id="${id}"`));
    expect(script).toContain("get(`/catalog/search?q=${encodeURIComponent(query)}`)");
    expect(script).toContain("post('/playlists'" );
    expect(script).toContain("patch(`/playlists/${selectedPlaylist.id}`");
    expect(script).toContain("del(`/playlists/${selectedPlaylist.id}`");
    expect(script).toContain("put(`/playlists/${selectedPlaylist.id}/items`");
    expect(script).toContain("post('/playlist-imports'" );
    expect(script).toContain("put('/radio/playlist-sources'" );
    expect(script).toContain('playlist.isProtected');
    expect(script).toContain('PLAYLIST_REVISION_CONFLICT');
    expect(script).toContain("socket.on('musicbot:playlist-import-progress'");
  });

  test('wires catalog search and feedback to the existing catalog service without changing its model', () => {
    expect(main).toContain("'/api/plugins/music-bot/catalog/search'");
    expect(main).toContain('this.musicCatalog.searchSongs');
    expect(main).toContain("'/api/plugins/music-bot/catalog/songs/:songId/feedback'");
    expect(main).toContain('this.musicCatalog.setFeedback');
  });

  test('lets the dashboard review and save a manual genre correction for a catalog title', () => {
    expect(script).toContain('data-catalog-save-genres');
    expect(script).toContain('data-catalog-genre-input');
    expect(script).toContain('put(`/catalog/songs/${genreButton.dataset.catalogSaveGenres}/genres`');
    expect(main).toContain("'/api/plugins/music-bot/catalog/songs/:songId/genres'");
    expect(main).toContain('this.musicCatalog.setSongGenres');
  });
});
