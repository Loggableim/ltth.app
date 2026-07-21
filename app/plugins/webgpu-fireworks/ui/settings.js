/**
 * Fireworks Superplugin - Settings UI Controller
 * CSP-Compliant - No inline event handlers
 */

// State
let configRevision = 0;
let localConfigDirty = false;
let applyingRemoteConfig = false;
let activeSaveRequests = 0;
let latestSaveRequestId = 0;
let config = createTrackedConfig({});
let socket = null;
let rendererStatusTimer = null;
let paletteSaveTimer = null;
let palettePreviewTimer = null;
let localizedDynamicRefreshScheduled = false;
let configContractsReady = false;

const RANGE_VALUE_DISPLAYS = Object.freeze({
    'combo-timeout': ['combo-timeout-value', 's'],
    'combo-max': ['combo-max-value', 'x'],
    'audio-volume': ['audio-volume-value', '%'],
    'crackle-frequency': ['crackle-frequency-value', '%'],
    'crackle-volume': ['crackle-volume-value', '%'],
    'max-particles': ['max-particles-value', ''],
    'target-fps': ['target-fps-value', ' FPS'],
    'min-fps': ['min-fps-value', ' FPS'],
    'despawn-fade': ['despawn-fade-value', 's'],
    'max-rockets-per-second': ['max-rockets-value', '/s'],
    'max-fireworks': ['max-fireworks-value', ''],
    'max-particles-limit': ['max-particles-limit-value', ''],
    'emergency-threshold': ['emergency-threshold-value', ''],
    'min-target-fps': ['min-target-fps-value', ''],
    'avatar-chance': ['avatar-chance-value', '%'],
    'finale-intensity': ['finale-intensity-value', 'x'],
    'superfan-finale-intensity': ['superfan-finale-intensity-value', 'x'],
    'superfan-end-card-duration': ['superfan-end-card-duration-value', 's'],
    'superfan-end-card-scale': ['superfan-end-card-scale-value', 'x'],
    'follower-rocket-count': ['follower-rocket-count-value', ''],
    'follower-animation-duration': ['follower-animation-duration-value', 's'],
    'follower-animation-delay': ['follower-animation-delay-value', 's'],
    'follower-animation-scale': ['follower-animation-scale-value', 'x']
});

function settingsContract() {
    const contract = window.WebGpuFireworksSettingsContract;
    if (!contract) throw new Error('Settings contract module is unavailable');
    return contract;
}

function failClosedConfigControls() {
    configContractsReady = false;
    const contract = window.WebGpuFireworksSettingsContract;
    const ids = [
        ...Object.keys(contract?.RANGE_CONTROLS || {}),
        ...Object.keys(contract?.ENUM_CONTROLS || {})
    ];
    for (const id of ids) {
        const element = document.getElementById(id);
        if (element) element.disabled = true;
    }
    window.WebGpuFireworksShowOptions?.setCustomStyleContract?.(null);
}

function installConfigContracts(data) {
    const contract = settingsContract();
    try {
        contract.applyConfigContracts(document, { limits: data?.limits, enums: data?.enums });
        const showOptions = window.WebGpuFireworksShowOptions;
        if (!showOptions?.setCustomStyleContract?.(data?.enums?.finaleStyle)) {
            throw new Error('Finale style contract is invalid');
        }
        configContractsReady = true;
    } catch (error) {
        failClosedConfigControls();
        throw error;
    }
}

function readVisibleNumericConfig() {
    if (!configContractsReady) throw new Error('Settings contracts are not ready');
    const contract = settingsContract();
    contract.reconcileFpsControls(document);
    return contract.readNumericConfig(document);
}

function updateNumericValueDisplays() {
    for (const [id, [valueId, suffix]] of Object.entries(RANGE_VALUE_DISPLAYS)) {
        const input = document.getElementById(id);
        const output = document.getElementById(valueId);
        if (input && output) output.textContent = `${input.value}${suffix}`;
    }
}

function syncNumericConfigFromControls() {
    Object.assign(config, readVisibleNumericConfig());
    updateNumericValueDisplays();
}

function t(key, fallback, params = {}) {
    const translated = window.i18n?.t?.(key, params);
    if (translated && translated !== key) return translated;
    return String(fallback).replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
    ));
}

function requestDetail(value) {
    return typeof value === 'string' && value.trim()
        ? value.trim().slice(0, 240)
        : '';
}

function requestFailureMessage(error, fallback) {
    const detail = requestDetail(error?.message);
    return detail && detail !== fallback ? `${fallback}: ${detail}` : fallback;
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    let payload;
    try {
        payload = await response.json();
    } catch (cause) {
        const error = new Error(requestDetail(cause?.message) || 'Invalid JSON response');
        error.cause = cause;
        error.status = response.status;
        throw error;
    }

    if (!response.ok || payload?.success !== true || payload.accepted === false) {
        const detail = [payload?.reason, payload?.error, payload?.message]
            .map(requestDetail)
            .find(Boolean);
        const statusDetail = Number.isFinite(Number(response.status))
            ? `HTTP ${Number(response.status)}${response.statusText ? ` ${response.statusText}` : ''}`
            : '';
        const error = new Error(detail || statusDetail || 'Request was not confirmed by the server');
        error.code = payload?.code;
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    return payload;
}

function finaleSelectorLabels() {
    return {
        auto: t('plugins.webgpu-fireworks.webgpu_fireworks.finale_style_auto', 'Auto'),
        inherit: t('plugins.webgpu-fireworks.webgpu_fireworks.finale_global_default', 'Use global default'),
        builtIns: t('plugins.webgpu-fireworks.webgpu_fireworks.finale_built_in_shows', 'Built-in shows'),
        custom: t('plugins.webgpu-fireworks.webgpu_fireworks.finale_custom_shows', 'Custom shows'),
        unavailable: t('plugins.webgpu-fireworks.webgpu_fireworks.finale_unavailable', 'Unavailable'),
        short: t('plugins.webgpu-fireworks.webgpu_fireworks.finale_length_short', 'Short (10 s)'),
        medium: t('plugins.webgpu-fireworks.webgpu_fireworks.finale_length_medium', 'Medium (18 s)'),
        long: t('plugins.webgpu-fireworks.webgpu_fireworks.finale_length_long', 'Long (28 s)')
    };
}

function scheduleLocalizedDynamicUiRefresh() {
    if (localizedDynamicRefreshScheduled) return;
    localizedDynamicRefreshScheduled = true;
    Promise.resolve().then(() => {
        localizedDynamicRefreshScheduled = false;
        updateOverviewSummary();
        loadRendererStatus();
        renderGiftStyleMappings();
        refreshFinaleShowSelectors();
    });
}

function refreshLocalizedUiFromI18nChange() {
    window.i18n?.updateDOM?.();
    scheduleLocalizedDynamicUiRefresh();
}

async function refreshFinaleShowSelectors() {
    const showOptions = window.WebGpuFireworksShowOptions;
    if (!showOptions || !configContractsReady) return [];
    const labels = finaleSelectorLabels();
    const globalStyle = document.getElementById('finale-style');
    const globalLength = document.getElementById('finale-length');
    const superfanStyle = document.getElementById('superfan-finale-style');
    const superfanLength = document.getElementById('superfan-finale-length');

    if (globalLength) {
        showOptions.renderLengthSelect(globalLength, {
            surface: 'global',
            selectedValue: config.goalFinaleLength,
            labels
        });
    }
    if (superfanLength) {
        showOptions.renderLengthSelect(superfanLength, {
            surface: 'inherited',
            selectedValue: config.superfanFinaleLength,
            labels
        });
    }

    const refreshes = [];
    if (globalStyle) {
        refreshes.push(showOptions.refreshStyleSelect(globalStyle, {
            surface: 'global',
            selectedValue: config.goalFinaleStyle,
            labels
        }));
    }
    if (superfanStyle) {
        refreshes.push(showOptions.refreshStyleSelect(superfanStyle, {
            surface: 'inherited',
            selectedValue: config.superfanFinaleStyle,
            labels
        }));
    }
    return Promise.all(refreshes);
}

function markLocalConfigChange() {
    if (applyingRemoteConfig) return;
    configRevision += 1;
    localConfigDirty = true;
}

function createTrackedConfig(value) {
    const proxies = new WeakMap();

    const wrap = target => {
        if (!target || typeof target !== 'object') return target;
        if (proxies.has(target)) return proxies.get(target);

        const proxy = new Proxy(target, {
            get(object, property) {
                return wrap(Reflect.get(object, property));
            },
            set(object, property, nextValue) {
                const previousValue = Reflect.get(object, property);
                const changed = !Object.is(previousValue, nextValue);
                const updated = Reflect.set(object, property, nextValue);
                if (updated && changed) markLocalConfigChange();
                return updated;
            },
            deleteProperty(object, property) {
                const existed = Object.prototype.hasOwnProperty.call(object, property);
                const deleted = Reflect.deleteProperty(object, property);
                if (deleted && existed) markLocalConfigChange();
                return deleted;
            }
        });
        proxies.set(target, proxy);
        return proxy;
    };

    return wrap(value && typeof value === 'object' ? value : {});
}

function applyRemoteConfig(nextConfig) {
    applyingRemoteConfig = true;
    try {
        config = createTrackedConfig(nextConfig);
        updateUI();
        configRevision += 1;
        localConfigDirty = false;
    } finally {
        applyingRemoteConfig = false;
    }
}

function canApplyRemoteConfig() {
    return !localConfigDirty && activeSaveRequests === 0;
}

// Benchmark configuration constants
const BENCHMARK_CONFIG = {
    RENDERER_READY_TIMEOUT: 15000,
    RENDERER_READY_POLL_INTERVAL: 250,
    TEST_DURATION: 10000,          // Each preset tested for 10 seconds
    FIREWORK_INTERVAL: 500,        // Trigger firework every 500ms
    FPS_SAMPLE_INTERVAL: 1000,     // Sample FPS every second
    INTER_TEST_DELAY: 1000         // Wait 1s between different preset tests
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize i18n first
    if (window.i18n) {
        await window.i18n.init();
        window.i18n.updateDOM();

        // Listen for both translation updates and explicit language switches.
        window.i18n.onChange?.(refreshLocalizedUiFromI18nChange);
        window.i18n.onLanguageChange?.(scheduleLocalizedDynamicUiRefresh);
    }

    // Connect to socket
    connectSocket();

    // Load configuration
    await loadConfig();
    await loadRendererStatus();

    // Setup event listeners
    setupEventListeners();

    // Initialize tab system
    initializeTabs();

    // Initialize presets
    initializePresets();

    // Initialize benchmark
    initializeBenchmark();
    const originInput = document.getElementById('webgpu-origin');
    if (originInput) originInput.value = window.location.origin;
    rendererStatusTimer = window.setInterval(() => {
        if (!document.hidden) loadRendererStatus();
    }, 2000);
    updateOverviewSummary();
    window.addEventListener('focus', updateOverviewSummary);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            updateOverviewSummary();
        }
    });
    try {
        new MutationObserver(updateOverviewSummary).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    } catch (error) {}

    console.log('[Fireworks Settings] Initialized');
});

