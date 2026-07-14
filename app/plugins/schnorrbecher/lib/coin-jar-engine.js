const { DEFAULT_STATE, normalizeState } = require('./config');

const MAX_EVENT_IDS = 5000;
const COMBO_TIMEOUT_MS = 2500;

function calculateVisualCoins(value) {
  return Math.max(1, Math.min(100, Math.ceil(Math.sqrt(value))));
}

function normalizeGiftEvent(event = {}) {
  const source = event && typeof event === 'object' ? event : {};
  const diamondValue = Number(
    source.diamondValue ?? source.diamondCount ?? source.diamond_count ?? source.coins ?? source.giftValue
  );
  const repeatCount = Math.max(1, Math.floor(Number(
    source.repeatCount ?? source.repeat_count ?? source.comboCount ?? source.combo_count ?? 1
  )));
  const eventId = source.eventId ?? source.event_id ?? source.id ?? '';
  const comboId = source.comboId ?? source.combo_id ?? eventId;

  return {
    eventId: String(eventId),
    comboId: String(comboId),
    senderId: String(source.senderId ?? source.userId ?? source.uniqueId ?? ''),
    senderName: source.senderName ?? source.nickname ?? source.username ?? '',
    senderAvatar: source.senderAvatar ?? source.profilePictureUrl ?? null,
    giftId: String(source.giftId ?? source.gift_id ?? source.gift?.id ?? ''),
    giftName: source.giftName ?? source.gift?.name ?? 'Gift',
    giftImage: source.giftImage ?? source.giftImageUrl ?? source.giftPictureUrl ?? null,
    diamondValue,
    repeatCount,
    repeatEnd: source.repeatEnd !== false && source.repeat_end !== false,
    timestamp: Number(source.timestamp) || Date.now()
  };
}

class CoinJarEngine {
  constructor({ store, getConfig, emit, log, now, setTimeoutFn, clearTimeoutFn }) {
    this.store = store;
    this.getConfig = getConfig;
    this.emit = emit;
    this.log = log;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.state = normalizeState(store.loadState());
    this.completedEventIds = new Set(this.state.lastProcessedEventIds);
    this.combos = new Map();
    this.generation = 0;
    this.lastStreamIdentity = null;
    this.manualSequence = 0;
  }

  static calculateVisualCoins(value) {
    return calculateVisualCoins(value);
  }

  _rememberEvent(eventId) {
    this.completedEventIds.add(eventId);
    while (this.completedEventIds.size > MAX_EVENT_IDS) {
      this.completedEventIds.delete(this.completedEventIds.values().next().value);
    }
  }

  _persist() {
    this.state.updatedAt = this.now();
    this.state.lastProcessedEventIds = Array.from(this.completedEventIds);
    this.state = this.store.saveState(this.state);
    return this.state;
  }

  _isValidValue(value) {
    return Number.isFinite(value) && value > 0;
  }

  _complete(event, totalValue) {
    if (this.completedEventIds.has(event.eventId)) {
      return { accepted: false, reason: 'duplicate' };
    }

    this._rememberEvent(event.eventId);
    const visualCoins = calculateVisualCoins(totalValue);
    this.state.totalCoinValue += totalValue;
    this.state.visualCoinCount += visualCoins;
    this._persist();

    const payload = {
      ...event,
      totalValue,
      visualCoins,
      totalCoinValue: this.state.totalCoinValue,
      visualCoinCount: this.state.visualCoinCount,
      generation: this.generation
    };
    this.emit('coinJar.add', payload);
    return { accepted: true, ...payload };
  }

