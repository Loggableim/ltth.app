/**
 * OpenShock Plugin - UI Controller
 * Handles all UI interactions, Socket.IO communication, and API calls
 */

// ====================================================================
// GLOBAL VARIABLES
// ====================================================================

let socket = null;
let config = {};
let devices = [];
let mappings = [];
let patterns = [];
let giftCatalog = [];
let queueStatus = {};
let stats = {};
let debugLogs = [];
let updateInterval = null;
let currentTab = 'dashboard';

// ====================================================================
// INITIALIZATION
// ====================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[OpenShock] Initializing plugin UI...');

    initializeSocket();
    initializeTabs();
    initializeModals();
    initializeEventDelegation();

    await loadInitialData();
    startPeriodicUpdates();

    console.log('[OpenShock] UI initialization complete');
});

// ====================================================================
// SOCKET.IO INITIALIZATION AND HANDLERS
// ====================================================================

function initializeSocket() {
    if (!window.io) {
        console.warn('[OpenShock] Socket.IO not available');
        return;
    }

    socket = window.io({
        path: '/socket.io',
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('[OpenShock] Socket.IO connected');
        updateConnectionStatus('connected');
    });

    socket.on('disconnect', () => {
        console.log('[OpenShock] Socket.IO disconnected');
        updateConnectionStatus('disconnected');
    });

    socket.on('error', (error) => {
        console.error('[OpenShock] Socket.IO error:', error);
        updateConnectionStatus('error');
    });

    // OpenShock-specific events
    socket.on('openshock:device-update', (data) => {
        console.log('[OpenShock] Device update:', data);
        handleDeviceUpdate(data);
    });

    socket.on('openshock:command-sent', (data) => {
        console.log('[OpenShock] Command sent:', data);
        handleCommandSent(data);
    });

    socket.on('openshock:queue-update', (data) => {
        console.log('[OpenShock] Queue update:', data);
        handleQueueUpdate(data);
    });

    socket.on('openshock:emergency-stop', (data) => {
        console.log('[OpenShock] Emergency stop triggered:', data);
        handleEmergencyStop(data);
    });

    socket.on('openshock:stats-update', (data) => {
        console.log('[OpenShock] Stats update:', data);
        handleStatsUpdate(data);
    });
}

function handleDeviceUpdate(data) {
    const deviceIndex = devices.findIndex(d => d.id === data.deviceId);
    if (deviceIndex >= 0) {
        devices[deviceIndex] = { ...devices[deviceIndex], ...data };
        renderDeviceList();
    }
}

function handleCommandSent(data) {
    debugLogs.unshift({
        timestamp: new Date().toISOString(),
        type: 'command',
        ...data
    });

    if (debugLogs.length > 100) {
        debugLogs = debugLogs.slice(0, 100);
    }

    if (currentTab === 'dashboard') {
        renderCommandLog(debugLogs.slice(0, 10));
    }
}

function handleQueueUpdate(data) {
    queueStatus = data;
    renderQueueStatus();
}

function handleEmergencyStop(data) {
    showNotification('EMERGENCY STOP ACTIVATED!', 'error');
    document.body.classList.add('emergency-active');
    setTimeout(() => {
        document.body.classList.remove('emergency-active');
    }, 5000);
}

function handleStatsUpdate(data) {
    stats = data;
    renderStats();
}

// ====================================================================
// DATA LOADING FUNCTIONS
// ====================================================================

async function loadInitialData() {
    try {
        await Promise.all([
            loadConfig(),
            loadDevices(),
            loadMappings(),
            loadPatterns(),
            loadStats(),
            loadQueueStatus(),
            loadGiftCatalog()
        ]);

        // Render initial UI
        renderDashboard();
        renderDeviceList();
        renderMappingList();
        renderPatternList();
        renderGiftCatalog();
        
        // Update API status with device count
        updateApiStatus(devices.length > 0, devices.length);

        showNotification('OpenShock plugin loaded successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error loading initial data:', error);
        showNotification('Error loading OpenShock data', 'error');
        
        // Update API status as failed
        updateApiStatus(false, 0);
    }
}

async function loadConfig() {
    try {
        const response = await fetch('/api/openshock/config');
        if (!response.ok) throw new Error('Failed to load config');
        const data = await response.json();
        config = data.config || {};
        console.log('[OpenShock] Config loaded:', config);

        // Update UI with config
        if (config.apiKey) {
            const apiKeyInput = document.getElementById('apiKey');
            if (apiKeyInput) {
                apiKeyInput.value = config.apiKey.substring(0, 8) + '...' + config.apiKey.substring(config.apiKey.length - 4);
            }
        }

        return config;
    } catch (error) {
        console.error('[OpenShock] Error loading config:', error);
        throw error;
    }
}

async function loadDevices() {
    try {
        const response = await fetch('/api/openshock/devices');
        if (!response.ok) {
            // Try to get error message from response
            let errorMessage = 'Failed to load devices';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // Response was not JSON, use default message
            }
            throw new Error(errorMessage);
        }
        const data = await response.json();
        devices = data.devices || [];
        console.log('[OpenShock] Devices loaded:', devices);
        return devices;
    } catch (error) {
        console.error('[OpenShock] Error loading devices:', error);
        throw error;
    }
}

async function loadMappings() {
    try {
        const response = await fetch('/api/openshock/mappings');
        if (!response.ok) throw new Error('Failed to load mappings');
        const data = await response.json();
        mappings = data.mappings || [];
        console.log('[OpenShock] Mappings loaded:', mappings);
        return mappings;
    } catch (error) {
        console.error('[OpenShock] Error loading mappings:', error);
        throw error;
    }
}

async function loadPatterns() {
    try {
        const response = await fetch('/api/openshock/patterns');
        if (!response.ok) throw new Error('Failed to load patterns');
        const data = await response.json();
        patterns = data.patterns || [];
        console.log('[OpenShock] Patterns loaded:', patterns);
        return patterns;
    } catch (error) {
        console.error('[OpenShock] Error loading patterns:', error);
        throw error;
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/openshock/stats');
        if (!response.ok) throw new Error('Failed to load stats');
        const data = await response.json();
        stats = data.stats || {};
        console.log('[OpenShock] Stats loaded:', stats);
        return stats;
    } catch (error) {
        console.error('[OpenShock] Error loading stats:', error);
        throw error;
    }
}

async function loadQueueStatus() {
    try {
        const response = await fetch('/api/openshock/queue/status');
        if (!response.ok) throw new Error('Failed to load queue status');
        const data = await response.json();
        queueStatus = data.status || {};
        console.log('[OpenShock] Queue status loaded:', queueStatus);
        return queueStatus;
    } catch (error) {
        console.error('[OpenShock] Error loading queue status:', error);
        throw error;
    }
}

async function loadGiftCatalog() {
    try {
        const response = await fetch('/api/openshock/gift-catalog');
        if (!response.ok) throw new Error('Failed to load gift catalog');
        const data = await response.json();
        giftCatalog = data.gifts || [];
        console.log('[OpenShock] Gift catalog loaded:', giftCatalog.length, 'gifts');
        return giftCatalog;
    } catch (error) {
        console.error('[OpenShock] Error loading gift catalog:', error);
        throw error;
    }
}

// ====================================================================
// UI RENDERING FUNCTIONS
// ====================================================================

function renderDashboard() {
    renderStats();
    renderQueueStatus();
    renderCommandLog(debugLogs.slice(0, 10));
    updateConnectionStatus(socket && socket.connected ? 'connected' : 'disconnected');
}

function renderDeviceList() {
    const container = document.getElementById('devicesList');
    if (!container) return;

    if (devices.length === 0) {
        container.innerHTML = `
            <p class="text-muted text-center">No devices found. Configure API key first.</p>
        `;
        
        // Also update test shock dropdown and mapping device dropdown
        updateTestShockDeviceList();
        updateMappingDeviceList();
        return;
    }

    const html = `
        <table class="table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Battery</th>
                    <th>RSSI</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${devices.map(device => `
                    <tr ${device.isPaused ? 'class="device-paused"' : ''}>
                        <td><strong>${escapeHtml(device.name)}</strong></td>
                        <td><code>${escapeHtml(device.id)}</code></td>
                        <td><span class="badge badge-info">${escapeHtml(device.type || 'Unknown')}</span></td>
                        <td>
                            ${device.isPaused ? `
                                <span class="badge badge-warning" title="Shocker is paused">
                                    ⏸️ Paused
                                </span>
                            ` : `
                                <span class="badge ${device.online ? 'badge-success' : 'badge-secondary'}">
                                    ${device.online ? 'Online' : 'Offline'}
                                </span>
                            `}
                        </td>
                        <td>
                            ${device.battery !== undefined ? `
                                <div class="battery">
                                    ${device.battery}%
                                </div>
                            ` : '-'}
                        </td>
                        <td>
                            ${device.rssi !== undefined ? `
                                <span class="signal signal-${getSignalStrength(device.rssi)}">
                                    ${device.rssi} dBm
                                </span>
                            ` : '-'}
                        </td>
                        <td>
                            <div class="btn-group">
                                <button data-device-id="${escapeHtml(device.id)}" data-test-type="vibrate"
                                        class="btn btn-sm btn-secondary test-device-btn"
                                        title="Test Vibrate"
                                        ${device.isPaused ? 'disabled' : ''}>
                                    🔊
                                </button>
                                <button data-device-id="${escapeHtml(device.id)}" data-test-type="shock"
                                        class="btn btn-sm btn-warning test-device-btn"
                                        title="Test Shock"
                                        ${device.isPaused ? 'disabled' : ''}>
                                    ⚡
                                </button>
                                <button data-device-id="${escapeHtml(device.id)}" data-test-type="sound"
                                        class="btn btn-sm btn-info test-device-btn"
                                        title="Test Sound"
                                        ${device.isPaused ? 'disabled' : ''}>
                                    🔔
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;
    
    // Also update test shock dropdown and mapping device dropdown
    updateTestShockDeviceList();
    updateMappingDeviceList();
}