window.addEventListener('pagehide', () => {
    void stopBenchmarkRun({ keepalive: true }).catch(error => {
        console.error('Failed to stop benchmark session during pagehide:', error);
    });
    if (rendererStatusTimer !== null) window.clearInterval(rendererStatusTimer);
    if (paletteSaveTimer !== null) window.clearTimeout(paletteSaveTimer);
    if (palettePreviewTimer !== null) window.clearTimeout(palettePreviewTimer);
});

// ============================================================================
// SOCKET CONNECTION
// ============================================================================

function connectSocket() {
    try {
        socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true
        });

        socket.on('connect', () => {
            console.log('[Fireworks Settings] Connected to server');
        });

        socket.on('webgpu-fireworks:config-update', (data) => {
            try {
                installConfigContracts(data);
                if (data.config && canApplyRemoteConfig()) {
                    applyRemoteConfig(data.config);
                }
            } catch (error) {
                console.error('[Fireworks Settings] Invalid socket config contract:', error);
            }
        });
    } catch (e) {
        console.error('[Fireworks Settings] Socket error:', e);
    }
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function loadConfig() {
    const requestedAtRevision = configRevision;
    try {
        const data = await requestJson('/api/webgpu-fireworks/config');
        installConfigContracts(data);

        if (requestedAtRevision === configRevision && canApplyRemoteConfig()) {
            applyRemoteConfig(data.config);
        }
    } catch (e) {
        console.error('[Fireworks Settings] Failed to load config:', e);
        const fallback = t('plugins.webgpu-fireworks.ui.configuration_load_failed', 'Failed to load configuration');
        showToast(requestFailureMessage(e, fallback), 'error');
    }
}

function markRendererStatusUnavailable(error) {
    const unavailable = t('plugins.webgpu-fireworks.ui.unavailable', 'Unavailable');
    const state = document.getElementById('webgpu-runtime-state');
    if (state) {
        state.textContent = `${t('plugins.webgpu-fireworks.ui.renderer_state_offline', 'OFFLINE')} · WEBGPU`;
        state.className = 'text-red-300';
    }
    for (const id of [
        'webgpu-adapter-state', 'webgpu-audio-state', 'webgpu-audio-backend',
        'webgpu-audio-library', 'webgpu-audio-last-played', 'webgpu-crackle-state',
        'webgpu-audio-profile', 'webgpu-audio-voices', 'webgpu-audio-events',
        'webgpu-audio-peak', 'webgpu-timeline-sync', 'webgpu-finale-active',
        'webgpu-finale-phase', 'webgpu-finale-queue', 'webgpu-visual-style',
        'webgpu-frame-time', 'webgpu-particle-state'
    ]) {
        const element = document.getElementById(id);
        if (element) element.textContent = unavailable;
    }
    const reason = document.getElementById('webgpu-runtime-reason');
    if (reason) {
        const fallback = t('plugins.webgpu-fireworks.ui.renderer_status_unavailable', 'Renderer status unavailable');
        reason.hidden = false;
        reason.textContent = requestFailureMessage(error, fallback);
    }
}

async function loadRendererStatus() {
    try {
        const data = await requestJson('/api/webgpu-fireworks/status', { cache: 'no-store' });
        const renderer = data.renderer || {};
        const showOptions = window.WebGpuFireworksShowOptions;
        const showCatalog = showOptions?.loadCatalog
            ? await showOptions.loadCatalog()
            : null;
        const finaleStatus = showOptions?.formatRuntimeFinaleStatus
            ? showOptions.formatRuntimeFinaleStatus(renderer, {
                catalog: showCatalog,
                translate: t
            })
            : null;
        const state = document.getElementById('webgpu-runtime-state');
        const adapter = document.getElementById('webgpu-adapter-state');
        const audio = document.getElementById('webgpu-audio-state');
        const audioBackend = document.getElementById('webgpu-audio-backend');
        const audioLibrary = document.getElementById('webgpu-audio-library');
        const audioLastPlayed = document.getElementById('webgpu-audio-last-played');
        const crackleState = document.getElementById('webgpu-crackle-state');
        const audioProfile = document.getElementById('webgpu-audio-profile');
        const audioVoices = document.getElementById('webgpu-audio-voices');
        const audioEvents = document.getElementById('webgpu-audio-events');
        const audioPeak = document.getElementById('webgpu-audio-peak');
        const timelineSync = document.getElementById('webgpu-timeline-sync');
        const finaleActive = document.getElementById('webgpu-finale-active');
        const finalePhase = document.getElementById('webgpu-finale-phase');
        const finaleQueue = document.getElementById('webgpu-finale-queue');
        const visualStyle = document.getElementById('webgpu-visual-style');
        const frameTime = document.getElementById('webgpu-frame-time');
        const particles = document.getElementById('webgpu-particle-state');
        const reason = document.getElementById('webgpu-runtime-reason');
        const rendererUpgradeRequired = renderer.upgradeRequired === true;
        if (state) {
            state.textContent = `${t(`plugins.webgpu-fireworks.ui.renderer_state_${String(renderer.state || 'offline').toLowerCase()}`, String(renderer.state || 'offline').toUpperCase())} · WEBGPU`;
            state.className = rendererUpgradeRequired || renderer.state === 'initializing'
                ? 'text-yellow-200'
                : renderer.state === 'ready' ? 'text-green-300' : 'text-red-300';
        }
        if (adapter) {
            const info = renderer.adapter || {};
            adapter.textContent = info.description || info.device || info.vendor || t('plugins.webgpu-fireworks.ui.not_connected', 'Not connected');
        }
        if (audio) audio.textContent = t(`plugins.webgpu-fireworks.ui.audio_status_${String(renderer.audioStatus || 'unknown').toLowerCase()}`, String(renderer.audioStatus || 'unknown').toUpperCase());
        if (audioBackend) audioBackend.textContent = t(`plugins.webgpu-fireworks.ui.audio_backend_${String(renderer.audioBackend || 'none').toLowerCase()}`, String(renderer.audioBackend || 'none').toUpperCase());
        if (audioLibrary) audioLibrary.textContent = `${Number(renderer.loadedSounds || 0)} ${t('plugins.webgpu-fireworks.ui.loaded', 'loaded')} / ${Number(renderer.failedSounds || 0)} ${t('plugins.webgpu-fireworks.ui.failed', 'failed')}`;
        if (audioLastPlayed) audioLastPlayed.textContent = renderer.lastPlayed || t('plugins.webgpu-fireworks.ui.none', 'None');
        if (crackleState) crackleState.textContent = t(`plugins.webgpu-fireworks.ui.crackle_state_${String(renderer.crackleState || 'idle').toLowerCase()}`, String(renderer.crackleState || 'idle').toUpperCase());
        if (audioProfile) audioProfile.textContent = renderer.lastAudioProfile || t('plugins.webgpu-fireworks.ui.none', 'None');
        if (audioVoices) {
            const voices = renderer.activeVoices || {};
            audioVoices.textContent = t(
                'plugins.webgpu-fireworks.ui.audio_voices',
                'L{launch} / B{bang} / C{crackle} ({total} {totalLabel})',
                {
                    launch: Number(voices.launch || 0),
                    bang: Number(voices.bang || 0),
                    crackle: Number(voices.crackle || 0),
                    total: Number(voices.total || 0),
                    totalLabel: t('plugins.webgpu-fireworks.ui.total', 'total')
                }
            );
        }
        if (audioEvents) audioEvents.textContent = `${Number(renderer.missedAudioEvents || 0)} ${t('plugins.webgpu-fireworks.ui.missed', 'missed')} / ${Number(renderer.audioEvictions || 0)} ${t('plugins.webgpu-fireworks.ui.evicted', 'evicted')}`;
        if (audioPeak) audioPeak.textContent = renderer.audioPeak !== null && renderer.audioPeak !== undefined && Number.isFinite(Number(renderer.audioPeak))
            ? `${Number(renderer.audioPeak).toFixed(1)} ${t('plugins.webgpu-fireworks.ui.audio_peak_unit', 'dBFS')}`
            : '-';
        if (timelineSync) {
            const events = Array.isArray(renderer.timelineEvents) ? renderer.timelineEvents : [];
            const lastEvent = events.length > 0 ? events[events.length - 1] : null;
            timelineSync.textContent = lastEvent
                ? `${lastEvent.type || 'event'} ${Number.isFinite(Number(lastEvent.driftMs)) ? `${Number(lastEvent.driftMs) >= 0 ? '+' : ''}${Number(lastEvent.driftMs).toFixed(1)} ms` : lastEvent.state || ''}`.trim()
                : t('plugins.webgpu-fireworks.ui.no_events', 'No events');
        }
        if (finaleActive) {
            finaleActive.textContent = finaleStatus?.activeShow
                || t('plugins.webgpu-fireworks.status.idle', 'Idle');
        }
        if (finalePhase) finalePhase.textContent = finaleStatus?.phase || String(renderer.finalePhase || 'idle').toUpperCase();
        if (finaleQueue) finaleQueue.textContent = finaleStatus?.queue || String(Number(renderer.finaleQueueLength || 0));
        if (visualStyle) visualStyle.textContent = formatVisualStyle(renderer.visualStyle || config.visualStyle);
        if (frameTime) frameTime.textContent = Number.isFinite(Number(renderer.gpuFrameMs)) ? `${Number(renderer.gpuFrameMs).toFixed(2)} ms` : '-';
        if (particles) particles.textContent = `${Number(renderer.activeParticles || 0).toLocaleString()} ${t('plugins.webgpu-fireworks.ui.active', 'active')} · ${Number(renderer.droppedParticles || 0).toLocaleString()} ${t('plugins.webgpu-fireworks.ui.dropped', 'dropped')}`;
        if (reason) {
            const upgradeReason = rendererUpgradeRequired
                ? t(
                    'plugins.webgpu-fireworks.ui.renderer_upgrade_required',
                    renderer.upgradeReason || 'This OBS overlay is outdated. Refresh the OBS browser source.'
                )
                : '';
            reason.hidden = !upgradeReason && (!renderer.reason || renderer.state === 'ready');
            reason.textContent = upgradeReason || renderer.reason || '';
        }
        if (reason && renderer.lastAudioError) {
            reason.hidden = false;
            reason.textContent = renderer.lastAudioError;
        }
        if (reason && renderer.finaleError) {
            reason.hidden = false;
            reason.textContent = renderer.finaleError;
        }
        if (data.requirements?.allowedOrigin) {
            const origin = document.getElementById('webgpu-origin');
            if (origin) origin.value = data.requirements.allowedOrigin;
        }
    } catch (error) {
        console.warn('[WebGPU Fireworks Settings] Status unavailable:', error.message);
        markRendererStatusUnavailable(error);
    }
}

