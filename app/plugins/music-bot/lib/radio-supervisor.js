const RETRY_DELAYS_SECONDS = [5, 15, 30, 60];

class RadioSupervisor {
  constructor(options = {}) {
    if (typeof options.advance !== 'function') {
      throw new TypeError('RadioSupervisor requires an advance callback');
    }
    this.advance = options.advance;
    this.isPlaying = typeof options.isPlaying === 'function' ? options.isPlaying : () => false;
    this.isOccupied = typeof options.isOccupied === 'function' ? options.isOccupied : this.isPlaying;
    this.onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : () => {};
    const timing = options.timing || {};
    this.timing = {
      now: typeof timing.now === 'function' ? timing.now : Date.now,
      setTimeout: typeof timing.setTimeout === 'function' ? timing.setTimeout : setTimeout,
      clearTimeout: typeof timing.clearTimeout === 'function' ? timing.clearTimeout : clearTimeout,
      setInterval: typeof timing.setInterval === 'function' ? timing.setInterval : setInterval,
      clearInterval: typeof timing.clearInterval === 'function' ? timing.clearInterval : clearInterval
    };
    this.watchdogIntervalMs = Math.max(250, Number(options.watchdogIntervalMs) || 1000);
    this.enabled = false;
    this.armed = false;
    this.locked = false;
    this.destroyed = false;
    this.generation = 0;
    this.advanceId = 0;
    this.retryAt = null;
    this.backoffSeconds = 0;
    this.lastWakeReason = null;
    this.failureClass = null;
    this._backoffIndex = 0;
    this._advanceOperation = null;
    this._retryTimer = null;
    this._watchdogTimer = null;
  }

  setEnabled(enabled, { wake = true } = {}) {
    const next = Boolean(enabled);
    if (this.enabled === next && !this.destroyed) {
      if (next && !this.locked && this.armed) this._ensureWatchdog();
      return wake && next && !this.locked ? this.wake('enabled') : null;
    }
    this.enabled = next;
    this.armed = next && !this.locked;
    this.generation += 1;
    this._cancelScheduledWork();
    if (next && !this.locked && !this.destroyed) {
      this._ensureWatchdog();
      this._notify();
      return wake ? this.wake('enabled') : null;
    }
    this._notify();
    return null;
  }

  setLocked(locked, { wake = true } = {}) {
    const next = Boolean(locked);
    if (this.locked === next || this.destroyed) return null;
    this.locked = next;
    if (next) this.armed = false;
    this.generation += 1;
    this._cancelScheduledWork();
    if (!next && this.enabled) {
      if (this.armed) this._ensureWatchdog();
      this._notify();
      return wake ? this.wake('unlocked') : null;
    }
    this._notify();
    return null;
  }

  wake(reason = 'unknown', payload = {}) {
    this.lastWakeReason = String(reason || 'unknown');
    if (this.enabled && !this.locked && !this.destroyed && !['retry', 'watchdog', 'unlocked'].includes(this.lastWakeReason)) {
      this.armed = true;
      this._ensureWatchdog();
    }
    if (!this._canAdvance() || (['retry', 'watchdog', 'unlocked'].includes(this.lastWakeReason) && !this._wantsPlayback())) {
      this._notify();
      return Promise.resolve({ success: false, inactive: true });
    }
    if (this._advanceOperation) {
      this._notify();
      return this._advanceOperation;
    }

    this._clearRetryTimer();
    const generation = this.generation;
    const advanceId = ++this.advanceId;
    let resetPerformed = false;
    const context = {
      advanceId,
      generation,
      reason: this.lastWakeReason,
      payload,
      isCurrent: () => this._canAdvance() && generation === this.generation,
      resetPlayerOnce: async (reset) => {
        if (resetPerformed || typeof reset !== 'function') return false;
        resetPerformed = true;
        await reset();
        if (generation === this.generation) this._resetBackoff();
        return true;
      }
    };

    const operation = Promise.resolve()
      .then(() => this.advance(context))
      .then((result) => {
        if (!context.isCurrent()) return { success: false, stale: true };
        const normalized = result && typeof result === 'object'
          ? result
          : { success: Boolean(result) };
        if (normalized.success !== false && (normalized.song || this.isPlaying())) {
          this._resetBackoff();
        } else {
          this.failureClass = normalized.failureClass || 'unknown';
          if (this._wantsPlayback()) this._scheduleRetry(generation);
        }
        this._notify();
        return normalized;
      }, (error) => {
        if (context.isCurrent()) {
          this.failureClass = error?.failureClass || error?.code || 'unexpected';
          if (this._wantsPlayback()) this._scheduleRetry(generation);
          this._notify();
        }
        return {
          success: false,
          error: error?.message || String(error),
          failureClass: this.failureClass
        };
      });
    const tracked = operation.finally(() => {
      if (this._advanceOperation === tracked) this._advanceOperation = null;
    });
    this._advanceOperation = tracked;
    this._notify();
    return tracked;
  }

