const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
const read = relative => fs.readFileSync(path.join(pluginRoot, relative), 'utf8');
const {
  DEFAULT_FIREWORKS_CONFIG,
  normalizeConfig,
  normalizeFireworkTrigger
} = require('../plugins/webgpu-fireworks/lib/config-schema');

describe('WebGPU Fireworks crackling settings contract', () => {
  test('adds compatible defaults and clamps persisted values', () => {
    expect(DEFAULT_FIREWORKS_CONFIG).toMatchObject({
      crackleFrequency: 0.5,
      crackleVolume: 0.75
    });
    expect(normalizeConfig({})).toMatchObject({
      crackleFrequency: 0.5,
      crackleVolume: 0.75
    });
    expect(normalizeConfig({ crackleFrequency: -4, crackleVolume: 8 })).toMatchObject({
      crackleFrequency: 0,
      crackleVolume: 1
    });
    expect(normalizeConfig({ crackleFrequency: 0.35, crackleVolume: 0.6 })).toMatchObject({
      crackleFrequency: 0.35,
      crackleVolume: 0.6
    });
  });

  test('only accepts explicit boolean trigger overrides', () => {
    expect(normalizeFireworkTrigger({ crackleEnabled: true }).crackleEnabled).toBe(true);
    expect(normalizeFireworkTrigger({ crackleEnabled: false }).crackleEnabled).toBe(false);
    expect(normalizeFireworkTrigger({ crackleEnabled: 'true' }).crackleEnabled).toBeUndefined();
  });

  test('forwards crackling configuration to rockets and finales', () => {
    const mainSource = read('main.js');
    expect(mainSource).toContain('crackleFrequency: effectiveConfig.crackleFrequency');
    expect(mainSource).toContain('crackleVolume: effectiveConfig.crackleVolume');
    expect(mainSource).toContain("crackleEnabled: typeof options.crackleEnabled === 'boolean'");
  });

  test('exposes controls and a full crackling rocket test action', () => {
    const settingsHtml = read('ui/settings.html');
    const settingsSource = read('ui/settings.js');
    expect(settingsHtml).toContain('id="crackle-frequency"');
    expect(settingsHtml).toContain('id="crackle-volume"');
    expect(settingsHtml).toContain('id="test-crackle-btn"');
    expect(settingsSource).toContain('config.crackleFrequency = val / 100');
    expect(settingsSource).toContain('config.crackleVolume = val / 100');
    expect(settingsSource).toContain('async function triggerTestCrackle()');
    expect(settingsSource).toContain('crackleEnabled: true');
    expect(settingsSource).toContain('forceRocket: true');
  });

  test('keeps detailed mixer and timeline telemetry visible and bounded', () => {
    const mainSource = read('main.js');
    const settingsHtml = read('ui/settings.html');
    for (const field of [
      'lastAudioProfile',
      'crackleState',
      'activeVoices',
      'audioEvictions',
      'missedAudioEvents',
      'audioPeak',
      'timelineEvents'
    ]) expect(mainSource).toContain(field);
    expect(mainSource).toContain('data.timelineEvents.slice(-32)');
    for (const id of [
      'webgpu-crackle-state',
      'webgpu-audio-profile',
      'webgpu-audio-voices',
      'webgpu-audio-events',
      'webgpu-audio-peak',
      'webgpu-timeline-sync'
    ]) expect(settingsHtml).toContain(`id="${id}"`);
  });

  test('cache-busts every updated overlay and settings script', () => {
    const overlay = read('overlay.html');
    const settingsHtml = read('ui/settings.html');
    expect(overlay).toContain('spawn-command-policy.js?v=3.1.0-depth3d-1');
    expect(overlay).toContain('visible-envelope.js?v=3.1.0-glyph-envelope-1');
    expect(overlay).toContain('boykisser-geometry.js?v=3.1.0-particle-rocket-1');
    expect(overlay).toContain('webgpu-particle-engine.js?v=3.1.0-particle-rocket-1');
    expect(overlay).toContain('show-plan-v2-runtime.js?v=3.1.0-particle-rocket-1');
    expect(overlay).toContain('engine.js?v=3.1.0-particle-rocket-1');
    expect(settingsHtml).toContain('show-style-options.js?v=3.1.0-depth3d-1');
    expect(settingsHtml).toContain('settings.js?v=3.1.0-benchmark-session-2');
  });
});
