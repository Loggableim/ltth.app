'use strict';

const crypto = require('crypto');
const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');
const { FinaleShowPlanner } = require('../plugins/webgpu-fireworks/lib/finale-show-planner');
const { buildShowPlanV2Runtime } = require('../plugins/webgpu-fireworks/gpu/show-plan-v2-runtime');

const makeEngine = (width = 1920, height = 1080) => {
  const engine = new WebGPUParticleEngine({ width, height }, {});
  engine.initialized = true;
  return engine;
};

const layer = overrides => ({
  id: 'show:long:cue:1:shell:1:layer:1',
  primitive: 'radial',
  delayMs: 0,
  density: 48,
  size: 1,
  lifetimeMs: 900,
  gravity: 0.8,
  drag: 0.04,
  trail: true,
  split: true,
  strobe: true,
  colors: ['#11223344', '#55667788', '#99aabbcc', '#ddeeff00'],
  priority: 'core',
  core: true,
  ...overrides
});

const uploadCommands = engine => {
  let uploaded;
  engine.device = { queue: { writeBuffer: jest.fn((buffer, offset, raw) => { uploaded = raw; }) } };
  engine.buffers = { commands: {} };
  const result = engine._uploadSpawnCommands();
  return { result, uploaded, words: new Uint32Array(uploaded) };
};

