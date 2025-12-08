/**
 * HybridShock Client - WebSocket + HTTP API Client
 *
 * Bietet eine einheitliche Schnittstelle zur HybridShock API:
 * - WebSocket-Verbindung (Port 8833) für Events und Echtzeit-Kommunikation
 * - HTTP REST API (Port 8832) für Actions, Info, Features
 * - Auto-Reconnect mit exponential backoff
 * - Event-basierte Architektur mit EventEmitter-Pattern
 * - Connection-Health-Monitoring mit Heartbeat
 */

const WebSocket = require('ws');
const axios = require('axios');
const EventEmitter = require('events');

class HybridShockClient extends EventEmitter {
    constructor(config = {}) {
        super();

        // Configuration
        this.config = {
            httpHost: config.httpHost || '127.0.0.1',
            httpPort: config.httpPort || 8832,
            wsHost: config.wsHost || '127.0.0.1',
            wsPort: config.wsPort || 8833,
            autoReconnect: config.autoReconnect !== false,
            reconnectInterval: config.reconnectInterval || 5000,
            reconnectMaxInterval: config.reconnectMaxInterval || 30000,
            reconnectDecay: config.reconnectDecay || 1.5,
            heartbeatInterval: config.heartbeatInterval || 30000,
            requestTimeout: config.requestTimeout || 10000
        };

        // State
        this.ws = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.lastHeartbeat = null;

        // Cache
        this.categories = [];
        this.actions = [];
        this.events = [];
        this.appInfo = null;

        // Statistics
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            actionsSent: 0,
            eventsReceived: 0,
            errors: 0,
            connectionCount: 0,
            lastError: null,
            connectedSince: null,
            uptime: 0
        };

        // WebSocket Request/Response-Tracking
        this.pendingRequests = new Map();
        this.requestIdCounter = 0;

