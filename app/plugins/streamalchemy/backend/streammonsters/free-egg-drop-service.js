const { randomUUID } = require('crypto');

const RESERVATION_MS = 60_000;
const DEFAULT_COOLDOWN_SECONDS = 86_400;

class FreeEggDropService {
  constructor({
    store,
    engine,
    emit = () => {},
    now = () => Date.now(),
    config = {}
  }) {
    this.store = store;
    this.engine = engine;
    this.emit = emit;
    this.now = now;
    this.config = {
      freeEggDropsEnabled: config.freeEggDropsEnabled !== false,
      freeEggCooldownSeconds: Math.max(
        1,
        Number(config.freeEggCooldownSeconds) || DEFAULT_COOLDOWN_SECONDS
      )
    };
    this.releaseTimer = null;
    this.destroyed = false;
    this.sweepAndRearm();
  }

  emitAfterCommit(event, payload) {
    this.store.afterCommit(() => this.emit(event, payload));
  }

  onFirstChat({ userId, streamKey, eventId, displayName = null, nowMs = this.now() } = {}) {
    const result = this.store.runInImmediateTransaction(() => {
      const input = this.normalizeInput({ userId, streamKey, eventId, nowMs });
      const duplicate = this.store.getFreeEggEvent(input.eventId);
      if (duplicate) return duplicate;
      this.releaseExpiredOffers(input.streamKey, input.nowMs);
      if (!this.config.freeEggDropsEnabled) {
        return this.recordEvent(input, 'first_chat', {
          success: false,
          status: 'disabled'
        });
      }
      const existing = this.store.getFreeEggOfferBySource(input.streamKey, input.userId);
      if (existing) {
        return this.recordEvent(input, 'first_chat', {
          success: true,
          status: 'already_offered',
          offer: existing,
          offerId: existing.offer_id
        });
      }
      const offer = this.store.createFreeEggOffer({
        offerId: randomUUID(),
        streamKey: input.streamKey,
        sourceUserId: input.userId,
        sourceDisplayName: displayName,
        offerEventId: input.eventId,
        offeredAtMs: input.nowMs,
        reservedUntilMs: input.nowMs + RESERVATION_MS
      });
      const result = this.recordEvent(input, 'first_chat', {
        success: true,
        status: 'offered',
        offer,
        offerId: offer.offer_id
      });
      this.emitAfterCommit('streammonsters:free_egg_offered', {
        streamKey: input.streamKey,
        sourceUserId: input.userId,
        offerId: offer.offer_id,
        reservedUntilMs: offer.reserved_until_ms
      });
      return result;
    });
    this.rearmReleaseTimer();
    return result;
  }

  adopt({ userId, streamKey, eventId, nowMs = this.now() } = {}) {
    const result = this.store.runInImmediateTransaction(() => {
      const input = this.normalizeInput({ userId, streamKey, eventId, nowMs });
      const duplicate = this.store.getFreeEggEvent(input.eventId);
      if (duplicate) return duplicate;
      this.releaseExpiredOffers(input.streamKey, input.nowMs);
      if (!this.config.freeEggDropsEnabled) {
        return this.recordEvent(input, 'adopt', { success: false, status: 'disabled' });
      }
      const latestClaim = this.store.getLatestFreeEggClaim(input.userId);
      const cooldownMs = this.config.freeEggCooldownSeconds * 1_000;
      if (latestClaim && input.nowMs - latestClaim.claimed_at_ms < cooldownMs) {
        return this.recordEvent(input, 'adopt', {
          success: false,
          status: 'cooldown',
          remainingMs: cooldownMs - (input.nowMs - latestClaim.claimed_at_ms)
        });
      }
      const offer = this.store.getReservedFreeEggOffer(
        input.streamKey,
        input.userId,
        input.nowMs
      ) || this.store.getOldestPublicFreeEggOffer(input.streamKey);
      if (!offer) return this.recordEvent(input, 'adopt', { success: false, status: 'no_offer' });

      const claimedOffer = this.store.claimFreeEggOffer({
        offerId: offer.offer_id,
        userId: input.userId,
        claimedAtMs: input.nowMs
      });
      if (!claimedOffer) return this.recordEvent(input, 'adopt', { success: false, status: 'no_offer' });
      const egg = this.engine.createFreeEgg({ userId: input.userId, createdAtMs: input.nowMs });
      this.store.createFreeEggClaim({
        claimId: randomUUID(),
        offerId: claimedOffer.offer_id,
        streamKey: input.streamKey,
        userId: input.userId,
        claimEventId: input.eventId,
        claimedAtMs: input.nowMs
      });
      const result = this.recordEvent(input, 'adopt', {
        success: true,
        status: 'claimed',
        offerId: claimedOffer.offer_id,
        sourceUserId: claimedOffer.source_user_id,
        egg
      });
      this.emitAfterCommit('streammonsters:free_egg_claimed', {
        streamKey: input.streamKey,
        offerId: claimedOffer.offer_id,
        sourceUserId: claimedOffer.source_user_id,
        userId: input.userId,
        egg
      });
      return result;
    });
    this.rearmReleaseTimer();
    return result;
  }

  cleanupStream({ streamKey } = {}) {
    const normalizedStreamKey = this.normalizeStreamKey(streamKey);
    const result = this.store.runInImmediateTransaction(() => (
      this.store.cleanupFreeEggStream(normalizedStreamKey)
    ));
    this.rearmReleaseTimer();
    return result;
  }

  releaseExpiredOffers(streamKey = null, nowMs = this.now()) {
    const released = this.store.releaseExpiredFreeEggOffers(streamKey, nowMs);
    released.forEach(offer => this.emitAfterCommit('streammonsters:free_egg_released', {
      streamKey: offer.stream_key,
      offerId: offer.offer_id,
      sourceUserId: offer.source_user_id
    }));
    return released;
  }

  sweepAndRearm(nowMs = this.now()) {
    if (this.destroyed) return [];
    const released = this.store.runInImmediateTransaction(() => (
      this.releaseExpiredOffers(null, nowMs)
    ));
    this.rearmReleaseTimer();
    return released;
  }

  rearmReleaseTimer() {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    if (this.destroyed) return;
    const deadlineMs = this.store.getNextFreeEggReservationDeadline();
    if (deadlineMs === null) return;
    const delayMs = Math.max(0, deadlineMs - Number(this.now()));
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      this.sweepAndRearm();
    }, delayMs);
    this.releaseTimer.unref?.();
  }

  destroy() {
    this.destroyed = true;
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
  }

  recordEvent(input, eventType, result) {
    return this.store.recordFreeEggEvent({
      eventId: input.eventId,
      streamKey: input.streamKey,
      eventType,
      result,
      createdAtMs: input.nowMs
    });
  }

  normalizeInput({ userId, streamKey, eventId, nowMs }) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) throw new Error('STREAM_MONSTERS_USER_REQUIRED');
    const normalizedEventId = String(eventId || '').trim();
    if (!normalizedEventId) throw new Error('STREAM_MONSTERS_EVENT_REQUIRED');
    return {
      userId: normalizedUserId,
      streamKey: this.normalizeStreamKey(streamKey),
      eventId: normalizedEventId,
      nowMs: Number.isFinite(Number(nowMs)) ? Number(nowMs) : this.now()
    };
  }

  normalizeStreamKey(streamKey) {
    return String(streamKey || this.engine?.streamKey || 'offline').trim() || 'offline';
  }
}

module.exports = FreeEggDropService;
module.exports.DEFAULT_COOLDOWN_SECONDS = DEFAULT_COOLDOWN_SECONDS;
module.exports.RESERVATION_MS = RESERVATION_MS;
