'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { auditPluginLocales, flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'advanced-timer';

describe('Advanced Timer UI i18n', () => {
  test('uses complete namespaced translations without raw visible copy', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const uiResult = auditPluginUi({
      repoRoot,
      catalog: {
        ...catalog,
        plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId)
      }
    });
    const localeResult = auditPluginLocales(path.join(repoRoot, 'app', 'plugins'));

    expect(uiResult.errors).toEqual([]);
    expect(localeResult.errors.filter((error) => error.startsWith(`${pluginId}:`) || error.startsWith(`${pluginId}/`))).toEqual([]);
  });

  test.each(['de', 'en', 'es', 'fr'])('defines every Advanced Timer UI key referenced by its scripts in %s', (locale) => {
    const sources = [
      path.join(repoRoot, 'app', 'plugins', pluginId, 'ui', 'ui.js'),
      path.join(repoRoot, 'app', 'plugins', pluginId, 'overlay', 'overlay.js')
    ].map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n');
    const keys = [...new Set([...sources.matchAll(/plugins\.advanced-timer\.[\w.-]+/g)]
      .map((match) => match[0]))];
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    expect(keys.length).toBeGreaterThan(0);
    keys.forEach((key) => expect(values[key]).toEqual(expect.any(String)));
  });
});
