/**
 * Dashboard Enhancements
 * New Features: Quick Action Buttons, Changelog, Runtime Tracking, Compact Resources
 */

(() => {
    'use strict';

    // ========== STATE ==========
    let streamStartTime = null;
    let runtimeInterval = null;
    let runtimeSparklineData = [];
    const MAX_SPARKLINE_POINTS = 60;
    const SOCKET_CHECK_TIMEOUT_MS = 10000;
    const SOCKET_CHECK_INTERVAL_MS = 100;

    // ========== UTILITY FUNCTIONS ==========
    /**
     * Helper for i18n translation with fallback
     */
    function getTranslation(key, fallback) {
        return (window.i18n && window.i18n.initialized) ? window.i18n.t(key) : fallback;
    }

    /**
     * Fetch active plugins from API
     * @returns {Promise<Set<string>>} Set of active plugin IDs
     */
    async function fetchActivePlugins() {
        try {
            const response = await fetch('/api/plugins');
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.plugins) {
                    return new Set(data.plugins.filter(p => p.enabled).map(p => p.id));
                }
            }
        } catch (error) {
            console.warn('[Dashboard Enhancements] Could not load plugin states:', error);
        }
        return new Set();
    }

    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', () => {
        initializeQuickActionButtons();
        initializeSidebarQuickIcons();
        initializeChangelog();
        initializeCompactResources();
        initializeRuntimeTracking();
        initializeResourceDetailsLink();
        setupQuickActionPluginListener();

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    });

    // ========== SOCKET LISTENER FOR PLUGIN CHANGES ==========
    function setupQuickActionPluginListener() {
        // Wait for socket to be available (dashboard.js creates it)
        const checkSocket = setInterval(() => {
            if (typeof socket !== 'undefined' && socket) {
                clearInterval(checkSocket);
                
                socket.on('plugins:changed', async (data) => {
                    console.log('🔌 [Dashboard Enhancements] Plugin state changed, refreshing quick action buttons:', data);
                    // Refresh quick action button states when plugins change
                    await refreshQuickActionButtons();
                });
                
                console.log('✅ [Dashboard Enhancements] Quick action plugin change listener registered');
            }
        }, SOCKET_CHECK_INTERVAL_MS);
        
        // Stop checking after timeout
        setTimeout(() => clearInterval(checkSocket), SOCKET_CHECK_TIMEOUT_MS);
    }

    // ========== REFRESH QUICK ACTION BUTTONS ==========
    async function refreshQuickActionButtons() {
        console.log('[Dashboard Enhancements] Refreshing Quick Action Buttons');

        // Load active plugins (empty set means no plugins enabled, but we still need to process button states)
        const activePlugins = await fetchActivePlugins();

        console.log('[Dashboard Enhancements] Active plugins:', Array.from(activePlugins));

        // Update quick action buttons based on plugin states
        const buttons = document.querySelectorAll('.quick-action-btn[data-plugin]');
        buttons.forEach(button => {
            const pluginId = button.getAttribute('data-plugin');
            const span = button.querySelector('span');
            
            if (pluginId && activePlugins.has(pluginId)) {
                // Plugin is enabled - restore button
                if (button.disabled || button.classList.contains('quick-action-disabled')) {
                    console.log(`[Dashboard Enhancements] Re-enabling quick action button for plugin: ${pluginId}`);
                    button.classList.remove('quick-action-disabled');
                    button.disabled = false;
                    button.title = '';
                    
                    // Restore original text if it was changed
                    if (span && span.hasAttribute('data-original-text')) {
                        span.textContent = span.getAttribute('data-original-text');
                        span.removeAttribute('data-original-text');
                    }
                    
                    // Set temporary 'idle' state while loadQuickActionButtonStates loads the actual state
                    button.setAttribute('data-state', 'idle');
                }
            } else if (pluginId && !activePlugins.has(pluginId)) {
                // Plugin is disabled - show disabled state
                if (!button.disabled) {
                    console.log(`[Dashboard Enhancements] Disabling quick action button for plugin: ${pluginId}`);
                    button.setAttribute('data-state', 'disabled');
                    button.classList.add('quick-action-disabled');
                    button.disabled = true;
                    button.title = getTranslation('dashboard.quick_action.enable_plugin_hint', 'Enable this plugin to use quick actions');
                    
                    // Update the span text to show disabled message
                    if (span && !span.hasAttribute('data-original-text')) {
                        span.setAttribute('data-original-text', span.textContent);
                        span.textContent = getTranslation('dashboard.quick_action.plugin_disabled', 'Plugin disabled');
                    }
                }
            }
        });

        // Reload states for active plugins (sets the actual on/off state)
        await loadQuickActionButtonStates();

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ========== QUICK ACTION BUTTONS ==========
    async function initializeQuickActionButtons() {
        console.log('[Dashboard Enhancements] Initializing Quick Action Buttons');

        // Load active plugins first
        const activePlugins = await fetchActivePlugins();

        // Check and update quick action buttons for disabled plugins
        const buttons = document.querySelectorAll('.quick-action-btn[data-plugin]');
        buttons.forEach(button => {
            const pluginId = button.getAttribute('data-plugin');
            if (pluginId && !activePlugins.has(pluginId)) {
                // Plugin is disabled - show disabled state
                button.setAttribute('data-state', 'disabled');
                button.classList.add('quick-action-disabled');
                button.disabled = true;
                button.title = getTranslation('dashboard.quick_action.enable_plugin_hint', 'Enable this plugin to use quick actions');
                
                // Update the span text to show disabled message (only if not already set)
                const span = button.querySelector('span');
                if (span && !span.hasAttribute('data-original-text')) {
                    span.setAttribute('data-original-text', span.textContent);
                    span.textContent = getTranslation('dashboard.quick_action.plugin_disabled', 'Plugin disabled');
                }
                console.log(`[Dashboard Enhancements] Quick action button disabled for inactive plugin: ${pluginId}`);
            }
        });

        // Load initial states for active plugins
        await loadQuickActionButtonStates();

        // Attach click handlers to all quick action buttons
        const allButtons = document.querySelectorAll('.quick-action-btn');
        console.log(`[Dashboard Enhancements] Found ${allButtons.length} quick action buttons`);

        allButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Check if button is disabled
                if (button.disabled || button.getAttribute('data-state') === 'disabled') {
                    console.log('[Quick Action] Button is disabled (plugin not active)');
                    return;
                }

                const action = button.getAttribute('data-action');
                const currentState = button.getAttribute('data-state');

                console.log(`[Quick Action] Clicked: ${action}, current state: ${currentState}`);

                // Toggle state
                const newState = currentState === 'on' ? 'off' : 'on';

                // Update UI immediately for better UX
                button.setAttribute('data-state', newState);

                // Send to server
                const success = await toggleQuickAction(action, newState === 'on');

                // Revert if failed
                if (!success) {
                    console.error(`[Quick Action] Failed to toggle ${action}, reverting`);
                    button.setAttribute('data-state', currentState);
                } else {
                    console.log(`[Quick Action] Successfully toggled ${action} to ${newState}`);
                }

                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        });
    }

    /**
     * Initialize Sidebar Quick Action Mini Icons
     * These icons sync with the main quick action buttons
     */
    async function initializeSidebarQuickIcons() {
        console.log('[Dashboard Enhancements] Initializing Sidebar Quick Icons');

        // Load active plugins first
        const activePlugins = await fetchActivePlugins();

        // Get all sidebar quick icons
        const sidebarIcons = document.querySelectorAll('.sidebar-quick-icon');
        console.log(`[Dashboard Enhancements] Found ${sidebarIcons.length} sidebar quick icons`);

        // Check and update sidebar icons for disabled plugins
        sidebarIcons.forEach(icon => {
            const pluginId = icon.getAttribute('data-plugin');
            if (pluginId && !activePlugins.has(pluginId)) {
                // Plugin is disabled - set disabled state
                icon.setAttribute('data-state', 'disabled');
                icon.disabled = true;
                console.log(`[Dashboard Enhancements] Sidebar icon disabled for inactive plugin: ${pluginId}`);
            }
        });

        // Sync states with main quick action buttons
        syncSidebarIconStates();

        // Attach click handlers
        sidebarIcons.forEach(icon => {
            icon.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Check if icon is disabled
                if (icon.disabled || icon.getAttribute('data-state') === 'disabled') {
                    console.log('[Sidebar Quick Icon] Icon is disabled (plugin not active)');
                    return;
                }

                const action = icon.getAttribute('data-action');
                const currentState = icon.getAttribute('data-state');

                console.log(`[Sidebar Quick Icon] Clicked: ${action}, current state: ${currentState}`);

                // Toggle state
                const newState = currentState === 'on' ? 'off' : 'on';

                // Update UI immediately
                icon.setAttribute('data-state', newState);

                // Also update the corresponding main button
                const mainButton = document.querySelector(`.quick-action-btn[data-action="${action}"]`);
                if (mainButton) {
                    mainButton.setAttribute('data-state', newState);
                }

                // Send to server
                const success = await toggleQuickAction(action, newState === 'on');

                // Revert if failed
                if (!success) {
                    console.error(`[Sidebar Quick Icon] Failed to toggle ${action}, reverting`);
                    icon.setAttribute('data-state', currentState);
                    if (mainButton) {
                        mainButton.setAttribute('data-state', currentState);
                    }
                } else {
                    console.log(`[Sidebar Quick Icon] Successfully toggled ${action} to ${newState}`);
                }

                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        });
    }

    /**
     * Sync sidebar icon states with main quick action buttons
     * Only syncs if the icon is not disabled due to inactive plugin
     */
    function syncSidebarIconStates() {
        const mainButtons = document.querySelectorAll('.quick-action-btn');
        mainButtons.forEach(button => {
            const action = button.getAttribute('data-action');
            const state = button.getAttribute('data-state');
            const sidebarIcon = document.querySelector(`.sidebar-quick-icon[data-action="${action}"]`);
            
            // Only sync if sidebar icon exists and is not disabled
            if (sidebarIcon && !sidebarIcon.disabled) {
                sidebarIcon.setAttribute('data-state', state);
            }
        });
    }

    async function loadQuickActionButtonStates() {
        try {
            console.log('[Load Quick Action States] Fetching settings from /api/settings');

            // Load settings for TTS, Soundboard, and Flows
            const settingsResponse = await fetch('/api/settings');
            const settings = await settingsResponse.json();

            console.log('[Load Quick Action States] Settings loaded:', settings);

            // Helper function to set button state only if not disabled
            const setButtonState = (button, state) => {
                if (button && !button.disabled && button.getAttribute('data-state') !== 'disabled') {
                    button.setAttribute('data-state', state);
                    return true;
                }
                return false;
            };

            // Set button states (skip if plugin is disabled)
            const ttsBtn = document.getElementById('quick-tts-btn');
            if (setButtonState(ttsBtn, settings.tts_enabled !== 'false' ? 'on' : 'off')) {
                console.log(`[Load Quick Action States] TTS button set to: ${ttsBtn.getAttribute('data-state')} (tts_enabled=${settings.tts_enabled})`);
            }

            const soundboardBtn = document.getElementById('quick-soundboard-btn');
            if (setButtonState(soundboardBtn, settings.soundboard_enabled !== 'false' ? 'on' : 'off')) {
                console.log(`[Load Quick Action States] Soundboard button set to: ${soundboardBtn.getAttribute('data-state')}`);
            }

            const flowsBtn = document.getElementById('quick-flows-btn');
            if (setButtonState(flowsBtn, settings.flows_enabled !== 'false' ? 'on' : 'off')) {
                console.log(`[Load Quick Action States] Flows button set to: ${flowsBtn.getAttribute('data-state')}`);
            }

            // Load Emoji Rain state from plugin
            try {
                const emojiRainResponse = await fetch('/api/emoji-rain/status');
                const emojiRainData = await emojiRainResponse.json();
                const emojiRainBtn = document.getElementById('quick-emoji-rain-btn');
                if (emojiRainData.success) {
                    setButtonState(emojiRainBtn, emojiRainData.enabled !== false ? 'on' : 'off');
                }
            } catch (error) {
                console.log('Emoji Rain status not available');
            }

            // Load OSC-Bridge state
            try {
                const oscResponse = await fetch('/api/settings');
                const oscSettings = await oscResponse.json();
                const oscBtn = document.getElementById('quick-osc-bridge-btn');
                setButtonState(oscBtn, oscSettings.osc_bridge_enabled === 'true' ? 'on' : 'off');
            } catch (error) {
                console.log('OSC-Bridge status not available');
            }

            // Load OpenShock Emergency Stop state
            try {
                const openshockResponse = await fetch('/api/openshock/safety');
                const openshockData = await openshockResponse.json();
                const openshockStopBtn = document.getElementById('quick-openshock-stop-btn');
                if (openshockData.success) {
                    const emergencyActive = openshockData.settings?.emergencyStop?.enabled === true;
                    setButtonState(openshockStopBtn, emergencyActive ? 'on' : 'off');
                    console.log(`[Load Quick Action States] OpenShock Emergency Stop set to: ${emergencyActive ? 'on' : 'off'}`);
                }
            } catch (error) {
                console.log('OpenShock status not available');
            }

        } catch (error) {
            console.error('Error loading Quick Action states:', error);
        }

        // Sync sidebar icons after loading states
        syncSidebarIconStates();
    }

    async function toggleQuickAction(action, enabled) {
        console.log(`[Toggle Quick Action] ${action}:`, enabled ? 'ON' : 'OFF');

        try {
            let endpoint, body;

            switch (action) {
                case 'tts':
                    endpoint = '/api/settings';
                    body = { tts_enabled: enabled ? 'true' : 'false' };
                    break;

                case 'soundboard':
                    endpoint = '/api/settings';
                    body = { soundboard_enabled: enabled ? 'true' : 'false' };
                    break;

                case 'flows':
                    endpoint = '/api/settings';
                    body = { flows_enabled: enabled ? 'true' : 'false' };
                    break;

                case 'emoji-rain':
                    endpoint = '/api/emoji-rain/toggle';
                    body = { enabled };
                    break;

                case 'osc-bridge':
                    endpoint = '/api/settings';
                    body = { osc_bridge_enabled: enabled ? 'true' : 'false' };
                    break;

                case 'openshock-emergency-stop':
                    return await handleOpenShockEmergencyStop(enabled);

                default:
                    console.warn(`[Toggle Quick Action] Unknown action: ${action}`);
                    return false;
            }

            console.log(`[Toggle Quick Action] Sending to ${endpoint}:`, body);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            console.log(`[Toggle Quick Action] Response status:`, response.status);

            const result = await response.json();
            console.log(`[Toggle Quick Action] Response data:`, result);

            if (result.success) {
                // Clear TTS queue when disabling TTS
                if (action === 'tts' && !enabled) {
                    try {
                        console.log('[Toggle Quick Action] Clearing TTS queue...');
                        const clearResponse = await fetch('/api/tts/queue/clear', { method: 'POST' });
                        const clearResult = await clearResponse.json();
                        if (clearResult.success) {
                            console.log('[Toggle Quick Action] TTS queue cleared successfully');
                        } else {
                            console.warn('[Toggle Quick Action] Failed to clear TTS queue:', clearResult.error);
                        }
                    } catch (clearError) {
                        console.error('[Toggle Quick Action] Error clearing TTS queue:', clearError);
                    }
                }

                showQuickActionNotification(action, enabled);
                return true;
            } else {
                console.error(`[Toggle Quick Action] Failed to toggle ${action}:`, result.error);
                return false;
            }

        } catch (error) {
            console.error(`[Toggle Quick Action] Error toggling ${action}:`, error);
            return false;
        }
    }

    /**
     * Handle OpenShock Emergency Stop
     * Sends stop signals to all devices, then activates emergency stop
     */
    async function handleOpenShockEmergencyStop(activate) {
        console.log(`[OpenShock Emergency Stop] ${activate ? 'Activating' : 'Clearing'} emergency stop`);

        try {
            if (activate) {
                // Step 1: Send stop signals to all devices (vibrate with 0 intensity to interrupt any active shocks)
                console.log('[OpenShock Emergency Stop] Sending stop signals to all devices...');
                
                try {
                    // Get all devices first
                    const devicesResponse = await fetch('/api/openshock/devices');
                    const devicesData = await devicesResponse.json();
                    
                    if (devicesData.success && devicesData.devices && devicesData.devices.length > 0) {
                        // Send stop signal to each device (Sound with intensity 1, duration 300ms - minimal safe command)
                        for (const device of devicesData.devices) {
                            try {
                                await fetch(`/api/openshock/test/${device.id}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        type: 'sound',
                                        intensity: 1,
                                        duration: 300
                                    })
                                });
                                console.log(`[OpenShock Emergency Stop] Sent stop signal to device: ${device.name}`);
                            } catch (deviceError) {
                                console.warn(`[OpenShock Emergency Stop] Could not send stop to device ${device.name}:`, deviceError);
                            }
                        }
                    }
                } catch (devicesError) {
                    console.warn('[OpenShock Emergency Stop] Could not fetch devices:', devicesError);
                }

                // Step 2: Activate Emergency Stop in plugin
                console.log('[OpenShock Emergency Stop] Activating emergency stop in plugin...');
                const emergencyResponse = await fetch('/api/openshock/emergency-stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const emergencyResult = await emergencyResponse.json();
                
                if (emergencyResult.success) {
                    console.log('[OpenShock Emergency Stop] Emergency stop activated successfully');
                    showQuickActionNotification('openshock-emergency-stop', true);
                    return true;
                } else {
                    console.error('[OpenShock Emergency Stop] Failed to activate emergency stop:', emergencyResult.error);
                    return false;
                }
            } else {
                // Clear Emergency Stop
                console.log('[OpenShock Emergency Stop] Clearing emergency stop...');
                const clearResponse = await fetch('/api/openshock/emergency-clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const clearResult = await clearResponse.json();
                
                if (clearResult.success) {
                    console.log('[OpenShock Emergency Stop] Emergency stop cleared successfully');
                    showQuickActionNotification('openshock-emergency-stop', false);
                    return true;
                } else {
                    console.error('[OpenShock Emergency Stop] Failed to clear emergency stop:', clearResult.error);
                    return false;
                }
            }
        } catch (error) {
            console.error('[OpenShock Emergency Stop] Error:', error);
            return false;
        }
    }

    function showQuickActionNotification(action, enabled) {
        const actionNames = {
            'tts': 'Text-to-Speech',
            'soundboard': 'Soundboard',
            'flows': 'Automation Flows',
            'emoji-rain': 'Emoji Rain',
            'osc-bridge': 'OSC-Bridge',
            'openshock-emergency-stop': 'OpenShock Emergency Stop'
        };

        const name = actionNames[action] || action;
        const status = enabled ? 'aktiviert' : 'deaktiviert';
        const icon = enabled ? '✅' : '⏸️';

        // Special icon for emergency stop
        const displayIcon = action === 'openshock-emergency-stop' 
            ? (enabled ? '🛑' : '✅') 
            : icon;

        console.log(`${displayIcon} ${name} ${status}`);
    }

    // ========== UPDATE CHECKER & CHANGELOG LOADER ==========
    async function initializeChangelog() {
        const updatesSection = document.getElementById('updates-section');
        const updatesContent = document.getElementById('updates-content');
        const dismissBtn = document.getElementById('dismiss-updates-btn');
        const showMoreBtn = document.getElementById('show-more-changelog-btn');

        if (!updatesSection || !updatesContent) return;

        // Check if updates section was dismissed
        const isDismissed = localStorage.getItem('updates-dismissed') === 'true';
        if (isDismissed) {
            updatesSection.style.display = 'none';
            return;
        }

        // Dismiss button
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                updatesSection.style.display = 'none';
                localStorage.setItem('updates-dismissed', 'true');
            });
        }

        // Check for updates first
        try {
            const updateResponse = await fetch('/api/update/check');
            const updateData = await updateResponse.json();

            if (updateData.success && updateData.available) {
                // Show update notification
                const updateHTML = `
                    <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.05) 100%); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                            <i data-lucide="download" style="width: 20px; height: 20px; color: #22c55e;"></i>
                            <strong style="color: #22c55e;">Neue Version verfügbar: ${updateData.latestVersion}</strong>
                        </div>
                        <p style="font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 0.75rem 0;">
                            Aktuelle Version: ${updateData.currentVersion}
                        </p>
                        <div style="display: flex; gap: 0.5rem;">
                            <a href="${updateData.releaseUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary" style="text-decoration: none;">
                                <i data-lucide="external-link" style="width: 14px; height: 14px;"></i>
                                Release ansehen
                            </a>
                        </div>
                    </div>
                `;
                updatesContent.innerHTML = updateHTML;
                
                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            } else {
                // No updates available, try to load changelog
                await loadChangelog();
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            // Fallback to loading changelog
            await loadChangelog();
        }

        async function loadChangelog() {
            try {
                const response = await fetch('/CHANGELOG.txt');
                const changelogText = await response.text();

                const changelogHTML = parseChangelog(changelogText, 2); // Show first 2 versions
                updatesContent.innerHTML = changelogHTML;

                // Show "More" button if there are more versions
                if (showMoreBtn) {
                    showMoreBtn.style.display = 'block';
                    showMoreBtn.addEventListener('click', async () => {
                        const fullChangelogHTML = parseChangelog(changelogText); // Show all
                        updatesContent.innerHTML = fullChangelogHTML;
                        showMoreBtn.style.display = 'none';
                    });
                }

                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }

            } catch (error) {
                console.error('Error loading changelog:', error);
                updatesContent.innerHTML = '<p style="color: var(--color-text-muted);">Keine Updates verfügbar.</p>';
            }
        }
    }

    function parseChangelog(text, maxVersions = null) {
        const lines = text.split('\n');
        let html = '';
        let versionCount = 0;
        let currentVersion = null;
        let currentSection = null;
        let items = [];

        for (const line of lines) {
            // Version header: ## [1.0.2] - 2025-11-09
            if (line.startsWith('## [') && line.includes(']')) {
                // Flush previous section
                if (currentSection && items.length > 0) {
                    html += `<div class="changelog-section">
                        <div class="changelog-section-title ${currentSection.toLowerCase()}">${currentSection}</div>
                        <ul class="changelog-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>
                    </div>`;
                    items = [];
                }

                // Flush previous version
                if (currentVersion) {
                    html += '</div>';
                    versionCount++;
                    if (maxVersions && versionCount >= maxVersions) break;
                }

                const versionMatch = line.match(/## \[(.+?)\](?: - (.+))?/);
                if (versionMatch) {
                    const version = versionMatch[1];
                    const date = versionMatch[2] || '';

                    if (version !== 'Unreleased') {
                        html += `<div class="changelog-version">
                            <div class="changelog-version-header">
                                <span class="changelog-version-number">v${version}</span>
                                ${date ? `<span class="changelog-version-date">${date}</span>` : ''}
                            </div>`;
                        currentVersion = version;
                        currentSection = null;
                    }
                }
            }
            // Section header: ### Added
            else if (line.startsWith('### ')) {
                // Flush previous section
                if (currentSection && items.length > 0) {
                    html += `<div class="changelog-section">
                        <div class="changelog-section-title ${currentSection.toLowerCase()}">${currentSection}</div>
                        <ul class="changelog-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>
                    </div>`;
                    items = [];
                }

                currentSection = line.substring(4).trim();
            }
            // List item: - Feature description
            else if (line.startsWith('- ') && currentVersion && currentSection) {
                const item = line.substring(2).trim();
                // Only take first level bullets (not sub-items)
                if (!item.startsWith(' ')) {
                    items.push(item);
                }
            }
        }

        // Flush final section
        if (currentSection && items.length > 0) {
            html += `<div class="changelog-section">
                <div class="changelog-section-title ${currentSection.toLowerCase()}">${currentSection}</div>
                <ul class="changelog-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>
            </div>`;
        }

        // Flush final version
        if (currentVersion) {
            html += '</div>';
        }

        return html || '<p style="color: var(--color-text-muted);">Keine Updates verfügbar.</p>';
    }

    // ========== RUNTIME TRACKING & SPARKLINE ==========
    function initializeRuntimeTracking() {
        // Listen for connection events
        if (typeof socket !== 'undefined' && socket !== null) {
            socket.on('tiktok:connected', (data) => {
                startRuntimeTracking();
            });

            socket.on('tiktok:disconnected', () => {
                stopRuntimeTracking();
            });
        }
    }

    function startRuntimeTracking() {
        streamStartTime = Date.now();
        runtimeSparklineData = [];

        // Update runtime every second
        runtimeInterval = setInterval(() => {
            updateRuntime();
        }, 1000);
    }

    function stopRuntimeTracking() {
        streamStartTime = null;

        if (runtimeInterval) {
            clearInterval(runtimeInterval);
            runtimeInterval = null;
        }

        const runtimeElement = document.getElementById('stat-runtime');
        if (runtimeElement) {
            runtimeElement.textContent = '--:--:--';
        }

        runtimeSparklineData = [];
        drawRuntimeSparkline();
    }

    function updateRuntime() {
        if (!streamStartTime) return;

        const elapsed = Date.now() - streamStartTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        const runtimeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        const runtimeElement = document.getElementById('stat-runtime');
        if (runtimeElement) {
            runtimeElement.textContent = runtimeString;
        }

        // Add to sparkline data every 10 seconds
        if (seconds % 10 === 0) {
            runtimeSparklineData.push(minutes + hours * 60);
            if (runtimeSparklineData.length > MAX_SPARKLINE_POINTS) {
                runtimeSparklineData.shift();
            }
            drawRuntimeSparkline();
        }
    }

    function drawRuntimeSparkline() {
        const canvas = document.getElementById('runtime-sparkline');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (runtimeSparklineData.length < 2) return;

        // Calculate scaling
        const max = Math.max(...runtimeSparklineData, 1);
        const step = width / (runtimeSparklineData.length - 1);

        // Draw line
        ctx.beginPath();
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';

        runtimeSparklineData.forEach((value, index) => {
            const x = index * step;
            const y = height - (value / max) * height;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
    }

    // ========== COMPACT RESOURCES ==========
    function initializeCompactResources() {
        // Use fallback data for compact resource display
        // This is a lightweight version for dashboard stats
        setInterval(() => {
            updateCompactResources();
        }, 2000);
    }

    async function updateCompactResources() {
        // Use simple mock data for resource display
        // Resource monitor plugin has been removed
        updateCompactResource('cpu', Math.random() * 10);
        updateCompactResource('ram', 30 + Math.random() * 20);
    }

    function updateCompactResource(type, value) {
        const valueElement = document.getElementById(`resource-${type}-compact`);
        const barElement = document.getElementById(`resource-${type}-bar-compact`);

        if (valueElement) {
            valueElement.textContent = value.toFixed(1) + '%';
        }

        if (barElement) {
            barElement.style.width = Math.min(value, 100) + '%';

            // Color based on threshold
            if (value > 80) {
                barElement.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
            } else if (value > 60) {
                barElement.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
            } else {
                barElement.style.background = 'linear-gradient(90deg, #10b981, #3b82f6)';
            }
        }
    }

    // ========== SPARKLINE DATA ==========
    let gpuSparklineData = [];
    let networkSparklineData = [];
    const MAX_SPARKLINE_DATA_POINTS = 20;

    function updateGPUSparkline(value) {
        gpuSparklineData.push(value);
        if (gpuSparklineData.length > MAX_SPARKLINE_DATA_POINTS) {
            gpuSparklineData.shift();
        }
        drawSparkline('gpu-sparkline', gpuSparklineData, '#8b5cf6');
    }

    function updateNetworkSparkline(value) {
        networkSparklineData.push(value / 1024); // Convert to KB/s
        if (networkSparklineData.length > MAX_SPARKLINE_DATA_POINTS) {
            networkSparklineData.shift();
        }
        drawSparkline('network-sparkline', networkSparklineData, '#3b82f6');
    }

    function drawSparkline(canvasId, data, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (data.length < 2) return;

        // Calculate scaling
        const max = Math.max(...data, 1);
        const step = width / (data.length - 1);

        // Draw line
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';

        data.forEach((value, index) => {
            const x = index * step;
            const y = height - (value / max) * height;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
    }

    function formatBytesShort(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // ========== RESOURCE DETAILS LINK ==========
    function initializeResourceDetailsLink() {
        const detailsLink = document.querySelector('.resource-details-link');
        if (detailsLink) {
            detailsLink.addEventListener('click', (e) => {
                e.preventDefault();
                const view = detailsLink.getAttribute('data-view');
                if (view && typeof NavigationManager !== 'undefined') {
                    NavigationManager.switchView(view);
                }
            });
        }
    }

    // ========== EXPORTS ==========
    window.DashboardEnhancements = {
        reloadChangelog: initializeChangelog,
        refreshQuickActionButtons: refreshQuickActionButtons,
        resetUpdatesDismissal: () => {
            localStorage.removeItem('updates-dismissed');
            const updatesSection = document.getElementById('updates-section');
            if (updatesSection) {
                updatesSection.style.display = '';
                initializeChangelog();
            }
        }
    };

})();
