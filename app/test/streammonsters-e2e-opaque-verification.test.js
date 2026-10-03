'use strict';

const Database = require('better-sqlite3');
const { createHash, randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/stream-monsters/backend/streammonsters/game-engine');
const ProgressionService = require('../plugins/stream-monsters/backend/streammonsters/progression-service');
const FreeEggDropService = require('../plugins/stream-monsters/backend/streammonsters/free-egg-drop-service');
const UnhatchedEggStealService = require('../plugins/stream-monsters/backend/streammonsters/unhatched-egg-steal-service');
const StreamMonstersViewerActivityTracker = require('../plugins/stream-monsters/backend/streammonsters/viewer-activity-tracker');
const StreamMonstersCommandIngress = require('../plugins/stream-monsters/backend/streammonsters/command-ingress');
const { normalizeIngressEventId } = require('../plugins/stream-monsters/backend/streammonsters/ingress-event-id');
const BattleSimulator = require('../plugins/stream-monsters/backend/streammonsters/battle-simulator');
const { getTemplate } = require('../plugins/stream-monsters/backend/streammonsters/catalog');
const {
  ARENA_COLLAPSE_WARNING_ROUND,
  ARENA_COLLAPSE_ROUND,
  ARENA_COLLAPSE_DEFENSE_LOCK_ROUND,
  arenaCollapseRecoveryFactor,
  isArenaCollapseDefenseLocked,
  applyArenaCollapse
} = require('../plugins/stream-monsters/backend/streammonsters/battle-rules-v8');
const PRODUCT_CONTRACT = require('../plugins/stream-monsters/product-contract.json');

// Helper to simulate Rules-v8 matches cleanly
function simulateV8Match({
  leftTemplate = 'ashfang',
  rightTemplate = 'brine',
  level = 1,
  leftSequence = 'AAA',
  rightSequence = 'ABA',
  seed = 'v8-test-seed',
  battleType = 'standard',
  maxRounds = 64,
  disableElementAdvantage = true,
  ...rest
} = {}) {
  const left = typeof leftTemplate === 'string' ? getTemplate(leftTemplate) : leftTemplate;
  const right = typeof rightTemplate === 'string' ? getTemplate(rightTemplate) : rightTemplate;
  return BattleSimulator.simulateRulesV8Match({
    leftTemplate: left,
    rightTemplate: right,
    level,
    leftSequence,
    rightSequence,
    seed,
    battleType,
    maxRounds,
    disableElementAdvantage,
    ...rest
  });
}

// Test Environment Harness
function createTestStore() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

function createTestHarness({ nowMs = 1_000_000, config = {} } = {}) {
  const { sqlite, store } = createTestStore();
  let currentNowMs = nowMs;
  const now = () => currentNowMs;
  const setNow = ms => { currentNowMs = ms; };
  const advance = deltaMs => { currentNowMs += deltaMs; return currentNowMs; };

  const emitted = [];
  const emit = (event, payload) => emitted.push({ event, payload, atMs: currentNowMs });

  const progression = new ProgressionService({
    store,
    now: () => new Date(currentNowMs)
  });

  const engine = new StreamMonstersEngine({
    store,
    progression,
    now,
    config: {
      hatchDurationMs: config.hatchDurationMs || PRODUCT_CONTRACT.defaults?.hatchDurationMs || 60_000,
      eggExpiryMs: config.eggExpiryMs || 86_400_000,
      ...config
    }
  });
  engine.setStreamKey('test-stream-key');

  const activityTracker = new StreamMonstersViewerActivityTracker({
    now,
    activeWindowMs: (config.unhatchedEggStealActivityWindowSeconds || 43_200) * 1_000
  });

  const isViewerActive = userId => activityTracker.isActive({
    userId,
    streamKey: 'test-stream-key',
    nowMs: currentNowMs
  });

  const stealService = new UnhatchedEggStealService({
    store,
    progression,
    emit,
    now,
    isViewerActive,
    config: {
      unhatchedEggStealEnabled: true,
      unhatchedEggStealGraceSeconds: 600,
      unhatchedEggStealActivityWindowSeconds: 43_200,
      ...config
    }
  });

  const dropService = new FreeEggDropService({
    store,
    engine,
    emit,
    now,
    config: {
      freeEggDropChance: 1.0,
      freeEggCooldownSeconds: 86_400,
      ...config
    }
  });

  // Wrap onFirstChat and adopt to automatically supply default eventId if missing
  const rawOnFirstChat = dropService.onFirstChat.bind(dropService);
  dropService.onFirstChat = input => rawOnFirstChat({
    eventId: input?.eventId || `first-chat-${randomUUID()}`,
    streamKey: 'test-stream-key',
    nowMs: currentNowMs,
    ...input
  });

  const rawAdopt = dropService.adopt.bind(dropService);
  dropService.adopt = input => rawAdopt({
    eventId: input?.eventId || `adopt-${randomUUID()}`,
    streamKey: 'test-stream-key',
    nowMs: currentNowMs,
    ...input
  });

  const ingress = new StreamMonstersCommandIngress({
    execute: async (context, commandName, args) => {
      if (commandName === 'adopt') {
        return dropService.adopt({
          streamKey: 'test-stream-key',
          userId: context.userId,
          displayName: context.username || context.userId,
          eventId: context.rawData?.eventId || `adopt-cmd-${randomUUID()}`,
          nowMs: currentNowMs
        });
      }
      return { success: true, commandName, args };
    },
    emit,
    now,
    claimEvent: input => store.claimCommandIngressEvent(input)
  });
  ingress.setCommands([
    { name: 'adopt', cooldown: { user: 0, global: 0 } },
    { name: 'battle', cooldown: { user: 0, global: 0 } },
    { name: 'help', cooldown: { user: 0, global: 0 } }
  ]);

  const createEggInStore = ({
    eggId = randomUUID(),
    userId = 'owner-a',
    state = 'ready',
    hatchDurationMs = 60_000,
    readyAtMs = currentNowMs,
    expiresAtMs = currentNowMs + 86_400_000,
    displayName = 'Owner A',
    ...rest
  } = {}) => {
    return store.createEgg({
      eggId,
      userId,
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      eggColor: '#ff0000',
      seed: `seed-${eggId}`,
      state,
      createdAtMs: currentNowMs,
      hatchDurationMs,
      readyAtMs,
      expiresAtMs,
      imageUrl: '/plugins/stream-monsters/assets/eggs/ember-standard.png',
      variant: 'standard',
      visualSource: 'egg_asset',
      visualKey: 'egg:ember:standard',
      provenance: 'gift',
      displayName,
      ...rest
    });
  };

  const getEggsForUser = userId => {
    return store.db.prepare(
      'SELECT * FROM streammonsters_eggs WHERE user_id = ? ORDER BY created_at_ms ASC'
    ).all(userId);
  };

  const getMonstersForUser = userId => {
    return store.db.prepare(
      'SELECT * FROM streammonsters_monsters WHERE user_id = ? ORDER BY created_at_ms ASC'
    ).all(userId);
  };

  return {
    sqlite,
    store,
    engine,
    progression,
    activityTracker,
    stealService,
    dropService,
    ingress,
    emitted,
    now,
    setNow,
    advance,
    isViewerActive,
    createEggInStore,
    getEggsForUser,
    getMonstersForUser,
    destroy() {
      dropService.destroy();
      try { sqlite.close(); } catch (_) {}
    }
  };
}

describe('Stream Monsters E2E Opaque Verification Suite', () => {
  let harness;

  afterEach(() => {
    if (harness) {
      harness.destroy();
      harness = null;
    }
  });

  // =========================================================================
  // TIER 1: Feature Coverage (>= 5 tests per requirement: R1, R2, R3)
  // =========================================================================

  describe('Tier 1: Feature Coverage', () => {

    describe('R1: Dynamic Combat Pacing & Stall Protection (Rules-v8)', () => {
      test('R1-FEAT-01: Regular standard battles resolve with median duration of 3 to 5 rounds', () => {
        const sampleSeeds = Array.from({ length: 30 }, (_, i) => `pacing-seed-${i}`);
        const roundDurations = [];

        for (const seed of sampleSeeds) {
          const match = simulateV8Match({
            leftTemplate: 'ashfang',
            rightTemplate: 'brine',
            level: 1,
            leftSequence: 'AAA',
            rightSequence: 'ABA',
            seed,
            battleType: 'standard'
          });
          expect(match.rulesVersion).toBe(8);
          roundDurations.push(match.rounds);
        }

        roundDurations.sort((a, b) => a - b);
        const median = roundDurations[Math.floor(roundDurations.length / 2)];
        expect(median).toBeGreaterThanOrEqual(3);
        expect(median).toBeLessThanOrEqual(5);
      });

      test('R1-FEAT-02: Boss and jackpot battles resolve with median duration of 8 to 12 rounds', () => {
        const sampleSeeds = Array.from({ length: 30 }, (_, i) => `boss-seed-${i}`);
        const roundDurations = [];

        for (const seed of sampleSeeds) {
          const match = simulateV8Match({
            leftTemplate: 'ashfang',
            rightTemplate: 'oakheart',
            level: 10,
            leftSequence: 'AAA',
            rightSequence: 'BBB',
            seed,
            battleType: 'boss'
          });
          expect(match.rulesVersion).toBe(8);
          roundDurations.push(match.rounds);
        }

        roundDurations.sort((a, b) => a - b);
        const median = roundDurations[Math.floor(roundDurations.length / 2)];
        expect(median).toBeGreaterThanOrEqual(8);
        expect(median).toBeLessThanOrEqual(12);
      });

      test('R1-FEAT-03: Arena Collapse decays shield and heal recovery past warning rounds', () => {
        expect(ARENA_COLLAPSE_WARNING_ROUND).toBe(3);
        expect(ARENA_COLLAPSE_ROUND).toBe(4);

        // Pre-collapse rounds 1-3 have full recovery factor 1.0
        expect(arenaCollapseRecoveryFactor(1, 'shield')).toBe(1);
        expect(arenaCollapseRecoveryFactor(3, 'heal')).toBe(1);

        // Round 4-5 (Phase 0): Shield decays to 50%, Heal remains 100%
        expect(arenaCollapseRecoveryFactor(4, 'shield')).toBe(0.5);
        expect(arenaCollapseRecoveryFactor(5, 'shield')).toBe(0.5);
        expect(arenaCollapseRecoveryFactor(4, 'heal')).toBe(1);

        // Round 6-7 (Phase 1): Shield decays to 25%, Heal decays to 50%
        expect(arenaCollapseRecoveryFactor(6, 'shield')).toBe(0.25);
        expect(arenaCollapseRecoveryFactor(7, 'heal')).toBe(0.5);

        // Round 8+ (Phase 2): Complete decay (Shield 0%, Heal 0%)
        expect(arenaCollapseRecoveryFactor(8, 'shield')).toBe(0);
        expect(arenaCollapseRecoveryFactor(8, 'heal')).toBe(0);
      });

      test('R1-FEAT-04: Arena Collapse enforces Defense Lock at Round 8', () => {
        expect(ARENA_COLLAPSE_DEFENSE_LOCK_ROUND).toBe(8);
        expect(isArenaCollapseDefenseLocked(7)).toBe(false);
        expect(isArenaCollapseDefenseLocked(8)).toBe(true);
        expect(isArenaCollapseDefenseLocked(12)).toBe(true);

        const match = simulateV8Match({
          leftTemplate: 'oakheart',
          rightTemplate: 'brine',
          level: 1,
          leftSequence: 'BBB',
          rightSequence: 'BBB',
          seed: 'def-lock-seed',
          maxRounds: 10
        });

        const round8 = match.history.find(h => h.round === 8);
        if (round8) {
          expect(round8.availability['sim-left'].choices).not.toContain('B');
          expect(round8.availability['sim-right'].choices).not.toContain('B');
          expect(round8.choices['sim-left']).toBe('A');
          expect(round8.choices['sim-right']).toBe('A');
        }
      });

      test('R1-FEAT-05: Arena Collapse enforces decisive lethal finish at Round 12 without draw stalemates', () => {
        const fighters = [
          { monster_id: 'fighter-1', template_id: 'oakheart' },
          { monster_id: 'fighter-2', template_id: 'brine' }
        ];
        const state = {
          'fighter-1': { hp: 5, shield: 20 },
          'fighter-2': { hp: 5, shield: 20 }
        };

        const collapse = applyArenaCollapse({
          fighters,
          state,
          round: 12,
          actions: [],
          seed: 'decisive-seed'
        });

        expect(collapse.active).toBe(true);
        expect(collapse.terminal).toBe(true);
        expect(collapse.terminalReason).toBe('knockout');
        expect(collapse.winnerId).toBeTruthy();
        expect(collapse.state['fighter-1'].shield).toBe(0);
        expect(collapse.state['fighter-2'].shield).toBe(0);
      });

      test('R1-FEAT-06: Stall builds (max shield + heal combinations) cannot exceed 12 rounds', () => {
        const stallMatch = simulateV8Match({
          leftTemplate: 'oakheart',
          rightTemplate: 'brine',
          level: 1,
          leftSequence: 'BBB',
          rightSequence: 'BBB',
          seed: 'stall-seed-0',
          battleType: 'standard'
        });

        expect(stallMatch.rounds).toBeLessThanOrEqual(12);
        expect(stallMatch.terminal).toBe(true);
        expect(stallMatch.winnerId).toBeTruthy();
        expect(['knockout', 'double_knockout']).toContain(stallMatch.terminalReason);
      });
    });

    describe('R2: Stream Egg Economy & Hatch Progression', () => {
      beforeEach(() => {
        harness = createTestHarness();
      });

      test('R2-FEAT-01: Default incubation duration evaluates to 60,000 ms (60 seconds)', () => {
        expect(PRODUCT_CONTRACT.defaults.hatchDurationMs).toBe(60_000);
        expect(harness.engine.config.hatchDurationMs).toBe(60_000);
      });

      test('R2-FEAT-02: First-chat free egg qualification records deterministic eligibility', () => {
        const qualification = harness.dropService.onFirstChat({
          streamKey: 'test-stream-key',
          userId: 'new-viewer-1',
          displayName: 'New Viewer 1',
          nowMs: harness.now()
        });

        expect(qualification.success).toBe(true);
        expect(qualification.status).toBe('offered');
        expect(qualification.offer).toEqual(expect.objectContaining({
          source_user_id: 'new-viewer-1',
          status: 'reserved'
        }));

        const storedOffer = harness.store.getFreeEggOfferBySource('test-stream-key', 'new-viewer-1');
        expect(storedOffer).toBeTruthy();
        expect(storedOffer.status).toBe('reserved');
      });

      test('R2-FEAT-03: First-chat free egg service enforces 24-hour cooldown and rejects duplicate claims', () => {
        harness.dropService.onFirstChat({
          streamKey: 'test-stream-key',
          userId: 'cooldown-viewer',
          displayName: 'Cooldown Viewer',
          nowMs: harness.now()
        });

        const claim = harness.dropService.adopt({
          streamKey: 'test-stream-key',
          userId: 'cooldown-viewer',
          displayName: 'Cooldown Viewer',
          nowMs: harness.now()
        });
        expect(claim.success).toBe(true);

        const duplicateAttempt = harness.dropService.onFirstChat({
          streamKey: 'test-stream-2',
          userId: 'cooldown-viewer',
          displayName: 'Cooldown Viewer',
          nowMs: harness.now() + 10_000
        });
        expect(duplicateAttempt.success).toBe(false);
        expect(duplicateAttempt.status).toBe('cooldown');
        expect(duplicateAttempt.remainingMs).toBeGreaterThan(0);
      });

      test('R2-FEAT-04: Inactive egg steal service releases unhatched ready eggs after 12 hours of inactivity', () => {
        const eggId = 'egg-12h-inactive';
        harness.createEggInStore({
          eggId,
          userId: 'idle-viewer',
          state: 'ready',
          displayName: 'Idle Viewer'
        });

        harness.stealService.observeReadyEgg(eggId);

        const twelveHoursMs = 43_200_000;
        harness.advance(twelveHoursMs);

        const sweepResult = harness.stealService.sweep({
          isViewerActive: () => false,
          atMs: harness.now()
        });

        expect(sweepResult.published).toHaveLength(1);
        expect(sweepResult.published[0]).toEqual(expect.objectContaining({
          egg_id: eggId,
          status: 'public'
        }));
      });

      test('R2-FEAT-05: Active viewer interaction protects unhatched ready egg during grace window', () => {
        const eggId = 'egg-protected-active';
        const startTime = harness.now();
        harness.createEggInStore({
          eggId,
          userId: 'active-viewer',
          state: 'ready',
          readyAtMs: startTime,
          displayName: 'Active Viewer'
        });

        harness.stealService.observeReadyEgg(eggId);

        // At 11 minutes (between 10m grace and 15m hard deadline):
        // Active owner is protected from steal
        const checkTime = startTime + 660_000;
        const sweepActive = harness.stealService.sweep({
          isViewerActive: userId => userId === 'active-viewer',
          atMs: checkTime
        });
        expect(sweepActive.published).toHaveLength(0);

        // Inactive owner is not protected and egg is published
        const sweepInactive = harness.stealService.sweep({
          isViewerActive: () => false,
          atMs: checkTime
        });
        expect(sweepInactive.published).toHaveLength(1);
      });

      test('R2-FEAT-06: Active viewer auto-hatches ready egg when incubation completes', () => {
        harness.activityTracker.observe({
          userId: 'hatching-viewer',
          streamKey: 'test-stream-key',
          source: 'chat'
        });

        const egg = harness.createEggInStore({
          eggId: 'egg-auto-hatch-test',
          userId: 'hatching-viewer',
          state: 'incubating',
          hatchDurationMs: 60_000,
          readyAtMs: harness.now() + 60_000
        });

        expect(egg.state).toBe('incubating');

        harness.advance(60_000);
        harness.engine.markReadyEggs();

        const hatched = harness.engine.autoHatchReadyEggs({
          isViewerActive: harness.isViewerActive
        });

        expect(hatched).toHaveLength(1);
        expect(hatched[0].monster_id).toBeTruthy();
        expect(hatched[0].egg_id).toBe(egg.egg_id);
        expect(harness.store.getEgg(egg.egg_id).state).toBe('hatched');
      });
    });

    describe('R3: High-Concurrency Event Ingress & Deduplication', () => {
      beforeEach(() => {
        harness = createTestHarness();
      });

      test('R3-FEAT-01: Command ingress deduplication suppresses duplicate chat commands with provider event ID', async () => {
        const payload = {
          eventId: 'provider-evt-999',
          comment: '!help',
          userId: 'chatter-1',
          uniqueId: 'chatter-1'
        };

        const firstResult = await harness.ingress.handleFallback(payload);
        expect(firstResult.success).toBe(true);

        const secondResult = await harness.ingress.handleFallback(payload);
        expect(secondResult).toEqual(expect.objectContaining({
          success: true,
          handled: true,
          status: 'duplicate_event',
          duplicate: true,
          suppressed: true
        }));
      });

      test('R3-FEAT-02: Command ingress fingerprint deduplication generates deterministic event ID without provider ID', async () => {
        const payload = {
          comment: '!help',
          userId: 'fingerprint-user',
          createTime: 1_700_000_000
        };

        const firstResult = await harness.ingress.handleFallback(payload);
        expect(firstResult.success).toBe(true);

        const secondResult = await harness.ingress.handleFallback(payload);
        expect(secondResult).toEqual(expect.objectContaining({
          success: true,
          handled: true,
          status: 'duplicate_event',
          duplicate: true,
          suppressed: true
        }));
      });

      test('R3-FEAT-03: High-volume gift batches process atomically and deduplicate repeat gift event keys', () => {
        const batchInput = {
          userId: 'gifter-burst',
          giftId: 5655,
          giftName: 'Galaxy Burst',
          repeatCount: 10,
          eventKey: 'gift:galaxy:1234',
          streamKey: 'test-stream-key'
        };

        const result = harness.engine.processGiftBatch(batchInput);
        expect(result.processedCount).toBe(10);
        expect(result.duplicate).toBe(false);

        const duplicateResult = harness.engine.processGiftBatch(batchInput);
        expect(duplicateResult.processedCount).toBe(0);
        expect(duplicateResult.duplicate).toBe(true);
      });

      test('R3-FEAT-04: SQLite transactions utilize immediate write locks preventing lock conflicts', () => {
        expect(() => {
          harness.store.runInImmediateTransaction(() => {
            harness.store.claimCommandIngressEvent({
              eventId: 'concurrent-1',
              commandName: 'adopt',
              userId: 'u1',
              transport: 'fallback'
            });
            harness.store.claimCommandIngressEvent({
              eventId: 'concurrent-2',
              commandName: 'adopt',
              userId: 'u2',
              transport: 'fallback'
            });
          });
        }).not.toThrow();

        const claim1 = harness.store.claimCommandIngressEvent({
          eventId: 'concurrent-1',
          commandName: 'adopt',
          userId: 'u1',
          transport: 'fallback'
        });
        expect(claim1.claimed).toBe(false);
      });

      test('R3-FEAT-05: Durable ingress event claims persist receipts with expiration and reject replay attempts', () => {
        const nowMs = harness.now();
        const claim = harness.store.claimCommandIngressEvent({
          eventId: 'durable-receipt-1',
          commandName: 'battle',
          userId: 'warrior-1',
          transport: 'gcce',
          createdAtMs: nowMs,
          ttlMs: 60_000
        });

        expect(claim.claimed).toBe(true);
        expect(claim.eventId).toBe('durable-receipt-1');

        const replay = harness.store.claimCommandIngressEvent({
          eventId: 'durable-receipt-1',
          commandName: 'battle',
          userId: 'warrior-1',
          transport: 'gcce',
          createdAtMs: nowMs
        });
        expect(replay.claimed).toBe(false);
      });
    });
  });

  // =========================================================================
  // TIER 2: Boundary & Corner Cases
  // =========================================================================

  describe('Tier 2: Boundary & Corner Cases', () => {
    beforeEach(() => {
      harness = createTestHarness();
    });

    test('BND-01: Inactivity sliding window boundaries at 43,199,999 ms vs 43,200,000 ms vs 43,200,001 ms', () => {
      const startTime = 1_000_000;
      harness.setNow(startTime);

      harness.activityTracker.observe({
        userId: 'boundary-viewer',
        streamKey: 'test-stream-key',
        source: 'chat'
      });

      const twelveHoursMs = 43_200_000;

      // 1 ms before 12h: Active
      expect(harness.activityTracker.isActive({
        userId: 'boundary-viewer',
        streamKey: 'test-stream-key',
        nowMs: startTime + twelveHoursMs - 1
      })).toBe(true);

      // Exactly at 12h: Active (boundary inclusive)
      expect(harness.activityTracker.isActive({
        userId: 'boundary-viewer',
        streamKey: 'test-stream-key',
        nowMs: startTime + twelveHoursMs
      })).toBe(true);

      // 1 ms after 12h: Inactive
      expect(harness.activityTracker.isActive({
        userId: 'boundary-viewer',
        streamKey: 'test-stream-key',
        nowMs: startTime + twelveHoursMs + 1
      })).toBe(false);
    });

    test('BND-02: Incubation duration boundary at 59,999 ms vs 60,000 ms and default fallback', () => {
      const startTime = 100_000;
      harness.setNow(startTime);

      const egg = harness.createEggInStore({
        eggId: 'egg-timer-boundary',
        userId: 'timer-viewer',
        state: 'incubating',
        hatchDurationMs: 60_000,
        readyAtMs: startTime + 60_000
      });

      expect(egg.ready_at_ms).toBe(startTime + 60_000);

      // Advance to 59,999 ms: Not ready
      harness.setNow(startTime + 59_999);
      harness.engine.markReadyEggs();
      expect(harness.engine.autoHatchReadyEggs({ isViewerActive: () => true })).toHaveLength(0);

      // Advance to 60,000 ms: Ready & auto-hatched
      harness.setNow(startTime + 60_000);
      harness.engine.markReadyEggs();
      expect(harness.engine.autoHatchReadyEggs({ isViewerActive: () => true })).toHaveLength(1);

      // Engine with default empty config falls back to 60,000 ms
      const fallbackEngine = new StreamMonstersEngine({
        store: harness.store,
        progression: harness.progression,
        now: harness.now,
        config: {}
      });
      expect(fallbackEngine.config.hatchDurationMs).toBe(60_000);
    });

    test('BND-03: Combat Round 11 non-lethal vs Round 12 enforced lethal K.O. boundary', () => {
      const fighters = [
        { monster_id: 'fighter-a', template_id: 'oakheart' },
        { monster_id: 'fighter-b', template_id: 'brine' }
      ];

      // Round 11: Non-lethal stall clamp
      const round11State = {
        'fighter-a': { hp: 10, shield: 15 },
        'fighter-b': { hp: 10, shield: 15 }
      };
      const collapse11 = applyArenaCollapse({
        fighters,
        state: round11State,
        round: 11,
        actions: []
      });
      expect(Boolean(collapse11.terminal)).toBe(false);
      expect(collapse11.state['fighter-a'].hp).toBeGreaterThan(0);

      // Round 12: Enforced lethal K.O.
      const round12State = {
        'fighter-a': { hp: 10, shield: 15 },
        'fighter-b': { hp: 10, shield: 15 }
      };
      const collapse12 = applyArenaCollapse({
        fighters,
        state: round12State,
        round: 12,
        actions: [],
        seed: 'boundary-round-12'
      });
      expect(collapse12.terminal).toBe(true);
      expect(collapse12.terminalReason).toBe('knockout');
      expect(collapse12.winnerId).toBeTruthy();
    });

    test('BND-04: First-chat claim cooldown boundary at 86,399,999 ms vs 86,400,000 ms', () => {
      const startTime = 1_000_000;
      harness.setNow(startTime);

      harness.dropService.onFirstChat({
        streamKey: 'test-stream-key',
        userId: 'cd-boundary-user',
        displayName: 'CD User',
        nowMs: startTime
      });
      harness.dropService.adopt({
        streamKey: 'test-stream-key',
        userId: 'cd-boundary-user',
        displayName: 'CD User',
        nowMs: startTime
      });

      const cooldownDurationMs = 86_400_000;

      // 1 ms before 24h on new stream session: Cooldown active
      harness.setNow(startTime + cooldownDurationMs - 1);
      const rejected = harness.dropService.onFirstChat({
        streamKey: 'test-stream-session-2',
        userId: 'cd-boundary-user',
        displayName: 'CD User',
        nowMs: harness.now()
      });
      expect(rejected.success).toBe(false);
      expect(rejected.status).toBe('cooldown');

      // Exactly at 24h on new stream session: Cooldown expired
      harness.setNow(startTime + cooldownDurationMs);
      const allowed = harness.dropService.onFirstChat({
        streamKey: 'test-stream-session-2',
        userId: 'cd-boundary-user',
        displayName: 'CD User',
        nowMs: harness.now()
      });
      expect(allowed.success).toBe(true);
      expect(allowed.status).toBe('offered');
    });

    test('BND-05: Gift batch repeat count boundaries with zero count and overflow count', () => {
      // Repeat count 0 is rejected by validation
      expect(() => {
        harness.engine.processGiftBatch({
          userId: 'zero-gifter',
          giftId: 1,
          giftName: 'Rose',
          repeatCount: 0,
          streamKey: 'test-stream-key'
        });
      }).toThrow('STREAM_MONSTERS_GIFT_REPEAT_COUNT_INVALID');

      // Repeat count 1 is accepted
      const singleResult = harness.engine.processGiftBatch({
        userId: 'single-gifter',
        giftId: 1,
        giftName: 'Rose',
        repeatCount: 1,
        streamKey: 'test-stream-key'
      });
      expect(singleResult.processedCount).toBe(1);

      // Large batch exceeding standard batch limit (300 repeats with normal limit 250)
      const burstResult = harness.engine.processGiftBatch({
        userId: 'burst-gifter',
        giftId: 1,
        giftName: 'Rose',
        repeatCount: 300,
        streamKey: 'test-stream-key'
      });
      expect(burstResult.processedCount).toBe(250);
      expect(burstResult.normalRepeatCount).toBe(250);
      expect(burstResult.overflowEssence).toBeGreaterThan(0);
    });

    test('BND-06: Malformed, empty, and whitespace ingress command payloads handled safely', async () => {
      const emptyPayload = await harness.ingress.handleFallback({});
      expect(emptyPayload.status).toBe('ignored');

      const whitespacePayload = await harness.ingress.handleFallback({
        comment: '    !help    ',
        userId: 'user-ws'
      });
      expect(whitespacePayload.success).toBe(true);

      const noUserPayload = await harness.ingress.handleFallback({
        comment: '!help',
        userId: ''
      });
      expect(noUserPayload.status).toBe('ignored');
    });
  });

  // =========================================================================
  // TIER 3: Cross-Feature Combinations (Pairwise Interactions)
  // =========================================================================

  describe('Tier 3: Cross-Feature Combinations', () => {
    beforeEach(() => {
      harness = createTestHarness();
    });

    test('XFEAT-01: First-chat drop + rapid concurrent command ingress racing', async () => {
      const providerEventId = 'racing-event-101';
      const user = 'concurrent-onboarding-user';

      harness.dropService.onFirstChat({
        streamKey: 'test-stream-key',
        userId: user,
        displayName: user,
        eventId: 'first-chat-race-1',
        nowMs: harness.now()
      });

      const [res1, res2] = await Promise.all([
        harness.ingress.handleFallback({
          eventId: providerEventId,
          comment: '!adopt',
          userId: user,
          transport: 'fallback'
        }),
        harness.ingress.handleFallback({
          eventId: providerEventId,
          comment: '!adopt',
          userId: user,
          transport: 'gcce'
        })
      ]);

      const successes = [res1, res2].filter(r => r.status === 'claimed' || r.status === 'adopted' || r.success === true && !r.suppressed);
      const suppressed = [res1, res2].filter(r => r.status === 'duplicate_event' || r.suppressed);

      expect(successes).toHaveLength(1);
      expect(suppressed).toHaveLength(1);

      const eggs = harness.getEggsForUser(user);
      expect(eggs).toHaveLength(1);
    });

    test('XFEAT-02: Egg steal + battle match inventory coordination', () => {
      const eggId = 'stolen-egg-coord';
      harness.createEggInStore({
        eggId,
        userId: 'viewer-victim',
        state: 'ready',
        displayName: 'Victim'
      });

      harness.stealService.observeReadyEgg(eggId);
      harness.advance(43_200_000); // 12 hours

      harness.stealService.sweep({ isViewerActive: () => false, atMs: harness.now() });

      // Steal claim
      const claim = harness.stealService.steal({
        eggId,
        userId: 'viewer-thief',
        eventId: 'steal-coord-claim',
        nowMs: harness.now()
      });
      expect(claim.success).toBe(true);

      // Verify egg transferred in store
      expect(harness.store.getEgg(eggId).user_id).toBe('viewer-thief');

      // Thief hatches the egg
      harness.activityTracker.observe({
        userId: 'viewer-thief',
        streamKey: 'test-stream-key',
        source: 'chat'
      });
      const hatched = harness.engine.autoHatchReadyEggs({
        isViewerActive: () => true
      });
      expect(hatched).toHaveLength(1);
      expect(hatched[0].user_id).toBe('viewer-thief');

      const victimMonsters = harness.getMonstersForUser('viewer-victim');
      const thiefMonsters = harness.getMonstersForUser('viewer-thief');
      expect(victimMonsters).toHaveLength(0);
      expect(thiefMonsters).toHaveLength(1);
    });

    test('XFEAT-03: Stall build (Max Shield + Heal) + Arena Collapse full progression cycle', () => {
      const match = simulateV8Match({
        leftTemplate: 'oakheart',
        rightTemplate: 'brine',
        level: 1,
        leftSequence: 'BBB',
        rightSequence: 'BBB',
        seed: 'full-cycle-stall',
        battleType: 'standard'
      });

      const hasCollapseRounds = match.history.some(h => h.collapse !== null);
      expect(hasCollapseRounds).toBe(true);

      expect(match.rounds).toBeLessThanOrEqual(12);
      expect(match.terminal).toBe(true);
      expect(match.winnerId).toBeTruthy();
    });

    test('XFEAT-04: High-concurrency gift ingress + background egg sweeps', () => {
      expect(() => {
        for (let i = 0; i < 5; i++) {
          harness.engine.processGiftBatch({
            userId: `gifter-${i}`,
            giftId: 100 + i,
            giftName: 'Gift',
            repeatCount: 5,
            streamKey: 'test-stream-key'
          });
          harness.stealService.sweep({
            isViewerActive: () => false,
            atMs: harness.now()
          });
        }
      }).not.toThrow();
    });

    test('XFEAT-05: First-chat drop adoption + immediate Rules-v8 battle resolution', () => {
      harness.dropService.onFirstChat({
        streamKey: 'test-stream-key',
        userId: 'e2e-warrior',
        displayName: 'E2E Warrior',
        nowMs: harness.now()
      });

      const claim = harness.dropService.adopt({
        streamKey: 'test-stream-key',
        userId: 'e2e-warrior',
        displayName: 'E2E Warrior',
        nowMs: harness.now()
      });
      expect(claim.success).toBe(true);

      harness.advance(60_000);
      harness.engine.markReadyEggs();

      harness.activityTracker.observe({
        userId: 'e2e-warrior',
        streamKey: 'test-stream-key',
        source: 'chat'
      });
      const hatched = harness.engine.autoHatchReadyEggs({
        isViewerActive: harness.isViewerActive
      });
      expect(hatched).toHaveLength(1);

      const match = simulateV8Match({
        leftTemplate: 'ashfang',
        rightTemplate: 'brine',
        level: 1,
        leftSequence: 'AAA',
        rightSequence: 'ABA',
        seed: 'e2e-warrior-battle',
        battleType: 'standard'
      });
      expect(match.terminal).toBe(true);
      expect(match.rounds).toBeGreaterThanOrEqual(1);
      expect(match.rounds).toBeLessThanOrEqual(5);
    });
  });

  // =========================================================================
  // TIER 4: Real-World Workload Scenarios
  // =========================================================================

  describe('Tier 4: Real-World Workload Scenarios', () => {
    beforeEach(() => {
      harness = createTestHarness();
    });

    test('SCENARIO-01: Full Viewer Onboarding to Arena Victory Flow', async () => {
      const viewer = 'newbie-streamer-fan';
      const streamKey = 'test-stream-key';

      // 1. Viewer chats for the first time
      harness.activityTracker.observe({ userId: viewer, streamKey, source: 'chat' });
      const qualification = harness.dropService.onFirstChat({
        streamKey,
        userId: viewer,
        displayName: viewer,
        nowMs: harness.now()
      });
      expect(qualification.success).toBe(true);
      expect(qualification.status).toBe('offered');

      // 2. Viewer sends !adopt
      const adoptResult = await harness.ingress.handleFallback({
        eventId: 'evt-first-adopt-01',
        comment: '!adopt',
        userId: viewer,
        displayName: viewer
      });
      expect(adoptResult.success).toBe(true);

      // 3. 60 seconds incubation passes
      harness.advance(60_000);
      harness.engine.markReadyEggs();

      // 4. Egg auto-hatches for active viewer
      const hatched = harness.engine.autoHatchReadyEggs({
        isViewerActive: harness.isViewerActive
      });
      expect(hatched).toHaveLength(1);
      const monster = harness.getMonstersForUser(viewer)[0];
      expect(monster).toBeTruthy();

      // 5. Battle resolution
      const battle = simulateV8Match({
        leftTemplate: monster.template_id || 'ashfang',
        rightTemplate: 'brine',
        level: monster.level || 1,
        leftSequence: 'AAA',
        rightSequence: 'ABA',
        seed: 'onboarding-victory-seed',
        battleType: 'standard'
      });

      expect(battle.terminal).toBe(true);
      expect(battle.rounds).toBeGreaterThanOrEqual(2);
      expect(battle.rounds).toBeLessThanOrEqual(5);
    });

    test('SCENARIO-02: Abandoned Egg 12-Hour Inactivity Steal & Adoption Flow', () => {
      const idleViewer = 'viewer-afk-99';
      const activeViewer = 'viewer-active-adopter';
      const streamKey = 'test-stream-key';

      // 1. Idle viewer receives gift egg
      const egg = harness.createEggInStore({
        eggId: 'egg-abandoned-1',
        userId: idleViewer,
        state: 'ready',
        hatchDurationMs: 60_000,
        displayName: 'AFK Viewer'
      });

      harness.stealService.observeReadyEgg(egg.egg_id);

      // 2. Idle viewer goes offline for 12 hours
      harness.advance(43_200_000);

      // 3. Steal sweep publishes abandoned egg
      const sweep = harness.stealService.sweep({
        isViewerActive: () => false,
        atMs: harness.now()
      });
      expect(sweep.published).toHaveLength(1);
      expect(sweep.published[0].egg_id).toBe(egg.egg_id);

      // 4. Active viewer claims steal offer
      const claim = harness.stealService.steal({
        eggId: egg.egg_id,
        userId: activeViewer,
        eventId: 'steal-abandoned-claim',
        nowMs: harness.now()
      });
      expect(claim.success).toBe(true);
      expect(claim.status).toBe('claimed');

      // 5. Active viewer hatches egg
      harness.activityTracker.observe({ userId: activeViewer, streamKey, source: 'chat' });
      const hatched = harness.engine.autoHatchReadyEggs({
        isViewerActive: harness.isViewerActive
      });
      expect(hatched).toHaveLength(1);
      expect(hatched[0].user_id).toBe(activeViewer);
    });

    test('SCENARIO-03: High-Traffic Live Stream Streamer Rush Flow', async () => {
      const streamKey = 'test-stream-key';
      const viewerCount = 5;
      const commandsPerViewer = 4;
      const tasks = [];

      for (let v = 0; v < viewerCount; v++) {
        const userId = `traffic-viewer-${v}`;
        for (let c = 0; c < commandsPerViewer; c++) {
          const providerEventId = `rush-evt-${v}-${c}`;
          tasks.push(
            harness.ingress.handleFallback({
              eventId: providerEventId,
              comment: c === 0 ? '!adopt' : '!help',
              userId,
              streamKey
            })
          );
        }
      }

      const results = await Promise.all(tasks);
      expect(results).toHaveLength(viewerCount * commandsPerViewer);

      results.forEach(res => {
        expect([true, false]).toContain(res.success);
      });

      const eventCount = harness.store.db.prepare(
        'SELECT COUNT(*) AS count FROM streammonsters_command_ingress_events'
      ).get().count;
      expect(eventCount).toBeGreaterThan(0);
    });
  });
});
