const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');

describe('TalkingHeads log buffer', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };

  const api = {
    logger: mockLogger,
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('stores non-debug logs and ignores debug logs when disabled', () => {
    const plugin = new TalkingHeadsPlugin(api);

    plugin._log('Info message', 'info');
    plugin._log('Debug message', 'debug');
    plugin._log('Error message', 'error');

    const logs = plugin._getRecentLogs();

    expect(logs.find((entry) => entry.message.includes('Info message'))).toBeTruthy();
    expect(logs.find((entry) => entry.message.includes('Error message'))).toBeTruthy();
    expect(logs.find((entry) => entry.message.includes('Debug message'))).toBeFalsy();
  });

  test('migrates legacy avatar lottery settings into the release assignment names', () => {
    const configuredApi = {
      ...api,
      getConfig: jest.fn(() => ({
        lotteryGiftNames: 'Heart Me, Team Herz',
        lotteryAnimationDuration: 99999
      })),
      getDatabase: jest.fn(() => ({ getSetting: jest.fn() }))
    };

    const plugin = new TalkingHeadsPlugin(configuredApi);

    expect(plugin.config.rerollGiftNames).toEqual(['Heart Me', 'Team Herz']);
    expect(plugin.config.spinDurationMs).toBe(10000);
    expect(plugin.config.firstAssignmentEnabled).toBe(true);
    expect(plugin.config.rerollGiftEnabled).toBe(true);
    expect(plugin.config).not.toHaveProperty('avatarLotteryEnabled');
    expect(plugin.config).not.toHaveProperty('lotteryGiftNames');
  });
});
