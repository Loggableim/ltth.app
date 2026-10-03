const { randomUUID } = require('crypto');

const RESERVATION_MS = 60_000;
const PUBLIC_WINDOW_MS = 300_000;
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
    this.config = this.normalizeConfig(config);
    this.releaseTimer = null;
    this.destroyed = false;
    this.started = false;
  }

  emitAfterCommit(event, payload) {
    this.emit(event, payload);
  }

  onFirstChat({
    userId,
    streamKey,
    eventId,
    displayName = null,
    avatarRef = null,
    nowMs = this.now()
  } = {}) {
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
      const latestClaim = this.store.getLatestFreeEggClaim(input.userId);
      const cooldownMs = this.config.freeEggCooldownSeconds * 1_000;
      if (latestClaim && input.nowMs - latestClaim.claimed_at_ms < cooldownMs) {
        return this.recordEvent(input, 'first_chat', {
          success: false,
          status: 'cooldown',
          remainingMs: cooldownMs - (input.nowMs - latestClaim.claimed_at_ms)
        });
      }
      const element = this.engine.selectRandomElement({ giftId: 0 });
      const reservedUntilMs = input.nowMs + RESERVATION_MS;
      const offer = this.store.createFreeEggOffer({
        offerId: randomUUID(),
        streamKey: input.streamKey,
        sourceUserId: input.userId,
        sourceDisplayName: displayName,
        offerEventId: input.eventId,
        offeredAtMs: input.nowMs,
        reservedUntilMs,
        publicExpiresAtMs: reservedUntilMs + PUBLIC_WINDOW_MS,
        element,
        variant: 'standard',
        imageUrl: this.engine.createDefaultEggImage({ element }, 'standard'),
        sourceAvatarRef: this.engine.eggStageProjector
          ?.constructor.safeAssetReference?.(avatarRef) || null
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
      const eggStage = this.engine.eggStageProjector.projectOffer(offer);
      this.emitAfterCommit('streammonsters:free_egg_reserved', {
        eggStage,
        ...this.engine.eggStageProjector.eventIdentity(
          'streammonsters:free_egg_reserved',
          eggStage
        )
      });
      return result;
    });
    this.rearmReleaseTimer();
    return result;
  }

  adopt({
    userId,
    streamKey,
    eventId,
    displayName = null,
    avatarRef = null,
    nowMs = this.now(),
    offerScope = 'any',
    recordFailure = true
  } = {}) {
    const result = this.store.runInImmediateTransaction(() => {
      const input = this.normalizeInput({ userId, streamKey, eventId, nowMs });
      const duplicate = this.store.getFreeEggEvent(input.eventId);
      if (duplicate) return duplicate;
      this.releaseExpiredOffers(input.streamKey, input.nowMs);
      if (!this.config.freeEggDropsEnabled) {
        const disabled = { success: false, status: 'disabled' };
        return recordFailure
          ? this.recordEvent(input, 'adopt', disabled)
          : disabled;
      }
      const reserved = offerScope === 'public'
        ? null
        : this.store.getReservedFreeEggOffer(
            input.streamKey,
            input.userId,
            input.nowMs
          );
      const offer = reserved || (
        offerScope === 'reserved'
          ? null
          : this.store.getOldestPublicFreeEggOffer(input.streamKey)
      );
      if (!offer) {
        const unavailable = { success: false, status: 'no_offer' };
        return recordFailure
          ? this.recordEvent(input, 'adopt', unavailable)
          : unavailable;
      }

      const claimedOffer = this.store.claimFreeEggOffer({
        offerId: offer.offer_id,
        userId: input.userId,
        claimedAtMs: input.nowMs
      });
      if (!claimedOffer) return this.recordEvent(input, 'adopt', { success: false, status: 'no_offer' });
      const egg = this.engine.createFreeEgg({
        userId: input.userId,
        createdAtMs: input.nowMs,
        offerId: claimedOffer.offer_id,
        element: claimedOffer.element,
        displayName: displayName ||
          this.store.getViewerDisplayName?.(input.userId) ||
          null,
        avatarRef
      });
      this.store.createFreeEggClaim({
        claimId: randomUUID(),
        offerId: claimedOffer.offer_id,
        streamKey: input.streamKey,
        userId: input.userId,
        claimEventId: input.eventId,
        claimedAtMs: input.nowMs,
        cooldownExpiresAtMs: input.nowMs + this.config.freeEggCooldownSeconds * 1_000
      });
      this.engine.progression?.recordEggReceived(
        input.userId,
        input.streamKey,
        {
          source: 'free',
          eventId: input.eventId
        }
      );
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
        egg,
        eggStage: this.engine.eggStageProjector.projectEgg(egg),
        // Free eggs are an adoption offer on the shared shelf, not a second
        // public representation of the claimant's private inventory egg.
        removedEggStage: this.engine.eggStageProjector.projectOffer(claimedOffer)
      });
      return result;
    });
    this.rearmReleaseTimer();
    return result;
  }

  cleanupStream({ streamKey } = {}) {
    const normalizedStreamKey = this.normalizeStreamKey(streamKey);
    const result = this.store.runInImmediateTransaction(() => {
      const outstanding = this.store.getEggStageOffers(normalizedStreamKey);
      const cleanup = this.store.cleanupFreeEggStream(normalizedStreamKey);
      outstanding.forEach(offer => {
        const expired = this.store.getFreeEggOffer(offer.offer_id);
        const eggStage = this.engine.eggStageProjector.projectOffer(expired);
        this.emitAfterCommit('streammonsters:egg_stage_removed', {
          eggStage,
          ...this.engine.eggStageProjector.eventIdentity(
            'streammonsters:egg_stage_removed',
            eggStage
          )
        });
      });
      return cleanup;
    });
    this.rearmReleaseTimer();
    return result;
  }

  releaseExpiredOffers(streamKey = null, nowMs = this.now()) {
    const released = this.store.releaseExpiredFreeEggOffers(streamKey, nowMs);
    released.forEach(offer => {
      this.emitAfterCommit('streammonsters:free_egg_released', {
        streamKey: offer.stream_key,
        offerId: offer.offer_id,
        sourceUserId: offer.source_user_id
      });
      const eggStage = this.engine.eggStageProjector.projectOffer(offer);
      this.emitAfterCommit('streammonsters:free_egg_public', {
        eggStage,
        ...this.engine.eggStageProjector.eventIdentity(
          'streammonsters:free_egg_public',
          eggStage
        )
      });
    });
    const expired = this.store.expirePublicFreeEggOffers(streamKey, nowMs);
    expired.forEach(offer => {
      const eggStage = this.engine.eggStageProjector.projectOffer(offer);
      this.emitAfterCommit('streammonsters:egg_stage_removed', {
        eggStage,
        ...this.engine.eggStageProjector.eventIdentity(
          'streammonsters:egg_stage_removed',
          eggStage
        )
      });
    });
    return released;
  }

  sweepAndRearm(nowMs = this.now()) {
    if (this.destroyed || !this.started) return [];
    try {
      return this.store.runInImmediateTransaction(() => (
        this.releaseExpiredOffers(null, nowMs)
      ));
    } finally {
      // A transient SQLite failure must not strand future offer transitions.
      this.rearmReleaseTimer();
    }
  }

  rearmReleaseTimer() {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    if (this.destroyed || !this.started) return;
    const deadlineMs = this.store.getNextFreeEggTransitionDeadline(Number(this.now()));
    if (deadlineMs === null) return;
    const delayMs = Math.max(0, deadlineMs - Number(this.now()));
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      this.sweepAndRearm();
    }, delayMs);
    this.releaseTimer.unref?.();
  }

  start() {
    if (this.started) return this;
    this.destroyed = false;
    this.started = true;
    try {
      this.sweepAndRearm();
      return this;
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop() {
    this.started = false;
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    return this;
  }

  destroy() {
    this.destroyed = true;
    return this.stop();
  }

  setConfig(config = {}) {
    const wasEnabled = this.config.freeEggDropsEnabled;
    this.config = this.normalizeConfig(config);
    if (wasEnabled && !this.config.freeEggDropsEnabled) {
      this.cleanupStream({
        streamKey: this.normalizeStreamKey(this.engine?.streamKey)
      });
    } else {
      this.rearmReleaseTimer();
    }
    return { ...this.config };
  }

  normalizeConfig(config = {}) {
    return {
      freeEggDropsEnabled: config.freeEggDropsEnabled !== false,
      freeEggCooldownSeconds: Math.max(
        1,
        Number(config.freeEggCooldownSeconds) || DEFAULT_COOLDOWN_SECONDS
      )
    };
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
module.exports.PUBLIC_WINDOW_MS = PUBLIC_WINDOW_MS;
module.exports.RESERVATION_MS = RESERVATION_MS;
