const Database = require('better-sqlite3');
const EventEmitter = require('events');
const MusicBotPlugin = require('../plugins/music-bot/main');
const MusicCatalog = require('../plugins/music-bot/lib/music-catalog');
const PlaylistStore = require('../plugins/music-bot/lib/playlist-store');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');
const BanList = require('../plugins/music-bot/lib/ban-list');

function createApi(db = new Database(':memory:')) {
  const routes = new Map();
  return {
    db,
    routes,
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    getDatabase: jest.fn(() => db),
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

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    sendFile: jest.fn()
  };
}

function createPlaybackHarness() {
  const api = createApi();
  const plugin = new MusicBotPlugin(api);
  const engine = new EventEmitter();
  let activeTrack = null;
  let activePlaybackId = null;
  engine.getNowPlaying = jest.fn(() => activeTrack);
  engine.getSnapshot = jest.fn(() => ({ activePlaybackId }));
  engine.getState = jest.fn(() => activeTrack ? 'playing' : 'idle');
  engine.isPlaying = jest.fn(() => Boolean(activeTrack));
  plugin.playbackEngine = engine;
  plugin.musicCatalog = new MusicCatalog(api);
  plugin.playlistStore = new PlaylistStore(api, plugin.musicCatalog);
  plugin.queueManager = {
    addToHistory: jest.fn(),
    markPlaying: jest.fn(),
    removeSkipImmunity: jest.fn(),
    resetVoteSkips: jest.fn(),
    getQueue: jest.fn(() => []),
    getHistory: jest.fn(() => [])
  };
  plugin.autoDJ = {
    setPlaybackSeed: jest.fn(),
    markPlaybackFailed: jest.fn()
  };
  plugin._emitNowPlaying = jest.fn();
  plugin._startPlaybackSync = jest.fn();
  plugin._stopPlaybackSync = jest.fn();
  plugin._scheduleCrossfadeTransition = jest.fn();
  plugin._schedulePreCache = jest.fn();
  plugin._clearCrossfadeTimer = jest.fn();
  plugin._emitPlaybackStopped = jest.fn();
  plugin._emitPlaybackAdvancing = jest.fn();
  plugin._emitRuntimeHealth = jest.fn();
  plugin._emitError = jest.fn();
  plugin._advanceAfterViewerFailure = jest.fn();
  plugin._playNextFromQueue = jest.fn(async () => ({ success: false }));
  plugin._registerPlaybackEvents();
  return {
    api,
    plugin,
    engine,
    start(track, playbackId) {
      activeTrack = track;
      activePlaybackId = playbackId;
      engine.emit('track-start', track);
    },
    end(track, reason, extra = {}) {
      activeTrack = null;
      activePlaybackId = null;
      engine.emit('track-end', { track, reason, ...extra });
    }
  };
}