describe('WebGPU Fireworks ShowPlanV2 GPU command contract', () => {
  test('queues one compact command for a four-color V2 layer', () => {
    const engine = makeEngine();

    expect(engine.spawnLayer(layer(), {
      origin: { x: 960, y: 320 },
      seed: 77,
      effectId: 'layer-effect',
      materialProfile: 'classic',
      visualStyle: 'realistic'
    })).toBe(true);

    expect(engine.spawnQueue).toHaveLength(1);
    expect(engine.spawnQueue[0]).toMatchObject({
      shape: 10,
      count: 48,
      colorCount: 4,
      packedColors: [0x44332211, 0x88776655, 0xccbbaa99, 0x00ffeedd]
    });
  });

  test.each([
    ['radial', null, 10], ['ring', null, 11], ['spiral', null, 12],
    ['palm', null, 13], ['crossette', null, 14], ['comet', null, 15],
    ['mine', null, 16], ['glyph', 'paw', 17], ['glyph', 'heart', 18],
    ['glyph', 'star', 19], ['glyph', 'fox-head', 20], ['glyph', 'wolf-head', 21],
    ['glyph', 'dragon', 22], ['glyph', 'dragon-wing', 23], ['glyph', 'tail', 24]
  ])('maps V2 %s/%s to stable primitive ID %i', (primitive, glyph, expected) => {
    const engine = makeEngine();
    engine.spawnLayer(layer({ primitive, ...(glyph ? { glyph } : {}) }), {
      origin: { x: 960, y: 320 }, seed: 11, materialProfile: 'classic'
    });
    expect(engine.spawnQueue[0].shape).toBe(expected);
  });

  test('uploads one 112-byte command with all four packed RGBA colors and count', () => {
    const engine = makeEngine();
    engine.spawnLayer(layer(), { origin: { x: 960, y: 320 }, seed: 77, materialProfile: 'classic' });

    const { result, uploaded, words } = uploadCommands(engine);
    expect(result).toEqual({ count: 1, maxParticles: 48 });
    expect(uploaded.byteLength).toBe(112);
    expect(Array.from(words.slice(4, 8))).toEqual([
      0x44332211, 0x88776655, 0xccbbaa99, 0x00ffeedd
    ]);
    expect(words[27]).toBe(4);
  });

  test('packs deterministic launch and burst depth into word 27 without changing the 112-byte ABI', () => {
    const engine = makeEngine();
    engine.spawnLayer(layer(), {
      origin: { x: 960, y: 320 }, seed: 77, materialProfile: 'classic',
      renderHints: { depthEnabled: true, launchDepth: -0.8, burstDepth: 0.8, glyphScale: 1 }
    });

    const { uploaded, words } = uploadCommands(engine);
    expect(uploaded.byteLength).toBe(112);
    expect(words[27]).toBe((4 | (1 << 3) | (26 << 8) | (230 << 16)) >>> 0);
    expect(engine.spawnQueue).toHaveLength(0);
  });

  test('applies glyphScale on CPU geometry without scaling non-glyph primitives', () => {
    const hints = { depthEnabled: true, launchDepth: 0, burstDepth: 0.5, glyphScale: 1.5 };
    const glyph = makeEngine();
    glyph.spawnLayer(layer({ primitive: 'glyph', glyph: 'paw' }), {
      origin: { x: 960, y: 320 }, seed: 77, materialProfile: 'classic', renderHints: hints
    });
    const radial = makeEngine();
    radial.spawnLayer(layer(), {
      origin: { x: 960, y: 320 }, seed: 77, materialProfile: 'classic', renderHints: hints
    });

    expect(glyph.spawnQueue[0].intensity).toBe(radial.spawnQueue[0].intensity * 1.5);
    expect(glyph.spawnQueue[0]).toMatchObject({
      depthEnabled: true,
      launchDepth: 0,
      burstDepth: 0.5
    });
  });

  test.each([[1920, 1080], [1080, 1920]])(
    'sizes the queued Furry hero to the safe viewport extent at %ix%i independently of finale intensity',
    (width, height) => {
      const commands = [1, 5, 10].map(intensity => {
        const showPlan = new FinaleShowPlanner().plan({
          id: `hero-${width}-${height}-${intensity}`,
          style: 'furry-celebration',
          length: 'medium',
          orientation: width > height ? 'landscape' : 'portrait',
          intensity,
          seed: 417
        });
        const runtime = buildShowPlanV2Runtime(showPlan, { width, height, playSound: false });
        const heroEvent = runtime.events.filter(event => event.type === 'finale-v2-layer')
          .findLast(event => event.layer.glyph === 'boykisser');
        const engine = makeEngine(width, height);
        expect(engine.spawnLayer(heroEvent.layer, heroEvent.context)).toBe(true);
        return engine.spawnQueue[0];
      });

      expect(new Set(commands.map(command => command.intensity)).size).toBe(1);
      for (const command of commands) {
        expect(command.origin).toEqual({ x: width / 2, y: height / 2 });
        expect(command.burstDepth).toBe(0.82);
        const midpointSeconds = command.particleDuration * 0.5;
        const decay = command.drag * 60;
        const displacement = (1 - Math.exp(-decay * midpointSeconds)) / decay;
        const perspective = 4 / (4 - command.burstDepth);
        const particleRadius = command.size * perspective;
        const xRadius = 0.9 * 218 * command.intensity * displacement * perspective;
        const visibleWidth = xRadius * 2 + particleRadius * 2;
        expect(visibleWidth / width).toBeGreaterThanOrEqual(0.5);
        expect(visibleWidth / width).toBeLessThanOrEqual(0.65);

        const yRadius = 0.86 * 218 * command.intensity * displacement * perspective;
        const gravityDisplacement = command.gravity / decay * (midpointSeconds - displacement);
        const projectedCenterY = height / 2 + gravityDisplacement * perspective;
        expect(projectedCenterY - yRadius - particleRadius).toBeGreaterThanOrEqual(0);
        expect(projectedCenterY + yRadius + particleRadius).toBeLessThanOrEqual(height);
      }
    }
  );

  test('uses alignment-safe XYZ particle and trail layouts with calibrated projection and planar glyphs', () => {
    const engine = makeEngine();
    const resources = engine._createResources.toString();
    const compute = engine._computeShader();
    const particle = engine._particleShader();

    expect(resources).toContain('const particleStride = 96');
    expect(resources).toContain('this.maxTrailSamples * 16');
    expect(compute).toContain('position: vec3f, velocity: vec3f');
    expect(compute).toContain('history: array<vec3f>');
    expect(compute).toContain('fn shapeVelocity(shape: u32, index: u32, count: u32, intensity: f32, seed: u32, depthEnabled: bool) -> vec3f');
    expect(compute).toContain('let volumetric = depthEnabled && shape != 11u && (shape < 17u || shape > 24u)');
    expect(particle).toContain('position: vec3f, velocity: vec3f');
    expect(particle).toContain('history: array<vec3f>');
    expect(particle).toContain('const CAMERA_DISTANCE = 4.0');
    expect(particle).toContain('fn perspectiveScale(z: f32) -> f32');
    expect(particle).toContain('max(2.0, CAMERA_DISTANCE - z)');
  });

  test('draws transparent depth buckets far to mid to near without a depth buffer', () => {
    const engine = makeEngine();
    engine.trailsEnabled = true;
    engine.glowEnabled = true;
    engine.pipelines = { trail: 'trail', glow: 'glow', core: 'core' };
    engine.buffers = { trailIndirect: 'trail-indirect', coreIndirect: 'core-indirect' };
    const pass = { setPipeline: jest.fn(), drawIndirect: jest.fn() };

    engine._drawDepthBuckets(pass);

    expect(pass.drawIndirect.mock.calls).toEqual([
      ['trail-indirect', 0], ['core-indirect', 0], ['core-indirect', 0],
      ['trail-indirect', 16], ['core-indirect', 16], ['core-indirect', 16],
      ['trail-indirect', 32], ['core-indirect', 32], ['core-indirect', 32]
    ]);
    expect(engine._createPipelines.toString()).not.toContain('depthStencil');
    expect(engine._computeShader()).toContain('fn depthBucket(z: f32) -> u32');
  });

  test('forces premium-realistic V2 material to style ID 3 without renumbering legacy styles', () => {
    const engine = makeEngine();
    expect(['premium-hybrid', 'realistic', 'stylized-neon'].map(style => engine._styleId(style)))
      .toEqual([0, 1, 2]);

    engine.spawnLayer(layer(), {
      origin: { x: 960, y: 320 },
      seed: 33,
      materialProfile: 'premium-realistic',
      visualStyle: 'stylized-neon'
    });

    expect((engine.spawnQueue[0].flags >> 12) & 3).toBe(3);
    expect(engine._particleShader()).toContain('fn premiumRealisticMaterial');
    expect(engine._particleShader()).toContain('if(style==3u)');
  });

  test('keeps legacy shape/style IDs and one/two/four-color command bytes frozen', () => {
    const expectedShapes = {
      burst: 0, heart: 1, paws: 2, paw: 2, star: 3,
      ring: 4, spiral: 5, image: 6, sparkle: 7, rocket: 8, smoke: 9
    };
    const expectedUploads = [
      { colors: ['#11223344'], bytes: 112, hash: '9858dd44d1e682b90506ffe69102d33fbe090e39ecbad9cd133b88c28537acdc' },
      { colors: ['#11223344', '#55667788'], bytes: 224, hash: 'c083b48c37b67b8628f80474c2c46d0342e3326e762136cbab28bba825a9c414' },
      { colors: ['#11223344', '#55667788', '#99aabbcc', '#ddeeff00'], bytes: 448, hash: '72ded2afb49a4d344847b2e347b11d999b8bf3a36bf1c3028ee6a91b094fd7a8' }
    ];

    for (const [name, id] of Object.entries(expectedShapes)) {
      expect(makeEngine()._shapeId(name)).toBe(id);
    }
    expect(['premium-hybrid', 'realistic', 'stylized-neon'].map(style => makeEngine()._styleId(style)))
      .toEqual([0, 1, 2]);

    for (const fixture of expectedUploads) {
      const engine = makeEngine();
      engine.spawnExplosion({
        effectId: 'legacy-golden', seed: 123, shape: 'heart', count: 36,
        colors: fixture.colors, origin: { x: 960, y: 320 }, duration: 1.25,
        size: 23, gravity: 84, drag: 0.982, style: 'realistic'
      });
      const { uploaded } = uploadCommands(engine);
      expect(uploaded.byteLength).toBe(fixture.bytes);
      expect(crypto.createHash('sha256').update(Buffer.from(uploaded)).digest('hex')).toBe(fixture.hash);
    }
  });

  test('retains the literal 28-word legacy ABI golden at 112 bytes', () => {
    const engine = makeEngine();
    engine.spawnExplosion({
      effectId: 'legacy-golden', seed: 123, shape: 'heart', count: 36,
      colors: ['#11223344'], origin: { x: 960, y: 320 }, duration: 1.25,
      size: 23, gravity: 84, drag: 0.982, style: 'realistic'
    });
    const { uploaded, words } = uploadCommands(engine);
    expect(uploaded.byteLength).toBe(112);
    expect(Array.from(words)).toEqual([
      1148190720, 1134559232, 1148190720, 1134559232,
      1032358025, 1040746633, 1045220557, 1049135241,
      36, 1, 2, 5120, 1065353216, 1067450368, 0, 123,
      1102577664, 1118306304, 1065051226, 1, 0, 0, 0,
      1036831949, 0, 36, 3860058921, 0
    ]);
  });

  test('selects packed RGBA8 colors deterministically in WGSL and round-trips alpha', () => {
    const engine = makeEngine();
    engine.spawnLayer(layer({ colors: ['#01020304', '#a0b0c0d0'] }), {
      origin: { x: 960, y: 320 }, seed: 77, materialProfile: 'classic'
    });
    expect(engine.spawnQueue[0].packedColors).toEqual([0x04030201, 0xd0c0b0a0]);

    const shader = engine._computeShader();
    expect(shader).toContain('colorWords: vec4u');
    expect(shader).toContain('fn unpackRgba8');
    expect(shader).toContain('globalIndex % min(command.colorCount & 7u, 4u)');
    expect(shader).toMatch(/f32\(packed\s*&\s*255u\)\/255\.0/);
    expect(shader).toMatch(/f32\(\(packed\s*>>\s*24u\)\s*&\s*255u\)\/255\.0/);
    expect(shader).toContain('bitcast<vec4f>(command.colorWords)');
  });

  test('gates V2 trail, split, emitted, strobe, quality and material-role flags behind the marker', () => {
    const engine = makeEngine();
    engine.spawnLayer(layer({ priority: 'accent' }), {
      origin: { x: 960, y: 320 }, seed: 77,
      materialProfile: 'classic', visualStyle: 'realistic', splitQuality: 3
    });
    const flags = engine.spawnQueue[0].flags;
    expect(flags & (1 << 15)).toBeTruthy();
    expect(flags & 1).toBeTruthy();
    expect(flags & 2).toBeTruthy();
    expect(flags & 4).toBeFalsy();
    expect(flags & 8).toBeTruthy();
    expect((flags >> 4) & 3).toBe(3);
    expect((flags >> 8) & 15).toBe(1);
    expect((flags >> 12) & 3).toBe(1);
    expect(engine._flags({ secondary: true, role: 4, style: 2, pulseCount: 6 }))
      .toBe(2 | (6 << 3) | (4 << 8) | (2 << 12));

    const compute = engine._computeShader();
    const particle = engine._particleShader();
    expect(compute).toContain('const V2_MARKER = 32768u');
    expect(compute).toContain('p.flags = p.flags | V2_SPLIT_EMITTED');
    expect(compute).toContain('let splitQuality = (source.flags >> 4u) & 3u');
    expect(particle).toContain('fn v2Strobe');
    expect(particle).toContain('(p.flags & V2_TRAIL) == 0u');
  });

  test('defaults requested V2 splits to four children without entering legacy role branches', () => {
    const engine = makeEngine();
    engine.spawnLayer(layer({ primitive: 'crossette', split: true }), {
      origin: { x: 960, y: 320 }, seed: 77, materialProfile: 'classic'
    });
    expect((engine.spawnQueue[0].flags >> 4) & 3).toBe(3);
    const shader = engine._computeShader();
    expect(shader).toContain('let childCount = splitQuality + 1u');
    expect(shader).toContain('if (!isV2(p.flags) && (role == 1u || role == 2u))');
    expect(shader).toContain('if (!isV2(p.flags) && role == 1u && previousLife >= 0.0)');
    expect(shader.indexOf('if (isV2(source.flags))')).toBeLessThan(shader.indexOf('if (sourceRole == 1u)'));
  });

  test('maps DSL lifetime, size, gravity and drag exactly without legacy retention semantics', () => {
    const engine = makeEngine();
    engine.spawnLayer(layer(), {
      origin: { x: 960, y: 320 }, seed: 77, materialProfile: 'classic'
    });
    expect(engine.spawnQueue[0]).toMatchObject({
      particleDuration: 0.9,
      size: 6,
      gravity: 84,
      drag: 0.04
    });

    const legacy = makeEngine();
    legacy.spawnExplosion({ shape: 'ring', count: 40, colors: ['#ffffff'], drag: 0.982 });
    expect(legacy.spawnQueue[0].drag).toBe(0.982);
    const shader = engine._computeShader();
    expect(shader).toContain('exp(-p.drag * uniforms.dt * 60.0)');
    expect(shader).toContain('pow(p.drag, uniforms.dt * 60.0)');
  });

  test('uses the smaller logical viewport dimension for V2 velocity, size and gravity', () => {
    const commandFor = (width, height) => {
      const engine = makeEngine(width, height);
      engine.spawnLayer(layer(), {
        origin: { x: width / 2, y: height / 3 }, seed: 77, materialProfile: 'classic'
      });
      return engine.spawnQueue[0];
    };
    const landscape = commandFor(1920, 1080);
    const portrait = commandFor(1080, 1920);
    expect(portrait.intensity).toBe(landscape.intensity);
    expect(portrait.size).toBe(landscape.size);
    expect(portrait.gravity).toBe(landscape.gravity);
    expect(commandFor(1280, 720)).toMatchObject({ intensity: 0.75, size: 4.5, gravity: 63 });
    expect(commandFor(720, 1280)).toMatchObject({ intensity: 0.75, size: 4.5, gravity: 63 });
  });

  test('contains deterministic explicit V2 primitive and bounded curated glyph branches', () => {
    const engine = makeEngine();
    const first = engine._computeShader();
    const second = engine._computeShader();
    expect(second).toBe(first);
    for (let id = 10; id <= 24; id++) {
      expect(first).toContain(`shape == ${id}u`);
    }
    expect(first).toContain('fn glyphPoint(shape: u32, t: f32, seed: u32) -> vec2f');
    expect(first).toContain('return clamp(point, vec2f(-1.0), vec2f(1.0));');
    const glyphSection = first.slice(first.indexOf('fn glyphPoint'), first.indexOf('fn shapeVelocity'));
    expect(glyphSection).not.toContain('uniforms.time');
  });

  test.each([
    ['unknown primitive', { primitive: 'unknown' }],
    ['missing glyph', { primitive: 'glyph', glyph: undefined }],
    ['no colors', { colors: [] }],
    ['excess colors', { colors: ['#000000', '#111111', '#222222', '#333333', '#444444'] }],
    ['malformed color', { colors: ['red'] }],
    ['fractional density', { density: 1.5 }],
    ['zero size', { size: 0 }],
    ['excess size', { size: 10.1 }],
    ['fractional lifetime', { lifetimeMs: 900.5 }],
    ['excess gravity', { gravity: 10.1 }],
    ['negative drag', { drag: -0.01 }],
    ['non-boolean trail', { trail: 1 }],
    ['invalid priority', { priority: 'optional' }],
    ['decorative core', { priority: 'decorative', core: true }]
  ])('rejects %s without queuing a malformed V2 command', (name, override) => {
    const engine = makeEngine();
    expect(() => engine.spawnLayer(layer(override), {
      origin: { x: 960, y: 320 }, seed: 77, materialProfile: 'classic'
    })).toThrow();
    expect(engine.spawnQueue).toHaveLength(0);
  });
});
