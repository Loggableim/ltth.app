/**
 * Fireworks Superplugin - Settings UI Controller
 * CSP-Compliant - No inline event handlers
 */

// State
let config = {};
let socket = null;

// Benchmark configuration constants
const BENCHMARK_CONFIG = {
    WINDOW_LOAD_DELAY: 2000,      // Wait 2s for overlay window to fully load
    TEST_DURATION: 10000,          // Each preset tested for 10 seconds
    FIREWORK_INTERVAL: 500,        // Trigger firework every 500ms
    FPS_SAMPLE_INTERVAL: 1000,     // Sample FPS every second
    INTER_TEST_DELAY: 1000         // Wait 1s between different preset tests
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    const overlayUrlInput = document.getElementById('fireworks-overlay-url');
    if (overlayUrlInput) {
        overlayUrlInput.value = `${window.location.origin}/fireworks/overlay`;
    }

    // Initialize i18n first
    if (window.i18n) {
        await window.i18n.init();
        window.i18n.updateDOM();
        
        // Listen for language changes from main app
        window.i18n.onChange(() => {
            window.i18n.updateDOM();
            refreshLocalizedRuntimeState();
        });
    }
    
    // Connect to socket
    connectSocket();
    
    // Load configuration
    await loadConfig();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize tab system
    initializeTabs();
    
    // Initialize presets
    initializePresets();
    
    // Initialize benchmark
    initializeBenchmark();
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

        socket.on('fireworks:config-update', (data) => {
            if (data.config) {
                config = data.config;
                updateUI();
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
    try {
        const response = await fetch('/api/fireworks/config');
        const data = await response.json();
        
        if (data.success) {
            config = data.config;
            updateUI();
        }
    } catch (e) {
        console.error('[Fireworks Settings] Failed to load config:', e);
        showToast(translateFireworks('plugins.fireworks.ui.messages.configuration_load_failed', 'Failed to load configuration'), 'error');
    }
}

async function saveConfig(showSuccessToast = true) {
    try {
        normalizeInternalResolutionBounds();
        const response = await fetch('/api/fireworks/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.config) {
                config = data.config;
                updateUI();
            }
            if (showSuccessToast) {
                showToast(translateFireworks('plugins.fireworks.ui.messages.settings_saved', 'Settings saved successfully!'), 'success');
            }
        } else {
            showToast(translateFireworks('plugins.fireworks.ui.messages.settings_save_failed', 'Failed to save settings'), 'error');
        }
    } catch (e) {
        console.error('[Fireworks Settings] Failed to save config:', e);
        showToast(translateFireworks('plugins.fireworks.ui.messages.settings_save_failed', 'Failed to save settings'), 'error');
    }
}

async function triggerTest() {
    try {
        const selectedShape = document.querySelector('.shape-preview.active-shape, .shape-preview.selected');
        const shape = selectedShape ? selectedShape.dataset.shape : (config.defaultShape || 'burst');
        
        await fetch('/api/fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: shape,
                intensity: 1.5,
                position: { x: 0.5, y: 0.5 }
            })
        });
        
        showToast(translateFireworks('plugins.fireworks.ui.messages.firework_triggered', 'Firework triggered'), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger test:', e);
        showToast(translateFireworks('plugins.fireworks.ui.messages.trigger_failed', 'Failed to trigger test'), 'error');
    }
}

async function triggerFinale() {
    try {
        const intensity = parseFloat(document.getElementById('finale-intensity').value);
        
        await fetch('/api/fireworks/finale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                intensity: intensity,
                duration: 5000
            })
        });
        
        showToast(translateFireworks('plugins.fireworks.ui.messages.finale_triggered', 'Finale triggered!'), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger finale:', e);
        showToast(translateFireworks('plugins.fireworks.ui.messages.finale_trigger_failed', 'Failed to trigger finale'), 'error');
    }
}

async function testFollowerFireworks() {
    try {
        await fetch('/api/fireworks/test-follower', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'TestFollower',
                profilePictureUrl: 'https://www.gravatar.com/avatar/?d=mp&s=200'
            })
        });
        
        showToast(translateFireworks('plugins.fireworks.ui.messages.follower_triggered', 'Follower fireworks triggered!'), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger follower test:', e);
        showToast(translateFireworks('plugins.fireworks.ui.messages.follower_trigger_failed', 'Failed to trigger follower test'), 'error');
    }
}

// ============================================================================
// UI UPDATE
// ============================================================================

