'use strict';

function hasExited(child) {
  return !child ||
    (child.exitCode !== null && child.exitCode !== undefined) ||
    (child.signalCode !== null && child.signalCode !== undefined);
}

async function waitForExit(child, timeoutMs, { sleep, intervalMs }) {
  if (hasExited(child)) return true;
  let elapsed = 0;
  while (elapsed < timeoutMs) {
    const delay = Math.min(intervalMs, timeoutMs - elapsed);
    await sleep(delay);
    elapsed += delay;
    if (hasExited(child)) return true;
  }
  return hasExited(child);
}

async function isOwnedServer({ child, origin, requestJson }) {
  if (!child || hasExited(child) || !origin || typeof requestJson !== 'function') return false;
  try {
    const health = await requestJson(`${origin}/api/health`, { timeout: 2000 });
    return health.status === 200 && health.json?.pid === child.pid;
  } catch (_) {
    return false;
  }
}

async function stopOwnedChild({
  child,
  origin,
  requestJson,
  fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  shutdownWaitMs = 10_000,
  termWaitMs = 6_000,
  killWaitMs = 5_000,
  intervalMs = 250
} = {}) {
  if (!child || hasExited(child)) {
    return { exitConfirmed: true, shutdownRequested: false, termSent: false, killSent: false, errorCode: null };
  }

  let shutdownRequested = false;
  if (await isOwnedServer({ child, origin, requestJson })) {
    try {
      await fetchImpl(`${origin}/api/shutdown`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000)
      });
      shutdownRequested = true;
    } catch (_) {}
  }

  try {
    if (await waitForExit(child, shutdownWaitMs, { sleep, intervalMs })) {
      return { exitConfirmed: true, shutdownRequested, termSent: false, killSent: false, errorCode: null };
    }
  } catch (_) {
    return { exitConfirmed: hasExited(child), shutdownRequested, termSent: false, killSent: false, errorCode: 'APP_CHILD_EXIT_WAIT_FAILED' };
  }

  let termSent = false;
  try {
    termSent = child.kill('SIGTERM') !== false;
  } catch (_) {}
  try {
    if (await waitForExit(child, termWaitMs, { sleep, intervalMs })) {
      return { exitConfirmed: true, shutdownRequested, termSent, killSent: false, errorCode: null };
    }
  } catch (_) {
    return { exitConfirmed: hasExited(child), shutdownRequested, termSent, killSent: false, errorCode: 'APP_CHILD_EXIT_WAIT_FAILED' };
  }

  let killSent = false;
  try {
    killSent = child.kill('SIGKILL') !== false;
  } catch (_) {}
  try {
    const exitConfirmed = await waitForExit(child, killWaitMs, { sleep, intervalMs });
    return {
      exitConfirmed,
      shutdownRequested,
      termSent,
      killSent,
      errorCode: exitConfirmed ? null : 'APP_CHILD_EXIT_NOT_CONFIRMED'
    };
  } catch (_) {
    return { exitConfirmed: hasExited(child), shutdownRequested, termSent, killSent, errorCode: 'APP_CHILD_EXIT_WAIT_FAILED' };
  }
}

async function restoreClipboard({ shouldRestore, captured, savedText, restore } = {}) {
  if (!shouldRestore) {
    return { attempted: false, restored: null, errorCode: null };
  }
  if (!captured || typeof restore !== 'function') {
    return { attempted: false, restored: false, errorCode: 'CLIPBOARD_SNAPSHOT_UNAVAILABLE' };
  }
  try {
    const restored = await restore(savedText);
    return restored === true
      ? { attempted: true, restored: true, errorCode: null }
      : { attempted: true, restored: false, errorCode: 'CLIPBOARD_RESTORE_UNCONFIRMED' };
  } catch (_) {
    return { attempted: true, restored: false, errorCode: 'CLIPBOARD_RESTORE_FAILED' };
  }
}

module.exports = { hasExited, isOwnedServer, restoreClipboard, stopOwnedChild };
