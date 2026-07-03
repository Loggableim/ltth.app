/**
 * Minecraft Connect Plugin - Main Class
 *
 * Bidirectional real-time integration between TikTok Live and Minecraft (Java Edition)
 *
 * Features:
 * - WebSocket bridge server for Minecraft mod communication
 * - TikTok event to Minecraft action mapping
 * - Dynamic parameter substitution
 * - Command queue with rate limiting
 * - Connection management with auto-reconnect
 * - Stream overlay for visual feedback
 * - Dashboard UI for configuration
 *
 * @version 1.0.0
 * @author pupcidslittletiktokhelper Team
 */

const path = require('path');
const fs = require('fs').promises;

// Helper classes
const MinecraftWebSocketServer = require('./helpers/minecraftWebSocket');
const CommandQueue = require('./helpers/commandQueue');
const ActionMapper = require('./helpers/actionMapper');

class MinecraftConnectPlugin {
    constructor(api) {
        this.api = api;

        // Use persistent storage in user profile directory (survives updates)
        this.pluginDataDir = api.getPluginDataDir();

        // Configuration
        this.config = {
            websocket: {
                port: 25560,
                host: 'localhost',
                reconnectInterval: 5000,
                heartbeatInterval: 30000
            },
            limits: {
                maxActionsPerMinute: 30,
                commandCooldown: 1000,
                maxQueueSize: 100
            },
            overlay: {
                enabled: true,
                showUsername: true,
                showAction: true,
                animationDuration: 3000,
                position: 'top-right'
            },
            mappings: []
        };

        // Helper instances
        this.wsServer = null;
        this.commandQueue = null;
        this.actionMapper = null;

        // State
        this.availableActions = [];
        this.connectionStatus = 'Disconnected';
        this.isRunning = false;

        // Statistics
        this.stats = {
            startTime: null,
            totalEvents: 0,
            totalActions: 0,
            successfulActions: 0,
            failedActions: 0,
            droppedActions: 0,
            lastActionTime: null
        };

        // Event log for dashboard
        this.eventLog = [];
        this.maxEventLog = 100;
    }

