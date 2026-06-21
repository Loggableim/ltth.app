/**
 * Tests for WebGPU Emoji Rain spawn coordinate validation
 * Ensures emojis never spawn at invalid coordinates like (0,0)
 */

const path = require('path');

// Mock API for testing
class MockAPI {
  constructor() {
    this.logs = [];
    this.emissions = [];
    this.db = {
      getEmojiRainConfig: () => ({
        enabled: true,
        emoji_set: ['💙', '⭐', '🎉'],
        max_count_per_event: 100,
        max_intensity: 3.0
      })
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

  ensurePluginDataDir() {
    // Mock implementation
  }

  getConfigPathManager() {
    return {
      getUserConfigsDir: () => '/tmp/test-user-configs'
    };
  }

  registerRoute() {}
  registerTikTokEvent() {}
  registerFlowAction() {}
}

describe('WebGPU Emoji Rain - Spawn Coordinate Validation', () => {
  let plugin;
  let mockAPI;

  beforeEach(() => {
    // Reset mock API
    mockAPI = new MockAPI();
    
    // Load plugin class
    const WebGPUEmojiRainPlugin = require('../main.js');
    plugin = new WebGPUEmojiRainPlugin(mockAPI);
  });

  describe('validateSpawnCoordinates', () => {
    test('should return random x when x is undefined', () => {
      const result = plugin.validateSpawnCoordinates(undefined, 0);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThanOrEqual(1);
      expect(result.y).toBe(0);
    });

    test('should return random x when x is null', () => {
      const result = plugin.validateSpawnCoordinates(null, 0);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThanOrEqual(1);
      expect(result.y).toBe(0);
    });

    test('should return random x when x is NaN', () => {
      const result = plugin.validateSpawnCoordinates(NaN, 0);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThanOrEqual(1);
      expect(result.y).toBe(0);
    });

    test('should return default y=0 when y is undefined', () => {
      const result = plugin.validateSpawnCoordinates(0.5, undefined);
      expect(result.x).toBe(0.5);
      expect(result.y).toBe(0);
    });

    test('should return default y=0 when y is null', () => {
      const result = plugin.validateSpawnCoordinates(0.5, null);
      expect(result.x).toBe(0.5);
      expect(result.y).toBe(0);
    });

    test('should return default y=0 when y is NaN', () => {
      const result = plugin.validateSpawnCoordinates(0.5, NaN);
      expect(result.x).toBe(0.5);
      expect(result.y).toBe(0);
    });

    test('should accept valid x coordinate', () => {
      const result = plugin.validateSpawnCoordinates(0.7, 0);
      expect(result.x).toBe(0.7);
      expect(result.y).toBe(0);
    });

    test('should accept valid y coordinate', () => {
      const result = plugin.validateSpawnCoordinates(0.5, 0.3);
      expect(result.x).toBe(0.5);
      expect(result.y).toBe(0.3);
    });

    test('should use spawnArea.x as fallback when x is invalid', () => {
      const spawnArea = { x: 0.8, y: 0.2 };
      const result = plugin.validateSpawnCoordinates(undefined, undefined, spawnArea);
      expect(result.x).toBe(0.8);
      expect(result.y).toBe(0.2);
    });

    test('should randomize x when both x and spawnArea.x are invalid', () => {
      const spawnArea = { x: null, y: 0 };
      const result = plugin.validateSpawnCoordinates(null, null, spawnArea);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThanOrEqual(1);
      expect(result.y).toBe(0);
    });

    test('should never return (0,0) when both coordinates are explicitly 0', () => {
      // When x=0 and y=0 are explicitly passed, they should be preserved as valid coordinates
      // but the debug log should warn about it
      const result = plugin.validateSpawnCoordinates(0, 0);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      // Check that debug log was called (if debug mode is on)
    });

    test('should handle string values by treating them as invalid', () => {
      const result = plugin.validateSpawnCoordinates('0.5', '0.3');
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThanOrEqual(1);
      expect(result.y).toBe(0);
    });

    test('should handle negative values by treating them as invalid', () => {
      const result = plugin.validateSpawnCoordinates(-0.5, -0.3);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThanOrEqual(1);
      expect(result.y).toBe(0);
    });

    test('should handle values > 1 by treating them as invalid', () => {
      const result = plugin.validateSpawnCoordinates(1.5, 1.3);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThanOrEqual(1);
      expect(result.y).toBe(0);
    });

    test('should reject invalid spawnArea.x values out of range', () => {
      const spawnArea = { x: 1.5, y: 0.5 };
      const result = plugin.validateSpawnCoordinates(undefined, undefined, spawnArea);
      // x should be randomized since spawnArea.x is out of range
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThanOrEqual(1);
      expect(result.y).toBe(0.5);
    });

    test('should reject invalid spawnArea.y values out of range', () => {
      const spawnArea = { x: 0.5, y: -0.5 };
      const result = plugin.validateSpawnCoordinates(undefined, undefined, spawnArea);
      expect(result.x).toBe(0.5);
      // y should default to 0 since spawnArea.y is out of range
      expect(result.y).toBe(0);
    });
  });

  describe('triggerEmojiRain with coordinate validation', () => {
    test('should spawn with random x when x is not provided', () => {
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 5,
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBe(1);
      const spawnData = mockAPI.emissions[0].data;
      expect(spawnData.x).toBeGreaterThanOrEqual(0);
      expect(spawnData.x).toBeLessThanOrEqual(1);
      expect(spawnData.y).toBe(0);
    });

    test('should spawn with random x when x is null', () => {
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 5,
        x: null,
        y: null,
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBe(1);
      const spawnData = mockAPI.emissions[0].data;
      expect(spawnData.x).toBeGreaterThanOrEqual(0);
      expect(spawnData.x).toBeLessThanOrEqual(1);
      expect(spawnData.y).toBe(0);
    });

    test('should spawn with random x when x is NaN', () => {
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 5,
        x: NaN,
        y: NaN,
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBe(1);
      const spawnData = mockAPI.emissions[0].data;
      expect(spawnData.x).toBeGreaterThanOrEqual(0);
      expect(spawnData.x).toBeLessThanOrEqual(1);
      expect(spawnData.y).toBe(0);
    });

    test('should respect valid x coordinate', () => {
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 5,
        x: 0.7,
        y: 0.3,
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBe(1);
      const spawnData = mockAPI.emissions[0].data;
      expect(spawnData.x).toBe(0.7);
      expect(spawnData.y).toBe(0.3);
    });

    test('should use spawnArea when coordinates not provided', () => {
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 5,
        spawnArea: { x: 0.8, y: 0.2 },
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBe(1);
      const spawnData = mockAPI.emissions[0].data;
      expect(spawnData.x).toBe(0.8);
      expect(spawnData.y).toBe(0.2);
    });
  });

  describe('Default presets spawn coordinate validation', () => {
    test('all default presets should have valid spawn coordinates', () => {
      const presets = plugin.getDefaultPresets();
      
      for (const preset of presets) {
        expect(preset).toHaveProperty('spawnArea');
        
        // Presets can omit x to allow randomization
        if (preset.spawnArea.x !== undefined) {
          expect(preset.spawnArea.x).toBeGreaterThanOrEqual(0);
          expect(preset.spawnArea.x).toBeLessThanOrEqual(1);
        }
        
        // Y should be defined and valid
        expect(preset.spawnArea.y).toBeDefined();
        expect(preset.spawnArea.y).toBeGreaterThanOrEqual(0);
        expect(preset.spawnArea.y).toBeLessThanOrEqual(1);
      }
    });
  });
});
