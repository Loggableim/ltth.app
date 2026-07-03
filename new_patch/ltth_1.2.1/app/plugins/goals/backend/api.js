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

                // Store initial target for goals with increment/double behavior
                // This allows resetting to the original target after stream ends
                if (goal.on_reach_action === 'double' || goal.on_reach_action === 'increment') {
                    const settingsDb = this.api.getDatabase();
                    settingsDb.setSetting(`goal_${goal.id}_initial_target`, goal.target_value.toString());
                    this.api.log(`Stored initial target for goal "${goal.name}": ${goal.target_value}`, 'debug');
                }

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

                // If target_value or on_reach_action changed, update the initial target
                // This handles manual changes to the target or behavior mode
                if ((req.body.target_value !== undefined || req.body.on_reach_action !== undefined) &&
                    (goal.on_reach_action === 'double' || goal.on_reach_action === 'increment')) {
                    const settingsDb = this.api.getDatabase();
                    // Only update if target_value was explicitly changed
                    if (req.body.target_value !== undefined) {
                        settingsDb.setSetting(`goal_${goal.id}_initial_target`, goal.target_value.toString());
                        this.api.log(`Updated initial target for goal "${goal.name}": ${goal.target_value}`, 'debug');
                    }
                }

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

        // ========================================
        // MULTIGOAL ROUTES
        // ========================================

        // MultiGoal overlay route
        this.api.registerRoute('get', '/goals/multigoal-overlay', (req, res) => {
            res.sendFile(path.join(this.api.getPluginDir(), 'overlay', 'multigoal.html'));
        });

        // Get all multigoals
        this.api.registerRoute('get', '/api/multigoals', (req, res) => {
            try {
                const multigoals = this.db.getAllMultiGoals();
                res.json({
                    success: true,
                    multigoals: multigoals
                });
            } catch (error) {
                this.api.log(`Error getting multigoals: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get single multigoal
        this.api.registerRoute('get', '/api/multigoals/:id', (req, res) => {
            try {
                const multigoal = this.db.getMultiGoalWithGoals(req.params.id);
                if (!multigoal) {
                    return res.status(404).json({
                        success: false,
                        error: 'MultiGoal not found'
                    });
                }

                res.json({
                    success: true,
                    multigoal: multigoal
                });
            } catch (error) {
                this.api.log(`Error getting multigoal: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Create new multigoal
        this.api.registerRoute('post', '/api/multigoals', (req, res) => {
            try {
                const multigoalData = {
                    id: generateId().replace('goal_', 'multigoal_'),
                    ...req.body
                };

                // Validate required fields
                if (!multigoalData.name) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required field: name'
                    });
                }

                // Create multigoal
                const multigoal = this.db.createMultiGoal(multigoalData);

                // Set associated goals
                if (req.body.goal_ids && Array.isArray(req.body.goal_ids)) {
                    this.db.setMultiGoalGoals(multigoal.id, req.body.goal_ids);
                }

                // Get full multigoal with goals
                const fullMultigoal = this.db.getMultiGoalWithGoals(multigoal.id);

                // Emit WebSocket event
                this.plugin.websocket.emitMultiGoalCreated(fullMultigoal);

                res.json({
                    success: true,
                    multigoal: fullMultigoal
                });
            } catch (error) {
                this.api.log(`Error creating multigoal: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update multigoal
        this.api.registerRoute('put', '/api/multigoals/:id', (req, res) => {
            try {
                const id = req.params.id;

                if (!this.db.multiGoalExists(id)) {
                    return res.status(404).json({
                        success: false,
                        error: 'MultiGoal not found'
                    });
                }

                // Update multigoal
                this.db.updateMultiGoal(id, req.body);

                // Update associated goals if provided
                if (req.body.goal_ids && Array.isArray(req.body.goal_ids)) {
                    this.db.setMultiGoalGoals(id, req.body.goal_ids);
                }

                // Get full multigoal with goals
                const multigoal = this.db.getMultiGoalWithGoals(id);

                // Emit WebSocket event
                this.plugin.websocket.emitMultiGoalUpdated(multigoal);

                res.json({
                    success: true,
                    multigoal: multigoal
                });
            } catch (error) {
                this.api.log(`Error updating multigoal: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Delete multigoal
        this.api.registerRoute('delete', '/api/multigoals/:id', (req, res) => {
            try {
                const id = req.params.id;

                if (!this.db.multiGoalExists(id)) {
                    return res.status(404).json({
                        success: false,
                        error: 'MultiGoal not found'
                    });
                }

                const deleted = this.db.deleteMultiGoal(id);

                if (deleted) {
                    // Emit WebSocket event
                    this.plugin.websocket.emitMultiGoalDeleted(id);

                    res.json({
                        success: true,
                        message: 'MultiGoal deleted'
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: 'Failed to delete multigoal'
                    });
                }
            } catch (error) {
                this.api.log(`Error deleting multigoal: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get available WebGL animations for multigoals
        this.api.registerRoute('get', '/api/multigoals/meta/animations', (req, res) => {
            res.json({
                success: true,
                animations: [
                    { id: 'slide', name: 'Slide Transition', description: 'Smooth sliding animation' },
                    { id: 'fade', name: 'Fade Transition', description: 'Cross-fade between goals' },
                    { id: 'cube', name: 'Cube Rotation', description: '3D cube flip effect' },
                    { id: 'wave', name: 'Wave Distortion', description: 'Ripple wave effect' },
                    { id: 'particle', name: 'Particle Transition', description: 'Particle dissolve effect' }
                ]
            });
        });

        this.api.log('✅ Goals API routes registered', 'info');
    }
}

module.exports = GoalsAPI;
