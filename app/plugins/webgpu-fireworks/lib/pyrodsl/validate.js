'use strict';

const {
  SHOW_DEFINITION_VERSION,
  PARTICLE_POOL_SIZE,
  CORE_PARTICLE_LIMIT,
  MAX_LAYERS_PER_SHELL,
  MAX_COLORS_PER_LAYER,
  MAX_SHOW_COMMANDS_PER_BEAT,
  MAX_SHELL_PALETTE_COLORS,
  PRIMITIVES,
  CURATED_GLYPHS,
  MATERIAL_PROFILES,
  PHASES,
  REQUIRED_PHASES,
  IMPORTANCE_LEVELS,
  LAUNCH_MODES,
  TIERS,
  LAYER_PRIORITIES,
  FORMATIONS,
  PHASE_CONCURRENCY_CAPS,
  VARIANT_PRESETS
} = require('./constants');
const { cloneNormalizedShowDefinition } = require('./normalize');

const COLOR_PATTERN = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/i;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function error(code, path, message, details) {
  const result = { code, path, message };
  if (details !== undefined) result.details = details;
  return result;
}

function inspectRawObject(errors, value, path, allowed, required = []) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      const propertyPath = path ? `${path}.${key}` : key;
      errors.push(error('unknown_property', propertyPath, 'Property is not part of ShowDefinitionV1.', {
        property: key
      }));
    }
  }
  for (const key of required) {
    if (!hasOwn(value, key)) {
      const propertyPath = path ? `${path}.${key}` : key;
      errors.push(error('required_property_missing', propertyPath, 'Required ShowDefinitionV1 property is missing.', {
        property: key
      }));
    }
  }
}

function requireRawObject(errors, value, path) {
  if (isObject(value)) return true;
  errors.push(error('invalid_object', path, 'ShowDefinitionV1 requires an object at this path.'));
  return false;
}

function requireRawArray(errors, value, path) {
  if (Array.isArray(value)) return true;
  errors.push(error('invalid_array', path, 'ShowDefinitionV1 requires an array at this path.'));
  return false;
}

function inspectRawDefinition(errors, source) {
  inspectRawObject(errors, source, '',
    ['schemaVersion', 'id', 'metadata', 'materialProfile', 'autoEligible', 'variants'],
    ['schemaVersion', 'id', 'metadata', 'materialProfile', 'autoEligible', 'variants']);

  if (hasOwn(source, 'metadata') && requireRawObject(errors, source.metadata, 'metadata')) {
    inspectRawObject(errors, source.metadata, 'metadata',
      ['name', 'description', 'author', 'tags'], ['name']);
  }
  if (!hasOwn(source, 'variants') || !requireRawObject(errors, source.variants, 'variants')) return;
  inspectRawObject(errors, source.variants, 'variants', ['short', 'medium', 'long'], ['long']);

  for (const variantName of ['short', 'medium', 'long']) {
    const variant = source.variants[variantName];
    const variantPath = `variants.${variantName}`;
    if (!hasOwn(source.variants, variantName)) continue;
    if (!requireRawObject(errors, variant, variantPath)) continue;
    inspectRawObject(errors, variant, variantPath, ['durationMs', 'cues'], ['durationMs', 'cues']);
    if (!hasOwn(variant, 'cues') || !requireRawArray(errors, variant.cues, `${variantPath}.cues`)) continue;
    variant.cues.forEach((cue, cueIndex) => {
      const cuePath = `${variantPath}.cues.${cueIndex}`;
      if (!requireRawObject(errors, cue, cuePath)) return;
      inspectRawObject(errors, cue, cuePath,
        ['timeMs', 'phase', 'formation', 'importance', 'shells'],
        ['timeMs', 'phase', 'formation', 'importance', 'shells']);
      if (!hasOwn(cue, 'shells') || !requireRawArray(errors, cue.shells, `${cuePath}.shells`)) return;
      cue.shells.forEach((shell, shellIndex) => {
        const shellPath = `${cuePath}.shells.${shellIndex}`;
        if (!requireRawObject(errors, shell, shellPath)) return;
        inspectRawObject(errors, shell, shellPath,
          ['origin', 'target', 'launchMode', 'tier', 'palette', 'layers'],
          ['origin', 'target', 'launchMode', 'tier', 'palette', 'layers']);
        for (const coordinateName of ['origin', 'target']) {
          const coordinatePath = `${shellPath}.${coordinateName}`;
          if (!hasOwn(shell, coordinateName)) continue;
          if (!requireRawObject(errors, shell[coordinateName], coordinatePath)) continue;
          inspectRawObject(errors, shell[coordinateName], coordinatePath, ['x', 'y'], ['x', 'y']);
          for (const axis of ['x', 'y']) {
            inspectRawObject(errors, shell[coordinateName][axis], `${coordinatePath}.${axis}`,
              ['min', 'max'], ['min', 'max']);
          }
        }
        if (!hasOwn(shell, 'layers') || !requireRawArray(errors, shell.layers, `${shellPath}.layers`)) return;
        shell.layers.forEach((layer, layerIndex) => {
          const layerPath = `${shellPath}.layers.${layerIndex}`;
          if (!requireRawObject(errors, layer, layerPath)) return;
          inspectRawObject(errors, layer, layerPath, [
            'primitive', 'delayMs', 'density', 'size', 'lifetimeMs', 'gravity', 'drag',
            'trail', 'split', 'strobe', 'colors', 'priority', 'core', 'glyph'
          ], [
            'primitive', 'density', 'size', 'lifetimeMs', 'gravity', 'drag',
            'trail', 'split', 'strobe', 'colors'
          ]);
          for (const property of ['size', 'gravity', 'drag']) {
            inspectRawObject(errors, layer[property], `${layerPath}.${property}`,
              ['min', 'max'], ['min', 'max']);
          }
        });
      });
    });
  }
}

