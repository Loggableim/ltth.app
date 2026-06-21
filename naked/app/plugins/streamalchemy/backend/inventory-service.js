class InventoryService {
  constructor(store) {
    this.store = store;
  }

  grantItem(userId, itemId, quantity = 1) {
    return this.store.addInventoryItem(userId, itemId, quantity);
  }

  consumeItems(userId, items) {
    this.store.consumeInventoryItems(userId, items);
  }

  restoreItems(userId, items) {
    this.store.restoreInventoryItems(userId, items);
  }

  getInventory(userId) {
    return this.store.getUserInventory(userId);
  }
}

module.exports = InventoryService;
