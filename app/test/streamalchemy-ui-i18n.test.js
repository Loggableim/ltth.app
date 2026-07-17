'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'streamalchemy';

describe('StreamAlchemy UI i18n', () => {
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

  test.each(['de', 'en', 'es', 'fr'])('provides semantic StreamAlchemy controls in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of [
      'plugins.streamalchemy.ui.app.overview',
      'plugins.streamalchemy.ui.metrics.jobs',
      'plugins.streamalchemy.ui.styles.pixel',
      'plugins.streamalchemy.ui.legacy.noItems',
      'plugins.streamalchemy.ui.runtime.noProviders',
      'plugins.streamalchemy.ui.runtime.installingModel',
      'plugins.streamalchemy.ui.runtime.modelPathUnknown',
      'plugins.streamalchemy.ui.overlay.craftingInProgress',
      'plugins.streamalchemy.ui.overlay.craftingComplete',
      'plugins.streamalchemy.ui.overlay.craftingFailed'
    ]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('uses namespaced runtime translations instead of English fallback copy', () => {
    const uiSource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');
    const overlaySource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'overlay.html'), 'utf8');

    expect(uiSource).toContain("translateUi('plugins.streamalchemy.ui.runtime.noProviders'");
    expect(uiSource).toContain("translateUi('plugins.streamalchemy.ui.runtime.installingModel'");
    expect(overlaySource).toContain("translateUi('plugins.streamalchemy.ui.overlay.craftingInProgress'");
    expect(overlaySource).toContain("translateUi('plugins.streamalchemy.ui.overlay.craftingFailed'");
  });

  test('loads the shared i18n client on current, legacy, and overlay surfaces', () => {
    for (const relativePath of ['ui.html', 'ui-old.html', 'overlay.html']) {
      const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, relativePath), 'utf8');
      expect(source).toContain('/js/i18n-client.js');
    }
  });
});
