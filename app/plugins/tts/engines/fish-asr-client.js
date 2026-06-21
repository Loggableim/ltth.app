const axios = require('axios');
const msgpack = require('@msgpack/msgpack');
const FormData = require('form-data');

class FishAsrClient {
  static SERVICE_MAX_AUDIO_BYTES = 20 * 1024 * 1024;
  static DEFAULT_MAX_AUDIO_BYTES = FishAsrClient.SERVICE_MAX_AUDIO_BYTES;
  static MAX_RESPONSE_BYTES = 1024 * 1024;
  static MAX_REQUEST_BODY_BYTES = FishAsrClient.SERVICE_MAX_AUDIO_BYTES + 1024 * 1024;
  static MAX_ERROR_MESSAGE_BYTES = 2048;
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
    this.timeout = this._resolveTimeout(config.timeout, 30000);
    this.maxAudioBytes = this._resolveConfiguredMaxAudioBytes(config.maxAudioBytes);
  }

  async transcribe(audioBuffer, options = {}) {
    const maxAudioBytes = this._resolveCallMaxAudioBytes(options.maxAudioBytes);
    const timeout = this._resolveTimeout(options.timeout, this.timeout);
    this._validateAudio(audioBuffer, maxAudioBytes);

    const requestOptions = this._normalizeRequestOptions(options);

    try {
      return this._decodeTranscriptionResponse(await this._postMessagePack(audioBuffer, requestOptions, timeout));
    } catch (error) {
      const normalizedError = this._normalizeRequestError(error);
      if (!this._shouldRetryAsMultipart(normalizedError)) {
        throw normalizedError;
      }

      this.logger.warn(`Fish.audio ASR MessagePack request failed (${normalizedError.fishAudioStatus}); retrying multipart form-data`);
      try {
        return this._decodeTranscriptionResponse(await this._postMultipart(audioBuffer, requestOptions, timeout));
      } catch (multipartError) {
        throw this._normalizeRequestError(multipartError);
      }
    }
  }

  async _postMessagePack(audioBuffer, options, timeout) {
    const payload = {
      audio: audioBuffer,
      ignore_timestamps: options.ignoreTimestamps
    };

    if (options.language) {
      payload.language = options.language;
    }

    return axios.post(this.apiUrl, msgpack.encode(payload), {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/msgpack',
        Accept: 'application/json, application/msgpack'
      },
      responseType: 'arraybuffer',
      timeout,
      maxContentLength: FishAsrClient.MAX_RESPONSE_BYTES,
      maxBodyLength: FishAsrClient.MAX_REQUEST_BODY_BYTES
    });
  }

  async _postMultipart(audioBuffer, options, timeout) {
    const form = new FormData();
    form.append('audio', audioBuffer, {
      filename: options.filename || 'audio.webm',
      contentType: options.mimeType || 'application/octet-stream',
      knownLength: audioBuffer.length
    });
    if (options.language) form.append('language', options.language);
    form.append('ignore_timestamps', String(options.ignoreTimestamps));

    return axios.post(this.apiUrl, form, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json, application/msgpack',
        ...form.getHeaders()
      },
      responseType: 'arraybuffer',
      timeout,
      maxContentLength: FishAsrClient.MAX_RESPONSE_BYTES,
      maxBodyLength: FishAsrClient.MAX_REQUEST_BODY_BYTES
    });
  }

  _decodeTranscriptionResponse(response) {
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(`Fish.audio ASR API error (${response.status}): ${this._extractErrorMessage(response.data)}`);
      error.fishAudioStatus = Number(response.status);
      error.fishAudioApiError = true;
      throw error;
    }

    return this._normalizeResponse(this._decodeResponse(response.data));
  }

  _normalizeRequestOptions(options) {
    return {
      language: options.language === undefined ? null : this._validateLanguage(options.language),
      ignoreTimestamps: this._resolveIgnoreTimestamps(options.ignoreTimestamps ?? options.ignore_timestamps),
      mimeType: this._validateMimeType(options.mimeType),
      filename: this._validateFilename(options.filename)
    };
  }

  _resolveIgnoreTimestamps(value) {
    if (value === undefined || value === null) return true;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    throw new Error('Fish.audio ASR ignore_timestamps must be a boolean');
  }

  _validateMimeType(mimeType) {
    if (mimeType === undefined || mimeType === null || mimeType === '') return null;
    if (typeof mimeType !== 'string') {
      throw new Error('Fish.audio ASR mimeType must be a string when provided');
    }
    return mimeType.trim().slice(0, 120) || null;
  }

  _validateFilename(filename) {
    if (filename === undefined || filename === null || filename === '') return null;
    if (typeof filename !== 'string') {
      throw new Error('Fish.audio ASR filename must be a string when provided');
    }
    return filename.trim().replace(/[^\w .()-]/g, '_').slice(0, 160) || null;
  }

  _normalizeRequestError(error) {
    if (error?.fishAudioApiError || error?.fishAudioNetworkError) return error;

    if (error?.response) {
      const status = error.response.status || 'unknown';
      const normalized = new Error(`Fish.audio ASR API error (${status}): ${this._extractErrorMessage(error.response.data)}`);
      normalized.fishAudioStatus = Number(status);
      normalized.fishAudioApiError = true;
      return normalized;
    }

    if (error?.request) {
      const normalized = new Error(`Fish.audio ASR network error: ${error.message}`);
      normalized.fishAudioNetworkError = true;
      return normalized;
    }

    return error;
  }

  _shouldRetryAsMultipart(error) {
    return error?.fishAudioApiError && [400, 415, 422].includes(error.fishAudioStatus);
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

  _resolveTimeout(value, fallback) {
    if (value === undefined) {
      return fallback;
    }

    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Fish.audio ASR timeout must be a finite positive number');
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

    response.segments.forEach((segment, index) => {
      if (
        !segment ||
        typeof segment !== 'object' ||
        typeof segment.text !== 'string' ||
        typeof segment.start !== 'number' ||
        !Number.isFinite(segment.start) ||
        typeof segment.end !== 'number' ||
        !Number.isFinite(segment.end) ||
        segment.end < segment.start
      ) {
        throw new Error(`Fish.audio ASR malformed response: segment ${index}`);
      }
    });

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
      return this._capErrorMessage(data);
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
          return this._capErrorMessage(responseBuffer.toString('utf8') || 'Unknown error');
        }
      }
    }

    return this._capErrorMessage(data.message || data.error || JSON.stringify(data));
  }

  _capErrorMessage(message) {
    const sanitized = String(message).replace(/[\u0000-\u001F\u007F]/g, ' ');
    const bytes = Buffer.from(sanitized, 'utf8');

    if (bytes.length <= FishAsrClient.MAX_ERROR_MESSAGE_BYTES) {
      return sanitized;
    }

    return `${bytes.slice(0, FishAsrClient.MAX_ERROR_MESSAGE_BYTES).toString('utf8')}... [truncated]`;
  }
}

module.exports = FishAsrClient;
