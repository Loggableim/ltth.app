/**
 * Frontend Logger - Lightweight structured logging adapter for browser and Web Worker contexts.
 *
 * Compatible with:
 *   - Browser (window / document context)
 *   - Web Workers (WorkerGlobalScope / self context)
 *   - CommonJS / Jest (module.exports)
 *
 * Usage in browser (script must be loaded before consumer scripts):
 *   const log = window.FrontendLogger.createLogger('MyModule');
 *   log.info('Something happened', { key: 'value' });
 *
 * Usage in Web Worker (via importScripts):
 *   importScripts('/js/frontend-logger.js');
 *   const log = self.FrontendLogger.createLogger('SoundWorker');
 *   log.error('Download failed', { url, error: err.message });
 *   // Also posts { type: 'log', level, context, message, data, ts } back to the main thread.
 */
(function (global) {
  'use strict';

  /**
   * True when this script is running inside a Web Worker.
   * @type {boolean}
   */
  var IS_WORKER = (
    typeof WorkerGlobalScope !== 'undefined' &&
    typeof self !== 'undefined' &&
    self instanceof WorkerGlobalScope
  );

  /**
   * Create a named logger instance.
   *
   * @param {string} context - A short label identifying the caller (e.g. 'Wiki', 'SoundWorker').
   * @returns {{ debug: Function, info: Function, warn: Function, error: Function }}
   */
  function createLogger(context) {
    var ctx = context || 'App';

    /**
     * Dispatch a structured log entry.
     *
     * @param {'debug'|'info'|'warn'|'error'} level
     * @param {string} message
     * @param {*} [data] - Optional structured payload (object, Error, etc.).
     */
    function log(level, message, data) {
      var entry = {
        type: 'log',
        level: level,
        context: ctx,
        message: message,
        ts: new Date().toISOString(),
      };
      if (data !== undefined) {
        entry.data = data;
      }

      if (IS_WORKER) {
        // Forward the structured entry to the main thread so it can be captured
        // and displayed in the application's debug panel or log aggregator.
        self.postMessage(entry);
      }

      // Always write to the browser/worker console for immediate developer visibility.
      var prefix = '[' + level.toUpperCase() + '] [' + ctx + ']';
      switch (level) {
        case 'error':
          data !== undefined ? console.error(prefix, message, data) : console.error(prefix, message);
          break;
        case 'warn':
          data !== undefined ? console.warn(prefix, message, data) : console.warn(prefix, message);
          break;
        case 'debug':
          data !== undefined ? console.debug(prefix, message, data) : console.debug(prefix, message);
          break;
        default:
          data !== undefined ? console.info(prefix, message, data) : console.info(prefix, message);
          break;
      }
    }

    return {
      /** @param {string} message @param {*} [data] */
      debug: function (message, data) { log('debug', message, data); },
      /** @param {string} message @param {*} [data] */
      info:  function (message, data) { log('info',  message, data); },
      /** @param {string} message @param {*} [data] */
      warn:  function (message, data) { log('warn',  message, data); },
      /** @param {string} message @param {*} [data] */
      error: function (message, data) { log('error', message, data); },
    };
  }

  var FrontendLogger = { createLogger: createLogger };

  // Export for Node.js / CommonJS (Jest tests run in Node).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FrontendLogger;
  } else {
    // Expose on the global scope (window in browser, self in worker).
    global.FrontendLogger = FrontendLogger;
  }

}(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : {}));
