'use strict';

const { SHOW_PLAN_VERSION, VARIANT_PRESETS } = require('./constants');
const { cloneNormalizedShowDefinition, cloneValue } = require('./normalize');
const { validateShowDefinition, isRange } = require('./validate');

const round = value => Number(value.toFixed(6));

function hashString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return hash >>> 0;
}

function deterministicUnit(seed, path) {
  let state = (Number(seed) >>> 0) ^ hashString(path);
  state = (state + 0x6d2b79f5) >>> 0;
  let mixed = state;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}

function resolveValue(value, seed, path) {
  if (!isRange(value)) return cloneValue(value);
  return round(value.min + (value.max - value.min) * deterministicUnit(seed, path));
}

class PyroDSLValidationError extends Error {
  constructor(errors, diagnostics) {
    super('PyroDSL definition failed validation.');
    this.name = 'PyroDSLValidationError';
    this.code = 'PYRODSL_VALIDATION_FAILED';
    this.errors = cloneValue(errors);
    this.diagnostics = cloneValue(diagnostics);
  }
}

function compileLayer(layer, seed, path, id) {
  const compiled = {
    id,
    primitive: layer.primitive,
    delayMs: layer.delayMs,
    density: layer.density,
    size: resolveValue(layer.size, seed, `${path}.size`),
    lifetimeMs: layer.lifetimeMs,
    gravity: resolveValue(layer.gravity, seed, `${path}.gravity`),
    drag: resolveValue(layer.drag, seed, `${path}.drag`),
    trail: layer.trail,
    split: layer.split,
    strobe: layer.strobe,
    colors: [...layer.colors],
    priority: layer.priority,
    core: layer.core
  };
  if (layer.primitive === 'glyph') compiled.glyph = layer.glyph;
  return compiled;
}

function compileShell(shell, seed, path, id) {
  const origin = {
    x: resolveValue(shell.origin.x, seed, `${path}.origin.x`),
    y: resolveValue(shell.origin.y, seed, `${path}.origin.y`)
  };
  const target = {
    x: resolveValue(shell.target.x, seed, `${path}.target.x`),
    y: resolveValue(shell.target.y, seed, `${path}.target.y`)
  };
  const palette = [...shell.palette];
  return {
    id,
    origin,
    target,
    position: { ...target },
    launchMode: shell.launchMode,
    tier: shell.tier,
    palette,
    colors: [...palette],
    shape: shell.layers[0].primitive === 'glyph' ? shell.layers[0].glyph : shell.layers[0].primitive,
    layers: shell.layers.map((layer, layerIndex) => compileLayer(
      layer,
      seed,
      `${path}.layers.${layerIndex}`,
      `${id}:layer:${layerIndex + 1}`
    ))
  };
}

function compileShowDefinition(source, options = {}) {
  const definition = cloneNormalizedShowDefinition(source);
  const validation = validateShowDefinition(definition);
  const variantName = options.variant || 'long';
  const supportedVariant = Object.prototype.hasOwnProperty.call(VARIANT_PRESETS, variantName);
  const availableVariant = Object.prototype.hasOwnProperty.call(definition.variants, variantName);
  if (!supportedVariant || !availableVariant) {
    validation.errors.push({
      code: 'variant_not_found',
      path: `variants.${variantName}`,
      message: 'Requested show variant does not exist.'
    });
    validation.valid = false;
  }
  if (!validation.valid) throw new PyroDSLValidationError(validation.errors, validation.diagnostics);

  const seed = Number(options.seed) >>> 0;
  const variant = definition.variants[variantName];
  const cues = variant.cues.map((cue, cueIndex) => {
    const cueId = `${definition.id}:${variantName}:cue:${cueIndex + 1}`;
    return {
      id: cueId,
      timeMs: cue.timeMs,
      beatAtMs: cue.timeMs,
      phase: cue.phase,
      formation: cue.formation,
      importance: cue.importance,
      shells: cue.shells.map((shell, shellIndex) => compileShell(
        shell,
        seed,
        `variants.${variantName}.cues.${cueIndex}.shells.${shellIndex}`,
        `${cueId}:shell:${shellIndex + 1}`
      ))
    };
  });

  return {
    planVersion: SHOW_PLAN_VERSION,
    id: `${definition.id}:${variantName}:${seed}`,
    definitionId: definition.id,
    metadata: cloneValue(definition.metadata),
    style: definition.id,
    variant: variantName,
    length: variantName,
    durationMs: variant.durationMs,
    seed,
    materialProfile: definition.materialProfile,
    autoEligible: definition.autoEligible,
    cues,
    diagnostics: cloneValue(validation.diagnostics.variants[variantName])
  };
}

module.exports = {
  compileShowDefinition,
  PyroDSLValidationError,
  deterministicUnit,
  resolveValue
};
