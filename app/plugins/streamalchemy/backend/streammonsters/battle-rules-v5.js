const {
  buildV5SkillCatalog,
  hashNumber,
  V6_ELEMENT_ADVANTAGE_PAIRS,
  V6_ELEMENT_ADVANTAGE_DAMAGE,
  V6_SKILL_CATALOG,
  V8_LEVEL_ONE_ELEMENT_DAMAGE_TUNING,
  resolveStageSkill
} = require('./catalog');
const { elementAdvantage } = require('./battle-rules-v3');
const {
  arenaCollapseRecoveryFactor
} = require('./battle-rules-v8');

const RULES_VERSION = 5;
const V6_RULES_VERSION = 6;
const V7_RULES_VERSION = 7;
const V8_RULES_VERSION = 8;
const CHOICES = Object.freeze(['A', 'B', 'C']);
const SKILL_CATALOG = Object.freeze(buildV5SkillCatalog());
const V6_ELEMENT_ADVANTAGES = new Set(V6_ELEMENT_ADVANTAGE_PAIRS);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function maxHp(fighter) {
  return 20 + (Math.max(0, Number(fighter.stats?.vitality) || 0) * 4) +
    (Math.max(1, Number(fighter.level) || 1) * 2);
}

function initialFighterState(fighter, override = {}) {
  const maximum = maxHp(fighter);
  return {
    hp: Math.max(0, Math.min(maximum, Number(override.hp ?? maximum))),
    maxHp: maximum,
    shield: Math.max(0, Number(override.shield) || 0),
    charge: Math.max(0, Math.min(100, Number(override.charge) || 0)),
    burn: Math.max(0, Math.min(3, Number(override.burn) || 0)),
    evade: Math.max(0, Math.min(75, Number(override.evade) || 0)),
    thorns: Math.max(0, Math.min(3, Number(override.thorns) || 0)),
    reflect: Math.max(0, Math.min(3, Number(override.reflect) || 0)),
    weakened: Math.max(0, Math.min(3, Number(override.weakened) || 0))
  };
}

function addCharge(state, amount) {
  state.charge = Math.min(100, state.charge + Math.max(0, amount));
}

function addShield(state, amount, outcomes, {
  arenaCollapse = false,
  arenaCollapseRound = 0
} = {}) {
  const requested = Math.max(0, Math.round(amount));
  const factor = arenaCollapseRound
    ? arenaCollapseRecoveryFactor(arenaCollapseRound, 'shield')
    : (arenaCollapse ? 0.5 : 1);
  const gained = Math.floor(requested * factor);
  state.shield += gained;
  outcomes.push({
    type: 'shield',
    requested,
    amount: gained,
    ...(factor < 1
      ? {
          arenaCollapseFactor: factor,
          arenaCollapseReduction: requested - gained
        }
      : {})
  });
}

function heal(state, amount, outcomes, type = 'heal', {
  arenaCollapseRound = 0
} = {}) {
  const requested = Math.max(0, Math.round(amount));
  const factor = arenaCollapseRound
    ? arenaCollapseRecoveryFactor(arenaCollapseRound, 'heal')
    : 1;
  const available = Math.round(requested * factor);
  const before = state.hp;
  state.hp = Math.min(state.maxHp, state.hp + available);
  outcomes.push({
    type,
    requested,
    amount: state.hp - before,
    ...(factor < 1
      ? {
          arenaCollapseFactor: factor,
          arenaCollapseReduction: requested - available
        }
      : (arenaCollapseRound ? { arenaCollapseFactor: factor } : {}))
  });
}

function damageFor(
  fighter,
  target,
  effect,
  disableElementAdvantage = false,
  rulesVersion = RULES_VERSION,
  roundingRoll = null
) {
  const might = Math.max(0, Number(fighter.stats?.might) || 0);
  const guard = Math.max(0, Number(target.stats?.guard) || 0);
  const weakened = Math.max(0, Number(fighter.weakened) || 0);
  const hasAdvantage = rulesVersion >= V6_RULES_VERSION
    ? V6_ELEMENT_ADVANTAGES.has(`${fighter.element}:${target.element}`)
    : elementAdvantage(fighter.element, target.element);
  const elementBonus = !disableElementAdvantage && hasAdvantage
    ? (
      rulesVersion >= V6_RULES_VERSION
        ? V6_ELEMENT_ADVANTAGE_DAMAGE[`${fighter.element}:${target.element}`]
        : 3
    )
    : 0;
  const levelOneElementBonus = rulesVersion >= V8_RULES_VERSION &&
    Math.max(1, Number(fighter.level) || 1) === 1
    ? Number(V8_LEVEL_ONE_ELEMENT_DAMAGE_TUNING[fighter.element]) || 0
    : 0;
  const rawDamage = effect.power +
    (might * 0.6) -
    (guard * 0.25) -
    weakened +
    elementBonus +
    levelOneElementBonus;
  if (rulesVersion >= V8_RULES_VERSION && Number.isFinite(roundingRoll)) {
    const floor = Math.floor(rawDamage);
    const fraction = rawDamage - floor;
    return Math.max(1, floor + (roundingRoll < fraction ? 1 : 0));
  }
  return Math.max(1, Math.round(rawDamage));
}

