const path = require('path');
const crypto = require('crypto');
const { createAdminAuth } = require('../../modules/admin-auth');

/**
 * Weather Control Plugin
 *
 * Professional weather effects system for TikTok Live overlays
 * Supports: rain, snow, storm, fog, thunder, sunbeam, glitchclouds, aurora, fireflies, meteors, sakura, embers, heatwave
 * 
 * Features:
 * - Modern GPU-accelerated animations (Canvas 2D, WebGL, CSS)
 * - Permission-based access control
 * - Rate limiting and spam protection
 * - Configurable intensity, duration, and visual parameters
 * - WebSocket event integration
 * - Flow action support for automation
 */
class WeatherControlPlugin {
    constructor(api) {
        this.api = api;
        this.adminAuth = createAdminAuth();
        this.supportedEffects = [
            'rain',
            'snow', 
            'storm',
            'fog',
            'thunder',
            'sunbeam',
            'glitchclouds',
            'aurora',
            'fireflies',
            'meteors',
            'sakura',
            'embers',
            'heatwave'
        ];

        this.effectEmojis = {
            rain: 'rain',
            snow: 'snow',
            storm: 'storm',
            fog: 'fog',
            thunder: 'thunder',
            sunbeam: 'sunbeam',
            glitchclouds: 'glitch',
            aurora: 'aurora',
            fireflies: 'fireflies',
            meteors: 'meteors',
            sakura: 'sakura',
            embers: 'embers',
            heatwave: 'heatwave'
        };
        
        // Rate limiting state (in-memory, per user)
        this.userRateLimit = new Map(); // username -> { count, resetTime }
        this.rateLimitWindow = 60000; // 1 minute
        this.rateLimitMax = 10; // Max 10 requests per minute per user
        
        // Duration limits (milliseconds)
        this.minDuration = 1000; // 1 second
        this.maxDuration = 60000; // 60 seconds
        
        // Intensity limits
        this.minIntensity = 0.0;
        this.maxIntensity = 1.0;
        
        // API Key for external access (stored in config)
        this.apiKey = null;

        // Track permanent effects
        this.activePermanentEffects = new Set();
        this.socketSyncRegistered = false;
        this.socketConnectionHandler = null;
        this.socketHandlers = new Map();
        this.sequenceTimers = new Set();
        this.questRotationTimer = null;
        this.gamificationPersistTimer = null;
        this.gamification = this.createDefaultGamificationRuntimeState();
        this.likeMilestoneState = {
            totalLikes: 0,
            lastMilestone: 0
        };
    }

    /**
     * Validate and clamp intensity value
     * @param {number} intensity - Raw intensity value
     * @param {string} effectName - Effect name for default lookup
     * @returns {number} Valid intensity value
     */
    validateIntensity(intensity, effectName) {
        const defaultIntensity = this.config.effects[effectName]?.defaultIntensity || 0.5;
        return Math.max(this.minIntensity, Math.min(this.maxIntensity, parseFloat(intensity) || defaultIntensity));
    }

    /**
     * Validate and clamp duration value
     * @param {number} duration - Raw duration value
     * @param {string} effectName - Effect name for default lookup
     * @returns {number} Valid duration value in milliseconds
     */
    validateDuration(duration, effectName, allowPermanent = false) {
        if (allowPermanent && (duration === 0 || duration === '0')) {
            return 0;
        }
        const defaultDuration = this.config.effects[effectName]?.defaultDuration || 10000;
        return Math.max(this.minDuration, Math.min(this.maxDuration, parseInt(duration) || defaultDuration));
    }

    validateQualityPreset(value) {
        const allowed = ['low', 'medium', 'high', 'ultra'];
        return allowed.includes(value) ? value : 'high';
    }

    clampNumber(value, min, max, fallback) {
        const parsed = parseFloat(value);
        if (!Number.isFinite(parsed)) {
            return fallback;
        }
        return Math.max(min, Math.min(max, parsed));
    }

    sanitizeEffectConfig(effectName, effectConfig = {}) {
        return {
            ...effectConfig,
            enabled: effectConfig.enabled !== false,
            defaultIntensity: this.clampNumber(effectConfig.defaultIntensity, this.minIntensity, this.maxIntensity, 0.5),
            defaultDuration: this.validateDuration(effectConfig.defaultDuration, effectName, effectConfig.permanent === true),
            permanent: effectConfig.permanent === true,
            layer: Math.round(this.clampNumber(effectConfig.layer, 0, 100, 50)),
            opacity: this.clampNumber(effectConfig.opacity, 0.05, 1, 1),
            particleScale: this.clampNumber(effectConfig.particleScale, 0.25, 2, 1),
            wind: this.clampNumber(effectConfig.wind, -1, 1, 0),
            directionDeg: Math.round(this.clampNumber(effectConfig.directionDeg, -180, 180, 0))
        };
    }

    getEffectOptions(effectName, overrides = {}) {
        const effectConfig = this.config.effects[effectName] || {};
        return this.sanitizeMeta({
            category: effectConfig.category,
            layer: effectConfig.layer,
            opacity: effectConfig.opacity,
            particleScale: effectConfig.particleScale,
            wind: effectConfig.wind,
            directionDeg: effectConfig.directionDeg,
            fogColor: effectConfig.fogColor,
            colorTemperature: effectConfig.colorTemperature,
            ...overrides
        });
    }

    createWeatherEvent({ action, intensity, duration, permanent = false, username = 'system', meta = {}, options = {} }) {
        const isPermanent = permanent === true || duration === 0 || duration === '0';
        const validIntensity = this.validateIntensity(intensity, action);
        const validDuration = this.validateDuration(duration, action, isPermanent);

        return {
            type: 'weather',
            action,
            intensity: validIntensity,
            duration: validDuration,
            permanent: isPermanent,
            username,
            meta: this.sanitizeMeta(meta),
            options: this.getEffectOptions(action, options),
            timestamp: Date.now()
        };
    }

    emitWeatherEvent(event) {
        this.api.emit('weather:trigger', event);
        return event;
    }

    registerAdminRoute(method, routePath, handler) {
        this.api.registerRoute(method, routePath, (req, res, next) => (
            this.adminAuth(req, res, () => handler(req, res, next))
        ));
    }

    getDesiredPermanentEffects() {
        if (!this.config?.enabled) {
            return new Set();
        }

        return new Set(
            this.supportedEffects.filter(effect =>
                this.config.effects[effect]?.permanent === true &&
                this.config.effects[effect]?.enabled !== false
            )
        );
    }

    sanitizeOverlayState(payload = {}) {
        const activeEffects = Array.isArray(payload.activeEffects)
            ? payload.activeEffects.slice(0, 20)
                .filter(effect => effect && this.supportedEffects.includes(effect.type))
                .map(effect => ({
                    type: effect.type,
                    intensity: this.clampNumber(effect.intensity, 0, 1, 0.5),
                    permanent: effect.permanent === true,
                    duration: Math.max(0, Math.min(this.maxDuration, parseInt(effect.duration) || 0)),
                    startedAt: Math.max(0, parseInt(effect.startedAt) || 0),
                    layer: Math.round(this.clampNumber(effect.layer, 0, 100, 50))
                }))
            : [];

        return {
            activeEffects,
            fps: this.clampNumber(payload.fps, 0, 240, 0),
            particles: Math.max(0, Math.min(10000, parseInt(payload.particles) || 0)),
            quality: this.validateQualityPreset(payload.quality)
        };
    }

    sanitizeSequences(sequences) {
        return sequences.slice(0, 20).map((sequence, index) => ({
            name: String(sequence.name || `Sequence ${index + 1}`).replace(/<[^>]*>/g, '').substring(0, 80),
            steps: Array.isArray(sequence.steps)
                ? sequence.steps.slice(0, 20)
                    .filter(step => step && this.supportedEffects.includes(step.action))
                    .map(step => ({
                        action: step.action,
                        delay: Math.max(0, Math.min(300000, parseInt(step.delay) || 0)),
                        intensity: this.clampNumber(step.intensity, this.minIntensity, this.maxIntensity, this.config.effects[step.action]?.defaultIntensity || 0.5),
                        duration: this.validateDuration(step.duration, step.action, step.permanent === true),
                        permanent: step.permanent === true
                    }))
                : []
        })).filter(sequence => sequence.steps.length > 0);
    }

    /**
     * Get GCCE plugin instance
     * @returns {Object|null} GCCE instance or null
     */
    getGCCEInstance() {
        return this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance || null;
    }

    async init() {
        this.api.log('🌦️ [WEATHER CONTROL] Initializing Weather Control Plugin...', 'info');

        // Load configuration
        await this.loadConfig();

        // Register routes
        this.api.log('🛣️ [WEATHER CONTROL] Registering routes...', 'debug');
        this.registerRoutes();

        // Register TikTok event handlers
        this.api.log('🎯 [WEATHER CONTROL] Registering TikTok event handlers...', 'debug');
        this.registerTikTokEventHandlers();

        // Register flow actions
        this.api.log('⚡ [WEATHER CONTROL] Registering flow actions...', 'debug');
        this.registerFlowActions();

        // Register GCCE commands
        this.api.log('💬 [WEATHER CONTROL] Registering GCCE commands...', 'debug');
        this.registerGCCECommands();

        // Register socket sync for permanent effects
        this.registerSocketSync();

        // Apply permanent effects after initialization
        this.syncPermanentEffects();

        this.api.log('✅ [WEATHER CONTROL] Weather Control Plugin initialized successfully', 'info');
    }

