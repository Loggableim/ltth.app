/**
 * Printer Service Module
 * 
 * Verwaltet die Verbindung zum Thermodrucker und die Print Queue.
 * Features:
 * - Robuste Print Queue (verhindert Blocking des Event Loops)
 * - Auto-Reconnection Logic
 * - ESC/POS Formatierung
 * - USB und Netzwerk-Unterstützung
 */

const escpos = require('escpos');
// Adapter werden dynamisch geladen je nach Konfiguration
const path = require('path');

// Printer type constants
const PRINTER_TYPE_USB = 'usb';
const PRINTER_TYPE_NETWORK = 'network';

class PrinterService {
    constructor(logger) {
        this.logger = logger;
        this.printer = null;
        this.device = null;
        this.config = null;
        this.isConnected = false;
        this.isReconnecting = false;
        
        // Print Queue
        this.queue = [];
        this.isProcessing = false;
        this.queueProcessingInterval = null;
        
        // Reconnection
        this.reconnectAttempts = 0;
        this.reconnectTimeout = null;
        
        // Statistiken
        this.stats = {
            printedJobs: 0,
            failedJobs: 0,
            queuedJobs: 0,
            lastPrintTime: null,
            connectionUptime: 0,
            connectionStartTime: null
        };
    }

    /**
     * Initialisiert den Printer Service mit Konfiguration
     */
    async init(config) {
        this.config = config;
        
        try {
            await this.connect();
            
            // Starte Queue-Processing
            this.startQueueProcessing();
            
            this.logger.info('[PrinterService] Initialized successfully');
            return true;
        } catch (error) {
            this.logger.error('[PrinterService] Initialization failed:', error);
            
            // Versuche Auto-Reconnect
            if (config.reconnectAttempts > 0) {
                this.scheduleReconnect();
            }
            
            return false;
        }
    }

    /**
     * Verbindet mit dem Drucker (USB oder Netzwerk)
     */
    async connect() {
        try {
            this.logger.info(`[PrinterService] Connecting to ${this.config.printerType} printer...`);
            
            if (this.config.printerType === PRINTER_TYPE_USB) {
                await this.connectUSB();
            } else if (this.config.printerType === PRINTER_TYPE_NETWORK) {
                await this.connectNetwork();
            } else {
                throw new Error(`Unknown printer type: ${this.config.printerType}`);
            }
            
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.stats.connectionStartTime = Date.now();
            
            this.logger.info('[PrinterService] Connected successfully');
            
            return true;
        } catch (error) {
            this.isConnected = false;
            throw error;
        }
    }

    /**
     * Verbindet mit USB-Drucker
     */
    async connectUSB() {
        try {
            const USB = require('escpos-usb');
            
            // Parse Vendor/Product IDs (können als Hex-String kommen)
            const vendorId = this.parseHexId(this.config.usbVendorId);
            const productId = this.parseHexId(this.config.usbProductId);
            
            // Check if both IDs are provided (not just one)
            const hasVendorId = this.config.usbVendorId && this.config.usbVendorId.trim() !== '';
            const hasProductId = this.config.usbProductId && this.config.usbProductId.trim() !== '';
            
            if (!hasVendorId && !hasProductId) {
                // Kein spezifischer Drucker angegeben, versuche ersten verfügbaren
                this.device = new USB.USB();
            } else {
                this.device = new USB.USB(vendorId, productId);
            }
            
            // ESC/POS Drucker initialisieren
            this.printer = new escpos.Printer(this.device, {
                encoding: this.config.encoding || 'GB18030',
                width: this.config.width || 48
            });
            
            this.logger.info('[PrinterService] USB printer connected');
        } catch (error) {
            this.logger.error('[PrinterService] USB connection failed:', error);
            throw error;
        }
    }

    /**
     * Verbindet mit Netzwerk-Drucker
     */
    async connectNetwork() {
        try {
            const Network = require('escpos-network');
            
            // Erstelle Netzwerk-Device
            this.device = new Network.Network(
                this.config.networkHost,
                this.config.networkPort || 9100
            );
            
            // Warte auf Verbindung
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Network connection timeout'));
                }, 10000);
                
                this.device.open((error) => {
                    clearTimeout(timeout);
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
            
            // ESC/POS Drucker initialisieren
            this.printer = new escpos.Printer(this.device, {
                encoding: this.config.encoding || 'GB18030',
                width: this.config.width || 48
            });
            
            this.logger.info('[PrinterService] Network printer connected');
        } catch (error) {
            this.logger.error('[PrinterService] Network connection failed:', error);
            throw error;
        }
    }

