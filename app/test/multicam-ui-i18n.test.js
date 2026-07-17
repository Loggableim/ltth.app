'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { auditPluginLocales, flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'multicam';
const runtimeKeys = [
  'server_unreachable', 'retry_load', 'server_error', 'unknown_error',
  'catalog_load_failed', 'empty_catalog', 'tier_whale', 'tier_large',
  'tier_medium', 'tier_small', 'gift_count', 'no_filtered_gifts',
  'no_mapping', 'minimum_coins', 'unsaved_changes', 'all_changes_saved',
  'saving', 'saved', 'error', 'discard_unsaved_changes',
  'connection_failed', 'select_scene'
].map((key) => `plugins.multicam.multicam.runtime.${key}`);

describe('Multi-Cam Switcher UI i18n', () => {
  test('uses stable runtime keys for catalog, save, and OBS connection states', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.js'), 'utf8');

    runtimeKeys.forEach((key) => expect(source).toContain(`t('${key}'`));
    expect(source).toContain("t('plugins.multicam.multicam.status.connected'");
    expect(source).toContain("t('plugins.multicam.multicam.status.disconnected'");
    expect(source).toContain('window.i18n.onChange');
    expect(source).toContain('window.i18n.onLanguageChange');
  });

  test.each(['de', 'en', 'es', 'fr'])('defines each runtime key in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    runtimeKeys.forEach((key) => expect(values[key]).toEqual(expect.any(String)));
  });

  test('has no raw UI copy or copied-English locale leaves', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const uiResult = auditPluginUi({
      repoRoot,
      catalog: { ...catalog, plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId) }
    });
    const localeResult = auditPluginLocales(path.join(repoRoot, 'app', 'plugins'));

    expect(uiResult.errors).toEqual([]);
    expect(localeResult.errors.filter((error) => error.startsWith(`${pluginId}:`) || error.startsWith(`${pluginId}/`))).toEqual([]);
  });
});