function renderCommandLog(commands) {
    const container = document.getElementById('commandLog');
    if (!container) return;

    if (commands.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No commands executed yet.</p>';
        return;
    }

    const html = commands.map(cmd => `
        <div class="log-entry ${cmd.success !== false ? 'success' : 'error'}">
            <span class="log-timestamp">${formatTimestamp(cmd.timestamp)}</span>
            <div class="log-message">
                <strong>${escapeHtml(cmd.type)}</strong>
                ${escapeHtml(cmd.deviceName || cmd.deviceId)}
                ${cmd.intensity ? `- ${cmd.intensity}%` : ''}
                ${cmd.duration ? `- ${cmd.duration}ms` : ''}
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

function renderMappingList() {
    const container = document.getElementById('mappingsList');
    if (!container) return;

    if (mappings.length === 0) {
        container.innerHTML = `
            <p class="text-muted text-center">No mappings configured. Click "Add Mapping" to create one.</p>
        `;
        return;
    }

    const html = mappings.map(mapping => {
        // Get pattern details if this mapping uses a pattern
        let patternDetails = '';
        if (mapping.action?.type === 'pattern' && mapping.action.patternId) {
            const pattern = patterns.find(p => p.id === mapping.action.patternId);
            if (pattern) {
                const stepCount = pattern.steps?.length || 0;
                const duration = calculatePatternDuration(pattern.steps || []);
                patternDetails = `
                    <div class="mapping-detail-item">
                        <span class="mapping-detail-label">Pattern Details:</span>
                        <span class="mapping-detail-value">${stepCount} steps, ${formatDuration(duration)}</span>
                    </div>
                `;
            }
        }

        return `
            <div class="mapping-card ${mapping.enabled ? '' : 'disabled'}">
                <div class="mapping-header">
                    <h3 class="mapping-title">${escapeHtml(mapping.name)}</h3>
                    <div class="btn-group">
                        <label class="switch">
                            <input type="checkbox" ${mapping.enabled ? 'checked' : ''}
                                   data-mapping-id="${escapeHtml(mapping.id)}" class="toggle-mapping-checkbox">
                            <span class="slider"></span>
                        </label>
                        <button data-mapping-id="${escapeHtml(mapping.id)}"
                                class="btn btn-sm btn-secondary edit-mapping-btn">
                            ✏️
                        </button>
                        <button data-mapping-id="${escapeHtml(mapping.id)}"
                                class="btn btn-sm btn-danger delete-mapping-btn">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="mapping-details">
                    <div class="mapping-detail-item">
                        <span class="mapping-detail-label">Trigger:</span>
                        <span class="mapping-detail-value">${escapeHtml(mapping.eventType || mapping.trigger?.type || 'Unknown')}</span>
                    </div>
                    <div class="mapping-detail-item">
                        <span class="mapping-detail-label">Action:</span>
                        <span class="mapping-detail-value">${
                            mapping.action?.type === 'pattern' 
                                ? `🎵 Pattern: ${escapeHtml(patterns.find(p => p.id === mapping.action.patternId)?.name || mapping.action.patternId || 'Unknown')}`
                                : escapeHtml(mapping.action?.commandType || mapping.action?.type || 'Unknown')
                        }</span>
                    </div>
                    ${mapping.action?.type !== 'pattern' && mapping.action?.intensity ? `
                        <div class="mapping-detail-item">
                            <span class="mapping-detail-label">Intensity:</span>
                            <span class="mapping-detail-value">${mapping.action.intensity}%</span>
                        </div>
                    ` : ''}
                    ${patternDetails}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function renderPatternList() {
    const presetContainer = document.getElementById('presetPatternsList');
    const customContainer = document.getElementById('customPatternsList');
    
    if (!presetContainer || !customContainer) return;

    // Separate preset and custom patterns
    const presetPatterns = patterns.filter(p => p.preset === true);
    const customPatterns = patterns.filter(p => p.preset !== true);

    // Render preset patterns
    if (presetPatterns.length === 0) {
        presetContainer.innerHTML = `<p class="text-muted text-center">No preset patterns available.</p>`;
    } else {
        const presetHtml = presetPatterns.map(pattern => `
            <div class="pattern-card">
                <div class="pattern-header">
                    <h3 class="pattern-name">${escapeHtml(pattern.name)}</h3>
                </div>
                <div class="pattern-body">
                    ${pattern.description ? `<p class="pattern-description">${escapeHtml(pattern.description)}</p>` : ''}
                    <div class="pattern-info">
                        <span>📊 ${pattern.steps?.length || 0} steps</span>
                        <span>⏱️ ${formatDuration(calculatePatternDuration(pattern.steps || []))}</span>
                    </div>
                </div>
                <div class="pattern-footer">
                    <select id="pattern-device-${escapeHtml(pattern.id)}" data-pattern-id="${escapeHtml(pattern.id)}" class="form-select form-select-sm pattern-device-select">
                        <option value="">Select device...</option>
                        ${devices.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('')}
                    </select>
                    <button data-pattern-id="${escapeHtml(pattern.id)}"
                            class="btn btn-sm btn-primary execute-pattern-btn">
                        ▶️ Test
                    </button>
                </div>
            </div>
        `).join('');
        presetContainer.innerHTML = presetHtml;
    }

    // Render custom patterns
    if (customPatterns.length === 0) {
        customContainer.innerHTML = `<p class="text-muted text-center">No custom patterns created yet.</p>`;
    } else {
        const customHtml = customPatterns.map(pattern => `
            <div class="pattern-card">
                <div class="pattern-header">
                    <h3 class="pattern-name">${escapeHtml(pattern.name)}</h3>
                    <div class="btn-group">
                        <button data-pattern-id="${escapeHtml(pattern.id)}"
                                class="btn btn-sm btn-secondary edit-pattern-btn">
                            ✏️
                        </button>
                        <button data-pattern-id="${escapeHtml(pattern.id)}"
                                class="btn btn-sm btn-danger delete-pattern-btn">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="pattern-body">
                    ${pattern.description ? `<p class="pattern-description">${escapeHtml(pattern.description)}</p>` : ''}
                    <div class="pattern-info">
                        <span>📊 ${pattern.steps?.length || 0} steps</span>
                        <span>⏱️ ${formatDuration(calculatePatternDuration(pattern.steps || []))}</span>
                    </div>
                </div>
                <div class="pattern-footer">
                    <select id="pattern-device-${escapeHtml(pattern.id)}" data-pattern-id="${escapeHtml(pattern.id)}" class="form-select form-select-sm pattern-device-select">
                        <option value="">Select device...</option>
                        ${devices.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('')}
                    </select>
                    <button data-pattern-id="${escapeHtml(pattern.id)}"
                            class="btn btn-sm btn-primary execute-pattern-btn">
                        ▶️ Execute
                    </button>
                </div>
            </div>
        `).join('');
        customContainer.innerHTML = customHtml;
    }
}

function renderGiftCatalog() {
    const container = document.getElementById('giftCatalogList');
    if (!container) return;

    if (giftCatalog.length === 0) {
        container.innerHTML = `
            <p class="text-muted text-center">No gifts found in catalog. The catalog will be populated when you connect to TikTok Live.</p>
        `;
        return;
    }

    const html = `
        <div class="gift-catalog-grid">
            ${giftCatalog.map(gift => `
                <div class="gift-card">
                    ${gift.image_url ? `<img src="${escapeHtml(gift.image_url)}" alt="${escapeHtml(gift.name)}" class="gift-image">` : '<div class="gift-image-placeholder">🎁</div>'}
                    <div class="gift-info">
                        <h3 class="gift-name">${escapeHtml(gift.name)}</h3>
                        <div class="gift-value">💎 ${gift.diamond_count || 0}</div>
                    </div>
                    <button class="btn btn-sm btn-primary create-mapping-for-gift-btn" data-gift-name="${escapeHtml(gift.name)}" data-gift-coins="${gift.diamond_count || 0}">
                        ➕ Create Mapping
                    </button>
                </div>
            `).join('')}
        </div>
    `;

    container.innerHTML = html;
    
    // Populate gift name dropdown in mapping modal
    updateGiftNameSelect();
}

function updateGiftNameSelect() {
    const select = document.getElementById('mappingGiftNameSelect');
    if (!select) return;
    
    // Clear existing options except "All Gifts"
    select.innerHTML = '<option value="">All Gifts</option>';
    
    // Add gift options sorted by diamond count (descending)
    const sortedGifts = [...giftCatalog].sort((a, b) => (b.diamond_count || 0) - (a.diamond_count || 0));
    sortedGifts.forEach(gift => {
        const option = document.createElement('option');
        option.value = gift.name;
        option.textContent = `${gift.name} (💎 ${gift.diamond_count || 0})`;
        select.appendChild(option);
    });
}

function renderQueueStatus() {
    // Update the stat values directly in the dashboard
    const queueLengthEl = document.getElementById('queueLength');
    const queueProcessingEl = document.getElementById('queueProcessing');
    
    if (queueLengthEl) {
        queueLengthEl.textContent = queueStatus.pending || 0;
    }
    if (queueProcessingEl) {
        queueProcessingEl.textContent = queueStatus.processing ? 'Yes' : 'No';
    }
}

function renderStats() {
    // Update stat values directly in the dashboard
    const totalCommandsEl = document.getElementById('totalCommands');
    const successRateEl = document.getElementById('successRate');
    const uptimeEl = document.getElementById('uptime');
    
    if (totalCommandsEl) {
        totalCommandsEl.textContent = stats.totalCommands || 0;
    }
    if (successRateEl && stats.totalCommands > 0) {
        const rate = Math.round((stats.successfulCommands / stats.totalCommands) * 100);
        successRateEl.textContent = rate + '%';
    }
    if (uptimeEl && stats.startTime) {
        const uptime = Date.now() - stats.startTime;
        uptimeEl.textContent = formatDuration(uptime);
    }
}

function updateConnectionStatus(status) {
    const badge = document.getElementById('connection-status');
    if (!badge) return;

    badge.className = 'openshock-connection-badge';

    if (status === 'connected') {
        badge.classList.add('openshock-connection-connected');
        badge.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
    } else if (status === 'disconnected') {
        badge.classList.add('openshock-connection-disconnected');
        badge.innerHTML = '<i class="fas fa-times-circle"></i> Disconnected';
    } else {
        badge.classList.add('openshock-connection-error');
        badge.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
    }
}

// ====================================================================
// MAPPING CRUD FUNCTIONS
// ====================================================================

function openMappingModal(mappingId = null) {
    const modal = document.getElementById('mappingModal');
    if (!modal) return;

    const isEdit = mappingId !== null;
    const mapping = isEdit ? mappings.find(m => m.id === mappingId) : null;

    // Set modal title
    const modalTitle = document.getElementById('mappingModalTitle');
    if (modalTitle) {
        modalTitle.textContent = isEdit ? 'Edit Event Mapping' : 'Add Event Mapping';
    }

    // Store mapping ID in a data attribute if editing
    if (isEdit) {
        modal.dataset.editingId = mappingId;
    } else {
        delete modal.dataset.editingId;
    }

    // Populate device dropdown with current devices
    updateMappingDeviceList();
    
    // Populate gift name select with catalog
    updateGiftNameSelect();
    
    // Populate pattern dropdown with available patterns
    updateMappingPatternList();

    // Populate form - handle both frontend (trigger) and backend (eventType/conditions) format
    const nameInput = document.getElementById('mappingName');
    const enabledCheckbox = document.getElementById('mappingEnabled');
    const eventTypeSelect = document.getElementById('mappingEventType');
    const actionTypeSelect = document.getElementById('mappingActionType');

    if (nameInput) nameInput.value = mapping?.name || '';
    if (enabledCheckbox) enabledCheckbox.checked = mapping?.enabled !== false;
    if (eventTypeSelect) eventTypeSelect.value = mapping?.eventType || mapping?.trigger?.type || 'gift';
    if (actionTypeSelect) actionTypeSelect.value = mapping?.action?.commandType || mapping?.action?.type || 'shock';
    
    // Populate device dropdown with available devices
    updateMappingDeviceList(mapping?.action?.deviceId || '');

    // Convert backend format to frontend format for triggers
    let triggerData = mapping?.trigger;
    if (mapping?.eventType && mapping?.conditions) {
        // Backend format - convert to frontend format
        triggerData = {
            type: mapping.eventType,
            giftName: mapping.conditions.giftName,
            minCoins: mapping.conditions.minCoins,
            messagePattern: mapping.conditions.messagePattern
        };
    }

    // Populate trigger-specific fields
    populateTriggerFields(triggerData);

    // Populate action-specific fields
    populateActionFields(mapping?.action);

    openModal('mappingModal');
}

function populateTriggerFields(trigger) {
    const eventTypeSelect = document.getElementById('mappingEventType');
    const type = trigger?.type || (eventTypeSelect ? eventTypeSelect.value : 'gift');

    // Show/hide condition groups based on event type
    const conditionGift = document.getElementById('conditionGift');
    const conditionMinCoins = document.getElementById('conditionMinCoins');
    const conditionMessagePattern = document.getElementById('conditionMessagePattern');

    if (conditionGift) conditionGift.style.display = type === 'gift' ? 'block' : 'none';
    if (conditionMinCoins) conditionMinCoins.style.display = type === 'gift' ? 'block' : 'none';
    if (conditionMessagePattern) conditionMessagePattern.style.display = type === 'chat' ? 'block' : 'none';

    // Set values if editing
    if (trigger) {
        const giftNameSelect = document.getElementById('mappingGiftNameSelect');
        const giftNameInput = document.getElementById('mappingGiftName');
        const minCoinsInput = document.getElementById('mappingMinCoins');
        const messagePatternInput = document.getElementById('mappingMessagePattern');

        if (trigger.giftName) {
            // Try to select from dropdown first
            if (giftNameSelect) {
                const option = Array.from(giftNameSelect.options).find(opt => opt.value === trigger.giftName);
                if (option) {
                    giftNameSelect.value = trigger.giftName;
                } else {
                    // If not in dropdown, use text input
                    if (giftNameInput) giftNameInput.value = trigger.giftName;
                }
            }
        }
        if (minCoinsInput && trigger.minCoins !== undefined) minCoinsInput.value = trigger.minCoins;
        if (messagePatternInput && trigger.messagePattern) messagePatternInput.value = trigger.messagePattern;
    }
}

function populateActionFields(action) {
    // The action fields are static in the HTML, just set their values
    const intensitySlider = document.getElementById('mappingIntensity');
    const intensityValue = document.getElementById('mappingIntensityValue');
    const durationSlider = document.getElementById('mappingDuration');
    const durationValue = document.getElementById('mappingDurationValue');
    const patternSelect = document.getElementById('mappingPattern');
    const deviceSelect = document.getElementById('mappingDevice');

    if (action) {
        // Handle pattern-type actions
        if (action.type === 'pattern' && action.patternId) {
            // Select the pattern in the dropdown
            if (patternSelect) {
                updateMappingPatternList(action.patternId);
            }
            // Select the device if specified
            if (deviceSelect && action.deviceId) {
                updateMappingDeviceList(action.deviceId);
            }
        } else {
            // Handle command-type actions
            if (intensitySlider && action.intensity !== undefined) {
                intensitySlider.value = action.intensity;
                if (intensityValue) intensityValue.textContent = action.intensity;
            }
            if (durationSlider && action.duration !== undefined) {
                durationSlider.value = action.duration;
                if (durationValue) durationValue.textContent = action.duration;
            }
        }
    }
}

async function saveMappingModal() {
    const modal = document.getElementById('mappingModal');
    const mappingId = modal?.dataset.editingId;
    const isEdit = !!mappingId;

    const nameInput = document.getElementById('mappingName');
    const enabledCheckbox = document.getElementById('mappingEnabled');
    const eventTypeSelect = document.getElementById('mappingEventType');
    const actionTypeSelect = document.getElementById('mappingActionType');
    const deviceSelect = document.getElementById('mappingDevice');
    const intensitySlider = document.getElementById('mappingIntensity');
    const durationSlider = document.getElementById('mappingDuration');
    const patternSelect = document.getElementById('mappingPattern');

    // Collect trigger data and convert to backend format
    const triggerData = collectTriggerData();
    
    // Check if a pattern is selected
    const selectedPatternId = patternSelect?.value || '';
    
    let action;
    if (selectedPatternId) {
        // Create a pattern-type action
        action = {
            type: 'pattern',
            patternId: selectedPatternId,
            deviceId: deviceSelect?.value || ''
        };
    } else {
        // Create a command-type action (single pulse)
        action = {
            type: 'command',
            commandType: actionTypeSelect?.value || 'shock',
            deviceId: deviceSelect?.value || '',
            intensity: parseInt(intensitySlider?.value) || 50,
            duration: parseInt(durationSlider?.value) || 1000
        };
    }
    
    const mapping = {
        name: nameInput?.value || 'Untitled Mapping',
        enabled: enabledCheckbox?.checked !== false,
        eventType: triggerData.type, // Backend expects eventType, not trigger.type
        conditions: {
            // Convert trigger fields to conditions format
            giftName: triggerData.giftName,
            minCoins: triggerData.minCoins || 0,
            messagePattern: triggerData.messagePattern
        },
        action: action
    };

    try {
        const url = isEdit ? `/api/openshock/mappings/${mappingId}` : '/api/openshock/mappings';
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mapping)
        });

        if (!response.ok) throw new Error('Failed to save mapping');

        await loadMappings();
        renderMappingList();
        closeModal('mappingModal');

        showNotification(`Mapping ${isEdit ? 'updated' : 'created'} successfully`, 'success');
    } catch (error) {
        console.error('[OpenShock] Error saving mapping:', error);
        showNotification('Error saving mapping', 'error');
    }
}

