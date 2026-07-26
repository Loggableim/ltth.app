/**
 * Advanced Timer Plugin UI
 */

const socket = io();
let timers = [];
let giftCatalog = [];

// WeakSet for tracking event delegation attachments without memory leaks
const _advEventsBoundContainers = new WeakSet();
const _saveProfileBtnBound = new WeakSet();

function t(key, params) {
    return window.i18n.t(key, params);
}

const TIMER_TEXT_KEYS = Object.freeze({
    timer: 'plugins.advanced-timer.runtime.timer',
    quickAddTen: 'plugins.advanced-timer.runtime.quickAddTen',
    quickAddThirty: 'plugins.advanced-timer.runtime.quickAddThirty',
    quickAddMinute: 'plugins.advanced-timer.runtime.quickAddMinute',
    quickAddFiveMinutes: 'plugins.advanced-timer.runtime.quickAddFiveMinutes',
    quickRemoveTen: 'plugins.advanced-timer.runtime.quickRemoveTen',
    quickRemoveThirty: 'plugins.advanced-timer.runtime.quickRemoveThirty',
    overlay: 'plugins.advanced-timer.runtime.overlay',
    copyOverlayUrl: 'plugins.advanced-timer.runtime.copyOverlayUrl',
    settings: 'plugins.advanced-timer.ui.buttons.settings',
    expiryAction: 'plugins.advanced-timer.runtime.expiryAction',
    expiryNone: 'plugins.advanced-timer.runtime.expiryNone',
    expiryRestart: 'plugins.advanced-timer.runtime.expiryRestart',
    expiryAlert: 'plugins.advanced-timer.runtime.expiryAlert',
    expirySound: 'plugins.advanced-timer.runtime.expirySound',
    expirySceneChange: 'plugins.advanced-timer.runtime.expirySceneChange',
    expiryTriggerChain: 'plugins.advanced-timer.runtime.expiryTriggerChain',
    interactions: 'plugins.advanced-timer.runtime.interactions',
    interactionsHint: 'plugins.advanced-timer.runtime.interactionsHint',
    perCoin: 'plugins.advanced-timer.runtime.perCoin',
    perSubscribe: 'plugins.advanced-timer.runtime.perSubscribe',
    perFollow: 'plugins.advanced-timer.runtime.perFollow',
    perShare: 'plugins.advanced-timer.runtime.perShare',
    perLike: 'plugins.advanced-timer.runtime.perLike',
    perChat: 'plugins.advanced-timer.runtime.perChat',
    advancedRulesLink: 'plugins.advanced-timer.runtime.advancedRulesLink',
    saved: 'plugins.advanced-timer.runtime.saved',
    multiplier: 'plugins.advanced-timer.runtime.multiplier',
    multiplierDescription: 'plugins.advanced-timer.runtime.multiplierDescription',
    keyboardShortcuts: 'plugins.advanced-timer.runtime.keyboardShortcuts',
    startPause: 'plugins.advanced-timer.runtime.startPause',
    increase: 'plugins.advanced-timer.runtime.increase',
    reduce: 'plugins.advanced-timer.runtime.reduce',
    stepSeconds: 'plugins.advanced-timer.runtime.stepSeconds',
    saveShortcuts: 'plugins.advanced-timer.runtime.saveShortcuts',
    loadLogHint: 'plugins.advanced-timer.runtime.loadLogHint',
    refresh: 'plugins.advanced-timer.runtime.refresh',
    giftOverrides: 'plugins.advanced-timer.runtime.giftOverrides',
    giftOverridesDescription: 'plugins.advanced-timer.runtime.giftOverridesDescription',
    clickToLoad: 'plugins.advanced-timer.runtime.clickToLoad',
    selectGift: 'plugins.advanced-timer.runtime.selectGift',
    seconds: 'plugins.advanced-timer.runtime.seconds',
    add: 'plugins.advanced-timer.runtime.add',
    sourceLike: 'plugins.advanced-timer.runtime.sourceLike',
    sourceCoin: 'plugins.advanced-timer.runtime.sourceCoin',
    sourceCustomGift: 'plugins.advanced-timer.runtime.sourceCustomGift',
    sourceFollow: 'plugins.advanced-timer.runtime.sourceFollow',
    sourceSubscribe: 'plugins.advanced-timer.runtime.sourceSubscribe',
    sourceShare: 'plugins.advanced-timer.runtime.sourceShare',
    sourceChat: 'plugins.advanced-timer.runtime.sourceChat',
    sourceManual: 'plugins.advanced-timer.runtime.sourceManual',
    sourceFlow: 'plugins.advanced-timer.runtime.sourceFlow',
    sourceRule: 'plugins.advanced-timer.runtime.sourceRule',
    deleteTimer: 'plugins.advanced-timer.runtime.deleteTimer',
    noAdvancedRules: 'plugins.advanced-timer.runtime.noAdvancedRules',
    advancedRulesDescription: 'plugins.advanced-timer.runtime.advancedRulesDescription',
    close: 'plugins.advanced-timer.runtime.close',
    edit: 'plugins.advanced-timer.runtime.edit',
    addEventRule: 'plugins.advanced-timer.runtime.addEventRule',
    editEventRule: 'plugins.advanced-timer.runtime.editEventRule',
    eventType: 'plugins.advanced-timer.runtime.eventType',
    action: 'plugins.advanced-timer.runtime.action',
    valueSeconds: 'plugins.advanced-timer.runtime.valueSeconds',
    giftName: 'plugins.advanced-timer.runtime.giftName',
    giftNamePlaceholder: 'plugins.advanced-timer.runtime.giftNamePlaceholder',
    minCoins: 'plugins.advanced-timer.runtime.minCoins',
    minLikes: 'plugins.advanced-timer.runtime.minLikes',
    commandPrefix: 'plugins.advanced-timer.runtime.commandPrefix',
    keywordContains: 'plugins.advanced-timer.runtime.keywordContains',
    keywordPlaceholder: 'plugins.advanced-timer.runtime.keywordPlaceholder',
    noGiftOverrides: 'plugins.advanced-timer.runtime.noGiftOverrides',
    diamonds: 'plugins.advanced-timer.runtime.diamonds',
    selectGiftAlert: 'plugins.advanced-timer.runtime.selectGiftAlert',
    unknownGift: 'plugins.advanced-timer.runtime.unknownGift',
    failedSave: 'plugins.advanced-timer.runtime.failedSave',
    removeGiftOverride: 'plugins.advanced-timer.runtime.removeGiftOverride',
    failedSaveRotator: 'plugins.advanced-timer.runtime.failedSaveRotator',
    failedSaveThreshold: 'plugins.advanced-timer.runtime.failedSaveThreshold',
    frameAlt: 'plugins.advanced-timer.runtime.frameAlt',
    chooseFile: 'plugins.advanced-timer.runtime.chooseFile',
    frameTooLarge: 'plugins.advanced-timer.runtime.frameTooLarge',
    uploadFailed: 'plugins.advanced-timer.runtime.uploadFailed',
    uploadError: 'plugins.advanced-timer.runtime.uploadError',
    removeFrame: 'plugins.advanced-timer.runtime.removeFrame',
    deleteFailed: 'plugins.advanced-timer.runtime.deleteFailed',
    failedCreateTimer: 'plugins.advanced-timer.runtime.failedCreateTimer',
    noSavedProfiles: 'plugins.advanced-timer.runtime.noSavedProfiles',
    apply: 'plugins.advanced-timer.runtime.apply',
    profileNamePrompt: 'plugins.advanced-timer.runtime.profileNamePrompt',
    applyProfileConfirm: 'plugins.advanced-timer.runtime.applyProfileConfirm',
    deleteProfileConfirm: 'plugins.advanced-timer.runtime.deleteProfileConfirm',
    deleteTimerConfirm: 'plugins.advanced-timer.ui.messages.confirmDelete',
    deleteEventRuleConfirm: 'plugins.advanced-timer.runtime.deleteEventRuleConfirm',
    conditionGift: 'plugins.advanced-timer.runtime.conditionGift',
    conditionMinCoins: 'plugins.advanced-timer.runtime.conditionMinCoins',
    conditionMinLikes: 'plugins.advanced-timer.runtime.conditionMinLikes',
    conditionCommand: 'plugins.advanced-timer.runtime.conditionCommand',
    conditionKeyword: 'plugins.advanced-timer.runtime.conditionKeyword',
    timerName: 'plugins.advanced-timer.ui.labels.timerName',
    initialDuration: 'plugins.advanced-timer.ui.labels.initialDuration',
    activityLog: 'plugins.advanced-timer.ui.labels.activityLog',
    start: 'plugins.advanced-timer.ui.buttons.start',
    pause: 'plugins.advanced-timer.ui.buttons.pause',
    stop: 'plugins.advanced-timer.ui.buttons.stop',
    reset: 'plugins.advanced-timer.ui.buttons.reset',
    save: 'plugins.advanced-timer.ui.buttons.save',
    cancel: 'plugins.advanced-timer.ui.buttons.cancel',
    delete: 'plugins.advanced-timer.ui.buttons.delete',
    export: 'plugins.advanced-timer.ui.buttons.export',
    noActivity: 'plugins.advanced-timer.ui.messages.noActivity',
    modeCountdown: 'plugins.advanced-timer.ui.modes.countdown',
    modeCountup: 'plugins.advanced-timer.ui.modes.countup',
    modeStopwatch: 'plugins.advanced-timer.ui.modes.stopwatch',
    modeLoop: 'plugins.advanced-timer.ui.modes.loop',
    modeInterval: 'plugins.advanced-timer.ui.modes.interval',
    stateRunning: 'plugins.advanced-timer.ui.states.running',
    statePaused: 'plugins.advanced-timer.ui.states.paused',
    stateStopped: 'plugins.advanced-timer.ui.states.stopped',
    stateCompleted: 'plugins.advanced-timer.ui.states.completed',
    eventGift: 'plugins.advanced-timer.events.types.gift',
    eventLike: 'plugins.advanced-timer.events.types.like',
    eventFollow: 'plugins.advanced-timer.events.types.follow',
    eventShare: 'plugins.advanced-timer.events.types.share',
    eventSubscribe: 'plugins.advanced-timer.events.types.subscribe',
    eventChat: 'plugins.advanced-timer.events.types.chat',
    addTime: 'plugins.advanced-timer.events.actions.addTime',
    removeTime: 'plugins.advanced-timer.events.actions.removeTime',
    setValue: 'plugins.advanced-timer.events.actions.setValue',
    rotatorTitle: 'plugins.advanced-timer.rotator.sectionTitle',
    rotatorDescription: 'plugins.advanced-timer.rotator.sectionDesc',
    rotatorEnable: 'plugins.advanced-timer.rotator.enable',
    rotatorPosition: 'plugins.advanced-timer.rotator.position',
    rotatorTop: 'plugins.advanced-timer.rotator.positionTop',
    rotatorBottom: 'plugins.advanced-timer.rotator.positionBottom',
    rotatorLeft: 'plugins.advanced-timer.rotator.positionLeft',
    rotatorRight: 'plugins.advanced-timer.rotator.positionRight',
    rotatorSlots: 'plugins.advanced-timer.rotator.slots',
    rotatorRotation: 'plugins.advanced-timer.rotator.rotationMs',
    rotatorMinSeconds: 'plugins.advanced-timer.rotator.minSeconds',
    rotatorGiftImage: 'plugins.advanced-timer.rotator.showGiftImage',
    rotatorGiftName: 'plugins.advanced-timer.rotator.showGiftName',
    rotatorTimeDelta: 'plugins.advanced-timer.rotator.showTimeDelta',
    rotatorSourceEmoji: 'plugins.advanced-timer.rotator.showSourceEmoji',
    rotatorFontScale: 'plugins.advanced-timer.rotator.fontScale',
    rotatorFadeAlpha: 'plugins.advanced-timer.rotator.fadeAlpha',
    rotatorSources: 'plugins.advanced-timer.rotator.sourcesShown',
    rotatorSave: 'plugins.advanced-timer.rotator.save',
    thresholdTitle: 'plugins.advanced-timer.thresholdEffects.sectionTitle',
    thresholdDescription: 'plugins.advanced-timer.thresholdEffects.sectionDesc',
    thresholdEnable: 'plugins.advanced-timer.thresholdEffects.enable',
    thresholdSeconds: 'plugins.advanced-timer.thresholdEffects.thresholdSeconds',
    thresholdDirection: 'plugins.advanced-timer.thresholdEffects.direction',
    thresholdBoth: 'plugins.advanced-timer.thresholdEffects.directionBoth',
    thresholdPositive: 'plugins.advanced-timer.thresholdEffects.directionPositive',
    thresholdNegative: 'plugins.advanced-timer.thresholdEffects.directionNegative',
    thresholdDuration: 'plugins.advanced-timer.thresholdEffects.durationMs',
    thresholdBuiltin: 'plugins.advanced-timer.thresholdEffects.builtin',
    thresholdIntensity: 'plugins.advanced-timer.thresholdEffects.intensity',
    frameSlotsTitle: 'plugins.advanced-timer.thresholdEffects.frameSlotsTitle',
    frameSlot: 'plugins.advanced-timer.thresholdEffects.frameSlotN',
    frameEmpty: 'plugins.advanced-timer.thresholdEffects.frameEmpty',
    frameLabel: 'plugins.advanced-timer.thresholdEffects.frameLabel',
    frameUpload: 'plugins.advanced-timer.thresholdEffects.frameUpload',
    frameRemove: 'plugins.advanced-timer.thresholdEffects.frameRemove',
    saveSettings: 'plugins.advanced-timer.thresholdEffects.save',
    effectFlame: 'plugins.advanced-timer.runtime.effectFlame',
    effectLightning: 'plugins.advanced-timer.runtime.effectLightning',
    effectSparks: 'plugins.advanced-timer.runtime.effectSparks',
    effectPulseGlow: 'plugins.advanced-timer.runtime.effectPulseGlow',
    effectRainbowShake: 'plugins.advanced-timer.runtime.effectRainbowShake',
    effectGoldFlux: 'plugins.advanced-timer.runtime.effectGoldFlux',
    times: 'plugins.advanced-timer.runtime.times',
    chevron: 'plugins.advanced-timer.runtime.chevron'
});

