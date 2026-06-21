/**
 * Memory Cleanup Scheduler
 * Manages cleanup of expired matches and old data
 * Performance Optimization #6
 */

class MemoryCleanupScheduler {
  constructor(database, logger = console) {
    this.db = database;
    this.logger = logger;
    
    // Configuration
    this.config = {
      cleanupInterval: 10 * 60 * 1000, // 10 minutes
      matchRetentionDays: 7,
      eventCacheRetentionHours: 24,
      archiveAfterDays: 30
    };
    
    // Statistics
    this.stats = {
      totalCleanups: 0,
      matchesArchived: 0,
      eventsDeleted: 0,
      cacheEntriesRemoved: 0,
      bytesFreed: 0,
      lastCleanup: null
    };

    this.cleanupRunning = false;
    
    // Cleanup interval
    this.cleanupInterval = setInterval(
      () => this.performCleanup(),
      this.config.cleanupInterval
    );
    
    // Initial cleanup after 30 seconds (tracked so it can be cancelled on destroy)
    this._initialCleanupTimeout = setTimeout(() => {
      this._initialCleanupTimeout = null;
      this.performCleanup();
    }, 30000);
    
    this.logger.info(`🧹 MemoryCleanupScheduler initialized (interval: ${this.config.cleanupInterval / 1000}s)`);
  }

  /**
   * Perform full cleanup cycle
   */
  async performCleanup() {
    if (this.cleanupRunning) {
      this.logger.warn('🧹 Cleanup skipped because a previous cleanup is still running');
      return;
    }

    this.cleanupRunning = true;
    const startTime = Date.now();
    this.logger.info('🧹 Starting cleanup cycle...');
    
    try {
      // 1. Archive old completed matches
      const archivedMatches = await this.archiveOldMatches();
      
      // 2. Clean event cache
      const cleanedEvents = await this.cleanEventCache();
      
      // 3. Clean in-memory caches
      const cleanedCache = await this.cleanMemoryCaches();
      
      // 4. Optimize database
      await this.optimizeDatabase();
      
      // Update statistics
      this.stats.totalCleanups++;
      this.stats.matchesArchived += archivedMatches;
      this.stats.eventsDeleted += cleanedEvents;
      this.stats.cacheEntriesRemoved += cleanedCache;
      this.stats.lastCleanup = new Date().toISOString();
      
      const duration = Date.now() - startTime;
      this.logger.info(
        `🧹 Cleanup completed in ${duration}ms: ` +
        `${archivedMatches} matches archived, ` +
        `${cleanedEvents} events cleaned, ` +
        `${cleanedCache} cache entries removed`
      );
      
    } catch (error) {
      this.logger.error(`🧹 Cleanup failed: ${error.message}`);
    } finally {
      this.cleanupRunning = false;
    }
  }

