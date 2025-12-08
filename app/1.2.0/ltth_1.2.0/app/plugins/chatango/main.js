const path = require('path');

/**
 * Chatango Integration Plugin
 *
 * Integrates Chatango chat rooms into the streaming tool.
 * Provides configurable chat widgets, theme synchronization,
 * and exposes chat events for use in flows and automations.
 *
 * Features:
 * - Configurable Chatango room embed
 * - Theme-aware color schemes (day/night/high contrast)
 * - Dashboard and floating widget support
 * - Settings UI for customization
 * - Embed code generation API
 */
class ChatangoPlugin {
    constructor(api) {
        this.api = api;
        this.logger = api.logger;
        this.config = null;

        // Theme configurations matching the existing chatango-theme-adapter.js
        this.themeConfigs = {
            night: {
                a: '13A318',      // Background color (green)
                b: 100,           // Background opacity
                c: 'FFFFFF',      // Title and icons color (white)
                d: 'FFFFFF',      // Group owner's msg, URL text
                e: '1e293b',      // Messages background color (dark blue-gray)
                f: 100,           // Messages background opacity
                g: 'FFFFFF',      // Messages text color (white)
                h: '334155',      // Input background color (slate)
                i: 100,           // Input background opacity
                j: 'FFFFFF',      // Input text color (white)
                k: '13A318',      // Date color (green)
                l: '13A318',      // Border color (green)
                m: '13A318',      // Button color (green)
                n: 'FFFFFF',      // Button text color (white)
                o: 100,           // Button opacity
                p: '10',          // Font size
                q: '13A318',      // Main border color (green)
                r: 100,           // Main border visibility
                s: 0,             // Rounded corners
                t: 0,             // Messages sound toggle (off)
                sbc: '64748b',    // Scrollbar color
                sba: 100,         // Scrollbar opacity
                cvbg: '13a318',   // Collapsed view background (green)
                cvfg: 'FFFFFF'    // Collapsed view font/icon color (white)
            },
            day: {
                a: '13A318',      // Background color (green)
                b: 100,           // Background opacity
                c: '1e293b',      // Title and icons color (dark)
                d: '1e293b',      // Group owner's msg, URL text (dark)
                e: 'f8fafc',      // Messages background color (very light gray)
                f: 100,           // Messages background opacity
                g: '1e293b',      // Messages text color (dark)
                h: 'FFFFFF',      // Input background color (white)
                i: 100,           // Input background opacity
                j: '1e293b',      // Input text color (dark)
                k: '0f8712',      // Date color (darker green)
                l: '13A318',      // Border color (green)
                m: '13A318',      // Button color (green)
                n: 'FFFFFF',      // Button text color (white)
                o: 100,           // Button opacity
                p: '10',          // Font size
                q: '13A318',      // Main border color (green)
                r: 100,           // Main border visibility
                s: 0,             // Rounded corners
                t: 0,             // Messages sound toggle (off)
                sbc: 'cbd5e1',    // Scrollbar color (light gray)
                sba: 100,         // Scrollbar opacity
                cvbg: '13a318',   // Collapsed view background (green)
                cvfg: 'FFFFFF'    // Collapsed view font/icon color (white)
            },
            contrast: {
                a: '000000',      // Background color (black)
                b: 100,           // Background opacity
                c: 'FFFF00',      // Title and icons color (yellow)
                d: 'FFFF00',      // Group owner's msg, URL text (yellow)
                e: '000000',      // Messages background color (black)
                f: 100,           // Messages background opacity
                g: 'FFFFFF',      // Messages text color (white)
                h: '000000',      // Input background color (black)
                i: 100,           // Input background opacity
                j: 'FFFF00',      // Input text color (yellow)
                k: 'FFFF00',      // Date color (yellow)
                l: 'FFFF00',      // Border color (yellow)
                m: 'FFFF00',      // Button color (yellow)
                n: '000000',      // Button text color (black)
                o: 100,           // Button opacity
                p: '12',          // Font size (larger for readability)
                q: 'FFFF00',      // Main border color (yellow)
                r: 100,           // Main border visibility
                s: 0,             // Rounded corners
                t: 0,             // Messages sound toggle (off)
                sbc: 'FFFF00',    // Scrollbar color (yellow)
                sba: 100,         // Scrollbar opacity
                cvbg: '000000',   // Collapsed view background (black)
                cvfg: 'FFFF00'    // Collapsed view font/icon color (yellow)
            }
        };
    }

    async init() {
        try {
            // Load config
            this.config = await this.api.getConfig('config') || this.getDefaultConfig();

            // Register routes
            this.registerRoutes();

            // Register socket events
            this.registerSocketEvents();

            this.logger.info('💬 Chatango Plugin initialized');

            return true;
        } catch (error) {
            this.logger.error('Chatango Plugin init error:', error);
            return false;
        }
    }

