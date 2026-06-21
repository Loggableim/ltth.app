/**
 * Advanced Timer Plugin UI
 */

const socket = io();
let timers = [];
let giftCatalog = [];

// WeakSet for tracking event delegation attachments without memory leaks
const _advEventsBoundContainers = new WeakSet();
const _saveProfileBtnBound = new WeakSet();

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.i18n.initialized) await window.i18n.init();
    window.i18n.onLanguageChange(() => renderTimers());
    socket.on('locale-changed', async (locale) => {
        await window.i18n.changeLanguage(locale);
        renderTimers();
    });
    setupNav();
    setupCreateForm();
    setupSocketListeners();
    loadTimers();
    loadGiftCatalog();
    loadProfiles();
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function setupNav() {
    document.querySelectorAll('[data-tab]').forEach(el => {
        el.addEventListener('click', e => showTab(e.currentTarget.getAttribute('data-tab'), e.currentTarget));
    });
}

function showTab(name, triggerEl) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const sidebarBtn = document.querySelector('.nav-btn[data-tab="' + name + '"]');
    if (sidebarBtn) sidebarBtn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => { t.style.display = 'none'; });
    const target = document.getElementById('tab-' + name);
    if (target) target.style.display = 'block';
    if (name === 'profiles') loadProfiles();
}

// ---------------------------------------------------------------------------
// Socket
// ---------------------------------------------------------------------------

function setupSocketListeners() {
    socket.on('advanced-timer:tick', data => {
        const el = document.getElementById('td-' + data.id);
        if (el) {
            el.textContent = formatTime(data.currentValue);
            el.className = 'timer-display' + (data.state === 'running' ? ' running' : '');
        }
    });
    ['started','paused','stopped','reset','completed','time-added','time-removed'].forEach(ev => {
        socket.on('advanced-timer:' + ev, data => refreshTimer(data.id));
    });
}

// ---------------------------------------------------------------------------
// Load / Render timers
// ---------------------------------------------------------------------------

async function loadTimers() {
    try {
        const res = await fetch('/api/advanced-timer/timers');
        const data = await res.json();
        if (data.success) { timers = data.timers; renderTimers(); }
    } catch (e) { console.error('loadTimers', e); }
}

async function refreshTimer(id) {
    try {
        const res = await fetch('/api/advanced-timer/timers/' + id);
        const data = await res.json();
        if (data.success) {
            const idx = timers.findIndex(t => t.id === id);
            if (idx !== -1) timers[idx] = data.timer; else timers.push(data.timer);
            renderSingleTimer(data.timer);
        }
    } catch (e) { console.error('refreshTimer', e); }
}

function renderTimers() {
    const container = document.getElementById('timers-container');
    if (timers.length === 0) {
        container.innerHTML =
            '<div class="empty-state">' +
            '<div class="empty-state-icon">⏱️</div>' +
            '<div class="empty-state-text">No timers yet</div>' +
            '<button class="btn btn-primary" data-tab="create">Create Your First Timer</button>' +
            '</div>';
        container.querySelector('[data-tab]')?.addEventListener('click', e => showTab('create', e.currentTarget));
        return;
    }
    container.innerHTML = '';
    timers.forEach(t => container.appendChild(buildTimerCard(t)));
}

function renderSingleTimer(timer) {
    const existing = document.getElementById('tc-' + timer.id);
    const card = buildTimerCard(timer);
    if (existing) existing.replaceWith(card);
    else document.getElementById('timers-container').appendChild(card);
}

// ---------------------------------------------------------------------------
// Build timer card
// ---------------------------------------------------------------------------

