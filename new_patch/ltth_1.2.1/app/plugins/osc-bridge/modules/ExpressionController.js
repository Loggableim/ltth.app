/**
 * Expression Controller
 * Manages VRChat expression menu triggers with combo support
 * Handles 8 Emote slots + 4 Action slots with sequences, cooldowns, and spam protection
 */

class ExpressionController {
    constructor(api, oscBridge) {
        this.api = api;
        this.oscBridge = oscBridge;
        
        // Expression slots
        this.EMOTE_SLOTS = 8;  // 0-7
        this.ACTION_SLOTS = 4; // 0-3
        
        // State tracking
        this.activeExpressions = new Set();
        this.comboQueue = [];
        this.isPlayingCombo = false;
        
        // Cooldown and spam protection
        this.cooldowns = new Map();        // Map<key, timestamp>
        this.defaultCooldown = 1000;       // 1 second default cooldown
        this.spamThreshold = 5;            // Max triggers per window
        this.spamWindow = 10000;           // 10 second window
        this.triggerHistory = new Map();   // Map<key, Array<timestamp>>
        
        this.logger = api.logger;
    }

    /**
     * Trigger an expression (Emote or Action)
     * @param {string} type - 'Emote' or 'Action'
     * @param {number} slot - Slot number (0-7 for Emote, 0-3 for Action)
     * @param {boolean} hold - Whether to hold the expression (true) or release (false)
     */
    triggerExpression(type, slot, hold = false) {
        // Validate type
        if (type !== 'Emote' && type !== 'Action') {
            this.logger.warn(`Invalid expression type: ${type}. Must be 'Emote' or 'Action'.`);
            return false;
        }

        // Validate slot
        const maxSlot = type === 'Emote' ? this.EMOTE_SLOTS : this.ACTION_SLOTS;
        if (slot < 0 || slot >= maxSlot) {
            this.logger.warn(`Invalid ${type} slot: ${slot}. Must be 0-${maxSlot - 1}.`);
            return false;
        }

        // Check cooldown
        const key = `${type}_${slot}`;
        if (this._isOnCooldown(key)) {
            const remaining = this._getRemainingCooldown(key);
            this.logger.debug(`${type} slot ${slot} on cooldown (${remaining}ms remaining)`);
            return false;
        }

        // Check spam protection
        if (this._isSpamming(key)) {
            this.logger.warn(`${type} slot ${slot} spam detected, throttling`);
            return false;
        }

        // Build OSC address
        const address = type === 'Emote' 
            ? `/avatar/parameters/EmoteSlot${slot}`
            : `/avatar/parameters/ActionSlot${slot}`;

        // Send OSC message
        const value = hold ? 1 : 0;
        this.oscBridge.send(address, value);

        // Track state
        const expressionKey = `${type}_${slot}`;
        if (hold) {
            this.activeExpressions.add(expressionKey);
        } else {
            this.activeExpressions.delete(expressionKey);
        }

        // Update cooldown
        this._setCooldown(key);
        
        // Update spam history
        this._recordTrigger(key);

        this.logger.info(`😀 ${type} slot ${slot} triggered (hold: ${hold})`);
        
        // Emit event
        this.api.emit('osc:expression-triggered', {
            type,
            slot,
            hold,
            address,
            timestamp: Date.now()
        });

        return true;
    }

    /**
     * Play a combo sequence of expressions
     * @param {Array} combo - Array of combo steps
     * Each step: { type: 'Emote'|'Action', slot: number, duration: ms, pause: ms }
     */
    async playCombo(combo) {
        if (!Array.isArray(combo) || combo.length === 0) {
            this.logger.warn('Invalid combo: must be non-empty array');
            return false;
        }

        // Check if already playing
        if (this.isPlayingCombo) {
            this.logger.warn('Combo already in progress');
            return false;
        }

        this.isPlayingCombo = true;
        this.logger.info(`🎭 Playing expression combo (${combo.length} steps)`);

        try {
            for (let i = 0; i < combo.length; i++) {
                const step = combo[i];
                
                // Validate step
                if (!step.type || step.slot === undefined) {
                    this.logger.warn(`Invalid combo step ${i}:`, step);
                    continue;
                }

                const duration = step.duration || 1000;
                const pause = step.pause || 0;

                // Trigger expression (hold)
                this.triggerExpression(step.type, step.slot, true);

                // Wait for duration
                await this._sleep(duration);

                // Release expression
                this.triggerExpression(step.type, step.slot, false);

                // Pause before next step (if not last step)
                if (pause > 0 && i < combo.length - 1) {
                    await this._sleep(pause);
                }
            }

            this.logger.info('✅ Combo completed');
            
            this.api.emit('osc:combo-completed', {
                steps: combo.length,
                timestamp: Date.now()
            });

            return true;

        } catch (error) {
            this.logger.error('Error playing combo:', error);
            return false;

        } finally {
            this.isPlayingCombo = false;
        }
    }

