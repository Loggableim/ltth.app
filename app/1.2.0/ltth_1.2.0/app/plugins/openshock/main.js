/**
 * OpenShock Integration Plugin - Main Class
 *
 * Vollständige OpenShock API-Integration für TikTok Live Events
 *
 * Features:
 * - OpenShock API Integration (Shock, Vibrate, Sound)
 * - Event-Mapping-System (TikTok Events → OpenShock Actions)
 * - Pattern Engine (8 Preset-Patterns + Custom Patterns)
 * - Safety Layer (Multi-Level Limits & Emergency Stop)
 * - Queue System (Priority, Retry, Load-Balancing)
 * - Real-time Dashboard & Overlay
 * - Import/Export von Mappings & Patterns
 *
 * @version 1.0.0
 * @author pupcidslittletiktokhelper Team
 */

const path = require('path');
const fs = require('fs').promises;

// Helper-Klassen
const OpenShockClient = require('./helpers/openShockClient');
const MappingEngine = require('./helpers/mappingEngine');
const PatternEngine = require('./helpers/patternEngine');
const SafetyManager = require('./helpers/safetyManager');
const QueueManager = require('./helpers/queueManager');
const ZappieHellManager = require('./helpers/zappieHellManager');

class OpenShockPlugin {
    constructor(api) {
        this.api = api;

        // Configuration (wird in init() geladen)
        this.config = {
            apiKey: '',
            baseUrl: 'https://api.openshock.app',
            globalLimits: {
                maxIntensity: 80,
                maxDuration: 5000,
                maxCommandsPerMinute: 30
            },
            defaultCooldowns: {
                global: 5000,
                perDevice: 3000,
                perUser: 10000
            },
            userLimits: {
                minFollowerAge: 7,
                maxCommandsPerUser: 10
            },
            queueSettings: {
                maxQueueSize: 1000,
                processingDelay: 300
            },
            emergencyStop: {
                enabled: false
            },
            overlay: {
                enabled: true,
                showDevice: true,
                showIntensity: true,
                showPattern: true,
                animationDuration: 2000
            }
        };

        // Helper-Instanzen (werden in init() initialisiert)
        this.openShockClient = null;
        this.mappingEngine = null;
        this.patternEngine = null;
        this.safetyManager = null;
        this.queueManager = null;
        this.zappieHellManager = null;

        // State
        this.devices = [];
        this.isRunning = false;
        this.isPaused = false;

        // Statistics
        this.stats = {
            startTime: null,
            totalCommands: 0,
            successfulCommands: 0,
            failedCommands: 0,
            queuedCommands: 0,
            blockedCommands: 0,
            emergencyStops: 0,
            tiktokEventsProcessed: 0,
            patternsExecuted: 0,
            lastCommandTime: null,
            errors: []
        };

        // Pattern-Execution Tracking
        this.activePatternExecutions = new Map();

        // Log-Buffer für Frontend
        this.eventLog = [];
        this.maxEventLog = 500;
    }

    /**
     * Plugin initialisieren
     */
    async init() {
        try {
            this.api.log('OpenShock Plugin initializing...', 'info');

            // 1. Datenbank initialisieren
            this._initializeDatabase();

            // 2. Config laden
            await this.loadData();

            // 3. Helper initialisieren
            this._initializeHelpers();

            // 4. Routes registrieren
            this._registerRoutes();

            // 5. Socket.IO Events registrieren
            this._registerSocketEvents();

            // 6. TikTok Events registrieren
            this._registerTikTokEvents();

            // 6.5. IFTTT Flow Actions registrieren
            this._registerIFTTTActions();

            // 7. Devices laden (wenn API Key vorhanden)
            if (this.config.apiKey && this.config.apiKey.trim() !== '') {
                try {
                    await this.loadDevices();
                } catch (error) {
                    this.api.log(`Failed to load devices on init: ${error.message}`, 'warn');
                }
            }

            // 8. Queue monitoring (process queue on-demand via enqueue)
            // Queue will auto-process when items are added
            this.api.log('Queue manager ready - will auto-process on command enqueue', 'info');

            // 9. Stats-Timer starten
            this._startStatsTimer();

            this.isRunning = true;
            this.stats.startTime = Date.now();

            this.api.log('OpenShock Plugin initialized successfully', 'info');

            // Initial status broadcast
            this._broadcastStatus();

            return true;

        } catch (error) {
            this.api.log(`Failed to initialize OpenShock Plugin: ${error.message}`, 'error');
            console.error(error);
            throw error;
        }
    }

    /**
     * Datenbank-Tabellen erstellen
     */
    _initializeDatabase() {
        const db = this.api.getDatabase();

        // Config-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS openshock_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

        // Migration: Drop old tables if they have INTEGER id columns
        try {
            const mappingsTableInfo = db.prepare("PRAGMA table_info(openshock_mappings)").all();
            const idColumn = mappingsTableInfo.find(col => col.name === 'id');
            if (idColumn && idColumn.type === 'INTEGER') {
                this.api.log('Migrating openshock_mappings table to use TEXT id...', 'info');
                db.exec('DROP TABLE IF EXISTS openshock_mappings');
            }
        } catch (error) {
            // Table doesn't exist yet, that's fine
        }

        try {
            const patternsTableInfo = db.prepare("PRAGMA table_info(openshock_patterns)").all();
            const idColumn = patternsTableInfo.find(col => col.name === 'id');
            if (idColumn && idColumn.type === 'INTEGER') {
                this.api.log('Migrating openshock_patterns table to use TEXT id...', 'info');
                db.exec('DROP TABLE IF EXISTS openshock_patterns');
            }
        } catch (error) {
            // Table doesn't exist yet, that's fine
        }

        // Mappings-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS openshock_mappings (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                event_type TEXT NOT NULL,
                conditions TEXT,
                action TEXT NOT NULL,
                priority INTEGER DEFAULT 5,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Patterns-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS openshock_patterns (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                steps TEXT NOT NULL,
                preset INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Event-Log-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS openshock_event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                event_source TEXT NOT NULL,
                user_id TEXT,
                username TEXT,
                action_taken TEXT,
                success INTEGER,
                error_message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Command-History-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS openshock_command_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                device_name TEXT,
                command_type TEXT NOT NULL,
                intensity INTEGER,
                duration INTEGER,
                user_id TEXT,
                username TEXT,
                source TEXT,
                success INTEGER,
                error_message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ZappieHell tables
        ZappieHellManager.initializeTables(db, this.api);

        this.api.log('OpenShock database tables initialized', 'info');
    }

    /**
     * Create a logger adapter that wraps api.log to provide the standard logger interface
     * This ensures compatibility with helper classes that expect .info(), .warn(), .error() methods
     */
    _createLoggerAdapter() {
        const apiLog = this.api.log.bind(this.api);
        return {
            info: (msg, data) => apiLog(typeof msg === 'object' ? JSON.stringify(msg) : msg, 'info'),
            warn: (msg, data) => apiLog(typeof msg === 'object' ? JSON.stringify(msg) : msg, 'warn'),
            error: (msg, data) => apiLog(typeof msg === 'object' ? JSON.stringify(msg) : msg, 'error'),
            debug: (msg, data) => apiLog(typeof msg === 'object' ? JSON.stringify(msg) : msg, 'debug')
        };
    }

    /**
     * Helper-Klassen initialisieren
     */
    _initializeHelpers() {
        const logger = this._createLoggerAdapter();

        // OpenShock API Client
        this.openShockClient = new OpenShockClient(
            this.config.apiKey,
            this.config.baseUrl,
            logger
        );

        // Safety Manager
        this.safetyManager = new SafetyManager(
            {
                globalLimits: this.config.globalLimits,
                defaultCooldowns: this.config.defaultCooldowns,
                userLimits: this.config.userLimits,
                emergencyStop: this.config.emergencyStop
            },
            logger
        );

        // Mapping Engine
        this.mappingEngine = new MappingEngine(
            logger
        );

        // Pattern Engine
        this.patternEngine = new PatternEngine(
            logger
        );

        // Queue Manager
        this.queueManager = new QueueManager(
            this.openShockClient,
            this.safetyManager,
            logger
        );
        
        // Set up pattern execution cancellation callback
        // This allows QueueManager to check if a pattern execution has been cancelled
        this.queueManager.setShouldCancelExecution((executionId) => {
            const execution = this.activePatternExecutions.get(executionId);
            return execution && execution.cancelled;
        });

        // ZappieHell Manager
        this.zappieHellManager = new ZappieHellManager(
            this.api.getDatabase(),
            logger,
            this.openShockClient,
            this.patternEngine,
            this.queueManager
        );

        // Load ZappieHell data from database
        this.zappieHellManager.loadFromDatabase();

        // Listen to ZappieHell events
        this.zappieHellManager.on('goals:update', (data) => {
            this._broadcastZappieHellUpdate(data);
        });

        this.zappieHellManager.on('goals:completed', (data) => {
            this._broadcastZappieHellCompleted(data);
        });

        this.zappieHellManager.on('audio:play', (data) => {
            // Emit to Socket.io for TTS/audio playback
            this.api.getSocketIO().emit('zappiehell:audio:play', data);
        });

        this.zappieHellManager.on('overlay:animate', (data) => {
            // Emit to Socket.io for overlay animations
            this.api.getSocketIO().emit('zappiehell:overlay:animate', data);
        });

        // Queue Event-Handler (QueueManager wird später EventEmitter erweitern)
        // this.queueManager.on('item-processed', (item, success) => {
        //     this._broadcastQueueUpdate();
        //     if (success) {
        //         this.stats.successfulCommands++;
        //     } else {
        //         this.stats.failedCommands++;
        //     }
        // });

        // this.queueManager.on('queue-changed', () => {
        //     this._broadcastQueueUpdate();
        // });

        this.api.log('OpenShock helpers initialized', 'info');

        // Load mappings and patterns from database
        this._loadMappingsFromDatabase();
        this._loadPatternsFromDatabase();
    }

    /**
     * Routes registrieren (UI + API)
     */
    _registerRoutes() {
        const pluginDir = __dirname;

        // ============ UI ROUTES ============

        // Main UI
        this.api.registerRoute('get', '/openshock/ui', (req, res) => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.sendFile(path.join(pluginDir, 'ui.html'));
        });

        // Overlay
        this.api.registerRoute('get', '/openshock/overlay', (req, res) => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.sendFile(path.join(pluginDir, 'overlay', 'openshock_overlay.html'));
        });

