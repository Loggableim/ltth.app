jest.mock('axios');

const axios = require('axios');
const Translator = require('../plugins/stt-ticker/backend/translator');
const { ConfigManager } = require('../plugins/stt-ticker/backend/config');

function createTranslator() {
  return new Translator({
    translation: {
      enabled: true,
      apiKey: 'ollama-secret',
      model: 'deepseek-v4-flash',
      targetLanguage: 'en',
      sourceLanguage: 'de'
    }
  }, {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  });
}

describe('STT Ticker native Ollama Cloud API', () => {
  beforeEach(() => {
    axios.post.mockReset();
    axios.get.mockReset();
  });

  test('translates through the native Ollama chat endpoint', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        message: {
          content: 'Hello world'
        }
      }
    });
    const translator = createTranslator();

    const result = await translator.translate('Hallo Welt', { sourceLanguage: 'de' });

    expect(result).toMatchObject({ translated: true, text: 'Hello world' });
    expect(axios.post).toHaveBeenCalledWith(
      'https://ollama.com/api/chat',
      expect.objectContaining({
        model: 'deepseek-v4-flash',
        stream: false,
        think: false,
        options: { temperature: 0.1 }
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer ollama-secret' })
      })
    );
  });

  test('loads model names from the native Ollama tags endpoint', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        models: [
          { name: 'deepseek-v4-flash' },
          { name: 'gpt-oss:20b' }
        ]
      }
    });
    const translator = createTranslator();

    await expect(translator.fetchModels()).resolves.toEqual([
      { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' },
      { id: 'gpt-oss:20b', name: 'gpt-oss:20b' }
    ]);
    expect(axios.get).toHaveBeenCalledWith(
      'https://ollama.com/api/tags',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer ollama-secret' })
      })
    );
  });

  test('batches translations for differently routed source segments into one Cloud request', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        message: {
          content: JSON.stringify({
            'segment-1': { de: 'Hallo zusammen', fr: 'Bonjour à tous' },
            'segment-2': { en: 'Hello everyone', fr: 'Bonjour à tous' }
          })
        }
      }
    });
    const translator = createTranslator();

    const translated = await translator.translateSegments([
      { id: 'segment-1', text: 'Hello everyone', language: 'en' },
      { id: 'segment-2', text: 'Hallo zusammen', language: 'de' }
    ], { outputLanguages: ['en', 'fr'], defaultLanguage: 'de' });

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(translated).toEqual([
      expect.objectContaining({ id: 'segment-1', translations: expect.objectContaining({ de: expect.any(Object), fr: expect.any(Object) }) }),
      expect.objectContaining({ id: 'segment-2', translations: expect.objectContaining({ en: expect.any(Object), fr: expect.any(Object) }) })
    ]);
  });
});

describe('STT Ticker Ollama model migration', () => {
  function createConfigApi(storedConfig) {
    return {
      getConfig: jest.fn(() => storedConfig),
      setConfig: jest.fn(),
      log: jest.fn()
    };
  }

  test('migrates the obsolete built-in Cloud model to the current default', () => {
    const api = createConfigApi({
      translation: {
        enabled: true,
        model: 'nemotron-3-nano'
      }
    });

    const config = new ConfigManager(api).load();

    expect(config.translation.model).toBe('deepseek-v4-flash');
    expect(api.setConfig).toHaveBeenCalledWith('config', expect.objectContaining({
      translation: expect.objectContaining({ model: 'deepseek-v4-flash' })
    }));
  });

  test('keeps a current user-selected Cloud model', () => {
    const api = createConfigApi({
      translation: {
        enabled: true,
        model: 'gpt-oss:20b'
      }
    });

    const config = new ConfigManager(api).load();

    expect(config.translation.model).toBe('gpt-oss:20b');
    expect(api.setConfig).not.toHaveBeenCalled();
  });
});
