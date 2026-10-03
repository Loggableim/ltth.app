'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const Database = require('better-sqlite3');

const StreamMonstersDatabase = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);
const StreamMonstersEngine = require(
  '../plugins/stream-monsters/backend/streammonsters/game-engine'
);
const StreamMonstersCommandIngress = require(
  '../plugins/stream-monsters/backend/streammonsters/command-ingress'
);

function createStore(filename = ':memory:') {
  const sqlite = new Database(filename);
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

describe('Stream Monsters Command Ingress & SQLite Concurrency Reliability (R3)', () => {
  describe('SQLite Busy Timeout and Transaction Retry Loop', () => {
    test('busy_timeout pragma is configured to 5000ms upon construction and initialize', () => {
      const sqlite = new Database(':memory:');
      let pragmaCalls = [];
      const originalPragma = sqlite.pragma.bind(sqlite);
      sqlite.pragma = function (sql, ...args) {
        pragmaCalls.push(sql);
        return originalPragma(sql, ...args);
      };

      const store = new StreamMonstersDatabase(sqlite);
      expect(pragmaCalls).toContain('busy_timeout = 5000');

      pragmaCalls = [];
      store.initialize();
      expect(pragmaCalls).toContain('busy_timeout = 5000');
      sqlite.close();
    });

    test('runTransaction retries on SQLITE_BUSY error and succeeds within retry limit', () => {
      const { sqlite, store } = createStore();
      let attempts = 0;
      const commitLog = [];

      store.afterCommit(() => {
        commitLog.push('committed');
      });

      const result = store.runTransaction(() => {
        attempts += 1;
        if (attempts < 3) {
          const busyError = new Error('database is locked');
          busyError.code = 'SQLITE_BUSY';
          throw busyError;
        }
        return 'success';
      }, true);

      expect(result).toBe('success');
      expect(attempts).toBe(3);
      expect(store.transactionDepth).toBe(0);
      expect(store.afterCommitCallbacks).toBeNull();
      sqlite.close();
    });

    test('runTransaction rethrows when busy retries are exhausted after 5 retries', () => {
      const { sqlite, store } = createStore();
      let attempts = 0;

      expect(() => {
        store.runTransaction(() => {
          attempts += 1;
          const busyError = new Error('database is locked');
          busyError.code = 'SQLITE_BUSY';
          throw busyError;
        }, false, { maxRetries: 5, baseBackoffMs: 2 });
      }).toThrow(/database is locked/);

      // Initial attempt (0) + 5 retries = 6 total executions
      expect(attempts).toBe(6);
      expect(store.transactionDepth).toBe(0);
      expect(store.afterCommitCallbacks).toBeNull();
      sqlite.close();
    });

    test('runTransaction does not retry on non-busy SQL errors', () => {
      const { sqlite, store } = createStore();
      let attempts = 0;

      expect(() => {
        store.runTransaction(() => {
          attempts += 1;
          throw new Error('UNIQUE constraint failed');
        }, true);
      }).toThrow(/UNIQUE constraint failed/);

      expect(attempts).toBe(1);
      expect(store.transactionDepth).toBe(0);
      sqlite.close();
    });

    test('nested transaction inherits parent depth without starting a nested retry loop', () => {
      const { sqlite, store } = createStore();
      let outerExecutions = 0;
      let innerExecutions = 0;

      const result = store.runInImmediateTransaction(() => {
        outerExecutions += 1;
        expect(store.transactionDepth).toBe(1);

        const inner = store.runInTransaction(() => {
          innerExecutions += 1;
          expect(store.transactionDepth).toBe(1);
          return 42;
        });

        return inner * 2;
      });

      expect(result).toBe(84);
      expect(outerExecutions).toBe(1);
      expect(innerExecutions).toBe(1);
      expect(store.transactionDepth).toBe(0);
      sqlite.close();
    });
  });

  describe('Gift Batch Ingress Immediate Transactions & Concurrency', () => {
    test('processGift and processGiftBatch execute in immediate transaction mode', () => {
      const { sqlite, store } = createStore();
      store.upsertGiftMapping({
        giftId: 10,
        giftName: 'Rose',
        element: 'Ember',
        effect: 'spawn',
        enabled: true
      });

      const engine = new StreamMonstersEngine({
        store,
        emit: () => {},
        now: () => 1_000,
        config: { hatchDurationMs: 60_000 }
      });
      engine.setStreamKey('creator:concurrency-test');

      let immediateTransactionCount = 0;
      const originalRunInImmediate = store.runInImmediateTransaction.bind(store);
      store.runInImmediateTransaction = function (operation, options) {
        immediateTransactionCount += 1;
        return originalRunInImmediate(operation, options);
      };

      const singleGift = engine.processGift({
        userId: 'viewer-gift-1',
        giftId: 10,
        giftName: 'Rose',
        eventKey: 'event:single:1'
      });
      expect(singleGift.type).toBe('spawned');
      expect(immediateTransactionCount).toBe(1);

      const batchGift = engine.processGiftBatch({
        userId: 'viewer-gift-2',
        giftId: 10,
        giftName: 'Rose',
        repeatCount: 5,
        eventKey: 'event:batch:1'
      });
      expect(batchGift.processedCount).toBe(5);
      expect(immediateTransactionCount).toBe(2);
      sqlite.close();
    });

    test('concurrent gift processing across worker threads operates without deadlocks in WAL mode', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-gift-concurrency-'));
      const dbPath = path.join(tempDir, 'gifts_wal.sqlite');

      const mainSqlite = new Database(dbPath);
      mainSqlite.pragma('journal_mode = WAL');
      mainSqlite.pragma('busy_timeout = 5000');
      const mainStore = new StreamMonstersDatabase(mainSqlite);
      mainStore.initialize();
      mainStore.upsertGiftMapping({
        giftId: 99,
        giftName: 'Fireworks',
        element: 'Volt',
        effect: 'spawn',
        enabled: true
      });
      mainSqlite.close();

      const workerSource = `
        const { parentPort, workerData } = require('worker_threads');
        const Database = require(workerData.sqliteModule);
        const Store = require(workerData.storeModule);
        const Engine = require(workerData.engineModule);

        const sqlite = new Database(workerData.dbPath);
        sqlite.pragma('journal_mode = WAL');
        sqlite.pragma('busy_timeout = 5000');
        const store = new Store(sqlite);
        const engine = new Engine({
          store,
          emit: () => {},
          now: () => workerData.nowMs,
          config: { hatchDurationMs: 60_000 }
        });
        engine.setStreamKey('stream:shared');

        try {
          const result = engine.processGiftBatch({
            userId: workerData.userId,
            giftId: 99,
            giftName: 'Fireworks',
            repeatCount: workerData.repeatCount,
            eventKey: workerData.eventKey
          });
          sqlite.close();
          parentPort.postMessage({ ok: true, result });
        } catch (error) {
          sqlite.close();
          parentPort.postMessage({ ok: false, error: error.message });
        }
      `;

      const runWorker = (workerData) => new Promise((resolve, reject) => {
        const worker = new Worker(workerSource, { eval: true, workerData });
        worker.once('message', resolve);
        worker.once('error', reject);
      });

      const baseData = {
        dbPath,
        sqliteModule: require.resolve('better-sqlite3'),
        storeModule: require.resolve('../plugins/stream-monsters/backend/streammonsters/database'),
        engineModule: require.resolve('../plugins/stream-monsters/backend/streammonsters/game-engine'),
        nowMs: 100_000
      };

      try {
        const promises = [
          runWorker({ ...baseData, userId: 'concurrent-user-1', repeatCount: 4, eventKey: 'evt-c-1' }),
          runWorker({ ...baseData, userId: 'concurrent-user-2', repeatCount: 4, eventKey: 'evt-c-2' }),
          runWorker({ ...baseData, userId: 'concurrent-user-3', repeatCount: 4, eventKey: 'evt-c-3' })
        ];

        const outcomes = await Promise.all(promises);
        for (const outcome of outcomes) {
          expect(outcome.ok).toBe(true);
          expect(outcome.result.processedCount).toBe(4);
        }

        const verifyDb = new Database(dbPath);
        const eggCount = verifyDb.prepare('SELECT COUNT(*) as cnt FROM streammonsters_eggs').get().cnt;
        expect(eggCount).toBe(12);
        verifyDb.close();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Command Ingress Fingerprint Deduplication Reliability', () => {
    test('fingerprints generate identical deterministic event IDs for identical rapid chat messages', async () => {
      const { sqlite, store } = createStore();
      let executionCount = 0;
      const ingress = new StreamMonstersCommandIngress({
        execute: async () => {
          executionCount += 1;
          return { success: true, status: 'hatched' };
        },
        emit: () => {},
        resolveUserId: data => data.userId,
        claimEvent: input => store.claimCommandIngressEvent(input),
        now: () => 1_000
      });

      ingress.setCommands([{
        name: 'hatch',
        commandName: 'hatch',
        minArgs: 0,
        maxArgs: 1,
        cooldown: { user: 0, global: 0 }
      }], '!');

      const chatPayload = {
        userId: 'burst-viewer',
        comment: '!hatch',
        createTime: 1_700_000_999
      };

      // Rapid arrival simulating dual-pathway or duplicate webhook delivery
      const res1 = await ingress.handleFallback(chatPayload);
      const res2 = await ingress.handleFallback(chatPayload);

      expect(res1.success).toBe(true);
      expect(res2).toEqual({
        success: true,
        handled: true,
        status: 'duplicate_event',
        duplicate: true,
        suppressed: true
      });
      expect(executionCount).toBe(1);

      const rows = sqlite.prepare('SELECT * FROM streammonsters_command_ingress_events').all();
      expect(rows).toHaveLength(1);
      expect(rows[0].event_id).toMatch(/^command:tiktok:time:/);
      sqlite.close();
    });

    test('concurrent command ingress claims across worker threads ensure mutual exclusion', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-ingress-concurrency-'));
      const dbPath = path.join(tempDir, 'ingress_wal.sqlite');

      const mainSqlite = new Database(dbPath);
      mainSqlite.pragma('journal_mode = WAL');
      mainSqlite.pragma('busy_timeout = 5000');
      const mainStore = new StreamMonstersDatabase(mainSqlite);
      mainStore.initialize();
      mainSqlite.close();

      const workerSource = `
        const { parentPort, workerData } = require('worker_threads');
        const Database = require(workerData.sqliteModule);
        const Store = require(workerData.storeModule);

        const sqlite = new Database(workerData.dbPath);
        sqlite.pragma('journal_mode = WAL');
        sqlite.pragma('busy_timeout = 5000');
        const store = new Store(sqlite);

        const claim = store.claimCommandIngressEvent({
          eventId: workerData.eventId,
          commandName: 'hatch',
          userId: workerData.userId,
          transport: workerData.transport,
          createdAtMs: workerData.nowMs
        });
        sqlite.close();
        parentPort.postMessage(claim);
      `;

      const runWorker = (workerData) => new Promise((resolve, reject) => {
        const worker = new Worker(workerSource, { eval: true, workerData });
        worker.once('message', resolve);
        worker.once('error', reject);
      });

      const commonData = {
        dbPath,
        sqliteModule: require.resolve('better-sqlite3'),
        storeModule: require.resolve('../plugins/stream-monsters/backend/streammonsters/database'),
        eventId: 'command:tiktok:time:deterministic-shared-event-id',
        userId: 'racing-user',
        nowMs: 50_000
      };

      try {
        const results = await Promise.all([
          runWorker({ ...commonData, transport: 'fallback' }),
          runWorker({ ...commonData, transport: 'gcce' }),
          runWorker({ ...commonData, transport: 'fallback' })
        ]);

        const claimedCount = results.filter(r => r.claimed).length;
        const rejectedCount = results.filter(r => !r.claimed).length;

        expect(claimedCount).toBe(1);
        expect(rejectedCount).toBe(2);

        const verifyDb = new Database(dbPath);
        const count = verifyDb.prepare(
          'SELECT COUNT(*) as cnt FROM streammonsters_command_ingress_events'
        ).get().cnt;
        expect(count).toBe(1);
        verifyDb.close();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
