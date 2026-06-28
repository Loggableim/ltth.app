/**
 * Sidekick Plugin - Metrics
 * 
 * Rolling window metrics and stream analytics.
 * Provides real-time and historical statistics.
 */

/**
 * Metrics aggregator for stream analytics
 */
class Metrics {
  constructor(api) {
    this.api = api;
    
    // Rolling window data (per minute)
    this.windowDurationMs = 60000;
    this.maxWindows = 60; // Keep 60 minutes of data
    this.windows = [];
    
    // Current window
    this.currentWindow = this._createWindow();
    
    // Session totals
    this.session = {
      startTime: Date.now(),
      totalChats: 0,
      totalGifts: 0,
      totalLikes: 0,
      totalJoins: 0,
      totalFollows: 0,
      totalShares: 0,
      totalSubscribes: 0,
      totalDiamonds: 0,
      responsesSent: 0,
      sidekickDecisionAttempts: 0,
      sidekickDecisionSelected: 0,
      sidekickDecisionRejected: 0,
      sidekickDecisionRejectedByReason: {},
      sidekickDecisionResponses: 0,
      dedupeHits: 0,
      errors: 0
    };
    
    // Top users tracking
    this.topUsers = new Map();
    
    // Window rotation timer
    this.rotationInterval = setInterval(() => this._rotateWindow(), this.windowDurationMs);
  }
  
  /**
   * Create a new metrics window
   * @private
   */
  _createWindow() {
    return {
      startTime: Date.now(),
      chats: 0,
      gifts: 0,
      likes: 0,
      joins: 0,
      follows: 0,
      shares: 0,
      subscribes: 0,
      diamonds: 0,
      sidekickDecisionAttempts: 0,
      sidekickDecisionSelected: 0,
      sidekickDecisionRejected: 0,
      sidekickDecisionResponses: 0,
      sidekickDecisionRejectedByReason: {},
      sidekickDecisionByType: {},
      responses: 0
    };
  }
  
  /**
   * Rotate to a new window
   * @private
   */
  _rotateWindow() {
    // Save current window
    this.windows.push(this.currentWindow);
    
    // Trim old windows
    while (this.windows.length > this.maxWindows) {
      this.windows.shift();
    }
    
    // Create new window
    this.currentWindow = this._createWindow();
  }
  
  /**
   * Record a chat event
   * @param {string} uid - User ID
   * @param {string} nickname - User nickname
   */
  recordChat(uid, nickname) {
    this.currentWindow.chats++;
    this.session.totalChats++;
    this._updateTopUser(uid, nickname, 'chat', 1);
  }
  
  /**
   * Record a gift event
   * @param {string} uid - User ID
   * @param {string} nickname - User nickname
   * @param {number} diamonds - Diamond value
   * @param {number} count - Gift count
   */
  recordGift(uid, nickname, diamonds = 0, count = 1) {
    this.currentWindow.gifts += count;
    this.currentWindow.diamonds += diamonds * count;
    this.session.totalGifts += count;
    this.session.totalDiamonds += diamonds * count;
    this._updateTopUser(uid, nickname, 'gift', count);
    this._updateTopUser(uid, nickname, 'diamonds', diamonds * count);
  }
  
  /**
   * Record a like event
   * @param {string} uid - User ID
   * @param {string} nickname - User nickname
   * @param {number} count - Like count
   */
  recordLike(uid, nickname, count = 1) {
    this.currentWindow.likes += count;
    this.session.totalLikes += count;
    this._updateTopUser(uid, nickname, 'like', count);
  }
  
  /**
   * Record a join event
   * @param {string} uid - User ID
   * @param {string} nickname - User nickname
   */
  recordJoin(uid, nickname) {
    this.currentWindow.joins++;
    this.session.totalJoins++;
  }
  
  /**
   * Record a follow event
   * @param {string} uid - User ID
   * @param {string} nickname - User nickname
   */
  recordFollow(uid, nickname) {
    this.currentWindow.follows++;
    this.session.totalFollows++;
    this._updateTopUser(uid, nickname, 'follow', 1);
  }
  
  /**
   * Record a share event
   * @param {string} uid - User ID
   * @param {string} nickname - User nickname
   */
  recordShare(uid, nickname) {
    this.currentWindow.shares++;
    this.session.totalShares++;
    this._updateTopUser(uid, nickname, 'share', 1);
  }
  
  /**
   * Record a subscribe event
   * @param {string} uid - User ID
   * @param {string} nickname - User nickname
   */
  recordSubscribe(uid, nickname) {
    this.currentWindow.subscribes++;
    this.session.totalSubscribes++;
    this._updateTopUser(uid, nickname, 'subscribe', 1);
  }
  
  /**
   * Record a response sent
   */
  recordResponse() {
    this.currentWindow.responses++;
    this.currentWindow.sidekickDecisionResponses++;
    this.session.sidekickDecisionResponses++;
    this.session.responsesSent++;
  }

