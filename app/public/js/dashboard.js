// Socket.io Verbindung - delayed until DOM ready to avoid race conditions
// Made global (window.socket) so navigation.js can access it for plugin state changes
let socket = null;
window.socket = null; // Global reference for navigation.js

// State
let currentTab = 'events';
let settings = {};
const LIVE_EVENT_LOG_SETTING_KEY = 'show_live_event_log';
const LIVE_EVENT_LOG_STORAGE_KEY = 'show-live-event-log';
// voices wird vom tts_core_v2 Plugin verwaltet

// Audio unlock state (for browser autoplay restrictions)
let audioUnlocked = false;
let pendingTTSQueue = [];
const ANIMAZINGPAL_HOST_TTS_SOURCE = 'animazingpal-host-speech-output';

// TTS Streaming buffer management
const streamingBuffers = new Map();

// ========== STATS MENU NAVIGATION DATA ==========
// Track event data for detail panels
const statsMenuData = {
    viewers: new Map(),      // Map of uniqueId -> { username, nickname, profilePictureUrl, lastSeen, teamMemberLevel }
    chat: [],                // Array of { username, nickname, message, timestamp, profilePictureUrl, teamMemberLevel }
    likes: [],               // Array of { username, nickname, likeCount, timestamp, profilePictureUrl, teamMemberLevel }
    coins: [],               // Array of { username, nickname, giftName, coins, timestamp, profilePictureUrl }
    followers: [],           // Array of { username, nickname, timestamp, profilePictureUrl, teamMemberLevel }
    subscribers: [],         // Array of { username, nickname, timestamp, profilePictureUrl, teamMemberLevel }
    gifts: [],               // Array of { username, nickname, giftName, giftPictureUrl, repeatCount, coins, timestamp }
    counts: {
        viewers: 0,
        chat: 0,
        likes: 0,
        coins: 0,
        followers: 0,
        subscribers: 0,
        gifts: 0
    }
};

// Current active panel
let activeStatsPanel = null;
const MAX_PANEL_ITEMS = 50; // Maximum items to keep in each panel list

document.addEventListener('error', (event) => {
    const image = event.target;
    if (!image || !image.classList || !image.classList.contains('js-stats-avatar-img')) {
        return;
    }

    const fallback = image.getAttribute('data-fallback-icon') || 'user';
    const parent = image.parentNode;
    if (!parent) {
        return;
    }

    if (fallback === 'gift') {
        parent.textContent = '🎁';
        return;
    }

    parent.innerHTML = `<i data-lucide="${fallback}"></i>`;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}, true);

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize UI first
    initializeButtons();

    // Initialize stats menu navigation
    initializeStatsMenuNavigation();

    // Initialize profile auto-restart toggle
    initializeProfileAutoRestartToggle();

    // Wait for server to be fully initialized (prevents race conditions)
    if (window.initHelper) {
        try {
            console.log('⏳ Waiting for server initialization...');
            await window.initHelper.waitForReady(10000); // 10s timeout
            console.log('✅ Server ready, loading dashboard data...');
        } catch (err) {
            console.warn('Server initialization check timed out, proceeding anyway:', err);
        }
    }

    // Load critical data BEFORE initializing socket listeners
    // This prevents race conditions where UI tries to use data that hasn't loaded yet
    try {
        await Promise.all([
            loadSettings(),
            loadFlows(),
            loadActiveProfile(),
            loadConfigPathInfo(),
            loadSessionStatus(), // Load TikTok SessionID status
            loadUsernameAliases()
        ]);
    } catch (err) {
        console.error('Failed to load initial data:', err);
    }

    // Initialize socket connection AFTER data is loaded
    socket = io();
    window.socket = socket; // Update global reference for navigation.js

    // Listen for init state updates
    if (window.initHelper && socket) {
        window.initHelper.listenForUpdates(socket);
    }

    initializeSocketListeners();
});

// ========== TABS (Legacy - now handled by navigation.js) ==========
// Tab functions removed - navigation is now handled by navigation.js
// View switching is done through NavigationManager.switchView()

// ========== BUTTONS ==========
function initializeButtons() {
    // Unlock audio on first user interaction (for browser autoplay policy)
    const unlockOnInteraction = () => {
        if (!audioUnlocked) {
            unlockAudio().catch(err => console.warn('Audio unlock on interaction failed:', err));
        }
    };

    // Add one-time listeners to common interaction elements
    document.body.addEventListener('click', unlockOnInteraction, { once: true });
    document.body.addEventListener('keydown', unlockOnInteraction, { once: true });

    // Connect Button
    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn) {
        connectBtn.addEventListener('click', connect);
    }

    // Disconnect Button
    const disconnectBtn = document.getElementById('disconnect-btn');
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnect);
    }

    // Enter-Taste im Username-Input
    const usernameInput = document.getElementById('username-input');
    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') connect();
        });
    }

    // Clear Events
    const clearEventsBtn = document.getElementById('clear-events-btn');
    if (clearEventsBtn) {
        clearEventsBtn.addEventListener('click', () => {
            const eventLog = document.getElementById('event-log');
            if (eventLog) {
                eventLog.innerHTML = '';
            }
        });
    }

    // TTS Voice Buttons (nur wenn Elemente existieren - Plugin könnte diese zur Verfügung stellen)
    const addVoiceBtn = document.getElementById('add-voice-btn');
    if (addVoiceBtn) {
        addVoiceBtn.addEventListener('click', showVoiceModal);
    }

    const modalSaveBtn = document.getElementById('modal-save-btn');
    if (modalSaveBtn) {
        modalSaveBtn.addEventListener('click', saveVoiceMapping);
    }

    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', hideVoiceModal);
    }

    // Flow Buttons
    const addFlowBtn = document.getElementById('add-flow-btn');
    if (addFlowBtn) {
        addFlowBtn.addEventListener('click', showCreateFlowModal);
    }

    const flowModalSaveBtn = document.getElementById('flow-modal-save-btn');
    if (flowModalSaveBtn) {
        flowModalSaveBtn.addEventListener('click', saveNewFlow);
    }

    const flowModalCancelBtn = document.getElementById('flow-modal-cancel-btn');
    if (flowModalCancelBtn) {
        flowModalCancelBtn.addEventListener('click', hideCreateFlowModal);
    }

    const flowModalClose = document.getElementById('flow-modal-close');
    if (flowModalClose) {
        flowModalClose.addEventListener('click', hideCreateFlowModal);
    }

    // Import flow from JSON file
    const importFlowBtn = document.getElementById('import-flow-btn');
    const importFlowFile = document.getElementById('import-flow-file');
    if (importFlowBtn && importFlowFile) {
        importFlowBtn.addEventListener('click', () => importFlowFile.click());
        importFlowFile.addEventListener('change', handleFlowImport);
    }

    const flowsGlobalEnabled = document.getElementById('flows-global-enabled');
    if (flowsGlobalEnabled) {
        flowsGlobalEnabled.addEventListener('change', () => setFlowsGlobalEnabled(flowsGlobalEnabled.checked));
    }

    // Select-all checkbox for bulk actions
    const selectAllCheckbox = document.getElementById('flows-select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            document.querySelectorAll('.flow-select-checkbox').forEach(cb => {
                cb.checked = e.target.checked;
            });
            updateBulkBar();
        });
    }

    // Flow Action Type Change (show/hide settings)
    const flowActionType = document.getElementById('flow-action-type');
    if (flowActionType) {
        flowActionType.addEventListener('change', (e) => {
            const alertSettings = document.getElementById('alert-settings');
            const webhookSettings = document.getElementById('webhook-settings');

            if (e.target.value === 'alert:show') {
                alertSettings.style.display = 'block';
                webhookSettings.style.display = 'none';
            } else if (e.target.value === 'webhook:send') {
                alertSettings.style.display = 'none';
                webhookSettings.style.display = 'block';
            }
        });
    }

    // Profile Buttons
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', showProfileModal);
    }

    const profileModalClose = document.getElementById('profile-modal-close');
    if (profileModalClose) {
        profileModalClose.addEventListener('click', hideProfileModal);
    }

    const createProfileBtn = document.getElementById('create-profile-btn');
    if (createProfileBtn) {
        createProfileBtn.addEventListener('click', createProfile);
    }

    // Enter-Taste im Profile-Input
    const newProfileUsername = document.getElementById('new-profile-username');
    if (newProfileUsername) {
        newProfileUsername.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') createProfile();
        });
    }

    // Initialize profile search and filter
    initProfileSearchFilter();

    // Config Path Management buttons
    const setCustomConfigPathBtn = document.getElementById('set-custom-config-path-btn');
    if (setCustomConfigPathBtn) {
        setCustomConfigPathBtn.addEventListener('click', setCustomConfigPath);
    }

    const resetConfigPathBtn = document.getElementById('reset-config-path-btn');
    if (resetConfigPathBtn) {
        resetConfigPathBtn.addEventListener('click', resetConfigPath);
    }

    // TTS Settings Buttons (nur wenn Elemente existieren - Plugin könnte diese zur Verfügung stellen)
    const saveTTSBtn = document.getElementById('save-tts-settings-btn');
    if (saveTTSBtn) {
        saveTTSBtn.addEventListener('click', saveTTSSettings);
    }

    const ttsTestBtn = document.getElementById('tts-test-btn');
    if (ttsTestBtn) {
        ttsTestBtn.addEventListener('click', testTTS);
    }

    const ttsProviderSelect = document.getElementById('tts-provider');
    if (ttsProviderSelect) {
        ttsProviderSelect.addEventListener('change', onTTSProviderChange);
    }

    // Settings Range Inputs (Live-Update der Labels)
    const ttsVolume = document.getElementById('tts-volume');
    if (ttsVolume) {
        ttsVolume.addEventListener('input', (e) => {
            const label = document.getElementById('tts-volume-label');
            if (label) label.textContent = e.target.value;
        });
    }

    const ttsSpeed = document.getElementById('tts-speed');
    if (ttsSpeed) {
        ttsSpeed.addEventListener('input', (e) => {
            const label = document.getElementById('tts-speed-label');
            if (label) label.textContent = e.target.value;
        });
    }

    // Auto-start toggle
    const autostartCheckbox = document.getElementById('autostart-enabled');
    if (autostartCheckbox) {
        autostartCheckbox.addEventListener('change', (e) => {
            toggleAutoStart(e.target.checked);
        });
    }

    const liveEventLogToggle = document.getElementById('show-live-event-log');
    if (liveEventLogToggle) {
        liveEventLogToggle.addEventListener('click', async () => {
            const nextEnabled = !isLiveEventLogEnabled();
            liveEventLogToggle.disabled = true;

            try {
                await saveLiveEventLogVisibility(nextEnabled);
            } catch (error) {
                console.error('Error saving Live Event Log visibility:', error);
                alert('❌ Error saving Live Event Log setting!');
                applyLiveEventLogVisibility(isLiveEventLogEnabled());
            } finally {
                liveEventLogToggle.disabled = false;
            }
        });
    }

    // TikTok/Eulerstream API Key save button
    const saveTikTokCredentialsBtn = document.getElementById('save-tiktok-credentials');
    if (saveTikTokCredentialsBtn) {
        saveTikTokCredentialsBtn.addEventListener('click', saveTikTokCredentials);
    }

    // Data Source radio buttons
    const dsRadioEuler = document.getElementById('datasource-eulerstream');
    const dsRadioTikfinity = document.getElementById('datasource-tikfinity');
    if (dsRadioEuler) {
        dsRadioEuler.addEventListener('change', handleDataSourceChange);
    }
    if (dsRadioTikfinity) {
        dsRadioTikfinity.addEventListener('change', handleDataSourceChange);
    }

    // TikFinity save settings button
    const saveTikfinityBtn = document.getElementById('save-tikfinity-settings');
    if (saveTikfinityBtn) {
        saveTikfinityBtn.addEventListener('click', saveTikFinitySettings);
    }

    // OpenAI API Configuration save button
    const saveOpenAICredentialsBtn = document.getElementById('save-openai-credentials');
    if (saveOpenAICredentialsBtn) {
        saveOpenAICredentialsBtn.addEventListener('click', saveOpenAICredentials);
    }

    // TTS API Keys save button
    const saveTTSAPIKeysBtn = document.getElementById('save-tts-api-keys');
    if (saveTTSAPIKeysBtn) {
        saveTTSAPIKeysBtn.addEventListener('click', saveTTSAPIKeys);
    }

    // TTS API Keys toggle visibility buttons
    const toggleButtons = [
        { btnId: 'toggle-tts-google-key', inputId: 'tts-google-api-key' },
        { btnId: 'toggle-tts-speechify-key', inputId: 'tts-speechify-api-key' },
        { btnId: 'toggle-tts-elevenlabs-key', inputId: 'tts-elevenlabs-api-key' },
        { btnId: 'toggle-tts-openai-key', inputId: 'tts-openai-api-key' },
        { btnId: 'toggle-tts-fishaudio-key', inputId: 'tts-fishaudio-api-key' },
        { btnId: 'toggle-tts-fishspeech-key', inputId: 'tts-fishspeech-api-key' },
        { btnId: 'toggle-tts-ollama-key', inputId: 'tts-ollama-api-key' }
    ];

    toggleButtons.forEach(({ btnId, inputId }) => {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        if (btn && input) {
            btn.addEventListener('click', () => {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
                    // Reinitialize lucide icons for this specific icon
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
            });
        }
    });

    // Preset management buttons
    const exportBtn = document.getElementById('export-preset-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportPreset);
    }

    const importBtn = document.getElementById('import-preset-btn');
    if (importBtn) {
        importBtn.addEventListener('click', importPreset);
    }

    // Resource Monitor - removed (plugin no longer exists)
    // const saveResourceMonitorBtn = document.getElementById('save-resource-monitor-settings');
    // if (saveResourceMonitorBtn) {
    //     saveResourceMonitorBtn.addEventListener('click', saveResourceMonitorSettings);
    // }

    // Resource Monitor - Interval slider live update (removed - plugin no longer exists)
    // const resourceMonitorInterval = document.getElementById('resource-monitor-interval');
    // if (resourceMonitorInterval) {
    //     resourceMonitorInterval.addEventListener('input', (e) => {
    //         const value = parseInt(e.target.value);
    //         const label = document.getElementById('resource-monitor-interval-label');
    //         if (label) {
    //             label.textContent = (value / 1000).toFixed(1) + 's';
    //         }
    //     });
    // }

    // OSC-Bridge settings checkbox handler
    const oscBridgeCheckbox = document.getElementById('osc-bridge-enabled');
    if (oscBridgeCheckbox) {
        oscBridgeCheckbox.addEventListener('change', async (e) => {
            const enabled = e.target.checked;

            try {
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ osc_bridge_enabled: enabled ? 'true' : 'false' })
                });

                const result = await response.json();
                if (result.success) {
                    console.log(`OSC-Bridge ${enabled ? 'enabled' : 'disabled'}`);
                    // Update the quick action button state if it exists
                    const quickBtn = document.getElementById('quick-osc-bridge-btn');
                    if (quickBtn) {
                        quickBtn.setAttribute('data-state', enabled ? 'on' : 'off');
                    }
                } else {
                    // Revert on error
                    oscBridgeCheckbox.checked = !enabled;
                    alert('Error saving OSC-Bridge setting');
                }
            } catch (error) {
                console.error('Error saving OSC-Bridge setting:', error);
                oscBridgeCheckbox.checked = !enabled;
            }
        });
    }

    // Event delegation for dynamically created buttons
    setupEventDelegation();

    // Wizard open button
    const openWizardBtn = document.getElementById('open-wizard-btn');
    if (openWizardBtn) {
        openWizardBtn.addEventListener('click', () => {
            if (typeof FlowWizard !== 'undefined') {
                FlowWizard.open();
            }
        });
    }

    // Wizard modal close button
    const flowWizardCloseBtn = document.getElementById('flow-wizard-close-btn');
    if (flowWizardCloseBtn) {
        flowWizardCloseBtn.addEventListener('click', () => {
            if (typeof FlowWizard !== 'undefined') {
                FlowWizard.close();
            }
        });
    }

    // Presets modal close button
    const flowPresetsCloseBtn = document.getElementById('flow-presets-close-btn');
    if (flowPresetsCloseBtn) {
        flowPresetsCloseBtn.addEventListener('click', () => {
            document.getElementById('flow-presets-modal')?.classList.remove('active');
        });
    }

    // Bulk toggle buttons
    const bulkEnableBtn = document.getElementById('bulk-enable-flows-btn');
    if (bulkEnableBtn) {
        bulkEnableBtn.addEventListener('click', () => bulkToggleFlows(true));
    }
    const bulkDisableBtn = document.getElementById('bulk-disable-flows-btn');
    if (bulkDisableBtn) {
        bulkDisableBtn.addEventListener('click', () => bulkToggleFlows(false));
    }

    // Username Alias - Add Button
    const addAliasBtnEl = document.getElementById('add-alias-btn');
    if (addAliasBtnEl) {
        addAliasBtnEl.addEventListener('click', addUsernameAlias);
    }

    // Username Alias - Enter key support
    const newAliasUsernameInput = document.getElementById('new-alias-username');
    if (newAliasUsernameInput) {
        newAliasUsernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addUsernameAlias();
        });
    }
}

// ========== EVENT DELEGATION FOR DYNAMIC BUTTONS ==========
function setupEventDelegation() {
    // Event delegation for voice mapping delete buttons and dynamically generated flow buttons
    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;

        switch (action) {
            case 'delete-voice-mapping':
                deleteVoiceMapping(target.dataset.username);
                break;
            case 'test-flow':
                testFlow(parseInt(target.dataset.flowId));
                break;
            case 'toggle-flow':
                toggleFlow(parseInt(target.dataset.flowId), target.dataset.enabled === 'true');
                break;
            case 'delete-flow':
                deleteFlow(parseInt(target.dataset.flowId));
                break;
            case 'clone-flow':
                cloneFlow(parseInt(target.dataset.flowId));
                break;
            case 'export-flow':
                exportFlow(parseInt(target.dataset.flowId));
                break;
            case 'edit-flow-wizard':
                editFlowInWizard(parseInt(target.dataset.flowId));
                break;
            case 'show-flow-presets':
                showFlowPresets();
                break;
            case 'open-wizard':
                if (typeof FlowWizard !== 'undefined') FlowWizard.open();
                break;
            case 'deploy-preset':
                deployPreset(target.dataset.presetId);
                break;
            case 'open-preset-wizard':
                openPresetInWizard(target.dataset.presetId);
                break;
            case 'alias-set-primary':
                setAliasAsPrimary(target.dataset.username);
                break;
            case 'alias-remove':
                removeUsernameAlias(target.dataset.username);
                break;
        }
    });

    // Event delegation for dynamically generated flow-select checkboxes
    document.body.addEventListener('change', (e) => {
        if (e.target.classList.contains('flow-select-checkbox')) {
            updateBulkBar();
        }
    });
}

