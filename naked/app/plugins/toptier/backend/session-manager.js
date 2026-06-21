'use strict';
const { randomUUID } = require('crypto');

/**
 * Manages leaderboard sessions for the TopTier plugin.
 * Each session corresponds to a TikTok LIVE connection period.
 */
class SessionManager {
  /**
   * @param {object} api - PluginAPI instance
   * @param {object} db - TopTierDB instance
   */
  constructor(api, db) {
    this.api = api;
    this.db = db;
    this._sessionId = null;
  }

  /**
   * Start a new leaderboard session with a fresh UUID.
   * @returns {string} The new session ID
   */
  startNewSession() {
    this._sessionId = randomUUID();
    this.api.setConfig('currentSessionId', this._sessionId);
    this.api.emit('toptier:session-start', { sessionId: this._sessionId });
    this.api.log(`[TopTier] New session started: ${this._sessionId}`, 'info');
    return this._sessionId;
  }

  /**
   * Get the current session ID, creating a new session if none exists.
   * @returns {string} The current session ID
   */
  getCurrentSessionId() {
    if (!this._sessionId) {
      this._sessionId = this.api.getConfig('currentSessionId');
      if (!this._sessionId) this._sessionId = this.startNewSession();
    }
    return this._sessionId;
  }

  /**
   * End the current session, persisting all-time stats for each board.
   */
  endSession() {
    if (!this._sessionId) return;
    try {
      for (const boardType of ['likes', 'gifts']) {
        const board = this.db.getBoard(boardType, this._sessionId, 9999);
        for (const entry of board) {
          this.db.updateAllTime(boardType, entry.username, entry.nickname, entry.profile_picture_url, entry.score);
        }
      }
      this.api.emit('toptier:session-end', { sessionId: this._sessionId });
      this.api.log(`[TopTier] Session ended: ${this._sessionId}`, 'info');
    } catch (err) {
      this.api.log(`[TopTier] Error ending session: ${err.message}`, 'error');
    }
  }
}

module.exports = SessionManager;
