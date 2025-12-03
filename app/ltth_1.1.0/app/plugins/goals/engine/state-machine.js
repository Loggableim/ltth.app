/**
 * State Machine for Goal Management
 * Manages state transitions for each goal
 */

const EventEmitter = require('events');

/**
 * Goal States
 */
const STATES = {
    IDLE: 'idle',
    UPDATING: 'updating',
    ANIMATING_UPDATE: 'animating_update',
    REACHED: 'reached',
    ANIMATING_REACH: 'animating_reach',
    PROCESSING_REACH: 'processing_reach',
    HIDDEN: 'hidden'
};

/**
 * Goal Events
 */
const EVENTS = {
    VALUE_CHANGED: 'value_changed',
    UPDATE_ANIMATION_START: 'update_animation_start',
    UPDATE_ANIMATION_END: 'update_animation_end',
    GOAL_REACHED: 'goal_reached',
    REACH_ANIMATION_START: 'reach_animation_start',
    REACH_ANIMATION_END: 'reach_animation_end',
    REACH_BEHAVIOR_APPLIED: 'reach_behavior_applied',
    GOAL_HIDDEN: 'goal_hidden',
    GOAL_RESET: 'goal_reset',
    STATE_CHANGED: 'state_changed'
};

/**
 * State Machine for a single goal
 */
class GoalStateMachine extends EventEmitter {
    constructor(goalId) {
        super();
        this.goalId = goalId;
        this.state = STATES.IDLE;
        this.previousState = null;
        this.data = {
            currentValue: 0,
            targetValue: 1000,
            startValue: 0,
            previousValue: 0
        };
    }

    /**
     * Initialize state machine with goal data
     */
    initialize(goalData) {
        this.data = {
            currentValue: goalData.current_value || 0,
            targetValue: goalData.target_value || 1000,
            startValue: goalData.start_value || 0,
            previousValue: goalData.current_value || 0,
            onReachAction: goalData.on_reach_action || 'hide',
            onReachIncrement: goalData.on_reach_increment || 100
        };
    }

    /**
     * Get current state
     */
    getState() {
        return this.state;
    }

    /**
     * Get state data
     */
    getData() {
        return { ...this.data };
    }

    /**
     * Transition to new state
     */
    transition(newState, eventData = {}) {
        const oldState = this.state;

        // Validate transition
        if (!this.canTransition(oldState, newState)) {
            console.warn(`[GoalStateMachine:${this.goalId}] Invalid transition from ${oldState} to ${newState}`);
            return false;
        }

        this.previousState = oldState;
        this.state = newState;

        this.emit(EVENTS.STATE_CHANGED, {
            goalId: this.goalId,
            oldState,
            newState,
            data: this.data,
            ...eventData
        });

        // Execute state entry actions
        this.onStateEnter(newState, eventData);

        return true;
    }

    /**
     * Check if transition is valid
     */
    canTransition(fromState, toState) {
        const validTransitions = {
            [STATES.IDLE]: [STATES.UPDATING, STATES.HIDDEN],
            [STATES.UPDATING]: [STATES.ANIMATING_UPDATE, STATES.IDLE, STATES.REACHED],
            [STATES.ANIMATING_UPDATE]: [STATES.IDLE, STATES.REACHED],
            [STATES.REACHED]: [STATES.ANIMATING_REACH],
            [STATES.ANIMATING_REACH]: [STATES.PROCESSING_REACH],
            [STATES.PROCESSING_REACH]: [STATES.IDLE, STATES.HIDDEN],
            [STATES.HIDDEN]: [STATES.IDLE]
        };

        return validTransitions[fromState]?.includes(toState) || false;
    }

