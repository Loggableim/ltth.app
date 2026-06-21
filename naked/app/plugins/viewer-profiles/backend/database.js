/**
 * Viewer Profiles Database Module
 * 
 * Manages all database operations for viewer profiles, including:
 * - Profile management
 * - Gift history
 * - Session tracking
 * - Interaction logging
 * - Activity heatmaps
 * - VIP tier configuration
 */

const path = require('path');
const fs = require('fs');

class ViewerProfilesDatabase {
  constructor(api) {
    this.api = api;
    this.db = api.getDatabase();
  }

  /**
   * Initialize database tables
   */
  initialize() {
    this.api.log('Initializing Viewer Profiles database...', 'info');

    try {
      // Main viewer profiles table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS viewer_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tiktok_username TEXT UNIQUE NOT NULL,
          tiktok_user_id TEXT,
          display_name TEXT,
          profile_picture_url TEXT,
          bio TEXT,
          age INTEGER,
          gender TEXT,
          country TEXT,
          language TEXT,
          verified INTEGER DEFAULT 0,
          follower_count INTEGER DEFAULT 0,
          following_count INTEGER DEFAULT 0,
          first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
          last_seen_at TEXT,
          total_visits INTEGER DEFAULT 0,
          total_watchtime_seconds INTEGER DEFAULT 0,
          total_coins_spent INTEGER DEFAULT 0,
          total_gifts_sent INTEGER DEFAULT 0,
          total_comments INTEGER DEFAULT 0,
          total_likes INTEGER DEFAULT 0,
          total_shares INTEGER DEFAULT 0,
          tts_voice TEXT,
          discord_username TEXT,
          birthday TEXT,
          notes TEXT,
          tags TEXT,
          is_vip INTEGER DEFAULT 0,
          vip_since TEXT,
          vip_tier TEXT,
          loyalty_points INTEGER DEFAULT 0,
          is_blocked INTEGER DEFAULT 0,
          is_favorite INTEGER DEFAULT 0,
          is_moderator INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Gift history table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS viewer_gift_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          viewer_id INTEGER NOT NULL,
          gift_id TEXT,
          gift_name TEXT,
          gift_coins INTEGER DEFAULT 0,
          gift_diamond_count INTEGER DEFAULT 0,
          quantity INTEGER DEFAULT 1,
          streak_count INTEGER DEFAULT 0,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (viewer_id) REFERENCES viewer_profiles (id) ON DELETE CASCADE
        )
      `);

      // Session tracking table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS viewer_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          viewer_id INTEGER NOT NULL,
          joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
          left_at TEXT,
          duration_seconds INTEGER DEFAULT 0,
          stream_id TEXT,
          FOREIGN KEY (viewer_id) REFERENCES viewer_profiles (id) ON DELETE CASCADE
        )
      `);