function buildTimerCard(t) {
    const card = document.createElement('div');
    card.className = 'timer-card';
    card.id = 'tc-' + t.id;
    const overlayUrl = window.location.origin + '/advanced-timer/overlay?timer=' + t.id;

    card.innerHTML =
        // Header
        '<div class="timer-card-header">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
            '<span class="timer-title">' + escapeHtml(t.name) + '</span>' +
            '<span class="timer-mode-badge">' + getModeLabel(t.mode) + '</span>' +
          '</div>' +
          '<span class="timer-state-badge state-' + t.state + '">' + getStateLabel(t.state) + '</span>' +
        '</div>' +
        // Display
        '<div class="timer-display' + (t.state === 'running' ? ' running' : '') + '" id="td-' + t.id + '">' +
          formatTime(t.current_value) +
        '</div>' +
        // Controls
        '<div class="timer-controls" id="tctrl-' + t.id + '">' + timerControlButtons(t) + '</div>' +
        // Quick +/-
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">' +
          '<button class="btn btn-secondary btn-xs" data-at="add" data-s="10">+10s</button>' +
          '<button class="btn btn-secondary btn-xs" data-at="add" data-s="30">+30s</button>' +
          '<button class="btn btn-secondary btn-xs" data-at="add" data-s="60">+1m</button>' +
          '<button class="btn btn-secondary btn-xs" data-at="add" data-s="300">+5m</button>' +
          '<button class="btn btn-secondary btn-xs" data-at="remove" data-s="10">−10s</button>' +
          '<button class="btn btn-secondary btn-xs" data-at="remove" data-s="30">−30s</button>' +
        '</div>' +
        // Overlay URL
        '<div class="overlay-row">' +
          '<span style="font-size:0.78rem;color:var(--color-text-secondary);flex-shrink:0;">Overlay:</span>' +
          '<span class="overlay-url-text">' + overlayUrl + '</span>' +
          '<button class="btn btn-xs btn-secondary copy-url-btn" title="Copy URL">📋</button>' +
        '</div>' +
        // Settings section
        '<button class="section-toggle" data-sec="settings">⚙️ Settings <span class="chevron">▼</span></button>' +
        '<div class="section-body" data-sec-body="settings">' +
          '<div class="settings-grid">' +
            '<div class="field-group"><label class="field-label">Timer Name</label>' +
              '<input class="field-input" type="text" data-field="name" value="' + escapeHtml(t.name) + '"></div>' +
            '<div class="field-group"><label class="field-label">Initial Duration (seconds)</label>' +
              '<input class="field-input" type="number" min="0" data-field="initial_duration" value="' + (t.initial_duration || 0) + '"></div>' +
            '<div class="field-group"><label class="field-label">Action on Expiry</label>' +
              '<select class="field-input" data-field="expiry_action">' +
                '<option value="none"' + ((t.expiry_action||'none')==='none'?' selected':'') + '>None</option>' +
                '<option value="restart"' + (t.expiry_action==='restart'?' selected':'') + '>Restart</option>' +
                '<option value="alert"' + (t.expiry_action==='alert'?' selected':'') + '>Show Alert</option>' +
                '<option value="sound"' + (t.expiry_action==='sound'?' selected':'') + '>Play Sound</option>' +
                '<option value="scene_change"' + (t.expiry_action==='scene_change'?' selected':'') + '>Scene Change</option>' +
                '<option value="chain"' + (t.expiry_action==='chain'?' selected':'') + '>Trigger Chain</option>' +
              '</select></div>' +
          '</div>' +
          '<div style="margin-top:10px;"><button class="btn btn-sm btn-primary save-settings-btn">Save Settings</button></div>' +
        '</div>' +
        // Interactions section
        '<button class="section-toggle open" data-sec="interactions">⚡ Interactions <span class="chevron" style="transform:rotate(180deg);">▼</span></button>' +
        '<div class="section-body open" data-sec-body="interactions">' +
          '<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:10px;">Positive = add time, negative = reduce. Supports decimals (e.g. 0.05).</p>' +
          '<div class="interactions-grid">' +
            interactionRow('per_coin',      '🪙 Per Coin',         t.per_coin) +
            interactionRow('per_subscribe', '🌟 Per Subscribe',    t.per_subscribe) +
            interactionRow('per_follow',    '⭐ Per Follow',       t.per_follow) +
            interactionRow('per_share',     '🔄 Per Share',        t.per_share) +
            interactionRow('per_like',      '👍 Per Like',         t.per_like) +
            interactionRow('per_chat',      '💬 Per Chat Message', t.per_chat) +
          '</div>' +
          '<a class="adv-events-link" data-adv-timer="' + t.id + '">🔧 Advanced Event Rules (gift-name filters, commands…)</a>' +
          '<span class="save-indicator" id="si-' + t.id + '">✓ Saved</span>' +
        '</div>' +
        // Multiplier section
        '<button class="section-toggle open" data-sec="multiplier">✖️ Multiplier <span class="chevron" style="transform:rotate(180deg);">▼</span></button>' +
        '<div class="section-body open" data-sec-body="multiplier">' +
          '<div class="multiplier-row">' +
            '<label class="toggle-switch"><input type="checkbox" class="multiplier-toggle"' + (t.multiplier_enabled ? ' checked' : '') + '><span class="toggle-slider"></span></label>' +
            '<span style="font-size:0.85rem;">×</span>' +
            '<input class="interaction-input multiplier-value-input" type="number" min="0.01" step="0.01" value="' + (t.multiplier || 1) + '" style="width:70px;">' +
            '<span class="interaction-unit">multiplier</span>' +
            '<span style="font-size:0.78rem;color:var(--color-text-secondary);">(all interaction values × this factor)</span>' +
          '</div>' +
        '</div>' +
        // Keyboard Shortcuts section
        '<button class="section-toggle" data-sec="shortcuts">⌨️ Keyboard Shortcuts <span class="chevron">▼</span></button>' +
        '<div class="section-body" data-sec-body="shortcuts">' +
          '<div class="shortcuts-grid">' +
            '<div class="shortcut-row"><span class="shortcut-label">Start / Pause</span><input class="shortcut-input" type="text" data-sc="shortcut_start_pause" value="' + escapeHtml(t.shortcut_start_pause||'') + '" placeholder="e.g. ALT+P"></div>' +
            '<div class="shortcut-row"><span class="shortcut-label">Increase</span><input class="shortcut-input" type="text" data-sc="shortcut_increase" value="' + escapeHtml(t.shortcut_increase||'') + '" placeholder="e.g. ALT+S"></div>' +
            '<div class="shortcut-row"><span class="shortcut-label">Reduce</span><input class="shortcut-input" type="text" data-sc="shortcut_decrease" value="' + escapeHtml(t.shortcut_decrease||'') + '" placeholder="e.g. ALT+A"></div>' +
            '<div class="shortcut-row"><span class="shortcut-label">Step (seconds)</span><input class="shortcut-input" type="number" min="1" data-sc="shortcut_step" value="' + (t.shortcut_step||60) + '" style="width:70px;"></div>' +
          '</div>' +
          '<div style="margin-top:10px;"><button class="btn btn-sm btn-primary save-shortcuts-btn">Save Shortcuts</button></div>' +
        '</div>' +
        // Activity log section
        '<button class="section-toggle" data-sec="log">📋 Activity Log <span class="chevron">▼</span></button>' +
        '<div class="section-body" data-sec-body="log">' +
          '<div class="log-entries" id="log-' + t.id + '"><p style="color:var(--color-text-secondary);font-size:0.82rem;">Click the section header to load.</p></div>' +
          '<div style="margin-top:8px;display:flex;gap:8px;">' +
            '<button class="btn btn-sm btn-secondary reload-log-btn">🔄 Refresh</button>' +
            '<a href="/api/advanced-timer/timers/' + t.id + '/export-logs" target="_blank" class="btn btn-sm btn-secondary">📥 Export</a>' +
          '</div>' +
        '</div>' +
        // Delete
        '<div style="margin-top:12px;border-top:1px solid var(--color-border);padding-top:12px;display:flex;justify-content:flex-end;">' +
          '<button class="btn btn-sm btn-danger delete-timer-btn">🗑️ Delete Timer</button>' +
        '</div>';

    const tid = t.id;

    // Section toggles
    card.querySelectorAll('.section-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const sec = btn.getAttribute('data-sec');
            const body = card.querySelector('[data-sec-body="' + sec + '"]');
            const isOpen = body.classList.contains('open');
            body.classList.toggle('open', !isOpen);
            btn.classList.toggle('open', !isOpen);
            const chev = btn.querySelector('.chevron');
            if (chev) chev.style.transform = isOpen ? '' : 'rotate(180deg)';
        });
    });

    // Copy overlay URL
    card.querySelector('.copy-url-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(overlayUrl).then(() => flashSaved(tid));
    });

    // Quick add/remove
    card.querySelectorAll('[data-at]').forEach(btn => {
        btn.addEventListener('click', () => {
            const act = btn.getAttribute('data-at');
            timerAction(tid, act === 'add' ? 'add-time' : 'remove-time', { seconds: parseFloat(btn.getAttribute('data-s')), source: 'manual' });
        });
    });

    // Start/Pause/Stop/Reset (event delegation)
    card.addEventListener('click', e => {
        const btn = e.target.closest('[data-ctrl]');
        if (!btn) return;
        const ctrl = btn.getAttribute('data-ctrl');
        if (ctrl === 'start') timerAction(tid, 'start');
        else if (ctrl === 'pause') timerAction(tid, 'pause');
        else if (ctrl === 'stop') timerAction(tid, 'stop');
        else if (ctrl === 'reset') timerAction(tid, 'reset');
    });

    // Settings save
    card.querySelector('.save-settings-btn')?.addEventListener('click', () => saveSettings(card, tid));

    // Interaction inputs – auto-save debounced 500ms
    const debounceMap = new Map();
    card.querySelectorAll('.interaction-input[data-int]').forEach(inp => {
        inp.addEventListener('input', () => {
            clearTimeout(debounceMap.get(inp));
            debounceMap.set(inp, setTimeout(() => saveInteractions(card, tid), 500));
        });
    });

    // Multiplier
    const multToggle = card.querySelector('.multiplier-toggle');
    const multVal = card.querySelector('.multiplier-value-input');
    const saveMultiplier = () => {
        fetch('/api/advanced-timer/timers/' + tid + '/multiplier', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ multiplier: parseFloat(multVal.value)||1, multiplier_enabled: multToggle.checked ? 1 : 0 })
        }).then(() => flashSaved(tid)).catch(e => console.error(e));
    };
    multToggle?.addEventListener('change', saveMultiplier);
    multVal?.addEventListener('change', saveMultiplier);

    // Shortcuts save
    card.querySelector('.save-shortcuts-btn')?.addEventListener('click', () => saveShortcuts(card, tid));

    // Log: load on first toggle open
    let logLoaded = false;
    card.querySelector('[data-sec="log"]')?.addEventListener('click', () => {
        if (!logLoaded) { logLoaded = true; loadLog(tid); }
    });
    card.querySelector('.reload-log-btn')?.addEventListener('click', () => loadLog(tid));

    // Advanced event rules link
    card.querySelector('[data-adv-timer]')?.addEventListener('click', () => openAdvancedEvents(tid));

    // Delete
    card.querySelector('.delete-timer-btn')?.addEventListener('click', () => deleteTimer(tid));

    return card;
}

