const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');
const { getTemplatesForElement } = require('../plugins/streamalchemy/backend/streammonsters/catalog');

const ELEMENTS = ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'];

function createStore() {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

function monster(id, element, overrides = {}) {
  return {
    monster_id: id,
    user_id: `user-${id}`,
    name: id,
    element,
    template_id: getTemplatesForElement(element)[0].templateId,
    personality: 'Adaptive',
    level: 1,
    xp: 0,
    stats: { vitality: 7, might: 7, guard: 7, agility: 7 },
    ...overrides
  };
}

function resolveScenario(element, actionType, options = {}) {
  const { store } = createStore();
  const actor = monster('actor', element, options.actor);
  const target = monster('target', element, options.target);
  const battle = new BattleService({ store, now: () => 1_000 }).resolve(
    actor,
    target,
    options.seed || `${element}:${actionType}`,
    'power',
    'guard',
    {
      actionPlan: {
        actor: [actionType, 'defense', 'defense'],
        target: ['defense', 'defense', 'defense']
      },
      initialState: options.initialState || {},
      disableElementAdvantage: true
    }
  );
  return {
    battle,
    action: battle.rounds?.[0]?.actions?.find(entry => entry.actorId === 'actor')
  };
}

describe('Stream Monsters rules-v3 exact element skills', () => {
  test.each([
    ['Ember', { attack: ['burn', 2], defense: ['shield', 4, 'thorns', 2], special: ['damageBonus', 5, 'heal', 2] }],
    ['Tide', { attack: ['outgoingDamageReduction', 2], defense: ['shield', 3, 'heal', 3], special: ['damageBonus', 1, 'heal', 6] }],
    ['Grove', { attack: ['thorns', 2], defense: ['shield', 7], special: ['shield', 5, 'heal', 3] }],
    ['Gale', { attack: ['hitCount', 2, 'damageBonus', 1], defense: ['evadeOrShield', 35, 3], special: ['hitCount', 3, 'damageBonus', 4] }],
    ['Volt', { attack: ['shieldRemoval', 2], defense: ['shield', 4, 'reflect', 2], special: ['damageBonus', 4, 'shieldPenetration', 4] }],
    ['Lunar', { attack: ['damageBonus', -1, 'heal', 3], defense: ['shield', 5, 'outgoingDamageReduction', 1], special: ['damageBonus', 2, 'lifestealDivisor', 2] }]
  ])('%s exposes its exact attack, defense and special mechanics', (element, expected) => {
    for (const type of ['attack', 'defense', 'special']) {
      const initialState = type === 'special'
        ? { actor: { hp: 12, charged: true } }
        : (expected[type]?.includes('heal') ? { actor: { hp: 12 } } : {});
      const { action } = resolveScenario(element, type, {
        initialState,
        target: element === 'Volt' ? { initialShield: 8 } : undefined
      });

      expect(action).toEqual(expect.objectContaining({
        round: 1,
        actorId: 'actor',
        targetId: 'target',
        skill: expect.objectContaining({
          id: `${getTemplatesForElement(element)[0].templateId}:${type}`,
          type,
          name: expect.any(String),
          vfxKey: expect.any(String)
        }),
        before: expect.any(Object),
        after: expect.any(Object),
        hits: expect.any(Array),
        appliedEffects: expect.any(Array),
        consumedEffects: expect.any(Array),
        seedRolls: expect.any(Array),
        maxHp: expect.any(Object)
      }));
      expect(action.mechanics).toEqual(expected[type]);
      const mechanics = expected[type];
      const effectAmount = effectType => {
        const index = mechanics.indexOf(effectType);
        return index >= 0 ? mechanics[index + 1] : null;
      };
      for (const effectType of ['burn', 'shield', 'thorns', 'reflect', 'outgoingDamageReduction']) {
        const amount = effectAmount(effectType);
        if (amount !== null) {
          expect(action.appliedEffects).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: effectType, amount })
          ]));
        }
      }
      const requestedHeal = effectAmount('heal');
      if (requestedHeal !== null) {
        expect(action.appliedEffects).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: 'heal', requested: requestedHeal })
        ]));
      }
      const expectedHits = effectAmount('hitCount');
      if (expectedHits !== null) expect(action.hits).toHaveLength(expectedHits);
      const shieldRemoval = effectAmount('shieldRemoval');
      if (shieldRemoval !== null) {
        expect(action.consumedEffects).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: 'shieldRemoval', amount: shieldRemoval })
        ]));
        expect(action.hits.reduce((sum, hit) => sum + hit.shieldRemoved, 0))
          .toBe(shieldRemoval);
      }
      const penetration = effectAmount('shieldPenetration');
      if (penetration !== null) {
        expect(action.hits.reduce((sum, hit) => sum + hit.shieldPenetrated, 0)).toBe(penetration);
      }
      const lifestealDivisor = effectAmount('lifestealDivisor');
      if (lifestealDivisor !== null) {
        const hpDamage = action.hits.reduce((sum, hit) => sum + hit.hpDamage, 0);
        expect(action.appliedEffects).toEqual(expect.arrayContaining([
          expect.objectContaining({
            type: 'heal',
            requested: Math.floor(hpDamage / lifestealDivisor)
          })
        ]));
      }
      if (type !== 'defense') {
        const combined = action.hits.reduce((sum, hit) => sum + hit.preMitigationDamage, 0);
        const bonusIndex = expected[type].indexOf('damageBonus');
        const damageBonus = bonusIndex >= 0 ? expected[type][bonusIndex + 1] : 0;
        expect(combined).toBe(Math.max(1, action.baseDamage + damageBonus));
      }
    }
  });

  test('Gale defense records the deterministic evade roll and either evade or fallback shield', () => {
    const outcomes = Array.from({ length: 32 }, (_, seed) => (
      resolveScenario('Gale', 'defense', { seed: `gale-defense:${seed}` }).action
    ));
    expect(outcomes.some(action => action?.appliedEffects?.some(effect => effect.type === 'evade'))).toBe(true);
    expect(outcomes.some(action => action?.appliedEffects?.some(effect => effect.type === 'shield' && effect.amount === 3))).toBe(true);
    expect(outcomes.every(action => action?.seedRolls?.some(roll => roll.purpose === 'galeDefense'))).toBe(true);
  });

  test.each([
    ['Ember', 'evade-ember-0'],
    ['Tide', 'evade-tide-3'],
    ['Volt', 'evade-volt-6']
  ])('Gale evade prevents the complete incoming %s action and all target-side effects', (element, seed) => {
    const { store } = createStore();
    const gale = monster('gale', 'Gale', {
      stats: { vitality: 7, might: 7, guard: 7, agility: 20 }
    });
    const attacker = monster(element.toLowerCase(), element, {
      stats: { vitality: 7, might: 7, guard: 7, agility: 10 }
    });
    const result = new BattleService({ store }).resolve(
      gale,
      attacker,
      seed,
      null,
      null,
      {
        actionPlan: {
          gale: ['defense', 'defense', 'defense'],
          [attacker.monster_id]: ['attack', 'defense', 'defense']
        },
        initialState: { gale: { shield: 6 } },
        disableElementAdvantage: true
      }
    );
    const defense = result.rounds[0].actions.find(action => action.actorId === 'gale');
    const incoming = result.rounds[0].actions.find(action => action.actorId === attacker.monster_id);

    expect(defense.appliedEffects).toContainEqual(expect.objectContaining({ type: 'evade' }));
    expect(incoming.hits).not.toHaveLength(0);
    expect(incoming.hits.every(hit => (
      hit.evaded &&
      hit.hpDamage === 0 &&
      hit.shieldAbsorbed === 0 &&
      hit.shieldRemoved === 0 &&
      hit.shieldPenetrated === 0
    ))).toBe(true);
    expect(incoming.after.target).toEqual(expect.objectContaining({
      hp: incoming.before.target.hp,
      shield: 6,
      burn: [],
      outgoingDamageReduction: 0,
      evadeNextAction: false
    }));
    expect(incoming.appliedEffects.filter(effect => effect.targetId === 'gale')).toEqual([]);
    expect(incoming.consumedEffects).toEqual([
      { type: 'evade', scope: 'incomingAction' }
    ]);
  });
});

