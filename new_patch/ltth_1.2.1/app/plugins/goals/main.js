/**
 * Goals Plugin - Complete Multi-Overlay System
 *
 * Features:
 * - Multi-goal system (unlimited goals)
 * - Each goal has its own overlay URL
 * - 6 templates (Compact Bar, Full Width, Minimal Counter, Circular Progress, Floating Pill, Vertical Meter)
 * - Real animations (Smooth, Bounce, Glow, Celebration, Confetti, Pulse, Flash)
 * - State machine per goal
 * - TikTok event integration (coins, likes, follows)
 * - Live WebSocket updates
 * - No coordinates, all positioning in OBS
 */

const EventEmitter = require('events');
const GoalsDatabase = require('./backend/database');
const GoalsAPI = require('./backend/api');
const GoalsWebSocket = require('./backend/websocket');
const GoalsEventHandlers = require('./backend/event-handlers');
const { StateMachineManager } = require('./engine/state-machine');

class GoalsPlugin extends EventEmitter {
    constructor(api) {
        super();
        this.api = api;

        // Initialize modules
        this.db = new GoalsDatabase(api);
        this.stateMachineManager = new StateMachineManager();
        this.apiModule = new GoalsAPI(this);
        this.websocket = new GoalsWebSocket(this);
        this.eventHandlers = new GoalsEventHandlers(this);
    }

