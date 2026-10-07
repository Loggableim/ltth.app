'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const SQLite = require('better-sqlite3');
const DatabaseManager = require('../modules/database');

function isolatedManager(options) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-db-shutdown-regression-'));
  const databasePath = path.join(directory, 'owned.sqlite');
  const handlers = new Map();
  const previousRegistered = DatabaseManager.shutdownHandlersRegistered;
  const once = jest.spyOn(process, 'once').mockImplementation((event, handler) => {
    if (!['SIGINT', 'SIGTERM', 'exit'].includes(event)) throw new Error(`Unexpected process listener: ${event}`);
    handlers.set(event, handler);
    return process;
  });
  let manager;
  try {
    DatabaseManager.shutdownHandlersRegistered = false;
    manager = new DatabaseManager(databasePath, null, options);
  } finally {
    once.mockRestore();
    DatabaseManager.shutdownHandlersRegistered = previousRegistered;
  }
  return {
    manager, databasePath, handlers,
    dispose() {
      if (manager.eventBatchTimer) clearTimeout(manager.eventBatchTimer);
      if (manager.db.open) manager.db.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

describe('actual DatabaseManager shutdown regression', () => {
  test('successful close persists a queued event synchronously', () => {
    const fixture = isolatedManager();
    let reader;
    try {
      fixture.manager.logEvent('owned-test', 'synthetic-user', { value: 1 });
      fixture.manager.close();
      reader = new SQLite(fixture.databasePath, { readonly: true });
      expect(reader.prepare('SELECT event_type FROM event_logs').all()).toEqual([{ event_type: 'owned-test' }]);
    } finally {
      reader?.close();
      fixture.dispose();
    }
  });

  test('failed close flush retains the queued event and open database for recovery', async () => {
    const fixture = isolatedManager();
    const locker = new SQLite(fixture.databasePath);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      fixture.manager.db.pragma('busy_timeout = 10');
      locker.exec('BEGIN IMMEDIATE');
      fixture.manager.logEvent('owned-pending-event', 'synthetic-user', { value: 2 });
      expect(() => fixture.manager.close()).toThrow(/locked/);
      expect(errors).toHaveBeenCalled();
      expect(fixture.manager.eventBatchQueue).toHaveLength(1);
      expect(fixture.manager.db.open).toBe(true);
      locker.exec('ROLLBACK');
      await fixture.manager.flushEventBatch();
      expect(fixture.manager.getEventLogs()).toHaveLength(1);
      fixture.manager.close();
      expect(fixture.manager.isClosed).toBe(true);
    } finally {
      if (locker.inTransaction) locker.exec('ROLLBACK');
      locker.close();
      errors.mockRestore();
      fixture.dispose();
    }
  });

  test('database stays open until server-owned asynchronous cleanup finishes', async () => {
    const fixture = isolatedManager({ registerShutdownHandlers: false });
    let releaseCleanup;
    const cleanupGate = new Promise(resolve => { releaseCleanup = resolve; });
    const observed = [];
    const signalTimers = [];
    const actualSetTimeout = global.setTimeout;
    const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay, ...args) => {
      const timer = actualSetTimeout(callback, delay, ...args);
      signalTimers.push(timer);
      return timer;
    });
    try {
      expect(fixture.handlers.size).toBe(0);
      const serverSignal = async () => {
        await cleanupGate;
        observed.push(fixture.manager.db.open);
        fixture.manager.close();
      };
      // Reproduce EventEmitter ordering without emitting a host signal or exiting.
      const serverCompletion = serverSignal();
      await Promise.resolve();
      const openBeforeCleanup = fixture.manager.db.open;
      releaseCleanup();
      await serverCompletion;
      expect(openBeforeCleanup).toBe(true);
      expect(observed).toEqual([true]);
    } finally {
      releaseCleanup();
      timeoutSpy.mockRestore();
      signalTimers.forEach(timer => clearTimeout(timer));
      fixture.dispose();
    }
  });

  test('standalone default retains its captured signal shutdown behavior', async () => {
    const fixture = isolatedManager();
    try {
      fixture.manager.logEvent('standalone-event', 'synthetic-user', {});
      expect([...fixture.handlers.keys()]).toEqual(['SIGINT', 'SIGTERM', 'exit']);
      await fixture.handlers.get('SIGTERM')();
      expect(fixture.manager.isClosed).toBe(true);
      const reader = new SQLite(fixture.databasePath, { readonly: true });
      try {
        expect(reader.prepare('SELECT count(*) AS n FROM event_logs').get().n).toBe(1);
      } finally { reader.close(); }
    } finally { fixture.dispose(); }
  });
});
