const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');

function createGame(options = {}) {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  const emitted = [];
  const engine = new StreamMonstersEngine({
    store,
    now: options.now || (() => 1_000),
    emit: (event, payload) => emitted.push({ event, payload }),
    config: {
      hatchDurationMs: 5 * 60 * 1000,
      maxUnhatchedEggs: 3,
      defaultCreatorName: 'Creator',
      ...options.config
    }
  });
  return { store, engine, emitted };
}

describe('Stream Monsters game core', () => {
  test('adds its tables idempotently without modifying archived StreamAlchemy data', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec('CREATE TABLE streamalchemy_items (item_id TEXT PRIMARY KEY, name TEXT);');
    sqlite.prepare('INSERT INTO streamalchemy_items (item_id, name) VALUES (?, ?)').run('legacy-1', 'Old Rose');
    const store = new StreamMonstersDatabase(sqlite);

    store.initialize();
    store.initialize();

    expect(sqlite.prepare('SELECT name FROM streamalchemy_items WHERE item_id = ?').get('legacy-1')).toEqual({ name: 'Old Rose' });
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'streammonsters_eggs'").get()).toBeDefined();
  });

  test('maps the same gift to the same visible egg element without random paid rewards', () => {
    const { engine } = createGame();

    const first = engine.describeGift({ giftId: 5655, giftName: 'Rose', coinValue: 1 });
    const second = engine.describeGift({ giftId: 5655, giftName: 'Rose', coinValue: 1 });

    expect(first).toEqual(second);
    expect(['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar']).toContain(first.element);
    expect(first.eggColor).toMatch(/^#/);
  });

  test('queues paid overflow eggs while selected boost gifts accelerate the oldest incubating egg', () => {
    let now = 10_000;
    const { store, engine } = createGame({ now: () => now });
    for (let giftId = 1; giftId <= 4; giftId += 1) {
      store.upsertGiftMapping({
        giftId, giftName: `Gift ${giftId}`, element: 'Ember', effect: 'spawn', enabled: true
      });
    }
    store.upsertGiftMapping({
      giftId: 99, giftName: 'Boost', element: 'Volt', effect: 'boost', enabled: true
    });
    for (let giftId = 1; giftId <= 4; giftId += 1) {
      engine.processGift({ userId: 'viewer-a', giftId, giftName: `Gift ${giftId}`, coinValue: 10 });
      now += 1;
    }
    engine.processGift({ userId: 'viewer-a', giftId: 99, giftName: 'Boost', coinValue: 10 });

    const eggs = store.getViewerEggs('viewer-a');
    expect(eggs).toHaveLength(4);
    expect(eggs[0].boost_ms).toBeGreaterThan(0);
    expect(eggs.slice(0, 3).every(egg => egg.state === 'incubating')).toBe(true);
    expect(eggs[3].state).toBe('queued');
  });

  test('hatches overdue eggs after the viewer returns and persists a selectable monster', () => {
    let now = 10_000;
    const { store, engine, emitted } = createGame({ now: () => now, config: { hatchDurationMs: 100 } });
    store.upsertGiftMapping({
      giftId: 7, giftName: 'Heart', element: 'Tide', effect: 'spawn', enabled: true
    });
    engine.processGift({ userId: 'viewer-a', giftId: 7, giftName: 'Heart', coinValue: 1 });

    now = 10_101;
    const hatched = engine.hatchReadyEggs('viewer-a');
    const monsters = store.getViewerMonsters('viewer-a');

    expect(hatched).toHaveLength(1);
    expect(monsters).toHaveLength(1);
    expect(monsters[0].is_selected).toBe(1);
    expect(emitted.map(entry => entry.event)).toContain('streammonsters:egg_hatched');
  });

  test('rewards two different quick gifts with a transparent hype combo bonus', () => {
    let now = 10_000;
    const { store, engine, emitted } = createGame({ now: () => now, config: { comboWindowMs: 6_000 } });
    store.upsertGiftMapping({ giftId: 1, giftName: 'Rose', element: 'Ember', effect: 'spawn', enabled: true });
    store.upsertGiftMapping({ giftId: 2, giftName: 'Heart', element: 'Tide', effect: 'spawn', enabled: true });
    engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    now = 12_000;
    engine.processGift({ userId: 'viewer-a', giftId: 2, giftName: 'Heart', coinValue: 1 });

    expect(store.getStreamHype('offline').points).toBe(40);
    expect(emitted.map(entry => entry.event)).toContain('streammonsters:gift_combo');
  });

  test('applies the fixed Elemental Hour reduction without multiplying gift value and records stream metrics', () => {
    const { store, engine } = createGame();
    const gift = Array.from({ length: 24 }, (_, index) => index + 1)
      .map(giftId => engine.describeGift({ giftId, giftName: `Gift ${giftId}` }))
      .find(item => item.element === 'Tide');
    store.createStreamEvent({ streamKey: 'creator:room-1', eventId: 'elemental-hour:tide', element: 'Tide', boostMultiplier: 2, startedAtMs: 1_000 });
    engine.setStreamKey('creator:room-1');
    store.upsertGiftMapping({ ...gift, effect: 'spawn', enabled: true });

    engine.processGift({ userId: 'viewer-a', giftId: gift.giftId, giftName: gift.giftName });

    expect(store.getViewerEggs('viewer-a')[0].boost_ms).toBe(30_000);
    expect(store.getViewerEggs('viewer-a')[0].ready_at_ms).toBe(
      store.getViewerEggs('viewer-a')[0].created_at_ms + 270_000
    );
    expect(store.getStreamMetrics('creator:room-1')).toEqual(expect.objectContaining({ eggs_spawned: 1 }));
  });

  test('resolves a three-round duel from a stored seed and records a non-transferable result', () => {
    const { store, engine } = createGame({ config: { hatchDurationMs: 0 } });
    store.upsertGiftMapping({ giftId: 1, giftName: 'Rose', element: 'Ember', effect: 'spawn', enabled: true });
    store.upsertGiftMapping({ giftId: 2, giftName: 'Heart', element: 'Tide', effect: 'spawn', enabled: true });
    engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    engine.processGift({ userId: 'viewer-b', giftId: 2, giftName: 'Heart', coinValue: 1 });
    const [monsterA] = engine.hatchReadyEggs('viewer-a');
    const [monsterB] = engine.hatchReadyEggs('viewer-b');
    const battles = new BattleService({ store });

    const first = battles.resolve(monsterA, monsterB, 'battle-seed-1');
    const second = battles.resolve(monsterA, monsterB, 'battle-seed-1');

    expect(first.rounds).toHaveLength(3);
    expect(second).toEqual(first);
    expect(first.winnerId === monsterA.monster_id || first.winnerId === monsterB.monster_id).toBe(true);
    expect(store.getBattle(first.battleId)).toEqual(expect.objectContaining({
      seed: 'battle-seed-1',
      winner_monster_id: first.winnerId
    }));
  });
});
