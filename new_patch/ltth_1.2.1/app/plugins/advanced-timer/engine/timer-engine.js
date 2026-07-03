/**
 * Timer Engine
 * Manages individual timer instances and their state
 */

const EventEmitter = require('events');

class Timer extends EventEmitter {
    constructor(config, api) {
        super();
        this.api = api;
        this.id = config.id;
        this.name = config.name;
        this.mode = config.mode; // countdown, countup, loop, stopwatch, interval
        this.initialDuration = config.initial_duration || 0;
        this.currentValue = config.current_value || 0;
        this.targetValue = config.target_value || 0;
        this.state = config.state || 'stopped'; // stopped, running, paused, completed
        this.config = config.config || {};
        
        this.intervalId = null;
        this.lastUpdateTime = null;
        this.accumulatedTime = 0;
        
        // Like-based speed modification
        this.likeSpeedModifier = 1.0; // 1.0 = normal speed
        this.likesToSpeedRatio = this.config.likesToSpeedRatio || 0; // likes per second to affect speed
    }

    /**
     * Start the timer
     */
    start() {
        if (this.state === 'running') {
            return;
        }

        this.state = 'running';
        this.lastUpdateTime = Date.now();
        
        // Update timer every 100ms for smooth display
        this.intervalId = setInterval(() => {
            this.tick();
        }, 100);

        this.emit('started', { id: this.id, currentValue: this.currentValue });
        this.api.log(`Timer ${this.name} started`, 'info');
    }

    /**
     * Pause the timer
     */
    pause() {
        if (this.state !== 'running') {
            return;
        }

        this.state = 'paused';
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.emit('paused', { id: this.id, currentValue: this.currentValue });
        this.api.log(`Timer ${this.name} paused`, 'info');
    }

    /**
     * Resume the timer
     */
    resume() {
        if (this.state !== 'paused') {
            return;
        }

        this.start();
    }

    /**
     * Stop the timer
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.state = 'stopped';
        this.lastUpdateTime = null;

        this.emit('stopped', { id: this.id, currentValue: this.currentValue });
        this.api.log(`Timer ${this.name} stopped`, 'info');
    }

    /**
     * Reset the timer to initial value
     */
    reset() {
        this.stop();
        
        if (this.mode === 'countdown' || this.mode === 'loop') {
            this.currentValue = this.initialDuration;
        } else {
            this.currentValue = 0;
        }

        this.emit('reset', { id: this.id, currentValue: this.currentValue });
        this.api.log(`Timer ${this.name} reset`, 'info');
    }

    /**
     * Timer tick - updates the current value
     */
    tick() {
        if (this.state !== 'running' || !this.lastUpdateTime) {
            return;
        }

        const now = Date.now();
        const elapsed = (now - this.lastUpdateTime) * this.likeSpeedModifier;
        this.lastUpdateTime = now;

        // Convert elapsed time to seconds
        const elapsedSeconds = elapsed / 1000;

        switch (this.mode) {
            case 'countdown':
                this.currentValue = Math.max(0, this.currentValue - elapsedSeconds);
                if (this.currentValue <= 0) {
                    this.currentValue = 0;
                    this.handleCompletion();
                }
                break;

            case 'countup':
                this.currentValue += elapsedSeconds;
                if (this.targetValue > 0 && this.currentValue >= this.targetValue) {
                    this.currentValue = this.targetValue;
                    this.handleCompletion();
                }
                break;

            case 'stopwatch':
                this.currentValue += elapsedSeconds;
                break;

            case 'loop':
                this.currentValue -= elapsedSeconds;
                if (this.currentValue <= 0) {
                    this.currentValue = this.initialDuration;
                    this.emit('loop', { id: this.id, currentValue: this.currentValue });
                }
                break;

            case 'interval':
                // Interval mode counts up to target, then resets
                this.currentValue += elapsedSeconds;
                if (this.targetValue > 0 && this.currentValue >= this.targetValue) {
                    this.emit('interval-complete', { id: this.id, currentValue: this.currentValue });
                    this.currentValue = 0;
                }
                break;
        }

        // Emit update event for real-time display
        this.emit('tick', { 
            id: this.id, 
            currentValue: this.currentValue,
            state: this.state 
        });

        // Check for threshold events
        this.checkThresholds();
    }

    /**
     * Handle timer completion
     */
    handleCompletion() {
        this.state = 'completed';
        this.stop();
        this.emit('completed', { id: this.id, currentValue: this.currentValue });
        this.api.log(`Timer ${this.name} completed`, 'info');
    }

    /**
     * Add time to the timer
     */
    addTime(seconds, source = null) {
        const oldValue = this.currentValue;
        
        if (this.mode === 'countdown' || this.mode === 'loop') {
            this.currentValue += seconds;
        } else {
            this.currentValue += seconds;
        }

        this.emit('time-added', { 
            id: this.id, 
            amount: seconds, 
            currentValue: this.currentValue,
            oldValue: oldValue,
            source: source 
        });

        this.api.log(`Added ${seconds}s to timer ${this.name} (source: ${source})`, 'info');
    }

