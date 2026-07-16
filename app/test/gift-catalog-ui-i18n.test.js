'use strict';

const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'gift-catalog');
const locales = ['de', 'en', 'es', 'fr'];

function read(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function getLeaf(object, key) {
  return key.split('.').reduce((value, part) => value && value[part], object);
}

describe('Gift Catalog static UI localization', () => {
  const requiredKeys = [
    'actions.copy',
    'labels.locale', 'labels.app_language', 'labels.browser_language', 'labels.priority_region',
    'labels.tz_name', 'labels.webcast_language',
    'options.none', 'options.locale_de', 'options.locale_en', 'options.locale_es', 'options.locale_fr',
    'messages.no_gifts_available', 'messages.load_catalog_first_for_live_mode',
    'messages.no_live_gifts_loaded', 'messages.static_list_empty',
    'messages.live_source', 'messages.demo_source',
    'messages.live_entries_loaded', 'messages.demo_list_rendered',
    'messages.copy_failed_prompt', 'messages.copy_prompt', 'messages.endpoint_prompt'
  ];

  test('uses stable Gift Catalog keys for every audited control', () => {
    const source = read('ui.html');
    requiredKeys.forEach((key) => {
      expect(source).toContain(`plugins.gift-catalog.gift_catalog.ui.${key}`);
    });
  });

  test('provides every audited key in DE, EN, ES, and FR', () => {
    locales.forEach((locale) => {
      const translation = JSON.parse(read(`locales/${locale}.json`));
      requiredKeys.forEach((key) => {
        expect(getLeaf(translation, `plugins.gift-catalog.gift_catalog.ui.${key}`)).toEqual(expect.any(String));
      });
    });
  });

  test('uses the shared i18n client before rendering empty catalog state', () => {
    const source = read('ui.html');
    expect(source).toContain('/js/i18n-client.js');
    expect(source).toContain('translateUi(');
    expect(source).toMatch(/translateUi\(\s*'plugins\.gift-catalog\.gift_catalog\.ui\.messages\.no_live_gifts_loaded'/);
    expect(source).toMatch(/translateUi\(\s*'plugins\.gift-catalog\.gift_catalog\.ui\.messages\.copy_prompt'/);
  });
});
