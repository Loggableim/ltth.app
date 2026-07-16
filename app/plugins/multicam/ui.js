/**
 * Multi-Cam Switcher UI — Geschenkekatalog mit Kamerazuordnung
 */
const socket = io();
let state = {
    connected: false,
    currentScene: null,
    scenes: [],
    locked: false
};
let config = null;
let giftData = [];        // Alle Geschenke aus dem Katalog
let pendingMappings = {}; // Lokale Änderungen (noch nicht gespeichert)
let originalMappings = {};// Ursprüngliche Mappings (für Reset)
let currentFilter = 'all';
let currentSceneFilter = 'all';
let currentSort = 'coins-desc';

function t(key, fallback, params = {}) {
    const translation = window.i18n?.t(key, params);
    if (translation && translation !== key) return translation;
    return String(fallback).replace(/\{\{?(\w+)\}?\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
    ));
}

// ===== SOCKET EVENTS =====
socket.on('connect', () => {
    console.log('Socket connected');
    socket.emit('multicam:join');
    loadState();
});

socket.on('multicam_state', (data) => {
    console.log('State update:', data);
    updateState(data);
});

socket.on('multicam_switch', (data) => {
    console.log('Switch event:', data);
    addLogEntry(data);
});

// ===== STATE =====
function updateState(data) {
    state = { ...state, ...data };

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const currentScene = document.getElementById('currentScene');

    if (state.connected) {
        statusDot.classList.add('connected');
        statusText.textContent = t('plugins.multicam.multicam.status.connected', 'Mit OBS verbunden');
    } else {
        statusDot.classList.remove('connected');
        statusText.textContent = t('plugins.multicam.multicam.status.disconnected', 'Getrennt');
    }

    if (state.currentScene) {
        currentScene.innerHTML = `${t('plugins.multicam.multicam.current_scene', 'Aktuelle Szene:')} <strong>${state.currentScene}</strong>`;
    } else {
        currentScene.innerHTML = `${t('plugins.multicam.multicam.current_scene', 'Aktuelle Szene:')} <strong>-</strong>`;
    }

    updateSceneSelect(state.scenes);
}

function updateSceneSelect(scenes) {
    const select = document.getElementById('sceneSelect');
    select.innerHTML = `<option value="">${t('plugins.multicam.multicam.switcher.select_scene', 'Szene wählen...')}</option>`;
    for (const scene of scenes) {
        const opt = document.createElement('option');
        opt.value = scene;
        opt.textContent = scene;
        select.appendChild(opt);
    }

    // Auch den Kamera-Filter befüllen
    const filterScene = document.getElementById('filter-scene');
    const currentVal = filterScene.value;
    filterScene.innerHTML = `<option value="all">${t('plugins.multicam.labels.alle_kameras', 'Alle Kameras')}</option>`;
    for (const scene of scenes) {
        const opt = document.createElement('option');
        opt.value = scene;
        opt.textContent = scene;
        filterScene.appendChild(opt);
    }
    filterScene.value = currentVal;
}

// ===== INITIAL LOAD =====
async function loadState() {
    try {
        const res = await fetch('/api/multicam/state');
        const data = await res.json();
        if (data.success) updateState(data.state);
    } catch (e) {
        console.error('Failed to load state:', e);
    }
    loadConfig();
    loadGiftMappings();
}

async function loadConfig() {
    try {
        const res = await fetch('/api/multicam/config');
        const data = await res.json();
        if (data.success && data.config) {
            config = data.config;
            if (config.ui && config.ui.hotButtons) {
                renderHotButtons(config.ui.hotButtons);
            }
        }
    } catch (e) {
        console.error('Failed to load config:', e);
    }
}

