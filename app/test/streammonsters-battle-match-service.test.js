const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');
const ProgressionService = require('../plugins/streamalchemy/backend/streammonsters/progression-service');
const BattleMatchService = require('../plugins/streamalchemy/backend/streammonsters/battle-match-service');

function createArena() {
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const emitted = [];
  const engine = new StreamMonstersEngine({ store, config: { hatchDurationMs: 0 }, now: () => Date.now() });
  engine.setStreamKey('creator:arena');
  const progression = new ProgressionService({ store, now: () => new Date(Date.now()) });
  const service = new BattleMatchService({
    store,
    engine,
    progression,
    battleService: new BattleService({ store, now: () => Date.now() }),
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => Date.now(),
    actionDelayMs: 1_000
  });
  const addMonster = (userId, element = 'Ember') => {
    const egg = store.createEgg({
      userId,
      giftId: 1,
      giftName: 'Test',
      element,
      eggColor: '#fff',
      seed: `${userId}:egg`,
      createdAtMs: Date.now(),
      hatchDurationMs: 0
    });
    return store.createMonsterFromEgg(egg, {
      name: `${userId} monster`,
      rarity: 'Standard',
      personality: 'Brave',
      stats: { vitality: 7, might: 7, guard: 7, agility: 7 },
      visualKey: 'furry:ashfang',
      visualSource: 'furry',
      createdAtMs: Date.now()
    });
  };
  return { store, service, emitted, addMonster };
}

describe('Stream Monsters cinematic BattleMatchService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('reserves a fair match, waits up to 30 seconds for monster selection and falls back to active monsters', () => {
    const { service, emitted, addMonster } = createArena();
    const a = addMonster('viewer-a');
    const b = addMonster('viewer-b', 'Grove');

    expect(service.join('viewer-a')).toEqual(expect.objectContaining({ status: 'queued' }));
    expect(service.join('viewer-b')).toEqual(expect.objectContaining({ status: 'match_found' }));
    expect(emitted.find(entry => entry.event === 'streammonsters:battle_match_found').payload.match.participants)
      .toEqual(expect.arrayContaining([expect.objectContaining({ userId: 'viewer-a' }), expect.objectContaining({ userId: 'viewer-b' })]));

    jest.advanceTimersByTime(30_000);
    jest.advanceTimersByTime(3_000);
    expect(service.activeMatch.phase).toBe('skill_selection');
    expect(service.activeMatch.participants['viewer-a'].monsterId).toBe(a.monster_id);
    expect(service.activeMatch.participants['viewer-b'].monsterId).toBe(b.monster_id);
    expect(emitted.map(entry => entry.event)).toContain('streammonsters:battle_roster_locked');
    service.destroy();
  });

  test('accepts only the first raw A/B/C input from each participant and locks it visibly before resolving', () => {
    const { service, emitted, addMonster } = createArena();
    addMonster('viewer-a');
    addMonster('viewer-b', 'Grove');
    service.join('viewer-a');
    service.join('viewer-b');
    service.chooseMonster('viewer-a', 1);
    service.chooseMonster('viewer-b', 1);
    jest.advanceTimersByTime(3_000);

    expect(service.handleRawResponse({ userId: 'viewer-c' }, 'A')).toEqual({ handled: false });
    expect(service.handleRawResponse({ userId: 'viewer-a' }, 'C')).toEqual(expect.objectContaining({
      handled: true,
      result: expect.objectContaining({ status: 'skill_unavailable' })
    }));
    expect(service.handleRawResponse({ userId: 'viewer-a' }, 'A')).toEqual(expect.objectContaining({ handled: true }));
    expect(service.handleRawResponse({ userId: 'viewer-a' }, 'B')).toEqual(expect.objectContaining({
      handled: true,
      result: expect.objectContaining({ status: 'skill_already_locked' })
    }));
    expect(service.handleRawResponse({ userId: 'viewer-b' }, 'B')).toEqual(expect.objectContaining({ handled: true }));

    expect(emitted.filter(entry => entry.event === 'streammonsters:battle_skill_locked')).toHaveLength(2);
    expect(emitted.find(entry => entry.event === 'streammonsters:battle_round')).toBeDefined();
    expect(service.activeMatch.phase).toBe('resolving');
    jest.advanceTimersByTime(1_000);
    expect(service.activeMatch.phase).toBe('skill_selection');
    service.destroy();
  });

  test('avoids a recent rematch whenever another level-eligible viewer is available', () => {
    const { service, addMonster } = createArena();
    const a = addMonster('viewer-a');
    const b = addMonster('viewer-b', 'Grove');
    const c = addMonster('viewer-c', 'Tide');
    service.rematchAt.set(service.rematchKey('viewer-a', 'viewer-b'), Date.now());
    service.queue = [
      { userId: 'viewer-a', monster: a, queuedAt: Date.now() },
      { userId: 'viewer-b', monster: b, queuedAt: Date.now() },
      { userId: 'viewer-c', monster: c, queuedAt: Date.now() }
    ];

    service.tryMatch();

    expect(Object.keys(service.activeMatch.participants)).toEqual(expect.arrayContaining(['viewer-a', 'viewer-c']));
    expect(Object.keys(service.activeMatch.participants)).not.toContain('viewer-b');
    service.destroy();
  });

  test('cancels only a pre-battle reservation with !leavebattle and grants no rewards', () => {
    const { service, emitted, addMonster, store } = createArena();
    const a = addMonster('viewer-a');
    addMonster('viewer-b', 'Grove');
    service.join('viewer-a');
    service.join('viewer-b');

    expect(service.leave('viewer-a')).toEqual(expect.objectContaining({ status: 'match_cancelled' }));
    expect(service.activeMatch).toBeNull();
    expect(store.getMonster(a.monster_id).xp).toBe(0);
    expect(emitted.find(entry => entry.event === 'streammonsters:battle_cancelled')).toBeDefined();
    service.destroy();
  });

  test('claims raw 1–4 only for an active stat prompt and auto-assigns deterministically on timeout', () => {
    const { service, emitted, addMonster, store } = createArena();
    const monster = addMonster('viewer-a');
    store.db.prepare('UPDATE streammonsters_monsters SET unspent_stat_points = 1 WHERE monster_id = ?')
      .run(monster.monster_id);

    service.openStatPrompt('viewer-a', monster.monster_id, 'stat-seed');
    expect(service.handleRawResponse({ userId: 'other' }, '2')).toEqual({ handled: false });
    expect(service.handleRawResponse({ userId: 'viewer-a' }, '2')).toEqual(expect.objectContaining({ handled: true }));
    expect(store.getMonster(monster.monster_id).stats.might).toBe(8);

    store.db.prepare('UPDATE streammonsters_monsters SET unspent_stat_points = 1 WHERE monster_id = ?')
      .run(monster.monster_id);
    service.openStatPrompt('viewer-a', monster.monster_id, 'stat-seed');
    jest.advanceTimersByTime(30_000);
    expect(store.getMonster(monster.monster_id).unspent_stat_points).toBe(0);
    expect(emitted.map(entry => entry.event)).toContain('streammonsters:monster_stat_auto_assigned');
    service.destroy();
  });
});
