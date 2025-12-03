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
        
        // API Key for external access (stored in config)
        this.apiKey = null;
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
                    rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000 },
                    snow: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000 },
                    storm: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000 },
                    fog: { enabled: true, defaultIntensity: 0.4, defaultDuration: 15000 },
                    thunder: { enabled: true, defaultIntensity: 0.8, defaultDuration: 5000 },
                    sunbeam: { enabled: true, defaultIntensity: 0.6, defaultDuration: 12000 },
                    glitchclouds: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000 }
                }
            };

            this.config = config || defaultConfig;
            
            // Ensure all default fields exist
            this.config = { ...defaultConfig, ...this.config };
            this.config.permissions = { ...defaultConfig.permissions, ...this.config.permissions };
            this.config.effects = { ...defaultConfig.effects, ...this.config.effects };

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
                
                // Validate configuration
                if (newConfig.permissions) {
                    this.config.permissions = { ...this.config.permissions, ...newConfig.permissions };
                }
                if (newConfig.effects) {
                    this.config.effects = { ...this.config.effects, ...newConfig.effects };
                }
                if (typeof newConfig.enabled !== 'undefined') {
                    this.config.enabled = newConfig.enabled;
                }
                if (typeof newConfig.rateLimitPerMinute !== 'undefined') {
                    this.config.rateLimitPerMinute = Math.max(1, Math.min(100, newConfig.rateLimitPerMinute));
                    this.rateLimitMax = this.config.rateLimitPerMinute;
                }

                await this.api.setConfig('weather_config', this.config);
                
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
                const { action, intensity, duration, username, meta } = req.body;

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

                // Sanitize and validate intensity (0-1)
                const validIntensity = Math.max(0, Math.min(1, parseFloat(intensity) || this.config.effects[action].defaultIntensity));
                
                // Sanitize and validate duration (1000-60000ms)
                const validDuration = Math.max(1000, Math.min(60000, parseInt(duration) || this.config.effects[action].defaultDuration));

                // Create weather event
                const weatherEvent = {
                    type: 'weather',
                    action,
                    intensity: validIntensity,
                    duration: validDuration,
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
    }

    registerTikTokEventHandlers() {
        // Gift event handler - trigger weather based on gift value
        this.api.registerTikTokEvent('gift', async (data) => {
            try {
                if (!this.config.enabled) return;

                const { username, giftName, coins } = data;

                // Simple gift-to-weather mapping (can be configured later)
                let weatherAction = null;
                
                if (coins >= 5000) {
                    weatherAction = 'storm';
                } else if (coins >= 1000) {
                    weatherAction = 'thunder';
                } else if (coins >= 500) {
                    weatherAction = 'rain';
                } else if (coins >= 100) {
                    weatherAction = 'snow';
                }

                if (weatherAction && this.config.effects[weatherAction]?.enabled) {
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
                        intensity: this.config.effects[weatherAction].defaultIntensity,
                        duration: this.config.effects[weatherAction].defaultDuration,
                        username,
                        meta: { triggeredBy: 'gift', giftName, coins },
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
                const { action, intensity, duration, meta } = params;

                if (!action || !this.supportedEffects.includes(action)) {
                    return { success: false, error: `Invalid action: ${action}` };
                }

                if (!this.config.effects[action]?.enabled) {
                    return { success: false, error: `Effect "${action}" is disabled` };
                }

                const validIntensity = Math.max(0, Math.min(1, parseFloat(intensity) || this.config.effects[action].defaultIntensity));
                const validDuration = Math.max(1000, Math.min(60000, parseInt(duration) || this.config.effects[action].defaultDuration));

                const weatherEvent = {
                    type: 'weather',
                    action,
                    intensity: validIntensity,
                    duration: validDuration,
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

    /**
     * Check if user has permission to trigger weather effects
     */
    async checkUserPermission(username) {
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

            // Get user data from database
            const db = this.api.getDatabase();
            const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

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
        
        // Clear rate limit cache
        this.userRateLimit.clear();
        
        this.api.log('✅ [WEATHER CONTROL] Weather Control Plugin destroyed', 'info');
    }
}

module.exports = WeatherControlPlugin;
