const AutoDJ = require('../plugins/music-bot/lib/auto-dj');

let RadioSupervisor = null;
try {
  RadioSupervisor = require('../plugins/music-bot/lib/radio-supervisor');
} catch (_) {
  // The first RED run intentionally proves that the supervisor does not exist yet.
}

function createSupervisor(overrides = {}) {
  const advance = overrides.advance || jest.fn(async () => ({ success: true, song: { id: 'next' } }));
  const supervisor = RadioSupervisor
    ? new RadioSupervisor({
      advance,
      isPlaying: overrides.isPlaying || (() => false),
      watchdogIntervalMs: overrides.watchdogIntervalMs || 1000,
      onStateChange: overrides.onStateChange || jest.fn()
    })
    : null;
  return { supervisor, advance };
}

function radioCandidate(id, overrides = {}) {
  return {
    songId: id,
    canonicalKey: `song:${id}`,
    title: `Song ${id}`,
    feedback: 'neutral',
    completePlays: 0,
    earlySkips: 0,
    lastPlayedAt: null,
    artists: [{ id: id * 10, name: `Artist ${id}`, affinity: 0, lastPlayedAt: null }],
    sources: [{
      id: id * 100,
      songId: id,
      provider: 'youtube',
      providerId: `video-${id}`,
      trackKey: `youtube:video-${id}`,
      url: `https://www.youtube.com/watch?v=video-${id}`,
      cooldownUntil: null
    }],
    ...overrides
  };
}

function createCatalogAutoDJ({ candidates, playlistItems, random = () => 0, resolver, now = () => 10_000_000 } = {}) {
  const catalog = {
    getRadioCandidates: jest.fn(() => candidates || []),
    resolveOrUpsert: jest.fn((track) => ({
      song: { id: track.catalogSongId || 999 },
      source: { id: track.sourceId || 999 }
    })),
    recordSourceFailure: jest.fn(),
    recordSourceSuccess: jest.fn()
  };
  const playlistStore = {
    getRadioCandidates: jest.fn(() => playlistItems || []),
    advanceRadioCursor: jest.fn()
  };
  const autoDJ = new AutoDJ(
    { enabled: true, mode: 'mix', repeatCooldownHours: 12 },
    resolver || { resolvePlaylistEntry: jest.fn(async () => ({ success: false })) },
    { prepare: jest.fn(() => ({ all: jest.fn(() => []), run: jest.fn() })) },
    { log: jest.fn() },
    { catalog, playlistStore, random, now, isBanned: (track) => Boolean(track.banned) }
  );
  return { autoDJ, catalog, playlistStore };
}

