/**
 * Wheel Segment Validation and Synchronization Test
 * 
 * Tests that validate segment data integrity and synchronization
 * between backend and frontend to prevent field/prize mismatches
 */

const WheelGame = require('../games/wheel');
const GameEngineDatabase = require('../backend/database');

// Mock API with socket.io tracking
const createMockAPI = () => {
  const mockDB = {
    db: null // Will be set with in-memory database
  };

  const emittedEvents = [];
  
  const mockSocketIO = {
    emit: jest.fn((event, data) => {
      emittedEvents.push({ event, data });
    }),
    on: () => {}
  };

  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };

  return {
    getSocketIO: () => mockSocketIO,
    getDatabase: () => mockDB,
    log: (msg, level) => mockLogger[level]?.(msg),
    emittedEvents,
    ...mockLogger
  };
};

describe('Wheel Segment Validation and Synchronization', () => {
  let wheelGame;
  let gameDB;
  let mockAPI;

  beforeEach(() => {
    // Create in-memory SQLite database for testing
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    
    mockAPI = createMockAPI();
    mockAPI.getDatabase().db = db;
    
    // Initialize database
    gameDB = new GameEngineDatabase(mockAPI, mockAPI);
    gameDB.initialize();
    
    // Create wheel game instance
    wheelGame = new WheelGame(mockAPI, gameDB, mockAPI);
    wheelGame.init();
  });

  afterEach(() => {
    if (wheelGame) {
      wheelGame.destroy();
    }
    jest.clearAllMocks();
  });

  describe('triggerSpin validation', () => {
    test('should reject spin if wheel not found', async () => {
      const result = await wheelGame.triggerSpin('user1', 'User 1', '', 'gift', 999);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(mockAPI.error).toHaveBeenCalled();
    });

    test('should reject spin if wheel has no segments', async () => {
      const config = wheelGame.getConfig();
      const wheelId = config.id;
      
      // Update with empty segments
      try {
        wheelGame.updateConfig(wheelId, [], config.settings);
        // Should throw error
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('empty');
      }
    });

    test('should reject spin if segments have invalid properties', async () => {
      const config = wheelGame.getConfig();
      const wheelId = config.id;
      
      // Create invalid segments (missing required properties)
      const invalidSegments = [
        { text: '', color: '#FF0000', weight: 10 }, // Empty text
        { text: 'Valid', color: null, weight: 10 }, // Null color
        { text: 'Valid', color: '#00FF00', weight: 'invalid' } // Invalid weight type
      ];
      
      try {
        wheelGame.updateConfig(wheelId, invalidSegments, config.settings);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('invalid');
      }
    });

    test('should include segment count in queued spin event', async () => {
      const config = wheelGame.getConfig();
      
      // Trigger first spin (will start immediately)
      await wheelGame.triggerSpin('user1', 'User 1', '', 'gift1');
      
      // Trigger second spin (will be queued)
      const result = await wheelGame.triggerSpin('user2', 'User 2', '', 'gift2');
      
      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
      
      // Check emitted event
      const queueEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:spin-queued');
      expect(queueEvent).toBeDefined();
      expect(queueEvent.data.segmentCount).toBe(config.segments.length);
      expect(queueEvent.data.wheelId).toBe(config.id);
      expect(queueEvent.data.timestamp).toBeDefined();
    });

    test('should store segment count in spin data', async () => {
      const config = wheelGame.getConfig();
      
      const result = await wheelGame.triggerSpin('user1', 'User 1', '', 'gift1');
      
      expect(result.success).toBe(true);
      
      // Check stored spin data
      const spinData = wheelGame.activeSpins.get(result.spinId);
      expect(spinData).toBeDefined();
      expect(spinData.segmentCount).toBe(config.segments.length);
    });
  });

  describe('startSpin validation', () => {
    test('should validate config exists', async () => {
      const invalidSpinData = {
        spinId: 'test-spin-1',
        username: 'user1',
        nickname: 'User 1',
        wheelId: 999, // Non-existent wheel
        wheelName: 'Test',
        timestamp: Date.now()
      };
      
      const result = await wheelGame.startSpin(invalidSpinData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(mockAPI.error).toHaveBeenCalled();
    });

    test('should validate segments is an array', async () => {
      const config = wheelGame.getConfig();
      const wheelId = config.id;
      
      // Manually corrupt segments in database (simulate edge case)
      const db = mockAPI.getDatabase().db;
      const corruptSegments = 'not-an-array'; // String instead of array
      db.prepare('UPDATE game_wheel_config SET segments = ? WHERE id = ?')
        .run(JSON.stringify(corruptSegments), wheelId);
      
      const spinData = {
        spinId: 'test-spin-1',
        username: 'user1',
        nickname: 'User 1',
        wheelId: wheelId,
        wheelName: config.name,
        timestamp: Date.now()
      };
      
      const result = await wheelGame.startSpin(spinData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid');
    });

    test('should reject spin if segment count changed during queue', async () => {
      const config = wheelGame.getConfig();
      const originalSegmentCount = config.segments.length;
      
      // Create spin data with original segment count
      const spinData = {
        spinId: 'test-spin-1',
        username: 'user1',
        nickname: 'User 1',
        wheelId: config.id,
        wheelName: config.name,
        segmentCount: originalSegmentCount,
        timestamp: Date.now()
      };
      
      // Modify segments before starting spin
      const newSegments = [
        ...config.segments,
        { text: 'New Prize', color: '#FF00FF', weight: 5, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] }
      ];
      wheelGame.updateConfig(config.id, newSegments, config.settings);
      
      // Start spin - should be REJECTED due to segment count mismatch
      const result = await wheelGame.startSpin(spinData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Segment count changed');
      expect(mockAPI.error).toHaveBeenCalledWith(
        expect.stringContaining('Segment count changed during queue')
      );
      
      // Verify error event was emitted
      const errorEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:spin-error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent.data.error).toBe('Segment count changed');
    });

    test('should validate winning segment index is within bounds', async () => {
      const config = wheelGame.getConfig();
      
      // Mock calculateWinningSegment to return invalid index
      const originalCalc = wheelGame.calculateWinningSegment;
      wheelGame.calculateWinningSegment = jest.fn(() => 999); // Out of bounds
      
      const spinData = {
        spinId: 'test-spin-1',
        username: 'user1',
        nickname: 'User 1',
        wheelId: config.id,
        wheelName: config.name,
        timestamp: Date.now()
      };
      
      const result = await wheelGame.startSpin(spinData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid segment calculation');
      expect(mockAPI.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid winning segment index')
      );
      
      // Restore original function
      wheelGame.calculateWinningSegment = originalCalc;
    });

    test('should include debug logging for rotation calculation', async () => {
      const config = wheelGame.getConfig();
      
      const result = await wheelGame.triggerSpin('user1', 'User 1', '', 'gift1');
      
      expect(result.success).toBe(true);
      expect(mockAPI.debug).toHaveBeenCalledWith(
        expect.stringContaining('Wheel rotation calc')
      );
    });

    test('should emit wheel:spin-start with complete validated data', async () => {
      const config = wheelGame.getConfig();
      
      const result = await wheelGame.triggerSpin('user1', 'User 1', 'http://pic.url', 'gift1');
      
      expect(result.success).toBe(true);
      
      // Check emitted event
      const spinStartEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:spin-start');
      expect(spinStartEvent).toBeDefined();
      expect(spinStartEvent.data).toMatchObject({
        spinId: result.spinId,
        username: 'user1',
        nickname: 'User 1',
        wheelId: config.id,
        wheelName: config.name,
        segments: config.segments,
        settings: config.settings,
        numSegments: config.segments.length
      });
      expect(spinStartEvent.data.winningSegmentIndex).toBeGreaterThanOrEqual(0);
      expect(spinStartEvent.data.winningSegmentIndex).toBeLessThan(config.segments.length);
      expect(spinStartEvent.data.winningSegment).toBeDefined();
      expect(spinStartEvent.data.winningSegment.index).toBe(spinStartEvent.data.winningSegmentIndex);
      expect(spinStartEvent.data.totalRotation).toBeGreaterThan(0);
      expect(spinStartEvent.data.segmentAngle).toBe(360 / config.segments.length);
      expect(spinStartEvent.data.timestamp).toBeDefined();
    });
  });

  describe('updateConfig validation and emission', () => {
    test('should validate segments array', () => {
      const config = wheelGame.getConfig();
      
      expect(() => {
        wheelGame.updateConfig(config.id, null, config.settings);
      }).toThrow('array');
      
      expect(() => {
        wheelGame.updateConfig(config.id, 'not-array', config.settings);
      }).toThrow('array');
      
      expect(() => {
        wheelGame.updateConfig(config.id, [], config.settings);
      }).toThrow('empty');
    });

    test('should validate segment properties', () => {
      const config = wheelGame.getConfig();
      
      const invalidSegments = [
        { color: '#FF0000', weight: 10 } // Missing text
      ];
      
      expect(() => {
        wheelGame.updateConfig(config.id, invalidSegments, config.settings);
      }).toThrow('invalid properties');
    });

    test('should emit wheel:config-updated with validated complete data', () => {
      const config = wheelGame.getConfig();
      const newSegments = [
        { text: 'Prize 1', color: '#FF0000', weight: 10, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
        { text: 'Prize 2', color: '#00FF00', weight: 8, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] }
      ];
      
      wheelGame.updateConfig(config.id, newSegments, config.settings);
      
      // Check emitted event
      const updateEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:config-updated');
      expect(updateEvent).toBeDefined();
      expect(updateEvent.data).toMatchObject({
        wheelId: config.id,
        wheelName: config.name,
        numSegments: 2,
        segments: newSegments,
        settings: config.settings
      });
      expect(updateEvent.data.timestamp).toBeDefined();
    });

    test('should get fresh config after update for emission', () => {
      const config = wheelGame.getConfig();
      const newSegments = [
        { text: 'Fresh Prize', color: '#0000FF', weight: 10, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] }
      ];
      
      wheelGame.updateConfig(config.id, newSegments, config.settings);
      
      // Get config again to verify it was updated
      const updatedConfig = wheelGame.getConfig(config.id);
      expect(updatedConfig.segments.length).toBe(1);
      expect(updatedConfig.segments[0].text).toBe('Fresh Prize');
      
      // Check emission matches updated config
      const updateEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:config-updated');
      expect(updateEvent.data.segments).toEqual(updatedConfig.segments);
    });
  });

  describe('calculateWinningSegment', () => {
    test('should always return valid segment index', () => {
      const config = wheelGame.getConfig();
      const segments = config.segments;
      
      // Test 100 times to ensure randomness doesn't break it
      for (let i = 0; i < 100; i++) {
        const index = wheelGame.calculateWinningSegment(segments);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(segments.length);
      }
    });

    test('should respect segment weights', () => {
      const segments = [
        { text: 'Common', color: '#FF0000', weight: 90 },
        { text: 'Rare', color: '#0000FF', weight: 10 }
      ];
      
      const results = { 0: 0, 1: 0 };
      
      // Test 1000 times to get statistical distribution
      for (let i = 0; i < 1000; i++) {
        const index = wheelGame.calculateWinningSegment(segments);
        results[index]++;
      }
      
      // Common should appear roughly 9x more than rare
      // Allow some variance (7x to 11x)
      const ratio = results[0] / results[1];
      expect(ratio).toBeGreaterThan(7);
      expect(ratio).toBeLessThan(11);
    });

    test('should handle single segment', () => {
      const segments = [
        { text: 'Only Prize', color: '#FF0000', weight: 100 }
      ];
      
      // Always return 0 for single segment
      for (let i = 0; i < 10; i++) {
        const index = wheelGame.calculateWinningSegment(segments);
        expect(index).toBe(0);
      }
    });

    test('should skip zero-weight segments', () => {
      const segments = [
        { text: 'Skip', color: '#FF0000', weight: 0 },
        { text: 'Pick', color: '#00FF00', weight: 10 }
      ];
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

      const index = wheelGame.calculateWinningSegment(segments);

      expect(index).toBe(1);
      randomSpy.mockRestore();
    });
  });

  describe('handleSpinComplete synchronization', () => {
    test('should prefer expected segment index when reported mismatch', async () => {
      const config = wheelGame.getConfig();
      const spinResult = await wheelGame.triggerSpin('user1', 'User 1', '', 'gift1');

      expect(spinResult.success).toBe(true);

      const expectedIndex = spinResult.winningSegment.index;
      const reportedIndex = (expectedIndex + 1) % config.segments.length;

      const completionResult = await wheelGame.handleSpinComplete(
        spinResult.spinId,
        expectedIndex,
        reportedIndex
      );

      expect(completionResult.success).toBe(true);
      expect(completionResult.segmentIndex).toBe(expectedIndex);
      expect(completionResult.syncMismatch).toBe(true);

      const spinResultEvents = mockAPI.emittedEvents.filter(e => e.event === 'wheel:spin-result');
      const spinResultEvent = spinResultEvents[spinResultEvents.length - 1];

      expect(spinResultEvent).toBeDefined();
      expect(spinResultEvent.data.segmentIndex).toBe(expectedIndex);
      expect(spinResultEvent.data.expectedSegmentIndex).toBe(expectedIndex);
      expect(spinResultEvent.data.reportedSegmentIndex).toBe(reportedIndex);
      expect(spinResultEvent.data.syncMismatch).toBe(true);
      expect(spinResultEvent.data.prizeAudio).toBeDefined();
      expect(mockAPI.warn).toHaveBeenCalledWith(
        expect.stringContaining('desync')
      );
    });

    test('should record expected segment index when overlay reports a mismatch', async () => {
      const config = wheelGame.getConfig();
      const spinResult = await wheelGame.triggerSpin('user1', 'User 1', '', 'gift1');
      const recordSpy = jest.spyOn(gameDB, 'recordWheelWin');

      expect(spinResult.success).toBe(true);

      const expectedIndex = spinResult.winningSegment.index;
      const reportedIndex = (expectedIndex + 1) % config.segments.length;

      const completionResult = await wheelGame.handleSpinComplete(
        spinResult.spinId,
        reportedIndex
      );

      expect(completionResult.success).toBe(true);
      expect(completionResult.segmentIndex).toBe(expectedIndex);
      expect(recordSpy).toHaveBeenCalledWith(
        'user1',
        'User 1',
        config.segments[expectedIndex].text,
        expectedIndex,
        'gift1',
        config.id
      );
    });
  });

  describe('Integration: Full spin cycle with validation', () => {
    test('should maintain segment consistency through entire spin cycle', async () => {
      const config = wheelGame.getConfig();
      const originalSegments = [...config.segments];
      
      // Trigger spin
      const result = await wheelGame.triggerSpin('user1', 'User 1', '', 'gift1');
      expect(result.success).toBe(true);
      
      // Get spin-start event
      const spinStartEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:spin-start');
      expect(spinStartEvent).toBeDefined();
      
      // Verify segments match original config
      expect(spinStartEvent.data.segments).toEqual(originalSegments);
      expect(spinStartEvent.data.numSegments).toBe(originalSegments.length);
      
      // Verify winning segment is valid
      const winningIndex = spinStartEvent.data.winningSegmentIndex;
      expect(winningIndex).toBeGreaterThanOrEqual(0);
      expect(winningIndex).toBeLessThan(originalSegments.length);
      expect(spinStartEvent.data.winningSegment.text).toBe(originalSegments[winningIndex].text);
    });

    test('should reject spin if config updated during queue with segment count change', async () => {
      const config = wheelGame.getConfig();
      const originalSegments = [...config.segments];
      
      // Trigger first spin (starts immediately)
      const spin1 = await wheelGame.triggerSpin('user1', 'User 1', '', 'gift1');
      expect(spin1.success).toBe(true);
      
      // Trigger second spin (queued)
      const spin2 = await wheelGame.triggerSpin('user2', 'User 2', '', 'gift2');
      expect(spin2.queued).toBe(true);
      
      // Update config with DIFFERENT segment count while spin is queued
      const newSegments = [
        { text: 'Updated Prize', color: '#FFFF00', weight: 10, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] }
      ];
      wheelGame.updateConfig(config.id, newSegments, config.settings);
      
      // Manually process queued spin
      wheelGame.isSpinning = false;
      wheelGame.currentSpin = null;
      await wheelGame.processNextSpin();
      
      // Second spin should have been REJECTED due to segment count change
      const errorEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:spin-error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent.data.error).toBe('Segment count changed');
      expect(errorEvent.data.username).toBe('user2');
      
      // Should have logged error about segment count change
      expect(mockAPI.error).toHaveBeenCalledWith(
        expect.stringContaining('Segment count changed during queue')
      );
    });
  });
});