function isRange(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Number.isFinite(value.min) && Number.isFinite(value.max));
}

function validateNumber(errors, value, path, options = {}) {
  const { min = -Infinity, max = Infinity, integer = false, range = false } = options;
  if (range && isRange(value)) {
    if (value.min > value.max) {
      errors.push(error('invalid_range', path, 'Range minimum must not exceed its maximum.', {
        min: value.min,
        max: value.max
      }));
      return false;
    }
    if (value.min < min || value.max > max) {
      errors.push(error(options.code || 'invalid_number', path,
        options.message || `Range must stay between ${min} and ${max}.`, {
        min,
        max,
        actual: { min: value.min, max: value.max }
      }));
      return false;
    }
    return true;
  }
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    errors.push(error(options.code || 'invalid_number', path, options.message || `Value must be between ${min} and ${max}.`, {
      min,
      max,
      actual: value,
      integer
    }));
    return false;
  }
  return true;
}

function validateColors(errors, colors, path, max) {
  if (!Array.isArray(colors) || colors.length === 0) {
    errors.push(error('colors_required', path, 'At least one color is required.'));
    return;
  }
  if (colors.length > max) {
    errors.push(error(max === MAX_COLORS_PER_LAYER ? 'too_many_colors' : 'too_many_palette_colors', path,
      `At most ${max} colors are allowed.`, { max, actual: colors.length }));
  }
  colors.forEach((color, index) => {
    if (typeof color !== 'string' || !COLOR_PATTERN.test(color)) {
      errors.push(error('invalid_color', `${path}.${index}`, 'Colors must be six- or eight-digit hexadecimal values.'));
    }
  });
}

function validateCoordinate(errors, coordinate, path, yMax) {
  if (!coordinate || typeof coordinate !== 'object' || Array.isArray(coordinate)) {
    errors.push(error('invalid_coordinate', path, 'Coordinate must contain x and y values.'));
    return;
  }
  validateNumber(errors, coordinate.x, `${path}.x`, {
    min: 0,
    max: 1,
    range: true,
    code: 'coordinate_out_of_bounds',
    message: 'Coordinate x must stay between 0 and 1.'
  });
  validateNumber(errors, coordinate.y, `${path}.y`, {
    min: 0,
    max: yMax,
    range: true,
    code: 'coordinate_out_of_bounds',
    message: `Coordinate y must stay between 0 and ${yMax}.`
  });
}

