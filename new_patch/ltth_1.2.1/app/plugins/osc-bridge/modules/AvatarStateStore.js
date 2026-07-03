/**
 * Avatar State Store
 * Centralized state management for avatar parameters and PhysBones
 * Handles real-time tracking and event-driven updates
 */

class AvatarStateStore {
    constructor(api) {
        this.api = api;
        this.state = {
            parameters: new Map(),      // Map<address, {value, type, timestamp}>
            physbones: new Map(),        // Map<boneName, {parameters}>
            currentAvatar: null,
            lastUpdate: null
        };
        
        this.history = new Map();        // Map<address, Array<{value, timestamp}>>
        this.maxHistoryAge = 60000;      // 60 seconds
        this.maxHistoryEntries = 1000;   // Max entries per parameter
        
        this.updateThrottle = 100;       // 100ms throttle for UI updates
        this.lastUIUpdate = 0;
        this.pendingUIUpdate = null;
        
        this.listeners = new Set();
    }

    /**
     * Update a parameter value
     */
    updateParameter(address, value, type = 'unknown') {
        const timestamp = Date.now();
        
        // Update current state
        this.state.parameters.set(address, {
            value,
            type,
            timestamp
        });
        
        this.state.lastUpdate = timestamp;
        
        // Update history
        this._addToHistory(address, value, timestamp);
        
        // Extract PhysBones data if applicable
        if (address.includes('/physbones/')) {
            this._updatePhysBone(address, value, timestamp);
        }
        
        // Notify listeners
        this._notifyListeners({
            type: 'parameter_update',
            address,
            value,
            timestamp
        });
        
        // Schedule throttled UI update
        this._scheduleUIUpdate();
    }

    /**
     * Update multiple parameters at once
     */
    updateBatch(updates) {
        const timestamp = Date.now();
        
        for (const { address, value, type } of updates) {
            this.state.parameters.set(address, {
                value,
                type: type || 'unknown',
                timestamp
            });
            
            this._addToHistory(address, value, timestamp);
            
            if (address.includes('/physbones/')) {
                this._updatePhysBone(address, value, timestamp);
            }
        }
        
        this.state.lastUpdate = timestamp;
        
        this._notifyListeners({
            type: 'batch_update',
            count: updates.length,
            timestamp
        });
        
        this._scheduleUIUpdate();
    }

    /**
     * Set current avatar
     */
    setCurrentAvatar(avatarId, avatarName = null) {
        this.state.currentAvatar = {
            id: avatarId,
            name: avatarName,
            loadedAt: Date.now()
        };
        
        // Clear old state on avatar change
        this.state.parameters.clear();
        this.state.physbones.clear();
        this.history.clear();
        
        this._notifyListeners({
            type: 'avatar_changed',
            avatar: this.state.currentAvatar
        });
        
        this._scheduleUIUpdate();
    }

    /**
     * Get parameter value
     */
    getParameter(address) {
        return this.state.parameters.get(address);
    }

    /**
     * Get all parameters
     */
    getAllParameters() {
        return Array.from(this.state.parameters.entries()).map(([address, data]) => ({
            address,
            ...data
        }));
    }

    /**
     * Get parameters matching a pattern
     */
    getParametersByPattern(pattern) {
        const regex = new RegExp(pattern);
        return Array.from(this.state.parameters.entries())
            .filter(([address]) => regex.test(address))
            .map(([address, data]) => ({
                address,
                ...data
            }));
    }

    /**
     * Get PhysBone state
     */
    getPhysBone(boneName) {
        return this.state.physbones.get(boneName);
    }

    /**
     * Get all PhysBones
     */
    getAllPhysBones() {
        return Array.from(this.state.physbones.entries()).map(([name, data]) => ({
            name,
            ...data
        }));
    }

    /**
     * Get parameter history
     */
    getHistory(address, duration = this.maxHistoryAge) {
        const history = this.history.get(address) || [];
        const cutoff = Date.now() - duration;
        return history.filter(h => h.timestamp > cutoff);
    }

    /**
     * Get full state snapshot
     */
    getState() {
        return {
            parameters: this.getAllParameters(),
            physbones: this.getAllPhysBones(),
            currentAvatar: this.state.currentAvatar,
            lastUpdate: this.state.lastUpdate,
            timestamp: Date.now()
        };
    }

    /**
     * Subscribe to state changes
     */
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Clean old history entries
     */
    cleanHistory() {
        const cutoff = Date.now() - this.maxHistoryAge;
        
        for (const [address, history] of this.history.entries()) {
            const filtered = history.filter(h => h.timestamp > cutoff);
            
            // Also limit by max entries
            if (filtered.length > this.maxHistoryEntries) {
                filtered.splice(0, filtered.length - this.maxHistoryEntries);
            }
            
            if (filtered.length === 0) {
                this.history.delete(address);
            } else {
                this.history.set(address, filtered);
            }
        }
    }

    /**
     * Start auto-cleanup
     */
    startCleanup(interval = 10000) {
        this.cleanupInterval = setInterval(() => {
            this.cleanHistory();
        }, interval);
    }

    /**
     * Stop auto-cleanup
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Clear all state
     */
    clear() {
        this.state.parameters.clear();
        this.state.physbones.clear();
        this.history.clear();
        this.state.currentAvatar = null;
        this.state.lastUpdate = null;
        
        this._notifyListeners({
            type: 'state_cleared',
            timestamp: Date.now()
        });
    }

    // Private methods

    _addToHistory(address, value, timestamp) {
        if (!this.history.has(address)) {
            this.history.set(address, []);
        }
        
        const history = this.history.get(address);
        history.push({ value, timestamp });
        
        // Limit history size
        if (history.length > this.maxHistoryEntries) {
            history.shift();
        }
    }

    _updatePhysBone(address, value, timestamp) {
        // Extract bone name from address like /avatar/physbones/Tail/Angle
        const match = address.match(/\/avatar\/physbones\/([^\/]+)\/(.+)/);
        if (!match) return;
        
        const [, boneName, parameter] = match;
        
        if (!this.state.physbones.has(boneName)) {
            this.state.physbones.set(boneName, {
                parameters: {},
                lastUpdate: timestamp
            });
        }
        
        const bone = this.state.physbones.get(boneName);
        bone.parameters[parameter] = value;
        bone.lastUpdate = timestamp;
    }

    _notifyListeners(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                console.error('Error in AvatarStateStore listener:', error);
            }
        }
    }

    _scheduleUIUpdate() {
        const now = Date.now();
        
        // If enough time has passed, update immediately
        if (now - this.lastUIUpdate >= this.updateThrottle) {
            this._emitUIUpdate();
            this.lastUIUpdate = now;
            return;
        }
        
        // Otherwise schedule update
        if (!this.pendingUIUpdate) {
            const delay = this.updateThrottle - (now - this.lastUIUpdate);
            this.pendingUIUpdate = setTimeout(() => {
                this._emitUIUpdate();
                this.lastUIUpdate = Date.now();
                this.pendingUIUpdate = null;
            }, delay);
        }
    }

    _emitUIUpdate() {
        if (this.api) {
            this.api.emit('osc:state-update', this.getState());
        }
    }

    destroy() {
        this.stopCleanup();
        if (this.pendingUIUpdate) {
            clearTimeout(this.pendingUIUpdate);
        }
        this.clear();
        this.listeners.clear();
    }
}

module.exports = AvatarStateStore;
