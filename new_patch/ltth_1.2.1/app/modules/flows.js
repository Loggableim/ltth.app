const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const dns = require('dns').promises;
const templateEngine = require('./template-engine');

class FlowEngine {
    constructor(db, alertManager, logger) {
        this.db = db;
        this.alertManager = alertManager;
        this.logger = logger;

        // Sicheres Verzeichnis für File-Writes
        this.SAFE_DIR = path.join(__dirname, '..', 'user_data', 'flow_logs');

        // Erlaubte Webhook-Domains
        this.ALLOWED_WEBHOOK_DOMAINS = [
            'webhook.site',
            'discord.com',
            'zapier.com',
            'ifttt.com',
            'make.com',
            'integromat.com'
        ];

        // Gesperrte IP-Ranges (internal networks, RFC1918, Loopback, Link-Local, Private IPv6)
        this.BLOCKED_IP_PATTERNS = [
            '127.',           // Loopback IPv4
            '10.',            // Private Class A (RFC1918)
            '172.16.',        // Private Class B (RFC1918)
            '172.17.', '172.18.', '172.19.',
            '172.20.', '172.21.', '172.22.', '172.23.',
            '172.24.', '172.25.', '172.26.', '172.27.',
            '172.28.', '172.29.', '172.30.', '172.31.',
            '192.168.',       // Private Class C (RFC1918)
            '169.254.',       // Link-Local
            '0.',             // Current network
            '224.', '225.', '226.', '227.', '228.', '229.', '230.', '231.',
            '232.', '233.', '234.', '235.', '236.', '237.', '238.', '239.', // Multicast
            'localhost',
            '::1',            // IPv6 Loopback
            'fe80:',          // IPv6 Link-Local
            'fc00:',          // IPv6 Unique Local
            'fd00:'           // IPv6 Unique Local
        ];

        // SAFE_DIR erstellen falls nicht existent
        this.initSafeDir();
    }

    async initSafeDir() {
        try {
            await fs.mkdir(this.SAFE_DIR, { recursive: true });
        } catch (error) {
            if (this.logger) {
                this.logger.error('Failed to create SAFE_DIR for flows:', error);
            }
        }
    }

    async processEvent(eventType, eventData) {
        try {
            // Check if flows are globally enabled
            const flowsEnabled = this.db.getSetting('flows_enabled');
            if (flowsEnabled === 'false') {
                return; // Flows are globally disabled
            }

            // Alle aktiven Flows abrufen
            const flows = this.db.getEnabledFlows();

            // Flows filtern nach passendem Trigger-Typ
            const matchingFlows = flows.filter(flow => flow.trigger_type === eventType);

            if (matchingFlows.length === 0) {
                return; // Keine Flows für diesen Event-Typ
            }

            // Flows durchgehen und Conditions prüfen
            for (const flow of matchingFlows) {
                const conditionMet = this.evaluateCondition(flow.trigger_condition, eventData);

                if (conditionMet) {
                    console.log(`⚡ Flow triggered: "${flow.name}"`);
                    await this.executeFlow(flow, eventData);
                }
            }

        } catch (error) {
            if (this.logger) {
                this.logger.error('❌ Flow processing error:', error.message);
            }
        }
    }

    evaluateCondition(condition, eventData) {
        // Wenn keine Condition, immer true
        if (!condition) {
            return true;
        }

        const { operator, field, value } = condition;

        // Feld-Wert aus Event-Daten holen
        let fieldValue = this.getNestedValue(eventData, field);

        // Special handling for SuperFan level
        if (field === 'superfan_level' || field === 'superFanLevel') {
            if (eventData.isSuperFan || eventData.superFan) {
                fieldValue = eventData.superFanLevel || 1;
            } else if (eventData.badges && Array.isArray(eventData.badges)) {
                const superFanBadge = eventData.badges.find(b => 
                    b.type === 'superfan' || b.name?.toLowerCase().includes('superfan')
                );
                fieldValue = superFanBadge ? (superFanBadge.level || 1) : 0;
            } else {
                fieldValue = 0;
            }
        }

        // Special handling for gift type/name
        if (field === 'gift_type' || field === 'giftType') {
            fieldValue = eventData.giftName || eventData.giftType || '';
        }

        // Special handling for gift value/coins
        if (field === 'gift_value' || field === 'giftValue') {
            fieldValue = eventData.coins || eventData.giftValue || 0;
        }

        // Operator auswerten
        switch (operator) {
            case '==':
            case 'equals':
                return fieldValue == value;

            case '!=':
            case 'not_equals':
                return fieldValue != value;

            case '>':
            case 'greater_than':
                return Number(fieldValue) > Number(value);

            case '<':
            case 'less_than':
                return Number(fieldValue) < Number(value);

            case '>=':
            case 'greater_or_equal':
                return Number(fieldValue) >= Number(value);

            case '<=':
            case 'less_or_equal':
                return Number(fieldValue) <= Number(value);

            case 'contains':
                return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());

            case 'not_contains':
                return !String(fieldValue).toLowerCase().includes(String(value).toLowerCase());

            case 'starts_with':
                return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());

