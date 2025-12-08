/**
 * HybridShock Integration Plugin
 *
 * Bidirektionale Bridge zwischen TikTok Live Events und HybridShock API.
 *
 * Features:
 * - WebSocket + HTTP API Integration
 * - Flexibles Event-Mapping-System
 * - Action-Queue mit Rate-Limiting
 * - Template-basierte Context-Objects
 * - Auto-Reconnect & Error-Handling
 * - Statistics & Monitoring
 * - Debugging-Tools
 */

const path = require('path');
const HybridShockClient = require('./utils/hybridshock-client');
const MappingManager = require('./utils/mapping-manager');
const ActionQueue = require('./utils/action-queue');
const ContextBuilder = require('./utils/context-builder');

class HybridShockPlugin {
    constructor(api) {
        this.api = api;

        // Components
        this.client = null;
        this.mappingManager = null;
        this.actionQueue = null;
        this.contextBuilder = null;

        // State
        this.isRunning = false;
        this.isPaused = false;

        // Statistics
        this.stats = {
            startTime: null,
            tiktokEventsReceived: 0,
            actionsTriggered: 0,
            actionsFailed: 0,
            hybridshockEventsReceived: 0,
            mappingsProcessed: 0,
            errors: []
        };

        // Config
        this.config = null;
    }