    async loadConfig() {
        try {
            const config = await this.api.getConfig('weather_config');
            
            // Default configuration
            const defaultConfig = {
                enabled: true,
                apiKey: this.generateApiKey(),
                useGlobalAuth: true, // Use global auth system instead of separate API key
                rateLimitPerMinute: 10,
                qualityPreset: 'high',
                adaptiveQuality: true,
                maxConcurrentEffects: 5,
                effectLayerOrder: [
                    'fog',
                    'sunbeam',
                    'aurora',
                    'heatwave',
                    'rain',
                    'snow',
                    'storm',
                    'fireflies',
                    'sakura',
                    'embers',
                    'meteors',
                    'thunder',
                    'glitchclouds'
                ],
                audio: {
                    enabled: false,
                    volume: 0.45,
                    effects: {
                        rain: { enabled: false, volume: 0.35 },
                        storm: { enabled: false, volume: 0.5 },
                        thunder: { enabled: false, volume: 0.7 },
                        embers: { enabled: false, volume: 0.35 },
                        heatwave: { enabled: false, volume: 0.25 }
                    }
                },
                triggerEvents: {
                    follow: { enabled: false, action: 'sakura', intensity: 0.5, duration: 8000 },
                    share: { enabled: false, action: 'fireflies', intensity: 0.5, duration: 8000 },
                    subscribe: { enabled: false, action: 'sunbeam', intensity: 0.7, duration: 10000 },
                    likeMilestone: { enabled: false, interval: 1000, action: 'meteors', intensity: 0.5, duration: 8000 }
                },
                gamification: this.getDefaultGamificationConfig(),
                presets: [
                    { name: 'Cozy Rain', effects: { rain: { defaultIntensity: 0.45, defaultDuration: 12000, opacity: 0.85, wind: 0.1 } } },
                    { name: 'Boss Storm', effects: { storm: { defaultIntensity: 0.9, defaultDuration: 10000, opacity: 1, wind: 0.45 }, thunder: { defaultIntensity: 0.85, defaultDuration: 6000 } } },
                    { name: 'Winter Chill', effects: { snow: { defaultIntensity: 0.65, defaultDuration: 16000, opacity: 0.95, wind: -0.1 }, fog: { defaultIntensity: 0.35, defaultDuration: 12000, fogColor: 'ice' } } },
                    { name: 'Cyber Glitch', effects: { glitchclouds: { defaultIntensity: 0.85, defaultDuration: 8000, opacity: 1 }, meteors: { defaultIntensity: 0.45, defaultDuration: 7000 } } }
                ],
                sequences: [
                    {
                        name: 'Storm Build',
                        steps: [
                            { action: 'fog', delay: 0, intensity: 0.35, duration: 8000 },
                            { action: 'rain', delay: 2000, intensity: 0.55, duration: 10000 },
                            { action: 'thunder', delay: 5500, intensity: 0.8, duration: 5000 }
                        ]
                    }
                ],
                chatCommands: {
                    enabled: true,
                    requirePermission: true, // Use permission system for chat commands
                    allowIntensityControl: false, // Allow users to specify intensity in command
                    allowDurationControl: false, // Allow users to specify duration in command
                    commandNames: {
                        weather: 'weather',
                        weatherlist: 'weatherlist',
                        weatherstop: 'weatherstop'
                    }
                },
                permissions: {
                    enabled: true,
                    allowAll: false,
                    allowedGroups: {
                        followers: true,
                        superfans: true,
                        subscribers: true,
                        teamMembers: true,
                        minTeamLevel: 1
                    },
                    allowedUsers: [], // Specific usernames
                    topGifterThreshold: 10, // Top 10 gifters
                    minPoints: 0 // Minimum points/XP required
                },
                effects: {
                    rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false, category: 'precipitation', layer: 50, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
                    snow: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false, category: 'precipitation', layer: 60, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
                    storm: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false, category: 'precipitation', layer: 70, opacity: 1, particleScale: 1, wind: 0.35, directionDeg: 25 },
                    fog: { enabled: true, defaultIntensity: 0.4, defaultDuration: 15000, permanent: false, category: 'atmosphere', layer: 10, opacity: 0.9, particleScale: 1, wind: 0, directionDeg: 0, fogColor: 'default' },
                    thunder: { enabled: true, defaultIntensity: 0.8, defaultDuration: 5000, permanent: false, category: 'impact', layer: 95, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
                    sunbeam: { enabled: true, defaultIntensity: 0.6, defaultDuration: 12000, permanent: false, category: 'light', layer: 20, opacity: 0.9, particleScale: 1, wind: 0, directionDeg: 0, colorTemperature: 'golden' },
                    glitchclouds: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false, category: 'digital', layer: 100, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0, glitchRgbShift: true, glitchDisplacement: true, glitchScanlines: true, glitchNoise: true, glitchBlocks: true, glitchChromaticAberration: true, glitchIntensity: 1 },
                    aurora: { enabled: true, defaultIntensity: 0.5, defaultDuration: 15000, permanent: false, category: 'light', layer: 15, opacity: 0.9, particleScale: 1, wind: 0, directionDeg: 0 },
                    fireflies: { enabled: true, defaultIntensity: 0.5, defaultDuration: 12000, permanent: false, category: 'ambient', layer: 65, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
                    meteors: { enabled: true, defaultIntensity: 0.4, defaultDuration: 10000, permanent: false, category: 'impact', layer: 90, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
                    sakura: { enabled: true, defaultIntensity: 0.5, defaultDuration: 12000, permanent: false, category: 'ambient', layer: 55, opacity: 1, particleScale: 1, wind: 0.1, directionDeg: 0 },
                    embers: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false, category: 'ambient', layer: 75, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
                    heatwave: { enabled: true, defaultIntensity: 0.4, defaultDuration: 8000, permanent: false, category: 'atmosphere', layer: 25, opacity: 0.75, particleScale: 1, wind: 0, directionDeg: 0 }
                }
            };

            this.config = config || defaultConfig;
            
            // Ensure all default fields exist
            this.config = { ...defaultConfig, ...this.config };
            this.config.chatCommands = { ...defaultConfig.chatCommands, ...this.config.chatCommands };
            
            // Ensure commandNames exists with defaults
            if (!this.config.chatCommands.commandNames) {
                this.config.chatCommands.commandNames = defaultConfig.chatCommands.commandNames;
            }
            
            this.config.permissions = { ...defaultConfig.permissions, ...this.config.permissions };
            this.config.qualityPreset = this.validateQualityPreset(this.config.qualityPreset || defaultConfig.qualityPreset);
            this.config.adaptiveQuality = this.config.adaptiveQuality !== false;
            this.config.maxConcurrentEffects = Math.max(1, Math.min(12, parseInt(this.config.maxConcurrentEffects) || defaultConfig.maxConcurrentEffects));
            this.config.effectLayerOrder = Array.isArray(this.config.effectLayerOrder)
                ? this.supportedEffects.filter(effect => this.config.effectLayerOrder.includes(effect))
                    .concat(this.supportedEffects.filter(effect => !this.config.effectLayerOrder.includes(effect)))
                : defaultConfig.effectLayerOrder;
            this.config.audio = {
                ...defaultConfig.audio,
                ...(this.config.audio || {}),
                effects: {
                    ...defaultConfig.audio.effects,
                    ...((this.config.audio && this.config.audio.effects) || {})
                }
            };
            this.config.triggerEvents = {
                ...defaultConfig.triggerEvents,
                ...(this.config.triggerEvents || {})
            };
            this.config.gamification = this.mergeGamificationConfig(
                defaultConfig.gamification,
                this.config.gamification
            );
            this.config.presets = Array.isArray(this.config.presets) ? this.config.presets : defaultConfig.presets;
            this.config.sequences = Array.isArray(this.config.sequences) ? this.config.sequences : defaultConfig.sequences;
            this.config.effects = this.supportedEffects.reduce((acc, effectName) => {
                acc[effectName] = {
                    ...defaultConfig.effects[effectName],
                    ...(this.config.effects?.[effectName] || {})
                };
                acc[effectName] = this.sanitizeEffectConfig(effectName, acc[effectName]);
                return acc;
            }, {});

            // Store API key
            this.apiKey = this.config.apiKey;
            this.rateLimitMax = this.config.rateLimitPerMinute || 10;
            this.initializeGamificationState();

            // Save updated config
            await this.api.setConfig('weather_config', this.config);

            this.api.log('📝 [WEATHER CONTROL] Configuration loaded', 'debug');
        } catch (error) {
            this.api.log(`❌ [WEATHER CONTROL] Error loading config: ${error.message}`, 'error');
            throw error;
        }
    }

    generateApiKey() {
        return `weather_${crypto.randomBytes(24).toString('base64url')}`;
    }

    apiKeysEqual(provided, expected) {
        const providedBuffer = Buffer.from(String(provided || ''), 'utf8');
        const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
        return providedBuffer.length === expectedBuffer.length &&
            crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    }

    registerRoutes() {
        // Serve plugin UI (configuration page)
        this.api.registerRoute('get', '/weather-control/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui.html');
            res.sendFile(uiPath);
        });

        // Serve plugin overlay
        this.api.registerRoute('get', '/weather-control/overlay', (req, res) => {
            const overlayPath = path.join(__dirname, 'overlay.html');
            res.sendFile(overlayPath);
        });

