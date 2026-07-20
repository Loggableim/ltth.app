'use strict';

const crypto = require('crypto');
const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');
const {
  BOYKISSER_PARTICLE_LOD,
  geometrySignature,
} = require('../plugins/webgpu-fireworks/gpu/boykisser-geometry');
const { FinaleShowPlanner } = require('../plugins/webgpu-fireworks/lib/finale-show-planner');
const { buildShowPlanV2Runtime } = require('../plugins/webgpu-fireworks/gpu/show-plan-v2-runtime');
const {
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
} = require('./helpers/webgpu-fireworks-gpu-harness');
const {
  SHAPE_IDS,
  V2_PRIMITIVE_IDS,
  V2_GLYPH_IDS,
  ENVELOPE_FLAG_BITS,
  fitCorrelatedCommands,
  projectVisualEnvelope,
} = require('../plugins/webgpu-fireworks/gpu/visible-envelope');

const makeEngine = (width = 1920, height = 1080) => {
  const engine = new WebGPUParticleEngine({ width, height }, { now: () => 1000 });
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
  test('injects shared Boykisser WGSL and has no inline index-band color heuristic', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu);
    try {
      await renderer.init();
      const shader = gpu.shaderCode('fireworks-compute-wgsl');

      expect(shader).toContain(`// geometry-signature:${geometrySignature}`);
      expect(shader).toContain('boykisserRole(');
      expect(shader).toContain('boykisserCanonicalColor(');
      expect(shader).toContain('boykisserVectorColor(');
      expect(shader).not.toMatch(/command\.shape\s*==\s*25u[\s\S]{0,400}glyphT\s*</);
    } finally {
      renderer.destroy();
      restoreGpuGlobals();
    }
  });

  test('shares the complete 0-26 registry and numeric WGSL constants', () => {
    const engine = makeEngine();
    const shader = engine._particleShader();
    expect(SHAPE_IDS).toEqual(Array.from({ length: 27 }, (_, index) => index));
    expect(Object.values(V2_PRIMITIVE_IDS)).toEqual([10, 11, 12, 13, 14, 15, 16]);
    expect(Object.values(V2_GLYPH_IDS)).toEqual([17, 18, 19, 20, 21, 22, 23, 24, 25, 26]);
    expect(shader).toContain('const CAMERA_DISTANCE = 4.0;');
    expect(shader).toContain(`const V2_TRAIL = ${ENVELOPE_FLAG_BITS.TRAIL}u;`);
    expect(shader).toContain(`const V2_STROBE = ${ENVELOPE_FLAG_BITS.STROBE}u;`);
    expect(shader).toContain(`const V2_MARKER = ${ENVELOPE_FLAG_BITS.V2_MARKER}u;`);
  });

  test.each([[1920, 1080], [1080, 1920]])('fits final commands, not center-only bounds, at %i x %i', (width, height) => {
    for (const depth of [-1, 0, 1]) {
      for (const shape of SHAPE_IDS) {
        const command = {
          kind: 2,
          shape,
          flags: shape >= 10 ? ENVELOPE_FLAG_BITS.V2_MARKER : 0,
          textureIndex: 0,
          origin: { x: width / 2, y: height * 0.05 },
          target: { x: width / 2, y: height * 0.05 },
          size: 20,
          intensity: 0.3,
          particleDuration: 0.9,
          gravity: 60,
          drag: 0.985,
          burstDepth: depth,
        };
        const fit = fitCorrelatedCommands([command], { width, height }, { paddingPx: 2 });
        const bounds = projectVisualEnvelope(fit.commands[0], { width, height });
        expect(bounds.left).toBeGreaterThanOrEqual(2 - 1e-5);
        expect(bounds.top).toBeGreaterThanOrEqual(2 - 1e-5);
        expect(bounds.right).toBeLessThanOrEqual(width - 2 + 1e-5);
        expect(bounds.bottom).toBeLessThanOrEqual(height - 2 + 1e-5);
      }
    }
  });
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
    'queues the Furry hero as a dense particle sculpture at %ix%i independently of finale intensity',
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
        expect(command.origin).toEqual({ x: width / 2, y: height * 0.38 });
        expect(command.burstDepth).toBe(0.82);
        expect(command.count).toBe(BOYKISSER_PARTICLE_LOD.hero);
        expect(command.globalCount).toBe(BOYKISSER_PARTICLE_LOD.hero);
        expect(command.flags & ENVELOPE_FLAG_BITS.VECTOR_HERO).toBe(0);
        expect(command.flags & ENVELOPE_FLAG_BITS.TRAIL).toBe(0);
        expect(command.gravity).toBeGreaterThan(0);
        expect(command.viewportMaterialization).toMatchObject({ kind: 'v2-layer', glyphExtent: 0.52 });
      }
    }
  );

  test('keeps every core Boykisser glyph on the particle path while retaining legacy shader parsing', () => {
    const engine = makeEngine();
    const context = {
      origin: { x: 960, y: 540 },
      seed: 417,
      renderHints: {
        depthEnabled: true, launchDepth: 0, burstDepth: 0.82, glyphScale: 1, glyphExtent: 0.58,
      },
    };

    expect(engine.spawnLayer(layer({
      primitive: 'glyph', glyph: 'boykisser', density: 192, trail: false,
    }), context)).toBe(true);
    expect(engine.spawnLayer(layer({
      primitive: 'glyph', glyph: 'boykisser', density: 96, core: false, priority: 'accent',
    }), context)).toBe(true);

    const [hero, buildGlyph] = engine.spawnQueue;
    expect(hero).toMatchObject({ count: 192, globalCount: 192 });
    expect(hero.flags & ENVELOPE_FLAG_BITS.VECTOR_HERO).toBe(0);
    expect(hero.flags & ENVELOPE_FLAG_BITS.TRAIL).toBe(0);
    expect(buildGlyph).toMatchObject({ count: 96, globalCount: 96 });
    expect(buildGlyph.flags & ENVELOPE_FLAG_BITS.VECTOR_HERO).toBe(0);

    const compute = engine._computeShader();
    const particle = engine._particleShader();
    expect(compute).toContain(`const V2_VECTOR_HERO = ${ENVELOPE_FLAG_BITS.VECTOR_HERO}u;`);
    expect(compute).toContain('command.shape == 25u && (command.flags & V2_VECTOR_HERO) != 0u');
    expect(particle).toContain(`const V2_VECTOR_HERO = ${ENVELOPE_FLAG_BITS.VECTOR_HERO}u;`);
    expect(particle).toContain('boykisserVectorColor(in.uv)');
    expect(particle).toContain('if(in.shape==25u&&(in.flags&V2_VECTOR_HERO)!=0u){discard;}');
  });

  test('materializes the particle hero from the complete finale correlation manifest', () => {
    const width = 1920;
    const height = 1080;
    const showPlan = new FinaleShowPlanner().plan({
      id: 'vector-manifest',
      style: 'furry-celebration',
      length: 'medium',
      orientation: 'landscape',
      intensity: 5,
      seed: 417,
    });
    const runtime = buildShowPlanV2Runtime(showPlan, { width, height, playSound: false });
    const heroEvent = runtime.events.filter(event => event.type === 'finale-v2-layer')
      .findLast(event => event.layer.glyph === 'boykisser');
    const manifestHero = heroEvent.context.correlationManifest.commands.find(command => (
      command.envelopeCommandId === heroEvent.context.envelopeCommandId
    ));
    expect(manifestHero.flags & ENVELOPE_FLAG_BITS.VECTOR_HERO).toBe(0);
    expect(manifestHero.viewportMaterialization).toMatchObject({
      kind: 'v2-layer',
      glyphExtent: 0.52,
    });

    const engine = makeEngine(width, height);
    expect(engine.spawnLayer(heroEvent.layer, heroEvent.context)).toBe(true);
    const uploaded = uploadCommands(engine);
    expect(uploaded.result).toMatchObject({ count: 1, maxParticles: BOYKISSER_PARTICLE_LOD.hero });
    expect(uploaded.words[8]).toBe(BOYKISSER_PARTICLE_LOD.hero);
    expect(uploaded.words[11] & ENVELOPE_FLAG_BITS.VECTOR_HERO)
      .toBe(0);
  });

  test.each([[1920, 1080], [1080, 1920]])(
    'sizes ordinary Furry glyphs by normalized viewport extent at %ix%i',
    (width, height) => {
      const showPlan = new FinaleShowPlanner().plan({
        id: `ordinary-glyph-${width}-${height}`,
        style: 'furry-celebration',
        length: 'short',
        orientation: width > height ? 'landscape' : 'portrait',
        intensity: 5,
        seed: 417
      });
      const runtime = buildShowPlanV2Runtime(showPlan, { width, height, playSound: false });
      const glyphEvent = runtime.events.find(event =>
        event.type === 'finale-v2-layer' && event.layer.glyph === 'boykisser');
      const engine = makeEngine(width, height);

      expect(engine.spawnLayer(glyphEvent.layer, glyphEvent.context)).toBe(true);
      const command = engine.spawnQueue[0];
      const midpointSeconds = command.particleDuration * 0.5;
      const decay = command.drag * 60;
      const displacement = (1 - Math.exp(-decay * midpointSeconds)) / decay;
      const perspective = 4 / (4 - command.burstDepth);
      const particleRadius = command.size * perspective;
      const xRadius = 0.9 * 218 * command.intensity * displacement * perspective;
      const visibleWidth = xRadius * 2 + particleRadius * 2;

      expect(glyphEvent.context.renderHints.glyphExtent).toBeCloseTo(0.0715, 6);
      expect(visibleWidth / width).toBeGreaterThanOrEqual(0.07);
      expect(visibleWidth / width).toBeLessThanOrEqual(0.08);
    }
  );

  test('scales depth rockets from the shorter viewport edge while preserving the 32px standard default', () => {
    const rocketSize = (width, height, renderHints, options = {}) => {
      const engine = makeEngine(width, height);
      engine.spawnRocket({
        origin: { x: width / 2, y: height }, target: { x: width / 2, y: height / 3 },
        duration: 1, renderHints, seed: 77, ...options
      });
      return engine.spawnQueue[0].size;
    };

    expect(rocketSize(1920, 1080, { depthEnabled: true })).toBe(22);
    expect(rocketSize(1080, 1920, { depthEnabled: true })).toBe(22);
    expect(rocketSize(1280, 720, { depthEnabled: true })).toBe(18);
    expect(rocketSize(720, 1280, { depthEnabled: true })).toBe(18);
    expect(rocketSize(1920, 1080, undefined)).toBe(32);
    expect(rocketSize(1080, 1920, undefined, { headTextureIndex: 2 })).toBe(32);
  });

  test('queues one correlated flame and exhaust voice per Trans or Rainbow trail color', () => {
    const engine = makeEngine();
    engine.spawnRocket({
      correlationId: 'special-trail',
      origin: { x: 960, y: 1080 },
      target: { x: 960, y: 360 },
      duration: 1.2,
      curve: 48,
      seed: 77,
      rocketTrail: {
        style: 'braided',
        colors: ['#5BCEFA', '#F5A9B8', '#FFFFFF']
      }
    });

    expect(engine.spawnQueue).toHaveLength(4);
    const [body, ...trailVoices] = engine.spawnQueue;
    expect(body.envelopeCommandId).toBe('special-trail:rocket:body');
    expect(trailVoices.map(command => command.color)).toEqual([
      [0x5b / 255, 0xce / 255, 0xfa / 255, 1],
      [0xf5 / 255, 0xa9 / 255, 0xb8 / 255, 1],
      [1, 1, 1, 1]
    ]);
    expect(new Set(trailVoices.map(command => command.curve)).size).toBe(3);
    expect(trailVoices.map(command => command.envelopeCommandId)).toEqual([
      'special-trail:rocket:trail:1',
      'special-trail:rocket:trail:2',
      'special-trail:rocket:trail:3'
    ]);
    expect(engine.spawnQueue.every(command => command.correlationManifest === body.correlationManifest)).toBe(true);
    expect(body.correlationManifest.commands).toHaveLength(4);
  });

  test('holds curated glyphs on screen with brighter chroma and a 30 percent glow lift', () => {
    const shader = makeEngine()._particleShader();

    expect(shader).toContain('if(shape>=17u&&shape<=26u){return smoothstep(0.0,0.08,t)*(1.0-smoothstep(0.64,1.0,t));}');
    expect(shader).toContain('fn glyphMaterialColor(base:vec3f,t:f32)->vec3f');
    expect(shader).toContain('in.shape>=17u&&in.shape<=26u');
    expect(shader).toContain('let glyphGlow=select(1.0,1.3,in.shape>=17u&&in.shape<=26u);');
  });

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

  test('allocates aligned bucket-local active-index ranges with zero-based indirect arguments', async () => {
    const engine = makeEngine();
    engine.maxParticles = 257;
    const bufferDescriptors = [];
    const restoreGlobals = {
      GPUBufferUsage: globalThis.GPUBufferUsage,
      GPUTextureUsage: globalThis.GPUTextureUsage,
      GPUShaderStage: globalThis.GPUShaderStage
    };
    globalThis.GPUBufferUsage = {
      STORAGE: 1, COPY_SRC: 2, COPY_DST: 4, INDIRECT: 8,
      MAP_READ: 16, UNIFORM: 32, QUERY_RESOLVE: 64
    };
    globalThis.GPUTextureUsage = { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 };
    globalThis.GPUShaderStage = { COMPUTE: 1, VERTEX: 2, FRAGMENT: 4 };

    const makeTexture = () => ({ createView: jest.fn(() => ({})), destroy: jest.fn() });
    engine.device = {
      limits: { minStorageBufferOffsetAlignment: 256 },
      queue: { writeBuffer: jest.fn() },
      createBuffer: jest.fn(descriptor => {
        const buffer = { label: descriptor.label };
        bufferDescriptors.push({ ...descriptor, buffer });
        return buffer;
      }),
      createTexture: jest.fn(makeTexture),
      createSampler: jest.fn(() => ({})),
      createShaderModule: jest.fn(() => ({})),
      createBindGroupLayout: jest.fn(() => ({})),
      createPipelineLayout: jest.fn(() => ({})),
      createComputePipelineAsync: jest.fn(descriptor => descriptor.compute.entryPoint),
      createRenderPipelineAsync: jest.fn(descriptor => descriptor.fragment.entryPoint),
      createBindGroup: jest.fn(descriptor => ({ descriptor }))
    };
    engine._createFrameTextures = jest.fn();
    engine._createFrameBindGroups = jest.fn();

    try {
      engine._createResources();
      const activeBuffer = bufferDescriptors.find(entry => entry.label === 'fireworks-active-indices');
      expect(activeBuffer.size).toBe(3 * 1280);

      const coreWrite = engine.device.queue.writeBuffer.mock.calls
        .find(([buffer]) => buffer === engine.buffers.coreIndirect);
      const trailWrite = engine.device.queue.writeBuffer.mock.calls
        .find(([buffer]) => buffer === engine.buffers.trailIndirect);
      expect([0, 1, 2].map(bucket => coreWrite[2][bucket * 4 + 3])).toEqual([0, 0, 0]);
      expect([0, 1, 2].map(bucket => trailWrite[2][bucket * 4 + 3])).toEqual([0, 0, 0]);

      await engine._createPipelines();
      const renderBindings = engine.device.createBindGroup.mock.calls
        .map(([descriptor]) => descriptor)
        .filter(descriptor => descriptor.entries.some(entry =>
          entry.binding === 1 && entry.resource.buffer === engine.buffers.activeIndices
        ));
      expect(renderBindings).toHaveLength(3);
      expect(renderBindings.map(descriptor => {
        const resource = descriptor.entries.find(entry => entry.binding === 1).resource;
        return { offset: resource.offset, size: resource.size };
      })).toEqual([
        { offset: 0, size: 1028 },
        { offset: 1280, size: 1028 },
        { offset: 2560, size: 1028 }
      ]);

      const compute = engine._computeShader();
      expect(compute).toContain('let bucketStride = arrayLength(&activeIndices) / 3u;');
      expect(compute).toContain('activeIndices[bucket * bucketStride + bucketSlot] = index;');
      expect(compute).toContain('atomicStore(&coreIndirect[offset + 3u], 0u);');
      expect(compute).toContain('atomicStore(&trailIndirect[offset + 3u], 0u);');
    } finally {
      for (const [name, value] of Object.entries(restoreGlobals)) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      }
    }
  });

  test('draws transparent depth buckets far to mid to near with their local bind groups', () => {
    const engine = makeEngine();
    engine.trailsEnabled = true;
    engine.glowEnabled = true;
    engine.pipelines = { trail: 'trail', glow: 'glow', core: 'core' };
    engine.buffers = { trailIndirect: 'trail-indirect', coreIndirect: 'core-indirect' };
    engine.renderBindGroups = ['far-bind-group', 'mid-bind-group', 'near-bind-group'];
    const events = [];
    const pass = {
      setBindGroup: jest.fn((slot, group) => events.push(['bind', slot, group])),
      setPipeline: jest.fn(pipeline => events.push(['pipeline', pipeline])),
      drawIndirect: jest.fn((buffer, offset) => events.push(['draw', buffer, offset]))
    };

    engine._drawDepthBuckets(pass);

    expect(events).toEqual([
      ['bind', 0, 'far-bind-group'],
      ['pipeline', 'trail'], ['draw', 'trail-indirect', 0],
      ['pipeline', 'glow'], ['draw', 'core-indirect', 0],
      ['pipeline', 'core'], ['draw', 'core-indirect', 0],
      ['bind', 0, 'mid-bind-group'],
      ['pipeline', 'trail'], ['draw', 'trail-indirect', 16],
      ['pipeline', 'glow'], ['draw', 'core-indirect', 16],
      ['pipeline', 'core'], ['draw', 'core-indirect', 16],
      ['bind', 0, 'near-bind-group'],
      ['pipeline', 'trail'], ['draw', 'trail-indirect', 32],
      ['pipeline', 'glow'], ['draw', 'core-indirect', 32],
      ['pipeline', 'core'], ['draw', 'core-indirect', 32]
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
      { colors: ['#11223344'], bytes: 112, hash: 'd8658b4f9f17061a9c9b4c2f3d147a3a9ee4bf863e4a8b8fdd98635450f5bdf3' },
      { colors: ['#11223344', '#55667788'], bytes: 224, hash: '120adc58675d7c13e492098cd3608071e442816a715112f4bc48f26e955e1b3e' },
      { colors: ['#11223344', '#55667788', '#99aabbcc', '#ddeeff00'], bytes: 448, hash: '1cad09998ca9304a131e70c9688b1f9c1c6469a86462716e55a193789ac0b603' }
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
      1148190720, 1136322743, 1148190720, 1136322743,
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
    expect(shader).toContain('let suppliedColorCount = min(command.colorCount & 7u, 4u)');
    expect(shader).toContain('globalIndex % max(1u, suppliedColorCount)');
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
