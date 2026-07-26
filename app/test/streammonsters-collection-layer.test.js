const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const { TEMPLATE_CATALOG, getTemplatesForElement } = require('../plugins/streamalchemy/backend/streammonsters/catalog');
const CollectionService = require('../plugins/streamalchemy/backend/streammonsters/collection-service');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');

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

function findMissionStream(collection, missionKey, prefix = missionKey) {
  return Array.from({ length: 64 }, (_, index) => `${prefix}-${index}`).find(key => (
    collection.getStreamMission(key).mission_key === missionKey
  ));
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
    const bagAfterReservations = store.getTemplateBag('viewer-a', 'Ember');
    const replayed = Array.from({ length: 12 }, () => collection.reserveTemplateForEgg(eggs[0]).templateId);
    expect(new Set(replayed)).toEqual(new Set([selected[0]]));
    expect(store.getTemplateBag('viewer-a', 'Ember')).toEqual(bagAfterReservations);
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
    expect(sqlite.prepare("PRAGMA index_list('streammonsters_monsters')").all().map(row => row.name))
      .toContain('streammonsters_monsters_user_template');
    expect(sqlite.prepare("PRAGMA index_list('streammonsters_art_pool')").all().map(row => row.name))
      .toContain('streammonsters_art_pool_template_lookup');
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
    collection.recordHeartMe({ streamKey: 'stream-a', userId: 'g', atMs: 9_001 });
    expect(collection.recordHeartMe({ streamKey: 'stream-a', userId: 'h', atMs: 9_002 })).toEqual(expect.objectContaining({ length: 3, hypeAward: 5 }));
    expect(emitted.filter(entry => entry.event === 'streammonsters:heart_chain_changed')).toHaveLength(9);
  });

  test('uses the discovery-grade Heart Me normalization for chains and their active mission', () => {
    const { store, collection, emitted } = createCollection();
    const streamKey = findMissionStream(collection, 'heart_chain_five', 'normalized-heart');
    const engine = new StreamMonstersEngine({
      store,
      collection,
      emit: (event, payload) => emitted.push({ event, payload }),
      now: () => 1_000
    });
    engine.setStreamKey(streamKey);

    engine.recordHeartMeGift('viewer-a', { giftName: 'Heart-Me' }, 1);
    engine.recordHeartMeGift('viewer-b', { giftName: 'heart   me' }, 2);
    const chain = engine.recordHeartMeGift('viewer-c', { giftName: 'HEART ME' }, 3);

    expect(chain).toEqual(expect.objectContaining({ length: 3, hypeAward: 5 }));
    expect(collection.getStreamMission(streamKey)).toEqual(expect.objectContaining({ progress: 3 }));
    expect(store.getMissionParticipants(streamKey).map(item => item.user_id))
      .toEqual(['viewer-a', 'viewer-b', 'viewer-c']);
  });

  test('ignores Heart Chain activity when the active mission requires hatches', () => {
    const { store, collection } = createCollection();
    const streamKey = findMissionStream(collection, 'six_hatches', 'heart-vs-hatch');

    collection.recordHeartMe({ streamKey, userId: 'heart-viewer', atMs: 1 });

    expect(collection.getStreamMission(streamKey)).toEqual(expect.objectContaining({ progress: 0 }));
    expect(store.getMissionParticipants(streamKey)).toEqual([]);
  });

  test('does not claim or register a hatch against an active battle mission', () => {
    const { store, collection } = createCollection();
    const monster = addMonster(store, { userId: 'hatch-viewer', templateId: 'ashfang' });
    const streamKey = findMissionStream(collection, 'three_battles', 'hatch-vs-battle');
    const actionKey = `mission:${streamKey}:hatch:${monster.monster_id}`;

    collection.recordMissionProgress(streamKey, 'hatch', {
      userId: monster.user_id,
      monster,
      actionKey: `hatch:${monster.monster_id}`
    });

    expect(collection.getStreamMission(streamKey)).toEqual(expect.objectContaining({ progress: 0 }));
    expect(collection.getMissionParticipant(streamKey, monster.user_id)).toBeNull();
    expect(store.db.prepare('SELECT 1 FROM streammonsters_collection_actions WHERE action_key = ?').get(actionKey))
      .toBeUndefined();
  });

  test('does not claim or register a single battle against an active Heart Chain mission', () => {
    const { store, collection } = createCollection();
    const monster = addMonster(store, { userId: 'battle-viewer', templateId: 'ashfang' });
    const streamKey = findMissionStream(collection, 'heart_chain_five', 'battle-vs-heart');
    const actionKey = `mission:${streamKey}:battle:one`;

    collection.recordMissionProgress(streamKey, 'battle', {
      userId: monster.user_id,
      monster,
      actionKey: 'battle:one'
    });

    expect(collection.getStreamMission(streamKey)).toEqual(expect.objectContaining({ progress: 0 }));
    expect(collection.getMissionParticipant(streamKey, monster.user_id)).toBeNull();
    expect(store.db.prepare('SELECT 1 FROM streammonsters_collection_actions WHERE action_key = ?').get(actionKey))
      .toBeUndefined();
  });

  test('does not claim or register a battle batch against a non-battle mission', () => {
    const { store, collection } = createCollection();
    const left = addMonster(store, { userId: 'left', templateId: 'ashfang', index: 1 });
    const right = addMonster(store, { userId: 'right', templateId: 'ripple', element: 'Tide', index: 2 });
    const streamKey = findMissionStream(collection, 'heart_chain_five', 'batch-vs-heart');
    const actionKey = `mission-battle:${streamKey}:battle:wrong-mission`;

    collection.recordBattleOutcome({
      streamKey,
      battleId: 'battle:wrong-mission',
      fighters: [{ monster: left, won: true }, { monster: right, won: false }]
    });

    expect(collection.getStreamMission(streamKey)).toEqual(expect.objectContaining({ progress: 0 }));
    expect(store.getMissionParticipants(streamKey)).toEqual([]);
    expect(store.db.prepare('SELECT 1 FROM streammonsters_collection_actions WHERE action_key = ?').get(actionKey))
      .toBeUndefined();
    expect(collection.getMastery('left', 'ashfang').points).toBe(3);
    expect(collection.getMastery('right', 'ripple').points).toBe(2);
  });

  test('creates one deterministic stream mission and grants participant rewards idempotently', () => {
    const { store, collection } = createCollection();
    const monster = addMonster(store, { templateId: 'ashfang' });
    const streamKey = findMissionStream(collection, 'six_hatches', 'deterministic-mission');
    const mission = collection.getStreamMission(streamKey);
    expect(collection.getStreamMission(streamKey)).toEqual(mission);
    collection.recordMissionProgress(streamKey, 'hatch', { userId: 'viewer-a', monster });
    const participant = collection.getMissionParticipant(streamKey, 'viewer-a');
    expect(participant).toEqual(expect.objectContaining({ user_id: 'viewer-a' }));
    collection.completeMission(streamKey);
    const afterFirst = collection.getMastery('viewer-a', 'ashfang').points;
    collection.completeMission(streamKey);
    expect(collection.getMastery('viewer-a', 'ashfang').points).toBe(afterFirst);
    expect(collection.getCosmetics('viewer-a')).toContain(`season_badge:${streamKey}`);
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

  test('records both battle participants atomically before a completing battle mission rewards them', () => {
    const { store, collection } = createCollection();
    const left = addMonster(store, { userId: 'left', templateId: 'ashfang', index: 1 });
    const right = addMonster(store, { userId: 'right', templateId: 'ripple', element: 'Tide', index: 2 });
    const streamKey = Array.from({ length: 64 }, (_, index) => `completion-battle-${index}`).find(key => (
      collection.getStreamMission(key).mission_key === 'three_battles'
    ));
    store.setStreamMissionProgress(streamKey, 2);
    collection.recordBattleOutcome({
      streamKey,
      battleId: 'battle:finisher',
      fighters: [
        { monster: left, won: true },
        { monster: right, won: false }
      ]
    });
    expect(collection.getMastery('left', 'ashfang').points).toBe(6);
    expect(collection.getMastery('right', 'ripple').points).toBe(5);
    expect(collection.getCosmetics('left')).toContain(`season_badge:${streamKey}`);
    expect(collection.getCosmetics('right')).toContain(`season_badge:${streamKey}`);
    collection.recordBattleOutcome({
      streamKey,
      battleId: 'battle:finisher',
      fighters: [{ monster: left, won: true }, { monster: right, won: false }]
    });
    expect(collection.getMastery('left', 'ashfang').points).toBe(6);
    expect(collection.getMastery('right', 'ripple').points).toBe(5);
  });

  test('does not register or reward an unrelated viewer after a completed six-hatch mission', () => {
    const { store, collection } = createCollection();
    const original = addMonster(store, { userId: 'original', templateId: 'ashfang', index: 1 });
    const late = addMonster(store, { userId: 'late', templateId: 'ripple', element: 'Tide', index: 2 });
    const streamKey = Array.from({ length: 64 }, (_, index) => `six-hatch-${index}`).find(key => (
      collection.getStreamMission(key).mission_key === 'six_hatches'
    ));
    for (let index = 0; index < 6; index += 1) {
      collection.recordMissionProgress(streamKey, 'hatch', {
        userId: original.user_id, monster: original, actionKey: `hatch:original:${index}`
      });
    }
    expect(collection.getStreamMission(streamKey).completed_at_ms).toEqual(expect.any(Number));
    collection.recordMissionProgress(streamKey, 'hatch', {
      userId: late.user_id, monster: late, actionKey: 'hatch:late'
    });
    expect(collection.getMissionParticipant(streamKey, 'late')).toBeNull();
    expect(collection.getCosmetics('late')).not.toContain(`season_badge:${streamKey}`);
    expect(collection.getMastery('late', 'ripple').points).toBe(0);
  });

  test('rewards mission mastery on the selected monster before the event monster fallback', () => {
    const { store, collection } = createCollection();
    const selected = addMonster(store, { userId: 'viewer-a', templateId: 'ashfang', index: 1 });
    const eventMonster = addMonster(store, { userId: 'viewer-a', templateId: 'cinder', index: 2 });
    const streamKey = findMissionStream(collection, 'six_hatches', 'selected-priority');
    collection.recordMissionProgress(streamKey, 'hatch', {
      userId: 'viewer-a', monster: eventMonster, actionKey: 'hatch:event-monster'
    });
    collection.completeMission(streamKey);
    expect(store.getSelectedMonster('viewer-a').monster_id).toBe(selected.monster_id);
    expect(collection.getMastery('viewer-a', 'ashfang').points).toBe(3);
    expect(collection.getMastery('viewer-a', 'cinder').points).toBe(0);
  });

  test('rolls back a failed mission reward batch and retries every reward without early events', () => {
    const { store, collection, emitted } = createCollection();
    const first = addMonster(store, { userId: 'a-viewer', templateId: 'ashfang', index: 1 });
    const second = addMonster(store, { userId: 'b-viewer', templateId: 'ripple', element: 'Tide', index: 2 });
    const streamKey = findMissionStream(collection, 'six_hatches', 'reward-rollback');
    for (const monster of [first, second]) {
      collection.addMastery(monster.user_id, monster.template_id, 8, `setup:${monster.monster_id}`);
      collection.recordMissionProgress(streamKey, 'hatch', {
        userId: monster.user_id,
        monster,
        actionKey: `hatch:${monster.monster_id}`
      });
    }
    emitted.length = 0;
    const setTemplateMastery = store.setTemplateMastery.bind(store);
    store.setTemplateMastery = (userId, ...args) => {
      if (userId === second.user_id) throw new Error('INJECTED_MASTERY_FAILURE');
      return setTemplateMastery(userId, ...args);
    };

    expect(() => collection.completeMission(streamKey)).toThrow('INJECTED_MASTERY_FAILURE');

    expect(collection.getStreamMission(streamKey).completed_at_ms).toBeNull();
    for (const monster of [first, second]) {
      expect(collection.getMissionParticipant(streamKey, monster.user_id).rewarded_at_ms).toBeNull();
      expect(collection.getCosmetics(monster.user_id)).not.toContain(`season_badge:${streamKey}`);
      expect(collection.getMastery(monster.user_id, monster.template_id))
        .toEqual(expect.objectContaining({ points: 8, unlocks: [] }));
    }
    expect(emitted).toEqual([]);

    store.setTemplateMastery = setTemplateMastery;
    collection.completeMission(streamKey);

    for (const monster of [first, second]) {
      expect(collection.getMissionParticipant(streamKey, monster.user_id).rewarded_at_ms).toEqual(expect.any(Number));
      expect(collection.getCosmetics(monster.user_id)).toContain(`season_badge:${streamKey}`);
      expect(collection.getMastery(monster.user_id, monster.template_id))
        .toEqual(expect.objectContaining({ points: 11, unlocks: ['title'] }));
    }
    expect(emitted.filter(entry => entry.event === 'streammonsters:mastery_unlocked')).toHaveLength(2);
    expect(emitted.filter(entry => entry.event === 'streammonsters:stream_mission_completed')).toHaveLength(1);
  });

  test('rolls back an essence claim when its write fails so retry can grant the unlock', () => {
    const { store, collection } = createCollection();
    collection.addEssence('viewer-a', 'Ember', 2, 'setup:essence');
    const setElementEssence = store.setElementEssence.bind(store);
    store.setElementEssence = () => {
      throw new Error('INJECTED_ESSENCE_FAILURE');
    };

    expect(() => collection.addEssence('viewer-a', 'Ember', 1, 'duplicate:retry'))
      .toThrow('INJECTED_ESSENCE_FAILURE');
    expect(collection.getEssence('viewer-a', 'Ember'))
      .toEqual(expect.objectContaining({ amount: 2, unlocks: [] }));
    expect(store.db.prepare('SELECT 1 FROM streammonsters_collection_actions WHERE action_key = ?')
      .get('essence:duplicate:retry')).toBeUndefined();

    store.setElementEssence = setElementEssence;
    expect(collection.addEssence('viewer-a', 'Ember', 1, 'duplicate:retry'))
      .toEqual(expect.objectContaining({ amount: 3, unlocks: ['palette'] }));
  });

  test('uses bundled Furry first and Kenney only when the bundled file is missing', () => {
    const { collection } = createCollection();
    const template = TEMPLATE_CATALOG.find(entry => entry.templateId === 'ashfang');
    const artPool = { consumeForTemplate: jest.fn(() => ({ image_url: '/template.png', visual_key: 'ai:template' })) };
    const kenneyBuilder = { build: jest.fn(() => ({ publicUrl: '/kenney.svg', visualSource: 'kenney', visualKey: 'kenney:x' })) };
    expect(collection.selectVisual({ template, egg: { element: 'Ember', variant: 'standard', seed: 'x' }, visualPack: 'art_lab', artPool, kenneyBuilder, hasBundledAsset: () => true }).imageUrl).toBe(template.assetPath);
    expect(collection.selectVisual({ template, egg: { element: 'Ember', variant: 'standard', seed: 'x' }, visualPack: 'furry', artPool, kenneyBuilder, hasBundledAsset: () => true }).imageUrl).toBe(template.assetPath);
    expect(collection.selectVisual({ template, egg: { element: 'Ember', variant: 'standard', seed: 'x' }, visualPack: 'furry', artPool, kenneyBuilder, hasBundledAsset: () => false }).visualSource).toBe('kenney');
    expect(artPool.consumeForTemplate).not.toHaveBeenCalled();
  });

  test('never consumes a historical Art Lab row', () => {
    const { store, collection } = createCollection();
    const template = TEMPLATE_CATALOG.find(entry => entry.templateId === 'ashfang');
    const other = store.addArtPoolSkin({
      artId: 'cinder-art', element: 'Ember', variant: 'standard', provider: 'local',
      imageUrl: '/cinder.png', visualKey: 'ai:cinder', templateId: 'cinder', createdAtMs: 1
    });
    const artPool = {
      consumeForTemplate: (...args) => store.consumeArtPoolSkinForTemplate(...args),
      consume: (...args) => store.consumeArtPoolSkin(...args)
    };
    const visual = collection.selectVisual({
      template,
      egg: { element: 'Ember', variant: 'standard', seed: 'x' },
      visualPack: 'art_lab', artPool, hasBundledAsset: () => true
    });
    expect(visual).toEqual(expect.objectContaining({ imageUrl: template.assetPath, visualSource: 'furry' }));
    expect(store.db.prepare('SELECT status FROM streammonsters_art_pool WHERE art_id = ?').get(other.art_id).status).toBe('ready');
  });
});
