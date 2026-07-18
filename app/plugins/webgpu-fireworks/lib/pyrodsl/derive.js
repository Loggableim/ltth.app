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
  const cues = indexes.map(index => {
    const cue = cloneValue(longVariant.cues[index]);
    const mappedTime = transferTime(cue.timeMs, cue.phase, targetVariant);
    const tailMs = Math.max(0, ...cue.shells.flatMap(shell => (
      shell.layers.map(layer => layer.delayMs + layer.lifetimeMs)
    )));
    cue.timeMs = Math.min(mappedTime, VARIANT_PRESETS[targetVariant].durationMs - tailMs);
    return cue;
  });
  cues.sort((left, right) => left.timeMs - right.timeMs);
  for (let index = 1; index < cues.length; index++) {
    if (cues[index].timeMs <= cues[index - 1].timeMs) cues[index].timeMs = cues[index - 1].timeMs + 1;
  }
  return {
    durationMs: VARIANT_PRESETS[targetVariant].durationMs,
    cues
  };
}

function deriveShowVariants(source, options = {}) {
  const definition = cloneNormalizedShowDefinition(source);
  const masterOnly = {
    ...definition,
    variants: definition.variants.long ? { long: definition.variants.long } : {}
  };
  const validation = validateShowDefinition(masterOnly);
  if (!validation.valid) throw new PyroDSLValidationError(validation.errors, validation.diagnostics);

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
  return cloneNormalizedShowDefinition(definition);
}

module.exports = { deriveShowVariants, transferTime, selectCueIndexes };
