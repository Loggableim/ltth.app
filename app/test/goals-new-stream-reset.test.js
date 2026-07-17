'use strict';

const GoalsEventHandlers = require('../plugins/goals/backend/event-handlers');

function createHandlers() {
  const tikTokHandlers = {};
  const plugin = {
    api: {
      log: jest.fn(),
      registerTikTokEvent: jest.fn((event, handler) => {
        tikTokHandlers[event] = handler;
      })
    },
    db: {},
    stateMachineManager: {},
    _lifecycle: { trackTimeout: jest.fn() }
  };
  const handlers = new GoalsEventHandlers(plugin);
  handlers.resetGoalsOnStreamEnd = jest.fn();
  return { handlers, plugin, tikTokHandlers };
}

describe('Goals new stream reset', () => {
  test('resets goals once when a new stream is confirmed through either lifecycle signal', () => {
    const { handlers } = createHandlers();
    const session = {
      username: 'streamer',
      roomId: 'room-2',
      streamIdentity: 'streamer:room-2',
      isNewStream: true
    };

    handlers.handleConfirmedNewStream(session);
    handlers.handleConfirmedNewStream(session);

    expect(handlers.resetGoalsOnStreamEnd).toHaveBeenCalledTimes(1);
  });

  test('does not reset goals for a reconnect to the same confirmed stream', () => {
    const { handlers } = createHandlers();

    handlers.handleConfirmedNewStream({
      username: 'streamer',
      roomId: 'room-2',
      streamIdentity: 'streamer:room-2',
      isNewStream: false,
      isReconnect: true
    });

    expect(handlers.resetGoalsOnStreamEnd).not.toHaveBeenCalled();
  });

  test('resets again when a later session reuses the same stream identity', () => {
    const { handlers } = createHandlers();

    handlers.handleConfirmedNewStream({
      streamIdentity: 'streamer:room-2',
      streamSessionId: 1,
      isNewStream: true
    });
    handlers.handleConfirmedNewStream({
      streamIdentity: 'streamer:room-2',
      streamSessionId: 2,
      isNewStream: true
    });

    expect(handlers.resetGoalsOnStreamEnd).toHaveBeenCalledTimes(2);
  });

  test('registers and handles terminal stream disconnects without clearing transient reconnects', () => {
    const { handlers, plugin, tikTokHandlers } = createHandlers();
    handlers.registerHandlers();

    expect(plugin.api.registerTikTokEvent).toHaveBeenCalledWith('disconnected', expect.any(Function));

    tikTokHandlers.disconnected?.({
      streamIdentity: 'streamer:room-2',
      streamSessionId: 1,
      wasLive: true,
      isTransient: false,
      code: 4005
    });
    tikTokHandlers.disconnected?.({
      streamIdentity: 'streamer:room-2',
      streamSessionId: 1,
      wasLive: true,
      isTransient: true,
      code: 1006
    });

    expect(handlers.resetGoalsOnStreamEnd).toHaveBeenCalledTimes(1);
  });

  test('keeps a goal marked as stream-spanning when a stream session ends', () => {
    const { handlers, plugin } = createHandlers();
    handlers.resetGoalsOnStreamEnd = GoalsEventHandlers.prototype.resetGoalsOnStreamEnd.bind(handlers);
    handlers.db = {
      getAllGoals: jest.fn(() => [{
        id: 'marathon-goal',
        name: 'Marathon',
        reset_on_stream_end: 0,
        start_value: 0,
        target_value: 10000,
        on_reach_action: 'increment'
      }]),
      updateGoal: jest.fn()
    };
    handlers.stateMachineManager = { getMachine: jest.fn() };

    handlers.resetGoalsOnStreamEnd();

    expect(handlers.db.updateGoal).not.toHaveBeenCalled();
    expect(handlers.stateMachineManager.getMachine).not.toHaveBeenCalled();
    expect(plugin.api.log).toHaveBeenCalledWith(expect.stringContaining('Marathon'), 'debug');
  });
});
