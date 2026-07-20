'use strict';

const { FinaleShowPlanner, FINALE_STYLES, FINALE_LENGTHS } = require('../plugins/webgpu-fireworks/lib/finale-show-planner');
const {
  assertShowPlanV2,
  buildShowPlanV2Runtime,
  resolveCueAudioProfile
} = require('../plugins/webgpu-fireworks/gpu/show-plan-v2-runtime');

function layer(id, overrides = {}) {
  return {
    id,
    primitive: 'radial',
    delayMs: 0,
    density: 60,
    size: 1,
    lifetimeMs: 700,
    gravity: 0.8,
    drag: 0.04,
    trail: false,
    split: false,
    strobe: false,
    colors: ['#ffd166'],
    priority: 'core',
    core: true,
    ...overrides
  };
}

function shell(id, launchMode, overrides = {}) {
  return {
    id,
    origin: { x: 0.25, y: 1 },
    target: { x: 0.75, y: 0.25 },
    position: { x: 0.75, y: 0.25 },
    launchMode,
    tier: 'big',
    palette: ['#ffd166'],
    colors: ['#ffd166'],
    seed: 99,
    powerScale: 1,
    particleScale: 1,
    soundRole: 'chrysanthemum',
    crackleEnabled: false,
    layers: [layer(`${id}:layer:1`)],
    ...overrides
  };
}

function plan(cues, overrides = {}) {
  return {
    planVersion: 2,
    id: 'v2-fixture',
    style: 'nishiki-kamuro',
    length: 'short',
    durationMs: 3000,
    seed: 2026,
    materialProfile: 'premium-realistic',
    cues,
    ...overrides
  };
}

function commandBudgetPlan(requiredLayerCount) {
  const layerShells = Array.from({ length: Math.ceil(requiredLayerCount / 4) }, (_, shellIndex) => {
    const count = Math.min(4, requiredLayerCount - shellIndex * 4);
    const launchMode = shellIndex % 2 === 0 ? 'airburst' : 'ground';
    return shell(`budget-layer-shell-${shellIndex + 1}`, launchMode, {
      layers: Array.from({ length: count }, (_, layerIndex) => (
        layer(`budget-layer-${shellIndex + 1}-${layerIndex + 1}`)
      ))
    });
  });
  const rocketTarget = { x: 0.5, y: 0.4 };
  return plan([
    {
      id: 'budget-layers',
      beatAtMs: 700,
      phase: 'opening',
      formation: 'wall',
      importance: 'essential',
      shells: layerShells
    },
    {
      id: 'budget-rocket',
      beatAtMs: 2000,
      phase: 'finale',
      formation: 'single',
      importance: 'final-wave',
      shells: [shell('budget-rocket', 'rocket', { target: rocketTarget, position: rocketTarget })]
    }
  ]);
}

