jest.mock('axios', () => ({
  post: jest.fn().mockRejectedValue(new Error('legacy axios transport called')),
  get: jest.fn().mockRejectedValue(new Error('legacy axios health check called'))
}));

const DeepgramAsrClient = require('../plugins/stt-ticker/backend/asr/deepgram-client');

function createSdkClient() {
  const liveConnection = {
    connect: jest.fn(),
    waitForOpen: jest.fn().mockResolvedValue(),
    sendCloseStream: jest.fn(),
    close: jest.fn()
  };
  return {
    listen: {
      v1: {
        connect: jest.fn().mockResolvedValue(liveConnection),
        media: {
          transcribeFile: jest.fn().mockResolvedValue({
            metadata: {
              request_id: 'request-1',
              duration: 1.25,
              models: ['model-1'],
              model_info: {
                'model-1': { name: '2-general-nova', version: '2024-01-09', arch: 'nova-2' }
              }
            },
            results: {
              channels: [{
                detected_language: 'de',
                alternatives: [{
                  transcript: 'Hallo Deepgram.',
                  confidence: 0.97,
                  words: [{
                    word: 'Hallo',
                    punctuated_word: 'Hallo',
                    start: 0,
                    end: 0.4,
                    confidence: 0.98
                  }]
                }]
              }]
            }
          })
        }
      }
    },
    auth: {
      v1: {
        tokens: {
          grant: jest.fn().mockResolvedValue({
            access_token: 'temporary-token-that-must-not-be-returned',
            expires_in: 30
          })
        }
      }
    }
  };
}

describe('STT Ticker Deepgram SDK client', () => {
  test('uses Nova-3 multilingual mode when no model or language is supplied', async () => {
    const sdk = createSdkClient();
    const client = new DeepgramAsrClient('test-key', null, {
      clientFactory: () => sdk,
      timeout: 10000
    });

    await client.transcribe(Buffer.from([1, 2, 3]));

    expect(sdk.listen.v1.media.transcribeFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ model: 'nova-3', language: 'multi' })
    );
  });

  test('uses the configured default language for Nova-2 auto mode', async () => {
    const sdk = createSdkClient();
    const client = new DeepgramAsrClient('test-key', null, {
      clientFactory: () => sdk,
      timeout: 10000
    });

    await client.transcribe(Buffer.from([1, 2, 3]), {
      model: 'nova-2',
      language: 'auto',
      languageDefault: 'de'
    });

    expect(sdk.listen.v1.media.transcribeFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ model: 'nova-2', language: 'de' })
    );
  });

  test('uses SDK file transcription with only supported options', async () => {
    const sdk = createSdkClient();
    const client = new DeepgramAsrClient('test-key', null, {
      clientFactory: () => sdk,
      timeout: 10000
    });

    const result = await client.transcribe(Buffer.from([1, 2, 3]), {
      mimeType: 'audio/wav',
      filename: 'speech.wav',
      language: 'de',
      model: 'nova-2'
    });

    expect(sdk.listen.v1.media.transcribeFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        model: 'nova-2',
        language: 'de',
        smart_format: true,
        punctuate: true,
        utterances: true
      })
    );
    const requestOptions = sdk.listen.v1.media.transcribeFile.mock.calls[0][1];
    expect(requestOptions).not.toHaveProperty('threshold');
    expect(requestOptions).not.toHaveProperty('encoding');
    expect(result).toMatchObject({
      text: 'Hallo Deepgram.',
      provider: 'deepgram',
      model: 'nova-2',
      requestId: 'request-1',
      language: 'de'
    });
  });

  test('tests transcription credentials through an SDK live-listen handshake', async () => {
    const sdk = createSdkClient();
    const client = new DeepgramAsrClient('test-key', null, {
      clientFactory: () => sdk,
      timeout: 10000
    });

    const result = await client.testConnection();

    expect(sdk.listen.v1.connect).toHaveBeenCalledWith(expect.objectContaining({
      model: 'nova-3',
      encoding: 'linear16',
      sample_rate: 16000,
      Authorization: 'Token test-key'
    }));
    const connection = await sdk.listen.v1.connect.mock.results[0].value;
    expect(connection.connect).toHaveBeenCalledTimes(1);
    expect(connection.waitForOpen).toHaveBeenCalledTimes(1);
    expect(connection.sendCloseStream).toHaveBeenCalledWith({ type: 'CloseStream' });
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(sdk.auth.v1.tokens.grant).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, status: 200 });
    expect(JSON.stringify(result)).not.toContain('temporary-token');
  });

  test('normalizes SDK authentication errors without exposing request headers', async () => {
    const sdk = createSdkClient();
    const error = new Error('Invalid credentials');
    error.statusCode = 401;
    error.body = { err_code: 'INVALID_AUTH', err_msg: 'Invalid credentials' };
    error.request = { headers: { Authorization: 'Token test-key' } };
    sdk.listen.v1.connect.mockRejectedValue(error);
    const client = new DeepgramAsrClient('test-key', null, { clientFactory: () => sdk });

    const result = await client.testConnection();

    expect(result).toEqual({ ok: false, status: 401, message: 'Invalid credentials' });
    expect(JSON.stringify(result)).not.toContain('test-key');
    expect(JSON.stringify(result)).not.toContain('Authorization');
  });
});
