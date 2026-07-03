/**
 * Cloud Sync Settings UI Handler
 * Manages the cloud sync configuration interface
 */

(function() {
    'use strict';

    let cloudSyncStatus = null;

    // DOM Elements
    const statusContainer = document.getElementById('cloud-sync-status-container');
    const statusText = document.getElementById('cloud-sync-status-text');
    const statsContainer = document.getElementById('cloud-sync-stats');
    const cloudPathInput = document.getElementById('cloud-sync-path');
    const choosePathBtn = document.getElementById('choose-cloud-path-btn');
    const enableBtn = document.getElementById('enable-cloud-sync-btn');
    const disableBtn = document.getElementById('disable-cloud-sync-btn');
    const manualSyncBtn = document.getElementById('manual-cloud-sync-btn');
    const currentPathContainer = document.getElementById('cloud-sync-current-path');
    const pathDisplay = document.getElementById('cloud-sync-path-display');
    
    // Check if elements exist before proceeding
    if (!choosePathBtn) {
        console.warn('[Cloud Sync] Cloud sync UI elements not found in current view');
        return;
    }

    // Status elements
    const enabledStatus = document.getElementById('cloud-sync-enabled-status');
    const lastSyncElement = document.getElementById('cloud-sync-last-sync');
    const uploadedElement = document.getElementById('cloud-sync-uploaded');
    const downloadedElement = document.getElementById('cloud-sync-downloaded');
    const conflictsElement = document.getElementById('cloud-sync-conflicts');
    const successfulElement = document.getElementById('cloud-sync-successful');

    /**
     * Load cloud sync status from server
     */
    async function loadCloudSyncStatus() {
        try {
            const response = await fetch('/api/cloud-sync/status');
            const data = await response.json();

            if (data.success) {
                cloudSyncStatus = data;
                updateUI();
            } else {
                showError('Fehler beim Laden des Cloud-Sync-Status: ' + (data.error || 'Unbekannter Fehler'));
            }
        } catch (error) {
            console.error('Error loading cloud sync status:', error);
            showError('Verbindungsfehler beim Laden des Cloud-Sync-Status');
        }
    }

    /**
     * Update UI based on current status
     */
    function updateUI() {
        if (!cloudSyncStatus) return;

        // Update status display
        if (cloudSyncStatus.enabled) {
            statusContainer.className = 'alert alert-success';
            statusText.innerHTML = '<strong>✅ Cloud Sync ist aktiv</strong> - Deine Konfigurationen werden automatisch synchronisiert';
            
            enabledStatus.textContent = 'Aktiviert';
            enabledStatus.className = 'info-value badge badge-success';

            // Show stats
            statsContainer.style.display = 'block';
            
            // Show current path
            currentPathContainer.style.display = 'block';
            pathDisplay.textContent = cloudSyncStatus.cloudPath;

            // Update buttons
            enableBtn.style.display = 'none';
            disableBtn.style.display = 'inline-flex';
            manualSyncBtn.style.display = 'inline-flex';
            choosePathBtn.disabled = true;

            // Update stats
            if (cloudSyncStatus.stats) {
                uploadedElement.textContent = cloudSyncStatus.stats.filesUploaded || 0;
                downloadedElement.textContent = cloudSyncStatus.stats.filesDownloaded || 0;
                conflictsElement.textContent = cloudSyncStatus.stats.conflicts || 0;
                successfulElement.textContent = cloudSyncStatus.stats.successfulSyncs || 0;
            }

            if (cloudSyncStatus.lastSyncTime) {
                const lastSync = new Date(cloudSyncStatus.lastSyncTime);
                lastSyncElement.textContent = formatRelativeTime(lastSync);
            } else {
                lastSyncElement.textContent = 'Nie';
            }

        } else {
            statusContainer.className = 'alert alert-info';
            statusText.innerHTML = '<strong>ℹ️  Cloud Sync ist deaktiviert</strong> - Wähle einen Cloud-Ordner und aktiviere den Sync';
            
            enabledStatus.textContent = 'Deaktiviert';
            enabledStatus.className = 'info-value badge badge-secondary';

            // Hide stats
            statsContainer.style.display = 'none';
            currentPathContainer.style.display = 'none';

            // Update buttons
            if (cloudPathInput.value) {
                enableBtn.disabled = false;
            }
            enableBtn.style.display = 'inline-flex';
            disableBtn.style.display = 'none';
            manualSyncBtn.style.display = 'none';
            choosePathBtn.disabled = false;
        }

        // Update sync in progress indicator
        if (cloudSyncStatus.syncInProgress) {
            statusText.innerHTML += ' <span style="margin-left: 1rem;">⏳ Synchronisation läuft...</span>';
        }
    }

    /**
     * Format relative time (e.g., "5 Minuten ago")
     */
    function formatRelativeTime(date) {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
        if (hours > 0) return `vor ${hours} Stunde${hours > 1 ? 'n' : ''}`;
        if (minutes > 0) return `vor ${minutes} Minute${minutes > 1 ? 'n' : ''}`;
        return 'gerade eben';
    }

    /**
     * Show error message
     */
    function showError(message) {
        statusContainer.className = 'alert alert-danger';
        statusText.innerHTML = `<strong>❌ Fehler:</strong> ${message}`;
    }

    /**
     * Show success message
     */
    function showSuccess(message) {
        statusContainer.className = 'alert alert-success';
        statusText.innerHTML = `<strong>✅ Erfolg:</strong> ${message}`;
        
        // Reload status after a short delay
        setTimeout(() => {
            loadCloudSyncStatus();
        }, 1000);
    }

    /**
     * Choose cloud path (simulated - requires native file picker)
     */
    choosePathBtn.addEventListener('click', async () => {
        // Since we can't use native file picker in web browser,
        // we'll use a prompt for now
        const path = prompt('Gib den vollständigen Pfad zu deinem Cloud-Sync-Ordner ein:\n\nBeispiele:\n- Windows: C:\\Users\\DeinName\\OneDrive\\TikTokHelper\n- macOS: /Users/DeinName/Google Drive/TikTokHelper\n- Linux: /home/username/Dropbox/TikTokHelper');
        
        if (path) {
            cloudPathInput.value = path;
            
            // Validate path
            try {
                const response = await fetch('/api/cloud-sync/validate-path', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ cloudPath: path })
                });

                const data = await response.json();

                if (data.valid) {
                    enableBtn.disabled = false;
                    showSuccess('Cloud-Pfad ist gültig und bereit zur Verwendung');
                } else {
                    enableBtn.disabled = true;
                    showError('Ungültiger Cloud-Pfad: ' + (data.error || 'Unbekannter Fehler'));
                }
            } catch (error) {
                console.error('Error validating path:', error);
                showError('Fehler bei der Pfad-Validierung');
                enableBtn.disabled = true;
            }
        }
    });

    /**
     * Enable cloud sync
     */
    enableBtn.addEventListener('click', async () => {
        const cloudPath = cloudPathInput.value.trim();

        if (!cloudPath) {
            showError('Bitte wähle zuerst einen Cloud-Ordner aus');
            return;
        }

        enableBtn.disabled = true;
        enableBtn.innerHTML = '<i data-lucide="loader"></i> Aktiviere...';
        lucide.createIcons();

        try {
            const response = await fetch('/api/cloud-sync/enable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cloudPath })
            });

            const data = await response.json();

            if (data.success) {
                showSuccess('Cloud Sync wurde erfolgreich aktiviert');
                await loadCloudSyncStatus();
            } else {
                showError('Fehler beim Aktivieren: ' + (data.error || 'Unbekannter Fehler'));
                enableBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error enabling cloud sync:', error);
            showError('Verbindungsfehler beim Aktivieren');
            enableBtn.disabled = false;
        } finally {
            enableBtn.innerHTML = '<i data-lucide="cloud"></i> Cloud Sync aktivieren';
            lucide.createIcons();
        }
    });

    /**
     * Disable cloud sync
     */
    disableBtn.addEventListener('click', async () => {
        if (!confirm('Möchtest du Cloud Sync wirklich deaktivieren?\n\nDeine lokalen Daten bleiben erhalten, aber die automatische Synchronisation wird gestoppt.')) {
            return;
        }

        disableBtn.disabled = true;
        disableBtn.innerHTML = '<i data-lucide="loader"></i> Deaktiviere...';
        lucide.createIcons();

        try {
            const response = await fetch('/api/cloud-sync/disable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                showSuccess('Cloud Sync wurde deaktiviert');
                await loadCloudSyncStatus();
            } else {
                showError('Fehler beim Deaktivieren: ' + (data.error || 'Unbekannter Fehler'));
                disableBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error disabling cloud sync:', error);
            showError('Verbindungsfehler beim Deaktivieren');
            disableBtn.disabled = false;
        } finally {
            disableBtn.innerHTML = '<i data-lucide="cloud-off"></i> Cloud Sync deaktivieren';
            lucide.createIcons();
        }
    });

    /**
     * Manual sync
     */
    manualSyncBtn.addEventListener('click', async () => {
        manualSyncBtn.disabled = true;
        manualSyncBtn.innerHTML = '<i data-lucide="loader"></i> Synchronisiere...';
        lucide.createIcons();

        try {
            const response = await fetch('/api/cloud-sync/manual-sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                showSuccess(`Manuelle Synchronisation abgeschlossen - ${data.stats?.filesUploaded || 0} hochgeladen, ${data.stats?.filesDownloaded || 0} heruntergeladen`);
                await loadCloudSyncStatus();
            } else {
                showError('Fehler bei der Synchronisation: ' + (data.error || 'Unbekannter Fehler'));
            }
        } catch (error) {
            console.error('Error during manual sync:', error);
            showError('Verbindungsfehler bei der Synchronisation');
        } finally {
            manualSyncBtn.disabled = false;
            manualSyncBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Manueller Sync';
            lucide.createIcons();
        }
    });

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            loadCloudSyncStatus();
            // Reload status every 30 seconds
            setInterval(loadCloudSyncStatus, 30000);
        });
    } else {
        loadCloudSyncStatus();
        // Reload status every 30 seconds
        setInterval(loadCloudSyncStatus, 30000);
    }

})();
