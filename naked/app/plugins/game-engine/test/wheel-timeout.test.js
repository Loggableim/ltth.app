/**
 * Wheel Timeout Test
 * 
 * Tests the wheel spin safety timeout and queue timeout mechanisms
 * to ensure the queue doesn't get stuck when overlay doesn't respond
 */

const UnifiedQueueManager = require('../backend/unified-queue');
const WheelGame = require('../games/wheel');

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

// Mock database
const createMockDB = () => ({
  getWheelConfig: jest.fn().mockReturnValue({
    id: 1,
    name: 'Test Wheel',
    segments: [
      { text: 'Prize 1', color: '#FF0000', weight: 10, isNiete: false, isShock: false },
      { text: 'Prize 2', color: '#00FF00', weight: 10, isNiete: false, isShock: false },
      { text: 'Prize 3', color: '#0000FF', weight: 10, isNiete: false, isShock: false }
    ],
    settings: {
      spinDuration: 5000,
      winnerDisplayDuration: 5,
      infoScreenEnabled: false,
      infoScreenDuration: 0
    }
  }),
  recordWheelWin: jest.fn()
});

// Mock API
const createMockAPI = () => ({
  getSocketIO: jest.fn().mockReturnValue(createMockIO()),
  pluginLoader: {
    loadedPlugins: new Map()
  }
});

