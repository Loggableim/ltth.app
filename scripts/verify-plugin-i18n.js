'use strict';

const path = require('path');
const { auditPluginLocales } = require('./lib/plugin-i18n-audit');

const pluginsRoot = path.join(__dirname, '..', 'app', 'plugins');
const result = auditPluginLocales(pluginsRoot);

if (result.errors.length) {
  console.error(`Plugin i18n audit found ${result.errors.length} issue(s):`);
  result.errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`OK: ${result.plugins.length} plugin locale sets are namespaced and complete.`);
}
