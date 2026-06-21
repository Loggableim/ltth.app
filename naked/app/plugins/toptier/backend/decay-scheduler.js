'use strict';

/**
 * Decay scheduler for the TopTier plugin.
 * Periodically reduces scores based on configurable decay strategies.
 */
class DecayScheduler {
  /**
   * @param {object} api - PluginAPI instance
   * @param {object} db - TopTierDB instance
   * @param {object} sessionManager - SessionManager instance
   */
  constructor(api, db, sessionManager) {
    this.api = api;
    this.db = db;
    this.sessionManager = sessionManager;
    this._interval = null;
    this._connected = false;
  }

  /**
   * Set the TikTok connection status.
   * @param {boolean} val - Whether currently connected
   */
  setConnected(val) { this._connected = val; }

  /**
   * Start the decay scheduler with the given configuration.
   * @param {object} config - Full plugin configuration
   */
  start(config) {
    this.stop();
    const decayCfg = (config && config.decay) || {};
    if (!decayCfg.enabled) return;
    const intervalMs = Math.max(1000, decayCfg.intervalMs || 10000);
    this._interval = setInterval(() => this._tick(config), intervalMs);
    this.api.log(`[TopTier] Decay scheduler started (${intervalMs}ms, type=${decayCfg.type})`, 'info');
  }

  /**
   * Stop the decay scheduler.
   */
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
      this.api.log('[TopTier] Decay scheduler stopped', 'info');
    }
  }

  /**
   * Execute one decay tick across all boards.
   * @param {object} config - Full plugin configuration
   * @private
   */
  _tick(config) {
    try {
      const decayCfg = (config && config.decay) || {};
      if (decayCfg.decayOnlyWhenConnected && !this._connected) return;
      const sessionId = this.sessionManager.getCurrentSessionId();
      const scoreFloor = decayCfg.scoreFloor || 0;
      const affectedUsers = { likes: [], gifts: [] };

      for (const boardType of ['likes', 'gifts']) {
        const board = this.db.getBoard(boardType, sessionId, 9999);
        if (!board.length) continue;

        for (const entry of board) {
          if (entry.score <= scoreFloor) continue;
          let decayAmount = 0;

          switch (decayCfg.type) {
            case 'linear':
              decayAmount = decayCfg.decayAmount || 5;
              break;
            case 'percentage':
              decayAmount = Math.max(1, Math.floor(entry.score * (decayCfg.decayPercent || 10) / 100));
              break;
            case 'idle':
              if (Date.now() - entry.last_event_at > (decayCfg.idleThresholdMs || 30000)) {
                decayAmount = decayCfg.decayAmount || 5;
              }
              break;
            case 'step': {
              const closestRival = board.find(e => e.username !== entry.username && Math.abs(e.score - entry.score) <= (decayCfg.stepThreshold || 50));
              if (closestRival) decayAmount = decayCfg.decayAmount || 5;
              break;
            }
            case 'none':
            default:
              break;
          }

          if (decayAmount <= 0) continue;
          const newScore = Math.max(scoreFloor, entry.score - decayAmount);
          if (newScore === entry.score) continue;

          this.db.updateScoreAfterDecay(boardType, sessionId, entry.username, newScore);
          this.db.logDecay(boardType, sessionId, entry.username, entry.score - newScore, entry.score, newScore);
          affectedUsers[boardType].push(entry.username);
        }

        if (affectedUsers[boardType].length) {
          this.db.updateRanks(boardType, sessionId);
          const updatedBoard = this.db.getBoard(boardType, sessionId, 9999);
          this.api.emit('toptier:decay', { board: boardType, affectedUsers: affectedUsers[boardType] });
          this.api.emit('toptier:update', { board: boardType, entries: updatedBoard.slice(0, 10), sessionId });
        }
      }
    } catch (err) {
      this.api.log(`[TopTier] Decay tick error: ${err.message}`, 'error');
    }
  }
}

module.exports = DecayScheduler;
