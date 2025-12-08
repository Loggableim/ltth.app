/**
 * Configuration Module für Thermal Printer Plugin
 * 
 * Konfigurierbare Einstellungen:
 * - Drucker-Verbindung (USB/Netzwerk)
 * - Event-Filter (min_coins_to_print, print_chats, etc.)
 * - Formatierung (Breite, Encoding, Auto-Cut)
 */

module.exports = {
    /**
     * Standard-Konfiguration
     */
    getDefaultConfig() {
        return {
            // Drucker-Verbindung
            printerType: 'usb', // 'usb' oder 'network'
            
            // USB-Konfiguration
            usbVendorId: '', // z.B. '0x04b8' für Epson
            usbProductId: '', // z.B. '0x0e15' für TM-T20
            
            // Netzwerk-Konfiguration
            networkHost: '192.168.1.100',
            networkPort: 9100,
            
            // Event-Filter
            printChats: true,
            printGifts: true,
            printFollows: true,
            printShares: false,
            minCoinsToPrint: 1, // Minimum Coins für Gift-Druck (Papier sparen)
            ignoreBotCommands: true, // Ignoriere Nachrichten die mit '!' beginnen
            
            // Formatierung
            autoCutPaper: true, // Papier nach jedem Event schneiden
            encoding: 'GB18030', // Standard-Encoding für ESC/POS
            width: 48, // Zeichen-Breite (Standard für 80mm Papier)
            
            // Reconnection-Logik
            reconnectAttempts: 5,
            reconnectDelay: 5000, // ms
            
            // Queue-Konfiguration
            queueMaxSize: 100,
            printDelay: 500 // Verzögerung zwischen Druckvorgängen (ms)
        };
    },

    /**
     * Validiert die Konfiguration
     */
    validateConfig(config) {
        const errors = [];

        // Drucker-Typ
        if (!['usb', 'network'].includes(config.printerType)) {
            errors.push('printerType must be "usb" or "network"');
        }

        // USB-Konfiguration
        if (config.printerType === 'usb') {
            // Both IDs must be provided or both must be empty (for auto-detection)
            const hasVendorId = config.usbVendorId && config.usbVendorId.trim() !== '';
            const hasProductId = config.usbProductId && config.usbProductId.trim() !== '';
            
            if (hasVendorId !== hasProductId) {
                errors.push('USB Vendor ID and Product ID must both be provided or both be empty for auto-detection');
            }
        }

        // Netzwerk-Konfiguration
        if (config.printerType === 'network') {
            if (!config.networkHost) {
                errors.push('Network host is required for network printers');
            }
            if (!config.networkPort || config.networkPort < 1 || config.networkPort > 65535) {
                errors.push('Valid network port is required (1-65535)');
            }
        }

        // Numerische Werte
        if (config.minCoinsToPrint < 0) {
            errors.push('minCoinsToPrint must be >= 0');
        }
        if (config.width < 32 || config.width > 80) {
            errors.push('width must be between 32 and 80 characters');
        }
        if (config.reconnectAttempts < 0) {
            errors.push('reconnectAttempts must be >= 0');
        }
        if (config.reconnectDelay < 0) {
            errors.push('reconnectDelay must be >= 0');
        }
        if (config.queueMaxSize < 1) {
            errors.push('queueMaxSize must be >= 1');
        }
        if (config.printDelay < 0) {
            errors.push('printDelay must be >= 0');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Merged User-Config mit Defaults
     */
    mergeWithDefaults(userConfig) {
        const defaults = this.getDefaultConfig();
        return {
            ...defaults,
            ...userConfig
        };
    }
};
