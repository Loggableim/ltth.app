const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const { TEMPLATE_CATALOG, getTemplatesForElement } = require('../plugins/streamalchemy/backend/streammonsters/catalog');
const CollectionService = require('../plugins/streamalchemy/backend/streammonsters/collection-service');

function createCollection(options = {}) {
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const emitted = [];
  const collection = new CollectionService({
    store,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => options.now ?? 10_000
  });
  return { store, collection, emitted };
}

function addMonster(store, input = {}) {
  const userId = input.userId || 'viewer-a';
  const element = input.element || 'Ember';
  const templateId = input.templateId || 'ashfang';
  const egg = store.createEgg({
    eggId: input.eggId || `egg-${templateId}-${input.index || 0}`,
    userId,
    giftId: 1,
    giftName: 'Gift',
    element,
    eggColor: '#fff',
    seed: input.seed || `seed-${templateId}-${input.index || 0}`,
    createdAtMs: input.createdAtMs || 1,
    hatchDurationMs: 1,
    state: 'ready'
  });
  return store.createMonsterFromEgg(egg, {
    monsterId: input.monsterId || `monster-${templateId}-${input.index || 0}`,
    templateId,
    name: input.name || templateId,
    rarity: 'Standard',
    personality: 'Curious',
    stats: { vitality: 5, might: 5, guard: 5, agility: 5 },
    imageUrl: input.imageUrl || '/monster.png',
    visualSource: input.visualSource || 'furry',
    visualKey: input.visualKey || `furry:${templateId}`,
    createdAtMs: input.createdAtMs || 1
  });
}

