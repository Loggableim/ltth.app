class EventProcessor {
  constructor({ engine, logger }) {
    this.engine = engine;
    this.logger = logger;
  }

  async handleGiftEvent(data = {}) {
    const userId = data.uniqueId || data.userId || data.username;
    const giftId = Number.parseInt(data.giftId, 10);
    const giftName = data.giftName || data.name;
    const coinValue = Number.parseInt(data.diamondCount ?? data.coins ?? 0, 10) || 0;
    const repeatCount = Math.max(Number.parseInt(data.repeatCount || 1, 10) || 1, 1);

    if (!userId || !giftId || !giftName) {
      this.logger?.warn?.('[STREAMALCHEMY] Ignored invalid gift event');
      return;
    }

    for (let i = 0; i < repeatCount; i++) {
      await this.engine.processGift({ userId, giftId, giftName, coinValue });
    }
  }
}

module.exports = EventProcessor;
