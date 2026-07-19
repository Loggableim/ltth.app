'use strict';

const {
  SHOW_DEFINITION_VERSION,
  SHOW_DEFINITION_V1_SCHEMA,
  SHOW_PLAN_VERSION,
  VARIANT_PRESETS,
  PHASE_CONCURRENCY_CAPS,
  PRIMITIVES,
  CURATED_GLYPHS,
  MAX_LAYERS_PER_SHELL,
  MAX_COLORS_PER_LAYER,
  MAX_SHOW_COMMANDS_PER_BEAT,
  PARTICLE_POOL_SIZE,
  CORE_PARTICLE_LIMIT,
  cloneNormalizedShowDefinition,
  validateShowDefinition,
  compileShowDefinition,
  deriveShowVariants,
  PyroDSLValidationError
} = require('../plugins/webgpu-fireworks/lib/pyrodsl');

const COLOR = '#ffd166';

function layer(overrides = {}) {
  return {
    primitive: 'radial',
    delayMs: 0,
    density: 120,
    size: 1,
    lifetimeMs: 700,
    gravity: 0.8,
    drag: 0.04,
    trail: false,
    split: false,
    strobe: false,
    colors: [COLOR],
    priority: 'core',
    core: true,
    ...overrides
  };
}

function shell(overrides = {}) {
  return {
    origin: { x: 0.5, y: 1.02 },
    target: { x: 0.5, y: 0.4 },
    launchMode: 'rocket',
    tier: 'medium',
    palette: [COLOR, '#ffffff'],
    layers: [layer()],
    ...overrides
  };
}

function cue(timeMs, phase, overrides = {}) {
  return {
    timeMs,
    phase,
    formation: 'single',
    importance: 'standard',
    shells: [shell()],
    ...overrides
  };
}

function variant(name, cues) {
  return { durationMs: VARIANT_PRESETS[name].durationMs, cues };
}

function validDefinition() {
  return {
    schemaVersion: 1,
    id: 'custom:test-show',
    metadata: {
      name: 'Test Show',
      description: 'A deterministic test fixture',
      author: 'LTTH',
      tags: ['test']
    },
    materialProfile: 'premium-realistic',
    autoEligible: true,
    variants: {
      short: variant('short', [
        cue(1500, 'opening', { importance: 'essential' }),
        cue(3000, 'build'),
        cue(5400, 'highlight'),
        cue(6700, 'calm', { importance: 'essential' }),
        cue(7600, 'finale', { formation: 'finale-wave-1', importance: 'final-wave' })
      ]),
      medium: variant('medium', [
        cue(1800, 'opening', { importance: 'essential' }),
        cue(5000, 'build'),
        cue(9000, 'highlight'),
        cue(11500, 'bridge', { importance: 'essential' }),
        cue(13500, 'finale', { formation: 'finale-wave-1', importance: 'final-wave' })
      ]),
      long: variant('long', [
        cue(2000, 'opening', { importance: 'essential' }),
        cue(7000, 'build'),
        cue(14000, 'highlight'),
        cue(17750, 'calm', { importance: 'essential' }),
        cue(21000, 'finale', { formation: 'finale-wave-1', importance: 'final-wave' })
      ])
    }
  };
}

function errorCodes(result) {
  return result.errors.map(error => error.code);
}

