const { getTemplate, deterministicTemplateId } = require('./catalog');

const RULES_VERSION = 3;
const ELEMENT_ADVANTAGES = new Set([
  'Ember:Grove',
  'Grove:Tide',
  'Tide:Ember',
  'Volt:Gale',
  'Gale:Lunar',
  'Lunar:Volt'
]);

const MECHANICS = Object.freeze({
  Ember: Object.freeze({
    attack: Object.freeze(['burn', 2]),
    defense: Object.freeze(['shield', 4, 'thorns', 2]),
    special: Object.freeze(['damageBonus', 5, 'heal', 2])
  }),
  Tide: Object.freeze({
    attack: Object.freeze(['outgoingDamageReduction', 2]),
    defense: Object.freeze(['shield', 3, 'heal', 3]),
    special: Object.freeze(['damageBonus', 1, 'heal', 6])
  }),
  Grove: Object.freeze({
    attack: Object.freeze(['thorns', 2]),
    defense: Object.freeze(['shield', 7]),
    special: Object.freeze(['shield', 5, 'heal', 3])
  }),
  Gale: Object.freeze({
    attack: Object.freeze(['hitCount', 2, 'damageBonus', 1]),
    defense: Object.freeze(['evadeOrShield', 35, 3]),
    special: Object.freeze(['hitCount', 3, 'damageBonus', 4])
  }),
  Volt: Object.freeze({
    attack: Object.freeze(['shieldRemoval', 2]),
    defense: Object.freeze(['shield', 4, 'reflect', 2]),
    special: Object.freeze(['damageBonus', 4, 'shieldPenetration', 4])
  }),
  Lunar: Object.freeze({
    attack: Object.freeze(['damageBonus', -1, 'heal', 3]),
    defense: Object.freeze(['shield', 5, 'outgoingDamageReduction', 1]),
    special: Object.freeze(['damageBonus', 2, 'lifestealDivisor', 2])
  })
});

const AGGRESSIVE_PERSONALITIES = new Set([
  'aggressive', 'brave', 'mischievous', 'dramatic', 'competitive', 'adventurous'
]);
const DEFENSIVE_PERSONALITIES = new Set([
  'defensive', 'gentle', 'loyal', 'dreamy', 'cheerful', 'shy'
]);