    /**
     * Remove time from the timer
     */
    removeTime(seconds, source = null) {
        const oldValue = this.currentValue;
        
        if (this.mode === 'countdown' || this.mode === 'loop') {
            this.currentValue = Math.max(0, this.currentValue - seconds);
        } else {
            this.currentValue = Math.max(0, this.currentValue - seconds);
        }

        this.emit('time-removed', { 
            id: this.id, 
            amount: seconds, 
            currentValue: this.currentValue,
            oldValue: oldValue,
            source: source 
        });

        this.api.log(`Removed ${seconds}s from timer ${this.name} (source: ${source})`, 'info');
    }

    /**
     * Set timer to specific value
     */
    setValue(seconds) {
        const oldValue = this.currentValue;
        this.currentValue = Math.max(0, seconds);

        this.emit('value-set', { 
            id: this.id, 
            currentValue: this.currentValue,
            oldValue: oldValue 
        });
    }

    /**
     * Update like-based speed modifier
     */
    updateLikeSpeed(likesPerSecond) {
        if (this.likesToSpeedRatio <= 0) {
            this.likeSpeedModifier = 1.0;
            return;
        }

        // Calculate speed modifier based on likes per second
        // More likes = slower countdown (or faster countup)
        const speedChange = likesPerSecond * this.likesToSpeedRatio;
        
        if (this.mode === 'countdown' || this.mode === 'loop') {
            // For countdown: more likes = slower (lower modifier)
            this.likeSpeedModifier = Math.max(0.1, 1.0 - speedChange);
        } else {
            // For countup: more likes = faster (higher modifier)
            this.likeSpeedModifier = Math.max(0.1, 1.0 + speedChange);
        }

        this.emit('speed-changed', { 
            id: this.id, 
            modifier: this.likeSpeedModifier,
            likesPerSecond: likesPerSecond 
        });
    }

    /**
     * Check for threshold events
     */
    checkThresholds() {
        const thresholds = this.config.thresholds || [];
        
        for (const threshold of thresholds) {
            const { value, type, triggered } = threshold;
            
            if (triggered) continue;
            
            let shouldTrigger = false;
            
            if (type === 'below' && this.currentValue <= value) {
                shouldTrigger = true;
            } else if (type === 'above' && this.currentValue >= value) {
                shouldTrigger = true;
            } else if (type === 'equals' && Math.abs(this.currentValue - value) < 0.5) {
                shouldTrigger = true;
            }

            if (shouldTrigger) {
                threshold.triggered = true;
                this.emit('threshold', { 
                    id: this.id, 
                    threshold: value,
                    type: type,
                    currentValue: this.currentValue 
                });
            }
        }
    }

    /**
     * Get timer state for serialization
     */
    getState() {
        return {
            id: this.id,
            name: this.name,
            mode: this.mode,
            initial_duration: this.initialDuration,
            current_value: this.currentValue,
            target_value: this.targetValue,
            state: this.state,
            config: this.config,
            likeSpeedModifier: this.likeSpeedModifier
        };
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stop();
        this.removeAllListeners();
    }
}

/**
 * Timer Engine Manager
 * Manages multiple timer instances
 */
class TimerEngine extends EventEmitter {
    constructor(api) {
        super();
        this.api = api;
        this.timers = new Map();
    }

    /**
     * Create a new timer
     */
    createTimer(config) {
        const timer = new Timer(config, this.api);
        this.timers.set(timer.id, timer);

        // Forward timer events
        timer.on('started', (data) => this.emit('timer:started', data));
        timer.on('paused', (data) => this.emit('timer:paused', data));
        timer.on('stopped', (data) => this.emit('timer:stopped', data));
        timer.on('reset', (data) => this.emit('timer:reset', data));
        timer.on('completed', (data) => this.emit('timer:completed', data));
        timer.on('tick', (data) => this.emit('timer:tick', data));
        timer.on('time-added', (data) => this.emit('timer:time-added', data));
        timer.on('time-removed', (data) => this.emit('timer:time-removed', data));
        timer.on('value-set', (data) => this.emit('timer:value-set', data));
        timer.on('threshold', (data) => this.emit('timer:threshold', data));
        timer.on('loop', (data) => this.emit('timer:loop', data));
        timer.on('interval-complete', (data) => this.emit('timer:interval-complete', data));
        timer.on('speed-changed', (data) => this.emit('timer:speed-changed', data));

        return timer;
    }

    /**
     * Get timer by ID
     */
    getTimer(id) {
        return this.timers.get(id);
    }

    /**
     * Get all timers
     */
    getAllTimers() {
        return Array.from(this.timers.values());
    }

    /**
     * Remove timer
     */
    removeTimer(id) {
        const timer = this.timers.get(id);
        if (timer) {
            timer.destroy();
            this.timers.delete(id);
        }
    }

    /**
     * Cleanup all timers
     */
    destroy() {
        for (const timer of this.timers.values()) {
            timer.destroy();
        }
        this.timers.clear();
        this.removeAllListeners();
    }
}

module.exports = { Timer, TimerEngine };
