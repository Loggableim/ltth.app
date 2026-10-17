const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const DatabaseManager = require('../modules/database');
const PluginLoader = require('../modules/plugin-loader');
const QueueManager = require('../plugins/music-bot/lib/queue-manager');
const MusicBotPlugin = require('../plugins/music-bot/main');

function readQueueRows(db) {
  return db.prepare('SELECT * FROM plugin_music_bot_queue ORDER BY position ASC').all();
}

function createQueueConfig() {
  return {
    queue: {
      maxLength: 20,
      maxPerUser: 10,
      maxSongDurationSeconds: 600,
      duplicateDetection: 'off',
      allowDuplicates: true,
      cooldownPerUserSeconds: 0
    }
  };
}

function createTrack(id, title, url, requestedBy) {
  return { id, title, artist: 'Synthetic Artist', duration: 120, url, requestedBy };
}

describe('music-bot queue persistence across failed shutdown and restart', () => {
  jest.setTimeout(30000);

  it('retains DB rows and unload ownership during a SQLite lock, then restores the exact queue after restart', async () => {
    const appRoot = path.resolve(__dirname, '..');
    const testRoot = path.resolve(appRoot, `.queue-persistence-restart-${process.pid}-${Date.now()}`);
    if (path.dirname(testRoot) !== appRoot) {
      throw new Error(`Refusing queue test data outside app root: ${testRoot}`);
    }
    fs.mkdirSync(testRoot);
    const dbPath = path.join(testRoot, 'profile-test.sqlite');
    let databaseManager;
    let reopenedDatabaseManager;
    let locker;

    try {
      databaseManager = new DatabaseManager(dbPath, null, { registerShutdownHandlers: false });
      databaseManager.db.pragma('journal_mode = DELETE');
      databaseManager.db.pragma('busy_timeout = 0');

      const api = {
        getDatabase: () => databaseManager.db,
        getSocketIO: () => ({ emit: jest.fn() }),
        log: jest.fn()
      };
      const queueManager = new QueueManager(createQueueConfig(), api);
      const trackA = createTrack('track-a', 'Track A', 'https://example.invalid/a', 'viewer-a');
      const trackB = createTrack('track-b', 'Track B', 'https://example.invalid/b', 'viewer-b');
      const trackC = createTrack('track-c', 'Track C', 'https://example.invalid/c', 'viewer-c');

      expect(queueManager.addSong(trackA).success).toBe(true);
      expect(readQueueRows(databaseManager.db).map((row) => row.id)).toEqual(['track-a']);

      locker = new Database(dbPath);
      locker.pragma('busy_timeout = 0');
      locker.exec('BEGIN EXCLUSIVE');

      // Queue additions are staged directly while locked so the fixture models
      // pending in-memory entries without invoking an earlier successful write.
      queueManager.queue.push(trackB, trackC);
      expect(queueManager.getQueue().map((entry) => entry.id)).toEqual(['track-a', 'track-b', 'track-c']);
      expect(queueManager.persistQueue()).toMatchObject({ success: false, blocked: false });
      expect(readQueueRows(locker).map((row) => row.id)).toEqual(['track-a']);
      expect(queueManager.restoreQueue()).toMatchObject({ persistenceBlocked: true, error: 'restore-read-failed' });
      expect(queueManager.persistQueue()).toMatchObject({ success: false, blocked: true });
      expect(readQueueRows(locker).map((row) => row.id)).toEqual(['track-a']);

      const plugin = new MusicBotPlugin(api);
      plugin.queueManager = queueManager;
      plugin._stopPrecacheTasks = async () => {};
      plugin.mediaCache = { destroy: async () => {} };
      plugin.musicResolver = { destroy: async () => {} };
      plugin.playlistImports = { destroy: async () => {} };
      plugin.playbackEngine = { removeAllListeners() {}, shutdown: async () => {} };
      plugin.radioSupervisor = { destroy() {} };
      plugin.autoDJ = { deactivate() {} };

      const ownerRecord = {
        instance: plugin,
        api: { unregisterEventListeners: () => [], unregisterAll: () => [] }
      };
      const loader = Object.create(PluginLoader.prototype);
      loader._pluginUnloadTails = new Map();
      loader.plugins = new Map([['music-bot', ownerRecord]]);
      loader.logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
      loader.emit = jest.fn();

      expect(await loader.unloadPlugin('music-bot')).toBe(false);
      expect(loader.plugins.get('music-bot')).toBe(ownerRecord);
      expect(plugin.cleanupPending).toBe(true);
      expect(plugin._queuePersistedOnDestroy).toBe(false);
      expect(readQueueRows(locker).map((row) => row.id)).toEqual(['track-a']);

      locker.exec('ROLLBACK');
      locker.close();
      locker = null;

      expect(await loader.unloadPlugin('music-bot')).toBe(true);
      expect(loader.plugins.has('music-bot')).toBe(false);
      expect(plugin.cleanupPending).toBe(false);
      expect(plugin._queuePersistedOnDestroy).toBe(true);

      const expected = [
        { id: 'track-a', title: 'Track A', requestedBy: 'viewer-a' },
        { id: 'track-b', title: 'Track B', requestedBy: 'viewer-b' },
        { id: 'track-c', title: 'Track C', requestedBy: 'viewer-c' }
      ];
      expect(readQueueRows(databaseManager.db).map(({ id, title, requestedBy }) => ({ id, title, requestedBy }))).toEqual(expected);

      databaseManager.close();
      databaseManager = null;
      reopenedDatabaseManager = new DatabaseManager(dbPath, null, { registerShutdownHandlers: false });
      const restartedQueue = new QueueManager(createQueueConfig(), {
        getDatabase: () => reopenedDatabaseManager.db,
        log: jest.fn()
      });
      expect(restartedQueue.restoreQueue()).toMatchObject({ restored: 3, deduped: 0, banned: 0 });
      expect(restartedQueue.getQueue().map(({ id, title, requestedBy }) => ({ id, title, requestedBy }))).toEqual(expected);
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
