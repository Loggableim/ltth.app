const { getTemplate, deterministicTemplateId } = require('./catalog');
const { isHeartMeGift } = require('./gift-name');
const EggStageProjector = require('./egg-stage-projector');
const { safeAssetReference } = EggStageProjector;

const ELEMENTS = ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'];
const EGG_COLORS = ['#ef6b45', '#3aaee8', '#54b86d', '#8ecfcb', '#f1ca43', '#a778e2'];
const ACTIVE_INCUBATOR_SLOTS = 3;

const MONSTER_NAMES = [
  'Fizzlet', 'Mossbit', 'Crystaroo', 'Nimblet', 'Pebblin', 'Glowmunk',
  'Wispip', 'Brambleboo', 'Sparkfin', 'Moonkip', 'Flarefox', 'Drizzlet'
];
const PERSONALITIES = [
  'Brave', 'Curious', 'Mischievous', 'Gentle', 'Dramatic', 'Loyal',
  'Dreamy', 'Competitive', 'Cheerful', 'Clever', 'Shy', 'Adventurous'
];

class StreamMonstersEngine {
  constructor({
    store,
    kenneyBuilder = null,
    progression = null,
    collection = null,
    hasBundledAsset = () => true,
    emit = () => {},
    now = () => Date.now(),
    getCommandReference = command => `!${command}`,
    config = {}
  }) {
    this.store = store;
    this.kenneyBuilder = kenneyBuilder;
    this.progression = progression;
    this.collection = collection;
    this.hasBundledAsset = hasBundledAsset;
    this.streamKey = null;
    this.emit = emit;
    this.now = now;
    this.getCommandReference = getCommandReference;
    this.eggStageProjector = new EggStageProjector({ store, now });
    this.config = {
      hatchDurationMs: 90_000,
      eggExpiryMs: 24 * 60 * 60 * 1000,
      chargedHatchMultiplier: 0.75,
      maxUnhatchedEggs: 3,
      autoHatchActiveViewers: true,
      comboWindowMs: 6_000,
      defaultCreatorName: 'Creator',
      ...config
    };
    this.config.maxUnhatchedEggs = ACTIVE_INCUBATOR_SLOTS;
    this.recentGifts = new Map();
  }

  emitAfterCommit(event, payload) {
    this.store.afterCommit(() => this.emit(event, payload));
  }

  projectEggStage(egg) {
    if (!egg || typeof egg !== 'object') return null;
    const projectedEgg = egg.state === 'queued' && egg.queue_position == null
      ? {
          ...egg,
          queue_position: this.store.getQueuedEggs(egg.user_id)
            .find(candidate => candidate.egg_id === egg.egg_id)?.queue_position ?? null
        }
      : egg;
    return this.eggStageProjector.projectEgg(projectedEgg);
  }

  emitEggStageUpdated(egg, reason) {
    const eggStage = this.projectEggStage(egg);
    this.emitAfterCommit('streammonsters:egg_stage_updated', {
      userId: egg.user_id,
      reason,
      eggStage,
      ...this.eggStageProjector.eventIdentity(
        'streammonsters:egg_stage_updated',
        eggStage
      )
    });
    return eggStage;
  }

  describeGift({ giftId, giftName, coinValue = 0, userId = '', eventTimeMs = 0 }) {
    const normalizedGiftId = Number.parseInt(giftId, 10);
    const mapping = this.store.getGiftMapping(normalizedGiftId);
    const mappedElement = mapping?.element || null;
    const element = mappedElement ||
      ELEMENTS[this.hashNumber(`gift:${normalizedGiftId}`) % ELEMENTS.length];
    const index = ELEMENTS.indexOf(element);
    return {
      giftId: normalizedGiftId,
      giftName: String(giftName || `Gift ${normalizedGiftId}`),
      coinValue: Math.max(0, Number.parseInt(mapping?.coin_value ?? coinValue, 10) || 0),
      element,
      eggColor: mapping?.egg_color || EGG_COLORS[index] || null,
      effect: mapping?.effect || 'spawn',
      enabled: Boolean(mapping?.enabled),
      imageUrl: mapping?.image_url || null,
      poolKey: `${element}:standard`
    };
  }

