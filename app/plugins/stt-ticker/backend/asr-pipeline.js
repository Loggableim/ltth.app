/**
 * STT Ticker - ASR Pipeline
 *
 * Transkribiert Audio über einen wählbaren Provider:
 *  - 'fish.audio'  → via TTS-Plugin (transcribeFishAudio), Default
 *  - 'deepgram'    → direkter REST-Call (DeepgramAsrClient)
 *  - 'auto'        → Deepgram wenn key vorhanden, sonst Fish.audio
 *
 * Sprache:
 *  - mode='fixed' → übergibt languageFixed an Provider
 *  - mode='auto'  → sendet KEIN language-param → Provider macht Auto-Detect
 *  - Heuristische Nach-Klassifikation des Textes (lang-detect.js) für Overlay-Routing
 */

const fs = require('fs');
const path = require('path');
const { detectLanguage } = require('./lang-detect');
const { SUPPORTED_SOURCE_LANGUAGES } = require('./config');
const DeepgramAsrClient = require('./asr/deepgram-client');
const ElevenLabsAsrClient = require('./asr/elevenlabs-client');

const SUPPORTED_SOURCE_LANGUAGE_SET = new Set(SUPPORTED_SOURCE_LANGUAGES);
const SCRIPT_PATTERNS = {
  arabic: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u,
  cyrillic: /[\u0400-\u052F]/u,
  greek: /[\u0370-\u03FF\u1F00-\u1FFF]/u,
  han: /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u,
  hangul: /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/u,
  hebrew: /[\u0590-\u05FF]/u,
  hiragana: /[\u3040-\u309F]/u,
  katakana: /[\u30A0-\u30FF\u31F0-\u31FF]/u,
  thai: /[\u0E00-\u0E7F]/u
};
const LANGUAGE_SCRIPTS = {
  ar: ['arabic'], el: ['greek'], he: ['hebrew'],
  ja: ['han', 'hiragana', 'katakana'], ko: ['hangul'],
  ru: ['cyrillic'], th: ['thai'], uk: ['cyrillic'], zh: ['han']
};

class AsrPipeline {
  constructor(api, config, logger) {
    this.api = api;
    this.logger = logger;
    this.config = config;

    this.diagnostics = this._createEmptyDiagnostics();
    this.rateLimitBuckets = new Map();
  }

  /**
   * Transkribiert einen Audio-Buffer über den konfigurierten Provider.
   * @param {Buffer} audioBuffer
   * @param {Object} options { mimeType, filename, language }
   * @returns {Object} { text, segments, duration, provider, confidence, language, languageSource, requestId }
   */
  async transcribe(audioBuffer, options = {}) {
    this.diagnostics.counters.requests += 1;

    if (this._isRateLimited()) {
      throw new Error('Rate limit exceeded');
    }

    const provider = this._resolveProvider();

    // Sprache-Auflösung: nur bei mode=fixed an Provider senden
    const asrCfg = this.config.asr || {};
    let apiLanguage = undefined;
    if (asrCfg.languageMode === 'fixed' && asrCfg.languageFixed) {
      apiLanguage = asrCfg.languageFixed;
    } else if (options.language) {
      apiLanguage = options.language;
    }

    try {
      let result;
      if (provider === 'deepgram') {
        result = await this._transcribeDeepgram(audioBuffer, options, apiLanguage, asrCfg);
      } else if (provider === 'elevenlabs') {
        result = await this._transcribeElevenLabs(audioBuffer, options, asrCfg);
      } else {
        result = await this._transcribeFish(audioBuffer, options, apiLanguage);
      }

      return this.normalizeResult(result);
    } catch (error) {
      this.diagnostics.counters.errors += 1;
      this.diagnostics.lastError = error.message;
      this.logger.error(`STT Ticker: Transcription failed (${provider}): ${error.message}`);
      throw error;
    }
  }

