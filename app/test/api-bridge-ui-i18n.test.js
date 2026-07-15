'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'api-bridge';

describe('API Bridge UI i18n', () => {
  test('marks every statically visible control with a complete namespaced translation', () => {
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

  test.each(['de', 'en', 'es', 'fr'])('provides the API Bridge contract copy in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of [
      'plugins.api-bridge.api_bridge.ui.contract.title',
      'plugins.api-bridge.api_bridge.ui.contract.endpoints.actions',
      'plugins.api-bridge.api_bridge.ui.contract.safety.title',
      'plugins.api-bridge.api_bridge.ui.contract.safety.body'
    ]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('loads the shared i18n client for the contract page', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');
    expect(source).toContain('/js/i18n-client.js');
  });
});