async function saveConfig(showSuccessToast = true) {
    if (!configContractsReady) {
        showToast(t('plugins.webgpu-fireworks.ui.configuration_contract_unavailable', 'Settings are waiting for the server contract'), 'error');
        return false;
    }
    syncNumericConfigFromControls();
    normalizeInternalResolutionBounds();
    const requestId = ++latestSaveRequestId;
    const requestedAtRevision = configRevision;
    const serializedConfig = JSON.stringify(config);
    activeSaveRequests += 1;

    try {
        const data = await requestJson('/api/webgpu-fireworks/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: serializedConfig
        });
        installConfigContracts(data);
        const isCurrentRequest = requestId === latestSaveRequestId
            && requestedAtRevision === configRevision;

        if (!isCurrentRequest) return false;
        if (data.config) {
            applyRemoteConfig(data.config);
        } else {
            localConfigDirty = false;
        }
        if (showSuccessToast) {
            showToast(t('plugins.webgpu-fireworks.ui.settings_saved', 'Settings saved successfully!'), 'success');
        }
        return true;
    } catch (e) {
        if (requestId === latestSaveRequestId) {
            console.error('[Fireworks Settings] Failed to save config:', e);
            const fallback = t('plugins.webgpu-fireworks.ui.settings_save_failed', 'Failed to save settings');
            showToast(requestFailureMessage(e, fallback), 'error');
        }
        return false;
    } finally {
        activeSaveRequests = Math.max(0, activeSaveRequests - 1);
    }
}

async function triggerTest() {
    try {
        const selectedShape = document.querySelector('.shape-preview.active-shape, .shape-preview.selected');
        const shape = selectedShape ? selectedShape.dataset.shape : (config.defaultShape || 'burst');

        await requestJson('/api/webgpu-fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: shape,
                intensity: 1.5,
                positionMode: 'auto',
                visualStyle: config.visualStyle || 'premium-hybrid',
                colors: getConfiguredPreviewColors()
            })
        });

        showToast(t('plugins.webgpu-fireworks.ui.firework_triggered', 'Firework triggered'), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger test:', e);
        const fallback = t('plugins.webgpu-fireworks.ui.test_trigger_failed', 'Failed to trigger test');
        showToast(requestFailureMessage(e, fallback), 'error');
    }
}

async function triggerFinale() {
    try {
        const intensity = readVisibleNumericConfig().goalFinaleIntensity;
        const style = document.getElementById('finale-style').value;
        const length = document.getElementById('finale-length').value;

        await requestJson('/api/webgpu-fireworks/finale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                style: style,
                length: length,
                intensity: intensity,
                testRequest: true
            })
        });
        showToast(t('plugins.webgpu-fireworks.ui.finale_triggered', 'Finale triggered!'), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger finale:', e);
        const fallback = e.code === 'RENDERER_UPGRADE_REQUIRED'
            ? t(
                'plugins.webgpu-fireworks.ui.renderer_upgrade_required',
                'This OBS overlay is outdated. Refresh the OBS browser source.'
            )
            : t('plugins.webgpu-fireworks.ui.finale_trigger_failed', 'Failed to trigger finale');
        showToast(e.code === 'RENDERER_UPGRADE_REQUIRED' ? fallback : requestFailureMessage(e, fallback), 'error');
    }
}

async function testSuperfanFinale() {
    try {
        const numericConfig = readVisibleNumericConfig();
        const result = await requestJson('/api/webgpu-fireworks/test-superfan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'TestSuperfan',
                profilePictureUrl: 'https://www.gravatar.com/avatar/?d=mp&s=200',
                settings: {
                    superfanFinaleEnabled: document.getElementById('superfan-finale-toggle').classList.contains('active'),
                    superfanFinaleCooldownHours: Number(document.getElementById('superfan-finale-cooldown').value),
                    superfanFinaleIntensity: numericConfig.superfanFinaleIntensity,
                    superfanFinaleStyle: document.getElementById('superfan-finale-style').value,
                    superfanFinaleLength: document.getElementById('superfan-finale-length').value,
                    superfanEndCardDuration: numericConfig.superfanEndCardDuration,
                    superfanEndCardPosition: document.getElementById('superfan-end-card-position').value,
                    superfanEndCardSize: document.getElementById('superfan-end-card-size').value,
                    superfanEndCardScale: numericConfig.superfanEndCardScale,
                    goalFinaleStyle: document.getElementById('finale-style').value,
                    goalFinaleLength: document.getElementById('finale-length').value
                }
            })
        });
        if (result.pending === true) {
            showToast(t(
                'plugins.webgpu-fireworks.ui.superfan_finale_test_pending',
                'Superfan finale submitted; renderer confirmation is pending.'
            ), 'info');
        } else {
            showToast(t('plugins.webgpu-fireworks.webgpu_fireworks.superfan_finale_test_success', 'Superfan finale triggered!'), 'success');
        }
    } catch (error) {
        console.error('[Fireworks Settings] Failed to trigger Superfan finale:', error);
        const message = t('plugins.webgpu-fireworks.webgpu_fireworks.superfan_finale_test_failed', 'Failed to trigger Superfan finale');
        const detail = typeof error?.message === 'string' ? error.message.trim().slice(0, 160) : '';
        showToast(detail ? `${message}: ${detail}` : message, 'error');
    }
}

async function testFollowerFireworks() {
    try {
        await requestJson('/api/webgpu-fireworks/test-follower', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'TestFollower',
                profilePictureUrl: 'https://www.gravatar.com/avatar/?d=mp&s=200'
            })
        });

        showToast(t('plugins.webgpu-fireworks.ui.follower_triggered', 'Follower fireworks triggered!'), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger follower test:', e);
        const fallback = t('plugins.webgpu-fireworks.ui.follower_trigger_failed', 'Failed to trigger follower test');
        showToast(requestFailureMessage(e, fallback), 'error');
    }
}

// ============================================================================
// UI UPDATE
// ============================================================================

function updateUI() {
    settingsContract().writeNumericConfig(document, config);
    settingsContract().reconcileFpsControls(document);
    updateNumericValueDisplays();
    normalizeInternalResolutionBounds();

    // Master toggle
    updateToggle('master-toggle', config.enabled);

    // Gift triggers
    updateToggle('gift-toggle', config.giftTriggersEnabled);
    document.getElementById('min-coins').value = config.minGiftCoins || 1;

    // Combo system
    updateToggle('combo-toggle', config.comboEnabled);

    // Escalation
    updateToggle('escalation-toggle', config.escalationEnabled);
    if (config.escalationThresholds) {
        document.getElementById('tier-small').value = config.escalationThresholds.small || 0;
        document.getElementById('tier-medium').value = config.escalationThresholds.medium || 100;
        document.getElementById('tier-big').value = config.escalationThresholds.big || 500;
        document.getElementById('tier-massive').value = config.escalationThresholds.massive || 1000;
    }
    if (config.particleCount) {
        document.getElementById('particle-small').textContent = config.particleCount.small || 30;
        document.getElementById('particle-medium').textContent = config.particleCount.medium || 60;
        document.getElementById('particle-big').textContent = config.particleCount.big || 100;
        document.getElementById('particle-massive').textContent = config.particleCount.massive || 200;
    }

    // Audio
    updateToggle('audio-toggle', config.audioEnabled);

    // Color mode
    document.getElementById('color-mode').value = config.colorMode || 'gift';
    renderColorSwatches();

    // Visual effects
    updateToggle('trails-toggle', config.trailsEnabled);
    updateToggle('glow-toggle', config.glowEnabled);
    if (config.particleSizeRange) {
        document.getElementById('particle-min').value = config.particleSizeRange[0] || 3;
        document.getElementById('particle-max').value = config.particleSizeRange[1] || 10;
    }

    // Goal finale
    updateToggle('finale-toggle', config.goalFinaleEnabled);
    document.getElementById('finale-style').value = config.goalFinaleStyle;
    document.getElementById('finale-length').value = config.goalFinaleLength;

    // Superfan finale
    updateToggle('superfan-finale-toggle', config.superfanFinaleEnabled !== false);
    document.getElementById('superfan-finale-cooldown').value = String(config.superfanFinaleCooldownHours);
    document.getElementById('superfan-finale-style').value = config.superfanFinaleStyle;
    document.getElementById('superfan-finale-length').value = config.superfanFinaleLength;
    document.getElementById('superfan-end-card-position').value = config.superfanEndCardPosition;
    document.getElementById('superfan-end-card-size').value = config.superfanEndCardSize;
    document.getElementById('superfan-end-card-scale-container').style.display = config.superfanEndCardSize === 'custom'
        ? 'block'
        : 'none';
    refreshFinaleShowSelectors();

    // Follower fireworks
    updateToggle('follower-toggle', config.followerFireworksEnabled);
    updateToggle('follower-animation-toggle', config.followerShowAnimation);
    updateToggle('follower-profile-toggle', config.followerShowProfilePicture);
    document.getElementById('follower-animation-position').value = config.followerAnimationPosition;
    document.getElementById('follower-animation-size').value = config.followerAnimationSize;
    document.getElementById('follower-animation-style').value = config.followerAnimationStyle;
    document.getElementById('follower-animation-entrance').value = config.followerAnimationEntrance;

    // Show/hide custom scale slider based on size selection
    const scaleContainer = document.getElementById('follower-animation-scale-container');
    if (config.followerAnimationSize === 'custom') {
        scaleContainer.style.display = 'block';
    } else {
        scaleContainer.style.display = 'none';
    }

    // Random shape rotation
    updateToggle('random-shape-toggle', config.randomShapeEnabled);

    // Active shapes
    const activeShapes = config.activeShapes || ['burst'];
    document.querySelectorAll('.shape-preview').forEach(el => {
        el.classList.toggle('active-shape', activeShapes.includes(el.dataset.shape));
    });
    updateActiveShapes();

    // Default shape
    const defaultShapeSelect = document.getElementById('default-shape');
    if (defaultShapeSelect) {
        defaultShapeSelect.value = config.defaultShape || 'burst';
    }
    document.querySelectorAll('[data-visual-style]').forEach(card => {
        card.classList.toggle('active', card.dataset.visualStyle === (config.visualStyle || 'premium-hybrid'));
    });
    renderGiftStyleMappings();

    // User avatar integration
    updateToggle('avatar-toggle', config.userAvatarEnabled);

    // Performance & Resolution settings
    updateToggle('toaster-toggle', config.toasterMode);

    // Update resolution preset
    const resolutionPreset = document.getElementById('resolution-preset');
    if (resolutionPreset) {
        resolutionPreset.value = config.resolutionPreset || '1080p';
    }

    const internalMaxResolution = document.getElementById('internal-max-resolution');
    if (internalMaxResolution) {
        internalMaxResolution.value = config.internalMaxResolutionPreset || '4k';
    }

    const internalMinResolution = document.getElementById('internal-min-resolution');
    if (internalMinResolution) {
        internalMinResolution.value = config.internalMinResolutionPreset || '540p';
    }

    // Update orientation
    updateOrientationControls(config.orientation || 'landscape');

    // Update resolution info display
    updateResolutionInfo(config.resolutionPreset || '1080p', config.orientation || 'landscape');
    updateInternalResolutionInfo(
        config.resolutionPreset || '1080p',
        config.internalMaxResolutionPreset || '4k',
        config.internalMinResolutionPreset || '540p',
        config.orientation || 'landscape'
    );

    // Queue system settings
    updateToggle('queue-enabled-toggle', !!config.queueEnabled);

    // Gift popup settings
    updateToggle('gift-popup-enabled-toggle', config.giftPopupEnabled !== false);
    const giftPopupPositionSelect = document.getElementById('gift-popup-position');
    if (giftPopupPositionSelect) {
        giftPopupPositionSelect.value = config.giftPopupPosition || 'bottom';
    }

    updateToggle('adaptive-toggle', config.adaptivePerformance !== false);
    updateToggle('frame-skip-toggle', config.frameSkipEnabled !== false);
    updateOverviewSummary();
}

