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

// Pattern step defaults
const DEFAULT_STEP_INTENSITY = 50;
const DEFAULT_STEP_DURATION = 500;
const MODAL_RENDER_DELAY_MS = 50;
const MAX_DEBUG_LOGS = 200;

// ====================================================================
// DEBUG LOGGING FUNCTIONS
// ====================================================================

let debugVerbose = false;

function addDebugLog(level, message) {
    // Validate level parameter
    if (!level || typeof level !== 'string') {
        level = 'info';
    }
    
    const timestamp = new Date().toISOString().substring(11, 23); // HH:MM:SS.mmm
    const log = {
        timestamp,
        level,
        message: message || ''
    };
    
    debugLogs.push(log);
    
    // Keep only last MAX_DEBUG_LOGS entries
    if (debugLogs.length > MAX_DEBUG_LOGS) {
        debugLogs.shift();
    }
    
    // Update UI
    renderDebugLog();
    
    // Also log to console
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](`[OpenShock Debug] [${level.toUpperCase()}] ${message}`);
}

function renderDebugLog() {
    const container = document.getElementById('debugLog');
    if (!container) return;
    
    if (debugLogs.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">Debug log is empty. Pattern operations will be logged here.</p>';
        return;
    }
    
    const levelColors = {
        'error': '#ef4444',
        'warn': '#f59e0b',
        'info': '#3b82f6',
        'success': '#10b981',
        'debug': '#6b7280'
    };
    
    const levelIcons = {
        'error': '❌',
        'warn': '⚠️',
        'info': 'ℹ️',
        'success': '✅',
        'debug': '🔍'
    };
    
    const logsToShow = debugVerbose ? debugLogs : debugLogs.filter(log => log.level !== 'debug');
    
    const html = logsToShow.map(log => {
        const safeLevel = log.level || 'info';
        return `
        <div class="debug-log-entry" style="border-left: 3px solid ${levelColors[safeLevel] || '#6b7280'};">
            <span class="debug-log-time">${log.timestamp}</span>
            <span class="debug-log-level" style="color: ${levelColors[safeLevel] || '#6b7280'}">
                ${levelIcons[safeLevel] || '•'} ${safeLevel.toUpperCase()}
            </span>
            <span class="debug-log-message">${escapeHtml(log.message || '')}</span>
        </div>
    `;
    }).reverse().join('');
    
    container.innerHTML = html;
    
    // Auto-scroll to bottom (newest first, so top)
    container.scrollTop = 0;
}

function clearDebugLog() {
    debugLogs = [];
    renderDebugLog();
    addDebugLog('info', 'Debug log cleared');
}