  resolveSpawnGiftElement(gift, { userId, eventTimeMs }) {
    if (gift.element !== 'Random') return gift;
    const element = this.selectRandomElement({
      userId,
      giftId: gift.giftId,
      eventTimeMs
    });
    const index = ELEMENTS.indexOf(element);
    return {
      ...gift,
      element,
      eggColor: gift.eggColor || EGG_COLORS[index],
      poolKey: `${element}:standard`
    };
  }

  processGift(input = {}) {
    return this.store.runInTransaction(() => this.processGiftAtomic(input));
  }

  processGiftAtomic({
    userId,
    displayName = null,
    avatarRef = null,
    giftId,
    giftName,
    coinValue = 0,
    eventKey = null
  }) {
    if (!userId) throw new Error('STREAM_MONSTERS_USER_REQUIRED');
    const createdAtMs = this.now();
    const normalizedEventKey = eventKey ? String(eventKey) : null;
    if (
      normalizedEventKey &&
      !this.store.claimGiftEvent(this.streamKey || 'offline', normalizedEventKey, createdAtMs)
    ) {
      return { type: 'duplicate', eventKey: normalizedEventKey };
    }
    let gift = this.describeGift({
      giftId,
      giftName,
      coinValue,
      userId,
      eventTimeMs: createdAtMs
    });
    if (!gift.enabled) return { type: 'ignored', gift, reason: 'gift_not_selected' };
    const eggs = this.store.getViewerEggs(userId, 'incubating');
    const event = this.getActiveEvent();
    if (gift.effect === 'boost') {
      if (!eggs.length) return { type: 'ignored', gift, reason: 'no_incubating_egg' };
      const egg = this.store.boostOldestEgg(userId, this.calculateBoostMs(gift.coinValue));
      const combo = this.applyGiftCombo(userId, gift, this.now());
      this.store.incrementViewer(userId, 'gifts_sent');
      this.progression?.recordFirstAction(userId, this.streamKey);
      this.store.incrementStreamMetric(this.streamKey, 'egg_boosts');
      if (combo) this.addHype(20, { userId, gift, combo });
      this.recordHeartMeGift(userId, gift, createdAtMs);
      const eggStage = this.projectEggStage(egg);
      this.emitAfterCommit('streammonsters:egg_boosted', {
        userId,
        egg,
        eggStage,
        gift,
        event,
        hint: this.getCommandReference('inventory'),
        ...this.eggStageProjector.eventIdentity(
          'streammonsters:egg_boosted',
          {
            ...eggStage,
            state: `boosted-${Number(egg.boost_ms) || 0}`
          }
        )
      });
      return { type: 'boosted', egg, gift };
    }
    gift = this.resolveSpawnGiftElement(gift, {
      userId,
      eventTimeMs: createdAtMs
    });
    const state = eggs.length >= this.config.maxUnhatchedEggs ? 'queued' : 'incubating';
    const variant = this.store.consumeChargedEgg(this.streamKey, createdAtMs) ? 'charged' : 'standard';
    const hatchDurationMs = this.hatchDurationFor(variant);
    const elementalHourMatch = event?.element === gift.element;
    const initialBoostMs = elementalHourMatch ? Math.min(30_000, hatchDurationMs) : 0;
    const egg = this.store.createEgg({
      userId,
      giftId: gift.giftId,
      giftName: gift.giftName,
      element: gift.element,
      eggColor: gift.eggColor,
      seed: this.seedFor(userId, gift.giftId, createdAtMs),
      createdAtMs,
      hatchDurationMs,
      initialBoostMs,
      readyAtMs: state === 'queued'
        ? null
        : createdAtMs + hatchDurationMs - initialBoostMs,
      expiresAtMs: state === 'queued'
        ? null
        : createdAtMs + hatchDurationMs - initialBoostMs + this.config.eggExpiryMs,
      state,
      queuedAtMs: state === 'queued' ? createdAtMs : null,
      incubatingAtMs: state === 'incubating' ? createdAtMs : null,
      imageUrl: this.createDefaultEggImage(gift, variant),
      variant,
      visualSource: 'egg_asset',
      visualKey: `egg:${gift.element.toLowerCase()}:${variant}`,
      provenance: 'gift',
      displayName,
      avatarRef: safeAssetReference(avatarRef)
    });
    this.store.incrementViewer(userId, 'gifts_sent');
    this.progression?.recordGift(userId, this.streamKey, {
      eventId: normalizedEventKey || egg.egg_id
    });
    this.store.incrementStreamMetric(this.streamKey, 'eggs_spawned');
    const combo = this.applyGiftCombo(userId, gift, createdAtMs);
    this.addHype(10 + (combo ? 20 : 0) + (elementalHourMatch ? 10 : 0), {
      userId,
      gift,
      combo,
      elementalHourMatch
    });
    this.recordHeartMeGift(userId, gift, createdAtMs);
    this.emitAfterCommit('streammonsters:egg_spawned', {
      userId,
      egg,
      gift,
      event,
      hint: this.getCommandReference('inventory')
    });
    const eggStage = this.projectEggStage(egg);
    this.emitAfterCommit('streammonsters:egg_landed', {
      eggStage,
      ...this.eggStageProjector.eventIdentity('streammonsters:egg_landed', eggStage)
    });
    return { type: 'spawned', egg, gift };
  }