function validateLayer(errors, layer, path, variantDuration, cueTime) {
  if (!PRIMITIVES.includes(layer.primitive)) {
    errors.push(error('unsupported_primitive', `${path}.primitive`, 'Layer primitive is not supported.', {
      supported: PRIMITIVES,
      actual: layer.primitive
    }));
  }
  if (layer.primitive === 'glyph') {
    if (layer.glyph === undefined || layer.glyph === null || layer.glyph === '') {
      errors.push(error('glyph_required', `${path}.glyph`, 'Glyph layers require a curated glyph ID.'));
    } else if (!CURATED_GLYPHS.includes(layer.glyph)) {
      errors.push(error('unsupported_glyph', `${path}.glyph`, 'Glyph ID is not curated.', {
        supported: CURATED_GLYPHS,
        actual: layer.glyph
      }));
    }
  } else if (layer.glyph !== undefined && !CURATED_GLYPHS.includes(layer.glyph)) {
    errors.push(error('unsupported_glyph', `${path}.glyph`, 'Glyph ID is not curated.', {
      supported: CURATED_GLYPHS,
      actual: layer.glyph
    }));
  }
  validateNumber(errors, layer.delayMs, `${path}.delayMs`, { min: 0, max: variantDuration, integer: true });
  validateNumber(errors, layer.density, `${path}.density`, { min: 1, max: PARTICLE_POOL_SIZE, integer: true });
  validateNumber(errors, layer.size, `${path}.size`, { min: 0.05, max: 10, range: true });
  validateNumber(errors, layer.lifetimeMs, `${path}.lifetimeMs`, { min: 1, max: 10000, integer: true });
  validateNumber(errors, layer.gravity, `${path}.gravity`, { min: -10, max: 10, range: true });
  validateNumber(errors, layer.drag, `${path}.drag`, { min: 0, max: 1, range: true });
  for (const key of ['trail', 'split', 'strobe', 'core']) {
    if (typeof layer[key] !== 'boolean') {
      errors.push(error('invalid_boolean', `${path}.${key}`, `${key} must be a boolean.`));
    }
  }
  if (!LAYER_PRIORITIES.includes(layer.priority)) {
    errors.push(error('unsupported_layer_priority', `${path}.priority`, 'Layer priority is not supported.', {
      supported: LAYER_PRIORITIES,
      actual: layer.priority
    }));
  }
  if (layer.priority === 'decorative' && layer.core === true) {
    errors.push(error('inconsistent_core_priority', path, 'Decorative layers cannot be marked as core.'));
  }
  validateColors(errors, layer.colors, `${path}.colors`, MAX_COLORS_PER_LAYER);
  if (Number.isFinite(cueTime) && Number.isFinite(layer.delayMs) && Number.isFinite(layer.lifetimeMs)
    && cueTime + layer.delayMs + layer.lifetimeMs > variantDuration) {
    errors.push(error('show_tail_exceeds_duration', `${path}.lifetimeMs`, 'Layer tail exceeds the fixed variant duration.', {
      endMs: cueTime + layer.delayMs + layer.lifetimeMs,
      durationMs: variantDuration
    }));
  }
}

function validateShell(errors, shell, path, variantDuration, cueTime) {
  validateCoordinate(errors, shell.origin, `${path}.origin`, 1.1);
  validateCoordinate(errors, shell.target, `${path}.target`, 1);
  if (!LAUNCH_MODES.includes(shell.launchMode)) {
    errors.push(error('unsupported_launch_mode', `${path}.launchMode`, 'Shell launch mode is not supported.', {
      supported: LAUNCH_MODES,
      actual: shell.launchMode
    }));
  }
  if (!TIERS.includes(shell.tier)) {
    errors.push(error('unsupported_tier', `${path}.tier`, 'Shell tier is not supported.', {
      supported: TIERS,
      actual: shell.tier
    }));
  }
  validateColors(errors, shell.palette, `${path}.palette`, MAX_SHELL_PALETTE_COLORS);
  if (!Array.isArray(shell.layers) || shell.layers.length === 0) {
    errors.push(error('layers_required', `${path}.layers`, 'A shell needs at least one layer.'));
    return;
  }
  if (shell.layers.length > MAX_LAYERS_PER_SHELL) {
    errors.push(error('too_many_layers', `${path}.layers`, `A shell supports at most ${MAX_LAYERS_PER_SHELL} layers.`, {
      max: MAX_LAYERS_PER_SHELL,
      actual: shell.layers.length
    }));
  }
  shell.layers.forEach((layer, index) => {
    validateLayer(errors, layer, `${path}.layers.${index}`, variantDuration, cueTime);
  });
}

