const ZappieHellManager = require('../helpers/zappieHellManager');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

function createManager({ pattern = null } = {}) {
  const queueManager = {
    addItem: jest.fn(async () => ({ success: true, queueId: 'queue-1' })),
    enqueue: jest.fn(async () => ({ success: true, queueId: 'queue-old' }))
  };
  const patternEngine = {
    getPattern: jest.fn(() => pattern)
  };
  const patternExecutor = {
    executePattern: jest.fn(async () => 'exec-1')
  };

  const manager = new ZappieHellManager({}, logger, null, patternEngine, queueManager, patternExecutor);

  return { manager, queueManager, patternEngine, patternExecutor };
}

describe('ZappieHellManager OpenShock steps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('queues direct OpenShock commands with the QueueManager item API', async () => {
    const { manager, queueManager } = createManager();

    await manager._executeOpenShockStep({
      deviceId: 'device-1',
      commandType: 'vibrate',
      intensity: 42,
      durationMs: 1200
    });

    expect(queueManager.addItem).toHaveBeenCalledWith(expect.objectContaining({
      deviceId: 'device-1',
      commandType: 'vibrate',
      intensity: 42,
      duration: 1200,
      source: 'zappiehell'
    }));
    expect(queueManager.enqueue).not.toHaveBeenCalled();
  });

  test('executes pattern steps through PatternExecutor', async () => {
    const pattern = { id: 'pattern-1', name: 'Pattern 1', steps: [{ type: 'vibrate', intensity: 50, duration: 1000 }] };
    const { manager, queueManager, patternExecutor } = createManager({ pattern });

    await manager._executeOpenShockStep({
      deviceId: 'device-1',
      patternId: 'pattern-1',
      repeatCount: 2
    });

    expect(patternExecutor.executePattern).toHaveBeenCalledWith(
      pattern,
      'device-1',
      'zappiehell',
      'zappiehell',
      2,
      expect.objectContaining({
        sourceData: expect.objectContaining({ patternId: 'pattern-1' })
      })
    );
    expect(queueManager.addItem).not.toHaveBeenCalled();
  });
});
