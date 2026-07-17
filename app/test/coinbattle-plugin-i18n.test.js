'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'coinbattle';
const uiKeys = [
  'plugins.coinbattle.overlay.copy',
  'plugins.coinbattle.labels.theme_night',
  'plugins.coinbattle.labels.theme_day',
  'plugins.coinbattle.labels.theme_cid',
  'plugins.coinbattle.labels.custom',
  'plugins.coinbattle.labels.loading',
  'plugins.coinbattle.labels.coins_label',
  'plugins.coinbattle.labels.element',
  'plugins.coinbattle.labels.visible'
];

describe('CoinBattle UI i18n', () => {
  test('marks every static CoinBattle control and supplies every referenced locale leaf', () => {
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

  test.each(['de', 'en', 'es', 'fr'])('provides semantic overlay, theme, and table labels in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of uiKeys) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('loads the shared i18n client for every shipped UI surface', () => {
    for (const relativePath of ['ui.html', 'overlay/overlay.html', 'ui/overlay-editor.html']) {
      const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, relativePath), 'utf8');
      expect(source).toContain('/js/i18n-client.js');
    }
  });
});