  handleGift(rawEvent) {
    const config = this.getConfig();
    if (config.enabled === false) return { accepted: false, reason: 'disabled' };

    const event = normalizeGiftEvent(rawEvent);
    const totalValue = event.diamondValue * event.repeatCount;
    if (!event.eventId || !this._isValidValue(totalValue)) {
      this.log('Invalid gift value ignored', 'warn');
      return { accepted: false, reason: 'invalid-value' };
    }
    if (this.completedEventIds.has(event.eventId)) {
      return { accepted: false, reason: 'duplicate' };
    }

    if (event.repeatEnd) {
      const pending = this.combos.get(event.comboId);
      if (pending) {
        this.clearTimeoutFn(pending.timer);
        event.repeatCount = Math.max(event.repeatCount, pending.event.repeatCount);
        this.combos.delete(event.comboId);
      }
      return this._complete(event, event.diamondValue * event.repeatCount);
    }

    const current = this.combos.get(event.comboId);
    const highest = !current || event.repeatCount >= current.event.repeatCount ? event : current.event;
    if (current) this.clearTimeoutFn(current.timer);

    const timer = this.setTimeoutFn(() => {
      const pending = this.combos.get(event.comboId);
      if (!pending) return;
      this.combos.delete(event.comboId);
      this._complete(pending.event, pending.event.diamondValue * pending.event.repeatCount);
    }, COMBO_TIMEOUT_MS);

    this.combos.set(event.comboId, { event: highest, timer });
    return { accepted: true, pending: true };
  }

  addValue(value, details = {}) {
    const totalValue = Number(value);
    if (!this._isValidValue(totalValue)) {
      this.log('Invalid coin jar value ignored', 'warn');
      return { accepted: false, reason: 'invalid-value' };
    }

    this.manualSequence += 1;
    const event = normalizeGiftEvent({
      ...details,
      eventId: details.eventId || `manual:${this.now()}:${this.manualSequence}`,
      comboId: details.comboId || details.eventId || `manual:${this.manualSequence}`,
      diamondValue: totalValue,
      repeatCount: 1,
      repeatEnd: true,
      timestamp: details.timestamp || this.now()
    });
    return this._complete(event, totalValue);
  }

  clearEventCache() {
    this.completedEventIds.clear();
    this._persist();
    this.emit('coinJar.sync', this.syncPayload());
    return this.syncPayload();
  }

  reset(reason = 'manual') {
    for (const { timer } of this.combos.values()) {
      this.clearTimeoutFn(timer);
    }
    this.combos.clear();
    this.completedEventIds.clear();
    this.generation += 1;
    this.state = this.store.clearState ? this.store.clearState() : normalizeState(DEFAULT_STATE);
    this.state = normalizeState(this.state);
    this.state.updatedAt = this.now();
    this._persist();

    const payload = { reason, generation: this.generation };
    this.emit('coinJar.reset', payload);
    return { ...payload, totalCoinValue: 0, visualCoinCount: 0 };
  }

  syncPayload() {
    return {
      sessionId: this.state.sessionId,
      totalCoinValue: this.state.totalCoinValue,
      visualCoinCount: this.state.visualCoinCount,
      updatedAt: this.state.updatedAt,
      generation: this.generation
    };
  }

  handleStreamSession(data = {}, options = {}) {
    const config = this.getConfig();
    const streamIdentity = data?.streamIdentity || data?.roomId || data?.room_id || null;
    if (!streamIdentity || config.resetOnNewStream !== true || config.persistenceMode !== 'session') {
      return false;
    }
    if (options.requireIsNewStream === true && data?.isNewStream !== true) {
      return false;
    }
    if (streamIdentity === this.lastStreamIdentity) {
      return false;
    }

    this.lastStreamIdentity = streamIdentity;
    this.state.sessionId = streamIdentity;
    this.reset('new-stream');
    this.state.sessionId = streamIdentity;
    this._persist();
    return true;
  }

  destroy() {
    for (const { timer } of this.combos.values()) {
      this.clearTimeoutFn(timer);
    }
    this.combos.clear();
  }
}

module.exports = CoinJarEngine;
module.exports.calculateVisualCoins = calculateVisualCoins;
module.exports.normalizeGiftEvent = normalizeGiftEvent;
