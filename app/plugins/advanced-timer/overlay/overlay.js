/**
 * Advanced Timer Overlay JavaScript
 * Handles real-time timer display in OBS overlays
 */

const socket = io();
let timerId = null;
let timer = null;
let template = 'default'; // default, progress, circular, minimal, big

// Get timer ID from URL parameters
const urlParams = new URLSearchParams(window.location.search);
timerId = urlParams.get('timer');
const templateParam = urlParams.get('template');

// Validate and set template with safe fallback
const validTemplates = ['default', 'progress', 'circular', 'minimal', 'big'];
if (templateParam && validTemplates.includes(templateParam)) {
    template = templateParam;
} else if (templateParam) {
    console.warn(`Invalid template "${templateParam}", falling back to "default"`);
    template = 'default';
} else {
    template = 'default';
}

if (!timerId) {
    console.error('No timer ID provided in URL');
    document.getElementById('timer-container').innerHTML = '<div style="color: white; text-align: center;">No timer ID specified</div>';
}

// ── Rotator + Threshold state ──────────────────────────────────────

const rotatorState = {
    settings: null,            // last received rotator settings
    entries: [],               // current entries in the buffer
    slotEls: [],               // current rendered slot elements (one per slot)
    currentEntryIdx: 0,        // which entry is currently visible
    rotationTimer: null,       // interval id
    activePosition: 'top'
};

const thresholdState = {
    lastFire: 0,               // last fire timestamp
    activeEls: []              // currently animating elements
};

const BUILTIN_ANIMATIONS = ['flame','lightning','sparks','pulse-glow','rainbow-shake','gold-flux'];
const SOURCE_EMOJI = {
    like: '👍',
    gift: '🎁',
    override: '🎯',
    follow: '⭐',
    subscribe: '🌟',
    superfan: '💎',
    share: '🔄',
    chat: '💬',
    manual: '✋',
    flow: '🔗',
    rule: '🧠'
};

/**
 * Initialize overlay
 */
async function init() {
    if (!timerId) return;

    try {
        // Fetch timer data
        const response = await fetch(`/api/advanced-timer/timers/${timerId}`);
        const data = await response.json();

        if (data.success) {
            timer = data.timer;
            renderTimer();
            setupSocketListeners();

            // Fetch initial rotator + threshold settings so we render correctly on first frame
            try {
                const r = await fetch(`/api/advanced-timer/timers/${timerId}/rotator`);
                const rj = await r.json();
                if (rj.success && rj.settings) {
                    rotatorState.settings = rj.settings;
                    rotatorState.activePosition = rj.settings.position || 'top';
                }
            } catch (e) { /* rotator optional */ }
            try {
                const t = await fetch(`/api/advanced-timer/timers/${timerId}/threshold-effects`);
                const tj = await t.json();
                if (tj.success && tj.settings) {
                    // No-op: settings are read on demand per event
                }
            } catch (e) { /* threshold optional */ }
        } else {
            console.error('Timer not found');
            document.getElementById('timer-container').innerHTML = '<div style="color: white; text-align: center;">Timer not found</div>';
        }
    } catch (error) {
        console.error('Error loading timer:', error);
    }
}

/**
 * Setup Socket.IO listeners
 */
