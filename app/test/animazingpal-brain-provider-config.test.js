const GPTBrainService = require('../plugins/animazingpal/brain/gpt-brain-service');
const BrainEngine = require('../plugins/animazingpal/brain/brain-engine');

describe('AnimazingPal brain provider integration', () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  test('GPTBrainService delegates generation to the configured provider client', async () => {
    const providerClient = {
      generateResponse: jest.fn().mockResolvedValue({ content: 'Provider response', model: 'model-x', usage: { total: 1 } }),
      testConnection: jest.fn()
    };
    const service = new GPTBrainService({
      provider: 'ollama', model: 'model-x', apiKey: 'secret', maxResponseTokens: 222
    }, logger, { providerClient, minRequestInterval: 0 });

    const result = await service.generateResponse('System', 'User', [], { temperature: 0.4 });

    expect(providerClient.generateResponse).toHaveBeenCalledWith('System', 'User', [], expect.objectContaining({ temperature: 0.4 }));
    expect(result).toEqual(expect.objectContaining({ content: 'Provider response', model: 'model-x', cached: false }));
  });

  test('BrainEngine selects the active provider configuration without exposing other provider keys', () => {
    const engine = Object.create(BrainEngine.prototype);
    engine.logger = logger;
    engine.config = { activePersonality: null };
    engine.setActivePersonality = jest.fn();

    engine.configure({
      provider: 'ollama',
      providers: {
        ollama: { apiKey: 'ollama-key', baseUrl: 'https://ollama.com', model: 'nemotron-3-nano:30b-cloud' },
        openai: { apiKey: 'openai-key' }
      }
    });

    expect(engine.gptBrain).toBeInstanceOf(GPTBrainService);
    expect(engine.gptBrain.providerConfig).toEqual(expect.objectContaining({
      provider: 'ollama', apiKey: 'ollama-key', model: 'nemotron-3-nano:30b-cloud'
    }));
    expect(engine.gptBrain.providerConfig.apiKey).not.toBe('openai-key');
  });
});
