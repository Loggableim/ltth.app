/**
 * Sidekick Plugin - Memory Store
 * 
 * Persistent user memory with decay functionality.
 * Stores user interaction history, counts, and metadata.
 * Uses SQLite for persistence via LTTH database.
 */

const MEMORY_TABLE = 'sidekick_memory';

function safeJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }
  if (typeof value === 'object') return value;
  return fallback;
}

function sanitizeMessageEntry(entry, fallbackTs) {
  if (typeof entry === 'string') {
    const text = entry.trim();
    if (!text) return null;
    return { text, ts: fallbackTs };
  }
  if (!entry || typeof entry !== 'object') return null;
  const text = String(entry.text || '').trim();
  if (!text) return null;
  const ts = Number(entry.ts);
  return {
    text,
    ts: Number.isFinite(ts) ? ts : fallbackTs
  };
}

function formatAgeLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'unbekannt';
  const ageMs = Math.max(0, Date.now() - numeric);
  const ageMinutes = Math.max(0, Math.floor(ageMs / 60000));
  if (ageMinutes === 0) return 'vor <1m';
  if (ageMinutes < 60) return `vor ${ageMinutes}m`;
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return `vor ${ageHours}h`;
  const ageDays = Math.floor(ageHours / 24);
  return `vor ${ageDays}d`;
}

/**
 * Memory store for user data with decay
 */
class MemoryStore {
  constructor(api, config) {
    this.api = api;
    this.config = config;
    this.db = api.getDatabase();
    
    // In-memory cache for active users
    this.cache = new Map();
    
    // Initialize database table
    this._initTable();
  }

  updateConfig(config) {
    this.config = config;
  }
  
