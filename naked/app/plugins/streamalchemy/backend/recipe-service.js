class RecipeService {
  constructor(store, promptService) {
    this.store = store;
    this.promptService = promptService;
  }

  buildRecipeKey({ itemA, itemB, style, promptVersion }) {
    return this.promptService.createRecipeKey({
      itemAId: itemA.item_id,
      itemBId: itemB.item_id,
      style,
      promptVersion
    });
  }

  findCachedRecipe({ itemA, itemB, style, promptVersion }) {
    const recipeKey = this.buildRecipeKey({ itemA, itemB, style, promptVersion });
    const cached = this.store.getRecipeWithResult(recipeKey);
    if (!cached) {
      return { fromCache: false, recipeKey, item: null };
    }
    return {
      fromCache: true,
      recipeKey,
      item: {
        item_id: cached.result_item_id,
        source_type: cached.source_type,
        name: cached.name,
        rarity: cached.rarity,
        coin_value: cached.coin_value,
        image_url: cached.image_url,
        style: cached.style,
        prompt_version: cached.prompt_version,
        generator: cached.generator
      }
    };
  }

  saveRecipeResult({ itemA, itemB, style, promptVersion, resultItemId }) {
    const recipeKey = this.buildRecipeKey({ itemA, itemB, style, promptVersion });
    const [inputItemAId, inputItemBId] = [itemA.item_id, itemB.item_id].sort();
    return this.store.createRecipe({
      recipeKey,
      inputItemAId,
      inputItemBId,
      style,
      promptVersion,
      resultItemId
    });
  }
}

module.exports = RecipeService;
