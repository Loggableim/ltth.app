const socket = io();
let currentMappingId = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadConfig();
    loadStatus();
    loadMappings();
    setupEventHandlers();
    setupSocketHandlers();

    // Auto-refresh
    setInterval(loadStatus, 2000);
    setInterval(loadMappings, 10000);
});

// Tab-System
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`tab-${tab}`).classList.add('active');
        });
    });
}

// Config laden
async function loadConfig() {
    try {
        const response = await fetch('/api/hybridshock/config');
        const data = await response.json();

        if (data.success) {
            const config = data.data;
            document.getElementById('configHttpHost').value = config.httpHost;
            document.getElementById('configHttpPort').value = config.httpPort;
            document.getElementById('configWsHost').value = config.wsHost;
            document.getElementById('configWsPort').value = config.wsPort;
            document.getElementById('configMaxActionsPerSecond').value = config.maxActionsPerSecond;
            document.getElementById('configMaxQueueSize').value = config.maxQueueSize;
            document.getElementById('configMaxRetries').value = config.maxRetries;
            document.getElementById('configAutoConnect').checked = config.autoConnect;
            document.getElementById('configAutoReconnect').checked = config.autoReconnect;
            document.getElementById('configUseWebSocketForActions').checked = config.useWebSocketForActions || false;
            document.getElementById('configPreferWebSocket').checked = config.preferWebSocket || false;
            document.getElementById('configEnableDebugMode').checked = config.enableDebugMode;
        }
    } catch (error) {
        showToast('Failed to load config', 'error');
    }
}

// Status laden
async function loadStatus() {
    try {
        const response = await fetch('/api/hybridshock/status');
        const data = await response.json();

        if (data.success) {
            updateStatus(data.data);
        }
    } catch (error) {
        console.error('Failed to load status:', error);
    }
}

// Status aktualisieren
function updateStatus(status) {
    // Connection Status
    const statusEl = document.getElementById('connectionStatus');
    const isConnected = status.client?.connected;
    const isConnecting = status.client?.connecting;

    let statusClass = 'status-disconnected';
    let statusText = '⚫ Disconnected';

    if (isConnected) {
        statusClass = 'status-connected';
        statusText = '🟢 Connected';
    } else if (isConnecting) {
        statusClass = 'status-connecting';
        statusText = '🟡 Connecting...';
    }

    statusEl.innerHTML = `<div class="status-indicator ${statusClass}"><span class="status-dot"></span>${statusText}</div>`;

    // Queue Stats
    if (status.queue) {
        document.getElementById('queueSize').textContent = status.queue.queueSize || 0;
        document.getElementById('queueRate').textContent = `${status.queue.currentRate || 0}/s`;
        document.getElementById('queueProcessing').textContent = status.queue.processing ? 'Yes' : 'No';
        document.getElementById('queueAvgTime').textContent = `${status.queue.stats?.averageProcessingTime || 0}ms`;
    }

    // Overall Stats
    if (status.stats) {
        document.getElementById('statTikTokEvents').textContent = status.stats.tiktokEventsReceived || 0;
        document.getElementById('statActionsTriggered').textContent = status.stats.actionsTriggered || 0;

        const successRate = status.stats.actionsTriggered > 0
            ? ((status.stats.actionsTriggered - status.stats.actionsFailed) / status.stats.actionsTriggered * 100).toFixed(1)
            : 0;
        document.getElementById('statSuccessRate').textContent = `${successRate}%`;

        const uptime = status.stats.uptime || 0;
        document.getElementById('statUptime').textContent = formatDuration(uptime);
    }
}

// Mappings laden
async function loadMappings() {
    try {
        const response = await fetch('/api/hybridshock/mappings');
        const data = await response.json();

        if (data.success) {
            renderMappings(data.data);
        }
    } catch (error) {
        console.error('Failed to load mappings:', error);
    }
}

