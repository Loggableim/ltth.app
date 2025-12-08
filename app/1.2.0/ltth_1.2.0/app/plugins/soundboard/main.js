const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const SoundboardFetcher = require('./fetcher');
const SoundboardWebSocketTransport = require('./transport-ws');
const SoundboardApiRoutes = require('./api-routes');
const MyInstantsAPI = require('./myinstants-api');
const AudioCacheManager = require('./audio-cache');
const CacheCleanupJob = require('./cache-cleanup');

/**
 * Soundboard Manager Class
 * Handles gift-specific sounds, audio queue management, and MyInstants integration
 */
class SoundboardManager extends EventEmitter {
    constructor(db, io, logger) {
        super();
        this.db = db;
        this.io = io;
        this.logger = logger;
        this.likeHistory = []; // Deque for like threshold tracking
        this.MAX_LIKE_HISTORY_SIZE = 100;

        console.log('✅ Soundboard Manager initialized (Queue managed in frontend)');
    }

    /**
     * Get sound for a specific gift
     */
    getGiftSound(giftId) {
        const stmt = this.db.db.prepare('SELECT * FROM gift_sounds WHERE gift_id = ?');
        const sound = stmt.get(giftId);
        return sound ? {
            id: sound.id,
            giftId: sound.gift_id,
            label: sound.label,
            mp3Url: sound.mp3_url,
            volume: sound.volume || 1.0,
            animationUrl: sound.animation_url || null,
            animationType: sound.animation_type || 'none',
            animationVolume: sound.animation_volume || 1.0
        } : null;
    }

    /**
     * Get all gift sounds
     */
    getAllGiftSounds() {
        const stmt = this.db.db.prepare('SELECT * FROM gift_sounds ORDER BY label ASC');
        const sounds = stmt.all();
        return sounds.map(s => ({
            id: s.id,
            giftId: s.gift_id,
            label: s.label,
            mp3Url: s.mp3_url,
            volume: s.volume || 1.0,
            animationUrl: s.animation_url || null,
            animationType: s.animation_type || 'none',
            animationVolume: s.animation_volume || 1.0
        }));
    }

    /**
     * Add or update gift sound
     */
    setGiftSound(giftId, label, mp3Url, volume = 1.0, animationUrl = null, animationType = 'none', animationVolume = 1.0) {
        const stmt = this.db.db.prepare(`
            INSERT INTO gift_sounds (gift_id, label, mp3_url, volume, animation_url, animation_type, animation_volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(gift_id) DO UPDATE SET
                label = excluded.label,
                mp3_url = excluded.mp3_url,
                volume = excluded.volume,
                animation_url = excluded.animation_url,
                animation_type = excluded.animation_type,
                animation_volume = excluded.animation_volume
        `);

        const result = stmt.run(giftId, label, mp3Url, volume, animationUrl, animationType, animationVolume);
        return result.lastInsertRowid || result.changes;
    }

    /**
     * Delete gift sound
     */
    deleteGiftSound(giftId) {
        const stmt = this.db.db.prepare('DELETE FROM gift_sounds WHERE gift_id = ?');
        stmt.run(giftId);
    }

    /**
     * Play sound for gift event
     */
    async playGiftSound(giftData) {
        console.log(`🎁 [Soundboard] Gift event received:`, {
            giftId: giftData.giftId,
            giftName: giftData.giftName,
            username: giftData.username,
            repeatCount: giftData.repeatCount || 1
        });

        const giftSound = this.getGiftSound(giftData.giftId);

        if (giftSound) {
            // Use specific gift sound
            console.log(`🎵 [Soundboard] Playing gift-specific sound: ${giftSound.label}`);
            await this.playSound(giftSound.mp3Url, giftSound.volume, giftSound.label);

            // Play animation if configured
            if (giftSound.animationType && giftSound.animationType !== 'none') {
                this.playGiftAnimation(giftData, giftSound);
            }
        } else {
            // Use default gift sound if configured
            const defaultUrl = this.db.getSetting('soundboard_default_gift_sound');
            const defaultVolume = parseFloat(this.db.getSetting('soundboard_gift_volume')) || 1.0;

            if (defaultUrl) {
                console.log(`🎵 [Soundboard] Playing default gift sound (no specific sound found for giftId ${giftData.giftId})`);
                await this.playSound(defaultUrl, defaultVolume, 'Default Gift');
            } else {
                console.log(`ℹ️ [Soundboard] No sound configured for gift: ${giftData.giftName} (ID: ${giftData.giftId})`);
            }
        }
    }

