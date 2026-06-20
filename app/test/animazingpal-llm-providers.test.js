const { createLLMProvider } = require('../plugins/animazingpal/brain/llm-providers');

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('AnimazingPal LLM providers', () => {
  test.each([
    ['openai', 'https://api.openai.com/v1/chat/completions'],
    ['openrouter', 'https://openrouter.ai/api/v1/chat/completions']
  ])('maps %s settings to the OpenAI-compatible request', async (provider, expectedUrl) => {
    const request = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'Hallo!' } }],
      usage: { total_tokens: 9 },
      model: 'configured-model'
    });
    const client = createLLMProvider({
      provider,
      model: 'configured-model',
      apiKey: 'secret',
      temperature: 0.42,
      maxResponseTokens: 123,
      presencePenalty: 0.2,
      frequencyPenalty: 0.3
    }, logger, request);

    const result = await client.generateResponse('System', 'Nachricht', []);

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: expectedUrl,
      headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      body: expect.objectContaining({
        model: 'configured-model',
        temperature: 0.42,
        max_tokens: 123,
        presence_penalty: 0.2,
        frequency_penalty: 0.3
      })
    }));
    expect(result.content).toBe('Hallo!');
  });

  test('maps Gemini settings to generateContent without putting the key in the URL', async () => {
    const request = jest.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'Gemini Antwort' }] } }],
      usageMetadata: { totalTokenCount: 12 }
    });
    const client = createLLMProvider({
      provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'gemini-secret', temperature: 0.5
    }, logger, request);

    const result = await client.generateResponse('System', 'Nachricht', []);

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-secret' })
    }));
    expect(request.mock.calls[0][0].url).not.toContain('gemini-secret');
    expect(result.content).toBe('Gemini Antwort');
  });

  test('maps Ollama Cloud settings to native chat including thinking control', async () => {
    const request = jest.fn().mockResolvedValue({
      message: { content: 'Ollama Antwort' },
      prompt_eval_count: 8,
      eval_count: 5,
      model: 'nemotron-3-nano:30b-cloud'
    });
    const client = createLLMProvider({
      provider: 'ollama',
      baseUrl: 'https://ollama.com',
      model: 'nemotron-3-nano:30b-cloud',
      apiKey: 'ollama-secret',
      thinking: false
    }, logger, request);

    const result = await client.generateResponse('System', 'Nachricht', []);

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://ollama.com/api/chat',
      headers: expect.objectContaining({ Authorization: 'Bearer ollama-secret' }),
      body: expect.objectContaining({
        model: 'nemotron-3-nano:30b-cloud',
        stream: false,
        think: false
      })
    }));
    expect(result.content).toBe('Ollama Antwort');
  });

  test('disables thinking only for the short Ollama connection probe', async () => {
    const request = jest.fn().mockResolvedValue({
      message: { content: 'Hallo!' }, model: 'nemotron-3-nano:30b-cloud'
    });
    const client = createLLMProvider({
      provider: 'ollama', baseUrl: 'https://ollama.com', model: 'nemotron-3-nano:30b-cloud',
      apiKey: 'ollama-secret', thinking: true
    }, logger, request);

    const result = await client.testConnection();

    expect(result.success).toBe(true);
    expect(request.mock.calls[0][0].body.think).toBe(false);
    expect(client.config.thinking).toBe(true);
  });
});
