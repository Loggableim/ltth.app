'use strict';

const fs = require('fs');
const path = require('path');

// The normal loader intentionally keeps these implementations mutually
// exclusive. A docs fixture enables every local provider for route parity,
// but the guide currently under capture must retain its own implementation
// so its documented API and UI aliases are registered by the real plugin.
const MUTUALLY_EXCLUSIVE_PLUGIN_GROUPS = Object.freeze([
  Object.freeze(['fireworks', 'webgpu-fireworks']),
  Object.freeze(['emoji-rain', 'webgpu-emoji-rain'])
]);

// Chatango mounts an external provider script from its dashboard adapter. It
// remains enabled for its own product guide, but unrelated local dashboard
// captures must retain the real disabled-plugin state so the fixture never
// creates an outbound embed just to register unrelated local routes.
const CAPTURE_GUIDE_ONLY_PLUGIN_IDS = new Set(['chatango']);

function resolveDocsPluginSource(repoRoot, guideId) {
  const candidates = [
    path.join(repoRoot, 'app', 'plugins', guideId),
    path.join(repoRoot, 'plugin-store', 'sources', guideId)
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'plugin.json'))) || null;
}

function localDocsPluginSources(repoRoot) {
  const sourceRoots = [
    path.join(repoRoot, 'app', 'plugins'),
    path.join(repoRoot, 'plugin-store', 'sources')
  ];
  const pluginSources = new Map();
  for (const sourceRoot of sourceRoots) {
    if (!fs.existsSync(sourceRoot)) continue;
    for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sourceDir = path.join(sourceRoot, entry.name);
      const manifestPath = path.join(sourceDir, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest.id) throw new Error(`Docs capture plugin manifest has no id: ${manifestPath}`);
      // Prefer the shipped app plugin when both roots contain the same id,
      // matching the normal runtime's plugin-source precedence.
      if (!pluginSources.has(manifest.id)) pluginSources.set(manifest.id, sourceDir);
    }
  }
  return [...pluginSources.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function linkSharedAppDependency(fixtureAppRoot, sourceAppRoot, name) {
  const linkPath = path.join(fixtureAppRoot, name);
  if (fs.existsSync(linkPath)) return;
  fs.symlinkSync(
    path.join(sourceAppRoot, name),
    linkPath,
    process.platform === 'win32' ? 'junction' : 'dir'
  );
}

function prepareDocsPluginFixture(repoRoot, profileDir, guideId) {
  if (!guideId) return null;
  const sourceDir = resolveDocsPluginSource(repoRoot, guideId);
  if (!sourceDir) return null;

  const sourceAppRoot = path.join(repoRoot, 'app');
  const fixtureAppRoot = path.join(profileDir, 'docs-capture-app');
  const fixtureRoot = path.join(fixtureAppRoot, 'plugins');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  linkSharedAppDependency(fixtureAppRoot, sourceAppRoot, 'modules');
  linkSharedAppDependency(fixtureAppRoot, sourceAppRoot, 'node_modules');
  // Dashboard and plugin surfaces share real plugin-local APIs. Mount every
  // shipped local route provider in this throwaway profile so a guide never
  // falls back to invented responses or fails because another local plugin
  // was omitted. The profile itself remains per-guide and is deleted after
  // capture, so no plugin state crosses guides or locales.
  for (const [pluginId, pluginSourceDir] of localDocsPluginSources(repoRoot)) {
    const fixtureDir = path.join(fixtureRoot, pluginId);
    const manifestPath = path.join(fixtureDir, 'plugin.json');
    fs.cpSync(pluginSourceDir, fixtureDir, { recursive: true });

    // These copies are ephemeral. Enabling each manifest registers its real
    // local routes; the isolated profile prevents touching a user installation.
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.enabled = !CAPTURE_GUIDE_ONLY_PLUGIN_IDS.has(pluginId) || pluginId === guideId;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  // Keep the selected member of an exclusive family enabled. This mirrors a
  // user selecting the documented implementation in a clean profile, rather
  // than letting the loader choose the legacy sibling by name.
  for (const pluginIds of MUTUALLY_EXCLUSIVE_PLUGIN_GROUPS) {
    if (!pluginIds.includes(guideId)) continue;
    for (const pluginId of pluginIds) {
      if (pluginId === guideId) continue;
      const manifestPath = path.join(fixtureRoot, pluginId, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.enabled = false;
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
  }
  return fixtureRoot;
}

module.exports = { localDocsPluginSources, prepareDocsPluginFixture, resolveDocsPluginSource };
