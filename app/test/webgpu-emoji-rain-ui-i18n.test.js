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
const commandEditorKeys = [
  'title', 'description', 'add', 'enabled', 'command', 'asset_type', 'emoji', 'image',
  'asset_value', 'gallery', 'upload', 'remove', 'allow_team_members', 'subscriber_help',
  'team_user_cooldown_seconds', 'superfan_cooldown_seconds', 'global_cooldown_seconds',
  'select_gallery', 'https_placeholder', 'no_images', 'upload_failed', 'max_commands',
  'registration_pending'
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

  test('loads the shared safe command editor', () => {
    const html = read('ui.html');
    expect(html).toContain('id="animal-command-editor"');
    expect(html.indexOf('/js/emoji-rain-command-editor.js')).toBeLessThan(html.indexOf('/js/webgpu-emoji-rain-ui.js'));
    expect(html).toContain('/js/emoji-rain-command-editor.js?v=3.0.5');
    expect(html).toContain('/js/webgpu-emoji-rain-ui.js?v=3.0.5');
  });

  test('waits for i18n before constructing the dynamic command editor', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'webgpu-emoji-rain-ui.js'), 'utf8');
    const initializeStart = source.indexOf('async function initializeEmojiRainUI()');
    const readyIndex = source.indexOf('await window.i18n.ready;', initializeStart);
    const editorIndex = source.indexOf('initializeAnimalCommandEditor();', initializeStart);

    expect(initializeStart).toBeGreaterThanOrEqual(0);
    expect(readyIndex).toBeGreaterThan(initializeStart);
    expect(editorIndex).toBeGreaterThan(readyIndex);
    expect(source).toContain('animalCommandEditor.retranslate()');
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
      commandEditorKeys.forEach((key) => {
        expect(getLeaf(translations, `commands_editor.${key}`)).toEqual(expect.any(String));
        expect(getLeaf(translations, `commands_editor.${key}`).trim()).not.toBe('');
      });
    });
  });
});
