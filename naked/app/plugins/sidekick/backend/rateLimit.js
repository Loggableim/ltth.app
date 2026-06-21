/**
 * Sidekick Plugin - Rate Limiter
 * 
 * Token bucket rate limiting and per-user cooldown management.
 * Prevents spam and ensures fair response distribution.
 */

/**
 * Token bucket rate limiter
 */
class TokenBucket {
  constructor(capacity, ratePerSecond) {
    this.capacity = Math.max(1, capacity);
    this.tokens = capacity;
    this.rate = ratePerSecond;
    this.lastUpdate = Date.now();
  }
  
  /**
   * Try to take a token
   * @returns {boolean} True if token was available
   */
  tryTake() {
    this._refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
  
  /**
   * Take a token, waiting if necessary (non-blocking async wait)
   * Note: This uses async/await pattern - the wait is non-blocking to the event loop
   * @returns {Promise<void>}
   */
  async take() {
    this._refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    
    // Calculate wait time (async wait - does not block event loop)
    const needed = 1 - this.tokens;
    const waitMs = Math.min((needed / this.rate) * 1000, 5000); // Cap wait at 5s
    
    await new Promise(resolve => setTimeout(resolve, Math.max(10, waitMs)));
    return this.take();
  }
  
  /**
   * Check if a token is available without taking
   * @returns {boolean} True if token available
   */
  hasToken() {
    this._refill();
    return this.tokens >= 1;
  }
  
  /**
   * Get time until next token is available
   * @returns {number} Milliseconds until next token
   */
  getWaitTime() {
    this._refill();
    
    if (this.tokens >= 1) return 0;
    
    const needed = 1 - this.tokens;
    return (needed / this.rate) * 1000;
  }
  
  /**
   * Refill tokens based on elapsed time
   * @private
   */
  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;
    
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate);
  }
  
  /**
   * Get current state
   * @returns {Object} Bucket state
   */
  getState() {
    this._refill();
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      rate: this.rate
    };
  }
}

/**
 * Per-user cooldown manager
 */
class CooldownManager {
  constructor() {
    // Map of user ID -> Map of cooldown type -> expiry timestamp
    this.cooldowns = new Map();
  }
  
