'use strict';

const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');

const {
  SHAPE_IDS,
  V2_PRIMITIVE_IDS,
  V2_GLYPH_IDS,
  ROCKET_VARIANTS,
  ENVELOPE_FLAG_BITS,
  ENVELOPE_PROFILES,
  classifyEnvelopeCommand,
  getEnvelopeProfile,
  projectVisualEnvelope,
  fitCorrelatedCommands,
  applyCorrelationTransform,
} = require('../plugins/webgpu-fireworks/gpu/visible-envelope');

const RESOLUTIONS = [
  { width: 960, height: 540 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
  { width: 540, height: 960 },
  { width: 1080, height: 1920 },
  { width: 2160, height: 3840 },
];

const shapeCommand = (shape, viewport, depth = 0, x = 0.5) => ({
  kind: 2,
  shape,
  flags: shape >= 10 ? ENVELOPE_FLAG_BITS.V2_MARKER | ENVELOPE_FLAG_BITS.TRAIL : 0,
  textureIndex: 0,
  origin: { x: viewport.width * x, y: viewport.height * 0.02 },
  target: { x: viewport.width * x, y: viewport.height * 0.02 },
  burstDepth: depth,
  size: 48,
  intensity: 1,
  particleDuration: 2.5,
  emissionDelay: 0,
  gravity: 90,
  drag: 0.985,
  wind: 0,
  turbulence: 24,
  trailLength: 0.5,
  glowRadius: 14,
  bloomRadius: 22,
});

const rocketCommand = (variant = 'standard', overrides = {}) => ({
  kind: 1,
  shape: variant === 'decal' ? 6 : 8,
  flags: variant === 'avatar-head' ? ENVELOPE_FLAG_BITS.ROCKET_AVATAR_HEAD : 0,
  textureIndex: variant === 'standard' ? 0 : 3,
  origin: { x: 540, y: 1910 },
  target: { x: 540, y: 18 },
  launchDepth: 1,
  burstDepth: 1,
  size: 22,
  particleDuration: 1.2,
  duration: 1.2,
  emissionDelay: 0,
  trailLength: 0.8,
  glowRadius: 14,
  bloomRadius: 22,
  ...overrides,
});

describe('WebGPU Fireworks visible-envelope contract', () => {
  test('registers one conservative profile for every shape and real rocket variant', () => {
    expect(SHAPE_IDS).toEqual(Array.from({ length: 27 }, (_, index) => index));
    expect(Object.values(V2_PRIMITIVE_IDS)).toEqual([10, 11, 12, 13, 14, 15, 16]);
    expect(Object.values(V2_GLYPH_IDS)).toEqual([17, 18, 19, 20, 21, 22, 23, 24, 25, 26]);
    expect(ROCKET_VARIANTS).toEqual(['standard', 'avatar-head', 'decal']);
    expect(Object.isFrozen(ENVELOPE_PROFILES)).toBe(true);
    expect(ENVELOPE_FLAG_BITS).toMatchObject({
      TRAIL: 1 << 0,
      SPLIT_REQUESTED: 1 << 1,
      STROBE: 1 << 3,
      ROCKET_AVATAR_HEAD: 1 << 14,
      V2_MARKER: 1 << 15,
    });
    SHAPE_IDS.forEach(shapeId => {
      const command = { kind: 2, shape: shapeId, flags: 0, textureIndex: 0 };
      expect(classifyEnvelopeCommand(command)).toEqual({ category: 'shape', shapeId });
      expect(getEnvelopeProfile(command)).toMatchObject({ shapeId });
    });
    ROCKET_VARIANTS.forEach(variant => {
      const command = rocketCommand(variant);
      expect(classifyEnvelopeCommand(command)).toEqual({ category: 'rocket', variant });
      expect(getEnvelopeProfile(command)).toMatchObject({ variant });
    });
  });

  test('fits the exact 6 x 3 x 30 complete-envelope registry matrix', () => {
    let testedCases = 0;
    for (const viewport of RESOLUTIONS) {
      for (const depth of [-1, 0, 1]) {
        const commands = [
          ...SHAPE_IDS.map(shapeId => shapeCommand(shapeId, viewport, depth)),
          ...ROCKET_VARIANTS.map(variant => rocketCommand(variant, {
            origin: { x: viewport.width * 0.5, y: viewport.height * 1.02 },
            target: { x: viewport.width * 0.5, y: viewport.height * 0.12 },
            launchDepth: depth,
            burstDepth: depth,
          })),
        ];
        for (const command of commands) {
          const fitted = fitCorrelatedCommands([command], viewport, { paddingPx: 2 });
          const bounds = projectVisualEnvelope(fitted.commands[0], viewport);
          expect(fitted.strategy).toMatch(/^(none|translate|uniform-scale)$/);
          expect(bounds.left).toBeGreaterThanOrEqual(2 - 1e-5);
          expect(bounds.top).toBeGreaterThanOrEqual(2 - 1e-5);
          expect(bounds.right).toBeLessThanOrEqual(viewport.width - 2 + 1e-5);
          expect(bounds.bottom).toBeLessThanOrEqual(viewport.height - 2 + 1e-5);
          expect(fitted.vertexClampApplied).toBe(false);
          testedCases += 1;
        }
      }
    }
    expect(testedCases).toBe(540);
  });

  test.each(['star', 'ring'])('%s retains a single correlated transform', name => {
    const shape = name === 'star' ? 3 : 4;
    const viewport = { width: 1080, height: 1920 };
    const commands = [shapeCommand(shape, viewport, 1, 0.45), shapeCommand(shape, viewport, 1, 0.55)];
    const fitted = fitCorrelatedCommands(commands, viewport, { paddingPx: 2 });
    const transforms = fitted.commands.map((command, index) => ({
      dx: command.origin.x - commands[index].origin.x,
      dy: command.origin.y - commands[index].origin.y,
      scale: command.admissionScale,
    }));
    expect(new Set(transforms.map(item => item.dx)).size).toBe(1);
    expect(new Set(transforms.map(item => item.dy)).size).toBe(1);
    expect(new Set(transforms.map(item => item.scale)).size).toBe(1);
    expect(fitted.vertexClampApplied).toBe(false);
    expect(applyCorrelationTransform(commands, fitted)).toEqual(fitted.commands);
  });

  test('includes complete standard rocket body, flame, trail, glow, and bloom at the upper edge', () => {
    const viewport = { width: 1080, height: 1920 };
    const fitted = fitCorrelatedCommands([rocketCommand('standard')], viewport, { paddingPx: 2 });
    const bounds = projectVisualEnvelope(fitted.commands[0], viewport);
    expect(bounds.components).toEqual(expect.arrayContaining(['body', 'flame', 'trail', 'glow', 'bloom']));
    expect(bounds.top).toBeGreaterThanOrEqual(2 - 1e-5);
  });

  test.each(RESOLUTIONS)(
    'keeps a correlated rocket and star/ring burst at least eight-percent-class below the top at $width x $height',
    viewport => {
      const engine = new WebGPUParticleEngine({ width: viewport.width, height: viewport.height });
      const target = { x: viewport.width * 0.5, y: viewport.height * 0.1 };
      const rocketBody = rocketCommand('standard', {
        origin: { x: viewport.width * 0.5, y: viewport.height * 1.02 },
        target,
        launchDepth: 0.8,
        burstDepth: 0.8,
        size: 22,
      });
      const rocketFlame = rocketCommand('standard', {
        ...rocketBody,
        size: 16.72,
        flags: 2 << 8,
      });
      const bursts = [3, 4].map(shape => shapeCommand(shape, viewport, 0.8));
      bursts.forEach(command => {
        command.origin = { ...target };
        command.target = { ...target };
        command.particleDuration = 0.65;
        command.intensity = 0.5;
      });
      const commands = [rocketBody, rocketFlame, ...bursts];
      const padding = engine._visibleEnvelopePaddingPx(commands);
      const fitted = fitCorrelatedCommands(commands, viewport, { paddingPx: padding });

      expect(padding / viewport.height).toBeGreaterThanOrEqual(0.075);
      expect(fitted.bounds.top).toBeGreaterThanOrEqual(padding - 1e-5);
      expect(fitted.commands).toHaveLength(commands.length);
      expect(fitted.vertexClampApplied).toBe(false);
    }
  );

  test('keeps the authored Boykisser hero extent when correlated with its below-canvas rocket', () => {
    const viewport = { width: 1080, height: 1920 };
    const engine = new WebGPUParticleEngine({ width: viewport.width, height: viewport.height });
    const target = { x: viewport.width * 0.5, y: viewport.height * 0.38 };
    const rocket = rocketCommand('standard', {
      origin: { x: viewport.width * 0.5, y: viewport.height * 1.04 },
      target,
      launchDepth: 0,
      burstDepth: 0.82,
      particleDuration: 1.835,
      duration: 1.835,
      size: 22,
    });
    const hero = {
      kind: 2,
      shape: V2_GLYPH_IDS.boykisser,
      flags: ENVELOPE_FLAG_BITS.V2_MARKER,
      textureIndex: 0,
      origin: target,
      target,
      burstDepth: 0.82,
      size: 6,
      intensity: 5.33,
      particleDuration: 1.2,
      emissionDelay: 0,
      gravity: 8.4,
      drag: 0.035,
      wind: 0,
      viewportMaterialization: {
        kind: 'v2-layer',
        glyphExtent: 0.84,
      },
    };
    const commands = [rocket, hero];
    const padding = engine._visibleEnvelopePaddingPx(commands);
    const fitted = fitCorrelatedCommands(commands, viewport, { paddingPx: padding });
    const heroBounds = projectVisualEnvelope(fitted.commands[1], viewport);

    expect(fitted.scale).toBeGreaterThan(0.65);
    expect(heroBounds.components).toContain('authored-glyph-extent');
    expect(fitted.bounds.top).toBeGreaterThanOrEqual(padding - 1e-5);
    expect(fitted.bounds.right).toBeLessThanOrEqual(viewport.width - padding + 1e-5);
    expect(fitted.bounds.bottom).toBeLessThanOrEqual(viewport.height - padding + 1e-5);
    expect(fitted.bounds.left).toBeGreaterThanOrEqual(padding - 1e-5);
  });

  test('fits rocket side guards across the complete below-canvas launch path', () => {
    const viewport = { width: 540, height: 960 };
    const command = rocketCommand('standard', {
      origin: { x: 43.2, y: 979.2 },
      target: { x: 270, y: 115.2 },
      launchDepth: 1,
      burstDepth: 1,
      size: 18,
      curve: 48,
    });
    const fitted = fitCorrelatedCommands([command], viewport, { paddingPx: 2 });
    const bounds = projectVisualEnvelope(fitted.commands[0], viewport);
    const launchPerspective = 4 / 3;
    const projectedLaunchX = viewport.width * 0.5 +
      (fitted.commands[0].origin.x - viewport.width * 0.5) * launchPerspective;
    const bodyAndCurveLeft = projectedLaunchX -
      (fitted.commands[0].size * 1.42 + Math.abs(fitted.commands[0].curve)) * launchPerspective;

    expect(bounds.left).toBeGreaterThanOrEqual(2 - 1e-5);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width - 2 + 1e-5);
    expect(bodyAndCurveLeft).toBeGreaterThanOrEqual(2 - 1e-5);
  });

  test('treats a launch on the exact bottom edge as below-canvas', () => {
    const viewport = { width: 1080, height: 1920 };
    const target = { x: 540, y: 864 };
    const rocket = rocketCommand('standard', {
      origin: { x: 540, y: viewport.height },
      target,
      size: 8,
      curve: -63,
      particleDuration: 1.2375,
      duration: 1.2375,
    });
    const burst = shapeCommand(3, viewport, 0, 0.5);
    Object.assign(burst, {
      origin: target,
      target,
      size: 39.69,
      intensity: 1.5,
      particleDuration: 0.65,
    });

    const fitted = fitCorrelatedCommands([rocket, burst], viewport, { paddingPx: 108 });
    const [fittedRocket, fittedBurst] = fitted.commands;

    expect(fitted.translation).toEqual({ dx: 0, dy: 0 });
    expect(fittedBurst.origin).toEqual(target);
    expect(fittedRocket.target).toEqual(fittedBurst.origin);
  });

  test('uses target depth response for target-only vertical rocket bounds', () => {
    const viewport = { width: 960, height: 540 };
    const commands = [
      rocketCommand('standard', {
        origin: { x: 480, y: 68 }, target: { x: 480, y: 68 },
        launchDepth: -1, burstDepth: 1, size: 10,
      }),
      rocketCommand('standard', {
        origin: { x: 480, y: 380 }, target: { x: 480, y: 380 },
        launchDepth: 1, burstDepth: 1, size: 10,
      }),
    ];
    const fitted = fitCorrelatedCommands(commands, viewport, { paddingPx: 2 });

    expect(fitted.scale).toBeCloseTo(1, 7);
    fitted.commands.forEach(command => {
      const bounds = projectVisualEnvelope(command, viewport);
      expect(bounds.top).toBeGreaterThanOrEqual(2 - 1e-5);
      expect(bounds.bottom).toBeLessThanOrEqual(viewport.height - 2 + 1e-5);
    });
  });

  test('fails closed for an unregistered shape instead of center-admitting it', () => {
    let error;
    try {
      getEnvelopeProfile({ kind: 2, shape: 99, flags: 0, textureIndex: 0 });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: 'UNREGISTERED_VISIBLE_ENVELOPE' });
  });
});
