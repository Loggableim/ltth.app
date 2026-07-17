const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

const PLUGIN_IDS = new Set([
  'advanced-timer',
  'config-import',
  'data-source',
  'thermal-printer',
  'multicam'
]);

describe('small plugin UI i18n regression coverage', () => {
  test('keeps every visible UI control and translation key complete in all locales', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const errors = auditPluginUi({ repoRoot, catalog }).errors
      .filter((error) => [...PLUGIN_IDS].some((pluginId) => error.startsWith(`${pluginId}/`) || error.startsWith(`${pluginId}:`)));

    expect(errors).toEqual([]);
  });
});
