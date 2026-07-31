const MusicBotPlugin = require('../plugins/music-bot/main');
const EventEmitter = require('events');

function createApi() {
  const routes = new Map();
  return {
    routes,
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    getDatabase: jest.fn(() => ({})),
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(),
    ensurePluginDataDir: jest.fn(),
    log: jest.fn(),
    emit: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn()
  };
}

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    sendFile: jest.fn()
  };
}

describe('music-bot playlist routes and lifecycle', () => {
  it('registers filterable history and replay routes without bypassing safety', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.musicCatalog = {
      getHistory: jest.fn(() => ({
        items: [], total: 0, limit: 50, offset: 0,
        filters: { q: 'Artist', outcome: '', feedback: '', banned: '', from: '', to: '', sort: 'finished_asc' }
      })),
      getHistoryEvent: jest.fn(() => ({ id: 'event-1', songId: 7, title: 'Replay', url: 'https://youtu.be/replay' }))
    };
    plugin._handleDashboardRequest = jest.fn(async () => ({ success: true, song: { id: 'queued-1' }, position: 1 }));
    plugin._isSafetyLocked = jest.fn(() => false);
    plugin.queueManager = {
      getQueue: jest.fn(() => [{ id: 'queued-1' }]),
      reorderSong: jest.fn(() => ({ success: true, position: 0 }))
    };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => ({ id: 'current' })) };
    plugin._skipCurrent = jest.fn(async () => ({ success: true, next: { id: 'queued-1' } }));
    plugin._emitQueue = jest.fn();
    plugin._registerRoutes();

    const history = api.routes.get('get:/api/plugins/music-bot/history');
    const replay = api.routes.get('post:/api/plugins/music-bot/history/:eventId/replay');
    expect(history).toEqual(expect.any(Function));
    expect(replay).toEqual(expect.any(Function));

    const historyResponse = response();
    await history({ query: { q: '  Artist ', outcome: 'invalid', sort: 'finished_asc' } }, historyResponse);
    expect(plugin.musicCatalog.getHistory).toHaveBeenCalledWith(expect.objectContaining({
      q: 'Artist', outcome: '', sort: 'finished_asc'
    }));
    expect(historyResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.objectContaining({ q: 'Artist', sort: 'finished_asc' })
    }));

    const replayResponse = response();
    await replay({ params: { eventId: 'event-1' }, body: { mode: 'queue' } }, replayResponse);
    expect(plugin._handleDashboardRequest).toHaveBeenCalledWith('https://youtu.be/replay', 'dashboard');
    expect(replayResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true, mode: 'queue'
    }));

    const playResponse = response();
    await replay({ params: { eventId: 'event-1' }, body: { mode: 'play' } }, playResponse);
    expect(plugin.queueManager.reorderSong).toHaveBeenCalledWith(0, 0);
    expect(plugin._skipCurrent).toHaveBeenCalledWith('history-replay');
    expect(playResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true, mode: 'play'
    }));

    plugin._isSafetyLocked.mockReturnValue(true);
    const lockedResponse = response();
    await replay({ params: { eventId: 'event-1' }, body: { mode: 'play' } }, lockedResponse);
    expect(lockedResponse.status).toHaveBeenCalledWith(423);
  });

  it('registers additive playlist routes, maps revision conflicts to 409, and broadcasts import progress', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.playlistStore = {
      list: jest.fn(() => []),
      create: jest.fn(() => ({ id: 'mix', revision: 1 })),
      get: jest.fn(() => ({ id: 'mix', revision: 1, items: [] })),
      update: jest.fn(() => { const error = new Error('stale'); error.code = 'PLAYLIST_REVISION_CONFLICT'; throw error; }),
      delete: jest.fn(), addItem: jest.fn(), removeItem: jest.fn(), reorder: jest.fn(),
      setRadioSources: jest.fn(() => [])
    };
    plugin.playlistImports = {
      start: jest.fn(() => ({ jobId: 'import-1', status: 'queued' })),
      get: jest.fn(() => ({ jobId: 'import-1', status: 'queued' }))
    };

    plugin._registerRoutes();
    const create = api.routes.get('post:/api/plugins/music-bot/playlists');
    const rename = api.routes.get('patch:/api/plugins/music-bot/playlists/:id');
    const importRoute = api.routes.get('post:/api/plugins/music-bot/playlist-imports');
    expect(create).toEqual(expect.any(Function));
    expect(rename).toEqual(expect.any(Function));
    expect(importRoute).toEqual(expect.any(Function));

    const created = response();
    await create({ body: { name: 'Mix', mode: 'shuffle' } }, created);
    expect(plugin.playlistStore.create).toHaveBeenCalledWith({ name: 'Mix', mode: 'shuffle' });
    expect(created.json).toHaveBeenCalledWith({ success: true, playlist: { id: 'mix', revision: 1 } });
    expect(api.emit).toHaveBeenCalledWith('musicbot:playlist-update', { playlistId: 'mix', reason: 'created' });

    const stale = response();
    await rename({ params: { id: 'mix' }, body: { name: 'New', mode: 'shuffle', revision: 1 } }, stale);
    expect(stale.status).toHaveBeenCalledWith(409);

    const started = response();
    await importRoute({ body: { playlistId: 'mix', url: 'https://youtube.com/playlist?list=one' } }, started);
    expect(plugin.playlistImports.start).toHaveBeenCalledWith({ playlistId: 'mix', url: 'https://youtube.com/playlist?list=one' });
    expect(started.status).toHaveBeenCalledWith(202);
  });

  it('shuts down active playlist imports when the plugin is destroyed', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.playlistImports = { destroy: jest.fn(async () => {}) };
    plugin.mediaCache = { destroy: jest.fn(async () => {}) };
    plugin.musicResolver = { destroy: jest.fn(async () => {}) };
    plugin.playbackEngine = { removeAllListeners: jest.fn(), shutdown: jest.fn(async () => {}) };
    plugin.queueManager = { persistQueue: jest.fn() };

    await plugin.destroy();
    expect(plugin.playlistImports.destroy).toHaveBeenCalledTimes(1);
  });

  it('resolves catalog ban actions by explicit event id and refreshes canonical history badges', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.musicCatalog = {
      getHistoryEvent: jest.fn(() => ({ songId: 9, id: 'event-9', title: 'Catalog Song', trackKey: 'youtube:abc', artist: 'Artist' }))
    };
    plugin.banList = { addBan: jest.fn(() => ({ id: 4 })) };
    plugin.queueManager = { getQueue: jest.fn(() => []), markPlaying: jest.fn() };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => null) };
    plugin._emitQueue = jest.fn();
    plugin._registerRoutes();

    const ban = api.routes.get('post:/api/plugins/music-bot/bans/from-track');
    const res = response();
    await ban({ body: { catalogEventId: 'event-9', trackId: 'not-an-event-id', scope: 'track' } }, res);

    expect(plugin.musicCatalog.getHistoryEvent).toHaveBeenCalledWith('event-9');
    expect(plugin.banList.addBan).toHaveBeenCalledWith('track', 'youtube:abc', 'Admin-Ban: Catalog Song', 'dashboard');
    expect(api.emit).toHaveBeenCalledWith('musicbot:history-update', { songId: 9, refresh: true });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('publishes import progress through the plugin socket emitter and records only completed viewer playback', () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.playlistStore = { recordViewerCompletion: jest.fn() };
    plugin.musicCatalog = { resolveOrUpsert: jest.fn(() => ({ song: { id: 42 } })) };
    plugin.musicResolver = { runner: { run: jest.fn() } };
    plugin._initializePlaylistImports();
    plugin.playlistImports.onProgress({ jobId: 'import-1', status: 'running' });
    expect(api.emit).toHaveBeenCalledWith(
      'musicbot:playlist-import-progress',
      { jobId: 'import-1', status: 'running' }
    );
    plugin.playlistImports.onProgress({ jobId: 'import-1', playlistId: 'mix', status: 'completed', progress: 100 });
    expect(api.emit).toHaveBeenCalledWith('musicbot:playlist-update', { playlistId: 'mix', reason: 'import' });

    const engine = new EventEmitter();
    engine.getNowPlaying = jest.fn(() => null);
    plugin.playbackEngine = engine;
    plugin.queueManager = {
      addToHistory: jest.fn(), removeSkipImmunity: jest.fn(), resetVoteSkips: jest.fn()
    };
    plugin._playNextFromQueue = jest.fn(async () => ({ success: true }));
    plugin._emitPlaybackAdvancing = jest.fn();
    plugin._stopPlaybackSync = jest.fn();
    plugin._clearCrossfadeTimer = jest.fn();
    plugin._registerPlaybackEvents();
    engine.emit('track-end', { track: { title: 'Viewer song', requestedBy: 'viewer' }, reason: 'ended' });
    engine.emit('track-end', { track: { title: 'Crossfade viewer song', requestedBy: 'viewer' }, reason: 'crossfade' });
    engine.emit('track-end', { track: { title: 'Auto song', requestedBy: 'AutoDJ' }, reason: 'ended' });
    engine.emit('track-end', { track: { title: 'Failed song', requestedBy: 'viewer' }, reason: 'error', error: 'broken' });

    expect(plugin.playlistStore.recordViewerCompletion).toHaveBeenCalledTimes(2);
    expect(plugin.playlistStore.recordViewerCompletion).toHaveBeenCalledWith(42, {
      requestedBy: 'viewer', outcome: 'completed', error: null
    });
  });

  it('uses the resolver-resolved yt-dlp binary for imports and keeps it in sync on live config changes', () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.playlistStore = { get: jest.fn() };
    plugin.musicCatalog = {};
    plugin.musicResolver = {
      runner: { run: jest.fn() },
      config: { ytdlpPath: 'C:/bundled/yt-dlp.exe' },
      updateConfig: jest.fn(function updateConfig(config) { this.config = { ...this.config, ytdlpPath: config.ytdlpPath }; })
    };
    plugin._initializePlaylistImports();
    expect(plugin.playlistImports.ytdlpPath).toBe('C:/bundled/yt-dlp.exe');
    plugin.playlistImports.setYtDlpPath = jest.fn();
    plugin._distributeLiveConfig({
      ...plugin.config,
      resolver: { ...plugin.config.resolver, ytdlpPath: 'C:/custom/yt-dlp.exe' }
    });
    expect(plugin.playlistImports.setYtDlpPath).toHaveBeenCalledWith('C:/custom/yt-dlp.exe');
  });
});
