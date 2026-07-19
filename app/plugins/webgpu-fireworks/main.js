/**
 * Fireworks Superplugin - Main Entry Point
 *
 * GPU-accelerated fireworks effects with gift-specific displays, combo systems,
 * and interactive triggers. Uses a WebGPU-only compute and render pipeline.
 *
 * Features:
 * - Gift-triggered fireworks with GiftCatalogue integration
 * - Combo streak system (consecutive gifts trigger bigger effects)
 * - Gift escalation system (Small → Big → Massive)
 * - WGSL compute simulation and native WebGPU rendering
 * - Custom explosion shapes (Heart, Star, Spiral, etc.)
 * - Gift-based particles using gift images
 * - Audio effects for rockets/explosions
 * - Goal-triggered finale shows
 * - Interactive triggers (click, chat, emoji)
 * - Random firework generator
 * - Full API for other plugins
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const {
    normalizeCompletionNotification,
    normalizeConfig,
    normalizeFinaleRequest,
    normalizeFireworkTrigger,
    normalizeGiftMapping,
    isCustomFinaleStyleId
} = require('./lib/config-schema');
const { evaluateTriggerPolicy } = require('./lib/trigger-policy');
const { SpawnPlanner } = require('./lib/spawn-planner');
const { FinaleShowPlanner, FINALE_STYLES } = require('./lib/finale-show-planner');
const { FinaleShuffleBag } = require('./lib/finale-shuffle-bag');
const { resolveFinaleSelection } = require('./lib/finale-runtime-resolver');
const { RevisionedShowRepository, ShowRepositoryError } = require('./lib/show-repository');
const { ShowApiController } = require('./lib/show-api-controller');
const { SuperfanFinaleHistory, normalizeSuperfanIdentityAliases } = require('./lib/superfan-finale-history');

const FIREWORKS_CONFIG_MIGRATION_VERSION = 1;
const SUPERFAN_COMPLETION_AUTHORITY = Symbol('webgpu-fireworks-superfan-completion');
const INTERNAL_FINALE_FALLBACK_STYLE = Symbol('webgpu-fireworks-internal-finale-fallback-style');
const MAX_RENDERER_FINALE_STYLE_LENGTH = 64;
const MAX_RENDERER_FINALE_NAME_LENGTH = 200;
const RENDERER_PROTOCOL_VERSION = 3;
const RENDERER_CAPABILITIES = Object.freeze(['depth3d-v1', 'boykisser-v1']);
const RENDERER_UPGRADE_MESSAGE =
    'This OBS overlay is outdated. Refresh the OBS browser source to enable Furry Celebration 3D.';
const SUPERFAN_FINALE_TEST_CONFIG_KEYS = Object.freeze([
    'superfanFinaleEnabled',
    'superfanFinaleCooldownHours',
    'superfanFinaleIntensity',
    'superfanFinaleStyle',
    'superfanFinaleLength',
    'superfanEndCardDuration',
    'superfanEndCardPosition',
    'superfanEndCardSize',
    'superfanEndCardScale',
    'goalFinaleStyle',
    'goalFinaleLength'
]);

function sanitizeRendererFinaleStyle(value) {
    if (typeof value !== 'string') return null;
    const style = value.trim();
    if (!style || style.length > MAX_RENDERER_FINALE_STYLE_LENGTH) return null;
    if (style === 'legacy' || FINALE_STYLES.includes(style)) return style;
    return isCustomFinaleStyleId(style) ? style.toLowerCase() : null;
}

function sanitizeRendererFinaleName(value) {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    return name ? name.slice(0, MAX_RENDERER_FINALE_NAME_LENGTH) : null;
}

function sanitizeRendererProtocol(value) {
    const protocol = Number(value);
    return Number.isInteger(protocol) && protocol >= 0 && protocol <= 1000 ? protocol : 0;
}

function sanitizeRendererCapabilities(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
        .filter(item => typeof item === 'string' && /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(item))
        .map(item => item.slice(0, 64)))]
        .slice(0, 16);
}

function missingRendererCapabilities(telemetry, required = RENDERER_CAPABILITIES) {
    const available = new Set(sanitizeRendererCapabilities(telemetry?.capabilities));
    return required.filter(capability => !available.has(capability));
}

function rendererSupportsCapabilities(telemetry, required = RENDERER_CAPABILITIES) {
    return sanitizeRendererProtocol(telemetry?.rendererProtocol) >= RENDERER_PROTOCOL_VERSION &&
        missingRendererCapabilities(telemetry, required).length === 0;
}

function previewRequiredRendererCapabilities(payload = {}) {
    if (payload.style === 'furry-celebration' || payload.sourceId === 'furry-celebration') {
        return [...RENDERER_CAPABILITIES];
    }
    const cues = Array.isArray(payload.showPlan?.cues) ? payload.showPlan.cues : [];
    const advanced = cues.some(cue => {
        const shells = Array.isArray(cue?.shells)
            ? cue.shells
            : Array.isArray(cue?.launches) ? cue.launches : [];
        return shells.some(shell => (
            shell?.renderHints?.depthEnabled === true ||
            (Array.isArray(shell?.layers) && shell.layers.some(layer => (
                layer?.glyph === 'boykisser' || layer?.glyph === 'trans-flag'
            )))
        ));
    });
    return advanced ? [...RENDERER_CAPABILITIES] : [];
}

function isExplicitPaidSubscriberFlag(value) {
    if (value === true || value === 1) return true;
    if (typeof value !== 'string') return false;
    return ['true', '1'].includes(value.trim().toLowerCase());
}

function hasPaidSuperfanStatus(data = {}) {
    const user = data.user && typeof data.user === 'object' ? data.user : {};
    const identity = data.userIdentity && typeof data.userIdentity === 'object'
        ? data.userIdentity
        : {};
    return [
        data.isSubscriber,
        data.isSub,
        data.isSuperFan,
        data.isSuperfan,
        data.superFan,
        user.isSubscriber,
        user.isSub,
        user.isSuperFan,
        user.isSuperfan,
        user.superFan,
        identity.isSubscriberOfAnchor
    ].some(isExplicitPaidSubscriberFlag);
}

class FireworksPlugin {
    constructor(api) {
        this.api = api;
        // Use persistent storage in user profile directory (survives updates)
        this.pluginDataDir = api.getPluginDataDir();
        this.uploadDir = path.join(this.pluginDataDir, 'uploads');
        this.upload = null;
        this.superfanFinaleHistory = new SuperfanFinaleHistory({
            filePath: path.join(this.pluginDataDir, 'superfan-finales.json'),
            log: message => this.api.log(message, 'warn')
        });

        // Plugin state
        this.config = null;
        this.comboState = new Map(); // Track combo streaks per user
        this.lastGiftTime = new Map(); // Track last gift time per user for combo
        this.giftCatalogCache = new Map(); // Cache gift info for performance

        // Queue state
        this.queueTimestamps = []; // Track timestamps of recent triggers for rate limiting

        // Benchmark state
        this.currentFps = 0;
        this.benchmarkPreset = null;
        this.connectedSockets = new Set();
        this.overlayTelemetry = new Map();
        this.pendingPreviewRequests = new Map();
        this.previewAckTimeoutMs = 1500;
        this.pendingSuperfanFinales = new Map();
        this.pendingSuperfanAliases = new Map();
        this.superfanFinaleAttemptCounter = 0;
        this.superfanFinaleAckTimeoutMs = 5000;

        // Combo timeout (ms) - reset combo if no gift within this time
        this.COMBO_TIMEOUT = 10000;

        // Server-side active firework tracking (browser global not available server-side)
        this.activeFireworkCount = 0;
        this.activeFireworkTimers = new Map();
        this.notificationTimers = new Set();
        this.useLegacyGiftDropGuards = false;
        this.spawnPlanner = new SpawnPlanner();
        this.finaleShowPlanner = new FinaleShowPlanner();
        this.finaleShuffleBag = new FinaleShuffleBag(() => this.getAutoEligibleFinaleStyleIds());
        this.finaleIdCounter = 0;
        this.showRepository = null;
        this.showRepositoryLoadError = null;
        this.showApiController = null;
    }

    async init() {
        this.api.log('🎆 [FIREWORKS] Initializing Fireworks Superplugin...', 'info');

        // Ensure plugin data directory exists
        this.api.ensurePluginDataDir();
        this.initializeShowRepository();
        this.superfanFinaleHistory.load();

        // Migrate old uploads if they exist
        await this.migrateOldData();

        // Create upload directory for custom audio/video
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
            this.api.log('📁 [FIREWORKS] Upload directory created', 'debug');
        }

        this.api.log(`📂 [FIREWORKS] Using persistent storage: ${this.uploadDir}`, 'info');

        // Setup multer for file uploads
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.uploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname);
                cb(null, 'firework-' + uniqueSuffix + ext);
            }
        });

        this.upload = multer({
            storage: storage,
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
            fileFilter: (req, file, cb) => {
                const allowedTypes = /mp3|wav|ogg|webm|mp4|gif|png|jpg|jpeg/;
                const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
                if (extname) {
                    return cb(null, true);
                }
                cb(new Error('Only audio (mp3, wav, ogg) and video (webm, mp4, gif) files are allowed!'));
            }
        });

        // Load default configuration
        this.loadConfig();
        await this.migrateFireworksSettings();

        // Start random firework timer if enabled
        if (this.config.randomEnabled) {
            this.startRandomTimer();
        }

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers
        this.registerTikTokEventHandlers();

        // Register flow actions
        this.registerFlowActions();

        // Cache gift catalog
        await this.cacheGiftCatalog();

        // Register socket event handlers for benchmark
        this.registerSocketHandlers();

        this.api.log('✅ [FIREWORKS] Fireworks Superplugin initialized successfully', 'info');
        this.logRoutes();
    }

    initializeShowRepository() {
        this.showRepository = new RevisionedShowRepository({
            dataDir: this.pluginDataDir,
            logger: message => this.api.log(message, 'warn')
        });
        this.showRepositoryLoadError = null;
        try {
            this.showRepository.load();
        } catch (error) {
            this.showRepositoryLoadError = error;
            const reason = error?.code || error?.message || 'UNKNOWN_ERROR';
            this.api.log(
                `[FIREWORKS] Show repository load failed (${reason}): ${error?.message || reason}. ` +
                'Built-in finales remain available; repository files were left untouched.',
                'error'
            );
        }
    }

    /**
     * Register socket event handlers
     */
    registerSocketHandlers() {
        // Initialize socket tracking
        if (!this.connectedSockets) {
            this.connectedSockets = new Set();
        }

        // Store reference to bound handler to avoid duplicates
        if (!this.fpsUpdateHandler) {
            this.fpsUpdateHandler = (socket) => {
                // Track this socket connection
                this.connectedSockets.add(socket);

                // Send current config to newly connected overlay
                socket.emit('webgpu-fireworks:config-update', { config: this.config });

                socket.on('webgpu-fireworks:register-overlay', (data = {}) => {
                    this.overlayTelemetry.set(socket.id, {
                        benchmark: data.benchmark === true,
                        visible: data.visible !== false,
                        rendererProtocol: sanitizeRendererProtocol(data.rendererProtocol),
                        capabilities: sanitizeRendererCapabilities(data.capabilities),
                        fps: 0,
                        updatedAt: Date.now()
                    });
                });

                // Listen for FPS updates
                socket.on('webgpu-fireworks:fps-update', (data) => {
                    const fps = Number(data && data.fps);
                    if (!Number.isFinite(fps) || fps < 0 || fps > 240) return;

                    const previous = this.overlayTelemetry.get(socket.id) || {
                        benchmark: data && data.benchmark === true
                    };
                    this.overlayTelemetry.set(socket.id, {
                        ...previous,
                        benchmark: previous.benchmark === true,
                        visible: data.visible !== false,
                        fps,
                        updatedAt: Date.now()
                    });
                    this.currentFps = this.getOverlayFps(false).fps;
                });

                socket.on('webgpu-fireworks:renderer-status', (data = {}) => {
                    const previous = this.overlayTelemetry.get(socket.id) || {};
                    const allowedStates = new Set(['initializing', 'ready', 'unsupported', 'device-lost', 'error']);
                    const state = allowedStates.has(data.state) ? data.state : 'error';
                    this.overlayTelemetry.set(socket.id, {
                        ...previous,
                        backend: 'webgpu',
                        state,
                        rendererProtocol: Object.prototype.hasOwnProperty.call(data, 'rendererProtocol')
                            ? sanitizeRendererProtocol(data.rendererProtocol)
                            : sanitizeRendererProtocol(previous.rendererProtocol),
                        capabilities: Object.prototype.hasOwnProperty.call(data, 'capabilities')
                            ? sanitizeRendererCapabilities(data.capabilities)
                            : sanitizeRendererCapabilities(previous.capabilities),
                        adapter: data.adapter || previous.adapter || null,
                        format: typeof data.format === 'string' ? data.format : previous.format || null,
                        gpuFrameMs: Number.isFinite(Number(data.gpuFrameMs)) ? Number(data.gpuFrameMs) : null,
                        activeParticles: Math.max(0, Number(data.activeParticles) || 0),
                        droppedParticles: Math.max(0, Number(data.droppedParticles) || 0),
                        audioStatus: typeof data.audioStatus === 'string' ? data.audioStatus : previous.audioStatus || 'unknown',
                        audioBackend: typeof data.audioBackend === 'string' ? data.audioBackend : previous.audioBackend || 'none',
                        loadedSounds: Math.max(0, Number(data.loadedSounds) || 0),
                        failedSounds: Math.max(0, Number(data.failedSounds) || 0),
                        lastPlayed: typeof data.lastPlayed === 'string' ? data.lastPlayed.slice(0, 100) : previous.lastPlayed || null,
                        lastAudioError: typeof data.lastAudioError === 'string' ? data.lastAudioError.slice(0, 300) : null,
                        lastAudioProfile: typeof data.lastAudioProfile === 'string' ? data.lastAudioProfile.slice(0, 40) : previous.lastAudioProfile || null,
                        crackleState: typeof data.crackleState === 'string' ? data.crackleState.slice(0, 40) : previous.crackleState || 'idle',
                        activeVoices: data.activeVoices && typeof data.activeVoices === 'object'
                            ? {
                                launch: Math.max(0, Number(data.activeVoices.launch) || 0),
                                bang: Math.max(0, Number(data.activeVoices.bang) || 0),
                                crackle: Math.max(0, Number(data.activeVoices.crackle) || 0),
                                total: Math.max(0, Number(data.activeVoices.total) ||
                                    (Number(data.activeVoices.launch) || 0) +
                                    (Number(data.activeVoices.bang) || 0) +
                                    (Number(data.activeVoices.crackle) || 0))
                            }
                            : previous.activeVoices || { launch: 0, bang: 0, crackle: 0, total: 0 },
                        audioEvictions: Number.isFinite(Number(data.audioEvictions))
                            ? Math.max(0, Number(data.audioEvictions))
                            : previous.audioEvictions || 0,
                        missedAudioEvents: Number.isFinite(Number(data.missedAudioEvents))
                            ? Math.max(0, Number(data.missedAudioEvents))
                            : previous.missedAudioEvents || 0,
                        audioPeak: data.audioPeak !== null && data.audioPeak !== undefined && Number.isFinite(Number(data.audioPeak))
                            ? Math.max(-120, Math.min(6, Number(data.audioPeak)))
                            : previous.audioPeak ?? null,
                        timelineEvents: Array.isArray(data.timelineEvents)
                            ? data.timelineEvents.slice(-32).map(event => ({
                                effectId: typeof event?.effectId === 'string' ? event.effectId.slice(0, 100) : null,
                                type: typeof event?.type === 'string' ? event.type.slice(0, 40) : 'unknown',
                                plannedAt: Number.isFinite(Number(event?.plannedAt)) ? Number(event.plannedAt) : null,
                                actualAt: Number.isFinite(Number(event?.actualAt)) ? Number(event.actualAt) : null,
                                driftMs: Number.isFinite(Number(event?.driftMs)) ? Number(event.driftMs) : null,
                                state: typeof event?.state === 'string' ? event.state.slice(0, 40) : null
                            }))
                            : previous.timelineEvents || [],
                        finaleActive: data.finaleActive === true,
                        finaleId: typeof data.finaleId === 'string' ? data.finaleId.slice(0, 160) : null,
                        finaleStyle: sanitizeRendererFinaleStyle(data.finaleStyle),
                        finaleName: sanitizeRendererFinaleName(data.finaleName),
                        finaleLength: typeof data.finaleLength === 'string' ? data.finaleLength.slice(0, 20) : null,
                        finalePhase: typeof data.finalePhase === 'string' ? data.finalePhase.slice(0, 40) : 'idle',
                        finaleQueueLength: Number.isFinite(Number(data.finaleQueueLength))
                            ? Math.max(0, Math.floor(Number(data.finaleQueueLength)))
                            : 0,
                        finaleError: typeof data.finaleError === 'string' ? data.finaleError.slice(0, 300) : null,
                        previewActive: data.previewActive === true,
                        previewRequestId: typeof data.previewRequestId === 'string'
                            ? data.previewRequestId.slice(0, 160)
                            : null,
                        previewScope: typeof data.previewScope === 'string' ? data.previewScope.slice(0, 20) : null,
                        previewState: typeof data.previewState === 'string' ? data.previewState.slice(0, 20) : null,
                        previewError: typeof data.previewError === 'string' ? data.previewError.slice(0, 300) : null,
                        visualStyle: typeof data.visualStyle === 'string' ? data.visualStyle : this.config.visualStyle,
                        reason: typeof data.reason === 'string' ? data.reason.slice(0, 300) : null,
                        updatedAt: Date.now()
                    });
                    if (state !== 'ready' && state !== 'initializing') {
                        this.clearPendingSuperfanFinalesForSocket(socket.id, `renderer-${state}`);
                        this.clearPendingPreviewsForSocket(socket.id);
                        this.api.log(`[WEBGPU FIREWORKS] Renderer ${state}: ${data.reason || 'no details'}`, 'warn');
                    }
                });

                socket.on('webgpu-fireworks:finale-ack', data => {
                    this.handleSuperfanFinaleAck(data, socket);
                });

                socket.on('webgpu-fireworks:preview-ack', data => {
                    this.handlePreviewAck(data, socket);
                });

                socket.on('webgpu-fireworks:preview-status', data => {
                    this.handlePreviewStatus(data, socket);
                });

                socket.on('webgpu-fireworks:interactive-trigger', (data = {}) => {
                    if (!this.config.enabled || !this.config.interactiveEnabled || !this.config.clickTriggerEnabled) return;
                    this.triggerFirework({
                        type: 'click',
                        reason: 'click',
                        positionMode: 'exact',
                        position: data.position,
                        shape: data.shape || this.config.defaultShape,
                        visualStyle: data.visualStyle || this.config.visualStyle,
                        intensity: 0.8,
                        colors: this.resolveConfiguredColors()
                    });
                });

                // Listen for active firework count responses
                socket.on('webgpu-fireworks:active-count-response', (data) => {
                    if (data && data.count !== undefined) {
                        this.cachedActiveFireworkCount = data.count;
                    }
                });

                // Clean up on disconnect
                socket.on('disconnect', () => {
                    this.clearPendingSuperfanFinalesForSocket(socket.id, 'renderer-disconnected');
                    this.clearPendingPreviewsForSocket(socket.id);
                    this.connectedSockets.delete(socket);
                    this.overlayTelemetry.delete(socket.id);
                    this.currentFps = this.getOverlayFps(false).fps;
                });
            };

            // Listen for new connections
            this.api.registerSocketConnection(this.fpsUpdateHandler);
        }
    }

    getOverlayFps(benchmark = false) {
        const cutoff = Date.now() - 5000;
        const readings = [];

        for (const [socketId, telemetry] of this.overlayTelemetry.entries()) {
            if (!telemetry || telemetry.updatedAt < cutoff) {
                this.overlayTelemetry.delete(socketId);
                continue;
            }
            if (telemetry.benchmark === benchmark && telemetry.visible !== false && telemetry.fps > 0) {
                readings.push(telemetry.fps);
            }
        }

        if (readings.length === 0) return { fps: 0, sampleCount: 0 };
        const fps = benchmark
            ? readings.reduce((sum, value) => sum + value, 0) / readings.length
            : Math.min(...readings);
        return { fps, sampleCount: readings.length };
    }

    getRendererStatus() {
        const cutoff = Date.now() - 5000;
        const current = [...this.overlayTelemetry.values()]
            .filter(item => item && item.updatedAt >= cutoff && item.benchmark !== true)
            .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (current) {
            const missingCapabilities = missingRendererCapabilities(current);
            const upgradeRequired = current.state === 'ready' && !rendererSupportsCapabilities(current);
            return {
                ...current,
                rendererProtocol: sanitizeRendererProtocol(current.rendererProtocol),
                capabilities: sanitizeRendererCapabilities(current.capabilities),
                missingCapabilities,
                upgradeRequired,
                upgradeReason: upgradeRequired ? RENDERER_UPGRADE_MESSAGE : null
            };
        }
        return {
            backend: 'webgpu',
            state: 'offline',
            rendererProtocol: 0,
            capabilities: [],
            missingCapabilities: [...RENDERER_CAPABILITIES],
            upgradeRequired: false,
            upgradeReason: null,
            adapter: null,
            format: null,
            gpuFrameMs: null,
            activeParticles: 0,
            droppedParticles: 0,
            audioStatus: 'unknown',
            audioBackend: 'none',
            loadedSounds: 0,
            failedSounds: 0,
            lastPlayed: null,
            lastAudioError: null,
            lastAudioProfile: null,
            crackleState: 'idle',
            activeVoices: { launch: 0, bang: 0, crackle: 0, total: 0 },
            audioEvictions: 0,
            missedAudioEvents: 0,
            audioPeak: null,
            timelineEvents: [],
            finaleActive: false,
            finaleId: null,
            finaleStyle: null,
            finaleName: null,
            finaleLength: null,
            finalePhase: 'idle',
            finaleQueueLength: 0,
            finaleError: null,
            previewActive: false,
            previewRequestId: null,
            previewScope: null,
            previewState: null,
            previewError: null,
            visualStyle: this.config?.visualStyle || 'premium-hybrid',
            reason: 'No active WebGPU overlay connected'
        };
    }

    getReadyRendererTelemetry() {
        const cutoff = Date.now() - 5000;
        return [...this.overlayTelemetry.values()].filter(telemetry => (
            telemetry && telemetry.updatedAt >= cutoff && telemetry.benchmark !== true &&
            telemetry.state === 'ready'
        ));
    }

    getFinaleRendererTargets({ readyOnly = false, requiredCapabilities = [] } = {}) {
        const cutoff = Date.now() - 5000;
        const socketsById = new Map([...this.connectedSockets].map(socket => [socket.id, socket]));
        return [...this.overlayTelemetry.entries()]
            .map(([rendererId, telemetry]) => ({ rendererId, telemetry, socket: socketsById.get(rendererId) }))
            .filter(target => (
                target.socket && target.socket.connected !== false && target.telemetry?.benchmark !== true &&
                (!readyOnly || (
                    target.telemetry?.state === 'ready' && target.telemetry?.updatedAt >= cutoff
                )) &&
                (requiredCapabilities.length === 0 ||
                    rendererSupportsCapabilities(target.telemetry, requiredCapabilities))
            ))
            .sort((left, right) => (
                Number(right.telemetry.updatedAt) - Number(left.telemetry.updatedAt) ||
                String(left.rendererId).localeCompare(String(right.rendererId))
            ));
    }

    createLegacyRendererFinalePayload(payload) {
        return {
            ...payload,
            showPlan: null,
            rendererFallback: 'legacy-outdated-overlay'
        };
    }

    dispatchFinalePayload(payload, options = {}) {
        const requiresFurryRenderer = options.requiresFurryRenderer === true;
        const testRequest = options.testRequest === true;
        let targets = this.getFinaleRendererTargets({
            readyOnly: testRequest || options.requiresRendererReady === true
        });
        if (testRequest) {
            if (requiresFurryRenderer) {
                targets = targets.filter(target => rendererSupportsCapabilities(target.telemetry));
            }
            targets = targets.slice(0, 1);
        }

        if (targets.length > 0) {
            // PluginAPI.emit broadcasts globally. Direct socket delivery is exclusive here so
            // each registered overlay receives exactly one capability-matched payload.
            const deliveredPayloads = [];
            let usedLegacyFallback = false;
            for (const target of targets) {
                const targetNeedsLegacyFallback = requiresFurryRenderer &&
                    !rendererSupportsCapabilities(target.telemetry);
                const targetPayload = targetNeedsLegacyFallback
                    ? this.createLegacyRendererFinalePayload(payload)
                    : payload;
                usedLegacyFallback ||= targetNeedsLegacyFallback;
                try {
                    if (target.socket.emit('webgpu-fireworks:finale', targetPayload) !== false) {
                        deliveredPayloads.push(targetPayload);
                    }
                } catch (error) {
                    this.api.log(
                        `[WEBGPU FIREWORKS] Finale dispatch to renderer ${target.rendererId} failed: ${error.message}`,
                        'warn'
                    );
                }
            }
            const returnPayload = deliveredPayloads.find(item => item.showPlan) || deliveredPayloads[0] || payload;
            return { submitted: deliveredPayloads.length > 0, payload: returnPayload, usedLegacyFallback };
        }

        const readyTelemetry = this.getReadyRendererTelemetry();
        const useGlobalLegacyFallback = !testRequest && requiresFurryRenderer &&
            readyTelemetry.length > 0 &&
            !readyTelemetry.some(telemetry => rendererSupportsCapabilities(telemetry));
        const globalPayload = useGlobalLegacyFallback
            ? this.createLegacyRendererFinalePayload(payload)
            : payload;
        return {
            submitted: this.api.emit('webgpu-fireworks:finale', globalPayload) !== false,
            payload: globalPayload,
            usedLegacyFallback: useGlobalLegacyFallback
        };
    }

    getPreviewRendererStatus() {
        const cutoff = Date.now() - 5000;
        const fresh = [...this.overlayTelemetry.values()].filter(item => (
            item && item.updatedAt >= cutoff && item.benchmark !== true
        ));
        const ready = fresh.filter(item => item.state === 'ready');
        const busy = fresh.filter(item => (
            item.finaleActive === true || item.previewActive === true || Number(item.finaleQueueLength) > 0
        ));
        return {
            freshRendererCount: fresh.length,
            readyRendererCount: ready.length,
            busyRendererCount: busy.length
        };
    }

    selectPreviewRenderer() {
        return this.selectPreviewRendererWithCapabilities([]);
    }

    selectPreviewRendererWithCapabilities(requiredCapabilities = []) {
        const cutoff = Date.now() - 5000;
        const socketsById = new Map([...this.connectedSockets].map(socket => [socket.id, socket]));
        const candidates = [...this.overlayTelemetry.entries()]
            .map(([rendererId, telemetry]) => ({ rendererId, telemetry, socket: socketsById.get(rendererId) }))
            .filter(candidate => (
                candidate.socket && candidate.socket.connected !== false &&
                candidate.telemetry?.updatedAt >= cutoff &&
                candidate.telemetry?.benchmark !== true &&
                candidate.telemetry?.state === 'ready' &&
                (requiredCapabilities.length === 0 ||
                    rendererSupportsCapabilities(candidate.telemetry, requiredCapabilities))
            ))
            .sort((left, right) => (
                Number(right.telemetry.updatedAt) - Number(left.telemetry.updatedAt) ||
                String(left.rendererId).localeCompare(String(right.rendererId))
            ));
        return candidates[0] || null;
    }

    previewDispatchError(code) {
        const definitions = {
            RENDERER_NOT_READY: [503, 'A fresh ready WebGPU renderer is required for preview.'],
            RENDERER_UPGRADE_REQUIRED: [426, RENDERER_UPGRADE_MESSAGE],
            FINALE_BUSY: [409, 'A finale or preview is active or queued on the selected renderer.'],
            INVALID_PREVIEW: [422, 'The renderer rejected the preview payload.'],
            PREVIEW_ACK_TIMEOUT: [503, 'The WebGPU renderer did not acknowledge the preview in time.']
        };
        const [status, message] = definitions[code] || definitions.INVALID_PREVIEW;
        return new ShowRepositoryError(code, status, message, {});
    }

    settlePendingPreview(requestId, outcome = {}) {
        const pending = this.pendingPreviewRequests.get(requestId);
        if (!pending) return false;
        clearTimeout(pending.timer);
        this.pendingPreviewRequests.delete(requestId);
        if (outcome.error) pending.reject(outcome.error);
        else pending.resolve(outcome.result);
        return true;
    }

    dispatchPreview(payload = {}) {
        const requiredCapabilities = previewRequiredRendererCapabilities(payload);
        const target = this.selectPreviewRendererWithCapabilities(requiredCapabilities);
        if (!target && requiredCapabilities.length > 0 && this.selectPreviewRenderer()) {
            return Promise.reject(this.previewDispatchError('RENDERER_UPGRADE_REQUIRED'));
        }
        if (!target) return Promise.reject(this.previewDispatchError('RENDERER_NOT_READY'));
        if (
            target.telemetry.finaleActive === true ||
            target.telemetry.previewActive === true ||
            Number(target.telemetry.finaleQueueLength) > 0
        ) {
            return Promise.reject(this.previewDispatchError('FINALE_BUSY'));
        }
        const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
        if (!requestId || this.pendingPreviewRequests.has(requestId)) {
            return Promise.reject(this.previewDispatchError('INVALID_PREVIEW'));
        }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.settlePendingPreview(requestId, {
                    error: this.previewDispatchError('PREVIEW_ACK_TIMEOUT')
                });
            }, this.previewAckTimeoutMs);
            timer.unref?.();
            this.pendingPreviewRequests.set(requestId, {
                requestId,
                rendererId: target.rendererId,
                socket: target.socket,
                timer,
                resolve,
                reject
            });
            const emitted = target.socket.emit('webgpu-fireworks:preview', {
                ...payload,
                rendererId: target.rendererId
            });
            if (emitted === false) {
                this.settlePendingPreview(requestId, {
                    error: this.previewDispatchError('RENDERER_NOT_READY')
                });
            }
        });
    }

    handlePreviewAck(data = {}, socket) {
        const requestId = typeof data.requestId === 'string' ? data.requestId : '';
        const pending = this.pendingPreviewRequests.get(requestId);
        if (!pending || !socket || pending.socket !== socket) return false;
        if (data.rendererId !== pending.rendererId || socket.id !== pending.rendererId) return false;
        const telemetry = this.overlayTelemetry.get(pending.rendererId);
        if (
            !telemetry || telemetry.updatedAt < Date.now() - 5000 ||
            telemetry.benchmark === true
        ) return false;

        if (data.accepted !== true && data.reason === 'RENDERER_NOT_READY') {
            return this.settlePendingPreview(requestId, {
                error: this.previewDispatchError('RENDERER_NOT_READY')
            });
        }
        if (telemetry.state !== 'ready') return false;

        if (data.accepted === true) {
            return this.settlePendingPreview(requestId, {
                result: { accepted: true, requestId, rendererId: pending.rendererId }
            });
        }
        const reason = ['RENDERER_NOT_READY', 'FINALE_BUSY', 'INVALID_PREVIEW'].includes(data.reason)
            ? data.reason
            : 'INVALID_PREVIEW';
        return this.settlePendingPreview(requestId, {
            error: this.previewDispatchError(reason)
        });
    }

    handlePreviewStatus(data = {}, socket) {
        if (!socket || data.rendererId !== socket.id || typeof data.requestId !== 'string') return false;
        const telemetry = this.overlayTelemetry.get(socket.id);
        if (!telemetry || telemetry.benchmark === true) return false;
        const state = ['running', 'completed', 'failed'].includes(data.state) ? data.state : null;
        if (!state) return false;
        this.overlayTelemetry.set(socket.id, {
            ...telemetry,
            previewActive: state === 'running',
            previewRequestId: state === 'running' ? data.requestId.slice(0, 160) : null,
            previewScope: state === 'running' && typeof data.scope === 'string' ? data.scope.slice(0, 20) : null,
            previewState: state,
            previewError: state === 'failed' && typeof data.error === 'string' ? data.error.slice(0, 300) : null,
            updatedAt: Date.now()
        });
        return true;
    }

    clearPendingPreviewsForSocket(socketId) {
        for (const pending of [...this.pendingPreviewRequests.values()]) {
            if (pending.rendererId !== socketId) continue;
            this.settlePendingPreview(pending.requestId, {
                error: this.previewDispatchError('RENDERER_NOT_READY')
            });
        }
    }

    clearAllPendingPreviews() {
        for (const pending of [...this.pendingPreviewRequests.values()]) {
            this.settlePendingPreview(pending.requestId, {
                error: this.previewDispatchError('RENDERER_NOT_READY')
            });
        }
    }

    /**
     * Migrate old data from app directory to user profile directory
     */
    async migrateOldData() {
        const oldUploadDir = path.join(__dirname, 'uploads');

        if (fs.existsSync(oldUploadDir)) {
            const oldFiles = fs.readdirSync(oldUploadDir).filter(f => f !== '.gitkeep');
            if (oldFiles.length > 0) {
                this.api.log(`📦 [FIREWORKS] Migrating ${oldFiles.length} files from old upload directory...`, 'info');

                // Ensure new directory exists
                if (!fs.existsSync(this.uploadDir)) {
                    fs.mkdirSync(this.uploadDir, { recursive: true });
                }

                // Copy files
                for (const file of oldFiles) {
                    const oldPath = path.join(oldUploadDir, file);
                    const newPath = path.join(this.uploadDir, file);
                    if (!fs.existsSync(newPath)) {
                        fs.copyFileSync(oldPath, newPath);
                    }
                }

                this.api.log(`✅ [FIREWORKS] Migrated uploads to: ${this.uploadDir}`, 'info');
                this.api.log('💡 [FIREWORKS] Old files are kept for safety. You can manually delete them after verifying the migration.', 'info');
            }
        }
    }

    /**
     * Import the stable Fireworks configuration exactly once. The renderer
     * capacity and backend settings remain WebGPU-owned.
     */
    async migrateFireworksSettings() {
        const migration = this.api.getConfig('migration') || {};
        if (Number(migration.fireworksConfigVersion) >= FIREWORKS_CONFIG_MIGRATION_VERSION) return false;

        const excluded = new Set([
            'renderer', 'gpuAcceleration', 'preserveDrawingBuffer', 'desynchronized',
            'maxTotalParticles', 'emergencyCleanupThreshold', 'enabled'
        ]);
        let imported = null;
        try {
            const raw = this.api.getDatabase().getSetting('plugin:fireworks:settings');
            const stableConfig = raw ? JSON.parse(raw) : null;
            if (stableConfig && typeof stableConfig === 'object' && !Array.isArray(stableConfig)) {
                imported = {};
                for (const [key, value] of Object.entries(stableConfig)) {
                    if (!excluded.has(key)) imported[key] = value;
                }
                for (const key of ['rocketSound', 'explosionSound']) {
                    if (typeof imported[key] === 'string') {
                        imported[key] = imported[key].replace('/plugins/fireworks/', '/plugins/webgpu-fireworks/');
                    }
                }
                this.config = normalizeConfig({ ...this.config, ...imported, renderer: 'webgpu' });
                this.saveConfig();
            }

            this.api.setConfig('migration', {
                ...migration,
                fireworksConfigVersion: FIREWORKS_CONFIG_MIGRATION_VERSION,
                importedAt: Date.now(),
                sourceFound: Boolean(imported)
            });
            this.api.log(
                imported
                    ? '[WEBGPU FIREWORKS] Imported compatible settings from Fireworks.'
                    : '[WEBGPU FIREWORKS] No saved Fireworks settings found; WebGPU defaults retained.',
                'info'
            );
            return Boolean(imported);
        } catch (error) {
            this.api.log(`[WEBGPU FIREWORKS] Settings import failed and will retry: ${error.message}`, 'warn');
            return false;
        }
    }

    /**
     * Load plugin configuration from database or defaults
     */
    loadConfig() {
        const savedConfig = this.api.getConfig('settings');

        const defaultConfig = {
            // Global settings
            enabled: true,
            renderer: 'webgpu',
            visualStyle: 'premium-hybrid',
            maxParticles: 1000,
            targetFps: 60,

            // Gift triggering
            giftTriggersEnabled: true,
            minGiftCoins: 1, // Minimum coin value to trigger fireworks

            // Combo system
            comboEnabled: true,
            comboTimeout: 10000, // ms
            comboMultiplierBase: 1.2,
            comboMaxMultiplier: 5.0,

            // Escalation system
            escalationEnabled: true,
            escalationThresholds: {
                small: 0,      // 0-99 coins
                medium: 100,   // 100-499 coins
                big: 500,      // 500-999 coins
                massive: 1000  // 1000+ coins
            },

            // Particle effects
            particleCount: {
                small: 30,
                medium: 60,
                big: 100,
                massive: 200
            },

            // Explosion shapes
            shapesEnabled: true,
            defaultShape: 'burst', // burst, heart, star, spiral, ring, custom
            randomShapeEnabled: false, // Enable random shape selection from active shapes
            activeShapes: ['burst'], // Array of active shapes for random selection
            giftShapeMappings: {}, // giftId -> shape

            // User avatar integration
            userAvatarEnabled: false, // Use user avatars as particles
            avatarParticleChance: 0.3, // Probability to use avatar vs. gift image (0-1)

            // Audio
            audioEnabled: true,
            rocketSound: '/plugins/webgpu-fireworks/audio/abschussgeraeusch.mp3',
            explosionSound: '/plugins/webgpu-fireworks/audio/explosion_small1.mp3',
            audioVolume: 0.7,
            crackleFrequency: 0.5,
            crackleVolume: 0.75,

            // Colors
            colorMode: 'gift', // 'gift', 'random', 'theme', 'rainbow'
            themeColors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],

            // Goal finale
            goalFinaleEnabled: true,
            goalFinaleIntensity: 3.0,
            goalFinaleStyle: 'auto',
            goalFinaleLength: 'medium',
            goalFinaleDuration: 18000, // Compatibility only
            superfanFinaleEnabled: true,
            superfanFinaleCooldownHours: 24,
            superfanFinaleIntensity: 3,
            superfanFinaleStyle: 'inherit',
            superfanFinaleLength: 'inherit',
            superfanEndCardDuration: 3000,
            superfanEndCardPosition: 'center',
            superfanEndCardSize: 'medium',
            superfanEndCardScale: 1,

            // Follower fireworks
            followerFireworksEnabled: false, // Enable fireworks for new followers
            followerRocketCount: 3, // Number of rockets per follower (1-10)
            followerShowAnimation: true, // Show thank you animation
            followerShowProfilePicture: true, // Show follower's profile picture
            followerAnimationDuration: 3000, // Duration of thank you animation in ms
            followerAnimationDelay: 3000, // Delay before showing animation (ms)
            followerAnimationPosition: 'center', // 'top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'
            followerAnimationSize: 'medium', // 'small', 'medium', 'large', 'custom'
            followerAnimationScale: 1.0, // Custom scale factor (0.5 - 2.0) when size is 'custom'
            followerAnimationStyle: 'gradient-purple', // 'gradient-purple', 'gradient-blue', 'gradient-gold', 'gradient-rainbow', 'neon', 'minimal'
            followerAnimationEntrance: 'scale', // 'scale', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'bounce', 'rotate'
            followerThankYouText: 'Thanks for the follow! 💙', // Thank you text shown in follower animation

            // Interactive triggers
            interactiveEnabled: false,
            clickTriggerEnabled: false,
            chatTriggerEnabled: false,
            chatTriggerKeywords: ['🎆', 'fireworks', 'boom'],

            // Random generator
            randomEnabled: false,
            randomInterval: 30000, // ms
            randomMinIntensity: 0.5,
            randomMaxIntensity: 1.5,

            // Performance
            toasterMode: false,
            trailsEnabled: true,
            trailLength: 10,
            glowEnabled: true,
            particleSizeRange: [4, 12],
            resolution: 1.0, // Legacy - kept for backward compatibility
            resolutionPreset: '1080p', // OBS Browser Source stays 1920x1080 by default
            internalMaxResolutionPreset: '4k', // Internal adaptive render ceiling
            internalMinResolutionPreset: '540p', // Internal adaptive render floor for OBS-safe load shedding
            orientation: 'landscape', // 'landscape' or 'portrait'
            adaptiveRenderScaleEnabled: true, // Keep OBS source size stable while scaling internal render resolution
            minRenderScale: 0.45,
            targetFps: 60,
            minFps: 24, // User can configure down to 24 FPS
            despawnFadeDuration: 3.0, // Long fade: pressure relief should look intentional, not abrupt

            // Gift popup
            giftPopupEnabled: true, // Show gift animation text
            giftPopupPosition: 'bottom', // 'top', 'middle', 'bottom', 'none'

            // Queue system - Lag prevention through rate limiting
            queueEnabled: false, // Enable queue system to limit fireworks per second
            maxRocketsPerSecond: 5, // Maximum number of fireworks per second (1-20)

            // Performance Limits (NEW) - Protect against freezes
            maxConcurrentFireworks: 12, // Maximum gleichzeitige Fireworks (1-20)
            maxTotalParticles: 8192, // Fixed WebGPU storage-pool ceiling
            emergencyCleanupThreshold: 10000, // Telemetry threshold; GPU free-list remains authoritative
            adaptivePerformance: true, // Aktiviere Adaptive Performance
            minTargetFps: 24, // Minimum FPS bevor Frame Skip (20-50)
            frameSkipEnabled: true, // Aktiviere Frame Skip bei Low FPS

            // Advanced
            gravity: 0.1,
            friction: 0.98,
            windEnabled: false,
            windStrength: 0.02
        };

        this.config = normalizeConfig({
            ...defaultConfig,
            ...(savedConfig || {})
        });

        this.COMBO_TIMEOUT = this.config.comboTimeout;
    }

    /**
     * Save plugin configuration to database
     */
    saveConfig() {
        this.api.setConfig('settings', this.config);
    }

    /**
     * Cache gift catalog for faster lookups
     */
    async cacheGiftCatalog() {
        try {
            const db = this.api.getDatabase();
            const gifts = db.getGiftCatalog();
            this.giftCatalogCache.clear();
            for (const gift of gifts) {
                this.giftCatalogCache.set(gift.id, gift);
            }
            this.api.log(`📦 [FIREWORKS] Cached ${gifts.length} gifts from catalog`, 'debug');
        } catch (error) {
            this.api.log(`⚠️ [FIREWORKS] Failed to cache gift catalog: ${error.message}`, 'warn');
        }
    }

    /**
     * Get gift info from cache or database
     */
    getGiftInfo(giftId) {
        if (this.giftCatalogCache.has(giftId)) {
            return this.giftCatalogCache.get(giftId);
        }

        // Fallback to database lookup
        try {
            const db = this.api.getDatabase();
            const gift = db.getGift(giftId);
            if (gift) {
                this.giftCatalogCache.set(giftId, gift);
            }
            return gift;
        } catch (error) {
            this.api.log(`⚠️ [FIREWORKS] Failed to get gift ${giftId}: ${error.message}`, 'warn');
            return null;
        }
    }

    /**
     * Register all HTTP routes
     */
    registerRoutes() {
        this.showApiController = new ShowApiController({
            getRepository: () => this.showRepository,
            getRepositoryError: () => this.showRepositoryLoadError,
            getPreviewRendererStatus: () => this.getPreviewRendererStatus(),
            getConfig: () => this.config,
            finaleShowPlanner: this.finaleShowPlanner,
            dispatchPreview: payload => this.dispatchPreview(payload),
            log: (message, level) => this.api.log(message, level)
        });
        this.showApiController.registerRoutes(this.api);

        // Serve plugin UI (settings page)
        this.api.registerRoute('get', '/webgpu-fireworks/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui', 'settings.html');
            res.sendFile(uiPath);
        });

        // Serve the standalone visual Show Designer.
        this.api.registerRoute('get', '/webgpu-fireworks/designer', (req, res) => {
            const designerPath = path.join(__dirname, 'ui', 'designer.html');
            res.sendFile(designerPath);
        });

        // Serve overlay
        this.api.registerRoute('get', '/webgpu-fireworks/overlay', (req, res) => {
            const overlayPath = path.join(__dirname, 'overlay.html');
            res.sendFile(overlayPath);
        });

        // Get configuration
        this.api.registerRoute('get', '/api/webgpu-fireworks/config', (req, res) => {
            try {
                res.json({ success: true, config: this.config });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error getting config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update configuration
        this.api.registerRoute('post', '/api/webgpu-fireworks/config', (req, res) => {
            try {
                const updates = req.body || {};
                this.config = normalizeConfig({ ...this.config, ...updates });
                this.saveConfig();

                // Restart random timer if relevant settings changed
                if (updates.randomEnabled !== undefined || updates.randomInterval !== undefined) {
                    this.stopRandomTimer();
                    if (this.config.randomEnabled) {
                        this.startRandomTimer();
                    }
                }

                // Notify overlays about config change
                this.api.emit('webgpu-fireworks:config-update', { config: this.config });

                res.json({ success: true, message: 'Configuration updated', config: this.config });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error updating config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get status
        this.api.registerRoute('get', '/api/webgpu-fireworks/status', (req, res) => {
            try {
                res.json({
                    success: true,
                    enabled: this.config.enabled,
                    comboStates: Object.fromEntries(this.comboState),
                    cachedGifts: this.giftCatalogCache.size,
                    renderer: this.getRendererStatus(),
                    requirements: {
                        obsBuild: 'https://github.com/Loggableim/obs-studio-webgpu',
                        webgpuMode: 'Auto',
                        allowedOrigin: `${req.protocol}://${req.get('host')}`,
                        fallback: 'none'
                    }
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Toggle enabled
        this.api.registerRoute('post', '/api/webgpu-fireworks/toggle', (req, res) => {
            try {
                const { enabled } = req.body || {};
                this.config.enabled = typeof enabled === 'boolean' ? enabled : !this.config.enabled;
                this.saveConfig();

                this.api.emit('webgpu-fireworks:toggle', { enabled: this.config.enabled });

                res.json({ success: true, enabled: this.config.enabled });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Trigger fireworks manually
        this.api.registerRoute('post', '/api/webgpu-fireworks/trigger', (req, res) => {
            try {
                const triggerOptions = normalizeFireworkTrigger(req.body || {}, this.config);

                this.triggerFirework({
                    ...triggerOptions,
                    reason: 'manual',
                    bypassEnabled: true  // Allow test triggers even when disabled
                });

                res.json({ success: true, message: 'Firework triggered' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Trigger finale
        this.api.registerRoute('post', '/api/webgpu-fireworks/finale', (req, res) => {
            try {
                const finaleRequest = { ...(req.body || {}) };
                delete finaleRequest.completionNotification;
                const result = this.triggerFinale({
                    ...finaleRequest,
                    bypassEnabled: true
                });
                if (result.accepted !== true) {
                    const status = result.code === 'RENDERER_UPGRADE_REQUIRED'
                        ? 426
                        : result.reason === 'renderer-not-ready' ? 503 : 409;
                    return res.status(status).json({
                        success: false,
                        accepted: false,
                        code: result.code || 'FINALE_REJECTED',
                        error: result.error || result.reason || 'Finale rejected'
                    });
                }
                const { showPlan, bursts, ...metadata } = result;
                return res.json({ success: true, message: 'Finale triggered', ...metadata });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test follower fireworks
        this.api.registerRoute('post', '/api/webgpu-fireworks/test-follower', (req, res) => {
            try {
                const { username, profilePictureUrl } = req.body;
                this.handleFollowerEvent({
                    uniqueId: username || 'TestFollower',
                    username: username || 'TestFollower',
                    profilePictureUrl: profilePictureUrl || null
                });
                res.json({ success: true, message: 'Follower fireworks triggered' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test Superfan finale
        this.api.registerRoute('post', '/api/webgpu-fireworks/test-superfan', (req, res) => {
            try {
                const requestedSettings = req.body?.settings;
                const testConfigInput = { ...(this.config || {}) };
                if (requestedSettings && typeof requestedSettings === 'object' && !Array.isArray(requestedSettings)) {
                    for (const key of SUPERFAN_FINALE_TEST_CONFIG_KEYS) {
                        if (Object.prototype.hasOwnProperty.call(requestedSettings, key)) {
                            testConfigInput[key] = requestedSettings[key];
                        }
                    }
                }
                const normalizedTestConfig = normalizeConfig(testConfigInput);
                const configOverride = {};
                for (const key of SUPERFAN_FINALE_TEST_CONFIG_KEYS) {
                    configOverride[key] = normalizedTestConfig[key];
                }
                const result = this.handleSuperfanEntry({
                    userId: 'test-superfan',
                    uniqueId: req.body?.username || 'TestSuperfan',
                    profilePictureUrl: req.body?.profilePictureUrl || null,
                    teamMemberLevel: 1
                }, {
                    authoritative: true,
                    bypassCooldown: true,
                    bypassEnabled: true,
                    configOverride
                });
                res.json({ success: result.accepted, ...result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Trigger random firework
        this.api.registerRoute('post', '/api/webgpu-fireworks/random', (req, res) => {
            try {
                this.triggerRandomFirework(true); // true = bypass enabled check
                res.json({ success: true, message: 'Random firework triggered' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get gift shape mappings
        this.api.registerRoute('get', '/api/webgpu-fireworks/gift-mappings', (req, res) => {
            try {
                res.json({
                    success: true,
                    mappings: this.config.giftShapeMappings
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Set gift shape mapping
        this.api.registerRoute('post', '/api/webgpu-fireworks/gift-mappings', (req, res) => {
            try {
                const { giftId, shape, colors, intensity, visualStyle } = normalizeGiftMapping(req.body || {});

                if (!giftId) {
                    return res.status(400).json({ success: false, error: 'giftId is required' });
                }

                this.config.giftShapeMappings[giftId] = {
                    shape: shape || 'burst',
                    colors: colors || null,
                    intensity: intensity || 1.0,
                    visualStyle: visualStyle || null
                };
                this.saveConfig();
                this.api.emit('webgpu-fireworks:config-update', { config: this.config });

                res.json({ success: true, message: 'Gift mapping updated' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/webgpu-fireworks/gift-mappings/:giftId', (req, res) => {
            try {
                const { giftId } = normalizeGiftMapping({ giftId: req.params.giftId });
                if (!giftId) return res.status(400).json({ success: false, error: 'giftId is required' });
                delete this.config.giftShapeMappings[giftId];
                this.saveConfig();
                this.api.emit('webgpu-fireworks:config-update', { config: this.config });
                return res.json({ success: true, message: 'Gift mapping removed' });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message });
            }
        });

        // Upload audio/video file
        this.api.registerRoute('post', '/api/webgpu-fireworks/upload', (req, res) => {
            this.upload.single('file')(req, res, (err) => {
                if (err) {
                    return res.status(500).json({ success: false, error: err.message });
                }

                if (!req.file) {
                    return res.status(400).json({ success: false, error: 'No file uploaded' });
                }

                const fileUrl = `/plugins/webgpu-fireworks/uploads/${req.file.filename}`;
                this.api.log(`📤 [FIREWORKS] File uploaded: ${req.file.filename}`, 'info');

                res.json({
                    success: true,
                    url: fileUrl,
                    filename: req.file.filename,
                    size: req.file.size
                });
            });
        });

        // List uploaded files
        this.api.registerRoute('get', '/api/webgpu-fireworks/uploads', (req, res) => {
            try {
                const files = fs.readdirSync(this.uploadDir)
                    .filter(f => f !== '.gitkeep')
                    .map(filename => ({
                        filename,
                        url: `/plugins/webgpu-fireworks/uploads/${filename}`,
                        size: fs.statSync(path.join(this.uploadDir, filename)).size
                    }));

                res.json({ success: true, files });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete uploaded file
        this.api.registerRoute('delete', '/api/webgpu-fireworks/uploads/:filename', (req, res) => {
            try {
                const sanitizedFilename = path.basename(req.params.filename);
                const filePath = path.join(this.uploadDir, sanitizedFilename);

                // Verify path is within upload directory
                if (!filePath.startsWith(this.uploadDir + path.sep)) {
                    return res.status(403).json({ success: false, error: 'Access denied' });
                }

                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ success: false, error: 'File not found' });
                }

                fs.unlinkSync(filePath);
                res.json({ success: true, message: 'File deleted' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Serve uploaded files
        const express = require('express');
        this.api.registerMiddleware('/plugins/webgpu-fireworks/uploads', express.static(this.uploadDir));

        // Serve audio files
        const audioDir = path.join(__dirname, 'audio');
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir, { recursive: true });
        }
        this.api.registerMiddleware('/plugins/webgpu-fireworks/audio', express.static(audioDir));

        // Benchmark API endpoints
        this.api.registerRoute('post', '/api/webgpu-fireworks/benchmark/set-preset', (req, res) => {
            try {
                const { preset } = req.body;
                if (!preset) {
                    return res.status(400).json({ success: false, error: 'Preset data required' });
                }

                // Temporarily apply preset without saving
                if (!this.benchmarkPreset) {
                    this.benchmarkPreset = { ...this.config };
                }
                this.config = normalizeConfig({ ...this.config, ...preset });

                // Notify overlay about config change
                this.api.emit('webgpu-fireworks:config-update', { config: this.config });

                res.json({ success: true, message: 'Preset applied for benchmark' });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error setting benchmark preset: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('get', '/api/webgpu-fireworks/benchmark/fps', (req, res) => {
            try {
                const telemetry = this.getOverlayFps(true);
                res.json({
                    success: true,
                    fps: telemetry.fps,
                    sampleCount: telemetry.sampleCount,
                    source: 'benchmark-overlay',
                    timestamp: Date.now()
                });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error getting FPS: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/webgpu-fireworks/benchmark/restore', (req, res) => {
            try {
                // Restore original config after benchmark
                if (this.benchmarkPreset) {
                    this.config = { ...this.benchmarkPreset };
                    this.benchmarkPreset = null;
                    this.api.emit('webgpu-fireworks:config-update', { config: this.config });
                }

                res.json({ success: true, message: 'Original config restored' });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error restoring config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Reset configuration to defaults
        this.api.registerRoute('post', '/api/webgpu-fireworks/config/reset', (req, res) => {
            try {
                this.api.setConfig('settings', null);
                this.loadConfig();
                this.api.emit('webgpu-fireworks:config-update', { config: this.config });
                // Restart random timer with new config
                this.stopRandomTimer();
                if (this.config.randomEnabled) {
                    this.startRandomTimer();
                }
                res.json({ success: true, message: 'Configuration reset to defaults', config: this.config });
            } catch (error) {
                this.api.log(`❌ [FIREWORKS] Error resetting config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    /**
     * Register TikTok event handlers
     */
    registerTikTokEventHandlers() {
        // Gift event - main trigger
        this.api.registerTikTokEvent('gift', (data) => {
            if (!this.config.enabled || !this.config.giftTriggersEnabled) return;

            this.handleGiftEvent(data);
        });

        // Goal reached event - trigger finale
        this.api.registerTikTokEvent('goal_reached', (data) => {
            if (!this.config.enabled || !this.config.goalFinaleEnabled) return;

            this.api.log(`🎯 [FIREWORKS] Goal reached! Triggering finale...`, 'info');
            this.triggerFinale({
                style: this.config.goalFinaleStyle,
                length: this.config.goalFinaleLength,
                intensity: this.config.goalFinaleIntensity,
                eventId: data && (data.eventId || data.id)
            });
        });

        // Follow event - new follower celebration
        this.api.registerTikTokEvent('follow', (data) => {
            this.api.log(`🎯 [FIREWORKS] Follow event received! Enabled: ${this.config.enabled}, FollowerFireworks: ${this.config.followerFireworksEnabled}`, 'info');
            this.api.log(`[FIREWORKS] Follow data:`, 'debug', data);

            if (!this.config.enabled || !this.config.followerFireworksEnabled) {
                this.api.log(`[FIREWORKS] Skipping follower fireworks (enabled: ${this.config.enabled}, followerEnabled: ${this.config.followerFireworksEnabled})`, 'debug');
                return;
            }

            this.handleFollowerEvent(data);
        });

        this.api.registerTikTokEvent('join', data => {
            this.handleSuperfanEntry(data, { authoritative: false });
        });

        this.api.registerTikTokEvent('subscribe', data => {
            this.handleSuperfanEntry(data, { authoritative: true });
        });

        this.api.registerTikTokEvent('superfan', data => {
            this.handleSuperfanEntry(data, { authoritative: true });
        });

        // Chat event - interactive trigger
        this.api.registerTikTokEvent('chat', (data) => {
            if (!this.config.enabled || !this.config.interactiveEnabled || !this.config.chatTriggerEnabled) return;

            this.handleChatTrigger(data);
        });

        this.api.log('✅ [FIREWORKS] TikTok event handlers registered', 'info');
    }

    /**
     * Handle gift event - core fireworks trigger logic
     */
    handleGiftEvent(data) {
        const repeatCount = Math.max(1, Number(data.repeatCount || data.combo || 1) || 1);
        const diamondCount = Number(data.diamondCount || data.diamond_count || 0) || 0;
        const providedCoins = Number(data.coins);
        const coins = Number.isFinite(providedCoins) && providedCoins > 0
            ? providedCoins
            : diamondCount * repeatCount;
        const giftId = data.giftId || data.gift_id;
        const userId = data.userId || data.uniqueId;
        const username = data.uniqueId || data.username || 'Unknown';
        const giftPictureUrl = data.giftPictureUrl || null;

        // Check minimum coins threshold
        if (coins < this.config.minGiftCoins) {
            return;
        }

        // Check concurrent firework limit
        const activeFireworks = this.getActiveFireworkCount();
        if (this.useLegacyGiftDropGuards && activeFireworks >= this.config.maxConcurrentFireworks) {
            this.api.log(`[FIREWORKS] Limit erreicht (${activeFireworks}/${this.config.maxConcurrentFireworks}), Gift übersprungen`, 'warn');
            return;
        }

        // Bei hoher Last: Nur große Gifts zulassen
        if (this.useLegacyGiftDropGuards && activeFireworks >= Math.floor(this.config.maxConcurrentFireworks * 0.6) && coins < 500) {
            this.api.log(`[FIREWORKS] Hohe Last (${activeFireworks}), kleines Gift (${coins} coins) übersprungen`, 'debug');
            return;
        }

        // Adapter payloads already provide total coins. Only synthesize totals
        // from diamondCount when the adapter did not send coins.
        const effectiveCoins = coins;

        // Get escalation tier
        const tier = this.getEscalationTier(effectiveCoins);

        // Get combo multiplier
        const comboMultiplier = this.updateComboState(userId, username);

        // Get gift-specific settings
        const giftSettings = this.config.giftShapeMappings[giftId] || {};
        const giftInfo = this.getGiftInfo(giftId);

        // Determine shape - support random selection from active shapes
        let shape = giftSettings.shape || this.config.defaultShape;
        if (this.config.randomShapeEnabled && this.config.activeShapes && this.config.activeShapes.length > 0) {
            shape = this.config.activeShapes[Math.floor(Math.random() * this.config.activeShapes.length)];
        }

        // Determine colors through the same contract used by tests, finales,
        // follows and random schedules. Gift mappings remain the top priority.
        const colors = this.resolveConfiguredColors(giftSettings.colors);

        // User avatar integration
        // When enabled, pass user avatar to engine which will mix it with gift images
        const userProfilePictureUrl = data.profilePictureUrl || data.userProfilePictureUrl || null;
        let avatarImage = null;
        if (this.config.userAvatarEnabled && userProfilePictureUrl) {
            // Always pass avatar if enabled and available
            // The engine will decide the actual particle mix ratio
            avatarImage = userProfilePictureUrl;
        }

        // Calculate final intensity
        const baseIntensity = giftSettings.intensity || 1.0;
        const tierMultiplier = this.getTierMultiplier(tier);
        const finalIntensity = baseIntensity * tierMultiplier * comboMultiplier;

        // Calculate particle count
        const tierProfiles = {
            small: { particles: 0.8, combo: 1 },
            medium: { particles: 1.0, combo: 1 },
            big: { particles: 1.45, combo: 2 },
            massive: { particles: 2.0, combo: 3 }
        };
        const tierProfile = tierProfiles[tier] || tierProfiles.medium;
        const baseParticles = this.config.particleCount[tier] || 50;
        const particleCount = Math.round(baseParticles * finalIntensity * tierProfile.particles);

        this.api.log(
            `🎆 [FIREWORKS] Gift from ${username}: ${coins} coins (x${repeatCount}), ` +
            `Tier: ${tier}, Combo: x${comboMultiplier.toFixed(1)}, ` +
            `Intensity: ${finalIntensity.toFixed(2)}`,
            'debug'
        );

        // Trigger the firework
        this.triggerFirework({
            type: 'gift',
            intensity: finalIntensity,
            shape: shape,
            colors: colors,
            positionMode: 'auto',
            visualStyle: giftSettings.visualStyle || this.config.visualStyle,
            giftId: giftId,
            giftImage: giftPictureUrl || (giftInfo ? giftInfo.image_url : null),
            userAvatar: avatarImage,
            particleCount: particleCount,
            tier: tier,
            username: username,
            coins: effectiveCoins,
            combo: Math.max(this.comboState.get(userId) || 1, tierProfile.combo),
            requestedParticleCount: particleCount,
            reason: 'gift'
        });
    }

    /**
     * Get escalation tier based on coin value
     */
    getEscalationTier(coins) {
        if (!this.config.escalationEnabled) return 'medium';

        const thresholds = this.config.escalationThresholds;

        if (coins >= thresholds.massive) return 'massive';
        if (coins >= thresholds.big) return 'big';
        if (coins >= thresholds.medium) return 'medium';
        return 'small';
    }

    /**
     * Get tier multiplier for intensity calculation
     */
    getTierMultiplier(tier) {
        const multipliers = {
            small: 0.5,
            medium: 1.0,
            big: 1.5,
            massive: 2.5
        };
        return multipliers[tier] || 1.0;
    }

    /**
     * Update combo state for a user and return current multiplier
     */
    updateComboState(userId, username) {
        if (!this.config.comboEnabled) return 1.0;

        const now = Date.now();
        const lastTime = this.lastGiftTime.get(userId) || 0;
        const timeSinceLastGift = now - lastTime;

        // Update last gift time
        this.lastGiftTime.set(userId, now);

        // Check if combo is still active
        if (timeSinceLastGift > this.COMBO_TIMEOUT) {
            // Reset combo
            this.comboState.set(userId, 1);
            return 1.0;
        }

        // Increment combo
        const currentCombo = (this.comboState.get(userId) || 0) + 1;
        this.comboState.set(userId, currentCombo);

        // Calculate multiplier (capped)
        const multiplier = Math.min(
            Math.pow(this.config.comboMultiplierBase, currentCombo - 1),
            this.config.comboMaxMultiplier
        );

        if (currentCombo > 1) {
            this.api.log(`🔥 [FIREWORKS] ${username} combo streak: ${currentCombo}x!`, 'info');
        }

        return multiplier;
    }

    /**
     * Generate random colors
     */
    generateRandomColors(count) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = Math.random() * 360;
            colors.push(`hsl(${hue}, 100%, 60%)`);
        }
        return colors;
    }

    /**
     * Generate evenly distributed rainbow colors
     */
    generateRainbowColors(count) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = (i / count) * 360;
            colors.push(`hsl(${hue}, 100%, 55%)`);
        }
        return colors;
    }

    resolveConfiguredColors(explicitColors = null) {
        if (Array.isArray(explicitColors) && explicitColors.length > 0) return explicitColors.slice(0, 12);
        if (this.config.colorMode === 'random') return this.generateRandomColors(3);
        if (this.config.colorMode === 'rainbow') return this.generateRainbowColors(5);
        const theme = Array.isArray(this.config.themeColors) ? this.config.themeColors.filter(Boolean).slice(0, 12) : [];
        return theme.length > 0 ? theme : ['#ffffff'];
    }

    /**
     * Start the random firework interval timer
     */
    startRandomTimer() {
        this.stopRandomTimer();
        const interval = Math.max(1000, Math.min(3600000, this.config.randomInterval || 30000));
        this.randomTimer = setInterval(() => this.triggerRandomFirework(), interval);
        this.api.log(`⏱️ [FIREWORKS] Random timer started (interval: ${interval}ms)`, 'debug');
    }

    /**
     * Stop the random firework interval timer
     */
    stopRandomTimer() {
        if (this.randomTimer) {
            clearInterval(this.randomTimer);
            this.randomTimer = null;
            this.api.log('⏱️ [FIREWORKS] Random timer stopped', 'debug');
        }
    }

    /**
     * Get active firework count - uses server-side counter (browser global not available server-side)
     */
    getActiveFireworkCount() {
        // Return server-side counter (accurate, no socket roundtrip needed)
        return this.activeFireworkCount;
    }

    /**
     * Get overlay/server health used by the stability trigger policy.
     */
    getTriggerHealth() {
        const telemetry = this.getOverlayFps(false);
        this.currentFps = telemetry.fps;
        return {
            currentFps: telemetry.fps,
            activeFireworkCount: this.getActiveFireworkCount(),
            queueDepth: this.queueTimestamps.length
        };
    }

    /**
     * Handle chat trigger
     */
    handleChatTrigger(data) {
        const message = (data.comment || data.message || '').toLowerCase();

        for (const keyword of this.config.chatTriggerKeywords) {
            if (message.includes(keyword.toLowerCase())) {
                this.triggerFirework({
                    type: 'chat',
                    intensity: 0.5,
                    shape: 'burst',
                    colors: this.resolveConfiguredColors(),
                    positionMode: 'auto',
                    username: data.uniqueId || data.username,
                    reason: 'chat'
                });
                break;
            }
        }
    }

    handleSuperfanEntry(data = {}, options = {}) {
        const authoritative = options.authoritative === true;
        const bypassCooldown = options.bypassCooldown === true;
        const effectiveConfig = options.configOverride
            ? normalizeConfig({ ...(this.config || {}), ...options.configOverride })
            : this.config;
        if (!effectiveConfig.enabled && options.bypassEnabled !== true) return { accepted: false, reason: 'disabled' };
        if (!effectiveConfig.superfanFinaleEnabled && options.bypassEnabled !== true) return { accepted: false, reason: 'feature-disabled' };
        if (!authoritative && !hasPaidSuperfanStatus(data)) {
            return { accepted: false, reason: 'not-superfan' };
        }

        const identities = normalizeSuperfanIdentityAliases(data);
        if (identities.length === 0) {
            this.api.log('[FIREWORKS] Superfan finale skipped: missing user identity', 'debug');
            return { accepted: false, reason: 'missing-identity' };
        }
        const pendingEventId = identities
            .map(alias => this.pendingSuperfanAliases.get(alias))
            .find(Boolean);
        if (pendingEventId) {
            return { accepted: false, reason: 'pending', eventId: pendingEventId };
        }

        const identity = this.superfanFinaleHistory.resolve(identities, { persistMigration: true }).canonical;
        const now = Date.now();
        if (!bypassCooldown && !this.superfanFinaleHistory.isEligible(
            identities,
            effectiveConfig.superfanFinaleCooldownHours,
            now
        )) return { accepted: false, reason: 'cooldown', identity };

        const rendererStatus = this.getRendererStatus();
        if (rendererStatus.state !== 'ready') {
            return { accepted: false, reason: 'renderer-not-ready', identity };
        }

        const username = data.uniqueId || data.username || data.nickname || 'Superfan';
        const completionNotification = normalizeCompletionNotification({
            username,
            usernameText: `Thank you for being a Superfan, ${username}!`,
            thankYouText: 'This firework was for you!',
            profilePictureUrl: data.profilePictureUrl || data.userProfilePictureUrl || null,
            duration: effectiveConfig.superfanEndCardDuration,
            position: effectiveConfig.superfanEndCardPosition,
            size: effectiveConfig.superfanEndCardSize,
            scale: effectiveConfig.superfanEndCardScale,
            style: effectiveConfig.followerAnimationStyle,
            entrance: effectiveConfig.followerAnimationEntrance
        });
        const upstreamEventId = [data.eventId, data.id]
            .map(value => String(value ?? '').trim())
            .find(Boolean);
        const eventId = upstreamEventId
            ? `superfan-event:${upstreamEventId.slice(0, 140)}`
            : `superfan:${identity}:${++this.superfanFinaleAttemptCounter}`;
        if (this.pendingSuperfanFinales.has(eventId)) {
            return { accepted: false, reason: 'event-id-pending', eventId };
        }
        const attempt = this.beginPendingSuperfanFinale({
            eventId,
            identities,
            identity,
            acceptedAt: now,
            bypassCooldown
        });

        let finale;
        try {
            const finaleStyle = effectiveConfig.superfanFinaleStyle === 'inherit'
                ? effectiveConfig.goalFinaleStyle
                : effectiveConfig.superfanFinaleStyle;
            const finaleLength = effectiveConfig.superfanFinaleLength === 'inherit'
                ? effectiveConfig.goalFinaleLength
                : effectiveConfig.superfanFinaleLength;
            finale = this.triggerFinale({
                style: finaleStyle,
                length: finaleLength,
                intensity: effectiveConfig.superfanFinaleIntensity,
                completionNotification,
                [SUPERFAN_COMPLETION_AUTHORITY]: true,
                [INTERNAL_FINALE_FALLBACK_STYLE]: effectiveConfig.goalFinaleStyle,
                eventId,
                bypassEnabled: options.bypassEnabled === true,
                ackRequested: true,
                requiresRendererReady: true
            });
        } catch (error) {
            this.clearPendingSuperfanFinale(eventId, 'submission-error');
            this.api.log(`[FIREWORKS] Superfan finale submission failed: ${error.message}`, 'warn');
            return { accepted: false, reason: 'submission-error', identity };
        }
        if (!finale.accepted) {
            this.clearPendingSuperfanFinale(eventId, finale.reason || 'finale-rejected');
            return { accepted: false, reason: finale.reason || 'finale-rejected', identity, finale };
        }

        const notificationAccepted = this.scheduleFollowerAnimation({
            username,
            profilePictureUrl: data.profilePictureUrl || data.userProfilePictureUrl || null,
            duration: effectiveConfig.followerAnimationDuration || 3000,
            position: effectiveConfig.followerAnimationPosition || 'center',
            size: effectiveConfig.followerAnimationSize || 'medium',
            scale: effectiveConfig.followerAnimationScale || 1,
            style: effectiveConfig.followerAnimationStyle || 'gradient-purple',
            entrance: effectiveConfig.followerAnimationEntrance || 'scale',
            thankYouText: 'Superfan joined, this firework is for you!'
        }, 0);
        if (!notificationAccepted) {
            this.clearPendingSuperfanFinale(eventId, 'notification-rejected');
            return { accepted: false, reason: 'notification-rejected', identity, finale };
        }
        attempt.notificationAccepted = true;
        this.completePendingSuperfanFinale(attempt);
        return {
            accepted: true,
            pending: this.pendingSuperfanFinales.has(eventId),
            eventId,
            identity,
            finale
        };
    }

    beginPendingSuperfanFinale({ eventId, identities, identity, acceptedAt, bypassCooldown }) {
        const telemetryCutoff = Date.now() - 5000;
        const targetSocketIds = new Set([...this.connectedSockets]
            .filter(socket => {
                const telemetry = this.overlayTelemetry.get(socket.id);
                return telemetry && telemetry.updatedAt >= telemetryCutoff &&
                    telemetry.benchmark !== true && telemetry.state === 'ready';
            })
            .map(socket => socket.id));
        const attempt = {
            eventId,
            identities,
            identity,
            acceptedAt,
            bypassCooldown,
            notificationAccepted: false,
            rendererAccepted: false,
            targetSocketIds,
            timer: null
        };
        attempt.timer = setTimeout(() => {
            this.clearPendingSuperfanFinale(eventId, 'ack-timeout');
        }, this.superfanFinaleAckTimeoutMs);
        attempt.timer.unref?.();
        this.pendingSuperfanFinales.set(eventId, attempt);
        for (const alias of identities) this.pendingSuperfanAliases.set(alias, eventId);
        return attempt;
    }

    clearPendingSuperfanFinale(eventId, reason = 'cleared') {
        const attempt = this.pendingSuperfanFinales.get(eventId);
        if (!attempt) return null;
        clearTimeout(attempt.timer);
        this.pendingSuperfanFinales.delete(eventId);
        for (const alias of attempt.identities) {
            if (this.pendingSuperfanAliases.get(alias) === eventId) this.pendingSuperfanAliases.delete(alias);
        }
        attempt.clearedReason = reason;
        return attempt;
    }

    clearPendingSuperfanFinalesForSocket(socketId, reason) {
        for (const attempt of [...this.pendingSuperfanFinales.values()]) {
            if (attempt.targetSocketIds.has(socketId)) {
                attempt.targetSocketIds.delete(socketId);
                if (attempt.targetSocketIds.size === 0) {
                    this.clearPendingSuperfanFinale(attempt.eventId, reason);
                }
            }
        }
    }

    completePendingSuperfanFinale(attempt) {
        if (!attempt || !attempt.notificationAccepted || !attempt.rendererAccepted) return false;
        if (this.pendingSuperfanFinales.get(attempt.eventId) !== attempt) return false;
        this.clearPendingSuperfanFinale(attempt.eventId, 'accepted');
        if (!attempt.bypassCooldown) {
            this.superfanFinaleHistory.markAccepted(attempt.identities, attempt.acceptedAt);
        }
        return true;
    }

    handleSuperfanFinaleAck(data = {}, socket = null) {
        const eventId = typeof data.eventId === 'string' ? data.eventId : '';
        const attempt = this.pendingSuperfanFinales.get(eventId);
        if (!attempt) return false;
        if (socket && attempt.targetSocketIds.size > 0 && !attempt.targetSocketIds.has(socket.id)) return false;
        if (data.accepted !== true) {
            if (socket && attempt.targetSocketIds.size > 0) {
                attempt.targetSocketIds.delete(socket.id);
                if (attempt.targetSocketIds.size > 0) return false;
            }
            this.clearPendingSuperfanFinale(eventId, data.reason || 'renderer-rejected');
            return false;
        }
        attempt.rendererAccepted = true;
        return this.completePendingSuperfanFinale(attempt);
    }

    scheduleFollowerAnimation(payload, delayMs = 0) {
        if (delayMs <= 0) {
            try {
                return this.api.emit('webgpu-fireworks:follower-animation', payload) !== false;
            } catch (error) {
                this.api.log(`[FIREWORKS] Follower animation emit failed: ${error.message}`, 'warn');
                return false;
            }
        }
        const timer = setTimeout(() => {
            this.notificationTimers.delete(timer);
            try {
                this.api.emit('webgpu-fireworks:follower-animation', payload);
            } catch (error) {
                this.api.log(`[FIREWORKS] Delayed follower animation emit failed: ${error.message}`, 'warn');
            }
        }, delayMs);
        this.notificationTimers.add(timer);
        return timer;
    }

    /**
     * Handle follow event - celebrate new follower with fireworks
     */
    handleFollowerEvent(data) {
        const username = data.uniqueId || data.username || data.nickname || 'Unknown';
        const profilePictureUrl = data.profilePictureUrl || data.userProfilePictureUrl || null;

        this.api.log(`👤 [FIREWORKS] New follower: ${username}! Launching ${this.config.followerRocketCount} rockets 🎆`, 'info');

        // Show thank you animation if enabled (with delay)
        if (this.config.followerShowAnimation) {
            const animationDelay = this.config.followerAnimationDelay || 3000;

            this.scheduleFollowerAnimation({
                username: username,
                profilePictureUrl: this.config.followerShowProfilePicture ? profilePictureUrl : null,
                duration: this.config.followerAnimationDuration || 3000,
                position: this.config.followerAnimationPosition || 'center',
                size: this.config.followerAnimationSize || 'medium',
                scale: this.config.followerAnimationScale || 1.0,
                style: this.config.followerAnimationStyle || 'gradient-purple',
                entrance: this.config.followerAnimationEntrance || 'scale',
                thankYouText: this.config.followerThankYouText || 'Thanks for the follow! 💙'
            }, animationDelay);
        }

        // Launch multiple rockets for the follower
        const rocketCount = Math.max(1, Math.min(10, this.config.followerRocketCount || 3));
        const shapes = this.config.activeShapes && this.config.activeShapes.length > 0
            ? this.config.activeShapes
            : ['heart', 'star', 'burst'];

        // Stagger the rockets slightly for visual effect
        for (let i = 0; i < rocketCount; i++) {
            setTimeout(() => {
                // Choose a nice shape
                const shape = shapes[Math.floor(Math.random() * shapes.length)];

                const colors = this.resolveConfiguredColors();

                this.triggerFirework({
                    type: 'follow',
                    intensity: 1.2, // Slightly more intense than normal
                    shape: shape,
                    colors: colors,
                    positionMode: 'auto',
                    particleCount: 80,
                    userAvatar: this.config.followerShowProfilePicture ? profilePictureUrl : null,
                    avatarRocketHead: this.config.followerShowProfilePicture === true && Boolean(profilePictureUrl),
                    avatarParticleChance: 0.5, // 50% chance for avatar particles to focus on follower
                    tier: 'medium',
                    username: username,
                    coins: 0,
                    combo: 1,
                    reason: 'follow'
                });
            }, i * 300); // 300ms delay between each rocket
        }
    }

    /**
     * Check if a firework should be allowed based on queue rate limiting
     * @returns {boolean} True if firework should be triggered, false if rate limited
     */
    shouldAllowFirework() {
        // If queue is disabled, allow all fireworks
        if (!this.config.queueEnabled) {
            return true;
        }

        const now = Date.now();
        const timeWindow = 1000; // 1 second window
        const maxPerSecond = Math.max(1, Math.min(20, this.config.maxRocketsPerSecond || 5));

        // Clean up old timestamps outside the time window
        this.queueTimestamps = this.queueTimestamps.filter(timestamp => now - timestamp < timeWindow);

        // Check if we've reached the rate limit
        if (this.queueTimestamps.length >= maxPerSecond) {
            this.api.log(
                `⏸️ [FIREWORKS] Rate limit reached (${this.queueTimestamps.length}/${maxPerSecond} per second). Firework skipped due to rate limit.`,
                'debug'
            );
            return false;
        }

        // Add current timestamp and allow the firework
        this.queueTimestamps.push(now);
        return true;
    }

    /**
     * Core firework trigger - emits to overlay
     */
    triggerFirework(options) {
        // Ensure options object exists
        options = normalizeFireworkTrigger(options || {}, this.config);

        // Allow bypass of enabled check for manual triggers (tests, API calls)
        if (!this.config.enabled && !options.bypassEnabled) return;

        // Check queue rate limiting (unless bypass is enabled)
        if (!options.bypassEnabled && !this.shouldAllowFirework()) {
            return;
        }

        const policyDecision = evaluateTriggerPolicy({
            trigger: options,
            config: this.config,
            health: this.getTriggerHealth()
        });

        if (!policyDecision.allowed) {
            this.api.log(`[FIREWORKS] Trigger dropped by stability policy: ${policyDecision.reason}`, 'debug');
            return;
        }

        const plan = this.spawnPlanner.plan({
            seed: options.seed,
            orientation: this.config.orientation,
            positionMode: options.positionMode,
            position: options.position,
            origin: options.origin
        });

        const payload = {
            id: Date.now() + Math.random().toString(36).substring(2, 11),
            timestamp: Date.now(),
            type: options.type || 'burst',
            intensity: options.intensity || 1.0,
            shape: this.config.shapesEnabled === false ? 'burst' : (options.shape || this.config.defaultShape),
            visualStyle: options.visualStyle || this.config.visualStyle,
            colors: this.resolveConfiguredColors(options.colors),
            positionMode: options.positionMode,
            position: plan.position,
            origin: plan.origin,
            seed: plan.seed,
            particleCount: policyDecision.particleCount || options.particleCount || 50,
            giftId: options.giftId || null,
            giftImage: options.giftImage || null,
            userAvatar: options.userAvatar || null,
            avatarRocketHead: options.avatarRocketHead === true,
            requestedParticleCount: options.requestedParticleCount || options.particleCount || null,
            tier: options.tier || 'medium',
            username: options.username || null,
            coins: options.coins || 0,
            combo: options.combo || 1,
            forceRocket: options.forceRocket === true,
            duration: options.duration || 2000,
            reason: options.reason || 'manual',

            // Audio settings
            playSound: options.playSound !== false && this.config.audioEnabled,
            rocketSound: this.config.rocketSound,
            explosionSound: this.config.explosionSound,
            audioVolume: this.config.audioVolume,
            crackleFrequency: this.config.crackleFrequency,
            crackleVolume: this.config.crackleVolume,
            crackleEnabled: typeof options.crackleEnabled === 'boolean' ? options.crackleEnabled : undefined,

            // Visual settings
            trailsEnabled: this.config.trailsEnabled,
            trailLength: this.config.trailLength,
            glowEnabled: this.config.glowEnabled,
            particleSizeRange: this.config.particleSizeRange,
            gravity: this.config.gravity,
            friction: this.config.friction,
            windEnabled: this.config.windEnabled,
            windStrength: this.config.windStrength,

            // Avatar settings
            avatarParticleChance: this.config.avatarParticleChance ?? 0.3,

            // Performance settings
            targetFps: this.config.targetFps || 60,
            minFps: this.config.minFps || 24,
            despawnFadeDuration: this.config.despawnFadeDuration || 3.0,
            adaptivePerformance: this.config.adaptivePerformance !== false,
            frameSkipEnabled: this.config.frameSkipEnabled !== false,

            // Gift popup settings
            giftPopupEnabled: this.config.giftPopupEnabled !== false,
            giftPopupPosition: this.config.giftPopupPosition || 'bottom'
        };

        // Server-side tracking: increment counter and auto-decrement after estimated lifetime.
        // Base lifetime: 3000ms minimum. Intensity multiplier: +2000ms per intensity unit.
        // Capped at 8000ms to avoid counter staying high for unusually long fireworks.
        this.activeFireworkCount++;
        const fireworkId = payload.id;
        const estimatedLifetime = Math.min(8000, 3000 + (payload.intensity || 1) * 2000);
        const timer = setTimeout(() => {
            this.activeFireworkCount = Math.max(0, this.activeFireworkCount - 1);
            this.activeFireworkTimers.delete(fireworkId);
        }, estimatedLifetime);
        this.activeFireworkTimers.set(fireworkId, timer);

        this.api.emit('webgpu-fireworks:trigger', payload);

        this.api.log(
            `🎆 [FIREWORKS] Triggered: ${payload.shape} @ (${payload.position.x.toFixed(2)}, ${payload.position.y.toFixed(2)}) ` +
            `intensity=${payload.intensity.toFixed(2)} particles=${payload.particleCount}${policyDecision.reduced ? ' reduced=true' : ''}`,
            'debug'
        );
    }

    /**
     * Trigger finale show (multiple simultaneous fireworks)
     */
    getPublishedCustomFinale(style, length) {
        if (!this.showRepository || this.showRepositoryLoadError) {
            const error = new Error('The custom show repository is unavailable.');
            error.code = this.showRepositoryLoadError?.code || 'REPOSITORY_UNAVAILABLE';
            throw error;
        }
        const definition = this.showRepository.getPublishedDefinition(style);
        if (!definition.variants || !Object.prototype.hasOwnProperty.call(definition.variants, length)) {
            const error = new Error(`The custom show does not define the ${length} variant.`);
            error.code = 'CUSTOM_VARIANT_UNAVAILABLE';
            throw error;
        }
        return definition;
    }

    triggerFinale(optionsOrIntensity, legacyDuration, legacyBypassEnabled = false) {
        const config = this.config || normalizeConfig();
        const isObjectCall = optionsOrIntensity !== null &&
            typeof optionsOrIntensity === 'object' &&
            !Array.isArray(optionsOrIntensity);
        let configuredFallbackStyle = config.goalFinaleStyle;
        let request;
        const isTestRequest = isObjectCall && optionsOrIntensity.testRequest === true;

        if (isObjectCall) {
            const options = optionsOrIntensity;
            const hasLegacyDuration = options.duration !== undefined && options.length === undefined;
            if (typeof options[INTERNAL_FINALE_FALLBACK_STYLE] === 'string') {
                configuredFallbackStyle = options[INTERNAL_FINALE_FALLBACK_STYLE];
            }
            const authorizedCompletionNotification = options[SUPERFAN_COMPLETION_AUTHORITY] === true
                ? options.completionNotification
                : null;
            request = {
                ...options,
                style: options.style === undefined || options.style === 'inherit'
                    ? config.goalFinaleStyle
                    : options.style,
                intensity: options.intensity === undefined
                    ? config.goalFinaleIntensity
                    : options.intensity
            };
            delete request.completionNotification;
            delete request[SUPERFAN_COMPLETION_AUTHORITY];
            delete request[INTERNAL_FINALE_FALLBACK_STYLE];
            if (authorizedCompletionNotification) {
                request.completionNotification = authorizedCompletionNotification;
            }
            if (!hasLegacyDuration) {
                request.length = options.length === undefined || options.length === 'inherit'
                    ? config.goalFinaleLength
                    : options.length;
            }
        } else {
            const hasLegacyDuration = legacyDuration !== undefined;
            request = {
                intensity: optionsOrIntensity === undefined
                    ? config.goalFinaleIntensity
                    : optionsOrIntensity,
                style: config.goalFinaleStyle,
                bypassEnabled: legacyBypassEnabled === true
            };
            if (hasLegacyDuration) {
                request.duration = legacyDuration;
            } else {
                request.length = config.goalFinaleLength;
            }
        }

        const finale = normalizeFinaleRequest(request);
        if (!config.enabled && !finale.bypassEnabled) {
            return { accepted: false, reason: 'disabled' };
        }

        const selection = resolveFinaleSelection({
            requestedStyle: finale.style,
            configuredStyle: configuredFallbackStyle,
            builtInStyles: FINALE_STYLES,
            isCustomStyle: isCustomFinaleStyleId,
            drawAuto: () => this.finaleShuffleBag.draw(),
            loadCustom: style => this.getPublishedCustomFinale(style, finale.length),
            warnUnavailable: (style, error) => {
                const reason = error?.code || error?.message || 'UNKNOWN_ERROR';
                this.api.log(
                    `[FIREWORKS] Custom finale ${style} is unavailable (${reason}); applying configured fallback.`,
                    'warn'
                );
            }
        });
        const resolvedStyle = selection.style;
        const id = finale.id || `finale-${Date.now()}-${finale.seed}-${this.finaleIdCounter++}`;
        const planOptions = {
            id,
            style: resolvedStyle,
            length: finale.length,
            orientation: config.orientation,
            intensity: finale.intensity,
            seed: finale.seed
        };
        const showPlan = selection.definition
            ? this.finaleShowPlanner.planDefinition(selection.definition, planOptions)
            : this.finaleShowPlanner.plan(planOptions);
        const bursts = showPlan.cues.flatMap(cue => cue.launches.map(launch => ({
            ...launch,
            beatAtMs: cue.beatAtMs,
            phase: cue.phase,
            formation: cue.formation
        })));

        const requiresFurryRenderer = resolvedStyle === 'furry-celebration';
        const readyRendererTelemetry = this.getReadyRendererTelemetry();
        const furryRendererReady = readyRendererTelemetry.some(telemetry => (
            rendererSupportsCapabilities(telemetry)
        ));
        if (isTestRequest && readyRendererTelemetry.length === 0) {
            return {
                accepted: false,
                reason: 'renderer-not-ready',
                code: 'RENDERER_NOT_READY',
                error: 'A fresh ready WebGPU renderer is required. Open or refresh the OBS browser source.'
            };
        }
        if (isTestRequest && requiresFurryRenderer && !furryRendererReady) {
            return {
                accepted: false,
                reason: 'renderer-upgrade-required',
                code: 'RENDERER_UPGRADE_REQUIRED',
                error: RENDERER_UPGRADE_MESSAGE
            };
        }

        this.api.log(
            `🎆 [FIREWORKS] FINALE! Style: ${resolvedStyle}, Length: ${finale.length}, ` +
            `Intensity: ${finale.intensity}, Duration: ${showPlan.durationMs}ms`,
            'info'
        );

        const payload = {
            accepted: true,
            id,
            eventId: id,
            type: 'finale',
            style: resolvedStyle,
            length: finale.length,
            intensity: finale.intensity,
            duration: showPlan.durationMs,
            durationMs: showPlan.durationMs,
            timestamp: Date.now(),
            seed: finale.seed,
            bypassEnabled: finale.bypassEnabled,
            showPlan,

            // Legacy spatial fallback for overlays that do not yet consume showPlan.
            burstCount: bursts.length,
            burstInterval: bursts.length > 1 ? showPlan.durationMs / (bursts.length - 1) : 0,
            bursts,
            visualStyle: config.visualStyle,

            // Show presets own the sound roles; users retain mute and master volume.
            playSound: config.audioEnabled,
            audioVolume: config.audioVolume,
            audioMuted: !config.audioEnabled,
            audioMasterVolume: config.audioVolume,
            audio: {
                muted: !config.audioEnabled,
                masterVolume: config.audioVolume
            },
            rocketSound: config.rocketSound,
            explosionSound: config.explosionSound
        };

        if (finale.completionNotification) {
            payload.completionNotification = finale.completionNotification;
        }

        if (request.ackRequested === true) {
            payload.ackRequested = true;
            payload.requiresRendererReady = request.requiresRendererReady === true;
        }

        const dispatch = this.dispatchFinalePayload(payload, {
            testRequest: isTestRequest,
            requiresFurryRenderer,
            requiresRendererReady: request.requiresRendererReady === true
        });
        if (dispatch.usedLegacyFallback) {
            this.api.log(
                `[WEBGPU FIREWORKS] ${RENDERER_UPGRADE_MESSAGE} Playing the legacy burst fallback for ${id}.`,
                'warn'
            );
        }
        if (!dispatch.submitted) {
            return { ...dispatch.payload, accepted: false, reason: 'submission-rejected' };
        }
        return dispatch.payload;
    }

    getAutoEligibleFinaleStyleIds() {
        if (this.showRepository && !this.showRepositoryLoadError) {
            try {
                return this.showRepository.getAutoEligibleStyleIds();
            } catch (error) {
                this.api.log(
                    `[FIREWORKS] Auto style repository lookup failed (${error?.code || error?.message || 'UNKNOWN_ERROR'}); ` +
                    'using built-in finales.',
                    'warn'
                );
            }
        }
        return [...FINALE_STYLES];
    }

    /**
     * Trigger random firework
     */
    triggerRandomFirework(bypassEnabled = false) {
        const shapes = this.getConfiguredShapes();
        const intensity = this.config.randomMinIntensity +
            Math.random() * (this.config.randomMaxIntensity - this.config.randomMinIntensity);

        this.triggerFirework({
            type: 'random',
            intensity: intensity,
            shape: shapes[Math.floor(Math.random() * shapes.length)],
            colors: this.resolveConfiguredColors(),
            positionMode: 'auto',
            reason: 'random',
            bypassEnabled: bypassEnabled
        });
    }

    getConfiguredShapes() {
        const activeShapes = Array.isArray(this.config.activeShapes) && this.config.activeShapes.length > 0
            ? this.config.activeShapes
            : ['burst'];
        return this.config.randomShapeEnabled
            ? activeShapes
            : [this.config.defaultShape || activeShapes[0] || 'burst'];
    }

    /**
     * Register flow actions for automation
     */
    registerFlowActions() {
        if (!this.api.registerFlowAction) {
            this.api.log('⚠️ [FIREWORKS] Flow system not available', 'warn');
            return;
        }

        // Trigger firework action
        this.api.registerFlowAction('webgpu_fireworks_trigger', {
            name: 'Trigger Firework',
            description: 'Launch a firework effect',
            icon: '🎆',
            category: 'effects',
            parameters: {
                shape: {
                    type: 'select',
                    label: 'Shape',
                    options: ['burst', 'heart', 'star', 'ring', 'spiral', 'paws'],
                    default: 'burst'
                },
                visualStyle: {
                    type: 'select',
                    label: 'Visual Style',
                    options: ['premium-hybrid', 'realistic', 'stylized-neon'],
                    default: 'premium-hybrid'
                },
                intensity: {
                    type: 'number',
                    label: 'Intensity',
                    min: 0.1,
                    max: 5.0,
                    step: 0.1,
                    default: 1.0
                },
                colors: {
                    type: 'text',
                    label: 'Colors (comma-separated)',
                    description: 'e.g., #ff0000, #00ff00, #0000ff',
                    default: ''
                }
            },
            execute: async (params) => {
                const colors = params.colors
                    ? params.colors.split(',').map(c => c.trim())
                    : null;

                this.triggerFirework({
                    shape: params.shape,
                    visualStyle: params.visualStyle || this.config.visualStyle,
                    intensity: params.intensity,
                    colors: colors,
                    positionMode: 'auto',
                    reason: 'flow'
                });
            }
        });

        // Trigger finale action
        this.api.registerFlowAction('webgpu_fireworks_finale', {
            name: 'Trigger Finale',
            description: 'Launch a multi-burst firework finale',
            icon: '🎇',
            category: 'effects',
            parameters: {
                intensity: {
                    type: 'number',
                    label: 'Intensity',
                    min: 1.0,
                    max: 10.0,
                    step: 0.5,
                    default: 3.0
                },
                duration: {
                    type: 'number',
                    label: 'Duration (ms)',
                    min: 1000,
                    max: 30000,
                    step: 1000,
                    default: 18000
                }
            },
            execute: async (params) => {
                this.triggerFinale(params.intensity, params.duration);
            }
        });

        this.api.log('✅ [FIREWORKS] Flow actions registered', 'info');
    }

    /**
     * Log registered routes
     */
    logRoutes() {
        this.api.log('📍 [FIREWORKS] Routes registered:', 'info');
        this.api.log('   - GET    /webgpu-fireworks/ui', 'info');
        this.api.log('   - GET    /webgpu-fireworks/designer', 'info');
        this.api.log('   - GET    /webgpu-fireworks/overlay', 'info');
        this.api.log('   - GET    /api/webgpu-fireworks/config', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/config', 'info');
        this.api.log('   - GET    /api/webgpu-fireworks/status', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/toggle', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/trigger', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/finale', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/test-follower', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/test-superfan', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/random', 'info');
        this.api.log('   - GET    /api/webgpu-fireworks/gift-mappings', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/gift-mappings', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/upload', 'info');
        this.api.log('   - GET    /api/webgpu-fireworks/uploads', 'info');
        this.api.log('   - DELETE /api/webgpu-fireworks/uploads/:filename', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/benchmark/set-preset', 'info');
        this.api.log('   - GET    /api/webgpu-fireworks/benchmark/fps', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/benchmark/restore', 'info');
        this.api.log('   - POST   /api/webgpu-fireworks/config/reset', 'info');
    }

    /**
     * Plugin API - Exposed for other plugins
     */

    /**
     * Trigger a firework programmatically
     * @param {string} type - Firework type (burst, heart, star, etc.)
     * @param {Object} payload - Trigger options
     */
    trigger(type, payload = {}) {
        this.triggerFirework({
            type: type,
            ...payload
        });
    }

    /**
     * Trigger firework for a specific gift
     * @param {number} giftId - TikTok gift ID
     * @param {Object} options - Additional options
     */
    triggerGift(giftId, options = {}) {
        const giftInfo = this.getGiftInfo(giftId);
        const giftSettings = this.config.giftShapeMappings[giftId] || {};

        this.triggerFirework({
            type: 'gift',
            shape: giftSettings.shape || this.config.defaultShape,
            colors: giftSettings.colors || null,
            intensity: giftSettings.intensity || 1.0,
            visualStyle: giftSettings.visualStyle || this.config.visualStyle,
            giftId: giftId,
            giftImage: giftInfo ? giftInfo.image_url : null,
            ...options
        });
    }

    /**
     * Get current configuration
     * @returns {Object} Current plugin configuration
     */
    getConfiguration() {
        return { ...this.config };
    }

    /**
     * Cleanup on plugin destroy
     */
    async destroy() {
        // Stop random timer
        this.stopRandomTimer();

        // Clear combo states
        this.comboState.clear();
        this.lastGiftTime.clear();

        // Clear queue timestamps
        this.queueTimestamps = [];

        // Clear active firework timers
        for (const timer of this.activeFireworkTimers.values()) {
            clearTimeout(timer);
        }
        this.activeFireworkTimers.clear();
        this.activeFireworkCount = 0;

        // Cancel delayed follower notifications
        for (const timer of this.notificationTimers) {
            clearTimeout(timer);
        }
        this.notificationTimers.clear();

        // Cancel pending Superfan acknowledgements without consuming cooldowns.
        for (const eventId of [...this.pendingSuperfanFinales.keys()]) {
            this.clearPendingSuperfanFinale(eventId, 'plugin-destroyed');
        }
        this.clearAllPendingPreviews();

        // PluginAPI owns the connection disposer and removes it on unload.
        this.fpsUpdateHandler = null;

        // Clean up tracked sockets
        if (this.connectedSockets) {
            this.connectedSockets.forEach(socket => {
                socket.removeAllListeners('webgpu-fireworks:fps-update');
                socket.removeAllListeners('webgpu-fireworks:register-overlay');
                socket.removeAllListeners('webgpu-fireworks:renderer-status');
                socket.removeAllListeners('webgpu-fireworks:finale-ack');
                socket.removeAllListeners('webgpu-fireworks:preview-ack');
                socket.removeAllListeners('webgpu-fireworks:preview-status');
                socket.removeAllListeners('webgpu-fireworks:active-count-response');
                socket.removeAllListeners('webgpu-fireworks:interactive-trigger');
            });
            this.connectedSockets.clear();
        }
        this.overlayTelemetry.clear();

        // Repository persistence outlives the plugin instance; clear only runtime references.
        this.showRepository = null;
        this.showRepositoryLoadError = null;
        this.showApiController = null;

        this.api.log('🎆 [FIREWORKS] Fireworks Superplugin destroyed', 'info');
    }
}

module.exports = FireworksPlugin;
