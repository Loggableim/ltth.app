'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'talking-heads';
const uiKeys = [
  'plugins.talking-heads.labels.talking_heads_obs_overlay',
  'plugins.talking-heads.labels.talking_heads_obs_hud',
  'plugins.talking-heads.labels.talking_heads_viewer_bar',
  'plugins.talking-heads.talking_heads_ui.local_assets.title',
  'plugins.talking-heads.talking_heads_ui.local_assets.lottery_title',
  'plugins.talking-heads.talking_heads_ui.lottery_overlay.drawing'
];

describe('Talking Heads UI i18n', () => {
  test('marks every static Talking Heads control and supplies every referenced locale leaf', () => {
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

  test.each(['de', 'en', 'es', 'fr'])('provides semantic configuration and viewer-bar labels in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of uiKeys) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('loads the shared i18n client for both settings surfaces', () => {
    for (const relativePath of ['ui.html', 'ui-old.html']) {
      const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, relativePath), 'utf8');
      expect(source).toContain('/js/i18n-client.js');
    }
  });
});
