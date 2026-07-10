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
const CommandParser = require('./lib/command-parser');
const QueueManager = require('./lib/queue-manager');
const MusicResolver = require('./lib/music-resolver');
const PlaybackEngine = require('./lib/playback-engine');
const BanList = require('./lib/ban-list');
const AutoDJ = require('./lib/auto-dj');

const DEFAULT_PRECACHE_LOOKAHEAD = 2;
const MAX_PRECACHE_LOOKAHEAD = 5;
const PRECACHE_KILL_TIMEOUT_MS = 1500;
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
    maxConsecutiveAutoDJ: 10,
    announceAutoDJ: true,
    randomKeywords: ['lofi hip hop', 'chill music', 'gaming music', 'pop hits'],
    playlistUrls: []
  },
  resolver: {
    ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
    searchTimeout: 15000,
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
  preCache: {
    enabled: true,
    lookahead: 2
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
    this._mpvRestartAttempts = 0;

    this.config = { ...DEFAULT_CONFIG };
    this.banList = null;
    this.queueManager = null;
    this.musicResolver = null;
    this.playbackEngine = null;
    this.commandParser = null;
    this.autoDJ = null;
    this._pendingRequests = new Set();
    this._requestCredits = new Map();
    this._userLikes = new Map();
    this.pluginDataDir = null;
    this.cacheDir = null;
    this._precacheTasks = new Map();
    this._precacheState = new Map();
    this._fallbackIndex = 0;
    this._ioEmitOriginal = null;
    this._ttsDuckingHandlers = null;
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
    await this._pruneCacheDir();

    await this._ensureYtDlp();
    await this._ensureMpv();

    this.queueManager = new QueueManager(this.config, this.api);
    this.musicResolver = new MusicResolver(
      { ...this.config.resolver, moderation: this.config.moderation },
      this.api
    );
    this.playbackEngine = new PlaybackEngine(this.config.playback, this.api);
    await this.playbackEngine.setVolume(this._computeEffectiveVolume());
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
    try {
      await this.playbackEngine.shutdown();
    } catch (error) {
      this.api.log(`[music-bot] Failed to shutdown playback: ${error.message}`, 'error');
    }

    // Keep queued songs across app restarts and plugin reloads. Explicit user
    // actions still use queueManager.clear() through the clear route/command.
    this.queueManager?.persistQueue?.();
    this._cleanupDuckingHooks();
    await this._stopPrecacheTasks();
    this._pendingRequests.clear();
    this._requestCredits.clear();
    this._userLikes.clear();
    this.removeAllListeners();
    this._stopPlaybackSync();
    this._clearCrossfadeTimer();
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
    this.config.onboarding = this._normalizeOnboarding(this.config.onboarding);
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
    this.config.audio.masterVolume = Math.max(0, Math.min(100, Number(this.config.audio.masterVolume) || DEFAULT_CONFIG.audio.masterVolume));
    this.config.audio.sourceVolume = Math.max(0, Math.min(100, Number(this.config.audio.sourceVolume) || DEFAULT_CONFIG.audio.sourceVolume));
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

    add(configuredMpvPath || 'mpv');

    const resolvedMpv = await this._resolveExecutable('mpv');
    add(resolvedMpv);

    if (process.platform === 'win32') {
      const chocolateyRoot = process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey';
      const chocolateyLibDir = path.join(chocolateyRoot, 'lib');
      const userProfile = process.env.USERPROFILE || '';
      const localAppData = process.env.LOCALAPPDATA || '';
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
      [
        path.join(chocolateyRoot, 'bin', 'mpv.exe'),
        path.join(userProfile, 'scoop', 'shims', 'mpv.exe'),
        'C:\\ProgramData\\scoop\\shims\\mpv.exe',
        path.join(programFiles, 'mpv', 'mpv.exe'),
        path.join(programFilesX86, 'mpv', 'mpv.exe')
      ].forEach(add);

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
    this.queueManager.restoreQueue();
    this._emitStatus();
    this._emitQueue();
    this._schedulePreCache();
  }

  _registerPlaybackEvents() {
    this.playbackEngine.on('track-start', (track) => {
      this.queueManager.markPlaying(track);
      this.queueManager.resetVoteSkips();
      this._emitNowPlaying(track);
      this._mpvRestartAttempts = 0;
      this._startPlaybackSync();
      this._scheduleCrossfadeTransition(track);
      this._schedulePreCache();
    });

    this.playbackEngine.on('track-end', (info) => {
      if (info.reason !== 'crossfade') {
        this._clearCrossfadeTimer();
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
      this._playNextFromQueue();
    });

    this.playbackEngine.on('volume-changed', (volume) => {
      this._emitVolume(volume);
    });

    this.playbackEngine.on('error', (error) => {
      this._emitError(error.message || error);
    });

    this.playbackEngine.on('crashed', async () => {
      const current = this.playbackEngine.getNowPlaying();
      this._mpvRestartAttempts += 1;
      if (this._mpvRestartAttempts > 3 || !current) {
        this.api.log('[music-bot] mpv crashed and could not be restarted', 'error');
        this.playbackEngine.clearNowPlaying();
        this._emitPlaybackStopped();
        return;
      }
      this.api.log('[music-bot] mpv crashed, attempting automatic restart', 'warn');
      setTimeout(async () => {
        try {
          await this.playbackEngine.play(current);
        } catch (error) {
          this.api.log(`[music-bot] mpv restart failed: ${error.message}`, 'error');
        }
      }, 2000);
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
      res.json(this._buildStatusPayload());
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
      try {
        const resolved = await this.musicResolver.resolve(query);
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
      const result = await this._handleDashboardRequest(query, username, requesterAvatar);
      res.status(result.success ? 200 : 400).json(result);
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/skip', async (req, res) => {
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
      await this.playbackEngine.pause();
      res.json({ success: true });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/resume', async (req, res) => {
      await this.playbackEngine.resume();
      res.json({ success: true });
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
      const update = req.body || {};
      const previousMpvPath = this.config?.playback?.mpvPath;
      const previousYtDlpPath = this.config?.resolver?.ytdlpPath;
      const merged = this._mergeDeep(this.config, update);
      const aliasValidation = this._validateCommandAliases(merged);
      if (!aliasValidation.valid) {
        res.status(400).json({ success: false, error: aliasValidation.error });
        return;
      }
      this.config = merged;
      this.config.moderation = this._mergeDeep(DEFAULT_CONFIG.moderation, this.config.moderation || {});
      this.config.monetization = this._mergeDeep(DEFAULT_CONFIG.monetization, this.config.monetization || {});
      this.config.audio = this._mergeDeep(DEFAULT_CONFIG.audio, this.config.audio || {});
      if (!Array.isArray(this.config.moderation.blockedKeywords)) {
        this.config.moderation.blockedKeywords = [];
      }
      this.config.monetization.payToPlayGiftCatalog = this._normalizeGiftList(this.config.monetization.payToPlayGiftCatalog);
      this.config.monetization.payToSkipGiftCatalog = this._normalizeGiftList(this.config.monetization.payToSkipGiftCatalog);
      this.config.monetization.minLikesPerUser = Math.max(1, Number(this.config.monetization.minLikesPerUser) || 1);
      this.config.monetization.payToPlayMinCoins = Math.max(0, Number(this.config.monetization.payToPlayMinCoins) || 0);
      this.config.audio.masterVolume = Math.max(0, Math.min(100, Number(this.config.audio.masterVolume) || DEFAULT_CONFIG.audio.masterVolume));
      this.config.audio.sourceVolume = Math.max(0, Math.min(100, Number(this.config.audio.sourceVolume) || DEFAULT_CONFIG.audio.sourceVolume));
      this.config.onboarding = this._normalizeOnboarding(this.config.onboarding);
      this.queueManager.config = this.config;
      this.queueManager.queueConfig = this.config.queue;
      this.playbackEngine.config = this.config.playback;
      this.musicResolver.updateConfig({ ...this.config.resolver, moderation: this.config.moderation });
      this.autoDJ?.updateConfig(this.config.autoDJ);
      const mpvPathChanged = previousMpvPath !== this.config?.playback?.mpvPath;
      const ytDlpPathChanged = previousYtDlpPath !== this.config?.resolver?.ytdlpPath;
      if (ytDlpPathChanged) {
        await this._ensureYtDlp();
      }
      if (mpvPathChanged) {
        await this._ensureMpv();
      }
      await this._applyAudioVolume();
      await this.api.setConfig('config', this.config);
      if (mpvPathChanged || ytDlpPathChanged) {
        this._emitSetupStatus();
      }
      res.json({ success: true, config: this.config });
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
      const { fromIndex, toIndex } = req.body || {};
      if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') {
        res.status(400).json({ success: false, error: 'fromIndex and toIndex are required' });
        return;
      }
      const result = this.queueManager.reorderSong(fromIndex, toIndex);
      if (result.success) {
        this._emitQueue();
      }
      res.status(result.success ? 200 : 400).json(result);
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
      const validTypes = ['url', 'keyword', 'channel', 'user'];
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
      this.autoDJ?.updateConfig(this.config.autoDJ);
      await this.api.setConfig('config', this.config);
      res.json({ success: true, status: this.autoDJ?.getStatus() });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/auto-dj/skip', async (req, res) => {
      const next = await this._maybePlayAutoDJ(true);
      res.json({ success: Boolean(next), track: next || null });
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
    });

    this.api.registerSocket('musicbot:dashboard-skip', async () => {
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

    this.api.registerSocket('musicbot:dashboard-pause', async () => {
      await this.playbackEngine.pause();
      this._emitPaused();
    });

    this.api.registerSocket('musicbot:dashboard-resume', async () => {
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
    const ttsStarted = async () => {
      try {
        await this.playbackEngine?.triggerDucking();
      } catch (error) {
        this.api.log(`[music-bot] TTS ducking failed: ${error.message}`, 'error');
      }
    };
    const alertShown = async () => {
      try {
        await this.playbackEngine?.triggerDucking();
      } catch (error) {
        this.api.log(`[music-bot] Alert ducking failed: ${error.message}`, 'error');
      }
    };

    this._ttsDuckingHandlers = { ttsStarted, alertShown };
    if (this.api.pluginLoader?.on) {
      this.api.pluginLoader.on('tts:playback:started', ttsStarted);
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
    if (this._ioEmitOriginal && this.io) {
      this.io.emit = this._ioEmitOriginal;
    }
    this._ioEmitOriginal = null;
    this._ttsDuckingHandlers = null;
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

  async _handleDashboardRequest(query, username, requesterAvatar = null) {
    try {
      const resolved = await this.musicResolver.resolve(query);
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

  async _skipCurrent(reasonUser) {
    const current = this.playbackEngine.getNowPlaying();
    if (!current) {
      return { success: false, error: 'Nothing is playing' };
    }
    await this.playbackEngine.skip();
    this._emitSongSkipped(current.title, reasonUser || 'skip');
    return { success: true };
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
      await this.playbackEngine.play(next);
      this._emitQueue();
      this._schedulePreCache();
      return { success: true, song: next };
    } catch (error) {
      this.api.log(`[music-bot] Playback failed: ${error.message}`, 'error');
      if (this._isMpvUnavailableError(error)) {
        return this._handlePlaybackUnavailable(next, error);
      }
      this._emitError(error.message);
      setImmediate(() => this._playNextFromQueue(retries + 1));
      return { success: false, error: error.message };
    }
  }

  _schedulePreCache() {
    try {
      const cfg = this.config.preCache || {};
      if (!cfg.enabled) return;
      const requestedLookahead = Number(cfg.lookahead);
      const lookahead = Math.max(
        0,
        Math.min(
          Number.isFinite(requestedLookahead) ? requestedLookahead : DEFAULT_PRECACHE_LOOKAHEAD,
          MAX_PRECACHE_LOOKAHEAD
        )
      );
      if (!lookahead) return;
      const upcoming = this.queueManager.getQueue().slice(0, lookahead);
      upcoming.forEach((song) => this._startPreCache(song));
    } catch (error) {
      this.api.log(`[music-bot] Failed to schedule pre-cache: ${error.message}`, 'warn');
    }
  }

  _startPreCache(song) {
    if (!song?.id || !song?.url) return;
    if (song.localPath && fs.existsSync(song.localPath)) return;
    if (this._precacheTasks.has(song.id)) return;

    const cacheState = this._precacheState.get(song.id);
    if (cacheState?.path && fs.existsSync(cacheState.path)) {
      if (!this.queueManager.setSongLocalPath(song.id, cacheState.path)) {
        this._precacheState.delete(song.id);
      }
      return;
    }

    const isHttpUrl = /^https?:\/\//i.test(song.url);
    if (!isHttpUrl) {
      if (fs.existsSync(song.url)) {
        if (!this.queueManager.setSongLocalPath(song.id, song.url)) {
          this._precacheState.delete(song.id);
        }
      }
      return;
    }

    const cacheKey = this._safeCacheKey(song.id);
    const outputTemplate = path.join(this.cacheDir, `${cacheKey}-%(id)s.%(ext)s`);
    const args = [
      '--no-warnings',
      '--ignore-errors',
      '--no-playlist',
      '--format',
      'bestaudio',
      '--output',
      outputTemplate,
      '--print',
      'after_move:filepath',
      song.url
    ];

    const ytdlpPath = this._getYtDlpPath();
    const proc = spawn(ytdlpPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this._precacheTasks.set(song.id, proc);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (error) => {
      this._precacheTasks.delete(song.id);
      if (error?.code === 'ENOENT') {
        this._ytdlpAvailable = false;
        this._emitSetupStatus();
        this.api.log('[music-bot] Pre-cache: yt-dlp not found, disabling pre-cache', 'warn');
      } else {
        this.api.log(`[music-bot] Pre-cache process failed: ${error.message}`, 'warn');
      }
    });
    proc.on('close', () => {
      this._precacheTasks.delete(song.id);
      const cachedPath = stdout.trim().split('\n').filter(Boolean).pop();
      if (cachedPath && fs.existsSync(cachedPath)) {
        this._precacheState.set(song.id, { path: cachedPath, cachedAt: Date.now() });
        if (!this.queueManager.setSongLocalPath(song.id, cachedPath)) {
          this._precacheState.delete(song.id);
        }
        this._pruneCacheDir().catch((error) => {
          this.api.log(`[music-bot] Cache prune failed: ${error.message}`, 'debug');
        });
      } else if (stderr) {
        this.api.log(`[music-bot] Pre-cache skipped for "${song.title}": ${stderr.trim()}`, 'debug');
      }
    });
  }

  async _stopPrecacheTasks() {
    const tasks = Array.from(this._precacheTasks.values());
    this._precacheTasks.clear();
    await Promise.all(tasks.map((proc) => new Promise((resolve) => {
      if (!proc || proc.exitCode !== null) {
        resolve();
        return;
      }
      proc.once('close', () => resolve());
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (proc.exitCode === null) {
          proc.kill('SIGKILL');
        }
      }, PRECACHE_KILL_TIMEOUT_MS);
    })));
  }

  _getYtDlpPath() {
    return this.musicResolver?.config?.ytdlpPath || this.config.resolver.ytdlpPath || 'yt-dlp';
  }

  _safeCacheKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'track';
    return createHash('sha1').update(raw).digest('hex').slice(0, 16);
  }

  async _pruneCacheDir() {
    const maxCacheFiles = 200;
    const entries = await fsp.readdir(this.cacheDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(this.cacheDir, entry.name);
      try {
        const stat = await fsp.stat(fullPath);
        files.push({ fullPath, mtimeMs: stat.mtimeMs });
      } catch (_) {
        // ignore stale entries
      }
    }
    if (files.length <= maxCacheFiles) return;
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    const removeCount = files.length - maxCacheFiles;
    await Promise.all(files.slice(0, removeCount).map(async (file) => {
      try {
        await fsp.unlink(file.fullPath);
      } catch (_) {
        // ignore deletion errors
      }
    }));
  }

  async _playFallbackTrack() {
    const cfg = this.config.fallbackPlaylist || {};
    const tracks = Array.isArray(cfg.tracks) ? cfg.tracks : [];
    if (!cfg.enabled || !tracks.length) return null;

    for (let offset = 0; offset < tracks.length; offset += 1) {
      const idx = (this._fallbackIndex + offset) % tracks.length;
      const fallback = await this._resolveFallbackTrack(tracks[idx], idx + 1);
      if (!fallback) continue;
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
    const payload = track || this.playbackEngine.getNowPlaying();
    this.api.emit('musicbot:now-playing', payload);
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
    if (!this.autoDJ || !this.config.autoDJ?.enabled) {
      return null;
    }

    const result = force ? await this.autoDJ.getNextSong(true) : await this.autoDJ.onQueueEmpty();
    if (!result) return null;

    const track = result.song || result;
    try {
      await this.playbackEngine.play(track);
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
      this.api.log(`[music-bot] AutoDJ playback failed: ${error.message}`, 'error');
      return null;
    }
  }

  _buildStatusPayload() {
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
      mpvAvailable: this._mpvAvailable || false
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
        position = await this.playbackEngine.getPosition();
      } catch (_) {
        position = nowPlaying.startedAt ? Math.max(0, Math.floor((Date.now() - nowPlaying.startedAt) / 1000)) : 0;
      }
      this.api.emit('musicbot:playback-sync', {
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
