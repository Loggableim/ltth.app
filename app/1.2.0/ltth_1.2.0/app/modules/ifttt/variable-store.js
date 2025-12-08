/**
 * IFTTT Variable Store
 * Manages variables, context, and state for automation flows
 */

class VariableStore {
    constructor(logger) {
        this.logger = logger;
        this.variables = new Map();
        this.counters = new Map();
        this.cooldowns = new Map();
        this.rateLimits = new Map();
        this.state = {
            tiktok: {
                connected: false,
                viewerCount: 0,
                likeCount: 0
            },
            tts: {
                isSpeaking: false,
                queueLength: 0
            },
            system: {
                uptime: 0,
                lastEvent: null
            }
        };
        this.eventHistory = [];
        this.maxEventHistory = 100;
    }

    /**
     * Set a variable
     */
    set(key, value) {
        this.variables.set(key, value);
        this.logger?.debug(`Variable set: ${key} = ${value}`);
    }

    /**
     * Get a variable
     */
    get(key, defaultValue = null) {
        return this.variables.has(key) ? this.variables.get(key) : defaultValue;
    }

    /**
     * Delete a variable
     */
    delete(key) {
        return this.variables.delete(key);
    }

    /**
     * Check if variable exists
     */
    has(key) {
        return this.variables.has(key);
    }

    /**
     * Get all variables
     */
    getAll() {
        return Object.fromEntries(this.variables);
    }

    /**
     * Clear all variables
     */
    clear() {
        this.variables.clear();
        this.logger?.info('All variables cleared');
    }

    /**
     * Increment a counter
     */
    increment(key, amount = 1) {
        const current = this.counters.get(key) || 0;
        const newValue = current + amount;
        this.counters.set(key, newValue);
        return newValue;
    }

    /**
     * Decrement a counter
     */
    decrement(key, amount = 1) {
        return this.increment(key, -amount);
    }

    /**
     * Get counter value
     */
    getCounter(key) {
        return this.counters.get(key) || 0;
    }

    /**
     * Reset counter
     */
    resetCounter(key) {
        this.counters.set(key, 0);
    }

    /**
     * Set cooldown
     */
    setCooldown(key, timestamp = Date.now()) {
        this.cooldowns.set(key, timestamp);
    }

    /**
     * Check if cooldown is active
     */
    isCooldownActive(key, seconds) {
        const lastTrigger = this.cooldowns.get(key);
        if (!lastTrigger) return false;
        
        const elapsed = (Date.now() - lastTrigger) / 1000;
        return elapsed < seconds;
    }

    /**
     * Get cooldown remaining time
     */
    getCooldownRemaining(key, seconds) {
        const lastTrigger = this.cooldowns.get(key);
        if (!lastTrigger) return 0;
        
        const elapsed = (Date.now() - lastTrigger) / 1000;
        const remaining = seconds - elapsed;
        return remaining > 0 ? remaining : 0;
    }

    /**
     * Clear cooldown
     */
    clearCooldown(key) {
        this.cooldowns.delete(key);
    }

    /**
     * Add rate limit entry
     */
    addRateLimitEntry(key) {
        const queue = this.rateLimits.get(key) || [];
        queue.push(Date.now());
        this.rateLimits.set(key, queue);
    }

    /**
     * Check rate limit
     */
    checkRateLimit(key, maxCount, windowSeconds) {
        const queue = this.rateLimits.get(key) || [];
        const now = Date.now();
        const cutoff = now - (windowSeconds * 1000);
        
        // Remove old entries
        const recent = queue.filter(t => t > cutoff);
        this.rateLimits.set(key, recent);
        
        return recent.length < maxCount;
    }

    /**
     * Clear rate limit
     */
    clearRateLimit(key) {
        this.rateLimits.delete(key);
    }

    /**
     * Update state
     */
    updateState(path, value) {
        const parts = path.split('.');
        
        // Prevent prototype pollution
        if (parts.some(part => part === '__proto__' || part === 'constructor' || part === 'prototype')) {
            this.logger?.warn(`Blocked prototype pollution attempt in updateState: ${path}`);
            return;
        }
        
        let current = this.state;
        
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        
        const lastKey = parts[parts.length - 1];
        if (lastKey !== '__proto__' && lastKey !== 'constructor' && lastKey !== 'prototype') {
            current[lastKey] = value;
        }
        this.logger?.debug(`State updated: ${path} = ${JSON.stringify(value)}`);
    }

    /**
     * Get state value
     */
    getState(path) {
        const parts = path.split('.');
        let current = this.state;
        
        for (const part of parts) {
            if (current === null || current === undefined) {
                return null;
            }
            current = current[part];
        }
        
        return current;
    }

    /**
     * Get entire state
     */
    getAllState() {
        return this.state;
    }

    /**
     * Add event to history
     */
    addEvent(event) {
        this.eventHistory.push({
            ...event,
            timestamp: Date.now()
        });
        
        // Keep only last N events
        if (this.eventHistory.length > this.maxEventHistory) {
            this.eventHistory.shift();
        }
        
        // Update last event in state
        this.updateState('system.lastEvent', event);
    }

    /**
     * Get event history
     */
    getEventHistory(count = 10) {
        return this.eventHistory.slice(-count);
    }

    /**
     * Get last event of type
     */
    getLastEvent(type) {
        for (let i = this.eventHistory.length - 1; i >= 0; i--) {
            if (this.eventHistory[i].type === type) {
                return this.eventHistory[i];
            }
        }
        return null;
    }

    /**
     * Clear event history
     */
    clearEventHistory() {
        this.eventHistory = [];
    }

    /**
     * Create execution context
     */
    createContext(eventData = {}, metadata = {}) {
        return {
            data: eventData,
            metadata,
            variables: this.variables,
            counters: this.counters,
            cooldowns: this.cooldowns,
            rateLimits: this.rateLimits,
            state: this.state,
            timestamp: Date.now(),
            stopExecution: false
        };
    }

    /**
     * Get nested value from object
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Set nested value in object
     */
    setNestedValue(obj, path, value) {
        const parts = path.split('.');
        
        // Prevent prototype pollution
        if (parts.some(part => part === '__proto__' || part === 'constructor' || part === 'prototype')) {
            this.logger?.warn(`Blocked prototype pollution attempt in setNestedValue: ${path}`);
            return;
        }
        
        let current = obj;
        
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        
        const lastKey = parts[parts.length - 1];
        if (lastKey !== '__proto__' && lastKey !== 'constructor' && lastKey !== 'prototype') {
            current[lastKey] = value;
        }
    }

    /**
     * Export state for persistence
     */
    export() {
        return {
            variables: Object.fromEntries(this.variables),
            counters: Object.fromEntries(this.counters),
            state: this.state,
            eventHistory: this.eventHistory.slice(-10) // Only last 10 events
        };
    }

    /**
     * Import state from persistence
     */
    import(data) {
        if (data.variables) {
            this.variables = new Map(Object.entries(data.variables));
        }
        if (data.counters) {
            this.counters = new Map(Object.entries(data.counters));
        }
        if (data.state) {
            this.state = data.state;
        }
        if (data.eventHistory) {
            this.eventHistory = data.eventHistory;
        }
        this.logger?.info('Variable store state imported');
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            variableCount: this.variables.size,
            counterCount: this.counters.size,
            cooldownCount: this.cooldowns.size,
            rateLimitCount: this.rateLimits.size,
            eventHistoryCount: this.eventHistory.length,
            state: this.state
        };
    }
}

module.exports = VariableStore;
