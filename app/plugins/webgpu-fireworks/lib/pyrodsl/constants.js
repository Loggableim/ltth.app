'use strict';

const SHOW_DEFINITION_VERSION = 1;
const SHOW_PLAN_VERSION = 2;
const PARTICLE_POOL_SIZE = 8192;
const CORE_PARTICLE_LIMIT = 5734;
const MAX_LAYERS_PER_SHELL = 4;
const MAX_COLORS_PER_LAYER = 4;
const MAX_SHOW_COMMANDS_PER_BEAT = 28;
const MAX_SHELL_PALETTE_COLORS = 12;

const PRIMITIVES = Object.freeze([
  'radial', 'ring', 'spiral', 'palm', 'crossette', 'comet', 'mine', 'glyph'
]);
const CURATED_GLYPHS = Object.freeze([
  'paw', 'heart', 'star', 'fox-head', 'wolf-head', 'dragon', 'dragon-wing', 'tail',
  'boykisser', 'trans-flag'
]);
const MATERIAL_PROFILES = Object.freeze(['classic', 'premium-realistic']);
const PHASES = Object.freeze(['opening', 'build', 'highlight', 'calm', 'bridge', 'breath', 'finale']);
const REQUIRED_PHASES = Object.freeze(['opening', 'build', 'highlight', 'finale']);
const IMPORTANCE_LEVELS = Object.freeze(['decorative', 'standard', 'essential', 'final-wave']);
const LAUNCH_MODES = Object.freeze(['rocket', 'airburst', 'ground']);
const TIERS = Object.freeze(['small', 'medium', 'big', 'massive']);
const LAYER_PRIORITIES = Object.freeze(['core', 'accent', 'decorative']);
const FORMATIONS = Object.freeze([
  'single',
  'pair',
  'fan',
  'wall',
  'ring',
  'arc',
  'grid',
  'cascade',
  'alternating-pair',
  'ring-accent',
  'star-accent',
  'gold-crown',
  'call',
  'response',
  'mirrored-pair',
  'centered-ring',
  'triple-salute',
  'symmetric-final-wall',
  'diagonal-pair',
  'cross-pair',
  'spiral-accent',
  'floral-finale',
  'heavy-single',
  'staggered-volley',
  'finale-wave-1',
  'finale-wave-2',
  'finale-wave-3',
  'peony',
  'chrysanthemum',
  'willow',
  'cathedral',
  'baroque-wall',
  'wing-fan',
  'paw-fan',
  'glyph-crown'
]);

const PHASE_CONCURRENCY_CAPS = Object.freeze({
  opening: 1,
  build: 2,
  highlight: 3,
  calm: 1,
  bridge: 1,
  breath: 1,
  finale: 6
});

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  }
  return value;
}

const numericOrRange = {
  oneOf: [
    { type: 'number' },
    {
      type: 'object',
      additionalProperties: false,
      required: ['min', 'max'],
      properties: { min: { type: 'number' }, max: { type: 'number' } }
    }
  ]
};

