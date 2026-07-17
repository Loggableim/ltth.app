'use strict';

const path = require('path');

const { auditPluginLocales } = require('../../scripts/lib/plugin-i18n-audit');
const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'webgpu-emoji-rain';

describe('WebGPU Emoji Rain UI i18n', () => {
  test('uses complete namespaced locale values without raw visible copy', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const uiResult = auditPluginUi({
      repoRoot,
      catalog: {
        ...catalog,
        plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId)
      }
    });
    const localeResult = auditPluginLocales(path.join(repoRoot, 'app', 'plugins'));
    const localeErrors = localeResult.errors.filter((error) => error.startsWith(`${pluginId}:`) || error.startsWith(`${pluginId}/`));

    expect(uiResult.errors).toEqual([]);
    expect(localeErrors).toEqual([]);
  });
});
