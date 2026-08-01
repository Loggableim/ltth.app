const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/stream-monsters/backend/streammonsters/game-engine');
const BattleService = require('../plugins/stream-monsters/backend/streammonsters/battle-service');
const ChatCommands = require('../plugins/stream-monsters/backend/streammonsters/chat-commands');
const CollectionService = require('../plugins/stream-monsters/backend/streammonsters/collection-service');
const ProgressionService = require('../plugins/stream-monsters/backend/streammonsters/progression-service');

function createLifecycle() {
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const emitted = [];
  const emit = (event, payload) => emitted.push({ event, payload });
  const collection = new CollectionService({ store, emit, now: () => 10_000 });
  const progression = new ProgressionService({
    store,
    emit,
    now: () => new Date(10_000)
  });
  const engine = new StreamMonstersEngine({
    store,
    collection,
    progression,
    emit,
    now: () => 10_000,
    config: { hatchDurationMs: 0 }
  });
  const commands = new ChatCommands({
    store,
    engine,
    collection,
    progression,
    battleService: new BattleService({ store, now: () => 10_000 }),
    emit,
    now: () => 10_000
  });
  return { store, collection, progression, engine, commands, emitted };
}

function findMissionStream(collection, missionKey, prefix) {
  return Array.from({ length: 64 }, (_, index) => `${prefix}-${index}`).find(streamKey => (
    collection.getStreamMission(streamKey).mission_key === missionKey
  ));
}

function createReadyEgg(store, userId, eggId, element = 'Ember') {
  return store.createEgg({
    eggId,
    userId,
    giftId: 1,
    giftName: 'Test Gift',
    element,
    eggColor: '#ef6b45',
    seed: `seed:${eggId}`,
    state: 'ready',
    readyAtMs: 10_000,
    createdAtMs: 1,
    hatchDurationMs: 0
  });
}

function createMonster(store, { userId, monsterId, templateId, element }) {
  const egg = createReadyEgg(store, userId, `egg:${monsterId}`, element);
  return store.createMonsterFromEgg(egg, {
    monsterId,
    templateId,
    name: monsterId,
    rarity: 'Standard',
    personality: 'Curious',
    stats: { vitality: 7, might: 7, guard: 7, agility: 7 },
    imageUrl: `/${monsterId}.png`,
    visualSource: 'furry',
    visualKey: `furry:${templateId}`,
    createdAtMs: 2
  });
}