    /**
     * Play animation for gift event
     */
    playGiftAnimation(giftData, giftSound) {
        const animationData = {
            type: giftSound.animationType,
            url: giftSound.animationUrl,
            volume: giftSound.animationVolume || 1.0,
            giftName: giftData.giftName || giftSound.label,
            username: giftData.username || 'Anonymous',
            giftImage: giftData.giftPictureUrl || null,
            timestamp: Date.now()
        };

        console.log(`🎬 Playing gift animation: ${animationData.type} for ${animationData.giftName} (volume: ${animationData.volume})`);
        this.io.emit('gift:animation', animationData);
    }

    /**
     * Extract username from event data with fallbacks
     */
    getUsernameFromData(data) {
        return data.username || data.nickname || data.uniqueId || 'Anonymous';
    }

    /**
     * Play animation for event (follow, subscribe, share)
     */
    playEventAnimation(eventType, username) {
        const animationType = this.db.getSetting(`soundboard_${eventType}_animation_type`);
        const animationUrl = this.db.getSetting(`soundboard_${eventType}_animation_url`);
        const animationVolume = parseFloat(this.db.getSetting(`soundboard_${eventType}_animation_volume`)) || 1.0;

        if (!animationType || animationType === 'none' || !animationUrl) {
            return;
        }

        const animationData = {
            type: animationType,
            url: animationUrl,
            volume: animationVolume,
            eventType: eventType,
            username: username || 'Anonymous',
            timestamp: Date.now()
        };

        console.log(`🎬 Playing ${eventType} animation: ${animationData.type} (volume: ${animationData.volume})`);
        this.io.emit('event:animation', animationData);
    }