function applyDamage(target, requestedDamage, hitIndex, {
  pierce = 0,
  evadeChance = 0,
  evadeRoll = null
} = {}) {
  const shieldBefore = target.shield;
  const hpBefore = target.hp;
  const chance = Math.max(0, Math.min(100, Number(evadeChance) || 0));
  const evaded = chance > 0 && Number(evadeRoll) < chance;
  if (evaded) {
    return {
      index: hitIndex,
      requestedDamage,
      evadeChance: chance,
      evadeRoll,
      evaded: true,
      shieldBefore,
      shieldPenetrated: 0,
      shieldAbsorbed: 0,
      hpBefore,
      hpDamage: 0,
      shieldAfter: target.shield,
      hpAfter: target.hp
    };
  }
  const penetrated = Math.min(requestedDamage, Math.max(0, pierce));
  const shieldDamage = Math.max(0, requestedDamage - penetrated);
  const shieldAbsorbed = Math.min(shieldBefore, shieldDamage);
  const hpDamage = Math.min(
    target.hp,
    penetrated + Math.max(0, shieldDamage - shieldAbsorbed)
  );
  target.shield = Math.max(0, shieldBefore - shieldAbsorbed);
  target.hp = Math.max(0, target.hp - hpDamage);
  if (hpDamage > 0) addCharge(target, 25);
  return {
    index: hitIndex,
    requestedDamage,
    shieldBefore,
    shieldPenetrated: penetrated,
    shieldAbsorbed,
    evadeChance: chance,
    evadeRoll,
    evaded: false,
    hpBefore,
    hpDamage,
    shieldAfter: target.shield,
    hpAfter: target.hp
  };
}

function applyBurnTick(state, statusEffects) {
  if (state.burn < 1 || state.hp < 1) return;
  const amount = Math.min(state.hp, state.burn);
  const hpBefore = state.hp;
  state.hp -= amount;
  state.burn = 0;
  if (amount > 0) addCharge(state, 25);
  statusEffects.push({
    type: 'burn_tick',
    amount,
    hpBefore,
    hpDamage: amount,
    hpAfter: state.hp,
    remaining: state.burn
  });
}

function applyRetaliation(actorState, type, amount, index) {
  const hit = applyDamage(actorState, amount, index);
  return { type, ...hit };
}

function normalizeChoice(requestedChoice, state) {
  const requested = String(requestedChoice || '').trim().toUpperCase();
  if (!CHOICES.includes(requested)) {
    return { choice: 'A', choiceFallback: 'invalid_choice' };
  }
  if (requested === 'C' && state.charge < 100) {
    return { choice: 'A', choiceFallback: 'special_not_charged' };
  }
  return { choice: requested, choiceFallback: null };
}

