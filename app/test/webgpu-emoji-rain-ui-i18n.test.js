'use strict';

const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'webgpu-emoji-rain');
const locales = ['de', 'en', 'es', 'fr'];

const requiredKeys = [
  'ui.preset_label',
  'ui.status_label',
  'ui.target_fps',
  'ui.user_emoji_mappings',
  'ui.physics_air_resistance',
  'ui.physics_friction',
  'ui.emoji_rotation_speed',
  'ui.heart_balloon_pop_height'
];

function read(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function getLeaf(object, key) {
  return key.split('.').reduce((value, part) => value && value[part], object);
}

describe('WebGPU Emoji Rain static UI localization', () => {
  test('loads the shared i18n client', () => {
    expect(read('ui.html')).toContain('/js/i18n-client.js');
  });

  test('marks every remaining static UI label with a plugin locale key', () => {
    const html = read('ui.html');

    requiredKeys.forEach((key) => {
      expect(html).toContain(`data-i18n="plugins.webgpu-emoji-rain.webgpu_emoji_rain.${key}"`);
    });
    expect(html).toContain('<label for="target_fps" data-i18n="plugins.webgpu-emoji-rain.webgpu_emoji_rain.ui.target_fps">');
    expect(html).toContain('<label for="target_fps_optimization" data-i18n="plugins.webgpu-emoji-rain.webgpu_emoji_rain.ui.target_fps">');
  });

  locales.forEach((locale) => {
    test(`provides every new UI label in ${locale}`, () => {
      const catalog = JSON.parse(read(`locales/${locale}.json`));
      const translations = catalog.plugins['webgpu-emoji-rain'].webgpu_emoji_rain;

      requiredKeys.forEach((key) => {
        expect(getLeaf(translations, key)).toEqual(expect.any(String));
        expect(getLeaf(translations, key).trim()).not.toBe('');
      });
    });
  });
});
