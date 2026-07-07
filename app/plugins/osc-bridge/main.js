const fs = require('fs').promises;
const path = require('path');

// Import modular components
const OSCQueryClient = require('./modules/OSCQueryClient');
const AvatarStateStore = require('./modules/AvatarStateStore');
const ExpressionController = require('./modules/ExpressionController');
const PhysBonesController = require('./modules/PhysBonesController');
const OscUdpTransport = require('./modules/OscUdpTransport');
const OscSendService = require('./modules/OscSendService');
const {
    normalizeConfig,
    validateConfig,
    deepMerge
} = require('./modules/OscBridgeConfig');

/**
 * Parameter Presets System
 * Save and load parameter configurations
 */
class ParameterPresetManager {
    constructor(api) {
        this.api = api;
        this.presets = new Map();
    }

    async loadPresets() {
        try {
            const stored = await this.api.getConfig('presets');
            if (stored && Array.isArray(stored)) {
                this.presets = new Map(stored.map(p => [p.id, p]));
            }
        } catch (error) {
            console.error('Failed to load presets:', error);
        }
    }

    async savePreset(name, parameters, description = '') {
        const id = `preset_${Date.now()}`;
        const preset = {
            id,
            name,
            description,
            parameters,
            createdAt: Date.now()
        };

        this.presets.set(id, preset);
        await this.persistPresets();
        return preset;
    }

    async deletePreset(id) {
        this.presets.delete(id);
        await this.persistPresets();
    }

    getPreset(id) {
        return this.presets.get(id);
    }

    getAllPresets() {
        return Array.from(this.presets.values());
    }

    async persistPresets() {
        const presetsArray = Array.from(this.presets.values());
        await this.api.setConfig('presets', presetsArray);
    }
}

/**
 * Token Bucket Rate Limiter
 * Limits OSC message rate to prevent overload
 */
/**
 * OSC-Bridge Plugin für VRChat-Integration
 *
 * Permanente OSC-Brücke zwischen TikTok-Events und VRChat-Avataren.
 * Unterstützt bidirektionale Kommunikation mit konfigurierbaren Parametern.
 *
 * Features:
 * - Dauerhaft aktiv (kein Auto-Shutdown)
 * - VRChat-Standard-Parameter (/avatar/parameters/*, /world/*)
 * - Sicherheit: Nur lokale IPs erlaubt
 * - Vollständiges Logging mit oscBridge.log
 * - Event-Bus-Integration für eingehende OSC-Signale
 * - Flow-System-Integration für automatische Trigger
 * - Message Batching & Queuing für bessere Performance
 * - OSCQuery Auto-Discovery
 * - Live Parameter Monitoring
 * - PhysBones Control
 * - Expression Menu Integration
 * - VRChat Chatbox Integration
 * - Parameter Presets System
 */
class OSCBridgePlugin {
    constructor(api) {
        this.api = api;
        this.logger = api.logger;

        // OSC UDP Port
        this.udpPort = null;
        this.isRunning = false;
        this.config = null;

        // Logging - use persistent storage in user profile directory when available.
        const configPathManager = typeof api.getConfigPathManager === 'function'
            ? api.getConfigPathManager()
            : null;
        const userDataDir = configPathManager && typeof configPathManager.getUserDataDir === 'function'
            ? configPathManager.getUserDataDir()
            : path.join(__dirname, 'data');
        this.logDir = path.join(userDataDir, 'logs');
        this.logFile = path.join(this.logDir, 'oscBridge.log');

        // Statistiken
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0,
            lastMessageSent: null,
            lastMessageReceived: null,
            startTime: null,
            batchedMessages: 0
        };
        this.resetTimers = new Set();

        this.transport = new OscUdpTransport({ logger: this.logger });
        this.transport.on('message', (oscMessage, timeTag, info) => {
            this.handleIncomingMessage(oscMessage, info);
        });
        this.transport.on('transport_error', (error) => {
            if (this.isRunning) {
                this.stats.errors++;
                this.api.log(`OSC-Bridge transport error: ${error.message}`, 'error');
                this.logToFile('ERROR', `${error.message}`);
                this.emitStatus();
            }
        });
        this.sendService = new OscSendService({
            getConfig: () => this.config || this.getDefaultConfig(),
            getTransport: () => this.transport,
            logger: this.logger,
            emit: (event, payload) => this.api.emit(event, payload),
            logToFile: (level, message) => this.logToFile(level, message),
            stats: this.stats
        });

        // Sicherheit: Erlaubte IP-Adressen
        this.ALLOWED_IPS = ['127.0.0.1', 'localhost', '::1', '0.0.0.0'];

        // Cooldown tracking for avatar switching
        this.avatarSwitchCooldowns = {
            perUser: new Map(), // Map<username, timestamp>
            global: null        // Global last switch timestamp
        };

        // New Performance & Feature Components
        this.presetManager = new ParameterPresetManager(api);
        this.animazingPalIntentHandler = null;
        this.animazingPalBridgeRegistered = false;

        // Modular components (initialized later)
        this.oscQueryClient = null; // OSCQueryClient instance
        this.avatarStateStore = null; // AvatarStateStore instance
        this.expressionController = null; // ExpressionController instance
        this.physBonesController = null; // PhysBonesController instance