            case 'ends_with':
                return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());

            default:
                console.warn(`⚠️ Unknown operator: ${operator}`);
                return false;
        }
    }

    getNestedValue(obj, path) {
        // Unterstützt verschachtelte Pfade wie "user.name" oder "gift.coins"
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    async executeFlow(flow, eventData) {
        try {
            // Actions sequenziell ausführen
            for (const action of flow.actions) {
                await this.executeAction(action, eventData);
            }
        } catch (error) {
            console.error(`❌ Flow execution error (${flow.name}):`, error.message);
        }
    }

    async executeAction(action, eventData) {
        try {
            switch (action.type) {

                // ========== ALERT ==========
                case 'alert':
                case 'show_alert': {
                    const alertConfig = {
                        text_template: action.text || '',
                        sound_file: action.sound_file || null,
                        sound_volume: action.volume || 80,
                        duration: action.duration || 5,
                        enabled: true
                    };
                    this.alertManager.addAlert(action.alert_type || 'custom', eventData, alertConfig);
                    break;
                }

                // ========== SOUND ==========
                case 'sound':
                case 'play_sound': {
                    // Sound-Datei an Frontend senden
                    const soundFile = action.file;
                    const volume = action.volume || 80;
                    // Hier könnte man die Sound-Datei laden und als Base64 senden
                    // Für jetzt senden wir nur den Dateinamen
                    if (this.logger) {
                        this.logger.info(`🔊 Playing sound: ${soundFile} (${volume}%)`);
                    }
                    break;
                }

                // ========== WEBHOOK ==========
                case 'webhook':
                case 'http_request': {
                    const url = action.url;
                    const method = action.method || 'POST';
                    const body = action.body ? this.replaceVariables(JSON.stringify(action.body), eventData) : null;

                    // SSRF-Protection: URL validieren
                    try {
                        const urlObj = new URL(url);

                        // Prüfe erlaubte Domains (strikte Subdomain-Validierung)
                        let isAllowedDomain = false;
                        for (const domain of this.ALLOWED_WEBHOOK_DOMAINS) {
                            if (urlObj.hostname === domain) {
                                isAllowedDomain = true;
                                break;
                            }
                            // Erlaube nur direkte Subdomains von vertrauenswürdigen Domains
                            // webhook.site erlaubt, evil.webhook.site NICHT
                            const parts = urlObj.hostname.split('.');
                            const domainParts = domain.split('.');
                            if (parts.length === domainParts.length + 1 &&
                                urlObj.hostname.endsWith('.' + domain)) {
                                isAllowedDomain = true;
                                break;
                            }
                        }

                        if (!isAllowedDomain) {
                            const error = `Webhook URL not in whitelist: ${urlObj.hostname}`;
                            if (this.logger) {
                                this.logger.warn(error);
                            } else {
                                console.warn(`⚠️ ${error}`);
                            }
                            throw new Error(error);
                        }

                        // DNS-Auflösung und IP-Validierung
                        try {
                            const addresses = await dns.resolve4(urlObj.hostname).catch(() => []);
                            const addresses6 = await dns.resolve6(urlObj.hostname).catch(() => []);
                            const allAddresses = [...addresses, ...addresses6];

                            // Prüfe jede aufgelöste IP gegen Blacklist
                            for (const ip of allAddresses) {
                                const isBlocked = this.BLOCKED_IP_PATTERNS.some(pattern =>
                                    ip.toLowerCase().startsWith(pattern.toLowerCase())
                                );

                                if (isBlocked) {
                                    const error = `Webhook resolves to blocked IP: ${ip} (${urlObj.hostname})`;
                                    if (this.logger) {
                                        this.logger.warn(error);
                                    } else {
                                        console.warn(`⚠️ ${error}`);
                                    }
                                    throw new Error(error);
                                }
                            }
                        } catch (dnsError) {
                            // DNS-Fehler loggen, aber Request erlauben wenn Domain whitelisted ist
                            if (this.logger) {
                                this.logger.warn(`DNS resolution failed for ${urlObj.hostname}: ${dnsError.message}`);
                            }
                        }

                        // Prüfe auch direkt IP-basierte URLs
                        const isDirectIP = this.BLOCKED_IP_PATTERNS.some(pattern =>
                            urlObj.hostname.startsWith(pattern)
                        );

                        if (isDirectIP) {
                            const error = `Webhook to internal network blocked: ${urlObj.hostname}`;
                            if (this.logger) {
                                this.logger.warn(error);
                            } else {
                                console.warn(`⚠️ ${error}`);
                            }
                            throw new Error(error);
                        }

                        // URL ist sicher, request ausführen
                        const response = await axios({
                            method: method,
                            url: url,
                            data: body ? JSON.parse(body) : eventData,
                            headers: {
                                'Content-Type': 'application/json',
                                ...(action.headers || {})
                            },
                            timeout: 5000
                        });

                        if (this.logger) {
                            this.logger.info(`🌐 Webhook sent to ${url}: ${response.status}`);
                        }
                    } catch (error) {
                        if (this.logger) {
                            this.logger.error('Webhook error:', error);
                        } else {
                            if (this.logger) {
                                this.logger.error(`❌ Webhook error: ${error.message}`);
                            }
                        }
                    }
                    break;
                }

                // ========== WRITE FILE ==========
                case 'write_file':
                case 'log_to_file': {
                    const filePath = action.file_path;
                    const content = this.replaceVariables(action.content, eventData);
                    const append = action.append !== false; // Default: append

                    // Path-Traversal-Schutz: Nur Filename extrahieren
                    const sanitizedFilename = path.basename(filePath);

                    // Sicheren Pfad erstellen (nur innerhalb SAFE_DIR)
                    const safePath = path.join(this.SAFE_DIR, sanitizedFilename);

                    // Doppelte Prüfung: safePath muss mit SAFE_DIR beginnen
                    if (!safePath.startsWith(this.SAFE_DIR)) {
                        const error = `Path traversal attempt detected: ${filePath}`;
                        if (this.logger) {
                            this.logger.warn(error);
                        } else {
                            console.warn(`⚠️ ${error}`);
                        }
                        throw new Error(error);
                    }

                    // Datei schreiben
                    try {
                        if (append) {
                            await fs.appendFile(safePath, content + '\n', 'utf8');
                        } else {
                            await fs.writeFile(safePath, content, 'utf8');
                        }

                        if (this.logger) {
                            this.logger.info(`📝 Written to file: ${sanitizedFilename} (in ${this.SAFE_DIR})`);
                        }
                    } catch (error) {
                        if (this.logger) {
                            this.logger.error('File write error:', error);
                        } else {
                            if (this.logger) {
                                this.logger.error(`❌ File write error: ${error.message}`);
                            }
                        }
                    }
                    break;
                }

                // ========== DELAY ==========
                case 'delay':
                case 'wait': {
                    const duration = action.duration || 1000;
                    await new Promise(resolve => setTimeout(resolve, duration));
                    if (this.logger) {
                        this.logger.info(`⏱️ Delayed ${duration}ms`);
                    }
                    break;
                }

                // ========== COMMAND ==========
                case 'command':
                case 'run_command': {
                    // Sicherheitswarnung: Befehle ausführen kann gefährlich sein
                    if (this.logger) {
                        this.logger.warn('⚠️ Command execution is disabled for security reasons');
                    }
                    // const { exec } = require('child_process');
                    // exec(action.command, (error, stdout, stderr) => {
                    //     if (error) console.error(`Command error: ${error}`);
                    // });
                    break;
                }

                // ========== CUSTOM ==========
                case 'custom': {
                    if (this.logger) {
                        this.logger.info(`⚙️ Custom action: ${action.name || 'unnamed'}`);
                    }
                    // Hier könnten Custom-Actions implementiert werden
                    break;
                }

                // ========== PATCH: VDO.NINJA ACTIONS ==========
                case 'vdoninja_mute_guest': {
                    if (!this.vdoninjaManager) {
                        if (this.logger) {
                            this.logger.warn('⚠️ VDO.Ninja Manager not available');
                        }
                        break;
                    }
                    const slot = parseInt(action.guest_slot || action.target);
                    const muteAudio = action.mute_audio !== false;
                    const muteVideo = action.mute_video || false;

                    await this.vdoninjaManager.muteGuest(slot, muteAudio, muteVideo);
                    if (this.logger) {
                        this.logger.info(`🔇 VDO.Ninja: Guest ${slot} muted (Flow) - audio: ${muteAudio}, video: ${muteVideo}`);
                    }
                    break;
                }

                case 'vdoninja_unmute_guest': {
                    if (!this.vdoninjaManager) {
                        if (this.logger) {
                            this.logger.warn('⚠️ VDO.Ninja Manager not available');
                        }
                        break;
                    }
                    const slot = parseInt(action.guest_slot || action.target);
                    const unmuteAudio = action.unmute_audio !== false;
                    const unmuteVideo = action.unmute_video || false;

                    await this.vdoninjaManager.unmuteGuest(slot, unmuteAudio, unmuteVideo);
                    console.log(`🔊 VDO.Ninja: Guest ${slot} unmuted (Flow) - audio: ${unmuteAudio}, video: ${unmuteVideo}`);
                    break;
                }

                case 'vdoninja_solo_guest': {
                    if (!this.vdoninjaManager) {
                        if (this.logger) {
                            this.logger.warn('⚠️ VDO.Ninja Manager not available');
                        }
                        break;
                    }
                    const slot = parseInt(action.guest_slot);
                    const duration = action.duration || 10000;

                    await this.vdoninjaManager.soloGuest(slot, duration);
                    console.log(`⭐ VDO.Ninja: Guest ${slot} solo for ${duration}ms (Flow)`);
                    break;
                }

                case 'vdoninja_change_layout': {
                    if (!this.vdoninjaManager) {
                        if (this.logger) {
                            this.logger.warn('⚠️ VDO.Ninja Manager not available');
                        }
                        break;
                    }
                    const layout = action.layout_name || action.layout;
                    const transition = action.transition || 'fade';

                    await this.vdoninjaManager.changeLayout(layout, transition);
                    console.log(`🎨 VDO.Ninja: Layout changed to ${layout} (Flow)`);
                    break;
                }

                case 'vdoninja_set_volume': {
                    if (!this.vdoninjaManager) {
                        if (this.logger) {
                            this.logger.warn('⚠️ VDO.Ninja Manager not available');
                        }
                        break;
                    }
                    const slot = parseInt(action.guest_slot);
                    const volume = parseFloat(action.volume) || 1.0;

                    await this.vdoninjaManager.setGuestVolume(slot, volume);
                    console.log(`🔊 VDO.Ninja: Guest ${slot} volume set to ${volume} (Flow)`);
                    break;
                }

                case 'vdoninja_kick_guest': {
                    if (!this.vdoninjaManager) {
                        if (this.logger) {
                            this.logger.warn('⚠️ VDO.Ninja Manager not available');
                        }
                        break;
                    }
                    const slot = parseInt(action.guest_slot);
                    const reason = action.reason || 'Kicked by automation';

                    await this.vdoninjaManager.kickGuest(slot, reason);
                    console.log(`❌ VDO.Ninja: Guest ${slot} kicked (Flow) - reason: ${reason}`);
                    break;
                }

                // ========== OSC-BRIDGE ACTIONS ==========
                case 'osc_send': {
                    if (!this.oscBridge) {
                        console.warn('⚠️ OSC-Bridge not available (Plugin disabled or not installed)');
                        break;
                    }
                    const address = action.address || action.osc_address;
                    const args = action.args || action.osc_args || [];

                    // Variablen in Adresse und Args ersetzen
                    const resolvedAddress = this.replaceVariables(address, eventData);
                    const resolvedArgs = Array.isArray(args)
                        ? args.map(arg => {
                            if (typeof arg === 'string') {
                                return this.replaceVariables(arg, eventData);
                            }
                            return arg;
                        })
                        : [args];

                    this.oscBridge.send(resolvedAddress, ...resolvedArgs);
                    console.log(`📡 OSC: Sent ${resolvedAddress} ${JSON.stringify(resolvedArgs)} (Flow)`);
                    break;
                }

                case 'osc_vrchat_wave': {
                    if (!this.oscBridge) {
                        console.warn('⚠️ OSC-Bridge not available');
                        break;
                    }
                    const duration = action.duration || 2000;
                    this.oscBridge.wave(duration);
                    console.log(`📡 OSC VRChat: Wave triggered (Flow)`);
                    break;
                }

                case 'osc_vrchat_celebrate': {
                    if (!this.oscBridge) {
                        console.warn('⚠️ OSC-Bridge not available');
                        break;
                    }
                    const duration = action.duration || 3000;
                    this.oscBridge.celebrate(duration);
                    console.log(`📡 OSC VRChat: Celebrate triggered (Flow)`);
                    break;
                }

                case 'osc_vrchat_dance': {
                    if (!this.oscBridge) {
                        console.warn('⚠️ OSC-Bridge not available');
                        break;
                    }
                    const duration = action.duration || 5000;
                    this.oscBridge.dance(duration);
                    console.log(`📡 OSC VRChat: Dance triggered (Flow)`);
                    break;
                }

                case 'osc_vrchat_hearts': {
                    if (!this.oscBridge) {
                        console.warn('⚠️ OSC-Bridge not available');
                        break;
                    }
                    const duration = action.duration || 2000;
                    this.oscBridge.hearts(duration);
                    console.log(`📡 OSC VRChat: Hearts triggered (Flow)`);
                    break;
                }

                case 'osc_vrchat_confetti': {
                    if (!this.oscBridge) {
                        console.warn('⚠️ OSC-Bridge not available');
                        break;
                    }
                    const duration = action.duration || 3000;
                    this.oscBridge.confetti(duration);
                    console.log(`📡 OSC VRChat: Confetti triggered (Flow)`);
                    break;
                }

                case 'osc_vrchat_emote': {
                    if (!this.oscBridge) {
                        console.warn('⚠️ OSC-Bridge not available');
                        break;
                    }
                    const slot = parseInt(action.emote_slot || action.slot || 0);
                    const duration = action.duration || 2000;
                    this.oscBridge.triggerEmote(slot, duration);
                    console.log(`📡 OSC VRChat: Emote ${slot} triggered (Flow)`);
                    break;
                }

                case 'osc_vrchat_parameter': {
                    if (!this.oscBridge) {
                        console.warn('⚠️ OSC-Bridge not available');
                        break;
                    }
                    const paramName = action.parameter_name || action.param;
                    const value = action.value !== undefined ? action.value : 1;
                    const duration = action.duration || 1000;

                    this.oscBridge.triggerAvatarParameter(paramName, value, duration);
                    console.log(`📡 OSC VRChat: Parameter ${paramName}=${value} triggered (Flow)`);
                    break;
                }

                // ========== EMOJI RAIN ACTIONS ==========
                case 'emoji_rain_trigger':
                case 'trigger_emoji_rain': {
                    const emoji = action.emoji ? this.replaceVariables(action.emoji, eventData) : null;
                    const count = action.count || 10;
                    const duration = action.duration || 0;
                    const intensity = action.intensity || 1.0;
                    const burst = action.burst || false;

                    try {
                        const response = await axios({
                            method: 'POST',
                            url: 'http://localhost:3000/api/emoji-rain/trigger',
                            data: {
                                emoji: emoji,
                                count: count,
                                duration: duration,
                                intensity: intensity,
                                username: eventData.username || eventData.uniqueId || null,
                                burst: burst
                            },
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            timeout: 5000
                        });

                        if (this.logger) {
                            this.logger.info(`🌧️ Emoji Rain triggered: ${count}x ${emoji || 'random'} (Flow)`);
                        }
                    } catch (error) {
                        if (this.logger) {
                            this.logger.error('Emoji Rain trigger error:', error);
                        }
                    }
                    break;
                }

                default:
                    console.warn(`⚠️ Unknown action type: ${action.type}`);
            }

        } catch (error) {
            console.error(`❌ Action execution error (${action.type}):`, error.message);
        }
    }

    replaceVariables(text, eventData) {
        if (!text) return '';

        // Build variables object with fallbacks
        const variables = {
            username: eventData.username || eventData.uniqueId || eventData.nickname || 'Viewer',
            nickname: eventData.nickname || eventData.username || eventData.uniqueId || 'Viewer',
            message: eventData.message || '',
            gift_name: eventData.giftName || '',
            giftName: eventData.giftName || '',
            coins: eventData.coins || 0,
            repeat_count: eventData.repeatCount || 1,
            repeatCount: eventData.repeatCount || 1,
            like_count: eventData.likeCount || 1,
            likeCount: eventData.likeCount || 1,
            total_coins: eventData.totalCoins || 0,
            totalCoins: eventData.totalCoins || 0,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString()
        };

        // Use template engine with RegExp caching
        return templateEngine.render(text, variables);
    }

    // Test-Funktion
    async testFlow(flowId, testEventData = {}) {
        const flow = this.db.getFlow(flowId);
        if (!flow) {
            throw new Error(`Flow with ID ${flowId} not found`);
        }

        console.log(`🧪 Testing flow: "${flow.name}"`);

        const defaultData = {
            username: 'TestUser',
            nickname: 'Test User',
            message: 'Test message',
            giftName: 'Rose',
            coins: 100,
            repeatCount: 5
        };

        const eventData = { ...defaultData, ...testEventData };
        await this.executeFlow(flow, eventData);
    }
}

module.exports = FlowEngine;
