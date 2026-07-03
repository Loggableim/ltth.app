/**
 * TikTok Event Handlers for Goals Plugin
 * Processes TikTok events and updates goals
 */

const http = require('http');

// Configuration constants for sync timing
const SYNC_DELAY_ON_CONNECT_MS = 2000;  // Wait for stats to be populated after connection
const SYNC_DELAY_ON_INIT_MS = 3000;     // Wait for server to be fully ready on init
const API_TIMEOUT_MS = 5000;            // Timeout for API requests

class GoalsEventHandlers {
    constructor(plugin) {
        this.plugin = plugin;
        this.api = plugin.api;
        this.db = plugin.db;
        this.stateMachineManager = plugin.stateMachineManager;
    }

    /**
     * Register TikTok event handlers
     */
    registerHandlers() {
        // Gift event (coins)
        this.api.registerTikTokEvent('gift', (data) => {
            this.handleGift(data);
        });

        // Like event
        this.api.registerTikTokEvent('like', (data) => {
            this.handleLike(data);
        });

        // Follow event
        this.api.registerTikTokEvent('follow', (data) => {
            this.handleFollow(data);
        });

        // Listen for TikTok connection to sync likes goals
        this.api.registerTikTokEvent('connected', () => {
            // Wait a moment for stats to be populated, then sync
            setTimeout(() => {
                this.syncLikesGoalsWithStream();
            }, SYNC_DELAY_ON_CONNECT_MS);
        });

        // Listen for TikTok disconnection to reset goals with doubled/incremented targets
        this.api.registerTikTokEvent('disconnected', () => {
            this.resetGoalsOnStreamEnd();
        });

        this.api.log('✅ Goals TikTok event handlers registered', 'info');
    }

    /**
     * Sync all likes goals with current stream's total likes
     * This ensures likes goals start with the correct value when:
     * 1. The plugin initializes
     * 2. A TikTok connection is established
     */
    async syncLikesGoalsWithStream() {
        try {
            // Fetch current stats from the API
            const stats = await this.fetchCurrentStats();
            if (!stats || stats.likes === undefined) {
                this.api.log('Could not fetch current stream stats for likes sync', 'debug');
                return;
            }

            const totalLikes = stats.likes;
            if (totalLikes === 0) {
                // No likes yet or not connected, skip sync
                return;
            }

            // Get all enabled likes goals
            const goals = this.db.getGoalsByType('likes');
            const enabledGoals = goals.filter(g => g.enabled);

            for (const goal of enabledGoals) {
                // Only sync if current value is less than stream total
                // (don't decrease the goal if it was manually increased)
                if (goal.current_value < totalLikes) {
                    this.setGoalValue(goal.id, totalLikes);
                    this.api.log(`Synced likes goal "${goal.name}" to stream total: ${totalLikes}`, 'info');
                }
            }
        } catch (error) {
            this.api.log(`Error syncing likes goals: ${error.message}`, 'error');
        }
    }

