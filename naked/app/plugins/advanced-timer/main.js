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
const TimerEventBridge = require('./backend/event-bridge');
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
        this.eventBridge = new TimerEventBridge(this);

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
            this.eventBridge.registerHandlers();
            this.eventBridge.rebuildCache();

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

                // Restore saved values first, before potentially starting the timer
                timer.initialDuration = timerData.initial_duration;
                timer.targetValue = timerData.target_value;
                timer.currentValue = timerData.current_value;

                // Restore state based on what it was before shutdown
                if (timerData.state === 'running') {
                    // Resume running timer
                    timer.start();
                    this.api.log(`Restored running timer: ${timerData.name}`, 'info');
                } else if (timerData.state === 'paused') {
                    // Keep timer paused (don't start it)
                    timer.state = 'paused';
                    this.api.log(`Restored paused timer: ${timerData.name}`, 'info');
                } else {
                    // Timer was stopped or completed - keep it in that state
                    this.api.log(`Restored ${timerData.state} timer: ${timerData.name}`, 'info');
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

                // Resume timer action
                this.api.registerIFTTTAction('advanced-timer:resume', {
                    name: 'Resume Timer',
                    description: 'Resume a paused timer',
                    category: 'advanced-timer',
                    icon: 'play',
                    fields: [
                        { name: 'timerId', label: 'Timer', type: 'select', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const timer = this.engine.getTimer(action.timerId);
                        if (timer) {
                            if (timer.state !== 'paused') {
                                throw new Error('Timer is not paused');
                            }
                            timer.resume();
                            this.db.updateTimerState(action.timerId, 'running', timer.currentValue);
                            services.logger?.info(`⏱️  Advanced Timer: Resumed timer ${action.timerId}`);
                            return { success: true, timerId: action.timerId };
                        }
                        throw new Error('Timer not found');
                    }
                });

                // Set timer value action
                this.api.registerIFTTTAction('advanced-timer:set-value', {
                    name: 'Set Timer Value',
                    description: 'Set timer to a specific value in seconds',
                    category: 'advanced-timer',
                    icon: 'clock',
                    fields: [
                        { name: 'timerId', label: 'Timer', type: 'select', required: true },
                        { name: 'seconds', label: 'Value (seconds)', type: 'number', required: true, min: 0 }
                    ],
                    executor: async (action, context, services) => {
                        const timer = this.engine.getTimer(action.timerId);
                        if (timer) {
                            const seconds = parseFloat(action.seconds);
                            if (isNaN(seconds) || seconds < 0) {
                                throw new Error('Invalid seconds value');
                            }
                            timer.setValue(seconds);
                            this.db.updateTimerState(action.timerId, timer.state, timer.currentValue);
                            this.db.addTimerLog(action.timerId, 'flow', null, 0, `Set to ${seconds}s via flow`);
                            services.logger?.info(`⏱️  Advanced Timer: Set timer ${action.timerId} to ${seconds}s`);
                            return { success: true, timerId: action.timerId, seconds };
                        }
                        throw new Error('Timer not found');
                    }
                });

                // Create timer action
                this.api.registerIFTTTAction('advanced-timer:create', {
                    name: 'Create Timer',
                    description: 'Create a new timer',
                    category: 'advanced-timer',
                    icon: 'plus-circle',
                    fields: [
                        { name: 'name', label: 'Timer Name', type: 'text', required: true },
                        { name: 'mode', label: 'Mode', type: 'select', required: true, 
                          options: [
                              { value: 'countdown', label: 'Countdown' },
                              { value: 'countup', label: 'Count Up' },
                              { value: 'stopwatch', label: 'Stopwatch' },
                              { value: 'loop', label: 'Loop' },
                              { value: 'interval', label: 'Interval' }
                          ]
                        },
                        { name: 'initialDuration', label: 'Initial Duration (seconds)', type: 'number', min: 0, default: 0 },
                        { name: 'targetValue', label: 'Target Value (seconds)', type: 'number', min: 0, default: 0 }
                    ],
                    executor: async (action, context, services) => {
                        const timerId = `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        const timerData = {
                            id: timerId,
                            name: action.name,
                            mode: action.mode,
                            initial_duration: parseFloat(action.initialDuration) || 0,
                            current_value: action.mode === 'countdown' || action.mode === 'loop' ? 
                                (parseFloat(action.initialDuration) || 0) : 0,
                            target_value: parseFloat(action.targetValue) || 0,
                            state: 'stopped',
                            config: {}
                        };

                        // Validate based on mode
                        if ((timerData.mode === 'countdown' || timerData.mode === 'loop') && timerData.initial_duration <= 0) {
                            throw new Error('Countdown and Loop modes require initial_duration > 0');
                        }
                        if ((timerData.mode === 'countup' || timerData.mode === 'interval') && timerData.target_value < 0) {
                            throw new Error('Count Up and Interval modes require target_value >= 0');
                        }

                        const saved = this.db.saveTimer(timerData);
                        if (!saved) {
                            throw new Error('Failed to save timer');
                        }

                        this.engine.createTimer(timerData);
                        services.logger?.info(`⏱️  Advanced Timer: Created timer ${timerId} (${action.name})`);
                        return { success: true, timerId, timer: timerData };
                    }
                });

                // Delete timer action
                this.api.registerIFTTTAction('advanced-timer:delete', {
                    name: 'Delete Timer',
                    description: 'Delete a timer by ID',
                    category: 'advanced-timer',
                    icon: 'trash',
                    fields: [
                        { name: 'timerId', label: 'Timer', type: 'select', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const timer = this.engine.getTimer(action.timerId);
                        if (!timer) {
                            throw new Error('Timer not found');
                        }

                        this.engine.removeTimer(action.timerId);
                        this.db.deleteTimer(action.timerId);
                        services.logger?.info(`⏱️  Advanced Timer: Deleted timer ${action.timerId}`);
                        return { success: true, timerId: action.timerId };
                    }
                });

                // Set likes-to-speed ratio action
                this.api.registerIFTTTAction('advanced-timer:set-like-speed', {
                    name: 'Set Like Speed Ratio',
                    description: 'Set or toggle like-to-speed ratio for a timer',
                    category: 'advanced-timer',
                    icon: 'zap',
                    fields: [
                        { name: 'timerId', label: 'Timer', type: 'select', required: true },
                        { name: 'ratio', label: 'Likes to Speed Ratio', type: 'number', min: 0, default: 0 },
                        { name: 'enabled', label: 'Enabled', type: 'checkbox', default: true }
                    ],
                    executor: async (action, context, services) => {
                        const timer = this.engine.getTimer(action.timerId);
                        if (!timer) {
                            throw new Error('Timer not found');
                        }

                        const ratio = action.enabled ? (parseFloat(action.ratio) || 0) : 0;
                        timer.config.likesToSpeedRatio = ratio;
                        timer.likesToSpeedRatio = ratio;

                        // Update in database
                        const timerData = this.db.getTimer(action.timerId);
                        if (timerData) {
                            timerData.config.likesToSpeedRatio = ratio;
                            this.db.saveTimer(timerData);
                        }

                        services.logger?.info(`⏱️  Advanced Timer: Set like-speed ratio to ${ratio} for timer ${action.timerId}`);
                        return { success: true, timerId: action.timerId, ratio };
                    }
                });

                // Trigger chain action
                this.api.registerIFTTTAction('advanced-timer:trigger-chain', {
                    name: 'Trigger Timer Chain',
                    description: 'Manually trigger a timer chain',
                    category: 'advanced-timer',
                    icon: 'link',
                    fields: [
                        { name: 'chainId', label: 'Chain ID', type: 'number', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const chains = this.db.getAllChains();
                        const chain = chains.find(c => c.id === parseInt(action.chainId));
                        
                        if (!chain) {
                            throw new Error('Chain not found');
                        }

                        const targetTimer = this.engine.getTimer(chain.target_timer_id);
                        if (!targetTimer) {
                            throw new Error('Target timer not found');
                        }

                        // Execute chain action
                        switch (chain.action) {
                            case 'start':
                                targetTimer.start();
                                this.db.updateTimerState(chain.target_timer_id, 'running', targetTimer.currentValue);
                                break;
                            case 'stop':
                                targetTimer.stop();
                                this.db.updateTimerState(chain.target_timer_id, 'stopped', targetTimer.currentValue);
                                break;
                            case 'pause':
                                targetTimer.pause();
                                this.db.updateTimerState(chain.target_timer_id, 'paused', targetTimer.currentValue);
                                break;
                            case 'reset':
                                targetTimer.reset();
                                this.db.updateTimerState(chain.target_timer_id, 'stopped', targetTimer.currentValue);
                                break;
                        }

                        services.logger?.info(`⏱️  Advanced Timer: Triggered chain ${action.chainId}`);
                        return { success: true, chainId: action.chainId, action: chain.action };
                    }
                });

                // Enable/disable chain actions
                this.api.registerIFTTTAction('advanced-timer:enable-chain', {
                    name: 'Enable Timer Chain',
                    description: 'Enable a timer chain',
                    category: 'advanced-timer',
                    icon: 'toggle-right',
                    fields: [
                        { name: 'chainId', label: 'Chain ID', type: 'number', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const chains = this.db.getAllChains();
                        const chain = chains.find(c => c.id === parseInt(action.chainId));
                        
                        if (!chain) {
                            throw new Error('Chain not found');
                        }

                        chain.enabled = 1;
                        this.db.saveTimerChain(chain);
                        services.logger?.info(`⏱️  Advanced Timer: Enabled chain ${action.chainId}`);
                        return { success: true, chainId: action.chainId, enabled: true };
                    }
                });

                this.api.registerIFTTTAction('advanced-timer:disable-chain', {
                    name: 'Disable Timer Chain',
                    description: 'Disable a timer chain',
                    category: 'advanced-timer',
                    icon: 'toggle-left',
                    fields: [
                        { name: 'chainId', label: 'Chain ID', type: 'number', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const chains = this.db.getAllChains();
                        const chain = chains.find(c => c.id === parseInt(action.chainId));
                        
                        if (!chain) {
                            throw new Error('Chain not found');
                        }

                        chain.enabled = 0;
                        this.db.saveTimerChain(chain);
                        services.logger?.info(`⏱️  Advanced Timer: Disabled chain ${action.chainId}`);
                        return { success: true, chainId: action.chainId, enabled: false };
                    }
                });

                // Enable/disable rule actions
                this.api.registerIFTTTAction('advanced-timer:enable-rule', {
                    name: 'Enable Timer Rule',
                    description: 'Enable a timer IF/THEN rule',
                    category: 'advanced-timer',
                    icon: 'check-circle',
                    fields: [
                        { name: 'ruleId', label: 'Rule ID', type: 'number', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const rules = this.db.getAllRules();
                        const rule = rules.find(r => r.id === parseInt(action.ruleId));
                        
                        if (!rule) {
                            throw new Error('Rule not found');
                        }

                        rule.enabled = 1;
                        this.db.saveTimerRule(rule);
                        services.logger?.info(`⏱️  Advanced Timer: Enabled rule ${action.ruleId}`);
                        return { success: true, ruleId: action.ruleId, enabled: true };
                    }
                });

                this.api.registerIFTTTAction('advanced-timer:disable-rule', {
                    name: 'Disable Timer Rule',
                    description: 'Disable a timer IF/THEN rule',
                    category: 'advanced-timer',
                    icon: 'x-circle',
                    fields: [
                        { name: 'ruleId', label: 'Rule ID', type: 'number', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const rules = this.db.getAllRules();
                        const rule = rules.find(r => r.id === parseInt(action.ruleId));
                        
                        if (!rule) {
                            throw new Error('Rule not found');
                        }

                        rule.enabled = 0;
                        this.db.saveTimerRule(rule);
                        services.logger?.info(`⏱️  Advanced Timer: Disabled rule ${action.ruleId}`);
                        return { success: true, ruleId: action.ruleId, enabled: false };
                    }
                });

                // Apply profile action
                this.api.registerIFTTTAction('advanced-timer:apply-profile', {
                    name: 'Apply Timer Profile',
                    description: 'Load and apply a saved timer profile',
                    category: 'advanced-timer',
                    icon: 'folder',
                    fields: [
                        { name: 'profileId', label: 'Profile ID', type: 'text', required: true }
                    ],
                    executor: async (action, context, services) => {
                        const profile = this.db.getProfile(action.profileId);
                        if (!profile) {
                            throw new Error('Profile not found');
                        }

                        // Apply profile (clear existing timers and create from profile)
                        const existingTimers = this.engine.getAllTimers();
                        for (const timer of existingTimers) {
                            this.engine.removeTimer(timer.id);
                            this.db.deleteTimer(timer.id);
                        }

                        // Create timers from profile
                        const profileConfig = profile.config || {};
                        const timers = profileConfig.timers || [];
                        
                        for (const timerData of timers) {
                            const saved = this.db.saveTimer(timerData);
                            if (saved) {
                                this.engine.createTimer(timerData);
                            }
                        }

                        services.logger?.info(`⏱️  Advanced Timer: Applied profile ${action.profileId} (${timers.length} timers)`);
                        return { success: true, profileId: action.profileId, timersCreated: timers.length };
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

            // Cleanup event bridge
            if (this.eventBridge) {
                this.eventBridge.destroy();
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
