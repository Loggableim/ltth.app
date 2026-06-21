/**
 * Integration test for WebGPU Emoji Rain (0,0) spawn bug fix
 * Verifies that emojis never spawn at invalid (0,0) coordinates
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

describe('WebGPU Emoji Rain - (0,0) Spawn Bug Fix Integration Tests', () => {
  let plugin;
  let mockAPI;

  beforeEach(() => {
    mockAPI = new MockAPI();
    const WebGPUEmojiRainPlugin = require('../main.js');
    plugin = new WebGPUEmojiRainPlugin(mockAPI);
  });

  describe('Bug scenario: undefined/null coordinates', () => {
    test('should not spawn at (0,0) when x and y are undefined', () => {
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 10,
        x: undefined,
        y: undefined,
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBeGreaterThan(0);
      const spawnData = mockAPI.emissions[0].data;
      
      // Should not be (0,0) - x should be randomized, y should be 0
      expect(spawnData.x).toBeGreaterThanOrEqual(0);
      expect(spawnData.x).toBeLessThanOrEqual(1);
      expect(spawnData.y).toBe(0);
      
      // If x is random, it's extremely unlikely to be exactly 0
      // Over multiple runs, we should get varied x values
    });

    test('should not spawn at (0,0) when x and y are null', () => {
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 10,
        x: null,
        y: null,
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBeGreaterThan(0);
      const spawnData = mockAPI.emissions[0].data;
      
      // x should be randomized, y should be 0
      expect(spawnData.x).toBeGreaterThanOrEqual(0);
      expect(spawnData.x).toBeLessThanOrEqual(1);
      expect(spawnData.y).toBe(0);
    });

    test('should not spawn at (0,0) when x and y are NaN', () => {
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 10,
        x: NaN,
        y: NaN,
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBeGreaterThan(0);
      const spawnData = mockAPI.emissions[0].data;
      
      // x should be randomized, y should be 0
      expect(spawnData.x).toBeGreaterThanOrEqual(0);
      expect(spawnData.x).toBeLessThanOrEqual(1);
      expect(spawnData.y).toBe(0);
    });

    test('should randomize x over multiple spawns when not specified', () => {
      const xValues = [];
      
      // Spawn 10 emojis and collect x values
      for (let i = 0; i < 10; i++) {
        mockAPI.emissions = []; // Reset
        plugin.triggerEmojiRain({
          emoji: '💙',
          count: 1,
          reason: 'test'
        });
        
        if (mockAPI.emissions.length > 0) {
          xValues.push(mockAPI.emissions[0].data.x);
        }
      }
      
      // Check that we got varied x values (not all the same)
      const uniqueXValues = new Set(xValues);
      expect(uniqueXValues.size).toBeGreaterThan(1);
      
      // All should be in valid range
      xValues.forEach(x => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Bug scenario: invalid string coordinates', () => {
    test('should handle string coordinates correctly', () => {
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 10,
        x: "invalid",
        y: "invalid",
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBeGreaterThan(0);
      const spawnData = mockAPI.emissions[0].data;
      
      // x should be randomized, y should be 0
      expect(spawnData.x).toBeGreaterThanOrEqual(0);
      expect(spawnData.x).toBeLessThanOrEqual(1);
      expect(spawnData.y).toBe(0);
    });
  });

  describe('Bug scenario: preset with no spawnArea.x', () => {
    test('should randomize x when preset has no spawnArea.x', () => {
      const xValues = [];
      
      // Use preset without spawnArea.x (like our updated default presets)
      for (let i = 0; i < 5; i++) {
        mockAPI.emissions = [];
        plugin.triggerEmojiRain({
          emoji: '💙',
          count: 10,
          spawnArea: { y: 0 }, // No x specified
          reason: 'preset'
        });
        
        if (mockAPI.emissions.length > 0) {
          xValues.push(mockAPI.emissions[0].data.x);
        }
      }
      
      // Should get varied x values
      const uniqueXValues = new Set(xValues);
      expect(uniqueXValues.size).toBeGreaterThan(1);
    });
  });

  describe('Valid coordinates should be preserved', () => {
    test('should preserve valid (0.5, 0.5) coordinates', () => {
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 10,
        x: 0.5,
        y: 0.5,
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBeGreaterThan(0);
      const spawnData = mockAPI.emissions[0].data;
      
      expect(spawnData.x).toBe(0.5);
      expect(spawnData.y).toBe(0.5);
    });

    test('should preserve valid edge coordinates (1, 1)', () => {
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 10,
        x: 1,
        y: 1,
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBeGreaterThan(0);
      const spawnData = mockAPI.emissions[0].data;
      
      expect(spawnData.x).toBe(1);
      expect(spawnData.y).toBe(1);
    });

    test('should preserve valid (0, 0) when explicitly set', () => {
      // Note: (0,0) is a valid coordinate, it's just suspicious if it happens unintentionally
      plugin.triggerEmojiRain({
        emoji: '💙',
        count: 10,
        x: 0,
        y: 0,
        reason: 'test'
      });

      expect(mockAPI.emissions.length).toBeGreaterThan(0);
      const spawnData = mockAPI.emissions[0].data;
      
      expect(spawnData.x).toBe(0);
      expect(spawnData.y).toBe(0);
      
      // Should log a debug warning about explicit (0,0)
      // (only if debug mode is on)
    });
  });
});
