/**
 * CoinBattle Plugin - Main Entry Point
 * Live battle game where viewers compete by sending TikTok gifts
 */

const CoinBattleDatabase = require('./backend/database');
const CoinBattleEngine = require('./engine/game-engine');
const PerformanceManager = require('./engine/performance-manager');
const KingOfTheHillMode = require('./engine/koth-mode');
const PyramidMode = require('./engine/pyramid-mode');
const FriendChallengeSystem = require('./engine/friend-challenges');
const PlayerAvatarSystem = require('./backend/player-avatars');
const OverlayTemplateManager = require('./overlay/template-manager');
const TeamNamesManager = require('./backend/team-names');
const LikesPointsSystem = require('./backend/likes-points');
const path = require('path');

class CoinBattlePlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.db = null;
    this.engine = null;
    this.performanceManager = null;
    this.kothMode = null;
    this.pyramidMode = null;
    this.friendChallenges = null;
    this.avatarSystem = null;
    this.templateManager = null;
    this.teamNamesManager = null;
    this.likesPointsSystem = null;
    this.pyramidXPUnsubscribe = null;
    this.matchEndedUnsubscribe = null;
    this.enableLegacySocketLoopbackHandlers = false;
    this.logger = {
      info: (msg) => this.api.log(msg, 'info'),
      error: (msg) => this.api.log(msg, 'error'),
      warn: (msg) => this.api.log(msg, 'warn'),
      debug: (msg) => this.api.log(msg, 'debug')
    };
  }

  async init() {
    this.api.log('Initializing CoinBattle Plugin...', 'info');

    try {
      // Initialize database
      const mainDb = this.api.getDatabase();
      this.db = new CoinBattleDatabase(mainDb, this.logger);
      this.db.initializeTables();

      // Get raw database instance for subsystems that need direct access
      const rawDb = this.db.getRawDb();

      // Initialize game engine
      this.engine = new CoinBattleEngine(this.db, this.io, this.logger);

      // Initialize performance manager
      this.performanceManager = new PerformanceManager(rawDb, this.io, this.logger);
      this.api.log('✅ Performance Manager initialized', 'info');

      // Initialize King of the Hill mode
      this.kothMode = new KingOfTheHillMode(this.db, this.io, this.logger);
      this.api.log('✅ King of the Hill Mode initialized', 'info');

      // Initialize Pyramid Mode
      this.pyramidMode = new PyramidMode(rawDb, this.io, this.logger);
      this.pyramidMode.initializeTables();
      this.api.log('✅ Pyramid Mode initialized', 'info');

      // Initialize Friend Challenge system
      this.friendChallenges = new FriendChallengeSystem(this.db, this.io, this.engine, this.logger);
      
      // Try to register with GCCE if available
      this.registerWithGCCE();
      this.api.log('✅ Friend Challenges initialized', 'info');

      // Initialize Avatar system
      this.avatarSystem = new PlayerAvatarSystem(rawDb, this.logger);
      this.avatarSystem.initializeTables();
      this.api.log('✅ Player Avatar System initialized', 'info');

      // Initialize Template Manager
      this.templateManager = new OverlayTemplateManager(this.logger);
      this.api.log('✅ Overlay Template Manager initialized', 'info');

      // Initialize Team Names Manager
      this.teamNamesManager = new TeamNamesManager(rawDb, this.logger);
      this.teamNamesManager.initializeTable();
      this.api.log('✅ Team Names Manager initialized', 'info');

      // Extend match state with team names for HUD hydration
      this.engine.stateAugmenter = this.augmentMatchStateWithTeamNames.bind(this);

      // Initialize Likes Points System
      this.likesPointsSystem = new LikesPointsSystem(rawDb, this.logger);
      this.likesPointsSystem.initializeTable();
      this.api.log('✅ Likes Points System initialized', 'info');

      // Load configuration
      const config = this.loadConfiguration();
      this.engine.loadConfig(config);

      // Set post-match config for pyramid mode
      if (this.pyramidMode && config.postMatch) {
        this.pyramidMode.setPostMatchConfig(config.postMatch);
      }

      this.registerInternalEventHandlers();

      // Register routes
      this.registerRoutes();

      // Register socket events
      this.registerSocketEvents();

      // Register TikTok events
      this.registerTikTokEvents();

      this.api.log('✅ CoinBattle Plugin initialized successfully with all features', 'info');
    } catch (error) {
      this.api.log(`Failed to initialize CoinBattle: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Register with GCCE if available
   */
  registerWithGCCE() {
    try {
      // Listen for GCCE ready event
      this.api.on('gcce:ready', () => {
        this.logger.info('GCCE detected, registering friend challenge commands');
        // Get GCCE registry from the plugin system
        // This would need to be exposed by GCCE plugin
        const gccePlugin = this.api.getPlugin?.('gcce');
        if (gccePlugin && gccePlugin.registry) {
          this.friendChallenges.registerGCCECommands(gccePlugin.registry);
          this.logger.info('✅ Friend Challenges registered with GCCE');
        }
      });
    } catch (error) {
      this.logger.warn(`GCCE integration not available: ${error.message}`);
    }
  }

  /**
   * Augment match state with persisted team names for overlays
   * @param {object} state
   * @returns {object}
   */
  augmentMatchStateWithTeamNames(state) {
    const matchId = state.match ? state.match.id : null;
    const fallbackTeamNames = state.teamNames || {
      red: { name: 'Team Rot', imageUrl: null },
      blue: { name: 'Team Blau', imageUrl: null }
    };
    const teamNames = this.teamNamesManager
      ? this.teamNamesManager.getTeamNames(matchId)
      : fallbackTeamNames;
    return {
      ...state,
      teamNames
    };
  }

  /**
   * Load plugin configuration from database
   */
  loadConfiguration() {
    const defaultConfig = {
      matchDuration: 300,
      autoStart: false,
      autoReset: true,
      autoExtension: true,
      extensionThreshold: 15,
      extensionDuration: 60,
      mode: 'solo',
      teamAssignment: 'random',
      enableMultipliers: true,
      enableOfflineSimulation: false,
      theme: 'dark',
      skin: 'gold',
      layout: 'fullscreen',
      language: 'de',
      font: 'default',
      fontSize: 16,
      showAvatars: true,
      showBadges: true,
      animationSpeed: 'normal',
      toasterMode: false,
      // Post-match leaderboard settings
      postMatch: {
        showLeaderboard: true,
        leaderboardTypes: ['lifetime'], // Options: 'weekly', 'season', 'lifetime'
        leaderboardDuration: 15, // seconds per leaderboard
        showWinnerCredits: true,
        winnerCreditsDuration: 10, // seconds
        showXPAwards: true
      }
    };

    const savedConfig = this.api.getConfig('coinbattle_config') || {};
    return {
      ...defaultConfig,
      ...savedConfig,
      postMatch: {
        ...defaultConfig.postMatch,
        ...(savedConfig.postMatch || {})
      }
    };
  }

  /**
   * Save plugin configuration
   */
  saveConfiguration(config) {
    const currentConfig = this.loadConfiguration();
    const nextConfig = {
      ...currentConfig,
      ...(config || {}),
      postMatch: {
        ...currentConfig.postMatch,
        ...((config && config.postMatch) || {})
      }
    };

    this.api.setConfig('coinbattle_config', nextConfig);
    this.engine.loadConfig(nextConfig);
    
    // Update post-match config for pyramid mode
    if (this.pyramidMode && nextConfig.postMatch) {
      this.pyramidMode.setPostMatchConfig(nextConfig.postMatch);
    }

    return nextConfig;
  }

  /**
   * Clamp numeric route input to a safe range.
   */
  parseBoundedNumber(value, defaultValue, min, max, integer = true) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return defaultValue;
    }

    const normalized = integer ? Math.floor(parsed) : parsed;
    return Math.min(max, Math.max(min, normalized));
  }

  /**
   * Validate match mode input.
   */
  parseMatchMode(mode) {
    const allowedModes = new Set(['solo', 'team', '1v1', 'pyramid']);
    return allowedModes.has(mode) ? mode : null;
  }

  /**
   * Extract a stable TikTok event id for gift deduplication.
   */
  extractTikTokEventId(data = {}) {
    const directId = data.eventId || data.msgId || data.messageId || data.id ||
      data.event_id || data.msg_id;

    if (directId) {
      return String(directId);
    }

    const userId = data.userId || data.user_id || data.uniqueId || 'unknown';
    const giftId = data.giftId || data.gift_id || data.gift?.id || 'unknown';
    const repeatCount = data.repeatCount || data.repeat_count || 1;
    const timestamp = data.timestamp || data.createTime || data.createdAt ||
      data.eventTime || data.msgTime || Date.now();

    return `gift_${userId}_${giftId}_${repeatCount}_${timestamp}`;
  }

  /**
   * Register internal server-side integration callbacks.
   */
  registerInternalEventHandlers() {
    if (this.pyramidMode && typeof this.pyramidMode.onXPAwards === 'function') {
      this.pyramidXPUnsubscribe = this.pyramidMode.onXPAwards((data) => this.awardPyramidXP(data));
    }

    if (this.engine && typeof this.engine.onMatchEnded === 'function') {
      this.matchEndedUnsubscribe = this.engine.onMatchEnded((data) => {
        if (data.mode === 'pyramid' && this.pyramidMode && this.pyramidMode.active) {
          this.pyramidMode.endRound();
        }

        this.awardMatchXP(data);

        if (this.friendChallenges && data.winner?.winner_player_id) {
          this.friendChallenges.completeChallenge(data.matchId, data.winner.winner_player_id);
        }
      });
    }
  }

  /**
   * Award Pyramid XP through viewer-xp when available.
   */
  awardPyramidXP(data) {
    try {
      const { rewards } = data;
      if (!rewards || rewards.length === 0) return;

      const viewerXPPlugin = this.api.getPluginInstance && this.api.getPluginInstance('viewer-xp');
      if (viewerXPPlugin && viewerXPPlugin.db) {
        for (const reward of rewards) {
          viewerXPPlugin.db.addXP(
            reward.username,
            reward.xp,
            'pyramid_win',
            {
              place: reward.place,
              percentage: reward.percentage,
              points: reward.points,
              source: 'coinbattle-pyramid'
            }
          );
        }

        this.api.log(`🎮 Awarded XP to ${rewards.length} pyramid winners`, 'info');
      } else {
        this.api.log('Viewer XP plugin not available for pyramid rewards', 'warn');
      }
    } catch (error) {
      this.api.log(`Error awarding pyramid XP: ${error.message}`, 'error');
    }
  }

  /**
   * Award match XP through viewer-xp when available.
   */
  awardMatchXP(data) {
    try {
      const { winnersWithXP } = data;
      if (!winnersWithXP || winnersWithXP.length === 0) return;

      const viewerXPPlugin = this.api.getPluginInstance && this.api.getPluginInstance('viewer-xp');
      if (viewerXPPlugin && viewerXPPlugin.db) {
        for (const winner of winnersWithXP) {
          viewerXPPlugin.db.addXP(
            winner.uniqueId || winner.nickname,
            winner.xp,
            winner.reason,
            {
              placement: winner.placement,
              coins: winner.coins,
              team: winner.team,
              source: 'coinbattle-match'
            }
          );
        }

        this.api.log(`🏆 Awarded XP to ${winnersWithXP.length} match winners`, 'info');
      } else {
        this.api.log('Viewer XP plugin not available for match rewards', 'warn');
      }
    } catch (error) {
      this.api.log(`Error awarding match XP: ${error.message}`, 'error');
    }
  }

  /**
   * Register API routes with rate limiting and CSP headers
   */
  registerRoutes() {
    // Rate limiter configurations
    const strictLimiter = {
      windowMs: 60 * 1000, // 1 minute
      max: 10, // 10 requests per minute
      message: { success: false, error: 'Too many requests, please try again later.' }
    };

    const moderateLimiter = {
      windowMs: 60 * 1000,
      max: 30,
      message: { success: false, error: 'Rate limit exceeded.' }
    };

    const relaxedLimiter = {
      windowMs: 60 * 1000,
      max: 100,
      message: { success: false, error: 'Too many requests.' }
    };

    // Helper to create rate limiter middleware
    const createLimiter = (config) => {
      const requests = new Map();
      return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();
        
        if (!requests.has(key)) {
          requests.set(key, []);
        }
        
        const userRequests = requests.get(key);
        const recentRequests = userRequests.filter(time => now - time < config.windowMs);
        
        if (recentRequests.length >= config.max) {
          this.logger.warn(`Rate limit exceeded for ${key} on ${req.path}`);
          return res.status(429).json(config.message);
        }
        
        recentRequests.push(now);
        requests.set(key, recentRequests);
        
        // Cleanup old entries periodically (1% chance per request)
        if (Math.random() < 0.01) {
          for (const [k, v] of requests.entries()) {
            const filtered = v.filter(time => now - time < config.windowMs);
            if (filtered.length === 0) {
              requests.delete(k);
            } else {
              requests.set(k, filtered);
            }
          }
        }
        
        next();
      };
    };

    // CSP middleware for overlay and UI routes
    const cspMiddleware = (req, res, next) => {
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://cdn.socket.io; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' ws: wss:; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self';"
      );
      next();
    };

    // Helper to wrap handler with rate limiting
    const withRateLimit = (limiter, handler) => {
      return async (req, res) => {
        // Apply rate limiting logic inline
        const key = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();
        
        if (!limiter.requests) {
          limiter.requests = new Map();
        }
        
        if (!limiter.requests.has(key)) {
          limiter.requests.set(key, []);
        }
        
        const userRequests = limiter.requests.get(key);
        const recentRequests = userRequests.filter(time => now - time < limiter.windowMs);
        
        if (recentRequests.length >= limiter.max) {
          this.logger.warn(`Rate limit exceeded for ${key} on ${req.path}`);
          return res.status(429).json(limiter.message);
        }
        
        recentRequests.push(now);
        limiter.requests.set(key, recentRequests);
        
        // Execute the actual handler
        return handler(req, res);
      };
    };

    // Create rate limiters
    const strictLimit = strictLimiter;
    const moderateLimit = moderateLimiter;
    const relaxedLimit = relaxedLimiter;

    // Get current match state (relaxed - read-only)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/state', (req, res) => {
      try {
        const state = this.engine.getMatchState();
        res.json({ success: true, data: state });
      } catch (error) {
        this.api.log(`Error getting match state: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Start match (strict rate limiting - prevent spam)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/match/start', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { mode, duration } = req.body;
          const config = this.loadConfiguration();
          const matchMode = this.parseMatchMode(mode);
          const configuredMode = this.parseMatchMode(config.mode) || 'solo';
          const resolvedMode = matchMode || configuredMode;
          const matchDuration = this.parseBoundedNumber(duration, config.matchDuration, 10, 3600);

          if (resolvedMode === 'pyramid') {
            if (!this.pyramidMode) {
              throw new Error('Pyramid Battle is not available');
            }

            if (this.pyramidMode.active) {
              throw new Error('Pyramid round already active');
            }
          }

          const match = this.engine.startMatch(matchMode, matchDuration);
          let pyramid = null;

          if (match.mode === 'pyramid') {
            pyramid = this.pyramidMode.startRound(match.id, matchDuration);
            if (!pyramid.success) {
              throw new Error(pyramid.error || 'Failed to start Pyramid Battle');
            }
          }

          res.json({ success: true, data: pyramid ? { ...match, pyramid } : match });
        } catch (error) {
          this.api.log(`Error starting match: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // End match (strict rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/match/end', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const result = this.engine.endMatch();
          res.json({ success: true, data: result });
        } catch (error) {
          this.api.log(`Error ending match: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Pause match (strict rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/match/pause', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const success = this.engine.pauseMatch();
          res.json({ success });
        } catch (error) {
          this.api.log(`Error pausing match: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Resume match (strict rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/match/resume', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const success = this.engine.resumeMatch();
          res.json({ success });
        } catch (error) {
          this.api.log(`Error resuming match: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Extend match (strict rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/match/extend', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { seconds } = req.body;
          const extensionSeconds = this.parseBoundedNumber(seconds, 60, 1, 600);
          const success = this.engine.extendMatch(extensionSeconds);
          res.json({ success });
        } catch (error) {
          this.api.log(`Error extending match: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Activate multiplier (strict rate limiting - prevent coin inflation)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/multiplier/activate', 
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { multiplier, duration, activatedBy } = req.body;
          const safeMultiplier = this.parseBoundedNumber(multiplier, 2.0, 1.0, 10.0, false);
          const safeDuration = this.parseBoundedNumber(duration, 30, 1, 600);
          const success = this.engine.activateMultiplier(
            safeMultiplier,
            safeDuration,
          activatedBy
        );
        res.json({ success });
      } catch (error) {
        this.api.log(`Error activating multiplier: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    })
    );

    // Get lifetime leaderboard (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/leaderboard/lifetime', (req, res) => {
      try {
        const limit = this.parseBoundedNumber(req.query.limit, 10, 1, 100);
        const leaderboard = this.db.getLifetimeLeaderboard(limit);
        res.json({ success: true, data: leaderboard });
      } catch (error) {
        this.api.log(`Error getting lifetime leaderboard: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get weekly leaderboard (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/leaderboard/weekly', (req, res) => {
      try {
        const limit = this.parseBoundedNumber(req.query.limit, 10, 1, 100);
        const leaderboard = this.db.getWeeklyLeaderboard(limit);
        res.json({ success: true, data: leaderboard });
      } catch (error) {
        this.api.log(`Error getting weekly leaderboard: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get season leaderboard (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/leaderboard/season', (req, res) => {
      try {
        const limit = this.parseBoundedNumber(req.query.limit, 10, 1, 100);
        const leaderboard = this.db.getSeasonLeaderboard(limit);
        const activeSeason = this.db.getActiveSeason();
        res.json({ success: true, data: leaderboard, season: activeSeason });
      } catch (error) {
        this.api.log(`Error getting season leaderboard: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get all players for management (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/players', (req, res) => {
      try {
        const limit = this.parseBoundedNumber(req.query.limit, 100, 1, 500);
        const offset = this.parseBoundedNumber(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
        const players = this.db.getAllPlayers(limit, offset);
        res.json({ success: true, data: players });
      } catch (error) {
        this.api.log(`Error getting players: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete player (strict rate limiting)
    this.api.registerRoute('DELETE', '/api/plugins/coinbattle/players/:userId',
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { userId } = req.params;
          const result = this.db.deletePlayer(userId);
          res.json(result);
        } catch (error) {
          this.api.log(`Error deleting player: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // ==================== SEASON MANAGEMENT ROUTES ====================

    // Get active season
    this.api.registerRoute('GET', '/api/plugins/coinbattle/season/active', (req, res) => {
      try {
        const season = this.db.getActiveSeason();
        res.json({ success: true, data: season });
      } catch (error) {
        this.api.log(`Error getting active season: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get all seasons
    this.api.registerRoute('GET', '/api/plugins/coinbattle/season/all', (req, res) => {
      try {
        const seasons = this.db.getAllSeasons();
        res.json({ success: true, data: seasons });
      } catch (error) {
        this.api.log(`Error getting seasons: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Create or update season (strict rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/season',
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { seasonName, startDate, endDate } = req.body;
          if (!seasonName || !Number.isFinite(Number(startDate)) || !Number.isFinite(Number(endDate))) {
            return res.status(400).json({ success: false, error: 'Invalid season data' });
          }
          const result = this.db.createOrUpdateSeason(seasonName, startDate, endDate);
          res.json(result);
        } catch (error) {
          this.api.log(`Error creating/updating season: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Delete season (strict rate limiting)
    this.api.registerRoute('DELETE', '/api/plugins/coinbattle/season/:seasonId',
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { seasonId } = req.params;
          const parsedSeasonId = this.parseBoundedNumber(seasonId, 0, 1, Number.MAX_SAFE_INTEGER);
          const result = this.db.deleteSeason(parsedSeasonId);
          res.json(result);
        } catch (error) {
          this.api.log(`Error deleting season: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Get match history (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/history', (req, res) => {
      try {
        const limit = this.parseBoundedNumber(req.query.limit, 20, 1, 500);
        const offset = this.parseBoundedNumber(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
        const history = this.db.getMatchHistory(limit, offset);
        res.json({ success: true, data: history });
      } catch (error) {
        this.api.log(`Error getting match history: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get player stats (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/player/:userId', (req, res) => {
      try {
        const { userId } = req.params;
        const stats = this.db.getPlayerStats(userId);
        const badges = stats ? this.db.getPlayerBadges(stats.id) : [];
        res.json({ success: true, data: { ...stats, badges } });
      } catch (error) {
        this.api.log(`Error getting player stats: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get configuration (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/config', (req, res) => {
      try {
        const config = this.loadConfiguration();
        res.json({ success: true, data: config });
      } catch (error) {
        this.api.log(`Error getting config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update configuration (moderate rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/config', 
      withRateLimit(moderateLimit, (req, res) => {
        try {
          const config = this.saveConfiguration(req.body);
          
          // Emit real-time config update to all overlays
          this.io.emit('coinbattle:config-updated', config);
          
          res.json({ success: true, data: config });
        } catch (error) {
          this.api.log(`Error updating config: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Start offline simulation (moderate rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/simulation/start', 
      withRateLimit(moderateLimit, (req, res) => {
        try {
          this.engine.startSimulation();
          res.json({ success: true });
        } catch (error) {
          this.api.log(`Error starting simulation: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Stop offline simulation (moderate rate limiting)
    this.api.registerRoute('POST', '/api/plugins/coinbattle/simulation/stop', 
      withRateLimit(moderateLimit, (req, res) => {
        try {
          this.engine.stopSimulation();
          res.json({ success: true });
        } catch (error) {
          this.api.log(`Error stopping simulation: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // ==================== KOTH MODE ROUTES ====================
    
    // Start KOTH mode
    this.api.registerRoute('POST', '/api/plugins/coinbattle/koth/start',
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { matchId } = req.body;
          this.kothMode.start(matchId);
          res.json({ success: true });
        } catch (error) {
          this.api.log(`Error starting KOTH mode: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Get KOTH stats
    this.api.registerRoute('GET', '/api/plugins/coinbattle/koth/stats', (req, res) => {
      try {
        const stats = this.kothMode.getStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        this.api.log(`Error getting KOTH stats: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== FRIEND CHALLENGES ROUTES ====================
    
    // Create challenge
    this.api.registerRoute('POST', '/api/plugins/coinbattle/challenge/create',
      withRateLimit(moderateLimit, async (req, res) => {
        try {
          const { challengerUserId, challengerNickname, targetUsername, stake } = req.body;
          if (!challengerUserId || !challengerNickname || !targetUsername) {
            return res.status(400).json({ success: false, error: 'Missing challenge participants' });
          }

          const result = await this.friendChallenges.createChallenge(
            challengerUserId,
            challengerNickname,
            targetUsername,
            stake
          );
          res.json(result);
        } catch (error) {
          this.api.log(`Error creating challenge: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Accept challenge
    this.api.registerRoute('POST', '/api/plugins/coinbattle/challenge/accept',
      withRateLimit(moderateLimit, async (req, res) => {
        try {
          const { challengeId, accepterUserId, accepterNickname } = req.body;
          if (!challengeId || !accepterUserId || !accepterNickname) {
            return res.status(400).json({ success: false, error: 'Missing challenge acceptance data' });
          }

          const result = await this.friendChallenges.acceptChallenge(
            challengeId,
            accepterUserId,
            accepterNickname
          );
          res.json(result);
        } catch (error) {
          this.api.log(`Error accepting challenge: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Decline challenge
    this.api.registerRoute('POST', '/api/plugins/coinbattle/challenge/decline',
      withRateLimit(moderateLimit, (req, res) => {
        try {
          const { challengeId } = req.body;
          if (!challengeId) {
            return res.status(400).json({ success: false, error: 'Missing challenge id' });
          }

          const success = this.friendChallenges.declineChallenge(challengeId);
          res.json({ success });
        } catch (error) {
          this.api.log(`Error declining challenge: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Get challenge stats
    this.api.registerRoute('GET', '/api/plugins/coinbattle/challenge/stats', (req, res) => {
      try {
        const stats = this.friendChallenges.getStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        this.api.log(`Error getting challenge stats: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== AVATAR ROUTES ====================
    
    // Get player avatar
    this.api.registerRoute('GET', '/api/plugins/coinbattle/avatar/:userId', (req, res) => {
      try {
        const avatar = this.avatarSystem.getPlayerAvatar(req.params.userId);
        res.json({ success: true, data: avatar });
      } catch (error) {
        this.api.log(`Error getting avatar: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Set player avatar
    this.api.registerRoute('POST', '/api/plugins/coinbattle/avatar/set',
      withRateLimit(moderateLimit, (req, res) => {
        try {
          const { userId, avatar, avatarSet } = req.body;
          const success = this.avatarSystem.setPlayerAvatar(userId, avatar, avatarSet);
          res.json({ success });
        } catch (error) {
          this.api.log(`Error setting avatar: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Set player skin
    this.api.registerRoute('POST', '/api/plugins/coinbattle/avatar/skin',
      withRateLimit(moderateLimit, (req, res) => {
        try {
          const { userId, skinId } = req.body;
          const result = this.avatarSystem.setPlayerSkin(userId, skinId);
          res.json(result);
        } catch (error) {
          this.api.log(`Error setting skin: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Get available avatars
    this.api.registerRoute('GET', '/api/plugins/coinbattle/avatar/available', (req, res) => {
      try {
        const avatars = this.avatarSystem.getAvailableAvatars();
        res.json({ success: true, data: avatars });
      } catch (error) {
        this.api.log(`Error getting available avatars: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get available skins
    this.api.registerRoute('GET', '/api/plugins/coinbattle/avatar/skins', (req, res) => {
      try {
        const skins = this.avatarSystem.getAvailableSkins();
        res.json({ success: true, data: skins });
      } catch (error) {
        this.api.log(`Error getting available skins: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== TEMPLATE ROUTES ====================
    
    // Get all templates
    this.api.registerRoute('GET', '/api/plugins/coinbattle/template/all', (req, res) => {
      try {
        const templates = this.templateManager.getAllTemplates();
        res.json({ success: true, data: templates });
      } catch (error) {
        this.api.log(`Error getting templates: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get template
    this.api.registerRoute('GET', '/api/plugins/coinbattle/template/:id', (req, res) => {
      try {
        const template = this.templateManager.getTemplate(req.params.id);
        res.json({ success: true, data: template });
      } catch (error) {
        this.api.log(`Error getting template: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Apply template
    this.api.registerRoute('POST', '/api/plugins/coinbattle/template/apply',
      withRateLimit(moderateLimit, (req, res) => {
        try {
          const { templateId } = req.body;
          const success = this.templateManager.applyTemplate(templateId);
          res.json({ success });
        } catch (error) {
          this.api.log(`Error applying template: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // ==================== PERFORMANCE ROUTES ====================
    
    // Get performance stats
    this.api.registerRoute('GET', '/api/plugins/coinbattle/performance/stats', (req, res) => {
      try {
        const stats = this.performanceManager.getStatistics();
        res.json({ success: true, data: stats });
      } catch (error) {
        this.api.log(`Error getting performance stats: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get health status
    this.api.registerRoute('GET', '/api/plugins/coinbattle/performance/health', (req, res) => {
      try {
        const health = this.performanceManager.getHealthStatus();
        res.json({ success: true, data: health });
      } catch (error) {
        this.api.log(`Error getting health status: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== TEAM NAMES ROUTES ====================
    
    // Get team names
    this.api.registerRoute('GET', '/api/plugins/coinbattle/team-names', (req, res) => {
      try {
        const { matchId } = req.query;
        const parsedMatchId = matchId
          ? this.parseBoundedNumber(matchId, null, 1, Number.MAX_SAFE_INTEGER)
          : null;
        const names = this.teamNamesManager.getTeamNames(parsedMatchId);
        res.json({ success: true, data: names });
      } catch (error) {
        this.api.log(`Error getting team names: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Set team name
    this.api.registerRoute('POST', '/api/plugins/coinbattle/team-names',
      withRateLimit(moderateLimit, (req, res) => {
        try {
          const { team, name, matchId, imageUrl } = req.body;
          const result = this.teamNamesManager.setTeamName(team, name, matchId, imageUrl);
          
          // Emit socket event to update all overlays
          if (result.success) {
            this.io.emit('coinbattle:team-names-updated', {
              team,
              name,
              imageUrl,
              matchId
            });
          }
          
          res.json(result);
        } catch (error) {
          this.api.log(`Error setting team name: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Reset team names
    this.api.registerRoute('DELETE', '/api/plugins/coinbattle/team-names',
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { matchId } = req.query;
          const parsedMatchId = matchId
            ? this.parseBoundedNumber(matchId, null, 1, Number.MAX_SAFE_INTEGER)
            : null;
          const result = this.teamNamesManager.resetTeamNames(parsedMatchId);
          res.json(result);
        } catch (error) {
          this.api.log(`Error resetting team names: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Get team name history
    this.api.registerRoute('GET', '/api/plugins/coinbattle/team-names/history', (req, res) => {
      try {
        const history = this.teamNamesManager.getTeamNameHistory();
        res.json({ success: true, data: history });
      } catch (error) {
        this.api.log(`Error getting team name history: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== LIKES POINTS ROUTES ====================
    
    // Get likes points configuration
    this.api.registerRoute('GET', '/api/plugins/coinbattle/likes-points/config', (req, res) => {
      try {
        const config = this.likesPointsSystem.getConfig();
        res.json({ success: true, data: config });
      } catch (error) {
        this.api.log(`Error getting likes points config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update likes points configuration
    this.api.registerRoute('POST', '/api/plugins/coinbattle/likes-points/config',
      withRateLimit(strictLimit, (req, res) => {
        try {
          const result = this.likesPointsSystem.updateConfig(req.body);
          res.json(result);
        } catch (error) {
          this.api.log(`Error updating likes points config: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Get match statistics for likes points
    this.api.registerRoute('GET', '/api/plugins/coinbattle/likes-points/stats/:matchId', (req, res) => {
      try {
        const { matchId } = req.params;
        const parsedMatchId = this.parseBoundedNumber(matchId, 0, 1, Number.MAX_SAFE_INTEGER);
        const stats = this.likesPointsSystem.getMatchStatistics(parsedMatchId);
        res.json({ success: true, data: stats });
      } catch (error) {
        this.api.log(`Error getting likes points stats: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get player points from likes/shares/etc
    this.api.registerRoute('GET', '/api/plugins/coinbattle/likes-points/player/:matchId/:userId', (req, res) => {
      try {
        const { matchId, userId } = req.params;
        const parsedMatchId = this.parseBoundedNumber(matchId, 0, 1, Number.MAX_SAFE_INTEGER);
        const points = this.likesPointsSystem.getPlayerPointsForMatch(parsedMatchId, userId);
        res.json({ success: true, data: points });
      } catch (error) {
        this.api.log(`Error getting player points: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== PYRAMID MODE ROUTES ====================

    // Get pyramid mode configuration
    this.api.registerRoute('GET', '/api/plugins/coinbattle/pyramid/config', (req, res) => {
      try {
        const config = this.pyramidMode.getConfig();
        res.json({ success: true, data: config });
      } catch (error) {
        this.api.log(`Error getting pyramid config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update pyramid mode configuration
    this.api.registerRoute('POST', '/api/plugins/coinbattle/pyramid/config',
      withRateLimit(strictLimit, (req, res) => {
        try {
          const result = this.pyramidMode.updateConfig(req.body);
          res.json(result);
        } catch (error) {
          this.api.log(`Error updating pyramid config: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Get pyramid mode state
    this.api.registerRoute('GET', '/api/plugins/coinbattle/pyramid/state', (req, res) => {
      try {
        const state = this.pyramidMode.getState();
        res.json({ success: true, data: state });
      } catch (error) {
        this.api.log(`Error getting pyramid state: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Start pyramid round
    this.api.registerRoute('POST', '/api/plugins/coinbattle/pyramid/start',
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { matchId } = req.body;
          const result = this.pyramidMode.startRound(matchId);
          res.json(result);
        } catch (error) {
          this.api.log(`Error starting pyramid round: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // End pyramid round
    this.api.registerRoute('POST', '/api/plugins/coinbattle/pyramid/end',
      withRateLimit(strictLimit, (req, res) => {
        try {
          const result = this.pyramidMode.endRound();
          res.json(result);
        } catch (error) {
          this.api.log(`Error ending pyramid round: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Get pyramid statistics
    this.api.registerRoute('GET', '/api/plugins/coinbattle/pyramid/stats', (req, res) => {
      try {
        const stats = this.pyramidMode.getStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        this.api.log(`Error getting pyramid stats: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get pyramid round history
    this.api.registerRoute('GET', '/api/plugins/coinbattle/pyramid/history', (req, res) => {
      try {
        const limit = this.parseBoundedNumber(req.query.limit, 20, 1, 500);
        const history = this.pyramidMode.getRoundHistory(limit);
        res.json({ success: true, data: history });
      } catch (error) {
        this.api.log(`Error getting pyramid history: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== OVERLAY LAYOUT ROUTES ====================
    
    // Get all overlay layouts
    this.api.registerRoute('GET', '/api/plugins/coinbattle/overlay/layouts', (req, res) => {
      try {
        const config = this.api.getConfig('coinbattle_overlay_layouts') || {};
        const layouts = Object.entries(config).map(([id, layout]) => ({ id, ...layout }));
        res.json({ success: true, data: layouts });
      } catch (error) {
        this.api.log(`Error getting overlay layouts: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Save overlay layout
    this.api.registerRoute('POST', '/api/plugins/coinbattle/overlay/layouts',
      withRateLimit(moderateLimit, (req, res) => {
        try {
          const layout = req.body;
          const layouts = this.api.getConfig('coinbattle_overlay_layouts') || {};
          layouts[layout.id] = layout;
          this.api.setConfig('coinbattle_overlay_layouts', layouts);
          res.json({ success: true });
        } catch (error) {
          this.api.log(`Error saving overlay layout: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Delete overlay layout
    this.api.registerRoute('DELETE', '/api/plugins/coinbattle/overlay/layouts/:id',
      withRateLimit(strictLimit, (req, res) => {
        try {
          const { id } = req.params;
          const layouts = this.api.getConfig('coinbattle_overlay_layouts') || {};
          delete layouts[id];
          this.api.setConfig('coinbattle_overlay_layouts', layouts);
          res.json({ success: true });
        } catch (error) {
          this.api.log(`Error deleting overlay layout: ${error.message}`, 'error');
          res.status(500).json({ success: false, error: error.message });
        }
      })
    );

    // Export match data (relaxed)
    this.api.registerRoute('GET', '/api/plugins/coinbattle/export/:matchId', (req, res) => {
      try {
        const { matchId } = req.params;
        const parsedMatchId = this.parseBoundedNumber(matchId, 0, 1, Number.MAX_SAFE_INTEGER);
        const rawDb = this.db.getRawDb();
        const match = rawDb.prepare('SELECT * FROM coinbattle_matches WHERE id = ?').get(parsedMatchId);
        const participants = this.db.getMatchLeaderboard(parsedMatchId, 100);
        const gifts = rawDb.prepare(`
          SELECT * FROM coinbattle_gift_events WHERE match_id = ?
        `).all(parsedMatchId);

        res.json({
          success: true,
          data: {
            match,
            participants,
            gifts
          }
        });
      } catch (error) {
        this.api.log(`Error exporting match: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Serve overlay with CSP headers
    this.api.registerRoute('GET', '/plugins/coinbattle/overlay', (req, res) => {
      // Apply CSP headers for XSS protection
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://cdn.socket.io; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' ws: wss:; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self';"
      );
      res.sendFile(path.join(__dirname, 'overlay', 'overlay.html'));
    });

    this.api.log('CoinBattle routes registered with rate limiting and CSP', 'info');
  }

  /**
   * Register socket events
   */
  registerSocketEvents() {
    // Client requests current state
    this.api.registerSocket('coinbattle:get-state', (socket) => {
      const state = this.engine.getMatchState();
      socket.emit('coinbattle:match-state', state);
    });

    // Client requests leaderboard update
    this.api.registerSocket('coinbattle:get-leaderboard', () => {
      this.engine.emitLeaderboard();
    });

    // Client requests current pyramid state (for overlay hydration)
    this.api.registerSocket('pyramid:get-state', (socket) => {
      if (!this.pyramidMode) {
        return;
      }

      const state = this.pyramidMode.getState();
      socket.emit('pyramid:state', state);
    });

    if (this.enableLegacySocketLoopbackHandlers) {
    // Server-side event: Pyramid XP awards - integrate with viewer-xp plugin
    // Note: Uses this.io.on() instead of registerSocket() because this event
    // is emitted server-side by pyramid-mode.js, not from client sockets
    this.io.on('pyramid:xp-awards', async (data) => {
      try {
        const { rewards } = data;
        if (!rewards || rewards.length === 0) return;

        // Check if viewer-xp plugin is enabled
        const viewerXPPlugin = this.api.getPluginInstance && this.api.getPluginInstance('viewer-xp');
        
        if (viewerXPPlugin && viewerXPPlugin.db) {
          // Award XP through viewer-xp plugin
          for (const reward of rewards) {
            viewerXPPlugin.db.addXP(
              reward.username,
              reward.xp,
              'pyramid_win',
              {
                place: reward.place,
                percentage: reward.percentage,
                points: reward.points,
                source: 'coinbattle-pyramid'
              }
            );
          }
          
          this.api.log(`🎮 Awarded XP to ${rewards.length} pyramid winners`, 'info');
        } else {
          this.api.log('⚠️ Viewer XP plugin not available for pyramid rewards', 'warn');
        }
      } catch (error) {
        this.api.log(`Error awarding pyramid XP: ${error.message}`, 'error');
      }
    });

    // Regular match XP awards - integrate with viewer-xp plugin
    this.io.on('coinbattle:match-ended', async (data) => {
      try {
        const { winnersWithXP } = data;
        if (!winnersWithXP || winnersWithXP.length === 0) return;

        // Check if viewer-xp plugin is enabled
        const viewerXPPlugin = this.api.getPluginInstance && this.api.getPluginInstance('viewer-xp');
        
        if (viewerXPPlugin && viewerXPPlugin.db) {
          // Award XP through viewer-xp plugin
          for (const winner of winnersWithXP) {
            viewerXPPlugin.db.addXP(
              winner.uniqueId || winner.nickname,
              winner.xp,
              winner.reason,
              {
                placement: winner.placement,
                coins: winner.coins,
                team: winner.team,
                source: 'coinbattle-match'
              }
            );
          }
          
          this.api.log(`🏆 Awarded XP to ${winnersWithXP.length} match winners`, 'info');
        } else {
          this.api.log('⚠️ Viewer XP plugin not available for match rewards', 'warn');
        }
      } catch (error) {
        this.api.log(`Error awarding match XP: ${error.message}`, 'error');
      }
    });

    }

    // Manual team assignment
    this.api.registerSocket('coinbattle:assign-team', (socket, data) => {
      try {
        const { userId, team } = data;
        if (this.engine.currentMatch) {
          // Update team in database
          const rawDb = this.db.getRawDb();
          rawDb.prepare(`
            UPDATE coinbattle_match_participants
            SET team = ?
            WHERE match_id = ? AND user_id = ?
          `).run(team, this.engine.currentMatch.id, userId);

          this.engine.emitLeaderboard();
          socket.emit('coinbattle:team-assigned', { userId, team });
        }
      } catch (error) {
        this.api.log(`Error assigning team: ${error.message}`, 'error');
      }
    });

    this.api.log('CoinBattle socket events registered', 'info');
  }

  /**
   * Register TikTok event handlers
   */
  registerTikTokEvents() {
    // Gift received
    this.api.registerTikTokEvent('gift', async (data) => {
      try {
        // FIX: Use data.coins (already calculated as diamondCount * repeatCount)
        // instead of data.diamondCount (which is just the raw diamond value per gift)
        const coins = data.coins || data.diamondCount || data.giftValue || 1;
        
        const giftData = {
          giftId: data.giftId,
          giftName: data.giftName,
          diamondCount: data.diamondCount || data.giftValue || 1,
          coins: coins,
          repeatCount: data.repeatCount || 1
        };

        const userData = {
          userId: data.userId,
          uniqueId: data.uniqueId,
          nickname: data.nickname,
          profilePictureUrl: data.profilePictureUrl
        };

        // Use performance manager for optimized gift processing
        await this.performanceManager.processGiftEvent(userData.userId, giftData);

        // Process gift through engine
        const eventId = this.extractTikTokEventId(data);
        const giftResult = this.engine.processGift(giftData, userData, eventId);

        if (!giftResult || giftResult.duplicate) {
          return;
        }

        // Update KOTH mode if active
        if (this.kothMode && this.kothMode.currentKing) {
          const leaderboard = this.engine.getLeaderboard(100);
          this.kothMode.updateLeaderboard(leaderboard);
        }

        // Process gift through Pyramid Mode if enabled or manually started.
        if (this.pyramidMode && (this.pyramidMode.config.enabled || this.pyramidMode.active)) {
          this.pyramidMode.processGift(userData, coins);
        }

        // Check for avatar achievement unlocks
        const playerStats = this.db.getPlayerStats(userData.userId);
        if (playerStats) {
          const unlockedSkins = this.avatarSystem.checkAchievements(userData.userId, playerStats);
          if (unlockedSkins.length > 0) {
            this.io.emit('coinbattle:skins-unlocked', {
              userId: userData.userId,
              nickname: userData.nickname,
              skins: unlockedSkins
            });
          }
        }
      } catch (error) {
        this.api.log(`Error processing gift: ${error.message}`, 'error');
      }
    });

    // User joined (for team assignment)
    this.api.registerTikTokEvent('join', (data) => {
      try {
        if (this.engine.currentMatch && this.engine.currentMatch.mode === 'team') {
          const userData = {
            userId: data.userId,
            uniqueId: data.uniqueId,
            nickname: data.nickname,
            profilePictureUrl: data.profilePictureUrl
          };

          const player = this.db.getOrCreatePlayer(userData);
          
          // Don't auto-assign team on join, wait for first gift
          this.api.log(`User joined: ${data.nickname}`, 'info');
        }
      } catch (error) {
        this.api.log(`Error handling user join: ${error.message}`, 'error');
      }
    });

    // Like event - integrate with likes points system
    this.api.registerTikTokEvent('like', async (data) => {
      try {
        const userData = {
          userId: data.userId,
          uniqueId: data.uniqueId,
          nickname: data.nickname,
          profilePictureUrl: data.profilePictureUrl
        };

        // Process likes through Pyramid Mode while a round is active.
        if (this.pyramidMode && this.pyramidMode.active) {
          if (data.likeCount) {
            this.pyramidMode.processLike(userData, data.likeCount);
          }
        }

        // Process likes as points for coinbattle if match is active
        if (!this.engine.currentMatch) return;
        
        // Process likes as points if enabled
        const likesConfig = this.likesPointsSystem.getConfig();
        if (likesConfig.enabled && data.likeCount) {
          const result = this.likesPointsSystem.processLikeEvent(
            this.engine.currentMatch.id,
            data.userId,
            data.likeCount
          );
          
          if (result.success && result.points > 0) {
            const giftData = {
              giftId: 0,
              giftName: '❤️ Likes',
              coins: result.points
            };
            
            this.engine.processGift(giftData, userData);
            
            // Emit notification
            this.io.emit('coinbattle:likes-points', {
              userId: data.userId,
              likes: data.likeCount,
              points: result.points
            });
          }
        }
      } catch (error) {
        this.api.log(`Error processing like event: ${error.message}`, 'error');
      }
    });

    // Share event - integrate with likes points system
    this.api.registerTikTokEvent('share', async (data) => {
      if (!this.engine.currentMatch) return;
      
      try {
        const likesConfig = this.likesPointsSystem.getConfig();
        if (likesConfig.enabled) {
          const result = this.likesPointsSystem.processShareEvent(
            this.engine.currentMatch.id,
            data.userId,
            1
          );
          
          if (result.success && result.points > 0) {
            const userData = {
              userId: data.userId,
              uniqueId: data.uniqueId,
              nickname: data.nickname,
              profilePictureUrl: data.profilePictureUrl
            };
            
            const giftData = {
              giftId: 0,
              giftName: '🔗 Share',
              coins: result.points
            };
            
            this.engine.processGift(giftData, userData);
            
            this.io.emit('coinbattle:share-points', {
              userId: data.userId,
              points: result.points
            });
          }
        }
      } catch (error) {
        this.api.log(`Error processing share event: ${error.message}`, 'error');
      }
    });

    // Follow event - integrate with likes points system
    this.api.registerTikTokEvent('follow', async (data) => {
      if (!this.engine.currentMatch) return;
      
      try {
        const likesConfig = this.likesPointsSystem.getConfig();
        if (likesConfig.enabled) {
          const result = this.likesPointsSystem.processFollowEvent(
            this.engine.currentMatch.id,
            data.userId
          );
          
          if (result.success && result.points > 0) {
            const userData = {
              userId: data.userId,
              uniqueId: data.uniqueId,
              nickname: data.nickname,
              profilePictureUrl: data.profilePictureUrl
            };
            
            const giftData = {
              giftId: 0,
              giftName: '➕ Follow',
              coins: result.points
            };
            
            this.engine.processGift(giftData, userData);
            
            this.io.emit('coinbattle:follow-points', {
              userId: data.userId,
              points: result.points
            });
          }
        }
      } catch (error) {
        this.api.log(`Error processing follow event: ${error.message}`, 'error');
      }
    });

    // Comment event - integrate with likes points system
    this.api.registerTikTokEvent('chat', async (data) => {
      if (!this.engine.currentMatch) return;
      
      try {
        const likesConfig = this.likesPointsSystem.getConfig();
        if (likesConfig.enabled) {
          const result = this.likesPointsSystem.processCommentEvent(
            this.engine.currentMatch.id,
            data.userId
          );
          
          if (result.success && result.points > 0) {
            const userData = {
              userId: data.userId,
              uniqueId: data.uniqueId,
              nickname: data.nickname,
              profilePictureUrl: data.profilePictureUrl
            };
            
            const giftData = {
              giftId: 0,
              giftName: '💬 Comment',
              coins: result.points
            };
            
            this.engine.processGift(giftData, userData);
          }
        }
      } catch (error) {
        this.api.log(`Error processing comment event: ${error.message}`, 'error');
      }
    });

    this.api.log('CoinBattle TikTok events registered with performance optimization', 'info');
  }

  /**
   * Cleanup on plugin destroy
   */
  async destroy() {
    this.api.log('Destroying CoinBattle Plugin...', 'info');

    if (this.pyramidXPUnsubscribe) {
      this.pyramidXPUnsubscribe();
      this.pyramidXPUnsubscribe = null;
    }

    if (this.matchEndedUnsubscribe) {
      this.matchEndedUnsubscribe();
      this.matchEndedUnsubscribe = null;
    }
    
    // Destroy all subsystems
    if (this.engine) {
      this.engine.destroy();
    }

    if (this.performanceManager) {
      await this.performanceManager.destroy();
    }

    if (this.kothMode) {
      this.kothMode.destroy();
    }

    if (this.pyramidMode) {
      this.pyramidMode.destroy();
    }

    if (this.friendChallenges) {
      this.friendChallenges.destroy();
    }

    this.api.log('✅ CoinBattle Plugin destroyed with all features cleaned up', 'info');
  }
}

module.exports = CoinBattlePlugin;
