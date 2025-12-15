/**
 * WebSocket Module for Goals Plugin
 * Handles all Socket.IO communication
 */

class GoalsWebSocket {
    constructor(plugin) {
        this.plugin = plugin;
        this.api = plugin.api;
        this.db = plugin.db;
        this.stateMachineManager = plugin.stateMachineManager;
        this.io = null;
    }

    /**
     * Register Socket.IO handlers
     */
    registerHandlers() {
        // Register individual socket event handlers
        // These will be attached to each socket on connection by the plugin loader
        
        // Get all goals
        this.api.registerSocket('goals:get-all', (socket) => {
            try {
                const goals = this.db.getAllGoals();
                const states = this.stateMachineManager.getAllSnapshots();

                // Merge goals with state machine data
                const goalsWithState = goals.map(goal => {
                    const state = states.find(s => s.goalId === goal.id);
                    return {
                        ...goal,
                        state: state ? state.state : 'idle',
                        progress: state ? state.progress : 0
                    };
                });

                socket.emit('goals:all', {
                    success: true,
                    goals: goalsWithState
                });
            } catch (error) {
                this.api.log(`Error getting all goals: ${error.message}`, 'error');
                socket.emit('goals:all', {
                    success: false,
                    error: error.message
                });
            }
        });

        // Subscribe to specific goal updates
        this.api.registerSocket('goals:subscribe', (socket, goalId) => {
            try {
                const goal = this.db.getGoal(goalId);
                if (!goal) {
                    socket.emit('goals:error', {
                        error: 'Goal not found',
                        goalId: goalId
                    });
                    return;
                }

                // Join room for this goal
                socket.join(`goal:${goalId}`);

                // Send current goal state
                const machine = this.stateMachineManager.getMachine(goalId);
                const snapshot = machine.getSnapshot();

                socket.emit('goals:subscribed', {
                    goalId: goalId,
                    goal: goal,
                    state: snapshot
                });

                this.api.log(`Client subscribed to goal: ${goalId}`, 'debug');
            } catch (error) {
                this.api.log(`Error subscribing to goal: ${error.message}`, 'error');
                socket.emit('goals:error', {
                    error: error.message,
                    goalId: goalId
                });
            }
        });

        // Unsubscribe from goal updates
        this.api.registerSocket('goals:unsubscribe', (socket, goalId) => {
            socket.leave(`goal:${goalId}`);
            this.api.log(`Client unsubscribed from goal: ${goalId}`, 'debug');
        });

        // Get goal state
        this.api.registerSocket('goals:get-state', (socket, goalId) => {
            try {
                const machine = this.stateMachineManager.getMachine(goalId);
                const snapshot = machine.getSnapshot();

                socket.emit('goals:state', {
                    goalId: goalId,
                    state: snapshot
                });
            } catch (error) {
                this.api.log(`Error getting goal state: ${error.message}`, 'error');
                socket.emit('goals:error', {
                    error: error.message,
                    goalId: goalId
                });
            }
        });

        // Manual goal update (for custom goals)
        this.api.registerSocket('goals:manual-update', (socket, data) => {
            try {
                const { goalId, value } = data;
                const machine = this.stateMachineManager.getMachine(goalId);

                if (!machine) {
                    socket.emit('goals:error', {
                        error: 'Goal not found',
                        goalId: goalId
                    });
                    return;
                }

                // Update via state machine
                machine.updateValue(value);

                // Update database
                const goal = this.db.updateValue(goalId, value);

                // Broadcast to all clients
                this.plugin.broadcastGoalValueChanged(goal);
            } catch (error) {
                this.api.log(`Error manually updating goal: ${error.message}`, 'error');
                socket.emit('goals:error', {
                    error: error.message,
                    goalId: data.goalId
                });
            }
        });

        // Signal animation end (from overlay)
        this.api.registerSocket('goals:animation-end', (socket, data) => {
            try {
                const { goalId, animationType } = data;
                const machine = this.stateMachineManager.getMachine(goalId);

                if (!machine) {
                    return;
                }

                if (animationType === 'update') {
                    machine.onUpdateAnimationEnd();
                } else if (animationType === 'reach') {
                    machine.onReachAnimationEnd();

                    // Get updated goal after reach behavior is applied
                    const goal = this.db.getGoal(goalId);
                    const snapshot = machine.getSnapshot();

                    // Broadcast state after reach behavior
                    this.io.to(`goal:${goalId}`).emit('goals:reach-complete', {
                        goalId: goalId,
                        goal: goal,
                        state: snapshot
                    });
                }
            } catch (error) {
                this.api.log(`Error handling animation end: ${error.message}`, 'error');
            }
        });

        // MultiGoal subscribe
        this.api.registerSocket('multigoals:subscribe', (socket, multigoalId) => {
            this.subscribeToMultiGoal(socket, multigoalId);
        });

        // MultiGoal unsubscribe
        this.api.registerSocket('multigoals:unsubscribe', (socket, multigoalId) => {
            socket.leave(`multigoal:${multigoalId}`);
            this.api.log(`Client unsubscribed from multigoal: ${multigoalId}`, 'debug');
        });

        // Get all multigoals
        this.api.registerSocket('multigoals:get-all', (socket) => {
            try {
                const multigoals = this.db.getAllMultiGoals();
                socket.emit('multigoals:all', {
                    success: true,
                    multigoals: multigoals
                });
            } catch (error) {
                this.api.log(`Error getting all multigoals: ${error.message}`, 'error');
                socket.emit('multigoals:all', {
                    success: false,
                    error: error.message
                });
            }
        });

        // Store io instance for broadcasting
        this.io = this.api.io;

        this.api.log('✅ Goals WebSocket handlers registered', 'info');
    }

