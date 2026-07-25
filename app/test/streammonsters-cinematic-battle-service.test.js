const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');

function monster(id, userId, overrides = {}) {
  return {
    monster_id: id,
    user_id: userId,
    name: id,
    element: 'Ember',
    visual_key: 'furry:ashfang',
    image_url: `/assets/${id}.png`,
    personality: 'Brave',
    level: 1,
    stats: { vitality: 7, might: 7, guard: 7, agility: 7 },
    ...overrides
  };
}

describe('Stream Monsters cinematic rules v4 battle resolver', () => {
  test('locks a visible skill choice, rejects uncharged specials and records state before and after each action', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const battles = new BattleService({ store, now: () => 1234 });
    const state = battles.createBattleState(monster('a', 'viewer-a'), monster('b', 'viewer-b'), 'cinematic-seed');

    const round = battles.resolveRound(state, { a: 'C', b: 'B' });

    expect(round.round.actions).toHaveLength(2);
    expect(round.round.actions[0]).toEqual(expect.objectContaining({
      selectedChoice: expect.any(String),
      before: expect.objectContaining({ hp: expect.any(Number), shield: expect.any(Number), charge: 0 }),
      after: expect.objectContaining({ hp: expect.any(Number), shield: expect.any(Number), charge: expect.any(Number) })
    }));
    expect(round.round.actions.some(action => action.requestedChoice === 'C' && action.selectedChoice !== 'C')).toBe(true);
    expect(round.state.rulesVersion).toBe(4);
  });

  test('ends early on a knockout, persists rules v4 snapshots and is replayable from its seed and skill choices', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const battles = new BattleService({ store, now: () => 2222 });
    const state = battles.createBattleState(
      monster('a', 'viewer-a', { stats: { vitality: 7, might: 100, guard: 7, agility: 20 } }),
      monster('b', 'viewer-b', { stats: { vitality: 1, might: 1, guard: 1, agility: 1 } }),
      'knockout-seed'
    );

    const resolved = battles.resolveRound(state, { a: 'A', b: 'B' });
    const result = battles.finalize(resolved.state);

    expect(result).toEqual(expect.objectContaining({
      rulesVersion: 4,
      knockout: expect.objectContaining({ winnerId: 'a', loserId: 'b' }),
      rounds: expect.any(Array)
    }));
    expect(result.rounds).toHaveLength(1);
    expect(JSON.parse(store.getBattle(result.battleId).result_json)).toEqual(result);
  });

  test('unlocks a charged special, consumes its meter and preserves temporary shields in the replay', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const battles = new BattleService({ store });
    const state = battles.createBattleState(monster('a', 'viewer-a'), monster('b', 'viewer-b'), 'charge-seed');
    state.fighters.a.charge = 100;

    const resolved = battles.resolveRound(state, { a: 'C', b: 'B' });
    const special = resolved.round.actions.find(action => action.monsterId === 'a');
    const defense = resolved.round.actions.find(action => action.monsterId === 'b');

    expect(special).toEqual(expect.objectContaining({ selectedChoice: 'C' }));
    expect(special.after.charge).toBe(0);
    expect(defense.after.shield).toBeGreaterThan(0);
  });

  test('uses the saved seed and choices to resolve identical cinematic replays', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const battles = new BattleService({ store, now: () => 3333 });
    const makeResult = () => {
      let state = battles.createBattleState(monster('a', 'viewer-a'), monster('b', 'viewer-b'), 'replay-seed');
      for (const choices of [{ a: 'A', b: 'B' }, { a: 'B', b: 'A' }, { a: 'A', b: 'A' }]) {
        state = battles.resolveRound(state, choices).state;
        if (state.finished) break;
      }
      return battles.finalize(state);
    };

    expect(makeResult()).toEqual(makeResult());
  });

  test('persists post-battle XP and level-up results alongside the chosen skill replay', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const battles = new BattleService({ store });
    const state = battles.createBattleState(
      monster('a', 'viewer-a', { stats: { vitality: 7, might: 100, guard: 7, agility: 20 } }),
      monster('b', 'viewer-b', { stats: { vitality: 1, might: 1, guard: 1, agility: 1 } }),
      'reward-seed'
    );
    const result = battles.finalize(battles.resolveRound(state, { a: 'A', b: 'B' }).state);

    const persisted = battles.persistRewards(result, [{ monsterId: 'a', xpAwarded: 15, levelUps: 1, unspentStatPoints: 1 }]);

    expect(JSON.parse(store.getBattle(result.battleId).result_json)).toEqual(expect.objectContaining({
      rewards: [{ monsterId: 'a', xpAwarded: 15, levelUps: 1, unspentStatPoints: 1 }]
    }));
    expect(persisted.rewards).toHaveLength(1);
  });
});
