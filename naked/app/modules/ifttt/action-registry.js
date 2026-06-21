/**
 * IFTTT Action Registry
 * Central registry for all available actions in the automation system
 */

const dns = require('dns').promises;

// Constants
const VRCHAT_EMOTE_SLOT_MIN = 0;
const VRCHAT_EMOTE_SLOT_MAX = 7;

// Default allowed webhook domains (SSRF protection)
const DEFAULT_ALLOWED_WEBHOOK_DOMAINS = [
    'webhook.site',
    'discord.com',
    'zapier.com',
    'ifttt.com',
    'make.com',
    'integromat.com'
];

// Blocked IP prefixes (RFC1918, loopback, link-local, multicast, IPv6 private)
const BLOCKED_IP_PATTERNS = [
    '127.',
    '10.',
    '172.16.', '172.17.', '172.18.', '172.19.',
    '172.20.', '172.21.', '172.22.', '172.23.',
    '172.24.', '172.25.', '172.26.', '172.27.',
    '172.28.', '172.29.', '172.30.', '172.31.',
    '192.168.',
    '169.254.',
    '0.',
    '224.', '225.', '226.', '227.', '228.', '229.', '230.', '231.',
    '232.', '233.', '234.', '235.', '236.', '237.', '238.', '239.',
    'localhost',
    '::1',
    'fe80:',
    'fc00:',
    'fd00:'
];

// Blocked IP prefixes pre-lowercased for efficient matching
const BLOCKED_IP_PATTERNS_LOWER = BLOCKED_IP_PATTERNS.map(p => p.toLowerCase());

/**
 * Validate a webhook URL against SSRF protections.
 * @param {string} url - URL to validate
 * @param {string[]} allowedDomains - Whitelisted domains
 * @throws {Error} if URL is blocked
 */
async function validateWebhookUrl(url, allowedDomains) {
    const urlObj = new URL(url);
    const hostLower = urlObj.hostname.toLowerCase();

    // Block direct IP-based URLs
    const isDirectIP = BLOCKED_IP_PATTERNS_LOWER.some(p => hostLower.startsWith(p));
    if (isDirectIP) {
        throw new Error(`Webhook to internal network blocked: ${urlObj.hostname}`);
    }

    // Domain whitelist check (exact match or direct subdomain)
    let isAllowedDomain = false;
    for (const domain of allowedDomains) {
        if (urlObj.hostname === domain) {
            isAllowedDomain = true;
            break;
        }
        const parts = urlObj.hostname.split('.');
        const domainParts = domain.split('.');
        if (parts.length === domainParts.length + 1 && urlObj.hostname.endsWith('.' + domain)) {
            isAllowedDomain = true;
            break;
        }
    }

    if (!isAllowedDomain) {
        throw new Error(`Webhook URL not in whitelist: ${urlObj.hostname}`);
    }

    // DNS resolution check against IP blacklist
    try {
        const v4 = await dns.resolve4(urlObj.hostname).catch(() => []);
        const v6 = await dns.resolve6(urlObj.hostname).catch(() => []);
        for (const ip of [...v4, ...v6]) {
            const ipLower = ip.toLowerCase();
            if (BLOCKED_IP_PATTERNS_LOWER.some(p => ipLower.startsWith(p))) {
                throw new Error(`Webhook resolves to blocked IP: ${ip} (${urlObj.hostname})`);
            }
        }
    } catch (dnsError) {
        // Re-throw blocked-IP errors; ignore plain DNS lookup failures for whitelisted domains
        if (dnsError.message.startsWith('Webhook resolves to blocked IP')) {
            throw dnsError;
        }
    }
}

class ActionRegistry {
    constructor(logger) {
        this.logger = logger;
        this.actions = new Map();
        this.registerCoreActions();
    }

    /**
     * Register an action
     * @param {string} id - Unique action ID
     * @param {Object} config - Action configuration
     */
    register(id, config) {
        if (this.actions.has(id)) {
            this.logger?.warn(`Action ${id} already registered, overwriting`);
        }

        const action = {
            id,
            name: config.name || id,
            description: config.description || '',
            category: config.category || 'custom',
            icon: config.icon || 'play',
            fields: config.fields || [],
            executor: config.executor,
            metadata: config.metadata || {}
        };

        this.actions.set(id, action);
        this.logger?.info(`✅ Registered action: ${id}`);
    }

    /**
     * Unregister an action
     */
    unregister(id) {
        if (this.actions.has(id)) {
            this.actions.delete(id);
            this.logger?.info(`Unregistered action: ${id}`);
            return true;
        }
        return false;
    }

    /**
     * Get action configuration
     */
    get(id) {
        return this.actions.get(id);
    }

    /**
     * Get all actions
     */
    getAll() {
        return Array.from(this.actions.values());
    }

    /**
     * Get all actions for frontend (without executor functions)
     */
    getAllForFrontend() {
        return Array.from(this.actions.values()).map(action => {
            const { executor, ...actionWithoutExecutor } = action;
            return actionWithoutExecutor;
        });
    }

    /**
     * Get actions by category
     */
    getByCategory(category) {
        return Array.from(this.actions.values()).filter(a => a.category === category);
    }

    /**
     * Check if action exists
     */
    has(id) {
        return this.actions.has(id);
    }

