'use strict';

const path = require('path');
const { auditPluginLocales } = require('./lib/plugin-i18n-audit');
const { auditPluginUi } = require('./lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('./lib/published-plugin-catalog');

const repoRoot = path.join(__dirname, '..');
const catalog = loadPublishedPluginCatalog(repoRoot);
const localeRoots = [
  path.join(repoRoot, 'app', 'plugins'),
  path.join(repoRoot, 'plugin-store', 'sources')
];
const localeResults = localeRoots.map((pluginsRoot) => auditPluginLocales(pluginsRoot));
const uiResult = auditPluginUi({
  repoRoot,
  catalog: { ...catalog, plugins: [...catalog.plugins, catalog.storeAdmin] }
});
const errors = [...localeResults.flatMap((result) => result.errors), ...uiResult.errors];

if (errors.length) {
  console.error(`Plugin i18n audit found ${errors.length} issue(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`OK: ${catalog.guideIds.length} published plugin locale sets and visible UI surfaces are namespaced and complete.`);
}