describe('music-bot combined catalog playback acceptance', () => {
  test('records completed, early-skip, and failed terminal events with playback start metadata', () => {
    jest.useFakeTimers({ now: 100_000 });
    const harness = createPlaybackHarness();
    const viewer = {
      id: 'viewer-track', title: 'Viewer song', artist: 'Viewer Artist', requestedBy: 'alice',
      provider: 'youtube', providerId: 'viewer-video', trackKey: 'youtube:viewer-video',
      url: 'https://www.youtube.com/watch?v=viewer-video', duration: 100, startedAt: 90_000
    };
    const radio = {
      id: 'radio-track', title: 'Radio song', artist: 'Radio Artist', requestedBy: 'AutoDJ',
      provider: 'youtube', providerId: 'radio-video', trackKey: 'youtube:radio-video',
      url: 'https://www.youtube.com/watch?v=radio-video', duration: 100, startedAt: 95_000
    };
    const failed = {
      id: 'failed-track', title: 'Failed song', artist: 'Failed Artist', requestedBy: 'bob',
      provider: 'soundcloud', providerId: 'failed-song', trackKey: 'soundcloud:failed-song',
      url: 'https://soundcloud.com/failed/song', duration: 120, startedAt: 98_000
    };

    harness.start(viewer, 'viewer-playback');
    harness.end(viewer, 'ended', { positionSeconds: 100 });
    jest.setSystemTime(101_000);
    harness.start(radio, 'radio-playback');
    harness.end(radio, 'skip', { positionSeconds: 20 });
    jest.setSystemTime(102_000);
    harness.start(failed, 'failed-playback');
    harness.end(failed, 'error', { positionSeconds: 2, error: 'decoder failed' });

    expect(harness.plugin.musicCatalog.getHistory({ limit: 10 }).items).toEqual([
      expect.objectContaining({
        id: 'playback:failed-playback', outcome: 'failed', startedAt: 98_000,
        playedSeconds: 2, requestedBy: 'bob', provider: 'soundcloud', providerId: 'failed-song'
      }),
      expect.objectContaining({
        id: 'playback:radio-playback', outcome: 'early_skip', startedAt: 95_000,
        playedSeconds: 20, requestedBy: 'AutoDJ', provider: 'youtube', providerId: 'radio-video'
      }),
      expect.objectContaining({
        id: 'playback:viewer-playback', outcome: 'completed', startedAt: 90_000,
        playedSeconds: 100, requestedBy: 'alice', provider: 'youtube', providerId: 'viewer-video'
      })
    ]);
    harness.api.db.close();
    jest.useRealTimers();
  });

  test('adds only completed viewer requests to Viewer Radio, never automatic fallback playback', () => {
    jest.useFakeTimers({ now: 200_000 });
    const harness = createPlaybackHarness();
    const viewer = {
      id: 'viewer', title: 'Viewer completion', artist: 'Viewer Artist', requestedBy: 'alice',
      provider: 'youtube', providerId: 'viewer', url: 'https://youtu.be/viewer', duration: 10, startedAt: 190_000
    };
    const fallback = {
      id: 'fallback', title: 'Automatic fallback', artist: 'Fallback Artist', requestedBy: 'fallback',
      provider: 'youtube', providerId: 'fallback', url: 'https://youtu.be/fallback', duration: 10, startedAt: 190_000
    };

    harness.start(viewer, 'viewer');
    harness.end(viewer, 'ended', { positionSeconds: 10 });
    harness.start(fallback, 'fallback');
    harness.end(fallback, 'ended', { positionSeconds: 10 });

    expect(harness.plugin.playlistStore.getViewerRadio().items).toEqual([
      expect.objectContaining({ title: 'Viewer completion', requestCount: 1 })
    ]);
    harness.api.db.close();
    jest.useRealTimers();
  });

  test('records a confirmed IPC failure once even if a delayed terminal signal follows', async () => {
    jest.useFakeTimers({ now: 300_000 });
    const harness = createPlaybackHarness();
    const track = {
      id: 'ipc-track', title: 'IPC failure', artist: 'Artist', requestedBy: 'AutoDJ',
      provider: 'youtube', providerId: 'ipc-track', url: 'https://youtu.be/ipc-track',
      duration: 100, startedAt: 295_000
    };
    harness.engine.clearNowPlaying = jest.fn();
    harness.plugin.radioSupervisor = { wake: jest.fn(async () => ({ success: false })) };
    harness.start(track, 'ipc-playback');

    await harness.plugin._handleAutoDJPlaybackFailure(track, 'ipc-confirmed', new Error('IPC disconnected'));
    expect(harness.plugin.musicCatalog.getHistory({ limit: 10 }).items).toEqual([
      expect.objectContaining({ id: 'playback:ipc-playback', outcome: 'failed', playedSeconds: 5 })
    ]);
    harness.end(track, 'error', { positionSeconds: 5, error: 'delayed end-file' });

    expect(harness.plugin.musicCatalog.getHistory({ limit: 10 }).items).toEqual([
      expect.objectContaining({
        id: 'playback:ipc-playback', outcome: 'failed', playedSeconds: 5,
        requestedBy: 'AutoDJ', providerId: 'ipc-track'
      })
    ]);
    harness.api.db.close();
    jest.useRealTimers();
  });

  test('keeps catalog identity on the track emitted by the playback engine', () => {
    const api = { log: jest.fn() };
    const engine = new PlaybackEngine({ crossfadeDuration: 0 }, api);
    engine._ensureProcess = jest.fn(async () => {});
    engine._applyNormalizationFilter = jest.fn(async () => {});
    engine._sendCommand = jest.fn(async () => ({}));
    engine.setVolume = jest.fn(async () => {});
    const started = jest.fn();
    engine.on('track-start', started);

    return engine.play({
      id: 'identity', title: 'Identity', artist: 'Artist', artists: ['Artist', 'Guest'],
      provider: 'soundcloud', providerId: 'artist/identity', trackKey: 'soundcloud:artist/identity',
      sourceId: 77, catalogSongId: 42, canonicalKey: 'meta:artist:identity',
      channelId: 'channel-1', channelName: 'Artist Channel',
      url: 'https://soundcloud.com/artist/identity'
    }).then(() => {
      expect(started).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'soundcloud', providerId: 'artist/identity', trackKey: 'soundcloud:artist/identity',
        sourceId: 77, catalogSongId: 42, canonicalKey: 'meta:artist:identity',
        artists: ['Artist', 'Guest'], channelId: 'channel-1', channelName: 'Artist Channel'
      }));
    });
  });

  test('re-probes an unavailable MPV and heals playback when the binary becomes available', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    const track = {
      id: 'local-healed', title: 'Local healed track', requestedBy: 'AutoDJ',
      localPath: 'C:/music/healed.wav', duration: 1
    };
    plugin._mpvAvailable = false;
    plugin._ensureMpv = jest.fn(async () => { plugin._mpvAvailable = true; });
    plugin.queueManager = {
      shiftNext: jest.fn().mockReturnValueOnce(track),
      getQueue: jest.fn(() => []),
      markPlaying: jest.fn()
    };
    plugin.playbackEngine = {
      play: jest.fn(async () => track),
      isPlaying: jest.fn(() => false),
      getNowPlaying: jest.fn(() => null)
    };
    plugin._emitQueue = jest.fn();
    plugin._schedulePreCache = jest.fn();

    await expect(plugin._playNextFromQueueInternal({ isCurrent: () => true })).resolves.toMatchObject({
      success: true, song: track
    });
    expect(plugin._ensureMpv).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.play).toHaveBeenCalledWith(track);
    api.db.close();
  });

  test('records a failed viewer play attempt before advancing past the broken item', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    const broken = {
      id: 'broken-viewer', title: 'Broken viewer track', artist: 'Artist', requestedBy: 'alice',
      provider: 'youtube', providerId: 'broken-viewer', url: 'https://youtu.be/broken-viewer', duration: 20
    };
    plugin._mpvAvailable = true;
    plugin.musicCatalog = new MusicCatalog(api);
    plugin.queueManager = {
      shiftNext: jest.fn().mockReturnValueOnce(broken).mockReturnValue(null),
      getQueue: jest.fn(() => []),
      markPlaying: jest.fn(),
      addToHistory: jest.fn()
    };
    plugin.playbackEngine = {
      play: jest.fn(async () => { throw new Error('decoder unavailable'); }),
      isPlaying: jest.fn(() => false),
      getNowPlaying: jest.fn(() => null),
      clearNowPlaying: jest.fn()
    };
    plugin._emitQueue = jest.fn();
    plugin._emitError = jest.fn();
    plugin._emitPlaybackStopped = jest.fn();
    plugin._schedulePreCache = jest.fn();
    plugin._playFallbackTrack = jest.fn(async () => null);
    plugin._maybePlayAutoDJ = jest.fn(async () => null);

    await expect(plugin._playNextFromQueueInternal({ isCurrent: () => true })).resolves.toMatchObject({ success: false });
    expect(plugin.musicCatalog.getHistory({ limit: 10 }).items).toEqual([
      expect.objectContaining({ outcome: 'failed', playedSeconds: 0, requestedBy: 'alice', providerId: 'broken-viewer' })
    ]);
    api.db.close();
  });

  test('records a failed AutoDJ play attempt without turning it into viewer taste', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    const broken = {
      id: 'broken-radio', title: 'Broken radio track', artist: 'Radio Artist', requestedBy: 'AutoDJ',
      provider: 'youtube', providerId: 'broken-radio', url: 'https://youtu.be/broken-radio',
      streamUrl: 'https://media.invalid/broken-radio', duration: 20
    };
    plugin.config.autoDJ.enabled = true;
    plugin.musicCatalog = new MusicCatalog(api);
    plugin.queueManager = { getQueue: jest.fn(() => []), markPlaying: jest.fn() };
    plugin.playbackEngine = {
      play: jest.fn(async () => { throw new Error('format unavailable'); }),
      isPlaying: jest.fn(() => false),
      getNowPlaying: jest.fn(() => null)
    };
    plugin.autoDJ = {
      getNextSong: jest.fn(async () => ({ song: broken, announce: false })),
      getAlternativeSource: jest.fn(() => null),
      recordSourceFailure: jest.fn(() => ({ failureClass: 'long' })),
      markPlaybackFailed: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' }))
    };

    await expect(plugin._maybePlayAutoDJ(true, false, { isCurrent: () => true })).resolves.toBeNull();
    expect(plugin.musicCatalog.getHistory({ limit: 10 }).items).toEqual([
      expect.objectContaining({ outcome: 'failed', playedSeconds: 0, requestedBy: 'AutoDJ', providerId: 'broken-radio' })
    ]);
    api.db.close();
  });

  test('keeps paged history, canonical votes, track bans, and viewer requests compatible', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.musicCatalog = new MusicCatalog(api);
    plugin.playlistStore = new PlaylistStore(api, plugin.musicCatalog);
    plugin.banList = new BanList(api);
    plugin.queueManager = {
      getQueue: jest.fn(() => []), getHistory: jest.fn(() => []), markPlaying: jest.fn()
    };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => null) };
    const track = {
      title: 'Shared history song', artist: 'Artist', requestedBy: 'alice',
      provider: 'youtube', providerId: 'shared', trackKey: 'youtube:shared',
      url: 'https://youtu.be/shared', duration: 20
    };
    const first = plugin.musicCatalog.recordCompleted(track, {
      id: 'shared-1', finishedAt: 10, playedSeconds: 20
    });
    plugin.musicCatalog.recordCompleted(track, {
      id: 'shared-2', finishedAt: 20, playedSeconds: 20
    });
    plugin._registerRoutes();

    const vote = api.routes.get('post:/api/plugins/music-bot/catalog/songs/:songId/feedback');
    const voteResponse = createResponse();
    await vote({ params: { songId: String(first.song.id) }, body: { state: 'down' } }, voteResponse);
    expect(voteResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true, feedback: expect.objectContaining({ state: 'down' })
    }));
    expect(api.emit).toHaveBeenCalledWith('musicbot:history-update', {
      songId: first.song.id, feedback: expect.objectContaining({ state: 'down' })
    });
    expect(plugin.musicCatalog.getScoringInputs(first.song.id)).toMatchObject({
      radioAllowed: false, requestAllowed: true
    });
    expect(plugin._checkBans(track, 'alice')).toBeNull();

    const history = api.routes.get('get:/api/plugins/music-bot/history');
    const firstPage = createResponse();
    await history({ query: { limit: 1, offset: 0 } }, firstPage);
    expect(firstPage.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true, total: 2, limit: 1, offset: 0,
      history: [expect.objectContaining({ id: 'shared-2', feedback: 'down', banned: false })]
    }));

    const ban = api.routes.get('post:/api/plugins/music-bot/bans/from-track');
    const banResponse = createResponse();
    await ban({ body: { catalogEventId: 'shared-1', scope: 'track', stopCurrent: false, removeQueued: false } }, banResponse);
    expect(banResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(plugin._checkBans(track, 'alice')).toMatch(/gesperrt/i);

    const refreshed = createResponse();
    await history({ query: { limit: 2, offset: 0 } }, refreshed);
    expect(refreshed.json.mock.calls[0][0].history).toEqual([
      expect.objectContaining({ id: 'shared-2', feedback: 'down', banned: true }),
      expect.objectContaining({ id: 'shared-1', feedback: 'down', banned: true })
    ]);
    api.db.close();
  });

  test('records 100 sequential playbacks without collapsing terminal events', () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const harness = createPlaybackHarness();

    for (let index = 0; index < 100; index += 1) {
      const track = {
        id: `load-${index}`, title: `Load track ${index}`, artist: 'Load Artist', requestedBy: 'AutoDJ',
        provider: 'youtube', providerId: `load-${index}`, trackKey: `youtube:load-${index}`,
        url: `https://youtu.be/load-${index}`, duration: 1
      };
      jest.setSystemTime(1_000_000 + (index * 2_000));
      harness.start(track, `load-playback-${index}`);
      jest.setSystemTime(1_001_000 + (index * 2_000));
      harness.end(track, 'ended', { positionSeconds: 1 });
    }

    const history = harness.plugin.musicCatalog.getHistory({ limit: 100 });
    expect(history.total).toBe(100);
    expect(history.items).toHaveLength(100);
    expect(new Set(history.items.map((event) => event.id)).size).toBe(100);
    expect(history.items[0]).toMatchObject({ id: 'playback:load-playback-99', outcome: 'completed' });
    expect(history.items[99]).toMatchObject({ id: 'playback:load-playback-0', outcome: 'completed' });
    expect(harness.plugin.playlistStore.getViewerRadio().items).toEqual([]);
    harness.api.db.close();
    jest.useRealTimers();
  });
});

