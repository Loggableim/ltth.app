const ELEMENTS = ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'];
const EGG_COLORS = ['#ef6b45', '#3aaee8', '#54b86d', '#8ecfcb', '#f1ca43', '#a778e2'];

class StreamMonstersEngine {
  constructor({ store, generationPool = null, progression = null, emit = () => {}, now = () => Date.now(), config = {} }) {
    this.store = store;
    this.generationPool = generationPool;
    this.progression = progression;
    this.streamKey = null;
    this.emit = emit;
    this.now = now;
    this.config = {
      hatchDurationMs: 30 * 60 * 1000,
      maxUnhatchedEggs: 3,
      comboWindowMs: 6_000,
      defaultCreatorName: 'Creator',
      ...config
    };
    this.recentGifts = new Map();
  }

  describeGift({ giftId, giftName, coinValue = 0 }) {
    const normalizedGiftId = Number.parseInt(giftId, 10);
    const index = this.hashNumber(`gift:${normalizedGiftId}`) % ELEMENTS.length;
    const mapping = this.store.getGiftMapping(normalizedGiftId);
    return {
      giftId: normalizedGiftId,
      giftName: String(giftName || `Gift ${normalizedGiftId}`),
      coinValue: Math.max(0, Number.parseInt(coinValue, 10) || 0),
      element: mapping?.element || ELEMENTS[index],
      eggColor: mapping?.egg_color || EGG_COLORS[index],
      effect: mapping?.effect || 'spawn',
      imageUrl: mapping?.image_url || null,
      poolKey: `egg:v1:${normalizedGiftId}:${mapping?.element || ELEMENTS[index]}`
    };
  }

  processGift({ userId, giftId, giftName, coinValue = 0 }) {
    if (!userId) throw new Error('STREAM_MONSTERS_USER_REQUIRED');
    const gift = this.describeGift({ giftId, giftName, coinValue });
    this.store.incrementViewer(userId, 'gifts_sent');
    this.progression?.recordGift(userId, this.streamKey);
    const eggs = this.store.getViewerEggs(userId, 'incubating');
    const event = this.getActiveEvent();
    if ((gift.effect === 'boost' && eggs.length > 0) || eggs.length >= this.config.maxUnhatchedEggs) {
      const egg = this.store.boostOldestEgg(userId, this.calculateBoostMs(gift.coinValue, gift, event));
      this.store.incrementStreamMetric(this.streamKey, 'egg_boosts');
      this.emit('streammonsters:egg_boosted', { userId, egg, gift, event, hint: '!inventory' });
      return { type: 'boosted', egg, gift };
    }

    const createdAtMs = this.now();
    const egg = this.store.createEgg({
      userId,
      giftId: gift.giftId,
      giftName: gift.giftName,
      element: gift.element,
      eggColor: gift.eggColor,
      seed: this.seedFor(userId, gift.giftId, createdAtMs),
      createdAtMs,
      hatchDurationMs: this.config.hatchDurationMs,
      initialBoostMs: this.calculateEventBoostMs(gift, event),
      imageUrl: gift.imageUrl || this.createDefaultEggImage(gift)
    });
    this.store.incrementStreamMetric(this.streamKey, 'eggs_spawned');
    this.generationPool?.queueGift(gift);
    this.applyGiftCombo(userId, gift, createdAtMs);
    this.emit('streammonsters:egg_spawned', { userId, egg, gift, event, hint: '!inventory' });
    return { type: 'spawned', egg, gift };
  }

  hatchReadyEggs(userId) {
    const currentMs = this.now();
    const hatched = [];
    for (const egg of this.store.getViewerEggs(userId, 'incubating')) {
      if (egg.created_at_ms + egg.hatch_duration_ms - egg.boost_ms > currentMs) continue;
      const monster = this.store.createMonsterFromEgg(egg, this.createMonster(egg, currentMs));
      this.store.incrementViewer(userId, 'eggs_hatched');
      this.store.incrementStreamMetric(this.streamKey, 'hatches');
      this.progression?.recordHatch(userId, this.streamKey);
      this.progression?.recordCollection(userId, new Set(this.store.getViewerMonsters(userId).map(item => item.element)).size, this.streamKey);
      this.emit('streammonsters:egg_hatched', { userId, egg, monster });
      hatched.push(monster);
    }
    return hatched;
  }

  calculateBoostMs(coinValue, gift = null, event = null) {
    const base = Math.min(10 * 60 * 1000, 30_000 + (Math.max(0, coinValue) * 10_000));
    return base * this.eventMultiplierFor(gift, event);
  }

  applyGiftCombo(userId, gift, timestamp) {
    const previous = this.recentGifts.get(userId);
    this.recentGifts.set(userId, { giftId: gift.giftId, timestamp });
    if (!previous || previous.giftId === gift.giftId || timestamp - previous.timestamp > this.config.comboWindowMs) return null;
    const egg = this.store.boostOldestEgg(userId, this.calculateComboBoostMs(gift.coinValue));
    if (egg) {
      this.store.incrementStreamMetric(this.streamKey, 'egg_boosts');
      this.emit('streammonsters:gift_combo', { userId, egg, gift, previousGiftId: previous.giftId });
    }
    return egg;
  }

  calculateComboBoostMs(coinValue) {
    return Math.min(15 * 60 * 1000, 60_000 + (Math.max(0, coinValue) * 15_000));
  }

  setStreamKey(streamKey) {
    this.streamKey = streamKey || null;
  }

  getActiveEvent() {
    return this.streamKey ? this.store.getStreamEvent(this.streamKey) : null;
  }

  eventMultiplierFor(gift, event) {
    if (!gift || !event || gift.element !== event.element) return 1;
    return Math.max(1, Number(event.boost_multiplier) || 1);
  }

  calculateEventBoostMs(gift, event) {
    if (!event || gift.element !== event.element) return 0;
    return 60_000 * this.eventMultiplierFor(gift, event);
  }

  createMonster(egg, createdAtMs) {
    const values = ['vitality', 'might', 'guard', 'agility'].map((name, index) => {
      return 5 + (this.hashNumber(`${egg.seed}:${name}:${index}`) % 6);
    });
    const rarityIndex = this.hashNumber(`${egg.seed}:rarity`) % 100;
    const rarity = rarityIndex >= 98 ? 'Mythic' : (rarityIndex >= 85 ? 'Legendary' : (rarityIndex >= 55 ? 'Rare' : 'Common'));
    return {
      name: `${egg.element}ling`,
      rarity,
      stats: { vitality: values[0], might: values[1], guard: values[2], agility: values[3] },
      imageUrl: egg.image_url,
      createdAtMs
    };
  }

  seedFor(userId, giftId, createdAtMs) {
    return `${this.hashNumber(`${userId}:${giftId}:${createdAtMs}`).toString(16)}-${createdAtMs}`;
  }

  hashNumber(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  createDefaultEggImage(gift) {
    const label = String(gift.element).replace(/[^a-z]/gi, '').slice(0, 12);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768"><rect width="768" height="768" fill="#10131d"/><ellipse cx="384" cy="402" rx="190" ry="252" fill="${gift.eggColor}"/><path d="M300 270 Q384 210 468 270" fill="none" stroke="#ffffff" stroke-opacity=".75" stroke-width="20"/><text x="384" y="700" text-anchor="middle" font-family="Arial" font-size="38" fill="#ffffff">${label} Egg</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
}

module.exports = StreamMonstersEngine;
module.exports.ELEMENTS = ELEMENTS;
module.exports.EGG_COLORS = EGG_COLORS;
