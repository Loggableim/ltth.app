'use strict';

const fs = require('fs');
const path = require('path');
const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'clarityhud';
const runtimeKeys = [
  'plugins.clarityhud.runtime.status.settings_updated',
  'plugins.clarityhud.runtime.toast.url_copied',
  'plugins.clarityhud.runtime.toast.test_event_sent',
  'plugins.clarityhud.runtime.toast.settings_saved',
  'plugins.clarityhud.runtime.dialog.preset_name',
  'plugins.clarityhud.runtime.dialog.reset_confirm',
  'plugins.clarityhud.runtime.empty.no_additional_streams',
  'plugins.clarityhud.runtime.stream.fallback',
  'plugins.clarityhud.runtime.dock.chat',
  'plugins.clarityhud.runtime.aria.close_settings_modal',
  'plugins.clarityhud.runtime.aria.close_setup_wizard',
  'plugins.clarityhud.runtime.aria.profile_import',
  'plugins.clarityhud.runtime.aria.preview_chat'
];

describe('ClarityHUD UI i18n', () => {
  test('marks every statically visible control with a complete namespaced translation', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const result = auditPluginUi({ repoRoot, catalog: { ...catalog, plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId) } });
    expect(result.errors).toEqual([]);
  });

  test.each(['de', 'en', 'es', 'fr'])('provides copy and loading states in %s', (locale) => {
    const values = flattenTranslations(JSON.parse(fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`), 'utf8')));
    for (const key of [
      'plugins.clarityhud.clarityhud.buttons.copy',
      'plugins.clarityhud.clarityhud.buttons.copy_url',
      'plugins.clarityhud.clarityhud.dashboard.loading'
    ]) expect(values[key]).toEqual(expect.any(String));
  });

  test('routes dynamic status, dialogs, toasts, and stream fallbacks through runtime keys', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui', 'main.js'), 'utf8');

    expect(source).toContain('function translateRuntime(key, fallback, params = {})');
    expect(source).toContain("translateRuntime('status.settings_updated'");
    expect(source).toContain("translateRuntime('toast.url_copied'");
    expect(source).toContain("translateRuntime('toast.test_event_sent'");
    expect(source).toContain("translateRuntime('dialog.preset_name'");
    expect(source).toContain("translateRuntime('dialog.reset_confirm'");
    expect(source).toContain("translateRuntime('empty.no_additional_streams'");
    expect(source).toContain("translateRuntime('stream.fallback'");
  });

  test('sets the local overlay URLs before asynchronous locale initialization completes', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui', 'main.js'), 'utf8');
    const initializeLocale = source.indexOf('await window.i18n.init();');
    const setChatUrl = source.indexOf("document.getElementById('chat-url').textContent = `${origin}/overlay/clarity/chat`;");

    expect(initializeLocale).toBeGreaterThan(-1);
    expect(setChatUrl).toBeGreaterThan(-1);
    expect(setChatUrl).toBeLessThan(initializeLocale);
  });

  test('exposes translated accessible names for dynamic dashboard controls', () => {
    const html = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui', 'main.html'), 'utf8');

    expect(html).toContain('data-i18n-aria-label="plugins.clarityhud.runtime.aria.close_settings_modal"');
    expect(html).toContain('data-i18n-aria-label="plugins.clarityhud.runtime.aria.close_setup_wizard"');
    expect(html).toContain('data-i18n-aria-label="plugins.clarityhud.runtime.aria.profile_import"');
    expect(html).toContain('data-i18n-title="plugins.clarityhud.runtime.aria.preview_chat"');
  });

  test.each(['de', 'en', 'es', 'fr'])('provides the runtime UI keys in %s', (locale) => {
    const values = flattenTranslations(JSON.parse(fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`), 'utf8')));
    for (const key of runtimeKeys) {
      expect(values[key]).toEqual(expect.any(String));
      expect(values[key]).not.toBe('');
    }
  });
});
