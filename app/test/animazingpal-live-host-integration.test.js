const AnimazingPalPlugin = require('../plugins/animazingpal/main');
const BrainEngine = require('../plugins/animazingpal/brain/brain-engine');
const { normalizeLiveHostConfig } = require('../plugins/animazingpal/brain/live-host-config');
const SpeechState = require('../plugins/animazingpal/brain/speech-state');
const fs = require('fs');
const path = require('path');

function createPlugin() {
  const ttsPlugin = { speak: jest.fn().mockResolvedValue({ success: true, id: 'tts-1' }) };
  const plugin = Object.create(AnimazingPalPlugin.prototype);
  plugin.api = {
    getPluginInstance: jest.fn(id => id === 'tts' ? ttsPlugin : null),
    registerRoute: jest.fn(),
    setConfig: jest.fn(),
    log: jest.fn(),
    emit: jest.fn()
  };
  plugin.config = plugin.getDefaultConfig();
  plugin.config.brain.liveHost = normalizeLiveHostConfig({
    enabled: true,
    tts: { voiceId: 'fish-host', emotion: 'happy', pitch: 2, volume: 73, speed: 1.1, priority: 91 }
  });
  plugin.speechState = new SpeechState();
  return { plugin, ttsPlugin };
}

describe('AnimazingPal live host integration', () => {
  test('live host UI uploads Host-STT microphone segments as WAV for Fish.audio compatibility', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../plugins/animazingpal/live-host-ui.js'), 'utf8');

    expect(ui).toContain('encodeHostAsrWav');
    expect(ui).toContain("new Blob([wavBuffer], { type: 'audio/wav' })");
    expect(ui).toContain("form.append('audio', blob, 'host-stt.wav')");
  });

  test('live host UI gates silent Host-STT segments before Fish.audio upload', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../plugins/animazingpal/live-host-ui.js'), 'utf8');

    expect(ui).toContain('analyzeHostAsrSignal');
    expect(ui).toContain('shouldUploadHostAsrSegment');
    expect(ui).toContain("reason: 'silence-gated'");
    expect(ui).toContain("input('asr.speechRmsThreshold'");
    expect(ui).toContain("input('asr.speechPeakThreshold'");
    expect(ui).toContain("input('asr.minSpeechMs'");
  });

  test('fresh live host config persists standalone while runtime Sidekick override is temporary', () => {
    const { plugin, ttsPlugin } = createPlugin();
    plugin.ensureLiveHostRuntime = jest.fn();
    plugin.recordLiveHostSourceEvent = jest.fn();
    plugin.safeEmitStatus = jest.fn();

    expect(plugin.config.brain.liveHost.operatingMode).toBe('standalone');

    const changed = plugin.setLiveHostOperatingMode('sidekick', { persist: false });

    expect(changed).toBe(true);
    expect(plugin.liveHostOperatingModeOverride).toBe('sidekick');
    expect(plugin.config.brain.liveHost.operatingMode).toBe('standalone');
    expect(plugin.api.setConfig).not.toHaveBeenCalled();
    expect(ttsPlugin.speak).not.toHaveBeenCalled();

    plugin.clearLiveHostOperatingModeOverride();
    expect(plugin.liveHostOperatingModeOverride).toBeNull();
    expect(plugin.config.brain.liveHost.operatingMode).toBe('standalone');
  });

  test('destroy clears temporary live host operating mode override', async () => {
    const { plugin } = createPlugin();
    plugin.liveHostOperatingModeOverride = 'sidekick';
    plugin.brainEngine = null;
    plugin.disconnect = jest.fn();
    plugin.stopLiveHostIdleMotion = jest.fn();
    plugin.lastEventTimes = new Map();
    plugin.pendingRequests = new Map();
    plugin.stopLiveHostSourceWatchdog = jest.fn();
    plugin.viewerbaseSyncTimer = null;
    plugin.liveHostSourceTimer = null;
    plugin.liveHostEventDeduper = null;

    await plugin.destroy();

    expect(plugin.liveHostOperatingModeOverride).toBeNull();
  });

  test('sidekick mode delegates TikTok response decisions while keeping speech available', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    plugin.config.brain.liveHost.operatingMode = 'sidekick';
    plugin.ensureLiveHostRuntime = jest.fn();
    plugin.recordLiveHostSourceEvent = jest.fn();

    const result = await plugin.processLiveHostEvent('chat', { comment: 'Hallo?' });

    expect(result).toEqual({ handled: false, responded: false, reason: 'delegated-to-sidekick' });
    expect(plugin.recordLiveHostSourceEvent).toHaveBeenCalledWith('chat');
    expect(ttsPlugin.speak).not.toHaveBeenCalled();
  });

  test('delegated sidekick decisions use the configured Brain, viewer memory path and Fish speech', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    plugin.config.brain.liveHost.operatingMode = 'sidekick';
    plugin.config.brain.liveHost.events.chat.cooldownMs = 0;
    plugin.ensureLiveHostRuntime = jest.fn();
    plugin.recordLiveHostSourceEvent = jest.fn();
    plugin.recordLiveHostEventOutcome = jest.fn();
    plugin.isDuplicateLiveHostEvent = jest.fn().mockReturnValue({ duplicate: false });
    plugin.canUseLiveHostResponseSlot = jest.fn().mockReturnValue(true);
    plugin.recordLiveHostResponseSlot = jest.fn();
    plugin.brainEngine = {
      processChat: jest.fn().mockResolvedValue({ text: 'Willkommen zurück, Testviewer!' })
    };

    const result = await plugin.processSidekickEvent('chat', {
      uniqueId: 'testviewer', nickname: 'Test Viewer', comment: 'Wie geht es dir?'
    }, { score: 0.9, type: 'relevant' });

    expect(result).toEqual(expect.objectContaining({ handled: true, responded: true }));
    expect(plugin.brainEngine.processChat).toHaveBeenCalledWith(
      'testviewer',
      'Wie geht es dir?',
      expect.objectContaining({
        forceRespond: true,
        decision: expect.objectContaining({ respond: true, score: expect.any(Number) })
      })
    );
    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Willkommen zurück, Testviewer!',
      engine: 'fishaudio',
      username: 'testviewer'
    }));
  });

  test('processSidekickHostSpeech uses dedicated Brain host path without viewer chat memory path', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    plugin.config.brain.liveHost.operatingMode = 'sidekick';
    plugin.config.brain.liveHost.events.chat.cooldownMs = 0;
    plugin.ensureLiveHostRuntime = jest.fn();
    plugin.recordLiveHostEventOutcome = jest.fn();
    plugin.canUseLiveHostResponseSlot = jest.fn().mockReturnValue(true);
    plugin.recordLiveHostResponseSlot = jest.fn();
    plugin.selectSituationalAvatarAction = jest.fn().mockReturnValue({ actionType: 'idle', actionValue: 2 });
    plugin.executeAction = jest.fn().mockResolvedValue(true);
    plugin.isConnected = true;
    plugin.brainEngine = {
      processHostSpeech: jest.fn().mockResolvedValue({ text: 'Klar, ich halte es kurz.' }),
      processChat: jest.fn()
    };

    const result = await plugin.processSidekickHostSpeech({
      username: 'Streamer',
      message: 'Kannst du kurz reagieren?',
      comment: 'Kannst du kurz reagieren?',
      source: 'host-mic',
      isHostSpeech: true
    }, { score: 0.9, type: 'host-speech', source: 'sidekick-host-speech' });

    expect(result).toEqual(expect.objectContaining({
      handled: true,
      responded: true,
      spokenText: 'Klar, ich halte es kurz.'
    }));
    expect(plugin.brainEngine.processHostSpeech).toHaveBeenCalledWith(
      'Streamer',
      'Kannst du kurz reagieren?',
      expect.objectContaining({
        forceRespond: false,
        source: 'sidekick-host-speech',
        decision: expect.objectContaining({ reason: 'sidekick-selected' })
      })
    );
    expect(plugin.brainEngine.processChat).not.toHaveBeenCalled();
    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Klar, ich halte es kurz.',
      engine: 'fishaudio',
      username: 'Streamer'
    }));
    expect(plugin.executeAction).toHaveBeenCalledWith(
      { actionType: 'idle', actionValue: 2 },
      expect.objectContaining({ username: 'Streamer' })
    );
  });

  test.each([
    [{ success: false, error: 'Fish failed' }, { speechFailed: true, speechBlocked: false }],
    [{ success: true, blocked: true, reason: 'tts-plugin-unavailable' }, { speechFailed: false, speechBlocked: true }]
  ])('delegated sidekick decisions do not report spoken text when Fish speech is not delivered', async (speechResult, flags) => {
    const { plugin, ttsPlugin } = createPlugin();
    ttsPlugin.speak.mockResolvedValue(speechResult);
    plugin.config.brain.liveHost.operatingMode = 'sidekick';
    plugin.config.brain.liveHost.events.chat.cooldownMs = 0;
    plugin.ensureLiveHostRuntime = jest.fn();
    plugin.recordLiveHostSourceEvent = jest.fn();
    plugin.recordLiveHostEventOutcome = jest.fn();
    plugin.isDuplicateLiveHostEvent = jest.fn().mockReturnValue({ duplicate: false });
    plugin.canUseLiveHostResponseSlot = jest.fn().mockReturnValue(true);
    plugin.recordLiveHostResponseSlot = jest.fn();
    plugin.brainEngine = {
      processChat: jest.fn().mockResolvedValue({ text: 'Nicht erfolgreich gesprochen.' })
    };

    const result = await plugin.processSidekickEvent('chat', {
      uniqueId: 'testviewer', nickname: 'Test Viewer', comment: 'Wie geht es dir?'
    }, { score: 0.9, type: 'relevant' });

    expect(result).toEqual(expect.objectContaining({
      handled: true,
      responded: false,
      ...flags
    }));
    expect(result.spokenText).toBeUndefined();
    expect(plugin.recordLiveHostResponseSlot).not.toHaveBeenCalled();
  });

  test('processSidekickHostSpeech returns spokenText only after successful Fish speech', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    ttsPlugin.speak.mockResolvedValue({ success: false, error: 'Fish failed' });
    plugin.config.brain.liveHost.operatingMode = 'sidekick';
    plugin.config.brain.liveHost.events.chat.cooldownMs = 0;
    plugin.recordLiveHostResponseSlot = jest.fn();
    plugin.brainEngine = {
      processHostSpeech: jest.fn().mockResolvedValue({ text: 'Das sollte nicht als gesprochen gelten.' }),
      processChat: jest.fn()
    };

    const result = await plugin.processSidekickHostSpeech({
      username: 'Streamer',
      message: 'Nochmal bitte?',
      source: 'host-mic',
      isHostSpeech: true
    }, { score: 0.9, type: 'host-speech' });

    expect(result).toEqual(expect.objectContaining({
      handled: true,
      responded: false,
      speechFailed: true
    }));
    expect(result.spokenText).toBeUndefined();
    expect(plugin.recordLiveHostResponseSlot).not.toHaveBeenCalled();
  });

  test('processSidekickHostSpeech commits host brain response only after successful Fish speech', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    const commit = jest.fn();
    plugin.config.brain.liveHost.operatingMode = 'sidekick';
    plugin.config.brain.liveHost.events.chat.cooldownMs = 0;
    plugin.recordLiveHostResponseSlot = jest.fn();
    plugin.brainEngine = {
      processHostSpeech: jest.fn().mockResolvedValue({ text: 'Jetzt gesprochen.', commit }),
      processChat: jest.fn()
    };

    const result = await plugin.processSidekickHostSpeech({
      username: 'Streamer',
      message: 'Sag was dazu.',
      source: 'host-mic',
      isHostSpeech: true
    }, { score: 0.9, type: 'host-speech' });

    expect(result).toEqual(expect.objectContaining({
      handled: true,
      responded: true,
      spokenText: 'Jetzt gesprochen.'
    }));
    expect(plugin.brainEngine.processHostSpeech).toHaveBeenCalledWith(
      'Streamer',
      'Sag was dazu.',
      expect.objectContaining({ deferCommit: true })
    );
    expect(commit).toHaveBeenCalledTimes(1);
    expect(plugin.recordLiveHostResponseSlot).toHaveBeenCalledTimes(1);
  });

  test.each([
    [{ success: false, error: 'Fish failed' }, { speechFailed: true }],
    [{ success: true, blocked: true, reason: 'queue-full' }, { speechBlocked: true }]
  ])('processSidekickHostSpeech does not commit host brain response when Fish speech is not delivered', async (speechResult, expectedFlags) => {
    const { plugin, ttsPlugin } = createPlugin();
    const commit = jest.fn();
    ttsPlugin.speak.mockResolvedValue(speechResult);
    plugin.config.brain.liveHost.operatingMode = 'sidekick';
    plugin.config.brain.liveHost.events.chat.cooldownMs = 0;
    plugin.recordLiveHostResponseSlot = jest.fn();
    plugin.brainEngine = {
      processHostSpeech: jest.fn().mockResolvedValue({ text: 'Nicht wirklich gesprochen.', commit }),
      processChat: jest.fn()
    };

    const result = await plugin.processSidekickHostSpeech({
      username: 'Streamer',
      message: 'Sag was dazu.',
      source: 'host-mic',
      isHostSpeech: true
    }, { score: 0.9, type: 'host-speech' });

    expect(result).toEqual(expect.objectContaining({
      handled: true,
      responded: false,
      ...expectedFlags
    }));
    expect(result.spokenText).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
    expect(plugin.recordLiveHostResponseSlot).not.toHaveBeenCalled();
  });

  test('processSidekickHostSpeech does not fallback to viewer chat path when host brain method is unavailable', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    plugin.config.brain.liveHost.operatingMode = 'sidekick';
    plugin.config.brain.liveHost.events.chat.cooldownMs = 0;
    plugin.recordLiveHostEventOutcome = jest.fn();
    plugin.brainEngine = {
      processChat: jest.fn().mockResolvedValue({ text: 'Wrong path.' })
    };

    const result = await plugin.processSidekickHostSpeech({
      username: 'Streamer',
      message: 'Bitte antworte.',
      source: 'host-mic',
      isHostSpeech: true
    }, { score: 0.9, type: 'host-speech' });

    expect(result).toEqual(expect.objectContaining({
      handled: true,
      responded: false,
      reason: 'host-brain-unavailable'
    }));
    expect(plugin.brainEngine.processChat).not.toHaveBeenCalled();
    expect(ttsPlugin.speak).not.toHaveBeenCalled();
  });

  test('delegated host speech can retry after failed Fish speech without AP duplicate suppression', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    ttsPlugin.speak
      .mockResolvedValueOnce({ success: false, error: 'Fish failed' })
      .mockResolvedValueOnce({ success: true, id: 'tts-retry' });
    plugin.config.brain.liveHost.operatingMode = 'sidekick';
    plugin.config.brain.liveHost.events.chat.cooldownMs = 0;
    plugin.brainEngine = {
      processChat: jest.fn().mockResolvedValue({ text: 'Host retry answer.' })
    };

    const hostEvent = {
      uniqueId: 'host',
      nickname: 'Host',
      username: 'Host',
      comment: 'Kannst du das wiederholen?',
      isHostSpeech: true,
      source: 'host-mic'
    };

    const first = await plugin.processSidekickEvent('chat', hostEvent, { score: 0.9, type: 'host-speech' });
    const second = await plugin.processSidekickEvent('chat', hostEvent, { score: 0.9, type: 'host-speech' });

    expect(first).toEqual(expect.objectContaining({
      handled: true,
      responded: false,
      speechFailed: true
    }));
    expect(second).toEqual(expect.objectContaining({
      handled: true,
      responded: true,
      spokenText: 'Host retry answer.'
    }));
    expect(second.duplicate).toBeUndefined();
    expect(ttsPlugin.speak).toHaveBeenCalledTimes(2);
  });

  test('host ASR status exposes persisted microphone settings and Fish readiness', () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.asr.deviceId = 'host-mic-1';
    plugin.config.brain.liveHost.asr.deviceLabel = 'Streamer Mic';
    plugin.brainEngine = {
      processHostSpeech: jest.fn()
    };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? {
        isInitialized: true,
        config: { fishaudioApiKey: 'fish-key' },
        transcribeFishAudio: jest.fn()
      }
      : null);

    const status = plugin._getAsrStatus({
      microphone: {
        deviceId: 'host-mic-1',
        label: 'Streamer Mic',
        blocked: false,
        unsafeOverride: false
      }
    });

    expect(status).toEqual(expect.objectContaining({
      ready: true,
      deviceId: 'host-mic-1',
      deviceLabel: 'Streamer Mic',
      ttsAvailable: true,
      fishConfigured: true
    }));
  });

  test('fresh host STT defaults are ready for first-run browser microphone use', () => {
    const { plugin } = createPlugin();
    const liveHost = plugin.config.brain.liveHost;

    expect(liveHost.asr).toEqual(expect.objectContaining({
      enabled: true,
      deviceId: '',
      unsafeOverride: false,
      language: 'de',
      minTranscriptChars: 1,
      rateLimitMax: 30,
      silenceTimeoutMs: 1200,
      maxSegmentMs: 8000,
      speechRmsThreshold: 0.008,
      speechPeakThreshold: 0.04,
      minSpeechMs: 250
    }));
  expect(liveHost.response).toEqual(expect.objectContaining({
      hostReplyProbability: 1,
      hostMinConfidence: 0.35,
      hostContextCooldownMs: 6000,
      hostOvertalkCooldownMs: 1800,
      hostLongFormWordLimit: 48
    }));
  });

  test('registers STT API aliases in addition to ASR compatibility routes', () => {
    const { plugin } = createPlugin();

    plugin.registerRoutes();

    expect(plugin.api.registerRoute).toHaveBeenCalledWith(
      'get',
      '/api/animazingpal/live-host/stt/status',
      expect.any(Function)
    );
    expect(plugin.api.registerRoute).toHaveBeenCalledWith(
      'post',
      '/api/animazingpal/live-host/stt/transcribe',
      expect.any(Function)
    );
    expect(plugin.api.registerRoute).toHaveBeenCalledWith(
      'get',
      '/api/animazingpal/live-host/asr/status',
      expect.any(Function)
    );
    expect(plugin.api.registerRoute).toHaveBeenCalledWith(
      'post',
      '/api/animazingpal/live-host/asr/transcribe',
      expect.any(Function)
    );
  });

  test('host ASR exposes sanitized upstream Fish.audio errors for diagnosis', () => {
    const { plugin } = createPlugin();

    const sanitized = plugin._sanitizeAsrError(new Error('Fish.audio ASR API error (422): invalid token fish-secret-1234567890'));

    expect(sanitized).toEqual({
      status: 502,
      code: 'ASR_FISH_API_ERROR',
      message: 'Fish.audio ASR API error (422): invalid token [REDACTED]'
    });
  });

  test('processHostSpeechTranscript blocks low-confidence host ASR before Brain delegation', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    plugin.brainEngine = {
      processHostSpeech: jest.fn()
    };

    const result = await plugin.processHostSpeechTranscript('Kannst du reagieren?', {
      confidence: 0.1,
      source: 'animazingpal-host-asr'
    });

    expect(result).toEqual(expect.objectContaining({
      accepted: false,
      delegated: false,
      reason: 'low_confidence',
      decision: expect.objectContaining({ respond: false })
    }));
    expect(plugin.brainEngine.processHostSpeech).not.toHaveBeenCalled();
    expect(ttsPlugin.speak).not.toHaveBeenCalled();
  });

  test('host speech decision accepts direct German answer requests from Host-STT', () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.response.hostReplyProbability = 1;
    plugin.config.brain.liveHost.response.hostMinConfidence = 0.2;
    plugin.config.brain.liveHost.response.minDecisionScore = 0.55;
    plugin.lastHostSpeechDecision = null;
    plugin.lastHostSpeechDecisionAt = null;
    plugin.liveHostHostSpeechHistory = [];

    const decision = plugin.shouldAcceptHostSpeech('Jedenfalls antworten, wenn du diese Frage hörst. Jetzt antworten.', {
      source: 'animazingpal-host-asr',
      timestamp: 100000
    });

    expect(decision).toEqual(expect.objectContaining({
      accept: true,
      respond: true,
      reason: 'accepted',
      score: expect.any(Number),
      features: expect.objectContaining({
        isDirectRequest: true
      })
    }));
    expect(decision.score).toBeGreaterThanOrEqual(0.55);
  });

  test('host speech decision accepts active avatar sidekick name address', () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.response.hostReplyProbability = 0;
    plugin.config.brain.liveHost.response.minDecisionScore = 0.55;
    plugin.config.brain.liveHost.response.sidekickName = 'Pal';
    plugin.config.brain.liveHost.avatarBundles = [
      { id: 'luna-bundle', name: 'Moon Avatar', sidekickName: 'Luna' }
    ];
    plugin.config.brain.liveHost.activeAvatarBundleId = 'luna-bundle';
    plugin.lastHostSpeechDecision = null;
    plugin.lastHostSpeechDecisionAt = null;
    plugin.liveHostHostSpeechHistory = [];

    const decision = plugin.shouldAcceptHostSpeech('Luna, was meinst du dazu?', {
      source: 'animazingpal-host-asr',
      timestamp: 100000
    });

    expect(decision).toEqual(expect.objectContaining({
      accept: true,
      respond: true,
      reason: 'accepted',
      features: expect.objectContaining({
        isAddressedByName: true,
        matchedSidekickName: 'Luna'
      })
    }));
  });

  test('host speech decision accepts viewer-addressed opening phrases', () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.response.hostReplyProbability = 1;
    plugin.config.brain.liveHost.response.minDecisionScore = 0.55;
    plugin.config.brain.liveHost.response.sidekickName = 'Luna';
    plugin.config.brain.liveHost.avatarBundles = [
      { id: 'luna-bundle', name: 'Moon Avatar', sidekickName: 'Luna' }
    ];
    plugin.config.brain.liveHost.activeAvatarBundleId = 'luna-bundle';
    plugin.lastHostSpeechDecision = null;
    plugin.lastHostSpeechDecisionAt = null;
    plugin.liveHostHostSpeechHistory = [];

    const decision = plugin.shouldAcceptHostSpeech('Hallo Luna, kannst du mir kurz helfen?', {
      source: 'animazingpal-host-asr',
      timestamp: 100000
    });

    expect(decision).toEqual(expect.objectContaining({
      accept: true,
      respond: true,
      reason: 'accepted',
      features: expect.objectContaining({ isViewerAddressed: true })
    }));
  });

  test('host speech score gate uses minDecisionScore instead of ASR confidence threshold', () => {
    const { plugin } = createPlugin();
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
    plugin.config.brain.liveHost.response.hostReplyProbability = 1;
    plugin.config.brain.liveHost.response.hostMinConfidence = 0.9;
    plugin.config.brain.liveHost.response.minDecisionScore = 0.4;
    plugin.lastHostSpeechDecision = null;
    plugin.lastHostSpeechDecisionAt = null;
    plugin.liveHostHostSpeechHistory = [];

    const decision = plugin.shouldAcceptHostSpeech('kurzer kommentar?', {
      source: 'animazingpal-host-asr',
      timestamp: 100000
    });

    expect(decision).toEqual(expect.objectContaining({
      accept: true,
      respond: true,
      reason: 'accepted',
      score: 0.7
    }));
    randomSpy.mockRestore();
  });

  test('BrainEngine processHostSpeech avoids viewer profiles and viewer memory writes', async () => {
    const brain = Object.create(BrainEngine.prototype);
    brain.config = {
      enabled: true,
      liveHost: normalizeLiveHostConfig({
        enabled: true,
        response: { systemPrompt: 'Du bist Sidekick.' }
      })
    };
    brain.currentPersonality = { system_prompt: 'Bleib in Character.' };
    brain.currentSession = 'session-1';
    brain.gptBrain = {
      generateHostSpeechResponse: jest.fn().mockResolvedValue({ content: 'Bin dabei.', cached: false })
    };
    brain.memoryDb = {
      getOrCreateUserProfile: jest.fn(),
      addInteractionToHistory: jest.fn(),
      storeConversation: jest.fn(),
      getConversationHistory: jest.fn().mockReturnValue([
        { role: 'assistant', content: 'Vorherige Antwort' }
      ]),
      getInteractionHistory: jest.fn()
    };
    brain.viewerMemory = { getViewerContext: jest.fn(), recordMemory: jest.fn() };
    brain.storeMemory = jest.fn();
    brain._resolveSystemPrompt = BrainEngine.prototype._resolveSystemPrompt.bind(brain);
    brain._checkRateLimit = jest.fn().mockReturnValue(true);
    brain._selectEmotion = jest.fn().mockReturnValue('neutral');
    brain.logger = { debug: jest.fn(), error: jest.fn() };

    const result = await brain.processHostSpeech('Streamer', 'Was denkst du?', {
      forceRespond: true,
      liveContext: { viewerCount: 42, recentEvents: [{ type: 'gift', username: 'vip' }] }
    });

    expect(result).toEqual({ text: 'Bin dabei.', emotion: 'neutral', cached: false });
    expect(brain.gptBrain.generateHostSpeechResponse).toHaveBeenCalledWith(
      'Streamer',
      'Was denkst du?',
      expect.stringContaining('Bleib in Character.'),
      expect.objectContaining({
        liveContext: expect.objectContaining({ viewerCount: 42 }),
        conversationHistory: [{ role: 'assistant', content: 'Vorherige Antwort' }]
      })
    );
    expect(brain.memoryDb.getOrCreateUserProfile).not.toHaveBeenCalled();
    expect(brain.memoryDb.addInteractionToHistory).not.toHaveBeenCalled();
    expect(brain.memoryDb.getInteractionHistory).not.toHaveBeenCalled();
    expect(brain.viewerMemory.getViewerContext).not.toHaveBeenCalled();
    expect(brain.viewerMemory.recordMemory).not.toHaveBeenCalled();
    const hostMemoryCall = brain.storeMemory.mock.calls.find(([content]) => content.includes('Host Streamer sagte'));
    expect(hostMemoryCall).toBeTruthy();
    expect(hostMemoryCall[1]).toEqual(expect.objectContaining({ event: 'host_speech' }));
    expect(hostMemoryCall[1]).not.toHaveProperty('user');
  });

  test('BrainEngine processHostSpeech runs for live host even when legacy brain toggle is off', async () => {
    const brain = Object.create(BrainEngine.prototype);
    brain.config = {
      enabled: false,
      liveHost: normalizeLiveHostConfig({ enabled: true })
    };
    brain.currentPersonality = { system_prompt: 'Bleib in Character.' };
    brain.currentSession = 'session-1';
    brain.gptBrain = {
      generateHostSpeechResponse: jest.fn().mockResolvedValue({ content: 'Ich antworte als Co-Host.', cached: false })
    };
    brain.memoryDb = {
      storeConversation: jest.fn(),
      getConversationHistory: jest.fn().mockReturnValue([])
    };
    brain.storeMemory = jest.fn();
    brain._resolveSystemPrompt = BrainEngine.prototype._resolveSystemPrompt.bind(brain);
    brain._checkRateLimit = jest.fn().mockReturnValue(true);
    brain._selectEmotion = jest.fn().mockReturnValue('neutral');
    brain.logger = { debug: jest.fn(), error: jest.fn() };

    const result = await brain.processHostSpeech('Streamer', 'Kannst du reagieren?', { forceRespond: true });

    expect(result).toEqual(expect.objectContaining({
      text: 'Ich antworte als Co-Host.'
    }));
    expect(brain.gptBrain.generateHostSpeechResponse).toHaveBeenCalled();
  });

  test('processSidekickHostSpeech reports concrete host brain readiness failures', async () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.events.chat.cooldownMs = 0;
    plugin.ensureLiveHostRuntime = jest.fn();
    plugin.recordLiveHostEventOutcome = jest.fn(result => result);
    plugin.canUseLiveHostResponseSlot = jest.fn().mockReturnValue(true);
    plugin.brainEngine = {
      getHostSpeechReadiness: jest.fn().mockReturnValue({
        ready: false,
        reason: 'host-brain-provider-unavailable',
        enabled: true,
        providerConfigured: false,
        personalityConfigured: true
      }),
      processHostSpeech: jest.fn()
    };

    const result = await plugin.processSidekickHostSpeech({
      username: 'Streamer',
      message: 'Kannst du reagieren?',
      source: 'host-mic',
      isHostSpeech: true
    }, { respond: true, score: 0.9, type: 'host-speech' });

    expect(result).toEqual(expect.objectContaining({
      handled: true,
      responded: false,
      reason: 'host-brain-provider-unavailable',
      brainReadiness: expect.objectContaining({ ready: false })
    }));
    expect(plugin.brainEngine.processHostSpeech).not.toHaveBeenCalled();
  });

  test('BrainEngine processHostSpeech can defer assistant host-response memory until commit', async () => {
    const brain = Object.create(BrainEngine.prototype);
    brain.config = {
      enabled: true,
      liveHost: normalizeLiveHostConfig({ enabled: true })
    };
    brain.currentPersonality = { system_prompt: 'Bleib in Character.' };
    brain.currentSession = 'session-1';
    brain.gptBrain = {
      generateHostSpeechResponse: jest.fn().mockResolvedValue({ content: 'Bin dabei.', cached: false })
    };
    brain.memoryDb = {
      getOrCreateUserProfile: jest.fn(),
      addInteractionToHistory: jest.fn(),
      storeConversation: jest.fn(),
      getConversationHistory: jest.fn().mockReturnValue([]),
      getInteractionHistory: jest.fn()
    };
    brain.viewerMemory = { getViewerContext: jest.fn(), recordMemory: jest.fn() };
    brain.storeMemory = jest.fn();
    brain._resolveSystemPrompt = BrainEngine.prototype._resolveSystemPrompt.bind(brain);
    brain._checkRateLimit = jest.fn().mockReturnValue(true);
    brain._selectEmotion = jest.fn().mockReturnValue('neutral');
    brain.logger = { debug: jest.fn(), error: jest.fn() };

    const result = await brain.processHostSpeech('Streamer', 'Was denkst du?', {
      forceRespond: true,
      deferCommit: true
    });

    expect(result).toEqual(expect.objectContaining({
      text: 'Bin dabei.',
      emotion: 'neutral',
      cached: false,
      commit: expect.any(Function)
    }));
    expect(brain.memoryDb.storeConversation).toHaveBeenCalledTimes(1);
    expect(brain.memoryDb.storeConversation).toHaveBeenCalledWith('session-1', 'user', 'Was denkst du?', 'Streamer');
    expect(brain.storeMemory).toHaveBeenCalledTimes(1);
    expect(brain.storeMemory).toHaveBeenCalledWith(expect.stringContaining('Host Streamer sagte'), expect.objectContaining({ event: 'host_speech' }));

    result.commit();

    expect(brain.memoryDb.storeConversation).toHaveBeenCalledWith('session-1', 'assistant', 'Bin dabei.', null, 'neutral');
    expect(brain.storeMemory).toHaveBeenCalledWith(expect.stringContaining('Ich antwortete Host Streamer'), expect.objectContaining({
      event: 'host_speech_response'
    }));
  });

  test('BrainEngine processHostSpeech merges empty host liveContext with stream context', async () => {
    const brain = Object.create(BrainEngine.prototype);
    brain.config = {
      enabled: true,
      liveHost: normalizeLiveHostConfig({ enabled: true })
    };
    brain.currentPersonality = { system_prompt: 'Bleib in Character.' };
    brain.currentSession = 'session-1';
    brain.streamContext = {
      viewerCount: 84,
      recentEvents: [{ type: 'gift', username: 'vip-viewer' }],
      mood: 'excited'
    };
    brain.gptBrain = {
      generateHostSpeechResponse: jest.fn().mockResolvedValue({ content: 'Ich sehe den Hype!', cached: false })
    };
    brain.memoryDb = {
      getOrCreateUserProfile: jest.fn(),
      addInteractionToHistory: jest.fn(),
      storeConversation: jest.fn(),
      getConversationHistory: jest.fn().mockReturnValue([]),
      getInteractionHistory: jest.fn()
    };
    brain.viewerMemory = { getViewerContext: jest.fn(), recordMemory: jest.fn() };
    brain.storeMemory = jest.fn();
    brain._resolveSystemPrompt = BrainEngine.prototype._resolveSystemPrompt.bind(brain);
    brain._checkRateLimit = jest.fn().mockReturnValue(true);
    brain._selectEmotion = jest.fn().mockReturnValue('neutral');
    brain.logger = { debug: jest.fn(), error: jest.fn() };

    await brain.processHostSpeech('Streamer', 'Was passiert gerade?', {
      forceRespond: true,
      liveContext: {}
    });

    expect(brain.gptBrain.generateHostSpeechResponse).toHaveBeenCalledWith(
      'Streamer',
      'Was passiert gerade?',
      expect.any(String),
      expect.objectContaining({
        liveContext: expect.objectContaining({
          viewerCount: 84,
          recentEvents: [{ type: 'gift', username: 'vip-viewer' }],
          mood: 'excited'
        })
      })
    );
    expect(brain.memoryDb.getOrCreateUserProfile).not.toHaveBeenCalled();
    expect(brain.viewerMemory.getViewerContext).not.toHaveBeenCalled();
  });

  test('fresh installs use the canonical 24/7 production profile', () => {
    const plugin = Object.create(AnimazingPalPlugin.prototype);
    const defaults = plugin.getDefaultConfig();

    expect(defaults).toEqual(expect.objectContaining({
      enabled: true,
      host: '127.0.0.1',
      port: 9000,
      autoConnect: true,
      reconnectOnDisconnect: true,
      reconnectDelay: 5000,
      maxReconnectAttempts: 0,
      connectionTimeoutMs: 10000
    }));
    expect(defaults.platform.profiles.animaze).toEqual(expect.objectContaining({
      host: '127.0.0.1', port: 9000, autoConnect: true,
      reconnectOnDisconnect: true, maxReconnectAttempts: 0
    }));
    expect(defaults.brain).toEqual(expect.objectContaining({
      enabled: true,
      standaloneMode: false,
      forceTtsOnlyOnActions: false,
      activePersonality: 'rex'
    }));
    expect(defaults.brain.liveHost.enabled).toBe(true);
    expect(defaults.chatToAvatar.enabled).toBe(false);
  });

  test('sends host responses through Fish.audio with configurable voice fine settings', async () => {
    const { plugin, ttsPlugin } = createPlugin();

    const result = await plugin.speakHostResponse('Willkommen zurück!', { username: 'viewer', eventType: 'follow' });

    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Willkommen zurück!', username: 'viewer', engine: 'fishaudio', voiceId: 'fish-host',
      source: 'animazingpal', teamLevel: 99, priority: 70, emotion: 'happy', pitch: 2, volume: 73, speed: 1.1
    }));
    expect(result.success).toBe(true);
  });

  test('emits host speech success false when Fish speech is blocked', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    ttsPlugin.speak.mockResolvedValue({ success: true, blocked: true, reason: 'queue-full' });

    const result = await plugin.speakHostResponse('Bitte später.', { username: 'viewer', eventType: 'follow' });

    expect(result).toEqual(expect.objectContaining({ blocked: true }));
    expect(plugin.api.emit).toHaveBeenCalledWith('animazingpal:host-speech', expect.objectContaining({
      eventType: 'follow',
      username: 'viewer',
      success: false
    }));
  });

  test('dry-runs the live-host TTS probe without enqueueing speech', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    ttsPlugin.config = { defaultEngine: 'fishaudio' };
    ttsPlugin.queueManager = { getInfo: jest.fn(() => ({ size: 0, maxSize: 100 })) };
    plugin.safeEmitStatus = jest.fn();

    const result = await plugin.runLiveHostTtsProbe({ speak: false });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      speak: false,
      engine: 'fishaudio',
      enabled: true,
      pluginAvailable: true,
      queue: { size: 0, maxSize: 100 }
    }));
    expect(ttsPlugin.speak).not.toHaveBeenCalled();
    expect(plugin.liveHostDiagnostics.lastTtsProbe).toBe(result);
    expect(plugin.safeEmitStatus).toHaveBeenCalled();
  });

  test('stores spoken live-host TTS probe failures for preflight diagnostics', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    ttsPlugin.speak.mockResolvedValue({ success: false, error: 'Fish failed' });
    plugin.safeEmitStatus = jest.fn();

    const result = await plugin.runLiveHostTtsProbe({ speak: true, text: 'Probe' });
    const preflight = plugin.evaluateLiveHostPreflight({});

    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Probe',
      username: 'AnimazingPal',
      source: 'animazingpal'
    }));
    expect(result).toEqual(expect.objectContaining({
      success: false,
      speak: true,
      error: 'Fish failed'
    }));
    expect(plugin.liveHostDiagnostics.lastTtsProbe).toBe(result);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'tts.probe', status: 'error' })
    ]));
  });

  test('preflight warns when the last successful TTS probe is stale', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.config.brain.liveHost.tts.probeStaleMs = 300000;
    plugin.ensureLiveHostRuntime();
    plugin.liveHostDiagnostics.lastTtsProbe = {
      success: true,
      engine: 'fishaudio',
      checkedAt: new Date(Date.now() - 600000).toISOString()
    };
    plugin.api.tiktok = { isConnected: () => true };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0, maxSize: 100 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({
      browser: {
        sinkSupported: true,
        audioUnlocked: true,
        configuredOutputDeviceAvailable: true,
        playback: { status: 'ended', lastRouting: { routed: true } }
      }
    });

    expect(preflight.ready).toBe(true);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'tts.probe', status: 'warn' })
    ]));
  });

  test('safe config exposes live host settings without provider secrets', () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'do-not-expose';
    plugin.getActivePlatformKey = () => 'animaze';
    plugin.getPlatformProfile = () => plugin.config.platform.profiles.animaze;
    plugin.getActivePlatformDefinition = () => ({ key: 'animaze' });
    plugin.getSupportedPlatforms = () => [];

    const safe = plugin.getSafeConfig();

    expect(safe.brain.liveHost.providers.ollama.apiKey).toBeUndefined();
    expect(safe.brain.liveHost.providers.ollama.apiKeyConfigured).toBe(true);
  });

  test('resolves gift catalog mappings by gift id before name fallback', () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.avatarBundles = [
      { id: 'rose-host', avatarName: 'RoseAvatar', personalityId: 'sarcastic_host', giftIds: ['5655'], giftNames: ['Rose'], voiceId: 'fish-rose' },
      { id: 'name-only', avatarName: 'OtherAvatar', giftIds: [], giftNames: ['Rose'] }
    ];

    expect(plugin.resolveAvatarBundleForGift({ giftId: 5655, giftName: 'Rose' }).id).toBe('rose-host');
    expect(plugin.resolveAvatarBundleForGift({ giftId: 9999, giftName: 'rose' }).id).toBe('rose-host');
  });

  test('activates an avatar bundle with its personality and Fish voice', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    plugin.config.brain.liveHost.avatarBundles = [{
      id: 'rose-host', avatarName: 'RoseAvatar', personalityId: 'sarcastic_host',
      giftIds: ['5655'], voiceId: 'fish-rose', emotion: 'amused', volume: 88
    }];
    plugin.loadAvatar = jest.fn().mockResolvedValue(true);
    plugin.brainEngine = { setActivePersonality: jest.fn().mockResolvedValue(true) };
    plugin.api.setConfig = jest.fn();

    const result = await plugin.activateAvatarBundle('rose-host', { reason: 'gift:5655' });
    await plugin.speakHostResponse('Danke!', { username: 'alice', eventType: 'gift' });

    expect(plugin.loadAvatar).toHaveBeenCalledWith('RoseAvatar');
    expect(plugin.brainEngine.setActivePersonality).toHaveBeenCalledWith('sarcastic_host');
    expect(plugin.config.brain.liveHost.activeAvatarBundleId).toBe('rose-host');
    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      voiceId: 'fish-rose', emotion: 'amused', volume: 88
    }));
    expect(result.success).toBe(true);
  });

  test('live-host config route preserves secrets and applies editable fine settings immediately', async () => {
    const routes = [];
    const plugin = new AnimazingPalPlugin({
      getSocketIO: () => ({ emit: jest.fn() }),
      getDatabase: () => ({}),
      registerRoute: (method, path, handler) => routes.push({ method: method.toLowerCase(), path, handler }),
      registerSocket: jest.fn(), registerTikTokEvent: jest.fn(), emit: jest.fn(), log: jest.fn(),
      getConfig: jest.fn(), setConfig: jest.fn(), getPlugin: jest.fn()
    });
    plugin.config = plugin.normalizeConfig(plugin.getDefaultConfig());
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'existing-secret';
    plugin.brainEngine = { configure: jest.fn(), getStatistics: jest.fn(), getPersonalities: jest.fn() };
    plugin.registerRoutes();
    const route = routes.find(item => item.method === 'post' && item.path === '/api/animazingpal/live-host/config');
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await route.handler({ body: {
      provider: 'ollama', providers: { ollama: { apiKey: '', temperature: 0.33 } },
      response: { maxResponsesPerMinute: 17 }
    } }, res);

    expect(plugin.config.brain.liveHost.providers.ollama.apiKey).toBe('existing-secret');
    expect(plugin.config.brain.liveHost.providers.ollama.temperature).toBe(0.33);
    expect(plugin.config.brain.liveHost.response.maxResponsesPerMinute).toBe(17);
    expect(plugin.brainEngine.configure).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].config.providers.ollama.apiKey).toBeUndefined();
    plugin.stopLiveHostIdleMotion();
  });

  test('section resets clear dependent state without touching unrelated setup', async () => {
    const routes = [];
    const plugin = new AnimazingPalPlugin({
      getSocketIO: () => ({ emit: jest.fn() }),
      getDatabase: () => ({}),
      registerRoute: (method, path, handler) => routes.push({ method: method.toLowerCase(), path, handler }),
      registerSocket: jest.fn(), registerTikTokEvent: jest.fn(), emit: jest.fn(), log: jest.fn(),
      getConfig: jest.fn(), setConfig: jest.fn(), getPlugin: jest.fn()
    });
    plugin.config = plugin.normalizeConfig(plugin.getDefaultConfig());
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'existing-secret';
    plugin.config.brain.liveHost.provider = 'gemini';
    plugin.config.brain.liveHost.tts.voiceId = 'saved-fish';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'saved-cable';
    plugin.config.brain.liveHost.source.username = 'saved-stream';
    plugin.config.brain.liveHost.avatarBundles = [{ id: 'rose', avatarName: 'Rose' }];
    plugin.config.brain.liveHost.activeAvatarBundleId = 'rose';
    plugin.brainEngine = { configure: jest.fn(), getStatistics: jest.fn(), getPersonalities: jest.fn() };
    plugin.registerRoutes();
    const route = routes.find(item => item.path === '/api/animazingpal/live-host/reset');
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await route.handler({ body: { section: 'avatarBundles' } }, res);

    expect(plugin.config.brain.liveHost.avatarBundles).toEqual([]);
    expect(plugin.config.brain.liveHost.activeAvatarBundleId).toBe('');
    expect(plugin.config.brain.liveHost.providers.ollama.apiKey).toBe('existing-secret');
    expect(plugin.config.brain.liveHost.tts.voiceId).toBe('saved-fish');
    expect(plugin.config.brain.liveHost.audio.outputDeviceId).toBe('saved-cable');
    expect(plugin.config.brain.liveHost.source.username).toBe('saved-stream');
    plugin.stopLiveHostIdleMotion();
  });

  test('24/7 production preset also applies unattended Animaze connection defaults', async () => {
    const routes = [];
    const plugin = new AnimazingPalPlugin({
      getSocketIO: () => ({ emit: jest.fn() }),
      getDatabase: () => ({}),
      registerRoute: (method, path, handler) => routes.push({ method: method.toLowerCase(), path, handler }),
      registerSocket: jest.fn(), registerTikTokEvent: jest.fn(), emit: jest.fn(), log: jest.fn(),
      getConfig: jest.fn(), setConfig: jest.fn(), getPlugin: jest.fn()
    });
    plugin.config = plugin.normalizeConfig(plugin.getDefaultConfig());
    plugin.config.enabled = false;
    plugin.config.port = 8008;
    plugin.config.maxReconnectAttempts = 10;
    plugin.config.platform.profiles.animaze.port = 8008;
    plugin.config.platform.profiles.animaze.maxReconnectAttempts = 10;
    plugin.brainEngine = { configure: jest.fn(), getStatistics: jest.fn(), getPersonalities: jest.fn() };
    plugin.registerRoutes();
    const route = routes.find(item => item.path === '/api/animazingpal/live-host/preset');
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await route.handler({ body: { preset: 'production-24-7' } }, res);

    expect(plugin.config).toEqual(expect.objectContaining({
      enabled: true,
      port: 9000,
      autoConnect: true,
      reconnectOnDisconnect: true,
      reconnectDelay: 5000,
      maxReconnectAttempts: 0,
      connectionTimeoutMs: 10000
    }));
    expect(plugin.config.platform.profiles.animaze).toEqual(expect.objectContaining({
      port: 9000,
      autoConnect: true,
      reconnectOnDisconnect: true,
      reconnectDelay: 5000,
      maxReconnectAttempts: 0,
      connectionTimeoutMs: 10000
    }));
    expect(plugin.maxReconnectAttempts).toBe(0);
    plugin.stopLiveHostIdleMotion();
    plugin.stopLiveHostSourceWatchdog();
  });

  test('routes generated host responses to Fish.audio instead of Animaze ChatPal', async () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.sendChatMessage = jest.fn();
    plugin.speakHostResponse = jest.fn().mockResolvedValue({ success: true });
    plugin.isVrchatIntegrationEnabled = () => false;
    plugin.getVrchatIntegrationConfig = () => ({});

    plugin.relayChatMessage('Danke für das Geschenk!', {
      eventType: 'brainResponse', username: 'alice', metadata: { sourceEvent: 'gift' }
    });
    await Promise.resolve();

    expect(plugin.speakHostResponse).toHaveBeenCalledWith('Danke für das Geschenk!', expect.objectContaining({
      username: 'alice', eventType: 'gift'
    }));
    expect(plugin.sendChatMessage).not.toHaveBeenCalled();
  });

  test('routes configured legacy action messages through Fish while Live Host is active', async () => {
    const { plugin } = createPlugin();
    plugin.sendChatMessage = jest.fn();
    plugin.speakHostResponse = jest.fn().mockResolvedValue({ success: true });

    await plugin.executeAction({
      enabled: true,
      actionType: 'chatMessage',
      actionValue: null,
      chatMessage: 'Willkommen {username}!',
      useEcho: null
    }, { username: 'alice' });

    expect(plugin.speakHostResponse).toHaveBeenCalledWith('Willkommen alice!', expect.objectContaining({ username: 'alice' }));
    expect(plugin.sendChatMessage).not.toHaveBeenCalled();
  });

  test('does not expose direct ChatPal route or socket controls', () => {
    const routes = [];
    const sockets = [];
    const plugin = new AnimazingPalPlugin({
      getSocketIO: () => ({ emit: jest.fn() }),
      getDatabase: () => ({}),
      registerRoute: (method, path, handler) => routes.push({ method, path, handler }),
      registerSocket: (name, handler) => sockets.push({ name, handler }),
      registerTikTokEvent: jest.fn(), emit: jest.fn(), log: jest.fn(),
      getConfig: jest.fn(), setConfig: jest.fn(), getPlugin: jest.fn()
    });
    plugin.config = plugin.normalizeConfig(plugin.getDefaultConfig());
    plugin.brainEngine = { getStatistics: jest.fn(), getPersonalities: jest.fn() };

    plugin.registerRoutes();
    plugin.registerSocketEvents();

    expect(routes.map(route => route.path)).not.toContain('/api/animazingpal/chatpal');
    expect(sockets.map(socket => socket.name)).not.toContain('animazingpal:chatpal');
  });

  test('processes configurable event templates through Fish.audio', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    Object.assign(plugin.config.brain.liveHost.events.join, {
      enabled: true, probability: 1, cooldownMs: 0, templateEnabled: true,
      brainEnabled: false, template: 'Willkommen {nickname}!'
    });

    const result = await plugin.processLiveHostEvent('join', { uniqueId: 'alice', nickname: 'Alice' });

    expect(result).toEqual({ handled: true, responded: true });
    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Willkommen Alice!', username: 'alice', engine: 'fishaudio'
    }));
  });

  test('auto decision mode skips low-signal chat without using random probability', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    Object.assign(plugin.config.brain.liveHost.response, { decisionMode: 'auto', minDecisionScore: 0.55 });
    Object.assign(plugin.config.brain.liveHost.events.chat, {
      enabled: true, probability: 1, cooldownMs: 0, brainEnabled: true
    });
    plugin.brainEngine = { processChat: jest.fn().mockResolvedValue({ text: 'Soll nicht passieren.' }) };

    const result = await plugin.processLiveHostEvent('chat', { uniqueId: 'lurker', nickname: 'Lurker', comment: 'lol' });

    expect(result).toEqual(expect.objectContaining({ handled: true, responded: false }));
    expect(plugin.brainEngine.processChat).not.toHaveBeenCalled();
    expect(ttsPlugin.speak).not.toHaveBeenCalled();
    expect(plugin.getLiveHostRuntimeStatus().diagnostics.lastEventResult).toEqual(expect.objectContaining({
      eventType: 'chat',
      responded: false,
      reason: 'decision:chat_base'
    }));
  });

  test('auto decision mode responds to high-signal chat questions', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    Object.assign(plugin.config.brain.liveHost.response, { decisionMode: 'auto', minDecisionScore: 0.55 });
    Object.assign(plugin.config.brain.liveHost.events.chat, {
      enabled: true, probability: 0, cooldownMs: 0, brainEnabled: true
    });
    plugin.brainEngine = { processChat: jest.fn().mockResolvedValue({ text: 'Kurz gesagt: ja.' }) };

    const result = await plugin.processLiveHostEvent('chat', {
      uniqueId: 'vip-viewer', nickname: 'VIP', comment: '@host kannst du das erklären?', teamMemberLevel: 15
    });

    expect(result).toEqual(expect.objectContaining({ handled: true, responded: true }));
    expect(plugin.brainEngine.processChat).toHaveBeenCalledWith('vip-viewer', '@host kannst du das erklären?', expect.objectContaining({
      decision: expect.objectContaining({ mode: 'auto', reasons: expect.arrayContaining(['question', 'mention', 'supporter']) })
    }));
    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Kurz gesagt: ja.' }));
  });

  test('deduplicates repeated live-host events before generating speech', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    Object.assign(plugin.config.brain.liveHost.events.gift, {
      enabled: true, probability: 1, cooldownMs: 0, templateEnabled: true,
      brainEnabled: false, template: 'Danke für {giftName}, {nickname}!'
    });
    const event = { msgId: 'gift-123', uniqueId: 'alice', nickname: 'Alice', giftName: 'Rose', diamondCount: 1 };

    const first = await plugin.processLiveHostEvent('gift', event);
    const second = await plugin.processLiveHostEvent('gift', event);

    expect(first).toEqual(expect.objectContaining({ handled: true, responded: true }));
    expect(second).toEqual(expect.objectContaining({ handled: true, responded: false, duplicate: true }));
    expect(ttsPlugin.speak).toHaveBeenCalledTimes(1);
    expect(plugin.getLiveHostRuntimeStatus().diagnostics.dedupedEvents).toBe(1);
  });

  test('rate limits live-host speech slots for unattended streams', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    Object.assign(plugin.config.brain.liveHost.response, { maxResponsesPerMinute: 1 });
    Object.assign(plugin.config.brain.liveHost.events.gift, {
      enabled: true, probability: 1, cooldownMs: 0, templateEnabled: true,
      brainEnabled: false, template: 'Danke für {giftName}, {nickname}!'
    });

    const first = await plugin.processLiveHostEvent('gift', {
      msgId: 'gift-1', uniqueId: 'alice', nickname: 'Alice', giftName: 'Rose', diamondCount: 1
    });
    const second = await plugin.processLiveHostEvent('gift', {
      msgId: 'gift-2', uniqueId: 'bob', nickname: 'Bob', giftName: 'Heart', diamondCount: 1
    });

    expect(first).toEqual(expect.objectContaining({ handled: true, responded: true }));
    expect(second).toEqual(expect.objectContaining({ handled: true, responded: false, rateLimited: true }));
    expect(ttsPlugin.speak).toHaveBeenCalledTimes(1);
    expect(plugin.getLiveHostRuntimeStatus().diagnostics.rateLimitedResponses).toBe(1);
    expect(plugin.getLiveHostRuntimeStatus().diagnostics.lastEventResult).toEqual(expect.objectContaining({
      eventType: 'gift',
      responded: false,
      reason: 'rate-limited'
    }));
  });

  test('tracks live-host event outcome counters for unattended silence diagnostics', async () => {
    const { plugin } = createPlugin();
    Object.assign(plugin.config.brain.liveHost.events.follow, {
      enabled: true, probability: 1, cooldownMs: 0, templateEnabled: true,
      brainEnabled: false, avatarActionEnabled: false, template: 'Danke {username}'
    });
    Object.assign(plugin.config.brain.liveHost.events.chat, {
      enabled: true, probability: 1, cooldownMs: 0, brainEnabled: true,
      templateEnabled: false, avatarActionEnabled: false
    });
    plugin.brainEngine = { processChat: jest.fn() };

    await plugin.processLiveHostEvent('follow', { uniqueId: 'alice' });
    await plugin.processLiveHostEvent('chat', { uniqueId: 'bob', comment: 'lol' });

    expect(plugin.getLiveHostRuntimeStatus().diagnostics).toEqual(expect.objectContaining({
      processedEvents: 2,
      respondedEvents: 1,
      skippedEvents: 1,
      lastEventResult: expect.objectContaining({
        eventType: 'chat',
        responded: false,
        reason: 'decision:chat_base'
      })
    }));
  });

  test('preflight warns when live events are processed but no host response has spoken', async () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.response.silenceWarnAfterEvents = 2;
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.tiktok = { isConnected: () => true, currentUsername: 'jeffreestar' };
    Object.assign(plugin.config.brain.liveHost.events.chat, {
      enabled: true, probability: 1, cooldownMs: 0, brainEnabled: true,
      templateEnabled: false, avatarActionEnabled: false
    });
    plugin.brainEngine = { processChat: jest.fn() };

    await plugin.processLiveHostEvent('chat', { uniqueId: 'a', comment: 'lol' });
    await plugin.processLiveHostEvent('chat', { uniqueId: 'b', comment: 'haha' });
    const preflight = plugin.evaluateLiveHostPreflight({ browser: { sinkSupported: true, audioUnlocked: true } });

    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'runtime.responseFlow', status: 'warn' })
    ]));
  });

  test('triggers situational Animaze actions from available defaults', async () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.animazeData = { emotes: [], specialActions: [], idleAnims: [] };
    plugin.animazeData.emotes = [{ friendlyName: 'Love', itemName: 'Emote_Hearts' }];
    plugin.animazeData.specialActions = [{ animName: 'Hello', index: 0 }];
    plugin.animazeData.idleAnims = [{ animName: 'Explaining 1', index: 18 }];
    plugin.triggerEmote = jest.fn().mockResolvedValue(true);
    Object.assign(plugin.config.brain.liveHost.events.gift, {
      enabled: true, cooldownMs: 0, brainEnabled: false, templateEnabled: false, avatarActionEnabled: true
    });

    const result = await plugin.processLiveHostEvent('gift', { uniqueId: 'alice', giftName: 'Rose', diamondCount: 1 });

    expect(result).toEqual(expect.objectContaining({ handled: true }));
    expect(plugin.triggerEmote).toHaveBeenCalledWith('Emote_Hearts');
  });

  test('passes each event prompt into the selected personality response', async () => {
    const { plugin, ttsPlugin } = createPlugin();
    Object.assign(plugin.config.brain.liveHost.events.follow, {
      enabled: true, probability: 1, cooldownMs: 0, templateEnabled: false,
      brainEnabled: true, prompt: 'Antworte besonders trocken.'
    });
    plugin.brainEngine = { processFollow: jest.fn().mockResolvedValue({ text: 'Na endlich.', emotion: 'amused' }) };

    await plugin.processLiveHostEvent('follow', { uniqueId: 'bob', nickname: 'Bob' });

    expect(plugin.brainEngine.processFollow).toHaveBeenCalledWith('bob', expect.objectContaining({
      forceRespond: true, systemPromptOverride: 'Antworte besonders trocken.'
    }));
    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Na endlich.' }));
  });

  test('falls back to default follow thanks when follow has no configured response', async () => {
    const { plugin, ttsPlugin } = createPlugin();

    Object.assign(plugin.config.brain.liveHost.events.follow, {
      enabled: true,
      probability: 1,
      cooldownMs: 0,
      templateEnabled: false,
      brainEnabled: false,
      avatarActionEnabled: false,
      template: ''
    });

    await plugin.processLiveHostEvent('follow', { uniqueId: 'alice', nickname: 'Alice' });

    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Danke'),
      source: 'animazingpal-host-speech-output',
      username: 'alice'
    }));
  });

  test('status route exposes live-host runtime diagnostics', () => {
    const routes = [];
    const plugin = new AnimazingPalPlugin({
      getSocketIO: () => ({ emit: jest.fn() }),
      getDatabase: () => ({}),
      registerRoute: (method, path, handler) => routes.push({ method: method.toLowerCase(), path, handler }),
      registerSocket: jest.fn(), registerTikTokEvent: jest.fn(), emit: jest.fn(), log: jest.fn(),
      getConfig: jest.fn(), setConfig: jest.fn(), getPlugin: jest.fn()
    });
    plugin.config = plugin.normalizeConfig(plugin.getDefaultConfig());
    plugin.brainEngine = { getStatistics: jest.fn(), getPersonalities: jest.fn() };
    plugin.registerRoutes();
    const route = routes.find(item => item.path === '/api/animazingpal/status');
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    route.handler({}, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      liveHostRuntime: expect.objectContaining({
        speaking: false,
        animazeConnected: false,
        animazeReconnectScheduled: false,
        animazeReconnectAttempts: 0,
        browserHeartbeat: expect.objectContaining({
          present: false,
          stale: true
        }),
        sourceStatus: expect.objectContaining({
          configured: false,
          connectedToSource: false
        }),
        dedupeCacheSize: 0,
        responseSlotsUsedLastMinute: 0,
        diagnostics: expect.objectContaining({
          dedupedEvents: 0,
          rateLimitedResponses: 0
        })
      })
    }));
  });

  test('preflight reports a ready standalone host with concrete component checks', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.tiktok = { isConnected: () => true };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({ browser: { sinkSupported: true, audioUnlocked: true } });

    expect(preflight.ready).toBe(true);
    expect(preflight.summary.errors).toBe(0);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'liveHost.enabled', status: 'ok' }),
      expect.objectContaining({ id: 'tts.plugin', status: 'ok' }),
      expect.objectContaining({ id: 'audio.browser', status: 'ok' }),
      expect.objectContaining({ id: 'animaze.connection', status: 'ok' }),
      expect.objectContaining({ id: 'source.readOnly', status: 'ok' })
    ]));
  });

  test('preflight uses the dedicated animaze output device when it is configured', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.animaze.audioOutputDeviceId = 'animaze-cable';
    plugin.config.brain.liveHost.animaze.audioOutputDeviceLabel = 'Animaze Cable';
    plugin.api.tiktok = { isConnected: () => true };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({ browser: { sinkSupported: true, audioUnlocked: true } });

    expect(preflight.ready).toBe(true);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'audio.output', status: 'ok' }),
      expect.objectContaining({ id: 'audio.playback', status: 'warn' })
    ]));
  });

  test('preflight fails loud when critical 24/7 host prerequisites are missing', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = false;
    plugin.config.brain.liveHost.enabled = true;
    plugin.config.brain.liveHost.tts.enabled = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = '';
    plugin.config.brain.liveHost.source.username = '';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.getPluginInstance = jest.fn(() => null);

    const preflight = plugin.evaluateLiveHostPreflight({ browser: { sinkSupported: false, audioUnlocked: false } });

    expect(preflight.ready).toBe(false);
    expect(preflight.summary.errors).toBeGreaterThan(0);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'provider.credentials', status: 'error' }),
      expect.objectContaining({ id: 'tts.plugin', status: 'error' }),
      expect.objectContaining({ id: 'audio.browser', status: 'error' }),
      expect.objectContaining({ id: 'animaze.connection', status: 'error' }),
      expect.objectContaining({ id: 'source.username', status: 'error' })
    ]));
  });

  test('preflight detects TTS through getPlugin fallback used by the runtime API', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.getPluginInstance = undefined;
    plugin.api.getPlugin = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0, maxSize: 100 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({ browser: { sinkSupported: true, audioUnlocked: true } });

    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'tts.plugin', status: 'ok' })
    ]));
  });

  test('preflight warns when the TTS queue is full', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.tiktok = { isConnected: () => true };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 100, maxSize: 100 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({
      browser: {
        sinkSupported: true,
        audioUnlocked: true,
        configuredOutputDeviceAvailable: true,
        playback: { status: 'ended', lastRouting: { routed: true } }
      }
    });

    expect(preflight.ready).toBe(true);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'tts.queue', status: 'warn' })
    ]));
  });

  test('preflight warns when the TTS queue exceeds the configured warning ratio', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.config.brain.liveHost.response.queueWarnRatio = 0.8;
    plugin.api.tiktok = { isConnected: () => true };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 85, maxSize: 100 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({
      browser: {
        sinkSupported: true,
        audioUnlocked: true,
        configuredOutputDeviceAvailable: true,
        playback: { status: 'ended', lastRouting: { routed: true } }
      }
    });

    expect(preflight.ready).toBe(true);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'tts.queue', status: 'warn' })
    ]));
  });

  test('preflight warns when TTS queue telemetry is unavailable', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.tiktok = { isConnected: () => true };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({
      browser: {
        sinkSupported: true,
        audioUnlocked: true,
        configuredOutputDeviceAvailable: true,
        playback: { status: 'ended', lastRouting: { routed: true } }
      }
    });

    expect(preflight.ready).toBe(true);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'tts.queue', status: 'warn' })
    ]));
  });

  test('records live source events for unattended stream freshness diagnostics', async () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.events.chat.brainEnabled = false;
    plugin.config.brain.liveHost.events.chat.templateEnabled = false;

    await plugin.processLiveHostEvent('chat', { uniqueId: 'viewer', comment: 'hi' });

    expect(plugin.liveHostDiagnostics.lastSourceEventAt).toEqual(expect.any(String));
    expect(plugin.liveHostDiagnostics.lastSourceEventType).toBe('chat');
    expect(plugin.getLiveHostRuntimeStatus().sourceEventStatus).toEqual(expect.objectContaining({
      seen: true,
      eventType: 'chat',
      stale: false
    }));
  });

  test('preflight warns when the connected source has stale live events', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.source.eventStaleMs = 30000;
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.tiktok = { isConnected: () => true, currentUsername: 'jeffreestar' };
    plugin.ensureLiveHostRuntime();
    plugin.liveHostDiagnostics.lastSourceEventAt = new Date(Date.now() - 60000).toISOString();

    const preflight = plugin.evaluateLiveHostPreflight({ browser: { sinkSupported: true, audioUnlocked: true } });

    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'source.events', status: 'warn' })
    ]));
  });

  test('source watchdog reconnects a connected source when live events go stale and recovery is enabled', async () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.source = {
      username: 'jeffreestar',
      readOnly: true,
      autoConnect: true,
      eventStaleMs: 30000,
      reconnectOnEventStale: true
    };
    plugin.api.tiktok = {
      isConnected: () => true,
      currentUsername: 'jeffreestar',
      connect: jest.fn().mockResolvedValue(true)
    };
    plugin.safeEmitStatus = jest.fn();
    plugin.ensureLiveHostRuntime();
    plugin.liveHostDiagnostics.lastSourceEventAt = new Date(Date.now() - 60000).toISOString();

    const result = await plugin.runLiveHostSourceWatchdog();

    expect(result.reconnected).toBe(true);
    expect(result.reason).toBe('stale-events');
    expect(plugin.api.tiktok.connect).toHaveBeenCalledWith('jeffreestar');
  });

  test('source watchdog schedules checks with the configured interval', () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.source = {
      username: 'jeffreestar',
      readOnly: true,
      autoConnect: true,
      watchdogIntervalMs: 12000
    };
    plugin.api.tiktok = { connect: jest.fn() };
    const timer = { id: 'source-watchdog' };
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockReturnValue(timer);

    try {
      expect(plugin.startLiveHostSourceWatchdog()).toBe(true);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 12000);
      expect(plugin.liveHostSourceWatchdogTimer).toBe(timer);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  test('preflight blocks stale browser audio device ids that would leak to default output', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'old-browser-device-id';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.config.brain.liveHost.audio.missingDeviceBehavior = 'default';
    plugin.api.tiktok = { isConnected: () => true };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({
      browser: {
        sinkSupported: true,
        audioUnlocked: true,
        configuredOutputDeviceAvailable: false,
        selectedOutputDeviceId: ''
      }
    });

    expect(preflight.ready).toBe(false);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'audio.device',
        status: 'error'
      })
    ]));
  });

  test('preflight warns until browser TTS playback has been successfully routed', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.tiktok = { isConnected: () => true };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({
      browser: {
        sinkSupported: true,
        audioUnlocked: true,
        configuredOutputDeviceAvailable: true,
        playback: { status: 'idle' }
      }
    });

    expect(preflight.ready).toBe(true);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'audio.playback', status: 'warn' })
    ]));
  });

  test('preflight blocks recent browser TTS playback and routing failures', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.tiktok = { isConnected: () => true };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({
      browser: {
        sinkSupported: true,
        audioUnlocked: true,
        configuredOutputDeviceAvailable: true,
        playback: {
          status: 'error',
          lastError: 'setSinkId failed',
          lastRouting: { routed: false, reason: 'NotFoundError' }
        }
      }
    });

    expect(preflight.ready).toBe(false);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'audio.playback', status: 'error' })
    ]));
  });

  test('records browser host heartbeats for unattended TTS routing diagnostics', () => {
    const { plugin } = createPlugin();

    const heartbeat = plugin.recordLiveHostBrowserHeartbeat({
      browser: {
        sinkSupported: true,
        audioUnlocked: true,
        configuredOutputDeviceAvailable: true,
        selectedOutputDeviceId: 'cable-device',
        playback: {
          status: 'idle',
          lastRouting: { routed: true }
        }
      }
    });

    expect(heartbeat).toEqual(expect.objectContaining({
      present: true,
      stale: false,
      audioUnlocked: true,
      configuredOutputDeviceAvailable: true,
      selectedOutputDeviceId: 'cable-device',
      playback: expect.objectContaining({
        status: 'idle',
        lastRouting: expect.objectContaining({ routed: true })
      })
    }));
    expect(plugin.getLiveHostRuntimeStatus().browserHeartbeat).toEqual(expect.objectContaining({
      present: true,
      stale: false
    }));
  });

  test('browser heartbeat stale threshold is configurable for unattended browser sessions', () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.diagnostics.browserHeartbeatStaleMs = 120000;
    plugin.liveHostBrowserHeartbeat = {
      receivedAt: new Date(100000).toISOString(),
      receivedAtMs: 100000,
      sinkSupported: true,
      audioUnlocked: true,
      configuredOutputDeviceAvailable: true,
      selectedOutputDeviceId: 'cable-device',
      playback: { status: 'idle', lastRouting: { routed: true } }
    };

    const status = plugin.getLiveHostBrowserHeartbeatStatus(160000);

    expect(status).toEqual(expect.objectContaining({
      present: true,
      stale: false,
      ageMs: 60000,
      thresholdMs: 120000
    }));
  });

  test('preflight can use the latest browser heartbeat when no inline browser state is posted', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0 }) } }
      : null);
    plugin.recordLiveHostBrowserHeartbeat({
      browser: {
        sinkSupported: true,
        audioUnlocked: true,
        configuredOutputDeviceAvailable: true,
        selectedOutputDeviceId: 'cable-device',
        playback: { status: 'idle', lastRouting: { routed: true } }
      }
    });

    const preflight = plugin.evaluateLiveHostPreflight();

    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'browser.heartbeat', status: 'ok' }),
      expect.objectContaining({ id: 'audio.browser', status: 'ok' })
    ]));
  });

  test('preflight fails when no standalone browser heartbeat is available', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight();

    expect(preflight.ready).toBe(false);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'browser.heartbeat', status: 'error' })
    ]));
  });

  test('reports live host TikTok source status from the runtime connector', () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.source = { username: 'jeffreestar', readOnly: true, autoConnect: true };
    plugin.api.tiktok = { isActive: () => true, currentUsername: 'jeffreestar' };

    const status = plugin.getLiveHostSourceStatus();

    expect(status).toEqual(expect.objectContaining({
      configured: true,
      username: 'jeffreestar',
      currentUsername: 'jeffreestar',
      connected: true,
      connectedToSource: true,
      autoConnect: true,
      readOnly: true
    }));
  });

  test('watchdog reconnects the read-only TikTok source when disconnected', async () => {
    const { plugin } = createPlugin();
    plugin.config.brain.liveHost.source = { username: 'jeffreestar', readOnly: true, autoConnect: true };
    plugin.api.tiktok = {
      isActive: jest.fn(() => false),
      currentUsername: '',
      connect: jest.fn().mockResolvedValue(true)
    };

    const result = await plugin.runLiveHostSourceWatchdog();

    expect(plugin.api.tiktok.connect).toHaveBeenCalledWith('jeffreestar');
    expect(result).toEqual(expect.objectContaining({ reconnected: true }));
    expect(plugin.getLiveHostSourceStatus()).toEqual(expect.objectContaining({
      reconnectAttempts: 1,
      lastReconnectError: null
    }));
  });

  test('preflight reports source connection separately from source username', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source = { username: 'jeffreestar', readOnly: true, autoConnect: false };
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.api.tiktok = { isActive: () => false, currentUsername: '' };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({ browser: { sinkSupported: true, audioUnlocked: true } });

    expect(preflight.ready).toBe(false);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'source.username', status: 'ok' }),
      expect.objectContaining({ id: 'source.connection', status: 'error' })
    ]));
  });

  test('movement probe records a successful Animaze action command for operator verification', async () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.animazeData = {
      ...plugin.animazeData,
      specialActions: [
        { animName: 'Idle', index: 2 },
        { animName: 'Hello', index: 0 }
      ]
    };
    plugin.triggerSpecialAction = jest.fn().mockResolvedValue(true);

    const result = await plugin.runLiveHostMovementTest();

    expect(result).toEqual(expect.objectContaining({
      success: true,
      actionType: 'specialAction',
      index: 0,
      name: 'Hello'
    }));
    expect(plugin.triggerSpecialAction).toHaveBeenCalledWith(0);
    expect(plugin.getLiveHostRuntimeStatus().diagnostics.lastMovementTest).toEqual(expect.objectContaining({ success: true, index: 0 }));
  });

  test('automatic idle motion picks a non-motionless idle animation', async () => {
    const { plugin } = createPlugin();
    plugin.config.enabled = true;
    plugin.config.brain.liveHost.idleMotion = {
      ...plugin.config.brain.liveHost.idleMotion,
      enabled: true,
      intervalMs: 15000,
      cooldownAfterActionMs: 0,
      actionType: 'idle',
      preferNames: ['Explaining', 'Walking'],
      avoidNames: ['Motionless']
    };
    plugin.isConnected = true;
    plugin.animazeData = {
      ...plugin.animazeData,
      idleAnims: [
        { animName: 'Motionless Idle', index: 1 },
        { animName: 'Explaining 1', index: 18 }
      ],
      specialActions: []
    };
    plugin.triggerIdle = jest.fn().mockResolvedValue(true);

    const result = await plugin.runLiveHostIdleMotionTick(100000);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      triggered: true,
      actionType: 'idle',
      actionValue: 18,
      name: 'Explaining 1'
    }));
    expect(plugin.triggerIdle).toHaveBeenCalledWith(18);
    expect(plugin.getLiveHostRuntimeStatus().diagnostics.lastIdleMotion).toEqual(expect.objectContaining({
      success: true,
      reason: 'triggered'
    }));
  });

  test('automatic idle motion falls back to special actions when no usable idle exists', async () => {
    const { plugin } = createPlugin();
    plugin.config.enabled = true;
    Object.assign(plugin.config.brain.liveHost.idleMotion, {
      enabled: true,
      cooldownAfterActionMs: 0,
      actionType: 'idle',
      preferNames: ['Dance', 'Hello'],
      avoidNames: ['Motionless'],
      fallbackToSpecialAction: true
    });
    plugin.isConnected = true;
    plugin.animazeData = {
      ...plugin.animazeData,
      idleAnims: [{ animName: 'Motionless Idle', index: 1 }],
      specialActions: [{ animName: 'Hello', index: 0 }]
    };
    plugin.triggerSpecialAction = jest.fn().mockResolvedValue(true);

    const result = await plugin.runLiveHostIdleMotionTick(100000);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      triggered: true,
      actionType: 'specialAction',
      actionValue: 0,
      name: 'Hello'
    }));
    expect(plugin.triggerSpecialAction).toHaveBeenCalledWith(0);
  });

  test('automatic idle motion rotates idle, special actions and emotes for visible liveliness', async () => {
    const { plugin } = createPlugin();
    plugin.config.enabled = true;
    Object.assign(plugin.config.brain.liveHost.idleMotion, {
      enabled: true,
      cooldownAfterActionMs: 0,
      actionType: 'idle',
      preferNames: ['Explaining', 'Hello', 'Heart'],
      avoidNames: ['Motionless'],
      fallbackToSpecialAction: true,
      includeEmotes: true,
      alternateActionTypes: true
    });
    plugin.isConnected = true;
    plugin.animazeData = {
      ...plugin.animazeData,
      idleAnims: [{ animName: 'Explaining 1', index: 18 }],
      specialActions: [{ animName: 'Hello', index: 0 }],
      emotes: [{ friendlyName: 'Hearts', itemName: 'Emote_Hearts' }]
    };
    plugin.triggerIdle = jest.fn().mockResolvedValue(true);
    plugin.triggerSpecialAction = jest.fn().mockResolvedValue(true);
    plugin.triggerEmote = jest.fn().mockResolvedValue(true);

    const first = await plugin.runLiveHostIdleMotionTick(100000);
    const second = await plugin.runLiveHostIdleMotionTick(120000);
    const third = await plugin.runLiveHostIdleMotionTick(140000);

    expect(first).toEqual(expect.objectContaining({ actionType: 'idle', actionValue: 18, success: true }));
    expect(second).toEqual(expect.objectContaining({ actionType: 'specialAction', actionValue: 0, success: true }));
    expect(third).toEqual(expect.objectContaining({ actionType: 'emote', actionValue: 'Emote_Hearts', success: true }));
    expect(plugin.triggerIdle).toHaveBeenCalledWith(18);
    expect(plugin.triggerSpecialAction).toHaveBeenCalledWith(0);
    expect(plugin.triggerEmote).toHaveBeenCalledWith('Emote_Hearts');
  });

  test('automatic idle motion can disable action type alternation', async () => {
    const { plugin } = createPlugin();
    plugin.config.enabled = true;
    Object.assign(plugin.config.brain.liveHost.idleMotion, {
      enabled: true,
      cooldownAfterActionMs: 0,
      actionType: 'idle',
      preferNames: ['Explaining', 'Hello'],
      fallbackToSpecialAction: true,
      alternateActionTypes: false
    });
    plugin.isConnected = true;
    plugin.animazeData = {
      ...plugin.animazeData,
      idleAnims: [{ animName: 'Explaining 1', index: 18 }],
      specialActions: [{ animName: 'Hello', index: 0 }]
    };
    plugin.triggerIdle = jest.fn().mockResolvedValue(true);
    plugin.triggerSpecialAction = jest.fn().mockResolvedValue(true);

    const first = await plugin.runLiveHostIdleMotionTick(100000);
    const second = await plugin.runLiveHostIdleMotionTick(120000);

    expect(first).toEqual(expect.objectContaining({ actionType: 'idle', actionValue: 18, success: true }));
    expect(second).toEqual(expect.objectContaining({ actionType: 'idle', actionValue: 18, success: true }));
    expect(plugin.triggerSpecialAction).not.toHaveBeenCalled();
  });

  test('automatic idle motion can prefer emotes directly', async () => {
    const { plugin } = createPlugin();
    plugin.config.enabled = true;
    Object.assign(plugin.config.brain.liveHost.idleMotion, {
      enabled: true,
      cooldownAfterActionMs: 0,
      actionType: 'emote',
      preferNames: ['Confetti'],
      includeEmotes: true
    });
    plugin.isConnected = true;
    plugin.animazeData = {
      ...plugin.animazeData,
      idleAnims: [{ animName: 'Explaining 1', index: 18 }],
      specialActions: [{ animName: 'Hello', index: 0 }],
      emotes: [{ friendlyName: 'Confetti', itemName: 'Emote_Confetti_Template' }]
    };
    plugin.triggerEmote = jest.fn().mockResolvedValue(true);

    const result = await plugin.runLiveHostIdleMotionTick(100000);

    expect(result).toEqual(expect.objectContaining({
      actionType: 'emote',
      actionValue: 'Emote_Confetti_Template',
      success: true
    }));
    expect(plugin.triggerEmote).toHaveBeenCalledWith('Emote_Confetti_Template');
  });

  test('automatic idle motion respects cooldown after recent avatar actions', async () => {
    const { plugin } = createPlugin();
    plugin.config.enabled = true;
    Object.assign(plugin.config.brain.liveHost.idleMotion, {
      enabled: true,
      cooldownAfterActionMs: 5000
    });
    plugin.isConnected = true;
    plugin.liveHostLastAvatarActionAt = 98000;
    plugin.triggerIdle = jest.fn();

    const result = await plugin.runLiveHostIdleMotionTick(100000);

    expect(result).toEqual(expect.objectContaining({
      success: false,
      triggered: false,
      reason: 'cooldown'
    }));
    expect(plugin.triggerIdle).not.toHaveBeenCalled();
    expect(plugin.getLiveHostRuntimeStatus().diagnostics.idleMotionSkipped).toBe(1);
  });

  test('movement probe fails loudly when Animaze is disconnected', async () => {
    const { plugin } = createPlugin();
    plugin.isConnected = false;

    const result = await plugin.runLiveHostMovementTest();

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: 'Animaze is not connected'
    }));
    expect(plugin.getLiveHostRuntimeStatus().diagnostics.lastMovementTest).toEqual(expect.objectContaining({ success: false }));
  });

  test('preflight reports the last Animaze movement probe state', async () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.animazeData = {
      ...plugin.animazeData,
      specialActions: [{ animName: 'Hello', index: 0 }]
    };
    plugin.triggerSpecialAction = jest.fn().mockResolvedValue(true);
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0 }) } }
      : null);

    await plugin.runLiveHostMovementTest();
    const preflight = plugin.evaluateLiveHostPreflight({ browser: { sinkSupported: true, audioUnlocked: true } });

    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'animaze.movementProbe', status: 'ok' })
    ]));
  });

  test('preflight warns when the last successful Animaze movement probe is stale', () => {
    const { plugin } = createPlugin();
    plugin.isConnected = true;
    plugin.config.brain.liveHost.provider = 'ollama';
    plugin.config.brain.liveHost.providers.ollama.apiKey = 'ollama-secret';
    plugin.config.brain.liveHost.source.username = 'jeffreestar';
    plugin.config.brain.liveHost.audio.outputDeviceId = 'cable-device';
    plugin.config.brain.liveHost.audio.outputDeviceLabel = 'CABLE Input';
    plugin.config.brain.liveHost.diagnostics.movementProbeStaleMs = 300000;
    plugin.ensureLiveHostRuntime();
    plugin.liveHostDiagnostics.lastMovementTest = {
      success: true,
      checkedAt: new Date(Date.now() - 600000).toISOString(),
      name: 'Wave',
      index: 1
    };
    plugin.api.tiktok = { isConnected: () => true };
    plugin.api.getPluginInstance = jest.fn(id => id === 'tts'
      ? { isInitialized: true, config: { defaultEngine: 'fishaudio' }, queueManager: { getInfo: () => ({ size: 0, maxSize: 100 }) } }
      : null);

    const preflight = plugin.evaluateLiveHostPreflight({
      browser: {
        sinkSupported: true,
        audioUnlocked: true,
        configuredOutputDeviceAvailable: true,
        playback: { status: 'ended', lastRouting: { routed: true } }
      }
    });

    expect(preflight.ready).toBe(true);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'animaze.movementProbe', status: 'warn' })
    ]));
  });

  test('reconnects after an established auto-connected Animaze socket closes', () => {
    const { plugin } = createPlugin();
    plugin.config.enabled = true;
    plugin.config.reconnectOnDisconnect = true;

    expect(plugin.shouldReconnectAfterAnimazeClose(true)).toBe(true);
    expect(plugin.shouldReconnectAfterAnimazeClose(false)).toBe(false);

    plugin.config.reconnectOnDisconnect = false;
    expect(plugin.shouldReconnectAfterAnimazeClose(true)).toBe(false);
  });

  test('treats zero max reconnect attempts as unlimited for unattended hosting', () => {
    const { plugin } = createPlugin();
    plugin.maxReconnectAttempts = 0;
    plugin.reconnectAttempts = 2;
    plugin.config.reconnectDelay = 5;
    const timer = { id: 'animaze-reconnect' };
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockReturnValue(timer);

    try {
      plugin.scheduleReconnect();
      expect(plugin.reconnectAttempts).toBe(3);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 15);
      expect(plugin.reconnectTimer).toBe(timer);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  test('continues the Animaze reconnect chain after a failed attempt', async () => {
    const { plugin } = createPlugin();
    plugin.maxReconnectAttempts = 3;
    plugin.reconnectAttempts = 0;
    plugin.config.reconnectDelay = 5;
    plugin.connect = jest.fn().mockResolvedValue(false);
    const callbacks = [];
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(callback => {
      callbacks.push(callback);
      return { id: callbacks.length };
    });

    try {
      plugin.scheduleReconnect();
      await callbacks[0]();
      expect(plugin.connect).toHaveBeenCalledTimes(1);
      expect(plugin.reconnectAttempts).toBe(2);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  test('starts the Animaze reconnect chain when the initial auto-connect fails', async () => {
    const api = {
      getSocketIO: () => ({ emit: jest.fn() }),
      getDatabase: () => ({}),
      getConfig: jest.fn(() => ({ enabled: true, autoConnect: true })),
      log: jest.fn(),
      emit: jest.fn()
    };
    const plugin = new AnimazingPalPlugin(api);
    plugin.registerRoutes = jest.fn();
    plugin.registerSocketEvents = jest.fn();
    plugin.registerTikTokEvents = jest.fn();
    plugin.startLiveHostSourceWatchdog = jest.fn();
    plugin.startLiveHostIdleMotion = jest.fn();
    plugin.safeEmitStatus = jest.fn();
    plugin.connect = jest.fn().mockResolvedValue(false);
    plugin.scheduleReconnect = jest.fn();

    await plugin.init();

    expect(plugin.brainEngine).toBeNull();
    expect(plugin.connect).toHaveBeenCalledTimes(1);
    expect(plugin.scheduleReconnect).toHaveBeenCalledTimes(1);
  });

  test('connects a foreign public LIVE as read-only event source without profile switching', async () => {
    const routes = [];
    const tiktok = { connect: jest.fn().mockResolvedValue(true) };
    const api = {
      getSocketIO: () => ({ emit: jest.fn() }), getDatabase: () => ({}), tiktok,
      registerRoute: (method, path, handler) => routes.push({ method: method.toLowerCase(), path, handler }),
      registerSocket: jest.fn(), registerTikTokEvent: jest.fn(), emit: jest.fn(), log: jest.fn(),
      getConfig: jest.fn(), setConfig: jest.fn(), getPlugin: jest.fn()
    };
    const plugin = new AnimazingPalPlugin(api);
    plugin.config = plugin.normalizeConfig(plugin.getDefaultConfig());
    plugin.config.brain.liveHost.source.watchdogIntervalMs = 12000;
    plugin.config.brain.liveHost.source.eventStaleMs = 45000;
    plugin.config.brain.liveHost.source.reconnectOnEventStale = true;
    plugin.brainEngine = { setStreamerId: jest.fn(), getStatistics: jest.fn(), getPersonalities: jest.fn() };
    plugin.registerRoutes();
    const route = routes.find(item => item.path === '/api/animazingpal/live-host/source/connect');
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await route.handler({ body: { username: '@wardalq4' } }, res);

    expect(tiktok.connect).toHaveBeenCalledWith('wardalq4');
    expect(plugin.config.brain.liveHost.source).toEqual(expect.objectContaining({
      username: 'wardalq4',
      readOnly: true,
      watchdogIntervalMs: 12000,
      eventStaleMs: 45000,
      reconnectOnEventStale: true
    }));
    expect(plugin.brainEngine.setStreamerId).toHaveBeenCalledWith('wardalq4');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, readOnly: true }));
    plugin.stopLiveHostSourceWatchdog();
  });
});
