/**
 * TikTok Flame Overlay Plugin
 * 
 * WebGL-based flame border overlay for TikTok livestreams
 * Features configurable colors, intensity, speed, and frame thickness
 * Optimized for OBS Browser Source with transparent background
 * v3.0.0: Interactive trigger system for TikTok LIVE events
 */

const path = require('path');

/**
 * Preset definitions for the trigger system
 */
const TRIGGER_PRESETS = {
  default: {
    triggerCooldown: 2000,
    triggerMaxStack: 5,
    triggerRules: [
      { id: 'gift-big', event: 'gift', condition: 'coins >= 1000', action: 'dramatic', effect: 'lightning', duration: 10000, enabled: true },
      { id: 'gift-medium', event: 'gift', condition: 'coins >= 100', action: 'intensity-boost', amount: 0.5, duration: 5000, enabled: true },
      { id: 'gift-small', event: 'gift', condition: 'any', action: 'flash', duration: 800, enabled: true },
      { id: 'follow', event: 'follow', condition: 'any', action: 'pulse', intensity: 0.3, duration: 1500, enabled: true },
      { id: 'like-burst', event: 'like', condition: 'likeCount >= 50', action: 'intensity-boost', amount: 0.4, duration: 3000, enabled: true },
      { id: 'share', event: 'share', condition: 'any', action: 'effect-switch', effect: 'particles', duration: 3000, enabled: true },
      { id: 'subscribe', event: 'subscribe', condition: 'any', action: 'color-flash', color: '#ffd700', duration: 5000, enabled: true },
      { id: 'chat-color', event: 'chat', condition: 'keyword-match', action: 'color-change', duration: 15000, enabled: true }
    ]
  },
  hype: {
    triggerCooldown: 500,
    triggerMaxStack: 10,
    triggerRules: [
      { id: 'gift-big', event: 'gift', condition: 'coins >= 1000', action: 'dramatic', effect: 'lightning', duration: 8000, enabled: true },
      { id: 'gift-medium', event: 'gift', condition: 'coins >= 100', action: 'intensity-boost', amount: 0.8, duration: 4000, enabled: true },
      { id: 'gift-small', event: 'gift', condition: 'any', action: 'flash', duration: 500, enabled: true },
      { id: 'follow', event: 'follow', condition: 'any', action: 'pulse', intensity: 0.5, duration: 1000, enabled: true },
      { id: 'like-burst', event: 'like', condition: 'likeCount >= 20', action: 'intensity-boost', amount: 0.6, duration: 2000, enabled: true },
      { id: 'share', event: 'share', condition: 'any', action: 'effect-switch', effect: 'particles', duration: 2000, enabled: true },
      { id: 'subscribe', event: 'subscribe', condition: 'any', action: 'color-flash', color: '#ffd700', duration: 4000, enabled: true },
      { id: 'chat-color', event: 'chat', condition: 'keyword-match', action: 'color-change', duration: 10000, enabled: true }
    ]
  },
  chill: {
    triggerCooldown: 5000,
    triggerMaxStack: 3,
    triggerRules: [
      { id: 'gift-big', event: 'gift', condition: 'coins >= 1000', action: 'dramatic', effect: 'lightning', duration: 12000, enabled: true },
      { id: 'gift-medium', event: 'gift', condition: 'coins >= 100', action: 'intensity-boost', amount: 0.2, duration: 6000, enabled: true },
      { id: 'gift-small', event: 'gift', condition: 'any', action: 'flash', duration: 1000, enabled: true },
      { id: 'follow', event: 'follow', condition: 'any', action: 'pulse', intensity: 0.2, duration: 2000, enabled: true },
      { id: 'like-burst', event: 'like', condition: 'likeCount >= 100', action: 'intensity-boost', amount: 0.2, duration: 4000, enabled: true },
      { id: 'share', event: 'share', condition: 'any', action: 'effect-switch', effect: 'particles', duration: 4000, enabled: true },
      { id: 'subscribe', event: 'subscribe', condition: 'any', action: 'color-flash', color: '#ffd700', duration: 6000, enabled: true },
      { id: 'chat-color', event: 'chat', condition: 'keyword-match', action: 'color-change', duration: 20000, enabled: true }
    ]
  },
  party: {
    triggerCooldown: 300,
    triggerMaxStack: 15,
    triggerRules: [
      { id: 'gift-big', event: 'gift', condition: 'coins >= 500', action: 'dramatic', effect: 'lightning', duration: 8000, enabled: true },
      { id: 'gift-medium', event: 'gift', condition: 'coins >= 50', action: 'intensity-boost', amount: 1.0, duration: 4000, enabled: true },
      { id: 'gift-small', event: 'gift', condition: 'any', action: 'color-flash', color: '#ff00ff', duration: 600, enabled: true },
      { id: 'follow', event: 'follow', condition: 'any', action: 'pulse', intensity: 0.6, duration: 1000, enabled: true },
      { id: 'like-burst', event: 'like', condition: 'likeCount >= 10', action: 'intensity-boost', amount: 0.7, duration: 2000, enabled: true },
      { id: 'share', event: 'share', condition: 'any', action: 'dramatic', effect: 'energy', duration: 3000, enabled: true },
      { id: 'subscribe', event: 'subscribe', condition: 'any', action: 'color-flash', color: '#ffd700', duration: 5000, enabled: true },
      { id: 'chat-color', event: 'chat', condition: 'keyword-match', action: 'color-change', duration: 12000, enabled: true }
    ]
  }
};

/** Color map for chat color commands */
const CHAT_COLOR_MAP = {
  '!red': '#ff0000',
  '!blue': '#0066ff',
  '!green': '#00ff00',
  '!purple': '#9900ff',
  '!pink': '#ff69b4',
  '!gold': '#ffd700',
  '!cyan': '#00ffff',
  '!orange': '#ff6600',
  '!white': '#ffffff'
};

const FEATURE_TEST_EVENTS = {
  'gift-small': {
    event: 'gift',
    data: { giftId: '5655', giftName: 'Rose', diamondCount: 1, repeatCount: 1 }
  },
  'gift-medium': {
    event: 'gift',
    data: { giftId: '5655', giftName: 'Rose', diamondCount: 150, repeatCount: 1 }
  },
  'gift-big': {
    event: 'gift',
    data: { giftId: '5655', giftName: 'Rose', diamondCount: 1200, repeatCount: 1 }
  },
  follow: {
    event: 'follow',
    data: { userId: 'flame-test-user', uniqueId: 'flame_test', nickname: 'Flame Test' }
  },
  'like-burst': {
    event: 'like',
    data: { userId: 'flame-test-user', uniqueId: 'flame_test', likeCount: 100, totalLikeCount: 100 }
  },
  share: {
    event: 'share',
    data: { userId: 'flame-test-user', uniqueId: 'flame_test', nickname: 'Flame Test' }
  },
  subscribe: {
    event: 'subscribe',
    data: { userId: 'flame-test-user', uniqueId: 'flame_test', nickname: 'Flame Test' }
  },
  'chat-red': {
    event: 'chat',
    data: { userId: 'flame-test-user', uniqueId: 'flame_test', nickname: 'Flame Test', comment: '!red' }
  }
};

