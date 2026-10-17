'use strict';

async function unloadPluginsForShutdown({
  pluginLoader,
  timeoutMs,
  logger = console,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
} = {}) {
  if (!pluginLoader || !(pluginLoader.plugins instanceof Map) ||
      typeof pluginLoader.unloadPlugin !== 'function') {
    throw new TypeError('A plugin loader is required');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError('timeoutMs must be a positive safe integer');
  }

  const pluginIds = [...pluginLoader.plugins.keys()].reverse();
  let timedOut = false;
  let timeoutHandle;
  const timeout = new Promise(resolve => {
    timeoutHandle = setTimeoutImpl(() => {
      timedOut = true;
      resolve(false);
    }, timeoutMs);
    timeoutHandle?.unref?.();
  });
  const unloadAll = (async () => {
    for (const pluginId of pluginIds) {
      try {
        const unloaded = await pluginLoader.unloadPlugin(
          pluginId,
          { reason: 'application-shutdown' }
        );
        if (timedOut) return false;
        if (unloaded !== true) {
          logger.warn?.(`Plugin ${pluginId} shutdown did not complete.`);
          return false;
        }
      } catch (error) {
        logger.warn?.(`Plugin ${pluginId} shutdown failed: ${error.message}`);
        return false;
      }
    }
    return true;
  })();

  try {
    const result = await Promise.race([unloadAll, timeout]);
    return { success: !timedOut && result === true, timedOut };
  } finally {
    clearTimeoutImpl(timeoutHandle);
  }
}

module.exports = { unloadPluginsForShutdown };