function collectTriggerData() {
    const eventTypeSelect = document.getElementById('mappingEventType');
    const type = eventTypeSelect?.value || 'gift';
    const trigger = { type };

    if (type === 'gift') {
        const giftNameSelect = document.getElementById('mappingGiftNameSelect');
        const giftNameInput = document.getElementById('mappingGiftName');
        const minCoinsInput = document.getElementById('mappingMinCoins');
        
        // Prefer manual input over select dropdown (manual input takes precedence)
        if (giftNameInput?.value) {
            trigger.giftName = giftNameInput.value;
        } else if (giftNameSelect?.value) {
            trigger.giftName = giftNameSelect.value;
        }
        
        if (minCoinsInput?.value) trigger.minCoins = parseInt(minCoinsInput.value);
    } else if (type === 'chat') {
        const messagePatternInput = document.getElementById('mappingMessagePattern');
        if (messagePatternInput?.value) trigger.messagePattern = messagePatternInput.value;
    }

    return trigger;
}

async function deleteMapping(id) {
    if (!await confirmAction('Are you sure you want to delete this mapping?')) {
        return;
    }

    try {
        const response = await fetch(`/api/openshock/mappings/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete mapping');

        await loadMappings();
        renderMappingList();
        showNotification('Mapping deleted successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error deleting mapping:', error);
        showNotification('Error deleting mapping', 'error');
    }
}

async function toggleMapping(id, enabled) {
    try {
        const response = await fetch(`/api/openshock/mappings/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });

        if (!response.ok) throw new Error('Failed to toggle mapping');

        await loadMappings();
        renderMappingList();
        showNotification(`Mapping ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
        console.error('[OpenShock] Error toggling mapping:', error);
        showNotification('Error toggling mapping', 'error');
    }
}

async function importMappings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/openshock/mappings/import', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Failed to import mappings');

            await loadMappings();
            renderMappingList();
            showNotification('Mappings imported successfully', 'success');
        } catch (error) {
            console.error('[OpenShock] Error importing mappings:', error);
            showNotification('Error importing mappings', 'error');
        }
    };

    input.click();
}

async function exportMappings() {
    try {
        const response = await fetch('/api/openshock/mappings/export');
        if (!response.ok) throw new Error('Failed to export mappings');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openshock-mappings-${Date.now()}.json`;
        a.click();
        window.URL.revokeObjectURL(url);

        showNotification('Mappings exported successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error exporting mappings:', error);
        showNotification('Error exporting mappings', 'error');
    }
}

