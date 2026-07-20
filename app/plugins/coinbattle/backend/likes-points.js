/**
 * Likes as Points System
 * Configurable conversion of likes to match points
 */

class LikesPointsSystem {
  constructor(database, logger = console) {
    this.db = database;
    this.logger = logger;
    
    // Default configuration
    this.config = {
      enabled: false,
      coinsPerPoint: 1, // 1 point per 1 coin
      likesPerPoint: 100, // 1 point per 100 likes
      sharesPerPoint: 50, // 1 point per 50 shares
      followsPerPoint: 10, // 1 point per 10 follows
      commentsPerPoint: 25 // 1 point per 25 comments
    };
    
    // Statistics
    this.stats = {
      totalLikesProcessed: 0,
      totalSharesProcessed: 0,
      totalFollowsProcessed: 0,
      totalCommentsProcessed: 0,
      totalPointsFromLikes: 0,
      totalPointsFromShares: 0,
      totalPointsFromFollows: 0,
      totalPointsFromComments: 0
    };

    // Preserve fractional progress between separate interaction events.
    // Keys include the match, viewer, and event type so progress cannot leak
    // between matches or between likes/shares/follows/comments.
    this.remainders = new Map();
    
    this.logger.info('💕 Likes as Points System initialized');
  }

  /**
   * Initialize database table
   */
  initializeTable() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS coinbattle_likes_points_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER DEFAULT 0,
        coins_per_point REAL DEFAULT 1.0,
        likes_per_point INTEGER DEFAULT 100,
        shares_per_point INTEGER DEFAULT 50,
        follows_per_point INTEGER DEFAULT 10,
        comments_per_point INTEGER DEFAULT 25,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `).run();
    
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS coinbattle_likes_points_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_count INTEGER DEFAULT 1,
        points_awarded REAL DEFAULT 0,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (match_id) REFERENCES coinbattle_matches(id)
      )
    `).run();
    
    // Load configuration
    this.loadConfig();
  }

  /**
   * Load configuration from database
   */
  loadConfig() {
    try {
      const config = this.db.prepare(`
        SELECT * FROM coinbattle_likes_points_config WHERE id = 1
      `).get();
      
      if (config) {
        this.config = {
          enabled: config.enabled === 1,
          coinsPerPoint: config.coins_per_point,
          likesPerPoint: config.likes_per_point,
          sharesPerPoint: config.shares_per_point,
          followsPerPoint: config.follows_per_point,
          commentsPerPoint: config.comments_per_point
        };
      } else {
        // Insert default config
        this.saveConfig();
      }
      
    } catch (error) {
      this.logger.error(`Failed to load likes points config: ${error.message}`);
    }
  }

  /**
   * Save configuration to database
   */
  saveConfig() {
    try {
      this.db.prepare(`
        INSERT INTO coinbattle_likes_points_config 
        (id, enabled, coins_per_point, likes_per_point, shares_per_point, follows_per_point, comments_per_point)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          enabled = excluded.enabled,
          coins_per_point = excluded.coins_per_point,
          likes_per_point = excluded.likes_per_point,
          shares_per_point = excluded.shares_per_point,
          follows_per_point = excluded.follows_per_point,
          comments_per_point = excluded.comments_per_point,
          updated_at = strftime('%s', 'now')
      `).run(
        this.config.enabled ? 1 : 0,
        this.config.coinsPerPoint,
        this.config.likesPerPoint,
        this.config.sharesPerPoint,
        this.config.followsPerPoint,
        this.config.commentsPerPoint
      );
      
      this.logger.info('Likes points configuration saved');
      return { success: true };
      
    } catch (error) {
      this.logger.error(`Failed to save likes points config: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    const validKeys = ['enabled', 'coinsPerPoint', 'likesPerPoint', 'sharesPerPoint', 'followsPerPoint', 'commentsPerPoint'];

    Object.keys(newConfig || {}).forEach(key => {
      if (!validKeys.includes(key)) return;

      if (key === 'enabled') {
        this.config[key] = newConfig[key] === true || newConfig[key] === 1;
        return;
      }

      const value = Number(newConfig[key]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${key} must be a positive number`);
      }
      this.config[key] = value;
    });
    
    return this.saveConfig();
  }

  /**
   * Clear fractional interaction progress for a completed match.
   */
  clearMatch(matchId) {
    const prefix = `${matchId}:`;
    for (const key of this.remainders.keys()) {
      if (key.startsWith(prefix)) {
        this.remainders.delete(key);
      }
    }
  }

  /**
   * Convert a count event into whole gameplay points while retaining the
   * fractional remainder for the next event of the same type.
   */
  processCountEvent(matchId, userId, eventType, count, threshold, countStat, pointsStat) {
    if (!this.config.enabled) {
      return { success: false, points: 0 };
    }

    const safeCount = Number(count);
    const safeThreshold = Number(threshold);
    if (!Number.isFinite(safeCount) || safeCount <= 0 || !Number.isFinite(safeThreshold) || safeThreshold <= 0) {
      return { success: false, points: 0 };
    }

    const key = `${matchId}:${userId}:${eventType}`;
    const accumulated = (this.remainders.get(key) || 0) + safeCount;
    const points = Math.floor(accumulated / safeThreshold);
    this.remainders.set(key, accumulated - (points * safeThreshold));

    this.recordEvent(matchId, userId, eventType, safeCount, points);
    this.stats[countStat] += safeCount;
    this.stats[pointsStat] += points;

    this.logger.debug(`Awarded ${points} whole points for ${safeCount} ${eventType} events to user ${userId}`);
    return { success: true, points, eventType };
  }

  /**
   * Process like event
   */
  processLikeEvent(matchId, userId, likeCount = 1) {
    return this.processCountEvent(
      matchId,
      userId,
      'like',
      likeCount,
      this.config.likesPerPoint,
      'totalLikesProcessed',
      'totalPointsFromLikes'
    );
  }

  /**
   * Process share event
   */
  processShareEvent(matchId, userId, shareCount = 1) {
    return this.processCountEvent(
      matchId,
      userId,
      'share',
      shareCount,
      this.config.sharesPerPoint,
      'totalSharesProcessed',
      'totalPointsFromShares'
    );
  }

  /**
   * Process follow event
   */
  processFollowEvent(matchId, userId) {
    return this.processCountEvent(
      matchId,
      userId,
      'follow',
      1,
      this.config.followsPerPoint,
      'totalFollowsProcessed',
      'totalPointsFromFollows'
    );
  }

  /**
   * Process comment event
   */
  processCommentEvent(matchId, userId) {
    return this.processCountEvent(
      matchId,
      userId,
      'comment',
      1,
      this.config.commentsPerPoint,
      'totalCommentsProcessed',
      'totalPointsFromComments'
    );
  }

  /**
   * Record event in database
   */
  recordEvent(matchId, userId, eventType, eventCount, points) {
    try {
      this.db.prepare(`
        INSERT INTO coinbattle_likes_points_events 
        (match_id, user_id, event_type, event_count, points_awarded)
        VALUES (?, ?, ?, ?, ?)
      `).run(matchId, userId, eventType, eventCount, points);
    } catch (error) {
      this.logger.error(`Failed to record likes points event: ${error.message}`);
    }
  }

  /**
   * Get player points from likes/shares/etc for a match
   */
  getPlayerPointsForMatch(matchId, userId) {
    try {
      const result = this.db.prepare(`
        SELECT 
          SUM(points_awarded) as total_points,
          COUNT(*) as total_events
        FROM coinbattle_likes_points_events
        WHERE match_id = ? AND user_id = ?
      `).get(matchId, userId);
      
      return {
        totalPoints: result?.total_points || 0,
        totalEvents: result?.total_events || 0
      };
    } catch (error) {
      this.logger.error(`Failed to get player points: ${error.message}`);
      return { totalPoints: 0, totalEvents: 0 };
    }
  }

  /**
   * Get match statistics
   */
  getMatchStatistics(matchId) {
    try {
      const stats = this.db.prepare(`
        SELECT 
          event_type,
          SUM(event_count) as total_count,
          SUM(points_awarded) as total_points
        FROM coinbattle_likes_points_events
        WHERE match_id = ?
        GROUP BY event_type
      `).all(matchId);
      
      const result = {
        totalPoints: 0,
        byType: {}
      };
      
      stats.forEach(stat => {
        result.byType[stat.event_type] = {
          count: stat.total_count,
          points: stat.total_points
        };
        result.totalPoints += stat.total_points;
      });
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to get match statistics: ${error.message}`);
      return { totalPoints: 0, byType: {} };
    }
  }

  /**
   * Get configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      totalLikesProcessed: 0,
      totalSharesProcessed: 0,
      totalFollowsProcessed: 0,
      totalCommentsProcessed: 0,
      totalPointsFromLikes: 0,
      totalPointsFromShares: 0,
      totalPointsFromFollows: 0,
      totalPointsFromComments: 0
    };
  }
}

module.exports = LikesPointsSystem;
