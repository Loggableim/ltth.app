const { createHash } = require('crypto');

function boundedText(value, maximum = 96) {
  if (value === null || value === undefined) return null;
  const normalized = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function publicViewerName(value) {
  const candidate = boundedText(value, 64);
  const normalized = candidate?.replace(/^@+/, '');
  if (
    !normalized ||
    /^unknown$/i.test(normalized) ||
    /^\d{8,}$/.test(normalized) ||
    /^tiktok:\d+$/i.test(normalized)
  ) {
    return null;
  }
  return candidate;
}

function safeAssetReference(value) {
  const reference = boundedText(value, 512);
  if (!reference) return null;
  const assetPrefix = '/plugins/streamalchemy/assets/';
  if (reference.startsWith(assetPrefix)) {
    const relative = reference.slice(assetPrefix.length);
    const segments = relative.split('/');
    if (
      !relative ||
      reference.includes('\\') ||
      reference.includes('%') ||
      segments.some(segment => (
        !segment ||
        segment === '.' ||
        segment === '..' ||
        !/^[a-z0-9._-]+$/i.test(segment)
      ))
    ) {
      return null;
    }
    return reference;
  }
  return /^\/api\/streammonsters\/avatar\/[a-z0-9_-]{16,1024}$/i.test(reference)
    ? reference
    : null;
}

class EggStageProjector {
  constructor({ store, now = () => Date.now() } = {}) {
    this.store = store;
    this.now = now;
  }

  visualId(kind, id) {
    const opaque = createHash('sha256')
      .update(`${kind}:${String(id || '')}`)
      .digest('hex')
      .slice(0, 24);
    return `egg-${opaque}`;
  }

  eventIdentity(eventType, eggStage) {
    const visualId = boundedText(eggStage?.visualId, 64);
    const state = boundedText(eggStage?.state, 24) || 'unknown';
    if (!visualId || !/^egg-[a-f0-9]{24}$/i.test(visualId)) {
      throw new Error('STREAM_MONSTERS_EGG_STAGE_VISUAL_ID_REQUIRED');
    }
    const opaque = value => createHash('sha256')
      .update(String(value))
      .digest('hex')
      .slice(0, 32);
    return {
      eventId: `sm-${opaque(`${eventType}:${visualId}:${state}`)}`,
      correlationId: `sm-${opaque(`egg-stage:${visualId}`)}`
    };
  }

  projectEgg(egg = null) {
    if (!egg || typeof egg !== 'object') return null;
    const provenance = ['gift', 'free', 'legacy'].includes(egg.provenance)
      ? egg.provenance
      : 'legacy';
    const identity = provenance === 'free' && egg.free_offer_id
      ? ['offer', egg.free_offer_id]
      : ['egg', egg.egg_id ?? egg.eggId];
    return {
      visualId: this.visualId(...identity),
      provenance,
      element: boundedText(egg.element, 24),
      variant: boundedText(egg.variant, 24) || 'standard',
      state: boundedText(egg.state, 24) || 'incubating',
      displayName: [
        egg.display_name,
        egg.displayName,
        this.store?.getViewerDisplayName?.(egg.user_id ?? egg.userId)
      ].map(publicViewerName).find(Boolean) || 'Viewer',
      avatarRef: safeAssetReference(egg.avatar_ref ?? egg.avatarRef),
      imageUrl: safeAssetReference(egg.image_url ?? egg.imageUrl),
      timing: {
        landedAtMs: finiteNumber(egg.created_at_ms ?? egg.createdAtMs),
        readyAtMs: finiteNumber(egg.ready_at_ms ?? egg.readyAtMs),
        expiresAtMs: finiteNumber(egg.expires_at_ms ?? egg.expiresAtMs)
      },
      queuePosition: finiteNumber(egg.queue_position ?? egg.queuePosition),
      adoptionStatus: 'owned',
      adoptable: false
    };
  }

  projectOffer(offer = null) {
    if (!offer || typeof offer !== 'object') return null;
    const state = boundedText(offer.stage_state ?? offer.status, 24) || 'reserved';
    return {
      visualId: this.visualId('offer', offer.offer_id ?? offer.offerId),
      provenance: 'free',
      element: boundedText(offer.element, 24),
      variant: boundedText(offer.variant, 24) || 'standard',
      state,
      displayName: publicViewerName(offer.source_display_name) || 'Viewer',
      avatarRef: safeAssetReference(offer.source_avatar_ref),
      imageUrl: safeAssetReference(offer.image_url),
      timing: {
        landedAtMs: finiteNumber(offer.offered_at_ms),
        publicAtMs: finiteNumber(offer.reserved_until_ms),
        claimedAtMs: finiteNumber(offer.claimed_at_ms),
        expiresAtMs: null
      },
      queuePosition: null,
      adoptionStatus: state,
      adoptable: state === 'public'
    };
  }

  snapshot(streamKey) {
    const eggs = this.store?.getEggStageEggs?.() || [];
    const offers = this.store?.getEggStageOffers?.(streamKey) || [];
    return [
      ...eggs.map(egg => this.projectEgg(egg)),
      ...offers.map(offer => this.projectOffer(offer))
    ].filter(Boolean).sort((left, right) => (
      (left.timing.landedAtMs || 0) - (right.timing.landedAtMs || 0) ||
      left.visualId.localeCompare(right.visualId)
    ));
  }
}

module.exports = EggStageProjector;
module.exports.publicViewerName = publicViewerName;
module.exports.safeAssetReference = safeAssetReference;