// ====================================================================
// GIFT CATALOG FUNCTIONS
// ====================================================================

function openMappingModalForGift(giftName, giftCoins) {
    // Open mapping modal with pre-filled gift data
    openMappingModal();
    
    // Wait for modal to be populated, then set values
    setTimeout(() => {
        const eventTypeSelect = document.getElementById('mappingEventType');
        const giftNameSelect = document.getElementById('mappingGiftNameSelect');
        const minCoinsInput = document.getElementById('mappingMinCoins');
        const nameInput = document.getElementById('mappingName');
        
        if (eventTypeSelect) eventTypeSelect.value = 'gift';
        if (giftNameSelect) giftNameSelect.value = giftName;
        if (minCoinsInput) minCoinsInput.value = giftCoins || 0;
        if (nameInput) nameInput.value = `${giftName} Gift`;
        
        // Trigger event type change to show gift conditions
        if (eventTypeSelect) {
            eventTypeSelect.dispatchEvent(new Event('change'));
        }
    }, 100);
}

async function refreshGiftCatalog() {
    const button = document.getElementById('refreshGiftCatalog');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    }
    
    try {
        await loadGiftCatalog();
        renderGiftCatalog();
        showNotification(`Gift catalog refreshed - ${giftCatalog.length} gifts loaded`, 'success');
    } catch (error) {
        console.error('[OpenShock] Error refreshing gift catalog:', error);
        showNotification('Error refreshing gift catalog', 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '🔄 Refresh Catalog';
        }
    }
}

// ====================================================================
// PATTERN CRUD FUNCTIONS
// ====================================================================

let currentPatternSteps = [];

function openPatternModal(patternId = null) {
    const modal = document.getElementById('patternModal');
    if (!modal) return;

    const isEdit = patternId !== null;
    const pattern = isEdit ? patterns.find(p => p.id === patternId) : null;

    const modalTitle = document.getElementById('patternModalTitle');
    const nameInput = document.getElementById('patternName');
    const descriptionInput = document.getElementById('patternDescription');

    if (modalTitle) {
        modalTitle.textContent = isEdit ? 'Edit Pattern' : 'Add Pattern';
    }

    // Store pattern ID in modal data attribute
    if (isEdit) {
        modal.dataset.editingId = patternId;
    } else {
        delete modal.dataset.editingId;
    }

    if (nameInput) nameInput.value = pattern?.name || '';
    if (descriptionInput) descriptionInput.value = pattern?.description || '';

    currentPatternSteps = pattern?.steps ? JSON.parse(JSON.stringify(pattern.steps)) : [];
    renderPatternSteps();

    openModal('patternModal');
}

function renderPatternSteps() {
    const container = document.getElementById('patternSteps');
    if (!container) return;

    if (currentPatternSteps.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No steps added yet. Click "Add Step" to begin.</p>';
        return;
    }

    const html = currentPatternSteps.map((step, index) => `
        <div class="pattern-step">
            <div class="pattern-step-number">${index + 1}</div>
            <div class="pattern-step-content">
                <span class="pattern-step-type">${escapeHtml(step.type)}</span>
                <span>Intensity: ${step.intensity}%</span>
                <span>Duration: ${step.duration}ms</span>
                ${step.delay ? `<span>Delay: ${step.delay}ms</span>` : ''}
            </div>
            <button data-step-index="${index}" class="btn btn-sm btn-danger remove-pattern-step-btn">
                🗑️
            </button>
        </div>
    `).join('');

    container.innerHTML = html;
    renderPatternPreview();
}

function addPatternStep() {
    const typeSelect = document.getElementById('stepType');
    const intensitySlider = document.getElementById('stepIntensity');
    const durationInput = document.getElementById('stepDuration');

    const step = {
        type: typeSelect?.value || 'shock',
        intensity: parseInt(intensitySlider?.value) || 50,
        duration: parseInt(durationInput?.value) || 500,
        delay: 0
    };

    currentPatternSteps.push(step);
    renderPatternSteps();

    // Reset form
    if (intensitySlider) intensitySlider.value = 50;
    if (durationInput) durationInput.value = 500;
    
    // Update slider value display
    const intensityValue = document.getElementById('stepIntensityValue');
    if (intensityValue) intensityValue.textContent = 50;

    // Hide step form
    const stepForm = document.getElementById('stepForm');
    if (stepForm) {
        stepForm.classList.add('step-form-hidden');
    }
}

function removePatternStep(index) {
    currentPatternSteps.splice(index, 1);
    renderPatternSteps();
}

function renderPatternPreview() {
    const container = document.getElementById('patternPreview');
    if (!container) return;

    if (currentPatternSteps.length === 0) {
        container.innerHTML = '<p class="text-muted text-center pattern-timeline-text">Add steps to see preview</p>';
        return;
    }

    container.innerHTML = renderPatternTimeline(currentPatternSteps);
}

function renderPatternTimeline(steps) {
    if (!steps || steps.length === 0) return '';

    const totalDuration = calculatePatternDuration(steps);
    let currentTime = 0;

    const bars = steps.map(step => {
        const startPercent = (currentTime / totalDuration) * 100;
        const widthPercent = (step.duration / totalDuration) * 100;
        currentTime += step.duration + (step.delay || 0);

        // Sanitize step.type for CSS class (only allow alphanumeric and hyphen)
        const sanitizedType = (step.type || '').replace(/[^a-zA-Z0-9-]/g, '');

        return `
            <div class="timeline-bar timeline-${sanitizedType}"
                 style="left: ${startPercent}%; width: ${widthPercent}%;"
                 title="${escapeHtml(step.type)} - ${step.intensity}% - ${step.duration}ms">
            </div>
        `;
    }).join('');

    return `
        <div class="timeline">
            ${bars}
        </div>
        <div class="timeline-labels">
            <span>0ms</span>
            <span>${formatDuration(totalDuration)}</span>
        </div>
    `;
}

async function savePatternModal() {
    const modal = document.getElementById('patternModal');
    const patternId = modal?.dataset.editingId;
    const isEdit = !!patternId;

    if (currentPatternSteps.length === 0) {
        showNotification('Pattern must have at least one step', 'error');
        return;
    }

    const nameInput = document.getElementById('patternName');
    const descriptionInput = document.getElementById('patternDescription');

    const pattern = {
        name: nameInput?.value || 'Untitled Pattern',
        description: descriptionInput?.value || '',
        steps: currentPatternSteps
    };

    try {
        const url = isEdit ? `/api/openshock/patterns/${patternId}` : '/api/openshock/patterns';
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pattern)
        });

        if (!response.ok) throw new Error('Failed to save pattern');

        const result = await response.json();
        // For new patterns, get the ID from the response; for edits, use the existing ID
        // Use explicit checks to handle 0 as a valid ID
        const savedPatternId = result.id !== undefined && result.id !== null 
            ? result.id 
            : (isEdit ? patternId : null);
        
        if (savedPatternId == null && !isEdit) {
            console.warn('[OpenShock] Pattern saved but no ID returned from server');
        }

        await loadPatterns();
        renderPatternList();
        closeModal('patternModal');

        showNotification(`Pattern ${isEdit ? 'updated' : 'created'} successfully`, 'success');
        
        // Check if we need to return to mapping modal
        const shouldReturn = sessionStorage.getItem('returnToMappingModal');
        if (shouldReturn === 'true') {
            // Update the stored mapping state with the new/updated pattern ID
            if (savedPatternId != null) {
                const stateJson = sessionStorage.getItem('mappingModalState');
                if (stateJson) {
                    const state = JSON.parse(stateJson);
                    state.patternId = savedPatternId;
                    sessionStorage.setItem('mappingModalState', JSON.stringify(state));
                }
            }
            
            // Restore mapping modal
            setTimeout(() => {
                restoreMappingModal();
            }, 300);
        }
    } catch (error) {
        console.error('[OpenShock] Error saving pattern:', error);
        showNotification('Error saving pattern', 'error');
    }
}

