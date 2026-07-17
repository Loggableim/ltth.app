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
let shareCodes = [];

// Pattern step defaults
const DEFAULT_STEP_INTENSITY = 50;
const DEFAULT_STEP_DURATION = 500;
const MODAL_RENDER_DELAY_MS = 50;
const MAX_DEBUG_LOGS = 200;

const RUNTIME_I18N_PREFIX = 'plugins.openshock.runtime.';
const TOAST_SUCCESS = 'success';
const TOAST_ERROR = 'error';

function interpolateRuntimeFallback(fallback, params = {}) {
    return String(fallback).replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
    ));
}

function runtimeText(key, fallback, params = {}) {
    const translationKey = `${RUNTIME_I18N_PREFIX}${key}`;
    const translated = window.i18n && typeof window.i18n.t === 'function'
        ? window.i18n.t(translationKey, params)
        : translationKey;
    return translated && translated !== translationKey
        ? translated
        : interpolateRuntimeFallback(fallback, params);
}

function setRuntimeAttribute(element, attribute, key, fallback, params = {}) {
    if (element) element.setAttribute(attribute, runtimeText(key, fallback, params));
}

function refreshApiKeyPlaceholders() {
    const apiKeyInput = document.getElementById('apiKey');
    const pishockApiKeyInput = document.getElementById('pishockApiKey');

    if (apiKeyInput) {
        apiKeyInput.placeholder = apiKeyInput.value === '***SAVED***'
            ? runtimeText('placeholders.api_key_configured', 'API key saved (hidden)')
            : runtimeText('placeholders.api_key', 'Enter your OpenShock API key');
    }

    if (pishockApiKeyInput) {
        pishockApiKeyInput.placeholder = pishockApiKeyInput.value === '***SAVED***'
            ? runtimeText('placeholders.api_key_configured', 'API key saved (hidden)')
            : runtimeText('placeholders.pishock_api_key', 'Enter your PiShock API key');
    }
}

function rerenderRuntimeCopy() {
    renderDebugLog();
    renderCommandLog(debugLogs.slice(0, 10));
    renderMappingList();
    renderPatternList();
    renderGiftCatalog();
    renderQueueStatus();
    renderShareCodeList(shareCodes);
    updateApiStatus(devices.length > 0, devices.length);
    updateEmergencyStopButtons(Boolean(config?.emergencyStop?.enabled));
    rerenderZappieHellRuntimeCopy();
    queueMicrotask(refreshApiKeyPlaceholders);
}

function registerRuntimeI18n() {
    if (!window.i18n) return;
    if (typeof window.i18n.onChange === 'function') window.i18n.onChange(rerenderRuntimeCopy);
    if (typeof window.i18n.onLanguageChange === 'function') window.i18n.onLanguageChange(rerenderRuntimeCopy);
}

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
    const containers = document.querySelectorAll('#debugLog, #advancedDebugLog');
    if (!containers.length) return;
    
    if (debugLogs.length === 0) {
        containers.forEach(container => {
            container.innerHTML = `<p class="text-muted text-center">${escapeHtml(runtimeText('status.debug_log_empty', 'Debug log is empty. Pattern operations will be logged here.'))}</p>`;
        });
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
    
    containers.forEach(container => {
        container.innerHTML = html;
        // Auto-scroll to top because newest entries are rendered first.
        container.scrollTop = 0;
    });
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
        btn.textContent = debugVerbose
            ? `📊 ${runtimeText('status.normal', 'Normal')}`
            : `📊 ${runtimeText('status.verbose', 'Verbose')}`;
        btn.classList.toggle('btn-primary', debugVerbose);
    }
    addDebugLog('info', `Verbose mode ${debugVerbose ? 'enabled' : 'disabled'}`);
}

// ====================================================================
// INITIALIZATION
// ====================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Hybrid Shock] Initializing plugin UI...');

    initializeSocket();
    initializeTabs();
    initializeModals();
    initializeEventDelegation();
    registerRuntimeI18n();
    if (window.i18n?.ready) window.i18n.ready.then(rerenderRuntimeCopy);

    await loadInitialData();
    startPeriodicUpdates();

    console.log('[Hybrid Shock] UI initialization complete');
});

// ====================================================================
// SOCKET.IO INITIALIZATION AND HANDLERS
// ====================================================================

function initializeSocket() {
    if (!window.io) {
        console.warn('[Hybrid Shock] Socket.IO not available');
        return;
    }

    socket = window.io({
        path: '/socket.io',
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('[Hybrid Shock] Socket.IO connected');
        updateConnectionStatus('connected');
    });

    socket.on('disconnect', () => {
        console.log('[Hybrid Shock] Socket.IO disconnected');
        updateConnectionStatus('disconnected');
    });

    socket.on('error', (error) => {
        console.error('[Hybrid Shock] Socket.IO error:', error);
        updateConnectionStatus('error');
    });

    // Hybrid Shock-specific events
    socket.on('openshock:device-update', (data) => {
        console.log('[Hybrid Shock] Device update:', data);
        handleDeviceUpdate(data);
    });

    socket.on('openshock:command-sent', (data) => {
        console.log('[Hybrid Shock] Command sent:', data);
        handleCommandSent(data);
    });

    socket.on('openshock:queue-update', (data) => {
        console.log('[Hybrid Shock] Queue update:', data);
        handleQueueUpdate(data);
    });

    socket.on('openshock:emergency-stop', (data) => {
        console.log('[Hybrid Shock] Emergency stop triggered:', data);
        handleEmergencyStop(data);
    });

    socket.on('openshock:stats-update', (data) => {
        console.log('[Hybrid Shock] Stats update:', data);
        handleStatsUpdate(data);
    });
}

function handleDeviceUpdate(data) {
    if (data && Array.isArray(data.devices)) {
        devices = data.devices;
        renderDeviceList();
        updateApiStatus(devices.length > 0, devices.length);
        return;
    }

    const deviceId = data?.deviceId || data?.id;
    if (!deviceId) {
        return;
    }

    const deviceIndex = devices.findIndex(d => d.id === deviceId);
    if (deviceIndex >= 0) {
        devices[deviceIndex] = { ...devices[deviceIndex], ...data, id: deviceId };
    } else {
        devices = [...devices, { ...data, id: deviceId }];
    }

    renderDeviceList();
    updateApiStatus(devices.length > 0, devices.length);
}

function normalizeCommandPayload(data = {}) {
    const command = data.command || {};
    const type = command.type || data.type || 'shock';
    const intensity = command.intensity ?? data.intensity ?? 0;
    const duration = command.duration ?? data.duration ?? 1000;
    const deviceId = data.deviceId || command.deviceId || '';
    const deviceName = data.deviceName || data.device || command.deviceName || deviceId || 'Unknown Device';
    const username = data.username || data.user || command.username || 'Anonymous';
    const userId = data.userId || command.userId || '';
    const source = data.source || 'manual';

    return {
        ...data,
        command: {
            type,
            intensity,
            duration,
            pattern: command.pattern ?? data.pattern ?? null
        },
        type,
        intensity,
        duration,
        deviceId,
        deviceName,
        device: deviceName,
        username,
        userId,
        user: username,
        source,
        timestamp: data.timestamp || new Date().toISOString()
    };
}

function handleCommandSent(data) {
    const normalized = normalizeCommandPayload(data);

    debugLogs.unshift({
        eventType: 'command',
        ...normalized
    });

    if (debugLogs.length > 100) {
        debugLogs = debugLogs.slice(0, 100);
    }

    if (currentTab === 'dashboard') {
        renderCommandLog(debugLogs.slice(0, 10));
    }
}

function handleQueueUpdate(data) {
    queueStatus = normalizeQueueStatus(data);
    renderQueueStatus();
}

function handleEmergencyStop(data) {
    showNotification(runtimeText('safety.emergency_stop_activated', 'EMERGENCY STOP ACTIVATED!'), 'error');
    document.body.classList.add('emergency-active');
    setTimeout(() => {
        document.body.classList.remove('emergency-active');
    }, 5000);
}

function handleStatsUpdate(data) {
    stats = normalizeStatsSnapshot(data);
    renderStats();
}

function normalizeQueueStatus(data = {}) {
    const queueLength = data.queueLength ?? data.queueSize ?? data.pending ?? 0;
    const processing = data.processing ?? (data.isProcessing ? 1 : 0);

    return {
        ...data,
        queueLength,
        queueSize: data.queueSize ?? queueLength,
        pending: data.pending ?? queueLength,
        processing
    };
}