  recordSidekickDecisionAttempt(eventType = 'unknown') {
    this.currentWindow.sidekickDecisionAttempts += 1;
    this.session.sidekickDecisionAttempts += 1;
    this._recordDecisionByType(eventType, 'attempts', 1);
  }

  recordSidekickDecisionSelected(eventType = 'unknown') {
    this.currentWindow.sidekickDecisionSelected += 1;
    this.session.sidekickDecisionSelected += 1;
    this._recordDecisionByType(eventType, 'selected', 1);
  }

  recordSidekickDecisionRejected(eventType = 'unknown', reason = 'not-selected') {
    const safeReason = this._safeString(reason, 80, 'not-selected');
    this.currentWindow.sidekickDecisionRejected += 1;
    this.session.sidekickDecisionRejected += 1;
    this._recordDecisionByType(eventType, 'rejected', 1);
    this.currentWindow.sidekickDecisionRejectedByReason[safeReason] = (this.currentWindow.sidekickDecisionRejectedByReason[safeReason] || 0) + 1;
    this.session.sidekickDecisionRejectedByReason[safeReason] = (this.session.sidekickDecisionRejectedByReason[safeReason] || 0) + 1;
  }

  _recordDecisionByType(eventType = 'unknown', kind = 'attempts', amount = 0) {
    const safeEventType = this._safeString(eventType, 40, 'unknown');
    const safeKind = String(kind || 'attempts');
    if (!this.currentWindow.sidekickDecisionByType) this.currentWindow.sidekickDecisionByType = {};
    if (!this.session.sidekickDecisionByType) this.session.sidekickDecisionByType = {};
    this.currentWindow.sidekickDecisionByType[safeEventType] = this.currentWindow.sidekickDecisionByType[safeEventType] || {
      attempts: 0,
      selected: 0,
      rejected: 0
    };
    this.session.sidekickDecisionByType[safeEventType] = this.session.sidekickDecisionByType[safeEventType] || {
      attempts: 0,
      selected: 0,
      rejected: 0
    };
    if (this.currentWindow.sidekickDecisionByType[safeEventType][safeKind] !== undefined) {
      this.currentWindow.sidekickDecisionByType[safeEventType][safeKind] += amount;
    }
    if (this.session.sidekickDecisionByType[safeEventType][safeKind] !== undefined) {
      this.session.sidekickDecisionByType[safeEventType][safeKind] += amount;
    }
  }

  _safeString(value, maximum = 40, fallback = 'unknown') {
    const safe = String(value || fallback).trim();
    if (!safe) return fallback;
    return safe.substring(0, maximum) || fallback;
  }
  
  /**
   * Record a dedupe hit
   */
  recordDedupeHit() {
    this.session.dedupeHits++;
  }
  
  /**
   * Record an error
   */
  recordError() {
    this.session.errors++;
  }
  
  /**
   * Update top user scores
   * @private
   */
  _updateTopUser(uid, nickname, type, value) {
    if (!this.topUsers.has(uid)) {
      this.topUsers.set(uid, {
        uid,
        nickname,
        chat: 0,
        gift: 0,
        diamonds: 0,
        like: 0,
        follow: 0,
        share: 0,
        subscribe: 0,
        score: 0
      });
    }
    
    const user = this.topUsers.get(uid);
    user.nickname = nickname || user.nickname;
    user[type] = (user[type] || 0) + value;
    
    // Calculate engagement score
    user.score = user.chat + 
                 user.gift * 10 + 
                 user.diamonds * 0.5 +
                 user.like * 0.1 + 
                 user.follow * 5 + 
                 user.share * 3 + 
                 user.subscribe * 20;
  }
  
  /**
   * Get current rates (per minute)
   * @returns {Object} Current rates
   */
  getCurrentRates() {
    return {
      chatsPerMinute: this.currentWindow.chats,
      giftsPerMinute: this.currentWindow.gifts,
      likesPerMinute: this.currentWindow.likes,
      joinsPerMinute: this.currentWindow.joins,
      followsPerMinute: this.currentWindow.follows,
      sharesPerMinute: this.currentWindow.shares,
      subscribesPerMinute: this.currentWindow.subscribes,
      responsesPerMinute: this.currentWindow.responses,
      sidekickDecisionAttemptsPerMinute: this.currentWindow.sidekickDecisionAttempts,
      sidekickDecisionSelectedPerMinute: this.currentWindow.sidekickDecisionSelected,
      sidekickDecisionRejectedPerMinute: this.currentWindow.sidekickDecisionRejected,
      sidekickDecisionResponsePerMinute: this.currentWindow.sidekickDecisionResponses
    };
  }
  
