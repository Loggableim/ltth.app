/**
 * LifecycleTracker
 *
 * Small composable helper for plugin/module lifecycle management.
 * Tracks timeouts, intervals, and event listener registrations so that
 * cleanupAll() can safely cancel/remove them all in one call.
 *
 * Usage:
 *   const tracker = new LifecycleTracker();
 *   tracker.trackTimeout(setTimeout(() => doWork(), 1000));
 *   tracker.trackInterval(setInterval(() => poll(), 5000));
 *   const handler = tracker.trackListener(emitter, 'event', fn);
 *   // ...later on destroy/disable:
 *   tracker.cleanupAll();
 */
class LifecycleTracker {
  constructor() {
    this._timeouts = new Set();
    this._intervals = new Set();
    this._listeners = [];
  }

  /**
   * Track a timeout handle returned by setTimeout.
   * @param {ReturnType<typeof setTimeout>} handle
   * @returns {ReturnType<typeof setTimeout>} The same handle, for inline use.
   */
  trackTimeout(handle) {
    this._timeouts.add(handle);
    return handle;
  }

  /**
   * Cancel and untrack a previously tracked timeout.
   * Safe to call even if the handle has already fired or been cleared.
   * @param {ReturnType<typeof setTimeout>} handle
   */
  clearTimeout(handle) {
    clearTimeout(handle);
    this._timeouts.delete(handle);
  }

  /**
   * Track an interval handle returned by setInterval.
   * @param {ReturnType<typeof setInterval>} handle
   * @returns {ReturnType<typeof setInterval>} The same handle, for inline use.
   */
  trackInterval(handle) {
    this._intervals.add(handle);
    return handle;
  }

  /**
   * Cancel and untrack a previously tracked interval.
   * Safe to call even if the handle has already been cleared.
   * @param {ReturnType<typeof setInterval>} handle
   */
  clearInterval(handle) {
    clearInterval(handle);
    this._intervals.delete(handle);
  }

  /**
   * Track an EventEmitter listener registration.
   * The listener function is returned so it can be used inline.
   * @param {import('events').EventEmitter} emitter
   * @param {string} event
   * @param {Function} fn
   * @returns {Function} The same fn, for inline use.
   */
  trackListener(emitter, event, fn) {
    this._listeners.push({ emitter, event, fn });
    return fn;
  }

  /**
   * Cancel all tracked timeouts, clear all tracked intervals, and remove all
   * tracked event listeners.  Safe to call multiple times (idempotent).
   */
  cleanupAll() {
    for (const handle of this._timeouts) {
      clearTimeout(handle);
    }
    this._timeouts.clear();

    for (const handle of this._intervals) {
      clearInterval(handle);
    }
    this._intervals.clear();

    for (const { emitter, event, fn } of this._listeners) {
      try {
        if (emitter && typeof emitter.removeListener === 'function') {
          emitter.removeListener(event, fn);
        }
      } catch (_) {
        // Ignore errors during cleanup
      }
    }
    this._listeners = [];
  }
}

module.exports = LifecycleTracker;
