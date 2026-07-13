/**
 * STT Ticker - Translator
 *
 * Übersetzt transkribierten Text via Ollama Cloud API.
 * Optionales Feature - nur aktiv wenn translation.enabled=true und apiKey gesetzt.
 *
 * API: POST https://ollama.com/api/chat
 */

const OLLAMA_BASE_URL = 'https://ollama.com/api';

// Bekannte Sprachen für die UI
const LANGUAGES = [
  { code: 'auto', label: 'Auto-Erkennung' },
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
  { code: 'ar', label: 'العربية' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'sv', label: 'Svenska' },
  { code: 'da', label: 'Dansk' },
  { code: 'fi', label: 'Suomi' },
  { code: 'no', label: 'Norsk' },
  { code: 'cs', label: 'Čeština' },
  { code: 'hu', label: 'Magyar' },
  { code: 'ro', label: 'Română' },
  { code: 'uk', label: 'Українська' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'he', label: 'עברית' },
  { code: 'th', label: 'ไทย' },
  { code: 'vi', label: 'Tiếng Việt' }
];

class Translator {
  constructor(config, logger) {
    this.logger = logger;
    this.config = config;

    // Cache: vermeidet identische Übersetzungen
    this._cache = new Map();
    this._cacheMaxSize = 100;
    this._cacheTtlMs = 5 * 60 * 1000; // 5 Minuten

    // Rate-Limiting: max 10 Requests pro Minute
    this._requestTimestamps = [];
    this._maxRequestsPerMinute = 10;

    // Pending-Request-Deduplizierung
    this._pendingRequests = new Map();
  }

  /**
   * Übersetzt einen Text, wenn Translation aktiviert ist.
   * Gibt { translated, text, model, color } zurück.
   * Wenn deaktiviert oder Fehler: { translated: false, text: original }
   *
   * Optionen:
   *   sourceLanguage    - explizite Quellsprache (überschreibt cfg.sourceLanguage)
   *   _detectedLanguage - vom ASR-Pipeline erkannte Sprache (für auto-mode)
   */
  async translate(text, options = {}) {
    const cfg = this.config.translation || {};

    // Nicht aktiviert - Original zurückgeben
    if (!cfg.enabled || !cfg.apiKey) {
      return { translated: false, text };
    }

    const trimmed = String(text || '').trim();
    if (!trimmed || trimmed.length < 2) {
      return { translated: false, text: trimmed };
    }

    // Cache-Check
    const cacheKey = trimmed.toLowerCase().slice(0, 200);
    const cached = this._cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < this._cacheTtlMs) {
      return {
        translated: true,
        text: cached.result,
        model: cfg.model,
        color: cfg.color,
        cached: true
      };
    }

    // Rate-Limit
    if (!this._checkRateLimit()) {
      this.logger.warn('STT Ticker: Translation rate limited, returning original');
      return { translated: false, text: trimmed };
    }

    // Deduplizierung: gleicher Text wird nicht parallel mehrfach angefragt
    if (this._pendingRequests.has(cacheKey)) {
      try {
        const result = await this._pendingRequests.get(cacheKey);
        return {
          translated: true,
          text: result,
          model: cfg.model,
          color: cfg.color
        };
      } catch (e) {
        // Fall through
      }
    }

    // Text kürzen falls nötig
    const maxLen = cfg.maxTextLength || 500;
    const inputText = trimmed.length > maxLen ? trimmed.slice(0, maxLen) + '…' : trimmed;

    // Prompt bauen
    // sourceLanguage kann sein: explizit aus Optionen > cfg.sourceLanguage > detected > autoDefault
    let sourceLang = options.sourceLanguage || cfg.sourceLanguage || 'auto';
    if (sourceLang === 'auto') {
      sourceLang = options._detectedLanguage || cfg.autoDetectDefault || 'de';
    }
    const targetLang = cfg.targetLanguage || 'en';
    if (sourceLang === targetLang) {
      // Bereits in Zielsprache - keine Übersetzung nötig, Token sparen
      return { translated: false, text: trimmed, sameAsTarget: true };
    }
    const systemPrompt = `You are a real-time caption translator. Translate the following ${sourceLang} text to ${targetLang}. Return ONLY the translation, no explanations, no quotes, no formatting. Keep the tone and style. If the text is already in ${targetLang}, return it unchanged.`;

    // Request starten
    const promise = this._callOllama(systemPrompt, inputText, cfg);
    this._pendingRequests.set(cacheKey, promise);

