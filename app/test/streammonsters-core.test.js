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
    artPool: options.artPool || null,
    kenneyBuilder: options.kenneyBuilder || null,
    hasBundledAsset: options.hasBundledAsset || null,
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

  test('resolves a Random spawn mapping to deterministic, broadly balanced real elements', () => {
    const { store, engine } = createGame();
    store.upsertGiftMapping({
      giftId: 7934,
      giftName: 'Heart Me',
      element: 'Random',
      effect: 'spawn',
      enabled: true
    });

    const elements = Array.from({ length: 600 }, (_, index) => engine.describeGift({
      giftId: 7934,
      giftName: 'Heart Me',
      userId: `viewer-${index % 100}`,
      eventTimeMs: 10_000 + index
    }).element);
    const counts = elements.reduce((result, element) => {
      result[element] = (result[element] || 0) + 1;
      return result;
    }, {});
    const repeated = engine.describeGift({
      giftId: 7934,
      giftName: 'Heart Me',
      userId: 'viewer-42',
      eventTimeMs: 42_000
    });
    const repeatedAgain = engine.describeGift({
      giftId: 7934,
      giftName: 'Heart Me',
      userId: 'viewer-42',
      eventTimeMs: 42_000
    });

    expect(Object.keys(counts).sort()).toEqual(
      ['Ember', 'Gale', 'Grove', 'Lunar', 'Tide', 'Volt']
    );
    expect(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts))).toBeLessThan(40);
    expect(repeated).toEqual(repeatedAgain);
    expect(repeated.eggColor).toMatch(/^#/);
    expect(repeated.poolKey).toBe(`${repeated.element}:standard`);
  });

  test('uses the individual gift event time when multiple Random drops arrive together', () => {
    const { store, engine } = createGame({ now: () => 10_000 });
    store.upsertGiftMapping({
      giftId: 7934,
      giftName: 'Heart Me',
      element: 'Random',
      effect: 'spawn',
      enabled: true
    });
    jest.spyOn(engine, 'selectRandomElement').mockImplementation(({ eventTimeMs }) => ({
      10_000: 'Ember',
      10_001: 'Tide',
      10_002: 'Lunar'
    })[eventTimeMs]);

    engine.processGift({
      userId: 'viewer-a',
      giftId: 7934,
      giftName: 'Heart Me',
      eventTimeMs: 10_000
    });
    engine.processGift({
      userId: 'viewer-a',
      giftId: 7934,
      giftName: 'Heart Me',
      eventTimeMs: 10_001
    });
    engine.processGift({
      userId: 'viewer-a',
      giftId: 7934,
      giftName: 'Heart Me',
      eventTimeMs: 10_002
    });

    expect(store.getViewerEggs('viewer-a').map(egg => egg.element))
      .toEqual(['Ember', 'Tide', 'Lunar']);
  });

  test('creates eggs only for selected spawn gifts and uses selected boost gifts for acceleration', () => {
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
    expect(eggs).toHaveLength(3);
    expect(eggs[0].boost_ms).toBeGreaterThan(0);
    expect(eggs.every(egg => egg.state === 'incubating')).toBe(true);
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

  test('expires ready eggs at exactly 24 hours and removes them from hatchable slots', () => {
    const { store } = createGame();
    const dayMs = 24 * 60 * 60 * 1000;
    store.createEgg({
      eggId: 'old-ready', userId: 'viewer-a', giftId: 1, giftName: 'Heart',
      element: 'Volt', eggColor: '#ffffff', seed: 'old', createdAtMs: 0,
      hatchDurationMs: 1, readyAtMs: 1
    });
    store.createEgg({
      eggId: 'new-ready', userId: 'viewer-a', giftId: 2, giftName: 'Heart',
      element: 'Tide', eggColor: '#ffffff', seed: 'new', createdAtMs: 1,
      hatchDurationMs: 1, readyAtMs: 2
    });
    store.markReadyEggs(2);

    expect(store.expireUnhatchedEggs(dayMs).map(egg => egg.egg_id)).toEqual(['old-ready']);
    expect(store.getEgg('old-ready')).toEqual(expect.objectContaining({
      state: 'expired',
      expired_at_ms: dayMs
    }));
    expect(store.getViewerHatchableEggs('viewer-a').map(egg => egg.egg_id)).toEqual(['new-ready']);
  });

  test('does not hatch a ready egg once it reaches the 24-hour expiry boundary', () => {
    let now = 0;
    const { store, engine } = createGame({ now: () => now, config: { hatchDurationMs: 0 } });
    store.upsertGiftMapping({
      giftId: 9, giftName: 'Heart', element: 'Grove', effect: 'spawn', enabled: true
    });
    engine.processGift({ userId: 'viewer-a', giftId: 9, giftName: 'Heart', coinValue: 1 });
    engine.markReadyEggs();

    now = 24 * 60 * 60 * 1000;
    expect(() => engine.hatchEgg('viewer-a', 1)).toThrow('STREAM_MONSTERS_EGG_NOT_READY');
    expect(store.getViewerMonsters('viewer-a')).toHaveLength(0);
    expect(store.getViewerEggs('viewer-a', 'expired')).toHaveLength(1);
  });

  test('uses bundled furry monster art by default before AI or Kenney fallbacks', () => {
    const artPool = { consume: jest.fn(() => ({ image_url: '/ai.png', visual_key: 'ai:test' })) };
    const kenneyBuilder = {
      build: jest.fn(() => ({ publicUrl: '/kenney.svg', visualSource: 'kenney', visualKey: 'kenney:test' }))
    };
    const { store, engine } = createGame({
      config: { hatchDurationMs: 0, visualPack: 'furry' },
      artPool,
      kenneyBuilder,
      hasBundledAsset: () => true
    });
    store.upsertGiftMapping({
      giftId: 7, giftName: 'Heart', element: 'Tide', effect: 'spawn', enabled: true
    });

    engine.processGift({ userId: 'viewer-a', giftId: 7, giftName: 'Heart', coinValue: 1 });
    const [monster] = engine.hatchReadyEggs('viewer-a');

    expect(monster.image_url).toMatch(
      /^\/plugins\/streamalchemy\/assets\/streammonsters\/furry\/(?:ripple|brine|reefbite|axi)\.png$/
    );
    expect(monster.visual_source).toBe('furry');
    expect(artPool.consume).not.toHaveBeenCalled();
    expect(kenneyBuilder.build).not.toHaveBeenCalled();
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

  test('keeps the five-minute timer fair during legacy elemental hours and records stream metrics', () => {
    const { store, engine } = createGame();
    const gift = Array.from({ length: 24 }, (_, index) => index + 1)
      .map(giftId => engine.describeGift({ giftId, giftName: `Gift ${giftId}` }))
      .find(item => item.element === 'Tide');
    store.createStreamEvent({ streamKey: 'creator:room-1', eventId: 'elemental-hour:tide', element: 'Tide', boostMultiplier: 2, startedAtMs: 1_000 });
    engine.setStreamKey('creator:room-1');
    store.upsertGiftMapping({ ...gift, effect: 'spawn', enabled: true });

    engine.processGift({ userId: 'viewer-a', giftId: gift.giftId, giftName: gift.giftName });

    expect(store.getViewerEggs('viewer-a')[0].boost_ms).toBe(0);
    expect(store.getViewerEggs('viewer-a')[0].ready_at_ms).toBe(
      store.getViewerEggs('viewer-a')[0].created_at_ms + 300000
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
