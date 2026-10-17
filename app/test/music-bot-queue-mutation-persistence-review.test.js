const path = require('path');

const candidateRoot = path.resolve(__dirname, '..');
const QueueManager = require(path.join(candidateRoot, 'plugins/music-bot/lib/queue-manager'));
const MusicBotPlugin = require(path.join(candidateRoot, 'plugins/music-bot/main'));

function createMemoryDatabase(initialRows = []) {
  const state = {
    rows: initialRows.map((row) => ({ ...row })),
    failNextInsert: false,
    failNextDelete: false
  };

  const db = {
    prepare(sql) {
      const query = String(sql).trim();
      if (query.startsWith('SELECT * FROM plugin_music_bot_queue')) {
        return { all: () => state.rows.slice().sort((a, b) => a.position - b.position).map((row) => ({ ...row })) };
      }
      if (query.startsWith('DELETE FROM plugin_music_bot_queue')) {
        return {
          run: () => {
            if (state.failNextDelete) {
              state.failNextDelete = false;
              throw new Error('synthetic queue delete failure');
            }
            state.rows = [];
            return { changes: 1 };
          }
        };
      }
      if (query.startsWith('INSERT INTO plugin_music_bot_queue')) {
        return {
          run: (row) => {
            if (state.failNextInsert) {
              state.failNextInsert = false;
              throw new Error('synthetic queue write failure');
            }
            state.rows.push({ ...row });
            return { changes: 1 };
          }
        };
      }
      return { run: () => ({ changes: 0 }), all: () => [] };
    },
    transaction(work) {
      return (...args) => {
        const before = state.rows.map((row) => ({ ...row }));
        try {
          return work(...args);
        } catch (error) {
          state.rows = before;
          throw error;
        }
      };
    }
  };

  return { db, state };
}

function createQueueManager(db, queue = []) {
  const manager = Object.create(QueueManager.prototype);
  manager.db = db;
  manager.api = { log: jest.fn() };
  manager.queueConfig = { duplicateDetection: 'strict', allowDuplicates: false };
  manager.config = { queue: manager.queueConfig };
  manager.queue = queue.map((entry) => ({ ...entry }));
  manager._pendingQueueRestores = [];
  manager.history = [];
  manager.current = null;
  manager.userLastRequest = new Map();
  manager.voteSkipVoters = new Set();
  manager.skipImmuneUsers = new Set();
  manager._persistenceGuard = { blocked: false, reason: null, blockedAt: null, lastError: null };
  manager._rebuildRequesterState();
  return manager;
}

function song(id, title = id) {
  return {
    id,
    title,
    artist: 'Synthetic Artist',
    duration: 30,
    url: `https://example.invalid/${id}`,
    provider: 'soundcloud',
    providerId: id,
    trackKey: `soundcloud:${id}`,
    source: 'soundcloud',
    requestedBy: `requester-${id}`,
    requesterKey: `requester-${id}`,
    addedAt: id === 'a' ? 1 : 2
  };
}

function seedQueue(manager, entries) {
  const result = manager.persistQueue(entries);
  if (!result.success) throw new Error(`Unable to seed synthetic queue: ${result.error}`);
}

