'use strict';

const fs = require('fs');
const path = require('path');
const { migratePluginLocaleDirectory } = require('./lib/plugin-i18n-bulk-migration');

const root = path.resolve(__dirname, '..');
const pluginsRoot = path.join(root, 'app', 'plugins');
const requested = process.argv.slice(2);
const candidates = fs.readdirSync(pluginsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((id) => fs.existsSync(path.join(pluginsRoot, id, 'locales')))
  .filter((id) => !requested.length || requested.includes(id));

const changed = candidates.flatMap((pluginId) => migratePluginLocaleDirectory(path.join(pluginsRoot, pluginId), pluginId).changedFiles);
console.log(`Migrated ${candidates.length} plugin locale sets; changed ${changed.length} files.`);
