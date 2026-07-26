/**
 * Fireworks benchmark UI regression tests
 */

const fs = require('fs');
const path = require('path');

function readAppFile(...segments) {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8');
}

function getDottedValue(object, dottedKey) {
  return dottedKey.split('.').reduce((value, segment) => {
    if (!value || !Object.prototype.hasOwnProperty.call(value, segment)) {
      return undefined;
    }
    return value[segment];
  }, object);
}

describe('Fireworks benchmark UI', () => {
  let settingsHtml;
  let settingsJs;
  let mainJs;
  let enLocale;
  let deLocale;
  let appEnLocale;
  let appDeLocale;

  beforeAll(() => {
    settingsHtml = readAppFile('plugins', 'fireworks', 'ui', 'settings.html');
    settingsJs = readAppFile('plugins', 'fireworks', 'ui', 'settings.js');
    mainJs = readAppFile('plugins', 'fireworks', 'main.js');
    enLocale = JSON.parse(readAppFile('plugins', 'fireworks', 'locales', 'en.json'));
    deLocale = JSON.parse(readAppFile('plugins', 'fireworks', 'locales', 'de.json'));
    appEnLocale = JSON.parse(readAppFile('locales', 'en.json'));
    appDeLocale = JSON.parse(readAppFile('locales', 'de.json'));
  });

  test('all settings page i18n keys resolve from merged app and plugin locales', () => {
    const domKeys = Array.from(settingsHtml.matchAll(/data-i18n="([^"]+)"/g), match => match[1]);
    const scriptKeys = Array.from(settingsJs.matchAll(/i18n\.t\('([^']+)'\)/g), match => match[1]);
    const keys = [...new Set([...domKeys, ...scriptKeys])];

    for (const [localeName, pluginLocale, appLocale] of [
      ['en', enLocale, appEnLocale],
      ['de', deLocale, appDeLocale]
    ]) {
      const missing = keys.filter(key => {
        const source = key.startsWith('plugins.fireworks.') ? pluginLocale : appLocale;
        return getDottedValue(source, key) === undefined;
      });

      expect(missing).toEqual([]);
    }
  });

  test('benchmark opens the registered overlay route', () => {
    expect(mainJs).toContain("'/fireworks/overlay'");
    expect(settingsJs).toContain('/fireworks/overlay?benchmark=true');
    expect(settingsJs).not.toContain('/fireworks/obs-overlay');
  });

  test('benchmark restores original config after temporary presets', () => {
    expect(settingsJs).toContain('/api/fireworks/benchmark/restore');
    expect(settingsJs).toMatch(/finally\s*{[\s\S]*restoreBenchmarkPreset\(\)/);
    expect(mainJs).toMatch(/if \(!this\.benchmarkPreset\)\s*{[\s\S]*this\.benchmarkPreset = { \.\.\.this\.config };/);
  });

  test('settings expose OBS-safe adaptive internal resolution bounds', () => {
    expect(mainJs).toContain("resolutionPreset: '1080p'");
    expect(mainJs).toContain("internalMaxResolutionPreset: '4k'");
    expect(mainJs).toContain("internalMinResolutionPreset: '540p'");
    expect(mainJs).toContain('adaptiveRenderScaleEnabled: true');
    expect(settingsHtml).toContain('id="internal-max-resolution"');
    expect(settingsHtml).toContain('id="internal-min-resolution"');
    expect(settingsHtml).toContain('id="orientation-select"');
    expect(settingsHtml).toContain('value="4k"');
    expect(settingsHtml).toContain('value="540p"');
    expect(settingsJs).toContain('config.internalMaxResolutionPreset');
    expect(settingsJs).toContain('config.internalMinResolutionPreset');
    expect(settingsJs).toContain('updateOrientationControls');
    expect(settingsJs).toContain('updateInternalResolutionInfo');
    expect(settingsHtml).toContain('id="orientation-select"');
  });

  test('overlay canvas preserves aspect ratio in browser capture', () => {
    const overlayHtml = readAppFile('plugins', 'fireworks', 'overlay.html');
    expect(overlayHtml).toContain('id="fireworks-transition-canvas"');
    expect(overlayHtml).toContain('body.portrait #fireworks-canvas');
    expect(overlayHtml).toContain('body.landscape #fireworks-canvas');
    expect(overlayHtml).toContain('object-fit: contain');
    expect(readAppFile('plugins', 'fireworks', 'overlay.html')).toContain('object-position: center center');
  });

  test('preset and benchmark tabs are prioritized ahead of settings', () => {
    expect(settingsHtml).toContain('data-tab="settings"');
    expect(settingsHtml).toContain('data-tab="presets"');
    expect(settingsHtml).toContain('data-tab="benchmark"');
    expect(settingsHtml).toContain('id="presets" class="tab-content active"');
  });

  test('fireworks english labels do not fall back to question marks', () => {
    const keys = [
      'plugins.fireworks.fireworks.save_settings',
      'plugins.fireworks.fireworks.gift_triggers',
      'plugins.fireworks.fireworks.combo_system',
      'plugins.fireworks.fireworks.explosion_shapes',
      'plugins.fireworks.fireworks.test_burst',
      'plugins.fireworks.fireworks.test_heart',
      'plugins.fireworks.fireworks.test_star',
      'plugins.fireworks.fireworks.test_ring',
      'plugins.fireworks.fireworks.test_spiral',
      'plugins.fireworks.fireworks.test_paws',
      'plugins.fireworks.fireworks.test_random',
      'plugins.fireworks.fireworks.colors',
      'plugins.fireworks.fireworks.visual_effects'
    ];

    for (const key of keys) {
      const value = getDottedValue(enLocale, key);
      expect(value).toBeDefined();
      expect(value).not.toMatch(/^\?+/);
    }
  });
});
