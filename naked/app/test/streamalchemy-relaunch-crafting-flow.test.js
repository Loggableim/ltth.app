const Database = require('better-sqlite3');
const StreamAlchemyDatabase = require('../plugins/streamalchemy/backend/database');
const PromptService = require('../plugins/streamalchemy/backend/prompt-service');
const RecipeService = require('../plugins/streamalchemy/backend/recipe-service');
const InventoryService = require('../plugins/streamalchemy/backend/inventory-service');
const OverlayPublisher = require('../plugins/streamalchemy/backend/overlay-publisher');
const CraftingEngine = require('../plugins/streamalchemy/backend/crafting-engine');
const EventProcessor = require('../plugins/streamalchemy/backend/event-processor');
const { EVENTS } = require('../plugins/streamalchemy/backend/constants');

function createEngine(overrides = {}) {
  const sqlite = new Database(':memory:');
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const store = new StreamAlchemyDatabase(sqlite, logger);
  store.initialize();
  const promptService = new PromptService();
  const recipeService = new RecipeService(store, promptService);
  const inventoryService = new InventoryService(store);
  const emitted = [];
  const api = { emit: (event, payload) => emitted.push({ event, payload }) };
  const overlayPublisher = new OverlayPublisher(api);
  const generationService = overrides.generationService || {
    generateImage: jest.fn().mockResolvedValue({
      imageUrl: 'data:image/svg+xml;base64,generated',
      provider: 'placeholder',
      model: 'deterministic-svg'
    })
  };
  const engine = new CraftingEngine({
    store,
    promptService,
    recipeService,
    inventoryService,
    generationService,
    overlayPublisher,
    logger,
    config: {
      autoCrafting: true,
      craftingWindowMs: 6000,
      defaultStyle: 'rpg',
      promptVersion: 'streamalchemy-v2'
    },
    now: overrides.now || (() => Date.now())
  });
  return { store, engine, emitted, generationService };
}

describe('StreamAlchemy crafting relaunch flow', () => {
  test('one gift creates and grants a base item', async () => {
    const { store, engine, emitted } = createEngine({ now: () => 1000 });

    await engine.processGift({
      userId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      coinValue: 1
    });

    const inventory = store.getUserInventory('viewer-a');
    expect(inventory).toHaveLength(1);
    expect(inventory[0].name).toBe('Essence of Rose');
    expect(inventory[0].quantity).toBe(1);
    expect(inventory[0].image_url).toBe('data:image/svg+xml;base64,generated');
    expect(emitted.map(event => event.event)).toContain(EVENTS.BASE_ITEM_OBTAINED);
  });

  test('existing gift item skips base image generation', async () => {
    const { engine, generationService } = createEngine({ now: () => 1000 });

    await engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    generationService.generateImage.mockClear();
    await engine.processGift({ userId: 'viewer-b', giftId: 1, giftName: 'Rose', coinValue: 1 });

    expect(generationService.generateImage).not.toHaveBeenCalled();
  });

  test('two gifts consume both base items and grant one crafted item', async () => {
    let clock = 1000;
    const { store, engine, emitted, generationService } = createEngine({ now: () => clock });

    await engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    clock = 2000;
    await engine.processGift({ userId: 'viewer-a', giftId: 2, giftName: 'Heart', coinValue: 5 });

    const inventory = store.getUserInventory('viewer-a');
    const baseItems = inventory.filter(item => item.source_type === 'gift');
    const craftedItems = inventory.filter(item => item.source_type === 'crafted');

    expect(baseItems).toHaveLength(0);
    expect(craftedItems).toHaveLength(1);
    expect(craftedItems[0].name).toContain('Rose-Heart');
    expect(generationService.generateImage).toHaveBeenCalledTimes(3);
    expect(emitted.map(event => event.event)).toEqual([
      EVENTS.BASE_ITEM_OBTAINED,
      EVENTS.BASE_ITEM_OBTAINED,
      EVENTS.CRAFTING_STARTED,
      EVENTS.ITEM_CRAFTING,
      EVENTS.CRAFTING_COMPLETED
    ]);
  });

  test('new crafted recipes emit item crafting before image generation', async () => {
    let clock = 1000;
    const { engine, emitted } = createEngine({ now: () => clock });

    await engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    clock = 2000;
    await engine.processGift({ userId: 'viewer-a', giftId: 2, giftName: 'Heart', coinValue: 5 });

    const itemCraftingEvent = emitted.find(entry => entry.event === EVENTS.ITEM_CRAFTING);
    const completedEvent = emitted.find(entry => entry.event === EVENTS.CRAFTING_COMPLETED);

    expect(itemCraftingEvent).toBeDefined();
    expect(itemCraftingEvent.payload).toEqual(expect.objectContaining({
      recipeKey: expect.stringContaining('craft:'),
      rarity: 'Common',
      itemA: expect.objectContaining({ name: 'Essence of Rose' }),
      itemB: expect.objectContaining({ name: 'Essence of Heart' })
    }));
    expect(emitted.indexOf(itemCraftingEvent)).toBeLessThan(emitted.indexOf(completedEvent));
  });

  test('existing recipe skips image generation', async () => {
    let clock = 1000;
    const { engine, generationService, emitted } = createEngine({ now: () => clock });

    await engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    clock = 2000;
    await engine.processGift({ userId: 'viewer-a', giftId: 2, giftName: 'Heart', coinValue: 5 });
    generationService.generateImage.mockClear();
    const cacheAttemptStart = emitted.length;

    clock = 10000;
    await engine.processGift({ userId: 'viewer-b', giftId: 1, giftName: 'Rose', coinValue: 1 });
    clock = 11000;
    await engine.processGift({ userId: 'viewer-b', giftId: 2, giftName: 'Heart', coinValue: 5 });

    const cacheAttemptEvents = emitted.slice(cacheAttemptStart).map(event => event.event);
    expect(generationService.generateImage).not.toHaveBeenCalled();
    expect(cacheAttemptEvents).toContain(EVENTS.RECIPE_CACHE_HIT);
    expect(cacheAttemptEvents).not.toContain(EVENTS.ITEM_CRAFTING);
  });

  test('generation failure restores consumed inputs', async () => {
    let clock = 1000;
    const generationService = {
      generateImage: jest.fn().mockRejectedValue(new Error('provider failed'))
    };
    const { store, engine, emitted } = createEngine({ now: () => clock, generationService });

    await engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    clock = 2000;
    await engine.processGift({ userId: 'viewer-a', giftId: 2, giftName: 'Heart', coinValue: 5 });

    const inventory = store.getUserInventory('viewer-a');
    const baseItems = inventory.filter(item => item.source_type === 'gift');
    const craftedItems = inventory.filter(item => item.source_type === 'crafted');

    expect(baseItems).toHaveLength(2);
    expect(craftedItems).toHaveLength(0);
    expect(emitted.map(event => event.event)).toContain(EVENTS.CRAFTING_FAILED);
  });
});

describe('EventProcessor', () => {
  test('normalizes repeat gifts into individual processing calls', async () => {
    const calls = [];
    const processor = new EventProcessor({
      engine: {
        processGift: async gift => calls.push(gift)
      },
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
    });

    await processor.handleGiftEvent({
      uniqueId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      diamondCount: 1,
      repeatCount: 3
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({
      userId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      coinValue: 1
    });
  });
});
