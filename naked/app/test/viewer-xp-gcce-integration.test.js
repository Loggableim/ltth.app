/**
 * Viewer XP - GCCE Integration Test
 * 
 * Tests that the viewer-xp plugin correctly integrates with GCCE
 * and registers chat commands for XP system functionality.
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

  getDatabase() {
    return {
      db: {
        prepare: () => ({
          run: () => {},
          get: () => null,
          all: () => []
        })
      }
    };
  }

  emit(event, data) {
    this.logs.push({ type: 'api-emit', event, data });
  }
}

// Mock GCCE Plugin
class MockGCCEPlugin {
  constructor() {
    this.registeredCommands = new Map();
  }

  registerCommandsForPlugin(pluginId, commands) {
    const results = {
      pluginId,
      registered: [],
      failed: []
    };

    for (const cmd of commands) {
      this.registeredCommands.set(cmd.name, { ...cmd, pluginId });
      results.registered.push(cmd.name);
    }

    return results;
  }

  unregisterCommandsForPlugin(pluginId) {
    for (const [name, cmd] of this.registeredCommands.entries()) {
      if (cmd.pluginId === pluginId) {
        this.registeredCommands.delete(name);
      }
    }
  }

  getCommand(name) {
    return this.registeredCommands.get(name);
  }
}

// Mock Database
class MockViewerXPDatabase {
  constructor() {
    this.viewers = new Map();
    this.actions = [
      { action_type: 'chat_message', xp_amount: 5, cooldown_seconds: 30, enabled: true },
      { action_type: 'like', xp_amount: 2, cooldown_seconds: 60, enabled: true }
    ];
    this.levelUpCallback = null;
  }

  initialize() {}
  destroy() {}
  
  setLevelUpCallback(callback) {
    this.levelUpCallback = callback;
  }

  getViewerProfile(username) {
    return this.viewers.get(username) || null;
  }

  getTopViewers(limit) {
    return Array.from(this.viewers.values())
      .sort((a, b) => b.total_xp_earned - a.total_xp_earned)
      .slice(0, limit);
  }

  getXPForLevel(level) {
    return (level - 1) * (level - 1) * 100; // Exponential
  }

  getAllXPActions() {
    return this.actions;
  }

  getSetting(key, defaultValue) {
    return defaultValue;
  }
}

describe('Viewer XP - GCCE Integration', () => {
  let mockAPI;
  let mockGCCE;
  let viewerXPPlugin;

  beforeEach(() => {
    // Setup mocks
    mockAPI = new MockAPI();
    mockGCCE = new MockGCCEPlugin();
    
    // Register GCCE with mock API
    mockAPI.pluginLoader.loadedPlugins.set('gcce', { instance: mockGCCE });

    // Load ViewerXP plugin
    const ViewerXPPlugin = require('../plugins/viewer-leaderboard/viewer-xp-impl.js');
    viewerXPPlugin = new ViewerXPPlugin(mockAPI);
    
    // Replace database with mock
    viewerXPPlugin.db = new MockViewerXPDatabase();
  });

  afterEach(async () => {
    if (viewerXPPlugin) {
      await viewerXPPlugin.destroy();
    }
  });

  test('should register GCCE commands on initialization', async () => {
    // Initialize plugin
    await viewerXPPlugin.init();

    // Check that commands were registered
    expect(mockGCCE.registeredCommands.size).toBeGreaterThan(0);
    
    // Check for specific commands
    expect(mockGCCE.getCommand('xp')).toBeDefined();
    expect(mockGCCE.getCommand('rank')).toBeDefined();
    expect(mockGCCE.getCommand('top')).toBeDefined();
    expect(mockGCCE.getCommand('leaderboard')).toBeDefined();
  });

  test('should register commands with correct properties', async () => {
    await viewerXPPlugin.init();

    const xpCommand = mockGCCE.getCommand('xp');
    expect(xpCommand.name).toBe('xp');
    expect(xpCommand.description).toContain('XP');
    expect(xpCommand.permission).toBe('all');
    expect(xpCommand.category).toBe('XP System');
    expect(xpCommand.handler).toBeInstanceOf(Function);
  });

  test('/xp command should return user XP data', async () => {
    await viewerXPPlugin.init();

    // Add test viewer
    viewerXPPlugin.db.viewers.set('testuser', {
      username: 'testuser',
      level: 5,
      xp: 1600,
      total_xp_earned: 1600,
      name_color: '#FFD700'
    });

    const xpCommand = mockGCCE.getCommand('xp');
    const context = {
      username: 'testuser',
      userId: '123',
      userRole: 'all',
      timestamp: Date.now(),
      rawData: {}
    };

    const result = await xpCommand.handler([], context);

    expect(result.success).toBe(true);
    expect(result.displayOverlay).toBe(true);
    expect(result.data.profile).toBeDefined();
    expect(result.data.profile.username).toBe('testuser');
  });

  test('/rank command should return user rank', async () => {
    await viewerXPPlugin.init();

    // Add test viewers
    viewerXPPlugin.db.viewers.set('user1', {
      username: 'user1',
      level: 10,
      xp: 8100,
      total_xp_earned: 10000,
      name_color: '#FFD700'
    });
    viewerXPPlugin.db.viewers.set('user2', {
      username: 'user2',
      level: 5,
      xp: 1600,
      total_xp_earned: 5000,
      name_color: '#00FF00'
    });

    const rankCommand = mockGCCE.getCommand('rank');
    const context = {
      username: 'user2',
      userId: '456',
      userRole: 'all',
      timestamp: Date.now(),
      rawData: {}
    };

    const result = await rankCommand.handler([], context);

    expect(result.success).toBe(true);
    expect(result.data.rank).toBe(2); // user2 should be rank 2
  });

  test('/top command should return leaderboard', async () => {
    await viewerXPPlugin.init();

    // Add test viewers
    for (let i = 1; i <= 10; i++) {
      viewerXPPlugin.db.viewers.set(`user${i}`, {
        username: `user${i}`,
        level: i,
        xp: i * 100,
        total_xp_earned: i * 100
      });
    }

    const topCommand = mockGCCE.getCommand('top');
    const context = {
      username: 'viewer',
      userId: '789',
      userRole: 'all',
      timestamp: Date.now(),
      rawData: {}
    };

    const result = await topCommand.handler(['5'], context);

    expect(result.success).toBe(true);
    expect(result.data.leaderboard).toBeDefined();
    expect(result.data.leaderboard.length).toBeLessThanOrEqual(5);
  });

  test('should unregister commands on destroy', async () => {
    await viewerXPPlugin.init();

    expect(mockGCCE.registeredCommands.size).toBeGreaterThan(0);

    await viewerXPPlugin.destroy();

    expect(mockGCCE.registeredCommands.size).toBe(0);
  });

  test('should handle missing GCCE gracefully', async () => {
    // Remove GCCE from plugin loader
    mockAPI.pluginLoader.loadedPlugins.delete('gcce');

    // Should not throw error
    await expect(viewerXPPlugin.init()).resolves.not.toThrow();

    // Should log warning
    const warningLogs = mockAPI.logs.filter(log => 
      log.level === 'warn' && log.message.includes('GCCE not available')
    );
    expect(warningLogs.length).toBeGreaterThan(0);
  });
});

console.log('✅ Viewer XP - GCCE Integration tests loaded');
