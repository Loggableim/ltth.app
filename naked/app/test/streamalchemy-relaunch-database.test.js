const Database = require('better-sqlite3');
const StreamAlchemyDatabase = require('../plugins/streamalchemy/backend/database');

function createStore() {
  const sqlite = new Database(':memory:');
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  const store = new StreamAlchemyDatabase(sqlite, logger);
  store.initialize();
  return { sqlite, store };
}

describe('StreamAlchemyDatabase', () => {
  test('initializes all relaunch tables', () => {
    const { sqlite } = createStore();
    const tables = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'streamalchemy_%'
      ORDER BY name
    `).all().map(row => row.name);

    expect(tables).toEqual([
      'streamalchemy_events',
      'streamalchemy_generation_jobs',
      'streamalchemy_items',
      'streamalchemy_recipes',
      'streamalchemy_user_inventory'
    ]);
  });

  test('upserts one gift item by gift id', () => {
    const { store } = createStore();
    const item = store.upsertGiftItem({
      giftId: 5655,
      name: 'Essence of Rose',
      rarity: 'Common',
      coinValue: 1,
      imageUrl: 'data:image/svg+xml;base64,rose',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    const same = store.upsertGiftItem({
      giftId: 5655,
      name: 'Essence of Rose Updated',
      rarity: 'Common',
      coinValue: 2,
      imageUrl: 'data:image/svg+xml;base64,rose2',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    expect(same.item_id).toBe(item.item_id);
    expect(store.getItemByGiftId(5655).name).toBe('Essence of Rose');
  });

  test('adds, consumes, and restores inventory quantities atomically', () => {
    const { store } = createStore();
    const item = store.createItem({
      sourceType: 'manual',
      name: 'Manual Rose',
      rarity: 'Common',
      coinValue: 1,
      imageUrl: 'data:image/svg+xml;base64,rose',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    store.addInventoryItem('viewer-a', item.item_id, 2);
    expect(store.getInventoryItem('viewer-a', item.item_id).quantity).toBe(2);

    store.consumeInventoryItems('viewer-a', [
      { itemId: item.item_id, quantity: 1 }
    ]);
    expect(store.getInventoryItem('viewer-a', item.item_id).quantity).toBe(1);

    store.restoreInventoryItems('viewer-a', [
      { itemId: item.item_id, quantity: 1 }
    ]);
    expect(store.getInventoryItem('viewer-a', item.item_id).quantity).toBe(2);
  });

  test('throws without changing quantities when consume lacks stock', () => {
    const { store } = createStore();
    const item = store.createItem({
      sourceType: 'manual',
      name: 'Manual Heart',
      rarity: 'Common',
      coinValue: 5,
      imageUrl: 'data:image/svg+xml;base64,heart',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    store.addInventoryItem('viewer-a', item.item_id, 1);

    expect(() => store.consumeInventoryItems('viewer-a', [
      { itemId: item.item_id, quantity: 2 }
    ])).toThrow('INSUFFICIENT_ITEM_QUANTITY');

    expect(store.getInventoryItem('viewer-a', item.item_id).quantity).toBe(1);
  });

  test('stores recipes and generation jobs', () => {
    const { store } = createStore();
    const result = store.createItem({
      sourceType: 'crafted',
      name: 'Fused Rose-Heart Relic',
      rarity: 'Common',
      coinValue: 6,
      imageUrl: 'data:image/svg+xml;base64,fused',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    store.createRecipe({
      recipeKey: 'craft:v1:a:b:rpg:streamalchemy-v2',
      inputItemAId: 'a',
      inputItemBId: 'b',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      resultItemId: result.item_id
    });

    const job = store.createGenerationJob({
      recipeKey: 'craft:v1:a:b:rpg:streamalchemy-v2',
      itemId: result.item_id,
      status: 'queued',
      provider: 'placeholder',
      model: 'deterministic-svg',
      prompt: 'prompt',
      negativePrompt: 'negative'
    });

    store.updateGenerationJob(job.job_id, {
      status: 'succeeded',
      error: null
    });

    expect(store.getRecipe('craft:v1:a:b:rpg:streamalchemy-v2').result_item_id).toBe(result.item_id);
    expect(store.getGenerationJob(job.job_id).status).toBe('succeeded');
  });
});
