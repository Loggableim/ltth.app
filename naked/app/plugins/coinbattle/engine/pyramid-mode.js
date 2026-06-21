/**
 * Pyramid Battle Mode
 * Players compete to climb the pyramid leaderboard
 * 
 * Structure:
 * - Row 1: 1 player (top - large avatar)
 * - Row 2: 2 players (medium avatars)
 * - Row 3: 4 players (normal avatars)
 * - Row 4: 6 players (small avatars)
 * 
 * Players join by sending gifts or likes
 * Positions change based on coin count during the round
 */

class PyramidMode {
  constructor(database, socketIO, logger = console) {
    this.db = database;
    this.io = socketIO;
    this.logger = logger;

    // Pyramid state
    this.active = false;
    this.matchId = null;
    this.roundStartTime = null;
    this.roundDuration = 0; // seconds
    this.roundTimer = null;
    this.remainingTime = 0;

    // Configuration
    this.config = {
      enabled: false,
      autoStart: true, // Start pyramid on first gift
      rowCount: 4, // Number of rows (1, 2, 4, 6)
      roundDuration: 120, // Initial round duration in seconds
      extensionPerCoin: 0.5, // Seconds added per coin received
      maxExtension: 300, // Maximum extension in seconds
      coinsPerPoint: 100, // 1 coin = 100 points
      likesPerPoint: 1, // 1 like = 1 point
      minCoinsToJoin: 1, // Minimum coins to join pyramid
      // XP Rewards Integration
      xpRewardsEnabled: false, // Enable XP rewards for winners
      xpDistributionMode: 'winner-takes-all', // 'winner-takes-all', 'top3', 'top5', 'top10'
      xpConversionRate: 1.0, // Points to XP multiplier (1 point = X XP)
      xpRewardedPlaces: 1 // Number of places to reward (1, 3, 5, or 10)
    };

    // Row sizes for pyramid
    this.rowSizes = [1, 2, 4, 6]; // Standard pyramid: 1, 2, 4, 6

    // Players in pyramid
    this.players = new Map(); // userId -> player data with points

    // Previous leaderboard for animation detection
    this.previousLeaderboard = [];

    // Statistics
    this.stats = {
      totalPointsEarned: 0,
      totalExtensions: 0,
      totalKnockouts: 0,
      roundsPlayed: 0
    };

    // Post-match configuration (set by parent plugin)
    this.postMatchConfig = null;

    // Internal server-side XP award subscribers.
    this.xpAwardHandlers = new Set();

    this.logger.info('🔺 Pyramid Mode initialized');
  }

  /**
   * Subscribe to server-side XP award events.
   */
  onXPAwards(handler) {
    if (typeof handler !== 'function') {
      throw new Error('XP award handler must be a function');
    }

    this.xpAwardHandlers.add(handler);
    return () => this.xpAwardHandlers.delete(handler);
  }

  /**
   * Migrate XP reward columns (for existing databases)
   * Uses ALTER TABLE to add columns that were added in later versions
   */
  migrateXPRewardColumns() {
    // Predefined column list - safe from SQL injection
    const columnsToAdd = [
      { name: 'xp_rewards_enabled', type: 'INTEGER DEFAULT 0' },
      { name: 'xp_distribution_mode', type: 'TEXT DEFAULT \'winner-takes-all\'' },
      { name: 'xp_conversion_rate', type: 'REAL DEFAULT 1.0' },
      { name: 'xp_rewarded_places', type: 'INTEGER DEFAULT 1' }
    ];

    columnsToAdd.forEach(column => {
      try {
        // Note: Column name and type are from a predefined constant list above,
        // not from user input, so this is safe from SQL injection
        this.db.prepare(`ALTER TABLE coinbattle_pyramid_config ADD COLUMN ${column.name} ${column.type}`).run();
        this.logger.info(`Added column ${column.name} to coinbattle_pyramid_config`);
      } catch (error) {
        // Column already exists - expected on subsequent runs
        if (!error.message.includes('duplicate column name')) {
          this.logger.error(`Failed to add ${column.name} column: ${error.message}`);
        }
      }
    });
  }

