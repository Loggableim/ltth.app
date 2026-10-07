'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath !== ''
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath);
}

function getAppRoot() {
  return path.resolve(__dirname, '..');
}

function getProjectRoot() {
  return path.resolve(getAppRoot(), '..');
}

function getRootLogsDir() {
  return process.env.LTTH_LOG_DIR
    ? path.resolve(process.env.LTTH_LOG_DIR)
    : path.join(getProjectRoot(), 'logs');
}

function getLegacyLogsDir() {
  return path.join(getAppRoot(), 'logs');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function timestampForArchive(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('-');
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function uniqueDestination(destination) {
  if (!fs.existsSync(destination)) {
    return destination;
  }

  const parsed = path.parse(destination);
  for (let index = 1; index < 1000; index++) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not find free archive filename for ${destination}`);
}

function moveFile(source, destination) {
  try {
    fs.renameSync(source, destination);
  } catch (error) {
    if (error.code !== 'EXDEV') {
      throw error;
    }
    fs.copyFileSync(source, destination);
    fs.unlinkSync(source);
  }
}

function archiveLogFiles(sourceDir, archiveBaseDir, sourceLabel, skipPaths = []) {
  const result = {
    archived: [],
    errors: []
  };

  if (!sourceDir || !fs.existsSync(sourceDir)) {
    return result;
  }

  const normalizedSkipPaths = new Set(
    skipPaths
      .filter(Boolean)
      .map(skipPath => path.resolve(skipPath).toLowerCase())
  );

  let entries;
  try {
    entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  } catch (error) {
    result.errors.push({ sourceDir, error: error.message });
    return result;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    if (normalizedSkipPaths.has(path.resolve(sourcePath).toLowerCase())) {
      continue;
    }

    try {
      const destinationDir = path.join(archiveBaseDir, sourceLabel);
      ensureDir(destinationDir);
      const destinationPath = uniqueDestination(path.join(destinationDir, entry.name));
      moveFile(sourcePath, destinationPath);
      result.archived.push({ source: sourcePath, destination: destinationPath });
    } catch (error) {
      result.errors.push({ source: sourcePath, error: error.message });
    }
  }

  return result;
}

function archiveStartupLogs(options = {}) {
  const env = options.env || process.env;
  const docsCaptureMode = env.LTTH_DOCS_CAPTURE === 'true';
  const isTest = env.NODE_ENV === 'test' || Boolean(env.JEST_WORKER_ID);
  const rootLogsDir = options.rootLogsDir || (env.LTTH_LOG_DIR
    ? path.resolve(env.LTTH_LOG_DIR)
    : getRootLogsDir());
  const legacyLogsDir = options.legacyLogsDir || getLegacyLogsDir();
  const archiveBaseDir = options.archiveBaseDir || path.join(rootLogsDir, 'archive', timestampForArchive());
  const skipPaths = [
    ...(options.skipPaths || []),
    env.LTTH_CURRENT_LAUNCHER_LOG
  ].filter(Boolean);

  if (docsCaptureMode) {
    const profileRoot = String(env.LOCALAPPDATA || '').trim();
    if (!profileRoot || !isPathInside(os.tmpdir(), profileRoot)) {
      throw new Error('Documentation capture requires LOCALAPPDATA inside the system temp directory');
    }
    if (!env.LTTH_LOG_DIR || !isPathInside(profileRoot, rootLogsDir)) {
      throw new Error('Documentation capture requires LTTH_LOG_DIR inside its isolated profile');
    }
  }

  const archiveRootLogs = !docsCaptureMode && (options.archiveRootLogs !== undefined
    ? options.archiveRootLogs
    : !isTest && env.LTTH_LOG_ARCHIVE_DONE !== 'true');
  const archiveLegacyLogs = !docsCaptureMode && (options.archiveLegacyLogs !== undefined
    ? options.archiveLegacyLogs
    : !isTest);

  ensureDir(rootLogsDir);

  const result = {
    archiveBaseDir,
    archived: [],
    errors: []
  };

  if (archiveRootLogs) {
    const rootResult = archiveLogFiles(rootLogsDir, archiveBaseDir, 'root', skipPaths);
    result.archived.push(...rootResult.archived);
    result.errors.push(...rootResult.errors);
  }

  if (archiveLegacyLogs && !samePath(rootLogsDir, legacyLogsDir)) {
    const legacyResult = archiveLogFiles(legacyLogsDir, archiveBaseDir, 'app-legacy', skipPaths);
    result.archived.push(...legacyResult.archived);
    result.errors.push(...legacyResult.errors);
  }

  return result;
}

module.exports = {
  archiveLogFiles,
  archiveStartupLogs,
  getAppRoot,
  getLegacyLogsDir,
  getProjectRoot,
  getRootLogsDir,
  timestampForArchive
};
