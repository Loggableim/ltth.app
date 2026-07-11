const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'chatango');
const locales = ['en', 'de', 'es', 'fr'];

function resolve(value, key) {
  return key.split('.').reduce((current, segment) => current && current[segment], value);
}

describe('Chatango UI translation contract', () => {
  test('every visible UI key exists in all four plugin locales', () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:="([^"]+)"|-(?:title|alt|aria-label|placeholder)="([^"]+)")/g)]
      .map(match => match[1] || match[2]);
    expect(keys.length).toBeGreaterThan(20);

    locales.forEach(locale => {
      const translation = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8')).chatango;
      keys.forEach(key => {
        const localKey = key.replace(/^chatango\./, '');
        expect(resolve(translation, localKey)).toEqual(expect.any(String));
        expect(resolve(translation, localKey).trim()).not.toBe('');
      });
    });
  });
});
