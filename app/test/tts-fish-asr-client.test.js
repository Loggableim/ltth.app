const axios = require('axios');
const msgpack = require('@msgpack/msgpack');
const FishAsrClient = require('../plugins/tts/engines/fish-asr-client');

jest.mock('axios');

describe('FishAsrClient', () => {
  let logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
  });

  test('transcribes audio through Fish.audio ASR using MessagePack', async () => {
    const audio = Buffer.from('fake wav data');
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        text: '  hello host  ',
        duration: 1.25,
        segments: [{ text: 'hello host', start: 0, end: 1.25 }]
      }
    });

    const client = new FishAsrClient('fish-key', logger);
    const result = await client.transcribe(audio, { language: 'en' });

    expect(result).toEqual({
      text: 'hello host',
      duration: 1.25,
      segments: [{ text: 'hello host', start: 0, end: 1.25 }],
      provider: 'fish.audio'
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, payload, requestConfig] = axios.post.mock.calls[0];
    const decodedPayload = msgpack.decode(payload);
    expect(url).toBe('https://api.fish.audio/v1/asr');
    expect(Buffer.from(decodedPayload.audio)).toEqual(audio);
    expect(decodedPayload.language).toBe('en');
    expect(requestConfig.headers).toMatchObject({
      Authorization: 'Bearer fish-key',
      'Content-Type': 'application/msgpack'
    });
    expect(requestConfig.responseType).toBe('arraybuffer');
  });

  test('rejects missing api key before sending audio', async () => {
    expect(() => new FishAsrClient('')).toThrow('Fish.audio ASR API key is required');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('rejects empty or oversized audio before sending audio', async () => {
    const client = new FishAsrClient('fish-key', logger, { maxAudioBytes: 3 });

    await expect(client.transcribe(Buffer.alloc(0))).rejects.toThrow('non-empty Buffer');
    await expect(client.transcribe(Buffer.from('1234'))).rejects.toThrow('exceeds 3 bytes');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('decodes MessagePack ASR responses', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: msgpack.encode({
        text: 'decoded response',
        duration: 2,
        segments: []
      })
    });

    const client = new FishAsrClient('fish-key', logger);
    await expect(client.transcribe(Buffer.from('audio'))).resolves.toMatchObject({
      text: 'decoded response',
      duration: 2,
      segments: [],
      provider: 'fish.audio'
    });
  });

  test('throws clear errors for http and malformed responses', async () => {
    const client = new FishAsrClient('fish-key', logger);

    axios.post.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { message: 'invalid token' }
      }
    });
    await expect(client.transcribe(Buffer.from('audio'))).rejects.toThrow('Fish.audio ASR API error (401): invalid token');

    axios.post.mockResolvedValueOnce({
      status: 200,
      data: { duration: 1, segments: [] }
    });
    await expect(client.transcribe(Buffer.from('audio'))).rejects.toThrow('malformed response');
  });
});
