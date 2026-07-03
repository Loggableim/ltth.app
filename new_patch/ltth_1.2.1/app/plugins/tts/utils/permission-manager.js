/**
 * Permission Manager
 * Manages TTS permissions with team-level gates and manual whitelisting
 */
class PermissionManager {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger;

        // Initialize database tables
        this._initTables();

        // Cache for quick lookups
        this.permissionCache = new Map();
        this.cacheTimeout = 60000; // 1 minute cache
    }

    /**
     * Initialize permission tables
     */
    _initTables() {
        // TTS user permissions and settings
        this.db.db.exec(`
            CREATE TABLE IF NOT EXISTS tts_user_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                username TEXT NOT NULL,
                allow_tts INTEGER DEFAULT 0,
                assigned_voice_id TEXT,
                assigned_engine TEXT,
                lang_preference TEXT,
                volume_gain REAL DEFAULT 1.0,
                voice_emotion TEXT,
                is_blacklisted INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);

        // Index for fast lookups
        this.db.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_tts_user_permissions_user_id ON tts_user_permissions(user_id)
        `);
        this.db.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_tts_user_permissions_username ON tts_user_permissions(username)
        `);

        // Migration: Add voice_emotion column if it doesn't exist
        try {
            const tableInfo = this.db.db.prepare('PRAGMA table_info(tts_user_permissions)').all();
            const hasEmotionColumn = tableInfo.some(col => col.name === 'voice_emotion');
            
            if (!hasEmotionColumn) {
                this.logger.info('TTS Permission Manager: Adding voice_emotion column to tts_user_permissions');
                this.db.db.exec('ALTER TABLE tts_user_permissions ADD COLUMN voice_emotion TEXT');
                this.logger.info('TTS Permission Manager: voice_emotion column added successfully');
            }
        } catch (error) {
            this.logger.warn('TTS Permission Manager: Could not add voice_emotion column (may already exist):', error.message);
        }

        this.logger.info('TTS Permission Manager: Database tables initialized');
    }

    /**
     * Check if user has TTS permission
     * @param {string} userId - User ID
     * @param {string} username - Username
     * @param {number} teamLevel - User's team level
     * @param {number} minTeamLevel - Minimum required team level
     * @returns {object} { allowed: boolean, reason: string }
     */
    checkPermission(userId, username, teamLevel = 0, minTeamLevel = 0) {
        try {
            // Check cache first
            const cacheKey = `${userId}_${teamLevel}_${minTeamLevel}`;
            const cached = this.permissionCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.result;
            }

            // Get user permission record
            let userPerm = this._getUserPermission(userId);

            // Auto-create user record on first encounter (for tracking and management)
            if (!userPerm) {
                this._createUserRecord(userId, username);
                userPerm = this._getUserPermission(userId);
                this.logger.info(`TTS: New user record created for ${username} (${userId})`);
            }

            // Check blacklist first
            if (userPerm && userPerm.is_blacklisted) {
                const result = { allowed: false, reason: 'blacklisted' };
                this._cacheResult(cacheKey, result);
                this.logger.info(`TTS Permission DENIED for ${username}: Blacklisted`);
                return result;
            }

            // Check manual whitelist (assigned voice = auto-allow)
            if (userPerm && userPerm.assigned_voice_id) {
                const result = { allowed: true, reason: 'voice_assigned' };
                this._cacheResult(cacheKey, result);
                return result;
            }

            // Check explicit allow flag
            if (userPerm && userPerm.allow_tts) {
                const result = { allowed: true, reason: 'whitelisted' };
                this._cacheResult(cacheKey, result);
                return result;
            }

            // Check team level gate
            if (teamLevel >= minTeamLevel) {
                const result = { allowed: true, reason: 'team_level' };
                this._cacheResult(cacheKey, result);
                return result;
            }

            // No permission
            const result = {
                allowed: false,
                reason: 'team_level_insufficient',
                required: minTeamLevel,
                actual: teamLevel
            };
            this._cacheResult(cacheKey, result);
            this.logger.info(`TTS Permission DENIED for ${username}: Team level ${teamLevel} < required ${minTeamLevel}`);
            return result;

        } catch (error) {
            this.logger.error(`Permission check error for ${username}: ${error.message}`);
            return { allowed: false, reason: 'error', error: error.message };
        }
    }

    /**
     * Get user permission record
     */
    _getUserPermission(userId) {
        const stmt = this.db.db.prepare(`
            SELECT * FROM tts_user_permissions WHERE user_id = ? LIMIT 1
        `);
        return stmt.get(userId);
    }

    /**
     * Create a new user record (auto-tracking)
     */
    _createUserRecord(userId, username) {
        try {
            const now = Math.floor(Date.now() / 1000);
            const stmt = this.db.db.prepare(`
                INSERT INTO tts_user_permissions (user_id, username, allow_tts, created_at, updated_at)
                VALUES (?, ?, 0, ?, ?)
                ON CONFLICT(user_id) DO NOTHING
            `);
            stmt.run(userId, username, now, now);
        } catch (error) {
            this.logger.error(`Failed to create user record for ${username}: ${error.message}`);
        }
    }

    /**
     * Cache permission result
     */
    _cacheResult(key, result) {
        this.permissionCache.set(key, {
            result,
            timestamp: Date.now()
        });

        // Limit cache size (LRU)
        if (this.permissionCache.size > 1000) {
            const firstKey = this.permissionCache.keys().next().value;
            this.permissionCache.delete(firstKey);
        }
    }

    /**
     * Clear permission cache
     */
    clearCache() {
        this.permissionCache.clear();
        this.logger.info('Permission cache cleared');
    }

    /**
     * Allow TTS for a user (whitelist)
     */
    allowUser(userId, username) {
        try {
            const now = Math.floor(Date.now() / 1000);

            const stmt = this.db.db.prepare(`
                INSERT INTO tts_user_permissions (user_id, username, allow_tts, created_at, updated_at)
                VALUES (?, ?, 1, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    allow_tts = 1,
                    is_blacklisted = 0,
                    updated_at = excluded.updated_at
            `);

            stmt.run(userId, username, now, now);
            this.clearCache();

            this.logger.info(`TTS permission GRANTED to user: ${username} (${userId})`);
            return true;

        } catch (error) {
            this.logger.error(`Failed to allow user ${username}: ${error.message}`);
            return false;
        }
    }

    /**
     * Deny TTS for a user (revoke whitelist)
     */
    denyUser(userId, username) {
        try {
            const now = Math.floor(Date.now() / 1000);

            const stmt = this.db.db.prepare(`
                INSERT INTO tts_user_permissions (user_id, username, allow_tts, assigned_voice_id, assigned_engine, is_blacklisted, created_at, updated_at)
                VALUES (?, ?, 0, NULL, NULL, 0, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    allow_tts = 0,
                    assigned_voice_id = NULL,
                    assigned_engine = NULL,
                    updated_at = excluded.updated_at
            `);

            stmt.run(userId, username, now, now);
            this.clearCache();

            this.logger.info(`TTS permission REVOKED for user: ${username} (${userId})`);
            return true;

        } catch (error) {
            this.logger.error(`Failed to deny user ${username}: ${error.message}`);
            return false;
        }
    }

    /**
     * Blacklist a user (block TTS completely)
     */
    blacklistUser(userId, username) {
        try {
            const now = Math.floor(Date.now() / 1000);

            const stmt = this.db.db.prepare(`
                INSERT INTO tts_user_permissions (user_id, username, is_blacklisted, allow_tts, created_at, updated_at)
                VALUES (?, ?, 1, 0, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    is_blacklisted = 1,
                    allow_tts = 0,
                    updated_at = excluded.updated_at
            `);

            stmt.run(userId, username, now, now);
            this.clearCache();

            this.logger.info(`User BLACKLISTED: ${username} (${userId})`);
            return true;

        } catch (error) {
            this.logger.error(`Failed to blacklist user ${username}: ${error.message}`);
            return false;
        }
    }

    /**
     * Remove user from blacklist
     */
    unblacklistUser(userId) {
        try {
            const stmt = this.db.db.prepare(`
                UPDATE tts_user_permissions
                SET is_blacklisted = 0, updated_at = ?
                WHERE user_id = ?
            `);

            stmt.run(Math.floor(Date.now() / 1000), userId);
            this.clearCache();

            this.logger.info(`User removed from blacklist: ${userId}`);
            return true;

        } catch (error) {
            this.logger.error(`Failed to unblacklist user ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Assign voice to user (auto-grants TTS permission)
     * @param {string} userId - User ID
     * @param {string} username - Username
     * @param {string} voiceId - Voice ID
     * @param {string} engine - Engine name
     * @param {string} emotion - Optional emotion setting
     */
    assignVoice(userId, username, voiceId, engine, emotion = null) {
        try {
            const now = Math.floor(Date.now() / 1000);

            const stmt = this.db.db.prepare(`
                INSERT INTO tts_user_permissions (user_id, username, assigned_voice_id, assigned_engine, voice_emotion, allow_tts, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    assigned_voice_id = excluded.assigned_voice_id,
                    assigned_engine = excluded.assigned_engine,
                    voice_emotion = excluded.voice_emotion,
                    allow_tts = 1,
                    is_blacklisted = 0,
                    updated_at = excluded.updated_at
            `);

            stmt.run(userId, username, voiceId, engine, emotion, now, now);
            this.clearCache();

            const emotionInfo = emotion ? ` with emotion: ${emotion}` : '';
            this.logger.info(`Voice assigned to ${username}: ${voiceId} (${engine})${emotionInfo}`);
            return true;

        } catch (error) {
            this.logger.error(`Failed to assign voice to ${username}: ${error.message}`);
            return false;
        }
    }

    /**
     * Remove voice assignment from user
     */
    removeVoiceAssignment(userId) {
        try {
            const stmt = this.db.db.prepare(`
                UPDATE tts_user_permissions
                SET assigned_voice_id = NULL, assigned_engine = NULL, updated_at = ?
                WHERE user_id = ?
            `);

            stmt.run(Math.floor(Date.now() / 1000), userId);
            this.clearCache();

            this.logger.info(`Voice assignment removed for user: ${userId}`);
            return true;

        } catch (error) {
            this.logger.error(`Failed to remove voice assignment for ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Set language preference for user
     */
    setLanguagePreference(userId, langCode) {
        try {
            const stmt = this.db.db.prepare(`
                UPDATE tts_user_permissions
                SET lang_preference = ?, updated_at = ?
                WHERE user_id = ?
            `);

            stmt.run(langCode, Math.floor(Date.now() / 1000), userId);
            this.clearCache();

            return true;

        } catch (error) {
            this.logger.error(`Failed to set language preference for ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Set volume gain for user
     */
    setVolumeGain(userId, gain) {
        try {
            const stmt = this.db.db.prepare(`
                UPDATE tts_user_permissions
                SET volume_gain = ?, updated_at = ?
                WHERE user_id = ?
            `);

            stmt.run(gain, Math.floor(Date.now() / 1000), userId);
            this.clearCache();

            return true;

        } catch (error) {
            this.logger.error(`Failed to set volume gain for ${userId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Get user settings
     */
    getUserSettings(userId) {
        return this._getUserPermission(userId);
    }

    /**
     * Get all users with TTS permissions
     */
    getAllUsers(filter = null) {
        try {
            let query = 'SELECT * FROM tts_user_permissions';
            const params = [];

            if (filter === 'whitelisted') {
                query += ' WHERE allow_tts = 1';
            } else if (filter === 'blacklisted') {
                query += ' WHERE is_blacklisted = 1';
            } else if (filter === 'voice_assigned') {
                query += ' WHERE assigned_voice_id IS NOT NULL';
            }

            query += ' ORDER BY username ASC';

            const stmt = this.db.db.prepare(query);
            return stmt.all(...params);

        } catch (error) {
            this.logger.error(`Failed to get users: ${error.message}`);
            return [];
        }
    }

    /**
     * Get permission statistics
     */
    getStats() {
        try {
            const stmt = this.db.db.prepare(`
                SELECT
                    COUNT(*) as total_users,
                    SUM(CASE WHEN allow_tts = 1 THEN 1 ELSE 0 END) as whitelisted_users,
                    SUM(CASE WHEN is_blacklisted = 1 THEN 1 ELSE 0 END) as blacklisted_users,
                    SUM(CASE WHEN assigned_voice_id IS NOT NULL THEN 1 ELSE 0 END) as voice_assigned_users
                FROM tts_user_permissions
            `);

            return stmt.get();

        } catch (error) {
            this.logger.error(`Failed to get permission stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Delete user permission record
     */
    deleteUser(userId) {
        try {
            const stmt = this.db.db.prepare(`
                DELETE FROM tts_user_permissions WHERE user_id = ?
            `);

            stmt.run(userId);
            this.clearCache();

            this.logger.info(`User permission record deleted: ${userId}`);
            return true;

        } catch (error) {
            this.logger.error(`Failed to delete user ${userId}: ${error.message}`);
            return false;
        }
    }
}

module.exports = PermissionManager;