    getDefaultConfig() {
        return {
            enabled: true,
            roomHandle: 'pupcidsltth',
            theme: 'night',
            fontSize: '10',
            allowPM: false,
            showTicker: true,
            widgetPosition: 'br',
            widgetWidth: 200,
            widgetHeight: 300,
            collapsedWidth: 75,
            collapsedHeight: 30,
            dashboardEnabled: true,
            widgetEnabled: true
        };
    }

    /**
     * Validate and sanitize configuration input
     * @param {object} input - Raw input from request body
     * @returns {object} Validation result with sanitized config or error
     */
    validateConfig(input) {
        if (!input || typeof input !== 'object') {
            return { valid: false, error: 'Invalid configuration data' };
        }

        const validThemes = ['night', 'day', 'contrast'];
        const validPositions = ['br', 'bl', 'tr', 'tl'];
        const validFontSizes = ['8', '10', '12', '14'];

        // Build sanitized config from input
        const sanitized = {};

        // Boolean fields
        if (typeof input.enabled === 'boolean') {
            sanitized.enabled = input.enabled;
        }
        if (typeof input.allowPM === 'boolean') {
            sanitized.allowPM = input.allowPM;
        }
        if (typeof input.showTicker === 'boolean') {
            sanitized.showTicker = input.showTicker;
        }
        if (typeof input.dashboardEnabled === 'boolean') {
            sanitized.dashboardEnabled = input.dashboardEnabled;
        }
        if (typeof input.widgetEnabled === 'boolean') {
            sanitized.widgetEnabled = input.widgetEnabled;
        }

        // String fields with validation
        if (typeof input.roomHandle === 'string') {
            // Sanitize room handle - alphanumeric and basic punctuation only
            const cleanHandle = input.roomHandle.replace(/[^a-zA-Z0-9_-]/g, '');
            if (cleanHandle.length > 0 && cleanHandle.length <= 50) {
                sanitized.roomHandle = cleanHandle;
            }
        }

        if (typeof input.theme === 'string' && validThemes.includes(input.theme)) {
            sanitized.theme = input.theme;
        }

        if (typeof input.fontSize === 'string' && validFontSizes.includes(input.fontSize)) {
            sanitized.fontSize = input.fontSize;
        }

        if (typeof input.widgetPosition === 'string' && validPositions.includes(input.widgetPosition)) {
            sanitized.widgetPosition = input.widgetPosition;
        }

        // Numeric fields with bounds checking
        if (typeof input.widgetWidth === 'number') {
            sanitized.widgetWidth = Math.max(150, Math.min(500, Math.floor(input.widgetWidth)));
        }
        if (typeof input.widgetHeight === 'number') {
            sanitized.widgetHeight = Math.max(200, Math.min(600, Math.floor(input.widgetHeight)));
        }
        if (typeof input.collapsedWidth === 'number') {
            sanitized.collapsedWidth = Math.max(50, Math.min(200, Math.floor(input.collapsedWidth)));
        }
        if (typeof input.collapsedHeight === 'number') {
            sanitized.collapsedHeight = Math.max(20, Math.min(100, Math.floor(input.collapsedHeight)));
        }

        return { valid: true, config: sanitized };
    }

    registerRoutes() {
        // UI route
        this.api.registerRoute('GET', '/chatango/ui', (req, res) => {
            res.sendFile(path.join(this.api.getPluginDir(), 'ui.html'));
        });

        // GET /api/chatango/config - Get current configuration
        this.api.registerRoute('get', '/api/chatango/config', async (req, res) => {
            const config = await this.api.getConfig('config') || this.getDefaultConfig();
            res.json({
                success: true,
                config
            });
        });

        // POST /api/chatango/config - Update configuration
        this.api.registerRoute('post', '/api/chatango/config', async (req, res) => {
            const newConfig = this.validateConfig(req.body);
            if (!newConfig.valid) {
                return res.status(400).json({
                    success: false,
                    error: newConfig.error
                });
            }
            const result = await this.updateConfig(newConfig.config);
            res.json(result);
        });

        // GET /api/chatango/embed - Get embed code for current config
        this.api.registerRoute('get', '/api/chatango/embed', async (req, res) => {
            const validTypes = ['dashboard', 'widget'];
            const validThemes = ['night', 'day', 'contrast'];
            
            const type = validTypes.includes(req.query.type) ? req.query.type : 'dashboard';
            const theme = validThemes.includes(req.query.theme) ? req.query.theme : this.config.theme;
            
            const embedCode = this.generateEmbedCode(type, theme);
            res.json({
                success: true,
                embedCode
            });
        });

        // GET /api/chatango/themes - Get available theme configurations
        this.api.registerRoute('get', '/api/chatango/themes', (req, res) => {
            res.json({
                success: true,
                themes: Object.keys(this.themeConfigs),
                configs: this.themeConfigs
            });
        });

        // GET /api/chatango/status - Get plugin status
        this.api.registerRoute('get', '/api/chatango/status', (req, res) => {
            res.json({
                success: true,
                status: {
                    enabled: this.config.enabled,
                    roomHandle: this.config.roomHandle,
                    theme: this.config.theme,
                    dashboardEnabled: this.config.dashboardEnabled,
                    widgetEnabled: this.config.widgetEnabled
                }
            });
        });
    }

