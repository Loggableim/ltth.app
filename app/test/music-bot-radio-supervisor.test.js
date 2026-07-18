const AutoDJ = require('../plugins/music-bot/lib/auto-dj');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');

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
      isOccupied: overrides.isOccupied,
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

function createCatalogAutoDJ({
  candidates,
  playlistItems,
  radioSources,
  random = () => 0,
  resolver,
  now = () => 10_000_000,
  isBanned = (track) => Boolean(track.banned)
} = {}) {
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
    getRadioSources: jest.fn(() => radioSources !== undefined
      ? radioSources
      : ((playlistItems || []).length ? [{ playlistId: 'configured', enabled: true, itemCount: playlistItems.length }] : [])),
    advanceRadioCursor: jest.fn()
  };
  const autoDJ = new AutoDJ(
    { enabled: true, mode: 'mix', repeatCooldownHours: 12 },
    resolver || { resolvePlaylistEntry: jest.fn(async () => ({ success: false })) },
    { prepare: jest.fn(() => ({ all: jest.fn(() => []), run: jest.fn() })) },
    { log: jest.fn() },
    { catalog, playlistStore, random, now, isBanned }
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

  test('allows an explicit viewer advance while AutoDJ is disabled without scheduling radio retry', async () => {
    jest.useFakeTimers({ now: 3_500_000 });
    const { supervisor, advance } = createSupervisor({
      advance: jest.fn(async () => ({ success: false, failureClass: 'viewer-playback' }))
    });
    supervisor.setEnabled(false, { wake: false });

    await expect(supervisor.wake('viewer-request')).resolves.toMatchObject({
      success: false,
      failureClass: 'viewer-playback'
    });
    expect(advance).toHaveBeenCalledTimes(1);
    expect(supervisor.getSnapshot()).toMatchObject({
      desiredPlayback: false,
      retryAt: null,
      backoffSeconds: 0
    });
    await jest.advanceTimersByTimeAsync(120_000);
    expect(advance).toHaveBeenCalledTimes(1);
    supervisor.destroy();
  });

  test('keeps Safety unlock disarmed until an explicit start wake', async () => {
    jest.useFakeTimers({ now: 3_600_000 });
    const { supervisor, advance } = createSupervisor();
    supervisor.setEnabled(true, { wake: false });
    await supervisor.wake('enabled');
    supervisor.setLocked(true, { wake: false });
    supervisor.setLocked(false, { wake: false });
    advance.mockClear();

    await jest.advanceTimersByTimeAsync(10_000);
    expect(advance).not.toHaveBeenCalled();
    expect(supervisor.getSnapshot()).toMatchObject({ desiredPlayback: false, armed: false });

    await supervisor.wake('enabled');
    expect(advance).toHaveBeenCalledTimes(1);
    expect(supervisor.getSnapshot()).toMatchObject({ desiredPlayback: true, armed: true });
    supervisor.destroy();
  });

  test('treats paused playback as occupied so the watchdog cannot replace it', async () => {
    jest.useFakeTimers({ now: 3_700_000 });
    let occupied = false;
    const { supervisor, advance } = createSupervisor({
      isOccupied: () => occupied
    });
    supervisor.setEnabled(true, { wake: false });
    await supervisor.wake('enabled');
    advance.mockClear();
    occupied = true;

    await jest.advanceTimersByTimeAsync(10_000);

    expect(advance).not.toHaveBeenCalled();
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
  test('preserves legacy mix selection when no new radio source is configured', async () => {
    const { autoDJ } = createCatalogAutoDJ({ radioSources: [] });
    const legacy = { title: 'Legacy mix', youtubeId: 'legacy-mix', url: 'legacy.mp3' };
    autoDJ._pickFromMix = jest.fn(async () => legacy);

    await expect(autoDJ.getNextSong()).resolves.toMatchObject({ song: legacy });

    expect(autoDJ._pickFromMix).toHaveBeenCalledTimes(1);
  });

  test('does not escape to legacy mix when configured radio sources are empty or blocked', async () => {
    const { autoDJ } = createCatalogAutoDJ({
      radioSources: [{ playlistId: 'configured', enabled: true, itemCount: 0 }],
      candidates: [],
      playlistItems: []
    });
    autoDJ._pickFromMix = jest.fn(async () => ({ title: 'Wrong fallback' }));

    await expect(autoDJ.getNextSong()).resolves.toBeNull();

    expect(autoDJ._pickFromMix).not.toHaveBeenCalled();
  });

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

  test('preserves source channel metadata and filters banned alternatives individually', async () => {
    const candidate = radioCandidate(1, {
      sources: [
        { id: 111, provider: 'youtube', providerId: 'blocked', url: 'https://youtu.be/blocked', channelId: 'bad-channel', channelName: 'Blocked' },
        { id: 112, provider: 'youtube', providerId: 'allowed', url: 'https://youtu.be/allowed', channelId: 'good-channel', channelName: 'Allowed' },
        { id: 113, provider: 'soundcloud', providerId: 'backup', url: 'https://soundcloud.com/good/backup', channelId: 'backup-channel', channelName: 'Backup' }
      ]
    });
    const playlistItems = [{ songId: 1, playlistId: 'sources', weight: 1, mode: 'ordered', position: 0, itemCount: 1 }];
    const { autoDJ } = createCatalogAutoDJ({
      candidates: [candidate],
      playlistItems,
      radioSources: [{ playlistId: 'sources', enabled: true, itemCount: 1 }],
      isBanned: (track) => track.channelId === 'bad-channel'
    });

    const selected = await autoDJ.getNextSong();

    expect(selected.song).toMatchObject({
      sourceId: 112,
      channelId: 'good-channel',
      channelName: 'Allowed',
      alternativeSources: [expect.objectContaining({
        sourceId: 113,
        channelId: 'backup-channel',
        channelName: 'Backup'
      })]
    });
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

  test('plays a viewer queue entry with the production default AutoDJ disabled', async () => {
    const { plugin } = createPlugin();
    const viewer = { id: 'default-viewer', title: 'Default viewer', requestedBy: 'alice', streamUrl: 'viewer.mp3' };
    plugin.queueManager = {
      shiftNext: jest.fn(() => viewer),
      getQueue: jest.fn(() => []),
      returnToFront: jest.fn()
    };
    plugin.playbackEngine = {
      play: jest.fn(async () => viewer),
      getState: jest.fn(() => 'idle'),
      getNowPlaying: jest.fn(() => null),
      isPlaying: jest.fn(() => false)
    };
    plugin.config.autoDJ.enabled = false;
    plugin.radioSupervisor = new RadioSupervisor({
      advance: (context) => plugin._advancePlayback(context),
      isOccupied: () => false
    });
    plugin.radioSupervisor.setEnabled(false, { wake: false });

    await expect(plugin._playNextFromQueue('viewer-request')).resolves.toMatchObject({ song: viewer });

    expect(plugin.playbackEngine.play).toHaveBeenCalledWith(viewer);
    plugin.radioSupervisor.destroy();
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

  test('routes a real controller second-heartbeat failure through the plugin supervisor', async () => {
    const { plugin } = createPlugin();
    const engines = [];
    const controller = new PlaybackController(
      { defaultVolume: 50, crossfadeDuration: 0 },
      { log: jest.fn() },
      {
        engineFactory: (context) => {
          const engine = new PlaybackEngine(context.config, context.api, {
            heartbeatState: context.heartbeatState
          });
          engine.process = { exitCode: null, pid: 1234 };
          engine.socket = { destroyed: false };
          engine._sendCommand = jest.fn(async () => { throw new Error('dead IPC'); });
          engine.setVolume = jest.fn(async () => {});
          engine.play = jest.fn(async (track) => {
            engine.nowPlaying = track;
            engine.state = 'playing';
            engine.emit('track-start', track);
            return track;
          });
          engine.restart = jest.fn(async () => engine.nowPlaying);
          engine.shutdown = jest.fn(async () => {
            engine.nowPlaying = null;
            engine.state = 'idle';
          });
          engines.push(engine);
          return engine;
        }
      }
    );
    plugin.playbackEngine = controller;
    plugin.queueManager = {
      markPlaying: jest.fn(),
      resetVoteSkips: jest.fn(),
      getQueue: jest.fn(() => []),
      addToHistory: jest.fn(),
      removeSkipImmunity: jest.fn()
    };
    plugin.autoDJ = {
      setPlaybackSeed: jest.fn(),
      recordFailedTrack: jest.fn(),
      recordSourceFailure: jest.fn(),
      markPlaybackFailed: jest.fn()
    };
    plugin.radioSupervisor = { wake: jest.fn(async () => ({ success: false })) };
    plugin._startPlaybackSync = jest.fn();
    plugin._stopPlaybackSync = jest.fn();
    plugin._scheduleCrossfadeTransition = jest.fn();
    plugin._emitNowPlaying = jest.fn();
    plugin._emitRuntimeHealth = jest.fn();
    plugin._registerPlaybackEvents();
    const track = { id: 'heartbeat-track', title: 'Heartbeat', streamUrl: 'track.mp3', requestedBy: 'AutoDJ' };
    await controller.play(track);

    await expect(controller.heartbeat()).resolves.toMatchObject({ action: 'counted', failures: 1 });
    await expect(controller.heartbeat()).resolves.toMatchObject({ action: 'confirmed', failures: 2 });
    await Promise.resolve();

    expect(engines[0].restart).not.toHaveBeenCalled();
    expect(engines[0].play).toHaveBeenCalledTimes(1);
    expect(plugin.radioSupervisor.wake).toHaveBeenCalledWith(
      'ipc-confirmed',
      expect.objectContaining({ track: expect.objectContaining({ id: track.id }), failureClass: 'ipc' })
    );
    await controller.shutdown();
  });

  test('drops a failed viewer track after one IPC reset and advances the next viewer', async () => {
    const { plugin } = createPlugin();
    const failed = { id: 'failed-viewer', title: 'Failed viewer', requestedBy: 'alice', streamUrl: 'failed.mp3' };
    const next = { id: 'next-viewer', title: 'Next viewer', requestedBy: 'bob', streamUrl: 'next.mp3' };
    plugin.queueManager = {
      shiftNext: jest.fn()
        .mockReturnValueOnce(failed)
        .mockReturnValueOnce(next),
      getQueue: jest.fn(() => []),
      returnToFront: jest.fn(),
      markPlaying: jest.fn(),
      addToHistory: jest.fn()
    };
    plugin.playbackEngine = {
      play: jest.fn()
        .mockRejectedValueOnce(new Error('mpv IPC disconnected'))
        .mockResolvedValueOnce(next),
      resetPlayer: jest.fn(async () => {})
    };
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

    await expect(plugin._advancePlayback(context)).resolves.toMatchObject({ song: next });

    expect(plugin.playbackEngine.resetPlayer).toHaveBeenCalledTimes(1);
    expect(plugin.queueManager.returnToFront).not.toHaveBeenCalled();
    expect(plugin.queueManager.addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ id: failed.id, playbackFailed: true }),
      true
    );
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

  test('uses the retained canonical alternative after a supervised heartbeat reset', async () => {
    const { plugin } = createPlugin();
    const failed = { id: 'heartbeat-canonical', title: 'Failed primary', requestedBy: 'AutoDJ', sourceId: 61, streamUrl: 'primary.mp3' };
    const alternative = { ...failed, sourceId: 62, provider: 'soundcloud', streamUrl: 'alternative.mp3' };
    plugin.queueManager = {
      shiftNext: jest.fn(() => null),
      getQueue: jest.fn(() => []),
      markPlaying: jest.fn()
    };
    plugin.playbackEngine = {
      resetPlayer: jest.fn(async () => {}),
      play: jest.fn(async (track) => track),
      clearNowPlaying: jest.fn(),
      getNowPlaying: jest.fn(() => null),
      isPlaying: jest.fn(() => false)
    };
    plugin.autoDJ = {
      getAlternativeSource: jest.fn(() => alternative),
      recordSourceSuccess: jest.fn(),
      markTrackStarted: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' })),
      onQueueEmpty: jest.fn()
    };
    plugin._prepareAutoDJTrack = jest.fn(async (track) => track);
    let resetUsed = false;
    const context = {
      reason: 'ipc-confirmed',
      payload: { track: failed, failureClass: 'ipc' },
      isCurrent: () => true,
      resetPlayerOnce: async (reset) => {
        if (resetUsed) return false;
        resetUsed = true;
        await reset();
        return true;
      }
    };

    await expect(plugin._advancePlayback(context)).resolves.toMatchObject({ song: alternative });

    expect(plugin.playbackEngine.resetPlayer).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.play).toHaveBeenCalledWith(alternative);
    expect(plugin.autoDJ.onQueueEmpty).not.toHaveBeenCalled();
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

  test('uses catalog failure classification without creating legacy title exclusions', async () => {
    const { plugin } = createPlugin();
    const selected = { id: 'technical', title: 'Technical', sourceId: 41, url: 'https://example.invalid/technical' };
    plugin.queueManager = { getQueue: jest.fn(() => []), markPlaying: jest.fn() };
    plugin.autoDJ = {
      getNextSong: jest.fn()
        .mockResolvedValueOnce({ song: selected, announce: false })
        .mockResolvedValueOnce(null),
      recordSourceFailure: jest.fn(() => ({ failureClass: 'long' })),
      recordFailedTrack: jest.fn(),
      getAlternativeSource: jest.fn(() => null),
      markPlaybackFailed: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' }))
    };
    plugin._prepareAutoDJTrack = jest.fn(async () => { throw new Error('format unavailable'); });
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => null), isPlaying: jest.fn(() => false) };

    await expect(plugin._maybePlayAutoDJ(true, false, { isCurrent: () => true })).resolves.toBeNull();

    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: selected.sourceId }),
      expect.any(Error)
    );
    expect(plugin.autoDJ.recordFailedTrack).not.toHaveBeenCalled();
    expect(plugin._lastAutoDJFailureClass).toBe('long');
  });

  test('rechecks bans after preparing an alternative provider source', async () => {
    const { plugin } = createPlugin();
    const primary = { id: 'canonical-ban', title: 'Primary', sourceId: 51, streamUrl: 'primary.mp3' };
    const alternative = { ...primary, sourceId: 52, channelId: 'blocked-after-resolve', streamUrl: 'alternative.mp3' };
    plugin.queueManager = { getQueue: jest.fn(() => []), markPlaying: jest.fn() };
    plugin.autoDJ = {
      getNextSong: jest.fn(async () => ({ song: primary, announce: false })),
      getAlternativeSource: jest.fn(() => alternative),
      recordSourceFailure: jest.fn(() => ({ failureClass: 'transient' })),
      recordSourceSuccess: jest.fn(),
      markTrackStarted: jest.fn(),
      markPlaybackFailed: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' }))
    };
    plugin._prepareAutoDJTrack = jest.fn(async (track) => track);
    plugin._checkBans = jest.fn((track) => track.channelId === 'blocked-after-resolve' ? 'blocked channel' : null);
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => null),
      isPlaying: jest.fn(() => false),
      play: jest.fn().mockRejectedValueOnce(new Error('network playback failure'))
    };

    await expect(plugin._maybePlayAutoDJ(true, false, { isCurrent: () => true })).resolves.toBeNull();

    expect(plugin._checkBans).toHaveBeenCalledWith(alternative, 'AutoDJ');
    expect(plugin.playbackEngine.play).toHaveBeenCalledTimes(1);
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
    expect(plugin.radioSupervisor.wake).toHaveBeenCalledWith('crossfade', {
      allowActiveAutoDJ: true,
      allowActiveViewerAtBoundary: true,
      prefetchGeneration: expect.any(Number)
    });
    jest.useRealTimers();
  });

  test('resolves one radio track ahead of the fixed viewer-to-radio crossfade boundary', async () => {
    jest.useFakeTimers();
    try {
      const { plugin } = createPlugin();
      const outgoing = { id: 'viewer-outgoing', title: 'Viewer outgoing', duration: 10, requestedBy: 'alice' };
      const selected = { id: 'radio-selected', title: 'Radio selected', url: 'https://example.invalid/radio' };
      const prepared = { ...selected, requestedBy: 'AutoDJ', streamUrl: 'radio.mp3' };
      let current = outgoing;
      let finishResolve;
      plugin.queueManager = {
        shiftNext: jest.fn(() => null),
        getQueue: jest.fn(() => []),
        markPlaying: jest.fn()
      };
      plugin.autoDJ = {
        onQueueEmpty: jest.fn(async () => ({ song: selected, announce: false })),
        getAlternativeSource: jest.fn(() => null),
        recordSourceSuccess: jest.fn(),
        markTrackStarted: jest.fn(),
        getStatus: jest.fn(() => ({ mode: 'mix' }))
      };
      plugin._prepareAutoDJTrack = jest.fn(() => new Promise((resolve) => {
        finishResolve = resolve;
      }));
      plugin.playbackEngine = {
        getNowPlaying: jest.fn(() => current),
        isPlaying: jest.fn(() => Boolean(current)),
        play: jest.fn(async (track) => {
          current = track;
          return track;
        })
      };
      plugin.radioSupervisor = {
        wake: jest.fn((reason, payload) => plugin._advancePlayback({
          reason,
          payload,
          isCurrent: () => true
        }))
      };

      plugin._scheduleCrossfadeTransition(outgoing);
      await Promise.resolve();
      await Promise.resolve();

      expect(plugin.autoDJ.onQueueEmpty).toHaveBeenCalledTimes(1);
      expect(plugin._prepareAutoDJTrack).toHaveBeenCalledTimes(1);
      expect(plugin.playbackEngine.play).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(6000);
      finishResolve(prepared);
      await Promise.resolve();
      await Promise.resolve();
      expect(plugin.playbackEngine.play).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1000);
      expect(plugin.playbackEngine.play).toHaveBeenCalledTimes(1);
      expect(plugin.playbackEngine.play).toHaveBeenCalledWith(prepared);
      expect(plugin.autoDJ.onQueueEmpty).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('invalidates a prepared radio successor when a viewer enters the queue', async () => {
    const { plugin } = createPlugin();
    plugin._radioPrefetch = { generation: 7, prepared: { id: 'radio' } };
    plugin._radioPrefetchGeneration = 7;
    plugin.musicResolver = {
      resolve: jest.fn(async () => ({ success: true, song: { id: 'viewer', title: 'Viewer song' } }))
    };
    plugin.queueManager = {
      addSong: jest.fn(() => ({ success: true, song: { id: 'viewer' }, position: 1 }))
    };
    plugin.playbackEngine = { isPlaying: jest.fn(() => true) };
    plugin.autoDJ = { onSongRequested: jest.fn() };
    plugin._emitSongAdded = jest.fn();
    plugin._emitToast = jest.fn();

    await plugin._handleDashboardRequest('viewer song', 'alice');

    expect(plugin._radioPrefetch).toBeNull();
    expect(plugin._radioPrefetchGeneration).toBe(8);
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
