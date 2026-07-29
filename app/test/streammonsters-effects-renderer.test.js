'use strict';

const {
  MAX_BACKING_PIXELS,
  SCENE_DURATIONS,
  attackBasis,
  createEffectsRenderer,
  phaseForProgress,
  sceneChoreography
} = require('../plugins/streamalchemy/streammonsters-effects-renderer');

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

function validateWgslUniformContract(code) {
  const uniformStruct = /struct Uniforms\s*\{([\s\S]*?)\};/.exec(code);
  if (!uniformStruct) throw new Error('missing Uniforms struct');
  const fields = [...uniformStruct[1].matchAll(/^\s*([A-Za-z_]\w*)\s*:/gm)]
    .map(match => match[1]);
  const reservedFields = fields.filter(field => field === 'target');
  if (reservedFields.length) {
    throw new Error(`reserved WGSL uniform identifier: ${reservedFields.join(', ')}`);
  }
  const unknownReferences = [...code.matchAll(/\bu\.([A-Za-z_]\w*)/g)]
    .map(match => match[1])
    .filter(field => !fields.includes(field));
  if (unknownReferences.length) {
    throw new Error(`unknown WGSL uniform reference: ${unknownReferences.join(', ')}`);
  }
}

function createGpuHarness() {
  const lost = deferred();
  const pass = {
    setPipeline: jest.fn(),
    setBindGroup: jest.fn(),
    draw: jest.fn(),
    end: jest.fn()
  };
  const encoder = {
    beginRenderPass: jest.fn(() => pass),
    finish: jest.fn(() => ({ command: true }))
  };
  const device = {
    lost: lost.promise,
    createShaderModule: jest.fn(() => ({ shader: true })),
    createRenderPipeline: jest.fn(() => ({
      getBindGroupLayout: jest.fn(() => ({ layout: true }))
    })),
    createBuffer: jest.fn(() => ({ buffer: true })),
    createBindGroup: jest.fn(() => ({ bindGroup: true })),
    createCommandEncoder: jest.fn(() => encoder),
    queue: {
      writeBuffer: jest.fn(),
      submit: jest.fn()
    }
  };
  const context = {
    configure: jest.fn(),
    getCurrentTexture: jest.fn(() => ({
      createView: jest.fn(() => ({ view: true }))
    }))
  };
  const canvas2d = {
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    ellipse: jest.fn(),
    fillRect: jest.fn(),
    setLineDash: jest.fn(),
    set globalAlpha(value) { this.alpha = value; },
    set strokeStyle(value) { this.strokeColor = value; },
    set fillStyle(value) { this.fillColor = value; },
    set lineWidth(value) { this.width = value; }
  };
  const canvas = {
    width: 1920,
    height: 1080,
    classList: { toggle: jest.fn() },
    dataset: {},
    getContext: jest.fn(type => (type === 'webgpu' ? context : canvas2d))
  };
  const gpu = {
    requestAdapter: jest.fn(async () => ({
      requestDevice: jest.fn(async () => device)
    })),
    getPreferredCanvasFormat: jest.fn(() => 'bgra8unorm')
  };
  return { canvas, canvas2d, context, device, encoder, pass, gpu, lost };
}