// Mappings rendern
function renderMappings(mappings) {
    const container = document.getElementById('mappingsList');

    if (mappings.length === 0) {
        container.innerHTML = '<p class="text-gray-400">No mappings created yet. Click "Create Mapping" to get started.</p>';
        return;
    }

    container.innerHTML = mappings.map(mapping => `
        <div class="mapping-card ${mapping.enabled ? '' : 'disabled'}">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <h3 class="font-semibold text-lg">${mapping.name}</h3>
                    ${mapping.description ? `<p class="text-sm text-gray-400 mt-1">${mapping.description}</p>` : ''}
                </div>
                <div class="flex gap-2">
                    <button data-action="toggle-mapping" data-mapping-id="${mapping.id}" data-enabled="${!mapping.enabled}" class="btn-secondary text-sm px-3 py-1">
                        ${mapping.enabled ? '🔴 Disable' : '🟢 Enable'}
                    </button>
                    <button data-action="edit-mapping" data-mapping-id="${mapping.id}" class="btn-primary text-sm px-3 py-1">✏️ Edit</button>
                    <button data-action="delete-mapping" data-mapping-id="${mapping.id}" class="btn-danger text-sm px-3 py-1">🗑️</button>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4 mt-4 text-sm">
                <div>
                    <span class="text-gray-400">TikTok Event:</span>
                    <span class="ml-2 font-medium">${mapping.tiktokEventType}</span>
                </div>
                <div>
                    <span class="text-gray-400">HybridShock Action:</span>
                    <span class="ml-2 font-medium">${mapping.hybridshockCategory}/${mapping.hybridshockAction}</span>
                </div>
                ${mapping.delay > 0 ? `<div><span class="text-gray-400">Delay:</span> <span class="ml-2">${mapping.delay}ms</span></div>` : ''}
                ${mapping.cooldown > 0 ? `<div><span class="text-gray-400">Cooldown:</span> <span class="ml-2">${mapping.cooldown}ms</span></div>` : ''}
                ${mapping.priority > 0 ? `<div><span class="text-gray-400">Priority:</span> <span class="ml-2">${mapping.priority}</span></div>` : ''}
            </div>
        </div>
    `).join('');
}

