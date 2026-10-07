'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const SQLite = require('better-sqlite3');
const DatabaseManager = require('../modules/database');

test.each([false, true])('original timeout persists queued events or preserves them on actual SQLite lock (locked=%s)', async locked => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-shutdown-deadline-audit-'));
  const databasePath = path.join(directory, 'owned.sqlite');
  const quiet = jest.spyOn(console, 'log').mockImplementation(() => {});
  const quietErrors = jest.spyOn(console, 'error').mockImplementation(() => {});
  const db = new DatabaseManager(databasePath, null, { registerShutdownHandlers: false });
  const reader = new SQLite(databasePath, { readonly: true });
  const locker = locked ? new SQLite(databasePath) : null;
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf('// Graceful Shutdown (shared handler for SIGINT and SIGTERM)');
  const end = source.indexOf("process.on('SIGINT'", start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  let releaseCleanup;
  const cleanupGate = new Promise(resolve => { releaseCleanup = resolve; });
  let forceCallback;
  const processDouble = { exit: jest.fn() };
  const server = { close: jest.fn(callback => callback()) };
  const context = vm.createContext({
    db, server, process: processDouble,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    stableOverlayRoutingLifecycle: { shutdown: async () => {} },
    pluginLoader: { plugins: new Map([['owned-slow-plugin', {}]]), unloadPlugin: jest.fn(() => cleanupGate) },
    tiktok: { isActive: () => false }, obs: { isConnected: () => false },
    cloudSync: { shutdown: async () => {} }, io: { disconnectSockets() {} },
    setTimeout(callback, ms) { expect(ms).toBe(5000); forceCallback = callback; return { unref() {} }; },
    clearTimeout() {}
  });
  vm.runInContext(source.slice(start, end), context);
  let shutdown;
  try {
    shutdown = context.gracefulShutdown('OWNED_AUDIT');
    await new Promise(resolve => setImmediate(resolve));
    expect(context.pluginLoader.unloadPlugin).toHaveBeenCalled();
    // An adapter/plugin can still enqueue an event while unload awaits.
    // Its normal five-second batch deadline begins later than server force-exit.
    db.logEvent('owned-late-shutdown-event', 'synthetic-user', {});
    expect(db.eventBatchQueue).toHaveLength(1);
    expect(reader.prepare('SELECT count(*) AS n FROM event_logs').get().n).toBe(0);
    if (locker) { db.db.pragma('busy_timeout = 10'); locker.exec('BEGIN IMMEDIATE'); }
    forceCallback(); // Controlled server deadline; never exits the host process.
    expect(server.close).not.toHaveBeenCalled();
    if (locked) {
      expect(processDouble.exit).not.toHaveBeenCalled();
      expect(processDouble.exitCode).toBe(1);
      expect(db.db.open).toBe(true);
      expect(db.eventBatchQueue).toHaveLength(1);
      expect(reader.prepare('SELECT count(*) AS n FROM event_logs').get().n).toBe(0);
      locker.exec('ROLLBACK');
    } else {
      expect(processDouble.exit).toHaveBeenCalledWith(1);
      expect(db.db.open).toBe(true);
      expect(db.eventBatchQueue).toHaveLength(0);
      expect(reader.prepare('SELECT count(*) AS n FROM event_logs').get().n).toBe(1);
    }
    // Release the await only for safe process-double cleanup/recovery.
    releaseCleanup(true);
    await shutdown;
    if (locked) {
      expect(server.close).not.toHaveBeenCalled();
      expect(processDouble.exit).not.toHaveBeenCalled();
      expect(vm.runInContext('_isShuttingDown', context)).toBe(false);
      await context.gracefulShutdown('OWNED_RECOVERY');
      expect(server.close).toHaveBeenCalledTimes(1);
      expect(processDouble.exit).toHaveBeenCalledWith(0);
    }
    expect(reader.prepare('SELECT count(*) AS n FROM event_logs').get().n).toBe(1);
  } finally {
    if (locker?.inTransaction) locker.exec('ROLLBACK');
    releaseCleanup(true);
    if (shutdown) await shutdown;
    if (db.db.open) db.close();
    reader.close(); locker?.close(); quiet.mockRestore(); quietErrors.mockRestore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
