/**
 * Fireworks Superplugin - Main Entry Point
 * 
 * GPU-accelerated fireworks effects with gift-specific displays, combo systems,
 * and interactive triggers. Features WebGL/WebGPU rendering with Canvas fallback.
 * 
 * Features:
 * - Gift-triggered fireworks with GiftCatalogue integration
 * - Combo streak system (consecutive gifts trigger bigger effects)
 * - Gift escalation system (Small → Big → Massive)
 * - GPU particle engine (WebGL with Canvas fallback)
 * - Custom explosion shapes (Heart, Star, Spiral, etc.)
 * - Gift-based particles using gift images
 * - Audio effects for rockets/explosions
 * - Goal-triggered finale shows
 * - Interactive triggers (click, chat, emoji)
 * - Random firework generator
 * - Full API for other plugins
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');

class FireworksPlugin {
    constructor(api) {
        this.api = api;
        // Use persistent storage in user profile directory (survives updates)
        const pluginDataDir = api.getPluginDataDir();
        this.uploadDir = path.join(pluginDataDir, 'uploads');
        this.upload = null;
        
        // Plugin state
        this.config = null;
        this.comboState = new Map(); // Track combo streaks per user
        this.lastGiftTime = new Map(); // Track last gift time per user for combo
        this.giftCatalogCache = new Map(); // Cache gift info for performance
        
        // Queue state
        this.queueTimestamps = []; // Track timestamps of recent triggers for rate limiting
        
        // Benchmark state
        this.currentFps = 0;
        this.benchmarkPreset = null;
        this.connectedSockets = new Set();
        
        // Combo timeout (ms) - reset combo if no gift within this time
        this.COMBO_TIMEOUT = 10000;

        // Server-side active firework tracking (browser global not available server-side)
        this.activeFireworkCount = 0;
        this.activeFireworkTimers = new Map();
    }

    async init() {
        this.api.log('🎆 [FIREWORKS] Initializing Fireworks Superplugin...', 'info');

        // Ensure plugin data directory exists
        this.api.ensurePluginDataDir();

        // Migrate old uploads if they exist
        await this.migrateOldData();

        // Create upload directory for custom audio/video
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
            this.api.log('📁 [FIREWORKS] Upload directory created', 'debug');
        }

        this.api.log(`📂 [FIREWORKS] Using persistent storage: ${this.uploadDir}`, 'info');

        // Setup multer for file uploads
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.uploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname);
                cb(null, 'firework-' + uniqueSuffix + ext);
            }
        });

        this.upload = multer({
            storage: storage,
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
            fileFilter: (req, file, cb) => {
                const allowedTypes = /mp3|wav|ogg|webm|mp4|gif|png|jpg|jpeg/;
                const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
                if (extname) {
                    return cb(null, true);
                }
                cb(new Error('Only audio (mp3, wav, ogg) and video (webm, mp4, gif) files are allowed!'));
            }
        });

        // Load default configuration
        this.loadConfig();

        // Start random firework timer if enabled
        if (this.config.randomEnabled) {
            this.startRandomTimer();
        }

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers
        this.registerTikTokEventHandlers();

        // Register flow actions
        this.registerFlowActions();

        // Cache gift catalog
        await this.cacheGiftCatalog();

        // Register socket event handlers for benchmark
        this.registerSocketHandlers();

        this.api.log('✅ [FIREWORKS] Fireworks Superplugin initialized successfully', 'info');
        this.logRoutes();
    }

    /**
     * Register socket event handlers
     */
    registerSocketHandlers() {
        const io = this.api.getSocketIO();
        
        // Initialize socket tracking
        if (!this.connectedSockets) {
            this.connectedSockets = new Set();
        }
        
        // Store reference to bound handler to avoid duplicates
        if (!this.fpsUpdateHandler) {
            this.fpsUpdateHandler = (socket) => {
                // Track this socket connection
                this.connectedSockets.add(socket);
                
                // Send current config to newly connected overlay
                socket.emit('fireworks:config-update', { config: this.config });
                
                // Listen for FPS updates
                socket.on('fireworks:fps-update', (data) => {
                    if (data && data.fps !== undefined) {
                        this.currentFps = data.fps;
                    }
                });
                
                // Listen for active firework count responses
                socket.on('fireworks:active-count-response', (data) => {
                    if (data && data.count !== undefined) {
                        this.cachedActiveFireworkCount = data.count;
                    }
                });
                
                // Clean up on disconnect
                socket.on('disconnect', () => {
                    this.connectedSockets.delete(socket);
                });
            };
            
            // Listen for new connections
            io.on('connection', this.fpsUpdateHandler);
        }
    }

    /**
     * Migrate old data from app directory to user profile directory
     */
    async migrateOldData() {
        const oldUploadDir = path.join(__dirname, 'uploads');
        
        if (fs.existsSync(oldUploadDir)) {
            const oldFiles = fs.readdirSync(oldUploadDir).filter(f => f !== '.gitkeep');
            if (oldFiles.length > 0) {
                this.api.log(`📦 [FIREWORKS] Migrating ${oldFiles.length} files from old upload directory...`, 'info');
                
                // Ensure new directory exists
                if (!fs.existsSync(this.uploadDir)) {
                    fs.mkdirSync(this.uploadDir, { recursive: true });
                }
                
                // Copy files
                for (const file of oldFiles) {
                    const oldPath = path.join(oldUploadDir, file);
                    const newPath = path.join(this.uploadDir, file);
                    if (!fs.existsSync(newPath)) {
                        fs.copyFileSync(oldPath, newPath);
                    }
                }
                
                this.api.log(`✅ [FIREWORKS] Migrated uploads to: ${this.uploadDir}`, 'info');
                this.api.log('💡 [FIREWORKS] Old files are kept for safety. You can manually delete them after verifying the migration.', 'info');
            }
        }
    }

    /**
     * Load plugin configuration from database or defaults
     */
    loadConfig() {
        const savedConfig = this.api.getConfig('settings');
        
        this.config = savedConfig || {
            // Global settings
            enabled: true,
            maxParticles: 1000,
            targetFps: 60,
            
            // Gift triggering
            giftTriggersEnabled: true,
            minGiftCoins: 1, // Minimum coin value to trigger fireworks
            
            // Combo system
            comboEnabled: true,
            comboTimeout: 10000, // ms
            comboMultiplierBase: 1.2,
            comboMaxMultiplier: 5.0,
            
            // Escalation system
            escalationEnabled: true,
            escalationThresholds: {
                small: 0,      // 0-99 coins
                medium: 100,   // 100-499 coins
                big: 500,      // 500-999 coins
                massive: 1000  // 1000+ coins
            },
            
            // Particle effects
            particleCount: {
                small: 30,
                medium: 60,
                big: 100,
                massive: 200
            },
            
            // Explosion shapes
            shapesEnabled: true,
            defaultShape: 'burst', // burst, heart, star, spiral, ring, custom
            randomShapeEnabled: false, // Enable random shape selection from active shapes
            activeShapes: ['burst'], // Array of active shapes for random selection
            giftShapeMappings: {}, // giftId -> shape
            
            // User avatar integration
            userAvatarEnabled: false, // Use user avatars as particles
            avatarParticleChance: 0.3, // Probability to use avatar vs. gift image (0-1)
            
            // Audio
            audioEnabled: true,
            rocketSound: '/assets/audio/sound1.mp3', // Using demo folder audio
            explosionSound: '/assets/audio/sound2.mp3', // Using demo folder audio
            audioVolume: 0.7,
            
            // Colors
            colorMode: 'gift', // 'gift', 'random', 'theme', 'rainbow'
            themeColors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
            
            // Goal finale
            goalFinaleEnabled: true,
            goalFinaleIntensity: 3.0,
            goalFinaleDuration: 5000, // ms
            
            // Follower fireworks
            followerFireworksEnabled: false, // Enable fireworks for new followers
            followerRocketCount: 3, // Number of rockets per follower (1-10)
            followerShowAnimation: true, // Show thank you animation
            followerShowProfilePicture: true, // Show follower's profile picture
            followerAnimationDuration: 3000, // Duration of thank you animation in ms
            followerAnimationDelay: 3000, // Delay before showing animation (ms)
            followerAnimationPosition: 'center', // 'top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'
            followerAnimationSize: 'medium', // 'small', 'medium', 'large', 'custom'
            followerAnimationScale: 1.0, // Custom scale factor (0.5 - 2.0) when size is 'custom'
            followerAnimationStyle: 'gradient-purple', // 'gradient-purple', 'gradient-blue', 'gradient-gold', 'gradient-rainbow', 'neon', 'minimal'
            followerAnimationEntrance: 'scale', // 'scale', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'bounce', 'rotate'
            followerThankYouText: 'Thanks for the follow! 💙', // Thank you text shown in follower animation
            
            // Interactive triggers
            interactiveEnabled: false,
            clickTriggerEnabled: false,
            chatTriggerEnabled: false,
            chatTriggerKeywords: ['🎆', 'fireworks', 'boom'],
            
            // Random generator
            randomEnabled: false,
            randomInterval: 30000, // ms
            randomMinIntensity: 0.5,
            randomMaxIntensity: 1.5,
            
            // Performance
            gpuAcceleration: true,
            preserveDrawingBuffer: true, // Preserve drawing buffer for OBS capture (disable for better GPU performance in browser preview)
            desynchronized: true, // Enable desynchronized rendering for better GPU performance (safe for OBS Browser Source)
            particleSizeRange: [4, 12],
            resolution: 1.0, // Legacy - kept for backward compatibility
            resolutionPreset: '1080p', // Resolution preset: 360p, 540p, 720p, 1080p, 1440p, 4k
            orientation: 'landscape', // 'landscape' or 'portrait'
            adaptiveRenderScaleEnabled: true, // Keep OBS source size stable while scaling internal render resolution
            minRenderScale: 0.75,
            targetFps: 60,
            minFps: 24, // User can configure down to 24 FPS
            despawnFadeDuration: 1.5, // Duration for despawn fade effect in seconds
            
            // Gift popup
            giftPopupEnabled: true, // Show gift animation text
            giftPopupPosition: 'bottom', // 'top', 'middle', 'bottom', 'none'
            
            // Queue system - Lag prevention through rate limiting
            queueEnabled: false, // Enable queue system to limit fireworks per second
            maxRocketsPerSecond: 5, // Maximum number of fireworks per second (1-20)
            
            // Performance Limits (NEW) - Protect against freezes
            maxConcurrentFireworks: 5, // Maximum gleichzeitige Fireworks (1-20)
            maxTotalParticles: 800, // Maximum Partikel global (200-2000)
            emergencyCleanupThreshold: 1000, // Emergency Cleanup bei X Partikeln (500-3000)
            adaptivePerformance: true, // Aktiviere Adaptive Performance
            minTargetFps: 30, // Minimum FPS bevor Frame Skip (20-50)
            frameSkipEnabled: true, // Aktiviere Frame Skip bei Low FPS
            
            // Advanced
            gravity: 0.1,
            friction: 0.98,
            windEnabled: false,
            windStrength: 0.02
        };
        
        this.COMBO_TIMEOUT = this.config.comboTimeout;
    }

    /**
     * Save plugin configuration to database
     */
    saveConfig() {
        this.api.setConfig('settings', this.config);
    }

    /**
     * Cache gift catalog for faster lookups
     */
    async cacheGiftCatalog() {
        try {
            const db = this.api.getDatabase();
            const gifts = db.getGiftCatalog();
            this.giftCatalogCache.clear();
            for (const gift of gifts) {
                this.giftCatalogCache.set(gift.id, gift);
            }
            this.api.log(`📦 [FIREWORKS] Cached ${gifts.length} gifts from catalog`, 'debug');
        } catch (error) {
            this.api.log(`⚠️ [FIREWORKS] Failed to cache gift catalog: ${error.message}`, 'warn');
        }
    }

    /**
     * Get gift info from cache or database
     */
    getGiftInfo(giftId) {
        if (this.giftCatalogCache.has(giftId)) {
            return this.giftCatalogCache.get(giftId);
        }
        
        // Fallback to database lookup
        try {
            const db = this.api.getDatabase();
            const gift = db.getGift(giftId);
            if (gift) {
                this.giftCatalogCache.set(giftId, gift);
            }
            return gift;
        } catch (error) {
            this.api.log(`⚠️ [FIREWORKS] Failed to get gift ${giftId}: ${error.message}`, 'warn');
            return null;
        }
    }

    /**
     * Register all HTTP routes
     */
    registerRoutes() {
        // Serve plugin UI (settings page)
        this.api.registerRoute('get', '/fireworks/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui', 'settings.html');
            res.sendFile(uiPath);
        });

        // Serve overlay
        this.api.registerRoute('get', '/fireworks/overlay', (req, res) => {
            const overlayPath = path.join(__dirname, 'overlay.html');
            res.sendFile(overlayPath);
        });

        // Get configuration
        this.api.registerRoute('get', '/api/fireworks/config', (req, res) => {
            try {
                res.json({ success: true, config: this.config });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error getting config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update configuration
        this.api.registerRoute('post', '/api/fireworks/config', (req, res) => {
            try {
                const updates = req.body;
                this.config = { ...this.config, ...updates };
                this.saveConfig();
                
                // Restart random timer if relevant settings changed
                if (updates.randomEnabled !== undefined || updates.randomInterval !== undefined) {
                    this.stopRandomTimer();
                    if (this.config.randomEnabled) {
                        this.startRandomTimer();
                    }
                }
                
                // Notify overlays about config change
                this.api.emit('fireworks:config-update', { config: this.config });
                
                res.json({ success: true, message: 'Configuration updated' });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error updating config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get status
        this.api.registerRoute('get', '/api/fireworks/status', (req, res) => {
            try {
                res.json({
                    success: true,
                    enabled: this.config.enabled,
                    comboStates: Object.fromEntries(this.comboState),
                    cachedGifts: this.giftCatalogCache.size
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Toggle enabled
        this.api.registerRoute('post', '/api/fireworks/toggle', (req, res) => {
            try {
                const { enabled } = req.body;
                this.config.enabled = enabled !== undefined ? enabled : !this.config.enabled;
                this.saveConfig();
                
                this.api.emit('fireworks:toggle', { enabled: this.config.enabled });
                
                res.json({ success: true, enabled: this.config.enabled });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Trigger fireworks manually
        this.api.registerRoute('post', '/api/fireworks/trigger', (req, res) => {
            try {
                const { type, intensity, shape, colors, position, giftId, duration, userAvatar } = req.body;
                
                this.triggerFirework({
                    type: type || 'burst',
                    intensity: intensity || 1.0,
                    shape: shape || this.config.defaultShape,
                    colors: colors || null,
                    position: position || { x: 0.5, y: 0.7 },
                    giftId: giftId || null,
                    userAvatar: userAvatar || null,
                    duration: duration || 2000,
                    reason: 'manual',
                    bypassEnabled: true  // Allow test triggers even when disabled
                });
                
                res.json({ success: true, message: 'Firework triggered' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Trigger finale
        this.api.registerRoute('post', '/api/fireworks/finale', (req, res) => {
            try {
                const { intensity, duration } = req.body;
                this.triggerFinale(intensity || 3.0, duration || 5000, true); // true = bypass enabled check
                res.json({ success: true, message: 'Finale triggered' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test follower fireworks
        this.api.registerRoute('post', '/api/fireworks/test-follower', (req, res) => {
            try {
                const { username, profilePictureUrl } = req.body;
                this.handleFollowerEvent({
                    uniqueId: username || 'TestFollower',
                    username: username || 'TestFollower',
                    profilePictureUrl: profilePictureUrl || null
                });
                res.json({ success: true, message: 'Follower fireworks triggered' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Trigger random firework
        this.api.registerRoute('post', '/api/fireworks/random', (req, res) => {
            try {
                this.triggerRandomFirework(true); // true = bypass enabled check
                res.json({ success: true, message: 'Random firework triggered' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get gift shape mappings
        this.api.registerRoute('get', '/api/fireworks/gift-mappings', (req, res) => {
            try {
                res.json({
                    success: true,
                    mappings: this.config.giftShapeMappings
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Set gift shape mapping
        this.api.registerRoute('post', '/api/fireworks/gift-mappings', (req, res) => {
            try {
                const { giftId, shape, colors, intensity } = req.body;
                
                if (!giftId) {
                    return res.status(400).json({ success: false, error: 'giftId is required' });
                }
                
                this.config.giftShapeMappings[giftId] = {
                    shape: shape || 'burst',
                    colors: colors || null,
                    intensity: intensity || 1.0
                };
                this.saveConfig();
                
                res.json({ success: true, message: 'Gift mapping updated' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Upload audio/video file
        this.api.registerRoute('post', '/api/fireworks/upload', (req, res) => {
            this.upload.single('file')(req, res, (err) => {
                if (err) {
                    return res.status(500).json({ success: false, error: err.message });
                }
                
                if (!req.file) {
                    return res.status(400).json({ success: false, error: 'No file uploaded' });
                }
                
                const fileUrl = `/plugins/fireworks/uploads/${req.file.filename}`;
                this.api.log(`📤 [FIREWORKS] File uploaded: ${req.file.filename}`, 'info');
                
                res.json({
                    success: true,
                    url: fileUrl,
                    filename: req.file.filename,
                    size: req.file.size
                });
            });
        });

        // List uploaded files
        this.api.registerRoute('get', '/api/fireworks/uploads', (req, res) => {
            try {
                const files = fs.readdirSync(this.uploadDir)
                    .filter(f => f !== '.gitkeep')
                    .map(filename => ({
                        filename,
                        url: `/plugins/fireworks/uploads/${filename}`,
                        size: fs.statSync(path.join(this.uploadDir, filename)).size
                    }));
                
                res.json({ success: true, files });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete uploaded file
        this.api.registerRoute('delete', '/api/fireworks/uploads/:filename', (req, res) => {
            try {
                const sanitizedFilename = path.basename(req.params.filename);
                const filePath = path.join(this.uploadDir, sanitizedFilename);

                // Verify path is within upload directory
                if (!filePath.startsWith(this.uploadDir + path.sep)) {
                    return res.status(403).json({ success: false, error: 'Access denied' });
                }
                
                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ success: false, error: 'File not found' });
                }
                
                fs.unlinkSync(filePath);
                res.json({ success: true, message: 'File deleted' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Serve uploaded files
        const express = require('express');
        this.api.getApp().use('/plugins/fireworks/uploads', express.static(this.uploadDir));

        // Serve audio files
        const audioDir = path.join(__dirname, 'audio');
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir, { recursive: true });
        }
        this.api.getApp().use('/plugins/fireworks/audio', express.static(audioDir));

        // Benchmark API endpoints
        this.api.registerRoute('post', '/api/fireworks/benchmark/set-preset', (req, res) => {
            try {
                const { preset } = req.body;
                if (!preset) {
                    return res.status(400).json({ success: false, error: 'Preset data required' });
                }

                // Temporarily apply preset without saving
                if (!this.benchmarkPreset) {
                    this.benchmarkPreset = { ...this.config };
                }
                Object.assign(this.config, preset);

                // Notify overlay about config change
                this.api.emit('fireworks:config-update', { config: this.config });

                res.json({ success: true, message: 'Preset applied for benchmark' });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error setting benchmark preset: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('get', '/api/fireworks/benchmark/fps', (req, res) => {
            try {
                // FPS is tracked in the overlay's GPU engine
                // We'll use socket.io to request current FPS
                this.api.emit('fireworks:request-fps');

                // Return current FPS if available (stored from overlay)
                res.json({ 
                    success: true, 
                    fps: this.currentFps || 0,
                    timestamp: Date.now()
                });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error getting FPS: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/fireworks/benchmark/restore', (req, res) => {
            try {
                // Restore original config after benchmark
                if (this.benchmarkPreset) {
                    this.config = { ...this.benchmarkPreset };
                    this.benchmarkPreset = null;
                    this.api.emit('fireworks:config-update', { config: this.config });
                }

                res.json({ success: true, message: 'Original config restored' });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error restoring config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Reset configuration to defaults
        this.api.registerRoute('post', '/api/fireworks/config/reset', (req, res) => {
            try {
                this.api.setConfig('settings', null);
                this.loadConfig();
                this.api.emit('fireworks:config-update', { config: this.config });
                // Restart random timer with new config
                this.stopRandomTimer();
                if (this.config.randomEnabled) {
                    this.startRandomTimer();
                }
                res.json({ success: true, message: 'Configuration reset to defaults', config: this.config });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error resetting config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    /**
     * Register TikTok event handlers
     */
    registerTikTokEventHandlers() {
        // Gift event - main trigger
        this.api.registerTikTokEvent('gift', (data) => {
            if (!this.config.enabled || !this.config.giftTriggersEnabled) return;
            
            this.handleGiftEvent(data);
        });

        // Goal reached event - trigger finale
        this.api.registerTikTokEvent('goal_reached', (data) => {
            if (!this.config.enabled || !this.config.goalFinaleEnabled) return;
            
            this.api.log(`🎯 [FIREWORKS] Goal reached! Triggering finale...`, 'info');
            this.triggerFinale(this.config.goalFinaleIntensity, this.config.goalFinaleDuration);
        });

        // Follow event - new follower celebration
        this.api.registerTikTokEvent('follow', (data) => {
            this.api.log(`🎯 [FIREWORKS] Follow event received! Enabled: ${this.config.enabled}, FollowerFireworks: ${this.config.followerFireworksEnabled}`, 'info');
            this.api.log(`[FIREWORKS] Follow data:`, 'debug', data);
            
            if (!this.config.enabled || !this.config.followerFireworksEnabled) {
                this.api.log(`[FIREWORKS] Skipping follower fireworks (enabled: ${this.config.enabled}, followerEnabled: ${this.config.followerFireworksEnabled})`, 'debug');
                return;
            }
            
            this.handleFollowerEvent(data);
        });

        // Chat event - interactive trigger
        this.api.registerTikTokEvent('chat', (data) => {
            if (!this.config.enabled || !this.config.interactiveEnabled || !this.config.chatTriggerEnabled) return;
            
            this.handleChatTrigger(data);
        });

        this.api.log('✅ [FIREWORKS] TikTok event handlers registered', 'info');
    }

    /**
     * Handle gift event - core fireworks trigger logic
     */
    handleGiftEvent(data) {
        const coins = data.coins || data.diamondCount || 0;
        const giftId = data.giftId || data.gift_id;
        const userId = data.userId || data.uniqueId;
        const username = data.uniqueId || data.username || 'Unknown';
        const repeatCount = data.repeatCount || data.combo || 1;
        const giftPictureUrl = data.giftPictureUrl || null;

        // Check minimum coins threshold
        if (coins < this.config.minGiftCoins) {
            return;
        }

        // Check concurrent firework limit
        const activeFireworks = this.getActiveFireworkCount();
        if (activeFireworks >= this.config.maxConcurrentFireworks) {
            this.api.log(`[FIREWORKS] Limit erreicht (${activeFireworks}/${this.config.maxConcurrentFireworks}), Gift übersprungen`, 'warn');
            return;
        }

        // Bei hoher Last: Nur große Gifts zulassen
        if (activeFireworks >= Math.floor(this.config.maxConcurrentFireworks * 0.6) && coins < 500) {
            this.api.log(`[FIREWORKS] Hohe Last (${activeFireworks}), kleines Gift (${coins} coins) übersprungen`, 'debug');
            return;
        }

        // Calculate effective coins (with repeat/combo count)
        const effectiveCoins = coins * repeatCount;

        // Get escalation tier
        const tier = this.getEscalationTier(effectiveCoins);

        // Get combo multiplier
        const comboMultiplier = this.updateComboState(userId, username);

        // Get gift-specific settings
        const giftSettings = this.config.giftShapeMappings[giftId] || {};
        const giftInfo = this.getGiftInfo(giftId);

        // Determine shape - support random selection from active shapes
        let shape = giftSettings.shape || this.config.defaultShape;
        if (this.config.randomShapeEnabled && this.config.activeShapes && this.config.activeShapes.length > 0) {
            shape = this.config.activeShapes[Math.floor(Math.random() * this.config.activeShapes.length)];
        }
        
        // Determine colors
        let colors = giftSettings.colors || null;
        if (!colors && this.config.colorMode === 'random') {
            colors = this.generateRandomColors(3);
        } else if (!colors && this.config.colorMode === 'theme') {
            colors = this.config.themeColors;
        } else if (!colors && this.config.colorMode === 'rainbow') {
            colors = this.generateRainbowColors(5);
        }

        // User avatar integration
        // When enabled, pass user avatar to engine which will mix it with gift images
        const userProfilePictureUrl = data.profilePictureUrl || data.userProfilePictureUrl || null;
        let avatarImage = null;
        if (this.config.userAvatarEnabled && userProfilePictureUrl) {
            // Always pass avatar if enabled and available
            // The engine will decide the actual particle mix ratio
            avatarImage = userProfilePictureUrl;
        }

        // Calculate final intensity
        const baseIntensity = giftSettings.intensity || 1.0;
        const tierMultiplier = this.getTierMultiplier(tier);
        const finalIntensity = baseIntensity * tierMultiplier * comboMultiplier;

        // Calculate particle count
        const baseParticles = this.config.particleCount[tier] || 50;
        const particleCount = Math.round(baseParticles * finalIntensity);

        // Random position in upper portion of screen
        const position = {
            x: 0.2 + Math.random() * 0.6, // 20%-80% from left
            y: 0.3 + Math.random() * 0.4  // 30%-70% from top
        };

        this.api.log(
            `🎆 [FIREWORKS] Gift from ${username}: ${coins} coins (x${repeatCount}), ` +
            `Tier: ${tier}, Combo: x${comboMultiplier.toFixed(1)}, ` +
            `Intensity: ${finalIntensity.toFixed(2)}`,
            'debug'
        );

        // Trigger the firework
        this.triggerFirework({
            type: 'gift',
            intensity: finalIntensity,
            shape: shape,
            colors: colors,
            position: position,
            giftId: giftId,
            giftImage: giftPictureUrl || (giftInfo ? giftInfo.image_url : null),
            userAvatar: avatarImage,
            particleCount: particleCount,
            tier: tier,
            username: username,
            coins: effectiveCoins,
            combo: this.comboState.get(userId) || 1,
            reason: 'gift'
        });
    }

    /**
     * Get escalation tier based on coin value
     */
    getEscalationTier(coins) {
        if (!this.config.escalationEnabled) return 'medium';
        
        const thresholds = this.config.escalationThresholds;
        
        if (coins >= thresholds.massive) return 'massive';
        if (coins >= thresholds.big) return 'big';
        if (coins >= thresholds.medium) return 'medium';
        return 'small';
    }

    /**
     * Get tier multiplier for intensity calculation
     */
    getTierMultiplier(tier) {
        const multipliers = {
            small: 0.5,
            medium: 1.0,
            big: 1.5,
            massive: 2.5
        };
        return multipliers[tier] || 1.0;
    }

    /**
     * Update combo state for a user and return current multiplier
     */
    updateComboState(userId, username) {
        if (!this.config.comboEnabled) return 1.0;

        const now = Date.now();
        const lastTime = this.lastGiftTime.get(userId) || 0;
        const timeSinceLastGift = now - lastTime;

        // Update last gift time
        this.lastGiftTime.set(userId, now);

        // Check if combo is still active
        if (timeSinceLastGift > this.COMBO_TIMEOUT) {
            // Reset combo
            this.comboState.set(userId, 1);
            return 1.0;
        }

        // Increment combo
        const currentCombo = (this.comboState.get(userId) || 0) + 1;
        this.comboState.set(userId, currentCombo);

        // Calculate multiplier (capped)
        const multiplier = Math.min(
            Math.pow(this.config.comboMultiplierBase, currentCombo - 1),
            this.config.comboMaxMultiplier
        );

        if (currentCombo > 1) {
            this.api.log(`🔥 [FIREWORKS] ${username} combo streak: ${currentCombo}x!`, 'info');
        }

        return multiplier;
    }

    /**
     * Generate random colors
     */
    generateRandomColors(count) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = Math.random() * 360;
            colors.push(`hsl(${hue}, 100%, 60%)`);
        }
        return colors;
    }

    /**
     * Generate evenly distributed rainbow colors
     */
    generateRainbowColors(count) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = (i / count) * 360;
            colors.push(`hsl(${hue}, 100%, 55%)`);
        }
        return colors;
    }

    /**
     * Start the random firework interval timer
     */
    startRandomTimer() {
        this.stopRandomTimer();
        const interval = Math.max(1000, Math.min(3600000, this.config.randomInterval || 30000));
        this.randomTimer = setInterval(() => this.triggerRandomFirework(), interval);
        this.api.log(`⏱️ [FIREWORKS] Random timer started (interval: ${interval}ms)`, 'debug');
    }

    /**
     * Stop the random firework interval timer
     */
    stopRandomTimer() {
        if (this.randomTimer) {
            clearInterval(this.randomTimer);
            this.randomTimer = null;
            this.api.log('⏱️ [FIREWORKS] Random timer stopped', 'debug');
        }
    }

    /**
     * Get active firework count - uses server-side counter (browser global not available server-side)
     */
    getActiveFireworkCount() {
        // Return server-side counter (accurate, no socket roundtrip needed)
        return this.activeFireworkCount;
    }

    /**
     * Handle chat trigger
     */
    handleChatTrigger(data) {
        const message = (data.comment || data.message || '').toLowerCase();
        
        for (const keyword of this.config.chatTriggerKeywords) {
            if (message.includes(keyword.toLowerCase())) {
                this.triggerFirework({
                    type: 'chat',
                    intensity: 0.5,
                    shape: 'burst',
                    colors: this.generateRandomColors(2),
                    position: { x: Math.random(), y: 0.5 + Math.random() * 0.3 },
                    username: data.uniqueId || data.username,
                    reason: 'chat'
                });
                break;
            }
        }
    }

    /**
     * Handle follow event - celebrate new follower with fireworks
     */
    handleFollowerEvent(data) {
        const username = data.uniqueId || data.username || data.nickname || 'Unknown';
        const profilePictureUrl = data.profilePictureUrl || data.userProfilePictureUrl || null;
        
        this.api.log(`👤 [FIREWORKS] New follower: ${username}! Launching ${this.config.followerRocketCount} rockets 🎆`, 'info');
        
        // Show thank you animation if enabled (with delay)
        if (this.config.followerShowAnimation) {
            const animationDelay = this.config.followerAnimationDelay || 3000;
            
            setTimeout(() => {
                this.api.emit('fireworks:follower-animation', {
                    username: username,
                    profilePictureUrl: this.config.followerShowProfilePicture ? profilePictureUrl : null,
                    duration: this.config.followerAnimationDuration || 3000,
                    position: this.config.followerAnimationPosition || 'center',
                    size: this.config.followerAnimationSize || 'medium',
                    scale: this.config.followerAnimationScale || 1.0,
                    style: this.config.followerAnimationStyle || 'gradient-purple',
                    entrance: this.config.followerAnimationEntrance || 'scale',
                    thankYouText: this.config.followerThankYouText || 'Thanks for the follow! 💙'
                });
            }, animationDelay);
        }
        
        // Launch multiple rockets for the follower
        const rocketCount = Math.max(1, Math.min(10, this.config.followerRocketCount || 3));
        const shapes = this.config.activeShapes && this.config.activeShapes.length > 0 
            ? this.config.activeShapes 
            : ['heart', 'star', 'burst'];
        
        // Stagger the rockets slightly for visual effect
        for (let i = 0; i < rocketCount; i++) {
            setTimeout(() => {
                // Random position with slight horizontal spread
                const xPos = 0.3 + (Math.random() * 0.4); // Center area
                const yPos = 0.3 + (Math.random() * 0.3); // Mid to upper area
                
                // Choose a nice shape
                const shape = shapes[Math.floor(Math.random() * shapes.length)];
                
                // Use vibrant colors
                const colors = this.generateRandomColors(3);
                
                this.triggerFirework({
                    type: 'follow',
                    intensity: 1.2, // Slightly more intense than normal
                    shape: shape,
                    colors: colors,
                    position: { x: xPos, y: yPos },
                    particleCount: 80,
                    userAvatar: this.config.followerShowProfilePicture ? profilePictureUrl : null,
                    avatarParticleChance: 0.5, // 50% chance for avatar particles to focus on follower
                    tier: 'medium',
                    username: username,
                    coins: 0,
                    combo: 1,
                    reason: 'follow'
                });
            }, i * 300); // 300ms delay between each rocket
        }
    }

    /**
     * Check if a firework should be allowed based on queue rate limiting
     * @returns {boolean} True if firework should be triggered, false if rate limited
     */
    shouldAllowFirework() {
        // If queue is disabled, allow all fireworks
        if (!this.config.queueEnabled) {
            return true;
        }

        const now = Date.now();
        const timeWindow = 1000; // 1 second window
        const maxPerSecond = Math.max(1, Math.min(20, this.config.maxRocketsPerSecond || 5));

        // Clean up old timestamps outside the time window
        this.queueTimestamps = this.queueTimestamps.filter(timestamp => now - timestamp < timeWindow);

        // Check if we've reached the rate limit
        if (this.queueTimestamps.length >= maxPerSecond) {
            this.api.log(
                `⏸️ [FIREWORKS] Rate limit reached (${this.queueTimestamps.length}/${maxPerSecond} per second). Firework skipped due to rate limit.`,
                'debug'
            );
            return false;
        }

        // Add current timestamp and allow the firework
        this.queueTimestamps.push(now);
        return true;
    }

    /**
     * Core firework trigger - emits to overlay
     */
    triggerFirework(options) {
        // Ensure options object exists
        options = options || {};
        
        // Allow bypass of enabled check for manual triggers (tests, API calls)
        if (!this.config.enabled && !options.bypassEnabled) return;

        // Check queue rate limiting (unless bypass is enabled)
        if (!options.bypassEnabled && !this.shouldAllowFirework()) {
            return;
        }

        const payload = {
            id: Date.now() + Math.random().toString(36).substring(2, 11),
            timestamp: Date.now(),
            type: options.type || 'burst',
            intensity: options.intensity || 1.0,
            shape: options.shape || this.config.defaultShape,
            colors: options.colors || this.config.themeColors,
            position: options.position || { x: 0.5, y: 0.5 },
            particleCount: options.particleCount || 50,
            giftId: options.giftId || null,
            giftImage: options.giftImage || null,
            userAvatar: options.userAvatar || null,
            tier: options.tier || 'medium',
            username: options.username || null,
            coins: options.coins || 0,
            combo: options.combo || 1,
            duration: options.duration || 2000,
            reason: options.reason || 'manual',
            
            // Audio settings
            playSound: this.config.audioEnabled,
            rocketSound: this.config.rocketSound,
            explosionSound: this.config.explosionSound,
            audioVolume: this.config.audioVolume,
            
            // Visual settings
            trailsEnabled: this.config.trailsEnabled,
            trailLength: this.config.trailLength,
            glowEnabled: this.config.glowEnabled,
            particleSizeRange: this.config.particleSizeRange,
            
            // Avatar settings
            avatarParticleChance: this.config.avatarParticleChance || 0.3,
            
            // Performance settings
            targetFps: this.config.targetFps || 60,
            minFps: this.config.minFps || 24,
            despawnFadeDuration: this.config.despawnFadeDuration || 1.5,
            
            // Gift popup settings
            giftPopupEnabled: this.config.giftPopupEnabled !== false,
            giftPopupPosition: this.config.giftPopupPosition || 'bottom'
        };

        // Server-side tracking: increment counter and auto-decrement after estimated lifetime.
        // Base lifetime: 3000ms minimum. Intensity multiplier: +2000ms per intensity unit.
        // Capped at 8000ms to avoid counter staying high for unusually long fireworks.
        this.activeFireworkCount++;
        const fireworkId = payload.id;
        const estimatedLifetime = Math.min(8000, 3000 + (options.intensity || 1) * 2000);
        const timer = setTimeout(() => {
            this.activeFireworkCount = Math.max(0, this.activeFireworkCount - 1);
            this.activeFireworkTimers.delete(fireworkId);
        }, estimatedLifetime);
        this.activeFireworkTimers.set(fireworkId, timer);

        this.api.emit('fireworks:trigger', payload);
        
        this.api.log(
            `🎆 [FIREWORKS] Triggered: ${payload.shape} @ (${payload.position.x.toFixed(2)}, ${payload.position.y.toFixed(2)}) ` +
            `intensity=${payload.intensity.toFixed(2)}`,
            'debug'
        );
    }

    /**
     * Trigger finale show (multiple simultaneous fireworks)
     */
    triggerFinale(intensity = 3.0, duration = 5000, bypassEnabled = false) {
        if (!this.config.enabled && !bypassEnabled) return;

        this.api.log(`🎆 [FIREWORKS] FINALE! Intensity: ${intensity}, Duration: ${duration}ms`, 'info');

        const payload = {
            id: 'finale-' + Date.now(),
            type: 'finale',
            intensity: intensity,
            duration: duration,
            timestamp: Date.now(),
            
            // Finale-specific settings
            burstCount: Math.round(5 * intensity),
            burstInterval: 300,
            shapes: ['burst', 'heart', 'star', 'ring', 'spiral'],
            colors: this.config.themeColors,
            
            // Audio
            playSound: this.config.audioEnabled,
            audioVolume: this.config.audioVolume
        };

        this.api.emit('fireworks:finale', payload);
    }

    /**
     * Trigger random firework
     */
    triggerRandomFirework(bypassEnabled = false) {
        const shapes = ['burst', 'heart', 'star', 'ring', 'spiral'];
        const intensity = this.config.randomMinIntensity + 
            Math.random() * (this.config.randomMaxIntensity - this.config.randomMinIntensity);

        this.triggerFirework({
            type: 'random',
            intensity: intensity,
            shape: shapes[Math.floor(Math.random() * shapes.length)],
            colors: this.generateRandomColors(3),
            position: {
                x: 0.15 + Math.random() * 0.7,
                y: 0.25 + Math.random() * 0.5
            },
            reason: 'random',
            bypassEnabled: bypassEnabled
        });
    }

    /**
     * Register flow actions for automation
     */
    registerFlowActions() {
        if (!this.api.registerFlowAction) {
            this.api.log('⚠️ [FIREWORKS] Flow system not available', 'warn');
            return;
        }

        // Trigger firework action
        this.api.registerFlowAction('fireworks_trigger', {
            name: 'Trigger Firework',
            description: 'Launch a firework effect',
            icon: '🎆',
            category: 'effects',
            parameters: {
                shape: {
                    type: 'select',
                    label: 'Shape',
                    options: ['burst', 'heart', 'star', 'ring', 'spiral'],
                    default: 'burst'
                },
                intensity: {
                    type: 'number',
                    label: 'Intensity',
                    min: 0.1,
                    max: 5.0,
                    step: 0.1,
                    default: 1.0
                },
                colors: {
                    type: 'text',
                    label: 'Colors (comma-separated)',
                    description: 'e.g., #ff0000, #00ff00, #0000ff',
                    default: ''
                }
            },
            execute: async (params) => {
                const colors = params.colors 
                    ? params.colors.split(',').map(c => c.trim())
                    : null;
                
                this.triggerFirework({
                    shape: params.shape,
                    intensity: params.intensity,
                    colors: colors,
                    reason: 'flow'
                });
            }
        });

        // Trigger finale action
        this.api.registerFlowAction('fireworks_finale', {
            name: 'Trigger Finale',
            description: 'Launch a multi-burst firework finale',
            icon: '🎇',
            category: 'effects',
            parameters: {
                intensity: {
                    type: 'number',
                    label: 'Intensity',
                    min: 1.0,
                    max: 10.0,
                    step: 0.5,
                    default: 3.0
                },
                duration: {
                    type: 'number',
                    label: 'Duration (ms)',
                    min: 1000,
                    max: 30000,
                    step: 1000,
                    default: 5000
                }
            },
            execute: async (params) => {
                this.triggerFinale(params.intensity, params.duration);
            }
        });

        this.api.log('✅ [FIREWORKS] Flow actions registered', 'info');
    }

    /**
     * Log registered routes
     */
    logRoutes() {
        this.api.log('📍 [FIREWORKS] Routes registered:', 'info');
        this.api.log('   - GET    /fireworks/ui', 'info');
        this.api.log('   - GET    /fireworks/overlay', 'info');
        this.api.log('   - GET    /api/fireworks/config', 'info');
        this.api.log('   - POST   /api/fireworks/config', 'info');
        this.api.log('   - GET    /api/fireworks/status', 'info');
        this.api.log('   - POST   /api/fireworks/toggle', 'info');
        this.api.log('   - POST   /api/fireworks/trigger', 'info');
        this.api.log('   - POST   /api/fireworks/finale', 'info');
        this.api.log('   - POST   /api/fireworks/test-follower', 'info');
        this.api.log('   - POST   /api/fireworks/random', 'info');
        this.api.log('   - GET    /api/fireworks/gift-mappings', 'info');
        this.api.log('   - POST   /api/fireworks/gift-mappings', 'info');
        this.api.log('   - POST   /api/fireworks/upload', 'info');
        this.api.log('   - GET    /api/fireworks/uploads', 'info');
        this.api.log('   - DELETE /api/fireworks/uploads/:filename', 'info');
        this.api.log('   - POST   /api/fireworks/benchmark/set-preset', 'info');
        this.api.log('   - GET    /api/fireworks/benchmark/fps', 'info');
        this.api.log('   - POST   /api/fireworks/benchmark/restore', 'info');
        this.api.log('   - POST   /api/fireworks/config/reset', 'info');
    }

    /**
     * Plugin API - Exposed for other plugins
     */
    
    /**
     * Trigger a firework programmatically
     * @param {string} type - Firework type (burst, heart, star, etc.)
     * @param {Object} payload - Trigger options
     */
    trigger(type, payload = {}) {
        this.triggerFirework({
            type: type,
            ...payload
        });
    }

    /**
     * Trigger firework for a specific gift
     * @param {number} giftId - TikTok gift ID
     * @param {Object} options - Additional options
     */
    triggerGift(giftId, options = {}) {
        const giftInfo = this.getGiftInfo(giftId);
        const giftSettings = this.config.giftShapeMappings[giftId] || {};
        
        this.triggerFirework({
            type: 'gift',
            shape: giftSettings.shape || this.config.defaultShape,
            colors: giftSettings.colors || null,
            intensity: giftSettings.intensity || 1.0,
            giftId: giftId,
            giftImage: giftInfo ? giftInfo.image_url : null,
            ...options
        });
    }

    /**
     * Get current configuration
     * @returns {Object} Current plugin configuration
     */
    getConfiguration() {
        return { ...this.config };
    }

    /**
     * Cleanup on plugin destroy
     */
    async destroy() {
        // Stop random timer
        this.stopRandomTimer();

        // Clear combo states
        this.comboState.clear();
        this.lastGiftTime.clear();
        
        // Clear queue timestamps
        this.queueTimestamps = [];
        
        // Clear active firework timers
        for (const timer of this.activeFireworkTimers.values()) {
            clearTimeout(timer);
        }
        this.activeFireworkTimers.clear();
        this.activeFireworkCount = 0;
        
        // Remove socket event handler and disconnect all tracked sockets
        if (this.fpsUpdateHandler) {
            const io = this.api.getSocketIO();
            io.off('connection', this.fpsUpdateHandler);
            this.fpsUpdateHandler = null;
        }
        
        // Clean up tracked sockets
        if (this.connectedSockets) {
            this.connectedSockets.forEach(socket => {
                socket.removeAllListeners('fireworks:fps-update');
            });
            this.connectedSockets.clear();
        }
        
        this.api.log('🎆 [FIREWORKS] Fireworks Superplugin destroyed', 'info');
    }
}

module.exports = FireworksPlugin;
