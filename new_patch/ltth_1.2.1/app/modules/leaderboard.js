/**
 * Leaderboard Module
 *
 * Tracks and ranks viewers by:
 * - Total coins gifted
 * - Message count
 * - Likes given
 * - Shares
 */

const logger = require('./logger');

// Default streamer ID for backwards compatibility
const DEFAULT_STREAMER_ID = 'default';

class LeaderboardManager {
  constructor(db, io = null, streamerId = null) {
    this.db = db;
    this.io = io;
    this.streamerId = streamerId || DEFAULT_STREAMER_ID;
    this.initDatabase();
    this.sessionStart = Date.now();
  }

  /**
   * Set the streamer ID for scoped queries
   */
  setStreamerId(streamerId) {
    this.streamerId = streamerId;
  }

  /**
   * Initialize database tables
   */
  initDatabase() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS leaderboard_stats (
        username TEXT NOT NULL,
        streamer_id TEXT NOT NULL,
        total_coins INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        share_count INTEGER DEFAULT 0,
        gift_count INTEGER DEFAULT 0,
        follow_count INTEGER DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        session_coins INTEGER DEFAULT 0,
        session_messages INTEGER DEFAULT 0,
        PRIMARY KEY (username, streamer_id)
      )
    `).run();

    // Migration: Add streamer_id column if it doesn't exist (for legacy databases)
    this.migrateToStreamerIdColumn();

    logger.info('Leaderboard tables initialized');
  }

  /**
   * Migrate legacy databases to include streamer_id column
   */
  migrateToStreamerIdColumn() {
    try {
      // Check if streamer_id column exists
      const tableInfo = this.db.prepare('PRAGMA table_info(leaderboard_stats)').all();
      const hasStreamerId = tableInfo.some(col => col.name === 'streamer_id');

      if (!hasStreamerId) {
        logger.info('Migrating leaderboard_stats table to add streamer_id column');

        // Check if table has any data and if username is the primary key (old schema)
        const hasData = this.db.prepare('SELECT COUNT(*) as count FROM leaderboard_stats').get().count > 0;

        if (hasData) {
          // Create new table with correct schema
          this.db.prepare(`
            CREATE TABLE leaderboard_stats_new (
              username TEXT NOT NULL,
              streamer_id TEXT NOT NULL,
              total_coins INTEGER DEFAULT 0,
              message_count INTEGER DEFAULT 0,
              like_count INTEGER DEFAULT 0,
              share_count INTEGER DEFAULT 0,
              gift_count INTEGER DEFAULT 0,
              follow_count INTEGER DEFAULT 0,
              first_seen INTEGER NOT NULL,
              last_seen INTEGER NOT NULL,
              session_coins INTEGER DEFAULT 0,
              session_messages INTEGER DEFAULT 0,
              PRIMARY KEY (username, streamer_id)
            )
          `).run();

          // Copy existing data with default streamer_id
          this.db.prepare(`
            INSERT INTO leaderboard_stats_new
            SELECT 
              username,
              ? as streamer_id,
              total_coins,
              message_count,
              like_count,
              share_count,
              gift_count,
              follow_count,
              first_seen,
              last_seen,
              session_coins,
              session_messages
            FROM leaderboard_stats
          `).run(DEFAULT_STREAMER_ID);

          // Drop old table and rename new one
          this.db.prepare('DROP TABLE leaderboard_stats').run();
          this.db.prepare('ALTER TABLE leaderboard_stats_new RENAME TO leaderboard_stats').run();

          logger.info('Successfully migrated leaderboard_stats table with streamer_id column');
        } else {
          // No data, just recreate the table with the correct schema
          this.db.prepare('DROP TABLE leaderboard_stats').run();
          this.db.prepare(`
            CREATE TABLE leaderboard_stats (
              username TEXT NOT NULL,
              streamer_id TEXT NOT NULL,
              total_coins INTEGER DEFAULT 0,
              message_count INTEGER DEFAULT 0,
              like_count INTEGER DEFAULT 0,
              share_count INTEGER DEFAULT 0,
              gift_count INTEGER DEFAULT 0,
              follow_count INTEGER DEFAULT 0,
              first_seen INTEGER NOT NULL,
              last_seen INTEGER NOT NULL,
              session_coins INTEGER DEFAULT 0,
              session_messages INTEGER DEFAULT 0,
              PRIMARY KEY (username, streamer_id)
            )
          `).run();

          logger.info('Recreated empty leaderboard_stats table with streamer_id column');
        }
      }
    } catch (error) {
      logger.error('Error during leaderboard migration:', error);
      throw error;
    }
  }

  /**
   * Update stats for a user
   */
  updateStats(username, eventType, data = {}) {
    const now = Date.now();
    const sid = this.streamerId || DEFAULT_STREAMER_ID;

    // Get existing stats
    let stats = this.db.prepare(
      'SELECT * FROM leaderboard_stats WHERE username = ? AND streamer_id = ?'
    ).get(username, sid);

    if (!stats) {
      // Create new entry
      stats = {
        username,
        streamer_id: sid,
        total_coins: 0,
        message_count: 0,
        like_count: 0,
        share_count: 0,
        gift_count: 0,
        follow_count: 0,
        first_seen: now,
        last_seen: now,
        session_coins: 0,
        session_messages: 0
      };
    }

    // Update based on event type
    switch (eventType) {
      case 'gift':
        stats.total_coins += data.coins || 0;
        stats.gift_count += 1;
        stats.session_coins += data.coins || 0;
        break;

      case 'chat':
        stats.message_count += 1;
        stats.session_messages += 1;
        break;

      case 'like':
        // Use the actual like count from the event data (e.g., 80 likes at once)
        stats.like_count += data.count || 1;
        break;

      case 'share':
        stats.share_count += 1;
        break;

      case 'follow':
        stats.follow_count += 1;
        break;
    }

    stats.last_seen = now;

    // Upsert to database
    this.db.prepare(`
      INSERT INTO leaderboard_stats (
        username, streamer_id, total_coins, message_count, like_count, share_count,
        gift_count, follow_count, first_seen, last_seen,
        session_coins, session_messages
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username, streamer_id) DO UPDATE SET
        total_coins = ?,
        message_count = ?,
        like_count = ?,
        share_count = ?,
        gift_count = ?,
        follow_count = ?,
        last_seen = ?,
        session_coins = ?,
        session_messages = ?
    `).run(
      stats.username,
      stats.streamer_id,
      stats.total_coins,
      stats.message_count,
      stats.like_count,
      stats.share_count,
      stats.gift_count,
      stats.follow_count,
      stats.first_seen,
      stats.last_seen,
      stats.session_coins,
      stats.session_messages,
      // For UPDATE
      stats.total_coins,
      stats.message_count,
      stats.like_count,
      stats.share_count,
      stats.gift_count,
      stats.follow_count,
      stats.last_seen,
      stats.session_coins,
      stats.session_messages
    );

    logger.debug('Leaderboard stats updated', { username, eventType, streamerId: sid });

    // Emit Socket.IO event for real-time updates
    if (this.io) {
      this.io.to('leaderboard').emit('leaderboard:update', {
        username,
        eventType,
        stats: this.getUserStats(username)
      });
    }
  }

  /**
   * Get top gifters
   */
  getTopGifters(limit = 10, period = 'all_time') {
    // Validate period to prevent SQL injection
    const validPeriods = ['session', 'all_time'];
    if (!validPeriods.includes(period)) {
      logger.warn(`Invalid period '${period}', defaulting to 'all_time'`);
      period = 'all_time';
    }

    const sid = this.streamerId || DEFAULT_STREAMER_ID;
    const column = period === 'session' ? 'session_coins' : 'total_coins';

    return this.db.prepare(`
      SELECT
        username,
        ${column} as coins,
        gift_count,
        last_seen
      FROM leaderboard_stats
      WHERE streamer_id = ? AND ${column} > 0
      ORDER BY ${column} DESC
      LIMIT ?
    `).all(sid, limit);
  }

  /**
   * Get top chatters
   */
  getTopChatters(limit = 10, period = 'all_time') {
    // Validate period to prevent SQL injection
    const validPeriods = ['session', 'all_time'];
    if (!validPeriods.includes(period)) {
      logger.warn(`Invalid period '${period}', defaulting to 'all_time'`);
      period = 'all_time';
    }

    const sid = this.streamerId || DEFAULT_STREAMER_ID;
    const column = period === 'session' ? 'session_messages' : 'message_count';

    return this.db.prepare(`
      SELECT
        username,
        ${column} as message_count,
        last_seen
      FROM leaderboard_stats
      WHERE streamer_id = ? AND ${column} > 0
      ORDER BY ${column} DESC
      LIMIT ?
    `).all(sid, limit);
  }

  /**
   * Get user rank by coins
   */
  getUserRank(username, period = 'all_time') {
    // Validate period to prevent SQL injection
    const validPeriods = ['session', 'all_time'];
    if (!validPeriods.includes(period)) {
      logger.warn(`Invalid period '${period}', defaulting to 'all_time'`);
      period = 'all_time';
    }

    const sid = this.streamerId || DEFAULT_STREAMER_ID;
    const column = period === 'session' ? 'session_coins' : 'total_coins';

    const rank = this.db.prepare(`
      SELECT COUNT(*) + 1 as rank
      FROM leaderboard_stats
      WHERE streamer_id = ? AND ${column} > (
        SELECT ${column}
        FROM leaderboard_stats
        WHERE username = ? AND streamer_id = ?
      )
    `).get(sid, username, sid);

    return rank ? rank.rank : null;
  }

  /**
   * Get user stats
   */
  getUserStats(username) {
    const sid = this.streamerId || DEFAULT_STREAMER_ID;
    return this.db.prepare(
      'SELECT * FROM leaderboard_stats WHERE username = ? AND streamer_id = ?'
    ).get(username, sid);
  }

  /**
   * Reset session stats
   */
  resetSessionStats() {
    const sid = this.streamerId || DEFAULT_STREAMER_ID;
    this.db.prepare(`
      UPDATE leaderboard_stats
      SET session_coins = 0, session_messages = 0
      WHERE streamer_id = ?
    `).run(sid);

    this.sessionStart = Date.now();
    logger.info('Session leaderboard stats reset for streamer:', sid);
  }

  /**
   * Reset all stats
   */
  resetAllStats() {
    const sid = this.streamerId || DEFAULT_STREAMER_ID;
    this.db.prepare('DELETE FROM leaderboard_stats WHERE streamer_id = ?').run(sid);
    this.sessionStart = Date.now();
    logger.info('All leaderboard stats reset for streamer:', sid);
  }

  /**
   * Get leaderboard summary
   */
  getSummary() {
    const sid = this.streamerId || DEFAULT_STREAMER_ID;
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_users,
        SUM(total_coins) as total_coins,
        SUM(message_count) as total_messages,
        SUM(gift_count) as total_gifts
      FROM leaderboard_stats
      WHERE streamer_id = ?
    `).get(sid);

    return {
      ...stats,
      session_start: this.sessionStart,
      session_duration: Date.now() - this.sessionStart
    };
  }

  /**
   * Export leaderboard data
   */
  exportData() {
    const sid = this.streamerId || DEFAULT_STREAMER_ID;
    return this.db.prepare('SELECT * FROM leaderboard_stats WHERE streamer_id = ? ORDER BY total_coins DESC').all(sid);
  }

  /**
   * Get top users by category (for server.js compatibility)
   */
  async getTop(category, limit = 10) {
    if (category === 'gifters') {
      return this.getTopGifters(limit);
    } else if (category === 'chatters') {
      return this.getTopChatters(limit);
    }
    return [];
  }

  /**
   * Reset leaderboard (for server.js compatibility)
   */
  async reset(category) {
    if (category === 'session') {
      this.resetSessionStats();
    } else {
      this.resetAllStats();
    }
  }

  /**
   * Get all stats (for server.js compatibility)
   */
  async getAllStats() {
    return this.exportData();
  }

  /**
   * Track gift event (for server.js compatibility)
   */
  async trackGift(username, giftName, coins) {
    this.updateStats(username, 'gift', { coins });
  }

  /**
   * Track follow event (for server.js compatibility)
   */
  async trackFollow(username) {
    this.updateStats(username, 'follow');
  }

  /**
   * Track subscription event (for server.js compatibility)
   */
  async trackSubscription(username) {
    this.updateStats(username, 'follow'); // Using follow for subscriptions tracking
  }

  /**
   * Track share event (for server.js compatibility)
   */
  async trackShare(username) {
    this.updateStats(username, 'share');
  }

  /**
   * Track chat event (for server.js compatibility)
   */
  async trackChat(username) {
    this.updateStats(username, 'chat');
  }

  /**
   * Track like event (for server.js compatibility)
   */
  async trackLike(username, count = 1) {
    this.updateStats(username, 'like', { count });
  }
}

module.exports = LeaderboardManager;
