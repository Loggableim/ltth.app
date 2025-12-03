const socket = io();
let currentConfig = {};

// Status-Updates empfangen
socket.on('osc:status', (status) => {
    updateStatus(status);
});

// OSC-Nachrichten loggen (wenn verbose)
socket.on('osc:sent', (data) => {
    if (currentConfig.verboseMode) {
        addLog('send', `${data.address} → ${JSON.stringify(data.args)}`);
    }
});

socket.on('osc:received', (data) => {
    if (currentConfig.verboseMode) {
        addLog('recv', `${data.address} ← ${JSON.stringify(data.args)} from ${data.source}`);
    }
});

// Config laden
async function loadConfig() {
    const response = await fetch('/api/osc/config');
    const data = await response.json();

    if (data.success) {
        currentConfig = data.config;
        populateForm(currentConfig);
        toggleLogViewer(currentConfig.verboseMode);
    }
}

function populateForm(config) {
    document.getElementById('enabled').checked = config.enabled || false;
    document.getElementById('sendHost').value = config.sendHost || '127.0.0.1';
    document.getElementById('sendPort').value = config.sendPort || 9000;
    document.getElementById('receivePort').value = config.receivePort || 9001;
    document.getElementById('verboseMode').checked = config.verboseMode || false;
}

function toggleLogViewer(show) {
    document.getElementById('log-card').style.display = show ? 'block' : 'none';
}

// Status aktualisieren
function updateStatus(status) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');

    if (status.isRunning) {
        indicator.className = 'status-indicator running';
        statusText.textContent = 'Aktiv';
    } else {
        indicator.className = 'status-indicator stopped';
        statusText.textContent = 'Gestoppt';
    }

    // Statistiken
    document.getElementById('stat-sent').textContent = status.stats.messagesSent || 0;
    document.getElementById('stat-received').textContent = status.stats.messagesReceived || 0;
    document.getElementById('stat-errors').textContent = status.stats.errors || 0;
    document.getElementById('stat-uptime').textContent = formatUptime(status.uptime || 0);
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

// Config speichern
const configForm = document.getElementById('config-form');
if (configForm) {
    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const enabled = document.getElementById('enabled');
        const sendHost = document.getElementById('sendHost');
        const sendPort = document.getElementById('sendPort');
        const receivePort = document.getElementById('receivePort');
        const verboseMode = document.getElementById('verboseMode');

        if (!enabled || !sendHost || !sendPort || !receivePort || !verboseMode) {
            console.warn('Config form elements not found');
            return;
        }

        const config = {
            enabled: enabled.checked,
            sendHost: sendHost.value,
            sendPort: parseInt(sendPort.value),
            receivePort: parseInt(receivePort.value),
            verboseMode: verboseMode.checked
        };

    const response = await fetch('/api/osc/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });

    const data = await response.json();

        if (data.success) {
            alert('Konfiguration gespeichert!');
            currentConfig = data.config;
            toggleLogViewer(currentConfig.verboseMode);
        } else {
            alert('Fehler beim Speichern: ' + data.error);
        }
    });
}

// Bridge starten/stoppen
const btnStart = document.getElementById('btn-start');
if (btnStart) {
    btnStart.addEventListener('click', async () => {
        const response = await fetch('/api/osc/start', { method: 'POST' });
        const data = await response.json();

        if (!data.success) {
            alert('Fehler beim Starten: ' + data.error);
        }
    });
}

const btnStop = document.getElementById('btn-stop');
if (btnStop) {
    btnStop.addEventListener('click', async () => {
        const response = await fetch('/api/osc/stop', { method: 'POST' });
        const data = await response.json();

        if (!data.success) {
            alert('Fehler beim Stoppen: ' + data.error);
        }
    });
}

