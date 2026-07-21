const { ConfigManager, DEFAULT_CONFIG, SUPPORTED_SOURCE_LANGUAGES } = require('../plugins/stt-ticker/backend/config');
const AsrPipeline = require('../plugins/stt-ticker/backend/asr-pipeline');
const DeepgramAsrClient = require('../plugins/stt-ticker/backend/asr/deepgram-client');

function createPipeline(config = DEFAULT_CONFIG) {
  return new AsrPipeline({}, JSON.parse(JSON.stringify(config)), {
    info() {}, warn() {}, error() {}, debug() {}
  });
}

describe('STT Ticker source language policy', () => {
  test.each([
    ['fr', 'Bonjour tout le monde'],
    ['zh', '你好世界'],
    ['ru', 'Привет мир']
  ])('keeps supported %s transcripts intact', (language, text) => {
    const result = createPipeline().normalizeResult({ text, language, provider: 'deepgram' });

    expect(result).toMatchObject({ text, language, languageSource: 'backend' });
  });

  test('rejects text whose script contradicts the provider language', () => {
    expect(() => createPipeline().normalizeResult({
      text: '你好世界',
      language: 'fr',
      provider: 'deepgram'
    })).toThrow('language/script mismatch');
  });

  test('uses the complete UI source language catalog as the default whitelist', () => {
    expect(DEFAULT_CONFIG.asr.languageWhitelist).toEqual(SUPPORTED_SOURCE_LANGUAGES);
  });

  test('migrates only the historical DE/EN default whitelist', () => {
    const stored = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    stored.asr.languageWhitelist = ['de', 'en'];
    const api = { getConfig: jest.fn(() => stored), setConfig: jest.fn(), log: jest.fn() };

    const config = new ConfigManager(api).load();

    expect(config.asr.languageWhitelist).toEqual(SUPPORTED_SOURCE_LANGUAGES);
    expect(api.setConfig).toHaveBeenCalled();
  });

  test('preserves a manually restricted whitelist', () => {
    const stored = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    stored.asr.languageWhitelist = ['de'];
    const api = { getConfig: jest.fn(() => stored), setConfig: jest.fn(), log: jest.fn() };

    const config = new ConfigManager(api).load();

    expect(config.asr.languageWhitelist).toEqual(['de']);
    expect(api.setConfig).not.toHaveBeenCalled();
  });

  test('describes Deepgram language limits without changing providers automatically', () => {
    expect(DeepgramAsrClient.MODELS['nova-2'].multilingualLanguages).toEqual(['en', 'es']);
    expect(DeepgramAsrClient.MODELS['nova-2'].supportedFixedLanguages).toContain('zh');
    expect(DeepgramAsrClient.MODELS['nova-2'].supportedFixedLanguages).not.toContain('ar');
  });
});
