const { deterministicTemplate } = require('./catalog');

const ELEMENTS = ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'];
const EGG_COLORS = ['#ef6b45', '#3aaee8', '#54b86d', '#8ecfcb', '#f1ca43', '#a778e2'];

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
    generationPool = null,
    artPool = null,
    kenneyBuilder = null,
    hasBundledAsset = null,
    progression = null,
    emit = () => {},
    now = () => Date.now(),
    config = {}
  }) {
    this.store = store;
    this.generationPool = generationPool;
    this.artPool = artPool;
    this.kenneyBuilder = kenneyBuilder;
    this.hasBundledAsset = hasBundledAsset;
    this.progression = progression;
    this.streamKey = null;
    this.emit = emit;
    this.now = now;
    this.config = {
      hatchDurationMs: 5 * 60 * 1000,
      chargedHatchMultiplier: 0.75,
      maxUnhatchedEggs: 3,
      comboWindowMs: 6_000,
      defaultCreatorName: 'Creator',
      visualPack: 'furry',
      ...config
    };
    this.recentGifts = new Map();
  }

  describeGift({ giftId, giftName, coinValue = 0, userId = null, eventTimeMs = null }) {
    const normalizedGiftId = Number.parseInt(giftId, 10);
    const mapping = this.store.getGiftMapping(normalizedGiftId);
    const mappedElement = mapping?.element || null;
    const element = mappedElement === 'Random'
      ? this.selectRandomElement({
        userId,
        giftId: normalizedGiftId,
        eventTimeMs: eventTimeMs ?? this.now()
      })
      : (mappedElement || ELEMENTS[this.hashNumber(`gift:${normalizedGiftId}`) % ELEMENTS.length]);
    const index = ELEMENTS.indexOf(element);
    return {
      giftId: normalizedGiftId,
      giftName: String(giftName || `Gift ${normalizedGiftId}`),
      coinValue: Math.max(0, Number.parseInt(mapping?.coin_value ?? coinValue, 10) || 0),
      element,
      eggColor: mappedElement === 'Random' ? EGG_COLORS[index] : (mapping?.egg_color || EGG_COLORS[index]),
      effect: mapping?.effect || 'spawn',
      enabled: Boolean(mapping?.enabled),
      imageUrl: mapping?.image_url || null,
      poolKey: `${element}:standard`
    };
  }

  processGift({ userId, giftId, giftName, coinValue = 0, eventTimeMs = null }) {
    if (!userId) throw new Error('STREAM_MONSTERS_USER_REQUIRED');
    this.expireUnhatchedEggs();
    const normalizedEventTimeMs = Number(eventTimeMs);
    const createdAtMs = eventTimeMs !== null && Number.isFinite(normalizedEventTimeMs)
      ? normalizedEventTimeMs
      : this.now();
    const gift = this.describeGift({
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
      this.emit('streammonsters:egg_boosted', { userId, egg, gift, event, hint: '!inventory' });
      return { type: 'boosted', egg, gift };
    }
    if (eggs.length >= this.config.maxUnhatchedEggs) {
      return { type: 'ignored', gift, reason: 'incubators_full' };
    }

    const variant = this.store.consumeChargedEgg(this.streamKey, createdAtMs) ? 'charged' : 'standard';
    const hatchDurationMs = this.hatchDurationFor(variant);
    const egg = this.store.createEgg({
      userId,
      giftId: gift.giftId,
      giftName: gift.giftName,
      element: gift.element,
      eggColor: gift.eggColor,
      seed: this.seedFor(userId, gift.giftId, createdAtMs),
      createdAtMs,
      hatchDurationMs,
      initialBoostMs: 0,
      imageUrl: this.createDefaultEggImage(gift, variant),
      variant,
      visualSource: 'egg_asset',
      visualKey: `egg:${gift.element.toLowerCase()}:${variant}`
    });
    this.store.incrementViewer(userId, 'gifts_sent');
    this.progression?.recordGift(userId, this.streamKey);
    this.store.incrementStreamMetric(this.streamKey, 'eggs_spawned');
    const combo = this.applyGiftCombo(userId, gift, createdAtMs);
    this.addHype(10 + (combo ? 20 : 0), { userId, gift, combo });
    this.emit('streammonsters:egg_spawned', { userId, egg, gift, event, hint: '!inventory' });
    return { type: 'spawned', egg, gift };
  }

  hatchReadyEggs(userId) {
    this.markReadyEggs();
    const hatched = [];
    while (this.store.getViewerHatchableEggs(userId).some(egg => egg.state === 'ready')) {
      const visibleEggs = this.store.getViewerHatchableEggs(userId);
      const readyIndex = visibleEggs.findIndex(egg => egg.state === 'ready');
      hatched.push(this.hatchEgg(userId, readyIndex + 1));
    }
    return hatched;
  }

  markReadyEggs() {
    this.expireUnhatchedEggs();
    const ready = this.store.markReadyEggs(this.now());
    ready.forEach(egg => {
      this.emit('streammonsters:egg_ready', {
        userId: egg.user_id,
        egg,
        hint: '!hatch [slot]'
      });
    });
    return ready;
  }

  hatchEgg(userId, slot = 1) {
    this.expireUnhatchedEggs();
    const visibleEggs = this.store.getViewerHatchableEggs(userId);
    const index = Math.max(0, Number.parseInt(slot, 10) - 1);
    const egg = visibleEggs[index];
    if (!egg || egg.state !== 'ready') throw new Error('STREAM_MONSTERS_EGG_NOT_READY');
    this.emit('streammonsters:hatch_started', { userId, egg, slot: index + 1 });
    const currentMs = this.now();
    const monster = this.store.createMonsterFromEgg(egg, this.createMonster(egg, currentMs));
    this.store.incrementViewer(userId, 'eggs_hatched');
    this.store.incrementStreamMetric(this.streamKey, 'hatches');
    this.progression?.recordHatch(userId, this.streamKey, monster);
    this.progression?.recordCollection(
      userId,
      new Set(this.store.getViewerMonsters(userId).map(item => item.element)).size,
      this.streamKey
    );
    this.emit('streammonsters:egg_hatched', { userId, egg, monster });
    return monster;
  }

  expireUnhatchedEggs() {
    return this.store.expireUnhatchedEggs(this.now());
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
    this.emit('streammonsters:gift_combo', {
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

  createMonster(egg, createdAtMs) {
    const statNames = ['vitality', 'might', 'guard', 'agility'];
    const values = [5, 5, 5, 5];
    for (let point = 0; point < 8; point += 1) {
      values[this.hashNumber(`${egg.seed}:stat:${point}`) % values.length] += 1;
    }
    const name = MONSTER_NAMES[this.hashNumber(`${egg.seed}:name`) % MONSTER_NAMES.length];
    const personality = PERSONALITIES[this.hashNumber(`${egg.seed}:personality`) % PERSONALITIES.length];
    const template = deterministicTemplate(egg.element, egg.seed);
    const visualPack = this.config.visualPack || 'furry';
    const bundledFurry = template && (
      typeof this.hasBundledAsset !== 'function' || this.hasBundledAsset(template)
    ) ? {
        publicUrl: template.assetPath,
        visualSource: 'furry',
        visualKey: `furry:${template.templateId}`
      } : null;
    const skin = visualPack === 'art_lab'
      ? this.artPool?.consume?.(egg.element, egg.variant)
      : null;
    const shouldBuildKenney = visualPack === 'kenney' || (!skin && !bundledFurry);
    const fallback = shouldBuildKenney
      ? this.kenneyBuilder?.build?.({ seed: egg.seed, element: egg.element })
      : null;
    const visual = skin || (visualPack === 'kenney' ? fallback : null) || bundledFurry || fallback;
    return {
      name,
      personality,
      rarity: egg.variant === 'charged' ? 'Charged' : 'Standard',
      stats: Object.fromEntries(statNames.map((stat, index) => [stat, values[index]])),
      imageUrl: visual?.image_url || visual?.publicUrl || egg.image_url,
      visualSource: skin ? 'ai' : (visual?.visualSource || 'egg_asset'),
      visualKey: visual?.visual_key || visual?.visualKey || egg.visual_key,
      templateId: template?.templateId || null,
      createdAtMs
    };
  }

  hatchDurationFor(variant) {
    if (variant !== 'charged') return this.config.hatchDurationMs;
    return Math.max(1, Math.round(this.config.hatchDurationMs * this.config.chargedHatchMultiplier));
  }

  addHype(points, context = {}) {
    const hype = this.store.addStreamHype(this.streamKey, points, this.now());
    this.emit('streammonsters:hype_changed', {
      streamKey: this.streamKey,
      hype,
      ...context
    });
    return hype;
  }

  seedFor(userId, giftId, createdAtMs) {
    return `${this.hashNumber(`${userId}:${giftId}:${createdAtMs}`).toString(16)}-${createdAtMs}`;
  }

  selectRandomElement({ userId, giftId, eventTimeMs }) {
    const value = `${this.streamKey || 'offline'}:${userId || ''}:${giftId}:${eventTimeMs}`;
    return ELEMENTS[this.hashNumber(value) % ELEMENTS.length];
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