function updateToggle(id, value) {
    const toggle = document.getElementById(id);
    if (toggle) {
        const enabled = value !== false;
        toggle.classList.toggle('active', enabled);
        toggle.setAttribute('aria-checked', String(enabled));
    }
}

function formatVisualStyle(style) {
    return {
        'premium-hybrid': t('plugins.webgpu-fireworks.ui.visual_style_premium_hybrid', 'Premium Hybrid'),
        realistic: t('plugins.webgpu-fireworks.ui.visual_style_realistic', 'Realistic'),
        'stylized-neon': t('plugins.webgpu-fireworks.ui.visual_style_stylized_neon', 'Stylized Neon')
    }[style] || t('plugins.webgpu-fireworks.ui.visual_style_premium_hybrid', 'Premium Hybrid');
}

function readCurrentTheme() {
    const documentTheme = document.documentElement?.getAttribute('data-theme');
    if (documentTheme) {
        return documentTheme;
    }

    try {
        for (const key of ['ltth-theme', 'app-theme', 'dashboard-theme', 'theme', 'ui-theme']) {
            const value = localStorage.getItem(key);
            if (value) {
                return value;
            }
        }
    } catch (error) {}

    return 'night';
}

function formatThemeLabel(theme) {
    switch (theme) {
        case 'day':
            return t('plugins.webgpu-fireworks.ui.theme_day', 'Day');
        case 'contrast':
            return t('plugins.webgpu-fireworks.ui.theme_high_contrast', 'High Contrast');
        case 'vision-impaired':
            return t('plugins.webgpu-fireworks.ui.theme_vision', 'Vision');
        case 'cid':
            return t('plugins.webgpu-fireworks.ui.theme_cid', 'CID');
        default:
            return t('plugins.webgpu-fireworks.ui.theme_night', 'Night');
    }
}

function setChipState(id, value, enabled = null) {
    const chip = document.getElementById(id);
    if (!chip) return;

    chip.textContent = value;
    chip.classList.remove('status-chip--success', 'status-chip--danger');

    if (enabled === true) {
        chip.classList.add('status-chip--success');
    } else if (enabled === false) {
        chip.classList.add('status-chip--danger');
    }
}

function updateOverviewSummary() {
    const theme = formatThemeLabel(readCurrentTheme());
    const resolutionPreset = config.resolutionPreset || '1080p';
    const orientation = config.orientation || 'landscape';
    const targetFps = Number(config.targetFps || 60);
    const maxParticles = Number(config.maxParticles || 1000);
    const queueEnabled = !!config.queueEnabled;
    const adaptiveEnabled = config.adaptivePerformance !== false;

    setChipState('overview-enabled-state', config.enabled ? t('plugins.webgpu-fireworks.ui.enabled', 'Enabled') : t('plugins.webgpu-fireworks.ui.disabled', 'Disabled'), config.enabled);
    setChipState('overview-theme-state', `${t('plugins.webgpu-fireworks.ui.style', 'Style')}: ${formatVisualStyle(config.visualStyle)} / ${theme}`);
    setChipState('overview-resolution-state', `${resolutionPreset} · ${orientation === 'portrait' ? t('plugins.webgpu-fireworks.ui.portrait', 'Portrait') : t('plugins.webgpu-fireworks.ui.landscape', 'Landscape')}`);
    setChipState('overview-performance-state', `${targetFps} FPS · ${maxParticles.toLocaleString()} ${t('plugins.webgpu-fireworks.ui.particles', 'particles')}`);
    setChipState('overview-safety-state', `${queueEnabled ? t('plugins.webgpu-fireworks.ui.queue_on', 'Queue on') : t('plugins.webgpu-fireworks.ui.queue_off', 'Queue off')} · ${adaptiveEnabled ? t('plugins.webgpu-fireworks.ui.adaptive_on', 'Adaptive on') : t('plugins.webgpu-fireworks.ui.adaptive_off', 'Adaptive off')}`);
}

function updateResolutionInfo(preset, orientation) {
    const resolutions = {
        '360p': { landscape: '640x360', portrait: '360x640', impact: t('plugins.webgpu-fireworks.ui.impact_minimal', 'Minimal') },
        '480p': { landscape: '854x480', portrait: '480x854', impact: t('plugins.webgpu-fireworks.ui.impact_very_low', 'Very Low') },
        '540p': { landscape: '960x540', portrait: '540x960', impact: t('plugins.webgpu-fireworks.ui.impact_low', 'Low') },
        '720p': { landscape: '1280x720', portrait: '720x1280', impact: t('plugins.webgpu-fireworks.ui.impact_medium', 'Medium') },
        '1080p': { landscape: '1920x1080', portrait: '1080x1920', impact: t('plugins.webgpu-fireworks.ui.high', 'High') },
        '1440p': { landscape: '2560x1440', portrait: '1440x2560', impact: t('plugins.webgpu-fireworks.ui.impact_very_high', 'Very High') },
        '4k': { landscape: '3840x2160', portrait: '2160x3840', impact: t('plugins.webgpu-fireworks.ui.preset_ultra', 'Ultra') }
    };

    const info = resolutions[preset] || resolutions['1080p'];
    const resolution = orientation === 'portrait' ? info.portrait : info.landscape;

    const currentResEl = document.getElementById('current-resolution');
    const currentOrientEl = document.getElementById('current-orientation');
    const performanceEl = document.getElementById('performance-impact');

    if (currentResEl) currentResEl.textContent = resolution;
    if (currentOrientEl) currentOrientEl.textContent = orientation === 'portrait' ? t('plugins.webgpu-fireworks.ui.portrait', 'Portrait') : t('plugins.webgpu-fireworks.ui.landscape', 'Landscape');
    if (performanceEl) performanceEl.textContent = info.impact;
}

function getResolutionLabel(preset, orientation) {
    const resolutions = {
        '360p': { landscape: '640x360', portrait: '360x640' },
        '480p': { landscape: '854x480', portrait: '480x854' },
        '540p': { landscape: '960x540', portrait: '540x960' },
        '720p': { landscape: '1280x720', portrait: '720x1280' },
        '1080p': { landscape: '1920x1080', portrait: '1080x1920' },
        '1440p': { landscape: '2560x1440', portrait: '1440x2560' },
        '4k': { landscape: '3840x2160', portrait: '2160x3840' }
    };
    const info = resolutions[preset] || resolutions['1080p'];
    return orientation === 'portrait' ? info.portrait : info.landscape;
}

function getResolutionRank(preset) {
    const ranks = {
        '360p': 360,
        '480p': 480,
        '540p': 540,
        '720p': 720,
        '1080p': 1080,
        '1440p': 1440,
        '4k': 2160
    };
    return ranks[preset] || ranks['1080p'];
}

function normalizeInternalResolutionBounds(changedField = null) {
    const maxPreset = config.internalMaxResolutionPreset || '4k';
    const minPreset = config.internalMinResolutionPreset || '540p';

    config.internalMaxResolutionPreset = maxPreset;
    config.internalMinResolutionPreset = minPreset;

    if (getResolutionRank(minPreset) <= getResolutionRank(maxPreset)) return;

    if (changedField === 'min') {
        config.internalMaxResolutionPreset = minPreset;
    } else {
        config.internalMinResolutionPreset = maxPreset;
    }

    const maxSelect = document.getElementById('internal-max-resolution');
    const minSelect = document.getElementById('internal-min-resolution');
    if (maxSelect) maxSelect.value = config.internalMaxResolutionPreset;
    if (minSelect) minSelect.value = config.internalMinResolutionPreset;
}

function updateInternalResolutionInfo(obsPreset, maxPreset, minPreset, orientation) {
    const obsEl = document.getElementById('obs-source-resolution');
    const rangeEl = document.getElementById('internal-resolution-range');
    const internalRangeLabel = `${getResolutionLabel(maxPreset, orientation)} -> ${getResolutionLabel(minPreset, orientation)}`;

    if (obsEl) {
        obsEl.textContent = getResolutionLabel(obsPreset, orientation);
    }
    if (rangeEl) {
        rangeEl.textContent = internalRangeLabel;
        rangeEl.textContent = `${getResolutionLabel(maxPreset, orientation)} → ${getResolutionLabel(minPreset, orientation)}`;
    }
}

