/**
 * Wheel Queue Double-Counting Bug Test
 * 
 * Tests to verify that the wheel queue logic does not double-count gifts
 * when both unified queue and legacy queue are available.
 * 
 * Bug: When unified queue exists but shouldQueue() returns false (first spin),
 * both queue paths can execute, resulting in double-counting.
 */

describe('Wheel Queue Double-Counting Bug', () => {
  let wheelGame;
  let mockApi;
  let mockDb;
  let mockLogger;
  let mockIo;
  let mockUnifiedQueue;
  let emittedEvents;
  let queuedSpins;

  beforeEach(() => {
    // Reset tracking arrays
    emittedEvents = [];
    queuedSpins = [];

    // Mock Socket.io
    mockIo = {
      emit: jest.fn((event, data) => {
        emittedEvents.push({ event, data });
      })
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Mock unified queue
    mockUnifiedQueue = {
      shouldQueue: jest.fn(),
      queueWheel: jest.fn((spinData) => {
        queuedSpins.push({ type: 'unified', spinData });
        return { queued: true, position: queuedSpins.filter(s => s.type === 'unified').length };
      }),
      isProcessing: false,
      queue: []
    };

    // Mock database
    mockDb = {
      getWheelConfig: jest.fn((wheelId) => ({
        id: 1,
        name: 'Test Wheel',
        enabled: true,
        segments: [
          { text: '100 XP', color: '#FF6B6B', weight: 10, isNiete: false },
          { text: '200 XP', color: '#FFA500', weight: 8, isNiete: false },
          { text: 'Niete', color: '#607D8B', weight: 15, isNiete: true }
        ]
      }))
    };

    // Mock API
    mockApi = {
      getSocketIO: jest.fn(() => mockIo),
      getDatabase: jest.fn(() => mockDb)
    };

    // Create WheelGame instance
    const WheelGame = require('../games/wheel.js');
    wheelGame = new WheelGame(mockApi, mockDb, mockLogger);
    wheelGame.init();
    
    // Set unified queue
    wheelGame.setUnifiedQueue(mockUnifiedQueue);
  });

  describe('Bug Scenario: First Spin with Unified Queue', () => {
    test('should always use unified queue when available - first spin starts immediately', async () => {
      // Setup: First spin, queue empty, unified queue available
      wheelGame.isSpinning = false;
      mockUnifiedQueue.isProcessing = false;
      mockUnifiedQueue.queue = []; // Empty queue

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // With the fix: ALL spins go through unified queue
      // First spin starts immediately (position 1, queued false because immediate)
      expect(result.success).toBe(true);
      expect(result.position).toBe(1);
      // When queue was empty and not processing, queued should be false (immediate start)
      expect(result.queued).toBe(false);

      // Should add to unified queue (which triggers immediate processing)
      expect(mockUnifiedQueue.queueWheel).toHaveBeenCalledTimes(1);

      // Should NOT add to legacy queue
      expect(wheelGame.spinQueue.length).toBe(0);

      // Should have exactly ONE active spin
      expect(wheelGame.activeSpins.size).toBe(1);

      // Verify log entry indicates starting (not queued)
      const startLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin starting via unified queue')
      );
      expect(startLogs.length).toBe(1);
    });

    test('should queue spin when something is already processing', async () => {
      // Setup: Unified queue is already processing something
      wheelGame.isSpinning = false;
      mockUnifiedQueue.isProcessing = true; // Something is already processing
      mockUnifiedQueue.queue = []; // But queue is empty (current item being processed)

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // Should be queued (not immediate because something is processing)
      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
      expect(result.position).toBe(1);

      // Should add to unified queue ONLY
      expect(mockUnifiedQueue.queueWheel).toHaveBeenCalledTimes(1);

      // Should NOT add to legacy queue
      expect(wheelGame.spinQueue.length).toBe(0);

      // Verify log entry indicates queued
      const queuedLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin queued via unified queue')
      );
      expect(queuedLogs.length).toBe(1);
    });

    test('should queue spin when there are already items in queue', async () => {
      // Setup: Queue already has items waiting
      wheelGame.isSpinning = true;
      mockUnifiedQueue.isProcessing = true;
      mockUnifiedQueue.queue = [{ type: 'wheel', data: { username: 'other' } }]; // One item waiting

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // Should be queued
      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);

      // Should add to unified queue ONLY
      expect(mockUnifiedQueue.queueWheel).toHaveBeenCalledTimes(1);

      // Should NOT add to legacy queue
      expect(wheelGame.spinQueue.length).toBe(0);
    });
  });

  describe('Legacy Queue Fallback (No Unified Queue)', () => {
    beforeEach(() => {
      // Remove unified queue
      wheelGame.unifiedQueue = null;
    });

    test('should use legacy queue when spinning and no unified queue available', async () => {
      // Setup: Currently spinning, no unified queue
      wheelGame.isSpinning = true;

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // Should be queued
      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
      expect(result.position).toBe(1);

      // Should add to legacy queue
      expect(wheelGame.spinQueue.length).toBe(1);

      // Should emit legacy queue event
      const queueEvents = emittedEvents.filter(e => e.event === 'wheel:spin-queued');
      expect(queueEvents.length).toBe(1);

      // Should have legacy queue log
      const legacyQueueLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin queued (legacy):')
      );
      expect(legacyQueueLogs.length).toBe(1);
    });

    test('should start immediately when not spinning and no unified queue', async () => {
      // Setup: Not spinning, no unified queue, empty queue
      wheelGame.isSpinning = false;

      // Mock startSpin
      wheelGame.startSpin = jest.fn(async (spinData) => {
        return { success: true, spinId: spinData.spinId, queued: false };
      });

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // Should start immediately
      expect(result.success).toBe(true);
      expect(result.queued).toBe(false);

      // Should call startSpin
      expect(wheelGame.startSpin).toHaveBeenCalledTimes(1);

      // Should NOT add to legacy queue
      expect(wheelGame.spinQueue.length).toBe(0);

      // Should NOT emit queue event
      const queueEvents = emittedEvents.filter(e => e.event === 'wheel:spin-queued');
      expect(queueEvents.length).toBe(0);
    });

    test('should queue in legacy queue when queue already has items', async () => {
      // Setup: Not spinning, but queue has items
      wheelGame.isSpinning = false;
      wheelGame.spinQueue.push({ spinId: 'existing_spin', username: 'otheruser' });

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // After fix: Should be queued (position 2) to maintain FIFO order
      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
      expect(result.position).toBe(2);

      // Should have 2 items in queue
      expect(wheelGame.spinQueue.length).toBe(2);

      // Should emit legacy queue event
      const queueEvents = emittedEvents.filter(e => e.event === 'wheel:spin-queued');
      expect(queueEvents.length).toBe(1);
    });
  });

  describe('Multiple Rapid Spins', () => {
    test('should queue all spins in order when using unified queue', async () => {
      // Setup: All spins should go through unified queue
      wheelGame.isSpinning = false;
      mockUnifiedQueue.isProcessing = false;
      mockUnifiedQueue.queue = []; // Start with empty queue

      // Simulate queue behavior:
      // - The code checks isProcessing and queue.length BEFORE calling queueWheel
      // - First call: queue empty, not processing -> immediate
      // - After first call: isProcessing = true, queue might be empty (item being processed)
      // - Second call: isProcessing is true -> queued
      // - Third call: isProcessing is true -> queued
      let queuePosition = 0;
      mockUnifiedQueue.queueWheel = jest.fn((spinData) => {
        queuePosition++;
        // Simulate what the real queue does: after first item, isProcessing becomes true
        if (queuePosition === 1) {
          // First item starts processing immediately
          mockUnifiedQueue.isProcessing = true;
        }
        queuedSpins.push({ type: 'unified', spinData });
        return { queued: true, position: queuePosition };
      });

      // Trigger 3 spins rapidly
      const result1 = await wheelGame.triggerSpin('user1', 'User 1', null, 'Rose', 1);
      const result2 = await wheelGame.triggerSpin('user2', 'User 2', null, 'Rose', 1);
      const result3 = await wheelGame.triggerSpin('user3', 'User 3', null, 'Rose', 1);

      // First spin: immediate (wasIdle=true because isProcessing was false and queue was empty)
      expect(result1.queued).toBe(false);
      expect(result1.position).toBe(1);

      // Second and third: queued (wasIdle=false because isProcessing is now true)
      expect(result2.queued).toBe(true);
      expect(result2.position).toBe(2);
      expect(result3.queued).toBe(true);
      expect(result3.position).toBe(3);

      // Unified queue should have been called for ALL spins
      expect(mockUnifiedQueue.queueWheel).toHaveBeenCalledTimes(3);

      // Legacy queue should be empty
      expect(wheelGame.spinQueue.length).toBe(0);

      // Should have 1 starting log (first spin) and 2 queued logs (subsequent spins)
      const startingLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin starting via unified queue')
      );
      expect(startingLogs.length).toBe(1);

      const queuedLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin queued via unified queue')
      );
      expect(queuedLogs.length).toBe(2);

      // Should have NO legacy queue logs
      const legacyQueueLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin queued (legacy):')
      );
      expect(legacyQueueLogs.length).toBe(0);
    });
  });

  describe('Socket Event Emission', () => {
    test('should always use unified queue path when available', async () => {
      // Setup: First spin
      wheelGame.isSpinning = false;
      mockUnifiedQueue.isProcessing = false;

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // Should have called unified queue
      expect(mockUnifiedQueue.queueWheel).toHaveBeenCalledTimes(1);
      
      // First spin should start immediately (queued: false)
      expect(result.success).toBe(true);
      expect(result.queued).toBe(false);
      expect(result.position).toBe(1);
    });
  });
});
