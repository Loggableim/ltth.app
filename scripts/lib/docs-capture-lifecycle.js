'use strict';

const CAPTURE_TIMEOUT_CODE = 'LTTH_DOCS_CAPTURE_TIMEOUT';

function captureTimeoutError(label, timeoutMs) {
  const error = new Error(`Timed out after ${timeoutMs}ms while ${label}`);
  error.code = CAPTURE_TIMEOUT_CODE;
  return error;
}

function runWithTimeout(operation, { label, timeoutMs }) {
  let timeout;
  const task = typeof operation === 'function'
    ? Promise.resolve().then(operation)
    : Promise.resolve(operation);
  return Promise.race([
    task,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(captureTimeoutError(label, timeoutMs)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timeout));
}

function isCaptureTimeout(error) {
  return error?.code === CAPTURE_TIMEOUT_CODE;
}

async function captureFailureContext(readContext, { label, timeoutMs }) {
  try {
    const context = await runWithTimeout(readContext, {
      label: `reading failure context for ${label}`,
      timeoutMs
    });
    return Array.isArray(context) ? context : [];
  } catch (_) {
    return [];
  }
}

function closeCapturePage(closePage, { label, timeoutMs }) {
  return runWithTimeout(closePage, {
    label: `closing capture page for ${label}`,
    timeoutMs
  });
}

async function recoverCapturePage({ closePage, createPage, label, timeoutMs }) {
  await closeCapturePage(closePage, { label, timeoutMs });
  return runWithTimeout(createPage, {
    label: `creating replacement capture page for ${label}`,
    timeoutMs
  });
}

function browserProcess(browser) {
  if (!browser) return null;
  return typeof browser.process === 'function' ? browser.process() : browser.process;
}

async function closeCaptureBrowser(browser, { label, timeoutMs }) {
  try {
    await runWithTimeout(() => browser.close(), {
      label: `closing capture browser for ${label}`,
      timeoutMs
    });
  } catch (error) {
    const process = browserProcess(browser);
    if (process && process.exitCode === null && typeof process.kill === 'function') {
      try { process.kill('SIGKILL'); } catch (_) { /* The timeout remains the reportable failure. */ }
    }
    throw error;
  }
}

function childHasExited(child) {
  return !child || (child.exitCode !== null && child.exitCode !== undefined);
}

function requestChildExit(child, signal, timeoutMs) {
  if (childHasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.removeListener('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timeout = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
    try {
      child.kill(signal);
    } catch (_) {
      finish(false);
    }
  });
}

async function stopCaptureAppChild(child, { label, timeoutMs }) {
  if (childHasExited(child)) return;
  if (await requestChildExit(child, 'SIGTERM', timeoutMs)) return;
  if (await requestChildExit(child, 'SIGKILL', timeoutMs)) return;
  throw new Error(`Isolated capture app did not exit after forced shutdown for ${label}`);
}

module.exports = {
  captureFailureContext,
  closeCaptureBrowser,
  closeCapturePage,
  isCaptureTimeout,
  recoverCapturePage,
  runWithTimeout,
  stopCaptureAppChild
};