// ========== SOCKET.IO LISTENERS ==========
function initializeSocketListeners() {
    // Connection Status
    socket.on('tiktok:status', (data) => {
        updateConnectionStatus(data.status, data);
    });

    // Stats Update
    socket.on('tiktok:stats', (stats) => {
        updateStats(stats);
    });

    // Stream Time Info (Debug)
    socket.on('tiktok:streamTimeInfo', (info) => {
        updateStreamTimeDebug(info);
    });

    // Event
    socket.on('tiktok:event', (event) => {
        addEventToLog(event.type, event.data);
    });

    // Socket Connection
    socket.on('connect', () => {
        console.log('✅ Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
    });

    // Fallback API Key Warning
    socket.on('fallback-key-warning', (data) => {
        showFallbackKeyWarning(data);
    });

    // Euler Backup Key Warning (non-dismissible, blocks connection for 10 seconds)
    socket.on('euler-backup-key-warning', (data) => {
        showEulerBackupKeyWarning(data);
    });

    // Data Source changed (from another tab or the data-source plugin UI)
    socket.on('datasource:changed', (data) => {
        updateDataSourceUI(data.newSource);
    });

    // Profile Switched Event - handled by profile-manager.js (shows restart overlay)
    socket.on('profile:switched', (data) => {
        console.log(`🔄 Profile switched from "${data.from}" to "${data.to}"`);
        // profile-manager.js handles the restart overlay and actual server restart via restartNow()
    });

    // ========== AUDIO PLAYBACK (Dashboard) ==========
    // TTS Playback im Dashboard
    socket.on('tts:play', (data) => {
        playDashboardTTS(data);
    });

    // TTS Streaming Support - collect chunks and play when complete
    socket.on('tts:stream:chunk', (data) => {
        handleStreamChunk(data);
    });

    socket.on('tts:stream:end', (data) => {
        handleStreamEnd(data);
    });

    // NOTE: Soundboard playback is handled by dashboard-soundboard.js (loaded separately)
    // to prevent double audio playback and to provide queue management and playback mode support
}

function isAnimazingPalHostSpeechSource(data = {}) {
    return String(data.source || '').toLowerCase() === ANIMAZINGPAL_HOST_TTS_SOURCE;
}

async function routeDashboardAudio(audio, data = {}) {
    if (!audio) {
        return { routed: false, reason: 'audio_element_missing' };
    }

    if (!isAnimazingPalHostSpeechSource(data)) {
        if (typeof audio.setSinkId === 'function') {
            try {
                await audio.setSinkId('');
            } catch (error) {
                console.warn('[Dashboard] Failed to reset audio sink to default:', error);
            }
        }
        audio.muted = false;
        return {
            routed: false,
            source: String(data.source || 'unknown').toLowerCase(),
            reason: 'non_host_tts'
        };
    }

    if (!window.TTSOutputRouter) {
        audio.muted = false;
        return {
            routed: false,
            source: ANIMAZINGPAL_HOST_TTS_SOURCE,
            reason: 'router_unavailable'
        };
    }

    const routing = await window.TTSOutputRouter.routeAudioElement(audio);
    console.log('[Dashboard] Host TTS output routing:', routing);
    window.TTSOutputRouter.playMonitor(audio).catch(err => console.warn('[Dashboard] Host TTS monitoring failed:', err));
    return routing;
}

// ========== TIKTOK CONNECTION ==========
async function connect(options = {}) {
    const username = document.getElementById('username-input').value.trim();
    const fallbackKeyConfirmed = options.fallbackKeyConfirmed === true;
    if (!username) {
        const msg = window.i18n ? window.i18n.t('errors.invalid_username') : 'Please enter a TikTok username!';
        alert(msg);
        return;
    }

    const connectBtn = document.getElementById('connect-btn');

    // Immediately disable connect button and show connecting state to prevent double-clicks
    if (connectBtn) {
        connectBtn.disabled = true;
        const connectingText = window.i18n ? window.i18n.t('dashboard.connecting') : 'Connecting';
        connectBtn.innerHTML = `
            <i data-lucide="loader-2" class="animate-spin"></i>
            <span>${connectingText}...</span>
        `;
        // Reinitialize lucide icons for the new loader icon
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    try {
        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, fallbackKeyConfirmed })
        });

        const result = await response.json();
        if (result.success) {
            // Check if profile was switched automatically
            if (result.profileSwitched && result.requiresRestart) {
                console.log(`🔄 Profile automatically switched to: ${result.newProfile}`);

                // Show notification about profile switch and restart
                const message = result.message || (window.i18n
                    ? window.i18n.t('profile.auto_switched', { profile: result.newProfile }) ||
                      `Profile wurde automatisch zu "${result.newProfile}" gewechselt. Die Anwendung wird neu gestartet...`
                    : `Profile automatically switched to "${result.newProfile}". Application will restart...`);

                console.log(message);

                if (window.profileManager && typeof window.profileManager.beginProfileRestart === 'function') {
                    window.profileManager.beginProfileRestart({
                        to: result.newProfile,
                        requiresRestart: true,
                        restartScheduled: result.restartScheduled === true
                    });
                } else {
                    alert(message);
                    fetch('/api/server/restart', { method: 'POST' }).catch(() => {});
                    setTimeout(() => window.location.reload(), 5000);
                }
            } else {
                console.log('✅ Connected to TikTok:', username);
                // Button state will be updated by updateConnectionStatus via socket event
            }
        } else {
            if (result.status === 'fallback_confirmation_required' && !fallbackKeyConfirmed) {
                const confirmed = await showFallbackKeyConsentDialog(result);
                if (confirmed) {
                    return connect({ fallbackKeyConfirmed: true });
                }
                restoreConnectButton();
                return;
            }

            if (result.status) {
                updateConnectionStatus(result.status, result);
            } else {
                const errorMsg = window.i18n
                    ? window.i18n.t('errors.connection_failed') + ': ' + result.error
                    : 'Connection failed: ' + result.error;
                alert(errorMsg);
                restoreConnectButton();
            }
        }
    } catch (error) {
        console.error('Connection error:', error);
        const errorMsg = window.i18n
            ? window.i18n.t('errors.network_error') + ': ' + error.message
            : 'Connection error: ' + error.message;
        alert(errorMsg);
        // Restore connect button on error
        restoreConnectButton();
    }
}

/**
 * Restore connect button to its original state after a failed connection attempt
 */
function restoreConnectButton() {
    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn) {
        connectBtn.disabled = false;
        const connectText = window.i18n ? window.i18n.t('dashboard.connect') : 'Connect';
        connectBtn.innerHTML = `
            <i data-lucide="link"></i>
            <span>${connectText}</span>
        `;
        // Reinitialize lucide icons for the restored icon
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

async function disconnect() {
    try {
        const response = await fetch('/api/disconnect', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            console.log('✅ Disconnected');
        }
    } catch (error) {
        console.error('Disconnect error:', error);
    }
}

function updateConnectionStatus(status, data = {}) {
    const infoEl = document.getElementById('connection-info');
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');

    // Check if elements exist
    if (!infoEl || !connectBtn || !disconnectBtn) {
        console.warn('Connection status elements not found');
        return;
    }

    // Update status badge via NavigationManager
    if (window.NavigationManager) {
        window.NavigationManager.updateConnectionStatus(status, data);
    }

    switch (status) {
        case 'connecting':
            infoEl.innerHTML = '<div class="text-blue-300 text-sm">Verbindung wird aufgebaut...</div>';
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            break;

        case 'validating':
            infoEl.innerHTML = '<div class="text-blue-300 text-sm">Verbindung offen – LIVE-Status wird bestätigt...</div>';
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            break;

        case 'live_identity_pending':
            infoEl.innerHTML = '<div class="text-yellow-300 text-sm">LIVE bestätigt – Stream-ID wird ermittelt...</div>';
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            break;

        case 'connected':
            const connectedMsg = window.i18n
                ? window.i18n.t('dashboard.connected') + ' @' + data.username
                : 'Connected to @' + data.username;
            infoEl.innerHTML = `<div class="text-green-400 text-sm">${connectedMsg}</div>`;
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            break;

        case 'disconnected':
            infoEl.textContent = '';
            // Restore connect button to original state
            restoreConnectButton();
            disconnectBtn.disabled = true;

            // Reset runtime display
            const runtimeEl = document.getElementById('stat-runtime');
            if (runtimeEl) {
                runtimeEl.textContent = '--:--:--';
            }

            // Hide debug panel
            const debugPanel = document.getElementById('stream-time-debug');
            if (debugPanel) {
                debugPanel.style.display = 'none';
            }
            break;

        case 'offline':
            infoEl.innerHTML = `
                <div class="p-3 bg-gray-800 border border-gray-600 rounded">
                    <div class="font-semibold text-gray-200">Stream ist derzeit offline</div>
                    <div class="text-sm text-gray-400 mt-1">Es werden keine automatischen Eulerstream-Anfragen gesendet.</div>
                </div>
            `;
            restoreConnectButton();
            disconnectBtn.disabled = true;
            break;

        case 'validation_failed':
        case 'identity_error':
        case 'configuration_error':
        case 'auth_error':
        case 'connection_error':
        case 'fallback_keys_exhausted':
            infoEl.innerHTML = `
                <div class="p-3 bg-red-900 bg-opacity-50 border border-red-600 rounded">
                    <div class="font-semibold text-red-300">Verbindung gestoppt</div>
                    <div class="text-sm text-red-200 mt-1">${data.error || data.message || 'Der LIVE-Stream konnte nicht bestätigt werden.'}</div>
                </div>
            `;
            restoreConnectButton();
            disconnectBtn.disabled = true;
            break;

        case 'circuit_open': {
            const retryAllowedAt = data.retryAllowedAt ? new Date(data.retryAllowedAt) : null;
            const waitMs = retryAllowedAt ? Math.max(0, retryAllowedAt.getTime() - Date.now()) : 0;
            const waitText = retryAllowedAt && waitMs > 0
                ? `Manueller Versuch möglich ab ${retryAllowedAt.toLocaleTimeString()}.`
                : 'Automatische Versuche wurden gestoppt. Manuelles Prüfen ist möglich.';
            infoEl.innerHTML = `
                <div class="p-3 bg-yellow-900 bg-opacity-50 border border-yellow-600 rounded">
                    <div class="font-semibold text-yellow-300">Reconnect-Schutz aktiv</div>
                    <div class="text-sm text-yellow-200 mt-1">${data.message || 'Weitere automatische Anfragen wurden gestoppt.'}</div>
                    <div class="text-xs text-yellow-400 mt-2">${waitText}</div>
                </div>
            `;
            if (waitMs > 0) {
                connectBtn.disabled = true;
                setTimeout(() => restoreConnectButton(), waitMs);
            } else {
                restoreConnectButton();
            }
            disconnectBtn.disabled = true;
            break;
        }

        case 'retrying':
            infoEl.innerHTML = `
                <div class="p-3 bg-yellow-900 bg-opacity-50 border border-yellow-600 rounded">
                    <div class="font-semibold text-yellow-300">Verbindung wird wiederholt...</div>
                    <div class="text-sm text-yellow-200 mt-1">${data.error}</div>
                    <div class="text-xs text-yellow-400 mt-2">
                        ⏳ Nächster Versuch in ${(data.delay / 1000).toFixed(0)} Sekunden (Versuch ${data.attempt}/${data.maxRetries})
                    </div>
                </div>
            `;
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            break;

        case 'error':
            // Detaillierte Fehleranzeige mit Type und Suggestion
            let errorHtml = `
                <div class="p-3 bg-red-900 bg-opacity-50 border border-red-600 rounded">
                    <div class="font-semibold text-red-300">${data.type || 'Verbindungsfehler'}</div>
                    <div class="text-sm text-red-200 mt-1">${data.error}</div>
            `;

            if (data.suggestion) {
                errorHtml += `
                    <div class="mt-3 p-2 bg-gray-800 rounded text-xs text-gray-300">
                        <div class="font-semibold text-blue-400 mb-1">💡 Lösungsvorschlag:</div>
                        ${data.suggestion}
                    </div>
                `;
            }

            if (data.retryable === false) {
                errorHtml += `
                    <div class="mt-2 text-xs text-red-400">
                        ⚠️ Dieser Fehler kann nicht automatisch behoben werden.
                    </div>
                `;
            }

            errorHtml += `</div>`;

            infoEl.innerHTML = errorHtml;
            // Restore connect button to original state
            restoreConnectButton();
            disconnectBtn.disabled = true;
            break;

        case 'stream_ended':
            infoEl.innerHTML = '<div class="text-gray-400 text-sm">The stream has ended</div>';
            // Restore connect button to original state
            restoreConnectButton();
            disconnectBtn.disabled = true;
            break;
    }
}

// ========== STATS ==========
function updateStats(stats) {
    const viewersEl = document.getElementById('stat-viewers');
    const likesEl = document.getElementById('stat-likes');
    const coinsEl = document.getElementById('stat-coins');
    const followersEl = document.getElementById('stat-followers');
    const runtimeEl = document.getElementById('stat-runtime');

    if (viewersEl) viewersEl.textContent = stats.viewers.toLocaleString();
    if (likesEl) likesEl.textContent = stats.likes.toLocaleString();
    if (coinsEl) coinsEl.textContent = stats.totalCoins.toLocaleString();
    if (followersEl) followersEl.textContent = stats.followers.toLocaleString();

    // Update stream runtime
    let formattedRuntime = '--:--:--';
    if (stats.streamDuration !== undefined) {
        const duration = stats.streamDuration;
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = duration % 60;

        formattedRuntime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    if (runtimeEl) {
        runtimeEl.textContent = formattedRuntime;
    }

    // Update gifts counter if available
    const giftsElement = document.getElementById('stat-gifts');
    if (giftsElement) {
        // Use stats.gifts if available, otherwise fallback to counting gifts from events
        giftsElement.textContent = (stats.gifts || 0).toLocaleString();
    }

    // ========== Update Event Log Compact Stats Bar ==========
    const eventStatsRuntime = document.getElementById('event-stats-runtime');
    const eventStatsViewers = document.getElementById('event-stats-viewers');
    const eventStatsLikes = document.getElementById('event-stats-likes');
    const eventStatsCoins = document.getElementById('event-stats-coins');
    const eventStatsFollowers = document.getElementById('event-stats-followers');
    const eventStatsGifts = document.getElementById('event-stats-gifts');

    if (eventStatsRuntime) eventStatsRuntime.textContent = formattedRuntime;
    if (eventStatsViewers) eventStatsViewers.textContent = stats.viewers.toLocaleString();
    if (eventStatsLikes) eventStatsLikes.textContent = stats.likes.toLocaleString();
    if (eventStatsCoins) eventStatsCoins.textContent = stats.totalCoins.toLocaleString();
    if (eventStatsFollowers) eventStatsFollowers.textContent = stats.followers.toLocaleString();
    if (eventStatsGifts) eventStatsGifts.textContent = (stats.gifts || 0).toLocaleString();

    // Update viewer count in stats menu data
    statsMenuData.counts.viewers = stats.viewers || 0;
    statsMenuData.counts.likes = stats.likes || 0;
    statsMenuData.counts.coins = stats.totalCoins || 0;

    // Update panel viewer count if panel is open
    const panelViewersCount = document.getElementById('panel-viewers-count');
    if (panelViewersCount) {
        panelViewersCount.textContent = (stats.viewers || 0).toLocaleString();
    }

    // ========== Store stats globally for plugins ==========
    window.ltthLiveStats = {
        runtime: formattedRuntime,
        streamDuration: stats.streamDuration || 0,
        viewers: stats.viewers || 0,
        likes: stats.likes || 0,
        coins: stats.totalCoins || 0,
        followers: stats.followers || 0,
        gifts: stats.gifts || 0,
        shares: stats.shares || 0,
        lastUpdated: Date.now()
    };
}

// ========== STREAM TIME DEBUG ==========
function updateStreamTimeDebug(info) {
    const debugPanel = document.getElementById('stream-time-debug');
    const startEl = document.getElementById('debug-stream-start');
    const durationEl = document.getElementById('debug-stream-duration');
    const methodEl = document.getElementById('debug-detection-method');

    if (debugPanel && startEl && durationEl && methodEl) {
        // Show the debug panel
        debugPanel.style.display = 'block';

        // Update values
        startEl.textContent = info.streamStartISO || '--';

        const hours = Math.floor(info.currentDuration / 3600);
        const minutes = Math.floor((info.currentDuration % 3600) / 60);
        const seconds = info.currentDuration % 60;
        durationEl.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        methodEl.textContent = info.detectionMethod || '--';

        // Color code based on detection method
        if (info.detectionMethod && info.detectionMethod.includes('roomInfo')) {
            methodEl.style.color = '#10b981'; // Green - good
        } else if (info.detectionMethod && info.detectionMethod.includes('Event')) {
            methodEl.style.color = '#f59e0b'; // Orange - acceptable
        } else {
            methodEl.style.color = '#ef4444'; // Red - fallback
        }
    }
}

// ========== EVENT LOG ==========
function addEventToLog(type, data) {
    const logTable = document.getElementById('event-log');
    const row = document.createElement('tr');
    row.className = 'event-row border-b border-gray-700';

    const time = new Date().toLocaleTimeString();
    const username = data.username || data.uniqueId || data.nickname || 'Viewer';

    // Build team level badge - always show
    let teamLevelBadge = '';
    const teamLevel = data.teamMemberLevel || 0;

    // Define colors for different team levels:
    // White for level 0
    // Green-yellow for levels 1-10
    // Blue for levels 11-20
    // Violet for levels 21+
    let badgeColor = '';
    let badgeIcon = '❤️';
    let textColor = 'text-white';

    if (teamLevel === 0) {
        badgeColor = 'bg-gray-500';
        badgeIcon = '🤍'; // White heart for level 0
        textColor = 'text-white';
    } else if (teamLevel >= 21) {
        badgeColor = 'bg-violet-600';
        badgeIcon = '💜'; // Violet heart for level 21+
        textColor = 'text-white';
    } else if (teamLevel >= 11) {
        badgeColor = 'bg-blue-500';
        badgeIcon = '💙'; // Blue heart for levels 11-20
        textColor = 'text-white';
    } else {
        // Levels 1-10: green-yellow gradient
        badgeColor = 'bg-gradient-to-r from-green-500 to-yellow-500';
        badgeIcon = '💚'; // Green heart for levels 1-10
        textColor = 'text-white';
    }

    teamLevelBadge = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${badgeColor} ${textColor} ml-1" title="Team Level ${teamLevel}">${badgeIcon}${teamLevel}</span>`;

    let details = '';
    let typeIcon = '';

    switch (type) {
        case 'chat':
            typeIcon = '💬 Chat';
            details = data.message;
            break;
        case 'gift':
            typeIcon = '🎁 Gift';
            const giftName = data.giftName || (data.giftId ? `Gift #${data.giftId}` : 'Unknown Gift');
            details = `${giftName} x${data.repeatCount} (${data.coins} coins)`;
            break;
        case 'follow':
            typeIcon = '⭐ Follow';
            details = 'New follower!';
            break;
        case 'share':
            typeIcon = '🔄 Share';
            details = 'Shared the stream';
            break;
        case 'like':
            typeIcon = '❤️ Like';
            details = `+${data.likeCount || 1} (Total: ${data.totalLikes || 0})`;
            break;
        case 'subscribe':
            typeIcon = '🌟 Subscribe';
            details = 'New subscriber!';
            break;
        default:
            typeIcon = '📌 ' + type;
            details = JSON.stringify(data);
    }

    row.innerHTML = `
        <td class="py-2 pr-4 text-gray-400">${time}</td>
        <td class="py-2 pr-4">${typeIcon}</td>
        <td class="py-2 pr-4 font-semibold">${username}${teamLevelBadge}</td>
        <td class="py-2">${details}</td>
    `;

    // Am Anfang einfügen (neueste oben)
    logTable.insertBefore(row, logTable.firstChild);

    // Maximal 100 Einträge behalten
    while (logTable.children.length > 100) {
        logTable.removeChild(logTable.lastChild);
    }

    // ========== Update Stats Menu Data ==========
    trackEventForStatsMenu(type, data);
}

// ========== STATS MENU NAVIGATION ==========

/**
 * Initialize stats menu navigation
 */
function initializeStatsMenuNavigation() {
    const clickableItems = document.querySelectorAll('.stats-bar-clickable');
    const closeButtons = document.querySelectorAll('.stats-panel-close');

    // Add click handlers for menu items
    clickableItems.forEach(item => {
        item.addEventListener('click', () => {
            const panelName = item.dataset.panel;
            toggleStatsPanel(panelName);
        });

        // Keyboard accessibility
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const panelName = item.dataset.panel;
                toggleStatsPanel(panelName);
            }
        });
    });

    // Add close button handlers
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            closeStatsPanel();
        });
    });
}

/**
 * Toggle a stats panel
 */
