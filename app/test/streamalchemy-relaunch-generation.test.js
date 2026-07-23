const path = require('path');
const Database = require('better-sqlite3');
const StreamAlchemyDatabase = require('../plugins/streamalchemy/backend/database');
const PlaceholderProvider = require('../plugins/streamalchemy/backend/providers/placeholder-provider');
const LocalComfyProvider = require('../plugins/streamalchemy/backend/providers/local-comfy-provider');
const { ExistingServiceProvider } = require('../plugins/streamalchemy/backend/providers/remote-provider-adapters');
const GenerationService = require('../plugins/streamalchemy/backend/generation-service');
const ModelCatalog = require('../plugins/streamalchemy/backend/model-catalog');

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

  test('reports missing files when the selected preset checkpoint is absent', async () => {
    const catalog = new ModelCatalog();
    const provider = new LocalComfyProvider({
      config: {
        enabled: true,
        comfyUrl: 'http://127.0.0.1:8188',
        comfyRootDir: 'C:\\ComfyUI',
        selectedPresetId: 'sdxl_lightning_4step'
      },
      catalog,
      fsImpl: {
        existsSync: jest.fn().mockReturnValue(false)
      },
      fetchImpl: jest.fn().mockResolvedValue({ ok: true })
    });

    await expect(provider.checkStatus()).resolves.toEqual(expect.objectContaining({
      provider: 'localComfy',
      state: 'missing_files',
      model: 'sdxl_lightning_4step',
      missing: [path.join('models', 'checkpoints', 'sdxl_lightning_4step.safetensors')]
    }));
  });

  test('submits the selected workflow to ComfyUI and returns the generated view URL', async () => {
    const catalog = new ModelCatalog();
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompt_id: 'prompt-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'prompt-1': {
            outputs: {
              '9': {
                images: [
                  {
                    filename: 'item.png',
                    subfolder: 'streamalchemy',
                    type: 'output'
                  }
                ]
              }
            }
          }
        })
      });
    const provider = new LocalComfyProvider({
      config: {
        enabled: true,
        comfyUrl: 'http://127.0.0.1:8188',
        comfyRootDir: 'C:\\ComfyUI',
        selectedPresetId: 'sdxl_lightning_4step',
        width: 768,
        height: 768,
        steps: 4
      },
      catalog,
      fsImpl: {
        existsSync: jest.fn(target => target.endsWith('sdxl_lightning_4step.safetensors'))
      },
      fetchImpl
    });

    const result = await provider.generate({
      prompt: 'A glowing relic',
      negativePrompt: 'blurry'
    });

    expect(result).toEqual({
      imageUrl: 'http://127.0.0.1:8188/view?filename=item.png&subfolder=streamalchemy&type=output',
      provider: 'localComfy',
      model: 'sdxl_lightning_4step'
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8188/prompt', expect.objectContaining({
      method: 'POST'
    }));
    const payload = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(payload.prompt['3'].inputs.text).toBe('A glowing relic');
    expect(payload.prompt['4'].inputs.text).toBe('blurry');
  });

  test('waits long enough for ComfyUI history on real local runs', async () => {
    const catalog = new ModelCatalog();
    let historyAttempts = 0;
    const fetchImpl = jest.fn(async url => {
      if (url === 'http://127.0.0.1:8188/system_stats') {
        return { ok: true };
      }
      if (url === 'http://127.0.0.1:8188/prompt') {
        return {
          ok: true,
          json: async () => ({ prompt_id: 'prompt-slow' })
        };
      }
      if (url === 'http://127.0.0.1:8188/history/prompt-slow') {
        historyAttempts += 1;
        if (historyAttempts < 25) {
          return {
            ok: true,
            json: async () => ({})
          };
        }
        return {
          ok: true,
          json: async () => ({
            'prompt-slow': {
              outputs: {
                '9': {
                  images: [
                    {
                      filename: 'slow-item.png',
                      subfolder: 'streamalchemy',
                      type: 'output'
                    }
                  ]
                }
              }
            }
          })
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const provider = new LocalComfyProvider({
      config: {
        enabled: true,
        comfyUrl: 'http://127.0.0.1:8188',
        comfyRootDir: 'C:\\ComfyUI',
        selectedPresetId: 'sdxl_lightning_4step',
        width: 768,
        height: 768,
        steps: 4
      },
      catalog,
      fsImpl: {
        existsSync: jest.fn(target => target.endsWith('sdxl_lightning_4step.safetensors'))
      },
      fetchImpl,
      delayImpl: () => Promise.resolve()
    });

    await expect(provider.generate({
      prompt: 'A glowing relic',
      negativePrompt: 'blurry'
    })).resolves.toEqual({
      imageUrl: 'http://127.0.0.1:8188/view?filename=slow-item.png&subfolder=streamalchemy&type=output',
      provider: 'localComfy',
      model: 'sdxl_lightning_4step'
    });
    expect(historyAttempts).toBe(25);
  });

  test('uses the current managed runtime URL for every generation and holds an activity lease', async () => {
    const catalog = new ModelCatalog();
    let managedBaseUrl = 'http://127.0.0.1:8299';
    let promptNumber = 0;
    const releases = [];
    const fetchImpl = jest.fn(async url => {
      const value = String(url);
      if (value.endsWith('/system_stats')) return { ok: true };
      if (value.endsWith('/prompt')) {
        promptNumber += 1;
        return {
          ok: true,
          json: async () => ({ prompt_id: `prompt-${promptNumber}` })
        };
      }
      const match = value.match(/\/history\/(prompt-\d+)$/);
      if (match) {
        return {
          ok: true,
          json: async () => ({
            [match[1]]: {
              outputs: {
                '9': {
                  images: [{
                    filename: `${match[1]}.png`,
                    subfolder: 'streammonsters',
                    type: 'output'
                  }]
                }
              }
            }
          })
        };
      }
      throw new Error(`Unexpected URL: ${value}`);
    });
    const provider = new LocalComfyProvider({
      config: {
        enabled: true,
        comfyUrl: 'http://127.0.0.1:8188',
        comfyRootDir: 'C:\\ComfyUI',
        selectedPresetId: 'sdxl_lightning_4step'
      },
      getRuntimeBaseUrl: () => managedBaseUrl,
      acquireRuntimeActivity: () => {
        const release = jest.fn();
        releases.push(release);
        return release;
      },
      catalog,
      fsImpl: {
        existsSync: jest.fn(target => target.endsWith('sdxl_lightning_4step.safetensors'))
      },
      fetchImpl
    });

    const first = await provider.generate({ prompt: 'first', negativePrompt: 'none' });
    managedBaseUrl = 'http://127.0.0.1:8300';
    const second = await provider.generate({ prompt: 'second', negativePrompt: 'none' });

    expect(first.imageUrl).toContain('http://127.0.0.1:8299/view');
    expect(second.imageUrl).toContain('http://127.0.0.1:8300/view');
    expect(fetchImpl.mock.calls.map(call => call[0])).not.toContain(
      expect.stringContaining('http://127.0.0.1:8188')
    );
    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
      'http://127.0.0.1:8299/prompt',
      'http://127.0.0.1:8300/prompt'
    ]));
    expect(releases).toHaveLength(2);
    expect(releases.every(release => release.mock.calls.length === 1)).toBe(true);
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

  test('records placeholder output as failed instead of successful AI generation', async () => {
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

    await expect(service.generateImage({
      recipeKey: 'craft:v1:a:b:rpg:streamalchemy-v2',
      prompt: 'prompt',
      negativePrompt: 'negative',
      rarity: 'Common'
    })).rejects.toThrow('PLACEHOLDER_IS_NOT_GENERATED_ART');

    const jobs = store.getGenerationJobs();
    expect(jobs).toHaveLength(2);
    const placeholderJob = jobs.find(job => job.provider === 'placeholder');
    const localJob = jobs.find(job => job.provider === 'localComfy');
    expect(placeholderJob.status).toBe('failed');
    expect(placeholderJob.error).toContain('PLACEHOLDER_IS_NOT_GENERATED_ART');
    expect(localJob.status).toBe('failed');
    expect(localJob.error).toContain('GPU out of memory');
  });

  test('fails fast in strict local mode instead of silently falling back to remote providers', async () => {
    const { store, logger } = createStore();
    const failingLocal = {
      id: 'localComfy',
      checkStatus: jest.fn().mockResolvedValue({
        provider: 'localComfy',
        state: 'missing_files',
        model: 'sdxl_lightning_4step',
        missing: ['models/checkpoints/sdxl_lightning_4step.safetensors']
      }),
      generate: jest.fn()
    };
    const fallback = {
      id: 'placeholder',
      checkStatus: jest.fn().mockResolvedValue({ provider: 'placeholder', state: 'ready', model: 'deterministic-svg' }),
      generate: jest.fn()
    };

    const service = new GenerationService(store, logger, {
      providerOrder: ['localComfy', 'placeholder'],
      providers: { localComfy: failingLocal, placeholder: fallback },
      getConfig: () => ({
        localGeneration: {
          generationMode: 'local_strict'
        }
      })
    });

    await expect(service.generateImage({
      recipeKey: 'craft:v1:a:b:rpg:streamalchemy-v2',
      prompt: 'prompt',
      negativePrompt: 'negative',
      rarity: 'Common'
    })).rejects.toThrow('LOCAL_PROVIDER_NOT_READY');
    expect(fallback.generate).not.toHaveBeenCalled();
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