describe('PyroDSL contract and normalization', () => {
  test('exports immutable version, limits, primitive and glyph constants', () => {
    expect(SHOW_DEFINITION_VERSION).toBe(1);
    expect(SHOW_PLAN_VERSION).toBe(2);
    expect(Object.isFrozen(VARIANT_PRESETS)).toBe(true);
    expect(PHASE_CONCURRENCY_CAPS).toMatchObject({ opening: 1, build: 2, highlight: 3, finale: 6, calm: 1, bridge: 1 });
    expect(PRIMITIVES).toEqual(['radial', 'ring', 'spiral', 'palm', 'crossette', 'comet', 'mine', 'glyph']);
    expect(CURATED_GLYPHS).toEqual(['paw', 'heart', 'star', 'fox-head', 'wolf-head', 'dragon', 'dragon-wing', 'tail']);
    expect(MAX_LAYERS_PER_SHELL).toBe(4);
    expect(MAX_COLORS_PER_LAYER).toBe(4);
    expect(MAX_SHOW_COMMANDS_PER_BEAT).toBe(28);
    expect(PARTICLE_POOL_SIZE).toBe(8192);
    expect(CORE_PARTICLE_LIMIT).toBe(5734);
    expect(SHOW_DEFINITION_V1_SCHEMA).toMatchObject({
      $id: 'ShowDefinitionV1',
      type: 'object',
      required: ['schemaVersion', 'id', 'metadata', 'materialProfile', 'autoEligible', 'variants'],
      properties: {
        schemaVersion: { const: 1 },
        variants: expect.objectContaining({ type: 'object' })
      }
    });
    expect(Object.isFrozen(SHOW_DEFINITION_V1_SCHEMA)).toBe(true);
  });

  test.each(PRIMITIVES)('accepts the %s primitive', primitive => {
    const definition = validDefinition();
    const targetLayer = definition.variants.long.cues[0].shells[0].layers[0];
    targetLayer.primitive = primitive;
    if (primitive === 'glyph') targetLayer.glyph = 'paw';
    expect(validateShowDefinition(definition)).toMatchObject({ valid: true, errors: [] });
  });

  test.each(CURATED_GLYPHS)('accepts the curated %s glyph', glyph => {
    const definition = validDefinition();
    definition.variants.long.cues[0].shells[0].layers[0] = layer({ primitive: 'glyph', glyph });
    expect(validateShowDefinition(definition).valid).toBe(true);
  });

  test('clones into a stable normalized contract with resolved defaults and no shared references', () => {
    const source = validDefinition();
    delete source.autoEligible;
    delete source.variants.long.cues[0].shells[0].layers[0].delayMs;
    delete source.variants.long.cues[0].shells[0].layers[0].priority;
    delete source.variants.long.cues[0].shells[0].layers[0].core;

    const normalized = cloneNormalizedShowDefinition(source);

    expect(normalized.autoEligible).toBe(false);
    expect(normalized.variants.long.cues[0].shells[0].layers[0]).toMatchObject({
      delayMs: 0,
      priority: 'core',
      core: true
    });
    normalized.metadata.name = 'Changed';
    normalized.variants.long.cues[0].shells[0].palette[0] = '#000000';
    expect(source.metadata.name).toBe('Test Show');
    expect(source.variants.long.cues[0].shells[0].palette[0]).toBe(COLOR);
    expect(cloneNormalizedShowDefinition(source)).toEqual(cloneNormalizedShowDefinition(source));
  });
});

