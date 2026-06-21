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
    this.session.responsesSent++;
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
      responsesPerMinute: this.currentWindow.responses
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
      averageGiftsPerMinute: minutes > 0 ? (this.session.totalGifts / minutes).toFixed(2) : 0
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
      responses: w.responses
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
      responses: this.currentWindow.responses
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
