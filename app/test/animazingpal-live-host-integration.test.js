const AnimazingPalPlugin = require('../plugins/animazingpal/main');
const { normalizeLiveHostConfig } = require('../plugins/animazingpal/brain/live-host-config');

function createPlugin() {
  const ttsPlugin = { speak: jest.fn().mockResolvedValue({ success: true, id: 'tts-1' }) };
  const plugin = Object.create(AnimazingPalPlugin.prototype);
  plugin.api = {
    getPluginInstance: jest.fn(id => id === 'tts' ? ttsPlugin : null),
    log: jest.fn(),
    emit: jest.fn()
  };
  plugin.config = plugin.getDefaultConfig();
  plugin.config.brain.liveHost = normalizeLiveHostConfig({
    enabled: true,
    tts: { voiceId: 'fish-host', emotion: 'happy', pitch: 2, volume: 73, speed: 1.1, priority: 91 }
  });
  return { plugin, ttsPlugin };
}

describe('AnimazingPal live host integration', () => {
  test('sends host responses through Fish.audio with configurable voice fine settings', async () => {
    const { plugin, ttsPlugin } = createPlugin();

    const result = await plugin.speakHostResponse('Willkommen zurück!', { username: 'viewer', eventType: 'follow' });

    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Willkommen zurück!', username: 'viewer', engine: 'fishaudio', voiceId: 'fish-host',
      source: 'animazingpal', teamLevel: 99, priority: 91, emotion: 'happy', pitch: 2, volume: 73, speed: 1.1
    }));
    expect(result.success).toBe(true);
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

  test('reconnects after an established auto-connected Animaze socket closes', () => {
    const { plugin } = createPlugin();
    plugin.config.enabled = true;
    plugin.config.reconnectOnDisconnect = true;

    expect(plugin.shouldReconnectAfterAnimazeClose(true)).toBe(true);
    expect(plugin.shouldReconnectAfterAnimazeClose(false)).toBe(false);

    plugin.config.reconnectOnDisconnect = false;
    expect(plugin.shouldReconnectAfterAnimazeClose(true)).toBe(false);
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
    plugin.brainEngine = { setStreamerId: jest.fn(), getStatistics: jest.fn(), getPersonalities: jest.fn() };
    plugin.registerRoutes();
    const route = routes.find(item => item.path === '/api/animazingpal/live-host/source/connect');
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await route.handler({ body: { username: '@wardalq4' } }, res);

    expect(tiktok.connect).toHaveBeenCalledWith('wardalq4');
    expect(plugin.config.brain.liveHost.source).toEqual(expect.objectContaining({ username: 'wardalq4', readOnly: true }));
    expect(plugin.brainEngine.setStreamerId).toHaveBeenCalledWith('wardalq4');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, readOnly: true }));
  });
});