// Test-Signal
const btnTest = document.getElementById('btn-test');
if (btnTest) {
    btnTest.addEventListener('click', async () => {
        const response = await fetch('/api/osc/test', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            alert(`Test-Signal gesendet: ${data.address} = ${data.value}`);
        } else {
            alert('Fehler: ' + data.error);
        }
    });
}

// VRChat Parameter senden
async function sendVRChatParam(action, slot) {
    let endpoint = `/api/osc/vrchat/${action}`;

    const body = {};
    if (action === 'emote') {
        body.slot = slot;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!data.success) {
        alert('Fehler: OSC-Bridge nicht aktiv');
    }
}

// VRChat Parameter Button Event Listeners
document.querySelectorAll('.param-btn').forEach(button => {
    button.addEventListener('click', () => {
        const action = button.dataset.action;
        const slot = button.dataset.slot;

        if (action === 'emote' && slot !== undefined) {
            sendVRChatParam(action, parseInt(slot));
        } else {
            sendVRChatParam(action);
        }
    });
});

// Log-Einträge hinzufügen
function addLog(type, message) {
    const logViewer = document.getElementById('log-viewer');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logViewer.insertBefore(entry, logViewer.firstChild);

    // Limit: 100 Einträge
    while (logViewer.children.length > 100) {
        logViewer.removeChild(logViewer.lastChild);
    }
}

// Parse value helper function
function parseOSCValue(valueInput) {
    let value = valueInput;
    if (valueInput === 'true') value = true;
    else if (valueInput === 'false') value = false;
    else if (!isNaN(valueInput) && valueInput !== '') value = parseFloat(valueInput);
    return value;
}

// Initial laden
loadConfig();
loadCustomPresets();

// Status alle 2 Sekunden aktualisieren
socket.emit('osc:get-status');
setInterval(() => {
    socket.emit('osc:get-status');
}, 2000);

// Custom OSC Action Form Handler
const customOscForm = document.getElementById('custom-osc-form');
if (customOscForm) {
    customOscForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const address = document.getElementById('custom-address').value;
        const valueInput = document.getElementById('custom-value').value;
        const duration = parseInt(document.getElementById('custom-duration').value) || 0;

        const value = parseOSCValue(valueInput);

        await sendCustomOSC(address, value, duration);
    });
}

// Save Custom Preset Button
const btnSaveCustom = document.getElementById('btn-save-custom');
if (btnSaveCustom) {
    btnSaveCustom.addEventListener('click', () => {
        const address = document.getElementById('custom-address').value;
        const valueInput = document.getElementById('custom-value').value;
        const duration = parseInt(document.getElementById('custom-duration').value) || 0;

        if (!address) {
            alert('Bitte geben Sie eine OSC-Adresse ein');
            return;
        }

        saveCustomPreset(address, valueInput, duration);
    });
}

// Send Custom OSC Message
async function sendCustomOSC(address, value, duration = 0) {
    if (!address) {
        alert('Bitte geben Sie eine OSC-Adresse ein');
        return;
    }

    const response = await fetch('/api/osc/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: address,
            args: [value]
        })
    });

    const data = await response.json();

    if (data.success) {
        console.log('Custom OSC sent:', address, value);
        
        // Auto-reset if duration is set
        if (duration > 0) {
            setTimeout(async () => {
                await fetch('/api/osc/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        address: address,
                        args: [0]
                    })
                });
            }, duration);
        }
    } else {
        alert('Fehler beim Senden: ' + (data.error || 'OSC-Bridge nicht aktiv'));
    }
}

// Save Custom Preset to localStorage
function saveCustomPreset(address, value, duration) {
    let presets = JSON.parse(localStorage.getItem('osc-custom-presets') || '[]');
    
    // Create a name from the address
    const name = address.split('/').pop() || address;
    
    // Generate unique ID
    let id = Date.now();
    while (presets.some(p => p.id === id)) {
        id++;
    }
    
    const preset = {
        id: id,
        name: name,
        address: address,
        value: value,
        duration: duration
    };

    presets.push(preset);
    localStorage.setItem('osc-custom-presets', JSON.stringify(presets));
    
    loadCustomPresets();
    alert('Preset gespeichert!');
}

