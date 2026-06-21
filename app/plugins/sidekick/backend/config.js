/**
 * Sidekick Plugin - Backend Configuration
 * 
 * Default settings and configuration management for the Sidekick plugin.
 * Based on pal_ALONE.py settings structure, adapted for LTTH plugin system.
 */

/**
 * Default configuration values
 */
const {
  DEFAULT_CONVERSATION_COORDINATOR_CONFIG,
  normalizeConversationConfig
} = require('./conversation-coordinator');

const ASR_SERVICE_MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const DEFAULT_ASR_MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const ASR_LANGUAGE_PATTERN = /^[a-zA-Z]{2,3}(?:[-_][a-zA-Z]{2,4})?$/;

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function toBoolean(value, fallback) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

function normalizeAsrLanguage(value) {
  const language = typeof value === 'string' ? value.trim() : '';
  if (language.length < 1 || language.length > 16) return null;
  return ASR_LANGUAGE_PATTERN.test(language) ? language : null;
}

function normalizeAsrConfig(input = {}, conversationConfig = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const hasMinTranscriptChars = source.minTranscriptChars !== undefined
    && source.minTranscriptChars !== null
    && source.minTranscriptChars !== '';
  const minTranscriptChars = Number(source.minTranscriptChars);

  return {
    enabled: toBoolean(source.enabled, DEFAULT_CONFIG.asr.enabled),
    maxAudioBytes: Math.round(clamp(
      source.maxAudioBytes,
      1,
      ASR_SERVICE_MAX_AUDIO_BYTES,
      DEFAULT_CONFIG.asr.maxAudioBytes
    )),
    language: normalizeAsrLanguage(source.language),
    minTranscriptChars: hasMinTranscriptChars && Number.isFinite(minTranscriptChars)
      ? Math.round(clamp(minTranscriptChars, 1, 500, DEFAULT_CONVERSATION_COORDINATOR_CONFIG.minHostSpeechChars))
      : DEFAULT_CONFIG.asr.minTranscriptChars
  };
}

const DEFAULT_CONFIG = {
  // TikTok settings (read-only, uses main LTTH connection)
  tiktok: {
    // Note: TikTok connection is managed by LTTH core, not this plugin
  },

  // Speech output. The production default reuses AnimazingPal's Fish.audio
  // pipeline, voice selection and browser audio routing.
  output: {
    eventType: 'sidekick',
    username: 'Sidekick'
  },

  // Host/viewer orchestration and echo protection for Sidekick + AnimazingPal.
  conversation: {
    ...DEFAULT_CONVERSATION_COORDINATOR_CONFIG
  },

  // Host microphone speech recognition via the TTS plugin's Fish.audio ASR
  // client. Audio stays in memory and is never written to plugin directories.
  asr: {
    enabled: true,
    maxAudioBytes: DEFAULT_ASR_MAX_AUDIO_BYTES,
    language: null,
    minTranscriptChars: null
  },
  
  // Style settings
  style: {
    maxLineLength: 140
  },
  
  // Comment/chat response settings
  comment: {
    enabled: true,
    globalCooldown: 6,       // seconds between any response
    perUserCooldown: 15,     // seconds between responses to same user
    minLength: 3,            // minimum comment length to process
    maxRepliesPerMin: 20,    // rate limit
    replyThreshold: 0.6,     // relevance score threshold (0-1)
    respondToGreetings: true,
    greetingCooldown: 360,   // seconds between greeting responses per user
    respondToThanks: true,
    ignoreIfStartswith: ['!', '/'],  // ignore commands
    ignoreContains: ['http://', 'https://', 'discord.gg', '.com/', '.de/'],
    keywordsBonus: [
      'warum', 'wieso', 'wie', 'wann', 'wo', 'wer', 'was', 'welche', 'welcher', 'welches',
      'why', 'how', 'when', 'where', 'who', 'what', 'which', 'how much', 'how many'
    ],
    greetings: ['hallo', 'hi', 'hey', 'servus', 'moin', 'gruss', 'grüß', 'guten morgen', 'guten abend', 'hello'],
    thanks: ['danke', 'thx', 'thanks', 'ty', 'merci']
  },
  
  // Join greeting settings
  joinRules: {
    enabled: true,
    greetAfterSeconds: 30,        // delay before greeting a new joiner
    activeTtlSeconds: 45,         // consider user "present" for this duration
    minIdleSinceLastOutputSec: 25, // wait this long since last output before announcing joins
    greetGlobalCooldownSec: 180   // global cooldown between join announcements
  },
  
  // Outbox batching settings
  outbox: {
    windowSeconds: 8,    // batch window duration
    maxItems: 8,         // max items per batch
    maxChars: 320,       // max characters per batch
    separator: ' • '     // separator between batched items
  },
  
  // Speech/timing settings for the shared live host output pipeline.
  speech: {
    waitStartTimeoutMs: 1200,  // wait for speech start
    maxSpeechMs: 15000,        // max speech duration to wait
    postGapMs: 250             // gap after speech ends
  },
  
  // Like threshold
  likeThreshold: 20,  // only announce after this many likes
  
  // Memory settings
  memory: {
    enabled: true,
    perUserHistory: 100,  // messages to remember per user
    decayDays: 90         // remove users inactive for this many days
  },
  
  // Deduplication TTL (seconds)
  dedupeTtl: 600,
  
  // Mute control
  muted: false
};

