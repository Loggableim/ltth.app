const express = require('express');
const request = require('supertest');
const SidekickPlugin = require('../plugins/sidekick/main');

function createApi(app, ttsPlugin = null) {
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
    getPluginInstance: jest.fn((pluginId) => (pluginId === 'tts' ? ttsPlugin : null)),
    getPlugin: jest.fn((pluginId) => (pluginId === 'tts' ? ttsPlugin : null)),
    log: jest.fn()
  };
}

function createHarness({ config = {}, ttsPlugin = null, transcriptResult, hostResult } = {}) {
  const app = express();
  const tts = ttsPlugin || {
    config: { fishaudioApiKey: 'fish-secret-key' },
    transcribeFishAudio: jest.fn().mockResolvedValue(transcriptResult || {
      text: 'Hallo Chat, hört ihr mich?',
      confidence: 0.91,
      provider: 'fish.audio'
    })
  };
  const api = createApi(app, tts);
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
  return { app, api, plugin, tts };
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
      transcript: expect.objectContaining({ text: 'Hallo Chat, hört ihr mich?' })
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