function tr(name, params) {
    return t(TIMER_TEXT_KEYS[name], params);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    await waitForI18nReady();
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

async function waitForI18nReady() {
    if (!window.i18n) {
        return;
    }

    if (window.i18n.initialized) {
        return;
    }

    if (window.i18n.ready && typeof window.i18n.ready.then === 'function') {
        await window.i18n.ready;
        return;
    }

    await window.i18n.init();
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function setupNav() {
    document.querySelectorAll('[data-tab]').forEach(el => {
        el.addEventListener('click', e => showTab(e.currentTarget.getAttribute('data-tab'), e.currentTarget));
    });
}

function showTab(name, triggerEl) {
    document.querySelectorAll('.at-nav-btn').forEach(b => b.classList.remove('active'));
    const sidebarBtn = document.querySelector('.at-nav-btn[data-tab="' + name + '"]');
    if (sidebarBtn) sidebarBtn.classList.add('active');
    document.querySelectorAll('.at-tab-content').forEach(t => { t.style.display = 'none'; });
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
            el.className = 'at-timer-display' + (data.state === 'running' ? ' running' : '');
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
            // Save section states before replacing
            const oldCard = document.getElementById('tc-' + id);
            const sectionStates = {};
            if (oldCard) {
                oldCard.querySelectorAll('.at-section-toggle').forEach(btn => {
                    const sec = btn.getAttribute('data-sec');
                    const body = oldCard.querySelector('[data-sec-body="' + sec + '"]');
                    sectionStates[sec] = body ? body.classList.contains('open') : false;
                });
            }
            renderSingleTimer(data.timer);
            renderDashboardStats();
            // Restore section states
            const newCard = document.getElementById('tc-' + id);
            if (newCard && Object.keys(sectionStates).length > 0) {
                newCard.querySelectorAll('.at-section-toggle').forEach(btn => {
                    const sec = btn.getAttribute('data-sec');
                    const wasOpen = sectionStates[sec];
                    if (wasOpen !== undefined) {
                        const body = newCard.querySelector('[data-sec-body="' + sec + '"]');
                        if (body) {
                            body.classList.toggle('open', wasOpen);
                            btn.classList.toggle('open', wasOpen);
                            const chev = btn.querySelector('.chevron');
                            if (chev) chev.style.transform = wasOpen ? 'rotate(180deg)' : '';
                        }
                    }
                });
            }
        }
    } catch (e) { console.error('refreshTimer', e); }
}

