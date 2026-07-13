jest.mock('axios');

const axios = require('axios');
const Translator = require('../plugins/stt-ticker/backend/translator');
const TextBuffer = require('../plugins/stt-ticker/backend/text-buffer');

const MULTI_LANGUAGE_CONFIG = {
  bufferSize: 10,
  maxTextAge: 30,
  maxLines: 2,
  maxCharsPerLine: 80,
  dualLanguage: { enabled: false },
  multiLanguage: {
    enabled: true,
    defaultLanguage: 'de',
    outputLanguages: ['en', 'fr'],
    colors: { de: '#FFFFFF', en: '#FFD700', fr: '#6BCBFF' }
  },
  translation: {
    enabled: true,
    apiKey: 'ollama-secret',
    model: 'deepseek-v4-flash'
  }
};

describe('STT Ticker mixed-language multi output', () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  test('keeps English source text visible and translates it to the configured default language', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        message: {
          content: JSON.stringify({
            de: 'Hallo und willkommen',
            fr: 'Bonjour et bienvenue'
          })
        }
      }
    });
    const translator = new Translator(MULTI_LANGUAGE_CONFIG, {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    });

    const translation = await translator.translateMulti('Hello und willkommen', {
      sourceLanguage: 'en',
      outputLanguages: ['en', 'fr']
    });
    const buffer = new TextBuffer(MULTI_LANGUAGE_CONFIG);
    try {
      buffer.push({
        text: 'Hello und willkommen',
        language: 'en',
        translation
      });

      expect(translation).toMatchObject({
        translated: true,
        translations: {
          de: { text: 'Hallo und willkommen' },
          fr: { text: 'Bonjour et bienvenue' }
        }
      });
      expect(buffer.getCurrent().multi.lines).toEqual([
        expect.objectContaining({ language: 'de', text: 'Hallo und willkommen' }),
        expect.objectContaining({ language: 'en', text: 'Hello und willkommen' }),
        expect.objectContaining({ language: 'fr', text: 'Bonjour et bienvenue' })
      ]);
    } finally {
      buffer.destroy();
    }
  });
});
