'use strict';

const fs = require('fs');
const path = require('path');

function freezeIdentity(identity) {
  return Object.freeze({
    ...identity,
    aliases: Object.freeze([...(identity.aliases || [])]),
    configStorageKeys: Object.freeze([...(identity.configStorageKeys || [])]),
    historicalPackages: Object.freeze((identity.historicalPackages || []).map(entry => Object.freeze({ ...entry })))
  });
}

const PLUGIN_IDENTITIES = Object.freeze({
  'stream-monsters': freezeIdentity({
    id: 'stream-monsters',
    aliases: ['streamalchemy'],
    persistentStorageId: 'streamalchemy',
    configStorageKeys: [
      'plugin:stream-monsters:config',
      'plugin:streamalchemy:streamalchemy_config'
    ],
    historicalPackages: [{
      manifestId: 'streamalchemy',
      version: '1.11.1',
      package: 'plugin-store/packages/streamalchemy-1.11.1.zip',
      sha256: '46918c6c52bd0bcae123950e038e4db3feadd30fa1bc514758e8e411d00c3b60'
    }]
  })
});

const CANONICAL_BY_ID = new Map();
for (const identity of Object.values(PLUGIN_IDENTITIES)) {
  CANONICAL_BY_ID.set(identity.id, identity.id);
  for (const alias of identity.aliases) CANONICAL_BY_ID.set(alias, identity.id);
}

function canonicalizePluginId(id) {
  const normalized = String(id || '').trim();
  return CANONICAL_BY_ID.get(normalized) || normalized;
}

function getPluginIdentity(id) {
  return PLUGIN_IDENTITIES[canonicalizePluginId(id)] || null;
}

function getIdentityCandidateIds(id) {
  const canonicalId = canonicalizePluginId(id);
  const identity = getPluginIdentity(canonicalId);
  return identity ? [identity.id, ...identity.aliases] : [canonicalId];
}

function getPersistentStorageId(id) {
  const canonicalId = canonicalizePluginId(id);
  return getPluginIdentity(canonicalId)?.persistentStorageId || canonicalId;
}

function getConfigStorageKeys(id, key = 'config') {
  const canonicalId = canonicalizePluginId(id);
  const identity = getPluginIdentity(canonicalId);
  if (
    identity &&
    identity.id === 'stream-monsters' &&
    ['config', 'streamalchemy_config'].includes(String(key || 'config'))
  ) {
    return [...identity.configStorageKeys];
  }
  return [`plugin:${canonicalId}:${String(key || 'config')}`];
}

function canonicalizeIftttId(id) {
  const value = String(id || '').trim();
  const separator = value.indexOf(':');
  if (separator < 0) return canonicalizePluginId(value);
  return `${canonicalizePluginId(value.slice(0, separator))}${value.slice(separator)}`;
}

function resolveInstalledPluginDirectory(pluginsDir, id, options = {}) {
  const fileSystem = options.fs || fs;
  const canonicalId = canonicalizePluginId(id);
  for (const directoryName of getIdentityCandidateIds(canonicalId)) {
    const pluginPath = path.join(pluginsDir, directoryName);
    const manifestPath = path.join(pluginPath, 'plugin.json');
    if (!fileSystem.existsSync(manifestPath)) continue;
    try {
      const raw = String(fileSystem.readFileSync(manifestPath, 'utf8'));
      const manifest = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
      if (!manifest.id) continue;
      if (canonicalizePluginId(manifest.id) !== canonicalId) continue;
      return {
        canonicalId,
        directoryName,
        path: pluginPath,
        runtimeManifestId: manifest.id,
        manifest
      };
    } catch {
      continue;
    }
  }
  return null;
}

function getHistoricalPluginPackage(id, version = null) {
  const identity = getPluginIdentity(id);
  if (!identity) return null;
  return identity.historicalPackages.find(entry => (
    entry.manifestId === String(id || '').trim() &&
    (version === null || String(entry.version) === String(version))
  )) || null;
}

function assertReservedPluginClaim({ manifestId, version, sha256, packagePath } = {}) {
  const claimedId = String(manifestId || '').trim();
  const identity = getPluginIdentity(claimedId);
  if (!identity || claimedId === identity.id) return identity?.id || claimedId;
  const mapping = getHistoricalPluginPackage(claimedId, version);
  const normalizedHash = String(sha256 || '').trim().toLowerCase();
  const normalizedPackage = String(packagePath || '').replace(/\\/g, '/');
  const packageMatches = mapping && (
    normalizedPackage === mapping.package ||
    normalizedPackage.endsWith(`/${mapping.package}`) ||
    normalizedPackage.endsWith(`/${path.posix.basename(mapping.package)}`) ||
    normalizedPackage === path.posix.basename(mapping.package)
  );
  if (!mapping || normalizedHash !== mapping.sha256 || !packageMatches) {
    const error = new Error(`Reserved plugin alias cannot be claimed: ${claimedId}`);
    error.code = 'PLUGIN_IDENTITY_RESERVED_ALIAS';
    error.details = { manifestId: claimedId, version: String(version || ''), sha256: normalizedHash };
    throw error;
  }
  return identity.id;
}

module.exports = {
  PLUGIN_IDENTITIES,
  assertReservedPluginClaim,
  canonicalizeIftttId,
  canonicalizePluginId,
  getConfigStorageKeys,
  getIdentityCandidateIds,
  getHistoricalPluginPackage,
  getPersistentStorageId,
  getPluginIdentity,
  resolveInstalledPluginDirectory
};