function setupSocketListeners() {
    socket.on('advanced-timer:tick', (data) => {
        if (data.id === timerId) {
            timer.current_value = data.currentValue;
            timer.state = data.state;
            updateTimerDisplay();
        }
    });

    socket.on('advanced-timer:started', (data) => {
        if (data.id === timerId) {
            timer.state = 'running';
            updateTimerState();
        }
    });

    socket.on('advanced-timer:paused', (data) => {
        if (data.id === timerId) {
            timer.state = 'paused';
            updateTimerState();
        }
    });

    socket.on('advanced-timer:stopped', (data) => {
        if (data.id === timerId) {
            timer.state = 'stopped';
            updateTimerState();
        }
    });

    socket.on('advanced-timer:completed', (data) => {
        if (data.id === timerId) {
            timer.state = 'completed';
            updateTimerState();
        }
    });

    socket.on('advanced-timer:reset', (data) => {
        if (data.id === timerId) {
            timer.current_value = data.currentValue;
            timer.state = 'stopped';
            updateTimerDisplay();
            updateTimerState();
        }
    });

    socket.on('advanced-timer:time-added', (data) => {
        if (data.id === timerId) {
            timer.current_value = data.currentValue;
            updateTimerDisplay();
        }
    });

    socket.on('advanced-timer:time-removed', (data) => {
        if (data.id === timerId) {
            timer.current_value = data.currentValue;
            updateTimerDisplay();
        }
    });

    // ── Rotator snapshot ──
    socket.on('advanced-timer:rotator-snapshot', (data) => {
        if (data && data.timerId === timerId) {
            applyRotatorSnapshot(data);
        }
    });

    // ── Threshold effect ──
    socket.on('advanced-timer:threshold-effect', (data) => {
        if (data && data.timerId === timerId) {
            playThresholdEffect(data);
        }
    });
}

/**
 * Render timer based on template
 */
function renderTimer() {
    const container = document.getElementById('timer-template-host') || document.getElementById('timer-container');

    switch (template) {
        case 'progress':
            container.innerHTML = renderProgressTemplate();
            break;
        case 'circular':
            container.innerHTML = renderCircularTemplate();
            break;
        case 'minimal':
            container.innerHTML = renderMinimalTemplate();
            break;
        case 'big':
            container.innerHTML = renderBigTemplate();
            break;
        default:
            container.innerHTML = renderDefaultTemplate();
    }

    updateTimerDisplay();
    updateTimerState();
}

/**
 * Template renderers
 */
function renderDefaultTemplate() {
    return `<div class="timer-display">${formatTime(timer.current_value)}</div>`;
}

function renderProgressTemplate() {
    return `
        <div class="template-progress">
            <div class="timer-name">${escapeHtml(timer.name)}</div>
            <div class="timer-time">${formatTime(timer.current_value)}</div>
            <div class="progress-bar">
                <div class="progress-fill" id="progress-fill"></div>
            </div>
        </div>
    `;
}

function renderCircularTemplate() {
    const radius = 135;
    const circumference = 2 * Math.PI * radius;
    
    return `
        <div class="template-circular">
            <svg width="300" height="300">
                <circle class="circle-bg" cx="150" cy="150" r="${radius}"></circle>
                <circle class="circle-progress" id="circle-progress" cx="150" cy="150" r="${radius}"
                    style="stroke-dasharray: ${circumference}; stroke-dashoffset: 0;"></circle>
            </svg>
            <div class="timer-text">
                <div class="timer-time">${formatTime(timer.current_value)}</div>
                <div class="timer-name">${escapeHtml(timer.name)}</div>
            </div>
        </div>
    `;
}

function renderMinimalTemplate() {
    return `<div class="template-minimal">${formatTime(timer.current_value)}</div>`;
}

function renderBigTemplate() {
    return `<div class="template-big">${formatTime(timer.current_value)}</div>`;
}

/**
 * Update timer display
 */
function updateTimerDisplay() {
    const timeText = formatTime(timer.current_value);

    switch (template) {
        case 'progress':
            const timeElement = document.querySelector('.template-progress .timer-time');
            if (timeElement) {
                timeElement.textContent = timeText;
            }
            updateProgressBar();
            break;

        case 'circular':
            const circularTimeElement = document.querySelector('.template-circular .timer-time');
            if (circularTimeElement) {
                circularTimeElement.textContent = timeText;
            }
            updateCircularProgress();
            break;

        case 'minimal':
            const minimalElement = document.querySelector('.template-minimal');
            if (minimalElement) {
                minimalElement.textContent = timeText;
            }
            break;

        case 'big':
            const bigElement = document.querySelector('.template-big');
            if (bigElement) {
                bigElement.textContent = timeText;
            }
            break;

        default:
            const defaultElement = document.querySelector('.timer-display');
            if (defaultElement) {
                defaultElement.textContent = timeText;
            }
    }
}

