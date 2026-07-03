/**
 * Update Checker - Frontend-Logik für Update-Benachrichtigungen
 */

class UpdateUI {
    constructor() {
        this.updateBanner = document.getElementById('update-banner');
        this.updateVersionInfo = document.getElementById('update-version-info');
        this.updateDownloadBtn = document.getElementById('update-download-btn');
        this.updateDismissBtn = document.getElementById('update-dismiss-btn');
        this.currentUpdateInfo = null;
        this.currentVersion = null;

        this.init();
    }

    init() {
        // Event-Listener
        if (this.updateDownloadBtn) {
            this.updateDownloadBtn.addEventListener('click', () => this.handleDownload());
        }

        if (this.updateDismissBtn) {
            this.updateDismissBtn.addEventListener('click', () => this.dismissBanner());
        }

        // Fetch and display current version in title
        this.updateTitleWithVersion();

        // Update-Check beim Laden
        this.checkForUpdates();

        // Periodisch prüfen (alle 6 Stunden)
        setInterval(() => {
            this.checkForUpdates();
        }, 6 * 60 * 60 * 1000);
    }
    
    /**
     * Fetches current version and updates page title and header
     */
    async updateTitleWithVersion() {
        try {
            const response = await fetch('/api/update/current');
            const data = await response.json();
            
            if (data.success && data.version) {
                this.currentVersion = data.version;
                
                // Update document title
                const baseTitle = "Pup Cid's Little TikTok Helper";
                document.title = `${baseTitle} ${data.version}`;
                
                // Update header title if exists
                const headerTitle = document.querySelector('.topbar-title');
                if (headerTitle) {
                    headerTitle.textContent = `${baseTitle} ${data.version}`;
                }
                
                console.log(`✅ [Version] App version: ${data.version}`);
            }
        } catch (error) {
            console.warn('[Version] Could not fetch version:', error);
        }
    }

    /**
     * Prüft auf neue Versionen
     */
    async checkForUpdates() {
        try {
            const response = await fetch('/api/update/check');
            const data = await response.json();

            if (data.success && data.available) {
                this.currentUpdateInfo = data;
                this.showUpdateBanner(data);
            }
        } catch (error) {
            console.error('Update check failed:', error);
        }
    }

    /**
     * Zeigt das Update-Banner an
     */
    showUpdateBanner(updateInfo) {
        if (!this.updateBanner) return;

        // Prüfe ob Banner dismissed wurde (Session Storage)
        const dismissedVersion = sessionStorage.getItem('update-dismissed-version');
        if (dismissedVersion === updateInfo.latestVersion) {
            return;
        }

        // Update-Info anzeigen
        if (this.updateVersionInfo) {
            this.updateVersionInfo.textContent =
                `Version ${updateInfo.latestVersion} ist verfügbar (Aktuell: ${updateInfo.currentVersion})`;
        }

        // Banner anzeigen
        this.updateBanner.classList.remove('hidden');
    }

    /**
     * Versteckt das Banner
     */
    dismissBanner() {
        if (!this.updateBanner) return;

        this.updateBanner.classList.add('hidden');

        // Version merken (für diese Session)
        if (this.currentUpdateInfo) {
            sessionStorage.setItem('update-dismissed-version', this.currentUpdateInfo.latestVersion);
        }
    }

    /**
     * Lädt das Update herunter
     */
    async handleDownload() {
        if (!this.currentUpdateInfo) {
            this.showNotification('Keine Update-Informationen verfügbar', 'error');
            return;
        }

        // Bestätigung
        const confirmMsg = `Update auf Version ${this.currentUpdateInfo.latestVersion} installieren?\n\n` +
                          `Der Server wird nach dem Download neu gestartet werden müssen.`;

        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            this.updateDownloadBtn.disabled = true;
            this.updateDownloadBtn.textContent = '⏳ Lädt herunter...';

            const response = await fetch('/api/update/download', {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                this.showNotification(
                    'Update erfolgreich heruntergeladen! Bitte starte den Server neu.',
                    'success'
                );

                // Update-Anleitung anzeigen
                this.showRestartInstructions();
            } else {
                // Fehler - zeige manuelle Anleitung
                this.showNotification(`Fehler: ${data.error}`, 'error');
                await this.showManualInstructions();
            }
        } catch (error) {
            console.error('Update download failed:', error);
            this.showNotification(`Fehler beim Herunterladen: ${error.message}`, 'error');
            await this.showManualInstructions();
        } finally {
            this.updateDownloadBtn.disabled = false;
            this.updateDownloadBtn.textContent = '📥 Update installieren';
        }
    }

