/**
 * Multi-Cam Switcher Plugin
 * Wechselt OBS-Szenen via Gifts oder Chat-Commands
 * Unterstützt OBS-WebSocket v5, Spout-Feeds, Kamera 1-5
 */

const OBSWebSocket = require('obs-websocket-js').default;
const fs = require('fs');
const path = require('path');

class MultiCamPlugin {
    constructor(api) {
        this.api = api;
        this.obs = new OBSWebSocket();
        this.connected = false;
        this.reconnectTimeout = null;
        this.reconnectAttempt = 0;
        this.currentScene = null;
        this.scenes = [];
        this.sources = [];
        this.config = null;

        // Cooldown-Tracking
        this.userCooldowns = new Map(); // username -> timestamp
        this.lastGlobalSwitch = 0;

        // Safety-Tracking (Rapid switches)
        this.switchHistory = []; // Array von Timestamps
        this.locked = false;
        this.lockTimer = null; // Timer für Auto-Unlock

        // Gift Catalog (wird von Core geladen)
        this.giftCatalog = new Map(); // giftId -> {name, coins, ...}
        
        // Cache for gift mapping keys (optimization for debug logging)
        this._giftMappingKeysCache = null;
    }

    /**
     * Plugin-Initialisierung
     */
    async init() {
        this.api.log('Multi-Cam Plugin initializing...');

        // Config laden oder Default erstellen
        this.config = this.api.getConfig('config');
        if (!this.config) {
            this.config = this.getDefaultConfig();
            this.api.setConfig('config', this.config);
            this.api.log('Multi-Cam: Default config created');
        }

        // API-Endpunkte registrieren
        this.registerRoutes();

        // Socket.io Events registrieren
        this.registerSocketEvents();

        // TikTok-Events registrieren
        this.registerTikTokEvents();

        // GCCE Commands registrieren
        this.registerGCCECommands();

        // Gift-Catalog laden
        await this.loadGiftCatalog();

        // OBS Auto-Connect wenn konfiguriert
        if (this.config.obs.connectOnStart) {
            this.api.log('Multi-Cam: Auto-connecting to OBS...');
            await this.connectOBS();
        }

        this.api.log('Multi-Cam Plugin initialized successfully');
    }

    /**
     * Default-Konfiguration
     */
    getDefaultConfig() {
        return {
            enabled: true,
            chatCommands: {
                enabled: true,          // Use GCCE for chat commands
                requirePermission: true // Use permission system
            },
            obs: {
                host: '127.0.0.1',
                port: 4455,
                password: '',
                connectOnStart: false,
                reconnectBackoffMs: [1000, 2000, 5000, 10000]
            },
            mode: 'scene', // scene | sourceToggle | sceneCollection
            defaultScene: 'Studio',
            scenes: ['Studio', 'Cam1', 'Cam2', 'Cam3', 'Cam4', 'Cam5'],
            sources: ['SpoutCam1', 'SpoutCam2', 'SpoutCam3', 'SpoutCam4', 'SpoutCam5'],
            mapping: {
                chat: {
                    '!cam 1': { action: 'switchScene', target: 'Cam1' },
                    '!cam 2': { action: 'switchScene', target: 'Cam2' },
                    '!cam 3': { action: 'switchScene', target: 'Cam3' },
                    '!cam 4': { action: 'switchScene', target: 'Cam4' },
                    '!cam 5': { action: 'switchScene', target: 'Cam5' },
                    '!cam next': { action: 'cycleScene', list: 'scenes', direction: 'next' },
                    '!cam prev': { action: 'cycleScene', list: 'scenes', direction: 'prev' },
                    '!angle next': { action: 'cycleSource', list: 'sources', direction: 'next' },
                    '!scene studio': { action: 'switchScene', target: 'Studio' }
                },
                gifts: {
                    'Rose': { action: 'switchScene', target: 'Cam1', minCoins: 1 },
                    'TikTok': { action: 'switchScene', target: 'Cam2', minCoins: 1 },
                    'Lion': { action: 'switchScene', target: 'Cam5', minCoins: 100 }
                }
            },
            permissions: {
                modsOnlyCommands: false,
                broadcasterOnlyCommands: false,
                minAccountAgeDays: 0,
                allowedUsers: []
            },
            cooldowns: {
                perUserSeconds: 15,
                globalSeconds: 5,
                macroMaxDurationMs: 10000
            },
            filters: {
                minCoinsForGiftSwitch: 0,
                onlyDuringLive: false
            },
            safety: {
                maxRapidSwitchesPer30s: 20,
                lockOnRecording: false
            },
            ui: {
                showMiniPanel: true,
                hotButtons: [
                    { label: 'Studio', action: 'switchScene', target: 'Studio' },
                    { label: '1', action: 'switchScene', target: 'Cam1' },
                    { label: '2', action: 'switchScene', target: 'Cam2' },
                    { label: 'Next', action: 'cycleScene', list: 'scenes', direction: 'next' }
                ]
            },
            fallbackHotkeys: {
                enabled: false,
                mapping: {}
            },
            telemetry: {
                emitOverlayEvents: true
            }
        };
    }

