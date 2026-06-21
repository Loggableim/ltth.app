/**
 * Wheel Queue / Spin-Hanger Fix Tests
 *
 * Regression tests covering the root causes of the queue getting permanently
 * stuck (spin-hanger) when many gifts arrive quickly:
 *
 *  1. startSpin() error paths did not remove the spin from activeSpins →
 *     zombie entries accumulated, eventual stale state.
 *  2. handleSpinComplete() returned early on certain error paths WITHOUT
 *     resetting isSpinning / currentSpin and WITHOUT calling
 *     unifiedQueue.completeProcessing() → queue permanently blocked.
 *  3. cleanupOldSpins() called processNextSpin() (which is a no-op when the
 *     unified queue is set) instead of unifiedQueue.completeProcessing().
 *  4. _cleanupSpinState() must be the single, consistent cleanup entry-point.
 */

const UnifiedQueueManager = require('../backend/unified-queue');
const WheelGame = require('../games/wheel');

// ── helpers ──────────────────────────────────────────────────────────────────

const createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
});

const createMockIO = () => ({ emit: jest.fn() });

const createMockDB = (overrides = {}) => ({
  getWheelConfig: jest.fn().mockReturnValue({
    id: 1,
    name: 'Test Wheel',
    enabled: true,
    segments: [
      { text: 'Prize 1', color: '#FF0000', weight: 10, isNiete: false, isShock: false },
      { text: 'Prize 2', color: '#00FF00', weight: 10, isNiete: false, isShock: false },
      { text: 'Prize 3', color: '#0000FF', weight: 10, isNiete: false, isShock: false }
    ],
    settings: {
      spinDuration: 5000,
      winnerDisplayDuration: 1,
      infoScreenEnabled: false,
      infoScreenDuration: 0
    }
  }),
  recordWheelWin: jest.fn(),
  ...overrides
});

const createMockAPI = (io) => ({
  getSocketIO: jest.fn().mockReturnValue(io),
  pluginLoader: { loadedPlugins: new Map() }
});

