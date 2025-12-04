/**
 * Thermal Printer Plugin - Main Entry Point
 * 
 * Druckt TikTok Live Events (Chat, Gifts, Follows) physisch auf einem Thermodrucker.
 * 
 * Features:
 * - USB und Netzwerk-Drucker Support
 * - Robuste Print Queue (verhindert Blocking)
 * - Auto-Reconnection Logic
 * - Event-Filtering (min coins, bot commands, etc.)
 * - ESC/POS Formatierung mit ASCII-Icons
 * - Konfigurierbar über Admin-UI
 * 
 * @author Pup Cid
 * @version 1.0.0
 */

const PrinterService = require('./printerService');
const configModule = require('./config');
const path = require('path');
const fs = require('fs').promises;

class ThermalPrinterPlugin {
    constructor(api) {
        this.api = api;
        this.logger = api.logger;
        this.printerService = null;
        this.config = null;
        
        // TikTok Event Handlers
        this.eventHandlers = {
            gift: null,
            chat: null,
            follow: null,
            share: null
        };
    }

    /**
     * Plugin Initialisierung
     */
    async init() {
        try {
            this.logger.info('🖨️  [ThermalPrinter] Initializing plugin...');
            
            // Lade Konfiguration
            await this.loadConfig();
            
            // Registriere API-Routes
            this.registerRoutes();
            
            // Registriere Socket.io Events
            this.registerSocketEvents();
            
            // Initialisiere Printer Service wenn enabled
            if (this.config.enabled) {
                await this.startPrinting();
            }
            
            this.logger.info('🖨️  [ThermalPrinter] Plugin initialized successfully');
            return true;
            
        } catch (error) {
            this.logger.error('[ThermalPrinter] Initialization error:', error);
            return false;
        }
    }

    /**
     * Lädt Konfiguration aus Datenbank oder verwendet Defaults
     */
    async loadConfig() {
        try {
            const savedConfig = await this.api.getConfig('config');
            
            if (savedConfig) {
                this.config = configModule.mergeWithDefaults(savedConfig);
            } else {
                this.config = configModule.getDefaultConfig();
                await this.api.setConfig('config', this.config);
            }
            
            // Validiere Konfiguration
            const validation = configModule.validateConfig(this.config);
            if (!validation.valid) {
                this.logger.warn('[ThermalPrinter] Config validation warnings:', validation.errors);
            }
            
        } catch (error) {
            this.logger.error('[ThermalPrinter] Error loading config:', error);
            this.config = configModule.getDefaultConfig();
        }
    }

    /**
     * Startet den Druck-Service und registriert TikTok Events
     */
    async startPrinting() {
        try {
            // Initialisiere Printer Service
            this.printerService = new PrinterService(this.logger);
            await this.printerService.init(this.config);
            
            // Registriere TikTok Event Handlers
            this.registerTikTokEvents();
            
            // Emit Status Update
            this.emitStatus();
            
            this.logger.info('[ThermalPrinter] Printing started');
            
        } catch (error) {
            this.logger.error('[ThermalPrinter] Error starting printer:', error);
            throw error;
        }
    }

    /**
     * Stoppt den Druck-Service
     */
    async stopPrinting() {
        try {
            // Unregistriere TikTok Event Handlers
            this.unregisterTikTokEvents();
            
            // Stoppe Printer Service
            if (this.printerService) {
                await this.printerService.destroy();
                this.printerService = null;
            }
            
            // Emit Status Update
            this.emitStatus();
            
            this.logger.info('[ThermalPrinter] Printing stopped');
            
        } catch (error) {
            this.logger.error('[ThermalPrinter] Error stopping printer:', error);
        }
    }

