'use strict';

const fs = require('fs');
const path = require('path');
const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'vdoninja';

describe('VDO.Ninja UI i18n', () => {
  test('marks every statically visible control with a complete namespaced translation', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const result = auditPluginUi({ repoRoot, catalog: { ...catalog, plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId) } });
    expect(result.errors).toEqual([]);
  });

  test.each(['de', 'en', 'es', 'fr'])('provides dynamic guest controls in %s', (locale) => {
    const values = flattenTranslations(JSON.parse(fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`), 'utf8')));
    for (const key of [
      'plugins.vdoninja.vdoninja.guests.empty',
      'plugins.vdoninja.vdoninja.guests.empty_hint',
      'plugins.vdoninja.vdoninja.guests.controls.solo',
      'plugins.vdoninja.vdoninja.guests.controls.kick',
      'plugins.vdoninja.vdoninja.guests.controls.audio',
      'plugins.vdoninja.vdoninja.guests.controls.video',
      'plugins.vdoninja.vdoninja.guests.controls.volume',
      'plugins.vdoninja.vdoninja.guests.slot',
      'plugins.vdoninja.vdoninja.room.name_placeholder',
      'plugins.vdoninja.vdoninja.director.hide',
      'plugins.vdoninja.vdoninja.director.show',
      'plugins.vdoninja.vdoninja.messages.room_name_required',
      'plugins.vdoninja.vdoninja.messages.room_create_failed',
      'plugins.vdoninja.vdoninja.messages.room_close_failed',
      'plugins.vdoninja.vdoninja.messages.room_close_confirm',
      'plugins.vdoninja.vdoninja.messages.guest_kick_confirm',
      'plugins.vdoninja.vdoninja.messages.guest_kick_reason',
      'plugins.vdoninja.vdoninja.messages.copy_failed',
      'plugins.vdoninja.vdoninja.messages.not_available'
    ]) expect(values[key]).toEqual(expect.any(String));
  });

  test('uses stable plugin keys for dynamic messages rather than the legacy labels namespace', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');

    expect(source).toContain("translateUi('plugins.vdoninja.vdoninja.messages.room_name_required'");
    expect(source).toContain("translateUi('plugins.vdoninja.vdoninja.messages.guest_kick_confirm'");
    expect(source).toContain("translateUi('plugins.vdoninja.vdoninja.guests.controls.audio'");
    expect(source).not.toContain('plugins.vdoninja.labels.');
  });

  test('keeps copy controls and dynamic guest text working after a language change', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');

    expect(source).toContain("const copyButton = e.target.closest('.copy-btn');");
    expect(source).toContain('function refreshLocalizedDynamicUi()');
    expect(source).toContain('window.i18n?.onLanguageChange?.(refreshLocalizedDynamicUi);');
  });
});
