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
            // Register custom flow actions if the flow API is available
            const flowAPI = this.api.registerFlowAction;
            
            if (typeof flowAPI === 'function') {
                // Timer control actions
                flowAPI({
                    id: 'advanced-timer-start',
                    name: 'Start Timer',
                    description: 'Start a specific timer',
                    category: 'advanced-timer',
                    config: {
                        timerId: {
                            type: 'select',
                            label: 'Timer',
                            required: true
                        }
                    },
                    execute: async (config) => {
                        const timer = this.engine.getTimer(config.timerId);
                        if (timer) {
                            timer.start();
                            this.db.updateTimerState(config.timerId, 'running', timer.currentValue);
                        }
                    }
                });

                flowAPI({
                    id: 'advanced-timer-pause',
                    name: 'Pause Timer',
                    description: 'Pause a specific timer',
                    category: 'advanced-timer',
                    config: {
                        timerId: {
                            type: 'select',
                            label: 'Timer',
                            required: true
                        }
                    },
                    execute: async (config) => {
                        const timer = this.engine.getTimer(config.timerId);
                        if (timer) {
                            timer.pause();
                            this.db.updateTimerState(config.timerId, 'paused', timer.currentValue);
                        }
                    }
                });

                flowAPI({
                    id: 'advanced-timer-stop',
                    name: 'Stop Timer',
                    description: 'Stop a specific timer',
                    category: 'advanced-timer',
                    config: {
                        timerId: {
                            type: 'select',
                            label: 'Timer',
                            required: true
                        }
                    },
                    execute: async (config) => {
                        const timer = this.engine.getTimer(config.timerId);
                        if (timer) {
                            timer.stop();
                            this.db.updateTimerState(config.timerId, 'stopped', timer.currentValue);
                        }
                    }
                });

                flowAPI({
                    id: 'advanced-timer-reset',
                    name: 'Reset Timer',
                    description: 'Reset a timer to its initial value',
                    category: 'advanced-timer',
                    config: {
                        timerId: {
                            type: 'select',
                            label: 'Timer',
                            required: true
                        }
                    },
                    execute: async (config) => {
                        const timer = this.engine.getTimer(config.timerId);
                        if (timer) {
                            timer.reset();
                            this.db.updateTimerState(config.timerId, 'stopped', timer.currentValue);
                        }
                    }
                });

                flowAPI({
                    id: 'advanced-timer-add-time',
                    name: 'Add Time to Timer',
                    description: 'Add seconds to a timer',
                    category: 'advanced-timer',
                    config: {
                        timerId: {
                            type: 'select',
                            label: 'Timer',
                            required: true
                        },
                        seconds: {
                            type: 'number',
                            label: 'Seconds to Add',
                            required: true,
                            min: 0
                        }
                    },
                    execute: async (config) => {
                        const timer = this.engine.getTimer(config.timerId);
                        if (timer) {
                            timer.addTime(config.seconds, 'flow');
                            this.db.updateTimerState(config.timerId, timer.state, timer.currentValue);
                            this.db.addTimerLog(config.timerId, 'flow', null, config.seconds, 'Added via flow');
                        }
                    }
                });

                flowAPI({
                    id: 'advanced-timer-remove-time',
                    name: 'Remove Time from Timer',
                    description: 'Remove seconds from a timer',
                    category: 'advanced-timer',
                    config: {
                        timerId: {
                            type: 'select',
                            label: 'Timer',
                            required: true
                        },
                        seconds: {
                            type: 'number',
                            label: 'Seconds to Remove',
                            required: true,
                            min: 0
                        }
                    },
                    execute: async (config) => {
                        const timer = this.engine.getTimer(config.timerId);
                        if (timer) {
                            timer.removeTime(config.seconds, 'flow');
                            this.db.updateTimerState(config.timerId, timer.state, timer.currentValue);
                            this.db.addTimerLog(config.timerId, 'flow', null, -config.seconds, 'Removed via flow');
                        }
                    }
                });

                this.api.log('Advanced Timer flow actions registered', 'info');
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

            this.api.log('✅ Advanced Timer Plugin shutdown complete', 'info');
        } catch (error) {
            this.api.log(`Error during shutdown: ${error.message}`, 'error');
        }
    }
}

module.exports = AdvancedTimerPlugin;