describe('Stream Monsters effects renderer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('creates, configures and draws with real WebGPU resources', async () => {
    const harness = createGpuHarness();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(16), 16),
      cancelAnimationFrame: clearTimeout
    });

    await expect(renderer.init()).resolves.toBe('webgpu');
    const completion = renderer.play('spawn', { element: 'Volt' });
    await jest.advanceTimersByTimeAsync(32);

    expect(harness.context.configure).toHaveBeenCalledWith(expect.objectContaining({
      device: harness.device,
      format: 'bgra8unorm',
      alphaMode: 'premultiplied'
    }));
    expect(harness.device.createShaderModule).toHaveBeenCalled();
    expect(harness.device.createRenderPipeline).toHaveBeenCalled();
    expect(harness.device.createBuffer).toHaveBeenCalled();
    expect(harness.pass.draw).toHaveBeenCalled();
    expect(harness.device.queue.submit).toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.spawn);
    await expect(completion).resolves.toEqual(expect.objectContaining({
      scene: 'spawn',
      duration: SCENE_DURATIONS.spawn
    }));
    expect(harness.device.createCommandEncoder).toHaveBeenCalledTimes(
      harness.pass.draw.mock.calls.length + 1
    );
    expect(harness.encoder.beginRenderPass.mock.calls.at(-1)[0]).toEqual({
      colorAttachments: [{
        view: expect.any(Object),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });
  });

  test.each([
    ['missing adapter', { gpu: { requestAdapter: async () => null } }],
    ['initialization failure', { gpu: { requestAdapter: async () => { throw new Error('no gpu'); } } }],
    ['missing WebGPU API', {}]
  ])('%s selects fallback without changing scene completion timing', async (label, navigator) => {
    const harness = createGpuHarness();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator,
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(16), 16),
      cancelAnimationFrame: clearTimeout
    });

    await expect(renderer.init()).resolves.toBe('fallback');
    const completion = renderer.play('defense', { element: 'Grove' });
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.defense - 1);
    let settled = false;
    completion.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(completion).resolves.toEqual(expect.objectContaining({
      duration: SCENE_DURATIONS.defense
    }));
  });

  test('device loss switches the active and future scene to fallback without reload', async () => {
    const harness = createGpuHarness();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(16), 16),
      cancelAnimationFrame: clearTimeout
    });
    await renderer.init();
    const completion = renderer.play('special', { element: 'Ember' });
    await jest.advanceTimersByTimeAsync(32);

    harness.lost.resolve({ reason: 'destroyed' });
    await Promise.resolve();
    expect(renderer.mode()).toBe('fallback');
    expect(renderer.reason()).toBe('device-lost');

    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.special);
    await expect(completion).resolves.toEqual(expect.objectContaining({
      duration: SCENE_DURATIONS.special
    }));
    const next = renderer.play('attack', { element: 'Tide' });
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.attack);
    await expect(next).resolves.toEqual(expect.objectContaining({ mode: 'fallback' }));
  });

  test('emits privacy-safe structured renderer selection, switch and device-loss diagnostics', async () => {
    const harness = createGpuHarness();
    const diagnostics = jest.fn();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: false }),
      diagnostics,
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });

    await renderer.init();
    expect(diagnostics).toHaveBeenCalledWith({
      component: 'streammonsters-overlay',
      subsystem: 'renderer',
      event: 'renderer_selected',
      renderer: 'webgpu',
      previousRenderer: 'pending',
      fallbackReason: null,
      fps: null
    });

    harness.lost.resolve({
      reason: 'destroyed',
      message: 'must never be logged',
      viewerId: 'secret-viewer'
    });
    await Promise.resolve();

    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      event: 'renderer_device_lost',
      renderer: 'webgpu',
      fallbackReason: 'device-lost'
    }));
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      event: 'renderer_switched',
      renderer: 'canvas2d',
      previousRenderer: 'webgpu',
      fallbackReason: 'device-lost'
    }));
    for (const [record] of diagnostics.mock.calls) {
      expect(Object.keys(record).sort()).toEqual([
        'component',
        'event',
        'fallbackReason',
        'fps',
        'previousRenderer',
        'renderer',
        'subsystem'
      ]);
      expect(JSON.stringify(record)).not.toMatch(/viewer|secret|must never/i);
    }
  });

  test('reports sustained FPS degradation once without logging scene or viewer payloads', async () => {
    const harness = createGpuHarness();
    const diagnostics = jest.fn();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: false }),
      diagnostics,
      lowFpsThreshold: 24,
      lowFpsSampleSize: 3,
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 100),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });

    await renderer.init();
    const completion = renderer.play('attack', {
      eventId: 'private-event',
      viewerId: 'private-viewer',
      secret: 'private-secret'
    });
    await jest.advanceTimersByTimeAsync(500);

    const degraded = diagnostics.mock.calls
      .map(([record]) => record)
      .filter(record => record.event === 'renderer_fps_degraded');
    expect(degraded).toEqual([{
      component: 'streammonsters-overlay',
      subsystem: 'renderer',
      event: 'renderer_fps_degraded',
      renderer: 'webgpu',
      previousRenderer: 'webgpu',
      fallbackReason: 'low-fps',
      fps: 10
    }]);
    expect(JSON.stringify(degraded)).not.toMatch(/private|viewer|secret/i);
    expect(renderer.status()).toEqual(expect.objectContaining({
      renderer: 'webgpu',
      fps: 10,
      fallbackReason: null
    }));

    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.attack);
    await completion;
  });

  test('device loss keeps drawing fallback frames and advancing the active phase', async () => {
    const harness = createGpuHarness();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });
    await renderer.init();
    const completion = renderer.play('hatch', { element: 'Lunar' });
    await jest.advanceTimersByTimeAsync(32);

    harness.lost.resolve({ reason: 'destroyed' });
    await Promise.resolve();
    const drawsAtLoss = harness.canvas2d.stroke.mock.calls.length;
    const phaseAtLoss = harness.canvas.dataset.effectPhase;

    await jest.advanceTimersByTimeAsync(700);
    expect(harness.canvas2d.stroke.mock.calls.length).toBeGreaterThan(drawsAtLoss);
    expect(harness.canvas.dataset.effectPhase).not.toBe(phaseAtLoss);

    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.hatch);
    await completion;
  });

  test('replaces a WebGPU-bound canvas so device-loss fallback can acquire Canvas2D', async () => {
    const harness = createGpuHarness();
    const replacement = {
      width: 1920,
      height: 1080,
      classList: { toggle: jest.fn() },
      dataset: {},
      getContext: jest.fn(type => (type === '2d' ? harness.canvas2d : null))
    };
    harness.canvas.getContext = jest.fn(type => (type === 'webgpu' ? harness.context : null));
    harness.canvas.cloneNode = jest.fn(() => replacement);
    harness.canvas.replaceWith = jest.fn();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });
    await renderer.init();
    const completion = renderer.play('spawn', { element: 'Ember' });
    await jest.advanceTimersByTimeAsync(32);

    harness.lost.resolve({ reason: 'destroyed' });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(700);

    expect(harness.canvas.replaceWith).toHaveBeenCalledWith(replacement);
    expect(replacement.getContext).toHaveBeenCalledWith('2d', { alpha: true });
    expect(harness.canvas2d.stroke.mock.calls.length).toBeGreaterThan(1);
    expect(replacement.dataset.effectPhase).toBe('particle-swirl');

    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.spawn);
    await completion;
  });

  test('reduced motion uses the fallback choreography and preserves the public duration', async () => {
    const harness = createGpuHarness();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: true })
    });
    await expect(renderer.init()).resolves.toBe('fallback');
    expect(renderer.reason()).toBe('reduced-motion');

    const completion = renderer.play('hatch', { element: 'Lunar' });
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.hatch);
    await expect(completion).resolves.toEqual(expect.objectContaining({
      duration: SCENE_DURATIONS.hatch,
      reducedMotion: true
    }));
  });

  test('routes exact choreography steps through VFX keys and element colors', () => {
    expect(sceneChoreography('spawn', { element: 'Volt' }).steps).toEqual([
      'element-portal',
      'particle-swirl',
      'egg-fly-in',
      'spring-landing'
    ]);
    expect(sceneChoreography('hatch', { element: 'Lunar' }).steps).toEqual([
      'pulse',
      'cracks',
      'energy-build',
      'flash',
      'monster-reveal'
    ]);
    expect(sceneChoreography('attack', { vfxKey: 'ashfang:attack', element: 'Ember' }))
      .toEqual(expect.objectContaining({
        steps: ['telegraph', 'element-strike', 'impact'],
        vfxKey: 'ashfang:attack',
        color: '#ff5a36'
      }));
    expect(sceneChoreography('defense', { vfxKey: 'ripple:defense', element: 'Tide' }))
      .toEqual(expect.objectContaining({
        steps: ['guard-rise', 'element-barrier', 'guard-pulse'],
        vfxKey: 'ripple:defense'
      }));
    expect(sceneChoreography('special', { vfxKey: 'selene:special', element: 'Lunar' }))
      .toEqual(expect.objectContaining({
        steps: ['charge', 'element-signature', 'finisher'],
        vfxKey: 'selene:special',
        color: '#b98cff'
      }));
  });

  test('mirrors source-to-target bases and uses a deterministic equal-anchor fallback', () => {
    expect(attackBasis({ x: 0.28, y: 0.52 }, { x: 0.72, y: 0.52 })).toEqual({
      longitudinal: { x: 1, y: 0 },
      lateral: { x: 0, y: 1 },
      distance: 0.44
    });
    expect(attackBasis({ x: 0.72, y: 0.52 }, { x: 0.28, y: 0.52 })).toEqual({
      longitudinal: { x: -1, y: 0 },
      lateral: { x: 0, y: -1 },
      distance: 0.44
    });
    expect(attackBasis({ x: 0.4, y: 0.4 }, { x: 0.4, y: 0.4 })).toEqual({
      longitudinal: { x: 1, y: 0 },
      lateral: { x: 0, y: 1 },
      distance: 0
    });
  });

  test.each([
    ['high', 112],
    ['medium', 56],
    ['low', 24]
  ])('draws procedural particle quads with the real %s instance budget', async (quality, particles) => {
    const harness = createGpuHarness();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      quality,
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });

    await renderer.init();
    const pipelineDescriptor = harness.device.createRenderPipeline.mock.calls.at(-1)[0];
    expect(pipelineDescriptor.label).toMatch(/particle/i);
    expect(harness.device.createShaderModule.mock.calls.at(-1)[0].code)
      .toMatch(/@builtin\(instance_index\)/);
    expect(pipelineDescriptor.vertex.buffers || []).toEqual([]);

    const completion = renderer.play('attack', {
      element: 'Ember',
      actorSlot: 1,
      targetSlot: 2
    });
    await jest.advanceTimersByTimeAsync(32);
    expect(harness.pass.draw).toHaveBeenCalledWith(6, particles);

    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.attack);
    await completion;
  });

  test('falls back inside the active scene when a synchronous frame operation throws', async () => {
    const harness = createGpuHarness();
    harness.device.destroy = jest.fn();
    harness.device.queue.writeBuffer.mockImplementationOnce(() => {
      throw new Error('surface changed');
    });
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });

    await renderer.init();
    const completion = renderer.play('special', { element: 'Tide' });
    await expect(jest.advanceTimersByTimeAsync(32)).resolves.toBeUndefined();
    expect(renderer.status()).toEqual(expect.objectContaining({
      renderer: 'canvas2d',
      fallbackReason: 'frame-error'
    }));
    expect(harness.canvas2d.stroke).toHaveBeenCalled();
    renderer.destroy();
    expect(harness.device.destroy).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.special);
    await expect(completion).resolves.toEqual(expect.objectContaining({
      scene: 'special'
    }));
  });

  test('active particle shader compiles without reserved or dangling uniform identifiers', async () => {
    const harness = createGpuHarness();
    harness.device.createShaderModule.mockImplementation(descriptor => {
      validateWgslUniformContract(descriptor.code);
      return { shader: true };
    });
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: false })
    });

    await expect(renderer.init()).resolves.toBe('webgpu');
    expect(renderer.status()).toEqual(expect.objectContaining({
      renderer: 'webgpu',
      fallbackReason: null
    }));
  });

  test('destroy during asynchronous device acquisition cannot resurrect WebGPU', async () => {
    const harness = createGpuHarness();
    const deviceGate = deferred();
    const requestDevice = jest.fn(() => deviceGate.promise);
    harness.device.destroy = jest.fn();
    harness.gpu.requestAdapter = jest.fn(async () => ({ requestDevice }));
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: false })
    });

    const initialization = renderer.init();
    await Promise.resolve();
    expect(requestDevice).toHaveBeenCalledTimes(1);
    renderer.destroy();
    deviceGate.resolve(harness.device);

    await expect(initialization).resolves.not.toBe('webgpu');
    expect(harness.device.destroy).toHaveBeenCalledTimes(1);
    expect(harness.context.configure).not.toHaveBeenCalled();
    expect(renderer.status()).toEqual(expect.objectContaining({
      destroyed: true,
      active: false
    }));
    expect(renderer.mode()).not.toBe('webgpu');
  });

  test('caps the backing store and destroys owned GPU resources without later submits', async () => {
    const priorRatio = globalThis.devicePixelRatio;
    globalThis.devicePixelRatio = 4;
    const harness = createGpuHarness();
    harness.canvas.clientWidth = 1080;
    harness.canvas.clientHeight = 1920;
    harness.device.destroy = jest.fn();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });

    try {
      await renderer.init();
      renderer.resize();
      expect(harness.canvas.width * harness.canvas.height).toBeLessThanOrEqual(MAX_BACKING_PIXELS);
      expect(harness.canvas.width / harness.canvas.height).toBeCloseTo(1080 / 1920, 2);
      const completion = renderer.play('attack', { element: 'Gale' });
      await jest.advanceTimersByTimeAsync(32);
      const submits = harness.device.queue.submit.mock.calls.length;
      renderer.destroy();
      await expect(completion).resolves.toEqual(expect.objectContaining({
        interrupted: true,
        destroyed: true
      }));
      expect(harness.device.destroy).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.attack);
      expect(harness.device.queue.submit).toHaveBeenCalledTimes(submits + 1);
      expect(renderer.status().active).toBe(false);
    } finally {
      globalThis.devicePixelRatio = priorRatio;
    }
  });

  test('advances real spawn and hatch phases in WebGPU uniforms and the canvas DOM contract', async () => {
    const harness = createGpuHarness();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: { gpu: harness.gpu },
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });
    await renderer.init();
    const spawn = renderer.play('spawn', { element: 'Volt' });
    await jest.advanceTimersByTimeAsync(32);
    expect(harness.canvas.dataset.effectPhase).toBe('element-portal');
    expect(harness.device.queue.writeBuffer.mock.calls.at(-1)[2][16]).toBe(1);
    await jest.advanceTimersByTimeAsync(600);
    expect(harness.canvas.dataset.effectPhase).toBe('particle-swirl');
    expect(harness.device.queue.writeBuffer.mock.calls.at(-1)[2][16]).toBe(2);
    await jest.advanceTimersByTimeAsync(600);
    expect(harness.canvas.dataset.effectPhase).toBe('egg-fly-in');
    await jest.advanceTimersByTimeAsync(600);
    expect(harness.canvas.dataset.effectPhase).toBe('spring-landing');
    await jest.advanceTimersByTimeAsync(600);
    await spawn;

    const hatch = renderer.play('hatch', { element: 'Lunar' });
    await jest.advanceTimersByTimeAsync(32);
    expect(harness.canvas.dataset.effectPhase).toBe('pulse');
    await jest.advanceTimersByTimeAsync(600);
    expect(harness.canvas.dataset.effectPhase).toBe('cracks');
    await jest.advanceTimersByTimeAsync(600);
    expect(harness.canvas.dataset.effectPhase).toBe('energy-build');
    await jest.advanceTimersByTimeAsync(600);
    expect(harness.canvas.dataset.effectPhase).toBe('flash');
    await jest.advanceTimersByTimeAsync(600);
    expect(harness.canvas.dataset.effectPhase).toBe('monster-reveal');
    await jest.advanceTimersByTimeAsync(600);
    await hatch;
  });

  test('uses deterministic VFX-key accents without changing the canonical Canvas attack basis', async () => {
    expect(phaseForProgress('spawn', 0.26).name).toBe('particle-swirl');
    expect(sceneChoreography('attack', { vfxKey: 'ashfang:attack' }).vfx)
      .not.toEqual(sceneChoreography('attack', { vfxKey: 'ripple:attack' }).vfx);
    const first = createGpuHarness();
    const firstRenderer = createEffectsRenderer({
      canvas: first.canvas,
      navigator: { gpu: first.gpu },
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout
    });
    await firstRenderer.init();
    const firstPlay = firstRenderer.play('attack', { vfxKey: 'ashfang:attack', element: 'Ember' });
    await jest.advanceTimersByTimeAsync(32);
    const firstUniforms = [...first.device.queue.writeBuffer.mock.calls.at(-1)[2]];
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.attack);
    await firstPlay;
    const alternatePlay = firstRenderer.play('attack', { vfxKey: 'ripple:attack', element: 'Tide' });
    await jest.advanceTimersByTimeAsync(32);
    const alternateUniforms = [...first.device.queue.writeBuffer.mock.calls.at(-1)[2]];
    expect(firstUniforms.slice(9, 12)).not.toEqual(alternateUniforms.slice(9, 12));
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.attack);
    await alternatePlay;

    const second = createGpuHarness();
    const secondRenderer = createEffectsRenderer({
      canvas: second.canvas,
      navigator: {},
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout
    });
    await secondRenderer.init();
    const secondPlay = secondRenderer.play('attack', {
      vfxKey: 'ripple:attack',
      element: 'Tide',
      actorSlot: 1,
      targetSlot: 2
    });
    await jest.advanceTimersByTimeAsync(32);
    const secondVariant = second.canvas.dataset.vfxVariant;
    expect(second.canvas.dataset.vfxVariant).toMatch(/^v[0-9]+$/);
    expect(second.canvas2d.rotate).toHaveBeenCalledWith(0);
    expect(firstUniforms.slice(9, 11)).not.toEqual([0, 0]);
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.attack);
    await secondPlay;

    const third = createGpuHarness();
    const thirdRenderer = createEffectsRenderer({
      canvas: third.canvas,
      navigator: {},
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout
    });
    await thirdRenderer.init();
    const thirdPlay = thirdRenderer.play('attack', {
      vfxKey: 'ashfang:attack',
      element: 'Ember',
      actorSlot: 1,
      targetSlot: 2
    });
    await jest.advanceTimersByTimeAsync(32);
    expect(third.canvas.dataset.vfxVariant).not.toBe(secondVariant);
    expect(third.canvas2d.rotate.mock.calls.at(-1)).toEqual([0]);
    expect(third.canvas2d.lineTo).toHaveBeenCalledWith(844.8, 0);
    expect(second.canvas2d.lineTo).toHaveBeenCalledWith(844.8, 0);
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.attack);
    await thirdPlay;
  });

  test('applies the reveal origin and scale to WebGPU uniforms and Canvas2D transforms', async () => {
    const webgpu = createGpuHarness();
    const webgpuRenderer = createEffectsRenderer({
      canvas: webgpu.canvas,
      navigator: { gpu: webgpu.gpu },
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout
    });
    await webgpuRenderer.init();
    const webgpuPlay = webgpuRenderer.play('spawn', {
      element: 'Volt',
      origin: { x: 0.25, y: 0.8 },
      scale: 1.3
    });
    await jest.advanceTimersByTimeAsync(32);
    const uniforms = [...webgpu.device.queue.writeBuffer.mock.calls.at(-1)[2]];
    expect(uniforms.slice(20, 23)).toEqual([0.25, 0.800000011920929, 1.2999999523162842]);
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.spawn);
    await webgpuPlay;

    const fallback = createGpuHarness();
    const fallbackRenderer = createEffectsRenderer({
      canvas: fallback.canvas,
      navigator: {},
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout
    });
    await fallbackRenderer.init();
    const fallbackPlay = fallbackRenderer.play('hatch', {
      element: 'Grove',
      origin: { x: 0.75, y: 0.2 },
      scale: 0.7
    });
    await jest.advanceTimersByTimeAsync(32);
    expect(fallback.canvas2d.translate).toHaveBeenCalledWith(1440, 216);
    expect(fallback.canvas2d.scale).toHaveBeenCalledWith(0.7, 0.7);
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.hatch);
    await fallbackPlay;
  });

  test('draws every spawn and hatch phase through the Canvas2D fallback', async () => {
    const harness = createGpuHarness();
    const renderer = createEffectsRenderer({
      canvas: harness.canvas,
      navigator: {},
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
      cancelAnimationFrame: clearTimeout,
      now: () => Date.now()
    });
    await renderer.init();
    const spawn = renderer.play('spawn', { element: 'Ember' });
    await jest.advanceTimersByTimeAsync(650);
    expect(harness.canvas.dataset.effectPhase).toBe('particle-swirl');
    expect(harness.canvas2d.moveTo).toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(650);
    expect(harness.canvas.dataset.effectPhase).toBe('egg-fly-in');
    expect(harness.canvas2d.ellipse).toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.spawn);
    await spawn;

    const hatch = renderer.play('hatch', { element: 'Lunar' });
    await jest.advanceTimersByTimeAsync(650);
    expect(harness.canvas.dataset.effectPhase).toBe('cracks');
    await jest.advanceTimersByTimeAsync(1200);
    expect(harness.canvas.dataset.effectPhase).toBe('flash');
    expect(harness.canvas2d.fillRect).toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(600);
    expect(harness.canvas.dataset.effectPhase).toBe('monster-reveal');
    await jest.advanceTimersByTimeAsync(SCENE_DURATIONS.hatch);
    await hatch;
  });
});
