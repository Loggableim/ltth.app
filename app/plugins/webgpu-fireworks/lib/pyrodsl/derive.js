'use strict';

const { REQUIRED_PHASES, VARIANT_PRESETS } = require('./constants');
const { cloneNormalizedShowDefinition, cloneValue } = require('./normalize');
const { validateShowDefinition } = require('./validate');
const { PyroDSLValidationError, deterministicUnit } = require('./compile');

function phaseWindowKey(phase) {
  return ['calm', 'bridge', 'breath'].includes(phase) ? 'rest' : phase;
}

function transferTime(timeMs, phase, targetVariant) {
  const windowKey = phaseWindowKey(phase);
  const sourceWindow = VARIANT_PRESETS.long.windows[windowKey];
  const targetWindow = VARIANT_PRESETS[targetVariant].windows[windowKey];
  if (!sourceWindow || !targetWindow) return timeMs;
  const progress = Math.min(1, Math.max(0, (timeMs - sourceWindow[0]) / (sourceWindow[1] - sourceWindow[0])));
  return Math.round(targetWindow[0] + progress * (targetWindow[1] - targetWindow[0]));
}

function isMandatoryCue(cue, index, firstPhaseIndexes) {
  return cue.importance === 'essential'
    || cue.importance === 'final-wave'
    || /^finale-wave-/i.test(cue.formation)
    || ['calm', 'bridge', 'breath'].includes(cue.phase)
    || firstPhaseIndexes.has(index);
}

function selectCueIndexes(cues, targetVariant, seed) {
  const firstPhaseIndexes = new Set();
  for (const phase of REQUIRED_PHASES) {
    const index = cues.findIndex(cue => cue.phase === phase);
    if (index >= 0) firstPhaseIndexes.add(index);
  }
  const mandatory = new Set();
  cues.forEach((cue, index) => {
    if (isMandatoryCue(cue, index, firstPhaseIndexes)) mandatory.add(index);
  });
  const targetCount = Math.max(mandatory.size, Math.round(cues.length * VARIANT_PRESETS[targetVariant].ratio));
  const optional = cues
    .map((cue, index) => ({
      index,
      score: deterministicUnit(seed, `derive:${targetVariant}:${cue.phase}:${cue.timeMs}:${index}`)
    }))
    .filter(candidate => !mandatory.has(candidate.index))
    .sort((left, right) => left.score - right.score || left.index - right.index);
  for (const candidate of optional.slice(0, Math.max(0, targetCount - mandatory.size))) {
    mandatory.add(candidate.index);
  }
  return [...mandatory].sort((left, right) => left - right);
}

function deriveVariant(longVariant, targetVariant, seed) {
  const indexes = selectCueIndexes(longVariant.cues, targetVariant, seed);
  const scheduledCues = indexes.map(index => {
    const cue = cloneValue(longVariant.cues[index]);
    const mappedTime = transferTime(cue.timeMs, cue.phase, targetVariant);
    const tailMs = Math.max(0, ...cue.shells.flatMap(shell => (
      shell.layers.map(layer => layer.delayMs + layer.lifetimeMs)
    )));
    const window = VARIANT_PRESETS[targetVariant].windows[phaseWindowKey(cue.phase)];
    const latestTime = VARIANT_PRESETS[targetVariant].durationMs - tailMs;
    cue.timeMs = Math.min(mappedTime, latestTime);
    return { cue, earliestTime: window ? window[0] : 0, latestTime, tailMs };
  });

  for (let index = scheduledCues.length - 2; index >= 0; index--) {
    const current = scheduledCues[index];
    const next = scheduledCues[index + 1];
    current.cue.timeMs = Math.min(current.cue.timeMs, next.cue.timeMs - 1, current.latestTime);
  }
  for (let index = 0; index < scheduledCues.length; index++) {
    const current = scheduledCues[index];
    const previous = scheduledCues[index - 1];
    const impossible = current.cue.timeMs < current.earliestTime
      || current.cue.timeMs < 0
      || current.cue.timeMs > current.latestTime
      || (previous && current.cue.timeMs <= previous.cue.timeMs);
    if (impossible) {
      throw new PyroDSLValidationError([{
        code: 'derivation_schedule_impossible',
        path: `variants.${targetVariant}.cues.${index}.timeMs`,
        message: 'Derived cue timing cannot preserve ordering, phase window, and layer tail.',
        details: {
          earliestTimeMs: current.earliestTime,
          latestTimeMs: current.latestTime,
          tailMs: current.tailMs
        }
      }], { variants: {} });
    }
  }
  return {
    durationMs: VARIANT_PRESETS[targetVariant].durationMs,
    cues: scheduledCues.map(entry => entry.cue)
  };
}

function deriveShowVariants(source, options = {}) {
  const validation = validateShowDefinition(source);
  if (!validation.valid) throw new PyroDSLValidationError(validation.errors, validation.diagnostics);
  const definition = cloneNormalizedShowDefinition(source);

  const requested = options.variants === undefined ? ['medium', 'short'] : options.variants;
  if (!Array.isArray(requested) || requested.some(name => !['medium', 'short'].includes(name))) {
    throw new PyroDSLValidationError([{
      code: 'invalid_derivation_target',
      path: 'variants',
      message: 'Only medium and short variants can be derived from the long master.'
    }], validation.diagnostics);
  }
  const seed = Number(options.seed) >>> 0;
  for (const targetVariant of requested) {
    if (definition.variants[targetVariant] && options.overwrite !== true) continue;
    definition.variants[targetVariant] = deriveVariant(definition.variants.long, targetVariant, seed);
  }
  const derived = cloneNormalizedShowDefinition(definition);
  const derivedValidation = validateShowDefinition(derived);
  if (!derivedValidation.valid) {
    throw new PyroDSLValidationError(derivedValidation.errors, derivedValidation.diagnostics);
  }
  return derived;
}

module.exports = { deriveShowVariants, transferTime, selectCueIndexes };
