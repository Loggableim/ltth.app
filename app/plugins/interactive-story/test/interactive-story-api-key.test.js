const InteractiveStoryPlugin = require('../main');

const createPlugin = (settings = {}, savedConfig = {}) => {
  const db = {
    prepare: jest.fn(() => ({
      get: jest.fn((key) => {
        const value = settings[key];
        return value ? { value } : undefined;
      })
    }))
  };
  const routes = {};
  const api = {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    },
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({ ...db, getSetting: (key) => settings[key] || null }),
    getPluginDataDir: () => '/tmp',
    ensurePluginDataDir: jest.fn(),
    log: jest.fn(),
    getConfig: jest.fn(() => savedConfig),
    setConfig: jest.fn(),
    registerRoute: jest.fn((method, path, handler) => {
      routes[`${method}:${path}`] = handler;
    }),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn()
  };
  const plugin = new InteractiveStoryPlugin(api);
  return { plugin, routes, db };
};

describe('Interactive Story Plugin - API keys and routes', () => {
  test('prefers centralized SiliconFlow API key with legacy fallbacks', () => {
    const { plugin } = createPlugin({
      siliconflow_api_key: ' central-key ',
      tts_fishspeech_api_key: 'legacy-key',
      streamalchemy_siliconflow_api_key: 'older-key'
    });

    expect(plugin._getSiliconFlowApiKey()).toBe('central-key');
  });

  test('falls back to legacy SiliconFlow keys when central key is missing', () => {
    const { plugin } = createPlugin({
      tts_fishspeech_api_key: ' legacy-key '
    });

    expect(plugin._getSiliconFlowApiKey()).toBe('legacy-key');
  });

  test('start endpoint returns clear error when LLM service is not configured', async () => {
    const { plugin, routes } = createPlugin();

    // Ensure the story engine check passes but the LLM service guard triggers
    plugin.storyEngine = {};
    plugin._registerRoutes();

    const startHandler = routes['post:/api/interactive-story/start'];
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();

    await startHandler({ body: { theme: 'fantasy' } }, { status, json });

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('API key')
    }));
  });
  test('configuration route masks a legacy Ollama plugin key and exposes central key state only', () => {
    const { plugin, routes } = createPlugin(
      { ollama_cloud_api_key: 'central-ollama-key' },
      { ollamaApiKey: 'legacy-plugin-secret' }
    );
    plugin._registerRoutes();
    const json = jest.fn();

    routes['get:/api/interactive-story/config']({}, { json });

    const response = json.mock.calls[0][0];
    expect(JSON.stringify(response)).not.toContain('central-ollama-key');
    expect(JSON.stringify(response)).not.toContain('legacy-plugin-secret');
    expect(response).toEqual(expect.objectContaining({
      apiKeyConfigured: true,
      ollamaApiKey: '***configured***'
    }));
  });

  test('cloud Ollama validation reports a missing central key without attempting a request', async () => {
    const { plugin, routes } = createPlugin({}, {
      llmProvider: 'ollama',
      ollamaBaseUrl: 'https://api.ollama.com/v1'
    });
    plugin._registerRoutes();
    const json = jest.fn();

    await routes['post:/api/interactive-story/validate-api-key']({ body: { provider: 'ollama' } }, { json });

    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      valid: false,
      configured: false,
      provider: 'Ollama',
      apiKeyConfigured: false,
      error: 'No Ollama API key configured'
    }));
  });
});