function toggleStatsPanel(panelName) {
    const container = document.getElementById('stats-detail-container');
    const panel = document.getElementById(`stats-panel-${panelName}`);
    const menuItems = document.querySelectorAll('.stats-bar-clickable');

    if (!container || !panel) return;

    // If clicking the same panel, close it
    if (activeStatsPanel === panelName) {
        closeStatsPanel();
        return;
    }

    // Hide all panels
    document.querySelectorAll('.stats-detail-panel').forEach(p => {
        p.style.display = 'none';
    });

    // Remove active class from all menu items
    menuItems.forEach(item => {
        item.classList.remove('active');
        item.setAttribute('aria-pressed', 'false');
    });

    // Show the selected panel and container
    container.style.display = 'block';
    panel.style.display = 'block';

    // Add active class to the clicked menu item
    const activeMenuItem = document.querySelector(`.stats-bar-clickable[data-panel="${panelName}"]`);
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
        activeMenuItem.setAttribute('aria-pressed', 'true');
    }

    activeStatsPanel = panelName;

    // Refresh the panel content
    refreshStatsPanelContent(panelName);

    // Re-initialize lucide icons for new content
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * Close the active stats panel
 */
function closeStatsPanel() {
    const container = document.getElementById('stats-detail-container');
    const menuItems = document.querySelectorAll('.stats-bar-clickable');

    if (container) {
        container.style.display = 'none';
    }

    // Hide all panels
    document.querySelectorAll('.stats-detail-panel').forEach(p => {
        p.style.display = 'none';
    });

    // Remove active class from all menu items
    menuItems.forEach(item => {
        item.classList.remove('active');
        item.setAttribute('aria-pressed', 'false');
    });

    activeStatsPanel = null;
}

/**
 * Track event data for stats menu panels
 */
function trackEventForStatsMenu(type, data) {
    const timestamp = new Date().toLocaleTimeString();
    const username = data.username || data.uniqueId || data.nickname || 'Unknown';
    const nickname = data.nickname || data.username || 'Unknown';
    const profilePictureUrl = data.profilePictureUrl || '';
    const teamMemberLevel = data.teamMemberLevel || 0;

    switch (type) {
        case 'chat':
            statsMenuData.chat.unshift({
                username,
                nickname,
                message: data.message || '',
                timestamp,
                profilePictureUrl,
                teamMemberLevel
            });
            statsMenuData.counts.chat++;
            // Keep only the last MAX_PANEL_ITEMS
            if (statsMenuData.chat.length > MAX_PANEL_ITEMS) {
                statsMenuData.chat.pop();
            }
            updateStatsPanelCount('chat');
            break;

        case 'like':
            statsMenuData.likes.unshift({
                username,
                nickname,
                likeCount: data.likeCount || 1,
                totalLikes: data.totalLikes || 0,
                timestamp,
                profilePictureUrl,
                teamMemberLevel
            });
            // Keep only the last MAX_PANEL_ITEMS
            if (statsMenuData.likes.length > MAX_PANEL_ITEMS) {
                statsMenuData.likes.pop();
            }
            break;

        case 'gift':
            statsMenuData.gifts.unshift({
                username,
                nickname,
                giftName: data.giftName || 'Gift',
                giftPictureUrl: data.giftPictureUrl || '',
                repeatCount: data.repeatCount || 1,
                coins: data.coins || 0,
                diamondCount: data.diamondCount || 0,
                timestamp,
                profilePictureUrl
            });
            statsMenuData.counts.gifts++;
            // Also track coins from gifts
            statsMenuData.coins.unshift({
                username,
                nickname,
                giftName: data.giftName || 'Gift',
                coins: data.coins || 0,
                timestamp,
                profilePictureUrl
            });
            // Keep only the last MAX_PANEL_ITEMS
            if (statsMenuData.gifts.length > MAX_PANEL_ITEMS) {
                statsMenuData.gifts.pop();
            }
            if (statsMenuData.coins.length > MAX_PANEL_ITEMS) {
                statsMenuData.coins.pop();
            }
            updateStatsPanelCount('gifts');
            break;

        case 'follow':
            statsMenuData.followers.unshift({
                username,
                nickname,
                timestamp,
                profilePictureUrl,
                teamMemberLevel
            });
            statsMenuData.counts.followers++;
            // Keep only the last MAX_PANEL_ITEMS
            if (statsMenuData.followers.length > MAX_PANEL_ITEMS) {
                statsMenuData.followers.pop();
            }
            updateStatsPanelCount('followers');
            break;

        case 'subscribe':
            statsMenuData.subscribers.unshift({
                username,
                nickname,
                timestamp,
                profilePictureUrl,
                teamMemberLevel
            });
            statsMenuData.counts.subscribers++;
            // Keep only the last MAX_PANEL_ITEMS
            if (statsMenuData.subscribers.length > MAX_PANEL_ITEMS) {
                statsMenuData.subscribers.pop();
            }
            updateStatsPanelCount('subscribers');
            break;
    }

    // Track viewer activity (anyone who interacts is a viewer)
    if (username && username !== 'Unknown') {
        statsMenuData.viewers.set(username, {
            username,
            nickname,
            profilePictureUrl,
            lastSeen: timestamp,
            teamMemberLevel,
            lastActivity: type
        });
    }

    // Refresh panel if it's currently open
    if (activeStatsPanel) {
        refreshStatsPanelContent(activeStatsPanel);
    }
}

/**
 * Update stats panel count display
 */
function updateStatsPanelCount(panelName) {
    const countEl = document.getElementById(`panel-${panelName}-count`);
    if (countEl) {
        countEl.textContent = statsMenuData.counts[panelName].toLocaleString();
    }

    // Also update the stats bar value
    const statsEl = document.getElementById(`event-stats-${panelName}`);
    if (statsEl) {
        statsEl.textContent = statsMenuData.counts[panelName].toLocaleString();
    }
}

/**
 * Refresh stats panel content based on current data
 */
function refreshStatsPanelContent(panelName) {
    const listEl = document.getElementById(`${panelName}-list`);
    if (!listEl) return;

    let html = '';

    switch (panelName) {
        case 'viewers':
            const viewerCount = statsMenuData.viewers.size;
            const countEl = document.getElementById('panel-viewers-count');
            if (countEl) countEl.textContent = viewerCount.toLocaleString();

            if (viewerCount === 0) {
                html = '<p class="stats-panel-empty">No viewers tracked yet</p>';
            } else {
                const viewers = Array.from(statsMenuData.viewers.values())
                    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));

                html = viewers.map(v => `
                    <div class="stats-panel-item">
                        <div class="stats-panel-item-avatar">
                            ${v.profilePictureUrl ?
                                `<img class="js-stats-avatar-img" data-fallback-icon="user" src="${escapeHtml(v.profilePictureUrl)}" alt="${escapeHtml(v.nickname)}">` :
                                '<i data-lucide="user"></i>'
                            }
                        </div>
                        <div class="stats-panel-item-info">
                            <div class="stats-panel-item-name">${escapeHtml(v.nickname || v.username)}</div>
                            <div class="stats-panel-item-detail">@${escapeHtml(v.username)} • ${getActivityIcon(v.lastActivity)}</div>
                        </div>
                        <div class="stats-panel-item-time">${v.lastSeen}</div>
                    </div>
                `).join('');
            }
            break;

        case 'chat':
            const chatCountEl = document.getElementById('panel-chat-count');
            if (chatCountEl) chatCountEl.textContent = statsMenuData.counts.chat.toLocaleString();

            if (statsMenuData.chat.length === 0) {
                html = '<p class="stats-panel-empty">No chat messages yet</p>';
            } else {
                html = statsMenuData.chat.map(c => `
                    <div class="stats-panel-item chat-item">
                        <div class="stats-panel-item-avatar">
                            ${c.profilePictureUrl ?
                                `<img class="js-stats-avatar-img" data-fallback-icon="user" src="${escapeHtml(c.profilePictureUrl)}" alt="${escapeHtml(c.nickname)}">` :
                                '<i data-lucide="user"></i>'
                            }
                        </div>
                        <div class="stats-panel-item-info">
                            <div class="stats-panel-item-name">${escapeHtml(c.nickname || c.username)}</div>
                            <div class="stats-panel-item-detail">${escapeHtml(c.message)}</div>
                        </div>
                        <div class="stats-panel-item-time">${c.timestamp}</div>
                    </div>
                `).join('');
            }
            break;

        case 'likes':
            const likesCountEl = document.getElementById('panel-likes-count');
            // Use total likes from last event if available
            const totalLikes = statsMenuData.likes.length > 0 ?
                (statsMenuData.likes[0].totalLikes || statsMenuData.likes.reduce((sum, l) => sum + l.likeCount, 0)) : 0;
            if (likesCountEl) likesCountEl.textContent = totalLikes.toLocaleString();

            if (statsMenuData.likes.length === 0) {
                html = '<p class="stats-panel-empty">No likes yet</p>';
            } else {
                html = statsMenuData.likes.map(l => `
                    <div class="stats-panel-item">
                        <div class="stats-panel-item-avatar">
                            ${l.profilePictureUrl ?
                                `<img class="js-stats-avatar-img" data-fallback-icon="user" src="${escapeHtml(l.profilePictureUrl)}" alt="${escapeHtml(l.nickname)}">` :
                                '<i data-lucide="user"></i>'
                            }
                        </div>
                        <div class="stats-panel-item-info">
                            <div class="stats-panel-item-name">${escapeHtml(l.nickname || l.username)}</div>
                            <div class="stats-panel-item-detail">❤️ +${l.likeCount}</div>
                        </div>
                        <div class="stats-panel-item-time">${l.timestamp}</div>
                    </div>
                `).join('');
            }
            break;

        case 'coins':
            const coinsCountEl = document.getElementById('panel-coins-count');
            const totalCoins = statsMenuData.coins.reduce((sum, c) => sum + c.coins, 0);
            if (coinsCountEl) coinsCountEl.textContent = totalCoins.toLocaleString();

            if (statsMenuData.coins.length === 0) {
                html = '<p class="stats-panel-empty">No coin gifts yet</p>';
            } else {
                html = statsMenuData.coins.map(c => `
                    <div class="stats-panel-item">
                        <div class="stats-panel-item-avatar">
                            ${c.profilePictureUrl ?
                                `<img class="js-stats-avatar-img" data-fallback-icon="user" src="${escapeHtml(c.profilePictureUrl)}" alt="${escapeHtml(c.nickname)}">` :
                                '<i data-lucide="user"></i>'
                            }
                        </div>
                        <div class="stats-panel-item-info">
                            <div class="stats-panel-item-name">${escapeHtml(c.nickname || c.username)}</div>
                            <div class="stats-panel-item-detail">${escapeHtml(c.giftName)}</div>
                        </div>
                        <div class="stats-panel-item-value">🪙 ${c.coins.toLocaleString()}</div>
                        <div class="stats-panel-item-time">${c.timestamp}</div>
                    </div>
                `).join('');
            }
            break;

        case 'followers':
            const followersCountEl = document.getElementById('panel-followers-count');
            if (followersCountEl) followersCountEl.textContent = statsMenuData.counts.followers.toLocaleString();

            if (statsMenuData.followers.length === 0) {
                html = '<p class="stats-panel-empty">No followers yet</p>';
            } else {
                html = statsMenuData.followers.map(f => `
                    <div class="stats-panel-item">
                        <div class="stats-panel-item-avatar">
                            ${f.profilePictureUrl ?
                                `<img class="js-stats-avatar-img" data-fallback-icon="user" src="${escapeHtml(f.profilePictureUrl)}" alt="${escapeHtml(f.nickname)}">` :
                                '<i data-lucide="user"></i>'
                            }
                        </div>
                        <div class="stats-panel-item-info">
                            <div class="stats-panel-item-name">${escapeHtml(f.nickname || f.username)}</div>
                            <div class="stats-panel-item-detail">⭐ New follower!</div>
                        </div>
                        <div class="stats-panel-item-time">${f.timestamp}</div>
                    </div>
                `).join('');
            }
            break;

        case 'subscribers':
            const subscribersCountEl = document.getElementById('panel-subscribers-count');
            if (subscribersCountEl) subscribersCountEl.textContent = statsMenuData.counts.subscribers.toLocaleString();

            if (statsMenuData.subscribers.length === 0) {
                html = '<p class="stats-panel-empty">No subscribers yet</p>';
            } else {
                html = statsMenuData.subscribers.map(s => `
                    <div class="stats-panel-item subscriber-item">
                        <div class="stats-panel-item-avatar">
                            ${s.profilePictureUrl ?
                                `<img class="js-stats-avatar-img" data-fallback-icon="crown" src="${escapeHtml(s.profilePictureUrl)}" alt="${escapeHtml(s.nickname)}">` :
                                '<i data-lucide="crown"></i>'
                            }
                        </div>
                        <div class="stats-panel-item-info">
                            <div class="stats-panel-item-name">${escapeHtml(s.nickname || s.username)}</div>
                            <div class="stats-panel-item-detail">👑 Subscriber / Superfan</div>
                        </div>
                        <div class="stats-panel-item-time">${s.timestamp}</div>
                    </div>
                `).join('');
            }
            break;

        case 'gifts':
            const giftsCountEl = document.getElementById('panel-gifts-count');
            if (giftsCountEl) giftsCountEl.textContent = statsMenuData.counts.gifts.toLocaleString();

            if (statsMenuData.gifts.length === 0) {
                html = '<p class="stats-panel-empty">No gifts yet</p>';
            } else {
                html = statsMenuData.gifts.map(g => `
                    <div class="stats-panel-item gift-item">
                        <div class="stats-panel-item-avatar">
                            ${g.giftPictureUrl ?
                                `<img class="js-stats-avatar-img" data-fallback-icon="gift" src="${escapeHtml(g.giftPictureUrl)}" alt="${escapeHtml(g.giftName)}">` :
                                '🎁'
                            }
                        </div>
                        <div class="stats-panel-item-info">
                            <div class="stats-panel-item-name">${escapeHtml(g.nickname || g.username)}</div>
                            <div class="stats-panel-item-detail">${escapeHtml(g.giftName)} x${g.repeatCount}</div>
                        </div>
                        <div class="stats-panel-item-value">🪙 ${g.coins.toLocaleString()}</div>
                        <div class="stats-panel-item-time">${g.timestamp}</div>
                    </div>
                `).join('');
            }
            break;
    }

    listEl.innerHTML = html;

    // Re-initialize lucide icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * Get activity icon for viewer
 */
function getActivityIcon(activity) {
    switch (activity) {
        case 'chat': return '💬 Chat';
        case 'like': return '❤️ Like';
        case 'gift': return '🎁 Gift';
        case 'follow': return '⭐ Follow';
        case 'subscribe': return '👑 Sub';
        case 'share': return '🔄 Share';
        default: return '👀 Watching';
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function isLiveEventLogEnabled() {
    if (Object.prototype.hasOwnProperty.call(settings, LIVE_EVENT_LOG_SETTING_KEY)) {
        return settings[LIVE_EVENT_LOG_SETTING_KEY] === 'true';
    }

    try {
        return localStorage.getItem(LIVE_EVENT_LOG_STORAGE_KEY) === 'true';
    } catch (error) {
        return false;
    }
}

function updateLiveEventLogToggleButton(enabled) {
    const button = document.getElementById('show-live-event-log');
    if (!button) {
        return;
    }

    const label = document.getElementById('show-live-event-log-label');
    if (label) {
        label.textContent = enabled ? 'Disable Live Event Log' : 'Enable Live Event Log';
    }

    button.dataset.state = enabled ? 'enabled' : 'disabled';
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');

    const icon = button.querySelector('i');
    if (icon) {
        icon.setAttribute('data-lucide', enabled ? 'eye-off' : 'eye');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

function applyLiveEventLogVisibility(enabled) {
    const visible = Boolean(enabled);
    document.documentElement.dataset.liveEventLog = visible ? 'enabled' : 'disabled';

    try {
        localStorage.setItem(LIVE_EVENT_LOG_STORAGE_KEY, visible ? 'true' : 'false');
    } catch (error) {}

    updateLiveEventLogToggleButton(visible);

    if (!visible) {
        const activeEventsView = document.querySelector('.content-view.active#view-events');
        if (activeEventsView && window.NavigationManager && typeof window.NavigationManager.switchView === 'function') {
            window.NavigationManager.switchView('dashboard');
        }
    }
}

async function saveLiveEventLogVisibility(enabled) {
    const nextValue = enabled ? 'true' : 'false';

    const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [LIVE_EVENT_LOG_SETTING_KEY]: nextValue })
    });

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to save Live Event Log setting');
    }

    settings[LIVE_EVENT_LOG_SETTING_KEY] = nextValue;
    applyLiveEventLogVisibility(enabled);
}

// ========== SETTINGS ==========
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        settings = await response.json();

        // Settings in UI laden (falls Elemente existieren)
        // TTS-Settings werden nun vom tts_core_v2 Plugin verwaltet
        updateFlowsGlobalToggle();
        applyLiveEventLogVisibility(settings[LIVE_EVENT_LOG_SETTING_KEY] === 'true');

        // Load TikTok/Eulerstream API Key with masking
        const tiktokApiKeyInput = document.getElementById('tiktok-euler-api-key');
        if (tiktokApiKeyInput) {
            if (settings.tiktok_euler_api_key) {
                tiktokApiKeyInput.value = '***REDACTED***';
                tiktokApiKeyInput.placeholder = 'API key configured (hidden)';
            } else {
                tiktokApiKeyInput.value = '';
                tiktokApiKeyInput.placeholder = 'Enter your Eulerstream API key...';
            }
        }

        // Load OpenAI API Configuration with masking
        const openaiApiKeyInput = document.getElementById('openai-api-key');
        const openaiKeyStatusEl = document.getElementById('openai-key-status');
        const openaiKeyHintEl = document.getElementById('openai-key-hint');

        if (openaiApiKeyInput) {
            if (settings.openai_api_key) {
                openaiApiKeyInput.value = '***REDACTED***';
                openaiApiKeyInput.placeholder = 'API key configured (hidden)';

                // Update status message
                if (openaiKeyStatusEl) {
                    openaiKeyStatusEl.textContent = '✅ OpenAI API-Schlüssel ist gespeichert';
                }
                if (openaiKeyHintEl) {
                    openaiKeyHintEl.textContent = 'API-Schlüssel ist gespeichert. Zum Ändern neuen Schlüssel eingeben.';
                    openaiKeyHintEl.className = 'text-xs text-green-400 mt-1';
                }
            } else {
                openaiApiKeyInput.value = '';
                openaiApiKeyInput.placeholder = 'sk-...';

                // Update status message
                if (openaiKeyStatusEl) {
                    openaiKeyStatusEl.textContent = 'ℹ️ Noch kein API-Schlüssel gespeichert';
                }
                if (openaiKeyHintEl) {
                    openaiKeyHintEl.textContent = 'API-Schlüssel eingeben und speichern...';
                    openaiKeyHintEl.className = 'text-xs text-gray-500 mt-1';
                }
            }
        }

        const openaiModelSelect = document.getElementById('openai-model');
        if (openaiModelSelect && settings.openai_model) {
            openaiModelSelect.value = settings.openai_model;
        }

        // Load TTS API Keys
        const ttsGoogleKeyInput = document.getElementById('tts-google-api-key');
        if (ttsGoogleKeyInput && settings.tts_google_api_key) {
            // Show masked value if key exists
            ttsGoogleKeyInput.value = '***REDACTED***';
            ttsGoogleKeyInput.placeholder = 'API key configured (hidden)';
        }

        const ttsSpeechifyKeyInput = document.getElementById('tts-speechify-api-key');
        if (ttsSpeechifyKeyInput && settings.tts_speechify_api_key) {
            ttsSpeechifyKeyInput.value = '***REDACTED***';
            ttsSpeechifyKeyInput.placeholder = 'API key configured (hidden)';
        }

        const ttsElevenlabsKeyInput = document.getElementById('tts-elevenlabs-api-key');
        if (ttsElevenlabsKeyInput && settings.tts_elevenlabs_api_key) {
            ttsElevenlabsKeyInput.value = '***REDACTED***';
            ttsElevenlabsKeyInput.placeholder = 'API key configured (hidden)';
        }

        const ttsOpenaiKeyInput = document.getElementById('tts-openai-api-key');
        if (ttsOpenaiKeyInput && settings.tts_openai_api_key) {
            ttsOpenaiKeyInput.value = '***REDACTED***';
            ttsOpenaiKeyInput.placeholder = 'API key configured (hidden)';
        }

        const ttsFishaudioKeyInput = document.getElementById('tts-fishaudio-api-key');
        if (ttsFishaudioKeyInput && (settings.tts_fishaudio_api_key || settings.fishaudio_api_key)) {
            ttsFishaudioKeyInput.value = '***REDACTED***';
            ttsFishaudioKeyInput.placeholder = 'API key configured (hidden)';
        }

        const ttsFishspeechKeyInput = document.getElementById('tts-fishspeech-api-key');
        // Check centralized key first, then legacy key for backwards compatibility
        if (ttsFishspeechKeyInput && (settings.siliconflow_api_key || settings.tts_fishspeech_api_key)) {
            ttsFishspeechKeyInput.value = '***REDACTED***';
            ttsFishspeechKeyInput.placeholder = 'API key configured (hidden)';
        }

        const ttsOllamaKeyInput = document.getElementById('tts-ollama-api-key');
        if (ttsOllamaKeyInput && settings.tts_ollama_api_key) {
            ttsOllamaKeyInput.value = '***REDACTED***';
            ttsOllamaKeyInput.placeholder = 'API key configured (hidden)';
        }

        // Load username aliases for active profile
        await loadUsernameAliases();

        // Load data source status (eulerstream vs tikfinity)
        await loadDataSourceStatus();

    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveSettings() {
    const newSettings = {
        // TTS-Settings werden nun vom tts_core_v2 Plugin verwaltet
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ Settings saved!');
            settings = newSettings;
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('❌ Error saving settings!');
    }
}

