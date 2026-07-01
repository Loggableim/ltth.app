/**
 * STT Ticker - Deepgram ASR Client
 *
 * Direkter REST-Aufruf an Deepgram's /v1/listen Endpoint.
 * Auth: Authorization: Token <API_KEY>
 * Endpoint: POST https://api.deepgram.com/v1/listen
 * Body: Multipart mit audio-File + Query-Params (model, language, etc.)
 *
 * Key wird lokal gehalten — niemals ins Git committed.
 * Plugin-Config-Pfad: app/plugins/stt-ticker/data/deepgram.key
 *                     ODER Config.asr.deepgramApiKey (aus UI)
 *
 * WICHTIG: Dieser Key ist UNABHÄNGIG vom TTS-Plugin (fishaudioApiKey).
 *           Er wird in der stt-ticker Plugin-Config gespeichert.
 */

const axios = require('axios');
const FormData = require('form-data');

class DeepgramAsrClient {
  // Deepgram's harte Limits
  static SERVICE_MAX_AUDIO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
  static DEFAULT_MAX_AUDIO_BYTES = 25 * 1024 * 1024;       // 25 MB conservative
  static MAX_ERROR_MESSAGE_BYTES = 2048;

  // Sprachen die der 'multi'-Modus von Deepgram Nova-2 erkennt.
  // Alles was NICHT hier ist (Chinesisch, Japanisch, Koreanisch, Thai, …)
  // kann Deepgram mit language='multi' nicht ausgeben → keine Halluzinationen.
  // Quelle: https://developers.deepgram.com/docs/language-multi
  static MULTI_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru'];
  // Default-Whitelist für Auto-Detection: nur DE + EN.
  // User kann in der Config erweitern, aber sicher-default = DE+EN.
  static DEFAULT_LANGUAGE_WHITELIST = ['de', 'en'];

  // Supported models — nova-2 ist Standard, multilingual für DE+EN
  static MODELS = {
    'nova-2': { name: 'Nova-2', multilingual: true, de: true, en: true },
    'nova-3': { name: 'Nova-3', multilingual: true, de: true, en: true }, // wenn verfügbar
    'whisper-large': { name: 'Whisper Large (Deepgram-hosted)', multilingual: true, de: true, en: true },
    'whisper-medium': { name: 'Whisper Medium (Deepgram-hosted)', multilingual: true, de: true, en: true },
  };