  /**
   * Applies the same filtering and language normalization to uploaded and live
   * provider results before they enter any persistent output path.
   */
  normalizeResult(result) {
    if (!result || !result.text) {
      throw new Error('Empty transcription result');
    }

    let text = String(result.text).trim();
    const language = this._resolveResultLanguage(result.language);
    const langWhitelist = this._getLanguageWhitelist();
    if (language && !langWhitelist.includes(language)) {
      this.logger.warn(`STT Ticker: discarded transcript in language "${language}" (not in whitelist: ${langWhitelist.join(',')})`);
      throw new Error(`Transcript language "${language}" not in whitelist`);
    }

    text = this._sanitizeTranscriptForLanguage(text, language);
    if (text.length < 2) {
      throw new Error('Empty transcription result (after hallucination filter)');
    }

    const langInfo = this._classifyLanguage(text, language);
    this.diagnostics.counters.transcribed += 1;
    this.diagnostics.lastTranscriptAt = Date.now();
    this.diagnostics.lastError = null;
    this.diagnostics.lastProvider = result.provider;

    return {
      text,
      segments: result.segments || [],
      duration: result.duration || 0,
      provider: result.provider,
      model: result.model,
      confidence: result.confidence,
      language: langInfo.lang,
      languageSource: langInfo.source,
      requestId: result.requestId
    };
  }

  /**
   * Liefert den aktiven Provider.
   * Logik: asr.provider config > "auto" → falls deepgramKey vorhanden → deepgram,
   *         sonst falls elevenlabsKey vorhanden → elevenlabs, sonst fish.audio
   */
  _resolveProvider() {
    const asr = this.config.asr || {};
    const explicit = (asr.provider || 'auto').toLowerCase();

    if (explicit === 'deepgram') {
      const key = this._getDeepgramKey();
      if (!key) {
        this.logger.warn('STT Ticker: provider=deepgram requested but no key configured, falling back');
        return this._resolveFallbackProvider();
      }
      return 'deepgram';
    }
    if (explicit === 'elevenlabs') {
      const key = this._getElevenLabsKey();
      if (!key) {
        this.logger.warn('STT Ticker: provider=elevenlabs requested but no key configured, falling back');
        return this._resolveFallbackProvider();
      }
      return 'elevenlabs';
    }
    if (explicit === 'fish.audio' || explicit === 'fish') {
      return 'fish.audio';
    }
    // 'auto'
    if (this._getDeepgramKey()) return 'deepgram';
    if (this._getElevenLabsKey()) return 'elevenlabs';
    return 'fish.audio';
  }

  _resolveFallbackProvider() {
    if (this._getDeepgramKey()) return 'deepgram';
    if (this._getElevenLabsKey()) return 'elevenlabs';
    return 'fish.audio';
  }

  _resolveCredential({ configKey, fileName, environmentName, fallback }) {
    const fromConfig = String(this.config.asr?.[configKey] || '').trim();
    if (fromConfig) return { key: fromConfig, source: 'config' };

    try {
      const localPath = path.join(__dirname, '..', 'data', fileName);
      if (fs.existsSync(localPath)) {
        const fromFile = String(fs.readFileSync(localPath, 'utf8') || '').trim();
        if (fromFile) return { key: fromFile, source: 'file' };
      }
    } catch (error) { /* local credential files are optional */ }

    const fromEnvironment = String(process.env[environmentName] || '').trim();
    if (fromEnvironment) return { key: fromEnvironment, source: 'environment' };

    const fallbackKey = typeof fallback === 'function' ? String(fallback() || '').trim() : '';
    return fallbackKey
      ? { key: fallbackKey, source: 'plugin' }
      : { key: null, source: null };
  }

  _getDeepgramCredential() {
    return this._resolveCredential({
      configKey: 'deepgramApiKey',
      fileName: 'deepgram.key',
      environmentName: 'DEEPGRAM_API_KEY'
    });
  }

  _getElevenLabsCredential() {
    return this._resolveCredential({
      configKey: 'elevenlabsApiKey',
      fileName: 'elevenlabs.key',
      environmentName: 'ELEVENLABS_API_KEY'
    });
  }

  _getFishCredential() {
    return this._resolveCredential({
      configKey: 'fishaudioApiKey',
      fileName: 'fishaudio.key',
      environmentName: 'FISHAUDIO_API_KEY',
      fallback: () => this._getTtsPlugin()?.getFishAudioApiKey?.()
    });
  }

  _getDeepgramKey() {
    return this._getDeepgramCredential().key;
  }

