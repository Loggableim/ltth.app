const QueueManager = require('../plugins/music-bot/lib/queue-manager');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');
const AutoDJ = require('../plugins/music-bot/lib/auto-dj');
const MusicBotPlugin = require('../plugins/music-bot/main');

function createDbMock() {
  return {
    prepare: jest.fn(() => ({
      run: jest.fn(),
      get: jest.fn(() => ({ count: 0 })),
      all: jest.fn(() => [])
    })),
    transaction: jest.fn((fn) => fn)
  };
}

function createAutoDjDb({ recentHistory = [], exclusions = [], historyCandidates = [] } = {}) {
  const runCalls = [];
  const resolveRows = (rows, ...args) => (typeof rows === 'function' ? rows(...args) : rows);
  return {
    runCalls,
    prepare: jest.fn((sql) => ({
      run: jest.fn((params) => {
        runCalls.push(params);
      }),
      all: jest.fn((...args) => {
        if (sql.includes('finishedAt >= ?')) return resolveRows(recentHistory, ...args);
        if (sql.includes('plugin_music_bot_history')) return resolveRows(historyCandidates, ...args);
        if (sql.includes('plugin_music_bot_autodj_exclusions')) return resolveRows(exclusions, ...args);
        return [];
      })
    }))
  };
}

function createApiMock(db) {
  return {
    getDatabase: () => db,
    log: jest.fn()
  };
}

