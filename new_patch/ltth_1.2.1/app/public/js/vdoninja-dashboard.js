/**
 * VDO.Ninja Dashboard Client
 * PATCH: VDO.Ninja Multi-Guest Integration
 *
 * Handles all VDO.Ninja room and guest management from the dashboard
 */

// ============================================
// STATE MANAGEMENT
// ============================================

const vdoState = {
    activeRoom: null,
    guests: new Map(), // slot → guest object
    currentLayout: 'Grid 2x2'
};

// ============================================
// INITIALIZATION
// ============================================

// Support for both initial load and lazy loading
// If DOM is already loaded, run immediately; otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initVDONinja();
    });
} else {
    // DOM already loaded (lazy loading scenario)
    initVDONinja();
}

async function initVDONinja() {
    console.log('🎥 Initializing VDO.Ninja Dashboard Client...');

    // Check if VDO.Ninja plugin is enabled
    try {
        const response = await fetch('/api/plugins');
        const data = await response.json();

        if (data.success) {
            const vdoPlugin = data.plugins.find(p => p.id === 'vdoninja');
            if (!vdoPlugin || !vdoPlugin.enabled) {
                console.log('⏸️ VDO.Ninja plugin is disabled, skipping initialization');
                return;
            }
        }
    } catch (error) {
        console.error('❌ Error checking plugin status:', error);
        return;
    }

    // Load existing rooms for dropdown
    loadExistingRooms();

    // Get initial status
    getVDOStatus();

    // Setup Socket.IO listeners
    setupVDOSocketListeners();
}

// ============================================
// SOCKET.IO EVENT LISTENERS
// ============================================

function setupVDOSocketListeners() {
    if (!socket) {
        console.error('❌ Socket.IO not available');
        return;
    }

    // Room Events
    socket.on('vdoninja:room-created', (data) => {
        console.log('🏠 Room created:', data);
        handleRoomCreated(data);
    });

    socket.on('vdoninja:room-closed', () => {
        console.log('🔒 Room closed');
        handleRoomClosed();
    });

    // Guest Events
    socket.on('vdoninja:guest-joined', (data) => {
        console.log('👤 Guest joined:', data);
        handleGuestJoined(data);
    });

    socket.on('vdoninja:guest-left', (data) => {
        console.log('👋 Guest left:', data);
        handleGuestLeft(data);
    });

    socket.on('vdoninja:control-guest', (data) => {
        console.log('🎛️ Guest control:', data);
        handleGuestControl(data);
    });

    socket.on('vdoninja:solo-guest', (data) => {
        console.log('⭐ Solo guest:', data);
        showNotification(`Guest ${data.slot} is now in solo mode for ${data.duration}ms`, 'info');
    });

    // Layout Events
    socket.on('vdoninja:layout-changed', (data) => {
        console.log('🎨 Layout changed:', data);
        handleLayoutChanged(data);
    });

    // Status Events
    socket.on('vdoninja:all-guests-muted', () => {
        showNotification('All guests muted', 'success');
    });

    socket.on('vdoninja:all-guests-unmuted', () => {
        showNotification('All guests unmuted', 'success');
    });
}

// ============================================
// ROOM MANAGEMENT
// ============================================

async function createVDORoom() {
    const roomName = document.getElementById('vdo-new-room-name').value.trim();
    const maxGuests = parseInt(document.getElementById('vdo-new-room-max-guests').value);

    if (!roomName) {
        showNotification('Please enter a room name', 'error');
        return;
    }

    if (maxGuests < 1 || maxGuests > 12) {
        showNotification('Max guests must be between 1 and 12', 'error');
        return;
    }

    try {
        const response = await fetch('/api/vdoninja/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName, maxGuests })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(`Room "${roomName}" created successfully!`, 'success');
            document.getElementById('vdo-new-room-name').value = '';
            // Room will be activated via Socket.IO event
        } else {
            showNotification(data.error || 'Failed to create room', 'error');
        }
    } catch (error) {
        console.error('Error creating room:', error);
        showNotification('Error creating room', 'error');
    }
}

