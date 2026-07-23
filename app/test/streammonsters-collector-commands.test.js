const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');
const ProgressionService = require('../plugins/streamalchemy/backend/streammonsters/progression-service');

function createCommands() {
  let now = 1_000;
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const emitted = [];
  const engine = new StreamMonstersEngine({
    store,
    now: () => now,
    emit: (event, payload) => emitted.push({ event, payload }),
    config: { hatchDurationMs: 0 }
  });
  engine.setStreamKey('creator:commands');
  const commands = new ChatCommands({
    store,
    engine,
    battleService: new BattleService({ store, now: () => now }),
    progression: new ProgressionService({
      store,
      now: () => new Date(now)
    }),
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => now,
    globalCooldownMs: 0
  });
  const spawnReady = (userId, giftId, level = 1) => {
    store.upsertGiftMapping({
      giftId,
      giftName: `Gift ${giftId}`,
      element: giftId % 2 ? 'Ember' : 'Grove',
      effect: 'spawn',
      enabled: true
    });
    engine.processGift({ userId, giftId, giftName: `Gift ${giftId}`, coinValue: 1 });
    now += 2;
    engine.markReadyEggs();
    const monster = engine.hatchEgg(userId, 1);
    store.db.prepare('UPDATE streammonsters_monsters SET level = ? WHERE monster_id = ?')
      .run(level, monster.monster_id);
    return store.getMonster(monster.monster_id);
  };
  return {
    store,
    engine,
    commands,
    emitted,
    spawnReady,
    setNow(value) {
      now = value;
    }
  };
}

describe('Stream Monsters 1.2 public commands', () => {
  test('supports eggs, explicit hatch, monster detail, rank, quests and help', () => {
    const { commands, engine, store } = createCommands();
    store.upsertGiftMapping({
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });
    engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    engine.markReadyEggs();

    expect(commands.execute({ userId: 'viewer-a' }, 'eggs').status).toBe('eggs');
    expect(commands.execute({ userId: 'viewer-a' }, 'hatch', ['1']).status).toBe('hatched');
    expect(commands.execute({ userId: 'viewer-a' }, 'monster', ['1']).status).toBe('monster');
    expect(commands.execute({ userId: 'viewer-a' }, 'rank').status).toBe('rank');
    const quests = commands.execute({ userId: 'viewer-a' }, 'quests');
    expect(quests.status).toBe('quests');
    expect(quests.daily).toHaveLength(3);
    expect(quests.weekly).toHaveLength(3);
    expect(commands.execute({ userId: 'viewer-a' }, 'monstershelp').message).toContain('!hatch');
  });

  test('does not auto-hatch a ready egg when another command is used', () => {
    const { commands, engine, store } = createCommands();
    store.upsertGiftMapping({
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });
    engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    engine.markReadyEggs();

    commands.execute({ userId: 'viewer-a' }, 'monsters');

    expect(store.getViewerEggs('viewer-a', 'ready')).toHaveLength(1);
    expect(store.getViewerMonsters('viewer-a')).toHaveLength(0);
  });

  test('uses the same egg slot numbers for !eggs and !hatch', () => {
    const { commands, engine, store } = createCommands();
    store.createEgg({
      userId: 'viewer-a',
      giftId: 1,
      giftName: 'Slow Egg',
      element: 'Ember',
      eggColor: '#ef6b45',
      seed: 'slow',
      createdAtMs: 900,
      hatchDurationMs: 10_000
    });
    store.createEgg({
      userId: 'viewer-a',
      giftId: 2,
      giftName: 'Ready Egg',
      element: 'Tide',
      eggColor: '#3aaee8',
      seed: 'ready',
      createdAtMs: 1_000,
      hatchDurationMs: 0
    });
    engine.markReadyEggs();

    const listed = commands.execute({ userId: 'viewer-a' }, 'eggs');
    const hatched = commands.execute({ userId: 'viewer-a' }, 'hatch', ['2']);

    expect(listed.eggs.map(egg => egg.state)).toEqual(['incubating', 'ready']);
    expect(hatched.status).toBe('hatched');
    expect(hatched.monster.egg_id).toBe(listed.eggs[1].egg_id);
  });

  test('matches within two levels first and expands after thirty seconds', () => {
    const { commands, spawnReady, setNow } = createCommands();
    spawnReady('level-one', 1, 1);
    spawnReady('level-ten', 2, 10);
    spawnReady('level-two', 3, 2);

    expect(commands.execute({ userId: 'level-one' }, 'battle').status).toBe('queued');
    expect(commands.execute({ userId: 'level-ten' }, 'battle').status).toBe('queued');
    expect(commands.execute({ userId: 'level-two' }, 'battle').status).toBe('started');

    spawnReady('level-one-b', 4, 1);
    expect(commands.execute({ userId: 'level-one-b' }, 'battle').status).toBe('queued');
    setNow(40_000);
    expect(commands.execute({ userId: 'level-ten' }, 'battle').status).toBe('started');
  });

  test('emits each of the three stored battle rounds before the winner', () => {
    const { commands, emitted, spawnReady } = createCommands();
    spawnReady('viewer-a', 1, 1);
    spawnReady('viewer-b', 2, 1);

    commands.execute({ userId: 'viewer-a' }, 'battle');
    commands.execute({ userId: 'viewer-b' }, 'battle');

    expect(emitted.filter(entry => entry.event === 'streammonsters:battle_round')).toHaveLength(3);
    const completed = emitted.find(entry => entry.event === 'streammonsters:battle_completed');
    expect(completed.payload.battle.rounds).toHaveLength(3);
    expect(completed.payload.battle.elementAdvantageMonsterId).toBeTruthy();
    expect(completed.payload.battle.rounds[0].elementAdvantageMonsterId)
      .toBe(completed.payload.battle.elementAdvantageMonsterId);
  });
});