    /**
     * Zeigt Anleitung zum Server-Neustart
     */
    showRestartInstructions() {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-lg p-8 max-w-lg">
                <h3 class="text-2xl font-bold mb-4">✅ Update heruntergeladen!</h3>
                <div class="text-gray-300 mb-6">
                    <p class="mb-4">Das Update wurde erfolgreich heruntergeladen.</p>
                    <p class="mb-4"><strong>Nächste Schritte:</strong></p>
                    <ol class="list-decimal list-inside space-y-2 text-sm">
                        <li>Stoppe den Server (Ctrl+C im Terminal)</li>
                        <li>Starte den Server neu mit <code class="bg-gray-700 px-2 py-1 rounded">npm start</code></li>
                        <li>Die neue Version ist dann aktiv</li>
                    </ol>
                </div>
                <button class="bg-blue-600 px-6 py-2 rounded hover:bg-blue-700 w-full" data-action="close-modal">
                    Verstanden
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Add event listener for close button
        modal.querySelector('[data-action="close-modal"]').addEventListener('click', () => {
            modal.remove();
        });
    }

    /**
     * Zeigt manuelle Update-Anleitung
     */
    async showManualInstructions() {
        try {
            const response = await fetch('/api/update/instructions');
            const data = await response.json();

            if (data.success) {
                const instructions = data.instructions;

                const methodTitle = instructions.method === 'git' ?
                    'Update via Git' : 'Update via ZIP-Download';

                const modal = document.createElement('div');
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto';
                modal.innerHTML = `
                    <div class="bg-gray-800 rounded-lg p-8 max-w-2xl my-8">
                        <h3 class="text-2xl font-bold mb-4">📖 ${this.escapeHtml(methodTitle)}</h3>

                        <div class="mb-6">
                            <p class="text-gray-300 mb-4">
                                ${instructions.method === 'git'
                                    ? 'Dein Projekt ist ein Git-Repository. Folge diesen Schritten für ein automatisches Update:'
                                    : 'Dein Projekt wurde als ZIP-Datei installiert. Du kannst dennoch automatisch updaten!'}
                            </p>
                            <ol class="list-decimal list-inside space-y-2 text-sm text-gray-300 bg-gray-900 p-4 rounded">
                                ${instructions.steps.map(step => `<li>${this.escapeHtml(step)}</li>`).join('')}
                            </ol>
                        </div>

                        <div class="bg-blue-900 bg-opacity-30 border border-blue-500 rounded p-4 mb-6">
                            <p class="text-sm text-blue-200">
                                <strong>💡 Tipp:</strong> Das automatische Update funktioniert sowohl für Git- als auch für ZIP-Installationen!
                                Klicke einfach auf "Update installieren" im Banner.
                            </p>
                        </div>

                        <div class="flex gap-2">
                            <a href="${this.currentUpdateInfo.releaseUrl}" target="_blank" class="bg-blue-600 px-6 py-2 rounded hover:bg-blue-700 flex-1 text-center">
                                🌐 Zu GitHub Release
                            </a>
                            <button class="bg-gray-600 px-6 py-2 rounded hover:bg-gray-700" data-action="close-modal">
                                Schließen
                            </button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                
                // Add event listener for close button
                modal.querySelector('[data-action="close-modal"]').addEventListener('click', () => {
                    modal.remove();
                });
            }
        } catch (error) {
            console.error('Failed to get instructions:', error);
        }
    }

    /**
     * Zeigt Benachrichtigung
     */
    showNotification(message, type = 'info') {
        const colors = {
            success: 'bg-green-600',
            error: 'bg-red-600',
            info: 'bg-blue-600'
        };

        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    /**
     * HTML-Escaping
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Update UI initialisieren
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.updateUI = new UpdateUI();
    });
} else {
    window.updateUI = new UpdateUI();
}