describe('E-only queue mutation persistence candidate', () => {
  test('blocked clear and reorder do not mutate memory or claim success', () => {
    const { db, state } = createMemoryDatabase();
    const entries = [song('a'), song('b')];
    const manager = createQueueManager(db, entries);
    seedQueue(manager, entries);
    manager.current = song('current');
    manager.voteSkipVoters.add('voter');
    manager.skipImmuneUsers.add('immune');
    manager._engagePersistenceGuard('synthetic-block', new Error('offline'));
    const beforeRows = state.rows.map((row) => ({ ...row }));

    expect(manager.clear()).toMatchObject({ success: false, blocked: true });
    expect(manager.reorderSong(0, 1)).toMatchObject({ success: false, blocked: true });
    expect(manager.removeSong(0)).toMatchObject({ success: false, blocked: true });
    expect(manager.returnToFront(song('c'))).toMatchObject({ success: false, blocked: true });
    expect(() => manager.shiftNext()).toThrow(expect.objectContaining({ code: 'QUEUE_PERSISTENCE_BLOCKED' }));
    expect(manager.queue.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(manager.current.id).toBe('current');
    expect(manager.getVoteVoters()).toEqual(['voter']);
    expect(manager.isSkipImmune('immune')).toBe(true);
    expect(state.rows).toEqual(beforeRows);
  });

  test('failed writes roll back DB and preserve in-memory clear/reorder state', () => {
    for (const mutation of ['clear', 'reorder']) {
      const { db, state } = createMemoryDatabase();
      const entries = [song('a'), song('b')];
      const manager = createQueueManager(db, entries);
      seedQueue(manager, entries);
      const beforeRows = state.rows.map((row) => ({ ...row }));
      if (mutation === 'clear') state.failNextDelete = true;
      else state.failNextInsert = true;

      const result = mutation === 'clear' ? manager.clear() : manager.reorderSong(0, 1);

      expect(result).toMatchObject({ success: false, errorCode: 'QUEUE_PERSISTENCE_FAILED' });
      expect(manager.queue.map((entry) => entry.id)).toEqual(['a', 'b']);
      expect(state.rows).toEqual(beforeRows);
      expect(manager.getPersistenceStatus()).toMatchObject({ blocked: true, reason: 'queue-write-failed' });
    }
  });

  test('delete and play-dequeue paths preserve the queue on persistence failure', () => {
    for (const mutation of ['delete', 'play-dequeue']) {
      const { db, state } = createMemoryDatabase();
      const entries = [song('a'), song('b')];
      const manager = createQueueManager(db, entries);
      seedQueue(manager, entries);
      const beforeRows = state.rows.map((row) => ({ ...row }));
      manager.current = song('current');
      state.failNextInsert = true;

      const result = mutation === 'delete'
        ? manager.removeSong(0, 'a')
        : (() => {
          try {
            manager.shiftNext();
            return { success: true };
          } catch (error) {
            return { success: false, errorCode: error.code };
          }
        })();

      expect(result).toMatchObject({ success: false, errorCode: 'QUEUE_PERSISTENCE_FAILED' });
      expect(manager.queue.map((entry) => entry.id)).toEqual(['a', 'b']);
      expect(manager.current.id).toBe('current');
      expect(state.rows).toEqual(beforeRows);
    }
  });

  test('failed return-to-front records a recovery entry; restore retries it before stale DB rows', () => {
    const { db, state } = createMemoryDatabase();
    const entries = [song('a'), song('b')];
    const manager = createQueueManager(db, entries);
    seedQueue(manager, entries);

    const shifted = manager.shiftNext();
    expect(shifted.id).toBe('a');
    expect(manager.queue.map((entry) => entry.id)).toEqual(['b']);
    expect(state.rows.map((row) => row.id)).toEqual(['b']);

    manager._engagePersistenceGuard('synthetic-playback-write-race', new Error('database became unavailable'));
    const returned = manager.returnToFront(shifted);
    expect(returned).toMatchObject({ success: false, blocked: true, recoveryPending: true });
    expect(manager.queue.map((entry) => entry.id)).toEqual(['b']);
    expect(manager.current).toBeNull();
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: true, recoveryPendingCount: 1 });

    state.failNextInsert = true;
    expect(manager.restoreQueue()).toMatchObject({ error: 'restore-write-failed', persistenceBlocked: true });
    expect(manager.queue.map((entry) => entry.id)).toEqual(['b']);
    expect(state.rows.map((row) => row.id)).toEqual(['b']);
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: true, recoveryPendingCount: 1 });

    expect(manager.restoreQueue()).toMatchObject({ restored: 2, persisted: true });
    expect(manager.queue.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(state.rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: false, recoveryPendingCount: 0 });
  });

  test('missing database transaction support fails closed before any queue write', () => {
    const { db, state } = createMemoryDatabase();
    const entries = [song('a'), song('b')];
    const manager = createQueueManager(db, entries);
    seedQueue(manager, entries);
    const beforeRows = state.rows.map((row) => ({ ...row }));
    db.transaction = undefined;

    const result = manager.clear();

    expect(result).toMatchObject({ success: false, errorCode: 'QUEUE_PERSISTENCE_FAILED' });
    expect(manager.queue.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(state.rows).toEqual(beforeRows);
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: true, reason: 'queue-write-failed' });
  });

  test('successful clear and reorder persist proposed snapshots; restore cannot resurrect old order/items', () => {
    const clearFixture = createMemoryDatabase();
    const clearEntries = [song('a'), song('b')];
    const clearManager = createQueueManager(clearFixture.db, clearEntries);
    seedQueue(clearManager, clearEntries);

    expect(clearManager.clear()).toEqual({ success: true, count: 0 });
    expect(clearManager.queue).toEqual([]);
    expect(clearFixture.state.rows).toEqual([]);
    const afterClearRestart = createQueueManager(clearFixture.db);
    expect(afterClearRestart.restoreQueue()).toMatchObject({ restored: 0, persisted: true });
    expect(afterClearRestart.queue).toEqual([]);
    expect(clearFixture.state.rows).toEqual([]);

    const reorderFixture = createMemoryDatabase();
    const reorderEntries = [song('a'), song('b')];
    const reorderManager = createQueueManager(reorderFixture.db, reorderEntries);
    seedQueue(reorderManager, reorderEntries);

    expect(reorderManager.reorderSong(0, 1)).toMatchObject({ success: true });
    expect(reorderManager.queue.map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(reorderFixture.state.rows.map((row) => row.id)).toEqual(['b', 'a']);
    const afterReorderRestart = createQueueManager(reorderFixture.db);
    expect(afterReorderRestart.restoreQueue()).toMatchObject({ restored: 2, persisted: true });
    expect(afterReorderRestart.queue.map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(reorderFixture.state.rows.map((row) => row.id)).toEqual(['b', 'a']);
  });

  test('shared clear contract does not stop playback or emit success on blocked/failed persistence', async () => {
    for (const result of [
      { success: false, errorCode: 'QUEUE_PERSISTENCE_BLOCKED', blocked: true },
      { success: false, errorCode: 'QUEUE_PERSISTENCE_FAILED' }
    ]) {
      const plugin = Object.create(MusicBotPlugin.prototype);
      plugin.queueManager = { clear: jest.fn(() => result) };
      plugin.playbackEngine = { stop: jest.fn() };
      plugin.autoDJ = { reset: jest.fn() };
      plugin._emitQueue = jest.fn();
      plugin._emitNowPlaying = jest.fn();
      const response = await plugin._clearQueueAndStop();

      expect(response).toMatchObject({
        success: false,
        queueCleared: false,
        playbackStopped: false,
        code: result.errorCode
      });
      expect(plugin.playbackEngine.stop).not.toHaveBeenCalled();
      expect(plugin.autoDJ.reset).not.toHaveBeenCalled();
      expect(plugin._emitQueue).not.toHaveBeenCalled();
      expect(plugin._emitNowPlaying).not.toHaveBeenCalled();
    }
  });

  test('shared clear contract stops playback and emits queue only after persisted success', async () => {
    const plugin = Object.create(MusicBotPlugin.prototype);
    plugin.queueManager = { clear: jest.fn(() => ({ success: true, count: 0 })) };
    plugin.playbackEngine = { stop: jest.fn().mockResolvedValue(undefined) };
    plugin.autoDJ = { reset: jest.fn() };
    plugin._emitQueue = jest.fn();
    plugin._emitNowPlaying = jest.fn();
    const response = await plugin._clearQueueAndStop();

    expect(response).toEqual({ success: true, queueCleared: true, playbackStopped: true });
    expect(plugin.playbackEngine.stop).toHaveBeenCalledTimes(1);
    expect(plugin.autoDJ.reset).toHaveBeenCalledTimes(1);
    expect(plugin._emitQueue).toHaveBeenCalledTimes(1);
    expect(plugin._emitNowPlaying).toHaveBeenCalledTimes(1);
    expect(plugin._emitNowPlaying).toHaveBeenCalledWith(null);
  });

  test('shutdown persist failure retains recovery ledger and blocked HTTP clear cannot report success', async () => {
    const { db, state } = createMemoryDatabase();
    const entries = [song('a'), song('b')];
    const manager = createQueueManager(db, entries);
    seedQueue(manager, entries);
    const shifted = manager.shiftNext();
    manager._engagePersistenceGuard('synthetic-shutdown-race', new Error('database unavailable'));
    expect(manager.returnToFront(shifted)).toMatchObject({ success: false, recoveryPending: true });

    const plugin = Object.create(MusicBotPlugin.prototype);
    plugin.queueManager = manager;
    plugin._queuePersistedOnDestroy = false;
    plugin._pendingRequests = new Set();
    plugin._requestCredits = new Map();
    plugin._userLikes = new Map();
    plugin.api = { log: jest.fn() };
    plugin.playbackEngine = { stop: jest.fn() };
    plugin.autoDJ = { reset: jest.fn() };
    plugin._emitQueue = jest.fn();

    state.failNextInsert = true;
    expect(() => plugin._finalizeDestroy()).toThrow('restore-write-failed');
    expect(manager.queue.map((entry) => entry.id)).toEqual(['b']);
    expect(state.rows.map((row) => row.id)).toEqual(['b']);
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: true, recoveryPendingCount: 1 });

    const response = await plugin._clearQueueAndStop();
    expect(response).toMatchObject({
      success: false,
      queueCleared: false,
      playbackStopped: false,
      code: 'QUEUE_PERSISTENCE_BLOCKED'
    });
    expect(plugin.playbackEngine.stop).not.toHaveBeenCalled();
    expect(plugin.autoDJ.reset).not.toHaveBeenCalled();
    expect(plugin._emitQueue).not.toHaveBeenCalled();
    expect(manager.queue.map((entry) => entry.id)).toEqual(['b']);
    expect(state.rows.map((row) => row.id)).toEqual(['b']);
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: true, recoveryPendingCount: 1 });

    plugin._finalizeDestroy();
    expect(plugin._queuePersistedOnDestroy).toBe(true);
    expect(manager.queue.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(state.rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: false, recoveryPendingCount: 0 });
  });
});