async function deletePattern(id) {
    if (!await confirmAction('Are you sure you want to delete this pattern?')) {
        return;
    }

    try {
        const response = await fetch(`/api/openshock/patterns/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete pattern');

        await loadPatterns();
        renderPatternList();
        showNotification('Pattern deleted successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error deleting pattern:', error);
        showNotification('Error deleting pattern', 'error');
    }
}

async function executePattern(id, deviceId) {
    if (!deviceId) {
        showNotification('Please select a device', 'error');
        return;
    }

    try {
        const response = await fetch('/api/openshock/patterns/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patternId: id, deviceId })
        });

        if (!response.ok) throw new Error('Failed to execute pattern');

        showNotification('Pattern execution started', 'success');
    } catch (error) {
        console.error('[OpenShock] Error executing pattern:', error);
        showNotification('Error executing pattern', 'error');
    }
}

function generateFromCurve() {
    // Open curve generator modal
    const curveType = prompt('Enter curve type (linear, exponential, sine, pulse):');
    if (!curveType) return;

    const steps = parseInt(prompt('Enter number of steps (5-20):', '10'));
    if (!steps || steps < 5 || steps > 20) return;

    const duration = parseInt(prompt('Enter step duration (ms):', '500'));
    if (!duration) return;

    // Generate pattern based on curve
    currentPatternSteps = [];

    for (let i = 0; i < steps; i++) {
        let intensity;
        const progress = i / (steps - 1);

        if (curveType === 'linear') {
            intensity = Math.round(10 + (progress * 90));
        } else if (curveType === 'exponential') {
            intensity = Math.round(10 + (Math.pow(progress, 2) * 90));
        } else if (curveType === 'sine') {
            intensity = Math.round(50 + (Math.sin(progress * Math.PI * 2) * 40));
        } else if (curveType === 'pulse') {
            intensity = i % 2 === 0 ? 80 : 20;
        } else {
            intensity = 50;
        }

        currentPatternSteps.push({
            type: 'shock',
            intensity: Math.min(100, Math.max(1, intensity)),
            duration,
            delay: 100
        });
    }

    renderPatternSteps();
    showNotification('Pattern generated from curve', 'success');
}

// ====================================================================
// SAFETY FUNCTIONS
// ====================================================================

async function loadSafetyConfig() {
    // Safety config is part of main config
    const maxIntensity = config.safety?.maxIntensity || 100;
    const maxDuration = config.safety?.maxDuration || 5000;
    const cooldown = config.safety?.cooldown || 1000;

    document.getElementById('safety-max-intensity').value = maxIntensity;
    document.getElementById('safety-max-duration').value = maxDuration;
    document.getElementById('safety-cooldown').value = cooldown;
}

async function saveSafetyConfig() {
    const safety = {
        maxIntensity: parseInt(document.getElementById('safety-max-intensity').value),
        maxDuration: parseInt(document.getElementById('safety-max-duration').value),
        cooldown: parseInt(document.getElementById('safety-cooldown').value)
    };

    try {
        const response = await fetch('/api/openshock/safety', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(safety)
        });

        if (!response.ok) throw new Error('Failed to save safety config');

        await loadConfig();
        showNotification('Safety configuration saved', 'success');
    } catch (error) {
        console.error('[OpenShock] Error saving safety config:', error);
        showNotification('Error saving safety configuration', 'error');
    }
}

async function triggerEmergencyStop() {
    // Emergency stop should execute immediately without confirmation
    try {
        const response = await fetch('/api/openshock/emergency-stop', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to trigger emergency stop');

        showNotification('🛑 EMERGENCY STOP ACTIVATED', 'error');
    } catch (error) {
        console.error('[OpenShock] Error triggering emergency stop:', error);
        showNotification('Error triggering emergency stop', 'error');
    }
}

async function clearEmergencyStop() {
    try {
        const response = await fetch('/api/openshock/emergency-clear', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to clear emergency stop');

        showNotification('Emergency stop cleared', 'success');
    } catch (error) {
        console.error('[OpenShock] Error clearing emergency stop:', error);
        showNotification('Error clearing emergency stop', 'error');
    }
}

// ====================================================================
// ADVANCED FUNCTIONS
// ====================================================================

async function saveApiSettings() {
    const apiKey = document.getElementById('apiKey').value;
    const baseUrl = document.getElementById('baseUrl').value;

    if (!apiKey || apiKey.includes('...')) {
        showNotification('Please enter a valid API key', 'error');
        return;
    }

    try {
        const response = await fetch('/api/openshock/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey, baseUrl })
        });

        if (!response.ok) {
            // Try to get error message from response
            let errorMessage = 'Failed to save API settings';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // Response was not JSON, use default message
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();
        
        await loadConfig();
        
        // After saving API settings, refresh devices and update API status
        try {
            await loadDevices();
            renderDeviceList();
            renderPatternList();
            
            const deviceCount = result.deviceCount || devices.length;
            updateApiStatus(deviceCount > 0, deviceCount);
            
            if (deviceCount > 0) {
                showNotification(`✅ API settings saved and ${deviceCount} device(s) loaded successfully`, 'success');
            } else if (result.deviceLoadSuccess === false) {
                showNotification('⚠️ API settings saved but could not load devices', 'warning');
            } else {
                showNotification('⚠️ API settings saved but no devices found', 'warning');
            }
        } catch (loadError) {
            console.error('[OpenShock] Could not load devices after saving settings:', loadError);
            updateApiStatus(false, 0);
            showNotification(`❌ API settings saved but failed to load devices: ${loadError.message || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('[OpenShock] Error saving API settings:', error);
        showNotification('Error saving API settings', 'error');
        updateApiStatus(false, 0);
    }
}

async function testConnection() {
    const button = document.querySelector('.test-connection-btn');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
    }

    try {
        const response = await fetch('/api/openshock/test-connection', {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showNotification('Connection successful!', 'success');
            
            // Update API status display
            updateApiStatus(true, result.deviceCount || 0);
            
            // Auto-refresh devices after successful connection
            try {
                await loadDevices();
                renderDeviceList();
                renderPatternList();
                showNotification(`Devices refreshed - loaded ${devices.length} device(s)`, 'success');
            } catch (loadError) {
                console.error('[OpenShock] Could not load devices after connection test:', loadError);
                showNotification('Connection successful but could not load devices', 'warning');
            }
        } else {
            throw new Error(result.error || 'Connection failed');
        }
    } catch (error) {
        console.error('[OpenShock] Connection test failed:', error);
        showNotification(`Connection failed: ${error.message}`, 'error');
        
        // Update API status display
        updateApiStatus(false, 0);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-plug"></i> Test Connection';
        }
    }
}

function updateApiStatus(connected, deviceCount) {
    // Update API Status badge
    const apiStatusEl = document.getElementById('apiStatus');
    if (apiStatusEl) {
        if (connected) {
            apiStatusEl.textContent = '🟢';
            apiStatusEl.title = 'API Connected';
        } else {
            apiStatusEl.textContent = '🔴';
            apiStatusEl.title = 'API Disconnected';
        }
    }
    
    // Update Connection State
    const connectionStateEl = document.getElementById('connectionState');
    if (connectionStateEl) {
        connectionStateEl.textContent = connected ? 'Online' : 'Offline';
    }
    
    // Update Device Count
    const deviceCountEl = document.getElementById('deviceCount');
    if (deviceCountEl) {
        deviceCountEl.textContent = deviceCount;
    }
}

function updateTestShockDeviceList() {
    const testShockDevice = document.getElementById('testShockDevice');
    const testShockButton = document.getElementById('testShockButton');
    
    if (!testShockDevice) return;
    
    // Clear existing options
    testShockDevice.innerHTML = '<option value="">-- Select a device --</option>';
    
    // Add device options
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = device.name || device.id;
        
        // Disable paused devices and add indicator
        if (device.isPaused) {
            option.disabled = true;
            option.textContent += ' (Paused)';
        }
        
        testShockDevice.appendChild(option);
    });
    
    // Enable/disable button based on device availability
    if (testShockButton) {
        testShockButton.disabled = devices.length === 0;
    }
}

function updateMappingDeviceList(selectedDeviceId = '') {
    const deviceSelect = document.getElementById('mappingDevice');
    
    if (!deviceSelect) return;
    
    // Clear existing options
    deviceSelect.innerHTML = '<option value="">Select Device...</option>';
    
    // Add device options
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = device.name || device.id;
        
        // Disable paused devices and add indicator
        if (device.isPaused) {
            option.disabled = true;
            option.textContent += ' (Paused)';
        }
        
        if (device.id === selectedDeviceId) {
            option.selected = true;
        }
        deviceSelect.appendChild(option);
    });
}

function updateMappingPatternList(selectedPatternId = '') {
    const patternSelect = document.getElementById('mappingPattern');
    
    if (!patternSelect) return;
    
    // Clear existing options
    patternSelect.innerHTML = '<option value="">None (Single pulse)</option>';
    
    // Add pattern options - include both preset and custom patterns
    patterns.forEach(pattern => {
        const option = document.createElement('option');
        option.value = pattern.id;
        option.textContent = pattern.name || pattern.id;
        
        // Add indicator for preset patterns
        if (pattern.preset) {
            option.textContent += ' ⭐';
        }
        
        if (pattern.id === selectedPatternId) {
            option.selected = true;
        }
        patternSelect.appendChild(option);
    });
    
    // Update pattern preview if a pattern is selected
    updateMappingPatternPreview(selectedPatternId);
}

/**
 * Configure the edit button visibility and state based on pattern type
 * @param {HTMLElement} button - The edit button element
 * @param {boolean} isPreset - Whether the pattern is a preset pattern
 */
function configurePatternEditButton(button, isPreset) {
    if (!button) return;
    
    button.style.display = 'inline-flex';
    if (isPreset) {
        button.disabled = true;
        button.title = 'Preset patterns cannot be edited';
    } else {
        button.disabled = false;
        button.title = 'Edit this pattern';
    }
}

/**
 * Update the pattern preview display in the mapping modal
 * Shows pattern steps with intensity, duration, and delay when a pattern is selected
 * @param {string} patternId - The ID of the pattern to preview, or empty string for none
 */
function updateMappingPatternPreview(patternId) {
    const previewBox = document.getElementById('mappingPatternPreview');
    const stepsContainer = document.getElementById('mappingPatternSteps');
    const editButton = document.getElementById('editPatternFromMapping');
    
    if (!previewBox || !stepsContainer) return;
    
    if (!patternId) {
        // No pattern selected - hide preview and edit button
        previewBox.style.display = 'none';
        if (editButton) editButton.style.display = 'none';
        return;
    }
    
    // Find the pattern
    const pattern = patterns.find(p => p.id === patternId);
    if (!pattern) {
        previewBox.style.display = 'none';
        if (editButton) editButton.style.display = 'none';
        return;
    }
    
    // Configure edit button based on pattern type
    configurePatternEditButton(editButton, pattern.preset);
    
    // Render pattern steps
    if (pattern.steps && pattern.steps.length > 0) {
        const stepsHtml = pattern.steps.map((step, index) => `
            <div class="pattern-step-item">
                <span class="pattern-step-number">${index + 1}.</span>
                <span class="pattern-step-type">${escapeHtml(step.type)}</span>
                <div class="pattern-step-details">
                    <span class="pattern-step-detail">
                        <span>💪</span>
                        <span>${step.intensity}%</span>
                    </span>
                    <span class="pattern-step-detail">
                        <span>⏱️</span>
                        <span>${step.duration}ms</span>
                    </span>
                    ${step.delay ? `
                        <span class="pattern-step-detail">
                            <span>⏸️</span>
                            <span>${step.delay}ms</span>
                        </span>
                    ` : ''}
                </div>
            </div>
        `).join('');
        
        stepsContainer.innerHTML = stepsHtml;
        previewBox.style.display = 'block';
    } else {
        stepsContainer.innerHTML = '<p class="text-muted" style="margin: 0; font-size: 0.85em;">No steps defined</p>';
        previewBox.style.display = 'block';
    }
}