const RENDERER_ASSETS = new Set([
  'index.html',
  'effects-engine.js',
  'post-processor.js'
]);

const TEXTURE_ASSETS = new Set([
  'nzw.png',
  'firetex.png'
]);

const KNOWN_EFFECTS = new Set(['flames', 'particles', 'energy', 'lightning']);
const KNOWN_ACTIONS = new Set([
  'dramatic',
  'intensity-boost',
  'flash',
  'pulse',
  'effect-switch',
  'color-flash',
  'color-change'
]);
const KNOWN_EVENTS = new Set(['gift', 'follow', 'like', 'share', 'chat', 'subscribe']);
const CONFIG_ENUMS = {
  effectType: KNOWN_EFFECTS,
  resolutionPreset: new Set([
    'tiktok-portrait',
    'tiktok-landscape',
    'hd-portrait',
    'hd-landscape',
    '2k-portrait',
    '2k-landscape',
    '4k-portrait',
    '4k-landscape',
    'custom'
  ]),
  frameMode: new Set(['bottom', 'top', 'sides', 'all']),
  animationEasing: new Set(['linear', 'sine', 'quad', 'elastic']),
  qualityMode: new Set(['obs-safe', 'max-quality', 'low-load']),
  triggerPreset: new Set([...Object.keys(TRIGGER_PRESETS), 'custom'])
};
const NUMERIC_CONFIG_RANGES = {
  customWidth: { min: 160, max: 7680, integer: true },
  customHeight: { min: 160, max: 7680, integer: true },
  frameThickness: { min: 1, max: 2000, integer: true },
  backgroundTintOpacity: { min: 0, max: 1 },
  flameSpeed: { min: 0, max: 5 },
  flameIntensity: { min: 0, max: 5 },
  flameBrightness: { min: 0, max: 2 },
  noiseOctaves: { min: 1, max: 12, integer: true },
  edgeFeather: { min: 0, max: 1 },
  frameCurve: { min: 0, max: 1 },
  frameNoiseAmount: { min: 0, max: 1 },
  pulseAmount: { min: 0, max: 1 },
  pulseSpeed: { min: 0.1, max: 3 },
  bloomIntensity: { min: 0, max: 2 },
  bloomThreshold: { min: 0, max: 1 },
  bloomRadius: { min: 1, max: 10 },
  layerCount: { min: 1, max: 3, integer: true },
  layerParallax: { min: 0, max: 1 },
  chromaticAberration: { min: 0, max: 0.02 },
  filmGrain: { min: 0, max: 0.1 },
  depthIntensity: { min: 0, max: 1 },
  smokeIntensity: { min: 0, max: 1 },
  smokeSpeed: { min: 0.1, max: 1 },
  sparkDensity: { min: 0, max: 2 },
  heatDistortionStrength: { min: 0, max: 1 },
  cinematicContrast: { min: 0, max: 2 },
  coreWhiteness: { min: 0, max: 1 },
  emberTrailAmount: { min: 0, max: 1 },
  triggerCooldown: { min: 0, max: 600000, integer: true },
  triggerMaxStack: { min: 1, max: 50, integer: true },
  visualProfileVersion: { min: 1, max: 100, integer: true }
};
const BOOLEAN_CONFIG_KEYS = new Set([
  'enableGlow',
  'enableAdditiveBlend',
  'maskOnlyEdges',
  'highDPI',
  'useHighQualityTextures',
  'detailScaleAuto',
  'pulseEnabled',
  'bloomEnabled',
  'layersEnabled',
  'smokeEnabled',
  'sparkEnabled',
  'heatDistortionEnabled',
  'triggersEnabled',
  'chatColorCommands'
]);

class FlameOverlayPlugin {
    constructor(api) {
        this.api = api;
        this.config = null;
        this.lastTriggerTime = new Map();
        this.activeTriggerCount = 0;
        this.activeTriggerTimers = new Map();
        this.triggerLog = [];
    }

    async init() {
        this.api.log('?? [FLAME OVERLAY] Initializing TikTok Flame Overlay Plugin...', 'info');

        // Load configuration
        this.loadConfig();

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers unconditionally; runtime config gates processing.
        this.registerTikTokEventHandlers();

        // Register flow actions
        this.registerFlowActions();

        this.api.log('? [FLAME OVERLAY] Plugin initialized successfully', 'info');
        this.logRoutes();
    }

    /**
     * Load plugin configuration from database or defaults
     */
    loadConfig() {
        const savedConfig = this.api.getConfig('settings');
        
        // Default configuration with all features
        const defaultConfig = {
            // Effect type selection
            effectType: 'flames', // 'flames', 'particles', 'energy', 'lightning'
            qualityMode: 'obs-safe',
            
            // Resolution settings
            resolutionPreset: 'tiktok-portrait',
            customWidth: 720,
            customHeight: 1280,
            
            // Frame settings
            frameMode: 'bottom', // 'bottom', 'top', 'sides', 'all'
            frameThickness: 150, // pixels
            
            // Frame positioning (for multiple frames in preview)
            framePositions: [
                { x: 0, y: 0, width: 100, height: 100 } // Default: full screen
            ],
            
            // Flame appearance
            flameColor: '#ff6600', // Main flame color
            backgroundTint: '#000000', // Background tint color
            backgroundTintOpacity: 0.0, // 0.0 = fully transparent
            
            // Flame animation
            flameSpeed: 0.46, // Time multiplier
            flameIntensity: 1.18, // Magnitude/turbulence
            flameBrightness: 0.34, // Overall brightness multiplier
            
            // Visual effects
            enableGlow: true,
            enableAdditiveBlend: true,
            
            // Advanced
            maskOnlyEdges: true, // Only show flames on frame edges
            highDPI: true, // Handle high DPI displays
            
            // ===== NEW FEATURES (v2.2.0) =====
            // Quality Settings
            noiseOctaves: 9, // 4-12 octaves for fBm
            useHighQualityTextures: true, // Enable when HQ textures are available
            detailScaleAuto: true, // Automatic detail scaling based on resolution
            
            // Edge Settings
            edgeFeather: 0.46, // 0.0-1.0: Soft edge blending amount
            frameCurve: 0.1, // 0.0-1.0: Curved frame edges (0=sharp corners)
            frameNoiseAmount: 0.12, // 0.0-1.0: Noise modulation on frame edges
            
            // Animation
            animationEasing: 'linear', // 'linear', 'sine', 'quad', 'elastic'
            pulseEnabled: false, // Enable pulsing/breathing animation
            pulseAmount: 0.16, // 0.0-1.0: Pulse intensity
            pulseSpeed: 1.0, // 0.1-3.0: Pulse frequency
            
            // Bloom
            bloomEnabled: true, // Enable bloom post-processing
            bloomIntensity: 0.78, // 0.0-2.0: Bloom strength
            bloomThreshold: 0.58, // 0.0-1.0: Brightness threshold for bloom
            bloomRadius: 4, // 1-10: Bloom blur radius
            
            // Layers
            layersEnabled: true, // Enable multi-layer compositing
            layerCount: 2, // 1-3: Number of layers
            layerParallax: 0.18, // 0.0-1.0: Parallax effect strength
            
            // Post-FX
            chromaticAberration: 0.004, // 0.0-0.02: RGB channel offset
            filmGrain: 0.015, // 0.0-0.1: Film grain intensity
            depthIntensity: 0.66, // 0.0-1.0: Fake depth/inner glow
            cinematicContrast: 1.12,
            coreWhiteness: 0.66,
            emberTrailAmount: 0.28,
            sparkEnabled: true,
            sparkDensity: 0.52,
            heatDistortionEnabled: true,
            heatDistortionStrength: 0.24,
            
            // Smoke
            smokeEnabled: false, // Enable smoke layer
            smokeIntensity: 0.18, // 0.0-1.0: Smoke opacity
            smokeSpeed: 0.22, // 0.1-1.0: Smoke movement speed
            smokeColor: '#2d2623', // Smoke color

            // ===== TRIGGER SYSTEM (v3.0.0) =====
            triggersEnabled: true,
            triggerRules: TRIGGER_PRESETS.default.triggerRules,
            chatColorCommands: true,
            triggerCooldown: 2000,
            triggerMaxStack: 5,
            triggerPreset: 'default',
            visualProfileVersion: 3
        };
        
        this.defaultConfig = this.cloneConfig(defaultConfig);

        // Merge saved config with defaults to ensure backward compatibility,
        // but do not let malformed persisted data poison runtime handlers.
        this.config = this.normalizeLoadedConfig(savedConfig, defaultConfig);
        this.applyVisualUpgradeDefaults(this.isPlainObject(savedConfig) ? savedConfig : null);
    }

