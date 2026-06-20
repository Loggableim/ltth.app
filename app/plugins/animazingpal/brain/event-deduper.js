class EventDeduper {
  constructor(options = {}) {
    this.ttlMs = Math.max(1, Number(options.ttl || 60) * 1000);
    this.maxSize = Math.max(1, Number(options.maxSize || 1000));
    this.seen = new Map();
    this.cleanupTimer = setInterval(() => this._cleanup(), Math.min(this.ttlMs, 60000));
    this.cleanupTimer.unref?.();
  }

  generateSignature(type, data = {}) {
    const stableData = Object.keys(data)
      .sort()
      .map(key => `${key}:${data[key]}`)
      .join('|');
    return `${type}:${stableData}`;
  }

  hasSeen(signature) {
    this._cleanup();

    if (this.seen.has(signature)) {
      this.seen.set(signature, Date.now());
      return true;
    }

    this.seen.set(signature, Date.now());
    this._enforceMaxSize();
    return false;
  }

  size() {
    this._cleanup();
    return this.seen.size;
  }

  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.seen.clear();
  }

  _cleanup() {
    const now = Date.now();
    for (const [signature, seenAt] of this.seen.entries()) {
      if (now - seenAt > this.ttlMs) {
        this.seen.delete(signature);
      }
    }
  }

  _enforceMaxSize() {
    while (this.seen.size > this.maxSize) {
      const oldest = this.seen.keys().next().value;
      this.seen.delete(oldest);
    }
  }
}

module.exports = EventDeduper;
