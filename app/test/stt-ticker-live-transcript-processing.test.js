const SttTickerPlugin = require('../plugins/stt-ticker/main');
const AsrPipeline = require('../plugins/stt-ticker/backend/asr-pipeline');

function createPlugin() {
  const io = { emit: jest.fn() };
  const api = { getSocketIO: () => io, log: jest.fn() };
  const plugin = new SttTickerPlugin(api);
  plugin.config = {
    enabled: true,
    minTranscriptChars: 2,
    asr: { languageWhitelist: ['de', 'en'], fallbackLanguage: 'de' },
    langDetect: { enabled: true, minConfidence: 0.15, unknownPolicy: 'auto' },
    multiLanguage: { enabled: false },
    translation: { enabled: true, apiKey: 'translator-key' },
    vrchatChatbox: { enabled: true }
  };
  plugin.textBuffer = {
    push: jest.fn(),
    getCurrent: jest.fn(() => ({ text: 'Hallo Welt.', translation: { text: 'Hello world.' } }))
  };
  plugin.translator = {
    translate: jest.fn().mockResolvedValue({ text: 'Hello world.', targetLanguage: 'en' })
  };
  plugin.asrPipeline = {
    normalizeResult: jest.fn(result => ({ ...result, languageSource: 'backend' })),
    recordError: jest.fn()
  };
  plugin._queueVrchatChatboxText = jest.fn();
  return { plugin, io };
}

describe('STT Ticker live transcript processing', () => {
  test('keeps interim text display-only', () => {
    const { plugin, io } = createPlugin();

    plugin._handleDeepgramInterim('capture-1', {
      text: 'Hallo',
      provider: 'deepgram',
      isFinal: false
    });

    expect(io.emit).toHaveBeenCalledWith('stt-ticker:interim', expect.objectContaining({
      socketId: 'capture-1',
      text: 'Hallo',
      provider: 'deepgram',
      isFinal: false
    }));
    expect(plugin.textBuffer.push).not.toHaveBeenCalled();
    expect(plugin.translator.translate).not.toHaveBeenCalled();
    expect(plugin._queueVrchatChatboxText).not.toHaveBeenCalled();
  });

  test('normalizes and commits a final live utterance through the existing output pipeline', async () => {
    const { plugin, io } = createPlugin();
    const raw = {
      text: 'Hallo Welt.',
      segments: [{ text: 'Hallo Welt.', start: 0, end: 1 }],
      provider: 'deepgram',
      language: 'de'
    };

    const result = await plugin._handleDeepgramFinal('capture-1', raw);

    expect(plugin.asrPipeline.normalizeResult).toHaveBeenCalledWith(raw);
    expect(plugin.translator.translate).toHaveBeenCalledWith('Hallo Welt.', expect.objectContaining({
      sourceLanguage: 'de'
    }));
    expect(plugin.textBuffer.push).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Hallo Welt.',
      provider: 'deepgram',
      language: 'de'
    }));
    expect(io.emit).toHaveBeenCalledWith('stt-ticker:transcript', expect.any(Object));
    expect(plugin._queueVrchatChatboxText).toHaveBeenCalledWith('Hallo Welt.');
    expect(result).toMatchObject({ accepted: true });
  });

  test('uses the same language whitelist and hallucination normalization for live results', () => {
    const pipeline = new AsrPipeline({}, {
      asr: { languageWhitelist: ['de', 'en'], fallbackLanguage: 'de' },
      langDetect: { enabled: true, minConfidence: 0.15, unknownPolicy: 'auto' }
    }, { info() {}, warn() {}, error() {}, debug() {} });

    expect(() => pipeline.normalizeResult({
      text: 'Bonjour tout le monde',
      provider: 'deepgram',
      language: 'fr'
    })).toThrow('not in whitelist');

    expect(pipeline.normalizeResult({
      text: 'Hallo zusammen.',
      provider: 'deepgram',
      language: 'de'
    })).toMatchObject({
      text: 'Hallo zusammen.',
      provider: 'deepgram',
      language: 'de'
    });
  });
});