  constructor(apiKey, logger, config = {}) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('Deepgram API key is required');
    }
    this.apiKey = apiKey.trim();
    this.logger = logger || {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {}
    };
    this.apiUrl = config.apiUrl || 'https://api.deepgram.com/v1/listen';
    this.timeout = this._resolveTimeout(config.timeout, 30000);
    this.maxAudioBytes = this._resolveMaxAudioBytes(config.maxAudioBytes);
  }

  /**
   * Transkribiert einen Audio-Buffer.
   * @param {Buffer} audioBuffer
   * @param {Object} options { mimeType, filename, language, model, smartFormat, profanityFilter, ... }
   * @returns {Object} { text, segments, duration, language, confidence, provider }
   */
  async transcribe(audioBuffer, options = {}) {
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      throw new Error('Deepgram ASR audio must be a non-empty Buffer');
    }
    if (audioBuffer.length > this.maxAudioBytes) {
      throw new Error(`Deepgram ASR audio exceeds ${this.maxAudioBytes} bytes`);
    }

    const model = options.model || 'nova-2';
    const language = options.language || 'de'; // Default Deutsch wenn nix
    const params = this._buildQueryParams({ ...options, model, language });

    const form = new FormData();
    form.append('audio', audioBuffer, {
      filename: options.filename || 'audio.webm',
      contentType: options.mimeType || 'application/octet-stream',
      knownLength: audioBuffer.length
    });

    const url = this.apiUrl + '?' + new URLSearchParams(params).toString();

    try {
      const response = await axios.post(url, form, {
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          ...form.getHeaders()
        },
        timeout: this.timeout,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 100 * 1024 * 1024
      });
      return this._parseResponse(response.data);
    } catch (error) {
      throw this._normalizeError(error);
    }
  }

  _buildQueryParams(options) {
    const params = {
      model: options.model || 'nova-2',
      smart_format: 'true',
      punctuate: 'true',
      utterances: 'true',
      utt_split: '1.0',     // neue Utterance bei 1s Pause
      encoding: options.encoding || 'auto', // Deepgram erkennt automatisch
      // FILTER: Chinesisch, Japanisch, Koreanisch, Thai, Arabisch etc. komplett ausschließen.
      // Sonst halluziniert Deepgram bei kurzen/leisen Chunks in exotische Sprachen.
      threshold: options.threshold || '0.3',  // Confidence-Floor (0..1)
    };

    if (options.language) {
      // Deepgram nimmt ISO-639-1 (de, en) oder "multi"
      if (options.language === 'multi' || options.language === 'auto') {
        // 'multi' ist der korrekte Modus für DE+EN+ES+FR+...
        // Deepgram wählt dann nur aus den 7 unterstützten Sprachen
        params.language = 'multi';
      } else {
        // Explizit eine Sprache → festschnüren, kein Auto-Detect
        params.language = options.language;
      }
    } else {
      // Kein language → 'multi'-Modus als sicherer Default
      // (verhindert Auto-Detect aus 36 Sprachen → Halluzinationen)
      params.language = 'multi';
    }

    if (options.profanityFilter) params.profanity_filter = 'true';
    if (options.diarize) params.diarize = 'true';
    if (options.keywords) {
      params.keywords = Array.isArray(options.keywords)
        ? options.keywords.join('&keywords=')
        : options.keywords;
    }

    return params;
  }

  _parseResponse(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Deepgram ASR malformed response: empty');
    }

    // Deepgram response: { metadata: { transaction_key, request_id, sha256, created, language, ... }, results: { channels: [{ alternatives: [{ transcript, confidence, words: [...] }] }] } }

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

    // Words in Segmente umwandeln (für Sprechpausen-Detection)
    const words = alternative.words || [];
    const segments = this._wordsToSegments(words, meta.duration || 0);

    // Deepgram liefert language in metadata wenn detect_language=true
    let language = null;
    if (meta.language && typeof meta.language === 'string') {
      // Deepgram: "de" oder "en-US" → normalisieren auf 2-stellig
      language = meta.language.toLowerCase().slice(0, 2);
    } else if (meta.detected_language) {
      language = String(meta.detected_language).toLowerCase().slice(0, 2);
    }

    return {
      text,
      segments,
      duration: meta.duration || 0,
      language,        // kann null sein wenn detect_language deaktiviert
      confidence: alternative.confidence,
      provider: 'deepgram',
      model: meta.model || 'nova-2',
      requestId: meta.request_id
    };
  }

  /**
   * Konvertiert Deepgram's word-level results in Segmente.
   * Trennt an langen Pausen (>1s) zwischen Wörtern.
   */
  _wordsToSegments(words, totalDuration) {
    if (!Array.isArray(words) || words.length === 0) return [];

    const segments = [];
    let current = { text: '', start: 0, end: 0, confidence: 0, wordCount: 0 };

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (typeof w.start !== 'number' || typeof w.end !== 'number') continue;

      // Neue Segment wenn: erste Word, oder große Pause zum vorherigen
      // 0.8s = typische Sprechpause zwischen Sätzen
      const isNewSegment = current.wordCount === 0 ||
        (w.start - current.end) > 0.8;

      if (isNewSegment && current.wordCount > 0) {
        segments.push({
          text: current.text.trim(),
          start: current.start,
          end: current.end,
          confidence: current.confidence / current.wordCount
        });
        current = { text: '', start: w.start, end: w.end, confidence: 0, wordCount: 0 };
      }

      current.text += (current.text ? ' ' : '') + (w.punctuated_word || w.word);
      current.end = w.end;
      current.confidence += (typeof w.confidence === 'number' ? w.confidence : 0);
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

  _normalizeError(error) {
    if (error?.response) {
      const status = error.response.status || 'unknown';
      const msg = this._extractErrorMessage(error.response.data);
      const err = new Error(`Deepgram ASR API error (${status}): ${msg}`);
      err.deepgramStatus = Number(status);
      err.deepgramApiError = true;
      return err;
    }
    if (error?.request) {
      const err = new Error(`Deepgram ASR network error: ${error.message}`);
      err.deepgramNetworkError = true;
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
        return parsed.err_msg || parsed.message || parsed.error || s;
      } catch (e) {
        return s;
      }
    }
    return data.err_msg || data.message || data.error || JSON.stringify(data);
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

  /**
   * Health-check: testet ob der API-Key gültig ist.
   * Ruft /v1/projects (oder /v1/usage) auf — nur GET mit Auth.
   */
  async testConnection() {
    try {
      const res = await axios.get('https://api.deepgram.com/v1/usage', {
        headers: { 'Authorization': `Token ${this.apiKey}` },
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

module.exports = DeepgramAsrClient;
