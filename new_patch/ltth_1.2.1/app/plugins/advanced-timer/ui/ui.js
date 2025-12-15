/**
 * Advanced Timer Plugin UI
 * Client-side JavaScript for timer management interface
 */

const socket = io();
let timers = [];
let currentEditingTimer = null;
let giftCatalog = [];
let editingEventId = null;

// Handler function references for proper cleanup
let timerNameEnterHandler = null;
let conditionsKeypressHandler = null;
let eventListDelegationAttached = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for global i18n to be ready (initialized by i18n-client.js)
    if (!window.i18n.initialized) {
        await window.i18n.init();
    }
    
    // Listen for language changes
    window.i18n.onLanguageChange((newLocale) => {
        console.log('Language changed to:', newLocale);
        // Re-render UI with new language
        renderTimers();
    });
    
    // Also listen for language changes via socket (for real-time sync)
    socket.on('locale-changed', async (newLocale) => {
        console.log('Locale changed via socket:', newLocale);
        await window.i18n.changeLanguage(newLocale);
        renderTimers();
    });
    
    // Setup event listeners
    setupEventListeners();
    
    loadTimers();
    loadGiftCatalog();
    setupSocketListeners();
});

/**
 * Setup UI event listeners
 */
function setupEventListeners() {
    // Navigation buttons (sidebar)
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.currentTarget.getAttribute('data-tab');
            showTab(tabName, e.currentTarget);
        });
    });
    
    // New Timer button in timers tab
    const newTimerBtn = document.querySelector('#tab-timers .btn-primary[data-tab="create"]');
    if (newTimerBtn) {
        newTimerBtn.addEventListener('click', (e) => {
            showTab('create', e.currentTarget);
        });
    }
    
    // Timer form submission
    const timerForm = document.getElementById('timer-form');
    if (timerForm) {
        timerForm.addEventListener('submit', handleCreateTimer);
    }
    
    // Timer mode change
    const timerModeSelect = document.getElementById('timer-mode');
    if (timerModeSelect) {
        timerModeSelect.addEventListener('change', handleModeChange);
    }
    
    // Cancel button in create form
    const cancelBtn = document.querySelector('#tab-create .btn-secondary[data-tab="timers"]');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            showTab('timers', e.currentTarget);
        });
    }
    
    // Settings modal tabs
    document.querySelectorAll('#timer-settings-modal .tab[data-settings-tab]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.currentTarget.getAttribute('data-settings-tab');
            showSettingsTab(tabName, e.currentTarget);
        });
    });
    
    // Settings modal buttons
    const saveSettingsBtn = document.getElementById('save-timer-settings');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveTimerSettings);
    }
    
    const closeModalBtn = document.getElementById('close-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }
    
    const addEventBtn = document.getElementById('add-timer-event');
    if (addEventBtn) {
        addEventBtn.addEventListener('click', addTimerEvent);
    }
    
    const copyUrlBtn = document.getElementById('copy-overlay-url');
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', copyOverlayURL);
    }
    
    const exportLogsBtn = document.getElementById('export-logs');
    if (exportLogsBtn) {
        exportLogsBtn.addEventListener('click', exportLogs);
    }
}

/**
 * Setup Socket.IO listeners for real-time updates
 */
