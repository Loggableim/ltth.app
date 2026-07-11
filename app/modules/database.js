const Database = require('better-sqlite3');
const { safeJsonParse } = require('./error-handler');
const fs = require('fs');
const path = require('path');

class DatabaseManager {
    constructor(dbPath, streamerId = null) {
        this.dbPath = dbPath;
        this.streamerId = streamerId; // Current streamer ID for scoped queries
        
        try {
            this.db = new Database(dbPath);

            // A missing settings table is the reliable signal for a genuinely new
            // profile database. Existing profiles without a persisted setting must
            // keep their legacy defaults during upgrades.
            this.isNewDatabase = !this.db.prepare(`
                SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'
            `).get();
            
            // Test database integrity
            try {
                const integrityResult = this.db.pragma('integrity_check');
                const isHealthy = Array.isArray(integrityResult) &&
                    integrityResult.length > 0 &&
                    integrityResult[0].integrity_check === 'ok';
                if (!isHealthy) {
                    throw new Error(`integrity_check failed: ${JSON.stringify(integrityResult)}`);
                }
            } catch (integrityError) {
                console.error('❌ [DATABASE] Database integrity check failed:', integrityError.message);
                throw new Error('DATABASE_CORRUPTED');
            }
        } catch (error) {
            if (error.message === 'DATABASE_CORRUPTED' || error.message.includes('malformed') || error.message.includes('corrupt')) {
                console.error('❌ [DATABASE] Database is corrupted. Attempting recovery...');
                this.handleCorruptedDatabase(dbPath);
                // Retry opening after recovery
                this.db = new Database(dbPath);
            } else {
                throw error;
            }
        }

        if (typeof this.isNewDatabase !== 'boolean') {
            this.isNewDatabase = !this.db.prepare(`
                SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'
            `).get();
        }
        
        this.initializeTables();

        // Batching-System für Event-Logs
        this.eventBatchQueue = [];
        this.eventBatchSize = 100;
        this.eventBatchTimeout = 5000; // 5 Sekunden
        this.eventBatchTimer = null;

        // Event log settings
        this.maxEventLogEntries = 5000; // Maximum entries to keep
        this.eventLogCleanupCounter = 0;
        this.eventLogCleanupInterval = 500; // Run cleanup every 500 batch flushes
        this.isClosing = false;
        this.isClosed = false;

        // Flag für Shutdown-Handler (verhindert doppelte Registrierung)
        this.shutdownHandlersRegistered = false;

        // In-memory cache for getEmojiRainConfig() to avoid redundant DB reads per event tick
        this._emojiRainConfigCache = null;
        this._emojiRainConfigCacheTs = 0;

        // Graceful shutdown handler (nur einmal registrieren)
        this.setupShutdownHandler();
    }

    setupShutdownHandler() {
        // Verhindere doppelte Handler-Registrierung
        if (DatabaseManager.shutdownHandlersRegistered) {
            return;
        }

        const gracefulShutdown = async () => {
            // Verhindere mehrfache Ausführung
            if (this._isShuttingDown) {
                return;
            }
            this._isShuttingDown = true;
            this.isClosing = true;

            try {
                // Flush mit Timeout-Schutz
                await Promise.race([
                    this.flushEventBatch(),
                    new Promise(resolve => setTimeout(resolve, 3000))
                ]);
                if (this.db?.open) {
                    this.db.close();
                }
                this.isClosed = true;
            } catch (error) {
                console.error('Error during graceful shutdown:', error);
            }
        };

        process.once('SIGINT', gracefulShutdown);
        process.once('SIGTERM', gracefulShutdown);
        process.once('exit', gracefulShutdown);

        DatabaseManager.shutdownHandlersRegistered = true;
    }

    _isDbOpen() {
        return !!this.db && this.db.open && !this.isClosed;
    }

    handleCorruptedDatabase(dbPath) {
        console.log('🔧 [DATABASE] Handling corrupted database...');
        
        // Close any open connection
        try {
            if (this.db) {
                this.db.close();
            }
        } catch (e) {
            // Ignore close errors
        }
        
        // Create backup of corrupted database
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = dbPath.replace(/\.db$/, `.corrupted.${timestamp}.db`);
        
        try {
            if (fs.existsSync(dbPath)) {
                console.log(`📦 [DATABASE] Backing up corrupted database to: ${backupPath}`);
                fs.copyFileSync(dbPath, backupPath);
                
                // Also backup WAL and SHM files if they exist
                const walPath = `${dbPath}-wal`;
                const shmPath = `${dbPath}-shm`;
                if (fs.existsSync(walPath)) {
                    fs.copyFileSync(walPath, `${backupPath}-wal`);
                }
                if (fs.existsSync(shmPath)) {
                    fs.copyFileSync(shmPath, `${backupPath}-shm`);
                }
                
                // Delete the corrupted database files
                console.log('🗑️  [DATABASE] Deleting corrupted database files...');
                fs.unlinkSync(dbPath);
                if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
                if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
                
                console.log('✅ [DATABASE] Corrupted database removed. A fresh database will be created.');
                console.log(`💾 [DATABASE] Backup saved at: ${backupPath}`);
            }
        } catch (error) {
            console.error('❌ [DATABASE] Error during database recovery:', error);
            throw error;
        }
    }

    initializeTables() {
        // Globale Einstellungen
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

        // Profile (verschiedene Konfigs speichern)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                config TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Event-Automatisierungen (Flows)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS flows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                trigger_type TEXT NOT NULL,
                trigger_condition TEXT,
                actions TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                description TEXT DEFAULT '',
                priority TEXT DEFAULT 'normal',
                schema_version INTEGER DEFAULT 1,
                flow_graph TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        this.ensureFlowsSchema();

        // Event-Log (optional, für Analytics)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS event_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                username TEXT,
                data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        this.ensureEventLogsSchema();

        // Indexes for event_logs performance (critical for high-volume scenarios)
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_event_logs_timestamp 
                ON event_logs(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_event_logs_event_type 
                ON event_logs(event_type);
            CREATE INDEX IF NOT EXISTS idx_event_logs_username 
                ON event_logs(username);
            CREATE INDEX IF NOT EXISTS idx_event_logs_type_time 
                ON event_logs(event_type, timestamp DESC);
        `);

        // Alert-Konfigurationen
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS alert_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT UNIQUE NOT NULL,
                sound_file TEXT,
                sound_volume INTEGER DEFAULT 80,
                text_template TEXT,
                duration INTEGER DEFAULT 5,
                enabled INTEGER DEFAULT 1
            )
        `);

        // Soundboard: Gift-spezifische Sounds
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS gift_sounds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gift_id INTEGER UNIQUE NOT NULL,
                label TEXT NOT NULL,
                mp3_url TEXT NOT NULL,
                volume REAL DEFAULT 1.0,
                animation_url TEXT,
                animation_type TEXT DEFAULT 'none',
                animation_volume REAL DEFAULT 1.0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Gift-Katalog (Cache der verfügbaren TikTok Gifts)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS gift_catalog (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                image_url TEXT,
                diamond_count INTEGER DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        this.ensureGiftCatalogSchema();

        // Weather Control: Gift-to-Weather Mappings
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS gift_weather_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gift_id INTEGER UNIQUE NOT NULL,
                weather_effect TEXT NOT NULL,
                intensity REAL DEFAULT 0.5,
                duration INTEGER DEFAULT 10000,
                enabled INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // HUD-Element-Konfigurationen (Position und Sichtbarkeit)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS hud_elements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                element_id TEXT UNIQUE NOT NULL,
                enabled INTEGER DEFAULT 1,
                position_x REAL DEFAULT 0,
                position_y REAL DEFAULT 0,
                position_unit TEXT DEFAULT 'px',
                width REAL DEFAULT 0,
                height REAL DEFAULT 0,
                anchor TEXT DEFAULT 'top-left',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Emoji Rain HUD Konfiguration
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS emoji_rain_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER DEFAULT 1,
                config_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // PATCH: VDO.Ninja Multi-Guest Integration - Rooms
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vdoninja_rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_name TEXT UNIQUE NOT NULL,
                room_id TEXT UNIQUE NOT NULL,
                password TEXT,
                max_guests INTEGER DEFAULT 6,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used DATETIME
            )
        `);

        // PATCH: VDO.Ninja Multi-Guest Integration - Guests
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vdoninja_guests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id INTEGER REFERENCES vdoninja_rooms(id) ON DELETE CASCADE,
                slot_number INTEGER NOT NULL,
                stream_id TEXT,
                guest_name TEXT,
                is_connected INTEGER DEFAULT 0,
                audio_enabled INTEGER DEFAULT 1,
                video_enabled INTEGER DEFAULT 1,
                volume REAL DEFAULT 1.0,
                layout_position_x REAL DEFAULT 0,
                layout_position_y REAL DEFAULT 0,
                layout_width REAL DEFAULT 100,
                layout_height REAL DEFAULT 100,
                joined_at DATETIME,
                UNIQUE(room_id, slot_number)
            )
        `);

