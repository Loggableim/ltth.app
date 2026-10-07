'use strict';

const fs = require('fs');
const path = require('path');
const { assertPluginId } = require('./plugin-paths');
const { canonicalizePluginId } = require('./plugin-identities');

const APP_ROOT = path.join(__dirname, '..');

function readJson(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
  } catch {
    return null;
  }
}

function createPluginReleasePolicy(options = {}) {
  const appRoot = options.appRoot || APP_ROOT;
  const policyPath = options.policyPath || path.join(appRoot, 'config', 'plugin-release-policy.json');
  const modePath = options.modePath || path.join(appRoot, 'config', 'distribution-mode.json');

  function getSnapshot() {
    const markerExists = fs.existsSync(modePath);
    const mode = readJson(modePath);
    if (markerExists && !mode) {
      return { publicMode: true, policyInvalid: true, blockedIds: new Set(), aliases: new Map() };
    }
    if (!markerExists) return { publicMode: false, blockedIds: new Set(), aliases: new Map() };
    const validModeKeys = mode && typeof mode === 'object' && !Array.isArray(mode) &&
      Object.keys(mode).every(key => ['channel', 'schemaVersion'].includes(key)) &&
      (mode.schemaVersion === undefined || mode.schemaVersion === 1);
    if (!validModeKeys || !['public', 'local'].includes(mode.channel)) {
      return { publicMode: true, policyInvalid: true, blockedIds: new Set(), aliases: new Map() };
    }
    const publicMode = mode.channel === 'public';
    if (!publicMode) return { publicMode: false, blockedIds: new Set(), aliases: new Map() };

    const policy = readJson(policyPath);
    if (!policy || typeof policy !== 'object' || Array.isArray(policy) || policy.schemaVersion !== 1 ||
        !Array.isArray(policy.closedBeta) ||
        !Object.keys(policy).every(key => ['schemaVersion', 'closedBeta', 'aliases'].includes(key)) ||
        (policy.aliases !== undefined && (!policy.aliases || typeof policy.aliases !== 'object' || Array.isArray(policy.aliases)))) {
      // A public marker without a usable policy must not expose an incomplete catalog.
      return { publicMode: true, policyInvalid: true, blockedIds: new Set(), aliases: new Map() };
    }

    const blockedIds = new Set();
    for (const rawId of policy.closedBeta) {
      try {
        const id = canonicalizePluginId(assertPluginId(rawId));
        if (blockedIds.has(id)) throw new Error('Duplicate closed-beta plugin id');
        blockedIds.add(id);
      } catch {
        return { publicMode: true, policyInvalid: true, blockedIds: new Set(), aliases: new Map() };
      }
    }

    const aliases = new Map();
    if (policy.aliases && typeof policy.aliases === 'object' && !Array.isArray(policy.aliases)) {
      for (const [rawAlias, rawCanonical] of Object.entries(policy.aliases)) {
        try {
          const alias = assertPluginId(rawAlias);
          const canonical = canonicalizePluginId(assertPluginId(rawCanonical));
          if (aliases.has(alias) || blockedIds.has(alias) || alias === canonical || !blockedIds.has(canonical)) {
            throw new Error('Invalid closed-beta plugin alias');
          }
          aliases.set(alias, canonical);
          if (blockedIds.has(canonical)) blockedIds.add(alias);
        } catch {
          return { publicMode: true, policyInvalid: true, blockedIds: new Set(), aliases: new Map() };
        }
      }
    }

    return { publicMode: true, blockedIds, aliases };
  }

  function resolveId(id, snapshot = getSnapshot()) {
    let safeId;
    try {
      safeId = assertPluginId(id);
    } catch {
      return '';
    }
    return snapshot.aliases.get(safeId) || canonicalizePluginId(safeId);
  }

  function isClosedBetaId(id, snapshot = getSnapshot()) {
    if (!snapshot.publicMode) return false;
    if (snapshot.policyInvalid) return true;
    const safeId = String(id || '').trim();
    return snapshot.blockedIds.has(safeId) || snapshot.blockedIds.has(resolveId(safeId, snapshot));
  }

  function assertAllowed(id, snapshot = getSnapshot()) {
    if (isClosedBetaId(id, snapshot)) {
      const error = new Error(`Plugin ${String(id || '').trim()} is unavailable in the public distribution`);
      error.code = snapshot.policyInvalid ? 'PLUGIN_RELEASE_POLICY_INVALID' : 'PLUGIN_CLOSED_BETA_PUBLIC';
      throw error;
    }
    return resolveId(id, snapshot);
  }

  function filterRegistry(registry) {
    const snapshot = getSnapshot();
    if (!snapshot.publicMode || !registry || !Array.isArray(registry.plugins)) return registry;
    return {
      ...registry,
      plugins: registry.plugins.filter(plugin => !isClosedBetaId(plugin?.id, snapshot))
    };
  }

  function createRequestGuard(guardOptions = {}) {
    return function pluginReleaseRequestGuard(req, res, next) {
      let decodedPath = String(req.path || '');
      try { decodedPath = decodeURIComponent(decodedPath); } catch { /* malformed paths are rejected downstream */ }
      const segments = decodedPath.replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .map(segment => segment.toLowerCase());
      let pluginId = '';
      if (segments[0] === 'plugins') pluginId = segments[1] || '';
      if (segments[0] === 'api' && segments[1] === 'plugins') pluginId = segments[2] || '';
      const snapshot = getSnapshot();
      let manifestIsClosedBeta = false;
      if (snapshot.publicMode && segments[0] === 'plugins' && pluginId) {
        try {
          const directoryName = assertPluginId(pluginId);
          const configuredPluginsDir = typeof guardOptions.pluginsDir === 'function'
            ? guardOptions.pluginsDir()
            : guardOptions.pluginsDir;
          if (configuredPluginsDir) {
            const pluginRoot = path.resolve(configuredPluginsDir);
            const manifestPath = path.resolve(pluginRoot, directoryName, 'plugin.json');
            const relativeManifestPath = path.relative(pluginRoot, manifestPath);
            if (relativeManifestPath && !relativeManifestPath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeManifestPath)) {
              const manifest = readJson(manifestPath);
              const identities = [manifest?.id, ...(Array.isArray(manifest?.aliases) ? manifest.aliases : []),
                ...(Array.isArray(manifest?.replaces) ? manifest.replaces : [])];
              manifestIsClosedBeta = identities.some(identity => identity && isClosedBetaId(identity, snapshot));
            }
          }
        } catch {
          // Invalid directory names/manifests are left to the static/route layer's normal handling.
        }
      }
      if (pluginId && (isClosedBetaId(pluginId, snapshot) || manifestIsClosedBeta)) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      return next();
    };
  }

  return { getSnapshot, isClosedBetaId, assertAllowed, filterRegistry, createRequestGuard };
}

module.exports = { createPluginReleasePolicy };