// Save TikTok/Eulerstream API credentials
async function saveTikTokCredentials() {
    const apiKeyInput = document.getElementById('tiktok-euler-api-key');
    if (!apiKeyInput) return;

    const apiKey = apiKeyInput.value.trim();

    // Check if user is trying to save without changing the masked key
    if (apiKey === '***REDACTED***') {
        alert('ℹ️ API key is already saved. To update it, replace the ***REDACTED*** value with your new API key.');
        return;
    }

    if (!apiKey) {
        alert('❌ Please enter an API key');
        return;
    }

    // Validate key format (basic validation)
    if (apiKey.length < 32) {
        alert('❌ Invalid API key format. Key must be at least 32 characters long.');
        return;
    }

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tiktok_euler_api_key: apiKey
            })
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ Eulerstream API Key saved successfully!');
            settings.tiktok_euler_api_key = apiKey;
            // Reload settings to show masked key
            await loadSettings();
        } else {
            alert('❌ Error saving API key: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving TikTok credentials:', error);
        alert('❌ Error saving API key!');
    }
}

// ========== DATA SOURCE SWITCHING ==========

/**
 * Load data source status from the data-source plugin API and update the UI.
 */
async function loadDataSourceStatus() {
    try {
        const response = await fetch('/api/data-source/status');
        const data = await response.json();
        if (data.success) {
            updateDataSourceUI(data.currentSource, data.settings);
        }
    } catch (error) {
        console.error('Error loading data source status:', error);
    }
}

/**
 * Update the data source radio buttons, TikFinity section visibility, and
 * EulerStream card visibility based on the selected source.
 */
function updateDataSourceUI(source, dsSettings) {
    const radioEuler = document.getElementById('datasource-eulerstream');
    const radioTikfinity = document.getElementById('datasource-tikfinity');
    const tikfinitySection = document.getElementById('tikfinity-settings-section');
    const eulerstreamCard = document.getElementById('eulerstream-settings-card');

    if (radioEuler && radioTikfinity) {
        radioEuler.checked = source === 'eulerstream';
        radioTikfinity.checked = source === 'tikfinity';
    }

    if (tikfinitySection) {
        tikfinitySection.style.display = source === 'tikfinity' ? '' : 'none';
    }

    // Dim but keep visible the Euler card when TikFinity is active
    if (eulerstreamCard) {
        eulerstreamCard.style.opacity = source === 'tikfinity' ? '0.5' : '1';
    }

    if (dsSettings && dsSettings.tikfinity_ws_port !== undefined) {
        const portInput = document.getElementById('tikfinity-ws-port');
        if (portInput) {
            portInput.value = dsSettings.tikfinity_ws_port;
        }
    }
}

/**
 * Handle data source radio button change — persist via plugin API.
 */
async function handleDataSourceChange(e) {
    const source = e.target.value;
    if (!source) return;

    // If switching to tikfinity, auto-save the current port value first so the
    // adapter uses the value currently visible in the UI, not a potentially stale DB value.
    if (source === 'tikfinity') {
        const portInput = document.getElementById('tikfinity-ws-port');
        if (portInput) {
            const port = parseInt(portInput.value, 10);
            if (!isNaN(port) && port >= 1 && port <= 65535) {
                try {
                    await fetch('/api/data-source/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tikfinity_ws_port: port })
                    });
                } catch (portSaveErr) { /* non-fatal – proceed with switch anyway */
                    console.error('Error auto-saving TikFinity port before switch:', portSaveErr);
                }
            }
        }
    }

    try {
        const response = await fetch('/api/data-source/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source })
        });
        const data = await response.json();
        if (data.success) {
            updateDataSourceUI(source);
        } else {
            alert('❌ ' + (data.error || 'Fehler beim Wechseln der Datenquelle'));
            // revert radio
            loadDataSourceStatus();
        }
    } catch (error) {
        console.error('Error switching data source:', error);
        alert('❌ Fehler beim Wechseln der Datenquelle');
        loadDataSourceStatus();
    }
}

/**
 * Save TikFinity-specific settings (port).
 */
async function saveTikFinitySettings() {
    const portInput = document.getElementById('tikfinity-ws-port');
    if (!portInput) return;

    const port = parseInt(portInput.value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
        alert('❌ Ungültiger Port (1 – 65535)');
        return;
    }

    try {
        const response = await fetch('/api/data-source/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tikfinity_ws_port: port })
        });
        const data = await response.json();
        if (data.success) {
            alert('✅ TikFinity Einstellungen gespeichert!');
        } else {
            alert('❌ ' + (data.error || 'Fehler beim Speichern'));
        }
    } catch (error) {
        console.error('Error saving TikFinity settings:', error);
        alert('❌ Fehler beim Speichern der TikFinity Einstellungen');
    }
}

// Save OpenAI API credentials
async function saveOpenAICredentials() {
    const apiKeyInput = document.getElementById('openai-api-key');
    const modelSelect = document.getElementById('openai-model');

    if (!apiKeyInput || !modelSelect) return;

    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value;

    // Check if user is trying to save without changing the masked key
    if (apiKey === '***REDACTED***') {
        alert('ℹ️ API key is already saved. To update it, replace the ***REDACTED*** value with your new API key.');
        return;
    }

    if (!apiKey) {
        alert('❌ Please enter an API key');
        return;
    }

    // Validate key format (basic validation for OpenAI keys)
    if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
        alert('❌ Invalid OpenAI API key format. Key should start with "sk-".');
        return;
    }

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                openai_api_key: apiKey,
                openai_model: model
            })
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ OpenAI API Configuration saved successfully!');
            settings.openai_api_key = apiKey;
            settings.openai_model = model;
            // Reload settings to show masked key
            await loadSettings();
        } else {
            alert('❌ Error saving OpenAI configuration: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving OpenAI credentials:', error);
        alert('❌ Error saving OpenAI configuration!');
    }
}

// Save TTS API Keys
async function saveTTSAPIKeys() {
    const googleKeyInput = document.getElementById('tts-google-api-key');
    const speechifyKeyInput = document.getElementById('tts-speechify-api-key');
    const elevenlabsKeyInput = document.getElementById('tts-elevenlabs-api-key');
    const openaiKeyInput = document.getElementById('tts-openai-api-key');
    const fishaudioKeyInput = document.getElementById('tts-fishaudio-api-key');
    const fishspeechKeyInput = document.getElementById('tts-fishspeech-api-key');
    const ollamaKeyInput = document.getElementById('tts-ollama-api-key');

    if (!googleKeyInput || !speechifyKeyInput || !elevenlabsKeyInput || !openaiKeyInput || !fishaudioKeyInput || !fishspeechKeyInput || !ollamaKeyInput) return;

    const googleKey = googleKeyInput.value.trim();
    const speechifyKey = speechifyKeyInput.value.trim();
    const elevenlabsKey = elevenlabsKeyInput.value.trim();
    const openaiKey = openaiKeyInput.value.trim();
    const fishaudioKey = fishaudioKeyInput.value.trim();
    const fishspeechKey = fishspeechKeyInput.value.trim();
    const ollamaKey = ollamaKeyInput.value.trim();

    // Check if there are any actual new keys to save (not placeholders or empty)
    const hasNewKeys = (googleKey && googleKey !== '***REDACTED***') ||
                       (speechifyKey && speechifyKey !== '***REDACTED***') ||
                       (elevenlabsKey && elevenlabsKey !== '***REDACTED***') ||
                       (openaiKey && openaiKey !== '***REDACTED***') ||
                       (fishaudioKey && fishaudioKey !== '***REDACTED***') ||
                       (fishspeechKey && fishspeechKey !== '***REDACTED***') ||
                       (ollamaKey && ollamaKey !== '***REDACTED***');

    // Check if at least one key exists (either new or placeholder indicating existing)
    const hasAnyKeys = googleKey || speechifyKey || elevenlabsKey || openaiKey || fishaudioKey || fishspeechKey || ollamaKey;

    if (!hasAnyKeys) {
        alert('❌ Please enter at least one TTS API key');
        return;
    }

    if (!hasNewKeys) {
        alert('ℹ️ No changes to save. All fields contain existing (masked) keys.\n\nTo update a key, replace the ***REDACTED*** value with your new API key.');
        return;
    }

    try {
        const updateData = {};

        // Only include non-empty keys that aren't placeholders
        if (googleKey && googleKey !== '***REDACTED***') {
            updateData.tts_google_api_key = googleKey;
        }
        if (speechifyKey && speechifyKey !== '***REDACTED***') {
            updateData.tts_speechify_api_key = speechifyKey;
        }
        if (elevenlabsKey && elevenlabsKey !== '***REDACTED***') {
            updateData.tts_elevenlabs_api_key = elevenlabsKey;
        }
        if (openaiKey && openaiKey !== '***REDACTED***') {
            updateData.tts_openai_api_key = openaiKey;
        }
        if (fishaudioKey && fishaudioKey !== '***REDACTED***') {
            updateData.tts_fishaudio_api_key = fishaudioKey;
            updateData.fishaudio_api_key = fishaudioKey;
        }
        if (fishspeechKey && fishspeechKey !== '***REDACTED***') {
            // Save to centralized SiliconFlow API key (used by both TTS and StreamAlchemy)
            updateData.siliconflow_api_key = fishspeechKey;
            // Also save to legacy key for backwards compatibility
            updateData.tts_fishspeech_api_key = fishspeechKey;
        }
        if (ollamaKey && ollamaKey !== '***REDACTED***') {
            updateData.tts_ollama_api_key = ollamaKey;
        }

        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ TTS API Keys saved successfully!\n\nNote: The TTS plugin may need to reload to use the new keys.');

            // Update local settings cache
            if (googleKey && googleKey !== '***REDACTED***') settings.tts_google_api_key = googleKey;
            if (speechifyKey && speechifyKey !== '***REDACTED***') settings.tts_speechify_api_key = speechifyKey;
            if (elevenlabsKey && elevenlabsKey !== '***REDACTED***') settings.tts_elevenlabs_api_key = elevenlabsKey;
            if (openaiKey && openaiKey !== '***REDACTED***') settings.tts_openai_api_key = openaiKey;
            if (fishaudioKey && fishaudioKey !== '***REDACTED***') {
                settings.tts_fishaudio_api_key = fishaudioKey;
                settings.fishaudio_api_key = fishaudioKey;
            }
            if (fishspeechKey && fishspeechKey !== '***REDACTED***') {
                settings.tts_fishspeech_api_key = fishspeechKey;
                settings.siliconflow_api_key = fishspeechKey; // Update centralized key too
            }
            if (ollamaKey && ollamaKey !== '***REDACTED***') {
                settings.tts_ollama_api_key = ollamaKey;
            }

            // Reload the settings to show the masked keys
            await loadSettings();
        } else {
            alert('❌ Error saving TTS API keys: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving TTS API keys:', error);
        alert('❌ Error saving TTS API keys!');
    }
}

// ========== VOICES ==========
async function loadVoices(provider = null) {
    try {
        // Wenn kein Provider angegeben, aus Settings laden
        if (!provider) {
            provider = settings.tts_provider || 'tiktok';
        }

        const response = await fetch('/api/tts-v2/voices');
        const data = await response.json();
        voices = data.voices || {};

        // Voice-Dropdowns füllen
        const voiceSelects = [
            document.getElementById('default-voice'),
            document.getElementById('modal-voice')
        ];

        voiceSelects.forEach(select => {
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = '';

            Object.entries(voices).forEach(([id, name]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                select.appendChild(option);
            });

            // Versuche den vorherigen Wert wiederherzustellen
            if (currentValue && voices[currentValue]) {
                select.value = currentValue;
            }
        });

    } catch (error) {
        console.error('Error loading voices:', error);
    }
}

// ========== VOICE MAPPING ==========
async function loadVoiceMapping() {
    try {
        const response = await fetch('/api/tts-v2/user-voices');
        const data = await response.json();
        const mappings = data.mappings || [];

        const tbody = document.getElementById('voice-mapping-list');
        tbody.innerHTML = '';

        if (mappings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-gray-400">No voice mappings yet</td></tr>';
            return;
        }

        mappings.forEach(mapping => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-700';

            const voiceName = voices[mapping.voice] || mapping.voice;
            const lastUsed = mapping.last_used ? new Date(mapping.last_used).toLocaleString() : 'Never';

            row.innerHTML = `
                <td class="py-2 pr-4 font-semibold">${mapping.username}</td>
                <td class="py-2 pr-4">${voiceName}</td>
                <td class="py-2 pr-4 text-gray-400 text-sm">${lastUsed}</td>
                <td class="py-2">
                    <button data-action="delete-voice-mapping" data-username="${mapping.username}"
                            class="bg-red-600 px-3 py-1 rounded text-sm hover:bg-red-700">
                        🗑️ Delete
                    </button>
                </td>
            `;

            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading voice mappings:', error);
    }
}

function showVoiceModal() {
    document.getElementById('modal-username').value = '';
    document.getElementById('voice-modal').classList.add('active');
}

function hideVoiceModal() {
    document.getElementById('voice-modal').classList.remove('active');
}

async function saveVoiceMapping() {
    const username = document.getElementById('modal-username').value.trim();
    const voice = document.getElementById('modal-voice').value;

    if (!username) {
        alert('Please enter a username!');
        return;
    }

    try {
        const response = await fetch('/api/tts-v2/user-voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, voice })
        });

        const result = await response.json();
        if (result.success) {
            hideVoiceModal();
            loadVoiceMapping();
        }
    } catch (error) {
        console.error('Error saving voice mapping:', error);
        alert('Error saving voice mapping!');
    }
}