describe('Stream Monsters 1.4 collection layer', () => {
  test('ships the exact stable 24-template catalog with four templates per element', () => {
    expect(TEMPLATE_CATALOG).toHaveLength(24);
    expect(TEMPLATE_CATALOG.map(template => template.templateId)).toEqual([
      'ashfang', 'cinder', 'embergrin', 'pyrra', 'ripple', 'brine', 'reefbite', 'axi',
      'mosswhisker', 'cloverhop', 'oakheart', 'fernmask', 'zephyr', 'skyrend', 'cirrus', 'gusttail',
      'pulse', 'neonclaw', 'ampjack', 'flashstep', 'selene', 'umbra', 'lumen', 'tsuki'
    ]);
    for (const element of ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar']) {
      expect(getTemplatesForElement(element)).toHaveLength(4);
    }
    TEMPLATE_CATALOG.forEach(template => {
      expect(template).toEqual(expect.objectContaining({
        templateId: expect.any(String), element: expect.any(String), name: expect.any(String),
        species: expect.any(String), assetPath: expect.any(String),
        skills: expect.objectContaining({ attack: expect.any(Object), defense: expect.any(Object), special: expect.any(Object) })
      }));
    });
  });

  test('uses a deterministic, transactional element shuffle bag with all four templates before repeat and first-cycle missing preference', () => {
    const { store, collection } = createCollection();
    addMonster(store, { templateId: 'ashfang', index: 99 });
    const eggs = Array.from({ length: 5 }, (_, index) => ({
      egg_id: `egg-${index}`, user_id: 'viewer-a', element: 'Ember', seed: 'bag-seed'
    }));
    const selected = eggs.map(egg => collection.reserveTemplateForEgg(egg).templateId);
    expect(new Set(selected.slice(0, 4)).size).toBe(4);
    expect(selected.slice(0, 4)).toContain('ashfang');
    expect(selected[0]).not.toBe('ashfang');
    expect(selected[4]).toBeDefined();
    expect(collection.reserveTemplateForEgg(eggs[0]).templateId).toBe(selected[0]);
    expect(store.getTemplateBag('viewer-a', 'Ember')).toEqual(expect.objectContaining({ cycle: 1, position: 1 }));
  });

  test('awards duplicate essence and cosmetic thresholds without changing monster stats', () => {
    const { store, collection } = createCollection();
    const first = addMonster(store, { templateId: 'ashfang', index: 1 });
    collection.recordHatch(first);
    const stats = first.stats;
    for (let index = 2; index <= 13; index += 1) {
      const monster = addMonster(store, { templateId: 'ashfang', index });
      collection.recordHatch(monster);
    }
    expect(collection.getEssence('viewer-a', 'Ember')).toEqual(expect.objectContaining({ amount: 12 }));
    expect(collection.getEssence('viewer-a', 'Ember').unlocks).toEqual(['palette', 'hatch_aura', 'profile_badge']);
    expect(store.getMonster(first.monster_id).stats).toEqual(stats);
  });

  test('records mastery increments and only emits newly crossed cosmetic unlocks', () => {
    const { store, collection, emitted } = createCollection();
    const monster = addMonster(store, { templateId: 'ashfang' });
    collection.recordHatch(monster);
    collection.recordBattle(monster, { battleId: 'battle-1', won: true });
    collection.recordBattle(monster, { battleId: 'battle-2', won: true });
    collection.recordBattle(monster, { battleId: 'battle-3', won: false });
    expect(collection.getMastery('viewer-a', 'ashfang')).toEqual(expect.objectContaining({ points: 13, unlocks: ['title'] }));
    collection.recordBattle(monster, { battleId: 'battle-3', won: false });
    expect(collection.getMastery('viewer-a', 'ashfang').points).toBe(13);
    expect(emitted.filter(entry => entry.event === 'streammonsters:mastery_unlocked')).toHaveLength(1);
  });

  test('migrates legacy monsters to deterministic templates without altering their non-template fields', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE streammonsters_eggs (
        egg_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, gift_id INTEGER NOT NULL, gift_name TEXT NOT NULL,
        element TEXT NOT NULL, egg_color TEXT NOT NULL, seed TEXT NOT NULL, state TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL, hatch_duration_ms INTEGER NOT NULL, boost_ms INTEGER NOT NULL,
        image_url TEXT, monster_id TEXT
      );
      CREATE TABLE streammonsters_monsters (
        monster_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, egg_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        element TEXT NOT NULL, rarity TEXT NOT NULL, level INTEGER NOT NULL, xp INTEGER NOT NULL,
        stats_json TEXT NOT NULL, image_url TEXT, is_selected INTEGER NOT NULL, created_at_ms INTEGER NOT NULL
      );
      INSERT INTO streammonsters_eggs VALUES ('legacy-egg', 'legacy-user', 1, 'Gift', 'Tide', '#fff', 'legacy-seed', 'hatched', 1, 1, 0, '/legacy.png', 'legacy-monster');
      INSERT INTO streammonsters_monsters VALUES ('legacy-monster', 'legacy-user', 'legacy-egg', 'Legacy Name', 'Tide', 'Rare', 7, 42, '{"vitality":8}', '/legacy.png', 1, 2);
    `);
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    expect(store.getMonster('legacy-monster')).toEqual(expect.objectContaining({
      template_id: expect.stringMatching(/^(ripple|brine|reefbite|axi)$/), name: 'Legacy Name',
      image_url: '/legacy.png', level: 7, xp: 42, stats: { vitality: 8 }, is_selected: 1, created_at_ms: 2
    }));
  });

  test('tracks Heart Chain gaps and same-viewer repeats, awarding each 3/5/10 milestone once', () => {
    const { collection, emitted } = createCollection();
    collection.recordHeartMe({ streamKey: 'stream-a', userId: 'a', atMs: 1 });
    collection.recordHeartMe({ streamKey: 'stream-a', userId: 'a', atMs: 2 });
    collection.recordHeartMe({ streamKey: 'stream-a', userId: 'b', atMs: 3 });
    const three = collection.recordHeartMe({ streamKey: 'stream-a', userId: 'c', atMs: 4 });
    expect(three).toEqual(expect.objectContaining({ length: 3, hypeAward: 5 }));
    collection.recordHeartMe({ streamKey: 'stream-a', userId: 'd', atMs: 5 });
    expect(collection.recordHeartMe({ streamKey: 'stream-a', userId: 'e', atMs: 6 })).toEqual(expect.objectContaining({ length: 5, hypeAward: 10 }));
    expect(collection.recordHeartMe({ streamKey: 'stream-a', userId: 'f', atMs: 9_000 })).toEqual(expect.objectContaining({ length: 1, hypeAward: 0 }));
    expect(emitted.filter(entry => entry.event === 'streammonsters:heart_chain_changed')).toHaveLength(7);
  });

  test('creates one deterministic stream mission and grants participant rewards idempotently', () => {
    const { store, collection } = createCollection();
    const monster = addMonster(store, { templateId: 'ashfang' });
    const mission = collection.getStreamMission('stream-a');
    expect(collection.getStreamMission('stream-a')).toEqual(mission);
    collection.recordMissionProgress('stream-a', 'hatch', { userId: 'viewer-a', monster });
    const participant = collection.getMissionParticipant('stream-a', 'viewer-a');
    expect(participant).toEqual(expect.objectContaining({ user_id: 'viewer-a' }));
    collection.completeMission('stream-a');
    const afterFirst = collection.getMastery('viewer-a', 'ashfang').points;
    collection.completeMission('stream-a');
    expect(collection.getMastery('viewer-a', 'ashfang').points).toBe(afterFirst);
    expect(collection.getCosmetics('viewer-a')).toContain('season_badge:stream-a');
  });

  test('counts stream mission battles once and tracks four discovered elements across participants', () => {
    const { store, collection } = createCollection();
    const monsters = [
      addMonster(store, { userId: 'a', templateId: 'ashfang', element: 'Ember', index: 1 }),
      addMonster(store, { userId: 'b', templateId: 'ripple', element: 'Tide', index: 2 }),
      addMonster(store, { userId: 'c', templateId: 'mosswhisker', element: 'Grove', index: 3 }),
      addMonster(store, { userId: 'd', templateId: 'zephyr', element: 'Gale', index: 4 })
    ];
    const streamKey = Array.from({ length: 64 }, (_, index) => `element-stream-${index}`).find(key => (
      collection.getStreamMission(key).mission_key === 'four_elements'
    ));
    monsters.forEach(monster => collection.recordMissionProgress(streamKey, 'hatch', {
      userId: monster.user_id, monster, actionKey: `hatch:${monster.monster_id}`
    }));
    expect(collection.getStreamMission(streamKey)).toEqual(expect.objectContaining({ progress: 4, completed_at_ms: expect.any(Number) }));

    const battleStream = Array.from({ length: 64 }, (_, index) => `battle-stream-${index}`).find(key => (
      collection.getStreamMission(key).mission_key === 'three_battles'
    ));
    collection.recordMissionProgress(battleStream, 'battle', { userId: 'a', monster: monsters[0], actionKey: 'battle:one' });
    collection.recordMissionProgress(battleStream, 'battle', { userId: 'b', monster: monsters[1], actionKey: 'battle:one' });
    expect(collection.getStreamMission(battleStream).progress).toBe(1);
  });

  test('uses template art, legacy art, furry assets, then Kenney in the configured visual order', () => {
    const { collection } = createCollection();
    const template = TEMPLATE_CATALOG.find(entry => entry.templateId === 'ashfang');
    const artPool = { consumeForTemplate: jest.fn(() => ({ image_url: '/template.png', visual_key: 'ai:template' })) };
    const kenneyBuilder = { build: jest.fn(() => ({ publicUrl: '/kenney.svg', visualSource: 'kenney', visualKey: 'kenney:x' })) };
    expect(collection.selectVisual({ template, egg: { element: 'Ember', variant: 'standard', seed: 'x' }, visualPack: 'art_lab', artPool, kenneyBuilder, hasBundledAsset: () => true }).imageUrl).toBe('/template.png');
    artPool.consumeForTemplate.mockReturnValueOnce(null).mockReturnValueOnce({ image_url: '/legacy.png', visual_key: 'ai:legacy' });
    expect(collection.selectVisual({ template, egg: { element: 'Ember', variant: 'standard', seed: 'x' }, visualPack: 'art_lab', artPool, kenneyBuilder, hasBundledAsset: () => true }).imageUrl).toBe('/legacy.png');
    expect(collection.selectVisual({ template, egg: { element: 'Ember', variant: 'standard', seed: 'x' }, visualPack: 'furry', artPool, kenneyBuilder, hasBundledAsset: () => true }).imageUrl).toBe(template.assetPath);
    expect(collection.selectVisual({ template, egg: { element: 'Ember', variant: 'standard', seed: 'x' }, visualPack: 'furry', artPool, kenneyBuilder, hasBundledAsset: () => false }).visualSource).toBe('kenney');
  });
});
