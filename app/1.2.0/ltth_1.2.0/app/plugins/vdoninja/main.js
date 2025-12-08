/**
 * VDO.Ninja Multi-Guest Plugin
 * Wrapper für das VDONinjaManager-Modul
 */

const path = require('path');
const VDONinjaManager = require('../../modules/vdoninja');

class VDONinjaPlugin {
    constructor(api) {
        this.api = api;
        this.db = api.getDatabase();
        this.io = api.getSocketIO();

        // VDONinjaManager instanziieren
        this.manager = new VDONinjaManager(this.db, this.io, {
            info: (msg) => this.api.log(msg, 'info'),
            warn: (msg) => this.api.log(msg, 'warn'),
            error: (msg) => this.api.log(msg, 'error'),
            debug: (msg) => this.api.log(msg, 'info')
        });
    }

    async init() {
        this.api.log('VDO.Ninja Plugin initializing...');

        // API-Routen registrieren
        this.registerRoutes();

        // Socket-Events registrieren
        this.registerSocketEvents();

        this.api.log('VDO.Ninja Plugin initialized successfully');
    }

    registerRoutes() {
        // UI Route
        this.api.registerRoute('GET', '/vdoninja/ui', (req, res) => {
            res.sendFile(path.join(__dirname, 'ui.html'));
        });

        // GET /api/vdoninja/rooms - Alle Räume
        this.api.registerRoute('GET', '/api/vdoninja/rooms', async (req, res) => {
            try {
                const rooms = await this.manager.getAllRooms();
                res.json({ success: true, rooms });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/vdoninja/rooms - Raum erstellen
        this.api.registerRoute('POST', '/api/vdoninja/rooms', async (req, res) => {
            try {
                const { roomName, maxGuests } = req.body;
                const room = await this.manager.createRoom(roomName, maxGuests);
                res.json({ success: true, room });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET /api/vdoninja/rooms/:roomId - Raum Details
        this.api.registerRoute('GET', '/api/vdoninja/rooms/:roomId', async (req, res) => {
            try {
                const room = await this.manager.getRoom(req.params.roomId);
                if (room) {
                    res.json({ success: true, room });
                } else {
                    res.status(404).json({ success: false, error: 'Room not found' });
                }
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/vdoninja/rooms/:roomId/load - Raum laden
        this.api.registerRoute('POST', '/api/vdoninja/rooms/:roomId/load', async (req, res) => {
            try {
                await this.manager.loadRoom(req.params.roomId);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // DELETE /api/vdoninja/rooms/:roomId - Raum löschen
        this.api.registerRoute('DELETE', '/api/vdoninja/rooms/:roomId', async (req, res) => {
            try {
                await this.manager.deleteRoom(req.params.roomId);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET /api/vdoninja/room/active - Aktiver Raum
        this.api.registerRoute('GET', '/api/vdoninja/room/active', async (req, res) => {
            try {
                const activeRoom = this.manager.getActiveRoom();
                res.json({ success: true, activeRoom });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/vdoninja/room/close - Raum schließen
        this.api.registerRoute('POST', '/api/vdoninja/room/close', async (req, res) => {
            try {
                await this.manager.closeRoom();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET /api/vdoninja/guests - Alle Guests
        this.api.registerRoute('GET', '/api/vdoninja/guests', async (req, res) => {
            try {
                const guests = await this.manager.getGuests();
                res.json({ success: true, guests });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/vdoninja/guests - Guest hinzufügen
        this.api.registerRoute('POST', '/api/vdoninja/guests', async (req, res) => {
            try {
                const { slot, streamId, guestName } = req.body;
                const guest = await this.manager.addGuest(slot, streamId, guestName);
                res.json({ success: true, guest });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET /api/vdoninja/guests/:slot/status - Guest Status
        this.api.registerRoute('GET', '/api/vdoninja/guests/:slot/status', async (req, res) => {
            try {
                const status = await this.manager.getGuestStatus(parseInt(req.params.slot));
                res.json({ success: true, status });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // DELETE /api/vdoninja/guests/:slot - Guest entfernen
        this.api.registerRoute('DELETE', '/api/vdoninja/guests/:slot', async (req, res) => {
            try {
                await this.manager.removeGuest(parseInt(req.params.slot));
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/vdoninja/guests/:slot/control - Guest kontrollieren
        this.api.registerRoute('POST', '/api/vdoninja/guests/:slot/control', async (req, res) => {
            try {
                const { action, ...params } = req.body;
                let result;

                switch (action) {
                    case 'mute':
                        result = await this.manager.muteGuest(parseInt(req.params.slot), params.audioEnabled, params.videoEnabled);
                        break;
                    case 'unmute':
                        result = await this.manager.unmuteGuest(parseInt(req.params.slot), params.audioEnabled, params.videoEnabled);
                        break;
                    case 'volume':
                        result = await this.manager.setGuestVolume(parseInt(req.params.slot), params.volume);
                        break;
                    case 'kick':
                        result = await this.manager.kickGuest(parseInt(req.params.slot), params.reason);
                        break;
                    case 'solo':
                        result = await this.manager.soloGuest(parseInt(req.params.slot), params.duration);
                        break;
                    default:
                        throw new Error(`Unknown action: ${action}`);
                }

                res.json({ success: true, result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/vdoninja/guests/mute-all - Alle muten
        this.api.registerRoute('POST', '/api/vdoninja/guests/mute-all', async (req, res) => {
            try {
                await this.manager.muteAllGuests();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/vdoninja/guests/unmute-all - Alle unmuten
        this.api.registerRoute('POST', '/api/vdoninja/guests/unmute-all', async (req, res) => {
            try {
                await this.manager.unmuteAllGuests();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/vdoninja/layout - Layout setzen
        this.api.registerRoute('POST', '/api/vdoninja/layout', async (req, res) => {
            try {
                const { layout, transition } = req.body;
                await this.manager.changeLayout(layout, transition);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET /api/vdoninja/layouts - Layout-Presets
        this.api.registerRoute('GET', '/api/vdoninja/layouts', async (req, res) => {
            try {
                const layouts = await this.manager.getLayouts();
                res.json({ success: true, layouts });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/vdoninja/layouts - Custom Layout speichern
        this.api.registerRoute('POST', '/api/vdoninja/layouts', async (req, res) => {
            try {
                const { name, config } = req.body;
                const layout = await this.manager.saveLayout(name, config);
                res.json({ success: true, layout });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // DELETE /api/vdoninja/layouts/:id - Layout löschen
        this.api.registerRoute('DELETE', '/api/vdoninja/layouts/:id', async (req, res) => {
            try {
                await this.manager.deleteLayout(parseInt(req.params.id));
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET /api/vdoninja/status - VDO.Ninja Status
        this.api.registerRoute('GET', '/api/vdoninja/status', async (req, res) => {
            try {
                const status = this.manager.getStatus();
                res.json({ success: true, status });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET /api/vdoninja/guests/:slot/history - Guest History
        this.api.registerRoute('GET', '/api/vdoninja/guests/:slot/history', async (req, res) => {
            try {
                const history = await this.manager.getGuestHistory(parseInt(req.params.slot));
                res.json({ success: true, history });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    registerSocketEvents() {
        this.api.registerSocket('vdoninja:create-room', async (socket, data) => {
            try {
                const room = await this.manager.createRoom(data.roomName, data.maxGuests);
                socket.emit('vdoninja:room-created', { success: true, room });
            } catch (error) {
                socket.emit('vdoninja:error', { error: error.message });
            }
        });

        this.api.registerSocket('vdoninja:load-room', async (socket, data) => {
            try {
                await this.manager.loadRoom(data.roomId);
                socket.emit('vdoninja:room-loaded', { success: true });
            } catch (error) {
                socket.emit('vdoninja:error', { error: error.message });
            }
        });

        this.api.registerSocket('vdoninja:close-room', async (socket) => {
            try {
                await this.manager.closeRoom();
                socket.emit('vdoninja:room-closed', { success: true });
            } catch (error) {
                socket.emit('vdoninja:error', { error: error.message });
            }
        });

        this.api.registerSocket('vdoninja:guest-joined', async (socket, data) => {
            try {
                await this.manager.addGuest(data.slot, data.streamId, data.guestName);
            } catch (error) {
                socket.emit('vdoninja:error', { error: error.message });
            }
        });

        this.api.registerSocket('vdoninja:guest-left', async (socket, data) => {
            try {
                await this.manager.removeGuest(data.slot);
            } catch (error) {
                socket.emit('vdoninja:error', { error: error.message });
            }
        });

        this.api.registerSocket('vdoninja:control-guest', async (socket, data) => {
            try {
                const { slot, action, ...params } = data;

                switch (action) {
                    case 'mute':
                        await this.manager.muteGuest(slot, params.audioEnabled, params.videoEnabled);
                        break;
                    case 'unmute':
                        await this.manager.unmuteGuest(slot, params.audioEnabled, params.videoEnabled);
                        break;
                    case 'volume':
                        await this.manager.setGuestVolume(slot, params.volume);
                        break;
                    case 'kick':
                        await this.manager.kickGuest(slot, params.reason);
                        break;
                    case 'solo':
                        await this.manager.soloGuest(slot, params.duration);
                        break;
                }

                socket.emit('vdoninja:control-success', { success: true });
            } catch (error) {
                socket.emit('vdoninja:error', { error: error.message });
            }
        });

        this.api.registerSocket('vdoninja:change-layout', async (socket, data) => {
            try {
                await this.manager.changeLayout(data.layout, data.transition);
                socket.emit('vdoninja:layout-changed', { success: true });
            } catch (error) {
                socket.emit('vdoninja:error', { error: error.message });
            }
        });

        this.api.registerSocket('vdoninja:get-status', async (socket) => {
            try {
                const status = this.manager.getStatus();
                socket.emit('vdoninja:status', { success: true, status });
            } catch (error) {
                socket.emit('vdoninja:error', { error: error.message });
            }
        });
    }

    // Mache Manager für Flows verfügbar
    getManager() {
        return this.manager;
    }

    async destroy() {
        this.api.log('VDO.Ninja Plugin shutting down...');
        if (this.manager && typeof this.manager.closeRoom === 'function') {
            await this.manager.closeRoom();
        }
    }
}

module.exports = VDONinjaPlugin;