function simulateParticleLoad(cues) {
  const events = [];
  for (const cue of cues) {
    if (!Number.isFinite(cue.timeMs)) continue;
    for (const shell of cue.shells) {
      for (const layer of shell.layers) {
        if (!Number.isFinite(layer.delayMs) || !Number.isFinite(layer.lifetimeMs)
          || !Number.isFinite(layer.density)) continue;
        const startMs = cue.timeMs + layer.delayMs;
        const endMs = startMs + layer.lifetimeMs;
        const coreDensity = layer.core === true ? layer.density : 0;
        events.push({ timeMs: startMs, total: layer.density, core: coreDensity, order: 1 });
        events.push({ timeMs: endMs, total: -layer.density, core: -coreDensity, order: 0 });
      }
    }
  }
  events.sort((left, right) => left.timeMs - right.timeMs || left.order - right.order);
  let currentTotal = 0;
  let currentCore = 0;
  let peakTotalParticles = 0;
  let peakCoreParticles = 0;
  let peakAtMs = 0;
  for (const event of events) {
    currentTotal += event.total;
    currentCore += event.core;
    if (currentTotal > peakTotalParticles || currentCore > peakCoreParticles) peakAtMs = event.timeMs;
    peakTotalParticles = Math.max(peakTotalParticles, currentTotal);
    peakCoreParticles = Math.max(peakCoreParticles, currentCore);
  }
  return { peakCoreParticles, peakTotalParticles, peakAtMs };
}

function validateVariant(errors, variant, name, diagnostics) {
  const path = `variants.${name}`;
  const preset = VARIANT_PRESETS[name];
  if (variant.durationMs !== preset.durationMs) {
    errors.push(error('invalid_variant_duration', `${path}.durationMs`, `${name} must be exactly ${preset.durationMs} ms.`, {
      expected: preset.durationMs,
      actual: variant.durationMs
    }));
  }
  if (!Array.isArray(variant.cues) || variant.cues.length === 0) {
    errors.push(error('cues_required', `${path}.cues`, 'A variant needs at least one cue.'));
    diagnostics[name] = {
      peakCoreParticles: 0,
      peakTotalParticles: 0,
      peakAtMs: 0,
      poolSize: PARTICLE_POOL_SIZE,
      coreLimit: CORE_PARTICLE_LIMIT,
      peakShowCommands: 0
    };
    return;
  }

  const phases = new Set();
  const concurrency = new Map();
  const commands = new Map();
  let previousTime = -1;
  variant.cues.forEach((cue, cueIndex) => {
    const cuePath = `${path}.cues.${cueIndex}`;
    const timeValid = validateNumber(errors, cue.timeMs, `${cuePath}.timeMs`, {
      min: 0,
      max: preset.durationMs,
      integer: true
    });
    if (timeValid && cue.timeMs <= previousTime) {
      errors.push(error('unordered_cue_time', `${cuePath}.timeMs`, 'Cue times must be strictly increasing.', {
        previousTimeMs: previousTime,
        actual: cue.timeMs
      }));
    }
    if (timeValid) previousTime = cue.timeMs;
    if (!PHASES.includes(cue.phase)) {
      errors.push(error('unsupported_phase', `${cuePath}.phase`, 'Cue phase is not supported.', {
        supported: PHASES,
        actual: cue.phase
      }));
    } else {
      phases.add(cue.phase);
    }
    if (!FORMATIONS.includes(cue.formation)) {
      errors.push(error('unsupported_formation', `${cuePath}.formation`, 'Cue formation is not supported.', {
        supported: FORMATIONS,
        actual: cue.formation
      }));
    }
    if (!IMPORTANCE_LEVELS.includes(cue.importance)) {
      errors.push(error('unsupported_importance', `${cuePath}.importance`, 'Cue importance is not supported.', {
        supported: IMPORTANCE_LEVELS,
        actual: cue.importance
      }));
    }
    if (!Array.isArray(cue.shells) || cue.shells.length === 0) {
      errors.push(error('shells_required', `${cuePath}.shells`, 'A cue needs at least one shell.'));
      return;
    }
    if (timeValid && PHASE_CONCURRENCY_CAPS[cue.phase]) {
      const concurrencyKey = `${cue.timeMs}:${cue.phase}`;
      const next = (concurrency.get(concurrencyKey) || 0) + cue.shells.length;
      concurrency.set(concurrencyKey, next);
      if (next > PHASE_CONCURRENCY_CAPS[cue.phase]) {
        errors.push(error('phase_concurrency_exceeded', `${cuePath}.shells`, 'Simultaneous shells exceed the phase concurrency cap.', {
          phase: cue.phase,
          cap: PHASE_CONCURRENCY_CAPS[cue.phase],
          actual: next,
          timeMs: cue.timeMs
        }));
      }
    }
    cue.shells.forEach((shell, shellIndex) => {
      validateShell(errors, shell, `${cuePath}.shells.${shellIndex}`, preset.durationMs, cue.timeMs);
      for (const layer of shell.layers) {
        if (!Number.isFinite(cue.timeMs) || !Number.isFinite(layer.delayMs)) continue;
        const beat = cue.timeMs + layer.delayMs;
        commands.set(beat, (commands.get(beat) || 0) + 1);
      }
    });
  });

  for (const requiredPhase of REQUIRED_PHASES) {
    if (!phases.has(requiredPhase)) {
      errors.push(error('missing_required_phase', `${path}.cues`, `Variant requires a ${requiredPhase} cue.`, {
        phase: requiredPhase
      }));
    }
  }
  for (const [timeMs, count] of commands) {
    if (count > MAX_SHOW_COMMANDS_PER_BEAT) {
      errors.push(error('spawn_command_budget_exceeded', `${path}.cues`, 'Show layer spawns exceed the reserved per-beat budget.', {
        timeMs,
        max: MAX_SHOW_COMMANDS_PER_BEAT,
        actual: count,
        reservedGiftCommands: 4
      }));
    }
  }
  const particleLoad = simulateParticleLoad(variant.cues);
  const peakShowCommands = Math.max(0, ...commands.values());
  diagnostics[name] = {
    ...particleLoad,
    poolSize: PARTICLE_POOL_SIZE,
    coreLimit: CORE_PARTICLE_LIMIT,
    peakShowCommands
  };
  if (particleLoad.peakCoreParticles > CORE_PARTICLE_LIMIT) {
    errors.push(error('core_particle_budget_exceeded', `${path}.cues`, 'Overlapping core layers exceed 70% of the particle pool.', {
      max: CORE_PARTICLE_LIMIT,
      actual: particleLoad.peakCoreParticles,
      peakAtMs: particleLoad.peakAtMs,
      poolSize: PARTICLE_POOL_SIZE
    }));
  }
}

