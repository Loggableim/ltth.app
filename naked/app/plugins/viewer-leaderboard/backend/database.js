/**
 * Viewer XP Database Module
 * 
 * Manages persistent storage for viewer XP, levels, badges, streaks, and statistics.
 * Uses the scoped database to ensure data isolation per streamer.
 */

const path = require('path');
const fs = require('fs');

class ViewerXPDatabase {
  constructor(api) {
    this.api = api;
    
    // CRITICAL FIX: Use the main scoped database instead of a separate file
    // This ensures viewer XP data is properly isolated per streamer
    this.db = api.getDatabase().db; // Get the underlying better-sqlite3 instance
    
    // Batch queue for high-volume writes
    this.batchQueue = [];
    this.batchTimer = null;
    this.batchSize = 50;
    
    // Batch timeout: configurable for testing, default 2 seconds for production
    this.batchTimeout = (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) 
      ? 50  // 50ms for tests
      : 2000; // 2 seconds for production
    
    // Level up callback
    this.levelUpCallback = null;
  }

  /**
   * Set level up callback
   */
  setLevelUpCallback(callback) {
    this.levelUpCallback = callback;
  }

  /**
   * Initialize database tables
   */
  initialize() {
    // Viewer profiles with XP and level
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS viewer_profiles (
        username TEXT PRIMARY KEY,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        total_xp_earned INTEGER DEFAULT 0,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_daily_bonus DATETIME,
        streak_days INTEGER DEFAULT 0,
        last_streak_date DATE,
        title TEXT,
        badges TEXT, -- JSON array
        name_color TEXT
      )
    `);

    // XP transaction log for analytics (legacy, kept for backward compatibility)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS xp_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        amount INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        details TEXT, -- JSON
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (username) REFERENCES viewer_profiles(username)
      )
    `);