    /**
     * Execute an action
     */
    async execute(actionDef, context, services) {
        const action = this.actions.get(actionDef.type);
        if (!action) {
            this.logger?.warn(`Unknown action type: ${actionDef.type}`);
            return { success: false, error: 'Unknown action type' };
        }

        if (!action.executor) {
            this.logger?.warn(`Action ${actionDef.type} has no executor`);
            return { success: false, error: 'No executor defined' };
        }

        try {
            const result = await action.executor(actionDef, context, services);
            return { success: true, result };
        } catch (error) {
            this.logger?.error(`Action ${actionDef.type} failed:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Register core actions
     */
    registerCoreActions() {
        // TTS Actions
        this.register('tts:speak', {
            name: 'Speak Text (TTS)',
            description: 'Use text-to-speech to speak a message',
            category: 'tts',
            icon: 'mic',
            fields: [
                { name: 'text', label: 'Text to Speak', type: 'textarea', required: true },
                { name: 'voice', label: 'Voice', type: 'select', options: [] },
                { name: 'volume', label: 'Volume', type: 'range', min: 0, max: 100, default: 80 },
                { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'normal', 'high'], default: 'normal' }
            ],
            executor: async (action, context, services) => {
                const tts = services.tts || services.ttsPlugin;
                if (!tts) {
                    services.logger?.warn('TTS service not available');
                    throw new Error('TTS service not available');
                }
                
                const text = services.templateEngine.render(action.text || '', context.data);
                if (!text || text.trim() === '') {
                    throw new Error('No text provided for TTS');
                }
                
                const ttsOptions = {
                    text: text,
                    voice: action.voice,
                    volume: action.volume || 80,
                    priority: action.priority || 'normal'
                };
                
                services.logger?.info(`🎤 TTS: "${text.substring(0, 50)}..."`);
                
                // Check if TTS has speak method
                if (typeof tts.speak === 'function') {
                    await tts.speak(ttsOptions);
                } else if (typeof tts.addToQueue === 'function') {
                    await tts.addToQueue(ttsOptions);
                } else {
                    throw new Error('TTS service does not have speak or addToQueue method');
                }
            }
        });

        // Alert Actions
        this.register('alert:show', {
            name: 'Show Alert',
            description: 'Display an alert overlay',
            category: 'alert',
            icon: 'bell',
            fields: [
                { name: 'text', label: 'Alert Text', type: 'textarea', required: true },
                { name: 'type', label: 'Alert Type', type: 'select', options: ['info', 'success', 'warning', 'error', 'custom'], default: 'info' },
                { name: 'duration', label: 'Duration (seconds)', type: 'number', min: 1, max: 60, default: 5 },
                { name: 'sound', label: 'Sound File', type: 'file', accept: 'audio/*' },
                { name: 'volume', label: 'Volume', type: 'range', min: 0, max: 100, default: 80 }
            ],
            executor: async (action, context, services) => {
                const alertManager = services.alertManager;
                if (!alertManager) {
                    services.logger?.warn('Alert manager not available');
                    throw new Error('Alert manager not available');
                }
                
                const text = services.templateEngine.render(action.text || '', context.data);
                
                const alertConfig = {
                    text_template: text,
                    sound_file: action.sound || null,
                    sound_volume: action.volume || 80,
                    duration: action.duration || 5,
                    enabled: true
                };
                
                services.logger?.info(`🔔 Alert: "${text.substring(0, 50)}..."`);
                
                if (typeof alertManager.addAlert === 'function') {
                    alertManager.addAlert(action.type || 'custom', context.data, alertConfig);
                } else {
                    throw new Error('Alert manager does not have addAlert method');
                }
            }
        });

        // Sound Actions
        this.register('sound:play', {
            name: 'Play Sound',
            description: 'Play a sound file',
            category: 'audio',
            icon: 'volume-2',
            fields: [
                { name: 'file', label: 'Sound File', type: 'file', accept: 'audio/*', required: true },
                { name: 'volume', label: 'Volume', type: 'range', min: 0, max: 100, default: 80 }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) {
                    services.logger?.warn('Socket.io not available for sound playback');
                    throw new Error('Socket.io not available');
                }
                
                if (!action.file) {
                    throw new Error('Sound file is required');
                }
                
                const soundData = {
                    file: action.file,
                    volume: action.volume || 80
                };
                
                services.logger?.info(`🔊 Sound: ${action.file} (${soundData.volume}%)`);
                io.emit('play_sound', soundData);
            }
        });

        // Overlay Actions
        this.register('overlay:image', {
            name: 'Show Image Overlay',
            description: 'Display an image in the IFTTT HUD overlay. Use the OBS browser source: /ifttt-hud.html',
            category: 'overlay',
            icon: 'image',
            fields: [
                { name: 'url', label: 'Image URL', type: 'text', required: true, placeholder: 'https://example.com/image.png or /uploads/image.png' },
                { name: 'duration', label: 'Duration (seconds)', type: 'number', min: 1, max: 60, default: 5 },
                { name: 'position', label: 'Position', type: 'select', options: ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], default: 'center' },
                { name: 'animation', label: 'Animation', type: 'select', options: ['fade', 'zoom', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'bounce', 'spin', 'none'], default: 'fade' },
                { name: 'width', label: 'Width (px)', type: 'number', min: 50, max: 1920 },
                { name: 'height', label: 'Height (px)', type: 'number', min: 50, max: 1080 }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) {
                    services.logger?.warn('Socket.io not available for image overlay');
                    throw new Error('Socket.io not available');
                }
                
                if (!action.url) {
                    throw new Error('Image URL is required');
                }
                
                const overlayData = {
                    type: 'image',
                    url: action.url,
                    duration: action.duration || 5,
                    position: action.position || 'center',
                    animation: action.animation || 'fade',
                    width: action.width,
                    height: action.height
                };
                
                services.logger?.info(`🖼️ Image Overlay: ${action.url.substring(0, 50)}...`);
                io.emit('overlay:image', overlayData);
            }
        });

        this.register('overlay:video', {
            name: 'Show Video/MP4 Overlay',
            description: 'Display a video/MP4 in the IFTTT HUD overlay. Use the OBS browser source: /ifttt-hud.html',
            category: 'overlay',
            icon: 'video',
            fields: [
                { name: 'url', label: 'Video URL', type: 'text', required: true, placeholder: 'https://example.com/video.mp4 or /uploads/video.mp4' },
                { name: 'duration', label: 'Max Duration (seconds)', type: 'number', min: 1, max: 60, default: 10, help: 'Video will stop after this duration even if not finished' },
                { name: 'position', label: 'Position', type: 'select', options: ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], default: 'center' },
                { name: 'animation', label: 'Animation', type: 'select', options: ['fade', 'zoom', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'bounce', 'none'], default: 'fade' },
                { name: 'volume', label: 'Volume (%)', type: 'range', min: 0, max: 100, default: 80 },
                { name: 'loop', label: 'Loop Video', type: 'checkbox', default: false },
                { name: 'width', label: 'Width (px)', type: 'number', min: 50, max: 1920 },
                { name: 'height', label: 'Height (px)', type: 'number', min: 50, max: 1080 }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) {
                    services.logger?.warn('Socket.io not available for video overlay');
                    throw new Error('Socket.io not available');
                }
                
                if (!action.url) {
                    throw new Error('Video URL is required');
                }
                
                const overlayData = {
                    type: 'video',
                    url: action.url,
                    duration: action.duration || 10,
                    position: action.position || 'center',
                    animation: action.animation || 'fade',
                    volume: action.volume !== undefined ? action.volume : 80,
                    loop: action.loop || false,
                    width: action.width,
                    height: action.height
                };
                
                services.logger?.info(`🎬 Video Overlay: ${action.url.substring(0, 50)}... (vol: ${overlayData.volume}%)`);
                io.emit('overlay:video', overlayData);
            }
        });

        this.register('overlay:text', {
            name: 'Show Text Overlay',
            description: 'Display text in the IFTTT HUD overlay. Use the OBS browser source: /ifttt-hud.html',
            category: 'overlay',
            icon: 'type',
            fields: [
                { name: 'text', label: 'Text', type: 'textarea', required: true, placeholder: 'Use {{username}} for viewer name, {{giftName}} for gift, etc.' },
                { name: 'duration', label: 'Duration (seconds)', type: 'number', min: 1, max: 60, default: 5 },
                { name: 'position', label: 'Position', type: 'select', options: ['center', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], default: 'center' },
                { name: 'animation', label: 'Animation', type: 'select', options: ['fade', 'zoom', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'bounce', 'none'], default: 'fade' },
                { name: 'fontSize', label: 'Font Size', type: 'number', min: 12, max: 200, default: 48 },
                { name: 'color', label: 'Text Color', type: 'color', default: '#ffffff' },
                { name: 'backgroundColor', label: 'Background Color', type: 'text', default: 'rgba(0, 0, 0, 0.7)', placeholder: 'rgba(0, 0, 0, 0.7) or #000000' }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) {
                    services.logger?.warn('Socket.io not available for text overlay');
                    throw new Error('Socket.io not available');
                }
                
                const text = services.templateEngine.render(action.text || '', context.data);
                if (!text || text.trim() === '') {
                    throw new Error('Text is required for overlay');
                }
                
                const overlayData = {
                    type: 'text',
                    text: text,
                    duration: action.duration || 5,
                    position: action.position || 'center',
                    animation: action.animation || 'fade',
                    fontSize: action.fontSize || 48,
                    color: action.color || '#ffffff',
                    backgroundColor: action.backgroundColor || 'rgba(0, 0, 0, 0.7)'
                };
                
                services.logger?.info(`📝 Text Overlay: "${text.substring(0, 50)}..."`);
                io.emit('overlay:text', overlayData);
            }
        });

        this.register('overlay:clear', {
            name: 'Clear All Overlays',
            description: 'Remove all active overlays from the IFTTT HUD',
            category: 'overlay',
            icon: 'x-circle',
            fields: [],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) {
                    services.logger?.warn('Socket.io not available for clearing overlays');
                    throw new Error('Socket.io not available');
                }
                
                services.logger?.info('🧹 Clearing all overlays');
                io.emit('overlay:clear');
            }
        });

        // Emoji Rain Actions
        this.register('emojirain:trigger', {
            name: 'Trigger Emoji Rain',
            description: 'Start emoji rain effect',
            category: 'overlay',
            icon: 'cloud-rain',
            fields: [
                { name: 'emoji', label: 'Emoji', type: 'text', placeholder: '🎉' },
                { name: 'count', label: 'Count', type: 'number', min: 1, max: 100, default: 10 },
                { name: 'duration', label: 'Duration (ms)', type: 'number', min: 0, max: 30000, default: 0 },
                { name: 'intensity', label: 'Intensity', type: 'range', min: 0.1, max: 5, step: 0.1, default: 1.0 },
                { name: 'burst', label: 'Burst Mode', type: 'checkbox', default: false }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) {
                    services.logger?.warn('Socket.io not available for emoji rain');
                    throw new Error('Socket.io not available');
                }
                
                const emojiData = {
                    emoji: action.emoji || null,
                    count: action.count || 10,
                    duration: action.duration || 0,
                    intensity: action.intensity || 1.0,
                    username: context.data?.username || context.data?.uniqueId,
                    burst: action.burst || false
                };
                
                services.logger?.info(`🌧️ Emoji Rain: ${emojiData.count}x ${emojiData.emoji || 'random'}`);
                
                io.emit('emoji_rain:trigger', emojiData);
            }
        });

        // Goal Actions
        this.register('goal:update', {
            name: 'Update Goal',
            description: 'Update goal progress',
            category: 'goal',
            icon: 'target',
            fields: [
                { name: 'goalId', label: 'Goal ID', type: 'number', required: true },
                { name: 'operation', label: 'Operation', type: 'select', options: ['add', 'subtract', 'set'], default: 'add' },
                { name: 'value', label: 'Value', type: 'number', required: true }
            ],
            executor: async (action, context, services) => {
                const db = services.db;
                if (!db) {
                    services.logger?.warn('Database not available for goal update');
                    throw new Error('Database not available');
                }
                
                const goalId = action.goalId;
                if (!goalId) {
                    throw new Error('Goal ID is required');
                }
                
                const goal = db.getGoal(goalId);
                if (!goal) {
                    throw new Error(`Goal ${goalId} not found`);
                }
                
                let newValue = goal.current || 0;
                const value = parseFloat(action.value) || 0;
                
                if (action.operation === 'add') {
                    newValue += value;
                } else if (action.operation === 'subtract') {
                    newValue -= value;
                } else if (action.operation === 'set') {
                    newValue = value;
                }
                
                services.logger?.info(`🎯 Goal Update: ${goal.name} ${action.operation} ${value} => ${newValue}`);
                
                db.updateGoal(goalId, { current: newValue });
                
                if (services.io) {
                    services.io.emit('goal:updated', {
                        goalId: goalId,
                        current: newValue,
                        target: goal.target
                    });
                }
                
                return { newValue, goalName: goal.name };
            }
        });

        // Spotlight Actions
        this.register('spotlight:set', {
            name: 'Set Spotlight',
            description: 'Highlight a user in spotlight',
            category: 'overlay',
            icon: 'star',
            fields: [
                { name: 'username', label: 'Username', type: 'text', required: true },
                { name: 'duration', label: 'Duration (seconds)', type: 'number', min: 1, max: 300, default: 10 }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) {
                    services.logger?.warn('Socket.io not available for spotlight');
                    throw new Error('Socket.io not available');
                }
                
                const username = services.templateEngine.render(action.username || '', context.data);
                if (!username || username.trim() === '') {
                    throw new Error('Username is required for spotlight');
                }
                
                const spotlightData = {
                    username: username,
                    duration: action.duration || 10
                };
                
                services.logger?.info(`⭐ Spotlight: ${username} for ${spotlightData.duration}s`);
                io.emit('spotlight:set', spotlightData);
            }
        });

        // Webhook Actions
        this.register('webhook:send', {
            name: 'Send Webhook',
            description: 'Send HTTP request to webhook (allowed domains: webhook.site, discord.com, zapier.com, ifttt.com, make.com, integromat.com)',
            category: 'integration',
            icon: 'send',
            fields: [
                { name: 'url', label: 'Webhook URL', type: 'text', required: true },
                { name: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'], default: 'POST' },
                { name: 'body', label: 'Request Body (JSON)', type: 'textarea' },
                { name: 'headers', label: 'Headers (JSON)', type: 'textarea' }
            ],
            executor: async (action, context, services) => {
                const axios = services.axios || require('axios');
                if (!axios) {
                    services.logger?.warn('HTTP client (axios) not available');
                    throw new Error('HTTP client not available');
                }

                if (!action.url) {
                    throw new Error('Webhook URL is required');
                }

                // Load configurable domain whitelist from DB, fall back to defaults
                let allowedDomains = DEFAULT_ALLOWED_WEBHOOK_DOMAINS;
                if (services.db) {
                    try {
                        const customDomains = services.db.getSetting('webhook_allowed_domains');
                        if (customDomains) {
                            allowedDomains = JSON.parse(customDomains);
                        }
                    } catch (e) {
                        services.logger?.warn('Failed to parse webhook_allowed_domains setting, using defaults');
                    }
                }

                // SSRF protection
                await validateWebhookUrl(action.url, allowedDomains);

                const body = action.body
                    ? JSON.parse(services.templateEngine.render(action.body, context.data))
                    : context.data;
                const headers = action.headers
                    ? JSON.parse(action.headers)
                    : { 'Content-Type': 'application/json' };

                services.logger?.info(`🌐 Webhook: ${action.method || 'POST'} ${action.url}`);

                const response = await axios({
                    method: action.method || 'POST',
                    url: action.url,
                    data: body,
                    headers,
                    timeout: 5000
                });

                services.logger?.info(`✅ Webhook response: ${response.status}`);
                return response.data;
            }
        });

        // Variable Actions
        this.register('variable:set', {
            name: 'Set Variable',
            description: 'Set a custom variable value',
            category: 'logic',
            icon: 'database',
            fields: [
                { name: 'name', label: 'Variable Name', type: 'text', required: true },
                { name: 'value', label: 'Value', type: 'text', required: true },
                { name: 'type', label: 'Type', type: 'select', options: ['string', 'number', 'boolean'], default: 'string' }
            ],
            executor: async (action, context, services) => {
                const variables = services.variables;
                if (!variables) {
                    services.logger?.warn('Variable store not available');
                    throw new Error('Variable store not available');
                }
                
                if (!action.name) {
                    throw new Error('Variable name is required');
                }
                
                let value = services.templateEngine.render(action.value || '', context.data);
                
                if (action.type === 'number') {
                    value = parseFloat(value);
                    if (isNaN(value)) {
                        throw new Error('Invalid number value');
                    }
                } else if (action.type === 'boolean') {
                    value = value.toLowerCase() === 'true' || value === '1';
                }
                
                services.logger?.info(`💾 Variable Set: ${action.name} = ${value}`);
                variables.set(action.name, value);
                
                return { name: action.name, value };
            }
        });

        this.register('variable:increment', {
            name: 'Increment Variable',
            description: 'Increment a numeric variable',
            category: 'logic',
            icon: 'plus',
            fields: [
                { name: 'name', label: 'Variable Name', type: 'text', required: true },
                { name: 'amount', label: 'Amount', type: 'number', default: 1 }
            ],
            executor: async (action, context, services) => {
                const variables = services.variables;
                if (!variables) {
                    services.logger?.warn('Variable store not available');
                    throw new Error('Variable store not available');
                }
                
                if (!action.name) {
                    throw new Error('Variable name is required');
                }
                
                const current = variables.get(action.name) || 0;
                const amount = parseFloat(action.amount) || 1;
                const newValue = current + amount;
                
                services.logger?.info(`➕ Variable Increment: ${action.name} ${current} + ${amount} = ${newValue}`);
                variables.set(action.name, newValue);
                
                return { name: action.name, oldValue: current, newValue };
            }
        });

        // Plugin Actions
        this.register('plugin:trigger', {
            name: 'Trigger Plugin Action',
            description: 'Execute a plugin-specific action',
            category: 'plugin',
            icon: 'puzzle',
            fields: [
                { name: 'pluginId', label: 'Plugin ID', type: 'text', required: true },
                { name: 'action', label: 'Action Name', type: 'text', required: true },
                { name: 'params', label: 'Parameters (JSON)', type: 'textarea' }
            ],
            executor: async (action, context, services) => {
                const pluginLoader = services.pluginLoader;
                if (!pluginLoader) {
                    services.logger?.warn('Plugin loader not available');
                    throw new Error('Plugin loader not available');
                }
                
                if (!action.pluginId) {
                    throw new Error('Plugin ID is required');
                }
                
                if (!action.action) {
                    throw new Error('Action name is required');
                }
                
                const params = action.params 
                    ? JSON.parse(services.templateEngine.render(action.params, context.data)) 
                    : {};
                
                services.logger?.info(`🧩 Plugin: ${action.pluginId}.${action.action}`);
                
                if (typeof pluginLoader.triggerPluginAction === 'function') {
                    await pluginLoader.triggerPluginAction(action.pluginId, action.action, params, context.data);
                } else {
                    throw new Error('Plugin loader does not have triggerPluginAction method');
                }
            }
        });

        // OBS Actions
        this.register('obs:scene', {
            name: 'Switch OBS Scene',
            description: 'Change OBS scene',
            category: 'obs',
            icon: 'video',
            fields: [
                { name: 'sceneName', label: 'Scene Name', type: 'text', required: true }
            ],
            executor: async (action, context, services) => {
                const obs = services.obs;
                if (!obs) {
                    services.logger?.warn('OBS WebSocket not available');
                    throw new Error('OBS WebSocket not available');
                }
                
                const sceneName = services.templateEngine.render(action.sceneName || '', context.data);
                if (!sceneName || sceneName.trim() === '') {
                    throw new Error('Scene name is required');
                }
                
                services.logger?.info(`📹 OBS: Switching to scene "${sceneName}"`);
                
                if (typeof obs.setCurrentProgramScene === 'function') {
                    await obs.setCurrentProgramScene({ sceneName: sceneName });
                } else if (typeof obs.call === 'function') {
                    await obs.call('SetCurrentProgramScene', { sceneName: sceneName });
                } else {
                    throw new Error('OBS WebSocket not connected or incompatible');
                }
                
                return { sceneName };
            }
        });

        // OSC Actions
        this.register('osc:send', {
            name: 'Send OSC Message',
            description: 'Send OSC message (VRChat, etc.)',
            category: 'osc',
            icon: 'radio',
            fields: [
                { name: 'address', label: 'OSC Address', type: 'text', required: true, placeholder: '/avatar/parameters/Wave' },
                { name: 'args', label: 'Arguments (JSON array)', type: 'textarea', placeholder: '[true]' }
            ],
            executor: async (action, context, services) => {
                const osc = services.osc;
                if (!osc) {
                    services.logger?.warn('OSC service not available');
                    throw new Error('OSC service not available');
                }
                
                if (!action.address) {
                    throw new Error('OSC address is required');
                }
                
                const args = action.args ? JSON.parse(action.args) : [];
                
                services.logger?.info(`📡 OSC: ${action.address} ${JSON.stringify(args)}`);
                
                if (typeof osc.send === 'function') {
                    osc.send(action.address, ...args);
                } else {
                    throw new Error('OSC service does not have send method');
                }
            }
        });

        // VRChat OSC Actions
        this.register('osc:vrchat:wave', {
            name: 'VRChat: Wave',
            description: 'Trigger wave gesture in VRChat',
            category: 'osc',
            icon: 'hand',
            fields: [
                { name: 'duration', label: 'Duration (milliseconds)', type: 'number', min: 100, max: 10000, default: 2000 }
            ],
            executor: async (action, context, services) => {
                const osc = services.osc;
                if (!osc) {
                    services.logger?.warn('OSC service not available');
                    throw new Error('OSC service not available');
                }
                
                services.logger?.info('👋 VRChat: Wave');
                
                if (typeof osc.wave === 'function') {
                    osc.wave(action.duration || 2000);
                } else if (typeof osc.send === 'function') {
                    osc.send('/avatar/parameters/Wave', 1);
                    setTimeout(() => osc.send('/avatar/parameters/Wave', 0), action.duration || 2000);
                } else {
                    throw new Error('OSC service not available');
                }
            }
        });

        this.register('osc:vrchat:celebrate', {
            name: 'VRChat: Celebrate',
            description: 'Trigger celebration in VRChat',
            category: 'osc',
            icon: 'party-popper',
            fields: [
                { name: 'duration', label: 'Duration (milliseconds)', type: 'number', min: 100, max: 10000, default: 3000 }
            ],
            executor: async (action, context, services) => {
                const osc = services.osc;
                if (!osc) {
                    services.logger?.warn('OSC service not available');
                    throw new Error('OSC service not available');
                }
                
                services.logger?.info('🎉 VRChat: Celebrate');
                
                if (typeof osc.celebrate === 'function') {
                    osc.celebrate(action.duration || 3000);
                } else if (typeof osc.send === 'function') {
                    osc.send('/avatar/parameters/Celebrate', 1);
                    setTimeout(() => osc.send('/avatar/parameters/Celebrate', 0), action.duration || 3000);
                } else {
                    throw new Error('OSC service not available');
                }
            }
        });

        this.register('osc:vrchat:dance', {
            name: 'VRChat: Dance',
            description: 'Trigger dance animation in VRChat',
            category: 'osc',
            icon: 'music',
            fields: [
                { name: 'duration', label: 'Duration (milliseconds)', type: 'number', min: 100, max: 30000, default: 5000 }
            ],
            executor: async (action, context, services) => {
                const osc = services.osc;
                if (!osc) {
                    services.logger?.warn('OSC service not available');
                    throw new Error('OSC service not available');
                }
                
                services.logger?.info('💃 VRChat: Dance');
                
                if (typeof osc.dance === 'function') {
                    osc.dance(action.duration || 5000);
                } else if (typeof osc.send === 'function') {
                    osc.send('/avatar/parameters/DanceTrigger', 1);
                    setTimeout(() => osc.send('/avatar/parameters/DanceTrigger', 0), action.duration || 5000);
                } else {
                    throw new Error('OSC service not available');
                }
            }
        });

        this.register('osc:vrchat:hearts', {
            name: 'VRChat: Hearts',
            description: 'Trigger hearts effect in VRChat',
            category: 'osc',
            icon: 'heart',
            fields: [
                { name: 'duration', label: 'Duration (milliseconds)', type: 'number', min: 100, max: 10000, default: 2000 }
            ],
            executor: async (action, context, services) => {
                const osc = services.osc;
                if (!osc) {
                    services.logger?.warn('OSC service not available');
                    throw new Error('OSC service not available');
                }
                
                services.logger?.info('❤️ VRChat: Hearts');
                
                if (typeof osc.hearts === 'function') {
                    osc.hearts(action.duration || 2000);
                } else if (typeof osc.send === 'function') {
                    osc.send('/avatar/parameters/Hearts', 1);
                    setTimeout(() => osc.send('/avatar/parameters/Hearts', 0), action.duration || 2000);
                } else {
                    throw new Error('OSC service not available');
                }
            }
        });

        this.register('osc:vrchat:confetti', {
            name: 'VRChat: Confetti',
            description: 'Trigger confetti effect in VRChat',
            category: 'osc',
            icon: 'sparkles',
            fields: [
                { name: 'duration', label: 'Duration (milliseconds)', type: 'number', min: 100, max: 10000, default: 3000 }
            ],
            executor: async (action, context, services) => {
                const osc = services.osc;
                if (!osc) {
                    services.logger?.warn('OSC service not available');
                    throw new Error('OSC service not available');
                }
                
                services.logger?.info('🎊 VRChat: Confetti');
                
                if (typeof osc.confetti === 'function') {
                    osc.confetti(action.duration || 3000);
                } else if (typeof osc.send === 'function') {
                    osc.send('/avatar/parameters/Confetti', 1);
                    setTimeout(() => osc.send('/avatar/parameters/Confetti', 0), action.duration || 3000);
                } else {
                    throw new Error('OSC service not available');
                }
            }
        });

        this.register('osc:vrchat:emote', {
            name: 'VRChat: Trigger Emote',
            description: 'Trigger a specific emote slot in VRChat',
            category: 'osc',
            icon: 'smile',
            fields: [
                { name: 'slot', label: `Emote Slot (${VRCHAT_EMOTE_SLOT_MIN}-${VRCHAT_EMOTE_SLOT_MAX})`, type: 'number', min: VRCHAT_EMOTE_SLOT_MIN, max: VRCHAT_EMOTE_SLOT_MAX, default: 0, required: true },
                { name: 'duration', label: 'Duration (milliseconds)', type: 'number', min: 100, max: 10000, default: 2000 }
            ],
            executor: async (action, context, services) => {
                const osc = services.osc;
                if (!osc) {
                    services.logger?.warn('OSC service not available');
                    throw new Error('OSC service not available');
                }
                
                const slot = action.slot || 0;
                if (slot < VRCHAT_EMOTE_SLOT_MIN || slot > VRCHAT_EMOTE_SLOT_MAX) {
                    throw new Error(`Emote slot must be between ${VRCHAT_EMOTE_SLOT_MIN} and ${VRCHAT_EMOTE_SLOT_MAX}`);
                }
                
                services.logger?.info(`😀 VRChat: Emote Slot ${slot}`);
                
                if (typeof osc.triggerEmote === 'function') {
                    osc.triggerEmote(slot, action.duration || 2000);
                } else if (typeof osc.send === 'function') {
                    osc.send(`/avatar/parameters/EmoteSlot${slot}`, 1);
                    setTimeout(() => osc.send(`/avatar/parameters/EmoteSlot${slot}`, 0), action.duration || 2000);
                } else {
                    throw new Error('OSC service not available');
                }
            }
        });

        this.register('osc:vrchat:avatar', {
            name: 'VRChat: Switch Avatar',
            description: 'Switch to a different avatar in VRChat',
            category: 'osc',
            icon: 'user',
            fields: [
                { name: 'avatarId', label: 'Avatar ID', type: 'text', required: true, placeholder: 'avtr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
                { name: 'avatarName', label: 'Avatar Name (optional)', type: 'text', placeholder: 'My Avatar' }
            ],
            executor: async (action, context, services) => {
                const osc = services.osc;
                if (!osc) {
                    services.logger?.warn('OSC service not available');
                    throw new Error('OSC service not available');
                }
                
                if (!action.avatarId) {
                    throw new Error('Avatar ID is required. Format: avtr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
                }

                if (!action.avatarId.startsWith('avtr_')) {
                    services.logger?.warn(`Avatar ID should start with "avtr_", got: ${action.avatarId}`);
                }
                
                services.logger?.info(`👤 VRChat: Switching to avatar ${action.avatarName || action.avatarId}`);
                
                if (typeof osc.switchAvatar === 'function') {
                    osc.switchAvatar(action.avatarId, action.avatarName);
                } else if (typeof osc.send === 'function') {
                    osc.send('/avatar/change', action.avatarId);
                } else {
                    throw new Error('OSC service not available');
                }
            }
        });


        // Delay Action
        this.register('delay:wait', {
            name: 'Wait/Delay',
            description: 'Wait for a specified duration',
            category: 'logic',
            icon: 'clock',
            fields: [
                { name: 'duration', label: 'Duration (milliseconds)', type: 'number', min: 100, max: 60000, default: 1000 }
            ],
            executor: async (action, context, services) => {
                const duration = action.duration || 1000;
                services.logger?.info(`⏱️ Delay: ${duration}ms`);
                await new Promise(resolve => setTimeout(resolve, duration));
            }
        });

        // Flow Control Actions
        this.register('flow:trigger', {
            name: 'Trigger Another Flow',
            description: 'Trigger another automation flow',
            category: 'logic',
            icon: 'git-branch',
            fields: [
                { name: 'flowId', label: 'Flow ID', type: 'number', required: true },
                { name: 'passContext', label: 'Pass Context', type: 'checkbox', default: true }
            ],
            executor: async (action, context, services) => {
                const iftttEngine = services.iftttEngine;
                if (!iftttEngine) {
                    services.logger?.warn('IFTTT engine not available');
                    throw new Error('IFTTT engine not available');
                }
                
                if (!action.flowId) {
                    throw new Error('Flow ID is required');
                }
                
                const flowData = action.passContext ? context.data : {};
                
                services.logger?.info(`🔀 Flow Trigger: Executing flow ${action.flowId}`);
                
                await iftttEngine.executeFlowById(action.flowId, flowData);
            }
        });

        this.register('flow:stop', {
            name: 'Stop Flow Execution',
            description: 'Stop executing remaining actions',
            category: 'logic',
            icon: 'square',
            fields: [],
            executor: async (action, context, services) => {
                services.logger?.info('⏹️ Flow execution stopped');
                context.stopExecution = true;
            }
        });

        // Log Action
        this.register('log:write', {
            name: 'Write to Log',
            description: 'Write a log message',
            category: 'utility',
            icon: 'file-text',
            fields: [
                { name: 'message', label: 'Message', type: 'textarea', required: true },
                { name: 'level', label: 'Log Level', type: 'select', options: ['debug', 'info', 'warn', 'error'], default: 'info' }
            ],
            executor: async (action, context, services) => {
                const logger = services.logger;
                if (!logger) {
                    // fallback when logger not injected
                    const level = action.level || 'info';
                    process.stdout.write(`[Flow Log] ${action.message || '(no message)'}\n`);
                    return;
                }
                
                const message = services.templateEngine.render(action.message || '', context.data);
                const level = action.level || 'info';
                
                if (typeof logger[level] === 'function') {
                    logger[level](`[Flow Log] ${message}`);
                } else {
                    logger.info(`[Flow Log] ${message}`);
                }
            }
        });

        // File Action
        this.register('file:write', {
            name: 'Write to File',
            description: 'Write data to a file (safe directory)',
            category: 'utility',
            icon: 'save',
            fields: [
                { name: 'filename', label: 'Filename', type: 'text', required: true },
                { name: 'content', label: 'Content', type: 'textarea', required: true },
                { name: 'append', label: 'Append', type: 'checkbox', default: true }
            ],
            executor: async (action, context, services) => {
                const fs = services.fs || require('fs').promises;
                const path = services.path || require('path');
                const safeDir = services.safeDir;
                
                if (!fs || !path || !safeDir) {
                    services.logger?.warn('File system not available');
                    throw new Error('File system not available');
                }
                
                if (!action.filename) {
                    throw new Error('Filename is required');
                }
                
                const filename = path.basename(action.filename);
                const safePath = path.join(safeDir, filename);
                
                if (!safePath.startsWith(safeDir)) {
                    throw new Error('Path traversal attempt detected');
                }
                
                const content = services.templateEngine.render(action.content || '', context.data);
                
                services.logger?.info(`📁 File Write: ${filename} (${action.append ? 'append' : 'write'})`);
                
                if (action.append) {
                    await fs.appendFile(safePath, content + '\n', 'utf8');
                } else {
                    await fs.writeFile(safePath, content, 'utf8');
                }
                
                return { filename, safePath };
            }
        });

        // Notification Action
        this.register('notification:send', {
            name: 'Send Notification',
            description: 'Send notification to dashboard',
            category: 'utility',
            icon: 'bell',
            fields: [
                { name: 'title', label: 'Title', type: 'text', required: true },
                { name: 'message', label: 'Message', type: 'textarea', required: true },
                { name: 'type', label: 'Type', type: 'select', options: ['info', 'success', 'warning', 'error'], default: 'info' }
            ],
            executor: async (action, context, services) => {
                const io = services.io;
                if (!io) {
                    services.logger?.warn('Socket.io not available for notifications');
                    throw new Error('Socket.io not available');
                }
                
                const title = services.templateEngine.render(action.title || '', context.data);
                const message = services.templateEngine.render(action.message || '', context.data);
                
                const notificationData = {
                    title: title,
                    message: message,
                    type: action.type || 'info',
                    timestamp: Date.now()
                };
                
                services.logger?.info(`🔔 Notification: ${title} - ${message.substring(0, 50)}...`);
                io.emit('notification', notificationData);
            }
        });

        // ========== OpenShock Actions ==========
        
        // OpenShock: Send Shock
        this.register('openshock:shock', {
            name: 'OpenShock - Send Shock',
            description: 'Send a shock command to an OpenShock device',
            category: 'openshock',
            icon: 'zap',
            fields: [
                { name: 'deviceId', label: 'Device ID', type: 'text', required: true, help: 'OpenShock device ID (UUID)' },
                { name: 'intensity', label: 'Intensity (%)', type: 'range', min: 1, max: 100, default: 50 },
                { name: 'duration', label: 'Duration (ms)', type: 'number', min: 300, max: 30000, default: 1000 }
            ],
            executor: async (action, context, services) => {
                const pluginLoader = services.pluginLoader;
                if (!pluginLoader) {
                    throw new Error('Plugin loader not available');
                }

                const openShockPlugin = pluginLoader.plugins.get('openshock');
                if (!openShockPlugin || !openShockPlugin.instance) {
                    throw new Error('OpenShock plugin not loaded');
                }

                const deviceId = services.templateEngine.render(action.deviceId || '', context.data);
                const intensity = parseInt(action.intensity) || 50;
                const duration = parseInt(action.duration) || 1000;

                if (!deviceId) {
                    throw new Error('Device ID is required');
                }

                // Call the plugin's executeAction method
                const result = await openShockPlugin.instance.executeAction({
                    type: 'command',
                    deviceId,
                    commandType: 'shock',
                    intensity,
                    duration
                }, {
                    userId: 'flow-system',
                    username: 'IFTTT Flow',
                    source: 'ifttt-flow',
                    sourceData: context.data
                });

                services.logger?.info(`⚡ OpenShock: Shock sent to ${deviceId} (${intensity}%, ${duration}ms)`);
                return result;
            }
        });

        // OpenShock: Send Vibrate
        this.register('openshock:vibrate', {
            name: 'OpenShock - Send Vibrate',
            description: 'Send a vibrate command to an OpenShock device',
            category: 'openshock',
            icon: 'zap',
            fields: [
                { name: 'deviceId', label: 'Device ID', type: 'text', required: true, help: 'OpenShock device ID (UUID)' },
                { name: 'intensity', label: 'Intensity (%)', type: 'range', min: 1, max: 100, default: 50 },
                { name: 'duration', label: 'Duration (ms)', type: 'number', min: 300, max: 30000, default: 1000 }
            ],
            executor: async (action, context, services) => {
                const pluginLoader = services.pluginLoader;
                if (!pluginLoader) {
                    throw new Error('Plugin loader not available');
                }

                const openShockPlugin = pluginLoader.plugins.get('openshock');
                if (!openShockPlugin || !openShockPlugin.instance) {
                    throw new Error('OpenShock plugin not loaded');
                }

                const deviceId = services.templateEngine.render(action.deviceId || '', context.data);
                const intensity = parseInt(action.intensity) || 50;
                const duration = parseInt(action.duration) || 1000;

                if (!deviceId) {
                    throw new Error('Device ID is required');
                }

                // Call the plugin's executeAction method
                const result = await openShockPlugin.instance.executeAction({
                    type: 'command',
                    deviceId,
                    commandType: 'vibrate',
                    intensity,
                    duration
                }, {
                    userId: 'flow-system',
                    username: 'IFTTT Flow',
                    source: 'ifttt-flow',
                    sourceData: context.data
                });

                services.logger?.info(`📳 OpenShock: Vibrate sent to ${deviceId} (${intensity}%, ${duration}ms)`);
                return result;
            }
        });

        // OpenShock: Execute Pattern
        this.register('openshock:pattern', {
            name: 'OpenShock - Execute Pattern',
            description: 'Execute a shock pattern on an OpenShock device',
            category: 'openshock',
            icon: 'zap',
            fields: [
                { name: 'deviceId', label: 'Device ID', type: 'text', required: true, help: 'OpenShock device ID (UUID)' },
                { name: 'patternId', label: 'Pattern ID', type: 'text', required: true, help: 'Pattern ID or name' }
            ],
            executor: async (action, context, services) => {
                const pluginLoader = services.pluginLoader;
                if (!pluginLoader) {
                    throw new Error('Plugin loader not available');
                }

                const openShockPlugin = pluginLoader.plugins.get('openshock');
                if (!openShockPlugin || !openShockPlugin.instance) {
                    throw new Error('OpenShock plugin not loaded');
                }

                const deviceId = services.templateEngine.render(action.deviceId || '', context.data);
                const patternId = services.templateEngine.render(action.patternId || '', context.data);

                if (!deviceId) {
                    throw new Error('Device ID is required');
                }
                if (!patternId) {
                    throw new Error('Pattern ID is required');
                }

                // Call the plugin's executeAction method
                const result = await openShockPlugin.instance.executeAction({
                    type: 'pattern',
                    deviceId,
                    patternId
                }, {
                    userId: 'flow-system',
                    username: 'IFTTT Flow',
                    source: 'ifttt-flow',
                    sourceData: context.data
                });

                services.logger?.info(`🎵 OpenShock: Pattern ${patternId} executed on ${deviceId}`);
                return result;
            }
        });

        // VDO.Ninja Actions
        this.register('vdoninja:mute', {
            name: 'VDO.Ninja - Mute Guest',
            description: 'Mute audio and/or video for a VDO.Ninja guest slot',
            category: 'vdoninja',
            icon: 'mic-off',
            fields: [
                { name: 'guest_slot', label: 'Guest Slot (1-based)', type: 'number', required: true },
                { name: 'mute_audio', label: 'Mute Audio', type: 'checkbox', default: true },
                { name: 'mute_video', label: 'Mute Video', type: 'checkbox', default: false }
            ],
            executor: async (action, context, services) => {
                const vdoninja = services.vdoninja;
                if (!vdoninja) {
                    services.logger?.warn('⚠️ VDO.Ninja Manager not available');
                    throw new Error('VDO.Ninja Manager not available');
                }
                const slot = parseInt(action.guest_slot);
                const muteAudio = action.mute_audio !== false;
                const muteVideo = action.mute_video || false;
                await vdoninja.muteGuest(slot, muteAudio, muteVideo);
                services.logger?.info(`🔇 VDO.Ninja: Guest ${slot} muted - audio: ${muteAudio}, video: ${muteVideo}`);
            }
        });

        this.register('vdoninja:unmute', {
            name: 'VDO.Ninja - Unmute Guest',
            description: 'Unmute audio and/or video for a VDO.Ninja guest slot',
            category: 'vdoninja',
            icon: 'mic',
            fields: [
                { name: 'guest_slot', label: 'Guest Slot (1-based)', type: 'number', required: true },
                { name: 'unmute_audio', label: 'Unmute Audio', type: 'checkbox', default: true },
                { name: 'unmute_video', label: 'Unmute Video', type: 'checkbox', default: false }
            ],
            executor: async (action, context, services) => {
                const vdoninja = services.vdoninja;
                if (!vdoninja) {
                    services.logger?.warn('⚠️ VDO.Ninja Manager not available');
                    throw new Error('VDO.Ninja Manager not available');
                }
                const slot = parseInt(action.guest_slot);
                const unmuteAudio = action.unmute_audio !== false;
                const unmuteVideo = action.unmute_video || false;
                await vdoninja.unmuteGuest(slot, unmuteAudio, unmuteVideo);
                services.logger?.info(`🔊 VDO.Ninja: Guest ${slot} unmuted - audio: ${unmuteAudio}, video: ${unmuteVideo}`);
            }
        });

        this.register('vdoninja:solo', {
            name: 'VDO.Ninja - Solo Guest',
            description: 'Solo a VDO.Ninja guest for a specified duration',
            category: 'vdoninja',
            icon: 'user',
            fields: [
                { name: 'guest_slot', label: 'Guest Slot (1-based)', type: 'number', required: true },
                { name: 'duration', label: 'Duration (ms)', type: 'number', default: 10000 }
            ],
            executor: async (action, context, services) => {
                const vdoninja = services.vdoninja;
                if (!vdoninja) {
                    services.logger?.warn('⚠️ VDO.Ninja Manager not available');
                    throw new Error('VDO.Ninja Manager not available');
                }
                const slot = parseInt(action.guest_slot);
                const duration = action.duration || 10000;
                await vdoninja.soloGuest(slot, duration);
                services.logger?.info(`⭐ VDO.Ninja: Guest ${slot} solo for ${duration}ms`);
            }
        });

        this.register('vdoninja:layout', {
            name: 'VDO.Ninja - Change Layout',
            description: 'Change VDO.Ninja layout with optional transition',
            category: 'vdoninja',
            icon: 'layout',
            fields: [
                { name: 'layout', label: 'Layout Name', type: 'text', required: true },
                { name: 'transition', label: 'Transition', type: 'select', options: ['fade', 'slide', 'none'], default: 'fade' }
            ],
            executor: async (action, context, services) => {
                const vdoninja = services.vdoninja;
                if (!vdoninja) {
                    services.logger?.warn('⚠️ VDO.Ninja Manager not available');
                    throw new Error('VDO.Ninja Manager not available');
                }
                const layout = action.layout_name || action.layout;
                const transition = action.transition || 'fade';
                await vdoninja.changeLayout(layout, transition);
                services.logger?.info(`🎨 VDO.Ninja: Layout changed to ${layout} (transition: ${transition})`);
            }
        });

        this.register('vdoninja:volume', {
            name: 'VDO.Ninja - Set Guest Volume',
            description: 'Set audio volume for a VDO.Ninja guest slot',
            category: 'vdoninja',
            icon: 'volume-2',
            fields: [
                { name: 'guest_slot', label: 'Guest Slot (1-based)', type: 'number', required: true },
                { name: 'volume', label: 'Volume (0.0 – 1.0)', type: 'number', default: 1.0 }
            ],
            executor: async (action, context, services) => {
                const vdoninja = services.vdoninja;
                if (!vdoninja) {
                    services.logger?.warn('⚠️ VDO.Ninja Manager not available');
                    throw new Error('VDO.Ninja Manager not available');
                }
                const slot = parseInt(action.guest_slot);
                const volume = parseFloat(action.volume) || 1.0;
                await vdoninja.setGuestVolume(slot, volume);
                services.logger?.info(`🔊 VDO.Ninja: Guest ${slot} volume set to ${volume}`);
            }
        });

        this.register('vdoninja:kick', {
            name: 'VDO.Ninja - Kick Guest',
            description: 'Remove a guest from VDO.Ninja with an optional reason',
            category: 'vdoninja',
            icon: 'user-x',
            fields: [
                { name: 'guest_slot', label: 'Guest Slot (1-based)', type: 'number', required: true },
                { name: 'reason', label: 'Reason', type: 'text', default: 'Kicked by automation' }
            ],
            executor: async (action, context, services) => {
                const vdoninja = services.vdoninja;
                if (!vdoninja) {
                    services.logger?.warn('⚠️ VDO.Ninja Manager not available');
                    throw new Error('VDO.Ninja Manager not available');
                }
                const slot = parseInt(action.guest_slot);
                const reason = action.reason || 'Kicked by automation';
                await vdoninja.kickGuest(slot, reason);
                services.logger?.info(`❌ VDO.Ninja: Guest ${slot} kicked - reason: ${reason}`);
            }
        });
    }
}

module.exports = ActionRegistry;
