const Database = require('better-sqlite3');
const StreamAlchemyDatabase = require('../plugins/streamalchemy/backend/database');
const PlaceholderProvider = require('../plugins/streamalchemy/backend/providers/placeholder-provider');
const LocalComfyProvider = require('../plugins/streamalchemy/backend/providers/local-comfy-provider');
const { ExistingServiceProvider } = require('../plugins/streamalchemy/backend/providers/remote-provider-adapters');
const GenerationService = require('../plugins/streamalchemy/backend/generation-service');

function createStore() {
  const sqlite = new Database(':memory:');
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const store = new StreamAlchemyDatabase(sqlite, logger);
  store.initialize();
  return { store, logger };
}

describe('PlaceholderProvider', () => {
  test('returns deterministic data URL and metadata', async () => {
    const provider = new PlaceholderProvider();
    const first = await provider.generate({ prompt: 'Rose Heart', rarity: 'Common' });
    const second = await provider.generate({ prompt: 'Rose Heart', rarity: 'Common' });

    expect(first.provider).toBe('placeholder');
    expect(first.model).toBe('deterministic-svg');
    expect(first.imageUrl).toBe(second.imageUrl);
    expect(first.imageUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

describe('LocalComfyProvider', () => {
  test('reports disabled when local generation is disabled', async () => {
    const provider = new LocalComfyProvider({
      config: { enabled: false, comfyUrl: 'http://127.0.0.1:8188' },
      fetchImpl: jest.fn()
    });

    await expect(provider.checkStatus()).resolves.toEqual({
      provider: 'localComfy',
      state: 'disabled',
      model: null,
      detail: 'Local generation is disabled'
    });
  });

  test('reports unreachable when ComfyUI request fails', async () => {
    const provider = new LocalComfyProvider({
      config: { enabled: true, comfyUrl: 'http://127.0.0.1:8188', model: 'flux' },
      fetchImpl: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'))
    });

    const status = await provider.checkStatus();
    expect(status.state).toBe('unreachable');
    expect(status.lastError).toContain('ECONNREFUSED');
  });
});

describe('GenerationService', () => {
  test('uses first ready provider and records successful job', async () => {
    const { store, logger } = createStore();
    const localProvider = {
      id: 'localComfy',
      checkStatus: jest.fn().mockResolvedValue({ state: 'ready' }),
      generate: jest.fn().mockResolvedValue({
        imageUrl: 'http://localhost/generated.png',
        provider: 'localComfy',
        model: 'flux'
      })
    };
    const fallback = new PlaceholderProvider();
    const service = new GenerationService(store, logger, {
      providerOrder: ['localComfy', 'placeholder'],
      providers: { localComfy: localProvider, placeholder: fallback }
    });

    const result = await service.generateImage({
      recipeKey: 'craft:v1:a:b:rpg:streamalchemy-v2',
      prompt: 'prompt',
      negativePrompt: 'negative',
      rarity: 'Common'
    });

    expect(result.provider).toBe('localComfy');
    expect(localProvider.generate).toHaveBeenCalledTimes(1);
    const jobs = store.getGenerationJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('succeeded');
    expect(jobs[0].provider).toBe('localComfy');
  });

  test('falls back to placeholder and records failed provider attempt', async () => {
    const { store, logger } = createStore();
    const failingProvider = {
      id: 'localComfy',
      checkStatus: jest.fn().mockResolvedValue({ state: 'ready' }),
      generate: jest.fn().mockRejectedValue(new Error('GPU out of memory'))
    };
    const service = new GenerationService(store, logger, {
      providerOrder: ['localComfy', 'placeholder'],
      providers: {
        localComfy: failingProvider,
        placeholder: new PlaceholderProvider()
      }
    });

    const result = await service.generateImage({
      recipeKey: 'craft:v1:a:b:rpg:streamalchemy-v2',
      prompt: 'prompt',
      negativePrompt: 'negative',
      rarity: 'Common'
    });

    expect(result.provider).toBe('placeholder');
    const jobs = store.getGenerationJobs();
    expect(jobs).toHaveLength(2);
    const placeholderJob = jobs.find(job => job.provider === 'placeholder');
    const localJob = jobs.find(job => job.provider === 'localComfy');
    expect(placeholderJob.status).toBe('succeeded');
    expect(localJob.status).toBe('failed');
    expect(localJob.error).toContain('GPU out of memory');
  });
});

describe('ExistingServiceProvider', () => {
  test('reports missing API key without invoking the generator', async () => {
    const generate = jest.fn();
    const provider = new ExistingServiceProvider({
      id: 'openai',
      model: 'dall-e-3',
      hasApiKey: () => false,
      generate
    });

    await expect(provider.checkStatus()).resolves.toEqual({
      provider: 'openai',
      state: 'missing_api_key',
      model: 'dall-e-3'
    });
    expect(generate).not.toHaveBeenCalled();
  });

  test('wraps existing service image URL results in provider metadata', async () => {
    const generate = jest.fn().mockResolvedValue('https://cdn.example/image.png');
    const provider = new ExistingServiceProvider({
      id: 'siliconflow',
      model: 'black-forest-labs/FLUX.1-schnell',
      hasApiKey: () => true,
      generate
    });

    await expect(provider.checkStatus()).resolves.toEqual({
      provider: 'siliconflow',
      state: 'ready',
      model: 'black-forest-labs/FLUX.1-schnell'
    });
    await expect(provider.generate({ prompt: 'artifact' })).resolves.toEqual({
      imageUrl: 'https://cdn.example/image.png',
      provider: 'siliconflow',
      model: 'black-forest-labs/FLUX.1-schnell'
    });
    expect(generate).toHaveBeenCalledWith({ prompt: 'artifact' });
  });
});