// Event-Handlers
function setupEventHandlers() {
    // Start/Stop
    document.getElementById('btnStart').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/hybridshock/start', { method: 'POST' });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to start plugin');
            }
            showToast('Plugin started', 'success');
        } catch (error) {
            showToast(`Failed to start: ${error.message}`, 'error');
        }
    });

    document.getElementById('btnStop').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/hybridshock/stop', { method: 'POST' });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to stop plugin');
            }
            showToast('Plugin stopped', 'success');
        } catch (error) {
            showToast(`Failed to stop: ${error.message}`, 'error');
        }
    });

    document.getElementById('btnRestart').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/hybridshock/restart', { method: 'POST' });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to restart plugin');
            }
            showToast('Plugin restarting...', 'info');
        } catch (error) {
            showToast(`Failed to restart: ${error.message}`, 'error');
        }
    });

    document.getElementById('btnTestConnection').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/hybridshock/test');
            const data = await response.json();

            if (data.success && data.data.http) {
                showToast('✅ Connection successful!', 'success');
            } else {
                showToast('❌ Connection failed', 'error');
            }
        } catch (error) {
            showToast('❌ Connection test failed', 'error');
        }
    });

    // Save Config
    document.getElementById('btnSaveConfig').addEventListener('click', async () => {
        const config = {
            httpHost: document.getElementById('configHttpHost').value,
            httpPort: parseInt(document.getElementById('configHttpPort').value),
            wsHost: document.getElementById('configWsHost').value,
            wsPort: parseInt(document.getElementById('configWsPort').value),
            maxActionsPerSecond: parseInt(document.getElementById('configMaxActionsPerSecond').value),
            maxQueueSize: parseInt(document.getElementById('configMaxQueueSize').value),
            maxRetries: parseInt(document.getElementById('configMaxRetries').value),
            autoConnect: document.getElementById('configAutoConnect').checked,
            autoReconnect: document.getElementById('configAutoReconnect').checked,
            useWebSocketForActions: document.getElementById('configUseWebSocketForActions').checked,
            preferWebSocket: document.getElementById('configPreferWebSocket').checked,
            enableDebugMode: document.getElementById('configEnableDebugMode').checked
        };

        try {
            const response = await fetch('/api/hybridshock/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to save configuration');
            }

            showToast('Configuration saved!', 'success');
        } catch (error) {
            showToast(`Failed to save config: ${error.message}`, 'error');
        }
    });

    // Create Mapping
    document.getElementById('btnCreateMapping').addEventListener('click', () => {
        currentMappingId = null;
        document.getElementById('mappingModalTitle').textContent = 'Create Event Mapping';
        clearMappingForm();
        showModal('mappingModal');
    });

    // Save Mapping
    document.getElementById('btnSaveMapping').addEventListener('click', saveMapping);

    // Cancel Mapping
    document.getElementById('btnCancelMapping').addEventListener('click', () => {
        hideModal('mappingModal');
    });

    // Export Mappings
    document.getElementById('btnExportMappings').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/hybridshock/mappings/export');
            const data = await response.json();

            const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hybridshock-mappings-${Date.now()}.json`;
            a.click();

            showToast('Mappings exported!', 'success');
        } catch (error) {
            showToast('Export failed', 'error');
        }
    });

    // Debug: Trigger Action
    document.getElementById('btnTriggerAction').addEventListener('click', async () => {
        const category = document.getElementById('debugCategory').value;
        const action = document.getElementById('debugAction').value;
        const contextText = document.getElementById('debugContext').value;

        let context = {};
        try {
            if (contextText) {
                context = JSON.parse(contextText);
            }
        } catch (error) {
            showToast('Invalid JSON in context', 'error');
            return;
        }

        try {
            await fetch('/api/hybridshock/action/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, action, context })
            });
            showToast('Action triggered!', 'success');
        } catch (error) {
            showToast('Failed to trigger action', 'error');
        }
    });

    // Load Features
    document.getElementById('btnLoadFeatures').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/hybridshock/features');
            const data = await response.json();

            if (data.success) {
                const container = document.getElementById('featuresDisplay');
                container.innerHTML = `
                    <div class="space-y-4">
                        <div>
                            <h4 class="font-semibold mb-2">Categories</h4>
                            <pre class="bg-gray-800 p-4 rounded text-xs overflow-x-auto">${JSON.stringify(data.data.categories, null, 2)}</pre>
                        </div>
                        <div>
                            <h4 class="font-semibold mb-2">Actions</h4>
                            <pre class="bg-gray-800 p-4 rounded text-xs overflow-x-auto">${JSON.stringify(data.data.actions, null, 2)}</pre>
                        </div>
                        <div>
                            <h4 class="font-semibold mb-2">Events</h4>
                            <pre class="bg-gray-800 p-4 rounded text-xs overflow-x-auto">${JSON.stringify(data.data.events, null, 2)}</pre>
                        </div>
                    </div>
                `;
                showToast('Features loaded!', 'success');
            }
        } catch (error) {
            showToast('Failed to load features', 'error');
        }
    });

    // Refresh Logs
    document.getElementById('btnRefreshEventLogs').addEventListener('click', loadEventLogs);
    document.getElementById('btnRefreshActionLogs').addEventListener('click', loadActionLogs);
}

// Socket.IO Handlers
function setupSocketHandlers() {
    socket.on('hybridshock:status', (status) => {
        updateStatus(status);
    });

    socket.on('hybridshock:tiktok-event', (event) => {
        console.log('TikTok Event:', event);
    });

    socket.on('hybridshock:event', (event) => {
        console.log('HybridShock Event:', event);
    });
}

// Mapping Functions
async function saveMapping() {
    const mapping = {
        name: document.getElementById('mappingName').value,
        description: document.getElementById('mappingDescription').value,
        tiktokEventType: document.getElementById('mappingTikTokEvent').value,
        hybridshockCategory: document.getElementById('mappingCategory').value,
        hybridshockAction: document.getElementById('mappingAction').value,
        delay: parseInt(document.getElementById('mappingDelay').value) || 0,
        cooldown: parseInt(document.getElementById('mappingCooldown').value) || 0,
        priority: parseInt(document.getElementById('mappingPriority').value) || 0,
        enabled: document.getElementById('mappingEnabled').checked
    };

    // Context Template
    const contextText = document.getElementById('mappingContextTemplate').value;
    try {
        mapping.contextTemplate = contextText ? JSON.parse(contextText) : {};
    } catch (error) {
        showToast('Invalid JSON in context template', 'error');
        return;
    }

    try {
        const url = currentMappingId
            ? `/api/hybridshock/mappings/${currentMappingId}`
            : '/api/hybridshock/mappings';
        const method = currentMappingId ? 'PUT' : 'POST';

        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mapping)
        });

        hideModal('mappingModal');
        loadMappings();
        showToast('Mapping saved!', 'success');
    } catch (error) {
        showToast('Failed to save mapping', 'error');
    }
}

async function editMapping(id) {
    try {
        const response = await fetch('/api/hybridshock/mappings');
        const data = await response.json();

        if (data.success) {
            const mapping = data.data.find(m => m.id === id);
            if (mapping) {
                currentMappingId = id;
                document.getElementById('mappingModalTitle').textContent = 'Edit Event Mapping';
                document.getElementById('mappingName').value = mapping.name;
                document.getElementById('mappingDescription').value = mapping.description || '';
                document.getElementById('mappingTikTokEvent').value = mapping.tiktokEventType;
                document.getElementById('mappingCategory').value = mapping.hybridshockCategory;
                document.getElementById('mappingAction').value = mapping.hybridshockAction;
                document.getElementById('mappingContextTemplate').value = JSON.stringify(mapping.contextTemplate, null, 2);
                document.getElementById('mappingDelay').value = mapping.delay;
                document.getElementById('mappingCooldown').value = mapping.cooldown;
                document.getElementById('mappingPriority').value = mapping.priority;
                document.getElementById('mappingEnabled').checked = mapping.enabled;
                showModal('mappingModal');
            }
        }
    } catch (error) {
        showToast('Failed to load mapping', 'error');
    }
}

async function deleteMapping(id) {
    if (!confirm('Are you sure you want to delete this mapping?')) {
        return;
    }

    try {
        await fetch(`/api/hybridshock/mappings/${id}`, { method: 'DELETE' });
        loadMappings();
        showToast('Mapping deleted!', 'success');
    } catch (error) {
        showToast('Failed to delete mapping', 'error');
    }
}

async function toggleMapping(id, enabled) {
    try {
        const response = await fetch('/api/hybridshock/mappings');
        const data = await response.json();

        if (data.success) {
            const mapping = data.data.find(m => m.id === id);
            if (mapping) {
                mapping.enabled = enabled;
                await fetch(`/api/hybridshock/mappings/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mapping)
                });
                loadMappings();
                showToast(`Mapping ${enabled ? 'enabled' : 'disabled'}!`, 'success');
            }
        }
    } catch (error) {
        showToast('Failed to toggle mapping', 'error');
    }
}