  /**
   * Archive old completed matches
   */
  async archiveOldMatches() {
    const cutoffTime = Date.now() - (this.config.matchRetentionDays * 24 * 60 * 60 * 1000);
    
    try {
      // Find old completed matches
      const oldMatches = this.db.prepare(`
        SELECT id, match_uuid, end_time, total_coins, total_gifts
        FROM coinbattle_matches
        WHERE status = 'completed'
          AND end_time < ?
          AND id NOT IN (SELECT DISTINCT match_id FROM coinbattle_archived_matches)
      `).all(cutoffTime);
      
      if (oldMatches.length === 0) {
        return 0;
      }
      
      // Create archive table if not exists
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS coinbattle_archived_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_id INTEGER NOT NULL,
          match_uuid TEXT NOT NULL,
          end_time INTEGER NOT NULL,
          total_coins INTEGER DEFAULT 0,
          total_gifts INTEGER DEFAULT 0,
          participant_count INTEGER DEFAULT 0,
          archived_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `).run();
      
      // Archive each match
      const archiveStmt = this.db.prepare(`
        INSERT INTO coinbattle_archived_matches 
        (match_id, match_uuid, end_time, total_coins, total_gifts, participant_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      for (const match of oldMatches) {
        // Get participant count
        const participantCount = this.db.prepare(`
          SELECT COUNT(*) as count FROM coinbattle_match_participants WHERE match_id = ?
        `).get(match.id).count;
        
        // Archive match
        archiveStmt.run(
          match.id,
          match.match_uuid,
          match.end_time,
          match.total_coins || 0,
          match.total_gifts || 0,
          participantCount
        );
      }
      
      return oldMatches.length;
      
    } catch (error) {
      this.logger.error(`Failed to archive matches: ${error.message}`);
      return 0;
    }
  }

  /**
   * Clean old event cache entries
   */
  async cleanEventCache() {
    const cutoffTime = Date.now() - (this.config.eventCacheRetentionHours * 60 * 60 * 1000);
    
    try {
      const result = this.db.prepare(`
        DELETE FROM coinbattle_event_cache
        WHERE expires_at < ?
      `).run(cutoffTime);
      
      return result.changes || 0;
      
    } catch (error) {
      this.logger.error(`Failed to clean event cache: ${error.message}`);
      return 0;
    }
  }

  /**
   * Clean in-memory caches
   */
  async cleanMemoryCaches() {
    let cleaned = 0;
    
    // This would integrate with leaderboard cache if available
    // For now, placeholder for future integration
    
    return cleaned;
  }

  /**
   * Optimize database (VACUUM, ANALYZE)
   */
  async optimizeDatabase() {
    try {
      const nextCleanupNumber = this.stats.totalCleanups + 1;

      // Skip startup and run only occasionally. Heavy ANALYZE/VACUUM here blocks
      // the Node event loop and can make the launcher think the server is dead.
      if (nextCleanupNumber > 1 && nextCleanupNumber % 10 === 0) {
        this.logger.info('🧹 Running database optimization...');

        this.db.pragma('optimize');
        this.logger.info('🧹 Database optimization completed');
      }
    } catch (error) {
      this.logger.error(`Database optimization failed: ${error.message}`);
    }
  }

  /**
   * Clean specific match data
   */
  async cleanMatch(matchId) {
    try {
      // Delete gift events for this match
      const eventsDeleted = this.db.prepare(`
        DELETE FROM coinbattle_gift_events WHERE match_id = ?
      `).run(matchId).changes || 0;
      
      // Delete match participants
      this.db.prepare(`
        DELETE FROM coinbattle_match_participants WHERE match_id = ?
      `).run(matchId);
      
      // Delete multiplier events
      this.db.prepare(`
        DELETE FROM coinbattle_multiplier_events WHERE match_id = ?
      `).run(matchId);
      
      this.logger.info(`🧹 Cleaned match ${matchId}: ${eventsDeleted} events deleted`);
      return eventsDeleted;
      
    } catch (error) {
      this.logger.error(`Failed to clean match ${matchId}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage() {
    try {
      // Count total records
      const matchCount = this.db.prepare('SELECT COUNT(*) as count FROM coinbattle_matches').get().count;
      const eventCount = this.db.prepare('SELECT COUNT(*) as count FROM coinbattle_gift_events').get().count;
      const cacheCount = this.db.prepare('SELECT COUNT(*) as count FROM coinbattle_event_cache').get().count;
      
      // Estimate sizes (rough approximation)
      const estimatedSize = {
        matches: matchCount * 500, // ~500 bytes per match
        events: eventCount * 300,  // ~300 bytes per event
        cache: cacheCount * 200,   // ~200 bytes per cache entry
        total: 0
      };
      
      estimatedSize.total = estimatedSize.matches + estimatedSize.events + estimatedSize.cache;
      
      return {
        ...estimatedSize,
        totalMB: (estimatedSize.total / 1024 / 1024).toFixed(2),
        matchCount,
        eventCount,
        cacheCount
      };
      
    } catch (error) {
      this.logger.error(`Failed to get memory usage: ${error.message}`);
      return null;
    }
  }

  /**
   * Get cleanup statistics
   */
  getStats() {
    return {
      ...this.stats,
      memoryUsage: this.getMemoryUsage(),
      nextCleanup: this.stats.lastCleanup 
        ? new Date(new Date(this.stats.lastCleanup).getTime() + this.config.cleanupInterval).toISOString()
        : 'Soon'
    };
  }

  /**
   * Force immediate cleanup
   */
  async forceCleanup() {
    this.logger.info('🧹 Forcing immediate cleanup...');
    await this.performCleanup();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('🧹 Cleanup configuration updated', this.config);
  }

  /**
   * Destroy the scheduler
   */
  destroy() {
    if (this._initialCleanupTimeout) {
      clearTimeout(this._initialCleanupTimeout);
      this._initialCleanupTimeout = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.logger.info('🧹 MemoryCleanupScheduler destroyed');
  }
}

module.exports = MemoryCleanupScheduler;