  _legacyGetDeepgramKey() {
    // 1. In-Config (aus UI gespeichert)
    const fromConfig = (this.config.asr && this.config.asr.deepgramApiKey) || '';
    if (fromConfig.trim()) return fromConfig.trim();
    // 2. Lokale Datei (für lokale Dev-Workflows)
    try {
      const localPath = path.join(__dirname, '..', 'data', 'deepgram.key');
      if (fs.existsSync(localPath)) {
        const content = fs.readFileSync(localPath, 'utf8').trim();
        if (content) return content;
      }
    } catch (e) { /* ignore */ }
    // 3. ENV-Variable
    if (process.env.DEEPGRAM_API_KEY) return process.env.DEEPGRAM_API_KEY.trim();
    return null;
  }

  _getElevenLabsKey() {
    return this._getElevenLabsCredential().key;
  }

  _legacyGetElevenLabsKey() {
    // 1. In-Config (aus UI gespeichert)
    const fromConfig = (this.config.asr && this.config.asr.elevenlabsApiKey) || '';
    if (fromConfig.trim()) return fromConfig.trim();
    // 2. Lokale Datei
    try {
      const localPath = path.join(__dirname, '..', 'data', 'elevenlabs.key');
      if (fs.existsSync(localPath)) {
        const content = fs.readFileSync(localPath, 'utf8').trim();
        if (content) return content;
      }
    } catch (e) { /* ignore */ }
    // 3. ENV-Variable
    if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
    return null;
  }

  _getFishKey() {
    return this._getFishCredential().key;
  }

  _legacyGetFishKey() {
    // 1. In-Config (aus UI gespeichert)
    const fromConfig = (this.config.asr && this.config.asr.fishaudioApiKey) || '';
    if (fromConfig.trim()) return fromConfig.trim();
    // 2. Lokale Datei
    try {
      const localPath = path.join(__dirname, '..', 'data', 'fishaudio.key');
      if (fs.existsSync(localPath)) {
        const content = fs.readFileSync(localPath, 'utf8').trim();
        if (content) return content;
      }
    } catch (e) { /* ignore */ }
    // 3. ENV-Variable
    if (process.env.FISHAUDIO_API_KEY) return process.env.FISHAUDIO_API_KEY.trim();
    // 4. Fallback: TTS-Plugin (bestehende Logik)
    const tts = this._getTtsPlugin();
    if (tts && typeof tts.getFishAudioApiKey === 'function') {
      const ttsKey = tts.getFishAudioApiKey();
      if (ttsKey && ttsKey.trim()) return ttsKey.trim();
    }
    return null;
  }

  async _transcribeFish(audioBuffer, options, apiLanguage) {
    const tts = this._getTtsPlugin();
    if (!tts) {
      const err = 'TTS plugin not available — is it enabled?';
      this.diagnostics.counters.errors += 1;
      this.diagnostics.lastError = err;
      throw new Error(err);
    }
    if (typeof tts.transcribeFishAudio !== 'function') {
      const err = 'TTS plugin missing transcribeFishAudio method';
      this.diagnostics.counters.errors += 1;
      this.diagnostics.lastError = err;
      throw new Error(err);
    }

    const result = await tts.transcribeFishAudio(audioBuffer, {
      mimeType: options.mimeType,
      filename: options.filename,
      language: apiLanguage,
      timeout: 30000
    });

    return {
      text: result.text,
      segments: result.segments || [],
      duration: result.duration || 0,
      language: result.language,
      confidence: result.confidence,
      provider: 'fish.audio'
    };
  }

  async _transcribeDeepgram(audioBuffer, options, apiLanguage, asrCfg) {
    const key = this._getDeepgramKey();
    if (!key) {
      throw new Error('Deepgram API key not configured');
    }
    const client = new DeepgramAsrClient(key, this.logger, {
      timeout: 30000,
      maxAudioBytes: 25 * 1024 * 1024
    });

    // Sprach-Auflösung für Deepgram:
    // - 'multi' = Deepgram Nova-2 Multilingual Mode (DE, EN, ES, FR, IT, PT, RU)
    //   Verhindert Halluzinationen in Chinesisch/Japanisch/Koreanisch/Thai
    // - ISO-639-1 (de, en) = Sprache festschnüren, kein Auto-Detect
    // - undefined = kein language → Client mappt auf 'multi' als Default
    const model = asrCfg.deepgramModel || 'nova-2';
    let dgLanguage = apiLanguage;
    if (!dgLanguage || dgLanguage === 'auto') {
      dgLanguage = 'multi'; // sicherer Default
    }
    // Wenn der User explizit 'de' oder 'en' setzt → behalten (single-language mode)

    const modelInfo = DeepgramAsrClient.MODELS[model];
    if (dgLanguage === 'multi' && modelInfo && !modelInfo.multilingual) {
      throw new Error(`Deepgram model "${model}" does not support multilingual mode; choose a fixed language or a multilingual model`);
    }
    if (dgLanguage !== 'multi' && modelInfo?.supportedFixedLanguages?.length > 0
      && !modelInfo.supportedFixedLanguages.includes(dgLanguage)) {
      throw new Error(`Deepgram model "${model}" does not support fixed language "${dgLanguage}"`);
    }

    return await client.transcribe(audioBuffer, {
      mimeType: options.mimeType,
      filename: options.filename,
      language: dgLanguage,
      model
    });
  }

