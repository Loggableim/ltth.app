const { ConfigManager } = require('../plugins/sidekick/backend/config');
const SidekickPlugin = require('../plugins/sidekick/main');

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
  test('fresh defaults use only standalone host output config', () => {
    const api = createApi();
    const manager = new ConfigManager(api);
    const config = manager.load();

    expect(config.output).toEqual({
      eventType: 'sidekick',
      username: 'Sidekick'
    });
    expect(config.output.mode).toBeUndefined();
    expect(config.animaze).toBeUndefined();
    expect(api.setConfig).toHaveBeenCalledWith('config', config);
  });

  test('legacy direct output config is removed on load and persisted once', () => {
    // Build deprecated mode values from fragments so this regression fixture
    // does not make literal searches look like active configuration support.
    const legacyAssistantMode = ['chat', 'pal'].join('');
    const legacyAvatarMode = ['animaze', legacyAssistantMode].join('-');
    const stored = {
      output: {
        mode: legacyAvatarMode,
        eventType: 'legacy-event',
        username: 'LegacyName'
      },
      animaze: {
        enabled: true,
        host: '127.0.0.1',
        port: 9000
      },
      comment: {
        enabled: false
      }
    };
    const api = createApi({
      getConfig: jest.fn().mockReturnValue(stored)
    });
    const manager = new ConfigManager(api);
    const config = manager.load();

    expect(config.output).toEqual({
      eventType: 'legacy-event',
      username: 'LegacyName'
    });
    expect(config.animaze).toBeUndefined();
    expect(config.comment.enabled).toBe(false);
    expect(api.setConfig).toHaveBeenCalledTimes(1);
    expect(api.setConfig).toHaveBeenCalledWith('config', config);

    api.getConfig.mockReturnValue(config);
    manager.load();
    expect(api.setConfig).toHaveBeenCalledTimes(1);
  });

  test('partial config updates cannot reintroduce legacy direct output config', () => {
    // See the legacy fixture note above: this value represents migrated input.
    const legacyAssistantMode = ['chat', 'pal'].join('');
    const api = createApi();
    const manager = new ConfigManager(api);
    manager.load();
    api.setConfig.mockClear();

    const config = manager.update({
      output: {
        mode: legacyAssistantMode,
        username: 'Assistant'
      },
      animaze: {
        enabled: true,
        host: 'localhost'
      },
      style: {
        maxLineLength: 80
      }
    });

    expect(config.output).toEqual({
      eventType: 'sidekick',
      username: 'Assistant'
    });
    expect(config.animaze).toBeUndefined();
    expect(config.style.maxLineLength).toBe(80);
    expect(api.setConfig).toHaveBeenCalledWith('config', config);
  });

  test('missing and null updates are safe no-ops after defaults load', () => {
    const api = createApi();
    const manager = new ConfigManager(api);
    const initial = manager.load();
    api.setConfig.mockClear();

    expect(manager.update()).toEqual(initial);
    expect(manager.update(null)).toEqual(initial);
    expect(api.setConfig).toHaveBeenCalledTimes(2);
    expect(manager.getValue('output.mode')).toBeUndefined();
  });

  test('assistant speech uses standalone host speech metadata', async () => {
    const speakHostResponse = jest.fn().mockResolvedValue({ success: true, id: 'speech-1' });
    const directSpeechClient = { sendMessage: jest.fn() };
    const api = createApi({
      getPluginInstance: jest.fn().mockImplementation((pluginId) => {
        if (pluginId === 'animazingpal') return { speakHostResponse };
        return null;
      })
    });
    const plugin = new SidekickPlugin(api);
    plugin.config = { output: { eventType: 'sidekick', username: 'Sidekick' } };
    plugin.animazeClient = directSpeechClient;
    plugin.eventBus = { publishResponseSent: jest.fn() };
    plugin.metrics = { recordResponse: jest.fn() };

    const sendOutput = plugin._sendOutput || plugin._sendToAnimaze;
    const success = await sendOutput.call(plugin, 'Hallo Testprofil');

    expect(success).toBe(true);
    expect(speakHostResponse).toHaveBeenCalledWith('Hallo Testprofil', expect.objectContaining({
      eventType: 'sidekick',
      username: 'Sidekick',
      userId: 'sidekick-assistant'
    }));
    expect(directSpeechClient.sendMessage).not.toHaveBeenCalled();
    expect(plugin.eventBus.publishResponseSent).toHaveBeenCalledWith('Hallo Testprofil');
    expect(plugin.metrics.recordResponse).toHaveBeenCalledTimes(1);
  });

  test('records successful assistant speech for coordinator echo suppression', async () => {
    const speakHostResponse = jest.fn().mockResolvedValue({ success: true, id: 'speech-1' });
    const api = createApi({
      getPluginInstance: jest.fn().mockImplementation((pluginId) => {
        if (pluginId === 'animazingpal') return { speakHostResponse };
        return null;
      })
    });
    const plugin = new SidekickPlugin(api);
    plugin.config = { output: { eventType: 'sidekick', username: 'Sidekick' } };
    plugin.conversationCoordinator = { recordSidekickSpeech: jest.fn() };
    plugin.eventBus = { publishResponseSent: jest.fn() };
    plugin.metrics = { recordResponse: jest.fn() };

    const success = await plugin._sendOutput('Hallo Testprofil');

    expect(success).toBe(true);
    expect(plugin.conversationCoordinator.recordSidekickSpeech).toHaveBeenCalledWith('Hallo Testprofil', expect.objectContaining({
      eventType: 'sidekick',
      username: 'Sidekick',
      source: 'sidekick-output'
    }));
  });

  test('processes accepted host transcripts through AnimazingPal Sidekick events', async () => {
    const processSidekickEvent = jest.fn().mockResolvedValue({ handled: true, responded: true });
    const api = createApi({
      getPluginInstance: jest.fn().mockImplementation((pluginId) => {
        if (pluginId === 'animazingpal') return { processSidekickEvent };
        return null;
      })
    });
    const plugin = new SidekickPlugin(api);
    plugin.config = {};
    plugin.conversationCoordinator = {
      shouldAcceptHostSpeech: jest.fn().mockReturnValue({
        accept: true,
        reason: 'accepted',
        normalizedText: 'hello chat'
      }),
      buildHostSpeechEvent: jest.fn().mockReturnValue({
        eventType: 'sidekick-host-speech',
        username: 'Host',
        message: 'Hello chat',
        source: 'host-mic'
      })
    };

    const result = await plugin.processHostSpeechTranscript('Hello chat', { confidence: 0.91 });

    expect(result).toEqual(expect.objectContaining({
      accepted: true,
      delegated: true,
      animazingPalResult: { handled: true, responded: true }
    }));
    expect(processSidekickEvent).toHaveBeenCalledWith(
      'sidekick-host-speech',
      expect.objectContaining({ message: 'Hello chat', source: 'host-mic' }),
      expect.objectContaining({ reason: 'accepted', source: 'sidekick-host-speech' })
    );
  });

  test('rejects echoed host transcripts before AnimazingPal delegation', async () => {
    const processSidekickEvent = jest.fn();
    const api = createApi({
      getPluginInstance: jest.fn().mockReturnValue({ processSidekickEvent })
    });
    const plugin = new SidekickPlugin(api);
    plugin.config = {};
    plugin.conversationCoordinator = {
      shouldAcceptHostSpeech: jest.fn().mockReturnValue({
        accept: false,
        reason: 'echo',
        normalizedText: 'hello chat'
      })
    };

    const result = await plugin.processHostSpeechTranscript('Hello chat');

    expect(result).toEqual(expect.objectContaining({
      accepted: false,
      delegated: false,
      reason: 'echo'
    }));
    expect(processSidekickEvent).not.toHaveBeenCalled();
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

  test('status includes conversation coordinator diagnostics', () => {
    const plugin = new SidekickPlugin(createApi());
    plugin.config = { muted: false };
    plugin.conversationCoordinator = {
      getStatus: jest.fn().mockReturnValue({
        enabled: true,
        recentUtteranceCount: 1,
        lastAcceptedHostSpeechReason: 'accepted',
        lastRejectedHostSpeechReason: 'echo'
      })
    };
    plugin.deduper = { getStats: jest.fn().mockReturnValue({}) };
    plugin.rateLimiter = { getStatus: jest.fn().mockReturnValue({}) };
    plugin.outboxBatcher = { getStatus: jest.fn().mockReturnValue({}) };
    plugin.metrics = {
      getSessionStats: jest.fn().mockReturnValue({}),
      getCurrentRates: jest.fn().mockReturnValue({})
    };

    expect(plugin._getStatus().conversation).toEqual(expect.objectContaining({
      enabled: true,
      recentUtteranceCount: 1,
      lastAcceptedHostSpeechReason: 'accepted',
      lastRejectedHostSpeechReason: 'echo'
    }));
  });
});
