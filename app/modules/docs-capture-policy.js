'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { canonicalizePluginId } = require('./plugin-identities');

const DOCS_CAPTURE_FLAG = 'LTTH_DOCS_CAPTURE';
const DOCS_CAPTURE_ALLOWED_PLUGINS = 'LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS';
const DOCS_CAPTURE_PLUGIN_DIR = 'LTTH_DOCS_CAPTURE_PLUGIN_DIR';
const VALIDATED_CAPTURE_PROFILE_ROOT = Symbol('validatedDocumentationCaptureProfileRoot');
const WINDOWS_PROCESS_ENV_KEYS = Object.freeze([
  'HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'PATH', 'SYSTEMDRIVE',
  'USERDOMAIN', 'USERNAME', 'USERPROFILE'
]);

function getDocumentationCaptureAllowedEnvironmentKeys(platform = process.platform) {
  return new Set([
    'TEMP', 'TMP', 'LOCALAPPDATA', 'LTTH_LOG_DIR', 'LTTH_PORT', DOCS_CAPTURE_FLAG,
    DOCS_CAPTURE_ALLOWED_PLUGINS, 'LTTH_DISABLE_TIKTOK_AUTO_RECONNECT',
    'LTTH_NO_BROWSER', 'DISABLE_SWAGGER', 'LTTH_BIND_ADDRESS',
    DOCS_CAPTURE_PLUGIN_DIR,
    ...(platform === 'win32'
      ? ['SystemRoot', 'WINDIR', ...WINDOWS_PROCESS_ENV_KEYS]
      : ['TMPDIR'])
  ]);
}

function isInsideOrEqual(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath === ''
    || (relativePath !== '..'
      && !relativePath.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relativePath));
}

function isDocumentationCapture(env = process.env) {
  return env[DOCS_CAPTURE_FLAG] === 'true';
}

function shouldLoadDotenv(env = process.env) {
  return !isDocumentationCapture(env);
}

function shouldStartExternalConnectors(env = process.env) {
  return !isDocumentationCapture(env);
}

function parseAllowedPluginIds(value) {
  const raw = String(value || '').trim();
  if (!raw) return new Set();
  const ids = raw.split(',').map(id => id.trim());
  if (ids.some(id => !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))) {
    throw new Error('Documentation capture plugin allowlist is invalid');
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('Documentation capture plugin allowlist contains duplicates');
  }
  const canonicalIds = ids.map(canonicalizePluginId);
  if (canonicalIds.some((id, index) => id !== ids[index])) {
    throw new Error('Documentation capture plugin allowlist must use canonical IDs');
  }
  return new Set(canonicalIds);
}

