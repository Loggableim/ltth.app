const axios = require('axios');
const msgpack = require('@msgpack/msgpack');
const FishAsrClient = require('../plugins/tts/engines/fish-asr-client');

jest.mock('axios');

describe('FishAsrClient', () => {
  let logger;

  beforeEach(() => {
    jest.resetAllMocks();
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
    expect(decodedPayload.ignore_timestamps).toBe(true);
    expect(requestConfig.headers).toMatchObject({
      Authorization: 'Bearer fish-key',
      'Content-Type': 'application/msgpack'
    });
    expect(requestConfig.responseType).toBe('arraybuffer');
    expect(FishAsrClient.MAX_RESPONSE_BYTES).toBe(1024 * 1024);
    expect(FishAsrClient.MAX_REQUEST_BODY_BYTES).toBe(FishAsrClient.SERVICE_MAX_AUDIO_BYTES + 1024 * 1024);
    expect(requestConfig.maxContentLength).toBe(FishAsrClient.MAX_RESPONSE_BYTES);
    expect(requestConfig.maxBodyLength).toBe(FishAsrClient.MAX_REQUEST_BODY_BYTES);
  });

  test('allows precise timestamp requests when explicitly configured', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        text: 'timed host',
        duration: 1,
        segments: [{ text: 'timed host', start: 0, end: 1 }]
      }
    });

    const client = new FishAsrClient('fish-key', logger);
    await client.transcribe(Buffer.from('audio'), { ignoreTimestamps: false });

    const decodedPayload = msgpack.decode(axios.post.mock.calls[0][1]);
    expect(decodedPayload.ignore_timestamps).toBe(false);
  });

  test('retries validation payload failures as multipart form-data', async () => {
    axios.post
      .mockRejectedValueOnce({
        response: {
          status: 422,
          data: { message: 'invalid msgpack audio payload' }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          text: 'multipart host',
          duration: 0.75,
          segments: [{ text: 'multipart host', start: 0, end: 0.75 }]
        }
      });

    const client = new FishAsrClient('fish-key', logger);
    const result = await client.transcribe(Buffer.from('webm audio'), {
      language: 'de',
      mimeType: 'audio/webm',
      filename: 'host.webm'
    });

    expect(result.text).toBe('multipart host');
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][2].headers['Content-Type']).toBe('application/msgpack');
    expect(axios.post.mock.calls[1][2].headers).toMatchObject({
      Authorization: 'Bearer fish-key'
    });
    expect(
      axios.post.mock.calls[1][2].headers['Content-Type'] || axios.post.mock.calls[1][2].headers['content-type']
    ).toMatch(/^multipart\/form-data; boundary=/);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('retrying multipart')
    );
  });

  test('does not retry authentication failures as multipart form-data', async () => {
    axios.post.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { message: 'invalid token' }
      }
    });

    const client = new FishAsrClient('fish-key', logger);
    await expect(client.transcribe(Buffer.from('audio'))).rejects.toThrow('Fish.audio ASR API error (401): invalid token');
    expect(axios.post).toHaveBeenCalledTimes(1);
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

  test('uses the Fish.audio 20 MB service cap by default', async () => {
    const client = new FishAsrClient('fish-key', logger);

    expect(FishAsrClient.SERVICE_MAX_AUDIO_BYTES).toBe(20 * 1024 * 1024);
    expect(client.maxAudioBytes).toBe(FishAsrClient.SERVICE_MAX_AUDIO_BYTES);
    await expect(client.transcribe(Buffer.alloc(FishAsrClient.SERVICE_MAX_AUDIO_BYTES + 1))).rejects.toThrow(
      `exceeds ${FishAsrClient.SERVICE_MAX_AUDIO_BYTES} bytes`
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('accepts a lower configured max and rejects configured max above the service cap', () => {
    const client = new FishAsrClient('fish-key', logger, { maxAudioBytes: 1024 });

    expect(client.maxAudioBytes).toBe(1024);
    expect(() => new FishAsrClient('fish-key', logger, { maxAudioBytes: FishAsrClient.SERVICE_MAX_AUDIO_BYTES + 1 }))
      .toThrow(`must be between 1 and ${FishAsrClient.SERVICE_MAX_AUDIO_BYTES} bytes`);
    expect(() => new FishAsrClient('fish-key', logger, { maxAudioBytes: 0 }))
      .toThrow(`must be between 1 and ${FishAsrClient.SERVICE_MAX_AUDIO_BYTES} bytes`);
  });

  test('allows per-call maxAudioBytes only when it lowers the configured cap', async () => {
    const client = new FishAsrClient('fish-key', logger, { maxAudioBytes: 1000 });

    await expect(client.transcribe(Buffer.from('123456'), { maxAudioBytes: 5 })).rejects.toThrow('exceeds 5 bytes');
    await expect(client.transcribe(Buffer.from('123456'), { maxAudioBytes: 1001 })).rejects.toThrow(
      'cannot exceed configured maxAudioBytes of 1000 bytes'
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('validates optional language tags before sending audio', async () => {
    const client = new FishAsrClient('fish-key', logger);

    await expect(client.transcribe(Buffer.from('audio'), { language: 'english' })).rejects.toThrow(
      'must be an ISO-style language tag'
    );
    await expect(client.transcribe(Buffer.from('audio'), { language: 'de-DE-extra-long-tag' })).rejects.toThrow(
      'must be 1-16 characters'
    );
    await expect(client.transcribe(Buffer.from('audio'), { language: 123 })).rejects.toThrow(
      'must be a string'
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('validates optional timeout before sending audio', async () => {
    const client = new FishAsrClient('fish-key', logger);

    await expect(client.transcribe(Buffer.from('audio'), { timeout: 0 })).rejects.toThrow(
      'timeout must be a finite positive number'
    );
    await expect(client.transcribe(Buffer.from('audio'), { timeout: Number.POSITIVE_INFINITY })).rejects.toThrow(
      'timeout must be a finite positive number'
    );
    expect(() => new FishAsrClient('fish-key', logger, { timeout: -1 })).toThrow(
      'timeout must be a finite positive number'
    );
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
      status: 503,
      data: { error: 'service unavailable' }
    });
    await expect(client.transcribe(Buffer.from('audio'))).rejects.toThrow('Fish.audio ASR API error (503): service unavailable');

    axios.post.mockResolvedValueOnce({
      status: 200,
      data: { duration: 1, segments: [] }
    });
    await expect(client.transcribe(Buffer.from('audio'))).rejects.toThrow('malformed response');
  });

  test('truncates huge upstream error bodies in thrown errors', async () => {
    const client = new FishAsrClient('fish-key', logger);
    expect(FishAsrClient.MAX_ERROR_MESSAGE_BYTES).toBe(2048);
    const hugeMessage = 'x'.repeat(FishAsrClient.MAX_ERROR_MESSAGE_BYTES + 500);

    axios.post.mockRejectedValueOnce({
      response: {
        status: 500,
        data: { message: hugeMessage }
      }
    });

    await expect(client.transcribe(Buffer.from('audio'))).rejects.toThrow(
      `Fish.audio ASR API error (500): ${'x'.repeat(FishAsrClient.MAX_ERROR_MESSAGE_BYTES)}... [truncated]`
    );
  });

  test('throws clear errors for network failures and malformed response fields', async () => {
    const client = new FishAsrClient('fish-key', logger);

    axios.post.mockRejectedValueOnce({
      request: {},
      message: 'timeout exceeded'
    });
    await expect(client.transcribe(Buffer.from('audio'))).rejects.toThrow('Fish.audio ASR network error: timeout exceeded');

    axios.post.mockResolvedValueOnce({
      status: 200,
      data: { text: 'bad duration', duration: 'long', segments: [] }
    });
    await expect(client.transcribe(Buffer.from('audio'))).rejects.toThrow('malformed response: duration');

    axios.post.mockResolvedValueOnce({
      status: 200,
      data: { text: 'bad segments', duration: 1, segments: 'not-an-array' }
    });
    await expect(client.transcribe(Buffer.from('audio'))).rejects.toThrow('malformed response: segments');

    axios.post.mockResolvedValueOnce({
      status: 200,
      data: { text: 'bad segment item', duration: 1, segments: [{ text: 'missing times' }] }
    });
    await expect(client.transcribe(Buffer.from('audio'))).rejects.toThrow('malformed response: segment 0');
  });
});
