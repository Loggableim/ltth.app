const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { extract } = require('zip-lib');

/**
 * Plugin Routes - Verwaltet Plugin-Upload, Aktivierung, Deaktivierung, etc.
 */
function setupPluginRoutes(app, pluginLoader, apiLimiter, uploadLimiter, logger, io = null) {
    // Multer für ZIP-Upload konfigurieren
    const pluginUploadDir = path.join(__dirname, '..', 'plugins', '_uploads');
    if (!fs.existsSync(pluginUploadDir)) {
        fs.mkdirSync(pluginUploadDir, { recursive: true });
    }

    const pluginStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, pluginUploadDir);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, 'plugin-' + uniqueSuffix + '.zip');
        }
    });

    const pluginUpload = multer({
        storage: pluginStorage,
        limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
        fileFilter: (req, file, cb) => {
            if (path.extname(file.originalname).toLowerCase() === '.zip') {
                return cb(null, true);
            } else {
                cb(new Error('Only ZIP files are allowed!'));
            }
        }
    });

    /**
     * GET /api/plugins - Liste aller Plugins
     */
    app.get('/api/plugins', apiLimiter, (req, res) => {
        try {
            const plugins = pluginLoader.getAllPlugins();

            // Zusätzlich auch disabled Plugins aus dem State laden
            const pluginsDir = pluginLoader.pluginsDir;
            const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

            const allPlugins = [];

            // Geladene Plugins hinzufügen
            for (const plugin of plugins) {
                allPlugins.push({
                    ...plugin,
                    enabled: true
                });
            }

            // Nicht geladene Plugins checken
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name !== '_uploads') {
                    const pluginPath = path.join(pluginsDir, entry.name);
                    const manifestPath = path.join(pluginPath, 'plugin.json');

                    if (fs.existsSync(manifestPath)) {
                        const manifestData = fs.readFileSync(manifestPath, 'utf8');
                        const manifest = JSON.parse(manifestData);

                        // Ist das Plugin bereits in der Liste?
                        const exists = allPlugins.find(p => p.id === manifest.id);

                        if (!exists) {
                            // Plugin ist nicht geladen - Status aus State-Datei lesen
                            const state = pluginLoader.state[manifest.id] || {};
                            allPlugins.push({
                                id: manifest.id,
                                name: manifest.name,
                                description: manifest.description,
                                version: manifest.version,
                                author: manifest.author,
                                type: manifest.type,
                                enabled: state.enabled === true,
                                loadedAt: null
                            });
                        }
                    }
                }
            }

            res.json({
                success: true,
                plugins: allPlugins
            });
        } catch (error) {
            logger.error(`Failed to get plugins: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/plugins/:id - Plugin-Details
     */
    app.get('/api/plugins/:id', apiLimiter, (req, res) => {
        try {
            const { id } = req.params;
            const plugin = pluginLoader.getPlugin(id);

            if (!plugin) {
                return res.status(404).json({
                    success: false,
                    error: 'Plugin nicht gefunden'
                });
            }

            res.json({
                success: true,
                plugin: {
                    id: plugin.manifest.id,
                    name: plugin.manifest.name,
                    description: plugin.manifest.description,
                    version: plugin.manifest.version,
                    author: plugin.manifest.author,
                    type: plugin.manifest.type,
                    dependencies: plugin.manifest.dependencies,
                    permissions: plugin.manifest.permissions,
                    enabled: true,
                    loadedAt: plugin.loadedAt,
                    routes: plugin.api.registeredRoutes,
                    socketEvents: plugin.api.registeredSocketEvents.map(e => e.event),
                    tiktokEvents: plugin.api.registeredTikTokEvents.map(e => e.event)
                }
            });
        } catch (error) {
            logger.error(`Failed to get plugin details: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/plugins/upload - Plugin hochladen (ZIP)
     */
    app.post('/api/plugins/upload', uploadLimiter, pluginUpload.single('plugin'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'Keine Datei hochgeladen'
                });
            }

            const zipPath = req.file.path;
            logger.info(`Plugin ZIP uploaded: ${zipPath}`);

            // Temporäres Verzeichnis für Extraktion
            const tempDir = path.join(pluginUploadDir, 'temp-' + Date.now());
            fs.mkdirSync(tempDir, { recursive: true });

            // ZIP entpacken
            await extract(zipPath, tempDir);
            logger.info(`Plugin ZIP extracted to: ${tempDir}`);

            // plugin.json suchen
            let manifestPath = null;
            let pluginDir = tempDir;

            // Manchmal ist die Struktur: temp/plugin-name/plugin.json
            // Manchmal: temp/plugin.json
            if (fs.existsSync(path.join(tempDir, 'plugin.json'))) {
                manifestPath = path.join(tempDir, 'plugin.json');
            } else {
                // Suche in Unterverzeichnissen
                const entries = fs.readdirSync(tempDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const possibleManifest = path.join(tempDir, entry.name, 'plugin.json');
                        if (fs.existsSync(possibleManifest)) {
                            manifestPath = possibleManifest;
                            pluginDir = path.join(tempDir, entry.name);
                            break;
                        }
                    }
                }
            }

            if (!manifestPath) {
                // Cleanup
                fs.rmSync(tempDir, { recursive: true, force: true });
                fs.unlinkSync(zipPath);

                return res.status(400).json({
                    success: false,
                    error: 'Keine plugin.json gefunden im ZIP'
                });
            }

            // Manifest validieren
            const manifestData = fs.readFileSync(manifestPath, 'utf8');
            const manifest = JSON.parse(manifestData);

            if (!manifest.id || !manifest.name || !manifest.entry) {
                // Cleanup
                fs.rmSync(tempDir, { recursive: true, force: true });
                fs.unlinkSync(zipPath);

                return res.status(400).json({
                    success: false,
                    error: 'Ungültiges plugin.json: Fehlende Pflichtfelder (id, name, entry)'
                });
            }

            // Entry-Datei prüfen
            const entryPath = path.join(pluginDir, manifest.entry);
            if (!fs.existsSync(entryPath)) {
                // Cleanup
                fs.rmSync(tempDir, { recursive: true, force: true });
                fs.unlinkSync(zipPath);

                return res.status(400).json({
                    success: false,
                    error: `Entry-Datei nicht gefunden: ${manifest.entry}`
                });
            }

            // Ziel-Verzeichnis vorbereiten
            const targetDir = path.join(pluginLoader.pluginsDir, manifest.id);

            // Falls Plugin bereits existiert, löschen
            if (fs.existsSync(targetDir)) {
                logger.warn(`Plugin ${manifest.id} already exists, replacing...`);
                await pluginLoader.unloadPlugin(manifest.id);
                fs.rmSync(targetDir, { recursive: true, force: true });
            }

            // Plugin verschieben
            fs.renameSync(pluginDir, targetDir);
            logger.info(`Plugin moved to: ${targetDir}`);

            // Cleanup
            fs.rmSync(tempDir, { recursive: true, force: true });
            fs.unlinkSync(zipPath);

            // Plugin laden
            const plugin = await pluginLoader.loadPlugin(targetDir);

            if (plugin) {
                // Notify all clients that plugins have changed
                if (io) {
                    io.emit('plugins:changed', { action: 'uploaded', pluginId: plugin.manifest.id });
                }
                
                res.json({
                    success: true,
                    message: 'Plugin erfolgreich hochgeladen und geladen',
                    plugin: {
                        id: plugin.manifest.id,
                        name: plugin.manifest.name,
                        version: plugin.manifest.version
                    }
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Plugin konnte nicht geladen werden'
                });
            }
        } catch (error) {
            logger.error(`Failed to upload plugin: ${error.message}`);
            logger.error(error.stack);

            // Cleanup bei Fehler
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/plugins/:id/enable - Plugin aktivieren
     */
    app.post('/api/plugins/:id/enable', apiLimiter, async (req, res) => {
        try {
            const { id } = req.params;
            const success = await pluginLoader.enablePlugin(id);

            if (success) {
                // Notify all clients that plugins have changed
                if (io) {
                    io.emit('plugins:changed', { action: 'enabled', pluginId: id });
                }
                
                res.json({
                    success: true,
                    message: `Plugin ${id} aktiviert`
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Plugin konnte nicht aktiviert werden'
                });
            }
        } catch (error) {
            logger.error(`Failed to enable plugin: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/plugins/:id/disable - Plugin deaktivieren
     */
    app.post('/api/plugins/:id/disable', apiLimiter, async (req, res) => {
        try {
            const { id } = req.params;
            const success = await pluginLoader.disablePlugin(id);

            if (success) {
                // Notify all clients that plugins have changed
                if (io) {
                    io.emit('plugins:changed', { action: 'disabled', pluginId: id });
                }
                
                res.json({
                    success: true,
                    message: `Plugin ${id} deaktiviert`
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Plugin konnte nicht deaktiviert werden'
                });
            }
        } catch (error) {
            logger.error(`Failed to disable plugin: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/plugins/:id/reload - Plugin neu laden
     */
    app.post('/api/plugins/:id/reload', apiLimiter, async (req, res) => {
        try {
            const { id } = req.params;
            const success = await pluginLoader.reloadPlugin(id);

            if (success) {
                // Notify all clients that plugins have changed
                if (io) {
                    io.emit('plugins:changed', { action: 'reloaded', pluginId: id });
                }
                
                res.json({
                    success: true,
                    message: `Plugin ${id} neu geladen`
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Plugin konnte nicht neu geladen werden'
                });
            }
        } catch (error) {
            logger.error(`Failed to reload plugin: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/plugins/reload - Alle Plugins neu laden
     */
    app.post('/api/plugins/reload', apiLimiter, async (req, res) => {
        try {
            // Alle Plugins entladen
            const pluginIds = Array.from(pluginLoader.plugins.keys());
            for (const id of pluginIds) {
                await pluginLoader.unloadPlugin(id);
            }

            // Alle Plugins neu laden
            await pluginLoader.loadAllPlugins();

            // Notify all clients that plugins have changed
            if (io) {
                io.emit('plugins:changed', { action: 'reloaded_all' });
            }

            res.json({
                success: true,
                message: 'Alle Plugins neu geladen'
            });
        } catch (error) {
            logger.error(`Failed to reload all plugins: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * DELETE /api/plugins/:id - Plugin löschen
     */
    app.delete('/api/plugins/:id', apiLimiter, async (req, res) => {
        try {
            const { id } = req.params;
            const success = await pluginLoader.deletePlugin(id);

            if (success) {
                // Notify all clients that plugins have changed
                if (io) {
                    io.emit('plugins:changed', { action: 'deleted', pluginId: id });
                }
                
                res.json({
                    success: true,
                    message: `Plugin ${id} gelöscht`
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Plugin konnte nicht gelöscht werden'
                });
            }
        } catch (error) {
            logger.error(`Failed to delete plugin: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/plugins/:id/log - Plugin-Log abrufen (last 100 lines)
     */
    app.get('/api/plugins/:id/log', apiLimiter, (req, res) => {
        try {
            const { id } = req.params;
            const logPath = path.join(__dirname, '..', 'logs', `${id}.log`);

            if (!fs.existsSync(logPath)) {
                return res.json({
                    success: true,
                    logs: []
                });
            }

            const logContent = fs.readFileSync(logPath, 'utf8');
            const lines = logContent.split('\n').filter(line => line.trim());
            const last100 = lines.slice(-100);

            res.json({
                success: true,
                logs: last100
            });
        } catch (error) {
            logger.error(`Failed to get plugin log: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    logger.info('✅ Plugin routes registered');
}

module.exports = { setupPluginRoutes };