function setupSocketListeners() {
    // Timer events
    socket.on('advanced-timer:tick', (data) => {
        updateTimerDisplay(data);
    });

    socket.on('advanced-timer:started', (data) => {
        refreshTimerState(data.id);
    });

    socket.on('advanced-timer:paused', (data) => {
        refreshTimerState(data.id);
    });

    socket.on('advanced-timer:stopped', (data) => {
        refreshTimerState(data.id);
    });

    socket.on('advanced-timer:completed', (data) => {
        refreshTimerState(data.id);
        showNotification('Timer Completed', `${getTimerName(data.id)} has completed!`);
    });

    socket.on('advanced-timer:time-added', (data) => {
        refreshTimerState(data.id);
    });

    socket.on('advanced-timer:time-removed', (data) => {
        refreshTimerState(data.id);
    });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Load all timers from server
 */
async function loadTimers() {
    try {
        const response = await fetch('/api/advanced-timer/timers');
        const data = await response.json();
        
        if (data.success) {
            timers = data.timers;
            renderTimers();
        }
    } catch (error) {
        console.error('Error loading timers:', error);
        showNotification('Error', 'Failed to load timers', 'error');
    }
}

/**
 * Load gift catalog from server
 */
async function loadGiftCatalog() {
    try {
        const response = await fetch('/api/gift-catalog');
        const data = await response.json();
        
        if (data.success) {
            giftCatalog = data.catalog || [];
            console.log(`Loaded ${giftCatalog.length} gifts from catalog`);
        }
    } catch (error) {
        console.error('Error loading gift catalog:', error);
        giftCatalog = [];
    }
}

/**
 * Render timers list
 */
function renderTimers() {
    const container = document.getElementById('timers-container');
    
    // Helper to get translation safely
    const t = (key, fallback) => {
        if (!window.i18n || !window.i18n.initialized) return fallback;
        const trans = window.i18n.t(key);
        return trans === key ? fallback : trans;
    };
    
    if (timers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⏱️</div>
                <div class="empty-state-text">${t('ui.messages.noTimers', 'No timers yet')}</div>
                <button class="btn btn-primary" data-tab="create">${t('ui.messages.createFirst', 'Create Your First Timer')}</button>
            </div>
        `;
        
        // Add event listener to the create button
        const createBtn = container.querySelector('button[data-tab="create"]');
        if (createBtn) {
            createBtn.addEventListener('click', (e) => {
                showTab('create', e.currentTarget);
            });
        }
        return;
    }

    container.innerHTML = timers.map(timer => `
        <div class="timer-card" id="timer-${timer.id}">
            <div class="timer-header">
                <div>
                    <div class="timer-title">${escapeHtml(timer.name)}</div>
                    <span class="timer-mode-badge">${getModeLabel(timer.mode)}</span>
                </div>
                <div>
                    <span class="timer-state state-${timer.state}">${getStateLabel(timer.state)}</span>
                </div>
            </div>

            <div class="timer-display ${timer.state === 'running' ? 'running' : ''}" id="timer-display-${timer.id}">
                ${formatTime(timer.current_value)}
            </div>

            <div class="timer-controls">
                ${timer.state === 'stopped' || timer.state === 'paused' || timer.state === 'completed' ? 
                    `<button class="btn btn-success btn-sm" data-action="start" data-timer-id="${timer.id}">▶️ ${t('ui.buttons.start', 'Start')}</button>` : ''}
                ${timer.state === 'running' ? 
                    `<button class="btn btn-warning btn-sm" data-action="pause" data-timer-id="${timer.id}">⏸️ ${t('ui.buttons.pause', 'Pause')}</button>` : ''}
                ${timer.state === 'running' || timer.state === 'paused' ? 
                    `<button class="btn btn-danger btn-sm" data-action="stop" data-timer-id="${timer.id}">⏹️ ${t('ui.buttons.stop', 'Stop')}</button>` : ''}
                <button class="btn btn-secondary btn-sm" data-action="reset" data-timer-id="${timer.id}">🔄 ${t('ui.buttons.reset', 'Reset')}</button>
                <button class="btn btn-secondary btn-sm" data-action="settings" data-timer-id="${timer.id}">⚙️ ${t('ui.buttons.settings', 'Settings')}</button>
                <button class="btn btn-danger btn-sm" data-action="delete" data-timer-id="${timer.id}">🗑️ ${t('ui.buttons.delete', 'Delete')}</button>
            </div>

            <div class="quick-actions">
                <button class="btn btn-secondary btn-sm" data-action="add-time" data-timer-id="${timer.id}" data-seconds="10">+10s</button>
                <button class="btn btn-secondary btn-sm" data-action="add-time" data-timer-id="${timer.id}" data-seconds="30">+30s</button>
                <button class="btn btn-secondary btn-sm" data-action="add-time" data-timer-id="${timer.id}" data-seconds="60">+1m</button>
                <button class="btn btn-secondary btn-sm" data-action="add-time" data-timer-id="${timer.id}" data-seconds="300">+5m</button>
                <button class="btn btn-secondary btn-sm" data-action="remove-time" data-timer-id="${timer.id}" data-seconds="10">-10s</button>
                <button class="btn btn-secondary btn-sm" data-action="remove-time" data-timer-id="${timer.id}" data-seconds="30">-30s</button>
            </div>
        </div>
    `).join('');
    
    // Setup event delegation for timer control buttons
    setupTimerControlListeners();
}

/**
 * Setup event listeners for timer control buttons (using event delegation)
 */
let timerControlsSetup = false; // Flag to prevent duplicate setup

function setupTimerControlListeners() {
    // Only setup once
    if (timerControlsSetup) {
        return;
    }
    
    const container = document.getElementById('timers-container');
    if (!container) return;
    
    // Event delegation for all timer buttons
    container.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;
        
        const action = button.getAttribute('data-action');
        const timerId = button.getAttribute('data-timer-id');
        const secondsAttr = button.getAttribute('data-seconds');
        const seconds = secondsAttr ? parseInt(secondsAttr, 10) : 0;
        
        // Validate seconds for add/remove-time actions
        if ((action === 'add-time' || action === 'remove-time') && (isNaN(seconds) || seconds <= 0)) {
            console.error('Invalid seconds value:', secondsAttr);
            return;
        }
        
        switch (action) {
            case 'start':
                startTimer(timerId);
                break;
            case 'pause':
                pauseTimer(timerId);
                break;
            case 'stop':
                stopTimer(timerId);
                break;
            case 'reset':
                resetTimer(timerId);
                break;
            case 'settings':
                openTimerSettings(timerId);
                break;
            case 'delete':
                deleteTimer(timerId);
                break;
            case 'add-time':
                addTime(timerId, seconds);
                break;
            case 'remove-time':
                removeTime(timerId, seconds);
                break;
        }
    });
    
    timerControlsSetup = true;
}

/**
 * Update timer display in real-time
 */
function updateTimerDisplay(data) {
    const displayElement = document.getElementById(`timer-display-${data.id}`);
    if (displayElement) {
        displayElement.textContent = formatTime(data.currentValue);
        
        // Update running animation
        if (data.state === 'running') {
            displayElement.classList.add('running');
        } else {
            displayElement.classList.remove('running');
        }
    }
}

/**
 * Refresh entire timer state
 */
async function refreshTimerState(timerId) {
    try {
        const response = await fetch(`/api/advanced-timer/timers/${timerId}`);
        const data = await response.json();
        
        if (data.success) {
            const index = timers.findIndex(t => t.id === timerId);
            if (index !== -1) {
                timers[index] = data.timer;
                renderTimers();
            }
        }
    } catch (error) {
        console.error('Error refreshing timer:', error);
    }
}

/**
 * Handle mode change in create form
 */
function handleModeChange() {
    const mode = document.getElementById('timer-mode').value;
    const initialDurationGroup = document.getElementById('initial-duration-group');
    const targetValueGroup = document.getElementById('target-value-group');

    if (mode === 'countdown' || mode === 'loop') {
        initialDurationGroup.style.display = 'block';
        targetValueGroup.style.display = 'none';
    } else if (mode === 'countup' || mode === 'interval') {
        initialDurationGroup.style.display = 'none';
        targetValueGroup.style.display = 'block';
    } else if (mode === 'stopwatch') {
        initialDurationGroup.style.display = 'none';
        targetValueGroup.style.display = 'none';
    }
}

/**
 * Handle timer creation
 */
async function handleCreateTimer(event) {
    event.preventDefault();

    const name = document.getElementById('timer-name').value;
    const mode = document.getElementById('timer-mode').value;
    const initialDuration = parseInt(document.getElementById('initial-duration').value) || 0;
    const targetValue = parseInt(document.getElementById('target-value').value) || 0;

    const timerData = {
        name: name,
        mode: mode,
        initial_duration: mode === 'countdown' || mode === 'loop' ? initialDuration : 0,
        current_value: mode === 'countdown' || mode === 'loop' ? initialDuration : 0,
        target_value: mode === 'countup' || mode === 'interval' ? targetValue : 0,
        state: 'stopped',
        config: {}
    };

    try {
        const response = await fetch('/api/advanced-timer/timers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(timerData)
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Success', 'Timer created successfully!', 'success');
            document.getElementById('timer-form').reset();
            loadTimers();
            showTab('timers');
        } else {
            showNotification('Error', data.error || 'Failed to create timer', 'error');
        }
    } catch (error) {
        console.error('Error creating timer:', error);
        showNotification('Error', 'Failed to create timer', 'error');
    }
}

/**
 * Timer control functions
 */
async function startTimer(timerId) {
    try {
        const response = await fetch(`/api/advanced-timer/timers/${timerId}/start`, {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            loadTimers();
        }
    } catch (error) {
        console.error('Error starting timer:', error);
    }
}

async function pauseTimer(timerId) {
    try {
        const response = await fetch(`/api/advanced-timer/timers/${timerId}/pause`, {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            loadTimers();
        }
    } catch (error) {
        console.error('Error pausing timer:', error);
    }
}

async function stopTimer(timerId) {
    try {
        const response = await fetch(`/api/advanced-timer/timers/${timerId}/stop`, {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            loadTimers();
        }
    } catch (error) {
        console.error('Error stopping timer:', error);
    }
}

async function resetTimer(timerId) {
    try {
        const response = await fetch(`/api/advanced-timer/timers/${timerId}/reset`, {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            loadTimers();
        }
    } catch (error) {
        console.error('Error resetting timer:', error);
    }
}

async function deleteTimer(timerId) {
    if (!confirm('Are you sure you want to delete this timer?')) {
        return;
    }

    try {
        const response = await fetch(`/api/advanced-timer/timers/${timerId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Success', 'Timer deleted successfully!', 'success');
            loadTimers();
        }
    } catch (error) {
        console.error('Error deleting timer:', error);
        showNotification('Error', 'Failed to delete timer', 'error');
    }
}

async function addTime(timerId, seconds) {
    try {
        const response = await fetch(`/api/advanced-timer/timers/${timerId}/add-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seconds, source: 'manual' })
        });
        const data = await response.json();
        if (data.success) {
            loadTimers();
        }
    } catch (error) {
        console.error('Error adding time:', error);
    }
}

async function removeTime(timerId, seconds) {
    try {
        const response = await fetch(`/api/advanced-timer/timers/${timerId}/remove-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seconds, source: 'manual' })
        });
        const data = await response.json();
        if (data.success) {
            loadTimers();
        }
    } catch (error) {
        console.error('Error removing time:', error);
    }
}

