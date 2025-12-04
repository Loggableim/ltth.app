/**
 * Viewer XP Database Module
 * 
 * Manages persistent storage for viewer XP, levels, badges, streaks, and statistics.
 * Uses better-sqlite3 for high-performance, scalable storage.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class ViewerXPDatabase {
  constructor(api) {
    this.api = api;
    const dataDir = path.join(process.cwd(), 'user_data', 'viewer-xp');
    
    // Ensure directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const dbPath = path.join(dataDir, 'viewer-xp.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for performance
    
    // Batch queue for high-volume writes
    this.batchQueue = [];
    this.batchTimer = null;
    this.batchSize = 50;
    this.batchTimeout = 2000; // 2 seconds
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
      CREATE INDEX IF NOT EXISTS idx_daily_activity_date 
        ON daily_activity(activity_date DESC);
      CREATE INDEX IF NOT EXISTS idx_viewer_xp 
        ON viewer_profiles(xp DESC);
      CREATE INDEX IF NOT EXISTS idx_viewer_level 
        ON viewer_profiles(level DESC);
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
      { action_type: 'gift_tier2', xp_amount: 50, cooldown_seconds: 0 },
      { action_type: 'gift_tier3', xp_amount: 100, cooldown_seconds: 0 },
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
    this.checkLevelUps(batch.map(b => b.username));
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
        
        levelUps.push({
          username,
          oldLevel: viewer.level,
          newLevel,
          rewards
        });
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
    return this.db.prepare('SELECT * FROM level_rewards WHERE level = ?').get(level);
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
   * Get top viewers by XP (leaderboard)
   */
  getTopViewers(limit = 10, days = null) {
    if (days) {
      // Leaderboard for last N days
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().split('T')[0];

      return this.db.prepare(`
        SELECT 
          v.username,
          v.level,
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
    } else {
      // All-time leaderboard
      return this.db.prepare(`
        SELECT username, xp, level, title, name_color, total_xp_earned
        FROM viewer_profiles
        ORDER BY xp DESC
        LIMIT ?
      `).all(limit);
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
    const maxLevel = settings.maxLevel || 50;
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
   * Cleanup on shutdown
   */
  destroy() {
    // Process any remaining batched items
    this.processBatch();
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    this.db.close();
  }
}

module.exports = ViewerXPDatabase;