    /**
     * Play sound for follow event
     */
    async playFollowSound(data = {}) {
        console.log(`⭐ [Soundboard] Follow event received`);
        const url = this.db.getSetting('soundboard_follow_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_follow_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Follow');
            
            // Play animation if configured
            this.playEventAnimation('follow', this.getUsernameFromData(data));
        } else {
            console.log(`ℹ️ [Soundboard] No sound configured for follow event`);
        }
    }

    /**
     * Play sound for subscribe event
     */
    async playSubscribeSound(data = {}) {
        console.log(`🌟 [Soundboard] Subscribe event received`);
        const url = this.db.getSetting('soundboard_subscribe_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_subscribe_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Subscribe');
            
            // Play animation if configured
            this.playEventAnimation('subscribe', this.getUsernameFromData(data));
        } else {
            console.log(`ℹ️ [Soundboard] No sound configured for subscribe event`);
        }
    }

    /**
     * Play sound for share event
     */
    async playShareSound(data = {}) {
        console.log(`🔄 [Soundboard] Share event received`);
        const url = this.db.getSetting('soundboard_share_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_share_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Share');
            
            // Play animation if configured
            this.playEventAnimation('share', this.getUsernameFromData(data));
        } else {
            console.log(`ℹ️ [Soundboard] No sound configured for share event`);
        }
    }

    /**
     * Handle like event with threshold logic
     */
    async handleLikeEvent(likeCount) {
        const now = Date.now();
        const threshold = parseInt(this.db.getSetting('soundboard_like_threshold')) || 0;
        const windowSeconds = parseInt(this.db.getSetting('soundboard_like_window_seconds')) || 10;

        if (threshold === 0) {
            return; // Like threshold disabled
        }

        console.log(`👍 [Soundboard] Like event received: ${likeCount} likes`);

        // Add current like event to history
        this.likeHistory.push({ count: likeCount, timestamp: now });

        // Remove likes outside the time window
        const windowMs = windowSeconds * 1000;
        this.likeHistory = this.likeHistory.filter(like => (now - like.timestamp) <= windowMs);

        // Enforce max size to prevent unbounded growth
        if (this.likeHistory.length > this.MAX_LIKE_HISTORY_SIZE) {
            this.likeHistory = this.likeHistory.slice(-this.MAX_LIKE_HISTORY_SIZE);
            if (this.logger) {
                this.logger.warn(`Like history exceeded ${this.MAX_LIKE_HISTORY_SIZE}, trimmed to most recent`);
            }
        }

        // Calculate total likes in window
        const totalLikes = this.likeHistory.reduce((sum, like) => sum + like.count, 0);

        console.log(`👍 [Soundboard] Like threshold check: ${totalLikes}/${threshold} likes in last ${windowSeconds}s`);

        // Check if threshold is met
        if (totalLikes >= threshold) {
            const url = this.db.getSetting('soundboard_like_sound');
            const volume = parseFloat(this.db.getSetting('soundboard_like_volume')) || 1.0;

            if (url) {
                console.log(`🎵 [Soundboard] Like threshold reached! Playing sound (${totalLikes} likes)`);
                await this.playSound(url, volume, `Like Threshold (${totalLikes} likes)`);
            } else {
                console.log(`ℹ️ [Soundboard] Like threshold reached but no sound configured`);
            }

            // Clear history after triggering
            this.likeHistory = [];
        }
    }

    /**
     * Core sound playback function
     * Queue management happens in the frontend based on play_mode
     */
    async playSound(url, volume = 1.0, label = 'Sound') {
        // Validierung
        if (!url || typeof url !== 'string') {
            console.error('❌ [Soundboard] Invalid sound URL:', url);
            return;
        }

        if (typeof volume !== 'number' || volume < 0 || volume > 1) {
            console.warn('⚠️ [Soundboard] Invalid volume, using 1.0:', volume);
            volume = 1.0;
        }

        const soundData = {
            url: url,
            volume: volume,
            label: label,
            timestamp: Date.now()
        };

        console.log(`🎵 [Soundboard] Emitting sound to frontend:`, {
            label: label,
            url: url,
            volume: volume,
            timestamp: new Date().toISOString()
        });

        // Always send to frontend immediately
        // Frontend handles queue management based on play_mode (overlap/sequential)
        this.emitSound(soundData);
    }

    /**
     * Emit sound to overlay via Socket.io
     */
    emitSound(soundData) {
        this.io.emit('soundboard:play', {
            url: soundData.url,
            volume: soundData.volume,
            label: soundData.label
        });
    }

    /**
     * Test sound playback
     */
    async testSound(url, volume = 1.0) {
        await this.playSound(url, volume, 'Test Sound');
    }

    /**
     * Clear sound queue (deprecated - queue is now managed in frontend)
     */
    clearQueue() {
        // Queue management is now handled in the frontend
        console.log('⚠️ clearQueue() called but queue is managed in frontend');
    }

    /**
     * Get current queue status (deprecated - queue is now managed in frontend)
     */
    getQueueStatus() {
        return {
            length: 0,
            isProcessing: false,
            items: [],
            note: 'Queue management is now handled in the frontend'
        };
    }
}

/**
 * Soundboard Plugin
 *
 * Handles gift-specific sounds, audio queue management, and MyInstants integration
 */
class SoundboardPlugin {
    constructor(api) {
        this.api = api;
        this.soundboard = null;
    }