async function loadGiftMappings() {
    const container = document.getElementById('giftGridContainer');
    container.innerHTML = `<div class="loading-spinner">${t('plugins.multicam.multicam.gift_mapping.loading', 'Lade Geschenkekatalog...')}</div>`;

    // Timeout: nach 15 Sekunden Fehlermeldung anzeigen
    const timeout = setTimeout(() => {
        container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⏱️</div>
                    <p>${t('plugins.multicam.multicam.runtime.server_unreachable', 'Server antwortet nicht. Stelle sicher, dass der LTTH-Server läuft und ein TikTok-Stream verbunden ist.')}</p>
                    <button onclick="loadGiftMappings()" style="margin-top: 12px;">${t('plugins.multicam.multicam.runtime.retry_load', '🔄 Erneut laden')}</button>
            </div>`;
    }, 15000);

    try {
        const res = await fetch('/api/multicam/gift-mappings');
        clearTimeout(timeout);
        const data = await res.json();
        if (data.success) {
            giftData = data.gifts || [];
            originalMappings = JSON.parse(JSON.stringify(data.mappings || {}));
            pendingMappings = JSON.parse(JSON.stringify(data.mappings || {}));
            renderGiftCatalog();
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <p>${t('plugins.multicam.multicam.runtime.server_error', 'Fehler vom Server: {error}', { error: data.error || t('plugins.multicam.multicam.runtime.unknown_error', 'Unbekannter Fehler') })}</p>
                    <button onclick="loadGiftMappings()" style="margin-top: 12px;">${t('plugins.multicam.multicam.runtime.retry_load', '🔄 Erneut laden')}</button>
                </div>`;
        }
    } catch (e) {
        clearTimeout(timeout);
        console.error('Failed to load gift mappings:', e);
        container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <p>${t('plugins.multicam.multicam.runtime.catalog_load_failed', 'Fehler beim Laden des Geschenkekatalogs. Stelle sicher, dass der LTTH-Server läuft und ein TikTok-Stream verbunden ist.')}</p>
                    <button onclick="loadGiftMappings()" style="margin-top: 12px;">${t('plugins.multicam.multicam.runtime.retry_load', '🔄 Erneut laden')}</button>
            </div>`;
    }
}

// ===== GIFT CATALOG RENDERING =====
function getTier(coins) {
    if (coins >= 10000) return { key: 'whale', label: t('plugins.multicam.multicam.runtime.tier_whale', '🐋 Whale (10.000+)'), className: 'tier-whale' };
    if (coins >= 1000) return { key: 'large', label: t('plugins.multicam.multicam.runtime.tier_large', '🔥 Groß (1.000-9.999)'), className: 'tier-large' };
    if (coins >= 100) return { key: 'medium', label: t('plugins.multicam.multicam.runtime.tier_medium', '💎 Mittel (100-999)'), className: 'tier-medium' };
    return { key: 'small', label: t('plugins.multicam.multicam.runtime.tier_small', '🪙 Klein (1-99)'), className: 'tier-small' };
}

function filterGifts(gifts) {
    return gifts.filter(g => {
        // Tier-Filter
        if (currentFilter !== 'all') {
            const tier = getTier(g.coins || 0);
            if (currentFilter === 'mapped' && !g.mapped) return false;
            if (currentFilter === 'unmapped' && g.mapped) return false;
            if (currentFilter === 'small' && tier.key !== 'small') return false;
            if (currentFilter === 'medium' && tier.key !== 'medium') return false;
            if (currentFilter === 'large' && tier.key !== 'large') return false;
            if (currentFilter === 'whale' && tier.key !== 'whale') return false;
        }
        // Kamera-Filter
        if (currentSceneFilter !== 'all') {
            const mapping = pendingMappings[g.name];
            if (!mapping || mapping.target !== currentSceneFilter) return false;
        }
        return true;
    });
}

function sortGifts(gifts) {
    const sorted = [...gifts];
    switch (currentSort) {
        case 'coins-desc':
            sorted.sort((a, b) => (b.coins || 0) - (a.coins || 0));
            break;
        case 'coins-asc':
            sorted.sort((a, b) => (a.coins || 0) - (b.coins || 0));
            break;
        case 'name':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'mapped':
            sorted.sort((a, b) => {
                if (a.mapped && !b.mapped) return -1;
                if (!a.mapped && b.mapped) return 1;
                return (b.coins || 0) - (a.coins || 0);
            });
            break;
    }
    return sorted;
}

function groupByTier(gifts) {
    const groups = { small: [], medium: [], large: [], whale: [] };
    for (const g of gifts) {
        const tier = getTier(g.coins || 0);
        groups[tier.key].push(g);
    }
    return groups;
}

function renderGiftCatalog() {
    const container = document.getElementById('giftGridContainer');

    if (!giftData || giftData.length === 0) {
        container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎁</div>
                    <p>${t('plugins.multicam.multicam.runtime.empty_catalog', 'Keine Geschenke im Katalog. Verbinde einen TikTok-Stream, um den Katalog zu laden.')}</p>
            </div>`;
        updateStats();
        return;
    }

    // Aktuelle Mappings auf giftData spiegeln
    for (const g of giftData) {
        const mapping = pendingMappings[g.name];
        g.mapped = !!mapping;
        g.mapping = mapping;
    }

    const filtered = filterGifts(giftData);
    const sorted = sortGifts(filtered);
    const grouped = groupByTier(sorted);

    let html = '';

    for (const [tierKey, tierGifts] of Object.entries(grouped)) {
        if (tierGifts.length === 0) continue;
        const tier = getTier(tierGifts[0]?.coins || 0);

        html += `<div class="tier-header ${tier.className}">
            <span class="tier-icon">${tier.label.split(' ')[0]}</span>
            <span>${tier.label}</span>
            <span class="tier-count">${t('plugins.multicam.multicam.runtime.gift_count', '{count} Geschenke', { count: tierGifts.length })}</span>
        </div>`;

        html += '<div class="gift-grid">';
        for (const gift of tierGifts) {
            html += renderGiftCard(gift);
        }
        html += '</div>';
    }

    if (filtered.length === 0) {
        html = `<div class="empty-state"><div class="empty-icon">🔍</div><p>${t('plugins.multicam.multicam.runtime.no_filtered_gifts', 'Keine Geschenke entsprechen dem aktuellen Filter.')}</p></div>`;
    }

    container.innerHTML = html;
    updateStats();
}