    /**
     * Queue a combo for later playback
     */
    queueCombo(combo) {
        this.comboQueue.push(combo);
        this.logger.info(`🎬 Combo queued (queue size: ${this.comboQueue.length})`);
        
        // Start processing queue if not already
        if (!this.isPlayingCombo) {
            this._processQueue();
        }
    }

    /**
     * Stop current combo
     */
    stopCombo() {
        if (!this.isPlayingCombo) {
            return false;
        }

        this.isPlayingCombo = false;
        
        // Release all active expressions
        for (const key of this.activeExpressions) {
            const [type, slot] = key.split('_');
            this.triggerExpression(type, parseInt(slot), false);
        }
        
        this.activeExpressions.clear();
        this.logger.info('⏹️ Combo stopped');
        
        return true;
    }

    /**
     * Clear combo queue
     */
    clearQueue() {
        const count = this.comboQueue.length;
        this.comboQueue = [];
        this.logger.info(`🗑️ Combo queue cleared (${count} combos removed)`);
        return count;
    }

    /**
     * Release all active expressions
     */
    releaseAll() {
        let count = 0;
        for (const key of this.activeExpressions) {
            const [type, slot] = key.split('_');
            this.triggerExpression(type, parseInt(slot), false);
            count++;
        }
        this.activeExpressions.clear();
        this.logger.info(`🔓 Released ${count} expressions`);
        return count;
    }

    /**
     * Set cooldown for specific expression type/slot
     */
    setCooldown(type, slot, duration) {
        const key = `${type}_${slot}`;
        this.cooldowns.set(key, {
            timestamp: Date.now(),
            duration: duration || this.defaultCooldown
        });
    }

    /**
     * Check if expression is on cooldown
     */
    isOnCooldown(type, slot) {
        const key = `${type}_${slot}`;
        return this._isOnCooldown(key);
    }

    /**
     * Get remaining cooldown time
     */
    getRemainingCooldown(type, slot) {
        const key = `${type}_${slot}`;
        return this._getRemainingCooldown(key);
    }

    /**
     * Get current state
     */
    getState() {
        return {
            activeExpressions: Array.from(this.activeExpressions),
            queueLength: this.comboQueue.length,
            isPlayingCombo: this.isPlayingCombo,
            timestamp: Date.now()
        };
    }

    // Private methods

    async _processQueue() {
        while (this.comboQueue.length > 0) {
            const combo = this.comboQueue.shift();
            await this.playCombo(combo);
        }
    }

    _isOnCooldown(key) {
        const cooldown = this.cooldowns.get(key);
        if (!cooldown) return false;
        
        const elapsed = Date.now() - cooldown.timestamp;
        return elapsed < cooldown.duration;
    }

    _getRemainingCooldown(key) {
        const cooldown = this.cooldowns.get(key);
        if (!cooldown) return 0;
        
        const elapsed = Date.now() - cooldown.timestamp;
        const remaining = cooldown.duration - elapsed;
        return Math.max(0, remaining);
    }

    _setCooldown(key, duration = this.defaultCooldown) {
        this.cooldowns.set(key, {
            timestamp: Date.now(),
            duration
        });
    }

    _isSpamming(key) {
        const history = this.triggerHistory.get(key) || [];
        const now = Date.now();
        const cutoff = now - this.spamWindow;
        
        // Filter recent triggers
        const recentTriggers = history.filter(t => t > cutoff);
        
        return recentTriggers.length >= this.spamThreshold;
    }

    _recordTrigger(key) {
        if (!this.triggerHistory.has(key)) {
            this.triggerHistory.set(key, []);
        }
        
        const history = this.triggerHistory.get(key);
        history.push(Date.now());
        
        // Clean old entries
        const cutoff = Date.now() - this.spamWindow;
        const filtered = history.filter(t => t > cutoff);
        this.triggerHistory.set(key, filtered);
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clean up cooldowns and history
     */
    cleanup() {
        const now = Date.now();
        
        // Clean cooldowns
        for (const [key, cooldown] of this.cooldowns.entries()) {
            if (now - cooldown.timestamp > cooldown.duration) {
                this.cooldowns.delete(key);
            }
        }
        
        // Clean trigger history
        const cutoff = now - this.spamWindow;
        for (const [key, history] of this.triggerHistory.entries()) {
            const filtered = history.filter(t => t > cutoff);
            if (filtered.length === 0) {
                this.triggerHistory.delete(key);
            } else {
                this.triggerHistory.set(key, filtered);
            }
        }
    }

    /**
     * Start periodic cleanup
     */
    startCleanup(interval = 30000) {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, interval);
    }

    /**
     * Stop periodic cleanup
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    destroy() {
        this.stopCombo();
        this.clearQueue();
        this.releaseAll();
        this.stopCleanup();
        this.cooldowns.clear();
        this.triggerHistory.clear();
    }
}

module.exports = ExpressionController;
