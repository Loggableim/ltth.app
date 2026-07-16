const QueueManager = require('../plugins/music-bot/lib/queue-manager');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');
const AutoDJ = require('../plugins/music-bot/lib/auto-dj');

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

describe('Music Bot core features', () => {
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

  test('blocks matching video IDs, titles, and artists for the configured cooldown', () => {
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

  test('preserves history-mode fallback to a session-played candidate', async () => {
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

    expect(result.song.youtubeId).toBe(candidate.youtubeId);
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
      exclusions: [{ youtubeId: '', titleKey: '', artistKey: 'blocked artist' }],
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
