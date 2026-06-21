/**
 * GCCE Custom Media Commands Test
 * 
 * Tests that custom media commands can be registered and executed properly.
 */

const path = require('path');

// Mock API for testing
class MockAPI {
  constructor() {
    this.logs = [];
    this.configs = new Map();
    this.routes = [];
    this.sockets = [];
    this.tiktokEvents = [];
    this.socketIO = {
      emit: (event, data) => {
        this.logs.push({ type: 'socket-emit', event, data });
      },
      on: (event, handler) => {
        this.sockets.push({ event, handler });
      }
    };
    this.pluginLoader = {
      loadedPlugins: new Map()
    };
    this.pluginDir = path.join(__dirname, '../plugins/gcce');
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
    this.tiktokEvents.push({ event, handler });
  }

  getSocketIO() {
    return this.socketIO;
  }

  emit(event, data) {
    this.logs.push({ type: 'emit', event, data });
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

  registerFlowAction(name, handler) {
    this.logs.push({ type: 'flow-action', name, handler });
  }
}

describe('GCCE Custom Media Commands', () => {
  let gcce;
  let mockAPI;

  beforeEach(async () => {
    mockAPI = new MockAPI();
    
    // Set up initial HUD config with media library
    mockAPI.configs.set('hud_config', {
      enabled: true,
      chatCommands: {
        enabled: true,
        allowText: true,
        allowImages: true,
        allowMedia: true
      },
      defaults: {
        textDuration: 10,
        imageDuration: 10,
        maxDuration: 60,
        minDuration: 3,
        mediaDuration: 12,
        position: 'top-center'
      },
      permissions: {
        text: 'all',
        image: 'subscriber',
        clear: 'moderator',
        media: 'subscriber'
      },
      mediaLibrary: [
        {
          id: 'media-1',
          label: 'Hype',
          url: 'https://example.com/hype.gif',
          duration: 10,
          type: 'gif',
          command: '!hype'
        },
        {
          id: 'media-2',
          label: 'Wave',
          url: 'https://example.com/wave.mp4',
          duration: 8,
          type: 'video',
          command: '/wave'
        },
        {
          id: 'media-3',
          label: 'Dance',
          url: 'https://example.com/dance.gif',
          duration: 12,
          type: 'gif',
          command: null // No custom command, should use /hudmedia dance
        }
      ],
      giftRotator: {
        enabled: false,
        intervalSeconds: 10,
        entries: []
      }
    });

    // Load GCCE plugin
    const GCCE = require('../plugins/gcce/index.js');
    gcce = new GCCE(mockAPI);
    await gcce.init();
  });

  test('should register custom media commands from media library', () => {
    const allCommands = gcce.registry.getAllCommands();
    
    // Check that !hype command is registered as "hype"
    const hypeCommand = allCommands.find(cmd => cmd.name === 'hype');
    expect(hypeCommand).toBeDefined();
    expect(hypeCommand.metadata.isCustomMediaCommand).toBe(true);
    expect(hypeCommand.metadata.mediaId).toBe('media-1');
    
    // Check that /wave command is registered as "wave"
    const waveCommand = allCommands.find(cmd => cmd.name === 'wave');
    expect(waveCommand).toBeDefined();
    expect(waveCommand.metadata.isCustomMediaCommand).toBe(true);
    expect(waveCommand.metadata.mediaId).toBe('media-2');
    
    // Check that media without custom command is NOT registered
    const danceCommand = allCommands.find(cmd => cmd.name === 'dance' && cmd.metadata?.isCustomMediaCommand);
    expect(danceCommand).toBeUndefined();
  });

  test('should execute custom media command and create HUD element', async () => {
    const allCommands = gcce.registry.getAllCommands();
    const hypeCommand = allCommands.find(cmd => cmd.name === 'hype');
    
    const context = {
      userId: 'user123',
      username: 'TestUser',
      userRole: 'subscriber',
      timestamp: Date.now(),
      rawData: {}
    };

    const result = await hypeCommand.handler([], context);
    
    expect(result.success).toBe(true);
    expect(result.message).toContain('Hype');
    expect(result.message).toContain('10 seconds');
    expect(result.data.elementId).toBeDefined();
    expect(result.data.duration).toBe(10);
  });

  test('should allow duration override in custom command', async () => {
    const allCommands = gcce.registry.getAllCommands();
    const hypeCommand = allCommands.find(cmd => cmd.name === 'hype');
    
    const context = {
      userId: 'user123',
      username: 'TestUser',
      userRole: 'subscriber',
      timestamp: Date.now(),
      rawData: {}
    };

    const result = await hypeCommand.handler(['5'], context);
    
    expect(result.success).toBe(true);
    expect(result.data.duration).toBe(5);
  });

  test('should unregister old commands when media library is updated', async () => {
    // Update media library
    await gcce.hudManager.updateMediaLibrary([
      {
        id: 'media-new',
        label: 'NewMedia',
        url: 'https://example.com/new.gif',
        duration: 10,
        type: 'gif',
        command: '!new'
      }
    ]);

    // Re-register commands
    gcce.registerCustomMediaCommands();

    const allCommands = gcce.registry.getAllCommands();
    
    // Old commands should be gone
    const hypeCommand = allCommands.find(cmd => cmd.name === 'hype');
    expect(hypeCommand).toBeUndefined();
    
    // New command should exist
    const newCommand = allCommands.find(cmd => cmd.name === 'new');
    expect(newCommand).toBeDefined();
    expect(newCommand.metadata.isCustomMediaCommand).toBe(true);
  });

  test('should handle commands with various prefixes', async () => {
    const testCases = [
      { command: '!test', expectedName: 'test' },
      { command: '/test', expectedName: 'test' },
      { command: 'test', expectedName: 'test' }
    ];

    for (const { command, expectedName } of testCases) {
      await gcce.hudManager.updateMediaLibrary([
        {
          id: 'media-test',
          label: 'TestMedia',
          url: 'https://example.com/test.gif',
          duration: 10,
          type: 'gif',
          command: command
        }
      ]);

      gcce.registerCustomMediaCommands();

      const allCommands = gcce.registry.getAllCommands();
      const testCommand = allCommands.find(cmd => cmd.name === expectedName);
      expect(testCommand).toBeDefined();
    }
  });
});

console.log('✅ GCCE Custom Media Commands test suite created');
