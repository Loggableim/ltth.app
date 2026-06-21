/**
 * Delta Encoder for Socket Events
 * Sends only changed data instead of full payloads
 * Performance Optimization #10
 */

class DeltaEncoder {
  constructor(logger = console) {
    this.logger = logger;
    
    // Store last sent state per connection
    this.lastStates = new Map();
    
    // Statistics
    this.stats = {
      fullUpdates: 0,
      deltaUpdates: 0,
      bytesFullUpdate: 0,
      bytesDeltaUpdate: 0,
      compressionRatio: 0
    };
    
    this.logger.info('🔄 DeltaEncoder initialized');
  }

  /**
   * Encode state update (full or delta)
   */
  encode(connectionId, newState) {
    const lastState = this.lastStates.get(connectionId);
    
    if (!lastState) {
      // First time - send full state
      this.lastStates.set(connectionId, this.cloneState(newState));
      
      const size = JSON.stringify(newState).length;
      this.stats.fullUpdates++;
      this.stats.bytesFullUpdate += size;
      
      return {
        type: 'full',
        data: newState,
        compressed: false,
        size
      };
    }
    
    // Compute delta
    const delta = this.computeDelta(lastState, newState);
    
    // Check if delta is worth it
    const fullSize = JSON.stringify(newState).length;
    const deltaSize = JSON.stringify(delta).length;
    
    if (deltaSize < fullSize * 0.5) {
      // Delta is beneficial
      this.lastStates.set(connectionId, this.cloneState(newState));
      
      this.stats.deltaUpdates++;
      this.stats.bytesDeltaUpdate += deltaSize;
      this.updateCompressionRatio();
      
      return {
        type: 'delta',
        data: delta,
        compressed: true,
        size: deltaSize,
        savedBytes: fullSize - deltaSize
      };
    } else {
      // Full update is more efficient
      this.lastStates.set(connectionId, this.cloneState(newState));
      
      this.stats.fullUpdates++;
      this.stats.bytesFullUpdate += fullSize;
      
      return {
        type: 'full',
        data: newState,
        compressed: false,
        size: fullSize
      };
    }
  }

  /**
   * Compute delta between two states
   */
  computeDelta(oldState, newState) {
    const delta = {
      timestamp: newState.timestamp || Date.now()
    };
    
    // Match status changes
    if (newState.active !== oldState.active) {
      delta.active = newState.active;
    }
    
    if (newState.status !== oldState.status) {
      delta.status = newState.status;
    }
    
    // Match data changes
    if (newState.match) {
      delta.match = this.computeObjectDelta(oldState.match, newState.match);
    }
    
    // Leaderboard changes (most important optimization)
    if (newState.leaderboard && oldState.leaderboard) {
      delta.leaderboard = this.computeLeaderboardDelta(
        oldState.leaderboard,
        newState.leaderboard
      );
    } else if (newState.leaderboard) {
      delta.leaderboard = { full: newState.leaderboard };
    }
    
    // Team scores changes
    if (newState.teamScores && oldState.teamScores) {
      delta.teamScores = this.computeObjectDelta(oldState.teamScores, newState.teamScores);
    } else if (newState.teamScores) {
      delta.teamScores = newState.teamScores;
    }
    
    // Multiplier changes
    if (newState.multiplier && oldState.multiplier) {
      delta.multiplier = this.computeObjectDelta(oldState.multiplier, newState.multiplier);
    } else if (newState.multiplier) {
      delta.multiplier = newState.multiplier;
    }
    
    return delta;
  }

  /**
   * Compute delta for leaderboard array
   */
  computeLeaderboardDelta(oldLeaderboard, newLeaderboard) {
    const delta = {
      updated: [],
      removed: [],
      added: []
    };
    
    // Create maps for faster lookup
    const oldMap = new Map(oldLeaderboard.map(p => [p.userId, p]));
    const newMap = new Map(newLeaderboard.map(p => [p.userId, p]));
    
    // Find updated and added players
    for (const newPlayer of newLeaderboard) {
      const oldPlayer = oldMap.get(newPlayer.userId);
      
      if (!oldPlayer) {
        // New player
        delta.added.push(newPlayer);
      } else {
        // Check if player data changed
        if (this.hasPlayerChanged(oldPlayer, newPlayer)) {
          delta.updated.push({
            userId: newPlayer.userId,
            changes: this.getPlayerChanges(oldPlayer, newPlayer)
          });
        }
      }
    }
    
    // Find removed players
    for (const oldPlayer of oldLeaderboard) {
      if (!newMap.has(oldPlayer.userId)) {
        delta.removed.push(oldPlayer.userId);
      }
    }
    
    // If delta is small, return it; otherwise send full leaderboard
    const deltaEntries = delta.updated.length + delta.removed.length + delta.added.length;
    if (deltaEntries > newLeaderboard.length * 0.7) {
      // Too many changes, send full leaderboard
      return { full: newLeaderboard };
    }
    
    return delta;
  }