function createRequestPlugin({ state = 'paused', nowPlaying = { id: 'current-track', title: 'Current track' } } = {}) {
  const api = {
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    getDatabase: jest.fn(() => ({})),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  const queued = [];
  const requestedSong = {
    id: 'requested-track',
    title: 'Requested track',
    url: 'https://example.test/requested-track'
  };
  plugin.config = {
    ...plugin.config,
    playback: { ...plugin.config.playback, autoPlay: true }
  };
  plugin.musicResolver = {
    resolve: jest.fn(async () => ({ success: true, song: requestedSong }))
  };
  plugin.queueManager = {
    addSong: jest.fn((song) => {
      queued.push(song);
      return { success: true, song, position: queued.length };
    })
  };
  plugin.playbackEngine = {
    getState: jest.fn(() => state),
    getNowPlaying: jest.fn(() => nowPlaying),
    isPlaying: jest.fn(() => false)
  };
  plugin.autoDJ = { onSongRequested: jest.fn() };
  plugin._invalidateRadioPrefetch = jest.fn();
  plugin._schedulePreCache = jest.fn();
  plugin._emitSongAdded = jest.fn();
  plugin._emitToast = jest.fn();
  plugin._emitChatResponse = jest.fn();
  plugin._playNextFromQueue = jest.fn(async () => null);
  return { plugin, queued, requestedSong };
}

describe('Music Bot core features', () => {
  test('keeps dashboard requests queued while paused playback is occupied', async () => {
    const { plugin, queued, requestedSong } = createRequestPlugin();

    const result = await plugin._handleDashboardRequest('requested track', 'dashboard-user');

    expect(result).toMatchObject({ success: true, position: 1 });
    expect(queued).toEqual([expect.objectContaining(requestedSong)]);
    expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
  });

  test('keeps chat requests queued while paused playback is occupied', async () => {
    const { plugin, queued, requestedSong } = createRequestPlugin();

    await plugin._handleRequest('requested track', 'chat-user');

    expect(queued).toEqual([expect.objectContaining(requestedSong)]);
    expect(plugin._emitSongAdded).toHaveBeenCalledWith(expect.objectContaining(requestedSong), 1);
    expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
  });

  test('starts an idle dashboard request when AutoPlay is enabled', async () => {
    const { plugin } = createRequestPlugin({ state: 'idle', nowPlaying: null });

    await plugin._handleDashboardRequest('requested track', 'dashboard-user');

    expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(1);
  });

  test('pins the playing, queued, in-flight pre-cache, and radio-prefetched cache files', () => {
    const plugin = new MusicBotPlugin({
      getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
      getDatabase: jest.fn(() => ({})),
      log: jest.fn()
    });
    plugin.mediaCache = { pin: jest.fn(), unpin: jest.fn() };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => ({ trackKey: 'playing-track' })) };
    plugin._precacheTasks.set('in-flight-track', {});
    plugin._radioPrefetch = { prepared: { trackKey: 'radio-prefetched-track' } };
    plugin._pinnedCacheKeys = new Set(['obsolete-track']);

    plugin._refreshCachePins([{ trackKey: 'queued-track' }]);

    expect(plugin.mediaCache.pin).toHaveBeenCalledWith('playing-track');
    expect(plugin.mediaCache.pin).toHaveBeenCalledWith('queued-track');
    expect(plugin.mediaCache.pin).toHaveBeenCalledWith('in-flight-track');
    expect(plugin.mediaCache.pin).toHaveBeenCalledWith('radio-prefetched-track');
    expect(plugin.mediaCache.unpin).toHaveBeenCalledWith('obsolete-track');
  });

  test('pins a radio-prefetched track as soon as Auto-DJ resolves it', async () => {
    const plugin = new MusicBotPlugin({
      getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
      getDatabase: jest.fn(() => ({})),
      log: jest.fn()
    });
    plugin.config.autoDJ = { ...plugin.config.autoDJ, enabled: true };
    plugin.autoDJ = {};
    plugin.queueManager = { getQueue: jest.fn(() => []) };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => ({ trackKey: 'playing-track' })) };
    plugin.mediaCache = { pin: jest.fn(), unpin: jest.fn() };
    plugin._maybePlayAutoDJ = jest.fn(async () => ({
      prefetched: true,
      track: { trackKey: 'radio-prefetched-track', title: 'Radio track' }
    }));

    await plugin._startRadioPrefetch({ id: 'playing-track', duration: 180 });

    expect(plugin.mediaCache.pin).toHaveBeenCalledWith('radio-prefetched-track');
  });

  test('enriches one stale catalog entry asynchronously and schedules the next background pass', async () => {
    const plugin = new MusicBotPlugin({
      getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
      getDatabase: jest.fn(() => ({})),
      log: jest.fn()
    });
    const candidate = {
      songId: 8,
      title: 'Older catalog song',
      artist: 'Radio Artist',
      url: 'https://example.test/older-song'
    };
    plugin.musicCatalog = {
      getMetadataEnrichmentCandidates: jest.fn(() => [candidate]),
      markMetadataEnrichmentAttempt: jest.fn(),
      resolveOrUpsert: jest.fn()
    };
    plugin.musicResolver = {
      resolve: jest.fn(async () => ({
        success: true,
        song: { title: 'Older catalog song', artist: 'Radio Artist', bpm: 124, genres: ['rock'] }
      }))
    };
    plugin._scheduleCatalogMetadataEnrichment = jest.fn();

    await plugin._runCatalogMetadataEnrichment();

    expect(plugin.musicCatalog.markMetadataEnrichmentAttempt).toHaveBeenCalledWith(8);
    expect(plugin.musicResolver.resolve).toHaveBeenCalledWith('https://example.test/older-song');
    expect(plugin.musicCatalog.resolveOrUpsert).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.test/older-song', bpm: 124, genres: ['rock']
    }));
    expect(plugin._scheduleCatalogMetadataEnrichment).toHaveBeenCalledWith(20_000);
  });

  test('processes a TikTok gift event ID only once', async () => {
    const plugin = new MusicBotPlugin({
      getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
      getDatabase: jest.fn(() => ({})),
      log: jest.fn(),
      emit: jest.fn()
    });
    plugin.config.monetization = {
      ...plugin.config.monetization,
      payToPlayEnabled: true,
      payToPlayGiftCatalog: ['rose']
    };
    plugin._emitToast = jest.fn();
    plugin._emitChatResponse = jest.fn();

    const event = { eventId: 'gift-event-42', username: 'viewer', giftName: 'Rose' };
    await Promise.all([plugin._handleGiftEvent(event), plugin._handleGiftEvent(event)]);

    expect(plugin._getRequestCredits('viewer')).toBe(1);
    expect(plugin._emitToast).toHaveBeenCalledTimes(1);
  });

  test('uses a populated TikTok message ID when an earlier event ID field is blank', async () => {
    const plugin = new MusicBotPlugin({
      getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
      getDatabase: jest.fn(() => ({})),
      log: jest.fn(),
      emit: jest.fn()
    });
    plugin.config.monetization = {
      ...plugin.config.monetization,
      payToPlayEnabled: true,
      payToPlayGiftCatalog: ['rose']
    };
    plugin._emitToast = jest.fn();

    const event = { eventId: '', messageId: 'gift-message-43', username: 'viewer', giftName: 'Rose' };
    await Promise.all([plugin._handleGiftEvent(event), plugin._handleGiftEvent(event)]);

    expect(plugin._getRequestCredits('viewer')).toBe(1);
    expect(plugin._emitToast).toHaveBeenCalledTimes(1);
  });

  test('enforces max requests per user case-insensitively', () => {
    const db = createDbMock();
    const api = createApiMock(db);
    const queueManager = new QueueManager({
      queue: {
        maxLength: 50,
        maxPerUser: 3,
        maxSongDurationSeconds: 600,
        allowDuplicates: true,
        duplicateDetection: 'off',
        cooldownPerUserSeconds: 0
      }
    }, api);

    for (let i = 0; i < 3; i += 1) {
      const addResult = queueManager.addSong({
        title: `Song ${i}`,
        url: `https://example.com/song-${i}.mp3`,
        requestedBy: 'UserOne'
      });
      expect(addResult.success).toBe(true);
    }

    const blocked = queueManager.addSong({
      title: 'Fourth Song',
      url: 'https://example.com/song-4.mp3',
      requestedBy: 'userone'
    });
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain('3');
  });

  test('enforces cooldown per user case-insensitively', () => {
    const db = createDbMock();
    const api = createApiMock(db);
    const queueManager = new QueueManager({
      queue: {
        maxLength: 50,
        maxPerUser: 5,
        maxSongDurationSeconds: 600,
        allowDuplicates: true,
        duplicateDetection: 'off',
        cooldownPerUserSeconds: 30
      }
    }, api);

    const first = queueManager.addSong({
      title: 'First',
      url: 'https://example.com/first.mp3',
      requestedBy: 'ViewerA'
    });
    expect(first.success).toBe(true);

    const second = queueManager.addSong({
      title: 'Second',
      url: 'https://example.com/second.mp3',
      requestedBy: 'viewera'
    });
    expect(second.success).toBe(false);
    expect(second.error).toContain('Sekunden');
  });

  test('keeps a resolver-provided media URL when putting a song into the queue', () => {
    const queueManager = new QueueManager({
      queue: {
        maxLength: 50,
        maxPerUser: 3,
        maxSongDurationSeconds: 600,
        allowDuplicates: true,
        duplicateDetection: 'off',
        cooldownPerUserSeconds: 0
      }
    }, createApiMock(createDbMock()));

    const result = queueManager.addSong({
      title: 'Direct stream',
      url: 'https://www.youtube.com/watch?v=example',
      streamUrl: 'https://media.example.test/direct-stream.m4a',
      requestedBy: 'viewer'
    });

    expect(result.success).toBe(true);
    expect(queueManager.getQueue()[0].streamUrl).toBe('https://media.example.test/direct-stream.m4a');
  });

  test('applies ducking and restores master volume', async () => {
    const engine = new PlaybackEngine({
      defaultVolume: 50,
      ducking: {
        enabled: true,
        targetVolumePercent: 40,
        fadeOutMs: 0,
        fadeInMs: 0,
        holdMs: 10
      },
      normalization: { enabled: false }
    }, { log: jest.fn() });

    const commands = [];
    engine.process = { exitCode: null };
    engine._sendCommand = async (cmd) => {
      commands.push(cmd);
    };

    await engine.setVolume(80);
    await engine.triggerDucking(10);
    expect(engine.getVolume()).toBe(80);
    expect(engine.volume).toBe(32);

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(engine.volume).toBe(80);
    expect(commands).toContainEqual(['set_property', 'volume', 32]);
    expect(commands).toContainEqual(['set_property', 'volume', 80]);
  });

  test('keeps music ducked until the matching TTS playback ends', async () => {
    const engine = new PlaybackEngine({
      defaultVolume: 50,
      ducking: {
        enabled: true,
        targetVolumePercent: 40,
        fadeOutMs: 0,
        fadeInMs: 0
      }
    }, { log: jest.fn() });
    engine.process = { exitCode: null };
    engine._sendCommand = jest.fn(async () => {});

    await engine.setVolume(80);
    await engine.beginDucking();
    expect(engine.volume).toBe(32);

    await engine.endDucking();
    expect(engine.volume).toBe(80);
  });

  test('builds loudnorm filter when normalization is enabled', async () => {
    const engine = new PlaybackEngine({
      defaultVolume: 50,
      ducking: { enabled: false },
      normalization: {
        enabled: true,
        integratedLufs: -14,
        truePeakDb: -1.0,
        lra: 9
      }
    }, { log: jest.fn() });

    const commands = [];
    engine._sendCommand = async (cmd) => {
      commands.push(cmd);
    };

    await engine._applyNormalizationFilter();
    expect(commands[0][0]).toBe('af');
    expect(commands[0][1]).toBe('set');
    expect(commands[0][2]).toContain('loudnorm=I=-14:TP=-1:LRA=9');
  });

  test('keeps the incoming track active when the outgoing track ends during a crossfade', () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const outgoing = { id: 'outgoing', title: 'Outgoing' };
    const incoming = { id: 'incoming', title: 'Incoming' };
    const trackEnd = jest.fn();
    engine.on('track-end', trackEnd);
    engine.nowPlaying = incoming;
    engine.state = 'playing';
    engine._crossfadeOutgoingTrack = outgoing;

    engine._handleMessage(JSON.stringify({ event: 'end-file', reason: 'stop' }));

    expect(trackEnd).toHaveBeenCalledWith({ track: outgoing, reason: 'crossfade' });
    expect(engine.getNowPlaying()).toEqual(incoming);
    expect(engine.getState()).toBe('playing');
  });

  test('attributes a delayed replacement end-file error to the outgoing track', () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const outgoing = { id: 'outgoing', title: 'Outgoing' };
    const incoming = { id: 'incoming', title: 'Incoming' };
    const trackEnd = jest.fn();
    engine.on('track-end', trackEnd);
    engine.nowPlaying = incoming;
    engine.state = 'playing';
    engine._replacementOutgoingTrack = outgoing;

    engine._handleMessage(JSON.stringify({
      event: 'end-file',
      reason: 'error',
      error: 'Delayed outgoing stream failure'
    }));

    expect(trackEnd).toHaveBeenCalledWith(expect.objectContaining({
      track: outgoing,
      reason: 'error',
      error: 'Delayed outgoing stream failure'
    }));
    expect(engine._replacementOutgoingTrack).toBeNull();
    expect(engine.getNowPlaying()).toBe(incoming);
    expect(engine.getState()).toBe('playing');
  });

  test('ignores the replacement stop event without advancing playback', () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const outgoing = { id: 'outgoing', title: 'Outgoing' };
    const incoming = { id: 'incoming', title: 'Incoming' };
    const trackEnd = jest.fn();
    engine.on('track-end', trackEnd);
    engine.nowPlaying = incoming;
    engine.state = 'playing';
    engine._replacementOutgoingTrack = outgoing;

    engine._handleMessage(JSON.stringify({ event: 'end-file', reason: 'stop' }));

    expect(trackEnd).not.toHaveBeenCalled();
    expect(engine._replacementOutgoingTrack).toBeNull();
    expect(engine.getNowPlaying()).toBe(incoming);
    expect(engine.getState()).toBe('playing');
  });

  test('does not retain an outgoing association after an ordinary clear', () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const track = { id: 'terminal-clear', title: 'Terminal clear' };
    engine.nowPlaying = track;
    engine.state = 'playing';

    engine.clearNowPlaying();

    expect(engine._replacementOutgoingTrack).toBeNull();
  });

  test('retains only the current track for an explicitly remembered replacement', () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const active = { id: 'active', title: 'Active' };
    engine.nowPlaying = active;

    expect(engine.rememberReplacementOutgoing(active)).toBe(true);
    engine.clearNowPlaying({ preserveReplacementOutgoing: true });

    expect(engine._replacementOutgoingTrack).toBe(active);
    expect(engine.rememberReplacementOutgoing({ id: 'stale' })).toBe(false);
  });

  test('does not revive playback from a late MPV start-file event without a track', () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });

    engine._handleMessage(JSON.stringify({ event: 'start-file' }));
    expect(engine.getState()).toBe('idle');

    engine.state = 'playing';
    expect(engine.isPlaying()).toBe(false);
    expect(engine.getState()).toBe('idle');
  });

  test('reports an MPV end-file error instead of treating it as a completed song', () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const trackEnd = jest.fn();
    engine.on('track-end', trackEnd);
    engine.nowPlaying = { id: 'failed-track', title: 'Failed Track' };
    engine.state = 'playing';

    engine._handleMessage(JSON.stringify({
      event: 'end-file',
      reason: 'error',
      error: 'Failed to open stream'
    }));

    expect(trackEnd).toHaveBeenCalledWith(expect.objectContaining({
      track: expect.objectContaining({ id: 'failed-track' }),
      reason: 'error',
      error: 'Failed to open stream'
    }));
  });

  test('ignores an unrequested MPV stop event so it cannot advance the queue', () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const trackEnd = jest.fn();
    engine.on('track-end', trackEnd);
    engine.nowPlaying = { id: 'active-track', title: 'Active Track' };
    engine.state = 'playing';

    engine._handleMessage(JSON.stringify({ event: 'end-file', reason: 'stop', playlist_entry_id: 42 }));

    expect(trackEnd).not.toHaveBeenCalled();
    expect(engine.getNowPlaying()).toEqual({ id: 'active-track', title: 'Active Track' });
    expect(engine.getState()).toBe('playing');
  });

  test('serializes MPV volume commands during a fade', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    let inFlight = 0;
    let maxInFlight = 0;
    engine._sendCommand = jest.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 75));
      inFlight -= 1;
    });

    await engine._fadeVolume(50, 0, 150, false);

    expect(maxInFlight).toBe(1);
  });

  test('settles the previous fade promise when a later fade supersedes it', async () => {
    jest.useFakeTimers();
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    engine._setMpvVolume = jest.fn(async () => {});

    try {
      const firstFade = engine._fadeVolume(50, 0, 500);
      await Promise.resolve();
      const secondFade = engine._fadeVolume(0, 50, 0);
      let firstFadeSettled = false;
      firstFade.then(() => { firstFadeSettled = true; });

      await jest.runAllTimersAsync();
      await secondFade;
      await Promise.resolve();

      expect(firstFadeSettled).toBe(true);
      expect(engine._fadeTimer).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('starts the MPV executable directly instead of the Windows command wrapper', () => {
    const engine = new PlaybackEngine({ mpvPath: 'mpv', defaultVolume: 50 }, { log: jest.fn() });

    expect(engine._getMpvExecutablePath()).toBe(process.platform === 'win32' ? 'mpv.exe' : 'mpv');
  });

  test('keeps shutdown protection active until the MPV child closes', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const child = {
      kill: jest.fn(),
      once: jest.fn()
    };
    engine.process = child;

    await engine.shutdown();

    expect(child.once).toHaveBeenCalledWith('close', expect.any(Function));
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(engine._shuttingDown).toBe(true);

    child.once.mock.calls[0][1]();
    expect(engine._shuttingDown).toBe(false);
  });

  test('restarts an unresponsive MPV process without discarding the active track', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const track = { id: 'keep-playing', title: 'Keep Playing' };
    let closeHandler;
    const child = {
      exitCode: null,
      kill: jest.fn(),
      once: jest.fn((event, handler) => {
        if (event === 'close') closeHandler = handler;
      })
    };

    engine.process = child;
    engine.socket = { destroy: jest.fn() };
    engine.nowPlaying = track;
    engine.state = 'playing';

    const restart = engine.restart();

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(engine.getNowPlaying()).toEqual(track);
    closeHandler();
    await expect(restart).resolves.toEqual(track);
    expect(engine.process).toBeNull();
    expect(engine.getState()).toBe('idle');
  });

  test('waits for MPV acknowledgement before considering a command applied', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    engine.socket = {
      destroyed: false,
      write: jest.fn((_payload, callback) => callback())
    };

    const command = engine._sendCommand(['set_property', 'volume', 15], { waitForResponse: true });
    const payload = JSON.parse(engine.socket.write.mock.calls[0][0]);
    engine._handleMessage(JSON.stringify({ request_id: payload.request_id, error: 'success' }));

    await expect(command).resolves.toEqual(expect.objectContaining({ error: 'success' }));
  });

  test('skips once and ignores MPV\'s follow-up end-file event', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const trackEnd = jest.fn();
    const track = { id: 'skip-me', title: 'Skip me' };
    engine.nowPlaying = track;
    engine.state = 'playing';
    engine._sendCommand = jest.fn(async () => ({}));
    engine.on('track-end', trackEnd);

    await engine.skip();
    engine._handleMessage(JSON.stringify({ event: 'end-file', reason: 'stop' }));

    expect(engine._sendCommand).toHaveBeenCalledWith(['stop']);
    expect(trackEnd).toHaveBeenCalledTimes(1);
    expect(trackEnd).toHaveBeenCalledWith({ track, reason: 'skip' });
    expect(engine.getNowPlaying()).toBeNull();
  });

  test('plays yt-dlp media URLs instead of relying on mpv\'s optional YouTube hook', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50, normalization: { enabled: false } }, { log: jest.fn() });
    const commands = [];
    engine.process = { exitCode: null };
    engine._sendCommand = jest.fn(async (command) => {
      commands.push(command);
    });
    engine._applyNormalizationFilter = jest.fn(async () => {});
    engine.setVolume = jest.fn(async () => {});

    await engine.play({
      id: 'direct-media',
      title: 'Direct media',
      url: 'https://www.youtube.com/watch?v=example',
      streamUrl: 'https://media.example.test/direct-media.m4a'
    });

    expect(commands[0]).toEqual(['loadfile', 'https://media.example.test/direct-media.m4a', 'replace']);
  });

  test('assigns a playback ID when an Auto-DJ track has no source ID', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50, normalization: { enabled: false } }, { log: jest.fn() });
    engine.process = { exitCode: null };
    engine._sendCommand = jest.fn(async () => {});
    engine._applyNormalizationFilter = jest.fn(async () => {});
    engine.setVolume = jest.fn(async () => {});

    await engine.play({
      title: 'Auto-DJ Song',
      url: 'https://media.example.test/auto-dj.m4a'
    });

    expect(engine.getNowPlaying().id).toEqual(expect.any(String));
  });

  test('blocks matching video IDs and titles without turning the song cooldown into an artist ban', () => {
    const now = Date.UTC(2026, 6, 14, 12, 0, 0);
    const db = createAutoDjDb({
      recentHistory: [{ youtubeId: 'seen-id', title: 'Same Song!', artist: 'Artist One' }],
      exclusions: [{ youtubeId: 'bad-id', titleKey: 'broken stream', artistKey: 'artist two' }]
    });
    const autoDJ = new AutoDJ({ enabled: true, mode: 'mix', repeatCooldownHours: 12 }, {}, db, { log: jest.fn() });
    const blocks = autoDJ.getSelectionBlocks(now);

    expect(autoDJ.isTrackBlocked({ youtubeId: 'seen-id', title: 'Other', artist: 'Other' }, blocks)).toBe(true);
    expect(autoDJ.isTrackBlocked({ youtubeId: 'new-id', title: 'same song', artist: 'Artist One' }, blocks)).toBe(true);
    expect(autoDJ.isTrackBlocked({ youtubeId: 'bad-id', title: 'Fresh', artist: 'Fresh' }, blocks)).toBe(true);
    expect(autoDJ.isTrackBlocked({ youtubeId: 'new-id', title: 'Fresh title', artist: 'Artist One' }, blocks)).toBe(false);
    expect(autoDJ.isTrackBlocked({ youtubeId: 'new-id', title: 'Fresh', artist: 'Fresh' }, blocks)).toBe(false);
  });

  test('persists a failed Auto-DJ track until the cooldown expires', () => {
    const now = Date.UTC(2026, 6, 14, 12, 0, 0);
    const db = createAutoDjDb();
    const autoDJ = new AutoDJ({ enabled: true, mode: 'mix', repeatCooldownHours: 12 }, {}, db, { log: jest.fn() });

    autoDJ.recordFailedTrack({ youtubeId: 'stream-failure', title: 'Broken Stream', artist: 'DJ Test' }, 'end-file', now);

    expect(db.runCalls[0]).toEqual(expect.objectContaining({
      youtubeId: 'stream-failure', titleKey: 'broken stream', artistKey: 'dj test',
      expiresAt: now + (12 * 60 * 60 * 1000), reason: 'end-file'
    }));
  });

  test('does not block tracks whose history and failed-stream exclusions have expired', () => {
    const now = Date.UTC(2026, 6, 14, 12, 0, 0);
    const cooldownMs = 12 * 60 * 60 * 1000;
    const history = [{
      youtubeId: 'expired-id',
      title: 'Expired History',
      artist: 'Expired Artist',
      finishedAt: now - cooldownMs - 1
    }];
    const exclusions = [{
      youtubeId: 'expired-id',
      titleKey: 'expired history',
      artistKey: 'expired artist',
      expiresAt: now - 1
    }];
    const db = createAutoDjDb({
      recentHistory: (cutoff) => history.filter((row) => row.finishedAt >= cutoff),
      exclusions: (queryNow) => exclusions.filter((row) => row.expiresAt > queryNow)
    });
    const autoDJ = new AutoDJ({ enabled: true, mode: 'mix', repeatCooldownHours: 12 }, {}, db, { log: jest.fn() });

    const blocks = autoDJ.getSelectionBlocks(now);

    expect(autoDJ.isTrackBlocked({
      youtubeId: 'expired-id',
      title: 'Expired History',
      artist: 'Expired Artist'
    }, blocks)).toBe(false);
  });

  test('uses the default 12-hour cooldown when Auto-DJ cooldown configuration is omitted', () => {
    const now = Date.UTC(2026, 6, 14, 12, 0, 0);
    const db = createAutoDjDb();
    const autoDJ = new AutoDJ({ enabled: true, mode: 'mix' }, {}, db, { log: jest.fn() });

    autoDJ.recordFailedTrack({ youtubeId: 'default-cooldown' }, 'end-file', now);

    expect(db.runCalls[0].expiresAt).toBe(now + (12 * 60 * 60 * 1000));
  });

  test.each([
    ['invalid', 'not-a-number', 12],
    ['fractional', 12.9, 12],
    ['below minimum', 0, 1],
    ['above maximum', 999, 168]
  ])('normalizes %s Auto-DJ cooldown values before recording exclusions', (_label, repeatCooldownHours, expectedHours) => {
    const now = Date.UTC(2026, 6, 14, 12, 0, 0);
    const db = createAutoDjDb();
    const autoDJ = new AutoDJ({ enabled: true, mode: 'mix', repeatCooldownHours }, {}, db, { log: jest.fn() });

    autoDJ.recordFailedTrack({ youtubeId: 'normalized-cooldown' }, 'end-file', now);

    expect(autoDJ.config.repeatCooldownHours).toBe(expectedHours);
    expect(db.runCalls[0].expiresAt).toBe(now + (expectedHours * 60 * 60 * 1000));
  });

  test('chooses an eligible history candidate when the weighted mix roll selects history', async () => {
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'mix',
      mixHistoryPercent: 80,
      historyMinPlays: 2,
      historyShuffled: false
    }, {}, createAutoDjDb({
      historyCandidates: [{
        youtubeId: 'history-only', title: 'History only', artist: 'History Artist',
        url: 'https://www.youtube.com/watch?v=history-only', plays: 2,
        channelId: 'channel-1', channelName: 'History Channel'
      }]
    }), { log: jest.fn() });
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0.2);

    try {
      const result = await autoDJ.getNextSong();

      expect(result.song.youtubeId).toBe('history-only');
      expect(result.song).toMatchObject({
        channelId: 'channel-1',
        channelName: 'History Channel'
      });
      expect(autoDJ.getStatus().selectionSource).toBe('history');
    } finally {
      Math.random = originalRandom;
    }
  });

  test('excludes skipped rows from grouped Auto-DJ history candidates', () => {
    const db = createAutoDjDb();
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'history',
      historyMinPlays: 2
    }, {}, db, { log: jest.fn() });

    autoDJ._loadHistoryCandidates();

    const historyQuery = db.prepare.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes('COUNT(*) as plays'));
    expect(historyQuery).toContain('COALESCE(skipped, 0) = 0');
  });

  test('skips failed-stream exclusions when selecting in history mode', async () => {
    const broken = {
      youtubeId: 'broken-history',
      title: 'Broken History',
      artist: 'Broken Artist',
      url: 'https://www.youtube.com/watch?v=broken-history',
      plays: 3
    };
    const allowed = {
      youtubeId: 'allowed-history',
      title: 'Allowed History',
      artist: 'Allowed Artist',
      url: 'https://www.youtube.com/watch?v=allowed-history',
      plays: 2
    };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'history',
      historyMinPlays: 2,
      historyShuffled: false
    }, {}, createAutoDjDb({
      historyCandidates: [broken, allowed],
      exclusions: [{
        youtubeId: broken.youtubeId,
        titleKey: 'broken history',
        artistKey: 'broken artist'
      }]
    }), { log: jest.fn() });

    const result = await autoDJ.getNextSong();

    expect(result.song.youtubeId).toBe(allowed.youtubeId);
    expect(autoDJ.getStatus().blockedCount).toBe(1);
  });

  test('falls back to history when the weighted radio lookup has no result', async () => {
    const seed = {
      youtubeId: 'seed-1', title: 'History seed', artist: 'Seed Artist',
      url: 'https://www.youtube.com/watch?v=seed-1', plays: 2
    };
    const resolver = { resolvePlaylistEntry: jest.fn(async () => ({ success: false })) };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'mix',
      mixHistoryPercent: 0,
      historyMinPlays: 2,
      historyShuffled: false
    }, resolver, createAutoDjDb({ historyCandidates: [seed] }), { log: jest.fn() });
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0);

    try {
      const result = await autoDJ.getNextSong();

      expect(resolver.resolvePlaylistEntry).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=seed-1&list=RDseed-1',
        2
      );
      expect(result.song.youtubeId).toBe('seed-1');
      expect(autoDJ.getStatus().selectionSource).toBe('history-fallback');
    } finally {
      Math.random = originalRandom;
    }
  });

  test('does not reuse a session-played history candidate as a Radio-Mix fallback', async () => {
    const candidate = {
      youtubeId: 'session-played', title: 'Session Played', artist: 'History Artist',
      url: 'https://www.youtube.com/watch?v=session-played', plays: 2
    };
    const resolver = { resolvePlaylistEntry: jest.fn(async () => ({ success: false })) };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'mix',
      mixHistoryPercent: 0,
      historyMinPlays: 2,
      historyShuffled: false
    }, resolver, createAutoDjDb({ historyCandidates: [candidate] }), { log: jest.fn() });
    autoDJ.playedInSession.add(candidate.youtubeId);

    const result = await autoDJ.getNextSong();

    expect(result).toBeNull();
    expect(autoDJ.getStatus().selectionSource).not.toBe('history-fallback');
  });

  test('does not reuse a session-played history candidate when the pool is thin', async () => {
    const candidate = {
      youtubeId: 'session-played', title: 'Session Played', artist: 'History Artist',
      url: 'https://www.youtube.com/watch?v=session-played', plays: 2
    };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'history',
      historyMinPlays: 2,
      historyShuffled: false
    }, {}, createAutoDjDb({ historyCandidates: [candidate] }), { log: jest.fn() });
    autoDJ.playedInSession.add(candidate.youtubeId);

    const result = await autoDJ.getNextSong();

    expect(result).toBeNull();
  });

  test('skips cooldown-blocked entries before picking a playlist track', async () => {
    const playlistUrl = 'https://www.youtube.com/playlist?list=cooldown';
    const resolver = {
      resolvePlaylistEntry: jest.fn(async (_url, index) => ({
        success: true,
        song: index === 1
          ? { youtubeId: 'playlist-seen', title: 'Recently played', artist: 'Artist One' }
          : { youtubeId: 'playlist-fresh', title: 'Fresh playlist title', artist: 'Artist Two' }
      }))
    };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'playlist',
      playlistUrls: [playlistUrl]
    }, resolver, createAutoDjDb({
      recentHistory: [{ youtubeId: 'playlist-seen', title: 'Recently played', artist: 'Artist One' }]
    }), { log: jest.fn() });

    const result = await autoDJ.getNextSong();

    expect(result.song.youtubeId).toBe('playlist-fresh');
    expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(1, playlistUrl, 1);
    expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(2, playlistUrl, 2);
  });

  test('skips cooldown-blocked related-radio tracks before choosing a random suggestion', async () => {
    const radioUrl = 'https://www.youtube.com/watch?v=playlist-seed&list=RDplaylist-seed';
    const resolver = {
      resolvePlaylistEntry: jest.fn(async (_url, index) => ({
        success: true,
        song: index === 2
          ? { youtubeId: 'related-seen', title: 'Recently played related', artist: 'Artist One' }
          : { youtubeId: 'related-fresh', title: 'Fresh related title', artist: 'Artist Two' }
      }))
    };
    const autoDJ = new AutoDJ({ enabled: true, mode: 'random' }, resolver, createAutoDjDb({
      recentHistory: [{ youtubeId: 'related-seen', title: 'Recently played related', artist: 'Artist One' }]
    }), { log: jest.fn() });
    autoDJ.lastPlaylistTrack = { youtubeId: 'playlist-seed', title: 'Playlist seed', artist: 'Seed Artist' };

    const result = await autoDJ.getNextSong();

    expect(result.song.youtubeId).toBe('related-fresh');
    expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(1, radioUrl, 2);
    expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(2, radioUrl, 3);
  });

  test('skips blocked radio suggestions and accepts the next fresh suggestion', async () => {
    const resolver = {
      resolvePlaylistEntry: jest.fn(async (_url, index) => ({
        success: true,
        song: index === 2
          ? { youtubeId: 'blocked-radio', title: 'Blocked radio', artist: 'Blocked Artist' }
          : { youtubeId: 'fresh-radio', title: 'Fresh radio', artist: 'Fresh Artist' }
      }))
    };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'mix',
      mixHistoryPercent: 0,
      historyMinPlays: 2,
      historyShuffled: false
    }, resolver, createAutoDjDb({
      exclusions: [{ youtubeId: 'blocked-radio', titleKey: '', artistKey: '' }],
      historyCandidates: [{
        youtubeId: 'seed-2', title: 'Seed', artist: 'Seed Artist',
        url: 'https://www.youtube.com/watch?v=seed-2', plays: 2
      }]
    }), { log: jest.fn() });
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0);

    try {
      const result = await autoDJ.getNextSong();

      expect(result.song.youtubeId).toBe('fresh-radio');
      expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(
        1,
        'https://www.youtube.com/watch?v=seed-2&list=RDseed-2',
        2
      );
      expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(
        2,
        'https://www.youtube.com/watch?v=seed-2&list=RDseed-2',
        3
      );
      expect(autoDJ.getStatus().selectionSource).toBe('radio');
    } finally {
      Math.random = originalRandom;
    }
  });

  test('only counts Auto-DJ tracks after playback starts successfully', async () => {
    const resolver = {
      resolvePlaylistEntry: jest.fn(async () => ({
        success: true,
        song: { title: 'Playlist track', youtubeId: 'playlist123' }
      }))
    };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'playlist',
      playlistUrls: ['https://www.youtube.com/playlist?list=playlist']
    }, resolver, createDbMock(), { log: jest.fn() });

    const result = await autoDJ.onQueueEmpty();

    expect(result.song.title).toBe('Playlist track');
    expect(autoDJ.getStatus().consecutiveCount).toBe(0);

    autoDJ.markTrackStarted(result.song);
    expect(autoDJ.getStatus().consecutiveCount).toBe(1);
    expect(autoDJ.getStatus().lastResult.state).toBe('playing');
  });

  test('stops normal Auto-DJ at its consecutive-track limit but permits a forced manual next track', async () => {
    const resolver = {
      resolvePlaylistEntry: jest.fn(async () => ({
        success: true,
        song: { title: 'Manual Auto-DJ track', youtubeId: 'manual-autodj-track' }
      }))
    };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'playlist',
      playlistUrls: ['https://www.youtube.com/playlist?list=playlist'],
      maxConsecutiveAutoDJ: 1
    }, resolver, createDbMock(), { log: jest.fn() });
    autoDJ.markTrackStarted({ title: 'First Auto-DJ track', youtubeId: 'first-autodj-track' });

    await expect(autoDJ.getNextSong()).resolves.toBeNull();
    expect(autoDJ.getStatus()).toMatchObject({
      consecutiveCount: 1,
      maxConsecutiveAutoDJ: 1,
      lastResult: { state: 'limit-reached' }
    });

    await expect(autoDJ.getNextSong(true)).resolves.toMatchObject({
      song: { youtubeId: 'manual-autodj-track' }
    });
  });

  test('advances through individual entries when Auto-DJ receives one playlist URL', async () => {
    const resolver = {
      resolvePlaylistEntry: jest.fn(async (_url, index) => ({
        success: true,
        song: { title: `Playlist ${index}`, youtubeId: `playlist-${index}` }
      }))
    };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'playlist',
      playlistUrls: ['https://www.youtube.com/playlist?list=PLScN1UM-Rlxo']
    }, resolver, createDbMock(), { log: jest.fn() });

    const first = await autoDJ.getNextSong();
    const second = await autoDJ.getNextSong();

    expect(first.song.title).toBe('Playlist 1');
    expect(second.song.title).toBe('Playlist 2');
    expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(
      1,
      'https://www.youtube.com/playlist?list=PLScN1UM-Rlxo',
      1
    );
    expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(
      2,
      'https://www.youtube.com/playlist?list=PLScN1UM-Rlxo',
      2
    );
  });

  test('continues with matching playlist-radio titles when the configured playlist is exhausted', async () => {
    const playlistUrl = 'https://www.youtube.com/playlist?list=finished';
    const radioUrl = 'https://www.youtube.com/watch?v=playlist-seed&list=RDplaylist-seed';
    const resolver = {
      resolvePlaylistEntry: jest.fn(async (url, index) => {
        if (url === playlistUrl && index === 1) {
          return { success: true, song: { title: 'Playlist seed', youtubeId: 'playlist-seed' } };
        }
        if (url === radioUrl && index === 2) {
          return { success: true, song: { title: 'Matching radio title', youtubeId: 'radio-1' } };
        }
        return { success: false };
      })
    };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'playlist',
      playlistUrls: [playlistUrl]
    }, resolver, createDbMock(), { log: jest.fn() });

    const first = await autoDJ.getNextSong();
    autoDJ.markTrackStarted(first.song);
    const result = await autoDJ.getNextSong();

    expect(result.song.title).toBe('Matching radio title');
    expect(resolver.resolvePlaylistEntry).toHaveBeenCalledWith(radioUrl, 2);
  });

  test('uses the currently playing YouTube title as the random Auto-DJ seed', async () => {
    const resolver = {
      resolvePlaylistEntry: jest.fn(async () => ({
        success: true,
        song: { title: 'Related title', youtubeId: 'related-video' }
      }))
    };
    const autoDJ = new AutoDJ({ enabled: true, mode: 'random' }, resolver, createDbMock(), { log: jest.fn() });

    autoDJ.setPlaybackSeed({ title: 'Active title', youtubeId: 'active-video' });
    const result = await autoDJ.getNextSong();

    expect(result.song.title).toBe('Related title');
    expect(resolver.resolvePlaylistEntry).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=active-video&list=RDactive-video',
      2
    );
  });

  test('starts random Auto-DJ from the newest YouTube history title without an active seed', async () => {
    const historySeed = {
      youtubeId: 'history-seed',
      title: 'History seed',
      artist: 'History artist',
      url: 'https://www.youtube.com/watch?v=history-seed',
      duration: 180,
      source: 'youtube',
      thumbnail: 'https://example.test/seed.jpg'
    };
    const db = {
      prepare: jest.fn(() => ({
        get: jest.fn(() => historySeed),
        all: jest.fn(() => [])
      }))
    };
    const resolver = {
      resolvePlaylistEntry: jest.fn(async () => ({
        success: true,
        song: { title: 'Related title', youtubeId: 'related-video' }
      }))
    };
    const autoDJ = new AutoDJ({ enabled: true, mode: 'random' }, resolver, db, { log: jest.fn() });

    const result = await autoDJ.getNextSong(true);

    expect(result.song.title).toBe('Related title');
    expect(autoDJ.getStatus().lastPlaylistTrack.title).toBe('History seed');
    expect(resolver.resolvePlaylistEntry).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=history-seed&list=RDhistory-seed',
      2
    );
  });

  test('skips recently played titles when choosing playlist-radio suggestions', async () => {
    const radioUrl = 'https://www.youtube.com/watch?v=playlist-seed&list=RDplaylist-seed';
    const resolver = {
      resolvePlaylistEntry: jest.fn(async (_url, index) => ({
        success: true,
        song: index === 2
          ? { title: 'Already played', youtubeId: 'already-played' }
          : { title: 'Fresh suggestion', youtubeId: 'fresh-suggestion' }
      }))
    };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'random'
    }, resolver, createDbMock(), { log: jest.fn() });
    autoDJ.lastPlaylistTrack = { title: 'Playlist seed', youtubeId: 'playlist-seed' };
    autoDJ.markTrackStarted({ title: 'Already played', youtubeId: 'already-played' });

    const result = await autoDJ.getNextSong();

    expect(result.song.title).toBe('Fresh suggestion');
    expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(1, radioUrl, 2);
    expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(2, radioUrl, 3);
  });

  test('tries the next playlist-radio title after a lookup fails', async () => {
    const radioUrl = 'https://www.youtube.com/watch?v=playlist-seed&list=RDplaylist-seed';
    const resolver = {
      resolvePlaylistEntry: jest.fn(async (_url, index) => {
        if (index === 2) throw new Error('yt-dlp timed out');
        return {
          success: true,
          song: { title: 'Working suggestion', youtubeId: 'working-suggestion' }
        };
      })
    };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'random'
    }, resolver, createDbMock(), { log: jest.fn() });
    autoDJ.lastPlaylistTrack = { title: 'Playlist seed', youtubeId: 'playlist-seed' };

    const result = await autoDJ.getNextSong();

    expect(result.song.title).toBe('Working suggestion');
    expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(1, radioUrl, 2);
    expect(resolver.resolvePlaylistEntry).toHaveBeenNthCalledWith(2, radioUrl, 3);
  });
});
