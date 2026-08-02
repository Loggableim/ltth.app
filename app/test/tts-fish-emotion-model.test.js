const axios = require('axios');
const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');

jest.mock('axios');

const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

function createEngine() {
  const engine = new FishSpeechEngine('test-key', logger, { performanceMode: 'fast' });
  engine.maxRetries = 0;
  return engine;
}

describe('Fish.audio emotion markers by effective model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: Buffer.from('audio') });
  });

  test('sends an S1 parenthesized emotion marker with the requested model', async () => {
    const engine = createEngine();

    await engine.synthesize('The door moved.', 'fish-sarah', 1, {
      model: 's1',
      emotion: 'scared'
    });

    expect(axios.post).toHaveBeenCalledWith(
      engine.apiSynthesisUrl,
      expect.objectContaining({ text: '(scared) The door moved.' }),
      expect.objectContaining({ headers: expect.objectContaining({ model: 's1' }) })
    );
  });

  test('sends an S2.1 bracketed emotion marker with the requested model', async () => {
    const engine = createEngine();

    await engine.synthesize('The door moved.', 'fish-sarah', 1, {
      model: 's2.1-pro',
      emotion: 'scared'
    });

    expect(axios.post).toHaveBeenCalledWith(
      engine.apiSynthesisUrl,
      expect.objectContaining({ text: '[scared] The door moved.' }),
      expect.objectContaining({ headers: expect.objectContaining({ model: 's2.1-pro' }) })
    );
  });

  test('does not duplicate a caller-provided emotion marker', async () => {
    const engine = createEngine();

    await engine.synthesize('[mysterious] The door moved.', 'fish-sarah', 1, {
      model: 's2.1',
      emotion: 'scared'
    });

    expect(axios.post.mock.calls[0][1].text).toBe('[mysterious] The door moved.');
  });

  test('does not add a marker for the default neutral emotion', async () => {
    const engine = createEngine();

    await engine.synthesize('The door moved.', 'fish-sarah', 1, {
      model: 's2',
      emotion: 'neutral'
    });

    expect(axios.post.mock.calls[0][1].text).toBe('The door moved.');
  });
});
