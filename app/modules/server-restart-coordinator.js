'use strict';

function createServerRestartCoordinator({
  stableLifecycle,
  io,
  db,
  server,
  logger = console,
  processExit = code => process.exit(code),
  timers = {
    setTimeout,
    clearTimeout
  },
  delayMs = 250,
  stableShutdownTimeoutMs = 2000,
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
  if (typeof processExit !== 'function') {
    throw new TypeError('A process exit function is required');
  }
  if (!timers ||
      typeof timers.setTimeout !== 'function' ||
      typeof timers.clearTimeout !== 'function') {
    throw new TypeError('Timer functions are required');
  }
  for (const [name, value] of [
    ['delayMs', delayMs],
    ['stableShutdownTimeoutMs', stableShutdownTimeoutMs],
    ['forceExitTimeoutMs', forceExitTimeoutMs]
  ]) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
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

  async function restart(reason) {
    logger.info?.(`Server restart starting (${reason})`);
    const forceTimer = timers.setTimeout(() => {
      logger.warn?.('Force exiting with restart code 75.');
      processExit(75);
    }, forceExitTimeoutMs);
    unref(forceTimer);

    await boundedStableShutdown();

    try {
      db.flushEventBatch();
    } catch (error) {
      debugFailure('flushEventBatch', error);
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
      debugFailure('db.close', error);
    }

    try {
      server.close(() => {
        timers.clearTimeout(forceTimer);
        logger.info?.('Exiting with restart code 75.');
        processExit(75);
      });
    } catch (error) {
      debugFailure('server.close', error);
      timers.clearTimeout(forceTimer);
      processExit(75);
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