/**
 * Open the pattern editor modal from within the mapping modal
 * Saves the current mapping modal state to session storage to restore later
 * @param {string|null} patternId - The pattern ID to edit, or null to create new
 */
function openPatternEditorFromMapping(patternId = null) {
    const mappingModal = document.getElementById('mappingModal');
    
    // Store that we came from mapping modal
    if (mappingModal) {
        sessionStorage.setItem('returnToMappingModal', 'true');
        // Store current mapping state
        const mappingState = {
            name: document.getElementById('mappingName')?.value,
            enabled: document.getElementById('mappingEnabled')?.checked,
            eventType: document.getElementById('mappingEventType')?.value,
            actionType: document.getElementById('mappingActionType')?.value,
            deviceId: document.getElementById('mappingDevice')?.value,
            intensity: document.getElementById('mappingIntensity')?.value,
            duration: document.getElementById('mappingDuration')?.value,
            patternId: document.getElementById('mappingPattern')?.value,
            giftName: document.getElementById('mappingGiftName')?.value,
            giftNameSelect: document.getElementById('mappingGiftNameSelect')?.value,
            minCoins: document.getElementById('mappingMinCoins')?.value,
            messagePattern: document.getElementById('mappingMessagePattern')?.value,
            editingId: mappingModal.dataset.editingId
        };
        sessionStorage.setItem('mappingModalState', JSON.stringify(mappingState));
    }
    
    // Close mapping modal
    closeModal('mappingModal');
    
    // Open pattern modal
    openPatternModal(patternId);
}

/**
 * Restore the mapping modal after returning from pattern editor
 * Retrieves saved state from session storage and repopulates all form fields
 * Called automatically after pattern save/cancel if returnToMappingModal flag is set
 */
function restoreMappingModal() {
    const shouldReturn = sessionStorage.getItem('returnToMappingModal');
    if (shouldReturn !== 'true') return;
    
    // Clear the flag
    sessionStorage.removeItem('returnToMappingModal');
    
    // Get stored state
    const stateJson = sessionStorage.getItem('mappingModalState');
    if (!stateJson) return;
    
    const state = JSON.parse(stateJson);
    sessionStorage.removeItem('mappingModalState');
    
    // Reopen mapping modal with stored state
    const editingId = state.editingId || null;
    openMappingModal(editingId);
    
    // Wait a bit for modal to be fully rendered, then restore state
    setTimeout(() => {
        const nameEl = document.getElementById('mappingName');
        if (nameEl && state.name) nameEl.value = state.name;
        
        const enabledEl = document.getElementById('mappingEnabled');
        if (enabledEl && state.enabled !== undefined) enabledEl.checked = state.enabled;
        
        const eventTypeEl = document.getElementById('mappingEventType');
        if (eventTypeEl && state.eventType) eventTypeEl.value = state.eventType;
        
        const actionTypeEl = document.getElementById('mappingActionType');
        if (actionTypeEl && state.actionType) actionTypeEl.value = state.actionType;
        
        if (state.deviceId) {
            const deviceSelect = document.getElementById('mappingDevice');
            if (deviceSelect) deviceSelect.value = state.deviceId;
        }
        if (state.intensity) {
            const slider = document.getElementById('mappingIntensity');
            const value = document.getElementById('mappingIntensityValue');
            if (slider) slider.value = state.intensity;
            if (value) value.textContent = state.intensity;
        }
        if (state.duration) {
            const slider = document.getElementById('mappingDuration');
            const value = document.getElementById('mappingDurationValue');
            if (slider) slider.value = state.duration;
            if (value) value.textContent = state.duration;
        }
        
        // Restore pattern selection after patterns are loaded
        if (state.patternId) {
            const patternSelect = document.getElementById('mappingPattern');
            if (patternSelect) {
                patternSelect.value = state.patternId;
                updateMappingPatternPreview(state.patternId);
            }
        }
        
        const giftNameEl = document.getElementById('mappingGiftName');
        if (giftNameEl && state.giftName) giftNameEl.value = state.giftName;
        
        const giftNameSelectEl = document.getElementById('mappingGiftNameSelect');
        if (giftNameSelectEl && state.giftNameSelect) giftNameSelectEl.value = state.giftNameSelect;
        
        const minCoinsEl = document.getElementById('mappingMinCoins');
        if (minCoinsEl && state.minCoins) minCoinsEl.value = state.minCoins;
        
        const messagePatternEl = document.getElementById('mappingMessagePattern');
        if (messagePatternEl && state.messagePattern) messagePatternEl.value = state.messagePattern;
        
        // Update trigger fields display based on event type
        // Directly call populateTriggerFields instead of dispatching a synthetic event
        if (state.eventType) {
            populateTriggerFields({
                type: state.eventType,
                giftName: state.giftNameSelect || state.giftName,
                minCoins: state.minCoins,
                messagePattern: state.messagePattern
            });
        }
    }, 100);
}

async function executeTestShock() {
    const testShockDevice = document.getElementById('testShockDevice');
    const deviceId = testShockDevice ? testShockDevice.value : '';
    
    if (!deviceId) {
        showNotification('Please select a device for test shock', 'error');
        return;
    }
    
    const button = document.getElementById('testShockButton');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    }
    
    try {
        const response = await fetch(`/api/openshock/test/${deviceId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'shock',
                intensity: 100,
                duration: 1000
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Test shock failed');
        }
        
        showNotification('⚡ Test shock sent successfully!', 'success');
    } catch (error) {
        console.error('[OpenShock] Error sending test shock:', error);
        showNotification(`Error sending test shock: ${error.message}`, 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '⚡ Test Shock (1s, 100%)';
        }
    }
}

async function refreshDevices() {
    const button = document.querySelector('.refresh-devices-btn');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    }

    try {
        const response = await fetch('/api/openshock/devices/refresh', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to refresh devices');

        const result = await response.json();
        
        await loadDevices();
        renderDeviceList();
        
        // Update pattern device dropdowns
        renderPatternList();
        
        // Update API status with device count
        updateApiStatus(devices.length > 0, devices.length);
        
        showNotification(`Devices refreshed successfully - loaded ${devices.length} device(s)`, 'success');
    } catch (error) {
        console.error('[OpenShock] Error refreshing devices:', error);
        showNotification('Error refreshing devices', 'error');
        
        // Update API status as failed
        updateApiStatus(false, 0);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-sync"></i> Refresh Devices';
        }
    }
}

async function clearQueue() {
    if (!await confirmAction('Clear all pending commands from the queue?')) {
        return;
    }

    try {
        const response = await fetch('/api/openshock/queue/clear', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to clear queue');

        await loadQueueStatus();
        renderQueueStatus();
        showNotification('Queue cleared successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error clearing queue:', error);
        showNotification('Error clearing queue', 'error');
    }
}

async function testDevice(deviceId, type) {
    if (!await confirmAction(`Send test ${type} command to device?\n\nTest: 1 second @ 100% intensity`)) {
        return;
    }

    try {
        const response = await fetch(`/api/openshock/test/${deviceId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, intensity: 100, duration: 1000 })
        });

        if (!response.ok) throw new Error('Failed to send test command');

        showNotification(`Test ${type} command sent (1s @ 100%)`, 'success');
    } catch (error) {
        console.error('[OpenShock] Error testing device:', error);
        showNotification('Error sending test command', 'error');
    }
}

// ====================================================================
// TAB SYSTEM
// ====================================================================

