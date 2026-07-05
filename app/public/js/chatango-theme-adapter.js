/**
 * Chatango Theme Adapter
 * Adapts Chatango shoutbox colors to match the current theme (day/night/high contrast/vision impaired)
 * Corporate branding color: #13A318 (green)
 * 
 * This module now handles dynamic loading of Chatango embeds to ensure they
 * only load when the chatango plugin is enabled.
 */

class ChatangoThemeAdapter {
    constructor() {
        this.pluginConfig = null; // Will be loaded from API
        this.themeConfigs = {
            aurora: {
                // Legacy alias retained for old saved settings; normalized to night.
                a: '1e293b',
                b: 100,
                c: 'FFFFFF',
                d: 'FFFFFF',
                e: '1e293b',
                f: 100,
                g: 'FFFFFF',
                h: '334155',
                i: 100,
                j: 'FFFFFF',
                k: '38bdf8',
                l: '334155',
                m: '334155',
                n: 'FFFFFF',
                o: 100,
                p: '10',
                q: '334155',
                r: 100,
                s: 0,
                t: 0,
                sbc: '64748b',
                sba: 100,
                cvbg: '1e293b',
                cvfg: 'FFFFFF'
            },
            'aurora-2': {
                // Legacy alias retained for old saved settings; normalized to night.
                a: '1e293b',
                b: 100,
                c: 'FFFFFF',
                d: 'FFFFFF',
                e: '1e293b',
                f: 100,
                g: 'FFFFFF',
                h: '334155',
                i: 100,
                j: 'FFFFFF',
                k: '38bdf8',
                l: '334155',
                m: '334155',
                n: 'FFFFFF',
                o: 100,
                p: '10',
                q: '334155',
                r: 100,
                s: 0,
                t: 0,
                sbc: '64748b',
                sba: 100,
                cvbg: '1e293b',
                cvfg: 'FFFFFF'
            },
            night: {
                // Default night mode - neutral dark surfaces with green accents
                a: '1e293b',      // Background color (dark card surface)
                b: 100,           // Background opacity
                c: 'FFFFFF',      // Title and icons color (white)
                d: 'FFFFFF',      // Group owner's msg, URL and background text color
                e: '1e293b',      // Messages background color (dark blue-gray)
                f: 100,           // Messages background opacity
                g: 'FFFFFF',      // Messages text color (white)
                h: '334155',      // Input background color (slate)
                i: 100,           // Input background opacity
                j: 'FFFFFF',      // Input text color (white)
                k: '38bdf8',      // Date color (sky accent)
                l: '334155',      // Border color (slate)
                m: '334155',      // Button color (slate)
                n: 'FFFFFF',      // Button text color (white)
                o: 100,           // Button opacity
                p: '10',          // Font size
                q: '334155',      // Main border color (slate)
                r: 100,           // Main border visibility
                s: 0,             // Rounded corners
                t: 0,             // Messages sound toggle (off)
                sbc: '64748b',    // Scrollbar color
                sba: 100,         // Scrollbar opacity
                cvbg: '1e293b',   // Collapsed view background (dark card surface)
                cvfg: 'FFFFFF'    // Collapsed view font/icon color (white)
            },
            day: {
                // Day mode - light theme with green accents
                a: 'f8fafc',      // Background color (light card surface)
                b: 100,           // Background opacity
                c: '1e293b',      // Title and icons color (dark)
                d: '1e293b',      // Group owner's msg, URL text (dark)
                e: 'f8fafc',      // Messages background color (very light gray)
                f: 100,           // Messages background opacity
                g: '1e293b',      // Messages text color (dark)
                h: 'FFFFFF',      // Input background color (white)
                i: 100,           // Input background opacity
                j: '1e293b',      // Input text color (dark)
                k: '0284c7',      // Date color (blue accent)
                l: 'cbd5e1',      // Border color (light slate)
                m: 'cbd5e1',      // Button color (light slate)
                n: 'FFFFFF',      // Button text color (white)
                o: 100,           // Button opacity
                p: '10',          // Font size
                q: 'cbd5e1',      // Main border color (light slate)
                r: 100,           // Main border visibility
                s: 0,             // Rounded corners
                t: 0,             // Messages sound toggle (off)
                sbc: 'cbd5e1',    // Scrollbar color (light gray)
                sba: 100,         // Scrollbar opacity
                cvbg: 'f8fafc',   // Collapsed view background (light card surface)
                cvfg: 'FFFFFF'    // Collapsed view font/icon color (white)
            },
            contrast: {
                // High contrast mode for vision impaired
                a: '000000',      // Background color (black)
                b: 100,           // Background opacity
                c: 'FFFF00',      // Title and icons color (yellow - high visibility)
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
            },
            'vision-impaired': {
                // Vision impaired mode - larger font and maximum contrast
                a: '000000',      // Background color (black)
                b: 100,           // Background opacity
                c: 'FFFFFF',      // Title and icons color (white)
                d: 'FFFFFF',      // Group owner's msg, URL text (white)
                e: '000000',      // Messages background color (black)
                f: 100,           // Messages background opacity
                g: 'FFFFFF',      // Messages text color (white)
                h: '000000',      // Input background color (black)
                i: 100,           // Input background opacity
                j: 'FFFFFF',      // Input text color (white)
                k: 'FFFFFF',      // Date color (white)
                l: 'FFFFFF',      // Border color (white)
                m: 'FFFFFF',      // Button color (white)
                n: '000000',      // Button text color (black)
                o: 100,           // Button opacity
                p: '13',          // Font size (larger for readability)
                q: 'FFFFFF',      // Main border color (white)
                r: 100,           // Main border visibility
                s: 0,             // Rounded corners
                t: 0,             // Messages sound toggle (off)
                sbc: 'FFFFFF',    // Scrollbar color (white)
                sba: 100,         // Scrollbar opacity
                cvbg: '000000',   // Collapsed view background (black)
                cvfg: 'FFFFFF'    // Collapsed view font/icon color (white)
            }
        };

        this.embedsLoaded = false;
        this.chatangoEnabled = false;
        this.embedIdCounter = 0; // Counter for unique embed IDs
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.onDOMReady());
        } else {
            this.onDOMReady();
        }
    }

    async onDOMReady() {
        // Setup theme listener
        this.setupThemeListener();
        
        // Check if chatango plugin is enabled and load embeds
        await this.checkAndLoadChatango();
        
        // Listen for plugin changes to reload chatango when enabled
        this.setupPluginChangeListener();
    }

    async checkAndLoadChatango() {
        try {
            const response = await fetch('/api/plugins');
            if (!response.ok) {
                console.warn('Could not check plugin status for Chatango');
                return;
            }
            
            const data = await response.json();
            if (!data.success) {
                console.warn('Plugin API returned unsuccessful response');
                return;
            }
            
            // Check if chatango plugin is enabled
            const chatangoPlugin = data.plugins.find(p => p.id === 'chatango');
            this.chatangoEnabled = chatangoPlugin && chatangoPlugin.enabled;
            
            if (this.chatangoEnabled) {
                console.log('💬 Chatango plugin is enabled, loading embeds...');
                // Fetch the plugin configuration before loading embeds
                await this.fetchPluginConfig();
                this.loadChatangoEmbeds();
            } else {
                console.log('💬 Chatango plugin is disabled, skipping embed loading');
                this.showDisabledMessage();
            }
        } catch (error) {
            console.error('Error checking Chatango plugin status:', error);
        }
    }

    async fetchPluginConfig() {
        try {
            const response = await fetch('/api/chatango/config');
            if (!response.ok) {
                console.warn('Could not fetch Chatango config, using defaults');
                this.pluginConfig = this.getDefaultConfig();
                return;
            }
            
            const data = await response.json();
            if (data.success && data.config) {
                this.pluginConfig = data.config;
                console.log('💬 Chatango config loaded:', this.pluginConfig.roomHandle);
            } else {
                console.warn('Chatango config API returned unsuccessful, using defaults');
                this.pluginConfig = this.getDefaultConfig();
            }
        } catch (error) {
            console.error('Error fetching Chatango config:', error);
            this.pluginConfig = this.getDefaultConfig();
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

    setupPluginChangeListener() {
        // Use Promise-based approach to wait for socket availability
        const waitForSocket = () => {
            return new Promise((resolve) => {
                // Check if socket is already available
                if (typeof socket !== 'undefined' && socket) {
                    resolve(socket);
                    return;
                }
                
                // Use MutationObserver to detect when socket becomes available
                // by watching for the global socket variable
                let attempts = 0;
                const maxAttempts = 100; // 10 seconds max (100 * 100ms)
                
                const checkSocket = () => {
                    attempts++;
                    if (typeof socket !== 'undefined' && socket) {
                        resolve(socket);
                    } else if (attempts < maxAttempts) {
                        setTimeout(checkSocket, 100);
                    } else {
                        console.warn('💬 Chatango: Socket not available after timeout');
                        resolve(null);
                    }
                };
                
                checkSocket();
            });
        };
        
        waitForSocket().then((socketInstance) => {
            if (socketInstance) {
                socketInstance.on('plugins:changed', async (data) => {
                    if (data && data.pluginId === 'chatango') {
                        console.log('💬 Chatango plugin state changed:', data.action);
                        // Reset embedsLoaded flag to allow reload when plugin is re-enabled
                        this.embedsLoaded = false;
                        await this.checkAndLoadChatango();
                    }
                });
                console.log('💬 Chatango adapter listening for plugin changes');
            }
        });
    }

    loadChatangoEmbeds() {
        if (this.embedsLoaded) {
            console.log('💬 Chatango embeds already loaded');
            return;
        }

        // Ensure the dashboard section is visible before loading embeds
        // This prevents race conditions where the embed loads before navigation.js shows the section
        const dashboardSection = document.querySelector('.shoutbox-section[data-plugin="chatango"]');
        if (dashboardSection && dashboardSection.style.display === 'none') {
            console.log('💬 Chatango section is hidden, making it visible before loading embed');
            dashboardSection.style.display = '';
        }

        // Use theme from plugin config if available
        const theme = (this.pluginConfig && this.pluginConfig.theme) || this.getCurrentTheme();
        
        // Load dashboard embed
        this.loadDashboardEmbed(theme);
        
        // Load widget embed
        this.loadWidgetEmbed(theme);
        
        this.embedsLoaded = true;
        console.log('💬 Chatango embeds loaded successfully');
    }

    /**
     * Generate a unique ID for embed scripts using counter-based approach
     * @param {string} prefix - Prefix for the ID
     * @returns {string} Unique ID
     */
    generateUniqueId(prefix) {
        this.embedIdCounter++;
        return `${prefix}-${this.embedIdCounter}`;
    }

    sanitizeWidgetDimension(val, defaultVal, min = 50, max = 1000) {
        const parsed = parseInt(val, 10);
        if (Number.isNaN(parsed) || parsed < min || parsed > max) {
            return defaultVal;
        }
        return parsed;
    }

    loadDashboardEmbed(theme) {
        const container = document.getElementById('chatango-embed-container');
        if (!container) {
            console.warn('Chatango dashboard container not found');
            return;
        }

        // Check if dashboard is enabled in config
        if (this.pluginConfig && !this.pluginConfig.dashboardEnabled) {
            console.log('💬 Dashboard embed is disabled in config');
            return;
        }

        // Clear any existing content (like loading message)
        container.innerHTML = '';

        // Use iframe-based approach to avoid CSP issues with dynamic script injection
        // The iframe loads a server-rendered HTML page with the Chatango embed
        const iframe = document.createElement('iframe');
        iframe.id = this.generateUniqueId('chatango-dashboard-iframe');
        iframe.src = `/chatango/embed/dashboard?theme=${encodeURIComponent(theme)}`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.title = 'Chatango Community Chat';
        iframe.setAttribute('allowtransparency', 'true');

        container.appendChild(iframe);

        console.log('💬 Dashboard embed iframe loaded:', iframe.id);
    }

    loadWidgetEmbed(theme) {
        const container = document.getElementById('chatango-widget-container');
        if (!container) {
            console.warn('Chatango widget container not found');
            return;
        }

        // Check if widget is enabled in config
        if (this.pluginConfig && !this.pluginConfig.widgetEnabled) {
            console.log('💬 Widget embed is disabled in config');
            return;
        }

        // Clear any existing content
        container.innerHTML = '';

        const embedCode = this.generateEmbedCode('widget', theme);
        
        // Widget has fixed dimensions from config - sanitize to prevent CSS injection
        const config = this.pluginConfig || this.getDefaultConfig();
        const widgetWidth = this.sanitizeWidgetDimension(config.widgetWidth, 200, 150, 500);
        const widgetHeight = this.sanitizeWidgetDimension(config.widgetHeight, 300, 200, 600);
        
        // Direct script injection lets Chatango resize or remove its own floating UI.
        const script = document.createElement('script');
        script.id = `cid${Date.now()}-${this.generateUniqueId('chatango-widget-script')}`;
        script.setAttribute('data-cfasync', 'false');
        script.async = true;
        script.src = 'https://st.chatango.com/js/gz/emb.js';
        script.style.width = `${widgetWidth}px`;
        script.style.height = `${widgetHeight}px`;
        script.appendChild(document.createTextNode(JSON.stringify(embedCode.config)));
        
        container.appendChild(script);

        console.log('Chatango widget embed script loaded:', script.id);
    }

    showDisabledMessage() {
        // Show message in dashboard container
        const dashboardContainer = document.getElementById('chatango-embed-container');
        if (dashboardContainer) {
            // First try to update the loading element if it exists
            const loadingEl = dashboardContainer.querySelector('.chatango-loading');
            const disabledHtml = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-text-secondary);">
                    <div style="text-align: center; padding: 20px;">
                        <i data-lucide="message-square-off" style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5;"></i>
                        <p style="margin: 0; font-size: 14px;">Community Chat is disabled</p>
                        <p style="margin: 8px 0 0 0; font-size: 12px; opacity: 0.7;">Enable the Chatango plugin to use this feature</p>
                    </div>
                </div>
            `;
            
            if (loadingEl) {
                loadingEl.innerHTML = disabledHtml;
            } else {
                // Loading element not found, set container directly
                dashboardContainer.innerHTML = disabledHtml;
            }
            
            // Re-initialize Lucide icons for the new icon
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    setupThemeListener() {
        // Listen for theme changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                    this.updateChatangoTheme();
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });

        // Apply initial theme
        this.updateChatangoTheme();
    }

    getCurrentTheme() {
        const themeAttr = document.documentElement.getAttribute('data-theme');
        return this.normalizeTheme(themeAttr || 'night');
    }

    normalizeTheme(theme) {
        if (!theme) return 'night';
        if (theme === 'aurora' || theme === 'aurora-2') return 'night';
        if (theme === 'highcontrast' || theme === 'high-contrast') return 'contrast';
        if (this.themeConfigs[theme]) return theme;
        return 'night';
    }

    updateChatangoTheme() {
        const currentTheme = this.getCurrentTheme();
        const config = this.themeConfigs[currentTheme];

        if (!config) {
            console.warn('Unknown theme for Chatango:', currentTheme);
            return;
        }

        // Store the current theme preference for future page loads
        localStorage.setItem('chatango-preferred-theme', currentTheme);

        // Reload the dashboard iframe with the new theme
        const dashboardIframe = document.querySelector('iframe[id^="chatango-dashboard-iframe"]');
        if (dashboardIframe) {
            const newSrc = `/chatango/embed/dashboard?theme=${encodeURIComponent(currentTheme)}`;
            if (dashboardIframe.src !== newSrc) {
                console.log('💬 Reloading Chatango dashboard iframe with theme:', currentTheme);
                dashboardIframe.src = newSrc;
            }
        }

        // Note: The widget embed uses a script tag with JSON config that Chatango controls.
        // Once loaded, its colors cannot be dynamically changed without a full page reload.
        // This is a limitation of the Chatango embed system.
        console.log('💬 Chatango theme updated to:', currentTheme);
    }

    /**
     * Get the configuration for a specific theme
     * This can be used to manually recreate the embed with new colors
     */
    getConfigForTheme(theme) {
        const normalizedTheme = this.normalizeTheme(theme);
        return this.themeConfigs[normalizedTheme] || this.themeConfigs.night || this.themeConfigs['vision-impaired'];
    }

    /**
     * Generate embed code for current theme
     * Uses configuration from plugin API when available
     */
    generateEmbedCode(position = 'dashboard', theme = null) {
        // Use theme from config or current theme as fallback
        theme = this.normalizeTheme(theme || (this.pluginConfig && this.pluginConfig.theme) || this.getCurrentTheme());
        const themeStyles = this.getConfigForTheme(theme);
        
        // Get room handle from config or use default
        const roomHandle = (this.pluginConfig && this.pluginConfig.roomHandle) || 'pupcidsltth';
        const fontSize = (this.pluginConfig && this.pluginConfig.fontSize) || '10';
        const allowPM = (this.pluginConfig && this.pluginConfig.allowPM) ? 1 : 0;

        const baseConfig = {
            handle: roomHandle,
            arch: 'js',
            styles: {
                ...themeStyles,
                p: fontSize,
                surl: 0,
                allowpm: allowPM,
                cnrs: '0.35',
                fwtickm: 1
            }
        };

        if (position === 'widget') {
            // Widget configuration from plugin config
            const widgetWidth = this.sanitizeWidgetDimension(
                this.pluginConfig && this.pluginConfig.widgetWidth,
                200,
                150,
                500
            );
            const widgetHeight = this.sanitizeWidgetDimension(
                this.pluginConfig && this.pluginConfig.widgetHeight,
                300,
                200,
                600
            );
            const requestedWidgetPos = (this.pluginConfig && this.pluginConfig.widgetPosition) || 'br';
            const validPositions = ['br', 'bl', 'tr', 'tl'];
            const widgetPos = validPositions.includes(requestedWidgetPos) ? requestedWidgetPos : 'br';
            const collapsedWidth = this.sanitizeWidgetDimension(
                this.pluginConfig && this.pluginConfig.collapsedWidth,
                75,
                50,
                200
            );
            const collapsedHeight = this.sanitizeWidgetDimension(
                this.pluginConfig && this.pluginConfig.collapsedHeight,
                30,
                20,
                100
            );
            const showTicker = (this.pluginConfig && this.pluginConfig.showTicker) ? 1 : 0;
            
            return {
                width: `${widgetWidth}px`,
                height: `${widgetHeight}px`,
                config: {
                    ...baseConfig,
                    styles: {
                        ...baseConfig.styles,
                        pos: widgetPos,
                        cv: 1,
                        cvw: collapsedWidth,
                        cvh: collapsedHeight,
                        ticker: showTicker
                    }
                }
            };
        } else {
            // Dashboard embed configuration
            return {
                width: '100%',
                height: '100%',
                config: baseConfig
            };
        }
    }
}

// Initialize the adapter when the script loads
const chatangoThemeAdapter = new ChatangoThemeAdapter();