    /**
     * Registriert TikTok Event Handlers
     * 
     * HINWEIS: Die TikTok-Events werden über das Plugin-API-System bereitgestellt.
     * Das Hauptprogramm emittiert Events via tiktokConnection.on('chat', ...)
     * Diese Events werden dann über die Plugin-API weitergeleitet.
     */
    registerTikTokEvents() {
        // Gift Events
        if (this.config.printGifts) {
            this.eventHandlers.gift = this.api.registerTikTokEvent('gift', (data) => {
                this.handleGift(data);
            });
        }
        
        // Chat Events
        if (this.config.printChats) {
            this.eventHandlers.chat = this.api.registerTikTokEvent('chat', (data) => {
                this.handleChat(data);
            });
        }
        
        // Follow Events
        if (this.config.printFollows) {
            this.eventHandlers.follow = this.api.registerTikTokEvent('follow', (data) => {
                this.handleFollow(data);
            });
        }
        
        // Share Events
        if (this.config.printShares) {
            this.eventHandlers.share = this.api.registerTikTokEvent('share', (data) => {
                this.handleShare(data);
            });
        }
        
        this.logger.info('[ThermalPrinter] TikTok events registered');
    }

    /**
     * Unregistriert TikTok Event Handlers
     */
    unregisterTikTokEvents() {
        // Event Handlers werden automatisch vom Plugin-System entfernt
        // wenn das Plugin destroyed wird
        this.eventHandlers = {
            gift: null,
            chat: null,
            follow: null,
            share: null
        };
    }

    /**
     * Handhabt Gift Events
     */
    handleGift(data) {
        try {
            const { uniqueId, giftName, giftId, diamonds, coins, repeatCount } = data;
            
            // Filter: Minimum Coins (inclusive - gifts with exactly minCoinsToPrint will be printed)
            const totalCoins = (coins || 0) * (repeatCount || 1);
            if (totalCoins < this.config.minCoinsToPrint) {
                this.logger.debug(`[ThermalPrinter] Gift below minimum coins: ${totalCoins} < ${this.config.minCoinsToPrint}`);
                return;
            }
            
            // Füge zur Print Queue hinzu
            const job = {
                type: 'gift',
                data: {
                    username: uniqueId,
                    giftName: giftName,
                    giftCount: repeatCount || 1,
                    coins: totalCoins,
                    timestamp: Date.now()
                }
            };
            
            this.printerService.addToQueue(job);
            
            this.logger.debug(`[ThermalPrinter] Gift queued: ${uniqueId} sent ${giftName} (${totalCoins} coins)`);
            
        } catch (error) {
            this.logger.error('[ThermalPrinter] Error handling gift:', error);
        }
    }

    /**
     * Handhabt Chat Events
     */
    handleChat(data) {
        try {
            const { uniqueId, comment } = data;
            
            // Filter: Bot Commands (Nachrichten die mit '!' beginnen)
            if (this.config.ignoreBotCommands && comment && comment.startsWith('!')) {
                this.logger.debug(`[ThermalPrinter] Ignoring bot command: ${comment}`);
                return;
            }
            
            // Füge zur Print Queue hinzu
            const job = {
                type: 'chat',
                data: {
                    username: uniqueId,
                    message: comment || '',
                    timestamp: Date.now()
                }
            };
            
            this.printerService.addToQueue(job);
            
            this.logger.debug(`[ThermalPrinter] Chat queued: ${uniqueId}: ${comment}`);
            
        } catch (error) {
            this.logger.error('[ThermalPrinter] Error handling chat:', error);
        }
    }

    /**
     * Handhabt Follow Events
     */
    handleFollow(data) {
        try {
            const { uniqueId } = data;
            
            // Füge zur Print Queue hinzu
            const job = {
                type: 'follow',
                data: {
                    username: uniqueId,
                    timestamp: Date.now()
                }
            };
            
            this.printerService.addToQueue(job);
            
            this.logger.debug(`[ThermalPrinter] Follow queued: ${uniqueId}`);
            
        } catch (error) {
            this.logger.error('[ThermalPrinter] Error handling follow:', error);
        }
    }

    /**
     * Handhabt Share Events
     */
    handleShare(data) {
        try {
            const { uniqueId } = data;
            
            // Füge zur Print Queue hinzu
            const job = {
                type: 'share',
                data: {
                    username: uniqueId,
                    timestamp: Date.now()
                }
            };
            
            this.printerService.addToQueue(job);
            
            this.logger.debug(`[ThermalPrinter] Share queued: ${uniqueId}`);
            
        } catch (error) {
            this.logger.error('[ThermalPrinter] Error handling share:', error);
        }
    }

