'use strict';

const SpotlightPlugin = require('../main');

function createPlugin() {
  const handlers = {};
  const api = {
    log: jest.fn(),
    registerTikTokEvent: jest.fn((event, handler) => {
      handlers[event] = handler;
    }),
    registerRoute: jest.fn(),
    emit: jest.fn()
  };
  const plugin = new SpotlightPlugin(api);
  plugin.resetSession = jest.fn().mockResolvedValue();
  plugin.registerEventListeners();
  return { plugin, handlers };
}

describe('Spotlight stream-session boundary', () => {
  test('clears LastEvent overlays on a terminal LIVE end but not a transient reconnect', async () => {
    const { plugin, handlers } = createPlugin();

    await handlers.disconnected?.({
      streamSessionId: 4,
      wasLive: true,
      isTransient: false,
      code: 4005
    });
    await handlers.disconnected?.({
      streamSessionId: 4,
      wasLive: true,
      isTransient: true,
      code: 1006
    });

    expect(plugin.resetSession).toHaveBeenCalledTimes(1);
  });
});
