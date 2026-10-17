const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { execFile } = require('child_process');
const { spawn } = require('child_process');
const { promisify } = require('util');
const EventEmitter = require('events');
const { createHash, timingSafeEqual } = require('crypto');
const { getRequestAddress, hasForwardingHeaders, isLoopbackAddress } = require('../../modules/admin-auth');
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
  './lib/soundbot-process-registry',
  './lib/playback-controller',
  './lib/playback-engine',
  './lib/ban-list',
  './lib/auto-dj',
  './lib/next-song-vote',
  './lib/radio-supervisor',
  './lib/music-catalog',
  './lib/playlist-store',
  './lib/playlist-import-service'
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
const NextSongVote = require('./lib/next-song-vote');
const RadioSupervisor = require('./lib/radio-supervisor');
const MusicCatalog = require('./lib/music-catalog');
const PlaylistStore = require('./lib/playlist-store');
const PlaylistImportService = require('./lib/playlist-import-service');
const { createDashboardRequestLimiters } = require('./lib/dashboard-request-rate-limit');

const DEFAULT_PRECACHE_LOOKAHEAD = 2;
const MAX_PRECACHE_LOOKAHEAD = 5;
// Keep dashboard search/URL inputs bounded by encoded size before they reach yt-dlp or cache keys.
const MAX_DASHBOARD_QUERY_BYTES = 2048;
const CATALOG_METADATA_ENRICH_INITIAL_DELAY_MS = 5_000;
const CATALOG_METADATA_ENRICH_INTERVAL_MS = 20_000;
const CATALOG_METADATA_ENRICH_IDLE_DELAY_MS = 5 * 60_000;
const CATALOG_METADATA_ENRICH_STALE_AFTER_MS = 24 * 60 * 60_000;
const MPV_INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const QUEUE_SHUTDOWN_RETRY_DELAYS_MS = [25, 75];
const GIFT_EVENT_DEDUPE_TTL_MS = 10 * 60 * 1000;
const MAX_TRACKED_GIFT_EVENT_IDS = 10000;
const MUSIC_BOT_BUILD_FINGERPRINT = 'music-bot-radio-supervisor-v1';
const HISTORY_OUTCOMES = new Set(['completed', 'skipped', 'early_skip', 'failed']);
const HISTORY_FEEDBACK = new Set(['up', 'down', 'neutral']);
const HISTORY_BAN_FILTERS = new Set(['only', 'exclude']);
const HISTORY_SORTS = new Set(['finished_desc', 'finished_asc']);

function dashboardResolverHttpStatus({ result, error } = {}) {
  if (error?.code === 'UNSUPPORTED_SOURCE_URL') return 400;
  if (error?.code === 'ETIMEDOUT') return 504;
  if (error) return 503;
  return result?.reason === 'resolver_unavailable' ? 503 : 400;
}

