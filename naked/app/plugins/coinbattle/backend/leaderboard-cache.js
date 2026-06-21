/**
 * Leaderboard Cache System
 * In-memory cache with TTL for leaderboard queries
 * Performance Optimization #2
 */

class LeaderboardCache {
  constructor(ttl = 5000, maxSize = 100, logger = console) {
    this.ttl = ttl; // Time to live in milliseconds
    this.maxSize = maxSize; // Maximum cache entries
    this.logger = logger;
    
    // Cache storage: matchId -> { data, timestamp, hits }
    this.cache = new Map();
    
    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      size: 0
    };
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 10000);
    
    this.logger.info(`💾 LeaderboardCache initialized (TTL: ${ttl}ms, MaxSize: ${maxSize})`);
  }

  /**
   * Get cached leaderboard data
   */
  get(matchId) {
    const cached = this.cache.get(matchId);
    
    if (!cached) {
      this.stats.misses++;
      return null;
    }
    
    const now = Date.now();
    const age = now - cached.timestamp;
    
    if (age >= this.ttl) {
      // Expired
      this.cache.delete(matchId);
      this.stats.misses++;
      return null;
    }
    
    // Valid cache hit
    cached.hits++;
    cached.lastAccess = now;
    this.stats.hits++;
    
    return cached.data;
  }

  /**
   * Set leaderboard data in cache
   */
  set(matchId, data) {
    // Check if we need to evict entries
    if (this.cache.size >= this.maxSize && !this.cache.has(matchId)) {
      this.evictLRU();
    }
    
    this.cache.set(matchId, {
      data: JSON.parse(JSON.stringify(data)), // Deep clone
      timestamp: Date.now(),
      lastAccess: Date.now(),
      hits: 0
    });
    
    this.stats.sets++;
    this.stats.size = this.cache.size;
  }

  /**
   * Invalidate cache for a specific match
   */
  invalidate(matchId) {
    const existed = this.cache.delete(matchId);
    if (existed) {
      this.stats.size = this.cache.size;
      return true;
    }
    return false;
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.size = 0;
    this.logger.info(`💾 Invalidated ${size} cache entries`);
  }

  /**
   * Evict least recently used entry
   */
  evictLRU() {
    let lruKey = null;
    let lruTime = Date.now();
    
    for (const [matchId, entry] of this.cache) {
      if (entry.lastAccess < lruTime) {
        lruTime = entry.lastAccess;
        lruKey = matchId;
      }
    }
    
    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
    }
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [matchId, entry] of this.cache) {
      if (now - entry.timestamp >= this.ttl) {
        expiredKeys.push(matchId);
      }
    }
    
    expiredKeys.forEach(key => this.cache.delete(key));
    
    if (expiredKeys.length > 0) {
      this.stats.size = this.cache.size;
      this.logger.info(`💾 Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : '0.0';
    
    return {
      ...this.stats,
      hitRate: hitRate + '%',
      ttl: this.ttl,
      maxSize: this.maxSize
    };
  }

  /**
   * Get cache health info
   */
  getHealth() {
    const stats = this.getStats();
    const hitRate = parseFloat(stats.hitRate);
    
    return {
      healthy: hitRate >= 50 && this.stats.size < this.maxSize * 0.9,
      hitRate,
      utilization: ((this.stats.size / this.maxSize) * 100).toFixed(1) + '%',
      recommendations: this.getRecommendations(hitRate)
    };
  }

  /**
   * Get cache optimization recommendations
   */
  getRecommendations(hitRate) {
    const recommendations = [];
    
    if (hitRate < 30) {
      recommendations.push('Cache hit rate is low. Consider increasing TTL.');
    }
    
    if (this.stats.evictions > this.stats.sets * 0.2) {
      recommendations.push('High eviction rate. Consider increasing maxSize.');
    }
    
    if (this.stats.size >= this.maxSize * 0.9) {
      recommendations.push('Cache is nearly full. Consider increasing maxSize or reducing TTL.');
    }
    
    return recommendations;
  }

  /**
   * Destroy the cache
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
    this.stats.size = 0;
    this.logger.info('💾 LeaderboardCache destroyed');
  }
}

module.exports = LeaderboardCache;
