/**
 * Plinko Stability Tests
 * Tests for anti-cheat flight time validation, default configuration, and cleanup notifications
 */

const PlinkoGame = require('../games/plinko');

describe('Plinko Stability Improvements', () => {
  let plinkoGame;
  let mockApi;
  let mockSocketIO;
  let mockDb;
  let mockLogger;
  let emittedEvents;

  beforeEach(() => {
    emittedEvents = [];

    // Mock Socket.IO
    mockSocketIO = {
      emit: jest.fn((event, data) => {
        emittedEvents.push({ event, data });
      })
    };

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Mock Database
    mockDb = {
      getPlinkoConfig: jest.fn(() => null),
      updatePlinkoConfig: jest.fn(),
      recordPlinkoTransaction: jest.fn(),
      getPlinkoStats: jest.fn(() => ({})),
      getPlinkUserStats: jest.fn(() => []),
      getPlinkoLeaderboard: jest.fn(() => [])
    };

    // Mock API
    mockApi = {
      getSocketIO: () => mockSocketIO,
      getDatabase: () => mockDb,
      pluginLoader: {
        loadedPlugins: new Map([
          ['viewer-leaderboard', {
            instance: {
              db: {
                getViewerProfile: jest.fn((username) => ({
                  username: username,
                  xp: 1000,
                  nickname: 'TestUser'
                })),
                addXP: jest.fn()
              }
            }
          }]
        ])
      }
    };

    plinkoGame = new PlinkoGame(mockApi, mockDb, mockLogger);
    plinkoGame.init();
  });

  afterEach(() => {
    plinkoGame.destroy();
  });

  describe('Default Configuration', () => {
    test('should provide default slots configuration when none exists', () => {
      const config = plinkoGame.getConfig();
      
      expect(config).toBeDefined();
      expect(config.slots).toBeDefined();
      expect(config.slots.length).toBe(9);
      
      // Verify symmetric distribution
      expect(config.slots[0].multiplier).toBe(10);
      expect(config.slots[8].multiplier).toBe(10);
      expect(config.slots[1].multiplier).toBe(5);
      expect(config.slots[7].multiplier).toBe(5);
      expect(config.slots[4].multiplier).toBe(0.5); // Center slot
    });

    test('default slots should have proper structure', () => {
      const config = plinkoGame.getConfig();
      
      config.slots.forEach(slot => {
        expect(slot).toHaveProperty('multiplier');
        expect(slot).toHaveProperty('label');
        expect(slot).toHaveProperty('color');
        expect(typeof slot.multiplier).toBe('number');
        expect(typeof slot.label).toBe('string');
        expect(typeof slot.color).toBe('string');
      });
    });

    test('should make game playable out-of-the-box', async () => {
      const config = plinkoGame.getConfig();
      expect(config.slots.length).toBeGreaterThan(0);
      
      // Spawn a ball and verify it can be processed
      const result = await plinkoGame.spawnBall(
        'testuser',
        'TestUser',
        'https://example.com/pic.jpg',
        100,
        'standard',
        { testMode: true }
      );
      
      expect(result.success).toBe(true);
      expect(result.ballId).toBeDefined();
    });
  });

  describe('Anti-Cheat Flight Time Validation', () => {
    test('should reject ball landing too quickly (not in test mode)', async () => {
      // Override config to ensure testModeEnabled is false
      mockDb.getPlinkoConfig = jest.fn(() => ({
        slots: [
          { multiplier: 10, label: '10x', color: '#FFD700' }
        ],
        physicsSettings: {
          testModeEnabled: false
        },
        giftMappings: {}
      }));
      
      // Clear cached config
      plinkoGame.cachedConfig = null;

      // Spawn a ball without test mode
      const spawnResult = await plinkoGame.spawnBall(
        'testuser',
        'TestUser',
        'https://example.com/pic.jpg',
        100,
        'standard',
        { testMode: false, skipValidation: true, skipDeduction: true }
      );
      
      expect(spawnResult.success).toBe(true);
      const ballId = spawnResult.ballId;

      // Immediately try to land the ball (before MIN_FLIGHT_TIME_MS)
      const landResult = await plinkoGame.handleBallLanded(ballId, 0);
      
      // Should be rejected
      expect(landResult.success).toBe(false);
      expect(landResult.error).toBe('Invalid drop time');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Ball landed too quickly')
      );
    });

    test('should allow ball landing after sufficient time (not in test mode)', async () => {
      // Use fake timers for better time control
      jest.useFakeTimers();
      
      // Override config to ensure testModeEnabled is false
      mockDb.getPlinkoConfig = jest.fn(() => ({
        slots: [
          { multiplier: 10, label: '10x', color: '#FFD700' }
        ],
        physicsSettings: {
          testModeEnabled: false
        },
        giftMappings: {}
      }));
      
      // Clear cached config
      plinkoGame.cachedConfig = null;

      // Spawn a ball without test mode
      const spawnResult = await plinkoGame.spawnBall(
        'testuser',
        'TestUser',
        'https://example.com/pic.jpg',
        100,
        'standard',
        { testMode: false, skipValidation: true, skipDeduction: true }
      );
      
      expect(spawnResult.success).toBe(true);
      const ballId = spawnResult.ballId;

      // Advance time by 1500ms to simulate ball flight
      jest.advanceTimersByTime(1500);

      // Try to land the ball
      const landResult = await plinkoGame.handleBallLanded(ballId, 0);
      
      // Should be accepted
      expect(landResult.success).toBe(true);
      expect(landResult.username).toBe('testuser');
      
      // Restore real timers
      jest.useRealTimers();
    });

    test('should bypass flight time validation in test mode', async () => {
      // Override config with testModeEnabled = true
      mockDb.getPlinkoConfig = jest.fn(() => ({
        slots: [
          { multiplier: 10, label: '10x', color: '#FFD700' }
        ],
        physicsSettings: {
          testModeEnabled: true
        },
        giftMappings: {}
      }));
      
      // Clear cached config
      plinkoGame.cachedConfig = null;

      // Spawn a ball with test mode
      const spawnResult = await plinkoGame.spawnBall(
        'testuser',
        'TestUser',
        'https://example.com/pic.jpg',
        100,
        'standard',
        { testMode: true }
      );
      
      expect(spawnResult.success).toBe(true);
      const ballId = spawnResult.ballId;

      // Immediately try to land the ball (should work in test mode)
      const landResult = await plinkoGame.handleBallLanded(ballId, 0);
      
      // Should be accepted even with instant landing
      expect(landResult.success).toBe(true);
      expect(landResult.username).toBe('testuser');
    });
  });

  describe('Cleanup Notifications', () => {
    test('should emit notification when refunding stuck ball', () => {
      // Manually add a stuck ball
      const ballId = 'stuck_ball_123';
      plinkoGame.activeBalls.set(ballId, {
        username: 'stuckuser',
        nickname: 'StuckUser',
        profilePictureUrl: 'https://example.com/stuck.jpg',
        bet: 500,
        ballType: 'standard',
        timestamp: Date.now() - 150000 // 2.5 minutes ago (exceeds MAX_BALL_AGE_MS)
      });

      // Run cleanup
      plinkoGame.cleanupOldBalls();

      // Check notification was emitted
      const notificationEvent = emittedEvents.find(e => e.event === 'plinko:notification');
      expect(notificationEvent).toBeDefined();
      expect(notificationEvent.data.message).toContain('Stuck ball refunded');
      expect(notificationEvent.data.message).toContain('StuckUser');
      expect(notificationEvent.data.username).toBe('stuckuser');
      expect(notificationEvent.data.amount).toBe(500);
      expect(notificationEvent.data.type).toBe('refund');
    });

    test('should refund XP for stuck ball', () => {
      const viewerLeaderboard = mockApi.pluginLoader.loadedPlugins.get('viewer-leaderboard');
      
      // Manually add a stuck ball
      const ballId = 'stuck_ball_456';
      plinkoGame.activeBalls.set(ballId, {
        username: 'refunduser',
        nickname: 'RefundUser',
        profilePictureUrl: '',
        bet: 250,
        ballType: 'standard',
        timestamp: Date.now() - 150000
      });

      // Run cleanup
      plinkoGame.cleanupOldBalls();

      // Verify XP was refunded (addXP called with positive amount)
      expect(viewerLeaderboard.instance.db.addXP).toHaveBeenCalledWith(
        'refunduser',
        250,
        'plinko_win',
        expect.objectContaining({
          winnings: 250,
          multiplier: 1.0
        })
      );
    });

    test('should not emit notification if no stuck balls', () => {
      // Run cleanup with no stuck balls
      plinkoGame.cleanupOldBalls();

      // Check no notification was emitted
      const notificationEvent = emittedEvents.find(e => e.event === 'plinko:notification');
      expect(notificationEvent).toBeUndefined();
    });

    test('should handle ball without nickname gracefully', () => {
      // Manually add a stuck ball without nickname
      const ballId = 'stuck_ball_789';
      plinkoGame.activeBalls.set(ballId, {
        username: 'usernameonly',
        nickname: null,
        profilePictureUrl: '',
        bet: 100,
        ballType: 'standard',
        timestamp: Date.now() - 150000
      });

      // Run cleanup
      plinkoGame.cleanupOldBalls();

      // Check notification uses username as fallback
      const notificationEvent = emittedEvents.find(e => e.event === 'plinko:notification');
      expect(notificationEvent).toBeDefined();
      expect(notificationEvent.data.message).toContain('usernameonly');
    });
  });
});