// Load Custom Presets from localStorage
function loadCustomPresets() {
    const presets = JSON.parse(localStorage.getItem('osc-custom-presets') || '[]');
    const container = document.getElementById('presets-container');
    
    if (!container) return;
    
    if (presets.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-muted); font-size: 0.9em;">Keine Presets gespeichert</p>';
        return;
    }

    container.innerHTML = presets.map(preset => `
        <button class="param-btn" data-preset-id="${preset.id}">
            🎯 ${preset.name}
            <small style="display: block; font-size: 0.8em; opacity: 0.7;">${preset.address}</small>
        </button>
    `).join('');

    // Add click handlers to preset buttons
    container.querySelectorAll('.param-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetId = parseInt(btn.dataset.presetId);
            const preset = presets.find(p => p.id === presetId);
            if (preset) {
                const value = parseOSCValue(preset.value);
                sendCustomOSC(preset.address, value, preset.duration);
            }
        });
        
        // Add right-click to delete
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const presetId = parseInt(btn.dataset.presetId);
            if (confirm('Preset löschen?')) {
                deleteCustomPreset(presetId);
            }
        });
    });
}

// Delete Custom Preset
function deleteCustomPreset(presetId) {
    let presets = JSON.parse(localStorage.getItem('osc-custom-presets') || '[]');
    presets = presets.filter(p => p.id !== presetId);
    localStorage.setItem('osc-custom-presets', JSON.stringify(presets));
    loadCustomPresets();
}

// ========== GIFT MAPPINGS ==========
let giftMappings = [];
let giftCatalog = [];

async function loadGiftCatalog() {
    try {
        const response = await fetch('/api/gift-catalog');
        const data = await response.json();
        
        if (data.success) {
            giftCatalog = data.catalog || [];
            populateGiftCatalogSelector();
        }
    } catch (error) {
        console.error('Error loading gift catalog:', error);
        giftCatalog = [];
    }
}

function populateGiftCatalogSelector() {
    const selector = document.getElementById('gift-catalog-selector');
    
    if (!selector) return;
    
    // Clear existing options except the first one
    selector.innerHTML = '<option value="">-- Select a gift from catalogue or enter manually below --</option>';
    
    if (giftCatalog.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '(No gifts in catalogue - update catalogue from main dashboard)';
        option.disabled = true;
        selector.appendChild(option);
        return;
    }
    
    // Add gifts to selector, sorted by diamond count (most expensive first)
    giftCatalog
        .sort((a, b) => (b.diamond_count || 0) - (a.diamond_count || 0))
        .forEach(gift => {
            const option = document.createElement('option');
            option.value = JSON.stringify({ id: gift.id, name: gift.name });
            
            // Format: "Rose (💎 1) - ID: 5655"
            const diamondCount = gift.diamond_count || 0;
            option.textContent = `${gift.name} (💎 ${diamondCount}) - ID: ${gift.id}`;
            
            selector.appendChild(option);
        });
}

async function loadGiftMappings() {
    try {
        const response = await fetch('/api/osc/gift-mappings');
        const data = await response.json();
        
        if (data.success) {
            giftMappings = data.mappings || [];
            renderGiftMappings();
        }
    } catch (error) {
        console.error('Error loading gift mappings:', error);
    }
}