  async _transcribeElevenLabs(audioBuffer, options, asrCfg) {
    const key = this._getElevenLabsKey();
    if (!key) {
      throw new Error('ElevenLabs API key not configured');
    }
    const client = new ElevenLabsAsrClient(key, this.logger, {
      timeout: 30000,
      maxAudioBytes: 25 * 1024 * 1024
    });

    // Sanitize: nur Scribe-Modelle sind für STT gültig (alte Configs könnten TTS-Modelle haben)
    const VALID_STT_MODELS = ['scribe_v2', 'scribe_v1', 'scribe_v1_experimental'];
    let elModel = asrCfg.elevenlabsModel || 'scribe_v2';
    if (!VALID_STT_MODELS.includes(elModel)) {
      this.logger.warn(`STT Ticker: Invalid ElevenLabs STT model "${elModel}" in config, falling back to scribe_v2`);
      elModel = 'scribe_v2';
    }

    return await client.transcribe(audioBuffer, {
      mimeType: options.mimeType,
      filename: options.filename,
      model: elModel
    });
  }

  /**
   * Bevorzuge Backend-Sprache, sonst Heuristik.
   */
  _classifyLanguage(text, backendLanguage) {
    const ldCfg = this.config.langDetect || {};
    const fallback = (this.config.asr && this.config.asr.fallbackLanguage) || 'en';

    let heuristic = { lang: 'unknown', confidence: 0 };
    if (ldCfg.enabled !== false) {
      heuristic = detectLanguage(text, {
        minConfidence: ldCfg.minConfidence ?? 0.15,
        unknownPolicy: ldCfg.unknownPolicy ?? 'auto',
        fallback
      });
    }

    if (typeof backendLanguage === 'string' && SUPPORTED_SOURCE_LANGUAGE_SET.has(backendLanguage)) {
      return { lang: backendLanguage, source: 'backend', confidence: 1.0 };
    }

    if (heuristic.lang !== 'unknown') {
      return { lang: heuristic.lang, source: 'heuristic', confidence: heuristic.confidence };
    }

    return { lang: fallback, source: 'fallback', confidence: 0 };
  }

  _getLanguageWhitelist() {
    const whitelist = this.config.asr?.languageWhitelist;
    if (!Array.isArray(whitelist) || whitelist.length === 0) {
      return [...SUPPORTED_SOURCE_LANGUAGES];
    }
    return whitelist.map(language => String(language).toLowerCase().slice(0, 2));
  }

  _resolveResultLanguage(language) {
    if (typeof language === 'string' && language.trim() && language !== 'unknown') {
      return language.toLowerCase().slice(0, 2);
    }

    const asrCfg = this.config.asr || {};
    if (asrCfg.languageMode === 'fixed' && asrCfg.languageFixed) {
      return String(asrCfg.languageFixed).toLowerCase().slice(0, 2);
    }
    return null;
  }