/**
 * Configuration manager for Sidekick plugin
 */
class ConfigManager {
  constructor(api) {
    this.api = api;
    this.config = null;
  }
  
  /**
   * Load configuration from database, merging with defaults
   * @returns {Object} Configuration object
   */
  load() {
    try {
      const stored = this.api.getConfig('config');
      if (this._isPlainObject(stored)) {
        const beforeNormalize = JSON.stringify(stored);
        this.config = this._deepMerge(this._cloneDefaults(), stored);
        this._normalizeStandaloneHostConfig();
        if (JSON.stringify(this.config) !== beforeNormalize) {
          this.save();
        }
      } else {
        this.config = this._cloneDefaults();
        this.save();
      }
    } catch (error) {
      this.api.log(`Failed to load config: ${error.message}`, 'error');
      this.config = this._cloneDefaults();
    }
    return this.config;
  }
  
  /**
   * Save current configuration to database
   * @returns {boolean} Success status
   */
  save() {
    try {
      this.api.setConfig('config', this.config);
      return true;
    } catch (error) {
      this.api.log(`Failed to save config: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Get current configuration
   * @returns {Object} Configuration object
   */
  get() {
    if (!this.config) {
      this.load();
    }
    return this.config;
  }
  
  /**
   * Update configuration
   * @param {Object} updates - Partial configuration to merge
   * @returns {Object} Updated configuration
   */
  update(updates) {
    if (!this.config) {
      this.load();
    }
    if (this._isPlainObject(updates)) {
      this.config = this._deepMerge(this.config, updates);
    }
    this._normalizeStandaloneHostConfig();
    this.save();
    return this.config;
  }

  _normalizeStandaloneHostConfig() {
    if (!this.config) return;
    delete this.config.animaze;
    this.config.conversation = normalizeConversationConfig(this.config.conversation || DEFAULT_CONFIG.conversation);
    this.config.asr = normalizeAsrConfig(this.config.asr || DEFAULT_CONFIG.asr, this.config.conversation);
    if (!this._isPlainObject(this.config.output)) {
      this.config.output = this._cloneDefaults().output;
      return;
    }
    delete this.config.output.mode;
    if (!this.config.output.eventType) {
      this.config.output.eventType = DEFAULT_CONFIG.output.eventType;
    }
    if (!this.config.output.username) {
      this.config.output.username = DEFAULT_CONFIG.output.username;
    }
  }
  
  /**
   * Get a specific config value by path
   * @param {string} path - Dot-separated path (e.g., 'comment.enabled')
   * @returns {*} Config value or undefined
   */
  getValue(path) {
    const parts = path.split('.');
    let value = this.config;
    for (const part of parts) {
      if (value === undefined || value === null) return undefined;
      value = value[part];
    }
    return value;
  }
  
  /**
   * Set a specific config value by path
   * @param {string} path - Dot-separated path
   * @param {*} value - Value to set
   */
  setValue(path, value) {
    const parts = path.split('.');
    if (!this.config) {
      this.load();
    }
    
    // Guard against prototype pollution
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    if (parts.some(part => dangerousKeys.includes(part))) {
      this.api.log(`Blocked prototype pollution attempt in setValue: ${path}`, 'warn');
      return;
    }
    
    let obj = this.config;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!Object.prototype.hasOwnProperty.call(obj, part)) {
        obj[part] = {};
      }
      obj = obj[part];
    }
    
    // Final key assignment with protection
    const finalKey = parts[parts.length - 1];
    if (!dangerousKeys.includes(finalKey)) {
      obj[finalKey] = value;
    }
    this._normalizeStandaloneHostConfig();
    this.save();
  }
  
  /**
   * Deep merge two objects (with prototype pollution protection)
   * @private
   */
  _deepMerge(target, source) {
    if (!this._isPlainObject(source)) {
      return target;
    }
    const output = { ...target };
    
    // Guard against prototype pollution
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    
    for (const key in source) {
      // Skip dangerous keys to prevent prototype pollution
      if (dangerousKeys.includes(key)) {
        continue;
      }
      
      // Only process own properties
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue;
      }
      
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
  
  /**
   * Get default configuration
   * @returns {Object} Default configuration
   */
  getDefaults() {
    return this._cloneDefaults();
  }

  _cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  _isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}

module.exports = {
  ConfigManager,
  DEFAULT_CONFIG,
  DEFAULT_ASR_MAX_AUDIO_BYTES,
  ASR_SERVICE_MAX_AUDIO_BYTES,
  ASR_LANGUAGE_PATTERN,
  normalizeAsrLanguage,
  normalizeAsrConfig
};
