/**
 * API Bridge Plugin
 * Ermöglicht externen Anwendungen die Steuerung des Tools via HTTP und WebSocket
 */

class APIBridgePlugin {
    constructor(api) {
        this.api = api;
        this.actionHandlers = new Map();
        this.eventHistory = [];
        this.maxHistorySize = 100;

        // Action Handler registrieren
        this.registerActionHandlers();
    }

    async init() {
        this.api.log('Initialisiere API Bridge Plugin...', 'info');

        // ========== HTTP Endpoints ==========

        // App Info Endpoint
        this.api.registerRoute('get', '/api/bridge/info', (req, res) => {
            res.json({
                success: true,
                data: {
                    name: "PupCids Little TikTok Helper",
                    author: "Python.72",
                    version: "1.0.0",
                    plugin: "api-bridge",
                    pluginVersion: "1.0.0"
                }
            });
        });

        // Verfügbare Actions auflisten
        this.api.registerRoute('get', '/api/bridge/actions', (req, res) => {
            const actions = Array.from(this.actionHandlers.keys()).map(actionId => {
                const handler = this.actionHandlers.get(actionId);
                return {
                    id: actionId,
                    description: handler.description || 'Keine Beschreibung verfügbar',
                    parameters: handler.parameters || {}
                };
            });

            res.json({
                success: true,
                data: actions
            });
        });

        // Action ausführen
        this.api.registerRoute('post', '/api/bridge/actions/exec', async (req, res) => {
            try {
                const { actionId, context } = req.body;

                if (!actionId) {
                    return res.status(400).json({
                        success: false,
                        error: 'actionId ist erforderlich'
                    });
                }

                this.api.log(`Action ausführen: ${actionId}`, 'info');

                const result = await this.executeAction(actionId, context || {});

                // Broadcast über Socket.IO
                this.api.emit('bridge:action-executed', {
                    actionId,
                    context,
                    result,
                    timestamp: Date.now()
                });

                res.json({
                    success: true,
                    data: result
                });
            } catch (error) {
                this.api.log(`Fehler bei Action-Ausführung: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Event History abrufen
        this.api.registerRoute('get', '/api/bridge/events', (req, res) => {
            const limit = parseInt(req.query.limit) || 50;
            const events = this.eventHistory.slice(-limit);

            res.json({
                success: true,
                data: {
                    events,
                    total: this.eventHistory.length
                }
            });
        });

        // ========== WebSocket Events ==========

        // Action via WebSocket ausführen
        this.api.registerSocket('bridge:action', async (socket, data) => {
            try {
                const { actionId, context } = data;

                if (!actionId) {
                    socket.emit('bridge:action:error', {
                        error: 'actionId ist erforderlich'
                    });
                    return;
                }

                const result = await this.executeAction(actionId, context || {});

                socket.emit('bridge:action:result', {
                    actionId,
                    context,
                    result,
                    timestamp: Date.now()
                });

                // An alle anderen Clients broadcasten
                this.api.emit('bridge:action-executed', {
                    actionId,
                    context,
                    result,
                    timestamp: Date.now()
                });
            } catch (error) {
                socket.emit('bridge:action:error', {
                    error: error.message
                });
            }
        });

        // ========== TikTok Event Broadcasting ==========

        // Gift Events
        this.api.registerTikTokEvent('gift', (data) => {
            const event = {
                type: 'tiktok:gift',
                timestamp: Date.now(),
                data: {
                    username: data.uniqueId,
                    nickname: data.nickname,
                    gift: data.giftName,
                    giftId: data.giftId,
                    amount: data.repeatCount || 1, // FIX: Use repeatCount instead of giftCount
                    diamondCost: data.diamondCount,
                    totalDiamonds: (data.repeatCount || 1) * data.diamondCount,
                    coins: data.coins || 0, // Add calculated coins value
                    profilePictureUrl: data.profilePictureUrl
                }
            };

            this.addEventToHistory(event);
            this.api.emit('bridge:tiktok-event', event);
        });

        // Follow Events
        this.api.registerTikTokEvent('follow', (data) => {
            const event = {
                type: 'tiktok:follow',
                timestamp: Date.now(),
                data: {
                    username: data.uniqueId,
                    nickname: data.nickname,
                    profilePictureUrl: data.profilePictureUrl
                }
            };

            this.addEventToHistory(event);
            this.api.emit('bridge:tiktok-event', event);
        });

        // Share Events
        this.api.registerTikTokEvent('share', (data) => {
            const event = {
                type: 'tiktok:share',
                timestamp: Date.now(),
                data: {
                    username: data.uniqueId,
                    nickname: data.nickname,
                    profilePictureUrl: data.profilePictureUrl
                }
            };

            this.addEventToHistory(event);
            this.api.emit('bridge:tiktok-event', event);
        });

        // Like Events
        this.api.registerTikTokEvent('like', (data) => {
            const event = {
                type: 'tiktok:like',
                timestamp: Date.now(),
                data: {
                    username: data.uniqueId,
                    nickname: data.nickname,
                    likeCount: data.likeCount,
                    totalLikeCount: data.totalLikeCount,
                    profilePictureUrl: data.profilePictureUrl
                }
            };

            this.addEventToHistory(event);
            this.api.emit('bridge:tiktok-event', event);
        });

        // Chat Events
        this.api.registerTikTokEvent('chat', (data) => {
            const event = {
                type: 'tiktok:chat',
                timestamp: Date.now(),
                data: {
                    username: data.uniqueId,
                    nickname: data.nickname,
                    message: data.comment,
                    profilePictureUrl: data.profilePictureUrl
                }
            };

            this.addEventToHistory(event);
            this.api.emit('bridge:tiktok-event', event);
        });

        // Subscribe Events
        this.api.registerTikTokEvent('subscribe', (data) => {
            const event = {
                type: 'tiktok:subscribe',
                timestamp: Date.now(),
                data: {
                    username: data.uniqueId,
                    nickname: data.nickname,
                    profilePictureUrl: data.profilePictureUrl
                }
            };

            this.addEventToHistory(event);
            this.api.emit('bridge:tiktok-event', event);
        });

        this.api.log('API Bridge Plugin erfolgreich initialisiert', 'info');
    }

    /**
     * Action Handler registrieren
     */
    registerActionHandlers() {
        // ========== TTS Actions ==========
        this.actionHandlers.set('tts.speak', {
            description: 'Spricht einen Text über TTS aus',
            parameters: {
                text: { type: 'string', required: true, description: 'Der auszusprechende Text' },
                voice: { type: 'string', required: false, description: 'Die zu verwendende Stimme (optional)' },
                username: { type: 'string', required: false, description: 'Username für Benutzerspezifische Stimme' }
            },
            handler: async (context) => {
                const { text, voice, username } = context;

                if (!text) {
                    throw new Error('Parameter "text" ist erforderlich');
                }

                // TTS Plugin nutzen
                const io = this.api.getSocketIO();
                io.emit('tts-speak', {
                    text,
                    voice: voice || undefined,
                    username: username || 'API-Bridge'
                });

                return { message: 'TTS ausgelöst', text, voice };
            }
        });

        this.actionHandlers.set('tts.skip', {
            description: 'Überspringt den aktuellen TTS-Eintrag',
            parameters: {},
            handler: async (context) => {
                const io = this.api.getSocketIO();
                io.emit('tts-skip');
                return { message: 'TTS skip ausgelöst' };
            }
        });

        this.actionHandlers.set('tts.clear', {
            description: 'Leert die TTS-Warteschlange',
            parameters: {},
            handler: async (context) => {
                const io = this.api.getSocketIO();
                io.emit('tts-clear-queue');
                return { message: 'TTS Queue geleert' };
            }
        });

        // ========== Soundboard Actions ==========
        this.actionHandlers.set('sound.play', {
            description: 'Spielt einen Sound ab',
            parameters: {
                soundId: { type: 'string', required: true, description: 'Die ID des Sounds' },
                volume: { type: 'number', required: false, description: 'Lautstärke (0-100)' }
            },
            handler: async (context) => {
                const { soundId, volume } = context;

                if (!soundId) {
                    throw new Error('Parameter "soundId" ist erforderlich');
                }

                const io = this.api.getSocketIO();
                io.emit('soundboard-play', {
                    soundId,
                    volume: volume || 100
                });

                return { message: 'Sound abgespielt', soundId, volume };
            }
        });

        // ========== Goals Actions ==========
        this.actionHandlers.set('goal.increment', {
            description: 'Erhöht ein Ziel um einen bestimmten Betrag',
            parameters: {
                goalType: { type: 'string', required: true, description: 'Typ des Ziels (follower, subscriber, etc.)' },
                amount: { type: 'number', required: false, description: 'Betrag zum Erhöhen (Standard: 1)' }
            },
            handler: async (context) => {
                const { goalType, amount = 1 } = context;

                if (!goalType) {
                    throw new Error('Parameter "goalType" ist erforderlich');
                }

                const io = this.api.getSocketIO();
                io.emit('goals:increment', {
                    goalType,
                    amount
                });

                return { message: 'Ziel erhöht', goalType, amount };
            }
        });

        this.actionHandlers.set('goal.set', {
            description: 'Setzt den Wert eines Ziels',
            parameters: {
                goalType: { type: 'string', required: true, description: 'Typ des Ziels' },
                value: { type: 'number', required: true, description: 'Neuer Wert' }
            },
            handler: async (context) => {
                const { goalType, value } = context;

                if (!goalType || value === undefined) {
                    throw new Error('Parameter "goalType" und "value" sind erforderlich');
                }

                const io = this.api.getSocketIO();
                io.emit('goals:set', {
                    goalType,
                    value
                });

                return { message: 'Ziel gesetzt', goalType, value };
            }
        });

        this.actionHandlers.set('goal.reset', {
            description: 'Setzt ein Ziel zurück',
            parameters: {
                goalType: { type: 'string', required: true, description: 'Typ des Ziels' }
            },
            handler: async (context) => {
                const { goalType } = context;

                if (!goalType) {
                    throw new Error('Parameter "goalType" ist erforderlich');
                }

                const io = this.api.getSocketIO();
                io.emit('goals:reset', { goalType });

                return { message: 'Ziel zurückgesetzt', goalType };
            }
        });

        // ========== OSC Actions ==========
        this.actionHandlers.set('osc.send', {
            description: 'Sendet eine OSC-Nachricht (z.B. an VRChat)',
            parameters: {
                address: { type: 'string', required: true, description: 'OSC Adresse (z.B. /avatar/parameters/Wave)' },
                value: { type: 'any', required: true, description: 'Wert zum Senden' }
            },
            handler: async (context) => {
                const { address, value } = context;

                if (!address || value === undefined) {
                    throw new Error('Parameter "address" und "value" sind erforderlich');
                }

                const io = this.api.getSocketIO();
                io.emit('osc:send', {
                    address,
                    value
                });

                return { message: 'OSC Nachricht gesendet', address, value };
            }
        });

        this.actionHandlers.set('osc.vrchat.emote', {
            description: 'Löst eine VRChat Emote aus',
            parameters: {
                emote: { type: 'string', required: true, description: 'Name der Emote (wave, clap, point, etc.)' }
            },
            handler: async (context) => {
                const { emote } = context;

                if (!emote) {
                    throw new Error('Parameter "emote" ist erforderlich');
                }

                const io = this.api.getSocketIO();
                io.emit('osc:vrchat:emote', { emote });

                return { message: 'VRChat Emote ausgelöst', emote };
            }
        });

        // ========== System Actions ==========
        this.actionHandlers.set('system.notification', {
            description: 'Zeigt eine Notification im Tool an',
            parameters: {
                message: { type: 'string', required: true, description: 'Nachricht' },
                type: { type: 'string', required: false, description: 'Typ (info, success, warning, error)' }
            },
            handler: async (context) => {
                const { message, type = 'info' } = context;

                if (!message) {
                    throw new Error('Parameter "message" ist erforderlich');
                }

                const io = this.api.getSocketIO();
                io.emit('notification', {
                    message,
                    type,
                    source: 'API Bridge'
                });

                return { message: 'Notification gesendet', notification: message, type };
            }
        });

        this.actionHandlers.set('system.event', {
            description: 'Sendet ein Custom Event an alle Clients',
            parameters: {
                event: { type: 'string', required: true, description: 'Event Name' },
                data: { type: 'object', required: false, description: 'Event Daten' }
            },
            handler: async (context) => {
                const { event, data } = context;

                if (!event) {
                    throw new Error('Parameter "event" ist erforderlich');
                }

                const io = this.api.getSocketIO();
                io.emit(event, data || {});

                return { message: 'Custom Event gesendet', event, data };
            }
        });
    }

    /**
     * Führt eine Action aus
     */
    async executeAction(actionId, context) {
        const action = this.actionHandlers.get(actionId);

        if (!action) {
            throw new Error(`Unbekannte Action: ${actionId}`);
        }

        // Parameter Validierung
        if (action.parameters) {
            for (const [param, config] of Object.entries(action.parameters)) {
                if (config.required && context[param] === undefined) {
                    throw new Error(`Erforderlicher Parameter fehlt: ${param}`);
                }
            }
        }

        // Handler ausführen
        return await action.handler(context);
    }

    /**
     * Fügt ein Event zur History hinzu
     */
    addEventToHistory(event) {
        this.eventHistory.push(event);

        // History-Größe begrenzen
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
    }

    async destroy() {
        this.api.log('API Bridge Plugin wird beendet...', 'info');
        this.actionHandlers.clear();
        this.eventHistory = [];
    }
}

module.exports = APIBridgePlugin;
