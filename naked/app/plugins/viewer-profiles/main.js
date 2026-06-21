/**
 * Viewer Profiles Plugin
 * 
 * Comprehensive viewer tracking and analytics system with:
 * - Automatic data collection from TikTok events
 * - Session and watchtime tracking
 * - VIP system with automatic promotion
 * - Birthday tracking and notifications
 * - Activity heatmaps and analytics
 * - Export functionality
 * - Detailed profile management
 */

const EventEmitter = require('events');
const path = require('path');
const ViewerProfilesDatabase = require('./backend/database');
const ViewerProfilesAPI = require('./backend/api');
const SessionManager = require('./backend/session-manager');
const VIPManager = require('./backend/vip-manager');
const BirthdayManager = require('./backend/birthday-manager');

class ViewerProfilesPlugin extends EventEmitter {
  constructor(api) {
    super();
    this.api = api;
    this.pluginId = 'viewer-profiles';

    // Initialize modules
    this.db = new ViewerProfilesDatabase(api);
    this.sessionManager = new SessionManager(this.db, api);
    this.vipManager = new VIPManager(this.db, api);
    this.birthdayManager = new BirthdayManager(this.db, api);
    this.apiModule = new ViewerProfilesAPI(this);

    // Configuration
    this.config = {
      autoVipPromotion: true,
      birthdayReminder: true,
      autoFetchTikTokData: true,
      sessionTimeout: 300, // 5 minutes
      heatmapEnabled: true
    };
  }

  /**
   * Initialize plugin
   */
  async init() {
    this.api.log('🎭 Initializing Viewer Profiles Plugin...', 'info');

    try {
      // Load configuration
      this.loadConfig();

      // Initialize database
      try {
        this.db.initialize();
      } catch (error) {
        throw new Error(`Database initialization failed: ${error.message}`);
      }

      // Initialize managers
      try {
        this.vipManager.initialize();
      } catch (error) {
        throw new Error(`VIP Manager initialization failed: ${error.message}`);
      }

      // Register API routes
      try {
        this.apiModule.registerRoutes();
      } catch (error) {
        throw new Error(`API routes registration failed: ${error.message}`);
      }

      // Register UI routes
      try {
        this.registerUIRoutes();
      } catch (error) {
        throw new Error(`UI routes registration failed: ${error.message}`);
      }

      // Register WebSocket handlers
      try {
        this.registerWebSocketHandlers();
      } catch (error) {
        throw new Error(`WebSocket handlers registration failed: ${error.message}`);
      }

      // Register TikTok event handlers
      try {
        this.registerTikTokEventHandlers();
      } catch (error) {
        throw new Error(`TikTok event handlers registration failed: ${error.message}`);
      }

      // Start session tracking
      try {
        this.sessionManager.start();
      } catch (error) {
        throw new Error(`Session manager start failed: ${error.message}`);
      }

      // Start birthday checker
      if (this.config.birthdayReminder) {
        try {
          this.birthdayManager.start();
        } catch (error) {
          this.api.log(`⚠️ Birthday manager start failed: ${error.message}`, 'warn');
          // Non-critical error, continue initialization
        }
      }

      this.api.log('✅ Viewer Profiles Plugin initialized successfully', 'info');
      this.api.log('   - Database ready with all tables', 'info');
      this.api.log('   - Session tracking active', 'info');
      this.api.log('   - VIP system enabled', 'info');
      this.api.log('   - Birthday notifications enabled', 'info');
      this.api.log('   - UI available at /viewer-profiles/ui', 'info');

    } catch (error) {
      this.api.log(`❌ Error initializing Viewer Profiles Plugin: ${error.message}`, 'error');
      this.api.log(`   Stack trace: ${error.stack}`, 'error');
      throw error;
    }
  }

