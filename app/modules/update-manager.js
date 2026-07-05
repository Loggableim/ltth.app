/**
 * Git-based update manager.
 *
 * The backend runs from a Git checkout in this snapshot, so updates are now
 * implemented as a fetch + fast-forward reset against the tracked upstream
 * branch. Local changes are refused up front to avoid overwriting user work.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

class UpdateManager {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.githubRepo = options.githubRepo || 'Loggableim/ltth.app';
    this.appRoot = options.appRoot || path.join(__dirname, '..');
    this.repoRoot = options.repoRoot || path.resolve(this.appRoot, '..');
    this.releaseUrl = `https://github.com/${this.githubRepo}/releases/latest`;
    this.currentVersion = this.getCurrentVersion();
    this.backupDir = path.join(this.repoRoot, '.backups');
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.execImpl = options.execImpl || execFileAsync;
    this.isGitRepo = options.isGitRepo ?? this.checkIsGitRepo();
  }

  getCurrentVersion() {
    try {
      const packagePath = path.join(this.appRoot, 'package.json');
      const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return packageData.version || '0.0.0';
    } catch (error) {
      this.logger?.warn(`Could not read current version: ${error.message}`);
      return '0.0.0';
    }
  }

  checkIsGitRepo() {
    try {
      return fs.existsSync(path.join(this.repoRoot, '.git'));
    } catch (error) {
      this.logger?.warn(`Could not determine Git repository state: ${error.message}`);
      return false;
    }
  }

  async runCommand(command, args, options = {}) {
    const result = await this.execImpl(command, args, {
      cwd: options.cwd || this.repoRoot,
      env: options.env || process.env,
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024
    });

    return {
      stdout: String(result?.stdout ?? ''),
      stderr: String(result?.stderr ?? '')
    };
  }

  async runGit(args, options = {}) {
    return this.runCommand(process.platform === 'win32' ? 'git.exe' : 'git', args, options);
  }

  async runNpm(args, options = {}) {
    const env = Object.assign({}, process.env, options.env || {}, {
      PUPPETEER_SKIP_DOWNLOAD: 'true',
      YOUTUBE_DL_SKIP_PYTHON_CHECK: '1'
    });

    return this.runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
      cwd: options.cwd || this.appRoot,
      env,
      maxBuffer: options.maxBuffer
    });
  }

  parseVersion(value) {
    const normalized = String(value || '')
      .trim()
      .replace(/^v/i, '')
      .split('+')[0]
      .split('-')[0];

    return normalized || '0.0.0';
  }

  compareVersions(v1, v2) {
    const parts1 = this.parseVersion(v1).split('.').map(n => parseInt(n, 10) || 0);
    const parts2 = this.parseVersion(v2).split('.').map(n => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }

  async getGitStatus() {
    if (!this.isGitRepo) {
      return {
        isGitRepo: false,
        isDirty: false,
        head: null,
        branch: null,
        upstreamRef: null
      };
    }

    const [statusResult, headResult, branchResult, upstreamResult] = await Promise.all([
      this.runGit(['status', '--porcelain']),
      this.runGit(['rev-parse', 'HEAD']),
      this.runGit(['branch', '--show-current']),
      this.runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => ({ stdout: '' }))
    ]);

    return {
      isGitRepo: true,
      isDirty: Boolean(statusResult.stdout.trim()),
      head: headResult.stdout.trim() || null,
      branch: branchResult.stdout.trim() || null,
      upstreamRef: upstreamResult.stdout.trim() || 'origin/main'
    };
  }

  async fetchLatestRelease() {
    if (typeof this.fetchImpl !== 'function') {
      return null;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 10000) : null;

    try {
      const response = await this.fetchImpl(`https://api.github.com/repos/${this.githubRepo}/releases/latest`, {
        headers: {
          'User-Agent': 'ltth.app-update-manager',
          Accept: 'application/vnd.github+json'
        },
        signal: controller?.signal
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }

        throw new Error(`GitHub release check failed with HTTP ${response.status}`);
      }

      const release = await response.json();
      return {
        version: this.parseVersion(release.tag_name),
        name: release.name || release.tag_name || null,
        notes: release.body || null,
        publishedAt: release.published_at || null,
        url: release.html_url || this.releaseUrl,
        downloadUrl: release.zipball_url || null
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async getRemoteCommit(ref) {
    if (!ref) {
      return null;
    }

    const result = await this.runGit(['rev-parse', ref]);
    return result.stdout.trim() || null;
  }

  async getAheadBehindCounts(ref) {
    if (!ref) {
      return { ahead: 0, behind: 0 };
    }

    const result = await this.runGit(['rev-list', '--left-right', '--count', `HEAD...${ref}`]);
    const [aheadRaw, behindRaw] = result.stdout.trim().split(/\s+/);

    return {
      ahead: parseInt(aheadRaw, 10) || 0,
      behind: parseInt(behindRaw, 10) || 0
    };
  }

  async checkForUpdates() {
    if (!this.isGitRepo) {
      this.logger?.info('Auto-update is disabled because the workspace is not a Git checkout.');
      return this.disabledResult('Auto-update requires a Git checkout.');
    }

    const status = await this.getGitStatus();
    let release = null;
    let releaseError = null;

    try {
      release = await this.fetchLatestRelease();
    } catch (error) {
      releaseError = error;
      this.logger?.warn(`GitHub release check failed: ${error.message}`);
    }

    const counts = await this.getAheadBehindCounts(status.upstreamRef).catch(error => {
      this.logger?.warn(`Git status comparison failed: ${error.message}`);
      return { ahead: 0, behind: 0 };
    });

    const currentVersion = this.currentVersion;
    const latestVersion = release?.version || currentVersion;
    const versionComparison = this.compareVersions(latestVersion, currentVersion);
    const available = versionComparison > 0 || counts.behind > 0;

    return {
      success: true,
      disabled: false,
      available,
      currentVersion,
      latestVersion,
      releaseUrl: release?.url || this.releaseUrl,
      releaseName: release?.name || null,
      releaseNotes: release?.notes || null,
      publishedAt: release?.publishedAt || null,
      downloadUrl: release?.downloadUrl || null,
      updateMethod: 'git',
      updateCommand: 'git pull --ff-only',
      gitRepo: this.githubRepo,
      branch: status.branch,
      upstreamRef: status.upstreamRef,
      gitHead: status.head,
      behindCount: counts.behind,
      aheadCount: counts.ahead,
      message: available
        ? `Update available${release?.version ? `: ${latestVersion}` : ''}.`
        : 'Already up to date.',
      releaseCheckError: releaseError ? releaseError.message : null
    };
  }

  async performUpdate() {
    if (!this.isGitRepo) {
      this.logger?.warn('Auto-update is disabled because the workspace is not a Git checkout.');
      return this.disabledResult('Auto-update requires a Git checkout.');
    }

    const status = await this.getGitStatus();

    if (status.isDirty) {
      return {
        success: false,
        disabled: false,
        available: false,
        currentVersion: this.currentVersion,
        error: 'Working tree must be clean before running an update.',
        needsRestart: false
      };
    }

    const snapshot = {
      head: status.head,
      branch: status.branch,
      upstreamRef: status.upstreamRef
    };

    try {
      await this.runGit(['fetch', '--prune', 'origin']);

      const remoteHead = await this.getRemoteCommit(snapshot.upstreamRef);
      if (!remoteHead) {
        throw new Error(`Could not resolve upstream ref ${snapshot.upstreamRef}`);
      }

      if (remoteHead === snapshot.head) {
        this.currentVersion = this.getCurrentVersion();
        return {
          success: true,
          disabled: false,
          available: false,
          currentVersion: this.currentVersion,
          updatedVersion: this.currentVersion,
          message: 'Already up to date.',
          needsRestart: false,
          updateMethod: 'git',
          gitHead: snapshot.head
        };
      }

      await this.runGit(['reset', '--hard', remoteHead]);

      const dependencyUpdate = await this.updateDependencies({
        beforeHead: snapshot.head,
        afterHead: remoteHead
      });

      this.currentVersion = this.getCurrentVersion();

      return {
        success: true,
        disabled: false,
        available: true,
        currentVersion: this.currentVersion,
        updatedVersion: this.currentVersion,
        previousHead: snapshot.head,
        gitHead: remoteHead,
        needsRestart: true,
        updateMethod: 'git',
        dependencyUpdated: dependencyUpdate.updated,
        dependencyCommand: dependencyUpdate.command || null,
        message: dependencyUpdate.updated
          ? 'Update installed via Git and dependencies refreshed.'
          : 'Update installed via Git.'
      };
    } catch (error) {
      this.logger?.error(`Git update failed: ${error.message}`);

      const rollbackResult = await this.performRollback(snapshot).catch(rollbackError => ({
        success: false,
        error: rollbackError.message
      }));

      return {
        success: false,
        disabled: false,
        available: false,
        currentVersion: this.currentVersion,
        error: error.message,
        rolledBack: rollbackResult.success,
        rollbackError: rollbackResult.success ? null : rollbackResult.error,
        needsRestart: false
      };
    }
  }

  async updateViaGit() {
    return this.performUpdate();
  }

  async updateViaZip() {
    return {
      success: false,
      disabled: false,
      available: false,
      currentVersion: this.currentVersion,
      error: 'ZIP-based updates are not supported in this Git-backed snapshot.'
    };
  }

  async updateDependencies(options = {}) {
    const beforeHead = options.beforeHead || null;
    const afterHead = options.afterHead || null;

    let shouldUpdate = Boolean(options.force);
    let command = null;

    if (!shouldUpdate && beforeHead && afterHead) {
      const result = await this.runGit([
        'diff',
        '--name-only',
        beforeHead,
        afterHead,
        '--',
        'package.json',
        'package-lock.json',
        'app/package.json',
        'app/package-lock.json'
      ]);

      const changedFiles = result.stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

      shouldUpdate = changedFiles.some(file =>
        file === 'package.json' ||
        file === 'package-lock.json' ||
        file === 'app/package.json' ||
        file === 'app/package-lock.json'
      );
    }

    if (!shouldUpdate) {
      return {
        success: true,
        updated: false,
        command: null
      };
    }

    const lockPath = path.join(this.appRoot, 'package-lock.json');
    const useCI = fs.existsSync(lockPath);
    const npmArgs = useCI ? ['ci'] : ['install'];
    command = `npm ${npmArgs.join(' ')}`;

    try {
      await this.runNpm(npmArgs, { cwd: this.appRoot });
      return {
        success: true,
        updated: true,
        command
      };
    } catch (error) {
      if (useCI) {
        this.logger?.warn(`npm ci failed, falling back to npm install: ${error.message}`);
        await this.runNpm(['install'], { cwd: this.appRoot });
        return {
          success: true,
          updated: true,
          command: 'npm install'
        };
      }

      throw new Error(`Dependency update failed: ${error.message}`);
    }
  }

  async createBackup() {
    if (!this.isGitRepo) {
      return {
        success: false,
        disabled: true,
        error: 'Backups require a Git checkout.'
      };
    }

    const status = await this.getGitStatus();
    return {
      success: true,
      disabled: false,
      backup: {
        head: status.head,
        branch: status.branch,
        upstreamRef: status.upstreamRef,
        currentVersion: this.currentVersion
      }
    };
  }

  async performRollback(snapshot) {
    if (!this.isGitRepo) {
      return {
        success: false,
        disabled: true,
        error: 'Rollback requires a Git checkout.'
      };
    }

    const head = typeof snapshot === 'string' ? snapshot : snapshot?.head;
    if (!head) {
      return {
        success: false,
        disabled: false,
        error: 'Rollback target is missing.'
      };
    }

    await this.runGit(['reset', '--hard', head]);
    await this.updateDependencies({ force: true });
    this.currentVersion = this.getCurrentVersion();

    return {
      success: true,
      disabled: false,
      rolledBackTo: head,
      currentVersion: this.currentVersion
    };
  }

  startAutoCheck(intervalHours = 24) {
    this.stopAutoCheck();

    this.checkForUpdates().catch(error => {
      this.logger?.warn(`Initial update check failed: ${error.message}`);
    });

    const intervalMs = Math.max(1, Number(intervalHours) || 24) * 60 * 60 * 1000;
    this.checkInterval = setInterval(() => {
      this.checkForUpdates().catch(error => {
        this.logger?.warn(`Scheduled update check failed: ${error.message}`);
      });
    }, intervalMs);
  }

  stopAutoCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  disabledResult(message) {
    return {
      success: false,
      disabled: true,
      available: false,
      currentVersion: this.currentVersion,
      error: message || 'Auto-update is disabled for this local snapshot.'
    };
  }
}

module.exports = UpdateManager;
