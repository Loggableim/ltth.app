/**
 * CoinBattle Game Engine
 * Manages match state, game logic, timers, teams, and multipliers
 */

const { randomUUID } = require('crypto');

// Post-match display constants
const DEFAULT_WINNER_CREDITS_DURATION = 10; // seconds
const DEFAULT_LEADERBOARD_DURATION = 15; // seconds
const AUTO_RESET_BUFFER_MS = 2000; // milliseconds - buffer for transitions

class CoinBattleEngine {
  constructor(database, socketIO, logger = console) {
    this.db = database;
    this.io = socketIO;
    this.logger = logger;

    // Current match state
    this.currentMatch = null;
    this.matchTimer = null;
    this.autoResetTimeout = null;
    this.matchStartTime = null;
    this.matchDuration = 0; // seconds
    this.isPaused = false;
    this.pauseStartTime = null;
    this.totalPausedTime = 0;

    // Player tracking (in-memory for current match)
    this.players = new Map(); // userId -> player data
    this.teams = { red: new Set(), blue: new Set() };

    // Multiplier state
    this.activeMultiplier = 1.0;
    this.multiplierTimer = null;
    this.multiplierEndTime = null;

    /**
     * Optional callback to augment match state before emission
     * @type {(state: {active: boolean, match: object|null, leaderboard: object[], teamScores: object|null, multiplier?: object, config: object}) => object}
     */
    this.stateAugmenter = null;

    // Configuration
    this.config = {
      matchDuration: 300, // 5 minutes default
      autoStart: false,
      autoReset: true,
      autoExtension: true,
      extensionThreshold: 15, // coins difference
      extensionDuration: 60, // seconds
      mode: 'solo', // 'solo' or 'team'
      teamAssignment: 'random', // 'random', 'manual', 'alternate'
      enableMultipliers: true,
      enableOfflineSimulation: false
    };

    // Offline simulation
    this.simulationInterval = null;
    this.simulationPlayers = [];

    // Atomic operation locks for race condition prevention
    this.matchEndLock = false;
    this.matchStartLock = false;

    // Internal server-side subscribers. Socket.IO broadcasts do not loop back
    // into io.on(...) handlers, so plugin integrations must use callbacks.
    this.matchEndedHandlers = new Set();

    // Event cache cleanup interval (every 5 minutes)
    this.cacheCleanupInterval = setInterval(() => {
      try {
        this.db.cleanupEventCache();
      } catch (error) {
        this.logger.error(`Event cache cleanup failed: ${error.message}`);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Load configuration
   */
  loadConfig(config) {
    this.config = { ...this.config, ...config };
    this.logger.info('CoinBattle config loaded:', this.config);
  }

  /**
   * Subscribe to server-side match-ended events.
   */
  onMatchEnded(handler) {
    if (typeof handler !== 'function') {
      throw new Error('Match ended handler must be a function');
    }

    this.matchEndedHandlers.add(handler);
    return () => this.matchEndedHandlers.delete(handler);
  }

  /**
   * Start a new match with atomic locking
   */
  startMatch(mode = null, duration = null) {
    // Atomic lock to prevent concurrent starts
    if (this.matchStartLock) {
      this.logger.warn('Match start already in progress');
      throw new Error('Match start already in progress');
    }

    if (this.currentMatch) {
      throw new Error('Match already in progress');
    }

    this.matchStartLock = true;
    try {
      if (this.autoResetTimeout) {
        clearTimeout(this.autoResetTimeout);
        this.autoResetTimeout = null;
      }

      const matchMode = mode || this.config.mode;
      const matchDuration = duration || this.config.matchDuration;

      // Create match in database
      const matchUuid = randomUUID();
      const matchId = this.db.createMatch({ match_uuid: matchUuid, mode: matchMode });

      this.currentMatch = {
        id: matchId,
        uuid: matchUuid,
        mode: matchMode,
        duration: matchDuration,
        status: 'active'
      };

      this.matchStartTime = Date.now();
      this.matchDuration = matchDuration;
      this.totalPausedTime = 0;
      this.isPaused = false;
      this.players.clear();
      this.teams.red.clear();
      this.teams.blue.clear();

      // Start countdown timer
      this.startTimer();

      // Emit match start event
      this.emitMatchState();
      this.io.emit('coinbattle:match-started', {
        matchId: matchId,
        matchUuid: matchUuid,
        mode: matchMode,
        duration: matchDuration
      });

      this.logger.info(`Match started: ${matchUuid} (${matchMode} mode, ${matchDuration}s)`);
      return this.currentMatch;
    } finally {
      this.matchStartLock = false;
    }
  }

  /**
   * End current match with atomic locking
   */
  endMatch() {
    // Atomic lock to prevent concurrent calls
    if (this.matchEndLock) {
      this.logger.warn('Match end already in progress');
      return null;
    }

    if (!this.currentMatch) {
      throw new Error('No active match');
    }

    this.matchEndLock = true;
    try {
      this.stopTimer();
      this.clearMultiplierTimer();

      // Calculate winner
      const leaderboard = this.db.getMatchLeaderboard(this.currentMatch.id, 100);
      const teamScores = this.currentMatch.mode === 'team' ? this.db.getTeamScores(this.currentMatch.id) : null;

      let winnerData = {
        total_coins: leaderboard.reduce((sum, p) => sum + p.coins, 0)
      };

      if (this.currentMatch.mode === 'team') {
        winnerData.team_red_score = teamScores.red;
        winnerData.team_blue_score = teamScores.blue;
        winnerData.winner_team = teamScores.red > teamScores.blue ? 'red' : 'blue';
      } else {
        winnerData.winner_player_id = leaderboard[0]?.user_id || null;
      }

      // End match in database
      this.db.endMatch(this.currentMatch.id, winnerData);

      // Update player lifetime stats
      for (const participant of leaderboard) {
        const isWinner = this.currentMatch.mode === 'team' 
          ? participant.team === winnerData.winner_team
          : participant.user_id === winnerData.winner_player_id;
        
        const isTeamMatch = this.currentMatch.mode === 'team';
        
        this.db.updatePlayerLifetimeStats(
          participant.player_id,
          participant.coins,
          participant.gifts,
          isWinner,
          isWinner && isTeamMatch
        );

        // Check and award badges
        const newBadges = this.db.checkAndAwardBadges(participant.player_id);
        if (newBadges.length > 0) {
          this.io.emit('coinbattle:badges-awarded', {
            userId: participant.user_id,
            badges: newBadges
          });
        }
      }

      // Update match stats
      this.db.updateMatchStats(this.currentMatch.id);

      // Calculate XP rewards for winners
      const winnersWithXP = this.calculateMatchXPRewards(leaderboard, this.currentMatch.mode, winnerData);

      const matchEndedPayload = {
        matchId: this.currentMatch.id,
        mode: this.currentMatch.mode,
        winner: winnerData,
        leaderboard: leaderboard.slice(0, 10),
        teamScores,
        winnersWithXP  // Include XP data for post-match display
      };

      // Emit match end event
      this.io.emit('coinbattle:match-ended', matchEndedPayload);
      this.notifyMatchEnded(matchEndedPayload);

      // Emit post-match event for overlay display
      if (this.config.postMatch?.showLeaderboard || this.config.postMatch?.showWinnerCredits) {
        this.io.emit('coinbattle:post-match', {
          matchId: this.currentMatch.id,
          mode: this.currentMatch.mode,
          winnersWithXP,
          leaderboard: leaderboard.slice(0, 10),
          config: this.config.postMatch
        });
      }

      const matchId = this.currentMatch.id;
      this.currentMatch = null;

      // Emit updated match state to all clients
      this.emitMatchState();

      this.logger.info(`Match ended: ${matchId}`);

      // Auto-reset if enabled
      if (this.config.autoReset) {
        // Calculate post-match display duration
        const postMatchDuration = this.calculatePostMatchDuration();
        // Add a small buffer for transitions and safety
        const resetDelay = (postMatchDuration * 1000) + AUTO_RESET_BUFFER_MS;
        
        this.logger.info(`Auto-reset scheduled in ${resetDelay / 1000}s (post-match duration: ${postMatchDuration}s)`);
        
        this.autoResetTimeout = setTimeout(() => {
          this.autoResetTimeout = null;
          this.logger.info('Auto-reset triggered, starting new match');
          try {
            this.startMatch();
          } catch (error) {
            this.logger.error(`Auto-reset failed for match ${matchId}: ${error.message}`);
          }
        }, resetDelay);
      }

      return { matchId, winnerData, leaderboard };
    } finally {
      this.matchEndLock = false;
    }
  }

  /**
   * Pause match
   */
  pauseMatch() {
    if (!this.currentMatch || this.isPaused) {
      return false;
    }

    this.isPaused = true;
    this.pauseStartTime = Date.now();
    this.stopTimer();

    this.io.emit('coinbattle:match-paused', {
      matchId: this.currentMatch.id,
      pausedAt: this.pauseStartTime
    });

    // Emit updated match state to all clients
    this.emitMatchState();

    this.logger.info('Match paused');
    return true;
  }

  /**
   * Resume match
   */
  resumeMatch() {
    if (!this.currentMatch || !this.isPaused) {
      return false;
    }

    const pauseDuration = Date.now() - this.pauseStartTime;
    this.totalPausedTime += pauseDuration;
    this.isPaused = false;
    this.pauseStartTime = null;

    this.startTimer();

    this.io.emit('coinbattle:match-resumed', {
      matchId: this.currentMatch.id,
      resumedAt: Date.now()
    });

    // Emit updated match state to all clients
    this.emitMatchState();

    this.logger.info('Match resumed');
    return true;
  }

  /**
   * Extend match duration
   */
  extendMatch(additionalSeconds) {
    if (!this.currentMatch) {
      return false;
    }

    this.matchDuration += additionalSeconds;
    this.db.incrementAutoExtension(this.currentMatch.id);

    this.io.emit('coinbattle:match-extended', {
      matchId: this.currentMatch.id,
      additionalSeconds,
      newDuration: this.matchDuration
    });

    // Emit updated match state to all clients
    this.emitMatchState();

    this.logger.info(`Match extended by ${additionalSeconds}s`);
    return true;
  }

  /**
   * Start countdown timer
   */
  startTimer() {
    if (this.matchTimer) {
      clearInterval(this.matchTimer);
    }

    this.matchTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.matchStartTime - this.totalPausedTime) / 1000);
      const remaining = Math.max(0, this.matchDuration - elapsed);

      this.io.emit('coinbattle:timer-update', {
        elapsed,
        remaining,
        total: this.matchDuration
      });

      // Check for auto-extension
      if (remaining === 0 && this.config.autoExtension) {
        const teamScores = this.currentMatch.mode === 'team' 
          ? this.db.getTeamScores(this.currentMatch.id)
          : null;

        if (teamScores) {
          const difference = Math.abs(teamScores.red - teamScores.blue);
          if (difference < this.config.extensionThreshold) {
            this.extendMatch(this.config.extensionDuration);
            return;
          }
        }
      }

      // Match end
      if (remaining === 0) {
        this.stopTimer();
        setTimeout(() => {
          this.endMatch();
        }, 1000);
      }
    }, 1000);
  }

