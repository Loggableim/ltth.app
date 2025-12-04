const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const express = require('express');

/**
 * PluginAPI - Bereitgestellte API für Plugins
 * Ermöglicht sicheren Zugriff auf System-Funktionen
 */
class PluginAPI {
    constructor(pluginId, pluginDir, app, io, db, logger, pluginLoader, configPathManager) {
        this.pluginId = pluginId;
        this.pluginDir = pluginDir;
        this.app = app;
        this.io = io;
        this.db = db;
        this.logger = logger;
        this.pluginLoader = pluginLoader;
        this.configPathManager = configPathManager;

        // Registrierte Routes und Events für Cleanup
        this.registeredRoutes = [];
        this.registeredSocketEvents = [];
        this.registeredTikTokEvents = [];
        this.registeredFlowActions = [];
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

            this.registeredTikTokEvents.push({ event, callback: wrappedCallback });
            this.log(`Registered TikTok event: ${event}`);

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
     * Sendet ein Socket.io-Event an alle Clients
     * @param {string} event - Event-Name
     * @param {*} data - Event-Daten
     */
    emit(event, data) {
        try {
            this.io.emit(event, data);
            return true;
        } catch (error) {
            this.log(`Failed to emit event: ${error.message}`, 'error');
            return false;
        }
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
        this.registeredFlowActions = [];

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
}

/**
 * PluginLoader - Lädt und verwaltet Plugins
 */
class PluginLoader extends EventEmitter {
    constructor(pluginsDir, app, io, db, logger, configPathManager) {
        super();
        this.pluginsDir = pluginsDir;
        this.app = app;
        this.io = io;
        this.db = db;
        this.logger = logger;
        this.configPathManager = configPathManager;

        // Geladene Plugins
        this.plugins = new Map();

        // Plugin-State-Datei
        this.stateFile = path.join(pluginsDir, 'plugins_state.json');

        // State laden
        this.state = this.loadState();

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
     * Lädt den Plugin-State aus der Datei
     */
    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = fs.readFileSync(this.stateFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            this.logger.warn(`Failed to load plugin state: ${error.message}`);
        }
        return {};
    }

    /**
     * Speichert den Plugin-State in die Datei
     */
    saveState() {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
            return true;
        } catch (error) {
            this.logger.error(`Failed to save plugin state: ${error.message}`);
            return false;
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
            const pluginDirs = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('_'));

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

            // State prüfen
            const pluginState = this.state[manifest.id] || {};
            const isEnabled = pluginState.enabled !== undefined ? pluginState.enabled : manifest.enabled !== false;

            if (!isEnabled) {
                this.logger.info(`Plugin ${manifest.id} is disabled, skipping`);
                return null;
            }

            // Entry-Datei prüfen
            const entryPath = path.join(pluginPath, manifest.entry);
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
                this.configPathManager
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
        try {
            // State aktualisieren
            if (!this.state[pluginId]) {
                this.state[pluginId] = {};
            }
            this.state[pluginId].enabled = true;
            this.saveState();

            // Wenn Plugin noch nicht geladen, jetzt laden
            if (!this.plugins.has(pluginId)) {
                const pluginPath = path.join(this.pluginsDir, pluginId);
                if (fs.existsSync(pluginPath)) {
                    const loadResult = await this.loadPlugin(pluginPath);
                    if (!loadResult) {
                        this.logger.warn(`Plugin ${pluginId} state set to enabled, but failed to load. Check logs for details.`);
                        // Still return true because state is enabled - user should check plugin logs
                        // The plugin will try to load again on next server restart
                    }
                } else {
                    this.logger.error(`Plugin path does not exist: ${pluginPath}`);
                    return false;
                }
            }

            this.logger.info(`Enabled plugin: ${pluginId}`);
            this.emit('plugin:enabled', pluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to enable plugin ${pluginId}: ${error.message}`);
            return false;
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

            // Plugin entladen
            await this.unloadPlugin(pluginId);

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

            await this.unloadPlugin(pluginId);

            const pluginPath = path.join(this.pluginsDir, pluginId);
            await this.loadPlugin(pluginPath);

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
            // Plugin entladen
            await this.unloadPlugin(pluginId);

            // Verzeichnis löschen
            const pluginPath = path.join(this.pluginsDir, pluginId);
            if (fs.existsSync(pluginPath)) {
                fs.rmSync(pluginPath, { recursive: true, force: true });
            }

            // State löschen
            delete this.state[pluginId];
            this.saveState();

            this.logger.info(`Deleted plugin: ${pluginId}`);
            this.emit('plugin:deleted', pluginId);

            return true;
        } catch (error) {
            this.logger.error(`Failed to delete plugin ${pluginId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Gibt alle geladenen Plugins zurück
     */
    getAllPlugins() {
        const plugins = [];

        for (const [id, plugin] of this.plugins.entries()) {
            plugins.push({
                id: plugin.manifest.id,
                name: plugin.manifest.name,
                description: plugin.manifest.description,
                version: plugin.manifest.version,
                author: plugin.manifest.author,
                type: plugin.manifest.type,
                enabled: true,
                loadedAt: plugin.loadedAt
            });
        }

        return plugins;
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
     */
    registerPluginTikTokEvents(tiktok) {
        for (const [id, plugin] of this.plugins.entries()) {
            for (const { event, callback } of plugin.api.registeredTikTokEvents) {
                tiktok.on(event, callback);
            }
        }
    }
}

module.exports = PluginLoader;