  createFreeEgg({
    userId,
    createdAtMs = this.now(),
    offerId = null,
    element: offeredElement = null,
    displayName = null,
    avatarRef = null
  }) {
    if (!userId) throw new Error('STREAM_MONSTERS_USER_REQUIRED');
    const giftId = 0;
    const element = offeredElement || this.selectRandomElement({ giftId });
    const elementIndex = ELEMENTS.indexOf(element);
    const eggs = this.store.getViewerEggs(userId, 'incubating');
    const state = eggs.length >= this.config.maxUnhatchedEggs ? 'queued' : 'incubating';
    const hatchDurationMs = this.hatchDurationFor('standard');
    const egg = this.store.createEgg({
      userId,
      giftId,
      giftName: 'Free Egg Drop',
      element,
      eggColor: EGG_COLORS[elementIndex],
      seed: this.seedFor(userId, `free:${element}`, createdAtMs),
      createdAtMs,
      hatchDurationMs,
      initialBoostMs: 0,
      readyAtMs: state === 'queued' ? null : createdAtMs + hatchDurationMs,
      expiresAtMs: state === 'queued'
        ? null
        : createdAtMs + hatchDurationMs + this.config.eggExpiryMs,
      state,
      queuedAtMs: state === 'queued' ? createdAtMs : null,
      incubatingAtMs: state === 'incubating' ? createdAtMs : null,
      imageUrl: this.createDefaultEggImage({ element }, 'standard'),
      variant: 'standard',
      visualSource: 'egg_asset',
      visualKey: `egg:${element.toLowerCase()}:standard`,
      provenance: 'free',
      freeOfferId: offerId,
      displayName,
      avatarRef: safeAssetReference(avatarRef)
    });
    this.store.incrementStreamMetric(this.streamKey, 'eggs_spawned');
    return egg;
  }

  hatchReadyEggs(userId) {
    this.markReadyEggs();
    const hatched = [];
    while (this.store.getViewerEggs(userId, 'ready').length) {
      const visibleEggs = this.store.getViewerEggs(userId).filter(egg => egg.state !== 'hatched');
      const readyIndex = visibleEggs.findIndex(egg => egg.state === 'ready');
      hatched.push(this.hatchEgg(userId, readyIndex + 1));
    }
    return hatched;
  }

  autoHatchReadyEggs({ isViewerActive } = {}) {
    if (
      this.config.autoHatchActiveViewers === false ||
      typeof isViewerActive !== 'function'
    ) {
      return [];
    }
    const readyEggs = this.store.getReadyEggs?.() || [];
    const activeViewerIds = [...new Set(
      readyEggs
        .map(egg => egg.user_id)
        .filter(userId => isViewerActive(userId))
    )];
    const hatched = [];
    for (const userId of activeViewerIds) {
      while (this.store.getViewerEggs(userId, 'ready').length) {
        try {
          hatched.push(this.hatchEgg(userId, null, { autoHatch: true }));
        } catch (error) {
          if (
            error?.code === 'STREAM_MONSTERS_EGG_NOT_FOUND' ||
            error?.code === 'STREAM_MONSTERS_EGG_NOT_READY'
          ) {
            break;
          }
          throw error;
        }
      }
    }
    return hatched;
  }

