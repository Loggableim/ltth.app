jest.mock('axios');

const axios = require('axios');
const Translator = require('../plugins/stt-ticker/backend/translator');

function createConfig(targetLanguage = 'de') {
  return {
    translation: {
      enabled: true,
      apiKey: 'test-key',
      model: 'deepseek-v4-flash',
      sourceLanguage: 'en',
      targetLanguage,
      maxTextLength: 500
    }
  };
}

function createTranslator(config = createConfig()) {
  return new Translator(config, { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() });
}

describe('STT Ticker translator cache context', () => {
  beforeEach(() => axios.post.mockReset());

  test('does not reuse a cached translation after the target language changes', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { message: { content: 'Hallo' } } })
      .mockResolvedValueOnce({ data: { message: { content: 'Bonjour' } } });
    const translator = createTranslator();

    await expect(translator.translate('Hello world')).resolves.toMatchObject({ text: 'Hallo' });
    translator.updateConfig(createConfig('fr'));
    await expect(translator.translate('Hello world')).resolves.toMatchObject({ text: 'Bonjour' });

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[1][1].messages[0].content).toContain('to fr');
  });

  test('uses a cache hit for an identical translation request inside the TTL', async () => {
    axios.post.mockResolvedValueOnce({ data: { message: { content: 'Hallo' } } });
    const translator = createTranslator();

    await translator.translate('Hello world');
    await expect(translator.translate('Hello world')).resolves.toMatchObject({ text: 'Hallo', cached: true });

    expect(axios.post).toHaveBeenCalledTimes(1);
  });
});
