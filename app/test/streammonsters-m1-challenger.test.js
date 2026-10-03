'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/stream-monsters/backend/streammonsters/game-engine');
const FreeEggDropService = require('../plugins/stream-monsters/backend/streammonsters/free-egg-drop-service');
const ProgressionService = require('../plugins/stream-monsters/backend/streammonsters/progression-service');
const ViewerRetentionService = require('../plugins/stream-monsters/backend/streammonsters/viewer-retention-service');
const UnhatchedEggStealService = require('../plugins/stream-monsters/backend/streammonsters/unhatched-egg-steal-service');
const StreamAlchemyPlugin = require('../plugins/stream-monsters');
const PRODUCT_CONTRACT = require('../plugins/stream-monsters/product-contract.json');
const creatorRuntime = require('../plugins/stream-monsters/streammonsters-creator-runtime');

const activeServices = new Set();

function trackService(service) {
  activeServices.add(service);
  return service;
}

afterEach(() => {
  for (const service of activeServices) {
    try { service.destroy(); } catch (_) {}
  }
  activeServices.clear();
});

async function removeTempDirectory(dir) {
  for (let i = 0; i < 20; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (err.code !== 'EBUSY' || i === 19) throw err;
      await new Promise(r => setTimeout(r, 25));
    }
  }
}

function createSubject({ now = 1_000, config = {}, engineConfig = {} } = {}) {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  const emitted = [];
  let currentNow = now;
  const progression = new ProgressionService({
    store,
    now: () => new Date(currentNow)
  });
  const engine = new StreamMonstersEngine({
    store,
    progression,
    now: () => currentNow,
    config: {
      hatchDurationMs: 60_000,
      eggExpiryMs: 86_400_000,
      ...engineConfig
    }
  });
  engine.setStreamKey('stream:challenger-1');
  const service = trackService(new FreeEggDropService({
    store,
    engine,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentNow,
    config
  })).start();
  return {
    sqlite,
    store,
    engine,
    progression,
    service,
    emitted,
    now: () => currentNow,
    setNow(val) { currentNow = val; },
    advance(delta) { currentNow += delta; return currentNow; }
  };
}

