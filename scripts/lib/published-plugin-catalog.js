'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readReleasePolicy(repoRoot) {
  const policyPath = path.join(repoRoot, 'app', 'config', 'plugin-release-policy.json');
  const policy = readJson(policyPath);
  if (!policy || policy.schemaVersion !== 1 || !Array.isArray(policy.closedBeta)) {
    throw new Error('plugin-release-policy.json has an invalid schema');
  }
  if (!policy.aliases || typeof policy.aliases !== 'object' || Array.isArray(policy.aliases)) {
    throw new Error('plugin-release-policy.json aliases must be an object');
  }
  if (Object.keys(policy).some((key) => !['schemaVersion', 'closedBeta', 'aliases'].includes(key))) {
    throw new Error('plugin-release-policy.json contains an unknown key');
  }
  const ids = policy.closedBeta;
  if (ids.some((id) => typeof id !== 'string' || !PLUGIN_ID_PATTERN.test(id))
    || new Set(ids).size !== ids.length) {
    throw new Error('plugin-release-policy.json contains invalid or duplicate closed-beta plugin ids');
  }
  for (const [alias, canonical] of Object.entries(policy.aliases)) {
    if (!PLUGIN_ID_PATTERN.test(alias) || typeof canonical !== 'string' || !PLUGIN_ID_PATTERN.test(canonical)) {
      throw new Error('plugin-release-policy.json contains an invalid alias');
    }
  }
  return { closedBeta: new Set(ids), aliases: policy.aliases };
}

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

function isClosedBetaPlugin(repoRoot, pluginId) {
  return readReleasePolicy(repoRoot).closedBeta.has(pluginId);
}

function loadPublishedPluginCatalog(repoRoot) {
  const releasePolicy = readReleasePolicy(repoRoot);
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

  const duplicateAliases = Object.entries(releasePolicy.aliases)
    .filter(([alias, canonical]) => alias === canonical || !canonical);
  if (duplicateAliases.length) {
    throw new Error('plugin-release-policy.json contains an invalid alias');
  }
  for (const [alias, canonical] of Object.entries(releasePolicy.aliases)) {
    if (!releasePolicy.closedBeta.has(canonical)) {
      throw new Error(`Release-policy alias ${alias} must resolve to a closed-beta plugin`);
    }
  }
  const aliasIds = new Set(Object.keys(releasePolicy.aliases));
  const publicStoreIds = storeIds.filter((id) => (
    !releasePolicy.closedBeta.has(id) && !aliasIds.has(id)
  ));
  const publicStorePlugins = storePlugins.filter((plugin) => (
    !releasePolicy.closedBeta.has(plugin.id) && !aliasIds.has(plugin.id)
  ));

  const appById = new Map(appManifests.map((manifest) => [manifest.id, manifest]));
  const sourceById = new Map(storeSourceManifests.map((manifest) => [manifest.id, manifest]));
  for (const [id, manifest] of sourceById) {
    if (!releasePolicy.closedBeta.has(id) && !aliasIds.has(id) && !storeIds.includes(id)) {
      throw new Error(`Store source manifest ${id} is missing from plugin-store.json`);
    }
  }

  for (const id of publicStoreIds) {
    if (!appById.has(id) && !sourceById.has(id)) {
      throw new Error(`plugin-store.json entry ${id} has no plugin manifest`);
    }
  }

  const storeAdminMetadata = publicStorePlugins.find((plugin) => plugin.id === 'store-admin');
  if (!storeAdminMetadata || !sourceById.has('store-admin')) {
    throw new Error('Store Admin must have store-source and plugin-store.json records');
  }
  const storeAdmin = {
    ...sourceById.get('store-admin'),
    ...storeAdminMetadata
  };

  const plugins = [...appManifests.filter((manifest) => !releasePolicy.closedBeta.has(manifest.id)), ...storeSourceManifests.filter((manifest) => (
    manifest.id !== 'store-admin' && !appById.has(manifest.id)
  ) && !releasePolicy.closedBeta.has(manifest.id) && !aliasIds.has(manifest.id))]
    .sort(compareById);
  const manifestIds = plugins.map((manifest) => manifest.id);

  return {
    plugins,
    manifestIds,
    storeIds: publicStoreIds,
    closedBetaIds: [...releasePolicy.closedBeta].sort(),
    aliases: releasePolicy.aliases,
    guideIds: [...manifestIds, 'store-admin'].sort(),
    storeAdmin
  };
}

module.exports = { isClosedBetaPlugin, loadPublishedPluginCatalog };
