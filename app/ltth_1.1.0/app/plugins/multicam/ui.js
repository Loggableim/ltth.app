const socket = io();
let state = {
    connected: false,
    currentScene: null,
    scenes: [],
    locked: false
};
let config = null;
let giftCatalog = [];

// Default OBS configuration
const DEFAULT_OBS_CONFIG = {
    host: '127.0.0.1',
    port: 4455,
    password: ''
};

// Socket.io Events
socket.on('connect', () => {
    console.log('Socket connected');
    socket.emit('multicam:join');
    loadState();
});

socket.on('multicam_state', (data) => {
    console.log('State update:', data);
    updateState(data);
});

socket.on('multicam_switch', (data) => {
    console.log('Switch event:', data);
    addLogEntry(data);
});

// State aktualisieren
function updateState(data) {
    state = { ...state, ...data };

    // Status-Anzeige
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const currentScene = document.getElementById('currentScene');
    const lockedBanner = document.getElementById('lockedBanner');

    if (state.connected) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected to OBS';
    } else {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
    }

    if (state.currentScene) {
        currentScene.innerHTML = `Current Scene: <strong>${state.currentScene}</strong>`;
    } else {
        currentScene.innerHTML = `Current Scene: <strong>-</strong>`;
    }

    if (state.locked) {
        lockedBanner.classList.add('active');
    } else {
        lockedBanner.classList.remove('active');
    }

    // Scene-Dropdown aktualisieren
    updateSceneSelect(state.scenes);
}

// Scene-Select aktualisieren
function updateSceneSelect(scenes) {
    const select = document.getElementById('sceneSelect');
    select.innerHTML = '<option value="">Select Scene...</option>';

    for (const scene of scenes) {
        const option = document.createElement('option');
        option.value = scene;
        option.textContent = scene;
        select.appendChild(option);
    }

    // Also update gift-scene-select
    const giftSceneSelect = document.getElementById('gift-scene-select');
    giftSceneSelect.innerHTML = '<option value="">Select Scene...</option>';
    
    for (const scene of scenes) {
        const option = document.createElement('option');
        option.value = scene;
        option.textContent = scene;
        giftSceneSelect.appendChild(option);
    }
}

// State laden
async function loadState() {
    try {
        const res = await fetch('/api/multicam/state');
        const data = await res.json();
        if (data.success) {
            updateState(data.state);
        }
    } catch (error) {
        console.error('Failed to load state:', error);
    }

    // Config laden für Hot Buttons
    loadConfig();
}

// Config laden
async function loadConfig() {
    try {
        const res = await fetch('/api/multicam/config');
        const data = await res.json();
        if (data.success && data.config) {
            config = data.config;
            if (config.ui && config.ui.hotButtons) {
                renderHotButtons(config.ui.hotButtons);
            }
            if (config.obs) {
                updateConnectionSettings(config.obs);
            }
            if (config.mapping && config.mapping.gifts) {
                renderGiftMappings(config.mapping.gifts);
            }
        }
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

// Update connection settings in UI
function updateConnectionSettings(obsConfig) {
    if (!obsConfig) {
        obsConfig = DEFAULT_OBS_CONFIG;
    }
    document.getElementById('obs-host').value = obsConfig.host || DEFAULT_OBS_CONFIG.host;
    document.getElementById('obs-port').value = obsConfig.port || DEFAULT_OBS_CONFIG.port;
    document.getElementById('obs-password').value = obsConfig.password || DEFAULT_OBS_CONFIG.password;
}

// Hot Buttons rendern
function renderHotButtons(buttons) {
    const container = document.getElementById('hotButtons');
    container.innerHTML = '';

    for (const btn of buttons) {
        const button = document.createElement('button');
        button.className = 'hot-button';
        button.textContent = btn.label;
        button.addEventListener('click', () => executeHotButton(btn));
        container.appendChild(button);
    }
}

// Hot Button ausführen
async function executeHotButton(btn) {
    try {
        const res = await fetch('/api/multicam/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: btn.action, args: btn })
        });

        const data = await res.json();
        if (!data.success) {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Hot button error:', error);
        alert('Failed to execute action');
    }
}

// Connect OBS
async function connect() {
    try {
        const host = document.getElementById('obs-host').value;
        const port = parseInt(document.getElementById('obs-port').value);
        const password = document.getElementById('obs-password').value;

        const res = await fetch('/api/multicam/connect-with-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port, password })
        });
        const data = await res.json();
        if (!data.success) {
            alert(`Connection failed: ${data.error}`);
        }
    } catch (error) {
        console.error('Connect error:', error);
        alert('Failed to connect');
    }
}

// Disconnect OBS
async function disconnect() {
    try {
        const res = await fetch('/api/multicam/disconnect', { method: 'POST' });
        const data = await res.json();
    } catch (error) {
        console.error('Disconnect error:', error);
    }
}

// Switch to selected scene
async function switchToSelected() {
    const select = document.getElementById('sceneSelect');
    const sceneName = select.value;

    if (!sceneName) {
        alert('Please select a scene');
        return;
    }

    try {
        const res = await fetch('/api/multicam/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'switchScene',
                args: { target: sceneName }
            })
        });

        const data = await res.json();
        if (!data.success) {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Switch error:', error);
        alert('Failed to switch scene');
    }
}

