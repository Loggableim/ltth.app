'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'flame-overlay';
const uiKeys = [
  'plugins.flame-overlay.flame_overlay.ui.metrics.profile',
  'plugins.flame-overlay.flame_overlay.ui.tabs.look',
  'plugins.flame-overlay.flame_overlay.ui.options.obsSafe',
  'plugins.flame-overlay.flame_overlay.ui.settings.accentColor',
  'plugins.flame-overlay.flame_overlay.ui.trigger.coinRule',
  'plugins.flame-overlay.flame_overlay.ui.table.event',
  'plugins.flame-overlay.flame_overlay.ui.presets.empty',
  'plugins.flame-overlay.flame_overlay.ui.presets.load',
  'plugins.flame-overlay.flame_overlay.ui.presets.deleteTitle'
];
const runtimeKeys = [
  'plugins.flame-overlay.flame_overlay.ui.messages.giftCatalogLoading',
  'plugins.flame-overlay.flame_overlay.ui.messages.giftCatalogUnavailable',
  'plugins.flame-overlay.flame_overlay.ui.messages.previewStart',
  'plugins.flame-overlay.flame_overlay.ui.messages.previewStop',
  'plugins.flame-overlay.flame_overlay.ui.messages.removeTriggerRule',
  'plugins.flame-overlay.flame_overlay.ui.messages.presetDeleteConfirm',
  'plugins.flame-overlay.flame_overlay.ui.messages.triggerCount',
  'plugins.flame-overlay.flame_overlay.ui.messages.noTriggersYet',
  'plugins.flame-overlay.flame_overlay.ui.options.anyCondition',
  'plugins.flame-overlay.flame_overlay.ui.sections.base',
  'plugins.flame-overlay.flame_overlay.ui.sections.rules',
  'plugins.flame-overlay.flame_overlay.ui.settings.frameThickness',
  'plugins.flame-overlay.flame_overlay.ui.aria.toolbar'
];

describe('Flame Overlay UI i18n', () => {
  test('marks every static Flame Overlay control and supplies every referenced locale leaf', () => {
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

  test.each(['de', 'en', 'es', 'fr'])('provides semantic control-room labels in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of uiKeys) {
      expect(values[key]).toEqual(expect.any(String));
    }

    for (const key of runtimeKeys) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('routes dynamic status, preset, and trigger labels through stable locale keys', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui', 'settings.html'), 'utf8');

    expect(source).toContain("translateUi('plugins.flame-overlay.flame_overlay.ui.messages.giftCatalogLoading'");
    expect(source).toContain("translateUi('plugins.flame-overlay.flame_overlay.ui.messages.previewStop'");
    expect(source).toContain("translateUi('plugins.flame-overlay.flame_overlay.ui.messages.presetDeleteConfirm'");
    expect(source).toContain("translateUi('plugins.flame-overlay.flame_overlay.ui.messages.removeTriggerRule'");
    expect(source).toContain('onLanguageChange?.(() =>');
  });

  test('loads the shared i18n client for both the settings surface and renderer', () => {
    for (const relativePath of ['ui/settings.html', 'renderer/index.html']) {
      const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, relativePath), 'utf8');
      expect(source).toContain('/js/i18n-client.js');
    }
  });
});