function updateUI() {
    normalizeInternalResolutionBounds();

    // Master toggle
    updateToggle('master-toggle', config.enabled);
    
    // Gift triggers
    updateToggle('gift-toggle', config.giftTriggersEnabled);
    document.getElementById('min-coins').value = config.minGiftCoins || 1;
    
    // Combo system
    updateToggle('combo-toggle', config.comboEnabled);
    const comboTimeout = (config.comboTimeout || 10000) / 1000;
    document.getElementById('combo-timeout').value = comboTimeout;
    document.getElementById('combo-timeout-value').textContent = comboTimeout + 's';
    document.getElementById('combo-max').value = config.comboMaxMultiplier || 5;
    document.getElementById('combo-max-value').textContent = (config.comboMaxMultiplier || 5) + 'x';
    
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
    const volume = Math.round((config.audioVolume || 0.7) * 100);
    document.getElementById('audio-volume').value = volume;
    document.getElementById('audio-volume-value').textContent = volume + '%';
    
    // Color mode
    document.getElementById('color-mode').value = config.colorMode || 'gift';
    renderColorSwatches();
    
    // Visual effects
    updateToggle('trails-toggle', config.trailsEnabled);
    updateToggle('glow-toggle', config.glowEnabled);
    document.getElementById('max-particles').value = config.maxParticles || 1000;
    document.getElementById('max-particles-value').textContent = config.maxParticles || 1000;
    if (config.particleSizeRange) {
        document.getElementById('particle-min').value = config.particleSizeRange[0] || 3;
        document.getElementById('particle-max').value = config.particleSizeRange[1] || 10;
    }
    
    // Goal finale
    updateToggle('finale-toggle', config.goalFinaleEnabled);
    document.getElementById('finale-intensity').value = config.goalFinaleIntensity || 3;
    document.getElementById('finale-intensity-value').textContent = (config.goalFinaleIntensity || 3) + 'x';
    
    // Follower fireworks
    updateToggle('follower-toggle', config.followerFireworksEnabled);
    updateToggle('follower-animation-toggle', config.followerShowAnimation);
    updateToggle('follower-profile-toggle', config.followerShowProfilePicture);
    document.getElementById('follower-rocket-count').value = config.followerRocketCount || 3;
    document.getElementById('follower-rocket-count-value').textContent = config.followerRocketCount || 3;
    document.getElementById('follower-animation-duration').value = (config.followerAnimationDuration || 3000) / 1000;
    document.getElementById('follower-animation-duration-value').textContent = ((config.followerAnimationDuration || 3000) / 1000) + 's';
    document.getElementById('follower-animation-delay').value = (config.followerAnimationDelay || 3000) / 1000;
    document.getElementById('follower-animation-delay-value').textContent = ((config.followerAnimationDelay || 3000) / 1000) + 's';
    document.getElementById('follower-animation-position').value = config.followerAnimationPosition || 'center';
    document.getElementById('follower-animation-size').value = config.followerAnimationSize || 'medium';
    document.getElementById('follower-animation-scale').value = config.followerAnimationScale || 1.0;
    document.getElementById('follower-animation-scale-value').textContent = (config.followerAnimationScale || 1.0) + 'x';
    document.getElementById('follower-animation-style').value = config.followerAnimationStyle || 'gradient-purple';
    document.getElementById('follower-animation-entrance').value = config.followerAnimationEntrance || 'scale';
    
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
    
    // User avatar integration
    updateToggle('avatar-toggle', config.userAvatarEnabled);
    const avatarChance = Math.round((config.avatarParticleChance || 0.3) * 100);
    const avatarChanceSlider = document.getElementById('avatar-chance');
    const avatarChanceValue = document.getElementById('avatar-chance-value');
    if (avatarChanceSlider) {
        avatarChanceSlider.value = avatarChance;
    }
    if (avatarChanceValue) {
        avatarChanceValue.textContent = avatarChance + '%';
    }
    
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
    
    const targetFps = config.targetFps || 60;
    const targetFpsSlider = document.getElementById('target-fps');
    const targetFpsValue = document.getElementById('target-fps-value');
    if (targetFpsSlider) {
        targetFpsSlider.value = targetFps;
    }
    if (targetFpsValue) {
        targetFpsValue.textContent = targetFps + ' FPS';
    }
    const minFps = config.minFps || 30;
    const minFpsSlider = document.getElementById('min-fps');
    const minFpsValue = document.getElementById('min-fps-value');
    if (minFpsSlider) {
        minFpsSlider.value = minFps;
    }
    if (minFpsValue) {
        minFpsValue.textContent = minFps + ' FPS';
    }
    
    // Despawn fade duration
    const despawnFade = config.despawnFadeDuration || 3.0;
    const despawnFadeSlider = document.getElementById('despawn-fade');
    const despawnFadeValue = document.getElementById('despawn-fade-value');
    if (despawnFadeSlider) {
        despawnFadeSlider.value = despawnFade;
    }
    if (despawnFadeValue) {
        despawnFadeValue.textContent = despawnFade + 's';
    }
    
    // Queue system settings
    updateToggle('queue-enabled-toggle', !!config.queueEnabled);
    const maxRocketsPerSecond = config.maxRocketsPerSecond || 5;
    const maxRocketsSlider = document.getElementById('max-rockets-per-second');
    const maxRocketsValue = document.getElementById('max-rockets-value');
    if (maxRocketsSlider) {
        maxRocketsSlider.value = maxRocketsPerSecond;
    }
    if (maxRocketsValue) {
        maxRocketsValue.textContent = maxRocketsPerSecond + '/s';
    }
    
    // Gift popup settings
    updateToggle('gift-popup-enabled-toggle', config.giftPopupEnabled !== false);
    const giftPopupPositionSelect = document.getElementById('gift-popup-position');
    if (giftPopupPositionSelect) {
        giftPopupPositionSelect.value = config.giftPopupPosition || 'bottom';
    }
    
    // Performance Limits (NEW)
    const maxFireworks = config.maxConcurrentFireworks || 5;
    const maxFireworksSlider = document.getElementById('max-fireworks');
    const maxFireworksValue = document.getElementById('max-fireworks-value');
    if (maxFireworksSlider) {
        maxFireworksSlider.value = maxFireworks;
    }
    if (maxFireworksValue) {
        maxFireworksValue.textContent = maxFireworks;
    }

    const maxParticlesLimit = config.maxTotalParticles || 800;
    const maxParticlesLimitSlider = document.getElementById('max-particles-limit');
    const maxParticlesLimitValue = document.getElementById('max-particles-limit-value');
    if (maxParticlesLimitSlider) {
        maxParticlesLimitSlider.value = maxParticlesLimit;
    }
    if (maxParticlesLimitValue) {
        maxParticlesLimitValue.textContent = maxParticlesLimit;
    }

    const emergencyThreshold = config.emergencyCleanupThreshold || 1000;
    const emergencyThresholdSlider = document.getElementById('emergency-threshold');
    const emergencyThresholdValue = document.getElementById('emergency-threshold-value');
    if (emergencyThresholdSlider) {
        emergencyThresholdSlider.value = emergencyThreshold;
    }
    if (emergencyThresholdValue) {
        emergencyThresholdValue.textContent = emergencyThreshold;
    }

    const minTargetFps = config.minTargetFps || 30;
    const minTargetFpsSlider = document.getElementById('min-target-fps');
    const minTargetFpsValue = document.getElementById('min-target-fps-value');
    if (minTargetFpsSlider) {
        minTargetFpsSlider.value = minTargetFps;
    }
    if (minTargetFpsValue) {
        minTargetFpsValue.textContent = minTargetFps;
    }

    updateToggle('adaptive-toggle', config.adaptivePerformance !== false);
    updateToggle('frame-skip-toggle', config.frameSkipEnabled !== false);
    updateOverviewSummary();
}

