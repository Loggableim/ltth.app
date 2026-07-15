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

    for (const key of uiKeys) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('loads the shared i18n client for the main settings surface', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui', 'main.html'), 'utf8');
    expect(source).toContain('/js/i18n-client.js');
  });
});