describe('music-bot additive schema migration acceptance', () => {
  test('creates catalog and playlist schemas inside transactions and remains idempotent', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE plugin_music_bot_history (
        id TEXT PRIMARY KEY, title TEXT, artist TEXT, url TEXT, youtubeId TEXT,
        duration INTEGER, requestedBy TEXT, source TEXT, finishedAt INTEGER, skipped INTEGER
      );
      INSERT INTO plugin_music_bot_history
        (id, title, artist, url, youtubeId, duration, requestedBy, source, finishedAt, skipped)
      VALUES ('legacy', 'Legacy', 'Artist', 'https://youtu.be/legacy', 'legacy', 60, 'viewer', 'youtube', 10, 0);
      CREATE TABLE plugin_music_bot_bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, value TEXT NOT NULL,
        reason TEXT, banned_by TEXT, created_at INTEGER NOT NULL
      );
      INSERT INTO plugin_music_bot_bans (type, value, created_at) VALUES ('track', 'youtube:legacy', 10);
    `);
    const wrappedDb = {
      prepare: db.prepare.bind(db),
      transaction: jest.fn((fn) => db.transaction(fn))
    };
    const api = createApi(wrappedDb);

    const catalog = new MusicCatalog(api);
    const store = new PlaylistStore(api, catalog);
    catalog.migrateLegacyHistory();
    const firstTransactionCount = wrappedDb.transaction.mock.calls.length;
    const rerunCatalog = new MusicCatalog(api);
    const rerunStore = new PlaylistStore(api, rerunCatalog);
    rerunCatalog.migrateLegacyHistory();

    expect(firstTransactionCount).toBeGreaterThanOrEqual(3);
    expect(wrappedDb.transaction.mock.calls.length).toBeGreaterThan(firstTransactionCount);
    expect(db.prepare('SELECT COUNT(*) AS count FROM plugin_music_bot_history').get().count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM plugin_music_bot_play_events').get().count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM plugin_music_bot_bans').get().count).toBe(1);
    expect(store.getViewerRadio()).toMatchObject({ id: 'viewer-radio', isProtected: true });
    expect(rerunStore.getViewerRadio()).toMatchObject({ id: 'viewer-radio', isProtected: true });
    db.close();
  });

  test('preserves a zero-second position for an immediate early skip', () => {
    const api = createApi();
    const catalog = new MusicCatalog(api);

    catalog.recordSkipped({
      title: 'Immediate skip', artist: 'Artist', provider: 'youtube', providerId: 'immediate',
      url: 'https://youtu.be/immediate', duration: 100
    }, { id: 'immediate-skip', playedSeconds: 0, finishedAt: 10 });

    expect(catalog.getHistory({ limit: 1 }).items[0]).toMatchObject({
      id: 'immediate-skip', outcome: 'early_skip', playedSeconds: 0
    });
    api.db.close();
  });

  test('does not duplicate a catalog event when legacy dual-write is migrated after restart', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE plugin_music_bot_history (
        id TEXT PRIMARY KEY, title TEXT, artist TEXT, url TEXT, youtubeId TEXT,
        provider TEXT, providerId TEXT, trackKey TEXT, duration INTEGER,
        requestedBy TEXT, source TEXT, finishedAt INTEGER, skipped INTEGER
      );
    `);
    const api = createApi(db);
    const catalog = new MusicCatalog(api);
    const track = {
      id: 'queue-item', title: 'Dual write', artist: 'Artist', requestedBy: 'alice',
      provider: 'youtube', providerId: 'dual-write', trackKey: 'youtube:dual-write',
      youtubeId: 'dual-write', url: 'https://youtu.be/dual-write', duration: 90
    };
    catalog.recordCompleted(track, {
      id: 'playback:dual-write', finishedAt: 50_000, playedSeconds: 90
    });
    const insertLegacy = db.prepare(`
      INSERT INTO plugin_music_bot_history
        (id, title, artist, url, youtubeId, provider, providerId, trackKey,
         duration, requestedBy, source, finishedAt, skipped)
      VALUES (@id, @title, @artist, @url, @youtubeId, @provider, @providerId, @trackKey,
              @duration, @requestedBy, @source, @finishedAt, @skipped)
    `);
    insertLegacy.run({ ...track, source: 'youtube', finishedAt: 50_025, skipped: 0 });
    const failedTrack = {
      ...track, id: 'failed-queue-item', providerId: 'failed-dual-write',
      trackKey: 'youtube:failed-dual-write', youtubeId: 'failed-dual-write',
      url: 'https://youtu.be/failed-dual-write'
    };
    catalog.recordFailed(failedTrack, {
      id: 'failed:dual-write', finishedAt: 60_000, playedSeconds: 0
    });
    insertLegacy.run({ ...failedTrack, source: 'youtube', finishedAt: 60_030, skipped: 1 });

    const restartedCatalog = new MusicCatalog(api);
    expect(restartedCatalog.migrateLegacyHistory()).toEqual({ imported: 0, skipped: 2 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM plugin_music_bot_play_events').get().count).toBe(2);

    db.close();
  });
});