    /**
     * Registriert API Routes
     */
    registerRoutes() {
        // GET Config
        this.api.registerRoute('GET', '/api/thermal-printer/config', async (req, res) => {
            try {
                res.json({
                    success: true,
                    config: this.config
                });
            } catch (error) {
                this.logger.error('[ThermalPrinter] Error getting config:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // POST Config (Update)
        this.api.registerRoute('POST', '/api/thermal-printer/config', async (req, res) => {
            try {
                const newConfig = req.body;
                
                // Validiere neue Config
                const validation = configModule.validateConfig(newConfig);
                if (!validation.valid) {
                    return res.status(400).json({
                        success: false,
                        errors: validation.errors
                    });
                }
                
                // Speichere Config
                this.config = newConfig;
                await this.api.setConfig('config', this.config);
                
                // Restart Printer wenn enabled
                const wasEnabled = this.printerService !== null;
                const shouldBeEnabled = this.config.enabled;
                
                if (wasEnabled && !shouldBeEnabled) {
                    await this.stopPrinting();
                } else if (!wasEnabled && shouldBeEnabled) {
                    await this.startPrinting();
                } else if (wasEnabled && shouldBeEnabled) {
                    // Restart
                    await this.stopPrinting();
                    await this.startPrinting();
                }
                
                res.json({
                    success: true,
                    config: this.config
                });
                
            } catch (error) {
                this.logger.error('[ThermalPrinter] Error updating config:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // GET Status
        this.api.registerRoute('GET', '/api/thermal-printer/status', async (req, res) => {
            try {
                const status = this.printerService ? this.printerService.getStatus() : {
                    isConnected: false,
                    isReconnecting: false,
                    queueSize: 0,
                    reconnectAttempts: 0,
                    stats: {
                        printedJobs: 0,
                        failedJobs: 0,
                        queuedJobs: 0,
                        lastPrintTime: null,
                        uptime: 0
                    }
                };
                
                res.json({
                    success: true,
                    enabled: this.config.enabled,
                    status
                });
                
            } catch (error) {
                this.logger.error('[ThermalPrinter] Error getting status:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // POST Test Print
        this.api.registerRoute('POST', '/api/thermal-printer/test', async (req, res) => {
            try {
                if (!this.printerService) {
                    return res.status(400).json({
                        success: false,
                        error: 'Printer service not running'
                    });
                }
                
                // Test-Job zur Queue hinzufügen
                const testJob = {
                    type: 'chat',
                    data: {
                        username: 'TestUser',
                        message: 'This is a test print from Thermal Printer Plugin!',
                        timestamp: Date.now()
                    }
                };
                
                await this.printerService.addToQueue(testJob);
                
                res.json({
                    success: true,
                    message: 'Test print job queued'
                });
                
            } catch (error) {
                this.logger.error('[ThermalPrinter] Error test printing:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // GET UI (Admin Panel)
        this.api.registerRoute('GET', '/thermal-printer/ui', async (req, res) => {
            try {
                const uiPath = path.join(__dirname, 'ui.html');
                res.sendFile(uiPath);
            } catch (error) {
                this.logger.error('[ThermalPrinter] Error serving UI:', error);
                res.status(500).send('Error loading UI');
            }
        });

        this.logger.info('[ThermalPrinter] Routes registered');
    }

    /**
     * Registriert Socket.io Events
     */
    registerSocketEvents() {
        // Status-Updates können hier emitted werden
        // Wird von der emitStatus() Methode genutzt
    }

    /**
     * Emittiert Status-Update an alle Clients
     */
    emitStatus() {
        try {
            const status = this.printerService ? this.printerService.getStatus() : {
                isConnected: false,
                queueSize: 0
            };
            
            this.api.emit('thermal-printer:status', {
                enabled: this.config.enabled,
                status
            });
            
        } catch (error) {
            this.logger.error('[ThermalPrinter] Error emitting status:', error);
        }
    }

    /**
     * Plugin Cleanup
     */
    async destroy() {
        try {
            this.logger.info('[ThermalPrinter] Destroying plugin...');
            
            await this.stopPrinting();
            
            this.logger.info('[ThermalPrinter] Plugin destroyed');
            
        } catch (error) {
            this.logger.error('[ThermalPrinter] Error destroying plugin:', error);
        }
    }
}

module.exports = ThermalPrinterPlugin;