        // CSS
        this.api.registerRoute('get', '/openshock/openshock.css', (req, res) => {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
            res.sendFile(path.join(pluginDir, 'openshock.css'));
        });

        // UI JS (new standard naming)
        this.api.registerRoute('get', '/openshock/ui.js', (req, res) => {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.sendFile(path.join(pluginDir, 'ui.js'));
        });

        // JS (legacy route for backward compatibility)
        this.api.registerRoute('get', '/openshock/openshock.js', (req, res) => {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.sendFile(path.join(pluginDir, 'openshock.js'));
        });

        // Overlay CSS
        this.api.registerRoute('get', '/openshock/openshock_overlay.css', (req, res) => {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
            res.sendFile(path.join(pluginDir, 'overlay', 'openshock_overlay.css'));
        });

        // Overlay JS
        this.api.registerRoute('get', '/openshock/openshock_overlay.js', (req, res) => {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.sendFile(path.join(pluginDir, 'overlay', 'openshock_overlay.js'));
        });

        // ============ API ROUTES - CONFIG ============

        // Get Config (WITHOUT API-KEY for security!)
        this.api.registerRoute('get', '/api/openshock/config', (req, res) => {
            const safeConfig = {
                ...this.config,
                apiKey: this.config.apiKey ? '***' + this.config.apiKey.slice(-4) : '' // Mask API key
            };
            res.json({
                success: true,
                config: safeConfig
            });
        });

