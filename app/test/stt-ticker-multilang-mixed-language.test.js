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

  test('combines routed source fragments and translations in every selected language row', () => {
    const buffer = new TextBuffer(MULTI_LANGUAGE_CONFIG);
    try {
      buffer.push({
        text: 'Welcome everyone.',
        language: 'en',
        translation: {
          translations: {
            de: { text: 'Willkommen zusammen.' },
            fr: { text: 'Bienvenue à tous.' }
          }
        }
      });
      buffer.push({
        text: 'Guten Morgen.',
        language: 'de',
        translation: {
          translations: {
            en: { text: 'Good morning.' },
            fr: { text: 'Bonjour.' }
          }
        }
      });

      expect(buffer.getCurrent().multi.lines).toEqual([
        expect.objectContaining({ language: 'de', text: 'Willkommen zusammen. Guten Morgen.' }),
        expect.objectContaining({ language: 'en', text: 'Welcome everyone. Good morning.' }),
        expect.objectContaining({ language: 'fr', text: 'Bienvenue à tous. Bonjour.' })
      ]);
    } finally {
      buffer.destroy();
    }
  });

  test('falls back to classic output when no target language is selected', () => {
    const buffer = new TextBuffer({
      ...MULTI_LANGUAGE_CONFIG,
      multiLanguage: {
        ...MULTI_LANGUAGE_CONFIG.multiLanguage,
        outputLanguages: []
      }
    });
    try {
      buffer.push({ text: 'Sichtbarer Untertitel', language: 'de' });

      expect(buffer.getCurrent()).toMatchObject({
        text: 'Sichtbarer Untertitel',
        multi: null
      });
    } finally {
      buffer.destroy();
    }
  });
});