        // PATCH: VDO.Ninja Multi-Guest Integration - Layout Presets
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vdoninja_layouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                layout_type TEXT NOT NULL,
                layout_config TEXT NOT NULL,
                thumbnail_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // PATCH: VDO.Ninja Multi-Guest Integration - Guest Events
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vdoninja_guest_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guest_id INTEGER REFERENCES vdoninja_guests(id) ON DELETE CASCADE,
                event_type TEXT NOT NULL,
                event_data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Gift Milestone Celebration Plugin
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS milestone_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER DEFAULT 1,
                threshold INTEGER DEFAULT 1000,
                mode TEXT DEFAULT 'auto_increment',
                increment_step INTEGER DEFAULT 1000,
                animation_gif_path TEXT,
                animation_video_path TEXT,
                animation_audio_path TEXT,
                audio_volume INTEGER DEFAULT 80,
                playback_mode TEXT DEFAULT 'exclusive',
                animation_duration INTEGER DEFAULT 0,
                session_reset INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS milestone_stats (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                cumulative_coins INTEGER DEFAULT 0,
                current_milestone INTEGER DEFAULT 0,
                last_trigger_at DATETIME,
                session_start_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Milestone Tiers - Multiple configurable tiers with different thresholds and media
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS milestone_tiers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                tier_level INTEGER NOT NULL UNIQUE,
                threshold INTEGER NOT NULL,
                animation_gif_path TEXT,
                animation_video_path TEXT,
                animation_audio_path TEXT,
                enabled INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Per-User Milestone Tracking
        // SCOPED BY STREAMER: Each viewer has separate milestone progress per streamer
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS milestone_user_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                streamer_id TEXT NOT NULL,
                username TEXT NOT NULL,
                cumulative_coins INTEGER DEFAULT 0,
                current_milestone INTEGER DEFAULT 0,
                last_tier_reached INTEGER DEFAULT 0,
                last_trigger_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, streamer_id)
            )
        `);

        // Shared User Statistics (for cross-plugin usage)
        // SCOPED BY STREAMER: Each viewer has separate stats per streamer
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_statistics (
                user_id TEXT NOT NULL,
                streamer_id TEXT NOT NULL,
                username TEXT NOT NULL,
                unique_id TEXT,
                profile_picture_url TEXT,
                total_coins_sent INTEGER DEFAULT 0,
                total_gifts_sent INTEGER DEFAULT 0,
                total_comments INTEGER DEFAULT 0,
                total_likes INTEGER DEFAULT 0,
                total_shares INTEGER DEFAULT 0,
                total_follows INTEGER DEFAULT 0,
                first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_gift_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, streamer_id)
            )
        `);

        // Run migrations BEFORE creating indexes to ensure schema is up-to-date
        this.runMigrations();

        // Index for faster queries on user_statistics (after migration)
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_user_stats_coins 
            ON user_statistics(streamer_id, total_coins_sent DESC)
        `);

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_user_stats_username 
            ON user_statistics(streamer_id, username)
        `);

        // Stream Statistics - Persistent stream-level statistics per profile
        // Stores the current session stats (viewers, likes, coins, etc.)
        // Uses a single-row design (id=1) because each profile has its own database file
        // This means each profile's stats are automatically isolated by the file system
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS stream_stats (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                viewers INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                total_coins INTEGER DEFAULT 0,
                followers INTEGER DEFAULT 0,
                shares INTEGER DEFAULT 0,
                gifts INTEGER DEFAULT 0,
                username TEXT,
                room_id TEXT,
                stream_start_time INTEGER,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        this.ensureStreamStatsSchema();

        // Username Aliases for streamer profile recognition after username change
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS profile_username_aliases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                label TEXT,
                is_primary INTEGER DEFAULT 0,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME,
                notes TEXT
            )
        `);

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_alias_username
            ON profile_username_aliases(username COLLATE NOCASE)
        `);

        // Default-Einstellungen setzen
        this.setDefaultSettings();
        this.initializeEmojiRainDefaults();
        this.initializeDefaultVDONinjaLayouts(); // PATCH: VDO.Ninja Default Layouts
        this.initializeMilestoneDefaults(); // Gift Milestone Celebration Plugin
    }

    /**
     * Set the streamer ID for scoped queries
     */
    setStreamerId(streamerId) {
        this.streamerId = streamerId;
    }

    /**
     * Get the current streamer ID
     */
    getStreamerId() {
        return this.streamerId;
    }

    // ========== USERNAME ALIASES ==========

    /**
     * Get all username aliases for this profile
     * @returns {Array} Array of alias objects
     */
    getUsernameAliases() {
        try {
            return this.db.prepare(
                'SELECT * FROM profile_username_aliases ORDER BY is_primary DESC, added_at ASC'
            ).all();
        } catch (error) {
            console.error('[DB] Error getting username aliases:', error);
            return [];
        }
    }

    /**
     * Add a username alias to this profile
     * @param {string} username - TikTok username (without @)
     * @param {string} label - Optional human-readable label
     * @param {boolean} isPrimary - Whether this is the primary/current username
     * @returns {Object} Created alias
     */
    addUsernameAlias(username, label = null, isPrimary = false) {
        try {
            username = username.replace(/^@/, '').trim().toLowerCase();
            if (!username) throw new Error('Username cannot be empty');

            if (isPrimary) {
                // Demote all existing primary aliases
                this.db.prepare(
                    'UPDATE profile_username_aliases SET is_primary = 0 WHERE is_primary = 1'
                ).run();
            }

            const stmt = this.db.prepare(`
                INSERT INTO profile_username_aliases (username, label, is_primary, added_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(username) DO UPDATE SET
                    label = excluded.label,
                    is_primary = excluded.is_primary
            `);
            stmt.run(username, label, isPrimary ? 1 : 0);

            return this.db.prepare(
                'SELECT * FROM profile_username_aliases WHERE username = ?'
            ).get(username);
        } catch (error) {
            console.error('[DB] Error adding username alias:', error);
            throw error;
        }
    }

    /**
     * Remove a username alias from this profile
     * @param {string} username - TikTok username to remove
     */
    removeUsernameAlias(username) {
        try {
            username = username.replace(/^@/, '').trim().toLowerCase();
            this.db.prepare(
                'DELETE FROM profile_username_aliases WHERE username = ?'
            ).run(username);
        } catch (error) {
            console.error('[DB] Error removing username alias:', error);
            throw error;
        }
    }

    /**
     * Set a username as the primary alias
     * @param {string} username - TikTok username to set as primary
     */
    setPrimaryAlias(username) {
        try {
            username = username.replace(/^@/, '').trim().toLowerCase();
            this.db.prepare(
                'UPDATE profile_username_aliases SET is_primary = 0'
            ).run();
            this.db.prepare(
                'UPDATE profile_username_aliases SET is_primary = 1 WHERE username = ?'
            ).run(username);
        } catch (error) {
            console.error('[DB] Error setting primary alias:', error);
            throw error;
        }
    }

    /**
     * Check if a username matches any alias of this profile (case-insensitive)
     * @param {string} username - TikTok username to check
     * @returns {boolean}
     */
    hasUsernameAlias(username) {
        try {
            username = username.replace(/^@/, '').trim().toLowerCase();
            const result = this.db.prepare(
                'SELECT id FROM profile_username_aliases WHERE username = ? COLLATE NOCASE'
            ).get(username);
            return !!result;
        } catch (error) {
            console.error('[DB] Error checking username alias:', error);
            return false;
        }
    }

    /**
     * Update last_seen_at for an alias (called on TikTok connect)
     * @param {string} username
     */
    touchUsernameAlias(username) {
        try {
            username = username.replace(/^@/, '').trim().toLowerCase();
            this.db.prepare(
                'UPDATE profile_username_aliases SET last_seen_at = CURRENT_TIMESTAMP WHERE username = ? COLLATE NOCASE'
            ).run(username);
        } catch (error) {
            console.error('[DB] Error touching alias:', error);
        }
    }

    getTableColumns(tableName) {
        return new Set(this.db.prepare(`PRAGMA table_info(${tableName})`).all().map(col => col.name));
    }

    addColumnIfMissing(tableName, columns, columnName, definition) {
        if (columns.has(columnName)) {
            return;
        }

        this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
        columns.add(columnName);
    }

    selectLegacyColumn(columns, columnName, fallbackSql) {
        return columns.has(columnName) ? columnName : fallbackSql;
    }

    ensureEventLogsSchema() {
        const columns = this.getTableColumns('event_logs');
        this.addColumnIfMissing('event_logs', columns, 'event_type', 'TEXT');
        this.addColumnIfMissing('event_logs', columns, 'username', 'TEXT');
        this.addColumnIfMissing('event_logs', columns, 'data', 'TEXT');
        this.addColumnIfMissing('event_logs', columns, 'timestamp', 'DATETIME');
    }

    ensureFlowsSchema() {
        const columns = this.getTableColumns('flows');
        this.addColumnIfMissing('flows', columns, 'description', "TEXT DEFAULT ''");
        this.addColumnIfMissing('flows', columns, 'priority', "TEXT DEFAULT 'normal'");
        this.addColumnIfMissing('flows', columns, 'schema_version', 'INTEGER DEFAULT 1');
        this.addColumnIfMissing('flows', columns, 'flow_graph', 'TEXT');
    }

    ensureHudElementsSchema() {
        const columns = this.getTableColumns('hud_elements');
        this.addColumnIfMissing('hud_elements', columns, 'element_id', 'TEXT');
        this.addColumnIfMissing('hud_elements', columns, 'enabled', 'INTEGER DEFAULT 1');
        this.addColumnIfMissing('hud_elements', columns, 'position_x', 'REAL DEFAULT 0');
        this.addColumnIfMissing('hud_elements', columns, 'position_y', 'REAL DEFAULT 0');
        this.addColumnIfMissing('hud_elements', columns, 'position_unit', "TEXT DEFAULT 'px'");
        this.addColumnIfMissing('hud_elements', columns, 'width', 'REAL DEFAULT 0');
        this.addColumnIfMissing('hud_elements', columns, 'height', 'REAL DEFAULT 0');
        this.addColumnIfMissing('hud_elements', columns, 'anchor', "TEXT DEFAULT 'top-left'");
        this.addColumnIfMissing('hud_elements', columns, 'created_at', 'DATETIME');
        this.addColumnIfMissing('hud_elements', columns, 'updated_at', 'DATETIME');
    }

    ensureModernUserStatisticsColumns() {
        const columns = this.getTableColumns('user_statistics');
        this.addColumnIfMissing('user_statistics', columns, 'unique_id', 'TEXT');
        this.addColumnIfMissing('user_statistics', columns, 'profile_picture_url', 'TEXT');
        this.addColumnIfMissing('user_statistics', columns, 'total_coins_sent', 'INTEGER DEFAULT 0');
        this.addColumnIfMissing('user_statistics', columns, 'total_gifts_sent', 'INTEGER DEFAULT 0');
        this.addColumnIfMissing('user_statistics', columns, 'total_comments', 'INTEGER DEFAULT 0');
        this.addColumnIfMissing('user_statistics', columns, 'total_likes', 'INTEGER DEFAULT 0');
        this.addColumnIfMissing('user_statistics', columns, 'total_shares', 'INTEGER DEFAULT 0');
        this.addColumnIfMissing('user_statistics', columns, 'total_follows', 'INTEGER DEFAULT 0');
        this.addColumnIfMissing('user_statistics', columns, 'first_seen_at', 'DATETIME');
        this.addColumnIfMissing('user_statistics', columns, 'last_seen_at', 'DATETIME');
        this.addColumnIfMissing('user_statistics', columns, 'last_gift_at', 'DATETIME');
        this.addColumnIfMissing('user_statistics', columns, 'created_at', 'DATETIME');
        this.addColumnIfMissing('user_statistics', columns, 'updated_at', 'DATETIME');
    }

    migrateUserStatisticsSchema() {
        const columns = this.getTableColumns('user_statistics');
        if (columns.has('streamer_id')) {
            this.ensureModernUserStatisticsColumns();
            return;
        }

        console.log('Running migration: Adding streamer_id to user_statistics table for scoped profiles');
        const defaultStreamerId = this.streamerId || 'default';
        const select = name => this.selectLegacyColumn(columns, name, this.userStatisticsFallback(name));

        const migrate = this.db.transaction(() => {
            this.db.exec('DROP TABLE IF EXISTS user_statistics_new');
            this.db.exec(`
                CREATE TABLE user_statistics_new (
                    user_id TEXT NOT NULL,
                    streamer_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    unique_id TEXT,
                    profile_picture_url TEXT,
                    total_coins_sent INTEGER DEFAULT 0,
                    total_gifts_sent INTEGER DEFAULT 0,
                    total_comments INTEGER DEFAULT 0,
                    total_likes INTEGER DEFAULT 0,
                    total_shares INTEGER DEFAULT 0,
                    total_follows INTEGER DEFAULT 0,
                    first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_gift_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, streamer_id)
                )
            `);

            this.db.prepare(`
                INSERT OR REPLACE INTO user_statistics_new (
                    user_id, streamer_id, username, unique_id, profile_picture_url,
                    total_coins_sent, total_gifts_sent, total_comments, total_likes,
                    total_shares, total_follows, first_seen_at, last_seen_at,
                    last_gift_at, created_at, updated_at
                )
                SELECT
                    CAST(user_id AS TEXT),
                    ?,
                    ${columns.has('username') ? "COALESCE(username, CAST(user_id AS TEXT), 'Unknown')" : "COALESCE(CAST(user_id AS TEXT), 'Unknown')"},
                    ${select('unique_id')},
                    ${select('profile_picture_url')},
                    ${select('total_coins_sent')},
                    ${select('total_gifts_sent')},
                    ${select('total_comments')},
                    ${select('total_likes')},
                    ${select('total_shares')},
                    ${select('total_follows')},
                    ${select('first_seen_at')},
                    ${select('last_seen_at')},
                    ${select('last_gift_at')},
                    ${select('created_at')},
                    ${select('updated_at')}
                FROM user_statistics
                WHERE user_id IS NOT NULL
            `).run(defaultStreamerId);

            this.db.exec('DROP TABLE user_statistics');
            this.db.exec('ALTER TABLE user_statistics_new RENAME TO user_statistics');
        });

        migrate();
        console.log('Migration completed: user_statistics now scoped by streamer_id');
    }

    userStatisticsFallback(columnName) {
        const fallbacks = {
            unique_id: 'NULL',
            profile_picture_url: 'NULL',
            total_coins_sent: '0',
            total_gifts_sent: '0',
            total_comments: '0',
            total_likes: '0',
            total_shares: '0',
            total_follows: '0',
            first_seen_at: 'CURRENT_TIMESTAMP',
            last_seen_at: 'CURRENT_TIMESTAMP',
            last_gift_at: 'NULL',
            created_at: 'CURRENT_TIMESTAMP',
            updated_at: 'CURRENT_TIMESTAMP'
        };

        return fallbacks[columnName] || 'NULL';
    }

    ensureModernMilestoneUserStatsColumns() {
        const columns = this.getTableColumns('milestone_user_stats');
        this.addColumnIfMissing('milestone_user_stats', columns, 'last_tier_reached', 'INTEGER DEFAULT 0');
        this.addColumnIfMissing('milestone_user_stats', columns, 'last_trigger_at', 'DATETIME');
        this.addColumnIfMissing('milestone_user_stats', columns, 'created_at', 'DATETIME');
        this.addColumnIfMissing('milestone_user_stats', columns, 'updated_at', 'DATETIME');
    }

    migrateMilestoneUserStatsSchema() {
        const columns = this.getTableColumns('milestone_user_stats');
        if (columns.has('streamer_id')) {
            this.ensureModernMilestoneUserStatsColumns();
            return;
        }

        console.log('Running migration: Adding streamer_id to milestone_user_stats table');
        const defaultStreamerId = this.streamerId || 'default';
        const select = name => this.selectLegacyColumn(columns, name, this.milestoneUserStatsFallback(name));

        const migrate = this.db.transaction(() => {
            this.db.exec('DROP TABLE IF EXISTS milestone_user_stats_new');
            this.db.exec(`
                CREATE TABLE milestone_user_stats_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    streamer_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    cumulative_coins INTEGER DEFAULT 0,
                    current_milestone INTEGER DEFAULT 0,
                    last_tier_reached INTEGER DEFAULT 0,
                    last_trigger_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, streamer_id)
                )
            `);

            this.db.prepare(`
                INSERT OR REPLACE INTO milestone_user_stats_new (
                    id, user_id, streamer_id, username, cumulative_coins,
                    current_milestone, last_tier_reached, last_trigger_at,
                    created_at, updated_at
                )
                SELECT
                    ${columns.has('id') ? 'id' : 'NULL'},
                    CAST(user_id AS TEXT),
                    ?,
                    ${columns.has('username') ? "COALESCE(username, CAST(user_id AS TEXT), 'Unknown')" : "COALESCE(CAST(user_id AS TEXT), 'Unknown')"},
                    ${select('cumulative_coins')},
                    ${select('current_milestone')},
                    ${select('last_tier_reached')},
                    ${select('last_trigger_at')},
                    ${select('created_at')},
                    ${select('updated_at')}
                FROM milestone_user_stats
                WHERE user_id IS NOT NULL
            `).run(defaultStreamerId);

            this.db.exec('DROP TABLE milestone_user_stats');
            this.db.exec('ALTER TABLE milestone_user_stats_new RENAME TO milestone_user_stats');
        });

        migrate();
        console.log('Migration completed: milestone_user_stats now scoped by streamer_id');
    }

    milestoneUserStatsFallback(columnName) {
        const fallbacks = {
            cumulative_coins: '0',
            current_milestone: '0',
            last_tier_reached: '0',
            last_trigger_at: 'NULL',
            created_at: 'CURRENT_TIMESTAMP',
            updated_at: 'CURRENT_TIMESTAMP'
        };

        return fallbacks[columnName] || 'NULL';
    }

    runMigrations() {
        // Migration: Add animation_volume column to gift_sounds table if it doesn't exist
        try {
            const tableInfo = this.db.prepare("PRAGMA table_info(gift_sounds)").all();
            const hasAnimationVolume = tableInfo.some(col => col.name === 'animation_volume');
            
            if (!hasAnimationVolume) {
                console.log('Running migration: Adding animation_volume column to gift_sounds table');
                this.db.exec('ALTER TABLE gift_sounds ADD COLUMN animation_volume REAL DEFAULT 1.0');
                console.log('Migration completed successfully');
            }
        } catch (error) {
            console.error('Migration error:', error);
        }

        try {
            this.ensureHudElementsSchema();
        } catch (error) {
            console.error('Migration error for hud_elements:', error);
            throw error;
        }

        try {
            this.ensureGiftCatalogSchema();
        } catch (error) {
            console.error('Migration error for gift_catalog:', error);
            throw error;
        }

        // Migration: Add streamer_id to user_statistics for scoped user profiles
        try {
            this.migrateUserStatisticsSchema();
        } catch (error) {
            console.error('Migration error for user_statistics:', error);
            throw error;
        }

        // Migration: Add streamer_id to milestone_user_stats
        try {
            this.migrateMilestoneUserStatsSchema();
        } catch (error) {
            console.error('Migration error for milestone_user_stats:', error);
            throw error;
        }
    }

    setDefaultSettings() {
        const defaults = {
            'alert_gift_min_coins': '100',
            'theme': 'dark',
            // Quick Actions Einstellungen
            'tts_enabled': 'true',
            'soundboard_enabled': 'true',
            'flows_enabled': 'true',
            // Soundboard Einstellungen
            'soundboard_play_mode': 'overlap', // overlap or sequential (managed in frontend)
            'soundboard_max_queue_length': '10',
            'soundboard_like_threshold': '0',
            'soundboard_like_window_seconds': '10',
            'soundboard_follow_sound': '',
            'soundboard_follow_volume': '1.0',
            'soundboard_follow_animation_url': '',
            'soundboard_follow_animation_type': 'none',
            'soundboard_follow_animation_volume': '1.0',
            'soundboard_subscribe_sound': '',
            'soundboard_subscribe_volume': '1.0',
            'soundboard_subscribe_animation_url': '',
            'soundboard_subscribe_animation_type': 'none',
            'soundboard_subscribe_animation_volume': '1.0',
            'soundboard_share_sound': '',
            'soundboard_share_volume': '1.0',
            'soundboard_share_animation_url': '',
            'soundboard_share_animation_type': 'none',
            'soundboard_share_animation_volume': '1.0',
            'soundboard_like_sound': '',
            'soundboard_like_volume': '1.0',
            'soundboard_default_gift_sound': '',
            'soundboard_gift_volume': '1.0',
            // HUD/Overlay Einstellungen
            'hud_resolution': '1920x1080',
            'hud_orientation': 'landscape'
        };

        if (this.isNewDatabase) {
            defaults.tiktok_auto_reconnect = 'false';
        }

        const stmt = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(defaults)) {
            stmt.run(key, value);
        }

        // Standard HUD-Element Positionen initialisieren
        this.initializeDefaultHudElements();
    }

    ensureStreamStatsSchema() {
        const columns = new Set(
            this.db.prepare('PRAGMA table_info(stream_stats)').all().map(column => column.name)
        );
        const additions = [
            ['username', 'TEXT'],
            ['room_id', 'TEXT'],
            ['stream_start_time', 'INTEGER']
        ];

        for (const [name, definition] of additions) {
            if (!columns.has(name)) {
                this.db.exec(`ALTER TABLE stream_stats ADD COLUMN ${name} ${definition}`);
            }
        }
    }

    initializeDefaultHudElements() {
        const defaultElements = [
            { element_id: 'alert', enabled: 1, position_x: 50, position_y: 50, position_unit: '%', width: 400, height: 200, anchor: 'center' },
            { element_id: 'event-feed', enabled: 1, position_x: 30, position_y: 120, position_unit: 'px', width: 400, height: 400, anchor: 'bottom-left' },
            { element_id: 'chat', enabled: 1, position_x: 30, position_y: 30, position_unit: 'px', width: 450, height: 600, anchor: 'bottom-right' },
            { element_id: 'goal', enabled: 1, position_x: 50, position_y: 30, position_unit: '%', width: 500, height: 80, anchor: 'top-center' }
        ];

        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO hud_elements (element_id, enabled, position_x, position_y, position_unit, width, height, anchor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const element of defaultElements) {
            stmt.run(
                element.element_id,
                element.enabled,
                element.position_x,
                element.position_y,
                element.position_unit,
                element.width,
                element.height,
                element.anchor
            );
        }
    }

    // ========== SETTINGS ==========
    getSetting(key) {
        const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
        const result = stmt.get(key);
        return result ? result.value : null;
    }

    getAllSettings() {
        const stmt = this.db.prepare('SELECT * FROM settings');
        const rows = stmt.all();
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        return settings;
    }

    setSetting(key, value) {
        const stmt = this.db.prepare(`
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);
        stmt.run(key, String(value));
    }

    deleteSetting(key) {
        const stmt = this.db.prepare('DELETE FROM settings WHERE key = ?');
        stmt.run(key);
    }

    // ========== FLOWS ==========
    parseFlowRow(row) {
        return {
            ...row,
            trigger_condition: row.trigger_condition ? safeJsonParse(row.trigger_condition, null) : null,
            actions: safeJsonParse(row.actions, []),
            enabled: Boolean(row.enabled),
            description: row.description || '',
            priority: row.priority || 'normal',
            schema_version: row.schema_version || 1,
            flow_graph: row.flow_graph ? safeJsonParse(row.flow_graph, null) : null
        };
    }

    getFlows() {
        const stmt = this.db.prepare('SELECT * FROM flows ORDER BY created_at DESC');
        const rows = stmt.all();
        return rows.map(row => this.parseFlowRow(row));
    }

    getFlow(id) {
        const stmt = this.db.prepare('SELECT * FROM flows WHERE id = ?');
        const row = stmt.get(id);
        if (!row) return null;
        return this.parseFlowRow(row);
    }

    getEnabledFlows() {
        const stmt = this.db.prepare('SELECT * FROM flows WHERE enabled = 1 ORDER BY created_at ASC');
        const rows = stmt.all();
        return rows.map(row => this.parseFlowRow(row));
    }

    createFlow(flow) {
        const stmt = this.db.prepare(`
            INSERT INTO flows (name, trigger_type, trigger_condition, actions, enabled, description, priority, schema_version, flow_graph)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
            flow.name,
            flow.trigger_type,
            flow.trigger_condition ? JSON.stringify(flow.trigger_condition) : null,
            JSON.stringify(flow.actions),
            (flow.enabled === false || flow.enabled === 0 || flow.enabled === 'false') ? 0 : 1,
            flow.description || '',
            flow.priority || 'normal',
            flow.schema_version || 1,
            flow.flow_graph ? JSON.stringify(flow.flow_graph) : null
        );
        return info.lastInsertRowid;
    }

    updateFlow(id, flow) {
        const stmt = this.db.prepare(`
            UPDATE flows
            SET name = ?, trigger_type = ?, trigger_condition = ?, actions = ?, enabled = ?,
                description = ?, priority = ?, schema_version = ?, flow_graph = ?
            WHERE id = ?
        `);
        stmt.run(
            flow.name,
            flow.trigger_type,
            flow.trigger_condition ? JSON.stringify(flow.trigger_condition) : null,
            JSON.stringify(flow.actions),
            (flow.enabled === false || flow.enabled === 0 || flow.enabled === 'false') ? 0 : 1,
            flow.description || '',
            flow.priority || 'normal',
            flow.schema_version || 1,
            flow.flow_graph ? JSON.stringify(flow.flow_graph) : null,
            id
        );
    }

    deleteFlow(id) {
        const stmt = this.db.prepare('DELETE FROM flows WHERE id = ?');
        stmt.run(id);
    }

    toggleFlow(id, enabled) {
        const stmt = this.db.prepare('UPDATE flows SET enabled = ? WHERE id = ?');
        stmt.run(enabled ? 1 : 0, id);
    }

    // ========== ALERT CONFIGS ==========
    getAlertConfig(eventType) {
        const stmt = this.db.prepare('SELECT * FROM alert_configs WHERE event_type = ?');
        const row = stmt.get(eventType);
        return row ? { ...row, enabled: Boolean(row.enabled) } : null;
    }

    getAllAlertConfigs() {
        const stmt = this.db.prepare('SELECT * FROM alert_configs');
        const rows = stmt.all();
        return rows.map(row => ({ ...row, enabled: Boolean(row.enabled) }));
    }

    setAlertConfig(eventType, config) {
        const stmt = this.db.prepare(`
            INSERT INTO alert_configs (event_type, sound_file, sound_volume, text_template, duration, enabled)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(event_type) DO UPDATE SET
                sound_file = excluded.sound_file,
                sound_volume = excluded.sound_volume,
                text_template = excluded.text_template,
                duration = excluded.duration,
                enabled = excluded.enabled
        `);
        stmt.run(
            eventType,
            config.sound_file || null,
            config.sound_volume || 80,
            config.text_template || '',
            config.duration || 5,
            config.enabled ? 1 : 0
        );
    }

    // ========== EVENT LOGS ==========
    logEvent(eventType, username, data) {
        if (this.isClosing || !this._isDbOpen()) {
            return;
        }

        let serializedData = '{}';
        try {
            serializedData = JSON.stringify(data);
        } catch (error) {
            console.warn('[Database] Failed to serialize event log payload, using empty object:', error.message);
        }

        // Add to batch queue
        this.eventBatchQueue.push({
            eventType,
            username,
            data: serializedData
        });

        // Check if batch is full
        if (this.eventBatchQueue.length >= this.eventBatchSize) {
            this.flushEventBatch();
        } else {
            // Reset timer
            if (this.eventBatchTimer) {
                clearTimeout(this.eventBatchTimer);
            }
            this.eventBatchTimer = setTimeout(() => {
                this.flushEventBatch().catch((error) => {
                    console.error('[Database] Timer flush failed:', error);
                });
            }, this.eventBatchTimeout);
        }
    }

    flushEventBatch() {
        if (this.eventBatchQueue.length === 0) {
            return Promise.resolve();
        }

        if (!this._isDbOpen()) {
            this.eventBatchQueue = [];
            return Promise.resolve();
        }

        // Clear timer
        if (this.eventBatchTimer) {
            clearTimeout(this.eventBatchTimer);
            this.eventBatchTimer = null;
        }

        // Snapshot der Queue (verhindert Race Conditions)
        const eventsToFlush = [...this.eventBatchQueue];
        this.eventBatchQueue = [];

        return new Promise((resolve, reject) => {
            try {
                // Prepare batch insert
                const stmt = this.db.prepare(`
                    INSERT INTO event_logs (event_type, username, data)
                    VALUES (?, ?, ?)
                `);

                // Use transaction for batch insert
                const insertMany = this.db.transaction((events) => {
                    for (const event of events) {
                        stmt.run(event.eventType, event.username, event.data);
                    }
                });

                insertMany(eventsToFlush);
                
                // Periodic cleanup to prevent database from growing indefinitely
                this.eventLogCleanupCounter++;
                if (this.eventLogCleanupCounter >= this.eventLogCleanupInterval) {
                    this.eventLogCleanupCounter = 0;
                    const deleted = this.cleanupEventLogs(this.maxEventLogEntries);
                    if (deleted > 0) {
                        console.log(`[Database] Auto-cleanup: removed ${deleted} old event log entries`);
                    }
                }
                
                resolve();
            } catch (error) {
                console.error('Error flushing event batch:', error);
                // Bei Fehler zurück in Queue
                if (!this.isClosing && !this.isClosed) {
                    this.eventBatchQueue.unshift(...eventsToFlush);
                }
                reject(error);
            }
        });
    }

    getEventLogs(limit = 100) {
        const stmt = this.db.prepare('SELECT * FROM event_logs ORDER BY timestamp DESC LIMIT ?');
        const rows = stmt.all(limit);
        return rows.map(row => ({
            ...row,
            data: safeJsonParse(row.data, {})
        }));
    }

    clearEventLogs() {
        const stmt = this.db.prepare('DELETE FROM event_logs');
        stmt.run();
    }

    // ========== EVENT LOG CLEANUP & EXTENDED API ==========
    
    /**
     * Get event logs with optional filtering by event type
     * @param {Object} options - Query options
     * @param {number} options.limit - Maximum number of events (default: 100)
     * @param {string} options.eventType - Filter by event type (chat, gift, follow, share, like, subscribe)
     * @param {string} options.since - ISO timestamp to get events after
     * @returns {Array} Event logs with parsed data
     */
    getEventLogsFiltered(options = {}) {
        const { limit = 100, eventType = null, since = null } = options;
        
        // Build query conditionally for better maintainability
        const conditions = [];
        const params = [];
        
        if (eventType) {
            conditions.push('event_type = ?');
            params.push(eventType);
        }
        
        if (since) {
            conditions.push('timestamp > ?');
            params.push(since);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `SELECT * FROM event_logs ${whereClause} ORDER BY timestamp DESC LIMIT ?`;
        params.push(limit);
        
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        return rows.map(row => ({
            ...row,
            data: safeJsonParse(row.data, {})
        }));
    }

    /**
     * Get event counts grouped by type
     * @returns {Object} Count per event type
     */
    getEventLogStats() {
        const stmt = this.db.prepare(`
            SELECT event_type, COUNT(*) as count 
            FROM event_logs 
            GROUP BY event_type
        `);
        const rows = stmt.all();
        const stats = { total: 0 };
        for (const row of rows) {
            stats[row.event_type] = row.count;
            stats.total += row.count;
        }
        return stats;
    }

    /**
     * Cleanup old event logs, keeping only the most recent entries
     * Uses timestamp for reliable chronological ordering
     * @param {number} keepCount - Number of recent entries to keep (default: 1000)
     * @returns {number} Number of deleted entries
     */
    cleanupEventLogs(keepCount = 1000) {
        if (!this._isDbOpen()) {
            return 0;
        }

        const normalizedKeepCount = Number.isInteger(keepCount) ? keepCount : parseInt(keepCount, 10);
        if (!Number.isFinite(normalizedKeepCount) || normalizedKeepCount < 1) {
            return 0;
        }

        try {
            // Use timestamp for reliable chronological cleanup (not id which may have gaps)
            const thresholdStmt = this.db.prepare(`
                SELECT timestamp FROM event_logs 
                ORDER BY timestamp DESC 
                LIMIT 1 OFFSET ?
            `);
            const threshold = thresholdStmt.get(normalizedKeepCount - 1);
            
            if (!threshold) {
                // Less than keepCount entries, nothing to delete
                return 0;
            }
            
            const deleteStmt = this.db.prepare('DELETE FROM event_logs WHERE timestamp < ?');
            const result = deleteStmt.run(threshold.timestamp);
            return result.changes;
        } catch (error) {
            console.error('[Database] Error during event log cleanup:', error);
            return 0;
        }
    }

    /**
     * Get the latest event of a specific type
     * @param {string} eventType - Type of event
     * @returns {Object|null} Latest event or null
     */
    getLatestEvent(eventType) {
        const stmt = this.db.prepare(`
            SELECT * FROM event_logs 
            WHERE event_type = ? 
            ORDER BY timestamp DESC 
            LIMIT 1
        `);
        const row = stmt.get(eventType);
        if (!row) return null;
        return {
            ...row,
            data: safeJsonParse(row.data, {})
        };
    }

    // ========== PROFILES ==========
    getProfiles() {
        const stmt = this.db.prepare('SELECT * FROM profiles ORDER BY created_at DESC');
        const rows = stmt.all();
        return rows.map(row => ({
            ...row,
            config: safeJsonParse(row.config, {})
        }));
    }

    getProfile(id) {
        const stmt = this.db.prepare('SELECT * FROM profiles WHERE id = ?');
        const row = stmt.get(id);
        if (!row) return null;
        return {
            ...row,
            config: safeJsonParse(row.config, {})
        };
    }

    createProfile(name, config) {
        const stmt = this.db.prepare('INSERT INTO profiles (name, config) VALUES (?, ?)');
        const info = stmt.run(name, JSON.stringify(config));
        return info.lastInsertRowid;
    }

    deleteProfile(id) {
        const stmt = this.db.prepare('DELETE FROM profiles WHERE id = ?');
        stmt.run(id);
    }

    // ========== GIFT CATALOG ==========
    normalizeLocaleCode(value) {
        if (typeof value !== 'string') {
            return null;
        }

        const normalized = value.trim().toLowerCase();
        return normalized ? normalized : null;
    }

    _parseLocalizedGiftNames(rawJson) {
        const value = safeJsonParse(rawJson, null);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value;
    }

    _getGiftCatalogRowName(row, locale) {
        if (!row || typeof row !== 'object') {
            return null;
        }

        const normalizedLocale = this.normalizeLocaleCode(locale);
        if (!normalizedLocale) {
            return row.name || null;
        }

        const localeMap = this._parseLocalizedGiftNames(row.names_by_locale);
        const byLocale = localeMap[normalizedLocale];
        if (typeof byLocale === 'string' && byLocale.trim()) {
            return byLocale.trim();
        }

        const localeFallback = normalizedLocale.split('-')[0];
        const byFallback = localeMap[localeFallback];
        if (typeof byFallback === 'string' && byFallback.trim()) {
            return byFallback.trim();
        }

        return row.name || null;
    }

    ensureGiftCatalogSchema() {
        const columns = this.getTableColumns('gift_catalog');
        this.addColumnIfMissing('gift_catalog', columns, 'names_by_locale', 'TEXT');
    }

    getGiftCatalog(locale = null) {
        const stmt = this.db.prepare('SELECT * FROM gift_catalog ORDER BY diamond_count DESC');
        const rows = stmt.all();
        if (!locale) {
            return rows;
        }

        return rows.map(row => ({
            ...row,
            name: this._getGiftCatalogRowName(row, locale)
        }));
    }

    getGift(id, locale = null) {
        const stmt = this.db.prepare('SELECT * FROM gift_catalog WHERE id = ?');
        const row = stmt.get(id);
        if (!row) return null;
        if (!locale) return row;

        return {
            ...row,
            name: this._getGiftCatalogRowName(row, locale)
        };
    }

    updateGiftCatalog(gifts, locale = null) {
        if (!Array.isArray(gifts) || gifts.length === 0) {
            return 0;
        }

        const normalizedLocale = this.normalizeLocaleCode(locale);
        const isLocaleSpecific = normalizedLocale !== null;
        const upsertStmt = this.db.prepare(`
            INSERT INTO gift_catalog (id, name, image_url, diamond_count, last_updated, names_by_locale)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, COALESCE((SELECT names_by_locale FROM gift_catalog WHERE id = ?), NULL))
            ON CONFLICT(id) DO UPDATE SET
                name = CASE WHEN ? IS NULL THEN excluded.name ELSE gift_catalog.name END,
                image_url = excluded.image_url,
                diamond_count = excluded.diamond_count,
                last_updated = CURRENT_TIMESTAMP,
                names_by_locale = COALESCE(excluded.names_by_locale, gift_catalog.names_by_locale)
        `);
        const localeStmt = this.db.prepare('SELECT names_by_locale FROM gift_catalog WHERE id = ?');
        const setLocaleStmt = this.db.prepare('UPDATE gift_catalog SET names_by_locale = ? WHERE id = ?');

        const normalizeGiftValue = (gift) => {
            if (!gift || typeof gift !== 'object') return null;

            const id = Number(gift.id ?? gift.giftId ?? gift.gift_id);
            const name = gift.name ?? gift.giftName ?? gift.gift_name;
            if (!Number.isFinite(id) || id <= 0 || !name) {
                return null;
            }

            const diamondCount = Number(gift.diamond_count ?? gift.diamondCount ?? gift.diamonds ?? 0);
            return {
                id,
                name: String(name),
                imageUrl: gift.image_url || gift.imageUrl || gift.giftPictureUrl || gift.image?.url_list?.[0] || null,
                diamondCount: Number.isFinite(diamondCount) ? diamondCount : 0
            };
        };

        const updateLocaleName = (id, name) => {
            if (!normalizedLocale) {
                return;
            }

            const existing = localeStmt.get(id);
            const namesByLocale = this._parseLocalizedGiftNames(existing ? existing.names_by_locale : null);
            if (namesByLocale[normalizedLocale] === name) {
                return;
            }

            namesByLocale[normalizedLocale] = name;
            setLocaleStmt.run(JSON.stringify(namesByLocale), id);
        };

        const transaction = this.db.transaction((giftsArray) => {
            let savedCount = 0;

            for (const gift of giftsArray) {
                const normalizedGift = normalizeGiftValue(gift);
                if (!normalizedGift) continue;

                upsertStmt.run(
                    normalizedGift.id,
                    normalizedGift.name,
                    normalizedGift.imageUrl,
                    normalizedGift.diamondCount,
                    normalizedGift.id,
                    isLocaleSpecific ? normalizedLocale : null
                );

                if (normalizedLocale) {
                    updateLocaleName(normalizedGift.id, normalizedGift.name);
                }

                savedCount++;
            }

            return savedCount;
        });

        return transaction(gifts);
    }

    clearGiftCatalog() {
        const stmt = this.db.prepare('DELETE FROM gift_catalog');
        stmt.run();
    }

    getCatalogLastUpdate() {
        const stmt = this.db.prepare('SELECT MAX(last_updated) as last_update FROM gift_catalog');
        const result = stmt.get();
        return result ? result.last_update : null;
    }

    // ========== GIFT WEATHER MAPPINGS ==========
    getGiftWeatherMapping(giftId) {
        const stmt = this.db.prepare('SELECT * FROM gift_weather_mappings WHERE gift_id = ?');
        const row = stmt.get(giftId);
        return row ? { ...row, enabled: Boolean(row.enabled) } : null;
    }

    getAllGiftWeatherMappings() {
        const stmt = this.db.prepare(`
            SELECT gwm.*, gc.name as gift_name, gc.diamond_count, gc.image_url
            FROM gift_weather_mappings gwm
            LEFT JOIN gift_catalog gc ON gwm.gift_id = gc.id
            ORDER BY gc.diamond_count DESC
        `);
        const rows = stmt.all();
        return rows.map(row => ({ ...row, enabled: Boolean(row.enabled) }));
    }

    setGiftWeatherMapping(giftId, weatherEffect, intensity = 0.5, duration = 10000, enabled = true) {
        const stmt = this.db.prepare(`
            INSERT INTO gift_weather_mappings (gift_id, weather_effect, intensity, duration, enabled, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(gift_id) DO UPDATE SET
                weather_effect = excluded.weather_effect,
                intensity = excluded.intensity,
                duration = excluded.duration,
                enabled = excluded.enabled,
                updated_at = CURRENT_TIMESTAMP
        `);
        return stmt.run(giftId, weatherEffect, intensity, duration, enabled ? 1 : 0);
    }

    deleteGiftWeatherMapping(giftId) {
        const stmt = this.db.prepare('DELETE FROM gift_weather_mappings WHERE gift_id = ?');
        return stmt.run(giftId);
    }

    clearGiftWeatherMappings() {
        const stmt = this.db.prepare('DELETE FROM gift_weather_mappings');
        return stmt.run();
    }

    // ========== HUD ELEMENTS ==========
    getHudElement(elementId) {
        const stmt = this.db.prepare('SELECT * FROM hud_elements WHERE element_id = ?');
        const row = stmt.get(elementId);
        return row ? { ...row, enabled: Boolean(row.enabled) } : null;
    }

    getAllHudElements() {
        const stmt = this.db.prepare('SELECT * FROM hud_elements ORDER BY element_id');
        const rows = stmt.all();
        return rows.map(row => ({ ...row, enabled: Boolean(row.enabled) }));
    }

    setHudElement(elementId, config) {
        const stmt = this.db.prepare(`
            INSERT INTO hud_elements (element_id, enabled, position_x, position_y, position_unit, width, height, anchor, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(element_id) DO UPDATE SET
                enabled = excluded.enabled,
                position_x = excluded.position_x,
                position_y = excluded.position_y,
                position_unit = excluded.position_unit,
                width = excluded.width,
                height = excluded.height,
                anchor = excluded.anchor,
                updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(
            elementId,
            config.enabled ? 1 : 0,
            config.position_x,
            config.position_y,
            config.position_unit || 'px',
            config.width || 0,
            config.height || 0,
            config.anchor || 'top-left'
        );
    }

    updateHudElementPosition(elementId, positionX, positionY, unit = 'px', anchor = 'top-left') {
        const stmt = this.db.prepare(`
            UPDATE hud_elements
            SET position_x = ?, position_y = ?, position_unit = ?, anchor = ?, updated_at = CURRENT_TIMESTAMP
            WHERE element_id = ?
        `);
        stmt.run(positionX, positionY, unit, anchor, elementId);
    }

    updateHudElementSize(elementId, width, height) {
        const stmt = this.db.prepare(`
            UPDATE hud_elements
            SET width = ?, height = ?, updated_at = CURRENT_TIMESTAMP
            WHERE element_id = ?
        `);
        stmt.run(width, height, elementId);
    }

    toggleHudElement(elementId, enabled) {
        const stmt = this.db.prepare(`
            UPDATE hud_elements
            SET enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE element_id = ?
        `);
        stmt.run(enabled ? 1 : 0, elementId);
    }

    /**
     * Initialize default Emoji Rain configuration
     */
    initializeEmojiRainDefaults() {
        try {
            console.log('🔧 [DATABASE] initializeEmojiRainDefaults() called');

        const defaultConfig = {
            // OBS HUD Settings
            obs_hud_enabled: true,
            obs_hud_width: 1920,
            obs_hud_height: 1080,
            enable_glow: true,
            enable_particles: true,
            enable_depth: true,
            target_fps: 60,
            visual_mode: 'pupcid_balanced',
            pupcid_defaults_version: 2,

            // Emoji Set
            emoji_set: ["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"],

            // Custom Images
            use_custom_images: false,
            image_urls: [],

            // Effect
            effect: 'bounce', // 'bounce' | 'bubble' | 'none'

            // Toaster Mode (Low-End PC Mode)
            toaster_mode: false, // Reduces resource usage for weak PCs

            // Physics Settings
            physics_gravity_y: 0.88,
            physics_air: 0.028,
            physics_friction: 0.11,
            physics_restitution: 0.62,
            physics_wind_strength: 0.0005,
            physics_wind_variation: 0.0003,

            // Wind Simulation
            wind_enabled: false,
            wind_strength: 50,
            wind_direction: 'auto',

            // Bounce Physics
            floor_enabled: true,
            bounce_enabled: true,
            bounce_height: 0.62,
            bounce_damping: 0.15,

            // Color Theme
            color_mode: 'cool',
            color_intensity: 0.4,

            // Rainbow Mode
            rainbow_enabled: false,
            rainbow_speed: 1.0,

            // Pixel Mode
            pixel_enabled: false,
            pixel_size: 4,

            // SuperFan Burst
            superfan_burst_enabled: true,
            superfan_burst_intensity: 3.8,
            superfan_burst_duration: 2000,

            // FPS Optimization
            fps_optimization_enabled: true,
            fps_sensitivity: 0.8,

            // Appearance Settings
            emoji_min_size_px: 38,
            emoji_max_size_px: 80,
            emoji_rotation_speed: 0.035,
            emoji_lifetime_ms: 7600,
            emoji_fade_duration_ms: 1100,
            max_emojis_on_screen: 170,

            // Rate Limiting Queue
            rate_limit_enabled: true,
            rate_limit_emojis_per_second: 24,

            // Scaling Rules
            like_count_divisor: 22,
            like_min_emojis: 1,
            like_max_emojis: 10,
            gift_base_emojis: 4,
            gift_coin_multiplier: 0.08,
            gift_max_emojis: 36,

            // Gift ball overlay defaults
            gift_balls_enabled: false,
            gift_ball_min_size_px: 44,
            gift_ball_max_size_px: 128,
            gift_ball_price_reference_coins: 1000,
            gift_ball_min_despawn_ms: 9000,
            gift_ball_max_despawn_ms: 20000,
            gift_ball_despawn_per_coin_ms: 25,
            gift_ball_despawn_multiplier: 1,
            gift_ball_base_count: 1,
            gift_ball_series_count_divisor: 3,
            gift_ball_max_count: 24,
            // Gift ball price-tier sizing (cheaper gift = smaller ball).
            // The first matching tier (largest upper-bound >= price) wins.
            gift_ball_tier_thresholds_enabled: false,
            gift_ball_tier_size_1: 44,    // price 1-30      (cheap roses, hearts, etc.)
            gift_ball_tier_size_2: 80,    // price 31-100    (small gifts)
            gift_ball_tier_size_3: 150,   // price 101-500   (mid gifts)
            gift_ball_tier_size_4: 300,   // price 501-1000  (premium gifts)
            gift_ball_tier_size_5: 700,   // price 1001-5000 (whales)
            gift_ball_tier_size_6: 5000,  // price >5000     (mythical — fills the screen)

            // Herzballons for like events
            heart_balloons_enabled: true,
            heart_balloon_like_divisor: 1,
            heart_balloon_min_hearts: 5,
            heart_balloon_max_hearts: 16,
            heart_balloon_profile_every: 5,
            heart_balloon_pop_y: 0.5,
            heart_balloon_wind_strength: 0.45,
            heart_balloon_test_count: 8,

            // Sticker Rain Feature
            sticker_enabled: true,
            sticker_base_count: 5,
            sticker_fan_level_multiplier: 3,
            sticker_max_count: 30,
            sticker_user_cooldown_ms: 10000, // 10 seconds for regular users
            sticker_superfan_cooldown_ms: 5000, // 5 seconds for SuperFans
            sticker_superfan_burst_enabled: true
        };

        // Check if row exists
        const checkStmt = this.db.prepare('SELECT * FROM emoji_rain_config WHERE id = 1');
        const existing = checkStmt.get();

        console.log('🔍 [DATABASE] Existing config:', existing ? 'found' : 'not found');

        if (existing) {
            // Config exists - preserve user settings and only add missing fields
            console.log('🔄 [DATABASE] Checking existing config for missing fields...');
            try {
                const oldConfig = JSON.parse(existing.config_json);
                const applyPupCidDefaults = oldConfig.pupcid_defaults_version === undefined;
                const useTunedDefault = (field, legacyValue) => (
                    oldConfig[field] === undefined ||
                    (applyPupCidDefaults && oldConfig[field] === legacyValue)
                );
                const pupCidDefaultMigration = applyPupCidDefaults ? {
                    visual_mode: defaultConfig.visual_mode,
                    pupcid_defaults_version: defaultConfig.pupcid_defaults_version,
                    ...(useTunedDefault('physics_gravity_y', 1.0) && { physics_gravity_y: defaultConfig.physics_gravity_y }),
                    ...(useTunedDefault('physics_air', 0.02) && { physics_air: defaultConfig.physics_air }),
                    ...(useTunedDefault('physics_friction', 0.1) && { physics_friction: defaultConfig.physics_friction }),
                    ...(useTunedDefault('physics_restitution', 0.6) && { physics_restitution: defaultConfig.physics_restitution }),
                    ...(useTunedDefault('bounce_height', 0.6) && { bounce_height: defaultConfig.bounce_height }),
                    ...(useTunedDefault('bounce_damping', 0.1) && { bounce_damping: defaultConfig.bounce_damping }),
                    ...(useTunedDefault('color_mode', 'off') && { color_mode: defaultConfig.color_mode }),
                    ...(useTunedDefault('color_intensity', 0.5) && { color_intensity: defaultConfig.color_intensity }),
                    ...(useTunedDefault('emoji_min_size_px', 40) && oldConfig.size_min_px === undefined && { emoji_min_size_px: defaultConfig.emoji_min_size_px }),
                    ...(useTunedDefault('emoji_max_size_px', 80) && oldConfig.size_max_px === undefined && { emoji_max_size_px: defaultConfig.emoji_max_size_px }),
                    ...(useTunedDefault('emoji_rotation_speed', 0.05) && { emoji_rotation_speed: defaultConfig.emoji_rotation_speed }),
                    ...(useTunedDefault('emoji_lifetime_ms', 8000) && oldConfig.drop_despawn_s === undefined && { emoji_lifetime_ms: defaultConfig.emoji_lifetime_ms }),
                    ...(useTunedDefault('emoji_fade_duration_ms', 1000) && { emoji_fade_duration_ms: defaultConfig.emoji_fade_duration_ms }),
                    ...(useTunedDefault('max_emojis_on_screen', 200) && oldConfig.max_active === undefined && { max_emojis_on_screen: defaultConfig.max_emojis_on_screen }),
                    ...(useTunedDefault('rate_limit_enabled', false) && { rate_limit_enabled: defaultConfig.rate_limit_enabled }),
                    ...(useTunedDefault('rate_limit_emojis_per_second', 30) && { rate_limit_emojis_per_second: defaultConfig.rate_limit_emojis_per_second }),
                    ...(useTunedDefault('like_count_divisor', 10) && { like_count_divisor: defaultConfig.like_count_divisor }),
                    ...(useTunedDefault('like_max_emojis', 20) && { like_max_emojis: defaultConfig.like_max_emojis }),
                    ...(useTunedDefault('gift_base_emojis', 3) && { gift_base_emojis: defaultConfig.gift_base_emojis }),
                    ...(useTunedDefault('gift_coin_multiplier', 0.1) && { gift_coin_multiplier: defaultConfig.gift_coin_multiplier }),
                    ...(useTunedDefault('gift_max_emojis', 50) && { gift_max_emojis: defaultConfig.gift_max_emojis }),
                    ...(useTunedDefault('heart_balloon_like_divisor', 1) && { heart_balloon_like_divisor: defaultConfig.heart_balloon_like_divisor }),
                    ...(useTunedDefault('heart_balloon_max_hearts', 24) && { heart_balloon_max_hearts: defaultConfig.heart_balloon_max_hearts })
                } : {};
                console.log('🔍 [DATABASE] Old config keys:', Object.keys(oldConfig).join(', '));

                // Preserve all user settings and only add missing fields from defaults
                // User values take precedence over defaults
                const migratedConfig = {
                    ...defaultConfig,     // Start with defaults for any missing fields
                    ...oldConfig,         // Override with all existing user settings
                    // Map old field names to new ones if they exist and new ones don't
                    // Using !== undefined to handle falsy values like 0 correctly
                    ...(oldConfig.size_min_px !== undefined && oldConfig.emoji_min_size_px === undefined && { emoji_min_size_px: oldConfig.size_min_px }),
                    ...(oldConfig.size_max_px !== undefined && oldConfig.emoji_max_size_px === undefined && { emoji_max_size_px: oldConfig.size_max_px }),
                    ...(oldConfig.drop_despawn_s !== undefined && oldConfig.emoji_lifetime_ms === undefined && { emoji_lifetime_ms: oldConfig.drop_despawn_s * 1000 }),
                    ...(oldConfig.max_active !== undefined && oldConfig.max_emojis_on_screen === undefined && { max_emojis_on_screen: oldConfig.max_active }),
                    ...(oldConfig.physics_wind_force !== undefined && oldConfig.physics_wind_strength === undefined && { physics_wind_strength: oldConfig.physics_wind_force }),
                    ...pupCidDefaultMigration
                };

                const updateStmt = this.db.prepare(`
                    UPDATE emoji_rain_config
                    SET config_json = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                `);
                updateStmt.run(JSON.stringify(migratedConfig));
                console.log('✅ [DATABASE] Config updated with any missing fields');
                console.log('✅ [DATABASE] Config emoji_set:', migratedConfig.emoji_set);
            } catch (error) {
                console.error('❌ [DATABASE] Error updating emoji rain config:', error);
                console.error('Stack trace:', error.stack);
                // If update fails, keep existing config as-is (don't overwrite with defaults)
                console.log('⚠️ [DATABASE] Keeping existing config unchanged due to error');
            }
        } else {
            // Insert new default config
            console.log('➕ [DATABASE] Inserting new default config...');
            const stmt = this.db.prepare(`
                INSERT INTO emoji_rain_config (id, enabled, config_json)
                VALUES (1, 1, ?)
            `);
            stmt.run(JSON.stringify(defaultConfig));
            console.log('✅ [DATABASE] Default config inserted successfully');
            console.log('✅ [DATABASE] Default emoji_set:', defaultConfig.emoji_set);
        }
        } catch (error) {
            console.error('❌ [DATABASE] Error in initializeEmojiRainDefaults:', error);
            console.error('Stack trace:', error.stack);
            // Don't throw - allow app to continue
        }
    }

    /**
     * Get Emoji Rain configuration
     */
    getEmojiRainConfig() {
        // 500ms in-memory cache to prevent multiple DB reads within the same event tick
        const now = Date.now();
        if (this._emojiRainConfigCache && (now - this._emojiRainConfigCacheTs) < 500) {
            return this._emojiRainConfigCache;
        }

        console.log('🔍 [DATABASE] getEmojiRainConfig() called');
        const stmt = this.db.prepare('SELECT * FROM emoji_rain_config WHERE id = 1');
        const row = stmt.get();

        console.log('🔍 [DATABASE] Row retrieved:', row ? 'exists' : 'null');

        if (!row) {
            // Fallback: initialize and return
            console.log('⚠️ [DATABASE] No config found, initializing defaults...');
            this.initializeEmojiRainDefaults();
            return this.getEmojiRainConfig();
        }

        console.log('🔍 [DATABASE] row.enabled:', row.enabled);
        console.log('🔍 [DATABASE] row.config_json length:', row.config_json ? row.config_json.length : 0);

        // Return flat config object with enabled flag
        const configData = safeJsonParse(row.config_json, {});
        console.log('🔍 [DATABASE] Parsed config_json:', JSON.stringify(configData).substring(0, 200));
        console.log('🔍 [DATABASE] configData.emoji_set:', configData.emoji_set);
        console.log('🔍 [DATABASE] configData.emoji_set type:', typeof configData.emoji_set, Array.isArray(configData.emoji_set));

        const result = {
            enabled: Boolean(row.enabled),
            ...configData
        };

        console.log('✅ [DATABASE] Returning config with', Object.keys(result).length, 'keys');
        console.log('✅ [DATABASE] result.enabled:', result.enabled);
        console.log('✅ [DATABASE] result.emoji_set:', result.emoji_set);

        // Cache the result
        this._emojiRainConfigCache = result;
        this._emojiRainConfigCacheTs = now;

        return result;
    }

    /**
     * Update Emoji Rain configuration
     */
    updateEmojiRainConfig(config, enabled = null) {
        const current = this.getEmojiRainConfig();

        // Extract enabled from current config
        const { enabled: currentEnabled, ...currentConfigData } = current;

        // Determine new enabled state
        const newEnabled = enabled !== null ? (enabled ? 1 : 0) : (currentEnabled ? 1 : 0);

        // Merge configs (exclude 'enabled' from config object as it's stored separately)
        const { enabled: _, ...newConfigData } = config;
        const mergedConfig = { ...currentConfigData, ...newConfigData };

        const stmt = this.db.prepare(`
            UPDATE emoji_rain_config
            SET config_json = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(JSON.stringify(mergedConfig), newEnabled);

        // Invalidate cache after update
        this._emojiRainConfigCache = null;
        this._emojiRainConfigCacheTs = 0;

        return {
            enabled: Boolean(newEnabled),
            ...mergedConfig
        };
    }

    /**
     * Toggle Emoji Rain enabled state
     */
    toggleEmojiRain(enabled) {
        const stmt = this.db.prepare(`
            UPDATE emoji_rain_config
            SET enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(enabled ? 1 : 0);
    }

    // ========== PATCH: VDO.NINJA DEFAULT LAYOUTS ==========
    initializeDefaultVDONinjaLayouts() {
        try {
            const defaults = [
            {
                name: 'Grid 2x2',
                type: 'grid',
                config: JSON.stringify({
                    rows: 2,
                    cols: 2,
                    slots: [
                        { slot: 0, x: 0, y: 0, w: 50, h: 50 },
                        { slot: 1, x: 50, y: 0, w: 50, h: 50 },
                        { slot: 2, x: 0, y: 50, w: 50, h: 50 },
                        { slot: 3, x: 50, y: 50, w: 50, h: 50 }
                    ]
                })
            },
            {
                name: 'Grid 3x2',
                type: 'grid',
                config: JSON.stringify({
                    rows: 2,
                    cols: 3,
                    slots: [
                        { slot: 0, x: 0, y: 0, w: 33.33, h: 50 },
                        { slot: 1, x: 33.33, y: 0, w: 33.33, h: 50 },
                        { slot: 2, x: 66.66, y: 0, w: 33.33, h: 50 },
                        { slot: 3, x: 0, y: 50, w: 33.33, h: 50 },
                        { slot: 4, x: 33.33, y: 50, w: 33.33, h: 50 },
                        { slot: 5, x: 66.66, y: 50, w: 33.33, h: 50 }
                    ]
                })
            },
            {
                name: 'Solo',
                type: 'solo',
                config: JSON.stringify({
                    slots: [
                        { slot: 0, x: 0, y: 0, w: 100, h: 100 }
                    ]
                })
            },
            {
                name: 'PIP',
                type: 'pip',
                config: JSON.stringify({
                    slots: [
                        { slot: 0, x: 0, y: 0, w: 100, h: 100 },
                        { slot: 1, x: 75, y: 75, w: 20, h: 20 }
                    ]
                })
            }
        ];

        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO vdoninja_layouts (name, layout_type, layout_config)
            VALUES (?, ?, ?)
        `);

        for (const layout of defaults) {
            stmt.run(layout.name, layout.type, layout.config);
        }
        } catch (error) {
            console.error('❌ [DATABASE] Error in initializeDefaultVDONinjaLayouts:', error);
            console.error('Stack trace:', error.stack);
            // Don't throw - allow app to continue
        }
    }

    // ========== PATCH: VDO.NINJA ROOM METHODS ==========
    createVDONinjaRoom(roomName, roomId, password, maxGuests) {
        const stmt = this.db.prepare(`
            INSERT INTO vdoninja_rooms (room_name, room_id, password, max_guests, last_used)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        const info = stmt.run(roomName, roomId, password, maxGuests);
        return info.lastInsertRowid;
    }

    getVDONinjaRoom(roomId) {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_rooms WHERE room_id = ?');
        return stmt.get(roomId);
    }

    getAllVDONinjaRooms() {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_rooms ORDER BY last_used DESC');
        return stmt.all();
    }

    updateVDONinjaRoom(id, updates) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }

        values.push(id);

        const stmt = this.db.prepare(`
            UPDATE vdoninja_rooms
            SET ${fields.join(', ')}, last_used = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        stmt.run(...values);
    }

    deleteVDONinjaRoom(id) {
        const stmt = this.db.prepare('DELETE FROM vdoninja_rooms WHERE id = ?');
        stmt.run(id);
    }

    // ========== PATCH: VDO.NINJA GUEST METHODS ==========
    addGuest(roomId, slotNumber, streamId, guestName) {
        const stmt = this.db.prepare(`
            INSERT INTO vdoninja_guests (room_id, slot_number, stream_id, guest_name, is_connected, joined_at)
            VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        `);
        const info = stmt.run(roomId, slotNumber, streamId, guestName);
        return info.lastInsertRowid;
    }

    getGuest(id) {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_guests WHERE id = ?');
        return stmt.get(id);
    }

    getGuestsByRoom(roomId) {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_guests WHERE room_id = ? ORDER BY slot_number');
        return stmt.all(roomId);
    }

    updateGuestStatus(id, updates) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }

        values.push(id);

        const stmt = this.db.prepare(`
            UPDATE vdoninja_guests
            SET ${fields.join(', ')}
            WHERE id = ?
        `);
        stmt.run(...values);
    }

    removeGuest(id) {
        const stmt = this.db.prepare('DELETE FROM vdoninja_guests WHERE id = ?');
        stmt.run(id);
    }

    // ========== PATCH: VDO.NINJA LAYOUT METHODS ==========
    saveLayout(name, type, config, thumbnailUrl = null) {
        const stmt = this.db.prepare(`
            INSERT INTO vdoninja_layouts (name, layout_type, layout_config, thumbnail_url)
            VALUES (?, ?, ?, ?)
        `);
        const info = stmt.run(name, type, JSON.stringify(config), thumbnailUrl);
        return info.lastInsertRowid;
    }

    getLayout(id) {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_layouts WHERE id = ?');
        const row = stmt.get(id);
        if (!row) return null;
        return {
            ...row,
            layout_config: JSON.parse(row.layout_config)
        };
    }

    getAllLayouts() {
        const stmt = this.db.prepare('SELECT * FROM vdoninja_layouts ORDER BY created_at DESC');
        const rows = stmt.all();
        return rows.map(row => ({
            ...row,
            layout_config: JSON.parse(row.layout_config)
        }));
    }

    deleteLayout(id) {
        const stmt = this.db.prepare('DELETE FROM vdoninja_layouts WHERE id = ?');
        stmt.run(id);
    }

    // ========== PATCH: VDO.NINJA EVENT LOGGING ==========
    logGuestEvent(guestId, eventType, eventData) {
        const stmt = this.db.prepare(`
            INSERT INTO vdoninja_guest_events (guest_id, event_type, event_data)
            VALUES (?, ?, ?)
        `);
        stmt.run(guestId, eventType, JSON.stringify(eventData));
    }

    getGuestEventHistory(guestId, limit = 100) {
        const stmt = this.db.prepare(`
            SELECT * FROM vdoninja_guest_events
            WHERE guest_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `);
        const rows = stmt.all(guestId, limit);
        return rows.map(row => ({
            ...row,
            event_data: JSON.parse(row.event_data)
        }));
    }

    // ========== GIFT MILESTONE CELEBRATION METHODS ==========

    /**
     * Initialize default Milestone configuration
     */
    initializeMilestoneDefaults() {
        try {
            const defaultConfig = {
            enabled: 1,
            threshold: 1000,
            mode: 'auto_increment',
            increment_step: 1000,
            animation_gif_path: null,
            animation_video_path: null,
            animation_audio_path: null,
            audio_volume: 80,
            playback_mode: 'exclusive',
            animation_duration: 0,
            session_reset: 0
        };

        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO milestone_config (
                id, enabled, threshold, mode, increment_step,
                audio_volume, playback_mode, animation_duration, session_reset
            )
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            defaultConfig.enabled,
            defaultConfig.threshold,
            defaultConfig.mode,
            defaultConfig.increment_step,
            defaultConfig.audio_volume,
            defaultConfig.playback_mode,
            defaultConfig.animation_duration,
            defaultConfig.session_reset
        );

        // Initialize stats with default threshold
        const statsStmt = this.db.prepare(`
            INSERT OR IGNORE INTO milestone_stats (id, cumulative_coins, current_milestone)
            VALUES (1, 0, ?)
        `);
        statsStmt.run(defaultConfig.threshold);

        // Initialize default tiers if they don't exist
        const tierCheckStmt = this.db.prepare('SELECT COUNT(*) as count FROM milestone_tiers');
        const tierCount = tierCheckStmt.get();
        
        if (tierCount.count === 0) {
            const defaultTiers = [
                { name: 'Bronze', tier_level: 1, threshold: 1000, enabled: 1 },
                { name: 'Silver', tier_level: 2, threshold: 5000, enabled: 1 },
                { name: 'Gold', tier_level: 3, threshold: 10000, enabled: 1 },
                { name: 'Platinum', tier_level: 4, threshold: 25000, enabled: 1 },
                { name: 'Diamond', tier_level: 5, threshold: 50000, enabled: 1 }
            ];

            const tierInsertStmt = this.db.prepare(`
                INSERT INTO milestone_tiers (name, tier_level, threshold, enabled)
                VALUES (?, ?, ?, ?)
            `);

            for (const tier of defaultTiers) {
                tierInsertStmt.run(tier.name, tier.tier_level, tier.threshold, tier.enabled);
            }
        }
        } catch (error) {
            console.error('❌ [DATABASE] Error in initializeMilestoneDefaults:', error);
            console.error('Stack trace:', error.stack);
            // Don't throw - allow app to continue
        }
    }

    /**
     * Get Milestone configuration
     */
    getMilestoneConfig() {
        const stmt = this.db.prepare('SELECT * FROM milestone_config WHERE id = 1');
        const row = stmt.get();
        if (!row) return null;
        return {
            ...row,
            enabled: Boolean(row.enabled),
            session_reset: Boolean(row.session_reset)
        };
    }

    /**
     * Update Milestone configuration
     */
    updateMilestoneConfig(config) {
        const existing = this.getMilestoneConfig() || {};
        const hasValue = (key) => Object.prototype.hasOwnProperty.call(config, key);
        const value = (key, fallback) => hasValue(key) ? config[key] : (existing[key] ?? fallback);
        const boolValue = (key, fallback) => hasValue(key) ? config[key] : (existing[key] ?? fallback);

        const stmt = this.db.prepare(`
            UPDATE milestone_config
            SET enabled = ?,
                threshold = ?,
                mode = ?,
                increment_step = ?,
                animation_gif_path = ?,
                animation_video_path = ?,
                animation_audio_path = ?,
                audio_volume = ?,
                playback_mode = ?,
                animation_duration = ?,
                session_reset = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(
            boolValue('enabled', true) ? 1 : 0,
            value('threshold', 1000),
            value('mode', 'auto_increment'),
            value('increment_step', 1000),
            value('animation_gif_path', null),
            value('animation_video_path', null),
            value('animation_audio_path', null),
            value('audio_volume', 80),
            value('playback_mode', 'exclusive'),
            value('animation_duration', 0),
            boolValue('session_reset', false) ? 1 : 0
        );
    }

    /**
     * Toggle Milestone enabled/disabled
     */
    toggleMilestone(enabled) {
        const stmt = this.db.prepare(`
            UPDATE milestone_config
            SET enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(enabled ? 1 : 0);
    }

    /**
     * Get Milestone statistics
     */
    getMilestoneStats() {
        const stmt = this.db.prepare('SELECT * FROM milestone_stats WHERE id = 1');
        return stmt.get();
    }

    /**
     * Add coins to milestone tracker and check if milestone reached
     * @returns {object} { triggered: boolean, milestone: number, coins: number }
     */
    addCoinsToMilestone(coins) {
        const config = this.getMilestoneConfig();
        const stats = this.getMilestoneStats();

        if (!config || !config.enabled) {
            return { triggered: false, milestone: 0, coins: stats ? stats.cumulative_coins : 0 };
        }

        const previousCoins = stats.cumulative_coins || 0;
        const newCoins = previousCoins + coins;
        const currentMilestone = stats.current_milestone || config.threshold;

        let triggered = false;
        let newMilestone = currentMilestone;

        // Check if milestone reached
        if (previousCoins < currentMilestone && newCoins >= currentMilestone) {
            triggered = true;

            // Calculate next milestone based on mode
            if (config.mode === 'auto_increment') {
                const incrementStep = config.increment_step || config.threshold || 1000;
                newMilestone = currentMilestone + incrementStep;
                while (newMilestone <= newCoins) {
                    newMilestone += incrementStep;
                }
            } else {
                // Fixed mode - milestone stays the same
                newMilestone = currentMilestone;
            }

            // Update stats with trigger
            const updateStmt = this.db.prepare(`
                UPDATE milestone_stats
                SET cumulative_coins = ?,
                    current_milestone = ?,
                    last_trigger_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
            `);
            updateStmt.run(newCoins, newMilestone);
        } else {
            // Just update coins
            const updateStmt = this.db.prepare(`
                UPDATE milestone_stats
                SET cumulative_coins = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
            `);
            updateStmt.run(newCoins);
        }

        return {
            triggered: triggered,
            milestone: currentMilestone,
            coins: newCoins,
            nextMilestone: newMilestone
        };
    }

    /**
     * Reset milestone statistics (manual or session reset)
     */
    resetMilestoneStats() {
        const config = this.getMilestoneConfig();
        const stmt = this.db.prepare(`
            UPDATE milestone_stats
            SET cumulative_coins = 0,
                current_milestone = ?,
                session_start_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(config ? config.threshold : 1000);
    }

    /**
     * Update only the cumulative coins (without milestone check)
     */
    updateMilestoneCoins(coins) {
        const stmt = this.db.prepare(`
            UPDATE milestone_stats
            SET cumulative_coins = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `);
        stmt.run(coins);
    }

    /**
     * Get all milestone tiers
     */
    getMilestoneTiers() {
        const stmt = this.db.prepare('SELECT * FROM milestone_tiers ORDER BY tier_level ASC');
        return stmt.all();
    }

    /**
     * Get a specific milestone tier
     */
    getMilestoneTier(id) {
        const stmt = this.db.prepare('SELECT * FROM milestone_tiers WHERE id = ?');
        return stmt.get(id);
    }

    /**
     * Create or update a milestone tier
     */
    saveMilestoneTier(tier) {
        if (tier.id) {
            // Update existing tier
            const stmt = this.db.prepare(`
                UPDATE milestone_tiers
                SET name = ?, tier_level = ?, threshold = ?,
                    animation_gif_path = ?, animation_video_path = ?, animation_audio_path = ?,
                    enabled = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            stmt.run(tier.name, tier.tier_level, tier.threshold,
                tier.animation_gif_path, tier.animation_video_path, tier.animation_audio_path,
                tier.enabled, tier.id);
            return tier.id;
        } else {
            // Create new tier
            const stmt = this.db.prepare(`
                INSERT INTO milestone_tiers (name, tier_level, threshold, animation_gif_path,
                    animation_video_path, animation_audio_path, enabled)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(tier.name, tier.tier_level, tier.threshold,
                tier.animation_gif_path || null, tier.animation_video_path || null,
                tier.animation_audio_path || null, tier.enabled !== false ? 1 : 0);
            return result.lastInsertRowid;
        }
    }

    /**
     * Delete a milestone tier
     */
    deleteMilestoneTier(id) {
        const stmt = this.db.prepare('DELETE FROM milestone_tiers WHERE id = ?');
        stmt.run(id);
    }

    /**
     * Get user milestone stats
     */
    getUserMilestoneStats(userId, streamerId = null) {
        const sid = streamerId || this.streamerId || 'default';
        const stmt = this.db.prepare('SELECT * FROM milestone_user_stats WHERE user_id = ? AND streamer_id = ?');
        return stmt.get(userId, sid);
    }

    /**
     * Get all user milestone stats for current streamer
     */
    getAllUserMilestoneStats(streamerId = null) {
        const sid = streamerId || this.streamerId || 'default';
        const stmt = this.db.prepare('SELECT * FROM milestone_user_stats WHERE streamer_id = ? ORDER BY cumulative_coins DESC');
        return stmt.all(sid);
    }

    /**
     * Add coins to a specific user's milestone tracker
     */
    addCoinsToUserMilestone(userId, username, coins, streamerId = null) {
        const sid = streamerId || this.streamerId || 'default';
        
        // Get or create user stats
        let userStats = this.getUserMilestoneStats(userId, sid);
        
        if (!userStats) {
            // Create new user stats with initial coins
            const insertStmt = this.db.prepare(`
                INSERT INTO milestone_user_stats (user_id, streamer_id, username, cumulative_coins)
                VALUES (?, ?, ?, 0)
            `);
            insertStmt.run(userId, sid, username);
            userStats = { user_id: userId, streamer_id: sid, username, cumulative_coins: 0, current_milestone: 0, last_tier_reached: 0 };
        }

        const previousCoins = userStats.cumulative_coins || 0;
        const newCoins = previousCoins + coins;

        // Get all enabled tiers
        const tiers = this.getMilestoneTiers().filter(t => t.enabled);
        
        // Find all tiers that were reached with this gift
        const triggeredTiers = [];
        const lastReachedLevel = userStats.last_tier_reached || 0;

        for (const tier of tiers) {
            if (previousCoins < tier.threshold && newCoins >= tier.threshold && tier.tier_level > lastReachedLevel) {
                triggeredTiers.push(tier);
            }
        }

        // Get the highest tier reached
        const triggeredTier = triggeredTiers.length > 0 
            ? triggeredTiers.reduce((max, tier) => tier.tier_level > max.tier_level ? tier : max)
            : null;
        const newTierLevel = triggeredTier ? triggeredTier.tier_level : lastReachedLevel;

        // Update user stats
        let updateStmt;
        if (triggeredTier) {
            updateStmt = this.db.prepare(`
                UPDATE milestone_user_stats
                SET cumulative_coins = ?,
                    last_tier_reached = ?,
                    last_trigger_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND streamer_id = ?
            `);
            updateStmt.run(newCoins, newTierLevel, userId, sid);
        } else {
            updateStmt = this.db.prepare(`
                UPDATE milestone_user_stats
                SET cumulative_coins = ?,
                    last_tier_reached = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND streamer_id = ?
            `);
            updateStmt.run(newCoins, newTierLevel, userId, sid);
        }

        return {
            triggered: triggeredTiers.length > 0,
            tier: triggeredTier,
            triggeredTiers: triggeredTiers,  // Return all tiers for multi-tier celebrations
            coins: newCoins,
            userId,
            username
        };
    }

    /**
     * Reset all user milestone stats for current streamer
     */
    resetAllUserMilestoneStats(streamerId = null) {
        const sid = streamerId || this.streamerId || 'default';
        const stmt = this.db.prepare('DELETE FROM milestone_user_stats WHERE streamer_id = ?');
        stmt.run(sid);
    }

    /**
     * Reset a specific user's milestone stats
     */
    resetUserMilestoneStats(userId, streamerId = null) {
        const sid = streamerId || this.streamerId || 'default';
        const stmt = this.db.prepare('DELETE FROM milestone_user_stats WHERE user_id = ? AND streamer_id = ?');
        stmt.run(userId, sid);
    }

    /**
     * Shared User Statistics Methods
     * These methods provide a centralized way to track user statistics across plugins
     */
    
    /**
     * Get or create user statistics
     */
    getUserStatistics(userId, streamerId = null) {
        const sid = streamerId || this.streamerId || 'default';
        const stmt = this.db.prepare('SELECT * FROM user_statistics WHERE user_id = ? AND streamer_id = ?');
        return stmt.get(userId, sid);
    }

    /**
     * Get all user statistics ordered by total coins
     */
    getAllUserStatistics(limit = 100, minCoins = 0, streamerId = null) {
        const sid = streamerId || this.streamerId || 'default';
        const stmt = this.db.prepare(`
            SELECT * FROM user_statistics 
            WHERE streamer_id = ? AND total_coins_sent >= ? 
            ORDER BY total_coins_sent DESC 
            LIMIT ?
        `);
        return stmt.all(sid, minCoins, limit);
    }

    /**
     * Update user statistics (used by gift, comment, like, share, follow events)
     */
    updateUserStatistics(userId, username, updates, streamerId = null) {
        const sid = streamerId || this.streamerId || 'default';
        
        // Get existing stats or create new entry
        let existing = this.getUserStatistics(userId, sid);
        
        if (!existing) {
            // Create new entry - use CASE for conditional timestamp
            const insertStmt = this.db.prepare(`
                INSERT INTO user_statistics (
                    user_id, streamer_id, username, unique_id, profile_picture_url,
                    total_coins_sent, total_gifts_sent, total_comments,
                    total_likes, total_shares, total_follows,
                    first_seen_at, last_seen_at, last_gift_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CASE WHEN ? > 0 THEN CURRENT_TIMESTAMP ELSE NULL END)
            `);
            
            insertStmt.run(
                userId,
                sid,
                username || 'Unknown',
                updates.uniqueId || null,
                updates.profilePictureUrl || null,
                updates.coins || 0,
                updates.gifts || 0,
                updates.comments || 0,
                updates.likes || 0,
                updates.shares || 0,
                updates.follows || 0,
                updates.coins || 0
            );
        } else {
            // Update existing entry
            const updateStmt = this.db.prepare(`
                UPDATE user_statistics 
                SET 
                    username = ?,
                    unique_id = COALESCE(?, unique_id),
                    profile_picture_url = COALESCE(?, profile_picture_url),
                    total_coins_sent = total_coins_sent + ?,
                    total_gifts_sent = total_gifts_sent + ?,
                    total_comments = total_comments + ?,
                    total_likes = total_likes + ?,
                    total_shares = total_shares + ?,
                    total_follows = total_follows + ?,
                    last_seen_at = CURRENT_TIMESTAMP,
                    last_gift_at = CASE WHEN ? > 0 THEN CURRENT_TIMESTAMP ELSE last_gift_at END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND streamer_id = ?
            `);
            
            updateStmt.run(
                username || existing.username,
                updates.uniqueId || null,
                updates.profilePictureUrl || null,
                updates.coins || 0,
                updates.gifts || 0,
                updates.comments || 0,
                updates.likes || 0,
                updates.shares || 0,
                updates.follows || 0,
                updates.coins || 0,
                userId,
                sid
            );
        }
        
        return this.getUserStatistics(userId, sid);
    }

    /**
     * Add coins to user statistics (convenience method for gift events)
     */
    addCoinsToUserStats(userId, username, uniqueId, profilePictureUrl, coins, streamerId = null) {
        return this.updateUserStatistics(userId, username, {
            uniqueId,
            profilePictureUrl,
            coins,
            gifts: 1
        }, streamerId);
    }

    /**
     * Reset user statistics (for testing or admin purposes)
     */
    resetUserStatistics(userId, streamerId = null) {
        const sid = streamerId || this.streamerId || 'default';
        const stmt = this.db.prepare('DELETE FROM user_statistics WHERE user_id = ? AND streamer_id = ?');
        stmt.run(userId, sid);
    }

    /**
     * Reset all user statistics for current streamer
     */
    resetAllUserStatistics(streamerId = null) {
        const sid = streamerId || this.streamerId || 'default';
        const stmt = this.db.prepare('DELETE FROM user_statistics WHERE streamer_id = ?');
        stmt.run(sid);
    }

    /**
     * Expose prepare() method for other modules (subscription-tiers, leaderboard)
     */
    prepare(sql) {
        return this.db.prepare(sql);
    }

    /**
     * Expose exec() method for other modules
     */
    exec(sql) {
        return this.db.exec(sql);
    }

    /**
     * Stream Statistics Methods - Persistent storage of stream-level stats
     * These methods allow stream stats (viewers, likes, coins, etc.) to be
     * persisted across server restarts and kept isolated per profile
     */

    /**
     * Save stream statistics to database
     * @param {Object} stats - Stats object containing viewers, likes, totalCoins, etc.
     */
    saveStreamStats(stats) {
        const stmt = this.db.prepare(`
            INSERT INTO stream_stats (
                id, viewers, likes, total_coins, followers, shares, gifts,
                username, room_id, stream_start_time, updated_at
            )
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                viewers = excluded.viewers,
                likes = excluded.likes,
                total_coins = excluded.total_coins,
                followers = excluded.followers,
                shares = excluded.shares,
                gifts = excluded.gifts,
                username = COALESCE(excluded.username, stream_stats.username),
                room_id = COALESCE(excluded.room_id, stream_stats.room_id),
                stream_start_time = COALESCE(excluded.stream_start_time, stream_stats.stream_start_time),
                updated_at = excluded.updated_at
        `);
        
        stmt.run(
            stats.viewers || 0,
            stats.likes || 0,
            stats.totalCoins || 0,
            stats.followers || 0,
            stats.shares || 0,
            stats.gifts || 0,
            stats.username || null,
            stats.roomId || null,
            stats.streamStartTime !== null &&
            stats.streamStartTime !== undefined &&
            Number.isFinite(Number(stats.streamStartTime))
                ? Number(stats.streamStartTime)
                : null
        );
    }

    /**
     * Load stream statistics from database
     * @returns {Object} Stats object or null if no stats exist
     */
    loadStreamStats() {
        const stmt = this.db.prepare('SELECT * FROM stream_stats WHERE id = 1');
        const row = stmt.get();
        
        if (!row) {
            return null;
        }
        
        return {
            viewers: row.viewers || 0,
            likes: row.likes || 0,
            totalCoins: row.total_coins || 0,
            followers: row.followers || 0,
            shares: row.shares || 0,
            gifts: row.gifts || 0,
            username: row.username || null,
            roomId: row.room_id || null,
            streamStartTime: row.stream_start_time !== null &&
                row.stream_start_time !== undefined &&
                Number.isFinite(Number(row.stream_start_time))
                ? Number(row.stream_start_time)
                : null,
            updatedAt: row.updated_at
        };
    }

    /**
     * Reset stream statistics to zero
     */
    resetStreamStats(session = {}) {
        const stmt = this.db.prepare(`
            INSERT INTO stream_stats (
                id, viewers, likes, total_coins, followers, shares, gifts,
                username, room_id, stream_start_time, updated_at
            )
            VALUES (1, 0, 0, 0, 0, 0, 0, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                viewers = 0,
                likes = 0,
                total_coins = 0,
                followers = 0,
                shares = 0,
                gifts = 0,
                username = excluded.username,
                room_id = excluded.room_id,
                stream_start_time = excluded.stream_start_time,
                updated_at = datetime('now')
        `);
        stmt.run(
            session.username || null,
            session.roomId || null,
            session.streamStartTime !== null &&
            session.streamStartTime !== undefined &&
            Number.isFinite(Number(session.streamStartTime))
                ? Number(session.streamStartTime)
                : null
        );
    }

    close() {
        if (this.isClosed || !this.db) {
            return;
        }

        this.isClosing = true;

        if (this.eventBatchTimer) {
            clearTimeout(this.eventBatchTimer);
            this.eventBatchTimer = null;
        }

        if (this.eventBatchQueue.length > 0 && this._isDbOpen()) {
            const flushPromise = this.flushEventBatch();
            if (flushPromise && typeof flushPromise.catch === 'function') {
                flushPromise.catch((error) => {
                    console.error('[Database] Error flushing events during close:', error);
                });
            }
        }

        if (this.db.open) {
            this.db.close();
        }

        this.isClosed = true;
    }
}

module.exports = DatabaseManager;
