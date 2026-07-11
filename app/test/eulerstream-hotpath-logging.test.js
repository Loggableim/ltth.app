const EventEmitter = require('events');
const EulerstreamAdapter = require('../modules/adapters/EulerstreamAdapter');

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
}

function createMockDb() {
  return {
    loadStreamStats: jest.fn(() => null),
    logEvent: jest.fn(),
    getGift: jest.fn(() => null),
    resetStreamStats: jest.fn(),
    saveStreamStats: jest.fn(),
    setSetting: jest.fn()
  };
}

function createAdapter() {
  const logger = createMockLogger();
  const db = createMockDb();
  const adapter = new EulerstreamAdapter(
    { emit: jest.fn() },
    db,
    logger
  );

  adapter.ws = new EventEmitter();
  adapter.eventEmitter = new EventEmitter();
  adapter._startHeartbeat = jest.fn();
  adapter._stopHeartbeat = jest.fn();
  adapter._startLiveTracking = jest.fn();
  adapter._schedulePostConnectTasks = jest.fn();
  adapter.currentUsername = 'streamer';

  return { adapter, db, logger };
}

describe('Eulerstream hotpath logging', () => {
  test('processes normal WebSocket messages without info logs on the packet hotpath', async () => {
    const { adapter, db, logger } = createAdapter();

    await adapter._setupWebSocketHandlers();
    adapter.ws.emit('message', JSON.stringify({
      messages: [
        {
          type: 'WebcastChatMessage',
          data: {
            common: { roomId: '7654321' },
            user: {
              uniqueId: 'viewer1',
              userId: '1'
            },
            comment: 'hello'
          }
        }
      ]
    }));
    await new Promise(resolve => setImmediate(resolve));

    expect(db.logEvent).toHaveBeenCalledWith('chat', 'viewer1', expect.objectContaining({
      username: 'viewer1',
      message: 'hello'
    }));
    expect(logger.info).not.toHaveBeenCalled();
  });

  test('processes member joins without writing per-join info logs', async () => {
    const { adapter, db, logger } = createAdapter();

    await adapter._setupWebSocketHandlers();
    adapter.eventEmitter.emit('member', {
      user: {
        uniqueId: 'joiner1',
        userId: '2'
      }
    });

    expect(db.logEvent).toHaveBeenCalledWith('join', 'joiner1', expect.objectContaining({
      username: 'joiner1'
    }));
    expect(logger.info).not.toHaveBeenCalled();
  });

  test('processes like events without writing per-like info logs', async () => {
    const { adapter, db, logger } = createAdapter();

    await adapter._setupWebSocketHandlers();
    adapter.eventEmitter.emit('like', {
      user: {
        uniqueId: 'liker1',
        userId: '3'
      },
      likeCount: 3,
      totalLikeCount: 30
    });

    expect(db.logEvent).toHaveBeenCalledWith('like', 'liker1', expect.objectContaining({
      username: 'liker1',
      likeCount: 3,
      totalLikes: 30
    }));
    expect(logger.info).not.toHaveBeenCalled();
  });
});