    /**
     * Execute actions on state entry
     */
    onStateEnter(state, eventData) {
        switch (state) {
            case STATES.UPDATING:
                // Value is being updated
                break;

            case STATES.ANIMATING_UPDATE:
                this.emit(EVENTS.UPDATE_ANIMATION_START, {
                    goalId: this.goalId,
                    oldValue: this.data.previousValue,
                    newValue: this.data.currentValue
                });
                break;

            case STATES.REACHED:
                this.emit(EVENTS.GOAL_REACHED, {
                    goalId: this.goalId,
                    value: this.data.currentValue,
                    target: this.data.targetValue
                });
                // Automatically transition to reach animation
                this.transition(STATES.ANIMATING_REACH);
                break;

            case STATES.ANIMATING_REACH:
                this.emit(EVENTS.REACH_ANIMATION_START, {
                    goalId: this.goalId
                });
                break;

            case STATES.PROCESSING_REACH:
                this.applyReachBehavior();
                break;

            case STATES.HIDDEN:
                this.emit(EVENTS.GOAL_HIDDEN, {
                    goalId: this.goalId
                });
                break;

            case STATES.IDLE:
                // Back to idle state
                break;
        }
    }

    /**
     * Update goal value
     * Handles rapid updates gracefully by forcing state to IDLE when needed
     */
    updateValue(newValue, animate = true) {
        if (this.state === STATES.HIDDEN) {
            console.warn(`[GoalStateMachine:${this.goalId}] Cannot update value while hidden`);
            return false;
        }

        // If we're in an updating/animating state, force back to IDLE first
        // This handles rapid updates that arrive before animations complete.
        // We intentionally bypass the normal transition() method here because:
        // 1. The normal state transitions don't allow going backward (e.g., ANIMATING_UPDATE -> IDLE)
        // 2. When updates arrive faster than animations complete, we need to interrupt
        //    the current animation and process the new value immediately
        // 3. This ensures the goal UI always shows the latest value and never gets stuck
        if (this.state === STATES.UPDATING || 
            this.state === STATES.ANIMATING_UPDATE ||
            this.state === STATES.ANIMATING_REACH ||
            this.state === STATES.PROCESSING_REACH) {
            // Force reset to IDLE to allow new update (bypass transition validation)
            this.previousState = this.state;
            this.state = STATES.IDLE;
        }

        this.data.previousValue = this.data.currentValue;
        this.data.currentValue = newValue;

        this.emit(EVENTS.VALUE_CHANGED, {
            goalId: this.goalId,
            oldValue: this.data.previousValue,
            newValue: this.data.currentValue,
            progress: this.getProgress()
        });

        // Transition to updating state
        this.transition(STATES.UPDATING);

        // Check if goal reached
        if (this.data.currentValue >= this.data.targetValue) {
            if (animate) {
                this.transition(STATES.ANIMATING_UPDATE, { willReach: true });
            } else {
                this.transition(STATES.REACHED);
            }
        } else {
            if (animate) {
                this.transition(STATES.ANIMATING_UPDATE);
            } else {
                this.transition(STATES.IDLE);
            }
        }

        return true;
    }

    /**
     * Increment goal value
     */
    incrementValue(amount, animate = true) {
        const newValue = this.data.currentValue + amount;
        return this.updateValue(newValue, animate);
    }

    /**
     * Signal that update animation has ended
     */
    onUpdateAnimationEnd() {
        if (this.state === STATES.ANIMATING_UPDATE) {
            this.emit(EVENTS.UPDATE_ANIMATION_END, {
                goalId: this.goalId
            });

            // Check if we reached the goal during animation
            if (this.data.currentValue >= this.data.targetValue) {
                this.transition(STATES.REACHED);
            } else {
                this.transition(STATES.IDLE);
            }
        }
    }

    /**
     * Signal that reach animation has ended
     */
    onReachAnimationEnd() {
        if (this.state === STATES.ANIMATING_REACH) {
            this.emit(EVENTS.REACH_ANIMATION_END, {
                goalId: this.goalId
            });

            this.transition(STATES.PROCESSING_REACH);
        }
    }

