'use strict';

const fs = require('fs');
const path = require('path');

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

function prepareDocsPluginFixture(repoRoot, profileDir, guideId) {
  if (!guideId) return null;
  const sourceDir = resolveDocsPluginSource(repoRoot, guideId);
  if (!sourceDir) return null;

  const sourceAppRoot = path.join(repoRoot, 'app');
  const fixtureAppRoot = path.join(profileDir, 'docs-capture-app');
  const fixtureRoot = path.join(fixtureAppRoot, 'plugins');
  const fixtureDir = path.join(fixtureRoot, guideId);
  const manifestPath = path.join(fixtureDir, 'plugin.json');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  linkSharedAppDependency(fixtureAppRoot, sourceAppRoot, 'modules');
  linkSharedAppDependency(fixtureAppRoot, sourceAppRoot, 'node_modules');
  fs.cpSync(sourceDir, fixtureDir, { recursive: true });

  // The copy is ephemeral. Enabling only this plugin gives the capture its
  // genuine local API and UI workflow without loading a user's plugin state.
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.enabled = true;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return fixtureRoot;
}

module.exports = { prepareDocsPluginFixture, resolveDocsPluginSource };
