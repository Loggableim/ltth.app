'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/stream-monsters/backend/streammonsters/game-engine');
const UnhatchedEggStealService = require('../plugins/stream-monsters/backend/streammonsters/unhatched-egg-steal-service');
const StreamMonstersViewerActivityTracker = require('../plugins/stream-monsters/backend/streammonsters/viewer-activity-tracker');
const FreeEggDropService = require('../plugins/stream-monsters/backend/streammonsters/free-egg-drop-service');
const PRODUCT_CONTRACT = require('../plugins/stream-monsters/product-contract.json');

function createDatabase() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

describe('Challenger M1-1: Milestone 1 Egg Economy & Hatch Progression Adversarial Harness', () => {

  // =========================================================================
  // Section 1: Hatch Timer Boundaries (Objective 3 & R2.1)
  // =========================================================================
  describe('Hatch Timer Boundaries', () => {
    test('Contract and schema defaults define default hatch duration as exactly 60,000 ms', () => {
      expect(PRODUCT_CONTRACT.defaults?.hatchDurationMs).toBe(60_000);
    });

    test('Engine default egg creation satisfies ready_at_ms - created_at_ms === 60_000', () => {
      const { sqlite, store } = createDatabase();
      try {
        const createdAtMs = 1_000_000;
        const engine = new StreamMonstersEngine({
          store,
          now: () => createdAtMs,
          config: {} // No explicit hatchDurationMs override; uses default
        });
        engine.setStreamKey('test-stream');
        store.upsertGiftMapping({
          giftId: 1,
          giftName: 'Rose',
          element: 'Ember',
          effect: 'spawn',
          enabled: true
        });

        const result = engine.processGift({
          userId: 'test-viewer',
          giftId: 1,
          eventKey: 'gift-event-1'
        });

        expect(result.type).toBe('spawned');
        const egg = result.egg;
        expect(egg).toBeDefined();
        expect(egg.created_at_ms).toBe(createdAtMs);
        expect(egg.hatch_duration_ms).toBe(60_000);
        expect(egg.ready_at_ms).toBe(createdAtMs + 60_000);
        expect(egg.ready_at_ms - egg.created_at_ms).toBe(60_000);
      } finally {
        sqlite.close();
      }
    });

    test('Free egg drop creation satisfies ready_at_ms - created_at_ms === 60_000', () => {
      const { sqlite, store } = createDatabase();
      try {
        const createdAtMs = 2_000_000;
        const engine = new StreamMonstersEngine({
          store,
          now: () => createdAtMs
        });
        engine.setStreamKey('test-stream');

        const dropService = new FreeEggDropService({
          store,
          engine,
          now: () => createdAtMs,
          config: { freeEggDropChance: 1.0, freeEggCooldownSeconds: 86_400 }
        });

        const firstChat = dropService.onFirstChat({
          userId: 'new-viewer',
          streamKey: 'test-stream',
          eventId: 'chat-event-1'
        });
        expect(firstChat.status).toBe('offered');

        const adopted = dropService.adopt({
          userId: 'new-viewer',
          streamKey: 'test-stream',
          eventId: 'adopt-event-1'
        });
        expect(adopted.status).toBe('claimed');

        const egg = adopted.egg;
        expect(egg).toBeDefined();
        expect(egg.created_at_ms).toBe(createdAtMs);
        expect(egg.hatch_duration_ms).toBe(60_000);
        expect(egg.ready_at_ms - egg.created_at_ms).toBe(60_000);
      } finally {
        sqlite.close();
      }
    });

    test('Charged egg variant scales hatch duration to 45,000 ms (0.75x multiplier)', () => {
      const { sqlite, store } = createDatabase();
      try {
        const createdAtMs = 3_000_000;
        const engine = new StreamMonstersEngine({
          store,
          now: () => createdAtMs
        });
        engine.setStreamKey('test-stream');
        store.upsertGiftMapping({
          giftId: 1,
          giftName: 'Rose',
          element: 'Ember',
          effect: 'spawn',
          enabled: true
        });

        // Seed charged egg via stream hype
        store.addStreamHype('test-stream', 100, createdAtMs);

        const result = engine.processGift({
          userId: 'charged-viewer',
          giftId: 1,
          eventKey: 'gift-charged'
        });

        expect(result.egg.variant).toBe('charged');
        expect(result.egg.hatch_duration_ms).toBe(45_000);
        expect(result.egg.ready_at_ms - result.egg.created_at_ms).toBe(45_000);
      } finally {
        sqlite.close();
      }
    });

    test('Egg state boundary: incubating at 59,999 ms, transitions to ready at exactly 60,000 ms', () => {
      const { sqlite, store } = createDatabase();
      try {
        let currentNow = 1_000_000;
        const engine = new StreamMonstersEngine({
          store,
          now: () => currentNow
        });
        engine.setStreamKey('test-stream');
        store.upsertGiftMapping({
          giftId: 1,
          giftName: 'Rose',
          element: 'Ember',
          effect: 'spawn',
          enabled: true
        });

        const result = engine.processGift({
          userId: 'hatching-viewer',
          giftId: 1,
          eventKey: 'gift-boundary'
        });
        const eggId = result.egg.egg_id;

        // At 59,999 ms: still incubating
        currentNow = 1_000_000 + 59_999;
        const markedBefore = engine.markReadyEggs();
        expect(markedBefore).toHaveLength(0);
        expect(store.getEgg(eggId).state).toBe('incubating');

        // At 60,000 ms: transitions to ready
        currentNow = 1_000_000 + 60_000;
        const markedAt = engine.markReadyEggs();
        expect(markedAt).toHaveLength(1);
        expect(store.getEgg(eggId).state).toBe('ready');
      } finally {
        sqlite.close();
      }
    });
  });

  // =========================================================================
  // Section 2: 12-Hour Inactivity Window Boundary Conditions (Objective 2 & R2.3)
  // =========================================================================
  describe('12-Hour Inactivity Window Boundary Conditions', () => {
    const TWELVE_HOURS_MS = 43_200_000;
    const GRACE_MS = 600_000; // 10 minutes

    test('UnhatchedEggStealService default activity window is exactly 43,200 seconds', () => {
      expect(UnhatchedEggStealService.DEFAULT_ACTIVITY_WINDOW_SECONDS).toBe(43_200);
      expect(UnhatchedEggStealService.DEFAULT_ACTIVITY_WINDOW_SECONDS * 1_000).toBe(TWELVE_HOURS_MS);
    });

    test('Exact boundary verification with inactivity predicate: not released at 43,199,999 ms, released at 43,200,000 ms', () => {
      const { sqlite, store } = createDatabase();
      try {
        const lastActiveMs = 1_000_000;
        let currentNow = lastActiveMs;

        // Inactivity predicate: viewer is active while elapsedMs < 43_200_000; becomes inactive at 43_200_000
        const isViewerActive = () => (currentNow - lastActiveMs) < TWELVE_HOURS_MS;

        const stealService = new UnhatchedEggStealService({
          store,
          now: () => currentNow,
          isViewerActive,
          config: {
            unhatchedEggStealEnabled: true,
            unhatchedEggStealGraceSeconds: 600,
            unhatchedEggStealActivityWindowSeconds: 43_200
          }
        });

        // Stage an egg whose 10-minute grace period has already elapsed by the 12-hour mark
        // Egg ready at 12h - 10m so that at 12h, eligible_at_ms <= nowMs and nowMs < hardStealAtMs
        const readyAtMs = (lastActiveMs + TWELVE_HOURS_MS) - GRACE_MS;
        const egg = store.createEgg({
          eggId: 'boundary-egg',
          userId: 'owner-idle',
          giftId: 1,
          giftName: 'Rose',
          element: 'Ember',
          eggColor: '#ff0000',
          seed: 'seed-b',
          state: 'ready',
          createdAtMs: readyAtMs - 60_000,
          hatchDurationMs: 60_000,
          readyAtMs,
          expiresAtMs: readyAtMs + 86_400_000,
          imageUrl: 'img',
          variant: 'standard',
          visualSource: 'egg_asset',
          visualKey: 'k',
          provenance: 'gift',
          displayName: 'Owner Idle'
        });
        stealService.observeReadyEgg('boundary-egg', { observedAtMs: readyAtMs });

        // Boundary 1: At elapsedMs = 43_199_999 ms: egg must NOT be released for steal
        currentNow = lastActiveMs + (TWELVE_HOURS_MS - 1);
        expect(isViewerActive()).toBe(true);
        const sweepBefore = stealService.sweep({ atMs: currentNow });
        expect(sweepBefore.published).toHaveLength(0);
        expect(stealService.listPublic(currentNow)).toHaveLength(0);

        // Boundary 2: At elapsedMs = 43_200,000 ms: egg MUST be released for steal
        currentNow = lastActiveMs + TWELVE_HOURS_MS;
        expect(isViewerActive()).toBe(false);
        const sweepAt = stealService.sweep({ atMs: currentNow });
        expect(sweepAt.published).toHaveLength(1);
        expect(sweepAt.published[0]).toEqual(expect.objectContaining({
          egg_id: 'boundary-egg',
          status: 'public'
        }));
        expect(stealService.listPublic(currentNow)).toEqual([
          expect.objectContaining({
            offerType: 'steal',
            state: 'public',
            adoptable: true
          })
        ]);
      } finally {
        sqlite.close();
      }
    });

    test('Viewer activity timestamp updates prevent steal release', () => {
      const { sqlite, store } = createDatabase();
      try {
        let lastActiveMs = 1_000_000;
        let currentNow = lastActiveMs;

        const isViewerActive = () => (currentNow - lastActiveMs) < TWELVE_HOURS_MS;

        const stealService = new UnhatchedEggStealService({
          store,
          now: () => currentNow,
          isViewerActive,
          config: {
            unhatchedEggStealEnabled: true,
            unhatchedEggStealGraceSeconds: 600,
            unhatchedEggStealActivityWindowSeconds: 43_200
          }
        });

        const readyAtMs = (lastActiveMs + TWELVE_HOURS_MS) - GRACE_MS;
        store.createEgg({
          eggId: 'activity-update-egg',
          userId: 'owner-chatting',
          giftId: 1,
          giftName: 'Rose',
          element: 'Ember',
          eggColor: '#ff0000',
          seed: 'seed-c',
          state: 'ready',
          createdAtMs: readyAtMs - 60_000,
          hatchDurationMs: 60_000,
          readyAtMs,
          expiresAtMs: readyAtMs + 86_400_000,
          imageUrl: 'img',
          variant: 'standard',
          visualSource: 'egg_asset',
          visualKey: 'k',
          provenance: 'gift',
          displayName: 'Owner Chatting'
        });
        stealService.observeReadyEgg('activity-update-egg', { observedAtMs: readyAtMs });

        // Viewer chats at 11h 50m, updating their activity timestamp
        currentNow = lastActiveMs + 42_600_000;
        lastActiveMs = currentNow; // Activity timestamp updated!

        // Now advance to the original 12h mark (43_200_000 from start)
        currentNow = 1_000_000 + TWELVE_HOURS_MS;
        // Elapsed since last active is only 600,000 ms << 43_200_000 ms
        expect(isViewerActive()).toBe(true);

        const sweepResult = stealService.sweep({ atMs: currentNow });
        // Egg must NOT be released for steal because viewer refreshed activity
        expect(sweepResult.published).toHaveLength(0);
        expect(stealService.listPublic(currentNow)).toHaveLength(0);
      } finally {
        sqlite.close();
      }
    });

    test('Empirical analysis of StreamMonstersViewerActivityTracker inclusive boundary (<=)', () => {
      let currentNow = 1_000_000;
      const tracker = new StreamMonstersViewerActivityTracker({
        now: () => currentNow,
        activeWindowMs: TWELVE_HOURS_MS
      });

      tracker.observe({
        userId: 'viewer-boundary',
        streamKey: 'stream-test',
        source: 'chat'
      });

      // At elapsed = 43_199_999 ms: active (true)
      expect(tracker.isActive({
        userId: 'viewer-boundary',
        streamKey: 'stream-test',
        nowMs: 1_000_000 + 43_199_999
      })).toBe(true);

      // At elapsed = 43_200_000 ms: tracker evaluates true due to elapsedMs <= activeWindowMs
      expect(tracker.isActive({
        userId: 'viewer-boundary',
        streamKey: 'stream-test',
        nowMs: 1_000_000 + 43_200_000
      })).toBe(true);

      // At elapsed = 43_200_001 ms: tracker transitions to false
      expect(tracker.isActive({
        userId: 'viewer-boundary',
        streamKey: 'stream-test',
        nowMs: 1_000_000 + 43_200_001
      })).toBe(false);
    });

    test('Empirical analysis of MAXIMUM_GRACE_SECONDS (15-min hard deadline) interaction', () => {
      const { sqlite, store } = createDatabase();
      try {
        const readyAtMs = 1_000_000;
        store.createEgg({
          eggId: 'hard-deadline-egg',
          userId: 'continuously-active-viewer',
          giftId: 1,
          giftName: 'Rose',
          element: 'Ember',
          eggColor: '#ff0000',
          seed: 'seed-h',
          state: 'ready',
          createdAtMs: readyAtMs - 60_000,
          hatchDurationMs: 60_000,
          readyAtMs,
          expiresAtMs: readyAtMs + 86_400_000,
          imageUrl: 'img',
          variant: 'standard',
          visualSource: 'egg_asset',
          visualKey: 'k',
          provenance: 'gift',
          displayName: 'Active Viewer'
        });

        const stealService = new UnhatchedEggStealService({
          store,
          now: () => 1_000_000,
          isViewerActive: () => true, // Viewer is continuously active!
          config: {
            unhatchedEggStealEnabled: true,
            unhatchedEggStealGraceSeconds: 600,
            unhatchedEggStealActivityWindowSeconds: 43_200
          }
        });
        stealService.observeReadyEgg('hard-deadline-egg', { observedAtMs: readyAtMs });

        // At 14 minutes: protected by active status (between 10m and 15m)
        const sweep14m = stealService.sweep({ atMs: readyAtMs + 840_000 });
        expect(sweep14m.published).toHaveLength(0);

        // At 15m + 1ms (900_001 ms after ready): hard deadline triggers
        // Egg is published regardless of viewer active state
        const sweep15m = stealService.sweep({ atMs: readyAtMs + 900_001 });
        expect(sweep15m.published).toHaveLength(1);
      } finally {
        sqlite.close();
      }
    });
  });

  // =========================================================================
  // Section 3: Adversarial Stress & Race Condition Testing (Objective 1)
  // =========================================================================
  describe('Adversarial Stress & Concurrency Testing', () => {
    test('High-concurrency steal race: 50 competing claimants resolve to exactly 1 success', () => {
      const { sqlite, store } = createDatabase();
      try {
        const readyAtMs = 1_000_000;
        store.createEgg({
          eggId: 'race-egg',
          userId: 'original-owner',
          giftId: 1,
          giftName: 'Rose',
          element: 'Ember',
          eggColor: '#ff0000',
          seed: 'seed-race',
          state: 'ready',
          createdAtMs: readyAtMs - 60_000,
          hatchDurationMs: 60_000,
          readyAtMs,
          expiresAtMs: readyAtMs + 86_400_000,
          imageUrl: 'img',
          variant: 'standard',
          visualSource: 'egg_asset',
          visualKey: 'k',
          provenance: 'gift',
          displayName: 'Original Owner'
        });

        const stealService = new UnhatchedEggStealService({
          store,
          now: () => readyAtMs + 700_000,
          isViewerActive: () => false,
          config: { unhatchedEggStealEnabled: true, unhatchedEggStealGraceSeconds: 600 }
        });
        stealService.observeReadyEgg('race-egg', { observedAtMs: readyAtMs });
        stealService.sweep({ atMs: readyAtMs + 700_000 });

        // 50 competing thieves attempt to steal at the exact same instant
        const results = [];
        for (let i = 1; i <= 50; i++) {
          results.push(stealService.steal({
            userId: `thief-${i}`,
            streamKey: 'stream-race',
            eventId: `claim-race-${i}`,
            displayName: `Thief ${i}`,
            nowMs: readyAtMs + 700_000
          }));
        }

        const successes = results.filter(r => r.success);
        const failures = results.filter(r => !r.success);

        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(49);
        expect(successes[0].status).toBe('claimed');
        failures.forEach(f => expect(f.status).toBe('no_steal'));

        // DB state consistency
        const updatedEgg = store.getEgg('race-egg');
        expect(updatedEgg.user_id).toBe('thief-1');
        expect(updatedEgg.user_id).not.toBe('original-owner');
      } finally {
        sqlite.close();
      }
    });

    test('Idempotent steal replay: same eventId returns duplicate receipt with same outcome', () => {
      const { sqlite, store } = createDatabase();
      try {
        const readyAtMs = 1_000_000;
        store.createEgg({
          eggId: 'idempotent-egg',
          userId: 'owner-orig',
          giftId: 1,
          giftName: 'Rose',
          element: 'Ember',
          eggColor: '#ff0000',
          seed: 'seed-idemp',
          state: 'ready',
          createdAtMs: readyAtMs - 60_000,
          hatchDurationMs: 60_000,
          readyAtMs,
          expiresAtMs: readyAtMs + 86_400_000,
          imageUrl: 'img',
          variant: 'standard',
          visualSource: 'egg_asset',
          visualKey: 'k',
          provenance: 'gift',
          displayName: 'Owner'
        });

        const stealService = new UnhatchedEggStealService({
          store,
          now: () => readyAtMs + 700_000,
          isViewerActive: () => false,
          config: { unhatchedEggStealEnabled: true, unhatchedEggStealGraceSeconds: 600 }
        });
        stealService.observeReadyEgg('idempotent-egg', { observedAtMs: readyAtMs });
        stealService.sweep({ atMs: readyAtMs + 700_000 });

        const firstClaim = stealService.steal({
          userId: 'thief-idemp',
          streamKey: 'stream-1',
          eventId: 'same-event-id-123',
          nowMs: readyAtMs + 700_000
        });
        expect(firstClaim.success).toBe(true);

        // Replay identical claim
        const replayClaim = stealService.steal({
          userId: 'thief-idemp',
          streamKey: 'stream-1',
          eventId: 'same-event-id-123',
          nowMs: readyAtMs + 700_000
        });

        expect(replayClaim).toEqual(firstClaim);
      } finally {
        sqlite.close();
      }
    });

    test('Original owner cannot steal their own egg', () => {
      const { sqlite, store } = createDatabase();
      try {
        const readyAtMs = 1_000_000;
        store.createEgg({
          eggId: 'self-steal-egg',
          userId: 'owner-self',
          giftId: 1,
          giftName: 'Rose',
          element: 'Ember',
          eggColor: '#ff0000',
          seed: 'seed-self',
          state: 'ready',
          createdAtMs: readyAtMs - 60_000,
          hatchDurationMs: 60_000,
          readyAtMs,
          expiresAtMs: readyAtMs + 86_400_000,
          imageUrl: 'img',
          variant: 'standard',
          visualSource: 'egg_asset',
          visualKey: 'k',
          provenance: 'gift',
          displayName: 'Self Owner'
        });

        const stealService = new UnhatchedEggStealService({
          store,
          now: () => readyAtMs + 700_000,
          isViewerActive: () => false,
          config: { unhatchedEggStealEnabled: true, unhatchedEggStealGraceSeconds: 600 }
        });
        stealService.observeReadyEgg('self-steal-egg', { observedAtMs: readyAtMs });
        stealService.sweep({ atMs: readyAtMs + 700_000 });

        const selfAttempt = stealService.steal({
          userId: 'owner-self',
          streamKey: 'stream-1',
          eventId: 'self-attempt',
          nowMs: readyAtMs + 700_000
        });

        expect(selfAttempt.success).toBe(false);
        expect(selfAttempt.status).toBe('no_steal');
        expect(store.getEgg('self-steal-egg').user_id).toBe('owner-self');
      } finally {
        sqlite.close();
      }
    });

    test('Egg hatched by owner immediately closes steal offer and prevents transfer', () => {
      const { sqlite, store } = createDatabase();
      try {
        let currentNow = 1_000_000;
        const engine = new StreamMonstersEngine({
          store,
          now: () => currentNow,
          config: { hatchDurationMs: 60_000 }
        });
        engine.setStreamKey('stream-1');
        store.upsertGiftMapping({ giftId: 1, giftName: 'Rose', element: 'Ember', effect: 'spawn', enabled: true });

        const giftRes = engine.processGift({ userId: 'hatching-owner', giftId: 1, eventKey: 'k-hatch' });
        const eggId = giftRes.egg.egg_id;

        const stealService = new UnhatchedEggStealService({
          store,
          now: () => currentNow,
          isViewerActive: () => false,
          config: { unhatchedEggStealEnabled: true, unhatchedEggStealGraceSeconds: 600 }
        });

        currentNow = 1_060_000;
        engine.markReadyEggs();
        stealService.observeReadyEgg(eggId, { observedAtMs: currentNow });

        // Advance past grace to make public
        currentNow = 1_060_000 + 700_000;
        const sweep = stealService.sweep({ atMs: currentNow });
        expect(sweep.published).toHaveLength(1);

        // Owner hatches the egg
        engine.hatchEgg('hatching-owner', 1);
        expect(store.getEgg(eggId).state).toBe('hatched');

        // Thief attempts to steal hatched egg
        const stealAttempt = stealService.steal({
          userId: 'late-thief',
          streamKey: 'stream-1',
          eventId: 'steal-hatched',
          nowMs: currentNow + 1_000
        });

        expect(stealAttempt.success).toBe(false);
        expect(stealAttempt.status).toBe('no_steal');

        // steal() automatically executed closeUnavailable, closing the record with owner_hatched
        expect(stealService.getStealForEgg(eggId)).toEqual(expect.objectContaining({
          status: 'closed',
          close_reason: 'owner_hatched'
        }));
      } finally {
        sqlite.close();
      }
    });

    test('Fresh owner grace protects newly stolen egg from immediate re-theft', () => {
      const { sqlite, store } = createDatabase();
      try {
        const readyAtMs = 1_000_000;
        store.createEgg({
          eggId: 're-theft-egg',
          userId: 'victim',
          giftId: 1,
          giftName: 'Rose',
          element: 'Ember',
          eggColor: '#ff0000',
          seed: 'seed-re',
          state: 'ready',
          createdAtMs: readyAtMs - 60_000,
          hatchDurationMs: 60_000,
          readyAtMs,
          expiresAtMs: readyAtMs + 86_400_000,
          imageUrl: 'img',
          variant: 'standard',
          visualSource: 'egg_asset',
          visualKey: 'k',
          provenance: 'gift',
          displayName: 'Victim'
        });

        const stealService = new UnhatchedEggStealService({
          store,
          now: () => readyAtMs + 700_000,
          isViewerActive: () => false,
          config: { unhatchedEggStealEnabled: true, unhatchedEggStealGraceSeconds: 600 }
        });
        stealService.observeReadyEgg('re-theft-egg', { observedAtMs: readyAtMs });
        stealService.sweep({ atMs: readyAtMs + 700_000 });

        // Thief 1 steals the egg at 1_700_000
        const steal1 = stealService.steal({
          userId: 'thief-1',
          streamKey: 'stream-1',
          eventId: 'theft-1',
          nowMs: readyAtMs + 700_000
        });
        expect(steal1.success).toBe(true);

        // Thief 1 now has 10 minutes of fresh grace
        // Thief 2 attempts to steal 1 second later
        const steal2 = stealService.steal({
          userId: 'thief-2',
          streamKey: 'stream-1',
          eventId: 'theft-2',
          nowMs: readyAtMs + 700_001
        });
        expect(steal2.success).toBe(false);
        expect(steal2.status).toBe('no_steal');

        // Check pending steal record for newly stolen egg
        const stealRecord = stealService.getStealForEgg('re-theft-egg');
        expect(stealRecord.status).toBe('pending');
        expect(stealRecord.original_owner_id).toBe('thief-1');
        expect(stealRecord.eligible_at_ms).toBe((readyAtMs + 700_000) + 600_000);
      } finally {
        sqlite.close();
      }
    });
  });
});
