'use strict';

const fs = require('fs');
const path = require('path');
const {
  migratePluginLocales,
  rewritePluginTranslationReferences
} = require('./plugin-i18n-namespace-migration');

const LOCALES = ['de', 'en', 'es', 'fr'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function walkPluginSurfaces(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'locales') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walkPluginSurfaces(file, files);
    else if (/\.(?:html|js)$/i.test(entry.name)) files.push(file);
  }
  return files;
}

function migratePluginLocaleDirectory(pluginDir, pluginId) {
  const localesDir = path.join(pluginDir, 'locales');
  const original = Object.fromEntries(LOCALES.map((locale) => [
    locale,
    readJson(path.join(localesDir, `${locale}.json`))
  ]));
  const migration = migratePluginLocales(pluginId, original);
  const changedFiles = [];

  for (const locale of LOCALES) {
    const file = path.join(localesDir, `${locale}.json`);
    const next = `${JSON.stringify(migration.locales[locale], null, 2)}\n`;
    if (fs.readFileSync(file, 'utf8') !== next) {
      fs.writeFileSync(file, next, 'utf8');
      changedFiles.push(file);
    }
  }

  for (const file of walkPluginSurfaces(pluginDir)) {
    const previous = fs.readFileSync(file, 'utf8');
    const next = rewritePluginTranslationReferences(previous, pluginId, migration.keyMap);
    if (next !== previous) {
      fs.writeFileSync(file, next, 'utf8');
      changedFiles.push(file);
    }
  }

  return { changedFiles, keyMap: migration.keyMap };
}

module.exports = { migratePluginLocaleDirectory, walkPluginSurfaces };
