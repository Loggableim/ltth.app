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

    // XP transaction log for analytics
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
    `);

    // Initialize default XP actions
    this.initializeDefaultActions();
    
    // Initialize default badges
    this.initializeDefaultBadges();
    
    // Initialize default level rewards
    this.initializeDefaultLevelRewards();

    this.api.log('Viewer XP database initialized', 'info');
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
   * Add XP to viewer (batched for performance)
   */
  addXP(username, amount, actionType, details = null) {
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
   * Process batched XP additions
   */
  processBatch() {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const transaction = this.db.transaction((items) => {
      const updateStmt = this.db.prepare(`
        UPDATE viewer_profiles 
        SET xp = xp + ?, 
            total_xp_earned = total_xp_earned + ?,
            last_seen = CURRENT_TIMESTAMP
        WHERE username = ?
      `);

      const logStmt = this.db.prepare(`
        INSERT INTO xp_transactions (username, amount, action_type, details)
        VALUES (?, ?, ?, ?)
      `);

      for (const item of items) {
        // Ensure viewer exists
        this.getOrCreateViewer(item.username);
        
        // Add XP
        updateStmt.run(item.amount, item.amount, item.username);
        
        // Log transaction
        logStmt.run(
          item.username, 
          item.amount, 
          item.actionType, 
          item.details ? JSON.stringify(item.details) : null
        );
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
   */
  getLevelRewards(level) {
    const reward = this.db.prepare('SELECT * FROM level_rewards WHERE level = ?').get(level);
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
   * Cleanup on shutdown
   */
  destroy() {
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
