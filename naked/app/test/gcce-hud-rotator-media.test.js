/**
 * GCCE HUD Rotator - Custom Media Test
 * 
 * Tests custom media support in Gift HUD Rotator:
 * - Media upload validation
 * - Mixed gift/media entries
 * - Media serving
 * - Overlay rendering
 */

const path = require('path');
const fs = require('fs');

// Mock API for testing
class MockAPI {
  constructor() {
    this.logs = [];
    this.configs = new Map();
    this.routes = [];
    this.sockets = [];
    this.socketIO = {
      emit: (event, data) => {
        this.logs.push({ type: 'socket-emit', event, data });
      }
    };
    this.pluginDir = path.join(__dirname, '../plugins/gcce');
    this.pluginDataDir = path.join(__dirname, 'test-data', 'gcce');
  }

  log(message, level = 'info') {
    this.logs.push({ message, level });
  }

  async getConfig(key) {
    return this.configs.get(key);
  }

  async setConfig(key, value) {
    this.configs.set(key, value);
  }

  registerRoute(method, path, handler) {
    this.routes.push({ method, path, handler });
  }

  registerSocket(event, handler) {
    this.sockets.push({ event, handler });
  }

  registerTikTokEvent(event, handler) {
    // Not needed for this test
  }

  getSocketIO() {
    return this.socketIO;
  }

  getDatabase() {
    return {
      prepare: () => ({
        run: () => {},
        get: () => null,
        all: () => []
      })
    };
  }

  getPluginDataDir() {
    return this.pluginDataDir;
  }

  ensurePluginDataDir() {
    if (!fs.existsSync(this.pluginDataDir)) {
      fs.mkdirSync(this.pluginDataDir, { recursive: true });
    }
  }
}

