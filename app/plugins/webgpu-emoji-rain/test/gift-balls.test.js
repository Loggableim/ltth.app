/**
 * Tests for WebGPU Emoji Rain gift ball behavior.
 */

class MockAPI {
  constructor(config = {}, catalog = []) {
    this.logs = [];
    this.emissions = [];
    this.config = {
      enabled: true,
      emoji_set: ['gift'],
      max_count_per_event: 100,
      max_intensity: 3.0,
      gift_balls_enabled: true,
      gift_ball_min_size_px: 44,
      gift_ball_max_size_px: 128,
      gift_ball_price_reference_coins: 1000,
      gift_ball_min_despawn_ms: 5000,
      gift_ball_max_despawn_ms: 20000,
      gift_ball_despawn_per_coin_ms: 25,
      gift_ball_despawn_multiplier: 1,
      gift_ball_base_count: 1,
      gift_ball_series_count_divisor: 3,
      gift_ball_max_count: 24,
      emoji_lifetime_ms: 7000,
      ...config
    };
    this.catalog = catalog;
    this.db = {
      getEmojiRainConfig: () => this.config,
      getGift: (giftId) => this.catalog.find(gift => String(gift.id) === String(giftId)) || null,
      getGiftCatalog: () => this.catalog
    };
  }

  log(message, level) {
    this.logs.push({ message, level });
  }

  emit(event, data) {
    this.emissions.push({ event, data });
  }

  getSocketIO() {
    return { emit: this.emit.bind(this) };
  }

  getDatabase() {
    return this.db;
  }

  getPluginDataDir() {
    return '/tmp/test-plugin-data';
  }

  ensurePluginDataDir() {}

  getConfigPathManager() {
    return {
      getUserConfigsDir: () => '/tmp/test-user-configs'
    };
  }

  registerRoute() {}
  registerTikTokEvent() {}
  registerFlowAction() {}
}

describe('WebGPU Emoji Rain - Geschenk-Kugeln', () => {
  let WebGPUEmojiRainPlugin;

  beforeEach(() => {
    jest.resetModules();
    WebGPUEmojiRainPlugin = require('../main.js');
  });

  test('calculates gift ball size and despawn from gift price', () => {
    const api = new MockAPI();
    const plugin = new WebGPUEmojiRainPlugin(api);

    const cheap = plugin.getGiftBallMetrics(1, api.config);
    const expensive = plugin.getGiftBallMetrics(1000, api.config);
    const series = plugin.getGiftBallMetrics(20, api.config, 7);

    expect(cheap.size).toBeGreaterThanOrEqual(44);
    expect(expensive.size).toBeGreaterThan(cheap.size);
    expect(expensive.size).toBeLessThanOrEqual(128);
    expect(expensive.despawnMs).toBeGreaterThan(cheap.despawnMs);
    expect(expensive.despawnMs).toBeLessThanOrEqual(20000);
    expect(cheap.despawnMs).toBeGreaterThan(api.config.emoji_lifetime_ms);
    expect(series.count).toBeGreaterThan(cheap.count);
    expect(series.size).toBeGreaterThan(plugin.getGiftBallMetrics(20, api.config, 1).size);
    expect(series.despawnMs).toBeGreaterThan(plugin.getGiftBallMetrics(20, api.config, 1).despawnMs);
  });

  test('gift events emit gift balls with gift catalog image, scaled size, and despawn time', () => {
    const api = new MockAPI();
    const plugin = new WebGPUEmojiRainPlugin(api);

    plugin.spawnEmojiRain('gift', {
      uniqueId: 'gifter',
      giftId: 5655,
      giftName: 'Rose',
      giftPictureUrl: 'https://example.test/rose.png',
      diamondCount: 20,
      coins: 20,
      repeatCount: 7
    });

    expect(api.emissions[0].event).toBe('webgpu-emoji-rain:gift-balls');
    expect(api.emissions[0].data).toMatchObject({
      mode: 'gift-balls',
      type: 'gift-balls',
      giftId: 5655,
      giftName: 'Rose',
      giftImageUrl: 'https://example.test/rose.png',
      username: 'gifter',
      price: 20,
      totalPrice: 140,
      seriesCount: 7,
      count: 3,
      reason: 'gift',
      source: 'event:gift'
    });
    expect(api.emissions[0].data.size).toBeGreaterThan(44);
    expect(api.emissions[0].data.despawnMs).toBeGreaterThan(5000);
  });

  test('gift events fall back to catalog image when the event has no gift image', () => {
    const api = new MockAPI({}, [{
      id: 123,
      name: 'Catalog Gift',
      image_url: 'https://example.test/catalog-gift.png',
      diamond_count: 99
    }]);
    const plugin = new WebGPUEmojiRainPlugin(api);

    plugin.spawnEmojiRain('gift', {
      uniqueId: 'gifter',
      giftId: 123,
      giftName: 'Event Gift',
      repeatCount: 1
    });

    expect(api.emissions[0].event).toBe('webgpu-emoji-rain:gift-balls');
    expect(api.emissions[0].data.giftImageUrl).toBe('https://example.test/catalog-gift.png');
    expect(api.emissions[0].data.price).toBe(99);
  });

  test('gift balls use the gift catalog image instead of the event gift icon', () => {
    const api = new MockAPI({}, [{
      id: 456,
      name: 'Catalog Rose',
      image_url: 'https://example.test/catalog-rose.png',
      diamond_count: 20
    }]);
    const plugin = new WebGPUEmojiRainPlugin(api);

    plugin.spawnEmojiRain('gift', {
      uniqueId: 'gifter',
      giftId: 456,
      giftName: 'Rose',
      giftPictureUrl: 'https://example.test/generic-gift-icon.png',
      diamondCount: 20,
      repeatCount: 1
    });

    expect(api.emissions[0].event).toBe('webgpu-emoji-rain:gift-balls');
    expect(api.emissions[0].data.giftImageUrl).toBe('https://example.test/catalog-rose.png');
  });

  test('gift balls can be disabled without disabling normal gift emoji rain', () => {
    const api = new MockAPI({ gift_balls_enabled: false });
    const plugin = new WebGPUEmojiRainPlugin(api);

    plugin.spawnEmojiRain('gift', {
      uniqueId: 'gifter',
      giftName: 'Rose',
      giftPictureUrl: 'https://example.test/rose.png',
      diamondCount: 20,
      coins: 20
    });

    expect(api.emissions).toHaveLength(1);
    expect(api.emissions[0].event).toBe('webgpu-emoji-rain:spawn');
  });
});
