/**
 * Viewer XP - IFTTT Integration Test
 * 
 * Tests that the viewer-xp plugin correctly integrates with the IFTTT engine
 * and emits events for automation flows.
 */

const path = require('path');

// Mock IFTTT Engine
class MockIFTTTEngine {
  constructor() {
    this.processedEvents = [];
    this.triggers = new Map();
    this.actions = new Map();
  }

  async processEvent(eventType, eventData) {
    this.processedEvents.push({ eventType, eventData, timestamp: Date.now() });
  }

  register(id, config) {
    this.triggers.set(id, config);
  }
}

// Mock API for testing
class MockAPI {
  constructor() {
    this.logs = [];
    this.configs = new Map();
    this.routes = [];
    this.sockets = [];
    this.tiktokEvents = [];
    this.registeredIFTTTTriggers = [];
    this.registeredIFTTTActions = [];
    this.socketIO = {
      emit: (event, data) => {
        this.logs.push({ type: 'socket-emit', event, data });
      },
      on: (event, handler) => {
        this.sockets.push({ event, handler });
      }
    };
    this.pluginLoader = {
      iftttEngine: new MockIFTTTEngine(),
      loadedPlugins: new Map()
    };
    this.database = {
      db: null,
      getUserStatistics: () => null,
      updateUserStatistics: () => {},
      addCoinsToUserStats: () => {}
    };
  }

  log(message, level = 'info') {
    this.logs.push({ message, level });
  }

  getConfig(key) {
    return this.configs.get(key);
  }

  setConfig(key, value) {
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

  registerIFTTTTrigger(id, config) {
    this.registeredIFTTTTriggers.push({ id, config });
    this.pluginLoader.iftttEngine.triggers.set(id, config);
  }

  registerIFTTTAction(id, config) {
    this.registeredIFTTTActions.push({ id, config });
    this.pluginLoader.iftttEngine.actions.set(id, config);
  }

  getSocketIO() {
    return this.socketIO;
  }

  getDatabase() {
    return this.database;
  }

  emit(event, data) {
    this.logs.push({ type: 'emit', event, data });
  }
}

// Mock Database for better-sqlite3
class MockDatabase {
  constructor() {
    this.data = new Map();
    this.tables = new Set();
  }

  exec(sql) {
    // Track table creation
    if (sql.includes('CREATE TABLE')) {
      const match = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/);
      if (match) this.tables.add(match[1]);
    }
  }

  prepare(sql) {
    return {
      run: (...args) => {},
      get: (key) => this.data.get(key),
      all: () => Array.from(this.data.values())
    };
  }

  transaction(fn) {
    return fn;
  }
}