    async init() {
        this.api.log('Initializing Soundboard Plugin...', 'info');

        // Initialize SoundboardManager
        const db = this.api.getDatabase();
        const io = this.api.getSocketIO();
        this.soundboard = new SoundboardManager(db, io, {
            info: (msg) => this.api.log(msg, 'info'),
            warn: (msg) => this.api.log(msg, 'warn'),
            error: (msg) => this.api.log(msg, 'error'),
            debug: (msg) => this.api.log(msg, 'debug')
        });

        // Initialize MyInstants API
        this.myinstantsAPI = new MyInstantsAPI({
            info: (msg) => this.api.log(msg, 'info'),
            warn: (msg) => this.api.log(msg, 'warn'),
            error: (msg) => this.api.log(msg, 'error')
        });

        // Initialize Audio Cache Manager
        const cacheDir = path.join(__dirname, '../../data/soundboard-cache/sounds');
        this.audioCacheManager = new AudioCacheManager(db, {
            info: (msg) => this.api.log(msg, 'info'),
            warn: (msg) => this.api.log(msg, 'warn'),
            error: (msg) => this.api.log(msg, 'error')
        }, cacheDir);

        // Initialize Cache Cleanup Job
        this.cleanupJob = new CacheCleanupJob(this.audioCacheManager, {
            info: (msg) => this.api.log(msg, 'info'),
            warn: (msg) => this.api.log(msg, 'warn'),
            error: (msg) => this.api.log(msg, 'error')
        });
        
        // Run cleanup on startup (async, non-blocking)
        this.cleanupJob.runOnStartup().catch(err => {
            this.api.log(`Cache cleanup on startup failed: ${err.message}`, 'warn');
        });

        // Initialize preview system components
        this.initPreviewSystem();

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers
        this.registerTikTokEventHandlers();

        this.api.log('✅ Soundboard Plugin initialized', 'info');
    }

    /**
     * Initialize the client-side preview system
     */
    initPreviewSystem() {
        const io = this.api.getSocketIO();
        const app = this.api.getApp();
        const apiLimiter = require('../../modules/rate-limiter').apiLimiter;
        
        // Get sounds directory path
        const soundsDir = path.join(__dirname, '../../public/sounds');
        
        // Initialize fetcher (path validation & URL whitelist)
        this.fetcher = new SoundboardFetcher();
        
        // Initialize WebSocket transport (dashboard client tracking & broadcasting)
        this.transport = new SoundboardWebSocketTransport(io);
        
        // Initialize API routes (preview endpoint with auth & validation)
        this.apiRoutes = new SoundboardApiRoutes(
            app,
            apiLimiter,
            this.fetcher,
            this.transport,
            {
                info: (msg) => this.api.log(msg, 'info'),
                warn: (msg) => this.api.log(msg, 'warn'),
                error: (msg) => this.api.log(msg, 'error')
            },
            soundsDir
        );
        
        this.api.log('✅ Soundboard preview system initialized (client-side mode)', 'info');
        
        // Check environment configuration
        const previewMode = process.env.SOUNDBOARD_PREVIEW_MODE || 'client';
        if (previewMode !== 'client') {
            this.api.log(`⚠️ SOUNDBOARD_PREVIEW_MODE is set to "${previewMode}" but only "client" mode is supported`, 'warn');
        }
    }