        // HTTP Client
        this.httpClient = axios.create({
            baseURL: `http://${this.config.httpHost}:${this.config.httpPort}`,
            timeout: this.config.requestTimeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // HTTP Error Interceptor
        this.httpClient.interceptors.response.use(
            response => response,
            error => {
                this.stats.errors++;
                this.stats.lastError = {
                    type: 'http',
                    message: error.message,
                    timestamp: Date.now()
                };
                this.emit('error', {
                    type: 'http',
                    error: error.message,
                    url: error.config?.url
                });
                throw error;
            }
        );
    }

    /**
     * WebSocket-Verbindung herstellen
     */
    async connect() {
        if (this.isConnected || this.isConnecting) {
            return;
        }

        this.isConnecting = true;
        this.emit('connecting');

        try {
            const wsUrl = `ws://${this.config.wsHost}:${this.config.wsPort}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => this.handleOpen());
            this.ws.on('message', (data) => this.handleMessage(data));
            this.ws.on('close', (code, reason) => this.handleClose(code, reason));
            this.ws.on('error', (error) => this.handleError(error));
            this.ws.on('ping', () => this.handlePing());
            this.ws.on('pong', () => this.handlePong());

        } catch (error) {
            this.isConnecting = false;
            this.handleError(error);

            if (this.config.autoReconnect) {
                this.scheduleReconnect();
            }
        }
    }

    /**
     * WebSocket-Verbindung trennen
     */
    disconnect() {
        this.config.autoReconnect = false;
        this.clearReconnectTimer();
        this.clearHeartbeatTimer();

        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }

        this.isConnected = false;
        this.isConnecting = false;
        this.emit('disconnected', { manual: true });
    }

    /**
     * WebSocket Open Handler
     */
    handleOpen() {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.stats.connectionCount++;
        this.stats.connectedSince = Date.now();

        this.clearReconnectTimer();
        this.startHeartbeat();

        this.emit('connected');
        this.log('WebSocket connected', 'info');
    }

    /**
     * WebSocket Message Handler
     */
    handleMessage(data) {
        this.stats.messagesReceived++;

        try {
            const message = JSON.parse(data.toString());

            // Response mit Request-ID (für Request/Response-Pattern)
            if (message.requestId && this.pendingRequests.has(message.requestId)) {
                const { resolve, reject } = this.pendingRequests.get(message.requestId);
                this.pendingRequests.delete(message.requestId);

                if (message.error) {
                    reject(new Error(message.error));
                } else {
                    resolve(message.data || message);
                }
                return;
            }

            // Event von HybridShock empfangen
            if (message.type === 'event') {
                this.stats.eventsReceived++;
                this.emit('hybridshock:event', message.data);
            }

            // Categories Update Event (vom Server gepusht)
            else if (message.type === 'categories' || message.type === 'categoriesUpdate') {
                this.categories = message.data || message.categories || [];
                this.emit('categories:update', this.categories);
                this.log(`Categories updated: ${this.categories.length} categories`, 'info');
            }

            // Actions Update Event (vom Server gepusht)
            else if (message.type === 'actions' || message.type === 'actionsUpdate') {
                this.actions = message.data || message.actions || [];
                this.emit('actions:update', this.actions);
                this.log(`Actions updated: ${this.actions.length} actions`, 'info');
            }

            // Events Update Event (vom Server gepusht)
            else if (message.type === 'events' || message.type === 'eventsUpdate') {
                this.events = message.data || message.events || [];
                this.emit('events:update', this.events);
                this.log(`Events updated: ${this.events.length} events`, 'info');
            }

            // Features Update (kombiniert: categories + actions + events)
            else if (message.type === 'features' || message.type === 'featuresUpdate') {
                if (message.categories) {
                    this.categories = message.categories;
                    this.emit('categories:update', this.categories);
                }
                if (message.actions) {
                    this.actions = message.actions;
                    this.emit('actions:update', this.actions);
                }
                if (message.events) {
                    this.events = message.events;
                    this.emit('events:update', this.events);
                }
                this.emit('features:update', {
                    categories: this.categories,
                    actions: this.actions,
                    events: this.events
                });
                this.log('Features updated from server', 'info');
            }

            // Response auf Action
            else if (message.type === 'action:response') {
                this.emit('action:response', message.data);
            }

            // Error-Message
            else if (message.type === 'error') {
                this.handleError(new Error(message.message || 'Unknown error'));
            }

            // Pong (Heartbeat-Response)
            else if (message.type === 'pong') {
                this.lastHeartbeat = Date.now();
            }

            // Generic message event
            this.emit('message', message);

        } catch (error) {
            this.log(`Failed to parse message: ${error.message}`, 'error');
            this.stats.errors++;
        }
    }

    /**
     * WebSocket Close Handler
     */
    handleClose(code, reason) {
        const wasConnected = this.isConnected;

        this.isConnected = false;
        this.isConnecting = false;
        this.clearHeartbeatTimer();

        if (this.stats.connectedSince) {
            this.stats.uptime += Date.now() - this.stats.connectedSince;
            this.stats.connectedSince = null;
        }

        this.emit('disconnected', {
            code,
            reason: reason?.toString(),
            wasConnected
        });

        this.log(`WebSocket closed (code: ${code}, reason: ${reason || 'none'})`, 'warn');

        // Auto-Reconnect
        if (this.config.autoReconnect && code !== 1000) {
            this.scheduleReconnect();
        }
    }

    /**
     * WebSocket Error Handler
     */
    handleError(error) {
        this.stats.errors++;
        this.stats.lastError = {
            type: 'websocket',
            message: error.message,
            timestamp: Date.now()
        };

        this.emit('error', {
            type: 'websocket',
            error: error.message
        });

        this.log(`WebSocket error: ${error.message}`, 'error');
    }

    /**
     * WebSocket Ping Handler
     */
    handlePing() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.pong();
        }
    }

    /**
     * WebSocket Pong Handler
     */
    handlePong() {
        this.lastHeartbeat = Date.now();
    }

    /**
     * Heartbeat starten (Connection-Health-Check)
     */
    startHeartbeat() {
        this.clearHeartbeatTimer();

        this.heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();

                // Check ob letzte Heartbeat zu lange her
                if (this.lastHeartbeat && Date.now() - this.lastHeartbeat > this.config.heartbeatInterval * 2) {
                    this.log('Heartbeat timeout - reconnecting', 'warn');
                    this.ws.close(1001, 'Heartbeat timeout');
                }
            }
        }, this.config.heartbeatInterval);
    }

    /**
     * Heartbeat stoppen
     */
    clearHeartbeatTimer() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Reconnect planen (mit exponential backoff)
     */
    scheduleReconnect() {
        this.clearReconnectTimer();

        const interval = Math.min(
            this.config.reconnectInterval * Math.pow(this.config.reconnectDecay, this.reconnectAttempts),
            this.config.reconnectMaxInterval
        );

        this.reconnectAttempts++;

        this.log(`Reconnecting in ${Math.round(interval / 1000)}s (attempt ${this.reconnectAttempts})`, 'info');

        this.emit('reconnecting', {
            attempt: this.reconnectAttempts,
            interval
        });

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, interval);
    }

    /**
     * Reconnect-Timer löschen
     */
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * HTTP: App-Info abrufen (GET /api/app/info)
     */
    async getAppInfo() {
        try {
            const response = await this.httpClient.get('/api/app/info');
            this.appInfo = response.data;
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get app info: ${error.message}`);
        }
    }

