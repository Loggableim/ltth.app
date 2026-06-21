// Goals HUD Overlay - Real-time goals display for OBS

// Default style values – mirrors DEFAULT_STYLE from app/modules/goals.js and serves as
// a client-side fallback when the server has not yet sent style data.
const OVERLAY_DEFAULT_STYLE = {
    bar_height_px: 36,
    round_px: 18,
    bg_mode: 'gradient',
    bg_color: '#002f00',
    bg_color2: '#004d00',
    bg_angle: 135,
    bar_bg: 'rgba(255,255,255,.15)',
    fill_mode: 'gradient',
    fill_color1: '#4ade80',
    fill_color2: '#22c55e',
    fill_angle: 90,
    border_enabled: false,
    border_color: 'rgba(255,255,255,.35)',
    border_width: 2,
    shadow_enabled: true,
    shadow_css: '0 10px 30px rgba(0,0,0,.25)',
    font_family: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    text_color: '#ffffff',
    text_size_px: 20,
    label_pos: 'inside',
    label_template: '{total} / {goal}',
    anim_duration_ms: 900
};

const goalsState = {
    coins:     { value: 0, goal: 1000, labelKey: 'hud.coins',                  show: true,  style: null },
    followers: { value: 0, goal: 10,   labelKey: 'hud.followers',              show: true,  style: null },
    likes:     { value: 0, goal: 500,  labelKey: 'hud.likes',                  show: true,  style: null },
    subs:      { value: 0, goal: 50,   labelKey: 'dashboard.stats.followers',  show: true,  style: null },
    custom:    { value: 0, goal: 100,  labelKey: 'hud.goals',                  show: false, style: null }
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
        updateSingleGoal(data.goalId, data.total, data.goal, data.style);
        renderGoals();
    });

    socket.on('goal:style', (data) => {
        debugLog('Goal style updated', { goalId: data.goalId });
        if (data.goalId && goalsState[data.goalId]) {
            goalsState[data.goalId].style = data.style;
            renderGoals();
        }
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
            if (goal.config && goal.config.style) {
                goalsState[goal.id].style = goal.config.style;
            }
        }
    });

    debugLog('Updated all goals', { count: goals.length });
}

// Update single goal
function updateSingleGoal(id, value, target, style) {
    if (goalsState[id]) {
        const oldValue = goalsState[id].value;
        goalsState[id].value = value || 0;
        if (target !== undefined) {
            goalsState[id].goal = target;
        }
        if (style !== undefined) {
            goalsState[id].style = style;
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

// Build an inline CSS string for a style object + property set
function styleStr(props) {
    return Object.entries(props)
        .filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => `${k}:${v}`)
        .join(';');
}

// Derive concrete CSS values from a goal style object
function buildInlineStyles(style) {
    const s = Object.assign({}, OVERLAY_DEFAULT_STYLE, style || {});

    // Background for .goal-item
    const itemBg = s.bg_mode === 'gradient'
        ? `linear-gradient(${s.bg_angle}deg,${s.bg_color},${s.bg_color2})`
        : s.bg_color;

    const itemStyles = {
        'background': itemBg,
        'box-shadow': s.shadow_enabled ? s.shadow_css : 'none',
        'border': s.border_enabled ? `${s.border_width}px solid ${s.border_color}` : 'none',
        'font-family': s.font_family,
        'border-radius': `${s.round_px}px`
    };

    // Background for .goal-bar
    const barStyles = {
        'background': s.bar_bg,
        'height': `${s.bar_height_px}px`,
        'border-radius': `${s.round_px}px`
    };

    // Background for .goal-fill
    let fillBg;
    if (s.fill_mode === 'solid') {
        fillBg = s.fill_color1;
    } else {
        fillBg = `linear-gradient(${s.fill_angle}deg,${s.fill_color1},${s.fill_color2})`;
    }
    const fillStyles = {
        'background': fillBg,
        'border-radius': `${s.round_px}px`,
        'transition': `width ${s.anim_duration_ms / 1000}s ease`
    };

    // Text styles for .goal-text
    const textStyles = {
        'color': s.text_color,
        'font-size': `${s.text_size_px}px`
    };

    // Label styles for .goal-label
    const labelStyles = {
        'color': s.text_color
    };

    return { s, itemStyles, barStyles, fillStyles, textStyles, labelStyles };
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

        // Build style data
        const { s, itemStyles, barStyles, fillStyles, textStyles, labelStyles } = buildInlineStyles(goal.style);

        // Build progress text from template
        const progressText = (s.label_template || '{total} / {goal}')
            .replace('{total}', goal.value)
            .replace('{goal}', goal.goal)
            .replace('{percent}', Math.round(percent));

        const goalItem = document.createElement('div');
        goalItem.className = 'goal-item';
        goalItem.setAttribute('data-goal-id', id);
        goalItem.setAttribute('style', styleStr(itemStyles));

        const fillWidthStyle = `width:${percent}%;${styleStr(fillStyles)}`;

        let progressHtml;
        if (s.label_pos === 'inside') {
            // Progress text overlaid inside the bar
            progressHtml = `
                <div class="goal-bar" style="${styleStr(barStyles)}">
                    <div class="goal-fill" style="${fillWidthStyle}"></div>
                    <div class="goal-text" style="${styleStr(textStyles)}">${progressText}</div>
                </div>`;
        } else {
            // Progress text displayed below the bar
            const textBelowStyles = Object.assign({}, textStyles, {
                'position': 'relative',
                'top': 'auto',
                'left': 'auto',
                'transform': 'none',
                'text-align': 'center',
                'padding-top': '4px'
            });
            progressHtml = `
                <div class="goal-bar" style="${styleStr(barStyles)}">
                    <div class="goal-fill" style="${fillWidthStyle}"></div>
                </div>
                <div class="goal-text" style="${styleStr(textBelowStyles)}">${progressText}</div>`;
        }

        goalItem.innerHTML = `
            <div class="goal-label" style="${styleStr(labelStyles)}">${label}</div>
            ${progressHtml}
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
