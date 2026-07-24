const { createHash } = require('crypto');
const { getTemplate, deterministicTemplateId } = require('./catalog');
const { isHeartMeGift } = require('./gift-name');

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
    progression = null,
    collection = null,
    hasBundledAsset = () => true,
    emit = () => {},
    now = () => Date.now(),
    config = {}
  }) {
    this.store = store;
    this.generationPool = generationPool;
    this.artPool = artPool;
    this.kenneyBuilder = kenneyBuilder;
    this.progression = progression;
    this.collection = collection;
    this.hasBundledAsset = hasBundledAsset;
    this.streamKey = null;
    this.emit = emit;
    this.now = now;
    this.config = {
      hatchDurationMs: 2 * 60 * 1000,
      chargedHatchMultiplier: 0.75,
      maxUnhatchedEggs: 3,
      comboWindowMs: 6_000,
      defaultCreatorName: 'Creator',
      ...config
    };
    this.recentGifts = new Map();
  }

  describeGift({ giftId, giftName, coinValue = 0, userId = '', eventTimeMs = 0 }) {
    const normalizedGiftId = Number.parseInt(giftId, 10);
    const mapping = this.store.getGiftMapping(normalizedGiftId);
    const mappedElement = mapping?.element || null;
    const element = mappedElement === 'Random'
      ? this.selectRandomElement({ userId, giftId: normalizedGiftId, eventTimeMs })
      : (mappedElement || ELEMENTS[this.hashNumber(`gift:${normalizedGiftId}`) % ELEMENTS.length]);
    const index = ELEMENTS.indexOf(element);
    return {
      giftId: normalizedGiftId,
      giftName: String(giftName || `Gift ${normalizedGiftId}`),
      coinValue: Math.max(0, Number.parseInt(mapping?.coin_value ?? coinValue, 10) || 0),
      element,
      eggColor: mapping?.egg_color || EGG_COLORS[index],
      effect: mapping?.effect || 'spawn',
      enabled: Boolean(mapping?.enabled),
      imageUrl: mapping?.image_url || null,
      poolKey: `${element}:standard`
    };
  }

  processGift({ userId, giftId, giftName, coinValue = 0 }) {
    if (!userId) throw new Error('STREAM_MONSTERS_USER_REQUIRED');
    const createdAtMs = this.now();
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
      this.recordHeartMeGift(userId, gift, createdAtMs);
      this.emit('streammonsters:egg_boosted', { userId, egg, gift, event, hint: '!inventory' });
      return { type: 'boosted', egg, gift };
    }
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
      state,
      queuedAtMs: state === 'queued' ? createdAtMs : null,
      incubatingAtMs: state === 'incubating' ? createdAtMs : null,
      imageUrl: this.createDefaultEggImage(gift, variant),
      variant,
      visualSource: 'egg_asset',
      visualKey: `egg:${gift.element.toLowerCase()}:${variant}`
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
    this.emit('streammonsters:egg_spawned', { userId, egg, gift, event, hint: '!inventory' });
    return { type: 'spawned', egg, gift };
  }

  adoptStarter(userId) {
    if (!userId) throw new Error('STREAM_MONSTERS_USER_REQUIRED');
    const elementIndex = this.hashNumber(`starter:${userId}`) % ELEMENTS.length;
    const element = ELEMENTS[elementIndex];
    const eggId = `starter-${createHash('sha256').update(String(userId)).digest('hex').slice(0, 32)}`;
    const claimedAtMs = this.now();
    const result = this.store.claimStarterEgg({
      eggId,
      userId,
      giftId: 0,
      giftName: 'Starter Egg',
      element,
      eggColor: EGG_COLORS[elementIndex],
      seed: `starter:${createHash('sha256').update(`streammonsters:${userId}`).digest('hex')}`,
      createdAtMs: claimedAtMs,
      claimedAtMs,
      hatchDurationMs: 60_000,
      initialBoostMs: 0,
      imageUrl: this.createDefaultEggImage({ element }, 'standard'),
      variant: 'standard',
      visualSource: 'egg_asset',
      visualKey: `egg:${element.toLowerCase()}:standard`
    });
    if (result.claimed) {
      this.emit('streammonsters:starter_claimed', {
        userId,
        egg: result.egg,
        hint: '!eggs'
      });
    }
    return result;
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

  markReadyEggs() {
    const ready = this.store.markReadyEggs(this.now());
    ready.forEach(egg => {
      this.emit('streammonsters:egg_ready', {
        userId: egg.user_id,
        egg,
        hint: '!hatch [slot]'
      });
    });
    this.store.promoteQueuedEggs(this.now(), this.config.maxUnhatchedEggs);
    return ready;
  }

  hatchEgg(userId, slot = 1) {
    const visibleEggs = this.store.getViewerEggs(userId).filter(egg => egg.state !== 'hatched');
    const index = Math.max(0, Number.parseInt(slot, 10) - 1);
    const egg = visibleEggs[index];
    if (!egg || egg.state !== 'ready') throw new Error('STREAM_MONSTERS_EGG_NOT_READY');
    this.emit('streammonsters:hatch_started', { userId, egg, slot: index + 1 });
    const currentMs = this.now();
    const reservation = this.collection?.reserveTemplateForEgg(egg);
    const monster = this.store.createMonsterFromEgg(egg, this.createMonster(egg, currentMs, reservation?.template));
    this.store.incrementViewer(userId, 'eggs_hatched');
    this.store.incrementStreamMetric(this.streamKey, 'hatches');
    this.progression?.recordHatch(userId, this.streamKey, monster);
    this.collection?.recordHatch(monster, this.streamKey);
    this.progression?.recordCollection(
      userId,
      new Set(this.store.getViewerMonsters(userId).map(item => item.element)).size,
      this.streamKey
    );
    this.emit('streammonsters:egg_hatched', { userId, egg, monster });
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
        visualPack: this.config.visualPack || 'furry',
        artPool: this.artPool,
        kenneyBuilder: this.kenneyBuilder,
        hasBundledAsset: this.hasBundledAsset
      })
      : null;
    const skin = visual ? null : this.artPool?.consume?.(egg.element, egg.variant);
    const fallback = visual || skin ? null : this.kenneyBuilder?.build?.({ seed: egg.seed, element: egg.element });
    return {
      name,
      templateId: template?.templateId || null,
      personality,
      rarity: egg.variant === 'charged' ? 'Charged' : 'Standard',
      stats: Object.fromEntries(statNames.map((stat, index) => [stat, values[index]])),
      imageUrl: visual?.imageUrl || skin?.image_url || fallback?.publicUrl || egg.image_url,
      visualSource: visual?.visualSource || (skin ? 'ai' : (fallback?.visualSource || 'egg_asset')),
      visualKey: visual?.visualKey || skin?.visual_key || fallback?.visualKey || egg.visual_key,
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
    const milestones = [25, 50, 75, 100].filter(milestone => (
      previous.points < milestone && total >= milestone
    ));
    const hype = this.store.addStreamHype(this.streamKey, normalizedPoints, this.now());
    this.emit('streammonsters:hype_changed', {
      streamKey: this.streamKey,
      hype,
      ...context
    });
    milestones.forEach(milestone => {
      this.emit('streammonsters:hype_milestone', {
        streamKey: this.streamKey,
        milestone,
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

  selectRandomElement({ userId, giftId, eventTimeMs }) {
    const streamKey = this.streamKey || 'offline';
    const value = `${streamKey}:${userId || ''}:${giftId}:${eventTimeMs}`;
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