describe('Challenger M1-2 Empirical Stress Harness', () => {

  // =========================================================================
  // OBJECTIVE 1: First-Chat Free Egg Qualification & Determinism
  // =========================================================================
  describe('Objective 1A: Deterministic Qualification on First Chat', () => {
    test('deterministic qualification creates exact reserved offer with valid timestamps', () => {
      const subject = createSubject({ now: 10_000 });
      const res = subject.service.onFirstChat({
        userId: 'viewer-deterministic',
        streamKey: 'stream:challenger-1',
        eventId: 'event-first-chat-1',
        displayName: 'Deterministic Viewer',
        nowMs: 10_000
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('offered');
      expect(res.offerId).toBeTruthy();
      expect(res.offer).toEqual(expect.objectContaining({
        stream_key: 'stream:challenger-1',
        source_user_id: 'viewer-deterministic',
        source_display_name: 'Deterministic Viewer',
        offered_at_ms: 10_000,
        reserved_until_ms: 70_000,          // 10_000 + 60_000 reservation
        public_expires_at_ms: 370_000,      // 70_000 + 300_000 public window
        status: 'reserved',
        stage_state: 'reserved',
        variant: 'standard'
      }));

      // Verify event table record
      const eventRecord = subject.store.getFreeEggEvent('event-first-chat-1');
      expect(eventRecord).toEqual(expect.objectContaining({
        success: true,
        status: 'offered',
        offerId: res.offerId
      }));

      // Verify database table persistence
      const row = subject.store.db.prepare(
        'SELECT * FROM streammonsters_free_egg_offers WHERE offer_id = ?'
      ).get(res.offerId);
      expect(row).toBeDefined();
      expect(row.status).toBe('reserved');
      expect(row.source_user_id).toBe('viewer-deterministic');
    });

    test('validates and rejects empty/malformed inputs safely without corrupting store', () => {
      const subject = createSubject({ now: 10_000 });

      expect(() => subject.service.onFirstChat({
        userId: '',
        eventId: 'evt-1'
      })).toThrow('STREAM_MONSTERS_USER_REQUIRED');

      expect(() => subject.service.onFirstChat({
        userId: '   ',
        eventId: 'evt-1'
      })).toThrow('STREAM_MONSTERS_USER_REQUIRED');

      expect(() => subject.service.onFirstChat({
        userId: 'viewer-1',
        eventId: ''
      })).toThrow('STREAM_MONSTERS_EVENT_REQUIRED');

      expect(() => subject.service.onFirstChat({
        userId: 'viewer-1',
        eventId: '   '
      })).toThrow('STREAM_MONSTERS_EVENT_REQUIRED');

      // Database should remain clean
      const offersCount = subject.store.db.prepare(
        'SELECT COUNT(*) as count FROM streammonsters_free_egg_offers'
      ).get().count;
      expect(offersCount).toBe(0);
    });

    test('multi-viewer sequential first-chat qualification generates 50 distinct isolated offers', () => {
      const subject = createSubject({ now: 50_000 });
      for (let i = 0; i < 50; i++) {
        const res = subject.service.onFirstChat({
          userId: `viewer-${i}`,
          streamKey: 'stream:challenger-1',
          eventId: `evt-chat-${i}`,
          displayName: `Viewer ${i}`,
          nowMs: 50_000 + i * 10
        });
        expect(res.success).toBe(true);
        expect(res.status).toBe('offered');
      }

      const allOffers = subject.store.getFreeEggOffers('stream:challenger-1');
      expect(allOffers).toHaveLength(50);
      const userIds = new Set(allOffers.map(o => o.source_user_id));
      expect(userIds.size).toBe(50);
    });
  });

  // =========================================================================
  // OBJECTIVE 1: 24-Hour Cooldown Persistence in streammonsters_free_egg_cooldowns
  // =========================================================================
  describe('Objective 1B: 24-Hour Cooldown Persistence & Enforcement', () => {
    test('cooldown row persists in streammonsters_free_egg_cooldowns and survives SQLite close/reopen', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-cooldown-'));
      const dbPath = path.join(dir, 'test-cooldown.sqlite');
      const claimTimestamp = 1_000_000;
      const expectedCooldownExpiry = claimTimestamp + 86_400_000; // 24h = 86,400,000 ms

      // Step 1: Open DB, create claim, verify cooldown table
      let sqlite = new Database(dbPath);
      sqlite.pragma('foreign_keys = ON');
      let store = new StreamMonstersDatabase(sqlite);
      store.initialize();
      let engine = new StreamMonstersEngine({
        store,
        now: () => claimTimestamp,
        config: { hatchDurationMs: 60_000 }
      });
      engine.setStreamKey('stream:day-1');
      let service = trackService(new FreeEggDropService({
        store,
        engine,
        now: () => claimTimestamp,
        config: { freeEggCooldownSeconds: 86_400 }
      })).start();

      const offerRes = service.onFirstChat({
        userId: 'viewer-persistent',
        streamKey: 'stream:day-1',
        eventId: 'chat-evt-1',
        displayName: 'Persistent Viewer',
        nowMs: claimTimestamp
      });
      expect(offerRes.success).toBe(true);

      const adoptRes = service.adopt({
        userId: 'viewer-persistent',
        streamKey: 'stream:day-1',
        eventId: 'adopt-evt-1',
        nowMs: claimTimestamp
      });
      expect(adoptRes.success).toBe(true);
      expect(adoptRes.status).toBe('claimed');

      // Verify cooldown table row exists
      const cooldownRow = sqlite.prepare(
        'SELECT * FROM streammonsters_free_egg_cooldowns WHERE user_id = ?'
      ).get('viewer-persistent');
      expect(cooldownRow).toBeDefined();
      expect(cooldownRow.user_id).toBe('viewer-persistent');
      expect(cooldownRow.expires_at_ms).toBe(expectedCooldownExpiry);

      // Step 2: Full close of database connection (simulating app shutdown)
      service.destroy();
      sqlite.close();

      // Step 3: Reopen database from disk and inspect table
      sqlite = new Database(dbPath);
      sqlite.pragma('foreign_keys = ON');
      store = new StreamMonstersDatabase(sqlite);
      store.initialize();

      const restoredCooldownRow = sqlite.prepare(
        'SELECT * FROM streammonsters_free_egg_cooldowns WHERE user_id = ?'
      ).get('viewer-persistent');
      expect(restoredCooldownRow).toBeDefined();
      expect(restoredCooldownRow.expires_at_ms).toBe(expectedCooldownExpiry);

      // Step 4: Verify cooldown boundary rejection across streams (stream:day-2)
      engine = new StreamMonstersEngine({
        store,
        now: () => claimTimestamp + 86_399_999,
        config: { hatchDurationMs: 60_000 }
      });
      engine.setStreamKey('stream:day-2');
      service = trackService(new FreeEggDropService({
        store,
        engine,
        now: () => claimTimestamp + 86_399_999,
        config: { freeEggCooldownSeconds: 86_400 }
      })).start();

      // 1 millisecond before cooldown expires: MUST be rejected with remainingMs = 1
      const rejectRes = service.onFirstChat({
        userId: 'viewer-persistent',
        streamKey: 'stream:day-2',
        eventId: 'chat-boundary-before',
        nowMs: claimTimestamp + 86_399_999
      });
      expect(rejectRes.success).toBe(false);
      expect(rejectRes.status).toBe('cooldown');
      expect(rejectRes.remainingMs).toBe(1);

      // Exactly at cooldown expiry: MUST be accepted on new stream!
      const acceptRes = service.onFirstChat({
        userId: 'viewer-persistent',
        streamKey: 'stream:day-2',
        eventId: 'chat-boundary-exact',
        nowMs: claimTimestamp + 86_400_000
      });
      expect(acceptRes.success).toBe(true);
      expect(acceptRes.status).toBe('offered');

      service.destroy();
      sqlite.close();
      removeTempDirectory(dir);
    });

    test('viewer retention service protects users with active cooldowns from being purged', () => {
      const subject = createSubject({ now: 1_000 });
      const now = 200 * 86_400_000;

      // Touch retention for an idle user
      subject.store.touchViewerRetention('viewer-cooldown-protected', 1);
      // Insert active cooldown row
      subject.store.db.prepare(
        'INSERT INTO streammonsters_free_egg_cooldowns (user_id, expires_at_ms) VALUES (?, ?)'
      ).run('viewer-cooldown-protected', now + 86_400_000);

      const retentionService = new ViewerRetentionService({
        store: subject.store,
        now: () => now
      });
      retentionService.run();

      // Ensure user was NOT archived or purged
      const archived = subject.store.db.prepare(
        'SELECT * FROM streammonsters_viewer_archives WHERE user_id = ?'
      ).get('viewer-cooldown-protected');
      expect(archived).toBeUndefined();
    });

    test('cooldown row updates cleanly ON CONFLICT when next claim occurs on next stream after cooldown expires', () => {
      const subject = createSubject({ now: 1_000 });
      const claim1 = 1_000;
      const claim2 = claim1 + 86_400_000 + 10_000;

      // Claim 1 on stream:day-1
      subject.service.onFirstChat({
        userId: 'user-repeat',
        streamKey: 'stream:day-1',
        eventId: 'c1',
        nowMs: claim1
      });
      subject.service.adopt({
        userId: 'user-repeat',
        streamKey: 'stream:day-1',
        eventId: 'a1',
        nowMs: claim1
      });

      let cooldown = subject.store.db.prepare(
        'SELECT * FROM streammonsters_free_egg_cooldowns WHERE user_id = ?'
      ).get('user-repeat');
      expect(cooldown.expires_at_ms).toBe(claim1 + 86_400_000);

      // Advance past cooldown and claim 2 on stream:day-2
      subject.setNow(claim2);
      subject.engine.setStreamKey('stream:day-2');
      const secondOffer = subject.service.onFirstChat({
        userId: 'user-repeat',
        streamKey: 'stream:day-2',
        eventId: 'c2',
        nowMs: claim2
      });
      expect(secondOffer.success).toBe(true);
      expect(secondOffer.status).toBe('offered');

      const secondAdopt = subject.service.adopt({
        userId: 'user-repeat',
        streamKey: 'stream:day-2',
        eventId: 'a2',
        nowMs: claim2
      });
      expect(secondAdopt.success).toBe(true);
      expect(secondAdopt.status).toBe('claimed');

      cooldown = subject.store.db.prepare(
        'SELECT * FROM streammonsters_free_egg_cooldowns WHERE user_id = ?'
      ).get('user-repeat');
      expect(cooldown.expires_at_ms).toBe(claim2 + 86_400_000);
    });
  });

  // =========================================================================
  // OBJECTIVE 1: Rapid Duplicate Chat Claims & Concurrency Stress
  // =========================================================================
  describe('Objective 1C: Rapid Duplicate Chat Claims & Concurrency Stress', () => {
    test('rapid duplicate chat events with IDENTICAL eventId return exact idempotent cached receipt', () => {
      const subject = createSubject({ now: 10_000 });
      const first = subject.service.onFirstChat({
        userId: 'viewer-rapid',
        streamKey: 'stream:challenger-1',
        eventId: 'event-identical-chat',
        nowMs: 10_000
      });
      expect(first.success).toBe(true);

      for (let i = 0; i < 20; i++) {
        const dup = subject.service.onFirstChat({
          userId: 'viewer-rapid',
          streamKey: 'stream:challenger-1',
          eventId: 'event-identical-chat',
          nowMs: 10_000
        });
        expect(dup).toEqual(first);
      }

      const offers = subject.store.getFreeEggOffers('stream:challenger-1');
      expect(offers).toHaveLength(1);
    });

    test('rapid duplicate chat events with DIFFERENT eventIds from same user return already_offered', () => {
      const subject = createSubject({ now: 10_000 });
      const first = subject.service.onFirstChat({
        userId: 'viewer-spam',
        streamKey: 'stream:challenger-1',
        eventId: 'chat-evt-0',
        nowMs: 10_000
      });
      expect(first.success).toBe(true);
      expect(first.status).toBe('offered');

      for (let i = 1; i <= 20; i++) {
        const next = subject.service.onFirstChat({
          userId: 'viewer-spam',
          streamKey: 'stream:challenger-1',
          eventId: `chat-evt-${i}`,
          nowMs: 10_000 + i
        });
        expect(next.success).toBe(true);
        expect(next.status).toBe('already_offered');
        expect(next.offerId).toBe(first.offerId);
      }

      const offers = subject.store.getFreeEggOffers('stream:challenger-1');
      expect(offers).toHaveLength(1);
    });

    test('rapid duplicate adoption attempts mint exactly one egg and return no_offer for subsequent different eventIds', () => {
      const subject = createSubject({ now: 10_000 });
      subject.service.onFirstChat({
        userId: 'viewer-adopt-spam',
        streamKey: 'stream:challenger-1',
        eventId: 'chat-adopt-init',
        nowMs: 10_000
      });

      // First adopt succeeds
      const firstAdopt = subject.service.adopt({
        userId: 'viewer-adopt-spam',
        streamKey: 'stream:challenger-1',
        eventId: 'adopt-evt-1',
        nowMs: 10_000
      });
      expect(firstAdopt.success).toBe(true);
      expect(firstAdopt.status).toBe('claimed');

      // Immediate retry with identical eventId returns cached receipt
      const dupAdopt = subject.service.adopt({
        userId: 'viewer-adopt-spam',
        streamKey: 'stream:challenger-1',
        eventId: 'adopt-evt-1',
        nowMs: 10_000
      });
      expect(dupAdopt).toEqual(firstAdopt);

      // Subsequent adopt with different eventId returns no_offer
      for (let i = 2; i <= 10; i++) {
        const spamAdopt = subject.service.adopt({
          userId: 'viewer-adopt-spam',
          streamKey: 'stream:challenger-1',
          eventId: `adopt-evt-${i}`,
          nowMs: 10_000 + i
        });
        expect(spamAdopt.success).toBe(false);
        expect(spamAdopt.status).toBe('no_offer');
      }

      // Exactly 1 egg created
      const eggs = subject.store.getViewerEggs('viewer-adopt-spam');
      expect(eggs).toHaveLength(1);
    });

    test('multi-threaded OS workers concurrently claiming single released offer allows exactly 1 winner', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-worker-contention-'));
      const dbPath = path.join(dir, 'contention.sqlite');
      const sqlite = new Database(dbPath);
      sqlite.pragma('foreign_keys = ON');
      sqlite.pragma('busy_timeout = 5000');
      const store = new StreamMonstersDatabase(sqlite);
      store.initialize();
      const engine = new StreamMonstersEngine({
        store,
        now: () => 1_000,
        config: { hatchDurationMs: 60_000 }
      });
      engine.setStreamKey('stream:contention');
      const service = trackService(new FreeEggDropService({
        store,
        engine,
        now: () => 1_000
      }));

      // Create offer from source user
      service.onFirstChat({
        userId: 'source-creator',
        streamKey: 'stream:contention',
        eventId: 'chat-source',
        nowMs: 1_000
      });
      sqlite.close();

      // Worker source code contending for the released public egg at 61_000 ms
      const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const workerSource = `
        const { parentPort, workerData } = require('worker_threads');
        const Database = require(workerData.dbModule);
        const Store = require(workerData.storeModule);
        const Engine = require(workerData.engineModule);
        const Service = require(workerData.serviceModule);

        const db = new Database(workerData.dbPath);
        db.pragma('foreign_keys = ON');
        db.pragma('busy_timeout = 5000');
        const store = new Store(db);
        store.initialize();
        const engine = new Engine({
          store,
          now: () => 61_000,
          config: { hatchDurationMs: 60_000 }
        });
        engine.setStreamKey('stream:contention');
        const service = new Service({
          store,
          engine,
          now: () => 61_000
        });

        parentPort.postMessage({ ready: true });
        Atomics.wait(new Int32Array(workerData.gate), 0, 0);

        try {
          const res = service.adopt({
            userId: workerData.userId,
            streamKey: 'stream:contention',
            eventId: workerData.eventId,
            nowMs: 61_000
          });
          parentPort.postMessage({ result: res });
        } catch (err) {
          parentPort.postMessage({ error: err.message });
        } finally {
          db.close();
        }
      `;

      const attempts = 15;
      const workers = Array.from({ length: attempts }, (_, i) => {
        let resolveReady, resolveResult;
        const ready = new Promise(r => { resolveReady = r; });
        const result = new Promise(r => { resolveResult = r; });
        const w = new Worker(workerSource, {
          eval: true,
          workerData: {
            dbPath,
            gate,
            userId: `contender-${i}`,
            eventId: `evt-contend-${i}`,
            dbModule: require.resolve('better-sqlite3'),
            storeModule: require.resolve('../plugins/stream-monsters/backend/streammonsters/database'),
            engineModule: require.resolve('../plugins/stream-monsters/backend/streammonsters/game-engine'),
            serviceModule: require.resolve('../plugins/stream-monsters/backend/streammonsters/free-egg-drop-service')
          }
        });
        w.on('message', m => {
          if (m.ready) resolveReady();
          else if (m.result) resolveResult(m.result);
          else if (m.error) resolveResult({ error: m.error });
        });
        return { w, ready, result };
      });

      // Wait for all workers to be initialized
      await Promise.all(workers.map(x => x.ready));
      // Release gate simultaneously
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0, attempts);

      const results = await Promise.all(workers.map(x => x.result));
      await Promise.all(workers.map(x => x.w.terminate()));

      const successes = results.filter(r => r.success === true && r.status === 'claimed');
      const failures = results.filter(r => r.success === false && r.status === 'no_offer');
      const errors = results.filter(r => r.error);

      expect(errors).toHaveLength(0);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(attempts - 1);

      // Verify database integrity
      const verifyDb = new Database(dbPath);
      verifyDb.pragma('foreign_keys = ON');
      expect(verifyDb.prepare('SELECT COUNT(*) as c FROM streammonsters_eggs').get().c).toBe(1);
      expect(verifyDb.prepare('SELECT COUNT(*) as c FROM streammonsters_free_egg_claims').get().c).toBe(1);
      expect(verifyDb.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      verifyDb.close();

      await removeTempDirectory(dir);
    });
  });

  // =========================================================================
  // OBJECTIVE 2: Backward Compatibility with Existing Profiles & Databases
  // =========================================================================
  describe('Objective 2: Backward Compatibility with Existing Profiles & Databases', () => {
    test('fresh setup defaults hatchDurationMs to 60,000 ms', () => {
      const plugin = new StreamAlchemyPlugin({
        getConfig: () => ({}),
        setConfig: jest.fn()
      });
      const config = plugin.loadConfig({});
      expect(config.streamMonsters.hatchDurationMs).toBe(60_000);
      expect(PRODUCT_CONTRACT.defaults.hatchDurationMs).toBe(60_000);
    });

    test('preserves existing creator custom configurations without clobbering', () => {
      const plugin = new StreamAlchemyPlugin({
        getConfig: () => ({}),
        setConfig: jest.fn()
      });

      // Case 1: Legacy stored 90,000 ms
      const loaded90 = plugin.loadConfig({
        streamMonsters: { hatchDurationMs: 90_000 }
      });
      expect(loaded90.streamMonsters.hatchDurationMs).toBe(90_000);

      // Case 2: Custom stored 120,000 ms
      const loaded120 = plugin.loadConfig({
        streamMonsters: { hatchDurationMs: 120_000 }
      });
      expect(loaded120.streamMonsters.hatchDurationMs).toBe(120_000);

      // Case 3: Custom stored 30,000 ms
      const loaded30 = plugin.loadConfig({
        streamMonsters: { hatchDurationMs: 30_000 }
      });
      expect(loaded30.streamMonsters.hatchDurationMs).toBe(30_000);
    });

    test('existing database with pre-change eggs preserves original hatch timers and does not prematurely hatch', () => {
      const sqlite = new Database(':memory:');
      sqlite.pragma('foreign_keys = ON');
      const store = new StreamMonstersDatabase(sqlite);
      store.initialize();

      // Legacy egg created with 90,000 ms hatch duration at t=0 ms (ready at t=90,000 ms)
      store.createEgg({
        eggId: 'legacy-egg-90s',
        userId: 'viewer-legacy',
        giftId: 1,
        giftName: 'Rose',
        element: 'Ember',
        eggColor: '#ff0000',
        seed: 'seed-legacy',
        state: 'incubating',
        createdAtMs: 0,
        hatchDurationMs: 90_000,
        readyAtMs: 90_000,
        expiresAtMs: 86_400_000,
        variant: 'standard',
        provenance: 'gift',
        displayName: 'Legacy Viewer'
      });

      let currentNow = 0;
      new StreamMonstersEngine({
        store,
        now: () => currentNow,
        config: { hatchDurationMs: 60_000 } // new default!
      });

      // At t=60,000 ms: under the new default, an egg might be thought to hatch,
      // but this legacy egg has stored hatch_duration_ms = 90,000 and ready_at_ms = 90,000.
      currentNow = 60_000;
      let readyEggsAt60 = store.markReadyEggs(currentNow);
      expect(readyEggsAt60).toHaveLength(0);

      let egg = store.getEgg('legacy-egg-90s');
      expect(egg.state).toBe('incubating');
      expect(egg.hatch_duration_ms).toBe(90_000);
      expect(egg.ready_at_ms).toBe(90_000);

      // At t=90,000 ms: egg reaches its stored ready_at_ms and transitions to ready
      currentNow = 90_000;
      let readyEggsAt90 = store.markReadyEggs(currentNow);
      expect(readyEggsAt90).toHaveLength(1);
      expect(readyEggsAt90[0].egg_id).toBe('legacy-egg-90s');
      expect(readyEggsAt90[0].state).toBe('ready');

      sqlite.close();
    });

    test('new eggs created with 60s default calculate incubation and boosts correctly', () => {
      const subject = createSubject({ now: 10_000 });

      // Standard egg created at 10,000 ms
      const stdEgg = subject.engine.createFreeEgg({
        userId: 'viewer-std',
        createdAtMs: 10_000,
        offerId: 'offer-std'
      });
      expect(stdEgg.hatch_duration_ms).toBe(60_000);
      expect(stdEgg.ready_at_ms).toBe(70_000); // 10_000 + 60_000

      // Charged egg duration check: 60_000 * 0.75 = 45_000 ms
      const chargedDuration = subject.engine.hatchDurationFor('charged');
      expect(chargedDuration).toBe(45_000);

      // Inactive egg steal default activity window evaluates to 43,200s (12 hours)
      const stealService = new UnhatchedEggStealService({
        store: subject.store,
        now: subject.now
      });
      expect(stealService.config.activityWindowSeconds).toBe(43_200);
    });

    test('creator runtime UI helpers correctly hydrate and normalize presets', () => {
      // Test payload normalization
      const normalizedFresh = creatorRuntime.buildConfigPayload({
        currentConfig: {},
        values: {}
      });
      expect(normalizedFresh.hatchDurationMs).toBe(60_000);
      expect(normalizedFresh.unhatchedEggStealActivityWindowSeconds).toBe(43_200);

      // Test preset selection preserved
      const normalizedCustom = creatorRuntime.buildConfigPayload({
        currentConfig: { hatchDurationMs: 120_000 },
        values: { hatchDurationMs: 120_000 }
      });
      expect(normalizedCustom.hatchDurationMs).toBe(120_000);
    });
  });
});
