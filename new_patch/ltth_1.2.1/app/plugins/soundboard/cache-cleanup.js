/**
 * Cache Cleanup Job
 * 
 * Runs at server startup to clean up old cached audio files
 * Removes files that haven't been played in 6 weeks (42 days)
 */

class CacheCleanupJob {
    constructor(audioCacheManager, logger) {
        this.cacheManager = audioCacheManager;
        this.logger = logger || console;
        this.hasRun = false;
    }

    /**
     * Run cleanup on startup
     */
    async runOnStartup() {
        if (this.hasRun) {
            this.logger.warn('[CleanupJob] Cleanup already ran on startup, skipping...');
            return null;
        }

        this.logger.info('[CleanupJob] Starting cleanup on server launch...');
        
        try {
            const stats = await this.cacheManager.cleanupOldFiles();
            
            this.logger.info('[CleanupJob] Cleanup completed successfully', stats);
            
            // Log cache stats after cleanup
            const cacheStats = this.cacheManager.getCacheStats();
            this.logger.info('[CleanupJob] Cache stats after cleanup:', cacheStats);
            
            this.hasRun = true;
            return stats;
        } catch (error) {
            this.logger.error(`[CleanupJob] Cleanup failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Run cleanup manually
     */
    async runNow() {
        this.logger.info('[CleanupJob] Running manual cleanup...');
        
        try {
            const stats = await this.cacheManager.cleanupOldFiles();
            this.logger.info('[CleanupJob] Manual cleanup completed', stats);
            return stats;
        } catch (error) {
            this.logger.error(`[CleanupJob] Manual cleanup failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get job status
     */
    getStatus() {
        return {
            runOnStartup: true,
            hasRun: this.hasRun,
            cleanupAge: '42 days (6 weeks)'
        };
    }
}

module.exports = CacheCleanupJob;
