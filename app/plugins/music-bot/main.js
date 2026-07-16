const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { execFile } = require('child_process');
const { spawn } = require('child_process');
const { promisify } = require('util');
const EventEmitter = require('events');
const { createHash } = require('crypto');
let YOUTUBE_DL_PATH = 'yt-dlp';
try {
  const youtubeDlExec = require('youtube-dl-exec');
  if (youtubeDlExec && youtubeDlExec.constants && youtubeDlExec.constants.YOUTUBE_DL_PATH) {
    YOUTUBE_DL_PATH = youtubeDlExec.constants.YOUTUBE_DL_PATH;
  }
} catch (_e) {
  // youtube-dl-exec not installed — fallback to system yt-dlp
}
[
  './lib/command-parser',
  './lib/queue-manager',
  './lib/music-resolver',
  './lib/media-cache',
  './lib/track-identity',
  './lib/playback-controller',
  './lib/playback-engine',
  './lib/ban-list',
  './lib/auto-dj'
].forEach((modulePath) => {
  delete require.cache[require.resolve(modulePath)];
});
const CommandParser = require('./lib/command-parser');
const QueueManager = require('./lib/queue-manager');
const MusicResolver = require('./lib/music-resolver');
const MediaCache = require('./lib/media-cache');
const { deriveTrackIdentity } = require('./lib/track-identity');
const PlaybackController = require('./lib/playback-controller');
const BanList = require('./lib/ban-list');
const AutoDJ = require('./lib/auto-dj');

const DEFAULT_PRECACHE_LOOKAHEAD = 2;
const MAX_PRECACHE_LOOKAHEAD = 5;
const MPV_INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

const DEFAULT_CONFIG = {
  enabled: true,
  commandPrefix: '!',
  commands: {
    request: 'sr',
    skip: 'skip',
    queue: 'queue',
    nowPlaying: 'np',
    volume: 'vol',
    pause: 'pause',
    resume: 'resume',
    clear: 'clear',
    mysong: 'mysong',
    help: 'help',
    remove: 'remove'
  },
  commandAliases: {
    request: ['play', 'song', 'request'],
    skip: [],
    queue: ['q', 'list'],
    nowPlaying: ['now', 'playing', 'current'],
    volume: ['v', 'volume'],
    pause: ['stop'],
    resume: ['unpause', 'continue'],
    clear: [],
    mysong: ['mypos', 'myposition', 'wheremysong'],
    help: ['commands', 'cmds', 'hilfe'],
    remove: ['removesong', 'removemy', 'delsong']
  },
  queue: {
    maxLength: 50,
    maxPerUser: 3,
    maxSongDurationSeconds: 360,
    allowDuplicates: false,
    cooldownPerUserSeconds: 30,
    duplicateDetection: 'strict',
    cooldownBypassForGifts: false
  },
  playback: {
    defaultVolume: 50,
    mpvPath: 'mpv',
    audioDevice: 'auto',
    autoPlay: true,
    crossfadeDuration: 3000,
    ducking: {
      enabled: true,
      targetVolumePercent: 35,
      fadeOutMs: 250,
      fadeInMs: 700,
      holdMs: 1100
    },
    normalization: {
      enabled: true,
      integratedLufs: -16,
      truePeakDb: -1.5,
      lra: 11
    }
  },
  permissions: {
    request: 'viewer',
    skip: 'viewer',
    volume: 'mod',
    pause: 'mod',
    resume: 'mod',
    clear: 'streamer',
    mysong: 'viewer',
    help: 'viewer',
    remove: 'viewer',
    requireSuperfanForRequest: false
  },
  voteSkip: {
    enabled: true,
    thresholdPercent: 50,
    minVotes: 3
  },
  giftIntegration: {
    skipImmunityGifts: []
  },
  monetization: {
    payToPlayEnabled: false,
    payToPlayGiftCatalog: [],
    payToPlayMinCoins: 0,
    payToSkipEnabled: false,
    payToSkipGiftCatalog: [],
    likeGateEnabled: false,
    minLikesPerUser: 1
  },
  audio: {
    masterVolume: 100,
    sourceVolume: 50
  },
  autoDJ: {
    enabled: false,
    mode: 'history',
    historyMinPlays: 2,
    historyShuffled: true,
    mixHistoryPercent: 80,
    maxConsecutiveAutoDJ: 10,
    announceAutoDJ: true,
    repeatCooldownHours: 12,
    playlistUrls: [],
    playlistFallbackToRandom: true
  },
  resolver: {
    ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
    searchTimeout: 45000,
    textSearchTimeoutMs: 45000,
    maxConcurrentProcesses: 2,
    maxCacheSizeMB: 2048,
    cacheTTLDays: 30
  },
  moderation: {
    rejectExplicit: false,
    rejectAgeRestricted: true,
    blockedKeywords: []
  },
  fallbackPlaylist: {
    enabled: false,
    tracks: []
  },
  onboarding: {
    completed: false,
    completedAt: null
  },
  safety: {
    locked: true,
    lockedAt: null,
    reason: 'live-safe-migration'
  },
  preCache: {
    enabled: true,
    lookahead: 2,
    maxConcurrentDownloads: 1
  }
};

class MusicBotPlugin extends EventEmitter {
  constructor(api) {
    super();
    this.api = api;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
    this.playbackSyncTimer = null;
    this.crossfadeTimer = null;
    this._autoDjRecoveryTracks = new WeakSet();
    this._pendingTrackAdvance = null;
    this._pendingSkipAdvance = null;
    this._queueAdvanceOperation = null;
    this._lifecycleGeneration = 1;
    this._destroyed = false;
    this._stateTransitions = [];
    this._lastResolverProgress = null;
    this._controllerSafetySyncPromise = Promise.resolve();
    this._configUpdateTail = Promise.resolve();

    // Constructor-only state stays inert for tests and route registration. The
    // persisted/default live-safe lock is applied atomically by _loadConfig().
    this.config = {
      ...DEFAULT_CONFIG,
      safety: { locked: false, lockedAt: null, reason: null }
    };
    this.banList = null;
    this.queueManager = null;
    this.musicResolver = null;
    this.mediaCache = null;
    this.playbackEngine = null;
    this.commandParser = null;
    this.autoDJ = null;
    this._pendingRequests = new Set();
    this._requestCredits = new Map();
    this._userLikes = new Map();
    this.pluginDataDir = null;
    this.cacheDir = null;
    this._precacheTasks = new Map();
    this._pinnedCacheKeys = new Set();
    this._fallbackIndex = 0;
    this._ioEmitOriginal = null;
    this._ttsDuckingHandlers = null;
    this._activeTtsDucks = new Set();
    this._mpvInstallStatus = {
      state: 'idle',
      message: '',
      command: null,
      updatedAt: null
    };
    this._mpvInstallChild = null;
    this._mpvInstallTimer = null;
  }

  async init() {
    this._loadConfig();
    this.pluginDataDir = this.api.ensurePluginDataDir();
    this.cacheDir = path.join(this.pluginDataDir, 'cache');
    await fsp.mkdir(this.cacheDir, { recursive: true });

    await this._ensureYtDlp();
    await this._ensureMpv();

    this.queueManager = new QueueManager(this.config, this.api);
    this.musicResolver = new MusicResolver(
      {
        ...this.config.resolver,
        moderation: this.config.moderation,
        maxDurationSeconds: this.config.queue.maxSongDurationSeconds
      },
      this.api,
      {
        onProgress: (event) => this._handleResolverProgress(event)
      }
    );
    this.mediaCache = new MediaCache({
      ...this.config.resolver,
      ...this.config.preCache,
      cacheDir: this.cacheDir,
      maxConcurrentDownloads: this.config.preCache.maxConcurrentDownloads
    }, this.api, { runner: this.musicResolver.runner });
    await this.mediaCache.prune();
    this.playbackEngine = new PlaybackController(this.config.playback, this.api);
    await this.playbackEngine.setVolume(this._computeEffectiveVolume());
    await this._reconcilePlaybackProcessesAtInit();
    if (this.config.safety.locked || this.playbackEngine.isSafetyLocked?.()) {
      await this.playbackEngine.emergencyStop(
        this.config.safety.reason || 'safety-lock'
      );
    } else {
      this.playbackEngine.releaseSafetyLock();
    }
    this.banList = new BanList(this.api);
    this.autoDJ = new AutoDJ(this.config.autoDJ, this.musicResolver, this.db, this.api);

    this.commandParser = new CommandParser(
      this.config,
      this.queueManager,
      this.playbackEngine,
      this.musicResolver,
      this.api,
      this.banList,
      (payload) => this._handleChatResponse(payload)
    );

    this._registerPlaybackEvents();
    this._registerRoutes();
    this._registerSocketEvents();
    this._registerTikTokEvents();
    this._registerDuckingHooks();

    await this._restoreState();
    this.api.log('[music-bot] Plugin initialized', 'info');

    this._emitSetupStatus();
  }

  async destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    const configUpdateDrain = this._configUpdateTail;
    this._lifecycleGeneration += 1;
    this._recordTransition('destroyed', 'plugin-destroy');
    this._stopPlaybackSync();
    this._clearCrossfadeTimer();
    this._pendingTrackAdvance = null;
    this._pendingSkipAdvance = null;
    this._cleanupDuckingHooks();

    await this._stopPrecacheTasks();
    try {
      await this.mediaCache?.destroy?.();
    } catch (error) {
      this.api.log(`[music-bot] Failed to shutdown media cache: ${error.message}`, 'error');
    }
    try {
      await this.musicResolver?.destroy?.();
    } catch (error) {
      this.api.log(`[music-bot] Failed to shutdown resolver: ${error.message}`, 'error');
    }
    this.playbackEngine?.removeAllListeners?.();
    try {
      await this.playbackEngine?.shutdown?.();
    } catch (error) {
      this.api.log(`[music-bot] Failed to shutdown playback: ${error.message}`, 'error');
    }
    await configUpdateDrain;