async function deleteVoiceMapping(username) {
    if (!confirm(`Delete voice mapping for ${username}?`)) return;

    try {
        const response = await fetch(`/api/tts-v2/user-voice/${username}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            loadVoiceMapping();
        }
    } catch (error) {
        console.error('Error deleting voice mapping:', error);
    }
}

// ========== FLOWS ==========
function updateFlowsGlobalToggle() {
    const checkbox = document.getElementById('flows-global-enabled');
    const label = document.getElementById('flows-global-enabled-label');
    if (!checkbox) return;

    const enabled = settings.flows_enabled !== 'false';
    checkbox.checked = enabled;
    if (label) {
        label.textContent = enabled ? 'Aktiv' : 'Pausiert';
    }
}

async function setFlowsGlobalEnabled(enabled) {
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flows_enabled: enabled ? 'true' : 'false' })
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Unknown error');
        }
        settings.flows_enabled = enabled ? 'true' : 'false';
        updateFlowsGlobalToggle();
        loadFlows();
    } catch (error) {
        console.error('Error updating global flow setting:', error);
        alert('Fehler beim Speichern des globalen Flow-Schalters.');
        updateFlowsGlobalToggle();
    }
}

async function loadFlows() {
    try {
        const response = await fetch('/api/flows');
        const flows = await response.json();

        const container = document.getElementById('flows-list');
        container.innerHTML = '';

        if (flows.length === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-400 py-6">
                    <p class="mb-4">Noch keine Flows. Starte mit einem Template oder erstelle deinen eigenen Flow!</p>
                    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                        <button class="btn btn-primary" data-action="show-flow-presets">📦 Vorlagen anzeigen</button>
                        <button class="btn btn-ghost" data-action="open-wizard">🧙 Wizard starten</button>
                        <a href="/ifttt-flow-editor.html" target="_blank" class="btn btn-ghost">🎨 Visual Editor</a>
                    </div>
                </div>
                <div id="inline-presets-section" class="mt-4"></div>
            `;
            renderInlinePresets();
            // Show the bulk bar toggle off
            updateBulkBar();
            return;
        }

        // Show bulk actions bar
        const bulkBar = document.getElementById('flows-bulk-bar');
        if (bulkBar) bulkBar.style.display = 'flex';

        flows.forEach(flow => {
            const flowDiv = document.createElement('div');
            flowDiv.className = 'bg-gray-700 rounded p-4 mb-3';

            // Get trigger name
            const triggerName = flow.trigger_type.replace('tiktok:', '').replace(':', ' ');
            const triggerIcon = getTriggerIcon(flow.trigger_type);
            const cooldownBadge = flow.cooldown > 0
                ? `<span class="text-xs bg-gray-600 px-2 py-0.5 rounded" title="Cooldown">⏳ ${flow.cooldown}s</span>`
                : '';

            flowDiv.innerHTML = `
                <div class="flex justify-between items-start gap-3">
                    <div style="display:flex;align-items:flex-start;gap:8px;">
                        <input type="checkbox" class="flow-select-checkbox mt-1" data-flow-id="${flow.id}"
                            style="width:15px;height:15px;cursor:pointer;">
                        <div class="flex-1">
                            <h3 class="font-bold text-lg">${escapeHtml(flow.name)}</h3>
                            <div class="text-sm text-gray-400 mt-2 flex items-center gap-2 flex-wrap">
                                <span>${triggerIcon}</span>
                                <span><strong>Trigger:</strong> ${escapeHtml(triggerName)}</span>
                                ${cooldownBadge}
                            </div>
                            ${flow.trigger_condition ? `
                                <div class="text-sm text-gray-400 mt-1">
                                    <strong>Bedingung:</strong> ${escapeHtml(flow.trigger_condition.field || '')} ${escapeHtml(flow.trigger_condition.operator || '')} ${escapeHtml(String(flow.trigger_condition.value || ''))}
                                </div>
                            ` : ''}
                            <div class="text-sm text-gray-400 mt-1">
                                <strong>Aktionen:</strong> ${flow.actions.length} Aktion(en)
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-2 flex-wrap" style="flex-shrink:0;">
                        <button data-action="test-flow" data-flow-id="${flow.id}"
                                class="px-3 py-1 rounded text-sm bg-blue-600 hover:bg-blue-700"
                                title="Flow testen">
                            🧪 Test
                        </button>
                        <button data-action="edit-flow-wizard" data-flow-id="${flow.id}"
                                class="px-3 py-1 rounded text-sm bg-purple-600 hover:bg-purple-700"
                                title="Im Wizard bearbeiten">
                            🧙 Bearbeiten
                        </button>
                        <a href="/ifttt-flow-editor.html?id=${encodeURIComponent(flow.id)}" target="_blank"
                                class="px-3 py-1 rounded text-sm bg-indigo-600 hover:bg-indigo-700"
                                title="Im Visual Editor bearbeiten">
                            Visual
                        </a>
                        <button data-action="clone-flow" data-flow-id="${flow.id}"
                                class="px-3 py-1 rounded text-sm bg-gray-600 hover:bg-gray-500"
                                title="Flow duplizieren">
                            📋 Clone
                        </button>
                        <button data-action="export-flow" data-flow-id="${flow.id}"
                                class="px-3 py-1 rounded text-sm bg-gray-600 hover:bg-gray-500"
                                title="Als JSON exportieren">
                            📤 Export
                        </button>
                        <button data-action="toggle-flow" data-flow-id="${flow.id}" data-enabled="${!flow.enabled}"
                                class="px-3 py-1 rounded text-sm ${flow.enabled ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'}">
                            ${flow.enabled ? '✅ Aktiv' : '⏸️ Inaktiv'}
                        </button>
                        <button data-action="delete-flow" data-flow-id="${flow.id}" class="bg-red-600 px-3 py-1 rounded text-sm hover:bg-red-700">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(flowDiv);
        });

        updateBulkBar();

    } catch (error) {
        console.error('Error loading flows:', error);
    }
}

/**
 * Update the bulk actions bar based on checkbox selection state
 */
function updateBulkBar() {
    const checkboxes = document.querySelectorAll('.flow-select-checkbox');
    const checked = document.querySelectorAll('.flow-select-checkbox:checked');
    const bulkBar = document.getElementById('flows-bulk-bar');
    const countEl = document.getElementById('flows-selected-count');
    const selectAll = document.getElementById('flows-select-all');

    if (!bulkBar) return;

    if (checkboxes.length === 0) {
        bulkBar.style.display = 'none';
        return;
    }

    bulkBar.style.display = 'flex';

    if (countEl) {
        countEl.textContent = checked.length > 0 ? `${checked.length} ausgewählt` : '';
    }

    if (selectAll) {
        selectAll.checked = checkboxes.length > 0 && checked.length === checkboxes.length;
        selectAll.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
    }
}

/**
 * Bulk toggle enabled/disabled for selected flows
 * @param {boolean} enabled
 */
async function bulkToggleFlows(enabled) {
    const checked = document.querySelectorAll('.flow-select-checkbox:checked');
    if (checked.length === 0) return;

    const ids = Array.from(checked).map(cb => cb.dataset.flowId);
    await Promise.all(ids.map(id => toggleFlow(id, enabled)));
    loadFlows();
}

/**
 * Clone a flow (creates a copy with "(Copy)" suffix)
 * @param {number} id - Flow ID to clone
 */
async function cloneFlow(id) {
    try {
        const response = await fetch(`/api/flows/${id}`);
        const flow = await response.json();

        if (!flow || flow.error) {
            alert('Fehler: Flow nicht gefunden.');
            return;
        }

        const clonedFlow = {
            name: `${flow.name} (Kopie)`,
            description: flow.description || '',
            trigger_type: flow.trigger_type,
            trigger_condition: flow.trigger_condition,
            actions: flow.actions,
            enabled: false, // Start disabled for safety
            cooldown: flow.cooldown || 0,
            priority: flow.priority || 'normal',
            schema_version: flow.schema_version || 1,
            flow_graph: flow.flow_graph || null
        };

        const createResponse = await fetch('/api/flows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clonedFlow)
        });

        const result = await createResponse.json();
        if (result.success) {
            loadFlows();
        } else {
            alert('Fehler beim Duplizieren: ' + (result.error || 'Unbekannter Fehler'));
        }
    } catch (error) {
        console.error('Error cloning flow:', error);
        alert('Fehler beim Duplizieren des Flows.');
    }
}

/**
 * Export a single flow as JSON file download
 * @param {number} id - Flow ID
 */
async function exportFlow(id) {
    try {
        const response = await fetch(`/api/flows/${id}`);
        const flow = await response.json();

        if (!flow || flow.error) {
            alert('Fehler: Flow nicht gefunden.');
            return;
        }

        const exportData = {
            schema_version: 2,
            exported_at: new Date().toISOString(),
            kind: 'ltth.ifttt.flow',
            flow: {
                name: flow.name,
                description: flow.description || '',
                trigger_type: flow.trigger_type,
                trigger_condition: flow.trigger_condition,
                actions: flow.actions,
                enabled: flow.enabled,
                cooldown: flow.cooldown || 0,
                priority: flow.priority || 'normal',
                schema_version: flow.schema_version || 1,
                flow_graph: flow.flow_graph || null
            }
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flow-${flow.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting flow:', error);
        alert('Fehler beim Exportieren des Flows.');
    }
}

/**
 * Handle flow import from JSON file
 * @param {Event} event - File input change event
 */
async function handleFlowImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    // Reset file input so same file can be re-imported
    event.target.value = '';

    try {
        const text = await file.text();
        const importPayload = JSON.parse(text);
        const flowData = normalizeImportedFlow(importPayload);

        if (!flowData.name || !flowData.trigger_type || !Array.isArray(flowData.actions)) {
            alert('Ungültiges Flow-Format: name, trigger_type und actions sind erforderlich.');
            return;
        }

        const response = await fetch('/api/flows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(flowData)
        });

        const result = await response.json();
        if (result.success) {
            loadFlows();
        } else {
            alert('Fehler beim Importieren: ' + (result.error || 'Unbekannter Fehler'));
        }
    } catch (error) {
        console.error('Error importing flow:', error);
        alert('Fehler beim Lesen der JSON-Datei.');
    }
}

function normalizeImportedFlow(payload) {
    const flow = payload && payload.flow ? payload.flow : payload;
    if (!flow || typeof flow !== 'object') {
        return {};
    }

    return {
        name: flow.name,
        description: flow.description || '',
        trigger_type: flow.trigger_type,
        trigger_condition: flow.trigger_condition || null,
        actions: Array.isArray(flow.actions) ? flow.actions : [],
        enabled: flow.enabled !== false,
        cooldown: flow.cooldown || 0,
        priority: flow.priority || 'normal',
        schema_version: flow.schema_version || payload.schema_version || 1,
        flow_graph: flow.flow_graph || null
    };
}

/**
 * Show the presets modal
 */
function showFlowPresets() {
    const modal = document.getElementById('flow-presets-modal');
    if (!modal) return;

    const list = document.getElementById('flow-presets-list');
    if (list && typeof getFlowPresets === 'function') {
        const presets = getFlowPresets();
        list.innerHTML = presets.map(preset => `
            <div class="bg-gray-700 rounded-lg p-4 mb-3">
                <div class="flex justify-between items-start gap-3">
                    <div>
                        <div class="text-2xl mb-1">${preset.icon}</div>
                        <h4 class="font-bold text-gray-100">${escapeHtml(preset.name)}</h4>
                        <p class="text-sm text-gray-400 mt-1">${escapeHtml(preset.description)}</p>
                        <span class="text-xs bg-gray-600 px-2 py-0.5 rounded mt-2 inline-block">${escapeHtml(preset.category)}</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
                        <button class="btn btn-primary text-sm"
                            data-action="deploy-preset" data-preset-id="${escapeHtml(preset.id)}">
                            🚀 Jetzt deployen
                        </button>
                        <button class="btn btn-ghost text-sm"
                            data-action="open-preset-wizard" data-preset-id="${escapeHtml(preset.id)}">
                            🧙 Im Wizard öffnen
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    modal.classList.add('active');
}

/**
 * Render inline presets section (shown when no flows exist)
 */
function renderInlinePresets() {
    const container = document.getElementById('inline-presets-section');
    if (!container || typeof getFlowPresets !== 'function') return;

    const presets = getFlowPresets();
    container.innerHTML = `
        <div class="mt-4">
            <h4 class="font-semibold text-gray-200 mb-3">🚀 Starte mit einer Vorlage:</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
                ${presets.map(preset => `
                    <div class="bg-gray-700 rounded-lg p-3 border border-gray-600 hover:border-blue-500/50 transition-colors">
                        <div class="text-xl mb-1">${preset.icon}</div>
                        <div class="font-semibold text-sm text-gray-100">${escapeHtml(preset.name)}</div>
                        <div class="text-xs text-gray-400 mt-1 mb-3">${escapeHtml(preset.description)}</div>
                        <div style="display:flex;gap:6px;">
                            <button class="btn btn-primary text-xs" style="padding:4px 8px;"
                                data-action="deploy-preset" data-preset-id="${escapeHtml(preset.id)}">🚀 Deploy</button>
                            <button class="btn btn-ghost text-xs" style="padding:4px 8px;"
                                data-action="open-preset-wizard" data-preset-id="${escapeHtml(preset.id)}">🧙 Wizard</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Deploy a preset instantly (no wizard)
 * @param {string} presetId - Preset ID
 */
async function deployPreset(presetId) {
    if (typeof getFlowPresetById !== 'function') return;
    const preset = getFlowPresetById(presetId);
    if (!preset) return;

    try {
        const response = await fetch('/api/flows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(preset.flow)
        });
        const result = await response.json();
        if (result.success) {
            document.getElementById('flow-presets-modal')?.classList.remove('active');
            loadFlows();
        } else {
            alert('Fehler beim Erstellen: ' + (result.error || 'Unbekannter Fehler'));
        }
    } catch (error) {
        console.error('Error deploying preset:', error);
        alert('Fehler beim Deployen der Vorlage.');
    }
}

/**
 * Open a preset in the wizard for customization
 * @param {string} presetId - Preset ID
 */
function openPresetInWizard(presetId) {
    if (typeof getFlowPresetById !== 'function' || typeof FlowWizard === 'undefined') return;
    const preset = getFlowPresetById(presetId);
    if (!preset) return;

    document.getElementById('flow-presets-modal')?.classList.remove('active');
    FlowWizard.open(preset.flow);
}

/**
 * Open a flow in the wizard for editing
 * @param {number} id - Flow ID
 */
async function editFlowInWizard(id) {
    try {
        const response = await fetch(`/api/flows/${id}`);
        const flow = await response.json();
        if (flow && !flow.error && typeof FlowWizard !== 'undefined') {
            FlowWizard.open(flow, id);
        }
    } catch (error) {
        console.error('Error loading flow for wizard edit:', error);
    }
}

function getTriggerIcon(triggerType) {
    const icons = {
        'tiktok:gift': '🎁',
        'tiktok:chat': '💬',
        'tiktok:follow': '👤',
        'tiktok:share': '🔗',
        'tiktok:like': '❤️',
        'tiktok:subscribe': '⭐',
        'tiktok:join': '👋',
        'timer:interval': '⏰',
        'timer:countdown': '⏱️',
        'system:connected': '📡',
        'system:disconnected': '📴',
        'goal:reached': '🎯'
    };
    return icons[triggerType] || '⚡';
}

async function testFlow(id) {
    try {
        const response = await fetch(`/api/ifttt/trigger/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'TestUser',
                message: 'Test message from dashboard',
                coins: 100,
                giftName: 'Rose'
            })
        });

        const result = await response.json();

        if (result.success) {
            alert('✅ Flow test triggered successfully!');
        } else {
            alert(`❌ Test failed: ${result.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error testing flow:', error);
        alert('❌ Error testing flow');
    }
}

async function toggleFlow(id, enabled) {
    try {
        const response = await fetch(`/api/flows/${id}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });

        const result = await response.json();
        if (result.success) {
            loadFlows();
        }
    } catch (error) {
        console.error('Error toggling flow:', error);
    }
}

async function deleteFlow(id) {
    if (!confirm('Delete this flow?')) return;

    try {
        const response = await fetch(`/api/flows/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            loadFlows();
        }
    } catch (error) {
        console.error('Error deleting flow:', error);
    }
}

// ========== FLOW EDITOR MODAL ==========
function showCreateFlowModal() {
    // Reset form
    document.getElementById('flow-name').value = '';
    document.getElementById('flow-trigger-type').value = 'tiktok:gift';
    document.getElementById('flow-action-type').value = 'alert:show';
    document.getElementById('flow-action-text').value = '';

    // Show modal
    document.getElementById('flow-modal').classList.add('active');
}

function hideCreateFlowModal() {
    document.getElementById('flow-modal').classList.remove('active');
}

async function saveNewFlow() {
    const name = document.getElementById('flow-name').value.trim();
    const triggerType = document.getElementById('flow-trigger-type').value;
    const actionType = document.getElementById('flow-action-type').value;
    const actionText = document.getElementById('flow-action-text').value.trim();

    if (!name) {
        alert('Please enter a flow name!');
        return;
    }

    if (actionType === 'alert:show' && !actionText) {
        alert('Please enter alert text!');
        return;
    }

    // Build flow object
    const flow = {
        name: name,
        trigger_type: triggerType,
        trigger_condition: null, // Basic flow without conditions
        actions: [],
        enabled: true
    };

    // Add action based on type
    if (actionType === 'alert:show') {
        flow.actions.push({
            type: 'alert:show',
            text: actionText,
            duration: 5,
            sound_file: null,
            volume: 80
        });
    } else if (actionType === 'webhook:send') {
        const webhookUrl = document.getElementById('flow-webhook-url').value.trim();
        if (!webhookUrl) {
            alert('Please enter a webhook URL!');
            return;
        }
        flow.actions.push({
            type: 'webhook:send',
            method: 'POST',
            url: webhookUrl
        });
    }

    try {
        const response = await fetch('/api/flows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(flow)
        });

        const result = await response.json();
        if (result.success) {
            alert(`✅ Flow "${name}" created successfully!`);
            hideCreateFlowModal();
            loadFlows();
        } else {
            alert('❌ Error creating flow: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating flow:', error);
        alert('❌ Error creating flow!');
    }
}


// ========== TTS SETTINGS ==========
async function loadTTSSettings() {
    try {
        const response = await fetch('/api/settings');
        settings = await response.json();

        // TTS Provider
        const providerSelect = document.getElementById('tts-provider');
        if (providerSelect) {
            providerSelect.value = settings.tts_provider || 'tiktok';
            onTTSProviderChange(); // Update UI basierend auf Provider
        }

        // Google API Key
        const apiKeyInput = document.getElementById('google-api-key');
        if (apiKeyInput) {
            apiKeyInput.value = settings.google_tts_api_key || '';
        }

        // Load TTS Core V2 Config
        const ttsResponse = await fetch('/api/tts-v2/config');
        const ttsData = await ttsResponse.json();
        const ttsConfig = ttsData.config || {};

        // General Settings
        const defaultVoice = document.getElementById('default-voice');
        if (defaultVoice) {
            defaultVoice.value = ttsConfig.default_voice || 'en_us_001';
        }

        const ttsVolume = document.getElementById('tts-volume');
        if (ttsVolume) {
            ttsVolume.value = ttsConfig.volume || 80;
            document.getElementById('tts-volume-label').textContent = ttsConfig.volume || 80;
        }

        const ttsSpeed = document.getElementById('tts-speed');
        if (ttsSpeed) {
            ttsSpeed.value = ttsConfig.speed || 1.0;
            document.getElementById('tts-speed-label').textContent = ttsConfig.speed || 1.0;
        }

        const ttsMinTeamLevel = document.getElementById('tts-min-team-level');
        if (ttsMinTeamLevel) {
            ttsMinTeamLevel.value = ttsConfig.min_team_level || 0;
        }

        // Voices laden
        await loadVoices();

    } catch (error) {
        console.error('Error loading TTS settings:', error);
    }
}

async function saveTTSSettings() {
    const provider = document.getElementById('tts-provider').value;
    const googleApiKey = document.getElementById('google-api-key').value;
    const defaultVoice = document.getElementById('default-voice').value;
    const ttsVolume = document.getElementById('tts-volume').value;
    const ttsSpeed = document.getElementById('tts-speed').value;
    const ttsChatEnabled = document.getElementById('tts-chat-enabled').checked;
    const ttsMinTeamLevel = document.getElementById('tts-min-team-level').value;

    // Validierung: Google API Key erforderlich wenn Google ausgewählt
    if (provider === 'google' && !googleApiKey) {
        alert('❌ Please enter your Google Cloud TTS API key!');
        return;
    }

    // TTS Core V2 Config (uses /api/tts-v2/config)
    const ttsConfig = {
        default_voice: defaultVoice,
        volume: parseInt(ttsVolume),
        speed: parseFloat(ttsSpeed),
        min_team_level: parseInt(ttsMinTeamLevel)
    };

    try {
        const response = await fetch('/api/tts-v2/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ttsConfig)
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ TTS Settings saved!');
            settings = { ...settings, ...newSettings };
        }
    } catch (error) {
        console.error('Error saving TTS settings:', error);
        alert('❌ Error saving TTS settings!');
    }
}

function onTTSProviderChange() {
    const provider = document.getElementById('tts-provider').value;
    const googleApiKeyContainer = document.getElementById('google-api-key-container');

    // Google API Key Container ein/ausblenden
    if (provider === 'google') {
        googleApiKeyContainer.classList.remove('hidden');
    } else {
        googleApiKeyContainer.classList.add('hidden');
    }

    // Voices neu laden für den gewählten Provider
    loadVoices(provider);
}

async function testTTS() {
    const testText = document.getElementById('tts-test-text').value;

    if (!testText || testText.trim().length === 0) {
        alert('⚠️ Please enter some text to test!');
        return;
    }

    try {
        const response = await fetch('/api/tts-v2/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: testText,
                voice: document.getElementById('default-voice').value
            })
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ TTS test sent! Listen in your overlay.');
        } else {
            alert('❌ TTS test failed: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error testing TTS:', error);
        alert('❌ Error testing TTS!');
    }
}

// ========== USER PROFILE MANAGEMENT ==========

// Profile filter state
let profileFilter = 'all'; // 'all' or 'recent'
let profileSearchQuery = '';

// Lädt das aktive Profil und zeigt es an
async function loadActiveProfile() {
    try {
        const response = await fetch('/api/profiles/active');
        const data = await response.json();

        if (data.activeProfile) {
            document.getElementById('current-profile-name').textContent = data.activeProfile;
            document.getElementById('active-profile-display').textContent = data.activeProfile;
        }
    } catch (error) {
        console.error('Error loading active profile:', error);
    }
}

// Initialize profile auto-restart toggle
function initializeProfileAutoRestartToggle() {
    const toggle = document.getElementById('profile-auto-restart-toggle');
    if (!toggle) return;

    toggle.checked = true;
    toggle.disabled = true;
    toggle.title = 'Profile switches always restart automatically so the correct database is loaded.';
}

// Lädt alle verfügbaren Profile mit Filter- und Suchunterstützung
async function loadProfiles() {
    try {
        const response = await fetch('/api/profiles');
        const data = await response.json();

        const profileList = document.getElementById('profile-list');
        profileList.innerHTML = '';

        let profiles = data.profiles || [];

        // Apply search filter
        if (profileSearchQuery && profileSearchQuery.trim() !== '') {
            const query = profileSearchQuery.toLowerCase().trim();
            profiles = profiles.filter(p =>
                p.username.toLowerCase().includes(query)
            );
        }

        // Apply filter: 'recent' shows last 10 recently modified profiles
        if (profileFilter === 'recent') {
            // Profiles are already sorted by modified date (newest first) from API
            profiles = profiles.slice(0, 10);
        }

        if (profiles.length === 0) {
            if (profileSearchQuery) {
                profileList.innerHTML = '<div class="text-gray-400 text-center py-4">No profiles found matching your search</div>';
            } else {
                profileList.innerHTML = '<div class="text-gray-400 text-center py-4">Keine Profile gefunden</div>';
            }
            return;
        }

        profiles.forEach(profile => {
            const profileCard = document.createElement('div');
            profileCard.className = `bg-gray-700 rounded-lg p-4 flex items-center justify-between ${
                profile.isActive ? 'border-2 border-blue-500' : ''
            }`;

            const infoDiv = document.createElement('div');
            infoDiv.className = 'flex-1';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'font-semibold flex items-center gap-2';
            nameDiv.innerHTML = `
                <span>${escapeHtml(profile.username)}</span>
                ${profile.isActive ? '<span class="text-xs bg-blue-600 px-2 py-1 rounded">AKTIV</span>' : ''}
            `;

            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'text-xs text-gray-400 mt-1';
            const modifiedDate = new Date(profile.modified).toLocaleString('de-DE');
            const sizeKB = (profile.size / 1024).toFixed(2);
            detailsDiv.textContent = `Zuletzt geändert: ${modifiedDate} | Größe: ${sizeKB} KB`;

            infoDiv.appendChild(nameDiv);
            infoDiv.appendChild(detailsDiv);

            const buttonsDiv = document.createElement('div');
            buttonsDiv.className = 'flex gap-2';

            // Switch Button (nur wenn nicht aktiv)
            if (!profile.isActive) {
                const switchBtn = document.createElement('button');
                switchBtn.className = 'bg-blue-600 px-3 py-1 rounded hover:bg-blue-700 text-sm';
                switchBtn.textContent = '🔄 Wechseln';
                switchBtn.onclick = () => switchProfile(profile.username);
                buttonsDiv.appendChild(switchBtn);
            }

            // Backup Button
            const backupBtn = document.createElement('button');
            backupBtn.className = 'bg-gray-600 px-3 py-1 rounded hover:bg-gray-500 text-sm';
            backupBtn.textContent = '💾';
            backupBtn.title = 'Backup erstellen';
            backupBtn.onclick = () => backupProfile(profile.username);
            buttonsDiv.appendChild(backupBtn);

            // Delete Button (nicht für aktives Profil)
            if (!profile.isActive) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'bg-red-600 px-3 py-1 rounded hover:bg-red-700 text-sm';
                deleteBtn.textContent = '🗑️';
                deleteBtn.title = 'Profil löschen';
                deleteBtn.onclick = () => deleteProfile(profile.username);
                buttonsDiv.appendChild(deleteBtn);
            }

            profileCard.appendChild(infoDiv);
            profileCard.appendChild(buttonsDiv);
            profileList.appendChild(profileCard);
        });
    } catch (error) {
        console.error('Error loading profiles:', error);
    }
}

// Initialize profile search and filter functionality
function initProfileSearchFilter() {
    const searchInput = document.getElementById('profile-search-input');
    const filterBtns = document.querySelectorAll('.profile-filter-btn');

    // Search input handler with debounce
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                profileSearchQuery = e.target.value;
                loadProfiles();
            }, 300);
        });
    }

    // Filter button handlers
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;

            // Update active state
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Apply filter
            profileFilter = filter;
            loadProfiles();
        });
    });
}