describe('ShowPlanV2 pure overlay runtime', () => {
  test('stamps rocket and layer commands with their exact planned due batch', () => {
    const showPlan = plan([
      {
        id: 'batch-rocket', beatAtMs: 700, phase: 'opening', formation: 'single', importance: 'standard',
        shells: [shell('batch-rocket-shell', 'rocket')]
      },
      {
        id: 'batch-layer', beatAtMs: 701, phase: 'build', formation: 'single', importance: 'standard',
        shells: [shell('batch-layer-shell', 'airburst')]
      }
    ]);

    const runtime = buildShowPlanV2Runtime(showPlan, { startAt: 1000, playSound: false });
    const rocket = runtime.events.find(event => event.type === 'finale-v2-rocket');
    const layers = runtime.events.filter(event => event.type === 'finale-v2-layer');

    expect(rocket.admissionBatchId).toBe(1000);
    expect(layers.map(event => [event.due, event.admissionBatchId, event.context.admissionBatchId]))
      .toEqual([
        [1700, 1700, 1700],
        [1701, 1701, 1701]
      ]);
  });

  test('rejects 29 coincident required commands before GPU admission', () => {
    let error;
    try {
      buildShowPlanV2Runtime(commandBudgetPlan(28), { playSound: false });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: 'spawn_command_budget_exceeded',
      details: expect.objectContaining({
        timeMs: 700,
        max: 28,
        actual: 29,
        optional: 1,
        total: 30
      })
    });
  });

  test('admits 28 required commands plus optional exhaust and reports exact peaks', () => {
    const runtime = buildShowPlanV2Runtime(commandBudgetPlan(27), { playSound: false });

    expect(runtime).toMatchObject({
      maxLayerCommandsAtBeat: 27,
      peakRequiredCommands: 28,
      peakRequiredCommandsAtMs: 700,
      peakOptionalCommands: 1,
      peakOptionalCommandsAtMs: 700,
      peakTotalCommands: 29,
      peakTotalCommandsAtMs: 700
    });
  });

  test('validates optional render hints and normalizes omitted hints to the flat renderer contract', () => {
    const flatPlan = plan([{
      id: 'flat', beatAtMs: 2000, phase: 'opening', formation: 'single', importance: 'standard',
      shells: [shell('flat-shell', 'rocket')]
    }]);
    const runtime = buildShowPlanV2Runtime(flatPlan, { startAt: 1000, width: 1000, height: 1000, playSound: false });

    expect(runtime.events.find(event => event.type === 'finale-v2-rocket').renderHints).toEqual({
      depthEnabled: false,
      launchDepth: 0,
      burstDepth: 0,
      glyphScale: 1
    });
    expect(runtime.events.find(event => event.type === 'finale-v2-layer').context.renderHints).toEqual({
      depthEnabled: false,
      launchDepth: 0,
      burstDepth: 0,
      glyphScale: 1
    });

    const invalidHints = [
      { depthEnabled: 1, launchDepth: 0, burstDepth: 0, glyphScale: 1 },
      { depthEnabled: true, launchDepth: Number.NaN, burstDepth: 0, glyphScale: 1 },
      { depthEnabled: true, launchDepth: '0', burstDepth: 0, glyphScale: 1 },
      { depthEnabled: true, launchDepth: -1.01, burstDepth: 0, glyphScale: 1 },
      { depthEnabled: true, launchDepth: 0, burstDepth: 1.01, glyphScale: 1 },
      { depthEnabled: true, launchDepth: 0, burstDepth: 0, glyphScale: 0.49 },
      { depthEnabled: true, launchDepth: 0, burstDepth: 0, glyphScale: '1' },
      { depthEnabled: true, launchDepth: 0, burstDepth: 0, glyphScale: 2.01 },
      { depthEnabled: true, launchDepth: 0, burstDepth: 0, glyphScale: 1, glyphExtent: 0 },
      { depthEnabled: true, launchDepth: 0, burstDepth: 0, glyphScale: 1, glyphExtent: 1.01 }
    ];
    for (const renderHints of invalidHints) {
      const malformed = plan([{
        id: 'bad-depth', beatAtMs: 1000, phase: 'opening', formation: 'single', importance: 'standard',
        shells: [shell('bad-depth-shell', 'airburst', { renderHints })]
      }]);
      expect(() => assertShowPlanV2(malformed)).toThrow(/renderHints|depth|glyphScale/i);
    }
  });

  test('preserves an optional normalized glyph extent without changing flat defaults', () => {
    const renderHints = {
      depthEnabled: true,
      launchDepth: 0,
      burstDepth: 0.82,
      glyphScale: 2,
      glyphExtent: 0.52
    };
    const showPlan = plan([{
      id: 'extent', beatAtMs: 1000, phase: 'finale', formation: 'hero', importance: 'final-wave',
      shells: [shell('extent-shell', 'airburst', { renderHints })]
    }]);

    const runtime = buildShowPlanV2Runtime(showPlan, {
      width: 1920,
      height: 1080,
      playSound: false
    });

    expect(runtime.events.find(event => event.type === 'finale-v2-layer').context.renderHints)
      .toEqual(renderHints);
  });

  test('validates and materializes every colored special-rocket trail voice in one cue manifest', () => {
    const rocketTrail = {
      style: 'spiral',
      colors: ['#5BCEFA', '#F5A9B8', '#FFFFFF']
    };
    const showPlan = plan([{
      id: 'special-trail', beatAtMs: 2000, phase: 'finale', formation: 'single', importance: 'final-wave',
      shells: [shell('special-trail:rocket', 'rocket', { rocketTrail })]
    }]);
    const runtime = buildShowPlanV2Runtime(showPlan, { width: 1920, height: 1080, playSound: false });
    const rocket = runtime.events.find(event => event.type === 'finale-v2-rocket');
    const manifestIds = rocket.correlationManifest.commands
      .filter(command => command.shellId === rocket.shellId)
      .map(command => command.envelopeCommandId);

    expect(rocket.shell.rocketTrail).toEqual(rocketTrail);
    expect(rocket.envelopeCommandIds).toEqual([
      expect.stringMatching(/rocket:body$/),
      expect.stringMatching(/rocket:trail:1$/),
      expect.stringMatching(/rocket:trail:2$/),
      expect.stringMatching(/rocket:trail:3$/)
    ]);
    expect(manifestIds).toEqual(expect.arrayContaining(rocket.envelopeCommandIds));
    expect(Object.isFrozen(rocket.correlationManifest)).toBe(true);
    expect(runtime.peakOptionalCommands).toBe(3);

    for (const malformed of [
      { style: 'laser', colors: ['#FFFFFF'] },
      { style: 'comet', colors: [] },
      { style: 'braided', colors: ['red'] },
      { style: 'spiral', colors: ['#111111', '#222222', '#333333', '#444444', '#555555'] }
    ]) {
      const invalid = plan([{
        id: 'invalid-trail', beatAtMs: 1000, phase: 'opening', formation: 'single', importance: 'standard',
        shells: [shell('invalid-trail:rocket', 'rocket', { rocketTrail: malformed })]
      }]);
      expect(() => assertShowPlanV2(invalid)).toThrow(/rocketTrail/i);
    }
  });

  test('accounts for deterministic depth travel while keeping the burst on the exact planned beat', () => {
    const showPlan = plan([{
      id: 'depth-flight', beatAtMs: 3000, phase: 'opening', formation: 'single', importance: 'standard',
      shells: [shell('depth-rocket', 'rocket', {
        renderHints: { depthEnabled: true, launchDepth: -0.8, burstDepth: 0.8, glyphScale: 1.25 }
      })]
    }], { durationMs: 5000 });

    const first = buildShowPlanV2Runtime(showPlan, { startAt: 1000, width: 1000, height: 1000, playSound: false });
    const second = buildShowPlanV2Runtime(showPlan, { startAt: 1000, width: 1000, height: 1000, playSound: false });
    const rocket = first.events.find(event => event.type === 'finale-v2-rocket');
    const burst = first.events.find(event => event.type === 'finale-v2-layer');

    expect(second).toEqual(first);
    expect(rocket).toMatchObject({
      due: 1241,
      flightDurationMs: 2759,
      renderHints: { depthEnabled: true, launchDepth: -0.8, burstDepth: 0.8, glyphScale: 1.25 }
    });
    expect(rocket.due + rocket.flightDurationMs).toBe(4000);
    expect(burst.due).toBe(4000);
  });

  test('rejects unsupported and malformed plans instead of permitting legacy reinterpretation', () => {
    expect(() => assertShowPlanV2({ planVersion: 3, durationMs: 1000, cues: [] }))
      .toThrow(/unsupported ShowPlan version 3/i);
    expect(() => assertShowPlanV2({ planVersion: 2, durationMs: 1000, materialProfile: 'classic', cues: [{ beatAtMs: 1, shells: [] }] }))
      .toThrow(/phase/i);
    expect(() => assertShowPlanV2({ planVersion: 2, durationMs: 1000, materialProfile: 'classic', cues: [{ beatAtMs: 1, phase: 'opening', formation: 'single', shells: [{ launchMode: 'teleport', layers: [] }] }] }))
      .toThrow(/launch mode/i);
    const unsupportedPrimitive = plan([{
      id: 'bad-primitive', beatAtMs: 500, phase: 'opening', formation: 'single', importance: 'standard',
      shells: [shell('bad-shell', 'airburst', { layers: [layer('bad-layer', { primitive: 'shader' })] })]
    }]);
    expect(() => assertShowPlanV2(unsupportedPrimitive)).toThrow(/primitive/i);
    unsupportedPrimitive.cues[0].shells[0].layers[0] = layer('bad-glyph', { primitive: 'glyph', glyph: 'logo' });
    expect(() => assertShowPlanV2(unsupportedPrimitive)).toThrow(/glyph/i);
    unsupportedPrimitive.cues[0].shells[0].layers[0] = layer('bad-layer-contract', {
      size: 20,
      priority: 'optional',
      trail: 'yes'
    });
    expect(() => assertShowPlanV2(unsupportedPrimitive)).toThrow(/size/i);
  });

  test('constructs distinct rocket, airburst and ground events on exact beats with clipped tails', () => {
    const showPlan = plan([
      {
        id: 'opening', beatAtMs: 500, timeMs: 500, phase: 'opening', formation: 'fan', importance: 'standard',
        shells: [
          shell('rocket', 'rocket', { layers: [layer('rocket:core'), layer('rocket:accent', { delayMs: 100, priority: 'accent' })] }),
          shell('airburst', 'airburst'),
          shell('ground', 'ground')
        ]
      },
      {
        id: 'bridge', beatAtMs: 1700, timeMs: 1700, phase: 'bridge', formation: 'single', importance: 'essential',
        shells: [shell('bridge-shell', 'airburst')]
      },
      {
        id: 'finale', beatAtMs: 2800, timeMs: 2800, phase: 'finale', formation: 'finale-wave-1', importance: 'final-wave',
        shells: [shell('tail', 'airburst', { tier: 'massive', soundRole: 'willow', crackleEnabled: true, layers: [layer('tail:core', { lifetimeMs: 1000 })] })]
      }
    ]);

    const runtime = buildShowPlanV2Runtime(showPlan, {
      startAt: 1000,
      width: 2000,
      height: 1000,
      playSound: true,
      visualStyle: 'stylized-neon'
    });

    const rockets = runtime.events.filter(event => event.type === 'finale-v2-rocket');
    const layers = runtime.events.filter(event => event.type === 'finale-v2-layer');
    const phases = runtime.events.filter(event => event.type === 'finale-v2-phase');
    expect(rockets).toHaveLength(1);
    expect(rockets[0]).toMatchObject({ due: 1000, flightDurationMs: 500, shellId: 'rocket' });
    expect(layers.map(event => [event.shellId, event.due])).toEqual([
      ['rocket', 1500],
      ['airburst', 1500],
      ['ground', 1500],
      ['rocket', 1600],
      ['bridge-shell', 2700],
      ['tail', 3800]
    ]);
    expect(layers.find(event => event.shellId === 'airburst').context).toMatchObject({
      origin: { x: 1500, y: 250 }, target: { x: 1500, y: 250 }, launchMode: 'airburst'
    });
    expect(layers.find(event => event.shellId === 'ground').context).toMatchObject({
      origin: { x: 500, y: 1000 }, target: { x: 1500, y: 250 }, launchMode: 'ground'
    });
    expect(layers.filter(event => event.due === 1500).map(event => event.context.activeLayerLoad)).toEqual([3, 3, 3]);
    expect(layers.find(event => event.shellId === 'tail').layer.lifetimeMs).toBe(200);
    expect(phases.map(event => [event.phase, event.due])).toEqual([
      ['opening', 1500], ['bridge', 2700], ['finale', 3800]
    ]);
    expect(phases.some(event => event.phase === 'breath')).toBe(false);
    expect(runtime.events.at(-1)).toMatchObject({ type: 'finale-complete', due: 4000 });
    expect(runtime).toMatchObject({ layerCount: 6, shellCount: 5, durationMs: 3000 });
  });

  test('groups near-simultaneous rocket voices and one bang/crackle group per cue', () => {
    const nearTarget = { x: 0.4, y: 0.4 };
    const showPlan = plan([{
      id: 'wall', beatAtMs: 2000, timeMs: 2000, phase: 'finale', formation: 'baroque-wall', importance: 'final-wave',
      shells: [
        shell('wall-a', 'rocket', { target: nearTarget, position: nearTarget, tier: 'massive', soundRole: 'brocade', crackleEnabled: true }),
        shell('wall-b', 'rocket', { target: { x: 0.6, y: 0.41 }, position: { x: 0.6, y: 0.41 }, tier: 'massive', soundRole: 'brocade', crackleEnabled: true })
      ]
    }]);

    const runtime = buildShowPlanV2Runtime(showPlan, { startAt: 1000, width: 1000, height: 1000, playSound: true });
    const launchAudio = runtime.events.filter(event => event.type === 'finale-v2-launch-audio');
    const bangAudio = runtime.events.filter(event => event.type === 'finale-v2-bang-audio');
    const crackleAudio = runtime.events.filter(event => event.type === 'finale-v2-crackle-audio');

    expect(launchAudio).toHaveLength(1);
    expect(launchAudio[0].shellIds).toEqual(['wall-a', 'wall-b']);
    expect(bangAudio).toHaveLength(1);
    expect(bangAudio[0]).toMatchObject({ cueId: 'wall', role: 'brocade', tier: 'massive', voiceCount: 2, due: 3000 });
    expect(crackleAudio).toHaveLength(1);
    expect(runtime.audioGroups).toEqual({ launch: 1, bang: 1, crackle: 1 });
    expect(runtime.events.indexOf(runtime.events.find(event => event.type === 'finale-v2-layer')))
      .toBeLessThan(runtime.events.indexOf(bangAudio[0]));
  });

  test('anchors one bang group to the first delayed core layer and falls back to the first layer without a core', () => {
    const mixedPlan = plan([{
      id: 'mixed', beatAtMs: 800, timeMs: 800, phase: 'highlight', formation: 'mixed', importance: 'essential',
      shells: [shell('mixed-shell', 'airburst', {
        layers: [
          layer('mixed:decorative', { delayMs: 200, priority: 'decorative', core: false }),
          layer('mixed:accent', { delayMs: 300, priority: 'accent', core: false }),
          layer('mixed:core', { delayMs: 400 })
        ]
      })]
    }]);
    const mixedRuntime = buildShowPlanV2Runtime(mixedPlan, { startAt: 1000, playSound: true });
    const mixedBang = mixedRuntime.events.filter(event => event.type === 'finale-v2-bang-audio');
    const mixedCore = mixedRuntime.events.find(event => event.type === 'finale-v2-layer' && event.layer.id === 'mixed:core');

    expect(mixedBang).toHaveLength(1);
    expect(mixedBang[0].due).toBe(2200);
    expect(mixedCore.due).toBe(mixedBang[0].due);
    expect(mixedRuntime.events.indexOf(mixedCore)).toBeLessThan(mixedRuntime.events.indexOf(mixedBang[0]));

    const noCorePlan = plan([{
      id: 'no-core', beatAtMs: 900, timeMs: 900, phase: 'highlight', formation: 'mixed', importance: 'standard',
      shells: [shell('no-core-shell', 'airburst', {
        layers: [
          layer('no-core:late', { delayMs: 600, priority: 'decorative', core: false }),
          layer('no-core:first', { delayMs: 400, priority: 'accent', core: false })
        ]
      })]
    }]);
    const noCoreRuntime = buildShowPlanV2Runtime(noCorePlan, { startAt: 1000, playSound: true });
    const noCoreBang = noCoreRuntime.events.filter(event => event.type === 'finale-v2-bang-audio');
    const firstLayer = noCoreRuntime.events.find(event => event.type === 'finale-v2-layer' && event.layer.id === 'no-core:first');

    expect(noCoreBang).toHaveLength(1);
    expect(noCoreBang[0].due).toBe(2300);
    expect(firstLayer.due).toBe(noCoreBang[0].due);
    expect(noCoreRuntime.events.indexOf(firstLayer)).toBeLessThan(noCoreRuntime.events.indexOf(noCoreBang[0]));
  });

  test.each([
    'nishiki-kamuro',
    'aurora-cathedral',
    'royal-brocade',
    'phoenix-ascension',
    'furry-celebration'
  ])('forces premium-realistic runtime material for a manipulated %s snapshot', style => {
    const showPlan = plan([{
      id: `${style}:opening`, beatAtMs: 1000, timeMs: 1000, phase: 'opening', formation: 'single', importance: 'standard',
      shells: [shell(`${style}:shell`, 'rocket')]
    }], { style, materialProfile: 'classic' });
    const runtime = buildShowPlanV2Runtime(showPlan, { startAt: 1000, playSound: false, visualStyle: 'stylized-neon' });

    expect(runtime.events.find(event => event.type === 'finale-v2-rocket').materialProfile).toBe('premium-realistic');
    expect(runtime.events.find(event => event.type === 'finale-v2-layer').context.materialProfile).toBe('premium-realistic');
  });

  test.each([
    ['peony', 'peony'],
    ['chrysanthemum', 'chrysanthemum'],
    ['willow', 'willow'],
    ['cathedral', 'cathedral'],
    ['baroque-wall', 'brocade'],
    ['mine', 'mine'],
    ['wing-fan', 'wings'],
    ['dragon', 'dragon'],
    ['rainbow', 'rainbow']
  ])('resolves the %s preset to the %s audio role', (preset, expected) => {
    const primitive = preset === 'mine' ? 'mine' : 'radial';
    const glyph = preset === 'dragon' ? { primitive: 'glyph', glyph: 'dragon' } : { primitive };
    const cue = {
      id: preset,
      beatAtMs: 1000,
      phase: 'highlight',
      formation: preset,
      importance: preset === 'rainbow' ? 'final-wave' : 'essential',
      shells: [shell(`${preset}-shell`, 'airburst', {
        soundRole: preset,
        layers: [layer(`${preset}-layer`, glyph)]
      })]
    };
    expect(resolveCueAudioProfile(cue).role).toBe(expected);
  });
});

