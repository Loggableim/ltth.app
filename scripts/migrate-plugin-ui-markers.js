'use strict';

const fs = require('fs');
const path = require('path');
const { loadPublishedPluginCatalog } = require('./lib/published-plugin-catalog');
const { flattenTranslations } = require('./lib/plugin-i18n-audit');
const { addExistingPluginMarkers, buildUniqueTranslationMap, normalizeText, rewriteLegacyPluginKeys } = require('./lib/plugin-ui-marker-migration');

const repoRoot = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const addMarkers = process.argv.includes('--add-markers');
const pluginArg = process.argv.find((argument) => argument.startsWith('--plugin='));
const requestedPluginIds = pluginArg
  ? new Set(pluginArg.slice('--plugin='.length).split(',').map((id) => id.trim()).filter(Boolean))
  : null;

function walkUiFiles(directory, files = [], pluginRoot = directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'locales') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walkUiFiles(file, files, pluginRoot);
    else {
      const relative = path.relative(pluginRoot, file).replace(/\\/g, '/');
      if (file.endsWith('.html') || (file.endsWith('.js') && /(?:^|\/)(?:ui|overlay|public|frontend|client)(?:\/|$)|(?:^|\/)(?:ui|overlay|client)\.js$/i.test(relative))) {
        files.push(file);
      }
    }
  }
  return files;
}

function readTranslationMap(pluginRoot, pluginId) {
  const localePath = path.join(pluginRoot, 'locales', 'en.json');
  if (!fs.existsSync(localePath)) return new Map();
  const flat = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8').replace(/^\uFEFF/, '')));
  const namespace = `plugins.${pluginId}.`;
  return buildUniqueTranslationMap(Object.entries(flat)
    .filter(([key, value]) => (key.startsWith(namespace) || key.startsWith('common.')) && typeof value === 'string')
    .map(([key, value]) => [key, normalizeText(value)]));
}

function completePluginTranslationKeys(pluginRoot, pluginId) {
  const localeKeys = ['de', 'en', 'es', 'fr'].map((locale) => {
    const localePath = path.join(pluginRoot, 'locales', `${locale}.json`);
    if (!fs.existsSync(localePath)) return new Set();
    return new Set(Object.keys(flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8').replace(/^\uFEFF/, '')))));
  });
  const namespace = `plugins.${pluginId}.`;
  return new Set([...localeKeys[0]].filter((key) => key.startsWith(namespace) && localeKeys.every((keys) => keys.has(key))));
}

const plugins = loadPublishedPluginCatalog(repoRoot).plugins
  .filter((plugin) => !requestedPluginIds || requestedPluginIds.has(plugin.id));
if (requestedPluginIds) {
  const known = new Set(plugins.map((plugin) => plugin.id));
  const unknown = [...requestedPluginIds].filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`Unknown plugin id(s): ${unknown.join(', ')}`);
}

let marked = 0;
let rewritten = 0;
let changedFiles = 0;
for (const plugin of plugins) {
  const pluginRoot = path.dirname(plugin.manifestPath);
  const translationMap = readTranslationMap(pluginRoot, plugin.id);
  const translationKeys = completePluginTranslationKeys(pluginRoot, plugin.id);
  for (const file of walkUiFiles(pluginRoot)) {
    const previous = fs.readFileSync(file, 'utf8');
    const keyResult = rewriteLegacyPluginKeys(previous, plugin.id, translationKeys);
    const markerResult = addMarkers && file.endsWith('.html')
      ? addExistingPluginMarkers(keyResult.source, translationMap)
      : { source: keyResult.source, marked: 0 };
    if (markerResult.source !== previous) {
      if (!dryRun) fs.writeFileSync(file, markerResult.source, 'utf8');
      marked += markerResult.marked;
      rewritten += keyResult.rewritten;
      changedFiles += 1;
    }
  }
}

console.log(`${dryRun ? 'Would rewrite' : 'Rewrote'} ${rewritten} legacy plugin UI keys${addMarkers ? ` and ${dryRun ? ' would add' : ' added'} ${marked} existing UI markers` : ''} across ${changedFiles} UI files.`);