function updateOrientationControls(orientation) {
    const normalizedOrientation = orientation === 'portrait' ? 'portrait' : 'landscape';
    const select = document.getElementById('orientation-select');
    if (select) {
        select.value = normalizedOrientation;
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Save button
    document.getElementById('save-btn').addEventListener('click', saveConfig);
    document.getElementById('copy-webgpu-origin')?.addEventListener('click', async () => {
        const origin = document.getElementById('webgpu-origin')?.value || window.location.origin;
        await navigator.clipboard.writeText(origin);
        showToast(t('plugins.webgpu-fireworks.ui.origin_copied', 'WebGPU origin copied!'), 'success');
    });

    // Test buttons
    document.getElementById('test-btn').addEventListener('click', triggerTest);
    document.getElementById('test-finale-btn').addEventListener('click', triggerFinale);
    document.getElementById('test-superfan-finale-btn')?.addEventListener('click', testSuperfanFinale);
    document.getElementById('test-follower-btn')?.addEventListener('click', testFollowerFireworks);
    document.getElementById('test-gift-btn')?.addEventListener('click', () => triggerTestShape('burst', 1.0));
    document.getElementById('test-combo-btn')?.addEventListener('click', () => triggerTestShape('burst', 3.0));
    document.getElementById('test-avatar-btn')?.addEventListener('click', triggerTestAvatar);

    // Test tier buttons
    document.getElementById('test-tier-small-btn')?.addEventListener('click', () => triggerTestTier('small'));
    document.getElementById('test-tier-medium-btn')?.addEventListener('click', () => triggerTestTier('medium'));
    document.getElementById('test-tier-big-btn')?.addEventListener('click', () => triggerTestTier('big'));
    document.getElementById('test-tier-massive-btn')?.addEventListener('click', () => triggerTestTier('massive'));

    // Test shape buttons
    document.getElementById('test-shape-burst-btn')?.addEventListener('click', () => triggerTestShape('burst'));
    document.getElementById('test-shape-heart-btn')?.addEventListener('click', () => triggerTestShape('heart'));
    document.getElementById('test-shape-star-btn')?.addEventListener('click', () => triggerTestShape('star'));
    document.getElementById('test-shape-ring-btn')?.addEventListener('click', () => triggerTestShape('ring'));
    document.getElementById('test-shape-spiral-btn')?.addEventListener('click', () => triggerTestShape('spiral'));
    document.getElementById('test-shape-paws-btn')?.addEventListener('click', () => triggerTestShape('paws'));
    document.getElementById('test-shape-random-btn')?.addEventListener('click', triggerTestRandom);

    // Master toggle
    document.getElementById('master-toggle').addEventListener('click', function() {
        const enabled = this.classList.toggle('active');
        this.setAttribute('aria-checked', String(enabled));
        config.enabled = enabled;
    });

    // All toggle switches
    document.querySelectorAll('.toggle-switch[data-config]').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const enabled = this.classList.toggle('active');
            this.setAttribute('aria-checked', String(enabled));
            const configKey = this.dataset.config;
            config[configKey] = enabled;
        });
    });

    // Shape selection - multiple selection support
    document.querySelectorAll('.shape-preview').forEach(shape => {
        shape.addEventListener('click', function() {
            this.classList.toggle('active-shape');
            updateActiveShapes();
        });
    });

    // Default shape selector
    document.getElementById('default-shape')?.addEventListener('change', function() {
        config.defaultShape = this.value;
    });

    document.querySelectorAll('[data-visual-style]').forEach(card => {
        card.addEventListener('click', () => {
            config.visualStyle = card.dataset.visualStyle;
            document.querySelectorAll('[data-visual-style]').forEach(item => item.classList.toggle('active', item === card));
            updateOverviewSummary();
        });
    });
    document.getElementById('save-gift-style')?.addEventListener('click', () => {
        saveGiftStyleMapping().catch(error => {
            const fallback = t('plugins.webgpu-fireworks.ui.gift_mapping_save_failed', 'Gift mapping could not be saved');
            showToast(requestFailureMessage(error, fallback), 'error');
        });
    });
    document.getElementById('test-audio-btn')?.addEventListener('click', () => triggerTestShape('burst', 1.25));
    document.getElementById('test-crackle-btn')?.addEventListener('click', triggerTestCrackle);

    for (const id of Object.keys(settingsContract().RANGE_CONTROLS)) {
        document.getElementById(id)?.addEventListener('input', syncNumericConfigFromControls);
    }
    document.getElementById('finale-style')?.addEventListener('change', function() {
        config.goalFinaleStyle = this.value;
    });
    document.getElementById('finale-length')?.addEventListener('change', function() {
        config.goalFinaleLength = this.value;
    });
    document.getElementById('superfan-finale-cooldown')?.addEventListener('change', function() {
        config.superfanFinaleCooldownHours = Number(this.value);
    });
    document.getElementById('superfan-finale-style')?.addEventListener('change', function() {
        config.superfanFinaleStyle = this.value;
    });
    document.getElementById('superfan-finale-length')?.addEventListener('change', function() {
        config.superfanFinaleLength = this.value;
    });
    document.getElementById('superfan-end-card-position')?.addEventListener('change', function() {
        config.superfanEndCardPosition = this.value;
    });
    document.getElementById('superfan-end-card-size')?.addEventListener('change', function() {
        config.superfanEndCardSize = this.value;
        document.getElementById('superfan-end-card-scale-container').style.display = this.value === 'custom'
            ? 'block'
            : 'none';
    });
    // Follower animation position selector
    document.getElementById('follower-animation-position')?.addEventListener('change', function() {
        config.followerAnimationPosition = this.value;
    });

    // Follower animation size selector
    document.getElementById('follower-animation-size')?.addEventListener('change', function() {
        config.followerAnimationSize = this.value;

        // Show/hide custom scale slider
        const scaleContainer = document.getElementById('follower-animation-scale-container');
        if (this.value === 'custom') {
            scaleContainer.style.display = 'block';
        } else {
            scaleContainer.style.display = 'none';
        }
    });

    // Follower animation style selector
    document.getElementById('follower-animation-style')?.addEventListener('change', function() {
        config.followerAnimationStyle = this.value;
    });

    // Follower animation entrance selector
    document.getElementById('follower-animation-entrance')?.addEventListener('change', function() {
        config.followerAnimationEntrance = this.value;
    });

    // Performance & Resolution settings
    document.getElementById('resolution-preset')?.addEventListener('change', function() {
        config.resolutionPreset = this.value;
        updateResolutionInfo(this.value, config.orientation || 'landscape');
        updateInternalResolutionInfo(
            config.resolutionPreset,
            config.internalMaxResolutionPreset || '4k',
            config.internalMinResolutionPreset || '540p',
            config.orientation || 'landscape'
        );
        void saveConfig(false);
    });

    document.getElementById('orientation-select')?.addEventListener('change', function() {
        config.orientation = this.value === 'portrait' ? 'portrait' : 'landscape';
        updateOrientationControls(config.orientation);
        updateResolutionInfo(config.resolutionPreset || '1080p', config.orientation);
        updateInternalResolutionInfo(
            config.resolutionPreset || '1080p',
            config.internalMaxResolutionPreset || '4k',
            config.internalMinResolutionPreset || '540p',
            config.orientation
        );
        void saveConfig(false);
    });

    document.getElementById('internal-max-resolution')?.addEventListener('change', function() {
        config.internalMaxResolutionPreset = this.value;
        normalizeInternalResolutionBounds('max');
        updateInternalResolutionInfo(
            config.resolutionPreset || '1080p',
            config.internalMaxResolutionPreset,
            config.internalMinResolutionPreset || '540p',
            config.orientation || 'landscape'
        );
        void saveConfig(false);
    });

    document.getElementById('internal-min-resolution')?.addEventListener('change', function() {
        config.internalMinResolutionPreset = this.value;
        normalizeInternalResolutionBounds('min');
        updateInternalResolutionInfo(
            config.resolutionPreset || '1080p',
            config.internalMaxResolutionPreset || '4k',
            config.internalMinResolutionPreset,
            config.orientation || 'landscape'
        );
        void saveConfig(false);
    });

    // Gift popup position
    document.getElementById('gift-popup-position')?.addEventListener('change', function() {
        config.giftPopupPosition = this.value;
        // If set to 'none', also disable the popup
        if (this.value === 'none') {
            config.giftPopupEnabled = false;
            updateToggle('gift-popup-enabled-toggle', false);
        } else {
            // Re-enable popup when changing from 'none' to a valid position
            config.giftPopupEnabled = true;
            updateToggle('gift-popup-enabled-toggle', true);
        }
        // Note: Changes take effect after clicking "Save Settings" button
        // This is consistent with other settings
    });

    // Number inputs
    document.getElementById('min-coins').addEventListener('change', function() {
        config.minGiftCoins = parseInt(this.value) || 1;
    });

    // Tier thresholds
    ['small', 'medium', 'big', 'massive'].forEach(tier => {
        document.getElementById('tier-' + tier).addEventListener('change', function() {
            if (!config.escalationThresholds) config.escalationThresholds = {};
            config.escalationThresholds[tier] = parseInt(this.value) || 0;
        });
    });

    // Particle size
    document.getElementById('particle-min').addEventListener('change', function() {
        if (!config.particleSizeRange) config.particleSizeRange = [3, 10];
        config.particleSizeRange[0] = parseInt(this.value) || 3;
    });

    document.getElementById('particle-max').addEventListener('change', function() {
        if (!config.particleSizeRange) config.particleSizeRange = [3, 10];
        config.particleSizeRange[1] = parseInt(this.value) || 10;
    });

    // Color mode
    document.getElementById('color-mode').addEventListener('change', function() {
        config.colorMode = this.value;
        renderColorSwatches();
        schedulePaletteUpdate(true);
    });

    // Overlay buttons
    document.getElementById('copy-overlay-url').addEventListener('click', () => {
        const url = window.location.origin + '/webgpu-fireworks/overlay';
        navigator.clipboard.writeText(url).then(() => {
            showToast(t('plugins.webgpu-fireworks.ui.overlay_url_copied', 'Overlay URL copied to clipboard!'), 'success');
        });
    });

    const colorPicker = document.getElementById('color-picker');
    const colorHex = document.getElementById('color-hex');
    const normalizeColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(value || '') ? value.toUpperCase() : null;
    colorPicker?.addEventListener('input', () => {
        if (colorHex) colorHex.value = colorPicker.value.toUpperCase();
    });
    colorPicker?.addEventListener('change', () => commitThemeColor(colorPicker.value));
    colorHex?.addEventListener('change', () => {
        const color = normalizeColor(colorHex.value);
        if (!color) {
            colorHex.value = colorPicker?.value?.toUpperCase() || '#FF4444';
            return;
        }
        colorHex.value = color;
        if (colorPicker) colorPicker.value = color;
        commitThemeColor(color);
    });
    colorHex?.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        commitThemeColor(colorHex.value);
    });
    document.getElementById('add-color').addEventListener('click', () => {
        commitThemeColor(colorHex?.value || colorPicker?.value);
    });
}

function setupRangeSlider(sliderId, valueId, suffix, callback) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueId);

    slider.addEventListener('input', function() {
        valueDisplay.textContent = this.value + suffix;
        callback(this.value);
    });
}

function renderColorSwatches() {
    const container = document.getElementById('color-swatches');
    if (!container) return;
    container.querySelectorAll('.color-swatch[data-color]').forEach(swatch => swatch.remove());
    (config.themeColors || []).forEach(color => addColorSwatch(color));
    const status = document.getElementById('color-palette-status');
    if (status) {
        const count = Array.isArray(config.themeColors) ? config.themeColors.length : 0;
        status.textContent = config.colorMode === 'theme'
            ? `${t('plugins.webgpu-fireworks.ui.palette_active', 'Theme palette active')}: ${count} ${t(count === 1 ? 'plugins.webgpu-fireworks.ui.color' : 'plugins.webgpu-fireworks.ui.colors_count', count === 1 ? 'color' : 'colors')}`
            : `${count} ${t(count === 1 ? 'plugins.webgpu-fireworks.ui.color' : 'plugins.webgpu-fireworks.ui.colors_count', count === 1 ? 'theme color' : 'theme colors')} ${t('plugins.webgpu-fireworks.ui.palette_saved', 'saved — select Theme Colors to use them')}`;
    }
}

function getConfiguredPreviewColors() {
    const theme = Array.isArray(config.themeColors) && config.themeColors.length ? config.themeColors.slice(0, 12) : ['#FFFFFF'];
    if (config.colorMode === 'random') {
        return Array.from({ length: 3 }, () => `hsl(${Math.random() * 360}, 100%, 60%)`);
    }
    if (config.colorMode === 'rainbow') {
        return Array.from({ length: 5 }, (_, index) => `hsl(${index / 5 * 360}, 100%, 55%)`);
    }
    return theme;
}