describe('Stream Monsters automatic rules-v3 battles', () => {
  test('ignores legacy stance arguments without changing identity, actions, damage or winner', () => {
    const left = monster('left', 'Ember', { personality: 'Aggressive' });
    const right = monster('right', 'Tide', { personality: 'Defensive' });
    const firstStore = createStore().store;
    const secondStore = createStore().store;

    const first = new BattleService({ store: firstStore }).resolve(left, right, 'same-seed', 'power', 'guard');
    const second = new BattleService({ store: secondStore }).resolve(left, right, 'same-seed', 'speed', 'power');

    expect(first.battleId).toBe(second.battleId);
    expect(first.winnerId).toBe(second.winnerId);
    expect(first.rounds).toEqual(second.rounds);
  });

  test('uses personality for automatic choices and adaptive defense when materially behind', () => {
    const choices = personality => Array.from({ length: 40 }, (_, index) => {
      const { store } = createStore();
      const result = new BattleService({ store }).resolve(
        monster(`actor-${index}`, 'Ember', {
          personality,
          ...(personality === 'Adaptive'
            ? { stats: { vitality: 7, might: 7, guard: 7, agility: 20 } }
            : {})
        }),
        monster(`target-${index}`, 'Ember', { personality: 'Adaptive' }),
        `personality:${index}`,
        null,
        null,
        {
          initialState: personality === 'Adaptive' ? { [`actor-${index}`]: { hp: 20 } } : {},
          disableElementAdvantage: true
        }
      );
      return result.rounds[0].actions
        ?.find(action => action.actorId === `actor-${index}`)
        ?.skill?.type || 'missing';
    });

    const attacks = choices('Aggressive').filter(type => type === 'attack').length;
    const defenses = choices('Defensive').filter(type => type === 'defense').length;
    expect(attacks).toBeGreaterThan(20);
    expect(defenses).toBeGreaterThan(20);
    expect(choices('Adaptive').every(type => type === 'defense')).toBe(true);
  });

  test('preserves every seeded automatic decision roll in the resolved action', () => {
    const { store } = createStore();
    const result = new BattleService({ store }).resolve(
      monster('left', 'Ember', { personality: 'Aggressive' }),
      monster('right', 'Tide', { personality: 'Defensive' }),
      'decision-rolls'
    );
    const automaticActions = result.rounds.flatMap(round => round.actions)
      .filter(action => action.skill.type !== 'special');

    expect(automaticActions).not.toHaveLength(0);
    automaticActions.forEach(action => {
      expect(action.seedRolls).toContainEqual(expect.objectContaining({
        purpose: 'automaticDecision',
        value: expect.any(Number),
        threshold: expect.any(Number),
        choice: action.skill.type
      }));
    });
  });

  test('charges at or below forty percent once and uses the special once on the next own action', () => {
    const { store } = createStore();
    const result = new BattleService({ store }).resolve(
      monster('charger', 'Tide', {
        stats: { vitality: 5, might: 5, guard: 5, agility: 5 }
      }),
      monster('hitter', 'Volt', {
        stats: { vitality: 5, might: 20, guard: 5, agility: 20 }
      }),
      'charge-once',
      null,
      null,
      {
        actionPlan: {
          charger: ['defense', 'attack', 'attack'],
          hitter: ['attack', 'attack', 'attack']
        },
        disableElementAdvantage: true
      }
    );

    const charged = (result.events || []).filter(event => event.type === 'streammonsters:battle_special_charged');
    const ownActions = result.rounds.flatMap(round => round.actions || [])
      .filter(action => action.actorId === 'charger');
    expect(charged).toHaveLength(1);
    expect(ownActions.filter(action => action.skill.type === 'special')).toHaveLength(1);
    const special = ownActions.find(action => action.skill.type === 'special');
    expect(special.before.actor.charged).toBe(true);
    expect(special.after.actor).toEqual(expect.objectContaining({
      charged: false,
      specialUsed: true
    }));
    expect(special.consumedEffects).toContainEqual({ type: 'specialCharge', amount: 1 });
    expect(special.round).toBe(charged[0].payload.round);
  });

  test('persists exactly three detailed rounds, rules version 3 and complete skills', () => {
    const { store } = createStore();
    const service = new BattleService({ store, now: () => 1234 });
    const result = service.resolve(monster('left', 'Grove'), monster('right', 'Gale'), 'persist-v3');
    const stored = store.getBattle(result.battleId);

    expect(result).toEqual(expect.objectContaining({
      rulesVersion: 3,
      skills: {
        left: expect.objectContaining({ attack: expect.any(Object), defense: expect.any(Object), special: expect.any(Object) }),
        right: expect.objectContaining({ attack: expect.any(Object), defense: expect.any(Object), special: expect.any(Object) })
      }
    }));
    expect(result.rounds).toHaveLength(3);
    expect(result.rounds.every(round => (
      round.actions.length > 0 &&
      round.actions.every(action => action.maxHp.actor > 0 && action.maxHp.target > 0) &&
      Object.hasOwn(round, 'winnerId') &&
      Object.hasOwn(round, 'terminal')
    ))).toBe(true);
    expect(result.rounds.slice(0, -1).every(round => round.winnerId === null)).toBe(true);
    expect(result.rounds.at(-1)).toEqual(expect.objectContaining({
      terminal: true,
      winnerId: result.winnerId
    }));
    expect(stored).toEqual(expect.objectContaining({
      rules_version: 3,
      rulesVersion: 3,
      rounds: result.rounds,
      skills: result.skills
    }));
  });

  test('replays byte-identically from the same seed and produces a different legitimate seeded sequence', () => {
    const left = monster('left', 'Gale');
    const right = monster('right', 'Volt');
    const resolveFresh = seed => {
      const { store } = createStore();
      return new BattleService({ store }).resolve(left, right, seed);
    };

    const first = resolveFresh('replay-seed');
    const replay = resolveFresh('replay-seed');
    const changed = resolveFresh('different-seed');

    expect(first.rulesVersion).toBe(3);
    expect(JSON.stringify(replay)).toBe(JSON.stringify(first));
    expect(changed.rounds).not.toEqual(first.rounds);
    expect(changed.rounds).toHaveLength(3);
  });

  test('uses only the final tie-break winner in terminal action and round context', () => {
    const { store } = createStore();
    const result = new BattleService({ store }).resolve(
      monster('left', 'Grove', {
        stats: { vitality: 7, might: 20, guard: 0, agility: 20 }
      }),
      monster('right', 'Ember', {
        stats: { vitality: 7, might: 7, guard: 0, agility: 10 }
      }),
      'ko-0',
      null,
      null,
      {
        actionPlan: {
          left: ['defense', 'attack', 'attack'],
          right: ['defense', 'defense', 'defense']
        },
        initialState: { left: { hp: 2 }, right: { hp: 1 } },
        disableElementAdvantage: true
      }
    );
    const stored = store.getBattle(result.battleId);
    const terminalActions = result.rounds.flatMap(round => round.actions)
      .filter(action => action.terminal);

    expect(result.finalHp).toEqual({ left: 0, right: 0 });
    expect(result.winnerId).toBe('left');
    expect(terminalActions).not.toHaveLength(0);
    expect(terminalActions.every(action => action.winnerId === null)).toBe(true);
    expect(result.rounds.slice(0, -1).every(round => round.winnerId === null)).toBe(true);
    expect(result.rounds.at(-1)).toEqual(expect.objectContaining({
      terminal: true,
      winnerId: 'left'
    }));
    expect(stored.result.rounds).toEqual(result.rounds);
  });

  test('keeps malformed legacy JSON readable without mutating permanent monster data', () => {
    const { sqlite, store } = createStore();
    sqlite.prepare(`
      INSERT INTO streammonsters_battles (
        battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
        rounds_json, result_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('legacy', 'legacy-seed', 'old-a', 'old-b', 'old-a', '{bad', '{bad', 1);
    const beforeLeft = JSON.stringify(monster('left', 'Lunar'));
    const beforeRight = JSON.stringify(monster('right', 'Volt'));
    const left = JSON.parse(beforeLeft);
    const right = JSON.parse(beforeRight);

    expect(() => store.getBattle('legacy')).not.toThrow();
    expect(store.getBattle('legacy')).toEqual(expect.objectContaining({
      rulesVersion: null,
      rounds: [],
      skills: null
    }));
    new BattleService({ store }).resolve(left, right, 'no-permanent-mutation');
    expect(JSON.stringify(left)).toBe(beforeLeft);
    expect(JSON.stringify(right)).toBe(beforeRight);
  });

  test('emits own-action skills and special charge while keeping mission/mastery hooks exactly once per fighter', () => {
    const { store } = createStore();
    const fighters = [
      monster('first', 'Ember', { user_id: 'first-user' }),
      monster('second', 'Tide', { user_id: 'second-user' })
    ];
    const queue = [];
    fighters.forEach((fighter, index) => {
      store.enqueueBattle({
        userId: fighter.user_id,
        monsterId: fighter.monster_id,
        stance: index ? 'guard' : 'power',
        queuedAtMs: 1
      });
    });
    store.getSelectedMonster = userId => fighters.find(fighter => fighter.user_id === userId);
    store.getMonster = monsterId => fighters.find(fighter => fighter.monster_id === monsterId);
    store.incrementViewer = jest.fn();
    store.incrementStreamMetric = jest.fn();
    store.hasRecentOpponentPair = jest.fn(() => false);
    const progression = { recordCommand: jest.fn(), recordBattle: jest.fn() };
    const collection = { recordBattleOutcome: jest.fn() };
    const emitted = [];
    const commands = new ChatCommands({
      store,
      engine: {
        streamKey: 'stream',
        markReadyEggs: jest.fn(),
        claimPendingRewards: jest.fn()
      },
      battleService: new BattleService({ store, now: () => 10 }),
      progression,
      collection,
      emit: (event, payload) => emitted.push({ event, payload }),
      now: () => 10
    });

    const result = commands.execute({ userId: 'second-user' }, 'battle', ['speed']);

    expect(result.status).toBe('started');
    expect(emitted.filter(entry => entry.event === 'streammonsters:battle_skill_used'))
      .toHaveLength(result.battle.rounds.flatMap(round => round.actions).length);
    expect(progression.recordBattle).toHaveBeenCalledTimes(2);
    expect(collection.recordBattleOutcome).toHaveBeenCalledTimes(1);
    expect(collection.recordBattleOutcome.mock.calls[0][0].fighters).toHaveLength(2);
  });
});
