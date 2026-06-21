/**
 * Update manager stub.
 *
 * The local snapshot must never overwrite itself from GitHub or release ZIPs.
 * Keep the public API for dashboard/server compatibility, but make every
 * updater entry point a no-op.
 */

const fs = require('fs');
const path = require('path');

class UpdateManager {
  constructor(logger) {
    this.logger = logger;
    this.githubRepo = 'Loggableim/pupcidslittletiktokhelper';
    this.projectRoot = path.join(__dirname, '..');
    this.currentVersion = this.getCurrentVersion();
    this.backupDir = path.join(this.projectRoot, '.backups');
    this.isGitRepo = false;
    this.disabled = true;
  }

  getCurrentVersion() {
    try {
      const packagePath = path.join(this.projectRoot, 'package.json');
      const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return packageData.version || '0.0.0';
    } catch (error) {
      this.logger?.warn(`Could not read current version: ${error.message}`);
      return '0.0.0';
    }
  }

  getInstallerUrl(version) {
    void version;
    return null;
  }

  async checkForUpdates() {
    this.logger?.info('Auto-update is disabled; skipping remote release check.');
    return {
      success: true,
      disabled: true,
      available: false,
      currentVersion: this.currentVersion,
      latestVersion: this.currentVersion,
      updateMethod: 'disabled',
      updateCommand: null,
      message: 'Auto-update is disabled for this local snapshot.'
    };
  }

  async performUpdate() {
    this.logger?.warn('Auto-update is disabled; refusing to download or apply updates.');
    return this.disabledResult();
  }

  async updateViaGit() {
    return this.disabledResult();
  }

  async updateViaZip() {
    return this.disabledResult();
  }

  async updateDependencies() {
    return this.disabledResult();
  }

  async createBackup() {
    return {
      success: false,
      disabled: true,
      error: 'Auto-update backup flow is disabled.'
    };
  }

  async performRollback() {
    return {
      success: false,
      disabled: true,
      error: 'Auto-update rollback flow is disabled.'
    };
  }

  startAutoCheck() {
    this.stopAutoCheck();
    this.logger?.info('Auto-update check is disabled.');
  }

  stopAutoCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  compareVersions(v1, v2) {
    const parts1 = String(v1 || '').split('.').map(n => parseInt(n, 10) || 0);
    const parts2 = String(v2 || '').split('.').map(n => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }

  disabledResult() {
    return {
      success: false,
      disabled: true,
      available: false,
      currentVersion: this.currentVersion,
      error: 'Auto-update is disabled for this local snapshot.'
    };
  }
}

module.exports = UpdateManager;
