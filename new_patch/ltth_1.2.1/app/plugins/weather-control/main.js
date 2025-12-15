const path = require('path');

/**
 * Weather Control Plugin
 *
 * Professional weather effects system for TikTok Live overlays
 * Supports: rain, snow, storm, fog, thunder, sunbeam, glitchclouds
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
        this.supportedEffects = [
            'rain',
            'snow', 
            'storm',
            'fog',
            'thunder',
            'sunbeam',
            'glitchclouds'
        ];
        
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
                    rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false },
                    snow: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false },
                    storm: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false },
                    fog: { enabled: true, defaultIntensity: 0.4, defaultDuration: 15000, permanent: false },
                    thunder: { enabled: true, defaultIntensity: 0.8, defaultDuration: 5000, permanent: false },
                    sunbeam: { enabled: true, defaultIntensity: 0.6, defaultDuration: 12000, permanent: false },
                    glitchclouds: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false }
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
            this.config.effects = this.supportedEffects.reduce((acc, effectName) => {
                acc[effectName] = {
                    ...defaultConfig.effects[effectName],
                    ...(this.config.effects?.[effectName] || {})
                };
                return acc;
            }, {});

            // Store API key
            this.apiKey = this.config.apiKey;
            this.rateLimitMax = this.config.rateLimitPerMinute || 10;

            // Save updated config
            await this.api.setConfig('weather_config', this.config);

            this.api.log('📝 [WEATHER CONTROL] Configuration loaded', 'debug');
        } catch (error) {
            this.api.log(`❌ [WEATHER CONTROL] Error loading config: ${error.message}`, 'error');
            throw error;
        }
    }

    generateApiKey() {
        // Generate a random API key
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let key = 'weather_';
        for (let i = 0; i < 32; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return key;
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
                const safeConfig = { ...this.config };
                if (!this.config.useGlobalAuth) {
                    safeConfig.apiKey = '***hidden***';
                }
                res.json({ success: true, config: safeConfig });
            } catch (error) {
                this.api.log(`❌ [WEATHER CONTROL] Error getting config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update configuration
        this.api.registerRoute('post', '/api/weather/config', async (req, res) => {
            try {
                const newConfig = req.body;
                
                // Track if command names changed
                let commandNamesChanged = false;
                
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
                            mergedEffects[effect].defaultIntensity = this.validateIntensity(
                                effectConfig.defaultIntensity ?? mergedEffects[effect].defaultIntensity,
                                effect
                            );
                            mergedEffects[effect].defaultDuration = this.validateDuration(
                                effectConfig.defaultDuration ?? mergedEffects[effect].defaultDuration,
                                effect,
                                effectConfig.permanent === true
                            );
                            mergedEffects[effect].permanent = effectConfig.permanent === true;
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
                    this.config.enabled = newConfig.enabled;
                }
                if (typeof newConfig.rateLimitPerMinute !== 'undefined') {
                    this.config.rateLimitPerMinute = Math.max(1, Math.min(100, newConfig.rateLimitPerMinute));
                    this.rateLimitMax = this.config.rateLimitPerMinute;
                }

                await this.api.setConfig('weather_config', this.config);

                // Sync permanent effects with new configuration
                this.syncPermanentEffects();
                
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
        this.api.registerRoute('post', '/api/weather/trigger', async (req, res) => {
            try {
                // Authentication check
                if (!this.config.useGlobalAuth) {
                    const providedKey = req.headers['x-weather-key'];
                    if (providedKey !== this.apiKey) {
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

                // Sanitize and validate intensity
                const validIntensity = this.validateIntensity(intensity, action);
                
                // Sanitize and validate duration
                const validDuration = this.validateDuration(duration, action, isPermanent);

                // Create weather event
                const weatherEvent = {
                    type: 'weather',
                    action,
                    intensity: validIntensity,
                    duration: validDuration,
                    permanent: isPermanent,
                    username: username || 'anonymous',
                    meta: this.sanitizeMeta(meta),
                    timestamp: Date.now()
                };

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

        // Get supported effects
        this.api.registerRoute('get', '/api/weather/effects', (req, res) => {
            res.json({
                success: true,
                effects: this.supportedEffects,
                config: this.config.effects
            });
        });

        // Reset API key
        this.api.registerRoute('post', '/api/weather/reset-key', async (req, res) => {
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
        this.api.registerRoute('post', '/api/weather/gift-mappings', (req, res) => {
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
        this.api.registerRoute('delete', '/api/weather/gift-mappings/:giftId', (req, res) => {
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
    }

    registerFlowActions() {
        // Register flow action for weather trigger
        this.api.registerFlowAction('weather.trigger', async (params) => {
            try {
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

            io.on('connection', (socket) => {
                try {
                    this.api.log('🔄 [WEATHER CONTROL] Syncing permanent effects for new overlay client', 'debug');
                    this.syncPermanentEffects(socket);
                } catch (error) {
                    this.api.log(`❌ [WEATHER CONTROL] Error syncing permanent effects: ${error.message}`, 'error');
                }
            });

            this.socketSyncRegistered = true;
        } catch (error) {
            this.api.log(`❌ [WEATHER CONTROL] Error registering socket sync: ${error.message}`, 'error');
        }
    }

        syncPermanentEffects(targetSocket = null) {
            const desiredEffects = new Set(
                this.supportedEffects.filter(effect => 
                    this.config.effects[effect]?.permanent === true && this.config.effects[effect]?.enabled !== false
                )
        );

        // When called for a specific socket, only start desired effects for that client
        if (targetSocket) {
            desiredEffects.forEach(effect => this.emitPermanentEffect(effect, targetSocket));
            return;
        }

        // Stop effects that are no longer permanent
        this.activePermanentEffects.forEach((effect) => {
            if (!desiredEffects.has(effect)) {
                this.api.emit('weather:stop-effect', { action: effect, meta: { triggeredBy: 'permanent-toggle' } });
                this.api.log(`🛑 [WEATHER CONTROL] Stopped permanent effect: ${effect}`, 'info');
            }
        });

        // Start new permanent effects
        desiredEffects.forEach((effect) => {
            if (!this.activePermanentEffects.has(effect)) {
                this.emitPermanentEffect(effect);
                this.api.log(`♾️ [WEATHER CONTROL] Activated permanent effect: ${effect}`, 'info');
            }
        });

        this.activePermanentEffects = desiredEffects;
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
                    syntax: `/${cmdNames.weatherstop}`,
                    permission: 'subscriber', // Only subscribers and above can stop
                    enabled: true,
                    minArgs: 0,
                    maxArgs: 0,
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
        
        this.api.log('✅ [WEATHER CONTROL] Weather Control Plugin destroyed', 'info');
    }
}

module.exports = WeatherControlPlugin;