  /**
   * Check if player data has changed
   */
  hasPlayerChanged(oldPlayer, newPlayer) {
    return (
      oldPlayer.coins !== newPlayer.coins ||
      oldPlayer.gifts !== newPlayer.gifts ||
      oldPlayer.rank !== newPlayer.rank ||
      oldPlayer.team !== newPlayer.team
    );
  }

  /**
   * Get specific changes in player data
   */
  getPlayerChanges(oldPlayer, newPlayer) {
    const changes = {};
    
    if (oldPlayer.coins !== newPlayer.coins) {
      changes.coins = newPlayer.coins;
      changes.coinsDelta = newPlayer.coins - oldPlayer.coins;
    }
    
    if (oldPlayer.gifts !== newPlayer.gifts) {
      changes.gifts = newPlayer.gifts;
    }
    
    if (oldPlayer.rank !== newPlayer.rank) {
      changes.rank = newPlayer.rank;
      changes.rankDelta = oldPlayer.rank - newPlayer.rank; // Positive = moved up
    }
    
    if (oldPlayer.team !== newPlayer.team) {
      changes.team = newPlayer.team;
    }
    
    return changes;
  }

  /**
   * Compute delta for generic objects
   */
  computeObjectDelta(oldObj, newObj) {
    if (!oldObj) return newObj;
    if (!newObj) return null;
    
    const delta = {};
    
    for (const key in newObj) {
      if (newObj[key] !== oldObj[key]) {
        delta[key] = newObj[key];
      }
    }
    
    return Object.keys(delta).length > 0 ? delta : null;
  }

  /**
   * Clone state for storage
   */
  cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Update compression ratio
   */
  updateCompressionRatio() {
    const totalBytes = this.stats.bytesFullUpdate + this.stats.bytesDeltaUpdate;
    const savedBytes = this.stats.bytesFullUpdate - this.stats.bytesDeltaUpdate;
    
    if (totalBytes > 0) {
      this.stats.compressionRatio = ((savedBytes / totalBytes) * 100).toFixed(1);
    }
  }

  /**
   * Clear state for a connection
   */
  clearConnection(connectionId) {
    return this.lastStates.delete(connectionId);
  }

  /**
   * Clear all states
   */
  clearAll() {
    const size = this.lastStates.size;
    this.lastStates.clear();
    this.logger.info(`🔄 Cleared ${size} connection states`);
  }

  /**
   * Get statistics
   */
  getStats() {
    const totalUpdates = this.stats.fullUpdates + this.stats.deltaUpdates;
    const deltaPercentage = totalUpdates > 0
      ? ((this.stats.deltaUpdates / totalUpdates) * 100).toFixed(1)
      : '0.0';
    
    const avgFullSize = this.stats.fullUpdates > 0
      ? Math.round(this.stats.bytesFullUpdate / this.stats.fullUpdates)
      : 0;
    
    const avgDeltaSize = this.stats.deltaUpdates > 0
      ? Math.round(this.stats.bytesDeltaUpdate / this.stats.deltaUpdates)
      : 0;
    
    return {
      ...this.stats,
      totalUpdates,
      deltaPercentage: deltaPercentage + '%',
      averageFullSize: avgFullSize + ' bytes',
      averageDeltaSize: avgDeltaSize + ' bytes',
      compressionRatio: this.stats.compressionRatio + '%',
      activeConnections: this.lastStates.size
    };
  }

  /**
   * Get bandwidth savings
   */
  getBandwidthSavings() {
    const totalBytesSaved = this.stats.bytesFullUpdate - this.stats.bytesDeltaUpdate;
    
    return {
      bytesSaved: totalBytesSaved,
      kilobytesSaved: (totalBytesSaved / 1024).toFixed(2),
      megabytesSaved: (totalBytesSaved / 1024 / 1024).toFixed(2)
    };
  }

  /**
   * Destroy the encoder
   */
  destroy() {
    this.lastStates.clear();
    this.logger.info('🔄 DeltaEncoder destroyed');
  }
}

module.exports = DeltaEncoder;
