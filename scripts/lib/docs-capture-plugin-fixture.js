'use strict';

const fs = require('fs');
const path = require('path');

const CAPTURE_RUNTIME_DEPENDENCIES = {
  animazingpal: ['tts'],
  'game-engine': ['openshock'],
  'quiz-show': ['tts']
};

function resolveDocsPluginSource(repoRoot, guideId) {
  const candidates = [
    path.join(repoRoot, 'app', 'plugins', guideId),
    path.join(repoRoot, 'plugin-store', 'sources', guideId)
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'plugin.json'))) || null;
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

function linkStaticPluginAssets(repoRoot, fixtureRoot, copiedPluginIds) {
  const sourceRoots = [
    path.join(repoRoot, 'app', 'plugins'),
    path.join(repoRoot, 'plugin-store', 'sources')
  ];

  for (const sourceRoot of sourceRoots) {
    if (!fs.existsSync(sourceRoot)) continue;
    for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || copiedPluginIds.has(entry.name)) continue;
      const assetsDir = path.join(sourceRoot, entry.name, 'assets');
      if (!fs.existsSync(assetsDir)) continue;

      const fixturePluginDir = path.join(fixtureRoot, entry.name);
      const fixtureAssetsDir = path.join(fixturePluginDir, 'assets');
      fs.mkdirSync(fixturePluginDir, { recursive: true });
      if (!fs.existsSync(fixtureAssetsDir)) {
        // The dashboard has a few always-rendered icon paths. Link only those
        // static assets; no additional plugin manifest or runtime is loaded.
        fs.symlinkSync(assetsDir, fixtureAssetsDir, process.platform === 'win32' ? 'junction' : 'dir');
      }
    }
  }
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
  const enabledPluginIds = [guideId, ...(CAPTURE_RUNTIME_DEPENDENCIES[guideId] || [])];
  for (const pluginId of enabledPluginIds) {
    const pluginSourceDir = pluginId === guideId ? sourceDir : resolveDocsPluginSource(repoRoot, pluginId);
    if (!pluginSourceDir) throw new Error(`Docs capture dependency is unavailable: ${pluginId}`);
    const fixtureDir = path.join(fixtureRoot, pluginId);
    const manifestPath = path.join(fixtureDir, 'plugin.json');
    fs.cpSync(pluginSourceDir, fixtureDir, { recursive: true });

    // The copies are ephemeral. Dependencies are explicitly declared local
    // runtime surfaces, so their APIs are real without loading user state.
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.enabled = true;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  linkStaticPluginAssets(repoRoot, fixtureRoot, new Set(enabledPluginIds));
  return fixtureRoot;
}

module.exports = { prepareDocsPluginFixture, resolveDocsPluginSource };
