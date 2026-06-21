/**
 * Connect4 Unified Queue Integration Test
 * 
 * Tests that Connect4 games properly queue using the UnifiedQueueManager
 */

const GameEnginePlugin = require('../main');
const UnifiedQueueManager = require('../backend/unified-queue');

describe('Connect4 Unified Queue Integration', () => {
  let plugin;
  let mockApi;
  let mockSocketIO;
  let mockDb;

  beforeEach(() => {
    // Mock Socket.IO
    mockSocketIO = {
      on: jest.fn(),
      emit: jest.fn()
    };

    // Mock Database
    mockDb = {
      initialize: jest.fn(),
      prepare: jest.fn(() => ({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn(() => [])
      })),
      getGameConfig: jest.fn(() => null),
      getTriggers: jest.fn(() => []),
      getSession: jest.fn(() => null),
      getActiveSessionForPlayer: jest.fn(() => null),
      createSession: jest.fn(() => 1),
      getXPRewards: jest.fn(() => ({ win_xp: 100, loss_xp: 25, draw_xp: 50, participation_xp: 10 }))
    };

    // Mock API
    mockApi = {
      log: jest.fn(),
      getSocketIO: () => mockSocketIO,
      getDatabase: () => mockDb,
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      getConfig: jest.fn(() => Promise.resolve(null)),
      setConfig: jest.fn(() => Promise.resolve()),
      emit: jest.fn(),
      pluginLoader: {
        loadedPlugins: new Map()
      }
    };

    plugin = new GameEnginePlugin(mockApi);
  });

  afterEach(() => {
    if (plugin) {
      if (plugin.gcceRetryInterval) {
        clearInterval(plugin.gcceRetryInterval);
        plugin.gcceRetryInterval = null;
      }
      
      plugin.activeSessions.clear();
      plugin.pendingChallenges.clear();
      
      plugin.db = mockDb;
      
      // Note: We don't call destroy() here because:
      // 1. It would try to cleanup resources that don't exist in the mock environment
      // 2. The unifiedQueue.destroy() would fail because games are mocked
      // 3. Test cleanup is sufficient with manual clearing above
      // In a real environment, destroy() is called properly with all dependencies
    }
  });

  describe('UnifiedQueueManager Integration', () => {
    test('should have unified queue manager initialized', () => {
      expect(plugin.unifiedQueue).toBeDefined();
      expect(plugin.unifiedQueue).toBeInstanceOf(UnifiedQueueManager);
    });

    test('should have game engine reference set in unified queue', () => {
      expect(plugin.unifiedQueue.gameEnginePlugin).toBe(plugin);
    });

    test('should queue Connect4 game when another game is active', () => {
      // Simulate an active game
      plugin.activeSessions.set(1, {});
      
      // Try to start Connect4 game
      plugin.handleGameStart('connect4', 'user1', 'User One', 'command', '/c4start');
      
      // Verify game was queued in unified queue
      expect(plugin.unifiedQueue.queue.length).toBe(1);
      expect(plugin.unifiedQueue.queue[0].type).toBe('connect4');
      expect(plugin.unifiedQueue.queue[0].data.viewerUsername).toBe('user1');
    });

    test('should emit unified-queue:connect4-queued event when queuing', () => {
      // Simulate an active game
      plugin.activeSessions.set(1, {});
      
      // Try to start Connect4 game
      plugin.handleGameStart('connect4', 'user1', 'User One', 'command', '/c4start');
      
      // Verify socket event was emitted
      expect(mockSocketIO.emit).toHaveBeenCalledWith(
        'unified-queue:connect4-queued',
        expect.objectContaining({
          position: 1,
          gameType: 'connect4',
          username: 'user1',
          nickname: 'User One'
        })
      );
    });

    test('should queue Chess game when another game is active', () => {
      // Simulate an active game
      plugin.activeSessions.set(1, {});
      
      // Try to start Chess game
      plugin.handleGameStart('chess', 'user2', 'User Two', 'command', '/chessstart');
      
      // Verify game was queued in unified queue
      expect(plugin.unifiedQueue.queue.length).toBe(1);
      expect(plugin.unifiedQueue.queue[0].type).toBe('chess');
      expect(plugin.unifiedQueue.queue[0].data.viewerUsername).toBe('user2');
    });

    test('should handle multiple games queued in order', () => {
      // Simulate an active game
      plugin.activeSessions.set(1, {});
      
      // Queue multiple games
      plugin.handleGameStart('connect4', 'user1', 'User One', 'command', '/c4start');
      plugin.handleGameStart('chess', 'user2', 'User Two', 'command', '/chessstart');
      plugin.handleGameStart('connect4', 'user3', 'User Three', 'command', '/c4start');
      
      // Verify all games were queued in order (FIFO)
      expect(plugin.unifiedQueue.queue.length).toBe(3);
      expect(plugin.unifiedQueue.queue[0].data.viewerUsername).toBe('user1');
      expect(plugin.unifiedQueue.queue[1].data.viewerUsername).toBe('user2');
      expect(plugin.unifiedQueue.queue[2].data.viewerUsername).toBe('user3');
    });

    test('should call completeProcessing when Connect4 game ends', () => {
      // Setup a mock session
      const mockSession = {
        id: 1,
        game_type: 'connect4',
        player1_username: 'user1',
        player2_username: 'streamer',
        status: 'active'
      };
      
      mockDb.getSession = jest.fn(() => mockSession);
      mockDb.endSession = jest.fn();
      
      // Setup a mock game
      const mockGame = {
        player1: { username: 'user1', role: 'viewer' },
        player2: { username: 'streamer', role: 'streamer' },
        getState: jest.fn(() => ({ board: [] }))
      };
      
      plugin.activeSessions.set(1, mockGame);
      
      // Spy on completeProcessing
      const completeProcessingSpy = jest.spyOn(plugin.unifiedQueue, 'completeProcessing');
      
      // End the game
      plugin.endGame(1, 1, 'win', { winner: 1 });
      
      // Verify completeProcessing was called
      expect(completeProcessingSpy).toHaveBeenCalled();
    });

    test('should not use unified queue for non-Connect4/Chess games', () => {
      // Simulate an active game
      plugin.activeSessions.set(1, {});
      
      // Try to start a non-Connect4 game (assuming 'othergame' exists)
      plugin.handleGameStart('othergame', 'user1', 'User One', 'command', '/start');
      
      // Verify game was queued in old gameQueue, not unified queue
      expect(plugin.gameQueue.length).toBe(1);
      expect(plugin.unifiedQueue.queue.length).toBe(0);
    });
  });

  describe('startGameFromQueue Method', () => {
    test('should start game without queuing when called from unified queue', async () => {
      mockDb.getGameConfig = jest.fn(() => ({
        showChallengeScreen: false
      }));
      
      plugin.startGame = jest.fn(() => ({ success: true, started: true, sessionId: 123 }));
      
      const result = await plugin.startGameFromQueue('connect4', 'user1', 'User One', 'command', '/c4start');
      
      expect(plugin.startGame).toHaveBeenCalledWith('connect4', 'user1', 'User One', 'command', '/c4start');
      expect(result).toMatchObject({ success: true, started: true, sessionId: 123 });
    });

    test('should complete processing if player already has active game', async () => {
      mockDb.getActiveSessionForPlayer = jest.fn(() => ({ id: 999 }));
      
      const completeProcessingSpy = jest.spyOn(plugin.unifiedQueue, 'completeProcessing');
      
      const result = await plugin.startGameFromQueue('connect4', 'user1', 'User One', 'command', '/c4start');
      
      expect(completeProcessingSpy).toHaveBeenCalled();
      expect(result).toMatchObject({
        success: false,
        completed: true,
        error: expect.stringContaining('active game')
      });
    });
  });

  describe('Queue Status', () => {
    test('should return correct queue status', () => {
      // Simulate an active game
      plugin.activeSessions.set(1, {});
      
      // Queue some games
      plugin.handleGameStart('connect4', 'user1', 'User One', 'command', '/c4start');
      plugin.handleGameStart('chess', 'user2', 'User Two', 'command', '/chessstart');
      
      const status = plugin.unifiedQueue.getStatus();
      
      expect(status.queueLength).toBe(2);
      expect(status.queue).toHaveLength(2);
      expect(status.queue[0].gameType).toBe('connect4');
      expect(status.queue[1].gameType).toBe('chess');
    });
  });
});