    try {
      const result = await promise;

      // In Cache speichern
      if (this._cache.size >= this._cacheMaxSize) {
        const firstKey = this._cache.keys().next().value;
        this._cache.delete(firstKey);
      }
      this._cache.set(cacheKey, { result, ts: Date.now() });

      return {
        translated: true,
        text: result,
        model: cfg.model,
        color: cfg.color
      };
    } catch (error) {
      this.logger.warn(`STT Ticker: Translation failed: ${error.message}`);
      return { translated: false, text: trimmed };
    } finally {
      this._pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Übersetzt einen Text in mehrere Zielsprachen parallel.
   * @param {string} text - Der zu übersetzende Text
   * @param {Object} options - { sourceLanguage, outputLanguages: ['en', 'fr', ...] }
   * @returns {Object} { translated: bool, translations: { lang: { text, color }, ... } }
   */
  async translateMulti(text, options = {}) {
    const cfg = this.config.translation || {};
    if (!cfg.enabled || !cfg.apiKey) {
      return { translated: false, translations: {} };
    }

    const trimmed = String(text || '').trim();
    if (!trimmed || trimmed.length < 2) {
      return { translated: false, translations: {} };
    }

    const sourceLang = options.sourceLanguage || cfg.sourceLanguage || 'auto';
    const requestedOutputLangs = Array.isArray(options.outputLanguages) ? options.outputLanguages : [];
    const defaultLanguage = this.config.multiLanguage?.defaultLanguage;
    const outputLangs = Array.from(new Set([
      defaultLanguage,
      ...requestedOutputLangs
    ].filter(Boolean)));
    if (outputLangs.length === 0) {
      return { translated: false, translations: {} };
    }

    // Filtere Quellsprache raus (keine Übersetzung nötig)
    const targets = outputLangs.filter(l => l !== sourceLang);
    if (targets.length === 0) {
      return { translated: false, translations: {} };
    }

    // Rate-Limit
    if (!this._checkRateLimit()) {
      this.logger.warn('STT Ticker: Multi-translation rate limited');
      return { translated: false, translations: {} };
    }

    // Batch-Prompt: alle Zielsprachen in einem Request
    const systemPrompt = `You are a real-time caption translator. Translate the following ${sourceLang} text to ALL of these languages: ${targets.join(', ')}. Return a JSON object where keys are language codes and values are the translations. Example: {"en": "Hello world", "fr": "Bonjour le monde"}. Return ONLY the JSON object, no explanations, no markdown. Keep the tone and style.`;

    try {
      const result = await this._callOllama(systemPrompt, trimmed, cfg);
      let parsed;
      try {
        parsed = JSON.parse(result);
      } catch (e) {
        // Fallback: Versuche JSON aus dem Text zu extrahieren
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch (e2) { parsed = null; }
        } else {
          parsed = null;
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        this.logger.warn('STT Ticker: Multi-translation returned unparseable result');
        return { translated: false, translations: {} };
      }

      const colors = (this.config.multiLanguage && this.config.multiLanguage.colors) || {};
      const translations = {};
      for (const lang of targets) {
        const tText = parsed[lang];
        if (tText && typeof tText === 'string' && tText.trim()) {
          translations[lang] = {
            text: tText.trim(),
            color: colors[lang] || cfg.color || '#FFD700'
          };
        }
      }

      return {
        translated: Object.keys(translations).length > 0,
        translations
      };
    } catch (error) {
      this.logger.warn(`STT Ticker: Multi-translation failed: ${error.message}`);
      return { translated: false, translations: {} };
    }
  }

  /**
   * Translates several independently routed caption fragments in one Cloud
   * request. Each source fragment keeps its language and receives only the
   * remaining configured display languages as translations.
   */
  async translateSegments(segments, options = {}) {
    const cfg = this.config.translation || {};
    const sourceSegments = Array.isArray(segments) ? segments : [];
    const prepared = sourceSegments
      .map((segment, index) => ({
        ...segment,
        id: String(segment.id || `segment-${index + 1}`),
        text: String(segment.text || '').trim(),
        language: segment.language || options.defaultLanguage || 'de'
      }))
      .filter(segment => segment.text.length >= 2);
    const defaultLanguage = options.defaultLanguage || this.config.multiLanguage?.defaultLanguage;
    const outputLanguages = Array.from(new Set([
      defaultLanguage,
      ...(Array.isArray(options.outputLanguages) ? options.outputLanguages : [])
    ].filter(Boolean)));
    const withEmptyTranslations = () => prepared.map(segment => ({ ...segment, translations: {} }));

    if (!cfg.enabled || !cfg.apiKey || prepared.length === 0 || outputLanguages.length === 0) {
      return withEmptyTranslations();
    }

    const requests = prepared.map(segment => ({
      id: segment.id,
      text: segment.text,
      sourceLanguage: segment.language,
      targetLanguages: outputLanguages.filter(language => language !== segment.language)
    }));
    if (!requests.some(request => request.targetLanguages.length > 0)) {
      return withEmptyTranslations();
    }
    if (!this._checkRateLimit()) {
      this.logger.warn('STT Ticker: Segment translation rate limited');
      return withEmptyTranslations();
    }

    const systemPrompt = 'You are a real-time caption translator. Translate every JSON input item into exactly its targetLanguages. Return ONLY a JSON object keyed by item id. Each value must be an object whose keys are target language codes and whose values are translations. Do not add markdown or explanations.';
    try {
      const result = await this._callOllama(systemPrompt, JSON.stringify(requests), cfg);
      const parsed = this._parseJsonResponse(result);
      if (!parsed || typeof parsed !== 'object') {
        this.logger.warn('STT Ticker: Segment translation returned unparseable result');
        return withEmptyTranslations();
      }

      const colors = this.config.multiLanguage?.colors || {};
      return prepared.map(segment => {
        const resultByLanguage = parsed[segment.id] || {};
        const translations = {};
        for (const language of outputLanguages) {
          const value = resultByLanguage[language];
          if (language !== segment.language && typeof value === 'string' && value.trim()) {
            translations[language] = {
              text: value.trim(),
              color: colors[language] || cfg.color || '#FFD700'
            };
          }
        }
        return { ...segment, translations };
      });
    } catch (error) {
      this.logger.warn(`STT Ticker: Segment translation failed: ${error.message}`);
      return withEmptyTranslations();
    }
  }

  _parseJsonResponse(result) {
    try {
      return JSON.parse(result);
    } catch (error) {
      const jsonMatch = String(result || '').match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (nestedError) {
        return null;
      }
    }
  }

  /**
   * Ruft die native Ollama Cloud API auf.
   */
  async _callOllama(systemPrompt, text, cfg) {
    const axios = require('axios');
    const timeoutMs = Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : 30000;

    const response = await axios.post(
      `${OLLAMA_BASE_URL}/chat`,
      {
        model: cfg.model || 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        stream: false,
        think: false,
        options: {
          temperature: 0.1
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: timeoutMs
      }
    );

    if (!response.data?.message?.content) {
      throw new Error('Empty response from Ollama Cloud');
    }

    return response.data.message.content.trim();
  }

  /**
   * Ruft die verfügbaren Modelle von der Ollama Cloud API ab.
   * Fallback: bekannte Modelle falls API nicht erreichbar.
   */
  async fetchModels(apiKey) {
    const key = apiKey || this.config.translation?.apiKey;
    if (!key) return this._defaultModels();

    try {
      const axios = require('axios');
      const response = await axios.get(`${OLLAMA_BASE_URL}/tags`, {
        headers: { 'Authorization': `Bearer ${key}` },
        timeout: 10000
      });

      if (response.data?.models && Array.isArray(response.data.models)) {
        return response.data.models
          .filter(model => model.name && !model.name.includes('embed'))
          .map(model => ({ id: model.name, name: model.name }));
      }
      return this._defaultModels();
    } catch (error) {
      this.logger.warn(`STT Ticker: Failed to fetch models from Ollama Cloud: ${error.message}`);
      return this._defaultModels();
    }
  }

  _defaultModels() {
    return [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
      { id: 'gpt-oss:20b', name: 'GPT-OSS 20B' },
      { id: 'gemma3:4b', name: 'Gemma 3 4B' },
      { id: 'nemotron-3-nano:30b', name: 'Nemotron 3 Nano 30B' },
    ];
  }

  /**
   * Gibt die Liste der unterstützten Sprachen zurück.
   */
  getLanguages() {
    return LANGUAGES;
  }

  /**
   * Rate-Limiting: max N Requests pro Minute.
   */
  _checkRateLimit() {
    const now = Date.now();
    const windowMs = 60000;

    // Alte Einträge entfernen
    this._requestTimestamps = this._requestTimestamps.filter(ts => (now - ts) < windowMs);

    if (this._requestTimestamps.length >= this._maxRequestsPerMinute) {
      return false;
    }

    this._requestTimestamps.push(now);
    return true;
  }

  /**
   * Config aktualisieren.
   */
  updateConfig(config) {
    this.config = config;
  }

  /**
   * Status abrufen.
   */
  getStatus() {
    const cfg = this.config.translation || {};
    return {
      enabled: cfg.enabled && !!cfg.apiKey,
      configured: !!cfg.apiKey,
      model: cfg.model || 'none',
      targetLanguage: cfg.targetLanguage || 'en',
      sourceLanguage: cfg.sourceLanguage || 'de',
      color: cfg.color || '#FFD700',
      cacheSize: this._cache.size,
      recentRequests: this._requestTimestamps.length
    };
  }

  /**
   * Cache leeren.
   */
  clearCache() {
    this._cache.clear();
  }

  destroy() {
    this._cache.clear();
    this._pendingRequests.clear();
    this._requestTimestamps = [];
  }
}

module.exports = Translator;
