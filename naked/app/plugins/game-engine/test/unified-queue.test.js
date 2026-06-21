/**
 * Unified Queue System Test
 * 
 * Tests the unified queue system that manages both Plinko and Wheel games
 */

const UnifiedQueueManager = require('../backend/unified-queue');

// Mock logger
const createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
});

// Mock Socket.IO
const createMockIO = () => ({
  emit: jest.fn()
});

// Mock Plinko game
const createMockPlinkoGame = () => ({
  spawnBalls: jest.fn().mockResolvedValue({ success: true })
});

// Mock Wheel game
const createMockWheelGame = () => ({
  startSpin: jest.fn().mockResolvedValue({ success: true })
});

// Mock Slot game
const createMockSlotGame = () => ({
  startSpinFromQueue: jest.fn().mockResolvedValue({ success: true })
});

describe('Unified Queue Manager', () => {
  let queueManager;
  let mockLogger;
  let mockIO;
  let mockPlinkoGame;
  let mockWheelGame;
  let mockSlotGame;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockIO = createMockIO();
    queueManager = new UnifiedQueueManager(mockLogger, mockIO);
    mockPlinkoGame = createMockPlinkoGame();
    mockWheelGame = createMockWheelGame();
    mockSlotGame = createMockSlotGame();
    
    queueManager.setPlinkoGame(mockPlinkoGame);
    queueManager.setWheelGame(mockWheelGame);
    queueManager.setSlotGame(mockSlotGame);
  });

  afterEach(() => {
    if (queueManager) {
      queueManager.destroy();
    }
  });

  describe('Initialization', () => {
    test('Queue should be empty initially', () => {
      expect(queueManager.queue.length).toBe(0);
      expect(queueManager.isProcessing).toBe(false);
    });

    test('Should set game references correctly', () => {
      expect(queueManager.plinkoGame).toBe(mockPlinkoGame);
      expect(queueManager.wheelGame).toBe(mockWheelGame);
    });
  });

  describe('Queue Operations', () => {
    test('Should queue Plinko drop', () => {
      queueManager.isProcessing = true;
      const dropData = {
        username: 'testuser',
        nickname: 'Test User',
        betAmount: 100,
        count: 1,
        batchId: 'test123'
      };

      const result = queueManager.queuePlinko(dropData);

      expect(result.queued).toBe(true);
      expect(result.position).toBe(1);
      expect(queueManager.queue.length).toBe(1);
      expect(mockIO.emit).toHaveBeenCalledWith('unified-queue:plinko-queued', expect.any(Object));
    });

    test('Should queue Wheel spin', () => {
      queueManager.isProcessing = true;
      const spinData = {
        username: 'testuser',
        nickname: 'Test User',
        spinId: 'spin123',
        wheelId: 1
      };

      const result = queueManager.queueWheel(spinData);

      expect(result.queued).toBe(true);
      expect(result.position).toBe(1);
      expect(queueManager.queue.length).toBe(1);
      expect(mockIO.emit).toHaveBeenCalledWith('unified-queue:wheel-queued', expect.any(Object));
    });

    test('Should maintain FIFO order with mixed games', () => {
      queueManager.isProcessing = true;
      const plinkoData = {
        username: 'plinkouser',
        betAmount: 100,
        count: 1
      };

      const wheelData = {
        username: 'wheeluser',
        spinId: 'spin123'
      };

      queueManager.queuePlinko(plinkoData);
      queueManager.queueWheel(wheelData);
      queueManager.queuePlinko({ ...plinkoData, username: 'plinkouser2' });

      expect(queueManager.queue.length).toBe(3);
      expect(queueManager.queue[0].type).toBe('plinko');
      expect(queueManager.queue[0].data.username).toBe('plinkouser');
      expect(queueManager.queue[1].type).toBe('wheel');
      expect(queueManager.queue[1].data.username).toBe('wheeluser');
      expect(queueManager.queue[2].type).toBe('plinko');
      expect(queueManager.queue[2].data.username).toBe('plinkouser2');
    });
  });

  describe('Queue Processing', () => {
    test('Should process Plinko item', async () => {
      const dropData = {
        username: 'testuser',
        nickname: 'Test User',
        betAmount: 100,
        count: 1,
        batchId: 'test123'
      };

      queueManager.queuePlinko(dropData);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockPlinkoGame.spawnBalls).toHaveBeenCalledWith(
        'testuser',
        'Test User',
        undefined,
        100,
        1,
        expect.objectContaining({
          batchId: 'test123',
          forceStart: true
        })
      );
    });

    test('Should process Wheel item', async () => {
      const spinData = {
        username: 'testuser',
        nickname: 'Test User',
        spinId: 'spin123',
        wheelId: 1
      };

      queueManager.queueWheel(spinData);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockWheelGame.startSpin).toHaveBeenCalledWith(spinData);
    });

    test('Should switch unified overlay before processing Plinko item', async () => {
      const dropData = {
        username: 'testuser',
        nickname: 'Test User',
        betAmount: 100,
        count: 1,
        batchId: 'batch123',
        boardId: 2
      };

      await queueManager.processPlinkoItem(dropData);

      expect(mockIO.emit).toHaveBeenCalledWith(
        'game-engine:game-switched',
        expect.objectContaining({
          gameType: 'plinko',
          sessionId: 'batch123',
          useUnified: true
        })
      );
    });

    test('Should switch unified overlay before processing Wheel item', async () => {
      const spinData = {
        username: 'testuser',
        nickname: 'Test User',
        spinId: 'spin123',
        wheelId: 1
      };

      await queueManager.processWheelItem(spinData);

      expect(mockIO.emit).toHaveBeenCalledWith(
        'game-engine:game-switched',
        expect.objectContaining({
          gameType: 'wheel',
          sessionId: 'spin123',
          useUnified: true
        })
      );
    });

    test('Should switch unified overlay before processing Slot item', async () => {
      const spinData = {
        username: 'testuser',
        nickname: 'Test User',
        spinId: 'slot-spin123',
        machineId: 1
      };

      await queueManager.processSlotItem(spinData);

      expect(mockIO.emit).toHaveBeenCalledWith(
        'game-engine:game-switched',
        expect.objectContaining({
          gameType: 'slot',
          sessionId: 'slot-spin123',
          useUnified: true
        })
      );
    });

    test('Should process items in FIFO order', async () => {
      const plinkoData = {
        username: 'plinkouser',
        nickname: 'Plinko User',
        betAmount: 100,
        count: 1
      };

      const wheelData = {
        username: 'wheeluser',
        nickname: 'Wheel User',
        spinId: 'spin123'
      };

      // Queue both
      queueManager.queuePlinko(plinkoData);
      queueManager.queueWheel(wheelData);

      // Wait for first to process
      await new Promise(resolve => setTimeout(resolve, 100));

      // Plinko should be called first
      expect(mockPlinkoGame.spawnBalls).toHaveBeenCalled();
      expect(mockWheelGame.startSpin).not.toHaveBeenCalled();

      // Complete processing
      queueManager.completeProcessing();

      // Wait for second to process
      await new Promise(resolve => setTimeout(resolve, 350));

      // Now wheel should be called
      expect(mockWheelGame.startSpin).toHaveBeenCalled();
    });

    test('Should not process when already processing', async () => {
      queueManager.isProcessing = true;

      const dropData = {
        username: 'testuser',
        betAmount: 100,
        count: 1
      };

      queueManager.queuePlinko(dropData);

      await queueManager.processNext();

      // Should not process because already processing
      expect(mockPlinkoGame.spawnBalls).not.toHaveBeenCalled();
    });
  });

  describe('Queue Status', () => {
    test('Should return correct status', () => {
      queueManager.isProcessing = true;
      const dropData = {
        username: 'testuser',
        nickname: 'Test User',
        betAmount: 100,
        count: 1,
        batchId: 'batch-1'
      };

      queueManager.queuePlinko(dropData);

      const status = queueManager.getStatus();

      expect(status.queueLength).toBe(1);
      expect(status.queue.length).toBe(1);
      expect(status.queue[0].type).toBe('plinko');
      expect(status.queue[0].username).toBe('testuser');
      expect(status.queue[0].nickname).toBe('Test User');
      expect(status.queue[0].batchId).toBe('batch-1');
    });

    test('shouldQueue should return true when processing', () => {
      queueManager.isProcessing = true;
      expect(queueManager.shouldQueue()).toBe(true);
    });

    test('shouldQueue should return true when queue not empty', () => {
      queueManager.queuePlinko({ username: 'test', betAmount: 100, count: 1 });
      expect(queueManager.shouldQueue()).toBe(true);
    });

    test('shouldQueue should return false when idle', () => {
      expect(queueManager.shouldQueue()).toBe(false);
    });
  });

  describe('Complete Processing', () => {
    test('Should mark processing as complete', () => {
      queueManager.isProcessing = true;
      queueManager.currentItem = { type: 'plinko', data: {} };

      queueManager.completeProcessing();

      expect(queueManager.isProcessing).toBe(false);
      expect(queueManager.currentItem).toBe(null);
      expect(mockIO.emit).toHaveBeenCalledWith('unified-queue:status', expect.any(Object));
    });

    test('Should process next item after completion', async () => {
      const dropData1 = { username: 'user1', betAmount: 100, count: 1 };
      const dropData2 = { username: 'user2', betAmount: 200, count: 1 };

      queueManager.queuePlinko(dropData1);
      queueManager.queuePlinko(dropData2);

      // Wait for first to start processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(queueManager.isProcessing).toBe(true);

      // Complete first item
      queueManager.completeProcessing();

      // Wait for next to process
      await new Promise(resolve => setTimeout(resolve, 350));

      // Second item should have been processed
      expect(mockPlinkoGame.spawnBalls).toHaveBeenCalledTimes(2);
    });
  });

  describe('Clear Queue', () => {
    test('Should clear all items from queue', () => {
      queueManager.isProcessing = true;
      queueManager.queuePlinko({ username: 'user1', betAmount: 100, count: 1 });
      queueManager.queueWheel({ username: 'user2', spinId: 'spin1' });
      queueManager.queuePlinko({ username: 'user3', betAmount: 300, count: 1 });

      expect(queueManager.queue.length).toBe(3);

      queueManager.clearQueue();

      expect(queueManager.queue.length).toBe(0);
      expect(mockIO.emit).toHaveBeenCalledWith('unified-queue:cleared', { count: 3 });
    });
  });

  describe('Error Handling', () => {
    test('Should handle missing Plinko game', async () => {
      queueManager.plinkoGame = null;

      const dropData = {
        username: 'testuser',
        betAmount: 100,
        count: 1
      };

      queueManager.queuePlinko(dropData);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Plinko game not set'));
    });

    test('Should handle missing Wheel game', async () => {
      queueManager.wheelGame = null;

      const spinData = {
        username: 'testuser',
        spinId: 'spin123'
      };

      queueManager.queueWheel(spinData);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Wheel game not set'));
    });

    test('Should handle processing timeout', async () => {
      jest.useFakeTimers();

      const dropData = {
        username: 'testuser',
        betAmount: 100,
        count: 1
      };

      // Make spawnBalls hang
      mockPlinkoGame.spawnBalls = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 200000))
      );

      queueManager.queuePlinko(dropData);

      // Advance time to trigger timeout
      jest.advanceTimersByTime(queueManager.MAX_PROCESSING_TIME + 1000);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Processing timeout'));
      expect(queueManager.isProcessing).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('Destroy', () => {
    test('Should clean up resources', () => {
      queueManager.queuePlinko({ username: 'user1', betAmount: 100, count: 1 });
      queueManager.isProcessing = true;

      queueManager.destroy();

      expect(queueManager.queue.length).toBe(0);
      expect(queueManager.isProcessing).toBe(false);
      expect(queueManager.plinkoGame).toBe(null);
      expect(queueManager.wheelGame).toBe(null);
    });
  });
});
