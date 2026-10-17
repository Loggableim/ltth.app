'use strict';

const { unloadPluginsForShutdown } = require('./plugin-shutdown');

function createServerRestartCoordinator({
  stableLifecycle,
  pluginLoader,
  io,
  db,
  server,
  onRestartAborted,
  logger = console,
  processExit = code => process.exit(code),
  timers = {
    setTimeout,
    clearTimeout
  },
  delayMs = 250,
  stableShutdownTimeoutMs = 2000,
  pluginShutdownTimeoutMs = 1500,
  databaseFlushTimeoutMs = 2000,
  forceExitTimeoutMs = 3000
} = {}) {
  if (!stableLifecycle ||
      typeof stableLifecycle.shutdown !== 'function') {
    throw new TypeError('A stable routing lifecycle is required');
  }
  if (!io ||
      typeof io.emit !== 'function' ||
      typeof io.disconnectSockets !== 'function') {
    throw new TypeError('A Socket.IO server is required');
  }
  if (!db ||
      typeof db.flushEventBatch !== 'function' ||
      typeof db.close !== 'function') {
    throw new TypeError('A database is required');
  }
  if (!server || typeof server.close !== 'function') {
    throw new TypeError('An HTTP server is required');
  }
  if (!pluginLoader || !(pluginLoader.plugins instanceof Map) ||
      typeof pluginLoader.unloadPlugin !== 'function') {
    throw new TypeError('A plugin loader is required');
  }
  if (typeof processExit !== 'function') {
    throw new TypeError('A process exit function is required');
  }
  if (onRestartAborted !== undefined && typeof onRestartAborted !== 'function') {
    throw new TypeError('onRestartAborted must be a function');
  }
  if (!timers ||
      typeof timers.setTimeout !== 'function' ||
      typeof timers.clearTimeout !== 'function') {
    throw new TypeError('Timer functions are required');
  }
  for (const [name, value] of [
    ['delayMs', delayMs],
    ['stableShutdownTimeoutMs', stableShutdownTimeoutMs],
    ['pluginShutdownTimeoutMs', pluginShutdownTimeoutMs],
    ['databaseFlushTimeoutMs', databaseFlushTimeoutMs],
    ['forceExitTimeoutMs', forceExitTimeoutMs]
  ]) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
  }
  if (forceExitTimeoutMs <= databaseFlushTimeoutMs) {
    throw new TypeError('forceExitTimeoutMs must exceed databaseFlushTimeoutMs');
  }

  let scheduled = false;

  function unref(handle) {
    if (handle && typeof handle.unref === 'function') {
      handle.unref();
    }
  }

  function debugFailure(label, error) {
    logger.debug?.(`${label} skipped: ${error.message}`);
  }

  async function boundedStableShutdown() {
    let timeoutHandle;
    const timeout = new Promise(resolve => {
      timeoutHandle = timers.setTimeout(() => {
        logger.warn?.(
          'Stable overlay routing shutdown timed out during restart.'
        );
        resolve();
      }, stableShutdownTimeoutMs);
      unref(timeoutHandle);
    });
    try {
      await Promise.race([
        Promise.resolve()
          .then(() => stableLifecycle.shutdown())
          .catch(error => {
            logger.warn?.(
              `Stable overlay routing shutdown failed during restart: ${error.message}`
            );
          }),
        timeout
      ]);
    } finally {
      timers.clearTimeout(timeoutHandle);
    }
  }

  function abortRestart(reason, stage, error, forceTimer) {
    if (forceTimer) timers.clearTimeout(forceTimer);
    if (['plugin cleanup', 'database-event-flush', 'database-close'].includes(stage)) scheduled = false;
    const errorName = typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name)
      ? error.name
      : 'Error';
    const errorCode = typeof error?.code === 'string' && /^[A-Z0-9_-]{1,40}$/.test(error.code)
      ? error.code
      : null;
    const message = `Server restart aborted because ${stage} failed; HTTP server remains open.`;
    logger.error?.(message);
    try {
      onRestartAborted?.({
        reason,
        message,
        stage,
        error: { name: errorName, code: errorCode }
      });
    } catch (notifyError) {
      logger.warn?.('Restart abort notification failed.');
    }
  }

  async function restart(reason) {
    logger.info?.(`Server restart starting (${reason})`);
    await boundedStableShutdown();

    const pluginShutdown = await unloadPluginsForShutdown({
      pluginLoader,
      timeoutMs: pluginShutdownTimeoutMs,
      logger,
      setTimeoutImpl: timers.setTimeout,
      clearTimeoutImpl: timers.clearTimeout
    });
    if (!pluginShutdown.success) {
      abortRestart(reason, 'plugin cleanup', new Error('cleanup failed'));
      return;
    }

    const forceTimer = timers.setTimeout(() => {
      logger.warn?.('Force exiting with restart code 75.');
      processExit(75);
    }, forceExitTimeoutMs);
    unref(forceTimer);

    try {
      let timeoutHandle;
      const timeout = new Promise((_, reject) => {
        timeoutHandle = timers.setTimeout(() => {
          const error = new Error('database event flush timed out');
          error.code = 'DATABASE_FLUSH_TIMEOUT';
          reject(error);
        }, databaseFlushTimeoutMs);
        unref(timeoutHandle);
      });
      try {
        await Promise.race([
          Promise.resolve().then(() => db.flushEventBatch()),
          timeout
        ]);
      } finally {
        timers.clearTimeout(timeoutHandle);
      }
    } catch (error) {
      abortRestart(reason, 'database-event-flush', error, forceTimer);
      return;
    }
    try {
      io.emit('server:restarting', { reason });
    } catch (error) {
      debugFailure('server:restarting emit', error);
    }
    try {
      io.disconnectSockets(true);
    } catch (error) {
      debugFailure('socket disconnect', error);
    }
    try {
      db.close();
    } catch (error) {
      abortRestart(reason, 'database-close', error, forceTimer);
      return;
    }

    try {
      server.close(error => {
        timers.clearTimeout(forceTimer);
        if (error) {
          logger.error?.(`HTTP server close failed during restart: ${error.message}`);
          processExit(1);
          return;
        }
        logger.info?.('Exiting with restart code 75.');
        processExit(75);
      });
    } catch (error) {
      logger.error?.(`HTTP server close failed during restart: ${error.message}`);
      timers.clearTimeout(forceTimer);
      processExit(1);
    }
  }

  return Object.freeze({
    isScheduled() {
      return scheduled;
    },
    schedule(reason = 'api request') {
      if (scheduled) {
        logger.warn?.(
          `Server restart already scheduled, ignoring duplicate request (${reason})`
        );
        return false;
      }
      scheduled = true;
      logger.info?.(`Server restart scheduled (${reason})`);
      const delayTimer = timers.setTimeout(() => restart(reason), delayMs);
      unref(delayTimer);
      return true;
    }
  });
}

module.exports = {
  createServerRestartCoordinator
};