/**
 * Timer settings modal
 */
async function openTimerSettings(timerId) {
    currentEditingTimer = timers.find(t => t.id === timerId);
    if (!currentEditingTimer) return;

    const editNameInput = document.getElementById('edit-timer-name');
    editNameInput.value = currentEditingTimer.name;
    
    // Remove previous listener if exists and add a new one
    if (timerNameEnterHandler) {
        editNameInput.removeEventListener('keypress', timerNameEnterHandler);
    }
    timerNameEnterHandler = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTimerSettings();
        }
    };
    editNameInput.addEventListener('keypress', timerNameEnterHandler);
    
    // Set overlay URL
    const overlayUrl = `${window.location.origin}/advanced-timer/overlay?timer=${timerId}`;
    document.getElementById('overlay-url').textContent = overlayUrl;

    // Load events
    loadTimerEvents(timerId);

    // Load logs
    loadTimerLogs(timerId);

    document.getElementById('timer-settings-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('timer-settings-modal').classList.remove('active');
    currentEditingTimer = null;
}

async function saveTimerSettings() {
    if (!currentEditingTimer) return;

    const updatedName = document.getElementById('edit-timer-name').value;
    
    try {
        const response = await fetch(`/api/advanced-timer/timers/${currentEditingTimer.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: updatedName })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Success', 'Timer updated successfully!', 'success');
            closeModal();
            loadTimers();
        }
    } catch (error) {
        console.error('Error updating timer:', error);
        showNotification('Error', 'Failed to update timer', 'error');
    }
}

async function loadTimerLogs(timerId) {
    try {
        const response = await fetch(`/api/advanced-timer/timers/${timerId}/logs?limit=50`);
        const data = await response.json();
        
        if (data.success) {
            const logsContainer = document.getElementById('logs-container');
            if (data.logs.length === 0) {
                logsContainer.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No activity yet</p>';
            } else {
                logsContainer.innerHTML = data.logs.map(log => `
                    <div class="log-entry">
                        <div>
                            <strong>${log.event_type}</strong>
                            ${log.user_name ? ` - ${log.user_name}` : ''}
                            ${log.value_change ? ` (${log.value_change > 0 ? '+' : ''}${log.value_change}s)` : ''}
                            ${log.description ? `<br><small>${log.description}</small>` : ''}
                        </div>
                        <div class="log-time">${formatTimestamp(log.timestamp)}</div>
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

async function exportLogs() {
    if (!currentEditingTimer) return;

    try {
        window.open(`/api/advanced-timer/timers/${currentEditingTimer.id}/export-logs`, '_blank');
    } catch (error) {
        console.error('Error exporting logs:', error);
    }
}

function copyOverlayURL() {
    const url = document.getElementById('overlay-url').textContent;
    navigator.clipboard.writeText(url).then(() => {
        showNotification('Success', 'URL copied to clipboard!', 'success');
    });
}

/**
 * Tab navigation
 */
function showTab(tabName, targetElement) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (targetElement) {
        targetElement.classList.add('active');
    }

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

function showSettingsTab(tabName, targetElement) {
    // Update tabs
    document.querySelectorAll('#timer-settings-modal .tab').forEach(tab => {
        tab.classList.remove('active');
    });
    if (targetElement) {
        targetElement.classList.add('active');
    }

    // Update tab content
    document.querySelectorAll('#timer-settings-modal .tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`settings-tab-${tabName}`).classList.add('active');
}

/**
 * Utility functions
 */
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
}

function getModeLabel(mode) {
    if (!window.i18n || !window.i18n.initialized) {
        // Fallback labels when i18n not ready
        const labels = {
            'countdown': 'Countdown',
            'countup': 'Count Up',
            'stopwatch': 'Stopwatch',
            'loop': 'Loop',
            'interval': 'Interval'
        };
        return labels[mode] || mode;
    }
    
    const key = `ui.modes.${mode}`;
    const translation = window.i18n.t(key);
    // If translation is same as key, it means it wasn't found, return the mode itself
    return translation === key ? mode : translation.split(' - ')[0]; // Take only the first part before " - "
}

function getStateLabel(state) {
    if (!window.i18n || !window.i18n.initialized) {
        // Fallback labels when i18n not ready
        const labels = {
            'running': 'Running',
            'paused': 'Paused',
            'stopped': 'Stopped',
            'completed': 'Completed'
        };
        return labels[state] || state;
    }
    
    const key = `ui.states.${state}`;
    const translation = window.i18n.t(key);
    return translation === key ? state : translation;
}

function getTimerName(timerId) {
    const timer = timers.find(t => t.id === timerId);
    return timer ? timer.name : 'Unknown';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(title, message, type = 'info') {
    // Simple notification - could be enhanced with a toast library
    console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    alert(`${title}\n${message}`);
}

/**
 * Timer Events Management
 */
async function loadTimerEvents(timerId) {
    try {
        const response = await fetch(`/api/advanced-timer/timers/${timerId}/events`);
        const data = await response.json();
        
        if (data.success) {
            renderTimerEvents(data.events);
        }
    } catch (error) {
        console.error('Error loading timer events:', error);
    }
}

function renderTimerEvents(events) {
    const container = document.getElementById('events-list');
    
    if (!events || events.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No event rules configured yet. Click "Add Event Rule" to get started.</p>';
        return;
    }
    
    container.innerHTML = events.map(event => {
        const eventTypeLabel = getEventTypeLabel(event.event_type);
        const actionTypeLabel = getActionTypeLabel(event.action_type);
        const conditionsDesc = getConditionsDescription(event.event_type, event.conditions);
        
        return `
            <div class="timer-card" style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; margin-bottom: 4px;">
                            ${eventTypeLabel} → ${actionTypeLabel} ${event.action_value}s
                        </div>
                        ${conditionsDesc ? `<div style="font-size: 0.85rem; color: var(--color-text-secondary);">${conditionsDesc}</div>` : ''}
                        <div style="margin-top: 8px;">
                            <label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" 
                                    data-event-id="${event.id}"
                                    class="event-enabled-checkbox"
                                    ${event.enabled ? 'checked' : ''}>
                                <span style="font-size: 0.9rem;">Enabled</span>
                            </label>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-secondary edit-event-btn" data-event-id="${event.id}">✏️ Edit</button>
                        <button class="btn btn-sm btn-danger delete-event-btn" data-event-id="${event.id}">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Use event delegation for better performance and to avoid memory leaks
    // Only attach listeners once to avoid unnecessary operations
    if (!eventListDelegationAttached) {
        container.addEventListener('change', handleEventCheckboxChange);
        container.addEventListener('click', handleEventButtonClick);
        eventListDelegationAttached = true;
    }
}

// Delegated event handler for checkboxes
function handleEventCheckboxChange(e) {
    if (e.target.classList.contains('event-enabled-checkbox')) {
        toggleEventEnabled(parseInt(e.target.dataset.eventId), e.target.checked);
    }
}

// Delegated event handler for buttons
function handleEventButtonClick(e) {
    const target = e.target.closest('.edit-event-btn, .delete-event-btn');
    if (!target) return;
    
    const eventId = parseInt(target.dataset.eventId);
    if (target.classList.contains('edit-event-btn')) {
        editTimerEvent(eventId);
    } else if (target.classList.contains('delete-event-btn')) {
        deleteTimerEvent(eventId);
    }
}

function getEventTypeLabel(eventType) {
    const labels = {
        'gift': '🎁 Gift',
        'like': '👍 Like',
        'follow': '⭐ Follow',
        'share': '🔄 Share',
        'subscribe': '🌟 Subscribe',
        'chat': '💬 Chat'
    };
    return labels[eventType] || eventType;
}

function getActionTypeLabel(actionType) {
    const labels = {
        'add_time': 'Add',
        'remove_time': 'Remove',
        'set_value': 'Set to'
    };
    return labels[actionType] || actionType;
}

function getConditionsDescription(eventType, conditions) {
    if (!conditions || Object.keys(conditions).length === 0) {
        return '';
    }
    
    const parts = [];
    
    if (eventType === 'gift') {
        if (conditions.giftName) {
            parts.push(`Gift: ${conditions.giftName}`);
        }
        if (conditions.minCoins) {
            parts.push(`Min coins: ${conditions.minCoins}`);
        }
    } else if (eventType === 'like') {
        if (conditions.minLikes) {
            parts.push(`Min likes per event: ${conditions.minLikes}`);
        }
    } else if (eventType === 'chat') {
        if (conditions.command) {
            parts.push(`Command: ${conditions.command}`);
        }
        if (conditions.keyword) {
            parts.push(`Keyword: ${conditions.keyword}`);
        }
    }
    
    return parts.length > 0 ? `Conditions: ${parts.join(', ')}` : '';
}

async function toggleEventEnabled(eventId, enabled) {
    try {
        const response = await fetch(`/api/advanced-timer/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: eventId, enabled: enabled ? 1 : 0 })
        });
        
        const data = await response.json();
        if (data.success) {
            showNotification('Success', enabled ? 'Event enabled' : 'Event disabled', 'success');
        }
    } catch (error) {
        console.error('Error toggling event:', error);
        showNotification('Error', 'Failed to update event', 'error');
    }
}

async function deleteTimerEvent(eventId) {
    if (!confirm('Are you sure you want to delete this event rule?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/advanced-timer/events/${eventId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        if (data.success) {
            showNotification('Success', 'Event rule deleted', 'success');
            if (currentEditingTimer) {
                loadTimerEvents(currentEditingTimer.id);
            }
        }
    } catch (error) {
        console.error('Error deleting event:', error);
        showNotification('Error', 'Failed to delete event rule', 'error');
    }
}

function addTimerEvent() {
    editingEventId = null;
    showEventEditorModal();
}

async function editTimerEvent(eventId) {
    if (!currentEditingTimer) return;
    
    try {
        const response = await fetch(`/api/advanced-timer/timers/${currentEditingTimer.id}/events`);
        const data = await response.json();
        
        if (data.success) {
            const event = data.events.find(e => e.id === eventId);
            if (event) {
                editingEventId = eventId;
                showEventEditorModal(event);
            }
        }
    } catch (error) {
        console.error('Error loading event for edit:', error);
    }
}

function showEventEditorModal(event = null) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'event-editor-modal';
    
    const isEdit = event !== null;
    const eventType = event?.event_type || 'gift';
    const actionType = event?.action_type || 'add_time';
    const conditions = event?.conditions || {};
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">${isEdit ? '✏️ Edit' : '➕ Add'} Event Rule</div>
            
            <div class="form-group">
                <label class="form-label">Event Type</label>
                <select class="form-control" id="event-type-select">
                    <option value="gift" ${eventType === 'gift' ? 'selected' : ''}>🎁 Gift</option>
                    <option value="like" ${eventType === 'like' ? 'selected' : ''}>👍 Like</option>
                    <option value="follow" ${eventType === 'follow' ? 'selected' : ''}>⭐ Follow</option>
                    <option value="share" ${eventType === 'share' ? 'selected' : ''}>🔄 Share</option>
                    <option value="subscribe" ${eventType === 'subscribe' ? 'selected' : ''}>🌟 Subscribe</option>
                    <option value="chat" ${eventType === 'chat' ? 'selected' : ''}>💬 Chat</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">Action</label>
                <select class="form-control" id="event-action-select">
                    <option value="add_time" ${actionType === 'add_time' ? 'selected' : ''}>Add Time</option>
                    <option value="remove_time" ${actionType === 'remove_time' ? 'selected' : ''}>Remove Time</option>
                    <option value="set_value" ${actionType === 'set_value' ? 'selected' : ''}>Set Value</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">Value (seconds)</label>
                <input type="number" class="form-control" id="event-value-input" value="${event?.action_value || 10}" min="0" step="0.1">
            </div>
            
            <div id="event-conditions-container">
                <!-- Conditions will be inserted here based on event type -->
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 24px;">
                <button class="btn btn-primary" id="save-event-rule-btn">${isEdit ? 'Update' : 'Add'} Event Rule</button>
                <button class="btn btn-secondary" id="close-event-editor-btn">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Attach event listeners
    const eventTypeSelect = document.getElementById('event-type-select');
    eventTypeSelect.addEventListener('change', () => updateEventConditions({}));
    
    const saveBtn = document.getElementById('save-event-rule-btn');
    saveBtn.addEventListener('click', saveEventRule);
    
    const closeBtn = document.getElementById('close-event-editor-btn');
    closeBtn.addEventListener('click', closeEventEditorModal);
    
    const eventValueInput = document.getElementById('event-value-input');
    eventValueInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEventRule();
        }
    });
    
    updateEventConditions(conditions);
}

