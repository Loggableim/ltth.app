/**
 * WebGPU Emoji Rain Plugin
 *
 * GPU-accelerated emoji rain effect using WebGPU rendering.
 * This is a 1:1 functional port of the original emoji-rain plugin,
 * using WebGPU for better performance instead of Matter.js/Canvas.
 * 
 * Features:
 * - Custom emoji sets and user-specific mappings
 * - Custom image upload support
 * - Gift/Like/Follow/Share event integration with proper calculations
 * - SuperFan burst effects
 * - Database-backed configuration
 * - Flow system integration
 * - Localization support
 * 
 * Note: WebGPU rendering happens client-side in the overlay HTML.
 * This plugin manages configuration, events, and file uploads.
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');

class WebGPUEmojiRainPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();

    // Use persistent storage in user profile directory (survives updates)
    const pluginDataDir = api.getPluginDataDir();
    this.uploadDir = path.join(pluginDataDir, 'uploads');
    this.userMappingsPath = path.join(pluginDataDir, 'users.json');
    
    // Also define user_configs path for user-editable configs (survives updates)
    const configPathManager = api.getConfigPathManager();
    const persistentUserConfigsDir = configPathManager.getUserConfigsDir();
    this.userConfigMappingsPath = path.join(persistentUserConfigsDir, 'webgpu-emoji-rain', 'users.json');
    
    this.upload = null;
  }

  async init() {
    this.api.log('🌧️ [WebGPU Emoji Rain] Initializing Emoji Rain Plugin...', 'info');

    // Ensure plugin data directory exists
    this.api.ensurePluginDataDir();

    // Migrate old data if it exists
    await this.migrateOldData();

    // Create upload directory
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.api.log('📁 [WebGPU Emoji Rain] Upload directory created', 'debug');
    } else {
      this.api.log('📁 [WebGPU Emoji Rain] Upload directory exists', 'debug');
    }

    this.api.log(`📂 [WebGPU Emoji Rain] Using persistent storage: ${this.uploadDir}`, 'info');

    // Setup multer for file uploads
    this.setupMulter();

    // Register routes
    this.api.log('🛣️ [WebGPU Emoji Rain] Registering routes...', 'debug');
    this.registerRoutes();

    // Register TikTok event handlers
    this.api.log('🎯 [WebGPU Emoji Rain] Registering TikTok event handlers...', 'debug');
    this.registerTikTokEventHandlers();

    // Register flow actions
    this.api.log('⚡ [WebGPU Emoji Rain] Registering flow actions...', 'debug');
    this.registerFlowActions();

    this.api.log('✅ [WebGPU Emoji Rain] Plugin initialized successfully', 'info');
  }

  /**
   * Setup multer for file uploads
   */
  setupMulter() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'emoji-' + uniqueSuffix + path.extname(file.originalname));
      }
    });

    this.upload = multer({
      storage: storage,
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
  }

  /**
   * Migrate old data from app directory or emoji-rain plugin
   */
  async migrateOldData() {
    // Check if original emoji-rain plugin uploads exist
    const oldEmojiRainUploadDir = path.join(__dirname, '..', 'emoji-rain', 'uploads');
    const oldDataPluginsDir = path.join(__dirname, '..', '..', 'data', 'plugins', 'emojirain', 'users.json');
    const oldAppUserConfigsPath = path.join(__dirname, '..', '..', 'user_configs', 'emoji-rain', 'users.json');
    
    let migrated = false;

    // Migrate uploads from original emoji-rain plugin
    if (fs.existsSync(oldEmojiRainUploadDir)) {
      const oldFiles = fs.readdirSync(oldEmojiRainUploadDir).filter(f => f !== '.gitkeep');
      if (oldFiles.length > 0) {
        this.api.log(`📦 [WebGPU Emoji Rain] Migrating ${oldFiles.length} files from emoji-rain plugin...`, 'info');
        
        if (!fs.existsSync(this.uploadDir)) {
          fs.mkdirSync(this.uploadDir, { recursive: true });
        }
        
        for (const file of oldFiles) {
          const oldPath = path.join(oldEmojiRainUploadDir, file);
          const newPath = path.join(this.uploadDir, file);
          if (!fs.existsSync(newPath)) {
            fs.copyFileSync(oldPath, newPath);
            migrated = true;
          }
        }
        
        if (migrated) {
          this.api.log(`✅ [WebGPU Emoji Rain] Migrated uploads from emoji-rain`, 'info');
        }
      }
    }

    // Migrate user mappings
    if (!fs.existsSync(this.userMappingsPath)) {
      const userMappingsDir = path.dirname(this.userMappingsPath);
      if (!fs.existsSync(userMappingsDir)) {
        fs.mkdirSync(userMappingsDir, { recursive: true });
      }

      // Priority 1: persistent user_configs
      if (fs.existsSync(this.userConfigMappingsPath)) {
        this.api.log('📦 [WebGPU Emoji Rain] Migrating user mappings from persistent user_configs...', 'info');
        fs.copyFileSync(this.userConfigMappingsPath, this.userMappingsPath);
        this.api.log(`✅ [WebGPU Emoji Rain] Migrated user mappings from user_configs`, 'info');
        migrated = true;
      }
      // Priority 2: old app user_configs
      else if (fs.existsSync(oldAppUserConfigsPath)) {
        this.api.log('📦 [WebGPU Emoji Rain] Migrating user mappings from old app user_configs...', 'info');
        fs.copyFileSync(oldAppUserConfigsPath, this.userMappingsPath);
        const userConfigMappingsDir = path.dirname(this.userConfigMappingsPath);
        if (!fs.existsSync(userConfigMappingsDir)) {
          fs.mkdirSync(userConfigMappingsDir, { recursive: true });
        }
        fs.copyFileSync(oldAppUserConfigsPath, this.userConfigMappingsPath);
        this.api.log(`✅ [WebGPU Emoji Rain] Migrated user mappings from old app user_configs`, 'info');
        migrated = true;
      }
      // Priority 3: original emoji-rain data directory
      else if (fs.existsSync(oldDataPluginsDir)) {
        this.api.log('📦 [WebGPU Emoji Rain] Migrating user mappings from data directory...', 'info');
        fs.copyFileSync(oldDataPluginsDir, this.userMappingsPath);
        this.api.log(`✅ [WebGPU Emoji Rain] Migrated user mappings from emoji-rain plugin`, 'info');
        migrated = true;
      }
    } else {
      // If persistent location exists, check if user_configs has newer data
      if (fs.existsSync(this.userConfigMappingsPath)) {
        const persistentStats = fs.statSync(this.userMappingsPath);
        const userConfigStats = fs.statSync(this.userConfigMappingsPath);
        
        if (userConfigStats.mtime > persistentStats.mtime) {
          this.api.log('📦 [WebGPU Emoji Rain] Updating user mappings from newer user_configs version...', 'info');
          fs.copyFileSync(this.userConfigMappingsPath, this.userMappingsPath);
          this.api.log(`✅ [WebGPU Emoji Rain] Updated user mappings from user_configs`, 'info');
          migrated = true;
        }
      }
    }

    if (migrated) {
      this.api.log('💡 [WebGPU Emoji Rain] Old files are kept for safety', 'info');
    }
  }

  registerRoutes() {
    // Serve plugin UI (configuration page)
    this.api.registerRoute('get', '/webgpu-emoji-rain/ui', (req, res) => {
      const uiPath = path.join(__dirname, 'ui.html');
      res.sendFile(uiPath);
    });

    // Serve plugin overlay
    this.api.registerRoute('get', '/webgpu-emoji-rain/overlay', (req, res) => {
      const overlayPath = path.join(__dirname, 'overlay.html');
      res.sendFile(overlayPath);
    });

    // Serve OBS HUD overlay (high-quality, fixed resolution)
    this.api.registerRoute('get', '/webgpu-emoji-rain/obs-hud', (req, res) => {
      const obsHudPath = path.join(__dirname, 'obs-hud.html');
      if (fs.existsSync(obsHudPath)) {
        res.sendFile(obsHudPath);
      } else {
        // Fallback to regular overlay
        res.sendFile(path.join(__dirname, 'overlay.html'));
      }
    });

    // Serve uploaded emoji images
    this.api.registerRoute('get', '/webgpu-emoji-rain/uploads/:filename', (req, res) => {
      const filename = req.params.filename;
      const filePath = path.join(this.uploadDir, filename);

      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        res.status(404).json({ success: false, error: 'File not found' });
      }
    });

    // Get emoji rain config (from database)
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/config', (req, res) => {
      try {
        this.api.log('📥 [WebGPU Emoji Rain] GET /api/webgpu-emoji-rain/config', 'debug');
        const db = this.api.getDatabase();
        const config = db.getEmojiRainConfig();
        this.api.log(`📥 [WebGPU Emoji Rain] Config retrieved from DB`, 'debug');
        res.json({ success: true, config });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error getting config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update emoji rain config
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/config', (req, res) => {
      const { config, enabled } = req.body;

      if (!config) {
        return res.status(400).json({ success: false, error: 'config is required' });
      }

      try {
        const db = this.api.getDatabase();
        db.updateEmojiRainConfig(config, enabled !== undefined ? enabled : null);
        this.api.log('🌧️ WebGPU Emoji rain configuration updated', 'info');

        // Notify overlays about config change
        this.api.emit('webgpu-emoji-rain:config-update', { config, enabled });

        res.json({ success: true, message: 'Emoji rain configuration updated' });
      } catch (error) {
        this.api.log(`Error updating emoji rain config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get emoji rain status
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/status', (req, res) => {
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
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/toggle', (req, res) => {
      const { enabled } = req.body;

      if (enabled === undefined) {
        return res.status(400).json({ success: false, error: 'enabled is required' });
      }

      try {
        const db = this.api.getDatabase();
        db.toggleEmojiRain(enabled);
        this.api.log(`🌧️ WebGPU Emoji rain ${enabled ? 'enabled' : 'disabled'}`, 'info');

        // Notify overlays about toggle
        this.api.emit('webgpu-emoji-rain:toggle', { enabled });

        res.json({ success: true, message: `Emoji rain ${enabled ? 'enabled' : 'disabled'}` });
      } catch (error) {
        this.api.log(`Error toggling emoji rain: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test emoji rain
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/test', (req, res) => {
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

        this.api.log(`🧪 Testing WebGPU emoji rain: ${testData.count}x ${testData.emoji}`, 'info');

        // Emit to overlay
        this.api.emit('webgpu-emoji-rain:spawn', testData);

        res.json({ success: true, message: 'Test emojis spawned', data: testData });
      } catch (error) {
        this.api.log(`Error testing emoji rain: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Upload custom emoji rain image
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/upload', (req, res) => {
      this.upload.single('image')(req, res, (err) => {
        if (err) {
          this.api.log(`Error uploading emoji rain image: ${err.message}`, 'error');
          return res.status(500).json({ success: false, error: err.message });
        }

        try {
          if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
          }

          const fileUrl = `/webgpu-emoji-rain/uploads/${req.file.filename}`;
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
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/images', (req, res) => {
      try {
        const files = fs.readdirSync(this.uploadDir)
          .filter(f => f !== '.gitkeep')
          .map(filename => ({
            filename,
            url: `/webgpu-emoji-rain/uploads/${filename}`,
            size: fs.statSync(path.join(this.uploadDir, filename)).size,
            created: fs.statSync(path.join(this.uploadDir, filename)).birthtime
          }));

        res.json({ success: true, images: files });
      } catch (error) {
        this.api.log(`Error listing emoji rain images: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete uploaded emoji rain image
    this.api.registerRoute('delete', '/api/webgpu-emoji-rain/images/:filename', (req, res) => {
      try {
        const filename = req.params.filename;
        const filePath = path.join(this.uploadDir, filename);

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
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/user-mappings', (req, res) => {
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
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/user-mappings', (req, res) => {
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

        this.api.log(`💾 [WebGPU Emoji Rain] User mappings saved`, 'debug');

        // Notify overlays about mapping update
        this.api.emit('webgpu-emoji-rain:user-mappings-update', { mappings });

        res.json({ success: true, message: 'User emoji mappings updated' });
      } catch (error) {
        this.api.log(`Error updating user emoji mappings: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Trigger emoji rain via API (for flows)
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/trigger', (req, res) => {
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

        this.api.log(`🎯 Triggering WebGPU emoji rain via API: ${spawnData.count}x ${spawnData.emoji}`, 'info');

        // Emit to overlay
        this.api.emit('webgpu-emoji-rain:spawn', spawnData);

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

            this.api.emit('webgpu-emoji-rain:spawn', {
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

    // Serve uploaded files
    const express = require('express');
    this.api.getApp().use('/plugins/webgpu-emoji-rain/uploads', express.static(this.uploadDir));

    this.api.log('✅ [WebGPU Emoji Rain] All routes registered successfully', 'info');
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

    this.api.log('✅ WebGPU Emoji Rain TikTok event handlers registered', 'info');
  }

  /**
   * Spawn emojis for emoji rain effect (matches original emoji-rain logic)
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
      this.api.log(`🎯 [WebGPU Emoji Rain EVENT] Reason: ${reason}, Username: ${data.uniqueId || data.username}`, 'debug');

      // Calculate count based on reason if not provided (matching original logic)
      if (!count) {
        if (reason === 'gift' && data.coins) {
          count = config.gift_base_emojis + Math.floor(data.coins * config.gift_coin_multiplier);
          count = Math.min(config.gift_max_emojis, count);
        } else if (reason === 'like' && data.likeCount) {
          count = Math.floor(data.likeCount / config.like_count_divisor);
          count = Math.max(config.like_min_emojis, Math.min(config.like_max_emojis, count));
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
      const username = data.uniqueId || data.username || 'Unknown';
      
      this.api.emit('webgpu-emoji-rain:spawn', {
        count: count,
        emoji: emoji,
        x: x,
        y: y,
        username: username,
        reason: reason,
        burst: isBurst
      });

      this.api.log(`🌧️ WebGPU Emoji rain spawned: ${count}x ${emoji} for ${reason} by ${username}${isBurst ? ' [SUPERFAN BURST]' : ''}`, 'debug');
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

    // Register "Trigger WebGPU Emoji Rain" action
    this.api.registerFlowAction('webgpu_emoji_rain_trigger', {
      name: 'Trigger WebGPU Emoji Rain',
      description: 'Spawn GPU-accelerated emoji rain with custom parameters',
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

    this.api.log('✅ Flow actions registered for WebGPU Emoji Rain', 'info');
  }

  /**
   * Execute emoji rain trigger from flow
   */
  async executeFlowTrigger(params, eventData) {
    try {
      // Use relative URL for better portability
      const response = await fetch('/api/webgpu-emoji-rain/trigger', {
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

      this.api.log('✅ WebGPU Emoji rain triggered via flow', 'debug');
    } catch (error) {
      this.api.log(`❌ Error executing emoji rain flow: ${error.message}`, 'error');
    }
  }

  async destroy() {
    this.api.log('🌧️ WebGPU Emoji Rain Plugin destroyed', 'info');
  }
}

module.exports = WebGPUEmojiRainPlugin;
