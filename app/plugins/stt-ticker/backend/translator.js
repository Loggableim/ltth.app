/**
 * STT Ticker - Translator
 *
 * Übersetzt transkribierten Text via Ollama Cloud API (OpenAI-kompatibel).
 * Optionales Feature — nur aktiv wenn translation.enabled=true und apiKey gesetzt.
 *
 * API: POST https://api.ollama.cloud/v1/chat/completions
 * (OpenAI-kompatibler Endpoint)
 */

const OLLAMA_BASE_URL = 'https://api.ollama.cloud/v1';

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
   */
  async translate(text, options = {}) {
    const cfg = this.config.translation || {};

    // Nicht aktiviert → Original zurückgeben
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
    const sourceLang = cfg.sourceLanguage || 'auto';
    const targetLang = cfg.targetLanguage || 'en';
    const systemPrompt = `You are a real-time caption translator. Translate the following ${sourceLang === 'auto' ? '' : sourceLang + ' '}text to ${targetLang}. Return ONLY the translation, no explanations, no quotes, no formatting. Keep the tone and style. If the text is already in ${targetLang}, return it unchanged.`;

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
   * Ruft die Ollama Cloud API auf (OpenAI-kompatibel).
   */
  async _callOllama(systemPrompt, text, cfg) {
    const axios = require('axios');

    const response = await axios.post(
      `${OLLAMA_BASE_URL}/chat/completions`,
      {
        model: cfg.model || 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        max_tokens: Math.min(Math.ceil(text.length * 1.5), 2000),
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error('Empty response from Ollama Cloud');
    }

    return response.data.choices[0].message.content.trim();
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
      const response = await axios.get(`${OLLAMA_BASE_URL}/models`, {
        headers: { 'Authorization': `Bearer ${key}` },
        timeout: 10000
      });

      if (response.data?.data && Array.isArray(response.data.data)) {
        return response.data.data
          .filter(m => m.id && !m.id.includes('embed'))
          .map(m => ({ id: m.id, name: m.id }));
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
      { id: 'deepseek-v4', name: 'DeepSeek V4' },
      { id: 'qwen2.5-14b-instruct', name: 'Qwen 2.5 14B' },
      { id: 'qwen2.5-72b-instruct', name: 'Qwen 2.5 72B' },
      { id: 'llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
      { id: 'mistral-large-2', name: 'Mistral Large 2' },
      { id: 'gemma-2-27b-it', name: 'Gemma 2 27B' }
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