function commitThemeColor(value) {
    const color = /^#[0-9A-Fa-f]{6}$/.test(value || '') ? value.toUpperCase() : null;
    if (!color) {
        showToast(t('plugins.webgpu-fireworks.ui.invalid_hex_color', 'Enter a valid six-digit hex color'), 'error');
        return false;
    }
    const colors = Array.isArray(config.themeColors)
        ? config.themeColors.map(item => String(item).toUpperCase()).filter((item, index, all) => /^#[0-9A-F]{6}$/.test(item) && all.indexOf(item) === index)
        : [];
    if (!colors.includes(color)) {
        if (colors.length >= 12) {
            showToast(t('plugins.webgpu-fireworks.ui.palette_limit', 'The theme palette supports up to 12 colors'), 'error');
            return false;
        }
        colors.push(color);
    }
    config.themeColors = colors;
    config.colorMode = 'theme';
    const mode = document.getElementById('color-mode');
    if (mode) mode.value = 'theme';
    const picker = document.getElementById('color-picker');
    const hex = document.getElementById('color-hex');
    if (picker) picker.value = color;
    if (hex) hex.value = color;
    renderColorSwatches();
    schedulePaletteUpdate(true);
    return true;
}

function schedulePaletteUpdate(preview = false) {
    if (paletteSaveTimer !== null) window.clearTimeout(paletteSaveTimer);
    paletteSaveTimer = window.setTimeout(() => {
        paletteSaveTimer = null;
        void saveConfig(false);
    }, 180);
    if (!preview) return;
    if (palettePreviewTimer !== null) window.clearTimeout(palettePreviewTimer);
    palettePreviewTimer = window.setTimeout(async () => {
        palettePreviewTimer = null;
        try {
            await requestJson('/api/webgpu-fireworks/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shape: config.defaultShape || 'burst',
                    intensity: 1.15,
                    positionMode: 'auto',
                    visualStyle: config.visualStyle || 'premium-hybrid',
                    colors: getConfiguredPreviewColors(),
                    playSound: false
                })
            });
        } catch (error) {
            console.warn('[WebGPU Fireworks Settings] Palette preview failed:', error.message);
        }
    }, 80);
}

function addColorSwatch(color) {
    const container = document.getElementById('color-swatches');
    const addBtn = document.getElementById('add-color');

    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.dataset.color = color;
    swatch.title = t('plugins.webgpu-fireworks.ui.remove_palette_color', '{color} — click to remove', { color });
    swatch.draggable = true;
    swatch.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', color));
    swatch.addEventListener('dragover', event => event.preventDefault());
    swatch.addEventListener('drop', event => {
        event.preventDefault();
        const source = event.dataTransfer.getData('text/plain');
        const colors = config.themeColors || [];
        const from = colors.indexOf(source);
        const to = colors.indexOf(color);
        if (from < 0 || to < 0 || from === to) return;
        colors.splice(to, 0, colors.splice(from, 1)[0]);
        renderColorSwatches();
        schedulePaletteUpdate(true);
    });
    swatch.title = t('plugins.webgpu-fireworks.ui.remove_palette_color', '{color} — click to remove', { color });
    swatch.addEventListener('click', () => {
        if ((config.themeColors || []).length <= 1) {
            showToast(t('plugins.webgpu-fireworks.ui.palette_requires_color', 'The theme palette needs at least one color'), 'error');
            return;
        }
        config.themeColors = (config.themeColors || []).filter(item => item !== color);
        renderColorSwatches();
        schedulePaletteUpdate(true);
    });

    container.insertBefore(swatch, addBtn);
}

// ============================================================================
// NEW HELPER FUNCTIONS
// ============================================================================

/**
 * Update active shapes list
 */
function updateActiveShapes() {
    const activeShapes = [];
    document.querySelectorAll('.shape-preview.active-shape').forEach(shape => {
        activeShapes.push(shape.dataset.shape);
    });

    config.activeShapes = activeShapes.length > 0 ? activeShapes : ['burst'];

    // Update display
    const listElement = document.getElementById('active-shapes-list');
    if (listElement) {
        listElement.textContent = config.activeShapes.join(', ');
    }
}

/**
 * Test a specific shape
 */
async function triggerTestShape(shape, intensity = 1.5) {
    try {
        await requestJson('/api/webgpu-fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: shape,
                intensity: intensity,
                positionMode: 'auto',
                visualStyle: config.visualStyle || 'premium-hybrid',
                colors: getConfiguredPreviewColors()
            })
        });

        showToast(`${shape}: ${t('plugins.webgpu-fireworks.ui.firework_triggered', 'Firework triggered')}`, 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger test:', e);
        const fallback = t('plugins.webgpu-fireworks.ui.test_trigger_failed', 'Failed to trigger test');
        showToast(requestFailureMessage(e, fallback), 'error');
    }
}

/**
 * Test one complete rocket with the long synchronized crackling profile.
 */
async function triggerTestCrackle() {
    try {
        await requestJson('/api/webgpu-fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'crackle-test',
                shape: config.defaultShape || 'burst',
                intensity: 3.2,
                tier: 'massive',
                combo: 1,
                forceRocket: true,
                crackleEnabled: true,
                positionMode: 'auto',
                visualStyle: config.visualStyle || 'premium-hybrid',
                colors: getConfiguredPreviewColors()
            })
        });
        showToast(t('plugins.webgpu-fireworks.ui.crackling_rocket_triggered', 'Complete crackling rocket triggered!'), 'success');
    } catch (error) {
        console.error('[Fireworks Settings] Failed to trigger crackling test:', error);
        const fallback = t('plugins.webgpu-fireworks.ui.crackling_rocket_failed', 'Failed to trigger crackling rocket');
        showToast(requestFailureMessage(error, fallback), 'error');
    }
}

/**
 * Test a specific tier
 */
async function triggerTestTier(tier) {
    const intensities = {
        small: 0.5,
        medium: 1.0,
        big: 1.5,
        massive: 2.5
    };

    const particleCounts = {
        small: 30,
        medium: 60,
        big: 100,
        massive: 200
    };

    try {
        await requestJson('/api/webgpu-fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: config.defaultShape || 'burst',
                intensity: intensities[tier],
                particleCount: particleCounts[tier],
                positionMode: 'auto',
                visualStyle: config.visualStyle || 'premium-hybrid',
                tier,
                colors: getConfiguredPreviewColors()
            })
        });

        showToast(`${tier}: ${t('plugins.webgpu-fireworks.ui.firework_triggered', 'Firework triggered')}`, 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger tier test:', e);
        const fallback = t('plugins.webgpu-fireworks.ui.tier_test_failed', 'Failed to trigger tier test');
        showToast(requestFailureMessage(e, fallback), 'error');
    }
}

/**
 * Test random shape
 */
