const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const DatabaseManager = require('../modules/database');
const PluginLoader = require('../modules/plugin-loader');
const { createServerRestartCoordinator } = require('../modules/server-restart-coordinator');
const QueueManager = require('../plugins/music-bot/lib/queue-manager');
const MusicBotPlugin = require('../plugins/music-bot/main');

function makeTimers(events) {
  let nextId = 1;
  const tasks = new Map();
  return {
    tasks,
    setTimeout(callback, delay) {
      const handle = { id: nextId++, unref() {} };
      tasks.set(handle.id, { callback, delay, handle });
      events.push(`timer:${delay}`);
      return handle;
    },
    clearTimeout(handle) {
      tasks.delete(handle.id);
    },
    run(delay) {
      const match = [...tasks.entries()].find(([, task]) => task.delay === delay);
      if (!match) throw new Error(`Missing synthetic timer ${delay}`);
      tasks.delete(match[0]);
      return match[1].callback();
    }
  };
}

function queueRows(db) {
  return db.prepare('SELECT id, position, title, requestedBy FROM plugin_music_bot_queue ORDER BY position ASC').all();
}

describe('Music Bot profile restart SQLite integration', () => {
  jest.setTimeout(30000);

  it('keeps restart open on locked queue restore, then retries and restarts with exact queue order', async () => {
    const appRoot = path.resolve(__dirname, '..');
    const testRoot = path.resolve(appRoot, `.music-profile-restart-${process.pid}-${Date.now()}`);
    if (path.dirname(testRoot) !== appRoot) {
      throw new Error(`Refusing test data outside app root: ${testRoot}`);
    }
    fs.mkdirSync(testRoot);

    let databaseManager;
    let reopenedDatabaseManager;
    let locker;
    try {
      const dbPath = path.join(testRoot, 'profile-test.sqlite');
      databaseManager = new DatabaseManager(dbPath, null, { registerShutdownHandlers: false });
      databaseManager.db.pragma('journal_mode = DELETE');
      databaseManager.db.pragma('busy_timeout = 0');

      const events = [];
      const api = {
        getDatabase: () => databaseManager.db,
        getSocketIO: () => ({ emit: jest.fn() }),
        log: jest.fn()
      };
      const queueManager = new QueueManager({
        queue: {
          maxLength: 20,
          maxPerUser: 10,
          maxSongDurationSeconds: 600,
          duplicateDetection: 'off',
          allowDuplicates: true,
          cooldownPerUserSeconds: 0
        }
      }, api);
      const tracks = [
        { id: 'track-a', title: 'Track A', url: 'https://example.invalid/a', requestedBy: 'viewer-a' },
        { id: 'track-b', title: 'Track B', url: 'https://example.invalid/b', requestedBy: 'viewer-b' },
        { id: 'track-c', title: 'Track C', url: 'https://example.invalid/c', requestedBy: 'viewer-c' }
      ];
      expect(queueManager.addSong(tracks[0]).success).toBe(true);
      expect(queueRows(databaseManager.db).map(({ id }) => id)).toEqual(['track-a']);

      locker = new Database(dbPath);
      locker.pragma('busy_timeout = 0');
      locker.exec('BEGIN EXCLUSIVE');
      queueManager.queue.push(...tracks.slice(1));
      expect(queueManager.persistQueue().success).toBe(false);
      expect(queueManager.restoreQueue()).toMatchObject({ error: 'restore-read-failed', persistenceBlocked: true });
      expect(queueRows(locker).map(({ id }) => id)).toEqual(['track-a']);

      const plugin = new MusicBotPlugin(api);
      plugin.queueManager = queueManager;
      plugin._stopPrecacheTasks = async () => {};
      plugin.mediaCache = { destroy: async () => {} };
      plugin.musicResolver = { destroy: async () => {} };
      plugin.playlistImports = { destroy: async () => {} };
      plugin.playbackEngine = {
        removeAllListeners() {},
        shutdown: async () => { events.push('music-bot:playback-shutdown'); }
      };
      plugin.radioSupervisor = { destroy() {} };
      plugin.autoDJ = { deactivate() {} };

      const loader = Object.create(PluginLoader.prototype);
      loader._pluginUnloadTails = new Map();
      loader.plugins = new Map([['music-bot', {
        instance: plugin,
        api: { unregisterEventListeners: () => [], unregisterAll: () => [] }
      }]]);
      loader.logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      loader.emit = jest.fn((event, id) => events.push(`${event}:${id}`));

      const timers = makeTimers(events);
      const httpServer = {
        close: jest.fn((callback) => {
          events.push('http:close');
          callback();
        })
      };
      const io = {
        emit: jest.fn((event) => events.push(`io:${event}`)),
        disconnectSockets: jest.fn(() => events.push('io:disconnect'))
      };
      const processExit = jest.fn((code) => events.push(`exit:${code}`));
      const coordinator = createServerRestartCoordinator({
        stableLifecycle: { shutdown: async () => events.push('stable:shutdown') },
        pluginLoader: loader,
        io,
        db: {
          flushEventBatch: async () => { events.push('db:flush'); },
          close: () => {
            events.push('db:close');
            databaseManager.close();
          }
        },
        server: httpServer,
        onRestartAborted: (failure) => events.push(`restart:aborted:${failure.stage}`),
        logger: { info() {}, warn() {}, debug() {}, error() {} },
        processExit,
        timers,
        delayMs: 250,
        stableShutdownTimeoutMs: 2000,
        pluginShutdownTimeoutMs: 1500,
        databaseFlushTimeoutMs: 2000,
        forceExitTimeoutMs: 3000
      });

      expect(coordinator.schedule('profile switch to synthetic-beta')).toBe(true);
      await timers.run(250);

      expect(coordinator.isScheduled()).toBe(false);
      expect(databaseManager.db.open).toBe(true);
      expect(loader.plugins.get('music-bot').instance).toBe(plugin);
      expect(plugin.cleanupPending).toBe(true);
      expect(plugin._queuePersistedOnDestroy).toBe(false);
      expect(queueRows(locker).map(({ id }) => id)).toEqual(['track-a']);
      expect(httpServer.close).not.toHaveBeenCalled();
      expect(io.disconnectSockets).not.toHaveBeenCalled();
      expect(processExit).not.toHaveBeenCalledWith(75);
      expect(events).toContain('restart:aborted:plugin cleanup');

      locker.exec('ROLLBACK');
      locker.close();
      locker = null;

      expect(coordinator.schedule('explicit retry after queue storage recovered')).toBe(true);
      await timers.run(250);

      expect(loader.plugins.has('music-bot')).toBe(false);
      expect(plugin.cleanupPending).toBe(false);
      expect(plugin._queuePersistedOnDestroy).toBe(true);

      const finalizationIndex = events.indexOf('plugin:unloaded:music-bot');
      const flushIndex = events.indexOf('db:flush');
      const closeIndex = events.indexOf('db:close');
      const httpCloseIndex = events.indexOf('http:close');
      const exitIndex = events.indexOf('exit:75');
      expect(events.indexOf('music-bot:playback-shutdown')).toBeLessThan(finalizationIndex);
      expect(finalizationIndex).toBeLessThan(flushIndex);
      expect(flushIndex).toBeLessThan(closeIndex);
      expect(closeIndex).toBeLessThan(httpCloseIndex);
      expect(httpCloseIndex).toBeLessThan(exitIndex);
      expect(processExit).toHaveBeenCalledWith(75);
      expect(databaseManager.db.open).toBe(false);

      reopenedDatabaseManager = new DatabaseManager(dbPath, null, { registerShutdownHandlers: false });
      expect(queueRows(reopenedDatabaseManager.db)).toEqual([
        { id: 'track-a', position: 0, title: 'Track A', requestedBy: 'viewer-a' },
        { id: 'track-b', position: 1, title: 'Track B', requestedBy: 'viewer-b' },
        { id: 'track-c', position: 2, title: 'Track C', requestedBy: 'viewer-c' }
      ]);
      const restartedQueue = new QueueManager({ queue: { duplicateDetection: 'off', allowDuplicates: true } }, {
        getDatabase: () => reopenedDatabaseManager.db,
        log: jest.fn()
      });
      expect(restartedQueue.restoreQueue()).toMatchObject({ restored: 3, deduped: 0, banned: 0 });
      expect(restartedQueue.getQueue().map(({ id, title, requestedBy }) => ({ id, title, requestedBy }))).toEqual([
        { id: 'track-a', title: 'Track A', requestedBy: 'viewer-a' },
        { id: 'track-b', title: 'Track B', requestedBy: 'viewer-b' },
        { id: 'track-c', title: 'Track C', requestedBy: 'viewer-c' }
      ]);
    } finally {
      if (locker?.open) {
        try { locker.exec('ROLLBACK'); } catch (_error) {}
        locker.close();
      }
      reopenedDatabaseManager?.close();
      databaseManager?.close();
      if (path.dirname(testRoot) === appRoot) {
        fs.rmSync(testRoot, { recursive: true, force: true });
      }
    }
  });
});
