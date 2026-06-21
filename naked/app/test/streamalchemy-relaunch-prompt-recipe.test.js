const Database = require('better-sqlite3');
const StreamAlchemyDatabase = require('../plugins/streamalchemy/backend/database');
const PromptService = require('../plugins/streamalchemy/backend/prompt-service');
const RecipeService = require('../plugins/streamalchemy/backend/recipe-service');

function createServices() {
  const sqlite = new Database(':memory:');
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const store = new StreamAlchemyDatabase(sqlite, logger);
  store.initialize();
  const promptService = new PromptService();
  const recipeService = new RecipeService(store, promptService);
  return { store, promptService, recipeService };
}

describe('PromptService', () => {
  test('sanitizes names and keeps generated prompts compact', () => {
    const service = new PromptService();
    const prompt = service.createCraftedItemPrompt({
      itemAName: 'Essence of <Rose> with a very long injected suffix that should be truncated by the sanitizer',
      itemBName: 'Heart\nLogo',
      rarity: 'Common',
      style: 'rpg'
    });

    expect(prompt.prompt).toContain('Rose');
    expect(prompt.prompt).toContain('Heart Logo');
    expect(prompt.prompt).toContain('No text');
    expect(prompt.prompt.length).toBeLessThan(420);
    expect(prompt.negativePrompt).toContain('watermark');
    expect(prompt.promptVersion).toBe('streamalchemy-v2');
  });

  test('builds deterministic recipe keys independent of input order', () => {
    const service = new PromptService();
    const first = service.createRecipeKey({
      itemAId: 'b',
      itemBId: 'a',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2'
    });
    const second = service.createRecipeKey({
      itemAId: 'a',
      itemBId: 'b',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2'
    });

    expect(first).toBe('craft:v1:a:b:rpg:streamalchemy-v2');
    expect(second).toBe(first);
  });
});

describe('RecipeService', () => {
  test('returns cached result when recipe exists', () => {
    const { store, recipeService } = createServices();
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

    const cached = recipeService.findCachedRecipe({
      itemA: { item_id: 'b', name: 'Heart' },
      itemB: { item_id: 'a', name: 'Rose' },
      style: 'rpg',
      promptVersion: 'streamalchemy-v2'
    });

    expect(cached.fromCache).toBe(true);
    expect(cached.item.item_id).toBe(result.item_id);
    expect(cached.recipeKey).toBe('craft:v1:a:b:rpg:streamalchemy-v2');
  });

  test('creates recipe mapping for generated result', () => {
    const { store, recipeService } = createServices();
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

    const recipe = recipeService.saveRecipeResult({
      itemA: { item_id: 'rose-id' },
      itemB: { item_id: 'heart-id' },
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      resultItemId: result.item_id
    });

    expect(recipe.recipe_key).toBe('craft:v1:heart-id:rose-id:rpg:streamalchemy-v2');
    expect(store.getRecipe(recipe.recipe_key).result_item_id).toBe(result.item_id);
  });
});
