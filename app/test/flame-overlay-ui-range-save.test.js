'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { VISUAL_FX_DEFAULT_CONFIG } = require('../plugins/flame-overlay/default-config');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'flame-overlay');
const settingsPath = path.join(pluginRoot, 'ui', 'settings.html');
const settingsSource = fs.readFileSync(settingsPath, 'utf8');
const settingsHtml = settingsSource.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const uiScript = Array.from(settingsSource.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
  .map((match) => match[2])
  .find((script) => script.includes('function collectConfig'));
const rangeIds = [
  'frameThickness', 'backgroundTintOpacity', 'flameSpeed', 'flameIntensity', 'flameBrightness',
  'noiseOctaves', 'sparkDensity', 'edgeFeather', 'frameCurve', 'frameNoiseAmount', 'pulseAmount',
  'pulseSpeed', 'bloomIntensity', 'bloomThreshold', 'bloomRadius', 'layerCount', 'layerParallax',
  'chromaticAberration', 'filmGrain', 'depthIntensity', 'cinematicContrast', 'coreWhiteness',
  'emberTrailAmount', 'heatDistortionStrength', 'smokeIntensity', 'smokeSpeed', 'triggerCooldown',
  'triggerMaxStack'
];

function snapToRangeStep(range) {
  const min = Number(range.min || 0);
  const step = Number(range.step || 1);
  const value = Number(range.value);
  range.value = String(min + Math.round((value - min) / step) * step);
}

async function createSettings(configOverrides = {}) {
  const dom = new JSDOM(settingsHtml, { runScripts: 'outside-only', url: 'http://127.0.0.1/flame-overlay/ui' });
  const { window } = dom;
  const baseline = {
    ...VISUAL_FX_DEFAULT_CONFIG,
    ...configOverrides,
    triggersEnabled: true,
    chatColorCommands: true,
    triggerCooldown: 2000,
    triggerMaxStack: 5,
    triggerPreset: 'default',
    triggerRules: []
  };
  const postedConfigs = [];
  const pendingRequests = [];
  window.VISUAL_FX_DEFAULT_CONFIG = VISUAL_FX_DEFAULT_CONFIG;
  window.i18n = {
    t: (key, params = {}) => key === 'plugins.flame-overlay.flame_overlay.ui.messages.valuePixels'
      ? `${params.value} Pixel`
      : key === 'plugins.flame-overlay.labels.150_px' ? '150 px' : key,
    onLanguageChange() {},
    updateDOM() {
      window.document.querySelectorAll('[data-i18n]').forEach(element => {
        const translation = this.t(element.getAttribute('data-i18n'));
        if (translation !== element.getAttribute('data-i18n')) element.textContent = translation;
      });
    }
  };
  window.io = () => ({ on() {}, emit() {} });
  const requestHandler = (url, options = {}) => {
    const method = options.method || 'GET';
    if (url === '/api/flame-overlay/config' && method === 'GET') {
      return { json: async () => ({ success: true, config: baseline }) };
    }
    if (url === '/api/flame-overlay/config' && method === 'POST') {
      postedConfigs.push(JSON.parse(options.body));
      return { json: async () => ({ success: true }) };
    }
    if (url === '/api/flame-overlay/triggers') return { json: async () => ({ success: true, rules: [] }) };
    if (url === '/api/flame-overlay/gift-catalog') return { json: async () => ({ success: true, gifts: [] }) };
    if (url === '/api/flame-overlay/presets') return { json: async () => ({ success: true, presets: {} }) };
    throw new Error(`Unexpected test request: ${method} ${url}`);
  };
  window.fetch = jest.fn((url, options = {}) => {
    const request = Promise.resolve().then(() => requestHandler(url, options));
    pendingRequests.push(request);
    return request;
  });

  window.eval(uiScript.replace(/\n\s*loadConfig\(\);\s*$/, '\n        // Test invokes the same loader explicitly.'));
  await window.loadConfig();
  await Promise.all(pendingRequests);
  await new Promise(resolve => setTimeout(resolve, 0));
  for (const id of rangeIds) {
    const range = window.document.getElementById(id);
    if (range) snapToRangeStep(range);
  }

  async function saveFromUi() {
    const count = postedConfigs.length;
    window.document.getElementById('saveConfigBtn').click();
    for (let attempt = 0; attempt < 20 && postedConfigs.length === count; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (postedConfigs.length === count) throw new Error('Settings Save button did not submit a config');
    await Promise.all(pendingRequests);
    await new Promise(resolve => setTimeout(resolve, 0));
    return postedConfigs[postedConfigs.length - 1];
  }

  return { dom, window, baseline, postedConfigs, pendingRequests, requestHandler, saveFromUi };
}

describe('Flame Overlay UI range save', () => {
  test('keeps the localized dynamic value after the i18n client updates static labels', async () => {
    const { dom, window } = await createSettings({ frameThickness: 160 });
    window.i18n.updateDOM();

    expect(window.document.getElementById('frameThickness').value).toBe('160');
    expect(window.document.getElementById('frameThicknessValue').textContent).toBe('160 Pixel');

    dom.window.close();
  });

  test('keeps all loaded range values on an unchanged form save', async () => {
    const { dom, baseline, saveFromUi } = await createSettings();
    const posted = await saveFromUi();

    for (const id of rangeIds) {
      expect(posted[id]).toBe(baseline[id]);
    }

    dom.window.close();
  });

  test('submits only the deliberately changed frame thickness range value', async () => {
    const { dom, window, baseline, saveFromUi } = await createSettings();
    const slider = window.document.getElementById('frameThickness');
    slider.value = '160';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));

    const posted = await saveFromUi();
    const changedRanges = rangeIds.filter(id => posted[id] !== baseline[id]);
    expect(posted.frameThickness).toBe(160);
    expect(changedRanges).toEqual(['frameThickness']);

    const repeatedSave = await saveFromUi();
    expect(repeatedSave.frameThickness).toBe(160);
    for (const id of rangeIds.filter(id => id !== 'frameThickness')) {
      expect(repeatedSave[id]).toBe(baseline[id]);
    }

    dom.window.close();
  });

  test('submits range values changed by a visual preset and preserves untouched loaded values', async () => {
    const { dom, window, baseline, saveFromUi } = await createSettings();
    window.document.querySelector('[data-visual-preset="clean-broadcast"]').click();

    const expectedBloomIntensity = Number(window.document.getElementById('bloomIntensity').value);
    const posted = await saveFromUi();
    expect(posted.bloomIntensity).toBe(expectedBloomIntensity);
    expect(posted.bloomIntensity).not.toBe(baseline.bloomIntensity);
    expect(posted.smokeSpeed).toBe(baseline.smokeSpeed);

    dom.window.close();
  });

  test('ignores an older save response that arrives after a newer slider save', async () => {
    const { dom, window, baseline, postedConfigs, requestHandler } = await createSettings();
    const pendingSaves = [];
    const backgroundRequests = [];
    window.fetch.mockImplementation((url, options = {}) => {
      if (url === '/api/flame-overlay/config' && options.method === 'POST') {
        postedConfigs.push(JSON.parse(options.body));
        return new Promise(resolve => pendingSaves.push(() => resolve({ json: async () => ({ success: true }) })));
      }
      const request = Promise.resolve().then(() => requestHandler(url, options));
      backgroundRequests.push(request);
      return request;
    });

    async function submitSliderValue(value) {
      const expectedPendingSaves = pendingSaves.length + 1;
      const slider = window.document.getElementById('frameThickness');
      slider.value = String(value);
      slider.dispatchEvent(new window.Event('input', { bubbles: true }));
      window.document.getElementById('saveConfigBtn').click();
      for (let attempt = 0; attempt < 20 && pendingSaves.length < expectedPendingSaves; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (pendingSaves.length < expectedPendingSaves) throw new Error('Save request did not become pending');
    }

    async function submitWithoutInput() {
      const expectedPendingSaves = pendingSaves.length + 1;
      window.document.getElementById('saveConfigBtn').click();
      for (let attempt = 0; attempt < 20 && pendingSaves.length < expectedPendingSaves; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (pendingSaves.length < expectedPendingSaves) throw new Error('Save request did not become pending');
      return postedConfigs[postedConfigs.length - 1];
    }

    await submitSliderValue(160);
    await submitSliderValue(170);
    pendingSaves[1]();
    await new Promise(resolve => setTimeout(resolve, 0));
    pendingSaves[0]();
    await new Promise(resolve => setTimeout(resolve, 0));

    const repeatedSave = await submitWithoutInput();
    expect(repeatedSave.frameThickness).toBe(170);
    expect(rangeIds.filter(id => repeatedSave[id] !== baseline[id])).toEqual(['frameThickness']);
    pendingSaves[2]();
    await new Promise(resolve => setTimeout(resolve, 0));

    dom.window.close();
  });

  test('ignores a pending save response after a newer config load', async () => {
    const { dom, window, baseline, postedConfigs, requestHandler } = await createSettings();
    const pendingSaves = [];
    const backgroundRequests = [];
    window.fetch.mockImplementation((url, options = {}) => {
      if (url === '/api/flame-overlay/config' && options.method === 'POST') {
        postedConfigs.push(JSON.parse(options.body));
        return new Promise(resolve => pendingSaves.push(() => resolve({ json: async () => ({ success: true }) })));
      }
      const request = Promise.resolve().then(() => requestHandler(url, options));
      backgroundRequests.push(request);
      return request;
    });

    const slider = window.document.getElementById('frameThickness');
    slider.value = '160';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    window.document.getElementById('saveConfigBtn').click();
    for (let attempt = 0; attempt < 20 && pendingSaves.length === 0; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(pendingSaves).toHaveLength(1);

    baseline.frameThickness = 180;
    await window.loadConfig();
    await Promise.all(backgroundRequests);
    await new Promise(resolve => setTimeout(resolve, 0));
    pendingSaves[0]();
    await new Promise(resolve => setTimeout(resolve, 0));

    const saveCount = postedConfigs.length;
    window.document.getElementById('saveConfigBtn').click();
    for (let attempt = 0; attempt < 20 && postedConfigs.length === saveCount; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(postedConfigs[saveCount].frameThickness).toBe(180);
    expect(postedConfigs[saveCount].smokeSpeed).toBe(baseline.smokeSpeed);
    pendingSaves[1]();
    await new Promise(resolve => setTimeout(resolve, 0));

    dom.window.close();
  });
});
