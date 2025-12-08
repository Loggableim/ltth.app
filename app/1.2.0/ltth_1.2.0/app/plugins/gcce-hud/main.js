/**
 * GCCE HUD Overlay Plugin
 * 
 * Provides customizable HUD overlays for text and images via chat commands.
 * Integrated with Global Chat Command Engine (GCCE).
 * 
 * Features:
 * - Display custom text with configurable font, size, color
 * - Display custom images from URLs
 * - Configurable display duration
 * - Position and style customization
 * - Permission-based access control
 * - Rate limiting
 */

const path = require('path');

class GCCEHUDPlugin {
    constructor(api) {
        this.api = api;
        this.io = null;
        
        // Active HUD elements
        this.activeElements = new Map(); // elementId -> {type, content, timestamp, duration}
        this.elementIdCounter = 0;
        
        // Rate limiting
        this.userRateLimit = new Map(); // username -> {count, resetTime}
        this.rateLimitWindow = 60000; // 1 minute
        this.rateLimitMax = 5; // Max 5 HUD commands per minute
    }

    async init() {
        this.api.log('🎨 [GCCE-HUD] Initializing GCCE HUD Plugin...', 'info');

        // Load configuration
        await this.loadConfig();

        // Get Socket.IO instance
        this.io = this.api.getSocketIO();

        // Register routes
        this.registerRoutes();

        // Register GCCE commands
        this.registerGCCECommands();

        // Start cleanup timer
        this.startCleanupTimer();

        this.api.log('✅ [GCCE-HUD] GCCE HUD Plugin initialized successfully', 'info');
    }

    async loadConfig() {
        try {
            const config = await this.api.getConfig('hud_config');
            
            const defaultConfig = {
                enabled: true,
                chatCommands: {
                    enabled: true,
                    requirePermission: true,
                    allowImages: true,
                    allowText: true
                },
                defaults: {
                    textDuration: 10,        // seconds
                    imageDuration: 10,       // seconds
                    maxDuration: 60,         // seconds
                    minDuration: 3,          // seconds
                    fontSize: 48,            // px
                    fontFamily: 'Arial, sans-serif',
                    textColor: '#FFFFFF',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    position: 'top-center',  // top-center, top-left, top-right, center, bottom-center, etc.
                    maxWidth: 800,           // px
                    imageMaxWidth: 400,      // px
                    imageMaxHeight: 400      // px
                },
                permissions: {
                    text: 'all',             // all, subscriber, moderator, broadcaster
                    image: 'subscriber',     // all, subscriber, moderator, broadcaster
                    clear: 'moderator'       // all, subscriber, moderator, broadcaster
                },
                rateLimitPerMinute: 5
            };

            this.config = config || defaultConfig;
            
            // Ensure all default fields exist
            this.config = { ...defaultConfig, ...this.config };
            this.config.chatCommands = { ...defaultConfig.chatCommands, ...this.config.chatCommands };
            this.config.defaults = { ...defaultConfig.defaults, ...this.config.defaults };
            this.config.permissions = { ...defaultConfig.permissions, ...this.config.permissions };

            this.rateLimitMax = this.config.rateLimitPerMinute || 5;

            // Save updated config
            await this.api.setConfig('hud_config', this.config);

            this.api.log('📝 [GCCE-HUD] Configuration loaded', 'debug');
        } catch (error) {
            this.api.log(`❌ [GCCE-HUD] Error loading config: ${error.message}`, 'error');
            throw error;
        }
    }

