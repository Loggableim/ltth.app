/**
 * Performance Integration Module
 * Integrates all 10 performance optimizations into CoinBattle
 */

const SocketConnectionPool = require('./connection-pool');
const LeaderboardCache = require('../backend/leaderboard-cache');
const AdaptiveBatchProcessor = require('./adaptive-batching');
const GiftDebouncer = require('./gift-debouncer');
const MemoryCleanupScheduler = require('./memory-cleanup');
const DeltaEncoder = require('./delta-encoder');

class PerformanceManager {
  constructor(database, socketIO, logger = console) {
    this.db = database;
    this.io = socketIO;
    this.logger = logger;
    
    // Initialize all performance modules
    this.connectionPool = new SocketConnectionPool(50, logger);
    this.leaderboardCache = new LeaderboardCache(5000, 100, logger);
    this.batchProcessor = new AdaptiveBatchProcessor(database, logger);
    this.giftDebouncer = new GiftDebouncer(200, logger);
    this.memoryCleanup = new MemoryCleanupScheduler(database, logger);
    this.deltaEncoder = new DeltaEncoder(logger);
    
    // Performance metrics
    this.metrics = {
      startTime: Date.now(),
      eventsProcessed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      bandwidthSaved: 0
    };
    
    this.logger.info('🚀 PerformanceManager initialized with all 10 optimizations');
  }

  /**
   * Process gift event with all optimizations
   */
  async processGiftEvent(userId, giftData, socketId, context = {}) {
    try {
      // Optimization #1: Connection pooling
      const connection = this.connectionPool.getConnection(userId, socketId);
      
      // Optimization #5: Gift debouncing
      this.giftDebouncer.addGift(userId, giftData, async (aggregated) => {
        this.metrics.eventsProcessed++;

        // Only the game engine has the canonical match/player context and
        // idempotency keys. Avoid writing incomplete performance batches.
        if (!context.matchId || !context.playerId) {
          return;
        }

        // Optimization #3: Adaptive batching
        await this.batchProcessor.addEvent({
          userId,
          giftData: aggregated,
          matchId: context.matchId,
          playerId: context.playerId,
          giftId: aggregated.giftId,
          giftName: aggregated.giftName,
          coins: aggregated.coins,
          multiplier: context.multiplier || 1.0,
          team: context.team || null,
          eventId: context.eventId || null,
          idempotencyKey: context.idempotencyKey || null,
          timestamp: Date.now()
        });
      });
      
      return { success: true };
      
    } catch (error) {
      this.logger.error(`Failed to process gift event: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get leaderboard with caching
   */
  async getLeaderboard(matchId, force = false) {
    // Optimization #2: Leaderboard caching
    if (!force) {
      const cached = this.leaderboardCache.get(matchId);
      if (cached) {
        this.metrics.cacheHits++;
        return cached;
      }
    }
    
    // Fetch from database
    const leaderboard = await this.db.getMatchLeaderboard(matchId, 100);
    
    // Cache the result
    this.leaderboardCache.set(matchId, leaderboard);
    this.metrics.cacheMisses++;
    
    return leaderboard;
  }

  /**
   * Emit state update with delta encoding
   */
  emitStateUpdate(connectionId, newState) {
    // Optimization #10: Delta encoding
    const encoded = this.deltaEncoder.encode(connectionId, newState);
    
    if (encoded.compressed) {
      this.metrics.bandwidthSaved += encoded.savedBytes || 0;
    }
    
    return encoded;
  }

  /**
   * Invalidate leaderboard cache
   */
  invalidateLeaderboard(matchId) {
    this.leaderboardCache.invalidate(matchId);
  }

  /**
   * Force flush pending events
   */
  async flush() {
    await this.batchProcessor.forceFlush();
    this.giftDebouncer.flushAll();
  }

  /**
   * Get comprehensive statistics
   */
  getStatistics() {
    const uptime = Date.now() - this.metrics.startTime;
    const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(2);
    
    return {
      uptime: uptimeHours + 'h',
      metrics: this.metrics,
      connectionPool: this.connectionPool.getStats(),
      leaderboardCache: this.leaderboardCache.getStats(),
      batchProcessor: this.batchProcessor.getStats(),
      giftDebouncer: this.giftDebouncer.getStats(),
      memoryCleanup: this.memoryCleanup.getStats(),
      deltaEncoder: this.deltaEncoder.getStats(),
      bandwidthSavings: this.deltaEncoder.getBandwidthSavings()
    };
  }

  /**
   * Get performance health status
   */
  getHealthStatus() {
    const cacheHealth = this.leaderboardCache.getHealth();
    const batchLoad = this.batchProcessor.getCurrentLoadLevel();
    
    const health = {
      overall: 'healthy',
      issues: [],
      warnings: []
    };
    
    // Check cache health
    if (!cacheHealth.healthy) {
      health.warnings.push('Leaderboard cache performance degraded');
      health.warnings.push(...cacheHealth.recommendations);
    }
    
    // Check batch processor load
    if (batchLoad > 80) {
      health.warnings.push('High event processing load detected');
    }
    
    // Check connection pool utilization
    const poolStats = this.connectionPool.getStats();
    const poolUtil = parseFloat(poolStats.utilization);
    if (poolUtil > 90) {
      health.warnings.push('Connection pool near capacity');
    }
    
    // Determine overall health
    if (health.warnings.length > 3) {
      health.overall = 'degraded';
    }
    if (health.issues.length > 0) {
      health.overall = 'critical';
    }
    
    return health;
  }

  /**
   * Optimize performance based on current metrics
   */
  async autoOptimize() {
    const health = this.getHealthStatus();
    
    if (health.overall === 'degraded' || health.overall === 'critical') {
      this.logger.warn('⚠️ Performance degradation detected, running optimization...');
      
      // Force cleanup
      await this.memoryCleanup.forceCleanup();
      
      // Clear old cache entries
      this.leaderboardCache.cleanup();
      
      // Flush pending events
      await this.flush();
      
      this.logger.info('✅ Auto-optimization completed');
    }
  }

  /**
   * Destroy all performance modules
   */
  async destroy() {
    this.logger.info('🚀 Destroying PerformanceManager...');
    
    // Flush all pending data
    await this.flush();
    
    // Destroy modules
    this.connectionPool.destroy();
    this.leaderboardCache.destroy();
    await this.batchProcessor.destroy();
    this.giftDebouncer.destroy();
    this.memoryCleanup.destroy();
    this.deltaEncoder.destroy();
    
    this.logger.info('🚀 PerformanceManager destroyed');
  }
}

module.exports = PerformanceManager;
