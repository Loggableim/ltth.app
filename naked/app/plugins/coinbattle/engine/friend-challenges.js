/**
 * Friend Challenge System
 * Chat-based challenges: "challenge@username"
 * Integrates with GCCE for command parsing
 */

class FriendChallengeSystem {
  constructor(database, socketIO, gameEngine, logger = console) {
    this.db = database;
    this.io = socketIO;
    this.gameEngine = gameEngine;
    this.logger = logger;
    
    // Active challenges
    this.pendingChallenges = new Map(); // challengeId -> challenge data
    this.activeChallenges = new Map(); // challengeId -> active match
    this.expirationTimers = new Map(); // challengeId -> timeout
    
    // Configuration
    this.config = {
      acceptTimeout: 30000, // 30 seconds to accept
      minStake: 10, // Minimum coins to stake
      maxStake: 1000, // Maximum coins to stake
      matchDuration: 120, // 2 minutes
      enableGCCEIntegration: true
    };
    
    // Statistics
    this.stats = {
      totalChallenges: 0,
      acceptedChallenges: 0,
      declinedChallenges: 0,
      expiredChallenges: 0,
      completedMatches: 0
    };
    
    this.logger.info('🤝 Friend Challenge System initialized');
  }

  /**
   * Register GCCE commands
   */
  registerGCCECommands(gcceRegistry) {
    if (!this.config.enableGCCEIntegration || !gcceRegistry) {
      return false;
    }
    
    try {
      // Register /challenge command
      gcceRegistry.registerCommand({
        pluginId: 'coinbattle',
        name: 'challenge',
        description: 'Challenge another player to a 1v1 CoinBattle',
        syntax: '/challenge @username [stake]',
        permission: 'all',
        enabled: true,
        minArgs: 1,
        maxArgs: 2,
        category: 'Game',
        handler: async (args, context) => await this.handleChallengeCommand(args, context)
      });
      
      // Register /accept command
      gcceRegistry.registerCommand({
        pluginId: 'coinbattle',
        name: 'accept',
        description: 'Accept a pending challenge',
        syntax: '/accept',
        permission: 'all',
        enabled: true,
        minArgs: 0,
        maxArgs: 0,
        category: 'Game',
        handler: async (args, context) => await this.handleAcceptCommand(args, context)
      });
      
      // Register /decline command
      gcceRegistry.registerCommand({
        pluginId: 'coinbattle',
        name: 'decline',
        description: 'Decline a pending challenge',
        syntax: '/decline',
        permission: 'all',
        enabled: true,
        minArgs: 0,
        maxArgs: 0,
        category: 'Game',
        handler: async (args, context) => await this.handleDeclineCommand(args, context)
      });
      
      this.logger.info('🤝 GCCE commands registered for Friend Challenges');
      return true;
    } catch (error) {
      this.logger.error(`Failed to register GCCE commands: ${error.message}`);
      return false;
    }
  }

  /**
   * Handle /challenge command from GCCE
   */
  async handleChallengeCommand(args, context) {
    const challenger = context.user;
    const targetUsername = args[0].replace('@', '');
    const stake = args[1] ? parseInt(args[1]) : this.config.minStake;
    
    // Validate stake
    if (stake < this.config.minStake || stake > this.config.maxStake) {
      return {
        success: false,
        message: `Stake must be between ${this.config.minStake} and ${this.config.maxStake} coins`
      };
    }
    
    // Create challenge
    const challenge = await this.createChallenge(
      challenger.userId,
      challenger.nickname,
      targetUsername,
      stake
    );
    
    if (challenge.success) {
      return {
        success: true,
        message: `Challenge sent to @${targetUsername}! They have ${this.config.acceptTimeout / 1000}s to accept.`
      };
    } else {
      return {
        success: false,
        message: challenge.error
      };
    }
  }

  /**
   * Handle /accept command from GCCE
   */
  async handleAcceptCommand(args, context) {
    const accepter = context.user;
    
    // Find pending challenge for this user
    let targetChallenge = null;
    for (const [id, challenge] of this.pendingChallenges) {
      if (challenge.targetUsername.toLowerCase() === accepter.nickname.toLowerCase()) {
        targetChallenge = { id, ...challenge };
        break;
      }
    }
    
    if (!targetChallenge) {
      return {
        success: false,
        message: 'No pending challenge found for you'
      };
    }
    
    // Accept challenge
    const result = await this.acceptChallenge(targetChallenge.id, accepter.userId, accepter.nickname);
    
    if (result.success) {
      return {
        success: true,
        message: `Challenge accepted! 1v1 match starting now!`
      };
    } else {
      return {
        success: false,
        message: result.error
      };
    }
  }