      // Interaction logging table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS viewer_interactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          viewer_id INTEGER NOT NULL,
          interaction_type TEXT NOT NULL,
          content TEXT,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (viewer_id) REFERENCES viewer_profiles (id) ON DELETE CASCADE
        )
      `);

      // Activity heatmap table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS viewer_activity_heatmap (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          viewer_id INTEGER NOT NULL,
          hour_of_day INTEGER NOT NULL,
          day_of_week INTEGER NOT NULL,
          activity_count INTEGER DEFAULT 1,
          total_coins_in_hour INTEGER DEFAULT 0,
          FOREIGN KEY (viewer_id) REFERENCES viewer_profiles (id) ON DELETE CASCADE,
          UNIQUE(viewer_id, hour_of_day, day_of_week)
        )
      `);

      // VIP tier configuration table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS vip_tier_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tier_name TEXT UNIQUE NOT NULL,
          min_coins_spent INTEGER DEFAULT 0,
          min_watchtime_hours INTEGER DEFAULT 0,
          min_visits INTEGER DEFAULT 0,
          benefits TEXT,
          badge_color TEXT,
          sort_order INTEGER DEFAULT 0
        )
      `);

      // ⚠️ Migrate schema FIRST — before creating indices!
      // This ensures all columns exist before we reference them in indices.
      this.migrateSchema();

      // Create indices for performance (AFTER migration so all columns exist)
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_viewer_username ON viewer_profiles(tiktok_username);
        CREATE INDEX IF NOT EXISTS idx_viewer_user_id ON viewer_profiles(tiktok_user_id);
        CREATE INDEX IF NOT EXISTS idx_viewer_last_seen ON viewer_profiles(last_seen_at);
        CREATE INDEX IF NOT EXISTS idx_viewer_vip ON viewer_profiles(is_vip);
        CREATE INDEX IF NOT EXISTS idx_gift_viewer ON viewer_gift_history(viewer_id);
        CREATE INDEX IF NOT EXISTS idx_gift_timestamp ON viewer_gift_history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_session_viewer ON viewer_sessions(viewer_id);
        CREATE INDEX IF NOT EXISTS idx_interaction_viewer ON viewer_interactions(viewer_id);
        CREATE INDEX IF NOT EXISTS idx_interaction_type ON viewer_interactions(interaction_type);
        CREATE INDEX IF NOT EXISTS idx_heatmap_viewer ON viewer_activity_heatmap(viewer_id);
      `);

      // Initialize default VIP tiers if not exist
      this.initializeDefaultVIPTiers();

      this.api.log('✅ Viewer Profiles database initialized', 'info');
    } catch (error) {
      this.api.log(`❌ Error initializing database: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Initialize default VIP tiers
   */
  initializeDefaultVIPTiers() {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM vip_tier_config');
    const result = stmt.get();

    // Check if result exists and table is empty (count is 0)
    if (result && result.count === 0) {
      const tiers = [
        {
          tier_name: 'Bronze',
          min_coins_spent: 1000,
          min_watchtime_hours: 5,
          min_visits: 10,
          benefits: JSON.stringify(['Custom TTS Voice', 'Bronze Badge']),
          badge_color: '#CD7F32',
          sort_order: 1
        },
        {
          tier_name: 'Silver',
          min_coins_spent: 5000,
          min_watchtime_hours: 20,
          min_visits: 25,
          benefits: JSON.stringify(['Custom TTS Voice', 'Silver Badge', 'Priority Chat']),
          badge_color: '#C0C0C0',
          sort_order: 2
        },
        {
          tier_name: 'Gold',
          min_coins_spent: 20000,
          min_watchtime_hours: 50,
          min_visits: 50,
          benefits: JSON.stringify(['Custom TTS Voice', 'Gold Badge', 'Priority Chat', 'Custom Commands']),
          badge_color: '#FFD700',
          sort_order: 3
        },
        {
          tier_name: 'Platinum',
          min_coins_spent: 100000,
          min_watchtime_hours: 200,
          min_visits: 100,
          benefits: JSON.stringify(['All Benefits', 'Platinum Badge', 'Exclusive Events']),
          badge_color: '#E5E4E2',
          sort_order: 4
        }
      ];

      const insertStmt = this.db.prepare(`
        INSERT INTO vip_tier_config (tier_name, min_coins_spent, min_watchtime_hours, min_visits, benefits, badge_color, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const tier of tiers) {
        insertStmt.run(
          tier.tier_name,
          tier.min_coins_spent,
          tier.min_watchtime_hours,
          tier.min_visits,
          tier.benefits,
          tier.badge_color,
          tier.sort_order
        );
      }

      this.api.log('Initialized default VIP tiers', 'info');
    }
  }

  /**
   * Migrate database schema: add any columns missing from existing tables.
   * Uses PRAGMA table_info for broad SQLite compatibility.
   */
  migrateSchema() {
    const tables = {
      viewer_profiles: [
        { name: 'tiktok_username', def: 'TEXT', critical: true },
        { name: 'tiktok_user_id', def: 'TEXT' },
        { name: 'display_name', def: 'TEXT' },
        { name: 'profile_picture_url', def: 'TEXT' },
        { name: 'bio', def: 'TEXT' },
        { name: 'age', def: 'INTEGER' },
        { name: 'gender', def: 'TEXT' },
        { name: 'country', def: 'TEXT' },
        { name: 'language', def: 'TEXT' },
        { name: 'verified', def: 'INTEGER DEFAULT 0' },
        { name: 'follower_count', def: 'INTEGER DEFAULT 0' },
        { name: 'following_count', def: 'INTEGER DEFAULT 0' },
        { name: 'first_seen_at', def: 'TEXT DEFAULT CURRENT_TIMESTAMP', alterDef: 'TEXT', backfillExpression: 'CURRENT_TIMESTAMP' },
        { name: 'last_seen_at', def: 'TEXT' },
        { name: 'total_visits', def: 'INTEGER DEFAULT 0' },
        { name: 'total_watchtime_seconds', def: 'INTEGER DEFAULT 0' },
        { name: 'total_coins_spent', def: 'INTEGER DEFAULT 0' },
        { name: 'total_gifts_sent', def: 'INTEGER DEFAULT 0' },
        { name: 'total_comments', def: 'INTEGER DEFAULT 0' },
        { name: 'total_likes', def: 'INTEGER DEFAULT 0' },
        { name: 'total_shares', def: 'INTEGER DEFAULT 0' },
        { name: 'tts_voice', def: 'TEXT' },
        { name: 'discord_username', def: 'TEXT' },
        { name: 'birthday', def: 'TEXT' },
        { name: 'notes', def: 'TEXT' },
        { name: 'tags', def: 'TEXT' },
        { name: 'is_vip', def: 'INTEGER DEFAULT 0' },
        { name: 'vip_since', def: 'TEXT' },
        { name: 'vip_tier', def: 'TEXT' },
        { name: 'loyalty_points', def: 'INTEGER DEFAULT 0' },
        { name: 'is_blocked', def: 'INTEGER DEFAULT 0' },
        { name: 'is_favorite', def: 'INTEGER DEFAULT 0' },
        { name: 'is_moderator', def: 'INTEGER DEFAULT 0' },
        { name: 'created_at', def: 'TEXT DEFAULT CURRENT_TIMESTAMP', alterDef: 'TEXT', backfillExpression: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', def: 'TEXT DEFAULT CURRENT_TIMESTAMP', alterDef: 'TEXT', backfillExpression: 'CURRENT_TIMESTAMP' },
      ],
      viewer_gift_history: [
        { name: 'viewer_id', def: 'INTEGER' },
        { name: 'gift_id', def: 'TEXT' },
        { name: 'gift_name', def: 'TEXT' },
        { name: 'gift_coins', def: 'INTEGER DEFAULT 0' },
        { name: 'gift_diamond_count', def: 'INTEGER DEFAULT 0' },
        { name: 'quantity', def: 'INTEGER DEFAULT 1' },
        { name: 'streak_count', def: 'INTEGER DEFAULT 0' },
        { name: 'timestamp', def: 'TEXT DEFAULT CURRENT_TIMESTAMP', alterDef: 'TEXT', backfillExpression: 'CURRENT_TIMESTAMP' },
      ],
      viewer_sessions: [
        { name: 'viewer_id', def: 'INTEGER' },
        { name: 'joined_at', def: 'TEXT DEFAULT CURRENT_TIMESTAMP', alterDef: 'TEXT', backfillExpression: 'CURRENT_TIMESTAMP' },
        { name: 'left_at', def: 'TEXT' },
        { name: 'duration_seconds', def: 'INTEGER DEFAULT 0' },
        { name: 'stream_id', def: 'TEXT' },
      ],
      viewer_interactions: [
        { name: 'viewer_id', def: 'INTEGER' },
        { name: 'interaction_type', def: 'TEXT' },
        { name: 'content', def: 'TEXT' },
        { name: 'timestamp', def: 'TEXT DEFAULT CURRENT_TIMESTAMP', alterDef: 'TEXT', backfillExpression: 'CURRENT_TIMESTAMP' },
      ],
      viewer_activity_heatmap: [
        { name: 'viewer_id', def: 'INTEGER' },
        { name: 'hour_of_day', def: 'INTEGER' },
        { name: 'day_of_week', def: 'INTEGER' },
        { name: 'activity_count', def: 'INTEGER DEFAULT 1' },
        { name: 'total_coins_in_hour', def: 'INTEGER DEFAULT 0' },
      ],
      vip_tier_config: [
        { name: 'tier_name', def: 'TEXT' },
        { name: 'min_coins_spent', def: 'INTEGER DEFAULT 0' },
        { name: 'min_watchtime_hours', def: 'INTEGER DEFAULT 0' },
        { name: 'min_visits', def: 'INTEGER DEFAULT 0' },
        { name: 'benefits', def: 'TEXT' },
        { name: 'badge_color', def: 'TEXT' },
        { name: 'sort_order', def: 'INTEGER DEFAULT 0' },
      ],
    };

    const safeIdentifier = /^\w+$/;
    let migratedCount = 0;

    for (const [tableName, expectedColumns] of Object.entries(tables)) {
      if (!safeIdentifier.test(tableName)) {
        this.api.log(`Migration skipped unsafe table name: ${tableName}`, 'warn');
        continue;
      }

      const existingColumns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
      const existingColumnNames = new Set(existingColumns.map(col => col.name));

      for (const col of expectedColumns) {
        if (!safeIdentifier.test(col.name)) {
          this.api.log(`Migration skipped unsafe column name: ${col.name} in ${tableName}`, 'warn');
          continue;
        }

        if (!existingColumnNames.has(col.name)) {
          try {
            this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.alterDef || col.def}`);
            if (col.backfillExpression) {
              this.db.exec(`UPDATE ${tableName} SET ${col.name} = ${col.backfillExpression} WHERE ${col.name} IS NULL`);
            }
            if (col.critical) {
              this.api.log(`Migration: added critical column ${col.name} to ${tableName} — WARNING: this column was missing and is required for core functionality. Please verify data integrity before use.`, 'warn');
            } else {
              this.api.log(`Migration: added column ${col.name} to ${tableName}`, 'info');
            }
            migratedCount++;
          } catch (error) {
            this.api.log(`Migration error adding column ${col.name} to ${tableName}: ${error.message}`, 'error');
            throw error;
          }
        }
      }
    }

    if (migratedCount === 0) {
      this.api.log('Schema is up to date', 'info');
    }
  }

  /**
   * Get or create viewer profile by username
   */
  getOrCreateViewer(username, userData = {}) {
    try {
      let viewer = this.db.prepare('SELECT * FROM viewer_profiles WHERE tiktok_username = ?').get(username);

      if (!viewer) {
        const insertStmt = this.db.prepare(`
          INSERT INTO viewer_profiles (
            tiktok_username, tiktok_user_id, display_name, profile_picture_url,
            verified, first_seen_at, last_seen_at, total_visits
          ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
        `);

        const info = insertStmt.run(
          username,
          userData.userId || null,
          userData.nickname || username,
          userData.profilePictureUrl || null,
          userData.verified || 0
        );

        viewer = this.db.prepare('SELECT * FROM viewer_profiles WHERE id = ?').get(info.lastInsertRowid);
        this.api.log(`Created new viewer profile: ${username}`, 'debug');
      }

      return viewer;
    } catch (error) {
      this.api.log(`Error getting/creating viewer: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Update viewer profile
   */
  updateViewer(username, updates) {
    const ALLOWED_UPDATE_FIELDS = [
      'tiktok_user_id', 'display_name', 'profile_picture_url', 'bio',
      'age', 'gender', 'country', 'language', 'verified',
      'follower_count', 'following_count', 'last_seen_at',
      'total_visits', 'total_watchtime_seconds', 'total_coins_spent',
      'total_gifts_sent', 'total_comments', 'total_likes', 'total_shares',
      'tts_voice', 'discord_username', 'birthday', 'notes', 'tags',
      'is_vip', 'vip_since', 'vip_tier', 'loyalty_points',
      'is_blocked', 'is_favorite', 'is_moderator'
    ];

    try {
      const fields = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        if (!ALLOWED_UPDATE_FIELDS.includes(key)) {
          this.api.log(`updateViewer: ignoring disallowed field '${key}'`, 'warn');
          continue;
        }
        fields.push(`${key} = ?`);
        values.push(value);
      }

      if (fields.length === 0) {
        this.api.log(`updateViewer: no valid fields provided for '${username}', skipping update`, 'info');
        return this.db.prepare('SELECT * FROM viewer_profiles WHERE tiktok_username = ?').get(username);
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(username);

      const sql = `UPDATE viewer_profiles SET ${fields.join(', ')} WHERE tiktok_username = ?`;
      this.db.prepare(sql).run(...values);

      return this.db.prepare('SELECT * FROM viewer_profiles WHERE tiktok_username = ?').get(username);
    } catch (error) {
      this.api.log(`Error updating viewer: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get viewer by username
   */
  getViewerByUsername(username) {
    return this.db.prepare('SELECT * FROM viewer_profiles WHERE tiktok_username = ?').get(username);
  }

  /**
   * Get viewer by ID
   */
  getViewerById(id) {
    return this.db.prepare('SELECT * FROM viewer_profiles WHERE id = ?').get(id);
  }

  /**
   * Get all viewers with pagination and filtering
   */
  getViewers(options = {}) {
    const ALLOWED_SORT_FIELDS = [
      'total_coins_spent', 'total_watchtime_seconds', 'total_visits',
      'last_seen_at', 'tiktok_username', 'display_name', 'created_at',
      'total_gifts_sent', 'total_comments', 'total_likes', 'total_shares',
      'first_seen_at', 'updated_at', 'is_vip', 'loyalty_points'
    ];
    const ALLOWED_ORDERS = ['ASC', 'DESC'];

    const {
      page = 1,
      limit = 50,
      sortBy = 'total_coins_spent',
      order = 'DESC',
      search = '',
      filter = 'all'
    } = options;

    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'total_coins_spent';
    if (!ALLOWED_SORT_FIELDS.includes(sortBy)) {
      this.api.log(`getViewers: invalid sortBy '${sortBy}', falling back to 'total_coins_spent'`, 'debug');
    }
    const safeOrder = ALLOWED_ORDERS.includes((order || '').toUpperCase()) ? order.toUpperCase() : 'DESC';
    if (!ALLOWED_ORDERS.includes((order || '').toUpperCase())) {
      this.api.log(`getViewers: invalid order '${order}', falling back to 'DESC'`, 'debug');
    }

    const offset = (page - 1) * limit;
    let whereConditions = [];
    const params = [];

    // Search filter
    if (search) {
      whereConditions.push('(tiktok_username LIKE ? OR display_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    // Type filter
    if (filter === 'vip') {
      whereConditions.push('is_vip = 1');
    } else if (filter === 'active') {
      whereConditions.push("last_seen_at > datetime('now', '-30 days')");
    } else if (filter === 'favorites') {
      whereConditions.push('is_favorite = 1');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM viewer_profiles ${whereClause}`;
    const countStmt = this.db.prepare(countSql);
    const { total } = countStmt.get(...params);

    // Get paginated results
    const sql = `
      SELECT * FROM viewer_profiles
      ${whereClause}
      ORDER BY ${safeSortBy} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    const stmt = this.db.prepare(sql);
    const viewers = stmt.all(...params, limit, offset);

    return {
      viewers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Add gift to history
   */
  addGiftHistory(viewerId, giftData) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO viewer_gift_history (
          viewer_id, gift_id, gift_name, gift_coins, gift_diamond_count, quantity, streak_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        viewerId,
        giftData.giftId || null,
        giftData.giftName || 'Unknown',
        giftData.giftCoins || 0,
        giftData.diamondCount || 0,
        giftData.quantity || 1,
        giftData.streakCount || 0
      );

      // Update viewer stats
      const coins = (giftData.giftCoins || 0) * (giftData.quantity || 1);
      this.db.prepare(`
        UPDATE viewer_profiles 
        SET total_coins_spent = total_coins_spent + ?,
            total_gifts_sent = total_gifts_sent + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(coins, viewerId);

    } catch (error) {
      this.api.log(`Error adding gift history: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get gift history for a viewer
   */
  getGiftHistory(viewerId, limit = 100) {
    return this.db.prepare(`
      SELECT * FROM viewer_gift_history
      WHERE viewer_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(viewerId, limit);
  }

  /**
   * Get top gifts for a viewer
   */
  getTopGifts(viewerId, limit = 5) {
    return this.db.prepare(`
      SELECT 
        gift_name,
        SUM(quantity) as total_quantity,
        SUM(gift_coins * quantity) as total_coins
      FROM viewer_gift_history
      WHERE viewer_id = ?
      GROUP BY gift_name
      ORDER BY total_coins DESC
      LIMIT ?
    `).all(viewerId, limit);
  }

  /**
   * Add interaction
   */
  addInteraction(viewerId, type, content = null) {
    try {
      this.db.prepare(`
        INSERT INTO viewer_interactions (viewer_id, interaction_type, content)
        VALUES (?, ?, ?)
      `).run(viewerId, type, content);

      // Update viewer stats
      const updateMap = {
        'comment': 'total_comments',
        'like': 'total_likes',
        'share': 'total_shares'
      };

      if (updateMap[type]) {
        this.db.prepare(`
          UPDATE viewer_profiles 
          SET ${updateMap[type]} = ${updateMap[type]} + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(viewerId);
      }
    } catch (error) {
      this.api.log(`Error adding interaction: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Update activity heatmap
   */
  updateHeatmap(viewerId, timestamp, coins = 0) {
    try {
      const date = new Date(timestamp);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();

      this.db.prepare(`
        INSERT INTO viewer_activity_heatmap (viewer_id, hour_of_day, day_of_week, activity_count, total_coins_in_hour)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(viewer_id, hour_of_day, day_of_week)
        DO UPDATE SET 
          activity_count = activity_count + 1,
          total_coins_in_hour = total_coins_in_hour + ?
      `).run(viewerId, hour, dayOfWeek, coins, coins);
    } catch (error) {
      this.api.log(`Error updating heatmap: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get viewer heatmap
   */
  getViewerHeatmap(viewerId) {
    const data = this.db.prepare(`
      SELECT hour_of_day, day_of_week, activity_count, total_coins_in_hour
      FROM viewer_activity_heatmap
      WHERE viewer_id = ?
    `).all(viewerId);

    // Create 7x24 matrix
    const heatmap = Array(7).fill(null).map(() => Array(24).fill(0));
    data.forEach(row => {
      heatmap[row.day_of_week][row.hour_of_day] = row.activity_count;
    });

    return heatmap;
  }

  /**
   * Get global peak times
   */
  getGlobalPeakTimes(limit = 10) {
    return this.db.prepare(`
      SELECT hour_of_day, day_of_week, SUM(activity_count) as total
      FROM viewer_activity_heatmap
      GROUP BY hour_of_day, day_of_week
      ORDER BY total DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get VIP tiers
   */
  getVIPTiers() {
    return this.db.prepare('SELECT * FROM vip_tier_config ORDER BY sort_order ASC').all();
  }

  /**
   * Get leaderboard
   */
  getLeaderboard(type = 'coins', limit = 10) {
    const ALLOWED_LEADERBOARD_FIELDS = [
      'total_coins_spent', 'total_watchtime_seconds', 'total_visits',
      'total_gifts_sent', 'total_comments'
    ];

    const sortMap = {
      'coins': 'total_coins_spent',
      'watchtime': 'total_watchtime_seconds',
      'visits': 'total_visits',
      'gifts': 'total_gifts_sent',
      'comments': 'total_comments'
    };

    const mappedField = sortMap[type] || 'total_coins_spent';
    const sortBy = ALLOWED_LEADERBOARD_FIELDS.includes(mappedField) ? mappedField : 'total_coins_spent';

    return this.db.prepare(`
      SELECT * FROM viewer_profiles
      ORDER BY ${sortBy} DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get viewers with upcoming birthdays
   */
  getUpcomingBirthdays(days = 7) {
    const results = [];
    
    // Get all viewers with birthday
    const viewers = this.db.prepare(`
      SELECT * FROM viewer_profiles
      WHERE birthday IS NOT NULL AND birthday != ''
    `).all();

    for (const viewer of viewers) {
      const daysUntil = this.calculateDaysUntilBirthday(viewer.birthday);
      if (daysUntil >= 0 && daysUntil <= days) {
        results.push({
          ...viewer,
          days_until: daysUntil
        });
      }
    }

    return results.sort((a, b) => a.days_until - b.days_until);
  }

  /**
   * Calculate days until next birthday
   */
  calculateDaysUntilBirthday(birthday) {
    if (!birthday) return -1;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [year, month, day] = birthday.split('-').map(Number);
    
    // Birthday this year
    let nextBirthday = new Date(today.getFullYear(), month - 1, day);
    
    // If already passed, next year
    if (nextBirthday < today) {
      nextBirthday = new Date(today.getFullYear() + 1, month - 1, day);
    }
    
    const diffTime = nextBirthday - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  /**
   * Get statistics summary
   */
  getStatsSummary() {
    // COUNT(*) property is never null, but the entire result object can be null in mock/test scenarios
    const totalViewersResult = this.db.prepare('SELECT COUNT(*) as count FROM viewer_profiles').get();
    const totalViewers = totalViewersResult ? totalViewersResult.count : 0;
    
    // SUM() can return null if no rows or all values are null (both result object and property can be null)
    const totalRevenueResult = this.db.prepare('SELECT SUM(total_coins_spent) as total FROM viewer_profiles').get();
    const totalRevenue = (totalRevenueResult && totalRevenueResult.total) || 0;
    
    // AVG() can return null if no rows or all values are null (both result object and property can be null)
    const avgWatchtimeResult = this.db.prepare('SELECT AVG(total_watchtime_seconds) as avg FROM viewer_profiles').get();
    const avgWatchtime = (avgWatchtimeResult && avgWatchtimeResult.avg) || 0;
    
    const topSpender = this.db.prepare('SELECT * FROM viewer_profiles ORDER BY total_coins_spent DESC LIMIT 1').get();
    
    // COUNT(*) property is never null, but the entire result object can be null in mock/test scenarios
    const vipCountResult = this.db.prepare('SELECT COUNT(*) as count FROM viewer_profiles WHERE is_vip = 1').get();
    const vipCount = vipCountResult ? vipCountResult.count : 0;
    
    // COUNT(*) property is never null, but the entire result object can be null in mock/test scenarios
    const activeViewersResult = this.db.prepare("SELECT COUNT(*) as count FROM viewer_profiles WHERE last_seen_at > datetime('now', '-30 days')").get();
    const activeViewers = activeViewersResult ? activeViewersResult.count : 0;

    return {
      totalViewers,
      totalRevenue,
      avgWatchtime: Math.round(avgWatchtime),
      topSpender: topSpender ? {
        username: topSpender.tiktok_username,
        displayName: topSpender.display_name,
        coinsSpent: topSpender.total_coins_spent
      } : null,
      vipCount,
      activeViewers
    };
  }

  /**
   * Export all viewers
   */
  exportViewers(filter = 'all') {
    let sql = 'SELECT * FROM viewer_profiles';
    
    if (filter === 'vip') {
      sql += ' WHERE is_vip = 1';
    } else if (filter === 'active') {
      sql += " WHERE last_seen_at > datetime('now', '-30 days')";
    }

    return this.db.prepare(sql).all();
  }
}

module.exports = ViewerProfilesDatabase;
