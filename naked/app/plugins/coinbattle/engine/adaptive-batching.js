/**
 * Adaptive Batch Processor
 * Dynamically adjusts batch size based on system load
 * Performance Optimization #3
 */

class AdaptiveBatchProcessor {
  constructor(database, logger = console) {
    this.db = database;
    this.logger = logger;
    
    // Configuration
    this.config = {
      minBatchSize: 10,
      maxBatchSize: 200,
      defaultBatchSize: 50,
      minFlushInterval: 50,   // 50ms
      maxFlushInterval: 500,  // 500ms
      defaultFlushInterval: 100
    };
    
    // Current batch
    this.eventBatch = [];
    this.batchTimer = null;
    
    // Current settings
    this.currentBatchSize = this.config.defaultBatchSize;
    this.currentFlushInterval = this.config.defaultFlushInterval;
    
    // Load tracking
    this.loadMetrics = {
      eventsPerSecond: 0,
      averageProcessingTime: 0,
      queueLength: 0,
      lastAdjustment: Date.now()
    };
    
    // Performance tracking
    this.performanceWindow = [];
    this.windowSize = 10; // Track last 10 flushes
    
    // Statistics
    this.stats = {
      totalEvents: 0,
      totalBatches: 0,
      totalProcessingTime: 0,
      adjustments: 0,
      errors: 0
    };
    
    // Load monitoring interval
    this.monitorInterval = setInterval(() => this.monitorLoad(), 1000);
    
    this.logger.info('⚡ AdaptiveBatchProcessor initialized');
  }

  /**
   * Add event to batch
   */
  addEvent(event) {
    this.eventBatch.push(event);
    this.stats.totalEvents++;
    
    // Check if batch is full
    if (this.eventBatch.length >= this.currentBatchSize) {
      this.flush();
    } else if (!this.batchTimer) {
      // Start timer if not already running
      this.batchTimer = setTimeout(() => this.flush(), this.currentFlushInterval);
    }
  }

