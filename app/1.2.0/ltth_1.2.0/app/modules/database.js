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
            
            // Test database integrity
            try {
                this.db.pragma('integrity_check');
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

        // Flag für Shutdown-Handler (verhindert doppelte Registrierung)
        this.shutdownHandlersRegistered = false;

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

            try {
                // Flush mit Timeout-Schutz
                await Promise.race([
                    this.flushEventBatch(),
                    new Promise(resolve => setTimeout(resolve, 3000))
                ]);
                this.db.close();
            } catch (error) {
                console.error('Error during graceful shutdown:', error);
            }
        };

        process.once('SIGINT', gracefulShutdown);
        process.once('SIGTERM', gracefulShutdown);
        process.once('exit', gracefulShutdown);

        DatabaseManager.shutdownHandlersRegistered = true;
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

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

        // Migration: Add streamer_id to user_statistics for scoped user profiles
        try {
            const userStatsTableInfo = this.db.prepare("PRAGMA table_info(user_statistics)").all();
            const hasStreamerId = userStatsTableInfo.some(col => col.name === 'streamer_id');
            
            if (!hasStreamerId) {
                console.log('Running migration: Adding streamer_id to user_statistics table for scoped profiles');
                
                // Create new table with streamer_id
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
                
                // Migrate existing data with default streamer_id
                const defaultStreamerId = this.streamerId || 'default';
                this.db.exec(`
                    INSERT INTO user_statistics_new 
                    SELECT user_id, '${defaultStreamerId}' as streamer_id, username, unique_id, 
                           profile_picture_url, total_coins_sent, total_gifts_sent, 
                           total_comments, total_likes, total_shares, total_follows,
                           first_seen_at, last_seen_at, last_gift_at, created_at, updated_at
                    FROM user_statistics
                `);
                
                // Drop old table and rename new one
                this.db.exec('DROP TABLE user_statistics');
                this.db.exec('ALTER TABLE user_statistics_new RENAME TO user_statistics');
                
                // Recreate indexes
                this.db.exec(`
                    CREATE INDEX IF NOT EXISTS idx_user_stats_coins 
                    ON user_statistics(streamer_id, total_coins_sent DESC)
                `);
                this.db.exec(`
                    CREATE INDEX IF NOT EXISTS idx_user_stats_username 
                    ON user_statistics(streamer_id, username)
                `);
                
                console.log('Migration completed: user_statistics now scoped by streamer_id');
            }
        } catch (error) {
            console.error('Migration error for user_statistics:', error);
        }

        // Migration: Add streamer_id to milestone_user_stats
        try {
            const milestoneTableInfo = this.db.prepare("PRAGMA table_info(milestone_user_stats)").all();
            const hasStreamerId = milestoneTableInfo.some(col => col.name === 'streamer_id');
            
            if (!hasStreamerId) {
                console.log('Running migration: Adding streamer_id to milestone_user_stats table');
                
                // Create new table with streamer_id
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
                
                // Migrate existing data
                const defaultStreamerId = this.streamerId || 'default';
                this.db.exec(`
                    INSERT INTO milestone_user_stats_new 
                    SELECT id, user_id, '${defaultStreamerId}' as streamer_id, username, 
                           cumulative_coins, current_milestone, last_tier_reached,
                           last_trigger_at, created_at, updated_at
                    FROM milestone_user_stats
                `);
                
                // Drop old table and rename
                this.db.exec('DROP TABLE milestone_user_stats');
                this.db.exec('ALTER TABLE milestone_user_stats_new RENAME TO milestone_user_stats');
                
                console.log('Migration completed: milestone_user_stats now scoped by streamer_id');
            }
        } catch (error) {
            console.error('Migration error for milestone_user_stats:', error);
        }
    }

    setDefaultSettings() {
        const defaults = {
            'alert_gift_min_coins': '100',
            'theme': 'dark',
            // Quick Actions Einstellungen
            'tts_enabled': 'true',
            'soundboard_enabled': 'true',
            'flows_enabled': 'false',
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

        const stmt = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(defaults)) {
            stmt.run(key, value);
        }

        // Standard HUD-Element Positionen initialisieren
        this.initializeDefaultHudElements();
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

    // ========== FLOWS ==========
    getFlows() {
        const stmt = this.db.prepare('SELECT * FROM flows ORDER BY created_at DESC');
        const rows = stmt.all();
        return rows.map(row => ({
            ...row,
            trigger_condition: row.trigger_condition ? safeJsonParse(row.trigger_condition, null) : null,
            actions: safeJsonParse(row.actions, []),
            enabled: Boolean(row.enabled)
        }));
    }

    getFlow(id) {
        const stmt = this.db.prepare('SELECT * FROM flows WHERE id = ?');
        const row = stmt.get(id);
        if (!row) return null;
        return {
            ...row,
            trigger_condition: row.trigger_condition ? safeJsonParse(row.trigger_condition, null) : null,
            actions: safeJsonParse(row.actions, []),
            enabled: Boolean(row.enabled)
        };
    }

    getEnabledFlows() {
        const stmt = this.db.prepare('SELECT * FROM flows WHERE enabled = 1 ORDER BY created_at ASC');
        const rows = stmt.all();
        return rows.map(row => ({
            ...row,
            trigger_condition: row.trigger_condition ? safeJsonParse(row.trigger_condition, null) : null,
            actions: safeJsonParse(row.actions, []),
            enabled: Boolean(row.enabled)
        }));
    }

    createFlow(flow) {
        const stmt = this.db.prepare(`
            INSERT INTO flows (name, trigger_type, trigger_condition, actions, enabled)
            VALUES (?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
            flow.name,
            flow.trigger_type,
            flow.trigger_condition ? JSON.stringify(flow.trigger_condition) : null,
            JSON.stringify(flow.actions),
            flow.enabled ? 1 : 0
        );
        return info.lastInsertRowid;
    }

    updateFlow(id, flow) {
        const stmt = this.db.prepare(`
            UPDATE flows
            SET name = ?, trigger_type = ?, trigger_condition = ?, actions = ?, enabled = ?
            WHERE id = ?
        `);
        stmt.run(
            flow.name,
            flow.trigger_type,
            flow.trigger_condition ? JSON.stringify(flow.trigger_condition) : null,
            JSON.stringify(flow.actions),
            flow.enabled ? 1 : 0,
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
        // Add to batch queue
        this.eventBatchQueue.push({
            eventType,
            username,
            data: JSON.stringify(data)
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
                this.flushEventBatch();
            }, this.eventBatchTimeout);
        }
    }

    flushEventBatch() {
        if (this.eventBatchQueue.length === 0) {
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
                this.eventBatchQueue.unshift(...eventsToFlush);
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
        // Use timestamp for reliable chronological cleanup (not id which may have gaps)
        const thresholdStmt = this.db.prepare(`
            SELECT timestamp FROM event_logs 
            ORDER BY timestamp DESC 
            LIMIT 1 OFFSET ?
        `);
        const threshold = thresholdStmt.get(keepCount - 1);
        
        if (!threshold) {
            // Less than keepCount entries, nothing to delete
            return 0;
        }
        
        const deleteStmt = this.db.prepare('DELETE FROM event_logs WHERE timestamp < ?');
        const result = deleteStmt.run(threshold.timestamp);
        return result.changes;
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
    getGiftCatalog() {
        const stmt = this.db.prepare('SELECT * FROM gift_catalog ORDER BY diamond_count DESC');
        return stmt.all();
    }

    getGift(id) {
        const stmt = this.db.prepare('SELECT * FROM gift_catalog WHERE id = ?');
        return stmt.get(id);
    }

    updateGiftCatalog(gifts) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO gift_catalog (id, name, image_url, diamond_count, last_updated)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        const transaction = this.db.transaction((giftsArray) => {
            for (const gift of giftsArray) {
                stmt.run(gift.id, gift.name, gift.image_url || null, gift.diamond_count || 0);
            }
        });

        transaction(gifts);
        return gifts.length;
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

            // Standard Canvas Settings
            width_px: 1280,
            height_px: 720,

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
            physics_gravity_y: 1.0,
            physics_air: 0.02,
            physics_friction: 0.1,
            physics_restitution: 0.6,
            physics_wind_strength: 0.0005,
            physics_wind_variation: 0.0003,

            // Wind Simulation
            wind_enabled: false,
            wind_strength: 50,
            wind_direction: 'auto',

            // Bounce Physics
            floor_enabled: true,
            bounce_enabled: true,
            bounce_height: 0.6,
            bounce_damping: 0.1,

            // Color Theme
            color_mode: 'off',
            color_intensity: 0.5,

            // Rainbow Mode
            rainbow_enabled: false,
            rainbow_speed: 1.0,

            // Pixel Mode
            pixel_enabled: false,
            pixel_size: 4,

            // SuperFan Burst
            superfan_burst_enabled: true,
            superfan_burst_intensity: 3.0,
            superfan_burst_duration: 2000,

            // FPS Optimization
            fps_optimization_enabled: true,
            fps_sensitivity: 0.8,

            // Appearance Settings
            emoji_min_size_px: 40,
            emoji_max_size_px: 80,
            emoji_rotation_speed: 0.05,
            emoji_lifetime_ms: 8000,
            emoji_fade_duration_ms: 1000,
            max_emojis_on_screen: 200,

            // Scaling Rules
            like_count_divisor: 10,
            like_min_emojis: 1,
            like_max_emojis: 20,
            gift_base_emojis: 3,
            gift_coin_multiplier: 0.1,
            gift_max_emojis: 50
        };

        // Check if row exists
        const checkStmt = this.db.prepare('SELECT * FROM emoji_rain_config WHERE id = 1');
        const existing = checkStmt.get();

        console.log('🔍 [DATABASE] Existing config:', existing ? 'found' : 'not found');

        if (existing) {
            // Migrate old config to new format
            console.log('🔄 [DATABASE] Migrating existing config...');
            try {
                const oldConfig = JSON.parse(existing.config_json);
                console.log('🔍 [DATABASE] Old config keys:', Object.keys(oldConfig).join(', '));

                // Merge old config with new defaults (new defaults take precedence for new fields)
                const migratedConfig = {
                    ...defaultConfig,
                    // Keep old values if they exist
                    ...(oldConfig.width_px && { width_px: oldConfig.width_px }),
                    ...(oldConfig.height_px && { height_px: oldConfig.height_px }),
                    ...(oldConfig.emoji_set && { emoji_set: oldConfig.emoji_set }),
                    ...(oldConfig.physics_gravity_y !== undefined && { physics_gravity_y: oldConfig.physics_gravity_y }),
                    ...(oldConfig.physics_air !== undefined && { physics_air: oldConfig.physics_air }),
                    ...(oldConfig.physics_restitution !== undefined && { physics_restitution: oldConfig.physics_restitution }),
                    // Map old field names to new ones
                    ...(oldConfig.size_min_px && { emoji_min_size_px: oldConfig.size_min_px }),
                    ...(oldConfig.size_max_px && { emoji_max_size_px: oldConfig.size_max_px }),
                    ...(oldConfig.drop_despawn_s && { emoji_lifetime_ms: oldConfig.drop_despawn_s * 1000 }),
                    ...(oldConfig.max_active && { max_emojis_on_screen: oldConfig.max_active }),
                    ...(oldConfig.physics_wind_force !== undefined && { physics_wind_strength: oldConfig.physics_wind_force })
                };

                const updateStmt = this.db.prepare(`
                    UPDATE emoji_rain_config
                    SET config_json = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                `);
                updateStmt.run(JSON.stringify(migratedConfig));
                console.log('✅ [DATABASE] Config migrated successfully');
                console.log('✅ [DATABASE] Migrated config emoji_set:', migratedConfig.emoji_set);
            } catch (error) {
                console.error('❌ [DATABASE] Error migrating emoji rain config:', error);
                // If migration fails, just insert defaults
                const updateStmt = this.db.prepare(`
                    UPDATE emoji_rain_config
                    SET config_json = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                `);
                updateStmt.run(JSON.stringify(defaultConfig));
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
            config.enabled ? 1 : 0,
            config.threshold || 1000,
            config.mode || 'auto_increment',
            config.increment_step || 1000,
            config.animation_gif_path || null,
            config.animation_video_path || null,
            config.animation_audio_path || null,
            config.audio_volume || 80,
            config.playback_mode || 'exclusive',
            config.animation_duration || 0,
            config.session_reset ? 1 : 0
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
                newMilestone = currentMilestone + config.increment_step;
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

    close() {
        this.db.close();
    }
}

module.exports = DatabaseManager;