  /**
   * Cleanup on plugin destroy
   */
  async destroy() {
    this.api.log('Destroying Viewer Profiles Plugin...', 'info');

    try {
      // Stop session tracking
      this.sessionManager.stop();

      // Stop birthday checker
      this.birthdayManager.stop();

      // Remove socket connection listener to prevent memory leak
      try {
        const io = this.api.getSocketIO();
        if (this._socketConnectionHandler) {
          io.removeListener('connection', this._socketConnectionHandler);
        }
      } catch (e) {
        this.api.log(`Error removing socket listener: ${e.message}`, 'warn');
      }

      this.api.log('✅ Viewer Profiles Plugin destroyed', 'info');
    } catch (error) {
      this.api.log(`Error destroying plugin: ${error.message}`, 'error');
    }
  }

  /**
   * Load configuration
   */
  loadConfig() {
    const savedConfig = this.api.getConfig('viewer-profiles-config');
    if (savedConfig) {
      this.config = { ...this.config, ...savedConfig };
    }
    this.api.log('Configuration loaded', 'debug');
  }

  /**
   * Save configuration
   */
  saveConfig() {
    this.api.setConfig('viewer-profiles-config', this.config);
    this.api.log('Configuration saved', 'debug');
  }

  /**
   * Register UI routes
   */
  registerUIRoutes() {
    // Main UI
    this.api.registerRoute('GET', '/viewer-profiles/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui.html'));
    });

    // Serve assets
    this.api.registerRoute('GET', '/viewer-profiles/assets/:file', (req, res) => {
      res.sendFile(path.join(__dirname, 'assets', req.params.file));
    });

    this.api.log('UI routes registered', 'info');
  }

  /**
   * Register WebSocket handlers
   */
  registerWebSocketHandlers() {
    const io = this.api.getSocketIO();

    // Store handler reference so it can be removed in destroy()
    this._socketConnectionHandler = (socket) => {
      // Get viewer profile
      socket.on('viewer-profiles:get', (username, callback) => {
        try {
          const viewer = this.db.getViewerByUsername(username);
          if (callback) {
            callback({ success: true, data: viewer });
          }
        } catch (error) {
          if (callback) {
            callback({ success: false, error: error.message });
          }
        }
      });

      // Update viewer profile
      socket.on('viewer-profiles:update', (data, callback) => {
        try {
          const viewer = this.db.updateViewer(data.username, data.updates);
          if (callback) {
            callback({ success: true, data: viewer });
          }
          // Broadcast update to all clients
          io.emit('viewer:updated', { username: data.username, updates: data.updates });
        } catch (error) {
          if (callback) {
            callback({ success: false, error: error.message });
          }
        }
      });

      // Refresh profile picture
      socket.on('viewer-profiles:refresh-avatar', (data, callback) => {
        try {
          const username = data.username;
          this.api.log(`Refresh avatar requested for ${username}`, 'debug');

          // Get current viewer data and return it so the UI can update
          const viewer = this.db.getViewerByUsername(username);
          if (viewer) {
            // Emit updated profile to all clients so the UI refreshes
            this.api.emit('viewer:updated', { username });
          }

          if (callback) {
            callback({ success: true, message: 'Avatar refresh triggered. Will update on next TikTok event.' });
          }
        } catch (error) {
          this.api.log(`Error handling refresh-avatar: ${error.message}`, 'error');
          if (callback) {
            callback({ success: false, error: error.message });
          }
        }
      });
    };

    // Listen for socket connections
    io.on('connection', this._socketConnectionHandler);

    this.api.log('WebSocket handlers registered', 'info');
  }

  /**
   * Register TikTok event handlers
   */
  registerTikTokEventHandlers() {
    // Chat event
    this.api.registerTikTokEvent('chat', (data) => {
      this.handleChatEvent(data);
    });

    // Gift event
    this.api.registerTikTokEvent('gift', (data) => {
      this.handleGiftEvent(data);
    });

    // Like event
    this.api.registerTikTokEvent('like', (data) => {
      this.handleLikeEvent(data);
    });

    // Share event
    this.api.registerTikTokEvent('share', (data) => {
      this.handleShareEvent(data);
    });

    // Follow event
    this.api.registerTikTokEvent('follow', (data) => {
      this.handleFollowEvent(data);
    });

    // Member event (viewer joined)
    this.api.registerTikTokEvent('member', (data) => {
      this.handleMemberEvent(data);
    });

    // Social event (follow/subscribe)
    this.api.registerTikTokEvent('social', (data) => {
      this.handleSocialEvent(data);
    });

    // Streamend event (end all sessions)
    this.api.registerTikTokEvent('streamEnd', (data) => {
      this.handleStreamEnd(data);
    });

    this.api.log('TikTok event handlers registered', 'info');
  }

  /**
   * Handle chat event
   */
  handleChatEvent(data) {
    try {
      const username = data.uniqueId || data.nickname;
      if (!username) return;

      // Get or create viewer
      const viewer = this.db.getOrCreateViewer(username, {
        userId: data.userId,
        nickname: data.nickname,
        profilePictureUrl: data.profilePictureUrl,
        verified: data.isVerified ? 1 : 0
      });

      // Add interaction
      this.db.addInteraction(viewer.id, 'comment', data.comment);

      // Update viewer info
      this.updateViewerInfo(username, data);

      // Use custom TTS voice if configured
      if (viewer.tts_voice && this.api.getPluginInstance) {
        const ttsPlugin = this.api.getPluginInstance('tts');
        if (ttsPlugin && ttsPlugin.setCustomVoice) {
          // Notify TTS plugin about custom voice preference for this user
          this.api.emit('viewer:custom-tts-voice', {
            username: viewer.tiktok_username,
            voice: viewer.tts_voice
          });
        }
      }

      // Update heatmap
      this.db.updateHeatmap(viewer.id, new Date());

      // Start session if not active
      if (!this.sessionManager.hasActiveSession(username)) {
        this.sessionManager.startSession(username, data);
        // Check birthday on join
        this.birthdayManager.onViewerJoin(username);
      }

    } catch (error) {
      this.api.log(`Error handling chat event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle gift event
   */
  handleGiftEvent(data) {
    try {
      const username = data.uniqueId || data.nickname;
      if (!username) return;

      // Get or create viewer
      const viewer = this.db.getOrCreateViewer(username, {
        userId: data.userId,
        nickname: data.nickname,
        profilePictureUrl: data.profilePictureUrl,
        verified: data.isVerified ? 1 : 0
      });

      // Add gift to history
      this.db.addGiftHistory(viewer.id, {
        giftId: data.giftId,
        giftName: data.giftName,
        giftCoins: data.diamondCount * 2, // Convert diamonds to coins (approximate)
        diamondCount: data.diamondCount,
        quantity: data.repeatCount || 1,
        streakCount: data.streakCount || 0
      });

      // Update viewer info
      this.updateViewerInfo(username, data);

      // Update heatmap with coins
      const coins = data.diamondCount * 2 * (data.repeatCount || 1);
      this.db.updateHeatmap(viewer.id, new Date(), coins);

      // Check VIP promotion
      if (this.config.autoVipPromotion) {
        this.vipManager.checkAndPromoteViewer(viewer.id);
      }

      // Start session if not active
      if (!this.sessionManager.hasActiveSession(username)) {
        this.sessionManager.startSession(username, data);
        this.birthdayManager.onViewerJoin(username);
      }

    } catch (error) {
      this.api.log(`Error handling gift event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle like event
   */
  handleLikeEvent(data) {
    try {
      const username = data.uniqueId || data.nickname;
      if (!username) return;

      const viewer = this.db.getOrCreateViewer(username, {
        userId: data.userId,
        nickname: data.nickname,
        profilePictureUrl: data.profilePictureUrl
      });

      // Add interaction
      this.db.addInteraction(viewer.id, 'like');

      // Update heatmap
      this.db.updateHeatmap(viewer.id, new Date());

      // Start session if not active
      if (!this.sessionManager.hasActiveSession(username)) {
        this.sessionManager.startSession(username, data);
        this.birthdayManager.onViewerJoin(username);
      }

    } catch (error) {
      this.api.log(`Error handling like event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle share event
   */
  handleShareEvent(data) {
    try {
      const username = data.uniqueId || data.nickname;
      if (!username) return;

      const viewer = this.db.getOrCreateViewer(username, {
        userId: data.userId,
        nickname: data.nickname,
        profilePictureUrl: data.profilePictureUrl
      });

      // Add interaction
      this.db.addInteraction(viewer.id, 'share');

      // Update heatmap
      this.db.updateHeatmap(viewer.id, new Date());

    } catch (error) {
      this.api.log(`Error handling share event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle follow event
   */
  handleFollowEvent(data) {
    try {
      const username = data.uniqueId || data.nickname;
      if (!username) return;

      const viewer = this.db.getOrCreateViewer(username, {
        userId: data.userId,
        nickname: data.nickname,
        profilePictureUrl: data.profilePictureUrl
      });

      // Add interaction
      this.db.addInteraction(viewer.id, 'follow');

      // Update heatmap
      this.db.updateHeatmap(viewer.id, new Date());

    } catch (error) {
      this.api.log(`Error handling follow event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle member event (viewer joined stream)
   */
  handleMemberEvent(data) {
    try {
      const username = data.uniqueId || data.nickname;
      if (!username) return;

      // Start session
      this.sessionManager.startSession(username, {
        userId: data.userId,
        nickname: data.nickname,
        profilePictureUrl: data.profilePictureUrl
      });

      // Check birthday
      this.birthdayManager.onViewerJoin(username);

    } catch (error) {
      this.api.log(`Error handling member event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle social event
   */
  handleSocialEvent(data) {
    try {
      const username = data.uniqueId || data.nickname;
      if (!username) return;

      const viewer = this.db.getOrCreateViewer(username, {
        userId: data.userId,
        nickname: data.nickname,
        profilePictureUrl: data.profilePictureUrl
      });

      // Add interaction based on type
      if (data.label) {
        this.db.addInteraction(viewer.id, data.label.toLowerCase());
      }

    } catch (error) {
      this.api.log(`Error handling social event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle stream end
   */
  handleStreamEnd(data) {
    try {
      this.api.log('Stream ended, ending all active sessions...', 'info');
      
      // End all active sessions
      const sessions = this.sessionManager.getActiveSessions();
      sessions.forEach(session => {
        this.sessionManager.endSession(session.username);
      });

    } catch (error) {
      this.api.log(`Error handling stream end: ${error.message}`, 'error');
    }
  }

  /**
   * Update viewer info from TikTok event
   */
  updateViewerInfo(username, data) {
    try {
      const viewer = this.db.getViewerByUsername(username);
      if (!viewer) return;

      const updates = {};

      if (data.userId && data.userId !== 'undefined') {
        updates.tiktok_user_id = data.userId;
      }

      if (data.nickname) {
        updates.display_name = data.nickname;
      }

      // Profile Picture Update - always update when available
      if (data.profilePictureUrl && data.profilePictureUrl !== viewer.profile_picture_url) {
        updates.profile_picture_url = data.profilePictureUrl;
        this.api.log(`Updated profile picture for ${username}`, 'debug');
      }

      if (data.followRole) {
        // Extract follower info if available
        // followRole: 0 = not following, 1 = following, 2 = friends
      }

      if (Object.keys(updates).length > 0) {
        updates.last_seen_at = new Date().toISOString();
        this.db.updateViewer(username, updates);
      }

    } catch (error) {
      this.api.log(`Error updating viewer info: ${error.message}`, 'error');
    }
  }
}

module.exports = ViewerProfilesPlugin;
