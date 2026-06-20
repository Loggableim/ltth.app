class OutboxBatcher {
  constructor(options = {}) {
    this.windowMs = Math.max(0, Number(options.windowSeconds ?? 1) * 1000);
    this.maxItems = Number(options.maxItems || 10);
    this.maxChars = Number(options.maxChars || 500);
    this.separator = options.separator ?? '\n';
    this.items = [];
    this.holds = new Set();
    this.flushHandler = null;
    this.flushTimer = null;
  }

  onFlush(handler) {
    this.flushHandler = handler;
  }

  add(item) {
    this.items.push(String(item));

    if (this.items.length >= this.maxItems || this._joinedText().length > this.maxChars) {
      this._tryFlush();
      return;
    }

    this._scheduleFlush(this.windowMs);
  }

  addHold(name) {
    this.holds.add(name);
  }

  removeHold(name) {
    this.holds.delete(name);
    if (this.holds.size === 0 && this.items.length > 0) {
      this._scheduleFlush(0);
    }
  }

  size() {
    return this.items.length;
  }

  hasHolds() {
    return this.holds.size > 0;
  }

  destroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.items = [];
    this.holds.clear();
  }

  _scheduleFlush(delayMs) {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this._tryFlush();
    }, delayMs);
    this.flushTimer.unref?.();
  }

  _tryFlush() {
    if (this.holds.size > 0) return;
    if (this.items.length === 0) return;

    const text = this._joinedText();
    this.items = [];
    if (typeof this.flushHandler === 'function') {
      this.flushHandler(text);
    }
  }

  _joinedText() {
    return this.items.join(this.separator);
  }
}

module.exports = OutboxBatcher;
