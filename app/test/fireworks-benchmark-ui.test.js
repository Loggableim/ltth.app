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

  beforeAll(() => {
    settingsHtml = readAppFile('plugins', 'fireworks', 'ui', 'settings.html');
    settingsJs = readAppFile('plugins', 'fireworks', 'ui', 'settings.js');
    mainJs = readAppFile('plugins', 'fireworks', 'main.js');
    enLocale = JSON.parse(readAppFile('locales', 'en.json'));
    deLocale = JSON.parse(readAppFile('locales', 'de.json'));
  });

  test('all settings page i18n keys resolve from app locales', () => {
    const domKeys = Array.from(settingsHtml.matchAll(/data-i18n="([^"]+)"/g), match => match[1]);
    const scriptKeys = Array.from(settingsJs.matchAll(/i18n\.t\('([^']+)'\)/g), match => match[1]);
    const keys = [...new Set([...domKeys, ...scriptKeys])];

    for (const [localeName, locale] of [['en', enLocale], ['de', deLocale]]) {
      const missing = keys.filter(key => getDottedValue(locale, key) === undefined);

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
    expect(mainJs).toContain("internalMaxResolutionPreset: '1080p'");
    expect(mainJs).toContain("internalMinResolutionPreset: '480p'");
    expect(mainJs).toContain('adaptiveRenderScaleEnabled: true');
    expect(settingsHtml).toContain('id="internal-max-resolution"');
    expect(settingsHtml).toContain('id="internal-min-resolution"');
    expect(settingsHtml).toContain('value="4k"');
    expect(settingsHtml).toContain('value="480p"');
    expect(settingsJs).toContain('config.internalMaxResolutionPreset');
    expect(settingsJs).toContain('config.internalMinResolutionPreset');
    expect(settingsJs).toContain('updateInternalResolutionInfo');
  });
});
