const path = require('path');
const fs = require('fs');
const multer = require('multer');

/**
 * Gift Milestone Celebration Plugin
 *
 * Celebrates coin milestones with custom animations and audio
 * Tracks cumulative gift coins and triggers celebrations when thresholds are reached
 */
class GiftMilestonePlugin {
    constructor(api) {
        this.api = api;
        this.uploadDir = path.join(__dirname, 'uploads');
        this.upload = null;
        this.exclusiveMode = false; // Track if we're in exclusive playback mode
    }

    async init() {
        this.api.log('Initializing Gift Milestone Celebration Plugin...', 'info');

        // Initialize database tables and defaults
        this.initializeDatabase();

        // Create upload directory
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }

        // Setup multer for file uploads
        this.setupFileUpload();

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers
        this.registerTikTokEventHandlers();

        // Check for session reset on initialization
        this.checkSessionReset();

        this.api.log('✅ Gift Milestone Celebration Plugin initialized', 'info');
    }

    initializeDatabase() {
        try {
            const db = this.api.getDatabase();

            // Create tables if they don't exist
            db.exec(`
                CREATE TABLE IF NOT EXISTS milestone_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    enabled INTEGER DEFAULT 1,
                    threshold INTEGER DEFAULT 1000,
                    mode TEXT DEFAULT 'auto_increment',
                    increment_step INTEGER DEFAULT 1000,
                    animation_gif_path TEXT,
                    animation_video_path TEXT,
                    animation_audio_path TEXT,
                    audio_volume INTEGER DEFAULT 80,
                    playback_mode TEXT DEFAULT 'exclusive',
                    animation_duration INTEGER DEFAULT 0,
                    session_reset INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.exec(`
                CREATE TABLE IF NOT EXISTS milestone_stats (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    cumulative_coins INTEGER DEFAULT 0,
                    current_milestone INTEGER DEFAULT 0,
                    last_trigger_at DATETIME,
                    session_start_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Initialize defaults if not exists
            const configStmt = db.prepare(`
                INSERT OR IGNORE INTO milestone_config (
                    id, enabled, threshold, mode, increment_step,
                    audio_volume, playback_mode, animation_duration, session_reset
                )
                VALUES (1, 1, 1000, 'auto_increment', 1000, 80, 'exclusive', 0, 0)
            `);
            configStmt.run();

            const statsStmt = db.prepare(`
                INSERT OR IGNORE INTO milestone_stats (id, cumulative_coins, current_milestone)
                VALUES (1, 0, 1000)
            `);
            statsStmt.run();

            this.api.log('Database tables initialized', 'info');
        } catch (error) {
            this.api.log(`Error initializing database: ${error.message}`, 'error');
            throw error;
        }
    }

    setupFileUpload() {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.uploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname);
                const type = file.fieldname; // 'gif', 'video', or 'audio'
                cb(null, `milestone-${type}-${uniqueSuffix}${ext}`);
            }
        });

        this.upload = multer({
            storage: storage,
            limits: {
                fileSize: 100 * 1024 * 1024 // 100MB
            },
            fileFilter: (req, file, cb) => {
                const fieldName = file.fieldname;
                let allowedTypes = null;
                let maxSize = 100 * 1024 * 1024; // Default 100MB

                if (fieldName === 'gif') {
                    allowedTypes = /gif|png|jpg|jpeg|webp/;
                    maxSize = 25 * 1024 * 1024; // 25MB
                } else if (fieldName === 'video') {
                    allowedTypes = /mp4|webm|mov|avi/;
                    maxSize = 100 * 1024 * 1024; // 100MB
                } else if (fieldName === 'audio') {
                    allowedTypes = /mp3|wav|ogg|m4a/;
                    maxSize = 25 * 1024 * 1024; // 25MB
                }

                if (!allowedTypes) {
                    return cb(new Error('Invalid field name'));
                }

                const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
                const mimetype = allowedTypes.test(file.mimetype);

                if (mimetype && extname) {
                    return cb(null, true);
                } else {
                    cb(new Error(`Invalid file type for ${fieldName}. Allowed: ${allowedTypes}`));
                }
            }
        });
    }

    registerRoutes() {
        // Serve plugin UI (configuration page)
        this.api.registerRoute('get', '/gift-milestone/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui.html');
            res.sendFile(uiPath);
        });

        // Serve plugin overlay
        this.api.registerRoute('get', '/gift-milestone/overlay', (req, res) => {
            const overlayPath = path.join(__dirname, 'overlay.html');
            res.sendFile(overlayPath);
        });

        // Serve uploaded files
        this.api.registerRoute('get', '/gift-milestone/uploads/:filename', (req, res) => {
            const filename = req.params.filename;
            const filePath = path.join(this.uploadDir, filename);

            if (fs.existsSync(filePath)) {
                res.sendFile(filePath);
            } else {
                res.status(404).json({ success: false, error: 'File not found' });
            }
        });

        // Get milestone config
        this.api.registerRoute('get', '/api/gift-milestone/config', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const config = db.getMilestoneConfig();
                res.json({ success: true, config });
            } catch (error) {
                this.api.log(`Error getting milestone config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get milestone stats
        this.api.registerRoute('get', '/api/gift-milestone/stats', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const stats = db.getMilestoneStats();
                const config = db.getMilestoneConfig();
                res.json({
                    success: true,
                    stats,
                    config
                });
            } catch (error) {
                this.api.log(`Error getting milestone stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update milestone config
        this.api.registerRoute('post', '/api/gift-milestone/config', (req, res) => {
            const config = req.body;

            if (!config) {
                return res.status(400).json({ success: false, error: 'config is required' });
            }

            try {
                const db = this.api.getDatabase();
                db.updateMilestoneConfig(config);
                this.api.log('🎯 Milestone configuration updated', 'info');

                // Notify overlays about config change
                this.api.emit('milestone:config-update', { config });

                res.json({ success: true, message: 'Milestone configuration updated' });
            } catch (error) {
                this.api.log(`Error updating milestone config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Toggle milestone enabled/disabled
        this.api.registerRoute('post', '/api/gift-milestone/toggle', (req, res) => {
            const { enabled } = req.body;

            if (enabled === undefined) {
                return res.status(400).json({ success: false, error: 'enabled is required' });
            }

            try {
                const db = this.api.getDatabase();
                db.toggleMilestone(enabled);
                this.api.log(`🎯 Milestone ${enabled ? 'enabled' : 'disabled'}`, 'info');

                // Notify overlays about toggle
                this.api.emit('milestone:toggle', { enabled });

                res.json({ success: true, message: `Milestone ${enabled ? 'enabled' : 'disabled'}` });
            } catch (error) {
                this.api.log(`Error toggling milestone: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Reset milestone stats
        this.api.registerRoute('post', '/api/gift-milestone/reset', (req, res) => {
            try {
                const db = this.api.getDatabase();
                db.resetMilestoneStats();
                this.api.log('🎯 Milestone stats reset', 'info');

                // Notify overlays about reset
                this.api.emit('milestone:stats-update', db.getMilestoneStats());

                res.json({ success: true, message: 'Milestone stats reset' });
            } catch (error) {
                this.api.log(`Error resetting milestone stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Upload milestone media files
        this.api.registerRoute('post', '/api/gift-milestone/upload/:type', (req, res) => {
            const type = req.params.type; // 'gif', 'video', or 'audio'

            if (!['gif', 'video', 'audio'].includes(type)) {
                return res.status(400).json({ success: false, error: 'Invalid type. Must be gif, video, or audio' });
            }

            this.upload.single(type)(req, res, (err) => {
                if (err) {
                    this.api.log(`Error uploading milestone ${type}: ${err.message}`, 'error');
                    return res.status(500).json({ success: false, error: err.message });
                }

                try {
                    if (!req.file) {
                        return res.status(400).json({ success: false, error: 'No file uploaded' });
                    }

                    const fileUrl = `/gift-milestone/uploads/${req.file.filename}`;
                    this.api.log(`📤 Milestone ${type} uploaded: ${req.file.filename}`, 'info');

                    // Update database with file path
                    const db = this.api.getDatabase();
                    const config = db.getMilestoneConfig();
                    if (type === 'gif') {
                        config.animation_gif_path = fileUrl;
                    } else if (type === 'video') {
                        config.animation_video_path = fileUrl;
                    } else if (type === 'audio') {
                        config.animation_audio_path = fileUrl;
                    }
                    db.updateMilestoneConfig(config);

                    res.json({
                        success: true,
                        message: `${type} uploaded successfully`,
                        url: fileUrl,
                        filename: req.file.filename,
                        size: req.file.size
                    });
                } catch (error) {
                    this.api.log(`Error uploading milestone ${type}: ${error.message}`, 'error');
                    res.status(500).json({ success: false, error: error.message });
                }
            });
        });

        // Delete milestone media file
        this.api.registerRoute('delete', '/api/gift-milestone/media/:type', (req, res) => {
            const type = req.params.type; // 'gif', 'video', or 'audio'

            if (!['gif', 'video', 'audio'].includes(type)) {
                return res.status(400).json({ success: false, error: 'Invalid type' });
            }

            try {
                const db = this.api.getDatabase();
                const config = db.getMilestoneConfig();
                let filePath = null;

                if (type === 'gif' && config.animation_gif_path) {
                    filePath = path.join(__dirname, '..', '..', 'public', config.animation_gif_path);
                    config.animation_gif_path = null;
                } else if (type === 'video' && config.animation_video_path) {
                    filePath = path.join(__dirname, '..', '..', 'public', config.animation_video_path);
                    config.animation_video_path = null;
                } else if (type === 'audio' && config.animation_audio_path) {
                    filePath = path.join(__dirname, '..', '..', 'public', config.animation_audio_path);
                    config.animation_audio_path = null;
                }

                if (filePath && fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    this.api.log(`🗑️ Deleted milestone ${type}`, 'info');
                }

                db.updateMilestoneConfig(config);

                res.json({ success: true, message: `${type} deleted successfully` });
            } catch (error) {
                this.api.log(`Error deleting milestone ${type}: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test milestone trigger
        this.api.registerRoute('post', '/api/gift-milestone/test', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const config = db.getMilestoneConfig();
                const { tierId } = req.body;

                if (!config.enabled) {
                    return res.status(400).json({ success: false, error: 'Milestone is disabled' });
                }

                this.api.log('🧪 Testing milestone celebration', 'info');

                let tier = null;
                let milestone = config.threshold;

                // Test specific tier if provided
                if (tierId) {
                    tier = db.getMilestoneTier(tierId);
                    if (tier) {
                        milestone = tier.threshold;
                        this.triggerCelebration(milestone, tier, 'test-user', 'Test User');
                    }
                } else {
                    // Test global milestone
                    const stats = db.getMilestoneStats();
                    milestone = stats.current_milestone || config.threshold;
                    this.triggerCelebration(milestone);
                }

                res.json({
                    success: true,
                    message: 'Test celebration triggered',
                    milestone: milestone,
                    tier: tier
                });
            } catch (error) {
                this.api.log(`Error testing milestone: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Serve uploaded files via static route
        const express = require('express');
        this.api.getApp().use('/plugins/gift-milestone/uploads', express.static(this.uploadDir));

        // Tier Management Routes
        this.api.registerRoute('get', '/api/gift-milestone/tiers', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const tiers = db.getMilestoneTiers();
                res.json({ success: true, tiers });
            } catch (error) {
                this.api.log(`Error getting milestone tiers: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/gift-milestone/tiers', (req, res) => {
            try {
                const tier = req.body;
                
                // Validate required fields
                if (!tier.name || typeof tier.name !== 'string') {
                    return res.status(400).json({ success: false, error: 'Tier name is required and must be a string' });
                }
                if (tier.tier_level === undefined || typeof tier.tier_level !== 'number') {
                    return res.status(400).json({ success: false, error: 'Tier level is required and must be a number' });
                }
                if (!tier.threshold || typeof tier.threshold !== 'number' || tier.threshold < 0) {
                    return res.status(400).json({ success: false, error: 'Threshold is required and must be a positive number' });
                }
                
                const db = this.api.getDatabase();
                const tierId = db.saveMilestoneTier(tier);
                this.api.log(`✅ Milestone tier saved: ${tier.name}`, 'info');
                res.json({ success: true, tierId });
            } catch (error) {
                this.api.log(`Error saving milestone tier: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/gift-milestone/tiers/:id', (req, res) => {
            try {
                const tierId = parseInt(req.params.id);
                
                // Validate tier ID
                if (isNaN(tierId)) {
                    return res.status(400).json({ success: false, error: 'Invalid tier ID' });
                }
                
                const db = this.api.getDatabase();
                db.deleteMilestoneTier(tierId);
                this.api.log(`✅ Milestone tier deleted: ${tierId}`, 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error deleting milestone tier: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Upload tier-specific media files
        this.api.registerRoute('post', '/api/gift-milestone/tiers/:id/upload/:type', (req, res) => {
            const tierId = parseInt(req.params.id);
            const type = req.params.type; // 'gif', 'video', or 'audio'

            if (isNaN(tierId)) {
                return res.status(400).json({ success: false, error: 'Invalid tier ID' });
            }

            if (!['gif', 'video', 'audio'].includes(type)) {
                return res.status(400).json({ success: false, error: 'Invalid type. Must be gif, video, or audio' });
            }

            this.upload.single(type)(req, res, (err) => {
                if (err) {
                    this.api.log(`Error uploading tier ${type}: ${err.message}`, 'error');
                    return res.status(500).json({ success: false, error: err.message });
                }

                try {
                    if (!req.file) {
                        return res.status(400).json({ success: false, error: 'No file uploaded' });
                    }

                    const fileUrl = `/gift-milestone/uploads/${req.file.filename}`;
                    this.api.log(`📤 Tier ${tierId} ${type} uploaded: ${req.file.filename}`, 'info');

                    // Update tier in database with file path
                    const db = this.api.getDatabase();
                    const tier = db.getMilestoneTier(tierId);
                    
                    if (!tier) {
                        // Clean up uploaded file if tier doesn't exist
                        const filePath = path.join(this.uploadDir, req.file.filename);
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            this.api.log(`🗑️ Cleaned up orphaned file: ${req.file.filename}`, 'info');
                        }
                        return res.status(404).json({ success: false, error: 'Tier not found' });
                    }

                    // Map media type to field name
                    const mediaFields = { 
                        gif: 'animation_gif_path', 
                        video: 'animation_video_path', 
                        audio: 'animation_audio_path' 
                    };
                    tier[mediaFields[type]] = fileUrl;
                    
                    db.saveMilestoneTier(tier);

                    res.json({
                        success: true,
                        message: `${type} uploaded successfully for tier`,
                        url: fileUrl,
                        filename: req.file.filename,
                        size: req.file.size
                    });
                } catch (error) {
                    this.api.log(`Error uploading tier ${type}: ${error.message}`, 'error');
                    res.status(500).json({ success: false, error: error.message });
                }
            });
        });

        // Delete tier-specific media file
        this.api.registerRoute('delete', '/api/gift-milestone/tiers/:id/media/:type', (req, res) => {
            const tierId = parseInt(req.params.id);
            const type = req.params.type; // 'gif', 'video', or 'audio'

            if (isNaN(tierId)) {
                return res.status(400).json({ success: false, error: 'Invalid tier ID' });
            }

            if (!['gif', 'video', 'audio'].includes(type)) {
                return res.status(400).json({ success: false, error: 'Invalid type' });
            }

            try {
                const db = this.api.getDatabase();
                const tier = db.getMilestoneTier(tierId);
                
                if (!tier) {
                    return res.status(404).json({ success: false, error: 'Tier not found' });
                }

                // Map media type to field name
                const mediaFields = { 
                    gif: 'animation_gif_path', 
                    video: 'animation_video_path', 
                    audio: 'animation_audio_path' 
                };
                
                const fieldName = mediaFields[type];
                let filePath = null;

                if (tier[fieldName]) {
                    filePath = path.join(this.uploadDir, tier[fieldName].split('/').pop());
                    tier[fieldName] = null;
                }

                if (filePath && fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    this.api.log(`🗑️ Deleted tier ${tierId} ${type}`, 'info');
                }

                db.saveMilestoneTier(tier);

                res.json({ success: true, message: `${type} deleted successfully from tier` });
            } catch (error) {
                this.api.log(`Error deleting tier ${type}: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Per-User Milestone Routes
        this.api.registerRoute('get', '/api/gift-milestone/users', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const users = db.getAllUserMilestoneStats();
                res.json({ success: true, users });
            } catch (error) {
                this.api.log(`Error getting user milestone stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('get', '/api/gift-milestone/users/:userId', (req, res) => {
            try {
                const userId = req.params.userId;
                
                // Validate userId
                if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
                    return res.status(400).json({ success: false, error: 'Invalid user ID' });
                }
                
                const db = this.api.getDatabase();
                const userStats = db.getUserMilestoneStats(userId);
                res.json({ success: true, userStats });
            } catch (error) {
                this.api.log(`Error getting user milestone stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/gift-milestone/users/reset', (req, res) => {
            try {
                const db = this.api.getDatabase();
                db.resetAllUserMilestoneStats();
                this.api.log('✅ All user milestone stats reset', 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error resetting user milestone stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/gift-milestone/users/:userId', (req, res) => {
            try {
                const userId = req.params.userId;
                
                // Validate userId
                if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
                    return res.status(400).json({ success: false, error: 'Invalid user ID' });
                }
                
                const db = this.api.getDatabase();
                db.resetUserMilestoneStats(userId);
                this.api.log(`✅ User milestone stats reset: ${userId}`, 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error resetting user milestone stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.log('✅ Gift Milestone routes registered', 'info');
    }

    registerTikTokEventHandlers() {
        // Gift Event - Track coins and check for milestone
        this.api.registerTikTokEvent('gift', (data) => {
            this.handleGiftEvent(data);
        });

        this.api.log('✅ Gift Milestone TikTok event handlers registered', 'info');
    }

    handleGiftEvent(data) {
        try {
            const db = this.api.getDatabase();
            const coins = data.coins || 0;
            const userId = data.userId || data.uniqueId;
            const username = data.nickname || data.uniqueId;
            const uniqueId = data.uniqueId || '';
            const profilePictureUrl = data.profilePictureUrl || '';

            if (coins === 0) {
                return;
            }

            const config = db.getMilestoneConfig();

            // Global milestone tracking (legacy support)
            const result = db.addCoinsToMilestone(coins);

            // Emit stats update to UI
            this.api.emit('milestone:stats-update', {
                cumulative_coins: result.coins,
                current_milestone: result.nextMilestone
            });

            if (result.triggered) {
                this.api.log(`🎯 Milestone reached! ${result.milestone} coins (Total: ${result.coins})`, 'info');
                this.triggerCelebration(result.milestone, null, userId, username);
            } else {
                this.api.log(`💰 Coins added: +${coins} (Total: ${result.coins}/${result.nextMilestone})`, 'debug');
            }

            // Per-user milestone tracking (tier-based)
            if (userId && username) {
                const userResult = db.addCoinsToUserMilestone(userId, username, coins);
                
                // ALSO update shared user statistics for cross-plugin usage
                db.addCoinsToUserStats(userId, username, uniqueId, profilePictureUrl, coins);
                
                // Emit user stats update to UI
                this.api.emit('milestone:user-stats-update', {
                    userId: userResult.userId,
                    username: userResult.username,
                    cumulative_coins: userResult.coins,
                    tier: userResult.tier
                });

                if (userResult.triggered) {
                    // Celebrate all triggered tiers
                    if (userResult.triggeredTiers && userResult.triggeredTiers.length > 0) {
                        for (const tier of userResult.triggeredTiers) {
                            this.api.log(`🎯 User ${username} reached ${tier.name} tier! (${tier.threshold} coins)`, 'info');
                            this.triggerCelebration(tier.threshold, tier, userId, username);
                        }
                    }
                }
            }
        } catch (error) {
            this.api.log(`Error handling gift event for milestone: ${error.message}`, 'error');
        }
    }

    triggerCelebration(milestone, tier = null, userId = null, username = null) {
        try {
            const db = this.api.getDatabase();
            const config = db.getMilestoneConfig();

            if (!config || !config.enabled) {
                return;
            }

            let celebrationData = {
                milestone: milestone,
                userId: userId,
                username: username,
                audioVolume: config.audio_volume,
                duration: config.animation_duration,
                playbackMode: config.playback_mode
            };

            // Use tier-specific media if tier is provided and has media
            if (tier) {
                celebrationData.tier = tier.name;
                celebrationData.tierLevel = tier.tier_level;
                celebrationData.gif = tier.animation_gif_path || config.animation_gif_path;
                celebrationData.video = tier.animation_video_path || config.animation_video_path;
                celebrationData.audio = tier.animation_audio_path || config.animation_audio_path;
            } else {
                // Use global media
                celebrationData.gif = config.animation_gif_path;
                celebrationData.video = config.animation_video_path;
                celebrationData.audio = config.animation_audio_path;
            }

            // Set exclusive mode if configured
            if (config.playback_mode === 'exclusive') {
                this.exclusiveMode = true;
                this.api.emit('milestone:exclusive-start', {});

                // Reset exclusive mode after animation duration
                const duration = config.animation_duration || 10000; // Default 10 seconds
                setTimeout(() => {
                    this.exclusiveMode = false;
                    this.api.emit('milestone:exclusive-end', {});
                }, duration);
            }

            // Emit celebration event to overlay
            this.api.emit('milestone:celebrate', celebrationData);

            if (tier) {
                this.api.log(`🎉 ${tier.name} tier celebration triggered for ${username}: ${milestone} coins`, 'info');
            } else {
                this.api.log(`🎉 Milestone celebration triggered: ${milestone} coins`, 'info');
            }
        } catch (error) {
            this.api.log(`Error triggering celebration: ${error.message}`, 'error');
        }
    }

    checkSessionReset() {
        try {
            const db = this.api.getDatabase();
            const config = db.getMilestoneConfig();

            if (config && config.session_reset) {
                this.api.log('🔄 Session reset enabled - resetting milestone stats', 'info');
                db.resetMilestoneStats();
            }
        } catch (error) {
            this.api.log(`Error checking session reset: ${error.message}`, 'error');
        }
    }

    async destroy() {
        this.api.log('🎯 Gift Milestone Plugin destroyed', 'info');
    }
}

module.exports = GiftMilestonePlugin;