// Log-Eintrag hinzufügen
function addLogEntry(data) {
    const container = document.getElementById('logContainer');
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const time = new Date(data.timestamp).toLocaleTimeString();
    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-user">${data.username}</span>
        <span class="log-action">${data.action}</span>
        <span class="log-target">${data.target || '-'}</span>
    `;

    // Oben einfügen
    if (container.firstChild) {
        container.insertBefore(entry, container.firstChild);
    } else {
        container.appendChild(entry);
    }

    // Maximal 50 Einträge behalten
    while (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

// Save OBS Settings
async function saveOBSSettings() {
    try {
        const host = document.getElementById('obs-host').value;
        const port = parseInt(document.getElementById('obs-port').value);
        const password = document.getElementById('obs-password').value;

        if (!config) {
            alert('Configuration not loaded. Please refresh the page.');
            return;
        }

        const updatedConfig = {
            ...config,
            obs: {
                ...(config.obs || {}),
                host,
                port,
                password
            }
        };

        const res = await fetch('/api/multicam/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedConfig)
        });

        const data = await res.json();
        if (data.success) {
            config = data.config;
            alert('OBS settings saved successfully!');
        } else {
            alert(`Failed to save settings: ${data.error}`);
        }
    } catch (error) {
        console.error('Save settings error:', error);
        alert('Failed to save settings');
    }
}

// Load Gift Catalog
async function loadGiftCatalog() {
    try {
        const res = await fetch('/api/multicam/gift-catalog');
        const data = await res.json();
        if (data.success) {
            giftCatalog = data.gifts;
            updateGiftSelect(giftCatalog);
        }
    } catch (error) {
        console.error('Failed to load gift catalog:', error);
    }
}

// Update Gift Select
function updateGiftSelect(gifts) {
    const select = document.getElementById('gift-select');
    select.innerHTML = '<option value="">Select Gift...</option>';

    for (const gift of gifts) {
        const option = document.createElement('option');
        option.value = gift.name;
        option.textContent = `${gift.name} (${gift.coins || 0} coins)`;
        select.appendChild(option);
    }
}

// Render Gift Mappings
function renderGiftMappings(mappings) {
    const container = document.getElementById('gift-mappings-container');
    container.innerHTML = '';

    if (!mappings || Object.keys(mappings).length === 0) {
        container.innerHTML = '<p class="gift-mappings-empty">No gift mappings configured yet.</p>';
        return;
    }

    for (const [giftName, mapping] of Object.entries(mappings)) {
        const item = document.createElement('div');
        item.className = 'gift-mapping-item';
        
        const minCoins = mapping.minCoins || 0;
        item.innerHTML = `
            <div class="gift-mapping-info">
                <span class="gift-name">${giftName}</span>
                <span>→</span>
                <span class="scene-target">${mapping.target}</span>
                <span class="coins-info">(min: ${minCoins} coins)</span>
            </div>
            <button class="remove-mapping-btn" onclick="removeGiftMapping('${giftName}')">Remove</button>
        `;
        
        container.appendChild(item);
    }
}

// Add Gift Mapping
async function addGiftMapping() {
    try {
        const giftName = document.getElementById('gift-select').value;
        const targetScene = document.getElementById('gift-scene-select').value;
        const minCoins = parseInt(document.getElementById('gift-min-coins').value) || 0;

        if (!giftName) {
            alert('Please select a gift');
            return;
        }

        if (!targetScene) {
            alert('Please select a target scene');
            return;
        }

        if (!config) {
            alert('Configuration not loaded. Please refresh the page.');
            return;
        }

        const updatedConfig = {
            ...config,
            mapping: {
                ...(config.mapping || {}),
                gifts: {
                    ...(config.mapping?.gifts || {}),
                    [giftName]: {
                        action: 'switchScene',
                        target: targetScene,
                        minCoins: minCoins
                    }
                }
            }
        };

        const res = await fetch('/api/multicam/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedConfig)
        });

        const data = await res.json();
        if (data.success) {
            config = data.config;
            renderGiftMappings(config.mapping?.gifts || {});
            alert('Gift mapping added successfully!');
            
            // Reset form
            document.getElementById('gift-select').value = '';
            document.getElementById('gift-scene-select').value = '';
            document.getElementById('gift-min-coins').value = '1';
        } else {
            alert(`Failed to add mapping: ${data.error}`);
        }
    } catch (error) {
        console.error('Add gift mapping error:', error);
        alert('Failed to add gift mapping');
    }
}

// Remove Gift Mapping
async function removeGiftMapping(giftName) {
    try {
        if (!confirm(`Remove mapping for "${giftName}"?`)) {
            return;
        }

        if (!config) {
            alert('Configuration not loaded. Please refresh the page.');
            return;
        }

        const updatedGifts = { ...(config.mapping?.gifts || {}) };
        delete updatedGifts[giftName];

        const updatedConfig = {
            ...config,
            mapping: {
                ...(config.mapping || {}),
                gifts: updatedGifts
            }
        };

        const res = await fetch('/api/multicam/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedConfig)
        });

        const data = await res.json();
        if (data.success) {
            config = data.config;
            renderGiftMappings(config.mapping?.gifts || {});
        } else {
            alert(`Failed to remove mapping: ${data.error}`);
        }
    } catch (error) {
        console.error('Remove gift mapping error:', error);
        alert('Failed to remove gift mapping');
    }
}

// Set up event listeners
document.getElementById('obs-connect-btn').addEventListener('click', connect);
document.getElementById('obs-disconnect-btn').addEventListener('click', disconnect);
document.getElementById('switch-scene-btn').addEventListener('click', switchToSelected);
document.getElementById('obs-save-settings-btn').addEventListener('click', saveOBSSettings);
document.getElementById('add-gift-mapping-btn').addEventListener('click', addGiftMapping);
document.getElementById('refresh-gifts-btn').addEventListener('click', loadGiftCatalog);

// Initial load
loadState();
loadGiftCatalog();