function renderGiftCard(gift) {
    const mapping = pendingMappings[gift.name];
    const isMapped = !!mapping;
    const selectedScene = mapping ? mapping.target : '';
    const minCoins = mapping ? (mapping.minCoins || 1) : 1;

    const imageHtml = gift.image_url
        ? `<img src="${gift.image_url}" alt="${gift.name}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=\\'no-image\\'>🎁</span>'">`
        : `<span class="no-image">🎁</span>`;

    const sceneOptions = state.scenes.map(s =>
        `<option value="${s}" ${s === selectedScene ? 'selected' : ''}>${s}</option>`
    ).join('');

    return `
        <div class="gift-card ${isMapped ? 'mapped' : ''}" data-gift-name="${gift.name}">
            <div class="gift-image">${imageHtml}</div>
            <div class="gift-info">
                <span class="gift-name" title="${gift.name}">${gift.name}</span>
                <span class="gift-coins">💎 ${gift.coins || 0}</span>
            </div>
            <div class="gift-scene-select">
                <select class="gift-scene-picker ${isMapped ? 'mapped-option' : ''}"
                        data-gift-name="${gift.name}"
                        onchange="onSceneChange('${gift.name}', this.value)">
                    <option value="">${t('plugins.multicam.multicam.runtime.no_mapping', '— Keine Zuordnung —')}</option>
                    ${sceneOptions}
                </select>
            </div>
            <div class="gift-coins-input">
                <label>${t('plugins.multicam.multicam.runtime.minimum_coins', 'Min. Coins:')}</label>
                <input type="number" class="gift-min-coins"
                       data-gift-name="${gift.name}"
                       value="${minCoins}" min="0" step="1"
                       onchange="onMinCoinsChange('${gift.name}', this.value)">
            </div>
        </div>`;
}

