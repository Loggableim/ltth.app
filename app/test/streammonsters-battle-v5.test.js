const {
  TEMPLATE_CATALOG,
  buildV5SkillCatalog
} = require('../plugins/streamalchemy/backend/streammonsters/catalog');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');

function fighter(id, element, templateId, stats = {}) {
  return {
    monster_id: id,
    user_id: `viewer-${id}`,
    template_id: templateId,
    name: id,
    element,
    personality: 'Adaptive',
    level: 5,
    stats: {
      vitality: 10,
      might: 10,
      guard: 10,
      agility: 10,
      ...stats
    }
  };
}

describe('Stream Monsters rules-v5 skill catalog', () => {
  test('exposes 24 unique declarative three-skill catalogs', () => {
    const catalog = buildV5SkillCatalog();

    expect(TEMPLATE_CATALOG).toHaveLength(24);
    expect(Object.keys(catalog)).toHaveLength(24);
    expect(new Set(Object.values(catalog).flatMap(entry => (
      Object.values(entry).map(skill => skill.id)
    ))).size).toBe(72);
    Object.values(catalog).forEach(skills => {
      expect(Object.keys(skills)).toEqual(['A', 'B', 'C']);
      expect(skills).toEqual({
        A: expect.objectContaining({ type: 'attack', effects: expect.any(Array) }),
        B: expect.objectContaining({ type: 'defense', effects: expect.any(Array) }),
        C: expect.objectContaining({
          type: 'special',
          chargeRequired: 100,
          effects: expect.any(Array)
        })
      });
    });
  });
});

describe('Stream Monsters rules-v5 deterministic resolver', () => {
  test('uses agility order with a seeded tie and identical choices replay identically', () => {
    const service = new BattleService({ store: {} });
    const left = fighter('left', 'Ember', 'ashfang');
    const right = fighter('right', 'Tide', 'ripple');
    const input = {
      fighters: [left, right],
      choices: { left: 'A', right: 'B' },
      seed: 'v5-order',
      round: 1
    };

    const first = service.resolveInteractiveRound(input);
    const replay = service.resolveInteractiveRound(input);

    expect(replay).toEqual(first);
    expect(first.actions).toHaveLength(2);
    expect(first.actions.map(action => action.actorId)).toEqual(
      [...first.actions.map(action => action.actorId)].sort((a, b) => (
        service.hashNumber(`v5-order:round:1:order:${a}`) -
        service.hashNumber(`v5-order:round:1:order:${b}`)
      ))
    );
    expect(first.actions[0]).toEqual(expect.objectContaining({
      sequence: 1,
      before: expect.any(Object),
      after: expect.any(Object),
      hits: expect.any(Array)
    }));
  });

  test('gates C at 100 charge, consumes it and applies the specified charge sources', () => {
    const service = new BattleService({ store: {} });
    const left = fighter('left', 'Ember', 'ashfang', { agility: 20 });
    const right = fighter('right', 'Tide', 'ripple', { agility: 1 });

    const blocked = service.resolveInteractiveRound({
      fighters: [left, right],
      choices: { left: 'C', right: 'B' },
      seed: 'v5-charge-blocked',
      round: 1,
      state: {
        left: { charge: 75 },
        right: { charge: 0 }
      }
    });
    expect(blocked.actions[0]).toEqual(expect.objectContaining({
      actorId: 'left',
      requestedChoice: 'C',
      choice: 'A',
      choiceFallback: 'special_not_charged'
    }));
    expect(blocked.state.left.charge).toBe(100);

    const charged = service.resolveInteractiveRound({
      fighters: [left, right],
      choices: { left: 'C', right: 'B' },
      seed: 'v5-charge-ready',
      round: 1,
      state: {
        left: { charge: 100 },
        right: { charge: 0 }
      }
    });
    expect(charged.actions[0]).toEqual(expect.objectContaining({
      actorId: 'left',
      choice: 'C',
      choiceFallback: null
    }));
    expect(charged.state.left.charge).toBe(0);
    expect(charged.state.right.charge).toBeGreaterThanOrEqual(25);
  });

  test('applies shields before HP, records sequential multi-hit and stops on early KO', () => {
    const service = new BattleService({ store: {} });
    const gale = fighter('gale', 'Gale', 'zephyr', { might: 40, agility: 40 });
    const target = fighter('target', 'Grove', 'oakheart', {
      vitality: 1,
      guard: 0,
      agility: 1
    });
    const result = service.resolveInteractiveRound({
      fighters: [gale, target],
      choices: { gale: 'A', target: 'A' },
      seed: 'v5-multi-ko',
      round: 1,
      state: {
        gale: { charge: 0 },
        target: { hp: 5, shield: 2, charge: 0 }
      }
    });
    const attack = result.actions[0];

    expect(attack.hits.length).toBeGreaterThanOrEqual(1);
    expect(attack.hits[0]).toEqual(expect.objectContaining({
      index: 1,
      shieldBefore: 2,
      shieldAbsorbed: 2,
      hpBefore: 5
    }));
    expect(attack.hits.map(hit => hit.index)).toEqual(
      attack.hits.map((_, index) => index + 1)
    );
    expect(result.terminal).toBe(true);
    expect(result.winnerId).toBe('gale');
    expect(result.actions).toHaveLength(1);
  });

  test('keeps all 24 templates and six element families bounded at levels 1/5/10/15/20', () => {
    const service = new BattleService({ store: {} });
    const levels = [1, 5, 10, 15, 20];
    const impactByElement = {};

    TEMPLATE_CATALOG.forEach((template, templateIndex) => {
      levels.forEach(level => {
        const opponentTemplate = TEMPLATE_CATALOG.find(candidate => (
          candidate.element !== template.element
        ));
        const stats = {
          vitality: 8 + level,
          might: 8 + level,
          guard: 8 + level,
          agility: 8 + level
        };
        const actor = {
          ...fighter('actor', template.element, template.templateId, stats),
          level
        };
        const target = {
          ...fighter('target', opponentTemplate.element, opponentTemplate.templateId, stats),
          level
        };
        const input = {
          fighters: [actor, target],
          choices: { actor: 'A', target: 'B' },
          seed: `balance:${templateIndex}:${level}`,
          round: 1
        };
        const result = service.resolveInteractiveRound(input);
        const replay = service.resolveInteractiveRound(input);
        const action = result.actions.find(entry => entry.actorId === 'actor');
        const impact = action.hits.reduce((sum, hit) => (
          sum + hit.hpDamage + hit.shieldAbsorbed
        ), 0) + action.outcomes.reduce((sum, outcome) => (
          sum + (Number(outcome.amount) || 0)
        ), 0);

        expect(replay).toEqual(result);
        expect(result.rulesVersion).toBe(5);
        expect(action.skill.id).toBe(`${template.templateId}:A`);
        expect(action.hits.every(hit => (
          hit.hpAfter >= 0 &&
          hit.shieldAfter >= 0 &&
          hit.hpDamage <= hit.requestedDamage
        ))).toBe(true);
        expect(impact).toBeGreaterThan(0);
        expect(impact).toBeLessThanOrEqual(action.before.target.maxHp / 2);
        (impactByElement[template.element] ||= []).push(impact);
      });
    });

    expect(Object.keys(impactByElement).sort()).toEqual(
      ['Ember', 'Gale', 'Grove', 'Lunar', 'Tide', 'Volt']
    );
    const familyAverages = Object.values(impactByElement).map(values => (
      values.reduce((sum, value) => sum + value, 0) / values.length
    ));
    expect(Math.max(...familyAverages) - Math.min(...familyAverages)).toBeLessThanOrEqual(2);
  });
});
