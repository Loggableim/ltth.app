'use strict';

const TopTierPlugin = require('../main');

function createPlugin() {
  const handlers = {};
  const api = {
    log: jest.fn(),
    emit: jest.fn(),
    getConfig: jest.fn(() => ({})),
    setConfig: jest.fn(),
    registerTikTokEvent: jest.fn((event, handler) => {
      handlers[event] = handler;
    })
  };
  const plugin = new TopTierPlugin(api);
  plugin.sessionManager = {
    handleConnect: jest.fn(() => true),
    getCurrentStreamKey: jest.fn(() => null),
    setCurrentStreamKey: jest.fn(),
    endSession: jest.fn()
  };
  plugin.scoreEngine = { reset: jest.fn() };
  plugin.decayScheduler = { setConnected: jest.fn(), stop: jest.fn(), start: jest.fn() };
  plugin._restartDecayScheduler = jest.fn();
  plugin._emitEmptyBoards = jest.fn();
  plugin._registerTikTokEvents();
  return { plugin, handlers };
}

describe('TopTier stream-session boundary', () => {
  test('uses the adapter session generation instead of a reused room identity', () => {
    const { plugin, handlers } = createPlugin();

    handlers.streamSessionStarted({
      username: 'streamer',
      streamIdentity: 'streamer:room-2',
      streamSessionId: 4
    });

    expect(plugin.sessionManager.handleConnect).toHaveBeenCalledWith('streamer', 'euler:4');
  });

  test('ends and clears the board on a terminal LIVE disconnect only', () => {
    const { plugin, handlers } = createPlugin();

    handlers.disconnected({ wasLive: true, isTransient: false, code: 4005 });
    handlers.disconnected({ wasLive: true, isTransient: true, code: 1006 });

    expect(plugin.sessionManager.endSession).toHaveBeenCalledTimes(1);
    expect(plugin.scoreEngine.reset).toHaveBeenCalledTimes(1);
    expect(plugin._emitEmptyBoards).toHaveBeenCalledWith(null);
  });
});