    // NEW: Comprehensive XP event log with full transparency (wann/wo/wieviel)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS viewer_xp_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        event_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        xp_awarded INTEGER NOT NULL,
        meta TEXT, -- JSON: { gift_value, gift_qty, source, reason, etc. }
        created_at INTEGER NOT NULL, -- Unix timestamp for fast queries
        FOREIGN KEY (username) REFERENCES viewer_profiles(username)
      )
    `);

    // NEW: Extended configuration table for all plugin settings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS viewer_xp_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL, -- JSON
        updated_at INTEGER NOT NULL
      )
    `);

    // NEW: User opt-out tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS viewer_xp_opt_outs (
        username TEXT PRIMARY KEY,
        opted_out_at INTEGER NOT NULL,
        reason TEXT
      )
    `);

    // Daily activity tracking for streaks
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_activity (
        username TEXT NOT NULL,
        activity_date DATE NOT NULL,
        xp_earned INTEGER DEFAULT 0,
        actions_count INTEGER DEFAULT 0,
        PRIMARY KEY (username, activity_date),
        FOREIGN KEY (username) REFERENCES viewer_profiles(username)
      )
    `);

    // Badge definitions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS badge_definitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        requirement_type TEXT NOT NULL,
        requirement_value INTEGER,
        sort_order INTEGER DEFAULT 0
      )
    `);

    // Level rewards configuration
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS level_rewards (
        level INTEGER PRIMARY KEY,
        title TEXT,
        badges TEXT, -- JSON array
        name_color TEXT,
        special_effects TEXT, -- JSON array
        announcement_message TEXT
      )
    `);

    // XP action configuration
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS xp_actions (
        action_type TEXT PRIMARY KEY,
        xp_amount INTEGER NOT NULL,
        cooldown_seconds INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1
      )
    `);

    // Plugin settings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Level configuration table for customizable XP requirements
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS level_config (
        level INTEGER PRIMARY KEY,
        xp_required INTEGER NOT NULL,
        custom_title TEXT,
        custom_color TEXT
      )
    `);

    // Indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_xp_transactions_username 
        ON xp_transactions(username);
      CREATE INDEX IF NOT EXISTS idx_xp_transactions_timestamp 
        ON xp_transactions(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_xp_transactions_username_time
        ON xp_transactions(username, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_xp_transactions_action_type
        ON xp_transactions(action_type);
      CREATE INDEX IF NOT EXISTS idx_daily_activity_date 
        ON daily_activity(activity_date DESC);
      CREATE INDEX IF NOT EXISTS idx_viewer_xp 
        ON viewer_profiles(xp DESC);
      CREATE INDEX IF NOT EXISTS idx_viewer_level 
        ON viewer_profiles(level DESC);
      CREATE INDEX IF NOT EXISTS idx_viewer_last_seen
        ON viewer_profiles(last_seen DESC);
      
      -- NEW: Indexes for viewer_xp_events
      CREATE INDEX IF NOT EXISTS idx_viewer_xp_events_user_id
        ON viewer_xp_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_viewer_xp_events_username
        ON viewer_xp_events(username);
      CREATE INDEX IF NOT EXISTS idx_viewer_xp_events_type_time
        ON viewer_xp_events(event_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_viewer_xp_events_time
        ON viewer_xp_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_viewer_xp_events_username_time
        ON viewer_xp_events(username, created_at DESC);
    `);

    // Gifter Leaderboard tables (integrated from standalone leaderboard plugin)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gifter_leaderboard_alltime (
        user_id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        unique_id TEXT,
        profile_picture_url TEXT,
        total_coins INTEGER DEFAULT 0,
        last_gift_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_gifter_leaderboard_coins 
      ON gifter_leaderboard_alltime(total_coins DESC)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gifter_leaderboard_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        session_start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        top_count INTEGER DEFAULT 10,
        min_coins_to_show INTEGER DEFAULT 0,
        theme TEXT DEFAULT 'neon',
        show_animations INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize default gifter leaderboard config
    this.db.prepare(`
      INSERT OR IGNORE INTO gifter_leaderboard_config (id, top_count, min_coins_to_show, theme, show_animations)
      VALUES (1, 10, 0, 'neon', 1)
    `).run();

    // Spin wheel configuration table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spin_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER DEFAULT 1,
        min_bet INTEGER DEFAULT 100,
        max_bet INTEGER DEFAULT 50000,
        default_bet INTEGER DEFAULT 1000,
        num_fields INTEGER DEFAULT 8,
        field_values TEXT NOT NULL, -- JSON array of field values (positive/negative)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: Add default_bet column if it doesn't exist (for existing databases)
    try {
      const tableInfo = this.db.prepare(`PRAGMA table_info(spin_config)`).all();
      const hasDefaultBet = tableInfo.some(col => col.name === 'default_bet');
      
      if (!hasDefaultBet) {
        this.api.log('Adding default_bet column to spin_config table', 'info');
        this.db.exec(`ALTER TABLE spin_config ADD COLUMN default_bet INTEGER DEFAULT 1000`);
      }
    } catch (error) {
      this.api.log(`Migration warning: ${error.message}`, 'warn');
    }

    // Initialize default spin config with 8 fields (mix of positive/negative)
    this.db.prepare(`
      INSERT OR IGNORE INTO spin_config (id, enabled, min_bet, max_bet, default_bet, num_fields, field_values)
      VALUES (1, 1, 100, 50000, 1000, 8, ?)
    `).run(JSON.stringify([
      5000,   // +5000 XP
      -2000,  // -2000 XP
      1000,   // +1000 XP
      -5000,  // -5000 XP
      2000,   // +2000 XP
      -1000,  // -1000 XP
      10000,  // +10000 XP (jackpot)
      -3000   // -3000 XP
    ]));

    // Spin history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spin_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        bet_amount INTEGER NOT NULL,
        field_index INTEGER NOT NULL,
        field_value INTEGER NOT NULL,
        xp_change INTEGER NOT NULL,
        xp_before INTEGER NOT NULL,
        xp_after INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (username) REFERENCES viewer_profiles(username)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_spin_history_username 
      ON spin_history(username, timestamp DESC)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_spin_history_timestamp 
      ON spin_history(timestamp DESC)
    `);

    // Gifter leaderboard pending writes queue
    this.gifterPendingWrites = new Map();
    this.gifterSaveTimeout = null;
    this.gifterDebounceDelay = 5000; // 5 seconds
    this.gifterInsertStmt = null;

    // Initialize default XP actions
    this.initializeDefaultActions();
    
    // Initialize default badges
    this.initializeDefaultBadges();
    
    // Initialize default level rewards
    this.initializeDefaultLevelRewards();

    this.migrateCoinColumns();

    this.api.log('Viewer XP database initialized', 'info');
  }

  /**
   * Migrate viewer_profiles to include coin columns and create coin_transactions table.
   * Idempotent — safe to call on every startup.
   */
  migrateCoinColumns() {
    // Add coins column if missing
    try {
      const info = this.db.prepare('PRAGMA table_info(viewer_profiles)').all() || [];
      const hasCoins = info.some(c => c.name === 'coins');
      const hasTotalCoins = info.some(c => c.name === 'total_coins_earned');

      if (!hasCoins) {
        this.db.exec('ALTER TABLE viewer_profiles ADD COLUMN coins INTEGER DEFAULT 0');
        this.api.log('Migration: Added coins column to viewer_profiles', 'info');
      }
      if (!hasTotalCoins) {
        this.db.exec('ALTER TABLE viewer_profiles ADD COLUMN total_coins_earned INTEGER DEFAULT 0');
        this.api.log('Migration: Added total_coins_earned column to viewer_profiles', 'info');
      }
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        this.api.log(`Coin column migration error: ${error.message}`, 'error');
        throw error;
      }
    }

    // Create coin_transactions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS coin_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        source TEXT NOT NULL,
        reference_id TEXT,
        meta TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (username) REFERENCES viewer_profiles(username)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_coin_tx_username
        ON coin_transactions(username, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_coin_tx_source
        ON coin_transactions(source, created_at DESC);
    `);

    // One-time data migration: seed coins from total_xp_earned for existing users.
    // Only runs for users where coins = 0 AND total_xp_earned > 0 (never seeded yet).
    try {
      const coinRatio = parseFloat(this.getSetting('coin_xp_ratio', '1.0'));
      const affected = this.db.prepare(`
        UPDATE viewer_profiles
        SET coins = CAST(total_xp_earned * ? AS INTEGER),
            total_coins_earned = CAST(total_xp_earned * ? AS INTEGER)
        WHERE coins = 0 AND total_xp_earned > 0
      `).run(coinRatio, coinRatio);

      if (affected.changes > 0) {
        this.api.log(`Coin migration: Seeded coins for ${affected.changes} existing viewers`, 'info');
      }
    } catch (error) {
      this.api.log(`Coin seed migration error: ${error.message}`, 'warn');
    }

    this.api.log('Coin system initialized', 'info');
  }

  /**
   * Get coin balance for a viewer
   * @param {string} username
   * @returns {{ coins: number, total_coins_earned: number }}
   */
  getCoinBalance(username) {
    const row = this.db.prepare(
      'SELECT coins, total_coins_earned FROM viewer_profiles WHERE username = ?'
    ).get(username);
    return row
      ? { coins: row.coins || 0, total_coins_earned: row.total_coins_earned || 0 }
      : { coins: 0, total_coins_earned: 0 };
  }

  /**
   * Add coins to viewer (earn). Synchronous atomic transaction.
   * @param {string} username
   * @param {number} amount - Must be positive
   * @param {string} source - e.g. 'gcce_manual', 'admin', 'event'
   * @param {Object|null} meta
   * @returns {{ success: boolean, balance_after: number }}
   */
  addCoins(username, amount, source = 'manual', meta = null) {
    if (amount <= 0) {
      this.api.log(`addCoins: amount must be positive (got ${amount})`, 'warn');
      return { success: false, balance_after: this.getCoinBalance(username).coins };
    }

    try {
      this.getOrCreateViewer(username);

      const balance_after = this.db.transaction(() => {
        this.db.prepare(`
          UPDATE viewer_profiles
          SET coins = coins + ?,
              total_coins_earned = total_coins_earned + ?
          WHERE username = ?
        `).run(amount, amount, username);

        const row = this.db.prepare(
          'SELECT coins FROM viewer_profiles WHERE username = ?'
        ).get(username);
        const bal = row?.coins || 0;

        this.db.prepare(`
          INSERT INTO coin_transactions (username, amount, balance_after, source, meta, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(username, amount, bal, source, meta ? JSON.stringify(meta) : null, Date.now());

        return bal;
      })();

      return { success: true, balance_after };
    } catch (error) {
      this.api.log(`addCoins error for ${username}: ${error.message}`, 'error');
      return { success: false, balance_after: this.getCoinBalance(username).coins };
    }
  }

  /**
   * Spend coins from viewer. Atomically checks balance before deducting.
   * @param {string} username
   * @param {number} amount - Must be positive
   * @param {string} source - e.g. 'gcce_action', 'openshock', 'game'
   * @param {Object|null} meta
   * @returns {{ success: boolean, balance_after: number, error?: string }}
   */
  spendCoins(username, amount, source = 'spend', meta = null) {
    if (amount <= 0) {
      return {
        success: false,
        balance_after: this.getCoinBalance(username).coins,
        error: 'Amount must be positive'
      };
    }

    try {
      const balance_after = this.db.transaction(() => {
        const viewer = this.db.prepare(
          'SELECT coins FROM viewer_profiles WHERE username = ?'
        ).get(username);

        if (!viewer) throw new Error('VIEWER_NOT_FOUND');
        if (viewer.coins < amount) throw new Error(`INSUFFICIENT_COINS:${viewer.coins}`);

        this.db.prepare(`
          UPDATE viewer_profiles
          SET coins = coins - ?
          WHERE username = ?
        `).run(amount, username);

        const row = this.db.prepare(
          'SELECT coins FROM viewer_profiles WHERE username = ?'
        ).get(username);
        const bal = row?.coins || 0;

        this.db.prepare(`
          INSERT INTO coin_transactions (username, amount, balance_after, source, meta, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(username, -amount, bal, source, meta ? JSON.stringify(meta) : null, Date.now());

        return bal;
      })();

      return { success: true, balance_after };
    } catch (error) {
      if (error.message.startsWith('INSUFFICIENT_COINS:')) {
        const current = parseInt(error.message.split(':')[1], 10);
        return { success: false, balance_after: current, error: 'Insufficient coins' };
      }
      if (error.message === 'VIEWER_NOT_FOUND') {
        return { success: false, balance_after: 0, error: 'Viewer not found' };
      }
      this.api.log(`spendCoins error for ${username}: ${error.message}`, 'error');
      return { success: false, balance_after: this.getCoinBalance(username).coins, error: error.message };
    }
  }

  /**
   * Get coin transaction history for a viewer
   * @param {string} username
   * @param {number} limit
   * @returns {Array}
   */
  getCoinTransactionHistory(username, limit = 50) {
    return this.db.prepare(`
      SELECT * FROM coin_transactions
      WHERE username = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(username, limit).map(tx => ({
      ...tx,
      meta: tx.meta ? JSON.parse(tx.meta) : null
    }));
  }

  /**
   * Get coin leaderboard (top coin holders by current spendable balance)
   * @param {number} limit
   * @returns {Array}
   */
  getCoinLeaderboard(limit = 10) {
    return this.db.prepare(`
      SELECT username, coins, total_coins_earned, level, title, name_color
      FROM viewer_profiles
      ORDER BY coins DESC
      LIMIT ?
    `).all(limit).map((v, i) => ({ ...v, rank: i + 1 }));
  }

  /**
   * Initialize default XP action values
   */
  initializeDefaultActions() {
    const defaults = [
      { action_type: 'chat_message', xp_amount: 5, cooldown_seconds: 30 },
      { action_type: 'like', xp_amount: 2, cooldown_seconds: 60 },
      { action_type: 'share', xp_amount: 25, cooldown_seconds: 300 },
      { action_type: 'follow', xp_amount: 50, cooldown_seconds: 0 },
      { action_type: 'subscribe', xp_amount: 100, cooldown_seconds: 0 }, // NEW
      { action_type: 'gift_tier1', xp_amount: 10, cooldown_seconds: 0 },
      { action_type: 'gift_tier2', xp_amount: 20, cooldown_seconds: 0 },
      { action_type: 'gift_tier3', xp_amount: 35, cooldown_seconds: 0 },
      { action_type: 'gift_tier4', xp_amount: 60, cooldown_seconds: 0 },
      { action_type: 'gift_tier5', xp_amount: 100, cooldown_seconds: 0 },
      { action_type: 'gift_tier6', xp_amount: 200, cooldown_seconds: 0 },
      { action_type: 'gift_tier7', xp_amount: 400, cooldown_seconds: 0 },
      { action_type: 'gift_tier8', xp_amount: 800, cooldown_seconds: 0 },
      { action_type: 'watch_time_minute', xp_amount: 3, cooldown_seconds: 60 },
      { action_type: 'daily_bonus', xp_amount: 100, cooldown_seconds: 0 },
      { action_type: 'streak_bonus', xp_amount: 50, cooldown_seconds: 0 }
    ];

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO xp_actions (action_type, xp_amount, cooldown_seconds)
      VALUES (?, ?, ?)
    `);

    for (const action of defaults) {
      stmt.run(action.action_type, action.xp_amount, action.cooldown_seconds);
    }
    
    // Initialize extended configuration defaults
    this.initializeExtendedConfig();
  }

  /**
   * NEW: Initialize extended configuration with safe defaults
   */
  initializeExtendedConfig() {
    // Only set if not already configured (check each key individually for efficiency)
    const checkAndSetDefault = (key, value) => {
      try {
        const existing = this.db.prepare('SELECT 1 FROM viewer_xp_config WHERE key = ?').get(key);
        if (!existing) {
          this.setExtendedConfig(key, value);
        }
      } catch (error) {
        // Table might not exist yet, set anyway
        this.setExtendedConfig(key, value);
      }
    };
    
    const defaults = {
      // XP Multipliers
      xp_multipliers: {
        global: 1.0,
        gift_value_based: true, // Use gift coin value for XP calculation
        gift_quantity_based: false // Also consider quantity
      },
      
      // Rate Limits
      rate_limits: {
        enabled: true,
        per_user_per_event: {
          chat_message: { interval: 30, max_per_interval: 1 },
          like: { interval: 60, max_per_interval: 1 },
          share: { interval: 300, max_per_interval: 1 }
        },
        global_limits: {
          max_xp_per_5min: 10000,
          max_xp_per_hour: 50000
        }
      },
      
      // Hard Caps per Event
      event_caps: {
        chat_message: 10,
        like: 5,
        share: 50,
        gift: 10000, // Max XP per single gift
        follow: 100,
        subscribe: 200
      },
      
      // Streak & Bonus Configuration
      streaks: {
        enabled: true,
        bonus_multiplier: 1.1, // 10% bonus per streak day
        max_multiplier: 2.0 // Max 2x from streaks
      },
      
      // XP Decay (optional)
      decay: {
        enabled: false,
        rate: 0.01, // 1% per day
        min_level: 5 // Don't decay below level 5
      },
      
      // Badge Configuration
      badges: {
        enabled: true,
        custom_icons: true,
        custom_colors: true
      },
      
      // Overlay Theme
      overlay_theme: {
        primary_color: '#FFD700',
        secondary_color: '#FF6B6B',
        font_family: 'Arial, sans-serif',
        animation_duration: 3000,
        position: 'top-right'
      },
      
      // Privacy
      privacy: {
        allow_opt_out: true,
        hide_opted_out_users: true
      },
      
      // Anti-Spam
      anti_spam: {
        dedupe_window: 5000, // 5 seconds
        min_event_interval: 100 // 100ms min between any events
      },

      // Detail log retention. Aggregated viewer profile totals are never pruned.
      detail_log_retention: {
        enabled: true,
        detail_log_days: 90,
        cleanup_interval_hours: 24,
        cleanup_batch_size: 10000,
        cleanup_max_duration_ms: 5000,
        vacuum_after_cleanup: false
      }
    };
    
    // Set defaults only if not present (optimized per-key check)
    for (const [key, value] of Object.entries(defaults)) {
      checkAndSetDefault(key, value);
    }
  }

  /**
   * Initialize default badge definitions
   */
  initializeDefaultBadges() {
    const badges = [
      { id: 'newcomer', name: 'Newcomer', description: 'Joined the stream', requirement_type: 'level', requirement_value: 1, sort_order: 1 },
      { id: 'regular', name: 'Regular', description: 'Reached level 5', requirement_type: 'level', requirement_value: 5, sort_order: 2 },
      { id: 'veteran', name: 'Veteran', description: 'Reached level 10', requirement_type: 'level', requirement_value: 10, sort_order: 3 },
      { id: 'legend', name: 'Legend', description: 'Reached level 25', requirement_type: 'level', requirement_value: 25, sort_order: 4 },
      { id: 'chatterbox', name: 'Chatterbox', description: 'Sent 100 chat messages', requirement_type: 'chat_count', requirement_value: 100, sort_order: 5 },
      { id: 'generous', name: 'Generous', description: 'Sent 50 gifts', requirement_type: 'gift_count', requirement_value: 50, sort_order: 6 },
      { id: 'streak_7', name: '7-Day Streak', description: 'Attended 7 days in a row', requirement_type: 'streak', requirement_value: 7, sort_order: 7 },
      { id: 'streak_30', name: '30-Day Streak', description: 'Attended 30 days in a row', requirement_type: 'streak', requirement_value: 30, sort_order: 8 }
    ];

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO badge_definitions (id, name, description, requirement_type, requirement_value, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const badge of badges) {
      stmt.run(badge.id, badge.name, badge.description, badge.requirement_type, badge.requirement_value, badge.sort_order);
    }
  }

  /**
   * Initialize default level rewards
   */
  initializeDefaultLevelRewards() {
    const rewards = [
      { level: 1, title: 'Newcomer', name_color: '#FFFFFF', announcement_message: 'Welcome to the community!' },
      { level: 5, title: 'Regular Viewer', name_color: '#00FF00', announcement_message: '{username} reached level 5!' },
      { level: 10, title: 'Dedicated Fan', name_color: '#00BFFF', announcement_message: '{username} is now a Dedicated Fan!' },
      { level: 15, title: 'Super Fan', name_color: '#FFD700', announcement_message: '{username} became a Super Fan!' },
      { level: 20, title: 'Elite Supporter', name_color: '#FF00FF', announcement_message: '{username} is an Elite Supporter!' },
      { level: 25, title: 'Legend', name_color: '#FF4500', announcement_message: '🎉 {username} reached LEGENDARY status! 🎉' },
      { level: 30, title: 'Mythic', name_color: '#8B00FF', announcement_message: '✨ {username} is now MYTHIC! ✨' }
    ];

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO level_rewards (level, title, name_color, announcement_message)
      VALUES (?, ?, ?, ?)
    `);

    for (const reward of rewards) {
      stmt.run(reward.level, reward.title, reward.name_color, reward.announcement_message);
    }
  }

  /**
   * Get or create viewer profile
   */
  getOrCreateViewer(username) {
    let viewer = this.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get(username);
    
    if (!viewer) {
      this.db.prepare(`
        INSERT INTO viewer_profiles (username, xp, level, total_xp_earned)
        VALUES (?, 0, 1, 0)
      `).run(username);
      
      viewer = this.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get(username);
      
      // Parse JSON fields
      viewer.badges = viewer.badges ? JSON.parse(viewer.badges) : [];
    } else {
      // Parse JSON fields
      viewer.badges = viewer.badges ? JSON.parse(viewer.badges) : [];
    }
    
    return viewer;
  }

  /**
   * Update viewer's last seen timestamp
   */
  updateLastSeen(username) {
    this.db.prepare(`
      UPDATE viewer_profiles 
      SET last_seen = CURRENT_TIMESTAMP 
      WHERE username = ?
    `).run(username);
  }

  /**
   * Add XP to viewer (batched for performance, with opt-out and event logging)
   * @param {string} username - Username
   * @param {number} amount - XP amount
   * @param {string} actionType - Action type
   * @param {Object} details - Additional details (userId, meta, etc.)
   */
  addXP(username, amount, actionType, details = null) {
    // NEW: Check if user has opted out
    if (this.isUserOptedOut(username)) {
      this.api.log(`User ${username} has opted out, skipping XP award`, 'debug');
      return;
    }

    this.batchQueue.push({
      username,
      amount,
      actionType,
      details
    });

    // Process batch if size threshold reached
    if (this.batchQueue.length >= this.batchSize) {
      this.processBatch();
    } else {
      // Schedule batch processing
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }
      this.batchTimer = setTimeout(() => this.processBatch(), this.batchTimeout);
    }
  }

  /**
   * Process batched XP additions (enhanced with event logging)
   */
  processBatch() {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const coinRatio = parseFloat(this.getSetting('coin_xp_ratio', '1.0'));

    const transaction = this.db.transaction((items) => {
      const updateStmt = this.db.prepare(`
        UPDATE viewer_profiles
        SET xp = xp + ?,
            total_xp_earned = total_xp_earned + ?,
            coins = coins + ?,
            total_coins_earned = total_coins_earned + ?,
            last_seen = CURRENT_TIMESTAMP
        WHERE username = ?
      `);

      const coinBalStmt = this.db.prepare(
        'SELECT coins FROM viewer_profiles WHERE username = ?'
      );

      const coinLogStmt = this.db.prepare(`
        INSERT INTO coin_transactions (username, amount, balance_after, source, meta, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const logStmt = this.db.prepare(`
        INSERT INTO xp_transactions (username, amount, action_type, details)
        VALUES (?, ?, ?, ?)
      `);

      for (const item of items) {
        // Ensure viewer exists
        this.getOrCreateViewer(item.username);

        // Coins only on positive XP (spending XP via Spin/Plinko does NOT deduct coins)
        const coinsToAward = item.amount > 0 ? Math.floor(item.amount * coinRatio) : 0;

        // Add XP (and coins)
        updateStmt.run(
          item.amount,                   // xp delta (can be negative)
          Math.max(0, item.amount),      // total_xp_earned (never negative)
          coinsToAward,                  // coins delta (only positive awards)
          coinsToAward,                  // total_coins_earned delta
          item.username
        );

        if (coinsToAward > 0) {
          const coinRow = coinBalStmt.get(item.username);
          const balanceAfter = coinRow?.coins || 0;
          coinLogStmt.run(
            item.username,
            coinsToAward,
            balanceAfter,
            'xp_gain',
            JSON.stringify({ actionType: item.actionType, xp: item.amount }),
            Date.now()
          );
        }

        // Log transaction (legacy)
        logStmt.run(
          item.username, 
          item.amount, 
          item.actionType, 
          item.details ? JSON.stringify(item.details) : null
        );

        // NEW: Log to new XP events table with full details
        const eventMeta = item.details || {};
        this.logXPEvent({
          user_id: eventMeta.userId || 'unknown',
          username: item.username,
          event_type: item.actionType,
          amount: eventMeta.originalAmount || item.amount,
          xp_awarded: item.amount,
          meta: eventMeta
        });
      }
    });

    transaction(batch);

    // Check for level ups after batch
    const levelUps = this.checkLevelUps(batch.map(b => b.username));
    
    // Return level ups for the plugin to handle
    return levelUps;
  }

  /**
   * Check and process level ups for viewers
   */
  checkLevelUps(usernames) {
    const uniqueUsernames = [...new Set(usernames)];
    const levelUps = [];

    for (const username of uniqueUsernames) {
      const viewer = this.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get(username);
      if (!viewer) continue;

      const newLevel = this.calculateLevel(viewer.xp);
      
      if (newLevel > viewer.level) {
        // Level up!
        this.db.prepare('UPDATE viewer_profiles SET level = ? WHERE username = ?')
          .run(newLevel, username);
        
        // Apply level rewards
        const rewards = this.getLevelRewards(newLevel);
        if (rewards) {
          if (rewards.title) {
            this.db.prepare('UPDATE viewer_profiles SET title = ? WHERE username = ?')
              .run(rewards.title, username);
          }
          if (rewards.name_color) {
            this.db.prepare('UPDATE viewer_profiles SET name_color = ? WHERE username = ?')
              .run(rewards.name_color, username);
          }
        }
        
        const levelUpData = {
          username,
          oldLevel: viewer.level,
          newLevel,
          rewards
        };
        
        levelUps.push(levelUpData);
        
        // Call level up callback if set
        if (this.levelUpCallback) {
          try {
            this.levelUpCallback(levelUpData);
          } catch (error) {
            this.api.log(`Error in level up callback: ${error.message}`, 'error');
          }
        }
      }
    }

    return levelUps;
  }

  /**
   * Calculate level from XP (supports custom level configs)
   */
  calculateLevel(xp) {
    const levelType = this.getSetting('levelType', 'exponential');
    
    if (levelType === 'custom') {
      // Use custom level configuration from database
      const customLevels = this.db.prepare(`
        SELECT level FROM level_config 
        WHERE xp_required <= ? 
        ORDER BY xp_required DESC 
        LIMIT 1
      `).get(xp);
      
      if (customLevels) {
        return customLevels.level;
      }
    }
    
    if (levelType === 'linear') {
      // Linear progression: xpPerLevel setting
      const xpPerLevel = parseInt(this.getSetting('xpPerLevel', '1000'));
      return Math.floor(xp / xpPerLevel) + 1;
    }
    
    // Default: Exponential
    // Level formula: level = floor(sqrt(xp / 100)) + 1
    // This means: Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 400 XP, Level 4 = 900 XP, etc.
    return Math.floor(Math.sqrt(xp / 100)) + 1;
  }

  /**
   * Calculate XP required for a specific level
   */
  getXPForLevel(level) {
    const levelType = this.getSetting('levelType', 'exponential');
    
    if (levelType === 'custom') {
      // Use custom level configuration
      const config = this.db.prepare('SELECT xp_required FROM level_config WHERE level = ?').get(level);
      if (config) {
        return config.xp_required;
      }
    }
    
    if (levelType === 'linear') {
      // Linear progression
      const xpPerLevel = parseInt(this.getSetting('xpPerLevel', '1000'));
      return (level - 1) * xpPerLevel;
    }
    
    // Default: Exponential
    // Inverse of calculateLevel: xp = (level - 1)^2 * 100
    return Math.pow(level - 1, 2) * 100;
  }

  /**
   * Get level rewards for a specific level
   * Returns the highest level reward that is less than or equal to the user's level
   */
  getLevelRewards(level) {
    const reward = this.db.prepare('SELECT * FROM level_rewards WHERE level <= ? ORDER BY level DESC LIMIT 1').get(level);
    if (reward && reward.special_effects) {
      try {
        reward.special_effects = typeof reward.special_effects === 'string' 
          ? JSON.parse(reward.special_effects) 
          : reward.special_effects;
      } catch (error) {
        reward.special_effects = null;
        this.api.log(`Failed to parse special_effects for level ${level}: ${error.message}`, 'debug');
      }
    }
    return reward;
  }

  /**
   * Get all level rewards
   * @returns {Array}
   */
  getAllLevelRewards() {
    const rows = this.db.prepare('SELECT * FROM level_rewards ORDER BY level ASC').all();
    return rows.map((row) => {
      if (row.special_effects) {
        try {
          row.special_effects = typeof row.special_effects === 'string'
            ? JSON.parse(row.special_effects)
            : row.special_effects;
        } catch {
          row.special_effects = null;
        }
      }
      return row;
    });
  }

  /**
   * Save or update a level reward
   * @param {{level:number,title?:string,name_color?:string,announcement_message?:string,special_effects?:object}} reward
   */
  upsertLevelReward(reward) {
    const stmt = this.db.prepare(`
      INSERT INTO level_rewards (level, title, name_color, announcement_message, special_effects)
      VALUES (@level, @title, @name_color, @announcement_message, @special_effects)
      ON CONFLICT(level) DO UPDATE SET
        title = excluded.title,
        name_color = excluded.name_color,
        announcement_message = excluded.announcement_message,
        special_effects = excluded.special_effects
    `);

    stmt.run({
      level: reward.level,
      title: reward.title || null,
      name_color: reward.name_color || null,
      announcement_message: reward.announcement_message || null,
      special_effects: reward.special_effects ? JSON.stringify(reward.special_effects) : null
    });
  }

  /**
   * Delete level reward
   * @param {number} level
   */
  deleteLevelReward(level) {
    this.db.prepare('DELETE FROM level_rewards WHERE level = ?').run(level);
  }

  /**
   * Update daily activity and check for streak
   */
  updateDailyActivity(username) {
    const today = new Date().toISOString().split('T')[0];
    const viewer = this.getOrCreateViewer(username);
    
    // Check if already logged in today
    const todayActivity = this.db.prepare(`
      SELECT * FROM daily_activity 
      WHERE username = ? AND activity_date = ?
    `).get(username, today);

    if (!todayActivity) {
      // New day activity
      this.db.prepare(`
        INSERT INTO daily_activity (username, activity_date, xp_earned, actions_count)
        VALUES (?, ?, 0, 0)
      `).run(username, today);

      // Check streak
      const lastStreakDate = viewer.last_streak_date;
      let newStreak = 1;
      
      if (lastStreakDate) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        if (lastStreakDate === yesterdayStr) {
          // Continuing streak
          newStreak = (viewer.streak_days || 0) + 1;
        }
      }
      
      // Update streak
      this.db.prepare(`
        UPDATE viewer_profiles 
        SET streak_days = ?, last_streak_date = ?
        WHERE username = ?
      `).run(newStreak, today, username);

      // Award streak bonus if streak >= 2
      if (newStreak >= 2) {
        const streakAction = this.getXPAction('streak_bonus');
        if (streakAction && streakAction.enabled) {
          this.addXP(username, streakAction.xp_amount, 'streak_bonus', { streak: newStreak });
        }
      }

      return { firstToday: true, streak: newStreak };
    }

    return { firstToday: false, streak: viewer.streak_days || 0 };
  }

  /**
   * Award daily bonus
   */
  awardDailyBonus(username) {
    const viewer = this.getOrCreateViewer(username);
    const today = new Date().toISOString().split('T')[0];
    const lastBonus = viewer.last_daily_bonus ? viewer.last_daily_bonus.split(' ')[0] : null;

    if (lastBonus !== today) {
      const bonusAction = this.getXPAction('daily_bonus');
      if (bonusAction && bonusAction.enabled) {
        this.addXP(username, bonusAction.xp_amount, 'daily_bonus');
        this.db.prepare(`
          UPDATE viewer_profiles 
          SET last_daily_bonus = CURRENT_TIMESTAMP 
          WHERE username = ?
        `).run(username);
        return true;
      }
    }
    return false;
  }

  /**
   * Get XP action configuration
   */
  getXPAction(actionType) {
    return this.db.prepare('SELECT * FROM xp_actions WHERE action_type = ?').get(actionType);
  }

  /**
   * Get all XP actions
   */
  getAllXPActions() {
    return this.db.prepare('SELECT * FROM xp_actions ORDER BY action_type').all();
  }

  /**
   * Update XP action configuration
   */
  updateXPAction(actionType, xpAmount, cooldownSeconds, enabled = true) {
    this.db.prepare(`
      INSERT OR REPLACE INTO xp_actions (action_type, xp_amount, cooldown_seconds, enabled)
      VALUES (?, ?, ?, ?)
    `).run(actionType, xpAmount, cooldownSeconds, enabled ? 1 : 0);
  }

  /**
   * Get viewer profile with full details
   */
  getViewerProfile(username) {
    const viewer = this.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get(username);
    if (!viewer) return null;

    // Parse JSON fields
    viewer.badges = viewer.badges ? JSON.parse(viewer.badges) : [];

    // Calculate progress to next level
    const currentLevelXP = this.getXPForLevel(viewer.level);
    const nextLevelXP = this.getXPForLevel(viewer.level + 1);
    viewer.xp_for_next_level = nextLevelXP - currentLevelXP;
    viewer.xp_progress = viewer.xp - currentLevelXP;
    viewer.xp_progress_percent = ((viewer.xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;

    return viewer;
  }

  /**
   * Search viewer profiles by username (partial match)
   * @param {string} term
   * @param {number} limit
   */
  searchViewers(term, limit = 10) {
    if (!term || typeof term !== 'string') return [];
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    const likeTerm = `%${term}%`;

    return this.db.prepare(`
      SELECT username, level, xp
      FROM viewer_profiles
      WHERE username LIKE ?
      ORDER BY username COLLATE NOCASE ASC
      LIMIT ?
    `).all(likeTerm, safeLimit);
  }

  /**
   * Get top viewers by XP (leaderboard)
   */
  getTopViewers(limit = 10, days = null) {
    if (days) {
      // Leaderboard for last N days
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().split('T')[0];

      const leaderboard = this.db.prepare(`
        SELECT 
          v.username,
          v.level,
          v.xp,
          v.total_xp_earned,
          v.title,
          v.name_color,
          SUM(t.amount) as xp_period
        FROM viewer_profiles v
        JOIN xp_transactions t ON v.username = t.username
        WHERE DATE(t.timestamp) >= ?
        GROUP BY v.username
        ORDER BY xp_period DESC
        LIMIT ?
      `).all(sinceStr, limit);
      
      return leaderboard.map((viewer, index) => {
        const progress = this.calculateProgress(viewer.xp || 0, viewer.level);
        return {
          ...viewer,
          ...progress,
          rank: index + 1
        };
      });
    } else {
      // All-time leaderboard
      const leaderboard = this.db.prepare(`
        SELECT username, xp, level, title, name_color, total_xp_earned
        FROM viewer_profiles
        ORDER BY xp DESC
        LIMIT ?
      `).all(limit);

      return leaderboard.map((viewer, index) => {
        const progress = this.calculateProgress(viewer.xp || 0, viewer.level);
        return {
          ...viewer,
          ...progress,
          rank: index + 1
        };
      });
    }
  }

  /**
   * Get viewer statistics
   */
  getViewerStats(username) {
    const stats = {};
    
    // Total XP earned
    const profile = this.getViewerProfile(username);
    if (!profile) return null;
    
    stats.profile = profile;

    // Action breakdown
    stats.actions = this.db.prepare(`
      SELECT action_type, COUNT(*) as count, SUM(amount) as total_xp
      FROM xp_transactions
      WHERE username = ?
      GROUP BY action_type
      ORDER BY total_xp DESC
    `).all(username);

    // Daily activity
    stats.dailyActivity = this.db.prepare(`
      SELECT activity_date, xp_earned, actions_count
      FROM daily_activity
      WHERE username = ?
      ORDER BY activity_date DESC
      LIMIT 30
    `).all(username);

    return stats;
  }

  /**
   * Calculate XP progress values for UI display
   * @param {number} xp - Current XP
   * @param {number} level - Current level
   * @returns {{xp_progress: number, xp_for_next_level: number, xp_progress_percent: number}}
   */
  calculateProgress(xp, level) {
    const currentLevelXP = this.getXPForLevel(level);
    const nextLevelXP = this.getXPForLevel(level + 1);
    const xpForNextLevel = nextLevelXP - currentLevelXP;
    const xpProgress = xp - currentLevelXP;
    const progressPercent = xpForNextLevel > 0
      ? Math.max(0, Math.min((xpProgress / xpForNextLevel) * 100, 100))
      : 0;

    return {
      xp_progress: xpProgress,
      xp_for_next_level: xpForNextLevel,
      xp_progress_percent: progressPercent
    };
  }

  /**
   * Get overall statistics
   */
  getOverallStats() {
    const stats = {};

    stats.totalViewers = this.db.prepare('SELECT COUNT(*) as count FROM viewer_profiles').get().count;
    stats.totalXPEarned = this.db.prepare('SELECT SUM(total_xp_earned) as total FROM viewer_profiles').get().total || 0;
    stats.avgLevel = this.db.prepare('SELECT AVG(level) as avg FROM viewer_profiles').get().avg || 1;
    stats.maxLevel = this.db.prepare('SELECT MAX(level) as max FROM viewer_profiles').get().max || 1;

    stats.activeToday = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM daily_activity 
      WHERE activity_date = DATE('now')
    `).get().count;

    stats.levelDistribution = this.db.prepare(`
      SELECT level, COUNT(*) as count
      FROM viewer_profiles
      GROUP BY level
      ORDER BY level
    `).all();

    return stats;
  }

  /**
   * Get or set plugin setting
   */
  getSetting(key, defaultValue = null) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (row) {
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    }
    return defaultValue;
  }

  setSetting(key, value) {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value)
      VALUES (?, ?)
    `).run(key, valueStr);
  }

  /**
   * Get normalized detail-log retention configuration.
   * These settings affect only analytics/detail tables, never viewer_profiles.
   */
  getDetailLogRetentionConfig(overrides = {}) {
    const defaults = {
      enabled: true,
      detail_log_days: 90,
      cleanup_interval_hours: 24,
      cleanup_batch_size: 10000,
      cleanup_max_duration_ms: 5000,
      vacuum_after_cleanup: false
    };

    const stored = this.getExtendedConfig('detail_log_retention', {});
    const config = {
      ...defaults,
      ...(stored && typeof stored === 'object' ? stored : {}),
      ...overrides
    };

    if (overrides.retentionDays !== undefined) {
      config.detail_log_days = overrides.retentionDays;
    }
    if (overrides.batchSize !== undefined) {
      config.cleanup_batch_size = overrides.batchSize;
    }

    return {
      enabled: config.enabled !== false,
      detail_log_days: this.normalizeRetentionInteger(config.detail_log_days, defaults.detail_log_days, 1, 3650),
      cleanup_interval_hours: this.normalizeRetentionInteger(config.cleanup_interval_hours, defaults.cleanup_interval_hours, 1, 24 * 30),
      cleanup_batch_size: this.normalizeRetentionInteger(config.cleanup_batch_size, defaults.cleanup_batch_size, 100, 100000),
      cleanup_max_duration_ms: this.normalizeRetentionInteger(config.cleanup_max_duration_ms, defaults.cleanup_max_duration_ms, 1000, 60000),
      vacuum_after_cleanup: config.vacuum_after_cleanup === true
    };
  }

  normalizeRetentionInteger(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }

  formatSqliteDateTime(timestampMs) {
    return new Date(timestampMs).toISOString().slice(0, 19).replace('T', ' ');
  }

  /**
   * Prune old XP/coin detail logs while preserving aggregate viewer state.
   * @param {Object} options
   * @param {number} [options.now] - Millisecond timestamp, mainly for tests
   * @param {number} [options.retentionDays] - Override configured detail_log_days
   * @param {number} [options.batchSize] - Override configured cleanup_batch_size
   * @returns {{skipped?: boolean, deleted: Object, totalDeleted: number, hasMore: boolean}}
   */
  cleanupDetailLogs(options = {}) {
    const config = this.getDetailLogRetentionConfig(options);
    const deleted = {
      xp_transactions: 0,
      viewer_xp_events: 0,
      coin_transactions: 0
    };

    if (!config.enabled) {
      return {
        skipped: true,
        reason: 'disabled',
        deleted,
        totalDeleted: 0,
        hasMore: false
      };
    }

    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const cutoffMs = now - (config.detail_log_days * 24 * 60 * 60 * 1000);
    const cutoffSqlTime = this.formatSqliteDateTime(cutoffMs);
    const batchSize = config.cleanup_batch_size;

    const pruneBatch = this.db.transaction(() => {
      deleted.xp_transactions = this.db.prepare(`
        DELETE FROM xp_transactions
        WHERE id IN (
          SELECT id FROM xp_transactions
          WHERE timestamp < ?
          ORDER BY timestamp ASC
          LIMIT ?
        )
      `).run(cutoffSqlTime, batchSize).changes;

      deleted.viewer_xp_events = this.db.prepare(`
        DELETE FROM viewer_xp_events
        WHERE id IN (
          SELECT id FROM viewer_xp_events
          WHERE created_at < ?
          ORDER BY created_at ASC
          LIMIT ?
        )
      `).run(cutoffMs, batchSize).changes;

      deleted.coin_transactions = this.db.prepare(`
        DELETE FROM coin_transactions
        WHERE id IN (
          SELECT id FROM coin_transactions
          WHERE created_at < ?
          ORDER BY created_at ASC
          LIMIT ?
        )
      `).run(cutoffMs, batchSize).changes;
    });

    pruneBatch();

    const totalDeleted = Object.values(deleted).reduce((sum, value) => sum + value, 0);
    const hasMore = Object.values(deleted).some((value) => value >= batchSize);

    if (config.vacuum_after_cleanup && totalDeleted > 0) {
      try {
        this.db.exec('VACUUM');
      } catch (error) {
        this.api.log(`Detail log VACUUM failed: ${error.message}`, 'warn');
      }
    }

    return {
      skipped: false,
      retentionDays: config.detail_log_days,
      cutoffMs,
      cutoffSqlTime,
      deleted,
      totalDeleted,
      hasMore
    };
  }

  /**
   * Set custom level configuration
   */
  setLevelConfig(levelConfigs) {
    const transaction = this.db.transaction((configs) => {
      // Clear existing custom configs
      this.db.prepare('DELETE FROM level_config').run();
      
      // Insert new configs
      const stmt = this.db.prepare(`
        INSERT INTO level_config (level, xp_required, custom_title, custom_color)
        VALUES (?, ?, ?, ?)
      `);
      
      for (const config of configs) {
        stmt.run(
          config.level,
          config.xp_required,
          config.custom_title || null,
          config.custom_color || null
        );
      }
    });
    
    transaction(levelConfigs);
  }

  /**
   * Get all level configurations
   */
  getAllLevelConfigs() {
    return this.db.prepare(`
      SELECT * FROM level_config 
      ORDER BY level ASC
    `).all();
  }

  /**
   * Generate level configs based on type and settings
   */
  generateLevelConfigs(type, settings = {}) {
    const maxLevel = settings.maxLevel || settings.count || 50;
    const startXP = settings.startXP || settings.baseXP || 100;
    const configs = [];
    
    if (type === 'linear') {
      const xpPerLevel = settings.xpPerLevel || 1000;
      for (let level = 1; level <= maxLevel; level++) {
        configs.push({
          level,
          xp_required: (level - 1) * xpPerLevel
        });
      }
    } else if (type === 'exponential') {
      const baseXP = settings.baseXP || 100;
      for (let level = 1; level <= maxLevel; level++) {
        configs.push({
          level,
          xp_required: Math.pow(level - 1, 2) * baseXP
        });
      }
    } else if (type === 'logarithmic') {
      const multiplier = settings.multiplier || 500;
      for (let level = 1; level <= maxLevel; level++) {
        configs.push({
          level,
          xp_required: level === 1 ? 0 : Math.floor(multiplier * Math.log(level) * level)
        });
      }
    } else {
      // Custom growth rates used by UI generator (slow/medium/fast/extreme)
      const rates = {
        slow: 1.1,
        medium: 1.2,
        fast: 1.5,
        extreme: 2.0
      };
      const rate = rates[type] || rates.medium;
      let xpForNext = startXP;
      let totalXP = 0;

      for (let level = 1; level <= maxLevel; level++) {
        if (level > 1) {
          totalXP += xpForNext;
          xpForNext = Math.floor(xpForNext * rate);
        }
        configs.push({
          level,
          xp_required: totalXP
        });
      }
    }
    
    return configs;
  }

  /**
   * Get viewer XP history/timeline
   */
  getViewerHistory(username, limit = 50) {
    return this.db.prepare(`
      SELECT * FROM xp_transactions
      WHERE username = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(username, limit);
  }

  /**
   * Export all viewer data
   */
  exportViewerData() {
    const data = {
      profiles: this.db.prepare('SELECT * FROM viewer_profiles').all(),
      transactions: this.db.prepare('SELECT * FROM xp_transactions ORDER BY timestamp DESC LIMIT 10000').all(),
      levelRewards: this.db.prepare('SELECT * FROM level_rewards').all(),
      levelConfig: this.db.prepare('SELECT * FROM level_config').all(),
      settings: this.db.prepare('SELECT * FROM settings').all(),
      exportDate: new Date().toISOString()
    };
    
    return data;
  }

  /**
   * Get recent manual XP awards
   * @param {number} limit
   * @returns {Array<{username: string, amount: number, reason: string|null, timestamp: string}>}
   */
  getManualAwards(limit = 10) {
    const rows = this.db.prepare(`
      SELECT username, amount, details, timestamp
      FROM xp_transactions
      WHERE action_type = 'manual_award'
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);

    return rows.map((row) => {
      let reason = null;
      if (row.details) {
        try {
          const parsed = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
          reason = parsed?.reason || null;
        } catch {
          reason = null;
        }
      }

      return {
        username: row.username,
        amount: row.amount,
        reason,
        timestamp: row.timestamp
      };
    });
  }

  /**
   * Import viewer data
   */
  importViewerData(data) {
    const transaction = this.db.transaction(() => {
      // Import profiles
      if (data.profiles && data.profiles.length > 0) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO viewer_profiles 
          (username, xp, level, total_xp_earned, first_seen, last_seen, 
           last_daily_bonus, streak_days, last_streak_date, title, badges, name_color)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const profile of data.profiles) {
          stmt.run(
            profile.username, profile.xp, profile.level, profile.total_xp_earned,
            profile.first_seen, profile.last_seen, profile.last_daily_bonus,
            profile.streak_days, profile.last_streak_date, profile.title,
            profile.badges, profile.name_color
          );
        }
      }
      
      // Import level config if present
      if (data.levelConfig && data.levelConfig.length > 0) {
        this.db.prepare('DELETE FROM level_config').run();
        const stmt = this.db.prepare(`
          INSERT INTO level_config (level, xp_required, custom_title, custom_color)
          VALUES (?, ?, ?, ?)
        `);
        
        for (const config of data.levelConfig) {
          stmt.run(config.level, config.xp_required, config.custom_title, config.custom_color);
        }
      }
    });
    
    transaction();
  }

  /**
   * Process events from the main event_logs table
   * Used for recovery or initial sync
   * @param {number} limit - Maximum number of events to process
   * @param {string} since - ISO timestamp to process events after
   * @returns {Object} Statistics about processed events
   */
  processEventsFromLog(limit = 1000, since = null) {
    try {
      // Get main database instance
      const mainDb = this.api.getDatabase();
      
      // Build query
      const conditions = [];
      const params = [];
      
      // Only process relevant event types
      conditions.push("event_type IN ('chat', 'gift', 'follow', 'share', 'like', 'join')");
      
      if (since) {
        conditions.push('timestamp > ?');
        params.push(since);
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `SELECT * FROM event_logs ${whereClause} ORDER BY timestamp ASC LIMIT ?`;
      params.push(limit);
      
      const events = mainDb.db.prepare(sql).all(...params);
      
      this.api.log(`Processing ${events.length} events from event_logs`, 'info');
      
      const stats = {
        total: events.length,
        processed: 0,
        skipped: 0,
        errors: 0,
        byType: {}
      };
      
      // Process each event
      for (const event of events) {
        try {
          const eventData = JSON.parse(event.data || '{}');
          const username = event.username || eventData.username || eventData.uniqueId;
          
          if (!username) {
            stats.skipped++;
            continue;
          }
          
          // Track by type
          if (!stats.byType[event.event_type]) {
            stats.byType[event.event_type] = 0;
          }
          stats.byType[event.event_type]++;
          
          // Process based on event type
          switch (event.event_type) {
            case 'chat':
              this.processEventLogChatMessage(username, eventData);
              break;
            case 'gift':
              this.processEventLogGift(username, eventData);
              break;
            case 'follow':
              this.processEventLogFollow(username, eventData);
              break;
            case 'share':
              this.processEventLogShare(username, eventData);
              break;
            case 'like':
              this.processEventLogLike(username, eventData);
              break;
            case 'join':
              this.processEventLogJoin(username, eventData);
              break;
            default:
              stats.skipped++;
              continue;
          }
          
          stats.processed++;
        } catch (error) {
          this.api.log(`Error processing event ${event.id}: ${error.message}`, 'error');
          stats.errors++;
        }
      }
      
      // Flush any pending batched XP additions
      this.processBatch();
      
      this.api.log(`Event processing complete: ${stats.processed} processed, ${stats.skipped} skipped, ${stats.errors} errors`, 'info');
      
      return stats;
    } catch (error) {
      this.api.log(`Error in processEventsFromLog: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Process chat message from event log
   */
  processEventLogChatMessage(username, data) {
    const action = this.getXPAction('chat_message');
    if (action && action.enabled) {
      this.addXP(username, action.xp_amount, 'chat_message', { 
        message: data.comment || data.message,
        fromEventLog: true
      });
      this.updateLastSeen(username);
    }
  }

  /**
   * Process gift from event log
   */
  processEventLogGift(username, data) {
    const coins = data.coins || data.diamondCount || 0;
    let actionType = 'gift_tier1';
    
    // Determine gift tier based on coin value
    if (coins >= 100) {
      actionType = 'gift_tier3';
    } else if (coins >= 10) {
      actionType = 'gift_tier2';
    }
    
    const action = this.getXPAction(actionType);
    if (action && action.enabled) {
      this.addXP(username, action.xp_amount, actionType, { 
        giftName: data.giftName || 'Unknown',
        coins: coins,
        fromEventLog: true
      });
      this.updateLastSeen(username);
    }
  }

  /**
   * Process follow from event log
   */
  processEventLogFollow(username, data) {
    const action = this.getXPAction('follow');
    if (action && action.enabled) {
      this.addXP(username, action.xp_amount, 'follow', { fromEventLog: true });
      this.updateLastSeen(username);
    }
  }

  /**
   * Process share from event log
   */
  processEventLogShare(username, data) {
    const action = this.getXPAction('share');
    if (action && action.enabled) {
      this.addXP(username, action.xp_amount, 'share', { fromEventLog: true });
      this.updateLastSeen(username);
    }
  }

  /**
   * Process like from event log
   */
  processEventLogLike(username, data) {
    const action = this.getXPAction('like');
    if (action && action.enabled) {
      this.addXP(username, action.xp_amount, 'like', { 
        likeCount: data.likeCount || 1,
        fromEventLog: true
      });
      this.updateLastSeen(username);
    }
  }

  /**
   * Process join event from event log
   */
  processEventLogJoin(username, data) {
    // Just update last seen for join events
    this.updateLastSeen(username);
  }


  /**
   * Gifter Leaderboard Methods
   * Integrated from standalone leaderboard plugin
   */

  /**
   * Get gifter leaderboard config
   */
  getGifterLeaderboardConfig() {
    try {
      const stmt = this.db.prepare('SELECT * FROM gifter_leaderboard_config WHERE id = 1');
      return stmt.get() || { top_count: 10, min_coins_to_show: 0, theme: 'neon', show_animations: 1 };
    } catch (error) {
      this.api.log(`Error getting gifter leaderboard config: ${error.message}`, 'error');
      return { top_count: 10, min_coins_to_show: 0, theme: 'neon', show_animations: 1 };
    }
  }

  /**
   * Update gifter leaderboard config
   */
  updateGifterLeaderboardConfig(config) {
    try {
      const stmt = this.db.prepare(`
        UPDATE gifter_leaderboard_config 
        SET top_count = ?, min_coins_to_show = ?, theme = ?, show_animations = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `);
      stmt.run(
        config.top_count || 10,
        config.min_coins_to_show || 0,
        config.theme || 'neon',
        config.show_animations !== undefined ? (config.show_animations ? 1 : 0) : 1
      );
      this.api.log('Gifter leaderboard config updated', 'info');
    } catch (error) {
      this.api.log(`Error updating gifter leaderboard config: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Add coins to gifter leaderboard with debouncing
   */
  addGifterCoins(userId, nickname, uniqueId, profilePictureUrl, coins) {
    if (!userId || typeof coins !== 'number' || coins <= 0) {
      this.api.log(`Invalid gift data for leaderboard: userId=${userId}, coins=${coins}`, 'warn');
      return;
    }

    const existing = this.gifterPendingWrites.get(userId) || {
      userId,
      nickname: nickname || 'Unknown',
      uniqueId: uniqueId || '',
      profilePictureUrl: profilePictureUrl || '',
      coins: 0
    };

    existing.coins += coins;
    if (nickname) existing.nickname = nickname;
    if (uniqueId) existing.uniqueId = uniqueId;
    if (profilePictureUrl) existing.profilePictureUrl = profilePictureUrl;

    this.gifterPendingWrites.set(userId, existing);
    this.scheduleGifterDebouncedWrite();
  }

  /**
   * Schedule debounced write for gifter leaderboard
   */
  scheduleGifterDebouncedWrite() {
    if (this.gifterSaveTimeout) {
      clearTimeout(this.gifterSaveTimeout);
    }

    this.gifterSaveTimeout = setTimeout(() => {
      this.flushGifterPendingWrites();
    }, this.gifterDebounceDelay);
  }

  /**
   * Flush pending gifter leaderboard writes
   */
  flushGifterPendingWrites() {
    if (this.gifterPendingWrites.size === 0) {
      return;
    }

    try {
      if (!this.gifterInsertStmt) {
        this.gifterInsertStmt = this.db.prepare(`
          INSERT INTO gifter_leaderboard_alltime 
            (user_id, nickname, unique_id, profile_picture_url, total_coins, last_gift_at, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET
            nickname = excluded.nickname,
            unique_id = excluded.unique_id,
            profile_picture_url = excluded.profile_picture_url,
            total_coins = total_coins + excluded.total_coins,
            last_gift_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        `);
      }

      const transaction = this.db.transaction((writes) => {
        for (const write of writes) {
          this.gifterInsertStmt.run(
            write.userId,
            write.nickname,
            write.uniqueId,
            write.profilePictureUrl,
            write.coins
          );
        }
      });

      transaction([...this.gifterPendingWrites.values()]);
      this.api.log(`Flushed ${this.gifterPendingWrites.size} gifter leaderboard writes`, 'info');
      this.gifterPendingWrites.clear();
    } catch (error) {
      this.api.log(`Error flushing gifter leaderboard writes: ${error.message}`, 'error');
    }
  }

  /**
   * Get top gifters from all-time leaderboard
   */
  getTopGifters(limit = 10, minCoins = 0) {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          user_id,
          nickname,
          unique_id,
          profile_picture_url,
          total_coins,
          last_gift_at,
          created_at
        FROM gifter_leaderboard_alltime
        WHERE total_coins >= ?
        ORDER BY total_coins DESC
        LIMIT ?
      `);
      return stmt.all(minCoins, limit);
    } catch (error) {
      this.api.log(`Error getting top gifters: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Get gifter stats and rank
   */
  getGifterStats(userId) {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as rank
        FROM gifter_leaderboard_alltime
        WHERE total_coins > (
          SELECT total_coins FROM gifter_leaderboard_alltime WHERE user_id = ?
        )
      `);
      const rankData = stmt.get(userId);

      const userStmt = this.db.prepare(`
        SELECT * FROM gifter_leaderboard_alltime WHERE user_id = ?
      `);
      const userData = userStmt.get(userId);

      if (!userData) {
        return null;
      }

      return {
        ...userData,
        rank: (rankData?.rank || 0) + 1
      };
    } catch (error) {
      this.api.log(`Error getting gifter stats: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * Reset gifter leaderboard session
   */
  resetGifterSession() {
    try {
      const stmt = this.db.prepare(`
        UPDATE gifter_leaderboard_config 
        SET session_start_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `);
      stmt.run();
      this.api.log('Gifter leaderboard session reset', 'info');
    } catch (error) {
      this.api.log(`Error resetting gifter session: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get gifter session start time
   */
  getGifterSessionStartTime() {
    try {
      const config = this.getGifterLeaderboardConfig();
      return config?.session_start_time;
    } catch (error) {
      this.api.log(`Error getting gifter session start time: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * Get spin configuration
   */
  getSpinConfig() {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM spin_config WHERE id = 1
      `);
      const config = stmt.get();
      
      if (config) {
        config.field_values = JSON.parse(config.field_values);
      }
      
      return config || {
        enabled: 1,
        min_bet: 100,
        max_bet: 50000,
        default_bet: 1000,
        num_fields: 8,
        field_values: [5000, -2000, 1000, -5000, 2000, -1000, 10000, -3000]
      };
    } catch (error) {
      this.api.log(`Error getting spin config: ${error.message}`, 'error');
      return {
        enabled: 1,
        min_bet: 100,
        max_bet: 50000,
        default_bet: 1000,
        num_fields: 8,
        field_values: [5000, -2000, 1000, -5000, 2000, -1000, 10000, -3000]
      };
    }
  }

  /**
   * Update spin configuration
   */
  updateSpinConfig(config) {
    try {
      const stmt = this.db.prepare(`
        UPDATE spin_config
        SET enabled = ?,
            min_bet = ?,
            max_bet = ?,
            default_bet = ?,
            num_fields = ?,
            field_values = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `);
      
      stmt.run(
        config.enabled ? 1 : 0,
        config.min_bet || 100,
        config.max_bet || 50000,
        config.default_bet || 1000,
        config.num_fields || 8,
        JSON.stringify(config.field_values || [])
      );
      
      this.api.log('Spin config updated successfully', 'info');
      return true;
    } catch (error) {
      this.api.log(`Error updating spin config: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Record a spin transaction
   */
  recordSpinTransaction(username, betAmount, fieldIndex, fieldValue, xpBefore, xpAfter) {
    try {
      const xpChange = xpAfter - xpBefore;
      
      const stmt = this.db.prepare(`
        INSERT INTO spin_history 
          (username, bet_amount, field_index, field_value, xp_change, xp_before, xp_after)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(username, betAmount, fieldIndex, fieldValue, xpChange, xpBefore, xpAfter);
      
      this.api.log(`Recorded spin: ${username} bet ${betAmount}, got ${fieldValue}, XP: ${xpBefore} → ${xpAfter}`, 'debug');
      return true;
    } catch (error) {
      this.api.log(`Error recording spin transaction: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Get spin history for a user
   */
  getSpinHistory(username = null, limit = 50) {
    try {
      let stmt;
      
      if (username) {
        stmt = this.db.prepare(`
          SELECT * FROM spin_history
          WHERE username = ?
          ORDER BY timestamp DESC
          LIMIT ?
        `);
        return stmt.all(username, limit);
      } else {
        stmt = this.db.prepare(`
          SELECT * FROM spin_history
          ORDER BY timestamp DESC
          LIMIT ?
        `);
        return stmt.all(limit);
      }
    } catch (error) {
      this.api.log(`Error getting spin history: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Get spin statistics
   */
  getSpinStats(username = null) {
    try {
      let stmt;
      
      if (username) {
        stmt = this.db.prepare(`
          SELECT 
            COUNT(*) as total_spins,
            SUM(CASE WHEN xp_change > 0 THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN xp_change < 0 THEN 1 ELSE 0 END) as losses,
            SUM(bet_amount) as total_bet,
            SUM(xp_change) as net_xp_change,
            MAX(xp_change) as biggest_win,
            MIN(xp_change) as biggest_loss
          FROM spin_history
          WHERE username = ?
        `);
        return stmt.get(username);
      } else {
        stmt = this.db.prepare(`
          SELECT 
            COUNT(*) as total_spins,
            SUM(CASE WHEN xp_change > 0 THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN xp_change < 0 THEN 1 ELSE 0 END) as losses,
            SUM(bet_amount) as total_bet,
            SUM(xp_change) as net_xp_change,
            MAX(xp_change) as biggest_win,
            MIN(xp_change) as biggest_loss
          FROM spin_history
        `);
        return stmt.get();
      }
    } catch (error) {
      this.api.log(`Error getting spin stats: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * ==========================================
   * NEW: Extended Configuration Management
   * ==========================================
   */

  /**
   * Get extended configuration by key
   * @param {string} key - Configuration key
   * @param {*} defaultValue - Default value if not found
   * @returns {*} Parsed configuration value
   */
  getExtendedConfig(key, defaultValue = null) {
    try {
      const row = this.db.prepare('SELECT value FROM viewer_xp_config WHERE key = ?').get(key);
      if (row) {
        return JSON.parse(row.value);
      }
      return defaultValue;
    } catch (error) {
      this.api.log(`Error getting extended config ${key}: ${error.message}`, 'error');
      return defaultValue;
    }
  }

  /**
   * Set extended configuration
   * @param {string} key - Configuration key
   * @param {*} value - Value to store (will be JSON stringified)
   */
  setExtendedConfig(key, value) {
    const timestamp = Date.now();
    this.db.prepare(`
      INSERT OR REPLACE INTO viewer_xp_config (key, value, updated_at)
      VALUES (?, ?, ?)
    `).run(key, JSON.stringify(value), timestamp);
  }

  /**
   * Get all extended configurations
   * @returns {Object} All configurations as key-value object
   */
  getAllExtendedConfigs() {
    try {
      const rows = this.db.prepare('SELECT key, value FROM viewer_xp_config').all();
      const config = {};
      for (const row of rows) {
        try {
          config[row.key] = JSON.parse(row.value);
        } catch {
          config[row.key] = row.value;
        }
      }
      return config;
    } catch (error) {
      this.api.log(`Error getting all extended configs: ${error.message}`, 'error');
      return {};
    }
  }

  /**
   * ==========================================
   * NEW: User Opt-Out Management
   * ==========================================
   */

  /**
   * Check if user has opted out
   * @param {string} username - Username to check
   * @returns {boolean} True if opted out
   */
  isUserOptedOut(username) {
    try {
      const row = this.db.prepare('SELECT 1 FROM viewer_xp_opt_outs WHERE username = ?').get(username);
      return !!row;
    } catch (error) {
      this.api.log(`Error checking opt-out status: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Set user opt-out status
   * @param {string} username - Username
   * @param {boolean} optOut - True to opt out, false to opt in
   * @param {string} reason - Optional reason
   */
  setUserOptOut(username, optOut, reason = null) {
    try {
      if (optOut) {
        this.db.prepare(`
          INSERT OR REPLACE INTO viewer_xp_opt_outs (username, opted_out_at, reason)
          VALUES (?, ?, ?)
        `).run(username, Date.now(), reason);
      } else {
        this.db.prepare('DELETE FROM viewer_xp_opt_outs WHERE username = ?').run(username);
      }
    } catch (error) {
      this.api.log(`Error setting opt-out status: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get opt-out info for user
   * @param {string} username - Username
   * @returns {Object|null} Opt-out info or null
   */
  getUserOptOutInfo(username) {
    try {
      return this.db.prepare('SELECT * FROM viewer_xp_opt_outs WHERE username = ?').get(username);
    } catch (error) {
      this.api.log(`Error getting opt-out info: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * ==========================================
   * NEW: XP Event Logging (Full Transparency)
   * ==========================================
   */

  /**
   * Log XP event with full details
   * @param {Object} event - Event details
   * @param {string} event.user_id - User ID (TikTok ID)
   * @param {string} event.username - Username
   * @param {string} event.event_type - Event type
   * @param {number} event.amount - Original amount (e.g., gift coins)
   * @param {number} event.xp_awarded - XP awarded
   * @param {Object} event.meta - Additional metadata
   */
  logXPEvent(event) {
    try {
      this.db.prepare(`
        INSERT INTO viewer_xp_events (user_id, username, event_type, amount, xp_awarded, meta, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.user_id || 'unknown',
        event.username,
        event.event_type,
        event.amount || 0,
        event.xp_awarded,
        event.meta ? JSON.stringify(event.meta) : null,
        Date.now()
      );
    } catch (error) {
      this.api.log(`Error logging XP event: ${error.message}`, 'error');
    }
  }

  /**
   * Get XP events with filters and pagination
   * @param {Object} options - Query options
   * @param {string} options.username - Filter by username
   * @param {string} options.event_type - Filter by event type
   * @param {number} options.start_time - Start timestamp
   * @param {number} options.end_time - End timestamp
   * @param {number} options.limit - Max results (default 50, max 500)
   * @param {number} options.offset - Offset for pagination
   * @returns {Array} Array of events
   */
  getXPEvents(options = {}) {
    try {
      const {
        username,
        event_type,
        start_time,
        end_time,
        limit = 50,
        offset = 0
      } = options;

      const conditions = [];
      const params = [];

      if (username) {
        conditions.push('username = ?');
        params.push(username);
      }

      if (event_type) {
        conditions.push('event_type = ?');
        params.push(event_type);
      }

      if (start_time) {
        conditions.push('created_at >= ?');
        params.push(start_time);
      }

      if (end_time) {
        conditions.push('created_at <= ?');
        params.push(end_time);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const safeLimit = Math.min(Math.max(1, limit), 500);

      params.push(safeLimit, offset);

      const query = `
        SELECT * FROM viewer_xp_events
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      const events = this.db.prepare(query).all(...params);
      
      // Parse meta JSON
      return events.map(event => ({
        ...event,
        meta: event.meta ? JSON.parse(event.meta) : null
      }));
    } catch (error) {
      this.api.log(`Error getting XP events: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Get XP events count (for pagination)
   * @param {Object} options - Same filters as getXPEvents
   * @returns {number} Total count
   */
  getXPEventsCount(options = {}) {
    try {
      const {
        username,
        event_type,
        start_time,
        end_time
      } = options;

      const conditions = [];
      const params = [];

      if (username) {
        conditions.push('username = ?');
        params.push(username);
      }

      if (event_type) {
        conditions.push('event_type = ?');
        params.push(event_type);
      }

      if (start_time) {
        conditions.push('created_at >= ?');
        params.push(start_time);
      }

      if (end_time) {
        conditions.push('created_at <= ?');
        params.push(end_time);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const query = `SELECT COUNT(*) as count FROM viewer_xp_events ${whereClause}`;
      const result = this.db.prepare(query).get(...params);
      return result ? result.count : 0;
    } catch (error) {
      this.api.log(`Error counting XP events: ${error.message}`, 'error');
      return 0;
    }
  }

  /**
   * Get available event types for filtering
   * @returns {Array<string>} List of unique event types
   */
  getEventTypes() {
    try {
      const rows = this.db.prepare(`
        SELECT DISTINCT event_type FROM viewer_xp_events ORDER BY event_type
      `).all();
      return rows.map(r => r.event_type);
    } catch (error) {
      this.api.log(`Error getting event types: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Export XP events to JSON
   * @param {Object} options - Same filters as getXPEvents
   * @returns {Object} Export data
   */
  exportXPEvents(options = {}) {
    try {
      const events = this.getXPEvents({ ...options, limit: 10000, offset: 0 });
      return {
        exported_at: Date.now(),
        total_events: events.length,
        filters: options,
        events
      };
    } catch (error) {
      this.api.log(`Error exporting XP events: ${error.message}`, 'error');
      return { error: error.message };
    }
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    // Flush gifter leaderboard pending writes
    if (this.gifterSaveTimeout) {
      clearTimeout(this.gifterSaveTimeout);
    }
    this.flushGifterPendingWrites();

    // Process any remaining batched items
    this.processBatch();
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    // NOTE: We don't close the database because we're using the shared scoped database
    // The main application will handle closing it
  }
}

module.exports = ViewerXPDatabase;