describe('music-bot generation-bound radio supervisor', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  test('exports the central supervisor', () => {
    expect(RadioSupervisor).toEqual(expect.any(Function));
  });

  test('coalesces simultaneous EOF, crossfade, retry and watchdog wakes into one successor', async () => {
    let release;
    const { supervisor, advance } = createSupervisor({
      advance: jest.fn(() => new Promise((resolve) => { release = resolve; }))
    });
    supervisor.setEnabled(true, { wake: false });

    const wakes = [
      supervisor.wake('eof'),
      supervisor.wake('crossfade'),
      supervisor.wake('retry'),
      supervisor.wake('watchdog')
    ];
    await Promise.resolve();
    release({ success: true, song: { id: 'only-successor' } });

    await expect(Promise.all(wakes)).resolves.toEqual([
      expect.objectContaining({ success: true }),
      expect.objectContaining({ success: true }),
      expect.objectContaining({ success: true }),
      expect.objectContaining({ success: true })
    ]);
    expect(advance).toHaveBeenCalledTimes(1);
    expect(supervisor.getSnapshot()).toMatchObject({ advanceId: 1, retryAt: null, backoffSeconds: 0 });
    supervisor.destroy();
  });

  test('retries after 5, 15, 30 and 60 seconds and keeps the 60 second cap forever', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const { supervisor, advance } = createSupervisor({
      advance: jest.fn(async () => ({ success: false, failureClass: 'transient' }))
    });
    supervisor.setEnabled(true, { wake: false });

    await supervisor.wake('queue-empty');
    expect(supervisor.getSnapshot()).toMatchObject({ backoffSeconds: 5, retryAt: 1_005_000 });
    for (const expected of [15, 30, 60, 60, 60]) {
      await jest.advanceTimersByTimeAsync(supervisor.getSnapshot().backoffSeconds * 1000);
      expect(supervisor.getSnapshot().backoffSeconds).toBe(expected);
    }

    expect(advance).toHaveBeenCalledTimes(6);
    supervisor.destroy();
  });

  test.each(['disable', 'lock', 'destroy'])('cancels retry and watchdog work on %s', async (action) => {
    jest.useFakeTimers({ now: 2_000_000 });
    const { supervisor, advance } = createSupervisor({
      advance: jest.fn(async () => ({ success: false, failureClass: 'blocked-pool' }))
    });
    supervisor.setEnabled(true, { wake: false });
    await supervisor.wake('queue-empty');

    if (action === 'disable') supervisor.setEnabled(false);
    if (action === 'lock') supervisor.setLocked(true);
    if (action === 'destroy') supervisor.destroy();
    await jest.advanceTimersByTimeAsync(120_000);

    expect(advance).toHaveBeenCalledTimes(1);
    expect(supervisor.getSnapshot()).toMatchObject({ retryAt: null, backoffSeconds: 0 });
    if (action !== 'destroy') supervisor.destroy();
  });

  test('detaches an in-flight advance when a new generation is enabled', async () => {
    const releases = [];
    const { supervisor, advance } = createSupervisor({
      advance: jest.fn(() => new Promise((resolve) => releases.push(resolve)))
    });
    supervisor.setEnabled(true, { wake: false });
    const stale = supervisor.wake('old-generation');
    await Promise.resolve();

    supervisor.setEnabled(false);
    supervisor.setEnabled(true, { wake: false });
    const current = supervisor.wake('new-generation');
    await Promise.resolve();

    expect(advance).toHaveBeenCalledTimes(2);
    releases[0]({ success: true, song: { id: 'stale' } });
    releases[1]({ success: true, song: { id: 'current' } });
    await expect(stale).resolves.toMatchObject({ stale: true });
    await expect(current).resolves.toMatchObject({ success: true, song: { id: 'current' } });
    supervisor.destroy();
  });

  test('idle watchdog runs without a now-playing heartbeat and exposes a scheduled retry', async () => {
    jest.useFakeTimers({ now: 3_000_000 });
    const { supervisor, advance } = createSupervisor({
      advance: jest.fn(async () => ({ success: false, failureClass: 'empty-pool' })),
      watchdogIntervalMs: 1000
    });
    supervisor.setEnabled(true, { wake: false });

    await jest.advanceTimersByTimeAsync(1000);

    expect(advance).toHaveBeenCalledTimes(1);
    expect(supervisor.getSnapshot()).toMatchObject({
      desiredPlayback: true,
      lastWakeReason: 'watchdog',
      retryAt: 3_006_000,
      backoffSeconds: 5,
      failureClass: 'empty-pool'
    });
    supervisor.destroy();
  });

  test('keeps an empty pool scheduled and clears backoff when a candidate appears', async () => {
    jest.useFakeTimers({ now: 4_000_000 });
    let candidateAvailable = false;
    const { supervisor, advance } = createSupervisor({
      advance: jest.fn(async () => candidateAvailable
        ? { success: true, song: { id: 'recovered' } }
        : { success: false, failureClass: 'empty-pool' })
    });
    supervisor.setEnabled(true, { wake: false });

    await supervisor.wake('queue-empty');
    expect(supervisor.getSnapshot()).toMatchObject({ retryAt: 4_005_000, backoffSeconds: 5 });

    candidateAvailable = true;
    await jest.advanceTimersByTimeAsync(5000);

    expect(advance).toHaveBeenCalledTimes(2);
    expect(supervisor.getSnapshot()).toMatchObject({
      retryAt: null,
      backoffSeconds: 0,
      failureClass: null,
      lastWakeReason: 'retry'
    });
    supervisor.destroy();
  });

  test('advances 100 local short tracks without a ten-title stop', async () => {
    let index = 0;
    const { supervisor, advance } = createSupervisor({
      advance: jest.fn(async () => ({
        success: true,
        song: { id: `local-${++index}`, localPath: `C:/music/${index}.wav`, duration: 1 }
      }))
    });
    supervisor.setEnabled(true, { wake: false });

    for (let track = 0; track < 100; track += 1) {
      await supervisor.wake('eof');
    }

    expect(advance).toHaveBeenCalledTimes(100);
    expect(supervisor.getSnapshot()).toMatchObject({ advanceId: 100, retryAt: null, backoffSeconds: 0 });
    supervisor.destroy();
  });

  test('allows at most one player reset inside one advance generation', async () => {
    const reset = jest.fn(async () => {});
    const { supervisor } = createSupervisor({
      advance: jest.fn(async (context) => {
        await context.resetPlayerOnce(reset);
        await context.resetPlayerOnce(reset);
        return { success: false, failureClass: 'ipc' };
      })
    });
    supervisor.setEnabled(true, { wake: false });

    await supervisor.wake('ipc-failure');

    expect(reset).toHaveBeenCalledTimes(1);
    supervisor.destroy();
  });

  test('restarts retry backoff after a successful player reset', async () => {
    jest.useFakeTimers({ now: 5_000_000 });
    let shouldReset = false;
    const reset = jest.fn(async () => {});
    const { supervisor } = createSupervisor({
      advance: jest.fn(async (context) => {
        if (shouldReset) await context.resetPlayerOnce(reset);
        return { success: false, failureClass: 'ipc' };
      })
    });
    supervisor.setEnabled(true, { wake: false });
    await supervisor.wake('first-failure');
    await jest.advanceTimersByTimeAsync(5000);
    expect(supervisor.getSnapshot().backoffSeconds).toBe(15);

    shouldReset = true;
    await supervisor.wake('ipc-failure');

    expect(reset).toHaveBeenCalledTimes(1);
    expect(supervisor.getSnapshot().backoffSeconds).toBe(5);
    supervisor.destroy();
  });
});

