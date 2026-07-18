const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(APP, relativePath), 'utf8');
const loadEngine = (navigatorValue = {}) => {
  const context = vm.createContext({
    navigator: navigatorValue,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: callback => { callback(); return 1; },
    clearTimeout: () => {},
    console
  });
  vm.runInContext(read('plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js'), context);
  return context.WebGPUEmojiEngine;
};

describe('native WebGPU EmojiRain contract', () => {
  test('keeps classic and WebGPU editions distinct', () => {
    const classic = JSON.parse(read('plugins/emoji-rain/plugin.json'));
    const webgpu = JSON.parse(read('plugins/webgpu-emoji-rain/plugin.json'));
    expect(classic).toEqual(expect.objectContaining({ id: 'emoji-rain', name: 'EmojiRain', version: '2.1.2', enabled: true }));
    expect(webgpu).toEqual(expect.objectContaining({ id: 'webgpu-emoji-rain', name: 'WebGPU EmojiRain', version: '3.0.5', enabled: true }));
  });

  test('WebGPU overlays load only the native plugin-local renderer', () => {
    for (const file of ['plugins/webgpu-emoji-rain/overlay.html', 'plugins/webgpu-emoji-rain/obs-hud.html']) {
      const html = read(file);
      expect(html).toContain('/plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js?v=3.0.5');
      expect(html).toContain('/plugins/webgpu-emoji-rain/gpu/engine.js?v=3.0.5');
      expect(html).not.toMatch(/matter(?:\.min)?\.js/i);
      expect(html).not.toContain('webgpu-emoji-rain-engine.js');
    }
  });

  test('uses compute physics, compaction, indirect instancing, atlas textures and HDR composition', () => {
    const source = read('plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js');
    for (const contract of [
      'navigator.gpu.requestAdapter',
      'createComputePipeline',
      'var<storage, read_write> particles',
      'gridHeads',
      'activeIndices',
      'drawIndirect',
      'copyExternalImageToTexture',
      "format: 'rgba16float'",
      'device.lost',
      'adaptiveScale'
    ]) expect(source).toContain(contract);
    expect(source).not.toContain('Matter.');
  });

  test('reloads the avatar proxy helper with the plugin entry', () => {
    const source = read('plugins/webgpu-emoji-rain/main.js');

    expect(source).toContain("delete require.cache[require.resolve('./lib/avatar-proxy')]");
  });

  test('reports a strict unsupported state when navigator.gpu is unavailable', async () => {
    const WebGPUEmojiEngine = loadEngine();
    const states = [];
    const engine = new WebGPUEmojiEngine({}, { onState: state => states.push(state) });

    await expect(engine.init()).resolves.toBe(false);
    expect(states).toContainEqual(expect.objectContaining({
      backend: 'webgpu',
      state: 'unsupported',
      reason: 'navigator.gpu is unavailable'
    }));
  });

  test('attempts one automatic recovery after a lost device', async () => {
    const WebGPUEmojiEngine = loadEngine({ gpu: {} });
    const states = [];
    const engine = new WebGPUEmojiEngine({}, { onState: state => states.push(state) });
    engine.device = {
      addEventListener: jest.fn(),
      lost: Promise.resolve({ message: 'test device loss' })
    };
    engine.init = jest.fn().mockResolvedValue(true);

    engine._watchDevice();
    await new Promise(resolve => setImmediate(resolve));

    expect(states).toContainEqual(expect.objectContaining({ state: 'device-lost', reason: 'test device loss' }));
    expect(engine.init).toHaveBeenCalledTimes(1);
    expect(engine.recoveryAttempted).toBe(true);
  });

  test('exposes the agreed profiles and fresh v3 configuration', () => {
    const config = read('plugins/webgpu-emoji-rain/lib/webgpu-config.js');
    const ui = read('plugins/webgpu-emoji-rain/ui.html');
    expect(config).toContain("renderer_profile: 'hybrid'");
    expect(config).toContain("new Set(['hybrid', 'cinematic', 'neon'])");
    expect(config).toContain("quality_preset: 'auto'");
    expect(ui).toContain('value="hybrid"');
    expect(ui).toContain('value="cinematic"');
    expect(ui).toContain('value="neon"');
    expect(ui).toContain('id="gpu_collisions_enabled"');
  });

  test('dashboard exposes a separate view for each renderer', () => {
    const dashboard = read('public/dashboard.html');
    expect(dashboard).toContain('data-view="emoji-rain" data-plugin="emoji-rain"');
    expect(dashboard).toContain('data-view="webgpu-emoji-rain" data-plugin="webgpu-emoji-rain"');
    expect(dashboard).toContain('data-src="/emoji-rain/ui"');
    expect(dashboard).toContain('data-src="/webgpu-emoji-rain/ui"');
  });
});
