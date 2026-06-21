/**
 * Sidekick Plugin - Main Entry Point
 * 
 * Intelligent stream assistant for LTTH with:
 * - Animaze/ChatPal WebSocket integration
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
const { ConfigManager } = require('./backend/config');
const MemoryStore = require('./backend/memoryStore');
const { EventBus, EventTypes } = require('./backend/eventBus');
const EventDeduper = require('./backend/deduper');
const { RateLimitManager } = require('./backend/rateLimit');
const { AnimazeClient } = require('./backend/animazeClient');
const { ResponseEngine } = require('./backend/responseEngine');
const OutboxBatcher = require('./backend/outboxBatcher');
const Metrics = require('./backend/metrics');

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
    this.animazeClient = null;
    this.responseEngine = null;
    this.outboxBatcher = null;
    this.metrics = null;
    
    // Join greeting state
    this.pendingJoins = new Set();
    this.viewers = new Map();
    this.greetTasks = new Map();
    this.lastOutputTime = 0;
    this.lastJoinAnnounceTime = 0;
    
    // Cleanup timer
    this.cleanupInterval = null;
    this.joinAnnouncerInterval = null;
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
      
      // Initialize Animaze client
      this.animazeClient = new AnimazeClient(this.api, this.config);
      
      // Initialize outbox batcher
      this.outboxBatcher = new OutboxBatcher(this.api, this.config, (text) => {
        this._sendToAnimaze(text);
      });
      
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
      
      // Auto-connect to Animaze if enabled
      if (this.config.animaze?.enabled && this.config.animaze?.autoConnect) {
        await this.animazeClient.connect();
      }
      
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
    if (this.animazeClient) {
      this.animazeClient.destroy();
    }
    
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
    
    // Get user memory
    this.api.registerRoute('get', '/api/sidekick/memory/:uid', (req, res) => {
      const user = this.memoryStore.getUser(req.params.uid);
      res.json({ success: true, user });
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
    
    // Connect to Animaze
    this.api.registerRoute('post', '/api/sidekick/animaze/connect', async (req, res) => {
      try {
        const connected = await this.animazeClient.connect();
        this._emitStatus();
        res.json({ success: connected, isConnected: this.animazeClient.isConnected });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Disconnect from Animaze
    this.api.registerRoute('post', '/api/sidekick/animaze/disconnect', (req, res) => {
      this.animazeClient.disconnect();
      this._emitStatus();
      res.json({ success: true, isConnected: false });
    });
    
    // Get Animaze status
    this.api.registerRoute('get', '/api/sidekick/animaze/status', (req, res) => {
      res.json({
        success: true,
        status: this.animazeClient.getStatus()
      });
    });
    
    // Send test message to Animaze
    this.api.registerRoute('post', '/api/sidekick/animaze/test', async (req, res) => {
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, error: 'Message required' });
      }
      
      const success = await this.animazeClient.sendMessage(message);
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
          message: `Sidekick: ${status.muted ? 'Muted' : 'Active'} | Animaze: ${status.animaze.isConnected ? 'Connected' : 'Disconnected'} | Events: ${status.session.totalEvents}/min`
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
    this._processComment(uid, nickname, comment);
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
    
    // Add to batch
    this.outboxBatcher.add(evaluation.response, evaluation.priority);
    
    // Set cooldowns
    this.rateLimiter.setGlobalCooldown();
    this.rateLimiter.setUserCooldown(uid);
    
    // Record response
    this.metrics.recordResponse();
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
    this.outboxBatcher.add(evaluation.response, evaluation.priority);
    
    this.metrics.recordResponse();
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
    this.outboxBatcher.add(evaluation.response, evaluation.priority);
    
    this.metrics.recordResponse();
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
    this.outboxBatcher.add(evaluation.response, evaluation.priority);
    
    this.metrics.recordResponse();
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
    this.outboxBatcher.add(evaluation.response, evaluation.priority);
    
    this.metrics.recordResponse();
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
    
    // Skip if Animaze is speaking
    if (this.animazeClient.speechState?.isSpeaking) return;
    
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
      this.metrics.recordResponse();
    }
  }
  
  // ==================== Utility Methods ====================
  
  async _sendToAnimaze(text) {
    if (!text) return;
    
    const success = await this.animazeClient.sendMessage(text, false, 1);
    if (success) {
      this.lastOutputTime = Date.now();
      this.eventBus.publishResponseSent(text);
    }
  }
  
  _updateComponents() {
    // Update components with new config
    if (this.deduper) {
      this.deduper.setTTL(this.config.dedupeTtl || 600);
    }
    
    if (this.rateLimiter) {
      this.rateLimiter.updateConfig(this.config);
    }
    
    if (this.animazeClient) {
      this.animazeClient.updateConfig(this.config);
    }
    
    if (this.responseEngine) {
      this.responseEngine.updateConfig(this.config);
    }
    
    if (this.outboxBatcher) {
      this.outboxBatcher.updateConfig(this.config);
    }
  }
  
  _getStatus() {
    return {
      muted: this.config.muted || false,
      animaze: this.animazeClient.getStatus(),
      outbox: this.outboxBatcher.getStatus(),
      deduper: this.deduper.getStats(),
      rateLimiter: this.rateLimiter.getStatus(),
      session: this.metrics.getSessionStats(),
      currentRates: this.metrics.getCurrentRates(),
      pendingJoins: this.pendingJoins.size,
      activeViewers: this.viewers.size
    };
  }
  
  _emitStatus() {
    const status = this._getStatus();
    this.io.emit('sidekick:status', status);
  }
}

module.exports = SidekickPlugin;
