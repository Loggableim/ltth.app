const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');

function createCommands(options = {}) {
  let now = 1_000;
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const engine = new StreamMonstersEngine({ store, now: () => now, config: { hatchDurationMs: 0 } });
  const emitted = [];
  const commands = new ChatCommands({
    store,
    engine,
    battleService: new BattleService({ store, now: () => now }),
    collection: options.collection || null,
    freeEggDropService: options.freeEggDropService || null,
    ownedReadyEggRescueService: options.ownedReadyEggRescueService || null,
    unhatchedEggStealService: options.unhatchedEggStealService || null,
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
  return { store, engine, commands, emitted, hatch, setNow: value => { now = value; } };
}

describe('Stream Monsters chat commands', () => {
  test('returns the viewer inventory without exposing other viewers', () => {
    const { commands, hatch } = createCommands();
    hatch('viewer-a', 1);
    hatch('viewer-b', 2);

    const result = commands.execute({ userId: 'viewer-a' }, 'inventory');

    expect(result.success).toBe(true);
    expect(result.message).toContain('1 monster');
    expect(result.message).not.toContain('viewer-b');
  });

  test('selects an owned monster by one-based inventory slot', () => {
    const { store, commands, hatch } = createCommands();
    hatch('viewer-a', 1);
    hatch('viewer-a', 2);

    const result = commands.execute({ userId: 'viewer-a' }, 'choose', ['2']);

    expect(result.success).toBe(true);
    expect(store.getSelectedMonster('viewer-a').egg_id).toBe(store.getViewerMonsters('viewer-a')[1].egg_id);
  });

  test('pairs two queued viewers into a visible deterministic battle', () => {
    const { commands, emitted, hatch } = createCommands();
    hatch('viewer-a', 1);
    hatch('viewer-b', 2);

    expect(commands.execute({ userId: 'viewer-a' }, 'battle').status).toBe('queued');
    const result = commands.execute({ userId: 'viewer-b' }, 'battle');

    expect(result.status).toBe('started');
    expect(emitted.map(entry => entry.event)).toContain('streammonsters:battle_started');
    expect(emitted.map(entry => entry.event)).toContain('streammonsters:battle_completed');
    const grouped = emitted.filter(entry => [
      'streammonsters:stance_revealed',
      'streammonsters:battle_started',
      'streammonsters:battle_round',
      'streammonsters:battle_completed'
    ].includes(entry.event));
    expect(grouped).not.toHaveLength(0);
    expect(grouped.every(entry => entry.payload.battleId === result.battle.battleId)).toBe(true);
  });

  test('records one atomic collection outcome for both battle fighters', () => {
    const collection = { recordBattleOutcome: jest.fn() };
    const { commands, hatch } = createCommands({ collection });
    hatch('viewer-a', 1);
    hatch('viewer-b', 2);

    commands.execute({ userId: 'viewer-a' }, 'battle');
    const result = commands.execute({ userId: 'viewer-b' }, 'battle');

    expect(collection.recordBattleOutcome).toHaveBeenCalledTimes(1);
    expect(collection.recordBattleOutcome).toHaveBeenCalledWith(expect.objectContaining({
      battleId: result.battle.battleId,
      fighters: expect.arrayContaining([
        expect.objectContaining({ monster: expect.objectContaining({ user_id: 'viewer-a' }) }),
        expect.objectContaining({ monster: expect.objectContaining({ user_id: 'viewer-b' }) })
      ])
    }));
  });

  test('expires queue entries after five minutes and lets a viewer leave', () => {
    const { commands, hatch, setNow } = createCommands();
    hatch('viewer-a', 1);
    hatch('viewer-b', 2);
    commands.execute({ userId: 'viewer-a' }, 'battle');
    setNow(301_001);

    expect(commands.execute({ userId: 'viewer-b' }, 'battle').status).toBe('queued');
    expect(commands.execute({ userId: 'viewer-b' }, 'leavebattle').status).toBe('left');
  });

  test('keeps command execution transport-neutral while allowing battle pairs instantly', () => {
    const { commands, hatch } = createCommands();
    hatch('viewer-a', 1);
    hatch('viewer-b', 2);

    expect(commands.execute({ userId: 'viewer-a' }, 'inventory').status).toBe('inventory');
    expect(commands.execute({ userId: 'viewer-b' }, 'inventory').status).toBe('inventory');
    expect(commands.execute({ userId: 'viewer-a' }, 'battle').status).toBe('queued');
    expect(commands.execute({ userId: 'viewer-b' }, 'battle').status).toBe('started');
  });

  test('keeps adopt limited to free eggs and routes steal to the separate service', () => {
    const freeEggDropService = {
      adopt: () => ({ success: false, status: 'no_offer' })
    };
    const ownedReadyEggRescueService = {
      adopt: () => ({ success: true, status: 'claimed', adoptionSource: 'rescue' })
    };
    const unhatchedEggStealService = {
      steal: () => ({ success: true, status: 'claimed', adoptionSource: 'steal' })
    };
    const { commands } = createCommands({
      freeEggDropService,
      ownedReadyEggRescueService,
      unhatchedEggStealService
    });

    expect(commands.execute({ userId: 'viewer-a' }, 'adopt')).toEqual(
      expect.objectContaining({ success: false, status: 'no_offer' })
    );
    expect(commands.execute({ userId: 'viewer-a' }, 'steal')).toEqual(
      expect.objectContaining({ success: true, adoptionSource: 'steal' })
    );
  });

  test('does not let a viewer steal while they still own a ready egg', () => {
    const unhatchedEggStealService = { steal: jest.fn() };
    const { store, engine, commands } = createCommands({ unhatchedEggStealService });
    store.upsertGiftMapping({
      giftId: 99,
      giftName: 'Ready Gift',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });
    engine.processGift({
      userId: 'ready-owner',
      giftId: 99,
      giftName: 'Ready Gift',
      coinValue: 1
    });
    engine.markReadyEggs();

    expect(commands.execute({ userId: 'ready-owner' }, 'steal')).toEqual(
      expect.objectContaining({
        success: false,
        status: 'own_ready_egg',
        messageKey: 'stealOwnReadyEgg',
        params: expect.objectContaining({ command: '!hatch', slot: 1 })
      })
    );
    expect(unhatchedEggStealService.steal).not.toHaveBeenCalled();
  });
});
