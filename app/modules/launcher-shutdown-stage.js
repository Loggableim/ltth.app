'use strict';

async function runBoundedShutdownStage(operation, {
  timeoutMs,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
} = {}) {
  if (typeof operation !== 'function') {
    throw new TypeError('A shutdown operation is required');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError('timeoutMs must be a positive safe integer');
  }

  let timeoutHandle;
  const timeout = new Promise(resolve => {
    timeoutHandle = setTimeoutImpl(() => resolve({ timedOut: true }), timeoutMs);
    timeoutHandle?.unref?.();
  });

  try {
    return await Promise.race([
      Promise.resolve()
        .then(operation)
        .then(() => ({ timedOut: false, error: null }), error => ({ timedOut: false, error })),
      timeout
    ]);
  } finally {
    clearTimeoutImpl(timeoutHandle);
  }
}

module.exports = { runBoundedShutdownStage };
