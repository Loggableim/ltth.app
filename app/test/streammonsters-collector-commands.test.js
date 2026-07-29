const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');
const ProgressionService = require('../plugins/streamalchemy/backend/streammonsters/progression-service');
const { resolveBattle } = require('../plugins/streamalchemy/backend/streammonsters/battle-rules-v3');

function createCommands() {
  let now = 1_000;
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const createMonsterFromEgg = store.createMonsterFromEgg.bind(store);
  store.createMonsterFromEgg = (egg, monster) => createMonsterFromEgg(egg, {
    ...monster,
    monsterId: `test-monster:${egg.seed}`
  });
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
    const help = commands.execute({ userId: 'viewer-a' }, 'monstershelp').message;
    expect(help).toContain('!hatch');
    expect(help).toContain('A/B/C');
    expect(help).not.toContain('power|guard|speed');
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

  test('hatches the oldest ready egg when no slot is supplied', () => {
    const { commands, engine, store } = createCommands();
    store.createEgg({
      userId: 'viewer-a',
      giftId: 1,
      giftName: 'Slow Egg',
      element: 'Ember',
      eggColor: '#ef6b45',
      seed: 'slow-default',
      createdAtMs: 900,
      hatchDurationMs: 10_000
    });
    store.createEgg({
      userId: 'viewer-a',
      giftId: 2,
      giftName: 'Ready Egg',
      element: 'Tide',
      eggColor: '#3aaee8',
      seed: 'ready-default',
      createdAtMs: 1_000,
      hatchDurationMs: 0
    });
    engine.markReadyEggs();

    const listed = commands.execute({ userId: 'viewer-a' }, 'eggs');
    const hatched = commands.execute({ userId: 'viewer-a' }, 'hatch');

    expect(listed.eggs.map(egg => egg.state)).toEqual(['incubating', 'ready']);
    expect(hatched.status).toBe('hatched');
    expect(hatched.monster.egg_id).toBe(listed.eggs[1].egg_id);
  });

  test('does not misreport an unexpected hatch failure as an egg wait', () => {
    const { commands, engine } = createCommands();
    engine.hatchEgg = jest.fn(() => {
      throw new Error('database unavailable');
    });

    expect(() => commands.execute({ userId: 'viewer-a' }, 'hatch'))
      .toThrow('database unavailable');
  });

  test('includes the FIFO position when a requested egg is still queued', () => {
    const { commands, store } = createCommands();
    for (let index = 0; index < 4; index += 1) {
      store.createEgg({
        userId: 'viewer-a',
        giftId: index + 1,
        giftName: `Egg ${index + 1}`,
        element: 'Grove',
        eggColor: '#67b96b',
        seed: `queue-${index}`,
        state: index === 3 ? 'queued' : 'incubating',
        createdAtMs: 900 + index,
        hatchDurationMs: 10_000
      });
    }

    const waiting = commands.execute({ userId: 'viewer-a' }, 'hatch', ['4']);

    expect(waiting).toEqual(expect.objectContaining({
      status: 'egg_not_ready',
      wait: expect.objectContaining({
        state: 'queued',
        queuePosition: 1,
        queue_position: 1
      }),
      card: expect.objectContaining({
        placement: 'upper-third',
        queuePosition: 1
      })
    }));
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

  test('produces stance, streak, upset and rivalry cards from persisted battle results', () => {
    const { commands, emitted, spawnReady, store, setNow } = createCommands();
    const monsterA = spawnReady('viewer-a', 1, 1);
    const monsterB = spawnReady('viewer-b', 2, 1);

    commands.execute({ userId: 'viewer-a' }, 'battle', ['power']);
    const first = commands.execute({ userId: 'viewer-b' }, 'battle', ['guard']);
    const winnerId = first.battle.winnerId;
    const loserId = winnerId === monsterA.monster_id ? monsterB.monster_id : monsterA.monster_id;
    store.db.prepare('UPDATE streammonsters_monsters SET level = 1 WHERE monster_id = ?').run(winnerId);
    store.db.prepare('UPDATE streammonsters_monsters SET level = 9 WHERE monster_id = ?').run(loserId);
    const currentA = store.getMonster(monsterA.monster_id);
    const currentB = store.getMonster(monsterB.monster_id);
    const rematchTime = Array.from({ length: 100 }, (_, index) => 2_000 + index)
      .find(candidate => resolveBattle(
        currentA,
        currentB,
        `queue:viewer-a:viewer-b:${candidate}`
      ).winnerId === winnerId);
    expect(rematchTime).toBeDefined();
    setNow(rematchTime);

    commands.execute({ userId: 'viewer-a' }, 'battle', ['speed']);
    store.db.prepare('UPDATE streammonsters_battle_queue SET queued_at_ms = queued_at_ms - 30000')
      .run();
    commands.execute({ userId: 'viewer-b' }, 'battle', ['guard']);

    expect(emitted.filter(entry => entry.event === 'streammonsters:stance_revealed')).toHaveLength(4);
    expect(emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'streammonsters:win_streak',
        payload: expect.objectContaining({ count: 2 })
      }),
      expect.objectContaining({
        event: 'streammonsters:upset',
        payload: expect.objectContaining({
          winner: expect.objectContaining({ monster_id: winnerId })
        })
      }),
      expect.objectContaining({
        event: 'streammonsters:rivalry',
        payload: expect.objectContaining({ count: 2 })
      })
    ]));
  });
});