describe('PyroDSL validation', () => {
  test('enforces required raw contract fields before applying defaults', () => {
    const definition = validDefinition();
    delete definition.schemaVersion;
    delete definition.autoEligible;

    const result = validateShowDefinition(definition);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'required_property_missing', path: 'schemaVersion' }),
      expect.objectContaining({ code: 'required_property_missing', path: 'autoEligible' })
    ]));
  });

  test('rejects unknown top-level and nested shader/SVG-like properties', () => {
    const definition = validDefinition();
    const targetCue = definition.variants.long.cues[0];
    const targetShell = targetCue.shells[0];
    const targetLayer = targetShell.layers[0];
    definition.customShader = 'fn main() {}';
    targetCue.customSvg = '<svg><path /></svg>';
    targetShell.svgPath = 'M0 0 L1 1';
    targetShell.target.z = 0.5;
    targetLayer.customShader = '@fragment fn main() {}';
    targetLayer.size = { min: 0.8, max: 1.2, customShader: 'range payload' };

    const result = validateShowDefinition(definition);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unknown_property', path: 'customShader' }),
      expect.objectContaining({ code: 'unknown_property', path: 'variants.long.cues.0.customSvg' }),
      expect.objectContaining({ code: 'unknown_property', path: 'variants.long.cues.0.shells.0.svgPath' }),
      expect.objectContaining({ code: 'unknown_property', path: 'variants.long.cues.0.shells.0.target.z' }),
      expect.objectContaining({ code: 'unknown_property', path: 'variants.long.cues.0.shells.0.layers.0.customShader' }),
      expect.objectContaining({ code: 'unknown_property', path: 'variants.long.cues.0.shells.0.layers.0.size.customShader' })
    ]));
  });

  test('keeps documented layer defaults optional in raw definitions', () => {
    const definition = validDefinition();
    const targetLayer = definition.variants.long.cues[0].shells[0].layers[0];
    delete targetLayer.delayMs;
    delete targetLayer.priority;
    delete targetLayer.core;

    expect(validateShowDefinition(definition)).toMatchObject({ valid: true, errors: [] });
  });

  test('never throws for malformed nested values and returns structured errors', () => {
    const malformed = validDefinition();
    malformed.metadata = null;
    malformed.variants.short = null;
    malformed.variants.medium.cues = [null];
    malformed.variants.long.cues[0].shells = [null];

    expect(() => validateShowDefinition(malformed)).not.toThrow();
    const result = validateShowDefinition(malformed);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every(item => item.code && typeof item.path === 'string' && item.message)).toBe(true);
  });

  test('returns structured, path-addressable errors for malformed schema and supported values', () => {
    const definition = validDefinition();
    definition.schemaVersion = 2;
    definition.materialProfile = 'imaginary';
    definition.variants.long.cues[0].phase = 'unknown';
    definition.variants.long.cues[0].formation = 'unknown-formation';
    definition.variants.long.cues[0].importance = 'urgent';
    definition.variants.long.cues[0].shells[0].launchMode = 'teleport';
    definition.variants.long.cues[0].shells[0].tier = 'planetary';
    definition.variants.long.cues[0].shells[0].layers[0].primitive = 'flower';

    const result = validateShowDefinition(definition);

    expect(result.valid).toBe(false);
    expect(errorCodes(result)).toEqual(expect.arrayContaining([
      'unsupported_schema_version', 'unsupported_material_profile', 'unsupported_phase',
      'unsupported_formation', 'unsupported_importance', 'unsupported_launch_mode',
      'unsupported_tier', 'unsupported_primitive', 'missing_required_phase'
    ]));
    expect(result.errors.every(error => (
      typeof error.code === 'string' && typeof error.path === 'string' && typeof error.message === 'string'
    ))).toBe(true);
  });

  test('rejects non-curated glyphs and glyph layers without an ID', () => {
    const definition = validDefinition();
    definition.variants.long.cues[0].shells[0].layers[0] = layer({ primitive: 'glyph', glyph: 'logo' });
    expect(errorCodes(validateShowDefinition(definition))).toContain('unsupported_glyph');
    delete definition.variants.long.cues[0].shells[0].layers[0].glyph;
    expect(errorCodes(validateShowDefinition(definition))).toContain('glyph_required');
  });

  test('enforces four layers per shell and four colors per layer', () => {
    const tooManyLayers = validDefinition();
    tooManyLayers.variants.long.cues[0].shells[0].layers = Array.from({ length: 5 }, () => layer());
    expect(errorCodes(validateShowDefinition(tooManyLayers))).toContain('too_many_layers');

    const tooManyColors = validDefinition();
    tooManyColors.variants.long.cues[0].shells[0].layers[0].colors = [
      '#111111', '#222222', '#333333', '#444444', '#555555'
    ];
    expect(errorCodes(validateShowDefinition(tooManyColors))).toContain('too_many_colors');
  });

  test('validates stochastic numeric range endpoints with field-specific errors', () => {
    const definition = validDefinition();
    definition.variants.long.cues[0].shells[0].layers[0].size = { min: 0.01, max: 1 };
    const result = validateShowDefinition(definition);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'invalid_number',
      path: 'variants.long.cues.0.shells.0.layers.0.size'
    }));
  });

  test.each([
    ['short', 10000],
    ['medium', 18000],
    ['long', 28000]
  ])('requires the exact %s duration of %i ms', (name, durationMs) => {
    const definition = validDefinition();
    definition.variants[name].durationMs = durationMs - 1;
    const result = validateShowDefinition(definition);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'invalid_variant_duration',
      path: `variants.${name}.durationMs`,
      details: expect.objectContaining({ expected: durationMs })
    }));
  });

  test('rejects out-of-order/out-of-bounds times, tails, coordinates, and missing required phases', () => {
    const definition = validDefinition();
    const cues = definition.variants.short.cues;
    cues[1].timeMs = 1000;
    cues[2].timeMs = 9999;
    cues[2].shells[0].layers[0].lifetimeMs = 100;
    cues[0].shells[0].origin.x = -0.01;
    cues[0].shells[0].target.y = 1.01;
    cues.splice(cues.findIndex(item => item.phase === 'build'), 1);

    const codes = errorCodes(validateShowDefinition(definition));
    expect(codes).toEqual(expect.arrayContaining([
      'unordered_cue_time', 'show_tail_exceeds_duration', 'coordinate_out_of_bounds', 'missing_required_phase'
    ]));
  });

  test.each([
    ['opening', 2],
    ['build', 3],
    ['highlight', 4],
    ['finale', 7],
    ['calm', 2],
    ['bridge', 2]
  ])('enforces the %s phase concurrency cap', (phase, count) => {
    const definition = validDefinition();
    const targetCue = definition.variants.long.cues.find(item => item.phase === phase)
      || definition.variants.long.cues.find(item => item.phase === 'calm');
    targetCue.phase = phase;
    targetCue.shells = Array.from({ length: count }, () => shell());
    expect(errorCodes(validateShowDefinition(definition))).toContain('phase_concurrency_exceeded');
  });

  test('combines simultaneous cues when checking phase concurrency', () => {
    const definition = validDefinition();
    const build = definition.variants.long.cues.find(item => item.phase === 'build');
    build.shells = [shell(), shell()];
    definition.variants.long.cues.splice(2, 0, cue(build.timeMs, 'build'));
    expect(errorCodes(validateShowDefinition(definition))).toContain('phase_concurrency_exceeded');
  });

  test('reserves four renderer commands by rejecting more than 28 layer spawns at a beat', () => {
    const definition = validDefinition();
    const finale = definition.variants.long.cues.find(item => item.phase === 'finale');
    finale.shells = Array.from({ length: 6 }, () => shell({
      layers: Array.from({ length: 4 }, () => layer())
    }));
    definition.variants.long.cues.splice(-1, 0, cue(finale.timeMs, 'highlight', {
      shells: [shell({ layers: Array.from({ length: 4 }, () => layer()) }), shell()]
    }));
    expect(errorCodes(validateShowDefinition(definition))).toContain('spawn_command_budget_exceeded');
  });

  test('combines delayed layer spawns from different cue times into the same command beat', () => {
    const definition = validDefinition();
    const build = definition.variants.long.cues.find(item => item.phase === 'build');
    build.shells = Array.from({ length: 2 }, () => shell({
      layers: Array.from({ length: 4 }, () => layer({ delayMs: 14000 }))
    }));
    const finale = definition.variants.long.cues.find(item => item.phase === 'finale');
    finale.shells = Array.from({ length: 6 }, () => shell({
      layers: Array.from({ length: 4 }, () => layer())
    }));
    expect(errorCodes(validateShowDefinition(definition))).toContain('spawn_command_budget_exceeded');
  });

  test('rejects overlapping core particles above 70% and reports decorative load without rejecting it', () => {
    const overloaded = validDefinition();
    const finale = overloaded.variants.long.cues.find(item => item.phase === 'finale');
    finale.shells = Array.from({ length: 6 }, () => shell({ layers: [layer({ density: 1000, lifetimeMs: 1000 })] }));
    const overloadedResult = validateShowDefinition(overloaded);
    expect(errorCodes(overloadedResult)).toContain('core_particle_budget_exceeded');
    expect(overloadedResult.diagnostics.variants.long.peakCoreParticles).toBe(6000);
    expect(overloadedResult.diagnostics.variants.long.peakTotalParticles).toBe(6000);

    for (const item of finale.shells) {
      item.layers[0].priority = 'decorative';
      item.layers[0].core = false;
    }
    const decorativeResult = validateShowDefinition(overloaded);
    expect(decorativeResult.valid).toBe(true);
    expect(decorativeResult.diagnostics.variants.long).toMatchObject({
      peakCoreParticles: 120,
      peakTotalParticles: 6000,
      poolSize: 8192,
      coreLimit: 5734
    });
  });

  test('simulates lifetime overlap across separate cue beats', () => {
    const definition = validDefinition();
    const build = definition.variants.long.cues.find(item => item.phase === 'build');
    const highlight = definition.variants.long.cues.find(item => item.phase === 'highlight');
    build.shells = [shell({ layers: [layer({ density: 3000, lifetimeMs: 7500 })] })];
    highlight.shells = [shell({ layers: [layer({ density: 3000, lifetimeMs: 1000 })] })];

    const result = validateShowDefinition(definition);
    expect(errorCodes(result)).toContain('core_particle_budget_exceeded');
    expect(result.diagnostics.variants.long.peakCoreParticles).toBe(6000);
  });
});

