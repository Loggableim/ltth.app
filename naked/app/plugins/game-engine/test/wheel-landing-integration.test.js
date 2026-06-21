/**
 * Wheel Segment Landing Integration Test
 * 
 * End-to-end test that validates the complete flow from server calculation
 * to client rendering to landing segment reconstruction.
 */

const WheelGame = require('../games/wheel');
const GameEngineDatabase = require('../backend/database');

// Mock API
const createMockAPI = () => {
  const mockDB = { db: null };
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

/**
 * Client-side landing calculation (from wheel.html)
 */
function clientCalculateLandingSegment(rotation, numSegments) {
  const segmentAngle = 360 / numSegments;
  const finalAngle = ((rotation % 360) + 360) % 360;
  const landingAngle = (360 - finalAngle) % 360;
  let segmentIndex = Math.floor(landingAngle / segmentAngle);
  
  if (segmentIndex < 0) segmentIndex = 0;
  if (segmentIndex >= numSegments) segmentIndex = numSegments - 1;
  
  return segmentIndex;
}

describe('Wheel Segment Landing - End-to-End Integration', () => {
  let wheelGame;
  let gameDB;
  let mockAPI;

  beforeEach(() => {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    
    mockAPI = createMockAPI();
    mockAPI.getDatabase().db = db;
    
    gameDB = new GameEngineDatabase(mockAPI, mockAPI);
    gameDB.initialize();
    
    wheelGame = new WheelGame(mockAPI, gameDB, mockAPI);
    wheelGame.init();
  });

  afterEach(() => {
    if (wheelGame) {
      wheelGame.destroy();
    }
    jest.clearAllMocks();
  });

  /**
   * Core test: Verify that client reconstruction matches server calculation
   */
  test('should have perfect synchronization between server and client for all segments', async () => {
    const testCases = [
      { numSegments: 3, description: '3 segments (120° each)' },
      { numSegments: 5, description: '5 segments (72° each)' },
      { numSegments: 8, description: '8 segments (45° each)' },
      { numSegments: 12, description: '12 segments (30° each)' },
      { numSegments: 16, description: '16 segments (22.5° each)' }
    ];

    for (const testCase of testCases) {
      // Create wheel with specified number of segments
      const segments = Array.from({ length: testCase.numSegments }, (_, i) => ({
        text: `Prize ${i + 1}`,
        color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
        weight: 10,
        isNiete: false
      }));

      const config = wheelGame.getConfig();
      wheelGame.updateConfig(config.id, segments, config.settings);

      // Test each segment
      for (let targetSegment = 0; targetSegment < testCase.numSegments; targetSegment++) {
        // Clear previous events
        mockAPI.emittedEvents.length = 0;

        // Trigger spin targeting this segment
        // Mock the winning segment selection to target specific segment
        const originalCalculate = wheelGame.calculateWinningSegment;
        wheelGame.calculateWinningSegment = jest.fn(() => targetSegment);

        await wheelGame.triggerSpin('testuser', 'Test User', '', 'test gift', config.id);

        // Restore original method
        wheelGame.calculateWinningSegment = originalCalculate;

        // Find the spin-start event
        const spinStartEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:spin-start');
        expect(spinStartEvent).toBeDefined();

        const { totalRotation, winningSegmentIndex } = spinStartEvent.data;
        expect(winningSegmentIndex).toBe(targetSegment);

        // Client-side: Calculate which segment was landed on
        const clientCalculatedSegment = clientCalculateLandingSegment(totalRotation, testCase.numSegments);

        // Verify perfect match
        expect(clientCalculatedSegment).toBe(targetSegment);

        // Clean up for next iteration
        wheelGame.isSpinning = false;
        wheelGame.currentSpin = null;
      }
    }
  });

  /**
   * Test coordinate system alignment
   */
  test('should maintain coordinate system alignment between drawing and calculation', () => {
    const numSegments = 8;
    const segmentAngle = 360 / numSegments; // 45°

    // Test key angles to ensure alignment
    const testAngles = [
      { rotation: 0, expectedSegment: 0, description: 'no rotation - segment 0 at top' },
      { rotation: 360, expectedSegment: 0, description: 'full rotation - back to segment 0' },
      { rotation: 315, expectedSegment: 1, description: '315° rotation - segment 1 at top' },
      { rotation: 270, expectedSegment: 2, description: '270° rotation - segment 2 at top' },
      { rotation: 180, expectedSegment: 4, description: '180° rotation - segment 4 at top' },
      { rotation: 90, expectedSegment: 6, description: '90° rotation - segment 6 at top' },
      { rotation: 45, expectedSegment: 7, description: '45° rotation - segment 7 at top' }
    ];

    for (const test of testAngles) {
      const calculatedSegment = clientCalculateLandingSegment(test.rotation, numSegments);
      expect(calculatedSegment).toBe(test.expectedSegment);
    }
  });

  /**
   * Test edge cases and boundary conditions
   */
  test('should handle edge cases correctly', () => {
    const numSegments = 5;
    const segmentAngle = 72;

    // Test at exact segment boundaries
    for (let i = 0; i < numSegments; i++) {
      // At the start of segment i (exact boundary)
      const boundaryAngle = i * segmentAngle;
      const rotation = 360 - boundaryAngle;
      const calculatedSegment = clientCalculateLandingSegment(rotation, numSegments);
      
      // Should land on segment i (we're at the start of segment i)
      expect(calculatedSegment).toBe(i);
    }
  });

  /**
   * Test multiple full rotations don't affect landing
   */
  test('should handle multiple full rotations correctly', () => {
    const numSegments = 5;
    
    // Same landing position with different number of full rotations
    const baseRotation = 144; // Should land on segment 3
    
    for (let fullRotations = 0; fullRotations <= 10; fullRotations++) {
      const totalRotation = (fullRotations * 360) + baseRotation;
      const calculatedSegment = clientCalculateLandingSegment(totalRotation, numSegments);
      
      // Should always land on segment 3 regardless of full rotations
      expect(calculatedSegment).toBe(3);
    }
  });

  /**
   * Test with actual spin data from server
   */
  test('should correctly interpret actual server spin data', async () => {
    const config = wheelGame.getConfig();
    const numSegments = config.segments.length;

    // Perform multiple spins
    for (let i = 0; i < 10; i++) {
      mockAPI.emittedEvents.length = 0;
      
      await wheelGame.triggerSpin(`user${i}`, `User ${i}`, '', 'gift', config.id);
      
      const spinStartEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:spin-start');
      
      if (spinStartEvent) {
        const { totalRotation, winningSegmentIndex } = spinStartEvent.data;
        const clientCalculated = clientCalculateLandingSegment(totalRotation, numSegments);
        
        expect(clientCalculated).toBe(winningSegmentIndex);
      }
      
      // Clean up
      wheelGame.isSpinning = false;
      wheelGame.currentSpin = null;
    }
  });

  /**
   * Test LANDING_ZONE constants don't break synchronization
   */
  test('should maintain sync even with landing zone offsets', async () => {
    const config = wheelGame.getConfig();
    
    // Perform many spins to test various landing positions within segments
    for (let i = 0; i < 50; i++) {
      mockAPI.emittedEvents.length = 0;
      
      await wheelGame.triggerSpin(`user${i}`, `User ${i}`, '', 'gift', config.id);
      
      const spinStartEvent = mockAPI.emittedEvents.find(e => e.event === 'wheel:spin-start');
      
      if (spinStartEvent) {
        const { totalRotation, winningSegmentIndex, numSegments } = spinStartEvent.data;
        const clientCalculated = clientCalculateLandingSegment(totalRotation, numSegments);
        
        // Must match even with random offsets within landing zone
        expect(clientCalculated).toBe(winningSegmentIndex);
      }
      
      wheelGame.isSpinning = false;
      wheelGame.currentSpin = null;
    }
  });

  /**
   * Test coordinate system documentation is accurate
   */
  test('coordinate system documentation validation', () => {
    // Verify the documented coordinate system matches implementation
    const numSegments = 4; // 90° per segment for easy math
    const segmentAngle = 360 / numSegments;
    
    // Documented: Segment 0 starts at 0° (top), segments increase clockwise
    // Segment 0: 0° to 90°
    // Segment 1: 90° to 180°
    // Segment 2: 180° to 270°
    // Segment 3: 270° to 360°
    
    // Test points in the middle of each segment
    expect(clientCalculateLandingSegment(360 - 45, numSegments)).toBe(0);  // 45° -> segment 0
    expect(clientCalculateLandingSegment(360 - 135, numSegments)).toBe(1); // 135° -> segment 1
    expect(clientCalculateLandingSegment(360 - 225, numSegments)).toBe(2); // 225° -> segment 2
    expect(clientCalculateLandingSegment(360 - 315, numSegments)).toBe(3); // 315° -> segment 3
  });
});