  getSnapshot() {
    return {
      desiredPlayback: this._wantsPlayback(),
      armed: this.armed,
      generation: this.generation,
      advanceId: this.advanceId,
      retryAt: this.retryAt,
      backoffSeconds: this.backoffSeconds,
      lastWakeReason: this.lastWakeReason,
      failureClass: this.failureClass
    };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.enabled = false;
    this.armed = false;
    this.generation += 1;
    this._cancelScheduledWork();
    this._notify();
  }

  _wantsPlayback() {
    return this.enabled && this.armed && this._canAdvance();
  }

  _canAdvance() {
    return !this.locked && !this.destroyed;
  }

  _scheduleRetry(generation) {
    if (!this._wantsPlayback() || generation !== this.generation) return;
    this._clearRetryTimer();
    const delayIndex = Math.min(this._backoffIndex, RETRY_DELAYS_SECONDS.length - 1);
    const delaySeconds = RETRY_DELAYS_SECONDS[delayIndex];
    this._backoffIndex = Math.min(delayIndex + 1, RETRY_DELAYS_SECONDS.length - 1);
    this.backoffSeconds = delaySeconds;
    this.retryAt = this.timing.now() + (delaySeconds * 1000);
    const timer = this.timing.setTimeout(() => {
      if (this._retryTimer !== timer) return;
      this._retryTimer = null;
      this.retryAt = null;
      if (!this._wantsPlayback() || generation !== this.generation) return;
      this.wake('retry').catch(() => {});
    }, delaySeconds * 1000);
    timer?.unref?.();
    this._retryTimer = timer;
  }

  _ensureWatchdog() {
    if (this._watchdogTimer || !this._wantsPlayback()) return;
    const timer = this.timing.setInterval(() => {
      if (!this._wantsPlayback()) return;
      if (this._advanceOperation || this._retryTimer || this.isOccupied()) return;
      this.wake('watchdog').catch(() => {});
    }, this.watchdogIntervalMs);
    timer?.unref?.();
    this._watchdogTimer = timer;
  }

  _resetBackoff() {
    this._clearRetryTimer();
    this._backoffIndex = 0;
    this.backoffSeconds = 0;
    this.retryAt = null;
    this.failureClass = null;
  }

  _clearRetryTimer() {
    if (this._retryTimer) this.timing.clearTimeout(this._retryTimer);
    this._retryTimer = null;
    this.retryAt = null;
  }

  _cancelScheduledWork() {
    this._resetBackoff();
    // The promise cannot be force-cancelled, but generation checks make its result stale.
    // Detach it so a newly enabled/unlocked generation can advance immediately.
    this._advanceOperation = null;
    if (this._watchdogTimer) this.timing.clearInterval(this._watchdogTimer);
    this._watchdogTimer = null;
  }

  _notify() {
    try {
      this.onStateChange(this.getSnapshot());
    } catch (_) {
      // Diagnostics callbacks must never interrupt playback supervision.
    }
  }
}

RadioSupervisor.RETRY_DELAYS_SECONDS = RETRY_DELAYS_SECONDS;

module.exports = RadioSupervisor;