describe('ShowPlanV2 built-in scheduling matrix', () => {
  const expectedShells = {
    'classic-crescendo': [14, 24, 36],
    'symmetric-salute': [16, 26, 40],
    'sky-ballet': [13, 22, 34],
    'thunder-finale': [12, 20, 30],
    'nishiki-kamuro': [12, 20, 30],
    'aurora-cathedral': [14, 23, 34],
    'royal-brocade': [15, 25, 38],
    'phoenix-ascension': [16, 27, 40],
    'furry-celebration': [15, 25, 38]
  };

  test.each([
    ['short', 15, 21, 4000],
    ['medium', 25, 31, 5200],
    ['long', 38, 44, 7000]
  ])('keeps the %s Furry score inside its visible choreography budget',
    (length, shellCount, layerCount, particleBudget) => {
      const showPlan = new FinaleShowPlanner().plan({
        style: 'furry-celebration', length, id: `furry-budget-${length}`, seed: 441, intensity: 7
      });
      const runtime = buildShowPlanV2Runtime(showPlan, {
        startAt: 0, width: 1920, height: 1080, playSound: false
      });
      const particleCount = runtime.events.filter(event => event.type === 'finale-v2-layer')
        .reduce((total, event) => total + event.layer.density, 0);

      expect(runtime.shellCount).toBe(shellCount);
      expect(runtime.layerCount).toBe(layerCount);
      expect(particleCount).toBeLessThanOrEqual(particleBudget);
      expect(runtime.maxLayerCommandsAtBeat).toBeLessThanOrEqual(6);
    });

  test.each([0, 15, 31, 441, 0xffffffff])(
    'selects seeded Furry rocket colors with finale variety for seed %i', seed => {
      const showPlan = new FinaleShowPlanner().plan({
        style: 'furry-celebration', length: 'short', id: 'furry-rocket-colors', seed, intensity: 7
      });
      const runtime = buildShowPlanV2Runtime(showPlan, {
        startAt: 0, width: 1920, height: 1080, playSound: false
      });
      const rockets = runtime.events.filter(event => event.type === 'finale-v2-rocket');
      const finaleShellIds = new Set(showPlan.cues.filter(cue => cue.phase === 'finale')
        .flatMap(cue => cue.shells.map(shellEntry => shellEntry.id)));

      for (const rocket of rockets) {
        expect(rocket.shell.colors[0]).toBe(rocket.shell.palette[rocket.seed % rocket.shell.palette.length]);
      }
      expect(new Set(rockets.filter(rocket => finaleShellIds.has(rocket.shellId))
        .map(rocket => rocket.shell.colors[0])).size).toBeGreaterThanOrEqual(3);
    }
  );

  test('preserves the authored rocket color order outside Furry Celebration', () => {
    const authoredColors = ['#112233', '#445566'];
    const showPlan = plan([{
      id: 'authored-color', beatAtMs: 2000, phase: 'opening', formation: 'single', importance: 'standard',
      shells: [shell('authored-color:rocket', 'rocket', {
        seed: 14,
        palette: ['#E40303', '#FF8C00', '#FFED00'],
        colors: [...authoredColors]
      })]
    }], { style: 'classic-crescendo' });

    const runtime = buildShowPlanV2Runtime(showPlan, { playSound: false });
    const rocket = runtime.events.find(event => event.type === 'finale-v2-rocket');

    expect(rocket.shell.colors).toEqual(authoredColors);
  });

  test.each([
    ['short', 600],
    ['medium', 1000],
    ['long', 1500]
  ])('keeps the real %s Furry runtime silent before the Hero reveal', (length, quietGapMs) => {
    const showPlan = new FinaleShowPlanner().plan({
      style: 'furry-celebration', length, id: `furry-quiet-${length}`, seed: 441, intensity: 7
    });
    const runtime = buildShowPlanV2Runtime(showPlan, {
      startAt: 0, width: 1920, height: 1080, playSound: true
    });
    const heroCue = showPlan.cues.at(-1);
    const heroAt = heroCue.beatAtMs;
    const quietStart = heroAt - quietGapMs;
    const heroShellIds = new Set(heroCue.shells.map(shellEntry => shellEntry.id));
    const heroLaunchEvents = runtime.events.filter(event =>
      (event.type === 'finale-v2-rocket' && heroShellIds.has(event.shellId))
      || (event.type === 'finale-v2-launch-audio'
        && event.shellIds.some(shellId => heroShellIds.has(shellId))));
    const forbiddenTypes = new Set([
      'finale-v2-rocket',
      'finale-v2-launch-audio',
      'finale-v2-bang-audio',
      'finale-v2-crackle-audio',
      'finale-v2-layer'
    ]);
    const activeEnd = event => {
      if (event.type === 'finale-v2-rocket') return event.due + event.flightDurationMs;
      if (event.type === 'finale-v2-layer') return event.due + event.layer.lifetimeMs;
      if (event.type === 'finale-v2-crackle-audio') return event.due + event.maxDurationMs;
      return event.due;
    };
    const quietIntervalActivity = runtime.events.filter(event => forbiddenTypes.has(event.type))
      .filter(event => !(
        (event.type === 'finale-v2-rocket' && heroShellIds.has(event.shellId))
        || (event.type === 'finale-v2-launch-audio'
          && event.shellIds.some(shellId => heroShellIds.has(shellId)))
      ))
      .filter(event => (
        (event.due >= quietStart && event.due < heroAt)
        || (event.due < heroAt && activeEnd(event) > quietStart)
      ));

    expect(heroCue.shells).toHaveLength(1);
    expect(heroCue.shells[0].launchMode).toBe('rocket');
    expect(heroLaunchEvents.map(event => event.type)).toEqual([
      'finale-v2-rocket',
      'finale-v2-launch-audio'
    ]);
    expect(heroLaunchEvents[0].due + heroLaunchEvents[0].flightDurationMs).toBe(heroAt);
    expect(quietIntervalActivity).toEqual([]);
  });

  test.each(FINALE_STYLES.flatMap(style => FINALE_LENGTHS.map((length, index) => [style, length, index]))) (
    '%s/%s schedules deterministically with exact shell count, duration and command budget',
    (style, length, lengthIndex) => {
      const showPlan = new FinaleShowPlanner().plan({ style, length, id: `${style}-${length}`, seed: 441, intensity: 7 });
      const first = buildShowPlanV2Runtime(showPlan, { startAt: 5000, width: 1920, height: 1080, playSound: true });
      const second = buildShowPlanV2Runtime(showPlan, { startAt: 5000, width: 1920, height: 1080, playSound: true });
      expect(second).toEqual(first);
      expect(first.shellCount).toBe(expectedShells[style][lengthIndex]);
      expect(first.durationMs).toBe({ short: 10000, medium: 18000, long: 28000 }[length]);
      expect(first.completeAt).toBe(5000 + first.durationMs);
      expect(first.maxLayerCommandsAtBeat).toBeLessThanOrEqual(28);
      expect(first.events.filter(event => event.type === 'finale-v2-layer')).toHaveLength(first.layerCount);
      expect(first.events.every(event => event.due <= first.completeAt)).toBe(true);
    }
  );
});
