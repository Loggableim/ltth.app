const { buildV5SkillCatalog, hashNumber } = require('./catalog');

const RULES_VERSION = 5;
const CHOICES = Object.freeze(['A', 'B', 'C']);
const SKILL_CATALOG = Object.freeze(buildV5SkillCatalog());

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
    thorns: Math.max(0, Number(override.thorns) || 0),
    reflect: Math.max(0, Number(override.reflect) || 0),
    weakened: Math.max(0, Number(override.weakened) || 0)
  };
}

function addCharge(state, amount) {
  state.charge = Math.min(100, state.charge + Math.max(0, amount));
}

function addShield(state, amount, outcomes) {
  const gained = Math.max(0, Math.round(amount));
  state.shield += gained;
  outcomes.push({ type: 'shield', amount: gained });
}

function heal(state, amount, outcomes) {
  const requested = Math.max(0, Math.round(amount));
  const before = state.hp;
  state.hp = Math.min(state.maxHp, state.hp + requested);
  outcomes.push({ type: 'heal', requested, amount: state.hp - before });
}

function damageFor(fighter, target, effect) {
  const might = Math.max(0, Number(fighter.stats?.might) || 0);
  const guard = Math.max(0, Number(target.stats?.guard) || 0);
  const weakened = Math.max(0, Number(fighter.weakened) || 0);
  return Math.max(1, Math.round(effect.power + (might * 0.6) - (guard * 0.25) - weakened));
}

function applyDamage(actor, target, requestedDamage, hitIndex, pierce = 0) {
  const shieldBefore = target.shield;
  const hpBefore = target.hp;
  const penetrated = Math.min(shieldBefore, Math.max(0, pierce));
  const shieldAvailable = Math.max(0, shieldBefore - penetrated);
  const shieldAbsorbed = Math.min(shieldAvailable, requestedDamage);
  const hpDamage = Math.min(
    target.hp,
    Math.max(0, requestedDamage - shieldAbsorbed)
  );
  target.shield = Math.max(0, shieldBefore - penetrated - shieldAbsorbed);
  target.hp = Math.max(0, target.hp - hpDamage);
  if (hpDamage > 0) addCharge(target, 25);
  return {
    index: hitIndex,
    requestedDamage,
    shieldBefore,
    shieldPenetrated: penetrated,
    shieldAbsorbed,
    hpBefore,
    hpDamage,
    shieldAfter: target.shield,
    hpAfter: target.hp
  };
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
  sequence
}) {
  const { choice, choiceFallback } = normalizeChoice(requestedChoice, actorState);
  const skill = SKILL_CATALOG[actor.template_id]?.[choice];
  if (!skill) throw new Error(`STREAM_MONSTERS_V5_SKILL_MISSING:${actor.template_id}:${choice}`);
  const before = {
    actor: clone(actorState),
    target: clone(targetState)
  };
  const hits = [];
  const outcomes = [];
  let dealtHpDamage = 0;

  if (choice === 'A') addCharge(actorState, 25);
  if (choice === 'B') addCharge(actorState, 50);
  if (choice === 'C') actorState.charge = 0;

  for (const effect of skill.effects) {
    if (effect.type === 'damage') {
      const total = damageFor({ ...actor, weakened: actorState.weakened }, target, effect);
      const count = Math.max(1, Number(effect.hits) || 1);
      for (let index = 0; index < count && targetState.hp > 0; index += 1) {
        const remaining = total - hits.reduce((sum, hit) => sum + hit.requestedDamage, 0);
        const requested = Math.max(1, Math.ceil(remaining / (count - index)));
        const pierce = skill.effects.find(candidate => candidate.type === 'pierce')?.power || 0;
        const hit = applyDamage(actorState, targetState, requested, index + 1, pierce);
        hits.push(hit);
        dealtHpDamage += hit.hpDamage;
      }
    } else if (effect.type === 'shield') {
      addShield(actorState, effect.power + Math.floor((Number(actor.stats?.guard) || 0) / 3), outcomes);
    } else if (effect.type === 'heal') {
      heal(actorState, effect.power, outcomes);
    } else if (effect.type === 'lifesteal') {
      heal(actorState, Math.floor(dealtHpDamage * effect.ratio), outcomes);
    } else if (effect.type === 'thorns') {
      actorState.thorns += effect.power;
      outcomes.push({ type: 'thorns', amount: effect.power });
    } else if (effect.type === 'reflect') {
      actorState.reflect += effect.power;
      outcomes.push({ type: 'reflect', amount: effect.power });
    } else if (effect.type === 'weaken') {
      targetState.weakened += effect.power;
      outcomes.push({ type: 'weaken', amount: effect.power });
    }
  }

  return {
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
    terminal: targetState.hp <= 0
  };
}

function resolveInteractiveRound({ fighters, choices = {}, seed, round = 1, state = {} }) {
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
      sequence: actions.length + 1
    }));
    if (states[target.monster_id].hp <= 0) break;
  }
  const living = fighters.filter(fighter => states[fighter.monster_id].hp > 0);
  return {
    rulesVersion: RULES_VERSION,
    round,
    actions,
    state: states,
    terminal: living.length < 2,
    winnerId: living.length === 1 ? living[0].monster_id : null
  };
}

module.exports = {
  RULES_VERSION,
  CHOICES,
  SKILL_CATALOG,
  maxHp,
  normalizeChoice,
  resolveInteractiveRound
};
