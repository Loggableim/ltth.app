/**
 * Unit tests for frontend-logger.js
 *
 * Verifies the lightweight structured logging adapter behaves correctly when
 * loaded in a CommonJS / Node.js environment (as happens during Jest runs).
 */

'use strict';

const FrontendLogger = require('../public/js/frontend-logger.js');

describe('FrontendLogger', () => {
  describe('module shape', () => {
    test('exports a createLogger function', () => {
      expect(typeof FrontendLogger.createLogger).toBe('function');
    });
  });

  describe('createLogger', () => {
    test('returns an object with debug / info / warn / error methods', () => {
      const log = FrontendLogger.createLogger('Test');
      expect(typeof log.debug).toBe('function');
      expect(typeof log.info).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.error).toBe('function');
    });

    test('uses "App" as default context when none is provided', () => {
      const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const log = FrontendLogger.createLogger(undefined);
      log.info('default context');
      expect(spy).toHaveBeenCalledWith('[INFO] [App]', 'default context');
      spy.mockRestore();
    });

    test('supports multiple independent logger instances', () => {
      const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const logA = FrontendLogger.createLogger('ModuleA');
      const logB = FrontendLogger.createLogger('ModuleB');
      logA.info('from A');
      logB.info('from B');
      expect(spy.mock.calls[0][0]).toBe('[INFO] [ModuleA]');
      expect(spy.mock.calls[1][0]).toBe('[INFO] [ModuleB]');
      spy.mockRestore();
    });
  });

  describe('log levels', () => {
    test('info() calls console.info with structured prefix', () => {
      const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const log = FrontendLogger.createLogger('Test');
      log.info('info message');
      expect(spy).toHaveBeenCalledWith('[INFO] [Test]', 'info message');
      spy.mockRestore();
    });

    test('warn() calls console.warn with structured prefix', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const log = FrontendLogger.createLogger('Test');
      log.warn('warn message');
      expect(spy).toHaveBeenCalledWith('[WARN] [Test]', 'warn message');
      spy.mockRestore();
    });

    test('error() calls console.error with structured prefix', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const log = FrontendLogger.createLogger('Test');
      log.error('error message');
      expect(spy).toHaveBeenCalledWith('[ERROR] [Test]', 'error message');
      spy.mockRestore();
    });

    test('debug() calls console.debug with structured prefix', () => {
      const spy = jest.spyOn(console, 'debug').mockImplementation(() => {});
      const log = FrontendLogger.createLogger('Test');
      log.debug('debug message');
      expect(spy).toHaveBeenCalledWith('[DEBUG] [Test]', 'debug message');
      spy.mockRestore();
    });
  });

  describe('data argument', () => {
    test('passes data as a third argument when provided', () => {
      const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const log = FrontendLogger.createLogger('Test');
      const data = { key: 'value', count: 42 };
      log.info('with data', data);
      expect(spy).toHaveBeenCalledWith('[INFO] [Test]', 'with data', data);
      spy.mockRestore();
    });

    test('omits the third argument when data is undefined', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const log = FrontendLogger.createLogger('Test');
      log.error('no data');
      // Only prefix + message — no third argument
      expect(spy).toHaveBeenCalledWith('[ERROR] [Test]', 'no data');
      expect(spy.mock.calls[0].length).toBe(2);
      spy.mockRestore();
    });

    test('passes null data correctly (falsy but defined)', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const log = FrontendLogger.createLogger('Test');
      log.warn('null data', null);
      expect(spy).toHaveBeenCalledWith('[WARN] [Test]', 'null data', null);
      spy.mockRestore();
    });
  });

  describe('worker detection (IS_WORKER = false in Node.js)', () => {
    test('does not call self.postMessage in Node.js environment', () => {
      // In Node.js, WorkerGlobalScope is not defined, so IS_WORKER = false.
      // self.postMessage would be absent — no errors should be thrown.
      const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const log = FrontendLogger.createLogger('WorkerTest');
      expect(() => log.info('no postMessage needed')).not.toThrow();
      spy.mockRestore();
    });
  });
});