    // Keep queued songs across app restarts and plugin reloads. Explicit user
    // actions still use queueManager.clear() through the clear route/command.
    this.queueManager?.persistQueue?.();
    this._pendingRequests.clear();
    this._requestCredits.clear();
    this._userLikes.clear();
    this.removeAllListeners();
    this.api.log('[music-bot] Plugin destroyed', 'info');
  }

  // ---------- Initialization helpers ----------

  _loadConfig() {
    const saved = this.api.getConfig('config');
    const merged = this._mergeDeep(DEFAULT_CONFIG, saved || {});
    this.config = merged;
    this.config.moderation = this._mergeDeep(DEFAULT_CONFIG.moderation, this.config.moderation || {});
    this.config.monetization = this._mergeDeep(DEFAULT_CONFIG.monetization, this.config.monetization || {});
    this.config.audio = this._mergeDeep(DEFAULT_CONFIG.audio, this.config.audio || {});
    this.config.autoDJ = this._normalizeAutoDJConfig(this.config.autoDJ);
    this.config.onboarding = this._normalizeOnboarding(this.config.onboarding);
    this.config.safety = this._normalizeSafetyConfig(this.config.safety);
    if (!Array.isArray(this.config.moderation.blockedKeywords)) {
      this.config.moderation.blockedKeywords = [];
    }
    if (!Array.isArray(this.config.monetization.payToPlayGiftCatalog)) {
      this.config.monetization.payToPlayGiftCatalog = [];
    }
    if (!Array.isArray(this.config.monetization.payToSkipGiftCatalog)) {
      this.config.monetization.payToSkipGiftCatalog = [];
    }
    this.config.monetization.minLikesPerUser = Math.max(1, Number(this.config.monetization.minLikesPerUser) || 1);
    this.config.monetization.payToPlayMinCoins = Math.max(0, Number(this.config.monetization.payToPlayMinCoins) || 0);
    const savedMasterVolume = Number(this.config.audio.masterVolume);
    const savedSourceVolume = Number(this.config.audio.sourceVolume);
    this.config.audio.masterVolume = Math.max(0, Math.min(100, Number.isFinite(savedMasterVolume) ? savedMasterVolume : DEFAULT_CONFIG.audio.masterVolume));
    this.config.audio.sourceVolume = Math.max(0, Math.min(100, Number.isFinite(savedSourceVolume) ? savedSourceVolume : DEFAULT_CONFIG.audio.sourceVolume));
    this.config.playback.defaultVolume = this._computeEffectiveVolume();
    if (!saved) {
      this.api.setConfig('config', this.config);
    } else if (JSON.stringify(saved) !== JSON.stringify(this.config)) {
      // Ensure new defaults are persisted
      this.api.setConfig('config', this.config);
    }
  }

  async _ensureYtDlp() {
    const execFileAsync = promisify(execFile);
    const configured = this.config.resolver.ytdlpPath;
    const isDefaultPath = !configured || configured === 'yt-dlp';
    // Use the bundled binary from youtube-dl-exec when no custom path is configured
    const ytdlpPath = isDefaultPath ? YOUTUBE_DL_PATH : configured;

    // Check if yt-dlp is available at the resolved path
    try {
      await execFileAsync(ytdlpPath, ['--version'], { timeout: 5000 });
      this.api.log('[music-bot] yt-dlp found and ready', 'debug');
      this._ytdlpAvailable = true;
      return;
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
        // Executable found but errored for another reason – treat as present
        this.api.log('[music-bot] yt-dlp found (version check returned error, but executable exists)', 'debug');
        this._ytdlpAvailable = true;
        return;
      }
    }

    this._ytdlpAvailable = false;

    if (isDefaultPath) {
      this.api.log(
        '[music-bot] yt-dlp not found. Music Bot runs in limited mode (oEmbed fallback only). ' +
        'Install yt-dlp for full functionality: run "npm install youtube-dl-exec" in app/, ' +
        'or download yt-dlp manually and set the path in Music Bot settings.',
        'warn'
      );
    } else {
      this.api.log(
        `[music-bot] yt-dlp not found at configured path "${ytdlpPath}". ` +
        'Please verify the path in Music Bot settings.',
        'warn'
      );
    }
  }

  async _ensureMpv() {
    const execFileAsync = promisify(execFile);
    const configuredMpvPath = this.config.playback.mpvPath || 'mpv';
    const candidates = await this._getMpvPathCandidates(configuredMpvPath);

    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate, ['--version'], { timeout: 5000 });
        this.api.log(`[music-bot] mpv found and ready at "${candidate}"`, 'debug');
        this._mpvAvailable = true;
        if (candidate !== configuredMpvPath && candidate !== 'mpv') {
          this.config.playback.mpvPath = candidate;
          if (this.playbackEngine) {
            this.playbackEngine.config = this.config.playback;
          }
          await this.api.setConfig('config', this.config);
          this.api.log(`[music-bot] Stored detected mpv path "${candidate}"`, 'info');
        }
        return;
      } catch (_err) {
        // Try the next likely location before reporting setup failure.
      }
    }

    this._mpvAvailable = false;
    this.api.log(
      `[music-bot] mpv not found at "${configuredMpvPath}". Music playback is disabled. ` +
      'Install mpv (https://mpv.io/installation/) and restart LTTH, ' +
      'or set the correct path in Music Bot settings.',
      'warn'
    );
  }

  _getSetupIssues() {
    const issues = [];
    if (!this._ytdlpAvailable) {
      issues.push({
        id: 'ytdlp-missing',
        severity: 'warning',
        title: 'yt-dlp nicht gefunden',
        description: 'Für YouTube-Suche und Song-Downloads wird yt-dlp benötigt. ' +
          'Ohne yt-dlp funktioniert nur der oEmbed-Fallback (eingeschränkte Metadaten, kein Suchfeld).',
        installInstructions: [
          'npm install youtube-dl-exec (im app/ Verzeichnis)',
          'Oder: yt-dlp manuell von https://github.com/yt-dlp/yt-dlp/releases herunterladen',
          'Oder: Pfad in Music Bot Einstellungen → Resolver → yt-dlp Pfad setzen'
        ]
      });
    }
    if (!this._mpvAvailable) {
      issues.push({
        id: 'mpv-missing',
        severity: 'error',
        title: 'mpv Media Player nicht gefunden',
        oneClickInstall: true,
        installAction: 'mpv',
        installButtonLabel: this._mpvInstallStatus.state === 'installing' ? 'Installation laeuft...' : 'MPV installieren',
        installStatus: this._mpvInstallStatus,
        description: 'Der Music Bot braucht mpv (https://mpv.io) für die Audio-Wiedergabe. ' +
          'Ohne mpv wird keine Musik abgespielt.',
        installInstructions: [
          'Windows: winget, scoop oder choco',
          'Linux: sudo apt install mpv',
          'macOS: brew install mpv',
          'Pfad in Music Bot Einstellungen → Playback → mpv Pfad setzen'
        ]
      });
    }
    return issues;
  }

  _emitSetupStatus() {
    const issues = this._getSetupIssues();
    this.io.emit('music-bot:setup-status', {
      ytdlpAvailable: this._ytdlpAvailable || false,
      mpvAvailable: this._mpvAvailable || false,
      mpvInstallStatus: this._mpvInstallStatus,
      issues
    });
  }

  async _resolveExecutable(name) {
    const execFileAsync = promisify(execFile);
    const command = process.platform === 'win32' ? 'where' : 'sh';
    const args = process.platform === 'win32' ? [name] : ['-lc', `command -v ${name}`];

    try {
      const { stdout } = await execFileAsync(command, args, { timeout: 5000 });
      const firstMatch = String(stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      return firstMatch || name;
    } catch (_error) {
      return null;
    }
  }

  async _findExecutable(name) {
    return Boolean(await this._resolveExecutable(name));
  }

  async _getMpvPathCandidates(configuredMpvPath) {
    const candidates = [];
    const add = (candidate) => {
      if (!candidate || candidates.includes(candidate)) return;
      candidates.push(candidate);
    };
    const configuredPath = configuredMpvPath || 'mpv';
    const preferDirectWindowsBinary = process.platform === 'win32'
      && String(configuredPath).trim().toLowerCase() === 'mpv';

    if (!preferDirectWindowsBinary) {
      add(configuredPath);
    }

    if (process.platform === 'win32') {
      const chocolateyRoot = process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey';
      const chocolateyLibDir = path.join(chocolateyRoot, 'lib');
      const userProfile = process.env.USERPROFILE || '';
      const localAppData = process.env.LOCALAPPDATA || '';
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
      try {
        const entries = await fsp.readdir(chocolateyLibDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || !entry.name.toLowerCase().includes('mpv')) continue;
          for (const filename of ['mpv.exe', 'mpv.com']) {
            const candidate = path.join(chocolateyLibDir, entry.name, 'tools', filename);
            try {
              await fsp.access(candidate, fs.constants.F_OK);
              add(candidate);
            } catch (_error) {
              // Chocolatey's mpv packages are versioned and may expose the executable only in one package directory.
            }
          }
        }
      } catch (_error) {
        // Chocolatey may not be installed, or the lib directory may not exist yet.
      }

      [
        path.join(chocolateyRoot, 'bin', 'mpv.exe'),
        path.join(userProfile, 'scoop', 'shims', 'mpv.exe'),
        'C:\\ProgramData\\scoop\\shims\\mpv.exe',
        path.join(programFiles, 'mpv', 'mpv.exe'),
        path.join(programFilesX86, 'mpv', 'mpv.exe')
      ].forEach(add);

      const wingetPackagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
      try {
        const entries = await fsp.readdir(wingetPackagesDir, { withFileTypes: true });
        entries
          .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().includes('mpv'))
          .forEach((entry) => add(path.join(wingetPackagesDir, entry.name, 'mpv.exe')));
      } catch (_error) {
        // WinGet is not installed or has not installed mpv for this user.
      }
    }

    add(configuredPath);
    const resolvedMpv = await this._resolveExecutable('mpv');
    add(resolvedMpv);

    return candidates;
  }

  _appendInstallOutput(current, chunk) {
    const next = `${current || ''}${chunk || ''}`;
    return next.length > 6000 ? next.slice(next.length - 6000) : next;
  }

  _summarizeMpvInstallFailure(output, code) {
    const text = String(output || '').replace(/\s+/g, ' ').trim();
    const lockMatch = text.match(/Unable to obtain lock file access on '([^']+)'/i);
    if (lockMatch) {
      return `Chocolatey konnte die Installation wegen einer gesperrten Lockdatei nicht abschliessen: ${lockMatch[1]}. Schliesse andere Chocolatey-Installationen oder entferne die Lockdatei und klicke erneut auf Installieren.`;
    }
    if (/do you want to continue|not running from an elevated|non.?elevated/i.test(text)) {
      return 'Chocolatey wartet auf eine Administrator-/Bestaetigungsabfrage. Klicke erneut auf Installieren und bestaetige den Windows-Administrator-Dialog.';
    }
    if (/access is denied|permission|administrator|elevat/i.test(text)) {
      return 'Der Paketmanager hat fehlende Rechte gemeldet. Starte LTTH als Administrator oder installiere mpv manuell und klicke danach erneut auf Aktualisieren/Installieren.';
    }
    if (/not recognized|not found|no such file/i.test(text)) {
      return 'Der Paketmanager konnte den Installationsbefehl nicht ausfuehren. Installiere winget, scoop oder choco oder setze den mpv Pfad manuell.';
    }
    if (text) {
      return `mpv Installation fehlgeschlagen (Exit-Code ${code ?? 'unbekannt'}): ${text.slice(-900)}`;
    }
    return `mpv Installation beendet, aber mpv wurde nicht gefunden (Exit-Code ${code ?? 'unbekannt'}).`;
  }

  _buildWindowsElevatedCommand(executablePath, args = []) {
    const quotePs = (value) => `'${String(value).replace(/'/g, "''")}'`;
    const quoteCmd = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const commandLine = [
      [quoteCmd(executablePath), ...args.map(quoteCmd)].join(' '),
      'echo.',
      'echo [LTTH] The installer window stays open for 30 seconds so you can read the logs.',
      'timeout /t 30 /nobreak >nul'
    ].join(' & ');
    return {
      executable: 'powershell.exe',
      args: [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', ${quotePs(commandLine)}) -Verb RunAs -Wait`
      ],
      windowsHide: true
    };
  }

  async _getMpvInstallCommand() {
    if (process.platform === 'win32') {
      const wingetPath = await this._resolveExecutable('winget');
      if (wingetPath) {
        return {
          executable: wingetPath,
          args: ['install', '--id', 'shinchiro.mpv', '-e', '--accept-package-agreements', '--accept-source-agreements'],
          label: 'winget install shinchiro.mpv'
        };
      }

      const scoopPath = await this._resolveExecutable('scoop');
      if (scoopPath) {
        return { executable: scoopPath, args: ['install', 'mpv'], label: 'scoop install mpv' };
      }

      const chocoPath = await this._resolveExecutable('choco');
      if (chocoPath) {
        const elevated = this._buildWindowsElevatedCommand(chocoPath, ['install', 'mpvio.install', '-y', '--no-progress']);
        return {
          ...elevated,
          label: 'choco install mpvio.install (Administrator)',
          opensWindow: true
        };
      }

      return null;
    }

    if (process.platform === 'darwin') {
      if (await this._findExecutable('brew')) {
        return { executable: 'brew', args: ['install', 'mpv'], label: 'brew install mpv' };
      }
      return null;
    }

    const linuxCandidates = [
      { manager: 'apt-get', executable: 'sudo', args: ['apt-get', 'install', '-y', 'mpv'], label: 'sudo apt-get install -y mpv' },
      { manager: 'dnf', executable: 'sudo', args: ['dnf', 'install', '-y', 'mpv'], label: 'sudo dnf install -y mpv' },
      { manager: 'pacman', executable: 'sudo', args: ['pacman', '-S', '--noconfirm', 'mpv'], label: 'sudo pacman -S --noconfirm mpv' },
      { manager: 'zypper', executable: 'sudo', args: ['zypper', '--non-interactive', 'install', 'mpv'], label: 'sudo zypper --non-interactive install mpv' }
    ];

    for (const candidate of linuxCandidates) {
      if (await this._findExecutable(candidate.manager) && await this._findExecutable(candidate.executable)) {
        return candidate;
      }
    }

    return null;
  }

  async _startMpvInstall() {
    if (this._mpvAvailable) {
      this._mpvInstallStatus = {
        state: 'installed',
        message: 'mpv ist bereits verfuegbar.',
        command: null,
        updatedAt: new Date().toISOString()
      };
      return this._mpvInstallStatus;
    }

    if (this._mpvInstallStatus.state === 'installing') {
      const startedAt = Date.parse(this._mpvInstallStatus.updatedAt || '');
      if (Number.isFinite(startedAt) && Date.now() - startedAt > MPV_INSTALL_TIMEOUT_MS) {
        this._mpvInstallStatus = {
          state: 'failed',
          message: 'mpv Installation wurde abgebrochen: Der Installer hat zu lange nicht geantwortet. Bitte klicke erneut und bestaetige den Windows-Administrator-Dialog.',
          command: this._mpvInstallStatus.command,
          updatedAt: new Date().toISOString()
        };
        this._emitSetupStatus();
      } else {
        return this._mpvInstallStatus;
      }
    }

    if (this._mpvInstallTimer) {
      clearTimeout(this._mpvInstallTimer);
      this._mpvInstallTimer = null;
    }
    if (this._mpvInstallChild) {
      return this._mpvInstallStatus;
    }

    const installCommand = await this._getMpvInstallCommand();
    if (!installCommand) {
      this._mpvInstallStatus = {
        state: 'unavailable',
        message: 'Kein unterstuetzter Paketmanager gefunden. Installiere winget, scoop, choco, brew oder apt/dnf/pacman/zypper und versuche es erneut.',
        command: null,
        updatedAt: new Date().toISOString()
      };
      return this._mpvInstallStatus;
    }

    this._mpvInstallStatus = {
      state: 'installing',
      message: installCommand.opensWindow
        ? 'Windows oeffnet jetzt einen Administrator-Dialog fuer die mpv Installation. Bitte bestaetigen; danach wird automatisch erneut geprueft.'
        : 'mpv Installation wurde gestartet. Je nach System kann ein Installer- oder Rechte-Dialog erscheinen.',
      command: installCommand.label,
      updatedAt: new Date().toISOString()
    };
    this._emitSetupStatus();

    this.api.log(`[music-bot] Starting one-click mpv install via ${installCommand.label}`, 'info');

    const child = spawn(installCommand.executable, installCommand.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: installCommand.windowsHide ?? !installCommand.opensWindow
    });
    this._mpvInstallChild = child;

    let installOutput = '';
    let settled = false;
    const settleInstall = async (state, message, code = null) => {
      if (settled) return;
      settled = true;
      if (this._mpvInstallTimer) {
        clearTimeout(this._mpvInstallTimer);
        this._mpvInstallTimer = null;
      }
      this._mpvInstallChild = null;
      await this._ensureMpv();
      const installed = this._mpvAvailable === true;
      this._mpvInstallStatus = {
        state: installed ? 'installed' : state,
        message: installed ? 'mpv wurde installiert und ist bereit.' : message,
        command: installCommand.label,
        updatedAt: new Date().toISOString()
      };
      this.api.log(
        `[music-bot] mpv install finished with code ${code ?? 'unbekannt'}; available=${installed}`,
        installed ? 'info' : 'warn'
      );
      this._emitSetupStatus();
    };

    this._mpvInstallTimer = setTimeout(() => {
      try {
        child.kill();
      } catch (_error) {}
      settleInstall(
        'failed',
        'mpv Installation wurde abgebrochen: Der Installer hat zu lange nicht geantwortet. Bitte klicke erneut und bestaetige den Windows-Administrator-Dialog.',
        'timeout'
      ).catch((error) => {
        this.api.log(`[music-bot] Failed to settle timed-out mpv install: ${error.message}`, 'error');
      });
    }, MPV_INSTALL_TIMEOUT_MS);

    child.stdout?.on('data', (chunk) => {
      installOutput = this._appendInstallOutput(installOutput, chunk.toString());
    });
    child.stderr?.on('data', (chunk) => {
      installOutput = this._appendInstallOutput(installOutput, chunk.toString());
    });

    child.on('error', (error) => {
      this.api.log(`[music-bot] mpv install failed to start: ${error.message}`, 'error');
      settleInstall('failed', `mpv Installation konnte nicht gestartet werden: ${error.message}`).catch((settleError) => {
        this.api.log(`[music-bot] Failed to settle mpv install start error: ${settleError.message}`, 'error');
      });
    });

    child.on('close', async (code) => {
      await settleInstall('failed', this._summarizeMpvInstallFailure(installOutput, code), code);
    });

    return this._mpvInstallStatus;
  }

  _mergeDeep(target, source) {
    if (!source || typeof source !== 'object') {
      return target;
    }

    const output = Array.isArray(target) ? [...target] : { ...target };
    Object.keys(source).forEach((key) => {
      const sourceVal = source[key];
      if (Array.isArray(sourceVal)) {
        output[key] = [...sourceVal];
      } else if (sourceVal && typeof sourceVal === 'object') {
        output[key] = this._mergeDeep(target[key] || {}, sourceVal);
      } else {
        output[key] = sourceVal;
      }
    });
    return output;
  }

  _validateCommandAliases(config) {
    const commandNames = new Map();
    Object.entries(config.commands || {}).forEach(([type, value]) => {
      if (!value) return;
      commandNames.set(String(value).toLowerCase(), type);
    });

    const sanitizedAliases = {};
    try {
      Object.entries(config.commandAliases || {}).forEach(([type, aliases]) => {
        const unique = new Set();
        (aliases || []).forEach((aliasRaw) => {
          const alias = String(aliasRaw || '').trim().toLowerCase();
          if (!alias) return;
          if (commandNames.has(alias) && commandNames.get(alias) !== type) {
            throw new Error(`Alias "${alias}" conflicts with another command`);
          }
          if (unique.has(alias)) {
            return;
          }
          if (Object.values(sanitizedAliases).some((arr) => arr?.includes(alias))) {
            throw new Error(`Alias "${alias}" is already in use`);
          }
          unique.add(alias);
        });
        sanitizedAliases[type] = Array.from(unique);
      });
      Object.keys(config.commands || {}).forEach((cmd) => {
        if (!sanitizedAliases[cmd]) {
          sanitizedAliases[cmd] = [];
        }
      });
    } catch (error) {
      return { valid: false, error: error.message };
    }

    config.commandAliases = sanitizedAliases;
    return { valid: true };
  }

  _prepareLiveConfigUpdate(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { valid: false, error: 'config payload must be an object' };
    }
    const update = { ...payload };
    delete update.safety;
    const objectSections = [
      'commands', 'commandAliases', 'permissions', 'queue', 'playback', 'voteSkip',
      'audio', 'autoDJ', 'fallbackPlaylist', 'moderation', 'monetization',
      'giftIntegration', 'resolver', 'onboarding', 'preCache'
    ];
    for (const section of objectSections) {
      if (!Object.prototype.hasOwnProperty.call(update, section)) continue;
      const value = update[section];
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { valid: false, error: `${section} must be an object` };
      }
    }

    const config = this._mergeDeep(this.config, update);
    for (const section of objectSections) {
      const defaults = DEFAULT_CONFIG[section];
      if (defaults && typeof defaults === 'object' && !Array.isArray(defaults)) {
        config[section] = this._mergeDeep(defaults, config[section] || {});
      }
    }
    config.autoDJ = this._normalizeAutoDJConfig(config.autoDJ);
    config.safety = this._normalizeSafetyConfig(this.config.safety);
    config.onboarding = this._normalizeOnboarding(config.onboarding);
    config.moderation.blockedKeywords = Array.isArray(config.moderation.blockedKeywords)
      ? [...config.moderation.blockedKeywords]
      : [];
    config.monetization.payToPlayGiftCatalog = this._normalizeGiftList(config.monetization.payToPlayGiftCatalog);
    config.monetization.payToSkipGiftCatalog = this._normalizeGiftList(config.monetization.payToSkipGiftCatalog);
    config.monetization.minLikesPerUser = Math.max(1, Number(config.monetization.minLikesPerUser) || 1);
    config.monetization.payToPlayMinCoins = Math.max(0, Number(config.monetization.payToPlayMinCoins) || 0);
    const masterVolume = Number(config.audio.masterVolume);
    const sourceVolume = Number(config.audio.sourceVolume);
    config.audio.masterVolume = Math.max(
      0,
      Math.min(100, Number.isFinite(masterVolume) ? masterVolume : DEFAULT_CONFIG.audio.masterVolume)
    );
    config.audio.sourceVolume = Math.max(
      0,
      Math.min(100, Number.isFinite(sourceVolume) ? sourceVolume : DEFAULT_CONFIG.audio.sourceVolume)
    );
    config.playback.defaultVolume = Math.round(
      (config.audio.masterVolume * config.audio.sourceVolume) / 100
    );
    const aliasValidation = this._validateCommandAliases(config);
    if (!aliasValidation.valid) return aliasValidation;
    return { valid: true, config };
  }

  _distributeLiveConfig(config) {
    this.config = config;
    if (this.queueManager) {
      this.queueManager.config = config;
      this.queueManager.queueConfig = config.queue;
    }
    if (typeof this.playbackEngine?.updateConfig === 'function') {
      this.playbackEngine.updateConfig(config.playback);
    } else if (this.playbackEngine) {
      this.playbackEngine.config = config.playback;
    }
    if (this.commandParser) this.commandParser.config = config;
    this.musicResolver?.updateConfig?.({
      ...config.resolver,
      moderation: config.moderation,
      maxDurationSeconds: config.queue.maxSongDurationSeconds
    });
    this.autoDJ?.updateConfig?.(config.autoDJ);
    if (this.mediaCache) {
      const ttlDays = Number(config.resolver.cacheTTLDays);
      const maxSizeMB = Number(config.resolver.maxCacheSizeMB);
      if (Number.isFinite(ttlDays) && ttlDays > 0) this.mediaCache.ttlDays = ttlDays;
      if (Number.isFinite(maxSizeMB) && maxSizeMB > 0) this.mediaCache.maxSizeMB = maxSizeMB;
    }
  }

  _computeEffectiveVolume() {
    const master = Math.max(0, Math.min(100, Number(this.config.audio?.masterVolume) || 0));
    const source = Math.max(0, Math.min(100, Number(this.config.audio?.sourceVolume) || 0));
    return Math.round((master * source) / 100);
  }

  async _applyAudioVolume() {
    const effective = this._computeEffectiveVolume();
    this.config.playback.defaultVolume = effective;
    await this.playbackEngine.setVolume(effective);
    this._emitVolume(effective);
    return effective;
  }

  _normalizeGiftList(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }

  _normalizeGiftKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  _normalizeOnboarding(value) {
    const onboarding = value && typeof value === 'object' ? value : {};
    const completed = Boolean(onboarding.completed);
    const completedAt = completed
      ? Number(onboarding.completedAt) || Date.now()
      : null;
    return {
      completed,
      completedAt
    };
  }

  _normalizeSafetyConfig(value) {
    const source = value && typeof value === 'object' ? value : {};
    const locked = source.locked === undefined
      ? DEFAULT_CONFIG.safety.locked
      : Boolean(source.locked);
    return {
      locked,
      lockedAt: locked && Number.isFinite(Number(source.lockedAt))
        ? Number(source.lockedAt)
        : null,
      reason: locked
        ? String(source.reason || DEFAULT_CONFIG.safety.reason || 'safety-lock')
        : null
    };
  }

  _recordTransition(to, reason, details = {}) {
    const snapshot = {
      at: Date.now(),
      generation: this._lifecycleGeneration,
      to: String(to || 'unknown'),
      reason: String(reason || 'unspecified'),
      details: this._sanitizeDiagnosticValue(details)
    };
    this._stateTransitions.push(snapshot);
    if (this._stateTransitions.length > 100) {
      this._stateTransitions.splice(0, this._stateTransitions.length - 100);
    }
    return snapshot;
  }

  _sanitizeDiagnosticValue(value, depth = 0) {
    if (depth > 4) return '[truncated]';
    if (Array.isArray(value)) {
      return value.slice(0, 100).map((entry) => this._sanitizeDiagnosticValue(entry, depth + 1));
    }
    if (!value || typeof value !== 'object') {
      if (typeof value === 'string' && /(?:https?:\/\/|\\\\\.\\pipe\\|[a-z]:\\)/i.test(value)) {
        return '[redacted]';
      }
      return value;
    }
    const output = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (/url|path|pipe|socket|header|stack/i.test(key)) {
        output[key] = '[redacted]';
        return;
      }
      output[key] = this._sanitizeDiagnosticValue(entry, depth + 1);
    });
    return output;
  }

  _isSafetyLocked() {
    return Boolean(
      this.config?.safety?.locked || this.playbackEngine?.isSafetyLocked?.()
    );
  }

  async _persistConfigOrThrow(config = this.config, context = 'Music Bot config') {
    const persisted = await this.api.setConfig('config', config);
    if (persisted === false) {
      const error = new Error(`Failed to persist ${context}`);
      error.code = 'CONFIG_PERSIST_FAILED';
      throw error;
    }
    return persisted;
  }

  _configLifecycleError() {
    const error = new Error('Music Bot config update cancelled because the plugin is shutting down');
    error.code = 'PLUGIN_DESTROYED';
    return error;
  }

  _assertConfigUpdateActive() {
    if (this._destroyed) throw this._configLifecycleError();
  }

  _runSerializedConfigUpdate(operation) {
    if (this._destroyed) return Promise.reject(this._configLifecycleError());
    const queued = this._configUpdateTail.then(async () => {
      this._assertConfigUpdateActive();
      return operation();
    });
    this._configUpdateTail = queued.catch(() => {});
    return queued;
  }

  async _reconcilePlaybackProcessesAtInit() {
    const reconciliation = await this.playbackEngine?.reconcileProcesses?.();
    if (!reconciliation?.locked) return reconciliation || null;

    this.config.safety = {
      locked: true,
      lockedAt: Date.now(),
      reason: 'orphan-player-detected'
    };
    try {
      await this._persistConfigOrThrow(this.config, 'orphan-player Safety Lock');
    } catch (error) {
      this.api.log(
        `[music-bot] Failed to persist orphan-player Safety Lock during init: ${error.message}`,
        'error'
      );
    }
    return reconciliation;
  }

  async _probePlaybackRuntime() {
    await this.playbackEngine?.probe?.();
    await this._controllerSafetySyncPromise;
  }

  _lockedResult() {
    return {
      success: false,
      locked: true,
      error: 'Der Soundbot ist durch den Safety-Lock gesperrt.'
    };
  }

  async _engageSafetyLock(reason = 'manual') {
    const lockedAt = Date.now();
    this.config.safety = {
      locked: true,
      lockedAt,
      reason: String(reason || 'manual')
    };
    this._lifecycleGeneration += 1;
    this._recordTransition('locked', this.config.safety.reason);

    // Persist first, but never let a storage failure block the actual kill path.
    let persistError = null;
    try {
      await this._persistConfigOrThrow(this.config, 'Safety Lock');
    } catch (error) {
      persistError = error;
      this.api.log(`[music-bot] Failed to persist Safety Lock before stopping audio: ${error.message}`, 'error');
    }
    this._stopPlaybackSync();
    this._clearCrossfadeTimer();
    this._pendingTrackAdvance = null;
    this._pendingSkipAdvance = null;
    await Promise.allSettled([
      Promise.resolve(this.musicResolver?.cancelAll?.()),
      Promise.resolve(this._stopPrecacheTasks?.())
    ]);
    await this.playbackEngine?.emergencyStop?.(this.config.safety.reason);
    this.queueManager?.markPlaying?.(null);
    this._emitPlaybackStopped();
    this._emitNowPlaying(null);
    this._emitSafetyState();
    if (persistError) throw persistError;
    return this.config.safety;
  }

  async _releaseSafetyLock() {
    await this.playbackEngine?.probe?.();
    await this._controllerSafetySyncPromise;
    const processCleanup = this.playbackEngine?.getLastProcessCleanup?.() || {};
    if (processCleanup.error || processCleanup.remaining?.length) {
      const error = new Error(
        'Safety Lock kann nicht aufgehoben werden, solange ein Soundbot-MPV aktiv ist.'
      );
      error.code = 'SOUNDBOT_MPV_REMAINS';
      throw error;
    }
    const previousSafety = this.config.safety;
    this.config.safety = {
      locked: false,
      lockedAt: null,
      reason: null
    };
    try {
      await this._persistConfigOrThrow(this.config, 'Safety Lock release');
    } catch (error) {
      this.config.safety = previousSafety;
      throw error;
    }
    this.playbackEngine?.releaseSafetyLock?.();
    this._recordTransition('idle', 'safety-lock-released');
    this._emitSafetyState();
    return this.config.safety;
  }

  async _handleControllerSafetyChange(payload = {}) {
    const locked = Boolean(payload.locked);
    const reason = locked ? String(payload.reason || 'controller-safety-lock') : null;
    if (
      this.config.safety?.locked === locked
      && (!locked || this.config.safety.reason === reason)
    ) {
      return;
    }
    this.config.safety = {
      locked,
      lockedAt: locked ? Number(payload.lockedAt || Date.now()) : null,
      reason
    };
    this._lifecycleGeneration += 1;
    this._recordTransition(locked ? 'locked' : 'idle', reason || 'controller-safety-release');
    let persistError = null;
    try {
      await this._persistConfigOrThrow(this.config, 'controller Safety Lock');
    } catch (error) {
      persistError = error;
      this.api.log(`[music-bot] Failed to persist controller Safety Lock: ${error.message}`, 'error');
    }
    if (locked) {
      this._stopPlaybackSync();
      this._clearCrossfadeTimer();
      await Promise.allSettled([
        Promise.resolve(this.musicResolver?.cancelAll?.()),
        Promise.resolve(this._stopPrecacheTasks?.())
      ]);
      this.queueManager?.markPlaying?.(null);
      this._emitPlaybackStopped();
      this._emitNowPlaying(null);
    }
    this._emitSafetyState();
    if (persistError) throw persistError;
  }

  _emitSafetyState() {
    const safety = { ...this.config.safety };
    this.api.emit('musicbot:safety-lock-changed', safety);
    this._emitRuntimeHealth();
  }

  _normalizeAutoDJConfig(value) {
    const config = value && typeof value === 'object' ? { ...value } : {};
    const normalizeInteger = (input, fallback, minimum, maximum) => {
      const numeric = Number(input);
      const normalized = Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
      return Math.min(maximum, Math.max(minimum, normalized));
    };
    return {
      ...config,
      mixHistoryPercent: normalizeInteger(config.mixHistoryPercent, 80, 0, 100),
      repeatCooldownHours: normalizeInteger(config.repeatCooldownHours, 12, 1, 168)
    };
  }

  _getRequestCredits(username) {
    const key = String(username || '').toLowerCase();
    if (!key) return 0;
    return Number(this._requestCredits.get(key) || 0);
  }

  _addRequestCredits(username, amount) {
    const key = String(username || '').toLowerCase();
    if (!key || amount <= 0) return 0;
    const next = this._getRequestCredits(key) + amount;
    this._requestCredits.set(key, next);
    return next;
  }

  _consumeRequestCredit(username) {
    const key = String(username || '').toLowerCase();
    if (!key) return false;
    const current = this._getRequestCredits(key);
    if (current < 1) return false;
    this._requestCredits.set(key, current - 1);
    return true;
  }

  _addUserLikes(username, likeCount = 1) {
    const key = String(username || '').toLowerCase();
    if (!key) return 0;
    const safeCount = Math.max(0, Number(likeCount) || 0);
    const next = Number(this._userLikes.get(key) || 0) + safeCount;
    this._userLikes.set(key, next);
    return next;
  }

  _getUserLikes(username) {
    const key = String(username || '').toLowerCase();
    if (!key) return 0;
    return Number(this._userLikes.get(key) || 0);
  }

  async _restoreState() {
    const restored = this.queueManager.restoreQueue({
      isAllowed: (song) => !this._checkBans(song, song.requestedBy)
    });
    for (const song of this.queueManager.getQueue()) {
      const cachedPath = song.trackKey ? this.mediaCache?.get?.(song.trackKey) : null;
      if (cachedPath) {
        this.queueManager.setTrackLocalPath(song.trackKey, cachedPath);
      }
    }
    if (restored && typeof restored === 'object') {
      this.api.log(
        `[music-bot] Queue restore: ${restored.restored} restored, ${restored.deduped} duplicates, ${restored.banned} banned`,
        'info'
      );
    }
    this._emitStatus();
    this._emitQueue();
    this._schedulePreCache();
  }

  _registerPlaybackEvents() {
    this.playbackEngine.on('track-start', (track) => {
      if (track?.trackKey) this.mediaCache?.pin?.(track.trackKey);
      this.queueManager.markPlaying(track);
      this.queueManager.resetVoteSkips();
      this.autoDJ?.setPlaybackSeed?.(track);
      this._emitNowPlaying(track);
      this._startPlaybackSync();
      this._scheduleCrossfadeTransition(track);
      this._schedulePreCache();
    });

    this.playbackEngine.on('track-end', (info) => {
      if (info.track?.trackKey) this.mediaCache?.unpin?.(info.track.trackKey);
      const activeTrack = this.playbackEngine.getNowPlaying?.();
      if (info.reason === 'error' && !info.track && !activeTrack) {
        return;
      }
      if (info.reason !== 'crossfade' && info.track?.requestedBy === 'AutoDJ' && activeTrack && activeTrack !== info.track) {
        return;
      }
      if (info.reason !== 'crossfade') {
        this._clearCrossfadeTimer();
      }
      if (info.reason === 'error') {
        const detail = info.error || `MPV end-file reason: ${info.mpvReason || 'unknown'}`;
        const message = `MPV konnte "${info.track?.title || 'den Titel'}" nicht abspielen: ${detail}`;
        const playbackError = new Error(message);
        this.api.log(`[music-bot] ${message}`, 'error');
        if (info.track?.requestedBy === 'AutoDJ') {
          Promise.resolve(this._handleAutoDJPlaybackFailure(info.track, 'mpv-track-end', playbackError))
            .catch((recoveryError) => {
              this.api.log(`[music-bot] AutoDJ track-end recovery failed: ${recoveryError.message}`, 'error');
            });
        } else {
          this.autoDJ?.markPlaybackFailed?.(playbackError);
          this._stopPlaybackSync();
        }
        this._emitError(message);
        this._emitPlaybackStopped();
        this._emitRuntimeHealth();
        return;
      }
      this.queueManager.addToHistory(info.track, info.reason === 'skip');
      if (info.track?.requestedBy) {
        this.queueManager.removeSkipImmunity(info.track.requestedBy);
      }
      this.queueManager.resetVoteSkips();
      if (info.reason === 'crossfade') {
        return;
      }
      this._stopPlaybackSync();
      this._emitPlaybackAdvancing(info.reason);
      const advance = Promise.resolve(this._playNextFromQueue())
        .catch((error) => {
          const message = error?.message || String(error || 'Unbekannter Wiedergabefehler');
          this.api.log(`[music-bot] Failed to advance playback: ${message}`, 'error');
          this._emitError(message);
          return { success: false, error: message };
        });
      this._pendingTrackAdvance = advance;
      if (info.reason === 'skip') {
        this._pendingSkipAdvance = advance;
      }
      advance.finally(() => {
        if (this._pendingTrackAdvance === advance) {
          this._pendingTrackAdvance = null;
        }
      });
    });

    this.playbackEngine.on('volume-changed', (volume) => {
      this._emitVolume(volume);
    });

    this.playbackEngine.on('error', (error) => {
      this._emitError(error.message || error);
    });

    this.playbackEngine.on('crashed', async () => {
      if (this._destroyed || this._isSafetyLocked()) return;
      const current = this.playbackEngine.getNowPlaying();
      if (current?.requestedBy === 'AutoDJ') {
        const crashError = new Error(`mpv crashed while playing "${current.title || current.id}"`);
        Promise.resolve(this._handleAutoDJPlaybackFailure(current, 'mpv-crash', crashError))
          .catch((recoveryError) => {
            this.api.log(`[music-bot] AutoDJ crash recovery failed: ${recoveryError.message}`, 'error');
          });
        return;
      }
      this.api.log('[music-bot] mpv crashed; playback remains stopped until a controlled start/reset', 'error');
      this.playbackEngine.clearNowPlaying();
      this.queueManager?.markPlaying?.(null);
      this._emitPlaybackStopped();
      this._emitNowPlaying(null);
      this._emitRuntimeHealth();
    });

    this.playbackEngine.on('transition', (transition) => {
      if (this._destroyed || !transition) return;
      this._recordTransition(
        transition.state || transition.kind || 'playback',
        transition.reason || transition.action || 'controller-transition',
        transition
      );
      this._emitRuntimeHealth();
    });

    this.playbackEngine.on('safety-lock-changed', (payload) => {
      this._controllerSafetySyncPromise = this._controllerSafetySyncPromise
        .then(() => this._handleControllerSafetyChange(payload))
        .catch((error) => {
          this.api.log(`[music-bot] Failed to persist controller safety state: ${error.message}`, 'error');
        });
    });
  }

  _registerRoutes() {
    const uiPath = path.join(__dirname, 'ui.html');
    const assetsPath = path.join(__dirname, 'assets');
    const overlayPath = path.join(__dirname, 'overlay.html');

    this.api.registerRoute('get', '/plugins/music-bot/ui', async (req, res) => {
      res.sendFile(uiPath);
    });

    this.api.registerRoute('get', '/plugins/music-bot/assets/ui-style.css', async (req, res) => {
      res.sendFile(path.join(assetsPath, 'ui-style.css'));
    });

    this.api.registerRoute('get', '/plugins/music-bot/assets/ui.js', async (req, res) => {
      res.sendFile(path.join(assetsPath, 'ui.js'));
    });

    this.api.registerRoute('get', '/plugins/music-bot/overlay', async (req, res) => {
      res.sendFile(overlayPath);
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/status', async (req, res) => {
      await this._probePlaybackRuntime();
      res.json(this._buildStatusPayload());
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/diagnostics', async (req, res) => {
      await this._probePlaybackRuntime();
      res.json(this._buildDiagnosticsPayload());
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/emergency-stop', async (req, res) => {
      try {
        const safety = await this._engageSafetyLock('emergency-stop');
        res.json({ success: true, locked: true, safety, health: this._buildHealthPayload() });
      } catch (error) {
        this.api.log(`[music-bot] Emergency stop failed: ${error.message}`, 'error');
        res.status(500).json({ success: false, locked: true, error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/safety-lock', async (req, res) => {
      const requested = req.body?.locked;
      if (typeof requested !== 'boolean') {
        res.status(400).json({ success: false, error: 'locked must be a boolean' });
        return;
      }
      try {
        const safety = requested
          ? await this._engageSafetyLock('manual')
          : await this._releaseSafetyLock();
        res.json({ success: true, locked: safety.locked, safety, health: this._buildHealthPayload() });
      } catch (error) {
        this.api.log(`[music-bot] Safety lock update failed: ${error.message}`, 'error');
        const statusCode = error.code === 'SOUNDBOT_MPV_REMAINS' ? 409 : 500;
        res.status(statusCode).json({ success: false, locked: this._isSafetyLocked(), error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/player/reset', async (req, res) => {
      try {
        const remainLocked = this._isSafetyLocked();
        this._stopPlaybackSync();
        this._clearCrossfadeTimer();
        await this.playbackEngine.resetPlayer({ remainLocked });
        this._recordTransition(remainLocked ? 'locked' : 'idle', 'player-reset');
        this._emitPlaybackStopped();
        this._emitNowPlaying(null);
        this._emitSafetyState();
        res.json({
          success: true,
          locked: remainLocked,
          queueLength: this.queueManager.getQueue().length,
          health: this._buildHealthPayload()
        });
      } catch (error) {
        this.api.log(`[music-bot] Player reset failed: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/player/test-tone', async (req, res) => {
      if (this._isSafetyLocked()) {
        res.status(423).json(this._lockedResult());
        return;
      }
      if (this.playbackEngine.getNowPlaying?.() || this.playbackEngine.isPlaying?.()) {
        res.status(409).json({ success: false, error: 'Der Testton ist nur bei inaktivem Player verfügbar.' });
        return;
      }
      if (typeof this.playbackEngine.testTone !== 'function') {
        res.status(501).json({ success: false, error: 'Testton wird von diesem Player nicht unterstützt.' });
        return;
      }
      try {
        const result = await this.playbackEngine.testTone();
        this._recordTransition('idle', 'test-tone');
        res.json({ success: true, ...(result || {}) });
      } catch (error) {
        this.api.log(`[music-bot] Test tone failed: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/setup-status', (req, res) => {
      res.json({
        success: true,
        ytdlpAvailable: this._ytdlpAvailable || false,
        mpvAvailable: this._mpvAvailable || false,
        mpvInstallStatus: this._mpvInstallStatus,
        issues: this._getSetupIssues()
      });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/install/mpv', async (req, res) => {
      try {
        await this._ensureMpv();
        const status = await this._startMpvInstall();
        res.json({
          success: status.state !== 'failed' && status.state !== 'unavailable',
          pending: status.state === 'installing',
          installed: status.state === 'installed',
          mpvAvailable: this._mpvAvailable || false,
          installStatus: status,
          issues: this._getSetupIssues()
        });
      } catch (error) {
        this._mpvInstallStatus = {
          state: 'failed',
          message: error.message,
          command: null,
          updatedAt: new Date().toISOString()
        };
        this.api.log(`[music-bot] mpv one-click install failed: ${error.message}`, 'error');
        res.status(500).json({
          success: false,
          error: error.message,
          installStatus: this._mpvInstallStatus,
          issues: this._getSetupIssues()
        });
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/resolve', async (req, res) => {
      const query = req.query?.q || req.query?.query;
      if (!query) {
        res.status(400).json({ success: false, error: 'Missing query' });
        return;
      }
      const requestAbort = this._createRequestAbort(req);
      try {
        const resolved = await this.musicResolver.resolve(query, { signal: requestAbort.signal });
        if (!resolved?.success) {
          res.status(400).json(resolved);
          return;
        }

        const banMessage = this._checkBans(resolved.song, 'dashboard');
        if (banMessage) {
          res.status(400).json({ success: false, error: banMessage });
          return;
        }

        res.json({ success: true, song: resolved.song });
      } catch (error) {
        this.api.log(`[music-bot] Resolve failed: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      } finally {
        requestAbort.cleanup();
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/queue', async (req, res) => {
      res.json({
        success: true,
        queue: this.queueManager.getQueue()
      });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/request', async (req, res) => {
      const { query, username = 'dashboard', requesterAvatar = null } = req.body || {};
      if (!query) {
        res.status(400).json({ success: false, error: 'Missing query' });
        return;
      }
      const requestAbort = this._createRequestAbort(req);
      const result = await this._handleDashboardRequest(
        query,
        username,
        requesterAvatar,
        { signal: requestAbort.signal }
      );
      requestAbort.cleanup();
      res.status(result.success ? 200 : 400).json(result);
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/skip', async (req, res) => {
      if (this._isSafetyLocked()) {
        res.status(423).json(this._lockedResult());
        return;
      }
      const current = this.playbackEngine.getNowPlaying();
      if (!current) {
        const next = await this._playNextFromQueue();
        res.status(next.success ? 200 : 400).json({
          ...next,
          next: next.success ? next.song || null : null
        });
        return;
      }
      const skipped = await this._skipCurrent('dashboard');
      res.status(skipped.success ? 200 : 400).json(skipped);
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/volume', async (req, res) => {
      const { volume, masterVolume, sourceVolume } = req.body || {};
      const hasLegacy = typeof volume === 'number';
      const hasMaster = typeof masterVolume === 'number';
      const hasSource = typeof sourceVolume === 'number';
      if (!hasLegacy && !hasMaster && !hasSource) {
        res.status(400).json({ success: false, error: 'Volume payload missing' });
        return;
      }
      if (hasLegacy) {
        this.config.audio.sourceVolume = Math.max(0, Math.min(100, Number(volume) || 0));
      }
      if (hasMaster) {
        this.config.audio.masterVolume = Math.max(0, Math.min(100, Number(masterVolume) || 0));
      }
      if (hasSource) {
        this.config.audio.sourceVolume = Math.max(0, Math.min(100, Number(sourceVolume) || 0));
      }
      const effectiveVolume = await this._applyAudioVolume();
      await this.api.setConfig('config', this.config);
      res.json({
        success: true,
        volume: effectiveVolume,
        masterVolume: this.config.audio.masterVolume,
        sourceVolume: this.config.audio.sourceVolume
      });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/pause', async (req, res) => {
      if (!this.playbackEngine.getNowPlaying() || !this.playbackEngine.isPlaying()) {
        res.status(400).json({ success: false, error: 'Kein aktiver Titel zum Pausieren.' });
        return;
      }
      await this.playbackEngine.pause();
      res.json({ success: true });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/resume', async (req, res) => {
      if (this._isSafetyLocked()) {
        res.status(423).json(this._lockedResult());
        return;
      }
      const current = this.playbackEngine.getNowPlaying();
      if (current) {
        if (this.playbackEngine.getState() === 'paused') {
          await this.playbackEngine.resume();
        }
        res.json({ success: true, track: current, resumed: true });
        return;
      }

      const next = await this._playNextFromQueue();
      res.status(next.success ? 200 : 400).json({
        ...next,
        track: next.success ? next.song || null : null,
        resumed: false
      });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/clear', async (req, res) => {
      this.queueManager.clear();
      await this.playbackEngine.stop();
      this.autoDJ?.reset();
      this._emitQueue();
      res.json({ success: true });
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/config', async (req, res) => {
      res.json({ success: true, config: this.config });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/onboarding/complete', async (req, res) => {
      this.config.onboarding = this._normalizeOnboarding({
        ...this.config.onboarding,
        completed: true,
        completedAt: this.config.onboarding?.completedAt || Date.now()
      });
      await this.api.setConfig('config', this.config);
      this.io?.emit?.('music-bot:onboarding-updated', this.config.onboarding);
      res.json({ success: true, onboarding: this.config.onboarding });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/config', async (req, res) => {
      try {
        await this._runSerializedConfigUpdate(async () => {
          const prepared = this._prepareLiveConfigUpdate(req.body || {});
          if (!prepared.valid) {
            res.status(400).json({ success: false, error: prepared.error });
            return;
          }
          const previousConfig = this.config;
          const nextConfig = prepared.config;
          const mpvPathChanged = previousConfig?.playback?.mpvPath !== nextConfig.playback.mpvPath;
          const ytDlpPathChanged = previousConfig?.resolver?.ytdlpPath !== nextConfig.resolver.ytdlpPath;
          let persistedNext = false;
          try {
            // Persistence is the commit point; runtime consumers only see the
            // new snapshot after durable storage accepted it.
            await this._persistConfigOrThrow(nextConfig, 'live config');
            persistedNext = true;
            this._assertConfigUpdateActive();
            this._distributeLiveConfig(nextConfig);
            if (this.mediaCache) {
              await this.mediaCache.prune({ protectedKeys: [...this._pinnedCacheKeys] });
              this._assertConfigUpdateActive();
            }
            if (ytDlpPathChanged) {
              await this._ensureYtDlp();
              this._assertConfigUpdateActive();
            }
            if (mpvPathChanged) {
              await this._ensureMpv();
              this._assertConfigUpdateActive();
            }
            await this._applyAudioVolume();
            this._assertConfigUpdateActive();
            if (mpvPathChanged || ytDlpPathChanged) this._emitSetupStatus();
            res.json({ success: true, config: this.config });
          } catch (error) {
            try {
              if (this._destroyed) {
                this.config = previousConfig;
              } else {
                this._distributeLiveConfig(previousConfig);
              }
            } catch (rollbackError) {
              this.api.log(`[music-bot] Live config runtime rollback failed: ${rollbackError.message}`, 'error');
            }
            if (persistedNext) {
              try {
                await this._persistConfigOrThrow(previousConfig, 'live config rollback');
              } catch (rollbackError) {
                this.api.log(`[music-bot] Live config persistence rollback failed: ${rollbackError.message}`, 'error');
              }
            }
            const responseError = this._destroyed ? this._configLifecycleError() : error;
            this.api.log(`[music-bot] Live config update rejected: ${responseError.message}`, 'error');
            const statusCode = responseError.code === 'PLUGIN_DESTROYED' ? 503 : 500;
            res.status(statusCode).json({ success: false, error: responseError.message });
          }
        });
      } catch (error) {
        this.api.log(`[music-bot] Live config update rejected: ${error.message}`, 'error');
        const statusCode = error.code === 'PLUGIN_DESTROYED' ? 503 : 500;
        res.status(statusCode).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/history', async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      try {
        const rows = this.db
          .prepare('SELECT * FROM plugin_music_bot_history ORDER BY finishedAt DESC LIMIT ? OFFSET ?')
          .all(limit, offset);
        const total = this.db
          .prepare('SELECT COUNT(*) as count FROM plugin_music_bot_history')
          .get().count;
        res.json({ success: true, history: rows, total, limit, offset });
      } catch (error) {
        this.api.log(`[music-bot] Failed to load history: ${error.message}`, 'error');
        res.json({ success: true, history: this.queueManager.getHistory() });
      }
    });

    this.api.registerRoute('delete', '/api/plugins/music-bot/queue/:index', async (req, res) => {
      const index = Number(req.params.index);
      if (!Number.isFinite(index) || index < 0) {
        res.status(400).json({ success: false, error: 'Invalid index' });
        return;
      }
      const result = this.queueManager.removeSong(index);
      if (result.success) {
        this._emitQueue();
      }
      res.status(result.success ? 200 : 400).json(result);
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/queue/reorder', async (req, res) => {
      const { fromIndex, toIndex, sourceSongId, targetSongId } = req.body || {};
      if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') {
        res.status(400).json({ success: false, error: 'fromIndex and toIndex are required' });
        return;
      }
      const queue = this.queueManager.getQueue();
      const currentFromIndex = typeof sourceSongId === 'string'
        ? queue.findIndex((song) => song.id === sourceSongId)
        : fromIndex;
      const currentToIndex = typeof targetSongId === 'string'
        ? queue.findIndex((song) => song.id === targetSongId)
        : toIndex;
      const result = this.queueManager.reorderSong(currentFromIndex, currentToIndex);
      if (result.success) {
        this._emitQueue();
      }
      res.status(result.success ? 200 : 400).json(result);
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/queue/:index/play', async (req, res) => {
      if (this._isSafetyLocked()) {
        res.status(423).json(this._lockedResult());
        return;
      }
      const index = Number(req.params.index);
      if (!Number.isInteger(index) || index < 0) {
        res.status(400).json({ success: false, error: 'Invalid queue position' });
        return;
      }

      const songId = typeof req.body?.songId === 'string' ? req.body.songId.trim() : '';
      const queue = this.queueManager.getQueue();
      const current = this.playbackEngine.getNowPlaying();
      const currentIndex = songId
        ? queue.findIndex((song) => song.id === songId)
        : index;
      if (songId && currentIndex === -1) {
        if (current?.id === songId) {
          res.json({ success: true, track: current, alreadyPlaying: true });
          return;
        }
        res.status(409).json({
          success: false,
          staleQueue: true,
          error: 'Der ausgewählte Titel ist nicht mehr in der Queue.'
        });
        return;
      }
      const moved = this.queueManager.reorderSong(currentIndex, 0);
      if (!moved.success) {
        res.status(400).json(moved);
        return;
      }

      const result = current
        ? await this._skipCurrent('queue-play')
        : await this._playNextFromQueue();
      const track = result.next || result.song || null;
      this._emitQueue();
      res.status(result.success ? 200 : 400).json({ ...result, track });
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/bans', async (req, res) => {
      try {
        res.json({ success: true, bans: this.banList.getAllBans() });
      } catch (error) {
        this.api.log(`[music-bot] Failed to load bans: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: 'Failed to load bans' });
      }
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/bans', async (req, res) => {
      const { type, value, reason } = req.body || {};
      const validTypes = ['url', 'keyword', 'channel', 'user', 'artist', 'track'];
      if (!validTypes.includes(type) || !value || !String(value).trim()) {
        res.status(400).json({ success: false, error: 'type and value are required' });
        return;
      }
      try {
        const ban = this.banList.addBan(type, String(value).trim(), reason, 'dashboard');
        res.json({ success: true, ban });
      } catch (error) {
        this.api.log(`[music-bot] Failed to add ban: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/bans/from-track', async (req, res) => {
      const {
        trackId,
        scope = 'track',
        keyword,
        stopCurrent = true,
        removeQueued = true
      } = req.body || {};
      const track = this._findTrackForBan(trackId);
      if (!track) {
        res.status(404).json({ success: false, error: 'Track wurde nicht gefunden.' });
        return;
      }
      const selection = this._resolveTrackBanSelection(track, scope, keyword);
      if (!selection.success) {
        res.status(400).json(selection);
        return;
      }
      try {
        const ban = this.banList.addBan(
          selection.type,
          selection.value,
          `Admin-Ban: ${track.title || track.id}`,
          'dashboard'
        );
        let removedQueued = 0;
        if (removeQueued) {
          const queue = this.queueManager.getQueue();
          for (let index = queue.length - 1; index >= 0; index -= 1) {
            if (!this._trackMatchesBanSelection(queue[index], selection)) continue;
            if (this.queueManager.removeSong(index).success) removedQueued += 1;
          }
        }

        const current = this.playbackEngine.getNowPlaying?.();
        const stoppedCurrent = Boolean(
          stopCurrent && current && this._trackMatchesBanSelection(current, selection)
        );
        if (stoppedCurrent) {
          await this.playbackEngine.stop();
          this.playbackEngine.clearNowPlaying?.();
          this.queueManager.markPlaying?.(null);
          this._emitPlaybackStopped();
          this._emitNowPlaying(null);
        }
        this._emitQueue();
        if (stoppedCurrent && !this._isSafetyLocked()) {
          await this._playNextFromQueue();
        }
        res.json({ success: true, ban, stoppedCurrent, removedQueued });
      } catch (error) {
        this.api.log(`[music-bot] Failed to ban track: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('delete', '/api/plugins/music-bot/bans/:id', async (req, res) => {
      try {
        const id = Number(req.params.id);
        const result = this.banList.removeBan(id);
        res.status(result.success ? 200 : 404).json({ success: result.success });
      } catch (error) {
        this.api.log(`[music-bot] Failed to remove ban: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: 'Failed to remove ban' });
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/auto-dj/status', async (req, res) => {
      res.json({ success: true, status: this.autoDJ?.getStatus() });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/auto-dj/toggle', async (req, res) => {
      const payload = req.body || {};
      this.config.autoDJ = this._mergeDeep(this.config.autoDJ, payload);
      this.config.autoDJ = this._normalizeAutoDJConfig(this.config.autoDJ);
      this.autoDJ?.updateConfig(this.config.autoDJ);
      if (this.config.autoDJ.enabled) {
        this.autoDJ?.activate();
      }
      await this.api.setConfig('config', this.config);
      let track = null;
      if (
        this.config.autoDJ.enabled &&
        !this._isSafetyLocked() &&
        !this.playbackEngine?.isPlaying?.() &&
        this.queueManager?.getQueue?.().length === 0
      ) {
        track = await this._maybePlayAutoDJ();
      }
      res.json({ success: true, status: this.autoDJ?.getStatus(), track });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/auto-dj/skip', async (req, res) => {
      if (this._isSafetyLocked()) {
        res.status(423).json(this._lockedResult());
        return;
      }
      const next = await this._maybePlayAutoDJ(true);
      res.json({ success: Boolean(next), track: next || null, status: this.autoDJ?.getStatus() });
    });
  }

  _registerSocketEvents() {
    this.api.registerSocket('musicbot:request-status', async (socket) => {
      const effectiveVolume = this._computeEffectiveVolume();
      socket.emit('musicbot:now-playing', this.playbackEngine.getNowPlaying());
      socket.emit('musicbot:queue-update', {
        queue: this.queueManager.getQueue(),
        length: this.queueManager.getQueue().length
      });
      socket.emit('musicbot:volume-changed', {
        volume: effectiveVolume,
        masterVolume: this.config.audio.masterVolume,
        sourceVolume: this.config.audio.sourceVolume
      });
      socket.emit('musicbot:runtime', this._buildRuntimeSnapshot());
      socket.emit('musicbot:resolver', this._buildResolverSnapshot());
      socket.emit('musicbot:health', this._buildHealthPayload());
    });

    this.api.registerSocket('musicbot:dashboard-skip', async (socket) => {
      if (this._isSafetyLocked()) {
        socket?.emit?.('musicbot:error', { message: this._lockedResult().error, locked: true });
        return;
      }
      await this._skipCurrent('dashboard-socket');
    });

    this.api.registerSocket('musicbot:dashboard-volume', async (socket, payload) => {
      const source = Number(payload?.sourceVolume ?? payload?.volume);
      const master = Number(payload?.masterVolume);
      if (
        (Number.isFinite(source) && source >= 0 && source <= 100) ||
        (Number.isFinite(master) && master >= 0 && master <= 100)
      ) {
        if (Number.isFinite(source)) {
          this.config.audio.sourceVolume = source;
        }
        if (Number.isFinite(master)) {
          this.config.audio.masterVolume = master;
        }
        await this._applyAudioVolume();
        await this.api.setConfig('config', this.config);
      } else {
        socket.emit('musicbot:error', { message: 'Volume must be between 0 and 100' });
      }
    });

    this.api.registerSocket('musicbot:dashboard-pause', async (socket) => {
      if (this._isSafetyLocked()) {
        socket?.emit?.('musicbot:error', { message: this._lockedResult().error, locked: true });
        return;
      }
      await this.playbackEngine.pause();
      this._emitPaused();
    });

    this.api.registerSocket('musicbot:dashboard-resume', async (socket) => {
      if (this._isSafetyLocked()) {
        socket?.emit?.('musicbot:error', { message: this._lockedResult().error, locked: true });
        return;
      }
      await this.playbackEngine.resume();
      this._emitResumed();
    });
  }

  _registerTikTokEvents() {
    this.api.registerTikTokEvent('chat', async (data) => {
      await this.commandParser.parse(data, (command) => this._handleCommand(command, data));
    });
    this.api.registerTikTokEvent('gift', async (data) => {
      await this._handleGiftEvent(data);
    });
    this.api.registerTikTokEvent('like', async (data) => {
      const username = data?.username || data?.nickname || data?.user?.uniqueId;
      if (!username) return;
      const likeCount = Number(data?.likeCount || data?.count || 1);
      const total = this._addUserLikes(username, likeCount);
      this.api.emit('musicbot:user-likes-updated', { username, likes: total });
    });
  }

  _registerDuckingHooks() {
    const ttsStarted = async (payload = {}) => {
      try {
        const id = payload?.id;
        if (id && this._activeTtsDucks.has(id)) return;
        if (id) this._activeTtsDucks.add(id);
        await this.playbackEngine?.beginDucking();
      } catch (error) {
        this.api.log(`[music-bot] TTS ducking failed: ${error.message}`, 'error');
      }
    };
    const ttsEnded = async (payload = {}) => {
      try {
        const id = payload?.id;
        if (id && !this._activeTtsDucks.has(id)) return;
        if (id) this._activeTtsDucks.delete(id);
        await this.playbackEngine?.endDucking();
      } catch (error) {
        this.api.log(`[music-bot] TTS ducking release failed: ${error.message}`, 'error');
      }
    };
    const alertShown = async () => {
      try {
        await this.playbackEngine?.triggerDucking();
      } catch (error) {
        this.api.log(`[music-bot] Alert ducking failed: ${error.message}`, 'error');
      }
    };

    this._ttsDuckingHandlers = { ttsStarted, ttsEnded, alertShown };
    if (this.api.pluginLoader?.on) {
      this.api.pluginLoader.on('tts:playback:started', ttsStarted);
      this.api.pluginLoader.on('tts:playback:ended', ttsEnded);
    } else {
      this.api.log('[music-bot] pluginLoader unavailable: TTS ducking listener not registered', 'warn');
    }

    if (this.io && typeof this.io.emit === 'function') {
      this._ioEmitOriginal = this.io.emit.bind(this.io);
      this.io.emit = (event, ...args) => {
        if (event === 'alert:show') {
          Promise.resolve(alertShown()).catch(() => {});
        }
        return this._ioEmitOriginal(event, ...args);
      };
    }
  }

  _cleanupDuckingHooks() {
    if (this._ttsDuckingHandlers?.ttsStarted) {
      this.api.pluginLoader?.removeListener?.('tts:playback:started', this._ttsDuckingHandlers.ttsStarted);
    }
    if (this._ttsDuckingHandlers?.ttsEnded) {
      this.api.pluginLoader?.removeListener?.('tts:playback:ended', this._ttsDuckingHandlers.ttsEnded);
    }
    if (this._ioEmitOriginal && this.io) {
      this.io.emit = this._ioEmitOriginal;
    }
    this._ioEmitOriginal = null;
    this._ttsDuckingHandlers = null;
    this._activeTtsDucks.clear();
  }

  // ---------- Command handling ----------

  async _handleCommand(command, chatData) {
    const username = this._getChatUsername(chatData);
    switch (command.type) {
      case 'request':
        return this._handleRequest(command.query, username, chatData);
      case 'skip':
        if (command.force) {
          return this._skipCurrent(username);
        }
        return this._handleSkipVote(username, chatData);
      case 'queue':
        this._emitChatResponse(`Queue length: ${this.queueManager.getQueue().length}`, username);
        return;
      case 'nowPlaying':
        this._emitChatResponse(this._formatNowPlaying(), username);
        return;
      case 'volume':
        if (command.value !== undefined) {
          this.config.audio.sourceVolume = Math.max(0, Math.min(100, Number(command.value) || 0));
          await this._applyAudioVolume();
          await this.api.setConfig('config', this.config);
        } else {
          this._emitChatResponse(`Aktuelle Lautstärke: ${this._computeEffectiveVolume()}`, username);
        }
        return;
      case 'pause':
        await this.playbackEngine.pause();
        this._emitPaused();
        return;
      case 'resume':
        if (this._isSafetyLocked()) {
          this._emitChatResponse(this._lockedResult().error, username);
          return;
        }
        await this.playbackEngine.resume();
        this._emitResumed();
        return;
      case 'clear':
        this.queueManager.clear();
        await this.playbackEngine.stop();
        this.autoDJ?.reset();
        this._emitQueue();
        return;
      case 'mysong': {
        const queue = this.queueManager.getQueue();
        const lowerUser = username.toLowerCase();
        const idx = queue.findIndex(s => (s.requestedBy || '').toLowerCase() === lowerUser);
        if (idx === -1) {
          this._emitChatResponse('Du hast keinen Song in der Queue.', username);
        } else {
          const song = queue[idx];
          this._emitChatResponse(
            `Dein Song "${song.title}" ist auf Position #${idx + 1}.`,
            username
          );
        }
        return;
      }
      case 'help': {
        const prefix = this.config.commandPrefix;
        const cmds = this.config.commands;
        const parts = [];
        if (cmds.request) parts.push(`${prefix}${cmds.request} <song>`);
        if (cmds.skip) parts.push(`${prefix}${cmds.skip}`);
        if (cmds.queue) parts.push(`${prefix}${cmds.queue}`);
        if (cmds.nowPlaying) parts.push(`${prefix}${cmds.nowPlaying}`);
        if (cmds.mysong) parts.push(`${prefix}${cmds.mysong}`);
        if (cmds.remove) parts.push(`${prefix}${cmds.remove}`);
        this._emitChatResponse(`Commands: ${parts.join(' | ')}`, username);
        return;
      }
      case 'remove': {
        const queue = this.queueManager.getQueue();
        const lowerUser = username.toLowerCase();
        const isPrivileged = await this._isPrivilegedUser(username, chatData);

        if (command.index !== null && command.index !== undefined && isPrivileged) {
          // Mod/Streamer: remove specific song by 0-based index
          const result = this.queueManager.removeSong(command.index);
          if (result.success) {
              this._emitChatResponse(
                `"${result.song.title}" wurde aus der Queue entfernt.`,
                username
              );
              this._emitQueue();
            } else {
              this._emitChatResponse('Song nicht gefunden.', username);
            }
          } else {
            // Remove user's own song
            const idx = queue.findIndex(s => (s.requestedBy || '').toLowerCase() === lowerUser);
            if (idx === -1) {
              this._emitChatResponse('Du hast keinen Song in der Queue.', username);
            } else {
              const result = this.queueManager.removeSong(idx);
              if (result.success) {
                this._emitChatResponse(
                  `"${result.song.title}" wurde aus der Queue entfernt.`,
                  username
                );
                this._emitQueue();
              } else {
                this._emitChatResponse('Fehler beim Entfernen.', username);
              }
            }
          }
        return;
      }
      default:
        break;
    }
  }

  _getChatUsername(chatData) {
    return (
      chatData?.username ||
      chatData?.uniqueId ||
      chatData?.nickname ||
      chatData?.user?.uniqueId ||
      chatData?.user?.nickname ||
      'viewer'
    );
  }

  async _isPrivilegedUser(username, chatData) {
    if (chatData?.isModerator === true) return true;
    if (Number.isFinite(chatData?.teamMemberLevel) && chatData.teamMemberLevel >= 1) return true;
    try {
      const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('tiktok_username');
      const streamer = row?.value;
      if (streamer && streamer.toLowerCase() === (username || '').toLowerCase()) return true;
    } catch (_) { /* ignore db errors */ }
    return false;
  }

  _createRequestAbort(req) {
    const controller = new AbortController();
    const onAborted = () => controller.abort();
    req?.once?.('aborted', onAborted);
    return {
      signal: controller.signal,
      cleanup: () => req?.removeListener?.('aborted', onAborted)
    };
  }

  async _handleDashboardRequest(query, username, requesterAvatar = null, options = {}) {
    try {
      const resolved = await this.musicResolver.resolve(query, { signal: options.signal });
      if (!resolved?.success) {
        this._emitToast('error', 'API-Fehler', resolved?.message || 'Song konnte nicht geladen werden.');
        return { success: false, error: resolved?.message || 'Song konnte nicht geladen werden.' };
      }

      const banMessage = this._checkBans(resolved.song, username);
      if (banMessage) {
        this._emitToast('warn', 'Song geblockt', banMessage);
        return { success: false, error: banMessage };
      }

      const added = this.queueManager.addSong({ ...resolved.song, requestedBy: username, requesterAvatar });
      if (!added.success) {
        this._emitToast('warn', 'Song-Request abgelehnt', added.error || 'Song konnte nicht hinzugefügt werden.');
        return added;
      }
      this._schedulePreCache();
      this.autoDJ?.onSongRequested();
      this._emitSongAdded(added.song, added.position);
      if (!this.playbackEngine.isPlaying() && this.config.playback.autoPlay) {
        await this._playNextFromQueue();
      }
      this._emitToast('success', 'Song hinzugefügt', `${resolved.song.title} (#${added.position})`);
      return { success: true, song: added.song, position: added.position };
    } catch (error) {
      this.api.log(`[music-bot] Failed to request song: ${error.message}`, 'error');
      this._emitToast('error', 'API-Fehler', error.message || 'Song konnte nicht geladen werden.');
      return { success: false, error: error.message };
    }
  }

  async _handleRequest(query, username, chatData = {}) {
    if (!query) {
      this._emitChatResponse('Bitte gib einen Song an.', username);
      this._emitToast('warn', 'Song-Request abgelehnt', 'Bitte gib einen Song an.');
      return;
    }

    const lowerUser = username.toLowerCase();
    if (this._pendingRequests.has(lowerUser)) {
      this._emitChatResponse('Dein vorheriger Request wird noch verarbeitet.', username);
      return;
    }

    const userBan = this.banList?.isUserBanned(username);
    if (userBan?.banned) {
      this._emitChatResponse('Dieser Nutzer darf keine Songs anfragen.', username);
      this._emitToast('warn', 'Song geblockt', `@${username} ist für Song-Requests gesperrt.`);
      return;
    }

    if (this.config.monetization?.likeGateEnabled) {
      const likes = this._getUserLikes(username);
      const requiredLikes = Math.max(1, Number(this.config.monetization?.minLikesPerUser) || 1);
      if (likes < requiredLikes) {
        this._emitChatResponse(`Du brauchst mindestens ${requiredLikes} Likes für !sr. Aktuell: ${likes}.`, username);
        this._emitToast('warn', 'Song-Request abgelehnt', `@${username}: ${likes}/${requiredLikes} Likes.`);
        return;
      }
    }

    if (this.config.monetization?.payToPlayEnabled) {
      const availableCredits = this._getRequestCredits(username);
      if (availableCredits < 1) {
        this._emitChatResponse('Für !sr benötigst du ein konfiguriertes Gift bzw. genügend Coins.', username);
        this._emitToast('warn', 'Song-Request abgelehnt', `@${username} hat kein gültiges Request-Gift gesendet.`);
        return;
      }
    }

    this._pendingRequests.add(lowerUser);
    try {
      const resolved = await this.musicResolver.resolve(query);
      if (!resolved?.success) {
        this._emitChatResponse(resolved?.message || 'Song konnte nicht geladen werden.', username);
        this._emitToast('error', 'API-Fehler', resolved?.message || 'Song konnte nicht geladen werden.');
        return;
      }

      const banMessage = this._checkBans(resolved.song, username);
      if (banMessage) {
        this._emitChatResponse(banMessage, username);
        this._emitToast('warn', 'Song geblockt', banMessage);
        return;
      }

      const addResult = this.queueManager.addSong({
        ...resolved.song,
        requestedBy: username,
        requesterAvatar: chatData?.profilePictureUrl || chatData?.avatar || null
      });
      if (!addResult.success) {
        this._emitChatResponse(addResult.error || 'Song konnte nicht hinzugefügt werden.', username);
        this._emitToast('warn', 'Song-Request abgelehnt', addResult.error || 'Song konnte nicht hinzugefügt werden.');
        return;
      }
      if (this.config.monetization?.payToPlayEnabled) {
        this._consumeRequestCredit(username);
      }
      this._schedulePreCache();
      this.autoDJ?.onSongRequested();
      this._emitSongAdded(addResult.song, addResult.position);

      if (!this.playbackEngine.isPlaying() && this.config.playback.autoPlay) {
        await this._playNextFromQueue();
      }

      const artist = resolved.song.artist ? ` von ${resolved.song.artist}` : '';
      this._emitChatResponse(`Hinzugefügt: ${resolved.song.title}${artist} (#${addResult.position})`, username);
      this._emitToast('success', 'Song hinzugefügt', `${resolved.song.title} (#${addResult.position})`);
    } catch (error) {
      this.api.log(`[music-bot] request failed: ${error.message}`, 'error');
      this._emitChatResponse('Song konnte nicht geladen werden.', username);
      this._emitToast('error', 'API-Fehler', error.message || 'Song konnte nicht geladen werden.');
    } finally {
      this._pendingRequests.delete(lowerUser);
    }
  }

  async _handleSkipVote(username, chatData = {}) {
    if (!this.config.voteSkip.enabled) {
      await this._skipCurrent(username);
      return;
    }

    const viewerCount = Number(chatData?.viewerCount || chatData?.viewer_count || 0);
    const voteResult = this.queueManager.addVoteSkip(username, viewerCount);
    if (voteResult.duplicateVote) {
      this._emitChatResponse('Du hast bereits für Skip gestimmt.', username);
      return;
    }

    this._emitVoteSkipUpdate(voteResult);

    if (voteResult.immuneInfo) {
      this._emitChatResponse(
        `⛔ Dieser Song hat Skip-Immunität! (@${voteResult.immuneInfo.requestedBy} hat mit einem Gift requested)`,
        username
      );
      return;
    }

    if (voteResult.skipped) {
      await this._skipCurrent(username);
      this.queueManager.resetVoteSkips();
    } else {
      this._emitChatResponse(
        `Skip-Votes: ${voteResult.votes}/${voteResult.required}`,
        username
      );
    }
  }

  _checkBans(song, username) {
    if (!song) return null;
    const userBan = this.banList?.isUserBanned(username);
    if (userBan?.banned) {
      return 'Dieser Nutzer darf keine Songs anfragen.';
    }

    const urlBan = this.banList?.isUrlBanned(song.url, song.youtubeId);
    if (urlBan?.banned) {
      return 'Dieser Song ist gesperrt.';
    }

    const trackBan = this.banList?.isTrackBanned?.(song.trackKey);
    if (trackBan?.banned) {
      return 'Dieser Song ist gesperrt.';
    }

    const artistBan = this.banList?.isArtistBanned?.(song.artist);
    if (artistBan?.banned) {
      return 'Dieser Künstler ist gesperrt.';
    }

    const keywordBanTitle = this.banList?.isKeywordBanned(song.title || '');
    const keywordBanChannel = this.banList?.isKeywordBanned(song.channelName || '');
    const keywordBan = keywordBanTitle?.banned ? keywordBanTitle : keywordBanChannel;
    if (keywordBan?.banned) {
      return `Dieser Song ist geblockt (Keyword: ${keywordBan.keyword}).`;
    }

    const channelBan = this.banList?.isChannelBanned(song.channelId, song.channelName);
    if (channelBan?.banned) {
      return 'Dieser Kanal ist gesperrt.';
    }

    return null;
  }

  _findTrackForBan(trackId) {
    const id = String(trackId || '').trim();
    if (!id) return null;
    const current = this.playbackEngine?.getNowPlaying?.();
    if (String(current?.id || '') === id) return this._decorateTrackIdentity(current);
    const queued = this.queueManager?.getQueue?.().find((track) => String(track?.id || '') === id);
    if (queued) return this._decorateTrackIdentity(queued);
    const history = this.queueManager?.getHistory?.().find((track) => String(track?.id || '') === id);
    if (history) return this._decorateTrackIdentity(history);
    try {
      const stored = this.db
        .prepare('SELECT * FROM plugin_music_bot_history WHERE id = ? LIMIT 1')
        .get(id) || null;
      return stored ? this._decorateTrackIdentity(stored) : null;
    } catch (_error) {
      return null;
    }
  }

  _decorateTrackIdentity(track) {
    if (!track || typeof track !== 'object') return track;
    if (track.trackKey) {
      const separator = String(track.trackKey).indexOf(':');
      if (separator > 0) {
        const provider = track.provider || String(track.trackKey).slice(0, separator);
        const providerId = track.providerId || String(track.trackKey).slice(separator + 1);
        if (providerId) {
          return {
            ...track,
            provider,
            providerId,
            trackKey: `${provider}:${providerId}`,
            youtubeId: track.youtubeId || (provider === 'youtube' ? providerId : null)
          };
        }
      }
    }
    const providerHint = track.provider || track.source;
    const providerId = track.providerId
      || (/youtube/i.test(String(providerHint || '')) ? track.youtubeId : null);
    const identity = deriveTrackIdentity({
      provider: providerHint,
      providerId,
      youtubeId: track.youtubeId,
      url: track.url
    }, track.url || '');
    return { ...track, ...identity };
  }

  _resolveTrackBanSelection(track, requestedScope, keyword) {
    const scope = requestedScope === 'song' ? 'track' : String(requestedScope || 'track');
    const selections = {
      track: { type: 'track', value: track.trackKey },
      artist: { type: 'artist', value: track.artist },
      channel: { type: 'channel', value: track.channelId || track.channelName },
      keyword: { type: 'keyword', value: String(keyword || '').trim() }
    };
    const selection = selections[scope];
    if (!selection || !String(selection.value || '').trim()) {
      return { success: false, error: 'Für diesen Ban-Typ fehlen Track-Metadaten.' };
    }
    return {
      success: true,
      scope,
      type: selection.type,
      value: String(selection.value).trim()
    };
  }

  _trackMatchesBanSelection(track, selection) {
    if (!track || !selection) return false;
    const rawValue = String(selection.value || '').trim();
    if (!rawValue) return false;
    if (selection.type === 'track') {
      return String(track.trackKey || '').trim() === rawValue;
    }
    const value = rawValue.toLowerCase();
    if (selection.type === 'artist') {
      return String(track.artist || '').trim().replace(/\s+/g, ' ').toLowerCase() === value.replace(/\s+/g, ' ');
    }
    if (selection.type === 'channel') {
      return [track.channelId, track.channelName]
        .some((entry) => String(entry || '').trim().toLowerCase() === value);
    }
    if (selection.type === 'keyword') {
      return String(track.title || '').toLowerCase().includes(value);
    }
    return false;
  }

  async _skipCurrent(reasonUser) {
    const current = this.playbackEngine.getNowPlaying();
    if (!current) {
      return { success: false, error: 'Nothing is playing' };
    }
    this._pendingSkipAdvance = null;
    await this.playbackEngine.skip();
    const advance = this._pendingSkipAdvance;
    const nextResult = advance ? await advance : null;
    if (this._pendingSkipAdvance === advance) {
      this._pendingSkipAdvance = null;
    }
    this._emitSongSkipped(current.title, reasonUser || 'skip');
    return {
      success: true,
      next: nextResult?.success ? nextResult.song || null : null,
      nextError: nextResult?.success === false ? nextResult.error || 'Kein Folgetitel verfügbar' : null
    };
  }

  _buildMpvUnavailableMessage(error) {
    const configuredPath = this.config?.playback?.mpvPath || 'mpv';
    const suffix = error?.message ? ` (${error.message})` : '';
    return `mpv nicht gefunden ("${configuredPath}"). Installiere mpv oder setze den korrekten Pfad in den Music-Bot-Einstellungen.${suffix}`;
  }

  _isMpvUnavailableError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return (
      error?.code === 'ENOENT' ||
      message.includes('mpv nicht gefunden') ||
      message.includes('spawn') && message.includes('enoent')
    );
  }

  _handlePlaybackUnavailable(song, error) {
    if (song && typeof this.queueManager.returnToFront === 'function') {
      this.queueManager.returnToFront(song);
    }
    this._mpvAvailable = false;
    const message = this._buildMpvUnavailableMessage(error);
    this.api.log(`[music-bot] ${message}`, 'warn');
    this._emitError(message);
    this._emitSetupStatus();
    this._emitQueue();
    return { success: false, error: message };
  }

  async _playNextFromQueue(retries = 0) {
    if (this._queueAdvanceOperation) return this._queueAdvanceOperation;
    const operation = this._playNextFromQueueInternal(retries);
    this._queueAdvanceOperation = operation;
    try {
      return await operation;
    } finally {
      if (this._queueAdvanceOperation === operation) {
        this._queueAdvanceOperation = null;
      }
    }
  }

  async _playNextFromQueueInternal(retries = 0) {
    if (this._isSafetyLocked() || this._destroyed) {
      return this._lockedResult();
    }
    if (this._mpvAvailable === false) {
      return this._handlePlaybackUnavailable();
    }
    if (retries > 5) {
      this.api.log('[music-bot] Too many consecutive playback failures, stopping', 'error');
      this.playbackEngine.clearNowPlaying();
      this._emitPlaybackStopped();
      this._emitQueue();
      return { success: false, error: 'Too many consecutive playback failures' };
    }
    const next = this.queueManager.shiftNext();
    if (!next) {
      const fallbackTrack = await this._playFallbackTrack();
      if (fallbackTrack) {
        this._schedulePreCache();
        return { success: true, song: fallbackTrack };
      }
      const autoDJTrack = await this._maybePlayAutoDJ();
      if (!autoDJTrack) {
        this.playbackEngine.clearNowPlaying();
        this._emitPlaybackStopped();
        this._emitQueue();
        return { success: false, error: 'Queue empty' };
      }
      return { success: true, song: autoDJTrack };
    }
    try {
      if (this._isSafetyLocked() || this._destroyed) {
        this.queueManager.returnToFront?.(next);
        return this._lockedResult();
      }
      const banMessage = this._checkBans(next, next.requestedBy);
      if (banMessage) {
        this.api.log(`[music-bot] Removed blocked queued track "${next.title || next.id}": ${banMessage}`, 'warn');
        this._emitQueue();
        return this._playNextFromQueueInternal(retries + 1);
      }
      await this.playbackEngine.play(next);
      this._emitQueue();
      this._schedulePreCache();
      return { success: true, song: next };
    } catch (error) {
      this.api.log(`[music-bot] Playback failed: ${error.message}`, 'error');
      if (this._isMpvUnavailableError(error)) {
        return this._handlePlaybackUnavailable(next, error);
      }
      this.queueManager.returnToFront?.(next);
      this._emitError(error.message);
      this._emitQueue();
      setImmediate(() => this._playNextFromQueue(retries + 1));
      return { success: false, error: error.message };
    }
  }

  _schedulePreCache() {
    try {
      const cfg = this.config.preCache || {};
      if (!cfg.enabled) {
        this._refreshCachePins([]);
        return;
      }
      const requestedLookahead = Number(cfg.lookahead);
      const lookahead = Math.max(
        0,
        Math.min(
          Number.isFinite(requestedLookahead) ? requestedLookahead : DEFAULT_PRECACHE_LOOKAHEAD,
          MAX_PRECACHE_LOOKAHEAD
        )
      );
      if (!lookahead) {
        this._refreshCachePins([]);
        return;
      }
      const upcoming = this.queueManager.getQueue().slice(0, lookahead);
      this._refreshCachePins(upcoming);
      upcoming.forEach((song) => this._startPreCache(song));
    } catch (error) {
      this.api.log(`[music-bot] Failed to schedule pre-cache: ${error.message}`, 'warn');
    }
  }

  _startPreCache(song) {
    if (!song?.trackKey || !song?.url || !this.mediaCache || this._destroyed) return;
    if (song.localPath && fs.existsSync(song.localPath)) return;
    if (this._precacheTasks.has(song.trackKey)) return;

    const cachedPath = this.mediaCache.get(song.trackKey);
    if (cachedPath) {
      this.queueManager.setTrackLocalPath(song.trackKey, cachedPath);
      return;
    }

    const isHttpUrl = /^https?:\/\//i.test(song.url);
    if (!isHttpUrl) {
      if (fs.existsSync(song.url)) {
        this.queueManager.setTrackLocalPath(song.trackKey, song.url);
      }
      return;
    }

    const controller = new AbortController();
    const promise = this.mediaCache.getOrDownload(song, {
      signal: controller.signal,
      ytdlpPath: this._getYtDlpPath(),
      priority: -10
    }).then((localPath) => {
      if (!this._destroyed && localPath) {
        this.queueManager.setTrackLocalPath(song.trackKey, localPath);
      }
      return localPath;
    }).catch((error) => {
      if (!controller.signal.aborted) {
        this.api.log(`[music-bot] Pre-cache skipped for "${song.title}": ${error.message}`, 'debug');
      }
      return null;
    }).finally(() => {
      const current = this._precacheTasks.get(song.trackKey);
      if (current?.promise === promise) this._precacheTasks.delete(song.trackKey);
    });
    this._precacheTasks.set(song.trackKey, { controller, promise });
  }

  _refreshCachePins(upcoming = []) {
    if (!this.mediaCache) return;
    const next = new Set(
      upcoming.map((song) => song?.trackKey).filter(Boolean)
    );
    const currentKey = this.playbackEngine?.getNowPlaying?.()?.trackKey;
    if (currentKey) next.add(currentKey);
    for (const key of this._pinnedCacheKeys) {
      if (!next.has(key)) this.mediaCache.unpin(key);
    }
    for (const key of next) this.mediaCache.pin(key);
    this._pinnedCacheKeys = next;
  }

  async _stopPrecacheTasks() {
    const tasks = Array.from(this._precacheTasks.values());
    this._precacheTasks.clear();
    tasks.forEach((task) => task?.controller?.abort?.());
    await Promise.allSettled(tasks.map((task) => task?.promise).filter(Boolean));
  }

  _getYtDlpPath() {
    return this.musicResolver?.config?.ytdlpPath || this.config.resolver.ytdlpPath || 'yt-dlp';
  }

  async _playFallbackTrack() {
    const cfg = this.config.fallbackPlaylist || {};
    const tracks = Array.isArray(cfg.tracks) ? cfg.tracks : [];
    if (!cfg.enabled || !tracks.length) return null;

    for (let offset = 0; offset < tracks.length; offset += 1) {
      const idx = (this._fallbackIndex + offset) % tracks.length;
      const fallback = await this._resolveFallbackTrack(tracks[idx], idx + 1);
      if (!fallback) continue;
      if (this._isSafetyLocked() || this.queueManager?.getQueue?.().length > 0) return null;
      try {
        await this.playbackEngine.play(fallback);
        this.queueManager.markPlaying(fallback);
        this._fallbackIndex = (idx + 1) % tracks.length;
        this.api.emit('musicbot:fallback-playing', {
          title: fallback.title,
          source: fallback.source
        });
        return fallback;
      } catch (error) {
        this.api.log(`[music-bot] Fallback playback failed: ${error.message}`, 'warn');
      }
    }
    return null;
  }

  async _resolveFallbackTrack(entry, index) {
    try {
      if (!entry) return null;
      if (typeof entry === 'object' && (entry.url || entry.localPath)) {
        const rawUrl = entry.localPath || entry.url;
        const resolvedPath = this._resolveLocalPath(rawUrl);
        return {
          id: entry.id || `fallback-${index}`,
          title: entry.title || `Fallback Track ${index}`,
          artist: entry.artist || '',
          duration: entry.duration || null,
          thumbnail: entry.thumbnail || null,
          url: resolvedPath || rawUrl,
          localPath: resolvedPath || null,
          source: entry.source || 'fallback',
          requestedBy: 'fallback'
        };
      }

      const text = String(entry || '').trim();
      if (!text) return null;
      const resolvedPath = this._resolveLocalPath(text);
      if (resolvedPath) {
        return {
          id: `fallback-${createHash('sha1').update(resolvedPath).digest('hex').slice(0, 12)}`,
          title: path.basename(resolvedPath),
          artist: '',
          duration: null,
          thumbnail: null,
          url: resolvedPath,
          localPath: resolvedPath,
          source: 'fallback',
          requestedBy: 'fallback'
        };
      }

      const resolved = await this.musicResolver.resolve(text);
      if (!resolved?.success) return null;
      return {
        ...resolved.song,
        id: `fallback-${createHash('sha1').update(text).digest('hex').slice(0, 12)}`,
        requestedBy: 'fallback',
        source: resolved.song?.source || 'fallback'
      };
    } catch (error) {
      this.api.log(`[music-bot] Failed to resolve fallback track: ${error.message}`, 'warn');
      return null;
    }
  }

  _resolveLocalPath(rawPath) {
    if (!rawPath || /^https?:\/\//i.test(rawPath)) return null;
    if (path.isAbsolute(rawPath)) {
      return fs.existsSync(rawPath) ? rawPath : null;
    }
    const baseDir = this.pluginDataDir || __dirname;
    const absolute = path.resolve(baseDir, rawPath);
    const relative = path.relative(path.resolve(baseDir), absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return fs.existsSync(absolute) ? absolute : null;
  }

  // ---------- Emitters ----------

  _handleResolverProgress(event) {
    if (this._destroyed || !event) return;
    this._lastResolverProgress = this._sanitizeDiagnosticValue(event);
    this.api.emit('musicbot:resolver', this._buildResolverSnapshot());
    this._emitRuntimeHealth();
  }

  _emitRuntimeHealth() {
    const runtime = this._buildRuntimeSnapshot();
    const resolver = this._buildResolverSnapshot();
    this.api.emit('musicbot:runtime', runtime);
    this.api.emit('musicbot:health', this._buildHealthPayload(runtime, resolver));
  }

  _emitStatus() {
    this.api.emit('musicbot:now-playing', this.playbackEngine.getNowPlaying());
    this._emitQueue();
    this._emitVolume(this._computeEffectiveVolume());
  }

  _emitQueue() {
    const queue = this.queueManager.getQueue();
    this.api.emit('musicbot:queue-update', {
      queue,
      length: queue.length
    });
  }

  _emitSongAdded(song, position) {
    this.api.emit('musicbot:song-added', {
      title: song.title,
      requestedBy: song.requestedBy,
      position,
      duration: song.duration
    });
    this._emitQueue();
  }

  _emitSongSkipped(title, reason) {
    this.api.emit('musicbot:song-skipped', {
      title,
      reason
    });
    this._emitToast('info', 'Song übersprungen', `${title} (${reason})`);
  }

  _emitVolume(volume) {
    this.api.emit('musicbot:volume-changed', {
      volume,
      masterVolume: this.config.audio.masterVolume,
      sourceVolume: this.config.audio.sourceVolume
    });
  }

  _emitPaused() {
    this.api.emit('musicbot:paused', {});
  }

  _emitResumed() {
    this.api.emit('musicbot:resumed', {});
  }

  _emitPlaybackStopped() {
    this.api.emit('musicbot:playback-stopped', {});
  }

  _emitError(message) {
    this.api.emit('musicbot:error', { message });
    this._emitToast('error', 'API-Fehler', String(message || 'Unbekannter Fehler'));
  }

  _emitNowPlaying(track) {
    const payload = arguments.length > 0 ? track : this.playbackEngine.getNowPlaying();
    this.api.emit('musicbot:now-playing', payload);
  }

  _emitPlaybackAdvancing(reason) {
    this.api.emit('musicbot:playback-advancing', {
      reason: reason || 'track-end',
      message: 'Lädt den nächsten Titel …'
    });
  }

  _emitVoteSkipUpdate(result) {
    this.api.emit('musicbot:vote-skip-update', {
      votes: result.votes,
      required: result.required,
      skipped: result.skipped || false,
      voters: this.queueManager.getVoteVoters(),
      title: this.playbackEngine.getNowPlaying()?.title || null,
      immuneInfo: result.immuneInfo
    });
  }

  _emitChatResponse(message, username) {
    this.api.emit('musicbot:chat-response', { message, username });
  }

  _emitToast(type, title, message) {
    this.api.emit('musicbot:status-toast', {
      type: String(type || 'info'),
      title: String(title || 'Music Bot'),
      message: String(message || ''),
      timestamp: Date.now()
    });
  }

  _handleChatResponse(payload) {
    if (payload?.message) {
      this._emitChatResponse(payload.message, payload.username);
    }
  }

  async _handleGiftEvent(data) {
    const username =
      data?.username || data?.nickname || data?.user?.uniqueId || data?.user?.nickname;
    if (!username) return;
    const giftNameRaw = String(
      data?.gift?.name || data?.giftName || ''
    ).trim();
    const giftName = this._normalizeGiftKey(giftNameRaw);
    const coins = Math.max(0, Number(data?.coins || 0));

    if (this.config.monetization?.payToPlayEnabled) {
      const playCatalog = this._normalizeGiftList(this.config.monetization.payToPlayGiftCatalog)
        .map((entry) => this._normalizeGiftKey(entry));
      const minCoins = Math.max(0, Number(this.config.monetization.payToPlayMinCoins) || 0);
      let credits = 0;
      if (giftName && playCatalog.includes(giftName)) {
        credits = Math.max(credits, 1);
      }
      if (minCoins > 0 && coins >= minCoins) {
        credits = Math.max(credits, Math.floor(coins / minCoins));
      }
      if (credits > 0) {
        const totalCredits = this._addRequestCredits(username, credits);
        this._emitToast('success', 'Pay-to-Play', `@${username} hat ${credits} Request-Credit(s) erhalten (${totalCredits} verfügbar).`);
      }
    }

    if (this.config.monetization?.payToSkipEnabled && giftName) {
      const skipCatalog = this._normalizeGiftList(this.config.monetization.payToSkipGiftCatalog)
        .map((entry) => this._normalizeGiftKey(entry));
      if (skipCatalog.includes(giftName)) {
        const skipped = await this._skipCurrent(`gift:${giftNameRaw}`);
        if (skipped.success) {
          this._emitToast('info', 'Pay-to-Skip', `Song wurde per Gift "${giftNameRaw}" übersprungen.`);
        }
      }
    }

    const gifts = (this.config.giftIntegration?.skipImmunityGifts || []).map((g) =>
      String(g || '').toLowerCase().trim()
    );
    if (!gifts.length || !giftName) return;

    const match = gifts.find((entry) => String(entry || '').toLowerCase() === giftName);
    if (!match) return;

    const hasSong = this._findSongByUser(username);
    if (!hasSong) return;

    hasSong.isGiftRequest = true;
    this.queueManager.addSkipImmunity(username);
    this.api.emit('musicbot:skip-immunity-granted', { username, giftName: match });
    this._emitChatResponse(`${username} hat Skip-Immunity erhalten (${match}).`, username);
  }

  _findSongByUser(username) {
    const lower = String(username || '').toLowerCase();
    if (!lower) return null;
    const current = this.playbackEngine.getNowPlaying();
    if (current?.requestedBy?.toLowerCase() === lower) {
      return current;
    }
    return this.queueManager.getQueue().find((item) => item.requestedBy?.toLowerCase() === lower);
  }

  async _maybePlayAutoDJ(force = false) {
    if (this._isSafetyLocked() || !this.autoDJ || !this.config.autoDJ?.enabled) {
      return null;
    }
    if (this.queueManager?.getQueue?.().length > 0) return null;
    const activeBeforeResolve = this.playbackEngine?.getNowPlaying?.();
    if (force && activeBeforeResolve && activeBeforeResolve.requestedBy !== 'AutoDJ') return null;

    let result = null;
    let track = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      result = force ? await this.autoDJ.getNextSong(true) : await this.autoDJ.onQueueEmpty();
      if (!result) return null;
      if (
        this._isSafetyLocked()
        || this.queueManager?.getQueue?.().length > 0
        || (!force && this.playbackEngine?.isPlaying?.())
        || (force && this.playbackEngine?.isPlaying?.()
          && this.playbackEngine?.getNowPlaying?.()?.requestedBy !== 'AutoDJ')
      ) {
        return null;
      }
      track = this._decorateTrackIdentity(result.song || result);
      const banMessage = this._checkBans(track, 'AutoDJ');
      if (!banMessage) break;
      this.autoDJ.recordFailedTrack?.(track, 'blocked-by-ban-list');
      this.api.log(
        `[music-bot] AutoDJ rejected blocked track "${track.title || track.id}": ${banMessage}`,
        'warn'
      );
      track = null;
    }
    if (!track) return null;

    try {
      await this.playbackEngine.play(track);
      this.autoDJ.markTrackStarted(track);
      this.queueManager.markPlaying(track);
      this._emitQueue();
      this.api.emit('musicbot:auto-dj-playing', {
        title: track.title,
        mode: this.autoDJ.getStatus().mode
      });
      if (result.announce && this.config.autoDJ.announceAutoDJ) {
        this._emitChatResponse(`AutoDJ spielt: ${track.title}`, 'AutoDJ');
      }
      return track;
    } catch (error) {
      this.autoDJ.recordFailedTrack?.(track, 'start-failed');
      this.autoDJ.markPlaybackFailed(error);
      this.api.log(`[music-bot] AutoDJ playback failed: ${error.message}`, 'error');
      return null;
    }
  }

  async _handleAutoDJPlaybackFailure(track, reason, error) {
    if (!track || typeof track !== 'object') return null;
    const activeTrack = this.playbackEngine?.getNowPlaying?.();
    if (activeTrack && activeTrack !== track) {
      this.api.log('[music-bot] Ignoring stale AutoDJ playback failure for ' + (track.id || track.title || 'unknown'), 'warn');
      return null;
    }
    if (this._autoDjRecoveryTracks.has(track)) return null;
    this._autoDjRecoveryTracks.add(track);
    this._stopPlaybackSync();
    this.autoDJ && this.autoDJ.recordFailedTrack && this.autoDJ.recordFailedTrack(track, reason);
    this.autoDJ && this.autoDJ.markPlaybackFailed && this.autoDJ.markPlaybackFailed(error);
    const preserveReplacementOutgoing = reason === 'ipc-confirmed'
      && this.playbackEngine.rememberReplacementOutgoing?.(track);
    this.playbackEngine.clearNowPlaying && this.playbackEngine.clearNowPlaying({ preserveReplacementOutgoing });
    this.api.log('[music-bot] AutoDJ track failed (' + reason + '); selecting replacement for ' + (track.id || track.title || 'unknown'), 'warn');
    return await this._maybePlayAutoDJ(true);
  }

  _buildStatusPayload() {
    const runtime = this._buildRuntimeSnapshot();
    const resolver = this._buildResolverSnapshot();
    const health = this._buildHealthPayload(runtime, resolver);
    return {
      success: true,
      nowPlaying: this.playbackEngine.getNowPlaying(),
      queueLength: this.queueManager.getQueue().length,
      volume: this._computeEffectiveVolume(),
      masterVolume: this.config.audio.masterVolume,
      sourceVolume: this.config.audio.sourceVolume,
      onboarding: this.config.onboarding,
      playbackState: this.playbackEngine.getState(),
      autoDJ: this.autoDJ?.getStatus(),
      ytdlpAvailable: this._ytdlpAvailable || false,
      mpvAvailable: this._mpvAvailable || false,
      runtime,
      players: runtime.slots || { A: null, B: null },
      resolver,
      health
    };
  }

  _buildRuntimeSnapshot() {
    const fallback = {
      lifecycle: this._destroyed ? 'destroyed' : 'active',
      safetyLock: this._isSafetyLocked(),
      transportState: this.playbackEngine?.getState?.() || 'idle',
      transitionGeneration: this._lifecycleGeneration,
      activePlaybackId: this.playbackEngine?.getNowPlaying?.()?.id || null,
      activeSlot: null,
      slots: { A: null, B: null },
      healthy: !this._destroyed,
      lastTransition: this._stateTransitions.at(-1) || null,
      lastError: null
    };
    const snapshot = this.playbackEngine?.getSnapshot?.() || fallback;
    const safe = this._sanitizeDiagnosticValue({ ...fallback, ...snapshot });
    safe.safetyLock = this._isSafetyLocked();
    safe.slots = safe.slots || { A: null, B: null };
    return safe;
  }

  _buildResolverSnapshot() {
    const source = this.musicResolver?.getSnapshot?.()
      || this.musicResolver?.getResolverStatus?.()
      || {};
    const runner = source.runner || {};
    const snapshot = {
      ...source,
      active: Number(source.active ?? runner.active ?? 0),
      queued: Number(source.queued ?? runner.queued ?? 0),
      jobs: Array.isArray(source.jobs) ? source.jobs : [],
      progress: this._lastResolverProgress
    };
    return this._sanitizeDiagnosticValue(snapshot);
  }

  _buildHealthPayload(runtime = this._buildRuntimeSnapshot(), resolver = this._buildResolverSnapshot()) {
    const locked = this._isSafetyLocked();
    const slots = Object.values(runtime.slots || {}).filter(Boolean);
    const activeStates = new Set([
      'buffering',
      'crossfading',
      'loading',
      'paused',
      'playing',
      'recovering',
      'testing'
    ]);
    const activePlayers = slots.filter((slot) => (
      activeStates.has(String(slot.state || '').toLowerCase())
      || Boolean(slot.playbackId || slot.media?.title || slot.media?.basename)
    )).length;
    const playerProcesses = slots.filter((slot) => Number.isInteger(Number(slot.pid))).length;
    const cleanLockedController = locked
      && runtime.lifecycle === 'active'
      && playerProcesses === 0
      && !runtime.lastError;
    const controllerHealthy = runtime.healthy !== false || cleanLockedController;
    const runtimeState = locked ? 'locked' : (runtime.transportState || 'idle');
    const stateConsistent = runtimeState === 'locked'
      ? playerProcesses === 0 && activePlayers === 0
      : !(runtimeState === 'idle' && activePlayers > 0);
    const cache = this.mediaCache?.getStats?.() || { files: 0, bytes: 0, inflight: 0 };
    return {
      state: runtimeState,
      locked,
      healthy: controllerHealthy && stateConsistent,
      controllerHealthy,
      stateConsistent,
      mpvAvailable: Boolean(this._mpvAvailable),
      ytdlpAvailable: Boolean(this._ytdlpAvailable),
      activePlayers,
      playerProcesses,
      resolverActive: Number(resolver.active || 0),
      resolverQueued: Number(resolver.queued || 0),
      cache: {
        files: Number(cache.files || 0),
        bytes: Number(cache.bytes || 0),
        inflight: Number(cache.inflight || 0),
        pinned: Number(cache.pinned || 0)
      },
      lastError: runtime.lastError || null,
      checkedAt: Date.now()
    };
  }

  _buildDiagnosticsPayload() {
    const runtime = this._buildRuntimeSnapshot();
    const resolver = this._buildResolverSnapshot();
    return {
      success: true,
      runtime,
      players: runtime.slots || { A: null, B: null },
      resolver,
      health: this._buildHealthPayload(runtime, resolver),
      transitions: this._sanitizeDiagnosticValue(this._stateTransitions.slice(-100))
    };
  }

  _formatNowPlaying() {
    const current = this.playbackEngine.getNowPlaying();
    if (!current) {
      return 'Aktuell läuft nichts.';
    }
    return `Jetzt läuft: ${current.title} (${current.duration || '?'}s)`;
  }

  _startPlaybackSync() {
    if (this.playbackSyncTimer) {
      clearInterval(this.playbackSyncTimer);
    }
    this.playbackSyncTimer = setInterval(async () => {
      const nowPlaying = this.playbackEngine.getNowPlaying();
      if (!nowPlaying) return;
      let position = 0;
      try {
        const heartbeat = await this.playbackEngine.heartbeat({ timeoutMs: 2000 });
        position = Number(heartbeat?.position) || 0;
        this._emitRuntimeHealth();
      } catch (error) {
        if (error?.code === 'MPV_HEARTBEAT_SAFETY_LOCK' || this._isSafetyLocked()) return;
        this.api.log(`[music-bot] MPV heartbeat failed: ${error.message}`, 'warn');
        position = nowPlaying.startedAt
          ? Math.max(0, Math.floor((Date.now() - nowPlaying.startedAt) / 1000))
          : 0;
      }
      const latestTrack = this.playbackEngine.getNowPlaying();
      if (latestTrack !== nowPlaying) return;
      this.api.emit('musicbot:playback-sync', {
        id: nowPlaying.id,
        title: nowPlaying.title,
        artist: nowPlaying.artist,
        requestedBy: nowPlaying.requestedBy,
        requesterAvatar: nowPlaying.requesterAvatar || null,
        thumbnail: nowPlaying.thumbnail,
        duration: nowPlaying.duration,
        position,
        startedAt: nowPlaying.startedAt,
        state: this.playbackEngine.getState()
      });
    }, 5000);
  }

  _stopPlaybackSync() {
    if (this.playbackSyncTimer) {
      clearInterval(this.playbackSyncTimer);
      this.playbackSyncTimer = null;
    }
  }

  _clearCrossfadeTimer() {
    if (this.crossfadeTimer) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
  }

  _scheduleCrossfadeTransition(track) {
    this._clearCrossfadeTimer();
    const durationMs = Math.round(Number(track?.duration) * 1000);
    const crossfadeMs = Math.max(0, Number(this.config?.playback?.crossfadeDuration) || 0);
    if (!Number.isFinite(durationMs) || durationMs <= crossfadeMs || crossfadeMs <= 0) return;

    const trackId = track?.id;
    this.crossfadeTimer = setTimeout(() => {
      this.crossfadeTimer = null;
      const current = this.playbackEngine?.getNowPlaying?.();
      if (!trackId || current?.id !== trackId || !this.playbackEngine?.isPlaying?.()) return;
      this._playNextFromQueue().catch((error) => {
        this.api.log(`[music-bot] Crossfade transition failed: ${error.message}`, 'warn');
      });
    }, durationMs - crossfadeMs);
  }
}

module.exports = MusicBotPlugin;