function normalizeHistoryQuery(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const q = String(query.q || '').trim();
  const outcome = String(query.outcome || '').trim();
  const feedback = String(query.feedback || '').trim();
  const banned = String(query.banned || '').trim();
  const sort = String(query.sort || '').trim();
  return {
    limit,
    offset,
    q,
    outcome: HISTORY_OUTCOMES.has(outcome) ? outcome : '',
    feedback: HISTORY_FEEDBACK.has(feedback) ? feedback : '',
    banned: HISTORY_BAN_FILTERS.has(banned) ? banned : '',
    from: String(query.from || '').trim(),
    to: String(query.to || '').trim(),
    sort: HISTORY_SORTS.has(sort) ? sort : 'finished_desc'
  };
}

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
    remove: 'remove',
    vote1: 'vote1',
    vote2: 'vote2'
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
    remove: ['removesong', 'removemy', 'delsong'],
    vote1: [],
    vote2: []
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
    vote1: 'viewer',
    vote2: 'viewer',
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
    playlistFallbackToRandom: true,
    genreFilterEnabled: true,
    selectedGenres: [],
    bpmTransitionsEnabled: true,
    artistSpacingMinutes: 90,
    albumSpacingMinutes: 360,
    noveltyBudgetPercent: 20,
    noveltyCatalogAgeDays: 10,
    requestSeedsEnabled: true,
    liveFeedbackEnabled: true,
    previewEnabled: true,
    chatVotingEnabled: false,
    chatVoteCloseBeforeEndSeconds: 20
  },
  resolver: {
    ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
    searchTimeout: 45000,
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
    this._nextSongVoteTimer = null;
    this._nextSongVote = new NextSongVote({
      onUpdate: (status) => this._emitNextSongVote(status)
    });
    this._radioPrefetch = null;
    this._radioPrefetchGeneration = 0;
    this._autoDjRecoveryTracks = new WeakSet();
    this._catalogPlaybackStarts = new WeakMap();
    this._catalogTerminalTracks = new WeakSet();
    this._pendingTrackAdvance = null;
    this._pendingSkipAdvance = null;
    this._queueAdvanceOperation = null;
    this._autoDjAdvanceOperations = new Set();
    this._lifecycleGeneration = 1;
    this._destroyed = false;
    this.cleanupPending = false;
    this._pendingShutdownCleanupRetries = [];
    this._queuePersistedOnDestroy = false;
    this._playbackShutdownComplete = false;
    this._stateTransitions = [];
    this._lastResolverProgress = null;
    this._controllerSafetySyncPromise = Promise.resolve();
    this._configUpdateTail = Promise.resolve();

    // Constructor-only state stays inert for tests and route registration. The
    // persisted/default live-safe lock is applied atomically by _loadConfig().
    this.config = this._cloneConfigValue(DEFAULT_CONFIG);
    this.config.safety = { locked: false, lockedAt: null, reason: null };
    this.banList = null;
    this.queueManager = null;
    this.musicResolver = null;
    this.mediaCache = null;
    this.playbackEngine = null;
    this.commandParser = null;
    this.autoDJ = null;
    this.radioSupervisor = null;
    this.musicCatalog = null;
    this.playlistStore = null;
    this.playlistImports = null;
    this._pendingRequests = new Set();
    this._requestCredits = new Map();
    this._userLikes = new Map();
    this._processedGiftEventIds = new Map();
    this.pluginDataDir = null;
    this.cacheDir = null;
    this._precacheTasks = new Map();
    this._pinnedCacheKeys = new Set();
    this._catalogMetadataEnrichmentTimer = null;
    this._catalogMetadataEnrichmentRunning = false;
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
    this._mpvInstallPromise = null;
    this._dashboardRequestLimiters = createDashboardRequestLimiters();
  }

  async init() {
    this._loadConfig();
    this.pluginDataDir = this.api.ensurePluginDataDir();
    this.cacheDir = path.join(this.pluginDataDir, 'cache');
    await fsp.mkdir(this.cacheDir, { recursive: true });
    this._initializeMusicCatalog();
    this._initializePlaylistStore();

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
    this._initializePlaylistImports();
    this.mediaCache = new MediaCache({
      ...this.config.resolver,
      ...this.config.preCache,
      cacheDir: this.cacheDir,
      maxConcurrentDownloads: this.config.preCache.maxConcurrentDownloads
    }, this.api, { runner: this.musicResolver.runner });
    this.mediaCache.schedulePrune();
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
    this.autoDJ = new AutoDJ(this.config.autoDJ, this.musicResolver, this.db, this.api, {
      catalog: this.musicCatalog,
      playlistStore: this.playlistStore,
      isBanned: (track) => Boolean(this._checkBans(track, 'AutoDJ'))
    });
    this.radioSupervisor = new RadioSupervisor({
      advance: (context) => this._advancePlayback(context),
      isPlaying: () => Boolean(this.playbackEngine?.isPlaying?.()),
      isOccupied: () => this._isPlaybackOccupied(),
      onStateChange: () => {
        if (!this._destroyed) this._emitRuntimeHealth();
      }
    });
    this.radioSupervisor.setLocked(this._isSafetyLocked(), { wake: false });
    this.radioSupervisor.setEnabled(Boolean(this.config.autoDJ?.enabled), { wake: false });

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
    this._scheduleCatalogMetadataEnrichment(CATALOG_METADATA_ENRICH_INITIAL_DELAY_MS);
    this.api.log('[music-bot] Plugin initialized', 'info');

    this._emitSetupStatus();
  }

  async destroy(context = {}) {
    if (this._destroyed) {
      if (!this.cleanupPending) return;
      const retryOperations = this._pendingShutdownCleanupRetries;
      const retryResults = await Promise.all(retryOperations.map(async (retry) => {
        try {
          await retry();
          return null;
        } catch (error) {
          return { error, retry };
        }
      }));
      const pendingRetries = retryResults.filter(Boolean);
      this._pendingShutdownCleanupRetries = pendingRetries.map(({ retry }) => retry);
      if (pendingRetries.length > 0) {
        const error = pendingRetries[0].error;
        this.api.log(`[music-bot] Pending shutdown cleanup retry failed: ${error.message}`, 'error');
        throw error;
      }
      try {
        await this._persistQueueBeforeShutdown();
        await this._shutdownPlaybackForDestroy(context);
        this._finalizeDestroy();
        this.cleanupPending = false;
        this.api.log('[music-bot] Pending cleanup completed', 'info');
      } catch (error) {
        this.api.log(`[music-bot] Pending cleanup finalization failed: ${error.message}`, 'error');
        throw error;
      }
      return;
    }
    this._destroyed = true;
    this.cleanupPending = true;
    this.queueManager?.closeMutations?.();
    this._cancelNextSongVote('plugin-destroyed');
    if (this._catalogMetadataEnrichmentTimer) {
      clearTimeout(this._catalogMetadataEnrichmentTimer);
      this._catalogMetadataEnrichmentTimer = null;
    }
    const configUpdateDrain = this._configUpdateTail;
    this._lifecycleGeneration += 1;
    this._recordTransition('destroyed', 'plugin-destroy');
    this._stopPlaybackSync();
    this._clearCrossfadeTimer();
    this._invalidateRadioPrefetch('destroy');
    this._pendingTrackAdvance = null;
    this._pendingSkipAdvance = null;
    this._cleanupDuckingHooks();
    this.radioSupervisor?.destroy?.();
    this.autoDJ?.deactivate?.();

    const pendingAutoDjAdvances = [...this._autoDjAdvanceOperations];
    const shutdownErrors = [];
    const precacheShutdown = Promise.resolve().then(() => this._stopPrecacheTasks()).catch((error) => {
      shutdownErrors.push(error);
      this._pendingShutdownCleanupRetries.push(() => this._stopPrecacheTasks());
      this.api.log(`[music-bot] Failed to shutdown precache tasks: ${error.message}`, 'error');
    });
    const cacheShutdown = Promise.resolve().then(() => this.mediaCache?.destroy?.()).catch((error) => {
      shutdownErrors.push(error);
      this._pendingShutdownCleanupRetries.push(() => this.mediaCache?.destroy?.());
      this.api.log(`[music-bot] Failed to shutdown media cache: ${error.message}`, 'error');
    });
    const resolverShutdown = Promise.resolve().then(() => this.musicResolver?.destroy?.()).catch((error) => {
      shutdownErrors.push(error);
      this._pendingShutdownCleanupRetries.push(() => this.musicResolver?.destroy?.());
      this.api.log(`[music-bot] Failed to shutdown resolver: ${error.message}`, 'error');
    });
    const playlistImportShutdown = Promise.resolve().then(() => this.playlistImports?.destroy?.()).catch((error) => {
      shutdownErrors.push(error);
      this._pendingShutdownCleanupRetries.push(() => this.playlistImports?.destroy?.());
      this.api.log(`[music-bot] Failed to shutdown playlist imports: ${error.message}`, 'error');
    });
    const autoDjDrain = Promise.resolve()
      .then(() => this._drainOperations(pendingAutoDjAdvances, 250))
      .then((drained) => {
        if (drained !== false) return;
        const error = new Error('AutoDJ queue operations did not settle before shutdown.');
        error.code = 'MUSIC_BOT_OPERATIONS_PENDING';
        shutdownErrors.push(error);
        this._pendingShutdownCleanupRetries.push(async () => {
          const retryDrained = await this._drainOperations(pendingAutoDjAdvances, 250);
          if (retryDrained === false) throw error;
        });
        this.api.log(`[music-bot] Failed to drain AutoDJ operations: ${error.message}`, 'error');
      })
      .catch((error) => {
        shutdownErrors.push(error);
        this._pendingShutdownCleanupRetries.push(async () => {
          const retryDrained = await this._drainOperations(pendingAutoDjAdvances, 250);
          if (retryDrained === false) throw error;
        });
        this.api.log(`[music-bot] Failed to drain AutoDJ operations: ${error.message}`, 'error');
      });
    await Promise.all([
      precacheShutdown,
      cacheShutdown,
      resolverShutdown,
      playlistImportShutdown,
      autoDjDrain
    ]);
    await configUpdateDrain;

    if (shutdownErrors.length > 0) {
      this.cleanupPending = true;
      throw shutdownErrors[0];
    }

    try {
      await this._persistQueueBeforeShutdown();
      await this._shutdownPlaybackForDestroy(context);
      this._finalizeDestroy();
    } catch (error) {
      this.cleanupPending = true;
      this.api.log(`[music-bot] Queue/playback shutdown pending: ${error.message}`, 'error');
      throw error;
    }
    this.cleanupPending = false;
    this.api.log('[music-bot] Plugin destroyed', 'info');
  }

  async _persistQueueBeforeShutdown() {
    if (this._queuePersistedOnDestroy) return;
    const queueManager = this.queueManager;
    const persistQueue = queueManager?.persistQueue;
    if (typeof persistQueue !== 'function') {
      this._queuePersistedOnDestroy = true;
      return;
    }

    let lastError = null;
    const attemptCount = QUEUE_SHUTDOWN_RETRY_DELAYS_MS.length + 1;
    for (let attempt = 0; attempt < attemptCount; attempt += 1) {
      let persistResult;
      try {
        persistResult = persistQueue.call(queueManager);
      } catch (error) {
        lastError = error;
      }

      if (persistResult?.success === true) {
        this._queuePersistedOnDestroy = true;
        return;
      }

      if (persistResult?.blocked === true) {
        try {
          const restoreResult = await queueManager.restoreQueue?.({
            isAllowed: (song) => !this._checkBans(song, song.requestedBy)
          });
          const persistenceStatus = queueManager.getPersistenceStatus?.();
          if (
            restoreResult?.error ||
            restoreResult?.persistenceBlocked ||
            persistenceStatus?.blocked === true ||
            queueManager._persistenceGuard?.blocked === true
          ) {
            lastError = new Error(restoreResult?.error || 'Queue restore remains blocked');
          } else {
            persistResult = persistQueue.call(queueManager);
            if (persistResult?.success === true) {
              this._queuePersistedOnDestroy = true;
              return;
            }
            lastError = new Error(persistResult?.error || 'Queue persistence did not succeed after restore');
          }
        } catch (error) {
          lastError = error;
        }
      } else if (!lastError) {
        lastError = new Error(persistResult?.error || 'Queue persistence did not succeed');
      }

      if (attempt < QUEUE_SHUTDOWN_RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, QUEUE_SHUTDOWN_RETRY_DELAYS_MS[attempt]));
      }
    }

    const error = new Error(`Queue shutdown persistence is still pending: ${lastError?.message || 'queue could not be saved'}`);
    error.code = 'MUSIC_BOT_QUEUE_SHUTDOWN_PENDING';
    error.cause = lastError || undefined;
    throw error;
  }

  async _shutdownPlaybackForDestroy(context = {}) {
    if (this._playbackShutdownComplete) return;
    this.playbackEngine?.removeAllListeners?.();
    await this.playbackEngine?.shutdown?.({
      reconcileOrphans: context.reason === 'application-shutdown'
    });
    this._playbackShutdownComplete = true;
  }

  _finalizeDestroy() {
    // Keep queued songs across app restarts and plugin reloads. Explicit user
    // actions still use queueManager.clear() through the clear route/command.
    if (!this._queuePersistedOnDestroy) {
      const persistQueue = this.queueManager?.persistQueue;
      if (typeof persistQueue === 'function') {
        let persistResult = persistQueue.call(this.queueManager);
        if (persistResult?.blocked === true) {
          const restoreResult = this.queueManager.restoreQueue?.({
            isAllowed: (song) => !this._checkBans(song, song.requestedBy)
          });
          const persistenceStatus = this.queueManager.getPersistenceStatus?.();
          if (
            restoreResult?.error ||
            restoreResult?.persistenceBlocked ||
            persistenceStatus?.blocked === true ||
            this.queueManager._persistenceGuard?.blocked === true
          ) {
            throw new Error(restoreResult?.error || 'Queue restore remains blocked');
          }
          persistResult = persistQueue.call(this.queueManager);
        }
        if (persistResult?.success !== true) {
          throw new Error(persistResult?.error || 'Queue persistence did not succeed');
        }
      }
      this._queuePersistedOnDestroy = true;
    }
    this._pendingRequests.clear();
    this._requestCredits.clear();
    this._userLikes.clear();
    this.removeAllListeners();
  }

  // ---------- Initialization helpers ----------

  _initializeMusicCatalog() {
    try {
      this.musicCatalog = new MusicCatalog(this.api);
      const result = this.musicCatalog.migrateLegacyHistory();
      this.api.log(
        `[music-bot] Catalog history migration: ${result.imported} imported, ${result.skipped} already linked`,
        'info'
      );
    } catch (error) {
      this.musicCatalog = null;
      this.api.log(`[music-bot] Catalog initialization failed: ${error.message}`, 'error');
    }
  }

  _initializePlaylistStore() {
    if (!this.musicCatalog) return;
    try {
      this.playlistStore = new PlaylistStore(this.api, this.musicCatalog);
    } catch (error) {
      this.playlistStore = null;
      this.api.log(`[music-bot] Playlist store initialization failed: ${error.message}`, 'error');
    }
  }

  _initializePlaylistImports() {
    if (!this.playlistStore || !this.musicCatalog || !this.musicResolver?.runner) return;
    try {
      this.playlistImports = new PlaylistImportService({
        store: this.playlistStore,
        catalog: this.musicCatalog,
        runner: this.musicResolver.runner,
        ytdlpPath: this._getYtDlpPath(),
        onProgress: (payload) => {
          this.api.emit('musicbot:playlist-import-progress', payload);
          if (['completed', 'failed', 'aborted'].includes(payload?.status)) {
            this.api.emit('musicbot:playlist-update', { playlistId: payload.playlistId, reason: 'import' });
          }
        }
      });
    } catch (error) {
      this.playlistImports = null;
      this.api.log(`[music-bot] Playlist import initialization failed: ${error.message}`, 'error');
    }
  }

  _scheduleCatalogMetadataEnrichment(delayMs = CATALOG_METADATA_ENRICH_INTERVAL_MS) {
    if (this._destroyed || this._catalogMetadataEnrichmentTimer || this._catalogMetadataEnrichmentRunning
      || !this.musicCatalog?.getMetadataEnrichmentCandidates || !this.musicResolver?.resolve) return;
    const delay = Math.max(0, Number(delayMs) || CATALOG_METADATA_ENRICH_INTERVAL_MS);
    this._catalogMetadataEnrichmentTimer = setTimeout(() => {
      this._catalogMetadataEnrichmentTimer = null;
      this._runCatalogMetadataEnrichment().catch((error) => {
        this.api.log(`[music-bot] Catalog metadata enrichment failed: ${error.message}`, 'debug');
      });
    }, delay);
    this._catalogMetadataEnrichmentTimer.unref?.();
  }

  async _runCatalogMetadataEnrichment() {
    if (this._destroyed || this._catalogMetadataEnrichmentRunning
      || !this.musicCatalog?.getMetadataEnrichmentCandidates || !this.musicResolver?.resolve) return null;
    this._catalogMetadataEnrichmentRunning = true;
    let hadCandidate = false;
    try {
      const candidate = this.musicCatalog.getMetadataEnrichmentCandidates({
        limit: 1,
        staleAfterMs: CATALOG_METADATA_ENRICH_STALE_AFTER_MS
      })?.[0];
      if (!candidate) return null;
      hadCandidate = true;
      this.musicCatalog.markMetadataEnrichmentAttempt?.(candidate.songId);
      const resolved = await this.musicResolver.resolve(candidate.url);
      if (!resolved?.success || !resolved.song) return null;
      const result = this.musicCatalog.resolveOrUpsert?.({
        ...candidate,
        ...resolved.song,
        url: resolved.song.url || candidate.url
      });
      this.api.log(`[music-bot] Enriched catalog metadata for "${candidate.title}"`, 'debug');
      return result || null;
    } catch (error) {
      this.api.log(`[music-bot] Catalog metadata enrichment skipped: ${error.message}`, 'debug');
      return null;
    } finally {
      this._catalogMetadataEnrichmentRunning = false;
      if (!this._destroyed) {
        this._scheduleCatalogMetadataEnrichment(
          hadCandidate ? CATALOG_METADATA_ENRICH_INTERVAL_MS : CATALOG_METADATA_ENRICH_IDLE_DELAY_MS
        );
      }
    }
  }

  _loadConfig() {
    const saved = this.api.getConfig('config');
    const merged = this._mergeDeep(DEFAULT_CONFIG, saved || {});
    this.config = merged;
    this.config.moderation = this._mergeDeep(DEFAULT_CONFIG.moderation, this.config.moderation || {});
    this.config.monetization = this._mergeDeep(DEFAULT_CONFIG.monetization, this.config.monetization || {});
    this.config.audio = this._mergeDeep(DEFAULT_CONFIG.audio, this.config.audio || {});
    this.config.playback = this._mergeDeep(DEFAULT_CONFIG.playback, this.config.playback || {});
    this.config.playback.crossfadeDuration = this._getCrossfadeDurationMs(this.config);
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
        '[music-bot] yt-dlp not found. YouTube and SoundCloud resolution is unavailable until yt-dlp is installed. ' +
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
        titleKey: 'setupYtdlpMissingTitle',
        descriptionKey: 'setupYtdlpMissingDescription',
        installInstructionKeys: [
          'setupYtdlpInstallNpm',
          'setupYtdlpInstallManual',
          'setupYtdlpConfigurePath'
        ]
      });
    }
    if (!this._mpvAvailable) {
      issues.push({
        id: 'mpv-missing',
        severity: 'error',
        titleKey: 'setupMpvMissingTitle',
        oneClickInstall: true,
        installAction: 'mpv',
        installButtonKey: this._mpvInstallStatus.state === 'installing' ? 'installing' : 'installMpv',
        installStatus: this._normalizeMpvInstallStatus(this._mpvInstallStatus),
        descriptionKey: 'setupMpvMissingDescription',
        installInstructionKeys: [
          'setupMpvInstallWindows',
          'setupMpvInstallLinux',
          'setupMpvInstallMacos',
          'setupMpvConfigurePath'
        ]
      });
    }
    return issues;
  }

  _normalizeMpvInstallStatus(status = {}) {
    const allowedStates = new Set(['idle', 'installing', 'installed', 'failed', 'unavailable']);
    const state = allowedStates.has(status.state) ? status.state : 'failed';
    const defaultMessageKeys = {
      installed: 'mpvInstalledReady',
      installing: 'mpvInstallStarted',
      failed: 'mpvInstallFailed',
      unavailable: 'mpvPackageManagerUnavailable',
      idle: 'mpvInstallIdle'
    };
    const allowedMessageKeys = new Set([
      'mpvInstallStarted', 'mpvAlreadyAvailable', 'mpvInstalledReady', 'mpvInstallFailed',
      'mpvPackageManagerUnavailable', 'mpvInstallTimedOut', 'mpvInstallWindowsPrompt',
      'mpvInstallStartFailed', 'mpvInstallChocolateyLock', 'mpvInstallAdminConfirmation',
      'mpvInstallPermissionDenied', 'mpvInstallCommandUnavailable', 'mpvInstallExited',
      'mpvInstallMissingAfterExit'
    ]);
    const messageKey = allowedMessageKeys.has(status.messageKey)
      ? status.messageKey
      : (defaultMessageKeys[state] || 'mpvInstallFailed');
    const params = {};
    if (['mpvInstallExited', 'mpvInstallMissingAfterExit'].includes(messageKey)) {
      const code = status.params?.code;
      params.code = Number.isInteger(code) ? code : 'unknown';
    }
    const allowedCommands = new Set([
      'winget install shinchiro.mpv', 'scoop install mpv', 'brew install mpv',
      'sudo apt-get install -y mpv', 'sudo dnf install -y mpv',
      'sudo pacman -S --noconfirm mpv', 'sudo zypper --non-interactive install mpv'
    ]);
    return {
      state,
      messageKey,
      params,
      command: allowedCommands.has(status.command) ? status.command : null,
      updatedAt: status.updatedAt || null
    };
  }

  _emitSetupStatus() {
    const issues = this._getSetupIssues();
    this.io.emit('music-bot:setup-status', {
      ytdlpAvailable: this._ytdlpAvailable || false,
      mpvAvailable: this._mpvAvailable || false,
      mpvInstallStatus: this._normalizeMpvInstallStatus(this._mpvInstallStatus),
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
      return { messageKey: 'mpvInstallChocolateyLock', params: {} };
    }
    if (/do you want to continue|not running from an elevated|non.?elevated/i.test(text)) {
      return { messageKey: 'mpvInstallAdminConfirmation', params: {} };
    }
    if (/access is denied|permission|administrator|elevat/i.test(text)) {
      return { messageKey: 'mpvInstallPermissionDenied', params: {} };
    }
    if (/not recognized|not found|no such file/i.test(text)) {
      return { messageKey: 'mpvInstallCommandUnavailable', params: {} };
    }
    if (text) {
      return { messageKey: 'mpvInstallExited', params: { code: Number.isInteger(code) ? code : 'unknown' } };
    }
    return { messageKey: 'mpvInstallMissingAfterExit', params: { code: code ?? 'unknown' } };
  }

  _isSameOriginMpvInstallRequest(req) {
    const originHeader = req.get?.('origin') ?? req.headers?.origin;
    if (typeof originHeader !== 'string' || !originHeader.trim() || originHeader.trim() === 'null') {
      return false;
    }

    const fetchSite = req.get?.('sec-fetch-site') ?? req.headers?.['sec-fetch-site'];
    if (fetchSite !== undefined && fetchSite !== 'same-origin') {
      return false;
    }

    try {
      const origin = new URL(originHeader.trim());
      const protocol = String(req.protocol || '').toLowerCase().replace(/:$/, '');
      const host = req.get?.('host') ?? req.headers?.host;
      if (
        !['http:', 'https:'].includes(origin.protocol)
        || origin.username
        || origin.password
        || origin.pathname !== '/'
        || origin.search
        || origin.hash
        || !['http', 'https'].includes(protocol)
        || typeof host !== 'string'
        || !host.trim()
      ) {
        return false;
      }

      const requestOrigin = new URL(`${protocol}://${host.trim()}`);
      if (requestOrigin.username || requestOrigin.password || requestOrigin.pathname !== '/') {
        return false;
      }
      if (origin.origin !== requestOrigin.origin) return false;

      const networkOriginCheck = req.app?.locals?.isNetworkOriginAllowed;
      if (typeof networkOriginCheck !== 'function') return false;
      const requestPort = Number(req.socket?.localPort)
        || Number(requestOrigin.port)
        || (protocol === 'https' ? 443 : 80);
      return networkOriginCheck(origin.origin, requestPort) === true;
    } catch (_error) {
      return false;
    }
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

  _installMpv() {
    if (this._mpvInstallPromise) return this._mpvInstallPromise;

    // Publish the shared flight before any async availability/manager lookup can yield.
    const installPromise = Promise.resolve()
      .then(() => this._ensureMpv())
      .then(() => this._startMpvInstall())
      .finally(() => {
        if (this._mpvInstallPromise === installPromise) this._mpvInstallPromise = null;
      });
    this._mpvInstallPromise = installPromise;
    return installPromise;
  }

  async _startMpvInstall() {
    if (this._mpvAvailable) {
      this._mpvInstallStatus = {
        state: 'installed',
        messageKey: 'mpvAlreadyAvailable',
        params: {},
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
          messageKey: 'mpvInstallTimedOut',
          params: {},
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
        messageKey: 'mpvPackageManagerUnavailable',
        params: {},
        command: null,
        updatedAt: new Date().toISOString()
      };
      return this._mpvInstallStatus;
    }

    this._mpvInstallStatus = {
      state: 'installing',
      messageKey: installCommand.opensWindow ? 'mpvInstallWindowsPrompt' : 'mpvInstallStarted',
      params: {},
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
    const settleInstall = async (state, result, code = null) => {
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
        messageKey: installed ? 'mpvInstalledReady' : (result?.messageKey || 'mpvInstallFailed'),
        params: installed ? {} : { ...(result?.params || {}) },
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
        { messageKey: 'mpvInstallTimedOut', params: {} },
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
      settleInstall('failed', { messageKey: 'mpvInstallStartFailed', params: {} }).catch((settleError) => {
        this.api.log(`[music-bot] Failed to settle mpv install start error: ${settleError.message}`, 'error');
      });
    });

    child.on('close', async (code) => {
      await settleInstall('failed', this._summarizeMpvInstallFailure(installOutput, code), code);
    });

    return this._mpvInstallStatus;
  }

  _cloneConfigValue(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => this._cloneConfigValue(entry));
    }
    if (value && typeof value === 'object') {
      return Object.keys(value).reduce((clone, key) => {
        clone[key] = this._cloneConfigValue(value[key]);
        return clone;
      }, {});
    }
    return value;
  }

  _mergeDeep(target, source) {
    const output = this._cloneConfigValue(target && typeof target === 'object' ? target : {});
    if (!source || typeof source !== 'object') {
      return output;
    }

    Object.keys(source).forEach((key) => {
      const sourceVal = source[key];
      if (Array.isArray(sourceVal)) {
        output[key] = this._cloneConfigValue(sourceVal);
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
    const autoDJValidation = this._validateAutoDJConfigTypes(update.autoDJ);
    if (!autoDJValidation.valid) return autoDJValidation;

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
    config.playback.crossfadeDuration = this._getCrossfadeDurationMs(config);
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
      this.playbackEngine.config = { ...config.playback };
    }
    if (this.commandParser) this.commandParser.config = config;
    this.musicResolver?.updateConfig?.({
      ...config.resolver,
      moderation: config.moderation,
      maxDurationSeconds: config.queue.maxSongDurationSeconds
    });
    this.playlistImports?.setYtDlpPath?.(this._getYtDlpPath());
    this.autoDJ?.updateConfig?.(config.autoDJ);
    this.radioSupervisor?.setLocked?.(this._isSafetyLocked(), { wake: false });
    this.radioSupervisor?.setEnabled?.(Boolean(config.autoDJ?.enabled), { wake: false });
    if (!config.autoDJ?.enabled) this._invalidateRadioPrefetch('radio-disabled');
    if (!config.autoDJ?.enabled || !config.autoDJ?.chatVotingEnabled) this._cancelNextSongVote('radio-config-changed');
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

  _getCrossfadeDurationMs(config = this.config) {
    const configured = Number(config?.playback?.crossfadeDuration);
    const fallback = DEFAULT_CONFIG.playback.crossfadeDuration;
    const duration = Number.isFinite(configured) ? Math.round(configured) : fallback;
    return Math.max(0, Math.min(15000, duration));
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

  _sanitizeDiagnosticValue(value, depth = 0, field = '') {
    if (depth > 4) return '[truncated]';
    if (Array.isArray(value)) {
      return value.slice(0, 100).map((entry) => this._sanitizeDiagnosticValue(entry, depth + 1, field));
    }
    if (!value || typeof value !== 'object') {
      return typeof value === 'string' ? this._sanitizeDiagnosticString(value, field) : value;
    }
    const output = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (/url|path|pipe|socket|header|stack/i.test(key)) {
        output[key] = '[redacted]';
        return;
      }
      output[key] = this._sanitizeDiagnosticValue(entry, depth + 1, key);
    });
    return output;
  }

  _sanitizeDiagnosticString(value, field = '') {
    const normalized = String(value || '');
    const inspectContent = !field || /(?:error|message|detail|progress|reason|stderr|output|key)/i.test(field);
    if (!inspectContent) return normalized;
    return normalized
      .replace(/https?:\/\/[^\s"'<>]+/gi, '[redacted]')
      .replace(/\\\\\.\\pipe\\[^\s"'<>]+/gi, '[redacted]')
      .replace(/[a-z]:\\[^\s"'<>]+/gi, '[redacted]')
      .replace(/(^|[^a-z0-9_])((?:x-amz-[a-z-]+|sig(?:nature)?|lsig|token|expire(?:s)?|ip|key|credential)\s*=\s*)([^&#\s,;\]\)\}"'|/>]+)/gi, '$1$2[redacted]');
  }

  _isSensitiveDiagnosticString(value, field = '') {
    return this._sanitizeDiagnosticString(value, field) !== String(value || '');
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

  _safeConfigUpdateFailure(error, fallbackCode, fallbackMessage) {
    if (error?.code === 'CONFIG_VALIDATION_FAILED') {
      const message = String(error.message || '');
      const staticMessages = new Set([
        'config payload must be an object',
        'autoDJ.selectedGenres must be an array of strings'
      ]);
      const objectSections = new Set([
        'commands', 'commandAliases', 'permissions', 'queue', 'playback', 'voteSkip',
        'audio', 'autoDJ', 'fallbackPlaylist', 'moderation', 'monetization',
        'giftIntegration', 'resolver', 'onboarding', 'preCache'
      ]);
      const booleanFields = new Set([
        'enabled', 'historyShuffled', 'announceAutoDJ', 'playlistFallbackToRandom',
        'genreFilterEnabled', 'bpmTransitionsEnabled', 'requestSeedsEnabled',
        'liveFeedbackEnabled', 'previewEnabled', 'chatVotingEnabled'
      ]);
      let safeMessage = 'Music Bot settings are invalid.';
      const sectionMatch = message.match(/^([A-Za-z]+) must be an object$/);
      const autoDjMatch = message.match(/^autoDJ\.([A-Za-z]+) must be a boolean$/);
      if (staticMessages.has(message)) safeMessage = message;
      else if (sectionMatch && objectSections.has(sectionMatch[1])) safeMessage = message;
      else if (autoDjMatch && booleanFields.has(autoDjMatch[1])) safeMessage = message;
      else if (/^Alias ".*" conflicts with another command$/.test(message)) {
        safeMessage = 'Command alias conflicts with another command.';
      } else if (/^Alias ".*" is already in use$/.test(message)) {
        safeMessage = 'Command alias is already in use.';
      }
      return { code: 'MUSIC_BOT_CONFIG_INVALID', error: safeMessage };
    }
    if (error?.code === 'PLUGIN_DESTROYED') {
      return { code: 'MUSIC_BOT_PLUGIN_STOPPING', error: 'Music Bot is stopping. Please try again.' };
    }
    return { code: fallbackCode, error: fallbackMessage };
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

  _applySerializedConfigPatch(patch, context = 'Music Bot config', { applyAudio = false } = {}) {
    return this._runSerializedConfigUpdate(async () => {
      const prepared = this._prepareLiveConfigUpdate(patch);
      if (!prepared.valid) {
        const error = new Error(prepared.error);
        error.code = 'CONFIG_VALIDATION_FAILED';
        throw error;
      }

      const previousConfig = this.config;
      const nextConfig = prepared.config;
      let persistedNext = false;
      try {
        await this._persistConfigOrThrow(nextConfig, context);
        persistedNext = true;
        this._assertConfigUpdateActive();
        this._distributeLiveConfig(nextConfig);
        const effectiveVolume = applyAudio
          ? await this._applyAudioVolume()
          : this._computeEffectiveVolume();
        this._assertConfigUpdateActive();
        return { config: this.config, effectiveVolume };
      } catch (error) {
        try {
          if (this._destroyed) {
            this.config = previousConfig;
          } else {
            this._distributeLiveConfig(previousConfig);
            if (applyAudio) await this._applyAudioVolume();
          }
        } catch (rollbackError) {
          this.api.log(`[music-bot] ${context} runtime rollback failed: ${rollbackError.message}`, 'error');
        }
        if (persistedNext) {
          try {
            await this._persistConfigOrThrow(previousConfig, `${context} rollback`);
          } catch (rollbackError) {
            this.api.log(`[music-bot] ${context} persistence rollback failed: ${rollbackError.message}`, 'error');
          }
        }
        throw error;
      }
    });
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
    this.radioSupervisor?.setLocked?.(true, { wake: false });
    this._invalidateRadioPrefetch('safety-lock');

    let persistError = null;
    const persistence = this._persistConfigOrThrow(this.config, 'Safety Lock').catch((error) => {
      persistError = error;
      this.api.log(`[music-bot] Failed to persist Safety Lock: ${error.message}`, 'error');
    });
    this._stopPlaybackSync();
    this._clearCrossfadeTimer();
    this._pendingTrackAdvance = null;
    this._pendingSkipAdvance = null;
    const backgroundCancellation = Promise.allSettled([
      Promise.resolve(this.musicResolver?.cancelAll?.()),
      Promise.resolve(this._stopPrecacheTasks?.())
    ]);
    const stopAudio = Promise.resolve(
      this.playbackEngine?.emergencyStop?.(this.config.safety.reason)
    ).then(() => {
      this.queueManager?.markPlaying?.(null);
      this._emitPlaybackStopped();
      this._emitNowPlaying(null);
      this._emitSafetyState();
    });
    const [, , stopResult] = await Promise.allSettled([
      persistence,
      backgroundCancellation,
      stopAudio
    ]);
    if (stopResult.status === 'rejected') throw stopResult.reason;
    if (persistError) throw persistError;
    return this.config.safety;
  }

  _drainOperations(operations, timeoutMs) {
    const pending = Array.isArray(operations) ? operations.filter(Boolean) : [];
    if (!pending.length) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (drained) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(drained);
      };
      const timer = setTimeout(() => finish(false), Math.max(1, Number(timeoutMs) || 1));
      Promise.allSettled(pending).then(() => finish(true));
    });
  }

  async _releaseSafetyLock() {
    await this.playbackEngine?.probe?.();
    await this._controllerSafetySyncPromise;
    let processCleanup = this.playbackEngine?.getLastProcessCleanup?.() || {};
    if (processCleanup.error && !processCleanup.remaining?.length) {
      await this.playbackEngine?.probe?.();
      await this._controllerSafetySyncPromise;
      processCleanup = this.playbackEngine?.getLastProcessCleanup?.() || {};
    }
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
    this.radioSupervisor?.setLocked?.(false, { wake: false });
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
    this.radioSupervisor?.setLocked?.(locked, { wake: false });
    if (locked) this._invalidateRadioPrefetch('controller-safety-lock');
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
    const normalizeBoolean = (input, fallback) => (typeof input === 'boolean' ? input : fallback);
    const normalizeInteger = (input, fallback, minimum, maximum) => {
      const numeric = Number(input);
      const normalized = Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
      return Math.min(maximum, Math.max(minimum, normalized));
    };
    const normalizeGenres = (input) => {
      const values = Array.isArray(input) ? input : [];
      const seen = new Set();
      return values.reduce((genres, value) => {
        const genre = String(value || '')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-]+/g, '-');
        if (genre && !seen.has(genre)) {
          seen.add(genre);
          genres.push(genre);
        }
        return genres;
      }, []);
    };
    return {
      ...config,
      enabled: normalizeBoolean(config.enabled, DEFAULT_CONFIG.autoDJ.enabled),
      historyShuffled: normalizeBoolean(config.historyShuffled, DEFAULT_CONFIG.autoDJ.historyShuffled),
      announceAutoDJ: normalizeBoolean(config.announceAutoDJ, DEFAULT_CONFIG.autoDJ.announceAutoDJ),
      playlistFallbackToRandom: normalizeBoolean(
        config.playlistFallbackToRandom,
        DEFAULT_CONFIG.autoDJ.playlistFallbackToRandom
      ),
      genreFilterEnabled: normalizeBoolean(config.genreFilterEnabled, DEFAULT_CONFIG.autoDJ.genreFilterEnabled),
      selectedGenres: normalizeGenres(config.selectedGenres),
      bpmTransitionsEnabled: normalizeBoolean(
        config.bpmTransitionsEnabled,
        DEFAULT_CONFIG.autoDJ.bpmTransitionsEnabled
      ),
      requestSeedsEnabled: normalizeBoolean(config.requestSeedsEnabled, DEFAULT_CONFIG.autoDJ.requestSeedsEnabled),
      liveFeedbackEnabled: normalizeBoolean(config.liveFeedbackEnabled, DEFAULT_CONFIG.autoDJ.liveFeedbackEnabled),
      previewEnabled: normalizeBoolean(config.previewEnabled, DEFAULT_CONFIG.autoDJ.previewEnabled),
      chatVotingEnabled: normalizeBoolean(config.chatVotingEnabled, DEFAULT_CONFIG.autoDJ.chatVotingEnabled),
      mixHistoryPercent: normalizeInteger(config.mixHistoryPercent, 80, 0, 100),
      repeatCooldownHours: normalizeInteger(config.repeatCooldownHours, 12, 1, 168),
      maxConsecutiveAutoDJ: normalizeInteger(config.maxConsecutiveAutoDJ, 10, 1, 100),
      artistSpacingMinutes: normalizeInteger(config.artistSpacingMinutes, 90, 0, 24 * 60),
      albumSpacingMinutes: normalizeInteger(config.albumSpacingMinutes, 360, 0, 7 * 24 * 60),
      noveltyBudgetPercent: normalizeInteger(config.noveltyBudgetPercent, 20, 0, 100),
      noveltyCatalogAgeDays: normalizeInteger(config.noveltyCatalogAgeDays, 10, 1, 60),
      chatVoteCloseBeforeEndSeconds: normalizeInteger(config.chatVoteCloseBeforeEndSeconds, 20, 5, 120)
    };
  }

  _validateAutoDJConfigTypes(value) {
    if (!value || typeof value !== 'object') return { valid: true };
    const booleanFields = [
      'enabled',
      'historyShuffled',
      'announceAutoDJ',
      'playlistFallbackToRandom',
      'genreFilterEnabled',
      'bpmTransitionsEnabled',
      'requestSeedsEnabled',
      'liveFeedbackEnabled',
      'previewEnabled',
      'chatVotingEnabled'
    ];
    const invalidField = booleanFields.find((field) => (
      Object.prototype.hasOwnProperty.call(value, field) && typeof value[field] !== 'boolean'
    ));
    if (invalidField) {
      return { valid: false, error: `autoDJ.${invalidField} must be a boolean` };
    }
    if (Object.prototype.hasOwnProperty.call(value, 'selectedGenres')
      && (!Array.isArray(value.selectedGenres) || value.selectedGenres.some((genre) => typeof genre !== 'string'))) {
      return { valid: false, error: 'autoDJ.selectedGenres must be an array of strings' };
    }
    return { valid: true };
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
    const lifecycleGeneration = this._lifecycleGeneration;
    const isCurrentLifecycle = () => !this._destroyed
      && this._lifecycleGeneration === lifecycleGeneration
      && !this.queueManager?._mutationsClosed;

    this.playbackEngine.on('track-start', (track) => {
      if (!isCurrentLifecycle()) return;
      if (track?.trackKey) this.mediaCache?.pin?.(track.trackKey);
      this.queueManager.markPlaying(track);
      this.queueManager.resetVoteSkips();
      this.autoDJ?.setPlaybackSeed?.(track);
      this._rememberCatalogPlaybackStart(track);
      this._emitNowPlaying(track);
      this._openNextSongVote(track);
      this._startPlaybackSync();
      this._scheduleCrossfadeTransition(track);
      this._schedulePreCache();
    });

    this.playbackEngine.on('track-end', (info) => {
      if (!isCurrentLifecycle()) return;
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
      const catalogResult = this._recordCatalogTrackEnd(info);
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
          this._advanceAfterViewerFailure('viewer-track-error', info.track, playbackError);
        }
        this._emitError(message);
        this._emitPlaybackStopped();
        this._emitRuntimeHealth();
        return;
      }
      this.queueManager.addToHistory(info.track, info.reason === 'skip');
      if ((info.reason === 'ended' || info.reason === 'crossfade')
        && this._isViewerRequestedTrack(info.track)) {
        try {
          const resolved = catalogResult || this.musicCatalog?.resolveOrUpsert?.(info.track);
          if (resolved?.song?.id) {
            this.playlistStore?.recordViewerCompletion?.(resolved.song.id, {
              requestedBy: info.track.requestedBy,
              outcome: 'completed',
              error: null
            });
          }
        } catch (error) {
          this.api.log(`[music-bot] Viewer Radio completion was not recorded: ${error.message}`, 'warn');
        }
      }
      if (info.track?.requestedBy) {
        this.queueManager.removeSkipImmunity(info.track.requestedBy);
      }
      this.queueManager.resetVoteSkips();
      if (info.reason === 'crossfade') {
        return;
      }
      this._stopPlaybackSync();
      this._emitPlaybackAdvancing(info.reason);
      const advance = Promise.resolve(this._playNextFromQueue(info.reason || 'track-end'))
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
      if (!isCurrentLifecycle()) return;
      this._emitVolume(volume);
    });

    this.playbackEngine.on('paused', () => {
      if (!isCurrentLifecycle()) return;
      this._clearCrossfadeTimer();
    });

    this.playbackEngine.on('resumed', () => {
      if (!isCurrentLifecycle()) return;
      const track = this.playbackEngine.getNowPlaying?.();
      const playbackId = this.playbackEngine.getSnapshot?.().activePlaybackId || null;
      if (!track || !playbackId) return;
      Promise.resolve(this.playbackEngine.getPosition?.())
        .then((position) => {
          if (this.playbackEngine.getNowPlaying?.() !== track) return;
          if (this.playbackEngine.getSnapshot?.().activePlaybackId !== playbackId) return;
          this._rescheduleCrossfadeTransition(track, position, { playbackId });
        })
        .catch((error) => {
          this.api.log(`[music-bot] Could not reschedule after resume: ${error.message}`, 'warn');
        });
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
      this._advanceAfterViewerFailure(
        'viewer-mpv-crash',
        current,
        new Error(`mpv crashed while playing "${current?.title || current?.id || 'viewer track'}"`)
      );
    });

    this.playbackEngine.on('heartbeat-failure-confirmed', (info = {}) => {
      if (!isCurrentLifecycle()) return;
      const track = info.track || this.playbackEngine.getNowPlaying?.();
      const error = info.error instanceof Error
        ? info.error
        : new Error(info.error?.message || 'mpv IPC heartbeat failed twice');
      const recovery = track?.requestedBy === 'AutoDJ'
        ? this._handleAutoDJPlaybackFailure(track, 'ipc-confirmed', error)
        : this._handleConfirmedIpcFailure(track, error);
      Promise.resolve(recovery).catch((recoveryError) => {
        this.api.log(`[music-bot] Supervised IPC recovery failed: ${recoveryError.message}`, 'error');
      });
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

  _rememberCatalogPlaybackStart(track) {
    if (!track || typeof track !== 'object') return null;
    const playbackId = track.playbackId
      || this.playbackEngine?.getSnapshot?.().activePlaybackId
      || null;
    const startedAt = Number(track.startedAt) || Date.now();
    const start = { playbackId, startedAt };
    this._catalogPlaybackStarts.set(track, start);
    return start;
  }

  _recordCatalogTrackEnd(info = {}) {
    const track = info.track;
    if (!track || typeof track !== 'object' || !this.musicCatalog) return null;
    if (this._catalogTerminalTracks.has(track)) return null;
    const start = this._catalogPlaybackStarts.get(track) || {};
    const startedAt = Number(start.startedAt || track.startedAt) || null;
    const finishedAt = Number(info.finishedAt) || Date.now();
    const duration = Number(info.duration ?? track.duration);
    const explicitPosition = Number(info.positionSeconds ?? info.position);
    const elapsedSeconds = startedAt ? Math.max(0, (finishedAt - startedAt) / 1000) : 0;
    const rawPlayedSeconds = Number.isFinite(explicitPosition) ? explicitPosition : elapsedSeconds;
    const playedSeconds = Number.isFinite(duration) && duration > 0
      ? Math.min(duration, Math.max(0, rawPlayedSeconds))
      : Math.max(0, rawPlayedSeconds);
    const details = {
      id: (start.playbackId || track.playbackId)
        ? `playback:${start.playbackId || track.playbackId}`
        : undefined,
      startedAt,
      finishedAt,
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      playedSeconds,
      requestedBy: track.requestedBy || 'viewer',
      source: track.source || track.provider || null,
      error: info.error || null
    };
    try {
      let result;
      if (info.reason === 'error') {
        result = this.musicCatalog.recordFailed?.(track, details);
      } else if (info.reason === 'skip') {
        result = this.musicCatalog.recordSkipped?.(track, details);
      } else if (info.reason === 'ended' || info.reason === 'crossfade') {
        result = this.musicCatalog.recordCompleted?.(track, details);
      }
      if (!result) return null;
      this._catalogTerminalTracks.add(track);
      if (result.song?.id) {
        this.api.emit('musicbot:history-update', { songId: result.song.id, refresh: true });
      }
      return result;
    } catch (error) {
      this.api.log(`[music-bot] Catalog playback event was not recorded: ${error.message}`, 'warn');
      return null;
    }
  }

  _isViewerRequestedTrack(track) {
    const requestedBy = String(track?.requestedBy || '').trim().toLowerCase();
    return Boolean(requestedBy) && !['autodj', 'fallback', 'system'].includes(requestedBy);
  }

  async _rebuildStreamerPlaylistSuggestions() {
    if (!this.musicCatalog?.listStreamerPlaylistLikedSeeds
      || !this.musicCatalog?.upsertStreamerPlaylistSuggestion
      || !this.playlistStore?.getStreamerPlaylist
      || !this.autoDJ?.getRadioPlan) return [];
    try {
      const now = Date.now();
      const normalize = (value) => String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
      const playlist = this.playlistStore.getStreamerPlaylist();
      const includedSongIds = new Set((playlist.items || []).map((item) => Number(item.songId)));
      const seeds = this.musicCatalog.listStreamerPlaylistLikedSeeds({ limit: 20, now });
      const plan = await this.autoDJ.getRadioPlan(10) || [];
      const suggestions = [];
      plan.forEach((candidate) => {
        const songId = Number(candidate?.songId);
        if (!Number.isInteger(songId) || songId <= 0 || includedSongIds.has(songId)) return;
        const candidateArtists = String(candidate.artist || '')
          .split(/[,&]/)
          .map(normalize)
          .filter(Boolean);
        const candidateGenres = Array.isArray(candidate.genres)
          ? candidate.genres.map(normalize).filter(Boolean)
          : [];
        let best = null;
        seeds.forEach((seed) => {
          const seedArtists = (seed.artists || []).map((artist) => normalize(artist?.name)).filter(Boolean);
          const seedGenres = Array.isArray(seed.genres) ? seed.genres.map(normalize).filter(Boolean) : [];
          const artistMatch = seedArtists.some((artist) => candidateArtists.includes(artist));
          const genreMatches = candidateGenres.filter((genre) => seedGenres.includes(genre)).length;
          const rawMatch = (artistMatch ? 1.4 : 0) + (genreMatches * 0.45);
          if (rawMatch <= 0) return;
          const ageMs = Math.max(0, now - Number(seed.streamerPlaylistFeedbackUpdatedAt || now));
          const ageWeight = Math.pow(0.5, ageMs / (30 * 24 * 60 * 60 * 1000));
          const weightedMatch = rawMatch * ageWeight;
          if (!best || weightedMatch > best.weightedMatch) {
            best = { songId: Number(seed.songId), weightedMatch };
          }
        });
        if (!best || !Number.isInteger(best.songId) || best.songId <= 0) return;
        const score = Number(((Number(candidate.score) || 0) + best.weightedMatch).toFixed(4));
        this.musicCatalog.upsertStreamerPlaylistSuggestion({
          songId,
          seedSongId: best.songId,
          score
        });
        suggestions.push({
          ...candidate,
          seedSongId: best.songId,
          score
        });
      });
      return suggestions.sort((left, right) => right.score - left.score || left.songId - right.songId);
    } catch (error) {
      this.api.log?.(`[music-bot] Streamer Playlist suggestions could not be rebuilt: ${error.message}`, 'warn');
      return [];
    }
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

    const playlistUnavailable = (res) => {
      res.status(503).json({ success: false, error: 'Playlist catalog is unavailable' });
    };
    const playlistError = (res, error) => {
      const knownErrors = {
        PLAYLIST_REVISION_CONFLICT: { status: 409, error: 'Playlist was modified by another edit' },
        PLAYLIST_NOT_FOUND: { status: 404, error: 'Playlist not found' },
        PLAYLIST_ITEM_NOT_FOUND: { status: 404, error: 'Playlist item not found' },
        SONG_NOT_FOUND: { status: 404, error: 'Catalog song not found' },
        PLAYLIST_NAME_CONFLICT: { status: 400, error: 'Playlist name already exists' },
        INVALID_PLAYLIST_UPDATE: { status: 400, error: 'Playlist name or mode is required' },
        INVALID_PLAYLIST_ITEMS: { status: 400, error: 'Playlist items are invalid' },
        INVALID_IMPORT: { status: 400, error: 'Playlist snapshot entries are invalid' },
        INVALID_RADIO_SOURCES: { status: 400, error: 'Playlist radio sources are invalid' },
        INVALID_RADIO_WEIGHT: { status: 400, error: 'Playlist source weight must be an integer from 1 to 10' },
        PLAYLIST_PROTECTED: { status: 400, error: 'Protected playlists cannot be renamed or deleted' },
        INVALID_PLAYLIST_NAME: { status: 400, error: 'Playlist name must be 1 to 120 characters' },
        INVALID_PLAYLIST_MODE: { status: 400, error: 'Playlist mode must be ordered or shuffle' }
      };
      const known = Object.prototype.hasOwnProperty.call(knownErrors, error?.code)
        ? knownErrors[error.code]
        : null;
      if (known) {
        res.status(known.status).json({ success: false, error: known.error, code: error.code });
        return;
      }
      const importValidationErrors = new Set([
        'Playlist import URL must be a YouTube playlist URL',
        'Playlist import URL must include a YouTube playlist ID'
      ]);
      if (importValidationErrors.has(error?.message)) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Playlist request failed' });
    };

    this.api.registerRoute('get', '/api/plugins/music-bot/catalog/search', async (req, res) => {
      if (!this.musicCatalog) return res.status(503).json({ success: false, error: 'Music catalog is unavailable' });
      const query = String(req.query?.q || '').trim();
      if (!query) return res.json({ success: true, songs: [] });
      res.json({ success: true, songs: this.musicCatalog.searchSongs(query, req.query?.limit) });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/catalog/songs/:songId/feedback', async (req, res) => {
      if (!this.musicCatalog) return res.status(503).json({ success: false, error: 'Music catalog is unavailable' });
      const songId = Number(req.params.songId);
      if (!Number.isInteger(songId) || songId <= 0) return res.status(400).json({ success: false, error: 'Invalid song ID' });
      try {
        const feedback = this.musicCatalog.setFeedback(songId, req.body?.state);
        this.api.emit('musicbot:history-update', { songId, feedback });
        res.json({ success: true, feedback });
      } catch (error) {
        if (error?.code === 'CATALOG_SONG_NOT_FOUND') {
          res.status(404).json({ success: false, error: 'Catalog song not found', code: 'CATALOG_SONG_NOT_FOUND' });
          return;
        }
        if (error?.message === 'Invalid feedback state') {
          res.status(400).json({ success: false, error: 'Invalid feedback state' });
          return;
        }
        this.api.log?.('[music-bot] Catalog feedback update failed', 'error');
        res.status(500).json({ success: false, error: 'Catalog feedback could not be updated' });
      }
    });

    this.api.registerRoute('put', '/api/plugins/music-bot/catalog/songs/:songId/genres', async (req, res) => {
      if (!this.musicCatalog) return res.status(503).json({ success: false, error: 'Music catalog is unavailable' });
      const songId = Number(req.params.songId);
      if (!Number.isInteger(songId) || songId <= 0) return res.status(400).json({ success: false, error: 'Invalid song ID' });
      try {
        const result = this.musicCatalog.setSongGenres(songId, req.body?.genres);
        this.api.emit('musicbot:history-update', { songId, refresh: true });
        res.json({ success: true, ...result });
      } catch (error) {
        if (error?.code === 'CATALOG_SONG_NOT_FOUND') {
          res.status(404).json({ success: false, error: 'Catalog song not found', code: 'CATALOG_SONG_NOT_FOUND' });
          return;
        }
        this.api.log?.('[music-bot] Catalog genre update failed', 'error');
        res.status(500).json({ success: false, error: 'Catalog genres could not be updated' });
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/playlists', async (req, res) => {
      if (!this.playlistStore) return playlistUnavailable(res);
      res.json({ success: true, playlists: this.playlistStore.list() });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/playlists', async (req, res) => {
      if (!this.playlistStore) return playlistUnavailable(res);
      try {
        const playlist = this.playlistStore.create({ name: req.body?.name, mode: req.body?.mode });
        this.api.emit('musicbot:playlist-update', { playlistId: playlist.id, reason: 'created' });
        res.json({ success: true, playlist });
      } catch (error) {
        playlistError(res, error);
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/playlists/:id', async (req, res) => {
      if (!this.playlistStore) return playlistUnavailable(res);
      try {
        res.json({ success: true, playlist: this.playlistStore.get(req.params.id) });
      } catch (error) {
        playlistError(res, error);
      }
    });

    this.api.registerRoute('patch', '/api/plugins/music-bot/playlists/:id', async (req, res) => {
      if (!this.playlistStore) return playlistUnavailable(res);
      try {
        const playlist = this.playlistStore.update(req.params.id, {
          ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'name') ? { name: req.body.name } : {}),
          ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'mode') ? { mode: req.body.mode } : {})
        }, req.body?.revision);
        this.api.emit('musicbot:playlist-update', { playlistId: playlist.id, reason: 'updated' });
        res.json({ success: true, playlist });
      } catch (error) {
        playlistError(res, error);
      }
    });

    this.api.registerRoute('delete', '/api/plugins/music-bot/playlists/:id', async (req, res) => {
      if (!this.playlistStore) return playlistUnavailable(res);
      try {
        const result = this.playlistStore.delete(req.params.id, req.body?.revision ?? req.query?.revision);
        this.api.emit('musicbot:playlist-update', { playlistId: req.params.id, reason: 'deleted' });
        res.json({ success: true, ...result });
      } catch (error) {
        playlistError(res, error);
      }
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/playlists/:id/items', async (req, res) => {
      if (!this.playlistStore) return playlistUnavailable(res);
      try {
        const result = this.playlistStore.addItem(req.params.id, req.body?.songId, req.body?.revision);
        this.api.emit('musicbot:playlist-update', { playlistId: req.params.id, reason: 'item-added' });
        res.json({ success: true, ...result });
      } catch (error) {
        playlistError(res, error);
      }
    });

    this.api.registerRoute('delete', '/api/plugins/music-bot/playlists/:id/items/:songId', async (req, res) => {
      if (!this.playlistStore) return playlistUnavailable(res);
      try {
        const result = this.playlistStore.removeItem(req.params.id, Number(req.params.songId), req.body?.revision ?? req.query?.revision);
        this.api.emit('musicbot:playlist-update', { playlistId: req.params.id, reason: 'item-removed' });
        res.json({ success: true, ...result });
      } catch (error) {
        playlistError(res, error);
      }
    });

    this.api.registerRoute('put', '/api/plugins/music-bot/playlists/:id/items', async (req, res) => {
      if (!this.playlistStore) return playlistUnavailable(res);
      try {
        const playlist = this.playlistStore.reorder(req.params.id, req.body?.songIds, req.body?.revision);
        this.api.emit('musicbot:playlist-update', { playlistId: req.params.id, reason: 'reordered' });
        res.json({ success: true, playlist });
      } catch (error) {
        playlistError(res, error);
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/playlist-imports/:jobId', async (req, res) => {
      if (!this.playlistImports) return playlistUnavailable(res);
      const job = this.playlistImports.get(req.params.jobId);
      if (!job) return res.status(404).json({ success: false, error: 'Playlist import job not found' });
      res.json({ success: true, job });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/playlist-imports', async (req, res) => {
      if (!this.playlistImports) return playlistUnavailable(res);
      try {
        const job = this.playlistImports.start({ playlistId: req.body?.playlistId, url: req.body?.url });
        res.status(202).json({ success: true, job });
      } catch (error) {
        playlistError(res, error);
      }
    });

    this.api.registerRoute('delete', '/api/plugins/music-bot/playlist-imports/:jobId', async (req, res) => {
      if (!this.playlistImports) return playlistUnavailable(res);
      const job = this.playlistImports.abort(req.params.jobId);
      if (!job) return res.status(404).json({ success: false, error: 'Playlist import job not found' });
      res.json({ success: true, job });
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/radio/playlist-sources', async (req, res) => {
      if (!this.playlistStore) return playlistUnavailable(res);
      res.json({ success: true, sources: this.playlistStore.getRadioSources() });
    });

    this.api.registerRoute('put', '/api/plugins/music-bot/radio/playlist-sources', async (req, res) => {
      if (!this.playlistStore) return playlistUnavailable(res);
      try {
        const sources = this.playlistStore.setRadioSources(req.body?.sources);
        this.api.emit('musicbot:playlist-update', { reason: 'radio-sources' });
        res.json({ success: true, sources });
      } catch (error) {
        playlistError(res, error);
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/radio/preview', async (req, res) => {
      if (!this.config.autoDJ?.previewEnabled) {
        res.json({ success: true, candidates: [], disabled: true });
        return;
      }
      res.json({ success: true, candidates: this.autoDJ?.getRadioPreview?.(3) || [] });
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/radio/plan', async (req, res) => {
      if (!this.config.autoDJ?.previewEnabled) {
        res.json({ success: true, plan: [], disabled: true });
        return;
      }
      const plan = this.autoDJ?.getRadioPlan ? await this.autoDJ.getRadioPlan(5) : [];
      res.json({ success: true, plan });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/artist-radio/start', async (req, res) => {
      if (!this.autoDJ?.startArtistRadio || !this.playbackEngine?.getNowPlaying) {
        res.status(503).json({ success: false, error: 'Auto-DJ is unavailable' });
        return;
      }
      const track = this.playbackEngine.getNowPlaying();
      if (!track) {
        res.status(409).json({ success: false, error: 'No current track is available as a song-radio seed' });
        return;
      }
      try {
        const started = this.autoDJ.startArtistRadio(track);
        if (!started) {
          res.status(400).json({
            success: false,
            error: 'Current track cannot start a song radio',
            status: this.autoDJ.getStatus?.()
          });
          return;
        }
        this._invalidateRadioPrefetch('artist-radio-start');
        this._cancelNextSongVote('artist-radio-start');
        const status = this.autoDJ.getStatus?.();
        this.api.emit('musicbot:artist-radio', { action: 'started', status });
        res.json({ success: true, status });
      } catch (error) {
        this.api.log?.(`[music-bot] Could not start song radio: ${error.message}`, 'warn');
        res.status(500).json({ success: false, error: 'Song radio could not be started' });
      }
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/artist-radio/stop', async (req, res) => {
      if (!this.autoDJ?.stopArtistRadio) {
        res.status(503).json({ success: false, error: 'Auto-DJ is unavailable' });
        return;
      }
      const stopped = this.autoDJ.stopArtistRadio();
      this._invalidateRadioPrefetch('artist-radio-stop');
      this._cancelNextSongVote('artist-radio-stop');
      const status = this.autoDJ.getStatus?.();
      this.api.emit('musicbot:artist-radio', { action: 'stopped', stopped, status });
      res.json({ success: true, stopped, status });
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/streamer-playlist', async (req, res) => {
      if (!this.musicCatalog?.listStreamerPlaylistSuggestions || !this.playlistStore?.getStreamerPlaylist) {
        res.status(503).json({ success: false, error: 'Streamer Playlist is unavailable' });
        return;
      }
      const playlist = this.playlistStore.getStreamerPlaylist();
      const suggestions = this.musicCatalog.listStreamerPlaylistSuggestions({ status: 'pending', limit: 20 });
      res.json({ success: true, playlist, suggestions });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/streamer-playlist/feedback', async (req, res) => {
      if (!this.musicCatalog?.resolveOrUpsert || !this.musicCatalog?.setStreamerPlaylistFeedback
        || !this.playlistStore?.getStreamerPlaylist) {
        res.status(503).json({ success: false, error: 'Streamer Playlist is unavailable' });
        return;
      }
      const direction = String(req.body?.direction || '').toLowerCase();
      if (!['up', 'down'].includes(direction)) {
        res.status(400).json({ success: false, error: 'direction must be up or down' });
        return;
      }
      const track = this.playbackEngine?.getNowPlaying?.();
      if (!track) {
        res.status(404).json({ success: false, error: 'No current track is available for Streamer Playlist feedback' });
        return;
      }
      try {
        const resolved = this.musicCatalog.resolveOrUpsert(track);
        const songId = Number(resolved?.song?.id);
        if (!Number.isInteger(songId) || songId <= 0) {
          res.status(404).json({ success: false, error: 'Current track could not be catalogued' });
          return;
        }
        const feedback = this.musicCatalog.setStreamerPlaylistFeedback(songId, direction);
        let playlist = this.playlistStore.getStreamerPlaylist();
        const existing = (playlist.items || []).some((item) => Number(item.songId) === songId);
        if (feedback.state === 'up') {
          const added = this.playlistStore.addItem(playlist.id, songId, playlist.revision);
          playlist = added.playlist;
          this.musicCatalog.upsertStreamerPlaylistSuggestion?.({
            songId,
            seedSongId: songId,
            score: 1,
            status: 'accepted'
          });
        } else if (existing) {
          const removed = this.playlistStore.removeItem(playlist.id, songId, playlist.revision);
          playlist = removed.playlist;
        }
        if (feedback.state === 'down') {
          this.musicCatalog.upsertStreamerPlaylistSuggestion?.({
            songId,
            seedSongId: null,
            score: 0,
            status: 'rejected'
          });
        }
        this.autoDJ?.invalidateRadioPlan?.('streamer-playlist-feedback');
        const suggestions = await this._rebuildStreamerPlaylistSuggestions(songId);
        this._invalidateRadioPrefetch('streamer-playlist-feedback');
        this.api.emit('musicbot:streamer-playlist', { feedback, playlist, suggestions });
        this.api.emit('musicbot:playlist-update', { playlistId: playlist.id, reason: 'streamer-feedback' });
        res.json({ success: true, feedback, playlist, suggestions });
      } catch (error) {
        if (error?.code === 'CATALOG_SONG_NOT_FOUND') {
          res.status(404).json({ success: false, error: 'Catalog song not found', code: 'CATALOG_SONG_NOT_FOUND' });
          return;
        }
        if (error?.message === 'Invalid feedback state') {
          res.status(400).json({ success: false, error: 'Invalid feedback state' });
          return;
        }
        this.api.log?.('[music-bot] Streamer Playlist feedback update failed', 'error');
        res.status(500).json({ success: false, error: 'Streamer Playlist feedback could not be updated' });
      }
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/streamer-playlist/suggestions/:songId', async (req, res) => {
      if (!this.musicCatalog?.updateStreamerPlaylistSuggestionStatus || !this.playlistStore?.getStreamerPlaylist) {
        res.status(503).json({ success: false, error: 'Streamer Playlist is unavailable' });
        return;
      }
      const songId = Number(req.params.songId);
      const action = String(req.body?.action || '').toLowerCase();
      if (!Number.isInteger(songId) || songId <= 0 || !['accept', 'reject'].includes(action)) {
        res.status(400).json({ success: false, error: 'songId and action (accept or reject) are required' });
        return;
      }
      let playlist = null;
      let playlistChanged = false;
      let suggestionUpdated = false;
      let mutationCommitted = false;
      let mutationStep = 'playlist';
      let hasSharedTransaction = false;
      try {
        const database = this.api.getDatabase?.();
        const transactionOwner = typeof database?.transaction === 'function' ? database : database?.db;
        const transaction = transactionOwner?.transaction;
        hasSharedTransaction = typeof transaction === 'function';
        const persistDecision = () => {
          playlist = this.playlistStore.getStreamerPlaylist();
          const existing = (playlist.items || []).some((item) => Number(item.songId) === songId);
          if (action === 'accept' && !existing) {
            const added = this.playlistStore.addItem(playlist.id, songId, playlist.revision);
            playlist = added.playlist;
            playlistChanged = added.added !== false;
          } else if (action === 'reject' && existing) {
            const removed = this.playlistStore.removeItem(playlist.id, songId, playlist.revision);
            playlist = removed.playlist;
            playlistChanged = removed.removed !== false;
          }
          mutationStep = 'suggestion-status';
          const suggestion = this.musicCatalog.updateStreamerPlaylistSuggestionStatus(
            songId,
            action === 'accept' ? 'accepted' : 'rejected'
          );
          suggestionUpdated = true;
          return suggestion;
        };
        const suggestion = hasSharedTransaction
          ? transactionOwner.transaction(persistDecision)()
          : persistDecision();
        mutationCommitted = true;
        mutationStep = 'post-commit-effect';
        this.autoDJ?.invalidateRadioPlan?.('streamer-playlist-suggestion');
        const suggestions = this.musicCatalog.listStreamerPlaylistSuggestions?.({ status: 'pending', limit: 20 }) || [];
        this._invalidateRadioPrefetch('streamer-playlist-suggestion');
        const streamEventSent = this.api.emit('musicbot:streamer-playlist', { action, suggestion, playlist, suggestions });
        const playlistEventSent = this.api.emit('musicbot:playlist-update', { playlistId: playlist.id, reason: 'streamer-suggestion' });
        if (streamEventSent === false || playlistEventSent === false) {
          res.status(200).json({
            success: false,
            partial: true,
            playlistChanged,
            suggestionUpdated,
            code: 'STREAMER_PLAYLIST_SYNC_FAILED',
            error: 'Changes were saved, but live updates failed. Refresh the playlist.'
          });
          return;
        }
        res.json({ success: true, action, suggestion, playlist, suggestions });
      } catch (error) {
        if (mutationCommitted || (!hasSharedTransaction && playlistChanged)) {
          try {
            this.api.emit('musicbot:streamer-playlist', { action, partial: true, playlist });
          } catch (_emitError) {
            // The HTTP response below still tells the caller to refresh its persisted view.
          }
          try {
            this.api.emit('musicbot:playlist-update', { playlistId: playlist?.id || 'streamer-playlist', reason: 'streamer-suggestion-partial' });
          } catch (_emitError) {
            // The HTTP response below still tells the caller to refresh its persisted view.
          }
          res.status(200).json({
            success: false,
            partial: true,
            playlistChanged,
            suggestionUpdated,
            code: mutationStep === 'suggestion-status' ? 'SUGGESTION_STATUS_UPDATE_FAILED' : 'STREAMER_PLAYLIST_SYNC_FAILED',
            error: 'The playlist changed, but the suggestion update did not finish. Refresh the playlist.'
          });
          return;
        }
        const status = error?.code === 'STREAMER_PLAYLIST_SUGGESTION_NOT_FOUND' ? 404 : 400;
        res.status(status).json({ success: false, error: error.message, code: error?.code });
      }
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/radio/live-feedback', async (req, res) => {
      if (!this.config.autoDJ?.liveFeedbackEnabled) {
        res.status(403).json({ success: false, error: 'Live feedback is disabled' });
        return;
      }
      const direction = String(req.body?.direction || '').toLowerCase();
      if (!['more', 'less'].includes(direction)) {
        res.status(400).json({ success: false, error: 'direction must be more or less' });
        return;
      }
      const track = this.playbackEngine?.getNowPlaying?.();
      const songId = Number(track?.catalogSongId ?? track?.songId);
      if (!Number.isInteger(songId) || songId <= 0) {
        res.status(404).json({ success: false, error: 'Current track is not in the music catalog' });
        return;
      }
      try {
        const feedback = this.musicCatalog?.recordLivePreference?.(songId, direction);
        if (!feedback) {
          res.status(503).json({ success: false, error: 'Music catalog is unavailable' });
          return;
        }
        this.api.emit('musicbot:radio-feedback', feedback);
        this.api.emit('musicbot:history-update', { songId, refresh: true });
        this.autoDJ?.invalidateRadioPlan?.('live-feedback');
        res.json({ success: true, feedback });
      } catch (error) {
        const status = error?.code === 'CATALOG_SONG_NOT_FOUND' ? 404 : 400;
        res.status(status).json({ success: false, error: error.message, code: error?.code });
      }
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
        const remains = error.code === 'SOUNDBOT_MPV_REMAINS';
        const statusCode = remains ? 409 : 500;
        const failure = remains
          ? { code: 'MUSIC_BOT_MPV_PROCESS_STILL_RUNNING', error: 'Safety Lock cannot be released while MPV is still running.' }
          : { code: 'MUSIC_BOT_SAFETY_LOCK_FAILED', error: 'Safety Lock could not be updated.' };
        res.status(statusCode).json({ success: false, locked: this._isSafetyLocked(), ...failure });
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
        res.status(500).json({ success: false, code: 'MUSIC_BOT_PLAYER_RESET_FAILED', error: 'Player could not be reset.' });
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
        res.status(500).json({ success: false, code: 'MUSIC_BOT_TEST_TONE_FAILED', error: 'Test tone could not be played.' });
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/setup-status', (req, res) => {
      res.json({
        success: true,
        ytdlpAvailable: this._ytdlpAvailable || false,
        mpvAvailable: this._mpvAvailable || false,
        mpvInstallStatus: this._normalizeMpvInstallStatus(this._mpvInstallStatus),
        issues: this._getSetupIssues()
      });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/install/mpv', async (req, res) => {
      if (!this._isSameOriginMpvInstallRequest(req)) {
        return res.status(403).json({ success: false, error: 'Same-origin request required' });
      }

      try {
        const status = await this._installMpv();
        res.json({
          success: status.state !== 'failed' && status.state !== 'unavailable',
          pending: status.state === 'installing',
          installed: status.state === 'installed',
          mpvAvailable: this._mpvAvailable || false,
          installStatus: this._normalizeMpvInstallStatus(status),
          issues: this._getSetupIssues()
        });
      } catch (error) {
        this._mpvInstallStatus = {
          state: 'failed',
          messageKey: 'mpvInstallStartFailed',
          params: {},
          command: null,
          updatedAt: new Date().toISOString()
        };
        this.api.log(`[music-bot] mpv one-click install failed: ${error.message}`, 'error');
        res.status(500).json({
          success: false,
          code: 'MUSIC_BOT_MPV_INSTALL_START_FAILED',
          installStatus: this._normalizeMpvInstallStatus(this._mpvInstallStatus),
          issues: this._getSetupIssues()
        });
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/resolve', this._dashboardRequestLimiters.resolve, async (req, res) => {
      const validation = this._validateDashboardQuery(req.query?.q || req.query?.query);
      if (validation.error) {
        res.status(400).json(validation.error);
        return;
      }
      const { query } = validation;
      const requestAbort = this._createRequestAbort(req, res);
      try {
        const resolved = await this.musicResolver.resolve(query, { signal: requestAbort.signal });
        if (requestAbort.signal.aborted) return;
        if (!resolved?.success) {
          res.status(dashboardResolverHttpStatus({ result: resolved })).json(resolved);
          return;
        }

        const banRejection = this._getBanRejection(resolved.song, 'dashboard');
        if (banRejection) {
          res.status(400).json({
            success: false,
            error: this._formatBanRejectionForChat(banRejection),
            ...banRejection
          });
          return;
        }

        res.json({ success: true, song: resolved.song });
      } catch (error) {
        if (requestAbort.signal.aborted || error?.name === 'AbortError') return;
        const code = 'MUSIC_BOT_RESOLVE_FAILED';
        const message = 'Music search failed. Please try again.';
        this.api.log(`[music-bot] Resolve failed (${code})`, 'error');
        res.status(dashboardResolverHttpStatus({ error })).json({ success: false, error: message, code });
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

    this.api.registerRoute('post', '/api/plugins/music-bot/request', this._dashboardRequestLimiters.request, async (req, res) => {
      const validation = this._validateDashboardQuery(req.body?.query);
      if (validation.error) {
        res.status(400).json(validation.error);
        return;
      }
      const { query } = validation;
      const requestAbort = this._createRequestAbort(req, res);
      try {
        const result = await this._handleDashboardRequest(
          query,
          'dashboard',
          null,
          { signal: requestAbort.signal }
        );
        if (requestAbort.signal.aborted || result?.aborted) return;
        const statusCode = result.success ? 200 : (result.httpStatus || 400);
        const { httpStatus: _httpStatus, ...payload } = result;
        res.status(statusCode).json(payload);
      } finally {
        requestAbort.cleanup();
      }
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

    this.api.registerRoute('post', '/api/plugins/music-bot/seek', async (req, res) => {
      const playbackId = typeof req.body?.playbackId === 'string'
        ? req.body.playbackId.trim()
        : '';
      const positionSeconds = req.body?.positionSeconds;
      if (
        !playbackId
        || typeof positionSeconds !== 'number'
        || !Number.isFinite(positionSeconds)
        || positionSeconds < 0
      ) {
        res.status(400).json({ success: false, error: 'playbackId and a non-negative positionSeconds are required' });
        return;
      }
      try {
        const result = await this.playbackEngine.seek(positionSeconds, { playbackId });
        const track = result.track || this.playbackEngine.getNowPlaying?.();
        this._emitPlaybackSync({ ...result, track, playbackId });
        this._rescheduleCrossfadeTransition(track, result.position, {
          paused: result.state === 'paused',
          playbackId
        });
        res.json({ success: true, ...result, playbackId });
      } catch (error) {
        const code = error?.code;
        const knownFailures = {
          PLAYBACK_SAFETY_LOCKED: { status: 423, error: 'Playback safety lock is engaged' },
          PLAYBACK_STALE_ID: { status: 409, error: 'Playback changed while seeking' },
          PLAYBACK_SEEK_STATE: { status: 409, error: 'Playback state does not allow seeking' },
          PLAYBACK_SEEK_UNCONFIRMED: { status: 409, error: 'Seek could not be confirmed' },
          PLAYBACK_UNSEEKABLE: { status: 422, error: 'The active track is not seekable' },
          PLAYBACK_UNKNOWN_DURATION: { status: 422, error: 'The active track has no known duration' },
          MPV_IPC_DISCONNECTED: { status: 503, error: 'Playback service is temporarily unavailable' },
          EPIPE: { status: 503, error: 'Playback service is temporarily unavailable' },
          ECONNRESET: { status: 503, error: 'Playback service is temporarily unavailable' },
          ECONNABORTED: { status: 503, error: 'Playback service is temporarily unavailable' },
          ENOTCONN: { status: 503, error: 'Playback service is temporarily unavailable' }
        };
        const failure = Object.prototype.hasOwnProperty.call(knownFailures, code)
          ? knownFailures[code]
          : null;
        if (failure) {
          res.status(failure.status).json({ success: false, error: failure.error, code });
          return;
        }
        this.api.log?.('[music-bot] Playback seek failed', 'error');
        res.status(500).json({ success: false, error: 'Seek failed' });
      }
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
      const audio = {};
      if (hasLegacy) audio.sourceVolume = Math.max(0, Math.min(100, Number(volume) || 0));
      if (hasMaster) audio.masterVolume = Math.max(0, Math.min(100, Number(masterVolume) || 0));
      if (hasSource) audio.sourceVolume = Math.max(0, Math.min(100, Number(sourceVolume) || 0));
      try {
        const result = await this._applySerializedConfigPatch(
          { audio },
          'volume update',
          { applyAudio: true }
        );
        res.json({
          success: true,
          volume: result.effectiveVolume,
          masterVolume: result.config.audio.masterVolume,
          sourceVolume: result.config.audio.sourceVolume
        });
      } catch (error) {
        res.status(500).json({ success: false, ...this._safeConfigUpdateFailure(error, 'MUSIC_BOT_VOLUME_SAVE_FAILED', 'Volume could not be saved.') });
      }
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
      const result = await this._clearQueueAndStop();
      const status = result.success
        ? 200
        : (result.queueCleared || result.code === 'QUEUE_PERSISTENCE_BLOCKED' ? 503 : 500);
      res.status(status).json(result);
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/config', (req, res) => {
      if (!isLoopbackAddress(getRequestAddress(req)) || hasForwardingHeaders(req)) {
        return res.status(403).json({
          success: false,
          code: 'MUSIC_BOT_CONFIG_LOCAL_ONLY',
          error: 'Music Bot configuration is only available from a local connection'
        });
      }

      res.json({ success: true, config: this.config });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/onboarding/complete', async (req, res) => {
      try {
        const result = await this._applySerializedConfigPatch({
          onboarding: {
            completed: true,
            completedAt: this.config.onboarding?.completedAt || Date.now()
          }
        }, 'onboarding completion');
        this.io?.emit?.('music-bot:onboarding-updated', result.config.onboarding);
        res.json({ success: true, onboarding: result.config.onboarding });
      } catch (error) {
        res.status(500).json({ success: false, ...this._safeConfigUpdateFailure(error, 'MUSIC_BOT_ONBOARDING_SAVE_FAILED', 'Onboarding could not be saved.') });
      }
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
              this.mediaCache.schedulePrune({ protectedKeys: [...this._pinnedCacheKeys] });
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
            const failure = this._safeConfigUpdateFailure(
              responseError,
              'MUSIC_BOT_CONFIG_SAVE_FAILED',
              'Music Bot settings could not be persisted.'
            );
            res.status(statusCode).json({ success: false, ...failure });
          }
        });
      } catch (error) {
        this.api.log(`[music-bot] Live config update rejected: ${error.message}`, 'error');
        const statusCode = error.code === 'PLUGIN_DESTROYED' ? 503 : 500;
        const failure = this._safeConfigUpdateFailure(
          error,
          'MUSIC_BOT_CONFIG_SAVE_FAILED',
          'Music Bot settings could not be persisted.'
        );
        res.status(statusCode).json({ success: false, ...failure });
      }
    });

    this.api.registerRoute('get', '/api/plugins/music-bot/history', async (req, res) => {
      const historyQuery = normalizeHistoryQuery(req.query || {});
      try {
        if (this.musicCatalog) {
          const page = this.musicCatalog.getHistory(historyQuery);
          const history = page.items.map((item) => ({
            ...item,
            banned: Boolean(this._checkBans(item, 'dashboard'))
          }));
          return res.json({
            success: true,
            history,
            total: page.total,
            limit: page.limit,
            offset: page.offset,
            filters: page.filters || historyQuery
          });
        }
        const rows = this.db
          .prepare('SELECT * FROM plugin_music_bot_history ORDER BY finishedAt DESC LIMIT ? OFFSET ?')
          .all(historyQuery.limit, historyQuery.offset);
        const total = this.db
          .prepare('SELECT COUNT(*) as count FROM plugin_music_bot_history')
          .get().count;
        res.json({
          success: true,
          history: rows,
          total,
          limit: historyQuery.limit,
          offset: historyQuery.offset,
          filters: historyQuery
        });
      } catch (error) {
        this.api.log(`[music-bot] Failed to load history: ${error.message}`, 'error');
        res.json({ success: true, history: this.queueManager.getHistory(), filters: historyQuery });
      }
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/history/:eventId/replay', async (req, res) => {
      const mode = req.body?.mode === 'play' || req.body?.mode === 'queue' ? req.body.mode : null;
      if (!mode) {
        res.status(400).json({ success: false, error: 'Invalid replay mode' });
        return;
      }
      if (mode === 'play' && this._isSafetyLocked()) {
        res.status(423).json(this._lockedResult());
        return;
      }
      const event = this.musicCatalog?.getHistoryEvent?.(req.params?.eventId);
      if (!event) {
        res.status(404).json({ success: false, error: 'History event not found' });
        return;
      }
      const url = String(event.url || '').trim();
      if (!url) {
        res.status(422).json({ success: false, error: 'History event has no replayable source' });
        return;
      }
      const result = await this._handleDashboardRequest(url, 'dashboard');
      if (!result?.success) {
        const statusCode = result?.httpStatus === 503 || result?.httpStatus === 504
          ? result.httpStatus
          : 400;
        const error = statusCode === 400
          ? 'Replay request could not be completed.'
          : 'Replay service is temporarily unavailable. Please try again.';
        res.status(statusCode).json({ success: false, error });
        return;
      }
      if (mode === 'queue') {
        res.json({ ...result, success: true, mode });
        return;
      }

      const queuedSongId = result.song?.id;
      const queue = this.queueManager.getQueue();
      const queueIndex = queuedSongId
        ? queue.findIndex((song) => song.id === queuedSongId)
        : -1;
      if (queueIndex < 0) {
        res.status(409).json({ success: false, error: 'Replay song is no longer in the queue' });
        return;
      }
      const moved = this.queueManager.reorderSong(queueIndex, 0);
      if (!moved.success) {
        res.status(400).json(moved);
        return;
      }
      const current = this.playbackEngine.getNowPlaying();
      const transition = current
        ? await this._skipCurrent('history-replay')
        : await this._playNextFromQueue();
      this._emitQueue();
      res.status(transition.success === false ? 400 : 200).json({
        ...result,
        ...transition,
        success: transition.success !== false,
        mode,
        position: 0,
        track: transition.next || transition.song || result.song
      });
    });

    this.api.registerRoute('delete', '/api/plugins/music-bot/queue/:index', async (req, res) => {
      const index = Number(req.params.index);
      if (!Number.isInteger(index) || index < 0) {
        res.status(400).json({ success: false, error: 'Invalid index' });
        return;
      }
      const expectedSongId = typeof req.body?.songId === 'string' ? req.body.songId.trim() : '';
      if (!expectedSongId) {
        res.status(400).json({ success: false, error: 'songId is required' });
        return;
      }
      const result = this.queueManager.removeSong(index, expectedSongId);
      if (result.success) {
        this._emitQueue();
      }
      res.status(result.success ? 200 : (result.errorCode === 'QUEUE_ITEM_CHANGED' ? 409 : 400)).json(result);
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
        catalogEventId,
        scope = 'track',
        keyword,
        stopCurrent = true,
        removeQueued = true
      } = req.body || {};
      const track = catalogEventId
        ? this.musicCatalog?.getHistoryEvent(catalogEventId)
        : this._findTrackForBan(trackId);
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
        let queueRemovalFailedCount = 0;
        let queueRemovalFailureCode = null;
        if (removeQueued) {
          const queue = this.queueManager.getQueue();
          for (let index = queue.length - 1; index >= 0; index -= 1) {
            if (!this._trackMatchesBanSelection(queue[index], selection)) continue;
            const removal = this.queueManager.removeSong(index);
            if (removal?.success) {
              removedQueued += 1;
            } else {
              queueRemovalFailedCount += 1;
              queueRemovalFailureCode ||= removal?.errorCode || 'QUEUE_MUTATION_FAILED';
            }
          }
        }

        const current = this.playbackEngine.getNowPlaying?.();
        const stopRequested = Boolean(
          stopCurrent && current && this._trackMatchesBanSelection(current, selection)
        );
        let playbackStopFailed = false;
        let playbackStopFailureCode = null;
        let playbackAdvanceFailed = false;
        let playbackAdvanceFailureCode = null;
        if (stopRequested) {
          try {
            await this.playbackEngine.stop();
            this.playbackEngine.clearNowPlaying?.();
            this.queueManager.markPlaying?.(null);
            this._emitPlaybackStopped();
            this._emitNowPlaying(null);
          } catch (error) {
            playbackStopFailed = true;
            playbackStopFailureCode = error?.code || 'PLAYBACK_STOP_FAILED';
            this.api.log(`[music-bot] Ban committed but playback stop failed (${playbackStopFailureCode})`, 'warn');
          }
        }
        this._emitQueue();
        if (track.songId) this.api.emit('musicbot:history-update', { songId: track.songId, refresh: true });
        if (stopRequested && !playbackStopFailed && !this._isSafetyLocked()) {
          try {
            const advance = await this._playNextFromQueue();
            if (!advance?.success) {
              playbackAdvanceFailed = true;
              playbackAdvanceFailureCode = advance?.code || advance?.errorCode || 'PLAYBACK_ADVANCE_FAILED';
              this.api.log(`[music-bot] Ban committed but queue auto-advance failed (${playbackAdvanceFailureCode})`, 'warn');
            }
          } catch (error) {
            playbackAdvanceFailed = true;
            playbackAdvanceFailureCode = error?.code || 'PLAYBACK_ADVANCE_FAILED';
            this.api.log(`[music-bot] Ban committed but queue auto-advance failed (${playbackAdvanceFailureCode})`, 'warn');
          }
        }
        res.json({
          success: true,
          ban,
          stoppedCurrent: stopRequested && !playbackStopFailed,
          playbackStopAttempted: stopRequested,
          playbackStopped: stopRequested && !playbackStopFailed ? true : null,
          playbackStopFailed,
          playbackStopFailureCode,
          playbackAdvanceFailed,
          playbackAdvanceFailureCode,
          removedQueued,
          queueRemovalRequested: Boolean(removeQueued),
          queueRemovalComplete: !removeQueued || queueRemovalFailedCount === 0,
          queueRemovalFailedCount,
          queueRemovalFailureCode
        });
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
      const validation = this._validateAutoDJConfigTypes(payload);
      if (!validation.valid) {
        res.status(400).json({ success: false, error: validation.error });
        return;
      }
      let config;
      try {
        const result = await this._applySerializedConfigPatch({ autoDJ: payload }, 'Auto-DJ update');
        config = result.config;
      } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Auto-DJ update failed' });
        return;
      }
      if (config.autoDJ.enabled) this.autoDJ?.activate();
      let track = null;
      if (
        config.autoDJ.enabled &&
        !this._isSafetyLocked() &&
        !this.playbackEngine?.isPlaying?.() &&
        this.queueManager?.getQueue?.().length === 0
      ) {
        if (this.radioSupervisor?.wake) {
          const advance = await this.radioSupervisor.wake('enabled');
          track = advance?.song || null;
        } else {
          track = await this._maybePlayAutoDJ();
        }
      }
      res.json({ success: true, status: this.autoDJ?.getStatus(), track });
    });

    this.api.registerRoute('post', '/api/plugins/music-bot/auto-dj/skip', async (req, res) => {
      if (this._isSafetyLocked()) {
        res.status(423).json(this._lockedResult());
        return;
      }
      let next = null;
      if (this.radioSupervisor?.wake) {
        const advance = await this.radioSupervisor.wake('manual-auto-dj-skip', {
          forceAutoDJ: true,
          allowActiveAutoDJ: true
        });
        next = advance?.song || null;
      } else {
        next = await this._maybePlayAutoDJ(true);
      }
      res.json({ success: Boolean(next), track: next || null, status: this.autoDJ?.getStatus() });
    });
  }

  _registerSocketEvents() {
    this.api.registerSocket('musicbot:request-status', async (socket) => {
      const effectiveVolume = this._computeEffectiveVolume();
      socket.emit('musicbot:now-playing', this._buildNowPlayingPayload());
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
      socket.emit('musicbot:next-song-vote', this._nextSongVote?.getStatus?.());
    });

    this.api.registerSocket('musicbot:dashboard-skip', async (socket) => {
      if (!this._requireDashboardSocketAdmin(socket, 'musicbot:dashboard-skip')) return;
      try {
        if (this._isSafetyLocked()) {
          socket?.emit?.('musicbot:error', { message: this._lockedResult().error, locked: true });
          return;
        }
        await this._skipCurrent('dashboard-socket');
      } catch (_error) {
        this._emitDashboardSocketFailure(socket, 'musicbot:dashboard-skip');
      }
    });

    this.api.registerSocket('musicbot:dashboard-volume', async (socket, payload) => {
      if (!this._requireDashboardSocketAdmin(socket, 'musicbot:dashboard-volume')) return;
      try {
        const source = Number(payload?.sourceVolume ?? payload?.volume);
        const master = Number(payload?.masterVolume);
        if (
          (Number.isFinite(source) && source >= 0 && source <= 100) ||
          (Number.isFinite(master) && master >= 0 && master <= 100)
        ) {
          const audio = {};
          if (Number.isFinite(source)) audio.sourceVolume = source;
          if (Number.isFinite(master)) audio.masterVolume = master;
          await this._applySerializedConfigPatch(
            { audio },
            'dashboard volume update',
            { applyAudio: true }
          );
        } else {
          socket.emit('musicbot:error', { message: 'Volume must be between 0 and 100' });
        }
      } catch (_error) {
        this._emitDashboardSocketFailure(socket, 'musicbot:dashboard-volume');
      }
    });

    this.api.registerSocket('musicbot:dashboard-pause', async (socket) => {
      if (!this._requireDashboardSocketAdmin(socket, 'musicbot:dashboard-pause')) return;
      try {
        if (this._isSafetyLocked()) {
          socket?.emit?.('musicbot:error', { message: this._lockedResult().error, locked: true });
          return;
        }
        await this.playbackEngine.pause();
        this._emitPaused();
      } catch (_error) {
        this._emitDashboardSocketFailure(socket, 'musicbot:dashboard-pause');
      }
    });

    this.api.registerSocket('musicbot:dashboard-resume', async (socket) => {
      if (!this._requireDashboardSocketAdmin(socket, 'musicbot:dashboard-resume')) return;
      try {
        if (this._isSafetyLocked()) {
          socket?.emit?.('musicbot:error', { message: this._lockedResult().error, locked: true });
          return;
        }
        await this.playbackEngine.resume();
        this._emitResumed();
      } catch (_error) {
        this._emitDashboardSocketFailure(socket, 'musicbot:dashboard-resume');
      }
    });
  }

  _emitDashboardSocketFailure(socket, eventName) {
    this.api.log(`[music-bot] Dashboard socket action failed: ${eventName}`, 'error');
    socket?.emit?.('musicbot:error', {
      message: 'Music Bot action failed',
      code: 'MUSIC_BOT_ACTION_FAILED',
      event: eventName
    });
  }

  _requireDashboardSocketAdmin(socket, eventName) {
    if (['loopback-admin', 'admin'].includes(socket?.data?.ltthSocketAccess)) return true;

    const handshake = socket?.handshake;
    const auth = handshake?.auth || {};
    const headers = handshake?.headers || {};
    const address = handshake?.address || socket?.conn?.remoteAddress || socket?.request?.socket?.remoteAddress || '';
    const forwarded = Object.keys(headers).some((header) => {
      const normalized = String(header).toLowerCase();
      return normalized === 'forwarded' || normalized.startsWith('x-forwarded-');
    });
    const isDirectLoopback = isLoopbackAddress(address) && !forwarded;
    const expectedToken = process.env.LTTH_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '';
    const bearerMatch = String(headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    const providedToken = String(auth.adminToken || auth.token || headers['x-ltth-admin-token'] || (bearerMatch ? bearerMatch[1] : ''));
    const expectedBuffer = Buffer.from(expectedToken, 'utf8');
    const providedBuffer = Buffer.from(providedToken, 'utf8');
    const hasValidToken = expectedBuffer.length > 0 && expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer);
    const authorized = auth.role === 'admin' && (isDirectLoopback || hasValidToken);
    if (!authorized) {
      this.api.log(`[music-bot] Rejected unauthorized socket event: ${eventName}`, 'warn');
      socket?.emit?.('musicbot:error', { error: 'Unauthorized socket action', event: eventName });
    }
    return authorized;
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

  async _clearQueueAndStop() {
    let clearResult;
    try {
      clearResult = await this.queueManager.clear();
    } catch (error) {
      this.api.log?.(`[music-bot] Queue clear failed: ${error.message}`, 'error');
      return {
        success: false,
        queueCleared: false,
        playbackStopped: false,
        code: error?.code || 'QUEUE_CLEAR_FAILED',
        error: 'Queue could not be cleared; playback was left unchanged'
      };
    }

    if (clearResult?.success !== true) {
      const code = clearResult?.errorCode
        || (clearResult?.blocked || clearResult?.persistenceBlocked
          ? 'QUEUE_PERSISTENCE_BLOCKED'
          : 'QUEUE_PERSISTENCE_FAILED');
      return {
        success: false,
        queueCleared: false,
        playbackStopped: false,
        code,
        error: clearResult?.error || 'Queue could not be cleared; playback was left unchanged'
      };
    }

    this.autoDJ?.reset();
    this._emitQueue();
    // The queue is durably empty even if MPV shutdown needs a retry. Clear the
    // renderer's Now Playing state only after that durable mutation succeeds.
    this._emitNowPlaying(null);
    try {
      await this.playbackEngine.stop();
    } catch (error) {
      this.api.log?.(`[music-bot] Playback stop failed after queue clear: ${error.message}`, 'error');
      return {
        success: false,
        queueCleared: true,
        playbackStopped: false,
        code: 'PLAYBACK_STOP_FAILED',
        error: 'Queue was cleared, but playback could not be stopped'
      };
    }

    return { success: true, queueCleared: true, playbackStopped: true };
  }

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
      case 'vote1':
      case 'vote2': {
        const result = this._castNextSongVote(username, command.type === 'vote1' ? 1 : 2);
        if (!result.accepted) this._emitChatResponse('Aktuell ist keine Song-Abstimmung aktiv.', username);
        return result;
      }
      case 'queue':
        this._emitChatResponse(`Queue length: ${this.queueManager.getQueue().length}`, username);
        return;
      case 'nowPlaying':
        this._emitChatResponse(this._formatNowPlaying(), username);
        return;
      case 'volume':
        if (command.value !== undefined) {
          await this._applySerializedConfigPatch({
            audio: { sourceVolume: Math.max(0, Math.min(100, Number(command.value) || 0)) }
          }, 'chat volume update', { applyAudio: true });
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
        {
          const result = await this._clearQueueAndStop();
          this._emitChatResponse(
            result.success
              ? 'Warteschlange geleert und Wiedergabe gestoppt.'
              : (result.queueCleared
                ? 'Warteschlange geleert, aber die Wiedergabe konnte nicht sicher gestoppt werden. Bitte erneut versuchen.'
                : 'Warteschlange konnte nicht geleert werden; Wiedergabe blieb unverändert.'),
            username
          );
          return result;
        }
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

  _validateDashboardQuery(query) {
    if (typeof query !== 'string' || !query.trim()) {
      return {
        error: {
          success: false,
          code: 'MUSIC_BOT_QUERY_REQUIRED',
          error: 'A non-empty song query is required.'
        }
      };
    }

    const normalized = query.trim();
    if (Buffer.byteLength(normalized, 'utf8') > MAX_DASHBOARD_QUERY_BYTES) {
      return {
        error: {
          success: false,
          code: 'MUSIC_BOT_QUERY_TOO_LONG',
          maxBytes: MAX_DASHBOARD_QUERY_BYTES,
          error: `Song query must not exceed ${MAX_DASHBOARD_QUERY_BYTES} UTF-8 bytes.`
        }
      };
    }
    return { query: normalized, error: null };
  }

  _createRequestAbort(req, res) {
    const controller = new AbortController();
    const onAborted = () => controller.abort();
    let responseFinished = res?.writableFinished === true;
    const onResponseFinish = () => { responseFinished = true; };
    const onResponseClose = () => {
      if (!responseFinished && res?.writableFinished !== true) controller.abort();
    };
    req?.once?.('aborted', onAborted);
    res?.once?.('finish', onResponseFinish);
    res?.once?.('close', onResponseClose);
    if (req?.aborted || (res?.destroyed && res?.writableFinished !== true)) controller.abort();
    return {
      signal: controller.signal,
      cleanup: () => {
        req?.removeListener?.('aborted', onAborted);
        res?.removeListener?.('finish', onResponseFinish);
        res?.removeListener?.('close', onResponseClose);
      }
    };
  }

  async _handleDashboardRequest(query, username, requesterAvatar = null, options = {}) {
    if (this._destroyed) return { success: false, code: 'MUSIC_BOT_SHUTTING_DOWN' };
    const lifecycleGeneration = this._lifecycleGeneration;
    try {
      let resolved;
      try {
        resolved = await this.musicResolver.resolve(query, { signal: options.signal });
      } catch (error) {
        if (options.signal?.aborted || error?.name === 'AbortError') {
          return { success: false, aborted: true };
        }
        if (this._destroyed || lifecycleGeneration !== this._lifecycleGeneration) {
          return { success: false, code: 'MUSIC_BOT_SHUTTING_DOWN' };
        }
        const code = 'MUSIC_BOT_REQUEST_FAILED';
        const message = 'Song request failed. Please try again.';
        const httpStatus = dashboardResolverHttpStatus({ error });
        this.api.log(`[music-bot] Dashboard resolver failed (${code})`, 'error');
        this._emitToast('error', { titleKey: 'apiError', message });
        return { success: false, error: message, code, httpStatus };
      }
      if (options.signal?.aborted) return { success: false, aborted: true };
      if (this._destroyed || lifecycleGeneration !== this._lifecycleGeneration) {
        return { success: false, code: 'MUSIC_BOT_SHUTTING_DOWN' };
      }
      if (!resolved?.success) {
        this._emitToast('error', { titleKey: 'apiError', message: resolved?.message || '' });
        return {
          success: false,
          error: resolved?.message || 'Song konnte nicht geladen werden.',
          httpStatus: dashboardResolverHttpStatus({ result: resolved })
        };
      }

      const banRejection = this._getBanRejection(resolved.song, username);
      if (banRejection) {
        this._emitToast('warn', { titleKey: 'songBlockedTitle', ...banRejection });
        return { success: false, error: this._formatBanRejectionForChat(banRejection), ...banRejection };
      }

      const added = this.queueManager.addSong({ ...resolved.song, requestedBy: username, requesterAvatar });
      if (!added.success) {
        const rejection = this._queueRejectionPayload(added);
        this._emitToast('warn', { titleKey: 'requestRejectedTitle', ...rejection });
        return { success: false, error: added.error || '', ...rejection };
      }
      this._invalidateRadioPrefetch('viewer-queue-changed');
      this._cancelNextSongVote('viewer-request');
      this.autoDJ?.setRequestSeed?.(added.song);
      this._schedulePreCache();
      this.autoDJ?.onSongRequested();
      this._emitSongAdded(added.song, added.position);
      let playbackFailure = null;
      if (!this._isPlaybackOccupied() && this.config.playback.autoPlay) {
        try {
          const playback = await this._playNextFromQueue();
          if (!playback?.success) {
            playbackFailure = {
              attempted: true,
              started: false,
              code: playback?.code || playback?.errorCode || 'MUSIC_BOT_AUTO_PLAY_FAILED'
            };
          }
        } catch (error) {
          playbackFailure = {
            attempted: true,
            started: false,
            code: error?.code || 'MUSIC_BOT_AUTO_PLAY_FAILED'
          };
          this.api.log(`[music-bot] Queue request committed but auto-play failed (${playbackFailure.code})`, 'warn');
        }
      }
      this._emitToast('success', { titleKey: 'songAddedTitle', messageKey: 'requestAdded', params: { title: resolved.song.title, position: added.position } });
      return {
        success: true,
        song: added.song,
        position: added.position,
        ...(playbackFailure ? { playback: playbackFailure } : {})
      };
    } catch (error) {
      if (options.signal?.aborted || error?.name === 'AbortError') {
        return { success: false, aborted: true };
      }
      if (this._destroyed || lifecycleGeneration !== this._lifecycleGeneration) {
        return { success: false, code: 'MUSIC_BOT_SHUTTING_DOWN' };
      }
      const code = 'MUSIC_BOT_REQUEST_FAILED';
      const message = 'Song request failed. Please try again.';
      this.api.log(`[music-bot] Dashboard request failed (${code})`, 'error');
      this._emitToast('error', { titleKey: 'apiError', message });
      return { success: false, error: message, code };
    }
  }

  async _handleRequest(query, username, chatData = {}) {
    if (this._destroyed) return;
    const lifecycleGeneration = this._lifecycleGeneration;
    if (!query) {
      this._emitChatResponse('Bitte gib einen Song an.', username);
      this._emitToast('warn', { titleKey: 'requestRejectedTitle', messageKey: 'requestRequired' });
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
      this._emitToast('warn', { titleKey: 'songBlockedTitle', messageKey: 'requestUserBlocked', params: { username } });
      return;
    }

    if (this.config.monetization?.likeGateEnabled) {
      const likes = this._getUserLikes(username);
      const requiredLikes = Math.max(1, Number(this.config.monetization?.minLikesPerUser) || 1);
      if (likes < requiredLikes) {
        this._emitChatResponse(`Du brauchst mindestens ${requiredLikes} Likes für !sr. Aktuell: ${likes}.`, username);
        this._emitToast('warn', { titleKey: 'requestRejectedTitle', messageKey: 'requestLikesRequired', params: { username, likes, requiredLikes } });
        return;
      }
    }

    if (this.config.monetization?.payToPlayEnabled) {
      const availableCredits = this._getRequestCredits(username);
      if (availableCredits < 1) {
        this._emitChatResponse('Für !sr benötigst du ein konfiguriertes Gift bzw. genügend Coins.', username);
        this._emitToast('warn', { titleKey: 'requestRejectedTitle', messageKey: 'requestGiftRequired', params: { username } });
        return;
      }
    }

    this._pendingRequests.add(lowerUser);
    try {
      const resolved = await this.musicResolver.resolve(query);
      if (this._destroyed || lifecycleGeneration !== this._lifecycleGeneration) return;
      if (!resolved?.success) {
        this._emitChatResponse(resolved?.message || 'Song konnte nicht geladen werden.', username);
        this._emitToast('error', { titleKey: 'apiError', message: resolved?.message || '' });
        return;
      }

      const banRejection = this._getBanRejection(resolved.song, username);
      if (banRejection) {
        this._emitChatResponse(this._formatBanRejectionForChat(banRejection), username);
        this._emitToast('warn', { titleKey: 'songBlockedTitle', ...banRejection });
        return;
      }

      const addResult = this.queueManager.addSong({
        ...resolved.song,
        requestedBy: username,
        requesterAvatar: chatData?.profilePictureUrl || chatData?.avatar || null
      });
      if (!addResult.success) {
        this._emitChatResponse(addResult.error || 'Song konnte nicht hinzugefügt werden.', username);
        this._emitToast('warn', { titleKey: 'requestRejectedTitle', ...this._queueRejectionPayload(addResult) });
        return;
      }
      this._invalidateRadioPrefetch('viewer-queue-changed');
      this._cancelNextSongVote('viewer-request');
      this.autoDJ?.setRequestSeed?.(addResult.song);
      if (this.config.monetization?.payToPlayEnabled) {
        this._consumeRequestCredit(username);
      }
      this._schedulePreCache();
      this.autoDJ?.onSongRequested();
      this._emitSongAdded(addResult.song, addResult.position);

      if (!this._isPlaybackOccupied() && this.config.playback.autoPlay) {
        await this._playNextFromQueue();
      }

      const artist = resolved.song.artist ? ` von ${resolved.song.artist}` : '';
      this._emitChatResponse(`Hinzugefügt: ${resolved.song.title}${artist} (#${addResult.position})`, username);
      this._emitToast('success', { titleKey: 'songAddedTitle', messageKey: 'requestAdded', params: { title: resolved.song.title, position: addResult.position } });
    } catch (error) {
      if (this._destroyed || lifecycleGeneration !== this._lifecycleGeneration) return;
      this.api.log(`[music-bot] request failed: ${error.message}`, 'error');
      this._emitChatResponse('Song konnte nicht geladen werden.', username);
      this._emitToast('error', { titleKey: 'apiError', message: error.message || '' });
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
    const rejection = this._getBanRejection(song, username);
    return rejection ? this._formatBanRejectionForChat(rejection) : null;
  }

  _getBanRejection(song, username) {
    if (!song) return null;
    if (this.banList?.isUserBanned(username)?.banned) {
      return { messageKey: 'requestUserBlocked', params: { username } };
    }
    if (this.banList?.isUrlBanned(song.url, song.youtubeId)?.banned
      || this.banList?.isTrackBanned?.(song.trackKey)?.banned) {
      return { messageKey: 'banSong', params: {} };
    }
    if (this.banList?.isArtistBanned?.(song.artist)?.banned) {
      return { messageKey: 'banArtist', params: { artist: song.artist || '' } };
    }
    const titleKeyword = this.banList?.isKeywordBanned(song.title || '');
    const channelKeyword = this.banList?.isKeywordBanned(song.channelName || '');
    const keywordBan = titleKeyword?.banned ? titleKeyword : channelKeyword;
    if (keywordBan?.banned) {
      return { messageKey: 'banKeyword', params: { keyword: keywordBan.keyword || '' } };
    }
    if (this.banList?.isChannelBanned(song.channelId, song.channelName)?.banned) {
      return { messageKey: 'banChannel', params: { channel: song.channelName || '' } };
    }
    return null;
  }

  _formatBanRejectionForChat(rejection = {}) {
    const params = rejection.params || {};
    switch (rejection.messageKey) {
      case 'requestUserBlocked': return 'Dieser Nutzer darf keine Songs anfragen.';
      case 'banArtist': return 'Dieser Künstler ist gesperrt.';
      case 'banKeyword': return `Dieser Song ist geblockt (Keyword: ${params.keyword || ''}).`;
      case 'banChannel': return 'Dieser Kanal ist gesperrt.';
      default: return 'Dieser Song ist gesperrt.';
    }
  }

  _queueRejectionPayload(result = {}) {
    return {
      messageKey: result.messageKey || 'requestFailed',
      params: result.params && typeof result.params === 'object' ? { ...result.params } : {}
    };
  }

  _legacyCheckBans(song, username) {
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

  _buildMpvUnavailableMessage(_error) {
    return 'mpv ist nicht verfügbar. Prüfe die Installation und den Pfad in den Music-Bot-Einstellungen.';
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
    const code = this._isMpvUnavailableError(error) ? 'MUSIC_BOT_MPV_UNAVAILABLE' : 'MUSIC_BOT_PLAYBACK_UNAVAILABLE';
    this.api.log(`[music-bot] ${message}`, 'warn');
    this._emitError(message, code);
    this._emitSetupStatus();
    this._emitQueue();
    return { success: false, error: message, code };
  }

  async _playNextFromQueue(reason = 'queue-empty', payload = {}) {
    if (this.radioSupervisor?.wake) {
      return this.radioSupervisor.wake(
        typeof reason === 'string' ? reason : 'queue-empty',
        payload && typeof payload === 'object' ? payload : {}
      );
    }
    if (this._queueAdvanceOperation) return this._queueAdvanceOperation;
    const context = {
      reason: typeof reason === 'string' ? reason : 'queue-empty',
      payload: payload && typeof payload === 'object' ? payload : {},
      isCurrent: () => !this._destroyed,
      resetPlayerOnce: async (reset) => {
        if (typeof reset !== 'function') return false;
        await reset();
        return true;
      }
    };
    const operation = this._advancePlayback(context);
    this._queueAdvanceOperation = operation;
    try {
      return await operation;
    } finally {
      if (this._queueAdvanceOperation === operation) {
        this._queueAdvanceOperation = null;
      }
    }
  }

  _isPlaybackOccupied() {
    const state = String(this.playbackEngine?.getState?.() || '').toLowerCase();
    return ['loading', 'buffering', 'playing', 'paused', 'crossfading', 'recovery'].includes(state)
      || Boolean(this.playbackEngine?.getNowPlaying?.());
  }

  async _advancePlayback(context = {}) {
    const isCurrent = typeof context.isCurrent === 'function'
      ? context.isCurrent
      : () => !this._destroyed;
    if (!isCurrent() || this._isSafetyLocked() || this._destroyed) {
      return this._lockedResult();
    }
    if (context.reason === 'ipc-confirmed' && typeof context.resetPlayerOnce === 'function') {
      await context.resetPlayerOnce(() => this.playbackEngine?.resetPlayer?.({ remainLocked: false }));
      if (!isCurrent()) return { success: false, stale: true };
      const retainedAlternative = await this._playRetainedAutoDJAlternative(
        context.payload?.track,
        context
      );
      if (retainedAlternative) {
        return { success: true, song: retainedAlternative };
      }
      if (!isCurrent()) return { success: false, stale: true };
    }
    return this._playNextFromQueueInternal(context);
  }

  async _playRetainedAutoDJAlternative(track, context = {}) {
    if (!track || track.requestedBy !== 'AutoDJ' || !this.autoDJ) return null;
    const isCurrent = typeof context.isCurrent === 'function'
      ? context.isCurrent
      : () => !this._destroyed;
    const alternative = this.autoDJ.getAlternativeSource?.(track);
    if (!alternative || !isCurrent()) return null;

    try {
      const prepared = await this._prepareAutoDJTrack(alternative);
      if (
        !isCurrent()
        || this._isSafetyLocked()
        || this.queueManager?.getQueue?.().length > 0
      ) return null;
      const banMessage = this._checkBans(prepared, 'AutoDJ');
      if (banMessage) {
        this.api.log(
          `[music-bot] AutoDJ rejected retained alternative "${prepared.title || prepared.id}": ${banMessage}`,
          'warn'
        );
        return null;
      }
      await this.playbackEngine.play(prepared);
      if (!isCurrent()) return null;
      this.autoDJ.recordSourceSuccess?.(prepared);
      this.autoDJ.markTrackStarted?.(prepared);
      this.queueManager?.markPlaying?.(prepared);
      this._emitQueue();
      this.api.emit('musicbot:auto-dj-playing', {
        title: prepared.title,
        mode: this.autoDJ.getStatus?.().mode
      });
      return prepared;
    } catch (error) {
      this._recordCatalogTrackEnd({
        track: alternative,
        reason: 'error',
        positionSeconds: 0,
        error: error.message
      });
      this._lastAutoDJFailureClass = this._recordAutoDJSourceFailure(
        alternative,
        error,
        /ipc|socket|pipe/i.test(error.message) ? 'ipc' : 'playback'
      );
      this.autoDJ.markPlaybackFailed?.(error);
      this.api.log(
        `[music-bot] AutoDJ retained alternative failed "${alternative.title || alternative.id}": ${error.message}`,
        'warn'
      );
      return null;
    }
  }

  async _playNextFromQueueInternal(context = {}) {
    const isCurrent = typeof context.isCurrent === 'function'
      ? context.isCurrent
      : () => !this._destroyed;
    if (this._isSafetyLocked() || this._destroyed) {
      return this._lockedResult();
    }
    if (this._mpvAvailable === false) {
      await this._ensureMpv();
      if (!isCurrent() || this._isSafetyLocked() || this._destroyed) {
        return this._lockedResult();
      }
      if (this._mpvAvailable === false) return this._handlePlaybackUnavailable();
    }
    let next = this.queueManager.shiftNext();
    while (next) {
      const banMessage = this._checkBans(next, next.requestedBy);
      if (!banMessage) break;
      this.api.log(`[music-bot] Removed blocked queued track "${next.title || next.id}": ${banMessage}`, 'warn');
      this._emitQueue();
      next = this.queueManager.shiftNext();
    }
    if (!next) {
      const fallbackTrack = this.autoDJ?.hasArtistRadio?.() ? null : await this._playFallbackTrack();
      if (fallbackTrack) {
        this._schedulePreCache();
        return { success: true, song: fallbackTrack };
      }
      const autoDJTrack = await this._maybePlayAutoDJ(
        Boolean(context.payload?.forceAutoDJ),
        Boolean(context.payload?.allowActiveAutoDJ),
        context
      );
      if (!autoDJTrack) {
        if (
          isCurrent()
          && !this._isSafetyLocked()
          && !this._destroyed
          && this.queueManager?.getQueue?.().length > 0
        ) {
          return this._playNextFromQueueInternal(context);
        }
        const outgoingStillActive = Boolean(
          this.playbackEngine.isPlaying?.() && this.playbackEngine.getNowPlaying?.()
        );
        if (!outgoingStillActive) {
          this.playbackEngine.clearNowPlaying();
          this._emitPlaybackStopped();
        }
        this._emitQueue();
        const state = this.autoDJ?.getStatus?.()?.lastResult?.state;
        return {
          success: false,
          error: 'Queue empty',
          failureClass: this._lastAutoDJFailureClass || (state === 'no-track' ? 'empty-pool' : 'queue-empty')
        };
      }
      return { success: true, song: autoDJTrack };
    }
    try {
      if (!isCurrent() || this._isSafetyLocked() || this._destroyed) {
        this.queueManager.returnToFront?.(next);
        return this._lockedResult();
      }
      await this.playbackEngine.play(next);
      if (!isCurrent()) return { success: false, stale: true };
      if (this._isSafetyLocked() || this._destroyed) return this._lockedResult();
      this._emitQueue();
      this._schedulePreCache();
      return { success: true, song: next };
    } catch (error) {
      if (!isCurrent() || this._destroyed || this.queueManager?._mutationsClosed) {
        return { success: false, stale: true };
      }
      this.api.log(`[music-bot] Playback failed: ${error.message}`, 'error');
      if (this._isMpvUnavailableError(error)) {
        return this._handlePlaybackUnavailable(next, error);
      }
      const failureClass = /ipc|socket|pipe/i.test(error.message) ? 'ipc' : 'playback';
      if (failureClass === 'ipc' && typeof context.resetPlayerOnce === 'function') {
        await context.resetPlayerOnce(
          () => this.playbackEngine?.resetPlayer?.({ remainLocked: false })
        );
        if (!isCurrent() || this._destroyed || this.queueManager?._mutationsClosed) {
          return { success: false, stale: true };
        }
      }
      this._recordCatalogTrackEnd({
        track: next,
        reason: 'error',
        positionSeconds: 0,
        error: error.message
      });
      this.queueManager.markPlaying?.(null);
      this.queueManager.addToHistory?.({
        ...next,
        playbackFailed: true,
        playbackError: error.message
      }, true);
      this._emitError(error.message);
      this._emitQueue();
      return this._playNextFromQueueInternal(context);
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
    for (const trackKey of this._precacheTasks.keys()) {
      if (trackKey) next.add(trackKey);
    }
    const radioPrefetchKey = this._radioPrefetch?.prepared?.trackKey;
    if (radioPrefetchKey) next.add(radioPrefetchKey);
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
    this.api.emit('musicbot:now-playing', this._buildNowPlayingPayload());
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
    this._emitToast('info', { titleKey: 'skipTitle', messageKey: 'songSkipped', params: { title, reason } });
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

  _emitError(message, code) {
    this.api.emit('musicbot:error', { message, ...(code ? { code } : {}) });
  }

  _emitNowPlaying(track) {
    this.api.emit('musicbot:now-playing', this._buildNowPlayingPayload(arguments.length > 0 ? track : undefined));
  }

  _buildNowPlayingPayload(track = this.playbackEngine.getNowPlaying()) {
    const playbackId = track?.playbackId || this._buildRuntimeSnapshot().activePlaybackId;
    return track ? { ...track, playbackId } : null;
  }

  _emitPlaybackAdvancing(reason) {
    this.api.emit('musicbot:playback-advancing', {
      reason: reason || 'track-end',
      message: 'Lädt den nächsten Titel …',
      messageKey: 'playbackAdvancing'
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

  _emitNextSongVote(status = this._nextSongVote?.getStatus?.()) {
    const payload = {
      enabled: Boolean(this.config.autoDJ?.chatVotingEnabled),
      ...(status || { status: 'idle', candidates: [], votes: { 1: 0, 2: 0 }, closesAt: null, winner: null })
    };
    this.api.emit('musicbot:next-song-vote', payload);
    return payload;
  }

  _getNextSongVoteStatus() {
    return this._emitNextSongVote(this._nextSongVote?.getStatus?.());
  }

  _openNextSongVote(track) {
    this._cancelNextSongVote('replaced');
    if (!this.config.autoDJ?.enabled || !this.config.autoDJ?.chatVotingEnabled || this.autoDJ?.hasArtistRadio?.()) return this._getNextSongVoteStatus();
    if (this.queueManager?.getQueue?.().length > 0) return this._getNextSongVoteStatus();
    const duration = Number(track?.duration);
    const closeBefore = Number(this.config.autoDJ?.chatVoteCloseBeforeEndSeconds) || 20;
    if (!Number.isFinite(duration) || duration <= closeBefore) return this._getNextSongVoteStatus();
    const candidates = this.autoDJ?.getRadioPreview?.(2) || [];
    if (candidates.length !== 2) return this._getNextSongVoteStatus();
    const closesAt = Date.now() + ((duration - closeBefore) * 1000);
    let status;
    try {
      status = this._nextSongVote.open(candidates, closesAt);
    } catch (error) {
      this.api.log?.(`[music-bot] Could not open next-song vote: ${error.message}`, 'warn');
      return this._getNextSongVoteStatus();
    }
    this._nextSongVoteTimer = setTimeout(() => {
      this._nextSongVoteTimer = null;
      this._nextSongVote.close('timer');
    }, Math.max(0, closesAt - Date.now()));
    this._nextSongVoteTimer.unref?.();
    return status;
  }

  _cancelNextSongVote(reason = 'cancelled') {
    if (this._nextSongVoteTimer) {
      clearTimeout(this._nextSongVoteTimer);
      this._nextSongVoteTimer = null;
    }
    return this._nextSongVote?.cancel?.(reason) || null;
  }

  _consumeNextSongVoteWinner() {
    const status = this._nextSongVote?.getStatus?.();
    if (status?.status !== 'closed') return null;
    const winner = this._nextSongVote?.consumeWinner?.() || null;
    if (winner && this._nextSongVoteTimer) {
      clearTimeout(this._nextSongVoteTimer);
      this._nextSongVoteTimer = null;
    }
    return winner;
  }

  _castNextSongVote(username, choice) {
    if (!this.config.autoDJ?.chatVotingEnabled) return { accepted: false, reason: 'disabled' };
    return this._nextSongVote?.cast?.(username, choice) || { accepted: false, reason: 'inactive' };
  }

  _emitChatResponse(message, username) {
    this.api.emit('musicbot:chat-response', { message, username });
  }

  _emitToast(type, title, message) {
    const semantic = title && typeof title === 'object' && !Array.isArray(title) ? title : null;
    this.api.emit('musicbot:status-toast', semantic
      ? {
        type: String(type || 'info'),
        ...(semantic.titleKey ? { titleKey: String(semantic.titleKey) } : {}),
        ...(semantic.messageKey ? { messageKey: String(semantic.messageKey) } : {}),
        ...(semantic.title ? { title: String(semantic.title) } : {}),
        ...(semantic.message ? { message: String(semantic.message) } : {}),
        ...(semantic.params && typeof semantic.params === 'object' ? { params: { ...semantic.params } } : {}),
        timestamp: Date.now()
      }
      : {
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
    if (this._destroyed || this.queueManager?._mutationsClosed) return;
    const username =
      data?.username || data?.nickname || data?.user?.uniqueId || data?.user?.nickname;
    if (!username) return;
    if (this._isDuplicateGiftEvent(data)) {
      this.api.log?.('[music-bot] Ignored duplicate TikTok gift event.', 'debug');
      return;
    }
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
        this._emitToast('success', { titleKey: 'payToPlayTitle', messageKey: 'payToPlayCredits', params: { username, credits, totalCredits } });
      }
    }

    if (this.config.monetization?.payToSkipEnabled && giftName) {
      const skipCatalog = this._normalizeGiftList(this.config.monetization.payToSkipGiftCatalog)
        .map((entry) => this._normalizeGiftKey(entry));
      if (skipCatalog.includes(giftName)) {
        const skipped = await this._skipCurrent(`gift:${giftNameRaw}`);
        if (this._destroyed || this.queueManager?._mutationsClosed) return;
        if (skipped.success) {
          this._emitToast('info', { titleKey: 'payToSkipTitle', messageKey: 'payToSkipGift', params: { giftName: giftNameRaw } });
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

    if (this._destroyed || this.queueManager?._mutationsClosed) return;
    if (!this.queueManager.markGiftRequest?.(hasSong.id)) return;
    if (!this.queueManager.addSkipImmunity(username)) return;
    this.api.emit('musicbot:skip-immunity-granted', { username, giftName: match });
    this._emitChatResponse(`${username} hat Skip-Immunity erhalten (${match}).`, username);
  }

  _isDuplicateGiftEvent(data) {
    const eventId = [
      data?.eventId,
      data?.event_id,
      data?.messageId,
      data?.message_id,
      data?.msgId,
      data?.msg_id,
      data?.logId,
      data?.common?.eventId,
      data?.common?.msgId
    ].find((value) => (
      (typeof value === 'string' && value.trim().length > 0)
      || (typeof value === 'number' && Number.isFinite(value))
    ));
    const key = typeof eventId === 'string' ? eventId.trim() : String(eventId ?? '');
    if (!key) return false;

    const now = Date.now();
    for (const [knownEventId, processedAt] of this._processedGiftEventIds) {
      if (now - processedAt >= GIFT_EVENT_DEDUPE_TTL_MS) {
        this._processedGiftEventIds.delete(knownEventId);
      }
    }
    if (this._processedGiftEventIds.has(key)) return true;
    while (this._processedGiftEventIds.size >= MAX_TRACKED_GIFT_EVENT_IDS) {
      const oldestEventId = this._processedGiftEventIds.keys().next().value;
      if (!oldestEventId) break;
      this._processedGiftEventIds.delete(oldestEventId);
    }
    this._processedGiftEventIds.set(key, now);
    return false;
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

  _maybePlayAutoDJ(force = false, allowActiveAutoDJ = false, supervisorContext = null) {
    const generation = this._lifecycleGeneration;
    const operation = this._maybePlayAutoDJInternal(
      force,
      allowActiveAutoDJ,
      generation,
      supervisorContext
    );
    this._autoDjAdvanceOperations.add(operation);
    operation.then(
      () => this._autoDjAdvanceOperations.delete(operation),
      () => this._autoDjAdvanceOperations.delete(operation)
    );
    return operation;
  }

  async _maybePlayAutoDJInternal(force, allowActiveAutoDJ, generation, supervisorContext = null) {
    const prepareOnly = Boolean(supervisorContext?.payload?.prepareOnly);
    const allowActiveViewerAtBoundary = prepareOnly
      || Boolean(supervisorContext?.payload?.allowActiveViewerAtBoundary);
    const isCurrent = () => (
      !this._destroyed
      && generation === this._lifecycleGeneration
      && (typeof supervisorContext?.isCurrent !== 'function' || supervisorContext.isCurrent())
    );
    if (!isCurrent() || this._isSafetyLocked() || !this.autoDJ || (!this.config.autoDJ?.enabled && !this.autoDJ.hasArtistRadio?.())) {
      return null;
    }
    if (this.queueManager?.getQueue?.().length > 0) return null;
    const activeBeforeResolve = this.playbackEngine?.getNowPlaying?.();
    const mayReplaceActiveAutoDJ = force || allowActiveAutoDJ;
    if (
      mayReplaceActiveAutoDJ
      && activeBeforeResolve
      && activeBeforeResolve.requestedBy !== 'AutoDJ'
      && !allowActiveViewerAtBoundary
    ) return null;

    this._lastAutoDJFailureClass = null;
    let result = null;
    let track = null;
    let consumedPrefetchGeneration = null;
    let votedTrack = null;
    if (!prepareOnly) {
      const winner = this._consumeNextSongVoteWinner();
      if (winner) {
        votedTrack = this.autoDJ.getTrackForPreview?.(winner.id) || null;
        if (!votedTrack) {
          this.api.log?.('[music-bot] Voted Auto-DJ candidate is no longer eligible; using normal radio selection.', 'warn');
        }
      }
    }
    if (!prepareOnly && this._radioPrefetch) {
      const prefetched = await this._consumeRadioPrefetch(supervisorContext, isCurrent);
      if (prefetched) {
        track = prefetched.track;
        result = { announce: prefetched.announce };
        consumedPrefetchGeneration = prefetched.generation;
      }
    }
    for (let attempt = 0; !track && attempt < 2; attempt += 1) {
      if (votedTrack) {
        result = {
          song: { ...votedTrack, requestedBy: 'AutoDJ' },
          announce: this.config.autoDJ.announceAutoDJ,
          selectionSource: 'vote'
        };
        votedTrack = null;
      } else {
        result = force
          ? await this.autoDJ.getNextSong(true)
          : await this.autoDJ.onQueueEmpty();
      }
      if (!isCurrent() || !result) {
        this._lastAutoDJFailureClass ||= 'empty-pool';
        return null;
      }
      if (
        this._isSafetyLocked()
        || this.queueManager?.getQueue?.().length > 0
        || (!mayReplaceActiveAutoDJ && this.playbackEngine?.isPlaying?.())
        || (mayReplaceActiveAutoDJ && this.playbackEngine?.isPlaying?.()
          && this.playbackEngine?.getNowPlaying?.()?.requestedBy !== 'AutoDJ'
          && !allowActiveViewerAtBoundary)
      ) {
        return null;
      }
      const selectedTrack = this._decorateTrackIdentity(result.song || result);
      try {
        track = await this._prepareAutoDJTrack(selectedTrack);
      } catch (error) {
        if (!isCurrent()) return null;
        this._lastAutoDJFailureClass = this._recordAutoDJSourceFailure(
          selectedTrack,
          error,
          'resolve'
        );
        this.api.log(
          `[music-bot] AutoDJ could not resolve "${selectedTrack.title || selectedTrack.id}": ${error.message}`,
          'warn'
        );
        track = null;
        const alternative = this.autoDJ.getAlternativeSource?.(selectedTrack);
        if (alternative && isCurrent()) {
          try {
            track = await this._prepareAutoDJTrack(alternative);
          } catch (alternativeError) {
            this._lastAutoDJFailureClass = this._recordAutoDJSourceFailure(
              alternative,
              alternativeError,
              'resolve'
            );
            this.api.log(
              `[music-bot] AutoDJ alternative source could not resolve "${alternative.title || alternative.id}": ${alternativeError.message}`,
              'warn'
            );
          }
        }
        if (!track) continue;
      }
      if (
        !isCurrent()
        || this._isSafetyLocked()
        || this.queueManager?.getQueue?.().length > 0
        || (!mayReplaceActiveAutoDJ && this.playbackEngine?.isPlaying?.())
        || (mayReplaceActiveAutoDJ && this.playbackEngine?.isPlaying?.()
          && this.playbackEngine?.getNowPlaying?.()?.requestedBy !== 'AutoDJ'
          && !allowActiveViewerAtBoundary)
      ) {
        return null;
      }
      const banMessage = this._checkBans(track, 'AutoDJ');
      if (!banMessage) break;
      this.autoDJ.recordFailedTrack?.(track, 'blocked-by-ban-list');
      this.api.log(
        `[music-bot] AutoDJ rejected blocked track "${track.title || track.id}": ${banMessage}`,
        'warn'
      );
      track = null;
    }
    if (!isCurrent() || !track) return null;
    if (prepareOnly) {
      return {
        prefetched: true,
        track,
        announce: Boolean(result?.announce)
      };
    }

    try {
      if (
        !isCurrent()
        || this.queueManager?.getQueue?.().length > 0
        || (consumedPrefetchGeneration !== null
          && consumedPrefetchGeneration !== this._radioPrefetchGeneration)
      ) return null;
      await this.playbackEngine.play(track);
      if (!isCurrent()) return null;
      this.autoDJ.recordSourceSuccess?.(track);
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
      this._recordCatalogTrackEnd({
        track,
        reason: 'error',
        positionSeconds: 0,
        error: error.message
      });
      this._lastAutoDJFailureClass = this._recordAutoDJSourceFailure(
        track,
        error,
        /ipc|socket|pipe/i.test(error.message) ? 'ipc' : 'playback'
      );
      const outgoingStillActive = Boolean(this.playbackEngine?.getNowPlaying?.());
      if (
        this._lastAutoDJFailureClass === 'ipc'
        && !outgoingStillActive
        && typeof supervisorContext?.resetPlayerOnce === 'function'
      ) {
        await supervisorContext.resetPlayerOnce(
          () => this.playbackEngine?.resetPlayer?.({ remainLocked: false })
        );
      }
      const alternative = this.autoDJ.getAlternativeSource?.(track);
      if (alternative && isCurrent()) {
        try {
          const preparedAlternative = await this._prepareAutoDJTrack(alternative);
          if (!isCurrent() || this.queueManager?.getQueue?.().length > 0) return null;
          const alternativeBan = this._checkBans(preparedAlternative, 'AutoDJ');
          if (alternativeBan) {
            this.api.log(
              `[music-bot] AutoDJ rejected prepared alternative "${preparedAlternative.title || preparedAlternative.id}": ${alternativeBan}`,
              'warn'
            );
            this.autoDJ.markPlaybackFailed(error);
            return null;
          }
          await this.playbackEngine.play(preparedAlternative);
          if (!isCurrent()) return null;
          this.autoDJ.recordSourceSuccess?.(preparedAlternative);
          this.autoDJ.markTrackStarted(preparedAlternative);
          this.queueManager.markPlaying(preparedAlternative);
          this._emitQueue();
          this.api.emit('musicbot:auto-dj-playing', {
            title: preparedAlternative.title,
            mode: this.autoDJ.getStatus().mode
          });
          return preparedAlternative;
        } catch (alternativeError) {
          this._recordCatalogTrackEnd({
            track: alternative,
            reason: 'error',
            positionSeconds: 0,
            error: alternativeError.message
          });
          this._lastAutoDJFailureClass = this._recordAutoDJSourceFailure(
            alternative,
            alternativeError,
            /ipc|socket|pipe/i.test(alternativeError.message) ? 'ipc' : 'playback'
          );
          error = alternativeError;
        }
      }
      this.autoDJ.markPlaybackFailed(error);
      this.api.log(`[music-bot] AutoDJ playback failed: ${error.message}`, 'error');
      return null;
    }
  }

  async _prepareAutoDJTrack(track) {
    if (!track || typeof track !== 'object') {
      throw new Error('AutoDJ selected an invalid track');
    }

    if (track.localPath || track.streamUrl) {
      return this._decorateTrackIdentity({ ...track, requestedBy: 'AutoDJ' });
    }
    if (!track.url) {
      throw new Error('AutoDJ track has no playable locator');
    }
    if (!this.musicResolver?.resolve) {
      throw new Error('Music resolver is unavailable');
    }

    const resolved = await this.musicResolver.resolve(track.url);
    if (!resolved?.success || !resolved.song) {
      throw new Error(resolved?.message || 'AutoDJ track could not be resolved');
    }
    if (!resolved.song.localPath && !resolved.song.streamUrl) {
      throw new Error('Resolver returned no direct media stream');
    }

    return this._decorateTrackIdentity({
      ...track,
      ...resolved.song,
      requestedBy: 'AutoDJ'
    });
  }

  _handleConfirmedIpcFailure(track, error) {
    if (this._destroyed || this._isSafetyLocked()) return this._lockedResult();
    this._recordCatalogTrackEnd({ track, reason: 'error', error: error?.message || error });
    this._stopPlaybackSync();
    this.playbackEngine?.clearNowPlaying?.();
    this.queueManager?.markPlaying?.(null);
    if (track) {
      this.queueManager?.addToHistory?.({
        ...track,
        playbackFailed: true,
        playbackError: error?.message || String(error || '')
      }, true);
    }
    this._emitPlaybackStopped();
    this._emitNowPlaying(null);
    this._emitRuntimeHealth();
    if (this.radioSupervisor?.wake) {
      return this.radioSupervisor.wake('ipc-confirmed', {
        track,
        error,
        failureClass: 'ipc'
      });
    }
    return this._playNextFromQueue('ipc-confirmed', { track, error, failureClass: 'ipc' });
  }

  _advanceAfterViewerFailure(reason, track, error) {
    this._recordCatalogTrackEnd({ track, reason: 'error', error: error?.message || error });
    const payload = { track, error, failureClass: 'playback' };
    const recovery = this.radioSupervisor?.wake
      ? this.radioSupervisor.wake(reason, payload)
      : this._playNextFromQueue(reason, payload);
    Promise.resolve(recovery).catch((recoveryError) => {
      this.api.log(`[music-bot] Viewer playback recovery failed: ${recoveryError.message}`, 'error');
    });
    return recovery;
  }

  _recordAutoDJSourceFailure(track, error, fallbackClass = 'playback') {
    const result = this.autoDJ?.recordSourceFailure?.(track, error);
    return result?.failureClass || fallbackClass;
  }

  async _handleAutoDJPlaybackFailure(track, reason, error) {
    if (this._destroyed || this.queueManager?._mutationsClosed) return null;
    if (!track || typeof track !== 'object') return null;
    const activeTrack = this.playbackEngine?.getNowPlaying?.();
    if (activeTrack && activeTrack !== track) {
      this.api.log('[music-bot] Ignoring stale AutoDJ playback failure for ' + (track.id || track.title || 'unknown'), 'warn');
      return null;
    }
    if (this._autoDjRecoveryTracks.has(track)) return null;
    this._autoDjRecoveryTracks.add(track);
    this._recordCatalogTrackEnd({ track, reason: 'error', error: error?.message || error });
    this._stopPlaybackSync();
    this._lastAutoDJFailureClass = this._recordAutoDJSourceFailure(
      track,
      error,
      /ipc|socket|pipe/i.test(error?.message || '') ? 'ipc' : 'playback'
    );
    this.autoDJ && this.autoDJ.markPlaybackFailed && this.autoDJ.markPlaybackFailed(error);
    const preserveReplacementOutgoing = reason === 'ipc-confirmed'
      && this.playbackEngine.rememberReplacementOutgoing?.(track);
    this.playbackEngine.clearNowPlaying && this.playbackEngine.clearNowPlaying({ preserveReplacementOutgoing });
    this.queueManager?.markPlaying?.(null);
    this.queueManager?.resetVoteSkips?.();
    this.api.log('[music-bot] AutoDJ track failed (' + reason + '); selecting replacement for ' + (track.id || track.title || 'unknown'), 'warn');
    if (this.radioSupervisor?.wake) {
      return this.radioSupervisor.wake(reason, {
        track,
        error,
        failureClass: this._lastAutoDJFailureClass
      });
    }
    return await this._maybePlayAutoDJ(true);
  }

  _buildStatusPayload() {
    const runtime = this._buildRuntimeSnapshot();
    const resolver = this._buildResolverSnapshot();
    const health = this._buildHealthPayload(runtime, resolver);
    return {
      success: true,
      nowPlaying: this.playbackEngine.getNowPlaying()
        ? { ...this.playbackEngine.getNowPlaying(), playbackId: runtime.activePlaybackId }
        : null,
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
    const supervisor = this.radioSupervisor?.getSnapshot?.() || {
      desiredPlayback: Boolean(this.config?.autoDJ?.enabled) && !this._isSafetyLocked() && !this._destroyed,
      advanceId: 0,
      retryAt: null,
      backoffSeconds: 0,
      lastWakeReason: null,
      failureClass: null
    };
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
    const safe = this._sanitizeDiagnosticValue({
      ...fallback,
      ...snapshot,
      desiredPlayback: supervisor.desiredPlayback,
      advanceId: supervisor.advanceId,
      retryAt: supervisor.retryAt,
      backoffSeconds: supervisor.backoffSeconds,
      lastWakeReason: supervisor.lastWakeReason,
      failureClass: supervisor.failureClass,
      buildFingerprint: MUSIC_BOT_BUILD_FINGERPRINT
    });
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
      desiredPlayback: Boolean(runtime.desiredPlayback),
      advanceId: Number(runtime.advanceId || 0),
      retryAt: runtime.retryAt || null,
      backoffSeconds: Number(runtime.backoffSeconds || 0),
      lastWakeReason: runtime.lastWakeReason || null,
      failureClass: runtime.failureClass || null,
      buildFingerprint: runtime.buildFingerprint || MUSIC_BOT_BUILD_FINGERPRINT,
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
      const playbackId = this.playbackEngine.getSnapshot?.().activePlaybackId || null;
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
      this._emitPlaybackSync({ nowPlaying, playbackId, position });
    }, 5000);
  }

  _emitPlaybackSync({ track, nowPlaying, playbackId, position, duration, seekable, state } = {}) {
    const activeTrack = track || nowPlaying || this.playbackEngine?.getNowPlaying?.();
    if (!activeTrack) return false;
    const activePlaybackId = this.playbackEngine?.getSnapshot?.().activePlaybackId || null;
    const expectedPlaybackId = playbackId || activePlaybackId;
    if (this.playbackEngine?.getNowPlaying?.() !== activeTrack) return false;
    if (expectedPlaybackId && activePlaybackId && expectedPlaybackId !== activePlaybackId) return false;
    const resolvedDuration = Number.isFinite(Number(duration)) ? Number(duration) : activeTrack.duration;
    const resolvedPosition = Number.isFinite(Number(position)) ? Number(position) : 0;
    this.api.emit('musicbot:playback-sync', {
      id: activeTrack.id,
      playbackId: expectedPlaybackId,
      title: activeTrack.title,
      artist: activeTrack.artist,
      requestedBy: activeTrack.requestedBy,
      requesterAvatar: activeTrack.requesterAvatar || null,
      thumbnail: activeTrack.thumbnail,
      duration: resolvedDuration,
      position: resolvedPosition,
      startedAt: activeTrack.startedAt,
      seekable: seekable === undefined ? Number.isFinite(Number(resolvedDuration)) : Boolean(seekable),
      state: state || this.playbackEngine.getState?.()
    });
    return true;
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

  _invalidateRadioPrefetch(_reason = 'invalidated') {
    this._radioPrefetchGeneration += 1;
    this._radioPrefetch = null;
    return this._radioPrefetchGeneration;
  }

  _startRadioPrefetch(track) {
    const generation = this._invalidateRadioPrefetch('track-change');
    const durationSeconds = Number(track?.duration);
    const crossfadeMs = this._getCrossfadeDurationMs();
    if (
      this._destroyed
      || this._isSafetyLocked()
      || (!this.config.autoDJ?.enabled && !this.autoDJ?.hasArtistRadio?.())
      || this.config.autoDJ?.chatVotingEnabled
      || !this.autoDJ
      || !Number.isFinite(durationSeconds)
      || durationSeconds * 1000 <= crossfadeMs
      || this.queueManager?.getQueue?.().length > 0
    ) return null;

    const trackId = track?.id;
    const lifecycleGeneration = this._lifecycleGeneration;
    const isCurrent = () => (
      !this._destroyed
      && !this._isSafetyLocked()
      && lifecycleGeneration === this._lifecycleGeneration
      && generation === this._radioPrefetchGeneration
      && this._radioPrefetch?.generation === generation
      && this._radioPrefetch?.trackId === trackId
      && this.queueManager?.getQueue?.().length === 0
    );
    const entry = {
      generation,
      trackId,
      prepared: null,
      announce: false,
      promise: null
    };
    this._radioPrefetch = entry;
    const operation = this._maybePlayAutoDJ(false, true, {
      reason: 'prefetch',
      payload: {
        prepareOnly: true,
        allowActiveViewerAtBoundary: true,
        prefetchGeneration: generation
      },
      isCurrent
    });
    entry.promise = Promise.resolve(operation).then((result) => {
      if (!isCurrent() || !result?.prefetched || !result.track) return null;
      entry.prepared = result.track;
      entry.announce = Boolean(result.announce);
      this._refreshCachePins(this.queueManager?.getQueue?.() || []);
      return entry.prepared;
    }).catch((error) => {
      if (isCurrent()) {
        this.api.log(`[music-bot] Radio prefetch failed: ${error.message}`, 'warn');
        this._invalidateRadioPrefetch('prefetch-failed');
      }
      return null;
    });
    return entry.promise;
  }

  async _consumeRadioPrefetch(supervisorContext = null, isCurrent = () => true) {
    const entry = this._radioPrefetch;
    if (!entry) return null;
    const expectedGeneration = Number(supervisorContext?.payload?.prefetchGeneration);
    if (Number.isFinite(expectedGeneration) && expectedGeneration !== entry.generation) return null;
    const active = this.playbackEngine?.getNowPlaying?.();
    if (active?.id && active.id !== entry.trackId) {
      this._invalidateRadioPrefetch('track-mismatch');
      return null;
    }
    const prepared = entry.prepared || await entry.promise;
    if (
      !prepared
      || !isCurrent()
      || this._radioPrefetch !== entry
      || entry.generation !== this._radioPrefetchGeneration
      || this._isSafetyLocked()
      || this.queueManager?.getQueue?.().length > 0
    ) return null;
    const banMessage = this._checkBans(prepared, 'AutoDJ');
    if (banMessage) {
      this.api.log(
        `[music-bot] AutoDJ rejected prefetched track "${prepared.title || prepared.id}": ${banMessage}`,
        'warn'
      );
      this._invalidateRadioPrefetch('prefetch-banned');
      return null;
    }
    if (this.autoDJ?.isTrackHardEligible?.(prepared) === false) {
      this.api.log(
        `[music-bot] AutoDJ rejected prefetched track "${prepared.title || prepared.id}": eligibility changed`,
        'warn'
      );
      this._invalidateRadioPrefetch('prefetch-ineligible');
      return null;
    }
    this._radioPrefetch = null;
    return {
      track: prepared,
      announce: entry.announce,
      generation: entry.generation
    };
  }

  _scheduleCrossfadeTransition(track, positionSeconds = 0) {
    this._startRadioPrefetch(track);
    return this._rescheduleCrossfadeTransition(track, positionSeconds);
  }

  _rescheduleCrossfadeTransition(track, positionSeconds = 0, { paused = false, playbackId = null } = {}) {
    this._clearCrossfadeTimer();
    if (paused) return null;
    const durationMs = Math.round(Number(track?.duration) * 1000);
    const positionMs = Math.max(0, Math.round(Number(positionSeconds) * 1000) || 0);
    const remainingMs = durationMs - positionMs;
    const crossfadeMs = this._getCrossfadeDurationMs();
    if (!Number.isFinite(durationMs) || remainingMs <= 0) return null;

    const trackId = track?.id;
    this.crossfadeTimer = setTimeout(() => {
      this.crossfadeTimer = null;
      const current = this.playbackEngine?.getNowPlaying?.();
      const activePlaybackId = this.playbackEngine?.getSnapshot?.().activePlaybackId || null;
      if (
        !trackId
        || current?.id !== trackId
        || (playbackId && activePlaybackId && activePlaybackId !== playbackId)
        || !this.playbackEngine?.isPlaying?.()
      ) return;
      const advance = this._playNextFromQueue('crossfade', {
        allowActiveAutoDJ: true,
        allowActiveViewerAtBoundary: true,
        prefetchGeneration: this._radioPrefetchGeneration
      });
      Promise.resolve(advance).catch((error) => {
        this.api.log(`[music-bot] Crossfade transition failed: ${error.message}`, 'warn');
      });
    }, Math.max(0, remainingMs - crossfadeMs));
    this.crossfadeTimer.unref?.();
    return this.crossfadeTimer;
  }
}

module.exports = MusicBotPlugin;
