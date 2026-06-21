const path = require('path');

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function assertPluginId(pluginId) {
  const id = String(pluginId || '');

  if (!PLUGIN_ID_PATTERN.test(id)) {
    throw new Error(`Invalid plugin id: ${id || '(empty)'}`);
  }

  return id;
}

function assertPathInside(rootDir, targetPath, description = 'path') {
  const root = path.resolve(rootDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${description} resolves outside allowed directory`);
  }

  return target;
}

function resolvePluginChildPath(pluginsDir, pluginId, ...segments) {
  const safePluginId = assertPluginId(pluginId);
  return assertPathInside(
    path.join(pluginsDir, safePluginId),
    path.join(pluginsDir, safePluginId, ...segments),
    'Plugin path'
  );
}

function resolvePluginEntryPath(pluginDir, entry) {
  return assertPathInside(pluginDir, path.join(pluginDir, String(entry || '')), 'Plugin entry path');
}

module.exports = {
  PLUGIN_ID_PATTERN,
  assertPluginId,
  assertPathInside,
  resolvePluginChildPath,
  resolvePluginEntryPath
};