    registerSocketEvents() {
        // Client can request current config
        this.api.registerSocket('chatango:get-config', (data) => {
            this.emitConfig();
        });

        // Client can request embed code
        this.api.registerSocket('chatango:get-embed', (data) => {
            const { type, theme } = data || {};
            const embedCode = this.generateEmbedCode(type || 'dashboard', theme || this.config.theme);
            this.api.emit('chatango:embed', {
                type: type || 'dashboard',
                embedCode
            });
        });
    }

    /**
     * Generate Chatango embed code
     * @param {string} type - 'dashboard' or 'widget'
     * @param {string} theme - 'night', 'day', or 'contrast'
     * @returns {object} Embed configuration
     */
    generateEmbedCode(type, theme) {
        const themeConfig = this.themeConfigs[theme] || this.themeConfigs.night;
        const fontSize = this.config.fontSize || '10';

        // Build base styles object
        const styles = {
            ...themeConfig,
            p: fontSize,
            surl: 0,
            allowpm: this.config.allowPM ? 1 : 0,
            cnrs: '0.35',
            fwtickm: 1
        };

        if (type === 'widget') {
            // Floating widget configuration
            const position = this.config.widgetPosition || 'br';
            return {
                handle: this.config.roomHandle,
                arch: 'js',
                styles: {
                    ...styles,
                    pos: position,
                    cv: 1,
                    cvw: this.config.collapsedWidth || 75,
                    cvh: this.config.collapsedHeight || 30,
                    ticker: this.config.showTicker ? 1 : 0
                },
                width: this.config.widgetWidth || 200,
                height: this.config.widgetHeight || 300
            };
        } else {
            // Dashboard embed configuration
            return {
                handle: this.config.roomHandle,
                arch: 'js',
                styles,
                width: '100%',
                height: '100%'
            };
        }
    }

    /**
     * Generate HTML script tag for embedding
     * @param {string} type - 'dashboard' or 'widget'
     * @param {string} theme - Theme name
     * @returns {string} HTML script tag
     */
    generateScriptTag(type, theme) {
        const config = this.generateEmbedCode(type, theme);
        const id = `cid${Date.now()}`;
        
        // Sanitize dimensions
        const sanitizeSize = (val, defaultVal) => {
            if (typeof val === 'number') return Math.max(0, Math.min(1000, val));
            if (typeof val === 'string' && /^[\d]+(%|px)?$/.test(val)) return val;
            return defaultVal;
        };
        
        const width = type === 'widget' 
            ? `${sanitizeSize(config.width, 200)}px` 
            : sanitizeSize(config.width, '100%');
        const height = type === 'widget' 
            ? `${sanitizeSize(config.height, 300)}px` 
            : sanitizeSize(config.height, '100%');
        const styleAttr = `width: ${width};height: ${height};`;

        // Sanitize handle to prevent injection
        const safeHandle = String(config.handle || '').replace(/[<>'"&]/g, '');
        
        const jsonConfig = JSON.stringify({
            handle: safeHandle,
            arch: 'js', // Fixed value
            styles: config.styles
        });

        return `<script id="${id}" data-cfasync="false" async src="https://st.chatango.com/js/gz/emb.js" style="${styleAttr}">${jsonConfig}</script>`;
    }

    async updateConfig(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            await this.api.setConfig('config', this.config);

            this.emitConfig();

            this.logger.info('✅ Chatango config updated');

            return { success: true, config: this.config };
        } catch (error) {
            this.logger.error('Failed to update Chatango config:', error);
            return { success: false, error: error.message };
        }
    }

    emitConfig() {
        this.api.emit('chatango:config', {
            config: this.config,
            themes: Object.keys(this.themeConfigs)
        });
    }

    async destroy() {
        this.logger.info('💬 Chatango Plugin destroyed');
    }
}

module.exports = ChatangoPlugin;