  /**
   * Initialize database tables
   */
  initializeTables() {
    try {
      // Pyramid config table
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_pyramid_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER DEFAULT 0,
          auto_start INTEGER DEFAULT 1,
          row_count INTEGER DEFAULT 4,
          round_duration INTEGER DEFAULT 120,
          extension_per_coin REAL DEFAULT 0.5,
          max_extension INTEGER DEFAULT 300,
          coins_per_point INTEGER DEFAULT 100,
          likes_per_point INTEGER DEFAULT 1,
          min_coins_to_join INTEGER DEFAULT 1,
          xp_rewards_enabled INTEGER DEFAULT 0,
          xp_distribution_mode TEXT DEFAULT 'winner-takes-all',
          xp_conversion_rate REAL DEFAULT 1.0,
          xp_rewarded_places INTEGER DEFAULT 1,
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `).run();

      // Pyramid round history
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_pyramid_rounds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_id INTEGER,
          start_time INTEGER,
          end_time INTEGER,
          total_duration INTEGER,
          total_extensions INTEGER DEFAULT 0,
          total_players INTEGER DEFAULT 0,
          winner_user_id TEXT,
          winner_points INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `).run();

      // Migration: Add XP reward columns if they don't exist
      this.migrateXPRewardColumns();

      // Load configuration
      this.loadConfig();

      this.logger.info('✅ Pyramid Mode tables initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize pyramid tables: ${error.message}`);
    }
  }

  /**
   * Load configuration from database
   */
  loadConfig() {
    try {
      const config = this.db.prepare(`
        SELECT * FROM coinbattle_pyramid_config WHERE id = 1
      `).get();

      if (config) {
        this.config = {
          enabled: config.enabled === 1,
          autoStart: config.auto_start === 1,
          rowCount: config.row_count,
          roundDuration: config.round_duration,
          extensionPerCoin: config.extension_per_coin,
          maxExtension: config.max_extension,
          coinsPerPoint: config.coins_per_point,
          likesPerPoint: config.likes_per_point,
          minCoinsToJoin: config.min_coins_to_join,
          xpRewardsEnabled: config.xp_rewards_enabled === 1,
          xpDistributionMode: config.xp_distribution_mode || 'winner-takes-all',
          xpConversionRate: config.xp_conversion_rate || 1.0,
          xpRewardedPlaces: config.xp_rewarded_places || 1
        };
        this.updateRowSizes();
      } else {
        this.saveConfig();
      }
    } catch (error) {
      this.logger.error(`Failed to load pyramid config: ${error.message}`);
    }
  }

