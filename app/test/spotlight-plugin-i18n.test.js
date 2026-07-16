'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'spotlight';
const uiKeys = [
  'plugins.spotlight.labels.modes',
  'plugins.spotlight.labels.workflow',
  'plugins.spotlight.labels.compatibility',
  'plugins.spotlight.labels.layout',
  'plugins.spotlight.labels.cancel',
  'plugins.spotlight.labels.test',
  'plugins.spotlight.labels.close'
];

const runtimeKeys = [
  'plugins.spotlight.runtime.cards.live_mode',
  'plugins.spotlight.runtime.cards.overlay_url',
  'plugins.spotlight.runtime.cards.copy_url',
  'plugins.spotlight.runtime.cards.preview',
  'plugins.spotlight.runtime.cards.settings',
  'plugins.spotlight.runtime.settings.design_variant',
  'plugins.spotlight.runtime.settings.font_settings',
  'plugins.spotlight.runtime.settings.username_effects',
  'plugins.spotlight.runtime.settings.multi_hud_rotation',
  'plugins.spotlight.runtime.toast.settings_saved',
  'plugins.spotlight.runtime.toast.test_sent',
  'plugins.spotlight.runtime.overlay.waiting_for_event',
  'plugins.spotlight.runtime.overlay.no_rotation_events'
];

describe('Spotlight UI i18n', () => {
  test('marks every static Spotlight control and supplies every referenced locale leaf', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const result = auditPluginUi({
      repoRoot,
      catalog: {
        ...catalog,
        plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId)
      }
    });

    expect(result.errors).toEqual([]);
  });

  test.each(['de', 'en', 'es', 'fr'])('provides semantic dashboard and modal labels in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of [...uiKeys, ...runtimeKeys]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('loads the shared i18n client for the main settings surface', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui', 'main.html'), 'utf8');
    expect(source).toContain('/js/i18n-client.js');
  });

  test('routes dynamic settings, toast, and overlay-empty text through stable plugin keys', () => {
    const uiSource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui', 'main.js'), 'utf8');
    const rendererSource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'lib', 'template-renderer.js'), 'utf8');
    const multiHudSource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'overlays', 'multihud.js'), 'utf8');

    expect(uiSource).toContain('return translate(`plugins.spotlight.runtime.settings.${key}`');
    expect(uiSource).toContain("settingText('design_variant'");
    expect(uiSource).toContain("translate('plugins.spotlight.runtime.toast.settings_saved'");
    expect(rendererSource).toContain("translate('plugins.spotlight.runtime.overlay.waiting_for_event'");
    expect(multiHudSource).toContain("translate('plugins.spotlight.runtime.overlay.no_rotation_events'");
  });
});
