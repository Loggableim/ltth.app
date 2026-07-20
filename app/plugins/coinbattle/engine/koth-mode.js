/**
 * King of the Hill Mode (Pyramid Mode)
 * Players compete to maintain the top position
 * The longer you stay at #1, the more bonus points you earn
 */

class KingOfTheHillMode {
  constructor(database, socketIO, logger = console) {
    this.db = database;
    this.io = socketIO;
    this.logger = logger;
    
    // Current king tracking
    this.currentKing = null;
    this.kingStartTime = null;
    this.active = false;
    this.currentReignBonusPaid = 0;
    this.kingDurations = new Map(); // userId -> total time as king
    this.crownTransfers = [];
    
    // Bonus system
    this.bonusConfig = {
      enabled: true,
      bonusPerSecond: 0.5, // Coins per second as king
      minimumTime: 10, // Min seconds before bonus starts
      maxBonus: 1000 // Max bonus per reign
    };
    
    // Pyramid visualization data
    this.pyramid = {
      levels: 5,
      positions: []
    };
    
    // Statistics
    this.stats = {
      totalCrownTransfers: 0,
      longestReign: { userId: null, duration: 0 },
      mostBonusEarned: { userId: null, bonus: 0 }
    };
    
    // Bonus interval timer
    this.bonusTimer = null;
    
    this.logger.info('👑 King of the Hill Mode initialized');
  }

  /**
   * Start KOTH mode for a match
   */
  start(matchId) {
    if (!matchId) {
      throw new Error('KOTH requires an active normal match');
    }

    if (this.bonusTimer) {
      clearInterval(this.bonusTimer);
      this.bonusTimer = null;
    }

    this.matchId = matchId;
    this.active = true;
    this.currentKing = null;
    this.kingStartTime = null;
    this.currentReignBonusPaid = 0;
    this.kingDurations.clear();
    this.crownTransfers = [];
    
    // Start bonus accumulation timer
    this.startBonusTimer();
    
    this.logger.info(`👑 KOTH mode started for match ${matchId}`);
  }

  /**
   * Update leaderboard and check for king change
   */
  updateLeaderboard(leaderboard) {
    if (!this.active) return null;
    if (!leaderboard || leaderboard.length === 0) {
      return null;
    }
    
    const newLeader = leaderboard[0];
    const currentLeaderId = newLeader.userId || newLeader.user_id;
    
    // Check if king changed
    if (!this.currentKing || this.currentKing.userId !== currentLeaderId) {
      return this.crownNewKing(newLeader);
    }
    
    return null;
  }

  /**
   * Crown a new king
   */
  crownNewKing(player) {
    const playerId = player.userId || player.user_id;
    const playerName = player.nickname || player.name;
    
    // Record old king's duration
    if (this.currentKing) {
      const reignDuration = Date.now() - this.kingStartTime;
      const oldKingId = this.currentKing.userId;
      
      // Add to total duration
      const currentDuration = this.kingDurations.get(oldKingId) || 0;
      const newDuration = currentDuration + reignDuration;
      this.kingDurations.set(oldKingId, newDuration);
      
      // Calculate final bonus for old king
      const bonus = Math.max(0, this.calculateBonus(reignDuration) - this.currentReignBonusPaid);
      if (bonus > 0) {
        this.awardBonus(oldKingId, bonus);
      }
      
      // Update longest reign stat
      if (reignDuration > this.stats.longestReign.duration) {
        this.stats.longestReign = {
          userId: oldKingId,
          duration: reignDuration
        };
      }
      
      // Record crown transfer
      this.crownTransfers.push({
        from: oldKingId,
        to: playerId,
        timestamp: Date.now(),
        oldKingDuration: reignDuration,
        bonus
      });
      
      this.stats.totalCrownTransfers++;
      
      // Emit dethroned event
      this.io.emit('coinbattle:king-dethroned', {
        oldKing: {
          userId: oldKingId,
          nickname: this.currentKing.nickname
        },
        duration: Math.floor(reignDuration / 1000),
        bonus
      });
    }
    
    // Crown new king
    const previousKingId = this.currentKing?.userId || null;
    this.currentKing = {
      userId: playerId,
      nickname: playerName,
      coins: player.coins || 0
    };
    this.kingStartTime = Date.now();
    this.currentReignBonusPaid = 0;
    
    // Emit crowned event
    this.io.emit('coinbattle:new-king', {
      king: {
        userId: playerId,
        nickname: playerName,
        coins: player.coins || 0
      },
      bonusRate: this.bonusConfig.bonusPerSecond
    });
    
    this.logger.info(`👑 ${playerName} is now King of the Hill!`);
    
    return {
      type: 'king_change',
      newKing: this.currentKing,
      oldKing: previousKingId
    };
  }

  /**
   * Calculate bonus for time as king
   */
  calculateBonus(durationMs) {
    const durationSeconds = durationMs / 1000;
    
    if (durationSeconds < this.bonusConfig.minimumTime) {
      return 0;
    }
    
    const bonus = Math.floor(
      (durationSeconds - this.bonusConfig.minimumTime) * this.bonusConfig.bonusPerSecond
    );
    
    return Math.min(bonus, this.bonusConfig.maxBonus);
  }