async function loadVDORoom() {
    const roomId = document.getElementById('vdo-existing-rooms').value;

    if (!roomId) {
        showNotification('Please select a room to load', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/vdoninja/rooms/${roomId}/load`, {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(`Room loaded: ${data.roomName}`, 'success');
            updateRoomUI(data);
        } else {
            showNotification(data.error || 'Failed to load room', 'error');
        }
    } catch (error) {
        console.error('Error loading room:', error);
        showNotification('Error loading room', 'error');
    }
}

async function closeVDORoom() {
    if (!vdoState.activeRoom) {
        showNotification('No active room to close', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to close the room "${vdoState.activeRoom.roomName}"? All guests will be disconnected.`)) {
        return;
    }

    try {
        const response = await fetch('/api/vdoninja/room/close', {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('Room closed', 'success');
            // UI will be updated via Socket.IO event
        } else {
            showNotification(data.error || 'Failed to close room', 'error');
        }
    } catch (error) {
        console.error('Error closing room:', error);
        showNotification('Error closing room', 'error');
    }
}

async function deleteVDORoom() {
    const roomId = document.getElementById('vdo-existing-rooms').value;

    if (!roomId) {
        showNotification('Please select a room to delete', 'error');
        return;
    }

    if (!confirm('Are you sure you want to DELETE this room? This action cannot be undone!')) {
        return;
    }

    try {
        const response = await fetch(`/api/vdoninja/rooms/${roomId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('Room deleted', 'success');
            loadExistingRooms();
        } else {
            showNotification(data.error || 'Failed to delete room', 'error');
        }
    } catch (error) {
        console.error('Error deleting room:', error);
        showNotification('Error deleting room', 'error');
    }
}

async function loadExistingRooms() {
    try {
        const response = await fetch('/api/vdoninja/rooms');
        const data = await response.json();

        const select = document.getElementById('vdo-existing-rooms');
        if (!select) {
            console.log('[VDO.Ninja] loadExistingRooms: UI elements not found (not on VDO.Ninja page)');
            return;
        }
        
        select.innerHTML = '<option value="">Select Room...</option>';

        if (data.rooms && data.rooms.length > 0) {
            data.rooms.forEach(room => {
                const option = document.createElement('option');
                option.value = room.room_id;
                option.textContent = `${room.room_name} (max: ${room.max_guests})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading rooms:', error);
    }
}

// ============================================
// GUEST MANAGEMENT
// ============================================

async function addVDOGuest() {
    const slot = parseInt(document.getElementById('vdo-manual-slot').value);
    const streamId = document.getElementById('vdo-manual-stream-id').value.trim();
    const guestName = document.getElementById('vdo-manual-guest-name').value.trim();

    if (isNaN(slot) || slot < 0) {
        showNotification('Invalid slot number', 'error');
        return;
    }

    if (!streamId || !guestName) {
        showNotification('Please enter stream ID and guest name', 'error');
        return;
    }

    try {
        const response = await fetch('/api/vdoninja/guests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slot, streamId, guestName })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(`Guest "${guestName}" added to slot ${slot}`, 'success');
            document.getElementById('vdo-manual-slot').value = '';
            document.getElementById('vdo-manual-stream-id').value = '';
            document.getElementById('vdo-manual-guest-name').value = '';
        } else {
            showNotification(data.error || 'Failed to add guest', 'error');
        }
    } catch (error) {
        console.error('Error adding guest:', error);
        showNotification('Error adding guest', 'error');
    }
}

async function removeVDOGuest(slot) {
    if (!confirm(`Remove guest from slot ${slot}?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/vdoninja/guests/${slot}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(`Guest removed from slot ${slot}`, 'success');
        } else {
            showNotification(data.error || 'Failed to remove guest', 'error');
        }
    } catch (error) {
        console.error('Error removing guest:', error);
        showNotification('Error removing guest', 'error');
    }
}

async function muteVDOGuest(slot, muteAudio = true, muteVideo = false) {
    try {
        const response = await fetch(`/api/vdoninja/guests/${slot}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'mute',
                muteAudio,
                muteVideo
            })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(`Guest ${slot} muted`, 'success');
        } else {
            showNotification(data.error || 'Failed to mute guest', 'error');
        }
    } catch (error) {
        console.error('Error muting guest:', error);
        showNotification('Error muting guest', 'error');
    }
}

async function unmuteVDOGuest(slot, unmuteAudio = true, unmuteVideo = false) {
    try {
        const response = await fetch(`/api/vdoninja/guests/${slot}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'unmute',
                unmuteAudio,
                unmuteVideo
            })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(`Guest ${slot} unmuted`, 'success');
        } else {
            showNotification(data.error || 'Failed to unmute guest', 'error');
        }
    } catch (error) {
        console.error('Error unmuting guest:', error);
        showNotification('Error unmuting guest', 'error');
    }
}

async function setVDOGuestVolume(slot, volume) {
    try {
        const response = await fetch(`/api/vdoninja/guests/${slot}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'volume',
                volume: parseFloat(volume)
            })
        });

        const data = await response.json();

        if (response.ok) {
            console.log(`Guest ${slot} volume set to ${volume}`);
        } else {
            showNotification(data.error || 'Failed to set volume', 'error');
        }
    } catch (error) {
        console.error('Error setting volume:', error);
        showNotification('Error setting volume', 'error');
    }
}

