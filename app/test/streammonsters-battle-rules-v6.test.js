const {
  ELEMENTS,
  TEMPLATE_CATALOG,
  V5_ELEMENT_EFFECTS,
  V6_ELEMENT_ADVANTAGE_PAIRS,
  V6_NEUTRAL_OPPONENTS,
  TEMPLATE_ROLES,
  ROLE_EFFECT_BUDGET_EQUIVALENTS,
  V6_SUSTAIN_TUNING,
  V6_STRIKER_TUNING,
  V6_ELEMENT_DAMAGE_TUNING,
  buildV6SkillCatalog
} = require('../plugins/streamalchemy/backend/streammonsters/catalog');
const Rules = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-rules-v5'
);
const Simulator = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-simulator'
);
const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const BattleService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-service'
);
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);

const APPROVED_ADVANTAGES = [
  'Ember:Grove',
  'Ember:Gale',
  'Tide:Ember',
  'Tide:Lunar',
  'Grove:Tide',
  'Grove:Volt',
  'Gale:Grove',
  'Gale:Lunar',
  'Volt:Gale',
  'Volt:Tide',
  'Lunar:Volt',
  'Lunar:Ember'
];

const APPROVED_NEUTRALS = {
  Ember: 'Volt',
  Tide: 'Gale',
  Grove: 'Lunar',
  Gale: 'Tide',
  Volt: 'Ember',
  Lunar: 'Grove'
};

const APPROVED_ROLES = {
  ashfang: 'striker',
  reefbite: 'striker',
  fernmask: 'striker',
  skyrend: 'striker',
  neonclaw: 'striker',
  umbra: 'striker',
  embergrin: 'guardian',
  brine: 'guardian',
  oakheart: 'guardian',
  cirrus: 'guardian',
  pulse: 'guardian',
  selene: 'guardian',
  cinder: 'trickster',
  ripple: 'trickster',
  mosswhisker: 'trickster',
  zephyr: 'trickster',
  flashstep: 'trickster',
  tsuki: 'trickster',
  pyrra: 'sustain',
  axi: 'sustain',
  cloverhop: 'sustain',
  gusttail: 'sustain',
  ampjack: 'sustain',
  lumen: 'sustain'
};