function renderTimers() {
    const container = document.getElementById('timers-container');
    renderDashboardStats();
    if (timers.length === 0) {
        container.innerHTML = `<div class="at-empty-state">
            <div class="at-empty-state-icon">${tr('timer')}</div>
            <div class="at-empty-state-text">${t('plugins.advanced-timer.ui.messages.noTimers')}</div>
            <button class="btn btn-primary" data-tab="create">${t('plugins.advanced-timer.ui.messages.createFirst')}</button>
        </div>`;
        container.querySelector('[data-tab]')?.addEventListener('click', e => showTab('create', e.currentTarget));
        return;
    }
    container.innerHTML = '';
    timers.forEach(t => container.appendChild(buildTimerCard(t)));
}

function renderDashboardStats() {
    const total = timers.length;
    const running = timers.filter(t => t.state === 'running').length;
    const paused = timers.filter(t => t.state === 'paused').length;
    const stopped = timers.filter(t => t.state === 'stopped').length;

    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    };

    setValue('at-stat-total', total);
    setValue('at-stat-running', running);
    setValue('at-stat-paused', paused);
    setValue('at-stat-stopped', stopped);
}

function renderSingleTimer(timer) {
    const existing = document.getElementById('tc-' + timer.id);
    const card = buildTimerCard(timer);
    if (existing) existing.replaceWith(card);
    else document.getElementById('timers-container').appendChild(card);
    renderDashboardStats();
}

// ---------------------------------------------------------------------------
// Build timer card
// ---------------------------------------------------------------------------

