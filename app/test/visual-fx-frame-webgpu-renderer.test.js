const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', '..', 'plugin-store', 'sources', 'visual-fx-frame-webgpu');
const rendererRoot = path.join(pluginRoot, 'renderer');
const requirePlugin = relativePath => require(path.join(pluginRoot, relativePath));
const read = file => fs.readFileSync(path.join(rendererRoot, file), 'utf8');

describe('Visual FX Frame WEBGPU native renderer', () => {
  test('defines compute stages for fields, particles, and lightning', () => {
    const shaders = requirePlugin('renderer/effect-pipelines');
    const library = shaders.createShaderLibrary();

    expect(library.compute).toContain('fn simulateField');
    expect(library.compute).toContain('fn updateParticles');
    expect(library.compute).toContain('fn buildLightning');
    expect(library.compute).toContain('curlNoise');
    expect(library.scene).toContain('fn sdFrame');
    expect(library.scene).toContain('STYLE_REALISTIC');
    expect(library.scene).toContain('STYLE_NEON');
    expect(library.scene).toContain('STYLE_HYBRID');
    expect(library.scene).toContain('EFFECT_FLAMES');
    expect(library.scene).toContain('EFFECT_PARTICLES');
    expect(library.scene).toContain('EFFECT_ENERGY');
    expect(library.scene).toContain('EFFECT_LIGHTNING');
    for (const contract of [
      'FRAME_STYLE_CLASSIC', 'FRAME_STYLE_ORGANIC', 'FRAME_STYLE_DOUBLE',
      'FRAME_STYLE_SEGMENTED', 'FRAME_STYLE_PORTAL', 'fn pulseWave',
      'fn domainWarp', 'uniforms.secondaryColor', 'uniforms.frameFx',
      'uniforms.pulseFx', 'lightning['
    ]) expect(library.scene).toContain(contract);
  });

  test('uses storage simulation, indirect draws, and HDR post-processing', () => {
    const engineSource = read('webgpu-effects-engine.js');
    const resourceSource = read('gpu-resources.js');
    const postSource = read('hdr-post-processor.js');

    expect(resourceSource).toContain('GPUBufferUsage.STORAGE');
    expect(resourceSource).toContain('GPUBufferUsage.INDIRECT');
    expect(engineSource).toContain('dispatchWorkgroups');
    expect(engineSource).toContain('drawIndirect');
    expect(postSource).toContain("format: 'rgba16float'");
    expect(postSource).toContain('brightExtract');
    expect(postSource).toContain('kawaseBlur');
    expect(postSource).toContain('composite');
    expect(postSource).toContain('premultiplied');
    expect(postSource).toContain('setPipeline(this.pipelines.kawaseBlur)');
    expect(postSource).toContain('bloomTexture');
    expect(postSource).toContain('scene.rgb + bloom.rgb * post.intensity');
    expect(engineSource).toContain("scene: this._createBindGroup(this.pipelines.scene, [[0, this.buffers.uniforms], [1, this.buffers.field], [3, this.buffers.lightning]])");
  });

  test('loads renderer modules in dependency order without a fallback backend', () => {
    const overlay = read('index.html');
    const resourcesIndex = overlay.indexOf('gpu-resources.js');
    const shadersIndex = overlay.indexOf('effect-pipelines.js');
    const postIndex = overlay.indexOf('hdr-post-processor.js');
    const engineIndex = overlay.indexOf('webgpu-effects-engine.js');

    expect(resourcesIndex).toBeGreaterThan(0);
    expect(shadersIndex).toBeGreaterThan(resourcesIndex);
    expect(postIndex).toBeGreaterThan(shadersIndex);
    expect(engineIndex).toBeGreaterThan(postIndex);
    expect(overlay).not.toMatch(/webgl|canvas-fallback/i);
  });

  test('stops after one failed device recovery attempt', async () => {
    const WebGPUVisualFxEngine = requirePlugin('renderer/webgpu-effects-engine');
    const statuses = [];
    const engine = new WebGPUVisualFxEngine({ getContext: jest.fn() }, {
      onStatus: status => statuses.push(status)
    });
    engine.init = jest.fn(async () => false);

    await engine._handleDeviceLost({ message: 'first loss' });
    await engine._handleDeviceLost({ message: 'second loss' });

    expect(engine.init).toHaveBeenCalledTimes(1);
    expect(statuses.map(status => status.state)).toEqual([
      'device-lost', 'recovering', 'error', 'device-lost', 'error'
    ]);
    expect(engine.running).toBe(false);
  });

  test('exposes runtime metrics and deterministic trigger state', () => {
    const WebGPUVisualFxEngine = requirePlugin('renderer/webgpu-effects-engine');
    const engine = new WebGPUVisualFxEngine({ getContext: jest.fn() }, {
      config: { effectType: 'flames', qualityMode: 'obs-safe', visualStyle: 'hybrid' }
    });

    engine.handleTrigger({ id: 'gift-1', type: 'effect-switch', effect: 'lightning', duration: 1000 });

    expect(engine.activeTriggers).toHaveLength(1);
    expect(engine.getMetrics()).toMatchObject({
      backend: 'webgpu',
      effectType: 'lightning',
      visualStyle: 'hybrid',
      qualityMode: 'obs-safe',
      renderScale: 1
    });
    engine.clearTriggers();
    expect(engine.activeTriggers).toEqual([]);
  });

  test('reports rolling p95 and slow-frame ratio for runtime acceptance', () => {
    const WebGPUVisualFxEngine = requirePlugin('renderer/webgpu-effects-engine');
    const engine = new WebGPUVisualFxEngine({ getContext: jest.fn() });
    for (let index = 0; index < 113; index += 1) engine._updateMetrics(16, 0.2);
    for (let index = 0; index < 7; index += 1) engine._updateMetrics(30, 0.2);

    expect(engine.getMetrics()).toMatchObject({
      p95FrameTimeMs: 30,
      slowFrameRatio: 0.058
    });
  });

  test('sends hot-core whiteness to the shader instead of forcing a white frame', () => {
    const shaders = requirePlugin('renderer/effect-pipelines');
    const library = shaders.createShaderLibrary();
    const WebGPUVisualFxEngine = requirePlugin('renderer/webgpu-effects-engine');
    const writeBuffer = jest.fn();
    const engine = new WebGPUVisualFxEngine({ width: 1920, height: 1080 }, {
      config: { coreWhiteness: 0 }
    });
    engine.device = { queue: { writeBuffer } };
    engine.buffers = { uniforms: {} };

    engine._writeUniforms(1000, 1 / 60);
    const zeroCoreBytes = writeBuffer.mock.calls.at(-1)[2];
    expect(new DataView(zeroCoreBytes).getFloat32(128, true)).toBe(0);

    engine.updateConfig({ coreWhiteness: 0.72 });
    engine._writeUniforms(1000, 1 / 60);
    const brightCoreBytes = writeBuffer.mock.calls.at(-1)[2];
    expect(new DataView(brightCoreBytes).getFloat32(128, true)).toBeCloseTo(0.72);
    expect(library.scene).toContain('uniforms.material.x');
  });

  test('packs dual-color frame and pulse controls into the GPU uniform block', () => {
    const WebGPUVisualFxEngine = requirePlugin('renderer/webgpu-effects-engine');
    const writeBuffer = jest.fn();
    const engine = new WebGPUVisualFxEngine({ width: 1920, height: 1080 }, {
      config: {
        frameStyle: 'portal', secondaryColor: '#8040ff', frameGap: 12,
        segmentCount: 24, edgeFeather: 0.35, frameNoiseAmount: 0.2,
        pulseEnabled: true, pulseAmount: 0.34, pulseSpeed: 0.9,
        pulsePattern: 'heartbeat', frameCurve: 0.25, flameBrightness: 0.5
      }
    });
    engine.device = { queue: { writeBuffer } };
    engine.buffers = { uniforms: {} };

    engine._writeUniforms(1000, 1 / 60);
    const bytes = writeBuffer.mock.calls.at(-1)[2];
    const view = new DataView(bytes);
    expect(bytes.byteLength).toBe(192);
    expect(view.getFloat32(132, true)).toBeCloseTo(0.34);
    expect(view.getFloat32(136, true)).toBeCloseTo(0.9);
    expect(view.getFloat32(140, true)).toBe(4);
    expect(view.getFloat32(144, true)).toBeCloseTo(128 / 255);
    expect(view.getFloat32(148, true)).toBeCloseTo(64 / 255);
    expect(view.getFloat32(152, true)).toBe(1);
    expect(view.getFloat32(160, true)).toBe(12);
    expect(view.getFloat32(164, true)).toBe(24);
    expect(view.getFloat32(176, true)).toBe(1);
  });

  test('tone maps straight color before restoring premultiplied alpha', () => {
    const postSource = read('hdr-post-processor.js');
    expect(postSource).toContain('let straightColor = premultiplied.rgb / safeAlpha');
    expect(postSource).toContain('return vec4f(mapped * premultiplied.a, premultiplied.a)');
  });
});