    normalizeLoadedConfig(savedConfig, defaultConfig) {
        const baseConfig = this.cloneConfig(defaultConfig);
        if (!this.isPlainObject(savedConfig)) {
            return baseConfig;
        }

        const result = this.normalizeConfigUpdate(savedConfig, baseConfig, { strict: false });
        return { ...baseConfig, ...result.value };
    }

    applyVisualUpgradeDefaults(savedConfig) {
        if (!savedConfig || Number(savedConfig.visualProfileVersion) >= 3) return;

        const upgrades = {
            flameIntensity: { from: [1.3], to: this.defaultConfig.flameIntensity },
            flameBrightness: { from: [0.25, 0.38], to: this.defaultConfig.flameBrightness },
            noiseOctaves: { from: [8], to: this.defaultConfig.noiseOctaves },
            edgeFeather: { from: [0.3, 0.42], to: this.defaultConfig.edgeFeather },
            frameCurve: { from: [0, 0.08], to: this.defaultConfig.frameCurve },
            frameNoiseAmount: { from: [0, 0.12], to: this.defaultConfig.frameNoiseAmount },
            bloomIntensity: { from: [0.8], to: this.defaultConfig.bloomIntensity },
            bloomThreshold: { from: [0.6], to: this.defaultConfig.bloomThreshold },
            bloomRadius: { from: [4], to: this.defaultConfig.bloomRadius },
            chromaticAberration: { from: [0.005], to: this.defaultConfig.chromaticAberration },
            filmGrain: { from: [0.03], to: this.defaultConfig.filmGrain },
            depthIntensity: { from: [0.5, 0.65], to: this.defaultConfig.depthIntensity },
            smokeIntensity: { from: [0.4], to: this.defaultConfig.smokeIntensity },
            smokeSpeed: { from: [0.3], to: this.defaultConfig.smokeSpeed },
            smokeColor: { from: ['#333333'], to: this.defaultConfig.smokeColor }
        };

        for (const [field, { from, to }] of Object.entries(upgrades)) {
            if (savedConfig[field] === undefined || from.includes(savedConfig[field])) {
                this.config[field] = to;
            }
        }

        for (const field of [
            'qualityMode',
            'sparkEnabled',
            'sparkDensity',
            'heatDistortionEnabled',
            'heatDistortionStrength',
            'cinematicContrast',
            'coreWhiteness',
            'emberTrailAmount'
        ]) {
            if (savedConfig[field] === undefined) {
                this.config[field] = this.defaultConfig[field];
            }
        }

        this.config.visualProfileVersion = 3;
        this.saveConfig();
    }

    /**
     * Save plugin configuration to database
     */
    saveConfig() {
        const result = this.api.setConfig('settings', this.config);
        if (result === false) {
            this.api.log('[FLAME OVERLAY] Failed to persist configuration', 'error');
            return false;
        }
        return true;
    }

    /**
     * Get resolution based on preset or custom values
     */
    getResolution() {
        const config = this.getRuntimeConfig();
        const presets = {
            'tiktok-portrait': { width: 720, height: 1280 },
            'tiktok-landscape': { width: 1280, height: 720 },
            'hd-portrait': { width: 1080, height: 1920 },
            'hd-landscape': { width: 1920, height: 1080 },
            '2k-portrait': { width: 1440, height: 2560 },
            '2k-landscape': { width: 2560, height: 1440 },
            '4k-portrait': { width: 2160, height: 3840 },
            '4k-landscape': { width: 3840, height: 2160 },
            'custom': { width: config.customWidth, height: config.customHeight }
        };
        
        return presets[config.resolutionPreset] || presets['tiktok-portrait'];
    }

    /**
     * Read the shared gift catalog from whichever database adapter is active.
     * @returns {Array<object>}
     */
    getGiftCatalog() {
        const database = this.api.getDatabase?.();
        if (!database) return [];

        const sources = [
            () => database.getGiftCatalog?.(),
            () => database.getGifts?.(),
            () => database.giftCatalog,
            () => database.gifts
        ];

        for (const source of sources) {
            try {
                const gifts = source();
                if (Array.isArray(gifts)) return gifts;
            } catch (error) {
                this.api.log(`⚠️ [FLAME OVERLAY] Gift catalog source failed: ${error.message}`, 'debug');
            }
        }

        return [];
    }

    /**
     * Convert the many TikTok gift payload variants into stable rule fields.
     * @param {object} data - Raw TikTok gift event
     * @returns {object}
     */
    normalizeGiftEvent(data = {}) {
        const gift = data.gift || data.giftInfo || data.extendedGiftInfo || {};
        const repeatCount = this.firstFiniteNumber([
            data.repeatCount,
            data.repeat_count,
            data.comboCount,
            data.amount,
            data.count,
            gift.repeatCount,
            gift.repeat_count,
            gift.repeat_count_total
        ], 1);

        const diamondCount = this.firstFiniteNumber([
            data.diamondCount,
            data.diamond_count,
            data.diamonds,
            data.giftValue,
            data.gift_value,
            gift.diamondCount,
            gift.diamond_count,
            gift.diamonds,
            gift.cost,
            gift.value
        ], 0);

        const directCoins = this.firstFiniteNumber([
            data.coins,
            data.coinCount,
            data.giftCoins,
            data.gift_coins,
            data.totalCoins,
            data.total_coins,
            gift.coins,
            gift.coinCount,
            gift.giftCoins,
            gift.gift_coins
        ], 0);

        const coins = directCoins || (diamondCount * repeatCount) || diamondCount || 1;
        const giftName = data.giftName || data.gift_name || data.name || gift.name || gift.giftName || gift.gift_name || '';
        const giftId = data.giftId || data.gift_id || data.id || gift.id || gift.giftId || gift.gift_id || '';

        return {
            ...data,
            gift,
            giftId,
            giftName,
            repeatCount,
            diamondCount,
            giftValue: coins,
            giftCoins: coins,
            coins
        };
    }