    /**
     * Fetch current stream stats from the API
     * @returns {Promise<Object|null>} Stats object or null if unavailable
     */
    fetchCurrentStats() {
        const port = process.env.PORT || 3000;
        return new Promise((resolve) => {
            const req = http.get(`http://localhost:${port}/api/status`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.stats || null);
                    } catch (e) {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => resolve(null));
            req.setTimeout(API_TIMEOUT_MS, () => {
                req.destroy();
                resolve(null);
            });
        });
    }

    /**
     * Handle gift event (coins)
     */
    handleGift(data) {
        try {
            // FIX: Use data.coins (already calculated as diamondCount * repeatCount)
            // instead of data.diamondCount (which is just the raw diamond value per gift)
            const coins = data.coins || 0;
            if (coins === 0) return;

            // Get all enabled coin goals
            const goals = this.db.getGoalsByType('coin');
            const enabledGoals = goals.filter(g => g.enabled);

            for (const goal of enabledGoals) {
                this.incrementGoal(goal.id, coins);
            }

            this.api.log(`Gift received: ${coins} coins (${data.giftName || 'unknown'} x${data.repeatCount || 1})`, 'debug');
        } catch (error) {
            this.api.log(`Error handling gift event: ${error.message}`, 'error');
        }
    }

    /**
     * Handle like event
     */
    handleLike(data) {
        try {
            // Get all enabled likes goals
            const goals = this.db.getGoalsByType('likes');
            const enabledGoals = goals.filter(g => g.enabled);

            // Use totalLikes from the event data (cumulative total from stream)
            // This matches the same engine used in dashboard and main UI
            const totalLikes = data.totalLikes;

            if (totalLikes != null) {
                // Set the goal value to the total likes count
                for (const goal of enabledGoals) {
                    this.setGoalValue(goal.id, totalLikes);
                }

                this.api.log(`Likes total updated: ${totalLikes}`, 'debug');
            } else {
                // Fallback: increment by individual likeCount (legacy behavior)
                const likeCount = data.likeCount || 1;

                for (const goal of enabledGoals) {
                    this.incrementGoal(goal.id, likeCount);
                }

                this.api.log(`Likes received: ${likeCount}`, 'debug');
            }
        } catch (error) {
            this.api.log(`Error handling like event: ${error.message}`, 'error');
        }
    }

    /**
     * Handle follow event
     */
    handleFollow(data) {
        try {
            // Get all enabled follower goals
            const goals = this.db.getGoalsByType('follower');
            const enabledGoals = goals.filter(g => g.enabled);

            for (const goal of enabledGoals) {
                this.incrementGoal(goal.id, 1);
            }

            this.api.log(`New follower: ${data.uniqueId || 'unknown'}`, 'debug');
        } catch (error) {
            this.api.log(`Error handling follow event: ${error.message}`, 'error');
        }
    }

    /**
     * Increment goal value
     */
    incrementGoal(goalId, amount) {
        try {
            const goal = this.db.getGoal(goalId);
            if (!goal) return;

            // Get state machine
            const machine = this.stateMachineManager.getMachine(goalId);

            // Update via state machine
            const success = machine.incrementValue(amount);

            if (success) {
                // Update database
                const updatedGoal = this.db.incrementValue(goalId, amount);

                // Broadcast to all clients
                this.plugin.broadcastGoalValueChanged(updatedGoal);

                // Check if goal reached
                if (machine.isReached() && machine.getState() === 'reached') {
                    this.plugin.broadcastGoalReached(goalId);
                }
            }
        } catch (error) {
            this.api.log(`Error incrementing goal ${goalId}: ${error.message}`, 'error');
        }
    }

    /**
     * Set goal value directly
     */
    setGoalValue(goalId, value) {
        try {
            const goal = this.db.getGoal(goalId);
            if (!goal) return;

            // Get state machine
            const machine = this.stateMachineManager.getMachine(goalId);

            // Update via state machine
            const success = machine.updateValue(value);

            if (success) {
                // Update database
                const updatedGoal = this.db.updateValue(goalId, value);

                // Broadcast to all clients
                this.plugin.broadcastGoalValueChanged(updatedGoal);

                // Check if goal reached
                if (machine.isReached() && machine.getState() === 'reached') {
                    this.plugin.broadcastGoalReached(goalId);
                }
            }
        } catch (error) {
            this.api.log(`Error setting goal value ${goalId}: ${error.message}`, 'error');
        }
    }

    /**
     * Reset goals that have been doubled/incremented when stream ends
     * This ensures goals return to their initial target values for the next stream
     */
    resetGoalsOnStreamEnd() {
        try {
            const goals = this.db.getAllGoals();
            
            for (const goal of goals) {
                // Only reset goals that have 'double' or 'increment' behavior
                if (goal.on_reach_action === 'double' || goal.on_reach_action === 'increment') {
                    const machine = this.stateMachineManager.getMachine(goal.id);
                    
                    // Get the initial target value from settings
                    // This value is stored when the goal is first created or when target is manually changed
                    const settingsDb = this.api.getDatabase();
                    const initialTargetStr = settingsDb.getSetting(`goal_${goal.id}_initial_target`);
                    let initialTarget = initialTargetStr ? parseInt(initialTargetStr, 10) : null;
                    
                    // If no initial target is stored, use the current target_value as the initial
                    // This handles goals created before this fix was implemented
                    if (initialTarget === null) {
                        initialTarget = goal.target_value;
                        // Store it for future use
                        settingsDb.setSetting(`goal_${goal.id}_initial_target`, initialTarget.toString());
                        this.api.log(`Stored initial target for goal "${goal.name}": ${initialTarget}`, 'debug');
                    }
                    
                    // Reset both current_value to start_value AND target_value to initial_target
                    const updatedGoal = this.db.updateGoal(goal.id, {
                        current_value: goal.start_value,
                        target_value: initialTarget
                    });
                    
                    // Reset the state machine with the initial target
                    machine.data.currentValue = goal.start_value;
                    machine.data.targetValue = initialTarget;
                    machine.data.previousValue = goal.start_value;
                    machine.updateValue(goal.start_value, false);
                    
                    // Broadcast the reset
                    this.plugin.broadcastGoalReset(updatedGoal);
                    
                    this.api.log(`Reset goal "${goal.name}" to initial state (current: ${goal.start_value}, target: ${initialTarget})`, 'info');
                }
            }
        } catch (error) {
            this.api.log(`Error resetting goals on stream end: ${error.message}`, 'error');
        }
    }
}

// Export the class and constants
GoalsEventHandlers.SYNC_DELAY_ON_INIT_MS = SYNC_DELAY_ON_INIT_MS;

module.exports = GoalsEventHandlers;
