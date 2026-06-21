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
    // Keep pluginId as 'viewer-xp' for backward compatibility with database records,
    // routes (/viewer-xp/*), and existing configurations. The actual plugin.json id
    // is 'viewer-leaderboard', but internal paths reference 'viewer-xp'.
    this.pluginId = 'viewer-xp';
    
    // Initialize database
    this.db = new ViewerXPDatabase(api);
    
    // Cooldown tracking (in-memory)
    this.cooldowns = new Map(); // username -> { actionType -> lastTimestamp }
    
    // NEW: Rate limit tracking (in-memory)
    this.rateLimitTracker = new Map(); // username:actionType -> { timestamp, count }
    this.globalXPTracker = new Map(); // username:global -> { xp_5min, xp_1hour, timestamps }
    
    // Watch time tracking (in-memory, persisted periodically)
    this.watchTimers = new Map(); // username -> { startTime, lastUpdate }
    this.watchTimeInterval = null;

    // Detail log retention cleanup
    this.retentionCleanupTimer = null;
    this.retentionCleanupInterval = null;
    this.retentionCleanupRunning = false;
    
    // Currency system constants
    this.UNRANKED_FALLBACK = 999; // Fallback rank for users with no previous ranking

    // Gifter leaderboard session tracking (in-memory)
    this.gifterSessionData = new Map(); // userId -> { nickname, uniqueId, profilePictureUrl, coins }
    
    // NEW: Socket event throttling
    this.eventThrottle = {
      lastLeaderboardEmit: 0,
      leaderboardThrottleMs: 2000, // 2 seconds
      pendingEvents: [],
      eventBatchTimer: null,
      eventBatchMs: 500 // 500ms batching for events
    };
  }

  /**
   * Initialize plugin
   */
  async init() {
    this.api.log('🎮 Initializing Viewer XP System Plugin...', 'info');

    try {
      // Initialize database
      this.db.initialize();

      // Set level up callback
      this.db.setLevelUpCallback((levelUpData) => {
        this.emitLevelUp(
          levelUpData.username,
          levelUpData.oldLevel,
          levelUpData.newLevel,
          levelUpData.rewards
        );
      });

      // Register API routes
      this.registerRoutes();

      // Register TikTok event handlers
      this.registerEventHandlers();

      // Register WebSocket handlers
      this.registerWebSocketHandlers();

      // Register GCCE commands
      this.registerGCCECommands();

      // Register IFTTT triggers and actions
      this.registerIFTTTIntegration();

      // Start watch time tracking
      this.startWatchTimeTracking();

      // Start bounded retention cleanup for high-volume XP detail logs
      this.startRetentionCleanup();

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
   * Helper method to check if Socket.IO is available
   * @param {string} methodName - The Socket.IO method to check (e.g., 'on', 'emit', 'to')
   * @returns {Object|null} - Returns io instance if available, null otherwise
   */
  getSocketIOIfAvailable(methodName = 'emit') {
    const io = this.api.getSocketIO();
    if (!io || typeof io[methodName] !== 'function') {
      return null;
    }
    return io;
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

    this.api.registerRoute('GET', '/overlay/viewer-xp/user-profile', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlays', 'user-profile.html'));
    });

    // NEW: Event ticker overlay
    this.api.registerRoute('GET', '/overlay/viewer-xp/event-ticker', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlays', 'event-ticker.html'));
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

    // API: Recent manual XP awards
    this.api.registerRoute('GET', '/api/viewer-xp/manual-awards', (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const awards = this.db.getManualAwards(limit);
        res.json(awards);
      } catch (error) {
        this.api.log(`Error getting manual awards: ${error.message}`, 'error');
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

    // API: Level rewards
    this.api.registerRoute('GET', '/api/viewer-xp/level-rewards', (req, res) => {
      try {
        const rewards = this.db.getAllLevelRewards();
        res.json(rewards);
      } catch (error) {
        this.api.log(`Error getting level rewards: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    this.api.registerRoute('POST', '/api/viewer-xp/level-rewards', (req, res) => {
      try {
        const { level, title, name_color, announcement_message, animation } = req.body;
        if (!level || Number.isNaN(Number(level))) {
          return res.status(400).json({ error: 'Level is required' });
        }

        const reward = {
          level: parseInt(level),
          title,
          name_color,
          announcement_message,
          special_effects: animation ? { animation } : null
        };

        this.db.upsertLevelReward(reward);
        res.json({ success: true });
      } catch (error) {
        this.api.log(`Error saving level reward: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    this.api.registerRoute('DELETE', '/api/viewer-xp/level-rewards/:level', (req, res) => {
      try {
        const level = parseInt(req.params.level);
        if (Number.isNaN(level)) {
          return res.status(400).json({ error: 'Invalid level' });
        }
        this.db.deleteLevelReward(level);
        res.json({ success: true });
      } catch (error) {
        this.api.log(`Error deleting level reward: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // API: Username search (autocomplete)
    this.api.registerRoute('GET', '/api/viewer-xp/search', (req, res) => {
      try {
        const query = (req.query.q || '').toString();
        const limit = parseInt(req.query.limit) || 10;
        const results = this.db.searchViewers(query, limit);
        res.json(results);
      } catch (error) {
        this.api.log(`Error searching viewers: ${error.message}`, 'error');
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

    // API: Process events from event_logs table
    this.api.registerRoute('POST', '/api/viewer-xp/process-event-logs', (req, res) => {
      try {
        const limit = parseInt(req.body.limit) || 1000;
        const since = req.body.since || null;
        
        // Validate limit
        if (limit < 1 || limit > 10000) {
          return res.status(400).json({ 
            success: false, 
            error: 'Limit must be between 1 and 10000' 
          });
        }
        
        this.api.log(`Processing events from event_logs (limit: ${limit}, since: ${since})`, 'info');
        
        const stats = this.db.processEventsFromLog(limit, since);
        
        res.json({ 
          success: true, 
          message: 'Events processed successfully',
          stats: stats
        });
      } catch (error) {
        this.api.log(`Error processing event logs: ${error.message}`, 'error');
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
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

    // Gifter Leaderboard API Routes (integrated from standalone leaderboard plugin)
    
    // Get current session gifter leaderboard
    this.api.registerRoute('GET', '/api/plugins/leaderboard/session', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const sessionBoard = this.getGifterSessionLeaderboard(limit);
        res.json({
          success: true,
          data: sessionBoard,
          sessionStartTime: this.db.getGifterSessionStartTime()
        });
      } catch (error) {
        this.api.log(`Error getting session leaderboard: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get all-time gifter leaderboard
    this.api.registerRoute('GET', '/api/plugins/leaderboard/alltime', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const minCoins = parseInt(req.query.minCoins) || 0;
        const alltimeBoard = this.db.getTopGifters(limit, minCoins);
        res.json({
          success: true,
          data: alltimeBoard
        });
      } catch (error) {
        this.api.log(`Error getting all-time leaderboard: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get combined gifter leaderboard (both session and all-time)
    this.api.registerRoute('GET', '/api/plugins/leaderboard/combined', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const minCoins = parseInt(req.query.minCoins) || 0;
        
        const sessionBoard = this.getGifterSessionLeaderboard(limit);
        const alltimeBoard = this.db.getTopGifters(limit, minCoins);
        
        res.json({
          success: true,
          session: {
            data: sessionBoard,
            startTime: this.db.getGifterSessionStartTime()
          },
          alltime: {
            data: alltimeBoard
          }
        });
      } catch (error) {
        this.api.log(`Error getting combined leaderboard: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get gifter user stats
    this.api.registerRoute('GET', '/api/plugins/leaderboard/user/:userId', (req, res) => {
      try {
        const userId = req.params.userId;
        const stats = this.db.getGifterStats(userId);
        const sessionStats = this.gifterSessionData.get(userId);

        res.json({
          success: true,
          alltime: stats,
          session: sessionStats || null
        });
      } catch (error) {
        this.api.log(`Error getting user stats: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Reset gifter session (admin command)
    this.api.registerRoute('POST', '/api/plugins/leaderboard/reset-session', (req, res) => {
      try {
        this.resetGifterSession();
        res.json({
          success: true,
          message: 'Session reset successfully'
        });
      } catch (error) {
        this.api.log(`Error resetting session: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get gifter leaderboard config
    this.api.registerRoute('GET', '/api/plugins/leaderboard/config', (req, res) => {
      try {
        const config = this.db.getGifterLeaderboardConfig();
        res.json({
          success: true,
          config
        });
      } catch (error) {
        this.api.log(`Error getting config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update gifter leaderboard config
    this.api.registerRoute('POST', '/api/plugins/leaderboard/config', (req, res) => {
      try {
        this.db.updateGifterLeaderboardConfig(req.body);
        res.json({
          success: true,
          message: 'Config updated successfully'
        });
      } catch (error) {
        this.api.log(`Error updating config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test/Preview mode - returns mock data
    this.api.registerRoute('GET', '/api/plugins/leaderboard/test-data', (req, res) => {
      try {
        const mockSessionData = this.generateGifterMockData('session');
        const mockAlltimeData = this.generateGifterMockData('alltime');
        
        res.json({
          success: true,
          session: {
            data: mockSessionData,
            startTime: new Date(Date.now() - 3600000).toISOString()
          },
          alltime: {
            data: mockAlltimeData
          }
        });
      } catch (error) {
        this.api.log(`Error generating test data: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Serve gifter leaderboard UI HTML
    this.api.registerRoute('GET', '/leaderboard/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui', 'gifter-leaderboard-ui.html'));
    });

    // Serve gifter leaderboard overlay HTML
    this.api.registerRoute('GET', '/leaderboard/overlay', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlays', 'gifter-leaderboard-overlay.html'));
    });

    // Serve gifter leaderboard overlay CSS
    this.api.registerRoute('GET', '/leaderboard/style.css', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui', 'gifter-leaderboard-style.css'));
    });

    // Serve theme CSS dynamically based on query parameter or config
    this.api.registerRoute('GET', '/leaderboard/theme.css', (req, res) => {
      const theme = req.query.theme || this.db.getGifterLeaderboardConfig()?.theme || 'neon';
      const themePath = path.join(__dirname, 'ui', 'gifter-leaderboard-themes', `${theme}.css`);
      
      // Check if theme file exists
      if (fs.existsSync(themePath)) {
        res.sendFile(themePath);
      } else {
        // Fallback to neon theme
        res.sendFile(path.join(__dirname, 'ui', 'gifter-leaderboard-themes', 'neon.css'));
      }
    });

    // Serve gifter leaderboard overlay JS
    this.api.registerRoute('GET', '/leaderboard/script.js', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui', 'gifter-leaderboard-script.js'));
    });

    // Spin wheel configuration routes
    this.api.registerRoute('GET', '/api/viewer-xp/spin/config', (req, res) => {
      try {
        const config = this.db.getSpinConfig();
        res.json({ success: true, config });
      } catch (error) {
        this.api.log(`Error getting spin config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('POST', '/api/viewer-xp/spin/config', (req, res) => {
      try {
        const success = this.db.updateSpinConfig(req.body);
        if (success) {
          res.json({ success: true, message: 'Spin config updated successfully' });
        } else {
          res.status(500).json({ success: false, error: 'Failed to update spin config' });
        }
      } catch (error) {
        this.api.log(`Error updating spin config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('GET', '/api/viewer-xp/spin/history', (req, res) => {
      try {
        const username = req.query.username || null;
        const limit = parseInt(req.query.limit) || 50;
        const history = this.db.getSpinHistory(username, limit);
        res.json({ success: true, history });
      } catch (error) {
        this.api.log(`Error getting spin history: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('GET', '/api/viewer-xp/spin/stats', (req, res) => {
      try {
        const username = req.query.username || null;
        const stats = this.db.getSpinStats(username);
        res.json({ success: true, stats });
      } catch (error) {
        this.api.log(`Error getting spin stats: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Serve spin wheel overlay
    this.api.registerRoute('GET', '/overlay/viewer-xp/spin-wheel', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlays', 'spin-wheel.html'));
    });

    // ==========================================
    // NEW: Extended Configuration API Routes
    // ==========================================

    // Get full extended configuration
    this.api.registerRoute('GET', '/api/viewer-xp/config', (req, res) => {
      try {
        const config = this.db.getAllExtendedConfigs();
        res.json({ success: true, config });
      } catch (error) {
        this.api.log(`Error getting config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update extended configuration
    this.api.registerRoute('POST', '/api/viewer-xp/config', (req, res) => {
      try {
        const { key, value } = req.body;
        
        if (!key) {
          return res.status(400).json({ success: false, error: 'Configuration key is required' });
        }

        // Validation for specific config keys
        if (key === 'rate_limits' && value) {
          if (typeof value !== 'object') {
            return res.status(400).json({ success: false, error: 'rate_limits must be an object' });
          }
        }

        if (key === 'event_caps' && value) {
          if (typeof value !== 'object') {
            return res.status(400).json({ success: false, error: 'event_caps must be an object' });
          }
        }

        if (key === 'xp_multipliers' && value) {
          if (typeof value !== 'object' || typeof value.global !== 'number') {
            return res.status(400).json({ success: false, error: 'Invalid xp_multipliers format' });
          }
          if (value.global < 0.1 || value.global > 10.0) {
            return res.status(400).json({ success: false, error: 'Global multiplier must be between 0.1 and 10.0' });
          }
        }

        if (key === 'detail_log_retention' && value) {
          if (typeof value !== 'object') {
            return res.status(400).json({ success: false, error: 'detail_log_retention must be an object' });
          }
          if (value.detail_log_days !== undefined && (Number(value.detail_log_days) < 1 || Number(value.detail_log_days) > 3650)) {
            return res.status(400).json({ success: false, error: 'detail_log_days must be between 1 and 3650' });
          }
        }

        this.db.setExtendedConfig(key, value);
        res.json({ success: true, message: 'Configuration updated' });
      } catch (error) {
        this.api.log(`Error updating config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==========================================
    // NEW: XP Event Logs API Routes
    // ==========================================

    // Get XP events with filters and pagination
    this.api.registerRoute('GET', '/api/viewer-xp/logs', (req, res) => {
      try {
        const options = {
          username: req.query.username || null,
          event_type: req.query.event_type || null,
          start_time: req.query.start_time ? parseInt(req.query.start_time) : null,
          end_time: req.query.end_time ? parseInt(req.query.end_time) : null,
          limit: req.query.limit ? parseInt(req.query.limit) : 50,
          offset: req.query.offset ? parseInt(req.query.offset) : 0
        };

        // Validate pagination
        if (options.limit < 1 || options.limit > 500) {
          return res.status(400).json({ 
            success: false, 
            error: 'Limit must be between 1 and 500' 
          });
        }

        if (options.offset < 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'Offset must be non-negative' 
          });
        }

        const events = this.db.getXPEvents(options);
        const total = this.db.getXPEventsCount(options);

        res.json({
          success: true,
          events,
          pagination: {
            total,
            limit: options.limit,
            offset: options.offset,
            has_more: (options.offset + options.limit) < total
          }
        });
      } catch (error) {
        this.api.log(`Error getting XP logs: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Export XP events
    this.api.registerRoute('POST', '/api/viewer-xp/logs/export', (req, res) => {
      try {
        const options = {
          username: req.body.username || null,
          event_type: req.body.event_type || null,
          start_time: req.body.start_time || null,
          end_time: req.body.end_time || null
        };

        const exportData = this.db.exportXPEvents(options);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="xp-events-${Date.now()}.json"`);
        res.json(exportData);
      } catch (error) {
        this.api.log(`Error exporting XP logs: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get available event types
    this.api.registerRoute('GET', '/api/viewer-xp/event-types', (req, res) => {
      try {
        const eventTypes = this.db.getEventTypes();
        res.json({ success: true, event_types: eventTypes });
      } catch (error) {
        this.api.log(`Error getting event types: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==========================================
    // NEW: User Opt-Out API Routes
    // ==========================================

    // Get user opt-out status
    this.api.registerRoute('GET', '/api/viewer-xp/user/:username/opt-out', (req, res) => {
      try {
        const { username } = req.params;
        const isOptedOut = this.db.isUserOptedOut(username);
        const info = isOptedOut ? this.db.getUserOptOutInfo(username) : null;

        res.json({
          success: true,
          opted_out: isOptedOut,
          info
        });
      } catch (error) {
        this.api.log(`Error getting opt-out status: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Set user opt-out status
    this.api.registerRoute('POST', '/api/viewer-xp/user/:username/opt-out', (req, res) => {
      try {
        const { username } = req.params;
        const { opt_out, reason } = req.body;

        if (typeof opt_out !== 'boolean') {
          return res.status(400).json({ 
            success: false, 
            error: 'opt_out must be a boolean' 
          });
        }

        this.db.setUserOptOut(username, opt_out, reason);

        res.json({
          success: true,
          message: opt_out ? 'User opted out successfully' : 'User opted in successfully'
        });
      } catch (error) {
        this.api.log(`Error setting opt-out status: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==========================================
    // NEW: Enhanced User Summary Route
    // ==========================================

    // Get comprehensive user summary
    this.api.registerRoute('GET', '/api/viewer-xp/user/:username/summary', (req, res) => {
      try {
        const { username } = req.params;
        
        const profile = this.db.getViewerProfile(username);
        if (!profile) {
          return res.status(404).json({ success: false, error: 'User not found' });
        }

        const stats = this.db.getViewerStats(username);
        const recentEvents = this.db.getXPEvents({ username, limit: 10 });
        const optOutInfo = this.db.getUserOptOutInfo(username);

        // Calculate XP to next level
        const currentLevel = profile.level;
        const currentXP = profile.xp;
        const nextLevelXP = this.db.getXPForLevel(currentLevel + 1);
        const xpToNextLevel = nextLevelXP - currentXP;
        const progressPercent = ((currentXP - this.db.getXPForLevel(currentLevel)) / 
                                 (nextLevelXP - this.db.getXPForLevel(currentLevel))) * 100;

        res.json({
          success: true,
          profile,
          stats,
          level_info: {
            current_level: currentLevel,
            current_xp: currentXP,
            xp_to_next_level: xpToNextLevel,
            next_level_xp: nextLevelXP,
            progress_percent: Math.max(0, Math.min(100, progressPercent))
          },
          recent_events: recentEvents,
          opted_out: !!optOutInfo,
          opt_out_info: optOutInfo
        });
      } catch (error) {
        this.api.log(`Error getting user summary: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ── COIN SYSTEM API ROUTES ─────────────────────────────────────

    // GET /api/viewer-xp/:username/coins  →  { coins, total_coins_earned }
    this.api.registerRoute('GET', '/api/viewer-xp/:username/coins', (req, res) => {
      try {
        const balance = this.db.getCoinBalance(req.params.username);
        res.json({ success: true, username: req.params.username, ...balance });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /api/viewer-xp/:username/coin-history?limit=50
    this.api.registerRoute('GET', '/api/viewer-xp/:username/coin-history', (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit || 50, 10), 200);
        const history = this.db.getCoinTransactionHistory(req.params.username, limit);
        res.json({ success: true, data: history });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /api/viewer-xp/coins/leaderboard?limit=10
    this.api.registerRoute('GET', '/api/viewer-xp/coins/leaderboard', (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit || 10, 10), 100);
        const leaderboard = this.db.getCoinLeaderboard(limit);
        res.json({ success: true, data: leaderboard });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // POST /api/viewer-xp/:username/coins/spend  body: { amount, source?, meta? }
    this.api.registerRoute('POST', '/api/viewer-xp/:username/coins/spend', (req, res) => {
      try {
        const { amount, source, meta } = req.body || {};
        if (!amount || amount <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid amount' });
        }
        const result = this.db.spendCoins(req.params.username, parseInt(amount, 10), source || 'api', meta || null);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // POST /api/viewer-xp/:username/coins/award  body: { amount, source?, meta? }
    this.api.registerRoute('POST', '/api/viewer-xp/:username/coins/award', (req, res) => {
      try {
        const { amount, source, meta } = req.body || {};
        if (!amount || amount <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid amount' });
        }
        const result = this.db.addCoins(req.params.username, parseInt(amount, 10), source || 'api', meta || null);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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

    // Disconnected - stop awarding watch time XP and clear watch timers
    this.api.registerTikTokEvent('disconnected', () => {
      this.handleStreamDisconnect();
    });

    this.api.log('TikTok event handlers registered', 'debug');
  }

  /**
   * Register WebSocket handlers
   */
  registerWebSocketHandlers() {
    const io = this.getSocketIOIfAvailable('on');
    if (!io) {
      this.api.log('⚠️ Socket.IO not available, cannot register WebSocket handlers', 'warn');
      return;
    }
    
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

      // Preview/test support: relay overlay events triggered from admin UI
      socket.on('viewer-xp:level-up', (payload) => {
        this.api.getSocketIO().emit('viewer-xp:level-up', payload);
      });

      socket.on('viewer-xp:update', (payload) => {
        this.api.getSocketIO().emit('viewer-xp:update', payload);
      });

      socket.on('viewer-xp:show-user-profile', (payload) => {
        this.api.getSocketIO().emit('viewer-xp:show-user-profile', payload);
      });
    });

    // Gifter Leaderboard Socket Events
    this.api.registerSocket('leaderboard:request-update', async (socket) => {
      const sessionBoard = this.getGifterSessionLeaderboard(10);
      const alltimeBoard = this.db.getTopGifters(10, 0);
      
      socket.emit('leaderboard:update', {
        session: {
          data: sessionBoard,
          startTime: this.db.getGifterSessionStartTime()
        },
        alltime: {
          data: alltimeBoard
        }
      });
    });

    this.api.registerSocket('leaderboard:reset-session', async (socket) => {
      this.resetGifterSession();
      socket.emit('leaderboard:session-reset', {
        success: true,
        timestamp: new Date().toISOString()
      });
    });

    // ==========================================
    // NEW: XP Event Log Socket Handlers
    // ==========================================

    io.on('connection', (socket) => {
      // Subscribe to XP event stream
      socket.on('viewerxp:subscribe-events', (params) => {
        socket.join('viewerxp-events');
        socket.emit('viewerxp:subscribed', { 
          success: true, 
          message: 'Subscribed to XP events' 
        });
      });

      // Unsubscribe from XP event stream
      socket.on('viewerxp:unsubscribe-events', () => {
        socket.leave('viewerxp-events');
        socket.emit('viewerxp:unsubscribed', { 
          success: true 
        });
      });

      // Request recent events
      socket.on('viewerxp:get-recent-events', (params) => {
        try {
          const limit = Math.min(params?.limit || 20, 100);
          const events = this.db.getXPEvents({ limit, offset: 0 });
          socket.emit('viewerxp:recent-events', {
            success: true,
            events
          });
        } catch (error) {
          socket.emit('viewerxp:recent-events', {
            success: false,
            error: error.message
          });
        }
      });

      // Request leaderboard with period filter
      socket.on('viewerxp:get-leaderboard', (params) => {
        try {
          const limit = Math.min(params?.limit || 10, 100);
          const days = params?.days || null;
          
          const leaderboard = this.db.getTopViewers(limit, days);
          
          socket.emit('viewerxp:leaderboard', {
            success: true,
            leaderboard,
            period: days ? `${days} days` : 'all-time',
            timestamp: Date.now()
          });

          // Also emit throttled leaderboard update
          this.emitThrottledLeaderboardUpdate();
        } catch (error) {
          socket.emit('viewerxp:leaderboard', {
            success: false,
            error: error.message
          });
        }
      });
    });

    this.api.log('WebSocket handlers registered', 'debug');
  }

  /**
   * NEW: Emit throttled leaderboard update
   */
  emitThrottledLeaderboardUpdate() {
    try {
      const now = Date.now();
      
      if (now - this.eventThrottle.lastLeaderboardEmit < this.eventThrottle.leaderboardThrottleMs) {
        // Too soon, skip
        return;
      }

      this.eventThrottle.lastLeaderboardEmit = now;

      const io = this.getSocketIOIfAvailable('to');
      if (!io) {
        this.api.log('⚠️ Socket.IO not available, cannot emit leaderboard update', 'warn');
        return;
      }
      
      const leaderboard = this.db.getTopViewers(10);

      io.to('viewerxp-events').emit('viewerxp:leaderboard-update', {
        leaderboard,
        timestamp: now
      });
    } catch (error) {
      this.api.log(`Error emitting throttled leaderboard update: ${error.message}`, 'error');
    }
  }

  /**
   * Register GCCE commands for chat integration
   */
  registerGCCECommands() {
    try {
      const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
      
      if (!gccePlugin?.instance) {
        this.api.log('💬 [viewer-xp] GCCE not available, skipping command registration', 'warn');
        return;
      }

      const gcce = gccePlugin.instance;

      const commands = [
        {
          name: 'xp',
          description: 'Check your current XP, level, and progress',
          syntax: '/xp [username]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'XP System',
          handler: async (args, context) => await this.handleXPCommand(args, context)
        },
        {
          name: 'rank',
          description: 'Check your rank on the leaderboard',
          syntax: '/rank [username]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'XP System',
          handler: async (args, context) => await this.handleRankCommand(args, context)
        },
        {
          name: 'profile',
          description: 'Show detailed profile with stats in overlay',
          syntax: '/profile [username]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'XP System',
          handler: async (args, context) => await this.handleProfileCommand(args, context)
        },
        {
          name: 'stats',
          description: 'Show your viewer statistics',
          syntax: '/stats [username]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'XP System',
          handler: async (args, context) => await this.handleStatsCommand(args, context)
        },
        {
          name: 'top',
          description: 'Show top viewers on the leaderboard',
          syntax: '/top [limit]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'XP System',
          handler: async (args, context) => await this.handleTopCommand(args, context)
        },
        {
          name: 'leaderboard',
          description: 'Display the XP leaderboard in HUD overlay',
          syntax: '/leaderboard [limit]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'XP System',
          handler: async (args, context) => await this.handleLeaderboardCommand(args, context)
        },
        {
          name: 'coins',
          description: 'Check your coin balance (currency)',
          syntax: '/coins [username]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'Currency',
          handler: async (args, context) => await this.handleCoinsCommand(args, context)
        },
        {
          name: 'currency',
          description: 'Show currency and wealth statistics',
          syntax: '/currency [username]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'Currency',
          handler: async (args, context) => await this.handleCurrencyCommand(args, context)
        },
        {
          name: 'richest',
          description: 'Show the richest viewers by coin balance',
          syntax: '/richest [limit]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'Currency',
          handler: async (args, context) => await this.handleRichestCommand(args, context)
        },
        {
          name: 'spin',
          description: 'Spin the wheel of fortune and win or lose XP',
          syntax: '/spin [amount]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'XP System',
          handler: async (args, context) => await this.handleSpinCommand(args, context)
        }
      ];

      const result = gcce.registerCommandsForPlugin('viewer-xp', commands);
      
      this.api.log(`💬 [viewer-xp] Registered ${result.registered.length} commands with GCCE`, 'info');
      
      if (result.failed.length > 0) {
        this.api.log(`💬 [viewer-xp] Failed to register commands: ${result.failed.join(', ')}`, 'warn');
      }

    } catch (error) {
      this.api.log(`❌ [viewer-xp] Error registering GCCE commands: ${error.message}`, 'error');
    }
  }

  /**
   * Register IFTTT triggers and actions for event system integration
   */
  registerIFTTTIntegration() {
    try {
      // Check if IFTTT engine is available
      if (!this.api.registerIFTTTTrigger) {
        this.api.log('💡 [viewer-xp] IFTTT engine not available, skipping event integration', 'debug');
        return;
      }

      // Register XP Gained trigger
      this.api.registerIFTTTTrigger('viewer-xp:xp-gained', {
        name: 'Viewer XP Gained',
        description: 'Triggers when a viewer gains XP',
        category: 'viewer-xp',
        icon: '⭐',
        fields: [
          { name: 'username', label: 'Username', type: 'string', description: 'The viewer username' },
          { name: 'amount', label: 'XP Amount', type: 'number', description: 'Amount of XP gained' },
          { name: 'actionType', label: 'Action Type', type: 'string', description: 'Type of action (chat, gift, etc.)' },
          { name: 'totalXP', label: 'Total XP', type: 'number', description: 'Viewer total XP' },
          { name: 'level', label: 'Level', type: 'number', description: 'Current level' }
        ]
      });

      // Register Level Up trigger
      this.api.registerIFTTTTrigger('viewer-xp:level-up', {
        name: 'Viewer Level Up',
        description: 'Triggers when a viewer levels up',
        category: 'viewer-xp',
        icon: '🎉',
        fields: [
          { name: 'username', label: 'Username', type: 'string', description: 'The viewer username' },
          { name: 'oldLevel', label: 'Old Level', type: 'number', description: 'Previous level' },
          { name: 'newLevel', label: 'New Level', type: 'number', description: 'New level reached' },
          { name: 'totalXP', label: 'Total XP', type: 'number', description: 'Total XP earned' },
          { name: 'rewards', label: 'Rewards', type: 'object', description: 'Level rewards earned' }
        ]
      });

      // Register Daily Bonus trigger
      this.api.registerIFTTTTrigger('viewer-xp:daily-bonus', {
        name: 'Daily Bonus Claimed',
        description: 'Triggers when a viewer claims their daily bonus',
        category: 'viewer-xp',
        icon: '🎁',
        fields: [
          { name: 'username', label: 'Username', type: 'string', description: 'The viewer username' },
          { name: 'bonusAmount', label: 'Bonus Amount', type: 'number', description: 'XP bonus amount' },
          { name: 'streakDays', label: 'Streak Days', type: 'number', description: 'Current streak in days' },
          { name: 'totalXP', label: 'Total XP', type: 'number', description: 'Viewer total XP' }
        ]
      });

      // Register Streak Milestone trigger
      this.api.registerIFTTTTrigger('viewer-xp:streak-milestone', {
        name: 'Streak Milestone Reached',
        description: 'Triggers when a viewer reaches a streak milestone (7, 30, 100 days)',
        category: 'viewer-xp',
        icon: '🔥',
        fields: [
          { name: 'username', label: 'Username', type: 'string', description: 'The viewer username' },
          { name: 'streakDays', label: 'Streak Days', type: 'number', description: 'Days in streak' },
          { name: 'milestone', label: 'Milestone', type: 'number', description: 'Milestone reached' },
          { name: 'totalXP', label: 'Total XP', type: 'number', description: 'Viewer total XP' }
        ]
      });

      // Register Currency Milestone trigger
      this.api.registerIFTTTTrigger('viewer-xp:currency-milestone', {
        name: 'Currency Milestone Reached',
        description: 'Triggers when a viewer reaches a currency milestone (100, 1000, 10000 coins)',
        category: 'currency',
        icon: '💰',
        fields: [
          { name: 'username', label: 'Username', type: 'string', description: 'The viewer username' },
          { name: 'coins', label: 'Total Coins', type: 'number', description: 'Total coins sent' },
          { name: 'milestone', label: 'Milestone', type: 'number', description: 'Milestone reached' },
          { name: 'rank', label: 'Rank', type: 'number', description: 'Rank on richest leaderboard' }
        ]
      });

      // Register Top Spender trigger
      this.api.registerIFTTTTrigger('viewer-xp:top-spender', {
        name: 'Viewer Became Top Spender',
        description: 'Triggers when a viewer enters the top 3 richest viewers',
        category: 'currency',
        icon: '💎',
        fields: [
          { name: 'username', label: 'Username', type: 'string', description: 'The viewer username' },
          { name: 'coins', label: 'Total Coins', type: 'number', description: 'Total coins sent' },
          { name: 'rank', label: 'Rank', type: 'number', description: 'Current rank (1-3)' },
          { name: 'previousRank', label: 'Previous Rank', type: 'number', description: 'Previous rank' }
        ]
      });

      // Register IFTTT actions
      this.api.registerIFTTTAction('viewer-xp:award-xp', {
        name: 'Award XP to Viewer',
        description: 'Award XP to a specific viewer',
        category: 'viewer-xp',
        icon: '⭐',
        fields: [
          { name: 'username', label: 'Username', type: 'string', required: true, description: 'Viewer username' },
          { name: 'amount', label: 'XP Amount', type: 'number', required: true, min: 1, description: 'Amount of XP to award' },
          { name: 'reason', label: 'Reason', type: 'string', description: 'Reason for awarding XP' }
        ],
        executor: async (action, context, services) => {
          try {
            let username = services.templateEngine.processTemplate(action.username, context.data);
            const amount = parseInt(action.amount);
            let reason = action.reason ? services.templateEngine.processTemplate(action.reason, context.data) : 'IFTTT automation';

            // Sanitize inputs to prevent injection attacks
            username = String(username).trim().replace(/[^\w\s\-._@]/g, '');
            reason = String(reason).trim().substring(0, 500); // Limit reason length

            if (!username || username.length === 0 || isNaN(amount) || amount <= 0) {
              return { success: false, error: 'Invalid username or amount' };
            }

            this.db.addXP(username, amount, 'ifttt_award', { reason });
            this.emitXPUpdate(username, amount, 'ifttt_award');

            return { success: true, message: `Awarded ${amount} XP to ${username}` };
          } catch (error) {
            this.api.log(`Error in viewer-xp:award-xp action: ${error.message}`, 'error');
            return { success: false, error: error.message };
          }
        }
      });

      // ── COIN SYSTEM IFTTT INTEGRATION ─────────────────────────────────────

      // Condition: Viewer has enough coins
      if (typeof this.api.registerIFTTTCondition === 'function') {
        this.api.registerIFTTTCondition('viewer-xp:has-coins', {
        name: 'Viewer has enough Coins',
        description: 'Check if viewer has at least the specified number of spendable coins',
        category: 'viewer-xp',
        icon: '💰',
        valueType: 'number',
        operators: ['gte', 'gt', 'equals', 'lt', 'lte'],
        evaluator: (condition, context) => {
          const username = context?.data?.username || context?.username;
          if (!username) return false;
          const { coins } = this.db.getCoinBalance(username);
          const compare = Number(condition.compareValue || condition.value || 0);
          switch (condition.operator) {
            case 'gt':     return coins > compare;
            case 'equals': return coins === compare;
            case 'lt':     return coins < compare;
            case 'lte':    return coins <= compare;
            case 'gte':
            default:       return coins >= compare;
          }
        },
        metadata: {
          label: 'Coin Balance',
          description: 'Current spendable coin balance of the viewer'
        }
        });
      }

      // Action: Spend coins (deduct from viewer)
      this.api.registerIFTTTAction('viewer-xp:spend-coins', {
        name: 'Spend Viewer Coins',
        description: 'Deduct coins from viewer. Returns success/fail + balance_after.',
        category: 'viewer-xp',
        icon: '💸',
        fields: [
          { name: 'username', label: 'Username', type: 'string', required: true, description: 'Viewer username' },
          { name: 'amount', label: 'Coins to spend', type: 'number', required: true, min: 1, description: 'Amount of coins to deduct' },
          { name: 'reason', label: 'Reason/label', type: 'string', description: 'Reason for spending coins' }
        ],
        executor: async (action, context, services) => {
          try {
            let username = services.templateEngine.processTemplate(action.username, context.data);
            const amount = parseInt(action.amount);
            let reason = action.reason ? services.templateEngine.processTemplate(action.reason, context.data) : 'ifttt_action';

            username = String(username).trim().replace(/[^\w\s\-._@]/g, '');
            reason = String(reason).trim().substring(0, 500);

            if (!username || username.length === 0 || isNaN(amount) || amount <= 0) {
              return { success: false, error: 'Invalid username or amount' };
            }

            const result = this.db.spendCoins(username, amount, 'ifttt_action', { reason });
            if (result.success) {
              const io = this.api.getSocketIO();
              io.emit('viewer-xp:coins-spent', {
                username,
                amount,
                balance_after: result.balance_after,
                source: 'ifttt_action',
                reason,
                timestamp: Date.now()
              });
            }
            return result;
          } catch (error) {
            this.api.log(`Error in viewer-xp:spend-coins action: ${error.message}`, 'error');
            return { success: false, error: error.message };
          }
        }
      });

      // Action: Award coins directly (without XP)
      this.api.registerIFTTTAction('viewer-xp:award-coins', {
        name: 'Award Viewer Coins',
        description: 'Give coins to viewer directly (no XP involved).',
        category: 'viewer-xp',
        icon: '💰',
        fields: [
          { name: 'username', label: 'Username', type: 'string', required: true, description: 'Viewer username' },
          { name: 'amount', label: 'Coins to award', type: 'number', required: true, min: 1, description: 'Amount of coins to award' },
          { name: 'reason', label: 'Reason/label', type: 'string', description: 'Reason for awarding coins' }
        ],
        executor: async (action, context, services) => {
          try {
            let username = services.templateEngine.processTemplate(action.username, context.data);
            const amount = parseInt(action.amount);
            let reason = action.reason ? services.templateEngine.processTemplate(action.reason, context.data) : 'ifttt_award';

            username = String(username).trim().replace(/[^\w\s\-._@]/g, '');
            reason = String(reason).trim().substring(0, 500);

            if (!username || username.length === 0 || isNaN(amount) || amount <= 0) {
              return { success: false, error: 'Invalid username or amount' };
            }

            const result = this.db.addCoins(username, amount, 'ifttt_award', { reason });
            if (result.success) {
              const io = this.api.getSocketIO();
              io.emit('viewer-xp:coins-awarded', {
                username,
                amount,
                balance_after: result.balance_after,
                source: 'ifttt_award',
                reason,
                timestamp: Date.now()
              });
            }
            return result;
          } catch (error) {
            this.api.log(`Error in viewer-xp:award-coins action: ${error.message}`, 'error');
            return { success: false, error: error.message };
          }
        }
      });

      this.api.log('✅ [viewer-xp] IFTTT triggers and actions registered', 'info');
      this.api.log('   - viewer-xp:xp-gained (trigger)', 'debug');
      this.api.log('   - viewer-xp:level-up (trigger)', 'debug');
      this.api.log('   - viewer-xp:daily-bonus (trigger)', 'debug');
      this.api.log('   - viewer-xp:streak-milestone (trigger)', 'debug');
      this.api.log('   - viewer-xp:currency-milestone (trigger)', 'debug');
      this.api.log('   - viewer-xp:top-spender (trigger)', 'debug');
      this.api.log('   - viewer-xp:award-xp (action)', 'debug');
      this.api.log('   - viewer-xp:has-coins (condition)', 'debug');
      this.api.log('   - viewer-xp:spend-coins (action)', 'debug');
      this.api.log('   - viewer-xp:award-coins (action)', 'debug');

    } catch (error) {
      this.api.log(`❌ [viewer-xp] Error registering IFTTT integration: ${error.message}`, 'error');
    }
  }

  /**
   * Handle /xp command
   */
  async handleXPCommand(args, context) {
    try {
      const targetUsername = args.length > 0 ? args[0] : context.username;
      const profile = this.db.getViewerProfile(targetUsername);

      if (!profile) {
        return {
          success: false,
          error: `No XP data found for ${targetUsername}`,
          displayOverlay: false
        };
      }

      const nextLevelXP = this.db.getXPForLevel(profile.level + 1);
      const xpForCurrentLevel = this.db.getXPForLevel(profile.level);
      const progress = profile.xp - xpForCurrentLevel;
      const needed = nextLevelXP - xpForCurrentLevel;
      const percentage = ((progress / needed) * 100).toFixed(1);

      // Get spendable coins from coin system
      let coins = 0;
      try {
        const coinBalance = this.db.getCoinBalance(targetUsername);
        coins = coinBalance.coins;
      } catch (error) {
        this.api.log(`Error fetching coin balance for ${targetUsername}: ${error.message}`, 'debug');
      }

      // Legacy: TikTok gifted coins (separate from spendable coins) — kept for reference
      let giftedCoins = 0;
      try {
        const mainDb = this.api.getDatabase();
        // Try to find user by username in user_statistics
        const userStats = mainDb.db.prepare(`
          SELECT total_coins_sent FROM user_statistics 
          WHERE username = ? AND streamer_id = ?
        `).get(targetUsername, mainDb.streamerId || 'default');
        
        if (userStats) {
          giftedCoins = userStats.total_coins_sent || 0;
        }
      } catch (error) {
        this.api.log(`Error fetching gifted coins for ${targetUsername}: ${error.message}`, 'debug');
      }

      // Send to GCCE-HUD for display with both XP and currency
      const io = this.api.getSocketIO();
      io.emit('gcce-hud:show', {
        id: `xp-${Date.now()}`,
        type: 'text',
        content: `${targetUsername}: Level ${profile.level} | ${progress}/${needed} XP (${percentage}%) | 💰 ${coins.toLocaleString()} Coins`,
        username: context.username,
        timestamp: Date.now(),
        duration: 8000,
        expiresAt: Date.now() + 8000,
        style: {
          fontSize: 36,
          fontFamily: 'Arial, sans-serif',
          textColor: profile.name_color || '#FFFFFF',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          position: 'top-center',
          maxWidth: 800
        }
      });

      return {
        success: true,
        message: `Level ${profile.level} | ${progress}/${needed} XP (${percentage}%) | 💰 ${coins.toLocaleString()} Coins`,
        displayOverlay: true,
        data: { profile, coins }
      };

    } catch (error) {
      this.api.log(`❌ Error in /xp command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to fetch XP data' };
    }
  }

  /**
   * Handle /rank command
   */
  async handleRankCommand(args, context) {
    try {
      const targetUsername = args.length > 0 ? args[0] : context.username;
      const profile = this.db.getViewerProfile(targetUsername);

      if (!profile) {
        return {
          success: false,
          error: `No rank data found for ${targetUsername}`,
          displayOverlay: false
        };
      }

      // Get rank from leaderboard
      const leaderboard = this.db.getTopViewers(1000); // Get enough to find rank
      const rank = leaderboard.findIndex(v => v.username === targetUsername) + 1;

      if (rank === 0) {
        return {
          success: false,
          error: `${targetUsername} not found on leaderboard`,
          displayOverlay: false
        };
      }

      // Send to GCCE-HUD for display
      const io = this.api.getSocketIO();
      io.emit('gcce-hud:show', {
        id: `rank-${Date.now()}`,
        type: 'text',
        content: `${targetUsername}: Rank #${rank} | Level ${profile.level} | ${profile.total_xp_earned.toLocaleString()} Total XP`,
        username: context.username,
        timestamp: Date.now(),
        duration: 8000,
        expiresAt: Date.now() + 8000,
        style: {
          fontSize: 36,
          fontFamily: 'Arial, sans-serif',
          textColor: profile.name_color || '#FFFFFF',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          position: 'top-center',
          maxWidth: 800
        }
      });

      return {
        success: true,
        message: `Rank #${rank} | Level ${profile.level}`,
        displayOverlay: true,
        data: { rank, profile }
      };

    } catch (error) {
      this.api.log(`❌ Error in /rank command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to fetch rank data' };
    }
  }

  /**
   * Handle /top command
   */
  async handleTopCommand(args, context) {
    try {
      // Validate and parse limit with proper number checking
      let limit = 5; // default
      if (args.length > 0) {
        const parsedLimit = parseInt(args[0]);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          limit = Math.min(parsedLimit, 10);
        }
      }
      
      const leaderboard = this.db.getTopViewers(limit);

      if (!leaderboard || leaderboard.length === 0) {
        return {
          success: false,
          error: 'No leaderboard data available',
          displayOverlay: false
        };
      }

      // Format leaderboard for display
      const lines = leaderboard.map((viewer, idx) => 
        `#${idx + 1} ${viewer.username}: Lv${viewer.level} (${viewer.total_xp_earned.toLocaleString()} XP)`
      ).join(' | ');

      // Send to GCCE-HUD for display
      const io = this.api.getSocketIO();
      io.emit('gcce-hud:show', {
        id: `top-${Date.now()}`,
        type: 'text',
        content: `🏆 Top ${limit} Viewers: ${lines}`,
        username: context.username,
        timestamp: Date.now(),
        duration: 12000,
        expiresAt: Date.now() + 12000,
        style: {
          fontSize: 32,
          fontFamily: 'Arial, sans-serif',
          textColor: '#FFD700',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          position: 'top-center',
          maxWidth: 1200
        }
      });

      return {
        success: true,
        message: `Top ${limit} viewers displayed`,
        displayOverlay: true,
        data: { leaderboard }
      };

    } catch (error) {
      this.api.log(`❌ Error in /top command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to fetch top viewers' };
    }
  }

  /**
   * Handle /leaderboard command - triggers full leaderboard overlay
   */
  async handleLeaderboardCommand(args, context) {
    try {
      // Validate and parse limit with proper number checking
      let limit = 10; // default
      if (args.length > 0) {
        const parsedLimit = parseInt(args[0]);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          limit = Math.min(parsedLimit, 20);
        }
      }
      
      const leaderboard = this.db.getTopViewers(limit);

      if (!leaderboard || leaderboard.length === 0) {
        return {
          success: false,
          error: 'No leaderboard data available',
          displayOverlay: false
        };
      }

      // Emit event to trigger leaderboard overlay update
      const io = this.api.getSocketIO();
      io.emit('viewer-xp:show-leaderboard', {
        limit,
        leaderboard,
        requestedBy: context.username
      });

      return {
        success: true,
        message: `Leaderboard displayed (Top ${limit})`,
        displayOverlay: true,
        data: { leaderboard }
      };

    } catch (error) {
      this.api.log(`❌ Error in /leaderboard command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to display leaderboard' };
    }
  }

  /**
   * Handle /profile command - shows detailed profile overlay
   */
  async handleProfileCommand(args, context) {
    try {
      const targetUsername = args.length > 0 ? args[0] : context.username;
      const profile = this.db.getViewerProfile(targetUsername);

      if (!profile) {
        return {
          success: false,
          error: `No profile data found for ${targetUsername}`,
          displayOverlay: false
        };
      }

      // Get rank from leaderboard
      const leaderboard = this.db.getTopViewers(1000);
      const rank = leaderboard.findIndex(v => v.username === targetUsername) + 1;

      // Add rank to profile
      profile.rank = rank > 0 ? rank : null;

      // Emit event to show user profile overlay
      const io = this.api.getSocketIO();
      io.emit('viewer-xp:show-user-profile', profile);

      return {
        success: true,
        message: `Profile displayed for ${targetUsername}`,
        displayOverlay: true,
        data: { profile }
      };

    } catch (error) {
      this.api.log(`❌ Error in /profile command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to display profile' };
    }
  }

  /**
   * Handle /stats command - shows detailed stats in HUD
   */
  async handleStatsCommand(args, context) {
    try {
      const targetUsername = args.length > 0 ? args[0] : context.username;
      const profile = this.db.getViewerProfile(targetUsername);

      if (!profile) {
        return {
          success: false,
          error: `No stats found for ${targetUsername}`,
          displayOverlay: false
        };
      }

      // Get rank
      const leaderboard = this.db.getTopViewers(1000);
      const rank = leaderboard.findIndex(v => v.username === targetUsername) + 1;

      // Get currency (coins) from shared user statistics
      let coins = 0;
      let totalGifts = 0;
      try {
        const mainDb = this.api.getDatabase();
        const userStats = mainDb.db.prepare(`
          SELECT total_coins_sent, total_gifts_sent FROM user_statistics 
          WHERE username = ? AND streamer_id = ?
        `).get(targetUsername, mainDb.streamerId || 'default');
        
        if (userStats) {
          coins = userStats.total_coins_sent || 0;
          totalGifts = userStats.total_gifts_sent || 0;
        }
      } catch (error) {
        this.api.log(`Error fetching currency stats for ${targetUsername}: ${error.message}`, 'debug');
      }

      // Format watch time
      const watchHours = Math.floor(profile.watch_time_minutes / 60);
      const watchMins = profile.watch_time_minutes % 60;
      const watchTimeStr = watchHours > 0 
        ? `${watchHours}h ${watchMins}m` 
        : `${watchMins}m`;

      // Build stats message with currency
      const statsLines = [
        `📊 ${targetUsername}'s Stats`,
        `Level ${profile.level} | Rank ${rank > 0 ? '#' + rank : 'Unranked'}`,
        `⭐ ${profile.total_xp_earned.toLocaleString()} Total XP`,
        `💰 ${coins.toLocaleString()} Coins | 🎁 ${totalGifts} Gifts`,
        `🔥 ${profile.streak_days} day streak`,
        `⏱️ ${watchTimeStr} watch time`
      ];

      if (profile.badges && profile.badges.length > 0) {
        statsLines.push(`🏆 Badges: ${profile.badges.join(', ')}`);
      }

      // Send to GCCE-HUD for display
      const io = this.api.getSocketIO();
      io.emit('gcce-hud:show', {
        id: `stats-${Date.now()}`,
        type: 'text',
        content: statsLines.join(' | '),
        username: context.username,
        timestamp: Date.now(),
        duration: 10000,
        expiresAt: Date.now() + 10000,
        style: {
          fontSize: 32,
          fontFamily: 'Arial, sans-serif',
          textColor: profile.name_color || '#FFFFFF',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          position: 'top-center',
          maxWidth: 1200
        }
      });

      return {
        success: true,
        message: `Stats for ${targetUsername}`,
        displayOverlay: true,
        data: { profile, rank, coins, totalGifts }
      };

    } catch (error) {
      this.api.log(`❌ Error in /stats command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to fetch stats' };
    }
  }

  /**
   * Handle /coins command - shows coin balance (currency)
   */
  async handleCoinsCommand(args, context) {
    try {
      const targetUsername = args.length > 0 ? args[0] : context.username;
      
      // Get currency from shared user statistics
      let userStats = null;
      try {
        const mainDb = this.api.getDatabase();
        userStats = mainDb.db.prepare(`
          SELECT * FROM user_statistics 
          WHERE username = ? AND streamer_id = ?
        `).get(targetUsername, mainDb.streamerId || 'default');
      } catch (error) {
        this.api.log(`Error fetching user stats: ${error.message}`, 'error');
      }

      if (!userStats) {
        return {
          success: false,
          error: `No currency data found for ${targetUsername}`,
          displayOverlay: false
        };
      }

      const coins = userStats.total_coins_sent || 0;
      const gifts = userStats.total_gifts_sent || 0;

      // Get XP profile for level/color info
      const profile = this.db.getViewerProfile(targetUsername);

      // Send to GCCE-HUD for display
      const io = this.api.getSocketIO();
      io.emit('gcce-hud:show', {
        id: `coins-${Date.now()}`,
        type: 'text',
        content: `${targetUsername}: 💰 ${coins.toLocaleString()} Coins | 🎁 ${gifts} Gifts Sent`,
        username: context.username,
        timestamp: Date.now(),
        duration: 8000,
        expiresAt: Date.now() + 8000,
        style: {
          fontSize: 36,
          fontFamily: 'Arial, sans-serif',
          textColor: profile?.name_color || '#FFD700',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          position: 'top-center',
          maxWidth: 800
        }
      });

      return {
        success: true,
        message: `💰 ${coins.toLocaleString()} Coins | 🎁 ${gifts} Gifts`,
        displayOverlay: true,
        data: { coins, gifts, userStats }
      };

    } catch (error) {
      this.api.log(`❌ Error in /coins command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to fetch currency data' };
    }
  }

  /**
   * Handle /currency command - shows detailed currency statistics
   */
  async handleCurrencyCommand(args, context) {
    try {
      const targetUsername = args.length > 0 ? args[0] : context.username;
      
      // Get currency from shared user statistics
      let userStats = null;
      try {
        const mainDb = this.api.getDatabase();
        userStats = mainDb.db.prepare(`
          SELECT * FROM user_statistics 
          WHERE username = ? AND streamer_id = ?
        `).get(targetUsername, mainDb.streamerId || 'default');
      } catch (error) {
        this.api.log(`Error fetching user stats: ${error.message}`, 'error');
      }

      if (!userStats) {
        return {
          success: false,
          error: `No currency data found for ${targetUsername}`,
          displayOverlay: false
        };
      }

      const coins = userStats.total_coins_sent || 0;
      const gifts = userStats.total_gifts_sent || 0;
      const comments = userStats.total_comments || 0;
      const likes = userStats.total_likes || 0;
      const shares = userStats.total_shares || 0;

      // Get rank by coins
      let coinRank = 0;
      try {
        const mainDb = this.api.getDatabase();
        const allStats = mainDb.getAllUserStatistics(1000, 0);
        coinRank = allStats.findIndex(s => s.username === targetUsername) + 1;
      } catch (error) {
        this.api.log(`Error calculating coin rank: ${error.message}`, 'debug');
      }

      // Get XP profile for level/color info
      const profile = this.db.getViewerProfile(targetUsername);

      // Build currency stats message
      const currencyLines = [
        `💰 ${targetUsername}'s Currency Stats`,
        `${coins.toLocaleString()} Coins | Rank ${coinRank > 0 ? '#' + coinRank : 'Unranked'}`,
        `🎁 ${gifts} Gifts | 💬 ${comments} Comments`,
        `❤️ ${likes} Likes | 📢 ${shares} Shares`
      ];

      // Send to GCCE-HUD for display
      const io = this.api.getSocketIO();
      io.emit('gcce-hud:show', {
        id: `currency-${Date.now()}`,
        type: 'text',
        content: currencyLines.join(' | '),
        username: context.username,
        timestamp: Date.now(),
        duration: 10000,
        expiresAt: Date.now() + 10000,
        style: {
          fontSize: 32,
          fontFamily: 'Arial, sans-serif',
          textColor: profile?.name_color || '#FFD700',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          position: 'top-center',
          maxWidth: 1200
        }
      });

      return {
        success: true,
        message: `Currency stats for ${targetUsername}`,
        displayOverlay: true,
        data: { userStats, coinRank, profile }
      };

    } catch (error) {
      this.api.log(`❌ Error in /currency command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to fetch currency stats' };
    }
  }

  /**
   * Handle /richest command - shows top viewers by coin balance
   */
  async handleRichestCommand(args, context) {
    try {
      // Validate and parse limit
      let limit = 5; // default
      if (args.length > 0) {
        const parsedLimit = parseInt(args[0]);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          limit = Math.min(parsedLimit, 10);
        }
      }
      
      // Get richest viewers from shared user statistics
      let richestViewers = [];
      try {
        const mainDb = this.api.getDatabase();
        richestViewers = mainDb.getAllUserStatistics(limit, 0);
      } catch (error) {
        this.api.log(`Error fetching richest viewers: ${error.message}`, 'error');
      }

      if (!richestViewers || richestViewers.length === 0) {
        return {
          success: false,
          error: 'No currency data available',
          displayOverlay: false
        };
      }

      // Format richest list
      const lines = richestViewers.map((viewer, idx) => 
        `#${idx + 1} ${viewer.username}: 💰 ${viewer.total_coins_sent.toLocaleString()} Coins`
      ).join(' | ');

      // Send to GCCE-HUD for display
      const io = this.api.getSocketIO();
      io.emit('gcce-hud:show', {
        id: `richest-${Date.now()}`,
        type: 'text',
        content: `💎 Top ${limit} Richest Viewers: ${lines}`,
        username: context.username,
        timestamp: Date.now(),
        duration: 12000,
        expiresAt: Date.now() + 12000,
        style: {
          fontSize: 32,
          fontFamily: 'Arial, sans-serif',
          textColor: '#FFD700',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          position: 'top-center',
          maxWidth: 1200
        }
      });

      return {
        success: true,
        message: `Top ${limit} richest viewers displayed`,
        displayOverlay: true,
        data: { richestViewers }
      };

    } catch (error) {
      this.api.log(`❌ Error in /richest command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to fetch richest viewers' };
    }
  }

  /**
   * Handle /spin command - spin the wheel of fortune
   */
  async handleSpinCommand(args, context) {
    try {
      // Get spin configuration
      const spinConfig = this.db.getSpinConfig();
      
      // Check if spin is enabled
      if (!spinConfig.enabled) {
        return {
          success: false,
          error: 'Spin wheel is currently disabled',
          displayOverlay: false
        };
      }

      // Parse bet amount - use default if not provided
      let betAmount;
      if (args.length === 0) {
        // No argument provided, use default bet
        betAmount = spinConfig.default_bet || 1000;
      } else {
        // Parse the provided amount
        betAmount = parseInt(args[0]);
        
        if (isNaN(betAmount) || betAmount <= 0) {
          return {
            success: false,
            error: `Invalid bet amount. Use: /spin [amount] (default: ${this.formatNumber(spinConfig.default_bet || 1000)} XP)`,
            displayOverlay: false
          };
        }
      }

      // Check min/max bet
      if (betAmount < spinConfig.min_bet) {
        return {
          success: false,
          error: `Minimum bet is ${this.formatNumber(spinConfig.min_bet)} XP`,
          displayOverlay: false
        };
      }

      if (betAmount > spinConfig.max_bet) {
        return {
          success: false,
          error: `Maximum bet is ${this.formatNumber(spinConfig.max_bet)} XP`,
          displayOverlay: false
        };
      }

      // Get user profile
      const profile = this.db.getViewerProfile(context.username);
      
      if (!profile) {
        return {
          success: false,
          error: 'No XP profile found. Interact with the stream first!',
          displayOverlay: false
        };
      }

      // Check if user has enough XP
      if (profile.xp < betAmount) {
        return {
          success: false,
          error: `Insufficient XP! You have ${this.formatNumber(profile.xp)} XP, need ${this.formatNumber(betAmount)} XP`,
          displayOverlay: false
        };
      }

      // Record XP before spin
      const xpBefore = profile.xp;

      // Spin the wheel - random field selection
      const fieldValues = spinConfig.field_values;
      const fieldIndex = Math.floor(Math.random() * fieldValues.length);
      const fieldValue = fieldValues[fieldIndex];

      // Simplified game mechanics:
      // - User bets an amount (they risk losing it)
      // - Field value shows what they can win or lose
      // - Positive field: user wins that amount (they get field value back, lose bet) → net = fieldValue - betAmount
      // - Negative field: user loses field value AND their bet → net = fieldValue - betAmount
      // 
      // Examples:
      //   Bet 5000, field +10000 → net +5000 (won 10k, lost 5k bet)
      //   Bet 5000, field +1000  → net -4000 (won 1k, lost 5k bet)  
      //   Bet 5000, field -2000  → net -7000 (lost 2k + 5k bet)
      //
      // In all cases, xpChange = fieldValue - betAmount
      
      const xpChange = fieldValue - betAmount;

      // Calculate final XP
      const xpAfter = xpBefore + xpChange;

      // Validate XP won't go negative
      if (xpAfter < 0) {
        return {
          success: false,
          error: 'This spin would result in negative XP. Not enough XP to cover potential loss!',
          displayOverlay: false
        };
      }

      // Update user XP in a single operation to prevent race conditions
      this.db.updateXP(context.username, xpChange);

      // Record the spin transaction
      this.db.recordSpinTransaction(
        context.username,
        betAmount,
        fieldIndex,
        fieldValue,
        xpBefore,
        xpAfter
      );

      // Get updated profile
      const updatedProfile = this.db.getViewerProfile(context.username);

      // Determine if win or loss based on XP change
      const isWin = xpChange > 0;

      // Send spin result to overlay
      const io = this.api.getSocketIO();
      io.emit('viewer-xp:spin-result', {
        username: context.username,
        betAmount: betAmount,
        fieldIndex: fieldIndex,
        fieldValue: fieldValue,
        xpChange: xpChange,
        netChange: xpChange, // For backward compatibility with overlay
        xpBefore: xpBefore,
        xpAfter: xpAfter,
        isWin: isWin,
        timestamp: Date.now(),
        spinConfig: {
          num_fields: spinConfig.num_fields,
          field_values: spinConfig.field_values
        }
      });

      // Build result message
      const resultIcon = isWin ? '🎉' : '😢';
      const changeText = xpChange > 0 
        ? `+${this.formatNumber(xpChange)}` 
        : this.formatNumber(xpChange);
      
      const fieldText = fieldValue >= 0 
        ? `+${this.formatNumber(fieldValue)}`
        : this.formatNumber(fieldValue);
      
      const resultMessage = isWin
        ? `${resultIcon} ${context.username} WON! Bet: ${this.formatNumber(betAmount)} | Field: ${fieldText} | Net: ${changeText} XP | Total: ${this.formatNumber(xpAfter)} XP`
        : `${resultIcon} ${context.username} Lost! Bet: ${this.formatNumber(betAmount)} | Field: ${fieldText} | Net: ${changeText} XP | Total: ${this.formatNumber(xpAfter)} XP`;

      // Send to GCCE-HUD for display
      io.emit('gcce-hud:show', {
        id: `spin-${Date.now()}`,
        type: 'text',
        content: resultMessage,
        username: context.username,
        timestamp: Date.now(),
        duration: 10000,
        expiresAt: Date.now() + 10000,
        style: {
          fontSize: 36,
          fontFamily: 'Arial, sans-serif',
          textColor: isWin ? '#00FF00' : '#FF4444',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          position: 'top-center',
          maxWidth: 1200
        }
      });

      return {
        success: true,
        message: resultMessage,
        displayOverlay: true,
        data: {
          betAmount,
          fieldIndex,
          fieldValue,
          xpChange,
          xpBefore,
          xpAfter,
          isWin,
          profile: updatedProfile
        }
      };

    } catch (error) {
      this.api.log(`❌ Error in /spin command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to process spin' };
    }
  }

  /**
   * Format number for display (1k, 10k, 100k, 1M, 1.1M, etc.)
   */
  formatNumber(value) {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    
    if (absValue >= 1000000) {
      // Format as millions (1M, 1.1M, etc.)
      const millions = absValue / 1000000;
      if (millions >= 10) {
        return sign + Math.floor(millions) + 'M';
      } else {
        return sign + millions.toFixed(1) + 'M';
      }
    } else if (absValue >= 1000) {
      // Format as thousands (1k, 10k, 100k)
      return sign + Math.floor(absValue / 1000) + 'k';
    } else {
      // Show full number for values < 1000
      return value.toString();
    }
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
  /**
   * Award XP to user (Enhanced with rate limiting, caps, and multipliers)
   * @param {string} username - Username
   * @param {string} actionType - Action type
   * @param {Object} details - Additional details (userId, originalAmount, meta, etc.)
   * @returns {boolean} True if XP was awarded
   */
  awardXP(username, actionType, details = null) {
    try {
      const action = this.db.getXPAction(actionType);
      
      if (!action || !action.enabled) {
        return false;
      }

      // NEW: Check if user has opted out
      if (this.db.isUserOptedOut(username)) {
        this.api.log(`User ${username} has opted out, skipping XP award`, 'debug');
        return false;
      }

      // NEW: Check rate limits
      if (this.isRateLimited(username, actionType)) {
        this.api.log(`User ${username} rate limited for ${actionType}`, 'debug');
        return false;
      }

      // Check cooldown (legacy system)
      if (!this.checkCooldown(username, actionType, action.cooldown_seconds)) {
        return false;
      }

      // Calculate base XP
      let xpAmount = action.xp_amount;

      // NEW: Apply multipliers (global, streak)
      xpAmount = this.applyMultipliers(username, xpAmount, actionType);

      // NEW: Apply event caps
      xpAmount = this.applyEventCap(actionType, xpAmount);

      // NEW: Track for global rate limits
      this.trackGlobalXP(username, xpAmount);

      // Award XP with enhanced details
      const enhancedDetails = {
        ...(details || {}),
        userId: details?.userId || 'unknown',
        originalAmount: details?.originalAmount || xpAmount,
        actionType
      };

      this.db.addXP(username, xpAmount, actionType, enhancedDetails);

      // Emit event for real-time updates
      this.emitXPUpdate(username, xpAmount, actionType, enhancedDetails);

      return true;
    } catch (error) {
      this.api.log(`Error awarding XP: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Emit XP update event (Enhanced with event logging)
   * @param {string} username - Username
   * @param {number} amount - XP amount
   * @param {string} actionType - Action type
   * @param {Object} details - Additional details
   */
  emitXPUpdate(username, amount, actionType, details = null) {
    try {
      const io = this.getSocketIOIfAvailable('emit');
      if (!io) {
        this.api.log('Socket.IO not available, skipping XP socket update', 'debug');
      }
      const profile = this.db.getViewerProfile(username);
      const coinBalance = this.db.getCoinBalance(username);
      
      // NEW: Emit detailed event log event
      const eventData = {
        username,
        amount,
        actionType,
        profile,
        coin_balance: coinBalance.coins,
        total_coins_earned: coinBalance.total_coins_earned,
        timestamp: Date.now(),
        meta: details
      };

      if (io) {
        io.emit('viewer-xp:update', eventData);
      }

      // NEW: Emit to new event log channel (to subscribed clients only)
      const eventLogData = {
        user_id: details?.userId || 'unknown',
        username,
        event_type: actionType,
        amount: details?.originalAmount || amount,
        xp_awarded: amount,
        meta: details,
        created_at: Date.now()
      };
      
      if (io && typeof io.to === 'function') {
        io.to('viewerxp-events').emit('viewerxp:event', eventLogData);
      }
      
      // Also emit to general broadcast for backward compatibility
      if (io) {
        io.emit('viewerxp:event', eventLogData);
      }

      // Trigger throttled leaderboard update
      if (io) {
        this.emitThrottledLeaderboardUpdate();
      }

      // Emit IFTTT event for XP gained
      if (profile) {
        this.emitIFTTTEvent('viewer-xp:xp-gained', {
          username,
          amount,
          actionType,
          totalXP: profile.total_xp_earned,
          level: profile.level
        });
      } else {
        // Profile not created yet (batching), emit with minimal data
        this.emitIFTTTEvent('viewer-xp:xp-gained', {
          username,
          amount,
          actionType,
          totalXP: amount,
          level: 1
        });
      }
    } catch (error) {
      this.api.log(`Error emitting XP update: ${error.message}`, 'error');
    }
  }

  /**
   * Emit level up event
   */
  emitLevelUp(username, oldLevel, newLevel, rewards) {
    try {
      const io = this.getSocketIOIfAvailable('emit');
      if (!io) {
        this.api.log('⚠️ Socket.IO not available, cannot emit level-up event', 'warn');
        return;
      }
      
      const profile = this.db.getViewerProfile(username);
      
      io.emit('viewer-xp:level-up', {
        username,
        oldLevel,
        newLevel,
        rewards
      });

      // Emit IFTTT event for level up
      this.emitIFTTTEvent('viewer-xp:level-up', {
        username,
        oldLevel,
        newLevel,
        totalXP: profile ? profile.total_xp_earned : 0,
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
    } catch (error) {
      this.api.log(`Error emitting level up: ${error.message}`, 'error');
    }
  }

  /**
   * Emit IFTTT event
   * Helper method to safely emit events to the IFTTT engine
   */
  emitIFTTTEvent(eventType, eventData) {
    try {
      // Get IFTTT engine from the plugin loader
      const iftttEngine = this.api.pluginLoader?.iftttEngine;
      
      if (!iftttEngine) {
        this.api.log('IFTTT engine not available, skipping event emission', 'debug');
        return;
      }

      if (typeof iftttEngine.processEvent !== 'function') {
        this.api.log('IFTTT engine has no processEvent method, skipping event emission', 'debug');
        return;
      }

      // Emit event to IFTTT engine
      Promise.resolve(iftttEngine.processEvent(eventType, eventData)).catch(error => {
        this.api.log(`Error processing IFTTT event ${eventType}: ${error.message}`, 'error');
      });

      this.api.log(`📡 Emitted IFTTT event: ${eventType}`, 'debug');
    } catch (error) {
      this.api.log(`Error emitting IFTTT event ${eventType}: ${error.message}`, 'error');
    }
  }

  /**
   * ==========================================
   * NEW: Rate Limiting & Anti-Spam Methods
   * ==========================================
   */

  /**
   * Check if user is rate limited for a specific action
   * @param {string} username - Username
   * @param {string} actionType - Action type
   * @returns {boolean} True if rate limited
   */
  isRateLimited(username, actionType) {
    try {
      const rateLimits = this.db.getExtendedConfig('rate_limits', { enabled: false });
      
      if (!rateLimits.enabled) {
        return false;
      }

      const now = Date.now();
      const userKey = `${username}:${actionType}`;
      
      // Check per-user-per-event rate limits
      if (rateLimits.per_user_per_event && rateLimits.per_user_per_event[actionType]) {
        const limit = rateLimits.per_user_per_event[actionType];

        const lastEvent = this.rateLimitTracker.get(userKey);
        
        if (lastEvent) {
          const elapsed = now - lastEvent.timestamp;
          const interval = limit.interval * 1000; // Convert to ms

          if (elapsed < interval) {
            // Check if exceeded max per interval
            if (lastEvent.count >= (limit.max_per_interval || 1)) {
              this.api.log(`Rate limit exceeded for ${username} on ${actionType}`, 'debug');
              return true;
            }
            
            // Increment count within interval (keep original timestamp)
            lastEvent.count++;
            return false;
          }
        }

        // Update tracker (start new interval)
        this.rateLimitTracker.set(userKey, { timestamp: now, count: 1 });
      }

      // Check global XP limits
      if (rateLimits.global_limits) {
        const globalKey = `${username}:global`;
        
        const userData = this.globalXPTracker.get(globalKey) || { 
          xp_5min: 0, 
          xp_1hour: 0, 
          timestamp_5min: now, 
          timestamp_1hour: now 
        };

        // Reset 5-minute window if expired
        if (now - userData.timestamp_5min > 5 * 60 * 1000) {
          userData.xp_5min = 0;
          userData.timestamp_5min = now;
        }

        // Reset 1-hour window if expired
        if (now - userData.timestamp_1hour > 60 * 60 * 1000) {
          userData.xp_1hour = 0;
          userData.timestamp_1hour = now;
        }

        // Check limits
        if (rateLimits.global_limits.max_xp_per_5min && 
            userData.xp_5min >= rateLimits.global_limits.max_xp_per_5min) {
          this.api.log(`Global 5min XP limit exceeded for ${username}`, 'debug');
          return true;
        }

        if (rateLimits.global_limits.max_xp_per_hour && 
            userData.xp_1hour >= rateLimits.global_limits.max_xp_per_hour) {
          this.api.log(`Global 1hour XP limit exceeded for ${username}`, 'debug');
          return true;
        }

        this.globalXPTracker.set(globalKey, userData);
      }

      return false;
    } catch (error) {
      this.api.log(`Error checking rate limit: ${error.message}`, 'error');
      return false; // Fail open
    }
  }

  /**
   * Track XP award for global rate limiting
   * @param {string} username - Username
   * @param {number} xpAmount - XP amount awarded
   */
  trackGlobalXP(username, xpAmount) {
    try {
      const now = Date.now();
      const globalKey = `${username}:global`;
      const userData = this.globalXPTracker.get(globalKey) || { 
        xp_5min: 0, 
        xp_1hour: 0, 
        timestamp_5min: now, 
        timestamp_1hour: now 
      };

      userData.xp_5min += xpAmount;
      userData.xp_1hour += xpAmount;

      this.globalXPTracker.set(globalKey, userData);
    } catch (error) {
      this.api.log(`Error tracking global XP: ${error.message}`, 'error');
    }
  }

  /**
   * Apply event cap to XP amount
   * @param {string} actionType - Action type
   * @param {number} xpAmount - Original XP amount
   * @returns {number} Capped XP amount
   */
  applyEventCap(actionType, xpAmount) {
    try {
      const eventCaps = this.db.getExtendedConfig('event_caps', {});
      
      if (eventCaps[actionType] && xpAmount > eventCaps[actionType]) {
        this.api.log(`Capping XP for ${actionType}: ${xpAmount} -> ${eventCaps[actionType]}`, 'debug');
        return eventCaps[actionType];
      }

      return xpAmount;
    } catch (error) {
      this.api.log(`Error applying event cap: ${error.message}`, 'error');
      return xpAmount;
    }
  }

  /**
   * Apply multipliers to XP amount
   * @param {string} username - Username
   * @param {number} xpAmount - Base XP amount
   * @param {string} actionType - Action type
   * @returns {number} Multiplied XP amount
   */
  applyMultipliers(username, xpAmount, actionType) {
    try {
      const multipliers = this.db.getExtendedConfig('xp_multipliers', { global: 1.0 });
      const streakConfig = this.db.getExtendedConfig('streaks', { enabled: false });

      let finalXP = xpAmount * (multipliers.global || 1.0);

      // Apply streak multiplier
      if (streakConfig.enabled) {
        const profile = this.db.getViewerProfile(username);
        if (profile && profile.streak_days > 1) {
          const streakMultiplier = Math.min(
            1 + (profile.streak_days - 1) * (streakConfig.bonus_multiplier - 1),
            streakConfig.max_multiplier || 2.0
          );
          finalXP *= streakMultiplier;
          this.api.log(`Applied streak multiplier ${streakMultiplier.toFixed(2)}x for ${username}`, 'debug');
        }
      }

      return Math.floor(finalXP);
    } catch (error) {
      this.api.log(`Error applying multipliers: ${error.message}`, 'error');
      return xpAmount;
    }
  }

  /**
   * ==========================================
   * TikTok Event Handlers (Enhanced)
   * ==========================================
   */

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
    
    // Track previous coin total and rank for milestone detection
    let previousCoins = 0;
    let previousRank = 0;
    let previousAllStats = null;
    
    try {
      const mainDb = this.api.getDatabase();
      const userId = data.userId || username;
      const existingStats = mainDb.getUserStatistics(userId);
      if (existingStats) {
        previousCoins = existingStats.total_coins_sent || 0;
        
        // Get previous rank - cache allStats for reuse
        previousAllStats = mainDb.getAllUserStatistics(1000, 0);
        previousRank = previousAllStats.findIndex(s => s.user_id === userId) + 1;
      }
    } catch (error) {
      this.api.log(`Error fetching previous coin stats: ${error.message}`, 'debug');
    }
    
    // Update shared user statistics (cross-plugin)
    try {
      const mainDb = this.api.getDatabase();
      const userId = data.userId || username;
      const uniqueId = data.uniqueId || '';
      const profilePictureUrl = data.profilePictureUrl || '';
      mainDb.addCoinsToUserStats(userId, username, uniqueId, profilePictureUrl, coins);
      
      // Get updated stats for milestone checks
      const updatedStats = mainDb.getUserStatistics(userId);
      if (updatedStats) {
        const newTotalCoins = updatedStats.total_coins_sent || 0;
        
        // Fetch updated rankings once for both milestone and top spender checks
        const updatedAllStats = mainDb.getAllUserStatistics(1000, 0);
        const currentRank = updatedAllStats.findIndex(s => s.user_id === userId) + 1;
        
        // Check for currency milestones (100, 1000, 10000, 100000)
        const milestones = [100, 1000, 10000, 100000];
        for (const milestone of milestones) {
          if (previousCoins < milestone && newTotalCoins >= milestone) {
            // Emit currency milestone event
            this.emitIFTTTEvent('viewer-xp:currency-milestone', {
              username,
              coins: newTotalCoins,
              milestone,
              rank: currentRank
            });
            
            this.api.log(`💰 [viewer-xp] ${username} reached ${milestone} coin milestone!`, 'info');
          }
        }
        
        // Check for top spender status (top 3)
        if (currentRank > 0 && currentRank <= 3 && (previousRank === 0 || previousRank > 3)) {
          // Emit top spender event
          this.emitIFTTTEvent('viewer-xp:top-spender', {
            username,
            coins: newTotalCoins,
            rank: currentRank,
            previousRank: previousRank || this.UNRANKED_FALLBACK
          });
          
          this.api.log(`💎 [viewer-xp] ${username} became a top ${currentRank} spender!`, 'info');
        }
      }
    } catch (error) {
      this.api.log(`Error updating shared user statistics: ${error.message}`, 'error');
    }
    
    // Update gifter leaderboard (integrated from standalone leaderboard plugin)
    const userId = data.userId || data.user?.userId;
    const nickname = data.nickname || data.username || 'Unknown User';
    const uniqueId = data.uniqueId || '';
    const profilePictureUrl = data.profilePictureUrl || '';
    const diamondCount = data.diamondCount || data.coins || 0;
    
    if (userId && diamondCount > 0) {
      // Update session data (in-memory)
      this.updateGifterSessionData(userId, nickname, uniqueId, profilePictureUrl, diamondCount);
      
      // Update all-time data (persistent, with debouncing)
      this.db.addGifterCoins(userId, nickname, uniqueId, profilePictureUrl, diamondCount);
      
      // Emit real-time update to connected clients
      this.emitGifterLeaderboardUpdate();
      
      this.api.log(`Gift tracked for leaderboard: ${nickname} sent ${diamondCount} coins`, 'debug');
    }
    
    // Determine gift tier based on coin value
    let actionType = 'gift_tier1';
    if (coins >= 5000) {
      actionType = 'gift_tier8';
    } else if (coins >= 1000) {
      actionType = 'gift_tier7';
    } else if (coins >= 300) {
      actionType = 'gift_tier6';
    } else if (coins >= 100) {
      actionType = 'gift_tier5';
    } else if (coins >= 30) {
      actionType = 'gift_tier4';
    } else if (coins >= 11) {
      actionType = 'gift_tier3';
    } else if (coins >= 2) {
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
        const bonusAmount = this.db.getXPAction('daily_bonus').xp_amount;
        this.emitXPUpdate(username, bonusAmount, 'daily_bonus');
        
        // Emit IFTTT event for daily bonus
        const profile = this.db.getViewerProfile(username);
        this.emitIFTTTEvent('viewer-xp:daily-bonus', {
          username,
          bonusAmount,
          streakDays: profile.streak_days || 0,
          totalXP: profile.total_xp_earned
        });

        // Check for streak milestones (7, 30, 100 days)
        const streakDays = profile.streak_days || 0;
        const milestones = [7, 30, 100];
        if (milestones.includes(streakDays)) {
          this.emitIFTTTEvent('viewer-xp:streak-milestone', {
            username,
            streakDays,
            milestone: streakDays,
            totalXP: profile.total_xp_earned
          });
        }
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
   * Handle stream disconnect - clear watch timers to stop offline XP accumulation
   */
  handleStreamDisconnect() {
    const activeTimerCount = this.watchTimers.size;
    this.watchTimers.clear();
    this.api.log(`🔴 Stream disconnected: cleared ${activeTimerCount} active watch timers. No more watch-time XP until next stream.`, 'info');
  }

  /**
   * Start watch time tracking interval
   */
  startWatchTimeTracking() {
    const intervalMinutes = this.db.getSetting('watchTimeInterval', 1);
    
    this.watchTimeInterval = setInterval(() => {
      // Do NOT award watch time XP when the stream is offline
      try {
        const tiktok = this.api.tiktok;
        if (tiktok && typeof tiktok.isActive === 'function' && !tiktok.isActive()) {
          return; // Stream offline, skip XP award cycle entirely
        }
      } catch (error) {
        this.api.log(`Error checking TikTok connection status: ${error.message}`, 'debug');
      }

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
   * Start periodic cleanup of high-volume XP detail logs.
   * Aggregated viewer profiles, levels, XP totals, and coin balances are kept.
   */
  startRetentionCleanup() {
    if (
      !this.db ||
      typeof this.db.getDetailLogRetentionConfig !== 'function' ||
      typeof this.db.cleanupDetailLogs !== 'function'
    ) {
      this.api.log('Viewer XP detail log retention unavailable for this database adapter', 'debug');
      return;
    }

    const config = this.db.getDetailLogRetentionConfig();
    if (!config.enabled) {
      this.api.log('Viewer XP detail log retention disabled', 'debug');
      return;
    }

    const runCleanup = () => {
      this.runRetentionCleanup().catch((error) => {
        this.api.log(`Viewer XP detail log retention failed: ${error.message}`, 'error');
      });
    };

    this.retentionCleanupTimer = setTimeout(runCleanup, 30000);
    if (typeof this.retentionCleanupTimer.unref === 'function') {
      this.retentionCleanupTimer.unref();
    }

    this.retentionCleanupInterval = setInterval(
      runCleanup,
      config.cleanup_interval_hours * 60 * 60 * 1000
    );
    if (typeof this.retentionCleanupInterval.unref === 'function') {
      this.retentionCleanupInterval.unref();
    }
  }

  async runRetentionCleanup() {
    if (
      !this.db ||
      typeof this.db.getDetailLogRetentionConfig !== 'function' ||
      typeof this.db.cleanupDetailLogs !== 'function'
    ) {
      return { skipped: true, reason: 'unavailable' };
    }

    if (this.retentionCleanupRunning) {
      return { skipped: true, reason: 'already_running' };
    }

    this.retentionCleanupRunning = true;
    const config = this.db.getDetailLogRetentionConfig();
    const deadline = Date.now() + config.cleanup_max_duration_ms;
    const totals = {
      xp_transactions: 0,
      viewer_xp_events: 0,
      coin_transactions: 0
    };
    let batches = 0;
    let hasMore = false;

    try {
      if (!config.enabled) {
        return { skipped: true, reason: 'disabled', totals, batches, hasMore: false };
      }

      do {
        const result = this.db.cleanupDetailLogs({ batchSize: config.cleanup_batch_size });
        if (result.skipped) {
          return { ...result, totals, batches, hasMore: false };
        }

        batches++;
        for (const key of Object.keys(totals)) {
          totals[key] += result.deleted[key] || 0;
        }
        hasMore = result.hasMore;

        if (!hasMore || Date.now() >= deadline) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 25));
      } while (hasMore);

      const totalDeleted = Object.values(totals).reduce((sum, value) => sum + value, 0);
      if (totalDeleted > 0) {
        this.api.log(
          `Viewer XP detail log retention removed ${totalDeleted} expired rows ` +
          `(xp: ${totals.xp_transactions}, events: ${totals.viewer_xp_events}, coins: ${totals.coin_transactions})`,
          'info'
        );
      }

      return { skipped: false, totals, batches, hasMore, totalDeleted };
    } finally {
      this.retentionCleanupRunning = false;
    }
  }

  /**
   * Gifter Leaderboard Helper Methods
   * Integrated from standalone leaderboard plugin
   */

  /**
   * Update session data for gifter leaderboard (in-memory)
   */
  updateGifterSessionData(userId, nickname, uniqueId, profilePictureUrl, coins) {
    const existing = this.gifterSessionData.get(userId);
    
    if (existing) {
      existing.coins += coins;
      if (nickname) existing.nickname = nickname;
      if (uniqueId) existing.uniqueId = uniqueId;
      if (profilePictureUrl) existing.profilePictureUrl = profilePictureUrl;
    } else {
      this.gifterSessionData.set(userId, {
        userId,
        nickname: nickname || 'Unknown',
        uniqueId: uniqueId || '',
        profilePictureUrl: profilePictureUrl || '',
        coins
      });
    }
  }

  /**
   * Get gifter session leaderboard sorted by coins
   */
  getGifterSessionLeaderboard(limit = 10) {
    const entries = Array.from(this.gifterSessionData.values());
    entries.sort((a, b) => b.coins - a.coins);
    return entries.slice(0, limit).map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
  }

  /**
   * Reset gifter session data
   */
  resetGifterSession() {
    this.gifterSessionData.clear();
    this.db.resetGifterSession();
    this.api.log('Gifter session reset complete', 'info');
    
    this.api.emit('leaderboard:session-reset', {
      timestamp: new Date().toISOString()
    });
    
    this.emitGifterLeaderboardUpdate();
  }

  /**
   * Emit gifter leaderboard update to all connected clients
   */
  emitGifterLeaderboardUpdate() {
    const sessionBoard = this.getGifterSessionLeaderboard(10);
    const alltimeBoard = this.db.getTopGifters(10, 0);
    
    this.api.emit('leaderboard:update', {
      session: {
        data: sessionBoard,
        startTime: this.db.getGifterSessionStartTime()
      },
      alltime: {
        data: alltimeBoard
      }
    });
  }

  /**
   * Generate mock data for gifter leaderboard testing/preview
   */
  generateGifterMockData(type) {
    const names = [
      { nickname: 'GamingLegend', uniqueId: 'gaming_legend', coins: 15000 },
      { nickname: 'StreamQueen', uniqueId: 'stream_queen', coins: 12500 },
      { nickname: 'CoolViewer99', uniqueId: 'cool_viewer_99', coins: 10800 },
      { nickname: 'TikTokFan', uniqueId: 'tiktok_fan', coins: 8500 },
      { nickname: 'SuperSupporter', uniqueId: 'super_supporter', coins: 7200 },
      { nickname: 'NightOwl', uniqueId: 'night_owl', coins: 6100 },
      { nickname: 'DailyWatcher', uniqueId: 'daily_watcher', coins: 5500 },
      { nickname: 'GiftMaster', uniqueId: 'gift_master', coins: 4800 },
      { nickname: 'TopFan', uniqueId: 'top_fan', coins: 3900 },
      { nickname: 'LoyalFollower', uniqueId: 'loyal_follower', coins: 2700 }
    ];

    const profilePics = [
      'https://picsum.photos/100/100?random=1',
      'https://picsum.photos/100/100?random=2',
      'https://picsum.photos/100/100?random=3',
      'https://picsum.photos/100/100?random=4',
      'https://picsum.photos/100/100?random=5'
    ];

    return names.map((user, index) => {
      const baseData = {
        rank: index + 1,
        user_id: `mock_user_${index + 1}`,
        userId: `mock_user_${index + 1}`,
        nickname: user.nickname,
        unique_id: user.uniqueId,
        uniqueId: user.uniqueId,
        profile_picture_url: profilePics[index % profilePics.length],
        profilePictureUrl: profilePics[index % profilePics.length]
      };

      if (type === 'session') {
        return {
          ...baseData,
          coins: user.coins
        };
      } else {
        return {
          ...baseData,
          total_coins: user.coins * 3,
          totalCoins: user.coins * 3
        };
      }
    });
  }

  /**
   * Cleanup on destroy
   */
  async destroy() {
    this.api.log('Shutting down Viewer XP System...', 'info');

    // Unregister GCCE commands
    try {
      const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
      if (gccePlugin?.instance) {
        gccePlugin.instance.unregisterCommandsForPlugin('viewer-xp');
        this.api.log('💬 [viewer-xp] Unregistered GCCE commands', 'debug');
      }
    } catch (error) {
      this.api.log(`❌ [viewer-xp] Error unregistering GCCE commands: ${error.message}`, 'error');
    }

    // Stop watch time tracking
    if (this.watchTimeInterval) {
      clearInterval(this.watchTimeInterval);
      this.watchTimeInterval = null;
    }

    if (this.retentionCleanupTimer) {
      clearTimeout(this.retentionCleanupTimer);
      this.retentionCleanupTimer = null;
    }

    if (this.retentionCleanupInterval) {
      clearInterval(this.retentionCleanupInterval);
      this.retentionCleanupInterval = null;
    }

    // Cleanup database
    this.db.destroy();

    this.api.log('Viewer XP System shut down', 'info');
  }
}

module.exports = ViewerXPPlugin;
