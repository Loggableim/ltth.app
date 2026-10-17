const PluginLoader = require('../modules/plugin-loader');
const MusicBotPlugin = require('../plugins/music-bot/main');
const QueueManager = require('../plugins/music-bot/lib/queue-manager');
const { EventEmitter } = require('events');

function createApi(database = { close: jest.fn() }) {
  return {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => database,
    log: jest.fn()
  };
}

function createPlugin(queueManager, events = []) {
  const plugin = new MusicBotPlugin(createApi());
  plugin.queueManager = queueManager;
  plugin._stopPrecacheTasks = jest.fn(async () => events.push('precache-stopped'));
  plugin.mediaCache = { destroy: jest.fn(async () => events.push('cache-destroyed')) };
  plugin.musicResolver = { destroy: jest.fn(async () => events.push('resolver-destroyed')) };
  plugin.playlistImports = { destroy: jest.fn(async () => events.push('playlist-imports-destroyed')) };
  plugin.playbackEngine = {
    removeAllListeners: jest.fn(),
    shutdown: jest.fn(async () => events.push('playback-shutdown'))
  };
  plugin.radioSupervisor = { destroy: jest.fn() };
  plugin.autoDJ = { deactivate: jest.fn() };
  plugin._cancelNextSongVote = jest.fn();
  plugin._stopPlaybackSync = jest.fn();
  plugin._clearCrossfadeTimer = jest.fn();
  plugin._invalidateRadioPrefetch = jest.fn();
  plugin._cleanupDuckingHooks = jest.fn();
  plugin._checkBans = jest.fn(() => null);
  plugin._configUpdateTail = Promise.resolve();
  return plugin;
}

function createLoader(plugin) {
  const ownerRecord = {
    instance: plugin,
    api: {
      unregisterEventListeners: jest.fn(() => []),
      unregisterAll: jest.fn(() => [])
    }
  };
  const loader = Object.create(PluginLoader.prototype);
  loader._pluginUnloadTails = new Map();
  loader.plugins = new Map([['music-bot', ownerRecord]]);
  loader.logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  loader.emit = jest.fn();
  return { loader, ownerRecord };
}

function createQueueManager() {
  return {
    closeMutations: jest.fn(),
    persistQueue: jest.fn(),
    restoreQueue: jest.fn(),
    getPersistenceStatus: jest.fn(() => ({ blocked: false })),
    _persistenceGuard: { blocked: false }
  };
}

