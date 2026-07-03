/**
 * Debug Logger Module
 * Provides centralized, runtime-toggleable debug logging for diagnostics
 */

class DebugLogger {
    constructor(maxEntries = 1000) {
        this.entries = [];
        this.maxEntries = maxEntries;
        this.enabled = false;
        this.filters = {
            'goals': true,
            'websocket': true,
            'ui': true,
            'tiktok': true,
            'csp': true,
            'errors': true,
            'socket-emit': true,
            'socket-receive': true
        };
        this.startTime = Date.now();
    }

    /**
     * Log a debug entry
     * @param {string} category - Category of the log entry
     * @param {string} message - Log message
     * @param {*} data - Optional data to log
     * @param {string} level - Log level (info, warn, error, debug)
     */
    log(category, message, data = null, level = 'info') {
        if (!this.enabled) return;
        if (!this.filters[category]) return;

        const entry = {
            id: this.entries.length,
            timestamp: new Date().toISOString(),
            elapsed_ms: Date.now() - this.startTime,
            category,
            level,
            message,
            data: data ? JSON.stringify(data).substring(0, 500) : null
        };

        this.entries.push(entry);
        
        // Maintain max entries limit
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }

        // Console output for local development
        const color = {
            'info': '\x1b[36m',
            'warn': '\x1b[33m',
            'error': '\x1b[31m',
            'debug': '\x1b[35m'
        }[level] || '\x1b[0m';

        console.log(`${color}[DEBUG:${category.toUpperCase()}] ${message}\x1b[0m`, data || '');
    }

    /**
     * Get filtered logs
     * @param {string} category - Filter by category
     * @param {string} level - Filter by level
     * @param {number} limit - Max number of entries to return
     * @returns {Array} Filtered log entries
     */
    getLogs(category = null, level = null, limit = 200) {
        let filtered = this.entries;

        if (category) {
            filtered = filtered.filter(e => e.category === category);
        }
        if (level) {
            filtered = filtered.filter(e => e.level === level);
        }

        return filtered.slice(-limit);
    }

    /**
     * Get statistics about logs
     * @returns {Object} Statistics object
     */
    getStats() {
        const byCategory = {};
        const byLevel = {};

        this.entries.forEach(e => {
            byCategory[e.category] = (byCategory[e.category] || 0) + 1;
            byLevel[e.level] = (byLevel[e.level] || 0) + 1;
        });

        return {
            total: this.entries.length,
            byCategory,
            byLevel,
            enabled: this.enabled,
            uptime_ms: Date.now() - this.startTime
        };
    }

    /**
     * Enable or disable debug logging
     * @param {boolean} enabled - Enable state
     */
    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        console.log(`[DEBUG-LOGGER] ${this.enabled ? 'Enabled' : 'Disabled'}`);
    }

    /**
     * Set filter for a specific category
     * @param {string} category - Category name
     * @param {boolean} enabled - Enable state for this category
     */
    setFilter(category, enabled) {
        if (this.filters.hasOwnProperty(category)) {
            this.filters[category] = Boolean(enabled);
        }
    }

    /**
     * Clear all log entries
     */
    clear() {
        this.entries = [];
        this.startTime = Date.now();
        console.log('[DEBUG-LOGGER] Logs cleared');
    }

    /**
     * Export all logs for download
     * @returns {Object} Export data
     */
    export() {
        return {
            exported_at: new Date().toISOString(),
            entries: this.entries,
            stats: this.getStats()
        };
    }
}

// Export singleton instance
module.exports = new DebugLogger();