function exportDebugLog() {
    const dataStr = JSON.stringify(debugLogs, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `openshock-debug-${Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    addDebugLog('info', `Debug log exported (${debugLogs.length} entries)`);
}

function toggleDebugVerbose() {
    debugVerbose = !debugVerbose;
    renderDebugLog();
    const btn = document.getElementById('toggleDebugVerbose');
    if (btn) {
        btn.textContent = debugVerbose ? '📊 Normal' : '📊 Verbose';
        btn.classList.toggle('btn-primary', debugVerbose);
    }
    addDebugLog('info', `Verbose mode ${debugVerbose ? 'enabled' : 'disabled'}`);
}

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

    socket.on('openshock:debug-log', (data) => {
        console.log('[OpenShock] Debug log:', data);
        // Add to debug log UI
        if (data.level && data.message) {
            addDebugLog(data.level, data.message);
        }
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

        // Load like threshold settings
        if (config.likeThreshold) {
            const minLikesInput = document.getElementById('likeThresholdMin');
            const timeWindowInput = document.getElementById('likeThresholdWindow');
            
            if (minLikesInput) {
                minLikesInput.value = config.likeThreshold.minLikes || 10;
            }
            if (timeWindowInput) {
                // Convert milliseconds to seconds for display
                timeWindowInput.value = (config.likeThreshold.timeWindow || 5000) / 1000;
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

    const html = mappings.map(mapping => `
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
                    <span class="mapping-detail-value">${escapeHtml(mapping.action?.commandType || mapping.action?.type || 'Unknown')}</span>
                </div>
                ${mapping.action?.intensity ? `
                    <div class="mapping-detail-item">
                        <span class="mapping-detail-label">Intensity:</span>
                        <span class="mapping-detail-value">${mapping.action.intensity}%</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

function renderPatternList() {
    const customContainer = document.getElementById('customPatternsList');
    
    if (!customContainer) return;

    // Only show custom patterns (no presets)
    const customPatterns = patterns.filter(p => p.preset !== true);

    // Render custom patterns
    if (customPatterns.length === 0) {
        customContainer.innerHTML = `<p class="text-muted text-center">Noch keine Patterns erstellt. Klicke auf "Neues Pattern" um eines zu erstellen.</p>`;
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
                        <span>📊 ${pattern.steps?.length || 0} Schritte</span>
                        <span>⏱️ ${formatDuration(calculatePatternDuration(pattern.steps || []))}</span>
                    </div>
                </div>
                <div class="pattern-footer">
                    <select id="pattern-device-${escapeHtml(pattern.id)}" data-pattern-id="${escapeHtml(pattern.id)}" class="form-select form-select-sm pattern-device-select">
                        <option value="">Gerät wählen...</option>
                        ${devices.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('')}
                    </select>
                    <button data-pattern-id="${escapeHtml(pattern.id)}"
                            class="btn btn-sm btn-primary execute-pattern-btn">
                        ▶️ Ausführen
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
            maxCoins: mapping.conditions.maxCoins,
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
    const conditionCoinRange = document.getElementById('conditionCoinRange');
    const conditionMessagePattern = document.getElementById('conditionMessagePattern');

    if (conditionGift) conditionGift.style.display = type === 'gift' ? 'block' : 'none';
    if (conditionCoinRange) conditionCoinRange.style.display = type === 'gift' ? 'block' : 'none';
    if (conditionMessagePattern) conditionMessagePattern.style.display = type === 'chat' ? 'block' : 'none';

    // Set values if editing
    if (trigger) {
        const giftNameSelect = document.getElementById('mappingGiftNameSelect');
        const giftNameInput = document.getElementById('mappingGiftName');
        const minCoinsInput = document.getElementById('mappingMinCoins');
        const maxCoinsInput = document.getElementById('mappingMaxCoins');
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
        if (maxCoinsInput && trigger.maxCoins !== undefined) maxCoinsInput.value = trigger.maxCoins;
        if (messagePatternInput && trigger.messagePattern) messagePatternInput.value = trigger.messagePattern;
    }
}

function populateActionFields(action) {
    // The action fields are static in the HTML, just set their values
    const intensitySlider = document.getElementById('mappingIntensity');
    const intensityValue = document.getElementById('mappingIntensityValue');
    const durationSlider = document.getElementById('mappingDuration');
    const durationValue = document.getElementById('mappingDurationValue');
    const deviceSelect = document.getElementById('mappingDevice');

    if (action) {
        // Handle pattern-type actions
        if (action.type === 'pattern' && action.patternId) {
            // Select the pattern in the dropdown
            updateMappingPatternList(action.patternId);
            
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
            
            // Select the device if specified
            if (deviceSelect && action.deviceId) {
                updateMappingDeviceList(action.deviceId);
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

    addDebugLog('info', `Saving mapping (${isEdit ? 'edit' : 'new'})`);

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
        addDebugLog('debug', `Mapping action: pattern ${selectedPatternId}`);
    } else {
        // Create a command-type action (single pulse)
        action = {
            type: 'command',
            commandType: actionTypeSelect?.value || 'shock',
            deviceId: deviceSelect?.value || '',
            intensity: parseInt(intensitySlider?.value) || 50,
            duration: parseInt(durationSlider?.value) || 1000
        };
        addDebugLog('debug', `Mapping action: command ${action.commandType}`);
    }
    
    const mapping = {
        name: nameInput?.value || 'Untitled Mapping',
        enabled: enabledCheckbox?.checked !== false,
        eventType: triggerData.type, // Backend expects eventType, not trigger.type
        conditions: {
            // Convert trigger fields to conditions format
            giftName: triggerData.giftName,
            minCoins: triggerData.minCoins || 0,
            maxCoins: triggerData.maxCoins, // Can be undefined for no upper limit
            messagePattern: triggerData.messagePattern
        },
        action: action
    };

    addDebugLog('info', `Mapping data: ${JSON.stringify(mapping, null, 2)}`);

    try {
        const url = isEdit ? `/api/openshock/mappings/${mappingId}` : '/api/openshock/mappings';
        const method = isEdit ? 'PUT' : 'POST';

        addDebugLog('info', `Sending ${method} request to ${url}`);

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mapping)
        });

        addDebugLog('info', `Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            addDebugLog('error', `Server error: ${JSON.stringify(errorData)}`);
            throw new Error(errorData.error || 'Failed to save mapping');
        }

        const responseData = await response.json();
        addDebugLog('success', `Mapping saved successfully: ${JSON.stringify(responseData)}`);

        await loadMappings();
        renderMappingList();
        closeModal('mappingModal');

        showNotification(`Mapping ${isEdit ? 'aktualisiert' : 'erstellt'}`, 'success');
        addDebugLog('info', `Mapping "${mapping.name}" ${isEdit ? 'updated' : 'created'} successfully`);
    } catch (error) {
        console.error('[OpenShock] Error saving mapping:', error);
        addDebugLog('error', `Mapping save error: ${error.message}`);
        showNotification(`Fehler beim Speichern: ${error.message}`, 'error');
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
        const maxCoinsInput = document.getElementById('mappingMaxCoins');
        
        // Prefer manual input over select dropdown (manual input takes precedence)
        if (giftNameInput?.value) {
            trigger.giftName = giftNameInput.value;
        } else if (giftNameSelect?.value) {
            trigger.giftName = giftNameSelect.value;
        }
        
        if (minCoinsInput?.value) trigger.minCoins = parseInt(minCoinsInput.value);
        if (maxCoinsInput?.value) trigger.maxCoins = parseInt(maxCoinsInput.value);
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

    const isEdit = patternId !== null && patternId !== 'add';
    const pattern = isEdit ? patterns.find(p => p.id === patternId) : null;

    const modalTitle = document.getElementById('patternModalTitle');
    const nameInput = document.getElementById('patternName');
    const descriptionInput = document.getElementById('patternDescription');
    const stepCountLabel = document.getElementById('stepCountLabel');

    if (modalTitle) {
        modalTitle.textContent = isEdit ? 'Edit Pattern' : 'Create New Pattern';
    }

    // Store pattern ID in modal data attribute
    if (isEdit) {
        modal.dataset.editingId = patternId;
    } else {
        delete modal.dataset.editingId;
    }

    if (nameInput) nameInput.value = pattern?.name || '';
    if (descriptionInput) descriptionInput.value = pattern?.description || '';

    currentPatternSteps = pattern?.steps ? structuredClone(pattern.steps) : [];
    
    // Update step count label
    if (stepCountLabel) {
        stepCountLabel.textContent = currentPatternSteps.length;
    }
    
    // Reset the quick add form to defaults
    const typeSelect = document.getElementById('stepType');
    const intensitySlider = document.getElementById('stepIntensity');
    const durationInput = document.getElementById('stepDuration');
    const intensityValue = document.getElementById('stepIntensityValue');
    
    if (typeSelect) typeSelect.value = 'shock';
    if (intensitySlider) intensitySlider.value = DEFAULT_STEP_INTENSITY;
    if (durationInput) durationInput.value = DEFAULT_STEP_DURATION;
    if (intensityValue) intensityValue.textContent = String(DEFAULT_STEP_INTENSITY);
    
    // Update step form visibility
    updateStepFormVisibility();
    
    renderPatternSteps();

    openModal('patternModal');
}

function renderPatternSteps() {
    const container = document.getElementById('patternSteps');
    const stepCountLabel = document.getElementById('stepCountLabel');
    const clearAllBtn = document.getElementById('clearAllSteps');
    const patternInfo = document.getElementById('patternInfo');
    const totalDurationSpan = document.getElementById('totalDuration');
    
    if (!container) return;

    // Update step count
    if (stepCountLabel) {
        stepCountLabel.textContent = currentPatternSteps.length.toString();
    }

    // Show/hide clear all button
    if (clearAllBtn) {
        clearAllBtn.style.display = currentPatternSteps.length > 0 ? 'inline-block' : 'none';
    }

    if (currentPatternSteps.length === 0) {
        container.innerHTML = '<div class="text-muted text-center p-3">Noch keine Schritte hinzugefügt. Füge oben deinen ersten Schritt hinzu.</div>';
        if (patternInfo) patternInfo.style.display = 'none';
        renderPatternPreview();
        return;
    }

    // Calculate total duration (sum of all step durations)
    let totalDuration = 0;
    currentPatternSteps.forEach(step => {
        totalDuration += (step.duration || 0);
    });

    // Show duration info
    if (patternInfo) {
        patternInfo.style.display = 'block';
    }
    if (totalDurationSpan) {
        totalDurationSpan.textContent = formatDuration(totalDuration);
    }

    // Render steps with German labels
    const stepTypeLabels = {
        'shock': '⚡ Schock',
        'vibrate': '📳 Vibration',
        'pause': '⏸️ Pause'
    };

    const html = currentPatternSteps.map((step, index) => `
        <div class="pattern-step">
            <div class="pattern-step-number">${index + 1}</div>
            <div class="pattern-step-content">
                <span class="pattern-step-type"><strong>${stepTypeLabels[step.type] || step.type}</strong></span>
                ${step.type !== 'pause' ? `<span>Intensität: ${step.intensity}%</span>` : ''}
                <span>Dauer: ${step.duration}ms</span>
            </div>
            <div class="pattern-step-actions">
                <button data-step-index="${index}" class="btn btn-sm btn-secondary edit-pattern-step-btn" title="Bearbeiten">
                    ✏️
                </button>
                <button data-step-index="${index}" class="btn btn-sm btn-danger remove-pattern-step-btn" title="Löschen">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
    renderPatternPreview();
}

function showStepForm() {
    // No longer needed - the step form is now always visible
    // Just update the visibility based on step type
    updateStepFormVisibility();
}

function updateStepFormVisibility() {
    const typeSelect = document.getElementById('stepType');
    const intensityGroup = document.getElementById('stepIntensityGroup');
    
    if (typeSelect && intensityGroup) {
        // Hide intensity for pause steps
        if (typeSelect.value === 'pause') {
            intensityGroup.style.display = 'none';
        } else {
            intensityGroup.style.display = 'block';
        }
    }
}

function addPatternStep() {
    const typeSelect = document.getElementById('stepType');
    const intensitySlider = document.getElementById('stepIntensity');
    const durationInput = document.getElementById('stepDuration');

    const step = {
        type: typeSelect?.value || 'shock',
        intensity: parseInt(intensitySlider?.value) || DEFAULT_STEP_INTENSITY,
        duration: parseInt(durationInput?.value) || DEFAULT_STEP_DURATION
    };

    // For pause steps, intensity is not needed
    if (step.type === 'pause') {
        delete step.intensity;
    }

    addDebugLog('debug', `Adding step: ${JSON.stringify(step)}`);

    currentPatternSteps.push(step);
    renderPatternSteps();
    
    // Update step count label
    const stepCountLabel = document.getElementById('stepCountLabel');
    if (stepCountLabel) {
        stepCountLabel.textContent = currentPatternSteps.length;
    }

    // Keep the form values for easy repeated additions (common pattern)
    // Only reset intensity value display
    const intensityValue = document.getElementById('stepIntensityValue');
    if (intensityValue && intensitySlider) {
        intensityValue.textContent = intensitySlider.value;
    }
    
    // Use German labels for notification
    const stepTypeLabels = {
        'shock': '⚡ Schock',
        'vibrate': '📳 Vibration',
        'pause': '⏸️ Pause'
    };
    const stepLabel = stepTypeLabels[step.type] || step.type;
    const intensityText = step.type !== 'pause' ? ` @ ${step.intensity}%` : '';
    
    showNotification(`Schritt ${currentPatternSteps.length} hinzugefügt: ${stepLabel}${intensityText}`, 'success');
}

function removePatternStep(index) {
    currentPatternSteps.splice(index, 1);
    renderPatternSteps();
    
    // Update step count label
    const stepCountLabel = document.getElementById('stepCountLabel');
    if (stepCountLabel) {
        stepCountLabel.textContent = currentPatternSteps.length;
    }
}

function editPatternStep(index) {
    const step = currentPatternSteps[index];
    if (!step) return;
    
    // Populate the form with step values
    const typeSelect = document.getElementById('stepType');
    const intensitySlider = document.getElementById('stepIntensity');
    const intensityValue = document.getElementById('stepIntensityValue');
    const durationInput = document.getElementById('stepDuration');
    
    if (typeSelect) typeSelect.value = step.type;
    if (intensitySlider) {
        intensitySlider.value = step.intensity || 50;
        if (intensityValue) intensityValue.textContent = intensitySlider.value;
    }
    if (durationInput) durationInput.value = step.duration || 500;
    
    // Update visibility based on type
    updateStepFormVisibility();
    
    // Remove the step from the array (will be re-added when user clicks "Add Step")
    currentPatternSteps.splice(index, 1);
    renderPatternSteps();
    
    // Scroll to the form
    const quickStepForm = document.getElementById('quickStepForm');
    if (quickStepForm) {
        quickStepForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    showNotification('Schritt zum Bearbeiten geladen. Passe die Werte an und klicke "Schritt hinzufügen".', 'info');
    addDebugLog('info', `Editing step ${index + 1}: ${step.type}`);
}

function renderPatternPreview() {
    const container = document.getElementById('patternPreview');
    if (!container) return;

    if (currentPatternSteps.length === 0) {
        container.innerHTML = '<p class="text-muted text-center pattern-timeline-text">Schritte hinzufügen für Vorschau</p>';
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
        showNotification('Pattern muss mindestens einen Schritt haben', 'error');
        addDebugLog('error', 'Pattern save failed: No steps');
        return;
    }

    const nameInput = document.getElementById('patternName');
    const descriptionInput = document.getElementById('patternDescription');

    const patternName = nameInput?.value?.trim();
    if (!patternName) {
        showNotification('Bitte gib einen Pattern-Namen ein', 'error');
        addDebugLog('error', 'Pattern save failed: No name');
        return;
    }

    const pattern = {
        name: patternName,
        description: descriptionInput?.value || '',
        steps: currentPatternSteps
    };

    // Log pattern details
    addDebugLog('info', `Saving pattern "${pattern.name}" with ${pattern.steps.length} steps`);
    addDebugLog('debug', `Pattern data: ${JSON.stringify(pattern, null, 2)}`);

    try {
        const url = isEdit ? `/api/openshock/patterns/${patternId}` : '/api/openshock/patterns';
        const method = isEdit ? 'PUT' : 'POST';

        addDebugLog('info', `Sending ${method} request to ${url}`);

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pattern)
        });

        addDebugLog('info', `Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            addDebugLog('error', `Server error: ${JSON.stringify(errorData)}`);
            throw new Error(errorData.error || 'Failed to save pattern');
        }

        const responseData = await response.json();
        addDebugLog('success', `Pattern saved successfully: ${JSON.stringify(responseData)}`);

        await loadPatterns();
        renderPatternList();
        closeModal('patternModal');

        showNotification(`Pattern "${patternName}" ${isEdit ? 'aktualisiert' : 'erstellt'}`, 'success');
        addDebugLog('info', `Pattern "${patternName}" ${isEdit ? 'updated' : 'created'} successfully`);
    } catch (error) {
        console.error('[OpenShock] Error saving pattern:', error);
        addDebugLog('error', `Pattern save error: ${error.message}`);
        showNotification(`Fehler beim Speichern: ${error.message}`, 'error');
    }
}

