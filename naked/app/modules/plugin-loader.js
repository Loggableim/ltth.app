const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');
const express = require('express');
const {
    assertPluginId,
    assertPathInside,
    resolvePluginEntryPath
} = require('./plugin-paths');

/**
 * PluginAPI - Bereitgestellte API für Plugins
 * Ermöglicht sicheren Zugriff auf System-Funktionen
 */
class PluginAPI {
    constructor(pluginId, pluginDir, app, io, db, logger, pluginLoader, configPathManager, iftttEngine = null, tiktok = null) {
        this.pluginId = pluginId;
        this.pluginDir = pluginDir;
        this.app = app;
        this.io = io;
        this.db = db;
        this.logger = logger;
        this.pluginLoader = pluginLoader;
        this.configPathManager = configPathManager;
        this.iftttEngine = iftttEngine;
        this.tiktok = tiktok; // Reference to TikTok module for event cleanup

        // Registrierte Routes und Events für Cleanup
        this.registeredRoutes = [];
        this.registeredSocketEvents = [];
        this.registeredTikTokEvents = [];
        this.registeredPluginEvents = [];
        this.registeredFlowActions = [];
        this.registeredIFTTTTriggers = [];
        this.registeredIFTTTConditions = [];
        this.registeredIFTTTActions = [];

        // Backup provider registration flag
        this.backupProviderRegistered = false;
    }

