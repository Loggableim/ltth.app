/**
 * STT Ticker Plugin - Configuration
 *
 * Default settings and configuration management.
 */

const DEFAULT_CONFIG = {
  // Master enable
  enabled: true,

  // ASR settings — Sprache & Provider
  asr: {
    provider: 'auto',           // 'auto' | 'fish.audio' | 'deepgram' (auto = Deepgram wenn Key da, sonst Fish)
    languageMode: 'auto',       // 'auto' = Auto-Erkennung, 'fixed' = feste Sprache
    languageDefault: 'de',      // Default-Sprache für Auto-Modus (UI-Auswahl)
    languageFixed: 'de',        // Feste Sprache für Fix-Modus
    fallbackLanguage: 'en',     // Fallback wenn Heuristik nichts findet
    languageWhitelist: ['de', 'en'],  // nur diese Sprachen erlauben (filtert Halluzinationen)
    deepgramApiKey: '',         // Deepgram API-Key (NIE im Git, persistent in Plugin-Config)
    deepgramModel: 'nova-2',     // 'nova-2' | 'whisper-large' | 'whisper-medium'
    elevenlabsApiKey: '',        // ElevenLabs API-Key für ASR
    elevenlabsModel: 'eleven_turbo_v2_5'  // ElevenLabs ASR Modell
  },

  // ASR settings — Performance / Kosten
  maxAudioBytes: 4 * 1024 * 1024,  // 4MB max upload
  silenceTimeoutMs: 900,       // ms of silence before segment is "final"
  maxSegmentMs: 12000,         // max ms per audio segment
  minTranscriptChars: 2,       // minimum chars to accept a transcript
  rateLimitMax: 30,            // max requests per window
  rateLimitWindowMs: 60000,    // rate limit window

  // VAD — Voice Activity Detection (client-seitig, spart Fish-Tokens)
  // Capture.html verwirft Silence-Chunks BEVOR sie hochgeladen werden.
  vad: {
    enabled: true,              // VAD aktiv (client-side)
    rmsThreshold: 0.012,        // min RMS-Amplitude (0..1) — alles darunter = Stille
    minSpeechRatio: 0.04,       // min Anteil (0..1) "lauter" Samples im Chunk
    frameSizeMs: 30,            // Frame-Größe für Ratio-Berechnung
    minChunkMs: 600,            // min Audio-Länge bevor überhaupt geprüft wird (kürzere Chunks = überspringen)
    sustainedSilenceMs: 1500    // ms durchgehender Stille bevor Status auf "Silence" wechselt
  },

  // Dual-Language Overlay (EN oben / DE unten)
  dualLanguage: {
    enabled: true,              // true = Segmente nach Sprache auf 2 Zeilen verteilt
    topLanguage: 'en',          // Sprache für obere Zeile
    bottomLanguage: 'de',       // Sprache für untere Zeile
    topColor: '#FFD700',        // gold für Englisch
    bottomColor: '#FFFFFF',     // weiß für Deutsch
    showUnknownOnTop: true      // unerkannte Sprache → obere Zeile (Default)
  },

  // Multi-Language Output (N Zeilen, je Zeile eine Sprache)
  // Erweitert das Capture- und Overlay-Display auf N Sprachen
  multiLanguage: {
    enabled: false,             // true = N Zeilen Output aktivieren
    defaultLanguage: 'de',      // Sprache des Originals (Zeile 1)
    outputLanguages: ['en'],    // Array der Zielsprachen (Zeile 2..N)
    colors: {
      'de': '#FFFFFF',
      'en': '#FFD700',
      'es': '#FF6B6B',
      'fr': '#6BCBFF',
      'it': '#98FB98',
      'pt': '#FFA07A',
      'nl': '#DDA0DD',
      'pl': '#87CEEB',
      'ru': '#FF6347',
      'ja': '#FFB6C1',
      'ko': '#B0E0E6',
      'zh': '#F0E68C',
      'ar': '#DEB887',
      'tr': '#E6E6FA',
      'sv': '#AFEEEE',
      'da': '#98D8C8',
      'fi': '#F5DEB3',
      'no': '#E0FFFF',
      'cs': '#D3D3D3',
      'hu': '#FFDAB9',
      'ro': '#C0C0C0',
      'uk': '#B0C4DE',
      'el': '#FFFACD',
      'he': '#E6E6FA',
      'th': '#FFE4B5',
      'vi': '#F0FFF0'
    }
  },

  // Text buffer settings
  bufferSize: 20,              // number of segments to keep in ring buffer
  maxTextAge: 60,              // seconds before a segment expires
  maxLines: 2,                 // default max lines in overlay
  maxCharsPerLine: 80,         // max chars per line before wrap

  // Language-Detection (Heuristik — kein API-Call)
  langDetect: {
    enabled: true,              // heuristische EN/DE-Erkennung an/aus
    minConfidence: 0.15,        // min Score-Differenz für Klassifikation
    unknownPolicy: 'auto'       // 'auto' | 'en' | 'de' — was tun wenn unklar
  },

  // Translation settings (optional — Ollama Cloud LLM)
  translation: {
    enabled: false,
    apiKey: '',                 // wird persistent in Plugin-Config gespeichert
    model: 'nemotron-3-nano',  // default model for translation
    targetLanguage: 'en',
    sourceLanguage: 'auto',     // 'auto' = Heuristik erkennt Quellsprache
    autoDetectDefault: 'de',    // fallback language when sourceLanguage='auto'
    color: '#FFD700',            // gold — Farbe für übersetzten Text
    maxTextLength: 500           // max chars to send to LLM per request
  },

  // Overlay defaults (can be overridden via URL params)
  overlay: {
    design: 'dual-language',
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
