'use strict';

const { SHOW_DEFINITION_VERSION } = require('./constants');

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const withDefault = (value, fallback) => value === undefined ? fallback : value;
const safeObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, cloneValue(value[key])]));
}

function normalizeLayer(source = {}, palette = ['#ffffff']) {
  source = safeObject(source);
  const priority = withDefault(source.priority, 'core');
  const normalized = {
    primitive: withDefault(source.primitive, 'radial'),
    delayMs: withDefault(source.delayMs, 0),
    density: withDefault(source.density, 128),
    size: withDefault(source.size, 1),
    lifetimeMs: withDefault(source.lifetimeMs, 800),
    gravity: withDefault(source.gravity, 0.8),
    drag: withDefault(source.drag, 0.04),
    trail: withDefault(source.trail, false),
    split: withDefault(source.split, false),
    strobe: withDefault(source.strobe, false),
    colors: cloneValue(withDefault(source.colors, palette.slice(0, 4))),
    priority,
    core: withDefault(source.core, priority !== 'decorative')
  };
  if (hasOwn(source, 'glyph')) normalized.glyph = source.glyph;
  return normalized;
}

function normalizeShell(source = {}) {
  source = safeObject(source);
  const palette = cloneValue(withDefault(source.palette, ['#ffffff']));
  return {
    origin: cloneValue(withDefault(source.origin, { x: 0.5, y: 1.02 })),
    target: cloneValue(withDefault(source.target, { x: 0.5, y: 0.4 })),
    launchMode: withDefault(source.launchMode, 'rocket'),
    tier: withDefault(source.tier, 'medium'),
    palette,
    layers: Array.isArray(source.layers)
      ? source.layers.map(layer => normalizeLayer(layer, Array.isArray(palette) ? palette : ['#ffffff']))
      : []
  };
}

function normalizeCue(source = {}) {
  source = safeObject(source);
  return {
    timeMs: source.timeMs,
    phase: source.phase,
    formation: withDefault(source.formation, 'single'),
    importance: withDefault(source.importance, 'standard'),
    shells: Array.isArray(source.shells) ? source.shells.map(normalizeShell) : []
  };
}

function normalizeVariant(source = {}) {
  source = safeObject(source);
  return {
    durationMs: source.durationMs,
    cues: Array.isArray(source.cues) ? source.cues.map(normalizeCue) : []
  };
}

function cloneNormalizedShowDefinition(source = {}) {
  const safeSource = source && typeof source === 'object' ? source : {};
  const metadata = safeSource.metadata && typeof safeSource.metadata === 'object' ? safeSource.metadata : {};
  const variants = safeSource.variants && typeof safeSource.variants === 'object' ? safeSource.variants : {};
  const normalizedVariants = {};
  for (const name of ['short', 'medium', 'long']) {
    if (hasOwn(variants, name)) normalizedVariants[name] = normalizeVariant(variants[name]);
  }
  return {
    schemaVersion: withDefault(safeSource.schemaVersion, SHOW_DEFINITION_VERSION),
    id: safeSource.id,
    metadata: {
      name: withDefault(metadata.name, ''),
      description: withDefault(metadata.description, ''),
      author: withDefault(metadata.author, ''),
      tags: cloneValue(withDefault(metadata.tags, []))
    },
    materialProfile: withDefault(safeSource.materialProfile, 'classic'),
    autoEligible: withDefault(safeSource.autoEligible, false),
    variants: normalizedVariants
  };
}

module.exports = { cloneNormalizedShowDefinition, cloneValue };
