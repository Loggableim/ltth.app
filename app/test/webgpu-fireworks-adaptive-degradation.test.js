'use strict';

const {
  DEGRADATION_KEYS,
  deriveAdaptiveDegradationPolicy,
  degradeLayerForPolicy
} = require('../plugins/webgpu-fireworks/gpu/spawn-command-policy');
const { WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');

const layer = overrides => ({
  id: 'show:cue:1:shell:1:layer:1',
  primitive: 'crossette',
  delayMs: 125,
  density: 100,
  size: 1,
  lifetimeMs: 900,
  gravity: 0.8,
  drag: 0.04,
  trail: true,
  split: true,
  strobe: true,
  colors: ['#112233'],
  priority: 'core',
  core: true,
  ...overrides
});

const expectedPolicy = [
  { tier: 0, strobeEnabled: true, splitQuality: 3, decorativeDensityScale: 1, accentDensityScale: 1, coreDensityScale: 1 },
  { tier: 1, strobeEnabled: false, splitQuality: 3, decorativeDensityScale: 1, accentDensityScale: 1, coreDensityScale: 1 },
  { tier: 2, strobeEnabled: false, splitQuality: 3, decorativeDensityScale: 1, accentDensityScale: 0.65, coreDensityScale: 1 },
  { tier: 3, strobeEnabled: false, splitQuality: 3, decorativeDensityScale: 1, accentDensityScale: 0, coreDensityScale: 1 },
  { tier: 4, strobeEnabled: false, splitQuality: 3, decorativeDensityScale: 0.5, accentDensityScale: 0, coreDensityScale: 1 },
  { tier: 5, strobeEnabled: false, splitQuality: 3, decorativeDensityScale: 0, accentDensityScale: 0, coreDensityScale: 1 },
  { tier: 6, strobeEnabled: false, splitQuality: 1, decorativeDensityScale: 0, accentDensityScale: 0, coreDensityScale: 1 },
  { tier: 7, strobeEnabled: false, splitQuality: 1, decorativeDensityScale: 0, accentDensityScale: 0, coreDensityScale: 0.7 }
];

describe('WebGPU Fireworks adaptive layer degradation', () => {
  test.each([
    [0, 'normal', 0.20, 4],
    [1, 'normal', 0.50, 4],
    [2, 'normal', 0.65, 4],
    [3, 'normal', 0.75, 4],
    [4, 'normal', 0.84, 4],
    [5, 'normal', 0.92, 4],
    [6, 'normal', 0.97, 4],
    [7, 'normal', 0.995, 4],
    [2, 'reduced', 0.20, 4],
    [5, 'minimal', 0.20, 4],
    [6, 'toaster', 0.20, 4],
    [1, 'normal', 0.20, 10],
    [2, 'normal', 0.20, 14],
    [3, 'normal', 0.20, 18],
    [4, 'normal', 0.20, 22],
    [5, 'normal', 0.20, 26],
    [6, 'normal', 0.20, 29],
    [7, 'normal', 0.20, 31]
  ])('maps mode/load pressure to deterministic tier %i', (tier, performanceMode, activeParticleRatio, activeLayerLoad) => {
    expect(deriveAdaptiveDegradationPolicy({
      performanceMode,
      activeParticleRatio,
      activeLayerLoad
    })).toMatchObject(expectedPolicy[tier]);
  });

  test('applies the degradation steps in order without changing core timing or geometry', () => {
    const source = layer();
    const results = expectedPolicy.map((_, tier) => degradeLayerForPolicy(source, { ...expectedPolicy[tier] }));

    expect(results[0]).toMatchObject({ layer: { density: 100, strobe: true }, splitQuality: 3, changes: [] });
    expect(results[1]).toMatchObject({ layer: { density: 100, strobe: false }, splitQuality: 3, changes: ['strobeDisabled'] });
    expect(results[2]).toMatchObject({ layer: { density: 100, strobe: false }, splitQuality: 3 });
    expect(results[2].changes).toEqual(['strobeDisabled']);
    expect(results[5]).toMatchObject({ layer: { density: 100, strobe: false }, splitQuality: 3 });
    expect(results[5].changes).toEqual(['strobeDisabled']);
    expect(results[6]).toMatchObject({ layer: { density: 100, strobe: false }, splitQuality: 1 });
    expect(results[6].changes).toEqual(['strobeDisabled', 'splitReduced']);
    expect(results[7]).toMatchObject({ layer: { density: 70, strobe: false }, splitQuality: 1 });
    expect(results[7].changes).toEqual(['strobeDisabled', 'splitReduced', 'coreDensityReduced']);

    for (const result of results) {
      expect(result.layer).not.toBeNull();
      expect(result.layer).toMatchObject({
        id: source.id,
        primitive: source.primitive,
        delayMs: source.delayMs,
        size: source.size,
        lifetimeMs: source.lifetimeMs,
        gravity: source.gravity,
        drag: source.drag,
        colors: source.colors,
        priority: 'core',
        core: true
      });
    }
  });

  test('reduces accent then decorative layers before reducing split density', () => {
    const decorative = layer({ priority: 'decorative', core: false, density: 40 });
    const accent = layer({ priority: 'accent', core: false, density: 40 });

    expect(degradeLayerForPolicy(accent, expectedPolicy[2])).toMatchObject({
      layer: { density: 26 },
      splitQuality: 3,
      changes: ['strobeDisabled', 'accentReduced']
    });
    expect(degradeLayerForPolicy(accent, expectedPolicy[3])).toMatchObject({
      layer: null,
      splitQuality: 3,
      changes: ['strobeDisabled', 'accentOmitted']
    });
    expect(degradeLayerForPolicy(decorative, expectedPolicy[3]).layer.density).toBe(40);
    expect(degradeLayerForPolicy(decorative, expectedPolicy[4])).toMatchObject({
      layer: { density: 20 },
      splitQuality: 3,
      changes: ['strobeDisabled', 'decorativeReduced']
    });
    expect(degradeLayerForPolicy(decorative, expectedPolicy[5])).toMatchObject({
      layer: null,
      splitQuality: 3,
      changes: ['strobeDisabled', 'decorativeOmitted']
    });
  });

  test('reports degradation telemetry in the configured quality-loss order', () => {
    expect(DEGRADATION_KEYS).toEqual([
      'strobeDisabled',
      'accentReduced',
      'accentOmitted',
      'decorativeReduced',
      'decorativeOmitted',
      'splitReduced',
      'coreDensityReduced'
    ]);
  });

  test('never removes a core shell command even at maximum pressure', () => {
    const result = degradeLayerForPolicy(layer({ density: 1 }), expectedPolicy[7]);
    expect(result.layer).toMatchObject({ density: 1, priority: 'core' });
    expect(result.layer).not.toBeNull();
  });

  test('keeps cue timing, formation, shell count and shell geometry identical across policies', () => {
    const plan = {
      cues: [{
        beatAtMs: 1200,
        formation: 'mirror',
        shells: [
          { id: 'left', origin: { x: 0.2, y: 1 }, target: { x: 0.3, y: 0.4 }, layers: [layer()] },
          { id: 'right', origin: { x: 0.8, y: 1 }, target: { x: 0.7, y: 0.4 }, layers: [layer()] }
        ]
      }]
    };
    const invariant = value => value.cues.map(cue => ({
      beatAtMs: cue.beatAtMs,
      formation: cue.formation,
      shells: cue.shells.map(shell => ({ id: shell.id, origin: shell.origin, target: shell.target }))
    }));

    for (const policy of expectedPolicy) {
      const degraded = {
        ...plan,
        cues: plan.cues.map(cue => ({
          ...cue,
          shells: cue.shells.map(shell => ({
            ...shell,
            layers: shell.layers.map(item => degradeLayerForPolicy(item, policy).layer).filter(Boolean)
          }))
        }))
      };
      expect(invariant(degraded)).toEqual(invariant(plan));
    }
  });

  test('derives runtime policy from configured mode, active-particle ratio and CPU layer load only', () => {
    const runtime = Object.create(WebGPUFireworksEngine.prototype);
    runtime.config = { toasterMode: false, maxTotalParticles: 1000 };
    runtime.performanceMode = 'normal';
    runtime.renderer = {
      getMetrics: jest.fn(() => ({ activeParticles: 650, droppedParticles: 999999 }))
    };

    expect(runtime.getAdaptiveLayerPolicy(4)).toMatchObject(expectedPolicy[2]);
    expect(runtime.getAdaptiveLayerPolicy(22)).toMatchObject(expectedPolicy[4]);

    runtime.renderer.getMetrics.mockReturnValue({ activeParticles: 10, droppedParticles: 999999999 });
    expect(runtime.getAdaptiveLayerPolicy(4)).toMatchObject(expectedPolicy[0]);

    runtime.config.toasterMode = true;
    expect(runtime.getAdaptiveLayerPolicy(4)).toMatchObject(expectedPolicy[6]);
  });
});
