const path = require('path');
const fs = require('fs');
const multer = require('multer');

/**
 * Emoji Rain Plugin
 *
 * Physics-based emoji rain effect for TikTok events
 * Supports custom emojis, images, and advanced physics simulation
 */
class EmojiRainPlugin {
    constructor(api) {
        this.api = api;
        // Use persistent storage in user profile directory (survives updates)
        const pluginDataDir = api.getPluginDataDir();
        this.emojiRainUploadDir = path.join(pluginDataDir, 'uploads');
        this.userMappingsPath = path.join(pluginDataDir, 'users.json');
        // Also define user_configs path for user-editable configs (survives updates)
        // Use ConfigPathManager to get persistent user_configs directory
        const configPathManager = api.getConfigPathManager();
        const persistentUserConfigsDir = configPathManager.getUserConfigsDir();
        this.userConfigMappingsPath = path.join(persistentUserConfigsDir, 'emoji-rain', 'users.json');
        this.emojiRainUpload = null;
        // Benchmark state
        this.benchmarkResults = null;
    }

    async init() {
        this.api.log('🌧️ [EMOJI RAIN] Initializing Emoji Rain Plugin...', 'info');

        // Ensure plugin data directory exists
        this.api.ensurePluginDataDir();

        // Migrate old uploads if they exist
        await this.migrateOldData();

        // Create upload directory
        if (!fs.existsSync(this.emojiRainUploadDir)) {
            fs.mkdirSync(this.emojiRainUploadDir, { recursive: true });
            this.api.log('📁 [EMOJI RAIN] Upload directory created', 'debug');
        } else {
            this.api.log('📁 [EMOJI RAIN] Upload directory exists', 'debug');
        }

        this.api.log(`📂 [EMOJI RAIN] Using persistent storage: ${this.emojiRainUploadDir}`, 'info');

        // Setup multer for file uploads
        const emojiRainStorage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.emojiRainUploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, 'emoji-' + uniqueSuffix + path.extname(file.originalname));
            }
        });

        this.emojiRainUpload = multer({
            storage: emojiRainStorage,
            limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
            fileFilter: (req, file, cb) => {
                const allowedTypes = /png|jpg|jpeg|gif|webp|svg/;
                const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
                const mimetype = allowedTypes.test(file.mimetype);

                if (mimetype && extname) {
                    return cb(null, true);
                } else {
                    cb(new Error('Only image files (PNG, JPG, GIF, WebP, SVG) are allowed!'));
                }
            }
        });

        // Register routes
        this.api.log('🛣️ [EMOJI RAIN] Registering routes...', 'debug');
        this.registerRoutes();

        // Register socket event handlers
        this.api.log('🔌 [EMOJI RAIN] Registering socket event handlers...', 'debug');
        this.registerSocketHandlers();

        // Register TikTok event handlers
        this.api.log('🎯 [EMOJI RAIN] Registering TikTok event handlers...', 'debug');
        this.registerTikTokEventHandlers();

        // Register flow actions
        this.api.log('⚡ [EMOJI RAIN] Registering flow actions...', 'debug');
        this.registerFlowActions();

        this.api.log('✅ [EMOJI RAIN] Emoji Rain Plugin initialized successfully', 'info');
    }

    /**
     * Migrate old data from app directory to user profile directory
     */
    async migrateOldData() {
        const oldUploadDir = path.join(__dirname, 'uploads');
        const oldMappingsPath = path.join(__dirname, '..', '..', 'data', 'plugins', 'emojirain', 'users.json');
        // Also check old app directory's user_configs location (before fix)
        const oldAppUserConfigsPath = path.join(__dirname, '..', '..', 'user_configs', 'emoji-rain', 'users.json');
        
        let migrated = false;

        // Migrate uploads directory
        if (fs.existsSync(oldUploadDir)) {
            const oldFiles = fs.readdirSync(oldUploadDir).filter(f => f !== '.gitkeep');
            if (oldFiles.length > 0) {
                this.api.log(`📦 [EMOJI RAIN] Migrating ${oldFiles.length} files from old upload directory...`, 'info');
                
                // Ensure new directory exists
                if (!fs.existsSync(this.emojiRainUploadDir)) {
                    fs.mkdirSync(this.emojiRainUploadDir, { recursive: true });
                }
                
                // Copy files
                for (const file of oldFiles) {
                    const oldPath = path.join(oldUploadDir, file);
                    const newPath = path.join(this.emojiRainUploadDir, file);
                    if (!fs.existsSync(newPath)) {
                        fs.copyFileSync(oldPath, newPath);
                        migrated = true;
                    }
                }
                
                if (migrated) {
                    this.api.log(`✅ [EMOJI RAIN] Migrated uploads to: ${this.emojiRainUploadDir}`, 'info');
                }
            }
        }

        // Migrate user mappings - Check multiple sources in priority order
        if (!fs.existsSync(this.userMappingsPath)) {
            // Ensure directory exists for target
            const userMappingsDir = path.dirname(this.userMappingsPath);
            if (!fs.existsSync(userMappingsDir)) {
                fs.mkdirSync(userMappingsDir, { recursive: true });
            }

            // Priority 1: Check persistent user_configs directory (user-editable, survives updates)
            if (fs.existsSync(this.userConfigMappingsPath)) {
                this.api.log('📦 [EMOJI RAIN] Migrating user mappings from persistent user_configs...', 'info');
                fs.copyFileSync(this.userConfigMappingsPath, this.userMappingsPath);
                this.api.log(`✅ [EMOJI RAIN] Migrated user mappings from user_configs to: ${this.userMappingsPath}`, 'info');
                migrated = true;
            }
            // Priority 2: Check old app directory's user_configs (before fix)
            else if (fs.existsSync(oldAppUserConfigsPath)) {
                this.api.log('📦 [EMOJI RAIN] Migrating user mappings from old app user_configs directory...', 'info');
                fs.copyFileSync(oldAppUserConfigsPath, this.userMappingsPath);
                // Also copy to new persistent user_configs location
                const userConfigMappingsDir = path.dirname(this.userConfigMappingsPath);
                if (!fs.existsSync(userConfigMappingsDir)) {
                    fs.mkdirSync(userConfigMappingsDir, { recursive: true });
                }
                fs.copyFileSync(oldAppUserConfigsPath, this.userConfigMappingsPath);
                this.api.log(`✅ [EMOJI RAIN] Migrated user mappings from old app user_configs to: ${this.userMappingsPath}`, 'info');
                migrated = true;
            }
            // Priority 3: Check old data directory (legacy location)
            else if (fs.existsSync(oldMappingsPath)) {
                this.api.log('📦 [EMOJI RAIN] Migrating user mappings from data directory...', 'info');
                fs.copyFileSync(oldMappingsPath, this.userMappingsPath);
                this.api.log(`✅ [EMOJI RAIN] Migrated user mappings from data directory to: ${this.userMappingsPath}`, 'info');
                migrated = true;
            }
        } else {
            // If persistent location exists, check if user_configs has newer data
            if (fs.existsSync(this.userConfigMappingsPath)) {
                const persistentStats = fs.statSync(this.userMappingsPath);
                const userConfigStats = fs.statSync(this.userConfigMappingsPath);
                
                // If user_configs version is newer, update the persistent location
                if (userConfigStats.mtime > persistentStats.mtime) {
                    this.api.log('📦 [EMOJI RAIN] Updating user mappings from newer user_configs version...', 'info');
                    fs.copyFileSync(this.userConfigMappingsPath, this.userMappingsPath);
                    this.api.log(`✅ [EMOJI RAIN] Updated user mappings from user_configs to: ${this.userMappingsPath}`, 'info');
                    migrated = true;
                }
            }
            
            // Also check old app directory's user_configs for migration to persistent location
            if (fs.existsSync(oldAppUserConfigsPath)) {
                const persistentStats = fs.statSync(this.userMappingsPath);
                const oldAppStats = fs.statSync(oldAppUserConfigsPath);
                
                // If old app version is newer, migrate it to both locations
                if (oldAppStats.mtime > persistentStats.mtime) {
                    this.api.log('📦 [EMOJI RAIN] Migrating newer user mappings from old app user_configs...', 'info');
                    fs.copyFileSync(oldAppUserConfigsPath, this.userMappingsPath);
                    // Also copy to new persistent user_configs location
                    const userConfigMappingsDir = path.dirname(this.userConfigMappingsPath);
                    if (!fs.existsSync(userConfigMappingsDir)) {
                        fs.mkdirSync(userConfigMappingsDir, { recursive: true });
                    }
                    fs.copyFileSync(oldAppUserConfigsPath, this.userConfigMappingsPath);
                    this.api.log(`✅ [EMOJI RAIN] Migrated user mappings from old app user_configs to persistent storage`, 'info');
                    migrated = true;
                }
            }
        }

        if (migrated) {
            this.api.log('💡 [EMOJI RAIN] Old files are kept for safety. You can manually delete them after verifying the migration.', 'info');
        }
    }

    registerRoutes() {
        // Serve plugin UI (configuration page)
        this.api.registerRoute('get', '/emoji-rain/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui.html');
            res.sendFile(uiPath);
        });

        // Serve plugin overlay
        this.api.registerRoute('get', '/emoji-rain/overlay', (req, res) => {
            const overlayPath = path.join(__dirname, 'overlay.html');
            res.sendFile(overlayPath);
        });

        // Serve OBS HUD overlay (high-quality, fixed resolution)
        this.api.registerRoute('get', '/emoji-rain/obs-hud', (req, res) => {
            const obsHudPath = path.join(__dirname, 'obs-hud.html');
            res.sendFile(obsHudPath);
        });

        // Serve uploaded emoji images
        this.api.registerRoute('get', '/emoji-rain/uploads/:filename', (req, res) => {
            const filename = req.params.filename;
            const filePath = path.join(this.emojiRainUploadDir, filename);

            if (fs.existsSync(filePath)) {
                res.sendFile(filePath);
            } else {
                res.status(404).json({ success: false, error: 'File not found' });
            }
        });

        // Get emoji rain config
        this.api.registerRoute('get', '/api/emoji-rain/config', (req, res) => {
            try {
                this.api.log('📥 [EMOJI RAIN] GET /api/emoji-rain/config - Request received', 'debug');
                const db = this.api.getDatabase();
                this.api.log('📥 [EMOJI RAIN] Database instance retrieved', 'debug');

                const config = db.getEmojiRainConfig();
                this.api.log(`📥 [EMOJI RAIN] Config retrieved from DB: ${JSON.stringify(config)}`, 'debug');
                this.api.log(`📥 [EMOJI RAIN] Config.enabled: ${config.enabled}`, 'debug');
                this.api.log(`📥 [EMOJI RAIN] Config.emoji_set: ${JSON.stringify(config.emoji_set)}`, 'debug');
                this.api.log(`📥 [EMOJI RAIN] Config.emoji_set type: ${typeof config.emoji_set}, isArray: ${Array.isArray(config.emoji_set)}`, 'debug');

                res.json({ success: true, config });
                this.api.log('✅ [EMOJI RAIN] Config sent to client successfully', 'debug');
            } catch (error) {
                this.api.log(`❌ [EMOJI RAIN] Error getting emoji rain config: ${error.message}`, 'error');
                this.api.log(`❌ [EMOJI RAIN] Error stack: ${error.stack}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update emoji rain config
        this.api.registerRoute('post', '/api/emoji-rain/config', (req, res) => {
            const { config, enabled } = req.body;

            if (!config) {
                return res.status(400).json({ success: false, error: 'config is required' });
            }

            try {
                const db = this.api.getDatabase();
                db.updateEmojiRainConfig(config, enabled !== undefined ? enabled : null);
                this.api.log('🌧️ Emoji rain configuration updated', 'info');

                // Notify overlays about config change
                this.api.emit('emoji-rain:config-update', { config, enabled });

                res.json({ success: true, message: 'Emoji rain configuration updated' });
            } catch (error) {
                this.api.log(`Error updating emoji rain config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get emoji rain status
        this.api.registerRoute('get', '/api/emoji-rain/status', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const config = db.getEmojiRainConfig();
                res.json({ success: true, enabled: config.enabled });
            } catch (error) {
                this.api.log(`Error getting emoji rain status: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Toggle emoji rain
        this.api.registerRoute('post', '/api/emoji-rain/toggle', (req, res) => {
            const { enabled } = req.body;

            if (enabled === undefined) {
                return res.status(400).json({ success: false, error: 'enabled is required' });
            }

            try {
                const db = this.api.getDatabase();
                db.toggleEmojiRain(enabled);
                this.api.log(`🌧️ Emoji rain ${enabled ? 'enabled' : 'disabled'}`, 'info');

                // Notify overlays about toggle
                this.api.emit('emoji-rain:toggle', { enabled });

                res.json({ success: true, message: `Emoji rain ${enabled ? 'enabled' : 'disabled'}` });
            } catch (error) {
                this.api.log(`Error toggling emoji rain: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test emoji rain
        this.api.registerRoute('post', '/api/emoji-rain/test', (req, res) => {
            const { count, emoji, x, y } = req.body;

            try {
                const db = this.api.getDatabase();
                const config = db.getEmojiRainConfig();

                if (!config.enabled) {
                    return res.status(400).json({ success: false, error: 'Emoji rain is disabled' });
                }

                // Create test spawn data
                const testData = {
                    count: parseInt(count) || 1,
                    emoji: emoji || config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)],
                    x: parseFloat(x) || Math.random(),
                    y: parseFloat(y) || 0,
                    username: 'Test User',
                    reason: 'test'
                };

                this.api.log(`🧪 Testing emoji rain: ${testData.count}x ${testData.emoji}`, 'info');

                // Emit to overlay
                this.api.emit('emoji-rain:spawn', testData);

                res.json({ success: true, message: 'Test emojis spawned', data: testData });
            } catch (error) {
                this.api.log(`Error testing emoji rain: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Upload custom emoji rain image
        this.api.registerRoute('post', '/api/emoji-rain/upload', (req, res) => {
            this.emojiRainUpload.single('image')(req, res, (err) => {
                if (err) {
                    this.api.log(`Error uploading emoji rain image: ${err.message}`, 'error');
                    return res.status(500).json({ success: false, error: err.message });
                }

                try {
                    if (!req.file) {
                        return res.status(400).json({ success: false, error: 'No file uploaded' });
                    }

                    const fileUrl = `/emoji-rain/uploads/${req.file.filename}`;
                    this.api.log(`📤 Emoji rain image uploaded: ${req.file.filename}`, 'info');

                    res.json({
                        success: true,
                        message: 'Image uploaded successfully',
                        url: fileUrl,
                        filename: req.file.filename,
                        size: req.file.size
                    });
                } catch (error) {
                    this.api.log(`Error uploading emoji rain image: ${error.message}`, 'error');
                    res.status(500).json({ success: false, error: error.message });
                }
            });
        });

        // Get list of uploaded emoji rain images
        this.api.registerRoute('get', '/api/emoji-rain/images', (req, res) => {
            try {
                const files = fs.readdirSync(this.emojiRainUploadDir)
                    .filter(f => f !== '.gitkeep')
                    .map(filename => ({
                        filename,
                        url: `/emoji-rain/uploads/${filename}`,
                        size: fs.statSync(path.join(this.emojiRainUploadDir, filename)).size,
                        created: fs.statSync(path.join(this.emojiRainUploadDir, filename)).birthtime
                    }));

                res.json({ success: true, images: files });
            } catch (error) {
                this.api.log(`Error listing emoji rain images: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete uploaded emoji rain image
        this.api.registerRoute('delete', '/api/emoji-rain/images/:filename', (req, res) => {
            try {
                const filename = req.params.filename;
                const filePath = path.join(this.emojiRainUploadDir, filename);

                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ success: false, error: 'File not found' });
                }

                fs.unlinkSync(filePath);
                this.api.log(`🗑️ Deleted emoji rain image: ${filename}`, 'info');

                res.json({ success: true, message: 'Image deleted successfully' });
            } catch (error) {
                this.api.log(`Error deleting emoji rain image: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get user emoji mappings
        this.api.registerRoute('get', '/api/emoji-rain/user-mappings', (req, res) => {
            try {
                if (fs.existsSync(this.userMappingsPath)) {
                    const mappings = JSON.parse(fs.readFileSync(this.userMappingsPath, 'utf8'));
                    res.json({ success: true, mappings });
                } else {
                    res.json({ success: true, mappings: {} });
                }
            } catch (error) {
                this.api.log(`Error getting user emoji mappings: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update user emoji mappings
        this.api.registerRoute('post', '/api/emoji-rain/user-mappings', (req, res) => {
            try {
                const { mappings } = req.body;
                if (!mappings) {
                    return res.status(400).json({ success: false, error: 'mappings is required' });
                }

                // Save to persistent storage (primary location, survives updates)
                const userMappingsDir = path.dirname(this.userMappingsPath);
                if (!fs.existsSync(userMappingsDir)) {
                    fs.mkdirSync(userMappingsDir, { recursive: true });
                }
                fs.writeFileSync(this.userMappingsPath, JSON.stringify(mappings, null, 2));

                // Also save to user_configs directory (user-editable, survives updates)
                const userConfigMappingsDir = path.dirname(this.userConfigMappingsPath);
                if (!fs.existsSync(userConfigMappingsDir)) {
                    fs.mkdirSync(userConfigMappingsDir, { recursive: true });
                }
                fs.writeFileSync(this.userConfigMappingsPath, JSON.stringify(mappings, null, 2));

                this.api.log(`💾 [EMOJI RAIN] User mappings saved to persistent storage and user_configs`, 'debug');

                // Notify overlays about mapping update
                this.api.emit('emoji-rain:user-mappings-update', { mappings });

                res.json({ success: true, message: 'User emoji mappings updated' });
            } catch (error) {
                this.api.log(`Error updating user emoji mappings: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Trigger emoji rain via API (for flows)
        this.api.registerRoute('post', '/api/emoji-rain/trigger', (req, res) => {
            try {
                const { emoji, count, duration, intensity, x, y, username, burst } = req.body;

                const db = this.api.getDatabase();
                const config = db.getEmojiRainConfig();

                if (!config.enabled) {
                    return res.status(400).json({ success: false, error: 'Emoji rain is disabled' });
                }

                // Create spawn data
                const spawnData = {
                    count: parseInt(count) || 10,
                    emoji: emoji || config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)],
                    x: parseFloat(x) !== undefined ? parseFloat(x) : Math.random(),
                    y: parseFloat(y) !== undefined ? parseFloat(y) : 0,
                    username: username || null,
                    burst: burst || false,
                    color: null // Will be set by user mapping or color mode
                };

                // Apply intensity multiplier if provided
                if (intensity) {
                    spawnData.count = Math.floor(spawnData.count * parseFloat(intensity));
                }

                this.api.log(`🎯 Triggering emoji rain via API: ${spawnData.count}x ${spawnData.emoji}`, 'info');

                // Emit to overlay
                this.api.emit('emoji-rain:spawn', spawnData);

                // Handle duration (spawn multiple batches over time)
                if (duration && duration > 0) {
                    const batches = Math.floor(duration / 500); // Spawn every 500ms
                    let batchCount = 0;

                    const interval = setInterval(() => {
                        batchCount++;
                        if (batchCount >= batches) {
                            clearInterval(interval);
                            return;
                        }

                        this.api.emit('emoji-rain:spawn', {
                            ...spawnData,
                            x: Math.random() // Randomize position for each batch
                        });
                    }, 500);
                }

                res.json({ success: true, message: 'Emoji rain triggered', data: spawnData });
            } catch (error) {
                this.api.log(`Error triggering emoji rain: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Benchmark routes
        // Start FPS benchmark
        this.api.registerRoute('post', '/api/emoji-rain/benchmark/start', (req, res) => {
            try {
                const { targetFPS } = req.body;
                const target = parseInt(targetFPS) || 60;
                
                this.api.log(`🔬 Starting FPS benchmark (Target: ${target} FPS)`, 'info');
                
                // Emit to all overlays to start benchmark
                this.api.emit('emoji-rain:benchmark-start', { targetFPS: target });
                
                res.json({ success: true, message: 'Benchmark started', targetFPS: target });
            } catch (error) {
                this.api.log(`Error starting benchmark: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Stop benchmark
        this.api.registerRoute('post', '/api/emoji-rain/benchmark/stop', (req, res) => {
            try {
                this.api.log('⏹️ Stopping FPS benchmark', 'info');
                
                // Emit to all overlays to stop benchmark
                this.api.emit('emoji-rain:benchmark-stop');
                
                res.json({ success: true, message: 'Benchmark stopped' });
            } catch (error) {
                this.api.log(`Error stopping benchmark: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Apply optimized settings
        this.api.registerRoute('post', '/api/emoji-rain/benchmark/apply', (req, res) => {
            try {
                const { settings } = req.body;
                
                if (!settings) {
                    return res.status(400).json({ success: false, error: 'settings is required' });
                }
                
                this.api.log('✨ Applying optimized benchmark settings', 'info');
                
                // Update config in database
                const db = this.api.getDatabase();
                const currentConfig = db.getEmojiRainConfig();
                const updatedConfig = { ...currentConfig, ...settings };
                db.updateEmojiRainConfig(updatedConfig);
                
                // Emit to overlays to apply settings
                this.api.emit('emoji-rain:benchmark-apply', { settings });
                this.api.emit('emoji-rain:config-update', { config: updatedConfig });
                
                res.json({ success: true, message: 'Optimized settings applied' });
            } catch (error) {
                this.api.log(`Error applying optimized settings: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Serve uploaded files
        const express = require('express');
        this.api.getApp().use('/plugins/emoji-rain/uploads', express.static(this.emojiRainUploadDir));

        this.api.log('✅ [EMOJI RAIN] All routes registered successfully:', 'info');
        this.api.log('   - GET  /emoji-rain/ui', 'info');
        this.api.log('   - GET  /emoji-rain/overlay', 'info');
        this.api.log('   - GET  /emoji-rain/obs-hud', 'info');
        this.api.log('   - GET  /api/emoji-rain/config', 'info');
        this.api.log('   - POST /api/emoji-rain/config', 'info');
        this.api.log('   - POST /api/emoji-rain/toggle', 'info');
        this.api.log('   - POST /api/emoji-rain/test', 'info');
        this.api.log('   - GET  /api/emoji-rain/user-mappings', 'info');
        this.api.log('   - POST /api/emoji-rain/user-mappings', 'info');
        this.api.log('   - POST /api/emoji-rain/trigger', 'info');
        this.api.log('   - POST /api/emoji-rain/benchmark/start', 'info');
        this.api.log('   - POST /api/emoji-rain/benchmark/stop', 'info');
        this.api.log('   - POST /api/emoji-rain/benchmark/apply', 'info');
    }

    registerSocketHandlers() {
        const io = this.api.getSocketIO();

        // Handle benchmark status updates from overlay
        this.api.registerSocket('emoji-rain:benchmark-status', (data) => {
            this.api.log(`📊 Benchmark status update: ${data.type}`, 'debug');
            
            if (data.type === 'complete') {
                this.benchmarkResults = data;
                this.api.log(`✅ Benchmark complete! Results: ${JSON.stringify(data.results)}`, 'info');
                if (data.optimal) {
                    this.api.log(`🎯 Optimal settings: ${data.optimal.name} (Avg FPS: ${data.optimal.avgFPS})`, 'info');
                }
            } else if (data.type === 'progress') {
                this.api.log(`🔬 Running test ${data.test}/${data.total}: ${data.name}`, 'info');
            }
            
            // Broadcast to all connected clients (for UI updates)
            io.emit('emoji-rain:benchmark-update', data);
        });

        this.api.log('✅ [EMOJI RAIN] Socket event handlers registered', 'info');
    }

    registerTikTokEventHandlers() {
        // Gift Event
        this.api.registerTikTokEvent('gift', (data) => {
            this.spawnEmojiRain('gift', data);
        });

        // Follow Event
        this.api.registerTikTokEvent('follow', (data) => {
            this.spawnEmojiRain('follow', data, 5, '💙');
        });

        // Subscribe Event
        this.api.registerTikTokEvent('subscribe', (data) => {
            this.spawnEmojiRain('subscribe', data, 8, '⭐');
        });

        // Share Event
        this.api.registerTikTokEvent('share', (data) => {
            this.spawnEmojiRain('share', data, 5, '🔄');
        });

        // Like Event
        this.api.registerTikTokEvent('like', (data) => {
            this.spawnEmojiRain('like', data);
        });

        this.api.log('✅ Emoji Rain TikTok event handlers registered', 'info');
    }

    /**
     * Spawn emojis for emoji rain effect
     * @param {string} reason - Event type (gift, like, follow, etc.)
     * @param {object} data - Event data
     * @param {number} count - Number of emojis to spawn
     * @param {string} emoji - Optional specific emoji
     */
    spawnEmojiRain(reason, data, count = null, emoji = null) {
        try {
            const db = this.api.getDatabase();
            const config = db.getEmojiRainConfig();

            if (!config.enabled) {
                return;
            }

            // Log event data for debugging
            this.api.log(`🎯 [EMOJI RAIN EVENT] Reason: ${reason}, Username: ${data.uniqueId || data.username}, Data keys: ${Object.keys(data).join(', ')}`, 'debug');

            // Calculate count based on reason if not provided
            if (!count) {
                if (reason === 'gift' && data.coins) {
                    count = config.gift_base_emojis + Math.floor(data.coins * config.gift_coin_multiplier);
                    count = Math.min(config.gift_max_emojis, count);
                } else if (reason === 'like' && data.likeCount) {
                    // BUG FIX: likeCount represents the actual like count, not a batch
                    // With divisor=10, we want: 20 likes = 2 emojis, 10 likes = 1 emoji
                    // However, if likeCount is typically 1 per event, divisor should be 1 to show each like
                    count = Math.floor(data.likeCount / config.like_count_divisor);
                    count = Math.max(config.like_min_emojis, Math.min(config.like_max_emojis, count));
                    
                    // BUG FIX LOGGING: Track like count calculation
                    console.log(`💗 [LIKE CALC] likeCount=${data.likeCount}, divisor=${config.like_count_divisor}, count=${count}, min=${config.like_min_emojis}, max=${config.like_max_emojis}`);
                } else {
                    count = 3; // Default for follow, share, subscribe
                }
            }

            // Select random emoji from config if not specified
            if (!emoji && config.emoji_set && config.emoji_set.length > 0) {
                emoji = config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)];
            }

            // Random horizontal position
            const x = Math.random();
            const y = 0;

            // Check for SuperFan level and trigger burst if enabled
            const isSuperFan = this.checkSuperFanLevel(data);
            const isBurst = isSuperFan && config.superfan_burst_enabled;

            // Emit to overlay
            // Fix: Use uniqueId (TikTok's username field) instead of username
            const username = data.uniqueId || data.username || 'Unknown';
            
            this.api.emit('emoji-rain:spawn', {
                count: count,
                emoji: emoji,
                x: x,
                y: y,
                username: username,
                reason: reason,
                burst: isBurst
            });

            this.api.log(`🌧️ Emoji rain spawned: ${count}x ${emoji} for ${reason} by ${username}${isBurst ? ' [SUPERFAN BURST]' : ''}`, 'debug');
        } catch (error) {
            this.api.log(`Error spawning emoji rain: ${error.message}`, 'error');
        }
    }

    /**
     * Check if user has SuperFan level
     * @param {object} data - Event data
     * @returns {boolean|number} - SuperFan level (1-3) or false
     */
    checkSuperFanLevel(data) {
        // Check various SuperFan indicators
        if (data.isSuperFan || data.superFan) {
            return data.superFanLevel || 1;
        }
        
        // Check badges for SuperFan status
        if (data.badges && Array.isArray(data.badges)) {
            const superFanBadge = data.badges.find(b => 
                b.type === 'superfan' || b.name?.toLowerCase().includes('superfan')
            );
            if (superFanBadge) {
                return superFanBadge.level || 1;
            }
        }

        return false;
    }

    /**
     * Register flow actions for automation
     */
    registerFlowActions() {
        if (!this.api.registerFlowAction) {
            this.api.log('⚠️ Flow system not available, skipping flow action registration', 'warn');
            return;
        }

        // Register "Trigger Emoji Rain" action
        this.api.registerFlowAction('emoji_rain_trigger', {
            name: 'Trigger Emoji Rain',
            description: 'Spawn emoji rain with custom parameters',
            icon: '🌧️',
            category: 'effects',
            parameters: {
                emoji: {
                    type: 'text',
                    label: 'Emoji/Text',
                    description: 'Emoji or text to spawn (leave empty for random)',
                    default: ''
                },
                count: {
                    type: 'number',
                    label: 'Count',
                    description: 'Number of emojis to spawn',
                    default: 10,
                    min: 1,
                    max: 100
                },
                duration: {
                    type: 'number',
                    label: 'Duration (ms)',
                    description: 'Duration of the rain effect (0 = single burst)',
                    default: 0,
                    min: 0,
                    max: 10000
                },
                intensity: {
                    type: 'number',
                    label: 'Intensity',
                    description: 'Multiplier for emoji count',
                    default: 1.0,
                    min: 0.1,
                    max: 5.0,
                    step: 0.1
                },
                burst: {
                    type: 'boolean',
                    label: 'Burst Mode',
                    description: 'Enable SuperFan-style burst',
                    default: false
                }
            },
            execute: async (params, eventData) => {
                await this.executeFlowTrigger(params, eventData);
            }
        });

        this.api.log('✅ Flow actions registered for Emoji Rain', 'info');
    }

    /**
     * Execute emoji rain trigger from flow
     */
    async executeFlowTrigger(params, eventData) {
        try {
            const response = await fetch('http://localhost:3000/api/emoji-rain/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    emoji: params.emoji || null,
                    count: params.count || 10,
                    duration: params.duration || 0,
                    intensity: params.intensity || 1.0,
                    username: eventData.username || eventData.uniqueId || null,
                    burst: params.burst || false
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.api.log('✅ Emoji rain triggered via flow', 'debug');
        } catch (error) {
            this.api.log(`❌ Error executing emoji rain flow: ${error.message}`, 'error');
        }
    }

    async destroy() {
        this.api.log('🌧️ Emoji Rain Plugin destroyed', 'info');
    }
}

module.exports = EmojiRainPlugin;