function renderGiftMappings() {
    const tbody = document.getElementById('gift-mappings-tbody');
    
    if (!tbody) return;
    
    if (giftMappings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No gift mappings configured yet. Add one below.</td></tr>';
        return;
    }
    
    tbody.innerHTML = giftMappings.map((mapping, index) => {
        // Escape HTML to prevent XSS
        const escapedGiftId = (mapping.giftId || '-').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const escapedGiftName = (mapping.giftName || '-').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const escapedAction = (mapping.action || '-').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const params = JSON.stringify(mapping.params || {}).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        return `
            <tr>
                <td>${escapedGiftId}</td>
                <td>${escapedGiftName}</td>
                <td>${escapedAction}</td>
                <td><code style="font-size: 11px;">${params}</code></td>
                <td>
                    <button class="btn btn-danger btn-small btn-remove-gift-mapping" data-index="${index}">Remove</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Setup event delegation for gift mappings table
function setupGiftMappingsEventDelegation() {
    const tbody = document.getElementById('gift-mappings-tbody');
    if (!tbody) return;
    
    tbody.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('btn-remove-gift-mapping')) {
            const index = parseInt(target.dataset.index, 10);
            removeGiftMapping(index);
        }
    });
}

function addGiftMapping() {
    const giftId = document.getElementById('new-gift-id').value;
    const giftName = document.getElementById('new-gift-name').value;
    const action = document.getElementById('new-gift-action').value;
    const duration = parseInt(document.getElementById('new-gift-duration').value) || 2000;
    const slot = parseInt(document.getElementById('new-gift-slot').value) || 0;
    const param = document.getElementById('new-gift-param').value;
    
    if (!giftId && !giftName) {
        alert('Please enter either Gift ID or Gift Name (or both for exact match)');
        return;
    }
    
    const params = { duration };
    
    if (action === 'emote') {
        params.slot = slot;
    } else if (action === 'avatar' && param) {
        params.avatarId = param;
    } else if (action === 'custom_parameter' && param) {
        params.parameterName = param;
        params.value = 1;
    }
    
    giftMappings.push({
        giftId: giftId ? parseInt(giftId) : null,
        giftName: giftName || null,
        action,
        params
    });
    
    renderGiftMappings();
    
    // Clear form
    document.getElementById('new-gift-id').value = '';
    document.getElementById('new-gift-name').value = '';
    document.getElementById('new-gift-duration').value = '2000';
    document.getElementById('new-gift-slot').value = '0';
    document.getElementById('new-gift-param').value = '';
}

function removeGiftMapping(index) {
    giftMappings.splice(index, 1);
    renderGiftMappings();
}

async function saveGiftMappings() {
    try {
        const response = await fetch('/api/osc/gift-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings: giftMappings })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Gift mappings saved successfully!');
        } else {
            alert('Error saving gift mappings: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving gift mappings:', error);
        alert('Error saving gift mappings: ' + error.message);
    }
}

// ========== AVATAR MANAGEMENT ==========
let avatars = [];

async function loadAvatars() {
    try {
        const response = await fetch('/api/osc/avatars');
        const data = await response.json();
        
        if (data.success) {
            avatars = data.avatars || [];
            renderAvatars();
        }
    } catch (error) {
        console.error('Error loading avatars:', error);
    }
}

function renderAvatars() {
    const tbody = document.getElementById('avatars-tbody');
    
    if (!tbody) return;
    
    if (avatars.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No avatars configured yet. Add one below.</td></tr>';
        return;
    }
    
    tbody.innerHTML = avatars.map((avatar, index) => {
        // Escape HTML to prevent XSS - consistently escape all HTML entities
        const escapedName = avatar.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
        const escapedId = avatar.avatarId.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
        const escapedDesc = (avatar.description || '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
        
        return `
            <tr>
                <td>${escapedName}</td>
                <td><code style="font-size: 11px;">${escapedId}</code></td>
                <td>${escapedDesc}</td>
                <td>
                    <button class="btn btn-primary btn-small btn-switch-avatar" data-avatar-id="${escapedId}" data-avatar-name="${escapedName}">Switch</button>
                    <button class="btn btn-danger btn-small btn-remove-avatar" data-index="${index}">Remove</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Setup event delegation for avatars table
function setupAvatarsEventDelegation() {
    const tbody = document.getElementById('avatars-tbody');
    if (!tbody) return;
    
    tbody.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('btn-switch-avatar')) {
            const avatarId = target.dataset.avatarId;
            const avatarName = target.dataset.avatarName;
            switchToAvatar(avatarId, avatarName);
        } else if (target.classList.contains('btn-remove-avatar')) {
            const index = parseInt(target.dataset.index, 10);
            removeAvatar(index);
        }
    });
}

