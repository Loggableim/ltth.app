const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'emoji-rain');
const notificationKeys = [
  'enabled',
  'disabled',
  'configuration_saved',
  'test_emojis_spawned',
  'error_prefix',
  'configuration_load_failed',
  'ui_update_failed',
  'configuration_save_failed',
  'network_save_failed',
  'test_in_progress',
  'network_test_failed',
  'heart_balloons_spawned',
  'heart_balloons_test_failed',
  'gift_ball_spawned',
  'gift_ball_test_failed',
  'network_failed',
  'upload_file_required',
  'upload_result',
  'upload_success',
  'image_deleted',
  'image_delete_failed',
  'network_image_delete_failed',
  'username_required',
  'emoji_or_profile_picture_required',
  'user_mappings_saved'
];
const commandEditorKeys = [
  'title', 'description', 'add', 'enabled', 'command', 'asset_type', 'emoji', 'image',
  'asset_value', 'gallery', 'upload', 'remove', 'allow_team_members', 'subscriber_help',
  'team_user_cooldown_seconds', 'superfan_cooldown_seconds', 'global_cooldown_seconds',
  'command_despawn_seconds',
  'select_gallery', 'https_placeholder', 'no_images', 'upload_failed', 'max_commands',
  'registration_pending'
];

describe('Emoji Rain runtime i18n', () => {
  test('uses namespaced translations for dynamic statuses and safe local notifications', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'emoji-rain-ui.js'), 'utf8');

    expect(source).toContain("pluginText('runtime.status.enabled'");
    expect(source).toContain("pluginText('runtime.notifications.enabled'");
    expect(source).toContain("pluginText('runtime.notifications.configuration_saved'");
    expect(source).toContain("pluginText('runtime.notifications.test_emojis_spawned'");
    expect(source).not.toContain("showNotification('Test-Emojis gespawnt!')");
    expect(source).not.toMatch(/showNotification\(\s*['"`]/);
  });

  test('loads the shared safe command editor', () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    expect(html).toContain('id="animal-command-editor"');
    expect(html.indexOf('/js/emoji-rain-command-editor.js')).toBeLessThan(html.indexOf('/js/emoji-rain-ui.js'));
    expect(html).toContain('/js/emoji-rain-command-editor.js?v=2.1.2');
    expect(html).toContain('/js/emoji-rain-ui.js?v=2.1.2');
  });

  test('waits for i18n before constructing the dynamic command editor', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'emoji-rain-ui.js'), 'utf8');
    const initializeStart = source.indexOf('async function initializeEmojiRainUI()');
    const readyIndex = source.indexOf('await window.i18n.ready;', initializeStart);
    const editorIndex = source.indexOf('initializeAnimalCommandEditor();', initializeStart);

    expect(initializeStart).toBeGreaterThanOrEqual(0);
    expect(readyIndex).toBeGreaterThan(initializeStart);
    expect(editorIndex).toBeGreaterThan(readyIndex);
    expect(source).toContain('animalCommandEditor.retranslate()');
  });

  test('provides runtime and command-editor copy in every supported language', () => {
    const values = Object.fromEntries(['de', 'en', 'es', 'fr'].map((locale) => {
      const file = path.join(pluginRoot, 'locales', `${locale}.json`);
      const translation = JSON.parse(fs.readFileSync(file, 'utf8'));
      return [locale, translation.plugins['emoji-rain']];
    }));

    for (const locale of ['de', 'en', 'es', 'fr']) {
      expect(values[locale].runtime.status.enabled).toBeTruthy();
      expect(values[locale].runtime.status.disabled).toBeTruthy();
      for (const key of notificationKeys) expect(values[locale].runtime.notifications[key]).toBeTruthy();
      for (const key of commandEditorKeys) {
        expect(values[locale].emoji_rain.commands_editor[key]).toEqual(expect.any(String));
        expect(values[locale].emoji_rain.commands_editor[key].trim()).not.toBe('');
      }
    }
    expect(values.en.runtime.status.enabled).toBe('Enabled');
    expect(values.es.runtime.status.enabled).toBe('Activado');
    expect(values.fr.runtime.status.enabled).toBe('Activé');
  });
});
