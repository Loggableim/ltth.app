'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const SQLite = require('better-sqlite3');
const DatabaseManager = require('../modules/database');

test('original server shutdown aborts failed persistence, cancels force exit and permits recovery', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-server-shutdown-test-'));
  const databasePath = path.join(directory, 'owned.sqlite');
  const db = new DatabaseManager(databasePath, null, { registerShutdownHandlers: false });
  const locker = new SQLite(databasePath);
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf('async function gracefulShutdown(signal) {');
  const end = source.indexOf("process.on('SIGINT'", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const processDouble = { exit: jest.fn(), exitCode: undefined };
  const server = { close: jest.fn(callback => callback()) };
  const timers = new Map();
  let timerId = 0;
  const context = vm.createContext({
    logger, process: processDouble, db, server,
    stableOverlayRoutingLifecycle: { shutdown: jest.fn(async () => {}) },
    pluginLoader: { plugins: new Map(), unloadPlugin: jest.fn() },
    tiktok: { isActive: () => false }, obs: { isConnected: () => false },
    cloudSync: { shutdown: jest.fn(async () => {}) }, io: { disconnectSockets: jest.fn() },
    setTimeout: callback => { const handle = { id: ++timerId, unref() {} }; timers.set(handle, callback); return handle; },
    clearTimeout: handle => timers.delete(handle)
  });
  vm.runInContext('let _isShuttingDown = false;\n' + source.slice(start, end), context);
  try {
    db.db.pragma('busy_timeout = 10');
    locker.exec('BEGIN IMMEDIATE');
    db.logEvent('pending-shutdown-event', 'synthetic-user', {});
    await context.gracefulShutdown('OWNED_TEST');
    expect(processDouble.exitCode).toBe(1);
    expect(processDouble.exit).not.toHaveBeenCalled();
    expect(server.close).not.toHaveBeenCalled();
    expect(timers.size).toBe(0);
    expect(vm.runInContext('_isShuttingDown', context)).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('shutdown aborted'));
    expect(db.db.open).toBe(true);
    expect(db.eventBatchQueue).toHaveLength(1);
    // No delayed force-exit callback remains, even once the busy lock is released.
    for (const callback of timers.values()) callback();
    expect(processDouble.exit).not.toHaveBeenCalled();
    locker.exec('ROLLBACK');
    await context.gracefulShutdown('OWNED_RETRY');
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(processDouble.exit).toHaveBeenCalledWith(0);
    expect(timers.size).toBe(0);
    expect(db.isClosed).toBe(true);
    const reader = new SQLite(databasePath, { readonly: true });
    try { expect(reader.prepare('SELECT count(*) AS n FROM event_logs').get().n).toBe(1); }
    finally { reader.close(); }
  } finally {
    if (locker.inTransaction) locker.exec('ROLLBACK');
    locker.close();
    if (db.eventBatchTimer) clearTimeout(db.eventBatchTimer);
    if (db.db.open) db.db.close();
    errors.mockRestore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
