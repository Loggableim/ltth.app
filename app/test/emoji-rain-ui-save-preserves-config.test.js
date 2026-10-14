const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'emoji-rain');
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'emoji-rain-ui.js'), 'utf8');
const uiHtml = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

function simulateNativeRangeStep(range) {
  const min = Number(range.min || 0);
  const step = Number(range.step || 1);
  const value = Number(range.value);
  range.value = String(min + Math.round((value - min) / step) * step);
}

describe('Emoji Rain UI config save', () => {
  test('preserves untouched loaded values while saving an edited range and version marker', async () => {
    const dom = new JSDOM(uiHtml, { runScripts: 'outside-only', url: 'http://127.0.0.1/emoji-rain/ui' });
    const { window } = dom;
    window.document.addEventListener('DOMContentLoaded', event => event.stopImmediatePropagation(), { once: true });
    let postedConfig;
    window.io = () => ({ on() {}, emit() {} });
    window.fetch = jest.fn(async (_url, options) => {
      postedConfig = JSON.parse(options.body).config;
      return { json: async () => ({ success: true, config: postedConfig }) };
    });
    const baseline = {
      enabled: true,
      emoji_set: ['💧', '✨'],
      pupcid_defaults_version: 2,
      physics_gravity_y: 0.88,
      physics_air: 0.028,
      physics_friction: 0.11,
      physics_restitution: 0.62,
      bounce_height: 0.62,
      superfan_burst_intensity: 3.8,
      emoji_rotation_speed: 0.035,
      pixel_size: 4
    };
    window.eval(`${uiSource}\nconfig = ${JSON.stringify(baseline)};`);

    // The browser snaps these loaded values to each range's declared step.
    for (const id of Object.keys(baseline)) {
      const range = window.document.getElementById(id);
      if (range?.type === 'range') simulateNativeRangeStep(range);
    }
    window.setupRangeInputs();

    const pixelSize = window.document.getElementById('pixel_size');
    pixelSize.value = '7';
    pixelSize.dispatchEvent(new window.Event('input', { bubbles: true }));

    await window.saveConfig();

    expect(postedConfig.pixel_size).toBe(7);
    expect(postedConfig.pupcid_defaults_version).toBe(2);
    expect(postedConfig.physics_gravity_y).toBe(0.88);
    expect(postedConfig.physics_air).toBe(0.028);
    expect(postedConfig.physics_friction).toBe(0.11);
    expect(postedConfig.physics_restitution).toBe(0.62);
    expect(postedConfig.bounce_height).toBe(0.62);
    expect(postedConfig.superfan_burst_intensity).toBe(3.8);
    expect(postedConfig.emoji_rotation_speed).toBe(0.035);

    dom.window.close();
  });

  test('persists an explicitly changed range value', async () => {
    const dom = new JSDOM(uiHtml, { runScripts: 'outside-only', url: 'http://127.0.0.1/emoji-rain/ui' });
    const { window } = dom;
    window.document.addEventListener('DOMContentLoaded', event => event.stopImmediatePropagation(), { once: true });
    let postedConfig;
    window.io = () => ({ on() {}, emit() {} });
    window.fetch = jest.fn(async (_url, options) => {
      postedConfig = JSON.parse(options.body).config;
      return { json: async () => ({ success: true, config: postedConfig }) };
    });
    const baseline = {
      enabled: true,
      emoji_set: ['💧'],
      pupcid_defaults_version: 2,
      physics_air: 0.028
    };
    window.eval(`${uiSource}\nconfig = ${JSON.stringify(baseline)};`);

    const physicsAir = window.document.getElementById('physics_air');
    physicsAir.value = '0.04';
    window.setupRangeInputs();
    physicsAir.dispatchEvent(new window.Event('input', { bubbles: true }));

    await window.saveConfig();

    expect(postedConfig.physics_air).toBe(0.04);
    dom.window.close();
  });
});
