/**
 * CoinBattle Database Module
 * Handles all database operations for matches, players, teams, rankings, and badges
 */

class CoinBattleDatabase {
  constructor(db, logger = console) {
    // db is a DatabaseManager instance with a .db property containing the raw better-sqlite3 database
    this.dbManager = db;
    this.db = db.db || db; // Support both DatabaseManager and raw database
    this.logger = logger;
    
    // Batch processing for high-performance event inserts
    this.eventBatch = [];
    this.batchSize = 50; // Flush after 50 events
    this.batchTimeout = 100; // or after 100ms
    this.batchTimer = null;
    this.batchInsertStatement = null;
  }

  /**
   * Get the raw database instance (for direct access by subsystems)
   */
  getRawDb() {
    return this.db; // Now this.db is the raw better-sqlite3 instance
  }

  /**
   * Initialize all database tables for CoinBattle
   */
  initializeTables() {
    try {
      // Matches table - stores all match data
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_uuid TEXT UNIQUE NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          mode TEXT DEFAULT 'solo',
          team_red_score INTEGER DEFAULT 0,
          team_blue_score INTEGER DEFAULT 0,
          winner_team TEXT,
          winner_player_id TEXT,
          auto_extended INTEGER DEFAULT 0,
          multiplier_events INTEGER DEFAULT 0,
          total_coins INTEGER DEFAULT 0,
          total_gifts INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active',
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `).run();

      // Players table - lifetime player data
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT UNIQUE NOT NULL,
          unique_id TEXT NOT NULL,
          nickname TEXT NOT NULL,
          profile_picture_url TEXT,
          total_coins INTEGER DEFAULT 0,
          total_gifts INTEGER DEFAULT 0,
          matches_played INTEGER DEFAULT 0,
          matches_won INTEGER DEFAULT 0,
          team_wins INTEGER DEFAULT 0,
          solo_wins INTEGER DEFAULT 0,
          current_title TEXT,
          badges TEXT,
          first_seen INTEGER DEFAULT (strftime('%s', 'now')),
          last_seen INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `).run();

      // Match participants - links players to matches
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_match_participants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_id INTEGER NOT NULL,
          player_id INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          team TEXT,
          coins INTEGER DEFAULT 0,
          gifts INTEGER DEFAULT 0,
          rank INTEGER,
          is_winner INTEGER DEFAULT 0,
          joined_at INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (match_id) REFERENCES coinbattle_matches(id),
          FOREIGN KEY (player_id) REFERENCES coinbattle_players(id)
        )
      `).run();

      // Gift events - detailed gift tracking
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_gift_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_id INTEGER NOT NULL,
          player_id INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          gift_id INTEGER NOT NULL,
          gift_name TEXT NOT NULL,
          coins INTEGER NOT NULL,
          multiplier REAL DEFAULT 1.0,
          team TEXT,
          event_id TEXT UNIQUE,
          idempotency_key TEXT UNIQUE,
          timestamp INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (match_id) REFERENCES coinbattle_matches(id),
          FOREIGN KEY (player_id) REFERENCES coinbattle_players(id)
        )
      `).run();

      // Event deduplication cache - tracks recent events to prevent replays
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_event_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT UNIQUE NOT NULL,
          idempotency_key TEXT UNIQUE NOT NULL,
          match_id INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          processed_at INTEGER DEFAULT (strftime('%s', 'now')),
          expires_at INTEGER NOT NULL
        )
      `).run();

      // Badges table - available badges and achievements
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_badges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          badge_id TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT,
          requirement_type TEXT NOT NULL,
          requirement_value INTEGER NOT NULL,
          rarity TEXT DEFAULT 'common',
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `).run();

      // Player badges - earned badges
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_player_badges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id INTEGER NOT NULL,
          badge_id TEXT NOT NULL,
          earned_at INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (player_id) REFERENCES coinbattle_players(id)
        )
      `).run();

      // Multiplier events - track special events
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_multiplier_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_id INTEGER NOT NULL,
          multiplier REAL NOT NULL,
          duration INTEGER NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER NOT NULL,
          activated_by TEXT,
          FOREIGN KEY (match_id) REFERENCES coinbattle_matches(id)
        )
      `).run();

      // Season configuration table - stores season leaderboard settings
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_seasons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season_name TEXT NOT NULL,
          start_date INTEGER NOT NULL,
          end_date INTEGER NOT NULL,
          is_active INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `).run();

      // Archived matches table - used by cleanup scheduler
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_archived_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_id INTEGER NOT NULL,
          match_uuid TEXT NOT NULL,
          end_time INTEGER NOT NULL,
          total_coins INTEGER DEFAULT 0,
          total_gifts INTEGER DEFAULT 0,
          participant_count INTEGER DEFAULT 0,
          archived_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `).run();

      // Create indexes for performance
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_matches_status ON coinbattle_matches(status)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_matches_start ON coinbattle_matches(start_time)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_matches_end ON coinbattle_matches(end_time)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_players_userid ON coinbattle_players(user_id)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_participants_match ON coinbattle_match_participants(match_id)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_participants_player ON coinbattle_match_participants(player_id)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_participants_joined ON coinbattle_match_participants(joined_at)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_gifts_match ON coinbattle_gift_events(match_id)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_gifts_player ON coinbattle_gift_events(player_id)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_gifts_timestamp ON coinbattle_gift_events(timestamp)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_gifts_eventid ON coinbattle_gift_events(event_id)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_gifts_idempotency ON coinbattle_gift_events(idempotency_key)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_event_cache_eventid ON coinbattle_event_cache(event_id)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_event_cache_idempotency ON coinbattle_event_cache(idempotency_key)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_event_cache_expires ON coinbattle_event_cache(expires_at)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_seasons_dates ON coinbattle_seasons(start_date, end_date)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_seasons_active ON coinbattle_seasons(is_active)').run();
      this.db.prepare('CREATE INDEX IF NOT EXISTS idx_archived_matches_match_id ON coinbattle_archived_matches(match_id)').run();

      // Initialize default badges
      this.initializeDefaultBadges();

      // Prepare batch insert statement for performance
      this.batchInsertStatement = this.db.prepare(`
        INSERT INTO coinbattle_gift_events 
        (match_id, player_id, user_id, gift_id, gift_name, coins, multiplier, team, event_id, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      this.logger.info('✅ CoinBattle database tables initialized with batch support');
    } catch (error) {
      this.logger.error(`Failed to initialize CoinBattle tables: ${error.message}`);
      throw error;
    }
  }

  /**
   * Initialize default badge system
   */
  initializeDefaultBadges() {
    const defaultBadges = [
      { badge_id: 'top_donator', name: 'Top Donator', description: 'Won a match with highest coins', requirement_type: 'match_win', requirement_value: 1, rarity: 'common', icon: '👑' },
      { badge_id: 'legend', name: 'Legend', description: 'Won 10 matches', requirement_type: 'total_wins', requirement_value: 10, rarity: 'legendary', icon: '⭐' },
      { badge_id: 'supporter', name: 'Supporter', description: 'Participated in 5 matches', requirement_type: 'matches_played', requirement_value: 5, rarity: 'common', icon: '💎' },
      { badge_id: 'team_player', name: 'Team Player', description: 'Won 5 team matches', requirement_type: 'team_wins', requirement_value: 5, rarity: 'rare', icon: '🤝' },
      { badge_id: 'coin_master', name: 'Coin Master', description: 'Collected 10,000 lifetime coins', requirement_type: 'total_coins', requirement_value: 10000, rarity: 'epic', icon: '🪙' },
      { badge_id: 'generous', name: 'Generous', description: 'Sent 100 gifts', requirement_type: 'total_gifts', requirement_value: 100, rarity: 'rare', icon: '🎁' },
      { badge_id: 'champion', name: 'Champion', description: 'Won 3 matches in a row', requirement_type: 'win_streak', requirement_value: 3, rarity: 'epic', icon: '🏆' },
      { badge_id: 'veteran', name: 'Veteran', description: 'Played 20 matches', requirement_type: 'matches_played', requirement_value: 20, rarity: 'rare', icon: '🎖️' }
    ];

    const insertBadge = this.db.prepare(`
      INSERT OR IGNORE INTO coinbattle_badges 
      (badge_id, name, description, requirement_type, requirement_value, rarity, icon)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const badge of defaultBadges) {
      insertBadge.run(
        badge.badge_id,
        badge.name,
        badge.description,
        badge.requirement_type,
        badge.requirement_value,
        badge.rarity,
        badge.icon
      );
    }
  }

  /**
   * Create a new match
   */
  createMatch(matchData) {
    const { match_uuid, mode = 'solo' } = matchData;
    const startTime = Math.floor(Date.now() / 1000);

    const result = this.db.prepare(`
      INSERT INTO coinbattle_matches (match_uuid, start_time, mode, status)
      VALUES (?, ?, ?, 'active')
    `).run(match_uuid, startTime, mode);

    return result.lastInsertRowid;
  }

  /**
   * Get active match
   */
  getActiveMatch() {
    return this.db.prepare(`
      SELECT * FROM coinbattle_matches
      WHERE status = 'active'
      ORDER BY start_time DESC
      LIMIT 1
    `).get();
  }

  /**
   * Get current lifetime coin balance for a player.
   */
  getPlayerCoins(userId) {
    const player = this.db.prepare(`
      SELECT total_coins
      FROM coinbattle_players
      WHERE user_id = ?
    `).get(userId);

    return player ? player.total_coins : 0;
  }

  /**
   * Add coins to a player's lifetime balance.
   */
  addPlayerCoins(userId, amount) {
    const coins = Number(amount);
    if (!Number.isFinite(coins) || coins <= 0) {
      return false;
    }

    const result = this.db.prepare(`
      UPDATE coinbattle_players
      SET total_coins = total_coins + ?,
          last_seen = strftime('%s', 'now')
      WHERE user_id = ?
    `).run(Math.floor(coins), userId);

    return result.changes > 0;
  }

  /**
   * Deduct coins atomically from a player's lifetime balance.
   */
  deductPlayerCoins(userId, amount) {
    const coins = Number(amount);
    if (!Number.isFinite(coins) || coins <= 0) {
      return { success: false, error: 'Invalid coin amount', remaining: this.getPlayerCoins(userId) };
    }

    const transaction = this.db.transaction(() => {
      const player = this.db.prepare(`
        SELECT total_coins
        FROM coinbattle_players
        WHERE user_id = ?
      `).get(userId);

      const currentCoins = player ? player.total_coins : 0;
      const debit = Math.floor(coins);

      if (currentCoins < debit) {
        return { success: false, error: 'Insufficient coins', remaining: currentCoins };
      }

      this.db.prepare(`
        UPDATE coinbattle_players
        SET total_coins = total_coins - ?,
            last_seen = strftime('%s', 'now')
        WHERE user_id = ?
      `).run(debit, userId);

      return { success: true, remaining: currentCoins - debit };
    });

    return transaction();
  }

  /**
   * End a match with database transaction for consistency
   */
  endMatch(matchId, winnerData) {
    // Wrap in transaction for atomic all-or-nothing execution
    const transaction = this.db.transaction(() => {
      const endTime = Math.floor(Date.now() / 1000);
      const match = this.db.prepare('SELECT start_time FROM coinbattle_matches WHERE id = ?').get(matchId);
      
      if (!match) {
        throw new Error(`Match ${matchId} not found`);
      }
      
      const duration = endTime - match.start_time;

      this.db.prepare(`
        UPDATE coinbattle_matches
        SET end_time = ?, duration = ?, status = 'completed',
            winner_team = ?, winner_player_id = ?,
            team_red_score = ?, team_blue_score = ?, total_coins = ?
        WHERE id = ?
      `).run(
        endTime,
        duration,
        winnerData.winner_team || null,
        winnerData.winner_player_id || null,
        winnerData.team_red_score || 0,
        winnerData.team_blue_score || 0,
        winnerData.total_coins || 0,
        matchId
      );

      const participants = this.db.prepare(`
        SELECT id, user_id, team
        FROM coinbattle_match_participants
        WHERE match_id = ?
        ORDER BY coins DESC, joined_at ASC, id ASC
      `).all(matchId);

      const updateParticipantResult = this.db.prepare(`
        UPDATE coinbattle_match_participants
        SET rank = ?,
            is_winner = ?
        WHERE id = ?
      `);

      participants.forEach((participant, index) => {
        const isWinner = winnerData.winner_team
          ? participant.team === winnerData.winner_team
          : participant.user_id === winnerData.winner_player_id;

        updateParticipantResult.run(index + 1, isWinner ? 1 : 0, participant.id);
      });
    });

    // Execute transaction atomically
    try {
      transaction();
      this.logger.info(`Match ${matchId} ended successfully (transaction committed)`);
    } catch (error) {
      this.logger.error(`Transaction failed for match ${matchId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get or create player
   */
  getOrCreatePlayer(userData) {
    const { userId, uniqueId, nickname, profilePictureUrl } = userData;

    let player = this.db.prepare('SELECT * FROM coinbattle_players WHERE user_id = ?').get(userId);

    if (!player) {
      const result = this.db.prepare(`
        INSERT INTO coinbattle_players (user_id, unique_id, nickname, profile_picture_url)
        VALUES (?, ?, ?, ?)
      `).run(userId, uniqueId, nickname, profilePictureUrl);

      player = this.db.prepare('SELECT * FROM coinbattle_players WHERE id = ?').get(result.lastInsertRowid);
    } else {
      // Update profile data
      this.db.prepare(`
        UPDATE coinbattle_players
        SET nickname = ?, profile_picture_url = ?, last_seen = strftime('%s', 'now')
        WHERE user_id = ?
      `).run(nickname, profilePictureUrl, userId);
    }

    return player;
  }

  /**
   * Add participant to match
   */
  addMatchParticipant(matchId, playerId, userId, team = null) {
    const existing = this.db.prepare(`
      SELECT * FROM coinbattle_match_participants
      WHERE match_id = ? AND player_id = ?
    `).get(matchId, playerId);

    if (!existing) {
      this.db.prepare(`
        INSERT INTO coinbattle_match_participants (match_id, player_id, user_id, team)
        VALUES (?, ?, ?, ?)
      `).run(matchId, playerId, userId, team);
    }
  }

  /**
   * Record gift event
   */
  recordGiftEvent(matchId, playerId, userId, giftData, team, multiplier = 1.0, eventId = null, idempotencyKey = null) {
    // Generate event ID and idempotency key if not provided
    const finalEventId = eventId || `${matchId}_${userId}_${giftData.giftId}_${Date.now()}_${Math.random()}`;
    const finalIdempotencyKey = idempotencyKey || `gift_${userId}_${giftData.giftId}_${Date.now()}`;

    try {
      this.db.prepare(`
        INSERT INTO coinbattle_gift_events 
        (match_id, player_id, user_id, gift_id, gift_name, coins, multiplier, team, event_id, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        matchId,
        playerId,
        userId,
        giftData.giftId,
        giftData.giftName,
        giftData.coins,
        multiplier,
        team,
        finalEventId,
        finalIdempotencyKey
      );

      // Update participant coins
      this.db.prepare(`
        UPDATE coinbattle_match_participants
        SET coins = coins + ?, gifts = gifts + 1
        WHERE match_id = ? AND player_id = ?
      `).run(Math.floor(giftData.coins * multiplier), matchId, playerId);

      return true;
    } catch (error) {
      // Check if it's a duplicate (UNIQUE constraint violation)
      if (error.message.includes('UNIQUE constraint failed')) {
        this.logger.warn(`Duplicate event detected: ${finalEventId} or ${finalIdempotencyKey}`);
        return false; // Event already processed
      }
      throw error; // Re-throw other errors
    }
  }

  /**
   * Check if event has been processed (idempotency check)
   */
  isEventProcessed(eventId, idempotencyKey) {
    // Check event cache first (fast path)
    const cached = this.db.prepare(`
      SELECT id FROM coinbattle_event_cache
      WHERE event_id = ? OR idempotency_key = ?
    `).get(eventId, idempotencyKey);

    if (cached) {
      return true;
    }

    // Check gift events table (slower but persistent)
    const event = this.db.prepare(`
      SELECT id FROM coinbattle_gift_events
      WHERE event_id = ? OR idempotency_key = ?
    `).get(eventId, idempotencyKey);

    return !!event;
  }

  /**
   * Mark event as processed
   */
  markEventProcessed(eventId, idempotencyKey, matchId, userId, ttlSeconds = 3600) {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO coinbattle_event_cache
        (event_id, idempotency_key, match_id, user_id, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, idempotencyKey, matchId, userId, expiresAt);
    } catch (error) {
      this.logger.warn(`Failed to cache event: ${error.message}`);
    }
  }

  /**
   * Clean up expired events from cache (run periodically)
   */
  cleanupEventCache() {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db.prepare(`
      DELETE FROM coinbattle_event_cache
      WHERE expires_at < ?
    `).run(now);

    if (result.changes > 0) {
      this.logger.info(`Cleaned up ${result.changes} expired events from cache`);
    }
    return result.changes;
  }

  /**
   * Get match leaderboard
   */
  getMatchLeaderboard(matchId, limit = 10) {
    return this.db.prepare(`
      SELECT 
        mp.*,
        p.nickname,
        p.unique_id,
        p.profile_picture_url,
        p.badges
      FROM coinbattle_match_participants mp
      JOIN coinbattle_players p ON mp.player_id = p.id
      WHERE mp.match_id = ?
      ORDER BY mp.coins DESC
      LIMIT ?
    `).all(matchId, limit);
  }

  /**
   * Get team scores for a match
   */
  getTeamScores(matchId) {
    const scores = this.db.prepare(`
      SELECT team, SUM(coins) as total_coins, COUNT(*) as player_count
      FROM coinbattle_match_participants
      WHERE match_id = ? AND team IS NOT NULL
      GROUP BY team
    `).all(matchId);

    const result = { red: 0, blue: 0 };
    for (const score of scores) {
      if (score.team === 'red') result.red = score.total_coins;
      if (score.team === 'blue') result.blue = score.total_coins;
    }
    return result;
  }

  /**
   * Get lifetime leaderboard
   */
  getLifetimeLeaderboard(limit = 10) {
    return this.db.prepare(`
      SELECT *
      FROM coinbattle_players
      ORDER BY total_coins DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get match history
   */
  getMatchHistory(limit = 20, offset = 0) {
    return this.db.prepare(`
      SELECT * FROM coinbattle_matches
      WHERE status = 'completed'
      ORDER BY start_time DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  }

  /**
   * Update player lifetime stats
   */
  updatePlayerLifetimeStats(playerId, coins, gifts, wonMatch = false, wonTeamMatch = false) {
    this.db.prepare(`
      UPDATE coinbattle_players
      SET 
        total_coins = total_coins + ?,
        total_gifts = total_gifts + ?,
        matches_played = matches_played + 1,
        matches_won = matches_won + ?,
        team_wins = team_wins + ?,
        solo_wins = solo_wins + ?
      WHERE id = ?
    `).run(
      coins,
      gifts,
      wonMatch ? 1 : 0,
      wonTeamMatch ? 1 : 0,
      (wonMatch && !wonTeamMatch) ? 1 : 0,
      playerId
    );
  }

  /**
   * Award badge to player
   */
  awardBadge(playerId, badgeId) {
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO coinbattle_player_badges (player_id, badge_id)
        VALUES (?, ?)
      `).run(playerId, badgeId);

      // Update player badges JSON
      const badges = this.getPlayerBadges(playerId);
      const badgeIds = badges.map(b => b.badge_id);
      
      this.db.prepare(`
        UPDATE coinbattle_players
        SET badges = ?
        WHERE id = ?
      `).run(JSON.stringify(badgeIds), playerId);

      return true;
    } catch (error) {
      this.logger.error(`Failed to award badge: ${error.message}`);
      return false;
    }
  }

  /**
   * Get player badges
   */
  getPlayerBadges(playerId) {
    return this.db.prepare(`
      SELECT b.*, pb.earned_at
      FROM coinbattle_player_badges pb
      JOIN coinbattle_badges b ON pb.badge_id = b.badge_id
      WHERE pb.player_id = ?
      ORDER BY pb.earned_at DESC
    `).all(playerId);
  }

  /**
   * Check and award badges based on player stats
   */
  checkAndAwardBadges(playerId) {
    const player = this.db.prepare('SELECT * FROM coinbattle_players WHERE id = ?').get(playerId);
    const badges = this.db.prepare('SELECT * FROM coinbattle_badges').all();
    const awardedBadges = [];

    for (const badge of badges) {
      // Check if already has badge
      const hasBadge = this.db.prepare(`
        SELECT * FROM coinbattle_player_badges
        WHERE player_id = ? AND badge_id = ?
      `).get(playerId, badge.badge_id);

      if (hasBadge) continue;

      // Check requirements
      let qualifies = false;
      switch (badge.requirement_type) {
        case 'total_coins':
          qualifies = player.total_coins >= badge.requirement_value;
          break;
        case 'total_gifts':
          qualifies = player.total_gifts >= badge.requirement_value;
          break;
        case 'matches_played':
          qualifies = player.matches_played >= badge.requirement_value;
          break;
        case 'total_wins':
          qualifies = player.matches_won >= badge.requirement_value;
          break;
        case 'team_wins':
          qualifies = player.team_wins >= badge.requirement_value;
          break;
        case 'match_win':
          qualifies = player.matches_won >= badge.requirement_value;
          break;
      }

      if (qualifies) {
        this.awardBadge(playerId, badge.badge_id);
        awardedBadges.push(badge);
      }
    }

    return awardedBadges;
  }

  /**
   * Record multiplier event
   */
  recordMultiplierEvent(matchId, multiplier, duration, activatedBy = null) {
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + duration;

    this.db.prepare(`
      INSERT INTO coinbattle_multiplier_events
      (match_id, multiplier, duration, start_time, end_time, activated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(matchId, multiplier, duration, startTime, endTime, activatedBy);

    // Update match multiplier event count
    this.db.prepare(`
      UPDATE coinbattle_matches
      SET multiplier_events = multiplier_events + 1
      WHERE id = ?
    `).run(matchId);
  }

  /**
   * Get player statistics
   */
  getPlayerStats(userId) {
    return this.db.prepare(`
      SELECT 
        p.*,
        COUNT(DISTINCT mp.match_id) as total_matches,
        SUM(mp.coins) as session_total_coins,
        (SELECT COUNT(*) FROM coinbattle_player_badges WHERE player_id = p.id) as badge_count
      FROM coinbattle_players p
      LEFT JOIN coinbattle_match_participants mp ON p.id = mp.player_id
      WHERE p.user_id = ?
      GROUP BY p.id
    `).get(userId);
  }

  /**
   * Update match statistics
   */
  updateMatchStats(matchId) {
    const stats = this.db.prepare(`
      SELECT 
        SUM(coins) as total_coins,
        SUM(gifts) as total_gifts
      FROM coinbattle_match_participants
      WHERE match_id = ?
    `).get(matchId);

    this.db.prepare(`
      UPDATE coinbattle_matches
      SET total_coins = ?, total_gifts = ?
      WHERE id = ?
    `).run(stats.total_coins || 0, stats.total_gifts || 0, matchId);
  }

  /**
   * Increment match auto-extension counter
   */
  incrementAutoExtension(matchId) {
    this.db.prepare(`
      UPDATE coinbattle_matches
      SET auto_extended = auto_extended + 1
      WHERE id = ?
    `).run(matchId);
  }

  /**
   * Queue gift event for batch processing (high performance mode)
   */
  queueGiftEventBatch(matchId, playerId, userId, giftData, team, multiplier, eventId, idempotencyKey) {
    this.eventBatch.push([
      matchId,
      playerId,
      userId,
      giftData.giftId,
      giftData.giftName,
      giftData.coins,
      multiplier,
      team,
      eventId,
      idempotencyKey
    ]);

    // Clear existing timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // Auto-flush if batch size reached
    if (this.eventBatch.length >= this.batchSize) {
      this.flushEventBatch();
    } else {
      // Set timer to flush after timeout
      this.batchTimer = setTimeout(() => {
        this.flushEventBatch();
      }, this.batchTimeout);
    }
  }

  /**
   * Flush batched events to database (atomic transaction)
   */
  flushEventBatch() {
    if (this.eventBatch.length === 0) {
      return 0;
    }

    const batchToProcess = this.eventBatch.splice(0); // Empty the queue
    
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Batch insert in transaction for maximum performance
    const transaction = this.db.transaction((events) => {
      for (const eventData of events) {
        try {
          this.batchInsertStatement.run(...eventData);
        } catch (error) {
          // Handle duplicate key silently (idempotency)
          if (!error.message.includes('UNIQUE constraint failed')) {
            this.logger.error(`Batch insert error: ${error.message}`);
          }
        }
      }
    });

    try {
      transaction(batchToProcess);
      this.logger.info(`Flushed ${batchToProcess.length} events to database (batch mode)`);
      return batchToProcess.length;
    } catch (error) {
      this.logger.error(`Batch transaction failed: ${error.message}`);
      // Re-queue events for retry
      this.eventBatch.unshift(...batchToProcess);
      return 0;
    }
  }

  /**
   * Enable batch mode for high-throughput scenarios (5k+ events/min)
   */
  enableBatchMode() {
    this.batchMode = true;
    this.logger.info('Batch mode enabled for high-performance event processing');
  }

  /**
   * Disable batch mode and flush remaining events
   */
  disableBatchMode() {
    this.batchMode = false;
    this.flushEventBatch();
    this.logger.info('Batch mode disabled');
  }

  /**
   * Get weekly leaderboard (last 7 days)
   */
  getWeeklyLeaderboard(limit = 10) {
    const weekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    
    return this.db.prepare(`
      SELECT 
        p.id,
        p.user_id,
        p.unique_id,
        p.nickname,
        p.profile_picture_url,
        p.badges,
        SUM(mp.coins) as total_coins,
        SUM(mp.gifts) as total_gifts,
        COUNT(DISTINCT mp.match_id) as matches_played,
        SUM(mp.is_winner) as matches_won
      FROM coinbattle_players p
      JOIN coinbattle_match_participants mp ON p.id = mp.player_id
      JOIN coinbattle_matches m ON mp.match_id = m.id
      WHERE m.start_time >= ?
      GROUP BY p.id
      ORDER BY total_coins DESC
      LIMIT ?
    `).all(weekAgo, limit);
  }

  /**
   * Get season leaderboard based on configured season dates
   */
  getSeasonLeaderboard(limit = 10) {
    const activeSeason = this.getActiveSeason();
    
    if (!activeSeason) {
      return [];
    }
    
    return this.db.prepare(`
      SELECT 
        p.id,
        p.user_id,
        p.unique_id,
        p.nickname,
        p.profile_picture_url,
        p.badges,
        SUM(mp.coins) as total_coins,
        SUM(mp.gifts) as total_gifts,
        COUNT(DISTINCT mp.match_id) as matches_played,
        SUM(mp.is_winner) as matches_won
      FROM coinbattle_players p
      JOIN coinbattle_match_participants mp ON p.id = mp.player_id
      JOIN coinbattle_matches m ON mp.match_id = m.id
      WHERE m.start_time >= ? AND m.start_time <= ?
      GROUP BY p.id
      ORDER BY total_coins DESC
      LIMIT ?
    `).all(activeSeason.start_date, activeSeason.end_date, limit);
  }

  /**
   * Create or update a season
   */
  createOrUpdateSeason(seasonName, startDate, endDate) {
    try {
      // Deactivate all other seasons first
      this.db.prepare(`
        UPDATE coinbattle_seasons SET is_active = 0
      `).run();

      // Create or update the new season
      const result = this.db.prepare(`
        INSERT INTO coinbattle_seasons (season_name, start_date, end_date, is_active)
        VALUES (?, ?, ?, 1)
      `).run(seasonName, startDate, endDate);

      return { success: true, seasonId: result.lastInsertRowid };
    } catch (error) {
      this.logger.error(`Failed to create/update season: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get active season
   */
  getActiveSeason() {
    return this.db.prepare(`
      SELECT * FROM coinbattle_seasons
      WHERE is_active = 1
      LIMIT 1
    `).get();
  }

  /**
   * Get all seasons
   */
  getAllSeasons() {
    return this.db.prepare(`
      SELECT * FROM coinbattle_seasons
      ORDER BY created_at DESC
    `).all();
  }

  /**
   * Delete a season
   */
  deleteSeason(seasonId) {
    try {
      this.db.prepare(`
        DELETE FROM coinbattle_seasons WHERE id = ?
      `).run(seasonId);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to delete season: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a user from all leaderboards
   * This removes the player and all their associated data
   */
  deletePlayer(userId) {
    const transaction = this.db.transaction(() => {
      // Get player ID
      const player = this.db.prepare(`
        SELECT id FROM coinbattle_players WHERE user_id = ?
      `).get(userId);

      if (!player) {
        throw new Error('Player not found');
      }

      const playerId = player.id;

      // Delete from all related tables
      this.db.prepare(`DELETE FROM coinbattle_player_badges WHERE player_id = ?`).run(playerId);
      this.db.prepare(`DELETE FROM coinbattle_gift_events WHERE player_id = ?`).run(playerId);
      this.db.prepare(`DELETE FROM coinbattle_match_participants WHERE player_id = ?`).run(playerId);
      this.db.prepare(`DELETE FROM coinbattle_event_cache WHERE user_id = ?`).run(userId);
      this.db.prepare(`DELETE FROM coinbattle_players WHERE id = ?`).run(playerId);

      this.logger.info(`Deleted player ${userId} from all leaderboards`);
    });

    try {
      transaction();
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to delete player: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all players for management
   */
  getAllPlayers(limit = 100, offset = 0) {
    return this.db.prepare(`
      SELECT 
        id,
        user_id,
        unique_id,
        nickname,
        total_coins,
        total_gifts,
        matches_played,
        matches_won,
        first_seen,
        last_seen
      FROM coinbattle_players
      ORDER BY total_coins DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  }

  /**
   * Insert a single gift event (used as fallback by AdaptiveBatchProcessor)
   */
  insertGiftEvent(event) {
    return this.db.prepare(`
      INSERT OR IGNORE INTO coinbattle_gift_events
          (match_id, player_id, user_id, gift_id, gift_name, coins, multiplier, team, event_id, idempotency_key, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.matchId || event.match_id || null,
      event.playerId || event.player_id || null,
      event.userId || event.user_id || '',
      event.giftId || event.gift_id || 0,
      event.giftName || event.gift_name || '',
      event.coins || 0,
      event.multiplier || 1.0,
      event.team || null,
      event.eventId || event.event_id || null,
      event.idempotencyKey || event.idempotency_key || null,
      event.timestamp || Math.floor(Date.now() / 1000)
    );
  }

  /**
   * Batch insert gift events using a transaction for performance
   */
  batchInsertGiftEvents(events) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO coinbattle_gift_events
          (match_id, player_id, user_id, gift_id, gift_name, coins, multiplier, team, event_id, idempotency_key, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((evts) => {
      for (const evt of evts) {
        stmt.run(
          evt.matchId || evt.match_id || null,
          evt.playerId || evt.player_id || null,
          evt.userId || evt.user_id || '',
          evt.giftId || evt.gift_id || 0,
          evt.giftName || evt.gift_name || '',
          evt.coins || 0,
          evt.multiplier || 1.0,
          evt.team || null,
          evt.eventId || evt.event_id || null,
          evt.idempotencyKey || evt.idempotency_key || null,
          evt.timestamp || Math.floor(Date.now() / 1000)
        );
      }
    });
    insertMany(events);
  }

  /**
   * Cleanup on destruction
   */
  destroy() {
    // Flush any remaining batched events
    this.flushEventBatch();
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
  }
}

module.exports = CoinBattleDatabase;
