/**
 * Client-Side Initialization Helper
 * Prevents race conditions by waiting for server to be fully initialized
 */

class InitializationHelper {
    constructor() {
        this.ready = false;
        this.state = null;
        this.callbacks = [];
    }

    /**
     * Wait for server to be fully initialized
     * @param {number} timeout - Max time to wait in ms (default 30000)
     * @returns {Promise<boolean>}
     */
    async waitForReady(timeout = 30000) {
        if (this.ready) {
            return true;
        }

        // Try to fetch init state
        try {
            const response = await fetch('/api/init-state');
            const state = await response.json();
            this.state = state;

            if (state.ready) {
                this.ready = true;
                this._triggerCallbacks();
                return true;
            }

            // If not ready, poll until ready or timeout
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                const checkInterval = setInterval(async () => {
                    try {
                        const response = await fetch('/api/init-state');
                        const state = await response.json();
                        this.state = state;

                        if (state.ready) {
                            clearInterval(checkInterval);
                            this.ready = true;
                            this._triggerCallbacks();
                            resolve(true);
                        } else if (Date.now() - startTime > timeout) {
                            clearInterval(checkInterval);
                            console.warn('Initialization timeout - proceeding anyway', state);
                            reject(new Error('Initialization timeout'));
                        }
                    } catch (error) {
                        clearInterval(checkInterval);
                        console.error('Failed to check init state:', error);
                        reject(error);
                    }
                }, 500); // Check every 500ms
            });
        } catch (error) {
            console.error('Failed to fetch init state:', error);
            // If we can't fetch state, assume ready to avoid blocking
            this.ready = true;
            return true;
        }
    }

    /**
     * Register a callback to be called when system is ready
     * @param {Function} callback
     */
    onReady(callback) {
        if (this.ready) {
            callback(this.state);
        } else {
            this.callbacks.push(callback);
        }
    }

    /**
     * Get current state
     * @returns {Object|null}
     */
    getState() {
        return this.state;
    }

    /**
     * Check if a specific component is ready
     * @param {string} component - Component name (e.g., 'pluginsInitialized', 'socketReady')
     * @returns {boolean}
     */
    isComponentReady(component) {
        return this.state && this.state[component] === true;
    }

    /**
     * Trigger all registered callbacks
     * @private
     */
    _triggerCallbacks() {
        this.callbacks.forEach(callback => {
            try {
                callback(this.state);
            } catch (error) {
                console.error('Error in init callback:', error);
            }
        });
        this.callbacks = [];
    }

    /**
     * Listen for init state updates via socket
     * @param {Socket} socket - Socket.io socket instance
     */
    listenForUpdates(socket) {
        if (!socket) return;

        socket.on('init:state', (state) => {
            this.state = state;
            if (state.ready && !this.ready) {
                this.ready = true;
                this._triggerCallbacks();
                console.log('✅ Server initialization complete');
            }
        });
    }
}

// Create singleton instance
const initHelper = new InitializationHelper();

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.initHelper = initHelper;
}

// Initialize Lucide icons after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
} else {
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