    /**
     * Registriert eine Express-Route
     * @param {string} method - HTTP-Methode (GET, POST, PUT, DELETE)
     * @param {string} path - Route-Pfad (z.B. /api/topboard)
     * @param {function} handler - Route-Handler-Funktion
     */
    registerRoute(method, routePath, handler) {
        try {
            const fullPath = routePath.startsWith('/') ? routePath : `/${routePath}`;

            // Wrapper für Error-Handling
            const wrappedHandler = async (req, res, next) => {
                try {
                    const activePlugin = this.pluginLoader.plugins.get(this.pluginId);
                    if (!activePlugin || activePlugin.api !== this) {
                        return next();
                    }

                    await handler(req, res, next);
                } catch (error) {
                    this.log(`Route error in ${fullPath}: ${error.message}`, 'error');
                    res.status(500).json({
                        success: false,
                        error: 'Plugin route error',
                        message: error.message
                    });
                }
            };

            // Register route on the plugin router (not the main app)
            // This ensures routes are matched before the 404 handler even when
            // plugins are dynamically enabled after server start
            const methodLower = method.toLowerCase();
            const router = this.pluginLoader.getPluginRouter();
            
            if (!router[methodLower]) {
                throw new Error(`Invalid HTTP method: ${method}`);
            }

            router[methodLower](fullPath, wrappedHandler);
            this.registeredRoutes.push({ method, path: fullPath });
            this.log(`Registered route: ${method} ${fullPath}`);

            return true;
        } catch (error) {
            this.log(`Failed to register route: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Registriert einen Socket.io-Event-Handler
     * @param {string} event - Event-Name
     * @param {function} callback - Event-Callback
     */
    registerSocket(event, callback) {
        try {
            const wrappedCallback = async (socket, ...args) => {
                try {
                    await callback(socket, ...args);
                } catch (error) {
                    this.log(`Socket event error in ${event}: ${error.message}`, 'error');
                    socket.emit('plugin:error', {
                        plugin: this.pluginId,
                        event,
                        error: error.message
                    });
                }
            };

            this.registeredSocketEvents.push({ event, callback: wrappedCallback });
            this.log(`Registered socket event: ${event}`);

            return true;
        } catch (error) {
            this.log(`Failed to register socket event: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Registriert einen TikTok-Event-Handler
     * @param {string} event - TikTok-Event (gift, follow, subscribe, etc.)
     * @param {function} callback - Event-Callback
     */
    registerTikTokEvent(event, callback) {
        try {
            const wrappedCallback = async (data) => {
                try {
                    await callback(data);
                } catch (error) {
                    this.log(`TikTok event error in ${event}: ${error.message}`, 'error');
                }
            };

            // Only push into the internal array.
            // Actual registration on the TikTok EventEmitter happens EXCLUSIVELY
            // via registerPluginTikTokEvents(), which performs an atomic
            // removeListener + on() to prevent duplicate handlers.
            // An inline tiktok.on() here would collide with the subsequent
            // registerPluginTikTokEvents() call and cause double-fired events.
            this.registeredTikTokEvents.push({ event, callback: wrappedCallback });
            this.log(`Registered TikTok event (queued): ${event}`);

            return true;
        } catch (error) {
            this.log(`Failed to register TikTok event: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Registriert eine Flow-Action für Automatisierungen
     * @param {string} actionName - Name der Action (z.B. 'goals.set_value')
     * @param {function} handler - Action-Handler-Funktion
     */
    registerFlowAction(actionName, handler) {
        try {
            const wrappedHandler = async (params) => {
                try {
                    return await handler(params);
                } catch (error) {
                    this.log(`Flow action error in ${actionName}: ${error.message}`, 'error');
                    return {
                        success: false,
                        error: error.message
                    };
                }
            };

            this.registeredFlowActions.push({
                actionName,
                handler: wrappedHandler,
                pluginId: this.pluginId
            });
            this.log(`Registered flow action: ${actionName}`);

            return true;
        } catch (error) {
            this.log(`Failed to register flow action: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Registriert einen IFTTT-Trigger für die visuelle Flow-Erstellung
     * @param {string} id - Eindeutige Trigger-ID (empfohlen: 'pluginId:triggername')
     * @param {Object} config - Trigger-Konfiguration
     */
    registerIFTTTTrigger(id, config) {
        try {
            if (!this.iftttEngine) {
                this.log('IFTTT Engine not available, trigger registration skipped', 'warn');
                return false;
            }

            // Prefix mit Plugin-ID wenn nicht bereits vorhanden
            const triggerId = id.includes(':') ? id : `${this.pluginId}:${id}`;

            // Kategorie automatisch setzen falls nicht angegeben
            if (!config.category) {
                config.category = this.pluginId;
            }

            this.iftttEngine.triggers.register(triggerId, config);
            this.registeredIFTTTTriggers.push(triggerId);
            this.log(`Registered IFTTT trigger: ${triggerId}`);

            return true;
        } catch (error) {
            this.log(`Failed to register IFTTT trigger: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Registriert eine IFTTT-Condition für die visuelle Flow-Erstellung
     * @param {string} id - Eindeutige Condition-ID (empfohlen: 'pluginId:conditionname')
     * @param {Object} config - Condition-Konfiguration
     */
    registerIFTTTCondition(id, config) {
        try {
            if (!this.iftttEngine) {
                this.log('IFTTT Engine not available, condition registration skipped', 'warn');
                return false;
            }

            // Prefix mit Plugin-ID wenn nicht bereits vorhanden
            const conditionId = id.includes(':') ? id : `${this.pluginId}:${id}`;

            // Kategorie automatisch setzen falls nicht angegeben
            if (!config.category) {
                config.category = this.pluginId;
            }

            this.iftttEngine.conditions.register(conditionId, config);
            this.registeredIFTTTConditions.push(conditionId);
            this.log(`Registered IFTTT condition: ${conditionId}`);

            return true;
        } catch (error) {
            this.log(`Failed to register IFTTT condition: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Registriert eine IFTTT-Action für die visuelle Flow-Erstellung
     * @param {string} id - Eindeutige Action-ID (empfohlen: 'pluginId:actionname')
     * @param {Object} config - Action-Konfiguration
     */
    registerIFTTTAction(id, config) {
        try {
            if (!this.iftttEngine) {
                this.log('IFTTT Engine not available, action registration skipped', 'warn');
                return false;
            }

            // Prefix mit Plugin-ID wenn nicht bereits vorhanden
            const actionId = id.includes(':') ? id : `${this.pluginId}:${id}`;

            // Kategorie automatisch setzen falls nicht angegeben
            if (!config.category) {
                config.category = this.pluginId;
            }

            this.iftttEngine.actions.register(actionId, config);
            this.registeredIFTTTActions.push(actionId);
            this.log(`Registered IFTTT action: ${actionId}`);

            return true;
        } catch (error) {
            this.log(`Failed to register IFTTT action: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Sendet ein Socket.io-Event an alle Clients
     * @param {string} event - Event-Name
     * @param {*} data - Event-Daten
     */
    emit(event, data) {
        try {
            if (this.pluginLoader && typeof this.pluginLoader.emit === 'function') {
                this.pluginLoader.emit(event, data);
            }
            this.io.emit(event, data);
            return true;
        } catch (error) {
            this.log(`Failed to emit event: ${error.message}`, 'error');
            return false;
        }
    }

    on(event, callback) {
        try {
            if (!this.pluginLoader || typeof this.pluginLoader.on !== 'function') {
                throw new Error('plugin event bus is not available');
            }

            this.pluginLoader.on(event, callback);
            this.registeredPluginEvents.push({ event, callback });
            return true;
        } catch (error) {
            this.log(`Failed to register plugin event listener ${event}: ${error.message}`, 'error');
            return false;
        }
    }

    removeListener(event, callback) {
        if (this.pluginLoader && typeof this.pluginLoader.removeListener === 'function') {
            this.pluginLoader.removeListener(event, callback);
        }
    }

    getPlugin(pluginId) {
        return this.pluginLoader?.loadedPlugins?.get(pluginId)?.instance || null;
    }

    /**
     * Holt Plugin-Konfiguration aus der Datenbank
     * @param {string} key - Config-Key (optional)
     */
    getConfig(key = null) {
        try {
            const configKey = key ? `plugin:${this.pluginId}:${key}` : `plugin:${this.pluginId}:config`;
            const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
            const row = stmt.get(configKey);

            if (row) {
                return JSON.parse(row.value);
            }
            return null;
        } catch (error) {
            this.log(`Failed to get config: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Speichert Plugin-Konfiguration in der Datenbank
     * @param {string} key - Config-Key
     * @param {*} value - Config-Wert
     */
    setConfig(key, value) {
        try {
            const configKey = `plugin:${this.pluginId}:${key}`;
            const valueJson = JSON.stringify(value);

            const stmt = this.db.prepare(`
                INSERT INTO settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `);
            stmt.run(configKey, valueJson);

            this.log(`Config saved: ${key}`);
            return true;
        } catch (error) {
            this.log(`Failed to set config: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Loggt eine Nachricht mit Plugin-Kontext
     * @param {string} message - Log-Nachricht
     * @param {string} level - Log-Level (info, warn, error)
     */
    log(message, level = 'info') {
        const logMessage = `[Plugin:${this.pluginId}] ${message}`;

        if (this.logger && this.logger[level]) {
            this.logger[level](logMessage);
        } else {
            console.log(`[${level.toUpperCase()}] ${logMessage}`);
        }
    }

    /**
     * Gibt den absoluten Pfad zum Plugin-Verzeichnis zurück
     */
    getPluginDir() {
        return this.pluginDir;
    }

    /**
     * Gibt die öffentliche URL für eine Datei im Plugin zurück
     * @param {string} file - Dateiname
     */
    getPublicURL(file) {
        return `/plugins/${this.pluginId}/${file}`;
    }

    /**
     * Entfernt alle registrierten Routes und Events
     */
    unregisterAll() {
        // Socket-Events deregistrieren
        this.registeredSocketEvents.forEach(({ event, callback }) => {
            try {
                // Remove listener from all connected sockets
                this.io.sockets.sockets.forEach(socket => {
                    socket.removeListener(event, callback);
                });
                this.log(`Unregistered socket event: ${event}`);
            } catch (error) {
                this.log(`Failed to unregister socket event ${event}: ${error.message}`, 'error');
            }
        });

        // TikTok-Events deregistrieren
        // FIX: Remove actual event listeners from TikTok module to prevent duplicate handlers
        this.registeredTikTokEvents.forEach(({ event, callback }) => {
            try {
                if (this.tiktok) {
                    this.tiktok.removeListener(event, callback);
                    this.log(`Unregistered TikTok event: ${event}`);
                } else {
                    this.log(`Cannot unregister TikTok event ${event}: TikTok module not available`, 'warn');
                }
            } catch (error) {
                this.log(`Failed to unregister TikTok event ${event}: ${error.message}`, 'error');
            }
        });

        // WARNUNG: Express-Routes können nicht entfernt werden (Memory-Leak bei häufigem Reload)
        if (this.registeredRoutes.length > 0) {
            this.log(`⚠️ WARNING: ${this.registeredRoutes.length} Express routes cannot be unregistered (Express limitation)`, 'warn');
            this.log('Frequent plugin reloads will cause memory leak. Restart server to clean up.', 'warn');

            // Markiere Routes als "stale" für Monitoring
            this.registeredRoutes.forEach(route => {
                route.stale = true;
                route.unregisteredAt = new Date();
            });
        }

        this.registeredSocketEvents = [];
        this.registeredTikTokEvents = [];
        this.registeredPluginEvents.forEach(({ event, callback }) => {
            try {
                if (this.pluginLoader && typeof this.pluginLoader.removeListener === 'function') {
                    this.pluginLoader.removeListener(event, callback);
                    this.log(`Unregistered plugin event: ${event}`);
                }
            } catch (error) {
                this.log(`Failed to unregister plugin event ${event}: ${error.message}`, 'error');
            }
        });
        this.registeredPluginEvents = [];
        this.registeredFlowActions = [];

        // Unregister IFTTT components
        if (this.iftttEngine) {
            this.registeredIFTTTTriggers.forEach(triggerId => {
                try {
                    this.iftttEngine.triggers.unregister(triggerId);
                    this.log(`Unregistered IFTTT trigger: ${triggerId}`);
                } catch (error) {
                    this.log(`Failed to unregister IFTTT trigger ${triggerId}: ${error.message}`, 'error');
                }
            });

            this.registeredIFTTTConditions.forEach(conditionId => {
                try {
                    this.iftttEngine.conditions.unregister(conditionId);
                    this.log(`Unregistered IFTTT condition: ${conditionId}`);
                } catch (error) {
                    this.log(`Failed to unregister IFTTT condition ${conditionId}: ${error.message}`, 'error');
                }
            });

            this.registeredIFTTTActions.forEach(actionId => {
                try {
                    this.iftttEngine.actions.unregister(actionId);
                    this.log(`Unregistered IFTTT action: ${actionId}`);
                } catch (error) {
                    this.log(`Failed to unregister IFTTT action ${actionId}: ${error.message}`, 'error');
                }
            });
        }

        this.registeredIFTTTTriggers = [];
        this.registeredIFTTTConditions = [];
        this.registeredIFTTTActions = [];

        // Unregister backup provider
        if (this.backupProviderRegistered) {
            try {
                if (this.pluginLoader && typeof this.pluginLoader.unregisterBackupProvider === 'function') {
                    this.pluginLoader.unregisterBackupProvider(this.pluginId);
                    this.log('Backup provider unregistered');
                }
            } catch (error) {
                this.log(`Failed to unregister backup provider: ${error.message}`, 'error');
            }
            this.backupProviderRegistered = false;
        }

        this.log('All registrations cleared (except Express routes)');
    }

    /**
     * Gibt Zugriff auf die Datenbank (mit Vorsicht verwenden)
     */
    getDatabase() {
        return this.db;
    }

    /**
     * Gibt Zugriff auf Socket.io
     */
    getSocketIO() {
        return this.io;
    }

    /**
     * Gibt Zugriff auf Express App
     */
    getApp() {
        return this.app;
    }

    /**
     * Gibt Zugriff auf ConfigPathManager
     * Für sichere Dateioperationen in persistenten Speicherpfaden
     */
    getConfigPathManager() {
        return this.configPathManager;
    }

    /**
     * Get the BackupManager instance (if initialised).
     * Plugins may use this to trigger export/import programmatically or to
     * check whether a backup is in progress.
     *
     * @returns {import('./backup-manager')|null}
     */
    getBackupManager() {
        return this.pluginLoader ? (this.pluginLoader.backupManager || null) : null;
    }

    /**
     * Get the persistent data directory for this plugin
     * This directory is located in the user profile and survives updates
     * @returns {string} Absolute path to plugin's data directory
     */
    getPluginDataDir() {
        return this.configPathManager.getPluginDataDir(this.pluginId);
    }

    /**
     * Ensure the plugin's data directory exists
     * @returns {string} Absolute path to plugin's data directory
     */
    ensurePluginDataDir() {
        const pluginDataDir = this.getPluginDataDir();
        const fs = require('fs');
        if (!fs.existsSync(pluginDataDir)) {
            fs.mkdirSync(pluginDataDir, { recursive: true });
            this.log(`Created plugin data directory: ${pluginDataDir}`);
        }
        return pluginDataDir;
    }

    /**
     * Register a custom backup provider for this plugin.
     *
     * The provider is called by the BackupManager during export/import operations.
     * If no provider is registered, the generic fallback (reading plugin:id:* settings
     * from the database and the plugin data directory) is used automatically.
     *
     * @param {{ exportConfig?: Function, importConfig?: Function }} provider
     *   - exportConfig(): Promise<{ version?, settings?, data?, files?, warnings? }>
     *   - importConfig(payload): Promise<{ success, importedKeys?, importedFiles?, warnings? }>
     * @returns {boolean} true if registered successfully
     */
    registerBackupProvider(provider) {
        try {
            if (!provider || typeof provider !== 'object') {
                this.log('registerBackupProvider: provider must be an object', 'warn');
                return false;
            }

            const hasExport = typeof provider.exportConfig === 'function';
            const hasImport = typeof provider.importConfig === 'function';

            if (!hasExport && !hasImport) {
                this.log('registerBackupProvider: provider must implement exportConfig and/or importConfig', 'warn');
                return false;
            }

            if (this.pluginLoader && typeof this.pluginLoader.registerBackupProvider === 'function') {
                this.pluginLoader.registerBackupProvider(this.pluginId, provider);
                this.backupProviderRegistered = true;
                this.log('Backup provider registered');
                return true;
            }

            this.log('registerBackupProvider: BackupManager not available', 'warn');
            return false;
        } catch (error) {
            this.log(`Failed to register backup provider: ${error.message}`, 'error');
            return false;
        }
    }
}

/**
 * PluginLoader - Lädt und verwaltet Plugins
 */
class PluginLoader extends EventEmitter {
    constructor(pluginsDir, app, io, db, logger, configPathManager, activeProfile = null) {
        super();
        this.pluginsDir = pluginsDir;
        this.app = app;
        this.io = io;
        this.db = db;
        this.logger = logger;
        this.configPathManager = configPathManager;
        this.activeProfile = activeProfile;

        // Geladene Plugins
        this.plugins = new Map();

        // Plugin-State-Datei (profil-spezifisch, mit Fallback auf Legacy-Pfad)
        this.legacyStateFile = path.join(pluginsDir, 'plugins_state.json');
        this.stateFile = this.resolveStateFilePath();
        this.ensureStateDirectory();

        // State laden
        this.state = this.loadState();

        // TikTok module reference (set after TikTok module is initialized)
        // This allows dynamic registration of TikTok events when plugins are enabled at runtime
        this.tiktok = null;

        // IFTTT Engine reference (set after IFTTT engine is initialized)
        // This allows plugins to register triggers, conditions, and actions
        this.iftttEngine = null;

        // BackupManager reference (set after BackupManager is initialized)
        // Allows plugins to register custom backup providers
        this.backupManager = null;

        // Create a dedicated router for plugin routes
        // This router is mounted on the main app and ensures plugin routes
        // are always matched before the 404 handler, even when plugins
        // are dynamically enabled after server start
        this.pluginRouter = express.Router();
        this.app.use(this.pluginRouter);
        this.logger.info('🔌 Plugin router initialized - dynamic plugin routes will be handled correctly');
    }

    /**
     * Get the plugin router for registering routes
     * @returns {express.Router} The plugin router
     */
    getPluginRouter() {
        return this.pluginRouter;
    }

    /**
     * Set the TikTok module reference for dynamic event registration
     * This should be called after TikTok module is initialized
     * @param {TikTokConnector} tiktok - TikTok connector instance
     */
    setTikTokModule(tiktok) {
        this.tiktok = tiktok;
        this.logger.info('🎯 TikTok module reference set in PluginLoader - plugins can now register events dynamically');
    }

    /**
     * Set the IFTTT engine reference for dynamic IFTTT component registration
     * This should be called after IFTTT engine is initialized
     * @param {IFTTTEngine} iftttEngine - IFTTT engine instance
     */
    setIFTTTEngine(iftttEngine) {
        this.iftttEngine = iftttEngine;
        this.logger.info('🔀 IFTTT engine reference set in PluginLoader - plugins can now register triggers, conditions, and actions');
    }

    /**
     * Set the BackupManager reference so plugins can register custom backup providers.
     * Should be called after BackupManager is initialized.
     * @param {import('./backup-manager')} backupManager
     */
    setBackupManager(backupManager) {
        this.backupManager = backupManager;
        this.logger.info('💾 BackupManager reference set in PluginLoader - plugins can now register backup providers');
    }

    /**
     * Register a plugin's custom backup provider via the BackupManager.
     * Called by PluginAPI.registerBackupProvider() on behalf of the plugin.
     *
     * @param {string} pluginId
     * @param {{ exportConfig?: Function, importConfig?: Function }} provider
     */
    registerBackupProvider(pluginId, provider) {
        if (this.backupManager && typeof this.backupManager.registerBackupProvider === 'function') {
            this.backupManager.registerBackupProvider(pluginId, provider);
        } else {
            this.logger.warn(`[PluginLoader] Cannot register backup provider for ${pluginId}: BackupManager not set`);
        }
    }

    /**
     * Unregister a plugin's custom backup provider.
     * Called by PluginAPI.unregisterAll() on plugin unload.
     *
     * @param {string} pluginId
     */
    unregisterBackupProvider(pluginId) {
        if (this.backupManager && typeof this.backupManager.unregisterBackupProvider === 'function') {
            this.backupManager.unregisterBackupProvider(pluginId);
        }
    }

    /**
     * Get profile-safe filename segment
     */
    sanitizeProfileName(name) {
        if (!name || typeof name !== 'string') {
            return null;
        }
        const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const hasMeaningfulChars = sanitized.replace(/[_-]/g, '').length > 0;
        if (sanitized && sanitized.length > 0 && hasMeaningfulChars) {
            return sanitized;
        }
        const fallbackHash = crypto.createHash('md5').update(String(name)).digest('hex').slice(0, 8);
        return `profile_${fallbackHash}`;
    }

    /**
     * Resolves the plugin state file path (profile-scoped when available)
     */
    resolveStateFilePath() {
        try {
            const hasProfile = Boolean(this.activeProfile);
            const hasConfigDir = this.configPathManager && typeof this.configPathManager.getUserConfigsDir === 'function';

            if (hasConfigDir) {
                const baseDir = this.configPathManager.getUserConfigsDir();
                const sanitizedProfile = hasProfile ? this.sanitizeProfileName(this.activeProfile) : null;
                const profileSegment = sanitizedProfile ? `${sanitizedProfile}_` : '';
                return path.join(baseDir, `${profileSegment}plugins_state.json`);
            }
        } catch (error) {
            // Fallback to legacy path on any resolver issues
            this.logger?.warn?.(`Failed to resolve profile-scoped plugin state path, using legacy: ${error.message}`);
        }

        return this.legacyStateFile;
    }

    /**
     * Ensures the directory for the state file exists
     */
    ensureStateDirectory() {
        try {
            const dir = path.dirname(this.stateFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        } catch (error) {
            this.logger?.warn?.(`Failed to ensure plugin state directory: ${error.message}`);
        }
    }

    /**
     * Lädt den Plugin-State aus der Datei
     */
    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = fs.readFileSync(this.stateFile, 'utf8');
                return JSON.parse(data);
            }

            // Legacy fallback: migrate old global state into profile-scoped file
            if (this.stateFile !== this.legacyStateFile && !fs.existsSync(this.stateFile) && fs.existsSync(this.legacyStateFile)) {
                try {
                    const legacyRaw = fs.readFileSync(this.legacyStateFile, 'utf8');
                    const legacyData = JSON.parse(legacyRaw);

                    fs.writeFileSync(this.stateFile, JSON.stringify(legacyData, null, 2));
                    this.logger?.info?.('📦 Migrated global plugin state to profile-scoped storage');
                    return legacyData;
                } catch (legacyError) {
                    this.logger?.warn?.(`Failed to migrate legacy plugin state: ${legacyError.message}`);
                }
            }
        } catch (error) {
            this.logger?.warn?.(`Failed to load plugin state: ${error.message}`);
        }
        return {};
    }

    /**
     * Speichert den Plugin-State in die Datei
     */
    saveState() {
        try {
            this.ensureStateDirectory();
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
            return true;
        } catch (error) {
            this.logger.error(`Failed to save plugin state: ${error.message}`);
            return false;
        }
    }

    getPluginEnabledPreference(manifest) {
        const pluginState = this.state[manifest.id] || {};
        return pluginState.enabled !== undefined ? pluginState.enabled : manifest.enabled !== false;
    }

    isPluginEnabledFromDisk(pluginId) {
        try {
            const manifestPath = path.join(this.pluginsDir, pluginId, 'plugin.json');
            if (!fs.existsSync(manifestPath)) {
                return false;
            }

            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (!manifest.id || manifest.disabled === true) {
                return false;
            }

            return this.getPluginEnabledPreference(manifest);
        } catch (error) {
            this.logger?.warn?.(`Could not inspect plugin ${pluginId}: ${error.message}`);
            return false;
        }
    }

    getSupersedingPluginId(pluginId) {
        if ((pluginId === 'viewer-leaderboard' || pluginId === 'gift-milestone') &&
            this.isPluginEnabledFromDisk('milestone-leaderboard')) {
            return 'milestone-leaderboard';
        }

        return null;
    }

    pruneStalePluginState(pluginDirs) {
        const installedPluginIds = new Set();

        for (const dir of pluginDirs) {
            const manifestPath = path.join(this.pluginsDir, dir.name, 'plugin.json');
            if (!fs.existsSync(manifestPath)) {
                continue;
            }

            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                if (manifest.id) {
                    installedPluginIds.add(manifest.id);
                }
            } catch (error) {
                this.logger?.warn?.(`Could not inspect plugin state for ${dir.name}: ${error.message}`);
            }
        }

        const staleIds = Object.keys(this.state).filter(pluginId => !installedPluginIds.has(pluginId));
        if (staleIds.length === 0) {
            return;
        }

        for (const staleId of staleIds) {
            delete this.state[staleId];
        }

        if (this.saveState()) {
            this.logger.info(`Pruned stale plugin state entries: ${staleIds.join(', ')}`);
        }
    }

    /**
     * Load all plugins from the plugins directory
     * PERFORMANCE: Plugins are now loaded in parallel (max 5 simultaneously)
     */
    async loadAllPlugins() {
        try {
            // Create plugins directory if it doesn't exist
            if (!fs.existsSync(this.pluginsDir)) {
                fs.mkdirSync(this.pluginsDir, { recursive: true });
                this.logger.info(`Created plugins directory: ${this.pluginsDir}`);
            }

            const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
            const pluginDirs = entries.filter(entry => {
                if (!entry.isDirectory() || entry.name.startsWith('_')) {
                    return false;
                }

                const manifestPath = path.join(this.pluginsDir, entry.name, 'plugin.json');
                if (!fs.existsSync(manifestPath)) {
                    this.logger.debug(`Skipping non-plugin directory without manifest: ${entry.name}`);
                    return false;
                }

                return true;
            });
            this.pruneStalePluginState(pluginDirs);

            this.logger.info(`Found ${pluginDirs.length} plugin directories`);

            let successCount = 0;
            let disabledCount = 0;
            let failCount = 0;

            // PERFORMANCE OPTIMIZATION: Load plugins in parallel batches
            // Using a concurrency limit of 5 to balance speed and resource usage
            const CONCURRENCY_LIMIT = 5;
            const results = [];
            
            for (let i = 0; i < pluginDirs.length; i += CONCURRENCY_LIMIT) {
                const batch = pluginDirs.slice(i, i + CONCURRENCY_LIMIT);
                const batchPromises = batch.map(async (dir) => {
                    const pluginPath = path.join(this.pluginsDir, dir.name);
                    try {
                        const result = await this.loadPlugin(pluginPath);
                        return { result, pluginPath, dir };
                    } catch (error) {
                        this.logger.warn(`Skipping plugin ${dir.name} due to errors: ${error.message}`);
                        return { result: 'error', pluginPath, dir, error };
                    }
                });
                
                const batchResults = await Promise.allSettled(batchPromises);
                results.push(...batchResults);
            }
            
            // Process results
            for (const settledResult of results) {
                if (settledResult.status === 'rejected') {
                    // Log rejected promises for debugging
                    this.logger.error(`Plugin batch promise rejected: ${settledResult.reason?.message || 'Unknown error'}`);
                    failCount++;
                    continue;
                }
                
                const { result, pluginPath, dir } = settledResult.value;
                
                if (result === 'error') {
                    failCount++;
                } else if (result) {
                    successCount++;
                } else if (result === null) {
                    // loadPlugin returns null for disabled plugins or missing manifests
                    // Check if it was disabled (has manifest and is explicitly disabled)
                    const manifestPath = path.join(pluginPath, 'plugin.json');
                    if (fs.existsSync(manifestPath)) {
                        try {
                            const manifestData = fs.readFileSync(manifestPath, 'utf8');
                            const manifest = JSON.parse(manifestData);
                            const pluginState = this.state[manifest.id] || {};
                            const isEnabled = pluginState.enabled !== undefined ? pluginState.enabled : manifest.enabled !== false;
                            if (!isEnabled) {
                                disabledCount++;
                            } else {
                                // Has manifest but failed for other reason (missing entry, etc.)
                                failCount++;
                            }
                        } catch {
                            failCount++;
                        }
                    } else {
                        // No manifest - consider it a failure
                        failCount++;
                    }
                }
            }

            // More informative log message
            let statusMessage = `Plugin loading complete: ${successCount} loaded`;
            if (disabledCount > 0) {
                statusMessage += `, ${disabledCount} disabled`;
            }
            if (failCount > 0) {
                statusMessage += `, ${failCount} failed`;
            }
            this.logger.info(statusMessage);

            return Array.from(this.plugins.values());
        } catch (error) {
            this.logger.error(`Failed to load plugins: ${error.message}`);
            return [];
        }
    }

    /**
     * Lädt ein einzelnes Plugin
     */
    async loadPlugin(pluginPath) {
        try {
            const manifestPath = path.join(pluginPath, 'plugin.json');

            // Manifest prüfen
            if (!fs.existsSync(manifestPath)) {
                this.logger.warn(`No plugin.json found in ${pluginPath}`);
                return null;
            }

            // Manifest laden
            const manifestData = fs.readFileSync(manifestPath, 'utf8');
            const manifest = JSON.parse(manifestData);

            // Validierung
            if (!manifest.id || !manifest.name || !manifest.entry) {
                this.logger.warn(`Invalid plugin.json in ${pluginPath}: Missing required fields`);
                return null;
            }

            // Check for permanently disabled plugins
            if (manifest.disabled === true) {
                this.logger.info(`Plugin ${manifest.id} is permanently disabled, skipping`);
                return null;
            }

            // State prüfen
            const isEnabled = this.getPluginEnabledPreference(manifest);

            if (!isEnabled) {
                this.logger.info(`Plugin ${manifest.id} is disabled, skipping`);
                return null;
            }

            const supersedingPluginId = this.getSupersedingPluginId(manifest.id);
            if (supersedingPluginId) {
                this.logger.info(`Plugin ${manifest.id} is provided by ${supersedingPluginId}; disabling standalone plugin to avoid duplicate routes and registrations`);
                this.state[manifest.id] = {
                    ...(this.state[manifest.id] || {}),
                    enabled: false,
                    supersededBy: supersedingPluginId
                };
                this.saveState();
                return null;
            }

            // Entry-Datei prüfen
            assertPluginId(manifest.id);
            assertPathInside(this.pluginsDir, pluginPath, 'Plugin directory');
            const entryPath = resolvePluginEntryPath(pluginPath, manifest.entry);
            if (!fs.existsSync(entryPath)) {
                this.logger.warn(`Entry file not found: ${entryPath}`);
                return null;
            }

            // Plugin laden
            delete require.cache[require.resolve(entryPath)]; // Cache leeren für Reload
            let PluginClass;
            try {
                PluginClass = require(entryPath);
            } catch (requireError) {
                this.logger.error(`Failed to require plugin entry file ${entryPath}: ${requireError.message}`);
                this.logger.error(requireError.stack);
                throw new Error(`Plugin require failed: ${requireError.message}`);
            }

            // PluginAPI erstellen
            const pluginAPI = new PluginAPI(
                manifest.id,
                pluginPath,
                this.app,
                this.io,
                this.db,
                this.logger,
                this,
                this.configPathManager,
                this.iftttEngine,
                this.tiktok // Pass TikTok module reference for event cleanup
            );

            // Plugin instanziieren
            let pluginInstance;
            try {
                pluginInstance = new PluginClass(pluginAPI);
            } catch (constructError) {
                this.logger.error(`Plugin ${manifest.id} constructor failed: ${constructError.message}`);
                this.logger.error(constructError.stack);
                throw new Error(`Plugin construction failed: ${constructError.message}`);
            }

            // Plugin initialisieren
            if (typeof pluginInstance.init === 'function') {
                try {
                    await pluginInstance.init();
                } catch (initError) {
                    this.logger.error(`Plugin ${manifest.id} init() failed: ${initError.message}`);
                    this.logger.error(initError.stack);

                    // Plugin-Instanz verwerfen bei Init-Fehler
                    throw new Error(`Plugin initialization failed: ${initError.message}`);
                }
            }

            // Plugin speichern
            const pluginInfo = {
                id: manifest.id,
                manifest,
                instance: pluginInstance,
                api: pluginAPI,
                path: pluginPath,
                loadedAt: new Date().toISOString()
            };

            this.plugins.set(manifest.id, pluginInfo);

            // State aktualisieren
            this.state[manifest.id] = {
                enabled: true,
                loadedAt: pluginInfo.loadedAt
            };
            this.saveState();

            // Note: TikTok event registration is handled by registerPluginTikTokEvents()
            // which is called after all plugins are loaded or when a plugin is dynamically enabled.
            // This prevents duplicate event handler registration.

            this.logger.info(`Loaded plugin: ${manifest.name} (${manifest.id}) v${manifest.version}`);
            this.emit('plugin:loaded', pluginInfo);

            return pluginInfo;
        } catch (error) {
            this.logger.error(`Failed to load plugin from ${pluginPath}: ${error.message}`);
            this.logger.error(error.stack);
            return null;
        }
    }

    /**
     * Entlädt ein Plugin
     */
    async unloadPlugin(pluginId) {
        try {
            const plugin = this.plugins.get(pluginId);
            if (!plugin) {
                return false;
            }

            // Remove TikTok event listeners to prevent duplicates on reload
            if (this.tiktok && plugin.api.registeredTikTokEvents) {
                for (const { event, callback } of plugin.api.registeredTikTokEvents) {
                    this.tiktok.removeListener(event, callback);
                }
                this.logger.debug(`Removed TikTok event listeners for plugin ${pluginId}`);
            }

            // Plugin cleanup aufrufen
            if (typeof plugin.instance.destroy === 'function') {
                await plugin.instance.destroy();
            }

            // API cleanup
            plugin.api.unregisterAll();

            // Plugin entfernen
            this.plugins.delete(pluginId);

            this.logger.info(`Unloaded plugin: ${pluginId}`);
            this.emit('plugin:unloaded', pluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to unload plugin ${pluginId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Aktiviert ein Plugin
     */
    async enablePlugin(pluginId) {
        // Store original state to rollback if needed
        const originalState = this.state[pluginId] ? { ...this.state[pluginId] } : null;
        
        try {
            // Set plugin state to enabled BEFORE attempting to load
            // This ensures loadPlugin() sees it as enabled and doesn't skip it
            if (!this.state[pluginId]) {
                this.state[pluginId] = {};
            }
            this.state[pluginId].enabled = true;
            
            try {
                this.saveState();
            } catch (saveError) {
                // Rollback in-memory state if save fails
                if (originalState) {
                    this.state[pluginId] = originalState;
                } else {
                    delete this.state[pluginId];
                }
                throw new Error(`Failed to save plugin state: ${saveError.message}`);
            }

            // Wenn Plugin noch nicht geladen, jetzt laden
            if (!this.plugins.has(pluginId)) {
                const pluginPath = path.join(this.pluginsDir, pluginId);
                if (!fs.existsSync(pluginPath)) {
                    this.logger.error(`Plugin path does not exist: ${pluginPath}`);
                    throw new Error(`Plugin directory not found: ${pluginPath}`);
                }
                
                // Try to load the plugin with state already set to enabled
                const loadResult = await this.loadPlugin(pluginPath);
                if (!loadResult) {
                    const supersedingPluginId = this.state[pluginId]?.supersededBy;
                    if (supersedingPluginId) {
                        throw new Error(`Plugin ${pluginId} is already provided by ${supersedingPluginId}. Disable ${supersedingPluginId} before enabling ${pluginId}.`);
                    }

                    this.logger.error(`Plugin ${pluginId} failed to load. Check server logs for detailed error information.`);
                    throw new Error(`Plugin ${pluginId} failed to load. Please check the server logs for detailed error information about what went wrong during initialization.`);
                }
                
                this.logger.info(`Plugin ${pluginId} loaded successfully`);
                
                // Register TikTok events for the newly loaded plugin
                if (this.tiktok) {
                    this.registerPluginTikTokEvents(this.tiktok, pluginId);
                }
            }

            this.logger.info(`Enabled plugin: ${pluginId}`);
            this.emit('plugin:enabled', pluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to enable plugin ${pluginId}: ${error.message}`);
            // Reset state to disabled since enabling failed
            if (this.state[pluginId]) {
                this.state[pluginId].enabled = false;
                try {
                    this.saveState();
                } catch (saveError) {
                    this.logger.error(`Failed to save disabled state after error: ${saveError.message}`);
                }
            }
            throw error;
        }
    }

    /**
     * Deaktiviert ein Plugin
     */
    async disablePlugin(pluginId) {
        try {
            // State aktualisieren
            if (!this.state[pluginId]) {
                this.state[pluginId] = {};
            }
            this.state[pluginId].enabled = false;
            this.saveState();

            const safePluginId = assertPluginId(pluginId);

            // Plugin entladen
            await this.unloadPlugin(safePluginId);

            this.logger.info(`Disabled plugin: ${pluginId}`);
            this.emit('plugin:disabled', pluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to disable plugin ${pluginId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Lädt ein Plugin neu
     */
    async reloadPlugin(pluginId) {
        try {
            // Track Reload-Count für Memory-Leak-Warnung
            if (!this.state[pluginId]) {
                this.state[pluginId] = {};
            }
            this.state[pluginId].reloadCount = (this.state[pluginId].reloadCount || 0) + 1;
            this.state[pluginId].lastReload = new Date().toISOString();

            // Warnung bei häufigem Reload
            if (this.state[pluginId].reloadCount > 10) {
                this.logger.warn(`⚠️ Plugin ${pluginId} has been reloaded ${this.state[pluginId].reloadCount} times. Consider server restart to prevent memory leak.`);
            }

            this.saveState();

            await this.unloadPlugin(safePluginId);

            const pluginPath = assertPathInside(
                this.pluginsDir,
                path.join(this.pluginsDir, safePluginId),
                'Plugin delete path'
            );
            await this.loadPlugin(pluginPath);

            // Re-register TikTok events after reload (consistent with enablePlugin).
            // Required when registerTikTokEvent() was called before this.tiktok was set
            // (race condition on first start), or as a safety-net to ensure all queued
            // events are properly attached to the EventEmitter.
            if (this.tiktok) {
                this.registerPluginTikTokEvents(this.tiktok, pluginId);
                this.logger.debug(`Re-registered TikTok events for reloaded plugin: ${pluginId}`);
            }

            this.logger.info(`Reloaded plugin: ${pluginId} (reload count: ${this.state[pluginId].reloadCount})`);
            this.emit('plugin:reloaded', pluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to reload plugin ${pluginId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Löscht ein Plugin
     */
    async deletePlugin(pluginId) {
        try {
            const safePluginId = assertPluginId(pluginId);

            // Plugin entladen
            await this.unloadPlugin(pluginId);

            // Verzeichnis löschen
            const pluginPath = assertPathInside(
                this.pluginsDir,
                path.join(this.pluginsDir, safePluginId),
                'Plugin delete path'
            );
            if (fs.existsSync(pluginPath)) {
                fs.rmSync(pluginPath, { recursive: true, force: true });
            }

            // State löschen
            delete this.state[safePluginId];
            this.saveState();

            this.logger.info(`Deleted plugin: ${safePluginId}`);
            this.emit('plugin:deleted', safePluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to delete plugin ${pluginId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Get localized description for a plugin manifest
     * @param {Object} manifest - Plugin manifest
     * @param {string} locale - Requested locale (e.g., 'en', 'de', 'es', 'fr')
     * @returns {string} Localized description or fallback
     */
    getLocalizedDescription(manifest, locale = 'en') {
        const normalizedLocale = this.normalizeLocale(locale);

        if (manifest.descriptions && manifest.descriptions[normalizedLocale]) {
            return manifest.descriptions[normalizedLocale];
        }

        if (manifest.descriptions && manifest.descriptions.en) {
            return manifest.descriptions.en;
        }

        // Fallback to default description field
        return manifest.description || '';
    }

    normalizeLocale(locale = 'en') {
        if (typeof locale !== 'string' || locale.trim() === '') {
            return 'en';
        }

        const baseLocale = locale.trim().toLowerCase().replace('_', '-').split('-')[0];
        return ['en', 'de', 'es', 'fr'].includes(baseLocale) ? baseLocale : 'en';
    }

    /**
     * Gibt alle geladenen Plugins zurück
     * @param {string} locale - Optional locale for descriptions (default: 'en')
     */
    getAllPlugins(locale = 'en') {
        const plugins = [];

        for (const [id, plugin] of this.plugins.entries()) {
            plugins.push({
                id: plugin.manifest.id,
                name: plugin.manifest.name,
                description: this.getLocalizedDescription(plugin.manifest, locale),
                descriptions: plugin.manifest.descriptions, // Include all descriptions
                version: plugin.manifest.version,
                author: plugin.manifest.author,
                type: plugin.manifest.type,
                devStatus: plugin.manifest.devStatus, // Include development status
                enabled: true,
                loadedAt: plugin.loadedAt
            });
        }

        return plugins;
    }

    /**
     * Getter for backward compatibility - returns the plugins Map
     * Many plugins use pluginLoader.loadedPlugins to access the Map
     * @returns {Map} Map of loaded plugins
     */
    get loadedPlugins() {
        return this.plugins;
    }

    /**
     * Gibt Plugin-Info zurück
     */
    getPlugin(pluginId) {
        return this.plugins.get(pluginId);
    }

    /**
     * Gibt die Plugin-Instanz zurück (für Injektionen)
     */
    getPluginInstance(pluginId) {
        const plugin = this.plugins.get(pluginId);
        return plugin ? plugin.instance : null;
    }

    /**
     * Check if a plugin is enabled
     */
    isPluginEnabled(pluginId) {
        const state = this.state[pluginId];
        if (!state) {
            return false;
        }
        return state.enabled === true;
    }

    /**
     * Registriert Socket-Events für ein Plugin
     */
    registerPluginSocketEvents(socket) {
        for (const [id, plugin] of this.plugins.entries()) {
            for (const { event, callback } of plugin.api.registeredSocketEvents) {
                socket.on(event, (...args) => callback(socket, ...args));
            }
        }
    }

    /**
     * Registriert TikTok-Events für ein Plugin
     * @param {TikTokConnector} tiktok - TikTok connector instance
     * @param {string} pluginId - Optional: Register events for specific plugin only
     */
    registerPluginTikTokEvents(tiktok, pluginId = null) {
        // Store tiktok reference so unloadPlugin() can remove listeners later
        this.tiktok = tiktok;

        const pluginsToRegister = pluginId 
            ? [[pluginId, this.plugins.get(pluginId)]].filter(([_, p]) => p !== undefined)
            : Array.from(this.plugins.entries());

        let totalEventsRegistered = 0;
        for (const [id, plugin] of pluginsToRegister) {
            // CRITICAL FIX: Remove existing handlers before re-registering to prevent
            // duplicate event handlers when plugins are enabled/disabled/reloaded
            for (const { event, callback } of plugin.api.registeredTikTokEvents || []) {
                tiktok.removeListener(event, callback);
            }

            for (const { event, callback } of plugin.api.registeredTikTokEvents || []) {
                tiktok.on(event, callback);
                totalEventsRegistered++;
            }
        }

        if (pluginId) {
            this.logger.info(`Registered ${totalEventsRegistered} TikTok event handler(s) for plugin ${pluginId}`);
        } else {
            this.logger.info(`Registered ${totalEventsRegistered} TikTok event handler(s) across all plugins`);
        }
    }
}

module.exports = PluginLoader;
