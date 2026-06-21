/**
 * Sidekick Plugin - Main Entry Point
 * 
 * Intelligent stream assistant for LTTH with:
 * - AnimazingPal Brain, avatar and Fish.audio integration
 * - TikTok event processing and analysis
 * - User memory with decay
 * - Message batching and rate limiting
 * - Relevance scoring for responses
 * - Stream analytics and metrics
 * - GCCE command integration
 * 
 * Based on pal_ALONE.py functionality, adapted for LTTH plugin system.
 */

const path = require('path');
const multer = require('multer');
const {
  ConfigManager,
  ASR_SERVICE_MAX_AUDIO_BYTES,
  normalizeAsrLanguage
} = require('./backend/config');
const MemoryStore = require('./backend/memoryStore');
const { EventBus, EventTypes } = require('./backend/eventBus');
const EventDeduper = require('./backend/deduper');
const { RateLimitManager } = require('./backend/rateLimit');
const { ResponseEngine } = require('./backend/responseEngine');
const OutboxBatcher = require('./backend/outboxBatcher');
const Metrics = require('./backend/metrics');
const { ConversationCoordinator } = require('./backend/conversation-coordinator');

const ASR_AUDIO_FIELD = 'audio';
const ASR_SAFE_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/opus',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3'
]);
const ASR_OCTET_AUDIO_EXTENSIONS = new Set(['.webm', '.ogg', '.opus', '.wav', '.mp3', '.mpeg']);

/**
 * Sidekick Plugin Class
 */
class SidekickPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
    
    // Logger wrapper
    this.logger = {
      info: (msg) => this.api.log(msg, 'info'),
      error: (msg) => this.api.log(msg, 'error'),
      warn: (msg) => this.api.log(msg, 'warn'),
      debug: (msg) => this.api.log(msg, 'debug')
    };
    
    // Components (initialized in init())
    this.configManager = null;
    this.config = null;
    this.memoryStore = null;
    this.eventBus = null;
    this.deduper = null;
    this.rateLimiter = null;
    this.responseEngine = null;
    this.outboxBatcher = null;
    this.metrics = null;
    this.conversationCoordinator = null;
    
    // Join greeting state
    this.pendingJoins = new Set();
    this.viewers = new Map();
    this.greetTasks = new Map();
    this.lastOutputTime = 0;
    this.lastJoinAnnounceTime = 0;
    
    // Cleanup timer
    this.cleanupInterval = null;
    this.joinAnnouncerInterval = null;

    this.asrDiagnostics = this._createEmptyAsrDiagnostics();
  }
  
  /**
   * Initialize the plugin
   */
  async init() {
    this.logger.info('🤖 Initializing Sidekick Plugin...');
    
    try {
      // Initialize configuration
      this.configManager = new ConfigManager(this.api);
      this.config = this.configManager.load();

      // Initialize host/viewer conversation coordinator
      this.conversationCoordinator = new ConversationCoordinator(this.config.conversation || {});
      
      // Initialize memory store
      this.memoryStore = new MemoryStore(this.api, this.config);
      
      // Initialize event bus
      this.eventBus = new EventBus(this.api);
      
      // Initialize deduper
      this.deduper = new EventDeduper(this.config.dedupeTtl || 600);
      
      // Initialize rate limiter
      this.rateLimiter = new RateLimitManager(this.api, this.config);
      
      // Initialize metrics
      this.metrics = new Metrics(this.api);
      
      // Initialize response engine
      this.responseEngine = new ResponseEngine(this.api, this.config, this.memoryStore);
      
      // Initialize outbox batcher
      this.outboxBatcher = new OutboxBatcher(this.api, this.config, (text) => {
        this._sendOutput(text).catch((error) => {
          this.logger.error(`Sidekick output failed: ${error.message}`);
        });
      });
      this._syncAnimazingPalMode();
      
      // Register routes
      this._registerRoutes();
      
      // Register socket events
      this._registerSocketEvents();
      
      // Register TikTok events
      this._registerTikTokEvents();
      
      // Register GCCE commands
      this._registerGCCECommands();
      
      // Start cleanup timer
      this.cleanupInterval = setInterval(() => {
        this.memoryStore.cleanupDecayed();
      }, 3600000); // Every hour
      
      // Start join announcer
      this._startJoinAnnouncer();
      
      this.logger.info('✅ Sidekick Plugin initialized successfully');
      this.logger.info('   - Admin UI: /sidekick/ui');
      this.logger.info('   - Overlay: /overlay/sidekick/hud');
      
    } catch (error) {
      this.logger.error(`Failed to initialize Sidekick: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Clean up and destroy the plugin
   */
  async destroy() {
    this.logger.info('Destroying Sidekick Plugin...');
    
    // Clear timers
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.joinAnnouncerInterval) {
      clearInterval(this.joinAnnouncerInterval);
      this.joinAnnouncerInterval = null;
    }
    
    // Clear greet tasks
    for (const task of this.greetTasks.values()) {
      clearTimeout(task);
    }
    this.greetTasks.clear();
    
    // Destroy components
    if (this.outboxBatcher) {
      this.outboxBatcher.destroy();
    }
    
    if (this.eventBus) {
      this.eventBus.destroy();
    }
    
    if (this.deduper) {
      this.deduper.destroy();
    }
    
    if (this.rateLimiter) {
      this.rateLimiter.destroy();
    }
    
    if (this.metrics) {
      this.metrics.destroy();
    }

    const animazingPal = this.api.getPluginInstance?.('animazingpal') || this.api.getPlugin?.('animazingpal');
    animazingPal?.clearLiveHostOperatingModeOverride?.();
    
    this.logger.info('Sidekick Plugin destroyed');
  }
  
  // ==================== Routes ====================
  
  _registerRoutes() {
    // Serve UI page
    this.api.registerRoute('get', '/sidekick/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui.html'));
    });
    
    // Serve overlay page
    this.api.registerRoute('get', '/overlay/sidekick/hud', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay', 'sidekick-hud.html'));
    });
    
    // Get status
    this.api.registerRoute('get', '/api/sidekick/status', (req, res) => {
      res.json({
        success: true,
        status: this._getStatus()
      });
    });

    this.api.registerRoute('get', '/api/sidekick/asr/status', (req, res) => {
      res.json({
        success: true,
        status: this._getAsrStatus()
      });
    });

    this.api.registerRoute('post', '/api/sidekick/asr/transcribe', (req, res) => {
      return this._handleAsrUploadRoute(req, res);
    });
    
    // Get configuration
    this.api.registerRoute('get', '/api/sidekick/config', (req, res) => {
      res.json({
        success: true,
        config: this.config
      });
    });
    
    // Update configuration
    this.api.registerRoute('post', '/api/sidekick/config', (req, res) => {
      try {
        this.config = this.configManager.update(req.body);
        this._updateComponents();
        this._emitStatus();
        res.json({ success: true, config: this.config });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Get metrics
    this.api.registerRoute('get', '/api/sidekick/metrics', (req, res) => {
      res.json({
        success: true,
        metrics: this.metrics.getSummary()
      });
    });
    
    // Get metrics history
    this.api.registerRoute('get', '/api/sidekick/metrics/history', (req, res) => {
      const count = parseInt(req.query.count) || 30;
      res.json({
        success: true,
        history: this.metrics.getHistoricalData(count)
      });
    });
    
    // Get memory stats
    this.api.registerRoute('get', '/api/sidekick/memory/stats', (req, res) => {
      res.json({
        success: true,
        stats: this.memoryStore.getStats()
      });
    });
    
    // Search users
    this.api.registerRoute('get', '/api/sidekick/memory/search', (req, res) => {
      const query = req.query.q || '';
      const limit = parseInt(req.query.limit) || 20;
      const users = this.memoryStore.searchUsers(query, limit);
      res.json({ success: true, users });
    });
    
    // Get top users
    this.api.registerRoute('get', '/api/sidekick/memory/top', (req, res) => {
      const limit = parseInt(req.query.limit) || 10;
      const users = this.memoryStore.getTopUsers(limit);
      res.json({ success: true, users });
    });

    // Keep the wildcard route after every concrete /memory endpoint.
    this.api.registerRoute('get', '/api/sidekick/memory/:uid', (req, res) => {
      const user = this.memoryStore.getUser(req.params.uid);
      res.json({ success: true, user });
    });
    
    // Clear memory
    this.api.registerRoute('post', '/api/sidekick/memory/clear', (req, res) => {
      this.memoryStore.clearAll();
      res.json({ success: true, message: 'Memory cleared' });
    });
    
    // Get event analytics
    this.api.registerRoute('get', '/api/sidekick/analytics', (req, res) => {
      res.json({
        success: true,
        analytics: this.eventBus.getAnalytics()
      });
    });
    
    // Get recent events
    this.api.registerRoute('get', '/api/sidekick/events', (req, res) => {
      const type = req.query.type || null;
      const limit = parseInt(req.query.limit) || 50;
      res.json({
        success: true,
        events: this.eventBus.getRecentEvents(type, limit)
      });
    });
    
    // Get deduper stats
    this.api.registerRoute('get', '/api/sidekick/deduper/stats', (req, res) => {
      res.json({
        success: true,
        stats: this.deduper.getStats()
      });
    });
    
    // Get rate limiter status
    this.api.registerRoute('get', '/api/sidekick/ratelimit/status', (req, res) => {
      res.json({
        success: true,
        status: this.rateLimiter.getStatus()
      });
    });
    
    // Reuse AnimazingPal's shared output connection.
    this.api.registerRoute('post', '/api/sidekick/animaze/connect', async (req, res) => {
      try {
        const animazingPal = this._getAnimazingPal();
        if (!animazingPal || typeof animazingPal.connect !== 'function') {
          return res.status(503).json({ success: false, error: 'AnimazingPal unavailable' });
        }
        const connected = await animazingPal.connect();
        this._emitStatus();
        res.json({ success: connected, isConnected: !!animazingPal.isConnected });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Disconnect from AnimazingPal output.
    this.api.registerRoute('post', '/api/sidekick/animaze/disconnect', (req, res) => {
      this._getAnimazingPal()?.disconnect?.();
      this._emitStatus();
      res.json({ success: true, isConnected: false });
    });
    
    // Get AnimazingPal output status.
    this.api.registerRoute('get', '/api/sidekick/animaze/status', (req, res) => {
      res.json({
        success: true,
        status: this._getAnimazingPalStatus()
      });
    });
    
    // Send test message through AnimazingPal/Fish.audio.
    this.api.registerRoute('post', '/api/sidekick/animaze/test', async (req, res) => {
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, error: 'Message required' });
      }
      
      const success = await this._sendOutput(message);
      res.json({ success });
    });
    
    // Get outbox batcher status
    this.api.registerRoute('get', '/api/sidekick/outbox/status', (req, res) => {
      res.json({
        success: true,
        status: this.outboxBatcher.getStatus(),
        stats: this.outboxBatcher.getStats()
      });
    });
    
    // Flush outbox
    this.api.registerRoute('post', '/api/sidekick/outbox/flush', (req, res) => {
      const message = this.outboxBatcher.flush();
      res.json({ success: true, message });
    });
    
    // Toggle mute
    this.api.registerRoute('post', '/api/sidekick/mute', (req, res) => {
      const { muted } = req.body;
      this.config.muted = muted !== undefined ? muted : !this.config.muted;
      this.configManager.save();
      this._emitStatus();
      res.json({ success: true, muted: this.config.muted });
    });
    
    // Reset session
    this.api.registerRoute('post', '/api/sidekick/reset', (req, res) => {
      this.eventBus.resetSession();
      this.metrics.resetSession();
      this.pendingJoins.clear();
      this.viewers.clear();
      this._emitStatus();
      res.json({ success: true, message: 'Session reset' });
    });
  }
  
  // ==================== Socket Events ====================
  
  _registerSocketEvents() {
    // Client requests status
    this.api.registerSocket('sidekick:get-status', () => {
      this._emitStatus();
    });
    
    // Client requests metrics
    this.api.registerSocket('sidekick:get-metrics', () => {
      this.io.emit('sidekick:metrics', this.metrics.getSummary());
    });
  }
  
  // ==================== TikTok Events ====================
  
  _registerTikTokEvents() {
    // Chat events
    this.api.registerTikTokEvent('chat', (data) => {
      this._handleChat(data);
    });
    
    // Gift events
    this.api.registerTikTokEvent('gift', (data) => {
      this._handleGift(data);
    });
    
    // Like events
    this.api.registerTikTokEvent('like', (data) => {
      this._handleLike(data);
    });
    
    // Join events
    this.api.registerTikTokEvent('join', (data) => {
      this._handleJoin(data);
    });
    
    // Follow events
    this.api.registerTikTokEvent('follow', (data) => {
      this._handleFollow(data);
    });
    
    // Share events
    this.api.registerTikTokEvent('share', (data) => {
      this._handleShare(data);
    });
    
    // Subscribe events
    this.api.registerTikTokEvent('subscribe', (data) => {
      this._handleSubscribe(data);
    });
    
    this.logger.info('TikTok event handlers registered for Sidekick');
  }
  
  // ==================== GCCE Integration ====================
  
  _registerGCCECommands() {
    try {
      // Listen for GCCE ready event
      this.api.on('gcce:ready', () => {
        this.logger.info('GCCE detected, registering Sidekick commands');
        const gccePlugin = this.api.getPlugin?.('gcce');
        
        if (gccePlugin && gccePlugin.registry) {
          // Register sidekick command
          gccePlugin.registry.registerCommand({
            name: 'sidekick',
            pluginId: 'sidekick',
            description: 'Sidekick stream assistant controls',
            usage: '!sidekick <status|mute|joins|threshold|memory>',
            category: 'Sidekick',
            permission: 'moderator',
            cooldown: 3,
            handler: (context) => this._handleSidekickCommand(context)
          });
          
          // Register sk alias
          gccePlugin.registry.registerCommand({
            name: 'sk',
            pluginId: 'sidekick',
            description: 'Sidekick shortcut (alias for !sidekick)',
            usage: '!sk <subcommand>',
            category: 'Sidekick',
            permission: 'moderator',
            cooldown: 3,
            handler: (context) => this._handleSidekickCommand(context)
          });
          
          this.logger.info('✅ Sidekick commands registered with GCCE');
        }
      });
    } catch (error) {
      this.logger.warn(`GCCE integration not available: ${error.message}`);
    }
  }
  
  /**
   * Handle sidekick command from GCCE
   */
  _handleSidekickCommand(context) {
    const { args, username } = context;
    const subcommand = args[0]?.toLowerCase();
    
    switch (subcommand) {
      case 'status':
        const status = this._getStatus();
        return {
          success: true,
          message: `Sidekick: ${status.muted ? 'Muted' : 'Active'} | AnimazingPal: ${status.animaze.isConnected ? 'Connected' : 'Disconnected'} | Events: ${status.session.totalEvents}/min`
        };
        
      case 'mute':
        const muteArg = args[1]?.toLowerCase();
        if (muteArg === 'on') {
          this.config.muted = true;
        } else if (muteArg === 'off') {
          this.config.muted = false;
        } else {
          this.config.muted = !this.config.muted;
        }
        this.configManager.save();
        this._emitStatus();
        return {
          success: true,
          message: `Sidekick ${this.config.muted ? 'muted' : 'unmuted'}`
        };
        
      case 'joins':
        const joinsArg = args[1]?.toLowerCase();
        if (joinsArg === 'on') {
          this.config.joinRules.enabled = true;
        } else if (joinsArg === 'off') {
          this.config.joinRules.enabled = false;
        } else {
          this.config.joinRules.enabled = !this.config.joinRules.enabled;
        }
        this.configManager.save();
        return {
          success: true,
          message: `Join greetings ${this.config.joinRules.enabled ? 'enabled' : 'disabled'}`
        };
        
      case 'threshold':
        const thresholdArg = parseFloat(args[1]);
        if (!isNaN(thresholdArg) && thresholdArg >= 0 && thresholdArg <= 1) {
          this.config.comment.replyThreshold = thresholdArg;
          this.configManager.save();
          this.responseEngine.updateConfig(this.config);
          return {
            success: true,
            message: `Reply threshold set to ${thresholdArg}`
          };
        }
        return {
          success: false,
          message: 'Invalid threshold (0.0 - 1.0)'
        };
        
      case 'memory':
        const memoryArg = args[1]?.toLowerCase();
        if (memoryArg === 'clear') {
          this.memoryStore.clearAll();
          return {
            success: true,
            message: 'Memory cleared'
          };
        }
        const stats = this.memoryStore.getStats();
        return {
          success: true,
          message: `Memory: ${stats.userCount} users tracked`
        };
        
      default:
        return {
          success: false,
          message: 'Usage: !sidekick <status|mute|joins|threshold|memory>'
        };
    }
  }
  
  // ==================== Event Handlers ====================
  
  _handleChat(data) {
    const uid = data.uniqueId || data.userId || '';
    if (!uid) return;
    
    const nickname = data.nickname || uid;
    const comment = (data.comment || '').trim();
    
    if (!comment || comment.length < (this.config.comment?.minLength || 3)) {
      return;
    }
    
    // Create signature for deduplication
    const signature = `chat_${uid}_${comment.toLowerCase().substring(0, 50)}`;
    if (this.deduper.seen(signature)) {
      this.metrics.recordDedupeHit();
      return;
    }
    
    // Touch viewer
    this._touchViewer(uid, nickname);
    
    // Record event
    this.eventBus.publishChat(uid, nickname, comment);
    this.metrics.recordChat(uid, nickname);
    
    // Remember in memory
    this.memoryStore.rememberEvent(uid, {
      nickname,
      message: comment
    });
    
    // Skip response if muted
    if (this.config.muted) return;
    
    // Check if comment processing is enabled
    if (!this.config.comment?.enabled) return;
    
    // Evaluate for response
    this._processComment(uid, nickname, comment).catch((error) => {
      this.logger.error(`Sidekick chat dispatch failed: ${error.message}`);
      this.metrics?.recordError?.();
    });
  }
  
  async _processComment(uid, nickname, comment) {
    // Check global rate limit
    if (!this.rateLimiter.canSendGlobal()) {
      return;
    }
    
    // Check per-user cooldown
    if (this.rateLimiter.isUserOnCooldown(uid)) {
      return;
    }
    
    // Evaluate relevance
    const evaluation = this.responseEngine.evaluateChat(uid, nickname, comment);
    
    if (!evaluation) return;
    
    // Handle greeting with special cooldown
    if (evaluation.type === 'greeting') {
      if (!this.rateLimiter.canGreetUser(uid)) {
        return;
      }
      this.rateLimiter.setGreetingCooldown(uid);
      this.memoryStore.updateLastGreet(uid);
    }
    
    // Reserve cooldowns before async delegation so concurrent selected chats
    // cannot all pass the rate-limit check while the first response is pending.
    this.rateLimiter.setGlobalCooldown();
    this.rateLimiter.setUserCooldown(uid);

    try {
      await this._dispatchSelectedEvent('chat', { uniqueId: uid, nickname, comment }, evaluation);
    } catch (error) {
      this.logger.error(`Sidekick chat dispatch failed: ${error.message}`);
      this.metrics?.recordError?.();
    }
    
    // Record response
  }
  
  _handleGift(data) {
    const uid = data.uniqueId || data.userId || '';
    if (!uid) return;
    
    const nickname = data.nickname || uid;
    const giftName = data.giftName || 'Gift';
    const giftId = data.giftId;
    const diamondCount = data.diamondCount || 1;
    const repeatCount = data.repeatCount || 1;
    
    // Create signature
    const signature = `gift_${uid}_${giftName}_${repeatCount}`;
    if (this.deduper.seen(signature)) {
      this.metrics.recordDedupeHit();
      return;
    }
    
    // Touch viewer
    this._touchViewer(uid, nickname);
    
    // Record event
    this.eventBus.publishGift(uid, nickname, giftName, giftId, diamondCount, repeatCount);
    this.metrics.recordGift(uid, nickname, diamondCount, repeatCount);
    
    // Remember in memory
    this.memoryStore.rememberEvent(uid, {
      nickname,
      giftInc: repeatCount
    });
    
    // Skip response if muted
    if (this.config.muted) return;
    
    // Generate response
    const evaluation = this.responseEngine.evaluateGift(nickname, giftName, repeatCount);
    this._queueSelectedEvent('gift', data, evaluation);
    
  }
  
  _handleLike(data) {
    const uid = data.uniqueId || data.userId || '';
    if (!uid) return;
    
    const nickname = data.nickname || uid;
    const likeCount = data.likeCount || data.totalLikeCount || 1;
    
    // Record event
    this.eventBus.publishLike(uid, nickname, likeCount);
    this.metrics.recordLike(uid, nickname, likeCount);
    
    // Only remember/announce significant likes
    if (likeCount >= (this.config.likeThreshold || 20)) {
      const signature = `like_${uid}_${Math.floor(likeCount / 20)}`;
      if (this.deduper.seen(signature)) {
        this.metrics.recordDedupeHit();
        return;
      }
      
      this.memoryStore.rememberEvent(uid, {
        nickname,
        likeInc: likeCount
      });
      
      // Could add like announcement here if enabled
    }
  }
  
  _handleJoin(data) {
    const uid = data.uniqueId || data.userId || '';
    if (!uid) return;
    
    const nickname = data.nickname || uid;
    
    // Create signature
    const signature = `join_${uid}`;
    if (this.deduper.seen(signature)) {
      this.metrics.recordDedupeHit();
      return;
    }
    
    // Touch viewer
    this._touchViewer(uid, nickname);
    
    // Record event
    this.eventBus.publishJoin(uid, nickname);
    this.metrics.recordJoin(uid, nickname);
    
    // Remember in memory
    this.memoryStore.rememberEvent(uid, {
      nickname,
      join: true
    });
    
    // Schedule greeting if enabled
    if (this.config.joinRules?.enabled && !this.config.muted) {
      this._scheduleGreeting(uid, nickname);
    }
  }
  
  _handleFollow(data) {
    const uid = data.uniqueId || data.userId || '';
    if (!uid) return;
    
    const nickname = data.nickname || uid;
    
    // Create signature
    const signature = `follow_${uid}`;
    if (this.deduper.seen(signature)) {
      this.metrics.recordDedupeHit();
      return;
    }
    
    // Touch viewer
    this._touchViewer(uid, nickname);
    
    // Record event
    this.eventBus.publishFollow(uid, nickname);
    this.metrics.recordFollow(uid, nickname);
    
    // Remember in memory
    this.memoryStore.rememberEvent(uid, {
      nickname,
      follow: true
    });
    
    // Skip response if muted
    if (this.config.muted) return;
    
    // Generate response
    const evaluation = this.responseEngine.evaluateFollow(nickname);
    this._queueSelectedEvent('follow', data, evaluation);
    
  }
  
  _handleShare(data) {
    const uid = data.uniqueId || data.userId || '';
    if (!uid) return;
    
    const nickname = data.nickname || uid;
    
    // Create signature
    const signature = `share_${uid}`;
    if (this.deduper.seen(signature)) {
      this.metrics.recordDedupeHit();
      return;
    }
    
    // Touch viewer
    this._touchViewer(uid, nickname);
    
    // Record event
    this.eventBus.publishShare(uid, nickname);
    this.metrics.recordShare(uid, nickname);
    
    // Remember in memory
    this.memoryStore.rememberEvent(uid, {
      nickname,
      share: true
    });
    
    // Skip response if muted
    if (this.config.muted) return;
    
    // Generate response
    const evaluation = this.responseEngine.evaluateShare(nickname);
    this._queueSelectedEvent('share', data, evaluation);
    
  }
  
  _handleSubscribe(data) {
    const uid = data.uniqueId || data.userId || '';
    if (!uid) return;
    
    const nickname = data.nickname || uid;
    
    // Create signature
    const signature = `subscribe_${uid}`;
    if (this.deduper.seen(signature)) {
      this.metrics.recordDedupeHit();
      return;
    }
    
    // Touch viewer
    this._touchViewer(uid, nickname);
    
    // Record event
    this.eventBus.publishSubscribe(uid, nickname);
    this.metrics.recordSubscribe(uid, nickname);
    
    // Remember in memory
    this.memoryStore.rememberEvent(uid, {
      nickname,
      sub: true
    });
    
    // Skip response if muted
    if (this.config.muted) return;
    
    // Generate response
    const evaluation = this.responseEngine.evaluateSubscribe(nickname);
    this._queueSelectedEvent('subscribe', data, evaluation);
    
  }
  
  // ==================== Join Greeting System ====================
  
  _touchViewer(uid, nickname) {
    const now = Date.now();
    const viewer = this.viewers.get(uid) || {
      uid,
      nickname,
      joined: now,
      lastActive: now,
      greeted: false
    };
    
    viewer.nickname = nickname || viewer.nickname;
    viewer.lastActive = now;
    this.viewers.set(uid, viewer);
    
    return viewer;
  }
  
  _isViewerPresent(uid) {
    const viewer = this.viewers.get(uid);
    if (!viewer) return false;
    
    const ttl = (this.config.joinRules?.activeTtlSeconds || 45) * 1000;
    return (Date.now() - viewer.lastActive) <= ttl;
  }
  
  _scheduleGreeting(uid, nickname) {
    // Don't schedule if already scheduled
    if (this.greetTasks.has(uid)) return;
    
    const delay = (this.config.joinRules?.greetAfterSeconds || 30) * 1000;
    
    const task = setTimeout(() => {
      this.greetTasks.delete(uid);
      
      const viewer = this.viewers.get(uid);
      if (!viewer || viewer.greeted) return;
      
      // Check greeting cooldown from memory
      const user = this.memoryStore.getUser(uid);
      const greetCooldown = (this.config.comment?.greetingCooldown || 360) * 1000;
      if (Date.now() - user.lastGreet < greetCooldown) return;
      
      // Check if still present
      if (!this._isViewerPresent(uid)) return;
      
      // Mark as greeted and add to pending
      viewer.greeted = true;
      this.memoryStore.updateLastGreet(uid);
      this.pendingJoins.add(nickname);
      
      this.logger.debug(`Greet queued: ${nickname}`);
    }, delay);
    
    this.greetTasks.set(uid, task);
  }
  
  _startJoinAnnouncer() {
    this.joinAnnouncerInterval = setInterval(() => {
      this._announceJoins();
    }, 1000);
  }
  
  _announceJoins() {
    // Skip if muted or no pending joins
    if (this.config.muted || this.pendingJoins.size === 0) return;
    
    // Skip while the shared AnimazingPal/Fish pipeline is speaking.
    if (this._getAnimazingPalStatus().isSpeaking) return;
    
    // Check idle time since last output
    const idleRequired = (this.config.joinRules?.minIdleSinceLastOutputSec || 25) * 1000;
    if (Date.now() - this.lastOutputTime < idleRequired) return;
    
    // Check global join cooldown
    const globalCooldown = (this.config.joinRules?.greetGlobalCooldownSec || 180) * 1000;
    if (Date.now() - this.lastJoinAnnounceTime < globalCooldown) return;
    
    // Get names to announce
    const names = Array.from(this.pendingJoins).slice(0, 20);
    for (const name of names) {
      this.pendingJoins.delete(name);
    }
    
    if (names.length === 0) return;
    
    // Generate announcement
    const evaluation = this.responseEngine.generateJoinAnnouncement(names);
    if (evaluation) {
      this.outboxBatcher.add(evaluation.response, evaluation.priority);
      this.lastJoinAnnounceTime = Date.now();
    }
  }
  
  // ==================== Utility Methods ====================

  _createEmptyAsrDiagnostics() {
    return {
      counters: {
        requests: 0,
        transcribed: 0,
        accepted: 0,
        rejected: 0,
        delegated: 0,
        errors: 0
      },
      lastTranscriptAt: null,
      lastError: null,
      lastLatencyMs: null
    };
  }

  _getAsrRuntimeConfig() {
    const asr = this.config?.asr || {};
    const conversation = this.config?.conversation || {};
    const configuredMax = Number(asr.maxAudioBytes);
    const maxAudioBytes = Number.isFinite(configuredMax) && configuredMax > 0
      ? Math.min(Math.round(configuredMax), ASR_SERVICE_MAX_AUDIO_BYTES)
      : 8 * 1024 * 1024;
    const configuredMin = Number(asr.minTranscriptChars);
    const conversationMin = Number(conversation.minHostSpeechChars);

    return {
      enabled: asr.enabled !== false && asr.enabled !== 'false',
      maxAudioBytes,
      language: normalizeAsrLanguage(asr.language),
      minTranscriptChars: Number.isFinite(configuredMin) && configuredMin > 0
        ? Math.min(Math.round(configuredMin), 500)
        : (Number.isFinite(conversationMin) && conversationMin > 0 ? Math.min(Math.round(conversationMin), 500) : 1)
    };
  }

  _getTtsPlugin() {
    return this.api.getPluginInstance?.('tts') || this.api.getPlugin?.('tts') || null;
  }

  _getAsrReadiness() {
    const tts = this._getTtsPlugin();
    const ttsAvailable = typeof tts?.transcribeFishAudio === 'function';
    const fishConfigured = !!tts?.config?.fishaudioApiKey;
    const config = this._getAsrRuntimeConfig();

    return {
      config,
      tts,
      ttsAvailable,
      fishConfigured,
      ready: config.enabled && ttsAvailable && fishConfigured
    };
  }

  _getAsrStatus() {
    if (!this.asrDiagnostics) {
      this.asrDiagnostics = this._createEmptyAsrDiagnostics();
    }
    const readiness = this._getAsrReadiness();
    return {
      enabled: readiness.config.enabled,
      ready: readiness.ready,
      ttsAvailable: readiness.ttsAvailable,
      fishConfigured: readiness.fishConfigured,
      maxAudioBytes: readiness.config.maxAudioBytes,
      language: readiness.config.language,
      minTranscriptChars: readiness.config.minTranscriptChars,
      lastTranscriptAt: this.asrDiagnostics.lastTranscriptAt,
      lastError: this.asrDiagnostics.lastError,
      lastLatencyMs: this.asrDiagnostics.lastLatencyMs,
      counters: { ...this.asrDiagnostics.counters }
    };
  }

  _createAsrUploadMiddleware(config) {
    return multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: config.maxAudioBytes,
        files: 1
      },
      fileFilter: (req, file, callback) => {
        const mimeType = String(file.mimetype || '').toLowerCase();
        if (ASR_SAFE_AUDIO_MIME_TYPES.has(mimeType)) {
          return callback(null, true);
        }

        if (mimeType === 'application/octet-stream' && this._hasAllowedAsrExtension(file.originalname)) {
          return callback(null, true);
        }

        const error = new Error('Unsupported audio MIME type');
        error.code = 'ASR_UNSUPPORTED_MIME';
        return callback(error);
      }
    }).single(ASR_AUDIO_FIELD);
  }

  _handleAsrUploadRoute(req, res) {
    if (!this.asrDiagnostics) {
      this.asrDiagnostics = this._createEmptyAsrDiagnostics();
    }
    this.asrDiagnostics.counters.requests += 1;

    const readiness = this._getAsrReadiness();
    if (!readiness.config.enabled) {
      return this._sendAsrError(res, 503, 'ASR_DISABLED', 'Sidekick ASR is disabled');
    }
    if (!readiness.ttsAvailable) {
      return this._sendAsrError(res, 503, 'ASR_TTS_UNAVAILABLE', 'TTS plugin ASR is unavailable');
    }

    const upload = this._createAsrUploadMiddleware(readiness.config);
    return new Promise((resolve) => {
      upload(req, res, async (uploadError) => {
        try {
          if (uploadError) {
            this._handleAsrUploadError(res, uploadError);
            return;
          }
          await this._handleAsrTranscribeRequest(req, res, readiness);
        } catch (error) {
          this.logger.warn(`Sidekick ASR route failed: ${error.message}`);
          this._sendAsrError(res, 500, 'ASR_ROUTE_ERROR', 'Sidekick ASR route failed');
        } finally {
          resolve();
        }
      });
    });
  }

  _handleAsrUploadError(res, error) {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return this._sendAsrError(res, 413, 'ASR_UPLOAD_TOO_LARGE', 'Audio upload exceeds the configured ASR limit');
    }
    if (error?.code === 'ASR_UNSUPPORTED_MIME') {
      return this._sendAsrError(res, 415, 'ASR_UNSUPPORTED_MIME', 'Unsupported audio MIME type');
    }
    if (error?.code === 'LIMIT_UNEXPECTED_FILE') {
      return this._sendAsrError(res, 400, 'ASR_UNEXPECTED_FILE', `Upload must contain one "${ASR_AUDIO_FIELD}" audio file`);
    }
    return this._sendAsrError(res, 400, 'ASR_UPLOAD_INVALID', 'Invalid ASR upload');
  }

  async _handleAsrTranscribeRequest(req, res, readiness) {
    const startedAt = Date.now();
    const file = req.file;
    if (!file) {
      return this._sendAsrError(res, 400, 'ASR_UPLOAD_REQUIRED', `Upload must contain an "${ASR_AUDIO_FIELD}" audio file`);
    }
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      return this._sendAsrError(res, 400, 'ASR_UPLOAD_EMPTY', 'Uploaded audio file is empty');
    }
    if (file.size > readiness.config.maxAudioBytes) {
      return this._sendAsrError(res, 413, 'ASR_UPLOAD_TOO_LARGE', 'Audio upload exceeds the configured ASR limit');
    }
    if (!this._hasSafeAudioSignatureForMime(file.buffer, file.mimetype)) {
      return this._sendAsrError(res, 415, 'ASR_UNSUPPORTED_AUDIO_CONTENT', 'Unsupported audio content');
    }

    let transcript;
    try {
      const options = {
        maxAudioBytes: readiness.config.maxAudioBytes,
        mimeType: file.mimetype,
        filename: file.originalname
      };
      if (readiness.config.language) {
        options.language = readiness.config.language;
      }
      transcript = await readiness.tts.transcribeFishAudio(file.buffer, options);
    } catch (error) {
      const sanitized = this._sanitizeAsrError(error);
      return this._sendAsrError(res, sanitized.status, sanitized.code, sanitized.message, true);
    }

    const text = String(transcript?.text || '').trim();
    const latencyMs = Date.now() - startedAt;
    this.asrDiagnostics.counters.transcribed += 1;
    this.asrDiagnostics.lastTranscriptAt = new Date().toISOString();
    this.asrDiagnostics.lastLatencyMs = latencyMs;
    this.asrDiagnostics.lastError = null;

    const responseTranscript = this._redactAsrTranscript(transcript, text);
    const transcribeOnly = this._isTruthyRequestValue(req.body?.transcribeOnly || req.query?.transcribeOnly);
    if (transcribeOnly) {
      return res.json({
        success: true,
        transcript: responseTranscript,
        accepted: false,
        delegated: false,
        reason: 'transcribe-only',
        latencyMs,
        diagnostics: this._getAsrStatus()
      });
    }

    if (text.length < readiness.config.minTranscriptChars) {
      this.asrDiagnostics.counters.rejected += 1;
      return res.json({
        success: true,
        transcript: responseTranscript,
        accepted: false,
        delegated: false,
        reason: 'transcript-too-short',
        latencyMs,
        diagnostics: this._getAsrStatus()
      });
    }

    let hostResult;
    try {
      hostResult = await this.processHostSpeechTranscript(text, {
        source: 'sidekick-asr',
        provider: transcript?.provider || 'fish.audio',
        confidence: transcript?.confidence,
        language: transcript?.language || readiness.config.language,
        mimeType: file.mimetype,
        audioBytes: file.buffer.length,
        filename: file.originalname,
        latencyMs
      });
    } catch (error) {
      this.logger.warn(`Sidekick ASR delegation failed: ${this._sanitizeAsrPublicText(error?.message, 160)}`);
      return this._sendAsrError(res, 502, 'ASR_DELEGATION_FAILED', 'Sidekick host speech delegation failed', true);
    }

    if (hostResult?.accepted) {
      this.asrDiagnostics.counters.accepted += 1;
    } else {
      this.asrDiagnostics.counters.rejected += 1;
    }
    if (hostResult?.delegated) {
      this.asrDiagnostics.counters.delegated += 1;
    }
    const delegation = this._buildAsrDelegationSummary(hostResult);

    return res.json({
      success: true,
      transcript: responseTranscript,
      accepted: delegation.accepted,
      delegated: delegation.delegated,
      reason: delegation.reason,
      latencyMs,
      delegation,
      diagnostics: this._getAsrStatus()
    });
  }

  _sendAsrError(res, status, code, message, countAsError = false) {
    if (!this.asrDiagnostics) {
      this.asrDiagnostics = this._createEmptyAsrDiagnostics();
    }
    this.asrDiagnostics.counters.rejected += 1;
    if (countAsError || status >= 500) {
      this.asrDiagnostics.counters.errors += 1;
      this.metrics?.recordError?.();
    }
    const safeCode = this._sanitizeAsrErrorCode(code);
    const safeMessage = this._sanitizeAsrPublicText(message, 240) || 'Sidekick ASR request failed';
    this.asrDiagnostics.lastError = {
      code: safeCode,
      message: safeMessage,
      at: new Date().toISOString()
    };
    return res.status(status).json({
      success: false,
      error: { code: safeCode, message: safeMessage },
      diagnostics: this._getAsrStatus()
    });
  }

  _sanitizeAsrError(error) {
    const message = String(error?.message || '');
    if (/api key|not configured|missing key/i.test(message)) {
      return {
        status: 503,
        code: 'ASR_FISH_UNCONFIGURED',
        message: 'Fish.audio ASR API key is not configured'
      };
    }
    return {
      status: 502,
      code: 'ASR_TRANSCRIPTION_FAILED',
      message: 'Fish.audio ASR transcription failed'
    };
  }

  _redactAsrTranscript(transcript, text) {
    return {
      text,
      confidence: transcript?.confidence,
      language: transcript?.language,
      durationMs: transcript?.durationMs,
      provider: transcript?.provider || 'fish.audio'
    };
  }

  _buildAsrDelegationSummary(hostResult) {
    const nested = hostResult?.animazingPalResult || {};
    return {
      accepted: !!hostResult?.accepted,
      delegated: !!hostResult?.delegated,
      reason: this._sanitizeAsrPublicText(hostResult?.reason || hostResult?.decision?.reason || null, 120),
      responded: hostResult?.responded === true || nested.responded === true,
      blocked: hostResult?.blocked === true || nested.blocked === true,
      speechFailed: hostResult?.speechFailed === true || nested.speechFailed === true,
      speechBlocked: hostResult?.speechBlocked === true || nested.speechBlocked === true
    };
  }

  _sanitizeAsrErrorCode(code) {
    const safeCode = String(code || 'ASR_ERROR').toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80);
    return safeCode || 'ASR_ERROR';
  }

  _sanitizeAsrPublicText(value, maxLength = 240) {
    if (value === null || value === undefined) return null;
    let text = String(value);
    text = text.replace(/bearer\s+[a-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
    text = text.replace(/\b(?:sk|pk|rk|fish|token|key)-[a-z0-9._-]{8,}\b/gi, '[REDACTED]');
    text = text.replace(/\b[a-z0-9._%+-]+:[a-z0-9._~+/=-]{12,}\b/gi, '[REDACTED]');
    text = text.replace(/\b[a-f0-9]{32,}\b/gi, '[REDACTED]');
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > maxLength) {
      return `${text.slice(0, maxLength - 1)}…`;
    }
    return text;
  }

  _hasAllowedAsrExtension(filename) {
    return ASR_OCTET_AUDIO_EXTENSIONS.has(path.extname(String(filename || '')).toLowerCase());
  }

  _hasSafeAudioSignature(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return true;
    if (buffer.slice(0, 4).toString('ascii') === 'OggS') return true;
    if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WAVE') return true;
    if (buffer.slice(0, 3).toString('ascii') === 'ID3') return true;
    return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  }

  _hasSafeAudioSignatureForMime(buffer, mimeType) {
    const normalizedMime = String(mimeType || '').toLowerCase();
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;

    switch (normalizedMime) {
      case 'audio/webm':
        return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
      case 'audio/ogg':
      case 'audio/opus':
        return buffer.slice(0, 4).toString('ascii') === 'OggS';
      case 'audio/wav':
      case 'audio/wave':
      case 'audio/x-wav':
        return buffer.length >= 12
          && buffer.slice(0, 4).toString('ascii') === 'RIFF'
          && buffer.slice(8, 12).toString('ascii') === 'WAVE';
      case 'audio/mpeg':
      case 'audio/mp3':
        return buffer.slice(0, 3).toString('ascii') === 'ID3'
          || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
      case 'application/octet-stream':
        return this._hasSafeAudioSignature(buffer);
      default:
        return false;
    }
  }

  _isTruthyRequestValue(value) {
    return value === true || value === 'true' || value === '1' || value === 1 || value === 'yes';
  }

  _getAnimazingPal() {
    return this.api.getPluginInstance?.('animazingpal') || this.api.getPlugin?.('animazingpal') || null;
  }

  _getAnimazingPalStatus() {
    const animazingPal = this._getAnimazingPal();
    return {
      source: 'animazingpal',
      available: !!animazingPal,
      isConnected: !!animazingPal?.isConnected,
      isSpeaking: !!animazingPal?.speechState?.isSpeaking,
      queueLength: 0
    };
  }

  async processHostSpeechTranscript(text, metadata = {}) {
    if (!this.conversationCoordinator) {
      this.conversationCoordinator = new ConversationCoordinator(this.config?.conversation || {});
    }

    const decision = this.conversationCoordinator.shouldAcceptHostSpeech(text, metadata);
    if (!decision.accept) {
      this.logger.debug(`Sidekick host speech rejected: ${decision.reason}`);
      return {
        accepted: false,
        delegated: false,
        reason: decision.reason,
        decision
      };
    }

    const event = this.conversationCoordinator.buildHostSpeechEvent(text, metadata);
    const animazingPal = this._getAnimazingPal();
    const hasDedicatedHostPipeline = typeof animazingPal?.processSidekickHostSpeech === 'function';
    if (!animazingPal) {
      this.logger.warn('Sidekick host speech skipped: AnimazingPal Brain pipeline unavailable');
      this.metrics?.recordError?.();
      return {
        accepted: true,
        delegated: false,
        reason: 'animazingpal-unavailable',
        decision,
        event
      };
    }
    if (!hasDedicatedHostPipeline) {
      this.logger.warn('Sidekick host speech skipped: dedicated AnimazingPal host pipeline unavailable');
      this.metrics?.recordError?.();
      return {
        accepted: true,
        delegated: false,
        reason: 'host-pipeline-unavailable',
        decision,
        event
      };
    }

    let animazingPalResult;
    try {
      const hostEvaluation = {
        ...decision,
        source: 'sidekick-host-speech'
      };
      animazingPalResult = await animazingPal.processSidekickHostSpeech(event, hostEvaluation);
    } catch (error) {
      this.logger.warn(`Sidekick host speech delegation failed: ${error.message}`);
      this.metrics?.recordError?.();
      return {
        accepted: true,
        delegated: false,
        reason: 'animazingpal-error',
        decision,
        event,
        error: error.message
      };
    }

    const spokenText = animazingPalResult?.spokenText || animazingPalResult?.message || animazingPalResult?.text;
    const speechDelivered = animazingPalResult?.responded === true
      && !animazingPalResult?.speechFailed
      && !animazingPalResult?.speechBlocked;
    if (speechDelivered) {
      this.conversationCoordinator.recordHostSpeech?.(text, metadata);
      if (spokenText) {
        this.conversationCoordinator.recordSidekickSpeech?.(spokenText, {
          ...metadata,
          eventType: event.eventType,
          username: event.username || 'Host',
          source: 'animazingpal-host-speech-output'
        });
      }
    }

    return {
      accepted: true,
      delegated: true,
      decision,
      event,
      animazingPalResult
    };
  }

  async _sendOutput(text) {
    if (!text) return false;
    const output = this.config.output || {};
    const animazingPal = this._getAnimazingPal();
    if (!animazingPal || typeof animazingPal.speakHostResponse !== 'function') {
      this.logger.warn('Sidekick output skipped: AnimazingPal speech pipeline unavailable');
      return false;
    }
    const result = await animazingPal.speakHostResponse(text, {
      eventType: output.eventType || 'sidekick',
      username: output.username || 'Sidekick',
      userId: 'sidekick-assistant'
    });
    const success = result?.success !== false && !result?.blocked;

    if (success) {
      this.lastOutputTime = Date.now();
      this.conversationCoordinator?.recordSidekickSpeech?.(text, {
        eventType: output.eventType || 'sidekick',
        username: output.username || 'Sidekick',
        source: 'sidekick-output'
      });
      this.eventBus.publishResponseSent(text);
      this.metrics?.recordResponse();
    }
    return success;
  }

  _syncAnimazingPalMode() {
    const animazingPal = this._getAnimazingPal();
    if (!animazingPal) return false;
    if (typeof animazingPal.setLiveHostOperatingMode !== 'function') return false;
    return animazingPal.setLiveHostOperatingMode('sidekick', { persist: false });
  }

  async _dispatchSelectedEvent(eventType, data, evaluation = {}) {
    const animazingPal = this._getAnimazingPal();
    if (!animazingPal || typeof animazingPal.processSidekickEvent !== 'function') {
      this.logger.warn('Sidekick decision skipped: AnimazingPal Brain pipeline unavailable');
      this.metrics?.recordError?.();
      return { handled: false, responded: false, reason: 'animazingpal-unavailable' };
    }
    const event = this.conversationCoordinator?.buildViewerEvent
      ? this.conversationCoordinator.buildViewerEvent(eventType, data, evaluation)
      : data;
    if (!event) {
      return { handled: false, responded: false, reason: 'viewer-event-disabled' };
    }
    const result = await animazingPal.processSidekickEvent(eventType, event, evaluation);
    if (result?.responded) {
      this.metrics?.recordResponse();
      const spokenText = result.spokenText || result.message || result.text;
      if (spokenText) {
        this.conversationCoordinator?.recordSidekickSpeech?.(spokenText, {
          eventType,
          username: event.username || event.uniqueId || event.nickname || 'Sidekick',
          source: 'animazingpal-delegated-output'
        });
      }
    }
    return result;
  }

  _queueSelectedEvent(eventType, data, evaluation = {}) {
    this._dispatchSelectedEvent(eventType, data, evaluation).catch((error) => {
      this.logger.error(`Sidekick ${eventType} dispatch failed: ${error.message}`);
      this.metrics?.recordError?.();
    });
  }
  
  _updateComponents() {
    // Update components with new config
    if (this.deduper) {
      this.deduper.setTTL(this.config.dedupeTtl || 600);
    }

    if (this.memoryStore?.updateConfig) {
      this.memoryStore.updateConfig(this.config);
    }
    
    if (this.rateLimiter) {
      this.rateLimiter.updateConfig(this.config);
    }
    
    if (this.responseEngine) {
      this.responseEngine.updateConfig(this.config);
    }
    
    if (this.outboxBatcher) {
      this.outboxBatcher.updateConfig(this.config);
    }
    if (this.conversationCoordinator) {
      this.conversationCoordinator.updateConfig(this.config.conversation || {});
    }
    this._syncAnimazingPalMode();
  }
  
  _getStatus() {
    const session = this.metrics.getSessionStats();
    session.totalEvents = [
      'totalChats',
      'totalGifts',
      'totalLikes',
      'totalJoins',
      'totalFollows',
      'totalShares',
      'totalSubscribes'
    ].reduce((total, key) => total + (Number(session[key]) || 0), 0);
    return {
      muted: this.config.muted || false,
      animaze: this._getAnimazingPalStatus(),
      outbox: this.outboxBatcher.getStatus(),
      deduper: this.deduper.getStats(),
      rateLimiter: this.rateLimiter.getStatus(),
      session,
      currentRates: this.metrics.getCurrentRates(),
      pendingJoins: this.pendingJoins.size,
      activeViewers: this.viewers.size,
      conversation: this.conversationCoordinator?.getStatus?.() || null
    };
  }
  
  _emitStatus() {
    const status = this._getStatus();
    this.io.emit('sidekick:status', status);
  }
}

module.exports = SidekickPlugin;
