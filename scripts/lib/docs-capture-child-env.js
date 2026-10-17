'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseDocsCapturePluginIds } = require('./docs-capture-plugin-fixture');

const WINDOWS_PROCESS_ENV_KEYS = Object.freeze([
  'HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'PATH', 'SYSTEMDRIVE',
  'USERDOMAIN', 'USERNAME', 'USERPROFILE'
]);

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath !== ''
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath);
}

function validatePluginFixture(pluginDir, allowedIds) {
  if (!allowedIds.length && !pluginDir) return;
  if (!pluginDir) throw new Error('Allowed documentation capture plugins require a local fixture directory');

  const entries = fs.readdirSync(pluginDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  const expected = [...allowedIds].sort();
  if (JSON.stringify(entries) !== JSON.stringify(expected)) {
    throw new Error('Documentation capture plugin fixture does not match its explicit allowlist');
  }
  for (const pluginId of allowedIds) {
    const manifestPath = path.join(pluginDir, pluginId, 'plugin.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.id !== pluginId || manifest.enabled !== true) {
      throw new Error(`Documentation capture plugin fixture is invalid: ${pluginId}`);
    }
  }
}

function createDocsCaptureChildEnvironment({
  profileDir,
  port,
  allowedPluginIds,
  pluginDir = null,
  inheritedEnv = process.env,
  tempDir = os.tmpdir(),
  platform = process.platform
}) {
  const profileRoot = path.resolve(profileDir || '');
  const systemTemp = path.resolve(tempDir);
  if (!profileDir || !isPathInside(systemTemp, profileRoot)) {
    throw new Error('Documentation capture profile must be a unique child of the system temp directory');
  }
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Documentation capture requires a valid local port');
  }

  const allowedIds = parseDocsCapturePluginIds(allowedPluginIds);
  const resolvedPluginDir = pluginDir ? path.resolve(pluginDir) : null;
  if (resolvedPluginDir && !isPathInside(profileRoot, resolvedPluginDir)) {
    throw new Error('Documentation capture plugin fixture must remain inside its isolated profile');
  }
  validatePluginFixture(resolvedPluginDir, allowedIds);

  // Keep only the minimum Windows process variables required to start the
  // bundled runtime. Do not inherit PATH, NODE_OPTIONS, proxy variables,
  // application credentials, or other caller-controlled environment values.
  const env = {};
  if (platform === 'win32') {
    const systemRoot = inheritedEnv.SystemRoot || inheritedEnv.SYSTEMROOT;
    if (!systemRoot) throw new Error('Documentation capture requires the Windows SystemRoot variable');
    env.SystemRoot = systemRoot;
    env.WINDIR = inheritedEnv.WINDIR || systemRoot;
    // Windows may repopulate these caller values for a child even when they
    // are omitted from a custom environment block. Pass empty sentinels so no
    // home, account, or executable-search paths cross the process boundary.
    for (const key of WINDOWS_PROCESS_ENV_KEYS) env[key] = '';
  } else {
    env.TMPDIR = systemTemp;
  }
  env.TEMP = systemTemp;
  env.TMP = systemTemp;
  env.LOCALAPPDATA = profileRoot;
  env.LTTH_LOG_DIR = path.join(profileRoot, 'logs');
  env.LTTH_PORT = String(Number(port));
  env.LTTH_DOCS_CAPTURE = 'true';
  env.LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS = allowedIds.join(',');
  env.LTTH_DISABLE_TIKTOK_AUTO_RECONNECT = 'true';
  env.LTTH_NO_BROWSER = 'true';
  env.DISABLE_SWAGGER = 'true';
  env.LTTH_BIND_ADDRESS = '127.0.0.1';
  if (resolvedPluginDir) env.LTTH_DOCS_CAPTURE_PLUGIN_DIR = resolvedPluginDir;
  return env;
}

module.exports = { createDocsCaptureChildEnvironment, isPathInside };