// Zeigt das Profile Modal
async function showProfileModal() {
    // Navigate to settings view where profile management is located
    if (window.NavigationManager) {
        window.NavigationManager.switchView('settings');
    }
    await loadUsernameAliases();
}

// Versteckt das Profile Modal
function hideProfileModal() {
    document.getElementById('profile-modal').classList.remove('active');
}

// Erstellt ein neues Profil
async function createProfile() {
    const usernameInput = document.getElementById('new-profile-username');
    const username = usernameInput.value.trim();

    if (!username) {
        alert('Bitte gib einen Profilnamen ein!');
        return;
    }

    try {
        const response = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ Profil "${username}" wurde erfolgreich erstellt!`);
            usernameInput.value = '';
            await loadProfiles();
        } else {
            alert('❌ Fehler beim Erstellen des Profils: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating profile:', error);
        alert('❌ Fehler beim Erstellen des Profils!');
    }
}

// Wechselt zu einem anderen Profil
async function switchProfile(username) {
    const confirmSwitch = confirm(
        `Möchtest du zu Profil "${username}" wechseln?\n\n` +
        `⚠️ Der Server wird danach automatisch neu gestartet.`
    );

    if (!confirmSwitch) return;

    try {
        const response = await fetch('/api/profiles/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        const result = await response.json();

        if (result.success) {
            hideProfileModal();
            localStorage.setItem('selectedProfile', result.newProfile || username);

            if (result.requiresRestart && window.profileManager && typeof window.profileManager.beginProfileRestart === 'function') {
                window.profileManager.beginProfileRestart({
                    from: result.activeProfile,
                    to: result.newProfile || username,
                    requiresRestart: true,
                    restartScheduled: result.restartScheduled === true
                });
            } else if (result.requiresRestart) {
                fetch('/api/server/restart', { method: 'POST' }).catch(() => {});
                setTimeout(() => window.location.reload(), 5000);
            }
        } else {
            alert('❌ Fehler beim Wechseln des Profils: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error switching profile:', error);
        alert('❌ Netzwerkfehler: ' + error.message);
    }
}

// Löscht ein Profil
async function deleteProfile(username) {
    const confirmDelete = confirm(
        `Möchtest du das Profil "${username}" wirklich löschen?\n\n` +
        `⚠️ Diese Aktion kann nicht rückgängig gemacht werden!\n` +
        `Alle Einstellungen, Voice-Mappings, Sounds und Konfigurationen werden gelöscht.`
    );

    if (!confirmDelete) return;

    try {
        const response = await fetch(`/api/profiles/${encodeURIComponent(username)}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ Profil "${username}" wurde gelöscht!`);
            await loadProfiles();
        } else {
            alert('❌ Fehler beim Löschen des Profils: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting profile:', error);
        alert('❌ Fehler beim Löschen des Profils!');
    }
}

// Erstellt ein Backup eines Profils
async function backupProfile(username) {
    try {
        const response = await fetch(`/api/profiles/${encodeURIComponent(username)}/backup`, {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            alert(
                `✅ Backup erstellt!\n\n` +
                `Profil: ${username}\n` +
                `Backup-Datei: ${result.backup.backupPath}`
            );
        } else {
            alert('❌ Fehler beim Erstellen des Backups: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        alert('❌ Fehler beim Erstellen des Backups!');
    }
}

// ========== CONFIG PATH MANAGEMENT ==========

// Load and display config path information
async function loadConfigPathInfo() {
    try {
        const response = await fetch('/api/config-path');
        const result = await response.json();

        if (result.success) {
            // Update UI elements
            const platformEl = document.getElementById('config-path-platform');
            const defaultEl = document.getElementById('config-path-default');
            const activeEl = document.getElementById('config-path-active');
            const isCustomEl = document.getElementById('config-path-is-custom');
            const customPathInput = document.getElementById('custom-config-path');

            if (platformEl) platformEl.textContent = result.platform || '-';
            if (defaultEl) defaultEl.textContent = result.defaultConfigDir || '-';
            if (activeEl) activeEl.textContent = result.activeConfigDir || '-';
            if (isCustomEl) {
                isCustomEl.textContent = result.isUsingCustomPath ? '✅ Yes' : '❌ No (Default)';
                isCustomEl.className = result.isUsingCustomPath ? 'ml-2 text-green-400' : 'ml-2 text-gray-400';
            }
            if (customPathInput && result.customConfigDir) {
                customPathInput.value = result.customConfigDir;
            }

            // Update OpenAI key storage path display
            const openaiStoragePathEl = document.getElementById('openai-key-storage-path');
            if (openaiStoragePathEl && result.userConfigsDir) {
                openaiStoragePathEl.textContent = result.userConfigsDir;
                openaiStoragePathEl.title = result.userConfigsDir; // Add tooltip for full path
            }
        }
    } catch (error) {
        console.error('Error loading config path info:', error);
    }
}

// Set custom config path
async function setCustomConfigPath() {
    const customPathInput = document.getElementById('custom-config-path');
    if (!customPathInput) return;

    const customPath = customPathInput.value.trim();
    if (!customPath) {
        // TODO: Add i18n support for these messages
        alert('❌ Bitte gib einen Pfad ein!');
        return;
    }

    try {
        const response = await fetch('/api/config-path/custom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: customPath })
        });

        const result = await response.json();

        if (result.success) {
            alert(
                `✅ Custom Config Path gesetzt!\n\n` +
                `Neuer Pfad: ${result.path}\n\n` +
                `⚠️ Bitte starte die Anwendung neu, damit die Änderungen wirksam werden.`
            );
            await loadConfigPathInfo();
        } else {
            alert('❌ Fehler beim Setzen des Custom Paths: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error setting custom config path:', error);
        alert('❌ Fehler beim Setzen des Custom Paths!');
    }
}

// Reset to default config path
async function resetConfigPath() {
    const confirmReset = confirm(
        `Möchtest du den Config-Pfad wirklich auf den Standard zurücksetzen?\n\n` +
        `⚠️ Die Anwendung muss neu gestartet werden.`
    );

    if (!confirmReset) return;

    try {
        const response = await fetch('/api/config-path/reset', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            alert(
                `✅ Config-Pfad auf Standard zurückgesetzt!\n\n` +
                `Standard-Pfad: ${result.path}\n\n` +
                `⚠️ Bitte starte die Anwendung neu.`
            );
            await loadConfigPathInfo();
        } else {
            alert('❌ Fehler beim Zurücksetzen: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error resetting config path:', error);
        alert('❌ Fehler beim Zurücksetzen!');
    }
}

// ========== AUDIO INFO BANNER ==========
function initializeAudioInfoBanner() {
    const banner = document.querySelector('.bg-yellow-600');
    const dismissBtn = document.getElementById('dismiss-audio-info');

    if (!banner || !dismissBtn) return;

    // Prüfe ob Banner bereits dismissed wurde
    const isDismissed = localStorage.getItem('audio-info-dismissed');
    if (isDismissed === 'true') {
        banner.style.display = 'none';
    }

    // Dismiss-Button Event
    dismissBtn.addEventListener('click', () => {
        banner.style.display = 'none';
        localStorage.setItem('audio-info-dismissed', 'true');
    });
}

// ========== PLUGIN-BASED UI VISIBILITY ==========
// This functionality is now handled by navigation.js
// See NavigationManager.initializePluginVisibility()

// ========== DASHBOARD AUDIO PLAYBACK ==========

/**
 * Unlock audio playback (required by browser autoplay policies)
 * Modern browsers require user interaction before allowing audio
 */
function unlockAudio() {
    if (audioUnlocked) return Promise.resolve();

    return new Promise((resolve) => {
        console.log('🔓 [Dashboard] Attempting to unlock audio...');

        const audio = document.getElementById('dashboard-tts-audio');
        if (!audio) {
            console.error('❌ [Dashboard] Audio element not found');
            resolve();
            return;
        }

        // Play and immediately pause a silent audio to unlock
        // This must happen in response to user interaction
        // Using a minimal valid silent WAV (1 sample) to avoid media decode errors
        audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        audio.volume = 0.01; // Very quiet

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                audio.pause();
                audio.currentTime = 0;
                audioUnlocked = true;
                console.log('✅ [Dashboard] Audio unlocked successfully');

                // Process any pending TTS
                if (pendingTTSQueue.length > 0) {
                    console.log(`🎤 [Dashboard] Processing ${pendingTTSQueue.length} pending TTS items`);
                    pendingTTSQueue.forEach(data => playDashboardTTS(data));
                    pendingTTSQueue = [];
                }

                resolve();
            }).catch((err) => {
                console.warn('⚠️ [Dashboard] Audio unlock failed, but will try anyway:', err);
                audioUnlocked = true; // Mark as unlocked to avoid repeated prompts
                resolve();
            });
        } else {
            audioUnlocked = true;
            resolve();
        }
    });
}

/**
 * Show audio enable prompt to user
 */
function showAudioEnablePrompt() {
    // Check if prompt already exists
    if (document.getElementById('audio-enable-prompt')) {
        return;
    }

    const prompt = document.createElement('div');
    prompt.id = 'audio-enable-prompt';
    prompt.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-4 max-w-2xl';
    prompt.style.zIndex = '99999'; // Ensure it's above everything including sidebar
    prompt.style.pointerEvents = 'auto'; // Ensure it's clickable
    prompt.innerHTML = `
        <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
        <span><strong>Audio aktivieren:</strong> Klicken Sie hier, um TTS-Audio zu hören</span>
        <button id="enable-audio-btn" class="bg-white text-blue-600 px-4 py-2 rounded font-semibold hover:bg-blue-50 transition flex-shrink-0">
            Aktivieren
        </button>
    `;

    document.body.appendChild(prompt);

    document.getElementById('enable-audio-btn').addEventListener('click', async () => {
        await unlockAudio();
        prompt.remove();
    });

    // Auto-hide after 10 seconds if user doesn't interact
    setTimeout(() => {
        if (document.getElementById('audio-enable-prompt')) {
            prompt.remove();
        }
    }, 10000);
}

/**
 * TTS im Dashboard abspielen
 */
async function playDashboardTTS(data) {
    console.log('🎤 [Dashboard] Playing TTS:', data.text);

    // Check if audio is unlocked
    if (!audioUnlocked) {
        console.log('⚠️ [Dashboard] Audio not unlocked yet, adding to queue and showing prompt');
        pendingTTSQueue.push(data);
        showAudioEnablePrompt();
        return;
    }

    const audio = document.getElementById('dashboard-tts-audio');

    try {
        // Base64-Audio zu Blob konvertieren
        const audioData = data.audioData;
        const audioBlob = base64ToBlob(audioData, 'audio/mpeg');
        const audioUrl = URL.createObjectURL(audioBlob);

        audio.src = audioUrl;
        audio.volume = (data.volume || 80) / 100;
        audio.playbackRate = data.speed || 1.0;

        await routeDashboardAudio(audio, data);

        audio.play().then(() => {
            console.log('✅ [Dashboard] TTS started playing');
        }).catch(err => {
            console.error('❌ [Dashboard] TTS playback error:', err);
            // If playback fails due to autoplay policy, show prompt
            if (err.name === 'NotAllowedError') {
                console.log('⚠️ [Dashboard] Autoplay blocked, showing enable prompt');
                audioUnlocked = false; // Reset unlock state
                pendingTTSQueue.push(data);
                showAudioEnablePrompt();
            }
        });

        // URL nach Abspielen freigeben
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            console.log('✅ [Dashboard] TTS finished');
        };

        audio.onerror = (err) => {
            console.error('❌ [Dashboard] TTS audio error:', err);
            URL.revokeObjectURL(audioUrl);
        };

    } catch (error) {
        console.error('❌ [Dashboard] Error in playDashboardTTS:', error);
    }
}

/**
 * Get audio MIME type based on format
 */
function getAudioMimeType(format) {
    const mimeTypes = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'opus': 'audio/opus',
        'pcm': 'audio/pcm',
        'ogg': 'audio/ogg'
    };
    return mimeTypes[format] || 'audio/mpeg';
}

/**
 * Handle incoming TTS stream chunks
 */
function handleStreamChunk(data) {
    console.log(`🎵 [Dashboard] Stream chunk received for ${data.id}`, {
        chunkNumber: streamingBuffers.has(data.id) ? streamingBuffers.get(data.id).chunks.length + 1 : 1,
        isFirst: data.isFirst
    });

    // Check if audio is unlocked
    if (!audioUnlocked) {
        console.log('⚠️ [Dashboard] Audio not unlocked yet, ignoring stream chunk');
        return;
    }

    // Initialize buffer for this stream ID
    if (!streamingBuffers.has(data.id)) {
        streamingBuffers.set(data.id, {
            chunks: [],
            volume: null,
            speed: null,
            format: null,
            playbackStarted: false
        });
    }

    const buffer = streamingBuffers.get(data.id);

    // Decode Base64 chunk to Uint8Array
    const binaryString = atob(data.chunk);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    buffer.chunks.push(bytes);

    // Store metadata from first chunk
    if (data.isFirst) {
        buffer.volume = data.volume;
        buffer.speed = data.speed;
        buffer.format = data.format || 'mp3';  // Store format
        buffer.source = data.source || null;
        console.log(`🎵 [Dashboard] Stream started for ${data.id}`, {
            volume: buffer.volume,
            speed: buffer.speed,
            format: buffer.format,
            source: buffer.source
        });
    }
}

/**
 * Handle stream end event - combine chunks and play audio
 */
function handleStreamEnd(data) {
    console.log(`🎵 [Dashboard] Stream ended for ${data.id}`, {
        totalChunks: data.totalChunks,
        totalBytes: data.totalBytes
    });

    const buffer = streamingBuffers.get(data.id);
    if (!buffer) {
        console.warn(`⚠️ [Dashboard] No buffer found for stream ${data.id}`);
        return;
    }

    if (buffer.playbackStarted) {
        console.log(`⚠️ [Dashboard] Playback already started for ${data.id}`);
        return;
    }

    buffer.playbackStarted = true;
    playStreamingAudio(data.id, data.source || buffer.source || null);
}

/**
 * Combine stream chunks and play as audio
 */
async function playStreamingAudio(id, source = null) {
    const buffer = streamingBuffers.get(id);
    if (!buffer || buffer.chunks.length === 0) {
        console.warn(`⚠️ [Dashboard] No chunks to play for ${id}`);
        streamingBuffers.delete(id);
        return;
    }

    try {
        console.log(`🎵 [Dashboard] Playing streaming audio for ${id}`, {
            chunkCount: buffer.chunks.length,
            format: buffer.format
        });

        // Combine all chunks into a single Uint8Array
        const totalLength = buffer.chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of buffer.chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }

        // Create blob with correct MIME type based on format
        const mimeType = getAudioMimeType(buffer.format);
        const blob = new Blob([combined], { type: mimeType });
        const audioUrl = URL.createObjectURL(blob);

        // Get audio element and configure playback
        const audio = document.getElementById('dashboard-tts-audio');
        if (!audio) {
            console.error('❌ [Dashboard] Audio element not found');
            streamingBuffers.delete(id);
            return;
        }

        // Set playback properties BEFORE setting src for better compatibility
        audio.volume = (buffer.volume || 80) / 100;
        audio.playbackRate = buffer.speed || 1.0;
        audio.src = audioUrl;

        await routeDashboardAudio(audio, { source: source || buffer.source });

        // Start playback
        audio.play().then(() => {
            console.log(`✅ [Dashboard] Streaming TTS started playing for ${id}`);
        }).catch(err => {
            console.error(`❌ [Dashboard] Streaming TTS playback error for ${id}:`, err);
            URL.revokeObjectURL(audioUrl);
            streamingBuffers.delete(id);
        });

        // Clean up after playback
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            streamingBuffers.delete(id);
            console.log(`✅ [Dashboard] Streaming TTS finished for ${id}`);
        };

        audio.onerror = (err) => {
            console.error(`❌ [Dashboard] Streaming TTS audio error for ${id}:`, err);
            URL.revokeObjectURL(audioUrl);
            streamingBuffers.delete(id);
        };

    } catch (error) {
        console.error(`❌ [Dashboard] Error in playStreamingAudio for ${id}:`, error);
        streamingBuffers.delete(id);
    }
}


/**
 * Base64 zu Blob konvertieren (für TTS)
 */
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

// ========== AUTO-START FUNCTIONALITY ==========

/**
 * Load auto-start status and platform info
 */
async function loadAutoStartSettings() {
    try {
        // Load platform info
        const platformResponse = await fetch('/api/autostart/platform');
        const platformData = await platformResponse.json();

        if (platformData.success) {
            const platformName = document.getElementById('autostart-platform-name');
            const platformMethod = document.getElementById('autostart-platform-method');
            const supported = document.getElementById('autostart-supported');

            if (platformName) platformName.textContent = platformData.name || 'Unknown';
            if (platformMethod) platformMethod.textContent = platformData.method || 'Unknown';
            if (supported) supported.textContent = platformData.supported ? '✅ Yes' : '❌ No';
        }

        // Load status
        const statusResponse = await fetch('/api/autostart/status');
        const statusData = await statusResponse.json();

        if (statusData.success) {
            const checkbox = document.getElementById('autostart-enabled');
            if (checkbox) {
                checkbox.checked = statusData.enabled;
            }

            const statusText = statusData.enabled ? '✅ Enabled' : '❌ Disabled';
            const statusElement = document.getElementById('autostart-status');
            if (statusElement) {
                statusElement.textContent = statusText;
                statusElement.className = statusData.enabled ? 'font-semibold text-green-400' : 'font-semibold text-gray-400';
            }
        }
    } catch (error) {
        console.error('Failed to load auto-start settings:', error);
        const statusElement = document.getElementById('autostart-status');
        if (statusElement) {
            statusElement.textContent = '❌ Error';
            statusElement.className = 'font-semibold text-red-400';
        }
    }
}

/**
 * Toggle auto-start
 */
async function toggleAutoStart(enabled) {
    try {
        const response = await fetch('/api/autostart/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, hidden: false })
        });

        const data = await response.json();

        if (data.success) {
            const statusText = enabled ? '✅ Enabled' : '❌ Disabled';
            document.getElementById('autostart-status').textContent = statusText;
            document.getElementById('autostart-status').className = enabled ? 'font-semibold text-green-400' : 'font-semibold text-gray-400';

            // Show success message
            showNotification(
                enabled ? 'Auto-start enabled' : 'Auto-start disabled',
                enabled ? 'Application will start automatically on boot' : 'Auto-start disabled',
                'success'
            );
        } else {
            // Revert checkbox
            document.getElementById('autostart-enabled').checked = !enabled;
            showNotification('Error', data.error || 'Failed to toggle auto-start', 'error');
        }
    } catch (error) {
        console.error('Failed to toggle auto-start:', error);
        // Revert checkbox
        document.getElementById('autostart-enabled').checked = !enabled;
        showNotification('Error', 'Failed to toggle auto-start: ' + error.message, 'error');
    }
}

// REMOVED: Duplicate DOMContentLoaded listener consolidated into main initialization above
// NOTE: Settings loading is now handled by navigation.js when view switches to 'settings'
// Event listeners moved to initializeButtons() function for proper consolidation

// ========== PRESET IMPORT/EXPORT FUNCTIONALITY ==========

/**
 * Export configuration preset
 */
async function exportPreset() {
    try {
        const name = document.getElementById('preset-name').value || 'My Preset';
        const description = document.getElementById('preset-description').value || '';

        const options = {
            name,
            description,
            includeSettings: document.getElementById('export-settings').checked,
            includeFlows: document.getElementById('export-flows').checked,
            includeAlerts: document.getElementById('export-alerts').checked,
            includeGiftSounds: document.getElementById('export-gift-sounds').checked,
            includeVoiceMappings: document.getElementById('export-voice-mappings').checked,
            includePluginConfigs: document.getElementById('export-plugin-configs').checked,
        };

        showNotification('Exporting...', 'Creating preset file...', 'info');

        const response = await fetch('/api/presets/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });

        const data = await response.json();

        if (data.success) {
            // Download as JSON file
            const blob = new Blob([JSON.stringify(data.preset, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showNotification('Success', 'Preset exported successfully!', 'success');

            // Clear form
            document.getElementById('preset-name').value = '';
            document.getElementById('preset-description').value = '';
        } else {
            showNotification('Error', data.error || 'Failed to export preset', 'error');
        }
    } catch (error) {
        console.error('Failed to export preset:', error);
        showNotification('Error', 'Failed to export preset: ' + error.message, 'error');
    }
}

/**
 * Import configuration preset
 */
async function importPreset() {
    try {
        const fileInput = document.getElementById('preset-file-input');
        const file = fileInput.files[0];

        if (!file) {
            showNotification('Error', 'Please select a preset file', 'error');
            return;
        }

        showNotification('Importing...', 'Loading preset file...', 'info');

        // Read file
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const preset = JSON.parse(e.target.result);

                const options = {
                    overwrite: document.getElementById('import-overwrite').checked,
                    createBackup: document.getElementById('import-backup').checked,
                };

                const response = await fetch('/api/presets/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ preset, options })
                });

                const data = await response.json();

                if (data.success) {
                    let message = 'Preset imported successfully!\n\n';
                    message += 'Imported: ' + Object.keys(data.imported).join(', ');

                    if (Object.keys(data.errors).length > 0) {
                        message += '\n\nErrors: ' + Object.keys(data.errors).join(', ');
                    }

                    showNotification('Success', message, 'success');

                    // Clear file input
                    fileInput.value = '';

                    // Suggest reload
                    if (confirm('Preset imported! Would you like to reload the page to see changes?')) {
                        location.reload();
                    }
                } else {
                    showNotification('Error', data.error || 'Failed to import preset', 'error');
                }
            } catch (parseError) {
                console.error('Failed to parse preset file:', parseError);
                showNotification('Error', 'Invalid preset file format', 'error');
            }
        };

        reader.onerror = () => {
            showNotification('Error', 'Failed to read file', 'error');
        };

        reader.readAsText(file);
    } catch (error) {
        console.error('Failed to import preset:', error);
        showNotification('Error', 'Failed to import preset: ' + error.message, 'error');
    }
}

/**
 * Show notification (using browser alert for now, can be replaced with better UI)
 */
function showNotification(title, message, type) {
    // Simple alert for now - can be replaced with a toast notification system
    if (type === 'error') {
        alert(`❌ ${title}\n\n${message}`);
    } else if (type === 'success') {
        alert(`✅ ${title}\n\n${message}`);
    } else {
        alert(`ℹ️ ${title}\n\n${message}`);
    }
}

// ========== RESOURCE MONITOR SETTINGS (REMOVED - Plugin no longer exists) ==========

/**
 * Load resource monitor settings - DISABLED (plugin removed)
 */
/*
async function loadResourceMonitorSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        // Get all elements with null checks
        const elements = {
            enabled: document.getElementById('resource-monitor-enabled'),
            interval: document.getElementById('resource-monitor-interval'),
            showCpu: document.getElementById('resource-monitor-show-cpu'),
            showRam: document.getElementById('resource-monitor-show-ram'),
            showGpu: document.getElementById('resource-monitor-show-gpu'),
            cpuYellow: document.getElementById('cpu-warning-yellow'),
            cpuRed: document.getElementById('cpu-warning-red'),
            ramThreshold: document.getElementById('ram-warning-threshold'),
            historyLength: document.getElementById('resource-monitor-history-length'),
            notifications: document.getElementById('resource-monitor-notifications'),
            intervalLabel: document.getElementById('resource-monitor-interval-label')
        };

        // Load settings into UI with null checks
        if (elements.enabled) elements.enabled.checked = settings.resource_monitor_enabled === 'true';
        if (elements.interval) elements.interval.value = settings.resource_monitor_interval || '1000';
        if (elements.showCpu) elements.showCpu.checked = settings.resource_monitor_show_cpu !== 'false';
        if (elements.showRam) elements.showRam.checked = settings.resource_monitor_show_ram !== 'false';
        if (elements.showGpu) elements.showGpu.checked = settings.resource_monitor_show_gpu !== 'false';
        if (elements.cpuYellow) elements.cpuYellow.value = settings.cpu_warning_yellow || '5';
        if (elements.cpuRed) elements.cpuRed.value = settings.cpu_warning_red || '8';
        if (elements.ramThreshold) elements.ramThreshold.value = settings.ram_warning_threshold || '90';
        if (elements.historyLength) elements.historyLength.value = settings.resource_monitor_history_length || '60';
        if (elements.notifications) elements.notifications.checked = settings.resource_monitor_notifications !== 'false';

        // Update interval label
        if (elements.intervalLabel) {
            const intervalValue = parseInt(settings.resource_monitor_interval || '1000');
            elements.intervalLabel.textContent = (intervalValue / 1000).toFixed(1) + 's';
        }

    } catch (error) {
        console.error('Error loading resource monitor settings:', error);
    }
}
*/

/**
 * Save resource monitor settings - DISABLED (plugin removed)
 */
/*
async function saveResourceMonitorSettings() {
    // Get all elements with null checks
    const elements = {
        enabled: document.getElementById('resource-monitor-enabled'),
        interval: document.getElementById('resource-monitor-interval'),
        showCpu: document.getElementById('resource-monitor-show-cpu'),
        showRam: document.getElementById('resource-monitor-show-ram'),
        showGpu: document.getElementById('resource-monitor-show-gpu'),
        cpuYellow: document.getElementById('cpu-warning-yellow'),
        cpuRed: document.getElementById('cpu-warning-red'),
        ramThreshold: document.getElementById('ram-warning-threshold'),
        historyLength: document.getElementById('resource-monitor-history-length'),
        notifications: document.getElementById('resource-monitor-notifications')
    };

    // Verify all elements exist before saving
    if (!elements.enabled || !elements.interval || !elements.showCpu || !elements.showRam) {
        console.error('Resource monitor settings form elements not found');
        return;
    }

    const newSettings = {
        resource_monitor_enabled: elements.enabled.checked ? 'true' : 'false',
        resource_monitor_interval: elements.interval.value,
        resource_monitor_show_cpu: elements.showCpu.checked ? 'true' : 'false',
        resource_monitor_show_ram: elements.showRam.checked ? 'true' : 'false',
        resource_monitor_show_gpu: elements.showGpu ? elements.showGpu.checked ? 'true' : 'false' : 'false',
        cpu_warning_yellow: elements.cpuYellow ? elements.cpuYellow.value : '5',
        cpu_warning_red: elements.cpuRed ? elements.cpuRed.value : '8',
        ram_warning_threshold: elements.ramThreshold ? elements.ramThreshold.value : '90',
        resource_monitor_history_length: elements.historyLength ? elements.historyLength.value : '60',
        resource_monitor_notifications: elements.notifications ? elements.notifications.checked ? 'true' : 'false' : 'false'
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ Resource Monitor settings saved successfully!');
        } else {
            alert('❌ Error saving settings: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving resource monitor settings:', error);
        alert('❌ Error saving Resource Monitor settings!');
    }
}
*/

// ========== OSC-BRIDGE SETTINGS ==========
async function loadOSCBridgeSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        // Load OSC-Bridge enabled setting
        const oscBridgeEnabled = document.getElementById('osc-bridge-enabled');
        if (oscBridgeEnabled) {
            oscBridgeEnabled.checked = settings.osc_bridge_enabled === 'true';
        }

    } catch (error) {
        console.error('Error loading OSC-Bridge settings:', error);
    }
}

// ========== TIKTOK CONNECTION SETTINGS ==========

// Load TikTok settings on page load
async function loadTikTokSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        // Load Euler API Key
        const eulerApiKeyInput = document.getElementById('tiktok-euler-api-key');
        if (eulerApiKeyInput) {
            eulerApiKeyInput.value = settings.tiktok_euler_api_key || '';
        }

        // Load Auto-Reconnect checkbox
        const autoReconnectCheckbox = document.getElementById('tiktok-auto-reconnect');
        if (autoReconnectCheckbox) {
            autoReconnectCheckbox.checked = settings.tiktok_auto_reconnect !== 'false'; // Default to true
        }

        // Load Enable Euler Fallbacks checkbox
        const eulerFallbacksCheckbox = document.getElementById('tiktok-enable-euler-fallbacks');
        if (eulerFallbacksCheckbox) {
            eulerFallbacksCheckbox.checked = settings.tiktok_enable_euler_fallbacks === 'true';
        }

        // Load Connect with Unique ID checkbox
        const connectUniqueIdCheckbox = document.getElementById('tiktok-connect-with-unique-id');
        if (connectUniqueIdCheckbox) {
            connectUniqueIdCheckbox.checked = settings.tiktok_connect_with_unique_id === 'true';
        }

        // Load data source status (eulerstream vs tikfinity)
        await loadDataSourceStatus();
    } catch (error) {
        console.error('Error loading TikTok settings:', error);
    }
}

// Save TikTok settings
async function saveTikTokSettings() {
    try {
        const eulerApiKey = document.getElementById('tiktok-euler-api-key').value.trim();
        const autoReconnect = document.getElementById('tiktok-auto-reconnect').checked;
        const enableEulerFallbacks = document.getElementById('tiktok-enable-euler-fallbacks').checked;
        const connectWithUniqueId = document.getElementById('tiktok-connect-with-unique-id').checked;

        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tiktok_euler_api_key: eulerApiKey,
                tiktok_auto_reconnect: autoReconnect ? 'true' : 'false',
                tiktok_enable_euler_fallbacks: enableEulerFallbacks ? 'true' : 'false',
                tiktok_connect_with_unique_id: connectWithUniqueId ? 'true' : 'false'
            })
        });

        const result = await response.json();

        if (result.success) {
            alert('✅ TikTok Einstellungen gespeichert!\n\nDie Änderungen werden bei der nächsten Verbindung zu TikTok wirksam.\nWenn bereits verbunden, bitte trennen und erneut verbinden.');
        } else {
            alert('❌ Fehler beim Speichern: ' + (result.error || 'Unbekannter Fehler'));
        }
    } catch (error) {
        console.error('Error saving TikTok settings:', error);
        alert('❌ Fehler beim Speichern der Einstellungen');
    }
}

// Set up event listener for save button
const saveTikTokSettingsBtn = document.getElementById('save-tiktok-settings-btn');
if (saveTikTokSettingsBtn) {
    saveTikTokSettingsBtn.addEventListener('click', saveTikTokSettings);
}

// Load TikTok settings when page loads
if (typeof loadSettings === 'function') {
    const originalLoadSettings = loadSettings;
    window.loadSettings = async function() {
        await originalLoadSettings();
        await loadTikTokSettings();
    };
} else {
    // If loadSettings doesn't exist, just call loadTikTokSettings directly
    document.addEventListener('DOMContentLoaded', loadTikTokSettings);
}

// ========== SESSION EXTRACTOR ==========

// Load session status
async function loadSessionStatus() {
    try {
        const response = await fetch('/api/session/status');
        const status = await response.json();

        const statusContainer = document.getElementById('session-status-container');
        const statusText = document.getElementById('session-status-text');

        // Update the new SessionID status panel in TikTok connection section
        const sessionPanel = document.getElementById('session-status-panel');
        const sessionMethod = document.getElementById('session-method');
        const sessionExtractedAt = document.getElementById('session-extracted-at');

        if (sessionPanel && sessionMethod && sessionExtractedAt) {
            if (status.hasSession) {
                sessionPanel.style.display = 'block';
                sessionPanel.style.background = 'rgba(34, 197, 94, 0.1)';
                sessionPanel.style.borderColor = 'rgba(34, 197, 94, 0.3)';
                sessionMethod.textContent = status.method || 'Eulerstream';
                sessionExtractedAt.textContent = new Date(status.extractedAt).toLocaleString('de-DE');
            } else {
                sessionPanel.style.display = 'block';
                sessionPanel.style.background = 'rgba(234, 179, 8, 0.1)';
                sessionPanel.style.borderColor = 'rgba(234, 179, 8, 0.3)';
                sessionMethod.textContent = 'Not configured';
                sessionExtractedAt.textContent = '--';
            }
        }

        // Check if elements exist before accessing them (legacy status display)
        if (!statusContainer || !statusText) {
            return;
        }

        if (status.hasSession) {
            statusContainer.className = 'alert alert-success';
            statusText.innerHTML = `✅ Session-ID aktiv: ${status.sessionId}<br>` +
                                  `Extrahiert am: ${new Date(status.extractedAt).toLocaleString('de-DE')}`;
        } else {
            statusContainer.className = 'alert alert-info';
            statusText.textContent = 'ℹ️ Keine Session-ID konfiguriert';
        }
    } catch (error) {
        console.error('Failed to load session status:', error);
    }
}

// Extract session (manual login with browser)
document.getElementById('extract-session-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('extract-session-btn');
    const originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2"></i> Browser öffnet...';
    lucide.createIcons();

    showNotification('🌐 Browser wird geöffnet. Bitte logge dich in TikTok ein (Browser bleibt bis zu 5 Minuten offen).', 'info');

    try {
        const response = await fetch('/api/session/extract-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success) {
            showNotification('✅ Session-ID erfolgreich extrahiert! Login für nächstes Mal gespeichert.', 'success');
            await loadSessionStatus();
        } else {
            if (result.message && result.message.includes('not secure')) {
                showNotification('⚠️ TikTok blockiert automatisierte Browser. Bitte verwenden Sie "Import SessionID" stattdessen.', 'warning');
            } else {
                showNotification(`❌ Fehler: ${result.message}`, 'error');
            }
        }
    } catch (error) {
        console.error('Manual session extraction error:', error);
        showNotification('❌ Fehler bei der manuellen Session-Extraktion', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        lucide.createIcons();
    }
});

// Import SessionID manually from browser cookies
document.getElementById('import-session-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('session-import-modal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('import-sessionid-input').value = '';
        document.getElementById('import-tttargetidc-input').value = '';
        document.getElementById('import-sessionid-input').focus();
    }
});

// Cancel import
document.getElementById('cancel-import-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('session-import-modal');
    if (modal) {
        modal.classList.remove('active');
    }
});

// Confirm import
document.getElementById('confirm-import-btn')?.addEventListener('click', async () => {
    const sessionId = document.getElementById('import-sessionid-input').value.trim();
    const ttTargetIdc = document.getElementById('import-tttargetidc-input').value.trim();

    if (!sessionId) {
        showNotification('❌ Bitte SessionID eingeben', 'error');
        return;
    }

    const btn = document.getElementById('confirm-import-btn');
    const originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2"></i> Importiere...';
    lucide.createIcons();

    try {
        const response = await fetch('/api/session/import-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: sessionId,
                ttTargetIdc: ttTargetIdc || null
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('✅ Session-ID erfolgreich importiert!', 'success');
            await loadSessionStatus();
            document.getElementById('session-import-modal').classList.remove('active');
        } else {
            showNotification(`❌ Fehler: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Manual session import error:', error);
        showNotification('❌ Fehler beim Importieren der Session-ID', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        lucide.createIcons();
    }
});