  /**
   * Keep scripts that belong to the reported (or fixed) source language.
   * A small amount of conflicting script noise is stripped; a transcript
   * dominated by a conflicting script is rejected as an ASR mismatch.
   */
  _sanitizeTranscriptForLanguage(text, language) {
    if (!text || !language) return text;

    const allowedScripts = new Set(LANGUAGE_SCRIPTS[language] || []);
    const characters = Array.from(text);
    const incompatible = characters.filter(character => {
      const script = Object.entries(SCRIPT_PATTERNS)
        .find(([, pattern]) => pattern.test(character))?.[0];
      return script && !allowedScripts.has(script);
    });

    if (incompatible.length === 0) return text;
    if (incompatible.length / characters.length > 0.4) {
      this.logger.warn(`STT Ticker: discarded transcript because its script contradicts language "${language}"`);
      throw new Error(`Transcript language/script mismatch for "${language}"`);
    }

    this.logger.warn(`STT Ticker: removed contradictory script characters for language "${language}"`);
    return characters
      .filter(character => !incompatible.includes(character))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Filtert Halluzinations-Text raus den STT-Provider manchmal erzeugen.
   *  - CJK (Chinesisch, Japanisch, Koreanisch)
   *  - Thai, Arabisch, Hebräisch, Hindi
   *  - Andere exotische Skripte die nicht in DE/EN vorkommen
   *
   * Strategie: Wenn ein Text >30% "verbotene" Zeichen enthält,
   * werfen wir den ganzen Text weg. Bei <30% scrubben wir die
   * nicht-ASCII-Zeichen und lassen den Rest (kann DE+EN Text sein).
   *
   * Zusätzlich: Wenn Deepgram eine Sprache zurückschickt die NICHT
   * in der Whitelist ist (default: DE+EN) → auch komplett verwerfen.
   */
  _scrubHallucinations(text) {
    if (!text) return text;
    const asrCfg = this.config.asr || {};
    const whitelist = Array.isArray(asrCfg.languageWhitelist) && asrCfg.languageWhitelist.length > 0
      ? asrCfg.languageWhitelist
      : ['de', 'en'];

    // 1. Whitelist-Filter auf backend-detected language
    //    (nur wenn language erkannt UND nicht in whitelist → verwerfen)
    //    (language-Detection kommt in transcribe() → wir kennen sie hier nicht)
    //    → mache das in transcribe() selbst, nicht hier

    // 2. Unicode-Range-Check: zähle "verbotene" Zeichen
    //    Erlaubt: Latin (DE/EN/FR/ES), Latin Extended, Ziffern, übliche Punctuation
    //    Verboten: CJK, Thai, Arabic, Hebrew, Devanagari, Cyrillic außerhalb erlaubter Liste
    //    (Wir erlauben Cyrillic NICHT weil DE+EN User das nicht brauchen)
    const total = text.length;
    if (total === 0) return text;

    let badCount = 0;
    for (let i = 0; i < total; i++) {
      const code = text.charCodeAt(i);
      // Verbotene Unicode-Ranges:
      //   CJK Unified Ideographs:  0x4E00–0x9FFF
      //   CJK Extension A:         0x3400–0x4DBF
      //   CJK Symbols/Punctuation: 0x3000–0x303F, 0xFF00–0xFFEF (halb)
      //   Hiragana/Katakana:       0x3040–0x30FF
      //   Hangul:                  0xAC00–0xD7AF, 0x1100–0x11FF
      //   Thai:                    0x0E00–0x0E7F
      //   Arabic:                  0x0600–0x06FF
      //   Hebrew:                  0x0590–0x05FF
      //   Devanagari:              0x0900–0x097F
      //   Bengali:                 0x0980–0x09FF
      //   Tamil:                   0x0B80–0x0BFF
      //   Thai:                    0x0E00–0x0E7F
      //   Khmer:                   0x1780–0x17FF
      //   Myanmar:                 0x1000–0x109F
      //   Tibetan:                 0x0F00–0x0FFF
      //   Georgian:                0x10A0–0x10FF
      //   Cyrillic:                0x0400–0x04FF (haben wir nicht in DE+EN)
      //   Ethiopic:                0x1200–0x137F
      //   Devanagari:              0x0900–0x097F
      const isBad = (
        (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK
        (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Ext A
        (code >= 0x3040 && code <= 0x30FF) ||   // Hiragana/Katakana
        (code >= 0xAC00 && code <= 0xD7AF) ||   // Hangul
        (code >= 0x0E00 && code <= 0x0E7F) ||   // Thai
        (code >= 0x0600 && code <= 0x06FF) ||   // Arabic
        (code >= 0x0590 && code <= 0x05FF) ||   // Hebrew
        (code >= 0x0900 && code <= 0x097F) ||   // Devanagari
        (code >= 0x0980 && code <= 0x09FF) ||   // Bengali
        (code >= 0x0B80 && code <= 0x0BFF) ||   // Tamil
        (code >= 0x1000 && code <= 0x109F) ||   // Myanmar
        (code >= 0x0F00 && code <= 0x0FFF) ||   // Tibetan
        (code >= 0x10A0 && code <= 0x10FF) ||   // Georgian
        (code >= 0x0400 && code <= 0x04FF) ||   // Cyrillic
        (code >= 0x1200 && code <= 0x137F) ||   // Ethiopic
        (code >= 0x1780 && code <= 0x17FF) ||   // Khmer
        (code >= 0x3000 && code <= 0x303F) ||   // CJK Symbole
        (code >= 0xFF00 && code <= 0xFFEF)      // Halfwidth/Fullwidth Forms (CJK)
      );
      if (isBad) badCount++;
    }

    // Wenn >40% "bad" → komplett verwerfen (Halluzination)
    if (badCount / total > 0.4) {
      this.logger.warn(`STT Ticker: text discarded (${(badCount/total*100).toFixed(0)}% CJK/exotic): "${text.slice(0, 50)}..."`);
      return '';
    }

    // Sonst: scrubbe die bad chars raus
    if (badCount > 0) {
      let cleaned = '';
      for (let i = 0; i < total; i++) {
        const ch = text[i];
        const code = text.charCodeAt(i);
        // gleiche Logik wie oben — wenn bad, skip
        const isBad = (
          (code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF) ||
          (code >= 0x3040 && code <= 0x30FF) || (code >= 0xAC00 && code <= 0xD7AF) ||
          (code >= 0x0E00 && code <= 0x0E7F) || (code >= 0x0600 && code <= 0x06FF) ||
          (code >= 0x0590 && code <= 0x05FF) || (code >= 0x0900 && code <= 0x097F) ||
          (code >= 0x0980 && code <= 0x09FF) || (code >= 0x0B80 && code <= 0x0BFF) ||
          (code >= 0x1000 && code <= 0x109F) || (code >= 0x0F00 && code <= 0x0FFF) ||
          (code >= 0x10A0 && code <= 0x10FF) || (code >= 0x0400 && code <= 0x04FF) ||
          (code >= 0x1200 && code <= 0x137F) || (code >= 0x1780 && code <= 0x17FF) ||
          (code >= 0x3000 && code <= 0x303F) || (code >= 0xFF00 && code <= 0xFFEF)
        );
        if (!isBad) cleaned += ch;
      }
      // Doppelte Leerzeichen zusammenfassen
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      this.logger.warn(`STT Ticker: scrubbed CJK chars from transcript: "${text.slice(0, 50)}..." → "${cleaned.slice(0, 50)}..."`);
      return cleaned;
    }

    return text;
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

  getEffectiveProvider() {
    return this._resolveProvider();
  }

  getDeepgramApiKey() {
    return this._getDeepgramCredential().key;
  }

  getElevenLabsApiKey() {
    return this._getElevenLabsCredential().key;
  }

  getCredentialStatus() {
    const credentials = {
      deepgram: this._getDeepgramCredential(),
      elevenlabs: this._getElevenLabsCredential(),
      fishaudio: this._getFishCredential()
    };
    return Object.fromEntries(Object.entries(credentials).map(([name, credential]) => [name, {
      configured: Boolean(credential.key),
      source: credential.source
    }]));
  }

  getStatus() {
    const tts = this._getTtsPlugin();
    const credentials = this.getCredentialStatus();
    const asr = this.config.asr || {};
    return {
      ttsAvailable: !!tts,
      ttsHasAsr: tts && typeof tts.transcribeFishAudio === 'function',
      deepgramConfigured: credentials.deepgram.configured,
      deepgramKeySource: credentials.deepgram.source,
      elevenlabsConfigured: credentials.elevenlabs.configured,
      elevenlabsKeySource: credentials.elevenlabs.source,
      fishaudioConfigured: credentials.fishaudio.configured,
      fishaudioKeySource: credentials.fishaudio.source,
      provider: this._resolveProvider(),
      providerConfig: (asr.provider || 'auto'),
      deepgramModel: asr.deepgramModel || 'nova-2',
      elevenlabsModel: asr.elevenlabsModel || 'scribe_v2',
      diagnostics: {
        ...this.diagnostics,
        counters: { ...this.diagnostics.counters }
      }
    };
  }

  destroy() {
    this.rateLimitBuckets.clear();
  }

  _createEmptyDiagnostics() {
    return {
      counters: { requests: 0, transcribed: 0, errors: 0 },
      lastTranscriptAt: null,
      lastError: null,
      lastProvider: null
    };
  }
}

module.exports = AsrPipeline;