    async init() {
        this.api.log('🎯 Initializing Goals Plugin (Multi-Overlay System)...', 'info');

        try {
            // Initialize database
            this.db.initialize();

            // Load existing goals and initialize state machines
            this.loadGoals();

            // Register API routes
            this.apiModule.registerRoutes();

            // Register WebSocket handlers
            this.websocket.registerHandlers();

            // Register TikTok event handlers
            this.eventHandlers.registerHandlers();

            // Register Flow actions
            this.registerFlowActions();

            // Sync likes goals with current stream stats (if connected)
            // Use a short delay to ensure server is ready
            setTimeout(() => {
                this.eventHandlers.syncLikesGoalsWithStream();
            }, GoalsEventHandlers.SYNC_DELAY_ON_INIT_MS);

            this.api.log('✅ Goals Plugin initialized successfully', 'info');
            this.api.log(`   - Multi-goal system ready`, 'info');
            this.api.log(`   - 6 templates available`, 'info');
            this.api.log(`   - 8 animations ready`, 'info');
            this.api.log(`   - State machines active`, 'info');
        } catch (error) {
            this.api.log(`❌ Error initializing Goals Plugin: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Load existing goals from database
     */
    loadGoals() {
        try {
            const goals = this.db.getAllGoals();

            for (const goal of goals) {
                // Initialize state machine for each goal
                const machine = this.stateMachineManager.getMachine(goal.id);
                machine.initialize(goal);

                // Listen to state machine events
                this.setupStateMachineListeners(machine);
            }

            this.api.log(`Loaded ${goals.length} goals from database`, 'info');
        } catch (error) {
            this.api.log(`Error loading goals: ${error.message}`, 'error');
        }
    }

    /**
     * Setup listeners for state machine events
     * Checks if listeners are already attached to prevent duplicates
     */
    setupStateMachineListeners(machine) {
        const { EVENTS } = require('./engine/state-machine');

        // Check if listeners are already attached to prevent duplicates
        // Since all listeners are set up atomically in this function, checking one is sufficient
        // This is a performance optimization to avoid iterating through all event types
        if (machine.listenerCount(EVENTS.REACH_BEHAVIOR_APPLIED) > 0) {
            this.api.log(`Skipping listener setup for goal ${machine.goalId} - already attached`, 'debug');
            return;
        }

        machine.on(EVENTS.STATE_CHANGED, (data) => {
            this.api.log(`Goal ${data.goalId} state: ${data.oldState} -> ${data.newState}`, 'debug');
        });

        machine.on(EVENTS.GOAL_REACHED, (data) => {
            this.api.log(`Goal ${data.goalId} reached!`, 'info');
            this.broadcastGoalReached(data.goalId);
        });

        machine.on(EVENTS.GOAL_RESET, (data) => {
            this.api.log(`Goal ${data.goalId} reset`, 'info');
        });

        machine.on(EVENTS.REACH_BEHAVIOR_APPLIED, (data) => {
            this.api.log(`Goal ${data.goalId} behavior applied: ${data.action}`, 'info');

            // Update database with new target if changed
            if (data.newTarget) {
                try {
                    const updatedGoal = this.db.updateGoal(data.goalId, {
                        target_value: data.newTarget
                    });

                    // Broadcast updated goal to all clients (including OBS overlay)
                    if (updatedGoal) {
                        this.broadcastGoalUpdated(updatedGoal);
                    } else {
                        this.api.log(`Goal ${data.goalId} not found after update attempt`, 'warn');
                    }
                } catch (error) {
                    this.api.log(`Error updating goal target after reach behavior: ${error.message}`, 'error');
                }
            }
        });
    }

    /**
     * Register Flow actions
     */
    registerFlowActions() {
        // Legacy flow action registrations for backward compatibility
        // Set goal value
        this.api.registerFlowAction('goals.set_value', async (params) => {
            const { goalId, value } = params;
            this.eventHandlers.setGoalValue(goalId, value);
            return { success: true };
        });

        // Increment goal value
        this.api.registerFlowAction('goals.increment', async (params) => {
            const { goalId, amount = 1 } = params;
            this.eventHandlers.incrementGoal(goalId, amount);
            return { success: true };
        });

        // Reset goal
        this.api.registerFlowAction('goals.reset', async (params) => {
            const { goalId } = params;
            const goal = this.db.resetGoal(goalId);
            const machine = this.stateMachineManager.getMachine(goalId);
            machine.reset();
            this.broadcastGoalReset(goal);
            return { success: true };
        });

        // Toggle goal enabled
        this.api.registerFlowAction('goals.toggle', async (params) => {
            const { goalId } = params;
            const goal = this.db.getGoal(goalId);
            if (goal) {
                const updated = this.db.updateGoal(goalId, {
                    enabled: goal.enabled ? 0 : 1
                });
                this.broadcastGoalUpdated(updated);
                return { success: true, enabled: updated.enabled };
            }
            return { success: false, error: 'Goal not found' };
        });

        this.api.log('✅ Goals Flow actions registered', 'info');

        // Register IFTTT actions for visual flow editor (if IFTTT engine is available)
        if (this.api.iftttEngine) {
            this.registerIFTTTActions();
        } else {
            this.api.log('IFTTT engine not available, skipping IFTTT action registration', 'debug');
        }
    }

    /**
     * Register IFTTT actions for the visual flow editor
     */
    registerIFTTTActions() {
        // Set Goal Value Action
        this.api.registerIFTTTAction('goals:set_value', {
            name: 'Set Goal Value',
            description: 'Set a goal to a specific value',
            category: 'goals',
            icon: 'target',
            fields: [
                { name: 'goalId', label: 'Goal ID', type: 'number', required: true, min: 1 },
                { name: 'value', label: 'Value', type: 'number', required: true, min: 0 }
            ],
            executor: async (action, context, services) => {
                const goalId = parseInt(action.goalId);
                const value = parseFloat(action.value);
                
                if (!goalId || isNaN(value)) {
                    throw new Error('Goal ID and value are required');
                }
                
                this.eventHandlers.setGoalValue(goalId, value);
                services.logger?.info(`🎯 Goals: Set goal ${goalId} to ${value}`);
                
                return { success: true, goalId, value };
            }
        });

        // Increment Goal Action
        this.api.registerIFTTTAction('goals:increment', {
            name: 'Increment Goal',
            description: 'Increment a goal by a specified amount',
            category: 'goals',
            icon: 'plus',
            fields: [
                { name: 'goalId', label: 'Goal ID', type: 'number', required: true, min: 1 },
                { name: 'amount', label: 'Amount', type: 'number', default: 1, min: 0 }
            ],
            executor: async (action, context, services) => {
                const goalId = parseInt(action.goalId);
                const amount = parseFloat(action.amount) || 1;
                
                if (!goalId) {
                    throw new Error('Goal ID is required');
                }
                
                this.eventHandlers.incrementGoal(goalId, amount);
                services.logger?.info(`🎯 Goals: Incremented goal ${goalId} by ${amount}`);
                
                return { success: true, goalId, amount };
            }
        });

        // Reset Goal Action
        this.api.registerIFTTTAction('goals:reset', {
            name: 'Reset Goal',
            description: 'Reset a goal to 0',
            category: 'goals',
            icon: 'rotate-ccw',
            fields: [
                { name: 'goalId', label: 'Goal ID', type: 'number', required: true, min: 1 }
            ],
            executor: async (action, context, services) => {
                const goalId = parseInt(action.goalId);
                
                if (!goalId) {
                    throw new Error('Goal ID is required');
                }
                
                const goal = this.db.resetGoal(goalId);
                const machine = this.stateMachineManager.getMachine(goalId);
                machine.reset();
                this.broadcastGoalReset(goal);
                services.logger?.info(`🎯 Goals: Reset goal ${goalId}`);
                
                return { success: true, goalId };
            }
        });

        // Toggle Goal Action
        this.api.registerIFTTTAction('goals:toggle', {
            name: 'Toggle Goal Enabled',
            description: 'Enable or disable a goal',
            category: 'goals',
            icon: 'toggle-right',
            fields: [
                { name: 'goalId', label: 'Goal ID', type: 'number', required: true, min: 1 }
            ],
            executor: async (action, context, services) => {
                const goalId = parseInt(action.goalId);
                
                if (!goalId) {
                    throw new Error('Goal ID is required');
                }
                
                const goal = this.db.getGoal(goalId);
                if (!goal) {
                    throw new Error('Goal not found');
                }
                
                const updated = this.db.updateGoal(goalId, {
                    enabled: goal.enabled ? 0 : 1
                });
                this.broadcastGoalUpdated(updated);
                services.logger?.info(`🎯 Goals: Toggled goal ${goalId} to ${updated.enabled ? 'enabled' : 'disabled'}`);
                
                return { success: true, goalId, enabled: updated.enabled };
            }
        });

        this.api.log('✅ Goals IFTTT actions registered for flow editor', 'info');
    }

    /**
     * Broadcast methods (delegated to websocket module)
     */
    broadcastGoalCreated(goal) {
        this.websocket.broadcastGoalCreated(goal);
    }

    broadcastGoalUpdated(goal) {
        this.websocket.broadcastGoalUpdated(goal);
    }

    broadcastGoalDeleted(goalId) {
        this.websocket.broadcastGoalDeleted(goalId);
    }

    broadcastGoalValueChanged(goal) {
        this.websocket.broadcastGoalValueChanged(goal);
    }

    broadcastGoalReached(goalId) {
        this.websocket.broadcastGoalReached(goalId);
    }

    broadcastGoalReset(goal) {
        this.websocket.broadcastGoalReset(goal);
    }

    /**
     * Cleanup on shutdown
     */
    async cleanup() {
        this.api.log('Cleaning up Goals Plugin...', 'info');

        // Remove all state machine listeners
        for (const machine of this.stateMachineManager.getAllMachines()) {
            machine.removeAllListeners();
        }

        this.api.log('Goals Plugin cleaned up', 'info');
    }
}

module.exports = GoalsPlugin;
