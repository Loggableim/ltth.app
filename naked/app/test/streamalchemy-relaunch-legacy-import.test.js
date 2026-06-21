const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const StreamAlchemyDatabase = require('../plugins/streamalchemy/backend/database');
const LegacyImporter = require('../plugins/streamalchemy/backend/legacy-importer');

function createImporter() {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamalchemy-legacy-'));
  fs.mkdirSync(path.join(pluginDir, 'data'), { recursive: true });
  const sqlite = new Database(':memory:');
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const store = new StreamAlchemyDatabase(sqlite, logger);
  store.initialize();
  const importer = new LegacyImporter({ pluginDir, store, logger });
  return { pluginDir, store, importer };
}

describe('LegacyImporter', () => {
  test('imports legacy items, inventories, and inferred recipes idempotently', async () => {
    const { pluginDir, store, importer } = createImporter();
    fs.writeFileSync(path.join(pluginDir, 'data', 'inventory_global.json'), JSON.stringify({
      items: [
        {
          itemId: 'rose-item',
          giftId: 1,
          name: 'Essence of Rose',
          rarity: 'Common',
          imageURL: 'data:image/svg+xml;base64,rose',
          isCrafted: false,
          coinValue: 1,
          createdAt: '2026-01-01T00:00:00.000Z'
        },
        {
          itemId: 'heart-item',
          giftId: 2,
          name: 'Essence of Heart',
          rarity: 'Common',
          imageURL: 'data:image/svg+xml;base64,heart',
          isCrafted: false,
          coinValue: 5,
          createdAt: '2026-01-01T00:00:00.000Z'
        },
        {
          itemId: 'crafted-item',
          parentItems: ['rose-item', 'heart-item'],
          name: 'Fused Rose-Heart Relic',
          rarity: 'Common',
          imageURL: 'data:image/svg+xml;base64,crafted',
          isCrafted: true,
          coinValue: 6,
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    }));
    fs.writeFileSync(path.join(pluginDir, 'data', 'user_inventory.json'), JSON.stringify({
      userInventories: [
        {
          userId: 'viewer-a',
          items: [
            { itemId: 'crafted-item', quantity: 2 }
          ]
        }
      ]
    }));

    const first = await importer.import();
    const second = await importer.import();

    expect(first.itemsImported).toBe(3);
    expect(first.inventoriesImported).toBe(1);
    expect(first.recipesImported).toBe(1);
    expect(second.itemsImported).toBe(0);
    expect(store.getAllItems()).toHaveLength(3);
    expect(store.getUserInventory('viewer-a')[0].quantity).toBe(2);
    expect(store.getAllRecipes()).toHaveLength(1);
    expect(fs.existsSync(path.join(pluginDir, 'data', 'inventory_global.json'))).toBe(true);
  });
});