function clearMappingForm() {
    document.getElementById('mappingName').value = '';
    document.getElementById('mappingDescription').value = '';
    document.getElementById('mappingCategory').value = '';
    document.getElementById('mappingAction').value = '';
    document.getElementById('mappingContextTemplate').value = '';
    document.getElementById('mappingDelay').value = '0';
    document.getElementById('mappingCooldown').value = '0';
    document.getElementById('mappingPriority').value = '0';
    document.getElementById('mappingEnabled').checked = true;
}

// Logs
async function loadEventLogs() {
    try {
        const response = await fetch('/api/hybridshock/logs/events?limit=50');
        const data = await response.json();

        if (data.success) {
            const container = document.getElementById('eventLogsList');
            container.innerHTML = data.data.map(log => {
                const eventData = JSON.parse(log.event_data);
                return `
                    <div class="log-entry info">
                        <div class="flex justify-between mb-2">
                            <span class="font-semibold">${log.event_type} (${log.event_source})</span>
                            <span class="text-xs text-gray-400">${new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                        <pre class="text-xs text-gray-300">${JSON.stringify(eventData, null, 2)}</pre>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Failed to load event logs:', error);
    }
}

async function loadActionLogs() {
    try {
        const response = await fetch('/api/hybridshock/logs/actions?limit=50');
        const data = await response.json();

        if (data.success) {
            const container = document.getElementById('actionLogsList');
            container.innerHTML = data.data.map(log => {
                return `
                    <div class="log-entry ${log.status}">
                        <div class="flex justify-between mb-2">
                            <span class="font-semibold">${log.category}/${log.action}</span>
                            <span class="text-xs text-gray-400">${new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                        <div class="text-xs">
                            <div>Status: <span class="font-medium">${log.status}</span></div>
                            ${log.processing_time ? `<div>Processing Time: ${log.processing_time}ms</div>` : ''}
                            ${log.error_message ? `<div class="text-red-400">Error: ${log.error_message}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Failed to load action logs:', error);
    }
}

// Utilities
function showModal(id) {
    document.getElementById(id).classList.add('active');
}

function hideModal(id) {
    document.getElementById(id).classList.remove('active');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="flex items-center gap-3">
            <span class="text-2xl">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
    return `${Math.floor(ms / 3600000)}h`;
}

// Event delegation for dynamically created mapping buttons
document.getElementById('mappingsList').addEventListener('click', function(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    
    const action = button.dataset.action;
    const mappingId = parseInt(button.dataset.mappingId);
    
    switch(action) {
        case 'toggle-mapping':
            const enabled = button.dataset.enabled === 'true';
            toggleMapping(mappingId, enabled);
            break;
        case 'edit-mapping':
            editMapping(mappingId);
            break;
        case 'delete-mapping':
            deleteMapping(mappingId);
            break;
    }
});
