'use strict';

const fs = require('fs');
const path = require('path');

function compareById(left, right) {
  return left.id.localeCompare(right.id);
}

function readManifestDirectory(pluginRoot) {
  if (!fs.existsSync(pluginRoot)) return [];

  return fs.readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pluginRoot, entry.name, 'plugin.json'))
    .filter(fs.existsSync)
    .map((manifestPath) => ({
      ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
      manifestPath
    }));
}

function assertUniqueManifests(manifests, label) {
  const ids = new Set();
  for (const manifest of manifests) {
    if (!manifest.id) throw new Error(`${label} manifest is missing an id: ${manifest.manifestPath}`);
    if (ids.has(manifest.id)) throw new Error(`Duplicate ${label} manifest id: ${manifest.id}`);
    ids.add(manifest.id);
  }
}

function loadPublishedPluginCatalog(repoRoot) {
  const appManifests = readManifestDirectory(path.join(repoRoot, 'app', 'plugins'));
  const storeSourceManifests = readManifestDirectory(path.join(repoRoot, 'plugin-store', 'sources'));
  assertUniqueManifests(appManifests, 'app plugin');
  assertUniqueManifests(storeSourceManifests, 'store source');

  const store = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
  const storePlugins = Array.isArray(store.plugins) ? store.plugins : [];
  const storeIds = storePlugins.map((plugin) => plugin.id).sort();
  if (storeIds.some((id, index) => !id || storeIds.indexOf(id) !== index)) {
    throw new Error('plugin-store.json contains a missing or duplicate plugin id');
  }

  const appById = new Map(appManifests.map((manifest) => [manifest.id, manifest]));
  const sourceById = new Map(storeSourceManifests.map((manifest) => [manifest.id, manifest]));
  for (const [id, manifest] of sourceById) {
    if (id !== 'store-admin' && appById.has(id)) {
      throw new Error(`Duplicate published plugin manifest id: ${id} (${appById.get(id).manifestPath}, ${manifest.manifestPath})`);
    }
    if (!storeIds.includes(id)) {
      throw new Error(`Store source manifest ${id} is missing from plugin-store.json`);
    }
  }

  for (const id of storeIds) {
    if (!appById.has(id) && !sourceById.has(id)) {
      throw new Error(`plugin-store.json entry ${id} has no plugin manifest`);
    }
  }

  const storeAdmin = storePlugins.find((plugin) => plugin.id === 'store-admin');
  if (!storeAdmin || !sourceById.has('store-admin')) {
    throw new Error('Store Admin must have store-source and plugin-store.json records');
  }

  const plugins = [...appManifests, ...storeSourceManifests]
    .filter((manifest) => manifest.id !== 'store-admin')
    .sort(compareById);
  const manifestIds = plugins.map((manifest) => manifest.id);

  return {
    plugins,
    manifestIds,
    storeIds,
    guideIds: [...manifestIds, 'store-admin'].sort(),
    storeAdmin
  };
}

module.exports = { loadPublishedPluginCatalog };
