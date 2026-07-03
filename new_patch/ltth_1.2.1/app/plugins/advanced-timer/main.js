/**
 * Advanced Timer Plugin - Main Entry Point
 * 
 * Professional multi-timer system with:
 * - Unlimited timers (countdown, countup, loop, stopwatch, interval)
 * - Event-based automation and viewer interaction
 * - Customizable overlays with multiple templates
 * - IF/THEN rules and timer chains
 * - Like-based speed modifications
 * - Comprehensive logging and export
 * - Profile management for different setups
 */

const EventEmitter = require('events');
const TimerDatabase = require('./backend/database');
const TimerAPI = require('./backend/api');
const TimerWebSocket = require('./backend/websocket');
const TimerEventHandlers = require('./backend/event-handlers');
const { TimerEngine } = require('./engine/timer-engine');

class AdvancedTimerPlugin extends EventEmitter {
    constructor(api) {
        super();
        this.api = api;

        // Initialize modules
        this.db = new TimerDatabase(api);
        this.engine = new TimerEngine(api);
        this.apiModule = new TimerAPI(this);
        this.websocket = new TimerWebSocket(this);
        this.eventHandlers = new TimerEventHandlers(this);

        // Auto-save interval
        this.autoSaveInterval = null;
    }

    async init() {
        this.api.log('⏱️  Initializing Advanced Timer Plugin...', 'info');

        try {
            // Initialize database
            this.db.initialize();

            // Load existing timers from database
            this.loadTimers();

            // Register API routes
            this.apiModule.registerRoutes();

            // Register WebSocket handlers
            this.websocket.registerHandlers();

            // Register TikTok event handlers
            this.eventHandlers.registerHandlers();

            // Register Flow actions
            this.registerFlowActions();

            // Start auto-save for timer states
            this.startAutoSave();

            this.api.log('✅ Advanced Timer Plugin initialized successfully', 'info');
            this.api.log('   - Multi-timer system ready', 'info');
            this.api.log('   - 5 timer modes available (countdown, countup, loop, stopwatch, interval)', 'info');
            this.api.log('   - Event automation active', 'info');
            this.api.log('   - Viewer interaction enabled', 'info');
            this.api.log('   - Customizable overlays ready', 'info');

        } catch (error) {
            this.api.log(`❌ Error initializing Advanced Timer Plugin: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Load existing timers from database
     */
    loadTimers() {
        try {
            const timers = this.db.getAllTimers();

            for (const timerData of timers) {
                // Create timer instance
                const timer = this.engine.createTimer(timerData);

                // If timer was running, restore its state
                if (timerData.state === 'running') {
                    timer.start();
                    this.api.log(`Restored running timer: ${timerData.name}`, 'info');
                }
            }

            this.api.log(`Loaded ${timers.length} timers from database`, 'info');
        } catch (error) {
            this.api.log(`Error loading timers: ${error.message}`, 'error');
        }
    }

    /**
     * Register Flow actions for advanced automation
     */
    registerFlowActions() {
        try {
            // Register IFTTT actions for the visual flow editor
            if (this.api.registerIFTTTAction) {
                // Timer control actions
                this.api.registerIFTTTAction('advanced-timer:start', {
                    name: 'Start Timer',
                    description: 'Start a specific timer',
                    category: 'advanced-timer',
                    icon: 'play',
                    fields: [
                        { name: 'timerId', label: 'Timer', type: 'select', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const timer = this.engine.getTimer(action.timerId);
                        if (timer) {
                            timer.start();
                            this.db.updateTimerState(action.timerId, 'running', timer.currentValue);
                            services.logger?.info(`⏱️  Advanced Timer: Started timer ${action.timerId}`);
                            return { success: true, timerId: action.timerId };
                        }
                        throw new Error('Timer not found');
                    }
                });

                this.api.registerIFTTTAction('advanced-timer:pause', {
                    name: 'Pause Timer',
                    description: 'Pause a specific timer',
                    category: 'advanced-timer',
                    icon: 'pause',
                    fields: [
                        { name: 'timerId', label: 'Timer', type: 'select', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const timer = this.engine.getTimer(action.timerId);
                        if (timer) {
                            timer.pause();
                            this.db.updateTimerState(action.timerId, 'paused', timer.currentValue);
                            services.logger?.info(`⏱️  Advanced Timer: Paused timer ${action.timerId}`);
                            return { success: true, timerId: action.timerId };
                        }
                        throw new Error('Timer not found');
                    }
                });

                this.api.registerIFTTTAction('advanced-timer:stop', {
                    name: 'Stop Timer',
                    description: 'Stop a specific timer',
                    category: 'advanced-timer',
                    icon: 'square',
                    fields: [
                        { name: 'timerId', label: 'Timer', type: 'select', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const timer = this.engine.getTimer(action.timerId);
                        if (timer) {
                            timer.stop();
                            this.db.updateTimerState(action.timerId, 'stopped', timer.currentValue);
                            services.logger?.info(`⏱️  Advanced Timer: Stopped timer ${action.timerId}`);
                            return { success: true, timerId: action.timerId };
                        }
                        throw new Error('Timer not found');
                    }
                });

                this.api.registerIFTTTAction('advanced-timer:reset', {
                    name: 'Reset Timer',
                    description: 'Reset a timer to its initial value',
                    category: 'advanced-timer',
                    icon: 'rotate-ccw',
                    fields: [
                        { name: 'timerId', label: 'Timer', type: 'select', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const timer = this.engine.getTimer(action.timerId);
                        if (timer) {
                            timer.reset();
                            this.db.updateTimerState(action.timerId, 'stopped', timer.currentValue);
                            services.logger?.info(`⏱️  Advanced Timer: Reset timer ${action.timerId}`);
                            return { success: true, timerId: action.timerId };
                        }
                        throw new Error('Timer not found');
                    }
                });

                this.api.registerIFTTTAction('advanced-timer:add-time', {
                    name: 'Add Time to Timer',
                    description: 'Add seconds to a timer',
                    category: 'advanced-timer',
                    icon: 'plus',
                    fields: [
                        { name: 'timerId', label: 'Timer', type: 'select', required: true },
                        { name: 'seconds', label: 'Seconds to Add', type: 'number', required: true, min: 0 }
                    ],
                    executor: async (action, context, services) => {
                        const timer = this.engine.getTimer(action.timerId);
                        if (timer) {
                            const seconds = parseFloat(action.seconds);
                            if (isNaN(seconds) || seconds < 0) {
                                throw new Error('Invalid seconds value');
                            }
                            timer.addTime(seconds, 'flow');
                            this.db.updateTimerState(action.timerId, timer.state, timer.currentValue);
                            this.db.addTimerLog(action.timerId, 'flow', null, seconds, 'Added via flow');
                            services.logger?.info(`⏱️  Advanced Timer: Added ${seconds}s to timer ${action.timerId}`);
                            return { success: true, timerId: action.timerId, seconds };
                        }
                        throw new Error('Timer not found');
                    }
                });

                this.api.registerIFTTTAction('advanced-timer:remove-time', {
                    name: 'Remove Time from Timer',
                    description: 'Remove seconds from a timer',
                    category: 'advanced-timer',
                    icon: 'minus',
                    fields: [
                        { name: 'timerId', label: 'Timer', type: 'select', required: true },
                        { name: 'seconds', label: 'Seconds to Remove', type: 'number', required: true, min: 0 }
                    ],
                    executor: async (action, context, services) => {
                        const timer = this.engine.getTimer(action.timerId);
                        if (timer) {
                            const seconds = parseFloat(action.seconds);
                            if (isNaN(seconds) || seconds < 0) {
                                throw new Error('Invalid seconds value');
                            }
                            timer.removeTime(seconds, 'flow');
                            this.db.updateTimerState(action.timerId, timer.state, timer.currentValue);
                            this.db.addTimerLog(action.timerId, 'flow', null, -seconds, 'Removed via flow');
                            services.logger?.info(`⏱️  Advanced Timer: Removed ${seconds}s from timer ${action.timerId}`);
                            return { success: true, timerId: action.timerId, seconds };
                        }
                        throw new Error('Timer not found');
                    }
                });

                this.api.log('Advanced Timer IFTTT actions registered', 'info');
            } else {
                this.api.log('IFTTT action registration not available, skipping flow actions', 'warn');
            }
        } catch (error) {
            this.api.log(`Error registering flow actions: ${error.message}`, 'error');
        }
    }

    /**
     * Start auto-save interval to persist timer states
     */
    startAutoSave() {
        // Save timer states every 5 seconds
        this.autoSaveInterval = setInterval(() => {
            try {
                const timers = this.engine.getAllTimers();
                
                for (const timer of timers) {
                    const state = timer.getState();
                    this.db.updateTimerState(state.id, state.state, state.current_value);
                }
            } catch (error) {
                this.api.log(`Auto-save error: ${error.message}`, 'error');
            }
        }, 5000);
    }

    /**
     * Cleanup on plugin shutdown
     */
    async destroy() {
        this.api.log('🛑 Shutting down Advanced Timer Plugin...', 'info');

        try {
            // Stop auto-save
            if (this.autoSaveInterval) {
                clearInterval(this.autoSaveInterval);
                this.autoSaveInterval = null;
            }

            // Save all timer states one final time
            const timers = this.engine.getAllTimers();
            for (const timer of timers) {
                const state = timer.getState();
                this.db.updateTimerState(state.id, state.state, state.current_value);
            }

            // Cleanup event handlers
            if (this.eventHandlers) {
                this.eventHandlers.destroy();
            }

            // Cleanup engine
            if (this.engine) {
                this.engine.destroy();
            }

            // Close database connection
            if (this.db) {
                this.db.destroy();
            }

            this.api.log('✅ Advanced Timer Plugin shutdown complete', 'info');
        } catch (error) {
            this.api.log(`Error during shutdown: ${error.message}`, 'error');
        }
    }
}

module.exports = AdvancedTimerPlugin;