    /**
     * Plugin initialisieren
     */
    async init() {
        this.api.log('🚀 HybridShock Plugin initializing...', 'info');

        try {
            // Datenbank initialisieren
            this.initializeDatabase();

            // Config laden
            this.loadConfig();

            // Components initialisieren
            this.contextBuilder = new ContextBuilder();
            this.mappingManager = new MappingManager(
                this.api.getDatabase(),
                this.api.log.bind(this.api)
            );
            this.mappingManager.loadMappings();

            // Action-Queue erstellen
            this.actionQueue = new ActionQueue({
                maxRatePerSecond: this.config.maxActionsPerSecond || 10,
                maxQueueSize: this.config.maxQueueSize || 1000,
                maxRetries: this.config.maxRetries || 3,
                retryDelay: this.config.retryDelay || 1000
            });

            // Queue Event-Handler
            this.setupQueueHandlers();

            // HybridShock Client erstellen
            this.client = new HybridShockClient({
                httpHost: this.config.httpHost,
                httpPort: this.config.httpPort,
                wsHost: this.config.wsHost,
                wsPort: this.config.wsPort,
                autoReconnect: this.config.autoReconnect,
                reconnectInterval: this.config.reconnectInterval,
                heartbeatInterval: this.config.heartbeatInterval
            });

            // Client Event-Handler
            this.setupClientHandlers();

            // Routes registrieren
            this.registerRoutes();

            // Socket.IO Handler registrieren
            this.registerSocketHandlers();

            // TikTok Event-Handler registrieren
            this.registerTikTokEventHandlers();

            // Auto-Connect wenn aktiviert (non-blocking)
            if (this.config.autoConnect) {
                this.start().catch(err => {
                    this.api.log(`Auto-connect failed: ${err.message}`, 'warn');
                });
            }

            this.api.log('✅ HybridShock Plugin initialized successfully', 'info');

            // Broadcast initial status to GUI
            this.broadcastStatus();

            return true;

        } catch (error) {
            this.api.log(`❌ Failed to initialize plugin: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Datenbank-Tabellen erstellen
     */
    initializeDatabase() {
        const db = this.api.getDatabase();

        // Event-Log-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS hybridshock_event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                event_source TEXT NOT NULL,
                event_data TEXT,
                triggered_actions INTEGER DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Action-Log-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS hybridshock_action_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mapping_id INTEGER,
                category TEXT NOT NULL,
                action TEXT NOT NULL,
                context TEXT,
                status TEXT NOT NULL,
                error_message TEXT,
                processing_time INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Statistics-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS hybridshock_statistics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stat_key TEXT UNIQUE NOT NULL,
                stat_value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Indexes
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_event_log_type
            ON hybridshock_event_log(event_type, timestamp DESC)
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_action_log_status
            ON hybridshock_action_log(status, timestamp DESC)
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_action_log_timestamp
            ON hybridshock_action_log(timestamp DESC)
        `);

        this.api.log('Database tables initialized', 'info');
    }

    /**
     * Config laden
     */
    loadConfig() {
        const defaultConfig = {
            // HybridShock Connection
            httpHost: '127.0.0.1',
            httpPort: 8832,
            wsHost: '127.0.0.1',
            wsPort: 8833,

            // Connection Settings
            autoConnect: false,
            autoReconnect: true,
            reconnectInterval: 5000,
            heartbeatInterval: 30000,

            // Communication Preferences
            preferWebSocket: false,  // false = HTTP (default), true = WebSocket für Actions/Features
            useWebSocketForActions: false,  // Actions über WebSocket statt HTTP senden

            // Queue Settings
            maxActionsPerSecond: 10,
            maxQueueSize: 1000,
            maxRetries: 3,
            retryDelay: 1000,

            // Feature Flags
            enableEventLog: true,
            enableActionLog: true,
            enableStats: true,
            enableDebugMode: false,

            // Log Retention
            maxEventLogEntries: 10000,
            maxActionLogEntries: 10000,
            logRetentionDays: 30
        };

        this.config = this.api.getConfig('config') || defaultConfig;

        if (!this.api.getConfig('config')) {
            this.api.setConfig('config', this.config);
        }
    }

    /**
     * Config validieren
     */
    validateConfig(config) {
        const errors = [];

        // Port validation
        if (config.httpPort !== undefined) {
            const port = parseInt(config.httpPort);
            if (isNaN(port) || port < 1 || port > 65535) {
                errors.push('httpPort must be between 1 and 65535');
            }
        }
        if (config.wsPort !== undefined) {
            const port = parseInt(config.wsPort);
            if (isNaN(port) || port < 1 || port > 65535) {
                errors.push('wsPort must be between 1 and 65535');
            }
        }

        // Rate limiting validation
        if (config.maxActionsPerSecond !== undefined) {
            const rate = parseInt(config.maxActionsPerSecond);
            if (isNaN(rate) || rate < 1 || rate > 1000) {
                errors.push('maxActionsPerSecond must be between 1 and 1000');
            }
        }

        // Queue size validation
        if (config.maxQueueSize !== undefined) {
            const size = parseInt(config.maxQueueSize);
            if (isNaN(size) || size < 1 || size > 100000) {
                errors.push('maxQueueSize must be between 1 and 100000');
            }
        }

        // Retry validation
        if (config.maxRetries !== undefined) {
            const retries = parseInt(config.maxRetries);
            if (isNaN(retries) || retries < 0 || retries > 10) {
                errors.push('maxRetries must be between 0 and 10');
            }
        }

        // Host validation
        if (config.httpHost !== undefined && typeof config.httpHost !== 'string') {
            errors.push('httpHost must be a string');
        }
        if (config.wsHost !== undefined && typeof config.wsHost !== 'string') {
            errors.push('wsHost must be a string');
        }

        return errors;
    }

    /**
     * Config aktualisieren
     */
    async updateConfig(newConfig) {
        // Validate configuration
        const errors = this.validateConfig(newConfig);
        if (errors.length > 0) {
            throw new Error(`Invalid configuration: ${errors.join(', ')}`);
        }

        this.config = { ...this.config, ...newConfig };
        await this.api.setConfig('config', this.config);

        // Client neu konfigurieren wenn nötig
        if (this.client && this.isRunning) {
            this.api.log('Config updated - restarting client', 'info');
            await this.restart();
        }

        this.broadcastStatus();
    }

    /**
     * Client Event-Handler setup
     */
    setupClientHandlers() {
        // Connection Events
        this.client.on('connected', () => {
            this.api.log('✅ Connected to HybridShock', 'info');
            this.broadcastStatus();
        });

        this.client.on('disconnected', (data) => {
            this.api.log(`⚠️ Disconnected from HybridShock (code: ${data.code})`, 'warn');
            this.broadcastStatus();
        });

        this.client.on('reconnecting', (data) => {
            this.api.log(`🔄 Reconnecting to HybridShock (attempt ${data.attempt})`, 'info');
            this.broadcastStatus();
        });

        // Error Events
        this.client.on('error', (error) => {
            this.api.log(`❌ HybridShock error: ${error.error}`, 'error');
            this.stats.errors.push({
                type: error.type,
                message: error.error,
                timestamp: Date.now()
            });
            this.broadcastStatus();
        });

        // HybridShock Events (empfangene Events von HybridShock)
        this.client.on('hybridshock:event', (event) => {
            this.handleHybridShockEvent(event);
        });

        // Categories Update Event (vom Server gepusht)
        this.client.on('categories:update', (categories) => {
            this.api.log(`Categories updated: ${categories.length} categories received`, 'info');
            this.api.emit('hybridshock:categories-update', categories);
        });

        // Actions Update Event (vom Server gepusht)
        this.client.on('actions:update', (actions) => {
            this.api.log(`Actions updated: ${actions.length} actions received`, 'info');
            this.api.emit('hybridshock:actions-update', actions);
        });

        // Events Update Event (vom Server gepusht)
        this.client.on('events:update', (events) => {
            this.api.log(`Events updated: ${events.length} events received`, 'info');
            this.api.emit('hybridshock:events-update', events);
        });

        // Features Update Event (kombiniert)
        this.client.on('features:update', (features) => {
            this.api.log('Features updated from HybridShock server', 'info');
            this.api.emit('hybridshock:features-update', features);
        });

        // Action Response
        this.client.on('action:sent', (data) => {
            if (this.config.enableDebugMode) {
                const via = data.via || 'http';
                this.api.log(`Action sent (${via}): ${data.category}/${data.action}`, 'debug');
            }
        });

        // Logs
        this.client.on('log', (log) => {
            this.api.log(`[HybridShockClient] ${log.message}`, log.level);
        });
    }

    /**
     * Queue Event-Handler setup
     */
    setupQueueHandlers() {
        // Action ausführen (wird von Queue getriggert)
        this.actionQueue.on('action:execute', async (action, callback) => {
            try {
                let result;

                // WebSocket oder HTTP verwenden?
                if (this.config.useWebSocketForActions && this.client && this.client.isConnected) {
                    result = await this.client.sendActionViaWebSocket(
                        action.category,
                        action.action,
                        action.context
                    );
                } else {
                    result = await this.client.sendAction(
                        action.category,
                        action.action,
                        action.context
                    );
                }

                // Log
                if (this.config.enableActionLog) {
                    this.logAction(action, 'success', null, Date.now() - action.timestamp);
                }

                callback(null, result);
            } catch (error) {
                // Log
                if (this.config.enableActionLog) {
                    this.logAction(action, 'failed', error.message, Date.now() - action.timestamp);
                }

                callback(error);
            }
        });

        // Queue Events für Broadcasting
        this.actionQueue.on('queue:enqueued', () => this.broadcastQueueStatus());
        this.actionQueue.on('queue:success', () => {
            this.stats.actionsTriggered++;
            this.broadcastQueueStatus();
        });
        this.actionQueue.on('queue:failed', () => {
            this.stats.actionsFailed++;
            this.broadcastQueueStatus();
        });
        this.actionQueue.on('queue:retry', () => this.broadcastQueueStatus());
    }

    /**
     * TikTok Event-Handler registrieren
     */
    registerTikTokEventHandlers() {
        // Gift Event
        this.api.registerTikTokEvent('gift', (data) => {
            this.handleTikTokEvent('gift', data);
        });

        // Chat Event
        this.api.registerTikTokEvent('chat', (data) => {
            this.handleTikTokEvent('chat', data);
        });

        // Follow Event
        this.api.registerTikTokEvent('follow', (data) => {
            this.handleTikTokEvent('follow', data);
        });

        // Share Event
        this.api.registerTikTokEvent('share', (data) => {
            this.handleTikTokEvent('share', data);
        });

        // Like Event
        this.api.registerTikTokEvent('like', (data) => {
            this.handleTikTokEvent('like', data);
        });

        // Subscribe Event
        this.api.registerTikTokEvent('subscribe', (data) => {
            this.handleTikTokEvent('subscribe', data);
        });

        this.api.log('✅ TikTok event handlers registered', 'info');
    }

    /**
     * TikTok Event verarbeiten
     */
    async handleTikTokEvent(eventType, eventData) {
        if (!this.isRunning || this.isPaused) {
            return;
        }

        this.stats.tiktokEventsReceived++;

        // Event loggen
        if (this.config.enableEventLog) {
            this.logEvent(eventType, 'tiktok', eventData);
        }

        // Mappings für Event-Type abrufen
        const mappings = this.mappingManager.getMappingsForEvent(eventType);

        if (mappings.length === 0) {
            return; // Keine Mappings
        }

        let triggeredActions = 0;

        for (const mapping of mappings) {
            // Mapping disabled?
            if (!mapping.enabled) {
                continue;
            }

            // Bedingungen prüfen
            if (!this.mappingManager.evaluateConditions(mapping, eventData)) {
                continue;
            }

            // Cooldown prüfen
            if (this.mappingManager.checkCooldown(mapping)) {
                if (this.config.enableDebugMode) {
                    const remaining = this.mappingManager.getCooldownRemaining(mapping);
                    this.api.log(`Mapping "${mapping.name}" on cooldown (${remaining}ms remaining)`, 'debug');
                }
                continue;
            }

            // Context erstellen
            const context = this.contextBuilder.build(mapping.contextTemplate, eventData);

            // Action zur Queue hinzufügen
            const action = {
                mappingId: mapping.id,
                category: mapping.hybridshockCategory,
                action: mapping.hybridshockAction,
                context,
                timestamp: Date.now()
            };

            // Delay?
            if (mapping.delay && mapping.delay > 0) {
                setTimeout(() => {
                    this.actionQueue.enqueue(action, mapping.priority);
                }, mapping.delay);
            } else {
                this.actionQueue.enqueue(action, mapping.priority);
            }

            // Cooldown setzen
            this.mappingManager.setCooldown(mapping);

            triggeredActions++;
            this.stats.mappingsProcessed++;
        }

        // Broadcast Event
        this.api.emit('hybridshock:tiktok-event', {
            eventType,
            eventData,
            triggeredActions
        });
    }

    /**
     * HybridShock Event verarbeiten (empfangenes Event von HybridShock)
     */
    handleHybridShockEvent(event) {
        this.stats.hybridshockEventsReceived++;

        // Event loggen
        if (this.config.enableEventLog) {
            this.logEvent(event.type || 'unknown', 'hybridshock', event);
        }

        // An Frontend broadcasten
        this.api.emit('hybridshock:event', event);

        if (this.config.enableDebugMode) {
            this.api.log(`HybridShock event received: ${JSON.stringify(event)}`, 'debug');
        }
    }

    /**
     * Event loggen
     */
    logEvent(eventType, source, eventData) {
        try {
            const db = this.api.getDatabase();
            db.prepare(`
                INSERT INTO hybridshock_event_log (event_type, event_source, event_data)
                VALUES (?, ?, ?)
            `).run(eventType, source, JSON.stringify(eventData));

            // Cleanup alte Einträge
            this.cleanupEventLog();
        } catch (error) {
            this.api.log(`Failed to log event: ${error.message}`, 'error');
        }
    }

    /**
     * Action loggen
     */
    logAction(action, status, errorMessage, processingTime) {
        try {
            const db = this.api.getDatabase();
            db.prepare(`
                INSERT INTO hybridshock_action_log
                (mapping_id, category, action, context, status, error_message, processing_time)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                action.mappingId || null,
                action.category,
                action.action,
                JSON.stringify(action.context),
                status,
                errorMessage,
                processingTime
            );

            // Cleanup alte Einträge
            this.cleanupActionLog();
        } catch (error) {
            this.api.log(`Failed to log action: ${error.message}`, 'error');
        }
    }

    /**
     * Cleanup alte Event-Logs
     */
    cleanupEventLog() {
        try {
            const db = this.api.getDatabase();

            // Behalte nur die letzten maxEventLogEntries
            db.prepare(`
                DELETE FROM hybridshock_event_log
                WHERE id NOT IN (
                    SELECT id FROM hybridshock_event_log
                    ORDER BY id DESC
                    LIMIT ?
                )
            `).run(this.config.maxEventLogEntries);

        } catch (error) {
            this.api.log(`Failed to cleanup event log: ${error.message}`, 'error');
        }
    }

    /**
     * Cleanup alte Action-Logs
     */
    cleanupActionLog() {
        try {
            const db = this.api.getDatabase();

            // Behalte nur die letzten maxActionLogEntries
            db.prepare(`
                DELETE FROM hybridshock_action_log
                WHERE id NOT IN (
                    SELECT id FROM hybridshock_action_log
                    ORDER BY id DESC
                    LIMIT ?
                )
            `).run(this.config.maxActionLogEntries);

        } catch (error) {
            this.api.log(`Failed to cleanup action log: ${error.message}`, 'error');
        }
    }

    /**
     * HTTP-Routes registrieren
     */
    registerRoutes() {
        const uiPath = path.join(__dirname, 'ui.html');

        // UI
        this.api.registerRoute('get', '/hybridshock/ui', (req, res) => {
            res.sendFile(uiPath);
        });

        // Status
        this.api.registerRoute('get', '/api/hybridshock/status', (req, res) => {
            res.json({
                success: true,
                data: this.getStatus()
            });
        });

        // Config
        this.api.registerRoute('get', '/api/hybridshock/config', (req, res) => {
            res.json({
                success: true,
                data: this.config
            });
        });

        this.api.registerRoute('post', '/api/hybridshock/config', async (req, res) => {
            try {
                await this.updateConfig(req.body);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Start/Stop
        this.api.registerRoute('post', '/api/hybridshock/start', async (req, res) => {
            try {
                await this.start();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.registerRoute('post', '/api/hybridshock/stop', async (req, res) => {
            try {
                await this.stop();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.registerRoute('post', '/api/hybridshock/restart', async (req, res) => {
            try {
                await this.restart();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Test Connection
        this.api.registerRoute('get', '/api/hybridshock/test', async (req, res) => {
            try {
                const result = await this.client.testConnection();
                res.json({
                    success: true,
                    data: result
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // HybridShock Features
        this.api.registerRoute('get', '/api/hybridshock/features', async (req, res) => {
            try {
                const [categories, actions, events] = await Promise.all([
                    this.client.getCategories(),
                    this.client.getActions(),
                    this.client.getEvents()
                ]);

                res.json({
                    success: true,
                    data: { categories, actions, events }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Mappings CRUD
        this.api.registerRoute('get', '/api/hybridshock/mappings', (req, res) => {
            res.json({
                success: true,
                data: this.mappingManager.getAllMappings()
            });
        });

        this.api.registerRoute('post', '/api/hybridshock/mappings', (req, res) => {
            try {
                const id = this.mappingManager.createMapping(req.body);
                res.json({ success: true, data: { id } });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.registerRoute('put', '/api/hybridshock/mappings/:id', (req, res) => {
            try {
                this.mappingManager.updateMapping(parseInt(req.params.id), req.body);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.registerRoute('delete', '/api/hybridshock/mappings/:id', (req, res) => {
            try {
                this.mappingManager.deleteMapping(parseInt(req.params.id));
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Export/Import Mappings
        this.api.registerRoute('get', '/api/hybridshock/mappings/export', (req, res) => {
            try {
                const data = this.mappingManager.exportMappings();
                res.json({ success: true, data });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.registerRoute('post', '/api/hybridshock/mappings/import', (req, res) => {
            try {
                const count = this.mappingManager.importMappings(
                    req.body.mappings,
                    req.body.replaceExisting || false
                );
                res.json({ success: true, data: { imported: count } });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Action manuell triggern (Test)
        this.api.registerRoute('post', '/api/hybridshock/action/trigger', async (req, res) => {
            try {
                const { category, action, context, priority } = req.body;

                this.actionQueue.enqueue({
                    category,
                    action,
                    context: context || {},
                    timestamp: Date.now()
                }, priority || 0);

                res.json({ success: true });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Event & Action Logs
        this.api.registerRoute('get', '/api/hybridshock/logs/events', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 100;
                const db = this.api.getDatabase();

                const rows = db.prepare(`
                    SELECT * FROM hybridshock_event_log
                    ORDER BY id DESC
                    LIMIT ?
                `).all(limit);

                res.json({ success: true, data: rows });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.registerRoute('get', '/api/hybridshock/logs/actions', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 100;
                const db = this.api.getDatabase();

                const rows = db.prepare(`
                    SELECT * FROM hybridshock_action_log
                    ORDER BY id DESC
                    LIMIT ?
                `).all(limit);

                res.json({ success: true, data: rows });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Statistics
        this.api.registerRoute('get', '/api/hybridshock/statistics', (req, res) => {
            res.json({
                success: true,
                data: this.getStatistics()
            });
        });

        this.api.log('✅ HTTP routes registered', 'info');
    }

    /**
     * Socket.IO Handler registrieren
     */
    registerSocketHandlers() {
        // Status abrufen
        this.api.registerSocket('hybridshock:get-status', (socket) => {
            socket.emit('hybridshock:status', this.getStatus());
        });

        // Start/Stop
        this.api.registerSocket('hybridshock:start', async (socket) => {
            try {
                await this.start();
                socket.emit('hybridshock:started');
            } catch (error) {
                socket.emit('hybridshock:error', { message: error.message });
            }
        });

        this.api.registerSocket('hybridshock:stop', async (socket) => {
            try {
                await this.stop();
                socket.emit('hybridshock:stopped');
            } catch (error) {
                socket.emit('hybridshock:error', { message: error.message });
            }
        });

        this.api.log('✅ Socket.IO handlers registered', 'info');
    }

    /**
     * Plugin starten (HybridShock-Verbindung herstellen)
     */
    async start() {
        if (this.isRunning) {
            return;
        }

        try {
            this.api.log('▶️ Starting HybridShock plugin...', 'info');

            this.isRunning = true;
            this.stats.startTime = Date.now();

            await this.client.connect();

            this.broadcastStatus();
        } catch (error) {
            this.isRunning = false;
            this.api.log(`❌ Failed to start HybridShock plugin: ${error.message}`, 'error');
            this.broadcastStatus();
            throw error;
        }
    }

    /**
     * Plugin stoppen
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        this.api.log('⏸️ Stopping HybridShock plugin...', 'info');

        this.isRunning = false;

        this.client.disconnect();
        this.actionQueue.stopProcessing();

        this.broadcastStatus();
    }

    /**
     * Plugin neu starten
     */
    async restart() {
        this.api.log('🔄 Restarting HybridShock plugin...', 'info');
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.start();
    }

    /**
     * Status abrufen
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            client: this.client ? this.client.getStatus() : null,
            queue: this.actionQueue ? this.actionQueue.getStatus() : null,
            stats: {
                ...this.stats,
                uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0
            },
            mappings: {
                total: this.mappingManager.getAllMappings().length,
                enabled: this.mappingManager.getAllMappings().filter(m => m.enabled).length
            }
        };
    }

    /**
     * Statistiken abrufen
     */
    getStatistics() {
        const db = this.api.getDatabase();

        // Event-Statistiken
        const eventStats = db.prepare(`
            SELECT event_type, event_source, COUNT(*) as count
            FROM hybridshock_event_log
            GROUP BY event_type, event_source
            ORDER BY count DESC
        `).all();

        // Action-Statistiken
        const actionStats = db.prepare(`
            SELECT category, action, status, COUNT(*) as count
            FROM hybridshock_action_log
            GROUP BY category, action, status
            ORDER BY count DESC
        `).all();

        // Erfolgsrate
        const successRate = db.prepare(`
            SELECT
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                COUNT(*) as total_count
            FROM hybridshock_action_log
        `).get();

        return {
            events: eventStats,
            actions: actionStats,
            successRate: successRate.total_count > 0
                ? (successRate.success_count / successRate.total_count * 100).toFixed(2)
                : 0,
            stats: this.stats
        };
    }

    /**
     * Status an alle Clients broadcasten
     */
    broadcastStatus() {
        this.api.emit('hybridshock:status', this.getStatus());
    }

    /**
     * Queue-Status broadcasten
     */
    broadcastQueueStatus() {
        if (this.actionQueue) {
            this.api.emit('hybridshock:queue-status', this.actionQueue.getStatus());
        }
    }

    /**
     * Plugin cleanup
     */
    async destroy() {
        this.api.log('🛑 HybridShock Plugin shutting down...', 'info');

        // Broadcast final status before shutdown
        this.broadcastStatus();

        await this.stop();

        if (this.client) {
            this.client.destroy();
        }

        if (this.actionQueue) {
            this.actionQueue.destroy();
        }

        this.api.log('✅ HybridShock Plugin destroyed', 'info');
    }
}

module.exports = HybridShockPlugin;
