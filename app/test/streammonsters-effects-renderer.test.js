'use strict';

const {
  SCENE_DURATIONS,
  createEffectsRenderer,
  sceneChoreography
} = require('../plugins/streamalchemy/streammonsters-effects-renderer');

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
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
    rotate: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
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
  return { canvas, canvas2d, context, device, pass, gpu, lost };
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
      .toEqual(expect.objectContaining({ steps: ['vfx-trail'], vfxKey: 'ashfang:attack', color: '#ff7043' }));
    expect(sceneChoreography('defense', { vfxKey: 'ripple:defense', element: 'Tide' }))
      .toEqual(expect.objectContaining({ steps: ['shield-burst'], vfxKey: 'ripple:defense' }));
    expect(sceneChoreography('special', { vfxKey: 'selene:special', element: 'Lunar' }))
      .toEqual(expect.objectContaining({ steps: ['element-color-special'], vfxKey: 'selene:special', color: '#c7a4ff' }));
  });
});
