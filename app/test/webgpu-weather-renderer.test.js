const fs = require('fs');
const path = require('path');

const gpuDir = path.join(__dirname, '../plugins/webgpu-weather-control/gpu');
const framegraphPath = path.join(gpuDir, 'weather-framegraph.js');
const enginePath = path.join(gpuDir, 'cinematic-weather-engine.js');

function makeMockGpu(timestamp = true) {
  const calls = { buffers: [], textures: [], compute: [], render: [], indirect: 0, timestamp: 0, destroy: 0 };
  const buffer = () => ({ destroy: () => { calls.destroy++; }, mapAsync: async () => {}, getMappedRange: () => new ArrayBuffer(16), unmap: () => {} });
  const texture = () => ({ createView: () => ({}), destroy: () => { calls.destroy++; } });
  const pass = (kind) => ({
    setPipeline: () => {}, setBindGroup: () => {}, dispatchWorkgroups: (...args) => calls.compute.push([kind, ...args]),
    draw: () => {}, drawIndirect: () => { calls.indirect++; }, end: () => {}
  });
  const device = {
    queue: { writeBuffer: () => {}, submit: () => {}, onSubmittedWorkDone: async () => {} },
    lost: new Promise(() => {}),
    createBuffer: (descriptor) => { calls.buffers.push(descriptor); return buffer(); },
    createTexture: (descriptor) => { calls.textures.push(descriptor); return texture(); },
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createComputePipeline: (descriptor) => { calls.compute.push(descriptor.compute.entryPoint); return {}; },
    createRenderPipeline: (descriptor) => { calls.render.push(descriptor.fragment.entryPoint); return {}; },
    createBindGroup: () => ({}), createQuerySet: () => ({ destroy: () => { calls.destroy++; } }),
    createCommandEncoder: () => ({
      beginComputePass: () => pass('compute'), beginRenderPass: () => pass('render'),
      resolveQuerySet: () => { calls.timestamp++; }, copyBufferToBuffer: () => {}, finish: () => ({})
    })
  };
  const adapter = { features: new Set(timestamp ? ['timestamp-query'] : []), requestDevice: async () => device };
  const gpu = { requestAdapter: async () => adapter, getPreferredCanvasFormat: () => 'bgra8unorm' };
  return { calls, device, gpu };
}

describe('cinematic WebGPU weather renderer contract', () => {
  beforeEach(() => {
    jest.resetModules();
    global.GPUBufferUsage = { STORAGE: 1, COPY_DST: 2, INDIRECT: 4, UNIFORM: 8, COPY_SRC: 16, MAP_READ: 32, QUERY_RESOLVE: 64 };
    global.GPUTextureUsage = { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, STORAGE_BINDING: 4 };
  });

  test('creates native compute, indirect, HDR, bloom, temporal and timestamp paths', async () => {
    const { CinematicWeatherEngine } = require(enginePath);
    const mock = makeMockGpu(true);
    const canvas = { width: 0, height: 0, getContext: jest.fn(() => ({ configure: jest.fn(), getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure: jest.fn() })) };
    const engine = new CinematicWeatherEngine(canvas, { gpu: mock.gpu, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
    await engine.init();
    engine.resize(3840, 2160);
    engine.trigger({ action: 'rain', intensity: 0.8, duration: 1000, layer: 50, opacity: 0.7, particleScale: 1.2, wind: 0.4, directionDeg: 20, fogColor: 'ice', colorTemperature: 'golden', glitchRgbShift: true });
    engine.render(16.67);

    expect(canvas.getContext).toHaveBeenCalledWith('webgpu');
    expect(mock.calls.compute).toEqual(expect.arrayContaining(['simulateParticles', 'compactParticles', 'finalizeIndirectArgs']));
    expect(mock.calls.indirect).toBeGreaterThan(0);
    expect(mock.calls.textures.some((item) => item.format === 'rgba16float')).toBe(true);
    expect(mock.calls.render).toEqual(expect.arrayContaining(['particleFragment', 'bloomFragment', 'temporalFragment', 'compositeFragment']));
    expect(mock.calls.timestamp).toBeGreaterThan(0);
    expect(engine.getMetrics()).toMatchObject({ resolution: { width: 1920, height: 1080 }, gpuTimeSource: 'timestamp-query' });
  });

  test('propagates every documented effect and option through state, layers and adaptive quality', async () => {
    const { CinematicWeatherEngine, WEATHER_EFFECTS } = require(enginePath);
    const mock = makeMockGpu(false);
    const canvas = { getContext: () => ({ configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure: () => {} }) };
    const engine = new CinematicWeatherEngine(canvas, { gpu: mock.gpu, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
    await engine.init();
    WEATHER_EFFECTS.forEach((action, index) => engine.trigger({ action, intensity: 0.5, duration: 5000, permanent: index === 0, layer: 100 - index, opacity: 0.6, particleScale: 1.1, wind: 0.2, directionDeg: 15, fogColor: 'ice', colorTemperature: 'golden', glitchRgbShift: true, glitchDisplacement: true, glitchScanlines: true, glitchNoise: true, glitchBlocks: true, glitchChromaticAberration: true, glitchIntensity: 1.4 }));
    expect(engine.getEffectState()).toHaveLength(13);
    expect(engine.getEffectState().find((effect) => effect.action === 'rain')).toMatchObject({ action: 'rain', permanent: true, fogColor: 'ice', colorTemperature: 'golden', glitchIntensity: 1.4 });
    expect(engine.getEffectState().map((effect) => effect.layer)).toEqual([...engine.getEffectState().map((effect) => effect.layer)].sort((a, b) => a - b));
    engine.setQuality('auto');
    const before = engine.getMetrics().quality.particleBudget;
    engine.recordFrameTime(24);
    const reduced = engine.getMetrics().quality.particleBudget;
    expect(reduced).toBeLessThan(before);
    engine.recordFrameTime(9);
    expect(engine.getMetrics().quality.particleBudget).toBeGreaterThan(reduced);
    expect(engine.getMetrics().gpuTimeSource).toBe('queue-latency');
  });

  test('tears down to a transparent state on unsupported, errors, and device loss', async () => {
    const { CinematicWeatherEngine } = require(enginePath);
    const unsupported = new CinematicWeatherEngine({}, { gpu: null });
    await unsupported.init();
    expect(unsupported.getMetrics()).toMatchObject({ state: 'unsupported', transparent: true });

    const mock = makeMockGpu();
    const canvas = { getContext: () => ({ configure: () => {}, unconfigure: jest.fn(), getCurrentTexture: () => ({ createView: () => ({}) }) }) };
    const engine = new CinematicWeatherEngine(canvas, { gpu: mock.gpu, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
    await engine.init();
    engine.handleDeviceLost('mock device lost');
    expect(engine.getMetrics()).toMatchObject({ state: 'device-lost', transparent: true });
    expect(mock.calls.destroy).toBeGreaterThan(0);
  });

  test('contains no Canvas2D, WebGL, or fallback renderer context', () => {
    [framegraphPath, enginePath, path.join(__dirname, '../plugins/webgpu-weather-control/overlay.html')].forEach((file) => {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toContain("getContext('2d')");
      expect(source).not.toContain("getContext('webgl") ;
    });
  });
});
