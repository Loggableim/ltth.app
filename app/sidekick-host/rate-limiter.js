'use strict';

// Sliding-window limiter for chat-originated replies.
class RateLimiter {
  constructor({ maxEvents = 18, windowMs = 60000, now = () => Date.now() } = {}) {
    this.maxEvents = maxEvents;
    this.windowMs = windowMs;
    this.now = now;
    this.stamps = [];
  }

  allow() {
    const current = this.now();
    this.stamps = this.stamps.filter(stamp => current - stamp < this.windowMs);
    if (this.stamps.length >= this.maxEvents) return false;
    this.stamps.push(current);
    return true;
  }
}

module.exports = { RateLimiter };
