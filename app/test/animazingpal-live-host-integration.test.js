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
      source: 'animazingpal', priority: 91, emotion: 'happy', pitch: 2, volume: 73, speed: 1.1
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
});