    /**
     * Broadcast goal created
     */
    broadcastGoalCreated(goal) {
        if (!this.io) return;

        this.io.emit('goals:created', {
            goal: goal
        });
    }

    /**
     * Broadcast goal updated
     */
    broadcastGoalUpdated(goal) {
        if (!this.io) return;

        this.io.emit('goals:updated', {
            goal: goal
        });

        // Also send to goal-specific room
        this.io.to(`goal:${goal.id}`).emit('goals:config-changed', {
            goal: goal
        });
    }

    /**
     * Broadcast goal deleted
     */
    broadcastGoalDeleted(goalId) {
        if (!this.io) return;

        this.io.emit('goals:deleted', {
            goalId: goalId
        });

        this.io.to(`goal:${goalId}`).emit('goals:deleted', {
            goalId: goalId
        });
    }

    /**
     * Broadcast goal value changed
     */
    broadcastGoalValueChanged(goal) {
        if (!this.io) return;

        const machine = this.stateMachineManager.getMachine(goal.id);
        const snapshot = machine ? machine.getSnapshot() : null;

        // Broadcast to all clients (for UI updates)
        this.io.emit('goals:value-changed', {
            goalId: goal.id,
            goal: goal,
            state: snapshot
        });

        // Also broadcast to goal-specific room (for overlay updates)
        this.io.to(`goal:${goal.id}`).emit('goals:value-changed', {
            goalId: goal.id,
            goal: goal,
            state: snapshot
        });
    }

    /**
     * Broadcast goal reached
     */
    broadcastGoalReached(goalId) {
        if (!this.io) return;

        const goal = this.db.getGoal(goalId);
        const machine = this.stateMachineManager.getMachine(goalId);
        const snapshot = machine ? machine.getSnapshot() : null;

        this.io.to(`goal:${goalId}`).emit('goals:reached', {
            goalId: goalId,
            goal: goal,
            state: snapshot
        });
    }

    /**
     * Broadcast goal reset
     */
    broadcastGoalReset(goal) {
        if (!this.io) return;

        const machine = this.stateMachineManager.getMachine(goal.id);
        const snapshot = machine ? machine.getSnapshot() : null;

        // Broadcast to all clients (for UI updates)
        this.io.emit('goals:updated', {
            goal: goal
        });

        // Also broadcast reset event to goal-specific room (for overlay)
        this.io.to(`goal:${goal.id}`).emit('goals:reset', {
            goalId: goal.id,
            goal: goal,
            state: snapshot
        });
    }

    // ========================================
    // MULTIGOAL WEBSOCKET METHODS
    // ========================================

    /**
     * Subscribe to multigoal updates
     */
    subscribeToMultiGoal(socket, multigoalId) {
        try {
            const multigoal = this.db.getMultiGoalWithGoals(multigoalId);
            if (!multigoal) {
                socket.emit('multigoals:error', {
                    error: 'MultiGoal not found',
                    multigoalId: multigoalId
                });
                return;
            }

            // Join room for this multigoal
            socket.join(`multigoal:${multigoalId}`);

            // Send current multigoal state
            socket.emit('multigoals:subscribed', {
                multigoalId: multigoalId,
                multigoal: multigoal
            });

            this.api.log(`Client subscribed to multigoal: ${multigoalId}`, 'debug');
        } catch (error) {
            this.api.log(`Error subscribing to multigoal: ${error.message}`, 'error');
            socket.emit('multigoals:error', {
                error: error.message,
                multigoalId: multigoalId
            });
        }
    }

    /**
     * Emit multigoal created
     */
    emitMultiGoalCreated(multigoal) {
        if (!this.io) return;

        this.io.emit('multigoals:created', {
            multigoal: multigoal
        });
    }

    /**
     * Emit multigoal updated
     */
    emitMultiGoalUpdated(multigoal) {
        if (!this.io) return;

        this.io.emit('multigoals:updated', {
            multigoal: multigoal
        });

        // Also send to multigoal-specific room
        this.io.to(`multigoal:${multigoal.id}`).emit('multigoals:config-changed', {
            multigoal: multigoal
        });
    }

    /**
     * Emit multigoal deleted
     */
    emitMultiGoalDeleted(multigoalId) {
        if (!this.io) return;

        this.io.emit('multigoals:deleted', {
            multigoalId: multigoalId
        });

        this.io.to(`multigoal:${multigoalId}`).emit('multigoals:deleted', {
            multigoalId: multigoalId
        });
    }
}

module.exports = GoalsWebSocket;