  /**
   * Get session statistics
   * @returns {Object} Session stats
   */
  getSessionStats() {
    const duration = Date.now() - this.session.startTime;
    const minutes = duration / 60000;
    
    return {
      duration,
      durationMinutes: Math.floor(minutes),
      ...this.session,
      averageChatsPerMinute: minutes > 0 ? (this.session.totalChats / minutes).toFixed(1) : 0,
      averageGiftsPerMinute: minutes > 0 ? (this.session.totalGifts / minutes).toFixed(2) : 0,
      sidekickDecisionAcceptanceRate: this.session.sidekickDecisionAttempts > 0
        ? ((this.session.sidekickDecisionSelected / this.session.sidekickDecisionAttempts) * 100).toFixed(1)
        : '0.0'
    };
  }
  
  /**
   * Get top users by engagement score
   * @param {number} limit - Max users to return
   * @returns {Array} Top users
   */
  getTopUsers(limit = 10) {
    return Array.from(this.topUsers.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  
  /**
   * Get top gifters by diamond value
   * @param {number} limit - Max users to return
   * @returns {Array} Top gifters
   */
  getTopGifters(limit = 10) {
    return Array.from(this.topUsers.values())
      .filter(u => u.diamonds > 0)
      .sort((a, b) => b.diamonds - a.diamonds)
      .slice(0, limit);
  }
  
  /**
   * Get historical data for charts
   * @param {number} windowCount - Number of windows to include
   * @returns {Array} Historical data points
   */
  getHistoricalData(windowCount = 30) {
    const data = this.windows.slice(-windowCount).map(w => ({
      timestamp: w.startTime,
      chats: w.chats,
      gifts: w.gifts,
      likes: w.likes,
      joins: w.joins,
      follows: w.follows,
      shares: w.shares,
      subscribes: w.subscribes,
      responses: w.responses,
      sidekickDecisionAttempts: w.sidekickDecisionAttempts,
      sidekickDecisionSelected: w.sidekickDecisionSelected,
      sidekickDecisionRejected: w.sidekickDecisionRejected,
      sidekickDecisionResponses: w.sidekickDecisionResponses,
      sidekickDecisionByType: w.sidekickDecisionByType,
      sidekickDecisionRejectedByReason: w.sidekickDecisionRejectedByReason
    }));
    
    // Add current window
    data.push({
      timestamp: this.currentWindow.startTime,
      chats: this.currentWindow.chats,
      gifts: this.currentWindow.gifts,
      likes: this.currentWindow.likes,
      joins: this.currentWindow.joins,
      follows: this.currentWindow.follows,
      shares: this.currentWindow.shares,
      subscribes: this.currentWindow.subscribes,
      responses: this.currentWindow.responses,
      sidekickDecisionAttempts: this.currentWindow.sidekickDecisionAttempts,
      sidekickDecisionSelected: this.currentWindow.sidekickDecisionSelected,
      sidekickDecisionRejected: this.currentWindow.sidekickDecisionRejected,
      sidekickDecisionResponses: this.currentWindow.sidekickDecisionResponses,
      sidekickDecisionByType: this.currentWindow.sidekickDecisionByType,
      sidekickDecisionRejectedByReason: this.currentWindow.sidekickDecisionRejectedByReason
    });
    
    return data;
  }
  
  /**
   * Get summary of all metrics
   * @returns {Object} Complete metrics summary
   */
  getSummary() {
    return {
      currentRates: this.getCurrentRates(),
      session: this.getSessionStats(),
      sidekickDecision: {
        attempts: this.session.sidekickDecisionAttempts,
        selected: this.session.sidekickDecisionSelected,
        rejected: this.session.sidekickDecisionRejected,
        responses: this.session.sidekickDecisionResponses,
        acceptanceRate: this.session.sidekickDecisionAttempts > 0
          ? ((this.session.sidekickDecisionSelected / this.session.sidekickDecisionAttempts) * 100).toFixed(1)
          : '0.0',
        selectedByEventType: this.session.sidekickDecisionByType || {},
        rejectedReasons: this.session.sidekickDecisionRejectedByReason || {}
      },
      topUsers: this.getTopUsers(5),
      topGifters: this.getTopGifters(5)
    };
  }
  
  /**
   * Reset session metrics
   */
  resetSession() {
    this.windows = [];
    this.currentWindow = this._createWindow();
    this.session = {
      startTime: Date.now(),
      totalChats: 0,
      totalGifts: 0,
      totalLikes: 0,
      totalJoins: 0,
      totalFollows: 0,
      totalShares: 0,
      totalSubscribes: 0,
      totalDiamonds: 0,
      sidekickDecisionAttempts: 0,
      sidekickDecisionSelected: 0,
      sidekickDecisionRejected: 0,
      sidekickDecisionRejectedByReason: {},
      sidekickDecisionResponses: 0,
      sidekickDecisionByType: {},
      responsesSent: 0,
      dedupeHits: 0,
      errors: 0
    };
    this.topUsers.clear();
    
    this.api.log('Metrics session reset', 'info');
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
  }
}

module.exports = Metrics;
