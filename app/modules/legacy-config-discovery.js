'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const IGNORED_CONFIG_NAMES = new Set(['.gitkeep', 'test-config.json']);
const DEFAULT_MAX_SAMPLE_FILES = 30;

function normalisePath(filePath) {
  return path.resolve(filePath);
}

function lowerPath(filePath) {
  return normalisePath(filePath).toLowerCase();
}

function isSameOrInsidePath(candidatePath, parentPath) {
  if (!candidatePath || !parentPath) {
    return false;
  }

  const candidate = lowerPath(candidatePath);
  const parent = lowerPath(parentPath);
  return candidate === parent || candidate.startsWith(`${parent}${path.sep.toLowerCase()}`);
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function safeReadDir(dirPath, opts = undefined) {
  try {
    return fs.readdirSync(dirPath, opts);
  } catch {
    return [];
  }
}

function isIgnoredConfigName(name) {
  return IGNORED_CONFIG_NAMES.has(name);
}

function createEmptyFindings() {
  return {
    userConfigs: false,
    userData: false,
    uploads: false,
    plugins: false,
    legacyDatabase: false,
    legacyData: false,
    rootPluginState: false,
    files: [],
    counts: {
      userConfigs: 0,
      profileDatabases: 0,
      pluginStateFiles: 0,
      userData: 0,
      uploads: 0,
      plugins: 0,
      legacyDatabase: 0,
      legacyData: 0,
      rootPluginState: 0,
      total: 0
    }
  };
}

function addSample(findings, relPath) {
  if (findings.files.length < DEFAULT_MAX_SAMPLE_FILES) {
    findings.files.push(relPath.replace(/\\/g, '/'));
  }
}

function countDirectoryContents(dirPath, prefix, findings, options = {}) {
  const maxDepth = options.maxDepth ?? 3;
  const entries = safeReadDir(dirPath, { withFileTypes: true });
  let count = 0;
  let latestMtimeMs = 0;

  for (const entry of entries) {
    if (isIgnoredConfigName(entry.name)) {
      continue;
    }

    const entryPath = path.join(dirPath, entry.name);
    const relPath = `${prefix}/${entry.name}`;
    const stats = safeStat(entryPath);
    if (stats) {
      latestMtimeMs = Math.max(latestMtimeMs, stats.mtimeMs);
    }

    if (entry.isDirectory()) {
      if (maxDepth <= 0) {
        continue;
      }

      const child = countDirectoryContents(entryPath, relPath, findings, {
        maxDepth: maxDepth - 1
      });
      if (child.count > 0) {
        count += child.count;
        latestMtimeMs = Math.max(latestMtimeMs, child.latestMtimeMs);
      }
      continue;
    }

    if (entry.isFile()) {
      count++;
      addSample(findings, relPath);
    }
  }

  return { count, latestMtimeMs };
}

function scanUserConfigs(scanPath, findings) {
  const userConfigsPath = path.join(scanPath, 'user_configs');
  const stats = safeStat(userConfigsPath);
  if (!stats || !stats.isDirectory()) {
    return 0;
  }

  let count = 0;
  let latestMtimeMs = 0;

  for (const entry of safeReadDir(userConfigsPath, { withFileTypes: true })) {
    if (isIgnoredConfigName(entry.name)) {
      continue;
    }

    const entryPath = path.join(userConfigsPath, entry.name);
    const entryStats = safeStat(entryPath);
    if (entryStats) {
      latestMtimeMs = Math.max(latestMtimeMs, entryStats.mtimeMs);
    }

    if (entry.isDirectory()) {
      const child = countDirectoryContents(entryPath, `user_configs/${entry.name}`, findings, {
        maxDepth: 2
      });
      if (child.count > 0) {
        count += child.count;
        latestMtimeMs = Math.max(latestMtimeMs, child.latestMtimeMs);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    count++;
    addSample(findings, `user_configs/${entry.name}`);

    if (entry.name.endsWith('.db')) {
      findings.counts.profileDatabases++;
    }
    if (entry.name.endsWith('_plugins_state.json')) {
      findings.counts.pluginStateFiles++;
    }
  }

  if (count > 0) {
    findings.userConfigs = true;
    findings.counts.userConfigs = count;
  }

  return latestMtimeMs;
}

function scanPluginData(scanPath, findings) {
  const pluginsPath = path.join(scanPath, 'plugins');
  const stats = safeStat(pluginsPath);
  if (!stats || !stats.isDirectory()) {
    return 0;
  }

  let count = 0;
  let latestMtimeMs = 0;

  for (const pluginDir of safeReadDir(pluginsPath, { withFileTypes: true })) {
    if (!pluginDir.isDirectory()) {
      continue;
    }

    const dataPath = path.join(pluginsPath, pluginDir.name, 'data');
    const dataStats = safeStat(dataPath);
    if (!dataStats || !dataStats.isDirectory()) {
      continue;
    }

    const child = countDirectoryContents(dataPath, `plugins/${pluginDir.name}/data`, findings, {
      maxDepth: 3
    });

    if (child.count > 0) {
      count += child.count;
      latestMtimeMs = Math.max(latestMtimeMs, child.latestMtimeMs);
    }
  }

  if (count > 0) {
    findings.plugins = true;
    findings.counts.plugins = count;
  }

  return latestMtimeMs;
}

function scanConfigDirectory(scanPath) {
  const findings = createEmptyFindings();
  let latestMtimeMs = 0;

  latestMtimeMs = Math.max(latestMtimeMs, scanUserConfigs(scanPath, findings));
  latestMtimeMs = Math.max(latestMtimeMs, scanPluginData(scanPath, findings));

  for (const section of [
    { dirName: 'user_data', key: 'userData' },
    { dirName: 'uploads', key: 'uploads' },
    { dirName: 'data', key: 'legacyData' }
  ]) {
    const dirPath = path.join(scanPath, section.dirName);
    const stats = safeStat(dirPath);
    if (!stats || !stats.isDirectory()) {
      continue;
    }

    const result = countDirectoryContents(dirPath, section.dirName, findings, { maxDepth: 3 });
    if (result.count > 0) {
      findings[section.key] = true;
      findings.counts[section.key] = result.count;
      latestMtimeMs = Math.max(latestMtimeMs, result.latestMtimeMs);
    }
  }

  const legacyDbPath = path.join(scanPath, 'database.db');
  const legacyDbStats = safeStat(legacyDbPath);
  if (legacyDbStats && legacyDbStats.isFile() && legacyDbStats.size > 0) {
    findings.legacyDatabase = true;
    findings.counts.legacyDatabase = 1;
    addSample(findings, 'database.db');
    latestMtimeMs = Math.max(latestMtimeMs, legacyDbStats.mtimeMs);
  }

  const rootPluginStatePath = path.join(scanPath, 'plugins_state.json');
  const rootPluginStateStats = safeStat(rootPluginStatePath);
  if (rootPluginStateStats && rootPluginStateStats.isFile() && rootPluginStateStats.size > 0) {
    findings.rootPluginState = true;
    findings.counts.rootPluginState = 1;
    addSample(findings, 'plugins_state.json');
    latestMtimeMs = Math.max(latestMtimeMs, rootPluginStateStats.mtimeMs);
  }

  findings.counts.total =
    findings.counts.userConfigs +
    findings.counts.userData +
    findings.counts.uploads +
    findings.counts.plugins +
    findings.counts.legacyDatabase +
    findings.counts.legacyData +
    findings.counts.rootPluginState;

  const hasConfig = findings.counts.total > 0;
  return { hasConfig, findings, latestMtimeMs };
}

function scanImportPath(importPath) {
  const resolvedPath = normalisePath(importPath);
  const stats = safeStat(resolvedPath);
  if (!stats || !stats.isDirectory()) {
    return {
      valid: false,
      error: 'Path does not exist or is not a directory',
      importPath: resolvedPath
    };
  }

  let result = scanConfigDirectory(resolvedPath);
  let actualPath = resolvedPath;
  let detectedSubdirectory = null;

  if (!result.hasConfig) {
    const appPath = path.join(resolvedPath, 'app');
    const appStats = safeStat(appPath);
    if (appStats && appStats.isDirectory()) {
      const appResult = scanConfigDirectory(appPath);
      if (appResult.hasConfig) {
        result = appResult;
        actualPath = appPath;
        detectedSubdirectory = 'app';
      }
    }
  }

  return {
    valid: result.hasConfig,
    importPath: resolvedPath,
    actualPath,
    detectedSubdirectory,
    findings: result.findings,
    latestMtimeMs: result.latestMtimeMs
  };
}

function addIfDirectory(candidates, candidatePath, label, source) {
  if (!candidatePath) {
    return;
  }

  const stats = safeStat(candidatePath);
  if (stats && stats.isDirectory()) {
    candidates.push({ path: candidatePath, label, source });
  }
}

function addChildrenIfDirectory(candidates, parentPath, labelPrefix, source) {
  const parentStats = safeStat(parentPath);
  if (!parentStats || !parentStats.isDirectory()) {
    return;
  }

  for (const entry of safeReadDir(parentPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      addIfDirectory(candidates, path.join(parentPath, entry.name), `${labelPrefix}: ${entry.name}`, source);
    }
  }
}

function getKnownSearchRoots(options = {}) {
  const env = options.env || process.env;
  const homeDir = options.homeDir || os.homedir();
  const appDir = options.appDir ? normalisePath(options.appDir) : path.resolve(__dirname, '..');
  const workspaceRoot = options.workspaceRoot || path.dirname(appDir);
  const roots = [];

  addIfDirectory(roots, appDir, 'Current application folder', 'app-directory');
  addIfDirectory(roots, workspaceRoot, 'Current workspace folder', 'workspace');
  addChildrenIfDirectory(roots, path.join(workspaceRoot, 'new_patch'), 'Patch archive', 'patch-archive');
  addChildrenIfDirectory(roots, path.join(workspaceRoot, 'released_patches'), 'Released patch archive', 'patch-archive');

  const localAppData = env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
  const roamingAppData = env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
  const documentsDir = path.join(homeDir, 'Documents');

  for (const dirName of ['pupcidslittletiktokhelper', 'com.pupcid.tiktokhelper', 'LTTH', 'ltth']) {
    addIfDirectory(roots, path.join(localAppData, dirName), `Local AppData: ${dirName}`, 'local-appdata');
  }

  for (const dirName of ['LTTH', 'ltth-electron', 'ltth-launcher', 'PupCid', 'pupcidslittletiktokhelper']) {
    addIfDirectory(roots, path.join(roamingAppData, dirName), `Roaming AppData: ${dirName}`, 'roaming-appdata');
  }

  addIfDirectory(roots, path.join(documentsDir, 'ltth configs'), 'Documents: ltth configs', 'documents');
  addChildrenIfDirectory(roots, path.join(documentsDir, 'ltth configs'), 'Documents config folder', 'documents');

  return roots;
}

function summariseFindings(findings) {
  const parts = [];
  if (findings.counts.profileDatabases > 0) {
    parts.push(`${findings.counts.profileDatabases} profile database(s)`);
  }
  if (findings.counts.pluginStateFiles > 0) {
    parts.push(`${findings.counts.pluginStateFiles} profile plugin-state file(s)`);
  }
  if (findings.counts.plugins > 0) {
    parts.push(`${findings.counts.plugins} plugin data file(s)`);
  }
  if (findings.counts.userData > 0) {
    parts.push(`${findings.counts.userData} user data file(s)`);
  }
  if (findings.counts.uploads > 0) {
    parts.push(`${findings.counts.uploads} upload file(s)`);
  }
  if (findings.legacyDatabase) {
    parts.push('legacy database.db');
  }
  if (findings.rootPluginState) {
    parts.push('root plugins_state.json');
  }

  return parts.length > 0 ? parts.join(', ') : `${findings.counts.total} file(s)`;
}

function hasProfileLikeConfig(findings) {
  return findings.counts.profileDatabases > 0 ||
    findings.counts.pluginStateFiles > 0 ||
    findings.legacyDatabase ||
    findings.rootPluginState;
}

function discoverLegacyConfigCandidates(options = {}) {
  const currentConfigDir = options.currentConfigDir
    || (options.configPathManager && typeof options.configPathManager.getConfigDir === 'function'
      ? options.configPathManager.getConfigDir()
      : null);
  const roots = Array.isArray(options.searchRoots)
    ? options.searchRoots
    : getKnownSearchRoots(options);
  const seen = new Set();
  const candidates = [];

  for (const root of roots) {
    const scan = scanImportPath(root.path);
    if (!scan.valid) {
      continue;
    }

    if (currentConfigDir && isSameOrInsidePath(scan.actualPath, currentConfigDir)) {
      continue;
    }

    if ((root.source === 'app-directory' || root.source === 'workspace') && !hasProfileLikeConfig(scan.findings)) {
      continue;
    }

    const key = lowerPath(scan.actualPath);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    candidates.push({
      label: root.label,
      source: root.source,
      importPath: scan.importPath,
      actualPath: scan.actualPath,
      detectedSubdirectory: scan.detectedSubdirectory,
      findings: scan.findings,
      fileCount: scan.findings.counts.total,
      summary: summariseFindings(scan.findings),
      latestModified: scan.latestMtimeMs ? new Date(scan.latestMtimeMs).toISOString() : null,
      recommended: scan.findings.counts.profileDatabases > 0 || scan.findings.legacyDatabase
    });
  }

  candidates.sort((a, b) => {
    if (a.recommended !== b.recommended) {
      return a.recommended ? -1 : 1;
    }
    const aTime = a.latestModified ? Date.parse(a.latestModified) : 0;
    const bTime = b.latestModified ? Date.parse(b.latestModified) : 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }
    return b.fileCount - a.fileCount;
  });

  return candidates;
}

module.exports = {
  discoverLegacyConfigCandidates,
  getKnownSearchRoots,
  scanConfigDirectory,
  scanImportPath,
  isSameOrInsidePath
};