        // Update Config
        this.api.registerRoute('post', '/api/openshock/config', async (req, res) => {
            try {
                const newConfig = req.body;

                // Merge config
                this.config = { ...this.config, ...newConfig };

                // Save to database
                await this.saveData();

                // Update OpenShockClient with new credentials
                if (this.openShockClient) {
                    this.openShockClient.updateConfig({
                        apiKey: this.config.apiKey,
                        baseUrl: this.config.baseUrl || 'https://api.openshock.app'
                    });
                    
                    this.api.log('OpenShock client updated with new configuration', 'info');
                } else if (this.config.apiKey) {
                    // If client doesn't exist yet, create it
                    const logger = this._createLoggerAdapter();
                    this.openShockClient = new OpenShockClient(
                        this.config.apiKey,
                        this.config.baseUrl || 'https://api.openshock.app',
                        logger
                    );
                    
                    // Update queue manager's client reference
                    if (this.queueManager) {
                        this.queueManager.openShockClient = this.openShockClient;
                    }
                    
                    this.api.log('OpenShock client created with new configuration', 'info');
                }

                if (this.safetyManager) {
                    this.safetyManager.updateConfig({
                        globalLimits: this.config.globalLimits,
                        defaultCooldowns: this.config.defaultCooldowns,
                        userLimits: this.config.userLimits,
                        emergencyStop: this.config.emergencyStop
                    });
                }

                // Automatically load devices when API key is configured
                let deviceLoadSuccess = false;
                let deviceCount = 0;
                if (this.openShockClient && this.config.apiKey) {
                    try {
                        await this.loadDevices();
                        deviceLoadSuccess = true;
                        deviceCount = this.devices.length;
                        this.api.log(`Automatically loaded ${deviceCount} device(s) after config update`, 'info');
                    } catch (loadError) {
                        this.api.log(`Could not auto-load devices after config update: ${loadError.message}`, 'warning');
                        // Don't fail the config save if device loading fails
                    }
                }

                this._broadcastStatus();

                res.json({
                    success: true,
                    message: 'Configuration updated successfully',
                    config: this.config,
                    deviceLoadSuccess,
                    deviceCount
                });

            } catch (error) {
                this.api.log(`Failed to update config: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - DEVICES ============

        // Get Devices
        this.api.registerRoute('get', '/api/openshock/devices', (req, res) => {
            res.json({
                success: true,
                devices: this.devices
            });
        });

        // Refresh Devices
        this.api.registerRoute('post', '/api/openshock/devices/refresh', async (req, res) => {
            try {
                await this.loadDevices();

                res.json({
                    success: true,
                    message: 'Devices refreshed successfully',
                    devices: this.devices
                });

            } catch (error) {
                this.api.log(`Failed to refresh devices: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get Single Device
        this.api.registerRoute('get', '/api/openshock/devices/:id', (req, res) => {
            const device = this.devices.find(d => d.id === req.params.id);

            if (!device) {
                return res.status(404).json({
                    success: false,
                    error: 'Device not found'
                });
            }

            res.json({
                success: true,
                device: device
            });
        });

        // Test Device
        this.api.registerRoute('post', '/api/openshock/test/:deviceId', async (req, res) => {
            try {
                const { deviceId } = req.params;
                const { type = 'vibrate', intensity = 30, duration = 1000 } = req.body;

                const device = this.devices.find(d => d.id === deviceId);
                if (!device) {
                    return res.status(404).json({
                        success: false,
                        error: 'Device not found'
                    });
                }

                // Check if shocker is paused
                if (device.isPaused) {
                    return res.status(403).json({
                        success: false,
                        error: 'Shocker is paused and cannot receive commands. Please unpause it in the OpenShock app first.'
                    });
                }

                // Safety-Check
                const safetyCheck = this.safetyManager.validateCommand({
                    deviceId,
                    type,
                    intensity,
                    duration,
                    userId: 'test-user',
                    source: 'manual-test'
                });

                if (!safetyCheck.allowed) {
                    return res.status(403).json({
                        success: false,
                        error: safetyCheck.reason
                    });
                }

                // Command senden
                await this.openShockClient.sendControl(deviceId, {
                    type,
                    intensity: safetyCheck.adjustedIntensity || intensity,
                    duration: safetyCheck.adjustedDuration || duration
                });

                // Log
                this._logCommand({
                    deviceId,
                    deviceName: device.name,
                    type,
                    intensity: safetyCheck.adjustedIntensity || intensity,
                    duration: safetyCheck.adjustedDuration || duration,
                    userId: 'test-user',
                    username: 'Manual Test',
                    source: 'manual-test',
                    success: true
                });

                this.stats.totalCommands++;
                this.stats.successfulCommands++;
                this.stats.lastCommandTime = Date.now();

                this._broadcastCommandSent({
                    device: device.name,
                    type,
                    intensity: safetyCheck.adjustedIntensity || intensity,
                    duration: safetyCheck.adjustedDuration || duration
                });

                res.json({
                    success: true,
                    message: 'Test command sent successfully'
                });

            } catch (error) {
                this.api.log(`Failed to send test command: ${error.message}`, 'error');
                
                // Log additional debug info
                if (error.response) {
                    this.api.log(`OpenShock API Error Details: ${JSON.stringify(error.response)}`, 'error');
                }
                
                // Provide helpful error message based on status code
                let userMessage = error.message;
                if (error.statusCode === 500) {
                    userMessage = 'OpenShock API server error. This could mean:\n' +
                                 '1. The API server is temporarily down\n' +
                                 '2. Your API key doesn\'t have permission to control this shocker\n' +
                                 '3. The shocker is offline or unavailable\n\n' +
                                 'Please check your OpenShock account and try again.';
                } else if (error.statusCode === 401 || error.statusCode === 403) {
                    userMessage = 'Authentication or permission error. Please check your API key has permission to control this shocker.';
                }
                
                res.status(500).json({
                    success: false,
                    error: userMessage
                });
            }
        });

        // ============ API ROUTES - MAPPINGS ============

        // Get All Mappings
        this.api.registerRoute('get', '/api/openshock/mappings', (req, res) => {
            try {
                const mappings = this.mappingEngine.getAllMappings();
                res.json({
                    success: true,
                    mappings
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Create Mapping
        this.api.registerRoute('post', '/api/openshock/mappings', async (req, res) => {
            try {
                const mapping = req.body;
                
                this.api.log(`[Mapping Save] Received mapping: ${mapping.name}`, 'info');
                this.api.log(`[Mapping Save] Event type: ${mapping.eventType}`, 'info');
                this.api.log(`[Mapping Save] Action type: ${mapping.action?.type}`, 'info');
                this.api.log(`[Mapping Save] Mapping data: ${JSON.stringify(mapping)}`, 'debug');
                
                const addedMapping = this.mappingEngine.addMapping(mapping);

                this.api.log(`[Mapping Save] Mapping added to engine with ID: ${addedMapping.id}`, 'info');

                // Save to database
                this._saveMappingToDatabase(addedMapping);

                this.api.log(`[Mapping Save] Mapping saved to database successfully`, 'info');

                // Broadcast update if this is a gift mapping
                if (addedMapping.eventType === 'gift') {
                    this._broadcastGiftMappingsUpdate();
                }

                res.json({
                    success: true,
                    message: 'Mapping created successfully',
                    id: addedMapping.id,
                    mapping: addedMapping
                });

            } catch (error) {
                this.api.log(`[Mapping Save] Error: ${error.message}`, 'error');
                this.api.log(`[Mapping Save] Stack: ${error.stack}`, 'debug');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update Mapping
        this.api.registerRoute('put', '/api/openshock/mappings/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const mapping = req.body;

                const updatedMapping = this.mappingEngine.updateMapping(id, mapping);

                // Save to database
                this._saveMappingToDatabase(updatedMapping);

                // Broadcast update if this is a gift mapping
                if (updatedMapping.eventType === 'gift') {
                    this._broadcastGiftMappingsUpdate();
                }

                res.json({
                    success: true,
                    message: 'Mapping updated successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Delete Mapping
        this.api.registerRoute('delete', '/api/openshock/mappings/:id', async (req, res) => {
            try {
                const id = req.params.id;

                const mapping = this.mappingEngine.getMapping(id);
                const wasGiftMapping = mapping && mapping.eventType === 'gift';

                this.mappingEngine.deleteMapping(id);

                // Delete from database
                this._deleteMappingFromDatabase(id);

                // Broadcast update if this was a gift mapping
                if (wasGiftMapping) {
                    this._broadcastGiftMappingsUpdate();
                }

                res.json({
                    success: true,
                    message: 'Mapping deleted successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Import Mappings
        this.api.registerRoute('post', '/api/openshock/mappings/import', async (req, res) => {
            try {
                const { mappings } = req.body;

                if (!Array.isArray(mappings)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid mappings format'
                    });
                }

                let imported = 0;
                for (const mapping of mappings) {
                    const addedMapping = this.mappingEngine.addMapping(mapping);
                    // Save each mapping to database
                    this._saveMappingToDatabase(addedMapping);
                    imported++;
                }

                res.json({
                    success: true,
                    message: `${imported} mappings imported successfully`,
                    imported
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Export Mappings
        this.api.registerRoute('get', '/api/openshock/mappings/export', (req, res) => {
            try {
                const mappings = this.mappingEngine.getAllMappings();

                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="openshock-mappings-${Date.now()}.json"`);
                res.json(mappings);

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - PATTERNS ============

        // Get All Patterns
        this.api.registerRoute('get', '/api/openshock/patterns', (req, res) => {
            try {
                const patterns = this.patternEngine.getAllPatterns();
                res.json({
                    success: true,
                    patterns
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Create Pattern
        this.api.registerRoute('post', '/api/openshock/patterns', async (req, res) => {
            try {
                const pattern = req.body;
                
                this.api.log(`[Pattern Save] Received pattern: ${pattern.name}`, 'info');
                this.api.log(`[Pattern Save] Steps count: ${pattern.steps?.length || 0}`, 'info');
                this.api.log(`[Pattern Save] Steps data: ${JSON.stringify(pattern.steps)}`, 'debug');
                
                const addedPattern = this.patternEngine.addPattern(pattern);

                this.api.log(`[Pattern Save] Pattern added to engine with ID: ${addedPattern.id}`, 'info');

                // Save to database
                this._savePatternToDatabase(addedPattern);

                this.api.log(`[Pattern Save] Pattern saved to database successfully`, 'info');

                res.json({
                    success: true,
                    message: 'Pattern created successfully',
                    id: addedPattern.id,
                    pattern: addedPattern
                });

            } catch (error) {
                this.api.log(`[Pattern Save] Error: ${error.message}`, 'error');
                this.api.log(`[Pattern Save] Stack: ${error.stack}`, 'debug');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update Pattern
        this.api.registerRoute('put', '/api/openshock/patterns/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const pattern = req.body;

                const updatedPattern = this.patternEngine.updatePattern(id, pattern);

                // Save to database
                this._savePatternToDatabase(updatedPattern);

                res.json({
                    success: true,
                    message: 'Pattern updated successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Delete Pattern
        this.api.registerRoute('delete', '/api/openshock/patterns/:id', async (req, res) => {
            try {
                const id = req.params.id;

                this.patternEngine.deletePattern(id);

                // Delete from database
                this._deletePatternFromDatabase(id);

                res.json({
                    success: true,
                    message: 'Pattern deleted successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Execute Pattern
        this.api.registerRoute('post', '/api/openshock/patterns/execute', async (req, res) => {
            try {
                const { patternId, deviceId, variables = {} } = req.body;

                const pattern = this.patternEngine.getPattern(patternId);
                if (!pattern) {
                    return res.status(404).json({
                        success: false,
                        error: 'Pattern not found'
                    });
                }

                const device = this.devices.find(d => d.id === deviceId);
                if (!device) {
                    return res.status(404).json({
                        success: false,
                        error: 'Device not found'
                    });
                }

                // Pattern ausführen
                const executionId = await this._executePattern(pattern, device, {
                    userId: 'manual-execution',
                    username: 'Manual',
                    source: 'manual',
                    variables
                });

                res.json({
                    success: true,
                    message: 'Pattern execution started',
                    executionId
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Stop Pattern Execution
        this.api.registerRoute('post', '/api/openshock/patterns/stop/:executionId', async (req, res) => {
            try {
                const { executionId } = req.params;

                if (this.activePatternExecutions.has(executionId)) {
                    const execution = this.activePatternExecutions.get(executionId);
                    execution.cancelled = true;
                    this.activePatternExecutions.delete(executionId);

                    res.json({
                        success: true,
                        message: 'Pattern execution stopped'
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Execution not found or already completed'
                    });
                }

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Import Pattern
        this.api.registerRoute('post', '/api/openshock/patterns/import', async (req, res) => {
            try {
                const pattern = req.body;

                const addedPattern = this.patternEngine.addPattern(pattern);

                // Save to database
                this._savePatternToDatabase(addedPattern);

                res.json({
                    success: true,
                    message: 'Pattern imported successfully',
                    id: addedPattern.id
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Export Pattern
        this.api.registerRoute('get', '/api/openshock/patterns/export/:id', (req, res) => {
            try {
                // Pattern IDs are TEXT (UUIDs), not integers - use directly without parseInt
                const id = req.params.id;
                const pattern = this.patternEngine.getPattern(id);

                if (!pattern) {
                    return res.status(404).json({
                        success: false,
                        error: 'Pattern not found'
                    });
                }

                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="pattern-${pattern.name}-${Date.now()}.json"`);
                res.json(pattern);

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - GIFT CATALOG ============
        
        // Get Gift Catalog
        this.api.registerRoute('get', '/api/openshock/gift-catalog', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const catalog = db.getGiftCatalog();
                
                res.json({
                    success: true,
                    gifts: catalog
                });
            } catch (error) {
                this.api.log(`Failed to get gift catalog: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - SAFETY ============

        // Get Safety Settings
        this.api.registerRoute('get', '/api/openshock/safety', (req, res) => {
            try {
                const settings = this.safetyManager.getSettings();
                res.json({
                    success: true,
                    settings
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update Safety Settings
        this.api.registerRoute('post', '/api/openshock/safety', async (req, res) => {
            try {
                const settings = req.body;

                this.safetyManager.updateConfig(settings);

                // Update config
                this.config.globalLimits = settings.globalLimits || this.config.globalLimits;
                this.config.defaultCooldowns = settings.defaultCooldowns || this.config.defaultCooldowns;
                this.config.userLimits = settings.userLimits || this.config.userLimits;
                this.config.emergencyStop = settings.emergencyStop || this.config.emergencyStop;

                await this.saveData();

                res.json({
                    success: true,
                    message: 'Safety settings updated successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Emergency Stop
        this.api.registerRoute('post', '/api/openshock/emergency-stop', async (req, res) => {
            try {
                // Emergency Stop aktivieren
                this.safetyManager.triggerEmergencyStop('Manual emergency stop triggered via API');
                this.config.emergencyStop.enabled = true;

                await this.saveData();

                // Queue leeren
                await this.queueManager.clearQueue();

                // Alle Pattern-Executions stoppen
                this.activePatternExecutions.clear();

                // Stats
                this.stats.emergencyStops++;

                // Broadcast
                this._broadcastEmergencyStop();

                this.api.log('EMERGENCY STOP ACTIVATED', 'warn');

                res.json({
                    success: true,
                    message: 'Emergency stop activated'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Clear Emergency Stop
        this.api.registerRoute('post', '/api/openshock/emergency-clear', async (req, res) => {
            try {
                // Emergency Stop deaktivieren
                this.safetyManager.clearEmergencyStop();
                this.config.emergencyStop.enabled = false;

                await this.saveData();

                this.api.log('Emergency stop cleared', 'info');

                this._broadcastStatus();

                res.json({
                    success: true,
                    message: 'Emergency stop cleared'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - QUEUE ============

        // Get Queue Status
        this.api.registerRoute('get', '/api/openshock/queue/status', (req, res) => {
            try {
                const status = this.queueManager.getQueueStatus();
                res.json({
                    success: true,
                    status
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Clear Queue
        this.api.registerRoute('post', '/api/openshock/queue/clear', async (req, res) => {
            try {
                await this.queueManager.clearQueue();

                res.json({
                    success: true,
                    message: 'Queue cleared successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Remove Queue Item
        this.api.registerRoute('delete', '/api/openshock/queue/:id', (req, res) => {
            try {
                const id = req.params.id;
                const removed = this.queueManager.removeItem(id);

                if (removed) {
                    res.json({
                        success: true,
                        message: 'Queue item removed'
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Queue item not found'
                    });
                }

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - STATS ============

        // Get Statistics
        this.api.registerRoute('get', '/api/openshock/stats', (req, res) => {
            try {
                const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
                const queueStatus = this.queueManager.getQueueStatus();

                res.json({
                    success: true,
                    stats: {
                        ...this.stats,
                        uptime,
                        queueSize: queueStatus.queueSize,
                        queuePending: queueStatus.pending,
                        queueProcessing: queueStatus.processing,
                        activePatternExecutions: this.activePatternExecutions.size,
                        devicesCount: this.devices.length,
                        mappingsCount: this.mappingEngine.getAllMappings().length,
                        patternsCount: this.patternEngine.getAllPatterns().length
                    }
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Test Connection
        this.api.registerRoute('post', '/api/openshock/test-connection', async (req, res) => {
            try {
                if (!this.openShockClient) {
                    return res.status(500).json({
                        success: false,
                        error: 'OpenShock client not initialized'
                    });
                }

                const result = await this.openShockClient.testConnection();
                
                if (result.success) {
                    res.json({
                        success: true,
                        message: 'Connection successful',
                        latency: result.latency,
                        deviceCount: result.deviceCount,
                        timestamp: result.timestamp
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: result.error || 'Connection test failed'
                    });
                }

            } catch (error) {
                this.api.log(`Connection test failed: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - ROTATING GIFTS OVERLAY ============

        // Get Active Gift Mappings for Overlay
        this.api.registerRoute('get', '/api/openshock/gifts/active', (req, res) => {
            try {
                const activeMappings = Array.from(this.mappingEngine.mappings.values())
                    .filter(m => m.enabled && m.eventType === 'gift')
                    .map(m => {
                        const giftName = m.conditions?.giftName || 'Unknown Gift';
                        let giftIconUrl = null;
                        let giftId = null;

                        // Try to get gift info from database
                        const db = this.api.getDatabase();
                        const gifts = db.getGiftCatalog();
                        const gift = gifts.find(g => g.name === giftName);
                        
                        if (gift) {
                            giftIconUrl = gift.image_url;
                            giftId = gift.id;
                        }

                        // Extract pattern info
                        let patternName = 'Direct Command';
                        let patternDurationMs = 0;
                        let intensity = 0;

                        if (m.action.type === 'pattern') {
                            const pattern = this.patternEngine.getPattern(m.action.patternId);
                            if (pattern) {
                                patternName = pattern.name;
                                // Calculate total pattern duration
                                patternDurationMs = pattern.steps.reduce((sum, step) => sum + (step.duration || 0), 0);
                            }
                            intensity = m.action.intensity || 50;
                        } else if (m.action.type === 'command') {
                            patternDurationMs = m.action.duration || 1000;
                            intensity = m.action.intensity || 50;
                        }

                        return {
                            id: m.id,
                            giftName,
                            giftId,
                            giftIconUrl,
                            patternName,
                            patternDurationMs,
                            intensity,
                            active: m.enabled
                        };
                    });

                res.json({
                    success: true,
                    gifts: activeMappings
                });
            } catch (error) {
                this.api.log(`Error getting active gift mappings: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - ZAPPIEHELL ============

        // Get all goals
        this.api.registerRoute('get', '/api/openshock/zappiehell/goals', (req, res) => {
            try {
                const goals = this.zappieHellManager.getAllGoals();
                res.json({
                    success: true,
                    goals
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get active goals
        this.api.registerRoute('get', '/api/openshock/zappiehell/goals/active', (req, res) => {
            try {
                const goals = this.zappieHellManager.getActiveGoals();
                res.json({
                    success: true,
                    goals
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Create goal
        this.api.registerRoute('post', '/api/openshock/zappiehell/goals', (req, res) => {
            try {
                const goal = this.zappieHellManager.addGoal(req.body);
                this._broadcastZappieHellUpdate({ goals: this.zappieHellManager.getAllGoals() });
                res.json({
                    success: true,
                    goal
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update goal
        this.api.registerRoute('put', '/api/openshock/zappiehell/goals/:id', (req, res) => {
            try {
                const goal = this.zappieHellManager.updateGoal(req.params.id, req.body);
                this._broadcastZappieHellUpdate({ goals: this.zappieHellManager.getAllGoals() });
                res.json({
                    success: true,
                    goal
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Delete goal
        this.api.registerRoute('delete', '/api/openshock/zappiehell/goals/:id', (req, res) => {
            try {
                this.zappieHellManager.deleteGoal(req.params.id);
                this._broadcastZappieHellUpdate({ goals: this.zappieHellManager.getAllGoals() });
                res.json({
                    success: true,
                    message: 'Goal deleted'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Reset goal
        this.api.registerRoute('post', '/api/openshock/zappiehell/goals/:id/reset', (req, res) => {
            try {
                this.zappieHellManager.resetGoal(req.params.id);
                this._broadcastZappieHellUpdate({ goals: this.zappieHellManager.getAllGoals() });
                res.json({
                    success: true,
                    message: 'Goal reset'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Reset all stream goals
        this.api.registerRoute('post', '/api/openshock/zappiehell/goals/reset-stream', (req, res) => {
            try {
                this.zappieHellManager.resetStreamGoals();
                this._broadcastZappieHellUpdate({ goals: this.zappieHellManager.getAllGoals() });
                res.json({
                    success: true,
                    message: 'Stream goals reset'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get all event chains
        this.api.registerRoute('get', '/api/openshock/zappiehell/chains', (req, res) => {
            try {
                const chains = this.zappieHellManager.getAllEventChains();
                res.json({
                    success: true,
                    chains
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Create event chain
        this.api.registerRoute('post', '/api/openshock/zappiehell/chains', (req, res) => {
            try {
                const chain = this.zappieHellManager.addEventChain(req.body);
                res.json({
                    success: true,
                    chain
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update event chain
        this.api.registerRoute('put', '/api/openshock/zappiehell/chains/:id', (req, res) => {
            try {
                const chain = this.zappieHellManager.updateEventChain(req.params.id, req.body);
                res.json({
                    success: true,
                    chain
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Delete event chain
        this.api.registerRoute('delete', '/api/openshock/zappiehell/chains/:id', (req, res) => {
            try {
                this.zappieHellManager.deleteEventChain(req.params.id);
                res.json({
                    success: true,
                    message: 'Event chain deleted'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Test execute event chain
        this.api.registerRoute('post', '/api/openshock/zappiehell/chains/:id/execute', async (req, res) => {
            try {
                const chain = this.zappieHellManager.eventChains.get(req.params.id);
                if (!chain) {
                    return res.status(404).json({
                        success: false,
                        error: 'Event chain not found'
                    });
                }

                // Execute in background
                this.zappieHellManager.executeEventChain(chain, { source: 'manual_test' });

                res.json({
                    success: true,
                    message: 'Event chain execution started'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.log('OpenShock routes registered', 'info');
    }

    /**
     * Socket.IO Events registrieren
     */
    _registerSocketEvents() {
        const io = this.api.getSocketIO();

        // Client requests active goals state
        io.on('connection', (socket) => {
            // Send initial ZappieHell state when client connects
            socket.on('zappiehell:request:state', () => {
                const goals = this.zappieHellManager.getActiveGoals();
                socket.emit('zappiehell:goals:state', { goals });
            });

            // Send initial gift mappings when client connects
            socket.on('openshock:request:gifts', () => {
                const activeMappings = Array.from(this.mappingEngine.mappings.values())
                    .filter(m => m.enabled && m.eventType === 'gift')
                    .map(m => {
                        const giftName = m.conditions?.giftName || 'Unknown Gift';
                        let giftIconUrl = null;
                        let giftId = null;

                        const db = this.api.getDatabase();
                        const gifts = db.getGiftCatalog();
                        const gift = gifts.find(g => g.name === giftName);
                        
                        if (gift) {
                            giftIconUrl = gift.image_url;
                            giftId = gift.id;
                        }

                        let patternName = 'Direct Command';
                        let patternDurationMs = 0;
                        let intensity = 0;

                        if (m.action.type === 'pattern') {
                            const pattern = this.patternEngine.getPattern(m.action.patternId);
                            if (pattern) {
                                patternName = pattern.name;
                                patternDurationMs = pattern.steps.reduce((sum, step) => sum + (step.duration || 0), 0);
                            }
                            intensity = m.action.intensity || 50;
                        } else if (m.action.type === 'command') {
                            patternDurationMs = m.action.duration || 1000;
                            intensity = m.action.intensity || 50;
                        }

                        return {
                            id: m.id,
                            giftName,
                            giftId,
                            giftIconUrl,
                            patternName,
                            patternDurationMs,
                            intensity,
                            active: m.enabled
                        };
                    });

                socket.emit('openshock:gifts:active_list', { gifts: activeMappings });
            });
        });

        this.api.log('OpenShock Socket.IO events registered', 'info');
    }

    /**
     * TikTok Event-Handler registrieren
     */
    _registerTikTokEvents() {
        // Chat
        this.api.registerTikTokEvent('chat', async (data) => {
            await this.handleTikTokEvent('chat', data);
        });

        // Gift
        this.api.registerTikTokEvent('gift', async (data) => {
            await this.handleTikTokEvent('gift', data);
        });

        // Follow
        this.api.registerTikTokEvent('follow', async (data) => {
            await this.handleTikTokEvent('follow', data);
        });

        // Share
        this.api.registerTikTokEvent('share', async (data) => {
            await this.handleTikTokEvent('share', data);
        });

        // Subscribe
        this.api.registerTikTokEvent('subscribe', async (data) => {
            await this.handleTikTokEvent('subscribe', data);
        });

        // Like
        this.api.registerTikTokEvent('like', async (data) => {
            await this.handleTikTokEvent('like', data);
        });

        // Goal Progress
        this.api.registerTikTokEvent('goal_progress', async (data) => {
            await this.handleTikTokEvent('goal_progress', data);
        });

        // Goal Complete
        this.api.registerTikTokEvent('goal_complete', async (data) => {
            await this.handleTikTokEvent('goal_complete', data);
        });

        this.api.log('OpenShock TikTok event handlers registered', 'info');
    }

    /**
     * IFTTT Flow Actions registrieren
     */
    /**
     * IFTTT Flow Actions registrieren (Legacy - kept for backwards compatibility)
     * Note: The main IFTTT integration is now in action-registry.js
     */
    _registerIFTTTActions() {
        // Legacy flow action support - these delegate to executeAction for consistency
        this.api.registerFlowAction('openshock.send_shock', async (params) => {
            return await this.executeAction({
                type: 'command',
                deviceId: params.deviceId,
                commandType: 'shock',
                intensity: params.intensity || 50,
                duration: params.duration || 1000
            }, {
                userId: 'flow-system-legacy',
                username: 'Legacy Flow',
                source: 'legacy-flow-action',
                sourceData: params
            });
        });

        this.api.registerFlowAction('openshock.send_vibrate', async (params) => {
            return await this.executeAction({
                type: 'command',
                deviceId: params.deviceId,
                commandType: 'vibrate',
                intensity: params.intensity || 50,
                duration: params.duration || 1000
            }, {
                userId: 'flow-system-legacy',
                username: 'Legacy Flow',
                source: 'legacy-flow-action',
                sourceData: params
            });
        });

        this.api.registerFlowAction('openshock.execute_pattern', async (params) => {
            return await this.executeAction({
                type: 'pattern',
                deviceId: params.deviceId,
                patternId: params.patternId
            }, {
                userId: 'flow-system-legacy',
                username: 'Legacy Flow',
                source: 'legacy-flow-action',
                sourceData: params
            });
        });

        this.api.log('OpenShock legacy flow actions registered (delegate to executeAction)', 'info');
    }

    /**
     * TikTok Event Handler
     */
    async handleTikTokEvent(eventType, eventData) {
        try {
            // Stats
            this.stats.tiktokEventsProcessed++;

            // Enhanced logging for gift events
            if (eventType === 'gift') {
                this.api.log(`[Gift Event] Received gift: ${eventData.giftName || eventData.gift?.name || 'unknown'}`, 'info');
                this.api.log(`[Gift Event] Gift coins: ${eventData.giftCoins || eventData.coins || 0}`, 'info');
                this.api.log(`[Gift Event] Event data: ${JSON.stringify(eventData)}`, 'debug');

                // Add coins to ZappieHell goals
                const coins = eventData.giftCoins || eventData.coins || 0;
                if (coins > 0) {
                    await this.zappieHellManager.addCoins(coins, 'gift');
                }
            }

            // Event-Log
            this._addEventLog({
                type: eventType,
                source: 'tiktok',
                data: eventData,
                timestamp: Date.now()
            });

            // Mapping-Engine fragen, welche Actions getriggert werden sollen
            const matches = this.mappingEngine.evaluateEvent(eventType, eventData);

            if (matches.length === 0) {
                if (eventType === 'gift') {
                    this.api.log(`[Gift Event] No mappings matched for gift: ${eventData.giftName || eventData.gift?.name || 'unknown'}`, 'warn');
                }
                return;
            }

            this.api.log(`[Event Handler] ${matches.length} mapping(s) matched for ${eventType} event`, 'info');

            // Extract actions from matches
            const actions = matches.map(m => m.action);

            // Jede Action ausführen
            for (const action of actions) {
                await this.executeAction(action, {
                    userId: eventData.userId || eventData.uniqueId || 'unknown',
                    username: eventData.username || eventData.nickname || 'Unknown',
                    source: eventType,
                    sourceData: eventData
                });
            }

        } catch (error) {
            this.api.log(`Error handling TikTok event ${eventType}: ${error.message}`, 'error');
            this._addError(`TikTok Event Error (${eventType})`, error.message);
        }
    }

    /**
     * Action ausführen
     */
    async executeAction(action, context) {
        try {
            const { userId, username, source, sourceData } = context;

            // Emergency Stop Check
            if (this.config.emergencyStop.enabled) {
                this.api.log('Action blocked: Emergency Stop is active', 'warn');
                this.stats.blockedCommands++;
                return {
                    success: false,
                    error: 'Emergency Stop is active',
                    blocked: true
                };
            }

            // Pause Check
            if (this.isPaused) {
                this.api.log('Action blocked: Plugin is paused', 'warn');
                this.stats.blockedCommands++;
                return {
                    success: false,
                    error: 'Plugin is paused',
                    blocked: true
                };
            }

            // Action-Type bestimmen
            if (action.type === 'command') {
                // Direkter Command
                await this._executeCommand(action, context);
                return {
                    success: true,
                    message: 'Command queued successfully',
                    type: action.commandType
                };

            } else if (action.type === 'pattern') {
                // Pattern ausführen
                const executionId = await this._executePatternFromAction(action, context);
                return {
                    success: true,
                    message: 'Pattern execution started',
                    executionId
                };

            } else {
                this.api.log(`Unknown action type: ${action.type}`, 'warn');
                return {
                    success: false,
                    error: `Unknown action type: ${action.type}`
                };
            }

        } catch (error) {
            this.api.log(`Error executing action: ${error.message}`, 'error');
            this._addError('Action Execution Error', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Command ausführen (über Queue)
     */
    async _executeCommand(action, context) {
        const { userId, username, source, sourceData } = context;
        const { deviceId, commandType, intensity, duration } = action;

        // Device finden
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            this.api.log(`Device ${deviceId} not found`, 'warn');
            return;
        }

        // In Queue einfügen
        this.queueManager.addItem({
            id: `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            type: 'command',
            deviceId,
            deviceName: device.name,
            commandType,
            intensity,
            duration,
            userId,
            username,
            source,
            sourceData,
            timestamp: Date.now(),
            priority: action.priority || 5
        });

        this.stats.queuedCommands++;
    }

    /**
     * Pattern ausführen (über Queue)
     */
    async _executePatternFromAction(action, context) {
        const { userId, username, source, sourceData } = context;
        const { deviceId, patternId, variables = {} } = action;

        // Pattern laden
        const pattern = this.patternEngine.getPattern(patternId);
        if (!pattern) {
            this.api.log(`Pattern ${patternId} not found`, 'warn');
            return null;
        }

        // Device finden
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            this.api.log(`Device ${deviceId} not found`, 'warn');
            return null;
        }

        // Pattern ausführen and return executionId
        return await this._executePattern(pattern, device, {
            userId,
            username,
            source,
            sourceData,
            variables
        });
    }

    /**
     * Pattern ausführen (alle Steps in Queue)
     */
    async _executePattern(pattern, device, context) {
        const executionId = `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

        this.api.log(`[Pattern Execution] Starting pattern "${pattern.name}" (ID: ${pattern.id}) on device "${device.name}" (ID: ${device.id})`, 'info');
        this.api.log(`[Pattern Execution] Pattern has ${pattern.steps?.length || 0} steps`, 'info');

        // Execution tracken
        this.activePatternExecutions.set(executionId, {
            patternId: pattern.id,
            patternName: pattern.name,
            deviceId: device.id,
            deviceName: device.name,
            startTime: Date.now(),
            cancelled: false
        });

        // Pattern-Steps direkt aus pattern.steps verwenden
        const steps = pattern.steps || [];

        if (steps.length === 0) {
            this.api.log(`[Pattern Execution] Warning: Pattern "${pattern.name}" has no steps!`, 'warn');
            return executionId;
        }

        // Calculate cumulative delay for each command step
        // Pause steps add to the cumulative delay, command steps use the cumulative delay
        let cumulativeDelay = 0;
        let queuedSteps = 0;
        const baseTimestamp = Date.now();

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];

            if (step.type === 'pause') {
                // Pause steps add to the cumulative delay for subsequent commands
                cumulativeDelay += step.duration || 0;
                this.api.log(`[Pattern Execution] Step ${i}: Pause (${step.duration}ms) - cumulative delay now ${cumulativeDelay}ms`, 'debug');
                continue;
            }

            // For command steps (shock, vibrate, sound), schedule with cumulative delay
            const scheduledTime = baseTimestamp + cumulativeDelay + (step.delay || 0);
            
            this.api.log(`[Pattern Execution] Step ${i}: ${step.type} (intensity: ${step.intensity}, duration: ${step.duration}ms) scheduled at +${cumulativeDelay}ms`, 'debug');

            this.queueManager.addItem({
                id: `${executionId}-step-${i}`,
                type: 'command',
                deviceId: device.id,
                deviceName: device.name,
                commandType: step.type,
                intensity: step.intensity,
                duration: step.duration,
                userId: context.userId,
                username: context.username,
                source: `pattern:${pattern.name}`,
                sourceData: context.sourceData,
                timestamp: scheduledTime,
                priority: 5,
                executionId,
                stepIndex: i
            });
            queuedSteps++;

            // After a command step, add its duration to cumulative delay
            // This ensures the next command waits for this one to complete
            cumulativeDelay += step.duration || 0;
        }

        this.api.log(`[Pattern Execution] Queued ${queuedSteps} steps for pattern "${pattern.name}" (executionId: ${executionId}), total duration: ${cumulativeDelay}ms`, 'info');
        this.stats.patternsExecuted++;

        return executionId;
    }

    /**
     * Queue-Item verarbeiten
     */
    async _processQueueItem(item) {
        try {
            // Check ob Execution gecancelt wurde
            if (item.executionId) {
                const execution = this.activePatternExecutions.get(item.executionId);
                if (execution && execution.cancelled) {
                    this.api.log(`Pattern execution ${item.executionId} was cancelled, skipping step`, 'info');
                    return true; // Als erfolgreich markieren (damit keine Retries)
                }
            }

            // Safety-Check
            const safetyCheck = this.safetyManager.validateCommand({
                deviceId: item.deviceId,
                type: item.commandType,
                intensity: item.intensity,
                duration: item.duration,
                userId: item.userId,
                source: item.source
            });

            if (!safetyCheck.allowed) {
                this.api.log(`Command blocked by safety: ${safetyCheck.reason}`, 'warn');
                this.stats.blockedCommands++;

                // Log
                this._logCommand({
                    ...item,
                    success: false,
                    errorMessage: `Blocked: ${safetyCheck.reason}`
                });

                return false;
            }

            // Command senden
            await this.openShockClient.sendControl(item.deviceId, {
                type: item.commandType,
                intensity: safetyCheck.adjustedIntensity || item.intensity,
                duration: safetyCheck.adjustedDuration || item.duration
            });

            // Log
            this._logCommand({
                deviceId: item.deviceId,
                deviceName: item.deviceName,
                type: item.commandType,
                intensity: safetyCheck.adjustedIntensity || item.intensity,
                duration: safetyCheck.adjustedDuration || item.duration,
                userId: item.userId,
                username: item.username,
                source: item.source,
                success: true
            });

            // Stats
            this.stats.totalCommands++;
            this.stats.lastCommandTime = Date.now();

            // Broadcast
            this._broadcastCommandSent({
                device: item.deviceName,
                type: item.commandType,
                intensity: safetyCheck.adjustedIntensity || item.intensity,
                duration: safetyCheck.adjustedDuration || item.duration,
                user: item.username,
                source: item.source
            });

            // Wenn Pattern-Step, checken ob letzter Step
            if (item.executionId) {
                const execution = this.activePatternExecutions.get(item.executionId);
                if (execution) {
                    // Prüfen ob alle Steps verarbeitet wurden
                    // (Wird vereinfacht - in Produktion würde man die Steps tracken)
                    // Für jetzt: Execution nach 10 Sekunden entfernen
                    setTimeout(() => {
                        this.activePatternExecutions.delete(item.executionId);
                    }, 10000);
                }
            }

            return true;

        } catch (error) {
            this.api.log(`Failed to process queue item: ${error.message}`, 'error');

            // Log
            this._logCommand({
                deviceId: item.deviceId,
                deviceName: item.deviceName,
                type: item.commandType,
                intensity: item.intensity,
                duration: item.duration,
                userId: item.userId,
                username: item.username,
                source: item.source,
                success: false,
                errorMessage: error.message
            });

            this._addError('Queue Processing Error', error.message);

            return false;
        }
    }

    /**
     * Devices von OpenShock API laden
     */
    async loadDevices() {
        try {
            if (!this.config.apiKey || this.config.apiKey.trim() === '') {
                throw new Error('API Key not configured');
            }

            this.api.log('Loading devices from OpenShock API...', 'info');

            const devices = await this.openShockClient.getDevices();
            this.devices = devices;

            this.api.log(`Loaded ${devices.length} devices`, 'info');

            // Broadcast
            this._broadcastDeviceUpdate();

            return devices;

        } catch (error) {
            this.api.log(`Failed to load devices: ${error.message}`, 'error');
            this._addError('Device Loading Error', error.message);
            throw error;
        }
    }

    /**
     * Daten laden (Config, Mappings, Patterns)
     */
    async loadData() {
        const db = this.api.getDatabase();

        // Config laden
        try {
            const configRow = db.prepare('SELECT value FROM openshock_config WHERE key = ?').get('config');
            if (configRow) {
                const savedConfig = JSON.parse(configRow.value);
                this.config = { ...this.config, ...savedConfig };
            }
        } catch (error) {
            this.api.log(`Failed to load config from database: ${error.message}`, 'warn');
        }

        this.api.log('OpenShock data loaded', 'info');
    }

    /**
     * Daten speichern (Config, Mappings, Patterns)
     */
    async saveData() {
        const db = this.api.getDatabase();

        // Config speichern
        try {
            const stmt = db.prepare('INSERT OR REPLACE INTO openshock_config (key, value) VALUES (?, ?)');
            stmt.run('config', JSON.stringify(this.config));
        } catch (error) {
            this.api.log(`Failed to save config to database: ${error.message}`, 'error');
        }

        this.api.log('OpenShock data saved', 'info');
    }

    /**
     * Load mappings from database
     */
    _loadMappingsFromDatabase() {
        const db = this.api.getDatabase();

        try {
            const mappings = db.prepare('SELECT * FROM openshock_mappings').all();

            for (const row of mappings) {
                try {
                    // Parse JSON columns
                    const conditions = row.conditions ? JSON.parse(row.conditions) : {};
                    const action = JSON.parse(row.action);

                    // Construct mapping object
                    const mapping = {
                        id: row.id,
                        name: row.name,
                        enabled: row.enabled === 1,
                        eventType: row.event_type,
                        conditions: conditions,
                        action: action
                    };

                    // Add to mapping engine (skip if ID already exists from presets)
                    if (!this.mappingEngine.getMapping(mapping.id)) {
                        this.mappingEngine.addMapping(mapping);
                    }
                } catch (error) {
                    this.api.log(`Failed to load mapping ${row.id}: ${error.message}`, 'warn');
                }
            }

            this.api.log(`Loaded ${mappings.length} mappings from database`, 'info');
        } catch (error) {
            this.api.log(`Failed to load mappings from database: ${error.message}`, 'error');
        }
    }

    /**
     * Load patterns from database
     */
    _loadPatternsFromDatabase() {
        const db = this.api.getDatabase();

        try {
            const patterns = db.prepare('SELECT * FROM openshock_patterns WHERE preset = 0').all();

            for (const row of patterns) {
                try {
                    // Parse JSON steps column
                    const steps = JSON.parse(row.steps);

                    // Construct pattern object
                    const pattern = {
                        id: row.id,
                        name: row.name,
                        description: row.description || '',
                        steps: steps,
                        preset: row.preset === 1
                    };

                    // Add to pattern engine (skip if ID already exists from presets)
                    if (!this.patternEngine.getPattern(pattern.id)) {
                        this.patternEngine.addPattern(pattern);
                    }
                } catch (error) {
                    this.api.log(`Failed to load pattern ${row.id}: ${error.message}`, 'warn');
                }
            }

            this.api.log(`Loaded ${patterns.length} custom patterns from database`, 'info');
        } catch (error) {
            this.api.log(`Failed to load patterns from database: ${error.message}`, 'error');
        }
    }

    /**
     * Save mapping to database
     */
    _saveMappingToDatabase(mapping) {
        const db = this.api.getDatabase();

        try {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO openshock_mappings
                (id, name, enabled, event_type, conditions, action, priority, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            stmt.run(
                mapping.id,
                mapping.name,
                mapping.enabled ? 1 : 0,
                mapping.eventType,
                JSON.stringify(mapping.conditions || {}),
                JSON.stringify(mapping.action),
                mapping.action?.priority || mapping.priority || 5
            );

            this.api.log(`Saved mapping ${mapping.id} to database`, 'info');
        } catch (error) {
            this.api.log(`Failed to save mapping to database: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Save pattern to database
     */
    _savePatternToDatabase(pattern) {
        const db = this.api.getDatabase();

        try {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO openshock_patterns
                (id, name, description, steps, preset, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            stmt.run(
                pattern.id,
                pattern.name,
                pattern.description || '',
                JSON.stringify(pattern.steps),
                pattern.preset ? 1 : 0
            );

            this.api.log(`Saved pattern ${pattern.id} to database`, 'info');
        } catch (error) {
            this.api.log(`Failed to save pattern to database: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Delete mapping from database
     */
    _deleteMappingFromDatabase(id) {
        const db = this.api.getDatabase();

        try {
            const stmt = db.prepare('DELETE FROM openshock_mappings WHERE id = ?');
            stmt.run(id);

            this.api.log(`Deleted mapping ${id} from database`, 'info');
        } catch (error) {
            this.api.log(`Failed to delete mapping from database: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Delete pattern from database
     */
    _deletePatternFromDatabase(id) {
        const db = this.api.getDatabase();

        try {
            const stmt = db.prepare('DELETE FROM openshock_patterns WHERE id = ?');
            stmt.run(id);

            this.api.log(`Deleted pattern ${id} from database`, 'info');
        } catch (error) {
            this.api.log(`Failed to delete pattern from database: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Command loggen
     */
    _logCommand(command) {
        const db = this.api.getDatabase();

        try {
            const stmt = db.prepare(`
                INSERT INTO openshock_command_history
                (device_id, device_name, command_type, intensity, duration, user_id, username, source, success, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                command.deviceId,
                command.deviceName,
                command.type,
                command.intensity,
                command.duration,
                command.userId,
                command.username,
                command.source,
                command.success ? 1 : 0,
                command.errorMessage || null
            );
        } catch (error) {
            this.api.log(`Failed to log command: ${error.message}`, 'error');
        }
    }

    /**
     * Event loggen
     */
    _addEventLog(event) {
        this.eventLog.push(event);

        if (this.eventLog.length > this.maxEventLog) {
            this.eventLog.shift();
        }

        // In Datenbank
        const db = this.api.getDatabase();

        try {
            const stmt = db.prepare(`
                INSERT INTO openshock_event_log
                (event_type, event_source, user_id, username, action_taken, success)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                event.type,
                event.source,
                event.data?.userId || event.data?.uniqueId || null,
                event.data?.username || event.data?.nickname || null,
                null,
                1
            );
        } catch (error) {
            this.api.log(`Failed to log event: ${error.message}`, 'error');
        }
    }

    /**
     * Error loggen
     */
    _addError(category, message) {
        const error = {
            category,
            message,
            timestamp: Date.now()
        };

        this.stats.errors.push(error);

        // Max 100 errors behalten
        if (this.stats.errors.length > 100) {
            this.stats.errors.shift();
        }
    }

    /**
     * Stats-Timer starten
     */
    _startStatsTimer() {
        // Alle 5 Sekunden Stats broadcasten
        this.statsInterval = setInterval(() => {
            this._broadcastStatsUpdate();
        }, 5000);
    }

    /**
     * Status broadcasten
     */
    _broadcastStatus() {
        this.api.emit('openshock:status', {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            emergencyStop: this.config.emergencyStop.enabled,
            devicesCount: this.devices.length,
            hasApiKey: !!(this.config.apiKey && this.config.apiKey.trim() !== '')
        });
    }

    /**
     * Device-Update broadcasten
     */
    _broadcastDeviceUpdate() {
        this.api.emit('openshock:device-update', {
            devices: this.devices
        });
    }

    /**
     * Command-Sent broadcasten
     */
    _broadcastCommandSent(data) {
        this.api.emit('openshock:command-sent', data);
    }

    /**
     * Queue-Update broadcasten
     */
    _broadcastQueueUpdate() {
        const status = this.queueManager.getQueueStatus();
        this.api.emit('openshock:queue-update', status);
    }

    /**
     * Emergency-Stop broadcasten
     */
    _broadcastEmergencyStop() {
        this.api.emit('openshock:emergency-stop', {
            timestamp: Date.now()
        });
    }

    /**
     * Stats-Update broadcasten
     */
    _broadcastStatsUpdate() {
        const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
        const queueStatus = this.queueManager ? this.queueManager.getQueueStatus() : {};

        this.api.emit('openshock:stats-update', {
            ...this.stats,
            uptime,
            queueSize: queueStatus.queueSize || 0,
            activePatternExecutions: this.activePatternExecutions.size
        });
    }

    /**
     * ZappieHell goals update broadcasten
     */
    _broadcastZappieHellUpdate(data) {
        this.api.emit('zappiehell:goals:update', data);
    }

    /**
     * ZappieHell goal completed broadcasten
     */
    _broadcastZappieHellCompleted(data) {
        this.api.emit('zappiehell:goals:completed', data);
    }

    /**
     * Gift mappings update broadcasten
     */
    _broadcastGiftMappingsUpdate() {
        this.api.emit('openshock:gifts:updated', {
            timestamp: Date.now()
        });
    }

    /**
     * Plugin beenden
     */
    async destroy() {
        try {
            this.api.log('OpenShock Plugin shutting down...', 'info');

            // Stats interval stoppen
            if (this.statsInterval) {
                clearInterval(this.statsInterval);
                this.statsInterval = null;
            }

            // Queue stoppen
            if (this.queueManager) {
                this.queueManager.stopProcessing();
            }

            // Safety Manager cleanup
            if (this.safetyManager && typeof this.safetyManager.destroy === 'function') {
                this.safetyManager.destroy();
            }

            // Pattern Engine cleanup
            if (this.patternEngine) {
                this.patternEngine.stopAllExecutions();
                this.patternEngine.cleanupExecutions(0); // Cleanup all
            }

            // Pattern-Executions stoppen
            this.activePatternExecutions.clear();

            // Daten speichern
            await this.saveData();

            this.isRunning = false;

            this.api.log('OpenShock Plugin shut down successfully', 'info');

        } catch (error) {
            this.api.log(`Error during shutdown: ${error.message}`, 'error');
        }
    }
}

module.exports = OpenShockPlugin;