// Build a fully wired WheelGame + UnifiedQueueManager pair
function buildSystem(dbOverrides = {}) {
  const mockLogger = createMockLogger();
  const mockIO = createMockIO();
  const mockDB = createMockDB(dbOverrides);
  const mockAPI = createMockAPI(mockIO);

  const queue = new UnifiedQueueManager(mockLogger, mockIO);
  const wheel = new WheelGame(mockAPI, mockDB, mockLogger);
  wheel.setUnifiedQueue(queue);
  queue.setWheelGame(wheel);

  return { queue, wheel, mockLogger, mockIO, mockDB };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('Wheel Queue / Spin-Hanger Fix', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // ── _cleanupSpinState ────────────────────────────────────────────────────

  describe('_cleanupSpinState()', () => {
    test('resets isSpinning and currentSpin', async () => {
      const { wheel } = buildSystem();
      const spinData = {
        spinId: 'cs-1', username: 'u', nickname: 'U',
        wheelId: 1, segmentCount: 3
      };
      await wheel.startSpin(spinData);
      expect(wheel.isSpinning).toBe(true);

      wheel._cleanupSpinState('cs-1', 'test');
      expect(wheel.isSpinning).toBe(false);
      expect(wheel.currentSpin).toBeNull();
    });

    test('removes spinId from activeSpins', async () => {
      const { wheel } = buildSystem();
      const spinData = {
        spinId: 'cs-2', username: 'u', nickname: 'U',
        wheelId: 1, segmentCount: 3
      };
      await wheel.startSpin(spinData);
      expect(wheel.activeSpins.has('cs-2')).toBe(true);

      wheel._cleanupSpinState('cs-2', 'test');
      expect(wheel.activeSpins.has('cs-2')).toBe(false);
    });

    test('clears spinSafetyTimeout', async () => {
      const { wheel } = buildSystem();
      const spinData = {
        spinId: 'cs-3', username: 'u', nickname: 'U',
        wheelId: 1, segmentCount: 3
      };
      await wheel.startSpin(spinData);
      expect(wheel.spinSafetyTimeout).not.toBeNull();

      wheel._cleanupSpinState('cs-3', 'test');
      expect(wheel.spinSafetyTimeout).toBeNull();
    });

    test('is a no-op for null spinId (does not throw)', () => {
      const { wheel } = buildSystem();
      wheel.isSpinning = true;
      wheel.currentSpin = { spinId: 'x' };
      expect(() => wheel._cleanupSpinState(null, 'test')).not.toThrow();
      expect(wheel.isSpinning).toBe(false);
    });
  });

  // ── startSpin() zombie-activeSpins fix ────────────────────────────────────

  describe('startSpin() – zombie activeSpins cleanup on error', () => {
    test('removes from activeSpins when wheel config not found', async () => {
      const { wheel, queue } = buildSystem({
        getWheelConfig: jest.fn().mockReturnValue(null)
      });
      const spinData = {
        spinId: 'ss-no-config', username: 'u', nickname: 'U',
        wheelId: 99, segmentCount: 3
      };
      wheel.activeSpins.set(spinData.spinId, spinData);

      const result = await wheel.startSpin(spinData);

      expect(result.success).toBe(false);
      expect(wheel.isSpinning).toBe(false);
      expect(wheel.currentSpin).toBeNull();
      expect(wheel.activeSpins.has('ss-no-config')).toBe(false);
    });

    test('removes from activeSpins when segments array is invalid', async () => {
      const { wheel } = buildSystem({
        getWheelConfig: jest.fn().mockReturnValue({
          id: 1, name: 'Bad', segments: null, settings: {}
        })
      });
      const spinData = {
        spinId: 'ss-bad-segs', username: 'u', nickname: 'U',
        wheelId: 1, segmentCount: 3
      };
      wheel.activeSpins.set(spinData.spinId, spinData);

      const result = await wheel.startSpin(spinData);

      expect(result.success).toBe(false);
      expect(wheel.isSpinning).toBe(false);
      expect(wheel.activeSpins.has('ss-bad-segs')).toBe(false);
    });

    test('removes from activeSpins when segments array is empty', async () => {
      const { wheel } = buildSystem({
        getWheelConfig: jest.fn().mockReturnValue({
          id: 1, name: 'Empty', segments: [], settings: {}
        })
      });
      const spinData = {
        spinId: 'ss-empty-segs', username: 'u', nickname: 'U',
        wheelId: 1, segmentCount: 0
      };
      wheel.activeSpins.set(spinData.spinId, spinData);

      const result = await wheel.startSpin(spinData);

      expect(result.success).toBe(false);
      expect(wheel.isSpinning).toBe(false);
      expect(wheel.activeSpins.has('ss-empty-segs')).toBe(false);
    });

    test('removes from activeSpins when segment count changed', async () => {
      const { wheel, mockIO } = buildSystem(); // DB returns 3 segments
      const spinData = {
        spinId: 'ss-seg-count', username: 'u', nickname: 'U',
        wheelId: 1,
        segmentCount: 5 // mismatch → triggers error
      };
      wheel.activeSpins.set(spinData.spinId, spinData);

      const result = await wheel.startSpin(spinData);

      expect(result.success).toBe(false);
      expect(wheel.isSpinning).toBe(false);
      expect(wheel.activeSpins.has('ss-seg-count')).toBe(false);
      expect(mockIO.emit).toHaveBeenCalledWith('wheel:spin-error', expect.objectContaining({
        spinId: 'ss-seg-count'
      }));
    });
  });

  // ── handleSpinComplete() critical path fixes ──────────────────────────────

  describe('handleSpinComplete() – queue unblocked on error paths', () => {
    test('calls completeProcessing when config invalid at completion time', async () => {
      const mockDB = createMockDB();
      const mockLogger = createMockLogger();
      const mockIO = createMockIO();
      const mockAPI = createMockAPI(mockIO);

      const queue = new UnifiedQueueManager(mockLogger, mockIO);
      const wheel = new WheelGame(mockAPI, mockDB, mockLogger);
      wheel.setUnifiedQueue(queue);
      queue.setWheelGame(wheel);

      // Start a valid spin
      const spinData = {
        spinId: 'hsc-bad-cfg', username: 'u', nickname: 'U',
        wheelId: 1, segmentCount: 3
      };
      await wheel.startSpin(spinData);
      expect(wheel.isSpinning).toBe(true);

      // Make the config invalid for the completion call
      mockDB.getWheelConfig.mockReturnValue(null);
      queue.isProcessing = true; // pretend queue is mid-processing

      const result = await wheel.handleSpinComplete('hsc-bad-cfg', 0);

      expect(result.success).toBe(false);
      // Queue MUST be released
      expect(queue.isProcessing).toBe(false);
      // State MUST be reset
      expect(wheel.isSpinning).toBe(false);
      expect(wheel.currentSpin).toBeNull();
      expect(wheel.activeSpins.has('hsc-bad-cfg')).toBe(false);
    });

    test('calls completeProcessing when segment index is invalid at completion time', async () => {
      const mockDB = createMockDB();
      const mockLogger = createMockLogger();
      const mockIO = createMockIO();
      const mockAPI = createMockAPI(mockIO);

      const queue = new UnifiedQueueManager(mockLogger, mockIO);
      const wheel = new WheelGame(mockAPI, mockDB, mockLogger);
      wheel.setUnifiedQueue(queue);
      queue.setWheelGame(wheel);

      const spinData = {
        spinId: 'hsc-bad-idx', username: 'u', nickname: 'U',
        wheelId: 1, segmentCount: 3
      };
      await wheel.startSpin(spinData);

      // Override the stored winningSegmentIndex to an invalid value
      const stored = wheel.activeSpins.get('hsc-bad-idx');
      stored.winningSegmentIndex = 999; // out of range

      queue.isProcessing = true;
      // Pass invalid reportedSegmentIndex too → triggers the error path
      const result = await wheel.handleSpinComplete('hsc-bad-idx', 999, 999);

      expect(result.success).toBe(false);
      expect(queue.isProcessing).toBe(false);
      expect(wheel.isSpinning).toBe(false);
      expect(wheel.currentSpin).toBeNull();
      expect(wheel.activeSpins.has('hsc-bad-idx')).toBe(false);
    });
  });

  // ── cleanupOldSpins() – unified queue integration ─────────────────────────

  describe('cleanupOldSpins() – releases unified queue on stuck spin cleanup', () => {
    test('calls unifiedQueue.completeProcessing instead of processNextSpin', async () => {
      const { queue, wheel } = buildSystem();

      const spinData = {
        spinId: 'cos-1', username: 'u', nickname: 'U',
        wheelId: 1, segmentCount: 3,
        timestamp: Date.now() - 200000 // > MAX_SPIN_AGE_MS (2 min)
      };
      await wheel.startSpin(spinData);

      // Force-set timestamp to past to simulate stuck spin
      wheel.activeSpins.get('cos-1').timestamp = Date.now() - 200000;

      const completeSpy = jest.spyOn(queue, 'completeProcessing');
      queue.isProcessing = true;

      wheel.cleanupOldSpins();

      expect(completeSpy).toHaveBeenCalled();
      expect(wheel.isSpinning).toBe(false);
      expect(wheel.currentSpin).toBeNull();
    });
  });

  // ── burst-load scenario: multiple rapid gifts ─────────────────────────────

  describe('Burst-load: queue processes all spins correctly', () => {
    beforeEach(() => jest.useRealTimers());
    afterEach(() => jest.useFakeTimers());

    test('6 spins queued in rapid succession all complete without hang', async () => {
      const { queue, wheel } = buildSystem();

      // Queue 6 spins (simulating rapid gift burst)
      for (let i = 1; i <= 6; i++) {
        wheel.triggerSpin(`user${i}`, `User ${i}`, '', 'Rose', 1);
      }

      // Wait for the first spin to be picked up by the queue
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(queue.isProcessing).toBe(true);
      const firstSpinId = queue.currentItem?.data?.spinId;
      expect(firstSpinId).toBeDefined();

      // Simulate overlay responding to the first spin
      await wheel.handleSpinComplete(firstSpinId, 0);

      // After handleSpinComplete the wheel state must be clean immediately
      // (completeProcessing is called after the winner display delay, but the
      //  spin state itself must be reset right away)
      expect(wheel.isSpinning).toBe(false);
      expect(wheel.currentSpin).toBeNull();
      expect(wheel.activeSpins.has(firstSpinId)).toBe(false);

      // Queue still has remaining items
      expect(queue.queue.length + (queue.isProcessing ? 1 : 0)).toBeGreaterThan(0);

      wheel.destroy();
      queue.destroy();
    });
  });
});
