/**
 * Profile Manager - Enhanced UX for Profile System
 * 
 * Provides:
 * - Profile status indicator with warning badges
 * - Auto-restart functionality after profile switch
 * - Profile integrity verification
 * - Migration status tracking
 * - Tooltips and help documentation
 */

(()=> {
    'use strict';

    // State
    let activeProfile = null;
    let selectedProfile = null;
    let profileSwitchPending = false;
    let restartCountdown = null;
    let restartInProgress = false;

    function profilesMatch(a, b) {
        return typeof a === 'string'
            && typeof b === 'string'
            && a.toLowerCase() === b.toLowerCase();
    }

    function getKnownLocalPorts() {
        const ports = new Set();
        const currentPort = Number(window.location.port || 80);
        if (Number.isInteger(currentPort) && currentPort > 0) {
            ports.add(currentPort);
        }
        for (let port = 3000; port <= 3050; port++) {
            ports.add(port);
        }
        return [...ports];
    }

    async function fetchProfileStatusFromPort(port, timeoutMs = 700) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(`http://localhost:${port}/api/profiles/active?restartPoll=${Date.now()}`, {
                cache: 'no-store',
                signal: controller.signal
            });
            if (!response.ok) return null;
            const data = await response.json();
            return { port, data };
        } catch (_) {
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    async function findActiveProfileOnKnownPorts(targetProfile) {
        if (!targetProfile) return null;

        const currentPort = Number(window.location.port || 80);
        for (const port of getKnownLocalPorts()) {
            if (port === currentPort) continue;

            const result = await fetchProfileStatusFromPort(port);
            if (!result) continue;

            const { data } = result;
            if (profilesMatch(data.activeProfile, targetProfile) && !data.requiresRestart) {
                return result;
            }
        }

        return null;
    }

    // Initialize on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', async () => {
        await initializeProfileManager();
    });

    /**
     * Initialize the profile manager system
     */
    async function initializeProfileManager() {
        console.log('🔐 Initializing Profile Manager...');

        // Load current profile status
        await loadProfileStatus();

        // Setup profile status indicator
        setupProfileStatusIndicator();

        // Setup profile switch detection
        setupProfileSwitchDetection();

        // Setup tooltips
        setupProfileTooltips();

        // Check for pending profile switch on load
        checkPendingProfileSwitch();

        console.log('✅ Profile Manager initialized');
    }

    /**
     * Load profile status from server
     */
    async function loadProfileStatus() {
        try {
            const response = await fetch('/api/profiles/active');
            const data = await response.json();

            activeProfile = data.activeProfile;
            const storedSelected = localStorage.getItem('selectedProfile');
            const serverPendingProfile = data.pendingProfile && !profilesMatch(data.pendingProfile, activeProfile)
                ? data.pendingProfile
                : null;

            if (serverPendingProfile) {
                selectedProfile = serverPendingProfile;
                localStorage.setItem('selectedProfile', selectedProfile);
                profileSwitchPending = true;
                showProfileSwitchWarning();
            } else if (storedSelected) {
                selectedProfile = activeProfile;
                profileSwitchPending = false;
                localStorage.removeItem('selectedProfile');
                if (profilesMatch(storedSelected, activeProfile)) {
                    console.log('✅ Profile switch completed successfully - localStorage cleared');
                } else {
                    console.warn('Ignored stale stored profile switch target:', storedSelected);
                }
            } else {
                selectedProfile = activeProfile;
                profileSwitchPending = false;
            }

            return data;
        } catch (error) {
            console.error('Error loading profile status:', error);
            return null;
        }
    }

    /**
     * Setup profile status indicator in header
     */
    function setupProfileStatusIndicator() {
        const profileBtn = document.getElementById('profile-btn');
        if (!profileBtn) return;

        // Add title/tooltip
        profileBtn.title = getProfileTooltipText();

        // Update profile name display
        updateProfileDisplay();

        // Add click handler for profile modal
        profileBtn.addEventListener('click', () => {
            showEnhancedProfileModal();
        });
    }

    /**
     * Update profile display with warning badge if needed
     */
    function updateProfileDisplay() {
        const profileNameSpan = document.getElementById('current-profile-name');
        if (!profileNameSpan) return;

        // Set current profile name
        profileNameSpan.textContent = activeProfile || 'default';

        // Add warning badge if profile switch pending
        if (profileSwitchPending) {
            const profileBtn = document.getElementById('profile-btn');
            if (profileBtn && !profileBtn.querySelector('.profile-warning-badge')) {
                const badge = document.createElement('span');
                badge.className = 'profile-warning-badge';
                badge.title = window.i18n?.t('profile.restart_required') || 'Restart required!';
                badge.innerHTML = '<i data-lucide="alert-circle"></i>';
                profileBtn.appendChild(badge);

                // Re-create icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }
        }
    }

    /**
     * Get tooltip text for profile button
     */
    function getProfileTooltipText() {
        if (profileSwitchPending) {
            return window.i18n?.t('profile.switch_pending_tooltip', {
                current: activeProfile,
                selected: selectedProfile
            }) || `Current: ${activeProfile} | Selected: ${selectedProfile}\nRestart required to activate new profile`;
        }
        return window.i18n?.t('profile.current_profile_tooltip', {
            profile: activeProfile
        }) || `Current Profile: ${activeProfile}`;
    }

    /**
     * Show profile switch warning banner
     */
    function showProfileSwitchWarning() {
        // Check if warning already exists
        if (document.getElementById('profile-switch-warning')) return;

        const warning = document.createElement('div');
        warning.id = 'profile-switch-warning';
        warning.className = 'profile-switch-warning';
        warning.innerHTML = `
            <div class="profile-switch-warning-content">
                <div class="profile-switch-warning-icon">
                    <i data-lucide="alert-triangle"></i>
                </div>
                <div class="profile-switch-warning-text">
                    <strong>${window.i18n?.t('profile.switch_pending_title') || 'Profile Switch Pending'}</strong>
                    <p>${window.i18n?.t('profile.switch_pending_message', {
                        current: activeProfile,
                        selected: selectedProfile
                    }) || `You switched to profile "${selectedProfile}" but the application is still using "${activeProfile}". Restart required to activate the new profile.`}</p>
                </div>
                <div class="profile-switch-warning-actions">
                    <button class="btn-restart-now" onclick="window.profileManager.restartNow()">
                        <i data-lucide="refresh-cw"></i>
                        ${window.i18n?.t('profile.restart_now') || 'Restart Now'}
                    </button>
                    <button class="btn-dismiss-warning" onclick="window.profileManager.dismissWarning()">
                        <i data-lucide="x"></i>
                    </button>
                </div>
            </div>
        `;

        // Insert after topbar
        const topbar = document.querySelector('.topbar');
        if (topbar && topbar.parentNode) {
            topbar.parentNode.insertBefore(warning, topbar.nextSibling);
        }

        // Re-create icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Setup profile switch detection
     */
    function setupProfileSwitchDetection() {
        // Listen for profile:switched event from server
        if (window.socket) {
            window.socket.on('profile:switched', handleProfileSwitch);
        } else {
            // Wait for socket to be available
            const checkSocket = setInterval(() => {
                if (window.socket) {
                    clearInterval(checkSocket);
                    window.socket.on('profile:switched', handleProfileSwitch);
                }
            }, 100);
            setTimeout(() => clearInterval(checkSocket), 10000);
        }
    }

    /**
     * Handle profile switch event
     */
    function handleProfileSwitch(data) {
        console.log('🔄 Profile switched:', data);

        selectedProfile = data.to;
        localStorage.setItem('selectedProfile', selectedProfile);

        if (data.requiresRestart) {
            profileSwitchPending = true;
            showProfileSwitchWarning();
            updateProfileDisplay();

            // Profile changes need a real backend restart; a page reload is not enough.
            showRestartConfirmation(data);
        }
    }

    /**
     * Start the mandatory restart flow after a profile switch.
     */
    function showRestartConfirmation(data) {
        const targetProfile = data?.to || data?.newProfile || selectedProfile;
        const message = window.i18n?.t('profile.switched_notification', {
            profile: targetProfile
        }) || `Profile switched to "${targetProfile}".\n\nThe application will restart to activate the new profile...`;

        showNotification(message, 'info', 3000);
        beginProfileRestart(data);
    }

    /**
     * Restart the application now via server restart API.
     * Falls back to location.reload() if the API is unavailable (e.g. direct node server.js without launcher).
     */
    async function restartNow() {
        await beginProfileRestart({
            to: selectedProfile || localStorage.getItem('selectedProfile'),
            requiresRestart: true
        });
    }

    async function beginProfileRestart(data = {}) {
        const targetProfile = data.to || data.newProfile || selectedProfile || localStorage.getItem('selectedProfile');

        if (targetProfile) {
            selectedProfile = targetProfile;
            localStorage.setItem('selectedProfile', targetProfile);
        }

        if (restartInProgress) {
            return;
        }

        restartInProgress = true;
        console.log('♻️ Starting profile restart flow...', data);

        // Clear pending countdown
        if (restartCountdown) {
            clearInterval(restartCountdown);
            restartCountdown = null;
        }

        showRestartWaitingOverlay(targetProfile);

        if (data.restartScheduled) {
            await waitForServerRestart(targetProfile);
            window.location.reload();
            return;
        }

        try {
            const response = await fetch('/api/server/restart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                // Server acknowledged restart request.
                // Poll until server is back online, then reload the page.
                console.log('✅ Server restart initiated. Waiting for server to come back online...');
                await waitForServerRestart(targetProfile);
                window.location.reload();
            } else {
                // API returned an error – fall back to page reload
                console.warn('⚠️ Server restart API returned error, falling back to page reload');
                const errorText = await readRestartError(response);
                console.error('Server restart API returned error:', errorText);
                showRestartError(errorText);
                restartInProgress = false;
            }
        } catch (error) {
            // Network error (server already restarting) – wait and reload
            console.log('♻️ Server appears to be restarting (network error expected). Waiting...');
            await waitForServerRestart(targetProfile);
            window.location.reload();
        }
    }

    async function readRestartError(response) {
        try {
            const data = await response.json();
            return data.error || data.message || `${response.status} ${response.statusText}`;
        } catch (_) {
            return `${response.status} ${response.statusText}`;
        }
    }

    function showRestartError(message) {
        showNotification(
            `${window.i18n?.t('profile.restart_failed') || 'Server restart failed'}: ${message}`,
            'error',
            10000
        );
    }

    /**
     * Shows a full-screen overlay while the server restarts.
     */
    function showRestartWaitingOverlay(targetProfile) {
        // Remove existing overlay if any
        const existing = document.getElementById('server-restart-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'server-restart-overlay';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.85)',
            'display:flex', 'flex-direction:column', 'align-items:center',
            'justify-content:center', 'z-index:99999', 'color:#fff',
            'font-family:sans-serif', 'gap:16px'
        ].join(';');
        overlay.innerHTML = `
            <div style="font-size:2.5rem">&#x267B;&#xFE0F;</div>
            <div style="font-size:1.25rem;font-weight:600">
                ${window.i18n?.t('profile.restarting') || 'Server wird neu gestartet...'}
            </div>
            ${targetProfile ? `<div style="font-size:0.95rem;color:#d1d5db">Profil: ${targetProfile}</div>` : ''}
            <div style="font-size:0.9rem;color:#aaa">
                ${window.i18n?.t('profile.restart_wait') || 'Bitte warten \u2013 die Seite l\u00e4dt automatisch neu.'}
            </div>
        `;
        document.body.appendChild(overlay);
    }

    /**
     * Polls until the target profile is active. This also handles very fast restarts
     * where the browser could miss the short offline window.
     */
    function waitForServerRestart(targetProfile = selectedProfile, maxWaitMs = 180000, intervalMs = 500) {
        return new Promise((resolve) => {
            const deadline = Date.now() + maxWaitMs;
            let sawServerOffline = false;
            let lastPortScan = 0;

            const poll = async () => {
                try {
                    const r = await fetch('/api/profiles/active?restartPoll=' + Date.now(), { cache: 'no-store' });
                    if (r.ok) {
                        const data = await r.json().catch(() => null);
                        if (targetProfile && data && profilesMatch(data.activeProfile, targetProfile) && !data.requiresRestart) {
                            resolve();
                            return;
                        }
                    }

                    if (r.ok && !targetProfile && sawServerOffline) {
                        resolve();
                        return;
                    }
                } catch (_) {
                    sawServerOffline = true;
                    // Server not yet up – expected during restart
                }

                if (targetProfile && Date.now() - lastPortScan > 2000) {
                    lastPortScan = Date.now();
                    const alternate = await findActiveProfileOnKnownPorts(targetProfile);
                    if (alternate) {
                        window.location.href = `http://localhost:${alternate.port}/dashboard.html`;
                        return;
                    }
                }

                if (Date.now() < deadline) {
                    setTimeout(poll, intervalMs);
                } else {
                    showRestartError(`Timeout waiting for profile "${targetProfile || 'unknown'}" to become active`);
                    restartInProgress = false;
                }
            };

            // Wait a minimum of 1 second before first poll
            // (server needs time to shut down before coming back)
            setTimeout(poll, 1000);
        });
    }

    /**
     * Dismiss warning banner
     */
    function dismissWarning() {
        const warning = document.getElementById('profile-switch-warning');
        if (warning) {
            warning.style.animation = 'slideOutUp 0.3s ease-out';
            setTimeout(() => warning.remove(), 300);
        }

        // Remove badge
        const badge = document.querySelector('.profile-warning-badge');
        if (badge) {
            badge.remove();
        }
    }

    /**
     * Check for pending profile switch on page load
     */
    function checkPendingProfileSwitch() {
        const storedSelected = localStorage.getItem('selectedProfile');

        if (!activeProfile) {
            return;
        }
        
        if (storedSelected && !profilesMatch(storedSelected, activeProfile)) {
            if (!profileSwitchPending) {
                console.warn('Cleared stale stored profile switch target:', storedSelected);
                localStorage.removeItem('selectedProfile');
                selectedProfile = activeProfile;
                return;
            }

            profileSwitchPending = true;
            selectedProfile = storedSelected;
            showProfileSwitchWarning();
            updateProfileDisplay();
            beginProfileRestart({
                to: storedSelected,
                requiresRestart: true
            });
        } else if (storedSelected && profilesMatch(storedSelected, activeProfile)) {
            // Profiles match - clear localStorage to prevent false warnings
            localStorage.removeItem('selectedProfile');
            console.log('✅ Profile switch completed - localStorage cleared on page load');
        }
    }

    /**
     * Setup tooltips for profile-related elements
     */
    function setupProfileTooltips() {
        // Add tooltips to profile button
        const profileBtn = document.getElementById('profile-btn');
        if (profileBtn) {
            profileBtn.addEventListener('mouseenter', () => {
                showTooltip(profileBtn, getProfileTooltipText());
            });
        }
    }

    /**
     * Show enhanced profile modal with documentation links
     */
    function showEnhancedProfileModal() {
        // Navigate to settings view where profile management is
        if (window.NavigationManager) {
            window.NavigationManager.switchView('settings');
            
            // Wait a bit then scroll to profile section
            setTimeout(() => {
                const profileSection = document.querySelector('[data-section="profiles"]');
                if (profileSection) {
                    profileSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 300);
        }
    }

    /**
     * Show notification (helper function)
     */
    function showNotification(message, type = 'info', duration = 5000) {
        // Use existing notification system if available
        if (window.showToast) {
            window.showToast(message, type, duration);
            return null;
        }

        // Fallback to alert
        if (type === 'warning' || type === 'error') {
            alert(message);
        } else {
            console.log(message);
        }
        return null;
    }

    /**
     * Show tooltip (helper function)
     */
    function showTooltip(element, text) {
        // Simple tooltip implementation
        element.title = text;
    }

    /**
     * Get profile integrity status
     */
    async function getProfileIntegrityStatus() {
        try {
            const response = await fetch('/api/profiles/integrity');
            return await response.json();
        } catch (error) {
            console.error('Error checking profile integrity:', error);
            return null;
        }
    }

    /**
     * Get migration status
     */
    async function getMigrationStatus() {
        try {
            const response = await fetch('/api/profiles/migration-status');
            return await response.json();
        } catch (error) {
            console.error('Error checking migration status:', error);
            return null;
        }
    }

    // Expose public API
    window.profileManager = {
        restartNow,
        beginProfileRestart,
        dismissWarning,
        loadProfileStatus,
        getProfileIntegrityStatus,
        getMigrationStatus,
        get activeProfile() { return activeProfile; },
        get selectedProfile() { return selectedProfile; },
        get profileSwitchPending() { return profileSwitchPending; }
    };

})();
