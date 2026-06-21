/**
 * Gift Debouncer
 * Aggregates rapid gift events to prevent spam
 * Performance Optimization #5
 */

class GiftDebouncer {
  constructor(debounceWindow = 200, logger = console) {
    this.debounceWindow = debounceWindow; // milliseconds
    this.logger = logger;
    
    // Pending gifts by userId
    this.pending = new Map();
    
    // Debounce timers by userId
    this.timers = new Map();
    
    // Statistics
    this.stats = {
      totalGifts: 0,
      aggregatedGifts: 0,
      processedBatches: 0,
      averageAggregation: 0
    };
    
    this.logger.info(`⏱️ GiftDebouncer initialized (window: ${debounceWindow}ms)`);
  }

  /**
   * Add a gift to the debouncer
   */
  addGift(userId, giftData, callback) {
    this.stats.totalGifts++;
    
    // Initialize pending array if needed
    if (!this.pending.has(userId)) {
      this.pending.set(userId, []);
    }
    
    // Add gift to pending
    this.pending.get(userId).push({
      ...giftData,
      timestamp: Date.now()
    });
    
    // Clear existing timer if any
    if (this.timers.has(userId)) {
      clearTimeout(this.timers.get(userId));
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      this.flush(userId, callback);
    }, this.debounceWindow);
    
    this.timers.set(userId, timer);
  }

  /**
   * Flush pending gifts for a user
   */
  flush(userId, callback) {
    const gifts = this.pending.get(userId);
    
    if (!gifts || gifts.length === 0) {
      return;
    }
    
    // Clear timer
    if (this.timers.has(userId)) {
      clearTimeout(this.timers.get(userId));
      this.timers.delete(userId);
    }
    
    // Aggregate gifts
    const aggregated = this.aggregateGifts(gifts);
    
    // Clear pending
    this.pending.delete(userId);
    
    // Update stats
    this.stats.aggregatedGifts += gifts.length;
    this.stats.processedBatches++;
    this.stats.averageAggregation = this.stats.aggregatedGifts / this.stats.processedBatches;
    
    // Log if significant aggregation
    if (gifts.length > 5) {
      this.logger.info(`⏱️ Aggregated ${gifts.length} gifts from ${userId} into 1 event`);
    }
    
    // Process aggregated gift
    if (callback) {
      callback(aggregated);
    }
  }

  /**
   * Aggregate multiple gifts into one
   */
  aggregateGifts(gifts) {
    const firstGift = gifts[0];
    
    // Calculate totals
    const totalCoins = gifts.reduce((sum, g) => sum + (g.coins || g.diamondCount || 0), 0);
    const totalGifts = gifts.length;
    
    // Group by gift type
    const giftBreakdown = {};
    gifts.forEach(gift => {
      const giftId = gift.giftId || gift.giftName;
      if (!giftBreakdown[giftId]) {
        giftBreakdown[giftId] = {
          giftId: gift.giftId,
          giftName: gift.giftName,
          count: 0,
          coins: 0
        };
      }
      giftBreakdown[giftId].count++;
      giftBreakdown[giftId].coins += (gift.coins || gift.diamondCount || 0);
    });
    
    // Create aggregated gift data
    return {
      ...firstGift,
      coins: totalCoins,
      diamondCount: totalCoins,
      aggregated: true,
      giftCount: totalGifts,
      breakdown: Object.values(giftBreakdown),
      firstTimestamp: gifts[0].timestamp,
      lastTimestamp: gifts[gifts.length - 1].timestamp,
      duration: gifts[gifts.length - 1].timestamp - gifts[0].timestamp
    };
  }

  /**
   * Flush all pending gifts immediately
   */
  flushAll(callback) {
    const userIds = Array.from(this.pending.keys());
    userIds.forEach(userId => this.flush(userId, callback));
  }

  /**
   * Check if user has pending gifts
   */
  hasPending(userId) {
    return this.pending.has(userId) && this.pending.get(userId).length > 0;
  }

  /**
   * Get pending gift count for user
   */
  getPendingCount(userId) {
    return this.pending.has(userId) ? this.pending.get(userId).length : 0;
  }

  /**
   * Get total pending gifts across all users
   */
  getTotalPending() {
    let total = 0;
    for (const gifts of this.pending.values()) {
      total += gifts.length;
    }
    return total;
  }

  /**
   * Get statistics
   */
  getStats() {
    const reductionRate = this.stats.totalGifts > 0
      ? ((1 - this.stats.processedBatches / this.stats.totalGifts) * 100).toFixed(1)
      : '0.0';
    
    return {
      ...this.stats,
      averageAggregation: this.stats.averageAggregation.toFixed(2),
      reductionRate: reductionRate + '%',
      currentPending: this.getTotalPending(),
      activeUsers: this.pending.size,
      debounceWindow: this.debounceWindow
    };
  }

  /**
   * Destroy the debouncer
   */
  destroy() {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    
    this.timers.clear();
    this.pending.clear();
    
    this.logger.info('⏱️ GiftDebouncer destroyed');
  }
}

module.exports = GiftDebouncer;
