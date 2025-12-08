/**
 * Advanced Timer Database Module
 * Handles all database operations for timer configurations, states, and logs
 */

class TimerDatabase {
    constructor(api) {
        this.api = api;
        this.db = api.getDatabase();
    }

    /**
     * Initialize database tables
     */
    initialize() {
        try {
            // Timers table - stores timer configurations
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS advanced_timers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    initial_duration INTEGER DEFAULT 0,
                    current_value INTEGER DEFAULT 0,
                    target_value INTEGER DEFAULT 0,
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
                    action_value INTEGER DEFAULT 0,
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
                    value_change INTEGER DEFAULT 0,
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
        } catch (error) {
            this.api.log(`Error initializing timer database: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Get all timers
     */
    getAllTimers() {
        try {
            const timers = this.db.prepare('SELECT * FROM advanced_timers ORDER BY created_at DESC').all();
            return timers.map(timer => ({
                ...timer,
                config: JSON.parse(timer.config || '{}')
            }));
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
            return {
                ...timer,
                config: JSON.parse(timer.config || '{}')
            };
        } catch (error) {
            this.api.log(`Error getting timer ${id}: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Create or update timer
     */
    saveTimer(timer) {
        try {
            const { id, name, mode, initial_duration, current_value, target_value, state, config } = timer;
            
            this.db.prepare(`
                INSERT OR REPLACE INTO advanced_timers 
                (id, name, mode, initial_duration, current_value, target_value, state, config, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
            `).run(
                id,
                name,
                mode,
                initial_duration || 0,
                current_value || 0,
                target_value || 0,
                state || 'stopped',
                JSON.stringify(config || {})
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
     * Save timer chain
     */
    saveTimerChain(chain) {
        try {
            const { id, source_timer_id, target_timer_id, trigger_condition, action } = chain;
            
            if (id) {
                this.db.prepare(`
                    UPDATE advanced_timer_chains
                    SET source_timer_id = ?, target_timer_id = ?, trigger_condition = ?, action = ?
                    WHERE id = ?
                `).run(source_timer_id, target_timer_id, trigger_condition, action, id);
            } else {
                this.db.prepare(`
                    INSERT INTO advanced_timer_chains 
                    (source_timer_id, target_timer_id, trigger_condition, action)
                    VALUES (?, ?, ?, ?)
                `).run(source_timer_id, target_timer_id, trigger_condition, action);
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
}

module.exports = TimerDatabase;
