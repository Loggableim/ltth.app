/**
 * Global Initialization State Manager
 * Tracks server initialization progress to prevent race conditions
 */

class InitializationStateManager {
    constructor() {
        this.state = {
            serverStarted: false,
            pluginsLoaded: false,
            pluginsInitialized: false,
            pluginInjections: false,
            socketReady: false,
            databaseReady: false,
            ready: false
        };

        this.pluginStates = new Map();
        this.errors = [];
        this.startTime = Date.now();
    }

    /**
     * Mark database as ready
     */
    setDatabaseReady() {
        this.state.databaseReady = true;
        this.checkFullyReady();
    }

    /**
     * Mark plugins as loaded (files read, not initialized yet)
     */
    setPluginsLoaded(count) {
        this.state.pluginsLoaded = true;
        this.pluginCount = count;
        this.checkFullyReady();
    }

    /**
     * Mark a specific plugin as initialized
     */
    setPluginInitialized(pluginId, success, error = null) {
        this.pluginStates.set(pluginId, {
            initialized: success,
            error: error,
            timestamp: Date.now()
        });

        // Check if all plugins are initialized
        const allInitialized = Array.from(this.pluginStates.values())
            .every(state => state.initialized);

        if (allInitialized && this.pluginStates.size === this.pluginCount) {
            this.state.pluginsInitialized = true;
            this.checkFullyReady();
        }
    }

    /**
     * Mark plugin injections as complete
     */
    setPluginInjectionsComplete() {
        this.state.pluginInjections = true;
        this.checkFullyReady();
    }

    /**
     * Mark socket.io as ready
     */
    setSocketReady() {
        this.state.socketReady = true;
        this.checkFullyReady();
    }

    /**
     * Mark server as started
     */
    setServerStarted() {
        this.state.serverStarted = true;
        this.checkFullyReady();
    }

    /**
     * Add an error to the error log
     */
    addError(component, message, error) {
        this.errors.push({
            component,
            message,
            error: error?.message || error,
            timestamp: Date.now()
        });
    }

    /**
     * Check if all systems are ready
     */
    checkFullyReady() {
        const wasReady = this.state.ready;

        this.state.ready =
            this.state.databaseReady &&
            this.state.pluginsLoaded &&
            this.state.pluginsInitialized &&
            this.state.pluginInjections &&
            this.state.socketReady &&
            this.state.serverStarted;

        if (!wasReady && this.state.ready) {
            const elapsed = Date.now() - this.startTime;
            console.log(`✅ System fully initialized in ${elapsed}ms`);
        }
    }

    /**
     * Get current state
     */
    getState() {
        return {
            ...this.state,
            pluginStates: Array.from(this.pluginStates.entries()).map(([id, state]) => ({
                id,
                ...state
            })),
            errors: this.errors,
            uptime: Date.now() - this.startTime
        };
    }

    /**
     * Wait for system to be ready
     */
    async waitForReady(timeout = 30000) {
        if (this.state.ready) {
            return true;
        }

        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                if (this.state.ready) {
                    clearInterval(checkInterval);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    reject(new Error('Initialization timeout'));
                }
            }, 100);
        });
    }
}

// Singleton instance
const initState = new InitializationStateManager();

module.exports = initState;
