/**
 * Session Manager
 * 
 * Handles viewer session tracking, watchtime calculation, and session lifecycle
 */

class SessionManager {
  constructor(db, api) {
    this.db = db;
    this.api = api;
    this.activeSessions = new Map(); // username -> { sessionId, joinedAt, viewerId }
    this.heartbeatInterval = null;
  }

  /**
   * Start session tracking
   */
  start() {
    this.api.log('Starting session tracking with heartbeat...', 'info');
    
    // Heartbeat every minute to update watchtime
    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, 60000); // 60 seconds
  }

  /**
   * Stop session tracking
   */
  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // End all active sessions
    const usernames = Array.from(this.activeSessions.keys());
    for (const username of usernames) {
      this.endSession(username);
    }

    this.api.log('Session tracking stopped', 'info');
  }

  /**
   * Start a new session for a viewer
   */
  startSession(username, userData = {}) {
    try {
      // Check if session already exists
      if (this.activeSessions.has(username)) {
        this.api.log(`Session already active for ${username}`, 'debug');
        return;
      }

      // Get or create viewer profile
      const viewer = this.db.getOrCreateViewer(username, userData);

      // Create new session in database
      const stmt = this.api.getDatabase().prepare(`
        INSERT INTO viewer_sessions (viewer_id, joined_at, stream_id)
        VALUES (?, CURRENT_TIMESTAMP, ?)
      `);

      const info = stmt.run(viewer.id, 'current_stream');
      const sessionId = info.lastInsertRowid;

      // Store in active sessions
      this.activeSessions.set(username, {
        sessionId,
        joinedAt: new Date(),
        viewerId: viewer.id,
        lastHeartbeatAt: null
      });

      // Update viewer stats
      this.db.updateViewer(username, {
        last_seen_at: new Date().toISOString(),
        total_visits: viewer.total_visits + 1
      });

      this.api.log(`Session started for ${username} (session ${sessionId})`, 'debug');

      // Emit socket event
      this.api.emit('viewer:online', {
        username,
        displayName: viewer.display_name,
        viewerId: viewer.id
      });

      return sessionId;
    } catch (error) {
      this.api.log(`Error starting session: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * End a session for a viewer
   */
  endSession(username) {
    try {
      const session = this.activeSessions.get(username);
      if (!session) {
        this.api.log(`No active session found for ${username}`, 'debug');
        return;
      }

      const now = new Date();
      const durationSeconds = Math.floor((now - session.joinedAt) / 1000);

      // Update session in database
      this.api.getDatabase().prepare(`
        UPDATE viewer_sessions
        SET left_at = CURRENT_TIMESTAMP,
            duration_seconds = ?
        WHERE id = ?
      `).run(durationSeconds, session.sessionId);

      // Only add the delta since last heartbeat (heartbeat already wrote earlier portions)
      const lastBeat = session.lastHeartbeatAt || session.joinedAt;
      const deltaSeconds = Math.floor((now - lastBeat) / 1000);
      if (deltaSeconds > 0) {
        this.api.getDatabase().prepare(`
          UPDATE viewer_profiles
          SET total_watchtime_seconds = total_watchtime_seconds + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(deltaSeconds, session.viewerId);
      }

      // Update activity heatmap
      this.db.updateHeatmap(session.viewerId, session.joinedAt);

      // Remove from active sessions
      this.activeSessions.delete(username);

      this.api.log(`Session ended for ${username} (duration: ${durationSeconds}s)`, 'debug');

      // Emit socket event
      this.api.emit('viewer:offline', { username });

    } catch (error) {
      this.api.log(`Error ending session: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Heartbeat to update active sessions
   */
  heartbeat() {
    try {
      const now = new Date();

      this.activeSessions.forEach((session, username) => {
        const elapsedSeconds = Math.floor((now - session.joinedAt) / 1000);

        // Update session duration
        this.api.getDatabase().prepare(`
          UPDATE viewer_sessions
          SET duration_seconds = ?
          WHERE id = ?
        `).run(elapsedSeconds, session.sessionId);

        // Calculate delta since last heartbeat and update viewer_profiles
        const lastBeat = session.lastHeartbeatAt || session.joinedAt;
        const deltaSeconds = Math.floor((now - lastBeat) / 1000);
        if (deltaSeconds > 0) {
          this.api.getDatabase().prepare(`
            UPDATE viewer_profiles
            SET total_watchtime_seconds = total_watchtime_seconds + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(deltaSeconds, session.viewerId);
        }

        // Update lastHeartbeatAt
        session.lastHeartbeatAt = now;

        this.api.log(`Heartbeat update for ${username}: ${elapsedSeconds}s`, 'debug');
      });

    } catch (error) {
      this.api.log(`Error in session heartbeat: ${error.message}`, 'error');
    }
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount() {
    return this.activeSessions.size;
  }

  /**
   * Get active sessions
   */
  getActiveSessions() {
    const sessions = [];
    this.activeSessions.forEach((session, username) => {
      sessions.push({
        username,
        joinedAt: session.joinedAt,
        duration: Math.floor((new Date() - session.joinedAt) / 1000)
      });
    });
    return sessions;
  }

  /**
   * Check if viewer has active session
   */
  hasActiveSession(username) {
    return this.activeSessions.has(username);
  }
}

module.exports = SessionManager;