function initializeTabs() {
    const tabButtons = document.querySelectorAll('[data-tab]');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    currentTab = tabId;

    // Update tab buttons
    document.querySelectorAll('[data-tab]').forEach(button => {
        if (button.getAttribute('data-tab') === tabId) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // BUG FIX: Use correct selector - HTML has id="dashboard" class="tab-content"
    // not id="openshock-tab-dashboard" class="openshock-tab-pane"
    document.querySelectorAll('.tab-content').forEach(pane => {
        if (pane.id === tabId) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });

    // Load tab-specific data
    if (tabId === 'safety') {
        loadSafetyConfig();
    }
}

// ====================================================================
// MODAL SYSTEM
// ====================================================================

function initializeModals() {
    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    // Close modal on close button click - use the modal-close class from HTML
    document.querySelectorAll('.modal-close').forEach(button => {
        button.addEventListener('click', () => {
            const modalId = button.closest('.modal').id;
            closeModal(modalId);
        });
    });

    // Event listeners for dynamic form updates
    const triggerTypeSelect = document.getElementById('mappingEventType');
    if (triggerTypeSelect) {
        triggerTypeSelect.addEventListener('change', () => populateTriggerFields());
    }

    const actionTypeSelect = document.getElementById('mappingActionType');
    if (actionTypeSelect) {
        actionTypeSelect.addEventListener('change', () => populateActionFields());
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function closePatternModalAndMaybeReturnToMapping() {
    closeModal('patternModal');
    
    // Check if we should return to mapping modal
    const shouldReturn = sessionStorage.getItem('returnToMappingModal');
    if (shouldReturn === 'true') {
        // Wait a bit for the pattern modal to close, then restore mapping modal
        setTimeout(() => {
            restoreMappingModal();
        }, 300);
    }
}

// ====================================================================
// UTILITY FUNCTIONS
// ====================================================================

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `openshock-notification openshock-notification-${type}`;

    const icon = type === 'success' ? 'check-circle' :
                 type === 'error' ? 'exclamation-circle' :
                 type === 'warning' ? 'exclamation-triangle' : 'info-circle';

    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${escapeHtml(message)}</span>
    `;

    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function confirmAction(message) {
    return new Promise((resolve) => {
        const confirmed = confirm(message);
        resolve(confirmed);
    });
}

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimestamp(ts) {
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleString();
}

function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getBatteryIcon(level) {
    if (level > 75) return 'full';
    if (level > 50) return 'three-quarters';
    if (level > 25) return 'half';
    if (level > 10) return 'quarter';
    return 'empty';
}

function getSignalStrength(rssi) {
    if (rssi > -50) return 'excellent';
    if (rssi > -60) return 'good';
    if (rssi > -70) return 'fair';
    return 'poor';
}

function getCommandTypeColor(type) {
    const colors = {
        shock: 'danger',
        vibrate: 'warning',
        beep: 'info',
        sound: 'info'
    };
    return colors[type] || 'secondary';
}

function renderTriggerDetails(trigger) {
    if (trigger.type === 'gift' && trigger.giftName) {
        return `<span class="openshock-detail">${escapeHtml(trigger.giftName)}</span>`;
    }
    if (trigger.type === 'gift' && trigger.minCoins) {
        return `<span class="openshock-detail">Min ${trigger.minCoins} coins</span>`;
    }
    if (trigger.type === 'viewer_count') {
        return `<span class="openshock-detail">Threshold: ${trigger.threshold}</span>`;
    }
    if (trigger.type === 'keyword' && trigger.keywords) {
        return `<span class="openshock-detail">${trigger.keywords.map(k => escapeHtml(k)).join(', ')}</span>`;
    }
    return '';
}

function renderActionDetails(action) {
    return `
        <span class="openshock-detail">${action.intensity}%</span>
        <span class="openshock-detail">${action.duration}ms</span>
    `;
}

function calculatePatternDuration(steps) {
    return steps.reduce((total, step) => total + step.duration + (step.delay || 0), 0);
}

// ====================================================================
// EVENT DELEGATION
// ====================================================================

function initializeEventDelegation() {
    // Static button event listeners (buttons with IDs from HTML)
    
    // Dashboard tab buttons
    const refreshDevicesBtn = document.getElementById('refreshDevices');
    if (refreshDevicesBtn) {
        refreshDevicesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            refreshDevices();
        });
    }

    const resetStatsBtn = document.getElementById('resetStats');
    if (resetStatsBtn) {
        resetStatsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            resetStats();
        });
    }

    const clearLogBtn = document.getElementById('clearLog');
    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearCommandLog();
        });
    }

    const exportLogBtn = document.getElementById('exportLog');
    if (exportLogBtn) {
        exportLogBtn.addEventListener('click', (e) => {
            e.preventDefault();
            exportCommandLog();
        });
    }

    // Mapper tab buttons
    const addMappingBtn = document.getElementById('addMapping');
    if (addMappingBtn) {
        addMappingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openMappingModal();
        });
    }

    const importMappingsBtn = document.getElementById('importMappings');
    if (importMappingsBtn) {
        importMappingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            importMappings();
        });
    }

    const exportMappingsBtn = document.getElementById('exportMappings');
    if (exportMappingsBtn) {
        exportMappingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            exportMappings();
        });
    }

    // Gift Catalog tab buttons
    const refreshGiftCatalogBtn = document.getElementById('refreshGiftCatalog');
    if (refreshGiftCatalogBtn) {
        refreshGiftCatalogBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await refreshGiftCatalog();
        });
    }
    
    // Gift name select change handler
    const giftNameSelect = document.getElementById('mappingGiftNameSelect');
    if (giftNameSelect) {
        giftNameSelect.addEventListener('change', (e) => {
            const giftNameInput = document.getElementById('mappingGiftName');
            if (giftNameInput && e.target.value) {
                // Clear manual input when selecting from dropdown
                giftNameInput.value = '';
            }
        });
    }

    // Safety tab buttons
    const saveGlobalLimitsBtn = document.getElementById('saveGlobalLimits');
    if (saveGlobalLimitsBtn) {
        saveGlobalLimitsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveSafetyConfig();
        });
    }

    const saveUserLimitsBtn = document.getElementById('saveUserLimits');
    if (saveUserLimitsBtn) {
        saveUserLimitsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveSafetyConfig();
        });
    }

    const emergencyStopBtn = document.getElementById('emergencyStop');
    if (emergencyStopBtn) {
        emergencyStopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            triggerEmergencyStop();
        });
    }

    // Patterns tab buttons
    const addPatternBtn = document.getElementById('addPattern');
    if (addPatternBtn) {
        addPatternBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openPatternModal();
        });
    }

    const importPatternsBtn = document.getElementById('importPatterns');
    if (importPatternsBtn) {
        importPatternsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            importPatterns();
        });
    }

    const exportPatternsBtn = document.getElementById('exportPatterns');
    if (exportPatternsBtn) {
        exportPatternsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            exportPatterns();
        });
    }

    const generateCurveBtn = document.getElementById('generateCurve');
    if (generateCurveBtn) {
        generateCurveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            generateFromCurve();
        });
    }

    // Advanced tab buttons
    const saveApiSettingsBtn = document.getElementById('saveApiSettings');
    if (saveApiSettingsBtn) {
        saveApiSettingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveApiSettings();
        });
    }

    const testConnectionBtn = document.getElementById('testConnection');
    if (testConnectionBtn) {
        testConnectionBtn.addEventListener('click', (e) => {
            e.preventDefault();
            testConnection();
        });
    }
    
    // Test shock button
    const testShockButton = document.getElementById('testShockButton');
    if (testShockButton) {
        testShockButton.addEventListener('click', (e) => {
            e.preventDefault();
            executeTestShock();
        });
    }
    
    // Test shock device selector - enable/disable button when selection changes
    const testShockDevice = document.getElementById('testShockDevice');
    if (testShockDevice) {
        testShockDevice.addEventListener('change', (e) => {
            const button = document.getElementById('testShockButton');
            if (button) {
                button.disabled = !e.target.value;
            }
        });
    }

    const pauseQueueBtn = document.getElementById('pauseQueue');
    if (pauseQueueBtn) {
        pauseQueueBtn.addEventListener('click', (e) => {
            e.preventDefault();
            pauseQueue();
        });
    }

    const resumeQueueBtn = document.getElementById('resumeQueue');
    if (resumeQueueBtn) {
        resumeQueueBtn.addEventListener('click', (e) => {
            e.preventDefault();
            resumeQueue();
        });
    }

    const clearQueueBtn = document.getElementById('clearQueue');
    if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearQueue();
        });
    }

    const clearDebugLogBtn = document.getElementById('clearDebugLog');
    if (clearDebugLogBtn) {
        clearDebugLogBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearDebugLog();
        });
    }

    const exportDebugLogBtn = document.getElementById('exportDebugLog');
    if (exportDebugLogBtn) {
        exportDebugLogBtn.addEventListener('click', (e) => {
            e.preventDefault();
            exportDebugLog();
        });
    }

    // Modal buttons
    const closeMappingModalBtn = document.getElementById('closeMappingModal');
    if (closeMappingModalBtn) {
        closeMappingModalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal('mappingModal');
        });
    }

    const saveMappingBtn = document.getElementById('saveMappingBtn');
    if (saveMappingBtn) {
        saveMappingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveMappingModal();
        });
    }

    const cancelMappingBtn = document.getElementById('cancelMappingBtn');
    if (cancelMappingBtn) {
        cancelMappingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal('mappingModal');
        });
    }

    const closePatternModalBtn = document.getElementById('closePatternModal');
    if (closePatternModalBtn) {
        closePatternModalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closePatternModalAndMaybeReturnToMapping();
        });
    }

    const savePatternBtn = document.getElementById('savePatternBtn');
    if (savePatternBtn) {
        savePatternBtn.addEventListener('click', (e) => {
            e.preventDefault();
            savePatternModal();
        });
    }

    const cancelPatternBtn = document.getElementById('cancelPatternBtn');
    if (cancelPatternBtn) {
        cancelPatternBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closePatternModalAndMaybeReturnToMapping();
        });
    }

    const addPatternStepBtn = document.getElementById('addPatternStep');
    if (addPatternStepBtn) {
        addPatternStepBtn.addEventListener('click', (e) => {
            e.preventDefault();
            addPatternStep();
        });
    }

    const saveStepBtn = document.getElementById('saveStep');
    if (saveStepBtn) {
        saveStepBtn.addEventListener('click', (e) => {
            e.preventDefault();
            savePatternStep();
        });
    }

    const cancelStepBtn = document.getElementById('cancelStep');
    if (cancelStepBtn) {
        cancelStepBtn.addEventListener('click', (e) => {
            e.preventDefault();
            cancelPatternStep();
        });
    }

    // Slider value updates
    const globalMaxIntensitySlider = document.getElementById('globalMaxIntensity');
    const globalMaxIntensityValue = document.getElementById('globalMaxIntensityValue');
    if (globalMaxIntensitySlider && globalMaxIntensityValue) {
        globalMaxIntensitySlider.addEventListener('input', (e) => {
            globalMaxIntensityValue.textContent = e.target.value;
        });
    }

    const globalMaxDurationSlider = document.getElementById('globalMaxDuration');
    const globalMaxDurationValue = document.getElementById('globalMaxDurationValue');
    if (globalMaxDurationSlider && globalMaxDurationValue) {
        globalMaxDurationSlider.addEventListener('input', (e) => {
            globalMaxDurationValue.textContent = e.target.value;
        });
    }

    const mappingIntensitySlider = document.getElementById('mappingIntensity');
    const mappingIntensityValue = document.getElementById('mappingIntensityValue');
    if (mappingIntensitySlider && mappingIntensityValue) {
        mappingIntensitySlider.addEventListener('input', (e) => {
            mappingIntensityValue.textContent = e.target.value;
        });
    }

    const mappingDurationSlider = document.getElementById('mappingDuration');
    const mappingDurationValue = document.getElementById('mappingDurationValue');
    if (mappingDurationSlider && mappingDurationValue) {
        mappingDurationSlider.addEventListener('input', (e) => {
            mappingDurationValue.textContent = e.target.value;
        });
    }

    const stepIntensitySlider = document.getElementById('stepIntensity');
    const stepIntensityValue = document.getElementById('stepIntensityValue');
    if (stepIntensitySlider && stepIntensityValue) {
        stepIntensitySlider.addEventListener('input', (e) => {
            stepIntensityValue.textContent = e.target.value;
        });
    }

    // Pattern selection change in mapping modal
    const mappingPatternSelect = document.getElementById('mappingPattern');
    if (mappingPatternSelect) {
        mappingPatternSelect.addEventListener('change', (e) => {
            updateMappingPatternPreview(e.target.value);
        });
    }

    // Create pattern from mapping button
    const createPatternFromMappingBtn = document.getElementById('createPatternFromMapping');
    if (createPatternFromMappingBtn) {
        createPatternFromMappingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openPatternEditorFromMapping();
        });
    }

    // Edit pattern from mapping button
    const editPatternFromMappingBtn = document.getElementById('editPatternFromMapping');
    if (editPatternFromMappingBtn) {
        editPatternFromMappingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const patternSelect = document.getElementById('mappingPattern');
            const patternId = patternSelect ? patternSelect.value : '';
            if (patternId) {
                openPatternEditorFromMapping(patternId);
            }
        });
    }

    // Use event delegation for dynamically created elements
    document.addEventListener('click', (e) => {
        // Refresh devices button
        if (e.target.closest('.refresh-devices-btn')) {
            e.preventDefault();
            refreshDevices();
        }

        // Test device buttons
        if (e.target.closest('.test-device-btn')) {
            e.preventDefault();
            const button = e.target.closest('.test-device-btn');
            const deviceId = button.dataset.deviceId;
            const testType = button.dataset.testType;
            testDevice(deviceId, testType);
        }

        // Create mapping button
        if (e.target.closest('.create-mapping-btn')) {
            e.preventDefault();
            openMappingModal();
        }

        // Edit mapping button
        if (e.target.closest('.edit-mapping-btn')) {
            e.preventDefault();
            const button = e.target.closest('.edit-mapping-btn');
            const mappingId = button.dataset.mappingId;
            openMappingModal(mappingId);
        }

        // Delete mapping button
        if (e.target.closest('.delete-mapping-btn')) {
            e.preventDefault();
            const button = e.target.closest('.delete-mapping-btn');
            const mappingId = button.dataset.mappingId;
            deleteMapping(mappingId);
        }

        // Create mapping for gift button
        if (e.target.closest('.create-mapping-for-gift-btn')) {
            e.preventDefault();
            const button = e.target.closest('.create-mapping-for-gift-btn');
            const giftName = button.dataset.giftName;
            const giftCoins = parseInt(button.dataset.giftCoins) || 0;
            openMappingModalForGift(giftName, giftCoins);
        }

        // Create pattern button
        if (e.target.closest('.create-pattern-btn')) {
            e.preventDefault();
            openPatternModal();
        }

        // Edit pattern button
        if (e.target.closest('.edit-pattern-btn')) {
            e.preventDefault();
            const button = e.target.closest('.edit-pattern-btn');
            const patternId = button.dataset.patternId;
            openPatternModal(patternId);
        }

        // Delete pattern button
        if (e.target.closest('.delete-pattern-btn')) {
            e.preventDefault();
            const button = e.target.closest('.delete-pattern-btn');
            const patternId = button.dataset.patternId;
            deletePattern(patternId);
        }

        // Execute pattern button
        if (e.target.closest('.execute-pattern-btn')) {
            e.preventDefault();
            const button = e.target.closest('.execute-pattern-btn');
            const patternId = button.dataset.patternId;
            const select = document.getElementById(`pattern-device-${patternId}`);
            const deviceId = select ? select.value : '';
            executePattern(patternId, deviceId);
        }

        // Clear queue button
        if (e.target.closest('.clear-queue-btn')) {
            e.preventDefault();
            clearQueue();
        }

        // Remove pattern step button
        if (e.target.closest('.remove-pattern-step-btn')) {
            e.preventDefault();
            const button = e.target.closest('.remove-pattern-step-btn');
            const stepIndex = parseInt(button.dataset.stepIndex);
            removePatternStep(stepIndex);
        }

        // Test connection button (static button in settings)
        if (e.target.closest('.test-connection-btn')) {
            e.preventDefault();
            testConnection();
        }
    });

    // Toggle mapping checkbox (change event)
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('toggle-mapping-checkbox')) {
            const mappingId = e.target.dataset.mappingId;
            const enabled = e.target.checked;
            toggleMapping(mappingId, enabled);
        }
    });
}

// ====================================================================
// ADDITIONAL UI FUNCTIONS
// ====================================================================

async function resetStats() {
    if (!await confirmAction('Reset all statistics?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/openshock/stats/reset', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to reset stats');

        await loadStats();
        renderStats();
        showNotification('Statistics reset successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error resetting stats:', error);
        showNotification('Error resetting statistics', 'error');
    }
}

function clearCommandLog() {
    debugLogs = [];
    renderCommandLog([]);
    showNotification('Command log cleared', 'success');
}

function exportCommandLog() {
    const data = JSON.stringify(debugLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openshock-commandlog-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Command log exported', 'success');
}

async function pauseQueue() {
    try {
        const response = await fetch('/api/openshock/queue/pause', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to pause queue');

        await loadQueueStatus();
        renderQueueStatus();
        showNotification('Queue paused', 'success');
    } catch (error) {
        console.error('[OpenShock] Error pausing queue:', error);
        showNotification('Error pausing queue', 'error');
    }
}

async function resumeQueue() {
    try {
        const response = await fetch('/api/openshock/queue/resume', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to resume queue');

        await loadQueueStatus();
        renderQueueStatus();
        showNotification('Queue resumed', 'success');
    } catch (error) {
        console.error('[OpenShock] Error resuming queue:', error);
        showNotification('Error resuming queue', 'error');
    }
}

function clearDebugLog() {
    const debugLog = document.getElementById('debugLog');
    if (debugLog) {
        debugLog.innerHTML = '<p class="text-muted text-center">Debug log is empty.</p>';
    }
    showNotification('Debug log cleared', 'success');
}

function exportDebugLog() {
    const debugLog = document.getElementById('debugLog');
    if (debugLog) {
        const data = debugLog.textContent;
        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openshock-debuglog-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Debug log exported', 'success');
    }
}

function savePatternStep() {
    // This function would save the current step being edited
    // For now, it calls addPatternStep which handles the logic
    addPatternStep();
}

function cancelPatternStep() {
    // Hide the step form
    const stepForm = document.getElementById('stepForm');
    if (stepForm) {
        stepForm.classList.add('step-form-hidden');
    }
}

async function importPatterns() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const importedPatterns = JSON.parse(text);
            
            // TODO: Send to backend
            console.log('[OpenShock] Imported patterns:', importedPatterns);
            showNotification('Patterns imported successfully', 'success');
        } catch (error) {
            console.error('[OpenShock] Error importing patterns:', error);
            showNotification('Error importing patterns', 'error');
        }
    };
    
    input.click();
}

async function exportPatterns() {
    try {
        const data = JSON.stringify(patterns, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openshock-patterns-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Patterns exported', 'success');
    } catch (error) {
        console.error('[OpenShock] Error exporting patterns:', error);
        showNotification('Error exporting patterns', 'error');
    }
}

// ====================================================================
// PERIODIC UPDATES
// ====================================================================

function startPeriodicUpdates() {
    // Initial update
    updatePeriodicData();

    // Set interval for 5 seconds
    updateInterval = setInterval(updatePeriodicData, 5000);
}

async function updatePeriodicData() {
    try {
        await Promise.all([
            loadQueueStatus(),
            loadStats()
        ]);

        if (currentTab === 'dashboard') {
            renderQueueStatus();
            renderStats();
        }
    } catch (error) {
        console.error('[OpenShock] Error updating periodic data:', error);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    // Clean up interval
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
    
    // Clean up socket
    if (socket) {
        // Remove all event listeners
        socket.off('connect');
        socket.off('disconnect');
        socket.off('error');
        socket.off('openshock:device-update');
        socket.off('openshock:command-sent');
        socket.off('openshock:queue-update');
        socket.off('openshock:emergency-stop');
        socket.off('openshock:stats-update');
        
        // Disconnect socket
        socket.disconnect();
        socket = null;
    }
});

// Export functions for global access
window.openShock = {
    openMappingModal,
    saveMappingModal,
    deleteMapping,
    toggleMapping,
    importMappings,
    exportMappings,
    openPatternModal,
    savePatternModal,
    deletePattern,
    executePattern,
    addPatternStep,
    removePatternStep,
    generateFromCurve,
    saveApiSettings,
    testConnection,
    refreshDevices,
    updateTestShockDeviceList,
    updateMappingDeviceList,
    updateMappingPatternList,
    updateMappingPatternPreview,
    openPatternEditorFromMapping,
    restoreMappingModal,
    executeTestShock,
    clearQueue,
    testDevice,
    saveSafetyConfig,
    triggerEmergencyStop,
    clearEmergencyStop,
    switchTab
};

console.log('[OpenShock] Plugin UI loaded and ready');
