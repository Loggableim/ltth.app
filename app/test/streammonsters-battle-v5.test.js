const {
  TEMPLATE_CATALOG,
  buildV5SkillCatalog
} = require('../plugins/stream-monsters/backend/streammonsters/catalog');
const BattleService = require('../plugins/stream-monsters/backend/streammonsters/battle-service');

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
    const names = new Set();
    Object.values(catalog).forEach(skills => {
      expect(Object.keys(skills)).toEqual(['A', 'B', 'C']);
      expect(skills).toEqual({
        A: expect.objectContaining({
          type: 'attack',
          icon: expect.any(String),
          shortText: expect.any(String),
          effects: expect.any(Array)
        }),
        B: expect.objectContaining({
          type: 'defense',
          icon: expect.any(String),
          shortText: expect.any(String),
          effects: expect.any(Array)
        }),
        C: expect.objectContaining({
          type: 'special',
          icon: expect.any(String),
          shortText: expect.any(String),
          chargeRequired: 100,
          effects: expect.any(Array)
        })
      });
      Object.values(skills).forEach(skill => {
        expect(skill.icon).not.toHaveLength(0);
        expect(skill.shortText.length).toBeGreaterThanOrEqual(8);
        names.add(skill.name);
      });
    });
    expect(names.size).toBe(72);
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

  test('adds exactly three temporary damage for an elemental advantage and can disable it for balance simulation', () => {
    const service = new BattleService({ store: {} });
    const ember = fighter('ember', 'Ember', 'ashfang', { agility: 20 });
    const grove = fighter('grove', 'Grove', 'oakheart', { agility: 1 });
    const input = {
      fighters: [ember, grove],
      choices: { ember: 'A', grove: 'B' },
      seed: 'v5-element-advantage',
      round: 1
    };
    const advantaged = service.resolveInteractiveRound(input);
    const neutral = service.resolveInteractiveRound({
      ...input,
      disableElementAdvantage: true
    });
    const advantagedHit = advantaged.actions
      .find(action => action.actorId === 'ember').hits[0];
    const neutralHit = neutral.actions
      .find(action => action.actorId === 'ember').hits[0];

    expect(advantagedHit.requestedDamage - neutralHit.requestedDamage).toBe(3);
    expect(ember.stats).toEqual(expect.objectContaining({ might: 10 }));
    expect(grove.stats).toEqual(expect.objectContaining({ guard: 10 }));
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

  test('resolves burn, evade, thorns and reflect deterministically across rounds', () => {
    const service = new BattleService({ store: {} });
    const ember = fighter('ember', 'Ember', 'ashfang', { agility: 1, might: 12 });
    const tide = fighter('tide', 'Tide', 'ripple', { agility: 30, might: 12 });
    const burned = service.resolveInteractiveRound({
      fighters: [ember, tide],
      choices: { ember: 'A', tide: 'B' },
      seed: 'v5-persistent-burn',
      round: 1
    });

    expect(burned.state.tide.burn).toBe(1);
    const ticked = service.resolveInteractiveRound({
      fighters: [ember, tide],
      choices: { ember: 'B', tide: 'A' },
      seed: 'v5-persistent-burn',
      round: 2,
      state: burned.state
    });
    expect(ticked.actions[0]).toEqual(expect.objectContaining({
      actorId: 'tide',
      statusEffects: [
        expect.objectContaining({ type: 'burn_tick', amount: 1, hpDamage: 1 })
      ]
    }));
    expect(ticked.state.tide.burn).toBe(0);

    const gale = fighter('gale', 'Gale', 'zephyr', { agility: 30 });
    const attacker = fighter('attacker', 'Ember', 'ashfang', { agility: 1 });
    const evasion = service.resolveInteractiveRound({
      fighters: [gale, attacker],
      choices: { gale: 'B', attacker: 'A' },
      seed: 'v5-evade-0',
      round: 1
    });
    const incoming = evasion.actions.find(action => action.actorId === 'attacker');
    expect(evasion.actions.find(action => action.actorId === 'gale').outcomes).toContainEqual(
      expect.objectContaining({ type: 'evade', chance: 25 })
    );
    expect(incoming.hits[0]).toEqual(expect.objectContaining({
      evaded: true,
      hpDamage: 0,
      shieldAbsorbed: 0
    }));
    expect(evasion.state.gale.evade).toBe(0);

    const retaliationTarget = fighter('retaliator', 'Grove', 'oakheart', { agility: 1 });
    const retaliationAttacker = fighter('striker', 'Ember', 'ashfang', {
      agility: 30,
      vitality: 1
    });
    const retaliation = service.resolveInteractiveRound({
      fighters: [retaliationAttacker, retaliationTarget],
      choices: { striker: 'A', retaliator: 'B' },
      seed: 'v5-retaliation',
      round: 2,
      state: {
        striker: { hp: 12 },
        retaliator: { thorns: 2, reflect: 3 }
      }
    });
    expect(retaliation.actions[0].retaliations).toEqual([
      expect.objectContaining({ type: 'thorns', hpDamage: 2 }),
      expect.objectContaining({ type: 'reflect', hpDamage: 3 })
    ]);
    expect(retaliation.state.striker.hp).toBe(7);
  });

  test('applies every declared shield, heal, pierce, multihit, initiative and debuff mechanic', () => {
    const service = new BattleService({ store: {} });
    const volt = fighter('volt', 'Volt', 'pulse', { agility: 40, might: 10 });
    const grove = fighter('grove', 'Grove', 'oakheart', { agility: 1, guard: 0 });
    const pierced = service.resolveInteractiveRound({
      fighters: [volt, grove],
      choices: { volt: 'A', grove: 'B' },
      seed: 'v5-pierce',
      round: 1,
      state: { grove: { shield: 10 } }
    });
    expect(pierced.actions[0].actorId).toBe('volt');
    expect(pierced.actions[0].hits[0]).toEqual(expect.objectContaining({
      shieldPenetrated: 2,
      hpDamage: 2
    }));
    expect(pierced.actions[0].outcomes).toContainEqual({
      type: 'pierce',
      amount: 2
    });

    const gale = fighter('gale', 'Gale', 'zephyr', { agility: 40, might: 10 });
    const tide = fighter('tide', 'Tide', 'ripple', { agility: 1, guard: 0 });
    const multi = service.resolveInteractiveRound({
      fighters: [gale, tide],
      choices: { gale: 'C', tide: 'B' },
      seed: 'v5-multihit',
      round: 1,
      state: {
        gale: { charge: 100 },
        tide: { hp: 20 }
      }
    });
    expect(multi.actions[0].hits.map(hit => hit.index)).toEqual([1, 2, 3]);

    const lunar = fighter('lunar', 'Lunar', 'selene', { agility: 40, might: 20 });
    const healed = service.resolveInteractiveRound({
      fighters: [lunar, tide],
      choices: { lunar: 'C', tide: 'A' },
      seed: 'v5-lifesteal',
      round: 1,
      state: {
        lunar: { hp: 10, charge: 100 },
        tide: { hp: 30 }
      }
    });
    expect(healed.actions[0].outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'lifesteal', amount: expect.any(Number) })
    ]));
    expect(healed.state.lunar.hp).toBeGreaterThan(10);

    const weakened = service.resolveInteractiveRound({
      fighters: [tide, grove],
      choices: { tide: 'A', grove: 'B' },
      seed: 'v5-weaken',
      round: 1
    });
    expect(weakened.actions.find(action => action.actorId === 'tide').outcomes)
      .toContainEqual({ type: 'weaken', amount: 1 });
    expect(weakened.state.grove.weakened).toBe(1);
    expect(weakened.actions.find(action => action.actorId === 'grove').outcomes)
      .toContainEqual(expect.objectContaining({ type: 'shield' }));
  });

  test('keeps all 24 templates and six families bounded for A/B/C against rotating opponents', () => {
    const service = new BattleService({ store: {} });
    const levels = [1, 5, 10, 15, 20];
    const impactByElement = {};
    const runtimeEffectTypes = new Set();

    TEMPLATE_CATALOG.forEach((template, templateIndex) => {
      levels.forEach(level => {
        const opponentTemplate = TEMPLATE_CATALOG[
          (templateIndex + level) % TEMPLATE_CATALOG.length
        ];
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
        ['A', 'B', 'C'].forEach(choice => {
          const input = {
            fighters: [actor, target],
            choices: { actor: choice, target: 'B' },
            seed: `balance:${templateIndex}:${level}:${choice}`,
            round: 1,
            state: {
              actor: { hp: 20, charge: 100 },
              target: { hp: 30, shield: 3 }
            }
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
          expect(action.skill.id).toBe(`${template.templateId}:${choice}`);
          expect(action.hits.every(hit => (
            hit.hpAfter >= 0 &&
            hit.shieldAfter >= 0 &&
            hit.hpDamage <= hit.requestedDamage
          ))).toBe(true);
          expect(impact).toBeGreaterThan(0);
          expect(impact).toBeLessThanOrEqual(action.before.target.maxHp);
          action.outcomes.forEach(outcome => runtimeEffectTypes.add(outcome.type));
          if (action.hits.length > 1) runtimeEffectTypes.add('multihit');
          (impactByElement[template.element] ||= []).push(impact);
        });
      });
    });

    expect(Object.keys(impactByElement).sort()).toEqual(
      ['Ember', 'Gale', 'Grove', 'Lunar', 'Tide', 'Volt']
    );
    const familyAverages = Object.values(impactByElement).map(values => (
      values.reduce((sum, value) => sum + value, 0) / values.length
    ));
    expect(Math.max(...familyAverages) - Math.min(...familyAverages)).toBeLessThanOrEqual(6);
    expect([...runtimeEffectTypes]).toEqual(expect.arrayContaining([
      'burn',
      'evade',
      'heal',
      'lifesteal',
      'multihit',
      'pierce',
      'reflect',
      'shield',
      'thorns',
      'weaken'
    ]));
  });
});