    /**
     * Gift-Catalog laden
     */
    async loadGiftCatalog() {
        try {
            const db = this.api.getDatabase();
            const stmt = db.prepare('SELECT id, name, diamond_count FROM gift_catalog');
            const gifts = stmt.all();

            for (const gift of gifts) {
                this.giftCatalog.set(gift.id, {
                    name: gift.name,
                    coins: gift.diamond_count || 0
                });
            }

            this.api.log(`Multi-Cam: Loaded ${this.giftCatalog.size} gifts from catalog`);
        } catch (error) {
            this.api.log(`Multi-Cam: Failed to load gift catalog: ${error.message}`, 'error');
        }
    }

    /**
     * OBS-WebSocket verbinden
     */
    async connectOBS() {
        if (this.connected) {
            this.api.log('Multi-Cam: Already connected to OBS');
            return { success: true, message: 'Already connected' };
        }

        try {
            const { host, port, password } = this.config.obs;
            const address = `ws://${host}:${port}`;

            this.api.log(`Multi-Cam: Connecting to OBS at ${address}...`);

            await this.obs.connect(address, password);

            this.connected = true;
            this.reconnectAttempt = 0;

            // Event-Listener (nur einmal registrieren)
            // Entferne alte Listener vor dem Hinzufügen neuer
            this.obs.removeAllListeners('ConnectionClosed');
            this.obs.once('ConnectionClosed', () => this.handleDisconnect());

            // Szenen und Quellen laden
            await this.refreshScenes();
            await this.refreshCurrentScene();

            this.api.log('Multi-Cam: Connected to OBS successfully');
            this.broadcastState();

            return { success: true, message: 'Connected to OBS' };
        } catch (error) {
            this.api.log(`Multi-Cam: OBS connection failed: ${error.message}`, 'error');

            // Auto-Reconnect mit Backoff
            this.scheduleReconnect();

            return { success: false, error: error.message };
        }
    }

