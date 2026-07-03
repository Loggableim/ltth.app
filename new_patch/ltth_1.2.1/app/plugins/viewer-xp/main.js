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
    
    // Currency system constants
    this.UNRANKED_FALLBACK = 999; // Fallback rank for users with no previous ranking
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

    this.api.registerRoute('GET', '/overlay/viewer-xp/user-profile', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlays', 'user-profile.html'));
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

    this.api.log('WebSocket handlers registered', 'debug');
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

      this.api.log('✅ [viewer-xp] IFTTT triggers and actions registered', 'info');
      this.api.log('   - viewer-xp:xp-gained (trigger)', 'debug');
      this.api.log('   - viewer-xp:level-up (trigger)', 'debug');
      this.api.log('   - viewer-xp:daily-bonus (trigger)', 'debug');
      this.api.log('   - viewer-xp:streak-milestone (trigger)', 'debug');
      this.api.log('   - viewer-xp:currency-milestone (trigger)', 'debug');
      this.api.log('   - viewer-xp:top-spender (trigger)', 'debug');
      this.api.log('   - viewer-xp:award-xp (action)', 'debug');

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

      // Get currency (coins) from shared user statistics
      let coins = 0;
      try {
        const mainDb = this.api.getDatabase();
        // Try to find user by username in user_statistics
        const userStats = mainDb.db.prepare(`
          SELECT total_coins_sent FROM user_statistics 
          WHERE username = ? AND streamer_id = ?
        `).get(targetUsername, mainDb.streamerId || 'default');
        
        if (userStats) {
          coins = userStats.total_coins_sent || 0;
        }
      } catch (error) {
        this.api.log(`Error fetching coins for ${targetUsername}: ${error.message}`, 'debug');
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
    try {
      const io = this.api.getSocketIO();
      const profile = this.db.getViewerProfile(username);
      
      io.emit('viewer-xp:update', {
        username,
        amount,
        actionType,
        profile
      });

      // Emit IFTTT event for XP gained
      // Handle case where profile might not be created yet due to batching
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
          totalXP: amount, // At least the amount just earned
          level: 1 // Default level
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
      const io = this.api.getSocketIO();
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
        totalXP: profile.total_xp_earned,
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

      // Emit event to IFTTT engine
      iftttEngine.processEvent(eventType, eventData).catch(error => {
        this.api.log(`Error processing IFTTT event ${eventType}: ${error.message}`, 'error');
      });

      this.api.log(`📡 Emitted IFTTT event: ${eventType}`, 'debug');
    } catch (error) {
      this.api.log(`Error emitting IFTTT event ${eventType}: ${error.message}`, 'error');
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
    }

    // Cleanup database
    this.db.destroy();

    this.api.log('Viewer XP System shut down', 'info');
  }
}

module.exports = ViewerXPPlugin;
