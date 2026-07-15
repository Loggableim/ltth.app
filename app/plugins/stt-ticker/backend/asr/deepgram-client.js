/**
 * STT Ticker - Deepgram ASR Client
 *
 * Official Deepgram SDK adapter for prerecorded audio. The live WebSocket
 * path is managed separately per connected capture socket.
 */

const { DeepgramClient, DeepgramError } = require('@deepgram/sdk');

class DeepgramAsrClient {
  static SERVICE_MAX_AUDIO_BYTES = 2 * 1024 * 1024 * 1024;
  static DEFAULT_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  static MAX_ERROR_MESSAGE_BYTES = 2048;

  static MULTI_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru'];
  static DEFAULT_LANGUAGE_WHITELIST = ['de', 'en'];

  static MODELS = {
    'nova-2': { name: 'Nova-2', multilingual: true, de: true, en: true },
    'nova-3': { name: 'Nova-3', multilingual: true, de: true, en: true },
    'whisper-large': { name: 'Whisper Large (Deepgram-hosted)', multilingual: true, de: true, en: true },
    'whisper-medium': { name: 'Whisper Medium (Deepgram-hosted)', multilingual: true, de: true, en: true }
  };

  constructor(apiKey, logger, config = {}) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('Deepgram API key is required');
    }
    this.apiKey = apiKey.trim();
    this.logger = logger || {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {}
    };
    this.clientFactory = config.clientFactory || ((key) => new DeepgramClient({ apiKey: key }));
    this.timeout = this._resolveTimeout(config.timeout, 30000);
    this.maxAudioBytes = this._resolveMaxAudioBytes(config.maxAudioBytes);
  }

  async transcribe(audioBuffer, options = {}) {
    this._validateAudio(audioBuffer);

    const model = options.model || 'nova-2';
    const language = !options.language || options.language === 'auto'
      ? 'multi'
      : options.language;
    const requestOptions = {
      model,
      language,
      smart_format: true,
      punctuate: true,
      utterances: true,
      utt_split: 1,
      timeoutInSeconds: Math.ceil(this.timeout / 1000),
      maxRetries: 1
    };

    if (options.profanityFilter) requestOptions.profanity_filter = true;
    if (options.diarize) requestOptions.diarize = true;
    if (options.keywords) requestOptions.keywords = options.keywords;

    try {
      const client = this.clientFactory(this.apiKey);
      const response = await client.listen.v1.media.transcribeFile(audioBuffer, requestOptions);
      return this._parseResponse(response, model);
    } catch (error) {
      throw this._normalizeSdkError(error);
    }
  }

  _validateAudio(audioBuffer) {
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      throw new Error('Deepgram ASR audio must be a non-empty Buffer');
    }
    if (audioBuffer.length > this.maxAudioBytes) {
      throw new Error(`Deepgram ASR audio exceeds ${this.maxAudioBytes} bytes`);
    }
  }

  _parseResponse(data, model = 'nova-2') {
    if (!data || typeof data !== 'object') {
      throw new Error('Deepgram ASR malformed response: empty');
    }

    const meta = data.metadata || {};
    const channels = (data.results && data.results.channels) || [];
    if (channels.length === 0) {
      throw new Error('Deepgram ASR malformed response: no channels');
    }
    const alternative = (channels[0].alternatives || [])[0];
    if (!alternative || typeof alternative.transcript !== 'string') {
      throw new Error('Deepgram ASR malformed response: no transcript');
    }

    const text = alternative.transcript.trim();
    if (!text) {
      throw new Error('Empty transcription result');
    }

    const words = alternative.words || [];
    const segments = this._wordsToSegments(words, meta.duration || 0);

    let language = null;
    if (channels[0].detected_language) {
      language = String(channels[0].detected_language).toLowerCase().slice(0, 2);
    } else if (meta.language && typeof meta.language === 'string') {
      language = meta.language.toLowerCase().slice(0, 2);
    } else if (meta.detected_language) {
      language = String(meta.detected_language).toLowerCase().slice(0, 2);
    }

    return {
      text,
      segments,
      duration: meta.duration || 0,
      language,
      confidence: alternative.confidence,
      provider: 'deepgram',
      model,
      requestId: meta.request_id
    };
  }

  _wordsToSegments(words) {
    if (!Array.isArray(words) || words.length === 0) return [];

    const segments = [];
    let current = { text: '', start: 0, end: 0, confidence: 0, wordCount: 0 };

    for (const word of words) {
      if (typeof word.start !== 'number' || typeof word.end !== 'number') continue;

      const isNewSegment = current.wordCount === 0 || (word.start - current.end) > 0.8;
      if (isNewSegment && current.wordCount > 0) {
        segments.push({
          text: current.text.trim(),
          start: current.start,
          end: current.end,
          confidence: current.confidence / current.wordCount
        });
        current = { text: '', start: word.start, end: word.end, confidence: 0, wordCount: 0 };
      }

      current.text += (current.text ? ' ' : '') + (word.punctuated_word || word.word);
      current.end = word.end;
      current.confidence += typeof word.confidence === 'number' ? word.confidence : 0;
      current.wordCount++;
    }

    if (current.wordCount > 0) {
      segments.push({
        text: current.text.trim(),
        start: current.start,
        end: current.end,
        confidence: current.confidence / current.wordCount
      });
    }

    return segments;
  }

  _normalizeSdkError(error) {
    const status = error?.statusCode || error?.status || error?.response?.status;
    const body = error?.body || error?.response?.data;
    const message = body
      ? this._extractErrorMessage(body)
      : (error?.message || 'Unknown error');

    if (status || error instanceof DeepgramError) {
      const normalized = new Error(`Deepgram ASR API error (${status || 'unknown'}): ${message}`);
      normalized.deepgramStatus = status ? Number(status) : null;
      normalized.deepgramApiError = true;
      normalized.deepgramMessage = message;
      return normalized;
    }
    if (error?.request || error?.cause || error instanceof TypeError) {
      const normalized = new Error(`Deepgram ASR network error: ${message}`);
      normalized.deepgramNetworkError = true;
      normalized.deepgramMessage = message;
      return normalized;
    }
    return error;
  }

  _extractErrorMessage(data) {
    if (!data) return 'Unknown error';
    if (typeof data === 'string') return data.slice(0, DeepgramAsrClient.MAX_ERROR_MESSAGE_BYTES);
    if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
      const text = Buffer.from(data)
        .toString('utf8')
        .slice(0, DeepgramAsrClient.MAX_ERROR_MESSAGE_BYTES);
      try {
        const parsed = JSON.parse(text);
        return parsed.err_msg || parsed.message || parsed.error || text;
      } catch (error) {
        return text;
      }
    }
    const message = data.err_msg || data.message || data.error || JSON.stringify(data);
    return String(message).slice(0, DeepgramAsrClient.MAX_ERROR_MESSAGE_BYTES);
  }

  _resolveTimeout(value, fallback) {
    if (value === undefined) return fallback;
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Deepgram ASR timeout must be a finite positive number');
    }
    return value;
  }

  _resolveMaxAudioBytes(value) {
    if (value === undefined) return DeepgramAsrClient.DEFAULT_MAX_AUDIO_BYTES;
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Deepgram ASR maxAudioBytes must be a finite positive number');
    }
    return Math.min(value, DeepgramAsrClient.SERVICE_MAX_AUDIO_BYTES);
  }

  async testConnection() {
    let connection = null;
    try {
      const client = this.clientFactory(this.apiKey);
      connection = await client.listen.v1.connect({
        model: 'nova-2',
        language: 'de',
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
        interim_results: false,
        reconnectAttempts: 0,
        connectionTimeoutInSeconds: Math.max(1, Math.ceil(this.timeout / 1000)),
        Authorization: `Token ${this.apiKey}`
      });
      connection.connect();
      await connection.waitForOpen();
      connection.sendCloseStream({ type: 'CloseStream' });
      return { ok: true, status: 200 };
    } catch (error) {
      const normalized = this._normalizeSdkError(error);
      return {
        ok: false,
        status: normalized.deepgramStatus || null,
        message: normalized.deepgramMessage || normalized.message || 'Unknown error'
      };
    } finally {
      try { connection?.close(); } catch (error) { /* best effort */ }
    }
  }
}

module.exports = DeepgramAsrClient;