  /**
   * Save configuration to database
   */
  saveConfig() {
    try {
      this.db.prepare(`
        INSERT INTO coinbattle_pyramid_config 
        (id, enabled, auto_start, row_count, round_duration, extension_per_coin, 
         max_extension, coins_per_point, likes_per_point, min_coins_to_join,
         xp_rewards_enabled, xp_distribution_mode, xp_conversion_rate, xp_rewarded_places)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          enabled = excluded.enabled,
          auto_start = excluded.auto_start,
          row_count = excluded.row_count,
          round_duration = excluded.round_duration,
          extension_per_coin = excluded.extension_per_coin,
          max_extension = excluded.max_extension,
          coins_per_point = excluded.coins_per_point,
          likes_per_point = excluded.likes_per_point,
          min_coins_to_join = excluded.min_coins_to_join,
          xp_rewards_enabled = excluded.xp_rewards_enabled,
          xp_distribution_mode = excluded.xp_distribution_mode,
          xp_conversion_rate = excluded.xp_conversion_rate,
          xp_rewarded_places = excluded.xp_rewarded_places,
          updated_at = strftime('%s', 'now')
      `).run(
        this.config.enabled ? 1 : 0,
        this.config.autoStart ? 1 : 0,
        this.config.rowCount,
        this.config.roundDuration,
        this.config.extensionPerCoin,
        this.config.maxExtension,
        this.config.coinsPerPoint,
        this.config.likesPerPoint,
        this.config.minCoinsToJoin,
        this.config.xpRewardsEnabled ? 1 : 0,
        this.config.xpDistributionMode,
        this.config.xpConversionRate,
        this.config.xpRewardedPlaces
      );

      this.logger.info('Pyramid config saved');
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to save pyramid config: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    const validKeys = [
      'enabled', 'autoStart', 'rowCount', 'roundDuration',
      'extensionPerCoin', 'maxExtension', 'coinsPerPoint',
      'likesPerPoint', 'minCoinsToJoin',
      'xpRewardsEnabled', 'xpDistributionMode', 'xpConversionRate', 'xpRewardedPlaces'
    ];

    Object.keys(newConfig).forEach(key => {
      if (validKeys.includes(key)) {
        this.config[key] = newConfig[key];
      }
    });

    this.updateRowSizes();
    const result = this.saveConfig();
    
    // Emit config update to overlays
    this.io.emit('pyramid:config-updated', {
      rowSizes: this.rowSizes,
      config: this.getPublicConfig()
    });
    
    return result;
  }

  /**
   * Update row sizes based on rowCount config
   */
  updateRowSizes() {
    // Standard pyramid: 1, 2, 4, 6
    // Can be adjusted based on rowCount
    const baseSizes = [1, 2, 4, 6, 8, 10];
    this.rowSizes = baseSizes.slice(0, this.config.rowCount);
  }

  /**
   * Get total slots in pyramid
   */
  getTotalSlots() {
    return this.rowSizes.reduce((sum, size) => sum + size, 0);
  }

  /**
   * Normalize profile picture fields for overlay compatibility
   */
  normalizeProfilePicture(userData) {
    return userData.profilePictureUrl || userData.profile_picture_url || null;
  }

  /**
   * Apply normalized profile picture to player object
   */
  applyProfilePicture(player, profilePictureUrl) {
    if (!player || !profilePictureUrl) {
      return;
    }

    player.profilePictureUrl = profilePictureUrl;
    player.profile_picture_url = profilePictureUrl;
  }

  /**
   * Start a new pyramid round
   */
  startRound(matchId = null, duration = null) {
    if (this.active) {
      this.logger.warn('Pyramid round already active');
      return { success: false, error: 'Round already active' };
    }

    const parsedDuration = Number(duration);
    const roundDuration = Number.isFinite(parsedDuration) && parsedDuration > 0
      ? Math.floor(parsedDuration)
      : this.config.roundDuration;

    this.active = true;
    this.matchId = matchId;
    this.roundStartTime = Date.now();
    this.roundDuration = roundDuration;
    this.remainingTime = this.roundDuration;
    this.players.clear();
    this.previousLeaderboard = [];
    this.stats.roundsPlayed++;

    // Start timer
    this.startTimer();

    // Emit round start event
    this.io.emit('pyramid:round-started', {
      matchId: this.matchId,
      duration: this.roundDuration,
      rowSizes: this.rowSizes,
      totalSlots: this.getTotalSlots(),
      config: this.getPublicConfig()
    });

    this.logger.info(`🔺 Pyramid round started (${this.roundDuration}s)`);
    return { success: true, duration: this.roundDuration };
  }

  /**
   * End the current pyramid round
   */
  endRound() {
    if (!this.active) {
      return { success: false, error: 'No active round' };
    }

    this.stopTimer();

    // Get final leaderboard
    const leaderboard = this.getLeaderboard();
    const winner = leaderboard.length > 0 ? leaderboard[0] : null;

    // Calculate and award XP if enabled
    let xpRewards = [];
    if (this.config.xpRewardsEnabled) {
      xpRewards = this.calculateXPDistribution(leaderboard);
      if (xpRewards.length > 0) {
        this.awardXPToWinners(xpRewards);
      }
    }

    // Record round in database
    try {
      this.db.prepare(`
        INSERT INTO coinbattle_pyramid_rounds 
        (match_id, start_time, end_time, total_duration, total_extensions, 
         total_players, winner_user_id, winner_points)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        this.matchId,
        Math.floor(this.roundStartTime / 1000),
        Math.floor(Date.now() / 1000),
        this.roundDuration,
        this.stats.totalExtensions,
        this.players.size,
        winner ? winner.userId : null,
        winner ? winner.points : 0
      );
    } catch (error) {
      this.logger.error(`Failed to record pyramid round: ${error.message}`);
    }

    // Emit round end event with XP rewards info and post-match config
    this.io.emit('pyramid:round-ended', {
      matchId: this.matchId,
      winner: winner,
      leaderboard: leaderboard.slice(0, 10),
      pyramid: this.getPyramidState(), // Include final pyramid state
      totalPlayers: this.players.size,
      totalDuration: this.roundDuration,
      xpRewards: xpRewards,
      postMatchConfig: this.postMatchConfig // Include post-match config for overlay
    });

    this.active = false;
    this.matchId = null;

    this.logger.info('🔺 Pyramid round ended');
    return { success: true, winner, leaderboard, xpRewards };
  }

  /**
   * Start round timer
   */
  startTimer() {
    if (this.roundTimer) {
      clearInterval(this.roundTimer);
    }

    this.roundTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.roundStartTime) / 1000);
      this.remainingTime = Math.max(0, this.roundDuration - elapsed);

      // Emit timer update
      this.io.emit('pyramid:timer-update', {
        elapsed,
        remaining: this.remainingTime,
        total: this.roundDuration
      });

      // Round end check
      if (this.remainingTime === 0) {
        this.endRound();
      }
    }, 1000);
  }

  /**
   * Stop timer
   */
  stopTimer() {
    if (this.roundTimer) {
      clearInterval(this.roundTimer);
      this.roundTimer = null;
    }
  }

  /**
   * Extend the round duration
   */
  extendRound(coins) {
    if (!this.active) return 0;

    const extension = Math.min(
      coins * this.config.extensionPerCoin,
      this.config.maxExtension - (this.roundDuration - this.config.roundDuration)
    );

    if (extension > 0) {
      this.roundDuration += extension;
      this.remainingTime += extension;
      this.stats.totalExtensions++;

      this.io.emit('pyramid:round-extended', {
        extension,
        newDuration: this.roundDuration,
        remaining: this.remainingTime
      });

      this.logger.debug(`Round extended by ${extension}s`);
    }

    return extension;
  }

  /**
   * Process gift event (coins)
   */
  processGift(userData, coins) {
    // Auto-start if enabled and not active
    if (!this.active && this.config.enabled && this.config.autoStart) {
      this.startRound();
    }

    if (!this.active) {
      return { success: false, error: 'Pyramid not active' };
    }

    const points = coins * this.config.coinsPerPoint;
    const result = this.addPoints(userData, points, 'gift', coins);

    // Extend round based on coins
    this.extendRound(coins);

    return result;
  }

  /**
   * Process like event
   */
  processLike(userData, likeCount) {
    if (!this.active) {
      return { success: false, error: 'Pyramid not active' };
    }

    const points = likeCount * this.config.likesPerPoint;
    return this.addPoints(userData, points, 'like', likeCount);
  }

  /**
   * Add points to a player
   */
  addPoints(userData, points, source, count) {
    const userId = userData.userId;
    const profilePictureUrl = this.normalizeProfilePicture(userData);

    // Get or create player entry
    if (!this.players.has(userId)) {
      // Check minimum coins requirement for new players
      if (source === 'gift' && count < this.config.minCoinsToJoin) {
        return { success: false, error: 'Below minimum coins to join' };
      }

      this.players.set(userId, {
        userId,
        uniqueId: userData.uniqueId || userData.unique_id, // unique_id fallback for legacy payloads
        nickname: userData.nickname,
        profilePictureUrl,
        profile_picture_url: profilePictureUrl,
        points: 0,
        gifts: 0,
        likes: 0,
        joinedAt: Date.now()
      });

      this.io.emit('pyramid:player-joined', {
        player: this.players.get(userId),
        totalPlayers: this.players.size
      });

      this.logger.info(`Player ${userData.nickname} joined pyramid`);
    }

    const player = this.players.get(userId);
    this.applyProfilePicture(player, profilePictureUrl);
    const previousPosition = this.getPlayerPosition(userId);

    // Update points
    player.points += points;
    if (source === 'gift') {
      player.gifts += count;
    } else if (source === 'like') {
      player.likes += count;
    }

    this.stats.totalPointsEarned += points;

    // Get new position
    const newPosition = this.getPlayerPosition(userId);

    // Detect position changes
    const positionChange = previousPosition - newPosition;

    // Check for knockout (leader change)
    const leaderboard = this.getLeaderboard();
    const previousLeader = this.previousLeaderboard.length > 0 ? this.previousLeaderboard[0] : null;
    const currentLeader = leaderboard.length > 0 ? leaderboard[0] : null;

    let knockout = false;
    if (previousLeader && currentLeader && previousLeader.userId !== currentLeader.userId) {
      knockout = true;
      this.stats.totalKnockouts++;

      this.io.emit('pyramid:knockout', {
        newLeader: currentLeader,
        previousLeader: previousLeader
      });

      this.logger.info(`🥊 Knockout! ${currentLeader.nickname} took the lead from ${previousLeader.nickname}`);
    }

    // Emit points update
    this.io.emit('pyramid:points-update', {
      player: player,
      points: points,
      totalPoints: player.points,
      source,
      count,
      positionChange,
      newPosition,
      knockout
    });

    // Update leaderboard
    this.emitLeaderboard();

    // Store for next comparison
    this.previousLeaderboard = leaderboard;

    return {
      success: true,
      player,
      points,
      positionChange,
      newPosition,
      knockout
    };
  }

  /**
   * Get player's current position in leaderboard
   */
  getPlayerPosition(userId) {
    const leaderboard = this.getLeaderboard();
    const index = leaderboard.findIndex(p => p.userId === userId);
    return index === -1 ? leaderboard.length + 1 : index + 1;
  }

  /**
   * Get sorted leaderboard
   */
  getLeaderboard() {
    const players = Array.from(this.players.values());
    return players.sort((a, b) => b.points - a.points);
  }

  /**
   * Calculate XP distribution based on distribution mode
   * Returns array of { userId, username, xp } for each rewarded player
   */
  calculateXPDistribution(leaderboard) {
    if (!this.config.xpRewardsEnabled || leaderboard.length === 0) {
      return [];
    }

    // Distribution percentages for different modes
    const distributions = {
      'winner-takes-all': [100],
      'top3': [50, 30, 20],
      'top5': [40, 25, 18, 10, 7],
      'top10': [30, 20, 15, 10, 8, 6, 5, 3, 2, 1]
    };

    const mode = this.config.xpDistributionMode;
    const percentages = distributions[mode] || [100];
    const rewardedPlaces = Math.min(
      this.config.xpRewardedPlaces,
      percentages.length,
      leaderboard.length
    );

    // Calculate total points from all players
    const totalPoints = leaderboard.reduce((sum, player) => sum + player.points, 0);
    
    // Apply XP conversion rate
    const totalXP = Math.floor(totalPoints * this.config.xpConversionRate);

    // Distribute XP according to percentages
    const rewards = [];
    for (let i = 0; i < rewardedPlaces; i++) {
      const player = leaderboard[i];
      const percentage = percentages[i] || 0;
      const xp = Math.floor((totalXP * percentage) / 100);
      
      if (xp > 0) {
        rewards.push({
          userId: player.userId,
          username: player.uniqueId || player.nickname || player.userId,
          nickname: player.nickname,
          xp: xp,
          place: i + 1,
          percentage: percentage,
          points: player.points
        });
      }
    }

    return rewards;
  }

  /**
   * Award XP to winners via viewer-xp plugin integration
   */
  async awardXPToWinners(rewards) {
    if (!rewards || rewards.length === 0) {
      return { success: true, awarded: [] };
    }

    const awarded = [];
    const errors = [];

    try {
      // Emit XP awards event for viewer-xp plugin to process
      const payload = {
        rewards: rewards,
        source: 'pyramid-mode',
        timestamp: Date.now()
      };

      this.io.emit('pyramid:xp-awards', payload);
      this.notifyXPAwards(payload);

      // Log each award
      for (const reward of rewards) {
        this.logger.info(
          `🎮 Awarding ${reward.xp} XP to ${reward.username} (Place #${reward.place}, ${reward.percentage}%)`
        );
        awarded.push({
          username: reward.username,
          xp: reward.xp,
          place: reward.place
        });
      }

      return { success: true, awarded };
    } catch (error) {
      this.logger.error(`Failed to award XP: ${error.message}`);
      return { success: false, error: error.message, awarded };
    }
  }

  /**
   * Notify internal XP award subscribers.
   */
  notifyXPAwards(payload) {
    for (const handler of this.xpAwardHandlers) {
      try {
        const result = handler(payload);
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            this.logger.error(`XP award handler failed: ${error.message}`);
          });
        }
      } catch (error) {
        this.logger.error(`XP award handler failed: ${error.message}`);
      }
    }
  }

  /**
   * Get pyramid state with row assignments
   */
  getPyramidState() {
    const leaderboard = this.getLeaderboard();
    const pyramid = [];
    let playerIndex = 0;

    for (let rowIndex = 0; rowIndex < this.rowSizes.length; rowIndex++) {
      const rowSize = this.rowSizes[rowIndex];
      const row = {
        rowIndex,
        size: rowSize,
        slots: []
      };

      for (let slotIndex = 0; slotIndex < rowSize; slotIndex++) {
        if (playerIndex < leaderboard.length) {
          row.slots.push({
            position: playerIndex + 1,
            player: leaderboard[playerIndex],
            filled: true
          });
          playerIndex++;
        } else {
          row.slots.push({
            position: playerIndex + 1,
            player: null,
            filled: false
          });
          playerIndex++;
        }
      }

      pyramid.push(row);
    }

    return pyramid;
  }

  /**
   * Emit current leaderboard
   */
  emitLeaderboard() {
    const leaderboard = this.getLeaderboard();
    const pyramidState = this.getPyramidState();

    this.io.emit('pyramid:leaderboard-update', {
      leaderboard,
      pyramid: pyramidState,
      totalPlayers: this.players.size,
      remainingTime: this.remainingTime
    });
  }

  /**
   * Format points for display (1k, 10k, 1M, etc.)
   */
  formatPoints(points) {
    if (points >= 1000000) {
      return (points / 1000000).toFixed(2) + 'M';
    } else if (points >= 1000) {
      return Math.floor(points / 1000) + 'k';
    }
    return points.toString();
  }

  /**
   * Get public configuration (safe to send to clients)
   */
  getPublicConfig() {
    return {
      enabled: this.config.enabled,
      autoStart: this.config.autoStart,
      rowCount: this.config.rowCount,
      roundDuration: this.config.roundDuration,
      coinsPerPoint: this.config.coinsPerPoint,
      likesPerPoint: this.config.likesPerPoint,
      rowSizes: this.rowSizes
    };
  }

  /**
   * Get full configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Set post-match configuration from parent plugin
   * @param {Object} config - Post-match display configuration
   */
  setPostMatchConfig(config) {
    this.postMatchConfig = config;
  }

  /**
   * Get current state
   */
  getState() {
    return {
      active: this.active,
      matchId: this.matchId,
      remainingTime: this.remainingTime,
      roundDuration: this.roundDuration,
      totalPlayers: this.players.size,
      pyramid: this.getPyramidState(),
      leaderboard: this.getLeaderboard(),
      stats: this.stats,
      config: this.getPublicConfig()
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Get round history
   */
  getRoundHistory(limit = 20) {
    try {
      return this.db.prepare(`
        SELECT * FROM coinbattle_pyramid_rounds
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
    } catch (error) {
      this.logger.error(`Failed to get round history: ${error.message}`);
      return [];
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopTimer();
    this.active = false;
    this.players.clear();
    this.xpAwardHandlers.clear();
    this.logger.info('🔺 Pyramid Mode destroyed');
  }
}

module.exports = PyramidMode;
