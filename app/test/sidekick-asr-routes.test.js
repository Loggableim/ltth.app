const express = require('express');
const request = require('supertest');
const SidekickPlugin = require('../plugins/sidekick/main');

function createApi(app, plugins = {}) {
  return {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    registerRoute: jest.fn((method, routePath, handler) => {
      app[method.toLowerCase()](routePath, handler);
      return true;
    }),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    getPluginInstance: jest.fn((pluginId) => plugins[pluginId] || null),
    getPlugin: jest.fn((pluginId) => plugins[pluginId] || null),
    log: jest.fn()
  };
}

function createHarness({ config = {}, ttsPlugin = null, animazingPalPlugin = null, transcriptResult, hostResult, remoteAddress } = {}) {
  const app = express();
  if (remoteAddress) {
    app.use((req, res, next) => {
      Object.defineProperty(req.socket, 'remoteAddress', {
        value: remoteAddress,
        configurable: true
      });
      Object.defineProperty(req, 'ip', {
        value: remoteAddress,
        configurable: true
      });
      next();
    });
  }
  const tts = ttsPlugin || {
    config: { fishaudioApiKey: 'fish-secret-key' },
    transcribeFishAudio: jest.fn().mockResolvedValue(transcriptResult || {
      text: 'Hallo Chat, hört ihr mich?',
      duration: 1.25,
      segments: [{ text: 'Hallo Chat, hört ihr mich?', start: 0, end: 1.25 }],
      provider: 'fish.audio'
    })
  };
  const animazingPal = animazingPalPlugin || {
    processSidekickHostSpeech: jest.fn(),
    speakHostResponse: jest.fn()
  };
  const api = createApi(app, { tts, animazingpal: animazingPal });
  const plugin = new SidekickPlugin(api);
  plugin.config = {
    asr: {
      enabled: true,
      maxAudioBytes: 1024 * 1024,
      language: 'de',
      ...config.asr
    },
    conversation: {
      minHostSpeechChars: 3,
      ...config.conversation
    },
    ...config
  };
  plugin.configManager = { save: jest.fn(), update: jest.fn() };
  plugin.metrics = { recordError: jest.fn() };
  plugin.memoryStore = {};
  plugin.eventBus = {};
  plugin.deduper = {};
  plugin.rateLimiter = {};
  plugin.outboxBatcher = {};
  plugin.processHostSpeechTranscript = jest.fn().mockResolvedValue(hostResult || {
    accepted: true,
    delegated: true,
    reason: 'accepted'
  });
  plugin._registerRoutes();
  return { app, api, plugin, tts, animazingPal };
}

function audioBuffer() {
  return Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03, 0x04]);
}

