/**
 * STT Ticker - ElevenLabs ASR Client
 *
 * Direkter REST-Aufruf an ElevenLabs Speech-to-Text API.
 * Auth: xi-api-key Header
 * Endpoint: POST https://api.elevenlabs.io/v1/speech-to-text
 * Body: Multipart mit audio-File
 *
 * Key wird lokal gehalten — niemals ins Git committed.
 * Gespeichert in Plugin-Config als asr.elevenlabsApiKey.
 */

const axios = require('axios');
const FormData = require('form-data');

class ElevenLabsAsrClient {
  static SERVICE_MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100 MB
  static DEFAULT_MAX_AUDIO_BYTES = 25 * 1024 * 1024;  // 25 MB

  static MODELS = {
    'scribe_v2': { name: 'Scribe Realtime v2', multilingual: true },
    'eleven_turbo_v2_5': { name: 'Eleven Turbo v2.5', multilingual: true },
    'eleven_turbo_v2': { name: 'Eleven Turbo v2', multilingual: true },
    'eleven_multilingual_v2': { name: 'Eleven Multilingual v2', multilingual: true },
    'eleven_monolingual_v1': { name: 'Eleven Monolingual v1', multilingual: false }
  };

  constructor(apiKey, logger, config = {}) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('ElevenLabs API key is required');
    }
    this.apiKey = apiKey.trim();
    this.logger = logger || {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {}
    };
    this.apiUrl = config.apiUrl || 'https://api.elevenlabs.io/v1/speech-to-text';
    this.timeout = this._resolveTimeout(config.timeout, 30000);
    this.maxAudioBytes = this._resolveMaxAudioBytes(config.maxAudioBytes);
  }

  /**
   * Transkribiert einen Audio-Buffer.
   * @param {Buffer} audioBuffer
   * @param {Object} options { mimeType, filename, language, model }
   * @returns {Object} { text, segments, duration, language, confidence, provider }
   */
  async transcribe(audioBuffer, options = {}) {
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      throw new Error('ElevenLabs ASR audio must be a non-empty Buffer');
    }
    if (audioBuffer.length > this.maxAudioBytes) {
      throw new Error(`ElevenLabs ASR audio exceeds ${this.maxAudioBytes} bytes`);
    }

    const model = options.model || 'eleven_turbo_v2_5';

    const form = new FormData();
    form.append('audio', audioBuffer, {
      filename: options.filename || 'audio.webm',
      contentType: options.mimeType || 'application/octet-stream',
      knownLength: audioBuffer.length
    });
    form.append('model_id', model);

    try {
      const response = await axios.post(this.apiUrl, form, {
        headers: {
          'xi-api-key': this.apiKey,
          ...form.getHeaders()
        },
        timeout: this.timeout,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 100 * 1024 * 1024
      });
      return this._parseResponse(response.data, model);
    } catch (error) {
      throw this._normalizeError(error);
    }
  }

  _parseResponse(data, model) {
    if (!data || typeof data !== 'object') {
      throw new Error('ElevenLabs ASR malformed response: empty');
    }

    // ElevenLabs response: { text: "...", language: "de", language_probability: 0.99, ... }
    const text = String(data.text || '').trim();
    if (!text) {
      throw new Error('Empty transcription result');
    }

    let language = null;
    if (data.language && typeof data.language === 'string') {
      language = data.language.toLowerCase().slice(0, 2);
    }

    return {
      text,
      segments: [], // ElevenLabs liefert keine Wort-Level-Segmente
      duration: data.audio_duration || 0,
      language,
      confidence: data.language_probability || null,
      provider: 'elevenlabs',
      model: model,
      requestId: data.request_id || null
    };
  }

  _normalizeError(error) {
    if (error?.response) {
      const status = error.response.status || 'unknown';
      const msg = this._extractErrorMessage(error.response.data);
      const err = new Error(`ElevenLabs ASR API error (${status}): ${msg}`);
      err.elevenlabsStatus = Number(status);
      err.elevenlabsApiError = true;
      return err;
    }
    if (error?.request) {
      const err = new Error(`ElevenLabs ASR network error: ${error.message}`);
      err.elevenlabsNetworkError = true;
      return err;
    }
    return error;
  }

  _extractErrorMessage(data) {
    if (!data) return 'Unknown error';
    if (typeof data === 'string') return data;
    if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
      const s = Buffer.from(data).toString('utf8');
      try {
        const parsed = JSON.parse(s);
        return parsed.detail?.message || parsed.detail || parsed.message || parsed.error || s;
      } catch (e) {
        return s;
      }
    }
    return data.detail?.message || data.detail || data.message || data.error || JSON.stringify(data);
  }

  _resolveTimeout(value, fallback) {
    if (value === undefined) return fallback;
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('ElevenLabs ASR timeout must be a finite positive number');
    }
    return value;
  }

  _resolveMaxAudioBytes(value) {
    if (value === undefined) return ElevenLabsAsrClient.DEFAULT_MAX_AUDIO_BYTES;
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('ElevenLabs ASR maxAudioBytes must be a finite positive number');
    }
    return Math.min(value, ElevenLabsAsrClient.SERVICE_MAX_AUDIO_BYTES);
  }

  /**
   * Health-check: testet ob der API-Key gültig ist.
   * Ruft GET /v1/user ab — nur Auth-Check, kein Credit-Verbrauch.
   */
  async testConnection() {
    try {
      const res = await axios.get('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': this.apiKey },
        timeout: 10000
      });
      return { ok: true, status: res.status, data: res.data };
    } catch (error) {
      return {
        ok: false,
        status: error?.response?.status,
        message: this._extractErrorMessage(error?.response?.data) || error.message
      };
    }
  }
}

module.exports = ElevenLabsAsrClient;