  markReadyEggs() {
    const nowMs = this.now();
    let ready = [];
    this.store.runInImmediateTransaction(() => {
      ready = this.store.markReadyEggs(nowMs);
      ready.forEach(egg => {
        const eggStage = this.projectEggStage(egg);
        this.emitAfterCommit('streammonsters:egg_ready', {
          userId: egg.user_id,
          egg,
          eggStage,
          hint: `${this.getCommandReference('hatch')} [slot]`,
          ...this.eggStageProjector.eventIdentity('streammonsters:egg_ready', eggStage)
        });
      });
      const expired = this.store.expireReadyEggs(nowMs, this.config.eggExpiryMs);
      expired.forEach(egg => {
        const eggStage = this.projectEggStage(egg);
        this.emitAfterCommit('streammonsters:egg_expired', {
          userId: egg.user_id,
          egg,
          eggStage,
          ...this.eggStageProjector.eventIdentity(
            'streammonsters:egg_expired',
            eggStage
          )
        });
        this.emitEggStageUpdated(egg, 'expired');
      });
      const promoted = this.store.promoteQueuedEggs(
        nowMs,
        this.config.maxUnhatchedEggs,
        this.config.eggExpiryMs
      );
      promoted.forEach(egg => this.emitEggStageUpdated(egg, 'promoted'));
    });
    return ready;
  }

  estimateQueuedEggWait(userId, targetEgg, {
    nowMs = this.now(),
    queuedEggs = null
  } = {}) {
    const currentMs = Number(nowMs) || 0;
    const durationMs = egg => Math.max(
      0,
      (Number(egg?.hatch_duration_ms) || 0) -
        (Number(egg?.boost_ms) || 0)
    );
    const activeReadyAtMs = egg => {
      if (
        egg?.ready_at_ms !== null &&
        egg?.ready_at_ms !== undefined &&
        Number.isFinite(Number(egg.ready_at_ms))
      ) {
        return Math.max(currentMs, Number(egg.ready_at_ms));
      }
      const startedAtMs = Number(
        egg?.incubating_at_ms ?? egg?.created_at_ms
      ) || currentMs;
      return Math.max(currentMs, startedAtMs + durationMs(egg));
    };
    const lanes = this.store.getViewerEggs(userId, 'incubating')
      .map(activeReadyAtMs)
      .sort((left, right) => left - right)
      .slice(0, ACTIVE_INCUBATOR_SLOTS);
    while (lanes.length < ACTIVE_INCUBATOR_SLOTS) lanes.push(currentMs);

    const queue = Array.isArray(queuedEggs)
      ? queuedEggs
      : this.store.getQueuedEggs(userId);
    for (const queuedEgg of queue) {
      lanes.sort((left, right) => left - right);
      const availableAtMs = Math.max(currentMs, lanes.shift() ?? currentMs);
      const readyAtMs = availableAtMs + durationMs(queuedEgg);
      lanes.push(readyAtMs);
      if (queuedEgg.egg_id === targetEgg?.egg_id) {
        return {
          readyAtMs,
          remainingMs:Math.max(0, readyAtMs - currentMs),
          estimated:true
        };
      }
    }
    return null;
  }

