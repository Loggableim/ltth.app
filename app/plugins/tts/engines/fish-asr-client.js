const axios = require('axios');
const msgpack = require('@msgpack/msgpack');

class FishAsrClient {
  static SERVICE_MAX_AUDIO_BYTES = 20 * 1024 * 1024;
  static DEFAULT_MAX_AUDIO_BYTES = FishAsrClient.SERVICE_MAX_AUDIO_BYTES;
  static LANGUAGE_PATTERN = /^[a-zA-Z]{2,3}(?:[-_][a-zA-Z]{2,4})?$/;

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
    this.maxAudioBytes = this._resolveConfiguredMaxAudioBytes(config.maxAudioBytes);
  }

  async transcribe(audioBuffer, options = {}) {
    const maxAudioBytes = this._resolveCallMaxAudioBytes(options.maxAudioBytes);
    this._validateAudio(audioBuffer, maxAudioBytes);

    const payload = {
      audio: audioBuffer
    };

    if (options.language !== undefined) {
      payload.language = this._validateLanguage(options.language);
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

  _resolveConfiguredMaxAudioBytes(value) {
    if (value === undefined) {
      return FishAsrClient.SERVICE_MAX_AUDIO_BYTES;
    }

    if (!Number.isFinite(value) || value <= 0 || value > FishAsrClient.SERVICE_MAX_AUDIO_BYTES) {
      throw new Error(`Fish.audio ASR maxAudioBytes must be between 1 and ${FishAsrClient.SERVICE_MAX_AUDIO_BYTES} bytes`);
    }

    return value;
  }

  _resolveCallMaxAudioBytes(value) {
    if (value === undefined) {
      return this.maxAudioBytes;
    }

    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Fish.audio ASR maxAudioBytes must be between 1 and ${this.maxAudioBytes} bytes`);
    }

    if (value > this.maxAudioBytes) {
      throw new Error(`Fish.audio ASR maxAudioBytes cannot exceed configured maxAudioBytes of ${this.maxAudioBytes} bytes`);
    }

    return value;
  }

  _validateAudio(audioBuffer, maxAudioBytes) {
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      throw new Error('Fish.audio ASR audio must be a non-empty Buffer');
    }

    if (audioBuffer.length > maxAudioBytes) {
      throw new Error(`Fish.audio ASR audio exceeds ${maxAudioBytes} bytes`);
    }
  }

  _validateLanguage(language) {
    if (typeof language !== 'string') {
      throw new Error('Fish.audio ASR language must be a string when provided');
    }

    const trimmedLanguage = language.trim();
    if (trimmedLanguage.length < 1 || trimmedLanguage.length > 16) {
      throw new Error('Fish.audio ASR language must be 1-16 characters');
    }

    if (!FishAsrClient.LANGUAGE_PATTERN.test(trimmedLanguage)) {
      throw new Error('Fish.audio ASR language must be an ISO-style language tag');
    }

    return trimmedLanguage;
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

    if (typeof response.duration !== 'number' || !Number.isFinite(response.duration)) {
      throw new Error('Fish.audio ASR malformed response: duration');
    }

    if (!Array.isArray(response.segments)) {
      throw new Error('Fish.audio ASR malformed response: segments');
    }

    return {
      text: response.text.trim(),
      duration: response.duration,
      segments: response.segments,
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
