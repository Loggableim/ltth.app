const SidekickPlugin = require('../plugins/sidekick/main');
const { ConfigManager } = require('../plugins/sidekick/backend/config');

function createApi(overrides = {}) {
  return {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    getPluginInstance: jest.fn(),
    getPlugin: jest.fn(),
    log: jest.fn(),
    ...overrides
  };
}

describe('Sidekick runtime contracts', () => {
  test('fresh defaults route speech through AnimazingPal Fish instead of ChatPal', () => {
    const manager = new ConfigManager(createApi());
    const config = manager.load();

    expect(config.output).toEqual(expect.objectContaining({
      mode: 'animazingpal-fish',
      eventType: 'sidekick'
    }));
    expect(config.animaze.enabled).toBe(false);
  });

  test('sends assistant speech through AnimazingPal with delivery metadata', async () => {
    const speakHostResponse = jest.fn().mockResolvedValue({ success: true, id: 'speech-1' });
    const api = createApi({
      getPluginInstance: jest.fn().mockReturnValue({ speakHostResponse })
    });
    const plugin = new SidekickPlugin(api);
    plugin.config = { output: { mode: 'animazingpal-fish', eventType: 'sidekick' } };
    plugin.animazeClient = { sendMessage: jest.fn() };
    plugin.eventBus = { publishResponseSent: jest.fn() };
    plugin.metrics = { recordResponse: jest.fn() };

    const success = await plugin._sendToAnimaze('Hallo Testprofil');

    expect(success).toBe(true);
    expect(speakHostResponse).toHaveBeenCalledWith('Hallo Testprofil', expect.objectContaining({
      eventType: 'sidekick',
      username: 'Sidekick'
    }));
    expect(plugin.animazeClient.sendMessage).not.toHaveBeenCalled();
    expect(plugin.eventBus.publishResponseSent).toHaveBeenCalledWith('Hallo Testprofil');
    expect(plugin.metrics.recordResponse).toHaveBeenCalledTimes(1);
  });

  test('legacy direct Animaze output stays disabled unless explicitly enabled', async () => {
    const plugin = new SidekickPlugin(createApi());
    plugin.config = {
      output: { mode: 'animaze-chatpal' },
      animaze: { enabled: false }
    };
    plugin.animazeClient = { sendMessage: jest.fn() };
    plugin.eventBus = { publishResponseSent: jest.fn() };

    await expect(plugin._sendToAnimaze('Nicht senden')).resolves.toBe(false);
    expect(plugin.animazeClient.sendMessage).not.toHaveBeenCalled();
  });

  test('claims TikTok response decisions from AnimazingPal in assistant mode', () => {
    const setLiveHostOperatingMode = jest.fn().mockReturnValue(true);
    const plugin = new SidekickPlugin(createApi({
      getPluginInstance: jest.fn().mockReturnValue({ setLiveHostOperatingMode })
    }));
    plugin.config = { output: { mode: 'animazingpal-fish' } };

    expect(plugin._syncAnimazingPalMode()).toBe(true);
    expect(setLiveHostOperatingMode).toHaveBeenCalledWith('sidekick', { persist: false });
  });

  test('releases AnimazingPal response decisions when switching to legacy output', () => {
    const clearLiveHostOperatingModeOverride = jest.fn();
    const plugin = new SidekickPlugin(createApi({
      getPluginInstance: jest.fn().mockReturnValue({ clearLiveHostOperatingModeOverride })
    }));
    plugin.config = { output: { mode: 'animaze-chatpal' } };

    expect(plugin._syncAnimazingPalMode()).toBe(true);
    expect(clearLiveHostOperatingModeOverride).toHaveBeenCalledTimes(1);
  });

  test('registers concrete memory routes before the uid wildcard', () => {
    const api = createApi();
    const plugin = new SidekickPlugin(api);
    plugin.config = {};
    plugin.metrics = { getSummary: jest.fn(), getHistoricalData: jest.fn() };
    plugin.memoryStore = {};
    plugin.eventBus = {};
    plugin.deduper = {};
    plugin.rateLimiter = {};
    plugin.animazeClient = {};
    plugin.outboxBatcher = {};

    plugin._registerRoutes();
    const paths = api.registerRoute.mock.calls.map(call => call[1]);

    expect(paths.indexOf('/api/sidekick/memory/search')).toBeLessThan(paths.indexOf('/api/sidekick/memory/:uid'));
    expect(paths.indexOf('/api/sidekick/memory/top')).toBeLessThan(paths.indexOf('/api/sidekick/memory/:uid'));
  });

  test('propagates config updates to memory and reports a total event count', () => {
    const plugin = new SidekickPlugin(createApi());
    plugin.config = { memory: { decayDays: 30 } };
    plugin.memoryStore = { updateConfig: jest.fn() };
    plugin.deduper = { setTTL: jest.fn(), getStats: jest.fn().mockReturnValue({}) };
    plugin.rateLimiter = { updateConfig: jest.fn(), getStatus: jest.fn().mockReturnValue({}) };
    plugin.animazeClient = { updateConfig: jest.fn(), getStatus: jest.fn().mockReturnValue({}) };
    plugin.responseEngine = { updateConfig: jest.fn() };
    plugin.outboxBatcher = { updateConfig: jest.fn(), getStatus: jest.fn().mockReturnValue({}) };
    plugin.metrics = {
      getSessionStats: jest.fn().mockReturnValue({
        totalChats: 2,
        totalGifts: 3,
        totalLikes: 5,
        totalJoins: 7,
        totalFollows: 11,
        totalShares: 13,
        totalSubscribes: 17
      }),
      getCurrentRates: jest.fn().mockReturnValue({})
    };

    plugin._updateComponents();
    const status = plugin._getStatus();

    expect(plugin.memoryStore.updateConfig).toHaveBeenCalledWith(plugin.config);
    expect(status.session.totalEvents).toBe(58);
  });
});
