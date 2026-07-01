/**
 * STT Ticker - ASR Pipeline
 *
 * Transkribiert Audio direkt via TTS-Plugin (Fish.audio ASR Client).
 * Kein Sidekick-Umweg, kein HTTP — nur direkter Plugin-Aufruf.
 */

class AsrPipeline {
  constructor(api, config, logger) {
    this.api = api;
    this.logger = logger;
    this.config = config;

    this.diagnostics = this._createEmptyDiagnostics();
    this.rateLimitBuckets = new Map();
  }

  /**
   * Transkribiert einen Audio-Buffer direkt via TTS-Plugin.
   */
  async transcribe(audioBuffer, options = {}) {
    this.diagnostics.counters.requests += 1;

    if (this._isRateLimited()) {
      throw new Error('Rate limit exceeded');
    }

    const tts = this._getTtsPlugin();
    if (!tts) {
      const err = 'TTS plugin not available — is it enabled?';
      this.logger.error(`STT Ticker: ${err}`);
      this.diagnostics.counters.errors += 1;
      this.diagnostics.lastError = err;
      throw new Error(err);
    }

    if (typeof tts.transcribeFishAudio !== 'function') {
      const err = 'TTS plugin missing transcribeFishAudio method';
      this.logger.error(`STT Ticker: ${err}`);
      this.diagnostics.counters.errors += 1;
      this.diagnostics.lastError = err;
      throw new Error(err);
    }

    try {
      const result = await tts.transcribeFishAudio(audioBuffer, {
        mimeType: options.mimeType,
        filename: options.filename,
        language: options.language,
        timeout: 30000
      });

      if (!result || !result.text) {
        throw new Error('Empty transcription result');
      }

      this.diagnostics.counters.transcribed += 1;
      this.diagnostics.lastTranscriptAt = Date.now();
      this.diagnostics.lastError = null;

      return {
        text: result.text,
        segments: result.segments || [],
        duration: result.duration || 0,
        provider: 'fish.audio',
        confidence: result.confidence
      };
    } catch (error) {
      this.diagnostics.counters.errors += 1;
      this.diagnostics.lastError = error.message;
      this.logger.error(`STT Ticker: Transcription failed: ${error.message}`);
      throw error;
    }
  }

  _getTtsPlugin() {
    return this.api.getPluginInstance?.('tts') || this.api.getPlugin?.('tts') || null;
  }

  _isRateLimited() {
    const now = Date.now();
    const windowMs = this.config.rateLimitWindowMs || 60000;
    const max = this.config.rateLimitMax || 30;

    let bucket = this.rateLimitBuckets.get('ticker');
    if (!bucket) {
      bucket = { count: 0, windowStart: now };
      this.rateLimitBuckets.set('ticker', bucket);
    }

    if (now - bucket.windowStart > windowMs) {
      bucket.count = 0;
      bucket.windowStart = now;
    }

    bucket.count += 1;
    return bucket.count > max;
  }

  recordError(message) {
    this.diagnostics.counters.errors += 1;
    this.diagnostics.lastError = message;
  }

  updateConfig(config) {
    this.config = config;
  }

  getStatus() {
    const tts = this._getTtsPlugin();
    return {
      ttsAvailable: !!tts,
      ttsHasAsr: tts && typeof tts.transcribeFishAudio === 'function',
      diagnostics: { ...this.diagnostics, counters: { ...this.diagnostics.counters } }
    };
  }

  destroy() {
    this.rateLimitBuckets.clear();
  }

  _createEmptyDiagnostics() {
    return {
      counters: { requests: 0, transcribed: 0, errors: 0 },
      lastTranscriptAt: null,
      lastError: null
    };
  }
}

module.exports = AsrPipeline;