describe('Wheel Timeout Mechanism', () => {
  let queueManager;
  let wheelGame;
  let mockLogger;
  let mockIO;
  let mockDB;
  let mockAPI;

  beforeEach(() => {
    jest.useFakeTimers();
    mockLogger = createMockLogger();
    mockIO = createMockIO();
    mockDB = createMockDB();
    mockAPI = createMockAPI();
    
    // Ensure mockAPI returns the same mockIO instance
    mockAPI.getSocketIO = jest.fn().mockReturnValue(mockIO);
    
    queueManager = new UnifiedQueueManager(mockLogger, mockIO);
    wheelGame = new WheelGame(mockAPI, mockDB, mockLogger);
    wheelGame.setUnifiedQueue(queueManager);
    
    queueManager.setWheelGame(wheelGame);
  });

  afterEach(() => {
    jest.useRealTimers();
    if (queueManager) {
      queueManager.destroy();
    }
    if (wheelGame) {
      wheelGame.destroy();
    }
  });

  describe('Game-specific Timeouts', () => {
    test('Should calculate correct timeout for wheel game', () => {
      const item = {
        type: 'wheel',
        data: {
          spinDuration: 5000,
          settings: {
            winnerDisplayDuration: 5,
            infoScreenEnabled: true,
            infoScreenDuration: 5
          }
        }
      };

      const timeout = queueManager.getTimeoutForGame(item);
      
      // Expected: 5000 (spin) + 5000 (winner) + 5000 (info) + 10000 (buffer) = 25000ms
      expect(timeout).toBe(25000);
    });

    test('Should use predefined timeout for plinko', () => {
      const item = { type: 'plinko', data: {} };
      const timeout = queueManager.getTimeoutForGame(item);
      expect(timeout).toBe(60000); // 60 seconds
    });

    test('Should use predefined timeout for connect4', () => {
      const item = { type: 'connect4', data: {} };
      const timeout = queueManager.getTimeoutForGame(item);
      expect(timeout).toBe(300000); // 5 minutes
    });

    test('Should use predefined timeout for chess', () => {
      const item = { type: 'chess', data: {} };
      const timeout = queueManager.getTimeoutForGame(item);
      expect(timeout).toBe(600000); // 10 minutes
    });

    test('Should use fallback timeout for unknown game type', () => {
      const item = { type: 'unknown', data: {} };
      const timeout = queueManager.getTimeoutForGame(item);
      expect(timeout).toBe(180000); // 3 minutes (fallback)
    });
  });

  describe('Wheel Spin Safety Timeout', () => {
    test('Should set safety timeout when spin starts', async () => {
      const spinData = {
        username: 'testuser',
        nickname: 'Test User',
        wheelId: 1,
        spinId: 'test-spin-1'
      };

      await wheelGame.startSpin(spinData);

      // Verify safety timeout was set
      expect(wheelGame.spinSafetyTimeout).not.toBeNull();
      expect(wheelGame.isSpinning).toBe(true);
    });

    test('Should clear safety timeout when overlay responds', async () => {
      const spinData = {
        username: 'testuser',
        nickname: 'Test User',
        wheelId: 1,
        spinId: 'test-spin-2'
      };

      await wheelGame.startSpin(spinData);
      expect(wheelGame.spinSafetyTimeout).not.toBeNull();

      // Simulate overlay response
      await wheelGame.handleSpinComplete('test-spin-2', 0);

      // Verify safety timeout was cleared
      expect(wheelGame.spinSafetyTimeout).toBeNull();
    });

    test('Should trigger forceCompleteSpin on timeout', async () => {
      const spinData = {
        username: 'testuser',
        nickname: 'Test User',
        wheelId: 1,
        spinId: 'test-spin-3'
      };

      await wheelGame.startSpin(spinData);
      expect(wheelGame.isSpinning).toBe(true);

      // Fast-forward time past the safety timeout
      // Expected timeout: 5000 (spin) + 5000 (winner) + 0 (no info) + 10000 (buffer) = 20000ms
      jest.advanceTimersByTime(20001);

      // Verify forceCompleteSpin was called (check state changes)
      expect(wheelGame.isSpinning).toBe(false);
      expect(wheelGame.currentSpin).toBeNull();
      expect(mockIO.emit).toHaveBeenCalledWith('wheel:spin-timeout', expect.objectContaining({
        spinId: 'test-spin-3',
        username: 'testuser'
      }));
    });

    test('Should not trigger timeout if spin completes normally', async () => {
      const spinData = {
        username: 'testuser',
        nickname: 'Test User',
        wheelId: 1,
        spinId: 'test-spin-4'
      };

      await wheelGame.startSpin(spinData);
      
      // Complete spin before timeout
      await wheelGame.handleSpinComplete('test-spin-4', 0);
      
      // Fast-forward time past the timeout
      jest.advanceTimersByTime(20001);

      // Verify no timeout event was emitted
      const timeoutCalls = mockIO.emit.mock.calls.filter(
        call => call[0] === 'wheel:spin-timeout'
      );
      expect(timeoutCalls.length).toBe(0);
    });
  });

  describe('Queue Timeout Integration', () => {
    test('Should force complete processing on queue timeout', () => {
      const item = {
        type: 'wheel',
        data: {
          username: 'testuser',
          nickname: 'Test User',
          spinId: 'queue-spin-1',
          wheelId: 1,
          spinDuration: 5000,
          settings: {
            winnerDisplayDuration: 5,
            infoScreenEnabled: false
          }
        },
        timestamp: Date.now()
      };

      // Start processing
      queueManager.queue.push(item);
      queueManager.processNext();

      // Verify processing started
      expect(queueManager.isProcessing).toBe(true);

      // Fast-forward to trigger timeout
      jest.advanceTimersByTime(20001);

      // Verify processing was force completed
      expect(queueManager.isProcessing).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Force completing')
      );
    });

    test('Should emit timeout event when forcing completion', () => {
      const item = {
        type: 'wheel',
        data: {
          username: 'testuser',
          nickname: 'Test User',
          spinId: 'queue-spin-2',
          wheelId: 1,
          wheelName: 'Test Wheel',
          spinDuration: 5000,
          settings: {
            winnerDisplayDuration: 5,
            infoScreenEnabled: false
          }
        },
        timestamp: Date.now()
      };

      queueManager.queue.push(item);
      queueManager.processNext();

      // Fast-forward to trigger timeout
      jest.advanceTimersByTime(20001);

      // Verify timeout event was emitted
      expect(mockIO.emit).toHaveBeenCalledWith('wheel:spin-timeout', expect.objectContaining({
        spinId: 'queue-spin-2',
        username: 'testuser',
        reason: 'overlay_no_response'
      }));
    });

    test('Should process next item after timeout', () => {
      const item1 = {
        type: 'wheel',
        data: {
          username: 'testuser1',
          nickname: 'Test User 1',
          spinId: 'queue-spin-3',
          wheelId: 1,
          spinDuration: 5000,
          settings: { winnerDisplayDuration: 5, infoScreenEnabled: false }
        },
        timestamp: Date.now()
      };

      const item2 = {
        type: 'wheel',
        data: {
          username: 'testuser2',
          nickname: 'Test User 2',
          spinId: 'queue-spin-4',
          wheelId: 1,
          spinDuration: 5000,
          settings: { winnerDisplayDuration: 5, infoScreenEnabled: false }
        },
        timestamp: Date.now()
      };

      queueManager.queue.push(item1);
      queueManager.queue.push(item2);
      queueManager.processNext();

      expect(queueManager.queue.length).toBe(1);
      expect(queueManager.isProcessing).toBe(true);

      // Fast-forward to trigger timeout
      jest.advanceTimersByTime(20001);

      // Fast-forward the small delay for processing next item (250ms)
      jest.advanceTimersByTime(250);

      // Verify next item is being processed
      expect(queueManager.isProcessing).toBe(true);
      expect(queueManager.queue.length).toBe(0);
    });
  });

  describe('Cleanup on Destroy', () => {
    test('Should clear safety timeout on destroy', async () => {
      const spinData = {
        username: 'testuser',
        nickname: 'Test User',
        wheelId: 1,
        spinId: 'destroy-spin-1'
      };

      await wheelGame.startSpin(spinData);
      expect(wheelGame.spinSafetyTimeout).not.toBeNull();

      wheelGame.destroy();

      expect(wheelGame.spinSafetyTimeout).toBeNull();
      expect(wheelGame.isSpinning).toBe(false);
    });

    test('Should clear queue timeout on destroy', () => {
      const item = {
        type: 'wheel',
        data: {
          username: 'testuser',
          nickname: 'Test User',
          spinId: 'destroy-spin-2',
          wheelId: 1,
          spinDuration: 5000,
          settings: { winnerDisplayDuration: 5, infoScreenEnabled: false }
        },
        timestamp: Date.now()
      };

      queueManager.queue.push(item);
      queueManager.processNext();

      expect(queueManager.processingTimeout).not.toBeNull();

      queueManager.destroy();

      expect(queueManager.processingTimeout).toBeNull();
      expect(queueManager.isProcessing).toBe(false);
    });
  });
});