describe('Stream Monsters lifecycle atomicity', () => {
  test('rolls back the complete hatch lifecycle and retries the same ready egg', () => {
    const { store, collection, engine, emitted } = createLifecycle();
    const streamKey = findMissionStream(collection, 'six_hatches', 'hatch-lifecycle');
    engine.setStreamKey(streamKey);
    const egg = createReadyEgg(store, 'viewer-a', 'egg:hatch-retry');
    const setTemplateMastery = store.setTemplateMastery.bind(store);
    store.setTemplateMastery = () => {
      throw new Error('INJECTED_HATCH_MASTERY_FAILURE');
    };

    expect(() => engine.hatchEgg('viewer-a', 1)).toThrow('INJECTED_HATCH_MASTERY_FAILURE');

    expect(store.getEgg(egg.egg_id)).toEqual(expect.objectContaining({
      state: 'ready',
      monster_id: null
    }));
    expect(store.getViewerMonsters('viewer-a')).toEqual([]);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM streammonsters_template_reservations').get().count).toBe(0);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM streammonsters_viewer_progress').get().count).toBe(0);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM streammonsters_quests').get().count).toBe(0);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM streammonsters_achievements').get().count).toBe(0);
    expect(collection.getStreamMission(streamKey)).toEqual(expect.objectContaining({ progress: 0 }));
    expect(store.getMissionParticipants(streamKey)).toEqual([]);
    expect(emitted).toEqual([]);

    store.setTemplateMastery = setTemplateMastery;
    const monster = engine.hatchEgg('viewer-a', 1);

    expect(store.getEgg(egg.egg_id)).toEqual(expect.objectContaining({
      state: 'hatched',
      monster_id: monster.monster_id
    }));
    expect(collection.getMastery('viewer-a', monster.template_id).points).toBe(5);
    expect(collection.getStreamMission(streamKey)).toEqual(expect.objectContaining({ progress: 1 }));
    expect(emitted.filter(entry => entry.event === 'streammonsters:hatch_started')).toHaveLength(1);
    expect(emitted.filter(entry => entry.event === 'streammonsters:egg_hatched')).toHaveLength(1);
  });

  test('rolls back battle queue, battle, progression and collection before retrying the same match', () => {
    const { store, collection, engine, commands, progression, emitted } = createLifecycle();
    const streamKey = findMissionStream(collection, 'three_battles', 'battle-lifecycle');
    engine.setStreamKey(streamKey);
    const left = createMonster(store, {
      userId: 'left',
      monsterId: 'monster:left',
      templateId: 'ashfang',
      element: 'Ember'
    });
    const right = createMonster(store, {
      userId: 'right',
      monsterId: 'monster:right',
      templateId: 'ripple',
      element: 'Tide'
    });
    collection.addMastery(left.user_id, left.template_id, 8, 'setup:left');
    collection.addMastery(right.user_id, right.template_id, 8, 'setup:right');
    expect(commands.execute({ userId: left.user_id }, 'battle').status).toBe('queued');
    emitted.length = 0;
    const setTemplateMastery = store.setTemplateMastery.bind(store);
    store.setTemplateMastery = (userId, ...args) => {
      if (userId === right.user_id) throw new Error('INJECTED_BATTLE_MASTERY_FAILURE');
      return setTemplateMastery(userId, ...args);
    };

    expect(() => commands.execute({ userId: right.user_id }, 'battle'))
      .toThrow('INJECTED_BATTLE_MASTERY_FAILURE');

    expect(store.db.prepare('SELECT COUNT(*) AS count FROM streammonsters_battles').get().count).toBe(0);
    expect(store.getBattleQueue().map(entry => entry.user_id)).toEqual([left.user_id]);
    expect(store.getViewerBattleStats(left.user_id).battle_count).toBe(0);
    expect(store.getViewerBattleStats(right.user_id).battle_count).toBe(0);
    expect(collection.getMastery(left.user_id, left.template_id).points).toBe(8);
    expect(collection.getMastery(right.user_id, right.template_id).points).toBe(8);
    expect(collection.getStreamMission(streamKey)).toEqual(expect.objectContaining({ progress: 0 }));
    expect(store.getMissionParticipants(streamKey)).toEqual([]);
    expect(store.getViewerQuests(right.user_id, progression.dateKey())).toEqual([]);
    expect(emitted).toEqual([]);

    store.setTemplateMastery = setTemplateMastery;
    const result = commands.execute({ userId: right.user_id }, 'battle');

    expect(result.status).toBe('started');
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM streammonsters_battles').get().count).toBe(1);
    expect(store.getBattleQueue()).toEqual([]);
    expect(store.getViewerBattleStats(left.user_id).battle_count).toBe(1);
    expect(store.getViewerBattleStats(right.user_id).battle_count).toBe(1);
    expect(collection.getMastery(left.user_id, left.template_id))
      .toEqual(expect.objectContaining({ points: expect.any(Number), unlocks: ['title'] }));
    expect(collection.getMastery(right.user_id, right.template_id))
      .toEqual(expect.objectContaining({ points: expect.any(Number), unlocks: ['title'] }));
    expect(collection.getStreamMission(streamKey)).toEqual(expect.objectContaining({ progress: 1 }));
    expect(store.getMissionParticipants(streamKey).map(item => item.user_id)).toEqual(['left', 'right']);
    expect(emitted.filter(entry => entry.event === 'streammonsters:mastery_unlocked')).toHaveLength(2);
    expect(emitted.filter(entry => entry.event === 'streammonsters:battle_started')).toHaveLength(1);
    expect(emitted.filter(entry => entry.event === 'streammonsters:battle_completed')).toHaveLength(1);
  });
});
