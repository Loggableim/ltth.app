'use strict';

/**
 * Score processing engine for the TopTier plugin.
 * Handles like, gift, and chat events, updating leaderboards and emitting rank changes.
 */
class ScoreEngine {
  /**
   * @param {object} api - PluginAPI instance
   * @param {object} db - TopTierDB instance
   * @param {object} sessionManager - SessionManager instance
   */
  constructor(api, db, sessionManager) {
    this.api = api;
    this.db = db;
    this.sessionManager = sessionManager;
    this.previousLikesRanks = new Map();
    this.previousGiftsRanks = new Map();
    this.previousLikesLeader = null;
    this.previousGiftsLeader = null;
    this._lastEmitTs = { likes: 0, gifts: 0 };
    this._EMIT_DEBOUNCE_MS = 50; // max 20 updates/sec
  }

  /**
   * Get current plugin configuration or defaults.
   * @returns {object} Configuration object
   */
  _getConfig() {
    return this.api.getConfig('toptier_config') || this._getDefaultConfig();
  }

  /**
   * Get default configuration for the TopTier plugin.
   * @returns {object} Default configuration
   */
  _getDefaultConfig() {
    return {
      likesBoard: { enabled: true, displayCount: 5, scoreMultiplier: 1.0 },
      giftsBoard: { enabled: true, displayCount: 5, giftMultiplierRules: [] },
      decay: { enabled: true, intervalMs: 10000, type: 'linear', decayAmount: 5, decayPercent: 10, idleThresholdMs: 30000, stepThreshold: 50, scoreFloor: 0, decayOnlyWhenConnected: true },
      overlay: { variant: 'animated-race', theme: 'dark', position: 'top-right', size: 'M', displayCount: 5, rotationIntervalMs: 8000, showAvatars: true, showScoreBars: true, rankIcons: { 1: '\u{1F451}', 2: '\u{1F948}', 3: '\u{1F949}' }, customCSS: '', accentColor: '#f59e0b', bgOpacity: 0.85 },
      sound: { playOnNewLeader: false, playOnRankChange: false },
      allTime: { enabled: true },
      chat: { rankCommandEnabled: true, rankCommandKeyword: '!rank' }
    };
  }

  /**
   * Process a like event from TikTok.
   * @param {object} data - TikTok like event data
   */
  handleLikeEvent(data) {
    try {
      const config = this._getConfig();
      if (!config.likesBoard.enabled) return;
      const username = data.uniqueId || data.username || 'unknown';
      const nickname = data.nickname || username;
      const profilePictureUrl = data.profilePictureUrl || '';
      const likeCount = data.likeCount || 1;
      const delta = Math.floor(likeCount * (config.likesBoard.scoreMultiplier || 1.0));
      const sessionId = this.sessionManager.getCurrentSessionId();

      this.db.upsertScore('likes', sessionId, username, nickname, profilePictureUrl, delta);
      this.db.updateRanks('likes', sessionId);

      const limit = config.likesBoard.displayCount || 5;
      const board = this.db.getBoard('likes', sessionId, limit);

      this._detectAndEmitChanges('likes', board);
      this._emitUpdate('likes', board, sessionId);
    } catch (err) {
      this.api.log(`[TopTier] handleLikeEvent error: ${err.message}`, 'error');
    }
  }