    /**
     * HTTP: Verfügbare Kategorien abrufen (GET /api/features/categories)
     */
    async getCategories() {
        try {
            const response = await this.httpClient.get('/api/features/categories');
            this.categories = response.data;
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get categories: ${error.message}`);
        }
    }

    /**
     * HTTP: Verfügbare Actions abrufen (GET /api/features/actions)
     */
    async getActions() {
        try {
            const response = await this.httpClient.get('/api/features/actions');
            this.actions = response.data;
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get actions: ${error.message}`);
        }
    }

    /**
     * HTTP: Verfügbare Events abrufen (GET /api/features/events)
     */
    async getEvents() {
        try {
            const response = await this.httpClient.get('/api/features/events');
            this.events = response.data;
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get events: ${error.message}`);
        }
    }

    /**
     * HTTP: Action triggern (POST /api/send/{category}/{action})
     * @param {string} category - Kategorie (z.B. 'shock', 'message')
     * @param {string} action - Action (z.B. 'pulse', 'hello')
     * @param {object} context - Optionales Context-Objekt
     */
    async sendAction(category, action, context = {}) {
        try {
            const response = await this.httpClient.post(
                `/api/send/${category}/${action}`,
                context
            );

            this.stats.actionsSent++;
            this.stats.messagesSent++;

            this.emit('action:sent', {
                category,
                action,
                context,
                response: response.data
            });

            return response.data;
        } catch (error) {
            throw new Error(`Failed to send action ${category}/${action}: ${error.message}`);
        }
    }

    /**
     * WebSocket: Event subscriben
     * @param {string} eventType - Event-Type (z.B. 'shock:completed')
     */
    subscribeEvent(eventType) {
        if (!this.isConnected) {
            throw new Error('Not connected to WebSocket');
        }

        this.sendWebSocketMessage({
            type: 'subscribe',
            event: eventType
        });
    }

    /**
     * WebSocket: Event unsubscriben
     * @param {string} eventType - Event-Type
     */
    unsubscribeEvent(eventType) {
        if (!this.isConnected) {
            throw new Error('Not connected to WebSocket');
        }

        this.sendWebSocketMessage({
            type: 'unsubscribe',
            event: eventType
        });
    }

    /**
     * WebSocket: Message senden
     * @param {object} message - Message-Objekt
     */
    sendWebSocketMessage(message) {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }

        this.ws.send(JSON.stringify(message));
        this.stats.messagesSent++;
    }

    /**
     * WebSocket: Request senden mit Response-Erwartung (Promise-basiert)
     * @param {object} message - Message-Objekt
     * @param {number} timeout - Timeout in Millisekunden (default: 10000)
     * @returns {Promise} - Resolves mit Response-Data
     */
    sendWebSocketRequest(message, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not connected'));
                return;
            }

            // Generiere eindeutige Request-ID
            const requestId = `req_${this.requestIdCounter++}_${Date.now()}`;
            message.requestId = requestId;

            // Speichere Promise-Handler
            this.pendingRequests.set(requestId, { resolve, reject });

            // Timeout setzen
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('WebSocket request timeout'));
                }
            }, timeout);

            // Cleanup bei Resolve/Reject
            const originalResolve = resolve;
            const originalReject = reject;

            this.pendingRequests.set(requestId, {
                resolve: (data) => {
                    clearTimeout(timeoutId);
                    originalResolve(data);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    originalReject(error);
                }
            });

            // Message senden
            this.ws.send(JSON.stringify(message));
            this.stats.messagesSent++;
        });
    }

    /**
     * WebSocket: App-Info abrufen (Alternative zu HTTP)
     * @returns {Promise<object>}
     */
    async getAppInfoViaWebSocket() {
        try {
            const data = await this.sendWebSocketRequest({
                type: 'getAppInfo'
            });
            this.appInfo = data;
            return data;
        } catch (error) {
            throw new Error(`Failed to get app info via WebSocket: ${error.message}`);
        }
    }

    /**
     * WebSocket: Kategorien abrufen (Alternative zu HTTP)
     * @returns {Promise<array>}
     */
    async getCategoriesViaWebSocket() {
        try {
            const data = await this.sendWebSocketRequest({
                type: 'getCategories'
            });
            this.categories = data;
            return data;
        } catch (error) {
            throw new Error(`Failed to get categories via WebSocket: ${error.message}`);
        }
    }

    /**
     * WebSocket: Actions abrufen (Alternative zu HTTP)
     * @returns {Promise<array>}
     */
    async getActionsViaWebSocket() {
        try {
            const data = await this.sendWebSocketRequest({
                type: 'getActions'
            });
            this.actions = data;
            return data;
        } catch (error) {
            throw new Error(`Failed to get actions via WebSocket: ${error.message}`);
        }
    }

    /**
     * WebSocket: Events abrufen (Alternative zu HTTP)
     * @returns {Promise<array>}
     */
    async getEventsViaWebSocket() {
        try {
            const data = await this.sendWebSocketRequest({
                type: 'getEvents'
            });
            this.events = data;
            return data;
        } catch (error) {
            throw new Error(`Failed to get events via WebSocket: ${error.message}`);
        }
    }

    /**
     * WebSocket: Action senden (Alternative zu HTTP)
     * @param {string} category - Kategorie
     * @param {string} action - Action
     * @param {object} context - Context-Objekt
     * @returns {Promise<object>}
     */
    async sendActionViaWebSocket(category, action, context = {}) {
        try {
            const data = await this.sendWebSocketRequest({
                type: 'sendAction',
                category,
                action,
                context
            });

            this.stats.actionsSent++;

            this.emit('action:sent', {
                category,
                action,
                context,
                response: data,
                via: 'websocket'
            });

            return data;
        } catch (error) {
            throw new Error(`Failed to send action via WebSocket: ${error.message}`);
        }
    }

    /**
     * WebSocket: Alle Features abrufen (kombiniert)
     * @returns {Promise<object>}
     */
    async getAllFeaturesViaWebSocket() {
        try {
            const [categories, actions, events] = await Promise.all([
                this.getCategoriesViaWebSocket(),
                this.getActionsViaWebSocket(),
                this.getEventsViaWebSocket()
            ]);

            return { categories, actions, events };
        } catch (error) {
            throw new Error(`Failed to get features via WebSocket: ${error.message}`);
        }
    }

    /**
     * Verbindungstest durchführen
     */
    async testConnection() {
        const results = {
            http: false,
            websocket: false,
            appInfo: null,
            error: null
        };

        try {
            // HTTP-Test
            results.appInfo = await this.getAppInfo();
            results.http = true;
        } catch (error) {
            results.error = error.message;
        }

        // WebSocket-Test
        results.websocket = this.isConnected;

        return results;
    }

    /**
     * Status-Objekt zurückgeben
     */
    getStatus() {
        return {
            connected: this.isConnected,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            lastHeartbeat: this.lastHeartbeat,
            uptime: this.stats.connectedSince
                ? this.stats.uptime + (Date.now() - this.stats.connectedSince)
                : this.stats.uptime,
            stats: { ...this.stats }
        };
    }

    /**
     * Statistiken zurücksetzen
     */
    resetStats() {
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            actionsSent: 0,
            eventsReceived: 0,
            errors: 0,
            connectionCount: this.stats.connectionCount,
            lastError: null,
            connectedSince: this.stats.connectedSince,
            uptime: 0
        };
    }

    /**
     * Logging (kann überschrieben werden)
     */
    log(message, level = 'info') {
        this.emit('log', { message, level, timestamp: Date.now() });
    }

    /**
     * Cleanup & Destroy
     */
    destroy() {
        this.disconnect();
        this.removeAllListeners();
    }
}

module.exports = HybridShockClient;
