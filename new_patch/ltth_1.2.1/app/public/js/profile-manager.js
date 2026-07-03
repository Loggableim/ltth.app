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
            selectedProfile = localStorage.getItem('selectedProfile') || activeProfile;

            // Check if profiles differ (pending restart)
            if (selectedProfile && selectedProfile !== activeProfile) {
                profileSwitchPending = true;
                showProfileSwitchWarning();
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

            // Show restart confirmation with countdown
            showRestartConfirmation(data);
        }
    }

    /**
     * Show restart confirmation with auto-restart option
     */
    function showRestartConfirmation(data) {
        const autoRestartEnabled = localStorage.getItem('profile_autoRestart') === 'true';
        const countdownSeconds = 5;

        if (autoRestartEnabled) {
            // Auto-restart after countdown
            let remaining = countdownSeconds;
            
            const message = window.i18n?.t('profile.auto_restart_countdown', {
                profile: data.to,
                seconds: remaining
            }) || `Profile switched to "${data.to}".\n\nAuto-restart in ${remaining} seconds...`;

            const notification = showNotification(message, 'info', countdownSeconds * 1000);

            restartCountdown = setInterval(() => {
                remaining--;
                if (remaining > 0) {
                    const updatedMessage = window.i18n?.t('profile.auto_restart_countdown', {
                        profile: data.to,
                        seconds: remaining
                    }) || `Profile switched to "${data.to}".\n\nAuto-restart in ${remaining} seconds...`;
                    
                    if (notification && notification.textContent) {
                        notification.querySelector('p').textContent = updatedMessage.split('\n\n')[1];
                    }
                } else {
                    clearInterval(restartCountdown);
                    restartNow();
                }
            }, 1000);
        } else {
            // Manual restart prompt
            const message = window.i18n?.t('profile.manual_restart_prompt', {
                profile: data.to
            }) || `Profile switched to "${data.to}".\n\nPlease restart the application to activate the new profile.`;

            showNotification(message, 'warning', 0);
        }
    }

    /**
     * Restart the application now
     */
    function restartNow() {
        console.log('♻️ Restarting application to activate new profile...');
        
        // Clear pending state
        if (restartCountdown) {
            clearInterval(restartCountdown);
        }

        // Reload the page
        window.location.reload();
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
        
        if (storedSelected && storedSelected !== activeProfile) {
            profileSwitchPending = true;
            selectedProfile = storedSelected;
            showProfileSwitchWarning();
            updateProfileDisplay();
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
        dismissWarning,
        loadProfileStatus,
        getProfileIntegrityStatus,
        getMigrationStatus,
        get activeProfile() { return activeProfile; },
        get selectedProfile() { return selectedProfile; },
        get profileSwitchPending() { return profileSwitchPending; }
    };

})();
