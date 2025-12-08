/**
 * Advanced Timer Plugin UI
 * Client-side JavaScript for timer management interface
 */

const socket = io();
let timers = [];
let currentEditingTimer = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadTimers();
    setupSocketListeners();
});

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
 * Render timers list
 */
function renderTimers() {
    const container = document.getElementById('timers-container');
    
    if (timers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⏱️</div>
                <div class="empty-state-text">No timers yet</div>
                <button class="btn btn-primary" onclick="showTab('create')">Create Your First Timer</button>
            </div>
        `;
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
                    `<button class="btn btn-success btn-sm" onclick="startTimer('${timer.id}')">▶️ Start</button>` : ''}
                ${timer.state === 'running' ? 
                    `<button class="btn btn-warning btn-sm" onclick="pauseTimer('${timer.id}')">⏸️ Pause</button>` : ''}
                ${timer.state === 'running' || timer.state === 'paused' ? 
                    `<button class="btn btn-danger btn-sm" onclick="stopTimer('${timer.id}')">⏹️ Stop</button>` : ''}
                <button class="btn btn-secondary btn-sm" onclick="resetTimer('${timer.id}')">🔄 Reset</button>
                <button class="btn btn-secondary btn-sm" onclick="openTimerSettings('${timer.id}')">⚙️ Settings</button>
                <button class="btn btn-danger btn-sm" onclick="deleteTimer('${timer.id}')">🗑️ Delete</button>
            </div>

            <div class="quick-actions">
                <button class="btn btn-secondary btn-sm" onclick="addTime('${timer.id}', 10)">+10s</button>
                <button class="btn btn-secondary btn-sm" onclick="addTime('${timer.id}', 30)">+30s</button>
                <button class="btn btn-secondary btn-sm" onclick="addTime('${timer.id}', 60)">+1m</button>
                <button class="btn btn-secondary btn-sm" onclick="addTime('${timer.id}', 300)">+5m</button>
                <button class="btn btn-secondary btn-sm" onclick="removeTime('${timer.id}', 10)">-10s</button>
                <button class="btn btn-secondary btn-sm" onclick="removeTime('${timer.id}', 30)">-30s</button>
            </div>
        </div>
    `).join('');
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

    document.getElementById('edit-timer-name').value = currentEditingTimer.name;
    
    // Set overlay URL
    const overlayUrl = `${window.location.origin}/plugins/advanced-timer/overlay/?timer=${timerId}`;
    document.getElementById('overlay-url').textContent = overlayUrl;

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
function showTab(tabName) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

function showSettingsTab(tabName) {
    // Update tabs
    document.querySelectorAll('#timer-settings-modal .tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');

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
    const labels = {
        'countdown': 'Countdown',
        'countup': 'Count Up',
        'stopwatch': 'Stopwatch',
        'loop': 'Loop',
        'interval': 'Interval'
    };
    return labels[mode] || mode;
}

function getStateLabel(state) {
    const labels = {
        'running': 'Running',
        'paused': 'Paused',
        'stopped': 'Stopped',
        'completed': 'Completed'
    };
    return labels[state] || state;
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