  /**
   * Flush current batch to database
   */
  async flush() {
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Nothing to flush
    if (this.eventBatch.length === 0) {
      return;
    }
    
    const batchSize = this.eventBatch.length;
    const events = this.eventBatch;
    this.eventBatch = [];
    
    const startTime = Date.now();
    
    try {
      // Process batch
      await this.processBatch(events);
      
      const processingTime = Date.now() - startTime;
      this.stats.totalBatches++;
      this.stats.totalProcessingTime += processingTime;
      
      // Track performance
      this.trackPerformance(batchSize, processingTime);
      
      // Adjust batch parameters if needed
      this.adjustBatchParameters();
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Batch processing failed: ${error.message}`);
      
      // Reduce batch size on error
      this.currentBatchSize = Math.max(
        this.config.minBatchSize,
        Math.floor(this.currentBatchSize * 0.8)
      );
    }
  }

  /**
   * Process a batch of events
   */
  async processBatch(events) {
    // Use batch insert if available on the db wrapper (e.g. CoinBattleDatabase)
    if (this.db.batchInsertGiftEvents) {
      await this.db.batchInsertGiftEvents(events);
      return;
    }

    // Fallback: use a prepared statement directly on the raw better-sqlite3 db
    // (this.db is the raw better-sqlite3 instance passed from CoinBattlePlugin.init())
    const insertOne = this.db.prepare(`
      INSERT OR IGNORE INTO coinbattle_gift_events
          (match_id, player_id, user_id, gift_id, gift_name, coins, multiplier, team, event_id, idempotency_key, timestamp)
      VALUES
          (@match_id, @player_id, @user_id, @gift_id, @gift_name, @coins, @multiplier, @team, @event_id, @idempotency_key, @timestamp)
    `);

    const insertMany = this.db.transaction((evts) => {
      for (const evt of evts) {
        insertOne.run({
          match_id: evt.matchId || evt.match_id || null,
          player_id: evt.playerId || evt.player_id || null,
          user_id: evt.userId || evt.user_id || '',
          gift_id: evt.giftId || evt.gift_id || 0,
          gift_name: evt.giftName || evt.gift_name || '',
          coins: evt.coins || 0,
          multiplier: evt.multiplier || 1.0,
          team: evt.team || null,
          event_id: evt.eventId || evt.event_id || null,
          idempotency_key: evt.idempotencyKey || evt.idempotency_key || null,
          timestamp: evt.timestamp || Math.floor(Date.now() / 1000)
        });
      }
    });

    insertMany(events);
  }

  /**
   * Track performance metrics
   */
  trackPerformance(batchSize, processingTime) {
    this.performanceWindow.push({
      batchSize,
      processingTime,
      timestamp: Date.now()
    });
    
    // Keep window at max size
    if (this.performanceWindow.length > this.windowSize) {
      this.performanceWindow.shift();
    }
    
    // Update load metrics
    this.loadMetrics.averageProcessingTime = 
      this.performanceWindow.reduce((sum, p) => sum + p.processingTime, 0) / 
      this.performanceWindow.length;
    
    this.loadMetrics.queueLength = this.eventBatch.length;
  }

  /**
   * Monitor current load
   */
  monitorLoad() {
    const now = Date.now();
    const timeSinceLastAdjustment = now - this.loadMetrics.lastAdjustment;
    
    // Calculate events per second
    const recentEvents = this.performanceWindow
      .filter(p => now - p.timestamp < 1000)
      .reduce((sum, p) => sum + p.batchSize, 0);
    
    this.loadMetrics.eventsPerSecond = recentEvents;
  }

  /**
   * Adjust batch parameters based on load
   */
  adjustBatchParameters() {
    const now = Date.now();
    const timeSinceLastAdjustment = now - this.loadMetrics.lastAdjustment;
    
    // Only adjust every 5 seconds
    if (timeSinceLastAdjustment < 5000) {
      return;
    }
    
    const avgProcessingTime = this.loadMetrics.averageProcessingTime;
    const eventsPerSecond = this.loadMetrics.eventsPerSecond;
    const queueLength = this.loadMetrics.queueLength;
    
    let newBatchSize = this.currentBatchSize;
    let newFlushInterval = this.currentFlushInterval;
    
    // High load scenario
    if (eventsPerSecond > 100 || avgProcessingTime > 200) {
      // Increase batch size to process more at once
      newBatchSize = Math.min(
        this.config.maxBatchSize,
        Math.floor(this.currentBatchSize * 1.5)
      );
      
      // Reduce flush interval to clear queue faster
      newFlushInterval = Math.max(
        this.config.minFlushInterval,
        Math.floor(this.currentFlushInterval * 0.8)
      );
      
      this.logger.info(`⚡ HIGH LOAD: Increasing batch size to ${newBatchSize}, reducing interval to ${newFlushInterval}ms`);
    }
    // Medium load scenario
    else if (eventsPerSecond > 50 || avgProcessingTime > 100) {
      // Moderate increase
      newBatchSize = Math.min(
        this.config.maxBatchSize,
        Math.floor(this.currentBatchSize * 1.2)
      );
      
      newFlushInterval = Math.max(
        this.config.minFlushInterval,
        Math.floor(this.currentFlushInterval * 0.9)
      );
      
      this.logger.info(`⚡ MEDIUM LOAD: Adjusting batch size to ${newBatchSize}, interval to ${newFlushInterval}ms`);
    }
    // Low load scenario
    else if (eventsPerSecond < 20 && avgProcessingTime < 50) {
      // Reduce batch size for lower latency
      newBatchSize = Math.max(
        this.config.minBatchSize,
        Math.floor(this.currentBatchSize * 0.8)
      );
      
      // Increase flush interval to reduce overhead
      newFlushInterval = Math.min(
        this.config.maxFlushInterval,
        Math.floor(this.currentFlushInterval * 1.2)
      );
      
      this.logger.info(`⚡ LOW LOAD: Reducing batch size to ${newBatchSize}, increasing interval to ${newFlushInterval}ms`);
    }
    
    // Apply changes if different
    if (newBatchSize !== this.currentBatchSize || newFlushInterval !== this.currentFlushInterval) {
      this.currentBatchSize = newBatchSize;
      this.currentFlushInterval = newFlushInterval;
      this.loadMetrics.lastAdjustment = now;
      this.stats.adjustments++;
    }
  }

  /**
   * Get current load level (0-100)
   */
  getCurrentLoadLevel() {
    const eventsLoad = Math.min(100, (this.loadMetrics.eventsPerSecond / 200) * 100);
    const processingLoad = Math.min(100, (this.loadMetrics.averageProcessingTime / 500) * 100);
    const queueLoad = Math.min(100, (this.loadMetrics.queueLength / this.currentBatchSize) * 100);
    
    return Math.max(eventsLoad, processingLoad, queueLoad);
  }

  /**
   * Get statistics
   */
  getStats() {
    const avgBatchSize = this.stats.totalBatches > 0
      ? this.stats.totalEvents / this.stats.totalBatches
      : 0;
    
    const avgProcessingTime = this.stats.totalBatches > 0
      ? this.stats.totalProcessingTime / this.stats.totalBatches
      : 0;
    
    return {
      ...this.stats,
      currentBatchSize: this.currentBatchSize,
      currentFlushInterval: this.currentFlushInterval,
      averageBatchSize: avgBatchSize.toFixed(1),
      averageProcessingTime: avgProcessingTime.toFixed(1) + 'ms',
      currentLoad: this.getCurrentLoadLevel().toFixed(1) + '%',
      eventsPerSecond: this.loadMetrics.eventsPerSecond,
      queueLength: this.loadMetrics.queueLength
    };
  }

  /**
   * Force flush
   */
  forceFlush() {
    return this.flush();
  }

  /**
   * Destroy the processor
   */
  async destroy() {
    clearInterval(this.monitorInterval);
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    // Flush remaining events
    if (this.eventBatch.length > 0) {
      await this.flush();
    }
    
    this.logger.info('⚡ AdaptiveBatchProcessor destroyed');
  }
}

module.exports = AdaptiveBatchProcessor;
