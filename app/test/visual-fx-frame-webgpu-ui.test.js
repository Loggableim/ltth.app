const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', '..', 'plugin-store', 'sources', 'visual-fx-frame-webgpu');
const settings = fs.readFileSync(path.join(pluginRoot, 'ui', 'settings.html'), 'utf8');
const appRoot = path.join(__dirname, '..');
const dashboard = fs.readFileSync(path.join(appRoot, 'public', 'dashboard.html'), 'utf8');
const navigation = fs.readFileSync(path.join(appRoot, 'public', 'js', 'navigation.js'), 'utf8');

function readVisualPresets() {
  const match = settings.match(/const VISUAL_PRESETS = (\{[\s\S]*?\n        \});/);
  if (!match) throw new Error('VISUAL_PRESETS declaration missing');
  return Function(`"use strict"; return (${match[1]});`)();
}

describe('Visual FX Frame WEBGPU Control Room', () => {
  test('offers the three approved visual styles', () => {
    expect(settings).toContain('id="visualStyle"');
    expect(settings).toContain('<option value="realistic"');
    expect(settings).toContain('<option value="neon"');
    expect(settings).toContain('<option value="hybrid"');
    expect(settings).toContain("visualStyle: document.getElementById('visualStyle').value");
  });

  test('offers exactly the three 1.1 variants without overwriting geometry or triggers', () => {
    const presets = readVisualPresets();
    expect(Object.keys(presets)).toEqual(['inferno-forge', 'neon-pulse', 'storm-portal']);
    expect(settings.match(/data-visual-preset=/g)).toHaveLength(3);
    expect(settings).toContain('data-visual-preset="inferno-forge"');
    expect(settings).toContain('data-visual-preset="neon-pulse"');
    expect(settings).toContain('data-visual-preset="storm-portal"');

    for (const preset of Object.values(presets)) {
      for (const protectedField of [
        'resolutionPreset', 'customWidth', 'customHeight', 'frameMode',
        'framePositions', 'triggerRules', 'triggerPreset', 'triggerCooldown', 'triggerMaxStack'
      ]) expect(preset).not.toHaveProperty(protectedField);
    }
  });

  test('supports five-pixel frames and the new material controls', () => {
    expect(settings).toContain('id="frameThickness" min="5" max="500" value="150" step="5"');
    for (const id of ['frameStyle', 'secondaryColor', 'frameGap', 'segmentCount', 'pulsePattern']) {
      expect(settings).toContain(`id="${id}"`);
    }
  });

  test('groups the five premium designs and reveals two contextual controls for the active style', () => {
    expect(settings).toContain('id="premiumFrameStyles"');
    for (const frameStyle of ['solar-forge', 'prism-reactor', 'arcane-bloom', 'tempest-rift', 'quantum-circuit']) {
      expect(settings).toContain(`value="${frameStyle}"`);
      expect(settings).toContain(`data-frame-design="${frameStyle}"`);
    }
    for (const control of [
      'emberFlow', 'moltenCrust', 'refraction', 'sweepSpeed', 'runeDensity',
      'orbitSpeed', 'arcCount', 'riftTurbulence', 'traceDensity', 'hudSweep'
    ]) expect(settings).toContain(`id="designControl-${control}"`);
    expect(settings).toContain('function updateDesignControlVisibility()');
    expect(settings).toContain('designControls: collectDesignControls()');
  });

  test('keeps variant application preview-only and marks manual edits custom', () => {
    const applyBody = settings.match(/function applyVisualPreset\(name\) \{([\s\S]*?)\n        \}/)?.[1] || '';
    expect(applyBody).not.toContain('debouncedSaveConfig');
    expect(settings).toContain('function markVisualVariantCustom()');
    expect(settings).toContain("visualVariant: currentVisualVariant");
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
        import: expect.any(String),
        variants: expect.any(Object)
      });
      expect(messages.visual_fx_frame_webgpu.webgpu.frameDesigns).toMatchObject({
        solarForge: expect.any(String),
        prismReactor: expect.any(String),
        arcaneBloom: expect.any(String),
        tempestRift: expect.any(String),
        quantumCircuit: expect.any(String)
      });
    }
  });

  test('integrates the enabled plugin into the dashboard sidebar', () => {
    expect(dashboard).toContain('data-view="visual-fx-frame-webgpu" data-plugin="visual-fx-frame-webgpu"');
    expect(dashboard).toContain('data-i18n="navigation.visual_fx_frame_webgpu"');
    expect(dashboard).toContain('id="view-visual-fx-frame-webgpu"');
    expect(dashboard).toContain('data-src="/visual-fx-frame-webgpu/ui"');
    expect(navigation).toContain("'visual-fx-frame-webgpu': '#22d3ee'");

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const messages = JSON.parse(fs.readFileSync(path.join(appRoot, 'locales', `${locale}.json`), 'utf8').replace(/^\uFEFF/, ''));
      expect(messages.navigation.visual_fx_frame_webgpu).toBe('Visual FX Frame WEBGPU');
    }
  });
});
