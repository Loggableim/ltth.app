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