/**
 * Update progress bar
 */
function updateProgressBar() {
    const progressFill = document.getElementById('progress-fill');
    if (!progressFill) return;

    let percentage = 0;

    if (timer.mode === 'countdown' || timer.mode === 'loop') {
        // For countdown, show remaining time as percentage
        if (timer.initial_duration > 0) {
            percentage = (timer.current_value / timer.initial_duration) * 100;
        }
    } else if (timer.mode === 'countup' || timer.mode === 'interval') {
        // For count up, show progress towards target
        if (timer.target_value > 0) {
            percentage = (timer.current_value / timer.target_value) * 100;
        }
    } else {
        // Stopwatch - no progress bar
        percentage = 100;
    }

    progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
}

/**
 * Update circular progress
 */
function updateCircularProgress() {
    const circleProgress = document.getElementById('circle-progress');
    if (!circleProgress) return;

    const radius = 135;
    const circumference = 2 * Math.PI * radius;

    let percentage = 0;

    if (timer.mode === 'countdown' || timer.mode === 'loop') {
        if (timer.initial_duration > 0) {
            percentage = (timer.current_value / timer.initial_duration) * 100;
        }
    } else if (timer.mode === 'countup' || timer.mode === 'interval') {
        if (timer.target_value > 0) {
            percentage = (timer.current_value / timer.target_value) * 100;
        }
    } else {
        percentage = 100;
    }

    const offset = circumference - (percentage / 100) * circumference;
    circleProgress.style.strokeDashoffset = offset;
}

/**
 * Update timer state styling
 */
