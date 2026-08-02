const InteractiveStoryPlugin = require('../main');
const OpenAILLMService = require('../engines/openai-llm-service');

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
  test('Ollama validation only returns configured state and never logs key-derived metadata', async () => {
    const centralKey = 'ollama-secret-12345';
    const { plugin, routes } = createPlugin(
      { ollama_cloud_api_key: centralKey },
      { debugLogging: true, llmProvider: 'ollama', ollamaBaseUrl: 'https://api.ollama.com/v1' }
    );
    plugin._registerRoutes();
    const json = jest.fn();
    const testConnection = jest.spyOn(
      require('../engines/openai-llm-service').prototype,
      'testConnection'
    ).mockResolvedValue({ success: true, model: 'qwen3.5:cloud' });

    await routes['post:/api/interactive-story/validate-api-key']({ body: { provider: 'ollama' } }, { json });

    const response = json.mock.calls[0][0];
    expect(response).toEqual(expect.objectContaining({
      valid: true,
      configured: true,
      provider: 'Ollama',
      apiKeyConfigured: true
    }));
    expect(JSON.stringify(response)).not.toContain(centralKey);
    expect(JSON.stringify(response)).not.toContain('keyPrefix');
    expect(JSON.stringify(response)).not.toContain('keyLength');
    expect(JSON.stringify(plugin.debugLogs)).not.toContain(centralKey);
    expect(JSON.stringify(plugin.debugLogs)).not.toContain('keyPrefix');
    expect(JSON.stringify(plugin.debugLogs)).not.toContain('keyLength');

    testConnection.mockRestore();
  });

  test('Ollama connection failures redact key-derived metadata from the response and debug logs', async () => {
    const centralKey = 'ollama-secret-12345';
    const { plugin, routes } = createPlugin(
      { ollama_cloud_api_key: centralKey },
      { debugLogging: true, llmProvider: 'ollama', ollamaBaseUrl: 'https://api.ollama.com/v1' }
    );
    plugin._registerRoutes();
    const json = jest.fn();
    const testConnection = jest.spyOn(
      require('../engines/openai-llm-service').prototype,
      'testConnection'
    ).mockRejectedValue(new Error('connection refused'));

    await routes['post:/api/interactive-story/validate-api-key']({ body: { provider: 'ollama' } }, { json });

    const response = json.mock.calls[0][0];
    expect(response).toEqual(expect.objectContaining({
      valid: false,
      configured: true,
      provider: 'Ollama',
      apiKeyConfigured: true
    }));
    expect(JSON.stringify(response)).not.toContain(centralKey);
    expect(JSON.stringify(response)).not.toContain('keyPrefix');
    expect(JSON.stringify(response)).not.toContain('keyLength');
    expect(JSON.stringify(response)).not.toContain('hasWhitespace');
    expect(JSON.stringify(plugin.debugLogs)).not.toContain(centralKey);
    expect(JSON.stringify(plugin.debugLogs)).not.toContain('keyPrefix');
    expect(JSON.stringify(plugin.debugLogs)).not.toContain('keyLength');
    expect(JSON.stringify(plugin.debugLogs)).not.toContain('hasWhitespace');

    testConnection.mockRestore();
  });

  test('Ollama connection failures redact an echoed central key from upstream error payloads', async () => {
    const centralKey = 'ollama-secret-12345';
    const { plugin, routes } = createPlugin(
      { ollama_cloud_api_key: centralKey },
      { debugLogging: true, llmProvider: 'ollama', ollamaBaseUrl: 'https://api.ollama.com/v1' }
    );
    plugin._registerRoutes();
    const json = jest.fn();
    const upstreamError = new Error(`network rejected Bearer ${centralKey}`);
    upstreamError.response = {
      status: 503,
      data: { error: `upstream rejected Bearer ${centralKey}` }
    };
    const testConnection = jest.spyOn(
      require('../engines/openai-llm-service').prototype,
      'testConnection'
    ).mockRejectedValue(upstreamError);

    await routes['post:/api/interactive-story/validate-api-key']({ body: { provider: 'ollama' } }, { json });

    const response = json.mock.calls[0][0];
    expect(response.details.statusCode).toBe(503);
    expect(JSON.stringify(response)).not.toContain(centralKey);
    expect(JSON.stringify(plugin.debugLogs)).not.toContain(centralKey);

    testConnection.mockRestore();
  });

  test('normal config save retains the legacy Ollama key while cloud authentication uses central settings', () => {
    const { plugin, routes } = createPlugin(
      { ollama_cloud_api_key: 'central-ollama-secret' },
      { ollamaApiKey: 'legacy-plugin-secret', llmProvider: 'ollama' }
    );
    plugin._registerRoutes();
    const json = jest.fn();
    const saved = { llmProvider: 'ollama', ollamaBaseUrl: 'https://api.ollama.com/v1', ollamaModel: 'qwen3.5:cloud' };

    routes['post:/api/interactive-story/config']({ body: saved }, { json });

    expect(plugin.api.setConfig).toHaveBeenCalledWith('story-config', expect.objectContaining({
      ...saved,
      ollamaApiKey: 'legacy-plugin-secret'
    }));
    expect(plugin.llmService.apiKey).toBe('central-ollama-secret');
    expect(json).toHaveBeenCalledWith({ success: true });
  });

  test('config save preserves an existing OpenRouter key that the studio never posts back', () => {
    const openRouterKey = 'openrouter-existing-secret';
    const { plugin, routes } = createPlugin({}, {
      llmProvider: 'openrouter',
      openRouterApiKey: openRouterKey,
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
      openRouterModel: 'openrouter/free'
    });
    plugin._registerRoutes();
    const json = jest.fn();

    routes['post:/api/interactive-story/config']({
      body: {
        llmProvider: 'openrouter',
        openRouterBaseUrl: 'https://openrouter.ai/api/v1',
        openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free'
      }
    }, { json });

    const savedConfig = plugin.api.setConfig.mock.calls[0][1];
    expect(savedConfig.openRouterApiKey).toBe(openRouterKey);
    expect(JSON.stringify(json.mock.calls)).not.toContain(openRouterKey);
    expect(json).toHaveBeenCalledWith({ success: true });
  });
  test('config save discards a newly submitted legacy Ollama key', () => {
    const { plugin, routes } = createPlugin({}, { llmProvider: 'ollama' });
    plugin._registerRoutes();
    const json = jest.fn();

    routes['post:/api/interactive-story/config']({
      body: { llmProvider: 'ollama', ollamaApiKey: 'new-legacy-secret' }
    }, { json });

    const savedConfig = plugin.api.setConfig.mock.calls[0][1];
    expect(savedConfig).not.toHaveProperty('ollamaApiKey');
    expect(JSON.stringify(savedConfig)).not.toContain('new-legacy-secret');
    expect(json).toHaveBeenCalledWith({ success: true });
  });

  test('Ollama validation service does not log a raw connection error containing its API key', async () => {
    const centralKey = 'ollama-secret-12345';
    const logger = { info: jest.fn(), error: jest.fn() };
    const service = new OpenAILLMService(centralKey, logger, null, { provider: 'ollama' });
    service.client.chat.completions.create = jest.fn().mockRejectedValue(
      new Error(`upstream rejected Bearer ${centralKey}`)
    );

    const result = await service.testConnection();

    expect(result).toEqual(expect.objectContaining({
      success: false,
      message: 'Ollama API test failed'
    }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(centralKey);
    expect(logger.error).toHaveBeenCalledWith('Ollama API test failed');
  });

  test('OpenRouter validation retains its existing key metadata after provider resolution', async () => {
    const { plugin, routes } = createPlugin({}, {
      llmProvider: 'openrouter',
      openRouterApiKey: 'openrouter-secret',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
      openRouterModel: 'openrouter/free'
    });
    plugin._registerRoutes();
    const json = jest.fn();
    const testConnection = jest.spyOn(
      require('../engines/openai-llm-service').prototype,
      'testConnection'
    ).mockResolvedValue({ success: true, model: 'openrouter/free' });

    await routes['post:/api/interactive-story/validate-api-key']({ body: { provider: 'openrouter' } }, { json });

    expect(json.mock.calls[0][0].details).toEqual(expect.objectContaining({
      keyLength: 17,
      keyPrefix: 'openro...'
    }));
    testConnection.mockRestore();
  });
});