    registerRoutes() {
        // Serve overlay HTML
        this.api.registerRoute('get', '/gcce-hud/overlay', (req, res) => {
            const overlayPath = path.join(__dirname, 'overlay.html');
            res.sendFile(overlayPath);
        });

        // Serve UI HTML
        this.api.registerRoute('get', '/gcce-hud/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui.html');
            res.sendFile(uiPath);
        });

        // Get configuration
        this.api.registerRoute('get', '/api/gcce-hud/config', async (req, res) => {
            try {
                res.json({ success: true, config: this.config });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update configuration
        this.api.registerRoute('post', '/api/gcce-hud/config', async (req, res) => {
            try {
                const newConfig = req.body;
                
                if (newConfig.chatCommands) {
                    this.config.chatCommands = { ...this.config.chatCommands, ...newConfig.chatCommands };
                }
                if (newConfig.defaults) {
                    this.config.defaults = { ...this.config.defaults, ...newConfig.defaults };
                }
                if (newConfig.permissions) {
                    this.config.permissions = { ...this.config.permissions, ...newConfig.permissions };
                }
                if (typeof newConfig.enabled !== 'undefined') {
                    this.config.enabled = newConfig.enabled;
                }

                await this.api.setConfig('hud_config', this.config);
                
                res.json({ success: true, config: this.config });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get active elements
        this.api.registerRoute('get', '/api/gcce-hud/elements', (req, res) => {
            res.json({
                success: true,
                elements: Array.from(this.activeElements.values())
            });
        });
    }

    registerGCCECommands() {
        try {
            const gcce = this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance;
            
            if (!gcce) {
                this.api.log('💬 [GCCE-HUD] GCCE not available, skipping command registration', 'warn');
                return;
            }

            if (!this.config.chatCommands.enabled) {
                this.api.log('💬 [GCCE-HUD] Chat commands disabled in config', 'debug');
                return;
            }

            const commands = [
                {
                    name: 'hudtext',
                    description: 'Display text on HUD overlay',
                    syntax: '/hudtext [duration] <text>',
                    permission: this.config.permissions.text,
                    enabled: this.config.chatCommands.allowText,
                    minArgs: 1,
                    category: 'HUD',
                    handler: async (args, context) => await this.handleTextCommand(args, context)
                },
                {
                    name: 'hudimage',
                    description: 'Display image on HUD overlay',
                    syntax: '/hudimage [duration] <url>',
                    permission: this.config.permissions.image,
                    enabled: this.config.chatCommands.allowImages,
                    minArgs: 1,
                    category: 'HUD',
                    handler: async (args, context) => await this.handleImageCommand(args, context)
                },
                {
                    name: 'hudclear',
                    description: 'Clear all HUD elements',
                    syntax: '/hudclear',
                    permission: this.config.permissions.clear,
                    enabled: true,
                    minArgs: 0,
                    maxArgs: 0,
                    category: 'HUD',
                    handler: async (args, context) => await this.handleClearCommand(args, context)
                }
            ];

            const result = gcce.registerCommandsForPlugin('gcce-hud', commands);
            
            this.api.log(`💬 [GCCE-HUD] Registered ${result.registered.length} commands with GCCE`, 'info');
            
            if (result.failed.length > 0) {
                this.api.log(`💬 [GCCE-HUD] Failed to register commands: ${result.failed.join(', ')}`, 'warn');
            }

        } catch (error) {
            this.api.log(`❌ [GCCE-HUD] Error registering GCCE commands: ${error.message}`, 'error');
        }
    }

    async handleTextCommand(args, context) {
        try {
            if (!this.config.enabled) {
                return { success: false, error: 'HUD system is disabled' };
            }

            // Rate limiting check
            const rateLimitResult = this.checkRateLimit(context.username);
            if (!rateLimitResult.allowed) {
                return {
                    success: false,
                    error: `Please wait ${rateLimitResult.retryAfter} seconds before sending another HUD command`
                };
            }

            // Parse duration and text
            let duration = this.config.defaults.textDuration;
            let text = args.join(' ');

            // Check if first arg is a number (duration)
            const firstArg = parseFloat(args[0]);
            if (!isNaN(firstArg) && args.length > 1) {
                duration = Math.max(this.config.defaults.minDuration, 
                           Math.min(this.config.defaults.maxDuration, firstArg));
                text = args.slice(1).join(' ');
            }

            // Sanitize text
            text = this.sanitizeText(text);

            if (!text || text.length === 0) {
                return { success: false, error: 'Text cannot be empty' };
            }

            if (text.length > 200) {
                text = text.substring(0, 200) + '...';
            }

            // Create HUD element
            const elementId = this.createTextElement(text, duration, context.username);

            this.api.log(`🎨 [GCCE-HUD] Text displayed by ${context.username}: "${text}" (${duration}s)`, 'info');

            return {
                success: true,
                message: `Text displayed for ${duration} seconds`,
                displayOverlay: true,
                data: { elementId, duration }
            };

        } catch (error) {
            this.api.log(`❌ [GCCE-HUD] Error in hudtext command: ${error.message}`, 'error');
            return { success: false, error: 'Failed to display text' };
        }
    }

    async handleImageCommand(args, context) {
        try {
            if (!this.config.enabled) {
                return { success: false, error: 'HUD system is disabled' };
            }

            // Rate limiting check
            const rateLimitResult = this.checkRateLimit(context.username);
            if (!rateLimitResult.allowed) {
                return {
                    success: false,
                    error: `Please wait ${rateLimitResult.retryAfter} seconds before sending another HUD command`
                };
            }

            // Parse duration and URL
            let duration = this.config.defaults.imageDuration;
            let imageUrl = args.join(' ');

            // Check if first arg is a number (duration)
            const firstArg = parseFloat(args[0]);
            if (!isNaN(firstArg) && args.length > 1) {
                duration = Math.max(this.config.defaults.minDuration,
                           Math.min(this.config.defaults.maxDuration, firstArg));
                imageUrl = args.slice(1).join(' ');
            }

            // Validate URL
            if (!this.isValidImageUrl(imageUrl)) {
                return { success: false, error: 'Invalid image URL' };
            }

            // Create HUD element
            const elementId = this.createImageElement(imageUrl, duration, context.username);

            this.api.log(`🎨 [GCCE-HUD] Image displayed by ${context.username}: ${imageUrl} (${duration}s)`, 'info');

            return {
                success: true,
                message: `Image displayed for ${duration} seconds`,
                displayOverlay: true,
                data: { elementId, duration }
            };

        } catch (error) {
            this.api.log(`❌ [GCCE-HUD] Error in hudimage command: ${error.message}`, 'error');
            return { success: false, error: 'Failed to display image' };
        }
    }

    async handleClearCommand(args, context) {
        try {
            this.clearAllElements();

            this.api.log(`🎨 [GCCE-HUD] All elements cleared by ${context.username}`, 'info');

            return {
                success: true,
                message: 'All HUD elements cleared',
                displayOverlay: true
            };

        } catch (error) {
            this.api.log(`❌ [GCCE-HUD] Error in hudclear command: ${error.message}`, 'error');
            return { success: false, error: 'Failed to clear HUD' };
        }
    }

    createTextElement(text, duration, username) {
        const elementId = `text-${++this.elementIdCounter}`;
        const element = {
            id: elementId,
            type: 'text',
            content: text,
            username,
            timestamp: Date.now(),
            duration: duration * 1000, // Convert to milliseconds
            expiresAt: Date.now() + (duration * 1000),
            style: {
                fontSize: this.config.defaults.fontSize,
                fontFamily: this.config.defaults.fontFamily,
                textColor: this.config.defaults.textColor,
                backgroundColor: this.config.defaults.backgroundColor,
                position: this.config.defaults.position,
                maxWidth: this.config.defaults.maxWidth
            }
        };

        this.activeElements.set(elementId, element);
        this.broadcastElement(element);

        return elementId;
    }

    createImageElement(imageUrl, duration, username) {
        const elementId = `image-${++this.elementIdCounter}`;
        const element = {
            id: elementId,
            type: 'image',
            content: imageUrl,
            username,
            timestamp: Date.now(),
            duration: duration * 1000,
            expiresAt: Date.now() + (duration * 1000),
            style: {
                position: this.config.defaults.position,
                maxWidth: this.config.defaults.imageMaxWidth,
                maxHeight: this.config.defaults.imageMaxHeight
            }
        };

        this.activeElements.set(elementId, element);
        this.broadcastElement(element);

        return elementId;
    }

    broadcastElement(element) {
        if (this.io) {
            this.io.emit('gcce-hud:show', element);
        }
    }

    clearAllElements() {
        this.activeElements.clear();
        if (this.io) {
            this.io.emit('gcce-hud:clear');
        }
    }

    sanitizeText(text) {
        // Remove HTML tags
        return text.replace(/<[^>]*>/g, '').trim();
    }

    isValidImageUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    checkRateLimit(username) {
        const now = Date.now();
        const userLimit = this.userRateLimit.get(username);

        if (!userLimit) {
            this.userRateLimit.set(username, {
                count: 1,
                resetTime: now + this.rateLimitWindow
            });
            return { allowed: true };
        }

        if (now > userLimit.resetTime) {
            this.userRateLimit.set(username, {
                count: 1,
                resetTime: now + this.rateLimitWindow
            });
            return { allowed: true };
        }

        if (userLimit.count >= this.rateLimitMax) {
            return {
                allowed: false,
                retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
            };
        }

        userLimit.count++;
        return { allowed: true };
    }

    startCleanupTimer() {
        // Clean up expired elements every 5 seconds
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let cleaned = 0;

            for (const [id, element] of this.activeElements.entries()) {
                if (now >= element.expiresAt) {
                    this.activeElements.delete(id);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                this.api.log(`🧹 [GCCE-HUD] Cleaned up ${cleaned} expired element(s)`, 'debug');
                // Broadcast updated state
                if (this.io) {
                    this.io.emit('gcce-hud:cleanup', { cleaned });
                }
            }
        }, 5000);
    }

    async destroy() {
        this.api.log('🎨 [GCCE-HUD] Destroying GCCE HUD Plugin...', 'info');
        
        // Unregister GCCE commands
        try {
            const gcce = this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance;
            if (gcce) {
                gcce.unregisterCommandsForPlugin('gcce-hud');
                this.api.log('💬 [GCCE-HUD] Unregistered GCCE commands', 'debug');
            }
        } catch (error) {
            this.api.log(`❌ [GCCE-HUD] Error unregistering GCCE commands: ${error.message}`, 'error');
        }

        // Clear cleanup timer
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Clear all elements
        this.clearAllElements();
        
        // Clear rate limit cache
        this.userRateLimit.clear();
        
        this.api.log('✅ [GCCE-HUD] GCCE HUD Plugin destroyed', 'info');
    }
}

module.exports = GCCEHUDPlugin;
