const SttTickerPlugin = require('../plugins/stt-ticker/main');

function createPlugin() {
  const api = {
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    log: jest.fn()
  };
  const plugin = new SttTickerPlugin(api);
  plugin.config = {
    asr: { fallbackLanguage: 'de' },
    langDetect: { enabled: true, minConfidence: 0.15, unknownPolicy: 'auto' },
    multiLanguage: { enabled: true, defaultLanguage: 'de', outputLanguages: ['en', 'fr'] }
  };
  return plugin;
}

describe('STT Ticker audio caption routing', () => {
  test('turns an ASR result with pause segments into independently routed caption fragments', () => {
    const plugin = createPlugin();

    const routed = plugin._routeCaptionSegments({
      text: 'Hello everyone. Hallo zusammen.',
      segments: [
        { text: 'Hello everyone.' },
        { text: 'Hallo zusammen.' }
      ]
    });

    expect(routed).toEqual([
      expect.objectContaining({ text: 'Hello everyone.', language: 'en' }),
      expect.objectContaining({ text: 'Hallo zusammen.', language: 'de' })
    ]);
  });
});