function updateTimerState() {
    const container = document.getElementById('timer-container');
    const timeElements = container.querySelectorAll('.timer-display, .timer-time, .template-minimal, .template-big');

    timeElements.forEach(element => {
        element.classList.remove('state-running', 'state-paused', 'state-completed');
        element.classList.remove('animate-pulse', 'animate-glow');

        if (timer.state === 'running') {
            element.classList.add('state-running');
            if (timer.config.animateOnRunning) {
                element.classList.add('animate-pulse');
            }
        } else if (timer.state === 'paused') {
            element.classList.add('state-paused');
        } else if (timer.state === 'completed') {
            element.classList.add('state-completed');
            if (timer.config.animateOnComplete) {
                element.classList.add('animate-glow');
            }
        }
    });
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ──────────────────────────────────────────────────────────────────
// Rotator rendering
// ──────────────────────────────────────────────────────────────────

function applyRotatorSnapshot(snap) {
    if (!snap || snap.timerId !== timerId) return;
    const settings = snap.settings || null;
    rotatorState.settings = settings;
    rotatorState.entries = (snap.entries || []).slice(0, settings ? settings.slot_count : 1);

    // If rotator disabled or no settings, hide any active slots
    if (!settings || !settings.enabled) {
        clearRotatorSlots();
        return;
    }

    rotatorState.activePosition = settings.position || 'top';
    renderRotator();
}

function clearRotatorSlots() {
    const container = document.getElementById('rotator-container');
    if (!container) return;
    if (rotatorState.rotationTimer) {
        clearInterval(rotatorState.rotationTimer);
        rotatorState.rotationTimer = null;
    }
    container.innerHTML = '';
    rotatorState.slotEls = [];
}

function buildSlotElement(entry, settings) {
    const el = document.createElement('div');
    const isStack = (settings.slot_count || 1) > 1;
    el.className = 'rotator-slot rotator-position-' + (isStack ? 'top' : (settings.position || 'top'));

    fillSlotElement(el, entry, settings);
    return el;
}

function fillSlotElement(el, entry, settings) {
    // Stack case — wrap in a stack container per position; we handle this at the container level.
    // (For simplicity the non-stack path renders the slot directly.)

    const meta = entry.meta || {};
    const directionClass = entry.direction === 'positive' ? 'positive' : 'negative';
    const fontScale = settings.font_scale || 1.0;
    const alpha = settings.fade_alpha || 0.92;
    el.style.setProperty('--rotator-alpha', String(alpha));
    el.style.fontSize = (fontScale * 100) + '%';

    // Gift image OR source emoji
    const showGift = settings.show_gift_images !== false;
    const showEmoji = settings.show_source_emoji !== false;
    const showName = settings.show_gift_names !== false;
    const showDelta = settings.show_time_delta !== false;

    const emoji = SOURCE_EMOJI[entry.sourceType] || SOURCE_EMOJI.manual;

    let media = '';
    if (showGift && meta.giftImage) {
        const safeUrl = escapeAttr(meta.giftImage);
        media = '<img class="slot-gift-image" src="' + safeUrl + '" alt="">';
    } else if (showEmoji) {
        media = '<span class="slot-emoji">' + emoji + '</span>';
    }

    const delta = showDelta
        ? '<div class="slot-delta ' + directionClass + '">' + entry.sign + formatDuration(Math.abs(entry.amount)) + '</div>'
        : '';
    const nameText = meta.giftName || (entry.sourceType ? entry.sourceType.toUpperCase() : '');
    const name = (showName && nameText) ? '<div class="slot-name">' + escapeHtml(nameText) + '</div>' : '';
    const userText = meta.nickname || meta.uniqueId || '';
    const user = userText ? '<div class="slot-user">@' + escapeHtml(userText) + '</div>' : '';

    el.innerHTML = media +
        '<div class="slot-body">' + delta + name + user + '</div>';

    // CSP-safe image error handler — attached as listener, not inline attribute
    const img = el.querySelector('.slot-gift-image');
    if (img) {
        img.addEventListener('error', () => { img.style.display = 'none'; });
    }
}

function escapeAttr(s) {
    if (!s) return '';
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderRotator() {
    const container = document.getElementById('rotator-container');
    if (!container) return;
    const settings = rotatorState.settings;
    if (!settings || !settings.enabled) {
        clearRotatorSlots();
        return;
    }

    const slotCount = Math.max(1, Math.min(8, settings.slot_count || 1));
    const entries = rotatorState.entries;

    // Multi-slot stack: show the latest `slot_count` entries, one per line in a stack
    if (slotCount > 1) {
        clearRotatorSlots();
        const stack = document.createElement('div');
        stack.className = 'rotator-stack vertical rotator-stack-' + (settings.position || 'top');
        // Anchor per position
        if (settings.position === 'top') {
            stack.style.top = '4%';
            stack.style.left = '50%';
            stack.style.transform = 'translateX(-50%)';
        } else if (settings.position === 'bottom') {
            stack.style.bottom = '4%';
            stack.style.left = '50%';
            stack.style.transform = 'translateX(-50%)';
        } else if (settings.position === 'left') {
            stack.style.left = '2%';
            stack.style.top = '50%';
            stack.style.transform = 'translateY(-50%)';
        } else {
            stack.style.right = '2%';
            stack.style.top = '50%';
            stack.style.transform = 'translateY(-50%)';
        }
        for (let i = 0; i < slotCount; i++) {
            const entry = entries[i];
            const slot = document.createElement('div');
            slot.className = 'rotator-slot';
            if (entry) {
                fillSlotElement(slot, entry, settings);
                slot.classList.add('is-visible');
            } else {
                slot.style.opacity = '0.25';
                slot.innerHTML = '<span class="slot-emoji">⏳</span><div class="slot-body"><div class="slot-name">' + (i === 0 ? 'Most recent' : 'Previous') + '</div></div>';
            }
            stack.appendChild(slot);
        }
        container.appendChild(stack);
        rotatorState.slotEls = Array.from(stack.children);
        return;
    }

    // Single-slot mode: rotate through entries, one shown at a time
    if (rotatorState.slotEls.length === 0) {
        const el = buildSlotElement(entries[0] || {}, settings);
        container.appendChild(el);
        rotatorState.slotEls = [el];
        // Force reflow so transition runs
        void el.offsetWidth;
        if (entries.length > 0) el.classList.add('is-visible');

        // Start rotation
        if (rotatorState.rotationTimer) clearInterval(rotatorState.rotationTimer);
        const interval = Math.max(800, settings.rotation_interval_ms || 4500);
        rotatorState.currentEntryIdx = 0;
        if (entries.length > 1) {
            rotatorState.rotationTimer = setInterval(rotateSingleSlot, interval);
        }
    } else {
        // Settings might have changed — rebuild the slot content
        const el = rotatorState.slotEls[0];
        const newEl = buildSlotElement(entries[0] || {}, settings);
        el.className = newEl.className;
        el.style.cssText = newEl.style.cssText;
        el.innerHTML = newEl.innerHTML;
        if (entries.length > 0) el.classList.add('is-visible');
    }
}

function rotateSingleSlot() {
    if (!rotatorState.entries || rotatorState.entries.length < 2) return;
    rotatorState.currentEntryIdx = (rotatorState.currentEntryIdx + 1) % rotatorState.entries.length;
    const entry = rotatorState.entries[rotatorState.currentEntryIdx];
    const el = rotatorState.slotEls[0];
    if (!el || !entry) return;

    // Fade out → swap → fade in
    el.classList.add('is-exiting');
    el.classList.remove('is-visible');
    setTimeout(() => {
        const newEl = buildSlotElement(entry, rotatorState.settings);
        el.className = newEl.className;
        el.innerHTML = newEl.innerHTML;
        // Force reflow
        void el.offsetWidth;
        el.classList.remove('is-exiting');
        el.classList.add('is-visible');
    }, 500);
}

function formatDuration(seconds) {
    const abs = Math.abs(seconds);
    if (abs < 1) return abs.toFixed(2) + 's';
    if (abs < 60) return abs.toFixed(1) + 's';
    const m = Math.floor(abs / 60);
    const s = Math.floor(abs % 60);
    if (m < 60) return m + 'm ' + (s < 10 ? '0' + s : s) + 's';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h + 'h ' + (mm < 10 ? '0' + mm : mm) + 'm';
}

// ──────────────────────────────────────────────────────────────────
// Threshold effect rendering
// ──────────────────────────────────────────────────────────────────

function playThresholdEffect(payload) {
    const layer = document.getElementById('threshold-effect-layer');
    if (!layer) return;
    const duration = Math.max(200, Math.min(10000, parseInt(payload.duration_ms) || 1500));
    const builtin = BUILTIN_ANIMATIONS.includes(payload.builtin) ? payload.builtin : 'flame';
    const intensity = Math.max(0.3, Math.min(2.0, parseFloat(payload.intensity) || 1.0));
    const created = [];

    // 1) Custom uploaded frame (if any)
    if (payload.frameUrl) {
        const frame = document.createElement('div');
        frame.className = 'threshold-frame';
        frame.style.backgroundImage = 'url("' + escapeAttr(payload.frameUrl) + '")';
        frame.style.transformOrigin = 'center center';
        frame.style.transform = 'scale(' + (1.0 * intensity) + ')';
        layer.appendChild(frame);
        created.push(frame);
        // Trigger animation next frame
        requestAnimationFrame(() => {
            frame.classList.add('is-active');
            frame.style.animationDuration = duration + 'ms';
        });
    }

    // 2) Built-in CSS animation (always played — they compose on top of frames)
    const anim = document.createElement('div');
    anim.className = 'threshold-anim anim-' + builtin;
    anim.style.transformOrigin = 'center center';
    anim.style.transform = 'scale(' + (1.0 * intensity) + ')';
    layer.appendChild(anim);
    created.push(anim);
    requestAnimationFrame(() => {
        anim.classList.add('is-active');
        anim.style.animationDuration = duration + 'ms';
    });

    // Cleanup after the duration + small buffer
    setTimeout(() => {
        for (const el of created) {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }
    }, duration + 100);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
