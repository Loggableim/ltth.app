/**
 * OSCQuery Client
 * Enhanced client for VRChat OSCQuery auto-discovery
 * Supports HTTP endpoint queries and WebSocket subscriptions
 */

const WebSocket = require('ws');
const axios = require('axios');

class OSCQueryClient {
    constructor(host = '127.0.0.1', port = 9001, logger = console) {
        this.host = host;
        this.port = port;
        this.baseUrl = `http://${host}:${port}`;
        this.logger = logger;
        
        // WebSocket connection
        this.ws = null;
        this.wsReconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        
        // Discovered data cache
        this.parameters = new Map();  // Map<path, parameterInfo>
        this.hostInfo = null;
        this.avatarInfo = null;
        
        // Event listeners
        this.listeners = new Map(); // Map<event, Set<callback>>
        
        // State
        this.isConnected = false;
        this.lastDiscovery = null;
    }

    /**
     * Discover all parameters via HTTP
     */
    async discover() {
        try {
            this.logger.info(`🔍 OSCQuery discovery starting on ${this.baseUrl}`);

            // Query host info
            const hostInfoResponse = await axios.get(`${this.baseUrl}/?HOST_INFO`);
            this.hostInfo = hostInfoResponse.data;

            // Discover avatar parameters
            this.parameters.clear();
            await this._discoverNode('/avatar');

            this.lastDiscovery = Date.now();

            const paramArray = Array.from(this.parameters.entries()).map(([path, info]) => ({
                path,
                ...info
            }));

            this.logger.info(`✅ OSCQuery discovered ${paramArray.length} parameters`);

            return {
                hostInfo: this.hostInfo,
                parameters: paramArray,
                timestamp: this.lastDiscovery
            };

        } catch (error) {
            this.logger.error('OSCQuery discovery failed:', error);
            throw error;
        }
    }

    /**
     * Recursively discover parameters from a node
     */
    async _discoverNode(nodePath) {
        try {
            const response = await axios.get(`${this.baseUrl}${nodePath}`);
            const node = response.data;

            // If node has CONTENTS, it's a container - recurse into children
            if (node.CONTENTS) {
                for (const [key, value] of Object.entries(node.CONTENTS)) {
                    const childPath = `${nodePath}/${key}`;
                    
                    if (value.CONTENTS) {
                        // Container node - recurse
                        await this._discoverNode(childPath);
                    } else {
                        // Leaf node - this is a parameter
                        this._addParameter(childPath, value);
                    }
                }
            } else {
                // Leaf node
                this._addParameter(nodePath, node);
            }

        } catch (error) {
            this.logger.debug(`Failed to discover node ${nodePath}:`, error.message);
        }
    }

    /**
     * Add parameter to cache
     */
    _addParameter(path, data) {
        const paramInfo = {
            type: this._parseType(data.TYPE),
            access: this._parseAccess(data.ACCESS),
            value: data.VALUE,
            range: data.RANGE,
            description: data.DESCRIPTION || '',
            unit: data.UNIT || '',
            clipmode: data.CLIPMODE || ''
        };

        this.parameters.set(path, paramInfo);
    }

    /**
     * Subscribe to live updates via WebSocket
     */
    subscribe(callback) {
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.logger.warn('WebSocket already connected');
                return true;
            }

