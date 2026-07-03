/**
 * Database Module for Leaderboard Plugin
 * Handles all database operations with debouncing to minimize disk I/O
 */

class LeaderboardDatabase {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger;
        this.saveTimeout = null;
        this.pendingWrites = new Map(); // userId -> data
        this.debounceDelay = 5000; // 5 seconds debounce
        
        // Prepare reusable statements for performance
        this.insertStmt = null;
    }

    /**
     * Initialize database tables
     */
    initializeTables() {
        try {
            // All-time leaderboard table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS leaderboard_alltime (
                    user_id TEXT PRIMARY KEY,
                    nickname TEXT NOT NULL,
                    unique_id TEXT,
                    profile_picture_url TEXT,
                    total_coins INTEGER DEFAULT 0,
                    last_gift_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Index for faster sorting by coins
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_leaderboard_alltime_coins 
                ON leaderboard_alltime(total_coins DESC)
            `);

            // Config table for plugin settings
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS leaderboard_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    session_start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                    top_count INTEGER DEFAULT 10,
                    min_coins_to_show INTEGER DEFAULT 0,
                    theme TEXT DEFAULT 'neon',
                    show_animations INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Initialize default config if not exists
            this.db.prepare(`
                INSERT OR IGNORE INTO leaderboard_config (id, top_count, min_coins_to_show, theme, show_animations)
                VALUES (1, 10, 0, 'neon', 1)
            `).run();

            this.logger.info('[Leaderboard DB] Tables initialized successfully');
        } catch (error) {
            this.logger.error(`[Leaderboard DB] Failed to initialize tables: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get config from database
     */
    getConfig() {
        try {
            const stmt = this.db.prepare('SELECT * FROM leaderboard_config WHERE id = 1');
            return stmt.get();
        } catch (error) {
            this.logger.error(`[Leaderboard DB] Failed to get config: ${error.message}`);
            return { top_count: 10, min_coins_to_show: 0 };
        }
    }

    /**
     * Update config in database
     */
    updateConfig(config) {
        try {
            const stmt = this.db.prepare(`
                UPDATE leaderboard_config 
                SET top_count = ?, min_coins_to_show = ?, theme = ?, show_animations = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
            `);
            stmt.run(
                config.top_count || 10, 
                config.min_coins_to_show || 0,
                config.theme || 'neon',
                config.show_animations !== undefined ? (config.show_animations ? 1 : 0) : 1
            );
            this.logger.info('[Leaderboard DB] Config updated');
        } catch (error) {
            this.logger.error(`[Leaderboard DB] Failed to update config: ${error.message}`);
            throw error;
        }
    }

    /**
     * Add or update user coins with debouncing
     * This queues the write and batches multiple updates
     */
    addCoins(userId, nickname, uniqueId, profilePictureUrl, coins) {
        // Validate inputs - protect against undefined values
        if (!userId || typeof coins !== 'number' || coins <= 0) {
            this.logger.warn(`[Leaderboard DB] Invalid gift data: userId=${userId}, coins=${coins}`);
            return;
        }

        // Queue the update
        const existing = this.pendingWrites.get(userId) || {
            userId,
            nickname: nickname || 'Unknown',
            uniqueId: uniqueId || '',
            profilePictureUrl: profilePictureUrl || '',
            coins: 0
        };

        // Accumulate coins
        existing.coins += coins;
        
        // Update user info if provided (handle name/picture changes)
        if (nickname) existing.nickname = nickname;
        if (uniqueId) existing.uniqueId = uniqueId;
        if (profilePictureUrl) existing.profilePictureUrl = profilePictureUrl;

        this.pendingWrites.set(userId, existing);

        // Schedule debounced write
        this.scheduleDebouncedWrite();
    }

    /**
     * Schedule a debounced write to database
     */
    scheduleDebouncedWrite() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(() => {
            this.flushPendingWrites();
        }, this.debounceDelay);
    }

    /**
     * Flush all pending writes to database
     */
    flushPendingWrites() {
        if (this.pendingWrites.size === 0) {
            return;
        }

        try {
            // Initialize prepared statement if not already done
            if (!this.insertStmt) {
                this.insertStmt = this.db.prepare(`
                    INSERT INTO leaderboard_alltime 
                        (user_id, nickname, unique_id, profile_picture_url, total_coins, last_gift_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT(user_id) DO UPDATE SET
                        nickname = excluded.nickname,
                        unique_id = excluded.unique_id,
                        profile_picture_url = excluded.profile_picture_url,
                        total_coins = total_coins + excluded.total_coins,
                        last_gift_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                `);
            }

            const transaction = this.db.transaction((writes) => {
                for (const write of writes) {
                    this.insertStmt.run(
                        write.userId,
                        write.nickname,
                        write.uniqueId,
                        write.profilePictureUrl,
                        write.coins
                    );
                }
            });

            transaction([...this.pendingWrites.values()]);
            
            this.logger.info(`[Leaderboard DB] Flushed ${this.pendingWrites.size} pending writes`);
            this.pendingWrites.clear();
        } catch (error) {
            this.logger.error(`[Leaderboard DB] Failed to flush writes: ${error.message}`);
        }
    }

    /**
     * Get top gifters from all-time leaderboard
     */
    getTopGifters(limit = 10, minCoins = 0) {
        try {
            const stmt = this.db.prepare(`
                SELECT 
                    user_id,
                    nickname,
                    unique_id,
                    profile_picture_url,
                    total_coins,
                    last_gift_at,
                    created_at
                FROM leaderboard_alltime
                WHERE total_coins >= ?
                ORDER BY total_coins DESC
                LIMIT ?
            `);
            return stmt.all(minCoins, limit);
        } catch (error) {
            this.logger.error(`[Leaderboard DB] Failed to get top gifters: ${error.message}`);
            return [];
        }
    }

    /**
     * Get user rank and stats
     */
    getUserStats(userId) {
        try {
            const stmt = this.db.prepare(`
                SELECT 
                    COUNT(*) as rank
                FROM leaderboard_alltime
                WHERE total_coins > (
                    SELECT total_coins FROM leaderboard_alltime WHERE user_id = ?
                )
            `);
            const rankData = stmt.get(userId);

            const userStmt = this.db.prepare(`
                SELECT * FROM leaderboard_alltime WHERE user_id = ?
            `);
            const userData = userStmt.get(userId);

            if (!userData) {
                return null;
            }

            return {
                ...userData,
                rank: (rankData?.rank || 0) + 1
            };
        } catch (error) {
            this.logger.error(`[Leaderboard DB] Failed to get user stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Reset session (update session start time)
     */
    resetSession() {
        try {
            const stmt = this.db.prepare(`
                UPDATE leaderboard_config 
                SET session_start_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
            `);
            stmt.run();
            this.logger.info('[Leaderboard DB] Session reset');
        } catch (error) {
            this.logger.error(`[Leaderboard DB] Failed to reset session: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get session start time
     */
    getSessionStartTime() {
        try {
            const config = this.getConfig();
            return config?.session_start_time;
        } catch (error) {
            this.logger.error(`[Leaderboard DB] Failed to get session start time: ${error.message}`);
            return null;
        }
    }

    /**
     * Clean up - flush any pending writes
     */
    destroy() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.flushPendingWrites();
        this.logger.info('[Leaderboard DB] Cleanup complete');
    }
}

module.exports = LeaderboardDatabase;
