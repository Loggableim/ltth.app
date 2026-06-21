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

      // Story memory table (full memory snapshots)
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
      (session_id, chapter_number, title, content, choices, memory_tags, image_path, audio_paths, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    this.db.prepare(`DELETE FROM story_sessions WHERE id IN (${placeholders})`).run(...sessionIds);

    return sessionsToDelete.length;
  }
}

module.exports = StoryDatabase;
