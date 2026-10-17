'use strict';

const { redactTail } = require('./capture-startup-diagnostics');

const LIFECYCLE_FIELDS = ['locale', 'guideId', 'id', 'pid', 'port', 'appPort', 'browserPort', 'exitCode', 'signal', 'status', 'tempProfile'];

function safeSignal(value) {
  if (value === null || value === undefined) return 'none';
  return typeof value === 'string' && /^[A-Z0-9_]{1,24}$/.test(value) ? value : 'unknown';
}

function createCaptureLifecycleReporter({ write = console.log, now = () => new Date().toISOString() } = {}) {
  return Object.freeze({
    record(event) {
      const entry = {
        timestamp: now(),
        component: event.component,
        event: event.event,
        phase: event.phase
      };
      for (const field of LIFECYCLE_FIELDS) {
        if (event[field] === undefined) {
          if (event.event === 'failure' && field === 'exitCode') entry[field] = 'unknown';
          else if (event.event === 'failure' && field === 'signal') entry[field] = 'none';
          continue;
        }
        entry[field] = field === 'signal' ? safeSignal(event[field]) : event[field];
      }
      if (event.error !== undefined) entry.error = redactTail(event.error, 1600);
      write(`[capture-lifecycle] ${JSON.stringify(entry)}`);
    }
  });
}

async function runCapturePhase(reporter, event, operation) {
  reporter?.record({ ...event, event: 'start' });
  try {
    const result = await operation();
    const resultDetails = typeof event.resultDetails === 'function' ? event.resultDetails(result) : {};
    reporter?.record({ ...event, ...resultDetails, event: 'success' });
    return result;
  } catch (error) {
    reporter?.record({
      ...event,
      event: 'failure',
      error: error?.message || String(error),
      exitCode: error?.captureExitCode,
      signal: error?.captureSignal
    });
    throw error;
  }
}

function formatFatalCaptureError(error) {
  return `[docs-capture-fatal] ${redactTail(error?.message || String(error), 2400)}`;
}

module.exports = {
  createCaptureLifecycleReporter,
  formatFatalCaptureError,
  runCapturePhase
};