function updateToggle(id, value) {
    const toggle = document.getElementById(id);
    if (toggle) {
        toggle.classList.toggle('active', value !== false);
    }
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
    const themes = {
        day: 'Day',
        contrast: 'High Contrast',
        'vision-impaired': 'Vision',
        cid: 'CID',
        night: 'Night'
    };
    const key = Object.hasOwn(themes, theme) ? theme : 'night';
    return translateFireworks(`plugins.fireworks.ui.themes.${key}`, themes[key]);
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

    const orientationLabel = getLocalizedOrientation(orientation);
    const enabledLabel = translateFireworks(
        config.enabled ? 'plugins.fireworks.ui.status.enabled' : 'plugins.fireworks.ui.status.disabled',
        config.enabled ? 'Enabled' : 'Disabled'
    );
    const queueLabel = translateFireworks(
        queueEnabled ? 'plugins.fireworks.ui.status.queue_on' : 'plugins.fireworks.ui.status.queue_off',
        queueEnabled ? 'Queue on' : 'Queue off'
    );
    const adaptiveLabel = translateFireworks(
        adaptiveEnabled ? 'plugins.fireworks.ui.status.adaptive_on' : 'plugins.fireworks.ui.status.adaptive_off',
        adaptiveEnabled ? 'Adaptive on' : 'Adaptive off'
    );

    setChipState('overview-enabled-state', enabledLabel, config.enabled);
    setChipState('overview-theme-state', translateFireworks('plugins.fireworks.ui.summary.theme', 'Theme: {theme}', { theme }));
    setChipState('overview-resolution-state', translateFireworks('plugins.fireworks.ui.summary.resolution', '{preset} · {orientation}', { preset: resolutionPreset, orientation: orientationLabel }));
    setChipState('overview-performance-state', translateFireworks('plugins.fireworks.ui.summary.performance', '{fps} FPS · {particles} particles', { fps: targetFps, particles: maxParticles.toLocaleString() }));
    setChipState('overview-safety-state', translateFireworks('plugins.fireworks.ui.summary.safety', '{queue} · {adaptive}', { queue: queueLabel, adaptive: adaptiveLabel }));
}