            const wsUrl = `ws://${this.host}:${this.port}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                this.isConnected = true;
                this.wsReconnectAttempts = 0;
                this.logger.info('✅ OSCQuery WebSocket connected');
                this._emit('connected', { timestamp: Date.now() });
            });

            this.ws.on('message', (data) => {
                try {
                    const update = JSON.parse(data.toString());
                    this._handleUpdate(update);
                    if (callback) callback(update);
                } catch (error) {
                    this.logger.error('OSCQuery message parse error:', error);
                }
            });

            this.ws.on('error', (error) => {
                this.logger.error('OSCQuery WebSocket error:', error);
                this._emit('error', { error: error.message });
            });

            this.ws.on('close', () => {
                this.isConnected = false;
                this.logger.info('OSCQuery WebSocket disconnected');
                this._emit('disconnected', { timestamp: Date.now() });
                
                // Auto-reconnect
                this._attemptReconnect();
            });

            return true;

        } catch (error) {
            this.logger.error('OSCQuery subscribe failed:', error);
            return false;
        }
    }

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }

    /**
     * Watch for avatar changes
     */
    async watchAvatarChange(callback) {
        try {
            // Poll /avatar/change endpoint
            const response = await axios.get(`${this.baseUrl}/avatar/change`);
            const data = response.data;
            
            if (data.VALUE !== this.avatarInfo?.id) {
                this.avatarInfo = { id: data.VALUE, changedAt: Date.now() };
                this.logger.info(`👤 Avatar changed: ${data.VALUE}`);
                
                // Re-discover parameters for new avatar
                await this.discover();
                
                if (callback) callback(this.avatarInfo);
                this._emit('avatar_changed', this.avatarInfo);
            }
        } catch (error) {
            this.logger.debug('Avatar change check failed:', error.message);
        }
    }

    /**
     * Start polling for avatar changes
     */
    startAvatarWatcher(interval = 5000, callback) {
        this.stopAvatarWatcher(); // Clear any existing watcher
        
        this.avatarWatcher = setInterval(async () => {
            await this.watchAvatarChange(callback);
        }, interval);
        
        this.logger.info('👀 Avatar change watcher started');
    }

    /**
     * Stop polling for avatar changes
     */
    stopAvatarWatcher() {
        if (this.avatarWatcher) {
            clearInterval(this.avatarWatcher);
            this.avatarWatcher = null;
        }
    }

    /**
     * Get parameter by path
     */
    getParameter(path) {
        return this.parameters.get(path);
    }

    /**
     * Get all parameters
     */
    getAllParameters() {
        return Array.from(this.parameters.entries()).map(([path, info]) => ({
            path,
            ...info
        }));
    }

    /**
     * Get parameters by pattern
     */
    getParametersByPattern(pattern) {
        const regex = new RegExp(pattern);
        return Array.from(this.parameters.entries())
            .filter(([path]) => regex.test(path))
            .map(([path, info]) => ({
                path,
                ...info
            }));
    }

    /**
     * Get parameter tree structure
     */
    getParameterTree() {
        const tree = {};
        
        for (const [path, info] of this.parameters.entries()) {
            const parts = path.split('/').filter(p => p);
            let current = tree;
            
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLast = i === parts.length - 1;
                
                if (isLast) {
                    current[part] = {
                        ...info,
                        path
                    };
                } else {
                    if (!current[part]) {
                        current[part] = {};
                    }
                    current = current[part];
                }
            }
        }
        
        return tree;
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        
        return () => this.off(event, callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            host: this.host,
            port: this.port,
            parameterCount: this.parameters.size,
            lastDiscovery: this.lastDiscovery,
            currentAvatar: this.avatarInfo
        };
    }

    // Private methods

    _handleUpdate(update) {
        // Handle parameter value updates from WebSocket
        if (update.path && update.value !== undefined) {
            const param = this.parameters.get(update.path);
            if (param) {
                param.value = update.value;
            }
            
            this._emit('parameter_update', {
                path: update.path,
                value: update.value,
                timestamp: Date.now()
            });
        }
    }

    _emit(event, data) {
        if (this.listeners.has(event)) {
            for (const callback of this.listeners.get(event)) {
                try {
                    callback(data);
                } catch (error) {
                    this.logger.error(`Error in OSCQuery listener for ${event}:`, error);
                }
            }
        }
    }

    _attemptReconnect() {
        if (this.wsReconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.warn('Max WebSocket reconnect attempts reached');
            return;
        }

        this.wsReconnectAttempts++;
        
        setTimeout(() => {
            this.logger.info(`Attempting WebSocket reconnect (${this.wsReconnectAttempts}/${this.maxReconnectAttempts})`);
            this.subscribe();
        }, this.reconnectDelay * this.wsReconnectAttempts);
    }

    _parseType(typeString) {
        // OSC type tags: i=int32, f=float32, s=string, b=blob, T=true, F=false, etc.
        if (!typeString) return 'unknown';
        
        const typeMap = {
            'i': 'int',
            'f': 'float',
            's': 'string',
            'b': 'blob',
            'T': 'bool',
            'F': 'bool'
        };
        
        return typeMap[typeString] || typeString;
    }

    _parseAccess(accessValue) {
        // OSCQuery access: 0=no value, 1=read, 2=write, 3=read/write
        const accessMap = {
            0: 'none',
            1: 'read',
            2: 'write',
            3: 'readwrite'
        };
        
        return accessMap[accessValue] || 'unknown';
    }

    destroy() {
        this.stopAvatarWatcher();
        this.disconnect();
        this.parameters.clear();
        this.listeners.clear();
    }
}

module.exports = OSCQueryClient;
