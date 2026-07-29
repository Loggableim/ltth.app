'use strict';

const VALID_SLOTS = new Set([1, 2]);
const VALID_CHOICES = new Set(['A', 'B', 'C']);
const MAX_COUNTER = 1_000_000;
const MAX_DURATION_MS = 31 * 24 * 60 * 60 * 1_000;
const MAX_TEXT_LENGTH = 80;
const MAX_ICON_LENGTH = 16;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedInteger(value, {
  minimum = 0,
  maximum = MAX_COUNTER,
  fallback = 0
} = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.min(maximum, Math.max(minimum, numeric)));
}

function boundedText(value, maximum, fallback = '') {
  if (!['string', 'number'].includes(typeof value)) return fallback;
  const text = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return text ? text.slice(0, maximum) : fallback;
}

function publicPlayerName(value) {
  const candidate = boundedText(value, MAX_TEXT_LENGTH);
  const withoutAt = candidate.replace(/^@+/, '');
  if (
    !withoutAt ||
    /^viewer$/i.test(withoutAt) ||
    /^\d+$/.test(withoutAt) ||
    /^tiktok:\d+$/i.test(withoutAt)
  ) {
    return 'Viewer';
  }
  return candidate;
}

function publicMonsterName(value) {
  const candidate = boundedText(value, MAX_TEXT_LENGTH);
  if (!candidate || /^\d+$/.test(candidate)) return 'Monster';
  return candidate;
}

function sanitizeDecisiveSkill(value) {
  if (!isObject(value)) return null;
  const ownerSlot = boundedInteger(value.ownerSlot);
  const round = boundedInteger(value.round);
  const choice = boundedText(value.choice, 1).toUpperCase();
  const skillName = boundedText(value.skillName, MAX_TEXT_LENGTH);
  if (
    !VALID_SLOTS.has(ownerSlot) ||
    round < 1 ||
    !VALID_CHOICES.has(choice) ||
    !skillName
  ) {
    return null;
  }
  return {
    round,
    ownerSlot,
    choice,
    skillName,
    skillIcon: boundedText(value.skillIcon, MAX_ICON_LENGTH)
  };
}

function sanitizeFighter(value) {
  if (!isObject(value)) return null;
  const slot = boundedInteger(value.slot);
  if (!VALID_SLOTS.has(slot)) return null;
  const rating = isObject(value.rating) ? value.rating : {};
  return {
    slot,
    playerName: publicPlayerName(value.playerName),
    monsterName: publicMonsterName(value.monsterName),
    damageDealt: boundedInteger(value.damageDealt),
    damageBlocked: boundedInteger(value.damageBlocked),
    healingDone: boundedInteger(value.healingDone),
    shieldGained: boundedInteger(value.shieldGained),
    specialsUsed: boundedInteger(value.specialsUsed),
    hits: boundedInteger(value.hits),
    evades: boundedInteger(value.evades),
    xpAwarded: boundedInteger(value.xpAwarded),
    rating: {
      before: boundedInteger(rating.before),
      after: boundedInteger(rating.after),
      delta: boundedInteger(rating.delta, {
        minimum: -MAX_COUNTER,
        maximum: MAX_COUNTER
      }),
      eligible: Boolean(rating.eligible)
    }
  };
}

function sanitizeCombatReport(value) {
  const report = isObject(value) ? value : {};
  const seenSlots = new Set();
  const fighters = (Array.isArray(report.fighters) ? report.fighters : [])
    .map(sanitizeFighter)
    .filter(fighter => {
      if (!fighter || seenSlots.has(fighter.slot)) return false;
      seenSlots.add(fighter.slot);
      return true;
    })
    .sort((left, right) => left.slot - right.slot);
  return {
    roundCount: boundedInteger(report.roundCount),
    durationMs: boundedInteger(report.durationMs, {
      maximum: MAX_DURATION_MS
    }),
    decisiveSkill: sanitizeDecisiveSkill(report.decisiveSkill),
    fighters
  };
}

function fighterMonsterId(fighter) {
  if (!isObject(fighter)) return '';
  return boundedText(
    fighter.monsterId ?? fighter.monster_id ?? fighter.lockedMonsterId,
    160
  );
}

function actionSlot(action, role, slotsByMonsterId) {
  const directSlot = boundedInteger(action?.[`${role}Slot`]);
  if (VALID_SLOTS.has(directSlot)) return directSlot;
  const monsterId = boundedText(action?.[`${role}Id`], 160);
  return slotsByMonsterId.get(monsterId) || 0;
}

function appliedAmount(value) {
  return boundedInteger(value);
}

function addMetric(state, field, value) {
  if (!state) return;
  state[field] = boundedInteger(
    state[field] + appliedAmount(value)
  );
}

