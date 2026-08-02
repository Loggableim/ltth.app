const InteractiveStoryPlugin = require('../main');

const createPlugin = ({ settings = {}, savedConfig = {} } = {}) => {
  const db = {
    prepare: jest.fn(() => ({
      get: jest.fn((key) => {
        const value = settings[key];
        return value === undefined ? undefined : { value };
      })
    }))
  };
  const api = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({ ...db, getSetting: (key) => settings[key] || null }),
    getPluginDataDir: () => '/tmp',
    getConfig: jest.fn(() => savedConfig),
    setConfig: jest.fn(),
    log: jest.fn()
  };
  return new InteractiveStoryPlugin(api);
};

describe('Interactive Story provider configuration', () => {
  test('prefers the dedicated Ollama Cloud setting over compatible fallback keys', () => {
    const plugin = createPlugin({
      settings: {
        ollama_cloud_api_key: ' cloud-key ',
        ollama_api_key: 'ollama-key',
        tts_ollama_api_key: 'tts-key'
      }
    });

    expect(plugin._getOllamaApiKey()).toBe('cloud-key');
  });

  test.each([
    [{ ollama_api_key: ' legacy-ollama-key ' }, 'legacy-ollama-key'],
    [{ tts_ollama_api_key: ' legacy-tts-key ' }, 'legacy-tts-key'],
    [{ ollama_cloud_api_key: '   ', ollama_api_key: 'fallback-key' }, 'fallback-key'],
    [{}, null]
  ])('uses the next configured Ollama key when earlier settings are empty', (settings, expected) => {
    expect(createPlugin({ settings })._getOllamaApiKey()).toBe(expected);
  });

  test('uses the cloud-first story defaults when no configuration has been saved', () => {
    const config = createPlugin()._loadConfig();

    expect(config).toEqual(expect.objectContaining({
      llmProvider: 'ollama',
      ollamaBaseUrl: 'https://api.ollama.com/v1',
      ollamaModel: 'qwen3.5:cloud',
      autoGenerateImages: false,
      ttsEngine: 'fishaudio',
      fishaudioModel: 's2.1-pro',
      narrationEmotionMode: 'auto',
      storyMode: 'classic',
      dndJoinKeyword: '!join',
      dndInactivityLimitRounds: 2,
      overlayLayoutVersion: 2
    }));
  });

  test('keeps saved provider, TTS engine, and image generation choices intact', () => {
    const config = createPlugin({
      savedConfig: {
        llmProvider: 'openrouter',
        ttsEngine: 'elevenlabs',
        autoGenerateImages: true
      }
    })._loadConfig();

    expect(config.llmProvider).toBe('openrouter');
    expect(config.ttsEngine).toBe('elevenlabs');
    expect(config.autoGenerateImages).toBe(true);
  });
});