  /**
   * Initialize the database table
   * @private
   */
  _initTable() {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ${MEMORY_TABLE} (
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
          last_join INTEGER DEFAULT 0,
          last_follow INTEGER DEFAULT 0,
          last_sub INTEGER DEFAULT 0,
          last_share INTEGER DEFAULT 0,
          last_gift INTEGER DEFAULT 0,
          last_like INTEGER DEFAULT 0,
          messages TEXT DEFAULT '[]',
          last_greet INTEGER DEFAULT 0,
          is_subscriber INTEGER DEFAULT 0,
          is_follower INTEGER DEFAULT 0,
          is_moderator INTEGER DEFAULT 0,
          background TEXT DEFAULT '{}',
          updated_at INTEGER
        )
      `);
      this._ensureTableSchema();
      this.api.log('Memory store table initialized', 'info');
    } catch (error) {
      this.api.log(`Failed to initialize memory table: ${error.message}`, 'error');
    }
  }

  _getExistingColumns() {
    const rows = this.db.prepare(`PRAGMA table_info(${MEMORY_TABLE})`).all();
    return new Set(rows.map((row) => row.name));
  }

  _ensureTableSchema() {
    const existingColumns = this._getExistingColumns();
    const requiredColumns = {
      last_join: 'INTEGER DEFAULT 0',
      last_follow: 'INTEGER DEFAULT 0',
      last_sub: 'INTEGER DEFAULT 0',
      last_share: 'INTEGER DEFAULT 0',
      last_gift: 'INTEGER DEFAULT 0',
      last_like: 'INTEGER DEFAULT 0',
      is_subscriber: 'INTEGER DEFAULT 0',
      is_follower: 'INTEGER DEFAULT 0',
      is_moderator: 'INTEGER DEFAULT 0'
    };

    for (const [column, definition] of Object.entries(requiredColumns)) {
      if (existingColumns.has(column)) continue;
      try {
        this.db.exec(`ALTER TABLE ${MEMORY_TABLE} ADD COLUMN ${column} ${definition}`);
        existingColumns.add(column);
      } catch (error) {
        this.api.log(`Failed to add memory table column ${column}: ${error.message}`, 'error');
      }
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
      const stmt = this.db.prepare(`SELECT * FROM ${MEMORY_TABLE} WHERE uid = ?`);
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
      lastJoin: 0,
      lastFollow: 0,
      lastSub: 0,
      lastShare: 0,
      lastGift: 0,
      lastLike: 0,
      messages: [],
      lastGreet: 0,
      isSubscriber: false,
      isFollower: false,
      isModerator: false,
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
    const fallbackTs = row.last_seen || Date.now();
    const rawMessages = safeJson(row.messages, []);
    const messages = Array.isArray(rawMessages)
      ? rawMessages
          .map((entry) => sanitizeMessageEntry(entry, fallbackTs))
          .filter(Boolean)
          .slice(-200)
      : [];
    
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
      lastJoin: row.last_join || 0,
      lastFollow: row.last_follow || 0,
      lastSub: row.last_sub || 0,
      lastShare: row.last_share || 0,
      lastGift: row.last_gift || 0,
      lastLike: row.last_like || 0,
      messages,
      lastGreet: row.last_greet || 0,
      isSubscriber: Number(row.is_subscriber) === 1,
      isFollower: Number(row.is_follower) === 1,
      isModerator: Number(row.is_moderator) === 1,
      background: safeJson(row.background, {})
    };
  }

  getRecentMessageHistory(uid, limit = 12) {
    const user = this.getUser(uid);
    const maxMessages = Math.max(1, Math.min(64, Number.isFinite(Number(limit)) ? Number(limit) : 12));
    const messages = Array.isArray(user.messages) ? user.messages : [];
    return messages
      .slice(-maxMessages)
      .map((message) => ({ ...message }));
  }

  getUserContextSummary(uid) {
    const user = this.getUser(uid);
    return {
      uid: user.uid,
      nickname: user.nickname,
      firstSeen: user.firstSeen,
      lastSeen: user.lastSeen,
      likes: user.likes,
      gifts: user.gifts,
      follows: user.follows,
      subs: user.subs,
      shares: user.shares,
      joins: user.joins,
      lastJoin: user.lastJoin,
      lastFollow: user.lastFollow,
      lastSub: user.lastSub,
      lastShare: user.lastShare,
      lastGift: user.lastGift,
      lastLike: user.lastLike,
      lastGreet: user.lastGreet,
      isSubscriber: user.isSubscriber,
      isFollower: user.isFollower,
      isModerator: user.isModerator,
      messageCount: Array.isArray(user.messages) ? user.messages.length : 0
    };
  }

  getConversationSummaryForAI(uid, options = {}) {
    const user = this.getUser(uid);
    const maxMessages = Number(options.maxMessages);
    const messageLimit = Number.isFinite(maxMessages) ? Math.max(1, Math.min(20, Math.floor(maxMessages))) : 8;
    const messages = this.getRecentMessageHistory(uid, messageLimit);
    const recentLines = messages
      .map((message) => message.text)
      .filter(Boolean)
      .map((text) => `- ${text}`)
      .join('\\n');
    
    const summaryLines = [
      `Nutzer ${user.nickname || user.uid}: likes=${user.likes}, gifts=${user.gifts}, follows=${user.follows}, shares=${user.shares}, subs=${user.subs}, joins=${user.joins}.`,
      `Letzte Aktionen: Geschenk ${formatAgeLabel(user.lastGift)}, Like ${formatAgeLabel(user.lastLike)}, Follow ${formatAgeLabel(user.lastFollow)}, Share ${formatAgeLabel(user.lastShare)}, Join ${formatAgeLabel(user.lastJoin)}, Sub ${formatAgeLabel(user.lastSub)}.`
    ];
    
    return {
      uid,
      nickname: user.nickname,
      messageCount: messages.length,
      summary: summaryLines.join(' ') + (recentLines ? ` Relevante letze Nachrichten:\\n${recentLines}` : ''),
      recentMessages: messages,
      raw: this.getUserContextSummary(uid)
    };
  }
  
  /**
   * Save a user record to the database
   * @param {Object} user - User data
   */
  saveUser(user) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO ${MEMORY_TABLE} 
        (
          uid, nickname, first_seen, last_seen, likes, gifts, follows, subs, shares, joins,
          last_join, last_follow, last_sub, last_share, last_gift, last_like,
          messages, last_greet, is_subscriber, is_follower, is_moderator, background, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET
          nickname = excluded.nickname,
          last_seen = excluded.last_seen,
          likes = excluded.likes,
          gifts = excluded.gifts,
          follows = excluded.follows,
          subs = excluded.subs,
          shares = excluded.shares,
          joins = excluded.joins,
          last_join = excluded.last_join,
          last_follow = excluded.last_follow,
          last_sub = excluded.last_sub,
          last_share = excluded.last_share,
          last_gift = excluded.last_gift,
          last_like = excluded.last_like,
          messages = excluded.messages,
          last_greet = excluded.last_greet,
          is_subscriber = excluded.is_subscriber,
          is_follower = excluded.is_follower,
          is_moderator = excluded.is_moderator,
          background = excluded.background,
          updated_at = excluded.updated_at
      `);
      
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
        user.lastJoin,
        user.lastFollow,
        user.lastSub,
        user.lastShare,
        user.lastGift,
        user.lastLike,
        JSON.stringify(messages),
        user.lastGreet,
        user.isSubscriber ? 1 : 0,
        user.isFollower ? 1 : 0,
        user.isModerator ? 1 : 0,
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
    background = null,
    follower,
    subscriber,
    moderator
  } = {}) {
    if (!this.config.memory?.enabled) return;
    
    const user = this.getUser(uid);
    const now = Date.now();
    user.lastSeen = now;
    
    if (nickname) user.nickname = nickname;
    if (likeInc) user.likes += likeInc;
    if (giftInc) user.gifts += giftInc;
    if (follow) {
      user.follows += 1;
      user.lastFollow = now;
    }
    if (sub) {
      user.subs += 1;
      user.lastSub = now;
    }
    if (share) {
      user.shares += 1;
      user.lastShare = now;
    }
    if (join) {
      user.joins += 1;
      user.lastJoin = now;
    }
    if (likeInc) {
      user.lastLike = now;
    }
    if (giftInc) {
      user.lastGift = now;
    }
    if (message) {
      const text = String(message).trim();
      if (text) {
        user.messages.push({ text, ts: now });
      }
    }
    if (typeof follower === 'boolean') user.isFollower = follower;
    if (typeof subscriber === 'boolean') user.isSubscriber = subscriber;
    if (typeof moderator === 'boolean') user.isModerator = moderator;
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
      const stmt = this.db.prepare(`DELETE FROM ${MEMORY_TABLE} WHERE last_seen < ?`);
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
      this.db.exec(`DELETE FROM ${MEMORY_TABLE}`);
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
      const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${MEMORY_TABLE}`);
      const countResult = countStmt.get();
      
      const statsStmt = this.db.prepare(`
        SELECT 
          SUM(likes) as totalLikes,
          SUM(gifts) as totalGifts,
          SUM(follows) as totalFollows,
          SUM(subs) as totalSubs,
          SUM(shares) as totalShares,
          SUM(joins) as totalJoins
        FROM ${MEMORY_TABLE}
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
        SELECT * FROM ${MEMORY_TABLE}
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
        FROM ${MEMORY_TABLE}
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