describe('Music Bot shutdown queue durability ordering', () => {
  jest.setTimeout(10000);

  test('retries blocked restore with backoff and stops playback only after confirmed queue persistence', async () => {
    const events = [];
    const queueManager = createQueueManager();
    queueManager.persistQueue
      .mockImplementationOnce(() => { events.push('persist-1'); return { success: false, blocked: true }; })
      .mockImplementationOnce(() => { events.push('persist-2'); return { success: false, blocked: true }; })
      .mockImplementationOnce(() => { events.push('persist-3'); return { success: true, blocked: false }; });
    queueManager.restoreQueue
      .mockImplementationOnce(() => {
        events.push('restore-1');
        queueManager._persistenceGuard.blocked = true;
        queueManager.getPersistenceStatus.mockReturnValue({ blocked: true });
        return { error: 'restore-read-failed', persistenceBlocked: true };
      })
      .mockImplementationOnce(() => {
        events.push('restore-2');
        queueManager._persistenceGuard.blocked = false;
        queueManager.getPersistenceStatus.mockReturnValue({ blocked: false });
        return { restored: 2, persisted: true };
      });
    const plugin = createPlugin(queueManager, events);

    await plugin.destroy({ reason: 'application-shutdown' });

    expect(queueManager.closeMutations).toHaveBeenCalledTimes(1);
    expect(queueManager.persistQueue).toHaveBeenCalledTimes(3);
    expect(queueManager.restoreQueue).toHaveBeenCalledTimes(2);
    expect(events.indexOf('persist-3')).toBeLessThan(events.indexOf('playback-shutdown'));
    expect(plugin._queuePersistedOnDestroy).toBe(true);
    expect(plugin._playbackShutdownComplete).toBe(true);
    expect(plugin.cleanupPending).toBe(false);
  });

  test('keeps plugin owner and playback child pending after bounded recovery fails, then retries to durable success', async () => {
    const events = [];
    const queueManager = createQueueManager();
    queueManager.persistQueue.mockImplementation(() => {
      events.push('persist');
      return { success: false, blocked: true };
    });
    queueManager.restoreQueue.mockImplementation(() => {
      events.push('restore');
      queueManager._persistenceGuard.blocked = true;
      queueManager.getPersistenceStatus.mockReturnValue({ blocked: true });
      return { error: 'restore-read-failed', persistenceBlocked: true };
    });
    const plugin = createPlugin(queueManager, events);
    const { loader, ownerRecord } = createLoader(plugin);

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(false);
    expect(plugin.cleanupPending).toBe(true);
    expect(plugin._queuePersistedOnDestroy).toBe(false);
    expect(plugin.playbackEngine.shutdown).not.toHaveBeenCalled();
    expect(loader.plugins.get('music-bot')).toBe(ownerRecord);
    expect(plugin.db.close).not.toHaveBeenCalled();

    events.push('explicit-retry');
    queueManager.persistQueue.mockImplementationOnce(() => {
      events.push('persist-retry');
      return { success: true, blocked: false };
    });
    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(true);

    expect(events.indexOf('persist-retry')).toBeLessThan(events.indexOf('playback-shutdown'));
    expect(plugin._queuePersistedOnDestroy).toBe(true);
    expect(plugin.playbackEngine.shutdown).toHaveBeenCalledTimes(1);
    expect(plugin.cleanupPending).toBe(false);
    expect(loader.plugins.has('music-bot')).toBe(false);
  });

  test('does not add a dashboard result whose resolver completes after shutdown starts', async () => {
    let resolveRequest;
    const queueManager = { addSong: jest.fn(() => ({ success: true })) };
    const plugin = createPlugin(queueManager);
    plugin.musicResolver = {
      resolve: jest.fn(() => new Promise((resolve) => { resolveRequest = resolve; }))
    };
    plugin.config.playback.autoPlay = false;

    const request = plugin._handleDashboardRequest('synthetic query', 'viewer');
    expect(plugin.musicResolver.resolve).toHaveBeenCalledTimes(1);
    plugin._destroyed = true;
    plugin._lifecycleGeneration += 1;
    resolveRequest({ success: true, song: { id: 'late-song', title: 'Late Song' } });

    await expect(request).resolves.toMatchObject({ success: false, code: 'MUSIC_BOT_SHUTTING_DOWN' });
    expect(queueManager.addSong).not.toHaveBeenCalled();
  });

  test('closed queue mutation gate rejects a late write without persistence or recovery-ledger mutation', () => {
    const manager = Object.create(QueueManager.prototype);
    const existing = { id: 'kept', title: 'Kept' };
    manager.queue = [existing];
    manager.current = null;
    manager._mutationsClosed = false;
    manager._persistenceGuard = { blocked: false };
    manager._pendingQueueRestores = [];
    manager.persistQueue = jest.fn(() => ({ success: true }));
    manager._rebuildRequesterState = jest.fn();
    manager.closeMutations();

    const result = manager._commitQueueMutation([]);
    const returned = manager.returnToFront({ id: 'late', title: 'Late' });
    const localPathUpdated = manager.setTrackLocalPath('track-key', 'C:\\synthetic\\track.mp3');
    const playingMarked = manager.markPlaying({ id: 'late' });
    const giftMarked = manager.markGiftRequest('kept');

    expect(result).toMatchObject({ success: false, shutdownPending: true, errorCode: 'QUEUE_SHUTTING_DOWN' });
    expect(returned).toMatchObject({ success: false, shutdownPending: true });
    expect(manager.queue).toEqual([existing]);
    expect(manager._pendingQueueRestores).toEqual([]);
    expect(localPathUpdated).toBe(false);
    expect(playingMarked).toBe(false);
    expect(giftMarked).toBe(false);
    expect(existing.isGiftRequest).toBeUndefined();
    expect(manager.persistQueue).not.toHaveBeenCalled();
  });

  test('closed gate rejects returnToFront already-queued fast path and empty shiftNext before current changes', () => {
    const manager = Object.create(QueueManager.prototype);
    const queued = { id: 'queued', title: 'Queued' };
    const current = { id: 'current', title: 'Current' };
    Object.assign(manager, {
      queue: [queued],
      current,
      _mutationsClosed: true,
      _persistenceGuard: { blocked: false },
      _pendingQueueRestores: [],
      persistQueue: jest.fn()
    });

    expect(manager.returnToFront(queued)).toMatchObject({ success: false, shutdownPending: true });
    expect(manager.current).toBe(current);
    manager.queue = [];
    let shiftError;
    try {
      manager.shiftNext();
    } catch (error) {
      shiftError = error;
    }
    expect(shiftError).toMatchObject({ code: 'QUEUE_SHUTTING_DOWN' });
    expect(manager.current).toBe(current);
    expect(manager.persistQueue).not.toHaveBeenCalled();
  });

  test('closed gate rejects vote and skip-immunity fast-path mutations', () => {
    const manager = Object.create(QueueManager.prototype);
    Object.assign(manager, {
      config: { voteSkip: { minVotes: 1, thresholdPercent: 50 } },
      queueConfig: {},
      queue: [],
      current: { id: 'current', requestedBy: 'requester' },
      _mutationsClosed: true,
      voteSkipVoters: new Set(),
      skipImmuneUsers: new Set(['existing'])
    });

    expect(manager.addSkipImmunity('late')).toBe(false);
    expect(manager.removeSkipImmunity('existing')).toBe(false);
    expect(manager.clearSkipImmunity()).toBe(false);
    expect(manager.addVoteSkip('voter', 10)).toMatchObject({ shutdownPending: true, votes: 0 });
    expect(manager.resetVoteSkips()).toBe(false);
    expect(manager.skipImmuneUsers).toEqual(new Set(['existing']));
    expect(manager.voteSkipVoters).toEqual(new Set());
  });

  test('gift queue marking and immunity stop at a closed gate, including an in-flight gift', async () => {
    let finishSkip;
    const queuedSong = { id: 'gift-song', isGiftRequest: false };
    const queueManager = {
      _mutationsClosed: false,
      markGiftRequest: jest.fn((id) => {
        if (queueManager._mutationsClosed) return false;
        if (id !== queuedSong.id) return false;
        queuedSong.isGiftRequest = true;
        return true;
      }),
      addSkipImmunity: jest.fn(() => !queueManager._mutationsClosed)
    };
    const plugin = createPlugin(queueManager);
    plugin.config.monetization = {
      payToSkipEnabled: true,
      payToSkipGiftCatalog: ['rose']
    };
    plugin.config.giftIntegration = { skipImmunityGifts: ['rose'] };
    plugin._skipCurrent = jest.fn(() => new Promise((resolve) => { finishSkip = resolve; }));
    plugin._findSongByUser = jest.fn(() => queuedSong);

    const pending = plugin._handleGiftEvent({ username: 'viewer', giftName: 'rose' });
    queueManager._mutationsClosed = true;
    finishSkip({ success: false });
    await pending;

    expect(queuedSong.isGiftRequest).toBe(false);
    expect(queueManager.markGiftRequest).not.toHaveBeenCalled();
    expect(queueManager.addSkipImmunity).not.toHaveBeenCalled();
  });

  test('stale track-end callback cannot create queue work or restart playback after shutdown generation changes', () => {
    const queueManager = {
      _mutationsClosed: false,
      addToHistory: jest.fn(),
      removeSkipImmunity: jest.fn(),
      resetVoteSkips: jest.fn()
    };
    const plugin = createPlugin(queueManager);
    const events = new EventEmitter();
    events.getNowPlaying = jest.fn(() => null);
    plugin.playbackEngine = events;
    plugin.mediaCache = { unpin: jest.fn() };
    plugin._playNextFromQueue = jest.fn();
    plugin._stopPlaybackSync = jest.fn();
    plugin._emitPlaybackAdvancing = jest.fn();
    plugin._clearCrossfadeTimer = jest.fn();
    plugin._recordCatalogTrackEnd = jest.fn();
    plugin._registerPlaybackEvents();

    plugin._lifecycleGeneration += 1;
    events.emit('track-end', { track: { id: 'late', trackKey: 'late-key' }, reason: 'ended' });

    expect(plugin.mediaCache.unpin).not.toHaveBeenCalled();
    expect(queueManager.addToHistory).not.toHaveBeenCalled();
    expect(queueManager.removeSkipImmunity).not.toHaveBeenCalled();
    expect(queueManager.resetVoteSkips).not.toHaveBeenCalled();
    expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
    expect(plugin._stopPlaybackSync).not.toHaveBeenCalled();
  });

  test('AutoDJ failure recovery cannot restart playback after shutdown closes mutations', async () => {
    const queueManager = {
      _mutationsClosed: true,
      markPlaying: jest.fn(),
      resetVoteSkips: jest.fn()
    };
    const plugin = createPlugin(queueManager);
    plugin._destroyed = true;
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => ({ id: 'failed' })),
      clearNowPlaying: jest.fn()
    };
    plugin._recordCatalogTrackEnd = jest.fn();
    plugin._stopPlaybackSync = jest.fn();
    plugin.autoDJ = { markPlaybackFailed: jest.fn() };
    plugin.radioSupervisor = { wake: jest.fn() };

    await expect(plugin._handleAutoDJPlaybackFailure({ id: 'failed' }, 'mpv-track-end', new Error('synthetic')))
      .resolves.toBeNull();
    expect(plugin._recordCatalogTrackEnd).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.clearNowPlaying).not.toHaveBeenCalled();
    expect(queueManager.markPlaying).not.toHaveBeenCalled();
    expect(plugin.radioSupervisor.wake).not.toHaveBeenCalled();
  });
});