  /**
   * Check if a user is on cooldown for a specific type
   * @param {string} userId - User ID
   * @param {string} type - Cooldown type
   * @returns {boolean} True if on cooldown
   */
  isOnCooldown(userId, type) {
    if (!this.cooldowns.has(userId)) return false;
    
    const userCooldowns = this.cooldowns.get(userId);
    if (!userCooldowns.has(type)) return false;
    
    const expiry = userCooldowns.get(type);
    if (Date.now() >= expiry) {
      userCooldowns.delete(type);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get remaining cooldown time
   * @param {string} userId - User ID
   * @param {string} type - Cooldown type
   * @returns {number} Remaining milliseconds
   */
  getRemainingCooldown(userId, type) {
    if (!this.cooldowns.has(userId)) return 0;
    
    const userCooldowns = this.cooldowns.get(userId);
    if (!userCooldowns.has(type)) return 0;
    
    const expiry = userCooldowns.get(type);
    const remaining = expiry - Date.now();
    return Math.max(0, remaining);
  }
  
  /**
   * Set a cooldown for a user
   * @param {string} userId - User ID
   * @param {string} type - Cooldown type
   * @param {number} durationMs - Duration in milliseconds
   */
  setCooldown(userId, type, durationMs) {
    if (!this.cooldowns.has(userId)) {
      this.cooldowns.set(userId, new Map());
    }
    
    const userCooldowns = this.cooldowns.get(userId);
    userCooldowns.set(type, Date.now() + durationMs);
  }
  
  /**
   * Clear a specific cooldown
   * @param {string} userId - User ID
   * @param {string} type - Cooldown type
   */
  clearCooldown(userId, type) {
    if (!this.cooldowns.has(userId)) return;
    this.cooldowns.get(userId).delete(type);
  }
  
  /**
   * Clear all cooldowns for a user
   * @param {string} userId - User ID
   */
  clearUserCooldowns(userId) {
    this.cooldowns.delete(userId);
  }
  
  /**
   * Clear all cooldowns
   */
  clearAll() {
    this.cooldowns.clear();
  }
  
  /**
   * Cleanup expired cooldowns
   */
  cleanup() {
    const now = Date.now();
    
    for (const [userId, userCooldowns] of this.cooldowns.entries()) {
      for (const [type, expiry] of userCooldowns.entries()) {
        if (now >= expiry) {
          userCooldowns.delete(type);
        }
      }
      
      if (userCooldowns.size === 0) {
        this.cooldowns.delete(userId);
      }
    }
  }
  
  /**
   * Get statistics
   * @returns {Object} Cooldown statistics
   */
  getStats() {
    let activeCooldowns = 0;
    for (const userCooldowns of this.cooldowns.values()) {
      activeCooldowns += userCooldowns.size;
    }
    
    return {
      usersWithCooldowns: this.cooldowns.size,
      activeCooldowns
    };
  }
}

/**
 * Rate limit manager combining token bucket and cooldowns
 */
class RateLimitManager {
  constructor(api, config) {
    this.api = api;
    this.config = config;
    
    // Global rate limit bucket
    const maxRepliesPerMin = config.comment?.maxRepliesPerMin || 20;
    this.globalBucket = new TokenBucket(maxRepliesPerMin, maxRepliesPerMin / 60);
    
    // Per-user cooldowns
    this.cooldowns = new CooldownManager();
    
    // Global cooldown timestamp
    this.nextGlobalAllowed = 0;
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => this.cooldowns.cleanup(), 60000);
  }
  
  /**
   * Check if a response can be sent (global rate limit)
   * @returns {boolean} True if allowed
   */
  canSendGlobal() {
    if (Date.now() < this.nextGlobalAllowed) {
      return false;
    }
    return this.globalBucket.tryTake();
  }
  
  /**
   * Set global cooldown
   */
  setGlobalCooldown() {
    const cooldownMs = (this.config.comment?.globalCooldown || 6) * 1000;
    this.nextGlobalAllowed = Date.now() + cooldownMs;
  }
  
  /**
   * Check if a user is on per-user cooldown
   * @param {string} userId - User ID
   * @returns {boolean} True if on cooldown
   */
  isUserOnCooldown(userId) {
    return this.cooldowns.isOnCooldown(userId, 'response');
  }
  
  /**
   * Set per-user cooldown
   * @param {string} userId - User ID
   */
  setUserCooldown(userId) {
    const cooldownMs = (this.config.comment?.perUserCooldown || 15) * 1000;
    this.cooldowns.setCooldown(userId, 'response', cooldownMs);
  }
  
  /**
   * Check if a greeting can be sent to a user
   * @param {string} userId - User ID
   * @returns {boolean} True if allowed
   */
  canGreetUser(userId) {
    return !this.cooldowns.isOnCooldown(userId, 'greeting');
  }
  
  /**
   * Set greeting cooldown for a user
   * @param {string} userId - User ID
   */
  setGreetingCooldown(userId) {
    const cooldownMs = (this.config.comment?.greetingCooldown || 360) * 1000;
    this.cooldowns.setCooldown(userId, 'greeting', cooldownMs);
  }
  
  /**
   * Get rate limit status
   * @returns {Object} Rate limit status
   */
  getStatus() {
    return {
      globalBucket: this.globalBucket.getState(),
      globalCooldownRemaining: Math.max(0, this.nextGlobalAllowed - Date.now()),
      cooldowns: this.cooldowns.getStats()
    };
  }
  
  /**
   * Update configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    this.config = config;
    
    // Rebuild global bucket with new limits
    const maxRepliesPerMin = config.comment?.maxRepliesPerMin || 20;
    this.globalBucket = new TokenBucket(maxRepliesPerMin, maxRepliesPerMin / 60);
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

module.exports = { TokenBucket, CooldownManager, RateLimitManager };
