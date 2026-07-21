const fs = require('fs');
const path = require('path');

const gpuDir = path.join(__dirname, '../plugins/webgpu-weather-control/gpu');
const framegraphPath = path.join(gpuDir, 'weather-framegraph.js');
const enginePath = path.join(gpuDir, 'cinematic-weather-engine.js');

function makeMockGpu(timestamp = true) {
  const calls = { buffers: [], textures: [], compute: [], render: [], indirect: 0, timestamp: 0, copies: 0, destroy: 0, layouts: [], pipelineLayouts: [], bindGroups: [], pipelines: [], writes: [] };
  const buffer = () => ({ destroy: () => { calls.destroy++; }, mapAsync: async () => {}, getMappedRange: () => new ArrayBuffer(16), unmap: () => {} });
  const texture = () => ({ createView: () => ({}), destroy: () => { calls.destroy++; } });
  const pass = (kind) => ({
    setPipeline: () => {}, setBindGroup: () => {}, dispatchWorkgroups: (...args) => calls.compute.push([kind, ...args]),
    draw: () => {}, drawIndirect: () => { calls.indirect++; }, end: () => {}
  });
  const device = {
    queue: { writeBuffer: (...args) => { calls.writes.push(args); }, submit: () => {}, onSubmittedWorkDone: async () => {} },
    lost: new Promise(() => {}),
    createBuffer: (descriptor) => { calls.buffers.push(descriptor); return buffer(); },
    createTexture: (descriptor) => { calls.textures.push(descriptor); return texture(); },
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createBindGroupLayout: (descriptor) => { calls.layouts.push(descriptor); return { descriptor }; }, createPipelineLayout: (descriptor) => { calls.pipelineLayouts.push(descriptor); return { descriptor }; },
    createSampler: () => ({}), createComputePipeline: (descriptor) => { calls.compute.push(descriptor.compute.entryPoint); calls.pipelines.push(descriptor); return {}; },
    createRenderPipeline: (descriptor) => { calls.render.push(descriptor.fragment.entryPoint); calls.pipelines.push(descriptor); return {}; },
    createBindGroup: (descriptor) => { calls.bindGroups.push(descriptor); return {}; }, createQuerySet: () => ({ destroy: () => { calls.destroy++; } }),
    createCommandEncoder: () => ({
      beginComputePass: () => pass('compute'), beginRenderPass: () => pass('render'),
      resolveQuerySet: () => { calls.timestamp++; }, copyBufferToBuffer: () => {}, copyTextureToTexture: () => { calls.copies++; }, finish: () => ({})
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
    expect(mock.calls.compute).toEqual(expect.arrayContaining(['spawnParticles', 'simulateParticles', 'compactParticles', 'finalizeIndirectArgs']));
    expect(mock.calls.indirect).toBeGreaterThan(0);
    expect(mock.calls.textures.some((item) => item.format === 'rgba16float')).toBe(true);
    expect(mock.calls.render).toEqual(expect.arrayContaining(['particleFragment', 'bloomFragment', 'temporalFragment', 'compositeFragment']));
    expect(mock.calls.timestamp).toBeGreaterThan(0);
    expect(mock.calls.layouts.length).toBeGreaterThanOrEqual(3);
    expect(mock.calls.bindGroups.some((group) => group.entries.length >= 4)).toBe(true);
    expect(mock.calls.writes.length).toBeGreaterThan(0);
    expect(mock.calls.copies).toBeGreaterThan(0);
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
    engine.render(16.67);
    const effectUpload = mock.calls.writes.find(([, offset, data]) => offset === 0 && data instanceof Float32Array && data.length === 13 * 16)[2];
    expect(new Set(Array.from({ length: 13 }, (_, index) => effectUpload[index * 16 + 14]))).toEqual(new Set(Array.from({ length: 13 }, (_, index) => index)));
    expect(effectUpload[8]).toBeCloseTo(0.48); // fogColor ice reaches GPU storage.
    expect(effectUpload[12]).toBe(63); // all six glitch options are represented as GPU flags.
    engine.setQuality('auto');
    const before = engine.getMetrics().quality.particleBudget;
    engine.metrics.gpuFrameMs = 24;
    engine.recordFrameTime(9); // GPU queue/timestamp pressure must downshift even with CPU headroom.
    const reduced = engine.getMetrics().quality.particleBudget;
    expect(reduced).toBeLessThan(before);
    engine.metrics.gpuFrameMs = 0;
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

  test('drives rendering from actual animation-frame deltas rather than a fixed frame-time tick', () => {
    const overlay = fs.readFileSync(path.join(__dirname, '../plugins/webgpu-weather-control/overlay.html'), 'utf8');
    expect(overlay).toContain('function frame(now)');
    expect(overlay).toContain('const deltaMs = Math.min(100, Math.max(0, now - lastFrameAt))');
    expect(overlay).toContain('engine.render(deltaMs)');
    expect(overlay).not.toContain('setInterval(');
  });

  test('uses explicit compatible pipeline layouts and samples HDR inputs instead of zero-output shaders', () => {
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).not.toContain("layout: 'auto'");
    expect(framegraph).toContain('createBindGroupLayout');
    expect(framegraph).toContain('spawnParticles');
    expect(framegraph).toContain('textureSample');
    expect(framegraph).not.toContain('@fragment fn compositeFragment() -> @location(0) vec4<f32> { return vec4(0.0); }');
    expect(framegraph).toContain('indirectArgs[1] = atomicLoad(&counters[0])');
    expect(framegraph).toContain('copyTextureToTexture');
    expect(framegraph).toContain('for (let passIndex = 0; passIndex < bloomPasses; passIndex++)');
  });

  test('binds each explicit layout to compatible complete bind groups', async () => {
    const { CinematicWeatherEngine } = require(enginePath);
    const mock = makeMockGpu(false);
    const canvas = { getContext: () => ({ configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure: () => {} }) };
    const engine = new CinematicWeatherEngine(canvas, { gpu: mock.gpu, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
    await engine.init();
    engine.trigger({ action: 'thunder', intensity: 1, permanent: true });
    engine.render(20);

    expect(mock.calls.layouts.map((layout) => layout.entries.map((entry) => entry.binding))).toEqual(expect.arrayContaining([
      [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3], [0, 1, 2, 3, 4, 5]
    ]));
    expect(mock.calls.bindGroups.every((group) => group.entries.every((entry, index) => entry.binding === index))).toBe(true);
    expect(mock.calls.pipelines.every((pipeline) => pipeline.layout && pipeline.layout.descriptor)).toBe(true);
  });
});
