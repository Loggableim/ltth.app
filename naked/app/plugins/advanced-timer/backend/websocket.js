/**
 * Advanced Timer WebSocket Module
 * Handles real-time communication between server and clients
 */

const FORWARDED_EVENTS = [
    'started', 'paused', 'stopped', 'reset',
    'tick', 'time-added', 'time-removed', 'value-set',
    'loop', 'interval-complete', 'speed-changed'
];

class TimerWebSocket {
    constructor(plugin) {
        this.plugin = plugin;
        this.api = plugin.api;
        this.io = typeof plugin.api.getSocketIO === 'function'
            ? plugin.api.getSocketIO()
            : { emit: () => {} };
    }

    registerHandlers() {
        // Generic forwarding loop — replaces 13 copy-pasted handlers
        for (const event of FORWARDED_EVENTS) {
            this.plugin.engine.on(`timer:${event}`, (data) => {
                this.io.emit(`advanced-timer:${event}`, data);
            });
        }

        // Completion needs special handling (chains, rules, log)
        this.plugin.engine.on('timer:completed', (data) => {
            this.io.emit('advanced-timer:completed', data);
            this.handleTimerCompleted(data);
        });

        // Threshold needs special handling (rules, log)
        this.plugin.engine.on('timer:threshold', (data) => {
            this.io.emit('advanced-timer:threshold', data);
            this.handleThresholdReached(data);
        });

        // Client-initiated socket events
        this.api.registerSocket('advanced-timer:get-timers', async (socket) => {
            try {
                const timers = this.plugin.db.getAllTimers();
                const timerStates = timers.map(timer => {
                    const instance = this.plugin.engine.getTimer(timer.id);
                    return instance ? instance.getState() : timer;
                });
                socket.emit('advanced-timer:timers-list', { success: true, timers: timerStates });
            } catch (error) {
                socket.emit('advanced-timer:error', { error: error.message });
            }
        });

        this.api.registerSocket('advanced-timer:get-timer', async (socket, data) => {
            try {
                const { id } = data;
                const timer = this.plugin.engine.getTimer(id);
                if (timer) {
                    socket.emit('advanced-timer:timer-state', { success: true, timer: timer.getState() });
                } else {
                    socket.emit('advanced-timer:error', { error: 'Timer not found' });
                }
            } catch (error) {
                socket.emit('advanced-timer:error', { error: error.message });
            }
        });

        this.api.log('Advanced Timer WebSocket handlers registered', 'info');
    }

    /**
     * Handle timer completion
     */
    async handleTimerCompleted(data) {
        const { id } = data;
        
        try {
            // Check for timer chains
            const chains = this.plugin.db.getTimerChains(id);
            
            for (const chain of chains) {
                if (chain.trigger_condition === 'on_complete') {
                    const targetTimer = this.plugin.engine.getTimer(chain.target_timer_id);
                    
                    if (targetTimer) {
                        switch (chain.action) {
                            case 'start':
                                targetTimer.start();
                                this.plugin.db.updateTimerState(chain.target_timer_id, 'running', targetTimer.currentValue);
                                break;
                            case 'stop':
                                targetTimer.stop();
                                this.plugin.db.updateTimerState(chain.target_timer_id, 'stopped', targetTimer.currentValue);
                                break;
                            case 'reset':
                                targetTimer.reset();
                                this.plugin.db.updateTimerState(chain.target_timer_id, 'stopped', targetTimer.currentValue);
                                break;
                        }
                        
                        this.plugin.db.addTimerLog(
                            chain.target_timer_id,
                            'chain_triggered',
                            null,
                            0,
                            `Triggered by timer completion: ${id}`
                        );
                    }
                }
            }

            // Check for rules
            const rules = this.plugin.db.getTimerRules(id);
            
            for (const rule of rules) {
                if (!rule.enabled) continue;
                
                if (rule.rule_type === 'on_complete') {
                    await this.executeRuleActions(rule, data);
                }
            }

            // Add log entry
            this.plugin.db.addTimerLog(id, 'completed', null, 0, 'Timer completed');

        } catch (error) {
            this.api.log(`Error handling timer completion: ${error.message}`, 'error');
        }
    }

    /**
     * Handle threshold reached
     */
    async handleThresholdReached(data) {
        const { id, threshold, type } = data;
        
        try {
            // Check for rules
            const rules = this.plugin.db.getTimerRules(id);
            
            for (const rule of rules) {
                if (!rule.enabled) continue;
                
                if (rule.rule_type === 'on_threshold') {
                    const conditions = rule.conditions;
                    
                    // Check if this rule matches the threshold
                    if (conditions.threshold === threshold && conditions.type === type) {
                        await this.executeRuleActions(rule, data);
                    }
                }
            }

            // Add log entry
            this.plugin.db.addTimerLog(
                id,
                'threshold_reached',
                null,
                0,
                `Threshold reached: ${threshold}s (${type})`
            );

        } catch (error) {
            this.api.log(`Error handling threshold: ${error.message}`, 'error');
        }
    }

    /**
     * Execute rule actions
     */
    async executeRuleActions(rule, eventData) {
        const actions = rule.actions;
        
        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'show_alert':
                        // Trigger alert via socket
                        this.io.emit('alert:show', {
                            title: action.title || 'Timer Event',
                            message: action.message || '',
                            duration: action.duration || 5000
                        });
                        break;

                    case 'play_sound':
                        // Trigger sound via socket
                        this.io.emit('sound:play', {
                            soundId: action.soundId,
                            volume: action.volume || 1.0
                        });
                        break;

                    case 'change_scene':
                        // Trigger OBS scene change
                        this.io.emit('obs:change-scene', {
                            sceneName: action.sceneName
                        });
                        break;

                    case 'modify_timer':
                        // Modify another timer
                        const targetTimer = this.plugin.engine.getTimer(action.timerId);
                        if (targetTimer) {
                            if (action.operation === 'add') {
                                targetTimer.addTime(action.value, 'rule');
                            } else if (action.operation === 'remove') {
                                targetTimer.removeTime(action.value, 'rule');
                            } else if (action.operation === 'set') {
                                targetTimer.setValue(action.value);
                            }
                        }
                        break;

                    case 'emit_event':
                        // Emit custom event
                        this.io.emit(action.eventName, action.eventData || {});
                        break;
                }
            } catch (error) {
                this.api.log(`Error executing rule action: ${error.message}`, 'error');
            }
        }
    }
}

module.exports = TimerWebSocket;