describe('music-bot catalog radio selection', () => {
  test('uses an injectable exact 60/40 familiar/discovery boundary', async () => {
    const candidate = radioCandidate(1);
    const playlistItems = [{ songId: 1, playlistId: 'mix', weight: 1, mode: 'shuffle', position: 0, itemCount: 1 }];
    const familiar = createCatalogAutoDJ({ candidates: [candidate], playlistItems, random: () => 0.599999 });
    await expect(familiar.autoDJ.getNextSong()).resolves.toMatchObject({
      song: { catalogSongId: 1 }, selectionSource: 'familiar'
    });

    const discoveryTrack = { title: 'Discovery', youtubeId: 'discover-1', url: 'https://youtu.be/discover-1' };
    const resolver = { resolvePlaylistEntry: jest.fn(async () => ({ success: true, song: discoveryTrack })) };
    const discovery = createCatalogAutoDJ({ candidates: [candidate], playlistItems, random: () => 0.6, resolver });
    await expect(discovery.autoDJ.getNextSong()).resolves.toMatchObject({
      song: { title: 'Discovery' }, selectionSource: 'discovery'
    });
  });

  test('applies the exact upvote, artist-affinity and implicit play/skip factors', async () => {
    const upvoted = radioCandidate(1, {
      feedback: 'up',
      completePlays: 10,
      earlySkips: 1,
      artists: [{ id: 10, name: 'Liked', affinity: 2, lastPlayedAt: null }]
    });
    const implicit = radioCandidate(2, {
      completePlays: 10,
      earlySkips: 1,
      artists: [{ id: 20, name: 'Implicit', affinity: -4, lastPlayedAt: null }]
    });
    const playlistItems = [1, 2].map((songId, position) => ({
      songId, playlistId: 'shuffle', weight: 7, mode: 'shuffle', position, itemCount: 2
    }));
    const rolls = [0, 0, 0.99];
    const { autoDJ } = createCatalogAutoDJ({
      candidates: [upvoted, implicit],
      playlistItems,
      random: () => rolls.shift() ?? 0
    });

    await autoDJ.getNextSong();

    const [upvotedScore, implicitScore] = autoDJ.getStatus().lastSelection.candidates;
    expect(upvotedScore).toMatchObject({
      songId: 1,
      explicitSongFactor: 3,
      implicitSongFactor: 1.2,
      artistFactor: 1.5
    });
    expect(upvotedScore.songFactor).toBeCloseTo(3.6);
    expect(upvotedScore.score).toBeCloseTo(5.4);
    expect(implicitScore).toMatchObject({
      songId: 2,
      explicitSongFactor: 1,
      implicitSongFactor: 1.2,
      songFactor: 1.2,
      artistFactor: 0.4,
      score: 0.48
    });
  });

  test('never relaxes downvote, song cooldown, session repeat, ban or source cooldown', async () => {
    const now = 20_000_000;
    const downvoted = radioCandidate(1, { feedback: 'down' });
    const recent = radioCandidate(2, { lastPlayedAt: now - 1000 });
    const session = radioCandidate(3);
    const banned = radioCandidate(4, { banned: true });
    const cooledSource = radioCandidate(5, {
      sources: [{ id: 500, provider: 'youtube', providerId: 'cooled', cooldownUntil: now + 1000 }]
    });
    const allowed = radioCandidate(6);
    const candidates = [downvoted, recent, session, banned, cooledSource, allowed];
    const playlistItems = candidates.map((candidate, position) => ({
      songId: candidate.songId, playlistId: 'hard', weight: 1, mode: 'ordered', position, itemCount: candidates.length
    }));
    const { autoDJ } = createCatalogAutoDJ({ candidates, playlistItems, now: () => now });
    autoDJ.markTrackStarted({ catalogSongId: 3, youtubeId: 'video-3' });

    const result = await autoDJ.getNextSong();

    expect(result.song.catalogSongId).toBe(6);
    expect(autoDJ.getStatus().blockedCount).toBe(5);
  });

  test('keeps canonical session-repeat blocks when a viewer request pauses radio', () => {
    const { autoDJ } = createCatalogAutoDJ();
    autoDJ.markTrackStarted({ catalogSongId: 7, youtubeId: 'session-video' });

    autoDJ.onSongRequested();

    expect(autoDJ.playedSongIds.has(7)).toBe(true);
    expect(autoDJ.playedInSession.has('session-video')).toBe(true);
  });

  test('relaxes 90 minute artist spacing only when the otherwise-hard-valid pool is empty', async () => {
    const now = 30_000_000;
    const spaced = radioCandidate(1, {
      artists: [{ id: 10, name: 'Recent artist', affinity: 0, lastPlayedAt: now - 1000 }]
    });
    const playlistItems = [{ songId: 1, playlistId: 'artist', weight: 1, mode: 'ordered', position: 0, itemCount: 1 }];
    const { autoDJ } = createCatalogAutoDJ({ candidates: [spaced], playlistItems, now: () => now });

    const result = await autoDJ.getNextSong();

    expect(result.song.catalogSongId).toBe(1);
    expect(autoDJ.getStatus().lastSelection.artistSpacingRelaxed).toBe(true);
  });

  test('returns one alternative provider source and records technical source cooldowns', async () => {
    const candidate = radioCandidate(1, {
      sources: [
        { id: 101, songId: 1, provider: 'youtube', providerId: 'yt-1', trackKey: 'youtube:yt-1', url: 'https://youtu.be/yt-1' },
        { id: 102, songId: 1, provider: 'soundcloud', providerId: 'sc-1', trackKey: 'soundcloud:sc-1', url: 'https://soundcloud.com/a/sc-1' },
        { id: 103, songId: 1, provider: 'youtube', providerId: 'yt-2', trackKey: 'youtube:yt-2', url: 'https://youtu.be/yt-2' }
      ]
    });
    const playlistItems = [{ songId: 1, playlistId: 'sources', weight: 1, mode: 'ordered', position: 0, itemCount: 1 }];
    const { autoDJ, catalog } = createCatalogAutoDJ({ candidates: [candidate], playlistItems });

    const selected = await autoDJ.getNextSong();
    const alternative = autoDJ.getAlternativeSource(selected.song);
    autoDJ.recordSourceFailure(selected.song, new Error('HTTP 503'));

    expect(selected.song).toMatchObject({ sourceId: 101, alternativeSources: [expect.objectContaining({ sourceId: 102 })] });
    expect(alternative).toMatchObject({ sourceId: 102, provider: 'soundcloud' });
    expect(catalog.recordSourceFailure).toHaveBeenCalledWith(101, expect.any(Error), 10_000_000);
  });

  test('removes the legacy ten-title limiter from AutoDJ status and selection', async () => {
    const resolver = {
      resolvePlaylistEntry: jest.fn(async (_url, index) => ({
        success: true,
        song: { title: `Local ${index}`, youtubeId: `local-${index}`, localPath: `C:/music/${index}.wav` }
      }))
    };
    const autoDJ = new AutoDJ({
      enabled: true,
      mode: 'playlist',
      maxConsecutiveAutoDJ: 10,
      playlistUrls: ['https://www.youtube.com/playlist?list=local']
    }, resolver, {}, { log: jest.fn() });
    autoDJ.consecutiveCount = 100;

    await expect(autoDJ.getNextSong()).resolves.toMatchObject({ song: expect.any(Object) });
    expect(autoDJ.getStatus()).not.toHaveProperty('maxConsecutiveAutoDJ');
  });
});

