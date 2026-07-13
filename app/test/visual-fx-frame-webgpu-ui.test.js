const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'visual-fx-frame-webgpu');
const settings = fs.readFileSync(path.join(pluginRoot, 'ui', 'settings.html'), 'utf8');

describe('Visual FX Frame WEBGPU Control Room', () => {
  test('offers the three approved visual styles', () => {
    expect(settings).toContain('id="visualStyle"');
    expect(settings).toContain('<option value="realistic"');
    expect(settings).toContain('<option value="neon"');
    expect(settings).toContain('<option value="hybrid"');
    expect(settings).toContain("visualStyle: document.getElementById('visualStyle').value");
  });

  test('shows live WebGPU adapter and performance metrics', () => {
    for (const id of [
      'webgpuRuntimeState', 'webgpuAdapter', 'webgpuFps', 'webgpuCpuTime',
      'webgpuGpuTime', 'webgpuRenderScale', 'webgpuBudgets'
    ]) expect(settings).toContain(`id="${id}"`);
    expect(settings).toContain("fetch('/api/visual-fx-frame-webgpu/status'");
    expect(settings).toContain('setInterval(loadWebGPUStatus, 2000)');
  });

  test('previews and confirms the one-time legacy import', () => {
    expect(settings).toContain('id="importFlameOverlayBtn"');
    expect(settings).toContain("fetch('/api/visual-fx-frame-webgpu/import/flame-overlay'");
    expect(settings).toContain('confirm: true');
    expect(settings).toContain('overwritePresets');
  });

  test('contains complete WebGPU labels in all plugin locales', () => {
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const messages = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8').replace(/^\uFEFF/, ''));
      expect(messages.visual_fx_frame_webgpu.webgpu).toMatchObject({
        visualStyle: expect.any(String),
        runtime: expect.any(String),
        adapter: expect.any(String),
        import: expect.any(String)
      });
    }
  });
});
