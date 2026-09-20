'use strict';

const JOURNEY_COMMANDS = Object.freeze({
  egg_received: '!adopt',
  egg_hatched: '!hatch',
  monster_selected: '!choose <slot>',
  battle_joined: '!battle',
  battle_completed: 'A / B'
});

function copyCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const kind = String(candidate.kind || '').trim();
  const command = String(candidate.command || '').trim();
  if (!kind || !command) return null;
  const copied = { kind, command };
  if (Number.isInteger(Number(candidate.fighterSlot))) {
    copied.fighterSlot = Number(candidate.fighterSlot);
  }
  if (candidate.card && ['A', 'B', 'C'].includes(String(candidate.card))) {
    copied.card = String(candidate.card);
  }
  return Object.freeze(copied);
}

function journeyCandidate(journey) {
  if (!journey || typeof journey !== 'object' || journey.complete) return null;
  const stepKey = String(journey.nextStep || '').trim();
  const command = JOURNEY_COMMANDS[stepKey];
  if (!command) return null;
  return Object.freeze({
    kind: 'journey',
    stepKey,
    command
  });
}

function resolvePrimaryCta({
  battleInput = null,
  journey = null,
  criticalEgg = null,
  overlayHint = null
} = {}) {
  return copyCandidate(battleInput) ||
    journeyCandidate(journey) ||
    copyCandidate(criticalEgg) ||
    copyCandidate(overlayHint) ||
    null;
}

module.exports = Object.freeze({
  JOURNEY_COMMANDS,
  resolvePrimaryCta
});
