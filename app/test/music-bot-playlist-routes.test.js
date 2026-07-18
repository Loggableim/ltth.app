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
