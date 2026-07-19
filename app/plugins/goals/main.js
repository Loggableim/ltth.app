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
const { ValidationError, NotFoundError } = require('../../modules/error-handler');
const LifecycleTracker = require('../../modules/lifecycle-tracker');

const WEBGPU_FINALE_STYLES = new Set([
    'auto',
    'classic-crescendo',
    'symmetric-salute',
    'sky-ballet',
    'thunder-finale',
    'nishiki-kamuro',
    'aurora-cathedral',
    'royal-brocade',
    'phoenix-ascension',
    'furry-celebration'
]);
const WEBGPU_FINALE_LENGTHS = new Set(['short', 'medium', 'long']);
const CUSTOM_FINALE_STYLE_PATTERN = /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeGoalFinaleStyle(value) {
    if (value === 'inherit' || value === 'finale') return 'inherit';
    if (WEBGPU_FINALE_STYLES.has(value)) return value;
    if (typeof value === 'string' && CUSTOM_FINALE_STYLE_PATTERN.test(value)) return value.toLowerCase();
    return 'inherit';
}

function normalizeGoalFinaleLength(value) {
    return WEBGPU_FINALE_LENGTHS.has(value) ? value : 'inherit';
}

class GoalsPlugin extends EventEmitter {
    constructor(api) {
        super();
        this.api = api;

        // Lifecycle tracker for timeouts/intervals/listeners registered during init
        this._lifecycle = new LifecycleTracker();
        this.fireworkFinaleMilestones = new Set();
        this.fireworkProgressMilestones = new Set();

        // Initialize modules
        this.db = new GoalsDatabase(api);
        this.stateMachineManager = new StateMachineManager({
            warn: (msg) => api.log(msg, 'warn'),
            info: (msg) => api.log(msg, 'info'),
            error: (msg) => api.log(msg, 'error'),
            debug: (msg) => api.log(msg, 'debug')
        });
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
            this._lifecycle.trackTimeout(setTimeout(() => {
                this.eventHandlers.syncLikesGoalsWithStream();
            }, GoalsEventHandlers.SYNC_DELAY_ON_INIT_MS));

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
            this.triggerGoalFireworkFinale(data.goalId);
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
            try {
                const { goalId } = params;
                const goal = this.db.getGoal(goalId);
                if (!goal) {
                    return { success: false, error: `Goal ${goalId} not found` };
                }
                const resetGoal = this.db.resetGoal(goalId);
                const machine = this.stateMachineManager.getMachine(goalId);
                machine.reset();
                this.broadcastGoalReset(resetGoal);
                return { success: true };
            } catch (error) {
                this.api.log(`Error in goals.reset flow action: ${error.message}`, 'error');
                return { success: false, error: error.message };
            }
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
                    throw new ValidationError('Goal ID and value are required');
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
                    throw new ValidationError('Goal ID is required', 'goalId');
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
                    throw new ValidationError('Goal ID is required', 'goalId');
                }
                
                const existing = this.db.getGoal(goalId);
                if (!existing) {
                    throw new NotFoundError('Goal not found');
                }
                
