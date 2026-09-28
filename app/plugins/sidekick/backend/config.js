/**
 * Sidekick Plugin - Backend Configuration
 * 
 * Default settings and configuration management for the Sidekick plugin.
 * Based on pal_ALONE.py settings structure, adapted for LTTH plugin system.
 */

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  // TikTok settings (read-only, uses main LTTH connection)
  tiktok: {
    // Note: TikTok connection is managed by LTTH core, not this plugin
  },
  
  // Avatar & VNyan 3D/VRM settings
  avatar: {
    driver: 'vnyan', // 'vnyan' | 'animaze'
    vnyan: {
      host: '127.0.0.1',
      port: 8000,
      path: '/vnyan',
      autoConnect: true,
      reconnectOnDisconnect: true,
      reconnectDelay: 4000,
      maxReconnectAttempts: 15,
      sendPlainTriggers: true,
      triggers: {
        speechStart: 'SK_Speak_Start',
        speechEnd: 'SK_Speak_End',
        gift: 'SK_Gift',
        like: 'SK_Like',
        follow: 'SK_Follow',
        share: 'SK_Share',
        chat: 'SK_Chat',
        question: 'SK_Question'
      },
      // Custom Gift-to-Trigger & Emotion rules
      giftRules: [
        { id: 'rule_rose', matchType: 'name', matchValue: 'Rose', trigger: 'SK_Gift_Rose', emotion: 'Blush', durationMs: 4000, itemDrop: true, dropCount: 3 },
        { id: 'rule_galaxy', matchType: 'name', matchValue: 'Galaxy', trigger: 'SK_Gift_Galaxy', emotion: 'Surprised', durationMs: 8000, itemDrop: true, dropCount: 10 },
        { id: 'rule_whale', matchType: 'name', matchValue: 'Whale', trigger: 'SK_Gift_Whale', emotion: 'Happy', durationMs: 6000, itemDrop: true, dropCount: 5 },
        { id: 'rule_big_gift', matchType: 'minDiamonds', matchValue: 100, trigger: 'SK_Gift_Big', emotion: 'Happy', durationMs: 5000, itemDrop: true, dropCount: 5 },
        { id: 'rule_mega_gift', matchType: 'minDiamonds', matchValue: 1000, trigger: 'SK_Gift_Mega', emotion: 'Surprised', durationMs: 10000, itemDrop: true, dropCount: 20 }
      ],
      // Emotion state machine configuration
      emotions: {
        autoReset: true,
        defaultDurationMs: 4000,
        neutralEmotion: 'Neutral',
        eventEmotions: {
          follow: { emotion: 'Happy', durationMs: 3500 },
          share: { emotion: 'Happy', durationMs: 3000 },
          subscribe: { emotion: 'Joy', durationMs: 6000 },
          question: { emotion: 'Thinking', durationMs: 4500 },
          likeStreak: { threshold: 50, emotion: 'Happy', durationMs: 2500 }
        }
      },
      // Item throw / drop triggers (VNyan item drop node graph integration)
      itemDrop: {
        enabled: true,
        triggerName: 'SK_ItemDrop',
        maxDropPerGift: 30
      }
    }
  },

  // Animaze/ChatPal WebSocket settings
  animaze: {
    enabled: false,
    host: '127.0.0.1',
    port: 9000,
    autoConnect: true,
    reconnectOnDisconnect: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 10
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
  
  // Speech/timing settings (for Animaze integration)
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
      if (stored) {
        // Deep merge stored config with defaults
        this.config = this._deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), stored);
      } else {
        this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        this.save();
      }
    } catch (error) {
      this.api.log(`Failed to load config: ${error.message}`, 'error');
      this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
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
    this.config = this._deepMerge(this.config, updates);
    this.save();
    return this.config;
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
    this.save();
  }
  
  /**
   * Deep merge two objects (with prototype pollution protection)
   * @private
   */
  _deepMerge(target, source) {
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
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

module.exports = { ConfigManager, DEFAULT_CONFIG };