        // Standard VRChat Parameter-Pfade
        this.VRCHAT_PARAMS = {
            WAVE: '/avatar/parameters/Wave',
            CELEBRATE: '/avatar/parameters/Celebrate',
            DANCE: '/avatar/parameters/DanceTrigger',
            EMOTE_SLOT_0: '/avatar/parameters/EmoteSlot0',
            EMOTE_SLOT_1: '/avatar/parameters/EmoteSlot1',
            EMOTE_SLOT_2: '/avatar/parameters/EmoteSlot2',
            EMOTE_SLOT_3: '/avatar/parameters/EmoteSlot3',
            EMOTE_SLOT_4: '/avatar/parameters/EmoteSlot4',
            EMOTE_SLOT_5: '/avatar/parameters/EmoteSlot5',
            EMOTE_SLOT_6: '/avatar/parameters/EmoteSlot6',
            EMOTE_SLOT_7: '/avatar/parameters/EmoteSlot7',
            HEARTS: '/avatar/parameters/Hearts',
            CONFETTI: '/avatar/parameters/Confetti',
            LIGHTS: '/world/lights/nightmode',
            VOLUME: '/world/audio/volume',
            // Chatbox parameters
            CHATBOX_INPUT: '/chatbox/input',
            CHATBOX_TYPING: '/chatbox/typing'
        };
    }

    async init() {
        try {
            // Log-Verzeichnis erstellen
            await this.initLogDir();

            // Config laden
            this.config = normalizeConfig(await this.api.getConfig('config') || this.getDefaultConfig());

            // Early-init OSCQueryClient if enabled — prevents race condition with auto-detect endpoint
            if (this.config.oscQuery?.enabled) {
                const host = this.config.oscQuery.host || '127.0.0.1';
                const port = this.config.oscQuery.port || 9001;
                this.oscQueryClient = new OSCQueryClient(host, port, this.logger);
                this.logger.info(`📡 OSCQuery client pre-initialized: ${host}:${port}`);
            }

            // Initialize modular components
            this.avatarStateStore = new AvatarStateStore(this.api);
            this.expressionController = new ExpressionController(this.api, this);
            this.physBonesController = new PhysBonesController(this.api, this, this.avatarStateStore);

            // Initialize Preset Manager
            await this.presetManager.loadPresets();

            // Start AvatarStateStore cleanup
            if (this.config.liveMonitoring?.enabled) {
                this.avatarStateStore.startCleanup();
            }

            // Start ExpressionController cleanup
            this.expressionController.startCleanup();

            // API-Routes registrieren
            this.registerRoutes();

            // Socket.IO Events registrieren
            this.registerSocketEvents();

            // TikTok Gift Event registrieren für Gift-Mappings
            this.registerTikTokGiftHandler();

            // AnimazingPal intent bridge
            this.registerAnimazingPalBridge();

            // GCCE Commands registrieren
            this.registerGCCECommands();

            // Automatisch starten wenn enabled
            if (this.config.enabled) {
                await this.start();
            }

            this.logger.info('📡 OSC-Bridge Plugin initialized with enhanced modular features');

            return true;
        } catch (error) {
            this.logger.error('OSC-Bridge Plugin init error:', error);
            return false;
        }
    }

    async initLogDir() {
        try {
            if (typeof this.api.ensurePluginDataDir === 'function') {
                const dataDir = await this.api.ensurePluginDataDir();
                this.logDir = path.join(dataDir, 'logs');
                this.logFile = path.join(this.logDir, 'oscBridge.log');
            } else if (typeof this.api.getPluginDataDir === 'function') {
                this.logDir = path.join(this.api.getPluginDataDir(), 'logs');
                this.logFile = path.join(this.logDir, 'oscBridge.log');
            }
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            this.logger.error('Failed to create OSC log directory:', error);
        }
    }

    getDefaultConfig() {
        return normalizeConfig({
            chatCommands: {
                commands: this.getDefaultCommands()
            }
        });
    }

    getDefaultCommands() {
        return [
            {
                id: 'wave',
                name: 'wave',
                enabled: true,
                description: 'Trigger wave animation in VRChat',
                syntax: '/wave',
                permission: 'all',
                category: 'VRChat',
                actionType: 'predefined',
                action: 'wave',
                params: { duration: 2000 }
            },
            {
                id: 'celebrate',
                name: 'celebrate',
                enabled: true,
                description: 'Trigger celebrate animation in VRChat',
                syntax: '/celebrate',
                permission: 'all',
                category: 'VRChat',
                actionType: 'predefined',
                action: 'celebrate',
                params: { duration: 3000 }
            },
            {
                id: 'dance',
                name: 'dance',
                enabled: true,
                description: 'Trigger dance animation in VRChat',
                syntax: '/dance',
                permission: 'subscriber',
                category: 'VRChat',
                actionType: 'predefined',
                action: 'dance',
                params: { duration: 5000 }
            },
            {
                id: 'hearts',
                name: 'hearts',
                enabled: true,
                description: 'Trigger hearts effect in VRChat',
                syntax: '/hearts',
                permission: 'all',
                category: 'VRChat',
                actionType: 'predefined',
                action: 'hearts',
                params: { duration: 2000 }
            },
            {
                id: 'confetti',
                name: 'confetti',
                enabled: true,
                description: 'Trigger confetti effect in VRChat',
                syntax: '/confetti',
                permission: 'all',
                category: 'VRChat',
                actionType: 'predefined',
                action: 'confetti',
                params: { duration: 3000 }
            },
            {
                id: 'emote',
                name: 'emote',
                enabled: true,
                description: 'Trigger VRChat emote slot',
                syntax: '/emote <0-7>',
                permission: 'subscriber',
                category: 'VRChat',
                actionType: 'predefined',
                action: 'emote',
                minArgs: 1,
                maxArgs: 1,
                params: { duration: 2000 }
            }
        ];
    }

    buildOSCQueryDiagnostics(overrides = {}) {
        const host = overrides.host || this.config?.oscQuery?.host || '127.0.0.1';
        const startPort = overrides.startPort || this.config?.oscQuery?.scanStartPort || 9001;
        const endPort = overrides.endPort || this.config?.oscQuery?.scanEndPort || 9020;

        return {
            host,
            port: overrides.port || this.config?.oscQuery?.port || 9001,
            scannedRange: `${startPort}-${endPort}`,
            summary: 'VRChat OSCQuery was not reachable on the scanned localhost TCP ports.',
            actions: [
                'Start VRChat and load into a world with an avatar.',
                'Enable OSC in VRChat via Action Menu > OSC > Enabled.',
                'Keep OSC Bridge sendHost at 127.0.0.1, sendPort at 9000, receivePort at 9001.',
                'Use OSCQuery port 9001 first; if another VRChat OSCQuery port is shown, run scan and save that port.',
                'If discovery still fails, restart VRChat after enabling OSC and check local firewall rules for localhost TCP.'
            ]
        };
    }

    registerRoutes() {
        // UI route
        this.api.registerRoute('GET', '/osc-bridge/ui', (req, res) => {
            res.sendFile(path.join(this.api.getPluginDir(), 'ui.html'));
        });

        // GET /api/osc/status - Status abrufen
        this.api.registerRoute('get', '/api/osc/status', (req, res) => {
            res.json({
                success: true,
                ...this.getStatus()
            });
        });

        // POST /api/osc/start - Bridge starten
        this.api.registerRoute('post', '/api/osc/start', async (req, res) => {
            const result = await this.start();
            res.json(result);
        });

        // POST /api/osc/stop - Bridge stoppen
        this.api.registerRoute('post', '/api/osc/stop', async (req, res) => {
            const result = await this.stop();
            res.json(result);
        });

        // POST /api/osc/send - OSC-Nachricht senden
        this.api.registerRoute('post', '/api/osc/send', (req, res) => {
            const { address, args } = req.body;

            if (!address) {
                return res.status(400).json({
                    success: false,
                    error: 'Address is required'
                });
            }

            const argsArray = Array.isArray(args) ? args : [args];
            const result = this.sendMessage(address, argsArray);

            res.json({
                ...result,
                message: result.success ? 'OSC message sent' : 'Failed to send OSC message',
                address,
                args: argsArray
            });
        });

        // POST /api/osc/test - Test-Signal senden
        this.api.registerRoute('post', '/api/osc/test', (req, res) => {
            const { address, value } = req.body;
            const result = this.test(address, value);
            res.json(result);
        });

        // GET /api/osc/config - Config abrufen
        this.api.registerRoute('get', '/api/osc/config', async (req, res) => {
            const config = normalizeConfig(await this.api.getConfig('config') || this.getDefaultConfig());
            res.json({
                success: true,
                config
            });
        });

        // POST /api/osc/config - Config aktualisieren
        this.api.registerRoute('post', '/api/osc/config', async (req, res) => {
            const newConfig = req.body;
            const result = await this.updateConfig(newConfig);
            res.json(result);
        });

        // VRChat Helper-Endpoints
        this.api.registerRoute('post', '/api/osc/vrchat/wave', (req, res) => {
            const duration = req.body.duration || 2000;
            const success = this.wave(duration);
            res.json({ success, action: 'wave', duration, error: success ? undefined : 'OSC action failed: wave' });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/celebrate', (req, res) => {
            const duration = req.body.duration || 3000;
            const success = this.celebrate(duration);
            res.json({ success, action: 'celebrate', duration, error: success ? undefined : 'OSC action failed: celebrate' });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/dance', (req, res) => {
            const duration = req.body.duration || 5000;
            const success = this.dance(duration);
            res.json({ success, action: 'dance', duration, error: success ? undefined : 'OSC action failed: dance' });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/hearts', (req, res) => {
            const duration = req.body.duration || 2000;
            const success = this.hearts(duration);
            res.json({ success, action: 'hearts', duration, error: success ? undefined : 'OSC action failed: hearts' });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/confetti', (req, res) => {
            const duration = req.body.duration || 3000;
            const success = this.confetti(duration);
            res.json({ success, action: 'confetti', duration, error: success ? undefined : 'OSC action failed: confetti' });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/emote', (req, res) => {
            const { slot, duration } = req.body;
            const success = this.triggerEmote(slot || 0, duration || 2000);
            res.json({ success, action: 'emote', slot, duration, error: success ? undefined : 'OSC action failed: emote' });
        });

        // Avatar switching
        this.api.registerRoute('post', '/api/osc/vrchat/avatar', (req, res) => {
            const { avatarId, avatarName } = req.body;
            if (!avatarId) {
                return res.status(400).json({ success: false, error: 'Avatar ID is required' });
            }
            const success = this.switchAvatar(avatarId, avatarName);
            res.json({ success, action: 'avatar_switch', avatarId, avatarName, error: success ? undefined : 'OSC action failed: avatar_switch' });
        });

        // GoGo Loco Helper Endpoints
        this.api.registerRoute('post', '/api/osc/vrchat/gogoloco/velocity', (req, res) => {
            const { velocity } = req.body;
            if (velocity === undefined || velocity < 0 || velocity > 1) {
                return res.status(400).json({ success: false, error: 'Velocity must be between 0 and 1' });
            }
            const success = this.setGoGoLocoVelocity(velocity);
            res.json({ success, action: 'gogoloco_velocity', velocity, error: success ? undefined : 'OSC action failed: gogoloco_velocity' });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/gogoloco/turn', (req, res) => {
            const { angle } = req.body;
            if (angle === undefined || angle < -1 || angle > 1) {
                return res.status(400).json({ success: false, error: 'Turn angle must be between -1 and 1' });
            }
            const success = this.setGoGoLocoTurn(angle);
            res.json({ success, action: 'gogoloco_turn', angle, error: success ? undefined : 'OSC action failed: gogoloco_turn' });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/gogoloco/grounded', (req, res) => {
            const { grounded } = req.body;
            const success = this.setGoGoLocoGrounded(grounded);
            res.json({ success, action: 'gogoloco_grounded', grounded, error: success ? undefined : 'OSC action failed: gogoloco_grounded' });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/gogoloco/fly', (req, res) => {
            const { flying } = req.body;
            const success = this.setGoGoLocoFly(flying);
            res.json({ success, action: 'gogoloco_fly', flying, error: success ? undefined : 'OSC action failed: gogoloco_fly' });
        });

        this.api.registerRoute('post', '/api/osc/vrchat/gogoloco/swim', (req, res) => {
            const { swimming } = req.body;
            const success = this.setGoGoLocoSwim(swimming);
            res.json({ success, action: 'gogoloco_swim', swimming, error: success ? undefined : 'OSC action failed: gogoloco_swim' });
        });

        // Gift Mappings Management
        this.api.registerRoute('get', '/api/osc/gift-mappings', async (req, res) => {
            const config = normalizeConfig(await this.api.getConfig('config') || this.getDefaultConfig());
            res.json({
                success: true,
                mappings: config.giftMappings || []
            });
        });

        this.api.registerRoute('post', '/api/osc/gift-mappings', async (req, res) => {
            const { mappings } = req.body;

            if (!Array.isArray(mappings)) {
                return res.status(400).json({ success: false, error: 'Mappings must be an array' });
            }

            this.config.giftMappings = mappings;
            await this.api.setConfig('config', this.config);

            this.logger.info(`✅ Updated ${mappings.length} gift mappings`);
            res.json({ success: true, mappings });
        });

        // Avatar Management
        this.api.registerRoute('get', '/api/osc/avatars', async (req, res) => {
            const config = normalizeConfig(await this.api.getConfig('config') || this.getDefaultConfig());
            res.json({
                success: true,
                avatars: config.avatars || []
            });
        });

        this.api.registerRoute('post', '/api/osc/avatars', async (req, res) => {
            const { avatars } = req.body;

            if (!Array.isArray(avatars)) {
                return res.status(400).json({ success: false, error: 'Avatars must be an array' });
            }

            this.config.avatars = avatars;
            await this.api.setConfig('config', this.config);

            this.logger.info(`✅ Updated ${avatars.length} avatars`);
            res.json({ success: true, avatars });
        });

        // Chat Command Management
        this.api.registerRoute('get', '/api/osc/commands', async (req, res) => {
            const config = normalizeConfig(await this.api.getConfig('config') || this.getDefaultConfig());
            res.json({
                success: true,
                commands: config.chatCommands?.commands || this.getDefaultCommands()
            });
        });

        this.api.registerRoute('post', '/api/osc/commands', async (req, res) => {
            const { commands } = req.body;

            if (!Array.isArray(commands)) {
                return res.status(400).json({ success: false, error: 'Commands must be an array' });
            }

            if (!this.config.chatCommands) {
                this.config.chatCommands = this.getDefaultConfig().chatCommands;
            }

            this.config.chatCommands.commands = commands;
            await this.api.setConfig('config', this.config);

            // Re-register GCCE commands with updated config
            this.unregisterGCCECommands();
            this.registerGCCECommands();

            this.logger.info(`✅ Updated ${commands.length} chat commands`);
            res.json({ success: true, commands });
        });

        // OSCQuery Discovery Endpoints
        this.api.registerRoute('post', '/api/osc/oscquery/discover', async (req, res) => {
            try {
                if (!this.oscQueryClient) {
                    const host = this.config.oscQuery?.host || '127.0.0.1';
                    const port = this.config.oscQuery?.port || 9001;
                    this.oscQueryClient = new OSCQueryClient(host, port, this.logger);
                }
                const result = await this.oscQueryClient.discover();
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    diagnostics: this.buildOSCQueryDiagnostics()
                });
            }
        });

        this.api.registerRoute('post', '/api/osc/oscquery/scan-port', async (req, res) => {
            try {
                const { startPort, endPort, timeout, autoSave = true } = req.body || {};
                const host = this.config.oscQuery?.host || '127.0.0.1';

                // Validate optional numeric params
                const isValidPort = (v) => Number.isInteger(v) && v >= 1 && v <= 65535;
                const isValidTimeout = (v) => Number.isInteger(v) && v >= 50 && v <= 30000;

                if (startPort !== undefined && !isValidPort(startPort)) {
                    return res.status(400).json({ success: false, error: 'Invalid startPort: must be an integer between 1 and 65535' });
                }
                if (endPort !== undefined && !isValidPort(endPort)) {
                    return res.status(400).json({ success: false, error: 'Invalid endPort: must be an integer between 1 and 65535' });
                }
                if (startPort !== undefined && endPort !== undefined && startPort > endPort) {
                    return res.status(400).json({ success: false, error: 'Invalid port range: startPort must be <= endPort' });
                }
                if (timeout !== undefined && !isValidTimeout(timeout)) {
                    return res.status(400).json({ success: false, error: 'Invalid timeout: must be an integer between 50 and 30000 ms' });
                }

                const scanOptions = {};
                if (startPort !== undefined) scanOptions.startPort = startPort;
                if (endPort !== undefined) scanOptions.endPort = endPort;
                if (timeout !== undefined) scanOptions.timeout = timeout;

                const scanResult = await OSCQueryClient.scanForVRChatOSCQuery(host, scanOptions, this.logger);

                if (scanResult.found) {
                    // Destroy old client if exists to avoid lingering reconnect timers
                    if (this.oscQueryClient) {
                        this.oscQueryClient.destroy();
                    }
                    this.oscQueryClient = new OSCQueryClient(host, scanResult.port, this.logger);

                    let autoSaved = false;
                    if (autoSave) {
                        if (!this.config.oscQuery) this.config.oscQuery = {};
                        this.config.oscQuery.port = scanResult.port;
                        this.config.oscQuery.enabled = true;
                        await this.api.setConfig('config', this.config);
                        autoSaved = true;
                    }

                    return res.json({
                        success: true,
                        port: scanResult.port,
                        hostInfo: scanResult.hostInfo,
                        candidates: scanResult.candidates,
                        autoSaved
                    });
                }

                return res.json({
                    success: false,
                    error: 'No VRChat OSCQuery server found',
                    scannedPorts: scanResult.scannedPorts,
                    candidates: scanResult.candidates,
                    diagnostics: this.buildOSCQueryDiagnostics({
                        host,
                        startPort: scanOptions.startPort || 9001,
                        endPort: scanOptions.endPort || 9020
                    })
                });
            } catch (error) {
                this.logger.error('OSCQuery port scan error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    diagnostics: this.buildOSCQueryDiagnostics()
                });
            }
        });

        this.api.registerRoute('post', '/api/osc/oscquery/subscribe', (req, res) => {
            try {
                if (!this.oscQueryClient) {
                    const host = this.config.oscQuery?.host || '127.0.0.1';
                    const port = this.config.oscQuery?.port || 9001;
                    this.oscQueryClient = new OSCQueryClient(host, port, this.logger);
                }
                const success = this.oscQueryClient.subscribe((update) => {
                    this.api.emit('osc:oscquery-update', update);
                });
                res.json({ success });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Live Monitoring Endpoints
        this.api.registerRoute('get', '/api/osc/monitor/state', (req, res) => {
            const state = this.avatarStateStore ? this.avatarStateStore.getState() : { parameters: [], physbones: [] };
            res.json({ success: true, state });
        });

        this.api.registerRoute('get', '/api/osc/monitor/history/:address', (req, res) => {
            const { address } = req.params;
            const history = this.avatarStateStore ? this.avatarStateStore.getHistory(decodeURIComponent(address)) : [];
            res.json({ success: true, history });
        });

        // Parameter Presets Endpoints
        this.api.registerRoute('get', '/api/osc/presets', (req, res) => {
            const presets = this.presetManager.getAllPresets();
            res.json({ success: true, presets });
        });

        this.api.registerRoute('post', '/api/osc/presets', async (req, res) => {
            const { name, parameters, description } = req.body;
            if (!name || !parameters) {
                return res.status(400).json({ success: false, error: 'Name and parameters required' });
            }
            const preset = await this.presetManager.savePreset(name, parameters, description);
            res.json({ success: true, preset });
        });

        this.api.registerRoute('delete', '/api/osc/presets/:id', async (req, res) => {
            await this.presetManager.deletePreset(req.params.id);
            res.json({ success: true });
        });

        this.api.registerRoute('post', '/api/osc/presets/:id/apply', async (req, res) => {
            const preset = this.presetManager.getPreset(req.params.id);
            if (!preset) {
                return res.status(404).json({ success: false, error: 'Preset not found' });
            }
            // Apply all parameters from preset
            for (const [address, value] of Object.entries(preset.parameters)) {
                this.send(address, value);
                await new Promise(resolve => setTimeout(resolve, 10)); // Small delay between sends
            }
            res.json({ success: true, applied: Object.keys(preset.parameters).length });
        });

        // PhysBones Control Endpoints
        this.api.registerRoute('post', '/api/osc/physbones/trigger', (req, res) => {
            const { boneName, animation, params } = req.body;
            if (!boneName) {
                return res.status(400).json({ success: false, error: 'Bone name required' });
            }
            this.triggerPhysBoneAnimation(boneName, animation, params);
            res.json({ success: true, boneName, animation });
        });

        // Chatbox Endpoints
        this.api.registerRoute('post', '/api/osc/chatbox/send', (req, res) => {
            const { message, showTyping } = req.body;
            if (!message) {
                return res.status(400).json({ success: false, error: 'Message required' });
            }
            this.sendToChatbox(message, showTyping !== false);
            res.json({ success: true });
        });

        // Expression Menu Endpoints
        this.api.registerRoute('post', '/api/osc/expressions/trigger', (req, res) => {
            const { type, slot, hold } = req.body;
            if (slot === undefined) {
                return res.status(400).json({ success: false, error: 'Slot required' });
            }
            const expressionType = type || 'Emote';
            if (this.expressionController) {
                this.expressionController.triggerExpression(expressionType, slot, hold);
            } else {
                this.triggerExpression(slot, hold);
            }
            res.json({ success: true, type: expressionType, slot, hold });
        });

        this.api.registerRoute('post', '/api/osc/expressions/combo', async (req, res) => {
            const { combo } = req.body;
            if (!combo || !Array.isArray(combo)) {
                return res.status(400).json({ success: false, error: 'Combo array required' });
            }
            const success = await this.playExpressionCombo(combo);
            res.json({ success, steps: combo.length });
        });

        this.api.registerRoute('post', '/api/osc/expressions/queue', (req, res) => {
            const { combo } = req.body;
            if (!combo || !Array.isArray(combo)) {
                return res.status(400).json({ success: false, error: 'Combo array required' });
            }
            if (this.expressionController) {
                this.expressionController.queueCombo(combo);
                res.json({ success: true, queueLength: this.expressionController.comboQueue.length });
            } else {
                res.status(501).json({ success: false, error: 'ExpressionController not initialized' });
            }
        });

        this.api.registerRoute('post', '/api/osc/expressions/stop', (req, res) => {
            if (this.expressionController) {
                this.expressionController.stopCombo();
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'ExpressionController not initialized' });
            }
        });

        this.api.registerRoute('get', '/api/osc/expressions/state', (req, res) => {
            if (this.expressionController) {
                res.json({ success: true, state: this.expressionController.getState() });
            } else {
                res.json({ success: false, state: null });
            }
        });

        // PhysBones Enhanced Endpoints
        this.api.registerRoute('get', '/api/osc/physbones/discovered', (req, res) => {
            if (this.physBonesController) {
                res.json({ success: true, bones: this.physBonesController.getDiscoveredBones() });
            } else {
                res.json({ success: true, bones: [] });
            }
        });

        this.api.registerRoute('post', '/api/osc/physbones/discover', async (req, res) => {
            if (!this.oscQueryClient) {
                return res.status(400).json({ success: false, error: 'OSCQuery not configured' });
            }
            if (this.physBonesController) {
                const result = await this.physBonesController.autoDiscover(this.oscQueryClient);
                res.json(result);
            } else {
                res.status(501).json({ success: false, error: 'PhysBonesController not initialized' });
            }
        });

        this.api.registerRoute('post', '/api/osc/physbones/stop', (req, res) => {
            const { boneName } = req.body;
            if (this.physBonesController) {
                if (boneName) {
                    const count = this.physBonesController.stopAnimation(boneName);
                    res.json({ success: true, stopped: count });
                } else {
                    const count = this.physBonesController.stopAllAnimations();
                    res.json({ success: true, stopped: count });
                }
            } else {
                res.json({ success: false, error: 'PhysBonesController not initialized' });
            }
        });

        this.api.registerRoute('get', '/api/osc/physbones/animations', (req, res) => {
            if (this.physBonesController) {
                res.json({ success: true, animations: this.physBonesController.getActiveAnimations() });
            } else {
                res.json({ success: true, animations: [] });
            }
        });

        // Avatar State Store Endpoints
        this.api.registerRoute('get', '/api/osc/avatar/state', (req, res) => {
            if (this.avatarStateStore) {
                res.json({ success: true, state: this.avatarStateStore.getState() });
            } else {
                res.json({ success: false, state: null });
            }
        });

        this.api.registerRoute('get', '/api/osc/avatar/parameters/tree', (req, res) => {
            if (this.oscQueryClient) {
                res.json({ success: true, tree: this.oscQueryClient.getParameterTree() });
            } else {
                res.json({ success: false, tree: {} });
            }
        });

        // OSCQuery Enhanced Endpoints
        this.api.registerRoute('get', '/api/osc/oscquery/status', (req, res) => {
            if (this.oscQueryClient) {
                res.json({ success: true, status: this.oscQueryClient.getStatus() });
            } else {
                res.json({ success: false, status: null });
            }
        });

        this.api.registerRoute('get', '/api/osc/oscquery/parameters', (req, res) => {
            const { pattern } = req.query;
            if (this.oscQueryClient) {
                const params = pattern
                    ? this.oscQueryClient.getParametersByPattern(pattern)
                    : this.oscQueryClient.getAllParameters();
                res.json({ success: true, parameters: params });
            } else {
                res.json({ success: false, parameters: [] });
            }
        });

        // Current Avatar Detection Endpoints
        this.api.registerRoute('get', '/api/osc/avatar/current', async (req, res) => {
            try {
                if (!this.oscQueryClient) {
                    return res.json({ success: false, error: 'OSCQuery not initialized' });
                }

                // Try to get current avatar ID from /avatar/change parameter
                const avatarChangeParam = await this.getCurrentAvatarId();

                if (avatarChangeParam) {
                    res.json({
                        success: true,
                        avatarId: avatarChangeParam,
                        timestamp: Date.now()
                    });
                } else {
                    res.json({
                        success: false,
                        error: 'No avatar detected. Make sure VRChat is running and OSCQuery is enabled.'
                    });
                }
            } catch (error) {
                this.logger.error('Error getting current avatar:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('get', '/api/osc/avatar/available-actions', async (req, res) => {
            try {
                if (!this.oscQueryClient) {
                    return res.json({ success: false, error: 'OSCQuery not initialized', actions: [] });
                }

                const availableActions = this.getAvailableActions();

                res.json({
                    success: true,
                    actions: availableActions,
                    timestamp: Date.now()
                });
            } catch (error) {
                this.logger.error('Error getting available actions:', error);
                res.status(500).json({ success: false, error: error.message, actions: [] });
            }
        });

        this.api.registerRoute('post', '/api/osc/avatar/auto-detect', async (req, res) => {
            try {
                // On-demand client init if oscQuery is enabled but client not yet created (race condition fallback)
                if (!this.oscQueryClient && this.config.oscQuery?.enabled) {
                    const host = this.config.oscQuery.host || '127.0.0.1';
                    const port = this.config.oscQuery.port || 9001;
                    this.oscQueryClient = new OSCQueryClient(host, port, this.logger);
                    this.logger.info('📡 OSCQuery client on-demand initialized for auto-detect');
                }

                if (!this.oscQueryClient) {
                    // Try auto-scan first (quick, port range 9000-9020)
                    const scanResult = await OSCQueryClient.scanForVRChatOSCQuery(
                        this.config.oscQuery?.host || '127.0.0.1',
                        { startPort: 9000, endPort: 9020, timeout: 400 },
                        this.logger
                    );
                    if (scanResult.found) {
                        this.oscQueryClient = new OSCQueryClient(
                            this.config.oscQuery?.host || '127.0.0.1',
                            scanResult.port,
                            this.logger
                        );
                        // Auto-save discovered port
                        if (!this.config.oscQuery) this.config.oscQuery = {};
                        this.config.oscQuery.port = scanResult.port;
                        this.config.oscQuery.enabled = true;
                        await this.api.setConfig('config', this.config);
                        this.logger.info(`📡 Auto-scan found VRChat OSCQuery on port ${scanResult.port}`);
                    }
                }

                if (!this.oscQueryClient) {
                    const diagnostics = this.buildOSCQueryDiagnostics({
                        host: this.config.oscQuery?.host || '127.0.0.1',
                        startPort: 9000,
                        endPort: 9020
                    });
                    return res.status(400).json({
                        success: false,
                        error: 'OSCQuery not configured and auto-scan found no VRChat OSCQuery server.',
                        diagnostics
                    });
                }

                // Trigger discovery
                await this.autoDiscoverOSCQuery();

                // Give VRChat a moment to populate the avatar parameter after discovery
                // Then retry up to 3 times with 1 second delays if not found
                this.logger.info('Waiting for avatar parameter to be available...');
                await new Promise(resolve => setTimeout(resolve, 500));

                // Get current avatar with retry logic (3 retries, 1 second delay each)
                const avatarId = await this.getCurrentAvatarId({ retries: 3, retryDelay: 1000 });

                if (!avatarId) {
                    return res.json({
                        success: false,
                        error: 'No avatar detected. Make sure VRChat is running and you are in-game with an avatar.',
                        diagnostics: this.buildOSCQueryDiagnostics()
                    });
                }

                // Get available actions
                const availableActions = this.getAvailableActions();

                // Check if avatar already exists in config
                const existingAvatar = this.config.avatars?.find(a => a.avatarId === avatarId);

                if (!existingAvatar) {
                    // Auto-add avatar to list with timestamp as name
                    const newAvatar = {
                        id: `avatar_${Date.now()}`,
                        name: `Auto-detected Avatar ${new Date().toLocaleString()}`,
                        avatarId: avatarId,
                        description: `Auto-detected on ${new Date().toLocaleString()}`,
                        availableActions: availableActions,
                        detectedAt: Date.now()
                    };

                    if (!this.config.avatars) {
                        this.config.avatars = [];
                    }

                    this.config.avatars.push(newAvatar);
                    await this.api.setConfig('config', this.config);

                    this.logger.info(`✅ Auto-detected and added new avatar: ${avatarId}`);
                }

                res.json({
                    success: true,
                    avatarId: avatarId,
                    availableActions: availableActions,
                    isNew: !existingAvatar,
                    parameterCount: this.oscQueryClient.parameters.size
                });

            } catch (error) {
                this.logger.error('Auto-detect avatar failed:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Feature #11: Health Check Endpoint
        this.api.registerRoute('get', '/api/osc/health', (req, res) => {
            const running = this.isRunning && this.transport?.state === 'running';
            const uptime = running && this.stats.startTime ? Date.now() - this.stats.startTime : 0;
            const messageRate = running && uptime > 0 ? (this.stats.messagesSent / (uptime / 1000)) : 0;
            const memUsage = process.memoryUsage();
            const configValidation = validateConfig(normalizeConfig(this.config || this.getDefaultConfig()));

            res.json({
                success: true,
                status: running ? 'healthy' : 'stopped',
                state: this.transport?.state || (running ? 'running' : 'stopped'),
                uptime: uptime,
                latency: running && this.stats.lastMessageSent ? Date.now() - this.stats.lastMessageSent.timestamp : null,
                messageRate: Math.round(messageRate * 100) / 100,
                memoryUsage: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
                vrchatConnected: running && this.udpPort !== null,
                transport: this.transport?.getStatus ? this.transport.getStatus() : null,
                oscQuery: this.oscQueryClient?.getStatus ? this.oscQueryClient.getStatus() : null,
                configValidation,
                timers: {
                    resetTimers: this.resetTimers.size,
                    oscQueryReconnect: this.oscQueryClient?.reconnectTimer ? 1 : 0,
                    oscQueryAvatarWatcher: this.oscQueryClient?.avatarWatcher ? 1 : 0
                },
                stats: this.stats
            });
        });

        // Feature #12: Preset Export/Import
        this.api.registerRoute('get', '/api/osc/presets/export', (req, res) => {
            const presets = this.presetManager.getAllPresets();
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                presets: presets
            };

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="osc-presets-${Date.now()}.json"`);
            res.json(exportData);
        });

        this.api.registerRoute('post', '/api/osc/presets/import', async (req, res) => {
            try {
                const { presets } = req.body;

                if (!presets || !Array.isArray(presets)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid import data: presets array required'
                    });
                }

                let imported = 0;
                for (const preset of presets) {
                    if (preset.name && preset.parameters) {
                        await this.presetManager.savePreset(
                            preset.name,
                            preset.parameters,
                            preset.description || ''
                        );
                        imported++;
                    }
                }

                res.json({
                    success: true,
                    imported: imported,
                    total: presets.length
                });
            } catch (error) {
                this.logger.error('Preset import failed:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Feature #13: Avatar Favorites System
        this.api.registerRoute('get', '/api/osc/favorites', async (req, res) => {
            const config = normalizeConfig(await this.api.getConfig('config') || this.getDefaultConfig());
            const favorites = config.favorites?.avatars || [];
            res.json({ success: true, favorites: favorites });
        });

        this.api.registerRoute('post', '/api/osc/favorites/:avatarId', async (req, res) => {
            try {
                if (!this.config.favorites) {
                    this.config.favorites = { avatars: [], maxFavorites: 10 };
                }

                const { avatarId } = req.params;
                const maxFavorites = this.config.favorites.maxFavorites || 10;

                // Check if already in favorites
                if (this.config.favorites.avatars.includes(avatarId)) {
                    return res.json({
                        success: false,
                        error: 'Avatar already in favorites'
                    });
                }

                // Check max favorites limit
                if (this.config.favorites.avatars.length >= maxFavorites) {
                    return res.status(400).json({
                        success: false,
                        error: `Maximum ${maxFavorites} favorites reached`
                    });
                }

                // Add to favorites
                this.config.favorites.avatars.push(avatarId);
                await this.api.setConfig('config', this.config);

                this.logger.info(`⭐ Added avatar ${avatarId} to favorites`);
                res.json({
                    success: true,
                    favorites: this.config.favorites.avatars
                });
            } catch (error) {
                this.logger.error('Add to favorites failed:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/osc/favorites/:avatarId', async (req, res) => {
            try {
                if (!this.config.favorites) {
                    this.config.favorites = { avatars: [], maxFavorites: 10 };
                }

                const { avatarId } = req.params;
                const index = this.config.favorites.avatars.indexOf(avatarId);

                if (index === -1) {
                    return res.json({
                        success: false,
                        error: 'Avatar not in favorites'
                    });
                }

                // Remove from favorites
                this.config.favorites.avatars.splice(index, 1);
                await this.api.setConfig('config', this.config);

                this.logger.info(`❌ Removed avatar ${avatarId} from favorites`);
                res.json({
                    success: true,
                    favorites: this.config.favorites.avatars
                });
            } catch (error) {
                this.logger.error('Remove from favorites failed:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    registerSocketEvents() {
        // Client kann Status-Updates anfordern
        this.api.registerSocket('osc:get-status', (data) => {
            this.emitStatus();
        });
    }

    async start() {
        if (this.isRunning || this.transport.state === 'running') {
            return { success: false, error: 'Already running' };
        }

        try {
            return await this.startWithTransport();
        } catch (error) {
            this.logger.error('Failed to start OSC-Bridge:', error);
            this.logToFile('ERROR', `Start failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async startWithTransport() {
        this.config = normalizeConfig(this.config || this.getDefaultConfig());
        const validation = validateConfig(this.config);
        if (!validation.valid) {
            return { success: false, error: validation.errors.join('; '), errors: validation.errors };
        }

        const result = await this.transport.start(this.config);
        if (!result.success) {
            this.isRunning = false;
            this.udpPort = null;
            this.stats.errors++;
            const isPortConflict = result.code === 'EADDRINUSE' || String(result.error || '').includes('EADDRINUSE');
            const logLevel = isPortConflict ? 'warn' : 'error';
            const fileLevel = isPortConflict ? 'WARN' : 'ERROR';
            this.api.log(`Failed to start OSC-Bridge: ${result.error}`, logLevel);
            this.logToFile(fileLevel, `Start failed: ${result.error}`);
            this.emitStatus();
            return result;
        }

        this.udpPort = this.transport.port;
        this.isRunning = true;
        this.stats.startTime = new Date();

        const info = `OSC-Bridge started - Receive: ${this.config.receivePort}, Send: ${this.config.sendHost}:${this.config.sendPort}`;
        this.logger.info(`OSC-Bridge ${info} (Batching: ${this.config.messageBatching?.enabled ? 'ON' : 'OFF'})`);
        this.logToFile('INFO', info);

        if (this.config.oscQuery?.enabled) {
            this.autoDiscoverOSCQuery();
        }

        this.emitStatus();

        return { success: true };
    }

    async stop() {
        if (!this.isRunning) {
            const result = await this.transport.stop();
            this.udpPort = null;
            this.isRunning = false;
            this.stats.startTime = null;
            this.emitStatus();
            return result.success ? { success: true } : result;
        }

        try {
            this.sendService.clear();

            if (this.oscQueryClient) {
                this.oscQueryClient.disconnect();
            }

            const result = await this.transport.stop();
            this.udpPort = null;
            this.isRunning = false;
            this.stats.startTime = null;

            this.logger.info('OSC-Bridge stopped');
            this.logToFile('INFO', 'OSC-Bridge stopped');
            this.emitStatus();

            return result.success ? { success: true } : result;
        } catch (error) {
            this.logger.error('Failed to stop OSC-Bridge:', error);
            return { success: false, error: error.message };
        }
    }

    send(address, ...args) {
        return this.sendMessage(address, args).success;
    }

    sendMessage(address, args = []) {
        const result = this.sendService.sendMessage(address, Array.isArray(args) ? args : [args]);

        if (result.success && !result.skipped) {
            const value = result.args[0];
            if (this.config.liveMonitoring?.enabled && this.avatarStateStore) {
                this.avatarStateStore.updateParameter(address, value);
            }

            if (this.config.verboseMode) {
                this.logger.debug(`OSC SEND -> ${address} ${JSON.stringify(result.args)}`);
            }
        }

        if (!result.success) {
            this.logToFile('ERROR', `Send failed: ${result.error}`);
        }

        return result;
    }

    handleIncomingMessage(oscMessage, info) {
        try {
            const { address, args } = oscMessage;

            this.stats.messagesReceived++;
            this.stats.lastMessageReceived = { address, args, timestamp: new Date() };

            const values = args.map(arg => arg.value);

            if (this.config.liveMonitoring?.enabled && values.length > 0 && this.avatarStateStore) {
                this.avatarStateStore.updateParameter(address, values[0]);
            }

            const source = info ? `${info.address}:${info.port}` : 'unknown';
            this.logToFile('RECV', `RECV <- ${address} ${JSON.stringify(values)} from ${source}`);

            if (this.config.verboseMode) {
                this.logger.debug(`OSC RECV <- ${address} ${JSON.stringify(values)} from ${source}`);
            }

            this.api.emit('osc:received', {
                address,
                args: values,
                source,
                timestamp: new Date()
            });

            this.api.emit(`osc.in${address}`, {
                address,
                values,
                source: info?.address
            });
        } catch (error) {
            this.stats.errors++;
            this.logger.error('OSC message handling error:', error);
            this.logToFile('ERROR', `Message handling failed: ${error.message}`);
        }
    }

    async logToFile(level, message) {
        try {
            const timestamp = new Date().toISOString();
            const logLine = `[${timestamp}] [${level}] ${message}\n`;
            await fs.appendFile(this.logFile, logLine, 'utf8');
        } catch (error) {
            // Silent fail
        }
    }

    async updateConfig(newConfig) {
        try {
            const wasRunning = this.isRunning;

            if (wasRunning) {
                await this.stop();
            }

            this.config = normalizeConfig(deepMerge(this.config || this.getDefaultConfig(), newConfig || {}));

            const validation = validateConfig(this.config);
            if (!validation.valid) {
                return { success: false, error: validation.errors.join('; '), errors: validation.errors };
            }

            // Sync oscQueryClient with updated config
            const oscCfg = this.config.oscQuery;
            if (oscCfg?.enabled) {
                // Re-create client in case host/port changed, or it was previously disabled
                if (this.oscQueryClient) {
                    this.oscQueryClient.disconnect();
                }
                this.oscQueryClient = new OSCQueryClient(
                    oscCfg.host || '127.0.0.1',
                    oscCfg.port || 9001,
                    this.logger
                );
                this.logger.info('📡 OSCQuery client re-initialized after config update');
            } else if (!oscCfg?.enabled && this.oscQueryClient) {
                this.oscQueryClient.disconnect();
                this.oscQueryClient = null;
                this.logger.info('📡 OSCQuery client removed (disabled in config)');
            }

            await this.api.setConfig('config', this.config);

            if (wasRunning && this.config.enabled) {
                await this.start();
            } else if (!this.config.enabled && wasRunning) {
                this.logger.info('📡 OSC-Bridge disabled');
            } else if (this.config.enabled && !wasRunning) {
                await this.start();
            }

            this.emitStatus();

            return { success: true, config: this.config };

        } catch (error) {
            this.logger.error('Failed to update OSC config:', error);
            return { success: false, error: error.message };
        }
    }

    emitStatus() {
        const status = this.getStatus();
        this.api.emit('osc:status', status);
    }

    getStatus() {
        const configValidation = validateConfig(normalizeConfig(this.config || this.getDefaultConfig()));
        const running = this.isRunning && this.transport?.state === 'running';
        return {
            isRunning: running,
            state: this.transport?.state || (running ? 'running' : 'stopped'),
            config: this.config,
            stats: this.stats,
            transport: this.transport?.getStatus ? this.transport.getStatus() : null,
            configValidation,
            oscQuery: this.oscQueryClient?.getStatus ? this.oscQueryClient.getStatus() : null,
            uptime: running && this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0
        };
    }

    test(address = '/avatar/parameters/Test', value = 1) {
        if (!this.isRunning) {
            return { success: false, error: 'Bridge not running' };
        }

        try {
            this.send(address, value);
            this.logger.info(`📡 OSC Test signal sent: ${address} = ${value}`);

            return {
                success: true,
                message: `Test signal sent to ${address}`,
                address,
                value
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // VRChat Helper-Methoden
    triggerAvatarParameter(paramName, value = 1, duration = 1000) {
        const address = `/avatar/parameters/${paramName}`;
        const success = this.send(address, value);

        if (success && duration > 0) {
            const timer = setTimeout(() => {
                this.resetTimers.delete(timer);
                this.send(address, 0);
            }, duration);
            this.resetTimers.add(timer);
            if (typeof timer.unref === 'function') {
                timer.unref();
            }
        }

        return success;
    }

    wave(duration = 2000) {
        return this.triggerAvatarParameter('Wave', 1, duration);
    }

    celebrate(duration = 3000) {
        return this.triggerAvatarParameter('Celebrate', 1, duration);
    }

    dance(duration = 5000) {
        return this.triggerAvatarParameter('DanceTrigger', 1, duration);
    }

    hearts(duration = 2000) {
        return this.triggerAvatarParameter('Hearts', 1, duration);
    }

    confetti(duration = 3000) {
        return this.triggerAvatarParameter('Confetti', 1, duration);
    }

    triggerEmote(slotNumber, duration = 2000) {
        if (slotNumber >= 0 && slotNumber <= 7) {
            return this.triggerAvatarParameter(`EmoteSlot${slotNumber}`, 1, duration);
        }
        return false;
    }

    // GoGo Loco Helper Methods
    setGoGoLocoVelocity(velocity) {
        // velocity: 0-1 float
        return this.send('/avatar/parameters/GGLVelocity', velocity);
    }

    setGoGoLocoTurn(angle) {
        // angle: -1 to 1 float
        return this.send('/avatar/parameters/GGLTurn', angle);
    }

    setGoGoLocoGrounded(grounded) {
        // grounded: boolean
        return this.send('/avatar/parameters/GGLGrounded', grounded ? 1 : 0);
    }

    setGoGoLocoFly(flying) {
        // flying: boolean
        return this.send('/avatar/parameters/GGLFly', flying ? 1 : 0);
    }

    setGoGoLocoSwim(swimming) {
        // swimming: boolean
        return this.send('/avatar/parameters/GGLSwim', swimming ? 1 : 0);
    }

    // Expose für Flow-System
    getOSCBridge() {
        return this;
    }

    /**
     * Register TikTok gift event handler for gift-to-action mappings
     */
    registerTikTokGiftHandler() {
        try {
            this.api.registerTikTokEvent('gift', (giftData) => {
                this.handleGiftEvent(giftData);
            });
            this.logger.info('✅ TikTok gift event handler registered for OSC-Bridge');

            // Register chat event handler for chatbox mirroring
            this.api.registerTikTokEvent('chat', (chatData) => {
                if (chatData && chatData.comment && chatData.uniqueId) {
                    this.mirrorTikTokChatToChatbox(chatData.comment, chatData.uniqueId);
                }
            });
            this.logger.info('✅ TikTok chat event handler registered for chatbox mirroring');
        } catch (error) {
            this.logger.error('Failed to register TikTok event handlers. TikTok integration may not be available:', error);
        }
    }

    /**
     * Handle incoming TikTok gift event and execute mapped actions
     */
    async handleGiftEvent(giftData) {
        // Validate gift data
        if (!giftData || (!giftData.giftId && !giftData.giftName)) {
            this.logger.warn('Invalid gift data received:', giftData);
            return;
        }

        if (!this.isRunning) {
            return; // OSC-Bridge not active
        }

        if (!this.config.giftMappings || this.config.giftMappings.length === 0) {
            return; // No mappings configured
        }

        const giftId = giftData.giftId;
        const giftName = giftData.giftName;

        // Find matching gift mapping - use flexible matching
        // Priority: 1) Exact ID match, 2) Name match (case-insensitive)
        let mapping = null;

        // First try ID match (most reliable)
        if (giftId) {
            // Convert to number for comparison, handling both string and number inputs
            const numericGiftId = typeof giftId === 'number' ? giftId : parseInt(giftId, 10);
            // Only proceed if we have a valid numeric ID
            if (!isNaN(numericGiftId)) {
                mapping = this.config.giftMappings.find(m => {
                    if (!m.giftId) return false;
                    const mappingId = typeof m.giftId === 'number' ? m.giftId : parseInt(m.giftId, 10);
                    return !isNaN(mappingId) && mappingId === numericGiftId;
                });
            }
        }

        // Then try name match (case-insensitive)
        if (!mapping && giftName) {
            const lowerGiftName = giftName.toLowerCase();
            mapping = this.config.giftMappings.find(m =>
                m.giftName && m.giftName.toLowerCase() === lowerGiftName
            );
        }

        if (!mapping) {
            this.logger.debug(`No mapping found for gift: ${giftName} (ID: ${giftId})`);
            return; // No mapping for this gift
        }

        this.logger.info(`🎁 Gift mapping triggered: ${giftName} (${giftId}) → ${mapping.action}`);
        this.logToFile('GIFT', `Gift ${giftName} (${giftId}) triggered action ${mapping.action}`);

        try {
            // Execute the mapped action
            switch (mapping.action) {
                case 'wave':
                    this.wave(mapping.params?.duration || 2000);
                    break;
                case 'celebrate':
                    this.celebrate(mapping.params?.duration || 3000);
                    break;
                case 'dance':
                    this.dance(mapping.params?.duration || 5000);
                    break;
                case 'hearts':
                    this.hearts(mapping.params?.duration || 2000);
                    break;
                case 'confetti':
                    this.confetti(mapping.params?.duration || 3000);
                    break;
                case 'emote':
                    this.triggerEmote(mapping.params?.slot || 0, mapping.params?.duration || 2000);
                    break;
                case 'avatar':
                    if (mapping.params?.avatarId) {
                        this.switchAvatar(mapping.params.avatarId, mapping.params?.avatarName);
                    }
                    break;
                case 'custom_parameter':
                    if (mapping.params?.parameterName) {
                        this.triggerAvatarParameter(
                            mapping.params.parameterName,
                            mapping.params?.value !== undefined ? mapping.params.value : 1,
                            mapping.params?.duration || 1000
                        );
                    }
                    break;
                default:
                    this.logger.warn(`Unknown action in gift mapping: ${mapping.action}`);
            }

            // Emit event for tracking
            this.api.emit('osc:gift-triggered', {
                giftId,
                giftName,
                action: mapping.action,
                params: mapping.params,
                username: giftData.uniqueId,
                timestamp: new Date()
            });

        } catch (error) {
            this.logger.error(`Error executing gift mapping for ${giftName}:`, error);
            this.logToFile('ERROR', `Gift mapping execution failed: ${error.message}`);
        }
    }

    /**
     * Switch VRChat avatar via OSC
     * @param {string} avatarId - VRChat avatar ID (avtr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
     * @param {string} avatarName - Optional avatar name for logging
     */
    switchAvatar(avatarId, avatarName = null) {
        if (!this.isRunning) {
            this.logger.warn('OSC-Bridge not running, cannot switch avatar');
            return false;
        }

        // Validate avatar ID format
        if (typeof avatarId !== 'string') {
            this.logger.error('Avatar ID must be a string');
            return false;
        }

        if (!avatarId.startsWith('avtr_')) {
            this.logger.warn(`Avatar ID should start with "avtr_", got: ${avatarId}`);
        }

        try {
            // VRChat avatar switching uses /avatar/change with avatar ID as string
            const address = '/avatar/change';
            this.send(address, avatarId);

            const logMsg = avatarName
                ? `Avatar switched to: ${avatarName} (${avatarId})`
                : `Avatar switched to: ${avatarId}`;

            this.logger.info(`👤 ${logMsg}`);
            this.logToFile('AVATAR', logMsg);

            this.api.emit('osc:avatar-switched', {
                avatarId,
                avatarName,
                timestamp: new Date()
            });

            return true;
        } catch (error) {
            this.logger.error('Avatar switch error:', error);
            this.logToFile('ERROR', `Avatar switch failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Register GCCE commands for VRChat actions
     */
    registerGCCECommands() {
        const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
        if (!gccePlugin?.instance) {
            this.logger.debug('GCCE plugin not available, skipping command registration');
            return;
        }

        const gcce = gccePlugin.instance;

        // Check if chat commands are enabled
        if (!this.config.chatCommands?.enabled) {
            this.logger.debug('OSC-Bridge chat commands are disabled in config');
            return;
        }

        // Get commands from config, falling back to defaults
        const configCommands = this.config.chatCommands?.commands || this.getDefaultCommands();

        // Filter only enabled commands and build GCCE command objects
        const commands = configCommands
            .filter(cmd => cmd.enabled)
            .map(cmd => {
                const gcceCommand = {
                    name: cmd.name,
                    description: cmd.description || `Trigger ${cmd.name}`,
                    syntax: cmd.syntax || `/${cmd.name}`,
                    permission: cmd.permission || 'all',
                    enabled: true,
                    category: cmd.category || 'VRChat'
                };

                // Add min/max args if specified
                if (cmd.minArgs !== undefined) gcceCommand.minArgs = cmd.minArgs;
                if (cmd.maxArgs !== undefined) gcceCommand.maxArgs = cmd.maxArgs;

                // Add handler based on action type
                if (cmd.actionType === 'predefined') {
                    gcceCommand.handler = async (args, context) => await this.handlePredefinedCommand(cmd, args, context);
                } else if (cmd.actionType === 'custom') {
                    gcceCommand.handler = async (args, context) => await this.handleCustomCommand(cmd, args, context);
                }

                return gcceCommand;
            });

        // Add dynamic avatar switch command if enabled
        const avatarSwitchConfig = this.config.chatCommands?.avatarSwitch;
        if (avatarSwitchConfig?.enabled && this.config.avatars?.length > 0) {
            const avatarNames = this.config.avatars.map(a => a.name).join(', ');
            commands.push({
                name: 'avatar',
                description: `Switch VRChat avatar. Available: ${avatarNames}`,
                syntax: '/avatar <name>',
                permission: avatarSwitchConfig.permission || 'subscriber',
                enabled: true,
                category: 'VRChat',
                minArgs: 1,
                handler: async (args, context) => await this.handlePredefinedCommand(
                    { action: 'avatar', actionType: 'predefined' },
                    args,
                    context
                )
            });
        }

        if (commands.length === 0) {
            this.logger.debug('No enabled OSC-Bridge commands to register');
            return;
        }

        const result = gcce.registerCommandsForPlugin('osc-bridge', commands);

        if (result.registered.length > 0) {
            this.logger.info(`✅ Registered ${result.registered.length} OSC-Bridge commands with GCCE: ${result.registered.join(', ')}`);
        }

        if (result.failed.length > 0) {
            this.logger.warn(`⚠️ Failed to register ${result.failed.length} commands: ${result.failed.join(', ')}`);
        }
    }

    /**
     * Unregister GCCE commands
     */
    unregisterGCCECommands() {
        const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
        if (gccePlugin?.instance) {
            try {
                gccePlugin.instance.unregisterCommandsForPlugin('osc-bridge');
                this.logger.debug('OSC-Bridge commands unregistered from GCCE');
            } catch (error) {
                this.logger.error('Error unregistering GCCE commands:', error);
            }
        }
    }

    /**
     * Handle predefined command (wave, celebrate, dance, etc.)
     */
    async handleWaveCommand(context = {}) {
        return this.handlePredefinedCommand(
            { action: 'wave', params: { duration: 2000 } },
            [],
            context
        );
    }

    async handleCelebrateCommand(context = {}) {
        return this.handlePredefinedCommand(
            { action: 'celebrate', params: { duration: 3000 } },
            [],
            context
        );
    }

    async handleDanceCommand(context = {}) {
        return this.handlePredefinedCommand(
            { action: 'dance', params: { duration: 5000 } },
            [],
            context
        );
    }

    async handleHeartsCommand(context = {}) {
        return this.handlePredefinedCommand(
            { action: 'hearts', params: { duration: 2000 } },
            [],
            context
        );
    }

    async handleConfettiCommand(context = {}) {
        return this.handlePredefinedCommand(
            { action: 'confetti', params: { duration: 3000 } },
            [],
            context
        );
    }

    async handleEmoteCommand(args = [], context = {}) {
        const connectionError = this.checkOSCConnectionRequired();
        if (connectionError) return connectionError;

        const slotNumber = parseInt(args[0]);
        if (isNaN(slotNumber) || slotNumber < 0 || slotNumber > 7) {
            return {
                success: false,
                error: 'Invalid emote slot',
                message: 'Please specify an emote slot between 0 and 7. Usage: /emote <0-7>'
            };
        }

        this.triggerEmote(slotNumber);
        this.logger.info(`Emote ${slotNumber} triggered by ${context.username || 'unknown'} via GCCE`);
        return { success: true, message: `Emote slot ${slotNumber} triggered!` };
    }

    async handlePredefinedCommand(cmd, args, context) {
        const connectionError = this.checkOSCConnectionRequired();
        if (connectionError) return connectionError;

        const action = cmd.action;
        const params = cmd.params || {};

        switch (action) {
            case 'wave':
                this.wave(params.duration || 2000);
                this.logger.info(`👋 Wave triggered by ${context.username} via GCCE`);
                return { success: true, message: '👋 Wave animation triggered!' };

            case 'celebrate':
                this.celebrate(params.duration || 3000);
                this.logger.info(`🎉 Celebrate triggered by ${context.username} via GCCE`);
                return { success: true, message: '🎉 Celebrate animation triggered!' };

            case 'dance':
                this.dance(params.duration || 5000);
                this.logger.info(`💃 Dance triggered by ${context.username} via GCCE`);
                return { success: true, message: '💃 Dance animation triggered!' };

            case 'hearts':
                this.hearts(params.duration || 2000);
                this.logger.info(`❤️ Hearts triggered by ${context.username} via GCCE`);
                return { success: true, message: '❤️ Hearts effect triggered!' };

            case 'confetti':
                this.confetti(params.duration || 3000);
                this.logger.info(`🎊 Confetti triggered by ${context.username} via GCCE`);
                return { success: true, message: '🎊 Confetti effect triggered!' };

            case 'emote':
                const slotNumber = parseInt(args[0]);
                if (isNaN(slotNumber) || slotNumber < 0 || slotNumber > 7) {
                    return {
                        success: false,
                        error: 'Invalid emote slot',
                        message: 'Please specify an emote slot between 0 and 7. Usage: /emote <0-7>'
                    };
                }
                this.triggerEmote(slotNumber, params.duration || 2000);
                this.logger.info(`😀 Emote ${slotNumber} triggered by ${context.username} via GCCE`);
                return { success: true, message: `😀 Emote slot ${slotNumber} triggered!` };

            case 'avatar':
                // Avatar switching via chat command
                const avatarName = args.join(' '); // Support multi-word avatar names
                if (!avatarName) {
                    return {
                        success: false,
                        error: 'Avatar name required',
                        message: 'Please specify an avatar name. Usage: /avatar <name>'
                    };
                }

                // Find avatar by name
                const avatars = this.config.avatars || [];
                const avatar = avatars.find(a =>
                    a.name.toLowerCase() === avatarName.toLowerCase()
                );

                if (!avatar) {
                    const availableNames = avatars.map(a => a.name).join(', ');
                    return {
                        success: false,
                        error: 'Avatar not found',
                        message: availableNames
                            ? `Avatar '${avatarName}' not found. Available avatars: ${availableNames}`
                            : `Avatar '${avatarName}' not found. No avatars configured.`
                    };
                }

                // Check cooldown
                const cooldownCheck = this.checkAvatarSwitchCooldown(context.username);
                if (!cooldownCheck.allowed) {
                    return {
                        success: false,
                        error: 'Cooldown active',
                        message: `Please wait ${cooldownCheck.remainingSeconds} seconds before switching avatars again.`
                    };
                }

                // Switch avatar
                this.switchAvatar(avatar.avatarId, avatar.name);
                this.updateAvatarSwitchCooldown(context.username);
                this.logger.info(`👤 Avatar switched to '${avatar.name}' by ${context.username} via GCCE`);
                return {
                    success: true,
                    message: `👤 Switched to avatar: ${avatar.name}`
                };

            default:
                return { success: false, error: `Unknown action: ${action}` };
        }
    }

    /**
     * Handle custom command (user-defined OSC action)
     */
    async handleCustomCommand(cmd, args, context) {
        const connectionError = this.checkOSCConnectionRequired();
        if (connectionError) return connectionError;

        const params = cmd.params || {};
        const oscAddress = params.oscAddress;
        const oscValue = params.oscValue !== undefined ? params.oscValue : 1;
        const duration = params.duration || 0;

        if (!oscAddress) {
            return { success: false, error: 'No OSC address defined for this command' };
        }

        // Send the OSC message
        this.send(oscAddress, oscValue);
        this.logger.info(`🎯 Custom command '${cmd.name}' triggered by ${context.username} via GCCE - sent ${oscAddress} = ${oscValue}`);

        // Auto-reset if duration is set
        if (duration > 0) {
            setTimeout(() => {
                this.send(oscAddress, 0);
            }, duration);
        }

        return {
            success: true,
            message: `✅ Custom command '${cmd.name}' triggered!`
        };
    }

    /**
     * Helper method to check if OSC connection is required and available
     * @returns {Object|null} Error object if connection check fails, null if ok
     */
    checkOSCConnectionRequired() {
        if (this.config.chatCommands?.requireOSCConnection && !this.isRunning) {
            return {
                success: false,
                error: 'OSC-Bridge is not connected',
                message: 'VRChat OSC is not connected. Please start the bridge first.'
            };
        }
        return null;
    }

    /**
     * Check if avatar switch is allowed (cooldown check)
     * @param {string} username - Username attempting the switch
     * @returns {Object} { allowed: boolean, remainingSeconds: number }
     */
    checkAvatarSwitchCooldown(username) {
        const avatarSwitchConfig = this.config.chatCommands?.avatarSwitch || {};
        const cooldownType = avatarSwitchConfig.cooldownType || 'global';
        const cooldownSeconds = avatarSwitchConfig.cooldownSeconds || 60;
        const now = Date.now();

        if (cooldownType === 'global') {
            // Global cooldown - applies to all users
            if (this.avatarSwitchCooldowns.global) {
                const elapsed = (now - this.avatarSwitchCooldowns.global) / 1000;
                if (elapsed < cooldownSeconds) {
                    return {
                        allowed: false,
                        remainingSeconds: Math.ceil(cooldownSeconds - elapsed)
                    };
                }
            }
        } else if (cooldownType === 'perUser') {
            // Per-user cooldown
            if (this.avatarSwitchCooldowns.perUser.has(username)) {
                const lastSwitch = this.avatarSwitchCooldowns.perUser.get(username);
                const elapsed = (now - lastSwitch) / 1000;
                if (elapsed < cooldownSeconds) {
                    return {
                        allowed: false,
                        remainingSeconds: Math.ceil(cooldownSeconds - elapsed)
                    };
                }
            }
        }

        return { allowed: true, remainingSeconds: 0 };
    }

    /**
     * Update cooldown timestamp after avatar switch
     * @param {string} username - Username who switched avatar
     */
    updateAvatarSwitchCooldown(username) {
        const cooldownType = this.config.chatCommands?.avatarSwitch?.cooldownType || 'global';
        const now = Date.now();

        if (cooldownType === 'global') {
            this.avatarSwitchCooldowns.global = now;
        } else if (cooldownType === 'perUser') {
            this.avatarSwitchCooldowns.perUser.set(username, now);

            // Cleanup old entries (older than 1 hour)
            const oneHourAgo = now - (60 * 60 * 1000);
            for (const [user, timestamp] of this.avatarSwitchCooldowns.perUser.entries()) {
                if (timestamp < oneHourAgo) {
                    this.avatarSwitchCooldowns.perUser.delete(user);
                }
            }
        }
    }

    /**
     * OSCQuery Auto-Discovery
     */
    async autoDiscoverOSCQuery() {
        try {
            if (!this.oscQueryClient) {
                const host = this.config.oscQuery?.host || '127.0.0.1';
                const port = this.config.oscQuery?.port || 9001;
                this.oscQueryClient = new OSCQueryClient(host, port, this.logger);
            }

            const result = await this.oscQueryClient.discover();
            this.logger.info(`✅ OSCQuery discovered ${result.parameters.length} parameters`);

            // Auto-discover PhysBones if enabled
            if (this.config.physBones?.enabled && this.physBonesController) {
                await this.physBonesController.autoDiscover(this.oscQueryClient);
            }

            if (this.config.oscQuery?.autoSubscribe) {
                this.oscQueryClient.subscribe((update) => {
                    this.api.emit('osc:oscquery-update', update);

                    // Update avatar state store with parameter updates
                    if (this.avatarStateStore && update.path && update.value !== undefined) {
                        this.avatarStateStore.updateParameter(update.path, update.value);
                    }
                });

                // Watch for avatar changes
                this.oscQueryClient.startAvatarWatcher(5000, (avatarInfo) => {
                    this.logger.info(`👤 Avatar changed: ${avatarInfo.id}`);

                    if (this.avatarStateStore) {
                        this.avatarStateStore.setCurrentAvatar(avatarInfo.id);
                    }

                    if (this.physBonesController) {
                        // Pass both avatarId and avatarName (null if not available)
                        this.physBonesController.onAvatarChanged(avatarInfo.id, null);
                    }

                    // Re-discover parameters for new avatar
                    this.autoDiscoverOSCQuery();
                });
            }

            this.api.emit('osc:oscquery-discovered', result);
        } catch (error) {
            const errorMessage = error?.message || String(error);
            this.logger.error(`OSCQuery auto-discovery failed: ${errorMessage}`);
            if (error?.stack) {
                this.logger.error(`OSCQuery auto-discovery stack: ${error.stack}`);
            }
        }
    }

    /**
     * PhysBones Control - delegated to PhysBonesController
     */
    triggerPhysBoneAnimation(boneName, animation = 'wiggle', params = {}) {
        if (this.physBonesController) {
            return this.physBonesController.triggerAnimation(boneName, animation, params);
        }

        // Fallback to old implementation
        const basePath = `/avatar/physbones/${boneName}`;
        const duration = params.duration || 1000;
        const amplitude = params.amplitude || 0.5;

        if (animation === 'wiggle') {
            // Wiggle animation (e.g., tail wag)
            const startTime = Date.now();
            const interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                if (elapsed > duration) {
                    clearInterval(interval);
                    this.send(`${basePath}/Angle`, 0);
                    return;
                }

                const value = Math.sin((elapsed / 100) * Math.PI) * amplitude;
                this.send(`${basePath}/Angle`, value);
            }, 16); // 60fps
        } else if (animation === 'stretch') {
            // Stretch animation
            this.send(`${basePath}/Stretch`, amplitude);
            setTimeout(() => {
                this.send(`${basePath}/Stretch`, 0);
            }, duration);
        } else if (animation === 'grab') {
            // Grab simulation
            this.send(`${basePath}/IsGrabbed`, 1);
            setTimeout(() => {
                this.send(`${basePath}/IsGrabbed`, 0);
            }, duration);
        }

        this.logger.info(`🦴 PhysBone animation: ${boneName} - ${animation}`);
    }

    /**
     * VRChat Chatbox Integration
     */
    sendToChatbox(message, showTyping = true) {
        if (!this.isRunning) {
            this.logger.warn('Cannot send to chatbox: OSC not running');
            return false;
        }

        try {
            // Show typing indicator
            if (showTyping && this.config.chatbox?.showTyping) {
                this.send(this.VRCHAT_PARAMS.CHATBOX_TYPING, true);
                setTimeout(() => {
                    this.send(this.VRCHAT_PARAMS.CHATBOX_TYPING, false);
                }, 1000);
            }

            // Send message to chatbox
            // VRChat chatbox takes string and boolean (true = send immediately)
            this.send(this.VRCHAT_PARAMS.CHATBOX_INPUT, message, true);

            this.logger.info(`💬 Sent to VRChat chatbox: ${message}`);
            return true;
        } catch (error) {
            this.logger.error('Chatbox send error:', error);
            return false;
        }
    }

    /**
     * Mirror TikTok chat to VRChat chatbox
     */
    mirrorTikTokChatToChatbox(message, username) {
        if (!this.config.chatbox?.enabled || !this.config.chatbox?.mirrorTikTokChat) {
            return;
        }

        const prefix = this.config.chatbox?.prefix || '[TikTok]';
        const formatted = `${prefix} ${username}: ${message}`;
        this.sendToChatbox(formatted, true);
    }

    registerAnimazingPalBridge() {
        if (typeof this.api.on !== 'function') {
            this.logger.debug('Plugin event bus not available, skipping AnimazingPal bridge');
            return;
        }

        if (this.animazingPalBridgeRegistered) {
            return;
        }

        if (!this.animazingPalIntentHandler) {
            this.animazingPalIntentHandler = (intent) => {
                this.handleAnimazingPalIntent(intent);
            };
        }

        this.api.on('animazingpal:vrchat-intent', this.animazingPalIntentHandler);
        this.animazingPalBridgeRegistered = true;
        this.logger.info('? AnimazingPal VRChat intent bridge registered');
    }

    handleAnimazingPalIntent(intent) {
        if (!intent || typeof intent !== 'object') {
            return false;
        }

        if (intent.targetPluginId && intent.targetPluginId !== 'osc-bridge') {
            return false;
        }

        if (!this.isRunning) {
            return false;
        }

        const kind = intent.kind || intent.type || 'chatbox';
        const message = intent.message || intent.text || '';
        const username = intent.username || 'Someone';
        const rawGesture = (intent.gesture || intent.action || '').toString().toLowerCase();

        try {
            switch (kind) {
                case 'chatbox':
                    if (message) {
                        this.sendToChatbox(message, intent.showTyping !== false);
                    }
                    break;
                case 'gesture':
                    switch (rawGesture) {
                        case 'wave':
                            this.wave(intent.duration || 2000);
                            break;
                        case 'celebrate':
                            this.celebrate(intent.duration || 3000);
                            break;
                        case 'dance':
                            this.dance(intent.duration || 5000);
                            break;
                        case 'hearts':
                            this.hearts(intent.duration || 2000);
                            break;
                        case 'confetti':
                            this.confetti(intent.duration || 3000);
                            break;
                        default:
                            if (intent.parameters?.parameterName) {
                                this.triggerAvatarParameter(
                                    intent.parameters.parameterName,
                                    intent.parameters.value !== undefined ? intent.parameters.value : 1,
                                    intent.parameters.duration || intent.duration || 1000
                                );
                            }
                            break;
                    }
                    break;
                case 'emote':
                    this.triggerEmote(
                        intent.slot !== undefined ? intent.slot : intent.emoteSlot || 0,
                        intent.duration || 2000
                    );
                    break;
                case 'parameter':
                    if (intent.parameters?.parameterName) {
                        this.triggerAvatarParameter(
                            intent.parameters.parameterName,
                            intent.parameters.value !== undefined ? intent.parameters.value : 1,
                            intent.parameters.duration || intent.duration || 1000
                        );
                    }
                    break;
                case 'avatar':
                    if (intent.avatarId) {
                        this.switchAvatar(intent.avatarId, intent.avatarName || username);
                    }
                    break;
                default:
                    if (message) {
                        this.sendToChatbox(message, intent.showTyping !== false);
                    }
                    break;
            }

            this.api.emit('osc:animazingpal-intent-handled', {
                kind,
                eventType: intent.eventType || null,
                username,
                timestamp: new Date()
            });

            return true;
        } catch (error) {
            this.logger.error(`Failed to handle AnimazingPal intent: ${error.message}`);
            return false;
        }
    }

    /**
     * Expression Menu Integration (8 emote slots) - delegated to ExpressionController
     */
    triggerExpression(slot, hold = false) {
        if (this.expressionController) {
            return this.expressionController.triggerExpression('Emote', slot, hold);
        }

        // Fallback to old implementation
        if (slot < 0 || slot > 7) {
            this.logger.warn(`Invalid expression slot: ${slot}. Must be 0-7.`);
            return false;
        }

        const address = `/avatar/parameters/EmoteSlot${slot}`;
        this.send(address, hold ? 1 : 0);

        this.logger.info(`😀 Expression slot ${slot} triggered (hold: ${hold})`);
        return true;
    }

    /**
     * Play expression combo (sequence of expressions) - delegated to ExpressionController
     */
    async playExpressionCombo(combo) {
        if (this.expressionController) {
            return await this.expressionController.playCombo(combo);
        }

        // Fallback to old implementation
        for (const step of combo) {
            this.triggerExpression(step.slot, true);
            await new Promise(resolve => setTimeout(resolve, step.duration || 1000));
            this.triggerExpression(step.slot, false);
            if (step.pause) {
                await new Promise(resolve => setTimeout(resolve, step.pause));
            }
        }
    }

    /**
     * Get current avatar ID from OSCQuery
     * @returns {Promise<string|null>} Current avatar ID or null if not available
     */
    async getCurrentAvatarId(options = {}) {
        const { retries = 0, retryDelay = 1000 } = options;

        try {
            if (!this.oscQueryClient) {
                this.logger.debug('OSCQuery client not initialized for avatar ID retrieval');
                return null;
            }

            // Try to get from cached avatar info first
            if (this.oscQueryClient.avatarInfo?.id) {
                this.logger.debug(`Using cached avatar ID: ${this.oscQueryClient.avatarInfo.id}`);
                return this.oscQueryClient.avatarInfo.id;
            }

            // Try to query /avatar/change parameter directly
            const axios = require('axios');
            try {
                const response = await axios.get(`${this.oscQueryClient.baseUrl}/avatar/change`, {
                    timeout: 5000
                });

                if (response.data && response.data.VALUE) {
                    this.logger.info(`✅ Avatar ID detected: ${response.data.VALUE}`);
                    // Cache it
                    this.oscQueryClient.avatarInfo = {
                        id: response.data.VALUE,
                        changedAt: Date.now()
                    };
                    return response.data.VALUE;
                }
            } catch (axiosError) {
                this.logger.debug(`Failed to query /avatar/change: ${axiosError.message}`);
            }

            // If direct query fails, try to find it in discovered parameters
            if (this.oscQueryClient.parameters && this.oscQueryClient.parameters.size > 0) {
                const avatarChangeParam = this.oscQueryClient.parameters.get('/avatar/change');
                if (avatarChangeParam && avatarChangeParam.value) {
                    this.logger.info(`[OK] Avatar ID from parameters: ${avatarChangeParam.value}`);
                    // Cache it
                    this.oscQueryClient.avatarInfo = {
                        id: avatarChangeParam.value,
                        changedAt: Date.now()
                    };
                    return avatarChangeParam.value;
                }
            }

            // If retries are available and no avatar found, retry after delay
            if (retries > 0) {
                this.logger.debug(`No avatar found, retrying in ${retryDelay}ms... (${retries} attempts remaining)`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.getCurrentAvatarId({ retries: retries - 1, retryDelay });
            }

            this.logger.debug('No avatar ID found. Make sure VRChat is running and you are in-game with an avatar.');
            return null;
        } catch (error) {
            this.logger.error('Error getting current avatar ID:', error);
            return null;
        }
    }

    /**
     * Get available actions based on discovered parameters
     * @returns {Object} Object with available VRChat actions
     */
    getAvailableActions() {
        const actions = {
            standard: {},
            emotes: {},
            custom: [],
            physbones: [],
            gogoloco: {}
        };

        if (!this.oscQueryClient || this.oscQueryClient.parameters.size === 0) {
            return actions;
        }

        // Check for standard VRChat parameters
        const standardParams = {
            Wave: '/avatar/parameters/Wave',
            Celebrate: '/avatar/parameters/Celebrate',
            Dance: '/avatar/parameters/DanceTrigger',
            Hearts: '/avatar/parameters/Hearts',
            Confetti: '/avatar/parameters/Confetti'
        };

        // Check for GoGo Loco parameters (popular locomotion system)
        const gogoLocoParams = {
            Velocity: '/avatar/parameters/GGLVelocity',
            Turn: '/avatar/parameters/GGLTurn',
            Grounded: '/avatar/parameters/GGLGrounded',
            Fly: '/avatar/parameters/GGLFly',
            Swim: '/avatar/parameters/GGLSwim',
            IKTPoseWeight: '/avatar/parameters/IKTPoseWeight',
            SpeedMultiplier: '/avatar/parameters/SpeedMultiplier'
        };

        for (const [name, path] of Object.entries(standardParams)) {
            actions.standard[name] = this.oscQueryClient.parameters.has(path);
        }

        // Check for GoGo Loco parameters
        for (const [name, path] of Object.entries(gogoLocoParams)) {
            actions.gogoloco[name] = this.oscQueryClient.parameters.has(path);
        }

        // Check for emote slots (0-7)
        for (let i = 0; i < 8; i++) {
            const path = `/avatar/parameters/EmoteSlot${i}`;
            actions.emotes[`Emote${i}`] = this.oscQueryClient.parameters.has(path);
        }

        // Get custom parameters (everything under /avatar/parameters/ that's not standard or GoGo Loco)
        const allParams = this.oscQueryClient.getAllParameters();
        const standardPaths = new Set([...Object.values(standardParams), ...Object.values(gogoLocoParams)]);

        for (const param of allParams) {
            if (param.path.startsWith('/avatar/parameters/') &&
                !standardPaths.has(param.path) &&
                !param.path.match(/EmoteSlot[0-7]$/)) {

                actions.custom.push({
                    name: param.path.split('/').pop(),
                    path: param.path,
                    type: param.type,
                    access: param.access,
                    range: param.range
                });
            }
        }

        // Get PhysBones parameters - looking for both direct physbones and VRC_IsMirrored patterns
        for (const param of allParams) {
            // VRChat physbones can be under /avatar/parameters/ with specific suffixes
            if (param.path.includes('/physbones/') || param.path.match(/_IsGrabbed|_IsPosed|_Angle|_Stretch$/)) {
                let boneName = null;

                if (param.path.includes('/physbones/')) {
                    boneName = param.path.split('/physbones/')[1]?.split('/')[0];
                } else {
                    // Extract bone name from parameter suffix pattern
                    const match = param.path.match(/\/avatar\/parameters\/(.+?)_(IsGrabbed|IsPosed|Angle|Stretch)$/);
                    if (match) {
                        boneName = match[1];
                    }
                }

                if (boneName && !actions.physbones.find(b => b.name === boneName)) {
                    actions.physbones.push({
                        name: boneName,
                        basePath: `/avatar/physbones/${boneName}`
                    });
                }
            }
        }

        return actions;
    }

    async destroy() {
        // Unregister GCCE commands
        this.unregisterGCCECommands();

        // Destroy modular components
        if (this.avatarStateStore) {
            this.avatarStateStore.destroy();
        }

        if (this.expressionController) {
            this.expressionController.destroy();
        }

        if (this.physBonesController) {
            this.physBonesController.destroy();
        }

        if (this.animazingPalIntentHandler && typeof this.api.removeListener === 'function') {
            try {
                this.api.removeListener('animazingpal:vrchat-intent', this.animazingPalIntentHandler);
            } catch (error) {
                this.logger.debug(`Failed to remove AnimazingPal intent bridge listener: ${error.message}`);
            }
        }
        this.animazingPalBridgeRegistered = false;

        for (const timer of this.resetTimers) {
            clearTimeout(timer);
        }
        this.resetTimers.clear();

        // Disconnect OSCQuery
        if (this.oscQueryClient) {
            this.oscQueryClient.destroy();
        }

        await this.stop();

        this.logger.info('📡 OSC-Bridge Plugin destroyed');
    }
}

module.exports = OSCBridgePlugin;
