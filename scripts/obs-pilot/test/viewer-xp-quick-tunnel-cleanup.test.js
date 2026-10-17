'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isOwnedServer,
  restoreClipboard,
  stopOwnedChild
} = require('../lib/quick-tunnel-cleanup');

function makeChild(onKill = () => true) {
  return {
    pid: 4312,
    exitCode: null,
    signalCode: null,
    signals: [],
    kill(signal) {
      this.signals.push(signal);
      return onKill(signal, this);
    }
  };
}

function noDelay() {
  return async () => {};
}

test('already-exited child skips health and shutdown requests', async () => {
  const child = makeChild();
  child.exitCode = 0;
  let healthCalls = 0;
  const result = await stopOwnedChild({
    child,
    origin: 'http://127.0.0.1:3000',
    requestJson: async () => { healthCalls += 1; },
    sleep: noDelay()
  });

  assert.equal(result.exitConfirmed, true);
  assert.equal(result.shutdownRequested, false);
  assert.equal(healthCalls, 0);
  assert.deepEqual(child.signals, []);
});

test('graceful shutdown is requested only after health PID ownership matches', async () => {
  const child = makeChild((_signal, current) => {
    current.exitCode = 0;
    return true;
  });
  const requests = [];
  const result = await stopOwnedChild({
    child,
    origin: 'http://127.0.0.1:3000',
    requestJson: async url => {
      requests.push(url);
      return { status: 200, json: { pid: child.pid } };
    },
    fetchImpl: async (url, options) => {
      requests.push(`${options.method} ${url}`);
      child.exitCode = 0;
      return { ok: true };
    },
    sleep: noDelay(),
    shutdownWaitMs: 1
  });

  assert.equal(result.exitConfirmed, true);
  assert.equal(result.shutdownRequested, true);
  assert.deepEqual(requests, [
    'http://127.0.0.1:3000/api/health',
    'POST http://127.0.0.1:3000/api/shutdown'
  ]);
  assert.deepEqual(child.signals, []);
});

test('wrong PID skips HTTP shutdown and falls back to TERM for the owned child', async () => {
  const child = makeChild((_signal, current) => {
    current.signalCode = 'SIGTERM';
    return true;
  });
  let shutdownCalls = 0;
  const result = await stopOwnedChild({
    child,
    origin: 'http://127.0.0.1:3000',
    requestJson: async () => ({ status: 200, json: { pid: child.pid + 1 } }),
    fetchImpl: async () => { shutdownCalls += 1; },
    sleep: noDelay(),
    shutdownWaitMs: 1,
    termWaitMs: 1
  });

  assert.equal(result.exitConfirmed, true);
  assert.equal(result.shutdownRequested, false);
  assert.equal(shutdownCalls, 0);
  assert.deepEqual(child.signals, ['SIGTERM']);
});

test('TERM timeout escalates to KILL and requires confirmed child exit', async () => {
  const child = makeChild((signal, current) => {
    if (signal === 'SIGKILL') current.signalCode = 'SIGKILL';
    return true;
  });
  const result = await stopOwnedChild({
    child,
    origin: 'http://127.0.0.1:3000',
    requestJson: async () => ({ status: 404, json: null }),
    fetchImpl: async () => assert.fail('must not shutdown a non-owned server'),
    sleep: noDelay(),
    shutdownWaitMs: 2,
    termWaitMs: 2,
    killWaitMs: 2,
    intervalMs: 1
  });

  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(result.termSent, true);
  assert.equal(result.killSent, true);
  assert.equal(result.exitConfirmed, true);
  assert.equal(result.errorCode, null);
});

test('kill failure with no exit confirmation is a cleanup failure', async () => {
  const child = makeChild(() => { throw new Error('synthetic signal failure'); });
  const result = await stopOwnedChild({
    child,
    origin: null,
    requestJson: async () => assert.fail('no origin must not request health'),
    sleep: noDelay(),
    shutdownWaitMs: 1,
    termWaitMs: 1,
    killWaitMs: 1,
    intervalMs: 1
  });

  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(result.exitConfirmed, false);
  assert.equal(result.errorCode, 'APP_CHILD_EXIT_NOT_CONFIRMED');
});

test('ownership is rechecked against the exact child PID', async () => {
  const child = makeChild();
  assert.equal(await isOwnedServer({
    child,
    origin: 'http://127.0.0.1:3000',
    requestJson: async () => ({ status: 200, json: { pid: child.pid } })
  }), true);
  assert.equal(await isOwnedServer({
    child,
    origin: 'http://127.0.0.1:3000',
    requestJson: async () => ({ status: 200, json: { pid: child.pid + 1 } })
  }), false);
});

test('clipboard restore is confirmed only after the injected restore/readback succeeds', async () => {
  const original = 'synthetic previous clipboard text';
  let restoredText = null;
  const result = await restoreClipboard({
    shouldRestore: true,
    captured: true,
    savedText: original,
    restore: async value => {
      restoredText = value;
      return restoredText === original;
    }
  });

  assert.deepEqual(result, { attempted: true, restored: true, errorCode: null });
  assert.equal(restoredText, original);
});

test('clipboard restore rejection or mismatch blocks completion', async t => {
  await t.test('rejected restore', async () => {
    const result = await restoreClipboard({
      shouldRestore: true,
      captured: true,
      savedText: 'synthetic clipboard',
      restore: async () => { throw new Error('synthetic denied'); }
    });
    assert.deepEqual(result, {
      attempted: true,
      restored: false,
      errorCode: 'CLIPBOARD_RESTORE_FAILED'
    });
  });

  await t.test('readback mismatch', async () => {
    const result = await restoreClipboard({
      shouldRestore: true,
      captured: true,
      savedText: 'synthetic clipboard',
      restore: async () => false
    });
    assert.deepEqual(result, {
      attempted: true,
      restored: false,
      errorCode: 'CLIPBOARD_RESTORE_UNCONFIRMED'
    });
  });

  await t.test('missing snapshot', async () => {
    const result = await restoreClipboard({ shouldRestore: true, captured: false });
    assert.deepEqual(result, {
      attempted: false,
      restored: false,
      errorCode: 'CLIPBOARD_SNAPSHOT_UNAVAILABLE'
    });
  });
});

test('clipboard cleanup is not requested when no copy could have changed it', async () => {
  const result = await restoreClipboard({ shouldRestore: false, captured: true, savedText: 'synthetic' });
  assert.deepEqual(result, { attempted: false, restored: null, errorCode: null });
});
