'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function parseDocsCapturePluginIds(value) {
  if (value === undefined || value === null || value === '') return [];
  const rawIds = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
  if (!rawIds) throw new TypeError('Documentation capture plugin allowlist must be a comma-separated string or array');

  const ids = rawIds.map(id => typeof id === 'string' ? id.trim() : '');
  if (ids.some(id => !id || !PLUGIN_ID_PATTERN.test(id))) {
    throw new Error('Documentation capture plugin allowlist contains an invalid plugin ID');
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('Documentation capture plugin allowlist contains duplicate plugin IDs');
  }
  return ids;
}

function localDocsPluginSources(repoRoot) {
  const sourceRoots = [
    path.join(repoRoot, 'app', 'plugins'),
    path.join(repoRoot, 'plugin-store', 'sources')
  ];
  const pluginSources = new Map();
  for (const sourceRoot of sourceRoots) {
    if (!fs.existsSync(sourceRoot)) continue;
    const sourceRootStat = fs.lstatSync(sourceRoot);
    if (!sourceRootStat.isDirectory() || sourceRootStat.isSymbolicLink()) {
      throw new Error(`Documentation capture plugin source root must be a regular directory: ${sourceRoot}`);
    }
    for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sourceDir = path.join(sourceRoot, entry.name);
      if (fs.lstatSync(sourceDir).isSymbolicLink()) continue;
      const manifestPath = path.join(sourceDir, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifestStat = fs.lstatSync(manifestPath);
      if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest.id) throw new Error(`Docs capture plugin manifest has no id: ${manifestPath}`);
      if (!PLUGIN_ID_PATTERN.test(manifest.id)) {
        throw new Error(`Docs capture plugin manifest has an invalid id: ${manifestPath}`);
      }
      // Prefer the shipped app plugin when both roots contain the same id,
      // matching the normal runtime's plugin-source precedence.
      if (!pluginSources.has(manifest.id)) pluginSources.set(manifest.id, sourceDir);
    }
  }
  return [...pluginSources.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function ensureRealDirectory(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    const stat = fs.lstatSync(directoryPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Documentation capture fixture path must be a real directory: ${directoryPath}`);
    }
    return;
  }
  fs.mkdirSync(directoryPath);
}

function assertTemporaryProfile(profileDir) {
  const tempRoot = path.resolve(os.tmpdir());
  const profilePath = path.resolve(profileDir);
  const profileStat = fs.lstatSync(profilePath);
  if (!profileStat.isDirectory() || profileStat.isSymbolicLink()) {
    throw new Error('Documentation capture profile must be a real temporary directory');
  }
  if (!isPathInside(tempRoot, profilePath)) {
    throw new Error('Documentation capture profile must remain inside the system temp directory');
  }
  return profilePath;
}

function copyRegularTree(sourcePath, destinationPath, sourceRoot) {
  const sourceStat = fs.lstatSync(sourcePath);
  if (sourceStat.isSymbolicLink()) {
    throw new Error(`Documentation capture plugin source contains a symbolic link: ${sourcePath}`);
  }
  const resolvedSourcePath = path.resolve(sourcePath);
  if (!isPathInside(sourceRoot, resolvedSourcePath) && resolvedSourcePath !== sourceRoot) {
    throw new Error(`Documentation capture plugin source escapes its root: ${sourcePath}`);
  }

  if (sourceStat.isDirectory()) {
    fs.mkdirSync(destinationPath);
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      copyRegularTree(
        path.join(sourcePath, entry.name),
        path.join(destinationPath, entry.name),
        sourceRoot
      );
    }
    return;
  }
  if (!sourceStat.isFile()) {
    throw new Error(`Documentation capture plugin source contains a non-regular file: ${sourcePath}`);
  }
  fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
}

function prepareDocsPluginFixture(repoRoot, profileDir, allowedPluginIds = []) {
  const allowedIds = parseDocsCapturePluginIds(allowedPluginIds);
  const availablePlugins = new Map(localDocsPluginSources(repoRoot));
  for (const pluginId of allowedIds) {
    if (!availablePlugins.has(pluginId)) {
      throw new Error(`Documentation capture plugin is not available locally: ${pluginId}`);
    }
  }

  const realProfileDir = assertTemporaryProfile(profileDir);
  const fixtureAppRoot = path.join(realProfileDir, 'docs-capture-app');
  const fixtureRoot = path.join(fixtureAppRoot, 'plugins');
  ensureRealDirectory(fixtureAppRoot);
  ensureRealDirectory(fixtureRoot);

  // A docs fixture contains exactly the explicitly allowed plugin sources.
  // Enabling additional plugins for route parity can start unrelated services
  // and connectors, so shared routes must be declared as explicit dependencies.
  for (const pluginId of allowedIds) {
    const pluginSourceDir = availablePlugins.get(pluginId);
    const fixtureDir = path.join(fixtureRoot, pluginId);
    if (fs.existsSync(fixtureDir)) {
      throw new Error(`Documentation capture plugin fixture already exists: ${pluginId}`);
    }
    const sourceRoot = path.resolve(pluginSourceDir);
    copyRegularTree(pluginSourceDir, fixtureDir, sourceRoot);
    const manifestPath = path.join(fixtureDir, 'plugin.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.id !== pluginId) {
      throw new Error(`Documentation capture plugin source ID mismatch: ${pluginId}`);
    }
    manifest.enabled = true;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  return fixtureRoot;
}

module.exports = {
  parseDocsCapturePluginIds,
  localDocsPluginSources,
  prepareDocsPluginFixture,
  isPathInside
};
