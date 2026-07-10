const WheelGame = require('../games/wheel');
const UnifiedQueueManager = require('../backend/unified-queue');

function createWheelHarness() {
  const io = { emit: jest.fn() };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const config = {
    id: 1,
    name: 'Test Wheel',
    enabled: true,
    segments: [{ text: 'Prize', color: '#fff', weight: 1 }],
    settings: {}
  };
  const api = { getSocketIO: () => io, pluginLoader: { loadedPlugins: new Map() } };
  const db = { getWheelConfig: jest.fn(() => config) };
  const wheel = new WheelGame(api, db, logger);
  const queue = new UnifiedQueueManager(logger, io);
  queue.setWheelGame(wheel);
  wheel.setUnifiedQueue(queue);
  return { wheel, queue, logger };
}

describe('Wheel unified queue', () => {
  test('puts the first spin into the unified queue exactly once', async () => {
    const { wheel, queue } = createWheelHarness();

    const result = await wheel.triggerSpin('viewer', 'Viewer', '', 'Rose', 1);

    expect(result.success).toBe(true);
    expect(queue.queue).toHaveLength(0);
    expect(queue.currentItem).toMatchObject({ type: 'wheel' });
    expect(queue.currentItem.data.spinId).toBe(result.spinId);
  });

  test('queues rapid spins in FIFO order without a local fallback queue', async () => {
    const { wheel, queue } = createWheelHarness();
    queue.isProcessing = true;

    await wheel.triggerSpin('viewer-1', 'Viewer 1', '', 'Rose', 1);
    await wheel.triggerSpin('viewer-2', 'Viewer 2', '', 'Rose', 1);
    await wheel.triggerSpin('viewer-3', 'Viewer 3', '', 'Rose', 1);

    expect(queue.queue.map(item => item.data.username)).toEqual(['viewer-1', 'viewer-2', 'viewer-3']);
    expect(wheel).not.toHaveProperty('spinQueue');
  });

  test('fails closed when the required unified queue is unavailable', async () => {
    const { wheel } = createWheelHarness();
    wheel.setUnifiedQueue(null);

    const result = await wheel.triggerSpin('viewer', 'Viewer', '', 'Rose', 1);

    expect(result).toMatchObject({ success: false, error: 'Unified queue unavailable' });
    expect(wheel.activeSpins.size).toBe(0);
  });
});
