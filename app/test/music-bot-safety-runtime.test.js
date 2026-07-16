const MusicBotPlugin = require('../plugins/music-bot/main');

function createApi() {
  const handlers = {};
  const emitted = [];
  return {
    handlers,
    emitted,
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(async () => true),
    registerRoute: jest.fn((method, route, handler) => {
      handlers[`${method.toUpperCase()}:${route}`] = handler;
    }),
    emit: jest.fn((event, payload) => emitted.push({ event, payload })),
    log: jest.fn()
  };
}

function createResponse() {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  response.sendFile = jest.fn(() => response);
  return response;
}

function hydratePlugin({ locked = false } = {}) {
  const api = createApi();
  const plugin = new MusicBotPlugin(api);
  const queue = [{
    id: 'queued-1',
    title: 'Queued',
    artist: 'Queue Artist',
    channelId: 'queue-channel',
    channelName: 'Queue Channel',
    trackKey: 'youtube:queued00001',
    youtubeId: 'queued00001',
    url: 'https://example.test/queued'
  }];
  let nowPlaying = {
    id: 'current-1',
    title: 'Current',
    artist: 'Current Artist',
    channelId: 'current-channel',
    channelName: 'Current Channel',
    trackKey: 'youtube:current0001',
    youtubeId: 'current0001'
  };
  let safetyLocked = locked;

  plugin.config = {
    ...plugin.config,
    safety: {
      locked,
      lockedAt: locked ? 1234 : null,
      reason: locked ? 'test' : null
    },
    audio: { masterVolume: 100, sourceVolume: 50 },
    playback: { ...plugin.config.playback, autoPlay: true },
    autoDJ: { ...plugin.config.autoDJ, enabled: true },
    onboarding: { completed: true, completedAt: 1 }
  };
  plugin.queueManager = {
    getQueue: jest.fn(() => queue),
    getHistory: jest.fn(() => []),
    shiftNext: jest.fn(() => queue.shift() || null),
    removeSong: jest.fn((index) => {
      const [song] = queue.splice(index, 1);
      return { success: Boolean(song), song };
    }),
    persistQueue: jest.fn(),
    clear: jest.fn(),
    markPlaying: jest.fn(),
    returnToFront: jest.fn(),
    resetVoteSkips: jest.fn(),
    getVoteVoters: jest.fn(() => [])
  };
  plugin.playbackEngine = {
    emergencyStop: jest.fn(async () => {
      safetyLocked = true;
      nowPlaying = null;
    }),
    releaseSafetyLock: jest.fn(() => {
      safetyLocked = false;
      return true;
    }),
    isSafetyLocked: jest.fn(() => safetyLocked),
    getSnapshot: jest.fn(() => ({
      lifecycle: 'active',
      safetyLock: safetyLocked,
      transportState: nowPlaying ? 'playing' : 'idle',
      transitionGeneration: 7,
      activePlaybackId: nowPlaying?.id || null,
      activeSlot: nowPlaying ? 'A' : null,
      slots: {
        A: nowPlaying ? { pid: 4321, state: 'playing', title: nowPlaying.title } : null,
        B: null
      },
      healthy: true,
      lastTransition: null,
      lastError: null
    })),
    getNowPlaying: jest.fn(() => nowPlaying),
    getState: jest.fn(() => (nowPlaying ? 'playing' : 'idle')),
    isPlaying: jest.fn(() => Boolean(nowPlaying)),
    play: jest.fn(async (track) => {
      nowPlaying = track;
      return track;
    }),
    pause: jest.fn(async () => true),
    resume: jest.fn(async () => true),
    stop: jest.fn(async () => {
      nowPlaying = null;
      return true;
    }),
    clearNowPlaying: jest.fn(() => {
      nowPlaying = null;
    }),
    setVolume: jest.fn(async () => true),
    testTone: jest.fn(async () => ({ success: true, durationMs: 500 })),
    resetPlayer: jest.fn(async () => true),
    reconcileProcesses: jest.fn(async () => ({
      detected: [],
      killed: [],
      remaining: [],
      locked: safetyLocked
    })),
    probe: jest.fn(async () => true),
    getLastProcessCleanup: jest.fn(() => ({ found: [], killed: [], remaining: [] })),
    shutdown: jest.fn(async () => true)
  };
  plugin.musicResolver = {
    cancelAll: jest.fn(async () => true),
    getSnapshot: jest.fn(() => ({ active: 0, queued: 0, jobs: [] }))
  };
  plugin.autoDJ = {
    getStatus: jest.fn(() => ({ enabled: true, active: true })),
    onSongRequested: jest.fn(),
    recordFailedTrack: jest.fn(),
    reset: jest.fn(),
    updateConfig: jest.fn()
  };
  plugin.banList = {
    getAllBans: jest.fn(() => []),
    addBan: jest.fn((type, value) => ({ id: 1, type, value })),
    isTrackBanned: jest.fn(() => ({ banned: false })),
    isArtistBanned: jest.fn(() => ({ banned: false })),
    isUrlBanned: jest.fn(() => ({ banned: false })),
    isKeywordBanned: jest.fn(() => ({ banned: false })),
    isChannelBanned: jest.fn(() => ({ banned: false })),
    isUserBanned: jest.fn(() => ({ banned: false }))
  };
  plugin._stopPrecacheTasks = jest.fn(async () => true);
  plugin._stopPlaybackSync = jest.fn();
  plugin._clearCrossfadeTimer = jest.fn();
  plugin._registerRoutes();

  return {
    api,
    plugin,
    queue,
    setNowPlaying: (value) => {
      nowPlaying = value;
    }
  };
}