    /**
     * Apply behavior when goal is reached
     */
    applyReachBehavior() {
        const action = this.data.onReachAction;

        switch (action) {
            case 'hide':
                this.transition(STATES.HIDDEN);
                break;

            case 'reset':
                this.data.currentValue = this.data.startValue;
                this.emit(EVENTS.GOAL_RESET, {
                    goalId: this.goalId,
                    value: this.data.currentValue
                });
                this.transition(STATES.IDLE);
                break;

            case 'double':
                this.data.targetValue = this.data.targetValue * 2;
                // Catch-up logic: ensure target is always above current value
                // Keep doubling until target exceeds current value
                // This handles cases where tool connects later with a value
                // that has already passed multiple milestones
                // Use a safety limit to prevent infinite loops (max 100 iterations)
                let doubleIterations = 0;
                while (this.data.currentValue >= this.data.targetValue && doubleIterations < 100) {
                    this.data.targetValue = this.data.targetValue * 2;
                    doubleIterations++;
                }
                this.emit(EVENTS.REACH_BEHAVIOR_APPLIED, {
                    goalId: this.goalId,
                    action: 'double',
                    newTarget: this.data.targetValue
                });
                this.transition(STATES.IDLE);
                break;

            case 'increment':
                this.data.targetValue = this.data.targetValue + this.data.onReachIncrement;
                // Catch-up logic: ensure target is always above current value
                // Calculate the next target that exceeds current value
                // This handles cases where tool connects later with a value
                // that has already passed multiple milestones
                // Example: currentValue=10002, targetValue=1000, increment=1000
                // Should set targetValue to 11000 (the next milestone after 10002)
                // Use a safety limit to prevent infinite loops (max 10000 iterations)
                let incrementIterations = 0;
                while (this.data.currentValue >= this.data.targetValue && incrementIterations < 10000) {
                    this.data.targetValue = this.data.targetValue + this.data.onReachIncrement;
                    incrementIterations++;
                }
                this.emit(EVENTS.REACH_BEHAVIOR_APPLIED, {
                    goalId: this.goalId,
                    action: 'increment',
                    newTarget: this.data.targetValue
                });
                this.transition(STATES.IDLE);
                break;

            default:
                console.warn(`[GoalStateMachine:${this.goalId}] Unknown reach action: ${action}`);
                this.transition(STATES.IDLE);
        }
    }

    /**
     * Reset goal
     */
    reset() {
        this.data.currentValue = this.data.startValue;
        this.data.previousValue = this.data.startValue;

        this.emit(EVENTS.GOAL_RESET, {
            goalId: this.goalId,
            value: this.data.currentValue
        });

        if (this.state === STATES.HIDDEN) {
            this.transition(STATES.IDLE);
        }
    }

    /**
     * Show goal (unhide)
     */
    show() {
        if (this.state === STATES.HIDDEN) {
            this.transition(STATES.IDLE);
        }
    }

    /**
     * Hide goal
     */
    hide() {
        if (this.state !== STATES.HIDDEN) {
            this.transition(STATES.HIDDEN);
        }
    }

    /**
     * Get progress percentage (0-100)
     */
    getProgress() {
        if (this.data.targetValue === 0) return 0;
        const progress = (this.data.currentValue / this.data.targetValue) * 100;
        return Math.min(100, Math.max(0, progress));
    }

    /**
     * Check if goal is reached
     */
    isReached() {
        return this.data.currentValue >= this.data.targetValue;
    }

    /**
     * Get full state snapshot
     */
    getSnapshot() {
        return {
            goalId: this.goalId,
            state: this.state,
            previousState: this.previousState,
            data: { ...this.data },
            progress: this.getProgress(),
            isReached: this.isReached()
        };
    }
}

/**
 * State Machine Manager - manages multiple goal state machines
 */
class StateMachineManager {
    constructor() {
        this.machines = new Map();
    }

    /**
     * Create or get state machine for a goal
     */
    getMachine(goalId) {
        if (!this.machines.has(goalId)) {
            const machine = new GoalStateMachine(goalId);
            this.machines.set(goalId, machine);
        }
        return this.machines.get(goalId);
    }

    /**
     * Remove state machine
     */
    removeMachine(goalId) {
        const machine = this.machines.get(goalId);
        if (machine) {
            machine.removeAllListeners();
            this.machines.delete(goalId);
        }
    }

    /**
     * Get all machines
     */
    getAllMachines() {
        return Array.from(this.machines.values());
    }

    /**
     * Get snapshots of all machines
     */
    getAllSnapshots() {
        return this.getAllMachines().map(m => m.getSnapshot());
    }
}

module.exports = {
    STATES,
    EVENTS,
    GoalStateMachine,
    StateMachineManager
};