  /**
   * Stop timer
   */
  stopTimer() {
    if (this.matchTimer) {
      clearInterval(this.matchTimer);
      this.matchTimer = null;
    }
  }

  /**
   * Clear the active multiplier timeout and reset multiplier state.
   */
  clearMultiplierTimer() {
    if (this.multiplierTimer) {
      clearTimeout(this.multiplierTimer);
      this.multiplierTimer = null;
    }

    this.activeMultiplier = 1.0;
    this.multiplierEndTime = null;
  }

  /**
   * Notify internal match-ended subscribers.
   */
  notifyMatchEnded(payload) {
    for (const handler of this.matchEndedHandlers) {
      try {
        const result = handler(payload);
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            this.logger.error(`Match-ended handler failed: ${error.message}`);
          });
        }
      } catch (error) {
        this.logger.error(`Match-ended handler failed: ${error.message}`);
      }
    }
  }

  /**
   * Add a player to the active match without requiring an immediate gift.
   */
  addPlayerToMatch(userId, nickname, uniqueId = null, profilePictureUrl = null) {
    if (!this.currentMatch) {
      throw new Error('No active match');
    }

    const player = this.db.getOrCreatePlayer({
      userId,
      uniqueId: uniqueId || nickname,
      nickname,
      profilePictureUrl
    });

    let team = null;
    if (this.currentMatch.mode === 'team') {
      team = this.assignTeam(userId, player.id);
    }

    this.db.addMatchParticipant(this.currentMatch.id, player.id, userId, team);

    if (!this.players.has(userId)) {
      this.players.set(userId, {
        userId,
        uniqueId: uniqueId || nickname,
        nickname,
        profilePictureUrl,
        coins: 0,
        gifts: 0,
        team
      });
    }

    return player;
  }

  /**
   * Process gift event with idempotency
   */
  processGift(giftData, userData, eventId = null) {
    if (!this.currentMatch) {
      // Auto-start if enabled
      if (this.config.autoStart) {
        this.startMatch();
      } else {
        return null;
      }
    }

    if (this.isPaused) {
      this.logger.warn('Gift received while match is paused');
      return null;
    }

    // Generate event identifiers for idempotency
    const generatedEventId = eventId || `evt_${this.currentMatch.id}_${userData.userId}_${giftData.giftId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const repeatCount = giftData.repeatCount || 1;
    const idempotencyKey = eventId
      ? `gift_${this.currentMatch.id}_${eventId}`
      : `gift_${this.currentMatch.id}_${userData.userId}_${giftData.giftId}_${repeatCount}_${giftData.diamondCount || giftData.coins}_${Date.now()}`;

    // Check if event already processed (deduplication)
    if (this.db.isEventProcessed(generatedEventId, idempotencyKey)) {
      this.logger.warn(`Duplicate event detected and rejected: ${generatedEventId}`);
      return { duplicate: true, eventId: generatedEventId };
    }

    // Mark event as being processed (atomic operation)
    this.db.markEventProcessed(generatedEventId, idempotencyKey, this.currentMatch.id, userData.userId, 3600);

    try {
      // Get or create player
      const player = this.db.getOrCreatePlayer({
        userId: userData.userId,
        uniqueId: userData.uniqueId,
        nickname: userData.nickname,
        profilePictureUrl: userData.profilePictureUrl
      });

      // Assign team if in team mode
      let team = null;
      if (this.currentMatch.mode === 'team') {
        team = this.assignTeam(userData.userId, player.id);
      }

      // Add to match participants
      this.db.addMatchParticipant(this.currentMatch.id, player.id, userData.userId, team);

      // Calculate coins with multiplier
      // Use coins field which includes repeatCount (diamondCount * repeatCount)
      const coins = giftData.coins || giftData.diamondCount || 1;
      const multipliedCoins = Math.floor(coins * this.activeMultiplier);

      // Record gift event with idempotency keys
      const recorded = this.db.recordGiftEvent(
        this.currentMatch.id,
        player.id,
        userData.userId,
        {
          giftId: giftData.giftId,
          giftName: giftData.giftName,
          coins: coins
        },
        team,
        this.activeMultiplier,
        generatedEventId,
        idempotencyKey
      );

      if (!recorded) {
        this.logger.warn(`Event was duplicate in recordGiftEvent: ${generatedEventId}`);
        return { duplicate: true, eventId: generatedEventId };
      }

      // Update in-memory player data
      if (!this.players.has(userData.userId)) {
        this.players.set(userData.userId, {
          ...userData,
          coins: 0,
          gifts: 0,
          team
        });
      }

      const playerData = this.players.get(userData.userId);
      playerData.coins += multipliedCoins;
      playerData.gifts += 1;

      // Emit gift event
      this.io.emit('coinbattle:gift-received', {
        player: playerData,
        gift: giftData,
        coins: multipliedCoins,
        multiplier: this.activeMultiplier,
        team,
        eventId: generatedEventId
      });

      // Update leaderboard
      this.emitLeaderboard();

      return { player: playerData, coins: multipliedCoins, eventId: generatedEventId, duplicate: false };
    } catch (error) {
      this.logger.error(`Error processing gift: ${error.message}`);
      // Event failed to process, but cache entry prevents retry
      throw error;
    }
  }

  /**
   * Assign team to player
   */
  assignTeam(userId, playerId) {
    // Check if player already has a team in this match
    const participant = this.db.getRawDb().prepare(`
      SELECT team FROM coinbattle_match_participants
      WHERE match_id = ? AND player_id = ?
    `).get(this.currentMatch.id, playerId);

    if (participant && participant.team) {
      return participant.team;
    }

    let team;
    switch (this.config.teamAssignment) {
      case 'random':
        team = Math.random() < 0.5 ? 'red' : 'blue';
        break;
      case 'alternate':
        team = this.teams.red.size <= this.teams.blue.size ? 'red' : 'blue';
        break;
      default:
        team = 'red'; // Default
    }

    this.teams[team].add(userId);
    return team;
  }

  /**
   * Activate multiplier event
   */
  activateMultiplier(multiplier, duration, activatedBy = null) {
    if (!this.currentMatch) {
      throw new Error('No active match');
    }

    if (!this.config.enableMultipliers) {
      throw new Error('Multipliers are disabled');
    }

    this.activeMultiplier = multiplier;
    this.multiplierEndTime = Date.now() + (duration * 1000);

    // Record in database
    this.db.recordMultiplierEvent(this.currentMatch.id, multiplier, duration, activatedBy);

    // Clear existing timer
    if (this.multiplierTimer) {
      clearTimeout(this.multiplierTimer);
    }

    // Set timer to reset multiplier
    const matchId = this.currentMatch.id;
    this.multiplierTimer = setTimeout(() => {
      this.activeMultiplier = 1.0;
      this.multiplierEndTime = null;
      this.multiplierTimer = null;
      this.io.emit('coinbattle:multiplier-ended', {
        matchId
      });
    }, duration * 1000);

    // Emit multiplier event
    this.io.emit('coinbattle:multiplier-activated', {
      matchId: this.currentMatch.id,
      multiplier,
      duration,
      endTime: this.multiplierEndTime,
      activatedBy
    });

    this.logger.info(`Multiplier activated: ${multiplier}x for ${duration}s`);
    return true;
  }

  /**
   * Emit current leaderboard
   */
  emitLeaderboard() {
    if (!this.currentMatch) return;

    const leaderboard = this.db.getMatchLeaderboard(this.currentMatch.id, 10);
    const teamScores = this.currentMatch.mode === 'team' 
      ? this.db.getTeamScores(this.currentMatch.id)
      : null;

    this.io.emit('coinbattle:leaderboard-update', {
      matchId: this.currentMatch.id,
      leaderboard,
      teamScores,
      mode: this.currentMatch.mode
    });
  }

  /**
   * Return current match leaderboard for integrations.
   */
  getLeaderboard(limit = 10) {
    if (!this.currentMatch) {
      return [];
    }

    return this.db.getMatchLeaderboard(this.currentMatch.id, limit);
  }

  /**
   * Emit current match state
   */
  emitMatchState() {
    const state = this.getMatchState();
    this.io.emit('coinbattle:match-state', state);
  }

  /**
   * Get current match state
   */
  getMatchState() {
    if (!this.currentMatch) {
      const state = {
        active: false,
        match: null,
        leaderboard: [],
        teamScores: null,
        config: this.config
      };
      return this.stateAugmenter ? this.stateAugmenter(state) : state;
    }

    const elapsed = Math.floor((Date.now() - this.matchStartTime - this.totalPausedTime) / 1000);
    const remaining = Math.max(0, this.matchDuration - elapsed);

    const state = {
      active: true,
      match: {
        ...this.currentMatch,
        startTime: this.matchStartTime,
        elapsed,
        remaining,
        isPaused: this.isPaused
      },
      leaderboard: this.db.getMatchLeaderboard(this.currentMatch.id, 10),
      teamScores: this.currentMatch.mode === 'team' 
        ? this.db.getTeamScores(this.currentMatch.id)
        : null,
      multiplier: {
        active: this.activeMultiplier > 1.0,
        value: this.activeMultiplier,
        endTime: this.multiplierEndTime
      },
      config: this.config
    };
    return this.stateAugmenter ? this.stateAugmenter(state) : state;
  }

  /**
   * Start offline simulation mode
   */
  startSimulation() {
    if (this.simulationInterval) {
      this.stopSimulation();
    }

    // Create fake players
    this.simulationPlayers = [
      { userId: 'sim_1', uniqueId: 'simuser1', nickname: 'SimPlayer1', profilePictureUrl: null },
      { userId: 'sim_2', uniqueId: 'simuser2', nickname: 'SimPlayer2', profilePictureUrl: null },
      { userId: 'sim_3', uniqueId: 'simuser3', nickname: 'SimPlayer3', profilePictureUrl: null },
      { userId: 'sim_4', uniqueId: 'simuser4', nickname: 'SimPlayer4', profilePictureUrl: null },
      { userId: 'sim_5', uniqueId: 'simuser5', nickname: 'SimPlayer5', profilePictureUrl: null }
    ];

    // Start match if not active
    if (!this.currentMatch) {
      this.startMatch();
    }

    // Generate random gifts
    this.simulationInterval = setInterval(() => {
      const randomPlayer = this.simulationPlayers[Math.floor(Math.random() * this.simulationPlayers.length)];
      const randomCoins = Math.floor(Math.random() * 100) + 1;
      const randomGiftId = Math.floor(Math.random() * 10) + 1;

      this.processGift({
        giftId: randomGiftId,
        giftName: `Gift ${randomGiftId}`,
        diamondCount: randomCoins,
        coins: randomCoins
      }, randomPlayer);
    }, 2000);

    this.config.enableOfflineSimulation = true;
    this.logger.info('Offline simulation started');
    
    // Emit state update to notify UI
    this.emitMatchState();
  }

  /**
   * Stop offline simulation
   */
  stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    this.config.enableOfflineSimulation = false;
    this.logger.info('Offline simulation stopped');
    
    // Emit state update to notify UI
    this.emitMatchState();
  }

  /**
   * Calculate XP rewards for match participants based on placement
   * @param {Array} leaderboard - Match leaderboard with player data
   * @param {string} mode - Match mode ('solo' or 'team')
   * @param {object} winnerData - Winner information
   * @returns {Array} Winners with XP amounts
   */
  calculateMatchXPRewards(leaderboard, mode, winnerData) {
    const winnersWithXP = [];
    
    // XP rewards based on placement (top 5)
    const XP_REWARDS = {
      1: 100,  // 1st place
      2: 75,   // 2nd place
      3: 50,   // 3rd place
      4: 30,   // 4th place
      5: 20    // 5th place
    };
    
    // Bonus XP for team wins
    const TEAM_WIN_BONUS = 25;
    
    if (mode === 'team') {
      // In team mode, all members of winning team get XP based on their contribution
      const winningTeam = winnerData.winner_team;
      
      // Get winning team members sorted by coins
      const winningTeamMembers = leaderboard.filter(p => p.team === winningTeam);
      
      winningTeamMembers.forEach((player, teamIndex) => {
        const teamPlacement = teamIndex + 1;
        const baseXP = XP_REWARDS[teamPlacement] || 10; // Base XP for team placement
        const teamBonus = TEAM_WIN_BONUS;
        const totalXP = baseXP + teamBonus;
        
        winnersWithXP.push({
          userId: player.user_id,
          uniqueId: player.unique_id,
          nickname: player.nickname,
          profilePictureUrl: player.profile_picture_url,
          placement: teamPlacement,
          team: player.team,
          coins: player.coins,
          xp: totalXP,
          reason: 'team_win'
        });
      });
    } else {
      // In solo mode, top 5 get XP based on placement
      const top5 = leaderboard.slice(0, 5);
      
      top5.forEach((player, index) => {
        const placement = index + 1;
        const xp = XP_REWARDS[placement];
        
        winnersWithXP.push({
          userId: player.user_id,
          uniqueId: player.unique_id,
          nickname: player.nickname,
          profilePictureUrl: player.profile_picture_url,
          placement,
          coins: player.coins,
          xp,
          reason: 'match_placement'
        });
      });
    }
    
    return winnersWithXP;
  }

  /**
   * Calculate total post-match display duration
   */
  calculatePostMatchDuration() {
    if (!this.config.postMatch) {
      return 0;
    }
    
    let totalDuration = 0;
    
    // Add winner credits duration
    if (this.config.postMatch.showWinnerCredits) {
      totalDuration += this.config.postMatch.winnerCreditsDuration || DEFAULT_WINNER_CREDITS_DURATION;
    }
    
    // Add leaderboard display duration (each leaderboard type)
    if (this.config.postMatch.showLeaderboard && this.config.postMatch.leaderboardTypes) {
      const numLeaderboards = this.config.postMatch.leaderboardTypes?.length || 0;
      const durationPerLeaderboard = this.config.postMatch.leaderboardDuration || DEFAULT_LEADERBOARD_DURATION;
      totalDuration += numLeaderboards * durationPerLeaderboard;
    }
    
    return totalDuration;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopTimer();
    this.stopSimulation();
    if (this.multiplierTimer) {
      clearTimeout(this.multiplierTimer);
      this.multiplierTimer = null;
    }
    if (this.autoResetTimeout) {
      clearTimeout(this.autoResetTimeout);
      this.autoResetTimeout = null;
    }
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    this.matchEndedHandlers.clear();
  }
}

module.exports = CoinBattleEngine;
