class GenerationPool {
  constructor({ store, generationService, now = () => Date.now() }) {
    this.store = store;
    this.generationService = generationService;
    this.now = now;
    this.running = false;
  }

  queueGift(gift) {
    return this.store.upsertGenerationPool({
      poolKey: gift.poolKey,
      giftId: gift.giftId,
      giftName: gift.giftName,
      element: gift.element,
      eggColor: gift.eggColor,
      createdAtMs: this.now()
    });
  }

  async preparePending() {
    if (this.running) throw new Error('STREAM_MONSTERS_POOL_ALREADY_RUNNING');
    this.running = true;
    const results = [];
    try {
      for (const entry of this.store.getGenerationPool('queued')) {
        results.push(await this.prepareEntry(entry));
      }
      return results;
    } finally {
      this.running = false;
    }
  }

  async prepareEntry(entry) {
    const prompt = `Single original Stream Monsters ${entry.element} egg inspired by the TikTok gift ${entry.gift_name}. Centered game asset, readable silhouette, no text, no logo, transparent background.`;
    this.store.updateGenerationPool(entry.pool_key, {
      status: 'running', attempts: entry.attempts + 1, prompt, error: null, updatedAtMs: this.now()
    });
    try {
      const generated = await this.generationService.generateImage({
        recipeKey: entry.pool_key,
        prompt,
        negativePrompt: 'text, logo, watermark, blurry, copyrighted character',
        rarity: 'Rare'
      });
      this.store.upsertGiftMapping({
        giftId: entry.gift_id,
        giftName: entry.gift_name,
        element: entry.element,
        eggColor: entry.egg_color,
        imageUrl: generated.imageUrl,
        updatedAtMs: this.now()
      });
      return this.store.updateGenerationPool(entry.pool_key, {
        status: 'ready', imageUrl: generated.imageUrl, error: null, updatedAtMs: this.now()
      });
    } catch (error) {
      return this.store.updateGenerationPool(entry.pool_key, {
        status: 'failed', error: error.message, updatedAtMs: this.now()
      });
    }
  }
}

module.exports = GenerationPool;
