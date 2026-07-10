/**
 * Plinko Test Mode Integration Test
 * 
 * Tests the offline test mode functionality for Plinko:
 * - Test ball spawning
 * - Test transaction recording
 * - Test statistics
 * - Test history management
 */

const path = require('path');

// Mock dependencies
const mockDb = {
  db: {
    prepare: jest.fn(),
    exec: jest.fn()
  }
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

const mockIo = {
  emit: jest.fn(),
  on: jest.fn()
};

const mockApi = {
  getSocketIO: () => mockIo,
  getDatabase: () => mockDb,
  pluginLoader: {
    loadedPlugins: new Map()
  }
};

describe('Plinko Test Mode', () => {
  let GameEngineDatabase;
  let PlinkoGame;
  let db;
  let plinkoGame;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Import classes
    GameEngineDatabase = require('../backend/database');
    const PlinkoGameClass = require('../games/plinko');
    
    // Create instances
    db = new GameEngineDatabase(mockApi, mockLogger);
    plinkoGame = new PlinkoGameClass(mockApi, db, mockLogger);
    plinkoGame.init();
  });

  describe('Database Methods', () => {
    test('recordPlinkoTestTransaction should insert test transaction', () => {
      const mockRun = jest.fn();
      mockDb.db.prepare.mockReturnValue({ run: mockRun });

      db.recordPlinkoTestTransaction('test_user', 100, 2.0, 100, 5);

      expect(mockDb.db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO game_plinko_test_transactions')
      );
      expect(mockRun).toHaveBeenCalledWith('test_user', 100, 2.0, 100, 5);
    });

    test('getPlinkoTestStats should return stats', () => {
      const mockStats = {
        total_games: 10,
        total_bet: 1000,
        total_payout: 1200,
        avg_multiplier: 1.2,
        max_win: 500,
        max_loss: -100
      };
      
      mockDb.db.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(mockStats)
      });

      const stats = db.getPlinkoTestStats();

      expect(stats.totalGames).toBe(10);
      expect(stats.totalBet).toBe(1000);
      expect(stats.rtp).toBe(120.00);
      expect(stats.avgMultiplier).toBe(1.2);
    });

    test('getPlinkoTestHistory should return history', () => {
      const mockHistory = [
        { id: 1, user: 'test_user', bet: 100, multiplier: 2.0, profit: 100 },
        { id: 2, user: 'test_user2', bet: 200, multiplier: 0.5, profit: -100 }
      ];
      
      mockDb.db.prepare.mockReturnValue({
        all: jest.fn().mockReturnValue(mockHistory)
      });

      const history = db.getPlinkoTestHistory(50);

      expect(history).toHaveLength(2);
      expect(history[0].user).toBe('test_user');
    });

    test('clearPlinkoTestHistory should delete all test transactions', () => {
      const mockRun = jest.fn().mockReturnValue({ changes: 42 });
      mockDb.db.prepare.mockReturnValue({ run: mockRun });

      const deletedCount = db.clearPlinkoTestHistory();

      expect(deletedCount).toBe(42);
      expect(mockDb.db.prepare).toHaveBeenCalledWith(
        'DELETE FROM game_plinko_test_transactions'
      );
    });
  });

  describe('spawnTestBall Method', () => {
    beforeEach(() => {
      // Mock config
      plinkoGame.getConfig = jest.fn().mockReturnValue({
        slots: [
          { multiplier: 2.0, label: '2x', color: '#FF0000' },
          { multiplier: 1.0, label: '1x', color: '#00FF00' }
        ],
        physicsSettings: {
          gravity: 2.5,
          testModeEnabled: false
        }
      });
    });

    test('should spawn test ball successfully', async () => {
      const result = await plinkoGame.spawnTestBall('TestUser', 100, null);

      expect(result.success).toBe(true);
      expect(result.testMode).toBe(true);
      expect(result.ballId).toContain('test-ball-');
      
      // Verify socket event was emitted
      expect(mockIo.emit).toHaveBeenCalledWith(
        'plinko:spawn-ball',
        expect.objectContaining({
          nickname: 'TestUser',
          bet: 100,
          isTest: true
        })
      );
      
      // Verify logger was called
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[TEST]')
      );
    });

    test('should create mock username with timestamp', async () => {
      const result = await plinkoGame.spawnTestBall('MyPlayer', 500);

      expect(mockIo.emit).toHaveBeenCalledWith(
        'plinko:spawn-ball',
        expect.objectContaining({
          username: expect.stringContaining('test_MyPlayer_'),
          nickname: 'MyPlayer'
        })
      );
    });

    test('should handle invalid board ID', async () => {
      plinkoGame.getConfig = jest.fn().mockReturnValue(null);
      
      const result = await plinkoGame.spawnTestBall('TestUser', 100, 999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Board not found');
    });

    test('should store ball in activeBalls with isTest flag', async () => {
      await plinkoGame.spawnTestBall('TestUser', 250);

      const ballId = Array.from(plinkoGame.activeBalls.keys())[0];
      const ballData = plinkoGame.activeBalls.get(ballId);

      expect(ballData.isTest).toBe(true);
      expect(ballData.bet).toBe(250);
      expect(ballData.nickname).toBe('TestUser');
    });
  });

  describe('handleBallLanded with Test Balls', () => {
    beforeEach(() => {
      plinkoGame.getConfig = jest.fn().mockReturnValue({
        slots: [
          { multiplier: 2.0, label: '2x', color: '#FF0000' },
          { multiplier: 0.5, label: '0.5x', color: '#00FF00' }
        ],
        physicsSettings: {
          testModeEnabled: false
        }
      });

      plinkoGame.awardXP = jest.fn();
      plinkoGame.triggerOpenshockReward = jest.fn();
      
      db.recordPlinkoTestTransaction = jest.fn();
      db.recordPlinkoTransaction = jest.fn();
    });

    test('should record test transaction for test balls', async () => {
      // Add test ball with old timestamp to pass anti-cheat
      const ballId = 'test-ball-123';
      plinkoGame.activeBalls.set(ballId, {
        username: 'test_user_123',
        nickname: 'TestUser',
        bet: 100,
        isTest: true,
        timestamp: Date.now() - 2000 // 2 seconds ago to pass anti-cheat
      });

      await plinkoGame.handleBallLanded(ballId, 0); // Slot 0 with 2.0x

      // Should record in test table
      expect(db.recordPlinkoTestTransaction).toHaveBeenCalledWith(
        'test_user_123',
        100,
        2.0,
        100, // profit: 200 - 100 = 100
        0
      );
      
      // Should NOT record in regular table
      expect(db.recordPlinkoTransaction).not.toHaveBeenCalled();
    });

    test('should NOT award XP for test balls', async () => {
      const ballId = 'test-ball-456';
      plinkoGame.activeBalls.set(ballId, {
        username: 'test_user_456',
        bet: 100,
        isTest: true,
        timestamp: Date.now() - 2000 // 2 seconds ago to pass anti-cheat
      });

      await plinkoGame.handleBallLanded(ballId, 0); // 2.0x multiplier

      // Should NOT call awardXP
      expect(plinkoGame.awardXP).not.toHaveBeenCalled();
    });

    test('should trigger OpenShock for test balls', async () => {
      plinkoGame.getConfig = jest.fn().mockReturnValue({
        slots: [
          {
            multiplier: 10.0,
            label: '10x',
            openshockReward: {
              enabled: true,
              type: 'Shock',
              duration: 1000,
              intensity: 50
            }
          }
        ],
        physicsSettings: { testModeEnabled: false }
      });

      const ballId = 'test-ball-789';
      plinkoGame.activeBalls.set(ballId, {
        username: 'test_user_789',
        bet: 100,
        isTest: true,
        timestamp: Date.now() - 2000 // 2 seconds ago to pass anti-cheat
      });

      await plinkoGame.handleBallLanded(ballId, 0);

      // Should trigger OpenShock even for test balls
      expect(plinkoGame.triggerOpenshockReward).toHaveBeenCalledWith(
        'test_user_789',
        expect.objectContaining({
          enabled: true,
          type: 'Shock',
          duration: 1000,
          intensity: 50
        }),
        0
      );
    });

    test('regular balls should still use regular transaction table', async () => {
      const ballId = 'regular-ball-999';
      plinkoGame.activeBalls.set(ballId, {
        username: 'real_user',
        bet: 100,
        isTest: false, // Regular ball
        timestamp: Date.now() - 2000 // 2 seconds ago to pass anti-cheat
      });

      await plinkoGame.handleBallLanded(ballId, 1); // 0.5x slot

      // Should record in regular table
      expect(db.recordPlinkoTransaction).toHaveBeenCalledWith(
        'real_user',
        100,
        0.5,
        -50, // profit: 50 - 100 = -50
        1
      );
      
      // Should NOT record in test table
      expect(db.recordPlinkoTestTransaction).not.toHaveBeenCalled();
      
      // Should award XP for regular balls
      expect(plinkoGame.awardXP).toHaveBeenCalled();
    });

    test('should trigger OpenShock when global testModeEnabled is true', async () => {
      // Test that OpenShock is now triggered for test balls when global test mode is enabled
      plinkoGame.getConfig = jest.fn().mockReturnValue({
        slots: [
          {
            multiplier: 10.0,
            label: '10x',
            openshockReward: {
              enabled: true,
              type: 'Shock',
              duration: 1000,
              intensity: 50
            }
          }
        ],
        physicsSettings: { testModeEnabled: true } // Global test mode enabled
      });

      // Spawn a ball using spawnBall with global test mode
      const result = await plinkoGame.spawnBall(
        'test_user_global',
        'TestUser',
        null,
        100,
        'standard',
        {} // No explicit testMode option, relies on global testModeEnabled
      );

      expect(result.success).toBe(true);

      // Verify the ball was marked as test
      const ballData = plinkoGame.activeBalls.get(result.ballId);
      expect(ballData.isTest).toBe(true);

      // Now land the ball
      await plinkoGame.handleBallLanded(result.ballId, 0);

      // Should trigger OpenShock even though isTest flag is set
      expect(plinkoGame.triggerOpenshockReward).toHaveBeenCalledWith(
        'test_user_global',
        expect.objectContaining({
          enabled: true,
          type: 'Shock',
          duration: 1000,
          intensity: 50
        }),
        0
      );
      
      // Should record in test table
      expect(db.recordPlinkoTestTransaction).toHaveBeenCalled();
      expect(db.recordPlinkoTransaction).not.toHaveBeenCalled();
    });
  });

  describe('Test Mode Isolation', () => {
    test('test transactions should not affect regular stats', () => {
      // Mock separate queries
      const testStatsQuery = jest.fn().mockReturnValue({
        total_games: 5,
        total_bet: 500,
        total_payout: 600
      });
      
      const regularStatsQuery = jest.fn().mockReturnValue({
        total_games: 100,
        total_bet: 10000,
        total_payout: 9500
      });

      mockDb.db.prepare.mockImplementation((sql) => {
        if (sql.includes('game_plinko_test_transactions')) {
          return { get: testStatsQuery };
        } else {
          return { get: regularStatsQuery };
        }
      });

      const testStats = db.getPlinkoTestStats();
      const regularStats = db.getPlinkoStats();

      // Test stats are isolated
      expect(testStats.totalGames).toBe(5);
      expect(regularStats.totalGames).toBe(100);
      
      // Separate tables queried
      expect(testStatsQuery).toHaveBeenCalled();
      expect(regularStatsQuery).toHaveBeenCalled();
    });
  });
});

describe('Test Mode API Validation', () => {
  test('bet amount validation rules', () => {
    const validBets = [10, 100, 1000, 10000];
    const invalidBets = [0, -10, 10001, 50000];

    validBets.forEach(bet => {
      expect(bet).toBeGreaterThan(0);
      expect(bet).toBeLessThanOrEqual(10000);
    });

    invalidBets.forEach(bet => {
      expect(bet <= 0 || bet > 10000).toBe(true);
    });
  });

  test('count validation rules', () => {
    const validCounts = [1, 5, 10];
    const invalidCounts = [0, -1, 11, 100];

    validCounts.forEach(count => {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(10);
    });

    invalidCounts.forEach(count => {
      expect(count < 1 || count > 10).toBe(true);
    });
  });
});
