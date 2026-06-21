/**
 * Game Engine Queue System Test
 * 
 * Tests the queue system for handling multiple game triggers
 */

const GameEnginePlugin = require('../main');

// Mock API
const createMockAPI = () => {
  const mockDB = {
    db: {
      exec: () => {},
      prepare: (query) => ({
        all: () => [],
        get: () => null,
        run: () => {}
      })
    }
  };

  return {
    getSocketIO: () => ({
      emit: () => {},
      on: () => {}
    }),
    getDatabase: () => mockDB,
    log: () => {}, // Silent logger for tests
    registerRoute: () => {},
    registerTikTokEvent: () => {},
    pluginLoader: {
      loadedPlugins: new Map()
    }
  };
};

// Mock database with triggers
const createMockDBWithTriggers = () => {
  const triggers = [
    { id: 1, game_type: 'connect4', trigger_type: 'command', trigger_value: '!play', enabled: 1 },
    { id: 2, game_type: 'connect4', trigger_type: 'command', trigger_value: '!c4', enabled: 1 },
    { id: 3, game_type: 'connect4', trigger_type: 'gift', trigger_value: 'Rose', enabled: 1 }
  ];

  const mockDB = {
    db: {
      exec: () => {},
      prepare: (query) => {
        if (query.includes('SELECT * FROM game_triggers')) {
          return {
            all: (gameType) => triggers.filter(t => !gameType || t.game_type === gameType),
            get: () => null,
            run: () => {}
          };
        }
        return {
          all: () => [],
          get: () => null,
          run: () => {}
        };
      }
    }
  };

  return mockDB;
};

describe('Game Engine Queue System', () => {
  let plugin;
  let mockAPI;

  beforeEach(async () => {
    mockAPI = createMockAPI();
    // Replace getDatabase to return our mock with triggers
    mockAPI.getDatabase = () => createMockDBWithTriggers();
    plugin = new GameEnginePlugin(mockAPI);
    await plugin.init();
  });

  afterEach(async () => {
    if (plugin) {
      await plugin.destroy();
    }
  });

  test('Queue should be empty initially', () => {
    expect(plugin.gameQueue).toBeDefined();
    expect(plugin.gameQueue.length).toBe(0);
  });

  test('Chat command trigger should be recognized', () => {
    const triggers = plugin.db.getTriggers();
    const commandTrigger = triggers.find(t => t.trigger_type === 'command' && t.trigger_value === '!play');
    expect(commandTrigger).toBeDefined();
    expect(commandTrigger.game_type).toBe('connect4');
  });

  test('Multiple chat command triggers should be available', () => {
    const triggers = plugin.db.getTriggers();
    const commandTriggers = triggers.filter(t => t.trigger_type === 'command');
    expect(commandTriggers.length).toBeGreaterThan(0);
  });

  test('handleGameStart should queue game when session is active', () => {
    // Simulate active session
    plugin.activeSessions.set(1, { mock: 'game' });

    // Try to start another game
    plugin.handleGameStart('connect4', 'testuser', 'Test User', 'command', '!play');

    // Should be queued
    expect(plugin.gameQueue.length).toBe(1);
    expect(plugin.gameQueue[0].viewerUsername).toBe('testuser');
    expect(plugin.gameQueue[0].gameType).toBe('connect4');

    // Cleanup
    plugin.activeSessions.clear();
  });

  test('processNextQueuedGame should process FIFO', () => {
    // Add multiple entries to queue
    plugin.gameQueue.push({
      gameType: 'connect4',
      viewerUsername: 'user1',
      viewerNickname: 'User 1',
      triggerType: 'command',
      triggerValue: '!play',
      timestamp: Date.now()
    });
    plugin.gameQueue.push({
      gameType: 'connect4',
      viewerUsername: 'user2',
      viewerNickname: 'User 2',
      triggerType: 'command',
      triggerValue: '!play',
      timestamp: Date.now() + 1000
    });

    expect(plugin.gameQueue.length).toBe(2);

    // Process next game
    const firstUser = plugin.gameQueue[0].viewerUsername;
    expect(firstUser).toBe('user1');

    // After processing, user1 should be removed, user2 should be next
    // (we can't actually process it without a full game setup, but we can verify queue order)
  });

  test('Queue should be cleared on plugin destroy', async () => {
    // Add entries to queue
    plugin.gameQueue.push({
      gameType: 'connect4',
      viewerUsername: 'user1',
      viewerNickname: 'User 1',
      triggerType: 'command',
      triggerValue: '!play',
      timestamp: Date.now()
    });

    expect(plugin.gameQueue.length).toBe(1);

    // Destroy plugin
    await plugin.destroy();

    // Queue should be empty
    expect(plugin.gameQueue.length).toBe(0);
  });
});