function hashNumber(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roll(seed, key, maximum = 100) {
  return hashNumber(`${seed}:${key}`) % maximum;
}

function elementAdvantage(attacker, defender) {
  return ELEMENT_ADVANTAGES.has(`${attacker}:${defender}`);
}

// Battle HP is temporary and derived identically for every element.
function maxHpFor(monster) {
  const vitality = Math.max(0, Number(monster?.stats?.vitality) || 0);
  const level = Math.max(1, Number(monster?.level) || 1);
  return 22 + (vitality * 3) + (level * 2);
}

function skillsFor(monster) {
  const templateId = monster.template_id ||
    deterministicTemplateId(monster.element, monster.monster_id);
  const template = getTemplate(templateId);
  const catalogSkills = template?.skills || {};
  return Object.fromEntries(['attack', 'defense', 'special'].map(type => [
    type,
    {
      id: `${templateId}:${type}`,
      type,
      name: catalogSkills[type]?.name || `${monster.name || monster.element} ${type}`,
      vfxKey: catalogSkills[type]?.vfxKey || `${templateId}:${type}`
    }
  ]));
}

function snapshot(state) {
  return {
    hp: state.hp,
    maxHp: state.maxHp,
    shield: state.shield,
    charged: state.charged,
    specialUsed: state.specialUsed,
    burn: state.burn.map(effect => ({ ...effect })),
    thorns: state.thorns,
    reflect: state.reflect,
    outgoingDamageReduction: state.outgoingDamageReduction,
    evadeNextAction: state.evadeNextAction
  };
}

function createState(monster, override = {}) {
  const maxHp = maxHpFor(monster);
  const requestedHp = Number.isFinite(Number(override.hp)) ? Number(override.hp) : maxHp;
  return {
    monster,
    maxHp,
    hp: Math.max(0, Math.min(maxHp, requestedHp)),
    shield: Math.max(0, Number(override.shield ?? monster.initialShield) || 0),
    charged: Boolean(override.charged),
    chargeActivated: Boolean(override.charged),
    specialUsed: Boolean(override.specialUsed),
    burn: [],
    thorns: 0,
    reflect: 0,
    outgoingDamageReduction: 0,
    evadeNextAction: false
  };
}

function stateOverride(options, monster, side) {
  return options.initialState?.[monster.monster_id] ||
    options.initialState?.[side] ||
    {};
}

function baseDamage(attacker, defender, context, actionType, hitIndex = 0) {
  const elementBonus = !context.disableElementAdvantage &&
    elementAdvantage(attacker.monster.element, defender.monster.element)
    ? 3
    : 0;
  const variance = roll(
    context.seed,
    `round:${context.round}:actor:${attacker.monster.monster_id}:action:${actionType}:hit:${hitIndex}:variance`,
    5
  ) - 2;
  const value = Math.max(
    1,
    5 +
      (Number(attacker.monster.stats?.might) || 0) +
      elementBonus +
      variance -
      Math.floor((Number(defender.monster.stats?.guard) || 0) / 2)
  );
  return { value, elementBonus, variance };
}

function personalityKind(personality) {
  const normalized = String(personality || '').trim().toLowerCase();
  if (AGGRESSIVE_PERSONALITIES.has(normalized)) return 'aggressive';
  if (DEFENSIVE_PERSONALITIES.has(normalized)) return 'defensive';
  return 'adaptive';
}

function chooseAction(actor, target, context) {
  if (actor.charged && !actor.specialUsed) return 'special';
  const planned = context.actionPlan?.[actor.monster.monster_id]?.[context.round - 1];
  if (planned === 'attack' || planned === 'defense') return planned;
  const kind = personalityKind(actor.monster.personality);
  const behindBy = (target.hp / target.maxHp) - (actor.hp / actor.maxHp);
  if (kind === 'adaptive' && behindBy >= 0.15) return 'defense';
  const threshold = kind === 'aggressive' ? 75 : (kind === 'defensive' ? 25 : 60);
  return roll(
    context.seed,
    `round:${context.round}:actor:${actor.monster.monster_id}:decision`,
    100
  ) < threshold ? 'attack' : 'defense';
}

function chargeIfEligible(state, context, cause, events) {
  if (
    state.hp > 0 &&
    state.hp * 100 <= state.maxHp * 40 &&
    !state.charged &&
    !state.specialUsed &&
    !state.chargeActivated
  ) {
    state.charged = true;
    state.chargeActivated = true;
    events.push({
      type: 'streammonsters:battle_special_charged',
      payload: {
        round: context.round,
        monsterId: state.monster.monster_id,
        hp: state.hp,
        maxHp: state.maxHp,
        cause
      }
    });
  }
}

function heal(state, amount, appliedEffects, source) {
  const actual = Math.min(Math.max(0, amount), state.maxHp - state.hp);
  state.hp += actual;
  appliedEffects.push({ type: 'heal', requested: amount, amount: actual, source });
  return actual;
}

function addShield(state, amount, appliedEffects, source) {
  state.shield += amount;
  appliedEffects.push({ type: 'shield', amount, source });
}

function splitDamage(total, hitCount) {
  const base = Math.floor(total / hitCount);
  const remainder = total % hitCount;
  return Array.from({ length: hitCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function applyHit(actor, target, requestedDamage, context, action, hitIndex, options = {}) {
  const hit = {
    index: hitIndex,
    preMitigationDamage: requestedDamage,
    outgoingReduction: 0,
    shieldRemoved: 0,
    shieldPenetrated: 0,
    shieldAbsorbed: 0,
    hpDamage: 0,
    evaded: false,
    thornsDamage: 0,
    reflectDamage: 0
  };
  if (target.evadeNextAction) {
    hit.evaded = true;
    return hit;
  }
  let damage = requestedDamage;
  if (actor.outgoingDamageReduction > 0) {
    hit.outgoingReduction = Math.min(actor.outgoingDamageReduction, damage);
    damage = Math.max(0, damage - hit.outgoingReduction);
    action.consumedEffects.push({
      type: 'outgoingDamageReduction',
      amount: actor.outgoingDamageReduction,
      applied: hit.outgoingReduction
    });
    actor.outgoingDamageReduction = 0;
  }
  const penetration = Math.min(options.penetration || 0, target.shield, damage);
  hit.shieldPenetrated = penetration;
  let remaining = damage - penetration;
  hit.shieldAbsorbed = Math.min(target.shield, remaining);
  target.shield -= hit.shieldAbsorbed;
  remaining -= hit.shieldAbsorbed;
  hit.hpDamage = Math.min(target.hp, penetration + remaining);
  target.hp -= hit.hpDamage;

  if (target.thorns > 0) {
    hit.thornsDamage = Math.min(actor.hp, target.thorns);
    actor.hp -= hit.thornsDamage;
    action.consumedEffects.push({ type: 'thorns', amount: target.thorns });
    target.thorns = 0;
  }
  if (target.reflect > 0) {
    hit.reflectDamage = Math.min(actor.hp, target.reflect);
    actor.hp -= hit.reflectDamage;
    action.consumedEffects.push({ type: 'reflect', amount: target.reflect });
    target.reflect = 0;
  }
  chargeIfEligible(target, context, 'incomingDamage', context.events);
  chargeIfEligible(actor, context, 'counterDamage', context.events);
  return hit;
}

function resolveDefense(actor, target, context, action) {
  const element = actor.monster.element;
  if (element === 'Ember') {
    addShield(actor, 4, action.appliedEffects, 'defense');
    actor.thorns = 2;
    action.appliedEffects.push({ type: 'thorns', amount: 2, duration: 'nextIncomingHit' });
  } else if (element === 'Tide') {
    addShield(actor, 3, action.appliedEffects, 'defense');
    heal(actor, 3, action.appliedEffects, 'defense');
  } else if (element === 'Grove') {
    addShield(actor, 7, action.appliedEffects, 'defense');
  } else if (element === 'Gale') {
    const value = roll(
      context.seed,
      `round:${context.round}:actor:${actor.monster.monster_id}:galeDefense`,
      100
    );
    action.seedRolls.push({ purpose: 'galeDefense', value, threshold: 35 });
    if (value < 35) {
      actor.evadeNextAction = true;
      action.appliedEffects.push({ type: 'evade', chance: 35, duration: 'nextIncomingAction' });
    } else {
      addShield(actor, 3, action.appliedEffects, 'failedEvadeFallback');
    }
  } else if (element === 'Volt') {
    addShield(actor, 4, action.appliedEffects, 'defense');
    actor.reflect = 2;
    action.appliedEffects.push({ type: 'reflect', amount: 2, duration: 'nextIncomingHit' });
  } else if (element === 'Lunar') {
    addShield(actor, 5, action.appliedEffects, 'defense');
    target.outgoingDamageReduction += 1;
    action.appliedEffects.push({
      type: 'outgoingDamageReduction',
      amount: 1,
      targetId: target.monster.monster_id,
      duration: 'nextOutgoingDamagingHit'
    });
  }
}

function resolveDamagingAction(actor, target, context, action) {
  const type = action.skill.type;
  const element = actor.monster.element;
  const computedBase = baseDamage(actor, target, context, type, 0);
  action.baseDamage = computedBase.value;
  action.seedRolls.push({
    purpose: 'damageVariance',
    value: computedBase.variance,
    elementBonus: computedBase.elementBonus,
    hitIndex: 0
  });

  let bonus = 0;
  let hitCount = 1;
  let penetration = 0;
  if (type === 'special') {
    bonus = { Ember: 5, Tide: 1, Grove: 0, Gale: 4, Volt: 4, Lunar: 2 }[element];
    if (element === 'Gale') hitCount = 3;
    if (element === 'Volt') penetration = 4;
  } else {
    if (element === 'Gale') {
      bonus = 1;
      hitCount = 2;
    } else if (element === 'Lunar') {
      bonus = -1;
    }
  }

  let shieldRemovedBeforeDamage = 0;
  if (type === 'attack' && element === 'Volt') {
    shieldRemovedBeforeDamage = Math.min(2, target.shield);
    target.shield -= shieldRemovedBeforeDamage;
    action.consumedEffects.push({
      type: 'shieldRemoval',
      requested: 2,
      amount: shieldRemovedBeforeDamage
    });
  }
  const combinedDamage = Math.max(1, computedBase.value + bonus);
  const hitDamages = splitDamage(combinedDamage, hitCount);
  const evadesAction = target.evadeNextAction;
  for (let index = 0; index < hitDamages.length; index += 1) {
    action.hits.push(applyHit(
      actor,
      target,
      hitDamages[index],
      context,
      action,
      index,
      { penetration: index === 0 ? penetration : 0 }
    ));
  }
  if (action.hits[0]) action.hits[0].shieldRemoved = shieldRemovedBeforeDamage;
  if (evadesAction) {
    target.evadeNextAction = false;
    action.consumedEffects.push({ type: 'evade', scope: 'incomingAction' });
  }
  const actualHpDamage = action.hits.reduce((sum, hit) => sum + hit.hpDamage, 0);

  if (type === 'attack' && element === 'Ember') {
    target.burn.push({
      amount: 2,
      dueRound: context.round + 1,
      sourceId: actor.monster.monster_id
    });
    action.appliedEffects.push({
      type: 'burn',
      amount: 2,
      dueRound: context.round + 1,
      targetId: target.monster.monster_id
    });
  } else if (type === 'attack' && element === 'Tide') {
    target.outgoingDamageReduction += 2;
    action.appliedEffects.push({
      type: 'outgoingDamageReduction',
      amount: 2,
      targetId: target.monster.monster_id,
      duration: 'nextOutgoingDamagingHit'
    });
  } else if (type === 'attack' && element === 'Grove') {
    actor.thorns = 2;
    action.appliedEffects.push({ type: 'thorns', amount: 2, duration: 'nextIncomingHit' });
  } else if (type === 'attack' && element === 'Lunar') {
    heal(actor, 3, action.appliedEffects, 'attack');
  }

  if (type === 'special') {
    if (element === 'Ember') {
      heal(actor, 2, action.appliedEffects, 'special');
    } else if (element === 'Tide') {
      heal(actor, 6, action.appliedEffects, 'special');
    } else if (element === 'Grove') {
      addShield(actor, 5, action.appliedEffects, 'special');
      heal(actor, 3, action.appliedEffects, 'special');
    } else if (element === 'Lunar') {
      heal(actor, Math.floor(actualHpDamage / 2), action.appliedEffects, 'specialLifesteal');
    }
  }
}

function resolveAction(actor, target, actionType, context) {
  const action = {
    round: context.round,
    actorId: actor.monster.monster_id,
    targetId: target.monster.monster_id,
    before: { actor: snapshot(actor), target: snapshot(target) },
    after: null,
    skill: context.skills[actor.monster.monster_id][actionType],
    mechanics: MECHANICS[actor.monster.element][actionType],
    baseDamage: 0,
    hits: [],
    appliedEffects: [],
    consumedEffects: [],
    seedRolls: [],
    maxHp: { actor: actor.maxHp, target: target.maxHp },
    terminal: false,
    winnerId: null
  };

  if (actionType === 'special') {
    actor.charged = false;
    actor.specialUsed = true;
    action.consumedEffects.push({ type: 'specialCharge', amount: 1 });
  }
  if (actionType === 'defense') {
    resolveDefense(actor, target, context, action);
  } else {
    resolveDamagingAction(actor, target, context, action);
  }
  action.terminal = actor.hp <= 0 || target.hp <= 0;
  action.winnerId = action.terminal
    ? (actor.hp > target.hp ? actor.monster.monster_id : target.monster.monster_id)
    : null;
  action.after = { actor: snapshot(actor), target: snapshot(target) };
  context.events.push({
    type: 'streammonsters:battle_skill_used',
    payload: {
      round: context.round,
      actorId: action.actorId,
      targetId: action.targetId,
      skill: action.skill,
      action
    }
  });
  return action;
}

function applyRoundStartEffects(state, context, startEffects) {
  const due = state.burn.filter(effect => effect.dueRound <= context.round);
  state.burn = state.burn.filter(effect => effect.dueRound > context.round);
  for (const effect of due) {
    const hpBefore = state.hp;
    const damage = Math.min(state.hp, effect.amount);
    state.hp -= damage;
    startEffects.push({
      type: 'burn',
      monsterId: state.monster.monster_id,
      sourceId: effect.sourceId,
      requestedDamage: effect.amount,
      hpDamage: damage,
      hpBefore,
      hpAfter: state.hp,
      consumed: true
    });
    chargeIfEligible(state, context, 'burn', context.events);
  }
}

function speedOrder(left, right, context) {
  const leftSpeed = Number(left.monster.stats?.agility) || 0;
  const rightSpeed = Number(right.monster.stats?.agility) || 0;
  if (leftSpeed !== rightSpeed) return leftSpeed > rightSpeed ? [left, right] : [right, left];
  const tieRoll = roll(context.seed, `round:${context.round}:speedTie`, 100);
  context.orderRoll = { purpose: 'speedTie', value: tieRoll };
  return tieRoll < 50 ? [left, right] : [right, left];
}

function resolveBattle(monsterA, monsterB, seed, options = {}) {
  const events = [];
  const states = {
    [monsterA.monster_id]: createState(monsterA, stateOverride(options, monsterA, 'a')),
    [monsterB.monster_id]: createState(monsterB, stateOverride(options, monsterB, 'b'))
  };
  const left = states[monsterA.monster_id];
  const right = states[monsterB.monster_id];
  const skills = {
    [monsterA.monster_id]: skillsFor(monsterA),
    [monsterB.monster_id]: skillsFor(monsterB)
  };
  const elementAdvantageMonsterId = options.disableElementAdvantage
    ? null
    : (
      elementAdvantage(monsterA.element, monsterB.element)
        ? monsterA.monster_id
        : (elementAdvantage(monsterB.element, monsterA.element) ? monsterB.monster_id : null)
    );
  const rounds = [];

  for (let number = 1; number <= 3; number += 1) {
    const context = {
      seed,
      round: number,
      events,
      skills,
      actionPlan: options.actionPlan,
      disableElementAdvantage: Boolean(options.disableElementAdvantage),
      orderRoll: null
    };
    const startEffects = [];
    applyRoundStartEffects(left, context, startEffects);
    applyRoundStartEffects(right, context, startEffects);
    const ordered = speedOrder(left, right, context);
    const actions = [];
    for (const actor of ordered) {
      const target = actor === left ? right : left;
      if (actor.hp <= 0 || target.hp <= 0) continue;
      const actionType = chooseAction(actor, target, context);
      actions.push(resolveAction(actor, target, actionType, context));
    }
    const terminal = left.hp <= 0 || right.hp <= 0;
    const first = actions[0] || null;
    const second = actions[1] || null;
    rounds.push({
      number,
      round: number,
      firstMonsterId: ordered[0].monster.monster_id,
      firstDamage: first?.hits.reduce((sum, hit) => sum + hit.hpDamage, 0) || 0,
      secondDamage: second?.hits.reduce((sum, hit) => sum + hit.hpDamage, 0) || 0,
      hpA: left.hp,
      hpB: right.hp,
      maxHpA: left.maxHp,
      maxHpB: right.maxHp,
      elementAdvantageMonsterId,
      stanceAdvantageMonsterId: null,
      orderRoll: context.orderRoll,
      startEffects,
      actions,
      terminal,
      winnerId: terminal
        ? (left.hp > right.hp ? monsterA.monster_id : monsterB.monster_id)
        : null
    });
  }

  const winnerId = left.hp === right.hp
    ? (
      roll(seed, 'winnerTie', 100) < 50
        ? monsterA.monster_id
        : monsterB.monster_id
    )
    : (left.hp > right.hp ? monsterA.monster_id : monsterB.monster_id);
  rounds[rounds.length - 1].winnerId = winnerId;
  return {
    rulesVersion: RULES_VERSION,
    seed,
    monsterAId: monsterA.monster_id,
    monsterBId: monsterB.monster_id,
    winnerId,
    elementAdvantageMonsterId,
    stanceAdvantageMonsterId: null,
    maxHp: {
      [monsterA.monster_id]: left.maxHp,
      [monsterB.monster_id]: right.maxHp
    },
    finalHp: {
      [monsterA.monster_id]: left.hp,
      [monsterB.monster_id]: right.hp
    },
    skills,
    rounds,
    actionLog: rounds.flatMap(round => round.actions),
    events
  };
}

module.exports = {
  RULES_VERSION,
  MECHANICS,
  elementAdvantage,
  maxHpFor,
  baseDamage,
  resolveBattle
};