function resolveAction({
  actor,
  target,
  actorState,
  targetState,
  requestedChoice,
  round,
  sequence,
  seed,
  disableElementAdvantage = false,
  rulesVersion = RULES_VERSION
}) {
  const { choice, choiceFallback } = normalizeChoice(requestedChoice, actorState);
  const skill = rulesVersion >= V7_RULES_VERSION
    ? resolveStageSkill(
      actor.template_id,
      choice,
      actor.evolution_stage ?? actor.evolutionStage,
      rulesVersion
    )
    : (
      rulesVersion >= V6_RULES_VERSION
        ? V6_SKILL_CATALOG[actor.template_id]?.[choice]
        : SKILL_CATALOG[actor.template_id]?.[choice]
    );
  if (!skill) {
    throw new Error(
      `STREAM_MONSTERS_V${rulesVersion}_SKILL_MISSING:${actor.template_id}:${choice}`
    );
  }
  const before = {
    actor: clone(actorState),
    target: clone(targetState)
  };
  const hits = [];
  const outcomes = [];
  const retaliations = [];
  const statusEffects = [];
  const rolls = [];
  let dealtHpDamage = 0;

  applyBurnTick(actorState, statusEffects);
  if (actorState.hp <= 0) {
    const action = {
      sequence,
      round,
      actorId: actor.monster_id,
      targetId: target.monster_id,
      requestedChoice: String(requestedChoice || '').trim().toUpperCase(),
      choice,
      choiceFallback,
      skill: clone(skill),
      before,
      after: { actor: clone(actorState), target: clone(targetState) },
      hits,
      outcomes,
      retaliations,
      statusEffects,
      terminal: true,
      skipped: 'burn_ko'
    };
    if (rulesVersion >= V6_RULES_VERSION) {
      action.rolls = rolls;
      action.knockouts = [
        { monsterId: actor.monster_id, cause: 'status' }
      ];
      action.knockout = action.knockouts[0];
    }
    return action;
  }
  if (choice === 'A') addCharge(actorState, 25);
  if (choice === 'B') addCharge(actorState, 50);
  if (choice === 'C') actorState.charge = 0;

  for (const [effectIndex, effect] of skill.effects.entries()) {
    if (effect.type === 'damage') {
      const damageRoundingRoll = rulesVersion >= V8_RULES_VERSION
        ? (
            hashNumber(
              `${seed}:round:${round}:sequence:${sequence}:effect:${effectIndex}:damage-rounding`
            ) % 10_000
          ) / 10_000
        : null;
      if (damageRoundingRoll != null) {
        rolls.push({
          purpose: 'damage_rounding',
          effectIndex,
          value: damageRoundingRoll
        });
      }
      const total = damageFor(
        { ...actor, weakened: actorState.weakened },
        target,
        effect,
        disableElementAdvantage,
        rulesVersion,
        damageRoundingRoll
      );
      const count = Math.max(1, Number(effect.hits) || 1);
      if (count > 1) outcomes.push({ type: 'multihit', hits: count });
      const pierce = skill.effects.find(candidate => candidate.type === 'pierce')?.power || 0;
      if (pierce > 0) outcomes.push({ type: 'pierce', amount: pierce });
      const actionEvadeChance = targetState.evade;
      const actionEvadeRoll = hashNumber(
        `${seed}:round:${round}:sequence:${sequence}:hit:1:evade:${target.monster_id}`
      ) % 100;
      if (rulesVersion >= V6_RULES_VERSION) {
        rolls.push({
          purpose: 'evade',
          hitIndex: 1,
          targetId: target.monster_id,
          chance: actionEvadeChance,
          value: actionEvadeRoll
        });
      }
      for (let index = 0; index < count && targetState.hp > 0; index += 1) {
        const remaining = total - hits.reduce((sum, hit) => sum + hit.requestedDamage, 0);
        const requested = Math.max(1, Math.ceil(remaining / (count - index)));
        const hit = applyDamage(targetState, requested, index + 1, {
          pierce,
          evadeChance: actionEvadeChance,
          evadeRoll: actionEvadeRoll
        });
        hits.push(hit);
        dealtHpDamage += hit.hpDamage;
        const defenderCanRetaliate = rulesVersion < V8_RULES_VERSION ||
          targetState.hp > 0;
        if (
          defenderCanRetaliate &&
          hit.hpDamage > 0 &&
          targetState.thorns > 0 &&
          actorState.hp > 0
        ) {
          const thorns = targetState.thorns;
          targetState.thorns = 0;
          retaliations.push(applyRetaliation(
            actorState,
            'thorns',
            thorns,
            retaliations.length + 1
          ));
        }
        if (
          defenderCanRetaliate &&
          hit.hpDamage > 0 &&
          targetState.reflect > 0 &&
          actorState.hp > 0
        ) {
          const reflect = targetState.reflect;
          targetState.reflect = 0;
          retaliations.push(applyRetaliation(
            actorState,
            'reflect',
            reflect,
            retaliations.length + 1
          ));
        }
        if (actorState.hp <= 0) break;
      }
      if (actionEvadeChance > 0) targetState.evade = 0;
    } else if (effect.type === 'shield') {
      addShield(
        actorState,
        effect.power + Math.floor((Number(actor.stats?.guard) || 0) / 3),
        outcomes,
        {
          arenaCollapseRound: rulesVersion >= V8_RULES_VERSION && round >= 5
            ? round
            : 0
        }
      );
    } else if (effect.type === 'heal') {
      heal(actorState, effect.power, outcomes, 'heal', {
        arenaCollapseRound: rulesVersion >= V8_RULES_VERSION && round >= 5
          ? round
          : 0
      });
    } else if (effect.type === 'lifesteal') {
      heal(
        actorState,
        Math.floor(dealtHpDamage * effect.ratio),
        outcomes,
        'lifesteal',
        {
          arenaCollapseRound: rulesVersion >= V8_RULES_VERSION && round >= 5
            ? round
            : 0
        }
      );
    } else if (effect.type === 'burn') {
      const amount = Math.max(0, Number(effect.power) || 0);
      targetState.burn = Math.min(3, targetState.burn + amount);
      outcomes.push({ type: 'burn', amount, pending: targetState.burn });
    } else if (effect.type === 'evade') {
      const chance = Math.max(0, Math.min(75, Number(effect.chance) || 0));
      actorState.evade = Math.max(actorState.evade, chance);
      outcomes.push({ type: 'evade', chance });
    } else if (effect.type === 'thorns') {
      actorState.thorns = Math.min(3, actorState.thorns + effect.power);
      outcomes.push({ type: 'thorns', amount: effect.power });
    } else if (effect.type === 'reflect') {
      actorState.reflect = Math.min(3, actorState.reflect + effect.power);
      outcomes.push({ type: 'reflect', amount: effect.power });
    } else if (effect.type === 'weaken') {
      targetState.weakened = Math.min(3, targetState.weakened + effect.power);
      outcomes.push({ type: 'weaken', amount: effect.power });
    }
    if (actorState.hp <= 0 || targetState.hp <= 0) break;
  }
  if (before.actor.weakened > 0) {
    actorState.weakened = Math.max(0, actorState.weakened - 1);
  }

  const action = {
    sequence,
    round,
    actorId: actor.monster_id,
    targetId: target.monster_id,
    requestedChoice: String(requestedChoice || '').trim().toUpperCase(),
    choice,
    choiceFallback,
    skill: clone(skill),
    before,
    after: {
      actor: clone(actorState),
      target: clone(targetState)
    },
    hits,
    outcomes,
    retaliations,
    statusEffects,
    terminal: actorState.hp <= 0 || targetState.hp <= 0
  };
  if (rulesVersion >= V6_RULES_VERSION) {
    action.rolls = rolls;
    action.knockouts = [];
    if (targetState.hp <= 0) {
      action.knockouts.push({ monsterId: target.monster_id, cause: 'skill' });
    }
    if (actorState.hp <= 0) {
      const lethalRetaliation = retaliations.find(retaliation => (
        retaliation.hpAfter <= 0
      ));
      action.knockouts.push({
        monsterId: actor.monster_id,
        cause: lethalRetaliation?.type || 'retaliation'
      });
    }
    action.knockout = action.knockouts.length === 1
      ? action.knockouts[0]
      : null;
  }
  return action;
}