describe('GCCE HUD Rotator - Custom Media', () => {
  let HUDManager;
  let hudManager;
  let mockAPI;

  beforeEach(() => {
    mockAPI = new MockAPI();
    
    // Load HUDManager
    HUDManager = require('../plugins/gcce/utils/HUDManager');
    
    // Create instance with minimal dependencies
    hudManager = new HUDManager(
      mockAPI,
      { tryConsume: () => ({ allowed: true }) }, // rate limiter
      { checkPermission: async () => true }, // permission system
      { logCommand: () => {} }, // audit log
      { getStats: () => ({}) }, // user cache
      { emit: (event, data) => mockAPI.socketIO.emit(event, data) } // socket batcher
    );
  });

  afterEach(() => {
    // Cleanup test data directory (Node 18+ has fs.rmSync)
    const testDataDir = path.join(__dirname, 'test-data');
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Test cleanup warning:', error.message);
      }
    }
  });

  test('normalizeGiftRotator should accept gift entries', () => {
    const input = {
      enabled: true,
      intervalSeconds: 10,
      entries: [
        {
          giftId: '123',
          giftName: 'Rose',
          giftImage: 'https://example.com/rose.png',
          title: 'Beautiful Rose',
          info: 'Thanks for the gift!',
          template: 'card',
          animation: 'fade'
        }
      ]
    };

    const result = hudManager.normalizeGiftRotator(input);

    expect(result.enabled).toBe(true);
    expect(result.intervalSeconds).toBe(10);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe('gift');
    expect(result.entries[0].giftId).toBe('123');
    expect(result.entries[0].giftName).toBe('Rose');
    expect(result.entries[0].title).toBe('Beautiful Rose');
  });

  test('normalizeGiftRotator should accept media entries', () => {
    const input = {
      enabled: true,
      intervalSeconds: 15,
      entries: [
        {
          type: 'media',
          mediaUrl: '/api/gcce/hud/media/media-123.gif',
          mediaKind: 'image',
          mimetype: 'image/gif',
          title: 'Custom GIF',
          info: 'My custom animation',
          template: 'modern',
          animation: 'zoom'
        }
      ]
    };

    const result = hudManager.normalizeGiftRotator(input);

    expect(result.enabled).toBe(true);
    expect(result.intervalSeconds).toBe(15);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe('media');
    expect(result.entries[0].mediaUrl).toBe('/api/gcce/hud/media/media-123.gif');
    expect(result.entries[0].mediaKind).toBe('image');
    expect(result.entries[0].mimetype).toBe('image/gif');
    expect(result.entries[0].title).toBe('Custom GIF');
  });

  test('normalizeGiftRotator should accept mixed gift and media entries', () => {
    const input = {
      enabled: true,
      intervalSeconds: 12,
      entries: [
        {
          giftId: '456',
          giftName: 'Star',
          giftImage: 'https://example.com/star.png',
          title: 'Shining Star',
          info: 'Thank you!'
        },
        {
          type: 'media',
          mediaUrl: 'https://example.com/custom.mp4',
          mediaKind: 'video',
          mimetype: 'video/mp4',
          title: 'Custom Video',
          info: 'Check this out'
        },
        {
          giftId: '789',
          giftName: 'Heart',
          giftImage: 'https://example.com/heart.png',
          title: 'Lovely Heart'
        }
      ]
    };

    const result = hudManager.normalizeGiftRotator(input);

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].type).toBe('gift');
    expect(result.entries[0].giftId).toBe('456');
    expect(result.entries[1].type).toBe('media');
    expect(result.entries[1].mediaKind).toBe('video');
    expect(result.entries[2].type).toBe('gift');
    expect(result.entries[2].giftId).toBe('789');
  });

  test('normalizeGiftRotator should sanitize text inputs', () => {
    const input = {
      enabled: true,
      intervalSeconds: 10,
      entries: [
        {
          type: 'media',
          mediaUrl: '/media/test.png',
          mediaKind: 'image',
          title: '<script>alert("xss")</script>Malicious Title',
          info: '<img src=x onerror=alert(1)>Malicious Info'
        }
      ]
    };

    const result = hudManager.normalizeGiftRotator(input);

    expect(result.entries[0].title).not.toContain('<script>');
    expect(result.entries[0].title).not.toContain('</script>');
    expect(result.entries[0].info).not.toContain('<img');
    expect(result.entries[0].info).not.toContain('onerror');
  });

  test('normalizeGiftRotator should enforce text length limits', () => {
    const longTitle = 'a'.repeat(200);
    const longInfo = 'b'.repeat(250);

    const input = {
      enabled: true,
      intervalSeconds: 10,
      entries: [
        {
          type: 'media',
          mediaUrl: '/media/test.png',
          mediaKind: 'image',
          title: longTitle,
          info: longInfo
        }
      ]
    };

    const result = hudManager.normalizeGiftRotator(input);

    expect(result.entries[0].title.length).toBeLessThanOrEqual(120);
    expect(result.entries[0].info.length).toBeLessThanOrEqual(160);
  });

  test('normalizeGiftRotator should filter out entries without giftId or media type', () => {
    const input = {
      enabled: true,
      intervalSeconds: 10,
      entries: [
        {
          giftId: '123',
          title: 'Valid Gift'
        },
        {
          // Invalid: no giftId and no type=media
          title: 'Invalid Entry'
        },
        {
          type: 'media',
          mediaUrl: '/media/test.png',
          mediaKind: 'image',
          title: 'Valid Media'
        }
      ]
    };

    const result = hudManager.normalizeGiftRotator(input);

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].giftId).toBe('123');
    expect(result.entries[1].type).toBe('media');
  });

  test('normalizeGiftRotator should clamp interval to 3-60 seconds', () => {
    const inputs = [
      { intervalSeconds: 1 },
      { intervalSeconds: 3 },
      { intervalSeconds: 30 },
      { intervalSeconds: 60 },
      { intervalSeconds: 100 }
    ];

    inputs.forEach(input => {
      const result = hudManager.normalizeGiftRotator(input);
      expect(result.intervalSeconds).toBeGreaterThanOrEqual(3);
      expect(result.intervalSeconds).toBeLessThanOrEqual(60);
    });
  });

  test('normalizeGiftRotator should apply default values', () => {
    const input = {
      enabled: true,
      intervalSeconds: 10,
      entries: [
        {
          type: 'media',
          mediaUrl: '/media/test.png',
          mediaKind: 'image'
          // No title, info, template, animation, colors
        }
      ]
    };

    const result = hudManager.normalizeGiftRotator(input);
    const entry = result.entries[0];

    expect(entry.title).toBe('');
    expect(entry.info).toBe('');
    expect(entry.template).toBe('card');
    expect(entry.animation).toBe('fade');
    expect(entry.fontFamily).toBe('Inter, sans-serif');
    expect(entry.textColor).toBe('#ffffff');
    expect(entry.accentColor).toBe('#ff5f9e');
    expect(entry.backgroundColor).toBe('rgba(0, 0, 0, 0.65)');
  });

  test('updateGiftRotator should normalize and save config', async () => {
    const input = {
      enabled: true,
      intervalSeconds: 8,
      entries: [
        {
          type: 'media',
          mediaUrl: '/media/test.gif',
          mediaKind: 'image',
          mimetype: 'image/gif',
          title: 'Test Media'
        }
      ]
    };

    const result = await hudManager.updateGiftRotator(input);

    expect(result.enabled).toBe(true);
    expect(result.intervalSeconds).toBe(8);
    expect(result.entries).toHaveLength(1);
    expect(mockAPI.configs.has('hud_config')).toBe(true);
  });

  test('getGiftRotator should return current config', () => {
    hudManager.config.giftRotator = {
      enabled: true,
      intervalSeconds: 12,
      entries: [
        {
          type: 'media',
          mediaUrl: '/media/test.png',
          mediaKind: 'image',
          title: 'Test'
        }
      ]
    };

    const result = hudManager.getGiftRotator();

    expect(result.enabled).toBe(true);
    expect(result.intervalSeconds).toBe(12);
    expect(result.entries).toHaveLength(1);
  });

  test('backward compatibility with entries without type field', () => {
    const input = {
      enabled: true,
      intervalSeconds: 10,
      entries: [
        {
          // Old format: no type field, has giftId
          giftId: '123',
          giftName: 'Rose',
          giftImage: 'https://example.com/rose.png',
          title: 'Old Format Gift'
        }
      ]
    };

    const result = hudManager.normalizeGiftRotator(input);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe('gift'); // Should default to 'gift'
    expect(result.entries[0].giftId).toBe('123');
  });
});
