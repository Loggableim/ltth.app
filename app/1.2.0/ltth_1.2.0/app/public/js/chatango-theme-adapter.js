/**
 * Chatango Theme Adapter
 * Adapts Chatango shoutbox colors to match the current theme (day/night/high contrast)
 * Corporate branding color: #13A318 (green)
 * 
 * This module now handles dynamic loading of Chatango embeds to ensure they
 * only load when the chatango plugin is enabled.
 */

class ChatangoThemeAdapter {
    constructor() {
        this.pluginConfig = null; // Will be loaded from API
        this.themeConfigs = {
            night: {
                // Default night mode - green branding
                a: '13A318',      // Background color (green)
                b: 100,           // Background opacity
                c: 'FFFFFF',      // Title and icons color (white)
                d: 'FFFFFF',      // Group owner's msg, URL and background text color
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
                // Day mode - light theme with green accents
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

        const embedConfig = this.generateEmbedCode('dashboard', theme);
        const scriptId = this.generateUniqueId('cid-dashboard');
        const jsonConfig = JSON.stringify(embedConfig.config);
        
        // Create script element properly for Chatango embed
        // Chatango's emb.js reads the script element's text content after loading
        const script = document.createElement('script');
        script.id = scriptId;
        script.setAttribute('data-cfasync', 'false');
        script.src = 'https://st.chatango.com/js/gz/emb.js';
        script.style.cssText = `width: ${embedConfig.width}; height: ${embedConfig.height};`;
        // Set the JSON config as text - Chatango reads this after script loads
        script.text = jsonConfig;
        
        container.appendChild(script);
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

        const embedConfig = this.generateEmbedCode('widget', theme);
        const scriptId = this.generateUniqueId('cid-widget');
        const jsonConfig = JSON.stringify(embedConfig.config);
        
        // Create script element properly for Chatango embed
        const script = document.createElement('script');
        script.id = scriptId;
        script.setAttribute('data-cfasync', 'false');
        script.src = 'https://st.chatango.com/js/gz/emb.js';
        script.style.cssText = `width: ${embedConfig.width}; height: ${embedConfig.height};`;
        // Set the JSON config as text - Chatango reads this after script loads
        script.text = jsonConfig;
        
        container.appendChild(script);
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
        return themeAttr || 'night'; // Default to night if no theme set
    }

    updateChatangoTheme() {
        const currentTheme = this.getCurrentTheme();
        const config = this.themeConfigs[currentTheme];

        if (!config) {
            console.warn('Unknown theme for Chatango:', currentTheme);
            return;
        }

        // Note: Chatango embeds are loaded via script tags with JSON config
        // Once loaded, their colors cannot be dynamically changed without reloading the iframe
        // This is a limitation of the Chatango embed system
        // The best we can do is log the theme change for future enhancement
        console.log('Chatango theme would be:', currentTheme, config);
        
        // Store the current theme preference for future page loads
        localStorage.setItem('chatango-preferred-theme', currentTheme);
    }

    /**
     * Get the configuration for a specific theme
     * This can be used to manually recreate the embed with new colors
     */
    getConfigForTheme(theme) {
        return this.themeConfigs[theme] || this.themeConfigs.night;
    }

    /**
     * Generate embed code for current theme
     * Uses configuration from plugin API when available
     */
    generateEmbedCode(position = 'dashboard', theme = null) {
        // Use theme from config or current theme as fallback
        theme = theme || (this.pluginConfig && this.pluginConfig.theme) || this.getCurrentTheme();
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
            const widgetWidth = (this.pluginConfig && this.pluginConfig.widgetWidth) || 200;
            const widgetHeight = (this.pluginConfig && this.pluginConfig.widgetHeight) || 300;
            const widgetPos = (this.pluginConfig && this.pluginConfig.widgetPosition) || 'br';
            const collapsedWidth = (this.pluginConfig && this.pluginConfig.collapsedWidth) || 75;
            const collapsedHeight = (this.pluginConfig && this.pluginConfig.collapsedHeight) || 30;
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
