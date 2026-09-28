/**
 * Sidekick Plugin - Event Deduper
 * 
 * TTL-based event deduplication to prevent duplicate processing.
 * Uses an OrderedMap-like structure with automatic expiration.
 */

/**
 * Event deduplication with TTL
 */
class EventDeduper {
  constructor(ttlSeconds = 600) {
    this.ttl = ttlSeconds * 1000; // Convert to milliseconds
    this.store = new Map();
    this.maxSize = 5000;
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => this._cleanup(), 30000);
    
    // Statistics
    this.stats = {
      totalChecks: 0,
      duplicatesBlocked: 0,
      cleanupRuns: 0
    };
  }
  
  /**
   * Check if a signature has been seen recently
   * @param {string} signature - Event signature
   * @returns {boolean} True if duplicate (already seen)
   */
  seen(signature) {
    this.stats.totalChecks++;
    const now = Date.now();
    
    // Check if exists and not expired
    if (this.store.has(signature)) {
      const expiry = this.store.get(signature);
      if (expiry > now) {
        this.stats.duplicatesBlocked++;
        return true;
      }
      // Expired, will be updated
    }
    
    // Add/update with new expiry
    this.store.set(signature, now + this.ttl);
    
    // Limit size by removing oldest entries
    if (this.store.size > this.maxSize) {
      // Remove first 10% of entries
      const toRemove = Math.floor(this.maxSize * 0.1);
      let removed = 0;
      for (const key of this.store.keys()) {
        if (removed >= toRemove) break;
        this.store.delete(key);
        removed++;
      }
    }
    
    return false;
  }
  
  /**
   * Async version for compatibility
   * @param {string} signature - Event signature
   * @returns {Promise<boolean>} True if duplicate
   */
  async seenAsync(signature) {
    return this.seen(signature);
  }
  
  /**
   * Manually add a signature
   * @param {string} signature - Event signature
   * @param {number} customTtlMs - Optional custom TTL in milliseconds
   */
  add(signature, customTtlMs = null) {
    const ttl = customTtlMs || this.ttl;
    this.store.set(signature, Date.now() + ttl);
  }
  
  /**
   * Clear a specific signature
   * @param {string} signature - Event signature
   */
  clear(signature) {
    this.store.delete(signature);
  }
  
  /**
   * Clear all signatures
   */
  clearAll() {
    this.store.clear();
  }
  
  /**
   * Update TTL setting
   * @param {number} ttlSeconds - New TTL in seconds
   */
  setTTL(ttlSeconds) {
    this.ttl = ttlSeconds * 1000;
  }
  
  /**
   * Clean up expired entries
   * @private
   */
  _cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [signature, expiry] of this.store.entries()) {
      if (expiry < now) {
        this.store.delete(signature);
        removed++;
      }
    }
    
    this.stats.cleanupRuns++;
    return removed;
  }
  
  /**
   * Get statistics
   * @returns {Object} Deduper statistics
   */
  getStats() {
    const hitRate = this.stats.totalChecks > 0 
      ? (this.stats.duplicatesBlocked / this.stats.totalChecks * 100).toFixed(2)
      : 0;
    
    return {
      size: this.store.size,
      totalChecks: this.stats.totalChecks,
      duplicatesBlocked: this.stats.duplicatesBlocked,
      hitRate: parseFloat(hitRate),
      cleanupRuns: this.stats.cleanupRuns,
      ttlSeconds: this.ttl / 1000
    };
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

module.exports = EventDeduper;
