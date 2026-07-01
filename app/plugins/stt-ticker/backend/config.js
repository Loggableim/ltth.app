/**
 * STT Ticker Plugin - Configuration
 *
 * Default settings and configuration management.
 */

const DEFAULT_CONFIG = {
  // Master enable
  enabled: true,

  // ASR settings
  language: null,              // null = auto-detect, or ISO code like 'de', 'en'
  maxAudioBytes: 4 * 1024 * 1024,  // 4MB max upload
  silenceTimeoutMs: 900,       // ms of silence before segment is "final"
  maxSegmentMs: 12000,         // max ms per audio segment
  minTranscriptChars: 2,       // minimum chars to accept a transcript
  rateLimitMax: 30,            // max requests per window
  rateLimitWindowMs: 60000,    // rate limit window

  // Text buffer settings
  bufferSize: 10,              // number of segments to keep in ring buffer
  maxTextAge: 30,              // seconds before a segment expires
  maxLines: 2,                 // default max lines in overlay
  maxCharsPerLine: 80,         // max chars per line before wrap

  // Translation settings (optional — Ollama Cloud LLM)
  translation: {
    enabled: false,
    apiKey: '',
    model: 'nemotron-3-nano',  // default model for translation
    targetLanguage: 'en',
    sourceLanguage: 'de',
    color: '#FFD700',            // gold — Farbe für übersetzten Text
    maxTextLength: 500           // max chars to send to LLM per request
  },

  // Overlay defaults (can be overridden via URL params)
  overlay: {
    design: 'classic',
    position: 'bottom-center',
    fontSize: '36px',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    textColor: '#FFFFFF',
    bgColor: 'rgba(0, 0, 0, 0.75)',
    bgBlur: '0px',
    borderRadius: '8px',
    padding: '12px 20px',
    textAlign: 'center',
    opacity: 1.0,
    animation: 'fade',
    showSpeaker: false,
    speakerLabel: 'Host',
    showTimestamp: false,
    letterSpacing: 'normal',
    lineHeight: 1.4,
    scrollSpeed: 50,
    glowColor: '#00FFFF',
    glowIntensity: '10px',
    uppercase: false,
    showInterim: true,
    highContrast: false,
    colorBlind: false,
    slowMode: false,
    largeText: false,
    dyslexic: false
  }
};

class ConfigManager {
  constructor(api) {
    this.api = api;
    this.config = null;
  }

  load() {
    try {
      const stored = this.api.getConfig('config');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        this.config = this._deepMerge(this._cloneDefaults(), stored);
      } else {
        this.config = this._cloneDefaults();
        this.save();
      }
    } catch (error) {
      this.api.log(`STT Ticker: Failed to load config: ${error.message}`, 'error');
      this.config = this._cloneDefaults();
    }
    return this.config;
  }

  save() {
    try {
      this.api.setConfig('config', this.config);
      return true;
    } catch (error) {
      this.api.log(`STT Ticker: Failed to save config: ${error.message}`, 'error');
      return false;
    }
  }

  get() {
    if (!this.config) this.load();
    return this.config;
  }

  update(updates) {
    if (!this.config) this.load();
    if (updates && typeof updates === 'object' && !Array.isArray(updates)) {
      this.config = this._deepMerge(this.config, updates);
    }
    this.save();
    return this.config;
  }

  _deepMerge(target, source) {
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    const output = { ...target };

    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      if (dangerousKeys.includes(key)) continue;

      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
          output[key] = this._deepMerge(target[key], source[key]);
        } else {
          output[key] = source[key];
        }
      } else {
        output[key] = source[key];
      }
    }
    return output;
  }

  _cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

module.exports = {
  ConfigManager,
  DEFAULT_CONFIG
};