async function soloVDOGuest(slot, duration = 10000) {
    try {
        const response = await fetch(`/api/vdoninja/guests/${slot}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'solo',
                duration
            })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(`Guest ${slot} in solo mode for ${duration/1000}s`, 'success');
        } else {
            showNotification(data.error || 'Failed to solo guest', 'error');
        }
    } catch (error) {
        console.error('Error soloing guest:', error);
        showNotification('Error soloing guest', 'error');
    }
}

async function kickVDOGuest(slot, reason = 'Kicked by moderator') {
    if (!confirm(`Kick guest from slot ${slot}?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/vdoninja/guests/${slot}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'kick',
                reason
            })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(`Guest ${slot} kicked`, 'success');
        } else {
            showNotification(data.error || 'Failed to kick guest', 'error');
        }
    } catch (error) {
        console.error('Error kicking guest:', error);
        showNotification('Error kicking guest', 'error');
    }
}

async function muteAllVDOGuests() {
    try {
        const response = await fetch('/api/vdoninja/guests/mute-all', {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('All guests muted', 'success');
        } else {
            showNotification(data.error || 'Failed to mute all guests', 'error');
        }
    } catch (error) {
        console.error('Error muting all guests:', error);
        showNotification('Error muting all guests', 'error');
    }
}

async function unmuteAllVDOGuests() {
    try {
        const response = await fetch('/api/vdoninja/guests/unmute-all', {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('All guests unmuted', 'success');
        } else {
            showNotification(data.error || 'Failed to unmute all guests', 'error');
        }
    } catch (error) {
        console.error('Error unmuting all guests:', error);
        showNotification('Error unmuting all guests', 'error');
    }
}

// ============================================
// LAYOUT MANAGEMENT
// ============================================

async function changeVDOLayout(layoutName, transition = 'fade') {
    try {
        const response = await fetch('/api/vdoninja/layout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ layoutName, transition })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(`Layout changed to ${layoutName}`, 'success');
        } else {
            showNotification(data.error || 'Failed to change layout', 'error');
        }
    } catch (error) {
        console.error('Error changing layout:', error);
        showNotification('Error changing layout', 'error');
    }
}

// ============================================
// STATUS & STATE
// ============================================

async function getVDOStatus() {
    try {
        const response = await fetch('/api/vdoninja/status');
        const data = await response.json();

        if (response.ok) {
            updateVDOState(data);
        }
    } catch (error) {
        console.error('Error getting VDO status:', error);
    }
}

function updateVDOState(status) {
    vdoState.activeRoom = status.activeRoom;
    vdoState.currentLayout = status.currentLayout;

    // Update guests
    vdoState.guests.clear();
    if (status.guests) {
        status.guests.forEach(guest => {
            vdoState.guests.set(guest.slot, guest);
        });
    }

    // Update UI
    updateRoomUI(status.activeRoom);
    updateGuestListUI();
    updateLayoutUI(status.currentLayout);
}

// ============================================
// UI UPDATES
// ============================================

function updateRoomUI(roomData) {
    const roomNameEl = document.getElementById('vdo-room-name');
    const guestCountEl = document.getElementById('vdo-guest-count');
    const roomUrlsEl = document.getElementById('vdo-room-urls');
    const directorUrlEl = document.getElementById('vdo-director-url');
    const inviteUrlEl = document.getElementById('vdo-invite-url');
    const closeBtn = document.getElementById('vdo-close-room-btn');
    const deleteBtn = document.getElementById('vdo-delete-room-btn');
    const muteAllBtn = document.getElementById('vdo-mute-all-btn');
    const unmuteAllBtn = document.getElementById('vdo-unmute-all-btn');

    // Check if UI elements exist (only present on VDO.Ninja dedicated page)
    if (!roomNameEl || !guestCountEl) {
        console.log('[VDO.Ninja] updateRoomUI: UI elements not found (not on VDO.Ninja page)');
        return;
    }

    if (roomData) {
        vdoState.activeRoom = roomData;

        roomNameEl.textContent = roomData.roomName;
        roomNameEl.classList.remove('text-gray-400');
        roomNameEl.classList.add('text-green-400');

        guestCountEl.textContent = `${roomData.guestCount || 0}/${roomData.maxGuests}`;

        if (roomData.directorUrl && roomData.guestInviteUrl && directorUrlEl && inviteUrlEl && roomUrlsEl) {
            directorUrlEl.value = roomData.directorUrl;
            inviteUrlEl.value = roomData.guestInviteUrl;
            roomUrlsEl.classList.remove('hidden');
        }

        if (closeBtn) closeBtn.disabled = false;
        if (deleteBtn) deleteBtn.disabled = false;
        if (muteAllBtn) muteAllBtn.disabled = false;
        if (unmuteAllBtn) unmuteAllBtn.disabled = false;
    } else {
        vdoState.activeRoom = null;

        roomNameEl.textContent = 'No Active Room';
        roomNameEl.classList.add('text-gray-400');
        roomNameEl.classList.remove('text-green-400');

        guestCountEl.textContent = '0/6';
        if (roomUrlsEl) roomUrlsEl.classList.add('hidden');

        if (closeBtn) closeBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;
        if (muteAllBtn) muteAllBtn.disabled = true;
        if (unmuteAllBtn) unmuteAllBtn.disabled = true;
    }
}

function updateGuestListUI() {
    const guestListEl = document.getElementById('vdo-guest-list');
    
    // Check if UI element exists (only present on VDO.Ninja dedicated page)
    if (!guestListEl) {
        console.log('[VDO.Ninja] updateGuestListUI: UI elements not found (not on VDO.Ninja page)');
        return;
    }

    if (vdoState.guests.size === 0) {
        guestListEl.innerHTML = `
            <div class="text-center text-gray-400 py-8">
                No guests connected. Share the invite URL with your guests!
            </div>
        `;
        return;
    }

    guestListEl.innerHTML = '';

    const sortedGuests = Array.from(vdoState.guests.values()).sort((a, b) => a.slot - b.slot);

    sortedGuests.forEach(guest => {
        const guestCard = createGuestCard(guest);
        guestListEl.appendChild(guestCard);
    });
}

function createGuestCard(guest) {
    const card = document.createElement('div');
    card.className = 'bg-gray-700 p-4 rounded';
    card.id = `guest-card-${guest.slot}`;

    const audioStatus = guest.audioEnabled ? '🔊' : '🔇';
    const videoStatus = guest.videoEnabled ? '📹' : '📵';

    card.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
                <div class="text-2xl font-bold text-blue-400">#${guest.slot}</div>
                <div>
                    <div class="font-semibold">${escapeHtml(guest.name)}</div>
                    <div class="text-xs text-gray-400">Stream: ${escapeHtml(guest.streamId)}</div>
                </div>
            </div>
            <div class="text-2xl">
                <span id="audio-status-${guest.slot}">${audioStatus}</span>
                <span id="video-status-${guest.slot}">${videoStatus}</span>
            </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <button data-action="mute-vdo-audio" data-slot="${guest.slot}"
                    class="bg-orange-600 px-3 py-2 rounded hover:bg-orange-700 text-sm">
                🔇 Mute Audio
            </button>
            <button data-action="unmute-vdo-audio" data-slot="${guest.slot}"
                    class="bg-green-600 px-3 py-2 rounded hover:bg-green-700 text-sm">
                🔊 Unmute Audio
            </button>
            <button data-action="solo-vdo-guest" data-slot="${guest.slot}"
                    class="bg-purple-600 px-3 py-2 rounded hover:bg-purple-700 text-sm">
                ⭐ Solo 10s
            </button>
            <button data-action="kick-vdo-guest" data-slot="${guest.slot}"
                    class="bg-red-600 px-3 py-2 rounded hover:bg-red-700 text-sm">
                ❌ Kick
            </button>
        </div>

        <div class="flex items-center gap-2">
            <label class="text-sm text-gray-400">Volume:</label>
            <input type="range" min="0" max="1" step="0.1" value="${guest.volume}"
                   data-action="set-vdo-volume" data-slot="${guest.slot}"
                   class="flex-1">
            <span id="volume-label-${guest.slot}" class="text-sm font-semibold w-12 text-right">${Math.round(guest.volume * 100)}%</span>
        </div>
    `;

    // Add event listeners to buttons
    const muteBtn = card.querySelector('[data-action="mute-vdo-audio"]');
    const unmuteBtn = card.querySelector('[data-action="unmute-vdo-audio"]');
    const soloBtn = card.querySelector('[data-action="solo-vdo-guest"]');
    const kickBtn = card.querySelector('[data-action="kick-vdo-guest"]');
    const volumeSlider = card.querySelector('[data-action="set-vdo-volume"]');

    if (muteBtn) {
        muteBtn.addEventListener('click', () => muteVDOGuest(guest.slot, true, false));
    }
    if (unmuteBtn) {
        unmuteBtn.addEventListener('click', () => unmuteVDOGuest(guest.slot, true, false));
    }
    if (soloBtn) {
        soloBtn.addEventListener('click', () => soloVDOGuest(guest.slot, 10000));
    }
    if (kickBtn) {
        kickBtn.addEventListener('click', () => kickVDOGuest(guest.slot));
    }
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            setVDOGuestVolume(guest.slot, e.target.value);
            const label = document.getElementById(`volume-label-${guest.slot}`);
            if (label) {
                label.textContent = Math.round(e.target.value * 100) + '%';
            }
        });
    }

    return card;
}

function updateLayoutUI(layoutName) {
    vdoState.currentLayout = layoutName;
    const layoutEl = document.getElementById('vdo-current-layout');
    if (layoutEl) {
        layoutEl.textContent = layoutName;
    }
}

// ============================================
// EVENT HANDLERS (from Socket.IO)
// ============================================

function handleRoomCreated(data) {
    updateRoomUI({
        roomName: data.roomName,
        roomId: data.roomId,
        maxGuests: data.maxGuests,
        guestCount: 0,
        directorUrl: data.roomUrl,
        guestInviteUrl: data.inviteUrl
    });

    loadExistingRooms();
}

function handleRoomClosed() {
    updateRoomUI(null);
    vdoState.guests.clear();
    updateGuestListUI();
}

function handleGuestJoined(data) {
    vdoState.guests.set(data.slot, {
        slot: data.slot,
        streamId: data.streamId,
        name: data.guestName,
        audioEnabled: data.audioEnabled,
        videoEnabled: data.videoEnabled,
        volume: data.volume
    });

    updateGuestListUI();

    if (vdoState.activeRoom) {
        const guestCountEl = document.getElementById('vdo-guest-count');
        if (guestCountEl) {
            guestCountEl.textContent = `${vdoState.guests.size}/${vdoState.activeRoom.maxGuests}`;
        }
    }
}

function handleGuestLeft(data) {
    vdoState.guests.delete(data.slot);
    updateGuestListUI();

    if (vdoState.activeRoom) {
        const guestCountEl = document.getElementById('vdo-guest-count');
        if (guestCountEl) {
            guestCountEl.textContent = `${vdoState.guests.size}/${vdoState.activeRoom.maxGuests}`;
        }
    }
}

function handleGuestControl(data) {
    const guest = vdoState.guests.get(data.slot);
    if (!guest) return;

    // Update local state
    if (data.action === 'mute' || data.action === 'unmute') {
        guest.audioEnabled = data.audioEnabled;
        guest.videoEnabled = data.videoEnabled;

        // Update UI icons
        const audioStatusEl = document.getElementById(`audio-status-${data.slot}`);
        const videoStatusEl = document.getElementById(`video-status-${data.slot}`);

        if (audioStatusEl) {
            audioStatusEl.textContent = guest.audioEnabled ? '🔊' : '🔇';
        }
        if (videoStatusEl) {
            videoStatusEl.textContent = guest.videoEnabled ? '📹' : '📵';
        }
    } else if (data.action === 'volume') {
        guest.volume = data.volume;
    }
}

function handleLayoutChanged(data) {
    updateLayoutUI(data.layout);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function copyVDOUrl(inputId) {
    const input = document.getElementById(inputId);
    input.select();
    input.setSelectionRange(0, 99999); // For mobile devices

    try {
        document.execCommand('copy');
        showNotification('URL copied to clipboard!', 'success');
    } catch (err) {
        console.error('Failed to copy:', err);
        showNotification('Failed to copy URL', 'error');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    // Use existing notification system if available
    if (typeof addToast === 'function') {
        addToast(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

window.createVDORoom = createVDORoom;
window.loadVDORoom = loadVDORoom;
window.closeVDORoom = closeVDORoom;
window.deleteVDORoom = deleteVDORoom;
window.addVDOGuest = addVDOGuest;
window.removeVDOGuest = removeVDOGuest;
window.muteVDOGuest = muteVDOGuest;
window.unmuteVDOGuest = unmuteVDOGuest;
window.setVDOGuestVolume = setVDOGuestVolume;
window.soloVDOGuest = soloVDOGuest;
window.kickVDOGuest = kickVDOGuest;
window.muteAllVDOGuests = muteAllVDOGuests;
window.unmuteAllVDOGuests = unmuteAllVDOGuests;
window.changeVDOLayout = changeVDOLayout;
window.copyVDOUrl = copyVDOUrl;

console.log('✅ VDO.Ninja Dashboard Client loaded');
