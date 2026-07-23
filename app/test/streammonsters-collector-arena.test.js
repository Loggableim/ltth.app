const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');

function createArena(options = {}) {
  let now = options.now ?? 10_000;
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const emitted = [];
  const engine = new StreamMonstersEngine({
    store,
    now: () => now,
    emit: (event, payload) => emitted.push({ event, payload }),
    config: {
      hatchDurationMs: 5 * 60 * 1000,
      maxUnhatchedEggs: 3,
      ...options.config
    }
  });
  engine.setStreamKey('creator:collector-arena');
  const enableGift = (giftId, input = {}) => store.upsertGiftMapping({
    giftId,
    giftName: input.giftName || `Gift ${giftId}`,
    coinValue: input.coinValue || 0,
    element: input.element || 'Ember',
    effect: input.effect || 'spawn',
    enabled: true
  });
  return {
    store,
    engine,
    emitted,
    enableGift,
    setNow(value) {
      now = value;
    }
  };
}

describe('Stream Monsters 1.2 Collector Arena', () => {
  test('only explicitly enabled gifts affect the game', () => {
    const { store, engine, enableGift } = createArena();

    expect(engine.processGift({
      userId: 'viewer-a',
      giftId: 11,
      giftName: 'Ignored Gift',
      coinValue: 999
    })).toEqual(expect.objectContaining({ type: 'ignored' }));
    expect(store.getViewerEggs('viewer-a')).toHaveLength(0);

    enableGift(12, { element: 'Tide' });
    expect(engine.processGift({
      userId: 'viewer-a',
      giftId: 12,
      giftName: 'Selected Gift',
      coinValue: 1
    })).toEqual(expect.objectContaining({ type: 'spawned' }));
    expect(store.getViewerEggs('viewer-a')).toHaveLength(1);
  });

  test.each([
    [1, 15_000],
    [9, 15_000],
    [10, 30_000],
    [99, 30_000],
    [100, 60_000],
    [999, 60_000],
    [1_000, 120_000]
  ])('boost gift worth %i diamonds removes exactly %i ms', (coinValue, expectedBoostMs) => {
    const { store, engine, enableGift } = createArena();
    enableGift(1, { element: 'Grove' });
    enableGift(2, { element: 'Volt', effect: 'boost', coinValue });
    engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Seed', coinValue: 1 });

    engine.processGift({ userId: 'viewer-a', giftId: 2, giftName: 'Boost', coinValue });

    expect(store.getViewerEggs('viewer-a', 'incubating')[0].boost_ms).toBe(expectedBoostMs);
  });

  test('uses the curated catalog value for boost tiers and never multiplies paid tempo', () => {
    const { store, engine, enableGift } = createArena();
    enableGift(1, { element: 'Grove' });
    enableGift(2, { element: 'Grove', effect: 'boost', coinValue: 1 });
    store.createStreamEvent({
      streamKey: 'creator:collector-arena',
      eventId: 'elemental-hour:grove',
      element: 'Grove',
      boostMultiplier: 2,
      startedAtMs: 1
    });
    engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Seed', coinValue: 1 });

    engine.processGift({ userId: 'viewer-a', giftId: 2, giftName: 'Boost', coinValue: 9_999 });

    expect(store.getViewerEggs('viewer-a', 'incubating')[0].boost_ms).toBe(45_000);
  });

  test('timer transition marks eggs ready without hatching or occupying a hatch slot', () => {
    const { store, engine, enableGift, setNow, emitted } = createArena();
    enableGift(1, { element: 'Lunar' });
    engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Moon', coinValue: 1 });

    setNow(310_001);
    const ready = engine.markReadyEggs();

    expect(ready).toHaveLength(1);
    expect(store.getViewerEggs('viewer-a', 'ready')).toHaveLength(1);
    expect(store.getViewerMonsters('viewer-a')).toHaveLength(0);
    expect(emitted.map(entry => entry.event)).toContain('streammonsters:egg_ready');
  });

  test('hype makes the next egg charged and then resets without changing its stat budget', () => {
    const { store, engine, enableGift, setNow, emitted } = createArena();
    for (let giftId = 1; giftId <= 8; giftId += 1) {
      enableGift(giftId, { element: giftId % 2 ? 'Ember' : 'Tide' });
      engine.processGift({ userId: `viewer-${giftId}`, giftId, giftName: `Gift ${giftId}`, coinValue: 1 });
      setNow(10_000 + (giftId * 7_000));
    }
    enableGift(9, { element: 'Gale' });
    enableGift(10, { element: 'Volt' });
    engine.processGift({ userId: 'combo-viewer', giftId: 9, giftName: 'Gift 9', coinValue: 1 });
    setNow(67_001);
    engine.processGift({ userId: 'combo-viewer', giftId: 10, giftName: 'Gift 10', coinValue: 1 });

    expect(store.getStreamHype('creator:collector-arena')).toEqual(expect.objectContaining({
      points: 0,
      charged_eggs: 1
    }));

    enableGift(11, { element: 'Volt' });
    const charged = engine.processGift({
      userId: 'charged-viewer',
      giftId: 11,
      giftName: 'Gift 11',
      coinValue: 1
    }).egg;
    expect(charged.variant).toBe('charged');

    setNow(charged.ready_at_ms + 1);
    engine.markReadyEggs();
    const monster = engine.hatchEgg('charged-viewer', 1);
    expect(Object.values(monster.stats).reduce((sum, value) => sum + value, 0)).toBe(28);
    expect(monster.personality).toBeTruthy();
    expect(emitted.map(entry => entry.event)).toEqual(expect.arrayContaining([
      'streammonsters:hype_changed',
      'streammonsters:hatch_started'
    ]));
  });

  test('awards the six-second different-gift combo stream-wide, including boost to spawn', () => {
    const { store, engine, enableGift, setNow, emitted } = createArena();
    enableGift(1, { element: 'Ember' });
    enableGift(2, { effect: 'boost', coinValue: 1 });
    store.createEgg({
      userId: 'boost-viewer',
      giftId: 99,
      giftName: 'Existing Egg',
      element: 'Tide',
      eggColor: '#3aaee8',
      seed: 'existing',
      createdAtMs: 1,
      hatchDurationMs: 300_000
    });

    engine.processGift({ userId: 'boost-viewer', giftId: 2, giftName: 'Boost', coinValue: 1 });
    setNow(12_000);
    engine.processGift({ userId: 'spawn-viewer', giftId: 1, giftName: 'Rose', coinValue: 1 });

    expect(store.getStreamHype('creator:collector-arena').points).toBe(30);
    expect(emitted.find(entry => entry.event === 'streammonsters:gift_combo')).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          userId: 'spawn-viewer',
          previousGiftId: 2
        })
      })
    );
  });

  test('charged eggs hatch faster but never receive stronger stats', () => {
    const { engine } = createArena();
    const standardEgg = {
      seed: 'same-monster-seed',
      element: 'Tide',
      variant: 'standard',
      image_url: '/standard.png'
    };
    const chargedEgg = {
      ...standardEgg,
      variant: 'charged',
      image_url: '/charged.png'
    };

    const standard = engine.createMonster(standardEgg, 1);
    const charged = engine.createMonster(chargedEgg, 1);

    expect(charged.stats).toEqual(standard.stats);
    expect(charged.name).toBe(standard.name);
    expect(charged.personality).toBe(standard.personality);
    expect(engine.hatchDurationFor('charged')).toBeLessThan(engine.hatchDurationFor('standard'));
  });

  test('additive migration keeps legacy eggs and monsters while adding Collector Arena columns', () => {
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
        monster_id TEXT
      );
      INSERT INTO streammonsters_eggs VALUES (
        'legacy-egg', 'legacy-viewer', 1, 'Rose', 'Ember', '#fff', 'legacy-seed',
        'incubating', 1000, 300000, 0, NULL, NULL
      );
      CREATE TABLE streammonsters_monsters (
        monster_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        egg_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        element TEXT NOT NULL,
        rarity TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        xp INTEGER NOT NULL DEFAULT 0,
        stats_json TEXT NOT NULL,
        image_url TEXT,
        is_selected INTEGER NOT NULL DEFAULT 0,
        created_at_ms INTEGER NOT NULL
      );
      INSERT INTO streammonsters_monsters VALUES (
        'legacy-monster', 'legacy-viewer', 'legacy-egg', 'Old Spark', 'Ember',
        'Common', 4, 25, '{"vitality":7,"might":7,"guard":7,"agility":7}',
        NULL, 1, 2000
      );
      CREATE TABLE streammonsters_viewer_progress (
        user_id TEXT PRIMARY KEY,
        gifts_sent INTEGER NOT NULL DEFAULT 0,
        eggs_hatched INTEGER NOT NULL DEFAULT 0,
        battles_won INTEGER NOT NULL DEFAULT 0,
        prestige INTEGER NOT NULL DEFAULT 0,
        stream_streak INTEGER NOT NULL DEFAULT 0,
        last_seen_stream TEXT
      );
      INSERT INTO streammonsters_viewer_progress VALUES (
        'legacy-viewer', 3, 1, 0, 0, 1, 'legacy-stream'
      );
    `);

    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    const egg = store.getEgg('legacy-egg');

    expect(egg).toEqual(expect.objectContaining({
      variant: 'standard',
      visual_source: 'legacy'
    }));
    expect(egg.ready_at_ms).toBe(301_000);
    expect(store.getMonster('legacy-monster')).toEqual(expect.objectContaining({
      name: 'Old Spark',
      level: 4,
      xp: 25,
      personality: null,
      visual_source: 'legacy',
      battle_count: 0
    }));
    expect(store.getViewerProgress('legacy-viewer')).toEqual(expect.objectContaining({
      gifts_sent: 3,
      pending_xp: 0
    }));
  });
});