function addAvatar() {
    const name = document.getElementById('new-avatar-name').value;
    const avatarId = document.getElementById('new-avatar-id').value;
    const description = document.getElementById('new-avatar-desc').value;
    
    if (!name || !avatarId) {
        alert('Please enter both Avatar Name and Avatar ID');
        return;
    }
    
    if (!avatarId.startsWith('avtr_')) {
        alert('Avatar ID should start with "avtr_"');
        return;
    }
    
    avatars.push({
        id: Date.now(),
        name,
        avatarId,
        description: description || ''
    });
    
    renderAvatars();
    
    // Clear form
    document.getElementById('new-avatar-name').value = '';
    document.getElementById('new-avatar-id').value = '';
    document.getElementById('new-avatar-desc').value = '';
}

function removeAvatar(index) {
    avatars.splice(index, 1);
    renderAvatars();
}

async function saveAvatars() {
    try {
        const response = await fetch('/api/osc/avatars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatars })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Avatars saved successfully!');
        } else {
            alert('Error saving avatars: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving avatars:', error);
        alert('Error saving avatars: ' + error.message);
    }
}

async function switchToAvatar(avatarId, avatarName) {
    try {
        const response = await fetch('/api/osc/vrchat/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatarId, avatarName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Switched to avatar: ${avatarName}`);
        } else {
            alert('Error switching avatar: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error switching avatar:', error);
        alert('Error switching avatar: ' + error.message);
    }
}

// Initialize gift mappings and avatars on page load
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        loadGiftCatalog();
        loadGiftMappings();
        loadAvatars();
        
        // Setup event delegation for table buttons
        setupGiftMappingsEventDelegation();
        setupAvatarsEventDelegation();
        
        // Add event listener for gift catalog selector
        const catalogSelector = document.getElementById('gift-catalog-selector');
        if (catalogSelector) {
            catalogSelector.addEventListener('change', (e) => {
                if (e.target.value) {
                    try {
                        const selectedGift = JSON.parse(e.target.value);
                        document.getElementById('new-gift-id').value = selectedGift.id;
                        document.getElementById('new-gift-name').value = selectedGift.name;
                    } catch (error) {
                        console.error('Error parsing selected gift:', error);
                    }
                }
            });
        }
        
        // Add event listener for refresh catalogue button
        const refreshBtn = document.getElementById('refresh-gift-catalog');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                const originalText = '🔄 Refresh Catalogue';
                refreshBtn.textContent = '⏳ Loading...';
                refreshBtn.disabled = true;
                
                await loadGiftCatalog();
                
                refreshBtn.textContent = originalText;
                refreshBtn.disabled = false;
            });
        }
        
        // Add event listeners for gift mappings buttons
        const btnSaveGiftMappings = document.getElementById('btn-save-gift-mappings');
        if (btnSaveGiftMappings) {
            btnSaveGiftMappings.addEventListener('click', saveGiftMappings);
        }
        
        const btnAddGiftMapping = document.getElementById('btn-add-gift-mapping');
        if (btnAddGiftMapping) {
            btnAddGiftMapping.addEventListener('click', addGiftMapping);
        }
        
        // Add event listeners for avatar buttons
        const btnSaveAvatars = document.getElementById('btn-save-avatars');
        if (btnSaveAvatars) {
            btnSaveAvatars.addEventListener('click', saveAvatars);
        }
        
        const btnAddAvatar = document.getElementById('btn-add-avatar');
        if (btnAddAvatar) {
            btnAddAvatar.addEventListener('click', addAvatar);
        }
    });
}