    firstFiniteNumber(values, fallback = 0) {
        for (const value of values) {
            const number = Number(value);
            if (Number.isFinite(number) && number > 0) return number;
        }
        return fallback;
    }

    normalizeTriggerDuration(duration, fallback = 5000) {
        const number = Number(duration);
        if (!Number.isFinite(number) || number <= 0) return fallback;
        return Math.max(100, Math.min(number, 30000));
    }

    isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    cloneConfig(config) {
        return JSON.parse(JSON.stringify(config));
    }

    getRuntimeConfig() {
        if (this.isPlainObject(this.config)) return this.config;

        if (this.defaultConfig) {
            return this.cloneConfig(this.defaultConfig);
        }

        return {
            triggersEnabled: true,
            triggerRules: [],
            triggerCooldown: 2000,
            triggerMaxStack: 5,
            chatColorCommands: true
        };
    }

    clampNumber(value, range, fallback) {
        const fallbackNumber = Number(fallback);
        let number = Number(value);

        if (!Number.isFinite(number)) {
            number = Number.isFinite(fallbackNumber) ? fallbackNumber : range.min;
        }

        number = Math.max(range.min, Math.min(number, range.max));
        return range.integer ? Math.round(number) : number;
    }

    normalizeBoolean(value) {
        if (value === true || value === 'true' || value === 1 || value === '1') return true;
        if (value === false || value === 'false' || value === 0 || value === '0') return false;
        return Boolean(value);
    }

    normalizeConfigUpdate(input, baseConfig, options = {}) {
        const strict = options.strict !== false;
        const errors = [];
        const value = {};

        if (!this.isPlainObject(input)) {
            return {
                value,
                errors: strict ? ['Configuration body must be an object'] : []
            };
        }

        const allowedKeys = new Set(Object.keys(baseConfig));

        for (const [key, rawValue] of Object.entries(input)) {
            if (!allowedKeys.has(key)) continue;

            if (key === 'triggerRules') {
                const result = this.normalizeTriggerRules(rawValue, { strict });
                if (result.errors.length) {
                    errors.push(...result.errors);
                } else {
                    value.triggerRules = result.rules;
                }
                continue;
            }

            if (NUMERIC_CONFIG_RANGES[key]) {
                value[key] = this.clampNumber(rawValue, NUMERIC_CONFIG_RANGES[key], baseConfig[key]);
                continue;
            }

            if (BOOLEAN_CONFIG_KEYS.has(key)) {
                value[key] = this.normalizeBoolean(rawValue);
                continue;
            }

            if (CONFIG_ENUMS[key]) {
                if (typeof rawValue === 'string' && CONFIG_ENUMS[key].has(rawValue)) {
                    value[key] = rawValue;
                } else if (strict) {
                    errors.push(`${key} must be one of: ${Array.from(CONFIG_ENUMS[key]).join(', ')}`);
                }
                continue;
            }

            if (key === 'framePositions') {
                if (Array.isArray(rawValue)) {
                    value.framePositions = rawValue
                        .filter(position => this.isPlainObject(position))
                        .map(position => ({
                            x: this.clampNumber(position.x, { min: 0, max: 100, integer: false }, 0),
                            y: this.clampNumber(position.y, { min: 0, max: 100, integer: false }, 0),
                            width: this.clampNumber(position.width, { min: 1, max: 100, integer: false }, 100),
                            height: this.clampNumber(position.height, { min: 1, max: 100, integer: false }, 100)
                        }));
                } else if (strict) {
                    errors.push('framePositions must be an array');
                }
                continue;
            }

            if (typeof baseConfig[key] === 'string') {
                if (typeof rawValue === 'string') {
                    value[key] = rawValue;
                } else if (strict) {
                    errors.push(`${key} must be a string`);
                }
                continue;
            }

            value[key] = rawValue;
        }

        return { value, errors };
    }

    normalizeTriggerRules(rules, options = {}) {
        const strict = options.strict !== false;
        const errors = [];
        const normalizedRules = [];

        if (!Array.isArray(rules)) {
            return {
                rules: [],
                errors: strict ? ['rules must be an array'] : []
            };
        }

        rules.forEach((rule, index) => {
            const result = this.normalizeTriggerRule(rule, index);
            if (result.error) {
                if (strict) {
                    errors.push(result.error);
                }
                return;
            }
            normalizedRules.push(result.rule);
        });

        return { rules: normalizedRules, errors };
    }

    normalizeTriggerRule(rule, index = 0) {
        if (!this.isPlainObject(rule)) {
            return { error: `Rule ${index + 1} must be an object` };
        }

        const event = typeof rule.event === 'string' ? rule.event.trim() : '';
        if (!KNOWN_EVENTS.has(event)) {
            return { error: `Rule ${index + 1} has unknown event: ${rule.event}` };
        }

        const action = typeof rule.action === 'string' ? rule.action.trim() : '';
        if (!KNOWN_ACTIONS.has(action)) {
            return { error: `Rule ${index + 1} has unknown action: ${rule.action}` };
        }

        const normalized = {
            id: this.normalizeIdentifier(rule.id, `${event}-${action}-${index + 1}`),
            event,
            condition: typeof rule.condition === 'string' && rule.condition.trim()
                ? rule.condition.trim().slice(0, 200)
                : 'any',
            action,
            duration: this.normalizeTriggerDuration(rule.duration),
            enabled: rule.enabled !== false
        };

        if (rule.effect !== undefined) {
            const effect = typeof rule.effect === 'string' ? rule.effect.trim() : '';
            if (!KNOWN_EFFECTS.has(effect)) {
                return { error: `Rule ${index + 1} has unknown effect: ${rule.effect}` };
            }
            normalized.effect = effect;
        }

        if (rule.amount !== undefined) {
            normalized.amount = this.clampNumber(rule.amount, { min: 0, max: 5 }, 0);
        }
        if (rule.intensity !== undefined) {
            normalized.intensity = this.clampNumber(rule.intensity, { min: 0, max: 5 }, 0);
        }
        if (rule.intensityBoost !== undefined) {
            normalized.intensityBoost = this.clampNumber(rule.intensityBoost, { min: 0, max: 5 }, 0);
        }
        if (typeof rule.color === 'string') {
            normalized.color = rule.color.trim().slice(0, 32);
        }

        return { rule: normalized };
    }

    normalizeIdentifier(value, fallback) {
        const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
        const normalized = raw.replace(/[^A-Za-z0-9:_-]/g, '-').slice(0, 64);
        return normalized || fallback;
    }

