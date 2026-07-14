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

  test('provides the runtime copy in every supported language', () => {
    const values = Object.fromEntries(['de', 'en', 'es', 'fr'].map((locale) => {
      const file = path.join(pluginRoot, 'locales', `${locale}.json`);
      const translation = JSON.parse(fs.readFileSync(file, 'utf8'));
      return [locale, translation.plugins['emoji-rain'].runtime];
    }));

    for (const locale of ['de', 'en', 'es', 'fr']) {
      expect(values[locale].status.enabled).toBeTruthy();
      expect(values[locale].status.disabled).toBeTruthy();
      for (const key of notificationKeys) expect(values[locale].notifications[key]).toBeTruthy();
    }
    expect(values.en.status.enabled).toBe('Enabled');
    expect(values.es.status.enabled).toBe('Activado');
    expect(values.fr.status.enabled).toBe('Activé');
  });
});