function interactionRow(field, label, value) {
    return '<div class="interaction-row">' +
        '<span class="interaction-label">' + label + '</span>' +
        '<div class="interaction-input-wrap">' +
            '<input class="interaction-input" type="number" step="0.01" data-int="' + field + '" value="' + (value || 0) + '">' +
            '<span class="interaction-unit">s</span>' +
        '</div>' +
    '</div>';
}

function timerControlButtons(t) {
    let html = '';
    if (t.state !== 'running') html += '<button class="btn btn-success btn-sm" data-ctrl="start">▶ Start</button>';
    if (t.state === 'running') html += '<button class="btn btn-warning btn-sm" data-ctrl="pause">⏸ Pause</button>';
    if (t.state === 'running' || t.state === 'paused') html += '<button class="btn btn-danger btn-sm" data-ctrl="stop">⏹ Stop</button>';
    html += '<button class="btn btn-secondary btn-sm" data-ctrl="reset">🔄 Reset</button>';
    return html;
}

// ---------------------------------------------------------------------------
// Timer control
// ---------------------------------------------------------------------------

async function timerAction(id, action, body) {
    try {
        const opts = { method: 'POST' };
        if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
        const res = await fetch('/api/advanced-timer/timers/' + id + '/' + action, opts);
        const data = await res.json();
        if (data.success) await refreshTimer(id);
    } catch (e) { console.error('timerAction', action, e); }
}