    normalizeManualTrigger(input, options = {}) {
        const errors = [];
        const source = typeof options.source === 'string' && options.source.trim()
            ? options.source.trim().slice(0, 120)
            : 'manual';

        if (!this.isPlainObject(input)) {
            return { trigger: null, errors: ['Trigger body must be an object'] };
        }

        const rawType = input.type ?? input.action ?? input.burstType ?? options.defaultType;
        const type = typeof rawType === 'string' ? rawType.trim() : '';
        if (!KNOWN_ACTIONS.has(type)) {
            errors.push(`Unknown trigger type: ${rawType}`);
        }

        const trigger = {
            type,
            duration: this.normalizeTriggerDuration(input.duration),
            revert: input.revert !== false,
            source: typeof input.source === 'string' && input.source.trim()
                ? input.source.trim().slice(0, 120)
                : source
        };

        const rawEffect = input.effect ?? input.effectType;
        if (rawEffect !== undefined) {
            const effect = typeof rawEffect === 'string' ? rawEffect.trim() : '';
            if (!KNOWN_EFFECTS.has(effect)) {
                errors.push(`Unknown effect: ${rawEffect}`);
            } else {
                trigger.effect = effect;
            }
        }

        if (input.amount !== undefined) {
            trigger.amount = this.clampNumber(input.amount, { min: 0, max: 5 }, 0);
        }
        if (input.intensity !== undefined) {
            trigger.intensity = this.clampNumber(input.intensity, { min: 0, max: 5 }, 0);
        }
        if (input.intensityBoost !== undefined) {
            trigger.intensityBoost = this.clampNumber(input.intensityBoost, { min: 0, max: 5 }, 0);
        }
        if (typeof input.color === 'string') {
            trigger.color = input.color.trim().slice(0, 32);
        }
        if (typeof input.cooldownKey === 'string') {
            trigger.cooldownKey = input.cooldownKey.trim().slice(0, 120);
        }
        if (input.bypassCooldown === true) {
            trigger.bypassCooldown = true;
        }
        if (input.bypassStackLimit === true) {
            trigger.bypassStackLimit = true;
        }

        return { trigger, errors };
    }

    normalizeFeatureTestType(body) {
        const input = this.isPlainObject(body) ? body : {};
        const type = input.type ?? input.event ?? 'gift-small';

        if (typeof type !== 'string' || !FEATURE_TEST_EVENTS[type]) {
            return {
                type: null,
                error: 'Invalid flame overlay feature test type'
            };
        }

        return { type };
    }

    normalizePresetName(name) {
        const value = typeof name === 'string' ? name.trim() : '';
        if (!/^[A-Za-z0-9 _-]{1,64}$/.test(value)) {
            return { error: 'Invalid preset name' };
        }
        return { value };
    }

    getStoredPresets() {
        const presets = this.api.getConfig('presets') || {};
        return this.isPlainObject(presets) ? presets : {};
    }

    persistConfig(nextConfig) {
        const previousConfig = this.config;
        this.config = nextConfig;

        if (!this.saveConfig()) {
            this.config = previousConfig;
            return false;
        }

        return true;
    }

    serveAllowlistedFile(res, rootDir, requestedName, allowedFiles) {
        const fileName = typeof requestedName === 'string' ? requestedName : '';
        const rootPath = path.resolve(rootDir);

        if (!allowedFiles.has(fileName) || path.basename(fileName) !== fileName) {
            return res.status(404).json({ success: false, error: 'Asset not found' });
        }

        const filePath = path.resolve(rootPath, fileName);
        if (!filePath.startsWith(`${rootPath}${path.sep}`)) {
            return res.status(404).json({ success: false, error: 'Asset not found' });
        }

        return res.sendFile(filePath);
    }