// ===== MAPPING ACTIONS =====
function onSceneChange(giftName, scene) {
    if (!scene) {
        delete pendingMappings[giftName];
    } else {
        const existing = pendingMappings[giftName] || {};
        pendingMappings[giftName] = {
            action: 'switchScene',
            target: scene,
            minCoins: existing.minCoins || 1
        };
    }
    // Mapping-Status auf giftData aktualisieren
    const gift = giftData.find(g => g.name === giftName);
    if (gift) {
        gift.mapped = !!scene;
        gift.mapping = pendingMappings[giftName] || null;
    }
    updateStats();
    updateSaveBar();
}

function onMinCoinsChange(giftName, value) {
    const minCoins = parseInt(value) || 0;
    if (pendingMappings[giftName]) {
        pendingMappings[giftName].minCoins = minCoins;
    } else if (minCoins > 0) {
        // Falls noch kein Mapping, aber minCoins gesetzt — trotzdem speichern
        pendingMappings[giftName] = {
            action: 'switchScene',
            target: '',
            minCoins: minCoins
        };
    }
    updateSaveBar();
}

// ===== STATS & SAVE BAR =====
function updateStats() {
    const mapped = Object.keys(pendingMappings).filter(k => pendingMappings[k] && pendingMappings[k].target).length;
    const total = giftData.length;
    document.getElementById('mappedCount').textContent = mapped;
    document.getElementById('totalCount').textContent = total;
}

function updateSaveBar() {
    const mapped = Object.keys(pendingMappings).filter(k => pendingMappings[k] && pendingMappings[k].target).length;
    const changed = countChanges();
    document.getElementById('changeCount').textContent = changed;
    document.getElementById('mappedDisplay').textContent = mapped;
    document.getElementById('saveStatus').textContent = changed > 0
        ? t('plugins.multicam.multicam.runtime.unsaved_changes', '🟡 Ungespeicherte Änderungen')
        : t('plugins.multicam.multicam.runtime.all_changes_saved', '✅ Alle Änderungen gespeichert');
    document.getElementById('saveStatus').className = 'save-status' + (changed > 0 ? '' : '');
}

function countChanges() {
    const current = JSON.stringify(pendingMappings);
    const original = JSON.stringify(originalMappings);
    return current !== original ? 1 : 0;
}

// ===== SAVE / RESET =====
async function saveMappings() {
    const btn = document.getElementById('saveMappingsBtn');
    const status = document.getElementById('saveStatus');
    btn.disabled = true;
    status.textContent = t('plugins.multicam.multicam.runtime.saving', '⏳ Speichere...');
    status.className = 'save-status';

    try {
        // Nur Mappings mit target senden
        const cleanMappings = {};
        for (const [name, mapping] of Object.entries(pendingMappings)) {
            if (mapping && mapping.target) {
                cleanMappings[name] = mapping;
            }
        }

        const res = await fetch('/api/multicam/gift-mappings/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings: cleanMappings })
        });
        const data = await res.json();
        if (data.success) {
            originalMappings = JSON.parse(JSON.stringify(cleanMappings));
            status.textContent = t('plugins.multicam.multicam.runtime.saved', '✅ Gespeichert!');
            status.className = 'save-status';
            updateSaveBar();
            // Katalog neu rendern
            renderGiftCatalog();
        } else {
            status.textContent = t('plugins.multicam.multicam.runtime.error', '❌ Fehler: {error}', { error: data.error });
            status.className = 'save-status error';
        }
    } catch (e) {
        status.textContent = t('plugins.multicam.multicam.runtime.error', '❌ Fehler: {error}', { error: e.message });
        status.className = 'save-status error';
    }
    btn.disabled = false;
}