async function deleteTimer(id) {
    if (!confirm('Delete this timer?')) return;
    try {
        const res = await fetch('/api/advanced-timer/timers/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            timers = timers.filter(t => t.id !== id);
            document.getElementById('tc-' + id)?.remove();
            if (timers.length === 0) renderTimers();
        }
    } catch (e) { console.error('deleteTimer', e); }
}

// ---------------------------------------------------------------------------
// Save helpers
// ---------------------------------------------------------------------------

async function saveSettings(card, id) {
    const name = card.querySelector('[data-field="name"]')?.value;
    const initial_duration = parseFloat(card.querySelector('[data-field="initial_duration"]')?.value) || 0;
    const expiry_action = card.querySelector('[data-field="expiry_action"]')?.value || 'none';
    try {
        await fetch('/api/advanced-timer/timers/' + id, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, initial_duration, expiry_action })
        });
        await refreshTimer(id);
        flashSaved(id);
    } catch (e) { console.error('saveSettings', e); }
}

async function saveInteractions(card, id) {
    const payload = {};
    card.querySelectorAll('.interaction-input[data-int]').forEach(inp => {
        payload[inp.getAttribute('data-int')] = parseFloat(inp.value) || 0;
    });
    try {
        await fetch('/api/advanced-timer/timers/' + id + '/interactions', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const t = timers.find(x => x.id === id);
        if (t) Object.assign(t, payload);
        flashSaved(id);
    } catch (e) { console.error('saveInteractions', e); }
}

async function saveShortcuts(card, id) {
    const payload = {};
    card.querySelectorAll('[data-sc]').forEach(inp => {
        const k = inp.getAttribute('data-sc');
        payload[k] = k === 'shortcut_step' ? (parseFloat(inp.value)||60) : inp.value;
    });
    try {
        await fetch('/api/advanced-timer/timers/' + id + '/shortcuts', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        flashSaved(id);
    } catch (e) { console.error('saveShortcuts', e); }
}

function flashSaved(id) {
    const el = document.getElementById('si-' + id);
    if (!el) return;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1500);
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

async function loadLog(id) {
    try {
        const res = await fetch('/api/advanced-timer/timers/' + id + '/logs?limit=20');
        const data = await res.json();
        const container = document.getElementById('log-' + id);
        if (!container) return;
        if (!data.success || !data.logs.length) {
            container.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.82rem;">No activity yet.</p>';
            return;
        }
        container.innerHTML = data.logs.map(l => {
            const sign = l.value_change > 0 ? 'positive' : (l.value_change < 0 ? 'negative' : '');
            const cs = l.value_change ? (l.value_change > 0 ? '+' : '') + l.value_change.toFixed(2) + 's' : '';
            return '<div class="log-entry">' +
                '<span>' + escapeHtml(l.event_type) + (l.user_name ? ' · ' + escapeHtml(l.user_name) : '') +
                (l.description ? '<br><small style="color:var(--color-text-secondary)">' + escapeHtml(l.description) + '</small>' : '') + '</span>' +
                (cs ? '<span class="log-change ' + sign + '">' + cs + '</span>' : '') +
                '<span class="log-time">' + new Date(l.timestamp * 1000).toLocaleTimeString() + '</span>' +
            '</div>';
        }).join('');
    } catch (e) { console.error('loadLog', e); }
}

// ---------------------------------------------------------------------------
// Advanced Event Rules modal
// ---------------------------------------------------------------------------

let currentAdvTimerId = null;
let editingEventId = null;

function openAdvancedEvents(timerId) {
    currentAdvTimerId = timerId;
    let modal = document.getElementById('adv-events-modal');
    if (!modal) modal = createAdvEventsModal();
    modal.style.display = 'flex';
    loadAdvEvents(timerId);
}

function createAdvEventsModal() {
    const modal = document.createElement('div');
    modal.id = 'adv-events-modal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:var(--color-modal-backdrop,rgba(0,0,0,.5));z-index:2000;align-items:center;justify-content:center;';
    modal.innerHTML =
        '<div style="background:var(--color-modal-bg,var(--color-bg-card));border:1px solid var(--color-border);border-radius:16px;padding:28px;max-width:560px;width:92%;max-height:88vh;overflow-y:auto;">' +
          '<div style="font-size:1.2rem;font-weight:700;margin-bottom:16px;">🔧 Advanced Event Rules</div>' +
          '<p style="font-size:0.82rem;color:var(--color-text-secondary);margin-bottom:14px;">These rules add on top of the flat per-* values. Use for gift-name filters, minCoins, chat commands.</p>' +
          '<div id="adv-events-list"></div>' +
          '<div style="display:flex;gap:10px;margin-top:14px;">' +
            '<button class="btn btn-sm btn-primary" id="add-adv-event-btn">+ Add Rule</button>' +
            '<button class="btn btn-sm btn-secondary" id="close-adv-events-btn">Close</button>' +
          '</div>' +
        '</div>';
    document.body.appendChild(modal);
    modal.querySelector('#close-adv-events-btn').addEventListener('click', () => { modal.style.display = 'none'; });
    modal.querySelector('#add-adv-event-btn').addEventListener('click', () => showEventEditor(null));
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    return modal;
}

async function loadAdvEvents(timerId) {
    try {
        const res = await fetch('/api/advanced-timer/timers/' + timerId + '/events');
        const data = await res.json();
        if (data.success) renderAdvEvents(data.events);
    } catch (e) { console.error('loadAdvEvents', e); }
}

function renderAdvEvents(events) {
    const container = document.getElementById('adv-events-list');
    if (!events.length) {
        container.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.85rem;text-align:center;padding:12px;">No advanced rules yet.</p>';
        return;
    }
    container.innerHTML = events.map(ev => {
        const cStr = formatConditions(ev.event_type, ev.conditions);
        return '<div style="border:1px solid var(--color-border);border-radius:8px;padding:10px;margin-bottom:8px;font-size:0.84rem;" data-event-id="' + ev.id + '">' +
            '<div style="font-weight:600;">' + getEventLabel(ev.event_type) + ' → ' + getActionLabel(ev.action_type) + ' ' + ev.action_value + 's</div>' +
            (cStr ? '<div style="color:var(--color-text-secondary);margin-top:2px;">' + cStr + '</div>' : '') +
            '<div style="margin-top:8px;display:flex;gap:6px;">' +
              '<button class="btn btn-xs btn-secondary adv-edit-btn">✏️ Edit</button>' +
              '<button class="btn btn-xs btn-danger adv-del-btn">🗑️</button>' +
            '</div></div>';
    }).join('');

    // Use event delegation — attach listener once per container using WeakSet
    if (!_advEventsBoundContainers.has(container)) {
        _advEventsBoundContainers.add(container);
        container.addEventListener('click', function advEventHandler(e) {
            const editBtn = e.target.closest('.adv-edit-btn');
            const delBtn = e.target.closest('.adv-del-btn');
            if (!editBtn && !delBtn) return;
            const eventEl = e.target.closest('[data-event-id]');
            if (!eventEl) return;
            const evId = parseInt(eventEl.getAttribute('data-event-id'));
            if (isNaN(evId)) return;
            if (editBtn) showEventEditor(evId);
            else deleteAdvEvent(evId);
        });
    }
}

function getEventLabel(t) {
    return { gift:'🎁 Gift', like:'👍 Like', follow:'⭐ Follow', share:'🔄 Share', subscribe:'🌟 Subscribe', chat:'💬 Chat' }[t] || t;
}
function getActionLabel(t) {
    return { add_time:'Add', remove_time:'Remove', set_value:'Set to' }[t] || t;
}
function formatConditions(type, cond) {
    if (!cond || !Object.keys(cond).length) return '';
    const p = [];
    if (cond.giftName) p.push('Gift: ' + cond.giftName);
    if (cond.minCoins) p.push('Min coins: ' + cond.minCoins);
    if (cond.minLikes) p.push('Min likes: ' + cond.minLikes);
    if (cond.command) p.push('Command: ' + cond.command);
    if (cond.keyword) p.push('Keyword: ' + cond.keyword);
    return p.join(' · ');
}

async function deleteAdvEvent(id) {
    if (!confirm('Delete this event rule?')) return;
    try {
        await fetch('/api/advanced-timer/events/' + id, { method: 'DELETE' });
        loadAdvEvents(currentAdvTimerId);
    } catch (e) { console.error('deleteAdvEvent', e); }
}

function showEventEditor(eventId) {
    editingEventId = eventId;
    document.getElementById('event-editor-modal')?.remove();
    const editor = document.createElement('div');
    editor.id = 'event-editor-modal';
    editor.style.cssText = 'display:flex;position:fixed;inset:0;background:var(--color-modal-backdrop,rgba(0,0,0,.5));z-index:3000;align-items:center;justify-content:center;';
    editor.innerHTML =
        '<div style="background:var(--color-modal-bg,var(--color-bg-card));border:1px solid var(--color-border);border-radius:14px;padding:24px;max-width:480px;width:92%;max-height:88vh;overflow-y:auto;">' +
          '<div style="font-size:1.1rem;font-weight:700;margin-bottom:14px;">' + (eventId ? '✏️ Edit' : '➕ Add') + ' Event Rule</div>' +
          '<div class="form-group"><label class="form-label">Event Type</label>' +
            '<select class="form-control" id="ee-type">' +
              ['gift','like','follow','share','subscribe','chat'].map(v => '<option value="' + v + '">' + getEventLabel(v) + '</option>').join('') +
            '</select></div>' +
          '<div class="form-group"><label class="form-label">Action</label>' +
            '<select class="form-control" id="ee-action">' +
              '<option value="add_time">Add Time</option><option value="remove_time">Remove Time</option><option value="set_value">Set Value</option>' +
            '</select></div>' +
          '<div class="form-group"><label class="form-label">Value (seconds)</label>' +
            '<input type="number" class="form-control" id="ee-value" value="10" min="0" step="0.01"></div>' +
          '<div id="ee-conditions"></div>' +
          '<div style="display:flex;gap:10px;margin-top:16px;">' +
            '<button class="btn btn-sm btn-primary" id="ee-save">Save</button>' +
            '<button class="btn btn-sm btn-secondary" id="ee-cancel">Cancel</button>' +
          '</div>' +
        '</div>';
    document.body.appendChild(editor);

    const typeSelect = editor.querySelector('#ee-type');
    const renderCond = () => {
        const tp = typeSelect.value;
        const c = editor.querySelector('#ee-conditions');
        if (tp === 'gift') {
            c.innerHTML = '<div class="form-group"><label class="form-label">Gift Name (blank = any)</label><input class="form-control" id="ee-gift-name" placeholder="e.g. Rose"></div>' +
                '<div class="form-group"><label class="form-label">Min Coins (0 = no min)</label><input type="number" class="form-control" id="ee-min-coins" value="0" min="0"></div>';
        } else if (tp === 'like') {
            c.innerHTML = '<div class="form-group"><label class="form-label">Min Likes per Event</label><input type="number" class="form-control" id="ee-min-likes" value="0" min="0"></div>';
        } else if (tp === 'chat') {
            c.innerHTML = '<div class="form-group"><label class="form-label">Command prefix (e.g. !time)</label><input class="form-control" id="ee-command" placeholder="!time"></div>' +
                '<div class="form-group"><label class="form-label">Keyword (contains)</label><input class="form-control" id="ee-keyword" placeholder="add time"></div>';
        } else { c.innerHTML = ''; }
    };
    typeSelect.addEventListener('change', renderCond);
    renderCond();

    editor.querySelector('#ee-cancel').addEventListener('click', () => editor.remove());
    editor.querySelector('#ee-save').addEventListener('click', async () => {
        const type = editor.querySelector('#ee-type').value;
        const action = editor.querySelector('#ee-action').value;
        const value = parseFloat(editor.querySelector('#ee-value').value) || 0;
        const cond = {};
        if (type === 'gift') {
            const gn = editor.querySelector('#ee-gift-name')?.value; if (gn) cond.giftName = gn;
            const mc = parseInt(editor.querySelector('#ee-min-coins')?.value); if (mc > 0) cond.minCoins = mc;
        } else if (type === 'like') {
            const ml = parseInt(editor.querySelector('#ee-min-likes')?.value); if (ml > 0) cond.minLikes = ml;
        } else if (type === 'chat') {
            const cmd = editor.querySelector('#ee-command')?.value; if (cmd) cond.command = cmd;
            const kw = editor.querySelector('#ee-keyword')?.value; if (kw) cond.keyword = kw;
        }
        const payload = { timer_id: currentAdvTimerId, event_type: type, action_type: action, action_value: value, conditions: cond, enabled: 1 };
        if (editingEventId) payload.id = editingEventId;
        try {
            await fetch('/api/advanced-timer/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            editor.remove();
            loadAdvEvents(currentAdvTimerId);
        } catch (e) { console.error('saveEventRule', e); }
    });
}

// ---------------------------------------------------------------------------
// Create Timer form
// ---------------------------------------------------------------------------

function setupCreateForm() {
    const form = document.getElementById('timer-form');
    if (!form) return;
    const modeSelect = document.getElementById('timer-mode');
    const updateFields = () => {
        const mode = modeSelect.value;
        document.getElementById('initial-duration-group').style.display = ['countdown','loop'].includes(mode) ? '' : 'none';
        document.getElementById('target-value-group').style.display = ['countup','interval'].includes(mode) ? '' : 'none';
    };
    modeSelect.addEventListener('change', updateFields);
    updateFields();
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const name = document.getElementById('timer-name').value.trim();
        const mode = modeSelect.value;
        const init = parseFloat(document.getElementById('initial-duration').value) || 0;
        const target = parseFloat(document.getElementById('target-value').value) || 0;
        const payload = {
            name, mode,
            initial_duration: ['countdown','loop'].includes(mode) ? init : 0,
            current_value:    ['countdown','loop'].includes(mode) ? init : 0,
            target_value:     ['countup','interval'].includes(mode) ? target : 0,
            state: 'stopped', config: {}
        };
        try {
            const res = await fetch('/api/advanced-timer/timers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (data.success) { form.reset(); updateFields(); await loadTimers(); showTab('timers'); }
            else alert(data.error || 'Failed to create timer');
        } catch (err) { console.error('createTimer', err); }
    });
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

async function loadProfiles() {
    try {
        const res = await fetch('/api/advanced-timer/profiles');
        const data = await res.json();
        if (data.success) renderProfiles(data.profiles);
    } catch (e) { console.error('loadProfiles', e); }
}

function renderProfiles(profiles) {
    const container = document.getElementById('profiles-container');
    if (!container) return;
    container.innerHTML = profiles.length
        ? profiles.map(p =>
            '<div class="profile-card" data-profile-id="' + escapeHtml(p.id) + '">' +
              '<div><div class="profile-name">' + escapeHtml(p.name) + '</div>' +
              '<div class="profile-meta">' + new Date(p.created_at * 1000).toLocaleDateString() + '</div></div>' +
              '<div style="display:flex;gap:8px;">' +
                '<button class="btn btn-xs btn-primary profile-apply-btn">Apply</button>' +
                '<button class="btn btn-xs btn-danger profile-del-btn">🗑️</button>' +
              '</div>' +
            '</div>').join('')
        : '<p style="color:var(--color-text-secondary);">No saved profiles. Click "Save Current Setup" to save your timers.</p>';

    // Event delegation — safe, no inline onclick
    container.querySelectorAll('[data-profile-id]').forEach(card => {
        const pid = card.getAttribute('data-profile-id');
        card.querySelector('.profile-apply-btn')?.addEventListener('click', () => applyProfile(pid));
        card.querySelector('.profile-del-btn')?.addEventListener('click', () => deleteProfile(pid));
    });

    const saveBtn = document.getElementById('save-profile-btn');
    if (saveBtn && !_saveProfileBtnBound.has(saveBtn)) {
        _saveProfileBtnBound.add(saveBtn);
        saveBtn.addEventListener('click', async () => {
            const name = prompt('Profile name:');
            if (!name) return;
            await fetch('/api/advanced-timer/profiles', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, config: { timers } })
            });
            loadProfiles();
        });
    }
}

