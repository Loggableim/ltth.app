'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'talking-heads';
const uiKeys = [
  'plugins.talking-heads.labels.api_status_unknown',
  'plugins.talking-heads.labels.default_style',
  'plugins.talking-heads.labels.copy',
  'plugins.talking-heads.labels.preview_text',
  'plugins.talking-heads.labels.user_filter',
  'plugins.talking-heads.labels.sprite_mode',
  'plugins.talking-heads.labels.sprite_set',
  'plugins.talking-heads.labels.scroll_direction',
  'plugins.talking-heads.labels.right',
  'plugins.talking-heads.labels.bar_background',
  'plugins.talking-heads.labels.delete',
  'plugins.talking-heads.labels.copy_url',
  'plugins.talking-heads.labels.open_preview'
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