describe('PyroDSL deterministic compilation', () => {
  test('compiles a deterministic ShowPlanV2 with stable IDs, order, defaults, and v1 fallback fields', () => {
    const definition = validDefinition();
    const first = compileShowDefinition(definition, { variant: 'long', seed: 2026 });
    const second = compileShowDefinition(definition, { variant: 'long', seed: 2026 });

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      planVersion: 2,
      definitionId: 'custom:test-show',
      variant: 'long',
      durationMs: 28000,
      seed: 2026,
      materialProfile: 'premium-realistic',
      autoEligible: true
    });
    expect(first.cues.map(item => item.timeMs)).toEqual([...first.cues.map(item => item.timeMs)].sort((a, b) => a - b));
    const firstCue = first.cues[0];
    expect(firstCue).toMatchObject({ id: 'custom:test-show:long:cue:1', beatAtMs: firstCue.timeMs });
    expect(firstCue.shells[0]).toMatchObject({
      id: 'custom:test-show:long:cue:1:shell:1',
      position: firstCue.shells[0].target,
      colors: firstCue.shells[0].palette,
      tier: 'medium'
    });
    expect(firstCue.shells[0].layers[0]).toMatchObject({
      id: 'custom:test-show:long:cue:1:shell:1:layer:1',
      delayMs: 0,
      priority: 'core',
      core: true
    });
  });

  test('only stochastic ranges and seed metadata change when the seed changes', () => {
    const definition = validDefinition();
    const stochasticShell = definition.variants.long.cues[0].shells[0];
    stochasticShell.target.x = { min: 0.3, max: 0.7 };
    stochasticShell.layers[0].size = { min: 0.8, max: 1.2 };
    const first = compileShowDefinition(definition, { variant: 'long', seed: 10 });
    const reseeded = compileShowDefinition(definition, { variant: 'long', seed: 11 });

    expect(reseeded.seed).toBe(11);
    expect(reseeded.cues.map(item => [item.timeMs, item.shells.length, item.shells.map(entry => entry.layers.length)]))
      .toEqual(first.cues.map(item => [item.timeMs, item.shells.length, item.shells.map(entry => entry.layers.length)]));
    expect(reseeded.cues[0].shells[0].target.x).not.toBe(first.cues[0].shells[0].target.x);
    expect(reseeded.cues[0].shells[0].layers[0].size).not.toBe(first.cues[0].shells[0].layers[0].size);
  });

  test('keeps structural plan and child IDs stable across seeds without stochastic fields', () => {
    const definition = validDefinition();
    const first = compileShowDefinition(definition, { variant: 'long', seed: 1 });
    const reseeded = compileShowDefinition(definition, { variant: 'long', seed: 2 });

    expect(reseeded.id).toBe(first.id);
    expect(reseeded.cues.map(item => item.id)).toEqual(first.cues.map(item => item.id));
    expect(reseeded.cues.flatMap(item => item.shells.map(entry => entry.id)))
      .toEqual(first.cues.flatMap(item => item.shells.map(entry => entry.id)));
    expect(reseeded.cues.flatMap(item => item.shells.flatMap(entry => entry.layers.map(layerEntry => layerEntry.id))))
      .toEqual(first.cues.flatMap(item => item.shells.flatMap(entry => entry.layers.map(layerEntry => layerEntry.id))));
  });

  test('throws a structured validation error instead of compiling invalid input', () => {
    const definition = validDefinition();
    definition.variants.long.durationMs = 1;
    expect(() => compileShowDefinition(definition, { variant: 'long', seed: 1 })).toThrow(PyroDSLValidationError);
    try {
      compileShowDefinition(definition, { variant: 'long', seed: 1 });
    } catch (error) {
      expect(error).toMatchObject({ code: 'PYRODSL_VALIDATION_FAILED', errors: expect.any(Array) });
    }
  });

  test('reports unsupported variant requests as structured validation errors', () => {
    const definition = validDefinition();
    expect(() => compileShowDefinition(definition, { variant: '__proto__', seed: 1 }))
      .toThrow(PyroDSLValidationError);
  });
});

