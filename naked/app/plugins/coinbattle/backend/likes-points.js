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
    
    Object.keys(newConfig).forEach(key => {
      if (validKeys.includes(key)) {
        this.config[key] = newConfig[key];
      }
    });
    
    return this.saveConfig();
  }

  /**
   * Process like event
   */
  processLikeEvent(matchId, userId, likeCount = 1) {
    if (!this.config.enabled || this.config.likesPerPoint === 0) {
      return { success: false, points: 0 };
    }
    
    const points = likeCount / this.config.likesPerPoint;
    
    if (points > 0) {
      this.recordEvent(matchId, userId, 'like', likeCount, points);
      this.stats.totalLikesProcessed += likeCount;
      this.stats.totalPointsFromLikes += points;
      
      this.logger.debug(`Awarded ${points} points for ${likeCount} likes to user ${userId}`);
      return { success: true, points, eventType: 'like' };
    }
    
    return { success: false, points: 0 };
  }

  /**
   * Process share event
   */
  processShareEvent(matchId, userId, shareCount = 1) {
    if (!this.config.enabled || this.config.sharesPerPoint === 0) {
      return { success: false, points: 0 };
    }
    
    const points = shareCount / this.config.sharesPerPoint;
    
    if (points > 0) {
      this.recordEvent(matchId, userId, 'share', shareCount, points);
      this.stats.totalSharesProcessed += shareCount;
      this.stats.totalPointsFromShares += points;
      
      this.logger.debug(`Awarded ${points} points for ${shareCount} shares to user ${userId}`);
      return { success: true, points, eventType: 'share' };
    }
    
    return { success: false, points: 0 };
  }

  /**
   * Process follow event
   */
  processFollowEvent(matchId, userId) {
    if (!this.config.enabled || this.config.followsPerPoint === 0) {
      return { success: false, points: 0 };
    }
    
    const points = 1 / this.config.followsPerPoint;
    
    if (points > 0) {
      this.recordEvent(matchId, userId, 'follow', 1, points);
      this.stats.totalFollowsProcessed += 1;
      this.stats.totalPointsFromFollows += points;
      
      this.logger.debug(`Awarded ${points} points for follow to user ${userId}`);
      return { success: true, points, eventType: 'follow' };
    }
    
    return { success: false, points: 0 };
  }

  /**
   * Process comment event
   */
  processCommentEvent(matchId, userId) {
    if (!this.config.enabled || this.config.commentsPerPoint === 0) {
      return { success: false, points: 0 };
    }
    
    const points = 1 / this.config.commentsPerPoint;
    
    if (points > 0) {
      this.recordEvent(matchId, userId, 'comment', 1, points);
      this.stats.totalCommentsProcessed += 1;
      this.stats.totalPointsFromComments += points;
      
      this.logger.debug(`Awarded ${points} points for comment to user ${userId}`);
      return { success: true, points, eventType: 'comment' };
    }
    
    return { success: false, points: 0 };
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
