'use strict';

const fs = require('fs');
const path = require('path');
const { assertPluginId } = require('./plugin-paths');
const { canonicalizePluginId } = require('./plugin-identities');
const { isRetiredPluginId, isRetiredPluginManifest } = require('./plugin-retirement');

const APP_ROOT = path.join(__dirname, '..');

function readJson(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
  } catch {
    return null;
  }
}

function readPublicAssetPathOwners(policy) {
  const mapping = policy?.publicAssetPathOwners;
  if (mapping === undefined) return new Map();
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new Error('Invalid public asset ownership mapping');
  }

  const owners = new Map();
  for (const [rawPath, rawOwner] of Object.entries(mapping)) {
    if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || rawPath.startsWith('//') ||
        rawPath !== rawPath.toLowerCase() || rawPath.includes('\\') || rawPath.includes('%') ||
        rawPath.includes('?') || rawPath.includes('#') || path.posix.normalize(rawPath) !== rawPath) {
      throw new Error('Invalid public asset path');
    }
    const owner = canonicalizePluginId(assertPluginId(rawOwner));
    if (owners.has(rawPath)) throw new Error('Duplicate public asset path');
    owners.set(rawPath, owner);
  }
  return owners;
}

function createPluginReleasePolicy(options = {}) {
  const appRoot = options.appRoot || APP_ROOT;
  const policyPath = options.policyPath || path.join(appRoot, 'config', 'plugin-release-policy.json');
  const modePath = options.modePath || path.join(appRoot, 'config', 'distribution-mode.json');

  function getSnapshot({ publicSurface = false } = {}) {
    const policy = readJson(policyPath);
    let publicAssetPathOwners = new Map();
    try { publicAssetPathOwners = readPublicAssetPathOwners(policy); } catch { /* public policy validation fails closed below */ }
    const failClosedSnapshot = () => ({
      publicMode: true,
      policyInvalid: true,
      blockedIds: new Set(),
      aliases: new Map(),
      publicAssetPathOwners
    });
    const markerExists = fs.existsSync(modePath);
    let mode = readJson(modePath);
    if (markerExists && !mode) {
      return failClosedSnapshot();
    }
    if (!markerExists && !publicSurface) return { publicMode: false, blockedIds: new Set(), aliases: new Map(), publicAssetPathOwners };
    if (!markerExists) {
      // Public Quick-Tunnel clients remain an external surface even when the
      // installed distribution is in local/developer mode.
      mode = { channel: 'local' };
    }
    const validModeKeys = mode && typeof mode === 'object' && !Array.isArray(mode) &&
      Object.keys(mode).every(key => ['channel', 'schemaVersion'].includes(key)) &&
      (mode.schemaVersion === undefined || mode.schemaVersion === 1);
    if (!validModeKeys || !['public', 'local', 'developer'].includes(mode.channel)) {
      return failClosedSnapshot();
    }
    const publicMode = mode.channel === 'public';
    if (!publicMode && !publicSurface) return { publicMode: false, blockedIds: new Set(), aliases: new Map(), publicAssetPathOwners };

    if (!policy || typeof policy !== 'object' || Array.isArray(policy) || policy.schemaVersion !== 1 ||
        !Array.isArray(policy.closedBeta) ||
        (policy.publicRuntimeExcluded !== undefined && !Array.isArray(policy.publicRuntimeExcluded)) ||
        !policy.publicAssetPathOwners || typeof policy.publicAssetPathOwners !== 'object' ||
        Array.isArray(policy.publicAssetPathOwners) ||
        !Object.keys(policy).every(key => ['schemaVersion', 'closedBeta', 'publicRuntimeExcluded', 'aliases', 'publicAssetPathOwners'].includes(key)) ||
        (policy.aliases !== undefined && (!policy.aliases || typeof policy.aliases !== 'object' || Array.isArray(policy.aliases)))) {
      // A public marker without a usable policy must not expose an incomplete catalog.
      return failClosedSnapshot();
    }

    const blockedIds = new Set();
    for (const rawId of policy.closedBeta) {
      try {
        const id = canonicalizePluginId(assertPluginId(rawId));
        if (blockedIds.has(id)) throw new Error('Duplicate closed-beta plugin id');
        blockedIds.add(id);
      } catch {
        return failClosedSnapshot();
      }
    }

    const publicRuntimeExcludedIds = new Set();
    for (const rawId of policy.publicRuntimeExcluded || []) {
      try {
        const id = canonicalizePluginId(assertPluginId(rawId));
        if (publicRuntimeExcludedIds.has(id) || blockedIds.has(id)) {
          throw new Error('Duplicate or conflicting public runtime exclusion ID');
        }
        publicRuntimeExcludedIds.add(id);
      } catch {
        return failClosedSnapshot();
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
          return failClosedSnapshot();
        }
      }
    }

    try {
      publicAssetPathOwners = readPublicAssetPathOwners(policy);
      for (const owner of publicAssetPathOwners.values()) {
        if (!blockedIds.has(owner)) throw new Error('Public asset owner is not closed beta');
      }
    } catch {
      return failClosedSnapshot();
    }

    return { publicMode, publicSurface, blockedIds, publicRuntimeExcludedIds, aliases, publicAssetPathOwners };
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
    if (snapshot.policyInvalid) return true;
    if (!snapshot.publicMode && snapshot.publicSurface !== true) return false;
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
      for (let attempt = 0; attempt < 8 && decodedPath.includes('%'); attempt += 1) {
        try {
          const decoded = decodeURIComponent(decodedPath);
          if (decoded === decodedPath) break;
          decodedPath = decoded;
        } catch {
          break;
        }
      }
      const normalizedPath = decodedPath.replace(/\\/g, '/').toLowerCase();
      const segments = normalizedPath.split('/').filter(Boolean);
      let pluginId = '';
      if (segments[0] === 'plugins') pluginId = segments[1] || '';
      if (segments[0] === 'api' && segments[1] === 'plugins') pluginId = segments[2] || '';
      if (pluginId && isRetiredPluginId(pluginId)) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      const snapshot = getSnapshot();
      const assetOwner = snapshot.publicAssetPathOwners?.get(normalizedPath);
      if (assetOwner && isClosedBetaId(assetOwner, snapshot)) {
        return res.status(404).json({ success: false, error: 'Asset not found' });
      }
      let manifestIsClosedBeta = false;
      let manifestIsRetired = false;
      if (segments[0] === 'plugins' && pluginId) {
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
              manifestIsRetired = isRetiredPluginManifest(manifest);
              const identities = [manifest?.id, ...(Array.isArray(manifest?.aliases) ? manifest.aliases : []),
                ...(Array.isArray(manifest?.replaces) ? manifest.replaces : [])];
              manifestIsClosedBeta = snapshot.publicMode && identities.some(identity => identity && isClosedBetaId(identity, snapshot));
            }
          }
        } catch {
          // Invalid directory names/manifests are left to the static/route layer's normal handling.
        }
      }
      if (manifestIsRetired) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      if (pluginId && (isClosedBetaId(pluginId, snapshot) || manifestIsClosedBeta)) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      return next();
    };
  }

  return {
    getSnapshot,
    getPublicSurfaceSnapshot: () => getSnapshot({ publicSurface: true }),
    isClosedBetaId,
    assertAllowed,
    filterRegistry,
    createRequestGuard
  };
}

module.exports = { createPluginReleasePolicy };
