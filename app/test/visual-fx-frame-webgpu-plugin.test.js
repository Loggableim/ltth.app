const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', '..', 'plugin-store', 'sources', 'visual-fx-frame-webgpu');
const read = relativePath => fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');

describe('Visual FX Frame WEBGPU plugin contract', () => {
  test('ships as an independent disabled working beta', () => {
    const manifest = JSON.parse(read('plugin.json'));

    expect(manifest).toMatchObject({
      id: 'visual-fx-frame-webgpu',
      name: 'Visual FX Frame WEBGPU',
      version: '1.2.0',
      enabled: false,
      devStatus: 'working-beta'
    });
    expect(manifest.features).toEqual(expect.arrayContaining([
      'webgpu-compute-simulation',
      'webgpu-indirect-rendering',
      'hdr-bloom-pipeline',
      'adaptive-quality',
      'subscriber-beta',
      'visual-variants',
      'premium-frame-designs'
    ]));
  });

  test('uses only its own route, socket, and flow namespaces', () => {
    const mainSource = read('main.js');

    for (const contract of [
      '/visual-fx-frame-webgpu/ui',
      '/visual-fx-frame-webgpu/overlay',
      '/api/visual-fx-frame-webgpu/config',
      '/api/visual-fx-frame-webgpu/import/flame-overlay',
      'visual-fx-frame-webgpu:config-update',
      'visual-fx-frame-webgpu:renderer-status',
      'visual-fx-frame-webgpu.trigger',
      'flow:visual-fx-frame-webgpu:trigger'
    ]) expect(mainSource).toContain(contract);

    expect(mainSource).not.toContain("api.emit('flame-overlay:");
    expect(mainSource).not.toContain("registerFlowAction('flame-overlay.");
  });

  test('loads a native WebGPU-only renderer', () => {
    const overlaySource = read('renderer/index.html');
    const rendererSource = read('renderer/webgpu-effects-engine.js');

    expect(overlaySource).toContain('webgpu-effects-engine.js');
    expect(overlaySource).toContain('overlay-controller.js');
    expect(rendererSource).toContain('navigator.gpu.requestAdapter');
    expect(rendererSource).toContain("getContext('webgpu')");
    expect(rendererSource).toContain("alphaMode: 'premultiplied'");
    expect(rendererSource).not.toMatch(/getContext\(['\"]webgl/i);
    expect(overlaySource).not.toContain('src="/visual-fx-frame-webgpu/effects-engine.js"');
    expect(overlaySource).not.toContain('src="/visual-fx-frame-webgpu/post-processor.js"');
  });
});