    /**
     * Register all HTTP routes
     */
    registerRoutes() {
        // Serve plugin UI (settings page)
        this.api.registerRoute('get', '/flame-overlay/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui', 'settings.html');
            res.sendFile(uiPath);
        });

        // Serve overlay/renderer
        this.api.registerRoute('get', '/flame-overlay/overlay', (req, res) => {
            const overlayPath = path.join(__dirname, 'renderer', 'index.html');
            res.sendFile(overlayPath);
        });

        // Get configuration
        this.api.registerRoute('get', '/api/flame-overlay/config', (req, res) => {
            try {
                res.json({ success: true, config: this.getRuntimeConfig() });
            } catch (error) {
                this.api.log(`? [FLAME OVERLAY] Error getting config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update configuration
        this.api.registerRoute('post', '/api/flame-overlay/config', (req, res) => {
            try {
                const baseConfig = this.getRuntimeConfig();
                const result = this.normalizeConfigUpdate(req.body, baseConfig, { strict: true });
                if (result.errors.length) {
                    return res.status(400).json({ success: false, error: result.errors.join('; ') });
                }

                const nextConfig = { ...baseConfig, ...result.value };
                if (!this.persistConfig(nextConfig)) {
                    return res.status(500).json({ success: false, error: 'Failed to save configuration' });
                }
                
                // Notify overlays about config change
                this.api.emit('flame-overlay:config-update', { config: this.config });
                
                res.json({ success: true, message: 'Configuration updated' });
            } catch (error) {
                this.api.log(`? [FLAME OVERLAY] Error updating config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get status
        this.api.registerRoute('get', '/api/flame-overlay/status', (req, res) => {
            try {
                const resolution = this.getResolution();
                res.json({
                    success: true,
                    config: this.getRuntimeConfig(),
                    resolution: resolution
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get the current TikTok gift catalog for rule creation
        this.api.registerRoute('get', '/api/flame-overlay/gift-catalog', (req, res) => {
            try {
                res.json({ success: true, gifts: this.getGiftCatalog() });
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Error loading gift catalog: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET /api/flame-overlay/presets - Load all presets
        this.api.registerRoute('get', '/api/flame-overlay/presets', (req, res) => {
            try {
                const presets = this.getStoredPresets();
                res.json({ success: true, presets });
            } catch (error) {
                this.api.log(`? [FLAME OVERLAY] Error loading presets: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/flame-overlay/presets/:name - Save preset
        this.api.registerRoute('post', '/api/flame-overlay/presets/:name', (req, res) => {
            try {
                const presetName = this.normalizePresetName(req.params?.name);
                if (presetName.error) {
                    return res.status(400).json({ success: false, error: presetName.error });
                }

                const presets = this.getStoredPresets();
                presets[presetName.value] = {
                    config: { ...this.getRuntimeConfig() },
                    createdAt: new Date().toISOString()
                };

                if (this.api.setConfig('presets', presets) === false) {
                    return res.status(500).json({ success: false, error: 'Failed to save preset' });
                }

                res.json({ success: true, message: `Preset "${presetName.value}" saved` });
            } catch (error) {
                this.api.log(`? [FLAME OVERLAY] Error saving preset: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/flame-overlay/presets/:name/load - Load preset
        this.api.registerRoute('post', '/api/flame-overlay/presets/:name/load', (req, res) => {
            try {
                const presetName = this.normalizePresetName(req.params?.name);
                if (presetName.error) {
                    return res.status(400).json({ success: false, error: presetName.error });
                }

                const presets = this.getStoredPresets();
                if (!presets[presetName.value]) {
                    return res.status(404).json({ success: false, error: 'Preset not found' });
                }

                const baseConfig = this.getRuntimeConfig();
                const result = this.normalizeConfigUpdate(presets[presetName.value].config, baseConfig, { strict: false });
                const nextConfig = { ...baseConfig, ...result.value };
                if (!this.persistConfig(nextConfig)) {
                    return res.status(500).json({ success: false, error: 'Failed to save configuration' });
                }

                this.api.emit('flame-overlay:config-update', { config: this.config });
                res.json({ success: true, message: `Preset "${presetName.value}" loaded` });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // DELETE /api/flame-overlay/presets/:name - Delete preset
        this.api.registerRoute('delete', '/api/flame-overlay/presets/:name', (req, res) => {
            try {
                const presetName = this.normalizePresetName(req.params?.name);
                if (presetName.error) {
                    return res.status(400).json({ success: false, error: presetName.error });
                }

                const presets = this.getStoredPresets();
                if (!presets[presetName.value]) {
                    return res.status(404).json({ success: false, error: 'Preset not found' });
                }
                delete presets[presetName.value];

                if (this.api.setConfig('presets', presets) === false) {
                    return res.status(500).json({ success: false, error: 'Failed to delete preset' });
                }

                res.json({ success: true, message: `Preset "${presetName.value}" deleted` });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Serve texture files through PluginAPI so stale routes respect plugin lifecycle.
        const textureDir = path.join(__dirname, 'textures');
        this.api.registerRoute('get', '/plugins/flame-overlay/textures/:texture', (req, res) => {
            this.serveAllowlistedFile(res, textureDir, req.params?.texture, TEXTURE_ASSETS);
        });

        // Serve renderer dependencies. Legacy flame.js was removed in v3.
        const rendererDir = path.join(__dirname, 'renderer');
        this.api.registerRoute('get', '/flame-overlay/:asset', (req, res) => {
            this.serveAllowlistedFile(res, rendererDir, req.params?.asset, RENDERER_ASSETS);
        });

        // --- Trigger API endpoints (v3.0.0) ---

        // Manual trigger endpoint (for testing / IFTTT / other plugins)
        this.api.registerRoute('post', '/api/flame-overlay/trigger', (req, res) => {
            try {
                const normalized = this.normalizeManualTrigger(req.body, { source: 'manual' });
                if (normalized.errors.length) {
                    return res.status(400).json({ success: false, error: normalized.errors.join('; ') });
                }
                const result = this.dispatchTrigger(normalized.trigger);
                res.json({
                    success: true,
                    message: result.accepted ? 'Trigger sent' : 'Trigger skipped',
                    ...this.formatTriggerResult(result)
                });
            } catch (error) {
                this.api.log(`? [FLAME OVERLAY] Trigger error: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // App-internal feature test endpoint. This runs synthetic TikTok events
        // through the same rule/handler path as live events, while bypassing
        // cooldown so repeated UI tests are deterministic.
        this.api.registerRoute('post', '/api/flame-overlay/test-event', (req, res) => {
            try {
                const normalized = this.normalizeFeatureTestType(req.body);
                if (normalized.error) {
                    return res.status(400).json({
                        success: false,
                        error: normalized.error,
                        availableTypes: Object.keys(FEATURE_TEST_EVENTS)
                    });
                }

                const result = this.runFeatureTest(normalized.type);
                if (!result.success) {
                    return res.status(400).json(result);
                }
                res.json(result);
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Feature test error: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Clear active overlay triggers if an effect got stuck or OBS reconnects mid-animation
        this.api.registerRoute('post', '/api/flame-overlay/clear-triggers', (req, res) => {
            try {
                this.clearActiveTriggers();
                res.json({ success: true, message: 'Active triggers cleared' });
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Clear trigger error: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get trigger rules
        this.api.registerRoute('get', '/api/flame-overlay/triggers', (req, res) => {
            try {
                const rules = Array.isArray(this.getRuntimeConfig().triggerRules)
                    ? this.getRuntimeConfig().triggerRules
                    : [];
                res.json({ success: true, rules });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Save trigger rules
        this.api.registerRoute('post', '/api/flame-overlay/triggers', (req, res) => {
            try {
                const result = this.normalizeTriggerRules(req.body?.rules, { strict: true });
                if (result.errors.length) {
                    return res.status(400).json({ success: false, error: result.errors.join('; ') });
                }

                const nextConfig = {
                    ...this.getRuntimeConfig(),
                    triggerRules: result.rules,
                    triggerPreset: 'custom'
                };

                if (!this.persistConfig(nextConfig)) {
                    return res.status(500).json({ success: false, error: 'Failed to save trigger rules' });
                }
                res.json({ success: true, message: 'Trigger rules saved' });
            } catch (error) {
                this.api.log(`? [FLAME OVERLAY] Error saving triggers: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get available presets
        this.api.registerRoute('get', '/api/flame-overlay/trigger-presets', (req, res) => {
            try {
                const presetNames = Object.keys(TRIGGER_PRESETS);
                res.json({ success: true, presets: presetNames, current: this.getRuntimeConfig().triggerPreset || 'default' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Activate a preset
        this.api.registerRoute('post', '/api/flame-overlay/trigger-preset/:name', (req, res) => {
            try {
                const presetName = this.normalizePresetName(req.params?.name);
                if (presetName.error) {
                    return res.status(400).json({ success: false, error: presetName.error });
                }

                if (!TRIGGER_PRESETS[presetName.value]) {
                    return res.status(400).json({ success: false, error: `Unknown preset: ${presetName.value}` });
                }
                const preset = TRIGGER_PRESETS[presetName.value];
                const normalizedRules = this.normalizeTriggerRules(preset.triggerRules, { strict: false }).rules;
                const nextConfig = {
                    ...this.getRuntimeConfig(),
                    triggerRules: normalizedRules,
                    triggerCooldown: preset.triggerCooldown,
                    triggerMaxStack: preset.triggerMaxStack,
                    triggerPreset: presetName.value
                };

                if (!this.persistConfig(nextConfig)) {
                    return res.status(500).json({ success: false, error: 'Failed to save preset configuration' });
                }
                const name = presetName.value;
                this.api.log(`?? [FLAME OVERLAY] Preset '${name}' activated`, 'info');
                res.json({ success: true, message: `Preset '${presetName.value}' activated`, config: this.config });
            } catch (error) {
                this.api.log(`? [FLAME OVERLAY] Error activating preset: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    /**
     * Register TikTok event handlers for interactive triggers
     */
    registerTikTokEventHandlers() {
        this.api.registerTikTokEvent('gift', (data) => {
            return this.handleTikTokEvent('gift', data);
        });

        this.api.registerTikTokEvent('follow', (data) => {
            return this.handleTikTokEvent('follow', data);
        });

        this.api.registerTikTokEvent('like', (data) => {
            return this.handleTikTokEvent('like', data);
        });

        this.api.registerTikTokEvent('share', (data) => {
            return this.handleTikTokEvent('share', data);
        });

        this.api.registerTikTokEvent('chat', (data) => {
            return this.handleTikTokEvent('chat', data);
        });

        this.api.registerTikTokEvent('subscribe', (data) => {
            return this.handleTikTokEvent('subscribe', data);
        });

        this.api.log('?? [FLAME OVERLAY] TikTok event handlers registered', 'info');
    }

    handleTikTokEvent(event, data = {}, options = {}) {
        const config = this.getRuntimeConfig();
        if (config.triggersEnabled === false) {
            return { matched: false, accepted: false, reason: 'disabled' };
        }

        if (event === 'gift') {
            const normalized = this.normalizeGiftEvent(data);
            const ruleResult = this.evaluateTriggerRules('gift', normalized, options);
            if (!ruleResult.matched) {
                return this.handleGiftTrigger(normalized, options);
            }
            return ruleResult;
        }

        if (event === 'chat') {
            const commandResult = config.chatColorCommands !== false
                ? this.handleChatCommand(data, options)
                : { matched: false, accepted: false, reason: 'chat-commands-disabled' };
            const ruleResult = this.evaluateTriggerRules('chat', data, options);
            return commandResult.accepted ? commandResult : ruleResult;
        }

        return this.evaluateTriggerRules(event, data, options);
    }

    runFeatureTest(type) {
        const testEvent = FEATURE_TEST_EVENTS[type];
        if (!testEvent) {
            return {
                success: false,
                error: `Unknown flame overlay feature test: ${type}`,
                availableTypes: Object.keys(FEATURE_TEST_EVENTS)
            };
        }

        const result = this.handleTikTokEvent(testEvent.event, testEvent.data, {
            bypassCooldown: true,
            bypassStackLimit: true
        });

        return {
            success: true,
            type,
            event: testEvent.event,
            payload: testEvent.data,
            ...this.formatTriggerResult(result)
        };
    }

    formatTriggerResult(result = {}) {
        const response = {
            accepted: result.accepted === true
        };

        if (result.reason) response.reason = result.reason;
        if (result.eventKey) response.eventKey = result.eventKey;
        if (result.rule?.id) response.ruleId = result.rule.id;
        if (result.trigger) response.trigger = result.trigger;

        return response;
    }

    /**
     * Handle gift triggers with diamond count tiers
     * @param {object} data - TikTok gift event data
     */
    handleGiftTrigger(data, options = {}) {
        const normalized = this.normalizeGiftEvent(data);
        const giftValue = normalized.coins || normalized.giftValue || normalized.diamondCount || 1;

        if (giftValue >= 1000) {
            return this.dispatchTrigger({
                type: 'dramatic',
                effect: 'lightning',
                duration: 10000,
                intensityBoost: 1.0,
                bloomOverride: { enabled: true, intensity: 1.5 },
                revert: true,
                source: `gift:${giftValue}`
            }, options);
        } else if (giftValue >= 100) {
            return this.dispatchTrigger({
                type: 'intensity-boost',
                amount: 0.5,
                duration: 5000,
                revert: true,
                source: `gift:${giftValue}`
            }, options);
        } else {
            return this.dispatchTrigger({
                type: 'flash',
                duration: 800,
                revert: true,
                source: `gift:${giftValue}`
            }, options);
        }
    }

    /**
     * Handle chat color commands (!red, !blue, etc.)
     * @param {object} data - TikTok chat event data
     */
    handleChatCommand(data, options = {}) {
        const msg = ((data.comment || data.message || '')).toLowerCase().trim();
        const color = CHAT_COLOR_MAP[msg];

        if (color) {
            return this.dispatchTrigger({
                type: 'color-change',
                color,
                duration: 15000,
                revert: true,
                source: `chat:${msg}`
            }, options);
        }

        return { matched: false, accepted: false, reason: 'no-chat-command' };
    }

    /**
     * Evaluate configured trigger rules for a given event
     * @param {string} event - TikTok event type
     * @param {object} data - Event data
     */
    evaluateTriggerRules(event, data, options = {}) {
        const config = this.getRuntimeConfig();
        const triggerRules = Array.isArray(config.triggerRules) ? config.triggerRules : [];
        const rules = triggerRules.filter(r => this.isPlainObject(r) && r.enabled && r.event === event);

        for (const rule of rules) {
            if (this.evaluateCondition(rule.condition, data)) {
                const trigger = {
                    type: rule.action,
                    duration: rule.duration,
                    revert: true,
                    source: `rule:${rule.id}`
                };

                if (rule.effect !== undefined) trigger.effect = rule.effect;
                if (rule.amount !== undefined) trigger.amount = rule.amount;
                if (rule.intensity !== undefined) trigger.intensity = rule.intensity;
                if (rule.color !== undefined) trigger.color = rule.color;
                if (rule.intensityBoost !== undefined) trigger.intensityBoost = rule.intensityBoost;

                // Chat color-change rules are handled by handleChatCommand
                if (event === 'chat' && rule.action === 'color-change') {
                    continue;
                }

                const result = this.dispatchTrigger(trigger, options);
                return { matched: true, rule, ...result }; // Only first matching rule fires per event
            }
        }

        return { matched: false, accepted: false, reason: 'no-match' };
    }

    /**
     * Evaluate a condition string against event data
     * @param {string} condition - Condition string ('any', 'diamondCount >= 1000', etc.)
     * @param {object} data - Event data
     * @returns {boolean}
     */
    evaluateCondition(condition, data) {
        if (typeof condition !== 'string') return false;
        if (!condition || condition === 'any') return true;
        if (condition === 'keyword-match') return false; // handled separately

        if (condition.includes('&&')) {
            return condition.split('&&').every(part => this.evaluateCondition(part.trim(), data));
        }

        if (condition.includes('||')) {
            return condition.split('||').some(part => this.evaluateCondition(part.trim(), data));
        }

        try {
            const match = condition.match(/^(\w+)\s*(>=|<=|>|<|===?|!==?)\s*(\d+(?:\.\d+)?)$/);
            if (match) {
                const [, field, op, valueStr] = match;
                const fieldValue = Number(data[field]) || 0;
                const threshold = parseFloat(valueStr);

                switch (op) {
                    case '>=': return fieldValue >= threshold;
                    case '<=': return fieldValue <= threshold;
                    case '>':  return fieldValue > threshold;
                    case '<':  return fieldValue < threshold;
                    case '==':
                    case '===': return fieldValue === threshold;
                    case '!=':
                    case '!==': return fieldValue !== threshold;
                }
            }

            const quotedMatch = condition.match(/^(\w+)\s*(===?|!==?)\s*["'](.+)["']$/);
            if (quotedMatch) {
                const [, field, op, expected] = quotedMatch;
                const fieldValue = String(data[field] ?? '');

                switch (op) {
                    case '==':
                    case '===': return fieldValue === expected;
                    case '!=':
                    case '!==': return fieldValue !== expected;
                }
            }
        } catch (e) {
            this.api.log(`?? [FLAME OVERLAY] Invalid condition: ${condition}`, 'warn');
        }

        return false;
    }

    /**
     * Dispatch a trigger with cooldown and stack limit checks
     * @param {object} trigger - Trigger object
     */
    dispatchTrigger(trigger, options = {}) {
        if (!this.isPlainObject(trigger)) {
            return { accepted: false, reason: 'invalid-trigger', error: 'Trigger must be an object' };
        }

        const config = this.getRuntimeConfig();
        if (config.triggersEnabled === false) {
            return { accepted: false, reason: 'disabled' };
        }

        const normalized = this.normalizeManualTrigger(trigger, { source: trigger.source || 'manual' });
        if (normalized.errors.length) {
            return { accepted: false, reason: 'invalid-trigger', error: normalized.errors.join('; ') };
        }
        trigger = { ...trigger, ...normalized.trigger };

        const eventKey = this.getTriggerCooldownKey(trigger);
        const now = Date.now();
        const cooldown = this.clampNumber(
            config.triggerCooldown != null ? config.triggerCooldown : 2000,
            NUMERIC_CONFIG_RANGES.triggerCooldown,
            2000
        );
        const maxStack = this.clampNumber(
            config.triggerMaxStack != null ? config.triggerMaxStack : 5,
            NUMERIC_CONFIG_RANGES.triggerMaxStack,
            5
        );
        const duration = this.normalizeTriggerDuration(trigger.duration);
        const bypassCooldown = options.bypassCooldown === true || trigger.bypassCooldown === true;
        const bypassStackLimit = options.bypassStackLimit === true || trigger.bypassStackLimit === true;

        // Cooldown check
        const lastTime = this.lastTriggerTime.get(eventKey) || 0;
        if (!bypassCooldown && now - lastTime < cooldown) {
            return { accepted: false, reason: 'cooldown', eventKey, cooldown };
        }

        // Stack limit check
        if (!bypassStackLimit && this.activeTriggerCount >= maxStack) {
            return { accepted: false, reason: 'stack-limit', eventKey, maxStack };
        }

        if (!bypassCooldown) {
            this.lastTriggerTime.set(eventKey, now);
        }
        this.activeTriggerCount++;

        const triggerId = `${now}-${Math.random().toString(36).slice(2, 8)}`;
        const triggerWithId = { ...trigger, id: triggerId, duration };
        delete triggerWithId.bypassCooldown;
        delete triggerWithId.bypassStackLimit;

        this.api.emit('flame-overlay:trigger', triggerWithId);

        // Track trigger in log (keep last 10)
        this.triggerLog.unshift({ id: triggerId, type: trigger.type, source: trigger.source || 'manual', time: now });
        if (this.triggerLog.length > 10) this.triggerLog.pop();

        // Emit status update for UI
        this.api.emit('flame-overlay:trigger-status', {
            activeTriggers: this.activeTriggerCount,
            recentTriggers: this.triggerLog.slice(0, 5)
        });

        // Auto-decrement active count after duration
        const timer = setTimeout(() => {
            this.activeTriggerTimers.delete(triggerId);
            this.activeTriggerCount = Math.max(0, this.activeTriggerCount - 1);
            this.api.emit('flame-overlay:trigger-status', {
                activeTriggers: this.activeTriggerCount,
                recentTriggers: this.triggerLog.slice(0, 5)
            });
        }, duration + 250);
        this.activeTriggerTimers.set(triggerId, timer);

        return { accepted: true, trigger: triggerWithId, eventKey };
    }

    getTriggerCooldownKey(trigger) {
        if (trigger.cooldownKey) return String(trigger.cooldownKey);
        if (trigger.source) {
            const source = String(trigger.source);
            if (source.startsWith('rule:') || source.startsWith('test:')) return source;
            return source.split(':')[0];
        }
        return trigger.type || 'manual';
    }

    /**
     * Clear all active trigger bookkeeping and tell renderers to revert now.
     */
    clearActiveTriggers() {
        for (const timer of this.activeTriggerTimers.values()) {
            clearTimeout(timer);
        }
        this.activeTriggerTimers.clear();
        this.activeTriggerCount = 0;
        this.api.emit('flame-overlay:clear-triggers', {});
        this.api.emit('flame-overlay:trigger-status', {
            activeTriggers: this.activeTriggerCount,
            recentTriggers: this.triggerLog.slice(0, 5)
        });
    }

    handleFlowTrigger(data = {}) {
        const payload = this.isPlainObject(data) ? data : {};
        const normalized = this.normalizeManualTrigger(
            {
                ...payload,
                duration: payload.duration ?? 5000,
                intensity: payload.intensity ?? 2.0,
                source: 'flow'
            },
            {
                defaultType: 'intensity-boost',
                source: 'flow'
            }
        );

        if (normalized.errors.length) {
            return {
                success: false,
                accepted: false,
                reason: 'invalid-trigger',
                error: normalized.errors.join('; ')
            };
        }

        const result = this.dispatchTrigger(normalized.trigger);
        return {
            success: result.accepted === true,
            ...this.formatTriggerResult(result)
        };
    }

    /**
     * Register flow system action handlers
     */
    registerFlowActions() {
        if (typeof this.api.registerFlowAction === 'function') {
            this.api.registerFlowAction('flame-overlay.trigger', async (params = {}) => {
                return this.handleFlowTrigger(params);
            });
        }

        this.api.registerSocket('flow:flame-overlay:trigger', (socket, data) => {
            const payload = data === undefined && !socket?.emit ? socket : data;
            const result = this.handleFlowTrigger(payload);
            if (socket?.emit) {
                socket.emit('flow:flame-overlay:trigger:result', result);
            }
            data = payload || {};
            this.api.log(`?? [FLAME OVERLAY] Flow triggered: ${data.burstType || 'intensity-boost'}`, 'debug');
        });
        
        this.api.log('?? [FLAME OVERLAY] Flow actions registered', 'info');
    }

    /**
     * Log registered routes
     */
    logRoutes() {
        this.api.log('?? [FLAME OVERLAY] Routes registered:', 'info');
        this.api.log('   - GET  /flame-overlay/ui', 'info');
        this.api.log('   - GET  /flame-overlay/overlay', 'info');
        this.api.log('   - GET  /api/flame-overlay/config', 'info');
        this.api.log('   - POST /api/flame-overlay/config', 'info');
        this.api.log('   - GET  /api/flame-overlay/status', 'info');
        this.api.log('   - GET  /api/flame-overlay/gift-catalog', 'info');
        this.api.log('   - GET  /api/flame-overlay/presets', 'info');
        this.api.log('   - POST /api/flame-overlay/presets/:name', 'info');
        this.api.log('   - POST /api/flame-overlay/presets/:name/load', 'info');
        this.api.log('   - DELETE /api/flame-overlay/presets/:name', 'info');
        this.api.log('   - POST /api/flame-overlay/trigger', 'info');
        this.api.log('   - POST /api/flame-overlay/test-event', 'info');
        this.api.log('   - POST /api/flame-overlay/clear-triggers', 'info');
        this.api.log('   - GET  /api/flame-overlay/triggers', 'info');
        this.api.log('   - POST /api/flame-overlay/triggers', 'info');
        this.api.log('   - GET  /api/flame-overlay/trigger-presets', 'info');
        this.api.log('   - POST /api/flame-overlay/trigger-preset/:name', 'info');
    }

    /**
     * Cleanup on plugin destroy
     */
    async destroy() {
        this.clearActiveTriggers();
        this.api.log('?? [FLAME OVERLAY] Plugin destroyed', 'info');
    }
}

module.exports = FlameOverlayPlugin;
