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
      { id: 'gift-big', event: 'gift', condition: 'diamondCount >= 1000', action: 'dramatic', effect: 'lightning', duration: 10000, enabled: true },
      { id: 'gift-medium', event: 'gift', condition: 'diamondCount >= 100', action: 'intensity-boost', amount: 0.5, duration: 5000, enabled: true },
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
      { id: 'gift-big', event: 'gift', condition: 'diamondCount >= 1000', action: 'dramatic', effect: 'lightning', duration: 8000, enabled: true },
      { id: 'gift-medium', event: 'gift', condition: 'diamondCount >= 100', action: 'intensity-boost', amount: 0.8, duration: 4000, enabled: true },
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
      { id: 'gift-big', event: 'gift', condition: 'diamondCount >= 1000', action: 'dramatic', effect: 'lightning', duration: 12000, enabled: true },
      { id: 'gift-medium', event: 'gift', condition: 'diamondCount >= 100', action: 'intensity-boost', amount: 0.2, duration: 6000, enabled: true },
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
      { id: 'gift-big', event: 'gift', condition: 'diamondCount >= 500', action: 'dramatic', effect: 'lightning', duration: 8000, enabled: true },
      { id: 'gift-medium', event: 'gift', condition: 'diamondCount >= 50', action: 'intensity-boost', amount: 1.0, duration: 4000, enabled: true },
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
        this.api.log('🔥 [FLAME OVERLAY] Initializing TikTok Flame Overlay Plugin...', 'info');

        // Load configuration
        this.loadConfig();

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers if triggers are enabled
        if (this.config.triggersEnabled !== false) {
            this.registerTikTokEventHandlers();
        }

        // Register flow actions
        this.registerFlowActions();

        this.api.log('✅ [FLAME OVERLAY] Plugin initialized successfully', 'info');
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
            flameSpeed: 0.5, // Time multiplier
            flameIntensity: 1.3, // Magnitude/turbulence
            flameBrightness: 0.38, // Overall brightness multiplier
            
            // Visual effects
            enableGlow: true,
            enableAdditiveBlend: true,
            
            // Advanced
            maskOnlyEdges: true, // Only show flames on frame edges
            highDPI: true, // Handle high DPI displays
            
            // ===== NEW FEATURES (v2.2.0) =====
            // Quality Settings
            noiseOctaves: 8, // 4-12 octaves for fBm
            useHighQualityTextures: true, // Enable when HQ textures are available
            detailScaleAuto: true, // Automatic detail scaling based on resolution
            
            // Edge Settings
            edgeFeather: 0.42, // 0.0-1.0: Soft edge blending amount
            frameCurve: 0.08, // 0.0-1.0: Curved frame edges (0=sharp corners)
            frameNoiseAmount: 0.12, // 0.0-1.0: Noise modulation on frame edges
            
            // Animation
            animationEasing: 'linear', // 'linear', 'sine', 'quad', 'elastic'
            pulseEnabled: false, // Enable pulsing/breathing animation
            pulseAmount: 0.2, // 0.0-1.0: Pulse intensity
            pulseSpeed: 1.0, // 0.1-3.0: Pulse frequency
            
            // Bloom
            bloomEnabled: true, // Enable bloom post-processing
            bloomIntensity: 0.8, // 0.0-2.0: Bloom strength
            bloomThreshold: 0.6, // 0.0-1.0: Brightness threshold for bloom
            bloomRadius: 4, // 1-10: Bloom blur radius
            
            // Layers
            layersEnabled: true, // Enable multi-layer compositing
            layerCount: 3, // 1-3: Number of layers
            layerParallax: 0.3, // 0.0-1.0: Parallax effect strength
            
            // Post-FX
            chromaticAberration: 0.005, // 0.0-0.02: RGB channel offset
            filmGrain: 0.03, // 0.0-0.1: Film grain intensity
            depthIntensity: 0.65, // 0.0-1.0: Fake depth/inner glow
            
            // Smoke
            smokeEnabled: true, // Enable smoke layer
            smokeIntensity: 0.4, // 0.0-1.0: Smoke opacity
            smokeSpeed: 0.3, // 0.1-1.0: Smoke movement speed
            smokeColor: '#333333', // Smoke color

            // ===== TRIGGER SYSTEM (v3.0.0) =====
            triggersEnabled: true,
            triggerRules: TRIGGER_PRESETS.default.triggerRules,
            chatColorCommands: true,
            triggerCooldown: 2000,
            triggerMaxStack: 5,
            triggerPreset: 'default',
            visualProfileVersion: 2
        };
        
        // Merge saved config with defaults to ensure backward compatibility
        this.config = savedConfig ? { ...defaultConfig, ...savedConfig } : defaultConfig;
        this.applyVisualUpgradeDefaults(savedConfig);
    }

    applyVisualUpgradeDefaults(savedConfig) {
        if (!savedConfig || savedConfig.visualProfileVersion >= 2) return;

        const upgrades = {
            flameBrightness: { from: 0.25, to: 0.38 },
            useHighQualityTextures: { from: false, to: true },
            edgeFeather: { from: 0.3, to: 0.42 },
            frameCurve: { from: 0.0, to: 0.08 },
            frameNoiseAmount: { from: 0.0, to: 0.12 },
            bloomEnabled: { from: false, to: true },
            layersEnabled: { from: false, to: true },
            depthIntensity: { from: 0.5, to: 0.65 },
            smokeEnabled: { from: false, to: true }
        };

        for (const [field, { from, to }] of Object.entries(upgrades)) {
            if (savedConfig[field] === undefined || savedConfig[field] === from) {
                this.config[field] = to;
            }
        }

        this.config.visualProfileVersion = 2;
        this.saveConfig();
    }

    /**
     * Save plugin configuration to database
     */
    saveConfig() {
        this.api.setConfig('settings', this.config);
    }

    /**
     * Get resolution based on preset or custom values
     */
    getResolution() {
        const presets = {
            'tiktok-portrait': { width: 720, height: 1280 },
            'tiktok-landscape': { width: 1280, height: 720 },
            'hd-portrait': { width: 1080, height: 1920 },
            'hd-landscape': { width: 1920, height: 1080 },
            '2k-portrait': { width: 1440, height: 2560 },
            '2k-landscape': { width: 2560, height: 1440 },
            '4k-portrait': { width: 2160, height: 3840 },
            '4k-landscape': { width: 3840, height: 2160 },
            'custom': { width: this.config.customWidth, height: this.config.customHeight }
        };
        
        return presets[this.config.resolutionPreset] || presets['tiktok-portrait'];
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
                res.json({ success: true, config: this.config });
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Error getting config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update configuration
        this.api.registerRoute('post', '/api/flame-overlay/config', (req, res) => {
            try {
                const updates = req.body;
                this.config = { ...this.config, ...updates };
                this.saveConfig();
                
                // Notify overlays about config change
                this.api.emit('flame-overlay:config-update', { config: this.config });
                
                res.json({ success: true, message: 'Configuration updated' });
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Error updating config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get status
        this.api.registerRoute('get', '/api/flame-overlay/status', (req, res) => {
            try {
                const resolution = this.getResolution();
                res.json({
                    success: true,
                    config: this.config,
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
                const presets = this.api.getConfig('presets') || {};
                res.json({ success: true, presets });
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Error loading presets: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/flame-overlay/presets/:name - Save preset
        this.api.registerRoute('post', '/api/flame-overlay/presets/:name', (req, res) => {
            try {
                const presets = this.api.getConfig('presets') || {};
                presets[req.params.name] = {
                    config: { ...this.config },
                    createdAt: new Date().toISOString()
                };
                this.api.setConfig('presets', presets);
                res.json({ success: true, message: `Preset "${req.params.name}" saved` });
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Error saving preset: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/flame-overlay/presets/:name/load - Load preset
        this.api.registerRoute('post', '/api/flame-overlay/presets/:name/load', (req, res) => {
            try {
                const presets = this.api.getConfig('presets') || {};
                if (!presets[req.params.name]) {
                    return res.status(404).json({ success: false, error: 'Preset not found' });
                }
                this.config = { ...this.config, ...presets[req.params.name].config };
                this.saveConfig();
                this.api.emit('flame-overlay:config-update', { config: this.config });
                res.json({ success: true, message: `Preset "${req.params.name}" loaded` });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // DELETE /api/flame-overlay/presets/:name - Delete preset
        this.api.registerRoute('delete', '/api/flame-overlay/presets/:name', (req, res) => {
            try {
                const presets = this.api.getConfig('presets') || {};
                if (!presets[req.params.name]) {
                    return res.status(404).json({ success: false, error: 'Preset not found' });
                }
                delete presets[req.params.name];
                this.api.setConfig('presets', presets);
                res.json({ success: true, message: `Preset "${req.params.name}" deleted` });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Serve texture files
        const express = require('express');
        const textureDir = path.join(__dirname, 'textures');
        this.api.getApp().use('/plugins/flame-overlay/textures', express.static(textureDir));
        
        // Serve renderer directory for flame.js
        const rendererDir = path.join(__dirname, 'renderer');
        this.api.getApp().use('/flame-overlay', express.static(rendererDir));

        // --- Trigger API endpoints (v3.0.0) ---

        // Manual trigger endpoint (for testing / IFTTT / other plugins)
        this.api.registerRoute('post', '/api/flame-overlay/trigger', (req, res) => {
            try {
                const trigger = req.body;
                if (!trigger.type) {
                    return res.status(400).json({ success: false, error: 'Missing trigger type' });
                }
                const result = this.dispatchTrigger(trigger);
                res.json({
                    success: true,
                    message: result.accepted ? 'Trigger sent' : 'Trigger skipped',
                    ...this.formatTriggerResult(result)
                });
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Trigger error: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // App-internal feature test endpoint. This runs synthetic TikTok events
        // through the same rule/handler path as live events, while bypassing
        // cooldown so repeated UI tests are deterministic.
        this.api.registerRoute('post', '/api/flame-overlay/test-event', (req, res) => {
            try {
                const type = req.body?.type || req.body?.event || 'gift-small';
                const result = this.runFeatureTest(type);
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
                res.json({ success: true, rules: this.config.triggerRules || [] });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Save trigger rules
        this.api.registerRoute('post', '/api/flame-overlay/triggers', (req, res) => {
            try {
                const { rules } = req.body;
                if (!Array.isArray(rules)) {
                    return res.status(400).json({ success: false, error: 'rules must be an array' });
                }
                this.config.triggerRules = rules;
                this.config.triggerPreset = 'custom';
                this.saveConfig();
                res.json({ success: true, message: 'Trigger rules saved' });
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Error saving triggers: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get available presets
        this.api.registerRoute('get', '/api/flame-overlay/trigger-presets', (req, res) => {
            try {
                const presetNames = Object.keys(TRIGGER_PRESETS);
                res.json({ success: true, presets: presetNames, current: this.config.triggerPreset || 'default' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Activate a preset
        this.api.registerRoute('post', '/api/flame-overlay/trigger-preset/:name', (req, res) => {
            try {
                const { name } = req.params;
                if (!TRIGGER_PRESETS[name]) {
                    return res.status(400).json({ success: false, error: `Unknown preset: ${name}` });
                }
                const preset = TRIGGER_PRESETS[name];
                this.config.triggerRules = preset.triggerRules;
                this.config.triggerCooldown = preset.triggerCooldown;
                this.config.triggerMaxStack = preset.triggerMaxStack;
                this.config.triggerPreset = name;
                this.saveConfig();
                this.api.log(`🎮 [FLAME OVERLAY] Preset '${name}' activated`, 'info');
                res.json({ success: true, message: `Preset '${name}' activated`, config: this.config });
            } catch (error) {
                this.api.log(`❌ [FLAME OVERLAY] Error activating preset: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    /**
     * Register TikTok event handlers for interactive triggers
     */
    registerTikTokEventHandlers() {
        this.api.registerTikTokEvent('gift', (data) => {
            this.handleTikTokEvent('gift', data);
        });

        this.api.registerTikTokEvent('follow', (data) => {
            this.handleTikTokEvent('follow', data);
        });

        this.api.registerTikTokEvent('like', (data) => {
            this.handleTikTokEvent('like', data);
        });

        this.api.registerTikTokEvent('share', (data) => {
            this.handleTikTokEvent('share', data);
        });

        this.api.registerTikTokEvent('chat', (data) => {
            this.handleTikTokEvent('chat', data);
        });

        this.api.registerTikTokEvent('subscribe', (data) => {
            this.handleTikTokEvent('subscribe', data);
        });

        this.api.log('🎮 [FLAME OVERLAY] TikTok event handlers registered', 'info');
    }

    handleTikTokEvent(event, data = {}, options = {}) {
        if (event === 'gift') {
            const normalized = this.normalizeGiftEvent(data);
            const ruleResult = this.evaluateTriggerRules('gift', normalized, options);
            if (!ruleResult.matched) {
                return this.handleGiftTrigger(normalized, options);
            }
            return ruleResult;
        }

        if (event === 'chat') {
            const commandResult = this.config.chatColorCommands !== false
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
        const rules = (this.config.triggerRules || []).filter(r => r.enabled && r.event === event);

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
            this.api.log(`⚠️ [FLAME OVERLAY] Invalid condition: ${condition}`, 'warn');
        }

        return false;
    }

    /**
     * Dispatch a trigger with cooldown and stack limit checks
     * @param {object} trigger - Trigger object
     */
    dispatchTrigger(trigger, options = {}) {
        if (this.config.triggersEnabled === false) {
            return { accepted: false, reason: 'disabled' };
        }

        const eventKey = this.getTriggerCooldownKey(trigger);
        const now = Date.now();
        const cooldown = this.config.triggerCooldown != null ? this.config.triggerCooldown : 2000;
        const maxStack = this.config.triggerMaxStack != null ? this.config.triggerMaxStack : 5;
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

    /**
     * Register flow system action handlers
     */
    registerFlowActions() {
        this.api.registerSocket('flow:flame-overlay:trigger', (data) => {
            this.dispatchTrigger({
                type: data.burstType || 'intensity-boost',
                effect: data.effectType,
                intensity: data.intensity || 2.0,
                color: data.color,
                duration: data.duration || 5000,
                revert: true,
                source: 'flow'
            });
            this.api.log(`🔥 [FLAME OVERLAY] Flow triggered: ${data.burstType || 'intensity-boost'}`, 'debug');
        });
        
        this.api.log('🔥 [FLAME OVERLAY] Flow actions registered', 'info');
    }

    /**
     * Log registered routes
     */
    logRoutes() {
        this.api.log('📍 [FLAME OVERLAY] Routes registered:', 'info');
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
        this.api.log('🔥 [FLAME OVERLAY] Plugin destroyed', 'info');
    }
}

module.exports = FlameOverlayPlugin;
