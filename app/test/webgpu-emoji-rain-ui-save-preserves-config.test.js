'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { DEFAULT_WEBGPU_CONFIG } = require('../plugins/webgpu-emoji-rain/lib/webgpu-config');

const uiHtml = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'webgpu-emoji-rain', 'ui.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'webgpu-emoji-rain-ui.js'), 'utf8');

function simulateNativeRangeStep(range) {
  const min = Number(range.min || 0);
  const max = Number(range.max || 100);
  const step = Number(range.step || 1);
  const value = Number(range.value);
  range.value = String(Math.min(max, min + Math.round((value - min) / step) * step));
}

async function createUiHarness(baseline) {
  const dom = new JSDOM(uiHtml, { runScripts: 'outside-only', url: 'http://127.0.0.1/webgpu-emoji-rain/ui' });
  const { window } = dom;
  window.io = () => ({ on() {}, emit() {} });
  window.i18n = { ready: Promise.resolve() };
  window.console.error = () => {};
  let postedPayload;
  window.fetch = jest.fn(async (url, options = {}) => {
    if (options.method === 'POST') {
      postedPayload = JSON.parse(options.body);
      return { ok: true, json: async () => ({ success: true, config: postedPayload.config }) };
    }
    if (url === '/api/webgpu-emoji-rain/config') {
      return { ok: true, json: async () => ({ success: true, config: baseline }) };
    }
    return { ok: true, json: async () => ({ success: true, images: [], mappings: [], renderer: {} }) };
  });
  window.eval(uiSource);
  await new Promise(resolve => window.setTimeout(resolve, 0));
  for (const input of window.document.querySelectorAll('input[type="range"]')) {
    if (Object.prototype.hasOwnProperty.call(baseline, input.id)) {
      input.value = String(baseline[input.id]);
      expect(Number(input.value)).toBeCloseTo(Number(baseline[input.id]), 8);
    }
  }
  window.document.querySelectorAll('input[type="range"]').forEach(simulateNativeRangeStep);
  window.setupRangeInputs();
  return { dom, window, getPostedPayload: () => postedPayload };
}

describe('WebGPU Emoji Rain UI config save', () => {
  test('preserves untouched loaded range values while saving a different range', async () => {
    const baseline = { ...DEFAULT_WEBGPU_CONFIG };
    const { dom, window, getPostedPayload } = await createUiHarness(baseline);
    const pixelSize = window.document.getElementById('pixel_size');
    pixelSize.value = '5';
    pixelSize.dispatchEvent(new window.Event('input', { bubbles: true }));

    await window.saveConfig();

    const posted = getPostedPayload().config;
    expect(posted.pixel_size).toBe(5);
    for (const key of [
      'physics_gravity_y', 'physics_air', 'physics_friction', 'physics_restitution',
      'bounce_height', 'superfan_burst_intensity', 'emoji_rotation_speed'
    ]) {
      expect(posted[key]).toBe(baseline[key]);
    }
    dom.window.close();
  });

  test('persists an intentionally changed range value', async () => {
    const baseline = { ...DEFAULT_WEBGPU_CONFIG };
    const { dom, window, getPostedPayload } = await createUiHarness(baseline);
    const physicsAir = window.document.getElementById('physics_air');
    physicsAir.value = '0.04';
    physicsAir.dispatchEvent(new window.Event('input', { bubbles: true }));

    await window.saveConfig();

    expect(getPostedPayload().config.physics_air).toBe(0.04);
    dom.window.close();
  });

  test('persists range values set by a visual preset', async () => {
    const baseline = { ...DEFAULT_WEBGPU_CONFIG };
    const { dom, window, getPostedPayload } = await createUiHarness(baseline);
    window.document.getElementById('visual_mode').value = 'retro_pixel';
    window.applyVisualModePreset();

    await window.saveConfig();

    const posted = getPostedPayload().config;
    expect(posted.pixel_size).toBe(5);
    expect(posted.emoji_rotation_speed).toBe(0.02);
    expect(posted.physics_gravity_y).toBe(baseline.physics_gravity_y);
    dom.window.close();
  });
});
