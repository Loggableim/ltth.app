'use strict';

const EventEmitter = require('events');
const Launcher = require('../modules/launcher');

function createSignalHarness() {
  const processRef = new EventEmitter();
  const serverProcess = new EventEmitter();
  serverProcess.exitCode = null;
  serverProcess.kill = jest.fn();
  const logger = {
    newLine: jest.fn(),
    separator: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  };
  const processExit = jest.fn();
  const restartServer = jest.fn();
  serverProcess.on('exit', (code) => {
    if (code === 75) restartServer();
    else processExit(code || 0);
  });

  Launcher.registerServerShutdownSignals({
    processRef,
    serverProcess,
    logger
  });

  return { logger, processExit, processRef, restartServer, serverProcess };
}

describe('launcher server shutdown signal forwarding', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test.each(['SIGINT', 'SIGTERM'])(
    'keeps the supervisor alive and forwards a later %s retry while the child remains active',
    async (signal) => {
      jest.useFakeTimers();
      const harness = createSignalHarness();

      harness.processRef.emit(signal);
      expect(harness.serverProcess.kill).toHaveBeenCalledWith(signal);
      harness.processRef.emit(signal === 'SIGINT' ? 'SIGTERM' : 'SIGINT');
      harness.processRef.emit(signal);
      expect(harness.serverProcess.kill).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(6000);
      expect(harness.processExit).not.toHaveBeenCalled();
      expect(harness.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Cleanup-Retry aktiv'));

      harness.processRef.emit(signal);
      expect(harness.serverProcess.kill).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(6000);
      expect(harness.processExit).not.toHaveBeenCalled();

      harness.serverProcess.exitCode = 0;
      harness.serverProcess.emit('exit', 0);
      expect(harness.processExit).toHaveBeenCalledTimes(1);
      expect(harness.processExit).toHaveBeenCalledWith(0);
      expect(harness.processRef.listenerCount('SIGINT')).toBe(0);
      expect(harness.processRef.listenerCount('SIGTERM')).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  test.each(['SIGINT', 'SIGTERM'])(
    'exits normally when the child handles %s before the fallback',
    (signal) => {
      jest.useFakeTimers();
      const harness = createSignalHarness();

      harness.processRef.emit(signal);
      harness.serverProcess.exitCode = 0;
      harness.serverProcess.emit('exit', 0);

      expect(harness.processExit).toHaveBeenCalledTimes(1);
      expect(harness.processExit).toHaveBeenCalledWith(0);
      expect(harness.logger.warn).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  test.each(['SIGINT', 'SIGTERM'])(
    'leaves exit code 75 to the existing restart handler after %s',
    (signal) => {
      jest.useFakeTimers();
      const harness = createSignalHarness();

      harness.processRef.emit(signal);
      harness.serverProcess.exitCode = 75;
      harness.serverProcess.emit('exit', 75);

      expect(harness.restartServer).toHaveBeenCalledTimes(1);
      expect(harness.processExit).not.toHaveBeenCalled();
      expect(harness.processRef.listenerCount('SIGINT')).toBe(0);
      expect(harness.processRef.listenerCount('SIGTERM')).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    }
  );
});
