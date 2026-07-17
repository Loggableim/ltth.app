'use strict';

const fs = require('fs');
const path = require('path');

describe('Talking Heads runtime UI localization', () => {
  const pluginRoot = path.join(__dirname, '..', 'plugins', 'talking-heads');
  const uiSource = fs.readFileSync(path.join(pluginRoot, 'assets', 'ui.js'), 'utf8');
  const pluginKeys = [
    'plugins.talking-heads.talking_heads_ui.buttons.testing',
    'plugins.talking-heads.talking_heads_ui.buttons.generating',
    'plugins.talking-heads.talking_heads_ui.notifications.cache_clear_confirm',
    'plugins.talking-heads.talking_heads_ui.status.api_configured',
    'plugins.talking-heads.talking_heads_ui.logs.empty'
  ];

  test('uses stable plugin-namespaced keys for dynamic dashboard text', () => {
    for (const key of pluginKeys) {
      expect(uiSource).toContain(`'${key}'`);
    }
    expect(uiSource).not.toContain("'talking_heads_ui.");
  });

  test.each(['de', 'en', 'es', 'fr'])('provides every dynamic key in %s', (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8'));
    const get = (key) => key.split('.').reduce((value, part) => value && value[part], translations);

    for (const key of pluginKeys) {
      expect(get(key)).toEqual(expect.any(String));
      expect(get(key)).not.toBe('');
    }
  });
});