function fighter(id, templateId, stats = {}) {
  const template = TEMPLATE_CATALOG.find(entry => entry.templateId === templateId);
  return {
    monster_id: id,
    user_id: `viewer-${id}`,
    template_id: templateId,
    name: template.name,
    element: template.element,
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

function effectBudget(effects) {
  return effects.reduce((sum, effect) => {
    if (effect.type === 'evade') {
      return sum + (effect.chance / ROLE_EFFECT_BUDGET_EQUIVALENTS.evadeChancePerPoint);
    }
    if (effect.type === 'lifesteal') {
      return sum + (effect.ratio / ROLE_EFFECT_BUDGET_EQUIVALENTS.lifestealRatioPerPoint);
    }
    return sum + (Number(effect.power) || 0);
  }, 0);
}

function effect(effects, type) {
  return effects.find(entry => entry.type === type);
}

describe('Stream Monsters Rules-v6 catalog contracts', () => {
  test('exports the approved twelve directed advantages and one symmetric neutral per element', () => {
    expect(V6_ELEMENT_ADVANTAGE_PAIRS).toEqual(APPROVED_ADVANTAGES);
    expect(new Set(V6_ELEMENT_ADVANTAGE_PAIRS).size).toBe(12);
    expect(V6_NEUTRAL_OPPONENTS).toEqual(APPROVED_NEUTRALS);
    ELEMENTS.forEach(element => {
      expect(V6_NEUTRAL_OPPONENTS[V6_NEUTRAL_OPPONENTS[element]]).toBe(element);
    });
  });

  test('assigns all 24 templates exactly one approved role with one role per element', () => {
    expect(TEMPLATE_ROLES).toEqual(APPROVED_ROLES);
    expect(TEMPLATE_CATALOG).toHaveLength(24);
    expect(TEMPLATE_CATALOG.map(template => template.role)).toEqual(
      TEMPLATE_CATALOG.map(template => APPROVED_ROLES[template.templateId])
    );
    ELEMENTS.forEach(element => {
      expect(
        TEMPLATE_CATALOG
          .filter(template => template.element === element)
          .map(template => template.role)
          .sort()
      ).toEqual(['guardian', 'striker', 'sustain', 'trickster']);
    });
  });

  test('keeps 72 unique presentation records while applying declared role effect budgets', () => {
    const catalog = buildV6SkillCatalog();
    const presentations = new Set();

    TEMPLATE_CATALOG.forEach(template => {
      const skills = catalog[template.templateId];
      expect(Object.keys(skills)).toEqual(['A', 'B', 'C']);
      Object.values(skills).forEach(skill => {
        presentations.add(JSON.stringify({
          name: skill.name,
          icon: skill.icon,
          shortText: skill.shortText,
          shortTextKey: skill.shortTextKey,
          vfxKey: skill.vfxKey
        }));
        expect(skill.role).toBe(template.role);
      });

      const baseline = V5_ELEMENT_EFFECTS[template.element];
      const elementDamageTuning = V6_ELEMENT_DAMAGE_TUNING[template.element] || 0;
      const budgets = Object.fromEntries(['A', 'B', 'C'].map(choice => [
        choice,
        {
          before: effectBudget(baseline[choice]),
          after: effectBudget(skills[choice].effects)
        }
      ]));

      if (template.role === 'striker') {
        expect(effect(skills.A.effects, 'damage').power)
          .toBe(
            effect(baseline.A, 'damage').power +
              V6_STRIKER_TUNING.offenseDamage -
              elementDamageTuning
          );
        expect(budgets.B.after)
          .toBe(budgets.B.before - V6_STRIKER_TUNING.defenseBudget);
        expect(effect(skills.C.effects, 'damage').power)
          .toBe(
            effect(baseline.C, 'damage').power +
              V6_STRIKER_TUNING.offenseDamage -
              elementDamageTuning
          );
      } else if (template.role === 'guardian') {
        expect(effect(skills.A.effects, 'damage').power)
          .toBe(Math.max(
            1,
            effect(baseline.A, 'damage').power - 1 - elementDamageTuning
          ));
        expect(effect(skills.B.effects, 'shield').power)
          .toBe((effect(baseline.B, 'shield')?.power || 0) + 2);
        expect(effect(skills.C.effects, 'damage').power)
          .toBe(Math.max(
            1,
            effect(baseline.C, 'damage').power - 1 - elementDamageTuning
          ));
        expect(effect(skills.C.effects, 'shield').power)
          .toBe((effect(baseline.C, 'shield')?.power || 0) + 2);
      } else if (template.role === 'sustain') {
        expect(effect(skills.A.effects, 'damage').power)
          .toBe(Math.max(
            1,
            effect(baseline.A, 'damage').power -
              V6_SUSTAIN_TUNING.attackDamagePenalty -
              elementDamageTuning
          ));
        expect(effect(skills.A.effects, 'heal').power)
          .toBe(
            (effect(baseline.A, 'heal')?.power || 0) +
              V6_SUSTAIN_TUNING.attackHeal
          );
        expect(budgets.B.after).toBe(budgets.B.before);
        expect(effect(skills.C.effects, 'damage').power)
          .toBe(Math.max(
            1,
            effect(baseline.C, 'damage').power -
              V6_SUSTAIN_TUNING.specialDamagePenalty -
              elementDamageTuning
          ));
        expect(effect(skills.C.effects, 'heal').power)
          .toBe(
            (effect(baseline.C, 'heal')?.power || 0) +
              V6_SUSTAIN_TUNING.specialHeal
          );
      } else {
        expect(budgets.A.after).toBe(budgets.A.before);
        expect(budgets.B.after).toBe(budgets.B.before);
        expect(budgets.C.after).toBe(budgets.C.before);
      }
    });

    expect(presentations.size).toBe(72);
  });
});

describe('Stream Monsters Rules-v6 deterministic resolver', () => {
  test('replays the same action envelopes including skills, effects, rolls and charge', () => {
    const input = {
      fighters: [
        fighter('left', 'cinder', { agility: 20 }),
        fighter('right', 'oakheart', { agility: 1 })
      ],
      choices: { left: 'A', right: 'B' },
      seed: 'rules-v6-envelope',
      round: 1,
      rulesVersion: 6
    };
    const first = Rules.resolveInteractiveRound(input);
    const replay = Rules.resolveInteractiveRound(input);

    expect(replay).toEqual(first);
    expect(first.rulesVersion).toBe(6);
    expect(first.actions[0]).toEqual(expect.objectContaining({
      skill: expect.objectContaining({
        id: 'cinder:A',
        role: 'trickster',
        effects: expect.any(Array)
      }),
      hits: expect.any(Array),
      outcomes: expect.any(Array),
      rolls: expect.any(Array),
      statusEffects: expect.any(Array),
      before: expect.objectContaining({
        actor: expect.objectContaining({ charge: 0 }),
        target: expect.objectContaining({ shield: 0 })
      }),
      after: expect.objectContaining({
        actor: expect.objectContaining({ charge: 25 })
      }),
      knockout: null
    }));
  });

  test('gates and consumes charge without changing permanent fighter stats', () => {
    const left = fighter('left', 'ashfang', { agility: 20 });
    const right = fighter('right', 'brine', { agility: 1 });
    const permanent = JSON.parse(JSON.stringify({ left, right }));
    const blocked = Rules.resolveInteractiveRound({
      fighters: [left, right],
      choices: { left: 'C', right: 'B' },
      seed: 'rules-v6-charge-blocked',
      round: 1,
      rulesVersion: 6,
      state: { left: { charge: 75 }, right: { charge: 0 } }
    });
    expect(blocked.actions[0]).toEqual(expect.objectContaining({
      requestedChoice: 'C',
      choice: 'A',
      choiceFallback: 'special_not_charged'
    }));
    expect(blocked.state.left.charge).toBe(100);

    const charged = Rules.resolveInteractiveRound({
      fighters: [left, right],
      choices: { left: 'C', right: 'B' },
      seed: 'rules-v6-charge-ready',
      round: 1,
      rulesVersion: 6,
      state: { left: { charge: 100 }, right: { charge: 0 } }
    });
    expect(charged.actions[0].choice).toBe('C');
    expect(charged.state.left.charge).toBe(0);
    expect({ left, right }).toEqual(permanent);
  });

  test('records statuses and deterministic rolls in hit order', () => {
    const result = Rules.resolveInteractiveRound({
      fighters: [
        fighter('gale', 'zephyr', { agility: 30, might: 30 }),
        fighter('ember', 'cinder', { agility: 1, vitality: 1, guard: 0 })
      ],
      choices: { gale: 'C', ember: 'A' },
      seed: 'rules-v6-multihit',
      round: 1,
      rulesVersion: 6,
      state: {
        gale: { charge: 100 },
        ember: { hp: 24, shield: 2 }
      }
    });
    const action = result.actions[0];

    expect(action.hits.map(hit => hit.index)).toEqual([1, 2, 3]);
    expect(action.hits[0]).toEqual(expect.objectContaining({
      shieldBefore: 2,
      shieldAbsorbed: 2
    }));
    expect(action.rolls).toEqual([
      expect.objectContaining({ purpose: 'evade', hitIndex: 1 })
    ]);
    expect(action.terminal).toBe(true);
    expect(action.knockout).toEqual({
      monsterId: 'ember',
      cause: 'skill'
    });
  });

  test('carries burn, weaken, evade, thorns and reflect as temporary state only', () => {
    const ember = fighter('ember', 'cinder', { agility: 1 });
    const target = fighter('target', 'pulse', { agility: 20 });
    const initial = JSON.parse(JSON.stringify({ ember, target }));
    const burned = Rules.resolveInteractiveRound({
      fighters: [ember, target],
      choices: { ember: 'A', target: 'B' },
      seed: 'rules-v6-statuses',
      round: 1,
      rulesVersion: 6
    });
    expect(burned.state.target.burn).toBeGreaterThan(0);

    const ticked = Rules.resolveInteractiveRound({
      fighters: [ember, target],
      choices: { ember: 'B', target: 'A' },
      seed: 'rules-v6-statuses',
      round: 2,
      rulesVersion: 6,
      state: burned.state
    });
    expect(ticked.actions.find(action => action.actorId === 'target').statusEffects)
      .toContainEqual(expect.objectContaining({ type: 'burn_tick' }));

    const temporary = Rules.resolveInteractiveRound({
      fighters: [
        fighter('gale', 'cirrus', { agility: 30 }),
        fighter('volt', 'pulse', { agility: 1 })
      ],
      choices: { gale: 'B', volt: 'B' },
      seed: 'rules-v6-temporary',
      round: 1,
      rulesVersion: 6,
      state: {
        gale: { thorns: 2 },
        volt: { reflect: 2, weakened: 1 }
      }
    });
    expect(temporary.actions.flatMap(action => action.outcomes).map(entry => entry.type))
      .toEqual(expect.arrayContaining(['evade', 'shield']));
    expect({ ember, target }).toEqual(initial);
  });

  test('persists v6 action envelopes while leaving an existing v5 match untouched', () => {
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    for (const [id, userId, element, templateId] of [
      ['alpha', 'viewer-a', 'Ember', 'cinder'],
      ['beta', 'viewer-b', 'Grove', 'oakheart']
    ]) {
      sqlite.prepare(`
        INSERT INTO streammonsters_monsters (
          monster_id, user_id, egg_id, name, element, rarity, level, xp,
          stats_json, personality, template_id, is_selected, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, 'Common', 5, 0, ?, 'Adaptive', ?, 1, 1)
      `).run(
        id,
        userId,
        `egg-${id}`,
        id,
        element,
        JSON.stringify({ vitality: 10, might: 10, guard: 10, agility: 10 }),
        templateId
      );
    }
    sqlite.prepare(`
      INSERT INTO streammonsters_matches (
        match_id, state, phase_version, seed, rules_version, round_number,
        created_at_ms, updated_at_ms
      ) VALUES ('legacy-v5', 'completed', 1, 'legacy-seed', 5, 0, 1, 1)
    `).run();
    const legacyBefore = sqlite.prepare(
      `SELECT * FROM streammonsters_matches WHERE match_id = 'legacy-v5'`
    ).get();
    const service = new BattleMatchService({
      store,
      battleService: new BattleService({ store, now: () => 1_000 }),
      now: () => 1_000,
      emit: jest.fn(),
      rulesVersion: 6,
      autoStart: false
    });
    service.join({ userId: 'viewer-a' });
    const reserved = service.join({ userId: 'viewer-b' });
    service.lockRoster({ userId: 'viewer-a' });
    service.lockRoster({ userId: 'viewer-b' });
    service.submitChoice({ userId: 'viewer-a', choice: 'A', eventId: 'a-1' });
    service.submitChoice({ userId: 'viewer-b', choice: 'B', eventId: 'b-1' });

    const replay = service.getReplay(reserved.match.matchId);
    expect(replay.rulesVersion).toBe(6);
    expect(replay.actions[0]).toEqual(expect.objectContaining({
      skill: expect.objectContaining({ role: expect.any(String) }),
      rolls: expect.any(Array),
      knockout: null
    }));
    expect(
      sqlite.prepare(`SELECT * FROM streammonsters_matches WHERE match_id = 'legacy-v5'`).get()
    ).toEqual(legacyBefore);
    expect(service.getReplay('legacy-v5').rulesVersion).toBe(5);
    sqlite.close();
  });
});

describe('Stream Monsters Rules-v6 balance simulator', () => {
  test('covers every template, level, stat profile, legal sequence and deterministic seed', () => {
    const options = {
      levels: [1, 5],
      statProfiles: ['balanced', 'power'],
      skillSequences: ['AAA', 'BAB', 'BBC'],
      seeds: ['v6-a', 'v6-b']
    };
    const first = Simulator.runV6BalanceMatrix(options);
    const replay = Simulator.runV6BalanceMatrix(options);

    expect(replay).toEqual(first);
    expect(first).toEqual(expect.objectContaining({
      rulesVersion: 6,
      levels: [1, 5],
      statProfiles: ['balanced', 'power'],
      skillSequences: ['AAA', 'BAB', 'BBC'],
      seeds: ['v6-a', 'v6-b'],
      templates: expect.any(Array),
      neutralResults: expect.any(Array),
      advantageResults: expect.any(Array)
    }));
    expect(first.templates).toHaveLength(24);
    expect(first.battleCount).toBeGreaterThan(0);
  });

  test('meets the complete neutral, advantage and per-template acceptance gates', () => {
    const report = Simulator.runV6BalanceMatrix();

    expect(report.levels).toEqual([1, 5, 10, 15, 20]);
    expect(report.statProfiles).toEqual(['balanced', 'power', 'guard']);
    expect(report.templates).toHaveLength(24);
    expect(report.neutralBattleCount).toBeGreaterThan(0);
    expect(report.advantageBattleCount).toBeGreaterThan(0);
    report.neutralResults.forEach(result => {
      expect(result.winRate).toBeGreaterThanOrEqual(0.47);
      expect(result.winRate).toBeLessThanOrEqual(0.53);
    });
    report.advantageResults.forEach(result => {
      expect(result.winRate).toBeGreaterThanOrEqual(0.55);
      expect(result.winRate).toBeLessThanOrEqual(0.60);
    });
    report.templateNeutralResults.forEach(result => {
      expect(result.winRate).toBeLessThanOrEqual(0.56);
    });
  });
});
