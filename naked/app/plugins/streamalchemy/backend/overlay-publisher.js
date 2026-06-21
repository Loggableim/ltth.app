const { EVENTS } = require('./constants');

class OverlayPublisher {
  constructor(api) {
    this.api = api;
  }

  baseItemObtained(payload) {
    this.api.emit(EVENTS.BASE_ITEM_OBTAINED, payload);
  }

  craftingStarted(payload) {
    this.api.emit(EVENTS.CRAFTING_STARTED, payload);
  }

  itemCrafting(payload) {
    this.api.emit(EVENTS.ITEM_CRAFTING, payload);
  }

  recipeCacheHit(payload) {
    this.api.emit(EVENTS.RECIPE_CACHE_HIT, payload);
  }

  craftingCompleted(payload) {
    this.api.emit(EVENTS.CRAFTING_COMPLETED, payload);
  }

  craftingFailed(payload) {
    this.api.emit(EVENTS.CRAFTING_FAILED, payload);
  }
}

module.exports = OverlayPublisher;
