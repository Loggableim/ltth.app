/**
 * Soundboard WebSocket Transport
 * 
 * Manages WebSocket broadcasting for soundboard preview events.
 * Tracks dashboard clients and sends preview events only to them.
 */

class SoundboardWebSocketTransport {
    constructor(io) {
        this.io = io;
        this.dashboardClients = new Set(); // Track dashboard client socket IDs
        
        console.log('[SoundboardWS] WebSocket transport initialized');
        
        // Listen for client identification
        this.setupClientTracking();
    }

    /**
     * Setup client tracking to identify dashboard clients
     */
    setupClientTracking() {
        this.io.on('connection', (socket) => {
            // Listen for client identification
            socket.on('soundboard:identify', (data) => {
                if (data && data.client === 'dashboard') {
                    this.dashboardClients.add(socket.id);
                    console.log(`[SoundboardWS] Dashboard client registered: ${socket.id}`);
                    
                    // Send acknowledgment
                    socket.emit('soundboard:identified', { 
                        status: 'ok', 
                        clientId: socket.id 
                    });
                }
            });

            // Remove from tracking on disconnect
            socket.on('disconnect', () => {
                if (this.dashboardClients.has(socket.id)) {
                    this.dashboardClients.delete(socket.id);
                    console.log(`[SoundboardWS] Dashboard client disconnected: ${socket.id}`);
                }
            });
        });
    }

    /**
     * Broadcast preview event to all dashboard clients
     * 
     * @param {Object} payload - Preview payload
     * @param {string} payload.sourceType - "local" or "url"
     * @param {string} [payload.filename] - Filename for local sounds
     * @param {string} [payload.url] - URL for external sounds
     */
    broadcastPreview(payload) {
        if (!payload || !payload.sourceType) {
            console.error('[SoundboardWS] Invalid preview payload:', payload);
            return;
        }

        const message = {
            type: 'preview-sound',
            payload: {
                sourceType: payload.sourceType,
                ...(payload.filename && { filename: payload.filename }),
                ...(payload.url && { url: payload.url }),
                timestamp: Date.now()
            }
        };

        // Send to all dashboard clients
        let sentCount = 0;
        this.dashboardClients.forEach(socketId => {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit('soundboard:preview', message);
                sentCount++;
            } else {
                // Clean up stale socket ID
                this.dashboardClients.delete(socketId);
            }
        });

        console.log(`[SoundboardWS] Preview broadcast sent to ${sentCount} dashboard client(s):`, {
            sourceType: payload.sourceType,
            target: payload.filename || payload.url
        });
    }

    /**
     * Get count of connected dashboard clients
     * 
     * @returns {number} Number of connected dashboard clients
     */
    getDashboardClientCount() {
        return this.dashboardClients.size;
    }

    /**
     * Check if any dashboard clients are connected
     * 
     * @returns {boolean} True if at least one dashboard client is connected
     */
    hasDashboardClients() {
        return this.dashboardClients.size > 0;
    }
}

module.exports = SoundboardWebSocketTransport;
