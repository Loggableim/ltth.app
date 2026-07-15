'use strict';

const fs = require('fs');
const path = require('path');
const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'vdoninja';

describe('VDO.Ninja UI i18n', () => {
  test('marks every statically visible control with a complete namespaced translation', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const result = auditPluginUi({ repoRoot, catalog: { ...catalog, plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId) } });
    expect(result.errors).toEqual([]);
  });

  test.each(['de', 'en', 'es', 'fr'])('provides dynamic guest controls in %s', (locale) => {
    const values = flattenTranslations(JSON.parse(fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`), 'utf8')));
    for (const key of [
      'plugins.vdoninja.vdoninja.guests.empty',
      'plugins.vdoninja.vdoninja.guests.empty_hint',
      'plugins.vdoninja.vdoninja.guests.controls.solo',
      'plugins.vdoninja.vdoninja.guests.controls.kick'
    ]) expect(values[key]).toEqual(expect.any(String));
  });
});
