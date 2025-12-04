/**
 * Minecraft WebSocket Server
 * 
 * Manages WebSocket connections to Minecraft Fabric mod
 * Handles bidirectional communication and connection state
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class MinecraftWebSocketServer extends EventEmitter {
    constructor(config, logger) {
        super();
        this.config = config;
        this.logger = logger;
        
        this.wss = null;
        this.client = null;
        this.isRunning = false;
        this.availableActions = [];
        this.connectionStatus = 'Disconnected';
        
        // Heartbeat
        this.heartbeatTimer = null;
        this.lastHeartbeat = null;
    }

    /**
     * Start the WebSocket server
     */
    start() {
        if (this.isRunning) {
            this.logger.warn('Minecraft WebSocket server already running');
            return;
        }

        try {
            const port = this.config.websocket?.port || 25560;
            const host = this.config.websocket?.host || 'localhost';

            this.wss = new WebSocket.Server({ 
                host,
                port,
                clientTracking: true
            });

            this.wss.on('connection', (ws) => this.handleConnection(ws));
            this.wss.on('error', (error) => this.handleServerError(error));

            this.isRunning = true;
            this.connectionStatus = 'Waiting';
            
            this.logger.info(`Minecraft WebSocket server started on ${host}:${port}`);
            this.emit('server:started', { host, port });
        } catch (error) {
            this.logger.error(`Failed to start WebSocket server: ${error.message}`);
            this.emit('server:error', error);
            throw error;
        }
    }

    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws) {
        this.logger.info('Minecraft mod connected');
        
        // Close existing client if any
        if (this.client && this.client.readyState === WebSocket.OPEN) {
            this.client.close(1000, 'New connection established');
        }

        this.client = ws;
        this.connectionStatus = 'Connected';
        this.lastHeartbeat = Date.now();

        // Set up event handlers
        ws.on('message', (data) => this.handleMessage(data));
        ws.on('close', (code, reason) => this.handleDisconnect(code, reason));
        ws.on('error', (error) => this.handleClientError(error));
        ws.on('pong', () => {
            this.lastHeartbeat = Date.now();
        });

        // Start heartbeat
        this.startHeartbeat();

        // Emit connection event
        this.emit('client:connected');
        this.emit('status:changed', this.connectionStatus);
    }

    /**
     * Handle incoming messages from Minecraft mod
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'available_actions':
                    this.availableActions = message.actions || [];
                    this.logger.info(`Received ${this.availableActions.length} available actions from Minecraft`);
                    this.emit('actions:updated', this.availableActions);
                    break;

                case 'action_result':
                    this.emit('action:result', message);
                    break;

                case 'heartbeat':
                    // Heartbeat acknowledged
                    break;

                case 'error':
                    this.logger.error(`Minecraft mod error: ${message.error}`);
                    this.emit('client:error', message);
                    break;

                default:
                    this.logger.warn(`Unknown message type: ${message.type}`);
            }
        } catch (error) {
            this.logger.error(`Failed to parse message: ${error.message}`);
        }
    }

    /**
     * Handle client disconnect
     */
    handleDisconnect(code, reason) {
        this.logger.info(`Minecraft mod disconnected: ${code} - ${reason}`);
        this.stopHeartbeat();
        this.client = null;
        this.connectionStatus = 'Disconnected';
        this.availableActions = [];
        
        this.emit('client:disconnected', { code, reason });
        this.emit('status:changed', this.connectionStatus);
        this.emit('actions:updated', []);
    }

    /**
     * Handle client errors
     */
    handleClientError(error) {
        this.logger.error(`WebSocket client error: ${error.message}`);
        this.emit('client:error', error);
    }

    /**
     * Handle server errors
     */
    handleServerError(error) {
        this.logger.error(`WebSocket server error: ${error.message}`);
        this.emit('server:error', error);
    }

    /**
     * Send command to Minecraft mod
     */
    async sendCommand(action, params = {}) {
        if (!this.isConnected()) {
            throw new Error('Minecraft mod not connected');
        }

        const command = {
            type: 'execute_action',
            action,
            params,
            timestamp: Date.now()
        };

        return new Promise((resolve, reject) => {
            try {
                this.client.send(JSON.stringify(command), (error) => {
                    if (error) {
                        this.logger.error(`Failed to send command: ${error.message}`);
                        reject(error);
                    } else {
                        this.logger.debug(`Sent command: ${action}`);
                        resolve();
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Start heartbeat to check connection
     */
    startHeartbeat() {
        this.stopHeartbeat();
        
        const interval = this.config.websocket?.heartbeatInterval || 30000;
        
        this.heartbeatTimer = setInterval(() => {
            if (!this.isConnected()) {
                this.stopHeartbeat();
                return;
            }

            // Check if last heartbeat was too long ago
            const timeSinceLastBeat = Date.now() - this.lastHeartbeat;
            if (timeSinceLastBeat > interval * 2) {
                this.logger.warn('Heartbeat timeout, closing connection');
                this.client.terminate();
                return;
            }

            // Send ping
            this.client.ping();
        }, interval);
    }

    /**
     * Stop heartbeat timer
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Check if client is connected
     */
    isConnected() {
        return this.client && this.client.readyState === WebSocket.OPEN;
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            connectionStatus: this.connectionStatus,
            isConnected: this.isConnected(),
            availableActions: this.availableActions,
            lastHeartbeat: this.lastHeartbeat,
            clientCount: this.wss ? this.wss.clients.size : 0
        };
    }

    /**
     * Stop the WebSocket server
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.stopHeartbeat();

        // Close all connections
        if (this.client) {
            this.client.close(1000, 'Server shutting down');
            this.client = null;
        }

        // Close server
        if (this.wss) {
            this.wss.close(() => {
                this.logger.info('Minecraft WebSocket server stopped');
            });
            this.wss = null;
        }

        this.isRunning = false;
        this.connectionStatus = 'Disconnected';
        this.availableActions = [];
        
        this.emit('server:stopped');
    }
}

module.exports = MinecraftWebSocketServer;
