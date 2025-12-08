/**
 * Audio Cache Manager
 * 
 * Handles local caching of audio files with automatic cleanup
 * - Downloads and stores audio files
 * - Tracks last_played timestamp
 * - Automatically deletes files not played for 6 weeks (42 days)
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const crypto = require('crypto');

class AudioCacheManager {
    constructor(db, logger, cacheDir) {
        this.db = db;
        this.logger = logger || console;
        this.cacheDir = cacheDir || path.join(__dirname, '../../data/soundboard-cache/sounds');
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.maxCacheSize = 1024 * 1024 * 1024; // 1GB
        this.cleanupAge = 42 * 24 * 60 * 60 * 1000; // 42 days (6 weeks) in milliseconds
        
        // Create HTTPS agent for better compatibility with packaged Electron apps
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: true,
            keepAlive: true,
            timeout: 30000
        });
        
        this._ensureCacheDirectory();
        this._initDatabase();
    }

    /**
     * Ensure cache directory exists
     * @private
     */
    _ensureCacheDirectory() {
        try {
            if (!fsSync.existsSync(this.cacheDir)) {
                fsSync.mkdirSync(this.cacheDir, { recursive: true });
                this.logger.info(`[AudioCache] Created cache directory: ${this.cacheDir}`);
            }
        } catch (error) {
            this.logger.error(`[AudioCache] Failed to create cache directory: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize database table for cache metadata
     * @private
     */
    _initDatabase() {
        try {
            this.db.db.exec(`
                CREATE TABLE IF NOT EXISTS soundboard_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    url_hash TEXT UNIQUE NOT NULL,
                    original_url TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    last_played INTEGER NOT NULL,
                    play_count INTEGER DEFAULT 0,
                    sound_name TEXT,
                    sound_tags TEXT
                )
            `);

            // Create index for faster lookups
            this.db.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_url_hash ON soundboard_cache(url_hash);
                CREATE INDEX IF NOT EXISTS idx_last_played ON soundboard_cache(last_played);
            `);

            this.logger.info('[AudioCache] Database initialized');
        } catch (error) {
            this.logger.error(`[AudioCache] Database init error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get URL hash for cache key
     * @param {string} url - Original URL
     * @returns {string} MD5 hash
     */
    getUrlHash(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    }

    /**
     * Check if audio is cached
     * @param {string} url - Original URL
     * @returns {Object|null} Cache entry or null
     */
    getCacheEntry(url) {
        try {
            const urlHash = this.getUrlHash(url);
            const stmt = this.db.db.prepare('SELECT * FROM soundboard_cache WHERE url_hash = ?');
            const entry = stmt.get(urlHash);
            
            if (entry) {
                // Check if file actually exists
                if (fsSync.existsSync(entry.file_path)) {
                    return entry;
                } else {
                    // File missing, remove from database
                    this.logger.warn(`[AudioCache] File missing, removing entry: ${entry.file_path}`);
                    this.removeCacheEntry(url);
                    return null;
                }
            }
            
            return null;
        } catch (error) {
            this.logger.error(`[AudioCache] Error checking cache: ${error.message}`);
            return null;
        }
    }

    /**
     * Download and cache audio file
     * @param {string} url - Original URL
     * @param {string} soundName - Optional sound name
     * @param {Array} soundTags - Optional tags
     * @returns {Promise<Object>} Cache entry
     */
    async cacheAudio(url, soundName = null, soundTags = []) {
        try {
            const urlHash = this.getUrlHash(url);
            const fileName = `${urlHash}.mp3`;
            const filePath = path.join(this.cacheDir, fileName);

            this.logger.info(`[AudioCache] Downloading: ${url}`);

            // Download file with HTTPS agent for better Electron compatibility
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                maxContentLength: this.maxFileSize,
                httpsAgent: this.httpsAgent,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'audio/mpeg, audio/*;q=0.9, */*;q=0.8'
                }
            });

            // Validate content type
            const contentType = response.headers['content-type'] || '';
            if (!contentType.includes('audio')) {
                throw new Error(`Invalid content type: ${contentType}`);
            }

            const fileSize = response.data.length;

            // Check file size
            if (fileSize > this.maxFileSize) {
                throw new Error(`File too large: ${fileSize} bytes`);
            }

            // Check available disk space
            await this._ensureDiskSpace(fileSize);

            // Write file
            await fs.writeFile(filePath, response.data);

            this.logger.info(`[AudioCache] Saved: ${filePath} (${fileSize} bytes)`);

            // Save metadata to database
            const now = Date.now();
            const stmt = this.db.db.prepare(`
                INSERT OR REPLACE INTO soundboard_cache 
                (url_hash, original_url, file_path, file_size, created_at, last_played, play_count, sound_name, sound_tags)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                urlHash,
                url,
                filePath,
                fileSize,
                now,
                now,
                1,
                soundName,
                soundTags.length > 0 ? JSON.stringify(soundTags) : null
            );

            return {
                url_hash: urlHash,
                original_url: url,
                file_path: filePath,
                file_size: fileSize,
                created_at: now,
                last_played: now,
                play_count: 1,
                sound_name: soundName,
                sound_tags: soundTags
            };
        } catch (error) {
            this.logger.error(`[AudioCache] Cache error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update last_played timestamp
     * @param {string} url - Original URL
     */
    updateLastPlayed(url) {
        try {
            const urlHash = this.getUrlHash(url);
            const stmt = this.db.db.prepare(`
                UPDATE soundboard_cache 
                SET last_played = ?, play_count = play_count + 1
                WHERE url_hash = ?
            `);
            stmt.run(Date.now(), urlHash);
        } catch (error) {
            this.logger.error(`[AudioCache] Error updating last_played: ${error.message}`);
        }
    }

    /**
     * Remove cache entry and file
     * @param {string} url - Original URL
     */
    removeCacheEntry(url) {
        try {
            const entry = this.getCacheEntry(url);
            
            if (entry) {
                // Delete file
                if (fsSync.existsSync(entry.file_path)) {
                    fsSync.unlinkSync(entry.file_path);
                    this.logger.info(`[AudioCache] Deleted file: ${entry.file_path}`);
                }

                // Delete from database
                const stmt = this.db.db.prepare('DELETE FROM soundboard_cache WHERE url_hash = ?');
                stmt.run(entry.url_hash);
                
                this.logger.info(`[AudioCache] Removed cache entry: ${entry.url_hash}`);
            }
        } catch (error) {
            this.logger.error(`[AudioCache] Error removing cache entry: ${error.message}`);
        }
    }

    /**
     * Cleanup old cache files (older than 6 weeks)
     * @returns {Object} Cleanup statistics
     */
    async cleanupOldFiles() {
        try {
            this.logger.info('[AudioCache] Starting cleanup of old files...');

            const cutoffTime = Date.now() - this.cleanupAge;
            const stmt = this.db.db.prepare('SELECT * FROM soundboard_cache WHERE last_played < ?');
            const oldEntries = stmt.all(cutoffTime);

            let deletedCount = 0;
            let freedSpace = 0;

            for (const entry of oldEntries) {
                try {
                    // Delete file
                    if (fsSync.existsSync(entry.file_path)) {
                        fsSync.unlinkSync(entry.file_path);
                        freedSpace += entry.file_size;
                    }

                    // Delete from database
                    const deleteStmt = this.db.db.prepare('DELETE FROM soundboard_cache WHERE id = ?');
                    deleteStmt.run(entry.id);

                    deletedCount++;
                    
                    const ageInDays = Math.floor((Date.now() - entry.last_played) / (24 * 60 * 60 * 1000));
                    this.logger.info(`[AudioCache] Deleted old file: ${entry.sound_name || entry.url_hash} (${ageInDays} days old)`);
                } catch (error) {
                    this.logger.error(`[AudioCache] Error deleting file: ${error.message}`);
                }
            }

            const stats = {
                deletedCount,
                freedSpace,
                freedSpaceMB: Math.round(freedSpace / (1024 * 1024) * 100) / 100
            };

            this.logger.info(`[AudioCache] Cleanup complete: ${stats.deletedCount} files deleted, ${stats.freedSpaceMB} MB freed`);

            return stats;
        } catch (error) {
            this.logger.error(`[AudioCache] Cleanup error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        try {
            const stmt = this.db.db.prepare(`
                SELECT 
                    COUNT(*) as total_files,
                    SUM(file_size) as total_size,
                    SUM(play_count) as total_plays,
                    MIN(created_at) as oldest_file,
                    MAX(last_played) as newest_play
                FROM soundboard_cache
            `);
            const stats = stmt.get();

            return {
                totalFiles: stats.total_files || 0,
                totalSize: stats.total_size || 0,
                totalSizeMB: Math.round((stats.total_size || 0) / (1024 * 1024) * 100) / 100,
                totalPlays: stats.total_plays || 0,
                oldestFile: stats.oldest_file,
                newestPlay: stats.newest_play
            };
        } catch (error) {
            this.logger.error(`[AudioCache] Error getting stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Ensure enough disk space before downloading
     * @private
     */
    async _ensureDiskSpace(requiredBytes) {
        const stats = this.getCacheStats();
        
        if (stats.totalSize + requiredBytes > this.maxCacheSize) {
            this.logger.warn('[AudioCache] Cache size limit approaching, cleaning up old files...');
            await this.cleanupOldFiles();
        }
    }

    /**
     * Clear entire cache
     */
    async clearCache() {
        try {
            this.logger.warn('[AudioCache] Clearing entire cache...');

            const stmt = this.db.db.prepare('SELECT * FROM soundboard_cache');
            const entries = stmt.all();

            for (const entry of entries) {
                if (fsSync.existsSync(entry.file_path)) {
                    fsSync.unlinkSync(entry.file_path);
                }
            }

            this.db.db.exec('DELETE FROM soundboard_cache');

            this.logger.info(`[AudioCache] Cleared ${entries.length} cache entries`);
        } catch (error) {
            this.logger.error(`[AudioCache] Error clearing cache: ${error.message}`);
            throw error;
        }
    }
}

module.exports = AudioCacheManager;
