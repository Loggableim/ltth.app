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
      hatchDurationMs: 2 * 60 * 1000,
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
      this.emitAfterCommit('streammonsters:egg_boosted', {
        userId,
        egg,
        gift,
        event,
        hint: this.getCommandReference('inventory')
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
    this.progression?.recordGift(userId, this.streamKey);
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
    const eggStage = this.eggStageProjector.projectEgg(egg);
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
        const eggStage = this.eggStageProjector.projectEgg(egg);
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
        this.emitAfterCommit('streammonsters:egg_expired', {
          userId: egg.user_id,
          egg
        });
        const eggStage = this.eggStageProjector.projectEgg(egg);
        this.emitAfterCommit('streammonsters:egg_stage_removed', {
          eggStage,
          ...this.eggStageProjector.eventIdentity(
            'streammonsters:egg_stage_removed',
            eggStage
          )
        });
      });
      this.store.promoteQueuedEggs(
        nowMs,
        this.config.maxUnhatchedEggs,
        this.config.eggExpiryMs
      );
    });
    return ready;
  }

  hatchEgg(userId, slot = null, { autoHatch = false } = {}) {
    return this.store.runInTransaction(() => {
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
        const queued = egg.state === 'queued'
          ? this.store.getQueuedEggs(userId).find(entry => entry.egg_id === egg.egg_id)
          : null;
        const error = new Error('STREAM_MONSTERS_EGG_NOT_READY');
        error.code = 'STREAM_MONSTERS_EGG_NOT_READY';
        error.wait = {
          slot: index + 1,
          state: egg.state,
          readyAtMs: egg.ready_at_ms,
          remainingMs: egg.ready_at_ms === null
            ? null
            : Math.max(0, egg.ready_at_ms - this.now()),
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
      const monster = this.store.createMonsterFromEgg(egg, this.createMonster(egg, currentMs, reservation?.template));
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
