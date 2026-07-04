const {
  buildLiveHostDefaults,
  normalizeLiveHostConfig,
  sanitizeLiveHostConfig,
  applyLiveHostPreset,
  mergeLiveHostSecrets
} = require('../plugins/animazingpal/brain/live-host-config');

describe('AnimazingPal live host configuration', () => {
  test('live-host defaults are production-ready except for installation-specific values', () => {
    const defaults = buildLiveHostDefaults();

    expect(defaults).toEqual(expect.objectContaining({
      enabled: true,
      operatingMode: 'standalone',
      provider: 'ollama',
      source: expect.objectContaining({
        username: '', autoConnect: true, watchdogIntervalMs: 30000,
        eventStaleMs: 300000, reconnectOnEventStale: true
      }),
      response: expect.objectContaining({
        decisionMode: 'auto', minDecisionScore: 0.55,
        maxResponsesPerMinute: 18, chatProbability: 0.45, maxSentences: 2
      }),
      tts: expect.objectContaining({
        enabled: true, engine: 'fishaudio', voiceId: '', streaming: true,
        volume: 80, fallbackBehavior: 'silent'
      }),
      audio: expect.objectContaining({
        outputDeviceId: '', monitoringEnabled: false, missingDeviceBehavior: 'mute'
      }),
      animaze: expect.objectContaining({
        audioOutputDeviceId: '',
        audioOutputDeviceLabel: ''
      }),
      viewerMemory: expect.objectContaining({ streamerId: '', enabled: true, writeMemories: true })
    }));
    expect(defaults.providers.ollama).toEqual(expect.objectContaining({
      baseUrl: 'https://ollama.com', model: 'nemotron-3-nano:30b-cloud',
      timeoutMs: 30000, maxRetries: 2, retryBackoffMs: 1000, thinking: true
    }));
  });

  test('normalizes the explicit standalone or sidekick operating mode', () => {
    expect(normalizeLiveHostConfig({ operatingMode: 'sidekick' }).operatingMode).toBe('sidekick');
    expect(normalizeLiveHostConfig({ operatingMode: 'invalid' }).operatingMode).toBe('standalone');
  });

  test('defines explicit safe defaults for every TikTok event', () => {
    const events = buildLiveHostDefaults().events;
    const expected = {
      chat: [true, true, true, 40, 3000, 0],
      gift: [true, true, true, 100, 1000, 0],
      follow: [true, true, true, 70, 3000, 0],
      share: [true, true, true, 65, 3000, 0],
      like: [true, false, true, 20, 5000, 10],
      subscribe: [true, true, true, 90, 3000, 0],
      join: [false, false, false, 10, 5000, 0]
    };

    for (const [type, values] of Object.entries(expected)) {
      expect(events[type]).toEqual(expect.objectContaining({
        enabled: values[0],
        brainEnabled: values[1],
        avatarActionEnabled: values[2],
        priority: values[3],
        cooldownMs: values[4],
        minLikes: values[5],
        templateEnabled: false,
        voiceId: ''
      }));
    }
  });

  test('safe-live preset supplies editable defaults for every live subsystem', () => {
    const configured = applyLiveHostPreset(buildLiveHostDefaults(), 'safe-live');

    expect(configured.response.maxResponsesPerMinute).toBe(18);
    expect(configured.response.decisionMode).toBe('auto');
    expect(configured.response.chatProbability).toBe(0.45);
    expect(configured.response.maxSentences).toBe(2);
    expect(configured.response.queueWarnRatio).toBe(0.8);
    expect(configured.tts.probeStaleMs).toBe(300000);
    expect(configured.diagnostics.browserHeartbeatStaleMs).toBe(30000);
    expect(configured.diagnostics.movementProbeStaleMs).toBe(300000);
    expect(configured.events.gift.brainEnabled).toBe(true);
    expect(configured.events.like.brainEnabled).toBe(false);
    expect(configured.providers.ollama.timeoutMs).toBe(30000);
    expect(configured.providers.ollama.maxRetries).toBe(2);
    expect(Object.isFrozen(configured)).toBe(false);
  });

  test('normalization preserves every explicit existing value over production defaults', () => {
    const configured = normalizeLiveHostConfig({
      enabled: false,
      provider: 'gemini',
      source: { autoConnect: false, username: 'saved-stream' },
      response: { maxResponsesPerMinute: 17 },
      audio: { outputDeviceId: 'saved-cable' },
      animaze: { audioOutputDeviceId: 'saved-animaze', audioOutputDeviceLabel: 'Saved Animaze' },
      tts: { voiceId: 'saved-fish' },
      viewerMemory: { streamerId: 'saved-profile' }
    });

    expect(configured).toEqual(expect.objectContaining({ enabled: false, provider: 'gemini' }));
    expect(configured.source).toEqual(expect.objectContaining({ autoConnect: false, username: 'saved-stream' }));
    expect(configured.response.maxResponsesPerMinute).toBe(17);
    expect(configured.audio.outputDeviceId).toBe('saved-cable');
    expect(configured.animaze).toEqual(expect.objectContaining({
      audioOutputDeviceId: 'saved-animaze',
      audioOutputDeviceLabel: 'Saved Animaze'
    }));
    expect(configured.tts.voiceId).toBe('saved-fish');
    expect(configured.viewerMemory.streamerId).toBe('saved-profile');
  });

  test('normalization migrates legacy browser output into the dedicated animaze output when no animaze block exists', () => {
    const configured = normalizeLiveHostConfig({
      audio: { outputDeviceId: 'legacy-cable', outputDeviceLabel: 'Legacy Cable' }
    });

    expect(configured.animaze).toEqual(expect.objectContaining({
      audioOutputDeviceId: 'legacy-cable',
      audioOutputDeviceLabel: 'Legacy Cable'
    }));
  });

  test('production preset restores canonical values without clearing installation setup', () => {
    const current = normalizeLiveHostConfig({
      provider: 'gemini',
      providers: { ollama: { apiKey: 'saved-secret' } },
      response: { maxResponsesPerMinute: 99 },
      events: { subscribe: { enabled: false, templateEnabled: true } },
      tts: { enabled: false, voiceId: 'saved-fish', fallbackBehavior: 'error' },
      audio: { outputDeviceId: 'saved-cable', outputDeviceLabel: 'CABLE Input' },
      animaze: { audioOutputDeviceId: 'saved-animaze', audioOutputDeviceLabel: 'Animaze CABLE Input' },
      source: { username: 'saved-stream' },
      privacy: { includeContactFields: true },
      diagnostics: { includePromptBodies: true }
    });

    const configured = applyLiveHostPreset(current, 'production-24-7');

    expect(configured.providers.ollama.apiKey).toBe('saved-secret');
    expect(configured.tts.voiceId).toBe('saved-fish');
    expect(configured.audio).toEqual(expect.objectContaining({
      outputDeviceId: 'saved-cable', outputDeviceLabel: 'CABLE Input'
    }));
    expect(configured.animaze).toEqual(expect.objectContaining({
      audioOutputDeviceId: 'saved-animaze',
      audioOutputDeviceLabel: 'Animaze CABLE Input'
    }));
    expect(configured.source.username).toBe('saved-stream');
    expect(configured).toEqual(expect.objectContaining({ enabled: true, provider: 'ollama' }));
    expect(configured.response.maxResponsesPerMinute).toBe(18);
    expect(configured.events.subscribe).toEqual(expect.objectContaining({ enabled: true, templateEnabled: false }));
    expect(configured.tts).toEqual(expect.objectContaining({ enabled: true, fallbackBehavior: 'silent' }));
    expect(configured.privacy.includeContactFields).toBe(false);
    expect(configured.diagnostics.includePromptBodies).toBe(false);
  });

  test('normalizes automatic host decision settings', () => {
    const configured = normalizeLiveHostConfig({
      response: { decisionMode: 'bad-mode', minDecisionScore: 99, silenceWarnAfterEvents: 9999, queueWarnRatio: 9 }
    });

    expect(configured.response.decisionMode).toBe('auto');
    expect(configured.response.minDecisionScore).toBe(1);
    expect(configured.response.silenceWarnAfterEvents).toBe(1000);
    expect(configured.response.queueWarnRatio).toBe(1);
  });

  test('normalizes boolean and enum settings instead of accepting truthy strings', () => {
    const configured = normalizeLiveHostConfig({
      enabled: 'false',
      source: { autoConnect: 'false', reconnectOnEventStale: 'false' },
      response: { cacheEnabled: 'false' },
      events: { chat: {
        enabled: 'false', brainEnabled: 'false', templateEnabled: 'true', avatarActionEnabled: 'false'
      } },
      tts: { enabled: 'false', engine: 'other', streaming: 'false', duckOtherAudio: 'false', fallbackBehavior: 'bad' },
      audio: { monitoringEnabled: 'true' },
      viewerMemory: { enabled: 'false', writeMemories: 'false', includeInsights: 'false', includeGiftHistory: 'false' },
      privacy: { includeNotes: 'true', includeBirthday: 'true', includeContactFields: 'true', redactPromptPayloads: 'false' },
      avatarSwitch: { enabled: 'false', persistUntilNextSwitch: 'false', matchGiftNameFallback: 'false', waitForRepeatEnd: 'false' },
      idleMotion: { enabled: 'false', includeEmotes: 'false', alternateActionTypes: 'false' },
      diagnostics: { verboseLogging: 'true', emitEvents: 'false', includePromptBodies: 'true' }
    });

    expect(configured.enabled).toBe(false);
    expect(configured.source).toEqual(expect.objectContaining({ autoConnect: false, reconnectOnEventStale: false }));
    expect(configured.response.cacheEnabled).toBe(false);
    expect(configured.events.chat).toEqual(expect.objectContaining({
      enabled: false, brainEnabled: false, templateEnabled: true, avatarActionEnabled: false
    }));
    expect(configured.tts).toEqual(expect.objectContaining({
      enabled: false, engine: 'fishaudio', streaming: false, duckOtherAudio: false, fallbackBehavior: 'silent'
    }));
    expect(configured.audio.monitoringEnabled).toBe(true);
    expect(configured.viewerMemory).toEqual(expect.objectContaining({
      enabled: false, writeMemories: false, includeInsights: false, includeGiftHistory: false
    }));
    expect(configured.privacy).toEqual({
      includeNotes: true, includeBirthday: true, includeContactFields: true, redactPromptPayloads: false
    });
    expect(configured.avatarSwitch).toEqual(expect.objectContaining({
      enabled: false, persistUntilNextSwitch: false, matchGiftNameFallback: false, waitForRepeatEnd: false
    }));
    expect(configured.idleMotion).toEqual(expect.objectContaining({ enabled: false, includeEmotes: false, alternateActionTypes: false }));
    expect(configured.diagnostics).toEqual(expect.objectContaining({ verboseLogging: true, emitEvents: false, includePromptBodies: true }));
  });

  test('normalizes numeric fine settings to documented safety bounds', () => {
    const configured = normalizeLiveHostConfig({
      response: { maxResponsesPerMinute: 999, chatProbability: -2, maxSentences: 0 },
      providers: { ollama: { timeoutMs: 1, maxRetries: 99, temperature: 8 } },
      tts: { volume: 999, speed: 0, pitch: -99, probeStaleMs: 999999999 }
    });

    expect(configured.response.maxResponsesPerMinute).toBe(120);
    expect(configured.response.chatProbability).toBe(0.45);
    expect(configured.response.maxSentences).toBe(1);
    expect(configured.providers.ollama.timeoutMs).toBe(1000);
    expect(configured.providers.ollama.maxRetries).toBe(10);
    expect(configured.providers.ollama.temperature).toBe(2);
    expect(configured.tts.volume).toBe(100);
    expect(configured.tts.speed).toBe(0.5);
    expect(configured.tts.pitch).toBe(-12);
    expect(configured.tts.probeStaleMs).toBe(86400000);
  });

  test('migrates the legacy OpenAI brain fields', () => {
    const configured = normalizeLiveHostConfig({}, {
      openaiApiKey: 'legacy-secret', model: 'gpt-4o-mini', maxResponsesPerMinute: 7, chatResponseProbability: 0.25
    });

    expect(configured.provider).toBe('openai');
    expect(configured.providers.openai.apiKey).toBe('legacy-secret');
    expect(configured.providers.openai.model).toBe('gpt-4o-mini');
    expect(configured.response.maxResponsesPerMinute).toBe(7);
    expect(configured.response.chatProbability).toBe(0.25);
  });

  test('redacts all provider keys while preserving configured flags', () => {
    const safe = sanitizeLiveHostConfig(normalizeLiveHostConfig({
      providers: {
        openai: { apiKey: 'one' }, gemini: { apiKey: 'two' },
        openrouter: { apiKey: 'three' }, ollama: { apiKey: 'four' }
      }
    }));

    for (const provider of ['openai', 'gemini', 'openrouter', 'ollama']) {
      expect(safe.providers[provider].apiKey).toBeUndefined();
      expect(safe.providers[provider].apiKeyConfigured).toBe(true);
    }
  });

  test('preserves blank provider keys and only clears them explicitly', () => {
    const current = normalizeLiveHostConfig({ providers: { ollama: { apiKey: 'kept-secret' } } });
    const preserved = mergeLiveHostSecrets(current, { providers: { ollama: { apiKey: '' } } });
    const cleared = mergeLiveHostSecrets(current, { providers: { ollama: { clearApiKey: true } } });

    expect(preserved.providers.ollama.apiKey).toBe('kept-secret');
    expect(cleared.providers.ollama.apiKey).toBe('');
  });

  test('normalizes avatar bundle fine settings and removes malformed entries', () => {
    const configured = normalizeLiveHostConfig({ avatarBundles: [
      { id: ' rose host ', avatarName: 'Rose', personalityId: 'sarcastic_host', giftIds: [5655, '5655'], pitch: 99, volume: -1, speed: 9 },
      { avatarName: 'Missing id' }
    ] });

    expect(configured.avatarBundles).toEqual([expect.objectContaining({
      id: 'rose-host', giftIds: ['5655'], pitch: 12, volume: 0, speed: 2
    })]);
  });

  test('keeps foreign TikTok sources read-only', () => {
    const configured = normalizeLiveHostConfig({ source: { username: '@wardalq4', readOnly: false, autoConnect: true } });
    expect(configured.source).toEqual(expect.objectContaining({ username: 'wardalq4', readOnly: true, autoConnect: true }));
  });

  test('normalizes live source event-staleness watchdog settings', () => {
    const configured = normalizeLiveHostConfig({
      source: { watchdogIntervalMs: 1, eventStaleMs: 1, reconnectOnEventStale: true }
    });

    expect(configured.source.watchdogIntervalMs).toBe(5000);
    expect(configured.source.eventStaleMs).toBe(30000);
    expect(configured.source.reconnectOnEventStale).toBe(true);
  });

  test('normalizes stale diagnostics settings', () => {
    const configured = normalizeLiveHostConfig({
      diagnostics: { browserHeartbeatStaleMs: 1, movementProbeStaleMs: 999999999 }
    });

    expect(configured.diagnostics.browserHeartbeatStaleMs).toBe(5000);
    expect(configured.diagnostics.movementProbeStaleMs).toBe(86400000);
  });
});
