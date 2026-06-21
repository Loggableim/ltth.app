/**
 * Minecraft Connect Dashboard JavaScript
 */

(function() {
    'use strict';

    // State
    let socket = null;
    let availableActions = [];
    let mappings = [];
    let currentMapping = null;
    let stats = {
        totalEvents: 0,
        totalActions: 0,
        successfulActions: 0,
        failedActions: 0
    };

    // Initialize
    function init() {
        console.log('[Minecraft Connect] Initializing dashboard...');
        
        // Connect to Socket.IO
        connectSocket();
        
        // Set up event listeners
        setupEventListeners();
        
        // Load initial data
        loadStatus();
        loadMappings();
        loadSettings();
    }

    // Connect to Socket.IO
    function connectSocket() {
        socket = io();
        
        socket.on('connect', () => {
            console.log('[Minecraft Connect] Socket connected');
            socket.emit('minecraft-connect:get-status');
            socket.emit('minecraft-connect:get-mappings');
        });

        socket.on('minecraft-connect:status-changed', (data) => {
            updateStatus(data);
        });

        socket.on('minecraft-connect:actions-updated', (data) => {
            availableActions = data.availableActions || [];
            renderActions();
            updateActionDropdown();
        });

        socket.on('minecraft-connect:event-log', (event) => {
            addEventToLog(event);
        });

        socket.on('minecraft-connect:mappings', (data) => {
            mappings = data.mappings || [];
            renderMappings();
        });

        socket.on('minecraft-connect:action-result', (result) => {
            console.log('[Minecraft Connect] Action result:', result);
        });
    }

    // Set up event listeners
    function setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.mc-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                switchTab(tab.dataset.tab);
            });
        });

        // Add mapping button
        document.getElementById('addMappingBtn').addEventListener('click', () => {
            openMappingModal();
        });

        // Modal buttons
        document.getElementById('modalClose').addEventListener('click', closeMappingModal);
        document.getElementById('modalCancel').addEventListener('click', closeMappingModal);
        document.getElementById('modalSave').addEventListener('click', saveMappingFromModal);

        // Test action button
        document.getElementById('testActionBtn').addEventListener('click', () => {
            testAction();
        });

        // Clear events button
        document.getElementById('clearEventsBtn').addEventListener('click', () => {
            document.getElementById('eventsList').innerHTML = `
                <div class="mc-empty-state">
                    <p>No events yet.</p>
                    <p class="mc-text-muted">Events will appear here when TikTok events trigger Minecraft actions.</p>
                </div>
            `;
        });

        // Save settings button
        document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

        // Add condition button
        document.getElementById('addConditionBtn').addEventListener('click', addCondition);

        // Action select change
        document.getElementById('mappingAction').addEventListener('change', updateParametersForm);
    }

    // Switch tab
    function switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.mc-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab panels
        document.querySelectorAll('.mc-tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    // Load status
    async function loadStatus() {
        try {
            const response = await fetch('/api/minecraft-connect/status');
            const data = await response.json();
            
            if (data.success) {
                updateStatus(data.status);
                availableActions = data.status.availableActions || [];
                renderActions();
                updateActionDropdown();
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to load status:', error);
        }
    }

    // Update status display
    function updateStatus(status) {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        
        statusDot.className = 'mc-status-dot';
        
        if (status.isConnected) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
        } else if (status.connectionStatus === 'Waiting') {
            statusDot.classList.add('waiting');
            statusText.textContent = 'Waiting for Minecraft';
        } else {
            statusText.textContent = 'Disconnected';
        }

        // Update stats
        if (status.stats) {
            stats = status.stats;
            updateStatsDisplay();
        }

        // Update test button
        const testBtn = document.getElementById('testActionBtn');
        testBtn.disabled = !status.isConnected;
    }

    // Update stats display
    function updateStatsDisplay() {
        document.getElementById('statTotalEvents').textContent = stats.totalEvents || 0;
        document.getElementById('statTotalActions').textContent = stats.totalActions || 0;
        document.getElementById('statSuccessful').textContent = stats.successfulActions || 0;
        document.getElementById('statFailed').textContent = stats.failedActions || 0;
    }

    // Load mappings
    async function loadMappings() {
        try {
            const response = await fetch('/api/minecraft-connect/mappings');
            const data = await response.json();
            
            if (data.success) {
                mappings = data.mappings || [];
                renderMappings();
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to load mappings:', error);
        }
    }

    // Render mappings
    function renderMappings() {
        const container = document.getElementById('mappingsList');
        
        if (mappings.length === 0) {
            container.innerHTML = `
                <div class="mc-empty-state">
                    <p>No action mappings configured yet.</p>
                    <p class="mc-text-muted">Click "Add Mapping" to create your first TikTok → Minecraft action mapping.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = mappings.map(mapping => `
            <div class="mc-mapping-card">
                <div class="mc-mapping-header">
                    <div class="mc-mapping-title">
                        <span class="mc-mapping-badge ${mapping.trigger}">${mapping.trigger}</span>
                        <span class="mc-mapping-arrow">→</span>
                        <span>${mapping.action}</span>
                    </div>
                    <div class="mc-mapping-actions">
                        <button class="mc-btn mc-btn-secondary mc-btn-small" onclick="editMapping('${mapping.id}')">Edit</button>
                        <button class="mc-btn mc-btn-danger mc-btn-small" onclick="deleteMapping('${mapping.id}')">Delete</button>
                    </div>
                </div>
                <div class="mc-mapping-body">
                    ${renderMappingDetails(mapping)}
                </div>
            </div>
        `).join('');
    }

    // Render mapping details
    function renderMappingDetails(mapping) {
        let html = '';
        
        if (mapping.conditions && mapping.conditions.length > 0) {
            html += '<div class="mc-mapping-conditions">';
            html += '<strong>Conditions:</strong> ';
            html += mapping.conditions.map(c => 
                `${c.field} ${c.operator} ${c.value}`
            ).join(', ');
            html += '</div>';
        }

        if (mapping.params && Object.keys(mapping.params).length > 0) {
            html += '<div style="margin-top: 8px; font-size: 13px;">';
            html += '<strong>Parameters:</strong> ';
            html += Object.entries(mapping.params).map(([key, value]) => 
                `${key}: ${JSON.stringify(value)}`
            ).join(', ');
            html += '</div>';
        }

        return html || '<span class="mc-text-muted">No additional configuration</span>';
    }

    // Render available actions
    function renderActions() {
        const container = document.getElementById('actionsList');
        
        if (availableActions.length === 0) {
            container.innerHTML = `
                <div class="mc-empty-state">
                    <p>No Minecraft connection detected.</p>
                    <p class="mc-text-muted">Install and run the TikStreamLink Fabric mod to see available actions.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = availableActions.map(action => `
            <div class="mc-action-card">
                <div class="mc-action-name">${action.name}</div>
                <div class="mc-action-params">
                    ${(action.params || []).map(param => 
                        `<span class="mc-param-badge">${param}</span>`
                    ).join('')}
                </div>
            </div>
        `).join('');
    }

    // Update action dropdown
    function updateActionDropdown() {
        const select = document.getElementById('mappingAction');
        const currentValue = select.value;
        
        select.innerHTML = '<option value="">Select action...</option>' +
            availableActions.map(action => 
                `<option value="${action.name}">${action.name}</option>`
            ).join('');
        
        if (currentValue) {
            select.value = currentValue;
        }
    }

    // Open mapping modal
    function openMappingModal(mapping = null) {
        currentMapping = mapping;
        const modal = document.getElementById('mappingModal');
        const title = document.getElementById('modalTitle');
        
        if (mapping) {
            title.textContent = 'Edit Action Mapping';
            fillMappingForm(mapping);
        } else {
            title.textContent = 'Add Action Mapping';
            resetMappingForm();
        }
        
        modal.classList.add('active');
    }

    // Close mapping modal
    function closeMappingModal() {
        document.getElementById('mappingModal').classList.remove('active');
        currentMapping = null;
    }

    // Reset mapping form
    function resetMappingForm() {
        document.getElementById('mappingTrigger').value = '';
        document.getElementById('mappingAction').value = '';
        document.getElementById('mappingEnabled').checked = true;
        document.getElementById('conditionsList').innerHTML = '';
        document.getElementById('parametersList').innerHTML = '';
        document.getElementById('parametersGroup').style.display = 'none';
    }

    // Fill mapping form
    function fillMappingForm(mapping) {
        document.getElementById('mappingTrigger').value = mapping.trigger || '';
        document.getElementById('mappingAction').value = mapping.action || '';
        document.getElementById('mappingEnabled').checked = mapping.enabled !== false;
        
        // Fill conditions
        const conditionsList = document.getElementById('conditionsList');
        conditionsList.innerHTML = '';
        if (mapping.conditions) {
            mapping.conditions.forEach(condition => {
                addCondition(condition);
            });
        }
        
        // Update parameters form
        updateParametersForm();
        
        // Fill parameters
        if (mapping.params) {
            for (const [key, value] of Object.entries(mapping.params)) {
                const input = document.querySelector(`[data-param="${key}"]`);
                if (input) {
                    input.value = value;
                }
            }
        }
    }

    // Add condition
    function addCondition(condition = null) {
        const container = document.getElementById('conditionsList');
        const conditionId = Date.now();
        
        const conditionHtml = `
            <div class="mc-condition" data-condition-id="${conditionId}">
                <input type="text" class="mc-input mc-condition-field" placeholder="Field (e.g., giftName)" 
                    value="${condition ? condition.field : ''}" data-role="field">
                <select class="mc-input mc-condition-operator" data-role="operator">
                    <option value="equals" ${condition?.operator === 'equals' ? 'selected' : ''}>Equals</option>
                    <option value="not_equals" ${condition?.operator === 'not_equals' ? 'selected' : ''}>Not Equals</option>
                    <option value="greater_than" ${condition?.operator === 'greater_than' ? 'selected' : ''}>Greater Than</option>
                    <option value="less_than" ${condition?.operator === 'less_than' ? 'selected' : ''}>Less Than</option>
                    <option value="contains" ${condition?.operator === 'contains' ? 'selected' : ''}>Contains</option>
                </select>
                <input type="text" class="mc-input mc-condition-value" placeholder="Value" 
                    value="${condition ? condition.value : ''}" data-role="value">
                <button class="mc-condition-remove" onclick="removeCondition(${conditionId})">✕</button>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', conditionHtml);
    }

    // Remove condition
    window.removeCondition = function(conditionId) {
        const condition = document.querySelector(`[data-condition-id="${conditionId}"]`);
        if (condition) {
            condition.remove();
        }
    };

    // Update parameters form
    function updateParametersForm() {
        const actionName = document.getElementById('mappingAction').value;
        const parametersGroup = document.getElementById('parametersGroup');
        const parametersList = document.getElementById('parametersList');
        
        if (!actionName) {
            parametersGroup.style.display = 'none';
            return;
        }

        const action = availableActions.find(a => a.name === actionName);
        if (!action || !action.params || action.params.length === 0) {
            parametersGroup.style.display = 'none';
            return;
        }

        parametersGroup.style.display = 'block';
        
        parametersList.innerHTML = action.params.map(param => `
            <div class="mc-form-group">
                <label>${param}</label>
                <input type="text" class="mc-input" data-param="${param}" placeholder="Enter value or use {placeholder}">
            </div>
        `).join('');
    }

    // Save mapping from modal
    async function saveMappingFromModal() {
        const trigger = document.getElementById('mappingTrigger').value;
        const action = document.getElementById('mappingAction').value;
        const enabled = document.getElementById('mappingEnabled').checked;
        
        if (!trigger || !action) {
            alert('Please select a trigger and action');
            return;
        }

        // Collect conditions
        const conditions = [];
        document.querySelectorAll('.mc-condition').forEach(conditionEl => {
            const field = conditionEl.querySelector('[data-role="field"]').value;
            const operator = conditionEl.querySelector('[data-role="operator"]').value;
            const value = conditionEl.querySelector('[data-role="value"]').value;
            
            if (field && value) {
                conditions.push({ field, operator, value });
            }
        });

        // Collect parameters
        const params = {};
        document.querySelectorAll('[data-param]').forEach(input => {
            const param = input.dataset.param;
            const value = input.value;
            if (value) {
                params[param] = value;
            }
        });

        const mapping = {
            trigger,
            action,
            conditions,
            params,
            enabled
        };

        try {
            let response;
            if (currentMapping) {
                response = await fetch(`/api/minecraft-connect/mappings/${currentMapping.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mapping)
                });
            } else {
                response = await fetch('/api/minecraft-connect/mappings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mapping)
                });
            }

            const data = await response.json();
            
            if (data.success) {
                mappings = data.mappings;
                renderMappings();
                closeMappingModal();
            } else {
                alert('Failed to save mapping: ' + data.error);
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to save mapping:', error);
            alert('Failed to save mapping');
        }
    }

    // Edit mapping
    window.editMapping = function(id) {
        const mapping = mappings.find(m => m.id === id);
        if (mapping) {
            openMappingModal(mapping);
        }
    };

    // Delete mapping
    window.deleteMapping = async function(id) {
        if (!confirm('Are you sure you want to delete this mapping?')) {
            return;
        }

        try {
            const response = await fetch(`/api/minecraft-connect/mappings/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            
            if (data.success) {
                mappings = data.mappings;
                renderMappings();
            } else {
                alert('Failed to delete mapping: ' + data.error);
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to delete mapping:', error);
            alert('Failed to delete mapping');
        }
    };

    // Test action
    async function testAction() {
        const actionName = prompt('Enter action name:');
        if (!actionName) return;

        try {
            const response = await fetch('/api/minecraft-connect/test-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: actionName,
                    params: {}
                })
            });

            const data = await response.json();
            
            if (data.success) {
                alert('Action queued successfully');
            } else {
                alert('Failed to queue action: ' + data.error);
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to test action:', error);
            alert('Failed to test action');
        }
    }

    // Add event to log
    function addEventToLog(event) {
        const container = document.getElementById('eventsList');
        
        // Remove empty state if present
        const emptyState = container.querySelector('.mc-empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const eventHtml = `
            <div class="mc-event-item">
                <div class="mc-event-info">
                    <div class="mc-event-type">${event.type}</div>
                    <div class="mc-event-details">${event.actions} action(s) triggered</div>
                </div>
                <div class="mc-event-time">${new Date(event.timestamp).toLocaleTimeString()}</div>
            </div>
        `;
        
        container.insertAdjacentHTML('afterbegin', eventHtml);
    }

    // Load settings
    async function loadSettings() {
        // Settings are loaded with config, just update UI
        updateStatsDisplay();
    }

    // Save settings
    async function saveSettings() {
        const config = {
            websocket: {
                port: parseInt(document.getElementById('wsPort').value),
                heartbeatInterval: parseInt(document.getElementById('wsHeartbeat').value)
            },
            limits: {
                maxActionsPerMinute: parseInt(document.getElementById('maxActionsPerMin').value),
                commandCooldown: parseInt(document.getElementById('commandCooldown').value),
                maxQueueSize: parseInt(document.getElementById('maxQueueSize').value)
            },
            overlay: {
                enabled: document.getElementById('overlayEnabled').checked,
                showUsername: document.getElementById('overlayShowUsername').checked,
                showAction: document.getElementById('overlayShowAction').checked,
                animationDuration: parseInt(document.getElementById('overlayDuration').value)
            }
        };

        try {
            const response = await fetch('/api/minecraft-connect/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const data = await response.json();
            
            if (data.success) {
                alert('Settings saved successfully! Please restart the server to apply WebSocket changes.');
            } else {
                alert('Failed to save settings: ' + data.error);
            }
        } catch (error) {
            console.error('[Minecraft Connect] Failed to save settings:', error);
            alert('Failed to save settings');
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