    registerRoutes() {
        // Serve plugin UI (configuration page)
        this.api.registerRoute('get', '/soundboard/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui', 'index.html');
            res.sendFile(uiPath);
        });

        // Get all gift sounds
        this.api.registerRoute('get', '/api/soundboard/gifts', (req, res) => {
            try {
                const gifts = this.soundboard.getAllGiftSounds();
                res.json(gifts);
            } catch (error) {
                this.api.log(`Error getting gift sounds: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Add/update gift sound
        this.api.registerRoute('post', '/api/soundboard/gifts', (req, res) => {
            const { giftId, label, mp3Url, volume, animationUrl, animationType, animationVolume } = req.body;

            if (!giftId || !label || !mp3Url) {
                return res.status(400).json({ success: false, error: 'giftId, label and mp3Url are required' });
            }

            try {
                // Validate and clamp volume values between 0 and 1
                const validVolume = Math.max(0, Math.min(1, parseFloat(volume) || 1.0));
                const validAnimVolume = Math.max(0, Math.min(1, parseFloat(animationVolume) || 1.0));

                const id = this.soundboard.setGiftSound(
                    giftId,
                    label,
                    mp3Url,
                    validVolume,
                    animationUrl || null,
                    animationType || 'none',
                    validAnimVolume
                );
                this.api.log(`🎵 Gift sound set: ${label} (ID: ${giftId})`, 'info');
                res.json({ success: true, id });
            } catch (error) {
                this.api.log(`Error setting gift sound: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete gift sound
        this.api.registerRoute('delete', '/api/soundboard/gifts/:giftId', (req, res) => {
            try {
                this.soundboard.deleteGiftSound(req.params.giftId);
                this.api.log(`🗑️ Deleted gift sound: ${req.params.giftId}`, 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error deleting gift sound: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test sound
        this.api.registerRoute('post', '/api/soundboard/test', async (req, res) => {
            const { url, volume } = req.body;

            if (!url) {
                return res.status(400).json({ success: false, error: 'url is required' });
            }

            try {
                await this.soundboard.testSound(url, volume || 1.0);
                this.api.log(`🔊 Testing sound: ${url}`, 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error testing sound: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get queue status
        this.api.registerRoute('get', '/api/soundboard/queue', (req, res) => {
            try {
                const status = this.soundboard.getQueueStatus();
                res.json(status);
            } catch (error) {
                this.api.log(`Error getting queue status: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Clear queue
        this.api.registerRoute('post', '/api/soundboard/queue/clear', (req, res) => {
            try {
                this.soundboard.clearQueue();
                this.api.log('🧹 Soundboard queue cleared', 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error clearing queue: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants search - NEW API
        this.api.registerRoute('get', '/api/myinstants/search', async (req, res) => {
            const { query, page, limit } = req.query;

            if (!query) {
                return res.status(400).json({ success: false, error: 'query is required' });
            }

            try {
                const results = await this.myinstantsAPI.search(query, page || 1, limit || 20);
                res.json({ success: true, results });
            } catch (error) {
                this.api.log(`Error searching MyInstants: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants trending - NEW API
        this.api.registerRoute('get', '/api/myinstants/trending', async (req, res) => {
            const { limit } = req.query;

            try {
                const results = await this.myinstantsAPI.getTrending(limit || 20);
                res.json({ success: true, results });
            } catch (error) {
                this.api.log(`Error getting trending sounds: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants random - NEW API
        this.api.registerRoute('get', '/api/myinstants/random', async (req, res) => {
            const { limit } = req.query;

            try {
                const results = await this.myinstantsAPI.getRandom(limit || 20);
                res.json({ success: true, results });
            } catch (error) {
                this.api.log(`Error getting random sounds: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants categories (optional) - NEW API
        this.api.registerRoute('get', '/api/myinstants/categories', async (req, res) => {
            try {
                const results = await this.myinstantsAPI.getCategories();
                res.json({ success: true, results });
            } catch (error) {
                this.api.log(`Error getting categories: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants resolve URL - NEW API
        this.api.registerRoute('get', '/api/myinstants/resolve', async (req, res) => {
            const { url } = req.query;

            if (!url) {
                return res.status(400).json({ success: false, error: 'url is required' });
            }

            // Wenn es bereits eine direkte MP3-URL ist, direkt zurückgeben
            if (url.match(/\.mp3($|\?)/i)) {
                return res.json({ success: true, mp3: url });
            }

            try {
                const mp3Url = await this.myinstantsAPI.resolvePageUrl(url);
                return res.json({ success: true, mp3: mp3Url });
            } catch (error) {
                this.api.log(`Error resolving MyInstants URL: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ========== WICHTIGSTER ENDPOINT: Audio Proxy mit Caching ==========
        this.api.registerRoute('get', '/api/myinstants/proxy-audio', async (req, res) => {
            const { url } = req.query;

            if (!url) {
                return res.status(400).json({ success: false, error: 'url parameter is required' });
            }

            try {
                // Validate URL is from MyInstants
                if (!this.myinstantsAPI.isValidMyInstantsUrl(url)) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'Only MyInstants URLs are allowed' 
                    });
                }

                // Check cache first
                let cacheEntry = this.audioCacheManager.getCacheEntry(url);

                if (cacheEntry) {
                    // Cache HIT - serve from cache
                    this.api.log(`[AudioProxy] Cache HIT: ${url}`, 'info');
                    
                    // Update last_played timestamp
                    this.audioCacheManager.updateLastPlayed(url);

                    // Stream cached file
                    const fileStream = fs.createReadStream(cacheEntry.file_path);
                    
                    res.setHeader('Content-Type', 'audio/mpeg');
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                    res.setHeader('X-Cache-Status', 'HIT');
                    
                    fileStream.pipe(res);
                    
                } else {
                    // Cache MISS - download and cache
                    this.api.log(`[AudioProxy] Cache MISS: ${url}`, 'info');

                    try {
                        // Download and cache
                        cacheEntry = await this.audioCacheManager.cacheAudio(url);

                        this.api.log(`[AudioProxy] Cached successfully: ${url}`, 'info');

                        // Stream newly cached file
                        const fileStream = fs.createReadStream(cacheEntry.file_path);
                        
                        res.setHeader('Content-Type', 'audio/mpeg');
                        res.setHeader('Cache-Control', 'public, max-age=3600');
                        res.setHeader('X-Cache-Status', 'MISS');
                        
                        fileStream.pipe(res);

                    } catch (cacheError) {
                        this.api.log(`[AudioProxy] Cache error, falling back to direct proxy: ${cacheError.message}`, 'warn');
                        
                        // Fallback: Direct proxy without caching
                        const axios = require('axios');
                        const https = require('https');
                        const httpsAgent = new https.Agent({
                            rejectUnauthorized: true,
                            keepAlive: true,
                            timeout: 30000
                        });
                        
                        const response = await axios.get(url, {
                            responseType: 'stream',
                            timeout: 30000,
                            httpsAgent: httpsAgent,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Accept': 'audio/mpeg, audio/*;q=0.9, */*;q=0.8'
                            }
                        });

                        res.setHeader('Content-Type', 'audio/mpeg');
                        res.setHeader('X-Cache-Status', 'BYPASS');
                        response.data.pipe(res);
                    }
                }

            } catch (error) {
                this.api.log(`[AudioProxy] Error: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Cache management endpoints
        this.api.registerRoute('get', '/api/soundboard/cache/stats', (req, res) => {
            try {
                const stats = this.audioCacheManager.getCacheStats();
                res.json({ success: true, stats });
            } catch (error) {
                this.api.log(`Error getting cache stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/soundboard/cache/cleanup', async (req, res) => {
            try {
                const stats = await this.cleanupJob.runNow();
                res.json({ success: true, stats });
            } catch (error) {
                this.api.log(`Error running cleanup: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/soundboard/cache', async (req, res) => {
            try {
                await this.audioCacheManager.clearCache();
                res.json({ success: true, message: 'Cache cleared' });
            } catch (error) {
                this.api.log(`Error clearing cache: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.log('✅ Soundboard routes registered (with audio proxy & caching)', 'info');
    }

    registerTikTokEventHandlers() {
        const db = this.api.getDatabase();

        // Gift Event
        this.api.registerTikTokEvent('gift', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Gift event received but soundboard is disabled');
                return;
            }
            await this.soundboard.playGiftSound(data);
        });

        // Follow Event
        this.api.registerTikTokEvent('follow', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Follow event received but soundboard is disabled');
                return;
            }
            await this.soundboard.playFollowSound(data);
        });

        // Subscribe Event
        this.api.registerTikTokEvent('subscribe', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Subscribe event received but soundboard is disabled');
                return;
            }
            await this.soundboard.playSubscribeSound(data);
        });

        // Share Event
        this.api.registerTikTokEvent('share', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Share event received but soundboard is disabled');
                return;
            }
            await this.soundboard.playShareSound(data);
        });

        // Like Event
        this.api.registerTikTokEvent('like', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (!soundboardEnabled) {
                // Likes sind sehr häufig - nur beim ersten Mal loggen
                return;
            }
            await this.soundboard.handleLikeEvent(data.likeCount || 1);
        });

        this.api.log('✅ Soundboard TikTok event handlers registered', 'info');
    }

    /**
     * Public method to access soundboard manager (for other modules/plugins)
     */
    getSoundboard() {
        return this.soundboard;
    }

    async destroy() {
        // Cleanup job runs only on startup, nothing to stop
        this.api.log('🎵 Soundboard Plugin destroyed', 'info');
    }
}

module.exports = SoundboardPlugin;
