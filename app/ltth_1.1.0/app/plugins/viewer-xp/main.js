/**
 * Viewer XP System Plugin
 * 
 * Complete gamification system for TikTok viewers with:
 * - Persistent XP and level tracking
 * - Daily bonuses and streak rewards
 * - Badge and title system
 * - Live overlays (XP bar, leaderboard)
 * - Admin panel for viewer management
 * - Scalable for high viewer counts
 */

const EventEmitter = require('events');
const ViewerXPDatabase = require('./backend/database');
const path = require('path');
const fs = require('fs');

class ViewerXPPlugin extends EventEmitter {
  constructor(api) {
    super();
    this.api = api;
    this.pluginId = 'viewer-xp';
    
    // Initialize database
    this.db = new ViewerXPDatabase(api);
    
    // Cooldown tracking (in-memory)
    this.cooldowns = new Map(); // username -> { actionType -> lastTimestamp }
    
    // Watch time tracking (in-memory, persisted periodically)
    this.watchTimers = new Map(); // username -> { startTime, lastUpdate }
    this.watchTimeInterval = null;
  }

  /**
   * Initialize plugin
   */
  async init() {
    this.api.log('🎮 Initializing Viewer XP System Plugin...', 'info');

    try {
      // Initialize database
      this.db.initialize();

      // Register API routes
      this.registerRoutes();

      // Register TikTok event handlers
      this.registerEventHandlers();

      // Register WebSocket handlers
      this.registerWebSocketHandlers();

      // Start watch time tracking
      this.startWatchTimeTracking();

      this.api.log('✅ Viewer XP System initialized successfully', 'info');
      this.api.log('   - XP tracking active for all viewer actions', 'info');
      this.api.log('   - Daily bonuses and streaks enabled', 'info');
      this.api.log('   - Overlays ready at /overlay/viewer-xp/*', 'info');
      this.api.log('   - Admin panel at /viewer-xp/admin', 'info');
    } catch (error) {
      this.api.log(`❌ Error initializing Viewer XP System: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Register API routes
   */
  registerRoutes() {
    // Serve overlay HTML files
    this.api.registerRoute('GET', '/overlay/viewer-xp/xp-bar', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlays', 'xp-bar.html'));
    });

    this.api.registerRoute('GET', '/overlay/viewer-xp/leaderboard', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlays', 'leaderboard.html'));
    });

    this.api.registerRoute('GET', '/overlay/viewer-xp/level-up', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlays', 'level-up.html'));
    });

    // Serve main UI (redirects to admin)
    this.api.registerRoute('GET', '/viewer-xp/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui.html'));
    });

    // Serve admin panel
    this.api.registerRoute('GET', '/viewer-xp/admin', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui', 'admin.html'));
    });

    // API: Get viewer profile
    this.api.registerRoute('GET', '/api/viewer-xp/profile/:username', (req, res) => {
      try {
        const profile = this.db.getViewerProfile(req.params.username);
        if (!profile) {
          return res.status(404).json({ error: 'Viewer not found' });
        }
        res.json(profile);
      } catch (error) {
        this.api.log(`Error getting viewer profile: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get viewer statistics
    this.api.registerRoute('GET', '/api/viewer-xp/stats/:username', (req, res) => {
      try {
        const stats = this.db.getViewerStats(req.params.username);
        if (!stats) {
          return res.status(404).json({ error: 'Viewer not found' });
        }
        res.json(stats);
      } catch (error) {
        this.api.log(`Error getting viewer stats: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get leaderboard
    this.api.registerRoute('GET', '/api/viewer-xp/leaderboard', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const days = req.query.days ? parseInt(req.query.days) : null;
        const leaderboard = this.db.getTopViewers(limit, days);
        res.json(leaderboard);
      } catch (error) {
        this.api.log(`Error getting leaderboard: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get overall statistics
    this.api.registerRoute('GET', '/api/viewer-xp/stats', (req, res) => {
      try {
        const stats = this.db.getOverallStats();
        res.json(stats);
      } catch (error) {
        this.api.log(`Error getting overall stats: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get XP actions configuration
    this.api.registerRoute('GET', '/api/viewer-xp/actions', (req, res) => {
      try {
        const actions = this.db.getAllXPActions();
        res.json(actions);
      } catch (error) {
        this.api.log(`Error getting XP actions: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update XP action configuration
    this.api.registerRoute('POST', '/api/viewer-xp/actions/:actionType', (req, res) => {
      try {
        const { actionType } = req.params;
        const { xp_amount, cooldown_seconds, enabled } = req.body;
        
        this.db.updateXPAction(actionType, xp_amount, cooldown_seconds, enabled);
        res.json({ success: true });
      } catch (error) {
        this.api.log(`Error updating XP action: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Manual XP award (admin)
    this.api.registerRoute('POST', '/api/viewer-xp/award', (req, res) => {
      try {
        const { username, amount, reason } = req.body;
        
        if (!username || !amount) {
          return res.status(400).json({ error: 'Username and amount required' });
        }

        this.db.addXP(username, amount, 'manual_award', { reason });
        res.json({ success: true });
      } catch (error) {
        this.api.log(`Error awarding XP: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get settings
    this.api.registerRoute('GET', '/api/viewer-xp/settings', (req, res) => {
      try {
        const settings = {
          enableDailyBonus: this.db.getSetting('enableDailyBonus', true),
          enableStreaks: this.db.getSetting('enableStreaks', true),
          enableWatchTime: this.db.getSetting('enableWatchTime', true),
          watchTimeInterval: this.db.getSetting('watchTimeInterval', 60),
          announceLevel: this.db.getSetting('announceLevelUps', true)
        };
        res.json(settings);
      } catch (error) {
        this.api.log(`Error getting settings: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update settings
    this.api.registerRoute('POST', '/api/viewer-xp/settings', (req, res) => {
      try {
        const settings = req.body;
        for (const [key, value] of Object.entries(settings)) {
          this.db.setSetting(key, value);
        }
        res.json({ success: true });
      } catch (error) {
        this.api.log(`Error updating settings: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get level configurations
    this.api.registerRoute('GET', '/api/viewer-xp/level-config', (req, res) => {
      try {
        const configs = this.db.getAllLevelConfigs();
        res.json(configs);
      } catch (error) {
        this.api.log(`Error getting level config: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Set level configurations
    this.api.registerRoute('POST', '/api/viewer-xp/level-config', (req, res) => {
      try {
        const { configs } = req.body;
        this.db.setLevelConfig(configs);
        res.json({ success: true });
      } catch (error) {
        this.api.log(`Error setting level config: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Generate level configurations
    this.api.registerRoute('POST', '/api/viewer-xp/level-config/generate', (req, res) => {
      try {
        const { type, settings } = req.body;
        const configs = this.db.generateLevelConfigs(type, settings);
        res.json(configs);
      } catch (error) {
        this.api.log(`Error generating level config: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get viewer history
    this.api.registerRoute('GET', '/api/viewer-xp/history/:username', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const history = this.db.getViewerHistory(req.params.username, limit);
        res.json(history);
      } catch (error) {
        this.api.log(`Error getting viewer history: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Export viewer data
    this.api.registerRoute('GET', '/api/viewer-xp/export', (req, res) => {
      try {
        const data = this.db.exportViewerData();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="viewer-xp-export-${Date.now()}.json"`);
        res.json(data);
      } catch (error) {
        this.api.log(`Error exporting data: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Import viewer data
    this.api.registerRoute('POST', '/api/viewer-xp/import', (req, res) => {
      try {
        const data = req.body;
        this.db.importViewerData(data);
        res.json({ success: true, message: 'Data imported successfully' });
      } catch (error) {
        this.api.log(`Error importing data: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get shared user statistics (cross-plugin)
    this.api.registerRoute('GET', '/api/viewer-xp/shared-stats', (req, res) => {
      try {
        const mainDb = this.api.getDatabase();
        let limit = parseInt(req.query.limit) || 100;
        let minCoins = parseInt(req.query.minCoins) || 0;
        
        // Validate and bounds check parameters
        limit = Math.max(1, Math.min(limit, 1000)); // Between 1 and 1000
        minCoins = Math.max(0, minCoins); // Non-negative
        
        const stats = mainDb.getAllUserStatistics(limit, minCoins);
        res.json({ success: true, statistics: stats });
      } catch (error) {
        this.api.log(`Error getting shared statistics: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get shared statistics for specific user
    this.api.registerRoute('GET', '/api/viewer-xp/shared-stats/:userId', (req, res) => {
      try {
        const mainDb = this.api.getDatabase();
        const stats = mainDb.getUserStatistics(req.params.userId);
        
        if (!stats) {
          return res.status(404).json({ 
            success: false, 
            error: 'User statistics not found',
            statistics: null
          });
        }
        
        res.json({ success: true, statistics: stats });
      } catch (error) {
        this.api.log(`Error getting user shared statistics: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    this.api.log('Viewer XP routes registered', 'debug');
  }

  /**
   * Register TikTok event handlers
   */
  registerEventHandlers() {
    // Chat messages
    this.api.registerTikTokEvent('chat', (data) => {
      this.handleChatMessage(data);
    });

    // Likes
    this.api.registerTikTokEvent('like', (data) => {
      this.handleLike(data);
    });

    // Shares
    this.api.registerTikTokEvent('share', (data) => {
      this.handleShare(data);
    });

    // Follows
    this.api.registerTikTokEvent('follow', (data) => {
      this.handleFollow(data);
    });

    // Gifts
    this.api.registerTikTokEvent('gift', (data) => {
      this.handleGift(data);
    });

    // Join (for watch time and daily bonuses)
    this.api.registerTikTokEvent('join', (data) => {
      this.handleJoin(data);
    });

    this.api.log('TikTok event handlers registered', 'debug');
  }

  /**
   * Register WebSocket handlers
   */
  registerWebSocketHandlers() {
    const io = this.api.getSocketIO();
    
    io.on('connection', (socket) => {
      // Client requests viewer profile
      socket.on('viewer-xp:get-profile', (username) => {
        const profile = this.db.getViewerProfile(username);
        socket.emit('viewer-xp:profile', profile);
      });

      // Client requests leaderboard
      socket.on('viewer-xp:get-leaderboard', (params) => {
        const limit = params?.limit || 10;
        const days = params?.days || null;
        const leaderboard = this.db.getTopViewers(limit, days);
        socket.emit('viewer-xp:leaderboard', leaderboard);
      });
    });

    this.api.log('WebSocket handlers registered', 'debug');
  }

  /**
   * Check cooldown for action
   */
  checkCooldown(username, actionType, cooldownSeconds) {
    if (cooldownSeconds === 0) return true;

    if (!this.cooldowns.has(username)) {
      this.cooldowns.set(username, {});
    }

    const userCooldowns = this.cooldowns.get(username);
    const now = Date.now();
    const lastTime = userCooldowns[actionType] || 0;
    const elapsed = (now - lastTime) / 1000;

    if (elapsed >= cooldownSeconds) {
      userCooldowns[actionType] = now;
      return true;
    }

    return false;
  }

  /**
   * Award XP for action
   */
  awardXP(username, actionType, details = null) {
    const action = this.db.getXPAction(actionType);
    
    if (!action || !action.enabled) {
      return false;
    }

    // Check cooldown
    if (!this.checkCooldown(username, actionType, action.cooldown_seconds)) {
      return false;
    }

    // Award XP
    this.db.addXP(username, action.xp_amount, actionType, details);

    // Emit event for real-time updates
    this.emitXPUpdate(username, action.xp_amount, actionType);

    return true;
  }

  /**
   * Emit XP update event
   */
  emitXPUpdate(username, amount, actionType) {
    const io = this.api.getSocketIO();
    const profile = this.db.getViewerProfile(username);
    
    io.emit('viewer-xp:update', {
      username,
      amount,
      actionType,
      profile
    });
  }

  /**
   * Emit level up event
   */
  emitLevelUp(username, oldLevel, newLevel, rewards) {
    const io = this.api.getSocketIO();
    
    io.emit('viewer-xp:level-up', {
      username,
      oldLevel,
      newLevel,
      rewards
    });

    // Announce in chat/overlay if enabled
    if (this.db.getSetting('announceLevelUps', true) && rewards?.announcement_message) {
      const message = rewards.announcement_message.replace('{username}', username);
      this.api.emit('announcement', {
        type: 'level-up',
        username,
        level: newLevel,
        message
      });
    }
  }

  /**
   * Handle chat message
   */
  handleChatMessage(data) {
    const username = data.uniqueId || data.username;
    if (!username) return;

    this.db.updateLastSeen(username);
    
    // Update shared statistics
    try {
      const mainDb = this.api.getDatabase();
      const userId = data.userId || username;
      mainDb.updateUserStatistics(userId, username, { comments: 1 });
    } catch (error) {
      this.api.log(`Error updating shared statistics: ${error.message}`, 'error');
    }
    
    this.awardXP(username, 'chat_message', { message: data.comment });
  }

  /**
   * Handle like
   */
  handleLike(data) {
    const username = data.uniqueId || data.username;
    if (!username) return;

    this.db.updateLastSeen(username);
    
    // Update shared statistics
    try {
      const mainDb = this.api.getDatabase();
      const userId = data.userId || username;
      mainDb.updateUserStatistics(userId, username, { likes: 1 });
    } catch (error) {
      this.api.log(`Error updating shared statistics: ${error.message}`, 'error');
    }
    
    this.awardXP(username, 'like', { likeCount: data.likeCount });
  }

  /**
   * Handle share
   */
  handleShare(data) {
    const username = data.uniqueId || data.username;
    if (!username) return;

    this.db.updateLastSeen(username);
    
    // Update shared statistics
    try {
      const mainDb = this.api.getDatabase();
      const userId = data.userId || username;
      mainDb.updateUserStatistics(userId, username, { shares: 1 });
    } catch (error) {
      this.api.log(`Error updating shared statistics: ${error.message}`, 'error');
    }
    
    this.awardXP(username, 'share');
  }

  /**
   * Handle follow
   */
  handleFollow(data) {
    const username = data.uniqueId || data.username;
    if (!username) return;

    this.db.updateLastSeen(username);
    
    // Update shared statistics
    try {
      const mainDb = this.api.getDatabase();
      const userId = data.userId || username;
      mainDb.updateUserStatistics(userId, username, { follows: 1 });
    } catch (error) {
      this.api.log(`Error updating shared statistics: ${error.message}`, 'error');
    }
    
    this.awardXP(username, 'follow');
  }

  /**
   * Handle gift
   */
  handleGift(data) {
    const username = data.uniqueId || data.username;
    if (!username) return;

    this.db.updateLastSeen(username);

    // FIX: Use data.coins (already calculated as diamondCount * repeatCount)
    // instead of data.gift?.diamond_count (which is just the raw diamond value per gift)
    const coins = data.coins || 0;
    
    // Update shared user statistics (cross-plugin)
    try {
      const mainDb = this.api.getDatabase();
      const userId = data.userId || username;
      const uniqueId = data.uniqueId || '';
      const profilePictureUrl = data.profilePictureUrl || '';
      mainDb.addCoinsToUserStats(userId, username, uniqueId, profilePictureUrl, coins);
    } catch (error) {
      this.api.log(`Error updating shared user statistics: ${error.message}`, 'error');
    }
    
    // Determine gift tier based on coin value
    let actionType = 'gift_tier1';
    if (coins >= 1000) {
      actionType = 'gift_tier3';
    } else if (coins >= 100) {
      actionType = 'gift_tier2';
    }

    this.awardXP(username, actionType, {
      giftName: data.giftName || data.gift?.name,
      coins: coins,
      repeatCount: data.repeatCount || 1
    });
  }

  /**
   * Handle viewer join
   */
  handleJoin(data) {
    const username = data.uniqueId || data.username;
    if (!username) return;

    this.db.updateLastSeen(username);

    // Update daily activity and check streak
    const activityResult = this.db.updateDailyActivity(username);
    
    // Award daily bonus if enabled and first join today
    if (activityResult.firstToday && this.db.getSetting('enableDailyBonus', true)) {
      const awarded = this.db.awardDailyBonus(username);
      if (awarded) {
        this.emitXPUpdate(username, this.db.getXPAction('daily_bonus').xp_amount, 'daily_bonus');
      }
    }

    // Start watch time tracking
    if (this.db.getSetting('enableWatchTime', true)) {
      this.watchTimers.set(username, {
        startTime: Date.now(),
        lastUpdate: Date.now()
      });
    }
  }

  /**
   * Start watch time tracking interval
   */
  startWatchTimeTracking() {
    const intervalMinutes = this.db.getSetting('watchTimeInterval', 1);
    
    this.watchTimeInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [username, timer] of this.watchTimers.entries()) {
        const elapsed = (now - timer.lastUpdate) / 1000 / 60; // minutes
        
        if (elapsed >= intervalMinutes) {
          this.awardXP(username, 'watch_time_minute');
          timer.lastUpdate = now;
        }
      }
    }, 30000); // Check every 30 seconds

    this.api.log('Watch time tracking started', 'debug');
  }

  /**
   * Cleanup on destroy
   */
  async destroy() {
    this.api.log('Shutting down Viewer XP System...', 'info');

    // Stop watch time tracking
    if (this.watchTimeInterval) {
      clearInterval(this.watchTimeInterval);
    }

    // Cleanup database
    this.db.destroy();

    this.api.log('Viewer XP System shut down', 'info');
  }
}

module.exports = ViewerXPPlugin;