  /**
   * Award bonus to player
   */
  awardBonus(userId, bonus) {
    if (bonus <= 0) return;
    
    try {
      // KOTH bonus is gameplay score and must affect the active match.
      const changes = this.db.addMatchParticipantCoins
        ? this.db.addMatchParticipantCoins(this.matchId, userId, bonus)
        : 0;
      if (changes !== 1) {
        throw new Error(`KOTH participant ${userId} not found in match ${this.matchId}`);
      }

      this.currentReignBonusPaid += bonus;
      if (this.currentKing?.userId === userId) {
        this.currentKing.coins = (this.currentKing.coins || 0) + bonus;
      }
      
      // Update stats
      if (bonus > this.stats.mostBonusEarned.bonus) {
        this.stats.mostBonusEarned = { userId, bonus };
      }
      
      // Emit bonus event
      this.io.emit('coinbattle:king-bonus', {
        userId,
        bonus,
        reason: 'King of the Hill bonus'
      });
      
      this.logger.info(`👑 Awarded ${bonus} bonus coins to ${userId} for being King`);
    } catch (error) {
      this.logger.error(`Failed to award bonus: ${error.message}`);
    }
  }

  /**
   * Start bonus accumulation timer
   */
  startBonusTimer() {
    // Award micro-bonuses every second while someone is king
    this.bonusTimer = setInterval(() => {
      if (!this.currentKing || !this.kingStartTime) return;
      
      const reignDuration = Date.now() - this.kingStartTime;
      const totalBonus = this.calculateBonus(reignDuration);
      const delta = Math.max(0, totalBonus - this.currentReignBonusPaid);
      if (delta > 0) {
        try {
          this.awardBonus(this.currentKing.userId, delta);
          this.io.emit('coinbattle:king-live-bonus', {
            userId: this.currentKing.userId,
            bonus: delta,
            totalReign: Math.floor(reignDuration / 1000)
          });
        } catch (error) {
          this.logger.error(`Failed to award live bonus: ${error.message}`);
        }
      }
    }, 1000); // Every second
  }

  /**
   * Get pyramid visualization data
   */
  getPyramidData(leaderboard) {
    const pyramid = [];
    const levels = this.pyramid.levels;
    
    // Level 1 (King) - 1 player
    if (leaderboard.length > 0) {
      pyramid.push({
        level: 1,
        title: '👑 KING',
        players: [leaderboard[0]],
        isKing: true
      });
    }
    
    // Level 2 - 2 players
    if (leaderboard.length > 1) {
      pyramid.push({
        level: 2,
        title: 'Challengers',
        players: leaderboard.slice(1, 3),
        isKing: false
      });
    }
    
    // Level 3 - 3 players
    if (leaderboard.length > 3) {
      pyramid.push({
        level: 3,
        title: 'Contenders',
        players: leaderboard.slice(3, 6),
        isKing: false
      });
    }
    
    // Level 4 - 4 players
    if (leaderboard.length > 6) {
      pyramid.push({
        level: 4,
        title: 'Rising Stars',
        players: leaderboard.slice(6, 10),
        isKing: false
      });
    }
    
    // Level 5 - Rest
    if (leaderboard.length > 10) {
      pyramid.push({
        level: 5,
        title: 'Competitors',
        players: leaderboard.slice(10, 15),
        isKing: false
      });
    }
    
    return pyramid;
  }

  /**
   * Get KOTH statistics
   */
  getStats() {
    return {
      currentKing: this.currentKing,
      currentReign: this.currentKing 
        ? Math.floor((Date.now() - this.kingStartTime) / 1000)
        : 0,
      totalCrownTransfers: this.stats.totalCrownTransfers,
      longestReign: {
        ...this.stats.longestReign,
        durationSeconds: Math.floor(this.stats.longestReign.duration / 1000)
      },
      mostBonusEarned: this.stats.mostBonusEarned,
      active: this.active,
      kingDurations: Object.fromEntries(
        Array.from(this.kingDurations.entries()).map(([userId, duration]) => [
          userId,
          Math.floor(duration / 1000)
        ])
      )
    };
  }

  /**
   * End KOTH mode
   */
  end() {
    if (!this.active) {
      return null;
    }

    // Award final bonus to current king
    if (this.currentKing && this.kingStartTime) {
      const finalDuration = Date.now() - this.kingStartTime;
      const finalBonus = Math.max(0, this.calculateBonus(finalDuration) - this.currentReignBonusPaid);
      if (finalBonus > 0) {
        this.awardBonus(this.currentKing.userId, finalBonus);
      }
    }
    
    // Stop bonus timer
    if (this.bonusTimer) {
      clearInterval(this.bonusTimer);
      this.bonusTimer = null;
    }
    
    // Emit final stats while retaining the last king in the event payload.
    const finalStats = this.getStats();
    finalStats.active = false;

    this.active = false;
    this.currentKing = null;
    this.kingStartTime = null;
    this.currentReignBonusPaid = 0;

    this.io.emit('coinbattle:koth-ended', finalStats);

    return finalStats;
    
    this.logger.info('👑 KOTH mode ended');
  }

  /**
   * Destroy the mode
   */
  destroy() {
    this.end();
    this.kingDurations.clear();
    this.crownTransfers = [];
  }
}

module.exports = KingOfTheHillMode;
