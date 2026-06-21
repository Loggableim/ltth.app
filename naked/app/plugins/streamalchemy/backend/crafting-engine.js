const { RARITY_TIERS } = require('./constants');

class CraftingEngine {
  constructor({
    store,
    promptService,
    recipeService,
    inventoryService,
    generationService,
    overlayPublisher,
    logger,
    config,
    now = () => Date.now()
  }) {
    this.store = store;
    this.promptService = promptService;
    this.recipeService = recipeService;
    this.inventoryService = inventoryService;
    this.generationService = generationService;
    this.overlayPublisher = overlayPublisher;
    this.logger = logger;
    this.config = config;
    this.now = now;
    this.buffers = new Map();
  }

  async processGift(gift) {
    const baseItem = await this.getOrCreateBaseItem(gift);
    this.inventoryService.grantItem(gift.userId, baseItem.item_id, 1);
    this.overlayPublisher.baseItemObtained({ userId: gift.userId, item: baseItem });

    const buffer = this.getBuffer(gift.userId);
    buffer.push({ item: baseItem, timestamp: this.now() });

    if (this.config.autoCrafting && buffer.length >= 2) {
      await this.tryCraft(gift.userId);
    }
  }

  async getOrCreateBaseItem(gift) {
    const existing = this.store.getItemByGiftId(gift.giftId);
    if (existing) return existing;

    const prompt = this.promptService.createBaseItemPrompt({
      giftName: gift.giftName,
      style: this.config.defaultStyle
    });

    let imageUrl = null;
    let generator = 'unavailable';
    try {
      const generated = await this.generationService.generateImage({
        recipeKey: `base:v1:${gift.giftId}:${prompt.style}:${prompt.promptVersion}`,
        prompt: prompt.prompt,
        negativePrompt: prompt.negativePrompt,
        rarity: 'Common'
      });
      imageUrl = generated.imageUrl;
      generator = generated.provider;
    } catch (error) {
      this.logger?.warn?.(`[STREAMALCHEMY] Base item image generation failed for gift ${gift.giftId}: ${error.message}`);
    }

    return this.store.upsertGiftItem({
      giftId: gift.giftId,
      name: `Essence of ${this.promptService.sanitizeName(gift.giftName)}`,
      rarity: 'Common',
      coinValue: gift.coinValue,
      imageUrl,
      style: prompt.style,
      promptVersion: prompt.promptVersion,
      generator
    });
  }

  async tryCraft(userId) {
    const buffer = this.getBuffer(userId);
    const second = buffer[buffer.length - 1];
    const first = buffer[buffer.length - 2];
    if (!first || !second) return;

    const delta = second.timestamp - first.timestamp;
    if (delta > this.config.craftingWindowMs) {
      buffer.shift();
      return;
    }

    buffer.splice(buffer.length - 2, 2);
    this.overlayPublisher.craftingStarted({ userId, itemA: first.item, itemB: second.item });

    const consumed = [
      { itemId: first.item.item_id, quantity: 1 },
      { itemId: second.item.item_id, quantity: 1 }
    ];

    try {
      this.inventoryService.consumeItems(userId, consumed);
      const craftedItem = await this.resolveCraftedItem(first.item, second.item);
      this.inventoryService.grantItem(userId, craftedItem.item_id, 1);
      this.overlayPublisher.craftingCompleted({ userId, item: craftedItem, itemA: first.item, itemB: second.item });
    } catch (error) {
      this.inventoryService.restoreItems(userId, consumed);
      this.logger?.error?.(`[STREAMALCHEMY] Crafting failed: ${error.message}`);
      this.overlayPublisher.craftingFailed({ userId, itemA: first.item, itemB: second.item, error: error.message });
    }
  }

  async resolveCraftedItem(itemA, itemB) {
    const style = this.config.defaultStyle;
    const promptVersion = this.config.promptVersion;
    const cached = this.recipeService.findCachedRecipe({ itemA, itemB, style, promptVersion });
    if (cached.fromCache) {
      this.overlayPublisher.recipeCacheHit({ recipeKey: cached.recipeKey, item: cached.item });
      return cached.item;
    }

    const rarity = this.calculateRarity((itemA.coin_value || 0) + (itemB.coin_value || 0));
    this.overlayPublisher.itemCrafting({
      recipeKey: cached.recipeKey,
      itemA,
      itemB,
      rarity
    });
    const prompt = this.promptService.createCraftedItemPrompt({
      itemAName: itemA.name,
      itemBName: itemB.name,
      rarity,
      style
    });
    const generated = await this.generationService.generateImage({
      recipeKey: cached.recipeKey,
      prompt: prompt.prompt,
      negativePrompt: prompt.negativePrompt,
      rarity,
      itemA,
      itemB
    });
    const craftedItem = this.store.createItem({
      sourceType: 'crafted',
      name: this.createCraftedName(itemA.name, itemB.name),
      rarity,
      coinValue: (itemA.coin_value || 0) + (itemB.coin_value || 0),
      imageUrl: generated.imageUrl,
      style,
      promptVersion,
      generator: generated.provider
    });
    this.recipeService.saveRecipeResult({
      itemA,
      itemB,
      style,
      promptVersion,
      resultItemId: craftedItem.item_id
    });
    return craftedItem;
  }

  createCraftedName(nameA, nameB) {
    const cleanA = this.promptService.sanitizeName(nameA);
    const cleanB = this.promptService.sanitizeName(nameB);
    return `Fused ${cleanA}-${cleanB} Relic`;
  }

  calculateRarity(totalCoins) {
    return RARITY_TIERS.find(tier => totalCoins >= tier.min)?.name || 'Common';
  }

  getBuffer(userId) {
    if (!this.buffers.has(userId)) {
      this.buffers.set(userId, []);
    }
    return this.buffers.get(userId);
  }
}

module.exports = CraftingEngine;
