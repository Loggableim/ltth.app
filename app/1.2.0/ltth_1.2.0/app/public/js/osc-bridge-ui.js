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
    
    // Populate chat commands settings
    if (config.chatCommands) {
        const chatCommandsEnabled = document.getElementById('chatCommandsEnabled');
        const requireOSCConnection = document.getElementById('requireOSCConnection');
        const cooldownSeconds = document.getElementById('cooldownSeconds');
        const rateLimitPerMinute = document.getElementById('rateLimitPerMinute');
        
        if (chatCommandsEnabled) chatCommandsEnabled.checked = config.chatCommands.enabled || false;
        if (requireOSCConnection) requireOSCConnection.checked = config.chatCommands.requireOSCConnection ?? true; // default true
        if (cooldownSeconds) cooldownSeconds.value = config.chatCommands.cooldownSeconds || 3;
        if (rateLimitPerMinute) rateLimitPerMinute.value = config.chatCommands.rateLimitPerMinute || 10;
        
        // Populate avatar switch settings
        if (config.chatCommands.avatarSwitch) {
            const avatarSwitchEnabled = document.getElementById('avatarSwitchEnabled');
            const avatarSwitchPermission = document.getElementById('avatarSwitchPermission');
            const avatarSwitchCooldownType = document.getElementById('avatarSwitchCooldownType');
            const avatarSwitchCooldown = document.getElementById('avatarSwitchCooldown');
            
            if (avatarSwitchEnabled) avatarSwitchEnabled.checked = config.chatCommands.avatarSwitch.enabled || false;
            if (avatarSwitchPermission) avatarSwitchPermission.value = config.chatCommands.avatarSwitch.permission || 'subscriber';
            if (avatarSwitchCooldownType) avatarSwitchCooldownType.value = config.chatCommands.avatarSwitch.cooldownType || 'global';
            if (avatarSwitchCooldown) avatarSwitchCooldown.value = config.chatCommands.avatarSwitch.cooldownSeconds || 60;
        }
    }
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

// Chat Commands form handler
const chatCommandsForm = document.getElementById('chat-commands-form');
if (chatCommandsForm) {
    chatCommandsForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const chatCommandsEnabled = document.getElementById('chatCommandsEnabled');
        const requireOSCConnection = document.getElementById('requireOSCConnection');
        const cooldownSeconds = document.getElementById('cooldownSeconds');
        const rateLimitPerMinute = document.getElementById('rateLimitPerMinute');

        if (!chatCommandsEnabled || !requireOSCConnection || !cooldownSeconds || !rateLimitPerMinute) {
            console.warn('Chat commands form elements not found');
            return;
        }

        // Get current config first to preserve other settings
        const getCurrentConfigResponse = await fetch('/api/osc/config');
        const getCurrentConfigData = await getCurrentConfigResponse.json();
        
        if (!getCurrentConfigData.success) {
            alert('Error loading current configuration');
            return;
        }

        const updatedConfig = {
            ...getCurrentConfigData.config,
            chatCommands: {
                ...getCurrentConfigData.config.chatCommands,
                enabled: chatCommandsEnabled.checked,
                requireOSCConnection: requireOSCConnection.checked,
                cooldownSeconds: parseInt(cooldownSeconds.value),
                rateLimitPerMinute: parseInt(rateLimitPerMinute.value)
            }
        };

        const response = await fetch('/api/osc/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedConfig)
        });

        const data = await response.json();

        if (data.success) {
            alert('Chat command settings saved!');
            currentConfig = data.config;
        } else {
            alert('Error saving chat command settings: ' + data.error);
        }
    });
}