        // Get current configuration
        this.api.registerRoute('get', '/api/weather/config', async (req, res) => {
            try {
                // Return config without sensitive data
                const safeConfig = {
                    ...this.config,
                    apiKey: undefined,
                    hasApiKey: Boolean(this.apiKey)
                };
                res.json({ success: true, config: safeConfig });
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error getting config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update configuration
        this.registerAdminRoute('post', '/api/weather/config', async (req, res) => {
            try {
                const newConfig = req.body;
                const wasEnabled = this.config.enabled !== false;
                
                // Track if command names changed
                let commandNamesChanged = false;
                
                // Store old permanent effects state
                const oldPermanentEffects = new Set(
                    this.supportedEffects.filter(effect => 
                        this.config.effects[effect]?.permanent === true
                    )
                );
                
                // Validate configuration
                if (newConfig.permissions) {
                    this.config.permissions = { ...this.config.permissions, ...newConfig.permissions };
                }
                if (newConfig.effects) {
                    const mergedEffects = { ...this.config.effects };
                    this.supportedEffects.forEach(effect => {
                        if (newConfig.effects[effect]) {
                            const effectConfig = newConfig.effects[effect];
                            mergedEffects[effect] = {
                                ...mergedEffects[effect],
                                ...effectConfig
                            };
                            mergedEffects[effect] = this.sanitizeEffectConfig(effect, mergedEffects[effect]);
                        }
                    });
                    this.config.effects = mergedEffects;
                }
                if (newConfig.chatCommands) {
                    // Check if command names changed
                    if (newConfig.chatCommands.commandNames) {
                        const oldNames = this.config.chatCommands.commandNames;
                        const newNames = newConfig.chatCommands.commandNames;
                        commandNamesChanged = 
                            oldNames.weather !== newNames.weather ||
                            oldNames.weatherlist !== newNames.weatherlist ||
                            oldNames.weatherstop !== newNames.weatherstop;
                    }
                    this.config.chatCommands = { ...this.config.chatCommands, ...newConfig.chatCommands };
                }
                if (typeof newConfig.enabled !== 'undefined') {
                    this.config.enabled = newConfig.enabled === true;
                }
                if (typeof newConfig.useGlobalAuth !== 'undefined') {
                    this.config.useGlobalAuth = newConfig.useGlobalAuth !== false;
                }
                if (typeof newConfig.rateLimitPerMinute !== 'undefined') {
                    this.config.rateLimitPerMinute = Math.max(1, Math.min(100, newConfig.rateLimitPerMinute));
                    this.rateLimitMax = this.config.rateLimitPerMinute;
                }
                if (typeof newConfig.qualityPreset !== 'undefined') {
                    this.config.qualityPreset = this.validateQualityPreset(newConfig.qualityPreset);
                }
                if (typeof newConfig.adaptiveQuality !== 'undefined') {
                    this.config.adaptiveQuality = newConfig.adaptiveQuality !== false;
                }
                if (typeof newConfig.maxConcurrentEffects !== 'undefined') {
                    this.config.maxConcurrentEffects = Math.max(1, Math.min(12, parseInt(newConfig.maxConcurrentEffects) || 5));
                }
                if (Array.isArray(newConfig.effectLayerOrder)) {
                    this.config.effectLayerOrder = this.supportedEffects
                        .filter(effect => newConfig.effectLayerOrder.includes(effect))
                        .concat(this.supportedEffects.filter(effect => !newConfig.effectLayerOrder.includes(effect)));
                }
                if (newConfig.audio) {
                    this.config.audio = {
                        ...this.config.audio,
                        ...newConfig.audio,
                        effects: {
                            ...(this.config.audio?.effects || {}),
                            ...(newConfig.audio.effects || {})
                        }
                    };
                    this.config.audio.volume = this.clampNumber(this.config.audio.volume, 0, 1, 0.45);
                }
                if (newConfig.triggerEvents) {
                    this.config.triggerEvents = {
                        ...this.config.triggerEvents,
                        ...newConfig.triggerEvents
                    };
                }
                if (newConfig.gamification) {
                    this.config.gamification = this.mergeGamificationConfig(
                        this.config.gamification,
                        newConfig.gamification
                    );
                    if (newConfig.gamification.state) {
                        this.gamification = this.normalizeGamificationState(
                            newConfig.gamification.state,
                            this.config.gamification
                        );
                    }
                    if (this.config.gamification.enabled === false) {
                        this.clearGamificationTimers();
                        this.gamification.quest.active = null;
                    }
                }
                if (Array.isArray(newConfig.presets)) {
                    this.config.presets = newConfig.presets.slice(0, 20);
                }
                if (Array.isArray(newConfig.sequences)) {
                    this.config.sequences = this.sanitizeSequences(newConfig.sequences);
                }

                await this.api.setConfig('weather_config', this.config);
                this.broadcastGamificationState('config-updated');

                // Get new permanent effects state
                const newPermanentEffects = new Set(
                    this.supportedEffects.filter(effect => 
                        this.config.effects[effect]?.permanent === true
                    )
                );
                
                // Sync permanent effects if changed
                const effectsChanged = oldPermanentEffects.size !== newPermanentEffects.size ||
                    [...oldPermanentEffects].some(e => !newPermanentEffects.has(e)) ||
                    [...newPermanentEffects].some(e => !oldPermanentEffects.has(e));
                
                if (wasEnabled && !this.config.enabled) {
                    this.api.emit('weather:stop', {
                        username: 'system',
                        meta: { triggeredBy: 'plugin-disabled' },
                        timestamp: Date.now()
                    });
                }

                if (effectsChanged || wasEnabled !== this.config.enabled) {
                    this.api.log('♾️ [WEATHER CONTROL] Permanent effects changed, syncing...', 'info');
                }
                this.syncPermanentEffects();

                // Every runtime-facing setting change must reach already-open OBS overlays.
                this.api.emit('weather:config-changed', {
                    timestamp: Date.now(),
                    enabled: this.config.enabled,
                    permanentEffects: Array.from(this.getDesiredPermanentEffects())
                });
                
                // Re-register commands if names changed
                if (commandNamesChanged) {
                    this.api.log('💬 [WEATHER CONTROL] Command names changed, re-registering...', 'info');
                    this.registerGCCECommands();
                }
                
                this.api.log('✅ [WEATHER CONTROL] Configuration updated', 'info');
                res.json({ success: true, config: this.config });
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error updating config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Main weather trigger endpoint
        this.registerAdminRoute('post', '/api/weather/trigger', async (req, res) => {
            try {
                if (!this.config.enabled) {
                    return res.status(403).json({ success: false, error: 'Weather Control is disabled' });
                }

                // Authentication check
                if (!this.config.useGlobalAuth) {
                    const providedKey = req.headers['x-weather-key'];
                    if (!this.apiKeysEqual(providedKey, this.apiKey)) {
                        this.api.log('🚫 [WEATHER CONTROL] Invalid API key attempt', 'warn');
                        return res.status(401).json({ success: false, error: 'Invalid API key' });
                    }
                }

                // Extract request data
                const { action, intensity, duration, username, meta, permanent } = req.body;
                const isPermanent = permanent === true || duration === 0 || duration === '0';

                // Validate action
                if (!action || !this.supportedEffects.includes(action)) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid action. Supported: ${this.supportedEffects.join(', ')}`
                    });
                }

                // Check if effect is enabled
                if (!this.config.effects[action]?.enabled) {
                    return res.status(403).json({
                        success: false,
                        error: `Effect "${action}" is disabled`
                    });
                }

                // Rate limiting check
                const rateLimitResult = this.checkRateLimit(username || req.ip);
                if (!rateLimitResult.allowed) {
                    this.api.log(`⏱️ [WEATHER CONTROL] Rate limit exceeded for ${username || req.ip}`, 'warn');
                    return res.status(429).json({
                        success: false,
                        error: 'Rate limit exceeded. Please try again later.',
                        retryAfter: rateLimitResult.retryAfter
                    });
                }

                // Permission check (if username provided)
                if (username && this.config.permissions.enabled) {
                    const hasPermission = await this.checkUserPermission(username);
                    if (!hasPermission) {
                        this.api.log(`🚫 [WEATHER CONTROL] Permission denied for user ${username}`, 'warn');
                        
                        // Optional: Send feedback to overlay/chat
                        this.api.emit('weather:permission-denied', {
                            username,
                            action,
                            timestamp: Date.now()
                        });
                        
                        return res.status(403).json({
                            success: false,
                            error: 'You do not have permission to trigger weather effects'
                        });
                    }
                }

                const weatherEvent = this.createWeatherEvent({
                    action,
                    intensity,
                    duration,
                    permanent: isPermanent,
                    username: username || 'anonymous',
                    meta,
                    options: req.body.options || {}
                });
                const validIntensity = weatherEvent.intensity;
                const validDuration = weatherEvent.duration;

                // Log event
                this.api.log(`🌦️ [WEATHER CONTROL] Triggered: ${action} (intensity: ${validIntensity}, duration: ${validDuration}ms) by ${username || 'API'}`, 'info');

                // Emit to all overlay clients via WebSocket
                this.api.emit('weather:trigger', weatherEvent);

                res.json({
                    success: true,
                    event: weatherEvent
                });

            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error triggering weather: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Stop all effects or one specific effect
        this.registerAdminRoute('post', '/api/weather/stop', async (req, res) => {
            try {
                const action = req.body?.action;
                if (action && !this.supportedEffects.includes(action)) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid action. Supported: ${this.supportedEffects.join(', ')}`
                    });
                }

                if (action) {
                    this.api.emit('weather:stop-effect', {
                        action,
                        username: req.body?.username || 'dashboard',
                        meta: { triggeredBy: 'api-stop-effect' },
                        timestamp: Date.now()
                    });
                } else {
                    this.api.emit('weather:stop', {
                        username: req.body?.username || 'dashboard',
                        timestamp: Date.now()
                    });
                }

                res.json({ success: true, action: action || null });
            } catch (error) {
                this.api.log(`[WEATHER CONTROL] Error stopping weather: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Trigger a timed weather sequence
        this.registerAdminRoute('post', '/api/weather/sequence/trigger', async (req, res) => {
            try {
                if (!this.config.enabled) {
                    return res.status(403).json({ success: false, error: 'Weather Control is disabled' });
                }

                const requestedSteps = Array.isArray(req.body?.steps) ? req.body.steps : null;
                const sequenceName = req.body?.name;
                const configuredSequence = sequenceName
                    ? (this.config.sequences || []).find(sequence => sequence.name === sequenceName)
                    : null;
                const steps = requestedSteps || configuredSequence?.steps;

                if (!Array.isArray(steps) || steps.length === 0) {
                    return res.status(400).json({ success: false, error: 'A sequence must contain at least one step' });
                }

                const sanitized = this.sanitizeSequences([{ name: sequenceName || 'Ad hoc sequence', steps }])[0];
                if (!sanitized || sanitized.steps.length === 0) {
                    return res.status(400).json({ success: false, error: 'No valid weather steps in sequence' });
                }

                sanitized.steps.forEach((step) => {
                    const timer = setTimeout(() => {
                        this.sequenceTimers.delete(timer);
                        if (!this.config.enabled) {
                            return;
                        }
                        if (!this.config.effects[step.action]?.enabled) {
                            return;
                        }
                        this.emitWeatherEvent(this.createWeatherEvent({
                            action: step.action,
                            intensity: step.intensity,
                            duration: step.duration,
                            permanent: step.permanent,
                            username: req.body?.username || 'sequence',
                            meta: { triggeredBy: 'weather-sequence', sequence: sanitized.name }
                        }));
                    }, step.delay);
                    this.sequenceTimers.add(timer);
                });

                res.json({ success: true, sequence: sanitized });
            } catch (error) {
                this.api.log(`[WEATHER CONTROL] Error triggering sequence: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get supported effects
        this.api.registerRoute('get', '/api/weather/effects', (req, res) => {
            res.json({
                success: true,
                effects: this.supportedEffects,
                config: this.config.effects
            });
        });

        // Get gamification state
        this.api.registerRoute('get', '/api/weather/gamification', (req, res) => {
            try {
                res.json({
                    success: true,
                    gamification: this.getGamificationSnapshot()
                });
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error getting gamification state: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Reset gamification progress
        this.registerAdminRoute('post', '/api/weather/gamification/reset', async (req, res) => {
            try {
                const scope = req.body?.scope || 'all';
                this.resetGamificationProgress(scope);
                await this.persistGamificationState(true);
                res.json({ success: true, gamification: this.getGamificationSnapshot() });
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error resetting gamification: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Reset API key
        this.registerAdminRoute('post', '/api/weather/reset-key', async (req, res) => {
            try {
                this.apiKey = this.generateApiKey();
                this.config.apiKey = this.apiKey;
                await this.api.setConfig('weather_config', this.config);
                
                this.api.log('🔑 [WEATHER CONTROL] API key reset', 'info');
                res.json({ success: true, apiKey: this.apiKey });
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error resetting API key: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get all gift-to-weather mappings
        this.api.registerRoute('get', '/api/weather/gift-mappings', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const mappings = db.getAllGiftWeatherMappings();
                res.json({ success: true, mappings });
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error getting gift mappings: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get specific gift-to-weather mapping
        this.api.registerRoute('get', '/api/weather/gift-mappings/:giftId', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const mapping = db.getGiftWeatherMapping(req.params.giftId);
                res.json({ success: true, mapping });
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error getting gift mapping: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Create or update gift-to-weather mapping
        this.registerAdminRoute('post', '/api/weather/gift-mappings', (req, res) => {
            try {
                const { giftId, weatherEffect, intensity, duration, enabled } = req.body;

                // Validate required fields
                if (!giftId || !weatherEffect) {
                    return res.status(400).json({
                        success: false,
                        error: 'giftId and weatherEffect are required'
                    });
                }

                // Validate weather effect
                if (!this.supportedEffects.includes(weatherEffect)) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid weather effect. Supported: ${this.supportedEffects.join(', ')}`
                    });
                }

                // Validate and sanitize values
                const validIntensity = this.validateIntensity(intensity, weatherEffect);
                const validDuration = this.validateDuration(duration, weatherEffect);

                const db = this.api.getDatabase();
                db.setGiftWeatherMapping(
                    giftId,
                    weatherEffect,
                    validIntensity,
                    validDuration,
                    enabled !== false
                );

                this.api.log(`✅ [WEATHER CONTROL] Gift mapping created/updated: Gift ${giftId} -> ${weatherEffect}`, 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error creating/updating gift mapping: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete gift-to-weather mapping
        this.registerAdminRoute('delete', '/api/weather/gift-mappings/:giftId', (req, res) => {
            try {
                const db = this.api.getDatabase();
                db.deleteGiftWeatherMapping(req.params.giftId);
                
                this.api.log(`🗑️ [WEATHER CONTROL] Gift mapping deleted: Gift ${req.params.giftId}`, 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error deleting gift mapping: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    registerTikTokEventHandlers() {
        // Gift event handler - trigger weather based on gift mapping or fallback to coin value
        this.api.registerTikTokEvent('gift', async (data) => {
            try {
                if (!this.config.enabled) return;

                const { username, giftName, giftId, coins } = data;
                const db = this.api.getDatabase();
                this.applyGamificationEvent('gift', {
                    ...data,
                    username,
                    giftName,
                    giftId,
                    amount: Math.max(1, Math.round((parseFloat(coins) || 0) / 100))
                });

                let weatherAction = null;
                let intensity = null;
                let duration = null;

                // First, check if there's a specific gift-to-weather mapping
                const giftMapping = db.getGiftWeatherMapping(giftId);
                
                if (giftMapping && giftMapping.enabled) {
                    // Use the custom gift mapping
                    weatherAction = giftMapping.weather_effect;
                    intensity = giftMapping.intensity;
                    duration = giftMapping.duration;
                    
                    this.api.log(`🎁 [WEATHER CONTROL] Using gift mapping for gift ${giftId}: ${weatherAction}`, 'debug');
                } else {
                    // Fallback: Simple coin-based mapping (legacy behavior)
                    if (coins >= 5000) {
                        weatherAction = 'storm';
                    } else if (coins >= 1000) {
                        weatherAction = 'thunder';
                    } else if (coins >= 500) {
                        weatherAction = 'rain';
                    } else if (coins >= 100) {
                        weatherAction = 'snow';
                    }

                    // Use default intensity and duration from config
                    if (weatherAction && this.config.effects[weatherAction]) {
                        intensity = this.config.effects[weatherAction].defaultIntensity;
                        duration = this.config.effects[weatherAction].defaultDuration;
                    }
                }

                if (weatherAction && this.config.effects[weatherAction]?.enabled) {
                    const isPermanent = duration === 0;
                    const validatedIntensity = this.validateIntensity(intensity, weatherAction);
                    const validatedDuration = this.validateDuration(duration, weatherAction, isPermanent);

                    // Check permissions
                    if (this.config.permissions.enabled) {
                        const hasPermission = await this.checkUserPermission(username);
                        if (!hasPermission) {
                            this.api.log(`🚫 [WEATHER CONTROL] Permission denied for gift from ${username}`, 'debug');
                            return;
                        }
                    }

                    // Check rate limit
                    const rateLimitResult = this.checkRateLimit(username);
                    if (!rateLimitResult.allowed) {
                        this.api.log(`⏱️ [WEATHER CONTROL] Rate limit exceeded for ${username}`, 'debug');
                        return;
                    }

                    const weatherEvent = {
                        type: 'weather',
                        action: weatherAction,
                        intensity: validatedIntensity,
                        duration: validatedDuration,
                        permanent: isPermanent,
                        username,
                        meta: { 
                            triggeredBy: giftMapping ? 'gift-mapping' : 'gift-coins', 
                            giftName, 
                            giftId,
                            coins 
                        },
                        timestamp: Date.now()
                    };

                    this.api.log(`🎁 [WEATHER CONTROL] Gift triggered: ${weatherAction} by ${username} (${giftName})`, 'info');
                    this.api.emit('weather:trigger', weatherEvent);
                }
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error in gift handler: ${error.message}`, 'error');
            }
        });

        this.api.registerTikTokEvent('follow', async (data) => {
            this.applyGamificationEvent('follow', data);
            await this.triggerConfiguredTikTokEvent('follow', data);
        });

        this.api.registerTikTokEvent('share', async (data) => {
            this.applyGamificationEvent('share', data);
            await this.triggerConfiguredTikTokEvent('share', data);
        });

        this.api.registerTikTokEvent('subscribe', async (data) => {
            this.applyGamificationEvent('subscribe', data);
            await this.triggerConfiguredTikTokEvent('subscribe', data);
        });

        this.api.registerTikTokEvent('chat', async (data) => {
            this.applyGamificationEvent('chat', data);
        });

        this.api.registerTikTokEvent('like', async (data) => {
            try {
                this.applyGamificationEvent('like', {
                    ...data,
                    amount: Math.max(1, parseInt(data.likeCount || data.likes || data.count || 1) || 1)
                });
                const trigger = this.config.triggerEvents?.likeMilestone;
                if (!trigger?.enabled) return;

                const increment = parseInt(data.likeCount || data.likes || data.count || 1) || 1;
                this.likeMilestoneState.totalLikes += increment;
                const interval = Math.max(1, parseInt(trigger.interval) || 1000);
                const milestone = Math.floor(this.likeMilestoneState.totalLikes / interval) * interval;

                if (milestone > this.likeMilestoneState.lastMilestone) {
                    this.likeMilestoneState.lastMilestone = milestone;
                    await this.triggerConfiguredTikTokEvent('likeMilestone', {
                        ...data,
                        milestone,
                        totalLikes: this.likeMilestoneState.totalLikes
                    });
                }
            } catch (error) {
                this.api.log(`[WEATHER CONTROL] Error in like milestone handler: ${error.message}`, 'error');
            }
        });
    }

    async triggerConfiguredTikTokEvent(triggerName, data = {}) {
        try {
            if (!this.config.enabled) return;
            const trigger = this.config.triggerEvents?.[triggerName];
            if (!trigger?.enabled) return;

            const action = trigger.action;
            if (!this.supportedEffects.includes(action) || !this.config.effects[action]?.enabled) {
                return;
            }

            const event = this.createWeatherEvent({
                action,
                intensity: trigger.intensity,
                duration: trigger.duration,
                permanent: trigger.permanent === true,
                username: data.username || data.nickname || triggerName,
                meta: {
                    triggeredBy: triggerName,
                    milestone: data.milestone,
                    totalLikes: data.totalLikes
                }
            });

            this.api.log(`[WEATHER CONTROL] ${triggerName} triggered ${action}`, 'info');
            this.emitWeatherEvent(event);
        } catch (error) {
            this.api.log(`[WEATHER CONTROL] Error triggering ${triggerName}: ${error.message}`, 'error');
        }
    }

    registerFlowActions() {
        // Register flow action for weather trigger
        this.api.registerFlowAction('weather.trigger', async (params) => {
            try {
                if (!this.config.enabled) {
                    return { success: false, error: 'Weather Control is disabled' };
                }

                const { action, intensity, duration, meta, permanent } = params;

                if (!action || !this.supportedEffects.includes(action)) {
                    return { success: false, error: `Invalid action: ${action}` };
                }

                if (!this.config.effects[action]?.enabled) {
                    return { success: false, error: `Effect "${action}" is disabled` };
                }

                const validIntensity = this.validateIntensity(intensity, action);
                const validDuration = this.validateDuration(duration, action, permanent === true);

                const weatherEvent = {
                    type: 'weather',
                    action,
                    intensity: validIntensity,
                    duration: validDuration,
                    permanent: permanent === true,
                    username: 'flow-automation',
                    meta: this.sanitizeMeta(meta),
                    timestamp: Date.now()
                };

                this.api.log(`⚡ [WEATHER CONTROL] Flow triggered: ${action}`, 'info');
                this.api.emit('weather:trigger', weatherEvent);

                return { success: true, event: weatherEvent };
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error in flow action: ${error.message}`, 'error');
                return { success: false, error: error.message };
            }
        });
    }

    registerSocketSync() {
        try {
            if (this.socketSyncRegistered) {
                return;
            }

            const io = this.api.getSocketIO ? this.api.getSocketIO() : null;
            if (!io) {
                return;
            }

            this.socketConnectionHandler = (socket) => {
                try {
                    this.api.log('🔄 [WEATHER CONTROL] New overlay client connected, waiting for ready signal...', 'debug');

                    const handlers = {
                        clientReady: () => {
                            this.api.log('✅ [WEATHER CONTROL] Client ready, syncing permanent effects...', 'debug');
                            this.syncPermanentEffects(socket);
                        },
                        requestPermanentEffects: () => {
                            this.api.log('🔄 [WEATHER CONTROL] Client requested permanent effects', 'debug');
                            this.syncPermanentEffects(socket);
                        },
                        overlayState: (payload = {}) => {
                            this.api.emit('weather:active-state', {
                                ...this.sanitizeOverlayState(payload),
                                gamification: this.getGamificationSnapshot(),
                                timestamp: Date.now()
                            });
                        },
                        requestGamificationState: () => {
                            socket.emit('weather:gamification-state', this.getGamificationSnapshot());
                        },
                        disconnect: () => {
                            this.socketHandlers.delete(socket);
                        }
                    };

                    this.socketHandlers.set(socket, handlers);

                    // Wait for Ready-Signal from client
                    socket.on('weather:client-ready', handlers.clientReady);
                    
                    // Allow clients to request permanent effects explicitly
                    socket.on('weather:request-permanent-effects', handlers.requestPermanentEffects);
                    socket.on('weather:overlay-state', handlers.overlayState);
                    socket.on('weather:request-gamification-state', handlers.requestGamificationState);
                    socket.on('disconnect', handlers.disconnect);
                    socket.emit('weather:gamification-state', this.getGamificationSnapshot());
                } catch (error) {
                    this.api.log(`❌ [WEATHER CONTROL] Error syncing permanent effects: ${error.message}`, 'error');
                }
            };

            io.on('connection', this.socketConnectionHandler);

            this.socketSyncRegistered = true;
        } catch (error) {
            this.api.log(`❌ [WEATHER CONTROL] Error registering socket sync: ${error.message}`, 'error');
        }
    }

    syncPermanentEffects(targetSocket = null) {
        const desiredEffects = this.getDesiredPermanentEffects();

        // When called for a specific socket, send ALL desired permanent effects
        if (targetSocket) {
            desiredEffects.forEach(effect => this.emitPermanentEffect(effect, targetSocket));
            // ✅ FIX: Update activePermanentEffects during socket sync
            // Use clear/add to preserve Set reference
            this.activePermanentEffects.clear();
            desiredEffects.forEach(e => this.activePermanentEffects.add(e));
            this.api.log(`✅ [WEATHER CONTROL] Synced ${desiredEffects.size} permanent effects to new client`, 'debug');
            return;
        }

        // Global sync: stop outdated effects and re-emit desired permanent effects.
        // Re-emitting existing effects lets overlays apply updated intensity/config.
        this.activePermanentEffects.forEach((effect) => {
            if (!desiredEffects.has(effect)) {
                this.api.emit('weather:stop-effect', { action: effect, meta: { triggeredBy: 'permanent-toggle' } });
                this.api.log(`🛑 [WEATHER CONTROL] Stopped permanent effect: ${effect}`, 'info');
            }
        });

        desiredEffects.forEach((effect) => {
            this.emitPermanentEffect(effect);
            this.api.log(`♾️ [WEATHER CONTROL] Synced permanent effect: ${effect}`, 'info');
        });

        // Update activePermanentEffects in-place to preserve references
        this.activePermanentEffects.clear();
        desiredEffects.forEach(e => this.activePermanentEffects.add(e));
    }

    emitPermanentEffect(effect, socket = null) {
        const effectConfig = this.config.effects[effect] || {};
        const payload = {
            type: 'weather',
            action: effect,
            intensity: this.validateIntensity(effectConfig.defaultIntensity, effect),
            duration: 0,
            permanent: true,
            username: 'system',
            meta: { triggeredBy: 'permanent' },
            timestamp: Date.now()
        };

        if (socket) {
            socket.emit('weather:trigger', payload);
        } else {
            this.api.emit('weather:trigger', payload);
        }
    }

    /**
     * Register GCCE chat commands for weather control
     */
    registerGCCECommands() {
        try {
            // Try to get GCCE plugin instance
            const gcce = this.getGCCEInstance();
            
            if (!gcce) {
                this.api.log('💬 [WEATHER CONTROL] GCCE not available, skipping command registration', 'debug');
                return;
            }

            if (!this.config.chatCommands.enabled) {
                this.api.log('💬 [WEATHER CONTROL] Chat commands disabled in config', 'debug');
                return;
            }
            
            // Get custom command names from config
            const cmdNames = this.config.chatCommands.commandNames || {
                weather: 'weather',
                weatherlist: 'weatherlist',
                weatherstop: 'weatherstop'
            };
            
            // Define weather commands with custom names
            const commands = [
                {
                    name: cmdNames.weather,
                    description: 'Trigger weather effects on the stream',
                    syntax: `/${cmdNames.weather} <effect> [intensity] [duration]`,
                    permission: 'all', // Permission check handled by weather plugin
                    enabled: true,
                    minArgs: 1,
                    maxArgs: 3,
                    category: 'Weather',
                    handler: async (args, context) => await this.handleWeatherCommand(args, context)
                },
                {
                    name: cmdNames.weatherlist,
                    description: 'List all available weather effects',
                    syntax: `/${cmdNames.weatherlist}`,
                    permission: 'all',
                    enabled: true,
                    minArgs: 0,
                    maxArgs: 0,
                    category: 'Weather',
                    handler: async (args, context) => await this.handleWeatherListCommand(args, context)
                },
                {
                    name: cmdNames.weatherstop,
                    description: 'Stop all active weather effects',
                    syntax: `/${cmdNames.weatherstop} [effect]`,
                    permission: 'subscriber', // Only subscribers and above can stop
                    enabled: true,
                    minArgs: 0,
                    maxArgs: 1,
                    category: 'Weather',
                    handler: async (args, context) => await this.handleWeatherStopCommand(args, context)
                }
            ];

            // Unregister old commands first (in case names changed)
            try {
                gcce.unregisterCommandsForPlugin('weather-control');
            } catch (e) {
                // Ignore errors if commands don't exist yet
            }

            // Register commands with GCCE
            const result = gcce.registerCommandsForPlugin('weather-control', commands);
            
            this.api.log(`💬 [WEATHER CONTROL] Registered ${result.registered.length} commands with GCCE`, 'info');
            
            if (result.failed.length > 0) {
                this.api.log(`💬 [WEATHER CONTROL] Failed to register commands: ${result.failed.join(', ')}`, 'warn');
            }

        } catch (error) {
            this.api.log(`❌ [WEATHER CONTROL] Error registering GCCE commands: ${error.message}`, 'error');
        }
    }

    /**
     * Handle /weather command
     */
    async handleWeatherCommand(args, context) {
        try {
            if (!this.config.enabled) {
                return {
                    success: false,
                    error: 'Weather effects are currently disabled',
                    displayOverlay: true
                };
            }

            const effectName = args[0].toLowerCase();
            
            // Check if effect exists and is enabled
            if (!this.supportedEffects.includes(effectName)) {
                return {
                    success: false,
                    error: `Unknown weather effect: ${effectName}. Use /weatherlist to see available effects.`,
                    displayOverlay: true
                };
            }

            if (!this.config.effects[effectName]?.enabled) {
                return {
                    success: false,
                    error: `Weather effect "${effectName}" is disabled`,
                    displayOverlay: true
                };
            }

            // Permission check
            if (this.config.chatCommands.requirePermission && this.config.permissions.enabled) {
                const hasPermission = await this.checkUserPermission(context.username, context.userData);
                if (!hasPermission) {
                    this.api.log(`🚫 [WEATHER CONTROL] Permission denied for user ${context.username}`, 'debug');
                    
                    // Emit permission denied event
                    this.api.emit('weather:permission-denied', {
                        username: context.username,
                        action: effectName,
                        timestamp: Date.now()
                    });
                    
                    return {
                        success: false,
                        error: 'You do not have permission to trigger weather effects',
                        displayOverlay: true
                    };
                }
            }

            // Rate limiting check
            const rateLimitResult = this.checkRateLimit(context.username);
            if (!rateLimitResult.allowed) {
                this.api.log(`⏱️ [WEATHER CONTROL] Rate limit exceeded for ${context.username}`, 'debug');
                return {
                    success: false,
                    error: `You are sending commands too quickly. Please wait ${rateLimitResult.retryAfter} seconds.`,
                    displayOverlay: true
                };
            }

            // Parse intensity (if allowed and provided)
            let intensity = this.config.effects[effectName].defaultIntensity;
            if (this.config.chatCommands.allowIntensityControl && args.length >= 2) {
                const parsedIntensity = parseFloat(args[1]);
                if (!isNaN(parsedIntensity)) {
                    intensity = this.validateIntensity(parsedIntensity, effectName);
                }
            }

            // Parse duration (if allowed and provided)
            let duration = this.config.effects[effectName].defaultDuration;
            if (this.config.chatCommands.allowDurationControl && args.length >= 3) {
                const parsedDuration = parseInt(args[2]);
                if (!isNaN(parsedDuration)) {
                    duration = this.validateDuration(parsedDuration, effectName);
                }
            }

            // Create weather event
            const weatherEvent = {
                type: 'weather',
                action: effectName,
                intensity,
                duration,
                username: context.username,
                meta: { triggeredBy: 'chat-command' },
                timestamp: Date.now()
            };

            // Log and emit
            this.api.log(`🌦️ [WEATHER CONTROL] Chat command triggered: ${effectName} by ${context.username}`, 'info');
            this.api.emit('weather:trigger', weatherEvent);

            return {
                success: true,
                message: `Triggered ${effectName} weather effect!`,
                displayOverlay: true,
                data: weatherEvent
            };

        } catch (error) {
            this.api.log(`❌ [WEATHER CONTROL] Error in weather command: ${error.message}`, 'error');
            return {
                success: false,
                error: 'Failed to trigger weather effect',
                displayOverlay: true
            };
        }
    }

    /**
     * Handle /weatherlist command
     */
    async handleWeatherListCommand(args, context) {
        try {
            // Get enabled effects
            const enabledEffects = this.supportedEffects.filter(effect => 
                this.config.effects[effect]?.enabled
            );

            if (enabledEffects.length === 0) {
                return {
                    success: true,
                    message: 'No weather effects are currently available.',
                    displayOverlay: true
                };
            }

            // Create formatted list with emojis
            const effectEmojis = {
                rain: '🌧️',
                snow: '❄️',
                storm: '⛈️',
                fog: '🌫️',
                thunder: '⚡',
                sunbeam: '☀️',
                glitchclouds: '☁️'
            };

            const effectList = enabledEffects.map(effect => 
                `${effectEmojis[effect] || '🌦️'} ${effect}`
            ).join(', ');

            return {
                success: true,
                message: `Available weather effects: ${effectList}`,
                displayOverlay: true,
                data: {
                    effects: enabledEffects,
                    total: enabledEffects.length
                }
            };

        } catch (error) {
            this.api.log(`❌ [WEATHER CONTROL] Error in weatherlist command: ${error.message}`, 'error');
            return {
                success: false,
                error: 'Failed to list weather effects',
                displayOverlay: true
            };
        }
    }

    /**
     * Handle /weatherstop command
     */
    async handleWeatherStopCommand(args, context) {
        try {
            const effectName = args[0] ? args[0].toLowerCase() : null;
            if (effectName) {
                if (!this.supportedEffects.includes(effectName)) {
                    return {
                        success: false,
                        error: `Unknown weather effect: ${effectName}. Use /weatherlist to see available effects.`,
                        displayOverlay: true
                    };
                }

                this.api.emit('weather:stop-effect', {
                    action: effectName,
                    username: context.username,
                    timestamp: Date.now()
                });

                return {
                    success: true,
                    message: `${effectName} weather effect stopped`,
                    displayOverlay: true
                };
            }

            // Emit stop event to overlay
            this.api.emit('weather:stop', {
                username: context.username,
                timestamp: Date.now()
            });

            this.api.log(`🛑 [WEATHER CONTROL] Weather effects stopped by ${context.username}`, 'info');

            return {
                success: true,
                message: 'All weather effects stopped',
                displayOverlay: true
            };

        } catch (error) {
            this.api.log(`❌ [WEATHER CONTROL] Error in weatherstop command: ${error.message}`, 'error');
            return {
                success: false,
                error: 'Failed to stop weather effects',
                displayOverlay: true
            };
        }
    }

    /**
     * Check if user has permission to trigger weather effects
     * Uses userData from GCCE context to avoid redundant DB queries
     */
    async checkUserPermission(username, contextUserData = null) {
        try {
            const permissions = this.config.permissions;

            // If permissions disabled or allow all, grant access
            if (!permissions.enabled || permissions.allowAll) {
                return true;
            }

            // Check if user is in allowed users list
            if (permissions.allowedUsers && permissions.allowedUsers.includes(username)) {
                return true;
            }

            // Use context userData if provided (from GCCE)
            let user = null;
            if (contextUserData?.dbUser) {
                user = contextUserData.dbUser;
                this.api.log('🔍 [WEATHER CONTROL] Using cached user data from GCCE', 'debug');
            } else {
                // Fallback: Get user data from database
                const db = this.api.getDatabase();
                user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
                this.api.log('🔍 [WEATHER CONTROL] Fetching user data from database (fallback)', 'debug');
            }

            if (!user) {
                // User not in database, deny by default
                return false;
            }

            // Check follower status
            if (permissions.allowedGroups.followers && user.is_follower) {
                return true;
            }

            // Check team member level
            if (permissions.allowedGroups.teamMembers && 
                user.team_member_level >= permissions.allowedGroups.minTeamLevel) {
                return true;
            }

            // Check superfans (users with high gift count)
            if (permissions.allowedGroups.superfans && user.gifts_sent >= 50) {
                return true;
            }

            // Check subscribers (team members level 1+)
            if (permissions.allowedGroups.subscribers && user.team_member_level > 0) {
                return true;
            }

            // Check top gifters
            if (permissions.topGifterThreshold > 0) {
                const topGifters = db.prepare(`
                    SELECT username FROM users 
                    ORDER BY coins_sent DESC 
                    LIMIT ?
                `).all(permissions.topGifterThreshold);

                if (topGifters.some(g => g.username === username)) {
                    return true;
                }
            }

            // Check minimum points/coins
            if (permissions.minPoints > 0 && user.coins_sent >= permissions.minPoints) {
                return true;
            }

            // Default: deny
            return false;

        } catch (error) {
            this.api.log(`❌ [WEATHER CONTROL] Error checking permissions: ${error.message}`, 'error');
            // On error, deny access for safety
            return false;
        }
    }

    /**
     * Check rate limit for user/IP
     */
    checkRateLimit(identifier) {
        const now = Date.now();
        const userLimit = this.userRateLimit.get(identifier);

        if (!userLimit) {
            // First request
            this.userRateLimit.set(identifier, {
                count: 1,
                resetTime: now + this.rateLimitWindow
            });
            return { allowed: true };
        }

        // Check if window has expired
        if (now > userLimit.resetTime) {
            // Reset window
            this.userRateLimit.set(identifier, {
                count: 1,
                resetTime: now + this.rateLimitWindow
            });
            return { allowed: true };
        }

        // Check if limit exceeded
        if (userLimit.count >= this.rateLimitMax) {
            return {
                allowed: false,
                retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
            };
        }

        // Increment count
        userLimit.count++;
        return { allowed: true };
    }

    getDefaultGamificationConfig() {
        return {
            enabled: true,
            communityMeter: {
                enabled: true,
                max: 100,
                carryOver: true,
                showOnOverlay: true,
                rewardBoostMultiplier: 1.2,
                contributionWeights: {
                    chat: 1,
                    like: 0.02,
                    follow: 15,
                    share: 10,
                    subscribe: 20,
                    gift: 0.05,
                    weatherReward: 5
                }
            },
            quests: {
                enabled: true,
                oneActivePerStream: true,
                rotateOnCompletion: true,
                rotationIntervalMs: 900000,
                streakWindowMs: 60000,
                showOnOverlay: true,
                pool: [
                    {
                        id: 'community-chat',
                        title: 'Community Voice',
                        type: 'chat_count',
                        target: 10,
                        eventTypes: ['chat'],
                        reward: { action: 'rain', intensity: 0.35, duration: 8000 }
                    },
                    {
                        id: 'supporter-surge',
                        title: 'Supporter Surge',
                        type: 'gift_count',
                        target: 3,
                        eventTypes: ['gift'],
                        reward: { action: 'storm', intensity: 0.7, duration: 10000 }
                    },
                    {
                        id: 'hot-streak',
                        title: 'Hot Streak',
                        type: 'streak_chain',
                        target: 5,
                        eventTypes: ['chat', 'like', 'gift', 'follow', 'share', 'subscribe'],
                        reward: { action: 'thunder', intensity: 0.9, duration: 5000 }
                    },
                    {
                        id: 'meter-surge',
                        title: 'Meter Surge',
                        type: 'meter_fill',
                        target: 100,
                        eventTypes: ['meter'],
                        reward: { action: 'meteors', intensity: 0.55, duration: 9000 }
                    }
                ]
            },
            streaks: {
                enabled: true,
                windowMs: 60000,
                resetAfterMs: 180000,
                bonusThreshold: 5,
                bonusMultiplier: 1.1,
                showOnOverlay: true
            },
            rewards: {
                enabled: true,
                cooldownMs: 30000,
                carryOver: true,
                historyLimit: 10,
                thresholds: [
                    { meter: 25, action: 'rain', intensity: 0.35, duration: 8000, label: 'Sprinkle' },
                    { meter: 50, action: 'snow', intensity: 0.45, duration: 9000, label: 'Blizzard' },
                    { meter: 75, action: 'storm', intensity: 0.75, duration: 10000, label: 'Squall' },
                    { meter: 100, action: 'thunder', intensity: 0.95, duration: 5000, label: 'Tempest' }
                ]
            },
            overlay: {
                enabled: true,
                showMeter: true,
                showQuest: true,
                showStreak: true,
                showRewardFeed: true
            },
            state: this.createDefaultGamificationRuntimeState()
        };
    }

    createDefaultGamificationRuntimeState() {
        return {
            communityMeter: {
                current: 0,
                total: 0,
                lastUpdatedAt: 0,
                lastRewardAt: 0
            },
            streaks: {
                current: 0,
                best: 0,
                lastEventAt: 0,
                lastContributor: null,
                lastResetAt: 0
            },
            quest: {
                active: null,
                rotationIndex: 0,
                completedCount: 0,
                lastCompletedAt: 0
            },
            rewards: {
                history: [],
                firedThresholds: []
            },
            lastBroadcastAt: 0
        };
    }

    normalizeQuestDefinition(quest, index = 0) {
        const normalized = {
            id: String(quest.id || `quest-${index + 1}`).replace(/<[^>]*>/g, '').substring(0, 80),
            title: String(quest.title || `Quest ${index + 1}`).replace(/<[^>]*>/g, '').substring(0, 80),
            type: String(quest.type || 'chat_count'),
            target: Math.max(1, parseInt(quest.target) || 1),
            eventTypes: Array.isArray(quest.eventTypes) ? quest.eventTypes.slice(0, 10) : [],
            reward: {
                action: this.supportedEffects.includes(quest.reward?.action) ? quest.reward.action : 'rain',
                intensity: this.validateIntensity(quest.reward?.intensity, quest.reward?.action || 'rain'),
                duration: this.validateDuration(quest.reward?.duration, quest.reward?.action || 'rain')
            }
        };

        if (quest.expiresInMs) {
            normalized.expiresInMs = Math.max(1000, parseInt(quest.expiresInMs) || 0);
        }

        return normalized;
    }

    normalizeGamificationState(state = {}, config = this.config?.gamification || {}) {
        const defaultState = this.createDefaultGamificationRuntimeState();
        const mergedState = {
            ...defaultState,
            ...state,
            communityMeter: {
                ...defaultState.communityMeter,
                ...(state.communityMeter || {})
            },
            streaks: {
                ...defaultState.streaks,
                ...(state.streaks || {})
            },
            quest: {
                ...defaultState.quest,
                ...(state.quest || {})
            },
            rewards: {
                ...defaultState.rewards,
                ...(state.rewards || {})
            }
        };

        mergedState.communityMeter.current = Math.max(0, parseInt(mergedState.communityMeter.current) || 0);
        mergedState.communityMeter.total = Math.max(0, parseInt(mergedState.communityMeter.total) || 0);
        mergedState.streaks.current = Math.max(0, parseInt(mergedState.streaks.current) || 0);
        mergedState.streaks.best = Math.max(0, parseInt(mergedState.streaks.best) || 0);
        mergedState.quest.rotationIndex = Math.max(0, parseInt(mergedState.quest.rotationIndex) || 0);
        mergedState.quest.completedCount = Math.max(0, parseInt(mergedState.quest.completedCount) || 0);
        mergedState.rewards.history = Array.isArray(mergedState.rewards.history)
            ? mergedState.rewards.history.slice(0, config?.rewards?.historyLimit || 10)
            : [];
        mergedState.rewards.firedThresholds = Array.isArray(mergedState.rewards.firedThresholds)
            ? mergedState.rewards.firedThresholds.map((value) => Math.max(0, parseInt(value) || 0))
            : [];

        const maxMeter = Math.max(1, parseInt(config?.communityMeter?.max) || 100);
        mergedState.communityMeter.current = Math.min(maxMeter, mergedState.communityMeter.current);

        return mergedState;
    }

    mergeGamificationConfig(base = {}, incoming = {}) {
        const merged = {
            ...base,
            ...incoming,
            communityMeter: {
                ...(base.communityMeter || {}),
                ...(incoming.communityMeter || {})
            },
            quests: {
                ...(base.quests || {}),
                ...(incoming.quests || {})
            },
            streaks: {
                ...(base.streaks || {}),
                ...(incoming.streaks || {})
            },
            rewards: {
                ...(base.rewards || {}),
                ...(incoming.rewards || {})
            },
            overlay: {
                ...(base.overlay || {}),
                ...(incoming.overlay || {})
            }
        };

        if (incoming.state) {
            merged.state = this.normalizeGamificationState(incoming.state, merged);
        } else if (base.state) {
            merged.state = this.normalizeGamificationState(base.state, merged);
        } else {
            merged.state = this.createDefaultGamificationRuntimeState();
        }

        merged.rewards.thresholds = Array.isArray(merged.rewards.thresholds)
            ? merged.rewards.thresholds
                .filter(Boolean)
                .map((threshold) => ({
                    meter: Math.max(0, parseInt(threshold.meter) || 0),
                    action: this.supportedEffects.includes(threshold.action) ? threshold.action : 'rain',
                    intensity: this.validateIntensity(threshold.intensity, threshold.action || 'rain'),
                    duration: this.validateDuration(threshold.duration, threshold.action || 'rain'),
                    label: String(threshold.label || `${threshold.meter || 0}`).substring(0, 80)
                }))
                .sort((a, b) => a.meter - b.meter)
            : [];

        merged.quests.pool = Array.isArray(merged.quests.pool)
            ? merged.quests.pool
                .filter(Boolean)
                .map((quest, index) => this.normalizeQuestDefinition(quest, index))
            : [];

        return merged;
    }

    initializeGamificationState() {
        const gamificationConfig = this.config?.gamification || this.getDefaultGamificationConfig();
        const persistedState = gamificationConfig.state || {};
        this.gamification = this.normalizeGamificationState(persistedState, gamificationConfig);
        this.config.gamification = {
            ...gamificationConfig,
            state: this.serializeGamificationState()
        };
        if (gamificationConfig.enabled === false) {
            this.gamification.quest.active = null;
            this.clearGamificationTimers();
            return this.gamification;
        }
        if (gamificationConfig.quests?.enabled !== false && !this.gamification.quest.active) {
            this.createNextQuest();
        }
        return this.gamification;
    }

    clearGamificationTimers() {
        if (this.questRotationTimer) {
            clearTimeout(this.questRotationTimer);
            this.questRotationTimer = null;
        }
        if (this.gamificationPersistTimer) {
            clearTimeout(this.gamificationPersistTimer);
            this.gamificationPersistTimer = null;
        }
    }

    serializeGamificationState() {
        const historyLimit = Math.max(1, parseInt(this.config?.gamification?.rewards?.historyLimit) || 10);
        const state = this.normalizeGamificationState(this.gamification, this.config?.gamification || {});
        return {
            communityMeter: {
                ...state.communityMeter
            },
            streaks: {
                ...state.streaks
            },
            quest: {
                ...state.quest
            },
            rewards: {
                history: state.rewards.history.slice(0, historyLimit),
                firedThresholds: Array.isArray(state.rewards.firedThresholds)
                    ? state.rewards.firedThresholds.slice(0, 20)
                    : []
            },
            lastBroadcastAt: state.lastBroadcastAt || 0
        };
    }

    getGamificationSnapshot() {
        const config = this.config?.gamification || this.getDefaultGamificationConfig();
        const state = this.normalizeGamificationState(this.gamification, config);
        const activeQuest = state.quest.active;
        const nextThreshold = Array.isArray(config.rewards?.thresholds)
            ? config.rewards.thresholds.find((threshold) => threshold.meter > state.communityMeter.current) || null
            : null;

        return {
            enabled: config.enabled !== false,
            communityMeter: {
                enabled: config.communityMeter?.enabled !== false,
                current: state.communityMeter.current,
                total: state.communityMeter.total,
                max: Math.max(1, parseInt(config.communityMeter?.max) || 100),
                lastUpdatedAt: state.communityMeter.lastUpdatedAt,
                lastRewardAt: state.communityMeter.lastRewardAt
            },
            streaks: {
                enabled: config.streaks?.enabled !== false,
                current: state.streaks.current,
                best: state.streaks.best,
                windowMs: Math.max(1000, parseInt(config.streaks?.windowMs) || 60000),
                lastEventAt: state.streaks.lastEventAt
            },
            quest: activeQuest,
            rewards: {
                nextThreshold,
                history: state.rewards.history.slice(0, Math.max(1, parseInt(config.rewards?.historyLimit) || 10))
            },
            overlay: {
                enabled: config.overlay?.enabled !== false,
                showMeter: config.overlay?.showMeter !== false,
                showQuest: config.overlay?.showQuest !== false,
                showStreak: config.overlay?.showStreak !== false,
                showRewardFeed: config.overlay?.showRewardFeed !== false
            }
        };
    }

    scheduleGamificationPersist() {
        if (this.config?.gamification?.enabled === false) {
            if (this.gamificationPersistTimer) {
                clearTimeout(this.gamificationPersistTimer);
                this.gamificationPersistTimer = null;
            }
            return;
        }
        if (this.gamificationPersistTimer) {
            clearTimeout(this.gamificationPersistTimer);
        }

        this.gamificationPersistTimer = setTimeout(() => {
            this.persistGamificationState().catch((error) => {
                this.api.log(`❌ [WEATHER CONTROL] Error persisting gamification state: ${error.message}`, 'error');
            });
        }, 150);
    }

    async persistGamificationState(force = false) {
        if (!this.config?.gamification) {
            return;
        }

        this.config.gamification.state = this.serializeGamificationState();
        await this.api.setConfig('weather_config', this.config);
        if (force) {
            return;
        }
    }

    broadcastGamificationState(reason = 'update', extra = {}) {
        if (this.config?.gamification?.enabled === false) {
            return null;
        }
        const payload = {
            reason,
            timestamp: Date.now(),
            gamification: this.getGamificationSnapshot(),
            ...extra
        };

        this.api.emit('weather:gamification-state', payload);
        this.gamification.lastBroadcastAt = payload.timestamp;
        return payload;
    }

    resetGamificationProgress(scope = 'all') {
        if (!this.gamification) {
            this.gamification = this.createDefaultGamificationRuntimeState();
        }

        if (scope === 'meter' || scope === 'all') {
            this.gamification.communityMeter.current = 0;
            this.gamification.communityMeter.lastRewardAt = 0;
        }
        if (scope === 'streak' || scope === 'all') {
            this.gamification.streaks.current = 0;
            this.gamification.streaks.lastEventAt = 0;
            this.gamification.streaks.lastContributor = null;
            this.gamification.streaks.lastResetAt = Date.now();
        }
        if (scope === 'quest' || scope === 'all') {
            this.gamification.quest.active = null;
            this.gamification.quest.rotationIndex = 0;
            this.gamification.quest.completedCount = 0;
            this.gamification.quest.lastCompletedAt = 0;
        }
        if (scope === 'rewards' || scope === 'all') {
            this.gamification.rewards.history = [];
            this.gamification.rewards.firedThresholds = [];
        }
        this.scheduleGamificationPersist();
        this.broadcastGamificationState(`reset:${scope}`);
    }

    getGamificationContributionWeight(eventType, payload = {}) {
        const config = this.config?.gamification || this.getDefaultGamificationConfig();
        const weights = config.communityMeter?.contributionWeights || {};
        const aliasMap = {
            likeMilestone: 'like'
        };
        const normalizedType = aliasMap[eventType] || eventType;
        const weight = Number(weights[normalizedType]);
        const fallback = normalizedType === 'gift' ? 0.05 : normalizedType === 'like' ? 0.02 : 1;
        const baseWeight = Number.isFinite(weight) ? weight : fallback;
        const amount = Math.max(1, parseFloat(payload.amount || payload.likeCount || payload.likes || payload.count || payload.coins || 1) || 1);
        const username = String(payload.username || payload.nickname || payload.userName || payload.uniqueId || 'anonymous');
        let multiplier = 1;

        if (config.communityMeter?.rewardBoostMultiplier && this.config.permissions?.enabled && username) {
            const hasPermission = payload.permissionGranted === true || payload.permissionGranted === 'true';
            multiplier = hasPermission ? config.communityMeter.rewardBoostMultiplier : 1;
        }

        return {
            normalizedType,
            amount,
            weight: baseWeight,
            multiplier,
            total: baseWeight * amount * multiplier
        };
    }

    createNextQuest() {
        const config = this.config?.gamification || this.getDefaultGamificationConfig();
        if (config.enabled === false) {
            return null;
        }
        const pool = Array.isArray(config.quests?.pool) ? config.quests.pool : [];
        if (pool.length === 0) {
            this.gamification.quest.active = null;
            return null;
        }

        const questIndex = this.gamification.quest.rotationIndex % pool.length;
        const questDefinition = pool[questIndex];
        const activeQuest = {
            ...questDefinition,
            progress: 0,
            status: 'active',
            startedAt: Date.now(),
            completedAt: null
        };

        this.gamification.quest.rotationIndex = (questIndex + 1) % pool.length;
        this.gamification.quest.active = activeQuest;
        this.scheduleGamificationPersist();
        this.broadcastGamificationState('quest-created', { quest: activeQuest });
        return activeQuest;
    }

    advanceQuestProgress(eventType, payload = {}, contribution = null) {
        const config = this.config?.gamification || this.getDefaultGamificationConfig();
        if (!config.enabled || config.quests?.enabled === false) {
            return null;
        }

        if (!this.gamification.quest.active) {
            this.createNextQuest();
        }

        const quest = this.gamification.quest.active;
        if (!quest) {
            return null;
        }

        const normalizedType = contribution?.normalizedType || eventType;
        const questMatches = Array.isArray(quest.eventTypes) && (
            quest.eventTypes.includes(normalizedType) ||
            quest.eventTypes.includes(eventType)
        );

        if (quest.type === 'meter_fill') {
            quest.progress = Math.min(quest.target, this.gamification.communityMeter.current);
        } else if (quest.type === 'streak_chain') {
            quest.progress = Math.min(quest.target, this.gamification.streaks.current);
        } else if (questMatches) {
            const increment = Math.max(1, Math.round(contribution?.amount || 1));
            quest.progress = Math.min(quest.target, (quest.progress || 0) + increment);
        }

        if (quest.progress >= quest.target) {
            quest.status = 'completed';
            quest.completedAt = Date.now();
            this.gamification.quest.completedCount++;
            this.gamification.quest.lastCompletedAt = quest.completedAt;
            this.gamification.rewards.history.unshift({
                type: 'quest-complete',
                questId: quest.id,
                title: quest.title,
                timestamp: quest.completedAt
            });
            this.gamification.rewards.history = this.gamification.rewards.history.slice(0, Math.max(1, parseInt(config.rewards?.historyLimit) || 10));
            this.api.emit('weather:gamification-quest', {
                reason: 'completed',
                quest: { ...quest }
            });

            if (config.quests?.rotateOnCompletion !== false) {
                if (this.questRotationTimer) {
                    clearTimeout(this.questRotationTimer);
                }
                this.questRotationTimer = setTimeout(() => {
                    this.questRotationTimer = null;
                    if (this.config?.enabled && this.config?.gamification?.enabled !== false) {
                        this.createNextQuest();
                    }
                }, 0);
            }
            this.scheduleGamificationPersist();
            this.broadcastGamificationState('quest-completed', { quest: { ...quest } });
        } else {
            this.broadcastGamificationState('quest-progress', { quest: { ...quest } });
        }

        return quest;
    }

    resolveRewardThreshold(snapshot = null) {
        const config = this.config?.gamification || this.getDefaultGamificationConfig();
        if (!config.enabled || config.rewards?.enabled === false) {
            return [];
        }

        const meter = snapshot?.meter ?? this.gamification.communityMeter.current;
        const thresholds = Array.isArray(config.rewards?.thresholds) ? config.rewards.thresholds.slice() : [];
        const now = Date.now();
        const rewardsTriggered = [];
        let meterAfterRewards = meter;

        for (const threshold of thresholds) {
            const lastReward = this.gamification.rewards.history.find((entry) => entry.threshold === threshold.meter && entry.type === 'reward');
            const cooldownMs = Math.max(0, parseInt(config.rewards?.cooldownMs) || 0);
            const onCooldown = lastReward && cooldownMs > 0 && (now - lastReward.timestamp) < cooldownMs;
            const alreadyFired = Array.isArray(this.gamification.rewards.firedThresholds)
                && this.gamification.rewards.firedThresholds.includes(threshold.meter);
            if (meter >= threshold.meter && !onCooldown && !alreadyFired) {
                const rewardEvent = this.createWeatherEvent({
                    action: threshold.action,
                    intensity: threshold.intensity,
                    duration: threshold.duration,
                    permanent: false,
                    username: 'community-meter',
                    meta: {
                        triggeredBy: 'gamification-reward',
                        label: threshold.label,
                        threshold: threshold.meter
                    },
                    options: {
                        rewardLabel: threshold.label
                    }
                });

                this.api.emit('weather:trigger', rewardEvent);
                rewardsTriggered.push({
                    threshold: threshold.meter,
                    action: threshold.action,
                    event: rewardEvent
                });

                this.gamification.communityMeter.lastRewardAt = now;
                this.gamification.rewards.history.unshift({
                    type: 'reward',
                    threshold: threshold.meter,
                    action: threshold.action,
                    timestamp: now
                });
                this.gamification.rewards.history = this.gamification.rewards.history.slice(0, Math.max(1, parseInt(config.rewards?.historyLimit) || 10));
                this.gamification.rewards.firedThresholds = Array.from(new Set([
                    ...(this.gamification.rewards.firedThresholds || []),
                    threshold.meter
                ]));

                if (config.rewards?.carryOver === false) {
                    meterAfterRewards = 0;
                }
            }
        }

        if (rewardsTriggered.length > 0) {
            this.gamification.communityMeter.current = Math.max(0, Math.min(
                Math.max(1, parseInt(config.communityMeter?.max) || 100),
                meterAfterRewards
            ));
            this.scheduleGamificationPersist();
            this.broadcastGamificationState('reward-triggered', {
                rewardsTriggered
            });
        }

        return rewardsTriggered;
    }

    applyGamificationEvent(eventType, payload = {}) {
        const config = this.config?.gamification || this.getDefaultGamificationConfig();
        if (!this.config?.enabled || !config.enabled) {
            return null;
        }

        const contribution = this.getGamificationContributionWeight(eventType, payload);
        const normalizedType = contribution.normalizedType;
        const now = Date.now();

        if (config.streaks?.enabled !== false) {
            const windowMs = Math.max(1000, parseInt(config.streaks?.windowMs) || 60000);
            const lastEventAt = this.gamification.streaks.lastEventAt || 0;
            if (lastEventAt && (now - lastEventAt) > windowMs) {
                this.gamification.streaks.current = 0;
                this.gamification.streaks.lastContributor = null;
            }
            this.gamification.streaks.current += 1;
            this.gamification.streaks.best = Math.max(this.gamification.streaks.best, this.gamification.streaks.current);
            this.gamification.streaks.lastEventAt = now;
            this.gamification.streaks.lastContributor = String(payload.username || payload.nickname || payload.userName || 'anonymous');
        }

        if (config.communityMeter?.enabled !== false) {
            const boost = this.gamification.streaks.current >= Math.max(1, parseInt(config.streaks?.bonusThreshold) || 5)
                ? Math.max(1, parseFloat(config.streaks?.bonusMultiplier) || 1)
                : 1;
            const meterDelta = Math.max(0, Math.round(contribution.total * boost));
            const meterMax = Math.max(1, parseInt(config.communityMeter?.max) || 100);
            this.gamification.communityMeter.current = Math.min(
                meterMax,
                this.gamification.communityMeter.current + meterDelta
            );
            this.gamification.communityMeter.total += meterDelta;
            this.gamification.communityMeter.lastUpdatedAt = now;
        }

        const quest = this.advanceQuestProgress(normalizedType, payload, contribution);
        const rewardsTriggered = this.resolveRewardThreshold({
            meter: this.gamification.communityMeter.current
        });

        this.scheduleGamificationPersist();
        this.broadcastGamificationState('event-applied', {
            eventType,
            normalizedType,
            contribution,
            quest,
            rewardsTriggered
        });

        return {
            eventType,
            normalizedType,
            contribution,
            quest,
            rewardsTriggered,
            snapshot: this.getGamificationSnapshot()
        };
    }

    /**
     * Sanitize meta object to prevent XSS
     */
    sanitizeMeta(meta) {
        if (!meta || typeof meta !== 'object') {
            return {};
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(meta)) {
            if (typeof value === 'string') {
                // Basic sanitization - remove HTML tags
                sanitized[key] = value.replace(/<[^>]*>/g, '').substring(0, 200);
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    /**
     * Cleanup on plugin unload
     */
    async destroy() {
        this.api.log('🌦️ [WEATHER CONTROL] Destroying Weather Control Plugin...', 'info');
        
        // Unregister GCCE commands
        try {
            const gcce = this.getGCCEInstance();
            if (gcce) {
                gcce.unregisterCommandsForPlugin('weather-control');
                this.api.log('💬 [WEATHER CONTROL] Unregistered GCCE commands', 'debug');
            }
        } catch (error) {
            this.api.log(`❌ [WEATHER CONTROL] Error unregistering GCCE commands: ${error.message}`, 'error');
        }
        
        // Clear rate limit cache
        this.userRateLimit.clear();

        this.sequenceTimers.forEach(timer => clearTimeout(timer));
        this.sequenceTimers.clear();
        if (this.questRotationTimer) {
            clearTimeout(this.questRotationTimer);
            this.questRotationTimer = null;
        }

        if (this.gamificationPersistTimer) {
            clearTimeout(this.gamificationPersistTimer);
            this.gamificationPersistTimer = null;
        }

        try {
            await this.persistGamificationState(true);
        } catch (error) {
            this.api.log(`❌ [WEATHER CONTROL] Error persisting gamification state during shutdown: ${error.message}`, 'error');
        }

        const io = this.api.getSocketIO ? this.api.getSocketIO() : null;
        if (io && this.socketConnectionHandler) {
            io.off('connection', this.socketConnectionHandler);
        }
        this.socketConnectionHandler = null;

        this.socketHandlers.forEach((handlers, socket) => {
            socket.off('weather:client-ready', handlers.clientReady);
            socket.off('weather:request-permanent-effects', handlers.requestPermanentEffects);
            socket.off('weather:overlay-state', handlers.overlayState);
            socket.off('weather:request-gamification-state', handlers.requestGamificationState);
            socket.off('disconnect', handlers.disconnect);
        });
        this.socketHandlers.clear();
        this.socketSyncRegistered = false;
        
        this.api.log('✅ [WEATHER CONTROL] Weather Control Plugin destroyed', 'info');
    }
}

module.exports = WeatherControlPlugin;
