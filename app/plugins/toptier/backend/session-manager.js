'use strict';
const { randomUUID } = require('crypto');

/**
 * Manages leaderboard sessions for the TopTier plugin.
 * Each session corresponds to a TikTok LIVE stream.
 * A new session is only started when a different streamer connects,
 * not on every reconnect to the same stream.
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
    this._streamUsername = null;
  }

  /**
   * Start a new leaderboard session with a fresh UUID.
   * @param {string} [streamUsername] - The TikTok username of the stream
   * @returns {string} The new session ID
   */
  startNewSession(streamUsername) {
    this._sessionId = randomUUID();
    this._streamUsername = streamUsername || null;
    this.api.setConfig('currentSessionId', this._sessionId);
    this.api.setConfig('currentStreamUsername', this._streamUsername);
    this.api.emit('toptier:session-start', { sessionId: this._sessionId, streamUsername: this._streamUsername });
    this.api.log(`[TopTier] New session started: ${this._sessionId} (stream: ${this._streamUsername || 'unknown'})`, 'info');
    return this._sessionId;
  }

  /**
   * Get the current session ID, creating a new session if none exists.
   * @returns {string} The current session ID
   */
  getCurrentSessionId() {
    if (!this._sessionId) {
      this._sessionId = this.api.getConfig('currentSessionId');
      this._streamUsername = this.api.getConfig('currentStreamUsername') || null;
      if (!this._sessionId) this._sessionId = this.startNewSession();
    }
    return this._sessionId;
  }

  /**
   * Get the stream username associated with the current session.
   * @returns {string|null}
   */
  getCurrentStreamUsername() {
    if (!this._streamUsername) {
      this._streamUsername = this.api.getConfig('currentStreamUsername') || null;
    }
    return this._streamUsername;
  }

  /**
   * Handle a TikTok connection event.
   * Only starts a new session if the streamer is different from the current one.
   * @param {string} streamUsername - The username of the connected streamer
   * @returns {boolean} True if a new session was started, false if same stream
   */
  handleConnect(streamUsername) {
    const currentStream = this._streamUsername || this.api.getConfig('currentStreamUsername');
    const currentSession = this._sessionId || this.api.getConfig('currentSessionId');

    if (streamUsername && currentStream === streamUsername && currentSession) {
      // Same stream reconnecting — keep session alive
      this.api.log(`[TopTier] Same stream reconnect (@${streamUsername}), keeping session ${currentSession}`, 'info');
      return false;
    }

    // Different stream or first connect — start new session
    this.endSession();
    this.startNewSession(streamUsername);
    return true;
  }

  /**
   * End the current session.
   * Session-only mode: no all-time persistence.
   */
  endSession() {
    if (!this._sessionId) return;
    try {
      this.api.emit('toptier:session-end', { sessionId: this._sessionId });
      this.api.log(`[TopTier] Session ended: ${this._sessionId}`, 'info');
    } catch (err) {
      this.api.log(`[TopTier] Error ending session: ${err.message}`, 'error');
    }
    this._sessionId = null;
    this._streamUsername = null;
    // Clear persisted config so the next connect starts fresh
    this.api.setConfig('currentSessionId', null);
    this.api.setConfig('currentStreamUsername', null);
  }
}

module.exports = SessionManager;