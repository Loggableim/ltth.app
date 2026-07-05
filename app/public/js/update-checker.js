/**
 * Update UI for Git-backed updates.
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
    if (this.updateDownloadBtn) {
      this.updateDownloadBtn.addEventListener('click', () => this.handleDownload());
    }

    if (this.updateDismissBtn) {
      this.updateDismissBtn.addEventListener('click', () => this.dismissBanner());
    }

    this.updateTitleWithVersion();
    this.checkForUpdates();
  }

  disableUpdateControls() {
    if (this.updateBanner) {
      this.updateBanner.classList.add('hidden');
    }

    if (this.updateDownloadBtn) {
      this.updateDownloadBtn.disabled = true;
      this.updateDownloadBtn.textContent = 'Keine Updates verfügbar';
    }
  }

  async updateTitleWithVersion() {
    try {
      const response = await fetch('/api/update/current');
      const data = await response.json();

      if (data.success && data.version) {
        this.currentVersion = data.version;

        const baseTitle = "Pup Cid's Little TikTool Helper";
        document.title = `${baseTitle} ${data.version}`;

        const headerTitle = document.querySelector('.topbar-title');
        if (headerTitle) {
          headerTitle.textContent = `${baseTitle} ${data.version}`;
        }
      }
    } catch (error) {
      console.warn('[Version] Could not fetch version:', error);
    }
  }

  async checkForUpdates() {
    try {
      const response = await fetch('/api/update/check');
      const data = await response.json();

      if (data.success && data.available) {
        this.currentUpdateInfo = data;
        this.showUpdateBanner(data);
        return;
      }
    } catch (error) {
      console.warn('[Update] Could not fetch update status:', error);
    }

    this.disableUpdateControls();
  }

  showUpdateBanner(updateInfo) {
    if (!this.updateBanner) return;

    const dismissedVersion = sessionStorage.getItem('update-dismissed-version');
    if (dismissedVersion === updateInfo.latestVersion) {
      return;
    }

    this.currentUpdateInfo = updateInfo;

    if (this.updateVersionInfo) {
      this.updateVersionInfo.textContent =
        `Version ${updateInfo.latestVersion} ist verfügbar (aktuell: ${updateInfo.currentVersion})`;
    }

    this.updateBanner.classList.remove('hidden');

    if (this.updateDownloadBtn) {
      this.updateDownloadBtn.disabled = false;
      this.updateDownloadBtn.textContent = 'Update installieren';
    }
  }

  dismissBanner() {
    if (!this.updateBanner) return;

    this.updateBanner.classList.add('hidden');

    if (this.currentUpdateInfo) {
      sessionStorage.setItem('update-dismissed-version', this.currentUpdateInfo.latestVersion);
    }
  }

  async handleDownload() {
    try {
      if (this.updateDownloadBtn) {
        this.updateDownloadBtn.disabled = true;
      }

      const response = await fetch('/api/update/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      if (data.success) {
        this.showNotification('Update installiert. Bitte den Server neu starten.', 'success');
        this.showRestartInstructions();
        return;
      }

      if (data.disabled) {
        this.showNotification(data.error || 'Update ist derzeit deaktiviert.', 'info');
        await this.showManualInstructions();
        return;
      }

      this.showNotification(data.error || 'Update fehlgeschlagen.', 'error');

      if (data.rolledBack) {
        this.showRestartInstructions();
      }
    } catch (error) {
      console.error('Update download failed:', error);
      this.showNotification('Update konnte nicht installiert werden.', 'error');
    } finally {
      if (this.updateDownloadBtn) {
        this.updateDownloadBtn.disabled = false;
      }
    }
  }

  showRestartInstructions() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-lg p-8 max-w-lg">
        <h3 class="text-2xl font-bold mb-4">Update installiert</h3>
        <div class="text-gray-300 mb-6">
          <p class="mb-4">Das Update wurde erfolgreich installiert.</p>
          <p class="mb-4"><strong>Nächste Schritte:</strong></p>
          <ol class="list-decimal list-inside space-y-2 text-sm">
            <li>Server stoppen (Ctrl+C im Terminal)</li>
            <li>Server mit <code class="bg-gray-700 px-2 py-1 rounded">npm start</code> neu starten</li>
            <li>Die neue Version ist danach aktiv</li>
          </ol>
        </div>
        <button class="bg-blue-600 px-6 py-2 rounded hover:bg-blue-700 w-full" data-action="close-modal">
          Verstanden
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('[data-action="close-modal"]').addEventListener('click', () => {
      modal.remove();
    });
  }

  async showManualInstructions() {
    try {
      const response = await fetch('/api/update/instructions');
      const data = await response.json();

      if (!data.success) {
        return;
      }

      const instructions = data.instructions;
      const methodTitle = 'Update über Git';

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto';
      modal.innerHTML = `
        <div class="bg-gray-800 rounded-lg p-8 max-w-2xl my-8">
          <h3 class="text-2xl font-bold mb-4">📖 ${this.escapeHtml(methodTitle)}</h3>

          <div class="mb-6">
            <p class="text-gray-300 mb-4">
              Das Projekt ist ein Git-Repository. Folge diesen Schritten für ein Git-basiertes Update:
            </p>
            <ol class="list-decimal list-inside space-y-2 text-sm text-gray-300 bg-gray-900 p-4 rounded">
              ${instructions.steps.map(step => `<li>${this.escapeHtml(step)}</li>`).join('')}
            </ol>
          </div>

          <div class="flex gap-2">
            <a href="${this.currentUpdateInfo?.releaseUrl || '#'}" target="_blank" rel="noopener noreferrer" class="bg-blue-600 px-6 py-2 rounded hover:bg-blue-700 flex-1 text-center">
              GitHub Release öffnen
            </a>
            <button class="bg-gray-600 px-6 py-2 rounded hover:bg-gray-700" data-action="close-modal">
              Schließen
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('[data-action="close-modal"]').addEventListener('click', () => {
        modal.remove();
      });
    } catch (error) {
      console.error('Failed to get instructions:', error);
    }
  }

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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.updateUI = new UpdateUI();
  });
} else {
  window.updateUI = new UpdateUI();
}
