/**
 * WebGPU Emoji Rain Plugin - Enhanced with GCCE Integration
 *
 * GPU-accelerated emoji rain effect using WebGPU rendering with comprehensive features:
 * - GCCE chat command integration (!rain, !emoji, !beans, !storm, !rainstop)
 * - Preset system with configurable profiles
 * - Advanced overlay controls (pause/resume/clear/theme/speed/opacity/bounding-box)
 * - Enhanced upload handling with validation and limits
 * - Superfan/coins-scaled intensity
 * - Anti-spam protection and rate limiting
 * - Telemetry and debug features
 * - Flow system integration
 * - Localization support
 * 
 * Note: WebGPU rendering happens client-side in the overlay HTML.
 * This plugin manages configuration, events, file uploads, and commands.
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { createDefaultWebGPUConfig, normalizeWebGPUConfig } = require('./lib/webgpu-config');
delete require.cache[require.resolve('./lib/avatar-proxy')];
const { MAX_BYTES: AVATAR_PROXY_MAX_BYTES, fetchAllowedAvatar } = require('./lib/avatar-proxy');

class WebGPUEmojiRainPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();

    // Use persistent storage in user profile directory (survives updates)
    // v3 is intentionally isolated from the obsolete renderer's persisted
    // files. The old data remains untouched and is adopted by EmojiRain.
    const pluginDataDir = path.join(api.getPluginDataDir(), 'v3');
    this.uploadDir = path.join(pluginDataDir, 'uploads');
    this.userMappingsPath = path.join(pluginDataDir, 'users.json');
    this.presetsPath = path.join(pluginDataDir, 'presets.json');
    
    // Also define user_configs path for user-editable configs (survives updates)
    const configPathManager = api.getConfigPathManager();
    const persistentUserConfigsDir = configPathManager.getUserConfigsDir();
    this.userConfigMappingsPath = path.join(persistentUserConfigsDir, 'webgpu-emoji-rain', 'v3', 'users.json');
    this.runtimeConfig = null;
    
    this.upload = null;
    
    // GCCE integration
    this.gcce = null;
    
    // Anti-spam and rate limiting
    this.globalTriggerCount = 0;
    this.globalTriggerWindow = 30000; // 30 seconds
    this.globalMaxTriggers = 50; // Max 50 triggers per 30s
    this.userCooldowns = new Map(); // username -> last trigger timestamp
    this.defaultUserCooldown = 5000; // 5 seconds
    this.defaultGlobalCooldown = 1000; // 1 second between any triggers
    this.lastGlobalTrigger = 0;
    
    // Telemetry
    this.metrics = {
      totalTriggers: 0,
      commandTriggers: 0,
      eventTriggers: 0,
      flowTriggers: 0,
      droppedEvents: 0,
      totalEmojisSpawned: 0,
      avgCount: 0,
      avgIntensity: 0,
      lastError: null,
      lastErrorTime: null
    };
    
    // Upload limits per user
    this.userUploadCounts = new Map();
    this.maxUploadsPerUser = 10;
    
    // Overlay state
    this.overlayState = {
      paused: false,
      theme: 'default',
      opacity: 1.0,
      speed: 1.0,
      boundingBox: { x: 0, y: 0, width: 1, height: 1 }
    };
    this.rendererMetrics = {
      backend: 'webgpu',
      state: 'offline',
      fps: 0,
      frameTimeMs: 0,
      activeParticles: 0,
      droppedParticles: 0,
      atlasEntries: 0,
      resolution: null,
      adapter: null
    };
    
    // Batch spawn queue for performance
    this.spawnQueue = [];
    this.spawnBatchSize = 10;
    this.maxSpawnQueueSize = 1000;
    this.spawnBatchInterval = null;
    this.globalTriggerResetInterval = null;
    this.durationIntervals = new Set();
    
    // Debug mode
    this.debugMode = false;
    this.debugLogCount = 0;
    this.debugLogLimit = 100; // Rate limit debug logs

    // Heart balloons: stable per-user colors for like events
    this.heartBalloonUserColors = new Map();
    this.heartBalloonColorIndex = 0;
    this.heartBalloonPalette = [
      '#ff4d8d',
      '#ff6b6b',
      '#ff9f43',
      '#feca57',
      '#1dd1a1',
      '#48dbfb',
      '#54a0ff',
      '#5f27cd',
      '#c56cf0',
      '#ff7eb3'
    ];
    this.heartBalloonColorPool = this.createHeartBalloonColorPool();
    this.lastHeartBalloonStreamIdentity = null;
  }

  async init() {
    this.api.log('🌧️ [WebGPU Emoji Rain] Initializing Enhanced Emoji Rain Plugin...', 'info');

    // Ensure plugin data directory exists
    this.api.ensurePluginDataDir();

    // WebGPU EmojiRain v3 deliberately starts from its own defaults.
    this.runtimeConfig = this.loadRuntimeConfig();

    // Create upload directory
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.api.log('📁 [WebGPU Emoji Rain] Upload directory created', 'debug');
    } else {
      this.api.log('📁 [WebGPU Emoji Rain] Upload directory exists', 'debug');
    }

    this.api.log(`📂 [WebGPU Emoji Rain] Using persistent storage: ${this.uploadDir}`, 'info');

    // Initialize presets file if not exists
    if (!fs.existsSync(this.presetsPath)) {
      this.savePresets(this.getDefaultPresets());
      this.api.log('📋 [WebGPU Emoji Rain] Default presets initialized', 'info');
    }

    // Setup multer for file uploads
    this.setupMulter();

    // Register routes
    this.api.log('🛣️ [WebGPU Emoji Rain] Registering routes...', 'debug');
    this.registerRoutes();
    this.registerRendererTelemetry();

    // Register TikTok event handlers
    this.api.log('🎯 [WebGPU Emoji Rain] Registering TikTok event handlers...', 'debug');
    this.registerTikTokEventHandlers();

    // Register flow actions
    this.api.log('⚡ [WebGPU Emoji Rain] Registering flow actions...', 'debug');
    this.registerFlowActions();
    
    // Integrate with GCCE
    this.api.log('🎮 [WebGPU Emoji Rain] Integrating with GCCE...', 'debug');
    await this.integrateWithGCCE();
    
    // Start spawn batch processor
    this.startSpawnBatchProcessor();
    
    // Reset global trigger counter periodically
    this.globalTriggerResetInterval = setInterval(() => {
      this.globalTriggerCount = 0;
    }, this.globalTriggerWindow);

    this.api.log('✅ [WebGPU Emoji Rain] Plugin initialized successfully with GCCE integration', 'info');
  }

  loadRuntimeConfig() {
    const stored = typeof this.api.getConfig === 'function'
      ? this.api.getConfig('v3-config')
      : this.api.getDatabase?.().getEmojiRainConfig?.() || null;
    const normalized = normalizeWebGPUConfig(stored || createDefaultWebGPUConfig());
    if (!stored && typeof this.api.setConfig === 'function') this.api.setConfig('v3-config', normalized);
    return normalized;
  }

  getRuntimeConfig() {
    if (!this.runtimeConfig) this.runtimeConfig = this.loadRuntimeConfig();
    return { ...this.runtimeConfig };
  }

  updateRuntimeConfig(config = {}, enabled = null) {
    const next = normalizeWebGPUConfig({
      ...this.getRuntimeConfig(),
      ...(config && typeof config === 'object' ? config : {}),
      ...(enabled === null ? {} : { enabled: Boolean(enabled) })
    });
    this.runtimeConfig = next;
    if (typeof this.api.setConfig === 'function') this.api.setConfig('v3-config', next);
    return { ...next };
  }

  toggleRuntimeEnabled(enabled) {
    return this.updateRuntimeConfig({}, Boolean(enabled));
  }

  registerRendererTelemetry() {
    if (typeof this.api.registerSocket !== 'function') return;
    this.api.registerSocket('webgpu-emoji-rain:renderer-metrics', (socket, metrics = {}) => {
      if (!metrics || typeof metrics !== 'object') return;
      this.rendererMetrics = {
        ...this.rendererMetrics,
        ...metrics,
        backend: 'webgpu',
        receivedAt: Date.now()
      };
      this.api.emit('webgpu-emoji-rain:performance-update', this.rendererMetrics);
    });
  }

  /**
   * Get default presets
   */
  getDefaultPresets() {
    return [
      {
        id: 'gentle-rain',
        name: 'Gentle Rain',
        emoji: '💙',
        count: 10,
        intensity: 1.0,
        duration: 2000,
        burst: false,
        spawnArea: { y: 0 } // x will be randomized
      },
      {
        id: 'heavy-storm',
        name: 'Heavy Storm',
        emoji: '⚡',
        count: 50,
        intensity: 2.0,
        duration: 5000,
        burst: false,
        spawnArea: { y: 0 } // x will be randomized
      },
      {
        id: 'superfan-burst',
        name: 'SuperFan Burst',
        emoji: '⭐',
        count: 30,
        intensity: 1.5,
        duration: 0,
        burst: true,
        spawnArea: { y: 0 } // x will be randomized
      },
      {
        id: 'celebration',
        name: 'Celebration',
        emoji: '🎉',
        count: 25,
        intensity: 1.2,
        duration: 3000,
        burst: false,
        spawnArea: { y: 0 } // x will be randomized
      }
    ];
  }

  getSpawnAreaPresets() {
    return {
      full: {
        id: 'full',
        label: 'Standard Regen',
        allowedAreas: null
      }
    };
  }

  getSpawnAreaPreset(presetId) {
    const presets = this.getSpawnAreaPresets();
    return presets[presetId] || presets.full;
  }

  pickSpawnAreaCoordinates(presetId) {
    const preset = this.getSpawnAreaPreset(presetId);

    if (!preset.allowedAreas || preset.allowedAreas.length === 0) {
      return null;
    }

    const area = preset.allowedAreas[Math.floor(Math.random() * preset.allowedAreas.length)];
    return {
      x: area.x[0] + Math.random() * (area.x[1] - area.x[0]),
      y: area.y[0] + Math.random() * (area.y[1] - area.y[0]),
      spawnAreaPreset: preset.id
    };
  }

  isNormalizedCoordinate(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  }

  /**
   * Load presets from file
   */
  loadPresets() {
    try {
      if (fs.existsSync(this.presetsPath)) {
        const data = fs.readFileSync(this.presetsPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      this.api.log(`⚠️ [WebGPU Emoji Rain] Error loading presets: ${error.message}`, 'warn');
    }
    return this.getDefaultPresets();
  }

  /**
   * Save presets to file
   */
  savePresets(presets) {
    try {
      fs.writeFileSync(this.presetsPath, JSON.stringify(presets, null, 2));
      this.api.log('💾 [WebGPU Emoji Rain] Presets saved', 'debug');
    } catch (error) {
      this.api.log(`❌ [WebGPU Emoji Rain] Error saving presets: ${error.message}`, 'error');
    }
  }

  emitOverlaySpawn(spawnData) {
    const isHeartBalloons = spawnData?.mode === 'heart-balloons' || spawnData?.type === 'heart-balloons';
    const isGiftBalls = spawnData?.mode === 'gift-balls' || spawnData?.type === 'gift-balls';
    const eventName = isHeartBalloons
      ? 'webgpu-emoji-rain:heart-balloons'
      : (isGiftBalls ? 'webgpu-emoji-rain:gift-balls' : 'webgpu-emoji-rain:spawn');
    this.api.emit(eventName, spawnData);
  }

  queueOverlaySpawn(spawnData) {
    if (this.spawnQueue.length >= this.maxSpawnQueueSize) {
      this.spawnQueue.shift();
      this.metrics.droppedEvents++;
    }
    this.spawnQueue.push(spawnData);
  }

  /**
   * Start spawn batch processor for performance optimization
   */
  startSpawnBatchProcessor() {
    this.spawnBatchInterval = setInterval(() => {
      if (this.overlayState.paused) return;
      if (this.spawnQueue.length > 0) {
        const batch = this.spawnQueue.splice(0, this.spawnBatchSize);
        batch.forEach(spawnData => {
          this.emitOverlaySpawn(spawnData);
        });
      }
    }, 50); // Process every 50ms
  }

  /**
   * Integrate with Global Chat Command Engine (GCCE)
   */
  async integrateWithGCCE() {
    try {
      // Get GCCE instance from plugin loader
      const pluginLoader = this.api.pluginLoader;
      if (!pluginLoader || !pluginLoader.loadedPlugins) {
        this.api.log('⚠️ [WebGPU Emoji Rain] Plugin loader not available, skipping GCCE integration', 'warn');
        return;
      }

      const gccePlugin = pluginLoader.loadedPlugins.get('gcce');
      if (!gccePlugin || !gccePlugin.instance) {
        this.api.log('⚠️ [WebGPU Emoji Rain] GCCE plugin not found, skipping command registration', 'warn');
        return;
      }

      this.gcce = gccePlugin.instance;

      // Register commands
      const commands = [
        {
          name: 'rain',
          description: 'Trigger emoji rain effect',
          syntax: '/rain [preset]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'Effects',
          cooldown: {
            user: 10000, // 10 seconds per user
            global: 2000 // 2 seconds globally
          },
          handler: async (args, context) => await this.handleRainCommand(args, context)
        },
        {
          name: 'emoji',
          description: 'Spawn specific emoji with custom count and intensity',
          syntax: '/emoji <emoji> [count] [intensity]',
          permission: 'all',
          enabled: true,
          minArgs: 1,
          maxArgs: 3,
          category: 'Effects',
          cooldown: {
            user: 10000,
            global: 2000
          },
          handler: async (args, context) => await this.handleEmojiCommand(args, context)
        },
        {
          name: 'beans',
          description: 'SuperFan burst effect',
          syntax: '/beans',
          permission: 'subscriber',
          enabled: true,
          minArgs: 0,
          maxArgs: 0,
          category: 'Effects',
          cooldown: {
            user: 30000, // 30 seconds per user
            global: 5000 // 5 seconds globally
          },
          handler: async (args, context) => await this.handleBeansCommand(args, context)
        },
        {
          name: 'storm',
          description: 'Trigger heavy emoji storm',
          syntax: '/storm [emoji]',
          permission: 'vip',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'Effects',
          cooldown: {
            user: 60000, // 60 seconds per user
            global: 10000 // 10 seconds globally
          },
          handler: async (args, context) => await this.handleStormCommand(args, context)
        },
        {
          name: 'herzballons',
          description: 'Trigger heart balloons for the current user',
          syntax: '/herzballons [count]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'Effects',
          cooldown: {
            user: 10000,
            global: 2000
          },
          handler: async (args, context) => await this.handleHeartBalloonsCommand(args, context)
        },
        {
          name: 'rainstop',
          description: 'Stop all emoji rain effects',
          syntax: '/rainstop',
          permission: 'moderator',
          enabled: true,
          minArgs: 0,
          maxArgs: 0,
          category: 'Effects',
          cooldown: {
            user: 5000,
            global: 1000
          },
          handler: async (args, context) => await this.handleRainStopCommand(args, context)
        }
      ];

      const result = this.gcce.registerCommandsForPlugin('webgpu-emoji-rain', commands);
      this.api.log(`✅ [WebGPU Emoji Rain] GCCE integration complete: ${result.registered.length} commands registered`, 'info');
      
      if (result.failed.length > 0) {
        this.api.log(`⚠️ [WebGPU Emoji Rain] Failed to register commands: ${result.failed.join(', ')}`, 'warn');
      }
    } catch (error) {
      this.api.log(`❌ [WebGPU Emoji Rain] Error integrating with GCCE: ${error.message}`, 'error');
    }
  }

  /**
   * GCCE Command Handlers
   */
  
  async handleRainCommand(args, context) {
    const config = this.getRuntimeConfig();
    
    if (!config.enabled) {
      return {
        success: false,
        message: 'Emoji rain is currently disabled',
        displayOverlay: true
      };
    }

    // Check anti-spam
    if (!this.checkAntiSpam(context.username)) {
      this.metrics.droppedEvents++;
      return {
        success: false,
        message: 'Please wait before using this command again',
        displayOverlay: true
      };
    }

    const presetName = args[0];
    let preset = null;

    if (presetName) {
      const presets = this.loadPresets();
      preset = presets.find(p => p.id === presetName || p.name.toLowerCase() === presetName.toLowerCase());
      
      if (!preset) {
        return {
          success: false,
          message: `Preset "${presetName}" not found`,
          displayOverlay: true
        };
      }
    } else {
      // Default gentle rain
      preset = {
        emoji: config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)] || '💙',
        count: 15,
        intensity: 1.0,
        duration: 2000,
        burst: false
      };
    }

    this.triggerEmojiRain({
      ...preset,
      username: context.username,
      reason: 'command',
      source: '/rain'
    });

    this.metrics.commandTriggers++;

    return {
      success: true,
      message: `${context.username}, emoji rain triggered!`,
      displayOverlay: true
    };
  }

  async handleEmojiCommand(args, context) {
    const config = this.getRuntimeConfig();
    
    if (!config.enabled) {
      return {
        success: false,
        message: 'Emoji rain is currently disabled',
        displayOverlay: true
      };
    }

    if (!this.checkAntiSpam(context.username)) {
      this.metrics.droppedEvents++;
      return {
        success: false,
        message: 'Please wait before using this command again',
        displayOverlay: true
      };
    }

    const emoji = args[0];
    const count = args[1] ? Math.min(parseInt(args[1]), config.gift_max_emojis || 50) : 10;
    const intensity = args[2] ? Math.min(parseFloat(args[2]), 3.0) : 1.0;

    // Validate emoji (check if it's in blocklist if configured)
    if (config.emoji_blocklist && config.emoji_blocklist.includes(emoji)) {
      return {
        success: false,
        message: 'This emoji is not allowed',
        displayOverlay: true
      };
    }

    this.triggerEmojiRain({
      emoji,
      count,
      intensity,
      duration: 0,
      burst: false,
      username: context.username,
      reason: 'command',
      source: '/emoji'
    });

    this.metrics.commandTriggers++;

    return {
      success: true,
      message: `${context.username}, spawning ${count}x ${emoji}!`,
      displayOverlay: true
    };
  }

  async handleBeansCommand(args, context) {
    const config = this.getRuntimeConfig();
    
    if (!config.enabled) {
      return {
        success: false,
        message: 'Emoji rain is currently disabled',
        displayOverlay: true
      };
    }

    if (!this.checkAntiSpam(context.username)) {
      this.metrics.droppedEvents++;
      return {
        success: false,
        message: 'Please wait before using this command again',
        displayOverlay: true
      };
    }

    // SuperFan burst
    this.triggerEmojiRain({
      emoji: '⭐',
      count: 30,
      intensity: 1.5,
      duration: 0,
      burst: true,
      username: context.username,
      reason: 'command',
      source: '/beans'
    });

    this.metrics.commandTriggers++;

    return {
      success: true,
      message: `${context.username} triggered a SuperFan burst! ⭐`,
      displayOverlay: true
    };
  }

  async handleStormCommand(args, context) {
    const config = this.getRuntimeConfig();
    
    if (!config.enabled) {
      return {
        success: false,
        message: 'Emoji rain is currently disabled',
        displayOverlay: true
      };
    }

    if (!this.checkAntiSpam(context.username)) {
      this.metrics.droppedEvents++;
      return {
        success: false,
        message: 'Please wait before using this command again',
        displayOverlay: true
      };
    }

    const emoji = args[0] || '⚡';

    this.triggerEmojiRain({
      emoji,
      count: 50,
      intensity: 2.0,
      duration: 5000,
      burst: false,
      username: context.username,
      reason: 'command',
      source: '/storm'
    });

    this.metrics.commandTriggers++;

    return {
      success: true,
      message: `${context.username} triggered an emoji storm! ${emoji}`,
      displayOverlay: true
    };
  }

  async handleHeartBalloonsCommand(args, context) {
    const config = this.getRuntimeConfig();

    if (!config.enabled || config.heart_balloons_enabled === false) {
      return {
        success: false,
        message: 'Herzballons are currently disabled',
        displayOverlay: true
      };
    }

    if (!this.checkAntiSpam(context.username)) {
      this.metrics.droppedEvents++;
      return {
        success: false,
        message: 'Please wait before using this command again',
        displayOverlay: true
      };
    }

    const requestedCount = parseInt(args[0], 10);
    const count = Number.isFinite(requestedCount) ? requestedCount : (config.heart_balloon_test_count || 8);

    this.triggerHeartBalloons({
      count,
      username: context.username,
      profilePictureUrl: context.profilePictureUrl || null,
      reason: 'command',
      source: '/herzballons'
    });

    this.metrics.commandTriggers++;

    return {
      success: true,
      message: `${context.username} triggered Herzballons`,
      displayOverlay: true
    };
  }

  async handleRainStopCommand(args, context) {
    // Clear all rain
    this.api.emit('webgpu-emoji-rain:clear', {});
    this.spawnQueue = [];

    return {
      success: true,
      message: `${context.username} stopped the emoji rain`,
      displayOverlay: true
    };
  }

  /**
   * Check anti-spam for user
   */
  checkAntiSpam(username) {
    const now = Date.now();

    // Check global flood gate
    if (this.globalTriggerCount >= this.globalMaxTriggers) {
      this.debugLog('Anti-spam: global flood gate triggered');
      return false;
    }

    // Check global cooldown
    if (now - this.lastGlobalTrigger < this.defaultGlobalCooldown) {
      this.debugLog('Anti-spam: global cooldown active');
      return false;
    }

    // Check per-user cooldown
    const lastTrigger = this.userCooldowns.get(username) || 0;
    if (now - lastTrigger < this.defaultUserCooldown) {
      this.debugLog(`Anti-spam: user cooldown active for ${username}`);
      return false;
    }

    // Update counters
    this.globalTriggerCount++;
    this.lastGlobalTrigger = now;
    this.userCooldowns.set(username, now);

    return true;
  }

  createHeartBalloonColorPool() {
    const pool = [...this.heartBalloonPalette];
    for (let index = pool.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    return pool;
  }

  handleHeartBalloonStreamSession(data = {}, { requireIsNewStream = false } = {}) {
    if (data.isNewStream === false || (requireIsNewStream && data.isNewStream !== true)) {
      return false;
    }

    const streamIdentity = data.streamIdentity || (
      data.username && data.roomId
        ? `${String(data.username).toLowerCase()}:${data.roomId}`
        : null
    );
    if (!streamIdentity || streamIdentity === this.lastHeartBalloonStreamIdentity) {
      return false;
    }

    this.heartBalloonUserColors.clear();
    this.heartBalloonColorPool = this.createHeartBalloonColorPool();
    this.heartBalloonColorIndex = 0;
    this.lastHeartBalloonStreamIdentity = streamIdentity;
    return true;
  }

  getHeartBalloonColor(username) {
    const key = String(username || 'Unknown').toLowerCase();

    if (this.heartBalloonUserColors.has(key)) {
      return this.heartBalloonUserColors.get(key);
    }

    const color = this.heartBalloonColorPool[
      this.heartBalloonColorIndex % this.heartBalloonColorPool.length
    ];
    this.heartBalloonColorIndex++;
    this.heartBalloonUserColors.set(key, color);
    return color;
  }

  getProfilePictureUrl(data = {}) {
    const candidates = [
      data.profilePictureUrl,
      data.profilePicture,
      data.avatarUrl,
      data.avatar,
      data.user?.profilePictureUrl,
      data.user?.profilePicture,
      data.user?.avatarUrl,
      data.user?.avatar,
      data.user?.avatarThumb,
      data.user?.avatarMedium,
      data.user?.avatarLarger
    ];

    for (const candidate of candidates) {
      const url = this.normalizeImageUrl(candidate);
      if (url) {
        return url;
      }
    }

    return null;
  }

  normalizeImageUrl(value) {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return value;
    }

    const candidates = [
      value.url,
      value.uri,
      value.urlList,
      value.url_list,
      value.urls
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        const firstUrl = candidate.find(item => typeof item === 'string' && item.trim());
        if (firstUrl) {
          return firstUrl;
        }
      } else if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    return null;
  }

  getHeartBalloonCount(config, data = {}) {
    const rawLikeCount = parseInt(data.likeCount || data.count || data.likes || 1, 10);
    const likeCount = Number.isFinite(rawLikeCount) && rawLikeCount > 0 ? rawLikeCount : 1;
    const divisor = Math.max(1, parseInt(config.heart_balloon_like_divisor || 1, 10));
    const minHearts = Math.max(1, parseInt(config.heart_balloon_min_hearts || 1, 10));
    const maxHearts = Math.max(minHearts, parseInt(config.heart_balloon_max_hearts || 24, 10));
    const scaledCount = Math.floor(likeCount / divisor);

    return Math.max(minHearts, Math.min(maxHearts, scaledCount || minHearts));
  }

  getGiftSeriesCount(data = {}) {
    const candidates = [
      data.repeatCount,
      data.repeat_count,
      data.comboCount,
      data.combo_count,
      data.seriesCount,
      data.series_count,
      data.gift?.repeatCount,
      data.gift?.repeat_count,
      data.gift?.comboCount,
      data.gift?.combo_count
    ];

    for (const candidate of candidates) {
      const count = Number(candidate);
      if (Number.isFinite(count) && count > 0) {
        return Math.max(1, Math.floor(count));
      }
    }

    return 1;
  }

  /**
   * Resolve the size (px) for a gift price based on the configured price tiers.
   *
   * Tier thresholds (in coin price) — inclusive lower bound:
   *   1   -    30   → tier 1 (smallest)
   *   31  -   100   → tier 2
   *   101 -   500   → tier 3
   *   501 -  1000   → tier 4
   *   1001-  5000   → tier 5
   *   >5000         → tier 6 (largest, "max" size)
   *
   * Returns the configured size for the matching tier. If tiers are disabled
   * (gift_ball_tier_thresholds_enabled !== true), falls back to a smooth
   * logarithmic scale between gift_ball_min_size_px and gift_ball_max_size_px.
   */
  getGiftBallSizeByTier(price, config = {}) {
    const tierEnabled = config.gift_ball_tier_thresholds_enabled === true;
    const safePrice = Math.max(1, Number(price) || 1);

    if (!tierEnabled) {
      const minSize = Math.max(12, parseInt(config.gift_ball_min_size_px || 44, 10));
      const maxSize = Math.max(minSize, parseInt(config.gift_ball_max_size_px || 128, 10));
      const referencePrice = Math.max(1, parseFloat(config.gift_ball_price_reference_coins || 1000));
      const priceRatio = Math.min(1, Math.log10(safePrice + 1) / Math.log10(referencePrice + 1));
      return Math.round(minSize + (maxSize - minSize) * priceRatio);
    }

    // Tier-based sizing: lookup the tier whose lower threshold is the highest value
    // that is still <= price. Tiers are defined as [maxInclusiveThreshold, sizePx].
    const tiers = [
      { maxPrice: 30, size: parseInt(config.gift_ball_tier_size_1 || 44, 10) },
      { maxPrice: 100, size: parseInt(config.gift_ball_tier_size_2 || 80, 10) },
      { maxPrice: 500, size: parseInt(config.gift_ball_tier_size_3 || 150, 10) },
      { maxPrice: 1000, size: parseInt(config.gift_ball_tier_size_4 || 300, 10) },
      { maxPrice: 5000, size: parseInt(config.gift_ball_tier_size_5 || 700, 10) },
      { maxPrice: Infinity, size: parseInt(config.gift_ball_tier_size_6 || 5000, 10) }
    ];

    let resolvedSize = tiers[0].size;
    for (const tier of tiers) {
      if (safePrice <= tier.maxPrice) {
        resolvedSize = tier.size;
        break;
      }
    }

    return Math.max(12, resolvedSize);
  }

  getGiftBallMetrics(price, config = {}, seriesCount = 1) {
    const safeSeriesCount = Math.max(1, Math.floor(Number(seriesCount) || 1));
    const safePrice = Math.max(1, Number(price) || 1);
    const totalPrice = safePrice * safeSeriesCount;
    const tierEnabled = config.gift_ball_tier_thresholds_enabled === true;

    // Tier-based size OR smooth log scaling, then scale by series count (capped)
    const tierSize = this.getGiftBallSizeByTier(safePrice, config);
    const seriesScale = Math.min(1.35, 1 + Math.log10(safeSeriesCount) * 0.12);
    const rawSize = tierSize * seriesScale;
    const size = Math.round(tierEnabled ? rawSize : Math.max(tierSize, rawSize));

    const configuredMinDespawn = Math.max(1000, parseInt(config.gift_ball_min_despawn_ms || 9000, 10));
    const emojiLifetime = parseInt(config.emoji_lifetime_ms || 7000, 10);
    const minDespawn = Math.max(configuredMinDespawn, (Number.isFinite(emojiLifetime) ? emojiLifetime : 7000) + 2000);
    const maxDespawn = Math.max(minDespawn, parseInt(config.gift_ball_max_despawn_ms || 20000, 10));
    const perCoinMs = Math.max(0, parseFloat(config.gift_ball_despawn_per_coin_ms || 25));
    const multiplier = Math.max(0.1, parseFloat(config.gift_ball_despawn_multiplier || 1));
    const despawnMs = Math.round(Math.min(maxDespawn, Math.max(minDespawn, (minDespawn + totalPrice * perCoinMs) * multiplier)));

    const baseCount = Math.max(1, parseInt(config.gift_ball_base_count || 1, 10));
    const seriesDivisor = Math.max(1, parseInt(config.gift_ball_series_count_divisor || 3, 10));
    const maxCount = Math.max(baseCount, parseInt(config.gift_ball_max_count || 24, 10));
    const count = Math.min(maxCount, baseCount + Math.floor((safeSeriesCount - 1) / seriesDivisor));

    return { size, despawnMs, count, seriesCount: safeSeriesCount, totalPrice };
  }

  getGiftCatalogEntry(giftId) {
    if (!giftId && giftId !== 0) {
      return null;
    }

    try {
      const db = this.api.getDatabase();
      if (db && typeof db.getGift === 'function') {
        return db.getGift(giftId) || null;
      }
    } catch (error) {
      this.debugLog(`Gift catalog lookup failed for ${giftId}: ${error.message}`);
    }

    return null;
  }

  getGiftImageUrl(data = {}, catalogGift = null) {
    return catalogGift?.image_url ||
      catalogGift?.imageUrl ||
      data.gift?.image_url ||
      data.gift?.imageUrl ||
      data.giftPictureUrl ||
      data.giftImageUrl ||
      data.imageUrl ||
      data.image_url ||
      null;
  }

  getGiftPrice(data = {}, catalogGift = null) {
    const candidates = [
      data.diamondCount,
      data.diamond_count,
      data.coins,
      data.giftValue,
      data.gift?.diamond_count,
      data.gift?.diamondCount,
      catalogGift?.diamond_count,
      catalogGift?.diamondCount,
      catalogGift?.coins
    ];

    for (const candidate of candidates) {
      const price = Number(candidate);
      if (Number.isFinite(price) && price > 0) {
        return price;
      }
    }

    return 1;
  }

  triggerGiftBall(params = {}) {
    const config = this.getRuntimeConfig();

    if (!config.enabled || config.gift_balls_enabled !== true) {
      return null;
    }

    const catalogGift = this.getGiftCatalogEntry(params.giftId);
    const giftImageUrl = this.getGiftImageUrl(params, catalogGift);
    const price = this.getGiftPrice(params, catalogGift);
    const seriesCount = this.getGiftSeriesCount(params);
    const metrics = this.getGiftBallMetrics(price, config, seriesCount);
    const username = params.username || 'Unknown';

    const spawnData = {
      mode: 'gift-balls',
      type: 'gift-balls',
      giftId: params.giftId || catalogGift?.id || null,
      giftName: params.giftName || params.gift?.name || catalogGift?.name || 'Gift',
      giftImageUrl,
      price,
      totalPrice: metrics.totalPrice,
      seriesCount: metrics.seriesCount,
      count: metrics.count,
      size: metrics.size,
      despawnMs: metrics.despawnMs,
      x: typeof params.x === 'number' && params.x >= 0 && params.x <= 1 ? params.x : Math.random(),
      y: typeof params.y === 'number' ? params.y : 0,
      username,
      reason: params.reason || 'gift',
      source: params.source || 'event:gift'
    };

    this.metrics.totalTriggers++;
    this.metrics.totalEmojisSpawned += spawnData.count;
    this.metrics.avgCount = this.metrics.totalEmojisSpawned / this.metrics.totalTriggers;

    if (this.overlayState.paused) {
      this.debugLog('Overlay paused, queueing gift ball');
      this.queueOverlaySpawn(spawnData);
      return spawnData;
    }

    this.emitOverlaySpawn(spawnData);
    this.debugLog(`Gift ball triggered for ${username}: ${spawnData.giftName} (${price} x${seriesCount})`);

    return spawnData;
  }

  triggerHeartBalloons(params = {}) {
    const config = this.getRuntimeConfig();

    if (!config.enabled || config.heart_balloons_enabled === false) {
      return null;
    }

    const username = params.username || 'Unknown';
    const maxCount = Math.max(1, parseInt(config.heart_balloon_max_hearts || config.max_count_per_event || 24, 10));
    const profileEvery = Math.max(1, parseInt(config.heart_balloon_profile_every || 5, 10));
    const count = Math.max(1, Math.min(parseInt(params.count || config.heart_balloon_test_count || 8, 10), maxCount));

    const spawnData = {
      mode: 'heart-balloons',
      type: 'heart-balloons',
      count,
      x: typeof params.x === 'number' && params.x >= 0 && params.x <= 1 ? params.x : Math.random(),
      y: 1,
      username,
      profilePictureUrl: params.profilePictureUrl || null,
      heartColor: params.heartColor || this.getHeartBalloonColor(username),
      profileEvery,
      popY: typeof config.heart_balloon_pop_y === 'number' ? config.heart_balloon_pop_y : 0.5,
      windStrength: typeof config.heart_balloon_wind_strength === 'number' ? config.heart_balloon_wind_strength : 0.45,
      reason: params.reason || 'heart-balloons',
      source: params.source || 'herzballons'
    };

    this.metrics.totalTriggers++;
    this.metrics.totalEmojisSpawned += spawnData.count;
    this.metrics.avgCount = this.metrics.totalEmojisSpawned / this.metrics.totalTriggers;

    if (this.overlayState.paused) {
      this.debugLog('Overlay paused, queueing heart balloons');
      this.queueOverlaySpawn(spawnData);
      return spawnData;
    }

    this.emitOverlaySpawn(spawnData);
    this.debugLog(`Heart balloons triggered: ${spawnData.count} for ${username}`);

    return spawnData;
  }

  /**
   * Validate and sanitize spawn coordinates
   * @param {any} x - X coordinate (0-1 range)
   * @param {any} y - Y coordinate (0-1 range)
   * @param {object} spawnArea - Optional spawn area with default x/y
   * @param {string} spawnAreaPreset - Optional configured screen-area preset
   * @returns {object} Validated {x, y} coordinates
   */
  validateSpawnCoordinates(x, y, spawnArea = null, spawnAreaPreset = 'full') {
    const presetCoordinates = this.pickSpawnAreaCoordinates(spawnAreaPreset);
    let usedPreset = false;

    // Validate X coordinate - must be a valid number, default to random if invalid
    let validX;
    if (this.isNormalizedCoordinate(x)) {
      validX = x;
    } else if (this.isNormalizedCoordinate(spawnArea?.x)) {
      validX = spawnArea.x;
    } else if (presetCoordinates) {
      validX = presetCoordinates.x;
      usedPreset = true;
    } else {
      validX = Math.random(); // Random horizontal position
    }

    // Validate Y coordinate - must be a valid number, default to 0 (top) if invalid
    let validY;
    if (this.isNormalizedCoordinate(y)) {
      validY = y;
    } else if (this.isNormalizedCoordinate(spawnArea?.y)) {
      validY = spawnArea.y;
    } else if (presetCoordinates) {
      validY = presetCoordinates.y;
      usedPreset = true;
    } else {
      validY = 0; // Top of screen
    }

    // Debug log if coordinates were at (0,0) before validation
    if (x === 0 && y === 0) {
      this.debugLog(`Warning: Spawn coordinates were explicitly set to (0,0), using validated: (${validX}, ${validY})`);
    }

    return {
      x: validX,
      y: validY,
      ...(usedPreset && { spawnAreaPreset: presetCoordinates.spawnAreaPreset })
    };
  }

  /**
   * Trigger emoji rain (centralized method)
   */
  triggerEmojiRain(params) {
    const config = this.getRuntimeConfig();

    if (!config.enabled) {
      return;
    }

    // Apply caps
    const maxCount = config.max_count_per_event || 100;
    const maxIntensity = config.max_intensity || 3.0;

    // Validate and sanitize spawn coordinates
    const coordinates = this.validateSpawnCoordinates(
      params.x,
      params.y,
      params.spawnArea,
      params.spawnAreaPreset || 'full'
    );

    const spawnData = {
      count: Math.min(params.count || 10, maxCount),
      emoji: params.emoji || config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)] || '💙',
      x: coordinates.x,
      y: coordinates.y,
      username: params.username || null,
      profilePictureUrl: params.profilePictureUrl || null,
      reason: params.reason || 'manual',
      source: params.source || 'manual',
      burst: params.burst || false,
      intensity: Math.min(params.intensity || 1.0, maxIntensity),
      ...(coordinates.spawnAreaPreset && { spawnAreaPreset: coordinates.spawnAreaPreset })
    };

    // Update metrics
    this.metrics.totalTriggers++;
    this.metrics.totalEmojisSpawned += spawnData.count;
    this.metrics.avgCount = this.metrics.totalEmojisSpawned / this.metrics.totalTriggers;
    this.metrics.avgIntensity = ((this.metrics.avgIntensity * (this.metrics.totalTriggers - 1)) + spawnData.intensity) / this.metrics.totalTriggers;

    // Check if paused
    if (this.overlayState.paused) {
      this.debugLog('Overlay paused, queueing spawn');
      this.queueOverlaySpawn(spawnData);
      return spawnData;
    }

    // Emit spawn event
    this.emitOverlaySpawn(spawnData);
    if (spawnData.emoji === '{{profilePicture}}') {
      if (spawnData.profilePictureUrl) {
        this.api.log(`🖼️ [WebGPU Emoji Rain] Profile picture spawn for ${spawnData.username}: ${spawnData.profilePictureUrl}`, 'debug');
      } else {
        this.api.log(`⚠️ [WebGPU Emoji Rain] Profile picture requested for ${spawnData.username} but no URL available - will use fallback`, 'warn');
      }
    }

    // Handle duration (spawn multiple batches)
    if (params.duration && params.duration > 0) {
      const batches = Math.floor(params.duration / 500);
      let batchCount = 0;

      const interval = setInterval(() => {
        batchCount++;
        if (batchCount >= batches) {
          clearInterval(interval);
          this.durationIntervals.delete(interval);
          return;
        }

        const repeatedSpawn = {
          ...spawnData,
          x: Math.random()
        };
        if (this.overlayState.paused) this.queueOverlaySpawn(repeatedSpawn);
        else this.emitOverlaySpawn(repeatedSpawn);
      }, 500);
      this.durationIntervals.add(interval);
    }

    this.debugLog(`Emoji rain triggered: ${spawnData.count}x ${spawnData.emoji} (reason: ${params.reason})`);
    return spawnData;
  }

  /**
   * Debug logging with rate limiting
   */
  debugLog(message) {
    if (!this.debugMode) {
      return;
    }

    if (this.debugLogCount >= this.debugLogLimit) {
      return;
    }

    this.debugLogCount++;
    this.api.log(`🐛 [WebGPU Emoji Rain DEBUG] ${message}`, 'debug');

    // Reset counter after 1 minute
    setTimeout(() => {
      this.debugLogCount = Math.max(0, this.debugLogCount - 1);
    }, 60000);
  }

  /**
   * Setup multer for file uploads with enhanced validation
   */
  setupMulter() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'emoji-' + uniqueSuffix + ext);
      }
    });

    this.upload = multer({
      storage: storage,
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1
      },
      fileFilter: (req, file, cb) => {
        // Check MIME type
        const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (!allowedMimes.includes(file.mimetype)) {
          return cb(new Error('Invalid file type. Only PNG, JPG, GIF, WebP, SVG are allowed.'));
        }

        // Check file extension
        const allowedExts = /\.(png|jpg|jpeg|gif|webp|svg)$/i;
        const extname = allowedExts.test(path.extname(file.originalname).toLowerCase());
        
        if (!extname) {
          return cb(new Error('Invalid file extension. Only .png, .jpg, .jpeg, .gif, .webp, .svg are allowed.'));
        }

        // Check user upload limit
        const username = req.body.username || req.headers['x-username'] || 'anonymous';
        const userUploadCount = this.userUploadCounts.get(username) || 0;
        
        if (userUploadCount >= this.maxUploadsPerUser) {
          return cb(new Error(`Upload limit reached. Maximum ${this.maxUploadsPerUser} uploads per user.`));
        }

        cb(null, true);
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

  getObsHudRoutePaths() {
    return [
      '/webgpu-emoji-rain/obs-hud',
      '/webgpu-emoji-rain/obs-hud/emojiregen',
      '/webgpu-emoji-rain/obs-hud/herzballons',
      '/webgpu-emoji-rain/obs-hud/geschenkeregen',
      '/webgpu-emoji-rain/obs-hud/emojiregen-geschenkeregen',
      '/webgpu-emoji-rain/obs-hud/emojis',
      '/webgpu-emoji-rain/obs-hud/hearts',
      '/webgpu-emoji-rain/obs-hud/gifts',
      '/webgpu-emoji-rain/obs-hud/emoji-gifts'
    ];
  }

  sendObsHudOverlay(res) {
    const obsHudPath = path.join(__dirname, 'obs-hud.html');
    if (fs.existsSync(obsHudPath)) {
      res.sendFile(obsHudPath);
      return;
    }

    res.sendFile(path.join(__dirname, 'overlay.html'));
  }

  resolveUploadFilePath(filename) {
    if (!filename || filename !== path.basename(filename)) {
      return null;
    }

    const uploadRoot = path.resolve(this.uploadDir);
    const filePath = path.resolve(uploadRoot, filename);
    if (!filePath.startsWith(uploadRoot + path.sep)) {
      return null;
    }

    return filePath;
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

    // Serve OBS HUD overlays (same renderer, URL-selected effect layers)
    this.getObsHudRoutePaths().forEach((routePath) => {
      this.api.registerRoute('get', routePath, (req, res) => {
        this.sendObsHudOverlay(res);
      });
    });

    // Serve uploaded emoji images
    const serveUploadedImage = (req, res) => {
      const filename = req.params.filename;
      const filePath = this.resolveUploadFilePath(filename);

      if (!filePath) {
        return res.status(400).json({ success: false, error: 'Invalid filename' });
      }

      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        res.status(404).json({ success: false, error: 'File not found' });
      }
    };

    this.api.registerRoute('get', '/webgpu-emoji-rain/uploads/:filename', serveUploadedImage);
    this.api.registerRoute('get', '/uploads/webgpu-emoji-rain/:filename', serveUploadedImage);

    const serveRemoteImage = async (req, res) => {
      try {
        const upstream = await fetchAllowedAvatar(String(req.query?.url || '').trim());
        if (!upstream.ok) {
          return res.status(upstream.status).json({ success: false, error: 'Remote image unavailable' });
        }

        const contentType = upstream.headers.get('content-type') || '';
        if (!contentType.toLowerCase().startsWith('image/')) {
          return res.status(415).json({ success: false, error: 'Remote URL is not an image' });
        }

        const contentLength = Number(upstream.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > AVATAR_PROXY_MAX_BYTES) {
          return res.status(413).json({ success: false, error: 'Remote image is too large' });
        }

        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (bytes.length > AVATAR_PROXY_MAX_BYTES) {
          return res.status(413).json({ success: false, error: 'Remote image is too large' });
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=1800');
        return res.send(bytes);
      } catch (error) {
        this.api.log(`[WebGPU Emoji Rain] Remote image proxy failed: ${error.message}`, 'warn');
        return res.status(error.statusCode || 400).json({ success: false, error: 'Invalid remote image request' });
      }
    };
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/avatar', serveRemoteImage);
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/asset', serveRemoteImage);

    // Get emoji rain config (from database)
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/config', (req, res) => {
      try {
        this.api.log('📥 [WebGPU Emoji Rain] GET /api/webgpu-emoji-rain/config', 'debug');
        const config = this.getRuntimeConfig();
        this.api.log('📥 [WebGPU Emoji Rain] v3 config retrieved', 'debug');
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
        const updatedConfig = this.updateRuntimeConfig(config, enabled !== undefined ? enabled : null);
        this.api.log('🌧️ WebGPU Emoji rain configuration updated', 'info');

        // Notify overlays about config change
        this.api.emit('webgpu-emoji-rain:config-update', { config: updatedConfig, enabled: updatedConfig.enabled });

        res.json({ success: true, message: 'Emoji rain configuration updated' });
      } catch (error) {
        this.api.log(`Error updating emoji rain config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get emoji rain status
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/status', (req, res) => {
      try {
        const config = this.getRuntimeConfig();
        res.json({ success: true, enabled: config.enabled, renderer: this.rendererMetrics });
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
        this.toggleRuntimeEnabled(enabled);
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
      const { count, emoji, x, y, spawnAreaPreset } = req.body;

      try {
        const db = this.api.getDatabase();
        const config = this.getRuntimeConfig();

        if (!config.enabled) {
          return res.status(400).json({ success: false, error: 'Emoji rain is disabled' });
        }

        const parsedX = x !== undefined && x !== null && x !== '' ? parseFloat(x) : undefined;
        const parsedY = y !== undefined && y !== null && y !== '' ? parseFloat(y) : undefined;
        const testData = this.triggerEmojiRain({
          count: parseInt(count) || 1,
          emoji: emoji || config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)],
          x: Number.isFinite(parsedX) ? parsedX : undefined,
          y: Number.isFinite(parsedY) ? parsedY : undefined,
          spawnAreaPreset,
          username: 'Test User',
          reason: 'test',
          source: 'test-api'
        });

        this.api.log(`🧪 Testing WebGPU emoji rain: ${testData.count}x ${testData.emoji}`, 'info');

        res.json({ success: true, message: 'Test emojis spawned', data: testData });
      } catch (error) {
        this.api.log(`Error testing emoji rain: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test heart balloons
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/test-heart-balloons', (req, res) => {
      try {
        const { count, username, profilePictureUrl } = req.body || {};
        const config = this.getRuntimeConfig();

        if (!config.enabled) {
          return res.status(400).json({ success: false, error: 'Emoji rain is disabled' });
        }

        if (config.heart_balloons_enabled === false) {
          return res.status(400).json({ success: false, error: 'Herzballons are disabled' });
        }

        const spawnData = this.triggerHeartBalloons({
          count: parseInt(count, 10) || config.heart_balloon_test_count || 8,
          username: username || 'Test User',
          profilePictureUrl: profilePictureUrl || null,
          reason: 'test',
          source: 'test-heart-balloons'
        });

        res.json({ success: true, message: 'Herzballons spawned', data: spawnData });
      } catch (error) {
        this.api.log(`Error testing heart balloons: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test gift ball
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/test-gift-ball', (req, res) => {
      try {
        const { giftName, giftImageUrl, price, username } = req.body || {};
        const config = this.getRuntimeConfig();

        if (!config.enabled) {
          return res.status(400).json({ success: false, error: 'Emoji rain is disabled' });
        }

        if (config.gift_balls_enabled !== true) {
          return res.status(400).json({ success: false, error: 'Geschenk-Kugeln are disabled' });
        }

        const spawnData = this.triggerGiftBall({
          giftName: giftName || 'Test Gift',
          giftImageUrl: giftImageUrl || null,
          diamondCount: parseFloat(price) || 100,
          username: username || 'Geschenk Test',
          reason: 'test',
          source: 'test-gift-ball'
        });

        res.json({ success: true, message: 'Geschenk-Kugel spawned', data: spawnData });
      } catch (error) {
        this.api.log(`Error testing gift ball: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Upload custom emoji rain image (enhanced with validation and limits)
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/upload', (req, res) => {
      this.upload.single('image')(req, res, async (err) => {
        if (err) {
          this.api.log(`❌ [WebGPU Emoji Rain] Upload error: ${err.message}`, 'error');
          return res.status(400).json({ success: false, error: err.message });
        }

        try {
          if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
          }

          const username = req.body.username || req.headers['x-username'] || 'anonymous';
          const filePath = req.file.path;
          const fileUrl = `/webgpu-emoji-rain/uploads/${req.file.filename}`;
          
          // SVG sanitization
          if (req.file.mimetype === 'image/svg+xml') {
            try {
              const svgContent = fs.readFileSync(filePath, 'utf8');
              
              // Basic SVG sanitization: remove script tags and event handlers
              const sanitized = svgContent
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
                .replace(/javascript:/gi, '');
              
              fs.writeFileSync(filePath, sanitized);
              this.api.log(`🧼 [WebGPU Emoji Rain] SVG sanitized: ${req.file.filename}`, 'debug');
            } catch (sanitizeError) {
              this.api.log(`⚠️ [WebGPU Emoji Rain] SVG sanitization failed: ${sanitizeError.message}`, 'warn');
            }
          }
          
          // Update user upload count
          const currentCount = this.userUploadCounts.get(username) || 0;
          this.userUploadCounts.set(username, currentCount + 1);
          
          this.api.log(`📤 [WebGPU Emoji Rain] Image uploaded by ${username}: ${req.file.filename} (${currentCount + 1}/${this.maxUploadsPerUser})`, 'info');

          res.json({
            success: true,
            message: 'Image uploaded successfully',
            url: fileUrl,
            filename: req.file.filename,
            size: req.file.size,
            uploads: {
              current: currentCount + 1,
              max: this.maxUploadsPerUser
            }
          });
        } catch (error) {
          this.api.log(`❌ [WebGPU Emoji Rain] Error processing upload: ${error.message}`, 'error');
          
          // Clean up file on error
          try {
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
              fs.unlinkSync(req.file.path);
            }
          } catch (cleanupError) {
            this.api.log(`⚠️ [WebGPU Emoji Rain] Cleanup error: ${cleanupError.message}`, 'warn');
          }
          
          res.status(500).json({ success: false, error: error.message });
        }
      });
    });

    // Get list of uploaded emoji rain images
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/images', (req, res) => {
      try {
        const files = fs.readdirSync(this.uploadDir)
          .filter(f => f !== '.gitkeep')
          .map(filename => {
            const filePath = path.join(this.uploadDir, filename);
            const stats = fs.statSync(filePath);
            return {
              filename,
              url: `/webgpu-emoji-rain/uploads/${filename}`,
              size: stats.size,
              created: stats.birthtime,
              modified: stats.mtime
            };
          })
          .sort((a, b) => b.created - a.created); // Most recent first

        res.json({ success: true, images: files, count: files.length });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error listing images: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete uploaded emoji rain image
    this.api.registerRoute('delete', '/api/webgpu-emoji-rain/images/:filename', (req, res) => {
      try {
        const filename = req.params.filename;
        const filePath = this.resolveUploadFilePath(filename);

        if (!filePath) {
          return res.status(400).json({ success: false, error: 'Invalid filename' });
        }

        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ success: false, error: 'File not found' });
        }

        fs.unlinkSync(filePath);
        this.api.log(`🗑️ [WebGPU Emoji Rain] Image deleted: ${filename}`, 'info');

        res.json({ success: true, message: 'Image deleted successfully' });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error deleting image: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get user emoji mappings (enhanced with stats)
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/user-mappings', (req, res) => {
      try {
        let mappings = {};
        if (fs.existsSync(this.userMappingsPath)) {
          mappings = JSON.parse(fs.readFileSync(this.userMappingsPath, 'utf8'));
        }
        
        const stats = {
          totalMappings: Object.keys(mappings).length,
          uniqueEmojis: [...new Set(Object.values(mappings))].length
        };
        
        res.json({ success: true, mappings, stats });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error getting user mappings: ${error.message}`, 'error');
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

        this.api.log(`💾 [WebGPU Emoji Rain] User mappings saved (${Object.keys(mappings).length} entries)`, 'info');

        // Notify overlays about mapping update
        this.api.emit('webgpu-emoji-rain:user-mappings-update', { mappings });

        res.json({ success: true, message: 'User emoji mappings updated' });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error updating user mappings: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Export user mappings (bulk)
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/user-mappings/export', (req, res) => {
      try {
        let mappings = {};
        if (fs.existsSync(this.userMappingsPath)) {
          mappings = JSON.parse(fs.readFileSync(this.userMappingsPath, 'utf8'));
        }
        
        const exportData = {
          version: '2.0',
          exported: new Date().toISOString(),
          mappings
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=emoji-rain-mappings.json');
        res.json(exportData);
        
        this.api.log(`📤 [WebGPU Emoji Rain] User mappings exported`, 'info');
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error exporting user mappings: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Import user mappings (bulk)
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/user-mappings/import', (req, res) => {
      try {
        const { mappings, merge } = req.body;
        
        if (!mappings || typeof mappings !== 'object') {
          return res.status(400).json({ success: false, error: 'Invalid mappings data' });
        }
        
        let finalMappings = mappings;
        
        // If merge is true, merge with existing mappings
        if (merge && fs.existsSync(this.userMappingsPath)) {
          const existing = JSON.parse(fs.readFileSync(this.userMappingsPath, 'utf8'));
          finalMappings = { ...existing, ...mappings };
        }
        
        // Save to both locations
        const userMappingsDir = path.dirname(this.userMappingsPath);
        if (!fs.existsSync(userMappingsDir)) {
          fs.mkdirSync(userMappingsDir, { recursive: true });
        }
        fs.writeFileSync(this.userMappingsPath, JSON.stringify(finalMappings, null, 2));
        
        const userConfigMappingsDir = path.dirname(this.userConfigMappingsPath);
        if (!fs.existsSync(userConfigMappingsDir)) {
          fs.mkdirSync(userConfigMappingsDir, { recursive: true });
        }
        fs.writeFileSync(this.userConfigMappingsPath, JSON.stringify(finalMappings, null, 2));
        
        // Notify overlays
        this.api.emit('webgpu-emoji-rain:user-mappings-update', { mappings: finalMappings });
        
        this.api.log(`📥 [WebGPU Emoji Rain] User mappings imported (${Object.keys(finalMappings).length} entries)`, 'info');
        
        res.json({
          success: true,
          message: `Imported ${Object.keys(mappings).length} mappings`,
          total: Object.keys(finalMappings).length
        });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error importing user mappings: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete user mapping
    this.api.registerRoute('delete', '/api/webgpu-emoji-rain/user-mappings/:username', (req, res) => {
      try {
        const username = req.params.username;
        
        if (!fs.existsSync(this.userMappingsPath)) {
          return res.status(404).json({ success: false, error: 'No mappings found' });
        }
        
        const mappings = JSON.parse(fs.readFileSync(this.userMappingsPath, 'utf8'));
        
        if (!mappings[username]) {
          return res.status(404).json({ success: false, error: 'User mapping not found' });
        }
        
        delete mappings[username];
        
        fs.writeFileSync(this.userMappingsPath, JSON.stringify(mappings, null, 2));
        fs.writeFileSync(this.userConfigMappingsPath, JSON.stringify(mappings, null, 2));
        
        this.api.emit('webgpu-emoji-rain:user-mappings-update', { mappings });
        
        this.api.log(`🗑️ [WebGPU Emoji Rain] User mapping deleted: ${username}`, 'info');
        
        res.json({ success: true, message: `Mapping for ${username} deleted` });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error deleting user mapping: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Trigger emoji rain via API (for flows) - uses centralized trigger method
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/trigger', (req, res) => {
      try {
        const { emoji, count, duration, intensity, x, y, username, burst, spawnAreaPreset } = req.body;

        const config = this.getRuntimeConfig();

        if (!config.enabled) {
          return res.status(400).json({ success: false, error: 'Emoji rain is disabled' });
        }

        // Parse and validate coordinates if provided
        let parsedX = undefined;
        let parsedY = undefined;
        
        if (x !== undefined && x !== null && x !== '') {
          parsedX = parseFloat(x);
          if (isNaN(parsedX)) {
            this.api.log(`⚠️ [WebGPU Emoji Rain] Invalid x coordinate received: ${x}, will use random`, 'warn');
            parsedX = undefined;
          }
        }
        
        if (y !== undefined && y !== null && y !== '') {
          parsedY = parseFloat(y);
          if (isNaN(parsedY)) {
            this.api.log(`⚠️ [WebGPU Emoji Rain] Invalid y coordinate received: ${y}, will default to 0`, 'warn');
            parsedY = undefined;
          }
        }

        this.triggerEmojiRain({
          emoji: emoji || null,
          count: parseInt(count) || 10,
          duration: parseInt(duration) || 0,
          intensity: parseFloat(intensity) || 1.0,
          x: parsedX,
          y: parsedY,
          spawnAreaPreset,
          username: username || null,
          burst: Boolean(burst),
          reason: 'api',
          source: 'trigger-api'
        });

        this.metrics.flowTriggers++;

        res.json({
          success: true,
          message: 'Emoji rain triggered',
          count: parseInt(count) || 10,
          emoji: emoji || 'random'
        });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error triggering emoji rain: ${error.message}`, 'error');
        this.metrics.lastError = error.message;
        this.metrics.lastErrorTime = new Date().toISOString();
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Trigger Herzballons via API
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/herzballons', (req, res) => {
      try {
        const { count, username, profilePictureUrl, x } = req.body || {};
        const config = this.getRuntimeConfig();

        if (!config.enabled) {
          return res.status(400).json({ success: false, error: 'Emoji rain is disabled' });
        }

        if (config.heart_balloons_enabled === false) {
          return res.status(400).json({ success: false, error: 'Herzballons are disabled' });
        }

        let parsedX = undefined;
        if (x !== undefined && x !== null && x !== '') {
          parsedX = parseFloat(x);
          if (isNaN(parsedX) || parsedX < 0 || parsedX > 1) {
            parsedX = undefined;
          }
        }

        const spawnData = this.triggerHeartBalloons({
          count: parseInt(count, 10) || config.heart_balloon_test_count || 8,
          username: username || 'API User',
          profilePictureUrl: profilePictureUrl || null,
          x: parsedX,
          reason: 'api',
          source: 'api:herzballons'
        });

        this.metrics.flowTriggers++;

        res.json({ success: true, message: 'Herzballons triggered', data: spawnData });
      } catch (error) {
        this.api.log(`Error triggering Herzballons: ${error.message}`, 'error');
        this.metrics.lastError = error.message;
        this.metrics.lastErrorTime = new Date().toISOString();
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ===== PRESET MANAGEMENT ROUTES =====
    
    // Get all presets
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/presets', (req, res) => {
      try {
        const presets = this.loadPresets();
        res.json({ success: true, presets });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error getting presets: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get specific preset
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/presets/:id', (req, res) => {
      try {
        const presets = this.loadPresets();
        const preset = presets.find(p => p.id === req.params.id);
        
        if (!preset) {
          return res.status(404).json({ success: false, error: 'Preset not found' });
        }
        
        res.json({ success: true, preset });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error getting preset: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Create preset
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/presets', (req, res) => {
      try {
        const { name, emoji, count, intensity, duration, burst, spawnArea } = req.body;
        
        if (!name || !emoji) {
          return res.status(400).json({ success: false, error: 'name and emoji are required' });
        }
        
        const presets = this.loadPresets();
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        // Check if preset already exists
        if (presets.find(p => p.id === id)) {
          return res.status(409).json({ success: false, error: 'Preset with this name already exists' });
        }
        
        const newPreset = {
          id,
          name,
          emoji,
          count: parseInt(count) || 10,
          intensity: parseFloat(intensity) || 1.0,
          duration: parseInt(duration) || 0,
          burst: Boolean(burst),
          spawnArea: spawnArea || { x: 0.5, y: 0 }
        };
        
        presets.push(newPreset);
        this.savePresets(presets);
        
        this.api.log(`📋 [WebGPU Emoji Rain] Preset created: ${name}`, 'info');
        res.json({ success: true, preset: newPreset });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error creating preset: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update preset
    this.api.registerRoute('put', '/api/webgpu-emoji-rain/presets/:id', (req, res) => {
      try {
        const presets = this.loadPresets();
        const index = presets.findIndex(p => p.id === req.params.id);
        
        if (index === -1) {
          return res.status(404).json({ success: false, error: 'Preset not found' });
        }
        
        const { name, emoji, count, intensity, duration, burst, spawnArea } = req.body;
        
        presets[index] = {
          ...presets[index],
          ...(name && { name }),
          ...(emoji && { emoji }),
          ...(count !== undefined && { count: parseInt(count) }),
          ...(intensity !== undefined && { intensity: parseFloat(intensity) }),
          ...(duration !== undefined && { duration: parseInt(duration) }),
          ...(burst !== undefined && { burst: Boolean(burst) }),
          ...(spawnArea && { spawnArea })
        };
        
        this.savePresets(presets);
        
        this.api.log(`📋 [WebGPU Emoji Rain] Preset updated: ${req.params.id}`, 'info');
        res.json({ success: true, preset: presets[index] });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error updating preset: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete preset
    this.api.registerRoute('delete', '/api/webgpu-emoji-rain/presets/:id', (req, res) => {
      try {
        const presets = this.loadPresets();
        const filtered = presets.filter(p => p.id !== req.params.id);
        
        if (filtered.length === presets.length) {
          return res.status(404).json({ success: false, error: 'Preset not found' });
        }
        
        this.savePresets(filtered);
        
        this.api.log(`🗑️ [WebGPU Emoji Rain] Preset deleted: ${req.params.id}`, 'info');
        res.json({ success: true, message: 'Preset deleted' });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error deleting preset: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Trigger preset
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/presets/:id/trigger', (req, res) => {
      try {
        const config = this.getRuntimeConfig();
        
        if (!config.enabled) {
          return res.status(400).json({ success: false, error: 'Emoji rain is disabled' });
        }
        
        const presets = this.loadPresets();
        const preset = presets.find(p => p.id === req.params.id);
        
        if (!preset) {
          return res.status(404).json({ success: false, error: 'Preset not found' });
        }
        
        const { username } = req.body;
        
        this.triggerEmojiRain({
          ...preset,
          username: username || null,
          reason: 'preset',
          source: `preset:${preset.id}`
        });
        
        res.json({ success: true, message: `Preset "${preset.name}" triggered` });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error triggering preset: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ===== OVERLAY CONTROL ROUTES =====
    
    // Pause overlay
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/pause', (req, res) => {
      try {
        this.overlayState.paused = true;
        this.api.emit('webgpu-emoji-rain:pause', { paused: true });
        
        this.api.log('⏸️ [WebGPU Emoji Rain] Overlay paused', 'info');
        res.json({ success: true, message: 'Overlay paused' });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error pausing overlay: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Resume overlay
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/resume', (req, res) => {
      try {
        this.overlayState.paused = false;
        this.api.emit('webgpu-emoji-rain:resume', { paused: false });
        
        // Process queued spawns
        if (this.spawnQueue.length > 0) {
          const queued = [...this.spawnQueue];
          this.spawnQueue = [];
          queued.forEach(spawnData => {
            this.emitOverlaySpawn(spawnData);
          });
          this.api.log(`▶️ [WebGPU Emoji Rain] Overlay resumed, processed ${queued.length} queued spawns`, 'info');
        } else {
          this.api.log('▶️ [WebGPU Emoji Rain] Overlay resumed', 'info');
        }
        
        res.json({ success: true, message: 'Overlay resumed' });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error resuming overlay: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Clear overlay
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/clear', (req, res) => {
      try {
        this.api.emit('webgpu-emoji-rain:clear', {});
        this.spawnQueue = [];
        
        this.api.log('🧹 [WebGPU Emoji Rain] Overlay cleared', 'info');
        res.json({ success: true, message: 'Overlay cleared' });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error clearing overlay: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Set theme
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/theme', (req, res) => {
      try {
        const { theme } = req.body;
        
        if (!theme) {
          return res.status(400).json({ success: false, error: 'theme is required' });
        }
        
        this.overlayState.theme = theme;
        this.api.emit('webgpu-emoji-rain:theme', { theme });
        
        this.api.log(`🎨 [WebGPU Emoji Rain] Theme changed to: ${theme}`, 'info');
        res.json({ success: true, theme });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error setting theme: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Set opacity
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/opacity', (req, res) => {
      try {
        const { opacity } = req.body;
        
        if (opacity === undefined || opacity < 0 || opacity > 1) {
          return res.status(400).json({ success: false, error: 'opacity must be between 0 and 1' });
        }
        
        this.overlayState.opacity = parseFloat(opacity);
        this.api.emit('webgpu-emoji-rain:opacity', { opacity: this.overlayState.opacity });
        
        this.api.log(`🔆 [WebGPU Emoji Rain] Opacity set to: ${opacity}`, 'info');
        res.json({ success: true, opacity: this.overlayState.opacity });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error setting opacity: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Set speed
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/speed', (req, res) => {
      try {
        const { speed } = req.body;
        
        if (speed === undefined || speed <= 0 || speed > 5) {
          return res.status(400).json({ success: false, error: 'speed must be between 0.1 and 5' });
        }
        
        this.overlayState.speed = parseFloat(speed);
        this.api.emit('webgpu-emoji-rain:speed', { speed: this.overlayState.speed });
        
        this.api.log(`⚡ [WebGPU Emoji Rain] Speed set to: ${speed}`, 'info');
        res.json({ success: true, speed: this.overlayState.speed });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error setting speed: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Set bounding box
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/bounding-box', (req, res) => {
      try {
        const { x, y, width, height } = req.body;
        
        const boundingBox = {
          x: parseFloat(x) || 0,
          y: parseFloat(y) || 0,
          width: parseFloat(width) || 1,
          height: parseFloat(height) || 1
        };
        this.overlayState.boundingBox = boundingBox;
        
        this.api.emit('webgpu-emoji-rain:bounding-box', { boundingBox });
        
        this.api.log(`📐 [WebGPU Emoji Rain] Bounding box set: ${JSON.stringify(boundingBox)}`, 'info');
        res.json({ success: true, boundingBox });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error setting bounding box: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get overlay state
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/overlay/state', (req, res) => {
      try {
        res.json({
          success: true,
          state: this.overlayState,
          queuedSpawns: this.spawnQueue.length
        });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error getting overlay state: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ===== TELEMETRY & DEBUG ROUTES =====
    
    // Get metrics
    this.api.registerRoute('get', '/api/webgpu-emoji-rain/metrics', (req, res) => {
      try {
        res.json({
          success: true,
          metrics: this.metrics,
          overlay: {
            state: this.overlayState,
            queuedSpawns: this.spawnQueue.length
          },
          renderer: this.rendererMetrics,
          antiSpam: {
            globalTriggerCount: this.globalTriggerCount,
            maxTriggers: this.globalMaxTriggers,
            activeCooldowns: this.userCooldowns.size
          }
        });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error getting metrics: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Reset metrics
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/metrics/reset', (req, res) => {
      try {
        this.metrics = {
          totalTriggers: 0,
          commandTriggers: 0,
          eventTriggers: 0,
          flowTriggers: 0,
          droppedEvents: 0,
          totalEmojisSpawned: 0,
          avgCount: 0,
          avgIntensity: 0,
          lastError: null,
          lastErrorTime: null
        };
        
        this.api.log('📊 [WebGPU Emoji Rain] Metrics reset', 'info');
        res.json({ success: true, message: 'Metrics reset' });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error resetting metrics: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Toggle debug mode
    this.api.registerRoute('post', '/api/webgpu-emoji-rain/debug', (req, res) => {
      try {
        const { enabled } = req.body;
        
        if (enabled === undefined) {
          return res.status(400).json({ success: false, error: 'enabled is required' });
        }
        
        this.debugMode = Boolean(enabled);
        
        if (this.debugMode) {
          this.debugLogCount = 0; // Reset counter when enabling
        }
        
        this.api.log(`🐛 [WebGPU Emoji Rain] Debug mode ${this.debugMode ? 'enabled' : 'disabled'}`, 'info');
        res.json({ success: true, debugMode: this.debugMode });
      } catch (error) {
        this.api.log(`❌ [WebGPU Emoji Rain] Error toggling debug mode: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Serve uploaded files
    const express = require('express');
    const registerMiddleware = typeof this.api.registerMiddleware === 'function'
      ? this.api.registerMiddleware.bind(this.api)
      : (routePath, handler) => this.api.getApp().use(routePath, handler);
    registerMiddleware('/plugins/webgpu-emoji-rain/uploads', express.static(this.uploadDir));
    registerMiddleware('/uploads/webgpu-emoji-rain', express.static(this.uploadDir));

    this.api.log('✅ [WebGPU Emoji Rain] All routes registered successfully', 'info');
  }

  registerTikTokEventHandlers() {
    this.api.registerTikTokEvent('streamSessionStarted', (data) => {
      this.handleHeartBalloonStreamSession(data);
    });
    this.api.registerTikTokEvent('connected', (data) => {
      this.handleHeartBalloonStreamSession(data, { requireIsNewStream: true });
    });

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

    // Emote (Sticker) Event
    this.api.registerTikTokEvent('emote', (data) => {
      this.handleStickerEvent(data);
    });

    this.api.log('✅ WebGPU Emoji Rain TikTok event handlers registered', 'info');
  }

  /**
   * Spawn emojis for emoji rain effect (enhanced with scaling and anti-spam)
   * @param {string} reason - Event type (gift, like, follow, etc.)
   * @param {object} data - Event data
   * @param {number} count - Number of emojis to spawn
   * @param {string} emoji - Optional specific emoji
   */
  spawnEmojiRain(reason, data, count = null, emoji = null) {
    try {
      const config = this.getRuntimeConfig();

      if (!config.enabled) {
        return;
      }

      const username = data.uniqueId || data.username || 'Unknown';

      // One shared flood gate must run before gift-ball, heart-balloon, or
      // regular-rain side effects. Previously the special renderers bypassed
      // the counter because they were emitted before this check.
      if (this.globalTriggerCount >= this.globalMaxTriggers) {
        this.metrics.droppedEvents++;
        this.debugLog(`Dropped event from ${username}: global flood gate`);
        return;
      }
      this.globalTriggerCount++;

      if (reason === 'gift' && config.gift_balls_enabled === true) {
        this.triggerGiftBall({
          giftId: data.giftId,
          giftName: data.giftName,
          giftPictureUrl: data.giftPictureUrl,
          giftImageUrl: data.giftImageUrl,
          imageUrl: data.imageUrl,
          diamondCount: data.diamondCount,
          diamond_count: data.diamond_count,
          coins: data.coins,
          repeatCount: data.repeatCount,
          repeat_count: data.repeat_count,
          comboCount: data.comboCount,
          combo_count: data.combo_count,
          seriesCount: data.seriesCount,
          series_count: data.series_count,
          gift: data.gift,
          username,
          reason,
          source: 'event:gift'
        });
      }

      if (reason === 'like' && config.heart_balloons_enabled !== false) {
        this.triggerHeartBalloons({
          count: this.getHeartBalloonCount(config, data),
          username,
          profilePictureUrl: this.getProfilePictureUrl(data),
          reason,
          source: 'event:like'
        });
      }
      
      // Log event data for debugging
      this.debugLog(`Event received: ${reason} from ${username}`);

      // Calculate count based on reason if not provided (matching original logic)
      if (!count) {
        if (reason === 'gift' && data.coins) {
          // Enhanced: scale by gift value with caps
          const baseEmojis = config.gift_base_emojis || 5;
          const coinMultiplier = config.gift_coin_multiplier || 0.5;
          const maxEmojis = config.max_count_per_event || config.gift_max_emojis || 50;
          
          count = baseEmojis + Math.floor(data.coins * coinMultiplier);
          count = Math.min(maxEmojis, count);
          
          // SuperFan multiplier
          const superFanLevel = this.checkSuperFanLevel(data);
          if (superFanLevel) {
            const superFanMultiplier = config.superfan_intensity_multiplier || 1.5;
            count = Math.floor(count * superFanMultiplier);
            count = Math.min(maxEmojis, count);
          }
        } else if (reason === 'like' && data.likeCount) {
          const likeDivisor = config.like_count_divisor || 10;
          const minEmojis = config.like_min_emojis || 1;
          const maxEmojis = config.like_max_emojis || 20;
          
          count = Math.floor(data.likeCount / likeDivisor);
          count = Math.max(minEmojis, Math.min(maxEmojis, count));
        } else {
          count = 3; // Default for follow, share, subscribe
        }
      }

      // Select random emoji from config if not specified
      if (!emoji && config.emoji_set && config.emoji_set.length > 0) {
        emoji = config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)];
      }

      // Check for SuperFan level and trigger burst if enabled
      const superFanLevel = this.checkSuperFanLevel(data);
      const isBurst = superFanLevel && (config.superfan_burst_enabled !== false);
      
      // Calculate intensity based on SuperFan level
      let intensity = 1.0;
      if (superFanLevel) {
        intensity = 1 + (superFanLevel * 0.3); // 1.3x for level 1, 1.6x for level 2, 1.9x for level 3
      }

      // Use centralized trigger method
      this.triggerEmojiRain({
        emoji,
        count,
        intensity,
        duration: 0,
        burst: isBurst,
        username,
        profilePictureUrl: this.getProfilePictureUrl(data),
        reason,
        source: `event:${reason}`
      });

      this.metrics.eventTriggers++;

      this.debugLog(`Spawned: ${count}x ${emoji} for ${username} (${reason})${isBurst ? ' [BURST]' : ''}`);
    } catch (error) {
      this.api.log(`❌ [WebGPU Emoji Rain] Error spawning emoji rain: ${error.message}`, 'error');
      this.metrics.lastError = error.message;
      this.metrics.lastErrorTime = new Date().toISOString();
    }
  }

  /**
   * Handle sticker events from TikTok
   * Triggers sticker rain or burst based on fan level
   * @param {object} data - Emote event data
   */
  handleStickerEvent(data) {
    try {
      const config = this.getRuntimeConfig();

      // Check if sticker feature is enabled
      if (!config.enabled || !config.sticker_enabled) {
        return;
      }

      const username = data.uniqueId || data.username || 'Unknown';
      const stickerImageUrl = data.emoteImageUrl || data.image_url;
      
      // Must have sticker image URL
      if (!stickerImageUrl) {
        this.debugLog(`No sticker image URL found for user ${username}`);
        return;
      }

      // Check cooldowns
      const now = Date.now();
      const teamMemberLevel = data.teamMemberLevel || 0;
      const isSuperFan = teamMemberLevel >= 1;

      // Determine cooldown time based on user type
      const cooldownTime = isSuperFan
        ? (config.sticker_superfan_cooldown_ms ?? 5000)
        : (config.sticker_user_cooldown_ms ?? 10000);

      // Check user-specific cooldown
      const lastTrigger = this.userCooldowns.get(`sticker:${username}`);
      if (lastTrigger && (now - lastTrigger) < cooldownTime) {
        this.debugLog(`Sticker cooldown active for ${username} (${Math.ceil((cooldownTime - (now - lastTrigger)) / 1000)}s remaining)`);
        return;
      }

      // Calculate sticker count based on fan level
      const baseCount = config.sticker_base_count ?? 5;
      const fanLevelMultiplier = config.sticker_fan_level_multiplier ?? 3;
      const maxCount = config.sticker_max_count ?? 30;
      
      let count = baseCount + (teamMemberLevel * fanLevelMultiplier);
      count = Math.min(count, maxCount);

      // Check if SuperFan burst is enabled
      const isBurst = isSuperFan && (config.sticker_superfan_burst_enabled !== false);

      // Calculate intensity based on fan level
      let intensity = 1.0;
      if (isSuperFan) {
        intensity = 1 + (teamMemberLevel * 0.3); // 1.3x for level 1, 1.6x for level 2, etc.
      }

      // Update cooldown
      this.userCooldowns.set(`sticker:${username}`, now);

      // Trigger the sticker rain/burst
      this.triggerEmojiRain({
        emoji: stickerImageUrl, // Use sticker image URL as emoji
        count,
        intensity,
        duration: 0,
        burst: isBurst,
        username,
        profilePictureUrl: data.profilePictureUrl || null,
        reason: 'sticker',
        source: 'event:sticker'
      });

      this.metrics.eventTriggers++;

      this.api.log(
        `🎭 [WebGPU Emoji Rain] Sticker ${isBurst ? 'BURST' : 'RAIN'}: ${count}x sticker by ${username} (Fan Level: ${teamMemberLevel})`,
        'info'
      );

      this.debugLog(`Sticker spawned: ${count}x for ${username} (level ${teamMemberLevel})${isBurst ? ' [BURST]' : ''}`);
    } catch (error) {
      this.api.log(`❌ [WebGPU Emoji Rain] Error handling sticker event: ${error.message}`, 'error');
      this.metrics.lastError = error.message;
      this.metrics.lastErrorTime = new Date().toISOString();
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
      this.api.log('⚠️ [WebGPU Emoji Rain] Flow system not available, skipping flow action registration', 'warn');
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
        try {
          this.triggerEmojiRain({
            emoji: params.emoji || null,
            count: params.count || 10,
            duration: params.duration || 0,
            intensity: params.intensity || 1.0,
            username: eventData.username || eventData.uniqueId || null,
            burst: params.burst || false,
            reason: 'flow',
            source: 'flow-trigger'
          });
          return { success: true, message: 'Emoji rain triggered' };
        } catch (error) {
          this.api.log(`❌ [WebGPU Emoji Rain] Flow trigger error: ${error.message}`, 'error');
          return { success: false, error: error.message };
        }
      }
    });

    // Register "Trigger Preset" action
    this.api.registerFlowAction('webgpu_emoji_rain_preset', {
      name: 'Trigger WebGPU Emoji Rain Preset',
      description: 'Trigger a predefined emoji rain preset',
      icon: '📋',
      category: 'effects',
      parameters: {
        presetId: {
          type: 'text',
          label: 'Preset ID',
          description: 'ID of the preset to trigger',
          default: 'gentle-rain'
        }
      },
      execute: async (params, eventData) => {
        try {
          const presets = this.loadPresets();
          const preset = presets.find(p => p.id === params.presetId);
          
          if (!preset) {
            return { success: false, error: `Preset "${params.presetId}" not found` };
          }
          
          this.triggerEmojiRain({
            ...preset,
            username: eventData.username || eventData.uniqueId || null,
            reason: 'flow',
            source: `flow-preset:${preset.id}`
          });
          
          return { success: true, message: `Preset "${preset.name}" triggered` };
        } catch (error) {
          this.api.log(`❌ [WebGPU Emoji Rain] Flow preset error: ${error.message}`, 'error');
          return { success: false, error: error.message };
        }
      }
    });

    // Register "Burst Effect" action
    this.api.registerFlowAction('webgpu_emoji_rain_burst', {
      name: 'WebGPU Emoji Rain Burst',
      description: 'Trigger an instant burst effect',
      icon: '💥',
      category: 'effects',
      parameters: {
        emoji: {
          type: 'text',
          label: 'Emoji',
          description: 'Emoji to burst',
          default: '⭐'
        },
        count: {
          type: 'number',
          label: 'Count',
          description: 'Number of emojis',
          default: 30,
          min: 5,
          max: 100
        }
      },
      execute: async (params, eventData) => {
        try {
          this.triggerEmojiRain({
            emoji: params.emoji || '⭐',
            count: params.count || 30,
            intensity: 1.5,
            duration: 0,
            burst: true,
            username: eventData.username || eventData.uniqueId || null,
            reason: 'flow',
            source: 'flow-burst'
          });
          return { success: true, message: 'Burst effect triggered' };
        } catch (error) {
          this.api.log(`❌ [WebGPU Emoji Rain] Flow burst error: ${error.message}`, 'error');
          return { success: false, error: error.message };
        }
      }
    });

    // Register "Herzballons" action
    this.api.registerFlowAction('webgpu_emoji_rain_heart_balloons', {
      name: 'Herzballons',
      description: 'Spawn rising heart balloons with the viewer profile picture every fifth balloon',
      icon: '♥',
      category: 'effects',
      parameters: {
        count: {
          type: 'number',
          label: 'Count',
          description: 'Number of heart balloons to spawn',
          default: 8,
          min: 1,
          max: 50
        }
      },
      execute: async (params, eventData) => {
        try {
          this.triggerHeartBalloons({
            count: params.count || 8,
            username: eventData.username || eventData.uniqueId || null,
            profilePictureUrl: this.getProfilePictureUrl(eventData),
            reason: 'flow',
            source: 'flow-heart-balloons'
          });
          return { success: true, message: 'Herzballons triggered' };
        } catch (error) {
          this.api.log(`Error triggering Herzballons flow: ${error.message}`, 'error');
          return { success: false, error: error.message };
        }
      }
    });

    // Register "Clear Overlay" action
    this.api.registerFlowAction('webgpu_emoji_rain_clear', {
      name: 'Clear WebGPU Emoji Rain',
      description: 'Clear all emojis from the overlay',
      icon: '🧹',
      category: 'effects',
      parameters: {},
      execute: async (params, eventData) => {
        try {
          this.api.emit('webgpu-emoji-rain:clear', {});
          this.spawnQueue = [];
          return { success: true, message: 'Overlay cleared' };
        } catch (error) {
          this.api.log(`❌ [WebGPU Emoji Rain] Flow clear error: ${error.message}`, 'error');
          return { success: false, error: error.message };
        }
      }
    });

    this.api.log('✅ [WebGPU Emoji Rain] Enhanced flow actions registered (5 actions)', 'info');
  }

  async destroy() {
    this.api.log('🌧️ [WebGPU Emoji Rain] Shutting down plugin...', 'info');
    
    // Stop spawn batch processor
    if (this.spawnBatchInterval) {
      clearInterval(this.spawnBatchInterval);
      this.spawnBatchInterval = null;
    }

    if (this.globalTriggerResetInterval) {
      clearInterval(this.globalTriggerResetInterval);
      this.globalTriggerResetInterval = null;
    }

    for (const interval of this.durationIntervals) clearInterval(interval);
    this.durationIntervals.clear();
    this.spawnQueue.length = 0;
    this.userCooldowns.clear();
    
    // Unregister GCCE commands
    if (this.gcce) {
      try {
        this.gcce.unregisterCommandsForPlugin('webgpu-emoji-rain');
        this.api.log('✅ [WebGPU Emoji Rain] GCCE commands unregistered', 'info');
      } catch (error) {
        this.api.log(`⚠️ [WebGPU Emoji Rain] Error unregistering GCCE commands: ${error.message}`, 'warn');
      }
    }
    
    this.api.log('🌧️ [WebGPU Emoji Rain] Plugin destroyed', 'info');
  }
}

module.exports = WebGPUEmojiRainPlugin;