describe('Viewer XP - IFTTT Integration', () => {
  let ViewerXPPlugin;
  let mockAPI;
  let plugin;
  let mockDB;

  beforeAll(() => {
    // Load the plugin
    const pluginPath = path.join(__dirname, '../plugins/viewer-xp/main.js');
    ViewerXPPlugin = require(pluginPath);
  });

  beforeEach(() => {
    // Create fresh mock instances
    mockAPI = new MockAPI();
    mockDB = new MockDatabase();
    mockAPI.database.db = mockDB;
    
    // Create plugin instance
    plugin = new ViewerXPPlugin(mockAPI);
  });

  afterEach(() => {
    if (plugin && plugin.destroy) {
      plugin.destroy().catch(() => {});
    }
  });

  test('Plugin should register IFTTT triggers on initialization', async () => {
    await plugin.init();

    // Check that IFTTT triggers were registered
    expect(mockAPI.registeredIFTTTTriggers.length).toBeGreaterThan(0);

    // Check for specific triggers
    const triggerIds = mockAPI.registeredIFTTTTriggers.map(t => t.id);
    expect(triggerIds).toContain('viewer-xp:xp-gained');
    expect(triggerIds).toContain('viewer-xp:level-up');
    expect(triggerIds).toContain('viewer-xp:daily-bonus');
    expect(triggerIds).toContain('viewer-xp:streak-milestone');
  });

  test('Plugin should register IFTTT actions on initialization', async () => {
    await plugin.init();

    // Check that IFTTT actions were registered
    expect(mockAPI.registeredIFTTTActions.length).toBeGreaterThan(0);

    // Check for specific actions
    const actionIds = mockAPI.registeredIFTTTActions.map(a => a.id);
    expect(actionIds).toContain('viewer-xp:award-xp');
  });

  test('XP gained should emit IFTTT event', async () => {
    await plugin.init();

    // Mock a viewer profile
    plugin.db.getViewerProfile = jest.fn(() => ({
      username: 'testuser',
      level: 5,
      xp: 500,
      total_xp_earned: 1000
    }));

    // Emit XP update
    plugin.emitXPUpdate('testuser', 50, 'chat_message');

    // Check that IFTTT event was emitted
    const iftttEngine = mockAPI.pluginLoader.iftttEngine;
    const xpGainedEvents = iftttEngine.processedEvents.filter(
      e => e.eventType === 'viewer-xp:xp-gained'
    );

    expect(xpGainedEvents.length).toBe(1);
    expect(xpGainedEvents[0].eventData).toMatchObject({
      username: 'testuser',
      amount: 50,
      actionType: 'chat_message',
      level: 5
    });
  });

  test('Level up should emit IFTTT event', async () => {
    await plugin.init();

    // Mock a viewer profile
    plugin.db.getViewerProfile = jest.fn(() => ({
      username: 'testuser',
      level: 6,
      xp: 600,
      total_xp_earned: 1200
    }));

    // Emit level up
    plugin.emitLevelUp('testuser', 5, 6, { title: 'Rising Star' });

    // Check that IFTTT event was emitted
    const iftttEngine = mockAPI.pluginLoader.iftttEngine;
    const levelUpEvents = iftttEngine.processedEvents.filter(
      e => e.eventType === 'viewer-xp:level-up'
    );

    expect(levelUpEvents.length).toBe(1);
    expect(levelUpEvents[0].eventData).toMatchObject({
      username: 'testuser',
      oldLevel: 5,
      newLevel: 6
    });
  });

  test('Daily bonus should emit IFTTT event', async () => {
    await plugin.init();

    // Mock viewer profile
    plugin.db.getViewerProfile = jest.fn(() => ({
      username: 'testuser',
      level: 5,
      xp: 500,
      total_xp_earned: 1000,
      streak_days: 3
    }));

    // Mock XP action
    plugin.db.getXPAction = jest.fn(() => ({
      xp_amount: 100,
      enabled: true
    }));

    // Mock daily activity update
    plugin.db.updateDailyActivity = jest.fn(() => ({
      firstToday: true,
      streak: 3
    }));

    plugin.db.awardDailyBonus = jest.fn(() => true);
    plugin.db.getSetting = jest.fn(() => true);

    // Handle join (which awards daily bonus)
    plugin.handleJoin({ uniqueId: 'testuser', username: 'testuser' });

    // Check that IFTTT event was emitted
    const iftttEngine = mockAPI.pluginLoader.iftttEngine;
    const dailyBonusEvents = iftttEngine.processedEvents.filter(
      e => e.eventType === 'viewer-xp:daily-bonus'
    );

    expect(dailyBonusEvents.length).toBeGreaterThanOrEqual(1);
    expect(dailyBonusEvents[0].eventData).toMatchObject({
      username: 'testuser',
      bonusAmount: 100,
      streakDays: 3
    });
  });

  test('Streak milestone should emit IFTTT event', async () => {
    await plugin.init();

    // Mock viewer profile with 7-day streak
    plugin.db.getViewerProfile = jest.fn(() => ({
      username: 'testuser',
      level: 5,
      xp: 500,
      total_xp_earned: 1000,
      streak_days: 7
    }));

    plugin.db.getXPAction = jest.fn(() => ({
      xp_amount: 100,
      enabled: true
    }));

    plugin.db.updateDailyActivity = jest.fn(() => ({
      firstToday: true,
      streak: 7
    }));

    plugin.db.awardDailyBonus = jest.fn(() => true);
    plugin.db.getSetting = jest.fn(() => true);

    // Handle join (which awards daily bonus and checks milestones)
    plugin.handleJoin({ uniqueId: 'testuser', username: 'testuser' });

    // Check that IFTTT event was emitted for streak milestone
    const iftttEngine = mockAPI.pluginLoader.iftttEngine;
    const streakEvents = iftttEngine.processedEvents.filter(
      e => e.eventType === 'viewer-xp:streak-milestone'
    );

    expect(streakEvents.length).toBeGreaterThanOrEqual(1);
    expect(streakEvents[0].eventData).toMatchObject({
      username: 'testuser',
      streakDays: 7,
      milestone: 7
    });
  });

  test('IFTTT award-xp action should work correctly', async () => {
    await plugin.init();

    // Find the award-xp action
    const awardXpAction = mockAPI.registeredIFTTTActions.find(
      a => a.id === 'viewer-xp:award-xp'
    );

    expect(awardXpAction).toBeDefined();
    expect(awardXpAction.config.executor).toBeDefined();

    // Mock database methods
    plugin.db.addXP = jest.fn();
    plugin.db.getViewerProfile = jest.fn(() => ({
      username: 'testuser',
      level: 5,
      xp: 500,
      total_xp_earned: 1000
    }));

    // Mock template engine
    const mockServices = {
      templateEngine: {
        processTemplate: (template) => template
      }
    };

    // Execute the action
    const result = await awardXpAction.config.executor(
      {
        username: 'testuser',
        amount: 100,
        reason: 'Test award'
      },
      { data: {} },
      mockServices
    );

    expect(result.success).toBe(true);
    expect(plugin.db.addXP).toHaveBeenCalledWith(
      'testuser',
      100,
      'ifttt_award',
      { reason: 'Test award' }
    );
  });

  test('Plugin should log IFTTT integration success', async () => {
    await plugin.init();

    const iftttLogs = mockAPI.logs.filter(
      log => log.message.includes('IFTTT') && log.level === 'info'
    );

    expect(iftttLogs.length).toBeGreaterThan(0);
  });

  test('Plugin should handle missing IFTTT engine gracefully', async () => {
    // Remove IFTTT engine
    mockAPI.pluginLoader.iftttEngine = null;
    mockAPI.registerIFTTTTrigger = undefined;

    await plugin.init();

    // Should not crash and should log debug message
    const debugLogs = mockAPI.logs.filter(
      log => log.message.includes('IFTTT') && log.level === 'debug'
    );

    expect(debugLogs.length).toBeGreaterThan(0);
  });
});
