const fs = require('fs');
const path = require('path');

const gpuDir = path.join(__dirname, '../plugins/webgpu-weather-control/gpu');
const framegraphPath = path.join(gpuDir, 'weather-framegraph.js');
const enginePath = path.join(gpuDir, 'cinematic-weather-engine.js');

function makeMockGpu(timestamp = true, optionalFeatures = []) {
  const calls = { buffers: [], textures: [], samplers: [], compute: [], dispatches: [], render: [], indirect: 0, timestamp: 0, copies: 0, destroy: 0, layouts: [], pipelineLayouts: [], bindGroups: [], pipelines: [], writes: [], requestDevice: null };
  const buffer = () => ({ destroy: () => { calls.destroy++; }, mapAsync: async () => {}, getMappedRange: () => new ArrayBuffer(16), unmap: () => {} });
  const texture = () => ({ createView: () => ({}), destroy: () => { calls.destroy++; } });
  const pass = (kind) => {
    let pipeline = null;
    return {
    setPipeline: (value) => { pipeline = value; }, setBindGroup: () => {}, dispatchWorkgroups: (...args) => { calls.compute.push([kind, ...args]); calls.dispatches.push([pipeline?.entryPoint, ...args]); },
    draw: () => {}, drawIndirect: () => { calls.indirect++; }, end: () => {}
    };
  };
  const device = {
    queue: { writeBuffer: (...args) => { calls.writes.push(args); }, submit: () => {}, onSubmittedWorkDone: async () => {} },
    lost: new Promise(() => {}),
    createBuffer: (descriptor) => { calls.buffers.push(descriptor); return buffer(); },
    createTexture: (descriptor) => { calls.textures.push(descriptor); return texture(); },
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createBindGroupLayout: (descriptor) => { calls.layouts.push(descriptor); return { descriptor }; }, createPipelineLayout: (descriptor) => { calls.pipelineLayouts.push(descriptor); return { descriptor }; },
    createSampler: (descriptor) => { calls.samplers.push(descriptor); return {}; }, createComputePipeline: (descriptor) => { calls.compute.push(descriptor.compute.entryPoint); calls.pipelines.push(descriptor); return { entryPoint: descriptor.compute.entryPoint, layout: descriptor.layout }; },
    createRenderPipeline: (descriptor) => { calls.render.push(descriptor.fragment.entryPoint); calls.pipelines.push(descriptor); return { entryPoint: descriptor.fragment.entryPoint, layout: descriptor.layout }; },
    createBindGroup: (descriptor) => { calls.bindGroups.push(descriptor); return {}; }, createQuerySet: () => ({ destroy: () => { calls.destroy++; } }),
    createCommandEncoder: () => ({
      beginComputePass: () => pass('compute'), beginRenderPass: () => pass('render'),
      resolveQuerySet: () => { calls.timestamp++; }, copyBufferToBuffer: () => {}, copyTextureToTexture: () => { calls.copies++; }, finish: () => ({})
    })
  };
  const adapter = { features: new Set([...(timestamp ? ['timestamp-query'] : []), ...optionalFeatures]), requestDevice: async (descriptor) => { calls.requestDevice = descriptor; return device; } };
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
    expect(effectUpload[3 * 16 + 8]).toBeCloseTo(0.48); // fogColor ice reaches fixed fog slot block 2.
    expect(effectUpload[6 * 16 + 12]).toBe(63); // all six glitch options are in glitch block 3.
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

  test('uses measured GPU reserve to grow auto quality even when presentation is correctly locked to 60 FPS', async () => {
    const { CinematicWeatherEngine } = require(enginePath);
    const mock = makeMockGpu(false);
    const canvas = { getContext: () => ({ configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure: () => {} }) };
    const engine = new CinematicWeatherEngine(canvas, { gpu: mock.gpu });
    await engine.init();
    const before = engine.getMetrics().quality.particleBudget;
    engine.metrics.gpuFrameMs = 4;
    engine.recordFrameTime(16.67);
    expect(engine.getMetrics().quality.particleBudget).toBeGreaterThan(before);
  });

  test('uses measured GPU reserve when the browser externally throttles presentation frames', async () => {
    const { CinematicWeatherEngine } = require(enginePath);
    const mock = makeMockGpu(false);
    const canvas = { getContext: () => ({ configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure: () => {} }) };
    const engine = new CinematicWeatherEngine(canvas, { gpu: mock.gpu });
    await engine.init();
    const before = engine.getMetrics().quality.particleBudget;
    engine.metrics.gpuFrameMs = 4;
    engine.recordFrameTime(50);
    expect(engine.getMetrics().quality.particleBudget).toBeGreaterThan(before);
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

  test('reports a ready native renderer and rejects implausible timestamp-query values', async () => {
    const { CinematicWeatherEngine } = require(enginePath);
    const mock = makeMockGpu(true);
    const canvas = { getContext: () => ({ configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure: () => {} }) };
    const engine = new CinematicWeatherEngine(canvas, { gpu: mock.gpu });
    await engine.init();
    expect(engine.getMetrics()).toMatchObject({ state: 'ready', transparent: false, gpuTimeSource: 'timestamp-query' });

    engine.framegraph.readTimestampMs = async () => 120000;
    await engine.measureTimestamp();
    expect(engine.getMetrics()).toMatchObject({ gpuTimeSource: 'queue-latency' });
    expect(engine.getMetrics().gpuFrameMs).toBeLessThanOrEqual(1000);
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
    expect(framegraph).toContain('for (let passIndex = 1; passIndex < bloomPasses; passIndex++)');
    expect(framegraph).toContain('unfilterable-float');
    expect(framegraph).toContain('bloomAtoB');
  });

  test('uses fixed effect blocks, rank-based layers, and block-3 glitch controls without duration brightness', () => {
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).toContain('0=(intensity,duration,permanent,layer), 1=(opacity,particleScale,wind,direction)');
    expect(framegraph).toContain('2=(fog RGB,colorTemp), 3=(glitchBits,glitchIntensity,effectIndex,activeOrder)');
    expect(framegraph).toContain('const base = effect.effectIndex * EFFECT_BLOCK_FLOATS');
    expect(framegraph).toContain('block3.w == rank');
    expect(framegraph).toContain('block0.x * block1.x');
    expect(framegraph).not.toContain('block0.x * block0.y');
    [1, 2, 4, 8, 16, 32].forEach((flag) => expect(framegraph).toContain(`bitEnabled(block3.x, ${flag}.0)`));
    expect(framegraph).toContain('block3.y');
    ['toxic', 'blood', 'midday', 'sunset'].forEach((preset) => expect(framegraph).toContain(`${preset}:`));
  });

  test('does not emit fullscreen effects as particle spawn commands and bounds GPU work after a downshift', async () => {
    const { CinematicWeatherEngine } = require(enginePath);
    const mock = makeMockGpu(false);
    const canvas = { getContext: () => ({ configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure: () => {} }) };
    const engine = new CinematicWeatherEngine(canvas, { gpu: mock.gpu, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} });
    await engine.init();
    engine.trigger({ action: 'fog', intensity: 1, permanent: true, layer: 12 });
    engine.trigger({ action: 'sunbeam', intensity: 1, permanent: true, layer: 70 });
    engine.render(16);
    const fullscreenCommands = mock.calls.writes.find(([, , data]) => data instanceof Float32Array && data.length === 28)[2];
    expect(Array.from(fullscreenCommands)).toEqual(Array(28).fill(0));

    engine.trigger({ action: 'rain', intensity: 1, permanent: true, layer: 80 });
    engine.setQuality('ultra');
    engine.render(16);
    engine.setQuality('low');
    engine.render(16);
    const lastSimulate = mock.calls.dispatches.filter(([entry]) => entry === 'simulateParticles').at(-1);
    const lastCompact = mock.calls.dispatches.filter(([entry]) => entry === 'compactParticles').at(-1);
    expect(lastSimulate[1]).toBe(Math.ceil(1200 / 128));
    expect(lastCompact[1]).toBe(Math.ceil(1200 / 128));
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).toContain('id.x >= u32(frame.particleCap)');
    expect(framegraph).toContain('weather-layer-depth');
  });

  test('uses a non-filtering non-blended float16 path by default and opts into enhancements only when advertised', async () => {
    const { CinematicWeatherEngine } = require(enginePath);
    const canvas = () => ({ getContext: () => ({ configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure: () => {} }) });
    const fallback = makeMockGpu(false);
    const baseEngine = new CinematicWeatherEngine(canvas(), { gpu: fallback.gpu });
    await baseEngine.init();
    expect(fallback.calls.requestDevice.requiredFeatures).toEqual([]);
    expect(fallback.calls.samplers[0]).toMatchObject({ minFilter: 'nearest', magFilter: 'nearest' });
    expect(fallback.calls.layouts.find((layout) => layout.entries.length === 6).entries[0].texture.sampleType).toBe('unfilterable-float');
    expect(fallback.calls.pipelines.find((pipeline) => pipeline.fragment?.entryPoint === 'particleFragment').fragment.targets[0].blend).toBeUndefined();

    const enhanced = makeMockGpu(false, ['float16-filterable', 'float16-blendable']);
    const enhancedEngine = new CinematicWeatherEngine(canvas(), { gpu: enhanced.gpu });
    await enhancedEngine.init();
    expect(enhanced.calls.requestDevice.requiredFeatures).toEqual(expect.arrayContaining(['float16-filterable', 'float16-blendable']));
    expect(enhanced.calls.samplers[0]).toMatchObject({ minFilter: 'linear', magFilter: 'linear' });
    expect(enhanced.calls.layouts.find((layout) => layout.entries.length === 6).entries[0].texture.sampleType).toBe('float');
    expect(enhanced.calls.pipelines.find((pipeline) => pipeline.fragment?.entryPoint === 'particleFragment').fragment.targets[0].blend).toBeDefined();
  });

  test('ping-pongs bloom sources and targets rather than sampling a texture attached by the same bloom pass', () => {
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).toContain("postPass('bloomFragment', 'bloomA', this.bindGroups.post.bloomFromVolume)");
    expect(framegraph).toContain("postPass('bloomFragment', writeBloomB ? 'bloomB' : 'bloomA'");
    expect(framegraph).toContain("postEntries('bloomA', 'volume', 'history')");
    expect(framegraph).toContain("postEntries('bloomB', 'volume', 'history')");
  });

  test('writes premultiplied fullscreen alpha through volumetric, temporal, and composite passes', () => {
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).toContain('var cinemaAlpha = 0.0');
    expect(framegraph).toContain('cinemaAlpha = cinemaAlpha + alpha * (1.0 - cinemaAlpha)');
    expect(framegraph).toContain('let alpha = max(scene.a, cinema.a)');
    expect(framegraph).toContain('cinema.rgb * cinema.a');
    expect(framegraph).toContain('mix(sampleHdr(sceneHdr, uv), sampleHdr(historyHdr, uv), stability)');
    expect(framegraph).toContain('max(scene.a, original.a)');
  });

  test('uses bounded temporal accumulation and filmic HDR composition so dynamic lightning does not smear across the canvas', () => {
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).toContain('postFrame.temporalBlend * 0.18');
    expect(framegraph).toContain('let mapped = hdr / (vec3<f32>(1.0) + hdr)');
    expect(framegraph).toContain('bloom.rgb * .4');
  });

  test('gates canvas-wide cinema alpha to fullscreen or hybrid kinds and leaves particle-only kinds transparent away from sprites', () => {
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).toContain('fn isFullscreenKind(kind: f32) -> bool');
    const fullscreenGate = framegraph.match(/fn isFullscreenKind\(kind: f32\) -> bool \{[^}]+\}/)?.[0] || '';
    [2, 3, 4, 5, 6, 7, 12].forEach((kind) => expect(fullscreenGate).toContain(`kind == ${kind}.0`));
    [0, 1, 8, 9, 10, 11].forEach((kind) => expect(fullscreenGate).not.toContain(`kind == ${kind}.0`));
    expect(framegraph).toContain('block3.w == rank && isFullscreenKind(block3.z)');
    expect(framegraph).not.toContain('if (block3.w == rank) { var accumulated');
  });

  test('clears stale particles across capacity after stop or expiry before compacting indirect instances', async () => {
    const { CinematicWeatherEngine } = require(enginePath);
    const mock = makeMockGpu(false);
    const canvas = { getContext: () => ({ configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure: () => {} }) };
    const engine = new CinematicWeatherEngine(canvas, { gpu: mock.gpu });
    await engine.init();
    engine.trigger({ action: 'rain', intensity: 1, permanent: true });
    engine.render(16);
    expect(engine.getMetrics().activeParticles).toBeGreaterThan(0);
    engine.stop();
    expect(engine.getMetrics()).toMatchObject({ activeParticles: 0, activeParticleCommands: 0 });
    engine.render(16);
    expect(engine.getMetrics()).toMatchObject({ activeParticles: 0, activeParticleCommands: 0 });
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).toContain('if (id.x >= cap || count == 0u) { particles[id.x].state.x = 0.0; return; }');
    expect(framegraph).toContain('const cleanupWorkgroups = Math.ceil(this.capacity / 128)');
    expect(mock.calls.dispatches.filter(([entry]) => entry === 'spawnParticles').at(-1)[1]).toBe(Math.ceil(9000 / 128));
  });

  test('recomputes predicted particle metrics for a selective stop while other particle effects remain', async () => {
    const { CinematicWeatherEngine } = require(enginePath);
    const mock = makeMockGpu(false);
    const canvas = { getContext: () => ({ configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure: () => {} }) };
    const engine = new CinematicWeatherEngine(canvas, { gpu: mock.gpu });
    await engine.init();
    engine.trigger({ action: 'rain', intensity: 1, permanent: true, layer: 20 });
    engine.trigger({ action: 'snow', intensity: 0.5, permanent: true, layer: 30 });
    expect(engine.getMetrics()).toMatchObject({ activeParticleCommands: 2, activeParticles: 3150 });
    engine.stop('rain');
    expect(engine.getEffectState().map((effect) => effect.action)).toEqual(['snow']);
    expect(engine.getMetrics()).toMatchObject({ activeParticleCommands: 1, activeParticles: 2100, activeParticleCap: 4200 });
    engine.stop();
    expect(engine.getMetrics()).toMatchObject({ activeParticleCommands: 0, activeParticles: 0, activeParticleCap: 0 });
  });

  test('uses command intensity for particle density and premultiplied particle opacity', async () => {
    const { CinematicWeatherEngine } = require(enginePath);
    const mock = makeMockGpu(false);
    const canvas = { getContext: () => ({ configure: () => {}, getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure: () => {} }) };
    const engine = new CinematicWeatherEngine(canvas, { gpu: mock.gpu });
    await engine.init();
    engine.trigger({ action: 'rain', intensity: 0.01, opacity: 1, permanent: true });
    engine.render(16);
    const sparse = engine.getMetrics().activeParticles;
    const sparseCommand = mock.calls.writes.filter(([, , data]) => data instanceof Float32Array && data.length === 28).at(-1)[2];
    expect(sparseCommand[2]).toBeCloseTo(0.01);
    engine.trigger({ action: 'rain', intensity: 1, opacity: 1, permanent: true });
    engine.render(16);
    expect(engine.getMetrics().activeParticles).toBeGreaterThan(sparse);
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).toContain('let densityCap = u32(ceil(f32(slotsForCommand) * clamp(command.z, 0.0, 1.0)))');
    expect(framegraph).toContain('command.w * command.z');
    expect(framegraph).toContain('particleColor(kind, material.xyz) * alpha');
  });

  test('decorrelates particle spawn axes so GPU rain and sakura fill the frame instead of forming a diagonal band', () => {
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).toContain('let seedX = hash');
    expect(framegraph).toContain('let seedY = hash');
    expect(framegraph).toContain('vec4<f32>(seedX * 2.0 - 1.0, seedY * 2.0 - 1.0');
  });

  test('renders rain as fine motion-streaks and keeps snow, sakura, and fireflies at cinematic sprite scale', () => {
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).toContain('vec2<f32>(size * .18, size * 4.6)');
    expect(framegraph).toContain('kind == 10.0');
    expect(framegraph).toContain('p.state.w * (0.24 + .32 * p.position.z)');
  });

  test('keeps legal layer zero visible while higher layers remain closer in the depth attachment', () => {
    const framegraph = fs.readFileSync(framegraphPath, 'utf8');
    expect(framegraph).toContain('clamp(0.9999 - p.state.z / 100.02, 0.0001, 0.9999)');
    expect(framegraph).toContain('depthClearValue: 1');
    expect(framegraph).toContain("depthCompare: 'less'");
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