  hatchEgg(userId, slot = null, { autoHatch = false } = {}) {
    const monster = this.store.runInImmediateTransaction(() => {
      const visibleEggs = this.store.getViewerEggs(userId)
        .filter(egg => ['incubating', 'queued', 'ready'].includes(egg.state));
      const hasExplicitSlot = slot !== null &&
        slot !== undefined &&
        String(slot).trim() !== '';
      const index = hasExplicitSlot
        ? Math.max(0, Number.parseInt(slot, 10) - 1)
        : visibleEggs
          .map((egg, visibleIndex) => ({ egg, visibleIndex }))
          .filter(entry => entry.egg.state === 'ready')
          .sort((left, right) => (
            (Number(left.egg.ready_at_ms) || 0) - (Number(right.egg.ready_at_ms) || 0) ||
            (Number(left.egg.created_at_ms) || 0) - (Number(right.egg.created_at_ms) || 0) ||
            String(left.egg.egg_id).localeCompare(String(right.egg.egg_id))
          ))[0]?.visibleIndex ?? 0;
      const egg = visibleEggs[index];
      if (!egg) {
        const error = new Error('STREAM_MONSTERS_EGG_NOT_FOUND');
        error.code = 'STREAM_MONSTERS_EGG_NOT_FOUND';
        error.slot = index + 1;
        throw error;
      }
      if (egg.state !== 'ready') {
        const currentMs = this.now();
        const queuedEggs = egg.state === 'queued'
          ? this.store.getQueuedEggs(userId)
          : [];
        const queued = queuedEggs.find(entry => entry.egg_id === egg.egg_id);
        const queuedWait = queued
          ? this.estimateQueuedEggWait(userId, egg, {
              nowMs:currentMs,
              queuedEggs
            })
          : null;
        const readyAtMs = queuedWait?.readyAtMs ?? egg.ready_at_ms;
        const error = new Error('STREAM_MONSTERS_EGG_NOT_READY');
        error.code = 'STREAM_MONSTERS_EGG_NOT_READY';
        error.wait = {
          slot: index + 1,
          state: egg.state,
          readyAtMs,
          remainingMs: readyAtMs === null
            ? null
            : Math.max(0, readyAtMs - currentMs),
          ...(queuedWait ? { estimated:true } : {}),
          ...(queued ? {
            queuePosition: Number(queued.queue_position) || 1,
            queue_position: Number(queued.queue_position) || 1
          } : {})
        };
        throw error;
      }
      this.emitAfterCommit('streammonsters:hatch_started', {
        userId,
        egg,
        slot: index + 1,
        ...(autoHatch ? { autoHatch: true } : {})
      });
      const currentMs = this.now();
      const reservation = this.collection?.reserveTemplateForEgg(egg);
      const monster = this.store.createMonsterFromReadyEgg(
        egg,
        this.createMonster(egg, currentMs, reservation?.template),
        currentMs
      );
      const removedEggStage = this.eggStageProjector.projectEgg({
        ...egg,
        state: 'hatched'
      });
      this.store.incrementViewer(userId, 'eggs_hatched');
      this.store.incrementStreamMetric(this.streamKey, 'hatches');
      this.progression?.recordHatch(userId, this.streamKey, monster);
      this.collection?.recordHatch(monster, this.streamKey);
      this.progression?.recordCollection(
        userId,
        new Set(this.store.getViewerMonsters(userId).map(item => item.element)).size,
        this.streamKey
      );
      this.emitAfterCommit('streammonsters:egg_hatched', {
        userId,
        egg,
        monster,
        ...(autoHatch ? { autoHatch: true } : {})
      });
      this.emitAfterCommit('streammonsters:egg_stage_removed', {
        eggStage: removedEggStage,
        ...this.eggStageProjector.eventIdentity(
          'streammonsters:egg_stage_removed',
          removedEggStage
        )
      });
      return monster;
    });
    try {
      this.collection?.fuseDuplicates?.({
        userId,
        templateId: monster.template_id,
        preferredMonsterId: monster.monster_id,
        triggerType: 'hatch',
        triggerId: `hatch:${monster.monster_id}`
      });
    } catch (_) {
      // The hatch is already committed. A later contact or manual trigger can
      // safely retry the pending pair without misreporting the hatch as failed.
    }
    return monster;
  }

  calculateBoostMs(coinValue) {
    const diamonds = Math.max(0, Number(coinValue) || 0);
    const base = diamonds >= 1000 ? 120_000 : (
      diamonds >= 100 ? 60_000 : (diamonds >= 10 ? 30_000 : 15_000)
    );
    return base;
  }

  applyGiftCombo(userId, gift, timestamp) {
    const streamKey = this.streamKey || 'offline';
    const previous = this.recentGifts.get(streamKey);
    this.recentGifts.set(streamKey, { giftId: gift.giftId, timestamp, userId });
    if (!previous || previous.giftId === gift.giftId || timestamp - previous.timestamp > this.config.comboWindowMs) return false;
    this.emitAfterCommit('streammonsters:gift_combo', {
      userId,
      gift,
      previousGiftId: previous.giftId,
      previousUserId: previous.userId,
      hypeBonus: 20
    });
    return true;
  }

