/**
 * Queue Size Limits and Gift Deduplication Tests
 * 
 * Tests to verify:
 * 1. Queue size limits prevent unbounded growth and crashes
 * 2. Gift deduplication prevents double spins from rapid/duplicate events
 */

describe('Queue Size Limits and Gift Deduplication', () => {
  let unifiedQueue;
  let gameEnginePlugin;
  let mockLogger;
  let mockIo;
  let mockApi;
  let mockDb;
  let emittedEvents;

  beforeEach(() => {
    // Reset tracking
    emittedEvents = [];

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Mock Socket.io
    mockIo = {
      emit: jest.fn((event, data) => {
        emittedEvents.push({ event, data });
      })
    };

    // Mock API
    mockApi = {
      getSocketIO: jest.fn(() => mockIo),
      log: jest.fn((msg, level) => {
        mockLogger[level || 'info'](msg);
      }),
      pluginLoader: {
        loadedPlugins: new Map()
      }
    };

    // Mock database
    mockDb = {
      initialize: jest.fn(),
      getWheelConfig: jest.fn((wheelId) => ({
        id: wheelId || 1,
        name: 'Test Wheel',
        enabled: true,
        segments: [
          { text: '100 XP', color: '#FF6B6B', weight: 10, isNiete: false },
          { text: '200 XP', color: '#FFA500', weight: 8, isNiete: false },
          { text: 'Niete', color: '#607D8B', weight: 15, isNiete: true }
        ]
      })),
      findWheelByGiftTrigger: jest.fn(() => ({ id: 1, name: 'Test Wheel' })),
      getTriggers: jest.fn(() => [])
    };

    // Create UnifiedQueueManager instance
    const UnifiedQueueManager = require('../backend/unified-queue.js');
    unifiedQueue = new UnifiedQueueManager(mockLogger, mockIo);

    // Create GameEnginePlugin instance
    const GameEnginePlugin = require('../main.js');
    gameEnginePlugin = new GameEnginePlugin(mockApi);
    gameEnginePlugin.db = mockDb;
    
    // Mock wheelGame
    gameEnginePlugin.wheelGame = {
      findWheelByGiftTrigger: mockDb.findWheelByGiftTrigger,
      triggerSpin: jest.fn(() => ({ success: true, queued: false, spinId: 'test_spin' }))
    };
  });

  describe('Queue Size Limits', () => {
    test('should accept items when queue is below limit', () => {
      const spinData = {
        spinId: 'spin_1',
        username: 'user1',
        nickname: 'User 1',
        wheelId: 1
      };

      const result = unifiedQueue.queueWheel(spinData);

      expect(result.queued).toBe(true);
      expect(result.position).toBe(1);
      expect(result.error).toBeUndefined();
      expect(unifiedQueue.queue.length).toBe(1);
    });

    test('should reject items when queue is at max size', () => {
      // Fill queue to max (50 items)
      for (let i = 0; i < unifiedQueue.MAX_QUEUE_SIZE; i++) {
        unifiedQueue.queue.push({
          type: 'wheel',
          data: { spinId: `spin_${i}`, username: `user${i}` },
          timestamp: Date.now()
        });
      }

      const spinData = {
        spinId: 'spin_overflow',
        username: 'overflow_user',
        nickname: 'Overflow User',
        wheelId: 1
      };

      const result = unifiedQueue.queueWheel(spinData);

      expect(result.queued).toBe(false);
      expect(result.position).toBe(0);
      expect(result.error).toBe('Queue is full');
      expect(unifiedQueue.queue.length).toBe(unifiedQueue.MAX_QUEUE_SIZE);
    });

    test('should emit queue-full event when rejecting items', () => {
      // Fill queue to max
      for (let i = 0; i < unifiedQueue.MAX_QUEUE_SIZE; i++) {
        unifiedQueue.queue.push({
          type: 'wheel',
          data: { spinId: `spin_${i}`, username: `user${i}` },
          timestamp: Date.now()
        });
      }

      const spinData = {
        spinId: 'spin_overflow',
        username: 'overflow_user',
        nickname: 'Overflow User',
        wheelId: 1
      };

      unifiedQueue.queueWheel(spinData);

      const queueFullEvents = emittedEvents.filter(e => e.event === 'unified-queue:queue-full');
      expect(queueFullEvents.length).toBe(1);
      expect(queueFullEvents[0].data.type).toBe('wheel');
      expect(queueFullEvents[0].data.username).toBe('overflow_user');
      expect(queueFullEvents[0].data.queueLength).toBe(unifiedQueue.MAX_QUEUE_SIZE);
    });

    test('should warn when queue reaches warning threshold', () => {
      // Fill queue to warning threshold (40 items)
      for (let i = 0; i < unifiedQueue.QUEUE_WARNING_SIZE; i++) {
        unifiedQueue.queue.push({
          type: 'wheel',
          data: { spinId: `spin_${i}`, username: `user${i}` },
          timestamp: Date.now()
        });
      }

      const spinData = {
        spinId: 'spin_warning',
        username: 'warning_user',
        nickname: 'Warning User',
        wheelId: 1
      };

      unifiedQueue.queueWheel(spinData);

      const warnings = mockLogger.warn.mock.calls.filter(call => 
        call[0].includes('Queue size warning')
      );
      expect(warnings.length).toBeGreaterThan(0);
    });

    test('should apply limits to all game types', () => {
      // Test Plinko
      for (let i = 0; i < unifiedQueue.MAX_QUEUE_SIZE; i++) {
        unifiedQueue.queue.push({
          type: 'plinko',
          data: { username: `user${i}` },
          timestamp: Date.now()
        });
      }

      const plinkoResult = unifiedQueue.queuePlinko({ username: 'overflow', nickname: 'Overflow' });
      expect(plinkoResult.queued).toBe(false);
      expect(plinkoResult.error).toBe('Queue is full');

      // Reset queue
      unifiedQueue.queue = [];

      // Test Connect4
      for (let i = 0; i < unifiedQueue.MAX_QUEUE_SIZE; i++) {
        unifiedQueue.queue.push({
          type: 'connect4',
          data: { viewerUsername: `user${i}` },
          timestamp: Date.now()
        });
      }

      const connect4Result = unifiedQueue.queueConnect4({ 
        viewerUsername: 'overflow', 
        viewerNickname: 'Overflow' 
      });
      expect(connect4Result.queued).toBe(false);
      expect(connect4Result.error).toBe('Queue is full');

      // Reset queue
      unifiedQueue.queue = [];

      // Test Chess
      for (let i = 0; i < unifiedQueue.MAX_QUEUE_SIZE; i++) {
        unifiedQueue.queue.push({
          type: 'chess',
          data: { viewerUsername: `user${i}` },
          timestamp: Date.now()
        });
      }

      const chessResult = unifiedQueue.queueChess({ 
        viewerUsername: 'overflow', 
        viewerNickname: 'Overflow' 
      });
      expect(chessResult.queued).toBe(false);
      expect(chessResult.error).toBe('Queue is full');
    });
  });

  describe('Gift Deduplication', () => {
    test('should process first gift event normally', () => {
      const giftData = {
        uniqueId: 'user1',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 1',
        repeatEnd: true
      };

      // Should not block first event
      gameEnginePlugin.handleGiftTrigger(giftData);

      expect(gameEnginePlugin.recentGiftEvents.size).toBe(1);
      const dedupKey = 'user1_Rose_5655';
      expect(gameEnginePlugin.recentGiftEvents.has(dedupKey)).toBe(true);
    });

    test('should block duplicate gift events within dedup window', () => {
      const giftData = {
        uniqueId: 'user1',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 1',
        repeatEnd: true
      };

      // First event
      gameEnginePlugin.handleGiftTrigger(giftData);
      const firstEventCallCount = mockDb.findWheelByGiftTrigger.mock.calls.length;

      // Second event immediately after (should be blocked)
      gameEnginePlugin.handleGiftTrigger(giftData);
      const secondEventCallCount = mockDb.findWheelByGiftTrigger.mock.calls.length;

      // Second event should be blocked
      expect(secondEventCallCount).toBe(firstEventCallCount);

      // Check for warning log
      const warnings = mockLogger.warn.mock.calls.filter(call => 
        call[0].includes('[GIFT DEDUP] Duplicate gift event blocked')
      );
      expect(warnings.length).toBeGreaterThan(0);
    });

    test('should allow gift event after dedup window expires', (done) => {
      const giftData = {
        uniqueId: 'user1',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 1',
        repeatEnd: true
      };

      // First event
      gameEnginePlugin.handleGiftTrigger(giftData);
      const firstEventCallCount = gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length;

      // Wait for dedup window to expire (1200ms for safety margin)
      setTimeout(() => {
        // Second event after window
        gameEnginePlugin.handleGiftTrigger(giftData);
        const secondEventCallCount = gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length;

        // Second event should be processed
        expect(secondEventCallCount).toBeGreaterThan(firstEventCallCount);
        done();
      }, 1200);
    }, 2000);

    test('should allow different users with same gift', () => {
      const giftData1 = {
        uniqueId: 'user1',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 1',
        repeatEnd: true
      };

      const giftData2 = {
        uniqueId: 'user2',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 2',
        repeatEnd: true
      };

      gameEnginePlugin.handleGiftTrigger(giftData1);
      const firstCallCount = gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length;

      gameEnginePlugin.handleGiftTrigger(giftData2);
      const secondCallCount = gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length;

      // Both should be processed
      expect(secondCallCount).toBeGreaterThan(firstCallCount);
      expect(gameEnginePlugin.recentGiftEvents.size).toBe(2);
    });

    test('should allow same user with different gifts', () => {
      const giftData1 = {
        uniqueId: 'user1',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 1',
        repeatEnd: true
      };

      const giftData2 = {
        uniqueId: 'user1',
        giftName: 'Diamond',
        giftId: '8888',
        nickname: 'User 1',
        repeatEnd: true
      };

      gameEnginePlugin.handleGiftTrigger(giftData1);
      const firstCallCount = gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length;

      gameEnginePlugin.handleGiftTrigger(giftData2);
      const secondCallCount = gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length;

      // Both should be processed
      expect(secondCallCount).toBeGreaterThan(firstCallCount);
      expect(gameEnginePlugin.recentGiftEvents.size).toBe(2);
    });

    test('should clean up old entries during cleanup interval', () => {
      // Manually add some old entries
      const now = Date.now();
      gameEnginePlugin.recentGiftEvents.set('old_user1_Rose_5655', now - 2000); // 2 seconds old
      gameEnginePlugin.recentGiftEvents.set('old_user2_Diamond_8888', now - 1500); // 1.5 seconds old
      gameEnginePlugin.recentGiftEvents.set('new_user3_TikTok_1234', now - 500); // 0.5 seconds old

      expect(gameEnginePlugin.recentGiftEvents.size).toBe(3);

      // Manually trigger cleanup logic
      for (const [key, timestamp] of gameEnginePlugin.recentGiftEvents.entries()) {
        if (now - timestamp > gameEnginePlugin.GIFT_DEDUP_WINDOW_MS) {
          gameEnginePlugin.recentGiftEvents.delete(key);
        }
      }

      // Old entries should be removed, new entry should remain
      expect(gameEnginePlugin.recentGiftEvents.size).toBe(1);
      expect(gameEnginePlugin.recentGiftEvents.has('new_user3_TikTok_1234')).toBe(true);
    });

    test('should block gifts during repeatEnd=false (streak)', () => {
      const giftData = {
        uniqueId: 'user1',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 1',
        repeatEnd: false // Part of a streak
      };

      gameEnginePlugin.handleGiftTrigger(giftData);

      // Should not process (early return)
      expect(gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length).toBe(0);
      // Should not add to dedup map (because it was not processed)
      expect(gameEnginePlugin.recentGiftEvents.size).toBe(0);
    });
  });

  describe('repeatCount handling', () => {
    test('should trigger wheel spin once when repeatCount is 1 (default)', () => {
      const giftData = {
        uniqueId: 'user1',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 1',
        repeatEnd: true,
        repeatCount: 1
      };

      gameEnginePlugin.handleGiftTrigger(giftData);

      expect(gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length).toBe(1);
    });

    test('should trigger wheel spin N times when repeatCount is N', () => {
      const giftData = {
        uniqueId: 'user1',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 1',
        repeatEnd: true,
        repeatCount: 5
      };

      gameEnginePlugin.handleGiftTrigger(giftData);

      expect(gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length).toBe(5);
    });

    test('should cap repeatCount at MAX_REPEAT_TRIGGERS (50)', () => {
      const giftData = {
        uniqueId: 'user1',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 1',
        repeatEnd: true,
        repeatCount: 999
      };

      gameEnginePlugin.handleGiftTrigger(giftData);

      expect(gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length).toBe(gameEnginePlugin.MAX_REPEAT_TRIGGERS);
    });

    test('should treat missing repeatCount as 1', () => {
      const giftData = {
        uniqueId: 'user1',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 1',
        repeatEnd: true
        // no repeatCount
      };

      gameEnginePlugin.handleGiftTrigger(giftData);

      expect(gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length).toBe(1);
    });

    test('should only record one dedup entry even with repeatCount > 1', () => {
      const giftData = {
        uniqueId: 'user1',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'User 1',
        repeatEnd: true,
        repeatCount: 10
      };

      gameEnginePlugin.handleGiftTrigger(giftData);

      // dedup map should have exactly one entry for this gift
      const dedupKey = 'user1_Rose_5655';
      expect(gameEnginePlugin.recentGiftEvents.has(dedupKey)).toBe(true);
      expect(gameEnginePlugin.recentGiftEvents.size).toBe(1);
      // wheel was triggered 10 times
      expect(gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length).toBe(10);
    });
  });


  describe('Integration: Queue Limits + Deduplication', () => {
    test('should handle rapid duplicate gifts with full queue gracefully', () => {
      // Fill queue to max
      for (let i = 0; i < unifiedQueue.MAX_QUEUE_SIZE; i++) {
        unifiedQueue.queue.push({
          type: 'wheel',
          data: { spinId: `spin_${i}`, username: `user${i}` },
          timestamp: Date.now()
        });
      }

      // Try to add duplicate gift events
      const giftData = {
        uniqueId: 'overflow_user',
        giftName: 'Rose',
        giftId: '5655',
        nickname: 'Overflow User',
        repeatEnd: true
      };

      // Update wheelGame mock to return queue full error
      gameEnginePlugin.wheelGame.triggerSpin = jest.fn(() => ({ success: false, error: 'Queue is full' }));
      
      // First attempt (would hit queue limit)
      gameEnginePlugin.handleGiftTrigger(giftData);

      // Second immediate attempt (should be blocked by dedup before reaching queue)
      gameEnginePlugin.handleGiftTrigger(giftData);

      // Only one trigger attempt should be made
      expect(gameEnginePlugin.wheelGame.triggerSpin.mock.calls.length).toBe(1);
    });
  });
});