                try {
                    const goal = this.db.resetGoal(goalId);
                    const machine = this.stateMachineManager.getMachine(goalId);
                    machine.reset();
                    this.broadcastGoalReset(goal);
                    services.logger?.info(`🎯 Goals: Reset goal ${goalId}`);
                    
                    return { success: true, goalId };
                } catch (error) {
                    this.api.log(`Error in goals:reset IFTTT action: ${error.message}`, 'error');
                    throw error;
                }
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
                    throw new ValidationError('Goal ID is required', 'goalId');
                }
                
                const goal = this.db.getGoal(goalId);
                if (!goal) {
                    throw new NotFoundError('Goal not found');
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
        this.clearGoalFireworkMilestones(goal.id);
        this.websocket.broadcastGoalReset(goal);
    }

    resolveFireworksPlugin() {
        const webgpuPlugin = this.api.getPlugin ? this.api.getPlugin('webgpu-fireworks') : null;
        if (webgpuPlugin && typeof webgpuPlugin.triggerFinale === 'function') {
            return { id: 'webgpu-fireworks', plugin: webgpuPlugin };
        }

        const stablePlugin = this.api.getPlugin ? this.api.getPlugin('fireworks') : null;
        if (stablePlugin && typeof stablePlugin.triggerFinale === 'function') {
            return { id: 'fireworks', plugin: stablePlugin };
        }

        return null;
    }

    getGoalFireworkProgressMilestones(goal) {
        const raw = typeof goal.firework_progress_milestones === 'string' && goal.firework_progress_milestones.trim()
            ? goal.firework_progress_milestones
            : '25,50,75';

        const values = raw.split(',')
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isFinite(value) && value > 0 && value < 100)
            .map((value) => Math.round(value));

        return Array.from(new Set(values)).sort((a, b) => a - b);
    }

    getGoalProgressPercent(goal) {
        const target = Number(goal?.target_value);
        const current = Number(goal?.current_value);
        if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(current)) {
            return 0;
        }
        return (current / target) * 100;
    }

    getFireworkProgressMilestoneKey(goal, milestone) {
        return `${goal.id}:${goal.target_value}:progress:${milestone}`;
    }

    triggerGoalFireworkProgress(goal, milestone) {
        try {
            if (!goal || !goal.firework_enabled || goal.firework_progress_enabled === 0) {
                return false;
            }

            const resolved = this.resolveFireworksPlugin();
            if (!resolved) {
                return false;
            }

            const milestoneKey = this.getFireworkProgressMilestoneKey(goal, milestone);
            if (this.fireworkProgressMilestones.has(milestoneKey)) {
                return false;
            }

            const { plugin } = resolved;
            const intensity = this.clampNumber(goal.firework_intensity, 1, 10, 3);
            const milestoneIntensity = milestone >= 75 ? Math.max(1.8, intensity * 0.72) : milestone >= 50 ? Math.max(1.35, intensity * 0.58) : Math.max(1.05, intensity * 0.44);

            if (typeof plugin.triggerFirework === 'function') {
                plugin.triggerFirework({
                    type: 'goal-progress',
                    intensity: milestoneIntensity,
                    shape: milestone >= 75 ? 'ring' : 'star',
                    position: {
                        x: 0.24 + Math.random() * 0.52,
                        y: 0.28 + Math.random() * 0.24
                    },
                    reason: 'goal-progress',
                    bypassEnabled: true
                });
            } else {
                return false;
            }

            this.fireworkProgressMilestones.add(milestoneKey);
            this.api.log(`Triggered goal progress firework milestone ${milestone}% for "${goal.name}"`, 'info');
            return true;
        } catch (error) {
            this.api.log(`Error triggering goal progress firework: ${error.message}`, 'error');
            return false;
        }
    }

    maybeTriggerGoalFireworkGamification(previousGoal, updatedGoal) {
        if (!previousGoal || !updatedGoal || !updatedGoal.firework_enabled) {
            return false;
        }

        const previousPercent = this.getGoalProgressPercent(previousGoal);
        const updatedPercent = this.getGoalProgressPercent(updatedGoal);
        let triggered = false;

        for (const milestone of this.getGoalFireworkProgressMilestones(updatedGoal)) {
            if (previousPercent < milestone && updatedPercent >= milestone) {
                triggered = this.triggerGoalFireworkProgress(updatedGoal, milestone) || triggered;
            }
        }

        return this.maybeTriggerGoalFireworkFinale(previousGoal, updatedGoal) || triggered;
    }

    /**
     * Trigger a Fireworks finale for goals that explicitly opted in.
     */
    triggerGoalFireworkFinale(goalId) {
        try {
            const goal = this.db.getGoal(goalId);
            if (!goal || !goal.firework_enabled) {
                return false;
            }

            const milestoneKey = this.getFireworkMilestoneKey(goal);
            if (this.fireworkFinaleMilestones.has(milestoneKey)) {
                return false;
            }

            const resolved = this.resolveFireworksPlugin();
            if (!resolved) {
                this.api.log(`Goal ${goalId} requested a firework finale, but the Fireworks plugin is not loaded`, 'warn');
                return false;
            }

            const { id: pluginId, plugin: fireworks } = resolved;
            const intensity = this.clampNumber(goal.firework_intensity, 1, 10, 3);

            this.fireworkFinaleMilestones.add(milestoneKey);
            if (pluginId === 'webgpu-fireworks') {
                const style = normalizeGoalFinaleStyle(goal.firework_encounter_mode);
                const length = normalizeGoalFinaleLength(goal.firework_finale_length);
                const eventId = `goal:${milestoneKey}`;
                fireworks.triggerFinale({ intensity, style, length, eventId });
                this.api.log(
                    `Triggered WebGPU firework finale for goal "${goal.name}" ` +
                    `(${intensity}x, style=${style}, length=${length})`,
                    'info'
                );
            } else {
                const duration = this.clampNumber(goal.firework_duration, 1000, 30000, 5000);
                fireworks.triggerFinale(intensity, duration);
                this.api.log(`Triggered firework finale for goal "${goal.name}" (${intensity}x, ${duration}ms)`, 'info');
            }
            return true;
        } catch (error) {
            this.api.log(`Error triggering goal firework finale: ${error.message}`, 'error');
            return false;
        }
    }

    maybeTriggerGoalFireworkFinale(previousGoal, updatedGoal) {
        if (!previousGoal || !updatedGoal) {
            return false;
        }

        const wasReached = Number(previousGoal.current_value) >= Number(previousGoal.target_value);
        const isReached = Number(updatedGoal.current_value) >= Number(updatedGoal.target_value);

        if (!wasReached && isReached) {
            return this.triggerGoalFireworkFinale(updatedGoal.id);
        }

        return false;
    }

    getFireworkMilestoneKey(goal) {
        return `${goal.id}:${goal.target_value}`;
    }

    clearGoalFireworkMilestones(goalId) {
        for (const key of Array.from(this.fireworkFinaleMilestones)) {
            if (key.startsWith(`${goalId}:`)) {
                this.fireworkFinaleMilestones.delete(key);
            }
        }
        for (const key of Array.from(this.fireworkProgressMilestones)) {
            if (key.startsWith(`${goalId}:`)) {
                this.fireworkProgressMilestones.delete(key);
            }
        }
    }

    clampNumber(value, min, max, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return fallback;
        }
        return Math.min(max, Math.max(min, parsed));
    }

    /**
     * Cleanup on shutdown
     */
    async cleanup() {
        this.api.log('Cleaning up Goals Plugin...', 'info');

        // Cancel any pending lifecycle timers/intervals/listeners
        this._lifecycle.cleanupAll();

        // Remove all state machine listeners
        for (const machine of this.stateMachineManager.getAllMachines()) {
            machine.removeAllListeners();
        }

        this.api.log('Goals Plugin cleaned up', 'info');
    }

    /**
     * Destroy on plugin disable/reload (called by plugin-loader)
     */
    async destroy() {
        await this.cleanup();
    }
}

module.exports = GoalsPlugin;
