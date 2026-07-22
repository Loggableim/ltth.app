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

const runtimeMessageKeys = [
  'ui.runtime.empty_goals',
  'ui.runtime.create_first_goal',
  'ui.runtime.edit_goal',
  'ui.runtime.delete_goal',
  'ui.runtime.create_goal',
  'ui.runtime.template_label',
  'ui.runtime.overlay_url',
  'ui.runtime.copy',
  'ui.runtime.reset',
  'ui.runtime.set_value',
  'ui.runtime.error_saving_goal',
  'ui.runtime.confirm_delete_goal',
  'ui.runtime.error_deleting_goal',
  'ui.runtime.error_resetting_goal',
  'ui.runtime.error_incrementing_goal',
  'ui.runtime.enter_new_value',
  'ui.runtime.error_setting_value',
  'ui.runtime.url_copied',
  'ui.runtime.template_not_found',
  'ui.runtime.error_rendering_preview',
  'ui.runtime.edit_multigoal',
  'ui.runtime.create_multigoal',
  'ui.runtime.no_goals_available',
  'ui.runtime.select_two_goals',
  'ui.runtime.error_saving_multigoal',
  'ui.runtime.empty_multigoals',
  'ui.runtime.create_first_multigoal',
  'ui.runtime.animation_slide',
  'ui.runtime.animation_fade',
  'ui.runtime.animation_cube',
  'ui.runtime.animation_wave',
  'ui.runtime.animation_particle',
  'ui.runtime.goal_count',
  'ui.runtime.interval',
  'ui.runtime.interval_value',
  'ui.runtime.animation',
  'ui.runtime.size',
  'ui.runtime.included_goals',
  'ui.runtime.goal_not_found',
  'ui.runtime.confirm_delete_multigoal',
  'ui.runtime.error_deleting_multigoal',
  'ui.runtime.copied',
  'overlay.no_goals_configured'
];

const accessibilityKeys = [
  'ui.brand_logo',
  'ui.multigoal_name_placeholder'
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

  test('uses stable locale keys for all dynamically rendered UI and overlay messages', () => {
    const ui = read('ui.js');
    const overlay = read('overlay/multigoal.js');

    runtimeMessageKeys
      .filter((key) => key.startsWith('ui.runtime.'))
      .forEach((key) => {
        expect(ui).toContain(`t('plugins.goals.goals.${key}'`);
    });

    expect(overlay).toContain("t('plugins.goals.goals.overlay.no_goals_configured'");
    expect(overlay).toContain('window.i18n?.onLanguageChange?.(() => this.renderGoals());');
  });

  test('localizes the logo description and multigoal name placeholder', () => {
    const html = read('ui.html');
    const ui = read('ui.js');

    expect(html).toContain('data-i18n-placeholder="plugins.goals.goals.ui.multigoal_name_placeholder"');
    expect(ui).toContain("t('plugins.goals.goals.ui.brand_logo'");
  });

  locales.forEach((locale) => {
    test(`provides every new UI label in ${locale}`, () => {
      const catalog = JSON.parse(read(`locales/${locale}.json`));

      requiredKeys.forEach((key) => {
        expect(getLeaf(catalog.plugins.goals.goals, key)).toEqual(expect.any(String));
        expect(getLeaf(catalog.plugins.goals.goals, key).trim()).not.toBe('');
      });

      runtimeMessageKeys.forEach((key) => {
        expect(getLeaf(catalog.plugins.goals.goals, key)).toEqual(expect.any(String));
        expect(getLeaf(catalog.plugins.goals.goals, key).trim()).not.toBe('');
      });

      accessibilityKeys.forEach((key) => {
        expect(getLeaf(catalog.plugins.goals.goals, key)).toEqual(expect.any(String));
        expect(getLeaf(catalog.plugins.goals.goals, key).trim()).not.toBe('');
      });
    });
  });
});