function normalizeStatsSnapshot(data = {}) {
    const successfulCommands = Number(data.successfulCommands || 0);
    const failedCommands = Number(data.failedCommands || 0);
    const totalCommands = Math.max(Number(data.totalCommands || 0), successfulCommands + failedCommands);
    const successRate = typeof data.successRate === 'number'
        ? data.successRate
        : (totalCommands > 0 ? Math.round((successfulCommands / totalCommands) * 100) : 0);
    const uptime = data.uptime ?? data.sessionDuration ?? 0;
    const queueLength = data.queueLength ?? data.queueSize ?? data.queuePending ?? data.pending ?? 0;

    return {
        ...data,
        successfulCommands,
        failedCommands,
        totalCommands,
        successRate,
        uptime,
        sessionDuration: data.sessionDuration ?? uptime,
        queueLength,
        queueSize: data.queueSize ?? queueLength,
        pending: data.pending ?? queueLength
    };
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

            showNotification(runtimeText('status.loaded', 'Hybrid Shock plugin loaded successfully'), 'success');
    } catch (error) {
        console.error('[Hybrid Shock] Error loading initial data:', error);
            showNotification(runtimeText('errors.load_data', 'Error loading Hybrid Shock data'), 'error');
        
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
        console.log('[Hybrid Shock] Config loaded:', config);

        // ---- Provider selector ----
        const apiProviderEl = document.getElementById('apiProvider');
        if (apiProviderEl) {
            apiProviderEl.value = config.apiProvider || 'openshock';
            switchProviderUI(config.apiProvider || 'openshock');
        }

        // ---- OpenShock Fields ----
        const apiKeyInput = document.getElementById('apiKey');
        if (apiKeyInput) {
            if (config.apiKey) {
                apiKeyInput.value = '***SAVED***';
            } else {
                apiKeyInput.value = '';
            }
        }

        const baseUrlInput = document.getElementById('baseUrl');
        if (baseUrlInput && config.baseUrl) {
            baseUrlInput.value = config.baseUrl;
        }

        // ---- PiShock Fields ----
        const pishockCfg = config.pishock || {};

        const pishockUsernameEl = document.getElementById('pishockUsername');
        if (pishockUsernameEl) {
            pishockUsernameEl.value = pishockCfg.username || '';
        }

        const pishockApiKeyEl = document.getElementById('pishockApiKey');
        if (pishockApiKeyEl) {
            if (pishockCfg.apiKey) {
                pishockApiKeyEl.value = '***SAVED***';
            } else {
                pishockApiKeyEl.value = '';
            }
        }

        refreshApiKeyPlaceholders();

        // Render ShareCode list
            shareCodes = pishockCfg.shareCodes || [];
            renderShareCodeList(shareCodes);

        // ---- Safety Settings ----
        if (config.globalLimits) {
            const maxIntEl = document.getElementById('globalMaxIntensity');
            const maxIntValEl = document.getElementById('globalMaxIntensityValue');
            const maxDurEl = document.getElementById('globalMaxDuration');
            const maxDurValEl = document.getElementById('globalMaxDurationValue');
            const maxCmdEl = document.getElementById('globalMaxCommandsPerMin');
            
            if (maxIntEl) maxIntEl.value = config.globalLimits.maxIntensity || 80;
            if (maxIntValEl) maxIntValEl.textContent = config.globalLimits.maxIntensity || 80;
            if (maxDurEl) maxDurEl.value = config.globalLimits.maxDuration || 5000;
            if (maxDurValEl) maxDurValEl.textContent = config.globalLimits.maxDuration || 5000;
            if (maxCmdEl) maxCmdEl.value = config.globalLimits.maxCommandsPerMinute || 30;
        }
        
        if (config.defaultCooldowns) {
            const globalCooldownEl = document.getElementById('globalCooldown');
            if (globalCooldownEl) globalCooldownEl.value = config.defaultCooldowns.global || 500;
        }
        
        if (config.userLimits) {
            const minFollowerAgeEl = document.getElementById('minFollowerAge');
            const maxCommandsEl = document.getElementById('maxCommandsPerUser');
            const minPermLevelEl = document.getElementById('minPermissionLevel');
            const reqSuperfanEl = document.getElementById('requireSuperfan');
            const whitelistEl = document.getElementById('whitelist');
            const blacklistEl = document.getElementById('blacklist');
            
            if (minFollowerAgeEl) minFollowerAgeEl.value = config.userLimits.minFollowerAge || 0;
            if (maxCommandsEl) maxCommandsEl.value = config.userLimits.maxCommandsPerUser || 10;
            if (minPermLevelEl) minPermLevelEl.value = config.userLimits.minPermissionLevel || 'all';
            if (reqSuperfanEl) reqSuperfanEl.checked = config.userLimits.requireSuperfan || false;
            if (whitelistEl) whitelistEl.value = (config.userLimits.whitelist || []).join(', ');
            if (blacklistEl) blacklistEl.value = (config.userLimits.blacklist || []).join(', ');
        }
        
        // Update emergency stop button state
        updateEmergencyStopButtons(config?.emergencyStop?.enabled || false);

        return config;
    } catch (error) {
        console.error('[Hybrid Shock] Error loading config:', error);
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
        console.log('[Hybrid Shock] Devices loaded:', devices);
        return devices;
    } catch (error) {
        console.error('[Hybrid Shock] Error loading devices:', error);
        throw error;
    }
}

async function loadMappings() {
    try {
        const response = await fetch('/api/openshock/mappings');
        if (!response.ok) throw new Error('Failed to load mappings');
        const data = await response.json();
        mappings = data.mappings || [];
        console.log('[Hybrid Shock] Mappings loaded:', mappings);
        return mappings;
    } catch (error) {
        console.error('[Hybrid Shock] Error loading mappings:', error);
        throw error;
    }
}

async function loadPatterns() {
    try {
        const response = await fetch('/api/openshock/patterns');
        if (!response.ok) throw new Error('Failed to load patterns');
        const data = await response.json();
        patterns = data.patterns || [];
        console.log('[Hybrid Shock] Patterns loaded:', patterns);
        return patterns;
    } catch (error) {
        console.error('[Hybrid Shock] Error loading patterns:', error);
        throw error;
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/openshock/stats');
        if (!response.ok) throw new Error('Failed to load stats');
        const data = await response.json();
        stats = normalizeStatsSnapshot(data.stats || {});
        console.log('[Hybrid Shock] Stats loaded:', stats);
        return stats;
    } catch (error) {
        console.error('[Hybrid Shock] Error loading stats:', error);
        throw error;
    }
}

async function loadQueueStatus() {
    try {
        const response = await fetch('/api/openshock/queue/status');
        if (!response.ok) throw new Error('Failed to load queue status');
        const data = await response.json();
        queueStatus = normalizeQueueStatus(data.status || {});
        console.log('[Hybrid Shock] Queue status loaded:', queueStatus);
        return queueStatus;
    } catch (error) {
        console.error('[Hybrid Shock] Error loading queue status:', error);
        throw error;
    }
}