async function applyProfile(id) {
    if (!confirm('Apply this profile? Current timers will be replaced.')) return;
    try {
        const res = await fetch('/api/advanced-timer/profiles/' + id + '/apply', { method: 'POST' });
        const data = await res.json();
        if (data.success) { await loadTimers(); showTab('timers'); }
    } catch (e) { console.error('applyProfile', e); }
}

async function deleteProfile(id) {
    if (!confirm('Delete this profile?')) return;
    try { await fetch('/api/advanced-timer/profiles/' + id, { method: 'DELETE' }); loadProfiles(); }
    catch (e) { console.error('deleteProfile', e); }
}

// ---------------------------------------------------------------------------
// Gift catalog
// ---------------------------------------------------------------------------

async function loadGiftCatalog() {
    try {
        const res = await fetch('/api/gift-catalog');
        const data = await res.json();
        if (data.success) giftCatalog = data.catalog || [];
    } catch (_) { giftCatalog = []; }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatTime(seconds) {
    const s = Math.max(0, seconds || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return pad(h) + ':' + pad(m) + ':' + pad(sec);
    return pad(m) + ':' + pad(sec);
}
function pad(n) { return String(n).padStart(2, '0'); }

function getModeLabel(mode) {
    return { countdown:'Countdown', countup:'Count Up', stopwatch:'Stopwatch', loop:'Loop', interval:'Interval' }[mode] || mode;
}
function getStateLabel(state) {
    return { running:'Running', paused:'Paused', stopped:'Stopped', completed:'Completed' }[state] || state;
}
function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text ?? '';
    return d.innerHTML;
}
