/**
 * Database Module for Goals Plugin
 * Handles all database operations for the multi-goal system
 */

class GoalsDatabase {
    constructor(api) {
        this.api = api;
        this.db = api.getDatabase();
    }

    /**
     * Initialize all database tables
     */
    initialize() {
        try {
            this.db.exec(`
                -- Main goals table
                CREATE TABLE IF NOT EXISTS goals (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    goal_type TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,

                    -- Values
                    current_value INTEGER DEFAULT 0,
                    target_value INTEGER DEFAULT 1000,
                    start_value INTEGER DEFAULT 0,

                    -- Template & Animation
                    template_id TEXT DEFAULT 'compact-bar',
                    animation_on_update TEXT DEFAULT 'smooth-progress',
                    animation_on_reach TEXT DEFAULT 'celebration',

                    -- Behavior on reach
                    on_reach_action TEXT DEFAULT 'hide',
                    on_reach_increment INTEGER DEFAULT 100,

                    -- Styling (JSON)
                    theme_json TEXT,
                    overlay_width INTEGER DEFAULT 500,
                    overlay_height INTEGER DEFAULT 100,

                    -- Metadata
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                -- Goal history for analytics
                CREATE TABLE IF NOT EXISTS goals_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    old_value INTEGER,
                    new_value INTEGER,
                    metadata TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
                );

                -- MultiGoal table for rotating goal display
                CREATE TABLE IF NOT EXISTS multigoals (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    rotation_interval INTEGER DEFAULT 5,
                    animation_type TEXT DEFAULT 'slide',
                    overlay_width INTEGER DEFAULT 500,
                    overlay_height INTEGER DEFAULT 100,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                -- Junction table for multigoal-goal relationships
                CREATE TABLE IF NOT EXISTS multigoal_goals (
                    multigoal_id TEXT NOT NULL,
                    goal_id TEXT NOT NULL,
                    display_order INTEGER DEFAULT 0,
                    PRIMARY KEY (multigoal_id, goal_id),
                    FOREIGN KEY (multigoal_id) REFERENCES multigoals(id) ON DELETE CASCADE,
                    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
                );

                -- Create indexes for performance
                CREATE INDEX IF NOT EXISTS idx_goals_enabled ON goals(enabled);
                CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type);
                CREATE INDEX IF NOT EXISTS idx_history_goal_id ON goals_history(goal_id);
                CREATE INDEX IF NOT EXISTS idx_history_timestamp ON goals_history(timestamp);
                CREATE INDEX IF NOT EXISTS idx_multigoals_enabled ON multigoals(enabled);
                CREATE INDEX IF NOT EXISTS idx_multigoal_goals_multigoal ON multigoal_goals(multigoal_id);
                CREATE INDEX IF NOT EXISTS idx_multigoal_goals_goal ON multigoal_goals(goal_id);
            `);

            // Verify table creation
            const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='goals'").get();
            if (!tables) {
                throw new Error('Goals table creation failed');
            }

            this.api.log('✅ Goals database tables initialized', 'info');
        } catch (error) {
            this.api.log(`❌ Failed to initialize goals database tables: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Create a new goal
     */
    createGoal(goalData) {
        const {
            id,
            name,
            goal_type,
            enabled = 1,
            current_value = 0,
            target_value = 1000,
            start_value = 0,
            template_id = 'compact-bar',
            animation_on_update = 'smooth-progress',
            animation_on_reach = 'celebration',
            on_reach_action = 'hide',
            on_reach_increment = 100,
            theme_json = null,
            overlay_width = 500,
            overlay_height = 100
        } = goalData;

        const stmt = this.db.prepare(`
            INSERT INTO goals (
                id, name, goal_type, enabled, current_value, target_value, start_value,
                template_id, animation_on_update, animation_on_reach,
                on_reach_action, on_reach_increment, theme_json,
                overlay_width, overlay_height
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            id, name, goal_type, enabled, current_value, target_value, start_value,
            template_id, animation_on_update, animation_on_reach,
            on_reach_action, on_reach_increment, theme_json,
            overlay_width, overlay_height
        );

        this.logHistory(id, 'created', null, current_value);
        return this.getGoal(id);
    }

    /**
     * Get a single goal by ID
     */
    getGoal(id) {
        const stmt = this.db.prepare('SELECT * FROM goals WHERE id = ?');
        const goal = stmt.get(id);

        if (goal && goal.theme_json) {
            try {
                goal.theme = JSON.parse(goal.theme_json);
            } catch (e) {
                goal.theme = null;
            }
        }

        return goal;
    }

    /**
     * Get all goals
     */
    getAllGoals() {
        const stmt = this.db.prepare('SELECT * FROM goals ORDER BY created_at DESC');
        const goals = stmt.all();

        return goals.map(goal => {
            if (goal.theme_json) {
                try {
                    goal.theme = JSON.parse(goal.theme_json);
                } catch (e) {
                    goal.theme = null;
                }
            }
            return goal;
        });
    }

    /**
     * Get all enabled goals
     */
    getEnabledGoals() {
        const stmt = this.db.prepare('SELECT * FROM goals WHERE enabled = 1 ORDER BY created_at DESC');
        const goals = stmt.all();

        return goals.map(goal => {
            if (goal.theme_json) {
                try {
                    goal.theme = JSON.parse(goal.theme_json);
                } catch (e) {
                    goal.theme = null;
                }
            }
            return goal;
        });
    }

    /**
     * Update a goal
     */
    updateGoal(id, updates) {
        const current = this.getGoal(id);
        if (!current) {
            throw new Error(`Goal ${id} not found`);
        }

        // Build dynamic update query
        const fields = [];
        const values = [];

        Object.keys(updates).forEach(key => {
            if (key === 'theme' && typeof updates[key] === 'object') {
                fields.push('theme_json = ?');
                values.push(JSON.stringify(updates[key]));
            } else if (key !== 'id' && key !== 'created_at') {
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        });

        if (fields.length === 0) {
            return current;
        }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const stmt = this.db.prepare(`
            UPDATE goals SET ${fields.join(', ')} WHERE id = ?
        `);

        stmt.run(...values);

        // Log value changes
        if (updates.current_value !== undefined && updates.current_value !== current.current_value) {
            this.logHistory(id, 'value_updated', current.current_value, updates.current_value);
        }

        return this.getGoal(id);
    }

    /**
     * Update goal value (optimized for frequent updates)
     */
    updateValue(id, newValue) {
        const current = this.getGoal(id);
        if (!current) {
            throw new Error(`Goal ${id} not found`);
        }

        const stmt = this.db.prepare(`
            UPDATE goals
            SET current_value = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        stmt.run(newValue, id);

        this.logHistory(id, 'value_updated', current.current_value, newValue);

        return this.getGoal(id);
    }

    /**
     * Increment goal value
     */
    incrementValue(id, amount) {
        const current = this.getGoal(id);
        if (!current) {
            throw new Error(`Goal ${id} not found`);
        }

        const newValue = current.current_value + amount;
        return this.updateValue(id, newValue);
    }

    /**
     * Reset goal to start value
     */
    resetGoal(id) {
        const current = this.getGoal(id);
        if (!current) {
            throw new Error(`Goal ${id} not found`);
        }

        const stmt = this.db.prepare(`
            UPDATE goals
            SET current_value = start_value, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        stmt.run(id);

        this.logHistory(id, 'reset', current.current_value, current.start_value);

        return this.getGoal(id);
    }

    /**
     * Delete a goal
     */
    deleteGoal(id) {
        const stmt = this.db.prepare('DELETE FROM goals WHERE id = ?');
        const result = stmt.run(id);

        return result.changes > 0;
    }

    /**
     * Log history entry
     */
    logHistory(goalId, eventType, oldValue, newValue, metadata = null) {
        const stmt = this.db.prepare(`
            INSERT INTO goals_history (goal_id, event_type, old_value, new_value, metadata)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(goalId, eventType, oldValue, newValue, metadata ? JSON.stringify(metadata) : null);
    }

    /**
     * Get goal history
     */
    getHistory(goalId, limit = 100) {
        const stmt = this.db.prepare(`
            SELECT * FROM goals_history
            WHERE goal_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `);

        return stmt.all(goalId, limit);
    }

    /**
     * Get goals by type
     */
    getGoalsByType(goalType) {
        const stmt = this.db.prepare('SELECT * FROM goals WHERE goal_type = ? ORDER BY created_at DESC');
        const goals = stmt.all(goalType);

        return goals.map(goal => {
            if (goal.theme_json) {
                try {
                    goal.theme = JSON.parse(goal.theme_json);
                } catch (e) {
                    goal.theme = null;
                }
            }
            return goal;
        });
    }

    /**
     * Check if goal exists
     */
    goalExists(id) {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM goals WHERE id = ?');
        const result = stmt.get(id);
        return result.count > 0;
    }

    // ========================================
    // MULTIGOAL METHODS
    // ========================================

    /**
     * Create a new multigoal
     */
    createMultiGoal(multiGoalData) {
        const {
            id,
            name,
            enabled = 1,
            rotation_interval = 5,
            animation_type = 'slide',
            overlay_width = 500,
            overlay_height = 100
        } = multiGoalData;

        const stmt = this.db.prepare(`
            INSERT INTO multigoals (
                id, name, enabled, rotation_interval, animation_type,
                overlay_width, overlay_height
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(id, name, enabled, rotation_interval, animation_type, overlay_width, overlay_height);

        return this.getMultiGoal(id);
    }

    /**
     * Get a multigoal by ID
     */
    getMultiGoal(id) {
        const stmt = this.db.prepare('SELECT * FROM multigoals WHERE id = ?');
        const multigoal = stmt.get(id);

        if (!multigoal) return null;

        // Get associated goals
        multigoal.goal_ids = this.getMultiGoalGoalIds(id);

        return multigoal;
    }

    /**
     * Get all multigoals
     */
    getAllMultiGoals() {
        const stmt = this.db.prepare('SELECT * FROM multigoals ORDER BY created_at DESC');
        const multigoals = stmt.all();

        return multigoals.map(mg => {
            mg.goal_ids = this.getMultiGoalGoalIds(mg.id);
            return mg;
        });
    }

    /**
     * Update a multigoal
     */
    updateMultiGoal(id, updates) {
        const allowed = ['name', 'enabled', 'rotation_interval', 'animation_type', 'overlay_width', 'overlay_height'];
        const fields = [];
        const values = [];

        for (const key of allowed) {
            if (updates[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        }

        if (fields.length === 0) {
            return this.getMultiGoal(id);
        }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const stmt = this.db.prepare(`UPDATE multigoals SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);

        return this.getMultiGoal(id);
    }

    /**
     * Delete a multigoal
     */
    deleteMultiGoal(id) {
        const stmt = this.db.prepare('DELETE FROM multigoals WHERE id = ?');
        const result = stmt.run(id);

        return result.changes > 0;
    }

    /**
     * Get goal IDs associated with a multigoal
     */
    getMultiGoalGoalIds(multigoalId) {
        const stmt = this.db.prepare(`
            SELECT goal_id FROM multigoal_goals
            WHERE multigoal_id = ?
            ORDER BY display_order
        `);

        return stmt.all(multigoalId).map(row => row.goal_id);
    }

    /**
     * Set goals for a multigoal
     */
    setMultiGoalGoals(multigoalId, goalIds) {
        // Delete existing associations
        const deleteStmt = this.db.prepare('DELETE FROM multigoal_goals WHERE multigoal_id = ?');
        deleteStmt.run(multigoalId);

        // Insert new associations
        if (goalIds && goalIds.length > 0) {
            const insertStmt = this.db.prepare(`
                INSERT INTO multigoal_goals (multigoal_id, goal_id, display_order)
                VALUES (?, ?, ?)
            `);

            goalIds.forEach((goalId, index) => {
                insertStmt.run(multigoalId, goalId, index);
            });
        }
    }

    /**
     * Get full multigoal data with goal details
     */
    getMultiGoalWithGoals(id) {
        const multigoal = this.getMultiGoal(id);
        if (!multigoal) return null;

        // Get full goal objects
        multigoal.goals = multigoal.goal_ids.map(goalId => this.getGoal(goalId)).filter(g => g !== null);

        return multigoal;
    }

    /**
     * Check if multigoal exists
     */
    multiGoalExists(id) {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM multigoals WHERE id = ?');
        const result = stmt.get(id);
        return result.count > 0;
    }
}

module.exports = GoalsDatabase;
