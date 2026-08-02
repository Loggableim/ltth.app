/**
 * Database Module for Interactive Story Plugin
 * Handles story sessions, chapters, and statistics
 */
class StoryDatabase {
  constructor(api) {
    this.api = api;
    this.db = api.getDatabase();
  }

  /**
   * Initialize database tables
   */
  initialize() {
    try {
      // Story sessions table
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS story_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          theme TEXT NOT NULL,
          outline TEXT,
          model TEXT,
          start_time TEXT NOT NULL,
          end_time TEXT,
          status TEXT DEFAULT 'active',
          metadata TEXT
        )
      `).run();

      // Chapters table
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS story_chapters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          chapter_number INTEGER NOT NULL,
          title TEXT,
          content TEXT NOT NULL,
          choices TEXT NOT NULL,
          memory_tags TEXT,
          image_path TEXT,
          audio_paths TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES story_sessions(id)
        )
      `).run();

      this._migrateChapterNarrationColumns();

      // Votes table
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS story_votes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          chapter_number INTEGER NOT NULL,
          choice_index INTEGER NOT NULL,
          vote_count INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES story_sessions(id)
        )
      `).run();

      // Viewer stats table
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS story_viewer_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          username TEXT,
          votes_cast INTEGER DEFAULT 0,
          last_vote_at TEXT,
          FOREIGN KEY (session_id) REFERENCES story_sessions(id)
        )
      `).run();
      // Pen-and-paper participants and round attendance
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS story_participants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          username TEXT NOT NULL,
          role_id TEXT NOT NULL,
          role_name TEXT NOT NULL,
          joined_round INTEGER NOT NULL DEFAULT 0,
          last_vote_round INTEGER,
          missed_rounds INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          eliminated_at TEXT,
          UNIQUE(session_id, user_id),
          FOREIGN KEY (session_id) REFERENCES story_sessions(id)
        )
      `).run();
      // Story memory table (full memory snapshots)
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS story_participant_round_resolutions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          participant_id INTEGER NOT NULL,
          round INTEGER NOT NULL,
          resolved_at TEXT NOT NULL,
          UNIQUE(session_id, participant_id, round),
          FOREIGN KEY (session_id) REFERENCES story_sessions(id),
          FOREIGN KEY (participant_id) REFERENCES story_participants(id)
        )
      `).run();
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS story_memory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          memory_data TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES story_sessions(id)
        )
      `).run();

      this.api.log('Story database tables initialized', 'info');
    } catch (error) {
      this.api.log(`Error initializing story database: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Add narration metadata columns to existing chapter tables without
   * replacing stored story data.
   */
  _migrateChapterNarrationColumns() {
    const columns = this.db.prepare('PRAGMA table_info(story_chapters)').all();
    const columnNames = new Set(columns.map(column => column.name));

    if (!columnNames.has('narration_segments')) {
      this.db.prepare('ALTER TABLE story_chapters ADD COLUMN narration_segments TEXT').run();
    }

    if (!columnNames.has('tts_text')) {
      this.db.prepare('ALTER TABLE story_chapters ADD COLUMN tts_text TEXT').run();
    }
  }

  _serializeNarrationSegments(segments) {
    if (!Array.isArray(segments)) {
      return null;
    }

    try {
      return JSON.stringify(segments);
    } catch (error) {
      this.api.log(`Could not serialize narration segments: ${error.message}`, 'warn');
      return null;
    }
  }

  _parseNarrationSegments(value) {
    if (!value) {
      return [];
    }

    try {
      const segments = JSON.parse(value);
      return Array.isArray(segments) ? segments : [];
    } catch (error) {
      this.api.log(`Could not parse narration segments: ${error.message}`, 'warn');
      return [];
    }
  }
  /**
   * Create a new story session
   * @param {Object} data - Session data
   * @returns {number} - Session ID
   */
  createSession(data) {
    const stmt = this.db.prepare(`
      INSERT INTO story_sessions (theme, outline, model, start_time, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.theme,
      data.outline || null,
      data.model || 'deepseek',
      new Date().toISOString(),
      JSON.stringify(data.metadata || {})
    );

    return result.lastInsertRowid;
  }

  /**
   * Get session by ID
   * @param {number} sessionId - Session ID
   * @returns {Object|null} - Session data
   */
  getSession(sessionId) {
    const stmt = this.db.prepare(`
      SELECT * FROM story_sessions WHERE id = ?
    `);
    
    const session = stmt.get(sessionId);
    if (session && session.metadata) {
      session.metadata = JSON.parse(session.metadata);
    }
    
    return session;
  }

  /**
   * Get active session
   * @returns {Object|null} - Active session
   */
  getActiveSession() {
    const stmt = this.db.prepare(`
      SELECT * FROM story_sessions 
      WHERE status = 'active' 
      ORDER BY start_time DESC 
      LIMIT 1
    `);
    
    const session = stmt.get();
    if (session && session.metadata) {
      session.metadata = JSON.parse(session.metadata);
    }
    
    return session;
  }

  /**
   * Update session status
   * @param {number} sessionId - Session ID
   * @param {string} status - New status
   */
  updateSessionStatus(sessionId, status) {
    const stmt = this.db.prepare(`
      UPDATE story_sessions 
      SET status = ?, end_time = ? 
      WHERE id = ?
    `);

    stmt.run(status, new Date().toISOString(), sessionId);
  }

  /**
   * Save a chapter
   * @param {number} sessionId - Session ID
   * @param {Object} chapter - Chapter data
   * @returns {number} - Chapter ID
   */
  saveChapter(sessionId, chapter) {
    const stmt = this.db.prepare(`
      INSERT INTO story_chapters 
      (session_id, chapter_number, title, content, choices, memory_tags, image_path, audio_paths, narration_segments, tts_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      sessionId,
      chapter.chapterNumber,
      chapter.title,
      chapter.content,
      JSON.stringify(chapter.choices),
      JSON.stringify(chapter.memoryTags || {}),
      chapter.imagePath || null,
      JSON.stringify(chapter.audioPaths || []),
      this._serializeNarrationSegments(chapter.narrationSegments),
      typeof chapter.ttsText === 'string' ? chapter.ttsText : null,
      new Date().toISOString()
    );

    return result.lastInsertRowid;
  }

  /**
   * Get chapter by session and number
   * @param {number} sessionId - Session ID
   * @param {number} chapterNumber - Chapter number
   * @returns {Object|null} - Chapter data
   */
  getChapter(sessionId, chapterNumber) {
    const stmt = this.db.prepare(`
      SELECT * FROM story_chapters 
      WHERE session_id = ? AND chapter_number = ?
    `);
    
    const chapter = stmt.get(sessionId, chapterNumber);
    if (chapter) {
      chapter.choices = JSON.parse(chapter.choices);
      chapter.memoryTags = JSON.parse(chapter.memory_tags || '{}');
      chapter.audioPaths = JSON.parse(chapter.audio_paths || '[]');
      chapter.narrationSegments = this._parseNarrationSegments(chapter.narration_segments);
      chapter.ttsText = typeof chapter.tts_text === 'string' ? chapter.tts_text : null;
    }
    
    return chapter;
  }

  /**
   * Get all chapters for a session
   * @param {number} sessionId - Session ID
   * @returns {Array} - Array of chapters
   */
  getSessionChapters(sessionId) {
    const stmt = this.db.prepare(`
      SELECT * FROM story_chapters 
      WHERE session_id = ? 
      ORDER BY chapter_number ASC
    `);
    
    const chapters = stmt.all(sessionId);
    return chapters.map(ch => {
      ch.choices = JSON.parse(ch.choices);
      ch.memoryTags = JSON.parse(ch.memory_tags || '{}');
      ch.audioPaths = JSON.parse(ch.audio_paths || '[]');
      ch.narrationSegments = this._parseNarrationSegments(ch.narration_segments);
      ch.ttsText = typeof ch.tts_text === 'string' ? ch.tts_text : null;
      return ch;
    });
  }

  /**
   * Save voting results
   * @param {number} sessionId - Session ID
   * @param {number} chapterNumber - Chapter number
   * @param {number} choiceIndex - Winning choice index
   * @param {number} voteCount - Number of votes
   */
  saveVote(sessionId, chapterNumber, choiceIndex, voteCount) {
    const stmt = this.db.prepare(`
      INSERT INTO story_votes (session_id, chapter_number, choice_index, vote_count, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(sessionId, chapterNumber, choiceIndex, voteCount, new Date().toISOString());
  }

  /**
   * Update viewer statistics
   * @param {number} sessionId - Session ID
   * @param {string} userId - User ID
   * @param {string} username - Username
   */
  updateViewerStats(sessionId, userId, username) {
    // Check if user exists
    const checkStmt = this.db.prepare(`
      SELECT id, votes_cast FROM story_viewer_stats 
      WHERE session_id = ? AND user_id = ?
    `);
    
    const existing = checkStmt.get(sessionId, userId);
    
    if (existing) {
      // Update existing
      const updateStmt = this.db.prepare(`
        UPDATE story_viewer_stats 
        SET votes_cast = ?, username = ?, last_vote_at = ? 
        WHERE id = ?
      `);
      updateStmt.run(existing.votes_cast + 1, username, new Date().toISOString(), existing.id);
    } else {
      // Insert new
      const insertStmt = this.db.prepare(`
        INSERT INTO story_viewer_stats (session_id, user_id, username, votes_cast, last_vote_at)
        VALUES (?, ?, ?, 1, ?)
      `);
      insertStmt.run(sessionId, userId, username, new Date().toISOString());
    }
  }

  _normalizeParticipantInput(participant) {
    return {
      userId: String(participant.userId),
      username: String(participant.username || 'Viewer'),
      roleId: String(participant.roleId),
      roleName: String(participant.roleName),
      joinedRound: Number.isInteger(participant.joinedRound) ? participant.joinedRound : 0
    };
  }

  createParticipant(sessionId, participant) {
    const normalized = this._normalizeParticipantInput(participant);
    this.db.prepare(`
      INSERT OR IGNORE INTO story_participants
        (session_id, user_id, username, role_id, role_name, joined_round, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, normalized.userId, normalized.username, normalized.roleId, normalized.roleName, normalized.joinedRound, new Date().toISOString());
    return this.getParticipant(sessionId, normalized.userId);
  }

  getParticipant(sessionId, userId) {
    return this.db.prepare(`
      SELECT * FROM story_participants WHERE session_id = ? AND user_id = ?
    `).get(sessionId, userId) || null;
  }

  listParticipants(sessionId, { includeEliminated = false } = {}) {
    const statusClause = includeEliminated ? '' : "AND status = 'active'";
    return this.db.prepare(`
      SELECT * FROM story_participants
      WHERE session_id = ? ${statusClause}
      ORDER BY created_at ASC, id ASC
    `).all(sessionId);
  }

  recordParticipantVote(sessionId, userId, round) {
    this.db.prepare(`
      UPDATE story_participants
      SET last_vote_round = ?, missed_rounds = 0
      WHERE session_id = ? AND user_id = ? AND status = 'active'
    `).run(round, sessionId, userId);
    const participant = this.getParticipant(sessionId, userId);
    return participant && participant.status === 'active' ? participant : null;
  }

  resolveParticipantRound(sessionId, round, inactivityLimitRounds = 2) {
    const activeParticipants = this.listParticipants(sessionId);
    const updateAttendance = this.db.prepare(`UPDATE story_participants SET missed_rounds = ? WHERE id = ?`);
    const eliminateParticipant = this.db.prepare(`
      UPDATE story_participants
      SET missed_rounds = ?, status = 'eliminated', eliminated_at = ?
      WHERE id = ?
    `);
    const updated = [];
    const claimRoundResolution = this.db.prepare(`
      INSERT OR IGNORE INTO story_participant_round_resolutions
        (session_id, participant_id, round, resolved_at)
      VALUES (?, ?, ?, ?)
    `);
    const eliminated = [];
    const transactionDatabase = typeof this.db.transaction === 'function'
      ? this.db
      : this.db && this.db.db;
    if (!transactionDatabase || typeof transactionDatabase.transaction !== 'function') {
      throw new Error('Story database does not expose transaction support');
    }
    const resolve = transactionDatabase.transaction(() => {
      for (const participant of activeParticipants) {
        if (participant.joined_round >= round || participant.last_vote_round === round) {
          continue;
        }
        const missedRounds = participant.missed_rounds + 1;
        const wasClaimed = claimRoundResolution.run(
          sessionId, participant.id, round, new Date().toISOString()
        ).changes === 1;
        if (!wasClaimed) {
          continue;
        }
        if (missedRounds >= inactivityLimitRounds) {
          eliminateParticipant.run(missedRounds, new Date().toISOString(), participant.id);
          const eliminatedParticipant = { ...participant, missed_rounds: missedRounds, status: 'eliminated' };
          updated.push(eliminatedParticipant);
          eliminated.push(eliminatedParticipant);
        } else {
          updateAttendance.run(missedRounds, participant.id);
          updated.push({ ...participant, missed_rounds: missedRounds });
        }
      }
    });
    resolve();
    return { updated, eliminated };
  }

  resetParticipants(sessionId) {
    this.db.prepare(`DELETE FROM story_participant_round_resolutions WHERE session_id = ?`).run(sessionId);
    return this.db.prepare(`DELETE FROM story_participants WHERE session_id = ?`).run(sessionId).changes;
  }
  /**
   * Get top voters for a session
   * @param {number} sessionId - Session ID
   * @param {number} limit - Number of voters to return
   * @returns {Array} - Top voters
   */
  getTopVoters(sessionId, limit = 10) {
    const stmt = this.db.prepare(`
      SELECT username, votes_cast, last_vote_at
      FROM story_viewer_stats 
      WHERE session_id = ? 
      ORDER BY votes_cast DESC, last_vote_at DESC
      LIMIT ?
    `);
    
    return stmt.all(sessionId, limit);
  }

  /**
   * Save story memory snapshot
   * @param {number} sessionId - Session ID
   * @param {Object} memoryData - Memory object
   */
  saveMemory(sessionId, memoryData) {
    const stmt = this.db.prepare(`
      INSERT INTO story_memory (session_id, memory_data, updated_at)
      VALUES (?, ?, ?)
    `);

    stmt.run(sessionId, JSON.stringify(memoryData), new Date().toISOString());
  }

  /**
   * Get latest memory snapshot for session
   * @param {number} sessionId - Session ID
   * @returns {Object|null} - Memory data
   */
  getLatestMemory(sessionId) {
    const stmt = this.db.prepare(`
      SELECT memory_data FROM story_memory 
      WHERE session_id = ? 
      ORDER BY updated_at DESC 
      LIMIT 1
    `);
    
    const row = stmt.get(sessionId);
    return row ? JSON.parse(row.memory_data) : null;
  }

  /**
   * Get all sessions
   * @param {number} limit - Max number of sessions
   * @returns {Array} - Sessions
   */
  getAllSessions(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM story_sessions 
      ORDER BY start_time DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit).map(session => {
      if (session.metadata) {
        session.metadata = JSON.parse(session.metadata);
      }
      return session;
    });
  }

  /**
   * Delete old sessions
   * @param {number} daysOld - Age threshold in days
   * @returns {number} - Number of deleted sessions
   */
  deleteOldSessions(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoff = cutoffDate.toISOString();

    // Get sessions to delete
    const getStmt = this.db.prepare(`
      SELECT id FROM story_sessions 
      WHERE start_time < ? AND status != 'active'
    `);
    const sessionsToDelete = getStmt.all(cutoff);

    if (sessionsToDelete.length === 0) {
      return 0;
    }

    // Delete related data
    const sessionIds = sessionsToDelete.map(s => s.id);
    const placeholders = sessionIds.map(() => '?').join(',');

    this.db.prepare(`DELETE FROM story_chapters WHERE session_id IN (${placeholders})`).run(...sessionIds);
    this.db.prepare(`DELETE FROM story_votes WHERE session_id IN (${placeholders})`).run(...sessionIds);
    this.db.prepare(`DELETE FROM story_viewer_stats WHERE session_id IN (${placeholders})`).run(...sessionIds);
    this.db.prepare(`DELETE FROM story_memory WHERE session_id IN (${placeholders})`).run(...sessionIds);
    this.db.prepare(`DELETE FROM story_participant_round_resolutions WHERE session_id IN (${placeholders})`).run(...sessionIds);
    this.db.prepare(`DELETE FROM story_participants WHERE session_id IN (${placeholders})`).run(...sessionIds);
    this.db.prepare(`DELETE FROM story_sessions WHERE id IN (${placeholders})`).run(...sessionIds);

    return sessionsToDelete.length;
  }
}

module.exports = StoryDatabase;
