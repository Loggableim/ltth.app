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
  });

  test('loads the shared i18n client for both the settings surface and renderer', () => {
    for (const relativePath of ['ui/settings.html', 'renderer/index.html']) {
      const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, relativePath), 'utf8');
      expect(source).toContain('/js/i18n-client.js');
    }
  });
});