async function loadGiftCatalog() {
    try {
        const response = await fetch('/api/openshock/gift-catalog');
        if (!response.ok) throw new Error('Failed to load gift catalog');
        const data = await response.json();
        giftCatalog = data.gifts || [];
        console.log('[Hybrid Shock] Gift catalog loaded:', giftCatalog.length, 'gifts');
        return giftCatalog;
    } catch (error) {
        console.error('[Hybrid Shock] Error loading gift catalog:', error);
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
            <p class="text-muted text-center">${escapeHtml(runtimeText('devices.no_devices', 'No devices found. Configure API key first.'))}</p>
        `;
        
        // Also update test shock dropdown and mapping device dropdown
        updateTestShockDeviceList();
        updateMappingDeviceList();
        return;
    }

    const html = `
        <div class="table-scroll">
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
                                            title="${escapeHtml(runtimeText('accessibility.test_vibrate', 'Test vibrate'))}"
                                            aria-label="${escapeHtml(runtimeText('accessibility.test_vibrate', 'Test vibrate'))}"
                                            ${device.isPaused ? 'disabled' : ''}>
                                        🔊
                                    </button>
                                    <button data-device-id="${escapeHtml(device.id)}" data-test-type="shock"
                                            class="btn btn-sm btn-warning test-device-btn"
                                            title="${escapeHtml(runtimeText('accessibility.test_shock', 'Test shock'))}"
                                            aria-label="${escapeHtml(runtimeText('accessibility.test_shock', 'Test shock'))}"
                                            ${device.isPaused ? 'disabled' : ''}>
                                        ⚡
                                    </button>
                                    <button data-device-id="${escapeHtml(device.id)}" data-test-type="sound"
                                            class="btn btn-sm btn-info test-device-btn"
                                            title="${escapeHtml(runtimeText('accessibility.test_sound', 'Test sound'))}"
                                            aria-label="${escapeHtml(runtimeText('accessibility.test_sound', 'Test sound'))}"
                                            ${device.isPaused ? 'disabled' : ''}>
                                        🔔
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
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
        container.innerHTML = `<p class="text-muted text-center">${escapeHtml(runtimeText('queue.no_commands', 'No commands executed yet.'))}</p>`;
        return;
    }

    const html = commands.map(cmd => `
        <div class="log-entry ${cmd.success !== false ? 'success' : 'error'}">
            <span class="log-timestamp">${formatTimestamp(cmd.timestamp)}</span>
            <div class="log-message">
                <strong>${escapeHtml(cmd.type || cmd.command?.type || 'unknown')}</strong>
                ${escapeHtml(cmd.deviceName || cmd.device || cmd.deviceId || cmd.command?.deviceName || cmd.command?.deviceId || '')}
                ${cmd.intensity !== undefined || cmd.command?.intensity !== undefined ? `- ${cmd.intensity ?? cmd.command?.intensity}%` : ''}
                ${cmd.duration !== undefined || cmd.command?.duration !== undefined ? `- ${cmd.duration ?? cmd.command?.duration}ms` : ''}
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
            <p class="text-muted text-center">${escapeHtml(runtimeText('mapping.empty', 'No mappings configured. Click "Add Mapping" to create one.'))}</p>
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
        customContainer.innerHTML = `<p class="text-muted text-center">${escapeHtml(runtimeText('pattern.empty', 'Noch keine Patterns erstellt. Klicke auf "Neues Pattern" um eines zu erstellen.'))}</p>`;
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
            <p class="text-muted text-center">${escapeHtml(runtimeText('mapping.gift_catalog_empty', 'No gifts found in catalog. The catalog will be populated when you connect to TikTok Live.'))}</p>
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
    select.innerHTML = `<option value="">${escapeHtml(runtimeText('mapping.all_gifts', 'All Gifts'))}</option>`;
    
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
    const queueLength = queueStatus.queueLength ?? queueStatus.queueSize ?? queueStatus.pending ?? 0;
    
    if (queueLengthEl) {
        queueLengthEl.textContent = queueLength;
    }
    if (queueProcessingEl) {
        queueProcessingEl.textContent = queueStatus.processing
            ? runtimeText('queue.processing_yes', 'Yes')
            : runtimeText('queue.processing_no', 'No');
    }
}

function renderStats() {
    // Update stat values directly in the dashboard
    const totalCommandsEl = document.getElementById('totalCommands');
    const successRateEl = document.getElementById('successRate');
    const uptimeEl = document.getElementById('uptime');
    const totalCommands = Number(stats.totalCommands || 0);
    const successfulCommands = Number(stats.successfulCommands || 0);
    const successRate = Number.isFinite(Number(stats.successRate))
        ? Number(stats.successRate)
        : (totalCommands > 0 ? Math.round((successfulCommands / totalCommands) * 100) : 0);
    const uptime = Number.isFinite(Number(stats.uptime))
        ? Number(stats.uptime)
        : (stats.startTime ? Date.now() - stats.startTime : 0);
    
    if (totalCommandsEl) {
        totalCommandsEl.textContent = totalCommands;
    }
    if (successRateEl) {
        successRateEl.textContent = successRate + '%';
    }
    if (uptimeEl && uptime >= 0) {
        uptimeEl.textContent = formatDuration(uptime);
    }
}

function updateConnectionStatus(status) {
    const badge = document.getElementById('connection-status');
    if (!badge) return;

    badge.className = 'openshock-connection-badge';

    if (status === 'connected') {
        badge.classList.add('openshock-connection-connected');
        badge.innerHTML = `<i class="fas fa-check-circle"></i> ${escapeHtml(runtimeText('connection.connected', 'Connected'))}`;
    } else if (status === 'disconnected') {
        badge.classList.add('openshock-connection-disconnected');
        badge.innerHTML = `<i class="fas fa-times-circle"></i> ${escapeHtml(runtimeText('connection.disconnected', 'Disconnected'))}`;
    } else {
        badge.classList.add('openshock-connection-error');
        badge.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(runtimeText('connection.error', 'Error'))}`;
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
        modalTitle.textContent = isEdit
            ? runtimeText('mapping.dialog_edit', 'Edit Event Mapping')
            : runtimeText('mapping.dialog_add', 'Add Event Mapping');
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

        showNotification(isEdit
            ? runtimeText('mapping.updated', 'Mapping updated')
            : runtimeText('mapping.created', 'Mapping created'), 'success');
        addDebugLog('info', `Mapping "${mapping.name}" ${isEdit ? 'updated' : 'created'} successfully`);
    } catch (error) {
        console.error('[OpenShock] Error saving mapping:', error);
        addDebugLog('error', `Mapping save error: ${error.message}`);
        showNotification(runtimeText('errors.save_with_reason', 'Error saving: {error}', { error: error.message }), 'error');
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
        showNotification(runtimeText('mapping.deleted', 'Mapping deleted successfully'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error deleting mapping:', error);
        showNotification(runtimeText('mapping.delete_failed', 'Error deleting mapping'), 'error');
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
        showNotification(enabled
            ? runtimeText('mapping.enabled', 'Mapping enabled')
            : runtimeText('mapping.disabled', 'Mapping disabled'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error toggling mapping:', error);
        showNotification(runtimeText('mapping.toggle_failed', 'Error toggling mapping'), 'error');
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
            showNotification(runtimeText('mapping.imported', 'Mappings imported successfully'), 'success');
        } catch (error) {
            console.error('[OpenShock] Error importing mappings:', error);
            showNotification(runtimeText('mapping.import_failed', 'Error importing mappings'), 'error');
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

        showNotification(runtimeText('mapping.exported', 'Mappings exported successfully'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error exporting mappings:', error);
        showNotification(runtimeText('mapping.export_failed', 'Error exporting mappings'), 'error');
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
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${escapeHtml(runtimeText('buttons.refreshing', 'Refreshing...'))}`;
    }
    
    try {
        await loadGiftCatalog();
        renderGiftCatalog();
        showNotification(runtimeText('mapping.gift_catalog_refreshed', 'Gift catalog refreshed - {count} gifts loaded', { count: giftCatalog.length }), 'success');
    } catch (error) {
        console.error('[OpenShock] Error refreshing gift catalog:', error);
        showNotification(runtimeText('mapping.gift_catalog_refresh_failed', 'Error refreshing gift catalog'), 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = `🔄 ${escapeHtml(runtimeText('buttons.refresh_catalog', 'Refresh Catalog'))}`;
        }
    }
}

// ====================================================================
// PATTERN CRUD FUNCTIONS
// ====================================================================

let currentPatternSteps = [];
let editingStepIndex = null; // Track which step is being edited (null = adding new step)

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
        modalTitle.textContent = isEdit
            ? runtimeText('pattern.dialog_edit', 'Edit Pattern')
            : runtimeText('pattern.dialog_create', 'Create New Pattern');
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
    editingStepIndex = null; // Reset editing state when opening modal
    
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
        container.innerHTML = `<div class="text-muted text-center p-3">${escapeHtml(runtimeText('pattern.steps_empty', 'Noch keine Schritte hinzugefügt. Füge oben deinen ersten Schritt hinzu.'))}</div>`;
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
        <div class="pattern-step ${editingStepIndex === index ? 'pattern-step-editing' : ''}">
            <div class="pattern-step-number">${index + 1}</div>
            <div class="pattern-step-content">
                <span class="pattern-step-type"><strong>${stepTypeLabels[step.type] || step.type}</strong></span>
                ${step.type !== 'pause' ? `<span>Intensität: ${step.intensity}%</span>` : ''}
                <span>Dauer: ${step.duration}ms</span>
            </div>
            <div class="pattern-step-actions">
                ${index > 0 ? `<button data-step-index="${index}" class="btn btn-sm btn-secondary move-up-btn" title="${escapeHtml(runtimeText('pattern.move_up', 'Move up'))}">⬆️</button>` : ''}
                ${index < currentPatternSteps.length - 1 ? `<button data-step-index="${index}" class="btn btn-sm btn-secondary move-down-btn" title="${escapeHtml(runtimeText('pattern.move_down', 'Move down'))}">⬇️</button>` : ''}
                <button data-step-index="${index}" class="btn btn-sm btn-secondary duplicate-step-btn" title="${escapeHtml(runtimeText('pattern.duplicate_step', 'Duplicate step'))}">📋</button>
                <button data-step-index="${index}" class="btn btn-sm btn-secondary edit-pattern-step-btn" title="${escapeHtml(runtimeText('pattern.edit_step', 'Edit step'))}">✏️</button>
                <button data-step-index="${index}" class="btn btn-sm btn-danger remove-pattern-step-btn" title="${escapeHtml(runtimeText('pattern.delete_step', 'Delete step'))}">🗑️</button>
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

    addDebugLog('debug', `${editingStepIndex !== null ? 'Updating' : 'Adding'} step: ${JSON.stringify(step)}`);

    // Track whether we're editing for the notification message
    const isEditing = editingStepIndex !== null;
    const editedStepNumber = isEditing ? editingStepIndex + 1 : null;

    // Check if we're editing an existing step or adding a new one
    if (editingStepIndex !== null) {
        // Update the existing step
        currentPatternSteps[editingStepIndex] = step;
        addDebugLog('info', `Updated step ${editingStepIndex + 1}: ${step.type}`);
        
        // Reset editing state
        editingStepIndex = null;
    } else {
        // Add new step
        currentPatternSteps.push(step);
    }
    
    // Reset button to add mode
    const addButton = document.getElementById('addPatternStep');
    if (addButton) {
        addButton.innerHTML = `➕ ${escapeHtml(runtimeText('pattern.add_step', 'Schritt zum Pattern hinzufügen'))}`;
        addButton.classList.remove('btn-warning');
        addButton.classList.add('btn-success');
    }
    
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
    
    // Generate notification message based on whether we were editing
    const message = isEditing 
        ? `Schritt ${editedStepNumber} aktualisiert: ${stepLabel}${intensityText}`
        : `Schritt ${currentPatternSteps.length} hinzugefügt: ${stepLabel}${intensityText}`;
    
    showNotification(message, 'success');
}

function removePatternStep(index) {
    // If we're editing this step, cancel the edit
    if (editingStepIndex === index) {
        editingStepIndex = null;
    } else if (editingStepIndex !== null && editingStepIndex > index) {
        // If we're editing a step after this one, adjust the index
        editingStepIndex--;
    }
    
    currentPatternSteps.splice(index, 1);
    renderPatternSteps();
    
    // Update step count label
    const stepCountLabel = document.getElementById('stepCountLabel');
    if (stepCountLabel) {
        stepCountLabel.textContent = currentPatternSteps.length;
    }
}

function duplicatePatternStep(index) {
    const step = currentPatternSteps[index];
    if (!step) return;
    
    // Create a deep copy of the step
    const duplicatedStep = JSON.parse(JSON.stringify(step));
    
    // Insert the duplicated step right after the original
    currentPatternSteps.splice(index + 1, 0, duplicatedStep);
    renderPatternSteps();
    
    // Update step count label
    const stepCountLabel = document.getElementById('stepCountLabel');
    if (stepCountLabel) {
        stepCountLabel.textContent = currentPatternSteps.length;
    }
    
    showNotification(runtimeText('pattern.step_duplicated', 'Step {step} duplicated', { step: index + 1 }), 'success');
    addDebugLog('info', `Duplicated step ${index + 1}: ${step.type}`);
}

function movePatternStepUp(index) {
    if (index <= 0 || index >= currentPatternSteps.length) return;
    
    // Adjust editing index if necessary
    if (editingStepIndex === index) {
        editingStepIndex = index - 1;
    } else if (editingStepIndex === index - 1) {
        editingStepIndex = index;
    }
    
    // Swap with previous step
    const temp = currentPatternSteps[index];
    currentPatternSteps[index] = currentPatternSteps[index - 1];
    currentPatternSteps[index - 1] = temp;
    
    renderPatternSteps();
    addDebugLog('info', `Moved step ${index + 1} up`);
}

function movePatternStepDown(index) {
    if (index < 0 || index >= currentPatternSteps.length - 1) return;
    
    // Adjust editing index if necessary
    if (editingStepIndex === index) {
        editingStepIndex = index + 1;
    } else if (editingStepIndex === index + 1) {
        editingStepIndex = index;
    }
    
    // Swap with next step
    const temp = currentPatternSteps[index];
    currentPatternSteps[index] = currentPatternSteps[index + 1];
    currentPatternSteps[index + 1] = temp;
    
    renderPatternSteps();
    addDebugLog('info', `Moved step ${index + 1} down`);
}

function editPatternStep(index) {
    const step = currentPatternSteps[index];
    if (!step) return;
    
    // Store the index of the step being edited
    editingStepIndex = index;
    
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
    
    // Update button text to indicate editing mode
    const addButton = document.getElementById('addPatternStep');
    if (addButton) {
        addButton.innerHTML = `✏️ ${escapeHtml(runtimeText('pattern.update_step', 'Update step'))}`;
        addButton.classList.remove('btn-success');
        addButton.classList.add('btn-warning');
    }
    
    // Highlight the step being edited
    renderPatternSteps();
    
    // Scroll to the form
    const quickStepForm = document.getElementById('quickStepForm');
    if (quickStepForm) {
        quickStepForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    showNotification(runtimeText('pattern.step_loaded_for_edit', 'Step loaded for editing. Adjust the values and click "Update step".'), 'info');
    addDebugLog('info', `Editing step ${index + 1}: ${step.type}`);
}

function renderPatternPreview() {
    const container = document.getElementById('patternPreview');
    if (!container) return;

    if (currentPatternSteps.length === 0) {
        container.innerHTML = `<p class="text-muted text-center pattern-timeline-text">${escapeHtml(runtimeText('pattern.preview_empty', 'Add steps for preview'))}</p>`;
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
        showNotification(runtimeText('pattern.steps_required', 'Pattern must have at least one step'), 'error');
        addDebugLog('error', 'Pattern save failed: No steps');
        return;
    }

    const nameInput = document.getElementById('patternName');
    const descriptionInput = document.getElementById('patternDescription');

    const patternName = nameInput?.value?.trim();
    if (!patternName) {
        showNotification(runtimeText('pattern.name_required', 'Please enter a pattern name'), 'error');
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

        showNotification(isEdit
            ? runtimeText('pattern.updated', 'Pattern "{name}" updated', { name: patternName })
            : runtimeText('pattern.created', 'Pattern "{name}" created', { name: patternName }), 'success');
        addDebugLog('info', `Pattern "${patternName}" ${isEdit ? 'updated' : 'created'} successfully`);
    } catch (error) {
        console.error('[OpenShock] Error saving pattern:', error);
        addDebugLog('error', `Pattern save error: ${error.message}`);
        showNotification(runtimeText('errors.save_with_reason', 'Error saving: {error}', { error: error.message }), 'error');
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
        showNotification(runtimeText('pattern.deleted', 'Pattern deleted'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error deleting pattern:', error);
        showNotification(runtimeText('pattern.delete_failed', 'Error deleting pattern'), 'error');
    }
}

async function executePattern(id, deviceId) {
    if (!deviceId) {
        showNotification(runtimeText('devices.select_required', 'Please select a device'), 'error');
        return;
    }

    try {
        const response = await fetch('/api/openshock/patterns/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patternId: id, deviceId })
        });

        if (!response.ok) throw new Error('Failed to execute pattern');

        showNotification(runtimeText('pattern.executing', 'Pattern is running'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error executing pattern:', error);
        showNotification(runtimeText('pattern.execute_failed', 'Error executing pattern'), 'error');
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
        container.innerHTML = `<div class="timeline-empty">${escapeHtml(runtimeText('pattern.draw_curve_hint', 'Draw on the canvas above to create your pattern'))}</div>`;
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
    document.getElementById('curveTimelinePreview').innerHTML = `<div class="timeline-empty">${escapeHtml(runtimeText('pattern.draw_curve_hint', 'Draw on the canvas above to create your pattern'))}</div>`;
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
        showNotification(runtimeText('pattern.draw_curve_required', 'Please draw a curve first'), 'error');
        return;
    }
    
    const patternName = document.getElementById('curvePatternName').value.trim();
    if (!patternName) {
        showNotification(runtimeText('pattern.name_required', 'Please enter a pattern name'), 'error');
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
    
    showNotification(runtimeText('pattern.loaded_into_editor', 'Pattern loaded into editor. Click Save to store it.'), 'success');
}

function previewCurvePattern() {
    if (!curveEditor || curveEditor.curvePoints.length < 2) {
        showNotification(runtimeText('pattern.draw_curve_required', 'Please draw a curve first'), 'error');
        return;
    }
    
    const pattern = curveEditor.getPattern();
    
    // Show preview notification
    showNotification(runtimeText('pattern.preview', 'Preview: {steps} steps, {duration}ms total', {
        steps: pattern.steps.length,
        duration: pattern.steps.reduce((sum, step) => sum + step.duration + step.delay, 0)
    }), 'info');
}

function applyCurveTemplate() {
    const template = document.getElementById('curveTemplate').value;
    if (template === 'custom') {
        showNotification(runtimeText('pattern.template_required', 'Select a template type first'), 'info');
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
    await loadConfig();
}

async function saveSafetyConfig() {
    // Gather global limits
    const globalLimits = {
        maxIntensity: parseInt(document.getElementById('globalMaxIntensity')?.value || 80),
        maxDuration: parseInt(document.getElementById('globalMaxDuration')?.value || 5000),
        maxCommandsPerMinute: parseInt(document.getElementById('globalMaxCommandsPerMin')?.value || 30)
    };
    
    // Gather default cooldowns
    const defaultCooldowns = {
        global: parseInt(document.getElementById('globalCooldown')?.value || 500),
        perDevice: 3000, // Keep existing perDevice cooldown
        perUser: 10000   // Keep existing perUser cooldown
    };
    
    // Gather user limits
    const minPermissionLevel = document.getElementById('minPermissionLevel')?.value || 'all';
    const requireSuperfan = document.getElementById('requireSuperfan')?.checked || false;
    const minFollowerAge = parseInt(document.getElementById('minFollowerAge')?.value || 0);
    const maxCommandsPerUser = parseInt(document.getElementById('maxCommandsPerUser')?.value || 10);
    
    // Parse whitelist and blacklist
    const whitelistInput = document.getElementById('whitelist')?.value || '';
    const blacklistInput = document.getElementById('blacklist')?.value || '';
    const whitelist = whitelistInput.split(',').map(u => u.trim()).filter(u => u.length > 0);
    const blacklist = blacklistInput.split(',').map(u => u.trim()).filter(u => u.length > 0);
    
    const userLimits = {
        minFollowerAge,
        maxCommandsPerUser,
        minPermissionLevel,
        requireSuperfan,
        whitelist,
        blacklist
    };

    try {
        const response = await fetch('/api/openshock/safety', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                globalLimits,
                defaultCooldowns,
                userLimits
            })
        });

        if (!response.ok) throw new Error('Failed to save safety config');

        await loadConfig();
        showNotification(runtimeText('safety.configuration_saved', 'Safety configuration saved'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error saving safety config:', error);
        showNotification(runtimeText('safety.configuration_save_failed', 'Error saving safety configuration'), 'error');
    }
}

async function triggerEmergencyStop() {
    // Check current emergency stop state
    const isCurrentlyActive = config?.emergencyStop?.enabled || false;
    
    if (isCurrentlyActive) {
        // If active, clear it (toggle off)
        try {
            const response = await fetch('/api/openshock/emergency-clear', {
                method: 'POST'
            });

            if (!response.ok) throw new Error('Failed to clear emergency stop');

            showNotification(runtimeText('safety.emergency_stop_cleared', 'Emergency stop cleared - System reactivated'), 'success');
            
            // Update config locally
            if (config && config.emergencyStop) {
                config.emergencyStop.enabled = false;
            }
            
            // Update button text
            updateEmergencyStopButtons(false);
        } catch (error) {
            console.error('[OpenShock] Error clearing emergency stop:', error);
            showNotification(runtimeText('safety.emergency_stop_clear_failed', 'Error clearing emergency stop'), 'error');
        }
    } else {
        // If not active, activate it (toggle on)
        try {
            const response = await fetch('/api/openshock/emergency-stop', {
                method: 'POST'
            });

            if (!response.ok) throw new Error('Failed to trigger emergency stop');

            showNotification(runtimeText('safety.emergency_stop_activated', 'EMERGENCY STOP ACTIVATED'), 'error');
            
            // Update config locally
            if (config && config.emergencyStop) {
                config.emergencyStop.enabled = true;
            }
            
            // Update button text
            updateEmergencyStopButtons(true);
        } catch (error) {
            console.error('[OpenShock] Error triggering emergency stop:', error);
            showNotification(runtimeText('safety.emergency_stop_trigger_failed', 'Error triggering emergency stop'), 'error');
        }
    }
}

/**
 * Update emergency stop button text and style based on state
 * @param {boolean} isActive - Whether emergency stop is active
 */
function updateEmergencyStopButtons(isActive) {
    const headerBtn = document.getElementById('headerEmergencyStop');
    const safetyTabBtn = document.getElementById('emergencyStop');
    
    if (isActive) {
        // Emergency stop is active - show "Gestoppt" and allow reactivation
        if (headerBtn) {
            headerBtn.textContent = `✅ ${runtimeText('safety.button_stopped', 'Stopped')}`;
            headerBtn.classList.remove('btn-danger');
            headerBtn.classList.add('btn-success');
            headerBtn.title = runtimeText('safety.reactivate_tooltip', 'Click to reactivate system');
        }
        if (safetyTabBtn) {
            safetyTabBtn.textContent = `✅ ${runtimeText('safety.button_stopped', 'Stopped')}`;
            safetyTabBtn.classList.remove('btn-danger');
            safetyTabBtn.classList.add('btn-success');
        }
    } else {
        // Emergency stop is not active - show "EMERGENCY STOP"
        if (headerBtn) {
            headerBtn.textContent = `🛑 ${runtimeText('safety.button_emergency_stop', 'EMERGENCY STOP')}`;
            headerBtn.classList.remove('btn-success');
            headerBtn.classList.add('btn-danger');
            headerBtn.title = runtimeText('safety.emergency_tooltip', 'Emergency Stop - Immediately stops all shocks and disables further commands');
        }
        if (safetyTabBtn) {
            safetyTabBtn.textContent = `🛑 ${runtimeText('safety.button_emergency_stop', 'EMERGENCY STOP')}`;
            safetyTabBtn.classList.remove('btn-success');
            safetyTabBtn.classList.add('btn-danger');
        }
    }
}

async function clearEmergencyStop() {
    try {
        const response = await fetch('/api/openshock/emergency-clear', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to clear emergency stop');

        showNotification(runtimeText('safety.emergency_stop_cleared', 'Emergency stop cleared'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error clearing emergency stop:', error);
        showNotification(runtimeText('safety.emergency_stop_clear_failed', 'Error clearing emergency stop'), 'error');
    }
}

// ====================================================================
// PROVIDER SWITCH FUNCTIONS
// ====================================================================

/**
 * Blendet die richtigen Credential-Felder ein/aus je nach gewähltem Provider.
 *
 * @param {string} provider - 'openshock' oder 'pishock'
 */
function switchProviderUI(provider) {
    const openshockFields = document.getElementById('openshockFields');
    const pishockFields = document.getElementById('pishockFields');

    if (!openshockFields || !pishockFields) return;

    if (provider === 'pishock') {
        openshockFields.style.display = 'none';
        pishockFields.style.display = 'block';
    } else {
        openshockFields.style.display = 'block';
        pishockFields.style.display = 'none';
    }
}

/**
 * Rendert die ShareCode-Liste im PiShock-Bereich.
 *
 * @param {Array<{code: string, name: string}>} shareCodes - Liste der ShareCodes
 */
function renderShareCodeList(shareCodes) {
    const listEl = document.getElementById('shareCodeList');
    const emptyEl = document.getElementById('shareCodeEmpty');
    if (!listEl) return;

    // Vorhandene Zeilen entfernen (aber Empty-Placeholder behalten)
    Array.from(listEl.children).forEach((child) => {
        if (child.id !== 'shareCodeEmpty') child.remove();
    });

    if (!shareCodes || shareCodes.length === 0) {
        if (emptyEl) emptyEl.style.display = '';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    shareCodes.forEach((sc) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.08);';
        row.dataset.code = sc.code;

        const nameSpan = document.createElement('span');
        nameSpan.style.flex = '1';
        nameSpan.style.fontWeight = '500';
        nameSpan.textContent = sc.name || sc.code;

        const codeSpan = document.createElement('span');
        codeSpan.style.cssText = 'font-family:monospace; font-size:0.85em; color:var(--text-muted, #aaa); flex:1;';
        codeSpan.textContent = sc.code;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.style.padding = '3px 8px';
        deleteBtn.textContent = '🗑️';
        setRuntimeAttribute(deleteBtn, 'title', 'accessibility.delete_share_code', 'Delete ShareCode {code}', { code: sc.code });
        setRuntimeAttribute(deleteBtn, 'aria-label', 'accessibility.delete_share_code', 'Delete ShareCode {code}', { code: sc.code });
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            deleteShareCode(sc.code);
        });

        row.appendChild(nameSpan);
        row.appendChild(codeSpan);
        row.appendChild(deleteBtn);
        listEl.appendChild(row);
    });
}

/**
 * Fügt einen neuen ShareCode zur PiShock-Konfiguration hinzu.
 */
async function addShareCode() {
    const codeEl = document.getElementById('newShareCode');
    const nameEl = document.getElementById('newShareCodeName');

    if (!codeEl) return;

    const code = (codeEl.value || '').trim();
    const name = (nameEl ? nameEl.value : '').trim();

    if (!code) {
        showNotification(runtimeText('devices.share_code_required', 'Please enter a ShareCode'), 'warning');
        return;
    }

    try {
        const response = await fetch('/api/openshock/pishock/sharecodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, name: name || code })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to add ShareCode');
        }

        // UI zurücksetzen
        codeEl.value = '';
        if (nameEl) nameEl.value = '';

        // Liste aktualisieren
        shareCodes = result.shareCodes || [];
        renderShareCodeList(shareCodes);

        // Devices neu laden (ShareCodes = Devices bei PiShock)
        await loadDevices().catch(() => {});
        renderDeviceList();

        showNotification(runtimeText('devices.share_code_added', 'ShareCode "{code}" added', { code }), 'success');

    } catch (error) {
        console.error('[OpenShock] Failed to add ShareCode:', error);
        showNotification(runtimeText('devices.share_code_add_failed', 'Error adding ShareCode: {error}', { error: error.message }), 'error');
    }
}

/**
 * Löscht einen ShareCode aus der PiShock-Konfiguration.
 *
 * @param {string} code - ShareCode der gelöscht werden soll
 */
async function deleteShareCode(code) {
    if (!confirm(runtimeText('devices.share_code_delete_confirm', 'Delete ShareCode "{code}"?', { code }))) return;

    try {
        const response = await fetch(`/api/openshock/pishock/sharecodes/${encodeURIComponent(code)}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to delete ShareCode');
        }

        renderShareCodeList(result.shareCodes || []);

        // Devices aktualisieren
        await loadDevices().catch(() => {});
        renderDeviceList();

        showNotification(`✅ ShareCode "${code}" deleted`, 'success');

    } catch (error) {
        console.error('[OpenShock] Failed to delete ShareCode:', error);
        showNotification(`Error deleting ShareCode: ${error.message}`, 'error');
    }
}

// ====================================================================
// ADVANCED FUNCTIONS
// ====================================================================

async function saveApiSettings() {
    const provider = (document.getElementById('apiProvider') || {}).value || 'openshock';

    try {
        let configPayload = { apiProvider: provider };

        if (provider === 'openshock') {
            const apiKey = document.getElementById('apiKey').value;
            const baseUrl = document.getElementById('baseUrl').value;

            if (!apiKey || apiKey === '***SAVED***') {
                showNotification(runtimeText('placeholders.api_key_already_saved', 'API key is already saved. Enter a new key to change it.'), 'info');
                // Still allow saving provider switch / base URL change
                configPayload.baseUrl = baseUrl;
            } else {
                configPayload.apiKey = apiKey;
                configPayload.baseUrl = baseUrl;
            }
        } else if (provider === 'pishock') {
            const pishockApiKey = document.getElementById('pishockApiKey').value;
            const pishockUsername = (document.getElementById('pishockUsername') || {}).value || '';

            const pishockPayload = {};

            if (pishockUsername) pishockPayload.username = pishockUsername;

            if (pishockApiKey && pishockApiKey !== '***SAVED***') {
                pishockPayload.apiKey = pishockApiKey;
            }

            configPayload.pishock = pishockPayload;
        }

        const response = await fetch('/api/openshock/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configPayload)
        });

        if (!response.ok) {
            let errorMessage = 'Failed to save API settings';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // Response was not JSON
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();
        
        await loadConfig();
        
        // Nach dem Speichern Devices neu laden und Status aktualisieren
        try {
            await loadDevices();
            renderDeviceList();
            renderPatternList();
            
            const deviceCount = result.deviceCount || devices.length;
            updateApiStatus(deviceCount > 0, deviceCount);
            
            if (deviceCount > 0) {
                showNotification(runtimeText('devices.settings_saved_with_count', 'Settings saved and {count} device(s) loaded', { count: deviceCount }), 'success');
            } else if (result.deviceLoadSuccess === false) {
                showNotification(runtimeText('devices.settings_saved_load_failed', 'Settings saved but could not load devices'), 'warning');
            } else {
                showNotification(runtimeText('devices.settings_saved_no_devices', 'Settings saved but no devices found'), 'warning');
            }
        } catch (loadError) {
            console.error('[OpenShock] Could not load devices after saving settings:', loadError);
            updateApiStatus(false, 0);
            showNotification(runtimeText('devices.settings_saved_load_error', 'Settings saved but failed to load devices: {error}', { error: loadError.message || runtimeText('errors.unknown', 'Unknown error') }), 'error');
        }
    } catch (error) {
        console.error('[OpenShock] Error saving API settings:', error);
        showNotification(runtimeText('devices.settings_save_failed', 'Error saving API settings: {error}', { error: error.message }), 'error');
        updateApiStatus(false, 0);
    }
}

async function testConnection() {
    const button = document.querySelector('.test-connection-btn');
    if (button) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${escapeHtml(runtimeText('buttons.testing', 'Testing...'))}`;
    }

    try {
        const response = await fetch('/api/openshock/test-connection', {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showNotification(runtimeText('connection.successful', 'Connection successful!'), 'success');
            
            // Update API status display
            updateApiStatus(true, result.deviceCount || 0);
            
            // Auto-refresh devices after successful connection
            try {
                await loadDevices();
                renderDeviceList();
                renderPatternList();
                showNotification(runtimeText('devices.refreshed_with_count', 'Devices refreshed - loaded {count} device(s)', { count: devices.length }), 'success');
            } catch (loadError) {
                console.error('[OpenShock] Could not load devices after connection test:', loadError);
                showNotification(runtimeText('connection.successful_load_failed', 'Connection successful but could not load devices'), 'warning');
            }
        } else {
            throw new Error(result.error || 'Connection failed');
        }
    } catch (error) {
        console.error('[OpenShock] Connection test failed:', error);
        showNotification(runtimeText('connection.failed_with_error', 'Connection failed: {error}', { error: error.message }), 'error');
        
        // Update API status display
        updateApiStatus(false, 0);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = `<i class="fas fa-plug"></i> ${escapeHtml(runtimeText('buttons.test_connection', 'Test Connection'))}`;
        }
    }
}

function updateApiStatus(connected, deviceCount) {
    // Update API Status badge
    const apiStatusEl = document.getElementById('apiStatus');
    if (apiStatusEl) {
        if (connected) {
            apiStatusEl.textContent = '🟢';
            apiStatusEl.title = runtimeText('connection.api_connected', 'API Connected');
        } else {
            apiStatusEl.textContent = '🔴';
            apiStatusEl.title = runtimeText('connection.api_disconnected', 'API Disconnected');
        }
    }
    
    // Update Connection State
    const connectionStateEl = document.getElementById('connectionState');
    if (connectionStateEl) {
        connectionStateEl.textContent = connected
            ? runtimeText('connection.online', 'Online')
            : runtimeText('connection.offline', 'Offline');
    }
    
    // Update Device Count
    const deviceCountEl = document.getElementById('deviceCount');
    if (deviceCountEl) {
        deviceCountEl.textContent = deviceCount;
    }

    // Update Provider Status Badge
    const providerStatusText = document.getElementById('providerStatusText');
    if (providerStatusText) {
        const provider = (config && config.apiProvider) || 'openshock';
        const providerLabel = provider === 'pishock' ? 'PiShock' : 'OpenShock';
        if (connected) {
            providerStatusText.className = 'status-badge status-connected';
            providerStatusText.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(runtimeText('connection.provider_connected', '{provider} – Connected ({count} device(s))', { provider: providerLabel, count: deviceCount }))}</span>`;
        } else {
            providerStatusText.className = 'status-badge status-disconnected';
            providerStatusText.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(runtimeText('connection.provider_disconnected', '{provider} – Not connected', { provider: providerLabel }))}</span>`;
        }
    }
}

function updateTestShockDeviceList() {
    const testShockDevice = document.getElementById('testShockDevice');
    const testShockButton = document.getElementById('testShockButton');
    
    if (!testShockDevice) return;
    
    // Clear existing options
    testShockDevice.innerHTML = `<option value="">${escapeHtml(runtimeText('devices.select', '-- Select a device --'))}</option>`;
    
    // Add device options
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = device.name || device.id;
        
        // Disable paused devices and add indicator
        if (device.isPaused) {
            option.disabled = true;
            option.textContent += ` (${runtimeText('devices.paused', 'Paused')})`;
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
    deviceSelect.innerHTML = `<option value="">${escapeHtml(runtimeText('devices.select', 'Select Device...'))}</option>`;
    
    // Add device options
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = device.name || device.id;
        
        // Disable paused devices and add indicator
        if (device.isPaused) {
            option.disabled = true;
            option.textContent += ` (${runtimeText('devices.paused', 'Paused')})`;
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
    patternSelect.innerHTML = `<option value="">${escapeHtml(runtimeText('pattern.single_pulse', 'None (Single pulse)'))}</option>`;
    
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
        showNotification(runtimeText('devices.select_for_test', 'Please select a device for test shock'), 'error');
        return;
    }
    
    const button = document.getElementById('testShockButton');
    if (button) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${escapeHtml(runtimeText('buttons.sending', 'Sending...'))}`;
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
        
        showNotification(runtimeText('devices.test_shock_sent', 'Test shock sent successfully!'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error sending test shock:', error);
        showNotification(runtimeText('devices.test_shock_failed', 'Error sending test shock: {error}', { error: error.message }), 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = `⚡ ${escapeHtml(runtimeText('buttons.test_shock', 'Test Shock (1s, 100%)'))}`;
        }
    }
}

async function refreshDevices() {
    const button = document.querySelector('.refresh-devices-btn');
    if (button) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${escapeHtml(runtimeText('buttons.refreshing', 'Refreshing...'))}`;
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
        
        showNotification(runtimeText('devices.refreshed_with_count', 'Devices refreshed - loaded {count} device(s)', { count: devices.length }), 'success');
    } catch (error) {
        console.error('[OpenShock] Error refreshing devices:', error);
        showNotification(runtimeText('devices.refresh_failed', 'Error refreshing devices'), 'error');
        
        // Update API status as failed
        updateApiStatus(false, 0);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = `<i class="fas fa-sync"></i> ${escapeHtml(runtimeText('buttons.refresh_devices', 'Refresh Devices'))}`;
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
        showNotification(runtimeText('queue.cleared', 'Queue cleared successfully'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error clearing queue:', error);
        showNotification(runtimeText('queue.clear_failed', 'Error clearing queue'), 'error');
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
    } else if (tabId === 'zappiehell') {
        initZappieHellTab();
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
        
        // Clean up modal state based on modal type
        if (modalId === 'goalModal') {
            currentEditingGoal = null;
        } else if (modalId === 'chainModal') {
            currentEditingChain = null;
            chainSteps = [];
        } else if (modalId === 'stepModal') {
            currentEditingStep = null;
        }
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

// Alias for showNotification to support both naming conventions
function showToast(type, message) {
    // Note: showToast uses (type, message) while showNotification uses (message, type)
    showNotification(message, type);
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
    document.querySelectorAll('#clearDebugLog, #advancedClearDebugLog').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            clearDebugLog();
        });
    });

    document.querySelectorAll('#exportDebugLog, #advancedExportDebugLog').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            exportDebugLog();
        });
    });

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
            if (confirm(runtimeText('pattern.clear_all_steps_confirm', 'Delete all steps? This action cannot be undone.'))) {
                currentPatternSteps = [];
                editingStepIndex = null; // Reset editing state
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
    const apiProviderEl = document.getElementById('apiProvider');
    if (apiProviderEl) {
        apiProviderEl.addEventListener('change', (e) => {
            switchProviderUI(e.target.value);
        });
    }

    const addShareCodeBtn = document.getElementById('addShareCodeBtn');
    if (addShareCodeBtn) {
        addShareCodeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            addShareCode();
        });
    }

    // Allow pressing Enter in ShareCode input to add
    const newShareCodeEl = document.getElementById('newShareCode');
    if (newShareCodeEl) {
        newShareCodeEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addShareCode();
            }
        });
    }

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
        
        // Duplicate pattern step button
        if (e.target.closest('.duplicate-step-btn')) {
            e.preventDefault();
            const button = e.target.closest('.duplicate-step-btn');
            const stepIndex = parseInt(button.dataset.stepIndex);
            duplicatePatternStep(stepIndex);
        }
        
        // Move pattern step up
        if (e.target.closest('.move-up-btn')) {
            e.preventDefault();
            const button = e.target.closest('.move-up-btn');
            const stepIndex = parseInt(button.dataset.stepIndex);
            movePatternStepUp(stepIndex);
        }
        
        // Move pattern step down
        if (e.target.closest('.move-down-btn')) {
            e.preventDefault();
            const button = e.target.closest('.move-down-btn');
            const stepIndex = parseInt(button.dataset.stepIndex);
            movePatternStepDown(stepIndex);
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
        showNotification(runtimeText('status.statistics_reset', 'Statistics reset successfully'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error resetting stats:', error);
        showNotification(runtimeText('errors.statistics_reset', 'Error resetting statistics'), 'error');
    }
}

function clearCommandLog() {
    debugLogs = [];
    renderCommandLog([]);
    showNotification(runtimeText('status.command_log_cleared', 'Command log cleared'), 'success');
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
    showNotification(runtimeText('status.command_log_exported', 'Command log exported'), 'success');
}

async function pauseQueue() {
    try {
        const response = await fetch('/api/openshock/queue/pause', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to pause queue');

        await loadQueueStatus();
        renderQueueStatus();
        showNotification(runtimeText('queue.paused', 'Queue paused'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error pausing queue:', error);
        showNotification(runtimeText('queue.pause_failed', 'Error pausing queue'), 'error');
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
        showNotification(runtimeText('queue.resumed', 'Queue resumed'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error resuming queue:', error);
        showNotification(runtimeText('queue.resume_failed', 'Error resuming queue'), 'error');
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
            showNotification(runtimeText('pattern.imported', 'Patterns imported successfully'), 'success');
        } catch (error) {
            console.error('[OpenShock] Error importing patterns:', error);
            showNotification(runtimeText('pattern.import_failed', 'Error importing patterns'), 'error');
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
        showNotification(runtimeText('pattern.exported', 'Patterns exported'), 'success');
    } catch (error) {
        console.error('[OpenShock] Error exporting patterns:', error);
        showNotification(runtimeText('pattern.export_failed', 'Error exporting patterns'), 'error');
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

// ====================================================================
// ZAPPIEHELL MANAGEMENT
// ====================================================================

let goals = [];
let eventChains = [];
let currentEditingGoal = null;
let currentEditingChain = null;
let currentEditingStep = null;
let chainSteps = [];
let zappieHellInitialized = false;

function zappieText(key, fallback, params = {}) {
    return runtimeText(`zappiehell.${key}`, fallback, params);
}

function zappieError(key, fallback, error) {
    return zappieText(key, fallback, { error: error || runtimeText('errors.unknown', 'Unknown error') });
}

function setZappieHellCopyButtonLabels() {
    const copyButton = document.getElementById('copyZappieHellOverlayUrl');
    setRuntimeAttribute(copyButton, 'title', 'zappiehell.accessibility.copy_overlay_url', 'Copy overlay URL');
    setRuntimeAttribute(copyButton, 'aria-label', 'zappiehell.accessibility.copy_overlay_url', 'Copy overlay URL');
}

function rerenderZappieHellRuntimeCopy() {
    setZappieHellCopyButtonLabels();
    renderGoals();
    renderChains();
    renderChainSteps();
    updateChainSelectors();
    updateStepPatternList();
    updateStepDeviceList();
    updateZappieHellModalTitles();
}

/**
 * Initialize ZappieHell tab event listeners (once)
 */
function initZappieHellEventListeners() {
    if (zappieHellInitialized) return;
    
    // Button handlers - use safe references to avoid ID conflicts
    const addGoalBtn = document.getElementById('addGoalBtn');
    const saveGoalBtn = document.getElementById('saveGoalBtn');
    const cancelGoalBtn = document.getElementById('cancelGoalBtn');
    const closeGoalModalBtn = document.getElementById('closeGoalModal');
    
    const addChainBtn = document.getElementById('addChainBtn');
    const saveChainBtn = document.getElementById('saveChainBtn');
    const cancelChainBtn = document.getElementById('cancelChainBtn');
    const closeChainModalBtn = document.getElementById('closeChainModal');
    
    const addChainStepBtn = document.getElementById('addChainStepBtn');
    const saveStepBtn = document.getElementById('saveStepBtn');
    const cancelStepBtn = document.getElementById('cancelStepBtn');
    const closeStepModalBtn = document.getElementById('closeStepModal');
    
    const copyZappieHellOverlayUrl = document.getElementById('copyZappieHellOverlayUrl');
    const stepTypeSelect = document.getElementById('stepTypeSelect');
    
    if (addGoalBtn) addGoalBtn.addEventListener('click', () => openGoalModal());
    if (saveGoalBtn) saveGoalBtn.addEventListener('click', saveGoal);
    if (cancelGoalBtn) cancelGoalBtn.addEventListener('click', () => closeModal('goalModal'));
    if (closeGoalModalBtn) closeGoalModalBtn.addEventListener('click', () => closeModal('goalModal'));

    if (addChainBtn) addChainBtn.addEventListener('click', () => openChainModal());
    if (saveChainBtn) saveChainBtn.addEventListener('click', saveChain);
    if (cancelChainBtn) cancelChainBtn.addEventListener('click', () => closeModal('chainModal'));
    if (closeChainModalBtn) closeChainModalBtn.addEventListener('click', () => closeModal('chainModal'));

    if (addChainStepBtn) addChainStepBtn.addEventListener('click', () => openStepModal());
    if (saveStepBtn) saveStepBtn.addEventListener('click', saveChainStep);
    if (cancelStepBtn) cancelStepBtn.addEventListener('click', () => closeModal('stepModal'));
    if (closeStepModalBtn) closeStepModalBtn.addEventListener('click', () => closeModal('stepModal'));

    if (copyZappieHellOverlayUrl) {
        setZappieHellCopyButtonLabels();
        copyZappieHellOverlayUrl.addEventListener('click', () => {
            const input = document.getElementById('zappiehellOverlayUrl');
            if (!input) return;
            
            input.select();
            
            // Use modern Clipboard API with fallback
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(input.value)
                    .then(() => showToast(TOAST_SUCCESS, zappieText('overlay.copied', 'Overlay URL copied to clipboard!')))
                    .catch(() => {
                        // Fallback to deprecated method
                        document.execCommand('copy');
                        showToast(TOAST_SUCCESS, zappieText('overlay.copied', 'Overlay URL copied to clipboard!'));
                    });
            } else {
                // Fallback for older browsers
                document.execCommand('copy');
                showToast(TOAST_SUCCESS, zappieText('overlay.copied', 'Overlay URL copied to clipboard!'));
            }
        });
    }

    // Step type selector handler
    if (stepTypeSelect) {
        stepTypeSelect.addEventListener('change', (e) => {
            updateStepFieldsVisibility(e.target.value);
        });
    }

    // Socket.io listeners for ZappieHell
    if (socket) {
        socket.on('zappiehell:goals:update', (data) => {
            goals = data.goals || [];
            renderGoals();
        });

        socket.on('zappiehell:chains:update', (data) => {
            eventChains = data.chains || [];
            renderChains();
            updateChainSelectors();
        });
    }

    zappieHellInitialized = true;
    addDebugLog('info', zappieText('debug.listeners_initialized', 'ZappieHell event listeners initialized'));
}

/**
 * Initialize/refresh ZappieHell tab data
 */
function initZappieHellTab() {
    // Initialize event listeners once
    initZappieHellEventListeners();
    
    // Set overlay URL
    const overlayUrlInput = document.getElementById('zappiehellOverlayUrl');
    if (overlayUrlInput) {
        const overlayUrl = `${window.location.origin}/openshock/zappiehell/overlay`;
        overlayUrlInput.value = overlayUrl;
    }

    // Load goals and chains
    loadGoals();
    loadEventChains();

    addDebugLog('info', zappieText('debug.data_loaded', 'ZappieHell tab data loaded'));
}

/**
 * Load goals from server
 */
async function loadGoals() {
    try {
        const response = await fetch('/api/openshock/zappiehell/goals');
        const data = await response.json();
        
        if (data.success) {
            goals = data.goals || [];
            renderGoals();
        }
    } catch (error) {
        console.error('Error loading goals:', error);
        showToast(TOAST_ERROR, zappieError('errors.load_goals', 'Failed to load goals: {error}', error.message));
    }
}

/**
 * Load event chains from server
 */
async function loadEventChains() {
    try {
        const response = await fetch('/api/openshock/zappiehell/chains');
        const data = await response.json();
        
        if (data.success) {
            eventChains = data.chains || [];
            renderChains();
            updateChainSelectors();
        }
    } catch (error) {
        console.error('Error loading event chains:', error);
        showToast(TOAST_ERROR, zappieError('errors.load_chains', 'Failed to load event chains: {error}', error.message));
    }
}

/**
 * Render goals list
 */
function renderGoals() {
    const container = document.getElementById('goalsList');
    if (!container) return;
    
    if (goals.length === 0) {
        container.innerHTML = `<p class="text-muted">${escapeHtml(zappieText('goals.empty', 'No goals configured yet.'))}</p>`;
        return;
    }

    container.innerHTML = goals.map(goal => {
        const percentage = Math.min(100, Math.round((goal.currentCoins / goal.targetCoins) * 100));
        const chainName = goal.chainId
            ? (eventChains.find(c => c.id === goal.chainId)?.name || zappieText('goals.unknown_chain', 'Unknown chain'))
            : zappieText('goals.no_chain', 'No chain');
        const goalName = escapeHtml(goal.name);
        const activeLabel = goal.active
            ? zappieText('goals.active', 'Active')
            : zappieText('goals.inactive', 'Inactive');
        
        return `
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">
                        <span role="img" aria-label="${escapeHtml(activeLabel)}" title="${escapeHtml(activeLabel)}">${goal.active ? '✅' : '❌'}</span> ${goalName}
                        <span class="badge badge-${goal.type === 'stream' ? 'primary' : 'secondary'}">${goal.type}</span>
                    </h3>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-secondary" onclick="window.openShock.editGoal('${goal.id}')" aria-label="${escapeHtml(zappieText('accessibility.edit_goal', 'Edit goal {name}', { name: goal.name }))}">✏️ ${escapeHtml(zappieText('buttons.edit', 'Edit'))}</button>
                        <button class="btn btn-sm btn-warning" onclick="window.openShock.resetGoal('${goal.id}')" aria-label="${escapeHtml(zappieText('accessibility.reset_goal', 'Reset goal {name}', { name: goal.name }))}">🔄 ${escapeHtml(zappieText('buttons.reset', 'Reset'))}</button>
                        <button class="btn btn-sm btn-danger" onclick="window.openShock.deleteGoal('${goal.id}')" aria-label="${escapeHtml(zappieText('accessibility.delete_goal', 'Delete goal {name}', { name: goal.name }))}">🗑️ ${escapeHtml(zappieText('buttons.delete', 'Delete'))}</button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="progress-bar-wrapper" style="height: 30px; margin-bottom: 10px;">
                        <div class="progress-bar" style="width: ${percentage}%; background: linear-gradient(90deg, #4CAF50, #FFC107);"></div>
                        <div class="progress-text" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-weight: bold;">
                            ${percentage}%
                        </div>
                    </div>
                        <div class="grid-3">
                            <div>
                                <strong>${escapeHtml(zappieText('goals.target', 'Target'))}:</strong> ${goal.targetCoins.toLocaleString()} ${escapeHtml(zappieText('goals.coins', 'coins'))}
                            </div>
                            <div>
                                <strong>${escapeHtml(zappieText('goals.current', 'Current'))}:</strong> ${goal.currentCoins.toLocaleString()} ${escapeHtml(zappieText('goals.coins', 'coins'))}
                            </div>
                            <div>
                                <strong>${escapeHtml(zappieText('goals.chain', 'Chain'))}:</strong> ${escapeHtml(chainName)}
                            </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render event chains list
 */
function renderChains() {
    const container = document.getElementById('chainsList');
    if (!container) return;
    
    if (eventChains.length === 0) {
        container.innerHTML = `<p class="text-muted">${escapeHtml(zappieText('chains.empty', 'No event chains configured yet.'))}</p>`;
        return;
    }

    container.innerHTML = eventChains.map(chain => {
        const chainName = escapeHtml(chain.name);
        return `
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">🔗 ${chainName}</h3>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-secondary" onclick="window.openShock.editChain('${chain.id}')" aria-label="${escapeHtml(zappieText('accessibility.edit_chain', 'Edit event chain {name}', { name: chain.name }))}">✏️ ${escapeHtml(zappieText('buttons.edit', 'Edit'))}</button>
                        <button class="btn btn-sm btn-success" onclick="window.openShock.testChain('${chain.id}')" aria-label="${escapeHtml(zappieText('accessibility.test_chain', 'Test event chain {name}', { name: chain.name }))}">▶️ ${escapeHtml(zappieText('buttons.test', 'Test'))}</button>
                        <button class="btn btn-sm btn-danger" onclick="window.openShock.deleteChain('${chain.id}')" aria-label="${escapeHtml(zappieText('accessibility.delete_chain', 'Delete event chain {name}', { name: chain.name }))}">🗑️ ${escapeHtml(zappieText('buttons.delete', 'Delete'))}</button>
                    </div>
                </div>
                <div class="card-body">
                    <p class="text-muted">${escapeHtml(chain.description || zappieText('chains.no_description', 'No description'))}</p>
                    <p><strong>${escapeHtml(zappieText('chains.steps', 'Steps'))}:</strong> ${chain.steps?.length || 0}</p>
                    ${renderChainStepsPreview(chain.steps)}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render chain steps preview
 */
function renderChainStepsPreview(steps) {
    if (!steps || steps.length === 0) {
        return `<p class="text-muted">${escapeHtml(zappieText('chains.preview_empty', 'No steps'))}</p>`;
    }
    
    return '<ol style="margin-left: 20px;">' + steps.map(step => {
        let icon = '•';
        let label = step.type;
        
        switch(step.type) {
            case 'openshock': icon = '⚡'; label = zappieText('steps.type_openshock', 'Hybrid Shock'); break;
            case 'delay': icon = '⏱️'; label = zappieText('steps.type_delay', 'Delay ({duration}ms)', { duration: step.durationMs }); break;
            case 'audio': icon = '🔊'; label = zappieText('steps.type_audio', 'Audio/TTS'); break;
            case 'webhook': icon = '🌐'; label = zappieText('steps.type_webhook', 'Webhook ({url})', { url: step.url || '' }); break;
            case 'overlay': icon = '📺'; label = zappieText('steps.type_overlay', 'Overlay'); break;
        }
        
        return `<li>${icon} ${escapeHtml(label)}</li>`;
    }).join('') + '</ol>';
}

/**
 * Update chain selectors in goal modal
 */
function updateChainSelectors() {
    const selector = document.getElementById('goalChainId');
    if (!selector) return;

    const selectedValue = selector.value;
    selector.innerHTML = `<option value="">${escapeHtml(zappieText('goals.no_chain_option', '-- No chain --'))}</option>` +
        eventChains.map(chain => `<option value="${chain.id}">${escapeHtml(chain.name)}</option>`).join('');
    selector.value = selectedValue;
}

/**
 * Open goal modal for creating/editing
 */
function updateGoalModalTitle() {
    const title = document.getElementById('goalModalTitle');
    if (!title) return;
    title.textContent = currentEditingGoal
        ? `✏️ ${zappieText('goals.modal_edit', 'Edit goal')}`
        : `➕ ${zappieText('goals.modal_create', 'Add goal')}`;
}

function updateChainModalTitle() {
    const title = document.getElementById('chainModalTitle');
    if (!title) return;
    title.textContent = currentEditingChain
        ? `✏️ ${zappieText('chains.modal_edit', 'Edit event chain')}`
        : `➕ ${zappieText('chains.modal_create', 'Add event chain')}`;
}

function updateStepModalTitle() {
    const title = document.getElementById('stepModalTitle');
    if (!title) return;
    const isEdit = currentEditingStep !== null;
    title.textContent = isEdit
        ? `✏️ ${zappieText('steps.modal_edit', 'Edit event chain step')}`
        : `➕ ${zappieText('steps.modal_create', 'Add event chain step')}`;
}

function updateZappieHellModalTitles() {
    updateGoalModalTitle();
    updateChainModalTitle();
    updateStepModalTitle();
}

function openGoalModal(goalId = null) {
    currentEditingGoal = goalId ? goals.find(g => g.id === goalId) : null;
    updateGoalModalTitle();
    
    if (currentEditingGoal) {
        document.getElementById('goalId').value = currentEditingGoal.id;
        document.getElementById('goalName').value = currentEditingGoal.name;
        document.getElementById('goalTargetCoins').value = currentEditingGoal.targetCoins;
        document.getElementById('goalCurrentCoins').value = currentEditingGoal.currentCoins;
        document.getElementById('goalType').value = currentEditingGoal.type;
        document.getElementById('goalChainId').value = currentEditingGoal.chainId || '';
        document.getElementById('goalActive').checked = currentEditingGoal.active;
    } else {
        document.getElementById('goalId').value = '';
        document.getElementById('goalName').value = '';
        document.getElementById('goalTargetCoins').value = '';
        document.getElementById('goalCurrentCoins').value = '0';
        document.getElementById('goalType').value = 'stream';
        document.getElementById('goalChainId').value = '';
        document.getElementById('goalActive').checked = true;
    }
    
    openModal('goalModal');
}

/**
 * Save goal
 */
async function saveGoal() {
    const goalData = {
        name: document.getElementById('goalName').value,
        targetCoins: parseInt(document.getElementById('goalTargetCoins').value),
        currentCoins: parseInt(document.getElementById('goalCurrentCoins').value),
        type: document.getElementById('goalType').value,
        chainId: document.getElementById('goalChainId').value || null,
        active: document.getElementById('goalActive').checked
    };

    if (!goalData.name || !goalData.targetCoins) {
        showToast(TOAST_ERROR, zappieText('goals.validation_required', 'Please fill in all required fields'));
        return;
    }

    try {
        const goalId = document.getElementById('goalId').value;
        const url = goalId ? `/api/openshock/zappiehell/goals/${goalId}` : '/api/openshock/zappiehell/goals';
        const method = goalId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(goalData)
        });

        const data = await response.json();
        
        if (data.success) {
            showToast(TOAST_SUCCESS, goalId
                ? zappieText('goals.updated', 'Goal updated')
                : zappieText('goals.created', 'Goal created'));
            closeModal('goalModal');
            loadGoals();
        } else {
            showToast(TOAST_ERROR, zappieError('errors.save_goal', 'Failed to save goal: {error}', data.error));
        }
    } catch (error) {
        console.error('Error saving goal:', error);
        showToast(TOAST_ERROR, zappieError('errors.save_goal', 'Failed to save goal: {error}', error.message));
    }
}

/**
 * Edit goal
 */
function editGoal(goalId) {
    openGoalModal(goalId);
}

/**
 * Delete goal
 */
async function deleteGoal(goalId) {
    if (!confirm(zappieText('goals.delete_confirm', 'Are you sure you want to delete this goal?'))) return;

    try {
        const response = await fetch(`/api/openshock/zappiehell/goals/${goalId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        
        if (data.success) {
            showToast(TOAST_SUCCESS, zappieText('goals.deleted', 'Goal deleted'));
            loadGoals();
        } else {
            showToast(TOAST_ERROR, zappieError('errors.delete_goal', 'Failed to delete goal: {error}', data.error));
        }
    } catch (error) {
        console.error('Error deleting goal:', error);
        showToast(TOAST_ERROR, zappieError('errors.delete_goal', 'Failed to delete goal: {error}', error.message));
    }
}

/**
 * Reset goal
 */
async function resetGoal(goalId) {
    if (!confirm(zappieText('goals.reset_confirm', 'Reset this goal to 0 coins?'))) return;

    try {
        const response = await fetch(`/api/openshock/zappiehell/goals/${goalId}/reset`, {
            method: 'POST'
        });

        const data = await response.json();
        
        if (data.success) {
            showToast(TOAST_SUCCESS, zappieText('goals.reset', 'Goal reset'));
            loadGoals();
        } else {
            showToast(TOAST_ERROR, zappieError('errors.reset_goal', 'Failed to reset goal: {error}', data.error));
        }
    } catch (error) {
        console.error('Error resetting goal:', error);
        showToast(TOAST_ERROR, zappieError('errors.reset_goal', 'Failed to reset goal: {error}', error.message));
    }
}

/**
 * Open chain modal
 */
function openChainModal(chainId = null) {
    currentEditingChain = chainId ? eventChains.find(c => c.id === chainId) : null;
    updateChainModalTitle();
    
    if (currentEditingChain) {
        document.getElementById('chainId').value = currentEditingChain.id;
        document.getElementById('chainName').value = currentEditingChain.name;
        document.getElementById('chainDescription').value = currentEditingChain.description || '';
        chainSteps = [...(currentEditingChain.steps || [])];
    } else {
        document.getElementById('chainId').value = '';
        document.getElementById('chainName').value = '';
        document.getElementById('chainDescription').value = '';
        chainSteps = [];
    }
    
    renderChainSteps();
    openModal('chainModal');
}

/**
 * Save chain
 */
async function saveChain() {
    const chainData = {
        name: document.getElementById('chainName').value,
        description: document.getElementById('chainDescription').value,
        steps: chainSteps
    };

    if (!chainData.name) {
        showToast(TOAST_ERROR, zappieText('chains.validation_name_required', 'Please enter an event chain name'));
        return;
    }

    try {
        const chainId = document.getElementById('chainId').value;
        const url = chainId ? `/api/openshock/zappiehell/chains/${chainId}` : '/api/openshock/zappiehell/chains';
        const method = chainId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chainData)
        });

        const data = await response.json();
        
        if (data.success) {
            showToast(TOAST_SUCCESS, chainId
                ? zappieText('chains.updated', 'Event chain updated')
                : zappieText('chains.created', 'Event chain created'));
            closeModal('chainModal');
            loadEventChains();
        } else {
            showToast(TOAST_ERROR, zappieError('errors.save_chain', 'Failed to save event chain: {error}', data.error));
        }
    } catch (error) {
        console.error('Error saving chain:', error);
        showToast(TOAST_ERROR, zappieError('errors.save_chain', 'Failed to save event chain: {error}', error.message));
    }
}

/**
 * Edit chain
 */
function editChain(chainId) {
    openChainModal(chainId);
}

/**
 * Delete chain
 */
async function deleteChain(chainId) {
    if (!confirm(zappieText('chains.delete_confirm', 'Are you sure you want to delete this event chain?'))) return;

    try {
        const response = await fetch(`/api/openshock/zappiehell/chains/${chainId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        
        if (data.success) {
            showToast(TOAST_SUCCESS, zappieText('chains.deleted', 'Event chain deleted'));
            loadEventChains();
        } else {
            showToast(TOAST_ERROR, zappieError('errors.delete_chain', 'Failed to delete event chain: {error}', data.error));
        }
    } catch (error) {
        console.error('Error deleting chain:', error);
        showToast(TOAST_ERROR, zappieError('errors.delete_chain', 'Failed to delete event chain: {error}', error.message));
    }
}

/**
 * Test chain
 */
async function testChain(chainId) {
    if (!confirm(zappieText('chains.test_confirm', 'Execute this event chain now as a test?'))) return;

    try {
        const response = await fetch(`/api/openshock/zappiehell/chains/${chainId}/execute`, {
            method: 'POST'
        });

        const data = await response.json();
        
        if (data.success) {
            showToast(TOAST_SUCCESS, zappieText('chains.execution_started', 'Event chain execution started'));
        } else {
            showToast(TOAST_ERROR, zappieError('errors.execute_chain', 'Failed to execute event chain: {error}', data.error));
        }
    } catch (error) {
        console.error('Error executing chain:', error);
        showToast(TOAST_ERROR, zappieError('errors.execute_chain', 'Failed to execute event chain: {error}', error.message));
    }
}

/**
 * Render chain steps in modal
 */
function renderChainSteps() {
    const container = document.getElementById('chainStepsList');
    if (!container) return;
    
    if (chainSteps.length === 0) {
        container.innerHTML = `<p class="text-muted" style="padding: 20px;">${escapeHtml(zappieText('steps.empty', 'No steps added yet. Click "Add Step" to begin.'))}</p>`;
        return;
    }

    container.innerHTML = chainSteps.map((step, index) => {
        let icon = '•';
        let label = step.type;
        let details = '';
        
        switch(step.type) {
            case 'openshock':
                icon = '⚡';
                label = zappieText('steps.type_openshock', 'Hybrid Shock');
                details = step.patternId
                    ? zappieText('steps.pattern_id', 'Pattern ID: {id}', { id: step.patternId })
                    : `${step.commandType || 'vibrate'} - ${step.intensity}% - ${step.durationMs}ms`;
                break;
            case 'delay':
                icon = '⏱️';
                label = zappieText('steps.type_delay_short', 'Delay');
                details = `${step.durationMs}ms`;
                break;
            case 'audio':
                icon = '🔊';
                label = zappieText('steps.type_audio', 'Audio/TTS');
                details = step.text || step.audioId || '';
                break;
            case 'webhook':
                icon = '🌐';
                label = zappieText('steps.type_webhook_short', 'Webhook');
                details = `${step.method || 'POST'} ${step.url || ''}`;
                break;
            case 'overlay':
                icon = '📺';
                label = zappieText('steps.type_overlay', 'Overlay');
                details = step.animationType || '';
                break;
        }
        
        return `
            <div class="card mb-2">
                <div class="card-body" style="padding: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${icon} ${escapeHtml(label)}</strong>
                            <p class="text-muted" style="margin: 0; font-size: 12px;">${escapeHtml(details)}</p>
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-secondary" onclick="window.openShock.editChainStep(${index})" aria-label="${escapeHtml(zappieText('accessibility.edit_step', 'Edit step {step}', { step: index + 1 }))}">✏️</button>
                            <button class="btn btn-sm btn-danger" onclick="window.openShock.removeChainStep(${index})" aria-label="${escapeHtml(zappieText('accessibility.delete_step', 'Delete step {step}', { step: index + 1 }))}">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Open step modal
 */
function openStepModal(stepIndex = null) {
    currentEditingStep = stepIndex !== null ? stepIndex : null;
    updateStepModalTitle();
    
    if (currentEditingStep !== null) {
        const step = chainSteps[currentEditingStep];
        document.getElementById('stepIndex').value = currentEditingStep;
        document.getElementById('stepTypeSelect').value = step.type;
        
        // Populate fields based on type
        updateStepFieldsVisibility(step.type);
        
        switch(step.type) {
            case 'openshock':
                if (step.patternId) document.getElementById('stepPatternId').value = step.patternId;
                if (step.commandType) document.getElementById('stepCommandType').value = step.commandType;
                if (step.deviceId) document.getElementById('stepDeviceId').value = step.deviceId;
                if (step.intensity) document.getElementById('stepIntensity').value = step.intensity;
                if (step.durationMs) document.getElementById('stepDurationMs').value = step.durationMs;
                break;
            case 'delay':
                if (step.durationMs) document.getElementById('delayDurationMs').value = step.durationMs;
                break;
            case 'audio':
                if (step.text) document.getElementById('audioText').value = step.text;
                break;
            case 'webhook':
                if (step.url) document.getElementById('webhookUrl').value = step.url;
                if (step.method) document.getElementById('webhookMethod').value = step.method;
                if (step.body) document.getElementById('webhookBody').value = JSON.stringify(step.body, null, 2);
                break;
            case 'overlay':
                if (step.animationType) document.getElementById('overlayAnimationType').value = step.animationType;
                if (step.duration) document.getElementById('overlayDuration').value = step.duration;
                break;
        }
    } else {
        document.getElementById('stepIndex').value = '';
        document.getElementById('stepTypeSelect').value = 'openshock';
        updateStepFieldsVisibility('openshock');
    }
    
    // Load pattern and device options
    updateStepPatternList();
    updateStepDeviceList();
    
    openModal('stepModal');
}

/**
 * Update step fields visibility based on type
 */
function updateStepFieldsVisibility(type) {
    const fields = ['openshockStepFields', 'delayStepFields', 'audioStepFields', 'webhookStepFields', 'overlayStepFields'];
    
    fields.forEach(fieldId => {
        const elem = document.getElementById(fieldId);
        if (elem) elem.style.display = 'none';
    });
    
    switch(type) {
        case 'openshock':
            const openshockFields = document.getElementById('openshockStepFields');
            if (openshockFields) openshockFields.style.display = 'block';
            break;
        case 'delay':
            const delayFields = document.getElementById('delayStepFields');
            if (delayFields) delayFields.style.display = 'block';
            break;
        case 'audio':
        case 'tts':
            const audioFields = document.getElementById('audioStepFields');
            if (audioFields) audioFields.style.display = 'block';
            break;
        case 'webhook':
            const webhookFields = document.getElementById('webhookStepFields');
            if (webhookFields) webhookFields.style.display = 'block';
            break;
        case 'overlay':
            const overlayFields = document.getElementById('overlayStepFields');
            if (overlayFields) overlayFields.style.display = 'block';
            break;
    }
}

/**
 * Update pattern list in step modal
 */
function updateStepPatternList() {
    const selector = document.getElementById('stepPatternId');
    if (!selector) return;

    const selectedValue = selector.value;
    selector.innerHTML = `<option value="">${escapeHtml(zappieText('steps.direct_command', '-- Direct Command --'))}</option>` +
        patterns.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    selector.value = selectedValue;
}

/**
 * Update device list in step modal
 */
function updateStepDeviceList() {
    const selector = document.getElementById('stepDeviceId');
    if (!selector) return;

    const selectedValue = selector.value;
    selector.innerHTML = `<option value="">${escapeHtml(zappieText('steps.first_available', '-- First Available --'))}</option>` +
        devices.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
    selector.value = selectedValue;
}

/**
 * Save chain step
 */
function saveChainStep() {
    const stepType = document.getElementById('stepTypeSelect').value;
    const stepData = { type: stepType };

    switch(stepType) {
        case 'openshock':
            stepData.patternId = document.getElementById('stepPatternId').value || null;
            stepData.commandType = document.getElementById('stepCommandType').value;
            stepData.deviceId = document.getElementById('stepDeviceId').value || null;
            stepData.intensity = parseInt(document.getElementById('stepIntensity').value);
            stepData.durationMs = parseInt(document.getElementById('stepDurationMs').value);
            break;
        case 'delay':
            stepData.durationMs = parseInt(document.getElementById('delayDurationMs').value);
            break;
        case 'audio':
        case 'tts':
            stepData.text = document.getElementById('audioText').value;
            break;
        case 'webhook':
            stepData.url = document.getElementById('webhookUrl').value;
            stepData.method = document.getElementById('webhookMethod').value;
            try {
                stepData.body = JSON.parse(document.getElementById('webhookBody').value);
            } catch (e) {
                showToast(TOAST_ERROR, zappieError('errors.invalid_webhook_json', 'Invalid JSON in webhook body: {error}', e.message));
                return;
            }
            break;
        case 'overlay':
            stepData.animationType = document.getElementById('overlayAnimationType').value;
            stepData.duration = parseInt(document.getElementById('overlayDuration').value);
            break;
    }

    const stepIndex = document.getElementById('stepIndex').value;
    if (stepIndex !== '') {
        chainSteps[parseInt(stepIndex)] = stepData;
    } else {
        chainSteps.push(stepData);
    }

    renderChainSteps();
    closeModal('stepModal');
}

/**
 * Edit chain step
 */
function editChainStep(index) {
    openStepModal(index);
}

/**
 * Remove chain step
 */
function removeChainStep(index) {
    if (!confirm(zappieText('steps.delete_confirm', 'Remove this step?'))) return;
    chainSteps.splice(index, 1);
    renderChainSteps();
}

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
    applyCurveTemplate,
    // ZappieHell functions
    editGoal,
    deleteGoal,
    resetGoal,
    editChain,
    deleteChain,
    testChain,
    editChainStep,
    removeChainStep
};

console.log('[Hybrid Shock] Plugin UI loaded and ready');