  setStreamKey(streamKey) {
    this.streamKey = streamKey || null;
  }

  getActiveEvent() {
    return this.streamKey ? this.store.getStreamEvent(this.streamKey) : null;
  }

  createMonster(egg, createdAtMs, selectedTemplate = null) {
    const statNames = ['vitality', 'might', 'guard', 'agility'];
    const values = [5, 5, 5, 5];
    for (let point = 0; point < 8; point += 1) {
      values[this.hashNumber(`${egg.seed}:stat:${point}`) % values.length] += 1;
    }
    const template = selectedTemplate || getTemplate(deterministicTemplateId(egg.element, egg.seed));
    const name = template?.name || MONSTER_NAMES[this.hashNumber(`${egg.seed}:name`) % MONSTER_NAMES.length];
    const personality = PERSONALITIES[this.hashNumber(`${egg.seed}:personality`) % PERSONALITIES.length];
    const visual = template && this.collection
      ? this.collection.selectVisual({
        template,
        egg,
        kenneyBuilder: this.kenneyBuilder,
        hasBundledAsset: this.hasBundledAsset
      })
      : null;
    return {
      name,
      templateId: template?.templateId || null,
      personality,
      rarity: egg.variant === 'charged' ? 'Charged' : 'Standard',
      stats: Object.fromEntries(statNames.map((stat, index) => [stat, values[index]])),
      imageUrl: visual?.imageUrl || egg.image_url,
      visualSource: visual?.visualSource || 'egg_asset',
      visualKey: visual?.visualKey || egg.visual_key,
      assetVersion: visual?.assetVersion || null,
      createdAtMs
    };
  }

  hatchDurationFor(variant) {
    if (variant !== 'charged') return this.config.hatchDurationMs;
    return Math.max(1, Math.round(this.config.hatchDurationMs * this.config.chargedHatchMultiplier));
  }

  addHype(points, context = {}) {
    const normalizedPoints = Math.max(0, Number(points) || 0);
    const previous = this.store.getStreamHype(this.streamKey);
    const total = previous.points + normalizedPoints;
    const milestones = [];
    const firstThreshold = (Math.floor(previous.points / 25) + 1) * 25;
    for (let threshold = firstThreshold; threshold <= total; threshold += 25) {
      milestones.push({
        milestone: threshold % 100 || 100,
        cycle: Math.floor((threshold - 1) / 100)
      });
    }
    const hype = this.store.addStreamHype(this.streamKey, normalizedPoints, this.now());
    this.emitAfterCommit('streammonsters:hype_changed', {
      streamKey: this.streamKey,
      hype,
      ...context
    });
    milestones.forEach(({ milestone, cycle }) => {
      this.emitAfterCommit('streammonsters:hype_milestone', {
        streamKey: this.streamKey,
        milestone,
        cycle,
        hype,
        ...context
      });
    });
    return hype;
  }

  seedFor(userId, giftId, createdAtMs) {
    return `${this.hashNumber(`${userId}:${giftId}:${createdAtMs}`).toString(16)}-${createdAtMs}`;
  }

  recordHeartMeGift(userId, gift, atMs) {
    if (!this.collection || !isHeartMeGift(gift?.giftName)) return null;
    const chain = this.collection.recordHeartMe({ streamKey: this.streamKey || 'offline', userId, atMs });
    if (chain.hypeAward) this.addHype(chain.hypeAward, { userId, gift, heartChain: chain });
    return chain;
  }

  selectRandomElement({ giftId }) {
    const streamKey = this.streamKey || 'offline';
    return this.store.reserveElement(streamKey, giftId, cycle => (
      ELEMENTS
        .map(element => ({
          element,
          score: this.hashNumber(`${streamKey}:${giftId}:${cycle}:${element}`)
        }))
        .sort((left, right) => left.score - right.score || left.element.localeCompare(right.element))
        .map(entry => entry.element)
    ));
  }

  hashNumber(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  createDefaultEggImage(gift, variant = 'standard') {
    return `/plugins/streamalchemy/assets/eggs/${gift.element.toLowerCase()}-${variant}.png`;
  }
}

module.exports = StreamMonstersEngine;
module.exports.ELEMENTS = ELEMENTS;
module.exports.EGG_COLORS = EGG_COLORS;