function resolveInteractiveRound({
  fighters,
  choices = {},
  seed,
  round = 1,
  state = {},
  disableElementAdvantage = false,
  rulesVersion = RULES_VERSION
}) {
  if (!Array.isArray(fighters) || fighters.length !== 2) {
    throw new Error('STREAM_MONSTERS_V5_REQUIRES_TWO_FIGHTERS');
  }
  const states = Object.fromEntries(fighters.map(fighter => [
    fighter.monster_id,
    initialFighterState(fighter, state[fighter.monster_id])
  ]));
  const ordered = [...fighters].sort((left, right) => {
    const agility = (Number(right.stats?.agility) || 0) - (Number(left.stats?.agility) || 0);
    if (agility) return agility;
    return hashNumber(`${seed}:round:${round}:order:${left.monster_id}`) -
      hashNumber(`${seed}:round:${round}:order:${right.monster_id}`);
  });
  const actions = [];
  for (const actor of ordered) {
    const target = fighters.find(candidate => candidate.monster_id !== actor.monster_id);
    if (states[actor.monster_id].hp <= 0 || states[target.monster_id].hp <= 0) break;
    actions.push(resolveAction({
      actor,
      target,
      actorState: states[actor.monster_id],
      targetState: states[target.monster_id],
      requestedChoice: choices[actor.monster_id],
      round,
      sequence: actions.length + 1,
      seed,
      disableElementAdvantage,
      rulesVersion
    }));
    if (states[target.monster_id].hp <= 0) break;
  }
  const living = fighters.filter(fighter => states[fighter.monster_id].hp > 0);
  return {
    rulesVersion: Math.max(RULES_VERSION, Number(rulesVersion) || RULES_VERSION),
    round,
    actions,
    state: states,
    terminal: living.length < 2,
    winnerId: living.length === 1 ? living[0].monster_id : null
  };
}

module.exports = {
  RULES_VERSION,
  V6_RULES_VERSION,
  V7_RULES_VERSION,
  V8_RULES_VERSION,
  CHOICES,
  SKILL_CATALOG,
  V6_SKILL_CATALOG,
  maxHp,
  initialFighterState,
  normalizeChoice,
  resolveInteractiveRound
};