  /**
   * Process a gift event from TikTok.
   * @param {object} data - TikTok gift event data
   */
  handleGiftEvent(data) {
    try {
      const config = this._getConfig();
      if (!config.giftsBoard.enabled) return;
      const username = data.uniqueId || data.username || 'unknown';
      const nickname = data.nickname || username;
      const profilePictureUrl = data.profilePictureUrl || '';
      const baseCoins = (data.coins || data.diamondCount || 0) * (data.repeatCount || data.count || 1);
      const sessionId = this.sessionManager.getCurrentSessionId();

      // Apply gift multiplier rules
      let multiplier = 1.0;
      const rules = config.giftsBoard.giftMultiplierRules || [];
      for (const rule of rules) {
        if ((rule.giftName && rule.giftName.toLowerCase() === (data.giftName || '').toLowerCase()) ||
            (rule.giftId && rule.giftId === data.giftId)) {
          multiplier = rule.multiplier || 1.0;
          break;
        }
      }
      const delta = Math.floor(baseCoins * multiplier);
      if (delta <= 0) return;

      this.db.upsertScore('gifts', sessionId, username, nickname, profilePictureUrl, delta);
      this.db.updateRanks('gifts', sessionId);

      const limit = config.giftsBoard.displayCount || 5;
      const board = this.db.getBoard('gifts', sessionId, limit);

      this._detectAndEmitChanges('gifts', board);
      this._emitUpdate('gifts', board, sessionId);
    } catch (err) {
      this.api.log(`[TopTier] handleGiftEvent error: ${err.message}`, 'error');
    }
  }

  /**
   * Process a chat event for rank command handling.
   * @param {object} data - TikTok chat event data
   */
  handleChatEvent(data) {
    try {
      const config = this._getConfig();
      if (!config.chat || !config.chat.rankCommandEnabled) return;
      const keyword = config.chat.rankCommandKeyword || '!rank';
      const message = (data.comment || data.message || '').trim();
      if (message !== keyword) return;

      const username = data.uniqueId || data.username || '';
      const sessionId = this.sessionManager.getCurrentSessionId();
      const likesBoard = this.db.getBoard('likes', sessionId, 9999);
      const giftsBoard = this.db.getBoard('gifts', sessionId, 9999);
      const likesEntry = likesBoard.find(e => e.username === username);
      const giftsEntry = giftsBoard.find(e => e.username === username);

      this.api.emit('toptier:rank-reply', {
        username,
        likesRank: likesEntry ? likesEntry.rank : null,
        giftsRank: giftsEntry ? giftsEntry.rank : null,
        likesScore: likesEntry ? likesEntry.score : 0,
        giftsScore: giftsEntry ? giftsEntry.score : 0
      });
    } catch (err) {
      this.api.log(`[TopTier] handleChatEvent error: ${err.message}`, 'error');
    }
  }

  /**
   * Detect rank changes and new leaders, emitting appropriate events.
   * @param {string} boardType - 'likes' or 'gifts'
   * @param {Array} board - Current leaderboard entries
   * @private
   */
  _detectAndEmitChanges(boardType, board) {
    const prevMap = boardType === 'likes' ? this.previousLikesRanks : this.previousGiftsRanks;
    const prevLeader = boardType === 'likes' ? this.previousLikesLeader : this.previousGiftsLeader;

    for (const entry of board) {
      const oldRank = prevMap.get(entry.username);
      if (oldRank !== undefined && oldRank !== entry.rank) {
        this.api.emit('toptier:rank-change', { board: boardType, username: entry.username, nickname: entry.nickname, oldRank, newRank: entry.rank, score: entry.score });
      }
    }

    const newLeader = board[0] ? board[0].username : null;
    if (newLeader && newLeader !== prevLeader) {
      this.api.emit('toptier:new-leader', { board: boardType, username: newLeader, nickname: board[0].nickname, score: board[0].score });
    }

    // Update state
    const newMap = boardType === 'likes' ? this.previousLikesRanks : this.previousGiftsRanks;
    newMap.clear();
    for (const entry of board) newMap.set(entry.username, entry.rank);
    if (boardType === 'likes') this.previousLikesLeader = newLeader;
    else this.previousGiftsLeader = newLeader;
  }

  /**
   * Emit a debounced board update event.
   * @param {string} boardType - 'likes' or 'gifts'
   * @param {Array} board - Current leaderboard entries
   * @param {string} sessionId - Current session UUID
   * @private
   */
  _emitUpdate(boardType, board, sessionId) {
    const now = Date.now();
    if (now - this._lastEmitTs[boardType] < this._EMIT_DEBOUNCE_MS) return;
    this._lastEmitTs[boardType] = now;
    this.api.emit('toptier:update', { board: boardType, entries: board, sessionId });
  }
}

module.exports = ScoreEngine;