async function deletePattern(id) {
    if (!await confirmAction('Möchtest du dieses Pattern wirklich löschen?')) {
        return;
    }

    try {
        const response = await fetch(`/api/openshock/patterns/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete pattern');

        await loadPatterns();
        renderPatternList();
        showNotification('Pattern gelöscht', 'success');
    } catch (error) {
        console.error('[OpenShock] Error deleting pattern:', error);
        showNotification('Fehler beim Löschen des Patterns', 'error');
    }
}

async function executePattern(id, deviceId) {
    if (!deviceId) {
        showNotification('Bitte wähle ein Gerät aus', 'error');
        return;
    }

    try {
        const response = await fetch('/api/openshock/patterns/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patternId: id, deviceId })
        });

        if (!response.ok) throw new Error('Failed to execute pattern');

        showNotification('Pattern wird ausgeführt', 'success');
    } catch (error) {
        console.error('[OpenShock] Error executing pattern:', error);
        showNotification('Fehler beim Ausführen des Patterns', 'error');
    }
}

// ====================================================================
// VISUAL CURVE EDITOR
// ====================================================================

class CurveEditor {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.curvePoints = [];
        this.isDrawing = false;
        this.currentAction = 'shock';
        this.resolution = 20;
        this.minIntensity = 10;
        this.maxIntensity = 80;
        this.stepDuration = 500;
        this.stepDelay = 100;
        this.gridSpacing = 50;
        this.patternName = '';
        
        this.initialize();
    }

    initialize() {
        // Canvas setup
        this.canvas = document.getElementById('curveCanvas');
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        
        // Event listeners for drawing
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseleave', this.stopDrawing.bind(this));
        
        // Touch support
        this.canvas.addEventListener('touchstart', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
        
        // Update canvas dimensions after the next render to ensure CSS is applied
        requestAnimationFrame(() => {
            this.updateCanvasDimensions();
            this.drawGrid();
        });
    }

    updateCanvasDimensions() {
        // Fix canvas dimensions to match display size
        // This ensures the coordinate system matches the actual display
        if (!this.canvas) return;
        
        const rect = this.canvas.getBoundingClientRect();
        // Only update if we have valid dimensions
        if (rect.width > 0 && rect.height > 0) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }
    }

    drawGrid() {
        if (!this.ctx) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Clear canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw grid
        this.ctx.strokeStyle = '#1f2937';
        this.ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x <= width; x += this.gridSpacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y <= height; y += this.gridSpacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
        
        // Draw axis labels
        this.ctx.fillStyle = '#6b7280';
        this.ctx.font = '12px sans-serif';
        
        // Y-axis labels (intensity)
        for (let i = 0; i <= 100; i += 25) {
            const y = height - (i / 100) * height;
            this.ctx.fillText(i + '%', 5, y);
        }
        
        // X-axis labels (time)
        const totalTime = this.resolution * this.stepDuration;
        for (let i = 0; i <= 5; i++) {
            const x = (i / 5) * width;
            const time = Math.round((i / 5) * totalTime);
            this.ctx.fillText(time + 'ms', x, height - 5);
        }
    }
    
    drawCurveOnly() {
        if (this.curvePoints.length < 2) return;
        
        // Draw the curve
        this.ctx.strokeStyle = this.getActionColor();
        this.ctx.lineWidth = 3;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.curvePoints[0].x, this.curvePoints[0].y);
        
        for (let i = 1; i < this.curvePoints.length; i++) {
            this.ctx.lineTo(this.curvePoints[i].x, this.curvePoints[i].y);
        }
        
        this.ctx.stroke();
        
        // Draw points
        this.ctx.fillStyle = this.getActionColor();
        for (const point of this.curvePoints) {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    startDrawing(e) {
        this.isDrawing = true;
        this.curvePoints = [];
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.addPoint(x, y);
    }

    draw(e) {
        if (!this.isDrawing) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.addPoint(x, y);
        this.redrawCurve();
        this.updateCursorInfo(x, y);
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.generatePreview();
        }
    }

    handleTouch(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        
        if (e.type === 'touchstart') {
            this.isDrawing = true;
            this.curvePoints = [];
        }
        
        if (this.isDrawing && touch) {
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            this.addPoint(x, y);
            this.redrawCurve();
            this.updateCursorInfo(x, y);
        }
    }

    addPoint(x, y) {
        // Constrain within canvas
        x = Math.max(0, Math.min(this.canvas.width, x));
        y = Math.max(0, Math.min(this.canvas.height, y));
        
        this.curvePoints.push({ x, y });
    }

    redrawCurve() {
        // Draw grid first, then curve on top
        this.drawGrid();
        this.drawCurveOnly();
    }

    getActionColor() {
        switch (this.currentAction) {
            case 'shock': return '#ef4444';    // Red for shock
            case 'vibrate': return '#22c55e';  // Green for vibration
            case 'sound': return '#3b82f6';    // Blue for sound
            default: return '#60a5fa';
        }
    }

    updateCursorInfo(x, y) {
        const intensity = Math.round((1 - y / this.canvas.height) * 100);
        const time = Math.round((x / this.canvas.width) * this.resolution * this.stepDuration);
        
        document.getElementById('currentIntensity').textContent = intensity;
        document.getElementById('currentTime').textContent = time;
    }

    applyTemplate(templateType) {
        this.curvePoints = [];
        const width = this.canvas.width;
        const height = this.canvas.height;
        const points = 50;
        
        for (let i = 0; i < points; i++) {
            const progress = i / (points - 1);
            const x = progress * width;
            let intensity;
            
            switch (templateType) {
                case 'linear-up':
                    intensity = progress;
                    break;
                case 'linear-down':
                    intensity = 1 - progress;
                    break;
                case 'exponential-up':
                    intensity = Math.pow(progress, 2);
                    break;
                case 'exponential-down':
                    intensity = Math.pow(1 - progress, 2);
                    break;
                case 'sine':
                    intensity = (Math.sin(progress * Math.PI * 2) + 1) / 2;
                    break;
                case 'pulse':
                    intensity = Math.floor(progress * 10) % 2 === 0 ? 0.8 : 0.2;
                    break;
                case 'sawtooth':
                    intensity = (progress * 4) % 1;
                    break;
                case 'triangle':
                    intensity = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
                    break;
                default:
                    continue;
            }
            
            const y = height - (intensity * height);
            this.curvePoints.push({ x, y });
        }
        
        this.redrawCurve();
        this.generatePreview();
    }

    generatePreview() {
        if (this.curvePoints.length < 2) {
            document.getElementById('stepCount').textContent = '0';
            return;
        }
        
        const steps = this.sampleCurve(this.resolution);
        document.getElementById('stepCount').textContent = steps.length;
        
        // Update timeline preview
        this.renderTimeline(steps);
        
        // Update stats
        this.updateStats(steps);
    }

    sampleCurve(numSamples) {
        if (this.curvePoints.length < 2) return [];
        
        const steps = [];
        const width = this.canvas.width;
        
        for (let i = 0; i < numSamples; i++) {
            const targetX = (i / numSamples) * width;
            const intensity = this.getIntensityAtX(targetX);
            
            steps.push({
                type: this.currentAction,
                intensity: Math.round(intensity),
                duration: this.stepDuration,
                delay: this.stepDelay
            });
        }
        
        return steps;
    }

    getIntensityAtX(targetX) {
        // Find the closest points
        let closestPoint = null;
        let minDist = Infinity;
        
        for (const point of this.curvePoints) {
            const dist = Math.abs(point.x - targetX);
            if (dist < minDist) {
                minDist = dist;
                closestPoint = point;
            }
        }
        
        if (!closestPoint) return 50;
        
        // Convert Y to intensity
        const rawIntensity = (1 - closestPoint.y / this.canvas.height) * 100;
        
        // Apply min/max constraints
        const intensity = this.minIntensity + (rawIntensity / 100) * (this.maxIntensity - this.minIntensity);
        
        return Math.max(1, Math.min(100, Math.round(intensity)));
    }

    calculateTotalDuration(steps) {
        return steps.reduce((sum, s) => sum + s.duration + (s.delay || 0), 0);
    }

    renderTimeline(steps) {
        const container = document.getElementById('curveTimelinePreview');
        if (!container) return;
        
        if (steps.length === 0) {
            container.innerHTML = '<div class="timeline-empty">Draw on the canvas above to create your pattern</div>';
            return;
        }
        
        const totalDuration = this.calculateTotalDuration(steps);
        let currentTime = 0;
        
        const bars = steps.map(step => {
            const startPercent = (currentTime / totalDuration) * 100;
            const widthPercent = (step.duration / totalDuration) * 100;
            currentTime += step.duration + (step.delay || 0);
            
            // Sanitize step.type for CSS class
            const sanitizedType = (step.type || '').replace(/[^a-zA-Z0-9-]/g, '');
            
            return `
                <div class="timeline-bar timeline-${sanitizedType}"
                     style="left: ${startPercent}%; width: ${widthPercent}%;"
                     title="${escapeHtml(step.type)} - ${step.intensity}% - ${step.duration}ms">
                </div>
            `;
        }).join('');
        
        container.innerHTML = `
            <div class="timeline">
                ${bars}
            </div>
            <div class="timeline-labels">
                <span>0ms</span>
                <span>${formatDuration(totalDuration)}</span>
            </div>
        `;
    }

    getActionIcon(type) {
        switch (type) {
            case 'shock': return '⚡';
            case 'vibrate': return '📳';
            case 'sound': return '🔔';
            case 'pause': return '⏸️';
            default: return '●';
        }
    }

    updateStats(steps) {
        const stepCountEl = document.getElementById('stepCount');
        const totalDurationEl = document.getElementById('totalDuration');
        const avgIntensityEl = document.getElementById('avgIntensity');
        const peakIntensityEl = document.getElementById('peakIntensity');
        
        if (!steps || steps.length === 0) {
            if (stepCountEl) stepCountEl.textContent = '0';
            if (totalDurationEl) totalDurationEl.textContent = '0ms';
            if (avgIntensityEl) avgIntensityEl.textContent = '0%';
            if (peakIntensityEl) peakIntensityEl.textContent = '0%';
            return;
        }
        
        const totalDuration = this.calculateTotalDuration(steps);
        const avgIntensity = Math.round(steps.reduce((sum, s) => sum + s.intensity, 0) / steps.length);
        const peakIntensity = Math.max(...steps.map(s => s.intensity));
        
        if (stepCountEl) stepCountEl.textContent = steps.length;
        if (totalDurationEl) totalDurationEl.textContent = formatDuration(totalDuration);
        if (avgIntensityEl) avgIntensityEl.textContent = avgIntensity + '%';
        if (peakIntensityEl) peakIntensityEl.textContent = peakIntensity + '%';
    }

    clear() {
        this.curvePoints = [];
        // Reset canvas dimensions to match display size
        this.updateCanvasDimensions();
        this.drawGrid();
        document.getElementById('curveTimelinePreview').innerHTML = '<div class="timeline-empty">Draw on the canvas above to create your pattern</div>';
        document.getElementById('stepCount').textContent = '0';
        document.getElementById('totalDuration').textContent = '0';
        document.getElementById('avgIntensity').textContent = '0';
        document.getElementById('peakIntensity').textContent = '0';
    }

    getPattern() {
        const steps = this.sampleCurve(this.resolution);
        return {
            name: this.patternName || 'Custom Curve Pattern',
            description: `Generated from visual curve editor (${this.currentAction})`,
            steps: steps
        };
    }
}

// Global curve editor instance
let curveEditor = null;

function openCurveEditor() {
    const modal = document.getElementById('curveEditorModal');
    if (!modal) return;
    
    // Show modal first
    modal.style.display = 'flex';
    
    // Load current settings
    const patternNameEl = document.getElementById('curvePatternName');
    const minIntensityEl = document.getElementById('minIntensity');
    const maxIntensityEl = document.getElementById('maxIntensity');
    const stepDurationEl = document.getElementById('stepDurationSlider');
    const stepDelayEl = document.getElementById('stepDelaySlider');
    const resolutionEl = document.getElementById('resolutionSlider');
    
    if (patternNameEl) patternNameEl.value = '';
    if (minIntensityEl) minIntensityEl.value = 10;
    if (maxIntensityEl) maxIntensityEl.value = 80;
    if (stepDurationEl) stepDurationEl.value = 500;
    if (stepDelayEl) stepDelayEl.value = 100;
    if (resolutionEl) resolutionEl.value = 20;
    
    // Use setTimeout to ensure the modal is fully rendered before initializing canvas
    setTimeout(() => {
        // Initialize curve editor if not already
        if (!curveEditor) {
            curveEditor = new CurveEditor();
        } else {
            // Re-initialize canvas dimensions since modal was hidden
            curveEditor.updateCanvasDimensions();
            curveEditor.clear();
        }
        
        updateCurveEditorUI();
    }, MODAL_RENDER_DELAY_MS);
}

function closeCurveEditor() {
    const modal = document.getElementById('curveEditorModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function updateCurveEditorUI() {
    // Update slider values with null checks
    const minIntensityEl = document.getElementById('minIntensity');
    const maxIntensityEl = document.getElementById('maxIntensity');
    const stepDurationEl = document.getElementById('stepDurationSlider');
    const stepDelayEl = document.getElementById('stepDelaySlider');
    const resolutionEl = document.getElementById('resolutionSlider');
    
    const minIntensityValueEl = document.getElementById('minIntensityValue');
    const maxIntensityValueEl = document.getElementById('maxIntensityValue');
    const stepDurationValueEl = document.getElementById('stepDurationValue');
    const stepDelayValueEl = document.getElementById('stepDelayValue');
    const resolutionValueEl = document.getElementById('resolutionValue');
    
    if (minIntensityEl && minIntensityValueEl) {
        minIntensityValueEl.textContent = minIntensityEl.value + '%';
    }
    if (maxIntensityEl && maxIntensityValueEl) {
        maxIntensityValueEl.textContent = maxIntensityEl.value + '%';
    }
    if (stepDurationEl && stepDurationValueEl) {
        stepDurationValueEl.textContent = stepDurationEl.value + 'ms';
    }
    if (stepDelayEl && stepDelayValueEl) {
        stepDelayValueEl.textContent = stepDelayEl.value + 'ms';
    }
    if (resolutionEl && resolutionValueEl) {
        resolutionValueEl.textContent = resolutionEl.value;
    }
    
    if (curveEditor) {
        if (minIntensityEl) curveEditor.minIntensity = parseInt(minIntensityEl.value);
        if (maxIntensityEl) curveEditor.maxIntensity = parseInt(maxIntensityEl.value);
        if (stepDurationEl) curveEditor.stepDuration = parseInt(stepDurationEl.value);
        if (stepDelayEl) curveEditor.stepDelay = parseInt(stepDelayEl.value);
        if (resolutionEl) curveEditor.resolution = parseInt(resolutionEl.value);
        curveEditor.generatePreview();
    }
}

function saveCurvePattern() {
    if (!curveEditor || curveEditor.curvePoints.length < 2) {
        showNotification('Please draw a curve first', 'error');
        return;
    }
    
    const patternName = document.getElementById('curvePatternName').value.trim();
    if (!patternName) {
        showNotification('Please enter a pattern name', 'error');
        return;
    }
    
    curveEditor.patternName = patternName;
    const pattern = curveEditor.getPattern();
    
    // Add to pattern modal
    currentPatternSteps = pattern.steps;
    currentPatternName = pattern.name;
    currentPatternDescription = pattern.description;
    
    // Close curve editor and open pattern modal to save
    closeCurveEditor();
    openPatternModal('add');
    
    // Populate the pattern modal
    document.getElementById('patternName').value = pattern.name;
    document.getElementById('patternDescription').value = pattern.description;
    renderPatternSteps();
    
    showNotification('Pattern loaded into editor. Click Save to store it.', 'success');
}

function previewCurvePattern() {
    if (!curveEditor || curveEditor.curvePoints.length < 2) {
        showNotification('Please draw a curve first', 'error');
        return;
    }
    
    const pattern = curveEditor.getPattern();
    
    // Show preview notification
    showNotification(`Preview: ${pattern.steps.length} steps, ${pattern.steps.reduce((s, step) => s + step.duration + step.delay, 0)}ms total`, 'info');
}

function applyCurveTemplate() {
    const template = document.getElementById('curveTemplate').value;
    if (template === 'custom') {
        showNotification('Select a template type first', 'info');
        return;
    }
    
    if (curveEditor) {
        curveEditor.applyTemplate(template);
    }
}

function generateFromCurve() {
    // Redirect to the new visual curve editor
    openCurveEditor();
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

async function saveLikeThreshold() {
    const minLikesInput = document.getElementById('likeThresholdMin');
    const timeWindowInput = document.getElementById('likeThresholdWindow');

    if (!minLikesInput || !timeWindowInput) {
        showNotification('Error: Form elements not found', 'error');
        return;
    }

    const minLikes = parseInt(minLikesInput.value);
    const timeWindowSeconds = parseFloat(timeWindowInput.value);

    if (isNaN(minLikes) || minLikes < 1) {
        showNotification('Minimum likes must be at least 1', 'error');
        return;
    }

    if (isNaN(timeWindowSeconds) || timeWindowSeconds < 0.5) {
        showNotification('Time window must be at least 0.5 seconds', 'error');
        return;
    }

    try {
        const response = await fetch('/api/openshock/config/like-threshold', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                minLikes: minLikes,
                timeWindow: timeWindowSeconds * 1000 // Convert to milliseconds
            })
        });

        if (!response.ok) {
            let errorMessage = 'Failed to save like threshold settings';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // Response was not JSON
            }
            throw new Error(errorMessage);
        }

        await loadConfig();
        showNotification(`✅ Like threshold saved: ${minLikes} likes in ${timeWindowSeconds}s`, 'success');
        addDebugLog('success', `Like threshold updated: ${minLikes} likes/${timeWindowSeconds}s`);
    } catch (error) {
        console.error('[OpenShock] Error saving like threshold:', error);
        showNotification('Error saving like threshold settings', 'error');
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
    return steps.reduce((total, step) => total + (step.duration || 0), 0);
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

    // Debug log buttons
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

    const toggleDebugVerboseBtn = document.getElementById('toggleDebugVerbose');
    if (toggleDebugVerboseBtn) {
        toggleDebugVerboseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleDebugVerbose();
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

    // Header emergency stop button
    const headerEmergencyStopBtn = document.getElementById('headerEmergencyStop');
    if (headerEmergencyStopBtn) {
        headerEmergencyStopBtn.addEventListener('click', (e) => {
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

    // Clear all steps button
    const clearAllStepsBtn = document.getElementById('clearAllSteps');
    if (clearAllStepsBtn) {
        clearAllStepsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Alle Schritte löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
                currentPatternSteps = [];
                renderPatternSteps();
                showNotification('Alle Schritte gelöscht', 'info');
            }
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

    const saveLikeThresholdBtn = document.getElementById('saveLikeThreshold');
    if (saveLikeThresholdBtn) {
        saveLikeThresholdBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveLikeThreshold();
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

    // ====================================================================
    // CURVE EDITOR EVENT LISTENERS
    // ====================================================================

    const openCurveEditorBtn = document.getElementById('openCurveEditor');
    if (openCurveEditorBtn) {
        openCurveEditorBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openCurveEditor();
        });
    }

    const closeCurveEditorBtn = document.getElementById('closeCurveEditor');
    if (closeCurveEditorBtn) {
        closeCurveEditorBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeCurveEditor();
        });
    }

    const cancelCurveEditorBtn = document.getElementById('cancelCurveEditor');
    if (cancelCurveEditorBtn) {
        cancelCurveEditorBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeCurveEditor();
        });
    }

    const saveCurvePatternBtn = document.getElementById('saveCurvePattern');
    if (saveCurvePatternBtn) {
        saveCurvePatternBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveCurvePattern();
        });
    }

    const previewCurvePatternBtn = document.getElementById('previewCurvePattern');
    if (previewCurvePatternBtn) {
        previewCurvePatternBtn.addEventListener('click', (e) => {
            e.preventDefault();
            previewCurvePattern();
        });
    }

    const applyTemplateBtn = document.getElementById('applyTemplate');
    if (applyTemplateBtn) {
        applyTemplateBtn.addEventListener('click', (e) => {
            e.preventDefault();
            applyCurveTemplate();
        });
    }

    const clearCanvasBtn = document.getElementById('clearCanvas');
    if (clearCanvasBtn) {
        clearCanvasBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (curveEditor) curveEditor.clear();
        });
    }

    const undoStepBtn = document.getElementById('undoStep');
    if (undoStepBtn) {
        undoStepBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (curveEditor && curveEditor.curvePoints.length > 0) {
                // Remove last 10% of points
                const removeCount = Math.max(1, Math.floor(curveEditor.curvePoints.length * 0.1));
                curveEditor.curvePoints.splice(-removeCount);
                curveEditor.redrawCurve();
                curveEditor.generatePreview();
            }
        });
    }

    // Action type buttons
    document.querySelectorAll('.btn-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.btn-action').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (curveEditor) {
                curveEditor.currentAction = btn.dataset.action;
                // Redraw the curve with the new action type color
                curveEditor.redrawCurve();
                curveEditor.generatePreview();
            }
        });
    });

    // Slider event listeners for curve editor
    const minIntensitySlider = document.getElementById('minIntensity');
    if (minIntensitySlider) {
        minIntensitySlider.addEventListener('input', updateCurveEditorUI);
    }

    const maxIntensitySlider = document.getElementById('maxIntensity');
    if (maxIntensitySlider) {
        maxIntensitySlider.addEventListener('input', updateCurveEditorUI);
    }

    const stepDurationSlider = document.getElementById('stepDurationSlider');
    if (stepDurationSlider) {
        stepDurationSlider.addEventListener('input', updateCurveEditorUI);
    }

    const stepDelaySlider = document.getElementById('stepDelaySlider');
    if (stepDelaySlider) {
        stepDelaySlider.addEventListener('input', updateCurveEditorUI);
    }

    const resolutionSlider = document.getElementById('resolutionSlider');
    if (resolutionSlider) {
        resolutionSlider.addEventListener('input', updateCurveEditorUI);
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
            closeModal('patternModal');
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
            closeModal('patternModal');
        });
    }

    const addPatternStepBtn = document.getElementById('addPatternStep');
    if (addPatternStepBtn) {
        addPatternStepBtn.addEventListener('click', (e) => {
            e.preventDefault();
            addPatternStep();
        });
    }

    // The saveStep and cancelStep buttons are no longer needed since the pattern form is always visible
    // and adding a step is done directly via the addPatternStep button

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

    // Step type change handler to show/hide intensity field
    const stepTypeSelect = document.getElementById('stepType');
    if (stepTypeSelect) {
        stepTypeSelect.addEventListener('change', () => {
            updateStepFormVisibility();
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

        // Edit pattern step button
        if (e.target.closest('.edit-pattern-step-btn')) {
            e.preventDefault();
            const button = e.target.closest('.edit-pattern-step-btn');
            const stepIndex = parseInt(button.dataset.stepIndex);
            editPatternStep(stepIndex);
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
    showStepForm,
    addPatternStep,
    removePatternStep,
    generateFromCurve,
    saveApiSettings,
    testConnection,
    refreshDevices,
    updateTestShockDeviceList,
    updateMappingDeviceList,
    executeTestShock,
    clearQueue,
    testDevice,
    saveSafetyConfig,
    triggerEmergencyStop,
    clearEmergencyStop,
    switchTab,
    // Curve Editor functions
    openCurveEditor,
    closeCurveEditor,
    saveCurvePattern,
    previewCurvePattern,
    applyCurveTemplate
};

console.log('[OpenShock] Plugin UI loaded and ready');
