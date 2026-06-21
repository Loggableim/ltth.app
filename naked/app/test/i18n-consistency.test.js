const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const locales = ['en', 'de', 'es', 'fr'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function flattenKeys(value, prefix = '', keys = []) {
  Object.entries(value || {}).forEach(([key, child]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isObject(child)) {
      flattenKeys(child, fullKey, keys);
    } else {
      keys.push(fullKey);
    }
  });
  return keys;
}

function expectSameKeys(reference, actual) {
  const referenceSet = new Set(reference);
  const actualSet = new Set(actual);
  const missing = reference.filter(key => !actualSet.has(key));
  const extra = actual.filter(key => !referenceSet.has(key));

  expect({ missing, extra }).toEqual({ missing: [], extra: [] });
}

describe('i18n locale consistency', () => {
  test('central locale files expose the same keys for every supported language', () => {
    const localeKeys = Object.fromEntries(locales.map(locale => {
      const filePath = path.join(appRoot, 'locales', `${locale}.json`);
      return [locale, flattenKeys(readJson(filePath)).sort()];
    }));

    locales.forEach(locale => {
      expectSameKeys(localeKeys.en, localeKeys[locale]);
    });
  });

  test('plugin locale files expose the same keys for every supported language', () => {
    const pluginsDir = path.join(appRoot, 'plugins');
    const plugins = fs.readdirSync(pluginsDir);

    plugins.forEach(plugin => {
      const localesDir = path.join(pluginsDir, plugin, 'locales');
      if (!fs.existsSync(localesDir)) return;

      const localeKeys = Object.fromEntries(locales.map(locale => {
        const filePath = path.join(localesDir, `${locale}.json`);
        expect(fs.existsSync(filePath)).toBe(true);
        return [locale, flattenKeys(readJson(filePath)).sort()];
      }));

      locales.forEach(locale => {
        expectSameKeys(localeKeys.en, localeKeys[locale]);
      });
    });
  });
});