function validateShowDefinition(source) {
  const errors = [];
  const diagnostics = { variants: {} };
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {
      valid: false,
      errors: [error('invalid_definition', '', 'Show definition must be an object.')],
      diagnostics
    };
  }
  inspectRawDefinition(errors, source);
  const definition = cloneNormalizedShowDefinition(source);
  if (definition.schemaVersion !== SHOW_DEFINITION_VERSION) {
    errors.push(error('unsupported_schema_version', 'schemaVersion', `Only ShowDefinitionV${SHOW_DEFINITION_VERSION} is supported.`, {
      expected: SHOW_DEFINITION_VERSION,
      actual: definition.schemaVersion
    }));
  }
  if (typeof definition.id !== 'string' || !ID_PATTERN.test(definition.id)) {
    errors.push(error('invalid_definition_id', 'id', 'Definition ID must be a safe, non-empty identifier.'));
  }
  if (typeof definition.metadata.name !== 'string' || !definition.metadata.name.trim()) {
    errors.push(error('name_required', 'metadata.name', 'Show name is required.'));
  }
  if (typeof definition.metadata.description !== 'string') {
    errors.push(error('invalid_description', 'metadata.description', 'Description must be a string.'));
  }
  if (typeof definition.metadata.author !== 'string') {
    errors.push(error('invalid_author', 'metadata.author', 'Author must be a string.'));
  }
  if (!Array.isArray(definition.metadata.tags)
    || definition.metadata.tags.some(tag => typeof tag !== 'string')) {
    errors.push(error('invalid_tags', 'metadata.tags', 'Tags must be an array of strings.'));
  }
  if (!MATERIAL_PROFILES.includes(definition.materialProfile)) {
    errors.push(error('unsupported_material_profile', 'materialProfile', 'Material profile is not supported.', {
      supported: MATERIAL_PROFILES,
      actual: definition.materialProfile
    }));
  }
  if (typeof definition.autoEligible !== 'boolean') {
    errors.push(error('invalid_boolean', 'autoEligible', 'autoEligible must be a boolean.'));
  }
  if (!definition.variants.long) {
    errors.push(error('long_variant_required', 'variants.long', 'A long master variant is required.'));
  }
  for (const name of ['short', 'medium', 'long']) {
    if (definition.variants[name]) validateVariant(errors, definition.variants[name], name, diagnostics.variants);
  }
  return { valid: errors.length === 0, errors, diagnostics };
}

module.exports = { validateShowDefinition, isRange };
