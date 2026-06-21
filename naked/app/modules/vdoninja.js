/**
 * VDO.Ninja Multi-Guest Integration Module
 *
 * PATCH: VDO.Ninja Multi-Guest Integration
 *
 * Features:
 * - Room Management (create, delete, update)
 * - Guest Control (mute, unmute, volume, kick, solo)
 * - Layout Management (grid, solo, pip, custom)
 * - Event Broadcasting via Socket.IO
 * - Integration with TikTok Events via Flows
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class VDONinjaManager extends EventEmitter {
    constructor(db, io, logger) {
        super();
        this.db = db;
        this.io = io;
        this.logger = logger;

        // Active Room State
        this.activeRoom = null;
        this.guests = new Map(); // slot → guest data
        this.currentLayout = 'Grid 2x2';

        // VDO.Ninja Base URL
        this.VDO_BASE_URL = 'https://vdo.ninja';

        // Timer tracking für cleanup
        this.activeTimers = new Set();

        logger.info('✅ VDO.Ninja Manager initialized');
    }

    /**
     * Create a new VDO.Ninja Room
     * @param {string} roomName - Name of the room
     * @param {number} maxGuests - Maximum number of guests (default: 6)
     * @returns {Object} Room object with URLs
     */
    createRoom(roomName, maxGuests = 6) {
        const roomId = this.generateRoomId(roomName);
        const password = this.generatePassword();

        // Save to database
        const id = this.db.createVDONinjaRoom(roomName, roomId, password, maxGuests);

        // Generate URLs
        const directorUrl = `${this.VDO_BASE_URL}/?director=${roomId}&password=${password}&cleanoutput&api=${roomId}`;
        const guestInviteUrl = `${this.VDO_BASE_URL}/?push=${roomId}&room=${roomId}&password=${password}`;

        this.activeRoom = {
            id,
            roomName,
            roomId,
            password,
            maxGuests,
            directorUrl,
            guestInviteUrl
        };

        this.logger.info(`🏠 VDO.Ninja Room created: ${roomName} (${roomId})`);

        // Broadcast Event
        this.io.emit('vdoninja:room-created', {
            roomId,
            roomName,
            roomUrl: directorUrl,
            inviteUrl: guestInviteUrl,
            maxGuests
        });

        return this.activeRoom;
    }

    /**
     * Get active room information
     * @returns {Object|null} Active room or null
     */
    getActiveRoom() {
        return this.activeRoom;
    }

    /**
     * Load existing room
     * @param {string} roomId - Room ID to load
     */
    loadRoom(roomId) {
        const room = this.db.getVDONinjaRoom(roomId);
        if (!room) {
            throw new Error(`Room ${roomId} not found`);
        }

        this.activeRoom = {
            id: room.id,
            roomName: room.room_name,
            roomId: room.room_id,
            password: room.password,
            maxGuests: room.max_guests,
            directorUrl: `${this.VDO_BASE_URL}/?director=${room.room_id}&password=${room.password}&cleanoutput&api=${room.room_id}`,
            guestInviteUrl: `${this.VDO_BASE_URL}/?push=${room.room_id}&room=${room.room_id}&password=${room.password}`
        };

        // Load guests
        const guests = this.db.getGuestsByRoom(room.id);
        this.guests.clear();

        for (const guest of guests) {
            if (guest.is_connected) {
                this.guests.set(guest.slot_number, {
                    id: guest.id,
                    slot: guest.slot_number,
                    streamId: guest.stream_id,
                    name: guest.guest_name,
                    audioEnabled: Boolean(guest.audio_enabled),
                    videoEnabled: Boolean(guest.video_enabled),
                    volume: guest.volume,
                    isConnected: Boolean(guest.is_connected),
                    joinedAt: new Date(guest.joined_at)
                });
            }
        }

        this.logger.info(`📂 VDO.Ninja Room loaded: ${room.room_name} (${guests.length} guests)`);

        return this.activeRoom;
    }

    /**
     * Add guest to slot
     * @param {number} slot - Slot number (0-based)
     * @param {string} streamId - VDO.Ninja stream ID
     * @param {string} guestName - Guest name
     */
    addGuest(slot, streamId, guestName) {
        if (!this.activeRoom) {
            throw new Error('No active room');
        }

        if (this.guests.has(slot)) {
            throw new Error(`Slot ${slot} is already occupied`);
        }

        if (this.guests.size >= this.activeRoom.maxGuests) {
            throw new Error(`Room is full (max: ${this.activeRoom.maxGuests})`);
        }

        const guestId = this.db.addGuest(
            this.activeRoom.id,
            slot,
            streamId,
            guestName
        );

        const guest = {
            id: guestId,
            slot,
            streamId,
            name: guestName,
            audioEnabled: true,
            videoEnabled: true,
            volume: 1.0,
            isConnected: true,
            joinedAt: new Date()
        };

        this.guests.set(slot, guest);

        this.logger.info(`👤 Guest joined: ${guestName} (Slot ${slot})`);

        // Broadcast
        this.io.emit('vdoninja:guest-joined', {
            slot,
            streamId,
            guestName,
            audioEnabled: guest.audioEnabled,
            videoEnabled: guest.videoEnabled,
            volume: guest.volume
        });

        // Log event
        this.db.logGuestEvent(guestId, 'join', { streamId, guestName });

        return guest;
    }

    /**
     * Remove guest from slot
     * @param {number} slot - Slot number
     */
    removeGuest(slot) {
        const guest = this.guests.get(slot);
        if (!guest) {
            this.logger.warn(`Guest in slot ${slot} not found`);
            return;
        }

        this.db.logGuestEvent(guest.id, 'leave', { reason: 'manual' });
        this.db.removeGuest(guest.id);
        this.guests.delete(slot);

        this.logger.info(`👋 Guest left: ${guest.name} (Slot ${slot})`);

        // Broadcast
        this.io.emit('vdoninja:guest-left', {
            slot,
            guestName: guest.name
        });
    }

    /**
     * Mute/Unmute Guest
     * @param {number} slot - Slot number
     * @param {boolean} muteAudio - Mute audio
     * @param {boolean} muteVideo - Mute video
     */
    muteGuest(slot, muteAudio = true, muteVideo = false) {
        const guest = this.guests.get(slot);
        if (!guest) {
            throw new Error(`Guest in slot ${slot} not found`);
        }

        // Update State
        if (muteAudio) guest.audioEnabled = false;
        if (muteVideo) guest.videoEnabled = false;

        this.db.updateGuestStatus(guest.id, {
            audio_enabled: guest.audioEnabled ? 1 : 0,
            video_enabled: guest.videoEnabled ? 1 : 0
        });

        // Broadcast to Overlay (Overlay sends postMessage to iframe)
        this.io.emit('vdoninja:control-guest', {
            slot,
            action: 'mute',
            muteAudio,
            muteVideo,
            streamId: guest.streamId,
            audioEnabled: guest.audioEnabled,
            videoEnabled: guest.videoEnabled
        });

        this.logger.info(`🔇 Guest ${slot} muted (audio: ${muteAudio}, video: ${muteVideo})`);

        // Log event
        this.db.logGuestEvent(guest.id, 'mute', { muteAudio, muteVideo });
    }

    /**
     * Unmute Guest
     * @param {number} slot - Slot number
     * @param {boolean} unmuteAudio - Unmute audio
     * @param {boolean} unmuteVideo - Unmute video
     */
    unmuteGuest(slot, unmuteAudio = true, unmuteVideo = false) {
        const guest = this.guests.get(slot);
        if (!guest) {
            throw new Error(`Guest in slot ${slot} not found`);
        }

        if (unmuteAudio) guest.audioEnabled = true;
        if (unmuteVideo) guest.videoEnabled = true;

        this.db.updateGuestStatus(guest.id, {
            audio_enabled: guest.audioEnabled ? 1 : 0,
            video_enabled: guest.videoEnabled ? 1 : 0
        });

        this.io.emit('vdoninja:control-guest', {
            slot,
            action: 'unmute',
            unmuteAudio,
            unmuteVideo,
            streamId: guest.streamId,
            audioEnabled: guest.audioEnabled,
            videoEnabled: guest.videoEnabled
        });

        this.logger.info(`🔊 Guest ${slot} unmuted (audio: ${unmuteAudio}, video: ${unmuteVideo})`);

        // Log event
        this.db.logGuestEvent(guest.id, 'unmute', { unmuteAudio, unmuteVideo });
    }

    /**
     * Set Guest Volume
     * @param {number} slot - Slot number
     * @param {number} volume - Volume (0.0 - 1.0)
     */
    setGuestVolume(slot, volume) {
        const guest = this.guests.get(slot);
        if (!guest) {
            throw new Error(`Guest in slot ${slot} not found`);
        }

        guest.volume = Math.max(0, Math.min(1, volume));

        this.db.updateGuestStatus(guest.id, {
            volume: guest.volume
        });

        this.io.emit('vdoninja:control-guest', {
            slot,
            action: 'volume',
            volume: guest.volume,
            streamId: guest.streamId
        });

        this.logger.info(`🔊 Guest ${slot} volume set to ${guest.volume}`);

        // Log event
        this.db.logGuestEvent(guest.id, 'volume', { volume: guest.volume });
    }

    /**
     * Solo Guest (hide all others temporarily)
     * @param {number} slot - Slot number
     * @param {number} duration - Duration in milliseconds (0 = permanent)
     */
    async soloGuest(slot, duration = 10000) {
        const guest = this.guests.get(slot);
        if (!guest) {
            throw new Error(`Guest in slot ${slot} not found`);
        }

        this.io.emit('vdoninja:solo-guest', {
            slot,
            duration,
            guestName: guest.name
        });

        this.logger.info(`⭐ Solo mode: Guest ${slot} for ${duration}ms`);

        // Log event
        this.db.logGuestEvent(guest.id, 'solo', { duration });

        // After duration, return to normal layout
        if (duration > 0) {
            const timer = setTimeout(() => {
                this.activeTimers.delete(timer);
                this.changeLayout(this.currentLayout);
            }, duration);
            this.activeTimers.add(timer);
        }
    }

    /**
     * Change Layout
     * @param {string} layoutName - Layout name (e.g., 'Grid 2x2', 'Solo', 'PIP')
     * @param {string} transition - Transition type (fade, slide, none)
     */
    changeLayout(layoutName, transition = 'fade') {
        this.currentLayout = layoutName;

        this.io.emit('vdoninja:layout-changed', {
            layout: layoutName,
            transition
        });

        this.logger.info(`🎨 Layout changed: ${layoutName} (${transition})`);
    }

    /**
     * Kick Guest
     * @param {number} slot - Slot number
     * @param {string} reason - Kick reason
     */
    kickGuest(slot, reason = 'Kicked') {
        const guest = this.guests.get(slot);
        if (!guest) {
            throw new Error(`Guest in slot ${slot} not found`);
        }

        // Log Event
        this.db.logGuestEvent(guest.id, 'kick', { reason });

        // postMessage to iframe → close connection
        this.io.emit('vdoninja:control-guest', {
            slot,
            action: 'kick',
            streamId: guest.streamId,
            reason
        });

        // Remove guest
        this.removeGuest(slot);

        this.logger.warn(`❌ Guest ${slot} kicked: ${reason}`);
    }

    /**
     * Mute all guests
     */
    muteAllGuests() {
        this.logger.info('🔇 Muting all guests');

        for (const [slot, guest] of this.guests.entries()) {
            this.muteGuest(slot, true, false);
        }

        this.io.emit('vdoninja:all-guests-muted');
    }

    /**
     * Unmute all guests
     */
    unmuteAllGuests() {
        this.logger.info('🔊 Unmuting all guests');

        for (const [slot, guest] of this.guests.entries()) {
            this.unmuteGuest(slot, true, false);
        }

        this.io.emit('vdoninja:all-guests-unmuted');
    }

    /**
     * Get guest status
     * @param {number} slot - Slot number
     * @returns {Object|null} Guest status or null
     */
    getGuestStatus(slot) {
        return this.guests.get(slot) || null;
    }

    /**
     * Get all guests
     * @returns {Array} Array of guest objects
     */
    getAllGuests() {
        return Array.from(this.guests.values());
    }

    /**
     * Get all guests (alias for getAllGuests)
     * @returns {Array} Array of guest objects
     */
    getGuests() {
        return this.getAllGuests();
    }

    /**
     * Get guest count
     * @returns {number} Number of connected guests
     */
    getGuestCount() {
        return this.guests.size;
    }

    /**
     * Check if slot is available
     * @param {number} slot - Slot number
     * @returns {boolean} True if slot is available
     */
    isSlotAvailable(slot) {
        return !this.guests.has(slot);
    }

    /**
     * Get next available slot
     * @returns {number|null} Next available slot number or null if full
     */
    getNextAvailableSlot() {
        if (!this.activeRoom) return null;

        for (let i = 0; i < this.activeRoom.maxGuests; i++) {
            if (!this.guests.has(i)) {
                return i;
            }
        }

        return null;
    }

    /**
     * Close Room
     */
    closeRoom() {
        if (!this.activeRoom) {
            this.logger.warn('No active room to close');
            return;
        }

        const roomName = this.activeRoom.roomName;

        // Remove all guests
        for (const slot of this.guests.keys()) {
            this.removeGuest(slot);
        }

        // Clear all active timers
        for (const timer of this.activeTimers) {
            clearTimeout(timer);
        }
        this.activeTimers.clear();

        this.activeRoom = null;
        this.currentLayout = 'Grid 2x2';

        this.logger.info(`🔒 Room closed: ${roomName}`);

        this.io.emit('vdoninja:room-closed');
    }

    /**
     * Get all rooms from database
     * @returns {Array} Array of room objects
     */
    getAllRooms() {
        return this.db.getAllVDONinjaRooms();
    }

    /**
     * Get room by roomId
     * @param {string} roomId - Room ID
     * @returns {Object|null} Room object or null
     */
    getRoom(roomId) {
        return this.db.getVDONinjaRoom(roomId);
    }

    /**
     * Delete room from database
     * @param {string} roomId - Room ID
     */
    deleteRoom(roomId) {
        const room = this.db.getVDONinjaRoom(roomId);
        if (!room) {
            throw new Error(`Room ${roomId} not found`);
        }

        // Close if active
        if (this.activeRoom && this.activeRoom.roomId === roomId) {
            this.closeRoom();
        }

        this.db.deleteVDONinjaRoom(room.id);
        this.logger.info(`🗑️ Room deleted: ${room.room_name}`);
    }

    /**
     * Get all available layouts
     * @returns {Array} Array of layout presets
     */
    getAllLayouts() {
        return this.db.getAllLayouts();
    }

    /**
     * Get all available layouts (alias for getAllLayouts)
     * @returns {Array} Array of layout presets
     */
    getLayouts() {
        return this.getAllLayouts();
    }

    /**
     * Save custom layout
     * @param {string} name - Layout name
     * @param {string} type - Layout type
     * @param {Object} config - Layout configuration
     * @returns {number} Layout ID
     */
    saveCustomLayout(name, type, config) {
        const id = this.db.saveLayout(name, type, config);
        this.logger.info(`💾 Custom layout saved: ${name}`);
        return id;
    }

    /**
     * Save layout (alias for saveCustomLayout)
     * @param {string} name - Layout name
     * @param {Object} config - Layout configuration
     * @returns {number} Layout ID
     */
    saveLayout(name, config) {
        // Default to 'custom' type
        return this.saveCustomLayout(name, 'custom', config);
    }

    /**
     * Delete layout
     * @param {number} id - Layout ID
     */
    deleteLayout(id) {
        this.db.deleteLayout(id);
        this.logger.info(`🗑️ Layout deleted: ${id}`);
    }

    /**
     * Get guest event history
     * @param {number} slot - Slot number
     * @param {number} limit - Maximum number of events
     * @returns {Array} Array of event objects
     */
    getGuestEventHistory(slot, limit = 100) {
        const guest = this.guests.get(slot);
        if (!guest) {
            throw new Error(`Guest in slot ${slot} not found`);
        }

        return this.db.getGuestEventHistory(guest.id, limit);
    }

    /**
     * Get guest history (alias for getGuestEventHistory)
     * @param {number} slot - Slot number
     * @param {number} limit - Maximum number of events
     * @returns {Array} Array of event objects
     */
    getGuestHistory(slot, limit = 100) {
        return this.getGuestEventHistory(slot, limit);
    }

    /**
     * Helper Functions
     */

    /**
     * Generate unique room ID
     * @param {string} roomName - Room name
     * @returns {string} Unique room ID (12 characters)
     */
    generateRoomId(roomName) {
        // Use crypto.randomBytes instead of Math.random() for cryptographic security
        const randomBytes = crypto.randomBytes(16).toString('hex');
        const hash = crypto.createHash('sha256')
            .update(roomName + Date.now() + randomBytes)
            .digest('hex');
        return hash.substring(0, 12);
    }

    /**
     * Generate secure password
     * @returns {string} Random password (16 characters)
     */
    generatePassword() {
        return crypto.randomBytes(8).toString('hex');
    }

    /**
     * Get status
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            hasActiveRoom: this.activeRoom !== null,
            activeRoom: this.activeRoom ? {
                roomName: this.activeRoom.roomName,
                roomId: this.activeRoom.roomId,
                maxGuests: this.activeRoom.maxGuests,
                guestCount: this.guests.size,
                directorUrl: this.activeRoom.directorUrl,
                guestInviteUrl: this.activeRoom.guestInviteUrl
            } : null,
            currentLayout: this.currentLayout,
            guests: this.getAllGuests()
        };
    }
}

module.exports = VDONinjaManager;
