'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { unloadPluginsForShutdown } = require('../modules/plugin-shutdown');
const { runBoundedShutdownStage } = require('../modules/launcher-shutdown-stage');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function flushPromises() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function createShutdownHarness() {
  const start = serverSource.indexOf('let _isShuttingDown = false;');
  const end = serverSource.indexOf("process.on('SIGINT'", start);
  if (start < 0 || end < 0) throw new Error('Could not locate gracefulShutdown source');

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  const processStub = { exitCode: 0, exit: jest.fn() };
  const calls = [];
  const stableOverlayRoutingLifecycle = {
    shutdown: jest.fn(async () => calls.push('overlay-shutdown'))
  };
  const pluginLoader = {
    plugins: new Map([['pending-cleanup-plugin', {}]]),
    unloadPlugin: jest.fn()
  };
  const tiktok = {
    isActive: jest.fn(() => true),
    disconnect: jest.fn(() => calls.push('tiktok-disconnect'))
  };
  const obs = {
    isConnected: jest.fn(() => true),
    disconnect: jest.fn(async () => calls.push('obs-disconnect'))
  };
  const cloudSync = { shutdown: jest.fn(async () => calls.push('cloud-sync-shutdown')) };
  const io = { disconnectSockets: jest.fn(() => calls.push('socket-disconnect')) };
  const db = {
    _flushEventBatchSync: jest.fn(),
    close: jest.fn(() => calls.push('database-close'))
  };
  const server = new EventEmitter();
  server.close = jest.fn(callback => {
    calls.push('http-close');
    callback?.();
  });

  const { gracefulShutdown } = vm.runInNewContext(
    `${serverSource.slice(start, end)}\n({ gracefulShutdown });`,
    {
      logger,
      process: processStub,
      setTimeout,
      clearTimeout,
      stableOverlayRoutingLifecycle,
      runBoundedShutdownStage,
      unloadPluginsForShutdown,
      pluginLoader,
      tiktok,
      obs,
      cloudSync,
      io,
      db,
      server
    }
  );

  return {
    gracefulShutdown,
    logger,
    processStub,
    calls,
    stableOverlayRoutingLifecycle,
    pluginLoader,
    tiktok,
    obs,
    cloudSync,
    io,
    db,
    server
  };
}

describe('SIGINT/SIGTERM plugin shutdown gate', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('keeps DB/HTTP open on pending plugin cleanup and allows a later retry', async () => {
    jest.useFakeTimers();
    const harness = createShutdownHarness();
    const slowOverlayCleanup = deferred();
    const pendingCleanup = deferred();
    harness.stableOverlayRoutingLifecycle.shutdown.mockImplementationOnce(() => {
      harness.calls.push('overlay-shutdown');
      return slowOverlayCleanup.promise;
    });
    harness.pluginLoader.unloadPlugin
      .mockImplementationOnce(() => pendingCleanup.promise)
      .mockResolvedValueOnce(true);

    const firstAttempt = harness.gracefulShutdown('SIGTERM');
    await jest.advanceTimersByTimeAsync(3000);
    slowOverlayCleanup.resolve();
    await flushPromises();
    await jest.advanceTimersByTimeAsync(4500);
    await firstAttempt;

    expect(harness.pluginLoader.unloadPlugin).toHaveBeenCalledTimes(1);
    expect(harness.db.close).not.toHaveBeenCalled();
    expect(harness.io.disconnectSockets).not.toHaveBeenCalled();
    expect(harness.server.close).not.toHaveBeenCalled();
    expect(harness.processStub.exit).not.toHaveBeenCalled();
    expect(harness.db._flushEventBatchSync).not.toHaveBeenCalled();
    expect(harness.processStub.exitCode).toBe(1);
    expect(harness.gracefulShutdown.activeAttempt).toBeNull();
    expect(harness.calls).toEqual(['overlay-shutdown']);

    // Let the timed-out in-flight destroy settle before modeling the explicit retry.
    pendingCleanup.resolve(false);
    await flushPromises();

    await harness.gracefulShutdown('SIGTERM');

    expect(harness.pluginLoader.unloadPlugin).toHaveBeenCalledTimes(2);
    expect(harness.db.close).toHaveBeenCalledTimes(1);
    expect(harness.server.close).toHaveBeenCalledTimes(1);
    expect(harness.processStub.exit).toHaveBeenCalledWith(0);
    expect(harness.calls).toEqual([
      'overlay-shutdown',
      'overlay-shutdown',
      'tiktok-disconnect',
      'obs-disconnect',
      'cloud-sync-shutdown',
      'socket-disconnect',
      'database-close',
      'http-close'
    ]);
  });

  test('reports HTTP close callback errors as failed process shutdown', async () => {
    const harness = createShutdownHarness();
    harness.pluginLoader.unloadPlugin.mockResolvedValue(true);
    harness.server.close.mockImplementation(callback => callback(new Error('synthetic HTTP close failure')));

    await harness.gracefulShutdown('SIGINT');

    expect(harness.db.close).toHaveBeenCalledTimes(1);
    expect(harness.server.close).toHaveBeenCalledTimes(1);
    expect(harness.processStub.exit).toHaveBeenCalledWith(1);
    expect(harness.processStub.exit).not.toHaveBeenCalledWith(0);
    expect(harness.processStub.exitCode).toBe(1);
    expect(harness.logger.error).toHaveBeenCalledWith(
      'HTTP server close failed during shutdown: synthetic HTTP close failure'
    );
  });

  test('reports synchronous HTTP close throws as failed process shutdown', async () => {
    const harness = createShutdownHarness();
    harness.pluginLoader.unloadPlugin.mockResolvedValue(true);
    harness.server.close.mockImplementation(() => {
      throw new Error('synthetic synchronous HTTP close failure');
    });

    await expect(harness.gracefulShutdown('SIGTERM')).resolves.toBeUndefined();

    expect(harness.processStub.exit).toHaveBeenCalledWith(1);
    expect(harness.processStub.exit).not.toHaveBeenCalledWith(0);
    expect(harness.logger.error).toHaveBeenCalledWith(
      'HTTP server close failed during shutdown: synthetic synchronous HTTP close failure'
    );
  });
});
