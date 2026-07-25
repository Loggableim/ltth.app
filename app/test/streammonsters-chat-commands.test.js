const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');

function createCommands() {
  let now = 1_000;
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const engine = new StreamMonstersEngine({ store, now: () => now, config: { hatchDurationMs: 0 } });
  const emitted = [];
  const commands = new ChatCommands({
    store,
    engine,
    battleService: new BattleService({ store, now: () => now }),
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => now
  });
  const hatch = (userId, giftId) => {
    store.upsertGiftMapping({
      giftId, giftName: `Gift ${giftId}`, element: giftId % 2 ? 'Ember' : 'Tide', effect: 'spawn', enabled: true
    });
    engine.processGift({ userId, giftId, giftName: `Gift ${giftId}`, coinValue: 1 });
    return engine.hatchReadyEggs(userId)[0];
  };
  return { store, commands, emitted, hatch, setNow: value => { now = value; } };
}

describe('Stream Monsters chat commands', () => {
  test('returns the viewer inventory without exposing other viewers', () => {
    const { commands, hatch } = createCommands();
    hatch('viewer-a', 1);
    hatch('viewer-b', 2);

    const result = commands.handle({ username: 'viewer-a' }, '!inventory');

    expect(result.success).toBe(true);
    expect(result.message).toContain('1 monster');
    expect(result.message).not.toContain('viewer-b');
  });

  test('selects an owned monster by one-based inventory slot', () => {
    const { store, commands, hatch } = createCommands();
    hatch('viewer-a', 1);
    hatch('viewer-a', 2);

    const result = commands.handle({ username: 'viewer-a' }, '!choose 2');

    expect(result.success).toBe(true);
    expect(store.getSelectedMonster('viewer-a').egg_id).toBe(store.getViewerMonsters('viewer-a')[1].egg_id);
  });

  test('pairs two queued viewers into a visible deterministic battle', () => {
    const { commands, emitted, hatch } = createCommands();
    hatch('viewer-a', 1);
    hatch('viewer-b', 2);

    expect(commands.handle({ username: 'viewer-a' }, '!battle').status).toBe('queued');
    const result = commands.handle({ username: 'viewer-b' }, '!battle');

    expect(result.status).toBe('started');
    expect(emitted.map(entry => entry.event)).toContain('streammonsters:battle_started');
    expect(emitted.map(entry => entry.event)).toContain('streammonsters:battle_completed');
  });

  test('expires queue entries after five minutes and lets a viewer leave', () => {
    const { commands, hatch, setNow } = createCommands();
    hatch('viewer-a', 1);
    hatch('viewer-b', 2);
    commands.handle({ username: 'viewer-a' }, '!battle');
    setNow(301_001);

    expect(commands.handle({ username: 'viewer-b' }, '!battle').status).toBe('queued');
    expect(commands.handle({ username: 'viewer-b' }, '!leavebattle').status).toBe('left');
  });

  test('applies a short global cooldown to non-battle commands while allowing battle pairs instantly', () => {
    const { commands, hatch } = createCommands();
    hatch('viewer-a', 1);
    hatch('viewer-b', 2);

    expect(commands.handle({ username: 'viewer-a' }, '!inventory').status).toBe('inventory');
    expect(commands.handle({ username: 'viewer-b' }, '!inventory')).toEqual(expect.objectContaining({ status: 'global_cooldown' }));
    expect(commands.handle({ username: 'viewer-a' }, '!battle').status).toBe('queued');
    expect(commands.handle({ username: 'viewer-b' }, '!battle').status).toBe('started');
  });

  test('skips domain cooldowns when GCCE already owns cooldown enforcement', () => {
    const { commands, hatch } = createCommands();
    hatch('viewer-a', 1);
    hatch('viewer-b', 2);

    expect(commands.handle({ username: 'viewer-a', skipCooldowns: true }, '!monsters').status)
      .toBe('inventory');
    expect(commands.handle({ username: 'viewer-b', skipCooldowns: true }, '!monsters').status)
      .toBe('inventory');
  });

  test('advertises the non-conflicting Monster rank command in help', () => {
    const { commands } = createCommands();

    expect(commands.handle({ username: 'viewer-a' }, '!monstershelp').message)
      .toContain('!monsterrank');
  });
});