describe('music-bot supervisor diagnostics compatibility', () => {
  function createPlugin() {
    const MusicBotPlugin = require('../plugins/music-bot/main');
    const api = {
      getSocketIO: () => ({ emit: jest.fn() }),
      getDatabase: () => ({}),
      emit: jest.fn(),
      log: jest.fn()
    };
    const plugin = new MusicBotPlugin(api);
    plugin.config.autoDJ.enabled = true;
    plugin.config.safety.locked = false;
    plugin._mpvAvailable = true;
    plugin._emitQueue = jest.fn();
    plugin._emitError = jest.fn();
    plugin._emitPlaybackStopped = jest.fn();
    plugin._schedulePreCache = jest.fn();
    plugin._playFallbackTrack = jest.fn(async () => null);
    return { plugin, api };
  }

  test('routes queue-empty advancement through the central supervisor', async () => {
    const { plugin } = createPlugin();
    plugin.radioSupervisor = { wake: jest.fn(async () => ({ success: true, song: { id: 'radio' } })) };

    await expect(plugin._playNextFromQueue('queue-empty')).resolves.toMatchObject({ success: true });

    expect(plugin.radioSupervisor.wake).toHaveBeenCalledWith('queue-empty', {});
  });

  test('always plays a queued viewer request before selecting radio', async () => {
    const { plugin } = createPlugin();
    const viewer = { id: 'viewer', title: 'Viewer', requestedBy: 'alice', streamUrl: 'viewer.mp3' };
    plugin.queueManager = {
      shiftNext: jest.fn(() => viewer),
      getQueue: jest.fn(() => []),
      returnToFront: jest.fn()
    };
    plugin.playbackEngine = { play: jest.fn(async () => viewer) };
    plugin._maybePlayAutoDJ = jest.fn();

    await expect(plugin._advancePlayback({ isCurrent: () => true })).resolves.toMatchObject({ song: viewer });

    expect(plugin.playbackEngine.play).toHaveBeenCalledWith(viewer);
    expect(plugin._maybePlayAutoDJ).not.toHaveBeenCalled();
  });

  test('performs one IPC reset and tries one alternative source for the same canonical song', async () => {
    const { plugin } = createPlugin();
    const primary = {
      id: 'canonical-1',
      title: 'Primary',
      requestedBy: 'AutoDJ',
      sourceId: 11,
      streamUrl: 'primary.mp3'
    };
    const alternative = { ...primary, sourceId: 12, provider: 'soundcloud', streamUrl: 'alternative.mp3' };
    let resetUsed = false;
    const context = {
      isCurrent: () => true,
      resetPlayerOnce: async (reset) => {
        if (resetUsed) return false;
        resetUsed = true;
        await reset();
        return true;
      }
    };
    plugin.queueManager = {
      getQueue: jest.fn(() => []),
      markPlaying: jest.fn()
    };
    plugin.autoDJ = {
      getNextSong: jest.fn(async () => ({ song: primary, announce: false })),
      getAlternativeSource: jest.fn(() => alternative),
      recordSourceFailure: jest.fn(),
      recordSourceSuccess: jest.fn(),
      markTrackStarted: jest.fn(),
      markPlaybackFailed: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' }))
    };
    plugin._prepareAutoDJTrack = jest.fn(async (track) => track);
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => null),
      isPlaying: jest.fn(() => false),
      resetPlayer: jest.fn(async () => {}),
      play: jest.fn()
        .mockRejectedValueOnce(new Error('mpv IPC is not connected'))
        .mockResolvedValueOnce(alternative)
    };

    const result = await plugin._maybePlayAutoDJ(true, false, context);

    expect(result).toMatchObject({ sourceId: 12 });
    expect(plugin.playbackEngine.resetPlayer).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.play).toHaveBeenCalledTimes(2);
    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: primary.sourceId }),
      expect.any(Error)
    );
    expect(plugin.autoDJ.recordSourceSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: alternative.sourceId })
    );
  });

  test('tries the same canonical song alternative when primary source resolution fails', async () => {
    const { plugin } = createPlugin();
    const primary = {
      id: 'canonical-resolve',
      title: 'Primary resolve',
      requestedBy: 'AutoDJ',
      sourceId: 21,
      url: 'https://primary.invalid/song'
    };
    const alternative = {
      ...primary,
      sourceId: 22,
      provider: 'soundcloud',
      url: 'https://soundcloud.com/example/song'
    };
    plugin.queueManager = {
      getQueue: jest.fn(() => []),
      markPlaying: jest.fn()
    };
    plugin.autoDJ = {
      getNextSong: jest.fn(async () => ({ song: primary, announce: false })),
      getAlternativeSource: jest.fn((track) => track.sourceId === primary.sourceId ? alternative : null),
      recordSourceFailure: jest.fn(),
      recordSourceSuccess: jest.fn(),
      recordFailedTrack: jest.fn(),
      markTrackStarted: jest.fn(),
      markPlaybackFailed: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' }))
    };
    plugin._prepareAutoDJTrack = jest.fn()
      .mockRejectedValueOnce(new Error('primary format unavailable'))
      .mockResolvedValueOnce({ ...alternative, streamUrl: 'alternative.mp3' });
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => null),
      isPlaying: jest.fn(() => false),
      play: jest.fn(async (track) => track)
    };

    const result = await plugin._maybePlayAutoDJ(true, false, { isCurrent: () => true });

    expect(result).toMatchObject({ sourceId: alternative.sourceId });
    expect(plugin._prepareAutoDJTrack).toHaveBeenNthCalledWith(1, expect.objectContaining({ sourceId: primary.sourceId }));
    expect(plugin._prepareAutoDJTrack).toHaveBeenNthCalledWith(2, expect.objectContaining({ sourceId: alternative.sourceId }));
    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: primary.sourceId }),
      expect.any(Error)
    );
    expect(plugin.autoDJ.recordFailedTrack).not.toHaveBeenCalled();
  });

  test('does not reset the player for a provider playback failure', async () => {
    const { plugin } = createPlugin();
    const primary = { id: 'provider-failure', title: 'Primary', sourceId: 31, streamUrl: 'primary.mp3' };
    const alternative = { ...primary, sourceId: 32, streamUrl: 'alternative.mp3' };
    const resetPlayerOnce = jest.fn(async () => true);
    plugin.queueManager = { getQueue: jest.fn(() => []), markPlaying: jest.fn() };
    plugin.autoDJ = {
      getNextSong: jest.fn(async () => ({ song: primary, announce: false })),
      getAlternativeSource: jest.fn(() => alternative),
      recordSourceFailure: jest.fn(),
      recordSourceSuccess: jest.fn(),
      markTrackStarted: jest.fn(),
      markPlaybackFailed: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' }))
    };
    plugin._prepareAutoDJTrack = jest.fn(async (track) => track);
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => null),
      isPlaying: jest.fn(() => false),
      play: jest.fn()
        .mockRejectedValueOnce(new Error('unrecognized file format'))
        .mockResolvedValueOnce(alternative)
    };

    await expect(plugin._maybePlayAutoDJ(true, false, {
      isCurrent: () => true,
      resetPlayerOnce
    })).resolves.toMatchObject({ sourceId: alternative.sourceId });

    expect(resetPlayerOnce).not.toHaveBeenCalled();
  });

  test('never permanently deactivates AutoDJ after rapid playback failures', async () => {
    const { plugin } = createPlugin();
    plugin.queueManager = { markPlaying: jest.fn(), resetVoteSkips: jest.fn() };
    plugin.autoDJ = {
      deactivate: jest.fn(),
      recordFailedTrack: jest.fn(),
      recordSourceFailure: jest.fn(),
      markPlaybackFailed: jest.fn()
    };
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => null),
      clearNowPlaying: jest.fn()
    };
    plugin.radioSupervisor = { wake: jest.fn(async () => ({ success: false })) };
    plugin._stopPlaybackSync = jest.fn();

    for (let index = 0; index < 4; index += 1) {
      await plugin._handleAutoDJPlaybackFailure(
        { id: `failed-${index}`, title: `Failed ${index}`, requestedBy: 'AutoDJ' },
        'mpv-track-end',
        new Error('format unavailable')
      );
    }

    expect(plugin.autoDJ.deactivate).not.toHaveBeenCalled();
    expect(plugin.radioSupervisor.wake).toHaveBeenCalledTimes(4);
  });

  test('reschedules a prepared transition at a fixed three-second lead for pause/resume/seek compatibility', async () => {
    jest.useFakeTimers();
    const { plugin } = createPlugin();
    const track = { id: 'timed', title: 'Timed', duration: 10, requestedBy: 'AutoDJ' };
    plugin.config.playback.crossfadeDuration = 9000;
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => track),
      isPlaying: jest.fn(() => true)
    };
    plugin.radioSupervisor = { wake: jest.fn(async () => ({ success: true })) };

    plugin._rescheduleCrossfadeTransition(track, 2, { paused: true });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(plugin.radioSupervisor.wake).not.toHaveBeenCalled();

    plugin._rescheduleCrossfadeTransition(track, 2, { paused: false });
    await jest.advanceTimersByTimeAsync(4999);
    expect(plugin.radioSupervisor.wake).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(plugin.radioSupervisor.wake).toHaveBeenCalledWith('crossfade', { allowActiveAutoDJ: true });
    jest.useRealTimers();
  });

  test('keeps the playback controller crossfade fixed at three seconds while accepting legacy config', () => {
    const { plugin } = createPlugin();
    plugin.playbackEngine = { updateConfig: jest.fn() };
    plugin.musicResolver = { updateConfig: jest.fn() };
    plugin.autoDJ = { updateConfig: jest.fn() };
    plugin.radioSupervisor = { setLocked: jest.fn(), setEnabled: jest.fn() };
    const config = {
      ...plugin.config,
      playback: { ...plugin.config.playback, crossfadeDuration: 9000 }
    };

    plugin._distributeLiveConfig(config);

    expect(plugin.config.playback.crossfadeDuration).toBe(9000);
    expect(plugin.playbackEngine.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ crossfadeDuration: 3000 })
    );
  });

  test('preserves the outgoing track when an incoming crossfade candidate fails', async () => {
    const { plugin } = createPlugin();
    const outgoing = { id: 'outgoing', title: 'Outgoing', requestedBy: 'AutoDJ' };
    plugin.queueManager = {
      shiftNext: jest.fn(() => null),
      getQueue: jest.fn(() => []),
      markPlaying: jest.fn()
    };
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => outgoing),
      isPlaying: jest.fn(() => true),
      clearNowPlaying: jest.fn()
    };
    plugin._maybePlayAutoDJ = jest.fn(async () => null);
    plugin.autoDJ = { getStatus: jest.fn(() => ({ lastResult: { state: 'error' } })) };

    await plugin._advancePlayback({
      payload: { allowActiveAutoDJ: true },
      isCurrent: () => true
    });

    expect(plugin.playbackEngine.clearNowPlaying).not.toHaveBeenCalled();
    expect(plugin._emitPlaybackStopped).not.toHaveBeenCalled();
  });

  test('publishes additive supervisor fields and a build fingerprint in runtime and health', () => {
    const { plugin } = createPlugin();
    plugin.playbackEngine = {
      getState: () => 'idle',
      getNowPlaying: () => null,
      getSnapshot: () => ({ lifecycle: 'active', transportState: 'idle', slots: { A: null, B: null }, healthy: true })
    };
    plugin.mediaCache = { getStats: () => ({ files: 0, bytes: 0, inflight: 0 }) };
    plugin.radioSupervisor = {
      getSnapshot: () => ({
        desiredPlayback: true,
        advanceId: 7,
        retryAt: 12345,
        backoffSeconds: 15,
        lastWakeReason: 'watchdog',
        failureClass: 'transient'
      })
    };

    const runtime = plugin._buildRuntimeSnapshot();
    const health = plugin._buildHealthPayload(runtime, { active: 0, queued: 0 });

    expect(runtime).toMatchObject({
      desiredPlayback: true,
      advanceId: 7,
      retryAt: 12345,
      backoffSeconds: 15,
      lastWakeReason: 'watchdog',
      failureClass: 'transient',
      buildFingerprint: expect.any(String)
    });
    expect(health).toMatchObject({
      desiredPlayback: true,
      advanceId: 7,
      retryAt: 12345,
      backoffSeconds: 15,
      lastWakeReason: 'watchdog',
      failureClass: 'transient',
      buildFingerprint: runtime.buildFingerprint
    });
  });
});
