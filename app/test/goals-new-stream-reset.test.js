'use strict';

const GoalsEventHandlers = require('../plugins/goals/backend/event-handlers');

function createHandlers() {
  const plugin = {
    api: { log: jest.fn() },
    db: {},
    stateMachineManager: {}
  };
  const handlers = new GoalsEventHandlers(plugin);
  handlers.resetGoalsOnStreamEnd = jest.fn();
  return handlers;
}

describe('Goals new stream reset', () => {
  test('resets goals once when a new stream is confirmed through either lifecycle signal', () => {
    const handlers = createHandlers();
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
    const handlers = createHandlers();

    handlers.handleConfirmedNewStream({
      username: 'streamer',
      roomId: 'room-2',
      streamIdentity: 'streamer:room-2',
      isNewStream: false,
      isReconnect: true
    });

    expect(handlers.resetGoalsOnStreamEnd).not.toHaveBeenCalled();
  });
});