async function triggerTestRandom() {
    try {
        await requestJson('/api/webgpu-fireworks/random', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        showToast(t('plugins.webgpu-fireworks.ui.random_firework_triggered', 'Random firework triggered!'), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger random:', e);
        const fallback = t('plugins.webgpu-fireworks.ui.random_firework_failed', 'Failed to trigger random');
        showToast(requestFailureMessage(e, fallback), 'error');
    }
}

/**
 * Test avatar firework
 */
async function triggerTestAvatar() {
    let avatarUrl = null;
    try {
        // Use a Blob URL so the image loader accepts the avatar and we avoid
        // base64/Unicode encoding issues in btoa().
        const avatarSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="#FF6B6B"/>
                <text x="50" y="64" font-size="40" text-anchor="middle" fill="white">👤</text>
            </svg>
        `;
        avatarUrl = URL.createObjectURL(new Blob([avatarSvg], { type: 'image/svg+xml' }));

        // Trigger with the test avatar
        await requestJson('/api/webgpu-fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: config.defaultShape || 'burst',
                intensity: 1.5,
                positionMode: 'auto',
                visualStyle: config.visualStyle || 'premium-hybrid',
                colors: getConfiguredPreviewColors(),
                userAvatar: avatarUrl
            })
        });

        showToast(t('plugins.webgpu-fireworks.ui.avatar_test_triggered', 'Avatar firework test triggered!'), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger avatar test:', e);
        const fallback = t('plugins.webgpu-fireworks.ui.avatar_test_failed', 'Failed to trigger avatar test');
        showToast(requestFailureMessage(e, fallback), 'error');
    } finally {
        if (avatarUrl) {
            setTimeout(() => URL.revokeObjectURL(avatarUrl), 60000);
        }
    }
}

// ============================================================================
// TOAST NOTIFICATION
// ============================================================================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================================================
// TAB SYSTEM
// ============================================================================

function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        if (button.getAttribute('data-tab') === tabId) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(pane => {
        if (pane.id === tabId) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });
}

// ============================================================================
// PRESET SYSTEM
// ============================================================================

const PRESETS = {
    ultra: {
        resolutionPreset: '4k',
        maxParticles: 3000,
        targetFps: 60,
        minFps: 45,
        trailsEnabled: true,
        glowEnabled: true,
        toasterMode: false,
        particleSizeRange: [3, 10]
    },
    high: {
        resolutionPreset: '1440p',
        maxParticles: 2000,
        targetFps: 60,
        minFps: 40,
        trailsEnabled: true,
        glowEnabled: true,
        toasterMode: false,
        particleSizeRange: [3, 10]
    },
    medium: {
        resolutionPreset: '1080p',
        maxParticles: 1500,
        targetFps: 60,
        minFps: 30,
        trailsEnabled: true,
        glowEnabled: true,
        toasterMode: false,
        particleSizeRange: [3, 8]
    },
    low: {
        resolutionPreset: '720p',
        maxParticles: 1000,
        targetFps: 48,
        minFps: 24,
        trailsEnabled: true,
        glowEnabled: false,
        toasterMode: false,
        particleSizeRange: [2, 6]
    },
    toaster: {
        resolutionPreset: '540p',
        internalMinResolutionPreset: '360p',
        internalMaxResolutionPreset: '540p',
        maxParticles: 500,
        targetFps: 30,
        minFps: 24,
        trailsEnabled: false,
        glowEnabled: false,
        toasterMode: true,
        particleSizeRange: [2, 5]
    },
    potato: {
        resolutionPreset: '360p',
        internalMinResolutionPreset: '360p',
        internalMaxResolutionPreset: '360p',
        maxParticles: 300,
        targetFps: 24,
        minFps: 15,
        trailsEnabled: false,
        glowEnabled: false,
        toasterMode: true,
        particleSizeRange: [1, 4]
    }
};

function initializePresets() {
    const presetCards = document.querySelectorAll('.preset-card');

    presetCards.forEach(card => {
        const button = card.querySelector('button');
        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            const presetName = card.getAttribute('data-preset');
            await applyPreset(presetName);
        });
    });
}

async function applyPreset(presetName) {
    const preset = PRESETS[presetName];
    if (!preset) {
        const msg = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.presets.not_found') : 'Preset not found';
        showToast(msg, 'error');
        return;
    }

    // Check if benchmark has recommended against this preset
    const benchmarkResults = localStorage.getItem('webgpu-fireworks-benchmark-results');
    if (benchmarkResults) {
        try {
            const results = JSON.parse(benchmarkResults);
            const presetResult = results.find(r => r.preset === presetName);

            if (presetResult && presetResult.avgFps < 30) {
                const warningTitle = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.presets.warning_title') : 'Warning: This preset might lag on your system!';
                const warningFps = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.presets.warning_fps').replace('{fps}', presetResult.avgFps.toFixed(1)) : `The benchmark measured an average FPS of ${presetResult.avgFps.toFixed(1)}.`;
                const warningConfirm = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.presets.warning_confirm') : 'Do you want to use this setting anyway?';

                const confirmed = confirm(
                    `⚠️ ${warningTitle}\n\n${warningFps}\n\n${warningConfirm}`
                );

                if (!confirmed) {
                    return;
                }
            }
        } catch (e) {
            console.error('Failed to parse benchmark results:', e);
        }
    }

    // Apply preset to config
    Object.assign(config, preset);

    // Update UI
    updateUI();

    // Save config
    const saved = await saveConfig(false);
    if (!saved) return;

    const msg = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.presets.applied') : 'Preset applied!';
    showToast(`${msg} (${presetName.toUpperCase()})`, 'success');

    // Switch to settings tab to show changes
    switchTab('settings');
}

// ============================================================================
// BENCHMARK SYSTEM
// ============================================================================

let benchmarkWindow = null;
let benchmarkRunning = false;
let benchmarkResults = [];
let cancelActiveBenchmarkMeasurement = null;
let cancelBenchmarkReadinessWait = null;
let benchmarkSessionId = null;
let benchmarkRunSequence = 0;
let activeBenchmarkRunId = 0;
const benchmarkRestoreRequests = new Map();

function initializeBenchmark() {
    const startBtn = document.getElementById('start-benchmark');
    const stopBtn = document.getElementById('stop-benchmark');

    if (startBtn) {
        startBtn.addEventListener('click', startBenchmark);
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', stopBenchmark);
    }

    // Load previous benchmark results if available
    loadBenchmarkResults();
}

function isBenchmarkRunActive(runId, sessionId) {
    return benchmarkRunning && activeBenchmarkRunId === runId && benchmarkSessionId === sessionId;
}

async function startBenchmark() {
    if (benchmarkRunning) return;

    const runId = ++benchmarkRunSequence;
    activeBenchmarkRunId = runId;
    benchmarkRunning = true;
    benchmarkResults = [];
    let sessionId = null;
    let runWindow = null;
    let popupError = null;

    const startBtn = document.getElementById('start-benchmark');
    const stopBtn = document.getElementById('stop-benchmark');
    const progressDiv = document.getElementById('benchmark-progress');
    const resultsDiv = document.getElementById('benchmark-results');

    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'block';
    if (progressDiv) progressDiv.style.display = 'block';
    if (resultsDiv) resultsDiv.style.display = 'none';

    try {
        // Start the request first, then reserve a blank popup synchronously while
        // the click still owns browser user activation. The actual benchmark URL
        // is only loaded after the server has issued its isolated session.
        const sessionRequest = requestJson('/api/webgpu-fireworks/benchmark/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        try {
            runWindow = window.open(
                'about:blank',
                `FireworksBenchmark-Pending-${runId}`,
                'width=1920,height=1080'
            );
        } catch (error) {
            popupError = error;
        }
        benchmarkWindow = runWindow;

        const session = await sessionRequest;
        sessionId = typeof session.sessionId === 'string' ? session.sessionId : null;
        const overlayUrl = typeof session.overlayUrl === 'string' ? session.overlayUrl : null;
        if (!sessionId || !overlayUrl) {
            throw new Error('Benchmark start response did not include sessionId and overlayUrl');
        }
        if (!benchmarkRunning || activeBenchmarkRunId !== runId) return;

        benchmarkSessionId = sessionId;

        if (!runWindow || runWindow.closed) {
            if (popupError) console.error('Failed to reserve benchmark popup:', popupError);
            const msg = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.benchmark.popup_blocked') : 'Could not open benchmark window. Please allow pop-ups.';
            showToast(msg, 'error');
            return;
        }

        runWindow.name = `FireworksBenchmark-${sessionId}`;
        if (typeof runWindow.location?.replace === 'function') {
            runWindow.location.replace(overlayUrl);
        } else if (runWindow.location && typeof runWindow.location === 'object') {
            runWindow.location.href = overlayUrl;
        } else {
            runWindow.location = overlayUrl;
        }

        const rendererReady = await waitForBenchmarkRenderer(sessionId);
        if (!rendererReady || !isBenchmarkRunActive(runId, sessionId)) return;

        // Run benchmark for each preset
        const presets = ['ultra', 'high', 'medium', 'low', 'toaster', 'potato'];
        const totalSteps = presets.length;

        document.getElementById('benchmark-total').textContent = totalSteps;

        for (let i = 0; i < presets.length && isBenchmarkRunActive(runId, sessionId); i++) {
            const presetName = presets[i];

            document.getElementById('current-test-name').textContent = presetName.toUpperCase();
            document.getElementById('benchmark-step').textContent = i + 1;
            document.getElementById('benchmark-progress-bar').style.width = `${((i + 1) / totalSteps) * 100}%`;

            const result = await runBenchmarkTest(presetName, sessionId, runId);
            if (!isBenchmarkRunActive(runId, sessionId)) break;
            if (result) benchmarkResults.push(result);

            // Wait between tests
            if (i < presets.length - 1) {
                const keepRunning = await waitForBenchmarkPollDelay(BENCHMARK_CONFIG.INTER_TEST_DELAY);
                if (!keepRunning) break;
            }
        }

        if (isBenchmarkRunActive(runId, sessionId) && benchmarkResults.length > 0) {
            displayBenchmarkResults();
            saveBenchmarkResults();
        }
    } catch (e) {
        console.error('Benchmark failed:', e);
        if (benchmarkRunning && activeBenchmarkRunId === runId) {
            const fallback = t('plugins.webgpu-fireworks.ui.benchmark_failed', 'Benchmark failed');
            showToast(requestFailureMessage(e, fallback), 'error');
        }
    } finally {
        try {
            await restoreBenchmarkPreset(sessionId);
        } catch (error) {
            console.error('Failed to restore benchmark session:', error);
            if (activeBenchmarkRunId === runId) {
                showToast(requestFailureMessage(error, 'Failed to restore benchmark session'), 'error');
            }
        }
        closeBenchmarkWindow(runWindow);
        if (sessionId) benchmarkRestoreRequests.delete(sessionId);
        if (activeBenchmarkRunId === runId) {
            activeBenchmarkRunId = 0;
            benchmarkRunning = false;
            if (benchmarkSessionId === sessionId) benchmarkSessionId = null;
            resetBenchmarkUi();
        }
    }
}

function stopBenchmarkRun({ keepalive = false } = {}) {
    const sessionId = benchmarkSessionId;
    const runWindow = benchmarkWindow;
    benchmarkRunning = false;
    activeBenchmarkRunId = 0;
    benchmarkSessionId = null;
    benchmarkWindow = null;
    if (cancelBenchmarkReadinessWait) {
        cancelBenchmarkReadinessWait();
        cancelBenchmarkReadinessWait = null;
    }
    if (cancelActiveBenchmarkMeasurement) {
        cancelActiveBenchmarkMeasurement();
        cancelActiveBenchmarkMeasurement = null;
    }
    closeBenchmarkWindow(runWindow);
    resetBenchmarkUi();

    return restoreBenchmarkPreset(sessionId, { keepalive });
}

function stopBenchmark() {
    void stopBenchmarkRun().catch(error => {
        console.error('Failed to restore stopped benchmark session:', error);
        showToast(requestFailureMessage(error, 'Failed to restore benchmark session'), 'error');
    });

    const msg = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.benchmark.cancelled') : 'Benchmark cancelled';
    showToast(msg, 'error');
}

function closeBenchmarkWindow(windowToClose = benchmarkWindow) {
    if (windowToClose && !windowToClose.closed) {
        windowToClose.close();
    }

    if (benchmarkWindow === windowToClose) benchmarkWindow = null;
}

function resetBenchmarkUi() {
    const startBtn = document.getElementById('start-benchmark');
    const stopBtn = document.getElementById('stop-benchmark');
    const progressDiv = document.getElementById('benchmark-progress');

    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (progressDiv) progressDiv.style.display = 'none';
}

function restoreBenchmarkPreset(sessionId, { keepalive = false } = {}) {
    if (!sessionId) return Promise.resolve(null);
    const existing = benchmarkRestoreRequests.get(sessionId);
    if (existing && (!keepalive || existing.keepalive)) return existing.promise;

    const record = { keepalive, promise: null };
    const request = requestJson('/api/webgpu-fireworks/benchmark/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        keepalive
    });
    record.promise = request.catch(error => {
        if (benchmarkRestoreRequests.get(sessionId) === record) {
            benchmarkRestoreRequests.delete(sessionId);
        }
        throw error;
    });
    benchmarkRestoreRequests.set(sessionId, record);
    return record.promise;
}

function waitForBenchmarkPollDelay(delayMs) {
    return new Promise(resolve => {
        let settled = false;
        let timer = null;
        const finish = keepRunning => {
            if (settled) return;
            settled = true;
            if (cancelBenchmarkReadinessWait === cancel) cancelBenchmarkReadinessWait = null;
            resolve(keepRunning);
        };
        const cancel = () => {
            if (timer !== null) window.clearTimeout(timer);
            finish(false);
        };
        timer = window.setTimeout(() => finish(true), delayMs);
        cancelBenchmarkReadinessWait = cancel;
    });
}

async function waitForBenchmarkRenderer(sessionId) {
    const fpsUrl = `/api/webgpu-fireworks/benchmark/fps?sessionId=${encodeURIComponent(sessionId)}`;
    const maxAttempts = Math.max(
        1,
        Math.ceil(BENCHMARK_CONFIG.RENDERER_READY_TIMEOUT / BENCHMARK_CONFIG.RENDERER_READY_POLL_INTERVAL)
    );
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!benchmarkRunning || benchmarkSessionId !== sessionId) return false;
        try {
            await requestJson(fpsUrl, { cache: 'no-store' });
            return true;
        } catch (error) {
            lastError = error;
            if (error.status !== 503) throw error;
        }
        if (attempt < maxAttempts - 1) {
            const keepRunning = await waitForBenchmarkPollDelay(BENCHMARK_CONFIG.RENDERER_READY_POLL_INTERVAL);
            if (!keepRunning) return false;
        }
    }

    throw lastError || new Error('Benchmark renderer did not become ready');
}

async function runBenchmarkTest(presetName, sessionId, runId) {
    const preset = PRESETS[presetName];

    // Apply preset temporarily via API
    await requestJson('/api/webgpu-fireworks/benchmark/set-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, preset })
    });
    if (!isBenchmarkRunActive(runId, sessionId)) return null;

    // Trigger test fireworks and measure FPS
    const fpsData = await measureFPS(sessionId, runId);
    if (!isBenchmarkRunActive(runId, sessionId)) return null;

    return {
        preset: presetName,
        avgFps: fpsData.avgFps,
        minFps: fpsData.minFps,
        maxFps: fpsData.maxFps,
        config: preset
    };
}

async function measureFPS(sessionId, runId = null) {
    // Trigger multiple fireworks to stress test
    const testDuration = BENCHMARK_CONFIG.TEST_DURATION;
    const fireworkInterval = BENCHMARK_CONFIG.FIREWORK_INTERVAL;

    const fpsReadings = [];
    const runIsCurrent = () => runId === null || isBenchmarkRunActive(runId, sessionId);

    // Trigger one immediately so the benchmark window never looks idle while
    // the first interval is pending, then keep the visual load consistent.
    const triggerBenchmarkFirework = async () => {
        if (!runIsCurrent()) return null;
        return requestJson('/api/webgpu-fireworks/benchmark/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                shape: 'burst',
                intensity: 1.5,
                positionMode: 'exact',
                position: { x: Math.random() * 0.76 + 0.12, y: Math.random() * 0.4 + 0.18 },
                origin: { x: Math.random() * 0.84 + 0.08, y: 1.04 },
                playSound: false
            })
        });
    };
    const readBenchmarkFps = async () => {
        if (!runIsCurrent()) return;
        const data = await requestJson(
            `/api/webgpu-fireworks/benchmark/fps?sessionId=${encodeURIComponent(sessionId)}`,
            { cache: 'no-store' }
        );
        if (!runIsCurrent()) return;
        const fps = Number(data.fps);
        if (Number.isFinite(fps) && fps >= 0) fpsReadings.push(fps);
    };

    if (!runIsCurrent()) return { avgFps: 0, minFps: 0, maxFps: 0 };
    await triggerBenchmarkFirework();
    if (!runIsCurrent()) return { avgFps: 0, minFps: 0, maxFps: 0 };
    await new Promise((resolve, reject) => {
        let finished = false;
        let fireworkTimer = null;
        let fpsTimer = null;
        let durationTimer = null;
        const finish = error => {
            if (finished) return;
            finished = true;
            if (fireworkTimer !== null) window.clearInterval(fireworkTimer);
            if (fpsTimer !== null) window.clearInterval(fpsTimer);
            if (durationTimer !== null) window.clearTimeout(durationTimer);
            cancelActiveBenchmarkMeasurement = null;
            if (error) reject(error);
            else resolve();
        };
        fireworkTimer = window.setInterval(() => {
            if (!runIsCurrent()) {
                finish();
                return;
            }
            void triggerBenchmarkFirework().catch(finish);
        }, fireworkInterval);
        fpsTimer = window.setInterval(() => {
            if (!runIsCurrent()) {
                finish();
                return;
            }
            void readBenchmarkFps().catch(finish);
        }, BENCHMARK_CONFIG.FPS_SAMPLE_INTERVAL);
        durationTimer = window.setTimeout(() => finish(), testDuration);
        cancelActiveBenchmarkMeasurement = () => finish();
    });

    // Calculate statistics
    if (fpsReadings.length === 0) {
        return { avgFps: 0, minFps: 0, maxFps: 0 };
    }

    const avgFps = fpsReadings.reduce((a, b) => a + b, 0) / fpsReadings.length;
    const minFps = Math.min(...fpsReadings);
    const maxFps = Math.max(...fpsReadings);

    return { avgFps, minFps, maxFps };
}

function displayBenchmarkResults() {
    const resultsDiv = document.getElementById('benchmark-results');
    const resultsContainer = resultsDiv.querySelector('.grid');
    const recommendationsDiv = document.getElementById('benchmark-recommendations');

    resultsDiv.style.display = 'block';

    // Clear previous results
    resultsContainer.innerHTML = '';

    const framesPerSecond = t('plugins.webgpu-fireworks.ui.frames_per_second', 'FPS');

    // Sort by avgFps descending
    const sortedResults = [...benchmarkResults].sort((a, b) => b.avgFps - a.avgFps);

    // Display all results
    sortedResults.forEach((result, index) => {
        const resultCard = document.createElement('div');
        resultCard.className = 'card rounded-xl p-4';

        let colorClass = 'text-gray-400';
        let fpsIcon = '❌';

        if (result.avgFps >= 55) {
            colorClass = 'text-green-400';
            fpsIcon = '✅';
        } else if (result.avgFps >= 40) {
            colorClass = 'text-blue-400';
            fpsIcon = '✔️';
        } else if (result.avgFps >= 30) {
            colorClass = 'text-yellow-400';
            fpsIcon = '⚠️';
        } else {
            colorClass = 'text-red-400';
            fpsIcon = '❌';
        }

        resultCard.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-bold text-lg ${colorClass}">${fpsIcon} ${result.preset.toUpperCase()}</h4>
                <span class="text-2xl font-bold ${colorClass}">${result.avgFps.toFixed(1)} ${framesPerSecond}</span>
            </div>
            <div class="text-sm text-gray-400 space-y-1">
                <div>${t('plugins.webgpu-fireworks.ui.minimum', 'Min')}: ${result.minFps.toFixed(1)} ${framesPerSecond} | ${t('plugins.webgpu-fireworks.ui.maximum', 'Max')}: ${result.maxFps.toFixed(1)} ${framesPerSecond}</div>
                <div>${t('plugins.webgpu-fireworks.ui.resolution', 'Resolution')}: ${result.config.resolutionPreset} | ${t('plugins.webgpu-fireworks.ui.particles_label', 'Particles')}: ${result.config.maxParticles}</div>
            </div>
        `;

        resultsContainer.appendChild(resultCard);
    });

    // Generate recommendations (top 2 presets with avgFps >= 30)
    const goodPresets = sortedResults.filter(r => r.avgFps >= 30);
    const recommendations = goodPresets.slice(0, 2);

    recommendationsDiv.innerHTML = '';

    if (recommendations.length === 0) {
        const msg = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.benchmark.no_good_presets') : 'No preset reaches 30 FPS. We recommend the "Potato" preset for your system.';
        const applyText = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.presets.apply') : 'Apply';

        const btn = document.createElement('button');
        btn.className = 'w-full mt-4 bg-green-500 hover:bg-green-600 py-3 rounded-lg font-bold transition';
        btn.dataset.preset = 'potato';
        btn.textContent = `🥔 ${t('plugins.webgpu-fireworks.ui.preset_potato', 'Potato')} ${applyText}`;
        btn.addEventListener('click', () => applyPreset('potato'));

        const para = document.createElement('p');
        para.className = 'text-yellow-300';
        para.textContent = `⚠️ ${msg}`;

        recommendationsDiv.appendChild(para);
        recommendationsDiv.appendChild(btn);
    } else {
        recommendations.forEach((rec, index) => {
            const recDiv = document.createElement('div');
            recDiv.className = 'mb-4';

            const bestChoice = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.benchmark.best_choice') : 'Best Choice';
            const alternative = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.benchmark.alternative') : 'Alternative';
            const applyText = window.i18n ? window.i18n.t('plugins.webgpu-fireworks.webgpu_fireworks.presets.apply') : 'Apply';

            const rank = index === 0 ? `🥇 ${bestChoice}` : `🥈 ${alternative}`;

            const headerDiv = document.createElement('div');
            headerDiv.className = 'flex items-center justify-between mb-2';
            headerDiv.innerHTML = `
                <span class="font-bold">${rank}: ${rec.preset.toUpperCase()}</span>
                <span class="text-green-300 font-bold">${rec.avgFps.toFixed(1)} ${framesPerSecond}</span>
            `;

            const btn = document.createElement('button');
            btn.className = 'w-full bg-green-500 hover:bg-green-600 py-2 rounded-lg font-bold transition';
            btn.dataset.preset = rec.preset;
            btn.textContent = applyText;
            btn.addEventListener('click', () => applyPreset(rec.preset));

            recDiv.appendChild(headerDiv);
            recDiv.appendChild(btn);

            recommendationsDiv.appendChild(recDiv);
        });
    }
}

function saveBenchmarkResults() {
    try {
        localStorage.setItem('webgpu-fireworks-benchmark-results', JSON.stringify(benchmarkResults));
    } catch (e) {
        console.error('Failed to save benchmark results:', e);
    }
}

function loadBenchmarkResults() {
    try {
        const saved = localStorage.getItem('webgpu-fireworks-benchmark-results');
        if (saved) {
            benchmarkResults = JSON.parse(saved);
            if (benchmarkResults.length > 0) {
                displayBenchmarkResults();
            }
        }
    } catch (e) {
        console.error('Failed to load benchmark results:', e);
    }
}

function renderGiftStyleMappings() {
    const root = document.getElementById('gift-style-list');
    if (!root) return;
    const mappings = config.giftShapeMappings || {};
    root.replaceChildren();
    for (const [giftId, mapping] of Object.entries(mappings)) {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-2 bg-black/20 rounded px-3 py-2';
        const label = document.createElement('span');
        label.textContent = `${giftId}: ${mapping.shape || 'burst'} / ${mapping.visualStyle ? formatVisualStyle(mapping.visualStyle) : t('plugins.webgpu-fireworks.ui.global_style', 'Global style')}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'text-red-300 font-bold';
        remove.textContent = t('plugins.webgpu-fireworks.ui.remove', 'Remove');
        remove.addEventListener('click', () => {
            removeGiftStyleMapping(giftId).catch(error => {
                const fallback = t('plugins.webgpu-fireworks.ui.gift_mapping_remove_failed', 'Gift mapping could not be removed');
                showToast(requestFailureMessage(error, fallback), 'error');
            });
        });
        row.append(label, remove);
        root.appendChild(row);
    }
    if (!root.childElementCount) root.textContent = t('plugins.webgpu-fireworks.ui.no_gift_overrides', 'No gift-specific overrides.');
}

async function saveGiftStyleMapping() {
    const giftId = document.getElementById('gift-style-id')?.value.trim();
    if (!giftId) {
        showToast(t('plugins.webgpu-fireworks.ui.gift_id_required', 'Gift ID is required'), 'error');
        return;
    }
    const existing = config.giftShapeMappings?.[giftId] || {};
    await requestJson('/api/webgpu-fireworks/gift-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            giftId,
            shape: document.getElementById('gift-style-shape')?.value || existing.shape || 'burst',
            visualStyle: document.getElementById('gift-style-override')?.value || null,
            colors: existing.colors || null,
            intensity: existing.intensity || 1
        })
    });
    config.giftShapeMappings = {
        ...(config.giftShapeMappings || {}),
        [giftId]: {
            ...existing,
            shape: document.getElementById('gift-style-shape')?.value || 'burst',
            visualStyle: document.getElementById('gift-style-override')?.value || null
        }
    };
    renderGiftStyleMappings();
    showToast(t('plugins.webgpu-fireworks.ui.gift_override_saved', 'Gift style override saved'), 'success');
}

async function removeGiftStyleMapping(giftId) {
    await requestJson(`/api/webgpu-fireworks/gift-mappings/${encodeURIComponent(giftId)}`, { method: 'DELETE' });
    delete config.giftShapeMappings[giftId];
    renderGiftStyleMappings();
}
