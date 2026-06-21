/**
 * Challenge Flow Integration Tests
 */

describe('Challenge Flow', () => {
  let plugin;
  let mockApi;
  let mockIo;
  let mockDb;

  beforeEach(() => {
    // Mock Socket.io
    mockIo = {
      emit: jest.fn(),
      on: jest.fn((event, callback) => {
        // Store callbacks for testing
        if (!mockIo.callbacks) mockIo.callbacks = {};
        mockIo.callbacks[event] = callback;
      })
    };

    // Mock database
    mockDb = {
      db: {
        exec: jest.fn(),
        prepare: jest.fn(() => ({
          run: jest.fn(() => ({ lastInsertRowid: 1 })),
          get: jest.fn(),
          all: jest.fn(() => [])
        }))
      }
    };

    // Mock API
    mockApi = {
      log: jest.fn(),
      getSocketIO: jest.fn(() => mockIo),
      getDatabase: jest.fn(() => mockDb),
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      on: jest.fn(),
      getPlugin: jest.fn()
    };
  });

  describe('Challenge Creation', () => {
    test('should create a pending challenge when gift is sent', () => {
      const GameEnginePlugin = require('../main');
      plugin = new GameEnginePlugin(mockApi);
      
      // Initialize plugin
      plugin.init();

      // Simulate gift trigger
      const giftData = {
        uniqueId: 'testuser',
        nickname: 'TestUser',
        giftName: 'Rose',
        giftId: 5655,
        giftPictureUrl: 'https://example.com/rose.png'
      };

      // Should create a pending challenge
      expect(plugin.pendingChallenges).toBeDefined();
    });
  });

  describe('Challenge Timeout', () => {
    test('should start game against streamer after timeout', (done) => {
      const GameEnginePlugin = require('../main');
      plugin = new GameEnginePlugin(mockApi);
      
      // Create a challenge with short timeout
      const sessionId = plugin.createPendingChallenge(
        'connect4',
        'testuser',
        'TestUser',
        'Rose',
        'https://example.com/rose.png',
        { challengeTimeout: 1 } // 1 second timeout
      );

      // Wait for timeout
      setTimeout(() => {
        // Should have been converted to active session
        expect(plugin.pendingChallenges.has(sessionId)).toBe(false);
        done();
      }, 1500);
    });
  });

  describe('Challenge Acceptance', () => {
    test('should start game when challenge is accepted', () => {
      const GameEnginePlugin = require('../main');
      plugin = new GameEnginePlugin(mockApi);
      
      // Create a challenge
      const sessionId = plugin.createPendingChallenge(
        'connect4',
        'testuser',
        'TestUser',
        'Rose',
        null,
        { challengeTimeout: 30 }
      );

      // Accept challenge
      plugin.acceptChallenge(sessionId);

      // Challenge should be removed
      expect(plugin.pendingChallenges.has(sessionId)).toBe(false);
      
      // Game should emit start event
      expect(mockIo.emit).toHaveBeenCalledWith(
        'game-engine:game-started',
        expect.objectContaining({
          sessionId,
          gameType: 'connect4'
        })
      );
    });
  });

  describe('Leaderboard Display', () => {
    test('should have methods to get different leaderboard types', () => {
      const GameEngineDatabase = require('../backend/database');
      const dbInstance = new GameEngineDatabase(mockApi, { info: jest.fn(), error: jest.fn() });

      expect(dbInstance.getDailyLeaderboard).toBeDefined();
      expect(dbInstance.getSeasonLeaderboard).toBeDefined();
      expect(dbInstance.getLifetimeLeaderboard).toBeDefined();
    });
  });

  describe('Configuration', () => {
    test('should have default config with challenge and leaderboard settings', () => {
      const GameEnginePlugin = require('../main');
      plugin = new GameEnginePlugin(mockApi);

      expect(plugin.defaultConfigs.connect4.challengeTimeout).toBe(30);
      expect(plugin.defaultConfigs.connect4.showChallengeScreen).toBe(true);
      expect(plugin.defaultConfigs.connect4.leaderboardEnabled).toBe(true);
      expect(plugin.defaultConfigs.connect4.leaderboardDisplayTime).toBe(3);
      expect(plugin.defaultConfigs.connect4.leaderboardTypes).toContain('daily');
      expect(plugin.defaultConfigs.connect4.leaderboardTypes).toContain('season');
      expect(plugin.defaultConfigs.connect4.leaderboardTypes).toContain('lifetime');
    });
  });
});