// Close import modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('session-import-modal');
        if (modal && modal.classList.contains('active')) {
            modal.classList.remove('active');
        }
    }
});

// Extract session (manual login)
document.getElementById('extract-session-manual-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('extract-session-manual-btn');
    const originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2"></i> Browser öffnet...';
    lucide.createIcons();

    showNotification('🌐 Browser wird geöffnet. Bitte logge dich in TikTok ein.', 'info');

    try {
        const response = await fetch('/api/session/extract-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success) {
            showNotification('✅ Session-ID erfolgreich extrahiert!', 'success');
            await loadSessionStatus();
        } else {
            showNotification(`❌ Fehler: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Manual session extraction error:', error);
        showNotification('❌ Fehler bei der manuellen Session-Extraktion', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        lucide.createIcons();
    }
});

// Clear session
document.getElementById('clear-session-btn')?.addEventListener('click', async () => {
    if (!confirm('Möchtest du die gespeicherte Session-ID wirklich löschen?')) {
        return;
    }

    const btn = document.getElementById('clear-session-btn');
    const originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2"></i> Lösche...';
    lucide.createIcons();

    try {
        const response = await fetch('/api/session/clear', {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showNotification('✅ Session-ID gelöscht', 'success');
            await loadSessionStatus();
        } else {
            showNotification(`❌ Fehler: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Session clear error:', error);
        showNotification('❌ Fehler beim Löschen der Session', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        lucide.createIcons();
    }
});

// Test browser availability
document.getElementById('test-browser-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('test-browser-btn');
    const originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2"></i> Teste...';
    lucide.createIcons();

    try {
        const response = await fetch('/api/session/test-browser');
        const result = await response.json();

        if (result.available) {
            showNotification('✅ Browser-Automation verfügbar!', 'success');
        } else {
            showNotification(`⚠️ Browser nicht verfügbar: ${result.message}`, 'warning');
        }
    } catch (error) {
        console.error('Browser test error:', error);
        showNotification('❌ Fehler beim Browser-Test', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        lucide.createIcons();
    }
});

// Load session status when settings page is opened
document.addEventListener('DOMContentLoaded', () => {
    const settingsTab = document.querySelector('[data-page="settings"]');
    if (settingsTab) {
        settingsTab.addEventListener('click', () => {
            setTimeout(loadSessionStatus, 100);
        });
    }

    // Also load on page load if on settings page
    if (window.location.hash === '#settings' || !window.location.hash) {
        setTimeout(loadSessionStatus, 500);
    }
});

// ========== CONNECTION DIAGNOSTICS ==========

// Run diagnostics
document.getElementById('run-diagnostics-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('run-diagnostics-btn');
    const resultDiv = document.getElementById('diagnostics-result');
    const contentDiv = document.getElementById('diagnostics-content');

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2"></i> Läuft...';

    try {
        const username = document.getElementById('username-input').value || 'tiktok';
        const response = await fetch(`/api/diagnostics?username=${encodeURIComponent(username)}`);
        const diagnostics = await response.json();

        // Display results
        resultDiv.style.display = 'block';

        let html = '<div style="font-family: monospace; line-height: 1.6;">';

        // Euler API Key Status
        html += '<div style="margin-bottom: 1rem;"><strong>🔑 Euler API Key:</strong><br>';
        const keyInfo = diagnostics.eulerApiKey || {};
        if (keyInfo.activeKey) {
            const keyMode = keyInfo.usingFallback ? 'Fallback wird verwendet' : 'Eigener Key wird verwendet';
            html += `Quelle: ${keyMode}<br>`;
            html += `✅ Aktiv (${keyInfo.activeSource}): ${keyInfo.activeKey}<br>`;
        } else {
            html += '❌ Nicht konfiguriert<br>';
        }
        html += '</div>';

        // TikTok API Test
        html += '<div style="margin-bottom: 1rem;"><strong>🌐 TikTok API:</strong><br>';
        const tiktokApi = diagnostics.tiktokApi || {};
        if (tiktokApi.success) {
            html += `✅ Erreichbar (${tiktokApi.responseTime}ms)<br>`;
        } else {
            html += `❌ Fehler: ${tiktokApi.error || 'Nicht erreichbar'}<br>`;
        }
        html += '</div>';

        // Euler WebSocket Test
        html += '<div style="margin-bottom: 1rem;"><strong>🔌 Euler WebSocket:</strong><br>';
        const eulerWebSocket = diagnostics.eulerWebSocket || {};
        if (eulerWebSocket.success) {
            html += `✅ Verbindung OK (${eulerWebSocket.responseTime}ms)<br>`;
        } else {
            html += `⚠️ ${eulerWebSocket.error || 'Nicht verbunden'}<br>`;
        }
        html += '</div>';

        // Configuration
        html += '<div style="margin-bottom: 1rem;"><strong>⚙️ Konfiguration:</strong><br>';
        const connectionConfig = diagnostics.connectionConfig || {};
        html += `Fallback aktuell verwendet: ${keyInfo.usingFallback ? 'Ja' : 'Nein'}<br>`;
        html += `Euler Fallbacks: ${connectionConfig.enableEulerFallbacks ? '✅ Aktiviert' : '❌ Deaktiviert'}<br>`;
        html += `Connect with Unique ID: ${connectionConfig.connectWithUniqueId ? '✅ Aktiviert' : '❌ Deaktiviert'}<br>`;
        html += `Timeout: ${connectionConfig.connectionTimeout ? connectionConfig.connectionTimeout / 1000 : 30}s<br>`;
        html += '</div>';

        // Recent Attempts
        if (diagnostics.recentAttempts && diagnostics.recentAttempts.length > 0) {
            html += '<div style="margin-bottom: 1rem;"><strong>📜 Letzte Verbindungsversuche:</strong><br>';
            diagnostics.recentAttempts.slice(0, 5).forEach(attempt => {
                const icon = attempt.success ? '✅' : '❌';
                const time = new Date(attempt.timestamp).toLocaleTimeString('de-DE');
                html += `${icon} ${time} - @${attempt.username}`;
                if (!attempt.success) {
                    html += ` (${attempt.errorType})`;
                }
                html += '<br>';
            });
            html += '</div>';
        }

        // Recommendations
        if (diagnostics.recommendations && diagnostics.recommendations.length > 0) {
            html += '<div><strong>💡 Empfehlungen:</strong><br>';
            diagnostics.recommendations.forEach(rec => {
                const icon = rec.severity === 'error' ? '🔴' : rec.severity === 'warning' ? '🟡' : '🔵';
                html += `${icon} ${rec.message}<br>`;
                html += `<span style="color: var(--text-secondary); font-size: 0.9em;">→ ${rec.action}</span><br><br>`;
            });
            html += '</div>';
        }

        html += '</div>';
        contentDiv.innerHTML = html;

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

    } catch (error) {
        resultDiv.style.display = 'block';
        contentDiv.innerHTML = `<div style="color: var(--error);">❌ Fehler: ${error.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="activity"></i> Verbindungsdiagnose ausführen';
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
});

// Load connection health on page load
async function loadConnectionHealth() {
    try {
        const response = await fetch('/api/connection-health');
        const health = await response.json();

        const healthDiv = document.getElementById('connection-health');
        const statusSpan = document.getElementById('health-status');
        const detailsDiv = document.getElementById('health-details');

        if (healthDiv && statusSpan && detailsDiv) {
            healthDiv.style.display = 'block';

            // Set status color
            let bgColor = 'var(--bg-secondary)';
            let textColor = 'var(--text-primary)';

            switch (health.status) {
                case 'healthy':
                    bgColor = 'rgba(34, 197, 94, 0.1)';
                    textColor = 'rgb(34, 197, 94)';
                    break;
                case 'warning':
                    bgColor = 'rgba(234, 179, 8, 0.1)';
                    textColor = 'rgb(234, 179, 8)';
                    break;
                case 'degraded':
                    bgColor = 'rgba(249, 115, 22, 0.1)';
                    textColor = 'rgb(249, 115, 22)';
                    break;
                case 'critical':
                    bgColor = 'rgba(239, 68, 68, 0.1)';
                    textColor = 'rgb(239, 68, 68)';
                    break;
            }

            healthDiv.style.background = bgColor;
            statusSpan.style.color = textColor;
            statusSpan.textContent = health.message;

            let details = '';
            if (health.eulerKeyConfigured) {
                details += `Euler Key: ${health.eulerKeySource}`;
            } else {
                details += 'Kein Euler Key konfiguriert';
            }

            if (health.recentAttempts && health.recentAttempts.length > 0) {
                const failures = health.recentAttempts.filter(a => !a.success).length;
                details += ` | ${failures}/${health.recentAttempts.length} fehlgeschlagen`;
            }

            detailsDiv.textContent = details;

            // Re-initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    } catch (error) {
        console.error('Failed to load connection health:', error);
    }
}

// Load health on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(loadConnectionHealth, 1000);
});

function showFallbackKeyConsentDialog(data = {}) {
    if (document.getElementById('fallback-key-consent-overlay')) {
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'fallback-key-consent-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 10001; display: flex;
            align-items: center; justify-content: center; padding: 24px;
            background: rgba(0, 0, 0, 0.86); backdrop-filter: blur(6px);
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            width: min(620px, 100%); border: 2px solid #f59e0b; border-radius: 16px;
            padding: 32px; background: #111827; box-shadow: 0 24px 72px rgba(0,0,0,.6);
        `;
        dialog.innerHTML = `
            <div style="font-size:48px;text-align:center">&#9888;&#65039;</div>
            <h2 style="margin:12px 0;color:#fbbf24;font-size:24px;text-align:center">Eulerstream Backup-Key</h2>
            <p style="color:#e5e7eb;line-height:1.6">Du nutzt einen gemeinsamen Eulerstream Backup-Key. Bitte erstelle deinen eigenen Key und trage ihn in den Einstellungen ein.</p>
            <p style="color:#9ca3af;line-height:1.6;margin-top:10px">Gemeinsame Keys sind begrenzt und k&ouml;nnen jederzeit ersch&ouml;pft sein.</p>
            <a href="https://www.eulerstream.com" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:14px;color:#93c5fd;text-decoration:underline">Eigenen Eulerstream Key erstellen</a>
            <div id="fallback-key-consent-countdown" style="min-height:28px;margin:22px 0 0;color:#fbbf24;font-weight:600"></div>
            <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:24px">
                <button type="button" id="fallback-key-consent-cancel" class="px-4 py-2 rounded bg-gray-700 text-gray-100">Abbrechen</button>
                <button type="button" id="fallback-key-consent-confirm" class="px-4 py-2 rounded bg-amber-500 text-gray-950 font-semibold">OK, trotzdem verbinden</button>
            </div>
        `;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const cleanup = (accepted) => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            resolve(accepted);
        };
        const cancelButton = dialog.querySelector('#fallback-key-consent-cancel');
        const confirmButton = dialog.querySelector('#fallback-key-consent-confirm');
        const countdown = dialog.querySelector('#fallback-key-consent-countdown');
        cancelButton.addEventListener('click', () => cleanup(false));
        confirmButton.addEventListener('click', () => {
            const delayMs = Number(data.confirmationDelayMs) || 3000;
            let remaining = Math.ceil(delayMs / 1000);
            confirmButton.disabled = true;
            cancelButton.disabled = true;
            confirmButton.style.opacity = '0.6';
            countdown.textContent = `Verbindung wird in ${remaining} Sekunden gestartet ...`;
            const interval = setInterval(() => {
                remaining--;
                if (remaining > 0) {
                    countdown.textContent = `Verbindung wird in ${remaining} Sekunden gestartet ...`;
                    return;
                }
                clearInterval(interval);
                cleanup(true);
            }, 1000);
        });
    });
}