const SHOW_DEFINITION_V1_SCHEMA = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'ShowDefinitionV1',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'id', 'metadata', 'materialProfile', 'autoEligible', 'variants'],
  properties: {
    schemaVersion: { const: SHOW_DEFINITION_VERSION },
    id: { type: 'string', minLength: 1, maxLength: 128 },
    metadata: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        author: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
      }
    },
    materialProfile: { enum: [...MATERIAL_PROFILES] },
    autoEligible: { type: 'boolean' },
    variants: {
      type: 'object',
      additionalProperties: false,
      required: ['long'],
      properties: {
        short: { allOf: [{ $ref: '#/$defs/variant' }, { properties: { durationMs: { const: 10000 } } }] },
        medium: { allOf: [{ $ref: '#/$defs/variant' }, { properties: { durationMs: { const: 18000 } } }] },
        long: { allOf: [{ $ref: '#/$defs/variant' }, { properties: { durationMs: { const: 28000 } } }] }
      }
    }
  },
  $defs: {
    coordinate: {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y'],
      properties: { x: numericOrRange, y: numericOrRange }
    },
    layer: {
      type: 'object',
      additionalProperties: false,
      required: [
        'primitive', 'density', 'size', 'lifetimeMs', 'gravity', 'drag',
        'trail', 'split', 'strobe', 'colors'
      ],
      properties: {
        primitive: { enum: [...PRIMITIVES] },
        glyph: { enum: [...CURATED_GLYPHS] },
        delayMs: { type: 'integer', minimum: 0 },
        density: { type: 'integer', minimum: 1, maximum: PARTICLE_POOL_SIZE },
        size: numericOrRange,
        lifetimeMs: { type: 'integer', minimum: 1 },
        gravity: numericOrRange,
        drag: numericOrRange,
        trail: { type: 'boolean' },
        split: { type: 'boolean' },
        strobe: { type: 'boolean' },
        colors: { type: 'array', minItems: 1, maxItems: MAX_COLORS_PER_LAYER, items: { type: 'string' } },
        priority: { enum: [...LAYER_PRIORITIES] },
        core: { type: 'boolean' }
      }
    },
    shell: {
      type: 'object',
      additionalProperties: false,
      required: ['origin', 'target', 'launchMode', 'tier', 'palette', 'layers'],
      properties: {
        origin: { $ref: '#/$defs/coordinate' },
        target: { $ref: '#/$defs/coordinate' },
        launchMode: { enum: [...LAUNCH_MODES] },
        tier: { enum: [...TIERS] },
        palette: { type: 'array', minItems: 1, maxItems: MAX_SHELL_PALETTE_COLORS, items: { type: 'string' } },
        layers: { type: 'array', minItems: 1, maxItems: MAX_LAYERS_PER_SHELL, items: { $ref: '#/$defs/layer' } }
      }
    },
    cue: {
      type: 'object',
      additionalProperties: false,
      required: ['timeMs', 'phase', 'formation', 'importance', 'shells'],
      properties: {
        timeMs: { type: 'integer', minimum: 0 },
        phase: { enum: [...PHASES] },
        formation: { enum: [...FORMATIONS] },
        importance: { enum: [...IMPORTANCE_LEVELS] },
        shells: { type: 'array', minItems: 1, items: { $ref: '#/$defs/shell' } }
      }
    },
    variant: {
      type: 'object',
      additionalProperties: false,
      required: ['durationMs', 'cues'],
      properties: {
        durationMs: { type: 'integer' },
        cues: { type: 'array', minItems: 1, items: { $ref: '#/$defs/cue' } }
      }
    }
  }
});

const VARIANT_PRESETS = deepFreeze({
  short: {
    durationMs: 10000,
    ratio: 0.42,
    windows: {
      opening: [1200, 2200],
      build: [2200, 5000],
      highlight: [5000, 6500],
      rest: [6500, 7100],
      finale: [7100, 9000]
    }
  },
  medium: {
    durationMs: 18000,
    ratio: 0.67,
    windows: {
      opening: [1400, 3500],
      build: [3500, 8000],
      highlight: [8000, 11000],
      rest: [11000, 12000],
      finale: [12000, 16500]
    }
  },
  long: {
    durationMs: 28000,
    ratio: 1,
    windows: {
      opening: [1500, 5000],
      build: [5000, 12500],
      highlight: [12500, 17000],
      rest: [17000, 18500],
      finale: [18500, 26500]
    }
  }
});

module.exports = {
  SHOW_DEFINITION_VERSION,
  SHOW_PLAN_VERSION,
  PARTICLE_POOL_SIZE,
  CORE_PARTICLE_LIMIT,
  MAX_LAYERS_PER_SHELL,
  MAX_COLORS_PER_LAYER,
  MAX_SHOW_COMMANDS_PER_BEAT,
  MAX_SHELL_PALETTE_COLORS,
  SHOW_DEFINITION_V1_SCHEMA,
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
};
