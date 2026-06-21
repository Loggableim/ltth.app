const fs = require('fs').promises;
const path = require('path');
const { PROMPT_VERSION } = require('./constants');

class LegacyImporter {
  constructor({ pluginDir, store, logger }) {
    this.pluginDir = pluginDir;
    this.store = store;
    this.logger = logger;
  }

  async import() {
    const report = {
      itemsImported: 0,
      inventoriesImported: 0,
      recipesImported: 0,
      errors: []
    };

    const globalData = await this.readJson(path.join(this.pluginDir, 'data', 'inventory_global.json'), { items: [] }, report);
    const userData = await this.readJson(path.join(this.pluginDir, 'data', 'user_inventory.json'), { userInventories: [] }, report);

    for (const legacyItem of globalData.items || []) {
      if (this.store.getItemById(legacyItem.itemId)) continue;
      try {
        this.store.createItem({
          itemId: legacyItem.itemId,
          sourceType: legacyItem.isCrafted ? 'crafted' : 'gift',
          giftId: legacyItem.giftId || null,
          name: legacyItem.name || 'Imported Item',
          rarity: legacyItem.rarity || 'Common',
          coinValue: legacyItem.coinValue || 0,
          imageUrl: legacyItem.imageURL || null,
          style: legacyItem.style || 'rpg',
          promptVersion: legacyItem.promptVersion || PROMPT_VERSION,
          generator: legacyItem.generator || 'legacy'
        });
        report.itemsImported++;
      } catch (error) {
        report.errors.push(`item ${legacyItem.itemId}: ${error.message}`);
      }
    }

    for (const legacyItem of globalData.items || []) {
      if (!legacyItem.isCrafted || !Array.isArray(legacyItem.parentItems) || legacyItem.parentItems.length !== 2) continue;
      const recipeKey = this.createLegacyRecipeKey(
        legacyItem.parentItems[0],
        legacyItem.parentItems[1],
        legacyItem.style || 'rpg',
        legacyItem.promptVersion || PROMPT_VERSION
      );
      if (this.store.getRecipe(recipeKey)) continue;
      try {
        const [inputItemAId, inputItemBId] = [...legacyItem.parentItems].sort();
        this.store.createRecipe({
          recipeKey,
          inputItemAId,
          inputItemBId,
          style: legacyItem.style || 'rpg',
          promptVersion: legacyItem.promptVersion || PROMPT_VERSION,
          resultItemId: legacyItem.itemId
        });
        report.recipesImported++;
      } catch (error) {
        report.errors.push(`recipe ${legacyItem.itemId}: ${error.message}`);
      }
    }

    for (const userInventory of userData.userInventories || []) {
      for (const entry of userInventory.items || []) {
        const existing = this.store.getInventoryItem(userInventory.userId, entry.itemId);
        if (existing) continue;
        try {
          this.store.addInventoryItem(userInventory.userId, entry.itemId, entry.quantity || 1);
          report.inventoriesImported++;
        } catch (error) {
          report.errors.push(`inventory ${userInventory.userId}/${entry.itemId}: ${error.message}`);
        }
      }
    }

    return report;
  }

  async readJson(filePath, fallback, report) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        report.errors.push(`${path.basename(filePath)}: ${error.message}`);
      }
      return fallback;
    }
  }

  createLegacyRecipeKey(itemAId, itemBId, style, promptVersion) {
    const [first, second] = [String(itemAId), String(itemBId)].sort();
    return `craft:v1:${first}:${second}:${style}:${promptVersion}`;
  }
}

module.exports = LegacyImporter;
