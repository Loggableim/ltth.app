const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { getRootLogsDir } = require('../modules/log-paths');
const { extract } = require('zip-lib');
const { PluginStore } = require('../modules/plugin-store');
const {
    buildStoreAccountResponse,
    buildStoreAuthConfig,
    buildStoreSessionCookieName,
    claimBetaLicenseForStoreAccount,
    clearStoreSessionCookie,
    createRequireStoreAuth,
    hasActiveStoreLicense,
    hasClosedBetaPluginAccess,
    hasStoreAdminAccess,
    hasSubscriberPluginAccess,
    STORE_SESSION_COOKIE,
    setStoreSessionCookie
} = require('../modules/clerk-store-auth');
const {
    assertPluginId,
    resolvePluginChildPath,
    resolvePluginEntryPath
} = require('../modules/plugin-paths');

function getRequestCookie(req, cookieName) {
    const cookie = String(req.headers?.cookie || '')
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${cookieName}=`));
    if (!cookie) return null;

    try {
        return decodeURIComponent(cookie.slice(cookieName.length + 1)) || null;
    } catch {
        return null;
    }
}

/**
 * Plugin Routes - Verwaltet Plugin-Upload, Aktivierung, Deaktivierung, etc.
 */
function setupPluginRoutes(app, pluginLoader, apiLimiter, uploadLimiter, logger, io = null, pluginLimiter = null, options = {}) {
    // Use pluginLimiter if provided, otherwise fall back to apiLimiter
    const limiter = pluginLimiter || apiLimiter;
    const env = options.env || process.env;
    const pluginStore = options.pluginStore || new PluginStore(pluginLoader, { logger });
    const profileId = options.profileId || 'default';
    const storeSessionStore = options.storeSessionStore || null;
    const storeAuthOptions = { env, logger, profileId, sessionStore: storeSessionStore };
    const storeAuth = options.storeAuth || createRequireStoreAuth(storeAuthOptions);
    const freshStoreAuth = options.freshStoreAuth || createRequireStoreAuth({
        ...storeAuthOptions,
        allowLocalSession: false
    });
    const storeAuthConfig = options.storeAuthConfig || (() => buildStoreAuthConfig(env));
    const storeAccountResponse = options.storeAccountResponse || ((req) => buildStoreAccountResponse(req, env));
    const claimBetaLicense = options.claimBetaLicense || ((req) => claimBetaLicenseForStoreAccount(req.storeAccount || {}, { env, logger }));
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

    function parseJsonText(text) {
        const value = String(text || '');
        return JSON.parse(value.charCodeAt(0) === 0xFEFF ? value.slice(1) : value);
    }

    function sendCommunitySourcesDisabled(res) {
        return res.status(410).json({
            success: false,
            code: 'COMMUNITY_SOURCES_DISABLED',
            error: 'Community plugin sources are disabled for the closed LTTH app store.'
        });
    }

    /**
     * GET /api/plugin-store/config - Public Clerk appstore configuration.
     */
    app.get('/api/plugin-store/config', limiter, (req, res) => {
        res.json({
            success: true,
            ...storeAuthConfig(),
            storeSessionCookieName: buildStoreSessionCookieName(profileId)
        });
    });

    /**
     * GET /api/plugin-store/account - Authenticated store account status.
     */
    app.get('/api/plugin-store/account', limiter, storeAuth, (req, res) => {
        res.json(storeAccountResponse(req));
    });

    /**
     * POST /api/plugin-store/session - Exchange a fresh Clerk JWT for a local 28-day profile session.
     */
    app.post('/api/plugin-store/session', limiter, freshStoreAuth, (req, res) => {
        if (!storeSessionStore) {
            return res.status(500).json({
                success: false,
                code: 'STORE_SESSION_UNAVAILABLE',
                error: 'Local plugin store session storage is unavailable.'
            });
        }

        const previousToken = getRequestCookie(req, buildStoreSessionCookieName(profileId));
        if (previousToken) {
            storeSessionStore.revoke(previousToken);
        }
        const issued = storeSessionStore.issue(req.storeAccount || {});
        setStoreSessionCookie(res, req.storeAccount || {}, {
            profileId,
            token: issued.token
        });
        clearStoreSessionCookie(res, { cookieName: STORE_SESSION_COOKIE });
        res.json(storeAccountResponse(req));
    });

    /**
     * DELETE /api/plugin-store/session - Clear the local store session cookie.
     */
    app.delete('/api/plugin-store/session', limiter, (req, res) => {
        const cookieName = buildStoreSessionCookieName(profileId);
        const token = getRequestCookie(req, cookieName);
        if (token && storeSessionStore) {
            storeSessionStore.revoke(token);
        }
        clearStoreSessionCookie(res, { profileId, clearLegacy: true });
        res.json({
            success: true
        });
    });

    /**
     * POST /api/plugin-store/license/claim - Claim the free beta license for this Clerk account.
     */
    app.post('/api/plugin-store/license/claim', limiter, storeAuth, async (req, res) => {
        try {
            const license = await claimBetaLicense(req);
            if (req.storeAccount) {
                req.storeAccount.license = license;
            }
            res.json({
                success: true,
                license
            });
        } catch (error) {
            logger.error(`Failed to claim beta store license: ${error.message}`);
            const code = error.code || 'BETA_LICENSE_CLAIM_FAILED';
            res.status(code === 'AUTH_REQUIRED' ? 401 : 503).json({
                success: false,
                code,
                error: error.message
            });
        }
    });

    /**
     * GET /api/plugin-store - List official store plugins and opt-in community plugins.
     */
    app.get('/api/plugin-store', limiter, storeAuth, async (req, res) => {
        try {
            const store = await pluginStore.listPlugins({
                locale: req.query.locale || 'en',
                forceRefresh: req.query.refresh === 'true',
                account: req.storeAccount || {}
            });

            res.json({
                success: true,
                ...store
            });
        } catch (error) {
            logger.error(`Failed to list plugin store: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/plugin-store/sources - List configured store sources.
     */
    app.get('/api/plugin-store/sources', limiter, storeAuth, (req, res) => {
        try {
            res.json({
                success: true,
                ...pluginStore.getSourceState()
            });
        } catch (error) {
            logger.error(`Failed to list plugin store sources: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/plugin-store/community/enable - Opt in to community plugin sources.
     */
    app.post('/api/plugin-store/community/enable', limiter, storeAuth, (req, res) => {
        sendCommunitySourcesDisabled(res);
    });

    /**
     * POST /api/plugin-store/sources - Add a community registry source.
     */
    app.post('/api/plugin-store/sources', limiter, storeAuth, (req, res) => {
        sendCommunitySourcesDisabled(res);
    });

    /**
     * DELETE /api/plugin-store/sources/:id - Remove a community registry source.
     */
    app.delete('/api/plugin-store/sources/:id', limiter, storeAuth, (req, res) => {
        sendCommunitySourcesDisabled(res);
    });

    /**
     * POST /api/plugin-store/:sourceId/:pluginId/install - Install from a registry source.
     */
    app.post('/api/plugin-store/:sourceId/:pluginId/install', limiter, storeAuth, async (req, res) => {
        try {
            if (!hasActiveStoreLicense(req.storeAccount)) {
                return res.status(402).json({
                    success: false,
                    code: 'BETA_LICENSE_REQUIRED',
                    licenseRequired: true,
                    error: 'Claim the free LTTH beta license before installing store plugins.'
                });
            }

            const { source, plugin: registryPlugin } = await pluginStore.findPlugin(req.params.sourceId, req.params.pluginId);
            const storePlugin = pluginStore.normalizeStorePlugin(
                registryPlugin,
                source,
                req.query.locale || 'en',
                pluginStore.getInstalledPlugins()
            );

            if (storePlugin.access?.hidden === true && !hasStoreAdminAccess(req.storeAccount)) {
                return res.status(403).json({
                    success: false,
                    code: 'ADMIN_ACCESS_REQUIRED',
                    error: 'This store plugin is only available to LTTH store administrators.'
                });
            }

            if (storePlugin.access?.type === 'admin' && !hasStoreAdminAccess(req.storeAccount)) {
                return res.status(403).json({
                    success: false,
                    code: 'ADMIN_ACCESS_REQUIRED',
                    error: 'This store plugin is only available to LTTH store administrators.'
                });
            }

            if (storePlugin.access?.type === 'subscriber' && !hasSubscriberPluginAccess(req.storeAccount)) {
                return res.status(403).json({
                    success: false,
                    code: 'SUBSCRIBER_ACCESS_REQUIRED',
                    error: 'This plugin is only available to LTTH subscribers.'
                });
            }

            if (storePlugin.access?.type === 'closed-beta' && !hasClosedBetaPluginAccess(req.storeAccount, storePlugin.id)) {
                return res.status(403).json({
                    success: false,
                    code: 'CLOSED_BETA_INVITE_REQUIRED',
                    error: 'This plugin is in closed beta and requires an invite for your LTTH account.'
                });
            }

            const plugin = await pluginStore.installPlugin(req.params.sourceId, req.params.pluginId);

            if (io) {
                io.emit('plugins:changed', { action: 'installed', pluginId: plugin.id });
            }

            res.json({
                success: true,
                message: `Plugin ${plugin.id} installed`,
                plugin
            });
        } catch (error) {
            logger.error(`Failed to install plugin from store: ${error.message}`);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/plugins - Liste aller Plugins
     * Query parameters:
     *   - locale: Language code for descriptions (en, de, es, fr) - default: en
     */
    app.get('/api/plugins', limiter, (req, res) => {
        try {
            const locale = req.query.locale || 'en';
            const pluginsDir = pluginLoader.pluginsDir;
            const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
            const allPlugins = [];
            const installedPluginIds = new Set();

            // The filesystem is the source of truth for the Plugin Manager.
            // Loaded in-memory plugins are only used to enrich existing manifests.
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('_')) {
                    const pluginPath = path.join(pluginsDir, entry.name);
                    const manifestPath = path.join(pluginPath, 'plugin.json');

                    if (fs.existsSync(manifestPath)) {
                        try {
                            const manifestData = fs.readFileSync(manifestPath, 'utf8');
                            const manifest = parseJsonText(manifestData);

                            // Skip plugins that are marked as disabled in plugin.json
                            if (manifest.disabled === true) {
                                continue;
                            }

                            if (!manifest.id || !manifest.name || !manifest.entry) {
                                logger.warn(`Skipping plugin ${entry.name} due to incomplete plugin.json`);
                                continue;
                            }

                            if (installedPluginIds.has(manifest.id)) {
                                logger.warn(`Skipping duplicate plugin id "${manifest.id}" in ${entry.name}`);
                                continue;
                            }

                            const state = pluginLoader.state[manifest.id] || {};
                            const loadedPlugin = pluginLoader.plugins.get(manifest.id);
                            const isLoadedFromThisPath = loadedPlugin && path.resolve(loadedPlugin.path) === path.resolve(pluginPath);
                            const isEnabled = isLoadedFromThisPath
                                ? true
                                : (state.enabled !== undefined ? state.enabled === true : manifest.enabled !== false);
                            const description = pluginLoader.getLocalizedDescription(manifest, locale);

                            installedPluginIds.add(manifest.id);
                            allPlugins.push({
                                id: manifest.id,
                                name: manifest.name,
                                description: description,
                                descriptions: manifest.descriptions, // Include all descriptions
                                version: manifest.version,
                                author: manifest.author,
                                type: manifest.type,
                                logo: manifest.logo || manifest.icon || null,
                                devStatus: manifest.devStatus, // Include development status
                                enabled: isEnabled,
                                loadedAt: isLoadedFromThisPath ? loadedPlugin.loadedAt : null
                            });
                        } catch (error) {
                            // Skip plugins with invalid or malformed plugin.json
                            logger.warn(`Skipping plugin ${entry.name} due to malformed plugin.json: ${error.message}`);
                        }
                    }
                }
            }

            for (const stalePluginId of pluginLoader.plugins.keys()) {
                if (!installedPluginIds.has(stalePluginId)) {
                    logger.warn(`Plugin ${stalePluginId} is loaded but no longer exists on disk; hiding from manager`);
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
     * Query parameters:
     *   - locale: Language code for descriptions (en, de, es, fr) - default: en
     */
    app.get('/api/plugins/:id', limiter, (req, res) => {
        try {
            const id = assertPluginId(req.params.id);
            const locale = req.query.locale || 'en';
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
                    description: pluginLoader.getLocalizedDescription(plugin.manifest, locale),
                    descriptions: plugin.manifest.descriptions, // Include all descriptions
                    version: plugin.manifest.version,
                    author: plugin.manifest.author,
                    type: plugin.manifest.type,
                    logo: plugin.manifest.logo || plugin.manifest.icon || null,
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
            const manifest = parseJsonText(manifestData);

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
            let safePluginId;
            let entryPath;
            try {
                safePluginId = assertPluginId(manifest.id);
                entryPath = resolvePluginEntryPath(pluginDir, manifest.entry);
            } catch (error) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                fs.unlinkSync(zipPath);

                return res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
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
            const targetDir = resolvePluginChildPath(pluginLoader.pluginsDir, safePluginId);

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
                // Register TikTok events for the newly uploaded plugin
                if (pluginLoader.tiktok) {
                    pluginLoader.registerPluginTikTokEvents(pluginLoader.tiktok, plugin.manifest.id);
                }
                
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
    app.post('/api/plugins/:id/enable', limiter, async (req, res) => {
        try {
            const { id } = req.params;
            const disabledPlugins = typeof pluginLoader.getMutuallyExclusivePluginIds === 'function'
                ? pluginLoader.getMutuallyExclusivePluginIds(id)
                    .filter(pluginId => pluginLoader.isPluginEnabledFromDisk(pluginId))
                : [];
            const success = await pluginLoader.enablePlugin(id);
            if (!success) throw new Error(`Plugin ${id} could not be enabled`);
            
            // Notify all clients that plugins have changed
            if (io) {
                disabledPlugins.forEach(pluginId => {
                    io.emit('plugins:changed', { action: 'disabled', pluginId, replacedBy: id });
                });
                io.emit('plugins:changed', { action: 'enabled', pluginId: id });
            }
            
            res.json({
                success: true,
                message: `Plugin ${id} aktiviert`,
                disabledPlugins
            });
        } catch (error) {
            logger.error(`Failed to enable plugin: ${error.message}`);
            const conflictWith = typeof error.message === 'string' && error.message.includes('stable fireworks')
                ? 'fireworks'
                : null;
            res.status(conflictWith ? 409 : 500).json({
                success: false,
                error: error.message,
                code: conflictWith ? 'PLUGIN_CONFLICT' : 'PLUGIN_ENABLE_FAILED',
                conflictWith
            });
        }
    });

    /**
     * POST /api/plugins/:id/disable - Plugin deaktivieren
     */
    app.post('/api/plugins/:id/disable', limiter, async (req, res) => {
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
    app.post('/api/plugins/:id/reload', limiter, async (req, res) => {
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
    app.post('/api/plugins/reload', limiter, async (req, res) => {
        try {
            // Alle Plugins entladen
            const pluginIds = Array.from(pluginLoader.plugins.keys());
            for (const id of pluginIds) {
                if (!await pluginLoader.unloadPlugin(id)) {
                    throw new Error(`Plugin ${id} could not be unloaded`);
                }
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
    app.delete('/api/plugins/:id', limiter, async (req, res) => {
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
    app.get('/api/plugins/:id/log', limiter, (req, res) => {
        try {
            const id = assertPluginId(req.params.id);
            const logPath = path.join(getRootLogsDir(), `${id}.log`);

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
            const status = error.message && error.message.includes('Invalid plugin id') ? 400 : 500;
            res.status(status).json({
                success: false,
                error: error.message
            });
        }
    });

    logger.info('✅ Plugin routes registered');
}

module.exports = {
    setupPluginRoutes,
    assertPluginId,
    resolvePluginChildPath
};
