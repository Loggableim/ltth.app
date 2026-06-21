/**
 * Advanced Timer Database Module
 * Handles all database operations for timer configurations, states, and logs
 * 
 * Stores data in user profile folder for persistence across updates
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Per-interaction field mapping (event_type → column name) — used in migration and event-bridge
const ALLOWED_PER_FIELDS = {
    gift: 'per_coin',
    follow: 'per_follow',
    share: 'per_share',
    subscribe: 'per_subscribe',
    like: 'per_like',
    chat: 'per_chat'
};
const ALLOWED_PER_FIELD_VALUES = Object.values(ALLOWED_PER_FIELDS);

class TimerDatabase {
    constructor(api) {
        this.api = api;
        this.db = null;
    }

    /**
     * Initialize plugin database in user profile folder
     * Opens the database connection and sets up WAL mode.
     * Does NOT create tables or migrate data - call initialize() for that.
     */
    initDatabase() {
        try {
            // Get config path manager
            const configPathManager = this.api.getConfigPathManager();
            if (!configPathManager) {
                throw new Error('ConfigPathManager not available');
            }
            
            // Get plugin data directory from config path manager
            const pluginDataDir = configPathManager.getPluginDataDir('advanced-timer');
            
            // Ensure directory exists
            if (!fs.existsSync(pluginDataDir)) {
                fs.mkdirSync(pluginDataDir, { recursive: true });
                this.api.log(`Created plugin data directory: ${pluginDataDir}`, 'info');
            }
            
            // Database path in user profile folder
            const dbPath = path.join(pluginDataDir, 'timers.db');
            this.api.log(`Using database at: ${dbPath}`, 'info');
            
            // Check if old database exists in plugin directory (migration needed after tables are created)
            // _pendingMigrationPath is read by initialize() once the schema is ready.
            const oldDbPath = path.join(this.api.getPluginDir(), 'data', 'timers.db');
            this._pendingMigrationPath = (fs.existsSync(oldDbPath) && !fs.existsSync(dbPath)) ? oldDbPath : null;
            
            // Open database
            this.db = new Database(dbPath);
            this.db.pragma('journal_mode = WAL');
            
        } catch (error) {
            this.api.log(`Error initializing plugin database: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Migrate old database in plugin directory
     */
    migrateOldDatabase(oldDbPath) {
        try {
            this.api.log('Migrating timer data from old location...', 'info');
            
            const oldDb = new Database(oldDbPath, { readonly: true });
            
            // Copy all tables
            const tables = ['advanced_timers', 'advanced_timer_events', 'advanced_timer_rules', 
                          'advanced_timer_chains', 'advanced_timer_logs', 'advanced_timer_profiles'];
            
            for (const table of tables) {
                try {
                    const rows = oldDb.prepare(`SELECT * FROM ${table}`).all();
                    if (rows.length > 0) {
                        // Tables will be created by initialize() first
                        const columns = Object.keys(rows[0]);
                        const placeholders = columns.map(() => '?').join(',');
                        const insert = this.db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);
                        
                        const insertMany = this.db.transaction((data) => {
                            for (const row of data) {
                                insert.run(Object.values(row));
                            }
                        });
                        
                        insertMany(rows);
                        this.api.log(`Migrated ${rows.length} rows from ${table}`, 'info');
                    }
                } catch (tableError) {
                    // Table might not exist in old database, that's okay
                    this.api.log(`Skipping migration of ${table}: ${tableError.message}`, 'debug');
                }
            }
            
            oldDb.close();
            this.api.log('Migration completed successfully', 'info');
            
        } catch (error) {
            this.api.log(`Migration error (non-fatal): ${error.message}`, 'warn');
        }
    }

    /**
     * Migrate from INTEGER to REAL for fractional second support
     * SQLite is flexible with types, so this is mainly for documentation
     */
    migrateToFractionalSupport() {
        try {
            // Check if table exists
            const tableExists = this.db.prepare(`
                SELECT name FROM sqlite_master WHERE type='table' AND name='advanced_timers'
            `).get();

            if (tableExists) {
                // SQLite will automatically handle INTEGER as REAL when needed
                // No actual migration needed, just log for awareness
                this.api.log('Database supports fractional seconds (REAL type)', 'debug');
            }
        } catch (error) {
            this.api.log(`Fractional support check: ${error.message}`, 'debug');
        }
    }

    /**
     * Initialize database tables
     */
    initialize() {
        if (this.db?.open) {
            this.api.log('Advanced Timer database already initialized', 'debug');
            return;
        }

        // First open the database connection
        this.initDatabase();
        
        try {
            // Check if we need to migrate from INTEGER to REAL for fractional support
            this.migrateToFractionalSupport();

            // Timers table - stores timer configurations
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS advanced_timers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    initial_duration REAL DEFAULT 0,
                    current_value REAL DEFAULT 0,
                    target_value REAL DEFAULT 0,
                    state TEXT DEFAULT 'stopped',
                    created_at INTEGER DEFAULT (strftime('%s', 'now')),
                    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
                    config TEXT DEFAULT '{}'
                )
            `).run();

            // Timer events table - stores event triggers for timers
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS advanced_timer_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timer_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    action_value REAL DEFAULT 0,
                    conditions TEXT DEFAULT '{}',
                    enabled INTEGER DEFAULT 1,
                    FOREIGN KEY (timer_id) REFERENCES advanced_timers(id) ON DELETE CASCADE
                )
            `).run();

            // Timer rules table - stores IF/THEN automation rules
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS advanced_timer_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timer_id TEXT NOT NULL,
                    rule_type TEXT NOT NULL,
                    conditions TEXT NOT NULL,
                    actions TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    FOREIGN KEY (timer_id) REFERENCES advanced_timers(id) ON DELETE CASCADE
                )
            `).run();

            // Timer chains table - defines timer trigger chains
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS advanced_timer_chains (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_timer_id TEXT NOT NULL,
                    target_timer_id TEXT NOT NULL,
                    trigger_condition TEXT NOT NULL,
                    action TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    FOREIGN KEY (source_timer_id) REFERENCES advanced_timers(id) ON DELETE CASCADE,
                    FOREIGN KEY (target_timer_id) REFERENCES advanced_timers(id) ON DELETE CASCADE
                )
            `).run();

            // Timer logs table - tracks who added/removed time and events
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS advanced_timer_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timer_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    user_name TEXT,
                    value_change REAL DEFAULT 0,
                    description TEXT,
                    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
                    FOREIGN KEY (timer_id) REFERENCES advanced_timers(id) ON DELETE CASCADE
                )
            `).run();

            // Timer profiles table - stores timer configurations for import/export
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS advanced_timer_profiles (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    config TEXT NOT NULL,
                    created_at INTEGER DEFAULT (strftime('%s', 'now'))
                )
            `).run();

            this.api.log('Advanced Timer database tables initialized', 'info');

            // Add new flat per-interaction columns (idempotent)
            this.upgradeSchema();

            // Migrate old data if needed (must happen after tables are created)
            if (this._pendingMigrationPath) {
                this.migrateOldDatabase(this._pendingMigrationPath);
                this._pendingMigrationPath = null;
            }

            // Migrate simple timer_events entries into per_* columns
            this.migrateSimpleEventsToPerFields();
        } catch (error) {
            this.api.log(`Error initializing timer database: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Add new columns to advanced_timers (idempotent — SQLite throws if column exists, we catch that)
     */
    upgradeSchema() {
        const newColumns = [
            'per_coin REAL DEFAULT 0',
            'per_follow REAL DEFAULT 0',
            'per_share REAL DEFAULT 0',
            'per_subscribe REAL DEFAULT 0',
            'per_like REAL DEFAULT 0',
            'per_chat REAL DEFAULT 0',
            'multiplier REAL DEFAULT 1.0',
            'multiplier_enabled INTEGER DEFAULT 0',
            'expiry_action TEXT DEFAULT \'none\'',
            'expiry_action_config TEXT DEFAULT \'{}\'',
            'shortcut_start_pause TEXT DEFAULT \'\'',
            'shortcut_increase TEXT DEFAULT \'\'',
            'shortcut_decrease TEXT DEFAULT \'\'',
            'shortcut_step REAL DEFAULT 60'
        ];

        for (const colDef of newColumns) {
            try {
                this.db.prepare(`ALTER TABLE advanced_timers ADD COLUMN ${colDef}`).run();
            } catch (err) {
                // Only suppress "duplicate column" — rethrow unexpected errors
                if (!err.message || !err.message.includes('duplicate column name')) {
                    this.api.log(`Unexpected ALTER TABLE error: ${err.message}`, 'warn');
                }
            }
        }

        this.api.log('Advanced Timer schema upgrade complete', 'debug');
    }

    /**
     * One-time migration: convert simple advanced_timer_events rows
     * (gift→add_time / remove_time without conditions) into per_* fields on the timer.
     * Leaves entries with gift-name/minCoins conditions or set_value actions untouched.
     */
    migrateSimpleEventsToPerFields() {
        try {
            const timers = this.db.prepare('SELECT id FROM advanced_timers').all();

        // Fetch all events in a single query and group by timer_id
        const allEvents = this.db.prepare('SELECT * FROM advanced_timer_events').all();
        const eventsByTimer = new Map();
        for (const ev of allEvents) {
            if (!eventsByTimer.has(ev.timer_id)) eventsByTimer.set(ev.timer_id, []);
            eventsByTimer.get(ev.timer_id).push(ev);
        }

        for (const { id } of timers) {
            const events = eventsByTimer.get(id) || [];

            const updates = {};

            for (const ev of events) {
                if (!ev.enabled) continue;
                if (ev.action_type !== 'add_time' && ev.action_type !== 'remove_time') continue;

                const conditions = JSON.parse(ev.conditions || '{}');
                const hasAdvancedConditions =
                    conditions.giftName || conditions.minCoins || conditions.minLikes ||
                    conditions.command || conditions.keyword;
                if (hasAdvancedConditions) continue;

                const sign = ev.action_type === 'add_time' ? 1 : -1;
                const seconds = sign * (parseFloat(ev.action_value) || 0);

                const field = ALLOWED_PER_FIELDS[ev.event_type];
                if (!field) continue;

                // Only migrate if the per_* field is still at default (0)
                const current = this.db.prepare(`SELECT ${field} FROM advanced_timers WHERE id = ?`).get(id);
                if (current && current[field] === 0) {
                    updates[field] = seconds;
                }
            }

            if (Object.keys(updates).length > 0) {
                const safeKeys = Object.keys(updates).filter(k => ALLOWED_PER_FIELD_VALUES.includes(k));
                if (safeKeys.length > 0) {
                    const setClauses = safeKeys.map(k => `${k} = ?`).join(', ');
                    this.db.prepare(`UPDATE advanced_timers SET ${setClauses} WHERE id = ?`)
                        .run(...safeKeys.map(k => updates[k]), id);
                    this.api.log(`Migrated ${safeKeys.length} event(s) to per_* fields for timer ${id}`, 'info');
                }
            }
        }
        } catch (error) {
            this.api.log(`migrateSimpleEventsToPerFields (non-fatal): ${error.message}`, 'warn');
        }
    }

    /**
     * Get all timers
     */
    getAllTimers() {
        try {
            const timers = this.db.prepare('SELECT * FROM advanced_timers ORDER BY created_at DESC').all();
            return timers.map(timer => this._parseTimer(timer));
        } catch (error) {
            this.api.log(`Error getting all timers: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Get timer by ID
     */
    getTimer(id) {
        try {
            const timer = this.db.prepare('SELECT * FROM advanced_timers WHERE id = ?').get(id);
            if (!timer) return null;
            return this._parseTimer(timer);
        } catch (error) {
            this.api.log(`Error getting timer ${id}: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Parse raw DB row into a timer object
     */
    _parseTimer(row) {
        return {
            ...row,
            config: JSON.parse(row.config || '{}'),
            expiry_action_config: JSON.parse(row.expiry_action_config || '{}'),
            per_coin: row.per_coin || 0,
            per_follow: row.per_follow || 0,
            per_share: row.per_share || 0,
            per_subscribe: row.per_subscribe || 0,
            per_like: row.per_like || 0,
            per_chat: row.per_chat || 0,
            multiplier: row.multiplier || 1.0,
            multiplier_enabled: row.multiplier_enabled ? 1 : 0,
            expiry_action: row.expiry_action || 'none',
            shortcut_start_pause: row.shortcut_start_pause || '',
            shortcut_increase: row.shortcut_increase || '',
            shortcut_decrease: row.shortcut_decrease || '',
            shortcut_step: row.shortcut_step || 60
        };
    }

    /**
     * Create or update timer
     */
    saveTimer(timer) {
        try {
            const {
                id, name, mode, initial_duration, current_value, target_value, state, config,
                per_coin, per_follow, per_share, per_subscribe, per_like, per_chat,
                multiplier, multiplier_enabled,
                expiry_action, expiry_action_config,
                shortcut_start_pause, shortcut_increase, shortcut_decrease, shortcut_step
            } = timer;
            
            this.db.prepare(`
                INSERT OR REPLACE INTO advanced_timers 
                (id, name, mode, initial_duration, current_value, target_value, state, config, updated_at,
                 per_coin, per_follow, per_share, per_subscribe, per_like, per_chat,
                 multiplier, multiplier_enabled,
                 expiry_action, expiry_action_config,
                 shortcut_start_pause, shortcut_increase, shortcut_decrease, shortcut_step)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'),
                        ?, ?, ?, ?, ?, ?,
                        ?, ?,
                        ?, ?,
                        ?, ?, ?, ?)
            `).run(
                id,
                name,
                mode,
                initial_duration || 0,
                current_value || 0,
                target_value || 0,
                state || 'stopped',
                JSON.stringify(config || {}),
                per_coin || 0,
                per_follow || 0,
                per_share || 0,
                per_subscribe || 0,
                per_like || 0,
                per_chat || 0,
                multiplier !== undefined ? multiplier : 1.0,
                multiplier_enabled ? 1 : 0,
                expiry_action || 'none',
                JSON.stringify(expiry_action_config || {}),
                shortcut_start_pause || '',
                shortcut_increase || '',
                shortcut_decrease || '',
                shortcut_step !== undefined ? shortcut_step : 60
            );

            return true;
        } catch (error) {
            this.api.log(`Error saving timer: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Delete timer
     */
    deleteTimer(id) {
        try {
            this.db.prepare('DELETE FROM advanced_timers WHERE id = ?').run(id);
            return true;
        } catch (error) {
            this.api.log(`Error deleting timer ${id}: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Update timer state
     */
    updateTimerState(id, state, currentValue) {
        try {
            this.db.prepare(`
                UPDATE advanced_timers 
                SET state = ?, current_value = ?, updated_at = strftime('%s', 'now')
                WHERE id = ?
            `).run(state, currentValue, id);
            return true;
        } catch (error) {
            this.api.log(`Error updating timer state: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Get timer events
     */
    getTimerEvents(timerId) {
        try {
            const events = this.db.prepare('SELECT * FROM advanced_timer_events WHERE timer_id = ?').all(timerId);
            return events.map(event => ({
                ...event,
                conditions: JSON.parse(event.conditions || '{}')
            }));
        } catch (error) {
            this.api.log(`Error getting timer events: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Save timer event
     */
    saveTimerEvent(event) {
        try {
            const { id, timer_id, event_type, action_type, action_value, conditions, enabled } = event;
            
            if (id) {
                this.db.prepare(`
                    UPDATE advanced_timer_events
                    SET event_type = ?, action_type = ?, action_value = ?, conditions = ?, enabled = ?
                    WHERE id = ?
                `).run(event_type, action_type, action_value, JSON.stringify(conditions || {}), enabled ? 1 : 0, id);
            } else {
                this.db.prepare(`
                    INSERT INTO advanced_timer_events 
                    (timer_id, event_type, action_type, action_value, conditions, enabled)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(timer_id, event_type, action_type, action_value, JSON.stringify(conditions || {}), enabled ? 1 : 0);
            }
            return true;
        } catch (error) {
            this.api.log(`Error saving timer event: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Delete timer event
     */
    deleteTimerEvent(id) {
        try {
            this.db.prepare('DELETE FROM advanced_timer_events WHERE id = ?').run(id);
            return true;
        } catch (error) {
            this.api.log(`Error deleting timer event: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Get timer rules
     */
    getTimerRules(timerId) {
        try {
            const rules = this.db.prepare('SELECT * FROM advanced_timer_rules WHERE timer_id = ?').all(timerId);
            return rules.map(rule => ({
                ...rule,
                conditions: JSON.parse(rule.conditions || '{}'),
                actions: JSON.parse(rule.actions || '[]')
            }));
        } catch (error) {
            this.api.log(`Error getting timer rules: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Get all rules
     */
    getAllRules() {
        try {
            const rules = this.db.prepare('SELECT * FROM advanced_timer_rules').all();
            return rules.map(rule => ({
                ...rule,
                conditions: JSON.parse(rule.conditions || '{}'),
                actions: JSON.parse(rule.actions || '[]')
            }));
        } catch (error) {
            this.api.log(`Error getting all rules: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Save timer rule
     */
    saveTimerRule(rule) {
        try {
            const { id, timer_id, rule_type, conditions, actions, enabled } = rule;
            
            if (id) {
                this.db.prepare(`
                    UPDATE advanced_timer_rules
                    SET rule_type = ?, conditions = ?, actions = ?, enabled = ?
                    WHERE id = ?
                `).run(rule_type, JSON.stringify(conditions), JSON.stringify(actions), enabled ? 1 : 0, id);
            } else {
                this.db.prepare(`
                    INSERT INTO advanced_timer_rules 
                    (timer_id, rule_type, conditions, actions, enabled)
                    VALUES (?, ?, ?, ?, ?)
                `).run(timer_id, rule_type, JSON.stringify(conditions), JSON.stringify(actions), enabled ? 1 : 0);
            }
            return true;
        } catch (error) {
            this.api.log(`Error saving timer rule: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Delete timer rule
     */
    deleteTimerRule(id) {
        try {
            this.db.prepare('DELETE FROM advanced_timer_rules WHERE id = ?').run(id);
            return true;
        } catch (error) {
            this.api.log(`Error deleting timer rule: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Get timer chains
     */
    getTimerChains(timerId) {
        try {
            return this.db.prepare('SELECT * FROM advanced_timer_chains WHERE source_timer_id = ?').all(timerId);
        } catch (error) {
            this.api.log(`Error getting timer chains: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Get all chains
     */
    getAllChains() {
        try {
            return this.db.prepare('SELECT * FROM advanced_timer_chains').all();
        } catch (error) {
            this.api.log(`Error getting all chains: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Save timer chain
     */
    saveTimerChain(chain) {
        try {
            const { id, source_timer_id, target_timer_id, trigger_condition, action, enabled } = chain;
            
            if (id) {
                this.db.prepare(`
                    UPDATE advanced_timer_chains
                    SET source_timer_id = ?, target_timer_id = ?, trigger_condition = ?, action = ?, enabled = ?
                    WHERE id = ?
                `).run(source_timer_id, target_timer_id, trigger_condition, action, enabled !== undefined ? (enabled ? 1 : 0) : 1, id);
            } else {
                this.db.prepare(`
                    INSERT INTO advanced_timer_chains 
                    (source_timer_id, target_timer_id, trigger_condition, action, enabled)
                    VALUES (?, ?, ?, ?, ?)
                `).run(source_timer_id, target_timer_id, trigger_condition, action, enabled !== undefined ? (enabled ? 1 : 0) : 1);
            }
            return true;
        } catch (error) {
            this.api.log(`Error saving timer chain: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Delete timer chain
     */
    deleteTimerChain(id) {
        try {
            this.db.prepare('DELETE FROM advanced_timer_chains WHERE id = ?').run(id);
            return true;
        } catch (error) {
            this.api.log(`Error deleting timer chain: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Add timer log entry
     */
    addTimerLog(timerId, eventType, userName, valueChange, description) {
        try {
            this.db.prepare(`
                INSERT INTO advanced_timer_logs 
                (timer_id, event_type, user_name, value_change, description)
                VALUES (?, ?, ?, ?, ?)
            `).run(timerId, eventType, userName || null, valueChange || 0, description || null);
            return true;
        } catch (error) {
            this.api.log(`Error adding timer log: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Get timer logs
     */
    getTimerLogs(timerId, limit = 100) {
        try {
            return this.db.prepare(`
                SELECT * FROM advanced_timer_logs 
                WHERE timer_id = ? 
                ORDER BY timestamp DESC 
                LIMIT ?
            `).all(timerId, limit);
        } catch (error) {
            this.api.log(`Error getting timer logs: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Export timer logs to file
     */
    exportTimerLogs(timerId) {
        try {
            const logs = this.db.prepare(`
                SELECT * FROM advanced_timer_logs 
                WHERE timer_id = ? 
                ORDER BY timestamp DESC
            `).all(timerId);
            
            return logs;
        } catch (error) {
            this.api.log(`Error exporting timer logs: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Clear old logs
     */
    clearOldLogs(timerId, daysToKeep = 30) {
        try {
            const cutoffTimestamp = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
            this.db.prepare(`
                DELETE FROM advanced_timer_logs 
                WHERE timer_id = ? AND timestamp < ?
            `).run(timerId, cutoffTimestamp);
            return true;
        } catch (error) {
            this.api.log(`Error clearing old logs: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Save timer profile
     */
    saveProfile(profile) {
        try {
            const { id, name, description, config } = profile;
            this.db.prepare(`
                INSERT OR REPLACE INTO advanced_timer_profiles 
                (id, name, description, config)
                VALUES (?, ?, ?, ?)
            `).run(id, name, description || '', JSON.stringify(config));
            return true;
        } catch (error) {
            this.api.log(`Error saving timer profile: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Get all profiles
     */
    getAllProfiles() {
        try {
            const profiles = this.db.prepare('SELECT * FROM advanced_timer_profiles ORDER BY created_at DESC').all();
            return profiles.map(profile => ({
                ...profile,
                config: JSON.parse(profile.config || '{}')
            }));
        } catch (error) {
            this.api.log(`Error getting profiles: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Get profile by ID
     */
    getProfile(id) {
        try {
            const profile = this.db.prepare('SELECT * FROM advanced_timer_profiles WHERE id = ?').get(id);
            if (!profile) return null;
            return {
                ...profile,
                config: JSON.parse(profile.config || '{}')
            };
        } catch (error) {
            this.api.log(`Error getting profile: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Delete profile
     */
    deleteProfile(id) {
        try {
            this.db.prepare('DELETE FROM advanced_timer_profiles WHERE id = ?').run(id);
            return true;
        } catch (error) {
            this.api.log(`Error deleting profile: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Cleanup - close database connection
     */
    destroy() {
        try {
            if (this.db) {
                this.db.close();
                this.db = null;
                this.api.log('Advanced Timer database closed', 'info');
            }
        } catch (error) {
            this.api.log(`Error closing database: ${error.message}`, 'error');
        }
    }
}

module.exports = TimerDatabase;
