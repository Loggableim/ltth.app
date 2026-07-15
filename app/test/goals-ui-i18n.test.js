'use strict';

const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'goals');
const locales = ['de', 'en', 'es', 'fr'];

const requiredKeys = [
  'ui.connection.connected',
  'ui.tabs.goals',
  'ui.tabs.multigoals',
  'ui.fonts.impact',
  'ui.fonts.system',
  'ui.fonts.arial',
  'ui.fonts.helvetica',
  'ui.fonts.georgia',
  'ui.fonts.verdana'
];

function read(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function getLeaf(object, key) {
  return key.split('.').reduce((value, part) => value && value[part], object);
}

describe('Goals static UI localization', () => {
  test('loads the shared i18n client', () => {
    expect(read('ui.html')).toContain('/js/i18n-client.js');
  });

  test('marks the remaining static controls with plugin locale keys', () => {
    const html = read('ui.html');

    requiredKeys.forEach((key) => {
      expect(html).toContain(`data-i18n="plugins.goals.goals.${key}"`);
    });
  });

  locales.forEach((locale) => {
    test(`provides every new UI label in ${locale}`, () => {
      const catalog = JSON.parse(read(`locales/${locale}.json`));

      requiredKeys.forEach((key) => {
        expect(getLeaf(catalog.plugins.goals.goals, key)).toEqual(expect.any(String));
        expect(getLeaf(catalog.plugins.goals.goals, key).trim()).not.toBe('');
      });
    });
  });
});
