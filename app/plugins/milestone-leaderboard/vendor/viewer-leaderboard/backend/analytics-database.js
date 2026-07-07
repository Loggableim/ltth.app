/**
 * Viewer Profiles analytics database for the consolidated viewer-leaderboard plugin.
 *
 * This module keeps the old profile/analytics schema alive inside the canonical
 * plugin without depending on the deleted standalone viewer-profiles package.
 */

class ViewerProfilesAnalyticsDatabase {
  constructor(api) {
    this.api = api;

    const database = typeof api.getDatabase === 'function' ? api.getDatabase() : api.db;
    this.db = database && typeof database.prepare === 'function'
      ? database
      : database && database.db && typeof database.db.prepare === 'function'
        ? database.db
        : database;
  }

  log(message, level = 'info') {
    if (this.api && typeof this.api.log === 'function') {
      this.api.log(message, level);
    }
  }

  parseTags(tags) {
    if (Array.isArray(tags)) {
      return tags
        .map(tag => (tag === null || tag === undefined ? '' : String(tag).trim()))
        .filter(Boolean);
    }

    if (!tags) {
      return [];
    }

    if (typeof tags === 'string') {
      const trimmed = tags.trim();
      if (!trimmed) {
        return [];
      }

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return this.parseTags(parsed);
        }
      } catch (error) {
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          return [];
        }
      }

      return trimmed
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean);
    }

    return [];
  }

  safeJsonParse(value, fallback = null) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  initialize() {
    this.log('Initializing Viewer Profiles analytics database...', 'info');

    try {
      this.createSchema();
      this.migrateSchema();
      this.ensureViewerProfileIds();
      this.initializeDefaultVIPTiers();
      this.log('Viewer Profiles analytics database initialized', 'info');
    } catch (error) {
      this.log(`Error initializing analytics database: ${error.message}`, 'error');
      throw error;
    }
  }

  createSchema() {
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

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS viewer_host_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        viewer_id INTEGER NOT NULL,
        streamer_id TEXT NOT NULL DEFAULT 'default',
        memory_type TEXT NOT NULL DEFAULT 'interaction',
        content TEXT NOT NULL,
        importance REAL NOT NULL DEFAULT 0.5,
        sentiment TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_used_at TEXT,
        use_count INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        FOREIGN KEY (viewer_id) REFERENCES viewer_profiles (id) ON DELETE CASCADE
      )
    `);

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

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vip_tier_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tier_name TEXT NOT NULL,
        min_coins_spent INTEGER DEFAULT 0,
        min_watchtime_hours INTEGER DEFAULT 0,
        min_visits INTEGER DEFAULT 0,
        benefits TEXT,
        badge_color TEXT,
        sort_order INTEGER DEFAULT 0
      )
    `);
  }

  migrateSchema() {
    const tables = {
      viewer_profiles: [
        { name: 'id', def: 'INTEGER' },
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
        { name: 'updated_at', def: 'TEXT DEFAULT CURRENT_TIMESTAMP', alterDef: 'TEXT', backfillExpression: 'CURRENT_TIMESTAMP' }
      ],
      viewer_gift_history: [
        { name: 'viewer_id', def: 'INTEGER' },
        { name: 'gift_id', def: 'TEXT' },
        { name: 'gift_name', def: 'TEXT' },
        { name: 'gift_coins', def: 'INTEGER DEFAULT 0' },
        { name: 'gift_diamond_count', def: 'INTEGER DEFAULT 0' },
        { name: 'quantity', def: 'INTEGER DEFAULT 1' },
        { name: 'streak_count', def: 'INTEGER DEFAULT 0' },
        { name: 'timestamp', def: 'TEXT DEFAULT CURRENT_TIMESTAMP', alterDef: 'TEXT', backfillExpression: 'CURRENT_TIMESTAMP' }
      ],
      viewer_sessions: [
        { name: 'viewer_id', def: 'INTEGER' },
        { name: 'joined_at', def: 'TEXT DEFAULT CURRENT_TIMESTAMP', alterDef: 'TEXT', backfillExpression: 'CURRENT_TIMESTAMP' },
        { name: 'left_at', def: 'TEXT' },
        { name: 'duration_seconds', def: 'INTEGER DEFAULT 0' },
        { name: 'stream_id', def: 'TEXT' }
      ],
      viewer_interactions: [
        { name: 'viewer_id', def: 'INTEGER' },
        { name: 'interaction_type', def: 'TEXT' },
        { name: 'content', def: 'TEXT' },
        { name: 'timestamp', def: 'TEXT DEFAULT CURRENT_TIMESTAMP', alterDef: 'TEXT', backfillExpression: 'CURRENT_TIMESTAMP' }
      ],
      viewer_host_memories: [
        { name: 'viewer_id', def: 'INTEGER' },
        { name: 'streamer_id', def: "TEXT NOT NULL DEFAULT 'default'" },
        { name: 'memory_type', def: "TEXT NOT NULL DEFAULT 'interaction'" },
        { name: 'content', def: 'TEXT NOT NULL' },
        { name: 'importance', def: 'REAL NOT NULL DEFAULT 0.5' },
        { name: 'sentiment', def: 'TEXT' },
        { name: 'metadata', def: 'TEXT' },
        { name: 'created_at', def: 'TEXT DEFAULT CURRENT_TIMESTAMP', alterDef: 'TEXT', backfillExpression: 'CURRENT_TIMESTAMP' },
        { name: 'last_used_at', def: 'TEXT' },
        { name: 'use_count', def: 'INTEGER DEFAULT 0' },
        { name: 'archived', def: 'INTEGER DEFAULT 0' }
      ],
      viewer_activity_heatmap: [
        { name: 'viewer_id', def: 'INTEGER' },
        { name: 'hour_of_day', def: 'INTEGER' },
        { name: 'day_of_week', def: 'INTEGER' },
        { name: 'activity_count', def: 'INTEGER DEFAULT 1' },
        { name: 'total_coins_in_hour', def: 'INTEGER DEFAULT 0' }
      ],
      vip_tier_config: [
        { name: 'tier_name', def: 'TEXT' },
        { name: 'min_coins_spent', def: 'INTEGER DEFAULT 0' },
        { name: 'min_watchtime_hours', def: 'INTEGER DEFAULT 0' },
        { name: 'min_visits', def: 'INTEGER DEFAULT 0' },
        { name: 'benefits', def: 'TEXT' },
        { name: 'badge_color', def: 'TEXT' },
        { name: 'sort_order', def: 'INTEGER DEFAULT 0' }
      ]
    };

    for (const [tableName, expectedColumns] of Object.entries(tables)) {
      const existingColumns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() || [];
      const existingColumnNames = new Set(existingColumns.map(col => col.name));

      for (const col of expectedColumns) {
        if (!existingColumnNames.has(col.name)) {
          this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.alterDef || col.def}`);
          if (col.backfillExpression) {
            this.db.exec(`UPDATE ${tableName} SET ${col.name} = ${col.backfillExpression} WHERE ${col.name} IS NULL`);
          }
        }
      }
    }
  }

  ensureViewerProfileIds() {
    const columns = this.db.prepare('PRAGMA table_info(viewer_profiles)').all() || [];
    const hasIdColumn = columns.some(col => col.name === 'id');

    if (!hasIdColumn) {
      this.db.exec('ALTER TABLE viewer_profiles ADD COLUMN id INTEGER');
    }

    const refreshedColumns = this.db.prepare('PRAGMA table_info(viewer_profiles)').all() || [];
    const idColumn = refreshedColumns.find(col => col.name === 'id');
    if (!idColumn) {
      return;
    }

    if (!idColumn.pk) {
      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_viewer_profiles_id_unique
        ON viewer_profiles(id)
      `);

      this.db.exec(`
        UPDATE viewer_profiles
        SET id = rowid
        WHERE id IS NULL OR id <= 0
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS viewer_profiles_fill_id_after_insert
        AFTER INSERT ON viewer_profiles
        WHEN NEW.id IS NULL
        BEGIN
          UPDATE viewer_profiles SET id = NEW.rowid WHERE rowid = NEW.rowid;
        END
      `);
    }
  }

  initializeDefaultVIPTiers() {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM vip_tier_config').get();
    if (result && result.count > 0) {
      return;
    }

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

    const stmt = this.db.prepare(`
      INSERT INTO vip_tier_config (
        tier_name, min_coins_spent, min_watchtime_hours, min_visits, benefits, badge_color, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const tier of tiers) {
      stmt.run(
        tier.tier_name,
        tier.min_coins_spent,
        tier.min_watchtime_hours,
        tier.min_visits,
        tier.benefits,
        tier.badge_color,
        tier.sort_order
      );
    }
  }

  getLinkedViewerXpProfile(username) {
    try {
      const pluginGetter = typeof this.api.getPluginInstance === 'function'
        ? this.api.getPluginInstance.bind(this.api)
        : typeof this.api.getPlugin === 'function'
          ? this.api.getPlugin.bind(this.api)
          : null;

      if (!pluginGetter) {
        return null;
      }

      const xpPlugin = pluginGetter('viewer-leaderboard') || pluginGetter('viewer-xp');
      if (!xpPlugin || !xpPlugin.db || typeof xpPlugin.db.getViewerProfile !== 'function') {
        return null;
      }

      return xpPlugin.db.getViewerProfile(username);
    } catch (error) {
      this.log(`getLinkedViewerXpProfile failed for ${username}: ${error.message}`, 'debug');
      return null;
    }
  }

  summarizeHeatmap(heatmap) {
    const hourlyTotals = Array(24).fill(0);
    const dailyTotals = Array(7).fill(0);
    let totalActivity = 0;

    if (Array.isArray(heatmap)) {
      for (let day = 0; day < heatmap.length; day++) {
        const row = Array.isArray(heatmap[day]) ? heatmap[day] : [];
        for (let hour = 0; hour < row.length; hour++) {
          const value = Number(row[hour]) || 0;
          hourlyTotals[hour] += value;
          dailyTotals[day] += value;
          totalActivity += value;
        }
      }
    }

    return { totalActivity, hourlyTotals, dailyTotals };
  }

  calculateDaysUntilBirthday(birthday) {
    if (!birthday) {
      return -1;
    }

    const parts = String(birthday).split('-').map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) {
      return -1;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let nextBirthday = new Date(today.getFullYear(), parts[1] - 1, parts[2]);
    if (nextBirthday < today) {
      nextBirthday = new Date(today.getFullYear() + 1, parts[1] - 1, parts[2]);
    }

    return Math.ceil((nextBirthday - today) / 86400000);
  }

  calculateAgeFromBirthday(birthday) {
    if (!birthday) {
      return null;
    }

    try {
      const birthDate = new Date(birthday);
      if (Number.isNaN(birthDate.getTime())) {
        return null;
      }

      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      return age;
    } catch (error) {
      return null;
    }
  }

  evaluateViewerSegments(viewer, xpProfile = null) {
    if (!viewer) {
      return [];
    }

    const segments = [];
    const tags = this.parseTags(viewer.tags);
    const watchHours = (Number(viewer.total_watchtime_seconds) || 0) / 3600;
    const visits = Number(viewer.total_visits) || 0;
    const comments = Number(viewer.total_comments) || 0;
    const shares = Number(viewer.total_shares) || 0;
    const likes = Number(viewer.total_likes) || 0;
    const coins = Number(viewer.total_coins_spent) || 0;
    const lastSeen = viewer.last_seen_at ? new Date(viewer.last_seen_at) : null;
    const daysSinceSeen = lastSeen && !Number.isNaN(lastSeen.getTime())
      ? Math.floor((Date.now() - lastSeen.getTime()) / 86400000)
      : null;
    const birthdayDays = viewer.birthday ? this.calculateDaysUntilBirthday(viewer.birthday) : null;
    const xp = xpProfile ? Number(xpProfile.xp || xpProfile.total_xp_earned || 0) : 0;
    const level = xpProfile ? Number(xpProfile.level || 0) : 0;

    if (viewer.is_vip) segments.push('vip');
    if (viewer.is_favorite) segments.push('favorites');
    if (birthdayDays !== null && birthdayDays >= 0 && birthdayDays <= 7) segments.push('birthday_soon');
    if (!viewer.is_vip && (coins >= 1000 || watchHours >= 10 || visits >= 20 || xp >= 1500 || level >= 10)) {
      segments.push('vip_candidates');
    }
    if (comments >= 25 || (comments >= 10 && visits >= 5)) segments.push('power_chatters');
    if (shares >= 10 || likes >= 100) segments.push('amplifiers');
    if (visits >= 5 && daysSinceSeen !== null && daysSinceSeen >= 14) segments.push('dormant_regulars');
    if (xpProfile && Number(xpProfile.total_xp_earned || 0) >= 5000) segments.push('xp_rising');
    if (tags.includes('vip') && !segments.includes('vip')) segments.push('vip_like');

    return Array.from(new Set(segments));
  }

  buildViewerInsight(viewer, xpProfile = null) {
    if (!viewer) {
      return null;
    }

    const tags = this.parseTags(viewer.tags);
    const segments = this.evaluateViewerSegments(viewer, xpProfile);
    const watchHours = (Number(viewer.total_watchtime_seconds) || 0) / 3600;
    const visits = Number(viewer.total_visits) || 0;
    const comments = Number(viewer.total_comments) || 0;
    const likes = Number(viewer.total_likes) || 0;
    const shares = Number(viewer.total_shares) || 0;
    const coins = Number(viewer.total_coins_spent) || 0;
    const loyalty = Number(viewer.loyalty_points) || 0;
    const xp = xpProfile ? Number(xpProfile.xp || xpProfile.total_xp_earned || 0) : 0;
    const level = xpProfile ? Number(xpProfile.level || 0) : 0;
    const lastSeen = viewer.last_seen_at ? new Date(viewer.last_seen_at) : null;
    const daysSinceSeen = lastSeen && !Number.isNaN(lastSeen.getTime())
      ? Math.floor((Date.now() - lastSeen.getTime()) / 86400000)
      : null;
    const birthdayDays = viewer.birthday ? this.calculateDaysUntilBirthday(viewer.birthday) : null;
    const birthdayAge = viewer.birthday ? this.calculateAgeFromBirthday(viewer.birthday) : null;

    const recencyScore = daysSinceSeen === null ? 0 : Math.max(0, 20 - Math.min(daysSinceSeen, 20));
    const engagementScore = Math.min(40, comments * 1.5 + likes * 0.2 + shares * 2 + visits * 1.2);
    const monetizationScore = Math.min(35, coins / 300 + watchHours * 1.5);
    const loyaltyScore = Math.min(20, loyalty / 20 + tags.length * 1.5 + (viewer.is_vip ? 8 : 0) + (viewer.is_favorite ? 5 : 0));
    const xpScore = Math.min(25, xp / 250 + level * 1.5);
    const score = Math.round(Math.max(0, Math.min(100, engagementScore + monetizationScore + loyaltyScore + recencyScore + xpScore)));

    const recommendedActions = [];
    if (!viewer.is_vip && segments.includes('vip_candidates')) {
      recommendedActions.push('Promote to VIP or review for VIP eligibility');
    }
    if (segments.includes('power_chatters')) {
      recommendedActions.push('Add a custom tag and prioritize chat responses');
    }
    if (segments.includes('birthday_soon')) {
      recommendedActions.push('Prepare a birthday reminder or greeting');
    }
    if (segments.includes('dormant_regulars')) {
      recommendedActions.push('Re-engage with a recent shoutout or follow-up');
    }
    if (viewer.is_favorite) {
      recommendedActions.push('Keep in the favorites view for quick access');
    }
    if (recommendedActions.length === 0) {
      recommendedActions.push('Monitor for trend changes and activity spikes');
    }

    return {
      score,
      scoreLabel: score >= 80 ? 'Critical' : score >= 60 ? 'High' : score >= 35 ? 'Medium' : 'Low',
      segments,
      tags,
      stats: {
        watchHours: Math.round(watchHours * 10) / 10,
        visits,
        comments,
        likes,
        shares,
        coins,
        loyalty,
        xp,
        level,
        daysSinceSeen,
        birthdayDays,
        birthdayAge
      },
      recommendedActions
    };
  }

  getViewerByUsername(username) {
    return this.db.prepare('SELECT * FROM viewer_profiles WHERE tiktok_username = ?').get(username) || null;
  }

  getViewerProfile(username) {
    return this.getViewerByUsername(username);
  }

  getViewerById(id) {
    return this.db.prepare('SELECT * FROM viewer_profiles WHERE id = ?').get(id) || null;
  }

  getOrCreateViewer(username, userData = {}) {
    let viewer = this.db.prepare('SELECT * FROM viewer_profiles WHERE tiktok_username = ?').get(username);

    if (!viewer) {
      const stmt = this.db.prepare(`
        INSERT INTO viewer_profiles (
          tiktok_username, tiktok_user_id, display_name, profile_picture_url,
          verified, first_seen_at, last_seen_at, total_visits
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
      `);

      const info = stmt.run(
        username,
        userData.userId || null,
        userData.nickname || username,
        userData.profilePictureUrl || null,
        userData.verified || 0
      );

      viewer = this.db.prepare('SELECT * FROM viewer_profiles WHERE id = ?').get(info.lastInsertRowid);
    }

    return viewer;
  }

  updateViewer(username, updates = {}) {
    const allowed = new Set([
      'tiktok_user_id', 'display_name', 'profile_picture_url', 'bio',
      'age', 'gender', 'country', 'language', 'verified',
      'follower_count', 'following_count', 'last_seen_at',
      'total_visits', 'total_watchtime_seconds', 'total_coins_spent',
      'total_gifts_sent', 'total_comments', 'total_likes', 'total_shares',
      'tts_voice', 'discord_username', 'birthday', 'notes', 'tags',
      'is_vip', 'vip_since', 'vip_tier', 'loyalty_points',
      'is_blocked', 'is_favorite', 'is_moderator'
    ]);

    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (!allowed.has(key)) {
        continue;
      }

      let normalizedValue = value;
      if (key === 'tags' && Array.isArray(value)) {
        normalizedValue = JSON.stringify(value);
      } else if (['is_vip', 'is_blocked', 'is_favorite', 'is_moderator', 'verified'].includes(key)) {
        normalizedValue = value ? 1 : 0;
      }

      fields.push(`${key} = ?`);
      values.push(normalizedValue);
    }

    if (fields.length === 0) {
      return this.getViewerByUsername(username);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(username);

    this.db.prepare(`UPDATE viewer_profiles SET ${fields.join(', ')} WHERE tiktok_username = ?`).run(...values);
    return this.getViewerByUsername(username);
  }

  getViewerHeatmap(viewerId) {
    const data = this.db.prepare(`
      SELECT hour_of_day, day_of_week, activity_count, total_coins_in_hour
      FROM viewer_activity_heatmap
      WHERE viewer_id = ?
    `).all(viewerId) || [];

    const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const row of data) {
      if (heatmap[row.day_of_week] && typeof heatmap[row.day_of_week][row.hour_of_day] !== 'undefined') {
        heatmap[row.day_of_week][row.hour_of_day] = row.activity_count;
      }
    }

    return heatmap;
  }

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
    `).all(viewerId, limit) || [];
  }

  getViewerInsights(viewerOrUsername) {
    const viewer = typeof viewerOrUsername === 'string'
      ? this.getViewerByUsername(viewerOrUsername)
      : viewerOrUsername;

    if (!viewer) {
      return null;
    }

    const xpProfile = this.getLinkedViewerXpProfile(viewer.tiktok_username);
    const heatmap = this.getViewerHeatmap(viewer.id);
    const insight = this.buildViewerInsight(viewer, xpProfile);

    return {
      ...viewer,
      tags: this.parseTags(viewer.tags),
      topGifts: this.getTopGifts(viewer.id, 5),
      heatmap,
      heatmapSummary: this.summarizeHeatmap(heatmap),
      insights: insight,
      xpProfile
    };
  }

  getSegmentDefinitions() {
    return [
      {
        id: 'vip',
        label: 'VIP Members',
        description: 'Currently promoted viewers',
        action: 'Keep engaged with VIP-specific treatment'
      },
      {
        id: 'vip_candidates',
        label: 'VIP Candidates',
        description: 'High-value viewers near promotion thresholds',
        action: 'Review for promotion'
      },
      {
        id: 'power_chatters',
        label: 'Power Chatters',
        description: 'High interaction / chat frequency viewers',
        action: 'Prioritize responses and recognition'
      },
      {
        id: 'dormant_regulars',
        label: 'Dormant Regulars',
        description: 'Long-time viewers who have gone quiet',
        action: 'Re-engage with a follow-up'
      },
      {
        id: 'birthday_soon',
        label: 'Birthday Soon',
        description: 'Viewers with birthdays in the next 7 days',
        action: 'Prepare a greeting'
      },
      {
        id: 'favorites',
        label: 'Favorites',
        description: 'Manually highlighted profiles',
        action: 'Use as a quick-access watch list'
      },
      {
        id: 'xp_rising',
        label: 'XP Rising',
        description: 'Cross-plugin viewers with strong XP momentum',
        action: 'Sync with XP workflows'
      }
    ];
  }

  getSegments(options = {}) {
    const { limit = 5 } = options;
    const definitions = this.getSegmentDefinitions();
    const viewers = this.db.prepare('SELECT * FROM viewer_profiles').all() || [];

    return definitions.map(def => {
      const members = [];
      for (const viewer of viewers) {
        const xpProfile = this.getLinkedViewerXpProfile(viewer.tiktok_username);
        const viewerSegments = this.evaluateViewerSegments(viewer, xpProfile);
        if (viewerSegments.includes(def.id)) {
          members.push({
            username: viewer.tiktok_username,
            displayName: viewer.display_name || viewer.tiktok_username,
            vipTier: viewer.vip_tier || null,
            score: this.buildViewerInsight(viewer, xpProfile)?.score || 0,
            lastSeenAt: viewer.last_seen_at || null
          });
        }
      }

      members.sort((a, b) => b.score - a.score || String(a.username).localeCompare(String(b.username)));

      return {
        ...def,
        count: members.length,
        members: members.slice(0, limit)
      };
    });
  }

  getSegmentViewers(segmentId, options = {}) {
    const { limit = 20 } = options;
    const definition = this.getSegmentDefinitions().find(item => item.id === segmentId);
    if (!definition) {
      return null;
    }

    const viewers = this.db.prepare('SELECT * FROM viewer_profiles').all() || [];
    const members = [];

    for (const viewer of viewers) {
      const xpProfile = this.getLinkedViewerXpProfile(viewer.tiktok_username);
      const viewerSegments = this.evaluateViewerSegments(viewer, xpProfile);
      if (viewerSegments.includes(segmentId)) {
        members.push({
          ...viewer,
          tags: this.parseTags(viewer.tags),
          insights: this.buildViewerInsight(viewer, xpProfile)
        });
      }
    }

    members.sort((a, b) => {
      const scoreA = a.insights?.score || 0;
      const scoreB = b.insights?.score || 0;
      return scoreB - scoreA || String(a.tiktok_username).localeCompare(String(b.tiktok_username));
    });

    return {
      segment: definition,
      count: members.length,
      viewers: members.slice(0, limit)
    };
  }

  getStatsSummary() {
    const totalViewersResult = this.db.prepare('SELECT COUNT(*) as count FROM viewer_profiles').get();
    const totalRevenueResult = this.db.prepare('SELECT SUM(total_coins_spent) as total FROM viewer_profiles').get();
    const avgWatchtimeResult = this.db.prepare('SELECT AVG(total_watchtime_seconds) as avg FROM viewer_profiles').get();
    const topSpender = this.db.prepare('SELECT * FROM viewer_profiles ORDER BY total_coins_spent DESC LIMIT 1').get();
    const vipCountResult = this.db.prepare('SELECT COUNT(*) as count FROM viewer_profiles WHERE is_vip = 1').get();
    const activeViewersResult = this.db.prepare(
      "SELECT COUNT(*) as count FROM viewer_profiles WHERE last_seen_at > datetime('now', '-30 days')"
    ).get();

    return {
      totalViewers: totalViewersResult ? totalViewersResult.count : 0,
      totalRevenue: (totalRevenueResult && totalRevenueResult.total) || 0,
      avgWatchtime: Math.round((avgWatchtimeResult && avgWatchtimeResult.avg) || 0),
      topSpender: topSpender ? {
        username: topSpender.tiktok_username,
        displayName: topSpender.display_name,
        coinsSpent: topSpender.total_coins_spent
      } : null,
      vipCount: vipCountResult ? vipCountResult.count : 0,
      activeViewers: activeViewersResult ? activeViewersResult.count : 0
    };
  }

  getGlobalPeakTimes(limit = 10) {
    return this.db.prepare(`
      SELECT hour_of_day, day_of_week, SUM(activity_count) as total
      FROM viewer_activity_heatmap
      GROUP BY hour_of_day, day_of_week
      ORDER BY total DESC
      LIMIT ?
    `).all(limit) || [];
  }

  getOverviewInsights(options = {}) {
    const { limit = 5 } = options;
    const stats = this.getStatsSummary();
    const segments = this.getSegments({ limit });
    const viewers = this.db.prepare('SELECT * FROM viewer_profiles').all() || [];
    const topInsights = [];
    const candidateInsights = [];

    for (const viewer of viewers) {
      const xpProfile = this.getLinkedViewerXpProfile(viewer.tiktok_username);
      const insight = this.buildViewerInsight(viewer, xpProfile);
      if (!insight) {
        continue;
      }

      topInsights.push({
        username: viewer.tiktok_username,
        displayName: viewer.display_name || viewer.tiktok_username,
        score: insight.score,
        scoreLabel: insight.scoreLabel,
        segments: insight.segments,
        recommendedActions: insight.recommendedActions,
        lastSeenAt: viewer.last_seen_at || null,
        vipTier: viewer.vip_tier || null
      });

      if (insight.segments.includes('vip_candidates') || insight.segments.includes('birthday_soon') || insight.segments.includes('dormant_regulars')) {
        candidateInsights.push({
          username: viewer.tiktok_username,
          displayName: viewer.display_name || viewer.tiktok_username,
          score: insight.score,
          segments: insight.segments,
          action: insight.recommendedActions[0]
        });
      }
    }

    topInsights.sort((a, b) => b.score - a.score || String(a.username).localeCompare(String(b.username)));
    candidateInsights.sort((a, b) => b.score - a.score || String(a.username).localeCompare(String(b.username)));

    return {
      stats,
      segments,
      topInsights: topInsights.slice(0, 8),
      candidateInsights: candidateInsights.slice(0, 8),
      globalPeakTimes: this.getGlobalPeakTimes(10).map(row => ({
        ...row,
        label: `${String(row.day_of_week)}-${String(row.hour_of_day).padStart(2, '0')}:00`
      }))
    };
  }

  bulkUpdateViewers(usernames, updates) {
    if (!Array.isArray(usernames) || usernames.length === 0) {
      throw new Error('At least one username is required');
    }

    const cleanUsernames = usernames
      .map(username => (username === null || username === undefined ? '' : String(username).trim()))
      .filter(Boolean);

    if (cleanUsernames.length === 0) {
      throw new Error('At least one valid username is required');
    }

    const updated = [];
    const transaction = this.db.transaction((names) => {
      for (const username of names) {
        const viewer = this.updateViewer(username, updates);
        if (viewer) {
          updated.push(viewer);
        }
      }
    });

    transaction(cleanUsernames);
    return updated;
  }

  getVIPTiers() {
    return this.db.prepare('SELECT * FROM vip_tier_config ORDER BY sort_order ASC').all() || [];
  }

  getLeaderboard(type = 'coins', limit = 10) {
    const sortMap = {
      coins: 'total_coins_spent',
      watchtime: 'total_watchtime_seconds',
      visits: 'total_visits',
      gifts: 'total_gifts_sent',
      comments: 'total_comments'
    };

    const sortBy = sortMap[type] || 'total_coins_spent';
    return this.db.prepare(`
      SELECT * FROM viewer_profiles
      ORDER BY ${sortBy} DESC
      LIMIT ?
    `).all(limit) || [];
  }

  getUpcomingBirthdays(days = 7) {
    const viewers = this.db.prepare(`
      SELECT * FROM viewer_profiles
      WHERE birthday IS NOT NULL AND birthday != ''
    `).all() || [];

    const results = [];
    for (const viewer of viewers) {
      const daysUntil = this.calculateDaysUntilBirthday(viewer.birthday);
      if (daysUntil >= 0 && daysUntil <= days) {
        results.push({ ...viewer, days_until: daysUntil });
      }
    }

    return results.sort((a, b) => a.days_until - b.days_until);
  }

  updateHeatmap(viewerId, timestamp, coins = 0) {
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
  }

  addInteraction(viewerId, type, content = null) {
    const stmt = this.db.prepare(`
      INSERT INTO viewer_interactions (viewer_id, interaction_type, content)
      VALUES (?, ?, ?)
    `);
    stmt.run(viewerId, type, content);

    const updateMap = {
      comment: 'total_comments',
      like: 'total_likes',
      share: 'total_shares'
    };

    if (updateMap[type]) {
      this.db.prepare(`
        UPDATE viewer_profiles
        SET ${updateMap[type]} = ${updateMap[type]} + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(viewerId);
    }
  }

  recordHostMemory(username, memory = {}) {
    const viewer = this.getOrCreateViewer(username);
    const content = String(memory.content || '').trim();
    if (!content) {
      throw new Error('Host memory content is required');
    }

    const importance = Math.min(1, Math.max(0, Number(memory.importance) || 0.5));
    const result = this.db.prepare(`
      INSERT INTO viewer_host_memories
        (viewer_id, streamer_id, memory_type, content, importance, sentiment, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      viewer.id,
      String(memory.streamerId || 'default'),
      String(memory.type || 'interaction'),
      content.slice(0, 4000),
      importance,
      memory.sentiment ? String(memory.sentiment).slice(0, 50) : null,
      memory.metadata ? JSON.stringify(memory.metadata) : null
    );

    return result.lastInsertRowid;
  }

  getHostMemories(username, streamerId = 'default', options = {}) {
    const viewer = this.getViewerByUsername(username);
    if (!viewer) {
      return [];
    }

    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const minimumImportance = Math.min(1, Math.max(0, Number(options.minimumImportance) || 0));
    const rows = this.db.prepare(`
      SELECT * FROM viewer_host_memories
      WHERE viewer_id = ? AND streamer_id = ? AND archived = 0 AND importance >= ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(viewer.id, String(streamerId || 'default'), minimumImportance, limit) || [];

    return rows.map(row => ({
      ...row,
      metadata: this.safeJsonParse(row.metadata, {})
    }));
  }

  getOrCreateViewerByUsername(username, userData = {}) {
    return this.getOrCreateViewer(username, userData);
  }

  destroy() {
    return undefined;
  }
}

module.exports = ViewerProfilesAnalyticsDatabase;
