'use strict';
const { randomUUID } = require('crypto');

/**
 * Manages leaderboard sessions for the TopTier plugin.
 * Each session corresponds to a TikTok LIVE stream.
 * A new session is started when the live stream identity changes.
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
    this._streamKey = null;
  }

  /**
   * Start a new leaderboard session with a fresh UUID.
   * @param {string} [streamUsername] - The TikTok username of the stream
   * @param {string|null} [streamKey] - Stable live-stream identity when available
   * @returns {string} The new session ID
   */
  startNewSession(streamUsername, streamKey = null) {
    this._sessionId = randomUUID();
    this._streamUsername = streamUsername || null;
    this._streamKey = streamKey || null;
    this.api.setConfig('currentSessionId', this._sessionId);
    this.api.setConfig('currentStreamUsername', this._streamUsername);
    this.api.setConfig('currentStreamKey', this._streamKey);
    this.api.emit('toptier:session-start', {
      sessionId: this._sessionId,
      streamUsername: this._streamUsername,
      streamKey: this._streamKey
    });
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
      this._streamKey = this.api.getConfig('currentStreamKey') || null;
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
   * Get the stream key associated with the current session.
   * @returns {string|null}
   */
  getCurrentStreamKey() {
    if (!this._streamKey) {
      this._streamKey = this.api.getConfig('currentStreamKey') || null;
    }
    return this._streamKey;
  }

  /**
   * Update the stream key for the active session without rotating the session.
   * @param {string|null} streamKey
   */
  setCurrentStreamKey(streamKey) {
    this._streamKey = streamKey || null;
    this.api.setConfig('currentStreamKey', this._streamKey);
  }

  /**
   * Returns whether a current session is already known.
   * @returns {boolean}
   */
  hasCurrentSession() {
    return !!(this._sessionId || this.api.getConfig('currentSessionId'));
  }

  /**
   * Handle a TikTok connection event.
   * Starts a new session if the streamer or live stream identity changed.
   * @param {string} streamUsername - The username of the connected streamer
   * @param {string|null} [streamKey] - Stable live-stream identity when available
   * @returns {boolean} True if a new session was started, false if same stream
   */
  handleConnect(streamUsername, streamKey = null) {
    const currentStream = this._streamUsername || this.api.getConfig('currentStreamUsername');
    const currentSession = this._sessionId || this.api.getConfig('currentSessionId');
    const currentStreamKey = this._streamKey || this.api.getConfig('currentStreamKey');

    if (streamUsername && currentStream === streamUsername && currentSession) {
      if (streamKey && currentStreamKey && streamKey !== currentStreamKey) {
        this.api.log(`[TopTier] Stream identity changed for @${streamUsername} (${currentStreamKey} -> ${streamKey})`, 'info');
      } else {
        // Same stream reconnecting - keep session alive.
        if (streamKey && !currentStreamKey) this.setCurrentStreamKey(streamKey);
        this.api.log(`[TopTier] Same stream reconnect (@${streamUsername}), keeping session ${currentSession}`, 'info');
        return false;
      }
    }

    // Different stream or first connect - start new session.
    this.endSession();
    this.startNewSession(streamUsername, streamKey);
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
    this._streamKey = null;
    // Clear persisted config so the next connect starts fresh.
    this.api.setConfig('currentSessionId', null);
    this.api.setConfig('currentStreamUsername', null);
    this.api.setConfig('currentStreamKey', null);
  }
}

module.exports = SessionManager;