function buildTimerCard(t) {
    const card = document.createElement('div');
    card.className = 'at-timer-card';
    card.id = 'tc-' + t.id;
    const overlayUrl = window.location.origin + '/advanced-timer/overlay?timer=' + t.id;
    const tiktokCopyKey = 'common.tiktok_studio.copy_url';
    const translatedTikTokCopy = window.i18n?.t?.(tiktokCopyKey);
    const tiktokCopyLabel = translatedTikTokCopy &&
      translatedTikTokCopy !== tiktokCopyKey
        ? translatedTikTokCopy
        : 'TikTok-Studio-URL kopieren';

    card.innerHTML =
        // Header
        '<div class="at-timer-card-header">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
            '<span class="at-timer-title">' + escapeHtml(t.name) + '</span>' +
            '<span class="at-timer-mode-badge">' + getModeLabel(t.mode) + '</span>' +
          '</div>' +
          '<span class="at-timer-state-badge at-state-' + t.state + '">' + getStateLabel(t.state) + '</span>' +
        '</div>' +
        // Display
        '<div class="at-timer-display' + (t.state === 'running' ? ' running' : '') + '" id="td-' + t.id + '">' +
          formatTime(t.current_value) +
        '</div>' +
        // Controls
        '<div class="timer-controls" id="tctrl-' + t.id + '">' + timerControlButtons(t) + '</div>' +
        // Quick +/-
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">' +
          '<button class="btn btn-secondary btn-xs" data-at="add" data-s="10">' + tr('quickAddTen') + '</button>' +
          '<button class="btn btn-secondary btn-xs" data-at="add" data-s="30">' + tr('quickAddThirty') + '</button>' +
          '<button class="btn btn-secondary btn-xs" data-at="add" data-s="60">' + tr('quickAddMinute') + '</button>' +
          '<button class="btn btn-secondary btn-xs" data-at="add" data-s="300">' + tr('quickAddFiveMinutes') + '</button>' +
          '<button class="btn btn-secondary btn-xs" data-at="remove" data-s="10">' + tr('quickRemoveTen') + '</button>' +
          '<button class="btn btn-secondary btn-xs" data-at="remove" data-s="30">' + tr('quickRemoveThirty') + '</button>' +
        '</div>' +
        // Overlay URL
        '<div class="at-overlay-row">' +
          '<span style="font-size:0.78rem;color:var(--color-text-secondary);flex-shrink:0;">' + tr('overlay') + '</span>' +
          '<span class="at-overlay-url-text">' + overlayUrl + '</span>' +
          '<button class="btn btn-xs btn-secondary copy-url-btn" title="' + tr('copyOverlayUrl') + '">' + tr('copyOverlayUrl') + '</button>' +
          '<button type="button" class="btn btn-xs btn-secondary" data-copy-tiktok-studio-url data-overlay-url-source="self" data-overlay-url-attribute="data-url" data-url="' + escapeHtml(overlayUrl) + '" data-i18n="common.tiktok_studio.copy_url">' + escapeHtml(tiktokCopyLabel) + '</button>' +
        '</div>' +
        // Settings section
        '<button class="at-section-toggle" data-sec="settings">' + tr('settings') + ' <span class="chevron">' + tr('chevron') + '</span></button>' +
        '<div class="at-section-body" data-sec-body="settings">' +
          '<div class="at-settings-grid">' +
            '<div class="at-field-group"><label class="at-field-label">' + tr('timerName') + '</label>' +
              '<input class="at-field-input" type="text" data-field="name" value="' + escapeHtml(t.name) + '"></div>' +
            '<div class="at-field-group"><label class="at-field-label">' + tr('initialDuration') + '</label>' +
              '<input class="at-field-input" type="number" min="0" data-field="initial_duration" value="' + (t.initial_duration || 0) + '"></div>' +
            '<div class="at-field-group"><label class="at-field-label">' + tr('expiryAction') + '</label>' +
              '<select class="at-field-input" data-field="expiry_action">' +
                '<option value="none"' + ((t.expiry_action||'none')==='none'?' selected':'') + '>' + tr('expiryNone') + '</option>' +
                '<option value="restart"' + (t.expiry_action==='restart'?' selected':'') + '>' + tr('expiryRestart') + '</option>' +
                '<option value="alert"' + (t.expiry_action==='alert'?' selected':'') + '>' + tr('expiryAlert') + '</option>' +
                '<option value="sound"' + (t.expiry_action==='sound'?' selected':'') + '>' + tr('expirySound') + '</option>' +
                '<option value="scene_change"' + (t.expiry_action==='scene_change'?' selected':'') + '>' + tr('expirySceneChange') + '</option>' +
                '<option value="chain"' + (t.expiry_action==='chain'?' selected':'') + '>' + tr('expiryTriggerChain') + '</option>' +
              '</select></div>' +
          '</div>' +
          '<div style="margin-top:10px;"><button class="btn btn-sm btn-primary save-settings-btn">' + tr('saveSettings') + '</button></div>' +
        '</div>' +
        // Interactions section
        '<button class="at-section-toggle open" data-sec="interactions">' + tr('interactions') + ' <span class="chevron" style="transform:rotate(180deg);">' + tr('chevron') + '</span></button>' +
        '<div class="at-section-body open" data-sec-body="interactions">' +
          '<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:10px;">' + tr('interactionsHint') + '</p>' +
          '<div class="at-interactions-grid">' +
            interactionRow('per_coin',      tr('perCoin'),      t.per_coin) +
            interactionRow('per_subscribe', tr('perSubscribe'), t.per_subscribe) +
            interactionRow('per_follow',    tr('perFollow'),    t.per_follow) +
            interactionRow('per_share',     tr('perShare'),     t.per_share) +
            interactionRow('per_like',      tr('perLike'),      t.per_like) +
            interactionRow('per_chat',      tr('perChat'),      t.per_chat) +
          '</div>' +
          '<a class="at-adv-events-link" data-adv-timer="' + t.id + '">' + tr('advancedRulesLink') + '</a>' +
          '<span class="at-save-indicator" id="si-' + t.id + '">' + tr('saved') + '</span>' +
        '</div>' +
        // Multiplier section
        '<button class="at-section-toggle open" data-sec="multiplier">' + tr('multiplier') + ' <span class="chevron" style="transform:rotate(180deg);">' + tr('chevron') + '</span></button>' +
        '<div class="at-section-body open" data-sec-body="multiplier">' +
          '<div class="at-multiplier-row">' +
            '<label class="at-toggle-switch"><input type="checkbox" class="multiplier-toggle"' + (t.multiplier_enabled ? ' checked' : '') + '><span class="at-toggle-slider"></span></label>' +
            '<span style="font-size:0.85rem;">' + tr('times') + '</span>' +
            '<input class="at-interaction-input multiplier-value-input" type="number" min="0.01" step="0.01" value="' + (t.multiplier || 1) + '" style="width:70px;">' +
            '<span class="at-interaction-unit">' + tr('multiplier') + '</span>' +
            '<span style="font-size:0.78rem;color:var(--color-text-secondary);">' + tr('multiplierDescription') + '</span>' +
          '</div>' +
        '</div>' +
        // Keyboard Shortcuts section
        '<button class="at-section-toggle" data-sec="shortcuts">' + tr('keyboardShortcuts') + ' <span class="chevron">' + tr('chevron') + '</span></button>' +
        '<div class="at-section-body" data-sec-body="shortcuts">' +
          '<div class="at-shortcuts-grid">' +
            '<div class="at-shortcut-row"><span class="at-shortcut-label">' + tr('startPause') + '</span><input class="shortcut-input" type="text" data-sc="shortcut_start_pause" value="' + escapeHtml(t.shortcut_start_pause||'') + '" placeholder="ALT+P"></div>' +
            '<div class="at-shortcut-row"><span class="at-shortcut-label">' + tr('increase') + '</span><input class="shortcut-input" type="text" data-sc="shortcut_increase" value="' + escapeHtml(t.shortcut_increase||'') + '" placeholder="ALT+S"></div>' +
            '<div class="at-shortcut-row"><span class="at-shortcut-label">' + tr('reduce') + '</span><input class="shortcut-input" type="text" data-sc="shortcut_decrease" value="' + escapeHtml(t.shortcut_decrease||'') + '" placeholder="ALT+A"></div>' +
            '<div class="at-shortcut-row"><span class="at-shortcut-label">' + tr('stepSeconds') + '</span><input class="shortcut-input" type="number" min="1" data-sc="shortcut_step" value="' + (t.shortcut_step||60) + '" style="width:70px;"></div>' +
          '</div>' +
          '<div style="margin-top:10px;"><button class="btn btn-sm btn-primary save-shortcuts-btn">' + tr('saveShortcuts') + '</button></div>' +
        '</div>' +
        // Activity log section
        '<button class="at-section-toggle" data-sec="log">' + tr('activityLog') + ' <span class="chevron">▼</span></button>' +
        '<div class="at-section-body" data-sec-body="log">' +
          '<div class="at-log-entries" id="log-' + t.id + '"><p style="color:var(--color-text-secondary);font-size:0.82rem;">' + tr('loadLogHint') + '</p></div>' +
          '<div style="margin-top:8px;display:flex;gap:8px;">' +
            '<button class="btn btn-sm btn-secondary reload-log-btn">' + tr('refresh') + '</button>' +
            '<a href="/api/advanced-timer/timers/' + t.id + '/export-logs" target="_blank" class="btn btn-sm btn-secondary">' + tr('export') + '</a>' +
          '</div>' +
        '</div>' +
        // Gift Overrides section
        '<button class="at-section-toggle" data-sec="gift-overrides">' + tr('giftOverrides') + ' <span class="chevron">' + tr('chevron') + '</span></button>' +
        '<div class="at-section-body" data-sec-body="gift-overrides">' +
          '<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:10px;">' + tr('giftOverridesDescription') + '</p>' +
          '<div class="gift-override-list" id="gol-' + t.id + '"><p style="color:var(--color-text-secondary);font-size:0.82rem;">' + tr('clickToLoad') + '</p></div>' +
          '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">' +
            '<select class="at-field-input" id="go-gift-select-' + t.id + '" style="flex:1;min-width:140px;"><option value="">' + tr('selectGift') + '</option></select>' +
            '<input type="number" class="at-field-input" id="go-seconds-' + t.id + '" placeholder="' + tr('seconds') + '" value="30" min="0" step="0.01" style="width:90px;">' +
            '<button class="btn btn-sm btn-primary" id="go-add-btn-' + t.id + '">' + tr('add') + '</button>' +
          '</div>' +
        '</div>' +
        // Rotator section
        '<button class="at-section-toggle" data-sec="rotator">' + tr('rotatorTitle') + ' <span class="chevron">' + tr('chevron') + '</span></button>' +
        '<div class="at-section-body" data-sec-body="rotator">' +
          '<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:10px;">' + tr('rotatorDescription') + '</p>' +
          '<div class="at-rotator-grid" id="rotator-form-' + t.id + '">' +
            '<label class="at-rotator-row"><span>' + tr('rotatorEnable') + '</span>' +
              '<label class="at-toggle-switch"><input type="checkbox" data-rot="enabled" checked><span class="at-toggle-slider"></span></label></label>' +
            '<label class="at-rotator-row"><span>' + tr('rotatorPosition') + '</span>' +
              '<select class="at-field-input" data-rot="position" style="width:140px;">' +
                '<option value="top">' + tr('rotatorTop') + '</option>' +
                '<option value="bottom">' + tr('rotatorBottom') + '</option>' +
                '<option value="left">' + tr('rotatorLeft') + '</option>' +
                '<option value="right">' + tr('rotatorRight') + '</option>' +
              '</select></label>' +
            '<label class="at-rotator-row"><span>' + tr('rotatorSlots') + '</span>' +
              '<input class="at-field-input" type="number" data-rot="slot_count" min="1" max="8" value="1" style="width:80px;"></label>' +
            '<label class="at-rotator-row"><span>' + tr('rotatorRotation') + '</span>' +
              '<input class="at-field-input" type="number" data-rot="rotation_interval_ms" min="800" max="30000" value="4500" style="width:90px;"></label>' +
            '<label class="at-rotator-row"><span>' + tr('rotatorMinSeconds') + '</span>' +
              '<input class="at-field-input" type="number" data-rot="min_seconds_to_show" min="0" step="0.1" value="0" style="width:80px;"></label>' +
            '<label class="at-rotator-row"><span>' + tr('rotatorGiftImage') + '</span>' +
              '<label class="at-toggle-switch"><input type="checkbox" data-rot="show_gift_images" checked><span class="at-toggle-slider"></span></label></label>' +
            '<label class="at-rotator-row"><span>' + tr('rotatorGiftName') + '</span>' +
              '<label class="at-toggle-switch"><input type="checkbox" data-rot="show_gift_names" checked><span class="at-toggle-slider"></span></label></label>' +
            '<label class="at-rotator-row"><span>' + tr('rotatorTimeDelta') + '</span>' +
              '<label class="at-toggle-switch"><input type="checkbox" data-rot="show_time_delta" checked><span class="at-toggle-slider"></span></label></label>' +
            '<label class="at-rotator-row"><span>' + tr('rotatorSourceEmoji') + '</span>' +
              '<label class="at-toggle-switch"><input type="checkbox" data-rot="show_source_emoji" checked><span class="at-toggle-slider"></span></label></label>' +
            '<label class="at-rotator-row"><span>' + tr('rotatorFontScale') + '</span>' +
              '<input class="at-field-input" type="number" data-rot="font_scale" min="0.5" max="2.0" step="0.05" value="1.0" style="width:80px;"></label>' +
            '<label class="at-rotator-row"><span>' + tr('rotatorFadeAlpha') + '</span>' +
              '<input class="at-field-input" type="number" data-rot="fade_alpha" min="0.3" max="1.0" step="0.05" value="0.92" style="width:80px;"></label>' +
          '</div>' +
          '<p style="font-size:0.78rem;color:var(--color-text-secondary);margin:10px 0 4px;">' + tr('rotatorSources') + '</p>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;" id="rotator-sources-' + t.id + '">' +
            '<label class="at-source-chip"><input type="checkbox" data-rot-src="like" checked> ' + tr('sourceLike') + '</label>' +
            '<label class="at-source-chip"><input type="checkbox" data-rot-src="coin" checked> ' + tr('sourceCoin') + '</label>' +
            '<label class="at-source-chip"><input type="checkbox" data-rot-src="override" checked> ' + tr('sourceCustomGift') + '</label>' +
            '<label class="at-source-chip"><input type="checkbox" data-rot-src="follow" checked> ' + tr('sourceFollow') + '</label>' +
            '<label class="at-source-chip"><input type="checkbox" data-rot-src="subscribe" checked> ' + tr('sourceSubscribe') + '</label>' +
            '<label class="at-source-chip"><input type="checkbox" data-rot-src="share" checked> ' + tr('sourceShare') + '</label>' +
            '<label class="at-source-chip"><input type="checkbox" data-rot-src="chat" checked> ' + tr('sourceChat') + '</label>' +
            '<label class="at-source-chip"><input type="checkbox" data-rot-src="manual" checked> ' + tr('sourceManual') + '</label>' +
            '<label class="at-source-chip"><input type="checkbox" data-rot-src="flow" checked> ' + tr('sourceFlow') + '</label>' +
            '<label class="at-source-chip"><input type="checkbox" data-rot-src="rule" checked> ' + tr('sourceRule') + '</label>' +
          '</div>' +
          '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;">' +
            '<button class="btn btn-sm btn-primary save-rotator-btn" data-timer-id="' + t.id + '">' + tr('rotatorSave') + '</button>' +
            '<span class="at-save-indicator" id="rot-si-' + t.id + '">' + tr('saved') + '</span>' +
          '</div>' +
        '</div>' +
        // Threshold Effects section
        '<button class="at-section-toggle" data-sec="threshold">' + tr('thresholdTitle') + ' <span class="chevron">' + tr('chevron') + '</span></button>' +
        '<div class="at-section-body" data-sec-body="threshold">' +
          '<p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:10px;">' + tr('thresholdDescription') + '</p>' +
          '<div class="at-rotator-grid" id="threshold-form-' + t.id + '">' +
            '<label class="at-rotator-row"><span>' + tr('thresholdEnable') + '</span>' +
              '<label class="at-toggle-switch"><input type="checkbox" data-thr="enabled" checked><span class="at-toggle-slider"></span></label></label>' +
            '<label class="at-rotator-row"><span>' + tr('thresholdSeconds') + '</span>' +
              '<input class="at-field-input" type="number" data-thr="threshold_seconds" min="0.1" step="1" value="60" style="width:90px;"></label>' +
            '<label class="at-rotator-row"><span>' + tr('thresholdDirection') + '</span>' +
              '<select class="at-field-input" data-thr="direction" style="width:120px;">' +
                '<option value="both">' + tr('thresholdBoth') + '</option>' +
                '<option value="positive">' + tr('thresholdPositive') + '</option>' +
                '<option value="negative">' + tr('thresholdNegative') + '</option>' +
              '</select></label>' +
            '<label class="at-rotator-row"><span>' + tr('thresholdDuration') + '</span>' +
              '<input class="at-field-input" type="number" data-thr="duration_ms" min="200" max="10000" step="100" value="1500" style="width:90px;"></label>' +
            '<label class="at-rotator-row"><span>' + tr('thresholdBuiltin') + '</span>' +
              '<select class="at-field-input" data-thr="builtin_animation" style="width:160px;">' +
                '<option value="flame">' + tr('effectFlame') + '</option>' +
                '<option value="lightning">' + tr('effectLightning') + '</option>' +
                '<option value="sparks">' + tr('effectSparks') + '</option>' +
                '<option value="pulse-glow">' + tr('effectPulseGlow') + '</option>' +
                '<option value="rainbow-shake">' + tr('effectRainbowShake') + '</option>' +
                '<option value="gold-flux">' + tr('effectGoldFlux') + '</option>' +
              '</select></label>' +
            '<label class="at-rotator-row"><span>' + tr('thresholdIntensity') + '</span>' +
              '<input class="at-field-input" type="number" data-thr="intensity" min="0.5" max="2.0" step="0.05" value="1.0" style="width:80px;"></label>' +
          '</div>' +
          '<p style="font-size:0.78rem;color:var(--color-text-secondary);margin:12px 0 4px;">' + tr('frameSlotsTitle') + '</p>' +
          '<div id="threshold-frames-' + t.id + '" class="at-frame-slot-grid"></div>' +
          '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
            '<button class="btn btn-sm btn-primary save-threshold-btn" data-timer-id="' + t.id + '">' + tr('saveSettings') + '</button>' +
            '<span class="at-save-indicator" id="thr-si-' + t.id + '">' + tr('saved') + '</span>' +
          '</div>' +
        '</div>' +
        // Delete
        '<div style="margin-top:12px;border-top:1px solid var(--color-border);padding-top:12px;display:flex;justify-content:flex-end;">' +
          '<button class="btn btn-sm btn-danger delete-timer-btn">' + tr('deleteTimer') + '</button>' +
        '</div>';

    const tid = t.id;

    // Section toggles
    card.querySelectorAll('.at-section-toggle').forEach(btn => {
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

    // Interaction inputs - auto-save debounced 500ms
    const debounceMap = new Map();
    card.querySelectorAll('.at-interaction-input[data-int]').forEach(inp => {
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

    // Gift overrides: populate select on first open
    let goLoaded = false;
    card.querySelector('[data-sec="gift-overrides"]')?.addEventListener('click', () => {
        if (!goLoaded) {
            goLoaded = true;
            loadGiftOverrides(tid);
            populateGiftSelect(tid);
        }
    });

    // Gift override: add button
    card.querySelector('#go-add-btn-' + tid)?.addEventListener('click', () => addGiftOverride(tid));

    // Rotator: load settings on first open
    let rotLoaded = false;
    card.querySelector('[data-sec="rotator"]')?.addEventListener('click', () => {
        if (!rotLoaded) {
            rotLoaded = true;
            loadRotatorSettings(tid, card);
        }
    });
    card.querySelector('.save-rotator-btn[data-timer-id="' + tid + '"]')?.addEventListener('click', () => saveRotatorSettings(tid, card));

    // Threshold Effects: load settings on first open
    let thrLoaded = false;
    card.querySelector('[data-sec="threshold"]')?.addEventListener('click', () => {
        if (!thrLoaded) {
            thrLoaded = true;
            loadThresholdSettings(tid, card);
        }
    });
    card.querySelector('.save-threshold-btn[data-timer-id="' + tid + '"]')?.addEventListener('click', () => saveThresholdSettings(tid, card));

    // Delete
    card.querySelector('.delete-timer-btn')?.addEventListener('click', () => deleteTimer(tid));

    return card;
}

function interactionRow(field, label, value) {
    return '<div class="at-interaction-row">' +
        '<span class="at-interaction-label">' + label + '</span>' +
        '<div class="at-interaction-input-wrap">' +
            '<input class="at-interaction-input" type="number" step="0.01" data-int="' + field + '" value="' + (value || 0) + '">' +
            '<span class="at-interaction-unit">s</span>' +
        '</div>' +
    '</div>';
}

function timerControlButtons(t) {
    let html = '';
    if (t.state !== 'running') html += '<button class="btn btn-success btn-sm" data-ctrl="start">' + tr('start') + '</button>';
    if (t.state === 'running') html += '<button class="btn btn-warning btn-sm" data-ctrl="pause">' + tr('pause') + '</button>';
    if (t.state === 'running' || t.state === 'paused') html += '<button class="btn btn-danger btn-sm" data-ctrl="stop">' + tr('stop') + '</button>';
    html += '<button class="btn btn-secondary btn-sm" data-ctrl="reset">' + tr('reset') + '</button>';
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
    if (!confirm(tr('deleteTimerConfirm'))) return;
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
    card.querySelectorAll('.at-interaction-input[data-int]').forEach(inp => {
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
            container.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.82rem;">' + tr('noActivity') + '</p>';
            return;
        }
        container.innerHTML = data.logs.map(l => {
            const sign = l.value_change > 0 ? 'positive' : (l.value_change < 0 ? 'negative' : '');
            const cs = l.value_change ? (l.value_change > 0 ? '+' : '') + l.value_change.toFixed(2) + 's' : '';
            return '<div class="at-log-entry">' +
                '<span>' + escapeHtml(l.event_type) + (l.user_name ? ' ? ' + escapeHtml(l.user_name) : '') +
                (l.description ? '<br><small style="color:var(--color-text-secondary)">' + escapeHtml(l.description) + '</small>' : '') + '</span>' +
                (cs ? '<span class="at-log-change ' + sign + '">' + cs + '</span>' : '') +
                '<span class="at-log-time">' + new Date(l.timestamp * 1000).toLocaleTimeString() + '</span>' +
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
          '<div style="font-size:1.2rem;font-weight:700;margin-bottom:16px;">' + tr('advancedRulesLink') + '</div>' +
          '<p style="font-size:0.82rem;color:var(--color-text-secondary);margin-bottom:14px;">' + tr('advancedRulesDescription') + '</p>' +
          '<div id="adv-events-list"></div>' +
          '<div style="display:flex;gap:10px;margin-top:14px;">' +
            '<button class="btn btn-sm btn-primary" id="add-adv-event-btn">' + tr('addEventRule') + '</button>' +
            '<button class="btn btn-sm btn-secondary" id="close-adv-events-btn">' + tr('close') + '</button>' +
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
        container.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.85rem;text-align:center;padding:12px;">' + tr('noAdvancedRules') + '</p>';
        return;
    }
    container.innerHTML = events.map(ev => {
        const cStr = formatConditions(ev.event_type, ev.conditions);
        return '<div style="border:1px solid var(--color-border);border-radius:8px;padding:10px;margin-bottom:8px;font-size:0.84rem;" data-event-id="' + ev.id + '">' +
            '<div style="font-weight:600;">' + getEventLabel(ev.event_type) + ' -> ' + getActionLabel(ev.action_type) + ' ' + ev.action_value + 's</div>' +
            (cStr ? '<div style="color:var(--color-text-secondary);margin-top:2px;">' + cStr + '</div>' : '') +
            '<div style="margin-top:8px;display:flex;gap:6px;">' +
              '<button class="btn btn-xs btn-secondary adv-edit-btn">' + tr('edit') + '</button>' +
              '<button class="btn btn-xs btn-danger adv-del-btn">' + tr('delete') + '</button>' +
            '</div></div>';
    }).join('');

    // Use event delegation - attach listener once per container using WeakSet
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
    return {
        gift: tr('eventGift'), like: tr('eventLike'), follow: tr('eventFollow'),
        share: tr('eventShare'), subscribe: tr('eventSubscribe'), chat: tr('eventChat')
    }[t] || t;
}
function getActionLabel(t) {
    return { add_time: tr('addTime'), remove_time: tr('removeTime'), set_value: tr('setValue') }[t] || t;
}
function formatConditions(type, cond) {
    if (!cond || !Object.keys(cond).length) return '';
    const p = [];
    if (cond.giftName) p.push(tr('conditionGift', { value: cond.giftName }));
    if (cond.minCoins) p.push(tr('conditionMinCoins', { value: cond.minCoins }));
    if (cond.minLikes) p.push(tr('conditionMinLikes', { value: cond.minLikes }));
    if (cond.command) p.push(tr('conditionCommand', { value: cond.command }));
    if (cond.keyword) p.push(tr('conditionKeyword', { value: cond.keyword }));
    return p.join(' · ');
}

async function deleteAdvEvent(id) {
    if (!confirm(tr('deleteEventRuleConfirm'))) return;
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
          '<div style="font-size:1.1rem;font-weight:700;margin-bottom:14px;">' + (eventId ? tr('editEventRule') : tr('addEventRule')) + '</div>' +
          '<div class="at-form-group"><label class="at-form-label">' + tr('eventType') + '</label>' +
            '<select class="at-form-control" id="ee-type">' +
              ['gift','like','follow','share','subscribe','chat'].map(v => '<option value="' + v + '">' + getEventLabel(v) + '</option>').join('') +
            '</select></div>' +
          '<div class="at-form-group"><label class="at-form-label">' + tr('action') + '</label>' +
            '<select class="at-form-control" id="ee-action">' +
              '<option value="add_time">' + tr('addTime') + '</option><option value="remove_time">' + tr('removeTime') + '</option><option value="set_value">' + tr('setValue') + '</option>' +
            '</select></div>' +
          '<div class="at-form-group"><label class="at-form-label">' + tr('valueSeconds') + '</label>' +
            '<input type="number" class="at-form-control" id="ee-value" value="10" min="0" step="0.01"></div>' +
          '<div id="ee-conditions"></div>' +
          '<div style="display:flex;gap:10px;margin-top:16px;">' +
            '<button class="btn btn-sm btn-primary" id="ee-save">' + tr('save') + '</button>' +
            '<button class="btn btn-sm btn-secondary" id="ee-cancel">' + tr('cancel') + '</button>' +
          '</div>' +
        '</div>';
    document.body.appendChild(editor);

    const typeSelect = editor.querySelector('#ee-type');
    const renderCond = () => {
        const tp = typeSelect.value;
        const c = editor.querySelector('#ee-conditions');
        if (tp === 'gift') {
            c.innerHTML = '<div class="at-form-group"><label class="at-form-label">' + tr('giftName') + '</label><input class="at-form-control" id="ee-gift-name" placeholder="' + tr('giftNamePlaceholder') + '"></div>' +
                '<div class="at-form-group"><label class="at-form-label">' + tr('minCoins') + '</label><input type="number" class="at-form-control" id="ee-min-coins" value="0" min="0"></div>';
        } else if (tp === 'like') {
            c.innerHTML = '<div class="at-form-group"><label class="at-form-label">' + tr('minLikes') + '</label><input type="number" class="at-form-control" id="ee-min-likes" value="0" min="0"></div>';
        } else if (tp === 'chat') {
            c.innerHTML = '<div class="at-form-group"><label class="at-form-label">' + tr('commandPrefix') + '</label><input class="at-form-control" id="ee-command" placeholder="!time"></div>' +
                '<div class="at-form-group"><label class="at-form-label">' + tr('keywordContains') + '</label><input class="at-form-control" id="ee-keyword" placeholder="' + tr('keywordPlaceholder') + '"></div>';
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
            else alert(data.error || tr('failedCreateTimer'));
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
            '<div class="at-profile-card" data-profile-id="' + escapeHtml(p.id) + '">' +
              '<div><div class="at-profile-name">' + escapeHtml(p.name) + '</div>' +
              '<div class="at-profile-meta">' + new Date(p.created_at * 1000).toLocaleDateString() + '</div></div>' +
              '<div style="display:flex;gap:8px;">' +
                '<button class="btn btn-xs btn-primary profile-apply-btn">' + tr('apply') + '</button>' +
                '<button class="btn btn-xs btn-danger profile-del-btn">' + tr('delete') + '</button>' +
              '</div>' +
            '</div>').join('')
        : '<p style="color:var(--color-text-secondary);">' + tr('noSavedProfiles') + '</p>';

    // Event delegation - safe, no inline onclick
    container.querySelectorAll('[data-profile-id]').forEach(card => {
        const pid = card.getAttribute('data-profile-id');
        card.querySelector('.profile-apply-btn')?.addEventListener('click', () => applyProfile(pid));
        card.querySelector('.profile-del-btn')?.addEventListener('click', () => deleteProfile(pid));
    });

    const saveBtn = document.getElementById('save-profile-btn');
    if (saveBtn && !_saveProfileBtnBound.has(saveBtn)) {
        _saveProfileBtnBound.add(saveBtn);
        saveBtn.addEventListener('click', async () => {
            const name = prompt(tr('profileNamePrompt'));
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
    if (!confirm(tr('applyProfileConfirm'))) return;
    try {
        const res = await fetch('/api/advanced-timer/profiles/' + id + '/apply', { method: 'POST' });
        const data = await res.json();
        if (data.success) { await loadTimers(); showTab('timers'); }
    } catch (e) { console.error('applyProfile', e); }
}

async function deleteProfile(id) {
    if (!confirm(tr('deleteProfileConfirm'))) return;
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
    return {
        countdown: tr('modeCountdown'), countup: tr('modeCountup'), stopwatch: tr('modeStopwatch'),
        loop: tr('modeLoop'), interval: tr('modeInterval')
    }[mode] || mode;
}
function getStateLabel(state) {
    return {
        running: tr('stateRunning'), paused: tr('statePaused'), stopped: tr('stateStopped'), completed: tr('stateCompleted')
    }[state] || state;
}
function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text ?? '';
    return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Gift Overrides
// ---------------------------------------------------------------------------

async function loadGiftOverrides(timerId) {
    const container = document.getElementById('gol-' + timerId);
    if (!container) return;
    try {
        const res = await fetch('/api/advanced-timer/timers/' + timerId + '/gift-overrides');
        const data = await res.json();
        if (!data.success || !data.overrides.length) {
            container.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.82rem;">' + tr('noGiftOverrides') + '</p>';
            return;
        }
        container.innerHTML = data.overrides.map(o =>
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--color-border);font-size:0.84rem;">' +
                '<span><strong>' + escapeHtml(o.gift_name) + '</strong> -> ' + (o.seconds > 0 ? '+' : '') + o.seconds + 's</span>' +
                '<button class="btn btn-xs btn-danger go-del-btn" data-go-id="' + o.id + '" data-timer="' + timerId + '">' + tr('delete') + '</button>' +
            '</div>'
        ).join('');
        // Attach delete handlers
        container.querySelectorAll('.go-del-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteGiftOverride(btn.getAttribute('data-go-id'), timerId));
        });
    } catch (e) { console.error('loadGiftOverrides', e); }
}

function populateGiftSelect(timerId) {
    const select = document.getElementById('go-gift-select-' + timerId);
    if (!select) return;
    // Keep existing options if already populated
    if (select.options.length > 1) return;
    // Add gift catalog items
    for (const gift of giftCatalog) {
        const opt = document.createElement('option');
        opt.value = gift.id;
        opt.textContent = gift.name + ' (' + gift.diamond_count + ' ' + tr('diamonds') + ')';
        select.appendChild(opt);
    }
}

async function addGiftOverride(timerId) {
    const select = document.getElementById('go-gift-select-' + timerId);
    const secondsInput = document.getElementById('go-seconds-' + timerId);
    if (!select || !secondsInput) return;
    const giftId = parseInt(select.value);
    if (!giftId) { alert(tr('selectGiftAlert')); return; }
    const seconds = parseFloat(secondsInput.value) || 0;
    // Find gift name from catalog
    const gift = giftCatalog.find(g => g.id === giftId);
    const giftName = gift ? gift.name : tr('unknownGift');
    try {
        const res = await fetch('/api/advanced-timer/timers/' + timerId + '/gift-overrides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gift_id: giftId, gift_name: giftName, seconds })
        });
        const data = await res.json();
        if (data.success) {
            select.value = '';
            secondsInput.value = '30';
            loadGiftOverrides(timerId);
        } else {
            alert(data.error || tr('failedSave'));
        }
    } catch (e) { console.error('addGiftOverride', e); }
}

async function deleteGiftOverride(overrideId, timerId) {
    if (!confirm(tr('removeGiftOverride'))) return;
    try {
        const res = await fetch('/api/advanced-timer/gift-overrides/' + overrideId, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) loadGiftOverrides(timerId);
    } catch (e) { console.error('deleteGiftOverride', e); }
}

// ---------------------------------------------------------------------------
// Rotator + Threshold Effects
// ---------------------------------------------------------------------------

async function loadRotatorSettings(timerId, card) {
    try {
        const res = await fetch('/api/advanced-timer/timers/' + timerId + '/rotator');
        const data = await res.json();
        if (!data.success || !data.settings) return;
        const s = data.settings;
        // Populate the form fields
        card.querySelectorAll('[data-rot]').forEach(input => {
            const key = input.getAttribute('data-rot');
            if (input.type === 'checkbox') {
                input.checked = !!s[key];
            } else if (s[key] != null) {
                input.value = s[key];
            }
        });
        // Sources checkboxes
        const sources = (s.include_sources || '').split(',').map(x => x.trim()).filter(Boolean);
        card.querySelectorAll('[data-rot-src]').forEach(cb => {
            const src = cb.getAttribute('data-rot-src');
            cb.checked = sources.includes(src);
        });
    } catch (e) { console.error('loadRotatorSettings', e); }
}

async function saveRotatorSettings(timerId, card) {
    const payload = {};
    card.querySelectorAll('[data-rot]').forEach(input => {
        const key = input.getAttribute('data-rot');
        if (input.type === 'checkbox') payload[key] = input.checked ? 1 : 0;
        else if (input.type === 'number') payload[key] = parseFloat(input.value) || 0;
        else payload[key] = input.value;
    });
    // Build include_sources array from checkboxes
    const sources = [];
    card.querySelectorAll('[data-rot-src]').forEach(cb => {
        if (cb.checked) sources.push(cb.getAttribute('data-rot-src'));
    });
    payload.include_sources = sources.join(',');

    try {
        const res = await fetch('/api/advanced-timer/timers/' + timerId + '/rotator', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            const ind = document.getElementById('rot-si-' + timerId);
            if (ind) { ind.classList.add('show'); setTimeout(() => ind.classList.remove('show'), 1500); }
        } else {
            alert(data.error || tr('failedSaveRotator'));
        }
    } catch (e) { console.error('saveRotatorSettings', e); }
}

async function loadThresholdSettings(timerId, card) {
    try {
        const res = await fetch('/api/advanced-timer/timers/' + timerId + '/threshold-effects');
        const data = await res.json();
        if (!data.success || !data.settings) return;
        const s = data.settings;
        card.querySelectorAll('[data-thr]').forEach(input => {
            const key = input.getAttribute('data-thr');
            if (input.type === 'checkbox') {
                input.checked = !!s[key];
            } else if (input.type === 'number') {
                input.value = s[key] != null ? s[key] : '';
            } else if (s[key] != null) {
                input.value = s[key];
            }
        });
        renderFrameSlots(timerId, s.uploaded_frames || []);
    } catch (e) { console.error('loadThresholdSettings', e); }
}

async function saveThresholdSettings(timerId, card) {
    const payload = {};
    card.querySelectorAll('[data-thr]').forEach(input => {
        const key = input.getAttribute('data-thr');
        if (input.type === 'checkbox') payload[key] = input.checked ? 1 : 0;
        else if (input.type === 'number') payload[key] = parseFloat(input.value) || 0;
        else payload[key] = input.value;
    });
    try {
        const res = await fetch('/api/advanced-timer/timers/' + timerId + '/threshold-effects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            const ind = document.getElementById('thr-si-' + timerId);
            if (ind) { ind.classList.add('show'); setTimeout(() => ind.classList.remove('show'), 1500); }
        } else {
            alert(data.error || tr('failedSaveThreshold'));
        }
    } catch (e) { console.error('saveThresholdSettings', e); }
}

function renderFrameSlots(timerId, frames) {
    const container = document.getElementById('threshold-frames-' + timerId);
    if (!container) return;
    const frameMap = new Map();
    for (const f of frames) frameMap.set(f.slot, f);

    const html = [];
    for (let slot = 1; slot <= 6; slot++) {
        const f = frameMap.get(slot);
        html.push(
            '<div class="at-frame-slot-card">' +
                '<div class="at-frame-slot-header">' + tr('frameSlot', { n: slot }) + '</div>' +
                (f
                    ? '<div class="at-frame-slot-preview"><img src="' + escapeHtml(f.url) + '" alt="' + tr('frameAlt') + '"></div>' +
                      '<div class="at-frame-slot-name">' + escapeHtml(f.label || f.filename || tr('frameAlt')) + '</div>' +
                      '<button class="btn btn-xs btn-danger delete-frame-btn" data-frame-slot="' + slot + '">' + tr('frameRemove') + '</button>'
                    : '<div class="at-frame-slot-empty">' + tr('frameEmpty') + '</div>') +
                '<form class="at-frame-slot-upload" enctype="multipart/form-data">' +
                  '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" data-frame-slot="' + slot + '">' +
                  '<input type="text" placeholder="' + tr('frameLabel') + '" data-frame-label="' + slot + '" style="margin-top:4px;">' +
                  '<button type="button" class="btn btn-xs btn-primary upload-frame-btn" data-frame-slot="' + slot + '" style="margin-top:4px;">' + tr('frameUpload') + '</button>' +
                '</form>' +
            '</div>'
        );
    }
    container.innerHTML = html.join('');

    // CSP-safe image error handler
    container.querySelectorAll('img').forEach(img => {
        img.addEventListener('error', () => { img.style.display = 'none'; });
    });

    // Attach handlers via delegation on the container
    container.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.delete-frame-btn');
        if (delBtn) {
            const slot = parseInt(delBtn.getAttribute('data-frame-slot'), 10);
            deleteFrame(timerId, slot);
            return;
        }
        const upBtn = e.target.closest('.upload-frame-btn');
        if (upBtn) {
            const slot = parseInt(upBtn.getAttribute('data-frame-slot'), 10);
            uploadFrame(timerId, slot, container);
        }
    });
}

async function uploadFrame(timerId, slot, container) {
    const fileInput = container.querySelector('input[type="file"][data-frame-slot="' + slot + '"]');
    const labelInput = container.querySelector('input[data-frame-label="' + slot + '"]');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert(tr('chooseFile'));
        return;
    }
    const file = fileInput.files[0];
    if (file.size > 8 * 1024 * 1024) {
        alert(tr('frameTooLarge'));
        return;
    }
    const fd = new FormData();
    fd.append('frame', file);
    if (labelInput && labelInput.value) fd.append('label', labelInput.value);
    try {
        const res = await fetch('/api/advanced-timer/timers/' + timerId + '/threshold-effects/frame/' + slot, {
            method: 'POST',
            body: fd
        });
        const data = await res.json();
        if (data.success) {
            // Reload the threshold section
            const card = container.closest('.at-timer-card');
            if (card) loadThresholdSettings(timerId, card);
        } else {
            alert(data.error || tr('uploadFailed'));
        }
    } catch (e) { console.error('uploadFrame', e); alert(tr('uploadError')); }
}

async function deleteFrame(timerId, slot) {
    if (!confirm(tr('removeFrame', { n: slot }))) return;
    try {
        const res = await fetch('/api/advanced-timer/timers/' + timerId + '/threshold-effects/frame/' + slot, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
            const container = document.getElementById('threshold-frames-' + timerId);
            if (container) {
                const card = container.closest('.at-timer-card');
                if (card) loadThresholdSettings(timerId, card);
            }
        } else {
            alert(data.error || tr('deleteFailed'));
        }
    } catch (e) { console.error('deleteFrame', e); }
}



