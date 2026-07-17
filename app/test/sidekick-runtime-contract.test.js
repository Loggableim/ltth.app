const {
  ConfigManager,
  ASR_SERVICE_MAX_AUDIO_BYTES
} = require('../plugins/sidekick/backend/config');
const { ConversationCoordinator } = require('../plugins/sidekick/backend/conversation-coordinator');
const SidekickPlugin = require('../plugins/sidekick/main');
const fs = require('fs');
const path = require('path');

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
  test('does not ship the legacy direct assistant client module', () => {
    const legacyClientFile = ['animaze', 'Client.js'].join('');
    expect(fs.existsSync(path.join(__dirname, '..', 'plugins', 'sidekick', 'backend', legacyClientFile))).toBe(false);
  });

  test('user-facing Sidekick files describe delegated AnimazingPal speech only', () => {
    const sidekickDir = path.join(__dirname, '..', 'plugins', 'sidekick');
    const forbiddenFragments = [
      ['Chat', 'Pal'].join(''),
      ['chat', 'pal'].join(''),
      ['animaze', '-', 'chat', 'pal'].join(''),
      'output-mode',
      'Legacy: direkte Animaze-Verbindung'
    ];
    const userFacingText = [
      fs.readFileSync(path.join(sidekickDir, 'ui.html'), 'utf8'),
      fs.readFileSync(path.join(sidekickDir, 'plugin.json'), 'utf8'),
      fs.readFileSync(path.join(sidekickDir, 'README.md'), 'utf8')
    ].join('\n');

    for (const fragment of forbiddenFragments) {
      expect(userFacingText).not.toContain(fragment);
    }
    expect(userFacingText).toContain('AnimazingPal');
    expect(userFacingText).toContain('Fish.audio');
  });

  test('Sidekick UI exposes host microphone ASR controls and browser upload hooks', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'sidekick', 'ui.html'), 'utf8');

    [
      'host-asr-enabled',
      'btn-asr-permission',
      'host-asr-device',
      'host-asr-language',
      'host-asr-max-bytes',
      'host-asr-min-transcript',
      'host-asr-silence-timeout',
      'host-asr-max-segment',
      'host-asr-unsafe-override',
      'btn-asr-test',
      'host-asr-last-transcript',
      'host-preflight-status',
      'host-preflight-checks',
      '/api/sidekick/asr/status',
      '/api/sidekick/preflight',
      'buildHostPreflightQuery',
      'micBlocked',
      'micUnsafeOverride',
      '/api/sidekick/asr/transcribe',
      'navigator.mediaDevices.enumerateDevices',
      'navigator.mediaDevices.getUserMedia',
      'new MediaRecorder',
      'audio/webm;codecs=opus',
      "formData.append('audio'",
      'transcribeOnly',
      'isUnsafeAudioInputDevice'
    ].forEach(fragment => {
      expect(html).toContain(fragment);
    });

    expect(html).toMatch(/CABLE|VB-Audio|loopback|stereo mix|speaker|monitor/i);
  });

  test('Sidekick UI guards ASR recorder lifecycle and preserves backend ASR config', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'sidekick', 'ui.html'), 'utf8');

    [
      'cancelAsrSegment',
      'stopAsrSegment({ shouldUpload: false',
      'stopHostAsrStream({ cancelRecorder: true',
      'segment.shouldUpload',
      'segment.recorder !== hostAsrRecorder',
            'handleUnsafeOverrideChange',
      'selectedAsrDeviceIsBlocked() && document.getElementById(\'host-asr-enabled\').checked',
      'stopHostAsrStream({ cancelRecorder: true',
      'document.getElementById(\'host-asr-enabled\').checked = false',
      "translateUi('plugins.sidekick.ui.asr.stoppedUnsafeInput'",
      'enabled: config.asr?.enabled !== false'
    ].forEach(fragment => {
      expect(html).toContain(fragment);
    });

    expect(html).not.toMatch(/asr:\s*{[^}]*enabled:\s*true/s);
  });

  test('runtime has no legacy direct assistant output route or method', () => {
    const api = createApi();
    const plugin = new SidekickPlugin(api);
    plugin.config = {};
    plugin.metrics = { getSummary: jest.fn(), getHistoricalData: jest.fn() };
    plugin.memoryStore = {};
    plugin.eventBus = {};
    plugin.deduper = {};
    plugin.rateLimiter = {};
    plugin.outboxBatcher = {};

    plugin._registerRoutes();
    const routes = api.registerRoute.mock.calls.map(call => call[1]);

    expect(routes.some(route => route.toLowerCase().includes(['chat', 'pal'].join('')))).toBe(false);
    expect(plugin[['_' + 'sendTo', 'Animaze'].join('')]).toBeUndefined();
  });

  test('fresh defaults use only standalone host output config', () => {
    const api = createApi();
    const manager = new ConfigManager(api);
    const config = manager.load();

    expect(config.output).toEqual({
      eventType: 'sidekick',
      username: 'Sidekick'
    });
    expect(config.asr).toEqual({
      enabled: true,
      maxAudioBytes: 8 * 1024 * 1024,
      language: null,
      minTranscriptChars: null,
      rateLimitMax: 10,
      rateLimitWindowMs: 60 * 1000,
      deviceId: '',
      unsafeOverride: false,
      silenceTimeoutMs: 900,
      maxSegmentMs: 12000
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

  test('conversation config updates are normalized before persistence', () => {
    const api = createApi();
    const manager = new ConfigManager(api);
    manager.load();
    api.setConfig.mockClear();

    const config = manager.update({
      conversation: {
        enabled: 'false',
        hostName: 'H'.repeat(120),
        minHostSpeechChars: -1,
        echoWindowMs: 999999999,
        maxRecentUtterances: 9999,
        hostSpeechEventType: 'sidekick-host-speech',
        viewerEventTypes: ['gift', 'unknown', 'chat', 'chat']
      }
    });

    expect(config.conversation).toEqual(expect.objectContaining({
      enabled: false,
      hostName: 'H'.repeat(64),
      minHostSpeechChars: 1,
      echoWindowMs: 300000,
      maxRecentUtterances: 200,
      hostSpeechEventType: 'chat',
      viewerEventTypes: ['gift', 'chat']
    }));
    expect(api.setConfig).toHaveBeenCalledWith('config', config);
  });

  test('ASR config updates are normalized and capped below Fish.audio service limits', () => {
    const api = createApi();
    const manager = new ConfigManager(api);
    manager.load();
    api.setConfig.mockClear();

    const config = manager.update({
      asr: {
        enabled: 'false',
        maxAudioBytes: ASR_SERVICE_MAX_AUDIO_BYTES + 12345,
        language: 'de-DE',
        minTranscriptChars: -50
      }
    });

    expect(config.asr).toEqual({
      enabled: false,
      maxAudioBytes: ASR_SERVICE_MAX_AUDIO_BYTES,
      language: 'de-DE',
      minTranscriptChars: 1,
      rateLimitMax: 10,
      rateLimitWindowMs: 60 * 1000,
      deviceId: '',
      unsafeOverride: false,
      silenceTimeoutMs: 900,
      maxSegmentMs: 12000
    });
    expect(api.setConfig).toHaveBeenCalledWith('config', config);
  });

  test('ASR config clears language values rejected by the Fish.audio ASR client', () => {
    const api = createApi();
    const manager = new ConfigManager(api);
    manager.load();
    api.setConfig.mockClear();

    const invalidConfig = manager.update({
      asr: {
        language: 'english'
      }
    });

    expect(invalidConfig.asr.language).toBeNull();

    const validConfig = manager.update({
      asr: {
        language: 'pt-BR'
      }
    });

    expect(validConfig.asr.language).toBe('pt-BR');
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

  test('GCCE status command labels the delegated AnimazingPal output', () => {
    const plugin = new SidekickPlugin(createApi());
    plugin.config = {};
    plugin.metrics = {
      getSessionStats: jest.fn().mockReturnValue({ totalChats: 1 }),
      getCurrentRates: jest.fn().mockReturnValue({})
    };
    plugin.deduper = { getStats: jest.fn().mockReturnValue({}) };
    plugin.rateLimiter = { getStatus: jest.fn().mockReturnValue({}) };
    plugin.outboxBatcher = { getStatus: jest.fn().mockReturnValue({}) };

    const result = plugin._handleSidekickCommand({ args: ['status'], username: 'mod' });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      message: expect.stringContaining('AnimazingPal: Disconnected')
    }));
    expect(result.message).not.toContain('Animaze:');
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
    plugin.eventBus = { publishResponseSent: jest.fn() };
    plugin.metrics = { recordResponse: jest.fn() };

    const success = await plugin._sendOutput('Hallo Testprofil');

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

  test('processes accepted host transcripts through dedicated AnimazingPal host pipeline', async () => {
    const processSidekickHostSpeech = jest.fn().mockResolvedValue({ handled: true, responded: true });
    const processSidekickEvent = jest.fn();
    const api = createApi({
      getPluginInstance: jest.fn().mockImplementation((pluginId) => {
        if (pluginId === 'animazingpal') return { processSidekickHostSpeech, processSidekickEvent };
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
        eventType: 'chat',
        username: 'Host',
        message: 'Hello chat',
        comment: 'Hello chat',
        isHostSpeech: true,
        source: 'host-mic'
      })
    };

    const result = await plugin.processHostSpeechTranscript('Hello chat', { confidence: 0.91 });

    expect(result).toEqual(expect.objectContaining({
      accepted: true,
      delegated: true,
      animazingPalResult: { handled: true, responded: true }
    }));
    expect(processSidekickHostSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Hello chat', comment: 'Hello chat', source: 'host-mic', isHostSpeech: true }),
      expect.objectContaining({ reason: 'accepted', source: 'sidekick-host-speech' })
    );
    expect(processSidekickEvent).not.toHaveBeenCalled();
  });

  test('host mode preflight reports actionable blocked checks without leaking Fish secrets', () => {
    const secret = 'fish-super-secret-token';
    const plugin = new SidekickPlugin(createApi({
      getPluginInstance: jest.fn().mockImplementation((pluginId) => {
        if (pluginId === 'tts') {
          return {
            config: { fishaudioApiKey: secret },
            transcribeFishAudio: jest.fn()
          };
        }
        if (pluginId === 'animazingpal') {
          return {
            speakHostResponse: jest.fn()
          };
        }
        return null;
      })
    }));
    plugin.config = {
      asr: { enabled: true },
      conversation: { enabled: false }
    };

    const preflight = plugin._getHostModePreflight();

    expect(preflight.ready).toBe(false);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'animazingpal.available', status: 'ok' }),
      expect.objectContaining({ id: 'animazingpal.hostPipeline', status: 'error' }),
      expect.objectContaining({ id: 'tts.fishConfigured', status: 'ok' }),
      expect.objectContaining({ id: 'conversation.enabled', status: 'error' })
    ]));
    expect(JSON.stringify(preflight)).not.toContain(secret);
  });

  test('runtime mode sync only applies a non-persistent Sidekick override after preflight passes', () => {
    const blockedSetMode = jest.fn();
    const blockedPlugin = new SidekickPlugin(createApi({
      getPluginInstance: jest.fn().mockImplementation((pluginId) => {
        if (pluginId === 'animazingpal') {
          return { setLiveHostOperatingMode: blockedSetMode, speakHostResponse: jest.fn() };
        }
        if (pluginId === 'tts') {
          return { config: { fishaudioApiKey: 'fish-key' }, transcribeFishAudio: jest.fn() };
        }
        return null;
      })
    }));
    blockedPlugin.config = { asr: { enabled: true }, conversation: { enabled: true } };

    expect(blockedPlugin._syncAnimazingPalMode()).toBe(false);
    expect(blockedSetMode).not.toHaveBeenCalled();

    const setMode = jest.fn().mockReturnValue(true);
    const api = createApi({
      getPluginInstance: jest.fn().mockImplementation((pluginId) => {
        if (pluginId === 'animazingpal') {
          return {
            setLiveHostOperatingMode: setMode,
            processSidekickHostSpeech: jest.fn(),
            speakHostResponse: jest.fn()
          };
        }
        if (pluginId === 'tts') {
          return { config: { fishaudioApiKey: 'fish-key' }, transcribeFishAudio: jest.fn() };
        }
        return null;
      })
    });
    const readyPlugin = new SidekickPlugin(api);
    readyPlugin.config = { asr: { enabled: true }, conversation: { enabled: true } };

    expect(readyPlugin._syncAnimazingPalMode()).toBe(true);
    expect(setMode).toHaveBeenCalledWith('sidekick', { persist: false });
    expect(api.setConfig).not.toHaveBeenCalled();
  });

  test('status retry applies runtime Sidekick override after dependencies become ready', () => {
    const setMode = jest.fn().mockReturnValue(true);
    const api = createApi();
    const plugin = new SidekickPlugin(api);
    plugin.config = { asr: { enabled: true }, conversation: { enabled: true } };
    plugin.deduper = { getStats: jest.fn().mockReturnValue({}) };
    plugin.rateLimiter = { getStatus: jest.fn().mockReturnValue({}) };
    plugin.outboxBatcher = { getStatus: jest.fn().mockReturnValue({}) };
    plugin.metrics = {
      getSessionStats: jest.fn().mockReturnValue({}),
      getCurrentRates: jest.fn().mockReturnValue({})
    };

    api.getPluginInstance.mockImplementation((pluginId) => {
      if (pluginId === 'animazingpal') {
        return { setLiveHostOperatingMode: setMode, speakHostResponse: jest.fn() };
      }
      if (pluginId === 'tts') {
        return { config: { fishaudioApiKey: 'fish-key' }, transcribeFishAudio: jest.fn() };
      }
      return null;
    });

    expect(plugin._syncAnimazingPalMode()).toBe(false);
    expect(setMode).not.toHaveBeenCalled();

    api.getPluginInstance.mockImplementation((pluginId) => {
      if (pluginId === 'animazingpal') {
        return {
          setLiveHostOperatingMode: setMode,
          processSidekickHostSpeech: jest.fn(),
          speakHostResponse: jest.fn()
        };
      }
      if (pluginId === 'tts') {
        return { config: { fishaudioApiKey: 'fish-key' }, transcribeFishAudio: jest.fn() };
      }
      return null;
    });

    const status = plugin._getStatus();

    expect(status.hostPreflight.ready).toBe(true);
    expect(setMode).toHaveBeenCalledWith('sidekick', { persist: false });
    expect(api.setConfig).not.toHaveBeenCalled();
  });

  test('preflight route reflects unsafe microphone query metadata in backend diagnostics', () => {
    const api = createApi({
      getPluginInstance: jest.fn().mockImplementation((pluginId) => {
        if (pluginId === 'animazingpal') {
          return {
            processSidekickHostSpeech: jest.fn(),
            speakHostResponse: jest.fn()
          };
        }
        if (pluginId === 'tts') {
          return { config: { fishaudioApiKey: 'fish-key' }, transcribeFishAudio: jest.fn() };
        }
        return null;
      })
    });
    const plugin = new SidekickPlugin(api);
    plugin.config = { asr: { enabled: true }, conversation: { enabled: true } };
    plugin.metrics = { getSummary: jest.fn(), getHistoricalData: jest.fn() };
    plugin.memoryStore = {};
    plugin.eventBus = {};
    plugin.deduper = {};
    plugin.rateLimiter = {};
    plugin.outboxBatcher = {};
    plugin._registerRoutes();
    const route = api.registerRoute.mock.calls.find(call => call[1] === '/api/sidekick/preflight');
    const res = { json: jest.fn() };

    route[2]({
      query: {
        micBlocked: 'true',
        micUnsafeOverride: 'false',
        micLabel: 'CABLE Input'
      }
    }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      preflight: expect.objectContaining({
        ready: false,
        checks: expect.arrayContaining([
          expect.objectContaining({ id: 'microphone.device', status: 'error' })
        ])
      })
    }));
  });

  test('does not route host transcripts through generic AnimazingPal Sidekick event path when dedicated host pipeline is unavailable', async () => {
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
        eventType: 'chat',
        username: 'Host',
        message: 'Hello chat',
        comment: 'Hello chat',
        isHostSpeech: true,
        source: 'host-mic'
      }),
      recordHostSpeech: jest.fn(),
      recordSidekickSpeech: jest.fn()
    };

    const result = await plugin.processHostSpeechTranscript('Hello chat', { confidence: 0.91 });

    expect(result).toEqual(expect.objectContaining({
      accepted: true,
      delegated: false,
      reason: 'host-pipeline-unavailable',
      event: expect.objectContaining({ message: 'Hello chat', source: 'host-mic', isHostSpeech: true })
    }));
    expect(processSidekickEvent).not.toHaveBeenCalled();
    expect(plugin.conversationCoordinator.recordHostSpeech).not.toHaveBeenCalled();
    expect(plugin.conversationCoordinator.recordSidekickSpeech).not.toHaveBeenCalled();
  });

  test('does not suppress host transcript retry when AnimazingPal is unavailable', async () => {
    const plugin = new SidekickPlugin(createApi());
    plugin.config = {};
    plugin.metrics = { recordError: jest.fn() };
    plugin.conversationCoordinator = {
      shouldAcceptHostSpeech: jest.fn().mockReturnValue({
        accept: true,
        reason: 'accepted',
        normalizedText: 'hello chat'
      }),
      buildHostSpeechEvent: jest.fn().mockReturnValue({
        eventType: 'chat',
        username: 'Host',
        message: 'Hello chat',
        comment: 'Hello chat',
        source: 'host-mic',
        isHostSpeech: true
      }),
      recordHostSpeech: jest.fn()
    };

    const result = await plugin.processHostSpeechTranscript('Hello chat');

    expect(result).toEqual(expect.objectContaining({
      accepted: true,
      delegated: false,
      reason: 'animazingpal-unavailable'
    }));
    expect(plugin.conversationCoordinator.recordHostSpeech).not.toHaveBeenCalled();
  });

  test('does not suppress host transcript retry when AnimazingPal delegation rejects', async () => {
    const processSidekickHostSpeech = jest.fn().mockRejectedValue(new Error('AP down'));
    const plugin = new SidekickPlugin(createApi({
      getPluginInstance: jest.fn().mockReturnValue({ processSidekickHostSpeech })
    }));
    plugin.config = {};
    plugin.metrics = { recordError: jest.fn() };
    plugin.conversationCoordinator = {
      shouldAcceptHostSpeech: jest.fn().mockReturnValue({
        accept: true,
        reason: 'accepted',
        normalizedText: 'hello chat'
      }),
      buildHostSpeechEvent: jest.fn().mockReturnValue({
        eventType: 'chat',
        username: 'Host',
        message: 'Hello chat',
        comment: 'Hello chat',
        source: 'host-mic',
        isHostSpeech: true
      }),
      recordHostSpeech: jest.fn()
    };

    const result = await plugin.processHostSpeechTranscript('Hello chat');

    expect(result).toEqual(expect.objectContaining({
      accepted: true,
      delegated: false,
      reason: 'animazingpal-error'
    }));
    expect(plugin.conversationCoordinator.recordHostSpeech).not.toHaveBeenCalled();
    expect(plugin.metrics.recordError).toHaveBeenCalled();
  });

  test('does not suppress host transcript retry when AnimazingPal returns duplicate without a response', async () => {
    const processSidekickHostSpeech = jest.fn().mockResolvedValue({
      handled: true,
      responded: false,
      duplicate: true,
      reason: 'duplicate'
    });
    const plugin = new SidekickPlugin(createApi({
      getPluginInstance: jest.fn().mockReturnValue({ processSidekickHostSpeech })
    }));
    plugin.config = {};
    plugin.metrics = { recordError: jest.fn() };
    plugin.conversationCoordinator = new ConversationCoordinator({
      hostContextCooldownMs: 0,
      hostOvertalkCooldownMs: 0,
      hostReplyProbability: 1,
      hostMinConfidence: 0,
      minHostSpeechChars: 3,
      echoWindowMs: 10000
    });

    const originalRandom = Math.random;
    Math.random = () => 0;
    const result = await plugin.processHostSpeechTranscript('Retry this host line', { now: 1000 });
    const resultDecisionAfter = plugin.conversationCoordinator.shouldAcceptHostSpeech('retry this host line', { now: 2000 });
    Math.random = originalRandom;
    expect(result).toEqual(expect.objectContaining({
      accepted: true,
      delegated: true,
      animazingPalResult: expect.objectContaining({ duplicate: true, responded: false })
    }));
    expect(resultDecisionAfter).toEqual(expect.objectContaining({
      accept: true
    }));
  });

  test('records host-triggered AnimazingPal spoken text for echo suppression', async () => {
    const processSidekickHostSpeech = jest.fn().mockResolvedValue({
      handled: true,
      responded: true,
      spokenText: 'AP reply'
    });
    const plugin = new SidekickPlugin(createApi({
      getPluginInstance: jest.fn().mockReturnValue({ processSidekickHostSpeech })
    }));
    plugin.config = {};
    plugin.metrics = { recordError: jest.fn(), recordResponse: jest.fn() };
    plugin.conversationCoordinator = new ConversationCoordinator({
      hostContextCooldownMs: 0,
      hostOvertalkCooldownMs: 0,
      hostReplyProbability: 1,
      hostMinConfidence: 0,
      minHostSpeechChars: 3,
      echoWindowMs: 10000
    });

    const originalRandom = Math.random;
    Math.random = () => 0;
    const result = await plugin.processHostSpeechTranscript('Host asks something', { now: 1000 });
    const replyDecision = plugin.conversationCoordinator.shouldAcceptHostSpeech('AP reply', { now: 2000 });
    Math.random = originalRandom;

    expect(result).toEqual(expect.objectContaining({ accepted: true, delegated: true }));
    expect(replyDecision).toEqual(expect.objectContaining({
      accept: false,
      reason: 'echo'
    }));
  });

  test('does not record host speech or AnimazingPal text when delegated speech fails', async () => {
    const processSidekickHostSpeech = jest.fn().mockResolvedValue({
      handled: true,
      responded: false,
      spokenText: 'Undelivered AP reply',
      speechFailed: true
    });
    const plugin = new SidekickPlugin(createApi({
      getPluginInstance: jest.fn().mockReturnValue({ processSidekickHostSpeech })
    }));
    plugin.config = {};
    plugin.metrics = { recordError: jest.fn(), recordResponse: jest.fn() };
    plugin.conversationCoordinator = new ConversationCoordinator({
      hostContextCooldownMs: 0,
      hostOvertalkCooldownMs: 0,
      hostReplyProbability: 1,
      hostMinConfidence: 0,
      minHostSpeechChars: 3,
      echoWindowMs: 10000
    });
    jest.spyOn(plugin.conversationCoordinator, 'recordHostSpeech');
    jest.spyOn(plugin.conversationCoordinator, 'recordSidekickSpeech');

    const originalRandom = Math.random;
    Math.random = () => 0;
    const result = await plugin.processHostSpeechTranscript('Host asks something', { now: 1000 });

    expect(result).toEqual(expect.objectContaining({ accepted: true, delegated: true }));
    expect(plugin.conversationCoordinator.recordHostSpeech).not.toHaveBeenCalled();
    expect(plugin.conversationCoordinator.recordSidekickSpeech).not.toHaveBeenCalled();
    Math.random = originalRandom;
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

  test('chat delegation rejection is caught and logged without unhandled rejection', async () => {
    const api = createApi();
    const plugin = new SidekickPlugin(api);
    plugin.config = { comment: { minLength: 1, enabled: true } };
    plugin.deduper = { seen: jest.fn().mockReturnValue(false) };
    plugin.metrics = {
      recordChat: jest.fn(),
      recordDedupeHit: jest.fn(),
      recordError: jest.fn()
    };
    plugin.memoryStore = { rememberEvent: jest.fn(), updateLastGreet: jest.fn() };
    plugin.eventBus = { publishChat: jest.fn() };
    plugin.rateLimiter = {
      canSendGlobal: jest.fn().mockReturnValue(true),
      isUserOnCooldown: jest.fn().mockReturnValue(false),
      setGlobalCooldown: jest.fn(),
      setUserCooldown: jest.fn()
    };
    plugin.responseEngine = {
      evaluateChat: jest.fn().mockReturnValue({ type: 'question', score: 1 })
    };
    plugin._dispatchSelectedEvent = jest.fn().mockRejectedValue(new Error('AP failed'));

    plugin._handleChat({ uniqueId: 'alice', nickname: 'Alice', comment: 'hello?' });
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin._dispatchSelectedEvent).toHaveBeenCalled();
    expect(api.log).toHaveBeenCalledWith(expect.stringContaining('Sidekick chat dispatch failed'), 'error');
    expect(plugin.metrics.recordError).toHaveBeenCalled();
  });

  test('chat cooldown is reserved before async delegation so immediate selected chats do not both delegate', async () => {
    const plugin = new SidekickPlugin(createApi());
    plugin.config = { comment: { minLength: 1, enabled: true } };
    plugin.metrics = { recordError: jest.fn() };
    let globalAvailable = true;
    plugin.rateLimiter = {
      canSendGlobal: jest.fn(() => globalAvailable),
      isUserOnCooldown: jest.fn().mockReturnValue(false),
      setGlobalCooldown: jest.fn(() => { globalAvailable = false; }),
      setUserCooldown: jest.fn()
    };
    plugin.responseEngine = {
      evaluateChat: jest.fn().mockReturnValue({ type: 'question', score: 1 })
    };
    plugin._dispatchSelectedEvent = jest.fn(() => new Promise(resolve => setTimeout(() => resolve({ responded: true }), 10)));

    const first = plugin._processComment('alice', 'Alice', 'first?');
    const second = plugin._processComment('bob', 'Bob', 'second?');
    await Promise.all([first, second]);

    expect(plugin._dispatchSelectedEvent).toHaveBeenCalledTimes(1);
    expect(plugin.rateLimiter.setGlobalCooldown).toHaveBeenCalledTimes(1);
    expect(plugin.rateLimiter.setUserCooldown).toHaveBeenCalledTimes(1);
  });

  test('records delegated AnimazingPal spoken text for echo suppression', async () => {
    const processSidekickEvent = jest.fn().mockResolvedValue({
      handled: true,
      responded: true,
      spokenText: 'Antwort vom Host-Brain.'
    });
    const plugin = new SidekickPlugin(createApi({
      getPluginInstance: jest.fn().mockReturnValue({ processSidekickEvent })
    }));
    plugin.metrics = { recordResponse: jest.fn(), recordError: jest.fn() };
    plugin.conversationCoordinator = {
      buildViewerEvent: jest.fn().mockReturnValue({ eventType: 'chat', uniqueId: 'alice', comment: 'hi' }),
      recordSidekickSpeech: jest.fn()
    };

    const result = await plugin._dispatchSelectedEvent('chat', { uniqueId: 'alice', comment: 'hi' }, { type: 'question' });

    expect(result.responded).toBe(true);
    expect(plugin.conversationCoordinator.recordSidekickSpeech).toHaveBeenCalledWith('Antwort vom Host-Brain.', expect.objectContaining({
      eventType: 'chat',
      source: 'animazingpal-delegated-output'
    }));
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
        lastRejectedHostSpeechReason: 'echo',
        lastHostSpeechDecision: {
          respond: true,
          reason: 'accepted',
          score: 0.8,
          normalizedText: 'hello host'
        }
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
      lastRejectedHostSpeechReason: 'echo',
      lastHostSpeechDecision: expect.objectContaining({
        respond: true,
        reason: 'accepted',
        score: 0.8
      })
    }));
  });
});

