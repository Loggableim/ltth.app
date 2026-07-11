const fs = require('fs');
const path = require('path');

describe('config-import translation contract', () => {
  const pluginRoot = path.join(__dirname, '..', 'plugins', 'config-import');

  test('ships the shared client and UI namespace in every locale', () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    expect(html).toContain('/js/i18n-client.js');

    const locales = ['en', 'de', 'es', 'fr'].map(locale => JSON.parse(
      fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8').replace(/^\uFEFF/, '')
    ));
    const keys = locales.map(locale => Object.keys(locale['config-import'].ui || {}).sort());
    expect(keys[1]).toEqual(keys[0]);
    expect(keys[2]).toEqual(keys[0]);
    expect(keys[3]).toEqual(keys[0]);
    expect(keys[0].length).toBeGreaterThan(40);
    locales.forEach(locale => Object.values(locale['config-import'].ui).forEach(value => {
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
    }));
  });
});
