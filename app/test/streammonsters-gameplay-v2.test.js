const Database = require('better-sqlite3');
const StreamAlchemyPlugin = require('../plugins/stream-monsters');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/stream-monsters/backend/streammonsters/game-engine');
const BattleService = require('../plugins/stream-monsters/backend/streammonsters/battle-service');
const ChatCommands = require('../plugins/stream-monsters/backend/streammonsters/chat-commands');
const ProgressionService = require('../plugins/stream-monsters/backend/streammonsters/progression-service');
const StreamMonstersRoutes = require('../plugins/stream-monsters/backend/streammonsters/routes');

function createStore() {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

function createGame({ now = 1_000, config = {}, progression = false } = {}) {
  let currentMs = now;
  const { sqlite, store } = createStore();
  const emitted = [];
  const progressionService = progression
    ? new ProgressionService({
      store,
      emit: (event, payload) => emitted.push({ event, payload }),
      now: () => new Date(currentMs)
    })
    : null;
  const engine = new StreamMonstersEngine({
    store,
    progression: progressionService,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentMs,
    config: {
      hatchDurationMs: 5 * 60 * 1000,
      maxUnhatchedEggs: 3,
      ...config
    }
  });
  const battleService = new BattleService({ store, now: () => currentMs });
  const commands = new ChatCommands({
    store,
    engine,
    battleService,
    progression: progressionService,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentMs
  });
  const hatch = (userId, giftId, element = giftId % 2 ? 'Ember' : 'Tide') => {
    store.upsertGiftMapping({
      giftId,
      giftName: `Gift ${giftId}`,
      element,
      effect: 'spawn',
      enabled: true
    });
    engine.processGift({ userId, giftId, giftName: `Gift ${giftId}`, coinValue: 1 });
    currentMs += engine.config.hatchDurationMs + 1;
    return engine.hatchReadyEggs(userId)[0];
  };
  return {
    sqlite,
    store,
    engine,
    battleService,
    commands,
    progression: progressionService,
    emitted,
    hatch,
    now: () => currentMs,
    setNow: value => { currentMs = value; }
  };
}

function createMonster(store, {
  userId,
  monsterId,
  element = 'Ember',
  personality = 'Brave',
  createdAtMs = 1
}) {
  const egg = store.createEgg({
    eggId: `egg-${monsterId}`,
    userId,
    giftId: 1,
    giftName: 'Test Gift',
    element,
    eggColor: '#ffffff',
    seed: `seed-${monsterId}`,
    createdAtMs,
    hatchDurationMs: 0
  });
  return store.createMonsterFromEgg(egg, {
    monsterId,
    name: monsterId,
    personality,
    rarity: 'Standard',
    stats: { vitality: 7, might: 7, guard: 7, agility: 7 },
    createdAtMs
  });
}

describe('Stream Monsters current rules migration', () => {
  test('preserves a missing-version creator duration while persisting current rules defaults', () => {
    const setConfig = jest.fn();
    const plugin = new StreamAlchemyPlugin({
      getConfig: jest.fn(),
      setConfig
    });
    const legacy = {
      enabled: true,
      streamMonsters: {
        enabled: true,
        hatchDurationMs: 1_800_000
      }
    };

    plugin.config = plugin.loadConfig(legacy);

    expect(plugin.config.streamMonsters).toEqual(expect.objectContaining({
      rulesVersion: 8,
      hatchDurationMs: 1_800_000
    }));
    expect(plugin.persistSanitizedConfigIfNeeded(legacy)).toBe(true);
    expect(setConfig).toHaveBeenCalledWith('streamalchemy_config', plugin.config);
  });

  test('archives retired image-generation settings without exposing or changing them', () => {
    const setConfig = jest.fn();
    const plugin = new StreamAlchemyPlugin({
      getConfig: jest.fn(),
      setConfig
    });
    const retired = {
      providerOrder: ['localComfy', 'openai'],
      openaiApiKey: 'legacy-secret',
      localGeneration: {
        generationMode: 'local_preferred',
        model: 'ByteDance/SDXL-Lightning',
        modelFile: 'sdxl_lightning_4step.safetensors'
      },
      streamMonsters: {
        enabled: true,
        hatchDurationMs: 120_000,
        localRuntime: {
          state: 'verified',
          runtimeRoot: 'C:\\legacy\\ComfyUI',
          archiveUrl: 'https://retired.invalid/runtime.7z'
        },
        artPoolTarget: 8,
        provider: 'localComfy',
        modelId: 'sdxl-lightning'
      }
    };

    plugin.config = plugin.loadConfig(retired);

    expect(plugin.config).not.toHaveProperty('providerOrder');
    expect(plugin.config).not.toHaveProperty('openaiApiKey');
    expect(plugin.config).not.toHaveProperty('localGeneration');
    expect(plugin.config.streamMonsters).not.toHaveProperty('localRuntime');
    expect(plugin.config.streamMonsters).not.toHaveProperty('artPoolTarget');
    expect(plugin.config.streamMonsters).not.toHaveProperty('provider');
    expect(plugin.config.streamMonsters).not.toHaveProperty('modelId');

    expect(plugin.persistSanitizedConfigIfNeeded(retired)).toBe(true);
    const persisted = setConfig.mock.calls.at(-1)[1];
    expect(persisted.providerOrder).toEqual(retired.providerOrder);
    expect(persisted.openaiApiKey).toBe('legacy-secret');
    expect(persisted.localGeneration).toEqual(retired.localGeneration);
    expect(persisted.streamMonsters.localRuntime).toEqual(retired.streamMonsters.localRuntime);
    expect(persisted.streamMonsters.artPoolTarget).toBe(8);
    expect(persisted.streamMonsters.provider).toBe('localComfy');
    expect(persisted.streamMonsters.modelId).toBe('sdxl-lightning');

    plugin.updateConfig({
      providerOrder: ['attacker'],
      openaiApiKey: 'replacement-secret',
      localGeneration: { model: 'replacement-model' },
      streamMonsters: {
        hatchDurationMs: 300_000,
        localRuntime: { state: 'replacement' },
        provider: 'replacement-provider',
        modelId: 'replacement-model'
      }
    });
    const updated = setConfig.mock.calls.at(-1)[1];
    expect(updated.streamMonsters.hatchDurationMs).toBe(300_000);
    expect(updated.providerOrder).toEqual(retired.providerOrder);
    expect(updated.openaiApiKey).toBe('legacy-secret');
    expect(updated.localGeneration).toEqual(retired.localGeneration);
    expect(updated.streamMonsters.localRuntime).toEqual(retired.streamMonsters.localRuntime);
    expect(updated.streamMonsters.artPoolTarget).toBe(8);
    expect(updated.streamMonsters.provider).toBe('localComfy');
    expect(updated.streamMonsters.modelId).toBe('sdxl-lightning');
    expect(plugin.config).not.toHaveProperty('openaiApiKey');
    expect(plugin.config.streamMonsters).not.toHaveProperty('localRuntime');

    setConfig.mockClear();
    expect(plugin.persistSanitizedConfigIfNeeded(updated)).toBe(false);
    expect(setConfig).not.toHaveBeenCalled();
  });

  test.each([
    [120_000, undefined],
    [600_000, undefined],
    [1_800_000, 1],
    [1_800_000, 2]
  ])(
    'preserves the custom duration %i with stored rules marker %p',
    (hatchDurationMs, rulesVersion) => {
      const plugin = new StreamAlchemyPlugin({
        getConfig: jest.fn(),
        setConfig: jest.fn()
      });

      const loaded = plugin.loadConfig({
        streamMonsters: {
          hatchDurationMs,
          rulesVersion
        }
      });

      expect(loaded.streamMonsters.rulesVersion).toBe(8);
      expect(loaded.streamMonsters.hatchDurationMs).toBe(hatchDurationMs);
    }
  );

  test('keeps existing egg timing and battle history readable during additive schema upgrades', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE streammonsters_eggs (
        egg_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        gift_id INTEGER NOT NULL,
        gift_name TEXT NOT NULL,
        element TEXT NOT NULL,
        egg_color TEXT NOT NULL,
        seed TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'incubating',
        created_at_ms INTEGER NOT NULL,
        hatch_duration_ms INTEGER NOT NULL,
        boost_ms INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        monster_id TEXT,
        variant TEXT NOT NULL DEFAULT 'standard',
        ready_at_ms INTEGER,
        visual_source TEXT NOT NULL DEFAULT 'egg_asset',
        visual_key TEXT
      );
      INSERT INTO streammonsters_eggs (
        egg_id, user_id, gift_id, gift_name, element, egg_color, seed,
        created_at_ms, hatch_duration_ms, ready_at_ms
      ) VALUES (
        'legacy-egg', 'viewer-a', 1, 'Legacy Gift', 'Ember', '#fff', 'legacy-seed',
        1000, 1800000, 1801000
      );
      CREATE TABLE streammonsters_battles (
        battle_id TEXT PRIMARY KEY,
        seed TEXT NOT NULL,
        monster_a_id TEXT NOT NULL,
        monster_b_id TEXT NOT NULL,
        winner_monster_id TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
      INSERT INTO streammonsters_battles (
        battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
        result_json, created_at_ms
      ) VALUES (
        'legacy-battle', 'legacy-battle-seed', 'monster-a', 'monster-b', 'monster-a',
        '{"winnerId":"monster-a","rounds":[]}', 2000
      );
    `);
    const store = new StreamMonstersDatabase(sqlite);

    store.initialize();

    expect(store.getEgg('legacy-egg')).toEqual(expect.objectContaining({
      hatch_duration_ms: 1_800_000,
      ready_at_ms: 1_801_000
    }));
    expect(store.getBattle('legacy-battle')).toEqual(expect.objectContaining({
      seed: 'legacy-battle-seed',
      result_json: '{"winnerId":"monster-a","rounds":[]}'
    }));
  });

  test('accepts only the creator incubation choices from 30 seconds through 30 minutes including 90 seconds', () => {
    const routes = new StreamMonstersRoutes({
      api: {},
      pluginDir: __dirname,
      store: {},
      engine: {},
      generationPool: {},
      systemAnalyzer: {},
      managedRuntime: {},
      localModelInstaller: {},
      configProvider: {}
    });

    expect([0.5, 1, 1.5, 2, 5, 10, 30].map(minutes => (
      routes.sanitizeConfigUpdate({ hatchDurationMs: minutes * 60_000 }).hatchDurationMs
    ))).toEqual([30_000, 60_000, 90_000, 120_000, 300_000, 600_000, 1_800_000]);
    expect(routes.sanitizeConfigUpdate({ maxUnhatchedEggs: 0 })).toEqual({});
    expect(routes.sanitizeConfigUpdate({ maxUnhatchedEggs: 99 })).toEqual({});
    expect(routes.publicConfig({ rulesVersion: 2, hatchDurationMs: 300_000 })).toEqual(
      expect.objectContaining({ rulesVersion: 8, maxUnhatchedEggs: 3 })
    );
  });
});

describe('Stream Monsters historical starter compatibility', () => {
  test('anchors legacy handle data to a stable platform viewer ID across handle changes', () => {
    const { store } = createStore();
    store.createEgg({
      userId: 'old_handle',
      giftId: 1,
      giftName: 'Legacy Gift',
      element: 'Ember',
      eggColor: '#fff',
      seed: 'legacy-viewer-seed',
      createdAtMs: 1,
      hatchDurationMs: 300_000
    });

    const first = store.resolveViewerIdentity({
      platformUserId: '7123456789012345678',
      legacyUserId: 'old_handle',
      updatedAtMs: 1_000
    });
    const renamed = store.resolveViewerIdentity({
      platformUserId: '7123456789012345678',
      legacyUserId: 'new_handle',
      updatedAtMs: 2_000
    });

    expect(first).toBe('old_handle');
    expect(renamed).toBe('old_handle');
    expect(store.resolveKnownViewerId('7123456789012345678')).toBe('old_handle');
    expect(store.resolveKnownViewerId('new_handle')).toBe('old_handle');
    expect(store.getViewerEggs(renamed)).toEqual([
      expect.objectContaining({ seed: 'legacy-viewer-seed' })
    ]);
  });

  test('keeps old starter claims readable but exposes no starter egg source', () => {
    const game = createGame({ progression: true });
    game.store.db.prepare(`
      INSERT INTO streammonsters_starter_claims (user_id, egg_id, claimed_at_ms)
      VALUES ('stable-viewer-42', 'historical-starter', 123)
    `).run();

    expect(game.commands.execute({ userId: 'stable-viewer-42' }, 'adopt')).toEqual({
      success: false,
      status: 'ignored'
    });
    expect(game.store.getStarterClaim('stable-viewer-42')).toEqual({
      user_id: 'stable-viewer-42',
      egg_id: 'historical-starter',
      claimed_at_ms: 123
    });
    expect(game.store.getViewerEggs('stable-viewer-42')).toEqual([]);
    expect(game.store.claimStarterEgg).toBeUndefined();
    expect(game.engine.adoptStarter).toBeUndefined();
  });
});

describe('Stream Monsters battle stances and fair matchmaking', () => {
  test('accepts legacy stances while rules v3 ignores them and leaves permanent stats unchanged', () => {
    const { store } = createStore();
    const monsterA = createMonster(store, {
      userId: 'viewer-a',
      monsterId: 'monster-a',
      element: 'Ember',
      personality: 'Brave'
    });
    const monsterB = createMonster(store, {
      userId: 'viewer-b',
      monsterId: 'monster-b',
      element: 'Ember',
      personality: 'Gentle',
      createdAtMs: 2
    });
    const battles = new BattleService({ store, now: () => 10_000 });
    const statsBefore = [store.getMonster('monster-a').stats, store.getMonster('monster-b').stats];

    const baseline = battles.resolve(monsterA, monsterB, 'stance-seed', 'power', 'power');
    const advantaged = battles.resolve(monsterA, monsterB, 'stance-seed', 'power', 'guard');
    const persisted = store.getBattle(advantaged.battleId);
    const expectedStanceA = battles.stanceForMonster(monsterA);
    const expectedStanceB = battles.stanceForMonster(monsterB);

    expect(advantaged).toEqual(expect.objectContaining({
      seed: 'stance-seed',
      rulesVersion: 3,
      stanceA: expectedStanceA,
      stanceB: expectedStanceB,
      stanceAdvantageMonsterId: null,
      rounds: expect.any(Array)
    }));
    expect(advantaged).toEqual(baseline);
    expect(advantaged.rounds).toHaveLength(3);
    expect(persisted).toEqual(expect.objectContaining({
      seed: 'stance-seed',
      stance_a: expectedStanceA,
      stance_b: expectedStanceB,
      rules_version: 3
    }));
    expect(JSON.parse(persisted.rounds_json)).toHaveLength(3);
    expect([store.getMonster('monster-a').stats, store.getMonster('monster-b').stats]).toEqual(statsBefore);
    expect(Object.values(store.getMonster('monster-a').stats).reduce((sum, value) => sum + value, 0)).toBe(28);
  });

  test('persists accepted queue stance metadata but resolves both fighters automatically', () => {
    const game = createGame({ config: { hatchDurationMs: 0 } });
    const monsterA = game.hatch('viewer-a', 1);
    const monsterB = game.hatch('viewer-b', 2);

    expect(game.commands.execute({ userId: 'viewer-a' }, 'battle', ['power']).status).toBe('queued');
    expect(game.store.getBattleQueueEntry('viewer-a')).toEqual(expect.objectContaining({
      monster_id: monsterA.monster_id,
      stance: 'power'
    }));

    const resumedCommands = new ChatCommands({
      store: game.store,
      engine: game.engine,
      battleService: game.battleService,
      now: game.now
    });
    const expectedStance = game.battleService.stanceForMonster(monsterB);
    const result = resumedCommands.execute({ userId: 'viewer-b' }, 'battle');

    expect(result.status).toBe('started');
    expect(result.battle).toEqual(expect.objectContaining({
      rulesVersion: 3,
      stanceA: game.battleService.stanceForMonster(monsterA),
      stanceB: expectedStance
    }));
    expect(game.store.getBattleQueue()).toEqual([]);
  });

  test('rejects invalid stances before queueing', () => {
    const game = createGame({ config: { hatchDurationMs: 0 } });
    game.hatch('viewer-a', 1);

    const result = game.commands.execute({ userId: 'viewer-a' }, 'battle', ['berserk']);

    expect(result).toEqual(expect.objectContaining({ success: false, status: 'invalid_stance' }));
    expect(game.store.getBattleQueue()).toEqual([]);
  });

  test('prefers a fresh opponent for ten minutes when another eligible viewer exists', () => {
    const game = createGame({ config: { hatchDurationMs: 0 } });
    const monsterA = game.hatch('viewer-a', 1);
    const monsterB = game.hatch('viewer-b', 2);
    const monsterC = game.hatch('viewer-c', 3);

    game.sqlite.prepare(`
      INSERT INTO streammonsters_battles (
        battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
        result_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-previous-pair',
      'previous-pair',
      monsterA.monster_id,
      monsterB.monster_id,
      monsterA.monster_id,
      JSON.stringify({
        battleId: 'legacy-previous-pair',
        seed: 'previous-pair',
        monsterAId: monsterA.monster_id,
        monsterBId: monsterB.monster_id,
        winnerId: monsterA.monster_id,
        rounds: []
      }),
      game.now()
    );
    game.store.enqueueBattle({
      userId: 'viewer-a',
      monsterId: monsterA.monster_id,
      stance: 'power',
      queuedAtMs: game.now()
    });
    game.store.enqueueBattle({
      userId: 'viewer-c',
      monsterId: monsterC.monster_id,
      stance: 'speed',
      queuedAtMs: game.now()
    });

    const result = game.commands.execute({ userId: 'viewer-b' }, 'battle', ['guard']);

    expect(result.status).toBe('started');
    expect(new Set([result.battle.monsterAId, result.battle.monsterBId])).toEqual(
      new Set([monsterB.monster_id, monsterC.monster_id])
    );
  });

  test('keeps a recent rematch waiting while a persisted fresh opponent approaches level expansion', () => {
    const game = createGame({ config: { hatchDurationMs: 0 } });
    const recentMonster = game.hatch('viewer-recent', 1);
    const joiningMonster = game.hatch('viewer-joining', 2);
    const freshMonster = game.hatch('viewer-fresh', 3);
    game.sqlite.prepare('UPDATE streammonsters_monsters SET level = 10 WHERE monster_id = ?')
      .run(freshMonster.monster_id);
    game.battleService.resolve(
      recentMonster,
      joiningMonster,
      'recent-pair',
      'power',
      'guard'
    );
    game.store.enqueueBattle({
      userId: 'viewer-recent',
      monsterId: recentMonster.monster_id,
      stance: 'power',
      queuedAtMs: game.now()
    });
    game.store.enqueueBattle({
      userId: 'viewer-fresh',
      monsterId: freshMonster.monster_id,
      stance: 'speed',
      queuedAtMs: game.now()
    });
    const resumedCommands = new ChatCommands({
      store: game.store,
      engine: game.engine,
      battleService: game.battleService,
      now: game.now
    });

    const waiting = resumedCommands.execute({ userId: 'viewer-joining' }, 'battle', ['guard']);

    expect(waiting.status).toBe('queued');
    expect(new Set(game.store.getBattleQueue().map(entry => entry.user_id))).toEqual(new Set([
      'viewer-recent',
      'viewer-fresh',
      'viewer-joining'
    ]));

    game.setNow(game.now() + 30_000);
    const matched = resumedCommands.execute({ userId: 'viewer-joining' }, 'battle', ['guard']);

    expect(matched.status).toBe('started');
    expect(new Set([matched.battle.monsterAId, matched.battle.monsterBId])).toEqual(
      new Set([joiningMonster.monster_id, freshMonster.monster_id])
    );
    expect(game.store.getBattleQueue().map(entry => entry.user_id)).toEqual(['viewer-recent']);
  });

  test('expands level matchmaking after either viewer has waited thirty seconds', () => {
    const game = createGame({ config: { hatchDurationMs: 0 } });
    const monsterA = game.hatch('viewer-a', 1);
    const monsterB = game.hatch('viewer-b', 2);
    game.sqlite.prepare('UPDATE streammonsters_monsters SET level = 10 WHERE monster_id = ?')
      .run(monsterB.monster_id);

    expect(game.commands.execute({ userId: 'viewer-a' }, 'battle').status).toBe('queued');
    expect(game.commands.execute({ userId: 'viewer-b' }, 'battle').status).toBe('queued');
    game.setNow(game.now() + 30_000);

    expect(game.commands.execute({ userId: 'viewer-b' }, 'battle').status).toBe('started');
  });
});

describe('Stream Monsters events, Hype and inherited fairness regressions', () => {
  test('gives matching Elemental Hour spawn eggs only a 30-second reduction and +10 bonus Hype', () => {
    const game = createGame({ now: 100_000, config: { hatchDurationMs: 300_000 } });
    game.store.createStreamEvent({
      streamKey: 'creator:room-1',
      eventId: 'elemental-hour:ember',
      element: 'Ember',
      boostMultiplier: 2,
      startedAtMs: game.now()
    });
    game.engine.setStreamKey('creator:room-1');
    game.store.upsertGiftMapping({
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });

    const result = game.engine.processGift({
      userId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      coinValue: 1
    });

    expect(result.egg).toEqual(expect.objectContaining({
      variant: 'standard',
      hatch_duration_ms: 300_000,
      boost_ms: 30_000
    }));
    expect(result.egg.ready_at_ms - result.egg.created_at_ms).toBe(270_000);
    expect(game.store.getStreamHype('creator:room-1').points).toBe(20);
    game.setNow(result.egg.ready_at_ms);
    const [monster] = game.engine.hatchReadyEggs('viewer-a');
    expect(monster.rarity).toBe('Standard');
    expect(Object.values(monster.stats).reduce((sum, value) => sum + value, 0)).toBe(28);
  });

  test('emits each Hype milestone and deterministically charges exactly the next egg at 100', () => {
    const game = createGame();

    game.engine.addHype(25);
    game.engine.addHype(25);
    game.engine.addHype(25);
    game.engine.addHype(25);

    expect(game.emitted
      .filter(entry => entry.event === 'streammonsters:hype_milestone')
      .map(entry => entry.payload.milestone)).toEqual([25, 50, 75, 100]);
    expect(game.store.getStreamHype('offline')).toEqual(expect.objectContaining({
      points: 0,
      charged_eggs: 1
    }));

    game.store.upsertGiftMapping({
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });
    const charged = game.engine.processGift({
      userId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      coinValue: 1
    });

    expect(charged.egg.variant).toBe('charged');
    expect(game.store.getStreamHype('offline').charged_eggs).toBe(0);
  });

  test('counts a selected spawn plus boost combo stream-wide across different viewers', () => {
    const game = createGame({ now: 10_000 });
    game.store.upsertGiftMapping({
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });
    game.store.upsertGiftMapping({
      giftId: 2,
      giftName: 'Boost',
      effect: 'boost',
      enabled: true
    });
    game.store.createEgg({
      userId: 'viewer-b',
      giftId: 99,
      giftName: 'Existing',
      element: 'Tide',
      eggColor: '#fff',
      seed: 'existing',
      createdAtMs: 1,
      hatchDurationMs: 300_000
    });
    game.engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose' });
    game.setNow(12_000);

    game.engine.processGift({ userId: 'viewer-b', giftId: 2, giftName: 'Boost' });

    expect(game.emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'streammonsters:gift_combo',
        payload: expect.objectContaining({
          userId: 'viewer-b',
          previousUserId: 'viewer-a',
          previousGiftId: 1
        })
      })
    ]));
  });

  test('tracks a chronological five-win streak across different selected monsters', () => {
    const { store } = createStore();
    const emitted = [];
    const progression = new ProgressionService({
      store,
      emit: (event, payload) => emitted.push({ event, payload }),
      now: () => new Date('2026-07-23T12:00:00Z')
    });
    const monsterA = createMonster(store, { userId: 'viewer-a', monsterId: 'monster-a' });
    const monsterB = createMonster(store, {
      userId: 'viewer-a',
      monsterId: 'monster-b',
      createdAtMs: 2
    });

    [monsterA, monsterA, monsterA, monsterB, monsterB].forEach(monster => {
      progression.recordBattle('viewer-a', null, { monster, won: true });
    });

    expect(store.getViewerBattleStats('viewer-a')).toEqual(expect.objectContaining({
      win_streak: 5,
      best_win_streak: 5
    }));
    expect(store.getViewerAchievements('viewer-a')).toEqual(expect.arrayContaining([
      expect.objectContaining({ achievement_key: 'five_win_streak' })
    ]));
    expect(emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'streammonsters:achievement_unlocked',
        payload: expect.objectContaining({
          achievement: expect.objectContaining({ achievement_key: 'five_win_streak' })
        })
      })
    ]));
  });

  test('shows every current daily and weekly quest before progress exists', () => {
    const game = createGame({ progression: true });

    const result = game.commands.execute({ userId: 'viewer-new' }, 'quests');

    expect(result.daily.map(quest => quest.quest_key)).toEqual([
      'daily:chat',
      'daily:gift',
      'daily:hatch'
    ]);
    expect(result.weekly.map(quest => quest.quest_key)).toEqual([
      'weekly:battle',
      'weekly:collection',
      'weekly:event'
    ]);
  });
});