    /**
     * Initialize plugin
     */
    async init() {
        try {
            this.api.log('Initializing Minecraft Connect plugin...');

            // Load configuration
            await this.loadConfig();

            // Initialize helpers
            this.wsServer = new MinecraftWebSocketServer(this.config, this.api.logger);
            this.commandQueue = new CommandQueue(this.config, this.api.logger);
            this.actionMapper = new ActionMapper(this.api.logger);

            // Load action mappings
            this.actionMapper.loadMappings(this.config.mappings);

            // Set up WebSocket event handlers
            this.setupWebSocketHandlers();

            // Register routes
            this.registerRoutes();

            // Register socket.io events
            this.registerSocketEvents();

            // Register TikTok event handlers
            this.registerTikTokEvents();

            // Start WebSocket server
            this.wsServer.start();

            this.isRunning = true;
            this.stats.startTime = Date.now();

            this.api.log('Minecraft Connect plugin initialized successfully');
            return true;
        } catch (error) {
            this.api.log(`Failed to initialize plugin: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Load configuration
     */
    async loadConfig() {
        try {
            // Ensure plugin data directory exists
            this.api.ensurePluginDataDir();
            
            const configPath = path.join(this.pluginDataDir, 'config.json');
            const oldConfigPath = path.join(this.api.pluginDir, 'config.json');
            
            // Migrate old config if it exists
            if (!await this.fileExists(configPath) && await this.fileExists(oldConfigPath)) {
                this.api.log('📦 Migrating config.json to user profile directory...', 'info');
                const oldConfig = await fs.readFile(oldConfigPath, 'utf8');
                await fs.writeFile(configPath, oldConfig);
                this.api.log(`✅ Migrated config to: ${configPath}`, 'info');
            }
            
            try {
                const configData = await fs.readFile(configPath, 'utf8');
                const loadedConfig = JSON.parse(configData);
                this.config = { ...this.config, ...loadedConfig };
                this.api.log('Configuration loaded from config.json');
            } catch (error) {
                // Config file doesn't exist, use defaults
                this.api.log('Using default configuration');
            }
        } catch (error) {
            this.api.log(`Error loading config: ${error.message}`, 'error');
        }
    }
    
    /**
     * Helper to check if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Save configuration
     */
    async saveConfig() {
        try {
            this.api.ensurePluginDataDir();
            const configPath = path.join(this.pluginDataDir, 'config.json');
            await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
            this.api.log('Configuration saved');
        } catch (error) {
            this.api.log(`Error saving config: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Set up WebSocket server event handlers
     */
    setupWebSocketHandlers() {
        this.wsServer.on('server:started', (data) => {
            this.api.log(`WebSocket server started on ${data.host}:${data.port}`);
            this.broadcastStatus();
        });

        this.wsServer.on('client:connected', () => {
            this.connectionStatus = 'Connected';
            this.api.log('Minecraft mod connected');
            this.broadcastStatus();
        });

        this.wsServer.on('client:disconnected', (data) => {
            this.connectionStatus = 'Disconnected';
            this.availableActions = [];
            this.api.log(`Minecraft mod disconnected: ${data.reason}`);
            this.broadcastStatus();
        });

        this.wsServer.on('actions:updated', (actions) => {
            this.availableActions = actions;
            this.api.log(`Available actions updated: ${actions.length} actions`);
            this.broadcastActions();
        });

        this.wsServer.on('status:changed', (status) => {
            this.connectionStatus = status;
            this.broadcastStatus();
        });

        this.wsServer.on('action:result', (result) => {
            this.handleActionResult(result);
        });
    }

    /**
     * Register API routes
     */
    registerRoutes() {
        // Get status
        this.api.registerRoute('GET', '/api/minecraft-connect/status', async (req, res) => {
            res.json({
                success: true,
                status: {
                    connectionStatus: this.connectionStatus,
                    isConnected: this.wsServer.isConnected(),
                    availableActions: this.availableActions,
                    stats: this.stats,
                    queueStatus: this.commandQueue.getStatus()
                }
            });
        });

        // Get mappings
        this.api.registerRoute('GET', '/api/minecraft-connect/mappings', async (req, res) => {
            res.json({
                success: true,
                mappings: this.actionMapper.getMappings()
            });
        });

        // Add mapping
        this.api.registerRoute('POST', '/api/minecraft-connect/mappings', async (req, res) => {
            try {
                const mapping = req.body;
                this.actionMapper.addMapping(mapping);
                this.config.mappings = this.actionMapper.getMappings();
                await this.saveConfig();
                
                res.json({
                    success: true,
                    mappings: this.actionMapper.getMappings()
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update mapping
        this.api.registerRoute('PUT', '/api/minecraft-connect/mappings/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const updates = req.body;
                this.actionMapper.updateMapping(id, updates);
                this.config.mappings = this.actionMapper.getMappings();
                await this.saveConfig();
                
                res.json({
                    success: true,
                    mappings: this.actionMapper.getMappings()
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Delete mapping
        this.api.registerRoute('DELETE', '/api/minecraft-connect/mappings/:id', async (req, res) => {
            try {
                const { id } = req.params;
                this.actionMapper.removeMapping(id);
                this.config.mappings = this.actionMapper.getMappings();
                await this.saveConfig();
                
                res.json({
                    success: true,
                    mappings: this.actionMapper.getMappings()
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Test action
        this.api.registerRoute('POST', '/api/minecraft-connect/test-action', async (req, res) => {
            try {
                const { action, params } = req.body;
                
                if (!this.wsServer.isConnected()) {
                    throw new Error('Minecraft mod not connected');
                }

                await this.executeAction(action, params);
                
                res.json({
                    success: true,
                    message: 'Action queued successfully'
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get event log
        this.api.registerRoute('GET', '/api/minecraft-connect/events', async (req, res) => {
            res.json({
                success: true,
                events: this.eventLog
            });
        });

        // Update config
        this.api.registerRoute('PUT', '/api/minecraft-connect/config', async (req, res) => {
            try {
                const updates = req.body;
                this.config = { ...this.config, ...updates };
                await this.saveConfig();
                
                res.json({
                    success: true,
                    config: this.config
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Serve UI
        this.api.registerRoute('GET', '/minecraft-connect/ui', (req, res) => {
            res.sendFile(path.join(this.api.pluginDir, 'minecraft-connect.html'));
        });
    }

    /**
     * Register Socket.io events
     */
    registerSocketEvents() {
        this.api.registerSocket('minecraft-connect:get-status', async (socket) => {
            socket.emit('minecraft-connect:status', {
                connectionStatus: this.connectionStatus,
                isConnected: this.wsServer.isConnected(),
                availableActions: this.availableActions,
                stats: this.stats,
                queueStatus: this.commandQueue.getStatus()
            });
        });

        this.api.registerSocket('minecraft-connect:get-mappings', async (socket) => {
            socket.emit('minecraft-connect:mappings', {
                mappings: this.actionMapper.getMappings()
            });
        });
    }

    /**
     * Register TikTok event handlers
     */
    registerTikTokEvents() {
        // Gift event
        this.api.registerTikTokEvent('gift', async (data) => {
            await this.processTikTokEvent('gift', data);
        });

        // Follow event
        this.api.registerTikTokEvent('follow', async (data) => {
            await this.processTikTokEvent('follow', data);
        });

        // Like event
        this.api.registerTikTokEvent('like', async (data) => {
            await this.processTikTokEvent('like', data);
        });

        // Share event
        this.api.registerTikTokEvent('share', async (data) => {
            await this.processTikTokEvent('share', data);
        });

        // Chat event
        this.api.registerTikTokEvent('chat', async (data) => {
            await this.processTikTokEvent('chat', data);
        });

        // Subscribe event
        this.api.registerTikTokEvent('subscribe', async (data) => {
            await this.processTikTokEvent('subscribe', data);
        });
    }

    /**
     * Process TikTok event
     */
    async processTikTokEvent(eventType, eventData) {
        try {
            this.stats.totalEvents++;

            // Get matched actions
            const actions = this.actionMapper.processEvent(eventType, eventData);

            if (actions.length === 0) {
                return;
            }

            this.api.log(`Processing ${eventType} event: ${actions.length} actions matched`);

            // Execute each action
            for (const action of actions) {
                await this.executeAction(action.action, action.params, eventData);
            }

            // Log event
            this.addEventLog({
                type: eventType,
                data: eventData,
                actions: actions.length,
                timestamp: Date.now()
            });

        } catch (error) {
            this.api.log(`Error processing TikTok event: ${error.message}`, 'error');
        }
    }

    /**
     * Execute Minecraft action
     */
    async executeAction(action, params, eventData = null) {
        if (!this.wsServer.isConnected()) {
            this.api.log('Cannot execute action: Minecraft mod not connected', 'warn');
            this.stats.droppedActions++;
            return;
        }

        // Queue command
        const queued = this.commandQueue.enqueue({
            action,
            params,
            eventData,
            executor: async (act, par) => {
                await this.wsServer.sendCommand(act, par);
            },
            onSuccess: () => {
                this.stats.successfulActions++;
                this.stats.lastActionTime = Date.now();
                
                // Show on overlay
                if (this.config.overlay?.enabled) {
                    this.showOnOverlay(action, params, eventData);
                }
            },
            onError: (error) => {
                this.stats.failedActions++;
                this.api.log(`Action failed: ${error.message}`, 'error');
            }
        });

        if (queued) {
            this.stats.totalActions++;
        } else {
            this.stats.droppedActions++;
        }
    }

    /**
     * Handle action result from Minecraft
     */
    handleActionResult(result) {
        this.api.log(`Action result: ${result.success ? 'success' : 'failed'}`);
        
        if (!result.success) {
            this.stats.failedActions++;
        }

        // Broadcast to dashboard
        this.api.io.emit('minecraft-connect:action-result', result);
    }

    /**
     * Show action on overlay
     */
    showOnOverlay(action, params, eventData) {
        const overlayData = {
            action,
            params,
            username: eventData?.uniqueId || 'System',
            timestamp: Date.now()
        };

        this.api.io.emit('minecraft-connect:overlay-show', overlayData);
    }

    /**
     * Add event to log
     */
    addEventLog(event) {
        this.eventLog.unshift(event);
        
        // Keep max size
        if (this.eventLog.length > this.maxEventLog) {
            this.eventLog = this.eventLog.slice(0, this.maxEventLog);
        }

        // Broadcast to dashboard
        this.api.io.emit('minecraft-connect:event-log', event);
    }

    /**
     * Broadcast status to dashboard
     */
    broadcastStatus() {
        this.api.io.emit('minecraft-connect:status-changed', {
            connectionStatus: this.connectionStatus,
            isConnected: this.wsServer.isConnected(),
            stats: this.stats,
            queueStatus: this.commandQueue.getStatus()
        });
    }

    /**
     * Broadcast available actions to dashboard
     */
    broadcastActions() {
        this.api.io.emit('minecraft-connect:actions-updated', {
            availableActions: this.availableActions
        });
    }

    /**
     * Shutdown plugin
     */
    async shutdown() {
        try {
            this.api.log('Shutting down Minecraft Connect plugin...');

            // Stop WebSocket server
            if (this.wsServer) {
                this.wsServer.stop();
            }

            // Clear queue
            if (this.commandQueue) {
                this.commandQueue.clear();
            }

            this.isRunning = false;
            this.api.log('Minecraft Connect plugin shut down successfully');
        } catch (error) {
            this.api.log(`Error during shutdown: ${error.message}`, 'error');
        }
    }
}

// Export plugin class
module.exports = MinecraftConnectPlugin;
