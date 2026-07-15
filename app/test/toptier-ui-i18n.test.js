'use strict';

const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'toptier');
const locales = ['de', 'en', 'es', 'fr'];

function read(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function getLeaf(object, key) {
  return key.split('.').reduce((value, part) => value && value[part], object);
}

describe('TopTier static UI localization', () => {
  const requiredKeys = [
    'actions.copy',
    'navigation.likes', 'navigation.gifts', 'navigation.decay', 'navigation.controls',
    'table.rank', 'table.user', 'table.change',
    'labels.orientation', 'labels.theme', 'labels.size',
    'options.night', 'options.day', 'options.cid', 'options.landscape', 'options.portrait',
    'options.linear', 'options.percentage', 'options.idle', 'options.step'
  ];

  test('uses stable TopTier keys for every audited control', () => {
    const source = read('ui.html');
    requiredKeys.forEach((key) => {
      expect(source).toContain(`plugins.toptier.toptier.ui.${key}`);
    });
  });

  test('provides every audited key in DE, EN, ES, and FR', () => {
    locales.forEach((locale) => {
      const translation = JSON.parse(read(`locales/${locale}.json`));
      requiredKeys.forEach((key) => {
        expect(getLeaf(translation, `plugins.toptier.toptier.ui.${key}`)).toEqual(expect.any(String));
      });
    });
  });

  test('uses the shared i18n client before rendering dynamic copy actions', () => {
    const source = read('ui.html');
    expect(source).toContain('/js/i18n-client.js');
    expect(source).toContain('window.i18n.ready.then(init)');
  });
});
