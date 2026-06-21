const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');

describe('Talking Heads overlay routes', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };

  const createPluginWithMockApi = () => {
    const api = {
      logger,
      getSocketIO: jest.fn(() => ({ on: jest.fn() })),
      getDatabase: jest.fn(() => ({ getSetting: jest.fn() })),
      getConfig: jest.fn(() => null),
      setConfig: jest.fn(),
      getPluginDataDir: jest.fn(() => '/tmp'),
      ensurePluginDataDir: jest.fn(),
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn()
    };

    const plugin = new TalkingHeadsPlugin(api);
    plugin._registerRoutes();
    return api;
  };

  test('registers OBS HUD route in /overlay namespace', () => {
    const api = createPluginWithMockApi();

    expect(api.registerRoute).toHaveBeenCalledWith(
      'get',
      '/overlay/talking-heads/obs-hud',
      expect.any(Function)
    );
    expect(api.registerRoute).toHaveBeenCalledWith(
      'get',
      '/overlay/talking-heads',
      expect.any(Function)
    );
  });
});
