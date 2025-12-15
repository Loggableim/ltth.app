/**
 * Token Bucket Rate Limiter
 * O(1) performance, fairer than simple counter-based limiting
 */

class TokenBucketRateLimiter {
  constructor(capacity = 10, refillRate = 10, refillInterval = 60000) {
    this.capacity = capacity; // Max tokens
    this.refillRate = refillRate; // Tokens to add per interval
    this.refillInterval = refillInterval; // Interval in ms (default 1 minute)
    
    // Map<userId, BucketState>
    this.buckets = new Map();
    
    // Global bucket
    this.globalBucket = {
      tokens: capacity,
      lastRefill: Date.now()
    };
  }

  /**
   * Check if user can execute command (and consume token if allowed)
   * @param {string} userId - User ID
   * @param {number} cost - Token cost (default 1)
   * @returns {Object} { allowed: boolean, tokensRemaining: number, reason?: string }
   */
  tryConsume(userId, cost = 1) {
    const now = Date.now();
    
    // Refill global bucket
    this.refillBucket(this.globalBucket, now);
    
    // Check global limit
    if (this.globalBucket.tokens < cost) {
      return {
        allowed: false,
        tokensRemaining: 0,
        reason: 'global_limit',
        retryAfter: this.getRetryAfter(this.globalBucket, now)
      };
    }

    // Get or create user bucket
    if (!this.buckets.has(userId)) {
      this.buckets.set(userId, {
        tokens: this.capacity,
        lastRefill: now
      });
    }

    const userBucket = this.buckets.get(userId);
    
    // Refill user bucket
    this.refillBucket(userBucket, now);
    
    // Check user limit
    if (userBucket.tokens < cost) {
      return {
        allowed: false,
        tokensRemaining: userBucket.tokens,
        reason: 'user_limit',
        retryAfter: this.getRetryAfter(userBucket, now)
      };
    }

    // Consume tokens
    userBucket.tokens -= cost;
    this.globalBucket.tokens -= cost;

    return {
      allowed: true,
      tokensRemaining: userBucket.tokens
    };
  }

  /**
   * Refill bucket based on time elapsed
   * @param {Object} bucket - Bucket state
   * @param {number} now - Current timestamp
   */
  refillBucket(bucket, now) {
    const elapsed = now - bucket.lastRefill;
    const intervals = Math.floor(elapsed / this.refillInterval);
    
    if (intervals > 0) {
      const tokensToAdd = intervals * this.refillRate;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  /**
   * Calculate retry-after time in seconds
   * @param {Object} bucket - Bucket state
   * @param {number} now - Current timestamp
   * @returns {number} Seconds until next refill
   */
  getRetryAfter(bucket, now) {
    const nextRefill = bucket.lastRefill + this.refillInterval;
    return Math.ceil((nextRefill - now) / 1000);
  }

  /**
   * Get remaining tokens for user
   * @param {string} userId - User ID
   * @returns {number} Tokens remaining
   */
  getRemainingTokens(userId) {
    if (!this.buckets.has(userId)) {
      return this.capacity;
    }

    const bucket = this.buckets.get(userId);
    this.refillBucket(bucket, Date.now());
    return bucket.tokens;
  }

  /**
   * Clean up old bucket entries
   * @param {number} maxAge - Max age in ms (default 1 hour)
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();
    const threshold = now - maxAge;

    for (const [userId, bucket] of this.buckets.entries()) {
      if (bucket.lastRefill < threshold && bucket.tokens >= this.capacity) {
        this.buckets.delete(userId);
      }
    }
  }

  /**
   * Get statistics
   * @returns {Object} Rate limiter stats
   */
  getStats() {
    return {
      userBuckets: this.buckets.size,
      globalTokens: this.globalBucket.tokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
      refillInterval: this.refillInterval
    };
  }

  /**
   * Reset all buckets
   */
  reset() {
    this.buckets.clear();
    this.globalBucket = {
      tokens: this.capacity,
      lastRefill: Date.now()
    };
  }
}

module.exports = TokenBucketRateLimiter;