  /**
   * Handle /decline command from GCCE
   */
  async handleDeclineCommand(args, context) {
    const decliner = context.user;
    
    // Find pending challenge for this user
    let targetChallenge = null;
    for (const [id, challenge] of this.pendingChallenges) {
      if (challenge.targetUsername.toLowerCase() === decliner.nickname.toLowerCase()) {
        targetChallenge = { id, ...challenge };
        break;
      }
    }
    
    if (!targetChallenge) {
      return {
        success: false,
        message: 'No pending challenge found for you'
      };
    }
    
    // Decline challenge
    this.declineChallenge(targetChallenge.id);
    
    return {
      success: true,
      message: 'Challenge declined'
    };
  }

  /**
   * Create a new challenge (also works with chat pattern: challenge@user)
   */
  async createChallenge(challengerUserId, challengerNickname, targetUsername, stake = 10) {
    const normalizedStake = Math.floor(Number(stake));
    if (!Number.isFinite(normalizedStake) ||
        normalizedStake < this.config.minStake ||
        normalizedStake > this.config.maxStake) {
      return {
        success: false,
        error: `Stake must be between ${this.config.minStake} and ${this.config.maxStake} coins`
      };
    }

    // Check if challenger has enough coins
    const challengerCoins = this.db.getPlayerCoins(challengerUserId);
    if (challengerCoins < normalizedStake) {
      return {
        success: false,
        error: 'Insufficient coins for stake'
      };
    }
    
    // Check if user is already in a challenge
    for (const challenge of this.pendingChallenges.values()) {
      if (challenge.challengerUserId === challengerUserId || 
          challenge.targetUsername.toLowerCase() === challengerNickname.toLowerCase()) {
        return {
          success: false,
          error: 'Already in a pending challenge'
        };
      }
    }
    
    // Create challenge
    const challengeId = `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const challenge = {
      challengeId,
      challengerUserId,
      challengerNickname,
      targetUsername,
      stake: normalizedStake,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.acceptTimeout,
      status: 'pending'
    };
    
    this.pendingChallenges.set(challengeId, challenge);
    this.stats.totalChallenges++;
    
    // Set expiration timer
    const expirationTimer = setTimeout(() => {
      if (this.pendingChallenges.has(challengeId)) {
        this.expireChallenge(challengeId);
      }
    }, this.config.acceptTimeout);
    if (typeof expirationTimer.unref === 'function') {
      expirationTimer.unref();
    }
    this.expirationTimers.set(challengeId, expirationTimer);
    
    // Emit challenge event
    this.io.emit('coinbattle:challenge-created', {
      challengeId,
      challenger: challengerNickname,
      target: targetUsername,
      stake: normalizedStake,
      expiresIn: this.config.acceptTimeout / 1000
    });
    
    this.logger.info(`🤝 Challenge created: ${challengerNickname} → ${targetUsername} (${stake} coins)`);
    
    return { success: true, challengeId };
  }

  /**
   * Accept a challenge
   */
  async acceptChallenge(challengeId, accepterUserId, accepterNickname) {
    const challenge = this.pendingChallenges.get(challengeId);
    
    if (!challenge) {
      return { success: false, error: 'Challenge not found or expired' };
    }
    
    // Check if accepter has enough coins
    const accepterCoins = this.db.getPlayerCoins(accepterUserId);
    if (accepterCoins < challenge.stake) {
      return { success: false, error: 'Insufficient coins for stake' };
    }

    const challengerDebit = this.db.deductPlayerCoins(challenge.challengerUserId, challenge.stake);
    if (!challengerDebit.success) {
      return { success: false, error: challengerDebit.error || 'Insufficient challenger stake' };
    }

    const accepterDebit = this.db.deductPlayerCoins(accepterUserId, challenge.stake);
    if (!accepterDebit.success) {
      this.db.addPlayerCoins(challenge.challengerUserId, challenge.stake);
      return { success: false, error: accepterDebit.error || 'Insufficient coins for stake' };
    }
    
    // Start 1v1 match
    try {
      const match = this.gameEngine.startMatch('1v1', this.config.matchDuration);
      
      // Add both players to match
      this.gameEngine.addPlayerToMatch(challenge.challengerUserId, challenge.challengerNickname);
      this.gameEngine.addPlayerToMatch(accepterUserId, accepterNickname);

      // Remove from pending
      this.pendingChallenges.delete(challengeId);
      this.clearExpirationTimer(challengeId);
      this.stats.acceptedChallenges++;
      
      // Store active challenge
      this.activeChallenges.set(challengeId, {
        ...challenge,
        accepterUserId,
        accepterNickname,
        matchId: match.id,
        startedAt: Date.now(),
        status: 'active'
      });
      
      // Emit match started event
      this.io.emit('coinbattle:challenge-accepted', {
        challengeId,
        matchId: match.id,
        player1: challenge.challengerNickname,
        player2: accepterNickname,
        stake: challenge.stake
      });
      
      this.logger.info(`🤝 Challenge accepted: ${challenge.challengerNickname} vs ${accepterNickname}`);
      
      return { success: true, matchId: match.id };
    } catch (error) {
      this.db.addPlayerCoins(challenge.challengerUserId, challenge.stake);
      this.db.addPlayerCoins(accepterUserId, challenge.stake);
      this.logger.error(`Failed to start challenge match: ${error.message}`);
      return { success: false, error: 'Failed to start match' };
    }
  }

  /**
   * Clear an expiration timer for a challenge.
   */
  clearExpirationTimer(challengeId) {
    const timer = this.expirationTimers.get(challengeId);
    if (timer) {
      clearTimeout(timer);
      this.expirationTimers.delete(challengeId);
    }
  }

  /**
   * Decline a challenge
   */
  declineChallenge(challengeId) {
    const challenge = this.pendingChallenges.get(challengeId);
    
    if (!challenge) {
      return false;
    }
    
    this.pendingChallenges.delete(challengeId);
    this.clearExpirationTimer(challengeId);
    this.stats.declinedChallenges++;
    
    // Emit declined event
    this.io.emit('coinbattle:challenge-declined', {
      challengeId,
      challenger: challenge.challengerNickname,
      target: challenge.targetUsername
    });
    
    this.logger.info(`🤝 Challenge declined: ${challengeId}`);
    return true;
  }

  /**
   * Expire a challenge
   */
  expireChallenge(challengeId) {
    const challenge = this.pendingChallenges.get(challengeId);
    
    if (!challenge) {
      return false;
    }
    
    this.pendingChallenges.delete(challengeId);
    this.clearExpirationTimer(challengeId);
    this.stats.expiredChallenges++;
    
    // Emit expired event
    this.io.emit('coinbattle:challenge-expired', {
      challengeId,
      challenger: challenge.challengerNickname,
      target: challenge.targetUsername
    });
    
    this.logger.info(`🤝 Challenge expired: ${challengeId}`);
    return true;
  }

  /**
   * Complete a challenge match
   */
  completeChallenge(matchId, winnerId) {
    // Find active challenge for this match
    let challengeData = null;
    for (const [id, challenge] of this.activeChallenges) {
      if (challenge.matchId === matchId) {
        challengeData = { id, ...challenge };
        break;
      }
    }
    
    if (!challengeData) {
      return false;
    }
    
    // Award stake to winner
    const totalStake = challengeData.stake * 2;
    this.db.addPlayerCoins(winnerId, totalStake);
    
    // Remove from active challenges
    this.activeChallenges.delete(challengeData.id);
    this.stats.completedMatches++;
    
    // Emit completion event
    this.io.emit('coinbattle:challenge-completed', {
      challengeId: challengeData.id,
      matchId,
      winnerId,
      winnerNickname: winnerId === challengeData.challengerUserId 
        ? challengeData.challengerNickname 
        : challengeData.accepterNickname,
      prize: totalStake
    });
    
    this.logger.info(`🤝 Challenge completed: ${challengeData.id} - Winner: ${winnerId}`);
    return true;
  }

  /**
   * Get challenge statistics
   */
  getStats() {
    return {
      ...this.stats,
      pendingChallenges: this.pendingChallenges.size,
      activeChallenges: this.activeChallenges.size
    };
  }

  /**
   * Destroy the system
   */
  destroy() {
    for (const timer of this.expirationTimers.values()) {
      clearTimeout(timer);
    }
    this.expirationTimers.clear();
    this.pendingChallenges.clear();
    this.activeChallenges.clear();
  }
}

module.exports = FriendChallengeSystem;
