// Goals HUD Overlay - Real-time goals display for OBS
const goalsState = {
    coins: { value: 0, goal: 1000, labelKey: 'hud.coins', show: true },
    followers: { value: 0, goal: 10, labelKey: 'hud.followers', show: true },
    likes: { value: 0, goal: 500, labelKey: 'hud.likes', show: true },
    subs: { value: 0, goal: 50, labelKey: 'dashboard.stats.followers', show: true },
    custom: { value: 0, goal: 100, labelKey: 'hud.goals', show: false }
};

let socket = null;
let debugMode = false;

// Check for debug mode in URL
const params = new URLSearchParams(window.location.search);
debugMode = params.get('debug') === 'true';

function debugLog(message, data = null) {
    if (debugMode) {
        console.log('[GOALS-OVERLAY]', message, data || '');
        const indicator = document.getElementById('debug-indicator');
        indicator.classList.add('visible');
        indicator.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
    }
}

// Initialize WebSocket connection
function initSocket() {
    debugLog('Initializing Socket.IO connection...');

    socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
    });

    socket.on('connect', () => {
        debugLog('Connected', { socket_id: socket.id });
        // Subscribe to goals room for updates
        socket.emit('goals:subscribe');
    });

    socket.on('goals:snapshot', (data) => {
        debugLog('Received snapshot', { count: data.goals ? data.goals.length : 0 });
        updateAllGoals(data.goals);
        renderGoals();
    });

    socket.on('goals:update', (data) => {
        debugLog('Goal updated', { goalId: data.goalId, value: data.total });
        updateSingleGoal(data.goalId, data.total, data.goal);
        renderGoals();
    });

    socket.on('goals:reset', (data) => {
        debugLog('Goal reset', { goalId: data.goalId });
        if (goalsState[data.goalId]) {
            goalsState[data.goalId].value = 0;
            renderGoals();
        }
    });

    socket.on('disconnect', () => {
        debugLog('Disconnected, attempting reconnect...');
    });

    socket.on('connect_error', (error) => {
        debugLog('Connection error', { error: error.message });
    });
    
    // Listen for language changes from server
    socket.on('locale-changed', async (data) => {
        debugLog('Server locale changed', { locale: data.locale });
        if (window.i18n) {
            await window.i18n.setLocale(data.locale);
            renderGoals();
        }
    });
}

// Update all goals from snapshot
function updateAllGoals(goals) {
    if (!goals || !Array.isArray(goals)) {
        debugLog('Invalid goals data received');
        return;
    }

    goals.forEach(goal => {
        if (goalsState[goal.id]) {
            goalsState[goal.id].value = goal.current || 0;
            goalsState[goal.id].goal = goal.target || goalsState[goal.id].goal;
            goalsState[goal.id].show = goal.show !== false;
        }
    });

    debugLog('Updated all goals', { count: goals.length });
}

// Update single goal
function updateSingleGoal(id, value, target) {
    if (goalsState[id]) {
        const oldValue = goalsState[id].value;
        goalsState[id].value = value || 0;
        if (target !== undefined) {
            goalsState[id].goal = target;
        }

        // Trigger pulse animation if value increased
        if (value > oldValue) {
            const fillElement = document.querySelector(`[data-goal-id="${id}"] .goal-fill`);
            if (fillElement) {
                fillElement.classList.add('pulse');
                setTimeout(() => fillElement.classList.remove('pulse'), 1500);
            }
        }
    }
}

// Render goals to DOM
function renderGoals() {
    const container = document.getElementById('goals-container');
    if (!container) {
        debugLog('Container #goals-container not found!', null);
        return;
    }

    // Clear and rebuild
    container.innerHTML = '';

    let visibleCount = 0;
    Object.entries(goalsState).forEach(([id, goal]) => {
        // Skip if goal is hidden
        if (!goal.show) {
            return;
        }

        visibleCount++;
        const percent = Math.min(100, Math.max(0, (goal.value / goal.goal) * 100));
        
        // Get translated label
        const label = window.i18n ? window.i18n.t(goal.labelKey) : goal.labelKey;

        const goalItem = document.createElement('div');
        goalItem.className = 'goal-item';
        goalItem.setAttribute('data-goal-id', id);

        goalItem.innerHTML = `
            <div class="goal-label">${label}</div>
            <div class="goal-bar">
                <div class="goal-fill" style="width: ${percent}%"></div>
                <div class="goal-text">${goal.value} / ${goal.goal}</div>
            </div>
        `;

        container.appendChild(goalItem);
    });

    debugLog('Rendered goals', { visible: visibleCount, total: Object.keys(goalsState).length });
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
    debugLog('Page loaded, initializing...');
    
    // Initialize i18n first
    if (window.i18n) {
        await window.i18n.init();
        
        // Listen for language changes and re-render
        window.i18n.onChange(() => {
            debugLog('Language changed, re-rendering goals');
            renderGoals();
        });
    }
    
    initSocket();
    renderGoals(); // Initial render with default values
});