function resultBySlot(participantResults) {
  const results = new Map();
  if (!Array.isArray(participantResults)) return results;
  participantResults.forEach(result => {
    if (!isObject(result)) return;
    const slot = boundedInteger(result.slot);
    if (VALID_SLOTS.has(slot) && !results.has(slot)) results.set(slot, result);
  });
  return results;
}

function createFighterState(fighter, participantResult) {
  const rating = isObject(participantResult?.rating)
    ? participantResult.rating
    : {};
  return {
    slot: boundedInteger(fighter.slot),
    playerName: fighter.playerName ?? fighter.viewerName,
    monsterName: fighter.monsterName ?? fighter.name,
    damageDealt: 0,
    damageBlocked: 0,
    healingDone: 0,
    shieldGained: 0,
    specialsUsed: 0,
    hits: 0,
    evades: 0,
    xpAwarded: participantResult?.xpAwarded,
    rating: {
      before: rating.before,
      after: rating.after,
      delta: rating.delta,
      eligible: participantResult?.arenaEligible ?? rating.eligible
    }
  };
}

function buildCombatReport({
  actions = [],
  fighters = [],
  participantResults = [],
  roundNumber = 0,
  createdAtMs = 0,
  completedAtMs = 0
} = {}) {
  const results = resultBySlot(participantResults);
  const states = new Map();
  const slotsByMonsterId = new Map();
  if (Array.isArray(fighters)) {
    fighters.forEach(fighter => {
      if (!isObject(fighter)) return;
      const slot = boundedInteger(fighter.slot);
      if (!VALID_SLOTS.has(slot) || states.has(slot)) return;
      states.set(slot, createFighterState(fighter, results.get(slot)));
      const monsterId = fighterMonsterId(fighter);
      if (monsterId) slotsByMonsterId.set(monsterId, slot);
    });
  }

  let roundCount = boundedInteger(roundNumber);
  let decisiveSkill = null;
  const persistedActions = Array.isArray(actions) ? actions : [];
  persistedActions.forEach(action => {
    if (!isObject(action)) return;
    const round = boundedInteger(action.round);
    roundCount = Math.max(roundCount, round);
    const actorSlot = actionSlot(action, 'actor', slotsByMonsterId);
    const targetSlot = actionSlot(action, 'target', slotsByMonsterId);
    const actor = states.get(actorSlot);
    const target = states.get(targetSlot);

    if (actor && !action.skipped && boundedText(action.choice, 1).toUpperCase() === 'C') {
      addMetric(actor, 'specialsUsed', 1);
    }

    if (Array.isArray(action.hits)) {
      action.hits.forEach(hit => {
        if (!isObject(hit)) return;
        addMetric(actor, 'damageDealt', hit.hpDamage);
        addMetric(target, 'damageBlocked', hit.shieldAbsorbed);
        if (hit.evaded === true) {
          addMetric(target, 'evades', 1);
        } else {
          addMetric(actor, 'hits', 1);
        }
      });
    }

    if (Array.isArray(action.outcomes)) {
      action.outcomes.forEach(outcome => {
        if (!isObject(outcome)) return;
        const type = boundedText(outcome.type, 32).toLowerCase();
        if (type === 'heal' || type === 'lifesteal') {
          addMetric(actor, 'healingDone', outcome.amount);
        } else if (type === 'shield') {
          addMetric(actor, 'shieldGained', outcome.amount);
        }
      });
    }

    if (Array.isArray(action.retaliations)) {
      action.retaliations.forEach(retaliation => {
        if (!isObject(retaliation)) return;
        addMetric(target, 'damageDealt', retaliation.hpDamage);
        addMetric(actor, 'damageBlocked', retaliation.shieldAbsorbed);
      });
    }

    if (Array.isArray(action.statusEffects)) {
      action.statusEffects.forEach(status => {
        if (!isObject(status) || status.type !== 'burn_tick') return;
        addMetric(
          target,
          'damageDealt',
          status.hpDamage ?? status.amount
        );
      });
    }

    const choice = boundedText(action.choice, 1).toUpperCase();
    const skill = isObject(action.skill) ? action.skill : {};
    if (
      action.terminal === true &&
      !action.skipped &&
      actor &&
      VALID_CHOICES.has(choice) &&
      boundedText(skill.name, MAX_TEXT_LENGTH)
    ) {
      decisiveSkill = {
        round,
        ownerSlot: actorSlot,
        choice,
        skillName: skill.name,
        skillIcon: skill.icon
      };
    }
  });

  const started = Number(createdAtMs);
  const completed = Number(completedAtMs);
  const durationMs = Number.isFinite(started) && Number.isFinite(completed)
    ? Math.max(0, completed - started)
    : 0;
  return sanitizeCombatReport({
    roundCount,
    durationMs,
    decisiveSkill,
    fighters: [...states.values()]
  });
}

module.exports = {
  buildCombatReport,
  sanitizeCombatReport
};