// ========== FALLBACK API KEY WARNING ==========
function showFallbackKeyWarning(data) {
    // Check if warning is already displayed
    if (document.getElementById('fallback-key-overlay')) {
        console.log('Fallback key warning already displayed, skipping duplicate');
        return;
    }

    // Create overlay element
    const overlay = document.createElement('div');
    overlay.id = 'fallback-key-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        backdrop-filter: blur(5px);
    `;

    // Create warning box
    const warningBox = document.createElement('div');
    warningBox.style.cssText = `
        background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
        border: 2px solid #f59e0b;
        border-radius: 12px;
        padding: 40px;
        max-width: 600px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: slideIn 0.3s ease-out;
    `;

    // Create countdown element
    const countdownSeconds = Math.floor((data.duration || 10000) / 1000);
    let remainingSeconds = countdownSeconds;

    warningBox.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 64px; margin-bottom: 20px;">⚠️</div>
            <h2 style="color: #f59e0b; font-size: 28px; margin-bottom: 20px; font-weight: bold;">
                Fallback API Key wird verwendet
            </h2>
            <p style="color: #d1d5db; font-size: 18px; line-height: 1.6; margin-bottom: 20px;">
                Du verwendest einen gemeinsamen Fallback-Key. Dies ist nur eine Notlösung!
            </p>
            <p style="color: #9ca3af; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                Bitte hole dir deinen eigenen <strong>kostenlosen</strong> API Key von
                <a href="https://www.eulerstream.com" target="_blank" style="color: #60a5fa; text-decoration: underline;">eulerstream.com</a>
                und speichere ihn in den Einstellungen.
            </p>
            <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                <p style="color: #fbbf24; font-size: 14px; margin: 0;">
                    <strong>Hinweis:</strong> Dieser Fallback-Key wird von allen Nutzern geteilt und könnte jederzeit deaktiviert werden.
                </p>
            </div>
            <div style="font-size: 36px; color: #f59e0b; font-weight: bold; margin-top: 20px;" id="countdown-timer">
                ${remainingSeconds}
            </div>
            <p style="color: #6b7280; font-size: 14px; margin-top: 10px;">
                Dieses Fenster schließt sich automatisch...
            </p>
        </div>
    `;

    overlay.appendChild(warningBox);
    document.body.appendChild(overlay);

    // Add animation keyframe
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(-30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    document.head.appendChild(style);

    // Countdown timer
    const countdownTimer = document.getElementById('countdown-timer');
    const countdownInterval = setInterval(() => {
        remainingSeconds--;
        if (countdownTimer) {
            countdownTimer.textContent = remainingSeconds;
        }
        if (remainingSeconds <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);

    // Auto-remove after duration
    setTimeout(() => {
        clearInterval(countdownInterval);
        if (overlay && overlay.parentNode) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease-out';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300);
        }
    }, data.duration || 10000);
}

// ========== EULER BACKUP KEY WARNING ==========
function showEulerBackupKeyWarning(data) {
    // Check if warning is already displayed
    if (document.getElementById('euler-backup-key-overlay')) {
        console.log('Euler backup key warning already displayed, skipping duplicate');
        return;
    }

    // Create overlay element - non-dismissible
    const overlay = document.createElement('div');
    overlay.id = 'euler-backup-key-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(10px);
        user-select: none;
    `;

    // Prevent any clicks from dismissing the overlay
    overlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    // Create warning box
    const warningBox = document.createElement('div');
    warningBox.style.cssText = `
        background: linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%);
        border: 3px solid #dc2626;
        border-radius: 16px;
        padding: 50px;
        max-width: 700px;
        box-shadow: 0 25px 80px rgba(220, 38, 38, 0.6);
        animation: slideInBounce 0.5s ease-out;
    `;

    // Create countdown element
    const countdownSeconds = Math.floor((data.duration || 10000) / 1000);
    let remainingSeconds = countdownSeconds;

    warningBox.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 80px; margin-bottom: 30px; animation: pulse 2s infinite;">🚨</div>
            <h2 style="color: #fca5a5; font-size: 32px; margin-bottom: 25px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">
                Euler Backup Key Erkannt
            </h2>
            <p style="color: #fecaca; font-size: 20px; line-height: 1.8; margin-bottom: 25px; font-weight: 600;">
                Du verwendest den Euler Backup Key!
            </p>
            <p style="color: #fca5a5; font-size: 18px; line-height: 1.7; margin-bottom: 30px;">
                Dieser Key ist <strong>nur als Notfall-Backup</strong> gedacht und sollte <strong>nicht regulär verwendet werden</strong>.
            </p>
            <div style="background: rgba(220, 38, 38, 0.2); border: 2px solid #dc2626; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                <p style="color: #fef2f2; font-size: 16px; margin: 0; line-height: 1.6;">
                    <strong>⚠️ WICHTIG:</strong> Bitte hole dir deinen eigenen <strong>kostenlosen</strong> API Key von
                    <a href="https://www.eulerstream.com" target="_blank" style="color: #fbbf24; text-decoration: underline; font-weight: bold;">eulerstream.com</a>
                    und speichere ihn in den Einstellungen.
                </p>
            </div>
            <div style="background: rgba(0, 0, 0, 0.3); border-radius: 12px; padding: 25px; margin-bottom: 20px;">
                <p style="color: #f87171; font-size: 16px; margin: 0 0 15px 0; font-weight: 600;">
                    Verbindung wird in <span style="font-size: 48px; color: #dc2626; font-weight: bold; display: block; margin-top: 10px;" id="euler-countdown-timer">${remainingSeconds}</span> Sekunden hergestellt...
                </p>
            </div>
            <p style="color: #dc2626; font-size: 15px; margin-top: 15px; font-weight: 700; text-transform: uppercase;">
                ⚠️ Dieses Fenster kann nicht geschlossen werden ⚠️
            </p>
        </div>
    `;

    overlay.appendChild(warningBox);
    document.body.appendChild(overlay);

    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInBounce {
            0% {
                opacity: 0;
                transform: scale(0.7) translateY(-50px);
            }
            60% {
                opacity: 1;
                transform: scale(1.05) translateY(0);
            }
            100% {
                transform: scale(1) translateY(0);
            }
        }
        @keyframes pulse {
            0%, 100% {
                transform: scale(1);
                opacity: 1;
            }
            50% {
                transform: scale(1.1);
                opacity: 0.8;
            }
        }
    `;
    document.head.appendChild(style);

    // Countdown timer
    const countdownTimer = document.getElementById('euler-countdown-timer');
    const countdownInterval = setInterval(() => {
        remainingSeconds--;
        if (countdownTimer) {
            countdownTimer.textContent = remainingSeconds;
        }
        if (remainingSeconds <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);

    // Auto-remove after duration (non-dismissible during countdown)
    setTimeout(() => {
        clearInterval(countdownInterval);
        if (overlay && overlay.parentNode) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.5s ease-out';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 500);
        }
    }, data.duration || 10000);
}

// ========== USERNAME ALIASES ==========

/**
 * Load and render all username aliases for the active profile
 */
async function loadUsernameAliases() {
    try {
        const response = await fetch('/api/profiles/aliases');
        if (!response.ok) return;
        const result = await response.json();
        if (!result.success) return;

        renderUsernameAliases(result.aliases);
    } catch (error) {
        console.error('[Aliases] Error loading aliases:', error);
    }
}

/**
 * Render alias list into #alias-list
 * @param {Array} aliases
 */
function renderUsernameAliases(aliases) {
    const container = document.getElementById('alias-list');
    const emptyMsg = document.getElementById('alias-list-empty');
    if (!container) return;

    if (!aliases || aliases.length === 0) {
        if (emptyMsg) emptyMsg.style.display = '';
        container.innerHTML = '';
        if (emptyMsg) container.appendChild(emptyMsg);
        return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';

    const rows = aliases.map(alias => {
        const lastSeen = alias.last_seen_at
            ? new Date(alias.last_seen_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—';
        const addedAt = alias.added_at
            ? new Date(alias.added_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—';
        const isPrimary = alias.is_primary === 1 || alias.is_primary === true;

        return `
            <div class="alias-row flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg border border-gray-600/50 hover:border-gray-500/70 transition-colors"
                 data-alias-username="${escapeHtml(alias.username)}">
                <button
                    class="alias-star-btn text-lg flex-shrink-0 transition-colors ${isPrimary ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-300'}"
                    title="${isPrimary ? 'Haupt-Username (aktiv)' : 'Als Haupt-Username setzen'}"
                    data-action="alias-set-primary" data-username="${escapeHtml(alias.username)}"
                    ${isPrimary ? 'disabled' : ''}
                >⭐</button>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="font-mono font-semibold text-white">@${escapeHtml(alias.username)}</span>
                        ${isPrimary ? '<span class="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded">Haupt</span>' : ''}
                        ${alias.label ? `<span class="text-xs text-gray-400 truncate">${escapeHtml(alias.label)}</span>` : ''}
                    </div>
                    <div class="text-xs text-gray-500 mt-0.5">
                        Hinzugefügt: ${addedAt}
                        ${alias.last_seen_at ? ` · Zuletzt gesehen: ${lastSeen}` : ''}
                    </div>
                </div>
                <button
                    class="alias-delete-btn text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 p-1 rounded hover:bg-red-500/10"
                    title="Alias entfernen"
                    data-action="alias-remove" data-username="${escapeHtml(alias.username)}"
                >
                    <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                </button>
            </div>
        `;
    }).join('');

    container.innerHTML = rows;

    // Re-init lucide icons inside the new HTML
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Add a new username alias via the form inputs
 */
async function addUsernameAlias() {
    const usernameInput = document.getElementById('new-alias-username');
    const labelInput = document.getElementById('new-alias-label');
    if (!usernameInput) return;

    const username = usernameInput.value.trim().replace(/^@/, '');
    const label = labelInput ? labelInput.value.trim() : '';

    if (!username) {
        alert('Bitte einen TikTok-Username eingeben.');
        usernameInput.focus();
        return;
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        alert('Ungültiger Username. Erlaubt sind: Buchstaben, Zahlen, Punkt, Unterstrich, Bindestrich.');
        return;
    }

    const btn = document.getElementById('add-alias-btn');
    if (btn) btn.disabled = true;

    try {
        const response = await fetch('/api/profiles/aliases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, label: label || null, isPrimary: false })
        });
        const result = await response.json();

        if (result.success) {
            usernameInput.value = '';
            if (labelInput) labelInput.value = '';
            await loadUsernameAliases();
        } else {
            alert('Fehler: ' + (result.error || 'Unbekannter Fehler'));
        }
    } catch (error) {
        console.error('[Aliases] Error adding alias:', error);
        alert('Netzwerkfehler beim Hinzufügen.');
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Remove a username alias
 * @param {string} username
 */
async function removeUsernameAlias(username) {
    if (!confirm(`Username "@${username}" aus dem Profil entfernen?\n\nDas Profil wird bei diesem Usernamen nicht mehr automatisch erkannt.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/profiles/aliases/${encodeURIComponent(username)}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
            await loadUsernameAliases();
        } else {
            alert('Fehler beim Entfernen: ' + (result.error || 'Unbekannter Fehler'));
        }
    } catch (error) {
        console.error('[Aliases] Error removing alias:', error);
        alert('Netzwerkfehler beim Entfernen.');
    }
}

/**
 * Set a specific alias as the primary (current) username
 * @param {string} username
 */
async function setAliasAsPrimary(username) {
    try {
        const response = await fetch(`/api/profiles/aliases/${encodeURIComponent(username)}/primary`, {
            method: 'PATCH'
        });
        const result = await response.json();

        if (result.success) {
            await loadUsernameAliases();
        } else {
            alert('Fehler: ' + (result.error || 'Unbekannter Fehler'));
        }
    } catch (error) {
        console.error('[Aliases] Error setting primary alias:', error);
    }
}
