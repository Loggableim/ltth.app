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
   * Safely parse a tags payload into an array.
   */
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
        // Legacy comma-separated strings are still supported, but obvious
        // invalid JSON blobs should not leak into the UI.
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

  /**
   * Safely parse a JSON field used by cross-plugin data.
   */
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

  /**
   * Resolve optional viewer XP plugin data.
   */
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
      this.api.log(`getLinkedViewerXpProfile failed for ${username}: ${error.message}`, 'debug');
      return null;
    }
  }

  /**
   * Build a compact summary for heatmap matrices.
   */
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

    const topHours = hourlyTotals
      .map((activity, hour) => ({ hour, activity }))
      .filter(item => item.activity > 0)
      .sort((a, b) => b.activity - a.activity || a.hour - b.hour)
      .slice(0, 5);

    const topDays = dailyTotals
      .map((activity, day) => ({ day, activity }))
      .filter(item => item.activity > 0)
      .sort((a, b) => b.activity - a.activity || a.day - b.day)
      .slice(0, 5);

    return {
      totalActivity,
      hourlyTotals,
      dailyTotals,
      topHours,
      topDays
    };
  }

  /**
   * Evaluate the primary segments for a viewer.
   */
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
    const gifts = Number(viewer.total_gifts_sent) || 0;
    const lastSeen = viewer.last_seen_at ? new Date(viewer.last_seen_at) : null;
    const daysSinceSeen = lastSeen && !Number.isNaN(lastSeen.getTime())
      ? Math.floor((Date.now() - lastSeen.getTime()) / 86400000)
      : null;
    const birthdayDays = viewer.birthday ? this.calculateDaysUntilBirthday(viewer.birthday) : null;
    const xp = xpProfile ? Number(xpProfile.xp || xpProfile.total_xp_earned || 0) : 0;
    const level = xpProfile ? Number(xpProfile.level || 0) : 0;

    if (viewer.is_vip) {
      segments.push('vip');
    }

    if (viewer.is_favorite) {
      segments.push('favorites');
    }

    if (birthdayDays !== null && birthdayDays >= 0 && birthdayDays <= 7) {
      segments.push('birthday_soon');
    }

    if (!viewer.is_vip && (
      coins >= 1000 ||
      watchHours >= 10 ||
      visits >= 20 ||
      xp >= 1500 ||
      level >= 10
    )) {
      segments.push('vip_candidates');
    }

    if (comments >= 25 || (comments >= 10 && visits >= 5)) {
      segments.push('power_chatters');
    }

    if (shares >= 10 || likes >= 100) {
      segments.push('amplifiers');
    }

    if (visits >= 5 && daysSinceSeen !== null && daysSinceSeen >= 14) {
      segments.push('dormant_regulars');
    }

    if (xpProfile && Number(xpProfile.total_xp_earned || 0) >= 5000) {
      segments.push('xp_rising');
    }

    if (tags.includes('vip') && !segments.includes('vip')) {
      segments.push('vip_like');
    }

    return Array.from(new Set(segments));
  }

  /**
   * Build a score and recommendation bundle for a viewer.
   */
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
    const gifts = Number(viewer.total_gifts_sent) || 0;
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
    const monetizationScore = Math.min(35, coins / 300 + gifts * 2.5 + watchHours * 1.5);
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
        gifts,
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

  /**
   * Build a profile package for the dashboard.
   */
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
    const heatmapSummary = this.summarizeHeatmap(heatmap);
    const topGifts = this.getTopGifts(viewer.id, 5);

    return {
      ...viewer,
      tags: this.parseTags(viewer.tags),
      topGifts,
      heatmap,
      heatmapSummary,
      insights: insight,
      xpProfile
    };
  }

  /**
   * Returns a segment definition list.
   */
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

  /**
   * Get segment list with counts and samples.
   */
  getSegments(options = {}) {
    const { limit = 5 } = options;
    const definitions = this.getSegmentDefinitions();
    const viewers = this.db.prepare('SELECT * FROM viewer_profiles').all();
    const segments = definitions.map(def => {
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

    return segments;
  }

  /**
   * Get viewers for a single segment.
   */
  getSegmentViewers(segmentId, options = {}) {
    const { limit = 20 } = options;
    const definitions = this.getSegmentDefinitions();
    const definition = definitions.find(item => item.id === segmentId);

    if (!definition) {
      return null;
    }

    const viewers = this.db.prepare('SELECT * FROM viewer_profiles').all();
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

  /**
   * Create a dashboard overview from current viewer data.
   */
  getOverviewInsights(options = {}) {
    const { limit = 5 } = options;
    const stats = this.getStatsSummary();
    const segments = this.getSegments({ limit });
    const viewers = this.db.prepare('SELECT * FROM viewer_profiles').all();
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

    const globalPeakTimes = this.getGlobalPeakTimes(10).map(row => ({
      ...row,
      label: `${String(row.day_of_week)}-${String(row.hour_of_day).padStart(2, '0')}:00`
    }));

    return {
      stats,
      segments,
      topInsights: topInsights.slice(0, 8),
      candidateInsights: candidateInsights.slice(0, 8),
      globalPeakTimes
    };
  }

  /**
   * Update multiple viewers with the same payload.
   */
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

  /**
   * Calculate age from a birthday date.
   */
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

      // Streamer-scoped long-term memories used by intelligent host plugins.
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
        CREATE INDEX IF NOT EXISTS idx_host_memory_viewer_streamer ON viewer_host_memories(viewer_id, streamer_id);
        CREATE INDEX IF NOT EXISTS idx_host_memory_importance ON viewer_host_memories(importance);
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

    this.ensureViewerProfileIds();

    if (migratedCount === 0) {
      this.api.log('Schema is up to date', 'info');
    }
  }

  ensureViewerProfileIds() {
    const columns = this.db.prepare('PRAGMA table_info(viewer_profiles)').all();
    const idColumn = columns.find(col => col.name === 'id');
    if (!idColumn) return;

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
      filter = 'all',
      segment = 'all'
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

    let viewers = [];
    let totalPages = 0;

    if (segment && segment !== 'all') {
      const sql = `
        SELECT * FROM viewer_profiles
        ${whereClause}
        ORDER BY ${safeSortBy} ${safeOrder}
      `;
      const allViewers = this.db.prepare(sql).all(...params);
      const filteredViewers = allViewers.filter(viewer => {
        const xpProfile = this.getLinkedViewerXpProfile(viewer.tiktok_username);
        const viewerSegments = this.evaluateViewerSegments(viewer, xpProfile);
        return viewerSegments.includes(segment);
      });

      const start = Math.max(0, offset);
      viewers = filteredViewers.slice(start, start + limit);
      totalPages = Math.ceil(filteredViewers.length / limit);

      return {
        viewers,
        pagination: {
          page,
          limit,
          total: filteredViewers.length,
          totalPages
        }
      };
    }

    // Get paginated results
    const sql = `
      SELECT * FROM viewer_profiles
      ${whereClause}
      ORDER BY ${safeSortBy} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    const stmt = this.db.prepare(sql);
    viewers = stmt.all(...params, limit, offset);
    totalPages = Math.ceil(total / limit);

    return {
      viewers,
      pagination: {
        page,
        limit,
        total,
        totalPages
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
    if (!viewer) return [];
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const minimumImportance = Math.min(1, Math.max(0, Number(options.minimumImportance) || 0));
    const rows = this.db.prepare(`
      SELECT * FROM viewer_host_memories
      WHERE viewer_id = ? AND streamer_id = ? AND archived = 0 AND importance >= ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(viewer.id, String(streamerId || 'default'), minimumImportance, limit);

    return rows.map(row => ({
      ...row,
      metadata: this.safeJsonParse(row.metadata, {})
    }));
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
