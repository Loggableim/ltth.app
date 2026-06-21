const axios = require('axios');
const msgpack = require('@msgpack/msgpack');

class FishAsrClient {
  static DEFAULT_MAX_AUDIO_BYTES = 20 * 1024 * 1024;

  constructor(apiKey, logger, config = {}) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('Fish.audio ASR API key is required');
    }

    this.apiKey = apiKey.trim();
    this.logger = logger || {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    };
    this.apiUrl = config.apiUrl || 'https://api.fish.audio/v1/asr';
    this.timeout = config.timeout || 30000;
    this.maxAudioBytes = this._resolveMaxAudioBytes(config.maxAudioBytes);
  }

  async transcribe(audioBuffer, options = {}) {
    const maxAudioBytes = this._resolveMaxAudioBytes(options.maxAudioBytes, this.maxAudioBytes);
    this._validateAudio(audioBuffer, maxAudioBytes);

    const payload = {
      audio: audioBuffer
    };

    if (options.language !== undefined) {
      if (typeof options.language !== 'string') {
        throw new Error('Fish.audio ASR language must be a string when provided');
      }

      const language = options.language.trim();
      if (language) {
        payload.language = language;
      }
    }

    try {
      const response = await axios.post(this.apiUrl, msgpack.encode(payload), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/msgpack',
          Accept: 'application/json, application/msgpack'
        },
        responseType: 'arraybuffer',
        timeout: options.timeout || this.timeout
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Fish.audio ASR API error (${response.status}): ${this._extractErrorMessage(response.data)}`);
      }

      return this._normalizeResponse(this._decodeResponse(response.data));
    } catch (error) {
      if (error.response) {
        const status = error.response.status || 'unknown';
        throw new Error(`Fish.audio ASR API error (${status}): ${this._extractErrorMessage(error.response.data)}`);
      }

      if (error.request) {
        throw new Error(`Fish.audio ASR network error: ${error.message}`);
      }

      throw error;
    }
  }

  _resolveMaxAudioBytes(value, fallback = FishAsrClient.DEFAULT_MAX_AUDIO_BYTES) {
    const defaultMax = Math.min(fallback, FishAsrClient.DEFAULT_MAX_AUDIO_BYTES);
    if (!Number.isFinite(value) || value <= 0) {
      return defaultMax;
    }

    return Math.min(value, defaultMax);
  }

  _validateAudio(audioBuffer, maxAudioBytes) {
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      throw new Error('Fish.audio ASR audio must be a non-empty Buffer');
    }

    if (audioBuffer.length > maxAudioBytes) {
      throw new Error(`Fish.audio ASR audio exceeds ${maxAudioBytes} bytes`);
    }
  }

  _decodeResponse(data) {
    if (data && typeof data === 'object' && !Buffer.isBuffer(data) && !(data instanceof Uint8Array)) {
      return data;
    }

    const responseBuffer = Buffer.from(data || []);
    if (responseBuffer.length === 0) {
      throw new Error('Fish.audio ASR malformed response: empty body');
    }

    try {
      return msgpack.decode(responseBuffer);
    } catch (msgpackError) {
      try {
        return JSON.parse(responseBuffer.toString('utf8'));
      } catch (jsonError) {
        throw new Error('Fish.audio ASR malformed response: unable to decode response body');
      }
    }
  }

  _normalizeResponse(response) {
    if (!response || typeof response !== 'object' || typeof response.text !== 'string') {
      throw new Error('Fish.audio ASR malformed response: missing text');
    }

    return {
      text: response.text.trim(),
      duration: response.duration,
      segments: Array.isArray(response.segments) ? response.segments : [],
      provider: 'fish.audio'
    };
  }

  _extractErrorMessage(data) {
    if (!data) {
      return 'Unknown error';
    }

    if (typeof data === 'string') {
      return data;
    }

    if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
      const responseBuffer = Buffer.from(data);

      try {
        const decoded = msgpack.decode(responseBuffer);
        return this._extractErrorMessage(decoded);
      } catch (msgpackError) {
        try {
          return this._extractErrorMessage(JSON.parse(responseBuffer.toString('utf8')));
        } catch (jsonError) {
          return responseBuffer.toString('utf8') || 'Unknown error';
        }
      }
    }

    return data.message || data.error || JSON.stringify(data);
  }
}

module.exports = FishAsrClient;
