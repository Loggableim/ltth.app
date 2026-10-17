'use strict';

const RETIRED_PLUGIN_IDS = new Set(['chatango']);

function normalizePluginId(pluginId) {
  let normalized = String(pluginId || '').normalize('NFKC').trim();
  for (let attempt = 0; attempt < 8 && normalized.includes('%'); attempt += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded.normalize('NFKC');
    } catch {
      break;
    }
  }
  return normalized.trim().normalize('NFKC').toLowerCase();
}

function isRetiredPluginId(pluginId) {
  const normalized = normalizePluginId(pluginId);
  // Percent is not valid in plugin IDs. Fail closed if a hostile identifier is
  // still encoded after bounded decoding rather than letting another layer
  // decode it into a retired ID later.
  return normalized.includes('%') || RETIRED_PLUGIN_IDS.has(normalized);
}

function isRetiredPluginManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return false;
  if (isRetiredPluginId(manifest.id)) return true;
  const identifiers = ['aliases', 'replaces'].flatMap(field => (
    Array.isArray(manifest[field]) ? manifest[field] : typeof manifest[field] === 'string' ? [manifest[field]] : []
  ));
  return identifiers.some(isRetiredPluginId);
}

function assertPluginManifestNotRetired(manifest) {
  if (!isRetiredPluginManifest(manifest)) return;
  const ids = [manifest.id,
    ...(Array.isArray(manifest.aliases) ? manifest.aliases : typeof manifest.aliases === 'string' ? [manifest.aliases] : []),
    ...(Array.isArray(manifest.replaces) ? manifest.replaces : typeof manifest.replaces === 'string' ? [manifest.replaces] : [])
  ];
  assertPluginNotRetired(ids.find(isRetiredPluginId));
}

function assertPluginNotRetired(pluginId) {
  if (!isRetiredPluginId(pluginId)) return;

  const error = new Error(`Plugin ${normalizePluginId(pluginId)} has been retired`);
  error.code = 'PLUGIN_RETIRED';
  error.pluginId = normalizePluginId(pluginId);
  throw error;
}

module.exports = {
  assertPluginManifestNotRetired,
  assertPluginNotRetired,
  isRetiredPluginManifest,
  isRetiredPluginId
};