// Avatar Switch form handler
const avatarSwitchForm = document.getElementById('avatar-switch-form');
if (avatarSwitchForm) {
    avatarSwitchForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const avatarSwitchEnabled = document.getElementById('avatarSwitchEnabled');
        const avatarSwitchPermission = document.getElementById('avatarSwitchPermission');
        const avatarSwitchCooldownType = document.getElementById('avatarSwitchCooldownType');
        const avatarSwitchCooldown = document.getElementById('avatarSwitchCooldown');

        if (!avatarSwitchEnabled || !avatarSwitchPermission || !avatarSwitchCooldownType || !avatarSwitchCooldown) {
            console.warn('Avatar switch form elements not found');
            return;
        }

        // Get current config first to preserve other settings
        const getCurrentConfigResponse = await fetch('/api/osc/config');
        const getCurrentConfigData = await getCurrentConfigResponse.json();
        
        if (!getCurrentConfigData.success) {
            alert('Error loading current configuration');
            return;
        }

        const updatedConfig = {
            ...getCurrentConfigData.config,
            chatCommands: {
                ...getCurrentConfigData.config.chatCommands,
                avatarSwitch: {
                    enabled: avatarSwitchEnabled.checked,
                    permission: avatarSwitchPermission.value,
                    cooldownType: avatarSwitchCooldownType.value,
                    cooldownSeconds: parseInt(avatarSwitchCooldown.value)
                }
            }
        };

        const response = await fetch('/api/osc/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedConfig)
        });

        const data = await response.json();

        if (data.success) {
            alert('Avatar switch settings saved!');
            currentConfig = data.config;
        } else {
            alert('Error saving avatar switch settings: ' + data.error);
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

// ========== COMMAND MANAGEMENT ==========
let commands = [];

async function loadCommands() {
    try {
        const response = await fetch('/api/osc/commands');
        const data = await response.json();
        
        if (data.success) {
            commands = data.commands || [];
            renderCommands();
        }
    } catch (error) {
        console.error('Error loading commands:', error);
    }
}

function renderCommands() {
    const tbody = document.getElementById('commands-tbody');
    
    if (!tbody) return;
    
    if (commands.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No commands configured yet.</td></tr>';
        return;
    }
    
    tbody.innerHTML = commands.map((cmd, index) => {
        const escapedName = (cmd.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const escapedDesc = (cmd.description || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const typeLabel = cmd.actionType === 'predefined' ? 'Predefined' : 'Custom';
        const typeColor = cmd.actionType === 'predefined' ? 'var(--color-accent-primary)' : 'var(--color-accent-success)';
        
        return `
            <tr>
                <td>
                    <input type="checkbox" class="cmd-enabled-checkbox" data-index="${index}" ${cmd.enabled ? 'checked' : ''}>
                </td>
                <td><code>/${escapedName}</code></td>
                <td>${escapedDesc}</td>
                <td>
                    <select class="form-control cmd-permission-select" data-index="${index}" style="font-size: 12px; padding: 4px 8px;">
                        <option value="all" ${cmd.permission === 'all' ? 'selected' : ''}>All</option>
                        <option value="subscriber" ${cmd.permission === 'subscriber' ? 'selected' : ''}>Subscriber</option>
                        <option value="moderator" ${cmd.permission === 'moderator' ? 'selected' : ''}>Moderator</option>
                    </select>
                </td>
                <td><span style="color: ${typeColor}; font-size: 0.85em;">${typeLabel}</span></td>
                <td>
                    ${cmd.actionType === 'custom' ? `<button class="btn btn-danger btn-small btn-remove-command" data-index="${index}">Remove</button>` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

function setupCommandsEventDelegation() {
    const tbody = document.getElementById('commands-tbody');
    if (!tbody) return;
    
    tbody.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('btn-remove-command')) {
            const index = parseInt(target.dataset.index, 10);
            removeCommand(index);
        }
    });
    
    tbody.addEventListener('change', (e) => {
        const target = e.target;
        const index = parseInt(target.dataset.index, 10);
        
        if (target.classList.contains('cmd-enabled-checkbox')) {
            commands[index].enabled = target.checked;
        } else if (target.classList.contains('cmd-permission-select')) {
            commands[index].permission = target.value;
        }
    });
}

function removeCommand(index) {
    if (commands[index].actionType === 'predefined') {
        alert('Cannot remove predefined commands. You can disable them instead.');
        return;
    }
    
    if (confirm(`Remove command '/${commands[index].name}'?`)) {
        commands.splice(index, 1);
        renderCommands();
    }
}

async function saveCommands() {
    try {
        const response = await fetch('/api/osc/commands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Commands saved successfully! Commands have been re-registered with GCCE.');
            await loadCommands(); // Reload to get any updates
        } else {
            alert('Error saving commands: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving commands:', error);
        alert('Error saving commands: ' + error.message);
    }
}

function showCustomCommandForm() {
    const form = document.getElementById('custom-command-form');
    if (form) {
        form.style.display = 'block';
        
        // Clear form
        document.getElementById('new-cmd-name').value = '';
        document.getElementById('new-cmd-description').value = '';
        document.getElementById('new-cmd-permission').value = 'all';
        document.getElementById('new-cmd-osc-address').value = '';
        document.getElementById('new-cmd-osc-value').value = '1';
        document.getElementById('new-cmd-duration').value = '0';
    }
}

function hideCustomCommandForm() {
    const form = document.getElementById('custom-command-form');
    if (form) {
        form.style.display = 'none';
    }
}

function addCustomCommand() {
    const name = document.getElementById('new-cmd-name').value.trim();
    const description = document.getElementById('new-cmd-description').value.trim();
    const permission = document.getElementById('new-cmd-permission').value;
    const oscAddress = document.getElementById('new-cmd-osc-address').value.trim();
    const oscValue = document.getElementById('new-cmd-osc-value').value.trim();
    const duration = parseInt(document.getElementById('new-cmd-duration').value) || 0;
    
    // Validation
    if (!name) {
        alert('Please enter a command name');
        return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        alert('Command name can only contain letters, numbers, underscores, and hyphens');
        return;
    }
    
    if (commands.some(cmd => cmd.name.toLowerCase() === name.toLowerCase())) {
        alert(`Command '/${name}' already exists`);
        return;
    }
    
    if (!oscAddress) {
        alert('Please enter an OSC address');
        return;
    }
    
    if (!oscAddress.startsWith('/')) {
        alert('OSC address must start with /');
        return;
    }
    
    // Parse OSC value
    let parsedValue = oscValue;
    if (oscValue === 'true') parsedValue = true;
    else if (oscValue === 'false') parsedValue = false;
    else if (!isNaN(oscValue) && oscValue !== '') parsedValue = parseFloat(oscValue);
    
    const newCommand = {
        id: `custom_${Date.now()}`,
        name: name,
        enabled: true,
        description: description || `Custom command: ${name}`,
        syntax: `/${name}`,
        permission: permission,
        category: 'VRChat',
        actionType: 'custom',
        params: {
            oscAddress: oscAddress,
            oscValue: parsedValue,
            duration: duration
        }
    };
    
    commands.push(newCommand);
    renderCommands();
    hideCustomCommandForm();
}

// Initialize command management on page load
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        loadGiftCatalog();
        loadGiftMappings();
        loadAvatars();
        loadCommands(); // Load commands
        
        // Setup event delegation for table buttons
        setupGiftMappingsEventDelegation();
        setupAvatarsEventDelegation();
        setupCommandsEventDelegation(); // Setup commands event delegation
        
        // Command name preview
        const newCmdName = document.getElementById('new-cmd-name');
        if (newCmdName) {
            newCmdName.addEventListener('input', (e) => {
                const preview = document.getElementById('cmd-preview');
                if (preview) {
                    preview.textContent = e.target.value || 'mycommand';
                }
            });
        }
        
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
        
        // Add event listeners for command buttons
        const btnSaveCommands = document.getElementById('btn-save-commands');
        if (btnSaveCommands) {
            btnSaveCommands.addEventListener('click', saveCommands);
        }
        
        const btnAddCustomCommand = document.getElementById('btn-add-custom-command');
        if (btnAddCustomCommand) {
            btnAddCustomCommand.addEventListener('click', showCustomCommandForm);
        }
        
        const btnConfirmCustomCommand = document.getElementById('btn-confirm-custom-command');
        if (btnConfirmCustomCommand) {
            btnConfirmCustomCommand.addEventListener('click', addCustomCommand);
        }
        
        const btnCancelCustomCommand = document.getElementById('btn-cancel-custom-command');
        if (btnCancelCustomCommand) {
            btnCancelCustomCommand.addEventListener('click', hideCustomCommandForm);
        }
    });
}