function updateEventConditions(existingConditions = {}) {
    const eventType = document.getElementById('event-type-select').value;
    const container = document.getElementById('event-conditions-container');
    
    let html = '<div class="info-box" style="margin-top: 16px;"><div class="info-box-title">Conditions (Optional)</div>';
    
    if (eventType === 'gift') {
        // Build gift catalog options
        let giftOptions = '<option value="">All gifts</option>';
        if (giftCatalog && giftCatalog.length > 0) {
            giftCatalog.forEach(gift => {
                const selected = existingConditions.giftName === gift.name ? 'selected' : '';
                const escapedName = escapeHtml(gift.name);
                giftOptions += `<option value="${escapedName}" ${selected}>${escapedName} (${gift.coins} coins)</option>`;
            });
        }
        
        html += `
            <div class="form-group">
                <label class="form-label">Select Gift</label>
                <select class="form-control" id="condition-gift-select" style="max-height: 200px;">
                    ${giftOptions}
                </select>
                <small style="color: var(--color-text-secondary); font-size: 0.85rem;">Or leave as "All gifts" to trigger on any gift</small>
            </div>
            <div class="form-group">
                <label class="form-label">Minimum Coins (0 = no minimum)</label>
                <input type="number" class="form-control condition-input" id="condition-min-coins" value="${existingConditions.minCoins || 0}" min="0">
            </div>
        `;
    } else if (eventType === 'like') {
        html += `
            <div class="form-group">
                <label class="form-label">Minimum Likes per Event (0 = no minimum)</label>
                <input type="number" class="form-control condition-input" id="condition-min-likes" value="${existingConditions.minLikes || 0}" min="0">
            </div>
        `;
    } else if (eventType === 'chat') {
        html += `
            <div class="form-group">
                <label class="form-label">Command (must start with this)</label>
                <input type="text" class="form-control condition-input" id="condition-command" value="${existingConditions.command || ''}" placeholder="e.g., !timer">
            </div>
            <div class="form-group">
                <label class="form-label">Keyword (must contain this)</label>
                <input type="text" class="form-control condition-input" id="condition-keyword" value="${existingConditions.keyword || ''}" placeholder="e.g., add time">
            </div>
        `;
    } else {
        html += '<p style="color: var(--color-text-secondary);">No additional conditions for this event type.</p>';
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    // Add event delegation listener only once (on first call)
    // Event delegation works on the container element, which persists even when innerHTML changes
    // The handler checks for the condition-input class, so it works for all input elements
    // regardless of which event type's conditions are currently displayed
    if (!conditionsKeypressHandler) {
        conditionsKeypressHandler = function(e) {
            if (e.target.classList.contains('condition-input') && e.key === 'Enter') {
                e.preventDefault();
                saveEventRule();
            }
        };
        container.addEventListener('keypress', conditionsKeypressHandler);
    }
}

async function saveEventRule() {
    if (!currentEditingTimer) return;
    
    const eventType = document.getElementById('event-type-select').value;
    const actionType = document.getElementById('event-action-select').value;
    let actionValueStr = document.getElementById('event-value-input').value;
    
    // Support both comma and dot as decimal separators (replace all commas)
    // Note: This is appropriate for seconds input (HTML5 number input type)
    // which doesn't support thousand separators, only decimal values
    actionValueStr = actionValueStr.replace(/,/g, '.');
    const actionValue = parseFloat(actionValueStr);
    
    // Validate action value
    if (isNaN(actionValue) || actionValue < 0) {
        showNotification('Error', 'Please enter a valid positive number for the value', 'error');
        return;
    }
    
    // Collect conditions based on event type
    const conditions = {};
    
    if (eventType === 'gift') {
        const giftName = document.getElementById('condition-gift-select')?.value;
        const minCoinsStr = document.getElementById('condition-min-coins')?.value || '0';
        const minCoins = parseInt(minCoinsStr, 10);
        
        if (isNaN(minCoins) || minCoins < 0) {
            showNotification('Error', 'Minimum coins must be a valid positive number', 'error');
            return;
        }
        
        if (giftName) conditions.giftName = giftName;
        if (minCoins > 0) conditions.minCoins = minCoins;
    } else if (eventType === 'like') {
        const minLikesStr = document.getElementById('condition-min-likes')?.value || '0';
        const minLikes = parseInt(minLikesStr, 10);
        
        if (isNaN(minLikes) || minLikes < 0) {
            showNotification('Error', 'Minimum likes must be a valid positive number', 'error');
            return;
        }
        
        if (minLikes > 0) conditions.minLikes = minLikes;
    } else if (eventType === 'chat') {
        const command = document.getElementById('condition-command')?.value;
        const keyword = document.getElementById('condition-keyword')?.value;
        if (command) conditions.command = command;
        if (keyword) conditions.keyword = keyword;
    }
    
    const eventData = {
        timer_id: currentEditingTimer.id,
        event_type: eventType,
        action_type: actionType,
        action_value: actionValue,
        conditions: conditions,
        enabled: 1
    };
    
    if (editingEventId) {
        eventData.id = editingEventId;
    }
    
    try {
        const response = await fetch('/api/advanced-timer/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });
        
        const data = await response.json();
        if (data.success) {
            showNotification('Success', `Event rule ${editingEventId ? 'updated' : 'added'} successfully!`, 'success');
            closeEventEditorModal();
            loadTimerEvents(currentEditingTimer.id);
        }
    } catch (error) {
        console.error('Error saving event rule:', error);
        showNotification('Error', 'Failed to save event rule', 'error');
    }
}

function closeEventEditorModal() {
    const modal = document.getElementById('event-editor-modal');
    if (modal) {
        modal.remove();
    }
    editingEventId = null;
}
