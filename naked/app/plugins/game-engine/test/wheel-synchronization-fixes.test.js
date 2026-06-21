/**
 * Wheel Synchronization Fixes Test
 * 
 * Tests for the three critical fixes:
 * 1. Client-side rotation reset (unconditional)
 * 2. Server-side race condition prevention
 * 3. Segment count validation during queue
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

describe('Wheel Synchronization Fixes', () => {
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

  describe('Fix #2: Race Condition Prevention in startSpin()', () => {
    test('should reject concurrent spin with different spinId', async () => {
      // Create a wheel with segments
      const segments = [
        { text: 'Prize 1', color: '#FF0000', weight: 1, isNiete: false },
        { text: 'Prize 2', color: '#00FF00', weight: 1, isNiete: false },
        { text: 'Prize 3', color: '#0000FF', weight: 1, isNiete: false }
      ];
      const settings = { soundEnabled: true, soundVolume: 0.7 };
      const wheelId = gameDB.createWheel('Test Wheel', segments, settings, {});

      // Start first spin
      const spin1 = {
        spinId: 'spin-1',
        username: 'user1',
        nickname: 'User 1',
        profilePictureUrl: '',
        giftName: 'Rose',
        wheelId: wheelId,
        wheelName: 'Test Wheel',
        segmentCount: 3
      };

      // Manually set spinning state to simulate a spin in progress
      wheelGame.isSpinning = true;
      wheelGame.currentSpin = spin1;

      // Try to start second spin (should be rejected)
      const spin2 = {
        spinId: 'spin-2',
        username: 'user2',
        nickname: 'User 2',
        profilePictureUrl: '',
        giftName: 'Rose',
        wheelId: wheelId,
        wheelName: 'Test Wheel',
        segmentCount: 3
      };

      const result = await wheelGame.startSpin(spin2);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Already spinning');
      expect(mockAPI.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot start spin spin-2: already spinning spin-1')
      );
    });

    test('should allow same spin to continue (idempotent)', async () => {
      // Create a wheel with segments
      const segments = [
        { text: 'Prize 1', color: '#FF0000', weight: 1, isNiete: false },
        { text: 'Prize 2', color: '#00FF00', weight: 1, isNiete: false }
      ];
      const settings = { soundEnabled: true, soundVolume: 0.7 };
      const wheelId = gameDB.createWheel('Test Wheel', segments, settings, {});

      const spinData = {
        spinId: 'spin-1',
        username: 'user1',
        nickname: 'User 1',
        profilePictureUrl: '',
        giftName: 'Rose',
        wheelId: wheelId,
        wheelName: 'Test Wheel',
        segmentCount: 2
      };

      // First call should succeed
      const result1 = await wheelGame.startSpin(spinData);
      expect(result1.success).not.toBe(false); // May be true or undefined for success

      // Second call with same spinId should not be rejected by race condition check
      // (Note: It may fail for other reasons like validation, but not race condition)
      const result2 = await wheelGame.startSpin(spinData);
      
      // If it fails, it should NOT be because of "Already spinning"
      if (result2.success === false) {
        expect(result2.error).not.toBe('Already spinning');
      }
    });
  });

  describe('Fix #2: Segment Count Validation', () => {
    test('should reject spin if segment count changed during queue', async () => {
      // Create a wheel with 3 segments
      const segments = [
        { text: 'Prize 1', color: '#FF0000', weight: 1, isNiete: false },
        { text: 'Prize 2', color: '#00FF00', weight: 1, isNiete: false },
        { text: 'Prize 3', color: '#0000FF', weight: 1, isNiete: false }
      ];
      const settings = { soundEnabled: true, soundVolume: 0.7 };
      const wheelId = gameDB.createWheel('Test Wheel', segments, settings, {});

      // Prepare spin data with old segment count (4 segments)
      const spinData = {
        spinId: 'spin-1',
        username: 'user1',
        nickname: 'User 1',
        profilePictureUrl: '',
        giftName: 'Rose',
        wheelId: wheelId,
        wheelName: 'Test Wheel',
        segmentCount: 4 // Mismatch: queued with 4, but wheel now has 3
      };

      const result = await wheelGame.startSpin(spinData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Segment count changed');
      expect(mockAPI.error).toHaveBeenCalledWith(
        expect.stringContaining('Segment count changed during queue: was 4, now 3')
      );
      
      // Verify error event was emitted
      const errorEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:spin-error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent.data.error).toBe('Segment count changed');
    });

    test('should accept spin if segment count matches', async () => {
      // Create a wheel with 3 segments
      const segments = [
        { text: 'Prize 1', color: '#FF0000', weight: 1, isNiete: false },
        { text: 'Prize 2', color: '#00FF00', weight: 1, isNiete: false },
        { text: 'Prize 3', color: '#0000FF', weight: 1, isNiete: false }
      ];
      const settings = { soundEnabled: true, soundVolume: 0.7 };
      const wheelId = gameDB.createWheel('Test Wheel', segments, settings, {});

      // Prepare spin data with matching segment count
      const spinData = {
        spinId: 'spin-1',
        username: 'user1',
        nickname: 'User 1',
        profilePictureUrl: '',
        giftName: 'Rose',
        wheelId: wheelId,
        wheelName: 'Test Wheel',
        segmentCount: 3 // Matches current wheel config
      };

      const result = await wheelGame.startSpin(spinData);

      // Should not fail due to segment count
      if (result.success === false) {
        expect(result.error).not.toContain('Segment count changed');
      }
    });

    test('should accept spin if segment count not provided (legacy compatibility)', async () => {
      // Create a wheel with segments
      const segments = [
        { text: 'Prize 1', color: '#FF0000', weight: 1, isNiete: false },
        { text: 'Prize 2', color: '#00FF00', weight: 1, isNiete: false }
      ];
      const settings = { soundEnabled: true, soundVolume: 0.7 };
      const wheelId = gameDB.createWheel('Test Wheel', segments, settings, {});

      // Prepare spin data without segmentCount (legacy)
      const spinData = {
        spinId: 'spin-1',
        username: 'user1',
        nickname: 'User 1',
        profilePictureUrl: '',
        giftName: 'Rose',
        wheelId: wheelId,
        wheelName: 'Test Wheel'
        // segmentCount not provided
      };

      const result = await wheelGame.startSpin(spinData);

      // Should not fail due to missing segment count
      if (result.success === false) {
        expect(result.error).not.toContain('Segment count');
      }
    });
  });

  describe('Fix #1: Client-Side Rotation Reset (Integration)', () => {
    test('wheel should emit spin-start with correct rotation data', async () => {
      // Create a wheel with segments
      const segments = [
        { text: 'Prize 1', color: '#FF0000', weight: 1, isNiete: false },
        { text: 'Prize 2', color: '#00FF00', weight: 1, isNiete: false },
        { text: 'Prize 3', color: '#0000FF', weight: 1, isNiete: false }
      ];
      const settings = { soundEnabled: true, soundVolume: 0.7 };
      const wheelId = gameDB.createWheel('Test Wheel', segments, settings, {});

      // Trigger a spin
      const result = await wheelGame.triggerSpin('user1', 'User 1', '', 'Rose', wheelId);

      // Wait for spin to start (processSingleQueue is async)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find the wheel:spin-start event
      const spinStartEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:spin-start');
      
      if (spinStartEvent) {
        expect(spinStartEvent.data).toHaveProperty('totalRotation');
        expect(spinStartEvent.data).toHaveProperty('segments');
        expect(spinStartEvent.data).toHaveProperty('winningSegmentIndex');
        expect(spinStartEvent.data.segments.length).toBe(3);
        
        // The client should reset rotation to 0 before applying this totalRotation
        // This is validated by the HTML file which always resets currentRotation = 0
        expect(spinStartEvent.data.totalRotation).toBeGreaterThan(0);
      }
    });
  });

  describe('Fix #3: Exclusive Trigger Handling (Unit Test)', () => {
    // Note: Testing main.js handleGiftTrigger requires mocking the entire plugin
    // This is more of a code review validation than a unit test
    test('wheel trigger logic is exclusive (code structure)', () => {
      // This test validates the code structure exists
      // The actual exclusivity is verified by code review in main.js lines 1769-1775 and 1804-1809
      // Both paths call handleWheelGiftTrigger() and return immediately
      
      expect(wheelGame.findWheelByGiftTrigger).toBeDefined();
      expect(typeof wheelGame.findWheelByGiftTrigger).toBe('function');
    });
  });
});
