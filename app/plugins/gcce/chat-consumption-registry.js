const { createHash, randomUUID } = require('crypto');

const objectCorrelationIds = new WeakMap();

function chatMessage(data = {}) {
  return String(data.comment || data.message || data.text || '').trim();
}

function chatCorrelationId(data = {}) {
  const providerEventId = (
    data.eventId ??
    data.event_id ??
    data.msgId ??
    data.msg_id ??
    data.logId ??
    data.log_id
  );
  if (providerEventId !== undefined && providerEventId !== null) {
    return `tiktok:${String(providerEventId).trim().slice(0, 128)}`;
  }
  if (data && typeof data === 'object') {
    const existing = objectCorrelationIds.get(data);
    if (existing) return existing;
    const correlationId = `tiktok-local:${randomUUID()}`;
    objectCorrelationIds.set(data, correlationId);
    return correlationId;
  }
  return `tiktok-fallback:${createHash('sha256')
    .update(String(data || ''))
    .digest('hex')
    .slice(0, 32)}`;
}

class ChatConsumptionRegistry {
  constructor({ now = () => Date.now(), ttlMs = 15_000 } = {}) {
    this.now = now;
    this.ttlMs = Math.max(1_000, Number(ttlMs) || 15_000);
    this.results = new Map();
    this.waiters = new Map();
  }

  correlationId(data) {
    return chatCorrelationId(data);
  }

  isPotential(data, commandPrefix = '/') {
    const message = chatMessage(data);
    if (!message) return false;
    return message.startsWith(String(commandPrefix || '/')) ||
      /^[ABC1-4]$/i.test(message);
  }

  resolve(data, decision = {}) {
    this.prune();
    const correlationId = this.correlationId(data);
    const record = Object.freeze({
      schemaVersion: 1,
      correlationId,
      pluginId: String(decision.pluginId || ''),
      success: decision.success === true,
      consumed: (
        decision.pluginId === 'streamalchemy' &&
        decision.handled === true
      )
    });
    this.results.set(correlationId, {
      expiresAtMs: this.now() + this.ttlMs,
      record
    });
    const waiters = this.waiters.get(correlationId) || [];
    this.waiters.delete(correlationId);
    waiters.forEach(resolve => resolve(record));
    return record;
  }

  wait(data, { timeoutMs = 2_000 } = {}) {
    this.prune();
    const correlationId = this.correlationId(data);
    const cached = this.results.get(correlationId);
    if (cached) return Promise.resolve(cached.record);
    return new Promise(resolve => {
      const waiters = this.waiters.get(correlationId) || [];
      let settled = false;
      const finish = record => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(record);
      };
      waiters.push(finish);
      this.waiters.set(correlationId, waiters);
      const timer = setTimeout(() => {
        const pending = this.waiters.get(correlationId) || [];
        const remaining = pending.filter(waiter => waiter !== finish);
        if (remaining.length) this.waiters.set(correlationId, remaining);
        else this.waiters.delete(correlationId);
        finish({
          schemaVersion: 1,
          correlationId,
          pluginId: '',
          success: false,
          consumed: false,
          timedOut: true
        });
      }, Math.max(1, Number(timeoutMs) || 2_000));
      timer.unref?.();
    });
  }

  prune() {
    const nowMs = this.now();
    for (const [correlationId, entry] of this.results.entries()) {
      if (entry.expiresAtMs <= nowMs) this.results.delete(correlationId);
    }
  }

  clear() {
    this.results.clear();
    for (const [correlationId, waiters] of this.waiters.entries()) {
      waiters.forEach(resolve => resolve({
        schemaVersion: 1,
        correlationId,
        pluginId: '',
        success: false,
        consumed: false,
        cleared: true
      }));
    }
    this.waiters.clear();
  }
}

module.exports = {
  ChatConsumptionRegistry,
  chatCorrelationId,
  chatMessage
};