describe('Sidekick ASR upload routes', () => {
  test('transcribes uploaded audio and delegates accepted transcripts to host speech processing', async () => {
    const { app, plugin, tts } = createHarness();

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      accepted: true,
      delegated: true,
      transcript: expect.objectContaining({
        text: 'Hallo Chat, hört ihr mich?',
        duration: 1.25,
        provider: 'fish.audio'
      })
    }));
    expect(response.body.latencyMs).toEqual(expect.any(Number));
    expect(tts.transcribeFishAudio).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({
      language: 'de',
      maxAudioBytes: 1024 * 1024,
      mimeType: 'audio/webm',
      filename: 'host.webm'
    }));
    expect(plugin.processHostSpeechTranscript).toHaveBeenCalledWith('Hallo Chat, hört ihr mich?', expect.objectContaining({
      source: 'sidekick-asr',
      provider: 'fish.audio',
      mimeType: 'audio/webm',
      audioBytes: audioBuffer().length
    }));
  });

  test('supports transcribe-only uploads without delegating to host speech processing', async () => {
    const { app, plugin } = createHarness();

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .field('transcribeOnly', 'true')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      accepted: false,
      delegated: false,
      reason: 'transcribe-only'
    }));
    expect(plugin.processHostSpeechTranscript).not.toHaveBeenCalled();
  });

  test('rejects cross-origin browser uploads before calling TTS ASR', async () => {
    const { app, tts } = createHarness();

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .set('Host', 'localhost:3000')
      .set('Origin', 'https://evil.example')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(403);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_FORBIDDEN_ORIGIN' })
    }));
    expect(tts.transcribeFishAudio).not.toHaveBeenCalled();
  });

  test('allows same-origin browser uploads through the ASR guard', async () => {
    const { app, tts } = createHarness();

    await request(app)
      .post('/api/sidekick/asr/transcribe')
      .set('Host', 'localhost:3000')
      .set('Origin', 'http://localhost:3000')
      .field('transcribeOnly', 'true')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(200);

    expect(tts.transcribeFishAudio).toHaveBeenCalledTimes(1);
  });

  test('rate limits ASR uploads before calling TTS ASR again', async () => {
    const { app, tts } = createHarness({
      config: {
        asr: {
          rateLimitMax: 2,
          rateLimitWindowMs: 60000
        }
      }
    });

    for (let index = 0; index < 2; index += 1) {
      await request(app)
        .post('/api/sidekick/asr/transcribe')
        .field('transcribeOnly', 'true')
        .attach('audio', audioBuffer(), { filename: `host-${index}.webm`, contentType: 'audio/webm' })
        .expect(200);
    }

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .field('transcribeOnly', 'true')
      .attach('audio', audioBuffer(), { filename: 'host-3.webm', contentType: 'audio/webm' })
      .expect(429);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_RATE_LIMITED' })
    }));
    expect(tts.transcribeFishAudio).toHaveBeenCalledTimes(2);
  });

  test('rate limits ASR uploads even when X-Forwarded-For rotates', async () => {
    const { app, tts } = createHarness({
      config: {
        asr: {
          rateLimitMax: 2,
          rateLimitWindowMs: 60000
        }
      }
    });

    for (let index = 0; index < 2; index += 1) {
      await request(app)
        .post('/api/sidekick/asr/transcribe')
        .set('X-Forwarded-For', `198.51.100.${index + 10}`)
        .field('transcribeOnly', 'true')
        .attach('audio', audioBuffer(), { filename: `host-${index}.webm`, contentType: 'audio/webm' })
        .expect(200);
    }

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .set('X-Forwarded-For', '198.51.100.99')
      .field('transcribeOnly', 'true')
      .attach('audio', audioBuffer(), { filename: 'host-3.webm', contentType: 'audio/webm' })
      .expect(429);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_RATE_LIMITED' })
    }));
    expect(tts.transcribeFishAudio).toHaveBeenCalledTimes(2);
  });

  test('rejects no-origin non-loopback uploads without an admin token', async () => {
    const { app, tts } = createHarness({ remoteAddress: '203.0.113.55' });

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(403);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_FORBIDDEN_ORIGIN' })
    }));
    expect(tts.transcribeFishAudio).not.toHaveBeenCalled();
  });

  test('returns unavailable when ASR is disabled', async () => {
    const { app, plugin } = createHarness({ config: { asr: { enabled: false } } });

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(503);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_DISABLED' })
    }));
    expect(plugin.processHostSpeechTranscript).not.toHaveBeenCalled();
  });

  test('returns unavailable when the TTS plugin ASR method is missing', async () => {
    const { app } = createHarness({ ttsPlugin: { config: { fishaudioApiKey: 'fish-secret-key' } } });

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(503);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_TTS_UNAVAILABLE' })
    }));
  });

  test('fails closed before Fish ASR when host delegation preflight is blocked', async () => {
    const { app, plugin, tts } = createHarness({
      animazingPalPlugin: {
        speakHostResponse: jest.fn()
      }
    });

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(503);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_HOST_PREFLIGHT_BLOCKED' }),
      diagnostics: expect.objectContaining({
        hostPreflight: expect.objectContaining({
          ready: false,
          checks: expect.arrayContaining([
            expect.objectContaining({ id: 'animazingpal.hostPipeline', status: 'error' })
          ])
        })
      })
    }));
    expect(tts.transcribeFishAudio).not.toHaveBeenCalled();
    expect(plugin.processHostSpeechTranscript).not.toHaveBeenCalled();
  });

  test('rejects requests without an audio file', async () => {
    const { app } = createHarness();

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .field('transcribeOnly', 'true')
      .expect(400);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_UPLOAD_REQUIRED' })
    }));
  });

  test('rejects unsupported upload MIME types', async () => {
    const { app } = createHarness();

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', Buffer.from('not audio'), { filename: 'host.txt', contentType: 'text/plain' })
      .expect(415);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_UNSUPPORTED_MIME' })
    }));
  });

  test('rejects multipart field abuse before calling TTS ASR', async () => {
    const { app, tts } = createHarness();
    let upload = request(app)
      .post('/api/sidekick/asr/transcribe');

    for (let index = 0; index < 12; index += 1) {
      upload = upload.field(`extra${index}`, 'x');
    }

    const response = await upload
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(400);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_MULTIPART_LIMIT' })
    }));
    expect(tts.transcribeFishAudio).not.toHaveBeenCalled();
  });

  test('rejects spoofed audio MIME uploads before calling TTS ASR', async () => {
    const { app, tts } = createHarness();

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', Buffer.from('this is not a webm container'), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(415);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_UNSUPPORTED_AUDIO_CONTENT' })
    }));
    expect(tts.transcribeFishAudio).not.toHaveBeenCalled();
  });

  test('drops invalid ASR language before calling TTS ASR', async () => {
    const { app, tts } = createHarness({
      config: {
        asr: {
          language: 'english'
        }
      }
    });

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .field('transcribeOnly', 'true')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(200);

    expect(response.body.diagnostics.language).toBeNull();
    expect(tts.transcribeFishAudio).toHaveBeenCalledWith(expect.any(Buffer), expect.not.objectContaining({
      language: expect.anything()
    }));
  });

  test('accepts Safari-compatible MP4 audio uploads with MIME parameters', async () => {
    const { app, tts } = createHarness();
    const mp4Audio = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftypM4A ', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00])
    ]);

    await request(app)
      .post('/api/sidekick/asr/transcribe')
      .field('transcribeOnly', 'true')
      .attach('audio', mp4Audio, { filename: 'host.m4a', contentType: 'audio/mp4; codecs=mp4a.40.2' })
      .expect(200);

    expect(tts.transcribeFishAudio).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({
      mimeType: 'audio/mp4'
    }));
  });

  test('rejects uploads over the configured size limit', async () => {
    const { app } = createHarness({ config: { asr: { maxAudioBytes: 4 } } });

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(413);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'ASR_UPLOAD_TOO_LARGE' })
    }));
  });

  test('sanitizes Fish.audio transcription errors and diagnostics without leaking secrets', async () => {
    const secret = 'fish-secret-key';
    const { app } = createHarness({
      ttsPlugin: {
        config: { fishaudioApiKey: secret },
        transcribeFishAudio: jest.fn().mockRejectedValue(new Error(`Fish failed for ${secret}`))
      }
    });

    const response = await request(app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(502);

    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'ASR_TRANSCRIPTION_FAILED',
        message: 'Fish.audio ASR transcription failed'
      }),
      diagnostics: expect.objectContaining({
        lastError: expect.objectContaining({
          code: 'ASR_TRANSCRIPTION_FAILED',
          message: 'Fish.audio ASR transcription failed'
        })
      })
    }));
  });

  test('does not leak downstream host delegation secrets in response or ASR status', async () => {
    const secret = 'sk-live-host-secret-token';
    const returnedHarness = createHarness({
      hostResult: {
        accepted: true,
        delegated: false,
        reason: 'animazingpal-error',
        responded: false,
        error: `AnimazingPal failed with ${secret}`,
        event: {
          message: 'Hallo Chat',
          apiKey: secret
        },
        animazingPalResult: {
          nestedToken: secret
        }
      }
    });

    const returnedResponse = await request(returnedHarness.app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(200);

    expect(JSON.stringify(returnedResponse.body)).not.toContain(secret);
    expect(returnedResponse.body).toEqual(expect.objectContaining({
      success: true,
      delegation: {
        accepted: true,
        delegated: false,
        reason: 'animazingpal-error',
        responded: false,
        blocked: false,
        speechFailed: false,
        speechBlocked: false
      }
    }));
    expect(returnedResponse.body.result).toBeUndefined();

    const returnedStatus = await request(returnedHarness.app)
      .get('/api/sidekick/asr/status')
      .expect(200);
    expect(JSON.stringify(returnedStatus.body)).not.toContain(secret);

    const thrownHarness = createHarness();
    thrownHarness.plugin.processHostSpeechTranscript.mockRejectedValue(new Error(`delegation exploded ${secret}`));

    const thrownResponse = await request(thrownHarness.app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(502);

    expect(JSON.stringify(thrownResponse.body)).not.toContain(secret);
    expect(thrownResponse.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'ASR_DELEGATION_FAILED',
        message: 'Sidekick host speech delegation failed'
      })
    }));

    const thrownStatus = await request(thrownHarness.app)
      .get('/api/sidekick/asr/status')
      .expect(200);
    expect(JSON.stringify(thrownStatus.body)).not.toContain(secret);
    expect(thrownStatus.body.status.lastError).toEqual(expect.objectContaining({
      code: 'ASR_DELEGATION_FAILED',
      message: 'Sidekick host speech delegation failed'
    }));
  });

  test('reports ASR diagnostics counters and readiness status', async () => {
    const { app } = createHarness();

    await request(app)
      .post('/api/sidekick/asr/transcribe')
      .field('transcribeOnly', 'true')
      .attach('audio', audioBuffer(), { filename: 'host.webm', contentType: 'audio/webm' })
      .expect(200);

    await request(app)
      .post('/api/sidekick/asr/transcribe')
      .attach('audio', Buffer.from('not audio'), { filename: 'host.txt', contentType: 'text/plain' })
      .expect(415);

    const response = await request(app)
      .get('/api/sidekick/asr/status')
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      status: expect.objectContaining({
        enabled: true,
        ttsAvailable: true,
        fishConfigured: true,
        ready: true,
        hostPreflight: expect.objectContaining({
          ready: true,
          checks: expect.arrayContaining([
            expect.objectContaining({ id: 'animazingpal.hostPipeline', status: 'ok' })
          ])
        }),
        maxAudioBytes: 1024 * 1024,
        language: 'de',
        lastTranscriptAt: expect.any(String),
        counters: expect.objectContaining({
          requests: 2,
          transcribed: 1,
          rejected: 1,
          delegated: 0
        })
      })
    }));
  });
});