describe('PyroDSL variant derivation', () => {
  function longMasterDefinition() {
    const definition = validDefinition();
    delete definition.variants.short;
    delete definition.variants.medium;
    definition.variants.long.cues = [
      cue(1700, 'opening', { importance: 'essential' }),
      cue(3000, 'opening'),
      cue(4200, 'opening'),
      cue(5600, 'build'),
      cue(6500, 'build'),
      cue(8000, 'build'),
      cue(9500, 'build'),
      cue(11000, 'build'),
      cue(12000, 'build'),
      cue(13000, 'highlight', { importance: 'essential' }),
      cue(15000, 'highlight'),
      cue(16000, 'highlight'),
      cue(17500, 'calm', { importance: 'essential' }),
      cue(19000, 'finale', { formation: 'finale-wave-1', importance: 'final-wave' }),
      cue(22000, 'finale', { formation: 'finale-wave-2', importance: 'final-wave' }),
      cue(25000, 'finale', {
        formation: 'finale-wave-3',
        importance: 'final-wave',
        shells: [shell({ layers: [layer({ lifetimeMs: 1500 })] })]
      }),
      cue(26000, 'finale')
    ];
    return definition;
  }

  test('derives fixed-duration variants phase-relatively at deterministic target ratios', () => {
    const definition = longMasterDefinition();
    const derived = deriveShowVariants(definition, { variants: ['medium', 'short'], seed: 7 });
    const repeated = deriveShowVariants(definition, { variants: ['medium', 'short'], seed: 7 });

    expect(repeated).toEqual(derived);
    expect(derived.variants.medium.durationMs).toBe(18000);
    expect(derived.variants.short.durationMs).toBe(10000);
    expect(derived.variants.medium.cues).toHaveLength(Math.round(17 * 0.67));
    expect(derived.variants.short.cues).toHaveLength(Math.round(17 * 0.42));
    for (const name of ['medium', 'short']) {
      const phases = new Set(derived.variants[name].cues.map(item => item.phase));
      expect([...phases]).toEqual(expect.arrayContaining(['opening', 'build', 'highlight', 'finale', 'calm']));
      expect(derived.variants[name].cues.map(item => item.timeMs))
        .toEqual([...derived.variants[name].cues.map(item => item.timeMs)].sort((a, b) => a - b));
    }
    const longOpening = definition.variants.long.cues[0].timeMs;
    const expectedMediumOpening = Math.round(1400 + ((longOpening - 1500) / (5000 - 1500)) * (3500 - 1400));
    expect(derived.variants.medium.cues.find(item => item.phase === 'opening').timeMs).toBe(expectedMediumOpening);
    expect(validateShowDefinition(derived).valid).toBe(true);
  });

  test('retains essential cues, the rest window, and every finale wave', () => {
    const definition = longMasterDefinition();
    const derived = deriveShowVariants(definition, { variants: ['short'], seed: 99 });
    const cues = derived.variants.short.cues;

    expect(cues.filter(item => item.importance === 'essential')).toHaveLength(3);
    expect(cues.some(item => item.phase === 'calm')).toBe(true);
    expect(cues.filter(item => item.importance === 'final-wave').map(item => item.formation))
      .toEqual(['finale-wave-1', 'finale-wave-2', 'finale-wave-3']);
  });

  test('does not overwrite existing variants unless explicitly requested', () => {
    const definition = longMasterDefinition();
    definition.variants.short = variant('short', [
      cue(1000, 'opening'), cue(3000, 'build'), cue(5000, 'highlight'), cue(8000, 'finale')
    ]);
    const preserved = deriveShowVariants(definition, { variants: ['short'], seed: 1 });
    expect(preserved.variants.short).toEqual(definition.variants.short);

    const overwritten = deriveShowVariants(definition, { variants: ['short'], seed: 1, overwrite: true });
    expect(overwritten.variants.short).not.toEqual(definition.variants.short);
  });

  test('deduplicates compressed finale waves without pushing either tail past the duration', () => {
    const definition = validDefinition();
    delete definition.variants.short;
    delete definition.variants.medium;
    definition.variants.long.cues = [
      cue(2000, 'opening'),
      cue(7000, 'build'),
      cue(14000, 'highlight'),
      cue(23000, 'finale', {
        formation: 'finale-wave-1',
        importance: 'final-wave',
        shells: [shell({ layers: [layer({ lifetimeMs: 2000 })] })]
      }),
      cue(24000, 'finale', {
        formation: 'finale-wave-2',
        importance: 'final-wave',
        shells: [shell({ layers: [layer({ lifetimeMs: 2000 })] })]
      })
    ];

    const derived = deriveShowVariants(definition, { variants: ['short'], seed: 5 });
    const finaleTimes = derived.variants.short.cues
      .filter(item => item.phase === 'finale')
      .map(item => item.timeMs);

    expect(finaleTimes).toEqual([7999, 8000]);
    expect(validateShowDefinition(derived).valid).toBe(true);
    for (const finaleCue of derived.variants.short.cues.filter(item => item.phase === 'finale')) {
      expect(finaleCue.timeMs + finaleCue.shells[0].layers[0].lifetimeMs).toBeLessThanOrEqual(10000);
    }
  });

  test('throws a structured derivation error when a tail cannot fit its target phase window', () => {
    const definition = validDefinition();
    delete definition.variants.short;
    delete definition.variants.medium;
    definition.variants.long.cues[0].timeMs = 1500;
    definition.variants.long.cues[0].shells[0].layers[0].lifetimeMs = 10000;

    expect(() => deriveShowVariants(definition, { variants: ['short'], seed: 5 }))
      .toThrow(PyroDSLValidationError);
    try {
      deriveShowVariants(definition, { variants: ['short'], seed: 5 });
    } catch (error) {
      expect(error.errors).toContainEqual(expect.objectContaining({
        code: 'derivation_schedule_impossible',
        path: expect.stringMatching(/^variants\.short\.cues\./)
      }));
    }
  });
});