    /**
     * Parst Hex-ID String zu Number
     */
    parseHexId(id) {
        if (!id) return null;
        
        // Wenn String mit 0x beginnt, als Hex parsen
        if (typeof id === 'string' && id.startsWith('0x')) {
            return parseInt(id, 16);
        }
        
        // Sonst als Dezimal
        return parseInt(id, 10);
    }

    /**
     * Trennt die Verbindung zum Drucker
     */
    async disconnect() {
        try {
            this.stopQueueProcessing();
            
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }
            
            if (this.device) {
                this.device.close();
                this.device = null;
            }
            
            this.printer = null;
            this.isConnected = false;
            
            this.logger.info('[PrinterService] Disconnected');
        } catch (error) {
            this.logger.error('[PrinterService] Disconnect error:', error);
        }
    }

    /**
     * Fügt einen Print-Job zur Queue hinzu
     */
    async addToQueue(job) {
        if (this.queue.length >= this.config.queueMaxSize) {
            this.logger.warn('[PrinterService] Queue is full, discarding oldest job');
            this.queue.shift(); // Ältesten Job entfernen
        }
        
        this.queue.push(job);
        this.stats.queuedJobs++;
        
        this.logger.debug(`[PrinterService] Job added to queue (${this.queue.length} jobs in queue)`);
    }

    /**
     * Startet Queue-Processing
     */
    startQueueProcessing() {
        if (this.queueProcessingInterval) {
            return;
        }
        
        this.queueProcessingInterval = setInterval(async () => {
            await this.processQueue();
        }, this.config.printDelay || 500);
        
        this.logger.info('[PrinterService] Queue processing started');
    }

    /**
     * Stoppt Queue-Processing
     */
    stopQueueProcessing() {
        if (this.queueProcessingInterval) {
            clearInterval(this.queueProcessingInterval);
            this.queueProcessingInterval = null;
            this.logger.info('[PrinterService] Queue processing stopped');
        }
    }

    /**
     * Verarbeitet die Print Queue
     */
    async processQueue() {
        // Nur einen Job gleichzeitig verarbeiten
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }
        
        // Nicht drucken wenn nicht verbunden
        if (!this.isConnected || !this.printer) {
            this.logger.debug('[PrinterService] Printer not connected, skipping queue processing');
            return;
        }
        
        this.isProcessing = true;
        
        try {
            const job = this.queue.shift();
            await this.printJob(job);
            
            this.stats.printedJobs++;
            this.stats.lastPrintTime = Date.now();
            
            this.logger.debug('[PrinterService] Job printed successfully');
        } catch (error) {
            this.stats.failedJobs++;
            this.logger.error('[PrinterService] Print job failed:', error);
            
            // Bei Verbindungsfehler, Auto-Reconnect
            if (error.message.includes('ECONNRESET') || error.message.includes('EPIPE')) {
                this.isConnected = false;
                this.scheduleReconnect();
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Druckt einen einzelnen Job
     */
    async printJob(job) {
        return new Promise((resolve, reject) => {
            try {
                const { type, data } = job;
                
                // Formatiere basierend auf Event-Typ
                switch (type) {
                    case 'gift':
                        this.formatGift(data);
                        break;
                    case 'chat':
                        this.formatChat(data);
                        break;
                    case 'follow':
                        this.formatFollow(data);
                        break;
                    case 'share':
                        this.formatShare(data);
                        break;
                    default:
                        this.logger.warn(`[PrinterService] Unknown job type: ${type}`);
                        this.formatGeneric(data);
                }
                
                // Papier schneiden wenn aktiviert
                if (this.config.autoCutPaper) {
                    this.printer.cut();
                }
                
                // Flush und warte auf Completion
                this.printer.flush(() => {
                    resolve();
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Formatiert ein Gift für den Druck
     */
    formatGift(data) {
        const { username, giftName, giftCount, coins, timestamp } = data;
        
        // Trennlinie
        this.printer
            .align('CT')
            .text('================================')
            .text('');
        
        // ASCII Gift Icon
        this.printer
            .text('   ___  ___  ___ ___')
            .text('  | _ \\| _ \\| __/ __|')
            .text('  |  _/|   /| _|\\__ \\')
            .text('  |_|  |_|_\\|___|___/')
            .text('');
        
        // Username (fett)
        this.printer
            .style('B')
            .size(1, 1)
            .align('CT')
            .text(username || 'Unknown')
            .style('NORMAL')
            .text('');
        
        // Gift Info
        this.printer
            .align('LT')
            .text(`Gift: ${giftName}`)
            .text(`Count: ${giftCount || 1}`)
            .text(`Coins: ${coins}`)
            .text(`Time: ${new Date(timestamp).toLocaleTimeString()}`)
            .text('');
        
        // Trennlinie
        this.printer
            .align('CT')
            .text('================================')
            .text('');
    }

    /**
     * Formatiert eine Chat-Nachricht für den Druck
     */
    formatChat(data) {
        const { username, message, timestamp } = data;
        
        // Trennlinie
        this.printer
            .align('CT')
            .text('--------------------------------')
            .text('');
        
        // Username (fett)
        this.printer
            .style('B')
            .align('LT')
            .text(username || 'Unknown')
            .style('NORMAL')
            .text('');
        
        // Message
        this.printer
            .text(this.wrapText(message, this.config.width - 2))
            .text('');
        
        // Timestamp
        this.printer
            .size(0, 0)
            .text(new Date(timestamp).toLocaleTimeString())
            .size(1, 1)
            .text('');
    }

    /**
     * Formatiert einen Follow für den Druck
     */
    formatFollow(data) {
        const { username, timestamp } = data;
        
        // Trennlinie
        this.printer
            .align('CT')
            .text('********************************')
            .text('');
        
        // Heart Icon
        this.printer
            .text('     ♥ NEW FOLLOWER ♥')
            .text('');
        
        // Username (fett)
        this.printer
            .style('B')
            .size(1, 1)
            .text(username || 'Unknown')
            .style('NORMAL')
            .size(1, 1)
            .text('');
        
        // Timestamp
        this.printer
            .size(0, 0)
            .text(new Date(timestamp).toLocaleTimeString())
            .size(1, 1)
            .text('');
        
        // Trennlinie
        this.printer
            .align('CT')
            .text('********************************')
            .text('');
    }

    /**
     * Formatiert einen Share für den Druck
     */
    formatShare(data) {
        const { username, timestamp } = data;
        
        this.printer
            .align('CT')
            .text('~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~')
            .text('')
            .text('★ STREAM SHARED ★')
            .text('')
            .style('B')
            .text(username || 'Unknown')
            .style('NORMAL')
            .text('')
            .size(0, 0)
            .text(new Date(timestamp).toLocaleTimeString())
            .size(1, 1)
            .text('')
            .text('~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~')
            .text('');
    }

    /**
     * Formatiert generische Daten
     */
    formatGeneric(data) {
        this.printer
            .align('LT')
            .text(JSON.stringify(data, null, 2))
            .text('');
    }

    /**
     * Wrapped Text für lange Nachrichten
     */
    wrapText(text, maxWidth) {
        if (!text) return '';
        
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        for (const word of words) {
            if ((currentLine + ' ' + word).length <= maxWidth) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        }
        
        if (currentLine) lines.push(currentLine);
        
        return lines.join('\n');
    }

    /**
     * Plant einen Reconnect-Versuch
     */
    scheduleReconnect() {
        if (this.isReconnecting) {
            return;
        }
        
        if (this.reconnectAttempts >= this.config.reconnectAttempts) {
            this.logger.error('[PrinterService] Max reconnect attempts reached');
            return;
        }
        
        this.isReconnecting = true;
        this.reconnectAttempts++;
        
        this.logger.info(
            `[PrinterService] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.config.reconnectAttempts} in ${this.config.reconnectDelay}ms`
        );
        
        this.reconnectTimeout = setTimeout(async () => {
            this.isReconnecting = false;
            
            try {
                await this.connect();
                this.logger.info('[PrinterService] Reconnected successfully');
            } catch (error) {
                this.logger.error('[PrinterService] Reconnect failed:', error);
                this.scheduleReconnect();
            }
        }, this.config.reconnectDelay);
    }

    /**
     * Gibt Status-Informationen zurück
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            isReconnecting: this.isReconnecting,
            queueSize: this.queue.length,
            reconnectAttempts: this.reconnectAttempts,
            stats: {
                ...this.stats,
                uptime: this.stats.connectionStartTime 
                    ? Date.now() - this.stats.connectionStartTime 
                    : 0
            }
        };
    }

    /**
     * Cleanup beim Destroy
     */
    async destroy() {
        await this.disconnect();
        this.queue = [];
    }
}

module.exports = PrinterService;