function translateFireworks(key, fallback, params = {}) {
    const translated = window.i18n?.t?.(key, params);
    if (translated && translated !== key) return translated;
    return String(fallback).replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
    ));
}

function getLocalizedOrientation(orientation) {
    const isPortrait = orientation === 'portrait';
    return translateFireworks(
        isPortrait ? 'plugins.fireworks.ui.defaults.portrait' : 'plugins.fireworks.ui.defaults.landscape',
        isPortrait ? 'Portrait' : 'Landscape'
    );
}

function refreshLocalizedRuntimeState() {
    updateOverviewSummary();
    updateResolutionInfo(config.resolutionPreset || '1080p', config.orientation || 'landscape');
    updateInternalResolutionInfo(
        config.resolutionPreset || '1080p',
        config.internalMaxResolutionPreset || '4k',
        config.internalMinResolutionPreset || '540p',
        config.orientation || 'landscape'
    );
}

function updateResolutionInfo(preset, orientation) {
    const resolutions = {
        '360p': { landscape: '640x360', portrait: '360x640', impact: 'minimal', fallbackImpact: 'Minimal' },
        '480p': { landscape: '854x480', portrait: '480x854', impact: 'very_low', fallbackImpact: 'Very Low' },
        '540p': { landscape: '960x540', portrait: '540x960', impact: 'low', fallbackImpact: 'Low' },
        '720p': { landscape: '1280x720', portrait: '720x1280', impact: 'medium', fallbackImpact: 'Medium' },
        '1080p': { landscape: '1920x1080', portrait: '1080x1920', impact: 'high', fallbackImpact: 'High' },
        '1440p': { landscape: '2560x1440', portrait: '1440x2560', impact: 'very_high', fallbackImpact: 'Very High' },
        '4k': { landscape: '3840x2160', portrait: '2160x3840', impact: 'ultra', fallbackImpact: 'Ultra' }
    };
    
    const info = resolutions[preset] || resolutions['1080p'];
    const resolution = orientation === 'portrait' ? info.portrait : info.landscape;
    
    const currentResEl = document.getElementById('current-resolution');
    const currentOrientEl = document.getElementById('current-orientation');
    const performanceEl = document.getElementById('performance-impact');
    
    if (currentResEl) currentResEl.textContent = resolution;
    if (currentOrientEl) currentOrientEl.textContent = getLocalizedOrientation(orientation);
    if (performanceEl) performanceEl.textContent = translateFireworks(`plugins.fireworks.ui.impact.${info.impact}`, info.fallbackImpact);
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
    
    // Test buttons
    document.getElementById('test-btn').addEventListener('click', triggerTest);
    document.getElementById('test-finale-btn').addEventListener('click', triggerFinale);
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
        this.classList.toggle('active');
        config.enabled = this.classList.contains('active');
    });
    
    // All toggle switches
    document.querySelectorAll('.toggle-switch[data-config]').forEach(toggle => {
        toggle.addEventListener('click', function() {
            this.classList.toggle('active');
            const configKey = this.dataset.config;
            config[configKey] = this.classList.contains('active');
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
    
    // Range sliders
    setupRangeSlider('combo-timeout', 'combo-timeout-value', 's', (val) => {
        config.comboTimeout = val * 1000;
    });
    
    setupRangeSlider('combo-max', 'combo-max-value', 'x', (val) => {
        config.comboMaxMultiplier = parseFloat(val);
    });
    
    setupRangeSlider('audio-volume', 'audio-volume-value', '%', (val) => {
        config.audioVolume = val / 100;
    });
    
    setupRangeSlider('max-particles', 'max-particles-value', '', (val) => {
        config.maxParticles = parseInt(val);
    });
    
    setupRangeSlider('finale-intensity', 'finale-intensity-value', 'x', (val) => {
        config.goalFinaleIntensity = parseFloat(val);
    });
    
    setupRangeSlider('follower-rocket-count', 'follower-rocket-count-value', '', (val) => {
        config.followerRocketCount = parseInt(val);
    });
    
    setupRangeSlider('follower-animation-duration', 'follower-animation-duration-value', 's', (val) => {
        config.followerAnimationDuration = val * 1000; // Convert to ms
    });
    
    setupRangeSlider('follower-animation-delay', 'follower-animation-delay-value', 's', (val) => {
        config.followerAnimationDelay = val * 1000; // Convert to ms
    });
    
    setupRangeSlider('follower-animation-scale', 'follower-animation-scale-value', 'x', (val) => {
        config.followerAnimationScale = parseFloat(val);
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
    
    setupRangeSlider('avatar-chance', 'avatar-chance-value', '%', (val) => {
        config.avatarParticleChance = val / 100;
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
    
    setupRangeSlider('target-fps', 'target-fps-value', ' FPS', (val) => {
        config.targetFps = parseInt(val);
    });
    
    setupRangeSlider('min-fps', 'min-fps-value', ' FPS', (val) => {
        config.minFps = parseInt(val);
    });
    
    setupRangeSlider('despawn-fade', 'despawn-fade-value', 's', (val) => {
        config.despawnFadeDuration = parseFloat(val);
        // Note: Changes take effect after clicking "Save Settings" button
        // This is consistent with other settings like FPS, audio volume, etc.
    });
    
    // Queue system slider
    setupRangeSlider('max-rockets-per-second', 'max-rockets-value', '/s', (val) => {
        config.maxRocketsPerSecond = Math.max(1, Math.min(20, parseInt(val)));
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
    
    // Performance Limits Sliders (NEW)
    setupRangeSlider('max-fireworks', 'max-fireworks-value', '', (val) => {
        config.maxConcurrentFireworks = parseInt(val);
    });

    setupRangeSlider('max-particles-limit', 'max-particles-limit-value', '', (val) => {
        config.maxTotalParticles = parseInt(val);
    });

    setupRangeSlider('emergency-threshold', 'emergency-threshold-value', '', (val) => {
        config.emergencyCleanupThreshold = parseInt(val);
    });

    setupRangeSlider('min-target-fps', 'min-target-fps-value', '', (val) => {
        config.minTargetFps = parseInt(val);
    });

    // Performance Toggles (NEW)
    document.getElementById('adaptive-toggle')?.addEventListener('click', function() {
        this.classList.toggle('active');
        config.adaptivePerformance = this.classList.contains('active');
    });

    document.getElementById('frame-skip-toggle')?.addEventListener('click', function() {
        this.classList.toggle('active');
        config.frameSkipEnabled = this.classList.contains('active');
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
    });
    
    // Overlay buttons
    document.getElementById('copy-overlay-url').addEventListener('click', () => {
        const url = window.location.origin + '/fireworks/overlay';
        navigator.clipboard.writeText(url).then(() => {
            showToast(translateFireworks('plugins.fireworks.ui.messages.overlay_url_copied', 'Overlay URL copied to clipboard!'), 'success');
        });
    });
    
    const colorPicker = document.getElementById('color-picker');
    const colorHex = document.getElementById('color-hex');
    const normalizeColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(value || '') ? value.toUpperCase() : null;
    colorPicker?.addEventListener('input', () => {
        if (colorHex) colorHex.value = colorPicker.value.toUpperCase();
    });
    colorHex?.addEventListener('change', () => {
        const color = normalizeColor(colorHex.value);
        if (!color) {
            colorHex.value = colorPicker?.value?.toUpperCase() || '#FF4444';
            return;
        }
        colorHex.value = color;
        if (colorPicker) colorPicker.value = color;
    });
    document.getElementById('add-color').addEventListener('click', () => {
        const color = normalizeColor(colorHex?.value || colorPicker?.value);
        if (!color) return;
        if (!config.themeColors) config.themeColors = [];
        if (!config.themeColors.includes(color)) {
            config.themeColors.push(color);
            renderColorSwatches();
        }
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
}

function addColorSwatch(color) {
    const container = document.getElementById('color-swatches');
    const addBtn = document.getElementById('add-color');
    
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.dataset.color = color;
    swatch.title = translateFireworks('plugins.fireworks.ui.messages.color_remove_hint', '{color} — click to remove', { color });
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
    });
    swatch.title = translateFireworks('plugins.fireworks.ui.messages.color_remove_hint', '{color} — click to remove', { color });
    swatch.addEventListener('click', () => {
        config.themeColors = (config.themeColors || []).filter(item => item !== color);
        renderColorSwatches();
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
        await fetch('/api/fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: shape,
                intensity: intensity,
                position: { x: 0.5, y: 0.5 }
            })
        });
        
        showToast(translateFireworks('plugins.fireworks.ui.messages.shape_triggered', '{shape} firework triggered!', { shape }), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger test:', e);
        showToast(translateFireworks('plugins.fireworks.ui.messages.trigger_failed', 'Failed to trigger test'), 'error');
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
        await fetch('/api/fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: config.defaultShape || 'burst',
                intensity: intensities[tier],
                particleCount: particleCounts[tier],
                position: { x: 0.5, y: 0.5 }
            })
        });
        
        showToast(translateFireworks('plugins.fireworks.ui.messages.tier_triggered', '{tier} tier firework triggered!', { tier }), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger tier test:', e);
        showToast(translateFireworks('plugins.fireworks.ui.messages.tier_trigger_failed', 'Failed to trigger tier test'), 'error');
    }
}

/**
 * Test random shape
 */
async function triggerTestRandom() {
    try {
        await fetch('/api/fireworks/random', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        showToast(translateFireworks('plugins.fireworks.ui.messages.random_triggered', 'Random firework triggered!'), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger random:', e);
        showToast(translateFireworks('plugins.fireworks.ui.messages.random_trigger_failed', 'Failed to trigger random'), 'error');
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
        await fetch('/api/fireworks/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shape: config.defaultShape || 'burst',
                intensity: 1.5,
                position: { x: 0.5, y: 0.5 },
                userAvatar: avatarUrl
            })
        });
        
        showToast(translateFireworks('plugins.fireworks.ui.messages.avatar_triggered', 'Avatar firework test triggered!'), 'success');
    } catch (e) {
        console.error('[Fireworks Settings] Failed to trigger avatar test:', e);
        showToast(translateFireworks('plugins.fireworks.ui.messages.avatar_trigger_failed', 'Failed to trigger avatar test'), 'error');
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
        particleSizeMin: 3,
        particleSizeMax: 10
    },
    high: {
        resolutionPreset: '1440p',
        maxParticles: 2000,
        targetFps: 60,
        minFps: 40,
        trailsEnabled: true,
        glowEnabled: true,
        toasterMode: false,
        particleSizeMin: 3,
        particleSizeMax: 10
    },
    medium: {
        resolutionPreset: '1080p',
        maxParticles: 1500,
        targetFps: 60,
        minFps: 30,
        trailsEnabled: true,
        glowEnabled: true,
        toasterMode: false,
        particleSizeMin: 3,
        particleSizeMax: 8
    },
    low: {
        resolutionPreset: '720p',
        maxParticles: 1000,
        targetFps: 48,
        minFps: 24,
        trailsEnabled: true,
        glowEnabled: false,
        toasterMode: false,
        particleSizeMin: 2,
        particleSizeMax: 6
    },
    toaster: {
        resolutionPreset: '540p',
        maxParticles: 500,
        targetFps: 30,
        minFps: 24,
        trailsEnabled: false,
        glowEnabled: false,
        toasterMode: true,
        particleSizeMin: 2,
        particleSizeMax: 5
    },
    potato: {
        resolutionPreset: '360p',
        maxParticles: 300,
        targetFps: 24,
        minFps: 15,
        trailsEnabled: false,
        glowEnabled: false,
        toasterMode: true,
        particleSizeMin: 1,
        particleSizeMax: 4
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
        const msg = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.presets.not_found') : 'Preset not found';
        showToast(msg, 'error');
        return;
    }
    
    // Check if benchmark has recommended against this preset
    const benchmarkResults = localStorage.getItem('fireworks-benchmark-results');
    if (benchmarkResults) {
        try {
            const results = JSON.parse(benchmarkResults);
            const presetResult = results.find(r => r.preset === presetName);
            
            if (presetResult && presetResult.avgFps < 30) {
                const warningTitle = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.presets.warning_title') : 'Warning: This preset might lag on your system!';
                const warningFps = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.presets.warning_fps').replace('{fps}', presetResult.avgFps.toFixed(1)) : `The benchmark measured an average FPS of ${presetResult.avgFps.toFixed(1)}.`;
                const warningConfirm = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.presets.warning_confirm') : 'Do you want to use this setting anyway?';
                
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
    await saveConfig();
    
    const msg = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.presets.applied') : 'Preset applied!';
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

async function startBenchmark() {
    if (benchmarkRunning) return;
    
    benchmarkRunning = true;
    benchmarkResults = [];
    
    const startBtn = document.getElementById('start-benchmark');
    const stopBtn = document.getElementById('stop-benchmark');
    const progressDiv = document.getElementById('benchmark-progress');
    const resultsDiv = document.getElementById('benchmark-results');
    
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    progressDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
    
    // Open overlay window for benchmark
    const overlayUrl = `${window.location.origin}/fireworks/overlay?benchmark=true`;
    benchmarkWindow = window.open(overlayUrl, 'FireworksBenchmark', 'width=1920,height=1080');
    
    if (!benchmarkWindow) {
        const msg = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.benchmark.popup_blocked') : 'Could not open benchmark window. Please allow pop-ups.';
        showToast(msg, 'error');
        benchmarkRunning = false;
        resetBenchmarkUi();
        return;
    }
    
    try {
        // Wait for window to load
        await new Promise(resolve => setTimeout(resolve, BENCHMARK_CONFIG.WINDOW_LOAD_DELAY));
        
        // Run benchmark for each preset
        const presets = ['ultra', 'high', 'medium', 'low', 'toaster', 'potato'];
        const totalSteps = presets.length;
        
        document.getElementById('benchmark-total').textContent = totalSteps;
        
        for (let i = 0; i < presets.length && benchmarkRunning; i++) {
            const presetName = presets[i];
            
            document.getElementById('current-test-name').textContent = presetName.toUpperCase();
            document.getElementById('benchmark-step').textContent = i + 1;
            document.getElementById('benchmark-progress-bar').style.width = `${((i + 1) / totalSteps) * 100}%`;
            
            const result = await runBenchmarkTest(presetName);
            if (result) benchmarkResults.push(result);
            
            // Wait between tests
            await new Promise(resolve => setTimeout(resolve, BENCHMARK_CONFIG.INTER_TEST_DELAY));
        }
        
        if (benchmarkRunning && benchmarkResults.length > 0) {
            displayBenchmarkResults();
            saveBenchmarkResults();
        }
    } catch (e) {
        console.error('Benchmark failed:', e);
        showToast(translateFireworks('plugins.fireworks.ui.messages.benchmark_failed', 'Benchmark failed'), 'error');
    } finally {
        await restoreBenchmarkPreset();
        closeBenchmarkWindow();
        benchmarkRunning = false;
        resetBenchmarkUi();
    }
}

function stopBenchmark() {
    benchmarkRunning = false;
    if (cancelActiveBenchmarkMeasurement) {
        cancelActiveBenchmarkMeasurement();
        cancelActiveBenchmarkMeasurement = null;
    }
    closeBenchmarkWindow();
    resetBenchmarkUi();
    restoreBenchmarkPreset();
    
    const msg = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.benchmark.cancelled') : 'Benchmark cancelled';
    showToast(msg, 'error');
}

function closeBenchmarkWindow() {
    if (benchmarkWindow && !benchmarkWindow.closed) {
        benchmarkWindow.close();
    }
    
    benchmarkWindow = null;
}

function resetBenchmarkUi() {
    const startBtn = document.getElementById('start-benchmark');
    const stopBtn = document.getElementById('stop-benchmark');
    const progressDiv = document.getElementById('benchmark-progress');
    
    if (startBtn) startBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (progressDiv) progressDiv.style.display = 'none';
}

async function restoreBenchmarkPreset() {
    try {
        const response = await fetch('/api/fireworks/benchmark/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`Restore failed with status ${response.status}`);
        }
    } catch (e) {
        console.error('Failed to restore benchmark preset:', e);
    }
}

async function runBenchmarkTest(presetName) {
    const preset = PRESETS[presetName];
    
    // Apply preset temporarily via API
    const response = await fetch('/api/fireworks/benchmark/set-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset })
    });
    
    if (!response.ok) {
        throw new Error(`Failed to apply benchmark preset: ${response.status}`);
    }
    if (!benchmarkRunning) return null;
    
    // Trigger test fireworks and measure FPS
    const fpsData = await measureFPS();
    if (!benchmarkRunning) return null;
    
    return {
        preset: presetName,
        avgFps: fpsData.avgFps,
        minFps: fpsData.minFps,
        maxFps: fpsData.maxFps,
        config: preset
    };
}

async function measureFPS() {
    // Trigger multiple fireworks to stress test
    const testDuration = BENCHMARK_CONFIG.TEST_DURATION;
    const fireworkInterval = BENCHMARK_CONFIG.FIREWORK_INTERVAL;
    
    let fpsReadings = [];
    
    // Start FPS measurement
    const measureStart = Date.now();
    
    // Trigger one immediately so the benchmark window never looks idle while
    // the first interval is pending, then keep the visual load consistent.
    const triggerBenchmarkFirework = async () => {
        try {
            await fetch('/api/fireworks/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shape: 'burst',
                    intensity: 1.5,
                    position: { x: Math.random(), y: Math.random() * 0.5 + 0.25 }
                })
            });
        } catch (e) {
            console.error('Failed to trigger benchmark firework:', e);
        }
    };
    triggerBenchmarkFirework();
    const fireworkTimer = setInterval(triggerBenchmarkFirework, fireworkInterval);
    
    // Collect FPS readings
    const fpsTimer = setInterval(async () => {
        try {
            const response = await fetch('/api/fireworks/benchmark/fps');
            const data = await response.json();
            if (data.success && data.fps) {
                fpsReadings.push(data.fps);
            }
        } catch (e) {
            console.error('Failed to read FPS:', e);
        }
    }, BENCHMARK_CONFIG.FPS_SAMPLE_INTERVAL);
    
    await new Promise(resolve => {
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearInterval(fireworkTimer);
            clearInterval(fpsTimer);
            clearTimeout(durationTimer);
            cancelActiveBenchmarkMeasurement = null;
            resolve();
        };
        const durationTimer = setTimeout(finish, testDuration);
        cancelActiveBenchmarkMeasurement = finish;
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
        
        const fpsMetrics = translateFireworks(
            'plugins.fireworks.ui.messages.benchmark_fps_metrics',
            'Min: {min} FPS | Max: {max} FPS',
            { min: result.minFps.toFixed(1), max: result.maxFps.toFixed(1) }
        );
        const renderMetrics = translateFireworks(
            'plugins.fireworks.ui.messages.benchmark_render_metrics',
            'Resolution: {resolution} | Particles: {particles}',
            { resolution: result.config.resolutionPreset, particles: result.config.maxParticles }
        );

        resultCard.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-bold text-lg ${colorClass}">${fpsIcon} ${result.preset.toUpperCase()}</h4>
                <span class="text-2xl font-bold ${colorClass}">${result.avgFps.toFixed(1)} FPS</span>
            </div>
            <div class="text-sm text-gray-400 space-y-1">
                <div>${fpsMetrics}</div>
                <div>${renderMetrics}</div>
            </div>
        `;
        
        resultsContainer.appendChild(resultCard);
    });
    
    // Generate recommendations (top 2 presets with avgFps >= 30)
    const goodPresets = sortedResults.filter(r => r.avgFps >= 30);
    const recommendations = goodPresets.slice(0, 2);
    
    recommendationsDiv.innerHTML = '';
    
    if (recommendations.length === 0) {
        const msg = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.benchmark.no_good_presets') : 'No preset reaches 30 FPS. We recommend the "Potato" preset for your system.';
        const applyText = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.presets.apply') : 'Apply';
        
        const btn = document.createElement('button');
        btn.className = 'w-full mt-4 bg-green-500 hover:bg-green-600 py-3 rounded-lg font-bold transition';
        btn.dataset.preset = 'potato';
        btn.textContent = `🥔 ${translateFireworks('plugins.fireworks.ui.presets.potato', 'Potato')} ${applyText}`;
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
            
            const bestChoice = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.benchmark.best_choice') : 'Best Choice';
            const alternative = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.benchmark.alternative') : 'Alternative';
            const applyText = window.i18n ? window.i18n.t('plugins.fireworks.fireworks.presets.apply') : 'Apply';
            
            const rank = index === 0 ? `🥇 ${bestChoice}` : `🥈 ${alternative}`;
            
            const headerDiv = document.createElement('div');
            headerDiv.className = 'flex items-center justify-between mb-2';
            headerDiv.innerHTML = `
                <span class="font-bold">${rank}: ${rec.preset.toUpperCase()}</span>
                <span class="text-green-300 font-bold">${rec.avgFps.toFixed(1)} FPS</span>
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
        localStorage.setItem('fireworks-benchmark-results', JSON.stringify(benchmarkResults));
    } catch (e) {
        console.error('Failed to save benchmark results:', e);
    }
}

function loadBenchmarkResults() {
    try {
        const saved = localStorage.getItem('fireworks-benchmark-results');
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
