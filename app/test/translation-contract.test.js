const fs = require('fs');
const path = require('path');

const locales = ['en', 'de', 'es', 'fr'];

function flatten(value, prefix = '', result = new Set()) {
  Object.entries(value || {}).forEach(([key, child]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, full, result);
    else result.add(full);
  });
  return result;
}

function flattenValues(value, result = []) {
  Object.values(value || {}).forEach((child) => {
    if (child && typeof child === 'object' && !Array.isArray(child)) flattenValues(child, result);
    else result.push(child);
  });
  return result;
}

describe('translation contract', () => {
  test('every manifest-backed plugin ships all four locale files', () => {
    const pluginsRoot = path.join(__dirname, '..', 'plugins');
    const plugins = fs.readdirSync(pluginsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name !== '_uploads' && fs.existsSync(path.join(pluginsRoot, entry.name, 'plugin.json')))
      .map(entry => entry.name);

    plugins.forEach(plugin => {
      const localeRoot = path.join(pluginsRoot, plugin, 'locales');
      const parsed = Object.fromEntries(locales.map(locale => {
        const file = path.join(localeRoot, `${locale}.json`);
        expect(fs.existsSync(file)).toBe(true);
        return [locale, JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))];
      }));
      const reference = [...flatten(parsed.en)].sort();
      locales.forEach(locale => expect([...flatten(parsed[locale])].sort()).toEqual(reference));
    });
  });

  test('the generated inventory is clean', () => {
    const report = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'validation-report.json'), 'utf8'));
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });

  test('the standalone home-page locale maps keep the same FAQ coverage', () => {
    const localeRoot = path.join(__dirname, '..', '..', 'locales');
    const homeLocales = Object.fromEntries(locales.map((locale) => {
      const file = path.join(localeRoot, `home-${locale}.json`);
      return [locale, JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))];
    }));
    const reference = Object.keys(homeLocales.en).sort();

    locales.forEach((locale) => {
      expect(Object.keys(homeLocales[locale]).sort()).toEqual(reference);
      expect(flattenValues(homeLocales[locale]).every((value) => typeof value === 'string' && value.trim())).toBe(true);
    });
  });

  test('the runtime payload includes locales for disabled plugin pages', () => {
    jest.resetModules();
    const runtimeI18n = require('../modules/i18n');
    const french = runtimeI18n.getAllTranslations('fr');
    expect(french.plugins['webgpu-fireworks'].webgpu_fireworks.webgpu_obs_required).toBe('OBS WebGPU requis');
    expect(french.plugins['webgpu-emoji-rain']).toBeDefined();
    expect(french.webgpu_fireworks).toBeUndefined();
  });
});