describe('Music Bot Safety Lock runtime integration', () => {
  test('init reconciliation persists an orphan-triggered lock before continuing', async () => {
    const { api, plugin } = hydratePlugin();
    plugin.playbackEngine.reconcileProcesses.mockResolvedValue({
      detected: [9981],
      killed: [9981],
      remaining: [],
      locked: true
    });

    const result = await plugin._reconcilePlaybackProcessesAtInit();

    expect(result).toMatchObject({ locked: true, detected: [9981] });
    expect(plugin.config.safety).toMatchObject({
      locked: true,
      reason: 'orphan-player-detected'
    });
    expect(api.setConfig).toHaveBeenCalledWith('config', plugin.config);
  });

  test('status probe waits for an orphan-triggered controller lock to persist', async () => {
    const { api, plugin } = hydratePlugin();
    let releasePersistence;
    api.setConfig.mockImplementation(() => new Promise((resolve) => {
      releasePersistence = resolve;
    }));
    plugin.playbackEngine.probe.mockImplementation(async () => {
      plugin._controllerSafetySyncPromise = plugin._handleControllerSafetyChange({
        locked: true,
        reason: 'orphan-player-detected',
        lockedAt: 9982
      });
    });
    const handler = api.handlers['GET:/api/plugins/music-bot/status'];
    const response = createResponse();

    const request = handler({}, response);
    await Promise.resolve();
    await Promise.resolve();
    expect(response.json).not.toHaveBeenCalled();

    releasePersistence(true);
    await request;
    expect(plugin.playbackEngine.probe).toHaveBeenCalledTimes(1);
    expect(plugin.config.safety).toEqual({
      locked: true,
      lockedAt: 9982,
      reason: 'orphan-player-detected'
    });
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      runtime: expect.objectContaining({ safetyLock: true }),
      health: expect.objectContaining({ locked: true })
    }));
  });

  test('emergency stop persists the lock before stopping audio and preserves the queue', async () => {
    const { api, plugin, queue } = hydratePlugin();
    const order = [];
    api.setConfig.mockImplementation(async () => {
      order.push('persist-lock');
      return true;
    });
    plugin.playbackEngine.emergencyStop.mockImplementation(async () => {
      order.push('stop-audio');
    });
    const handler = api.handlers['POST:/api/plugins/music-bot/emergency-stop'];
    const response = createResponse();

    await handler({ body: {} }, response);

    expect(order).toEqual(['persist-lock', 'stop-audio']);
    expect(plugin.config.safety).toMatchObject({
      locked: true,
      reason: 'emergency-stop'
    });
    expect(plugin.config.safety.lockedAt).toEqual(expect.any(Number));
    expect(queue).toHaveLength(1);
    expect(plugin.queueManager.clear).not.toHaveBeenCalled();
    expect(plugin.queueManager.markPlaying).toHaveBeenCalledWith(null);
    expect(plugin.musicResolver.cancelAll).toHaveBeenCalledTimes(1);
    expect(plugin._stopPrecacheTasks).toHaveBeenCalledTimes(1);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      locked: true
    }));
    expect(api.emitted).toContainEqual({ event: 'musicbot:now-playing', payload: null });
  });

  test('emergency stop still kills audio when Safety Lock persistence fails', async () => {
    const { api, plugin, queue } = hydratePlugin();
    api.setConfig.mockRejectedValueOnce(new Error('database unavailable'));
    const handler = api.handlers['POST:/api/plugins/music-bot/emergency-stop'];
    const response = createResponse();

    await handler({ body: {} }, response);

    expect(plugin.playbackEngine.emergencyStop).toHaveBeenCalledTimes(1);
    expect(plugin.musicResolver.cancelAll).toHaveBeenCalledTimes(1);
    expect(queue).toHaveLength(1);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      locked: true
    }));
  });

  test('controller-triggered Safety Lock cancels background work even if persistence fails', async () => {
    const { api, plugin } = hydratePlugin();
    api.setConfig.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(plugin._handleControllerSafetyChange({
      locked: true,
      reason: 'heartbeat-lock',
      lockedAt: 5678
    })).rejects.toThrow('database unavailable');

    expect(plugin.config.safety).toEqual({
      locked: true,
      lockedAt: 5678,
      reason: 'heartbeat-lock'
    });
    expect(plugin.musicResolver.cancelAll).toHaveBeenCalledTimes(1);
    expect(plugin._stopPrecacheTasks).toHaveBeenCalledTimes(1);
    expect(plugin._stopPlaybackSync).toHaveBeenCalled();
  });

  test('locked playback advance neither dequeues nor starts a track', async () => {
    const { plugin } = hydratePlugin({ locked: true });

    const result = await plugin._playNextFromQueue();

    expect(result).toMatchObject({ success: false, locked: true });
    expect(plugin.queueManager.shiftNext).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.play).not.toHaveBeenCalled();
  });

  test('chat resume is rejected cleanly while the Safety Lock is active', async () => {
    const { api, plugin } = hydratePlugin({ locked: true });

    await plugin._handleCommand({ type: 'resume' }, { username: 'viewer' });

    expect(plugin.playbackEngine.resume).not.toHaveBeenCalled();
    expect(api.emitted).toContainEqual(expect.objectContaining({
      event: 'musicbot:chat-response',
      payload: expect.objectContaining({ username: 'viewer' })
    }));
  });

  test('unlock persists state without starting queued music or AutoDJ', async () => {
    const { api, plugin } = hydratePlugin({ locked: true });
    plugin._playNextFromQueue = jest.fn(async () => ({ success: true }));
    plugin._maybePlayAutoDJ = jest.fn(async () => ({ id: 'autodj' }));
    const handler = api.handlers['POST:/api/plugins/music-bot/safety-lock'];
    const response = createResponse();

    await handler({ body: { locked: false } }, response);

    expect(plugin.playbackEngine.releaseSafetyLock).toHaveBeenCalledTimes(1);
    expect(plugin.config.safety).toMatchObject({ locked: false, lockedAt: null, reason: null });
    expect(api.setConfig).toHaveBeenCalledWith('config', plugin.config);
    expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
    expect(plugin._maybePlayAutoDJ).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      locked: false
    }));
  });

  test('unlock is refused while a marked Soundbot MPV remains after cleanup', async () => {
    const { api, plugin } = hydratePlugin({ locked: true });
    plugin.playbackEngine.getLastProcessCleanup.mockReturnValue({
      found: [9911],
      killed: [],
      remaining: [9911]
    });
    const handler = api.handlers['POST:/api/plugins/music-bot/safety-lock'];
    const response = createResponse();

    await handler({ body: { locked: false } }, response);

    expect(plugin.playbackEngine.probe).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.releaseSafetyLock).not.toHaveBeenCalled();
    expect(api.setConfig).not.toHaveBeenCalled();
    expect(plugin.config.safety).toMatchObject({ locked: true });
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      locked: true
    }));
  });

  test('locked bot keeps accepting viewer requests without starting playback', async () => {
    const { plugin, queue } = hydratePlugin({ locked: true });
    const requestedSong = {
      id: 'locked-request',
      title: 'Accepted while locked',
      trackKey: 'youtube:locked00001',
      url: 'https://www.youtube.com/watch?v=locked00001'
    };
    plugin.musicResolver.resolve = jest.fn(async () => ({ success: true, song: requestedSong }));
    plugin.queueManager.addSong = jest.fn((song) => {
      queue.push(song);
      return { success: true, song, position: queue.length };
    });

    const result = await plugin._handleDashboardRequest('accepted request', 'viewer');

    expect(result).toMatchObject({ success: true, song: requestedSong });
    expect(plugin.queueManager.addSong).toHaveBeenCalledTimes(1);
    expect(queue.at(-1)).toMatchObject({ id: 'locked-request' });
    expect(plugin.playbackEngine.play).not.toHaveBeenCalled();
    expect(plugin.queueManager.shiftNext).not.toHaveBeenCalled();
  });

  test('status remains backward compatible and adds runtime, players, resolver and health', () => {
    const { plugin } = hydratePlugin({ locked: true });

    const status = plugin._buildStatusPayload();

    expect(status).toMatchObject({
      success: true,
      queueLength: 1,
      playbackState: 'playing',
      runtime: expect.objectContaining({ safetyLock: true }),
      players: expect.objectContaining({ A: expect.any(Object), B: null }),
      resolver: expect.objectContaining({ active: 0, queued: 0 }),
      health: expect.objectContaining({ locked: true })
    });
    expect(status.health).toMatchObject({
      healthy: false,
      stateConsistent: false,
      activePlayers: 1
    });
  });

  test('a clean locked controller is healthy while a locked controller with a player is not', () => {
    const { plugin } = hydratePlugin({ locked: true });
    plugin.playbackEngine.getSnapshot.mockReturnValue({
      lifecycle: 'active',
      safetyLock: true,
      transportState: 'idle',
      slots: { A: null, B: null },
      healthy: false,
      lastError: null
    });

    expect(plugin._buildHealthPayload()).toMatchObject({
      state: 'locked',
      locked: true,
      healthy: true,
      controllerHealthy: true,
      stateConsistent: true,
      activePlayers: 0
    });
  });

  test('an owned MPV waiting idle without media is not counted as active playback', () => {
    const { plugin } = hydratePlugin();
    plugin.playbackEngine.getSnapshot.mockReturnValue({
      lifecycle: 'active',
      safetyLock: false,
      transportState: 'idle',
      slots: {
        A: {
          pid: 9871,
          state: 'idle',
          playbackId: null,
          media: { title: null, basename: null }
        },
        B: null
      },
      healthy: true,
      lastError: null
    });

    expect(plugin._buildHealthPayload()).toMatchObject({
      state: 'idle',
      activePlayers: 0,
      playerProcesses: 1,
      stateConsistent: true,
      healthy: true
    });
  });

  test('Safety Lock treats even an idle owned MPV process as inconsistent', () => {
    const { plugin } = hydratePlugin({ locked: true });
    plugin.playbackEngine.getSnapshot.mockReturnValue({
      lifecycle: 'active',
      safetyLock: true,
      transportState: 'idle',
      slots: {
        A: {
          pid: 9872,
          state: 'idle',
          playbackId: null,
          media: { title: null, basename: null }
        },
        B: null
      },
      healthy: false,
      lastError: null
    });

    expect(plugin._buildHealthPayload()).toMatchObject({
      state: 'locked',
      activePlayers: 0,
      playerProcesses: 1,
      stateConsistent: false,
      healthy: false
    });
  });

  test('diagnostics route returns bounded transitions without exposing media URLs', async () => {
    const { api } = hydratePlugin({ locked: true });
    const handler = api.handlers['GET:/api/plugins/music-bot/diagnostics'];
    const response = createResponse();

    await handler({}, response);

    const payload = response.json.mock.calls[0][0];
    expect(payload).toMatchObject({
      success: true,
      runtime: expect.any(Object),
      players: expect.any(Object),
      resolver: expect.any(Object),
      health: expect.any(Object),
      transitions: expect.any(Array)
    });
    expect(payload.transitions.length).toBeLessThanOrEqual(100);
    expect(JSON.stringify(payload)).not.toContain('https://example.test/queued');
  });

  test('test tone is explicit, idle-only and never consumes the queue', async () => {
    const { api, plugin, queue, setNowPlaying } = hydratePlugin();
    const handler = api.handlers['POST:/api/plugins/music-bot/player/test-tone'];
    const busyResponse = createResponse();

    await handler({ body: {} }, busyResponse);
    expect(busyResponse.status).toHaveBeenCalledWith(409);
    expect(plugin.playbackEngine.testTone).not.toHaveBeenCalled();

    setNowPlaying(null);
    const response = createResponse();
    await handler({ body: {} }, response);

    expect(plugin.playbackEngine.testTone).toHaveBeenCalledTimes(1);
    expect(queue).toHaveLength(1);
    expect(plugin.queueManager.shiftNext).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.play).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('player reset atomically preserves the current Safety Lock state and queue', async () => {
    const unlocked = hydratePlugin();
    const unlockedResponse = createResponse();
    await unlocked.api.handlers['POST:/api/plugins/music-bot/player/reset']({ body: {} }, unlockedResponse);

    expect(unlocked.plugin.playbackEngine.resetPlayer).toHaveBeenCalledWith({ remainLocked: false });
    expect(unlocked.queue).toHaveLength(1);
    expect(unlockedResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      locked: false,
      queueLength: 1
    }));

    const locked = hydratePlugin({ locked: true });
    const lockedResponse = createResponse();
    await locked.api.handlers['POST:/api/plugins/music-bot/player/reset']({ body: {} }, lockedResponse);

    expect(locked.plugin.playbackEngine.resetPlayer).toHaveBeenCalledWith({ remainLocked: true });
    expect(locked.queue).toHaveLength(1);
    expect(lockedResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      locked: true,
      queueLength: 1
    }));
  });

  test('ban-from-track resolves server-owned metadata and stops the current track by default', async () => {
    const { api, plugin, queue } = hydratePlugin();
    plugin._playNextFromQueue = jest.fn(async () => ({ success: true, song: queue[0] }));
    const handler = api.handlers['POST:/api/plugins/music-bot/bans/from-track'];
    const response = createResponse();

    await handler({ body: {
      trackId: 'current-1',
      scope: 'track',
      value: 'attacker-controlled-value'
    } }, response);

    expect(plugin.banList.addBan).toHaveBeenCalledWith(
      'track',
      'youtube:current0001',
      expect.anything(),
      'dashboard'
    );
    expect(plugin.playbackEngine.stop).toHaveBeenCalledTimes(1);
    expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(1);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      stoppedCurrent: true
    }));
  });

  test('artist ban removes matching queued tracks using authoritative track data', async () => {
    const { api, plugin, queue } = hydratePlugin();
    const handler = api.handlers['POST:/api/plugins/music-bot/bans/from-track'];
    const response = createResponse();

    await handler({ body: {
      trackId: 'queued-1',
      scope: 'artist',
      artist: 'attacker-controlled-artist',
      removeQueued: true,
      stopCurrent: false
    } }, response);

    expect(plugin.banList.addBan).toHaveBeenCalledWith(
      'artist',
      'Queue Artist',
      expect.anything(),
      'dashboard'
    );
    expect(queue).toHaveLength(0);
    expect(plugin.playbackEngine.stop).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      removedQueued: 1
    }));
  });

  test('legacy persisted history tracks regain a canonical identity for exact bans', () => {
    const { plugin } = hydratePlugin();
    plugin.db = {
      prepare: jest.fn(() => ({
        get: jest.fn(() => ({
          id: 'history-legacy',
          youtubeId: 'legacy00001',
          source: 'youtube',
          url: 'https://www.youtube.com/watch?v=legacy00001',
          title: 'Legacy track'
        }))
      }))
    };

    expect(plugin._findTrackForBan('history-legacy')).toMatchObject({
      provider: 'youtube',
      providerId: 'legacy00001',
      trackKey: 'youtube:legacy00001'
    });
  });

  test('exact-track matching preserves case-sensitive provider IDs', () => {
    const { plugin } = hydratePlugin();

    expect(plugin._trackMatchesBanSelection(
      { trackKey: 'youtube:AbCdEfGhI12' },
      { type: 'track', value: 'youtube:AbCdEfGhI12' }
    )).toBe(true);
    expect(plugin._trackMatchesBanSelection(
      { trackKey: 'youtube:AbCdEfGhI12' },
      { type: 'track', value: 'youtube:aBcDeFgHi12' }
    )).toBe(false);
  });

  test('disabling precache releases obsolete upcoming pins but retains the active track', () => {
    const { plugin } = hydratePlugin();
    plugin.config.preCache = { enabled: false, lookahead: 2 };
    plugin.mediaCache = { pin: jest.fn(), unpin: jest.fn() };
    plugin._pinnedCacheKeys = new Set(['youtube:queued00001', 'youtube:current0001']);

    plugin._schedulePreCache();

    expect(plugin.mediaCache.unpin).toHaveBeenCalledWith('youtube:queued00001');
    expect(plugin.mediaCache.unpin).not.toHaveBeenCalledWith('youtube:current0001');
    expect(plugin._pinnedCacheKeys).toEqual(new Set(['youtube:current0001']));
  });

  test('twenty simultaneous queue advances reserve and start exactly one track', async () => {
    const { plugin } = hydratePlugin();
    plugin.playbackEngine.getNowPlaying.mockReturnValue(null);
    plugin.playbackEngine.isPlaying.mockReturnValue(false);
    let releasePlay;
    plugin.playbackEngine.play.mockImplementation(() => new Promise((resolve) => {
      releasePlay = resolve;
    }));

    const advances = Array.from({ length: 20 }, () => plugin._playNextFromQueue());
    await Promise.resolve();
    await Promise.resolve();
    expect(plugin.queueManager.shiftNext).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.play).toHaveBeenCalledTimes(1);

    releasePlay(true);
    const results = await Promise.all(advances);
    expect(results.every((result) => result.success)).toBe(true);
    expect(new Set(results.map((result) => result.song.id))).toEqual(new Set(['queued-1']));
  });

  test('viewer queue wins when a request arrives while AutoDJ is resolving', async () => {
    const { plugin, queue } = hydratePlugin();
    queue.splice(0, queue.length);
    let releaseAutoDj;
    plugin.autoDJ.onQueueEmpty = jest.fn(() => new Promise((resolve) => {
      releaseAutoDj = resolve;
    }));
    plugin.autoDJ.markTrackStarted = jest.fn();
    plugin.autoDJ.markPlaybackFailed = jest.fn();

    const autoDjStart = plugin._maybePlayAutoDJ();
    queue.push({ id: 'viewer-next', title: 'Viewer next', trackKey: 'youtube:viewernext1' });
    releaseAutoDj({ song: { id: 'autodj', title: 'AutoDJ', requestedBy: 'AutoDJ' } });

    await expect(autoDjStart).resolves.toBeNull();
    expect(plugin.playbackEngine.play).not.toHaveBeenCalled();
    expect(queue[0].id).toBe('viewer-next');
  });

  test('viewer queue also wins during a forced AutoDJ replacement', async () => {
    const { plugin, queue, setNowPlaying } = hydratePlugin();
    queue.splice(0, queue.length);
    setNowPlaying({ id: 'autodj-current', title: 'AutoDJ current', requestedBy: 'AutoDJ' });
    let releaseAutoDj;
    plugin.autoDJ.getNextSong = jest.fn(() => new Promise((resolve) => {
      releaseAutoDj = resolve;
    }));

    const autoDjStart = plugin._maybePlayAutoDJ(true);
    queue.push({ id: 'viewer-next', title: 'Viewer next', trackKey: 'youtube:viewernext1' });
    releaseAutoDj({ song: { id: 'autodj-replacement', title: 'AutoDJ replacement', requestedBy: 'AutoDJ' } });

    await expect(autoDjStart).resolves.toBeNull();
    expect(plugin.playbackEngine.play).not.toHaveBeenCalled();
    expect(queue[0].id).toBe('viewer-next');
  });

  test('AutoDJ applies the same exact-track bans before starting playback', async () => {
    const { plugin, queue, setNowPlaying } = hydratePlugin();
    queue.splice(0, queue.length);
    setNowPlaying(null);
    const blocked = {
      id: 'blocked-auto',
      title: 'Blocked AutoDJ',
      trackKey: 'youtube:blockedauto1',
      requestedBy: 'AutoDJ'
    };
    const allowed = {
      id: 'allowed-auto',
      title: 'Allowed AutoDJ',
      trackKey: 'youtube:allowedauto1',
      requestedBy: 'AutoDJ'
    };
    plugin.autoDJ.onQueueEmpty = jest.fn()
      .mockResolvedValueOnce({ song: blocked, announce: false })
      .mockResolvedValueOnce({ song: allowed, announce: false });
    plugin.autoDJ.markTrackStarted = jest.fn();
    plugin.banList.isTrackBanned.mockImplementation((trackKey) => ({
      banned: trackKey === blocked.trackKey
    }));

    await expect(plugin._maybePlayAutoDJ()).resolves.toMatchObject(allowed);

    expect(plugin.autoDJ.recordFailedTrack).toHaveBeenCalledWith(
      expect.objectContaining(blocked),
      'blocked-by-ban-list'
    );
    expect(plugin.playbackEngine.play).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.play).toHaveBeenCalledWith(expect.objectContaining(allowed));
  });

  test('destroy is terminal and cancels cache and resolver before playback shutdown', async () => {
    const { plugin } = hydratePlugin();
    const order = [];
    plugin._stopPrecacheTasks.mockImplementation(async () => order.push('precache'));
    plugin.mediaCache = { destroy: jest.fn(async () => order.push('cache')) };
    plugin.musicResolver.destroy = jest.fn(async () => order.push('resolver'));
    plugin.playbackEngine.removeAllListeners = jest.fn();
    plugin.playbackEngine.shutdown.mockImplementation(async () => order.push('playback'));

    await plugin.destroy();
    const afterDestroy = await plugin._playNextFromQueue();

    expect(order).toEqual(['precache', 'cache', 'resolver', 'playback']);
    expect(afterDestroy).toMatchObject({ success: false, locked: true });
    expect(plugin.queueManager.shiftNext).not.toHaveBeenCalled();
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
  });
});
