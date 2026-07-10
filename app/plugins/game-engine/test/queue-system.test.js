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

  test('Unified queue should be empty initially', () => {
    expect(plugin.unifiedQueue).toBeDefined();
    expect(plugin.unifiedQueue.queue).toHaveLength(0);
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

    // Should be queued by the single queue manager.
    expect(plugin.unifiedQueue.queue).toHaveLength(1);
    expect(plugin.unifiedQueue.queue[0].data.viewerUsername).toBe('testuser');
    expect(plugin.unifiedQueue.queue[0].type).toBe('connect4');

    // Cleanup
    plugin.activeSessions.clear();
  });

  test('unified queue preserves FIFO order', () => {
    plugin.unifiedQueue.queueConnect4({
      gameType: 'connect4',
      viewerUsername: 'user1',
      viewerNickname: 'User 1',
      triggerType: 'command',
      triggerValue: '!play',
      timestamp: Date.now()
    });
    plugin.unifiedQueue.queueConnect4({
      gameType: 'connect4',
      viewerUsername: 'user2',
      viewerNickname: 'User 2',
      triggerType: 'command',
      triggerValue: '!play',
      timestamp: Date.now() + 1000
    });

    expect(plugin.unifiedQueue.queue).toHaveLength(2);
    const firstUser = plugin.unifiedQueue.queue[0].data.viewerUsername;
    expect(firstUser).toBe('user1');
  });

  test('Unified queue should be cleared on plugin destroy', async () => {
    const queue = plugin.unifiedQueue;
    queue.queueConnect4({
      gameType: 'connect4',
      viewerUsername: 'user1',
      viewerNickname: 'User 1',
      triggerType: 'command',
      triggerValue: '!play',
      timestamp: Date.now()
    });

    expect(queue.queue).toHaveLength(1);

    // Destroy plugin
    await plugin.destroy();

    expect(queue.queue).toHaveLength(0);
  });
});