function assertFixtureMatchesAllowlist(pluginDir, allowedPluginIds, profileDir) {
  if (!pluginDir) {
    if (allowedPluginIds.size > 0) {
      throw new Error('Documentation capture plugin fixture is required for an enabled plugin allowlist');
    }
    return;
  }

  const resolvedProfile = path.resolve(profileDir);
  const resolvedPluginDir = path.resolve(pluginDir);
  if (!isInsideOrEqual(resolvedProfile, resolvedPluginDir)) {
    throw new Error('Documentation capture plugin fixture must remain inside its isolated profile');
  }
  const stat = fs.lstatSync(resolvedPluginDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Documentation capture plugin fixture must be a real isolated directory');
  }

  const actualIds = new Set();
  for (const entry of fs.readdirSync(resolvedPluginDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(resolvedPluginDir, entry.name, 'plugin.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id)) {
      throw new Error('Documentation capture plugin fixture contains an invalid manifest ID');
    }
    if (manifest.id !== entry.name || !allowedPluginIds.has(manifest.id)) {
      throw new Error('Documentation capture plugin fixture manifest ID must match its canonical directory and allowlist ID');
    }
    actualIds.add(manifest.id);
  }

  if (actualIds.size !== allowedPluginIds.size
    || [...actualIds].some(pluginId => !allowedPluginIds.has(pluginId))) {
    throw new Error('Documentation capture plugin fixture does not match its explicit allowlist');
  }
}

function validateDocumentationCaptureEnvironment(env = process.env, options = {}) {
  if (!isDocumentationCapture(env)) return null;

  const platform = options.platform || process.platform;
  const allowedKeys = new Set([...getDocumentationCaptureAllowedEnvironmentKeys(platform)]
    .map(key => key.toLowerCase()));
  const seenKeys = new Set();
  for (const key of Object.keys(env)) {
    const normalizedKey = key.toLowerCase();
    if (seenKeys.has(normalizedKey)) {
      throw new Error('Documentation capture environment contains duplicate variable names');
    }
    seenKeys.add(normalizedKey);
  }
  if (Object.keys(env).some(key => !allowedKeys.has(key.toLowerCase()))) {
    throw new Error('Documentation capture environment contains unapproved variables');
  }
  if (platform === 'win32' && WINDOWS_PROCESS_ENV_KEYS.some(key => String(env[key] || '') !== '')) {
    throw new Error('Documentation capture Windows process variables must remain empty');
  }

  for (const key of [
    'LOCALAPPDATA', 'LTTH_LOG_DIR', 'LTTH_PORT', DOCS_CAPTURE_FLAG,
    'LTTH_DISABLE_TIKTOK_AUTO_RECONNECT',
    'LTTH_NO_BROWSER', 'DISABLE_SWAGGER', 'LTTH_BIND_ADDRESS', 'TEMP', 'TMP'
  ]) {
    if (!String(env[key] || '').trim()) {
      throw new Error('Documentation capture environment is incomplete');
    }
  }
  if (!Object.prototype.hasOwnProperty.call(env, DOCS_CAPTURE_ALLOWED_PLUGINS)
    || typeof env[DOCS_CAPTURE_ALLOWED_PLUGINS] !== 'string') {
    throw new Error('Documentation capture environment is incomplete');
  }
  if (platform !== 'win32' && !String(env.TMPDIR || '').trim()) {
    throw new Error('Documentation capture environment is incomplete');
  }
  if (env.LTTH_DOCS_CAPTURE !== 'true'
    || env.LTTH_DISABLE_TIKTOK_AUTO_RECONNECT !== 'true'
    || env.LTTH_NO_BROWSER !== 'true'
    || env.DISABLE_SWAGGER !== 'true'
    || env.LTTH_BIND_ADDRESS !== '127.0.0.1') {
    throw new Error('Documentation capture environment has unsafe flag values');
  }

  const tempRoot = path.resolve(options.tempDir || os.tmpdir());
  const profileDir = path.resolve(env.LOCALAPPDATA);
  const logsDir = path.resolve(env.LTTH_LOG_DIR);
  if (!isInsideOrEqual(tempRoot, profileDir)
    || profileDir === tempRoot
    || !isInsideOrEqual(profileDir, logsDir)
    || logsDir === profileDir) {
    throw new Error('Documentation capture paths must stay inside a nested temporary profile');
  }
  let realTempRoot;
  let realProfileDir;
  try {
    realTempRoot = fs.realpathSync(tempRoot);
    realProfileDir = fs.realpathSync(profileDir);
  } catch (_error) {
    throw new Error('Documentation capture profile must resolve inside a nested temporary profile');
  }
  if (!isInsideOrEqual(realTempRoot, realProfileDir) || realProfileDir === realTempRoot) {
    throw new Error('Documentation capture profile must resolve inside a nested temporary profile');
  }
  for (const key of ['TEMP', 'TMP', ...(platform === 'win32' ? [] : ['TMPDIR'])]) {
    const tempPath = path.resolve(env[key]);
    if (!isInsideOrEqual(tempRoot, tempPath)) {
      throw new Error('Documentation capture temporary paths must stay inside the system temp directory');
    }
  }
  if (!/^\d{1,5}$/.test(env.LTTH_PORT)
    || Number(env.LTTH_PORT) < 1
    || Number(env.LTTH_PORT) > 65535) {
    throw new Error('Documentation capture port is invalid');
  }

  const allowedPluginIds = parseAllowedPluginIds(env[DOCS_CAPTURE_ALLOWED_PLUGINS]);
  assertFixtureMatchesAllowlist(env[DOCS_CAPTURE_PLUGIN_DIR], allowedPluginIds, profileDir);
  Object.defineProperty(allowedPluginIds, VALIDATED_CAPTURE_PROFILE_ROOT, {
    value: realProfileDir,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return allowedPluginIds;
}

function getValidatedDocumentationCaptureProfileRoot(allowedPluginIds) {
  const profileRoot = allowedPluginIds?.[VALIDATED_CAPTURE_PROFILE_ROOT];
  if (typeof profileRoot !== 'string' || !path.isAbsolute(profileRoot)) {
    throw new Error('Documentation capture profile root must come from validated capture policy');
  }
  return profileRoot;
}

module.exports = {
  DOCS_CAPTURE_ALLOWED_PLUGINS,
  DOCS_CAPTURE_PLUGIN_DIR,
  assertFixtureMatchesAllowlist,
  getDocumentationCaptureAllowedEnvironmentKeys,
  getValidatedDocumentationCaptureProfileRoot,
  isDocumentationCapture,
  parseAllowedPluginIds,
  shouldLoadDotenv,
  shouldStartExternalConnectors,
  validateDocumentationCaptureEnvironment
};
