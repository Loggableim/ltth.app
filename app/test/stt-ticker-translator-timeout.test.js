jest.mock('axios');

const axios = require('axios');
const Translator = require('../plugins/stt-ticker/backend/translator');

describe('STT Ticker translator timeout', () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  test('uses the raised default timeout when no translation timeout is configured', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          { message: { content: 'Hello world' } }
        ]
      }
    });

    const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const translator = new Translator({
      translation: {
        enabled: true,
        apiKey: 'ollama-secret',
        model: 'nemotron-3-nano'
      }
    }, logger);

    const result = await translator.translate('Hallo Welt');

    expect(result).toMatchObject({
      translated: true,
      text: 'Hello world'
    });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][2].timeout).toBe(30000);
  });

  test('respects an explicitly configured translation timeout', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          { message: { content: 'Bonjour' } }
        ]
      }
    });

    const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const translator = new Translator({
      translation: {
        enabled: true,
        apiKey: 'ollama-secret',
        model: 'nemotron-3-nano',
        timeoutMs: 45000
      }
    }, logger);

    await translator.translate('Guten Morgen');

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][2].timeout).toBe(45000);
  });
});