function resetMappings() {
    if (!confirm(t('plugins.multicam.multicam.runtime.discard_unsaved_changes', 'Alle nicht gespeicherten Änderungen verwerfen?'))) return;
    pendingMappings = JSON.parse(JSON.stringify(originalMappings));
    renderGiftCatalog();
    updateSaveBar();
}

// ===== HOT BUTTONS =====
function renderHotButtons(buttons) {
    const container = document.getElementById('hotButtons');
    container.innerHTML = '';
    for (const btn of buttons) {
        const button = document.createElement('button');
        button.className = 'hot-button';
        button.textContent = btn.label;
        button.addEventListener('click', () => executeHotButton(btn));
        container.appendChild(button);
    }
}

async function executeHotButton(btn) {
    try {
        const res = await fetch('/api/multicam/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: btn.action, args: btn })
        });
        const data = await res.json();
        if (!data.success) alert(t('plugins.multicam.multicam.runtime.error', '❌ Fehler: {error}', { error: data.error }));
    } catch (e) {
        console.error('Hot button error:', e);
    }
}

// ===== OBS CONNECTION =====
async function connect() {
    try {
        const res = await fetch('/api/multicam/connect', { method: 'POST' });
        const data = await res.json();
        if (!data.success) alert(t('plugins.multicam.multicam.runtime.connection_failed', 'Verbindung fehlgeschlagen: {error}', { error: data.error }));
    } catch (e) {
        console.error('Connect error:', e);
    }
}

async function disconnect() {
    try {
        await fetch('/api/multicam/disconnect', { method: 'POST' });
    } catch (e) {
        console.error('Disconnect error:', e);
    }
}

async function switchToSelected() {
    const select = document.getElementById('sceneSelect');
    const sceneName = select.value;
    if (!sceneName) { alert(t('plugins.multicam.multicam.runtime.select_scene', 'Bitte eine Szene wählen')); return; }
    try {
        const res = await fetch('/api/multicam/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'switchScene', args: { target: sceneName } })
        });
        const data = await res.json();
        if (!data.success) alert(t('plugins.multicam.multicam.runtime.error', '❌ Fehler: {error}', { error: data.error }));
    } catch (e) {
        console.error('Switch error:', e);
    }
}

// ===== LOG =====
function addLogEntry(data) {
    const container = document.getElementById('logContainer');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const time = new Date(data.timestamp).toLocaleTimeString();
    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-user">${data.username}</span>
        <span class="log-action">${data.action}</span>
        <span class="log-target">${data.target || '-'}</span>`;
    if (container.firstChild) {
        container.insertBefore(entry, container.firstChild);
    } else {
        container.appendChild(entry);
    }
    while (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

// ===== EVENT LISTENERS =====
document.getElementById('obs-connect-btn').addEventListener('click', connect);
document.getElementById('obs-disconnect-btn').addEventListener('click', disconnect);
document.getElementById('switch-scene-btn').addEventListener('click', switchToSelected);
document.getElementById('saveMappingsBtn').addEventListener('click', saveMappings);
document.getElementById('resetMappingsBtn').addEventListener('click', resetMappings);
document.getElementById('refreshCatalogBtn').addEventListener('click', loadGiftMappings);

// Filter-Änderungen
document.getElementById('filter-tier').addEventListener('change', (e) => {
    currentFilter = e.target.value;
    renderGiftCatalog();
});
document.getElementById('filter-scene').addEventListener('change', (e) => {
    currentSceneFilter = e.target.value;
    renderGiftCatalog();
});
document.getElementById('sort-gifts').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderGiftCatalog();
});

function rerenderLocalizedUi() {
    updateState(state);
    renderGiftCatalog();
    updateSaveBar();
}

if (window.i18n && typeof window.i18n.onChange === 'function') {
    window.i18n.onChange(rerenderLocalizedUi);
}

if (window.i18n && typeof window.i18n.onLanguageChange === 'function') {
    window.i18n.onLanguageChange(rerenderLocalizedUi);
}

// ===== INIT =====
loadState();
