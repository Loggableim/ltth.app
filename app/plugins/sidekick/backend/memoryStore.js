/**
 * Sidekick Plugin - Memory Store
 * 
 * Persistent user memory with decay functionality.
 * Stores user interaction history, counts, and metadata.
 * Uses SQLite for persistence via LTTH database.
 */

/**
 * Memory store for user data with decay
 */
class MemoryStore {
  constructor(api, config) {
    this.api = api;
    this.config = config;
    this.db = api.getDatabase();
    this.tableName = 'sidekick_memory';
    
    // In-memory cache for active users
    this.cache = new Map();
    
    // Initialize database table
    this._initTable();
  }
  
  /**
   * Initialize the database table
   * @private
   */
  _initTable() {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          uid TEXT PRIMARY KEY,
          nickname TEXT,
          first_seen INTEGER,
          last_seen INTEGER,
          likes INTEGER DEFAULT 0,
          gifts INTEGER DEFAULT 0,
          follows INTEGER DEFAULT 0,
          subs INTEGER DEFAULT 0,
          shares INTEGER DEFAULT 0,
          joins INTEGER DEFAULT 0,
          messages TEXT DEFAULT '[]',
          last_greet INTEGER DEFAULT 0,
          background TEXT DEFAULT '{}',
          updated_at INTEGER
        )
      `);
      
      // Create index for cleanup queries
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_last_seen 
        ON ${this.tableName}(last_seen)
      `);
      
      this.api.log('Memory store table initialized', 'info');
    } catch (error) {
      this.api.log(`Failed to initialize memory table: ${error.message}`, 'error');
    }
  }
  
  /**
   * Get or create a user record
   * @param {string} uid - User unique ID
   * @returns {Object} User data
   */
  getUser(uid) {
    // Check cache first
    if (this.cache.has(uid)) {
      return this.cache.get(uid);
    }
    
    try {
      const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE uid = ?`);
      const row = stmt.get(uid);
      
      if (row) {
        const user = this._rowToUser(row);
        this.cache.set(uid, user);
        return user;
      }
    } catch (error) {
      this.api.log(`Failed to get user ${uid}: ${error.message}`, 'error');
    }
    
    // Return new user object
    return this._createUser(uid);
  }
  
  /**
   * Create a new user record
   * @private
   */
  _createUser(uid) {
    const now = Date.now();
    const user = {
      uid,
      nickname: '',
      firstSeen: now,
      lastSeen: now,
      likes: 0,
      gifts: 0,
      follows: 0,
      subs: 0,
      shares: 0,
      joins: 0,
      messages: [],
      lastGreet: 0,
      background: {}
    };
    this.cache.set(uid, user);
    return user;
  }
  
  /**
   * Convert database row to user object
   * @private
   */
  _rowToUser(row) {
    return {
      uid: row.uid,
      nickname: row.nickname || '',
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      likes: row.likes || 0,
      gifts: row.gifts || 0,
      follows: row.follows || 0,
      subs: row.subs || 0,
      shares: row.shares || 0,
      joins: row.joins || 0,
      messages: JSON.parse(row.messages || '[]'),
      lastGreet: row.last_greet || 0,
      background: JSON.parse(row.background || '{}')
    };
  }
  
  /**
   * Save a user record to the database
   * @param {Object} user - User data
   */
  saveUser(user) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO ${this.tableName} 
        (uid, nickname, first_seen, last_seen, likes, gifts, follows, subs, shares, joins, messages, last_greet, background, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET
          nickname = excluded.nickname,
          last_seen = excluded.last_seen,
          likes = excluded.likes,
          gifts = excluded.gifts,
          follows = excluded.follows,
          subs = excluded.subs,
          shares = excluded.shares,
          joins = excluded.joins,
          messages = excluded.messages,
          last_greet = excluded.last_greet,
          background = excluded.background,
          updated_at = excluded.updated_at
      `);
      
      // Limit messages array size
      const maxHistory = this.config.memory?.perUserHistory || 100;
      const messages = user.messages.slice(-maxHistory);
      
      stmt.run(
        user.uid,
        user.nickname,
        user.firstSeen,
        user.lastSeen,
        user.likes,
        user.gifts,
        user.follows,
        user.subs,
        user.shares,
        user.joins,
        JSON.stringify(messages),
        user.lastGreet,
        JSON.stringify(user.background),
        Date.now()
      );
      
      // Update cache
      this.cache.set(user.uid, { ...user, messages });
    } catch (error) {
      this.api.log(`Failed to save user ${user.uid}: ${error.message}`, 'error');
    }
  }
  
  /**
   * Remember an event for a user
   * @param {string} uid - User unique ID
   * @param {Object} options - Event details
   */
  rememberEvent(uid, {
    nickname = '',
    likeInc = 0,
    giftInc = 0,
    follow = false,
    sub = false,
    share = false,
    join = false,
    message = null,
    background = null
  } = {}) {
    if (!this.config.memory?.enabled) return;
    
    const user = this.getUser(uid);
    user.lastSeen = Date.now();
    
    if (nickname) user.nickname = nickname;
    if (likeInc) user.likes += likeInc;
    if (giftInc) user.gifts += giftInc;
    if (follow) user.follows += 1;
    if (sub) user.subs += 1;
    if (share) user.shares += 1;
    if (join) user.joins += 1;
    if (message) user.messages.push(message);
    if (background) Object.assign(user.background, background);
    
    this.saveUser(user);
  }
  
  /**
   * Update last greet time for a user
   * @param {string} uid - User unique ID
   */
  updateLastGreet(uid) {
    const user = this.getUser(uid);
    user.lastGreet = Date.now();
    this.saveUser(user);
  }
  
  /**
   * Get background info string for a user
   * @param {string} uid - User unique ID
   * @returns {string} Background info
   */
  /**
   * Get background info string for a user
   * @param {string} uid - User unique ID
   * @param {number} maxValueLength - Maximum length for each value (default: 48)
   * @returns {string} Background info
   */
  getBackgroundInfo(uid, maxValueLength = 48) {
    const user = this.getUser(uid);
    const bg = user.background || {};
    
    if (Object.keys(bg).length === 0) return '';
    
    const parts = [];
    for (const [key, value] of Object.entries(bg)) {
      if (value === null || value === undefined) continue;
      const ks = String(key).trim();
      const vs = String(value).trim();
      if (!ks || !vs) continue;
      parts.push(`${ks}=${vs.substring(0, maxValueLength)}${vs.length > maxValueLength ? '…' : ''}`);
    }
    return parts.join(', ');
  }
  
  /**
   * Clean up old memories based on decay settings
   */
  cleanupDecayed() {
    const decayDays = this.config.memory?.decayDays || 90;
    const cutoffTime = Date.now() - (decayDays * 24 * 60 * 60 * 1000);
    
    try {
      const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE last_seen < ?`);
      const result = stmt.run(cutoffTime);
      
      // Clear cache entries for deleted users
      for (const [uid, user] of this.cache.entries()) {
        if (user.lastSeen < cutoffTime) {
          this.cache.delete(uid);
        }
      }
      
      if (result.changes > 0) {
        this.api.log(`Cleaned up ${result.changes} decayed memory records`, 'info');
      }
    } catch (error) {
      this.api.log(`Failed to cleanup decayed memories: ${error.message}`, 'error');
    }
  }
  
  /**
   * Clear all memories
   */
  clearAll() {
    try {
      this.db.exec(`DELETE FROM ${this.tableName}`);
      this.cache.clear();
      this.api.log('All memories cleared', 'info');
    } catch (error) {
      this.api.log(`Failed to clear memories: ${error.message}`, 'error');
    }
  }
  
  /**
   * Get memory statistics
   * @returns {Object} Statistics
   */
  getStats() {
    try {
      const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`);
      const countResult = countStmt.get();
      
      const statsStmt = this.db.prepare(`
        SELECT 
          SUM(likes) as totalLikes,
          SUM(gifts) as totalGifts,
          SUM(follows) as totalFollows,
          SUM(subs) as totalSubs,
          SUM(shares) as totalShares,
          SUM(joins) as totalJoins
        FROM ${this.tableName}
      `);
      const statsResult = statsStmt.get();
      
      return {
        userCount: countResult?.count || 0,
        cacheSize: this.cache.size,
        totalLikes: statsResult?.totalLikes || 0,
        totalGifts: statsResult?.totalGifts || 0,
        totalFollows: statsResult?.totalFollows || 0,
        totalSubs: statsResult?.totalSubs || 0,
        totalShares: statsResult?.totalShares || 0,
        totalJoins: statsResult?.totalJoins || 0
      };
    } catch (error) {
      this.api.log(`Failed to get memory stats: ${error.message}`, 'error');
      return {
        userCount: 0,
        cacheSize: this.cache.size,
        totalLikes: 0,
        totalGifts: 0,
        totalFollows: 0,
        totalSubs: 0,
        totalShares: 0,
        totalJoins: 0
      };
    }
  }
  
  /**
   * Search users by nickname
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Array} Matching users
   */
  searchUsers(query, limit = 20) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM ${this.tableName}
        WHERE nickname LIKE ? OR uid LIKE ?
        ORDER BY last_seen DESC
        LIMIT ?
      `);
      const searchPattern = `%${query}%`;
      const rows = stmt.all(searchPattern, searchPattern, limit);
      return rows.map(row => this._rowToUser(row));
    } catch (error) {
      this.api.log(`Failed to search users: ${error.message}`, 'error');
      return [];
    }
  }
  
  /**
   * Get top users by engagement
   * @param {number} limit - Max results
   * @returns {Array} Top users
   */
  getTopUsers(limit = 10) {
    try {
      const stmt = this.db.prepare(`
        SELECT *, (likes + gifts * 10 + follows * 5 + subs * 20 + shares * 3 + joins) as score
        FROM ${this.tableName}
        ORDER BY score DESC
        LIMIT ?
      `);
      const rows = stmt.all(limit);
      return rows.map(row => ({
        ...this._rowToUser(row),
        score: row.score
      }));
    } catch (error) {
      this.api.log(`Failed to get top users: ${error.message}`, 'error');
      return [];
    }
  }
}

module.exports = MemoryStore;
