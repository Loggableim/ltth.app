/**
 * Electron Settings UI Component
 * 
 * Provides UI for managing Electron-specific settings like window behavior,
 * system tray, auto-start, and config paths.
 */

(function() {
  'use strict';

  // Check if running in Electron
  if (!window.electronAPI || !window.electronAPI.isElectron) {
    console.log('[ElectronSettings] Not running in Electron, component disabled');
    return;
  }

  console.log('[ElectronSettings] Initializing Electron settings component');

  /**
   * Initialize Electron settings tab
   */
  async function initElectronSettings() {
    const container = document.getElementById('electron-settings-container');
    if (!container) {
      console.warn('[ElectronSettings] Container element not found');
      return;
    }

    try {
      // Load current settings
      const settings = await window.electronAPI.settings.getAll();
      const configInfo = await window.electronAPI.config.getInfo();
      const appVersion = await window.electronAPI.app.getVersion();
      const settingsInfo = await window.electronAPI.settings.getInfo();

      // Render settings UI
      container.innerHTML = renderSettingsUI(settings, configInfo, appVersion, settingsInfo);

      // Attach event listeners
      attachEventListeners();

      console.log('[ElectronSettings] Initialized successfully');
    } catch (error) {
      console.error('[ElectronSettings] Failed to initialize:', error);
      container.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error:</strong> Failed to load Electron settings. ${error.message}
        </div>
      `;
    }
  }

  /**
   * Render settings UI HTML
   */
  function renderSettingsUI(settings, configInfo, version, settingsInfo) {
    return `
      <div class="electron-settings">
        <!-- Header -->
        <div class="card mb-4">
          <div class="card-header">
            <h5 class="mb-0">
              <i class="fas fa-desktop"></i>
              Electron Desktop Settings
            </h5>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6">
                <p class="mb-1"><strong>App Version:</strong> ${version}</p>
                <p class="mb-1"><strong>Platform:</strong> ${window.electronAPI.platform}</p>
                <p class="mb-1"><strong>First Run:</strong> ${new Date(settings.app.firstRunDate).toLocaleString()}</p>
                <p class="mb-1"><strong>Last Run:</strong> ${new Date(settings.app.lastRunDate).toLocaleString()}</p>
              </div>
              <div class="col-md-6">
                <p class="mb-1"><strong>Settings Path:</strong></p>
                <div class="input-group input-group-sm mb-2">
                  <input type="text" class="form-control" value="${settingsInfo.path}" readonly>
                  <button class="btn btn-outline-secondary" onclick="window.electronAPI.app.showItemInFolder('${settingsInfo.path}')">
                    <i class="fas fa-folder-open"></i>
                  </button>
                </div>
                <p class="mb-1"><strong>Config Directory:</strong></p>
                <div class="input-group input-group-sm">
                  <input type="text" class="form-control" value="${configInfo.activeConfigDir}" readonly>
                  <button class="btn btn-outline-secondary" onclick="window.electronAPI.app.openPath('${configInfo.activeConfigDir}')">
                    <i class="fas fa-folder-open"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Window Settings -->
        <div class="card mb-4">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-window-maximize"></i>
              Window Behavior
            </h6>
          </div>
          <div class="card-body">
            <p class="text-muted small mb-3">Control how the application window behaves when minimized or closed.</p>
            
            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="setting-tray-enabled" 
                     ${settings.tray?.enabled ? 'checked' : ''}>
              <label class="form-check-label" for="setting-tray-enabled">
                <strong>Enable System Tray</strong>
                <span class="d-block text-muted small">Show app icon in system tray</span>
              </label>
            </div>

            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="setting-minimize-to-tray" 
                     ${settings.tray?.minimizeToTray ? 'checked' : ''}>
              <label class="form-check-label" for="setting-minimize-to-tray">
                <strong>Minimize to Tray</strong>
                <span class="d-block text-muted small">Minimize to system tray instead of taskbar</span>
              </label>
            </div>

            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="setting-close-to-tray" 
                     ${settings.tray?.closeToTray ? 'checked' : ''}>
              <label class="form-check-label" for="setting-close-to-tray">
                <strong>Close to Tray</strong>
                <span class="d-block text-muted small">Keep app running in background when closed</span>
              </label>
            </div>

            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="setting-start-minimized" 
                     ${settings.tray?.startMinimized ? 'checked' : ''}>
              <label class="form-check-label" for="setting-start-minimized">
                <strong>Start Minimized</strong>
                <span class="d-block text-muted small">Start app in system tray</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Startup Settings -->
        <div class="card mb-4">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-rocket"></i>
              Startup Settings
            </h6>
          </div>
          <div class="card-body">
            <p class="text-muted small mb-3">Configure how the application starts.</p>
            
            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="setting-autostart-enabled" 
                     ${settings.autostart?.enabled ? 'checked' : ''}>
              <label class="form-check-label" for="setting-autostart-enabled">
                <strong>Launch on System Startup</strong>
                <span class="d-block text-muted small">Automatically start app when system boots</span>
              </label>
            </div>

            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="setting-autostart-minimized" 
                     ${settings.autostart?.minimized ? 'checked' : ''}>
              <label class="form-check-label" for="setting-autostart-minimized">
                <strong>Start Minimized on Autostart</strong>
                <span class="d-block text-muted small">Start in tray when auto-starting</span>
              </label>
            </div>

            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="setting-server-autostart" 
                     ${settings.server?.autoStart ? 'checked' : ''}>
              <label class="form-check-label" for="setting-server-autostart">
                <strong>Auto-Start Backend Server</strong>
                <span class="d-block text-muted small">Automatically start Express server on app launch</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Update Settings -->
        <div class="card mb-4">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-download"></i>
              Update Settings
            </h6>
          </div>
          <div class="card-body">
            <p class="text-muted small mb-3">Configure automatic update behavior.</p>
            
            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="setting-auto-check-updates" 
                     ${settings.updates?.autoCheck ? 'checked' : ''}>
              <label class="form-check-label" for="setting-auto-check-updates">
                <strong>Auto-Check for Updates</strong>
                <span class="d-block text-muted small">Automatically check for new versions</span>
              </label>
            </div>

            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="setting-auto-download-updates" 
                     ${settings.updates?.autoDownload ? 'checked' : ''}>
              <label class="form-check-label" for="setting-auto-download-updates">
                <strong>Auto-Download Updates</strong>
                <span class="d-block text-muted small">Automatically download updates in background</span>
              </label>
            </div>

            <div class="mb-3">
              <label class="form-label">Update Channel</label>
              <select class="form-select" id="setting-update-channel">
                <option value="stable" ${settings.updates?.channel === 'stable' ? 'selected' : ''}>Stable (Recommended)</option>
                <option value="beta" ${settings.updates?.channel === 'beta' ? 'selected' : ''}>Beta (Early Access)</option>
              </select>
              <div class="form-text">Select which update channel to follow</div>
            </div>

            <button class="btn btn-primary btn-sm" id="btn-check-updates">
              <i class="fas fa-sync"></i> Check for Updates Now
            </button>
          </div>
        </div>

        <!-- Config Paths -->
        <div class="card mb-4">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-folder"></i>
              Storage Locations
            </h6>
          </div>
          <div class="card-body">
            <p class="text-muted small mb-3">
              Configure where your settings, uploads, and data are stored.
              <strong>These locations survive app updates!</strong>
            </p>
            
            <div class="mb-3">
              <label class="form-label">Current Config Directory</label>
              <div class="input-group">
                <input type="text" class="form-control" value="${configInfo.activeConfigDir}" readonly>
                <button class="btn btn-outline-secondary" onclick="window.electronAPI.app.openPath('${configInfo.activeConfigDir}')">
                  <i class="fas fa-folder-open"></i> Open
                </button>
              </div>
              ${configInfo.isUsingCustomPath 
                ? '<div class="form-text text-success">Using custom path</div>'
                : '<div class="form-text">Using default platform path</div>'}
            </div>

            <div class="mb-3">
              <label class="form-label">Storage Information</label>
              <ul class="list-unstyled small mb-0">
                <li><strong>User Configs:</strong> <code>${configInfo.userConfigsDir}</code></li>
                <li><strong>User Data:</strong> <code>${configInfo.userDataDir}</code></li>
                <li><strong>Uploads:</strong> <code>${configInfo.uploadsDir}</code></li>
              </ul>
            </div>

            <div class="btn-group" role="group">
              <button class="btn btn-outline-primary btn-sm" id="btn-set-custom-path">
                <i class="fas fa-folder"></i> Set Custom Path
              </button>
              <button class="btn btn-outline-secondary btn-sm" id="btn-reset-to-default-path">
                <i class="fas fa-undo"></i> Reset to Default
              </button>
            </div>
          </div>
        </div>

        <!-- Backup & Restore -->
        <div class="card mb-4">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-shield-alt"></i>
              Backup & Restore
            </h6>
          </div>
          <div class="card-body">
            <p class="text-muted small mb-3">
              Settings are automatically backed up. You can also create manual backups or restore from a previous state.
              <strong>Backups: ${settingsInfo.backupCount}</strong>
            </p>
            
            <div class="btn-group mb-3" role="group">
              <button class="btn btn-success btn-sm" id="btn-create-backup">
                <i class="fas fa-save"></i> Create Backup
              </button>
              <button class="btn btn-info btn-sm" id="btn-view-backups">
                <i class="fas fa-list"></i> View Backups
              </button>
              <button class="btn btn-warning btn-sm" id="btn-export-settings">
                <i class="fas fa-file-export"></i> Export
              </button>
              <button class="btn btn-warning btn-sm" id="btn-import-settings">
                <i class="fas fa-file-import"></i> Import
              </button>
            </div>

            <div id="backups-list" class="mt-3"></div>
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="card border-danger mb-4">
          <div class="card-header bg-danger text-white">
            <h6 class="mb-0">
              <i class="fas fa-exclamation-triangle"></i>
              Danger Zone
            </h6>
          </div>
          <div class="card-body">
            <p class="text-muted small mb-3">These actions cannot be undone without a backup.</p>
            
            <div class="btn-group" role="group">
              <button class="btn btn-outline-danger btn-sm" id="btn-reset-settings">
                <i class="fas fa-redo"></i> Reset All Settings
              </button>
              <button class="btn btn-outline-danger btn-sm" id="btn-restart-app">
                <i class="fas fa-sync"></i> Restart App
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to UI elements
   */
  function attachEventListeners() {
    // Window behavior settings
    document.getElementById('setting-tray-enabled')?.addEventListener('change', async (e) => {
      await window.electronAPI.settings.set('tray.enabled', e.target.checked);
      showToast('Settings saved', 'success');
    });

    document.getElementById('setting-minimize-to-tray')?.addEventListener('change', async (e) => {
      await window.electronAPI.settings.set('tray.minimizeToTray', e.target.checked);
      showToast('Settings saved', 'success');
    });

    document.getElementById('setting-close-to-tray')?.addEventListener('change', async (e) => {
      await window.electronAPI.settings.set('tray.closeToTray', e.target.checked);
      showToast('Settings saved', 'success');
    });

    document.getElementById('setting-start-minimized')?.addEventListener('change', async (e) => {
      await window.electronAPI.settings.set('tray.startMinimized', e.target.checked);
      showToast('Settings saved', 'success');
    });

    // Startup settings
    document.getElementById('setting-autostart-enabled')?.addEventListener('change', async (e) => {
      await window.electronAPI.settings.set('autostart.enabled', e.target.checked);
      showToast('Settings saved', 'success');
    });

    document.getElementById('setting-autostart-minimized')?.addEventListener('change', async (e) => {
      await window.electronAPI.settings.set('autostart.minimized', e.target.checked);
      showToast('Settings saved', 'success');
    });

    document.getElementById('setting-server-autostart')?.addEventListener('change', async (e) => {
      await window.electronAPI.settings.set('server.autoStart', e.target.checked);
      showToast('Settings saved', 'success');
    });

    // Update settings
    document.getElementById('setting-auto-check-updates')?.addEventListener('change', async (e) => {
      await window.electronAPI.settings.set('updates.autoCheck', e.target.checked);
      showToast('Settings saved', 'success');
    });

    document.getElementById('setting-auto-download-updates')?.addEventListener('change', async (e) => {
      await window.electronAPI.settings.set('updates.autoDownload', e.target.checked);
      showToast('Settings saved', 'success');
    });

    document.getElementById('setting-update-channel')?.addEventListener('change', async (e) => {
      await window.electronAPI.settings.set('updates.channel', e.target.value);
      showToast('Settings saved', 'success');
    });

    // Buttons
    document.getElementById('btn-check-updates')?.addEventListener('click', async () => {
      showToast('Update check not yet implemented', 'info');
    });

    document.getElementById('btn-set-custom-path')?.addEventListener('click', async () => {
      // This would need a folder picker dialog
      showToast('Custom path selection not yet implemented', 'info');
    });

    document.getElementById('btn-reset-to-default-path')?.addEventListener('click', async () => {
      if (confirm('Reset to default storage location? This will require app restart.')) {
        const result = await window.electronAPI.config.resetToDefault();
        if (result.success) {
          showToast('Reset to default path. Restarting...', 'success');
          setTimeout(() => window.electronAPI.app.restart(), 2000);
        }
      }
    });

    document.getElementById('btn-create-backup')?.addEventListener('click', async () => {
      const result = await window.electronAPI.settings.createBackup();
      if (result.success) {
        showToast('Backup created successfully', 'success');
        // Reload backups list
        await loadBackupsList();
      } else {
        showToast(`Failed to create backup: ${result.error}`, 'error');
      }
    });

    document.getElementById('btn-view-backups')?.addEventListener('click', async () => {
      await loadBackupsList();
    });

    document.getElementById('btn-export-settings')?.addEventListener('click', async () => {
      showToast('Export functionality not yet implemented', 'info');
    });

    document.getElementById('btn-import-settings')?.addEventListener('click', async () => {
      showToast('Import functionality not yet implemented', 'info');
    });

    document.getElementById('btn-reset-settings')?.addEventListener('click', async () => {
      if (confirm('Reset all settings to defaults? This cannot be undone (unless you have a backup).')) {
        await window.electronAPI.settings.reset();
        showToast('Settings reset. Reloading...', 'success');
        setTimeout(() => location.reload(), 2000);
      }
    });

    document.getElementById('btn-restart-app')?.addEventListener('click', async () => {
      if (confirm('Restart the application?')) {
        await window.electronAPI.app.restart();
      }
    });
  }

  /**
   * Load and display backups list
   */
  async function loadBackupsList() {
    const container = document.getElementById('backups-list');
    if (!container) return;

    try {
      const backups = await window.electronAPI.settings.getBackups();
      
      if (backups.length === 0) {
        container.innerHTML = '<p class="text-muted small">No backups available.</p>';
        return;
      }

      container.innerHTML = `
        <div class="table-responsive">
          <table class="table table-sm table-hover">
            <thead>
              <tr>
                <th>Date</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${backups.map(backup => `
                <tr>
                  <td>${new Date(backup.date).toLocaleString()}</td>
                  <td>${formatBytes(backup.size)}</td>
                  <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="restoreBackup('${backup.path}')">
                      <i class="fas fa-undo"></i> Restore
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (error) {
      container.innerHTML = `<div class="alert alert-danger small">Failed to load backups: ${error.message}</div>`;
    }
  }

  /**
   * Restore from backup
   */
  window.restoreBackup = async function(backupPath) {
    if (!confirm('Restore settings from this backup? Current settings will be backed up first.')) {
      return;
    }

    try {
      const result = await window.electronAPI.settings.restoreBackup(backupPath);
      if (result.success) {
        showToast('Settings restored. Reloading...', 'success');
        setTimeout(() => location.reload(), 2000);
      } else {
        showToast(`Failed to restore: ${result.error}`, 'error');
      }
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error');
    }
  };

  /**
   * Show toast notification
   */
  function showToast(message, type = 'info') {
    // Use existing toast system or console log
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // If Socket.io is available, use it
    if (window.socket) {
      window.socket.emit('show-notification', { message, type });
    }
  }

  /**
   * Format bytes to human-readable size
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initElectronSettings);
  } else {
    initElectronSettings();
  }

})();
