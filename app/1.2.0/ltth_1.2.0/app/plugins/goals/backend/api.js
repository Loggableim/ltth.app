/**
 * API Module for Goals Plugin
 * Handles all HTTP routes for goal management
 */

const path = require('path');
const crypto = require('crypto');
const templateRegistry = require('../engine/templates/registry');
const animationRegistry = require('../engine/animations/registry');

/**
 * Generate unique ID for goals
 */
function generateId() {
    return `goal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

class GoalsAPI {
    constructor(plugin) {
        this.plugin = plugin;
        this.api = plugin.api;
        this.db = plugin.db;
        this.stateMachineManager = plugin.stateMachineManager;
    }

    /**
     * Register all API routes
     */
    registerRoutes() {
        // UI route
        this.api.registerRoute('get', '/goals/ui', (req, res) => {
            res.sendFile(path.join(this.api.getPluginDir(), 'ui.html'));
        });

        // Overlay route - each goal gets its own overlay
        this.api.registerRoute('get', '/goals/overlay', (req, res) => {
            res.sendFile(path.join(this.api.getPluginDir(), 'overlay', 'index.html'));
        });

        // Get all goals
        this.api.registerRoute('get', '/api/goals', (req, res) => {
            try {
                const goals = this.db.getAllGoals();
                res.json({
                    success: true,
                    goals: goals
                });
            } catch (error) {
                this.api.log(`Error getting goals: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get single goal
        this.api.registerRoute('get', '/api/goals/:id', (req, res) => {
            try {
                const goal = this.db.getGoal(req.params.id);
                if (!goal) {
                    return res.status(404).json({
                        success: false,
                        error: 'Goal not found'
                    });
                }

                res.json({
                    success: true,
                    goal: goal
                });
            } catch (error) {
                this.api.log(`Error getting goal: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Create new goal
        this.api.registerRoute('post', '/api/goals', async (req, res) => {
            try {
                const goalData = {
                    id: generateId(),
                    ...req.body
                };

                // Validate required fields
                if (!goalData.name || !goalData.goal_type) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: name, goal_type'
                    });
                }

                // For likes goals, sync with current stream likes before creating
                if (goalData.goal_type === 'likes') {
                    try {
                        const stats = await this.plugin.eventHandlers.fetchCurrentStats();
                        if (stats && stats.likes > 0) {
                            goalData.current_value = stats.likes;
                            this.api.log(`Initialized likes goal with stream total: ${stats.likes}`, 'info');
                        }
                    } catch (e) {
                        // Ignore error, will use default value
                    }
                }

                // Create goal in database
                const goal = this.db.createGoal(goalData);

                // Initialize state machine
                const machine = this.stateMachineManager.getMachine(goal.id);
                machine.initialize(goal);

                // Setup state machine event listeners (required for reach behavior like double/increment)
                this.plugin.setupStateMachineListeners(machine);

                // Broadcast to all clients
                this.plugin.broadcastGoalCreated(goal);

                res.json({
                    success: true,
                    goal: goal
                });
            } catch (error) {
                this.api.log(`Error creating goal: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update goal
        this.api.registerRoute('put', '/api/goals/:id', (req, res) => {
            try {
                const goal = this.db.updateGoal(req.params.id, req.body);

                // Update state machine
                const machine = this.stateMachineManager.getMachine(goal.id);
                machine.initialize(goal);

                // Ensure state machine event listeners are attached (required for reach behavior like double/increment)
                this.plugin.setupStateMachineListeners(machine);

                // Broadcast to all clients
                this.plugin.broadcastGoalUpdated(goal);

                res.json({
                    success: true,
                    goal: goal
                });
            } catch (error) {
                this.api.log(`Error updating goal: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Delete goal
        this.api.registerRoute('delete', '/api/goals/:id', (req, res) => {
            try {
                const success = this.db.deleteGoal(req.params.id);

                if (success) {
                    // Remove state machine
                    this.stateMachineManager.removeMachine(req.params.id);

                    // Broadcast to all clients
                    this.plugin.broadcastGoalDeleted(req.params.id);

                    res.json({
                        success: true
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Goal not found'
                    });
                }
            } catch (error) {
                this.api.log(`Error deleting goal: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Increment goal value
        this.api.registerRoute('post', '/api/goals/:id/increment', (req, res) => {
            try {
                const { amount = 1 } = req.body;
                const machine = this.stateMachineManager.getMachine(req.params.id);

                if (!machine) {
                    return res.status(404).json({
                        success: false,
                        error: 'Goal not found'
                    });
                }

                // Increment via state machine
                machine.incrementValue(amount);

                // Update database
                const goal = this.db.incrementValue(req.params.id, amount);

                // Broadcast to all clients
                this.plugin.broadcastGoalValueChanged(goal);

                res.json({
                    success: true,
                    goal: goal
                });
            } catch (error) {
                this.api.log(`Error incrementing goal: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Reset goal
        this.api.registerRoute('post', '/api/goals/:id/reset', (req, res) => {
            try {
                const machine = this.stateMachineManager.getMachine(req.params.id);

                if (!machine) {
                    return res.status(404).json({
                        success: false,
                        error: 'Goal not found'
                    });
                }

                // Reset via state machine
                machine.reset();

                // Update database
                const goal = this.db.resetGoal(req.params.id);

                // Broadcast to all clients
                this.plugin.broadcastGoalReset(goal);

                res.json({
                    success: true,
                    goal: goal
                });
            } catch (error) {
                this.api.log(`Error resetting goal: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get goal history
        this.api.registerRoute('get', '/api/goals/:id/history', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 100;
                const history = this.db.getHistory(req.params.id, limit);

                res.json({
                    success: true,
                    history: history
                });
            } catch (error) {
                this.api.log(`Error getting goal history: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get available templates
        this.api.registerRoute('get', '/api/goals/meta/templates', (req, res) => {
            try {
                const templates = templateRegistry.getAllMetadata();
                res.json({
                    success: true,
                    templates: templates
                });
            } catch (error) {
                this.api.log(`Error getting templates: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get available animations
        this.api.registerRoute('get', '/api/goals/meta/animations', (req, res) => {
            try {
                const animations = animationRegistry.getAllMetadata();
                res.json({
                    success: true,
                    animations: animations
                });
            } catch (error) {
                this.api.log(`Error getting animations: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get goal types
        this.api.registerRoute('get', '/api/goals/meta/types', (req, res) => {
            res.json({
                success: true,
                types: [
                    { id: 'coin', name: 'Coins', icon: '🪙', description: 'Track gift coins from viewers' },
                    { id: 'likes', name: 'Likes', icon: '❤️', description: 'Track stream likes' },
                    { id: 'follower', name: 'Followers', icon: '👥', description: 'Track new followers' },
                    { id: 'custom', name: 'Custom', icon: '⭐', description: 'Manually controlled goal' }
                ]
            });
        });

        this.api.log('✅ Goals API routes registered', 'info');
    }
}

module.exports = GoalsAPI;
