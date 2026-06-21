'use strict';

/**
 * Database handler for the TopTier plugin.
 * All operations are synchronous using better-sqlite3 prepared statements.
 */
class TopTierDB {
  /**
   * @param {object} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this._stmts = {};
  }

  /**
   * Create all required tables and prepare statements.
   */
  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS toptier_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_type TEXT NOT NULL,
        session_id TEXT NOT NULL,
        username TEXT NOT NULL,
        nickname TEXT DEFAULT '',
        profile_picture_url TEXT DEFAULT '',
        score INTEGER DEFAULT 0,
        raw_score INTEGER DEFAULT 0,
        rank INTEGER DEFAULT 0,
        last_event_at INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        UNIQUE(board_type, session_id, username)
      );

      CREATE TABLE IF NOT EXISTS toptier_decay_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_type TEXT NOT NULL,
        session_id TEXT NOT NULL,
        username TEXT NOT NULL,
        decay_amount INTEGER NOT NULL,
        score_before INTEGER NOT NULL,
        score_after INTEGER NOT NULL,
        decayed_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE IF NOT EXISTS toptier_all_time (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_type TEXT NOT NULL,
        username TEXT NOT NULL,
        nickname TEXT DEFAULT '',
        profile_picture_url TEXT DEFAULT '',
        best_score INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        sessions_in_top3 INTEGER DEFAULT 0,
        last_seen_at INTEGER DEFAULT 0,
        UNIQUE(board_type, username)
      );
    `);

    this._prepareStatements();
  }

  /**
   * Prepare all SQL statements for reuse.
   * @private
   */
  _prepareStatements() {
    this._stmts.upsertScore = this.db.prepare(`
      INSERT INTO toptier_scores (board_type, session_id, username, nickname, profile_picture_url, score, raw_score, last_event_at)
      VALUES (@boardType, @sessionId, @username, @nickname, @profilePictureUrl, @deltaScore, @deltaScore, @now)
      ON CONFLICT(board_type, session_id, username)
      DO UPDATE SET
        nickname = @nickname,
        profile_picture_url = @profilePictureUrl,
        score = score + @deltaScore,
        raw_score = raw_score + @deltaScore,
        last_event_at = @now
    `);

    this._stmts.getScore = this.db.prepare(`
      SELECT * FROM toptier_scores
      WHERE board_type = @boardType AND session_id = @sessionId AND username = @username
    `);

    this._stmts.getBoard = this.db.prepare(`
      SELECT * FROM toptier_scores
      WHERE board_type = @boardType AND session_id = @sessionId
      ORDER BY score DESC
      LIMIT @limit
    `);

    this._stmts.getAllRows = this.db.prepare(`
      SELECT id, username FROM toptier_scores
      WHERE board_type = @boardType AND session_id = @sessionId
      ORDER BY score DESC
    `);

    this._stmts.updateRank = this.db.prepare(`
      UPDATE toptier_scores SET rank = @rank WHERE id = @id
    `);

    this._stmts.resetBoard = this.db.prepare(`
      DELETE FROM toptier_scores
      WHERE board_type = @boardType AND session_id = @sessionId
    `);

    this._stmts.logDecay = this.db.prepare(`
      INSERT INTO toptier_decay_log (board_type, session_id, username, decay_amount, score_before, score_after)
      VALUES (@boardType, @sessionId, @username, @decayAmount, @scoreBefore, @scoreAfter)
    `);

    this._stmts.updateScoreAfterDecay = this.db.prepare(`
      UPDATE toptier_scores SET score = @newScore
      WHERE board_type = @boardType AND session_id = @sessionId AND username = @username
    `);

    this._stmts.upsertAllTime = this.db.prepare(`
      INSERT INTO toptier_all_time (board_type, username, nickname, profile_picture_url, best_score, total_score, sessions_in_top3, last_seen_at)
      VALUES (@boardType, @username, @nickname, @profilePictureUrl, @sessionScore, @sessionScore, 0, @now)
      ON CONFLICT(board_type, username)
      DO UPDATE SET
        nickname = @nickname,
        profile_picture_url = @profilePictureUrl,
        best_score = MAX(best_score, @sessionScore),
        total_score = total_score + @sessionScore,
        last_seen_at = @now
    `);

    this._stmts.incrementTop3 = this.db.prepare(`
      UPDATE toptier_all_time SET sessions_in_top3 = sessions_in_top3 + 1
      WHERE board_type = @boardType AND username = @username
    `);

    this._stmts.getAllTime = this.db.prepare(`
      SELECT * FROM toptier_all_time
      WHERE board_type = @boardType
      ORDER BY best_score DESC
      LIMIT @limit
    `);

    this._stmts.getDecayLog = this.db.prepare(`
      SELECT * FROM toptier_decay_log
      WHERE board_type = @boardType AND session_id = @sessionId
      ORDER BY decayed_at DESC
      LIMIT @limit
    `);
  }

  /**
   * Insert or update a score entry for a user.
   * @param {string} boardType - 'likes' or 'gifts'
   * @param {string} sessionId - Current session UUID
   * @param {string} username - TikTok unique ID
   * @param {string} nickname - Display name
   * @param {string} profilePictureUrl - Avatar URL
   * @param {number} deltaScore - Score to add
   * @returns {object} The updated row
   */
  upsertScore(boardType, sessionId, username, nickname, profilePictureUrl, deltaScore) {
    const now = Math.floor(Date.now() / 1000);
    this._stmts.upsertScore.run({
      boardType, sessionId, username, nickname,
      profilePictureUrl: profilePictureUrl || '',
      deltaScore, now
    });
    return this._stmts.getScore.get({ boardType, sessionId, username });
  }

  /**
   * Get the leaderboard for a board type and session, sorted by score DESC.
   * @param {string} boardType - 'likes' or 'gifts'
   * @param {string} sessionId - Current session UUID
   * @param {number} limit - Maximum entries to return
   * @returns {Array} Leaderboard entries with rank field
   */
  getBoard(boardType, sessionId, limit) {
    const rows = this._stmts.getBoard.all({ boardType, sessionId, limit });
    rows.forEach((row, i) => { row.rank = i + 1; });
    return rows;
  }

  /**
   * Delete all scores for a board type and session.
   * @param {string} boardType - 'likes' or 'gifts'
   * @param {string} sessionId - Current session UUID
   */
  resetBoard(boardType, sessionId) {
    this._stmts.resetBoard.run({ boardType, sessionId });
  }

  /**
   * Log a decay event.
   * @param {string} boardType - 'likes' or 'gifts'
   * @param {string} sessionId - Current session UUID
   * @param {string} username - TikTok unique ID
   * @param {number} decayAmount - Amount decayed
   * @param {number} scoreBefore - Score before decay
   * @param {number} scoreAfter - Score after decay
   */
  logDecay(boardType, sessionId, username, decayAmount, scoreBefore, scoreAfter) {
    this._stmts.logDecay.run({ boardType, sessionId, username, decayAmount, scoreBefore, scoreAfter });
  }

  /**
   * Update the score of a user after decay.
   * @param {string} boardType - 'likes' or 'gifts'
   * @param {string} sessionId - Current session UUID
   * @param {string} username - TikTok unique ID
   * @param {number} newScore - New score value
   */
  updateScoreAfterDecay(boardType, sessionId, username, newScore) {
    this._stmts.updateScoreAfterDecay.run({ boardType, sessionId, username, newScore });
  }

  /**
   * Recalculate and update rank numbers for all users in a board/session.
   * @param {string} boardType - 'likes' or 'gifts'
   * @param {string} sessionId - Current session UUID
   */
  updateRanks(boardType, sessionId) {
    const rows = this._stmts.getAllRows.all({ boardType, sessionId });
    const updateRank = this._stmts.updateRank;
    for (let i = 0; i < rows.length; i++) {
      updateRank.run({ rank: i + 1, id: rows[i].id });
    }
  }

  /**
   * Update or create an all-time record for a user.
   * @param {string} boardType - 'likes' or 'gifts'
   * @param {string} username - TikTok unique ID
   * @param {string} nickname - Display name
   * @param {string} profilePictureUrl - Avatar URL
   * @param {number} sessionScore - Score from the ended session
   */
  updateAllTime(boardType, username, nickname, profilePictureUrl, sessionScore) {
    const now = Math.floor(Date.now() / 1000);
    this._stmts.upsertAllTime.run({
      boardType, username, nickname,
      profilePictureUrl: profilePictureUrl || '',
      sessionScore, now
    });
  }

  /**
   * Get the all-time leaderboard.
   * @param {string} boardType - 'likes' or 'gifts'
   * @param {number} limit - Maximum entries to return
   * @returns {Array} All-time entries sorted by best_score DESC
   */
  getAllTime(boardType, limit) {
    return this._stmts.getAllTime.all({ boardType, limit });
  }

  /**
   * Get recent decay log entries.
   * @param {string} boardType - 'likes' or 'gifts'
   * @param {string} sessionId - Current session UUID
   * @param {number} limit - Maximum entries to return
   * @returns {Array} Decay log entries sorted by decayed_at DESC
   */
  getDecayLog(boardType, sessionId, limit) {
    return this._stmts.getDecayLog.all({ boardType, sessionId, limit });
  }
}

module.exports = TopTierDB;