    /**
     * OBS trennen
     */
    async disconnectOBS() {
        if (!this.connected) {
            return { success: true, message: 'Not connected' };
        }

        try {
            await this.obs.disconnect();
            this.connected = false;
            this.currentScene = null;

            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }

            this.api.log('Multi-Cam: Disconnected from OBS');
            this.broadcastState();

            return { success: true, message: 'Disconnected from OBS' };
        } catch (error) {
            this.api.log(`Multi-Cam: Disconnect error: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Disconnect-Handler mit Auto-Reconnect
     */
    handleDisconnect() {
        this.connected = false;
        this.currentScene = null;
        this.api.log('Multi-Cam: OBS connection closed', 'warn');
        this.broadcastState();

        // Auto-Reconnect
        this.scheduleReconnect();
    }

    /**
     * Reconnect mit Exponential Backoff
     */
    scheduleReconnect() {
        if (this.reconnectTimeout) return;

        const backoffs = this.config.obs.reconnectBackoffMs;
        const delay = backoffs[Math.min(this.reconnectAttempt, backoffs.length - 1)];

        this.api.log(`Multi-Cam: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt + 1})...`);

        this.reconnectTimeout = setTimeout(async () => {
            this.reconnectTimeout = null;
            this.reconnectAttempt++;
            await this.connectOBS();
        }, delay);
    }

    /**
     * Szenen-Liste von OBS laden
     */
    async refreshScenes() {
        if (!this.connected) return;

        try {
            const { scenes } = await this.obs.call('GetSceneList');
            this.scenes = scenes.map(s => s.sceneName);
            this.api.log(`Multi-Cam: Loaded ${this.scenes.length} scenes from OBS`);
        } catch (error) {
            this.api.log(`Multi-Cam: Failed to get scenes: ${error.message}`, 'error');
        }
    }

    /**
     * Aktuelle Szene von OBS laden
     */
    async refreshCurrentScene() {
        if (!this.connected) return;

        try {
            const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
            this.currentScene = currentProgramSceneName;
            this.api.log(`Multi-Cam: Current scene: ${this.currentScene}`);
        } catch (error) {
            this.api.log(`Multi-Cam: Failed to get current scene: ${error.message}`, 'error');
        }
    }

    /**
     * Registriert Express-Routes
     */
    registerRoutes() {
        // UI route
        this.api.registerRoute('GET', '/multicam/ui', (req, res) => {
            res.sendFile(path.join(this.api.getPluginDir(), 'ui.html'));
        });

        // GET /api/multicam/config
        this.api.registerRoute('GET', '/api/multicam/config', async (req, res) => {
            res.json({
                success: true,
                config: this.config
            });
        });

        // POST /api/multicam/config
        this.api.registerRoute('POST', '/api/multicam/config', async (req, res) => {
            try {
                this.config = { ...this.config, ...req.body };
                this.api.setConfig('config', this.config);
                
                // Invalidate gift mapping keys cache when config changes
                this._giftMappingKeysCache = null;

                res.json({
                    success: true,
                    config: this.config
                });

                // Config-Update an Clients senden
                this.api.emit('multicam:config-update', this.config);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // POST /api/multicam/connect
        this.api.registerRoute('POST', '/api/multicam/connect', async (req, res) => {
            const result = await this.connectOBS();
            res.json(result);
        });

        // POST /api/multicam/connect-with-settings
        this.api.registerRoute('POST', '/api/multicam/connect-with-settings', async (req, res) => {
            const { host, port, password } = req.body;
            
            // Update config with new settings
            this.config.obs = {
                ...this.config.obs,
                host: host || this.config.obs?.host || '127.0.0.1',
                port: port || this.config.obs?.port || 4455,
                password: password !== undefined ? password : (this.config.obs?.password || '')
            };
            this.api.setConfig('config', this.config);

            const result = await this.connectOBS();
            res.json(result);
        });

        // POST /api/multicam/disconnect
        this.api.registerRoute('POST', '/api/multicam/disconnect', async (req, res) => {
            const result = await this.disconnectOBS();
            res.json(result);
        });

        // POST /api/multicam/action
        this.api.registerRoute('POST', '/api/multicam/action', async (req, res) => {
            const { action, args } = req.body;

            try {
                const result = await this.executeAction(action, args, 'admin');
                res.json(result);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // GET /api/multicam/state
        this.api.registerRoute('GET', '/api/multicam/state', async (req, res) => {
            res.json({
                success: true,
                state: {
                    connected: this.connected,
                    currentScene: this.currentScene,
                    scenes: this.scenes,
                    sources: this.sources,
                    locked: this.locked
                }
            });
        });

        // GET /api/multicam/gift-catalog
        this.api.registerRoute('GET', '/api/multicam/gift-catalog', async (req, res) => {
            try {
                const db = this.api.getDatabase();
                
                if (!db) {
                    throw new Error('Database not available');
                }

                const stmt = db.prepare('SELECT id, name, diamond_count as coins FROM gift_catalog ORDER BY diamond_count DESC');
                const gifts = stmt.all();

                res.json({
                    success: true,
                    gifts: gifts || []
                });
            } catch (error) {
                this.api.log(`Multi-Cam: Failed to get gift catalog: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message,
                    gifts: []
                });
            }
        });
    }

    /**
     * Registriert Socket.io Events
     */
    registerSocketEvents() {
        this.api.registerSocket('multicam:join', (socket) => {
            socket.join('multicam');
            this.api.log('Client joined multicam room');

            // Aktuellen State senden
            socket.emit('multicam_state', {
                connected: this.connected,
                currentScene: this.currentScene,
                scenes: this.scenes,
                locked: this.locked
            });
        });

        this.api.registerSocket('multicam:leave', (socket) => {
            socket.leave('multicam');
            this.api.log('Client left multicam room');
        });
    }

    /**
     * Registriert GCCE Commands
     */
    registerGCCECommands() {
        try {
            const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
            
            if (!gccePlugin?.instance) {
                this.api.log('Multi-Cam: GCCE not available, using direct chat events', 'debug');
                return;
            }

            if (!this.config.chatCommands?.enabled) {
                this.api.log('Multi-Cam: Chat commands disabled in config', 'debug');
                return;
            }

            const gcce = gccePlugin.instance;
            
            const commands = [
                {
                    name: 'cam',
                    description: 'Switch camera or cycle through cameras',
                    syntax: '/cam <1-5|next|prev>',
                    permission: 'all', // Permission check in handler
                    enabled: true,
                    minArgs: 1,
                    maxArgs: 1,
                    category: 'Camera',
                    handler: async (args, context) => await this.handleCamCommand(args, context)
                },
                {
                    name: 'angle',
                    description: 'Cycle through camera angles/sources',
                    syntax: '/angle next',
                    permission: 'all',
                    enabled: true,
                    minArgs: 1,
                    maxArgs: 1,
                    category: 'Camera',
                    handler: async (args, context) => await this.handleAngleCommand(args, context)
                },
                {
                    name: 'scene',
                    description: 'Switch to specific OBS scene',
                    syntax: '/scene <name>',
                    permission: 'moderator',
                    enabled: true,
                    minArgs: 1,
                    maxArgs: -1, // Unlimited for scene names with spaces
                    category: 'Camera',
                    handler: async (args, context) => await this.handleSceneCommand(args, context)
                }
            ];

            const result = gcce.registerCommandsForPlugin('multicam', commands);
            
            this.api.log(`Multi-Cam: Registered ${result.registered.length} GCCE commands`, 'info');
            
            if (result.failed.length > 0) {
                this.api.log(`Multi-Cam: Failed to register commands: ${result.failed.join(', ')}`, 'warn');
            }

        } catch (error) {
            this.api.log(`Multi-Cam: Error registering GCCE commands: ${error.message}`, 'error');
        }
    }

    /**
     * Handle /cam command from GCCE
     */
    async handleCamCommand(args, context) {
        try {
            if (!this.config.enabled) {
                return { success: false, error: 'Multi-Cam is disabled' };
            }

            const arg = args[0].toLowerCase();
            
            // Permission check
            if (!this.checkPermissions(context.username, context.rawData)) {
                this.api.log(`Multi-Cam: /cam denied for ${context.username} (permissions)`);
                return {
                    success: false,
                    error: 'You do not have permission to use camera commands',
                    displayOverlay: false
                };
            }

            // Cooldown check
            if (!this.checkCooldown(context.username)) {
                return {
                    success: false,
                    error: 'Please wait before switching cameras again',
                    displayOverlay: false
                };
            }

            // Safety check
            if (!this.checkSafetyLimits()) {
                return {
                    success: false,
                    error: 'Camera switching temporarily locked due to rapid changes',
                    displayOverlay: false
                };
            }

            let result;
            const camNumber = parseInt(arg);
            
            if (camNumber >= 1 && camNumber <= 5) {
                // Switch to specific camera
                const sceneName = `Cam${camNumber}`;
                result = await this.executeAction('switchScene', { target: sceneName }, context.username);
                
                if (result.success) {
                    this.updateCooldown(context.username);
                    this.recordSwitch();
                    return {
                        success: true,
                        message: `📷 Switched to Camera ${camNumber}`,
                        displayOverlay: true
                    };
                }
            } else if (arg === 'next' || arg === 'prev') {
                // Cycle camera
                result = await this.executeAction('cycleScene', { 
                    list: 'scenes', 
                    direction: arg 
                }, context.username);
                
                if (result.success) {
                    this.updateCooldown(context.username);
                    this.recordSwitch();
                    return {
                        success: true,
                        message: `📷 Switched to ${arg} camera`,
                        displayOverlay: true
                    };
                }
            } else {
                return {
                    success: false,
                    error: 'Invalid argument. Use: /cam <1-5|next|prev>',
                    displayOverlay: false
                };
            }

            return result;

        } catch (error) {
            this.api.log(`Multi-Cam: Error in /cam command: ${error.message}`, 'error');
            return {
                success: false,
                error: 'Failed to switch camera',
                displayOverlay: false
            };
        }
    }

    /**
     * Handle /angle command from GCCE
     */
    async handleAngleCommand(args, context) {
        try {
            if (!this.config.enabled) {
                return { success: false, error: 'Multi-Cam is disabled' };
            }

            const arg = args[0].toLowerCase();
            
            if (arg !== 'next') {
                return {
                    success: false,
                    error: 'Invalid argument. Use: /angle next',
                    displayOverlay: false
                };
            }

            // Permission check
            if (!this.checkPermissions(context.username, context.rawData)) {
                return {
                    success: false,
                    error: 'You do not have permission to use camera commands',
                    displayOverlay: false
                };
            }

            // Cooldown check
            if (!this.checkCooldown(context.username)) {
                return {
                    success: false,
                    error: 'Please wait before switching angles again',
                    displayOverlay: false
                };
            }

            // Safety check
            if (!this.checkSafetyLimits()) {
                return {
                    success: false,
                    error: 'Camera switching temporarily locked',
                    displayOverlay: false
                };
            }

            const result = await this.executeAction('cycleSource', {
                list: 'sources',
                direction: 'next'
            }, context.username);

            if (result.success) {
                this.updateCooldown(context.username);
                this.recordSwitch();
                return {
                    success: true,
                    message: '📐 Switched to next angle',
                    displayOverlay: true
                };
            }

            return result;

        } catch (error) {
            this.api.log(`Multi-Cam: Error in /angle command: ${error.message}`, 'error');
            return {
                success: false,
                error: 'Failed to switch angle',
                displayOverlay: false
            };
        }
    }

    /**
     * Handle /scene command from GCCE
     */
    async handleSceneCommand(args, context) {
        try {
            if (!this.config.enabled) {
                return { success: false, error: 'Multi-Cam is disabled' };
            }

            // Scene name can have spaces, so join all args
            const sceneName = args.join(' ');
            
            // Permission check (moderator only for scene switching)
            if (!this.checkPermissions(context.username, context.rawData)) {
                return {
                    success: false,
                    error: 'You do not have permission to switch scenes',
                    displayOverlay: false
                };
            }

            // Cooldown check
            if (!this.checkCooldown(context.username)) {
                return {
                    success: false,
                    error: 'Please wait before switching scenes again',
                    displayOverlay: false
                };
            }

            // Safety check
            if (!this.checkSafetyLimits()) {
                return {
                    success: false,
                    error: 'Scene switching temporarily locked',
                    displayOverlay: false
                };
            }

            const result = await this.executeAction('switchScene', {
                target: sceneName
            }, context.username);

            if (result.success) {
                this.updateCooldown(context.username);
                this.recordSwitch();
                return {
                    success: true,
                    message: `🎬 Switched to scene: ${sceneName}`,
                    displayOverlay: true
                };
            }

            return result;

        } catch (error) {
            this.api.log(`Multi-Cam: Error in /scene command: ${error.message}`, 'error');
            return {
                success: false,
                error: 'Failed to switch scene',
                displayOverlay: false
            };
        }
    }

    /**
     * Registriert TikTok-Events
     */
    registerTikTokEvents() {
        // Gift-Event (bleibt bestehen)
        this.api.registerTikTokEvent('gift', async (data) => {
            if (!this.config.enabled) return;

            // FIX: Safe field extraction to prevent undefined username when uniqueId is missing
            // Use data.coins (already calculated as diamondCount * repeatCount)
            // instead of data.diamondCount (which is just the raw diamond value per gift)
            const username = data.uniqueId || data.username;
            const giftId = data.giftId;
            const giftName = data.giftName;
            const coins = data.coins || 0;

            // Validate required fields
            if (!username) {
                this.api.log(`Multi-Cam: Gift event missing username/uniqueId`, 'warn');
                return;
            }

            if (!giftName) {
                this.api.log(`Multi-Cam: Gift event missing giftName (ID: ${giftId})`, 'warn');
                return;
            }

            this.api.log(`Multi-Cam: Gift from ${username}: ${giftName} (${coins} coins)`, 'debug');

            // Gift-Mapping prüfen
            await this.handleGift(username, giftName, coins);
        });

        // Chat-Event - NUR wenn GCCE nicht verfügbar ist (Fallback)
        const gcceAvailable = this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance;
        const chatCommandsEnabled = this.config.chatCommands?.enabled;
        
        if (!gcceAvailable || !chatCommandsEnabled) {
            this.api.log('Multi-Cam: Using direct chat event handler (GCCE not available or chat commands disabled)', 'debug');
            
            this.api.registerTikTokEvent('chat', async (data) => {
                if (!this.config.enabled) return;

                // Extract username from either uniqueId or username field
                const username = data.uniqueId || data.username;
                const comment = data.comment;

                // Prüfe ob username und comment existieren
                if (!username) {
                    this.api.log('Multi-Cam: Chat event missing username/uniqueId', 'warn');
                    return;
                }

                if (!comment || typeof comment !== 'string') {
                    return;
                }

                const message = comment.toLowerCase().trim();

                this.api.log(`Multi-Cam: Chat from ${username}: ${message}`);

                // Chat-Command prüfen
                await this.handleChatCommand(username, message, data);
            });
        } else {
            this.api.log('Multi-Cam: Using GCCE for chat commands', 'info');
        }
    }

    /**
     * Gift-Handler
     */
    async handleGift(username, giftName, coins) {
        this.api.log(`Multi-Cam: Handling gift - Name: "${giftName}", Coins: ${coins}, User: ${username}`, 'debug');

        // Prüfe Filters
        if (this.config.filters.minCoinsForGiftSwitch > 0 && coins < this.config.filters.minCoinsForGiftSwitch) {
            this.api.log(`Multi-Cam: Gift ${giftName} ignored (${coins} < ${this.config.filters.minCoinsForGiftSwitch} coins)`);
            return;
        }

        // Prüfe Mapping - log available mappings for debugging
        const mapping = this.config.mapping.gifts[giftName];
        if (!mapping) {
            // Cache the gift mapping keys string for performance
            if (!this._giftMappingKeysCache) {
                this._giftMappingKeysCache = Object.keys(this.config.mapping.gifts).join(', ');
            }
            this.api.log(`Multi-Cam: No mapping found for gift "${giftName}". Available mappings: ${this._giftMappingKeysCache}`, 'debug');
            return; // Kein Mapping für dieses Gift
        }

        this.api.log(`Multi-Cam: Gift "${giftName}" matched mapping: ${JSON.stringify(mapping)}`, 'debug');

        // minCoins prüfen
        if (mapping.minCoins && coins < mapping.minCoins) {
            this.api.log(`Multi-Cam: Gift ${giftName} ignored (${coins} < ${mapping.minCoins} minCoins)`);
            return;
        }

        // Cooldowns prüfen (Gifts können cooldowns umgehen wenn genug coins)
        const canBypassCooldown = coins >= this.config.filters.minCoinsForGiftSwitch;
        if (!canBypassCooldown && !this.checkCooldown(username)) {
            this.api.log(`Multi-Cam: Gift ${giftName} ignored (cooldown active for ${username})`);
            return;
        }

        // Safety-Check
        if (!this.checkSafetyLimits()) {
            this.api.log(`Multi-Cam: Gift ${giftName} ignored (safety limit exceeded)`, 'warn');
            return;
        }

        this.api.log(`Multi-Cam: Executing camera switch for gift "${giftName}" from ${username}`, 'info');

        // Aktion ausführen
        const result = await this.executeAction(mapping.action, mapping, username);

        if (result.success) {
            this.updateCooldown(username);
            this.recordSwitch();
            this.api.log(`Multi-Cam: Successfully switched camera for gift "${giftName}"`, 'info');
        } else {
            this.api.log(`Multi-Cam: Failed to switch camera for gift "${giftName}": ${result.error}`, 'error');
        }
    }

    /**
     * Chat-Command-Handler
     */
    async handleChatCommand(username, message, userData) {
        // Prüfe Mapping
        let command = null;
        let mapping = null;

        for (const [cmd, map] of Object.entries(this.config.mapping.chat)) {
            if (message.startsWith(cmd.toLowerCase())) {
                command = cmd;
                mapping = map;
                break;
            }
        }

        if (!mapping) {
            return; // Kein Mapping für dieses Command
        }

        // Permissions prüfen
        if (!this.checkPermissions(username, userData)) {
            this.api.log(`Multi-Cam: Command ${command} denied for ${username} (permissions)`);
            return;
        }

        // Cooldowns prüfen
        if (!this.checkCooldown(username)) {
            this.api.log(`Multi-Cam: Command ${command} ignored (cooldown active for ${username})`);
            return;
        }

        // Safety-Check
        if (!this.checkSafetyLimits()) {
            this.api.log(`Multi-Cam: Command ${command} ignored (safety limit exceeded)`, 'warn');
            return;
        }

        // Aktion ausführen
        const result = await this.executeAction(mapping.action, mapping, username);

        if (result.success) {
            this.updateCooldown(username);
            this.recordSwitch();
        }
    }

    /**
     * Permissions prüfen
     */
    checkPermissions(username, userData) {
        const { modsOnlyCommands, broadcasterOnlyCommands, allowedUsers } = this.config.permissions;

        // Broadcaster-Only
        if (broadcasterOnlyCommands) {
            // Annahme: isBroadcaster Flag in userData
            if (!userData.isBroadcaster) {
                return false;
            }
        }

        // Mods-Only
        if (modsOnlyCommands) {
            // Annahme: isModerator Flag in userData
            if (!userData.isModerator && !userData.isBroadcaster) {
                return false;
            }
        }

        // Allowed Users
        if (allowedUsers.length > 0 && !allowedUsers.includes(username)) {
            return false;
        }

        return true;
    }

    /**
     * Cooldown prüfen
     */
    checkCooldown(username) {
        const now = Date.now();

        // Global Cooldown
        const globalCooldown = this.config.cooldowns.globalSeconds * 1000;
        if (now - this.lastGlobalSwitch < globalCooldown) {
            return false;
        }

        // Per-User Cooldown
        const userCooldown = this.config.cooldowns.perUserSeconds * 1000;
        const lastUserSwitch = this.userCooldowns.get(username) || 0;
        if (now - lastUserSwitch < userCooldown) {
            return false;
        }

        return true;
    }

    /**
     * Cooldown aktualisieren
     */
    updateCooldown(username) {
        const now = Date.now();
        this.lastGlobalSwitch = now;
        this.userCooldowns.set(username, now);
    }

    /**
     * Safety-Limits prüfen
     */
    checkSafetyLimits() {
        if (this.locked) {
            return false;
        }

        const now = Date.now();
        const thirtySecondsAgo = now - 30000;

        // Alte Einträge entfernen
        this.switchHistory = this.switchHistory.filter(ts => ts > thirtySecondsAgo);

        // Limit prüfen
        if (this.switchHistory.length >= this.config.safety.maxRapidSwitchesPer30s) {
            this.api.log('Multi-Cam: Safety limit exceeded! Locking switches.', 'warn');
            this.locked = true;

            // Clear existing timer
            if (this.lockTimer) {
                clearTimeout(this.lockTimer);
            }

            // Auto-Unlock nach 60 Sekunden
            this.lockTimer = setTimeout(() => {
                this.locked = false;
                this.switchHistory = [];
                this.lockTimer = null;
                this.api.log('Multi-Cam: Safety lock released');
                this.broadcastState();
            }, 60000);

            this.broadcastState();
            return false;
        }

        return true;
    }

    /**
     * Switch aufzeichnen
     */
    recordSwitch() {
        this.switchHistory.push(Date.now());
    }

    /**
     * Aktion ausführen
     */
    async executeAction(action, args, username = 'system') {
        if (!this.connected) {
            return { success: false, error: 'OBS not connected' };
        }

        try {
            let result = null;

            switch (action) {
                case 'switchScene':
                    result = await this.switchScene(args.target);
                    break;

                case 'cycleScene':
                    result = await this.cycleScene(args.list, args.direction);
                    break;

                case 'cycleSource':
                    result = await this.cycleSource(args.list, args.direction);
                    break;

                case 'toggleSource':
                    result = await this.toggleSource(args.scene, args.source, args.visible);
                    break;

                case 'macro':
                    result = await this.executeMacro(args.steps);
                    break;

                default:
                    return { success: false, error: `Unknown action: ${action}` };
            }

            // Broadcast Switch-Event
            if (result.success && this.config.telemetry.emitOverlayEvents) {
                this.api.emit('multicam_switch', {
                    username,
                    action,
                    target: args.target || result.target,
                    timestamp: Date.now()
                });
            }

            return result;
        } catch (error) {
            this.api.log(`Multi-Cam: Action failed: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Szene wechseln
     */
    async switchScene(sceneName) {
        // Validierung: Szene existiert?
        if (!this.scenes.includes(sceneName)) {
            this.api.log(`Multi-Cam: Scene '${sceneName}' not found`, 'warn');
            return { success: false, error: `Scene '${sceneName}' not found` };
        }

        try {
            await this.obs.call('SetCurrentProgramScene', { sceneName });
            this.currentScene = sceneName;
            this.api.log(`Multi-Cam: Switched to scene '${sceneName}'`);
            this.broadcastState();

            return { success: true, target: sceneName };
        } catch (error) {
            this.api.log(`Multi-Cam: Failed to switch scene: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Szene zyklisch wechseln (next/prev)
     */
    async cycleScene(list, direction) {
        const sceneList = list === 'scenes' ? this.scenes : this.config.scenes;
        const currentIndex = sceneList.indexOf(this.currentScene);

        let nextIndex;
        if (direction === 'next') {
            nextIndex = (currentIndex + 1) % sceneList.length;
        } else {
            nextIndex = (currentIndex - 1 + sceneList.length) % sceneList.length;
        }

        const nextScene = sceneList[nextIndex];
        return await this.switchScene(nextScene);
    }

    /**
     * Source zyklisch togglen
     */
    async cycleSource(list, direction) {
        // Placeholder: Source-Cycling würde GetSceneItemList + SetSceneItemEnabled benötigen
        this.api.log('Multi-Cam: cycleSource not yet implemented', 'warn');
        return { success: false, error: 'cycleSource not implemented' };
    }

    /**
     * Source ein/ausschalten
     */
    async toggleSource(sceneName, sourceName, visible) {
        try {
            // GetSceneItemId benötigt
            const { sceneItemId } = await this.obs.call('GetSceneItemId', {
                sceneName,
                sourceName
            });

            await this.obs.call('SetSceneItemEnabled', {
                sceneName,
                sceneItemId,
                sceneItemEnabled: visible
            });

            this.api.log(`Multi-Cam: Toggled source '${sourceName}' in '${sceneName}' to ${visible}`);
            return { success: true };
        } catch (error) {
            this.api.log(`Multi-Cam: Failed to toggle source: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Macro ausführen (Multi-Step)
     */
    async executeMacro(steps) {
        const startTime = Date.now();
        const maxDuration = this.config.cooldowns.macroMaxDurationMs;

        for (const step of steps) {
            // Timeout-Check
            if (Date.now() - startTime > maxDuration) {
                this.api.log('Multi-Cam: Macro aborted (max duration exceeded)', 'warn');
                return { success: false, error: 'Macro timeout' };
            }

            if (step.action === 'waitMs') {
                await this.sleep(step.ms);
            } else {
                const result = await this.executeAction(step.action, step, 'macro');
                if (!result.success) {
                    return result; // Macro abbrechen bei Fehler
                }
            }
        }

        return { success: true, message: 'Macro completed' };
    }

    /**
     * Sleep-Helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * State an Clients broadcasten
     */
    broadcastState() {
        if (!this.config.telemetry.emitOverlayEvents) return;

        const io = this.api.getSocketIO();
        io.to('multicam').emit('multicam_state', {
            connected: this.connected,
            currentScene: this.currentScene,
            scenes: this.scenes,
            locked: this.locked,
            timestamp: Date.now()
        });
    }

    /**
     * Plugin-Cleanup
     */
    async destroy() {
        this.api.log('Multi-Cam Plugin shutting down...');

        // Unregister GCCE commands
        try {
            const gcce = this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance;
            if (gcce) {
                gcce.unregisterCommandsForPlugin('multicam');
                this.api.log('Multi-Cam: Unregistered GCCE commands', 'debug');
            }
        } catch (error) {
            this.api.log(`Multi-Cam: Error unregistering GCCE commands: ${error.message}`, 'error');
        }

        // OBS trennen
        if (this.connected) {
            await this.disconnectOBS();
        }

        // Timers clearen
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        if (this.lockTimer) {
            clearTimeout(this.lockTimer);
            this.lockTimer = null;
        }

        this.api.log('Multi-Cam Plugin destroyed');
    }
}

module.exports = MultiCamPlugin;
