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

describe('ShowPlanV2 pure overlay runtime', () => {
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
