// ===========================================================================
// EMBEDDED NODE RUNTIME BOOTSTRAP
// Keeps module resolution stable when the server is started by a packaged
// launcher or another embedded Node runtime.
// ===========================================================================
const fs = require('fs');
const path = require('path');

if (process.env.ELECTRON === 'true' || process.env.ELECTRON_RUN_AS_NODE === '1') {
  const path = require('path');
  const Module = require('module');
  const nodeModulesPath = path.join(__dirname, 'node_modules');
  
  // Patch Module._nodeModulePaths for robust module resolution
  const originalNodeModulePaths = Module._nodeModulePaths;
  Module._nodeModulePaths = function(from) {
    const paths = originalNodeModulePaths.call(this, from);
    if (!paths.includes(nodeModulesPath)) {
      paths.unshift(nodeModulesPath);
    }
    return paths;
  };
  
  // Also add to current module's paths
  if (!module.paths.includes(nodeModulesPath)) {
    module.paths.unshift(nodeModulesPath);
  }
  
  // Update NODE_PATH for child processes
  const currentNodePath = process.env.NODE_PATH || '';
  if (!currentNodePath.includes(nodeModulesPath)) {
    process.env.NODE_PATH = currentNodePath 
      ? `${nodeModulesPath}${path.delimiter}${currentNodePath}`
      : nodeModulesPath;
  }
  
  if (process.env.DEBUG_MODULE_PATHS === 'true') {
    console.log('[Server Bootstrap] Module paths:', module.paths.slice(0, 5));
  }
}

// Load environment variables first
require('dotenv').config();

function loadClerkEnvFallback() {
    const exampleEnvPath = path.join(__dirname, '.env.example');
    if (!fs.existsSync(exampleEnvPath)) {
        return;
    }

    const currentKeys = [
        process.env.LTTH_STORE_CLERK_PUBLISHABLE_KEY,
        process.env.CLERK_PUBLISHABLE_KEY,
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        process.env.VITE_CLERK_PUBLISHABLE_KEY
    ].map((value) => String(value || '').trim());

    if (currentKeys.some(Boolean)) {
        return;
    }

    const fallbackKeys = new Set([
        'LTTH_STORE_CLERK_PUBLISHABLE_KEY',
        'CLERK_PUBLISHABLE_KEY',
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'VITE_CLERK_PUBLISHABLE_KEY'
    ]);

    const lines = fs.readFileSync(exampleEnvPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match || !fallbackKeys.has(match[1])) {
            continue;
        }

        const value = match[2].trim();
        if (value) {
            process.env[match[1]] = value;
        }
    }
}

loadClerkEnvFallback();

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { Adapter } = require('socket.io-adapter');
const multer = require('multer');
const crypto = require('crypto');

// Browser opening guard - prevents duplicate browser opens
let browserOpened = false;

// Import Core Modules
const Database = require('./modules/database');
const TikTokConnector = require('./modules/tiktok');
const AlertManager = require('./modules/alerts');
const { IFTTTEngine } = require('./modules/ifttt'); // IFTTT Engine (replaces old FlowEngine)
const { GoalManager } = require('./modules/goals');
const ConfigPathManager = require('./modules/config-path-manager');
const UserProfileManager = require('./modules/user-profiles');
const ConfigRepair = require('./modules/config-repair');
const { discoverLegacyConfigCandidates } = require('./modules/legacy-config-discovery');
const { shouldAutoReconnectOnStartup } = require('./modules/tiktok-auto-reconnect-policy');
// PERFORMANCE OPTIMIZATION: VDONinjaManager is loaded via plugin system, removed direct import
// const VDONinjaManager = require('./modules/vdoninja'); // PATCH: VDO.Ninja Integration

// PERFORMANCE OPTIMIZATION: Lazy-load SessionExtractor - only needed for specific API endpoints
let SessionExtractor;
let sessionExtractorInstance;
const getSessionExtractor = () => {
    if (!sessionExtractorInstance) {
        // Safety check: ensure dependencies are initialized
        if (typeof db === 'undefined' || typeof configPathManager === 'undefined') {
            throw new Error('SessionExtractor cannot be initialized: db or configPathManager not yet available');
        }
        try {
            if (!SessionExtractor) {
                SessionExtractor = require('./modules/session-extractor');
            }
            sessionExtractorInstance = new SessionExtractor(db, configPathManager);
            logger.info('🔐 Session Extractor initialized (lazy)');
        } catch (error) {
            logger.error('Failed to initialize SessionExtractor:', error.message);
            throw error;
        }
    }
    return sessionExtractorInstance;
};

// Import New Modules
const logger = require('./modules/logger');
const { CloudflaredBinaryManager } = require('./modules/cloudflared-binary-manager');
const {
    createPublicOverlayMiddleware,
    attachPublicSocketPolicy
} = require('./modules/public-overlay-access');
const {
    createPublicOverlayAdapter
} = require('./modules/public-overlay-socket-adapter');
const {
    registerOverlayTunnelRoutes
} = require('./modules/overlay-tunnel-routes');
const debugLogger = require('./modules/debug-logger');
const { apiLimiter, authLimiter, uploadLimiter, pluginLimiter, iftttLimiter } = require('./modules/rate-limiter');
const OBSWebSocket = require('./modules/obs-websocket');
const i18n = require('./modules/i18n');
const SubscriptionTiers = require('./modules/subscription-tiers');
const Leaderboard = require('./modules/leaderboard');
// PERFORMANCE OPTIMIZATION: Lazy-load Swagger - only when DISABLE_SWAGGER is not set
let setupSwagger;
const getSwaggerSetup = () => {
    if (!setupSwagger) {
        try {
            setupSwagger = require('./modules/swagger-config').setupSwagger;
        } catch (error) {
            console.error('Failed to load Swagger configuration:', error.message);
            // Return a no-op function to prevent crashes
            return () => {};
        }
    }
    return setupSwagger;
};
const PluginLoader = require('./modules/plugin-loader');
const { setupPluginRoutes } = require('./routes/plugin-routes');
const { setupDebugRoutes } = require('./routes/debug-routes');
const UpdateManager = require('./modules/update-manager');
const { Validators, ValidationError } = require('./modules/validators');
const getAutoStartManager = require('./modules/auto-start');
const PresetManager = require('./modules/preset-manager');
const BackupManager = require('./modules/backup-manager');
const CloudSyncEngine = require('./modules/cloud-sync');
const { createAdminAuth } = require('./modules/admin-auth');
const { obsCacheControl } = require('./modules/obs-cache-control');
const {
    createClerkFrontendProxy,
    createClerkMiddleware
} = require('./modules/clerk-store-auth');
const StoreSessionStore = require('./modules/store-session-store');
const { getAnimationFilePath } = require('./modules/animation-files');

function decodeClerkFrontendDomain(publishableKey) {
    try {
        let encoded = String(publishableKey || '').split('_')[2] || '';
        encoded = encoded.replace(/-/g, '+').replace(/_/g, '/');
        while (encoded.length % 4) encoded += '=';
        return Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
    } catch (error) {
        return '';
    }
}

function normalizeCspOrigin(value) {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function buildClerkCspSources(env = process.env) {
    const publishableKey = env.LTTH_STORE_CLERK_PUBLISHABLE_KEY ||
        env.CLERK_PUBLISHABLE_KEY ||
        env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
        env.VITE_CLERK_PUBLISHABLE_KEY;
    const frontendDomain = decodeClerkFrontendDomain(publishableKey);
    const sources = new Set([
        normalizeCspOrigin(env.CLERK_FRONTEND_API_URL || env.CLERK_FRONTEND_API || frontendDomain),
        'https://*.clerk.accounts.dev',
        'https://*.clerk.com'
    ]);

    if (frontendDomain.startsWith('clerk.')) {
        sources.add(normalizeCspOrigin(`accounts.${frontendDomain.slice('clerk.'.length)}`));
    }

    return Array.from(sources).filter(Boolean).join(' ');
}

const CLERK_CSP_SOURCES = buildClerkCspSources();

// ========== EXPRESS APP ==========
const app = express();
const server = http.createServer(app);
let networkManager;

// Trust proxy configuration for rate limiting when behind a reverse proxy
// Set to 1 for single proxy (nginx, cloudflare, etc.), or 'loopback' for localhost only
// This ensures req.ip returns the correct client IP address
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

app.use(createPublicOverlayMiddleware({ logger }));

// Clerk's frontend API proxy must run before body parsing so auth flows can
// forward request bodies without reserializing them.
app.use(createClerkFrontendProxy({ logger }));

// Clerk must be registered before other Express middleware so request auth state
// is available to protected routes.
app.use(createClerkMiddleware({ logger }));

// ========== SOCKET.IO CONFIGURATION ==========
// Configure Socket.IO with proper CORS and transport settings for OBS BrowserSource compatibility
const io = socketIO(server, {
    cors: {
        origin: function(origin, callback) {
            // Allow requests with no origin (like mobile apps, curl requests, or OBS BrowserSource)
            if (!origin) return callback(null, true);
            // Use NetworkManager for dynamic origin checking (PORT may not be resolved yet here,
            // so we use the default port 3000 as a conservative fallback; actual check happens
            // per-request in the Express CORS middleware where PORT is known).
            if (networkManager.isOriginAllowed(origin, PORT || 3000)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by Socket.IO CORS'));
            }
        },
        methods: ['GET', 'POST'],
        credentials: true
    },
    // Transport configuration for OBS BrowserSource (Chromium 118+)
    transports: ['websocket', 'polling'],
    // Allow upgrades from polling to websocket
    allowUpgrades: true,
    // Ping timeout (default 20000ms may be too short for OBS)
    pingTimeout: 60000,
    // Ping interval
    pingInterval: 25000,
    // Max HTTP buffer size (for large payloads)
    maxHttpBufferSize: 1e6,
    // Allow EIO 4 (Socket.IO 4.x)
    allowEIO3: true
});
io.adapter(createPublicOverlayAdapter(Adapter));
attachPublicSocketPolicy({ io, logger });
io.sockets.setMaxListeners(50);

// Middleware
// OBS Browser Sources can otherwise retain stale overlay shells, scripts, or API data.
// This must run before static and plugin route middleware so every delivery path is covered.
app.use(obsCacheControl);
// Avatar capability profiles can contain hundreds of scanned OSC parameters.
// Keep a bounded limit while allowing those legitimate local configuration saves.
app.use(express.json({ limit: '2mb' }));
// Locale API – serve translation JSON files
const localeRouter = require('./routes/locale');
app.use('/api/i18n/translations', localeRouter);

// CORS-Header mit Whitelist (let so dynamic ports can be added at startup)
// Populated dynamically by NetworkManager once PORT is resolved
let ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'null'
];

// IP Restriction Middleware (for "select" bind mode) – must be before CORS.
// Wrapped in a closure so networkManager is accessed at request-time, not at
// module-load time. networkManager (const) is initialized further below in this
// file; by the time the first request arrives (after server.listen()), it is
// already initialized and the TDZ has ended.
app.use((req, res, next) => networkManager.getIPRestrictionMiddleware()(req, res, next));

app.use((req, res, next) => {
    const origin = req.headers.origin;

    // Dynamic CORS via NetworkManager
    if (networkManager.isOriginAllowed(origin, PORT || 3000)) {
        if (origin) {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
        } else {
            // Requests ohne Origin (z.B. Server-to-Server)
            res.header('Access-Control-Allow-Origin', 'null');
        }
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-LTTH-Admin-Token');

    // Dashboard and plugin UIs need CSP policy
    const isDashboard = req.path === '/' || req.path.includes('/dashboard.html');
    const isPluginUI = req.path.includes('/goals/ui') || req.path.includes('/goals/overlay') ||
                       req.path.includes('/gift-milestone/ui') ||
                       req.path.includes('/plugins/') ||
                       req.path.includes('/openshock/') ||
                       req.path.includes('/viewer-xp/') ||
                       req.path.includes('/animazingpal/');
    const isChatangoEmbed = req.path.startsWith('/chatango/embed/');

    if (isChatangoEmbed) {
        // Chatango embed views require inline handlers from the third-party script.
        // Allow inline handlers only for this embed route to avoid global CSP relaxation.
        res.header('Content-Security-Policy',
            `default-src 'self'; ` +
            `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://st.chatango.com; ` +
            `script-src-elem 'self' 'unsafe-inline' https://st.chatango.com; ` +
            `style-src 'self' 'unsafe-inline'; ` +
            `img-src 'self' data: blob: https:; ` +
            `font-src 'self' data:; ` +
            `connect-src 'self' ws: wss: wss://ws.eulerstream.com https://www.eulerstream.com http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* https://myinstants-api.vercel.app https://www.myinstants.com wss://*.chatango.com https://*.chatango.com; ` +
            `media-src 'self' blob: data: https:; ` +
            `frame-src 'self' https://*.chatango.com https://vdo.ninja https://*.vdo.ninja; ` +
            `object-src 'none'; ` +
            `base-uri 'self'; ` +
            `form-action 'self'; ` +
            `frame-ancestors 'self' null;`
        );
    } else if (isDashboard || isPluginUI) {
        // Dashboard & Plugin UI CSP: Strict policy - no inline scripts allowed
        // NOTE: All HTML files (dashboard.html, plugin UIs, etc.) use EXTERNAL scripts
        // via <script src="..."> tags, NOT inline scripts. This ensures CSP compliance.
        // The script-src 'self' directive only allows scripts from the same origin,
        // which prevents XSS attacks via inline script injection.
        // 
        // SECURITY NOTE: 'unsafe-eval' is required for Chatango embed scripts which use eval()
        // 'unsafe-inline' in script-src-elem allows Chatango's inline JSON configuration tags
        // Hash values allow specific trusted inline scripts (Socket.IO, admin panel)
        // When hashes are present, 'unsafe-inline' is ignored for script execution (secure)
        // 'unsafe-hashes' allows specific inline event handlers (onclick, onchange) by hash
        res.header('Content-Security-Policy',
            `default-src 'self'; ` +
            `script-src 'self' 'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=' 'sha256-c4w6M/3j2U1Cx+Flf6JkYQY5MJP+YrJdgD4X3VC1Iho=' 'unsafe-eval' 'unsafe-hashes' ` +
            `'sha256-yTT/2KVTQpd5jHFCHbEeJzUylNrUFt3XI9cEFapDHD8=' 'sha256-Bqhs/2Ph5wewVirN87MMeK3kQ72brnPHI7XTMcQu9JA=' 'sha256-gqLyQrF2cS5exPbEQFCeMLr9iGXnKTNLkXEJM35fDYs=' ` +
            `'sha256-Jw5NghBkRZFrm6K45vNtyPk754rmysyQHbrzcGEEwQw=' 'sha256-SOoNvL5qrOUcMTnWe69ljOIhjtqC+26gMSCiSunJ864=' 'sha256-tyBLiSno8nu+gezcbY8m8hjujWw2qc4l0AIFkvBPxpU=' ` +
            `'sha256-56d7YS02VhJKaBsXX+A0KTvkume5cBUobKSNjsB5efc=' 'sha256-T/RK2SHYk5O+vuvnyy6xzIswVp1EXbv8qFZxkEFT52k=' 'sha256-xTS/Zd4fyhjnPqbFzjTX2bLT2Pwa6HdhMyiYThQ99Hs=' ` +
            `'sha256-5glbgXYCBUSMRmOhuA2aNQ4eOtGpx+JvzWrRF5yqu8w=' 'sha256-Zv9umbrL9etIXXf8h4Tn2ZxuKtNawP2FWmnDyd98SoQ=' 'sha256-CD1bRL7x9KCE4rebgiB2VJkyQhr1MatT/FO9KY9cVIw=' ` +
            `'sha256-8ma2zXygpXCcq3kiJv4rS0k32SKVcMSL3R+NJdxoVjo=' 'sha256-/tlEW4dBeTXnKAtOeyarIXN7OLveaWQ4JyoQJIEpsHQ=' 'sha256-xu3YClpWdm0JUcsxMW/B0+Lk3vovecXUA4vWkTi/mgA=' ` +
            `'sha256-JIPGJRCq83TqVvN3m7kkxylwHWo0b79G40zWfnZbrQw=' 'sha256-AdSuaVgmlfGgsCXjbD31dRAR3hljDmdiX0yJiFmG55A=' ` +
            `'sha256-K5uNRn2aLxLeK0fjnkWTYWN1J4Vdf92BTAKxjxfz/nQ=' 'sha256-3ymA831yuAiigbGNakMhiy5HDRlr4NxqwATjV/Nn01I=' ` +  // Additional inline event handlers
            `${CLERK_CSP_SOURCES} https://st.chatango.com; ` +  // Socket.IO hash + admin-panel hash + viewer-xp inline handlers + Chatango eval
            `script-src-elem 'self' 'unsafe-inline' ${CLERK_CSP_SOURCES} https://st.chatango.com https://cdnjs.cloudflare.com https://cdn.tailwindcss.com https://www.youtube.com; ` +  // Allow Clerk auth, Chatango inline script elements with JSON config + GSAP from cdnjs + TailwindCSS + YouTube IFrame API
            `style-src 'self' 'unsafe-inline'; ` +
            `img-src 'self' data: blob: https:; ` +
            `font-src 'self' data:; ` +
            `connect-src 'self' ${CLERK_CSP_SOURCES} ws: wss: wss://ws.eulerstream.com https://www.eulerstream.com http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* https://myinstants-api.vercel.app https://www.myinstants.com wss://*.chatango.com https://*.chatango.com; ` +
            `media-src 'self' blob: data: https:; ` +
            `frame-src 'self' ${CLERK_CSP_SOURCES} https://*.chatango.com https://vdo.ninja https://*.vdo.ninja https://www.youtube.com https://www.youtube-nocookie.com; ` +
            `object-src 'none'; ` +
            `base-uri 'self'; ` +
            `form-action 'self'; ` +
            `frame-ancestors 'self' null;`  // Allow OBS BrowserSource (null origin)
        );
    } else {
        // Strict CSP for other routes (including overlays for OBS)
        // 'unsafe-hashes' allows specific inline event handlers (onclick, onchange) by hash
        res.header('Content-Security-Policy',
            `default-src 'self'; ` +
            `script-src 'self' 'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=' 'sha256-c4w6M/3j2U1Cx+Flf6JkYQY5MJP+YrJdgD4X3VC1Iho=' 'unsafe-eval' 'unsafe-hashes' ` +
            `'sha256-yTT/2KVTQpd5jHFCHbEeJzUylNrUFt3XI9cEFapDHD8=' 'sha256-Bqhs/2Ph5wewVirN87MMeK3kQ72brnPHI7XTMcQu9JA=' 'sha256-gqLyQrF2cS5exPbEQFCeMLr9iGXnKTNLkXEJM35fDYs=' ` +
            `'sha256-Jw5NghBkRZFrm6K45vNtyPk754rmysyQHbrzcGEEwQw=' 'sha256-SOoNvL5qrOUcMTnWe69ljOIhjtqC+26gMSCiSunJ864=' 'sha256-tyBLiSno8nu+gezcbY8m8hjujWw2qc4l0AIFkvBPxpU=' ` +
            `'sha256-56d7YS02VhJKaBsXX+A0KTvkume5cBUobKSNjsB5efc=' 'sha256-T/RK2SHYk5O+vuvnyy6xzIswVp1EXbv8qFZxkEFT52k=' 'sha256-xTS/Zd4fyhjnPqbFzjTX2bLT2Pwa6HdhMyiYThQ99Hs=' ` +
            `'sha256-5glbgXYCBUSMRmOhuA2aNQ4eOtGpx+JvzWrRF5yqu8w=' 'sha256-Zv9umbrL9etIXXf8h4Tn2ZxuKtNawP2FWmnDyd98SoQ=' 'sha256-CD1bRL7x9KCE4rebgiB2VJkyQhr1MatT/FO9KY9cVIw=' ` +
            `'sha256-8ma2zXygpXCcq3kiJv4rS0k32SKVcMSL3R+NJdxoVjo=' 'sha256-/tlEW4dBeTXnKAtOeyarIXN7OLveaWQ4JyoQJIEpsHQ=' 'sha256-xu3YClpWdm0JUcsxMW/B0+Lk3vovecXUA4vWkTi/mgA=' ` +
            `'sha256-JIPGJRCq83TqVvN3m7kkxylwHWo0b79G40zWfnZbrQw=' 'sha256-AdSuaVgmlfGgsCXjbD31dRAR3hljDmdiX0yJiFmG55A=' ` +
            `'sha256-K5uNRn2aLxLeK0fjnkWTYWN1J4Vdf92BTAKxjxfz/nQ=' 'sha256-3ymA831yuAiigbGNakMhiy5HDRlr4NxqwATjV/Nn01I=' ` +  // Additional inline event handlers
            `https://st.chatango.com; ` +  // Socket.IO hash + admin-panel hash + viewer-xp inline handlers + Chatango eval
            `script-src-elem 'self' 'unsafe-inline' https://st.chatango.com https://cdnjs.cloudflare.com https://cdn.tailwindcss.com; ` +  // Allow Chatango inline script elements with JSON config + GSAP from cdnjs + TailwindCSS
            `style-src 'self' 'unsafe-inline'; ` +
            `img-src 'self' data: blob: https:; ` +
            `font-src 'self' data:; ` +
            `connect-src 'self' ws: wss: wss://ws.eulerstream.com https://www.eulerstream.com http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* https://myinstants-api.vercel.app https://www.myinstants.com wss://*.chatango.com https://*.chatango.com; ` +
            `media-src 'self' blob: data: https:; ` +
            `frame-src 'self' https://*.chatango.com https://vdo.ninja https://*.vdo.ninja; ` +
            `object-src 'none'; ` +
            `base-uri 'self'; ` +
            `form-action 'self'; ` +
            `frame-ancestors 'self' null;`  // Allow OBS BrowserSource (null origin)
        );
    }

    next();
});

const adminAuth = createAdminAuth();
app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    return adminAuth(req, res, next);
});

app.use(express.static(path.join(__dirname, 'public')));

// Serve GSAP library for overlays
app.use('/gsap', express.static(path.join(__dirname, 'node_modules', 'gsap', 'dist')));

// Serve local game rendering/physics libraries for OBS overlays.
app.use('/vendor/pixi', express.static(path.join(__dirname, 'node_modules', 'pixi.js', 'dist')));
app.use('/vendor/rapier2d', express.static(path.join(__dirname, 'node_modules', '@dimforge', 'rapier2d-compat')));

// Serve TTS UI files (legacy support)
app.use('/tts', express.static(path.join(__dirname, 'tts')));

// Serve soundboard static audio files
app.use('/sounds', express.static(path.join(__dirname, 'public', 'sounds')));

// i18n Middleware
app.use(i18n.init);

// ========== CONFIG PATH MANAGER INITIALISIEREN ==========
const configPathManager = new ConfigPathManager();
logger.info('📂 Config Path Manager initialized');
logger.info(`   Config directory: ${configPathManager.getConfigDir()}`);
logger.info(`   User configs: ${configPathManager.getUserConfigsDir()}`);
logger.info(`   User data: ${configPathManager.getUserDataDir()}`);
logger.info(`   Uploads: ${configPathManager.getUploadsDir()}`);

// ========== MULTER CONFIGURATION FOR FILE UPLOADS ==========
const uploadDir = path.join(configPathManager.getUploadsDir(), 'animations');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'animation-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /webm|gif|mp4|png|jpg|jpeg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only video and image files are allowed!'));
        }
    }
});


// ========== USER PROFILE INITIALISIEREN ==========
const profileManager = new UserProfileManager(configPathManager);

logger.info('🔧 Initializing User Profile Manager...');
const configRepair = new ConfigRepair(configPathManager, profileManager, logger);
configRepair.runStartupRepair({ repairProfileDatabases: false });

// Startup-Logik für User-Profile
let activeProfile = profileManager.getActiveProfile();
const oldDbPath = path.join(__dirname, 'database.db');

// Falls kein aktives Profil existiert
if (!activeProfile) {
    // Prüfe, ob eine alte database.db existiert (Migration)
    if (fs.existsSync(oldDbPath)) {
        logger.info('📦 Alte database.db gefunden - Migration wird durchgeführt...');
        const defaultUsername = 'default';
        profileManager.migrateOldDatabase(defaultUsername);
        profileManager.setActiveProfile(defaultUsername);
        activeProfile = defaultUsername;

        // Alte Datenbank umbenennen als Backup
        const backupPath = path.join(__dirname, 'database.db.backup');
        fs.renameSync(oldDbPath, backupPath);

        // WAL und SHM Dateien auch umbenennen
        const walPath = `${oldDbPath}-wal`;
        const shmPath = `${oldDbPath}-shm`;
        if (fs.existsSync(walPath)) {
            fs.renameSync(walPath, `${backupPath}-wal`);
        }
        if (fs.existsSync(shmPath)) {
            fs.renameSync(shmPath, `${backupPath}-shm`);
        }

        logger.info(`✅ Migration abgeschlossen - Profil "${defaultUsername}" erstellt`);
        logger.info(`   Alte Datenbank als Backup gespeichert: ${backupPath}`);
    } else {
        // Erstelle ein neues Default-Profil
        const defaultUsername = 'default';
        logger.info(`📝 Erstelle neues Profil: ${defaultUsername}`);
        profileManager.createProfile(defaultUsername);
        profileManager.setActiveProfile(defaultUsername);
        activeProfile = defaultUsername;
    }
}

logger.info(`👤 Aktives User-Profil: ${activeProfile}`);

// ========== INITIALIZATION STATE MANAGER ==========
const initState = require('./modules/initialization-state');

// ========== DATABASE INITIALISIEREN ==========
const dbPath = profileManager.getProfilePath(activeProfile);
let db;
try {
    db = new Database(dbPath, activeProfile); // Pass streamer_id as activeProfile
} catch (error) {
    logger.error(`❌ Database initialization failed for profile "${activeProfile}" at ${dbPath}: ${error.stack || error.message}`);
    process.exit(1);
}
logger.info(`✅ Database initialized: ${dbPath}`);
logger.info(`💡 All settings (including API keys) are stored here and will survive app updates!`);
logger.info(`👤 Streamer ID for scoped data: ${activeProfile}`);
const storeSessionStore = new StoreSessionStore(db);
initState.setDatabaseReady();

// ========== NETWORK MANAGER ==========
const NetworkManager = require('./modules/network-manager');
const cloudflaredBinaryManager = new CloudflaredBinaryManager({
    toolsRoot: path.join(configPathManager.getDefaultConfigDir(), 'runtime-tools'),
    logger
});
networkManager = new NetworkManager(db, {
    cloudflaredBinaryManager
});
const { bindAddress: BIND_ADDRESS } = networkManager.init();

// Ensure soundboard_enabled has a default value so that alerts.js and the
// soundboard plugin both agree on the initial state (prevents double audio
// on first start when the setting has never been explicitly saved).
if (!db.getSetting('soundboard_enabled')) {
    db.setSetting('soundboard_enabled', 'true');
}

// Store the loaded profile in memory to detect profile mismatches
const loadedProfile = activeProfile;

// ========== MODULE INITIALISIEREN ==========
const tiktok = new TikTokConnector(io, db, logger);
const alerts = new AlertManager(io, db, logger);
const goals = new GoalManager(db, io, logger);

// Initialize IFTTT Engine with services (replaces old FlowEngine)
const axios = require('axios');
const iftttServices = {
    io,
    db,
    alertManager: alerts,
    axios,
    fs: require('fs').promises,
    path: require('path'),
    safeDir: path.join(configPathManager.getUserDataDir(), 'flow_logs')
};
const iftttEngine = new IFTTTEngine(db, logger, iftttServices);
logger.info('⚡ IFTTT Engine initialized (replaces FlowEngine)');
iftttEngine.init().catch(err => logger.error('❌ IFTTT Engine init error:', err));

// PERFORMANCE OPTIMIZATION: Session Extractor is now lazy-loaded
// It will be initialized on first use via getSessionExtractor()
// This saves ~50-100ms at startup for users who don't use session extraction

// New Modules
const obs = new OBSWebSocket(db, io, logger);
const subscriptionTiers = new SubscriptionTiers(db, io, logger);
const leaderboard = new Leaderboard(db, io, activeProfile); // Pass streamer_id as activeProfile
logger.info(`✅ Leaderboard initialized with streamer scope: ${activeProfile}`);

// Plugin-System initialisieren
// A docs capture may mount one throwaway plugin fixture. Normal LTTH launches
// always retain the shipped plugin directory.
const docsCapturePluginDir = process.env.LTTH_DOCS_CAPTURE === 'true'
    ? process.env.LTTH_DOCS_CAPTURE_PLUGIN_DIR
    : '';
const pluginsDir = docsCapturePluginDir
    ? path.resolve(docsCapturePluginDir)
    : path.join(__dirname, 'plugins');
const pluginLoader = new PluginLoader(pluginsDir, app, io, db, logger, configPathManager, activeProfile);
logger.info('🔌 Plugin Loader initialized');

// Set TikTok module reference for dynamic event registration
pluginLoader.setTikTokModule(tiktok);

// Set IFTTT engine reference for dynamic IFTTT component registration
pluginLoader.setIFTTTEngine(iftttEngine);
iftttEngine.services.pluginLoader = pluginLoader;
iftttEngine.services.obs = obs;

// Initialise the BackupManager and wire it to the PluginLoader
const packageVersion = (() => {
    try { return require('./package.json').version; } catch { return 'unknown'; }
})();
const backupManager = new BackupManager({
    db,
    configPathManager,
    pluginLoader,
    logger,
    appVersion: packageVersion,
    activeProfile
});
pluginLoader.setBackupManager(backupManager);
logger.info('💾 Backup Manager initialized');

// Add pluginLoader to IFTTT services so actions can access plugins
iftttServices.pluginLoader = pluginLoader;

// PluginLoader an AlertManager übergeben (um doppelte Sounds zu vermeiden)
alerts.setPluginLoader(pluginLoader);

// Update-Manager initialisieren (mit Fehlerbehandlung)
let updateManager;
try {
    updateManager = new UpdateManager(logger);
    logger.info(`Update Manager initialized (${updateManager.isGitRepo ? 'git updates enabled' : 'git updates unavailable'})`);
} catch (error) {
    logger.warn(`⚠️  Update Manager konnte nicht initialisiert werden: ${error.message}`);
    logger.info('   Update-Funktionen sind nicht verfügbar, aber der Server läuft normal weiter.');
    // Erstelle einen Dummy-Manager für API-Kompatibilität
    updateManager = {
        currentVersion: '1.0.3',
        isGitRepo: false,
        checkForUpdates: async () => ({ success: true, disabled: true, available: false, error: 'Auto-update disabled' }),
        performUpdate: async () => ({ success: false, disabled: true, error: 'Auto-update disabled' }),
        startAutoCheck: () => {},
        stopAutoCheck: () => {}
    };
}

// Auto-Start Manager initialisieren
const autoStartManager = getAutoStartManager();
logger.info('🚀 Auto-Start Manager initialized');

// Preset-Manager initialisieren
const presetManager = new PresetManager(db.db);
logger.info('📦 Preset Manager initialized');

// Cloud-Sync-Engine initialisieren
const cloudSync = new CloudSyncEngine(db.db, configPathManager);
logger.info('☁️  Cloud Sync Engine initialized');

logger.info('✅ All modules initialized');

// ========== SWAGGER DOCUMENTATION ==========
// PERFORMANCE OPTIMIZATION: Swagger is conditionally loaded
// Set DISABLE_SWAGGER=true to skip Swagger initialization (~50ms savings)
if (process.env.DISABLE_SWAGGER !== 'true') {
    getSwaggerSetup()(app);
    logger.info('📚 Swagger API Documentation available at /api-docs');
} else {
    logger.info('📚 Swagger API Documentation disabled (DISABLE_SWAGGER=true)');
}

// ========== PLUGIN ROUTES ==========
setupPluginRoutes(app, pluginLoader, apiLimiter, uploadLimiter, logger, io, pluginLimiter, {
    profileId: activeProfile,
    storeSessionStore,
    closedStore: true
});

// ========== DEBUG ROUTES ==========
setupDebugRoutes(app, debugLogger, logger);

// ========== WIKI ROUTES ==========
const wikiRoutes = require('./routes/wiki-routes');
app.use('/api/wiki', wikiRoutes);

// NOTE: Plugin static files middleware will be registered AFTER plugins are loaded
// to ensure plugin-registered routes take precedence over static file serving

// ========== UPDATE ROUTES ==========

// ========== I18N API ROUTES ==========

/**
 * GET /api/i18n/translations - Get translations for a locale
 */
app.get('/api/i18n/translations', (req, res) => {
    try {
        const locale = req.query.locale || 'en';
        const translations = i18n.getAllTranslations(locale);
        
        res.json({
            success: true,
            locale,
            translations
        });
    } catch (error) {
        logger.error('Error getting translations:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/i18n/locales - Get available locales
 */
app.get('/api/i18n/locales', (req, res) => {
    try {
        const locales = i18n.getAvailableLocales();
        res.json({
            success: true,
            locales
        });
    } catch (error) {
        logger.error('Error getting locales:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/i18n/locale - Set current locale
 */
app.post('/api/i18n/locale', (req, res) => {
    try {
        const { locale } = req.body;
        
        if (!locale) {
            return res.status(400).json({
                success: false,
                error: 'Locale is required'
            });
        }
        
        const success = i18n.setLocale(locale);
        
        if (success) {
            res.json({
                success: true,
                locale: i18n.getLocale()
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Locale not found'
            });
        }
    } catch (error) {
        logger.error('Error setting locale:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== UPDATE API ROUTES ==========

/**
 * GET /api/update/check - Check for GitHub releases and Git-backed updates
 */
app.get('/api/update/check', apiLimiter, async (req, res) => {
    try {
        const updateInfo = await updateManager.checkForUpdates();
        res.json(updateInfo);
    } catch (error) {
        logger.error(`Update check failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/update/current - Gibt die aktuelle Version zurück
 */
app.get('/api/update/current', apiLimiter, (req, res) => {
    res.json({
        success: true,
        version: updateManager.currentVersion
    });
});

/**
 * POST /api/update/download - Apply the latest Git-backed update
 */
app.post('/api/update/download', authLimiter, async (req, res) => {
    try {
        const result = await updateManager.performUpdate();
        const status = result.disabled ? 403 : result.success ? 200 : 409;
        res.status(status).json(result);
    } catch (error) {
        logger.error(`Update download failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/update/instructions - Git update instructions
 */
app.get('/api/update/instructions', apiLimiter, (req, res) => {
    const instructions = {
        method: 'git',
        steps: [
            'Make sure the working tree is clean before updating.',
            'Use the Update button or run `git pull --ff-only` in the repository root.',
            'Restart the backend after the update completes.'
        ]
    };

    res.json({
        success: true,
        instructions
    });
});

/**
 * GET /CHANGELOG.md - Serves the changelog file
 */
app.get('/CHANGELOG.md', apiLimiter, (req, res) => {
    const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
    res.sendFile(changelogPath, (err) => {
        if (err) {
            logger.error(`Failed to serve CHANGELOG.md: ${err.message}`);
            res.status(404).send('Changelog not found');
        }
    });
});

// ========== AUTO-START ROUTES ==========

/**
 * GET /api/autostart/status - Gibt Auto-Start Status zurück
 */
app.get('/api/autostart/status', apiLimiter, async (req, res) => {
    try {
        const status = await autoStartManager.getStatus();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        logger.error(`Auto-start status check failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/autostart/toggle - Aktiviert/Deaktiviert Auto-Start
 */
app.post('/api/autostart/toggle', authLimiter, async (req, res) => {
    try {
        const { enabled, hidden } = req.body;

        // Validate input
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'enabled must be a boolean'
            });
        }

        const result = await autoStartManager.toggle(enabled, hidden || false);

        if (result) {
            logger.info(`Auto-start ${enabled ? 'enabled' : 'disabled'} (hidden: ${hidden})`);
            res.json({
                success: true,
                enabled,
                hidden: hidden || false
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to toggle auto-start'
            });
        }
    } catch (error) {
        logger.error(`Auto-start toggle failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/autostart/platform - Gibt Plattform-Informationen zurück
 */
app.get('/api/autostart/platform', apiLimiter, (req, res) => {
    try {
        const platformInfo = autoStartManager.getPlatformInfo();
        res.json({
            success: true,
            ...platformInfo,
            supported: autoStartManager.isSupported()
        });
    } catch (error) {
        logger.error(`Platform info failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== PRESET ROUTES ==========

/**
 * POST /api/presets/export - Exportiert aktuelle Konfiguration
 */
app.post('/api/presets/export', authLimiter, async (req, res) => {
    try {
        const options = {
            name: req.body.name || 'My Preset',
            description: req.body.description || '',
            author: req.body.author || 'Unknown',
            includeSettings: req.body.includeSettings !== false,
            includeFlows: req.body.includeFlows !== false,
            includeAlerts: req.body.includeAlerts !== false,
            includeGiftSounds: req.body.includeGiftSounds !== false,
            includeVoiceMappings: req.body.includeVoiceMappings !== false,
            includePluginConfigs: req.body.includePluginConfigs !== false,
        };

        const preset = await presetManager.exportPreset(options);

        logger.info(`Preset exported: ${preset.metadata.name}`);
        res.json({
            success: true,
            preset
        });
    } catch (error) {
        logger.error(`Preset export failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/presets/import - Importiert eine Konfiguration
 */
app.post('/api/presets/import', authLimiter, async (req, res) => {
    try {
        const { preset, options } = req.body;

        if (!preset) {
            return res.status(400).json({
                success: false,
                error: 'No preset data provided'
            });
        }

        const importOptions = {
            overwrite: options?.overwrite || false,
            createBackup: options?.createBackup !== false,
            includeSettings: options?.includeSettings !== false,
            includeFlows: options?.includeFlows !== false,
            includeAlerts: options?.includeAlerts !== false,
            includeGiftSounds: options?.includeGiftSounds !== false,
            includeVoiceMappings: options?.includeVoiceMappings !== false,
            includePluginConfigs: options?.includePluginConfigs !== false,
        };

        const result = await presetManager.importPreset(preset, importOptions);

        logger.info(`Preset imported: ${preset.metadata?.name || 'Unknown'}`, {
            imported: result.imported,
            errors: result.errors
        });

        res.json({
            success: result.success,
            imported: result.imported,
            errors: result.errors
        });
    } catch (error) {
        logger.error(`Preset import failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== CLOUD SYNC ROUTES ==========

/**
 * GET /api/cloud-sync/status - Gibt Cloud-Sync Status zurück
 */
app.get('/api/cloud-sync/status', apiLimiter, (req, res) => {
    try {
        const status = cloudSync.getStatus();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        logger.error(`Cloud sync status check failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/cloud-sync/enable - Aktiviert Cloud-Sync mit angegebenem Pfad
 */
app.post('/api/cloud-sync/enable', authLimiter, async (req, res) => {
    try {
        const { cloudPath } = req.body;

        if (!cloudPath) {
            return res.status(400).json({
                success: false,
                error: 'Cloud path is required'
            });
        }

        // Validate cloud path
        const validation = cloudSync.validateCloudPath(cloudPath);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.error
            });
        }

        const result = await cloudSync.enable(cloudPath);
        logger.info(`Cloud sync enabled with path: ${cloudPath}`);
        
        res.json({
            success: true,
            message: 'Cloud sync enabled successfully',
            ...cloudSync.getStatus()
        });
    } catch (error) {
        logger.error(`Cloud sync enable failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/cloud-sync/disable - Deaktiviert Cloud-Sync
 */
app.post('/api/cloud-sync/disable', authLimiter, async (req, res) => {
    try {
        const result = await cloudSync.disable();
        logger.info('Cloud sync disabled');
        
        res.json({
            success: true,
            message: 'Cloud sync disabled successfully',
            ...cloudSync.getStatus()
        });
    } catch (error) {
        logger.error(`Cloud sync disable failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/cloud-sync/manual-sync - Führt manuellen Sync durch
 */
app.post('/api/cloud-sync/manual-sync', authLimiter, async (req, res) => {
    try {
        const result = await cloudSync.manualSync();
        logger.info('Manual cloud sync completed');
        
        res.json({
            success: true,
            message: 'Manual sync completed successfully',
            ...result
        });
    } catch (error) {
        logger.error(`Manual cloud sync failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/cloud-sync/validate-path - Validiert einen Cloud-Pfad
 */
app.post('/api/cloud-sync/validate-path', authLimiter, (req, res) => {
    try {
        const { cloudPath } = req.body;

        if (!cloudPath) {
            return res.status(400).json({
                success: false,
                error: 'Cloud path is required'
            });
        }

        const validation = cloudSync.validateCloudPath(cloudPath);
        
        res.json({
            success: validation.valid,
            valid: validation.valid,
            error: validation.error || null
        });
    } catch (error) {
        logger.error(`Cloud path validation failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== HELPER FUNCTIONS ==========
// (OBS overlay generation will be added later)

// ========== ROUTES ==========

let serverRestartScheduled = false;

function scheduleServerRestart(reason = 'api request') {
    if (serverRestartScheduled) {
        logger.warn(`♻️  Server restart already scheduled, ignoring duplicate request (${reason})`);
        return false;
    }

    serverRestartScheduled = true;
    logger.info(`♻️  Server restart scheduled (${reason})`);

    setTimeout(() => {
        logger.info(`♻️  Server restart starting (${reason})`);

        try { db.flushEventBatch(); } catch (err) { logger.debug(`flushEventBatch skipped: ${err.message}`); }
        try { io.emit('server:restarting', { reason }); } catch (err) { logger.debug(`server:restarting emit skipped: ${err.message}`); }
        try { io.disconnectSockets(true); } catch (err) { logger.debug(`socket disconnect skipped: ${err.message}`); }
        try { db.close(); } catch (err) { logger.debug(`db.close skipped: ${err.message}`); }

        server.close(() => {
            logger.info('♻️  Exiting with restart code 75...');
            process.exit(75);
        });

        const forceTimer = setTimeout(() => {
            logger.warn('♻️  Force exiting with restart code 75...');
            process.exit(75);
        }, 3000);
        forceTimer.unref();
    }, 250);

    return true;
}

function scheduleServerRestartAfterResponse(res, reason) {
    res.on('finish', () => {
        scheduleServerRestart(reason);
    });
}

function scheduleServerShutdownAfterResponse(res, reason) {
    res.on('finish', () => {
        logger.info(`Launcher requested graceful server shutdown (${reason})`);
        gracefulShutdown('LAUNCHER_SHUTDOWN');
    });
}

function normalizeRemoteAddress(address) {
    return String(address || '').replace(/^::ffff:/, '');
}

function isLocalLauncherRequest(req) {
    const candidates = [
        req.ip,
        req.socket && req.socket.remoteAddress,
        req.connection && req.connection.remoteAddress
    ].map(normalizeRemoteAddress);

    return candidates.some(address => (
        address === '127.0.0.1' ||
        address === '::1' ||
        address === 'localhost'
    ));
}

function launcherTokenMatches(req) {
    const expected = process.env.LTTH_LAUNCHER_TOKEN;
    const actual = req.get('x-ltth-launcher-token');
    if (!expected || !actual) {
        return false;
    }

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(actual, 'utf8');
    return expectedBuffer.length === actualBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

// Haupt-Seite
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Overlay-Route (compatibility - redirects to dashboard)
app.get('/overlay.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Favicon route (prevent 404 errors)
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

app.get('/terms-of-service', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms-of-service.html'));
});

app.get('/privacy-policy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
});

// ========== TIKTOK CONNECTION ROUTES ==========

app.post('/api/connect', authLimiter, async (req, res) => {
    try {
        const username = Validators.string(req.body.username, {
            required: true,
            minLength: 1,
            maxLength: 100,
            pattern: /^[a-zA-Z0-9._-]+$/,
            fieldName: 'username'
        });
        const connectionOptions = {
            fallbackKeyConfirmed: req.body?.fallbackKeyConfirmed === true,
            userInitiated: true
        };

        // Check active profile's open DB directly (avoids WAL contention on the active DB)
        const isActiveProfileAlias = db.hasUsernameAlias(username);
        if (isActiveProfileAlias) {
            try { db.touchUsernameAlias(username); } catch (_) {}
            const connection = await tiktok.connect(username, connectionOptions);
            logger.info(`✅ Connected to TikTok user: ${username} (alias of active profile "${loadedProfile}")`);
            return res.json({
                success: true,
                profileSwitched: false,
                status: connection.identityPending ? 'live_identity_pending' : 'connected',
                ...connection
            });
        }

        // Check if any other profile has this username as an alias
        // This handles the case where a user changed their TikTok username
        const aliasMatchedProfile = profileManager.findProfileByUsername(username);
        if (aliasMatchedProfile && aliasMatchedProfile !== loadedProfile) {
            logger.info(`🔗 Username "${username}" found as alias of profile "${aliasMatchedProfile}"`);
            // Switch to that profile instead of creating a new one
            profileManager.setActiveProfile(aliasMatchedProfile);
            io.emit('profile:switched', {
                from: loadedProfile,
                to: aliasMatchedProfile,
                aliasMatch: username,
                requiresRestart: true,
                restartScheduled: true
            });
            scheduleServerRestartAfterResponse(res, `profile alias switch to ${aliasMatchedProfile}`);
            return res.json({
                success: true,
                profileSwitched: true,
                aliasMatch: true,
                originalUsername: username,
                message: `Profil "${aliasMatchedProfile}" wurde über Alias "${username}" gefunden. Neustart erforderlich.`,
                requiresRestart: true,
                restartScheduled: true,
                newProfile: aliasMatchedProfile
            });
        }

        // Check if the loaded database profile matches the requested username
        // This is critical: we must compare against the LOADED profile, not the file
        if (loadedProfile !== username) {
            logger.warn(`⚠️ Profile mismatch detected! Loaded: "${loadedProfile}", Requested: "${username}"`);
            
            // Check if profile exists for this streamer
            if (!profileManager.profileExists(username)) {
                logger.info(`📝 Creating new profile for streamer: ${username}`);
                profileManager.createProfile(username);
            }
            
            // Update the active profile file
            logger.info(`🔄 Switching from profile "${loadedProfile}" to "${username}"`);
            profileManager.setActiveProfile(username);
            
            // Emit socket event to notify frontend
            io.emit('profile:switched', {
                from: loadedProfile,
                to: username,
                requiresRestart: true,
                restartScheduled: true
            });
            
            logger.info(`✅ Profile switched to: ${username} (restart required to activate)`);
            scheduleServerRestartAfterResponse(res, `profile switch to ${username}`);
            
            // Return early with profile switch notification
            return res.json({
                success: true,
                profileSwitched: true,
                message: `Profile switched to "${username}". Restarting application to activate new profile...`,
                requiresRestart: true,
                restartScheduled: true,
                newProfile: username
            });
        }

        // Profile already active, proceed with connection
        const connection = await tiktok.connect(username, connectionOptions);
        logger.info(`✅ Connected to TikTok user: ${username}`);

        // Auto-register the connected username as a primary alias (idempotent)
        try {
            if (!db.hasUsernameAlias(username)) {
                db.addUsernameAlias(username, 'Auto-registered on connect', true);
                logger.info(`📝 Auto-registered "${username}" as primary alias for profile "${loadedProfile}"`);
            } else {
                db.touchUsernameAlias(username);
            }
        } catch (_) {}

        res.json({
            success: true,
            profileSwitched: false,
            status: connection.identityPending ? 'live_identity_pending' : 'connected',
            ...connection
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid connection attempt: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Connection error:', error);
        const statusByConnectionState = {
            offline: 409,
            stream_ended: 409,
            auth_error: 401,
            configuration_error: 400,
            circuit_open: 429,
            validation_failed: 504,
            identity_error: 409,
            fallback_confirmation_required: 428,
            fallback_keys_exhausted: 503
        };
        const connectionStatus = error.connectionStatus || 'error';
        res.status(statusByConnectionState[connectionStatus] || 500).json({
            success: false,
            status: connectionStatus,
            error: error.message,
            code: error.code || null,
            roomId: tiktok.roomId || null,
            streamIdentity: tiktok.streamIdentity || null,
            retryAllowedAt: error.retryAllowedAt || null,
            fallbackKey: error.fallbackKey === true,
            confirmationDelayMs: error.confirmationDelayMs || null
        });
    }
});

app.post('/api/disconnect', authLimiter, (req, res) => {
    tiktok.disconnect();
    logger.info('🔌 Disconnected from TikTok');
    res.json({ success: true });
});

// ========== USERNAME ALIASES ==========

// GET /api/profiles/aliases — List aliases of active profile
app.get('/api/profiles/aliases', apiLimiter, (req, res) => {
    try {
        const aliases = db.getUsernameAliases();
        res.json({ success: true, aliases, activeProfile: loadedProfile });
    } catch (error) {
        logger.error('Error getting aliases:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/profiles/aliases — Add alias to active profile
app.post('/api/profiles/aliases', apiLimiter, (req, res) => {
    try {
        const username = Validators.string(req.body.username, {
            required: true,
            minLength: 1,
            maxLength: 100,
            pattern: /^@?[a-zA-Z0-9._-]+$/,
            fieldName: 'username'
        });
        const label = req.body.label ? String(req.body.label).substring(0, 100) : null;
        const isPrimary = req.body.isPrimary === true || req.body.isPrimary === 'true';

        const alias = db.addUsernameAlias(username, label, isPrimary);
        logger.info(`➕ Added username alias: "${username}" to profile "${loadedProfile}"`);
        res.json({ success: true, alias });
    } catch (error) {
        if (error instanceof ValidationError) {
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error adding alias:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/profiles/aliases/:username — Remove alias from active profile
app.delete('/api/profiles/aliases/:username', apiLimiter, (req, res) => {
    try {
        const username = Validators.string(req.params.username, {
            required: true,
            minLength: 1,
            maxLength: 100,
            pattern: /^@?[a-zA-Z0-9._-]+$/,
            fieldName: 'username'
        });
        db.removeUsernameAlias(username);
        logger.info(`🗑️ Removed username alias: "${username}" from profile "${loadedProfile}"`);
        res.json({ success: true });
    } catch (error) {
        if (error instanceof ValidationError) {
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error removing alias:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PATCH /api/profiles/aliases/:username/primary — Set alias as primary
app.patch('/api/profiles/aliases/:username/primary', apiLimiter, (req, res) => {
    try {
        const username = Validators.string(req.params.username, {
            required: true,
            minLength: 1,
            maxLength: 100,
            pattern: /^@?[a-zA-Z0-9._-]+$/,
            fieldName: 'username'
        });
        db.setPrimaryAlias(username);
        logger.info(`⭐ Set primary alias: "${username}" for profile "${loadedProfile}"`);
        res.json({ success: true });
    } catch (error) {
        if (error instanceof ValidationError) {
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error setting primary alias:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/health - Health check endpoint
 * Used by PortManager to identify running LTTH instances
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        success: true,
        name: 'LTTH - Pup Cids little TikTool Helper',
        pid: process.pid,
        port: PORT,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.post('/api/launcher/shutdown', (req, res) => {
    if (!isLocalLauncherRequest(req)) {
        return res.status(403).json({ success: false, error: 'Launcher shutdown is only available from localhost' });
    }

    if (!launcherTokenMatches(req)) {
        return res.status(401).json({ success: false, error: 'Invalid launcher token' });
    }

    scheduleServerShutdownAfterResponse(res, 'launcher graceful shutdown');
    res.json({
        success: true,
        status: 'shutdown_scheduled',
        pid: process.pid,
        port: PORT
    });
});

function buildRestartingApiState(endpoint) {
    return {
        success: false,
        status: 'restarting',
        restarting: true,
        endpoint,
        message: 'Server restart in progress. Please retry shortly.',
        timestamp: new Date().toISOString()
    };
}

app.get('/api/status', apiLimiter, (req, res) => {
    res.json({
        isConnected: tiktok.isActive(),
        username: tiktok.currentUsername,
        stats: tiktok.getStats(),
        restarting: serverRestartScheduled
    });
});

// Get live statistics in a standardized format for plugins
// This endpoint is designed for real-time polling (recommended: every 2 seconds)
app.get('/api/live-stats', apiLimiter, (req, res) => {
    try {
        const stats = tiktok.stats || {};
        // Only calculate duration when connected and streamStartTime is set
        const streamDuration = (tiktok.isActive() && tiktok.streamStartTime)
            ? Math.floor((Date.now() - tiktok.streamStartTime) / 1000)
            : 0;
        
        // Format runtime as HH:MM:SS
        const hours = Math.floor(streamDuration / 3600);
        const minutes = Math.floor((streamDuration % 3600) / 60);
        const seconds = streamDuration % 60;
        const runtimeFormatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        res.json({
            success: true,
            isConnected: tiktok.isActive(),
            username: tiktok.currentUsername,
            restarting: serverRestartScheduled,
            stats: {
                runtime: runtimeFormatted,
                streamDuration: streamDuration,
                viewers: stats.viewers || 0,
                likes: stats.likes || 0,
                coins: stats.totalCoins || 0,
                followers: stats.followers || 0,
                gifts: stats.gifts || 0,
                shares: stats.shares || 0
            },
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Live stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get deduplication statistics
app.get('/api/deduplication-stats', apiLimiter, (req, res) => {
    try {
        const tiktokStats = tiktok.getDeduplicationStats();
        res.json({
            success: true,
            tiktok: tiktokStats
        });
    } catch (error) {
        logger.error('Deduplication stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clear deduplication cache (for debugging/testing)
app.post('/api/deduplication-clear', authLimiter, (req, res) => {
    try {
        tiktok.clearDeduplicationCache();
        logger.info('🧹 Deduplication cache cleared');
        res.json({
            success: true,
            message: 'Deduplication cache cleared'
        });
    } catch (error) {
        logger.error('Clear deduplication cache error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== CONNECTION DIAGNOSTICS ROUTES ==========

app.get('/api/diagnostics', apiLimiter, async (req, res) => {
    if (serverRestartScheduled) {
        return res.status(503).json(buildRestartingApiState('diagnostics'));
    }

    try {
        const username = req.query.username || tiktok.currentUsername || 'tiktok';
        const diagnostics = await tiktok.runDiagnostics(username);
        logger.info('🔍 Connection diagnostics run');
        res.json(diagnostics);
    } catch (error) {
        logger.error('Diagnostics error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/connection-health', apiLimiter, async (req, res) => {
    if (serverRestartScheduled) {
        return res.status(503).json(buildRestartingApiState('connection-health'));
    }

    try {
        const health = await tiktok.getConnectionHealth();
        res.json({
            ...health,
            restarting: false
        });
    } catch (error) {
        logger.error('Connection health check error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SESSION EXTRACTOR ROUTES ==========

app.post('/api/session/extract', authLimiter, async (req, res) => {
    try {
        logger.info('🔐 Starting session extraction...');
        const options = {
            headless: req.body.headless !== false,
            executablePath: req.body.executablePath || null
        };
        
        const result = await getSessionExtractor().extractSessionId(options);
        
        if (result.success) {
            logger.info('✅ Session extraction successful');
        } else {
            logger.warn('⚠️  Session extraction failed:', result.message);
        }
        
        res.json(result);
    } catch (error) {
        logger.error('Session extraction error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            message: 'Session extraction failed'
        });
    }
});

app.post('/api/session/extract-manual', authLimiter, async (req, res) => {
    try {
        logger.info('🔐 Starting manual session extraction...');
        const options = {
            executablePath: req.body.executablePath || null
        };
        
        const result = await getSessionExtractor().extractWithManualLogin(options);
        
        if (result.success) {
            logger.info('✅ Manual session extraction successful');
        } else {
            logger.warn('⚠️  Manual session extraction failed:', result.message);
        }
        
        res.json(result);
    } catch (error) {
        logger.error('Manual session extraction error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            message: 'Manual session extraction failed'
        });
    }
});

app.post('/api/session/import-manual', authLimiter, async (req, res) => {
    try {
        logger.info('📋 Starting manual session import...');
        const { sessionId, ttTargetIdc } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID',
                message: 'Please provide the sessionid cookie value from your browser'
            });
        }
        
        const result = await getSessionExtractor().importSessionManually(sessionId, ttTargetIdc);
        
        if (result.success) {
            logger.info('✅ Manual session import successful');
        } else {
            logger.warn('⚠️  Manual session import failed:', result.message);
        }
        
        res.json(result);
    } catch (error) {
        logger.error('Manual session import error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            message: 'Manual session import failed'
        });
    }
});

app.get('/api/session/status', apiLimiter, (req, res) => {
    try {
        const status = getSessionExtractor().getSessionStatus();
        res.json(status);
    } catch (error) {
        logger.error('Session status error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.delete('/api/session/clear', authLimiter, (req, res) => {
    try {
        logger.info('🗑️  Clearing session data...');
        const result = getSessionExtractor().clearSessionData();
        
        if (result.success) {
            logger.info('✅ Session data cleared');
        }
        
        res.json(result);
    } catch (error) {
        logger.error('Session clear error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/api/session/test-browser', apiLimiter, async (req, res) => {
    try {
        const result = await getSessionExtractor().testBrowserAvailability();
        res.json(result);
    } catch (error) {
        logger.error('Browser test error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ========== PLUGIN ROUTES ==========
// Plugin routes are set up in routes/plugin-routes.js (setupPluginRoutes)

// ========== INITIALIZATION STATE ROUTE ==========
app.get('/api/init-state', (req, res) => {
    res.json(initState.getState());
});

// ========== I18N ROUTES ==========

// Get available locales
app.get('/api/i18n/locales', (req, res) => {
    const locales = i18n.getAvailableLocales();
    res.json(locales);
});

// Get translations for a specific locale
app.get('/api/i18n/translations/:locale', (req, res) => {
    const locale = req.params.locale;
    const translations = i18n.getAllTranslations(locale);
    
    if (!translations || Object.keys(translations).length === 0) {
        return res.status(404).json({ error: 'Locale not found' });
    }
    
    res.json(translations);
});

// Get current locale (from settings or default)
app.get('/api/i18n/current', (req, res) => {
    const locale = db.getSetting('language') || 'en';
    res.json({ locale });
});

// Set current locale
app.post('/api/i18n/current', apiLimiter, (req, res) => {
    const { locale } = req.body;
    
    if (!locale) {
        return res.status(400).json({ error: 'Locale is required' });
    }
    
    const availableLocales = i18n.getAvailableLocales();
    if (!availableLocales.includes(locale)) {
        return res.status(400).json({ error: 'Invalid locale' });
    }
    
    db.setSetting('language', locale);
    i18n.setLocale(locale);
    
    // Notify all connected clients
    io.emit('locale-changed', { locale });
    
    res.json({ success: true, locale });
});

// ========== SETTINGS ROUTES ==========

app.get('/api/settings', apiLimiter, (req, res) => {
    const settings = db.getAllSettings();
    res.json(settings);
});

app.post('/api/settings', apiLimiter, (req, res) => {
    try {
        const settings = Validators.object(req.body, {
            required: true,
            fieldName: 'settings'
        });

        // Validate settings object is not too large
        const keys = Object.keys(settings);
        if (keys.length > 200) {
            throw new ValidationError('Too many settings (max 200)', 'settings');
        }

        let shouldReloadTimers = false;

        // Validate each key and value
        Object.entries(settings).forEach(([key, value]) => {
            // Validate key format
            const validKey = Validators.string(key, {
                required: true,
                maxLength: 100,
                pattern: /^[a-zA-Z0-9._-]+$/,
                fieldName: 'setting key'
            });

            // Validate value is not too large (prevent memory issues)
            if (typeof value === 'string' && value.length > 50000) {
                throw new ValidationError(`Setting ${validKey} value too large (max 50000 chars)`, validKey);
            }

            db.setSetting(validKey, value);
            if (validKey === 'flows_enabled') {
                shouldReloadTimers = true;
            }
        });

        if (shouldReloadTimers) {
            reloadIFTTTTimers();
        }

        logger.info('⚙️ Settings updated');
        res.json({ success: true });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid settings update: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error saving settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== EVENT LOG API (Core Integration for Plugins) ==========

/**
 * Get event logs - provides a unified interface for plugins to read stream events
 * This is the core integration point for other plugins to access TikTok stream data
 */
app.get('/api/event-logs', apiLimiter, (req, res) => {
    try {
        // Validate limit parameter
        let limit = 100;
        if (req.query.limit !== undefined) {
            const parsedLimit = parseInt(req.query.limit, 10);
            if (isNaN(parsedLimit) || parsedLimit < 1) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid limit parameter. Must be a positive integer.' 
                });
            }
            limit = Math.min(parsedLimit, 1000);
        }
        
        const eventType = req.query.type || null;
        const since = req.query.since || null;
        
        const logs = db.getEventLogsFiltered({ limit, eventType, since });
        res.json({ 
            success: true, 
            count: logs.length,
            logs 
        });
    } catch (error) {
        logger.error('Error fetching event logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get event log statistics
 */
app.get('/api/event-logs/stats', apiLimiter, (req, res) => {
    try {
        const stats = db.getEventLogStats();
        res.json({ success: true, stats });
    } catch (error) {
        logger.error('Error fetching event log stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get the latest event of a specific type
 */
app.get('/api/event-logs/latest/:type', apiLimiter, (req, res) => {
    try {
        const eventType = req.params.type;
        const validTypes = ['chat', 'gift', 'follow', 'share', 'like', 'subscribe'];
        
        if (!validTypes.includes(eventType)) {
            return res.status(400).json({ 
                success: false, 
                error: `Invalid event type. Valid types: ${validTypes.join(', ')}` 
            });
        }
        
        const event = db.getLatestEvent(eventType);
        res.json({ success: true, event });
    } catch (error) {
        logger.error('Error fetching latest event:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Cleanup old event logs (admin operation)
 */
app.post('/api/event-logs/cleanup', authLimiter, (req, res) => {
    try {
        // Validate keepCount parameter
        let keepCount = 1000;
        if (req.body.keepCount !== undefined) {
            const parsedKeepCount = parseInt(req.body.keepCount, 10);
            if (isNaN(parsedKeepCount) || parsedKeepCount < 100) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid keepCount parameter. Must be an integer >= 100.' 
                });
            }
            keepCount = parsedKeepCount;
        }
        
        const deleted = db.cleanupEventLogs(keepCount);
        logger.info(`🧹 Event log cleanup: deleted ${deleted} old entries, keeping ${keepCount}`);
        res.json({ success: true, deleted, keepCount });
    } catch (error) {
        logger.error('Error during event log cleanup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Clear all event logs (admin operation)
 */
app.post('/api/event-logs/clear', authLimiter, (req, res) => {
    try {
        db.clearEventLogs();
        logger.info('🗑️ All event logs cleared');
        res.json({ success: true });
    } catch (error) {
        logger.error('Error clearing event logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== USER PROFILE ROUTES ==========

// Liste aller verfügbaren Profile
app.get('/api/profiles', apiLimiter, (req, res) => {
    try {
        const profiles = profileManager.listProfiles();
        const activeProfileFile = profileManager.getActiveProfile(); // Profile from file (next restart)
        const hasPendingProfile = activeProfileFile !== loadedProfile;

        res.json({
            profiles: profiles.map(p => ({
                username: p.username,
                created: p.created,
                modified: p.modified,
                size: p.size,
                isActive: p.username === loadedProfile // Use loadedProfile (currently running)
            })),
            activeProfile: loadedProfile, // Currently loaded profile
            pendingProfile: hasPendingProfile ? activeProfileFile : undefined // Profile pending restart
        });
    } catch (error) {
        logger.error('Error listing profiles:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Aktuelles aktives Profil
app.get('/api/profiles/active', apiLimiter, (req, res) => {
    try {
        const activeProfileFile = profileManager.getActiveProfile();
        const hasPendingProfile = activeProfileFile !== loadedProfile;
        res.json({ 
            activeProfile: loadedProfile, // Currently loaded profile
            pendingProfile: hasPendingProfile ? activeProfileFile : undefined, // Profile pending restart
            requiresRestart: hasPendingProfile,
            port: PORT
        });
    } catch (error) {
        logger.error('Error getting active profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Neues Profil erstellen
app.post('/api/profiles', apiLimiter, (req, res) => {
    try {
        const username = Validators.string(req.body.username, {
            required: true,
            minLength: 1,
            maxLength: 50,
            pattern: /^[a-zA-Z0-9_-]+$/,
            fieldName: 'username'
        });

        const profile = profileManager.createProfile(username);
        logger.info(`👤 Created new profile: ${username}`);
        res.json({ success: true, profile });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid profile creation: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error creating profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Profil löschen
app.delete('/api/profiles/:username', apiLimiter, (req, res) => {
    try {
        const username = Validators.string(req.params.username, {
            required: true,
            minLength: 1,
            maxLength: 50,
            pattern: /^[a-zA-Z0-9_-]+$/,
            fieldName: 'username'
        });

        profileManager.deleteProfile(username);
        logger.info(`🗑️ Deleted profile: ${username}`);
        res.json({ success: true });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid profile deletion: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error deleting profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Profil wechseln (erfordert Server-Neustart)
app.post('/api/profiles/switch', apiLimiter, (req, res) => {
    try {
        const username = Validators.string(req.body.username, {
            required: true,
            minLength: 1,
            maxLength: 50,
            pattern: /^[a-zA-Z0-9_-]+$/,
            fieldName: 'username'
        });

        if (!profileManager.profileExists(username)) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }

        if (username.toLowerCase() === loadedProfile.toLowerCase()) {
            return res.json({
                success: true,
                message: 'Profile is already active.',
                requiresRestart: false,
                activeProfile: loadedProfile
            });
        }

        profileManager.setActiveProfile(username);
        logger.info(`🔄 Switched to profile: ${username} (restart scheduled)`);

        // Emit socket event to notify frontend for restart overlay.
        io.emit('profile:switched', {
            from: loadedProfile,
            to: username,
            requiresRestart: true,
            restartScheduled: true
        });

        scheduleServerRestartAfterResponse(res, `profile switch to ${username}`);

        res.json({
            success: true,
            message: 'Profile switched. Server restart scheduled.',
            requiresRestart: true,
            restartScheduled: true,
            activeProfile: loadedProfile,
            newProfile: username
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid profile switch: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error switching profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SERVER RESTART ROUTE ==========

/**
 * POST /api/server/restart
 * Schedules a clean server restart via exit code 75.
 * The launcher wrapper catches this code and starts the server again.
 */
app.post('/api/server/restart', apiLimiter, (req, res) => {
    logger.info('♻️  Server restart requested via API');

    res.json({
        success: true,
        message: serverRestartScheduled ? 'Server restart is already scheduled.' : 'Server is restarting...',
        restartScheduled: true
    });

    scheduleServerRestartAfterResponse(res, 'manual restart API');
});

// Profil-Backup erstellen
app.post('/api/profiles/:username/backup', apiLimiter, (req, res) => {
    const { username } = req.params;

    try {
        const backup = profileManager.backupProfile(username);
        logger.info(`💾 Created backup for profile: ${username}`);
        res.json({ success: true, backup });
    } catch (error) {
        logger.error('Error creating backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get profile integrity status
app.get('/api/profiles/integrity', apiLimiter, (req, res) => {
    try {
        const activeProfileFile = profileManager.getActiveProfile();
        const profiles = profileManager.listProfiles();
        
        const integrityResults = profiles.map(profile => {
            const dbPath = profileManager.getProfilePath(profile.username);
            const exists = fs.existsSync(dbPath);
            const size = exists ? fs.statSync(dbPath).size : 0;
            
            // Check for WAL and SHM files
            const walExists = fs.existsSync(`${dbPath}-wal`);
            const shmExists = fs.existsSync(`${dbPath}-shm`);
            
            let status = 'healthy';
            let issues = [];
            
            if (!exists) {
                status = 'error';
                issues.push('Database file not found');
            } else if (size === 0) {
                status = 'error';
                issues.push('Database file is empty');
            } else if (size < 1024) {
                status = 'warning';
                issues.push('Database file is suspiciously small');
            }
            
            return {
                username: profile.username,
                status,
                issues,
                dbPath,
                size,
                walExists,
                shmExists,
                isActive: profile.username === loadedProfile // Use loadedProfile
            };
        });
        
        res.json({
            success: true,
            activeProfile: loadedProfile, // Currently loaded profile
            profiles: integrityResults
        });
    } catch (error) {
        logger.error('Error checking profile integrity:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get migration status
app.get('/api/profiles/migration-status', apiLimiter, (req, res) => {
    try {
        const oldDbPath = path.join(__dirname, 'database.db');
        const oldDbExists = fs.existsSync(oldDbPath);
        const legacyConfigCandidates = discoverLegacyConfigCandidates({
            appDir: __dirname,
            workspaceRoot: path.join(__dirname, '..'),
            configPathManager
        });
        const configImportPlugin = pluginLoader && typeof pluginLoader.getPlugin === 'function'
            ? pluginLoader.getPlugin('config-import')
            : null;
        const configImportEnabled = Boolean(configImportPlugin);
        
        // Check for old data in plugin directories
        const orphanedData = [];
        
        // Check for old viewer-xp data
        const oldViewerXPPath = path.join(__dirname, 'plugins', 'viewer-xp', 'data');
        if (fs.existsSync(oldViewerXPPath)) {
            const files = fs.readdirSync(oldViewerXPPath);
            if (files.length > 0) {
                orphanedData.push({
                    plugin: 'viewer-xp',
                    path: oldViewerXPPath,
                    files: files.length
                });
            }
        }
        
        const status = {
            oldDatabaseExists: oldDbExists,
            oldDatabasePath: oldDbPath,
            migrationNeeded: oldDbExists || legacyConfigCandidates.length > 0,
            orphanedData,
            legacyConfigCandidates,
            legacyConfigCandidateCount: legacyConfigCandidates.length,
            configImportEnabled,
            configImportUrl: '/config-import/ui',
            configLocation: configPathManager.getConfigDir(),
            userConfigsLocation: configPathManager.getUserConfigsDir()
        };
        
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        logger.error('Error checking migration status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== CONFIG PATH MANAGEMENT ROUTES ==========

// Get current config path information
app.get('/api/config-path', apiLimiter, (req, res) => {
    try {
        const info = configPathManager.getInfo();
        res.json({
            success: true,
            ...info
        });
    } catch (error) {
        logger.error('Error getting config path info:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Set custom config path (requires restart)
app.post('/api/config-path/custom', apiLimiter, (req, res) => {
    try {
        const customPath = Validators.string(req.body.path, {
            required: true,
            minLength: 1,
            maxLength: 500,
            fieldName: 'path'
        });

        configPathManager.setCustomConfigDir(customPath);
        logger.info(`📂 Custom config path set: ${customPath} (restart required)`);

        res.json({
            success: true,
            message: 'Custom config path set. Please restart the application to apply changes.',
            requiresRestart: true,
            path: customPath
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid custom config path: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Error setting custom config path:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset to default config path (requires restart)
app.post('/api/config-path/reset', apiLimiter, (req, res) => {
    try {
        const defaultPath = configPathManager.resetToDefaultConfigDir();
        logger.info(`📂 Config path reset to default: ${defaultPath} (restart required)`);

        res.json({
            success: true,
            message: 'Config path reset to default. Please restart the application to apply changes.',
            requiresRestart: true,
            path: defaultPath
        });
    } catch (error) {
        logger.error('Error resetting config path:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== HUD CONFIGURATION ROUTES ==========

app.get('/api/hud-config', apiLimiter, (req, res) => {
    try {
        const elements = db.getAllHudElements();
        const resolution = db.getSetting('hud_resolution') || '1920x1080';
        const orientation = db.getSetting('hud_orientation') || 'landscape';

        res.json({
            success: true,
            elements,
            resolution,
            orientation
        });
    } catch (error) {
        logger.error('Error getting HUD config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/hud-config', apiLimiter, (req, res) => {
    const { elements, resolution, orientation } = req.body;

    try {
        // Update resolution and orientation if provided
        if (resolution) {
            db.setSetting('hud_resolution', resolution);
        }
        if (orientation) {
            db.setSetting('hud_orientation', orientation);
        }

        // Update each element's configuration
        if (elements && Array.isArray(elements)) {
            elements.forEach(element => {
                db.setHudElement(element.element_id, {
                    enabled: element.enabled,
                    position_x: element.position_x,
                    position_y: element.position_y,
                    position_unit: element.position_unit || 'px',
                    anchor: element.anchor || 'top-left'
                });
            });
        }

        logger.info('🖼️ HUD configuration updated');
        res.json({ success: true });
    } catch (error) {
        logger.error('Error saving HUD config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/hud-config/element/:elementId', apiLimiter, (req, res) => {
    const { elementId } = req.params;
    const config = req.body;

    try {
        db.setHudElement(elementId, config);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error updating HUD element:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/hud-config/element/:elementId/toggle', apiLimiter, (req, res) => {
    const { elementId } = req.params;
    const { enabled } = req.body;

    try {
        db.toggleHudElement(elementId, enabled);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error toggling HUD element:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== FLOWS ROUTES ==========

function normalizeFlowCooldown(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Math.min(3600, Math.max(0, Math.round(parsed)));
}

function reloadIFTTTTimers() {
    try {
        iftttEngine.reloadTimerTriggers();
    } catch (error) {
        logger.error('Error reloading IFTTT timer triggers:', error);
    }
}

app.get('/api/flows', apiLimiter, (req, res) => {
    const flows = db.getFlows();
    // Enrich each flow with its cooldown setting
    const enriched = flows.map(flow => ({
        ...flow,
        cooldown: parseInt(db.getSetting(`flow_cooldown_${flow.id}`)) || 0
    }));
    res.json(enriched);
});

app.get('/api/flows/:id', apiLimiter, (req, res) => {
    const flow = db.getFlow(req.params.id);
    if (!flow) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
    }
    res.json({
        ...flow,
        cooldown: parseInt(db.getSetting(`flow_cooldown_${flow.id}`)) || 0
    });
});

app.post('/api/flows', apiLimiter, (req, res) => {
    const flow = req.body;

    if (!flow.name || !flow.trigger_type || !flow.actions) {
        return res.status(400).json({
            success: false,
            error: 'Name, trigger_type and actions are required'
        });
    }

    try {
        const id = db.createFlow(flow);
        // Store cooldown setting if provided
        if (flow.cooldown !== undefined && flow.cooldown !== null) {
            db.setSetting(`flow_cooldown_${id}`, String(normalizeFlowCooldown(flow.cooldown)));
        }
        reloadIFTTTTimers();
        logger.info(`➕ Created flow: ${flow.name}`);
        res.json({ success: true, id });
    } catch (error) {
        logger.error('Error creating flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/flows/:id', apiLimiter, (req, res) => {
    const flow = req.body;

    try {
        db.updateFlow(req.params.id, flow);
        // Update cooldown setting if provided
        if (flow.cooldown !== undefined && flow.cooldown !== null) {
            db.setSetting(`flow_cooldown_${req.params.id}`, String(normalizeFlowCooldown(flow.cooldown)));
        }
        reloadIFTTTTimers();
        logger.info(`✏️ Updated flow: ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error updating flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/flows/:id', apiLimiter, (req, res) => {
    try {
        db.deleteFlow(req.params.id);
        // Clean up cooldown setting to avoid orphaned data
        db.deleteSetting(`flow_cooldown_${req.params.id}`);
        reloadIFTTTTimers();
        logger.info(`🗑️ Deleted flow: ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/flows/:id/toggle', apiLimiter, (req, res) => {
    const { enabled } = req.body;

    try {
        db.toggleFlow(req.params.id, enabled);
        reloadIFTTTTimers();
        logger.info(`🔄 Toggled flow ${req.params.id}: ${enabled}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error toggling flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/flows/:id/test', apiLimiter, async (req, res) => {
    const testData = req.body;

    try {
        await iftttEngine.executeFlowById(req.params.id, testData);
        logger.info(`🧪 Tested flow: ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error testing flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== IFTTT ROUTES ==========

/**
 * GET /api/ifttt/triggers - Get all available triggers
 */
app.get('/api/ifttt/triggers', iftttLimiter, (req, res) => {
    try {
        const triggers = iftttEngine.triggers.getAllForFrontend();
        res.json(triggers);
    } catch (error) {
        logger.error('Error getting triggers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/ifttt/conditions - Get all available conditions
 */
app.get('/api/ifttt/conditions', iftttLimiter, (req, res) => {
    try {
        const conditions = iftttEngine.conditions.getAllForFrontend();
        const operators = iftttEngine.conditions.getAllOperatorsForFrontend();
        res.json({ conditions, operators });
    } catch (error) {
        logger.error('Error getting conditions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/ifttt/actions - Get all available actions
 */
app.get('/api/ifttt/actions', iftttLimiter, (req, res) => {
    try {
        const actions = iftttEngine.actions.getAllForFrontend();
        res.json(actions);
    } catch (error) {
        logger.error('Error getting actions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/ifttt/stats - Get IFTTT engine statistics
 */
app.get('/api/ifttt/stats', iftttLimiter, (req, res) => {
    try {
        const stats = iftttEngine.getStats();
        res.json(stats);
    } catch (error) {
        logger.error('Error getting IFTTT stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/ifttt/execution-history - Get execution history
 */
app.get('/api/ifttt/execution-history', iftttLimiter, (req, res) => {
    try {
        const count = parseInt(req.query.count) || 20;
        const history = iftttEngine.getExecutionHistory(count);
        res.json(history);
    } catch (error) {
        logger.error('Error getting execution history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/ifttt/variables - Get all variables
 */
app.get('/api/ifttt/variables', iftttLimiter, (req, res) => {
    try {
        const variables = iftttEngine.variables.getAll();
        const stats = iftttEngine.variables.getStats();
        res.json({ variables, stats });
    } catch (error) {
        logger.error('Error getting variables:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/ifttt/variables/:name - Set a variable
 */
app.post('/api/ifttt/variables/:name', iftttLimiter, (req, res) => {
    try {
        const { name } = req.params;
        const { value } = req.body;
        iftttEngine.variables.set(name, value);
        logger.info(`📝 Variable set: ${name} = ${value}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error setting variable:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/ifttt/variables/:name - Delete a variable
 */
app.delete('/api/ifttt/variables/:name', iftttLimiter, (req, res) => {
    try {
        const { name } = req.params;
        iftttEngine.variables.delete(name);
        logger.info(`🗑️ Variable deleted: ${name}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting variable:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/ifttt/trigger/:flowId - Manually trigger a flow
 */
app.post('/api/ifttt/trigger/:flowId', iftttLimiter, async (req, res) => {
    try {
        const { flowId } = req.params;
        const eventData = req.body || {};
        await iftttEngine.executeFlowById(flowId, eventData);
        logger.info(`⚡ Manually triggered flow: ${flowId}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error triggering flow:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/ifttt/event/:eventType - Manually trigger an event
 */
app.post('/api/ifttt/event/:eventType', iftttLimiter, async (req, res) => {
    try {
        const { eventType } = req.params;
        const eventData = req.body || {};
        await iftttEngine.processEvent(eventType, eventData);
        logger.info(`📡 Manually triggered event: ${eventType}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error triggering event:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ALERT ROUTES ==========

app.get('/api/alerts', apiLimiter, (req, res) => {
    const alertConfigs = db.getAllAlertConfigs();
    res.json(alertConfigs);
});

app.post('/api/alerts/:eventType', apiLimiter, (req, res) => {
    const { eventType } = req.params;
    const config = req.body;

    try {
        db.setAlertConfig(eventType, config);
        logger.info(`🔔 Alert config updated: ${eventType}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error setting alert config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/alerts/test', apiLimiter, (req, res) => {
    const { type, data } = req.body;

    try {
        alerts.testAlert(type, data);
        logger.info(`🧪 Testing alert: ${type}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error testing alert:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SOUNDBOARD ROUTES ==========
// Moved to Soundboard Plugin (plugins/soundboard)

// ========== GIFT CATALOG ROUTES ==========

app.get('/api/gift-catalog', apiLimiter, (req, res) => {
    try {
        const locale = req.query.locale || req.locale || db.getSetting('language') || 'en';
        const catalog = db.getGiftCatalog(locale);
        const lastUpdate = db.getCatalogLastUpdate();
        res.json({ success: true, catalog, lastUpdate, count: catalog.length });
    } catch (error) {
        logger.error('Error getting gift catalog:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/gift-catalog/update', apiLimiter, async (req, res) => {
    try {
        const locale = req.query.locale || req.body?.locale || req.locale || db.getSetting('language') || 'en';
        const requestedUsername = (req.body?.username || '').toString().trim().replace(/^@/, '');
        const fallbackUsername = db.getSetting('last_connected_username');
        const result = await tiktok.updateGiftCatalog({
            localeCode: locale,
            preferConnected: true,
            username: requestedUsername || fallbackUsername || undefined
        });
        logger.info('🎁 Gift catalog updated');
        res.json({ success: true, ...result });
    } catch (error) {
        // Safely log error without circular references
        const errorInfo = {
            message: error.message,
            code: error.code,
            stack: error.stack
        };
        logger.error('Error updating gift catalog:', errorInfo);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== GOALS ROUTES ==========
// DISABLED: Old goals routes - now using Goals Plugin instead
// The Goals Plugin (plugins/goals/) provides a complete replacement with:
// - Coin, Likes, Follower, and Custom goal types
// - Event API integration
// - Real-time overlays
// - Advanced progression modes
//
// All /api/goals/* routes are now handled by the plugin

/* COMMENTED OUT - OLD GOALS SYSTEM
// Get all goals
app.get('/api/goals', apiLimiter, (req, res) => {
    try {
        const status = goals.getStatus();
        res.json({ success: true, goals: status });
    } catch (error) {
        logger.error('Error getting goals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single goal
app.get('/api/goals/:key', apiLimiter, (req, res) => {
    try {
        const { key } = req.params;
        const config = goals.getGoalConfig(key);
        const state = goals.state[key];

        if (!config || !state) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        res.json({
            success: true,
            goal: {
                ...config,
                ...state,
                percent: Math.round(goals.getPercent(key) * 100)
            }
        });
    } catch (error) {
        logger.error('Error getting goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update goal config
app.post('/api/goals/:key/config', apiLimiter, async (req, res) => {
    try {
        const { key } = req.params;
        const updates = req.body;

        const config = await goals.updateGoalConfig(key, updates);

        if (!config) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        logger.info(`📊 Goal config updated: ${key}`);
        res.json({ success: true, message: `Goal ${key} updated`, config });
    } catch (error) {
        logger.error('Error updating goal config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update goal style
app.post('/api/goals/:key/style', apiLimiter, async (req, res) => {
    try {
        const { key } = req.params;
        const { style } = req.body;

        const updatedStyle = await goals.updateStyle(key, style);

        if (!updatedStyle) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        logger.info(`🎨 Goal style updated: ${key}`);
        res.json({ success: true, message: `Style for ${key} updated`, style: updatedStyle });
    } catch (error) {
        logger.error('Error updating style:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Set goal total (manual)
app.post('/api/goals/:key/set', apiLimiter, async (req, res) => {
    try {
        const { key } = req.params;
        const { total } = req.body;

        if (total === undefined) {
            return res.status(400).json({ success: false, error: 'total is required' });
        }

        await goals.setGoal(key, total);
        logger.info(`📊 Goal set: ${key} = ${total}`);

        res.json({ success: true, message: `Goal ${key} set to ${total}` });
    } catch (error) {
        logger.error('Error setting goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Increment goal
app.post('/api/goals/:key/increment', apiLimiter, async (req, res) => {
    try {
        const { key } = req.params;
        const { delta } = req.body;

        if (delta === undefined) {
            return res.status(400).json({ success: false, error: 'delta is required' });
        }

        await goals.incrementGoal(key, delta);

        res.json({ success: true, message: `Goal ${key} incremented by ${delta}` });
    } catch (error) {
        logger.error('Error incrementing goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset goal
app.post('/api/goals/:key/reset', apiLimiter, async (req, res) => {
    try {
        const { key } = req.params;

        await goals.resetGoal(key);
        logger.info(`🔄 Goal reset: ${key}`);

        res.json({ success: true, message: `Goal ${key} reset` });
    } catch (error) {
        logger.error('Error resetting goal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset all goals
app.post('/api/goals/reset', apiLimiter, async (req, res) => {
    try {
        await goals.resetAllGoals();
        logger.info('🔄 All goals reset');

        res.json({ success: true, message: 'All goals reset' });
    } catch (error) {
        logger.error('Error resetting all goals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
END OF OLD GOALS ROUTES */

// ========== OBS WEBSOCKET ROUTES ==========

app.get('/api/obs/status', apiLimiter, (req, res) => {
    try {
        const status = obs.getStatus();
        res.json({ success: true, ...status });
    } catch (error) {
        logger.error('Error getting OBS status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/connect', apiLimiter, async (req, res) => {
    const { host, port, password } = req.body;

    try {
        await obs.connect(host, port, password);
        logger.info(`🎬 Connected to OBS at ${host}:${port}`);
        res.json({ success: true, message: 'Connected to OBS' });
    } catch (error) {
        logger.error('Error connecting to OBS:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/disconnect', apiLimiter, async (req, res) => {
    try {
        await obs.disconnect();
        logger.info('🎬 Disconnected from OBS');
        res.json({ success: true, message: 'Disconnected from OBS' });
    } catch (error) {
        logger.error('Error disconnecting from OBS:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/scene/:sceneName', apiLimiter, async (req, res) => {
    const { sceneName } = req.params;

    try {
        await obs.setScene(sceneName);
        logger.info(`🎬 OBS scene changed to: ${sceneName}`);
        res.json({ success: true, message: `Scene changed to ${sceneName}` });
    } catch (error) {
        logger.error('Error changing OBS scene:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/source/:sourceName/visibility', apiLimiter, async (req, res) => {
    const { sourceName } = req.params;
    const { visible, sceneName } = req.body;

    try {
        await obs.setSourceVisibility(sourceName, visible, sceneName);
        logger.info(`🎬 OBS source ${sourceName} visibility: ${visible}`);
        res.json({ success: true, message: `Source ${sourceName} visibility set to ${visible}` });
    } catch (error) {
        logger.error('Error setting source visibility:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/obs/filter/:sourceName/:filterName/toggle', apiLimiter, async (req, res) => {
    const { sourceName, filterName } = req.params;
    const { enabled } = req.body;

    try {
        await obs.setFilterEnabled(sourceName, filterName, enabled);
        logger.info(`🎬 OBS filter ${filterName} on ${sourceName}: ${enabled}`);
        res.json({ success: true, message: `Filter ${filterName} set to ${enabled}` });
    } catch (error) {
        logger.error('Error toggling filter:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/obs/scenes', apiLimiter, async (req, res) => {
    try {
        const scenes = await obs.getScenes();
        res.json({ success: true, scenes });
    } catch (error) {
        logger.error('Error getting OBS scenes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/obs/sources', apiLimiter, async (req, res) => {
    const { sceneName } = req.query;

    try {
        const sources = await obs.getSources(sceneName);
        res.json({ success: true, sources });
    } catch (error) {
        logger.error('Error getting OBS sources:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== LEADERBOARD ROUTES ==========

app.get('/api/leaderboard/top/:category', apiLimiter, async (req, res) => {
    const { category } = req.params;
    const { limit } = req.query;

    try {
        const top = await leaderboard.getTop(category, parseInt(limit) || 10);
        res.json({ success: true, category, top });
    } catch (error) {
        logger.error('Error getting leaderboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Dedicated routes for overlay compatibility
app.get('/api/leaderboard/gifters', apiLimiter, async (req, res) => {
    const { limit } = req.query;

    try {
        const gifters = await leaderboard.getTop('gifters', parseInt(limit) || 10);
        res.json({ success: true, gifters });
    } catch (error) {
        logger.error('Error getting gifters leaderboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/leaderboard/chatters', apiLimiter, async (req, res) => {
    const { limit } = req.query;

    try {
        const chatters = await leaderboard.getTop('chatters', parseInt(limit) || 10);
        res.json({ success: true, chatters });
    } catch (error) {
        logger.error('Error getting chatters leaderboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/leaderboard/user/:username', apiLimiter, async (req, res) => {
    const { username } = req.params;

    try {
        const stats = await leaderboard.getUserStats(username);
        res.json({ success: true, username, stats });
    } catch (error) {
        logger.error('Error getting user stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/leaderboard/reset', apiLimiter, async (req, res) => {
    const { category } = req.body;

    try {
        await leaderboard.reset(category);
        logger.info(`📊 Leaderboard reset: ${category || 'all'}`);
        res.json({ success: true, message: `Leaderboard ${category || 'all'} reset` });
    } catch (error) {
        logger.error('Error resetting leaderboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/leaderboard/all', apiLimiter, async (req, res) => {
    try {
        const allStats = await leaderboard.getAllStats();
        res.json({ success: true, stats: allStats });
    } catch (error) {
        logger.error('Error getting all leaderboard stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== SUBSCRIPTION TIERS ROUTES ==========

app.get('/api/subscription-tiers', apiLimiter, (req, res) => {
    try {
        const tiers = subscriptionTiers.getAllTiers();
        res.json({ success: true, tiers });
    } catch (error) {
        logger.error('Error getting subscription tiers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/subscription-tiers', apiLimiter, (req, res) => {
    const { tier, config } = req.body;

    if (!tier || !config) {
        return res.status(400).json({ success: false, error: 'tier and config are required' });
    }

    try {
        subscriptionTiers.setTierConfig(tier, config);
        logger.info(`💎 Subscription tier configured: ${tier}`);
        res.json({ success: true, message: `Tier ${tier} configured` });
    } catch (error) {
        logger.error('Error setting subscription tier:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/subscription-tiers/:tier', apiLimiter, (req, res) => {
    const { tier } = req.params;

    try {
        const config = subscriptionTiers.getTierConfig(tier);
        res.json({ success: true, tier, config });
    } catch (error) {
        logger.error('Error getting subscription tier:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ANIMATION UPLOAD ROUTES ==========

app.post('/api/animations/upload', uploadLimiter, upload.single('animation'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const fileUrl = `/uploads/animations/${req.file.filename}`;
        logger.info(`📤 Animation uploaded: ${req.file.filename}`);

        res.json({
            success: true,
            message: 'Animation uploaded successfully',
            url: fileUrl,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype
        });
    } catch (error) {
        logger.error('Error uploading animation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/animations/list', apiLimiter, (req, res) => {
    try {
        const files = fs.readdirSync(uploadDir).map(filename => ({
            filename,
            url: `/uploads/animations/${filename}`,
            size: fs.statSync(path.join(uploadDir, filename)).size,
            created: fs.statSync(path.join(uploadDir, filename)).birthtime
        }));

        res.json({ success: true, animations: files });
    } catch (error) {
        logger.error('Error listing animations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/animations/:filename', apiLimiter, (req, res) => {
    const { filename } = req.params;

    try {
        const filePath = getAnimationFilePath(uploadDir, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Animation not found' });
        }

        fs.unlinkSync(filePath);
        logger.info(`🗑️ Animation deleted: ${filename}`);
        res.json({ success: true, message: 'Animation deleted' });
    } catch (error) {
        logger.error('Error deleting animation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve uploaded files
app.use('/uploads', express.static(configPathManager.getUploadsDir()));

// ========== MINIGAMES ROUTES ==========

app.post('/api/minigames/roulette', apiLimiter, (req, res) => {
    const { username, bet } = req.body;

    try {
        const result = Math.floor(Math.random() * 37); // 0-36
        const color = result === 0 ? 'green' : (result % 2 === 0 ? 'black' : 'red');
        const win = bet === result.toString() || bet === color;

        logger.info(`🎰 Roulette: ${username} bet on ${bet}, result: ${result} (${color})`);

        io.emit('minigame:roulette', {
            username,
            bet,
            result,
            color,
            win,
            winner: win ? username : null
        });

        res.json({
            success: true,
            game: 'roulette',
            result,
            color,
            win,
            winner: win ? username : null
        });
    } catch (error) {
        logger.error('Error in roulette game:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/minigames/dice', apiLimiter, (req, res) => {
    const { username, sides } = req.body;

    try {
        const sidesCount = parseInt(sides) || 6;
        const result = Math.floor(Math.random() * sidesCount) + 1;

        logger.info(`🎲 Dice: ${username} rolled ${result} (${sidesCount}-sided)`);

        io.emit('minigame:dice', {
            username,
            sides: sidesCount,
            result
        });

        res.json({
            success: true,
            game: 'dice',
            result,
            sides: sidesCount
        });
    } catch (error) {
        logger.error('Error in dice game:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/minigames/coinflip', apiLimiter, (req, res) => {
    const { username, bet } = req.body;

    try {
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const win = bet === result;

        logger.info(`🪙 Coinflip: ${username} bet on ${bet}, result: ${result}`);

        io.emit('minigame:coinflip', {
            username,
            bet,
            result,
            win
        });

        res.json({
            success: true,
            game: 'coinflip',
            result,
            win
        });
    } catch (error) {
        logger.error('Error in coinflip game:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== PATCH: VDO.NINJA API ROUTES ==========
// Moved to VDO.Ninja Plugin (plugins/vdoninja)

// ========== SOCKET.IO EVENTS ==========

io.on('connection', (socket) => {
    logger.info(`🔌 Client connected: ${socket.id}`);
    debugLogger.log('websocket', `Client connected`, { socket_id: socket.id });

    // Mark socket as ready on first connection
    if (!initState.getState().socketReady) {
        initState.setSocketReady();
    }

    // Send initialization state to client
    socket.emit('init:state', initState.getState());

    // Send current TikTok connection status to newly connected client
    // This ensures the UI reflects the correct status even after page refresh
    if (tiktok.isActive()) {
        socket.emit('tiktok:status', {
            status: tiktok.connectionState === 'live' ? 'connected' : tiktok.connectionState,
            username: tiktok.currentUsername,
            roomId: tiktok.roomId || null,
            streamIdentity: tiktok.streamIdentity || null,
            identityPending: tiktok.connectionState === 'live_identity_pending'
        });
        // Also send current stats if connected
        socket.emit('tiktok:stats', {
            viewers: tiktok.stats.viewers,
            likes: tiktok.stats.likes,
            totalCoins: tiktok.stats.totalCoins,
            followers: tiktok.stats.followers,
            gifts: tiktok.stats.gifts,
            streamDuration: tiktok.streamStartTime 
                ? Math.floor((Date.now() - tiktok.streamStartTime) / 1000)
                : 0
        });
    } else {
        socket.emit('tiktok:status', {
            status: tiktok.connectionState || 'disconnected',
            username: tiktok.currentUsername || null,
            roomId: tiktok.roomId || null,
            streamIdentity: tiktok.streamIdentity || null
        });
    }

    // Plugin Socket Events registrieren
    pluginLoader.registerPluginSocketEvents(socket);

    // Goals: Subscribe to all goals updates (new centralized approach)
    socket.on('goals:subscribe', () => {
        socket.join('goals');
        debugLogger.log('goals', `Client subscribed to goals room`, { socket_id: socket.id });
        
        // Send snapshot of all goals with current state
        const snapshot = goals.getAllGoalsWithState();
        const snapshotData = {
            goals: snapshot,
            timestamp: Date.now(),
            sources: {
                coins: 'gifts',
                followers: 'follow',
                likes: 'like',
                subs: 'subscribe',
                superfans: 'superfan'
            }
        };
        
        socket.emit('goals:snapshot', snapshotData);
        debugLogger.log('socket-emit', `Sent goals:snapshot`, { 
            count: snapshot.length,
            socket_id: socket.id 
        }, 'debug');
    });

    // Goals: Unsubscribe from goals updates
    socket.on('goals:unsubscribe', () => {
        socket.leave('goals');
        debugLogger.log('goals', `Client unsubscribed from goals room`, { socket_id: socket.id });
    });

    // Goal Room Join (legacy - single goal)
    socket.on('goal:join', (key) => {
        socket.join(`goal_${key}`);
        logger.debug(`📊 Client joined goal room: goal_${key}`);
        debugLogger.log('goals', `Client joined goal room`, { 
            goal_key: key,
            socket_id: socket.id 
        });

        // Send initial state
        const s = goals.state[key];
        const config = goals.getGoalConfig(key);
        if (s && config) {
            const updateData = {
                type: 'goal',
                goalId: key,
                total: s.total,
                goal: s.goal,
                show: s.show,
                pct: goals.getPercent(key),
                percent: Math.round(goals.getPercent(key) * 100),
                style: config.style
            };
            socket.emit('goal:update', updateData);
            debugLogger.log('socket-emit', `Sent goal:update for ${key}`, updateData, 'debug');
        }
    });

    // Leaderboard Room Join
    socket.on('leaderboard:join', () => {
        socket.join('leaderboard');
        logger.debug('📊 Client joined leaderboard room');
    });

    // Client disconnect
    socket.on('disconnect', () => {
        logger.info(`🔌 Client disconnected: ${socket.id}`);
        debugLogger.log('websocket', `Client disconnected`, { socket_id: socket.id });
    });

    // Test Events (für Testing vom Dashboard)
    socket.on('test:alert', (data) => {
        alerts.testAlert(data.type, data.testData);
    });

    // Test Goals Events (for testing goals overlay)
    socket.on('test:goal:increment', async (data) => {
        if (data && data.id && typeof data.amount === 'number') {
            debugLogger.log('goals', `Test increment for ${data.id}: +${data.amount}`, data);
            await goals.incrementGoal(data.id, data.amount);
        }
    });

    socket.on('test:goal:reset', async (data) => {
        if (data && data.id) {
            debugLogger.log('goals', `Test reset for ${data.id}`, data);
            await goals.setGoal(data.id, 0);
            // Emit reset event
            io.to('goals').emit('goals:reset', { goalId: data.id, timestamp: Date.now() });
        }
    });

    socket.on('test:goal:set', async (data) => {
        if (data && data.id && typeof data.value === 'number') {
            debugLogger.log('goals', `Test set ${data.id} to ${data.value}`, data);
            await goals.setGoal(data.id, data.value);
        }
    });

    // VDO.Ninja Socket.IO Events are now handled by VDO.Ninja Plugin



    // Minigame events from client
    socket.on('minigame:request', async (data) => {
        logger.debug(`🎮 Minigame request: ${data.type} from ${data.username}`);
        // Handle minigame requests if needed
    });
});

// ========== TIKTOK EVENT-HANDLER ==========

// Gift Event
tiktok.on('gift', async (data) => {
    debugLogger.log('tiktok', `Gift event received`, { 
        username: data.username,
        gift: data.giftName,
        coins: data.coins
    });

    // Alert anzeigen (wenn konfiguriert)
    const minCoins = parseInt(db.getSetting('alert_gift_min_coins')) || 100;
    if (data.coins >= minCoins) {
        alerts.addAlert('gift', data);
    }

    // Goals: Coins erhöhen (Event-Data enthält bereits korrekte Coins-Berechnung)
    // Der TikTok-Connector berechnet: diamondCount * repeatCount
    // und zählt nur bei Streak-Ende (bei streakable Gifts)
    await goals.incrementGoal('coins', data.coins || 0);
    debugLogger.log('goals', `Coins goal incremented by ${data.coins}`);

    // Leaderboard: Update user stats
    if (data.username) {
        await leaderboard.trackGift(data.username, data.giftName, data.coins);
    } else {
        debugLogger.log('tiktok', 'Gift event has no username – leaderboard tracking skipped', null, 'debug');
    }

    // IFTTT Engine verarbeiten
    await iftttEngine.processEvent('tiktok:gift', data);
});

// Follow Event
tiktok.on('follow', async (data) => {
    debugLogger.log('tiktok', `Follow event received`, { username: data.username });
    
    alerts.addAlert('follow', data);

    // Goals: Follower erhöhen
    await goals.incrementGoal('followers', 1);
    debugLogger.log('goals', `Followers goal incremented by 1`);

    // Leaderboard: Track follow
    if (data.username) {
        await leaderboard.trackFollow(data.username);
    } else {
        debugLogger.log('tiktok', 'Follow event has no username – leaderboard tracking skipped', null, 'debug');
    }

    await iftttEngine.processEvent('tiktok:follow', data);
});

// Subscribe Event
tiktok.on('subscribe', async (data) => {
    debugLogger.log('tiktok', `Subscribe event received`, { username: data.username });
    
    alerts.addAlert('subscribe', data);

    // Goals: Subscriber erhöhen
    await goals.incrementGoal('subs', 1);
    debugLogger.log('goals', `Subs goal incremented by 1`);

    // Subscription Tiers: Process subscription
    await subscriptionTiers.processSubscription(data);

    // Leaderboard: Track subscription
    if (data.username) {
        await leaderboard.trackSubscription(data.username);
    } else {
        debugLogger.log('tiktok', 'Subscribe event has no username – leaderboard tracking skipped', null, 'debug');
    }

    await iftttEngine.processEvent('tiktok:subscribe', data);
});

// Share Event
tiktok.on('share', async (data) => {
    alerts.addAlert('share', data);

    // Leaderboard: Track share
    if (data.username) {
        await leaderboard.trackShare(data.username);
    } else {
        debugLogger.log('tiktok', 'Share event has no username – leaderboard tracking skipped', null, 'debug');
    }

    await iftttEngine.processEvent('tiktok:share', data);
});

// Chat Event
tiktok.on('chat', async (data) => {
    // Leaderboard: Track chat message
    if (data.username) {
        await leaderboard.trackChat(data.username);
    } else {
        debugLogger.log('tiktok', 'Chat event has no username – leaderboard tracking skipped', null, 'debug');
    }

    // IFTTT Engine verarbeiten
    await iftttEngine.processEvent('tiktok:chat', data);
});

// Like Event
tiktok.on('like', async (data) => {
    debugLogger.log('tiktok', `Like event received`, { 
        username: data.username,
        likeCount: data.likeCount,
        totalLikes: data.totalLikes
    }, 'debug');

    // Goals: Total Likes setzen (Event-Data enthält bereits robustes totalLikes)
    // Der TikTok-Connector extrahiert totalLikes aus verschiedenen Properties
    if (data.totalLikes !== undefined && data.totalLikes !== null) {
        await goals.setGoal('likes', data.totalLikes);
        debugLogger.log('goals', `Likes goal set to ${data.totalLikes}`, null, 'debug');
    } else {
        // Sollte nicht mehr vorkommen, da Connector immer totalLikes liefert
        await goals.incrementGoal('likes', data.likeCount || 1);
        debugLogger.log('goals', `Likes goal incremented by ${data.likeCount || 1}`, null, 'debug');
    }

    // Leaderboard: Track likes
    if (data.username) {
        await leaderboard.trackLike(data.username, data.likeCount || 1);
    } else {
        debugLogger.log('tiktok', 'Like event has no username – leaderboard tracking skipped', null, 'debug');
    }

    // IFTTT Engine verarbeiten
    await iftttEngine.processEvent('tiktok:like', data);
});

// Connected Event (System)
tiktok.on('connected', async (data) => {
    debugLogger.log('system', 'TikTok LIVE confirmed', {
        username: data.username,
        roomId: data.roomId,
        streamIdentity: data.streamIdentity,
        isNewStream: data.isNewStream,
        isReconnect: data.isReconnect,
        identityPending: data.identityPending
    });
    await iftttEngine.processEvent('system:connected', data);

    // Re-register all plugin TikTok event handlers after every (re-)connect.
    // The TikTok EventEmitter is set up fresh on each connect and plugin handlers
    // must be re-attached to ensure they fire correctly after a reconnect.
    // registerPluginTikTokEvents() performs an atomic removeListener + on(), so
    // calling it here is idempotent and safe even on the initial connection.
    pluginLoader.registerPluginTikTokEvents(tiktok);
});

// Disconnected Event (System)
tiktok.on('disconnected', async (data) => {
    debugLogger.log('system', 'TikTok disconnected', { username: data.username });
    await iftttEngine.processEvent('system:disconnected', data);
});

// Error Event (System)
tiktok.on('error', async (data) => {
    debugLogger.log('system', 'TikTok error', { error: data.error });
    await iftttEngine.processEvent('system:error', data);
});

// Viewer Change Event
tiktok.on('viewerChange', async (data) => {
    debugLogger.log('tiktok', 'Viewer count changed', { viewerCount: data.viewerCount }, 'debug');
    await iftttEngine.processEvent('tiktok:viewerChange', data);
});

// A confirmed room-ID change is the only event allowed to reset stream sessions.
tiktok.on('streamSessionStarted', async (data) => {
    logger.info(`🔄 New stream session confirmed: ${data.streamIdentity} - resetting session data`);
    
    // Reset all goals to 0 (new stream session)
    try {
        await goals.resetAllGoals();
        logger.info('✅ Goals reset for new stream session');
    } catch (error) {
        logger.error('Error resetting goals:', error);
    }
    
    // Reset leaderboard session stats (keep all-time stats)
    try {
        leaderboard.resetSessionStats();
        logger.info('✅ Leaderboard session stats reset for new stream session');
    } catch (error) {
        logger.error('Error resetting leaderboard session stats:', error);
    }
    
    io.emit('stream:session-started', data);
    debugLogger.log('system', 'New stream session - session data reset', data);
    await iftttEngine.processEvent('system:streamSessionStarted', data);
});

// Backward-compatible notification for consumers that observe stream changes.
tiktok.on('streamChanged', async (data) => {
    io.emit('stream:changed', data);
    await iftttEngine.processEvent('system:streamChanged', data);
});

// ========== NETWORK MANAGER API ROUTES ==========

registerOverlayTunnelRoutes({
    app,
    networkManager,
    getPort: () => PORT || 3000,
    apiLimiter,
    logger
});

/**
 * GET /api/network/config
 * Returns full network config including interfaces, URLs, tunnel status.
 */
app.get('/api/network/config', apiLimiter, (req, res) => {
    try {
        res.json({ success: true, config: networkManager.getConfig(PORT || 3000) });
    } catch (error) {
        logger.error('Error getting network config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/network/interfaces
 * Returns detected network interfaces (re-detected on each call).
 */
app.get('/api/network/interfaces', apiLimiter, (req, res) => {
    try {
        res.json({ success: true, interfaces: networkManager.getInterfaces() });
    } catch (error) {
        logger.error('Error getting network interfaces:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/network/config
 * Update network settings (mode, selectedInterfaces, customAddress, tunnel config, corsExtra, externalURLs).
 */
app.post('/api/network/config', apiLimiter, (req, res) => {
    try {
        const { needsRestart } = networkManager.applyConfig(req.body);
        // Refresh CORS whitelist after config change
        ALLOWED_ORIGINS = networkManager.getAllowedOrigins(PORT || 3000);
        logger.info(`🌐 Network config updated (needsRestart: ${needsRestart})`);
        res.json({
            success: true,
            needsRestart,
            config: networkManager.getConfig(PORT || 3000)
        });
    } catch (error) {
        logger.error('Error updating network config:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/network/tunnel/start
 * Start tunnel with configured provider.
 */
app.post('/api/network/tunnel/start', apiLimiter, async (req, res) => {
    try {
        const url = await networkManager.startTunnel(PORT || 3000);
        ALLOWED_ORIGINS = networkManager.getAllowedOrigins(PORT || 3000);
        logger.info(`🚇 Tunnel started via API: ${url}`);
        res.json({ success: true, tunnelURL: url });
    } catch (error) {
        logger.error('Error starting tunnel:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/network/tunnel/stop
 * Stop running tunnel.
 */
app.post('/api/network/tunnel/stop', apiLimiter, (req, res) => {
    try {
        networkManager.stopTunnel();
        ALLOWED_ORIGINS = networkManager.getAllowedOrigins(PORT || 3000);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error stopping tunnel:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/network/external-url
 * Add an external URL to CORS whitelist.
 * Body: { url: string }
 */
app.post('/api/network/external-url', apiLimiter, (req, res) => {
    try {
        const { url } = req.body;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ success: false, error: 'url is required' });
        }
        const urls = networkManager.addExternalURL(url);
        ALLOWED_ORIGINS = networkManager.getAllowedOrigins(PORT || 3000);
        res.json({ success: true, externalURLs: urls });
    } catch (error) {
        logger.error('Error adding external URL:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/network/external-url
 * Remove an external URL from CORS whitelist.
 * Body: { url: string }
 */
app.delete('/api/network/external-url', apiLimiter, (req, res) => {
    try {
        const { url } = req.body;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ success: false, error: 'url is required' });
        }
        const urls = networkManager.removeExternalURL(url);
        ALLOWED_ORIGINS = networkManager.getAllowedOrigins(PORT || 3000);
        res.json({ success: true, externalURLs: urls });
    } catch (error) {
        logger.error('Error removing external URL:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ========== SERVER STARTEN ==========

// ========== PORT RESOLUTION ==========
const PortManager = require('./modules/port-manager');

function parsePortEnv(value, fallback) {
    const port = Number.parseInt(value, 10);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
        return port;
    }
    return fallback;
}

const PREFERRED_PORT = parsePortEnv(process.env.LTTH_PORT || process.env.PORT, 3000);
const MAX_PORT = parsePortEnv(process.env.LTTH_MAX_PORT, Math.min(PREFERRED_PORT + 50, 65535));
const portManager = new PortManager({
    preferredPort: PREFERRED_PORT,
    maxPort: Math.max(PREFERRED_PORT, MAX_PORT),
    appIdentifier: 'ltth'
});

let PORT; // resolved at startup in the async IIFE below
const LTTH_PORT_FILE_PATH = path.join(__dirname, '..', '.ltth_port');
const OBS_WRAPPER_FILE_PATH = path.join(__dirname, '..', 'obs-overlay-wrapper.html');
let deferredConfigRepairScheduled = false;

function scheduleDeferredConfigRepair() {
    if (deferredConfigRepairScheduled || process.env.LTTH_SKIP_DEFERRED_CONFIG_REPAIR === 'true') {
        return;
    }

    deferredConfigRepairScheduled = true;
    const delayMs = parsePortEnv(process.env.LTTH_CONFIG_REPAIR_DELAY_MS, 30000);
    const maxBytes = Number.parseInt(process.env.LTTH_CONFIG_REPAIR_MAX_DB_BYTES || `${250 * 1024 * 1024}`, 10);

    const timer = setTimeout(() => {
        logger.info('🔧 Starting deferred profile database repair');
        configRepair.runStartupRepair({
            profileDatabaseOptions: {
                maxBytes,
                skipUsernames: [loadedProfile]
            }
        });
    }, delayMs);

    if (typeof timer.unref === 'function') {
        timer.unref();
    }
}

/**
 * Persist current running server port for launchers and helper tools.
 * @param {number} resolvedPort
 */
function writeCurrentPortFile(resolvedPort) {
    fs.writeFileSync(LTTH_PORT_FILE_PATH, String(resolvedPort), 'utf8');
}

/**
 * Generate local OBS wrapper HTML for file-based Browser Source usage.
 * @param {number} resolvedPort
 */
function writeObsOverlayWrapper(resolvedPort) {
    const wrapperTemplate = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LTTH OBS Wrapper</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
    }
    iframe {
      border: 0;
      width: 100%;
      height: 100%;
      display: block;
      background: transparent;
    }
  </style>
</head>
<body>
  <iframe id="ltthOverlayFrame" title="LTTH Overlay"></iframe>
  <script>
    (() => {
      const iframe = document.getElementById('ltthOverlayFrame');
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      iframe.src = 'http://localhost:###PORT###/overlay.html' + search + hash;
    })();
  </script>
</body>
</html>`;

    fs.writeFileSync(
        OBS_WRAPPER_FILE_PATH,
        wrapperTemplate.replace(/###PORT###/g, String(resolvedPort)),
        'utf8'
    );
}

// Async Initialisierung vor Server-Start
(async () => {
    // ========== PORT RESOLUTION (VOR Plugin-Loading) ==========
    PORT = portManager.preferredPort;
    const pluginsDisabledByLauncher = process.env.DISABLE_PLUGINS === 'true' || process.env.LTTH_SAFE_MODE === 'true';
    logger.info(`🔌 Port binding starts at ${PORT} (range ${portManager.preferredPort}-${portManager.maxPort})`);

    // Plugins laden VOR Server-Start, damit alle Routen verfügbar sind
    logger.info('🔌 Loading plugins...');
    try {
        const plugins = pluginsDisabledByLauncher ? [] : await pluginLoader.loadAllPlugins();
        const loadedCount = pluginLoader.plugins.size;

        initState.setPluginsLoaded(loadedCount);

        // Mark each loaded plugin as initialized
        plugins.forEach(plugin => {
            if (plugin) {
                initState.setPluginInitialized(plugin.id, true);
            }
        });

        // TikTok-Events für Plugins registrieren
        if (!pluginsDisabledByLauncher) {
            pluginLoader.registerPluginTikTokEvents(tiktok);
        } else {
            logger.warn('[SAFE-MODE] Plugin loading disabled by launcher environment.');
        }

        // ========== PLUGIN STATIC FILES ==========
        // Register static file serving AFTER plugins are loaded
        // This ensures plugin-registered routes take precedence over static file serving
        
        app.use('/plugins', express.static(pluginsDir));
        logger.info('📂 Plugin static files served from /plugins/* with global OBS cache protection');

        if (loadedCount > 0) {
            logger.info(`✅ ${loadedCount} plugin(s) loaded successfully`);

            // IFTTT Engine: Plugin-Injektionen
            const vdoninjaPlugin = pluginLoader.getPluginInstance('vdoninja');
            if (vdoninjaPlugin && vdoninjaPlugin.getManager) {
                iftttServices.vdoninja = vdoninjaPlugin.getManager();
                logger.info('✅ VDO.Ninja Manager injected into IFTTT Engine');
            }

            const oscBridgePlugin = pluginLoader.getPluginInstance('osc-bridge');
            if (oscBridgePlugin && oscBridgePlugin.getOSCBridge) {
                iftttServices.osc = oscBridgePlugin.getOSCBridge();
                logger.info('✅ OSC-Bridge injected into IFTTT Engine');
            }

            const ttsPlugin = pluginLoader.getPluginInstance('tts');
            if (ttsPlugin) {
                iftttServices.tts = ttsPlugin;
                logger.info('✅ TTS injected into IFTTT Engine');
            }

            iftttServices.pluginLoader = pluginLoader;
            iftttServices.obs = obs;
            iftttServices.goals = goals;
            logger.info('✅ All services injected into IFTTT Engine');

            // Allow plugins to register IFTTT components
            pluginLoader.plugins.forEach((plugin, pluginId) => {
                if (plugin.registerIFTTTComponents) {
                    try {
                        plugin.registerIFTTTComponents(iftttEngine.getRegistries());
                        logger.info(`✅ Plugin "${pluginId}" registered IFTTT components`);
                    } catch (error) {
                        logger.error(`❌ Plugin "${pluginId}" failed to register IFTTT components:`, error);
                    }
                }
            });

            // Setup timer-based triggers
            iftttEngine.setupTimerTriggers();
            logger.info('⏰ IFTTT timer triggers initialized');
            
            initState.setPluginInjectionsComplete();
        } else {
            logger.info('ℹ️  No plugins found in /plugins directory');
            
            // Still register static file serving even with no plugins.
            app.use('/plugins', express.static(pluginsDir));
            iftttEngine.setupTimerTriggers();
            logger.info('IFTTT timer triggers initialized');
            logger.info('📂 Plugin static files served from /plugins/* with global OBS cache protection');
            
            initState.setPluginsLoaded(0);
            initState.setPluginInjectionsComplete();
        }
    } catch (error) {
        logger.error(`⚠️  Error loading plugins: ${error.message}`);
        initState.addError('plugin-loader', 'Failed to load plugins', error);
    }

    // Graceful Shutdown via HTTP (für Dashboard Shutdown-Button)
    app.post('/api/shutdown', (req, res) => {
        logger.info('🛑 Shutdown requested via API');
        res.json({ success: true, message: 'Shutting down...' });
        // Increased delay to 500ms to ensure the HTTP response reaches the client
        // before the process starts shutting down
        setTimeout(() => {
            process.emit('SIGINT');
        }, 500);
    });

    // Jetzt Server starten
    const onServerListening = async () => {
        initState.setServerStarted();
        ALLOWED_ORIGINS = networkManager.getAllowedOrigins(PORT);
        logger.info(`📋 CORS whitelist initialized for port ${PORT} (mode: ${networkManager.bindMode})`);

        try {
            writeCurrentPortFile(PORT);
            logger.info(`📝 Runtime port file written: ${LTTH_PORT_FILE_PATH}`);
        } catch (error) {
            logger.error(`❌ Failed to write runtime port file: ${error.message}`);
        }

        try {
            writeObsOverlayWrapper(PORT);
            logger.info(`🎬 OBS local wrapper updated: ${OBS_WRAPPER_FILE_PATH}`);
        } catch (error) {
            logger.error(`❌ Failed to write OBS local wrapper: ${error.message}`);
        }

        scheduleDeferredConfigRepair();

        const accessURLs = networkManager.getAccessURLs(PORT);

        logger.info('\n' + '='.repeat(50));
        logger.info('✅ Pup Cids little TikTool Helper läuft!');
        logger.info('='.repeat(50));
        logger.info(`\n📊 Dashboard:     ${accessURLs.localhost}/dashboard.html`);
        logger.info(`🎬 Overlay:       ${accessURLs.localhost}/overlay.html`);
        logger.info(`📚 API Docs:      ${accessURLs.localhost}/api-docs`);
        logger.info(`🐾 Pup Cid:       https://www.tiktok.com/@pupcid`);
        if (accessURLs.lan.length > 0) {
            logger.info('\n🌐 LAN Access:');
            accessURLs.lan.forEach(l => logger.info(`   ${l.label}: ${l.url}/dashboard.html`));
        }
        if (PORT !== PREFERRED_PORT) {
            logger.info(`\n⚠️  ACHTUNG: Server läuft auf Port ${PORT} statt ${PREFERRED_PORT}!`);
            logger.info(`   Overlay-URLs in OBS müssen ggf. angepasst werden.`);
        }
        logger.info('\n' + '='.repeat(50));
        logger.info('\n💡 HINWEIS: Öffne das Overlay im OBS Browser-Source');
        logger.info('   und klicke "✅ Audio aktivieren" für vollständige Funktionalität.');
        logger.info('\n⌨️  Beenden:      Drücke Strg+C');
        logger.info('='.repeat(50) + '\n');

        // OBS WebSocket auto-connect (if configured)
    const obsConfigStr = db.getSetting('obs_websocket_config');
    if (obsConfigStr) {
        try {
            const obsConfig = JSON.parse(obsConfigStr);
            if (obsConfig.enabled && obsConfig.host && obsConfig.port) {
                logger.info(`🎬 Connecting to OBS at ${obsConfig.host}:${obsConfig.port}...`);
                try {
                    await obs.connect(obsConfig.host, obsConfig.port, obsConfig.password);
                    logger.info('✅ OBS connected successfully');
                } catch (error) {
                    logger.warn('⚠️  Could not connect to OBS:', error.message);
                    logger.info('   You can configure OBS connection in settings');
                }
            }
        } catch (error) {
            logger.warn('⚠️  Failed to parse OBS config:', error.message);
        }
    }

    // Configuration: Auto-reconnect delays
    const TIKTOK_AUTO_RECONNECT_DELAY_MS = 2000; // Wait 2 seconds after server start
    const GIFT_CATALOG_UPDATE_DELAY_MS = 3000; // Wait 3 seconds for gift catalog update

    // TikTok auto-reconnect (if configured)
    const autoReconnectSetting = db.getSetting('tiktok_auto_reconnect');
    const savedUsername = db.getSetting('last_connected_username');
    const autoReconnectPolicy = shouldAutoReconnectOnStartup({
        autoReconnectSetting,
        savedUsername,
        env: process.env
    });
    
    if (autoReconnectPolicy.enabled) {
        logger.info(`🔄 Auto-Reconnect aktiviert: Versuche Verbindung zu @${savedUsername}...`);
        setTimeout(async () => {
            try {
                await tiktok.connect(savedUsername);
                logger.info(`✅ Automatisch verbunden mit @${savedUsername}`);
                // Note: Gift catalog is automatically updated during connection (see tiktok.js line 320-334)
            } catch (error) {
                logger.warn('⚠️  Automatische Verbindung fehlgeschlagen:', error.message);
                logger.info('   Dies ist normal wenn der Stream nicht live ist.');
                logger.info('   Sie können manuell über das Dashboard verbinden.');
            }
        }, TIKTOK_AUTO_RECONNECT_DELAY_MS);
    } else if (savedUsername) {
        logger.info(`ℹ️  Auto-Reconnect deaktiviert. Letzter Stream: @${savedUsername}`);
        
        // Update gift catalog independently when not auto-connecting
        // (When auto-connecting, this happens automatically during tiktok.connect())
        if (autoReconnectPolicy.reason !== 'safe_mode' && autoReconnectPolicy.reason !== 'env_disabled') {
            logger.info(`🎁 Aktualisiere Gift-Katalog für @${savedUsername}...`);
            setTimeout(async () => {
                try {
                    const result = await tiktok.updateGiftCatalog({
                        preferConnected: true,
                        username: savedUsername
                    });
                    if (result.ok) {
                        logger.info(`✅ ${result.message}`);
                    } else {
                        logger.info(`ℹ️  Gift-Katalog-Update: ${result.message}`);
                    }
                } catch (error) {
                    logger.warn('⚠️  Gift-Katalog konnte nicht automatisch aktualisiert werden:', error.message);
                    logger.info('   Dies ist normal wenn der Stream nicht live ist.');
                }
            }, GIFT_CATALOG_UPDATE_DELAY_MS);
        }
    }

        // Cloud Sync initialisieren (wenn aktiviert)
        try {
            await cloudSync.initialize();
        } catch (error) {
            logger.warn(`⚠️  Cloud Sync konnte nicht initialisiert werden: ${error.message}`);
        }

        // Auto-start tunnel if configured
        if (networkManager.tunnelEnabled) {
            logger.info(`🚇 Auto-starting tunnel (provider: ${networkManager.tunnelProvider})...`);
            networkManager.startTunnel(PORT).then(url => {
                logger.info(`🚇 Tunnel ready: ${url}`);
                ALLOWED_ORIGINS = networkManager.getAllowedOrigins(PORT);
            }).catch(err => {
                logger.warn(`⚠️  Tunnel auto-start failed: ${err.message}`);
            });
        }

        // Auto-update is disabled in UpdateManager; this call is kept as a no-op.
        try {
            if (updateManager && typeof updateManager.startAutoCheck === 'function') {
                updateManager.startAutoCheck(24);
            }
        } catch (error) {
            logger.warn(`⚠️  Auto-Update-Check konnte nicht gestartet werden: ${error.message}`);
        }

        // ========== ERROR HANDLING MIDDLEWARE ==========
        // IMPORTANT: Error handlers must be registered AFTER plugin routes are loaded
        // Catch-all error handler - ensures JSON responses for API routes
        app.use((err, req, res, next) => {
            logger.error('Express Error Handler:', err);

            // Always return JSON for API routes
            if (req.path.startsWith('/api/')) {
                return res.status(err.status || 500).json({
                    success: false,
                    error: err.message || 'Internal Server Error'
                });
            }

            // For non-API routes, return JSON if Accept header indicates JSON
            if (req.accepts('json') && !req.accepts('html')) {
                return res.status(err.status || 500).json({
                    success: false,
                    error: err.message || 'Internal Server Error'
                });
            }

            // Default: return generic error page
            res.status(err.status || 500).send('Internal Server Error');
        });

        // 404 handler - ensures JSON responses for API routes
        app.use((req, res) => {
            if (req.path.startsWith('/api/')) {
                return res.status(404).json({
                    success: false,
                    error: 'API endpoint not found'
                });
            }

            if (req.accepts('json') && !req.accepts('html')) {
                return res.status(404).json({
                    success: false,
                    error: 'Not found'
                });
            }

            // Get locale from request (set by i18n middleware) or default to 'en'
            const locale = req.locale || 'en';
            
            // HTML escape helper function to prevent XSS
            const escapeHtml = (str) => {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            };
            
            // Check if this is a plugin UI route and the plugin is disabled
            // Plugin routes follow pattern: /{plugin-id}/ui or /{plugin-id}/overlay
            const pathMatch = req.path.match(/^\/([a-z0-9_-]+)\/(ui|overlay)$/i);
            if (pathMatch) {
                const potentialPluginId = pathMatch[1];
                const pluginPath = path.join(__dirname, 'plugins', potentialPluginId);
                const manifestPath = path.join(pluginPath, 'plugin.json');
                
                // Check if plugin directory exists with manifest
                if (fs.existsSync(manifestPath)) {
                    try {
                        const manifestData = fs.readFileSync(manifestPath, 'utf8');
                        const manifest = JSON.parse(manifestData);
                        
                        // Check plugin state - it might be disabled or failed to load
                        const isLoaded = pluginLoader.plugins.has(manifest.id);
                        
                        if (!isLoaded) {
                            // Check if plugin is enabled in state but failed to load
                            const pluginState = pluginLoader.state[manifest.id] || {};
                            const isEnabledInState = pluginState.enabled === true;
                            const isEnabledInManifest = manifest.enabled !== false;
                            const isIntentionallyEnabled = isEnabledInState || (pluginState.enabled === undefined && isEnabledInManifest);
                            
                            // Plugin exists but is not loaded - show specific page
                            const pluginName = escapeHtml(manifest.name || manifest.id);
                            const pluginId = escapeHtml(manifest.id);
                            
                            // Different messages based on whether plugin is enabled but failed to load
                            let title, heading, message, reason;
                            if (isIntentionallyEnabled) {
                                // Plugin is enabled but failed to load - likely an error
                                title = escapeHtml(req.t ? req.t('errors.plugin_load_failed_title') : 'Plugin Failed to Load');
                                heading = escapeHtml(req.t ? req.t('errors.plugin_load_failed_heading') : '⚠️ Plugin Failed to Load');
                                message = (req.t ? req.t('errors.plugin_load_failed_message', { pluginName }) : `The "${pluginName}" plugin is enabled but failed to load.`);
                                reason = escapeHtml(req.t ? req.t('errors.plugin_load_failed_reason') : 'Check the server logs for errors. Try reloading the plugin or restart the application.');
                            } else {
                                // Plugin is disabled
                                title = escapeHtml(req.t ? req.t('errors.plugin_disabled_title') : 'Plugin Disabled');
                                heading = escapeHtml(req.t ? req.t('errors.plugin_disabled_heading') : '🔌 Plugin is Disabled');
                                message = (req.t ? req.t('errors.plugin_disabled_message', { pluginName }) : `The "${pluginName}" plugin is currently disabled.`);
                                reason = escapeHtml(req.t ? req.t('errors.plugin_disabled_reason') : 'You can enable this plugin in the Plugin Manager or click the button below.');
                            }
                            const enableButton = escapeHtml(req.t ? req.t('errors.enable_plugin_button') : 'Enable Plugin');
                            const enablingText = escapeHtml(req.t ? req.t('errors.enabling_plugin') : 'Enabling...');
                            const successText = escapeHtml(req.t ? req.t('errors.plugin_enabled_success') : 'Plugin enabled! Redirecting...');
                            const errorText = escapeHtml(req.t ? req.t('errors.plugin_enabled_error') : 'Failed to enable plugin. Please try again.');
                            const pluginManagerLink = escapeHtml(req.t ? req.t('errors.go_to_plugin_manager') : 'Go to Plugin Manager');
                            const backLink = escapeHtml(req.t ? req.t('errors.back_to_dashboard') : '← Back to Dashboard');
                            
                            return res.status(404).send(`<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #eee;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        }
        .container {
            padding: 40px;
            max-width: 500px;
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 1rem;
            color: #f472b6;
        }
        p {
            color: #94a3b8;
            margin-bottom: 1.5rem;
            line-height: 1.6;
        }
        .plugin-name {
            color: #60a5fa;
            font-weight: 600;
        }
        .button-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: center;
            margin-top: 24px;
        }
        .enable-btn {
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            border: none;
            padding: 14px 32px;
            font-size: 1rem;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-weight: 600;
            min-width: 200px;
        }
        .enable-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        }
        .enable-btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }
        .enable-btn.success {
            background: linear-gradient(135deg, #22c55e, #16a34a);
        }
        .enable-btn.error {
            background: linear-gradient(135deg, #ef4444, #dc2626);
        }
        a {
            color: #60a5fa;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .link-secondary {
            color: #94a3b8;
            font-size: 0.9rem;
        }
        .link-secondary:hover {
            color: #60a5fa;
        }
        .status-message {
            margin-top: 12px;
            font-size: 0.9rem;
            min-height: 24px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${heading}</h1>
        <p>${escapeHtml(message)}</p>
        <p>${reason}</p>
        <div class="button-container">
            <button class="enable-btn" id="enableBtn" 
                    data-plugin-id="${pluginId}"
                    data-text-enabling="${enablingText}"
                    data-text-success="${successText}"
                    data-text-error="${errorText}">
                ${enableButton}
            </button>
            <div class="status-message" id="statusMessage"></div>
            <a href="/dashboard.html#plugins" class="link-secondary">${pluginManagerLink}</a>
            <a href="/dashboard.html">${backLink}</a>
        </div>
    </div>
    <script src="/js/plugin-enable.js"></script>
</body>
</html>`);
                        }
                    } catch (e) {
                        // Failed to read/parse manifest, fall through to generic 404
                        logger.warn(`Failed to check plugin manifest for ${potentialPluginId}: ${e.message}`);
                    }
                }
            }
            
            // Get translated messages using req.t (i18n helper attached by middleware)
            const title = escapeHtml(req.t ? req.t('errors.page_not_found_title') : 'Page Not Found');
            const heading = escapeHtml(req.t ? req.t('errors.page_not_found_heading') : '🔌 Page Not Found');
            const message = escapeHtml(req.t ? req.t('errors.page_not_found_message') : 'This page or plugin is not available.');
            const reason = escapeHtml(req.t ? req.t('errors.page_not_found_reason') : 'The plugin may be disabled or the route doesn\'t exist.');
            const backLink = escapeHtml(req.t ? req.t('errors.back_to_dashboard') : '← Back to Dashboard');

            // Return proper HTML with DOCTYPE to prevent Quirks Mode in browsers/iframes
            res.status(404).send(`<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #eee;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        }
        .container {
            padding: 40px;
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 1rem;
            color: #f472b6;
        }
        p {
            color: #94a3b8;
            margin-bottom: 1.5rem;
        }
        a {
            color: #60a5fa;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${heading}</h1>
        <p>${message}<br>${reason}</p>
        <a href="/dashboard.html">${backLink}</a>
    </div>
</body>
</html>`);
        });

        // Browser opening is handled by the splashscreen launcher
        // Only open browser if explicitly requested via OPEN_BROWSER=true
        const shouldOpenBrowser = process.env.OPEN_BROWSER === 'true' && !browserOpened;
        
        if (shouldOpenBrowser) {
            browserOpened = true; // Setze Guard sofort
            
            try {
                const open = (await import('open')).default;
                await open(`http://localhost:${PORT}/dashboard.html`);
                logger.info(`ℹ️  Browser geöffnet: http://localhost:${PORT}/dashboard.html\n`);
            } catch (error) {
                logger.info('ℹ️  Browser konnte nicht automatisch geöffnet werden.');
                logger.info(`   Öffne manuell: http://localhost:${PORT}/dashboard.html\n`);
            }
        }
    };

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            const nextPort = portManager.getNextPort(PORT);
            if (!nextPort) {
                logger.error(`❌ No free port in range ${portManager.preferredPort}-${portManager.maxPort}. Last failed port: ${PORT}`);
                process.exit(1);
                return;
            }

            logger.warn(`⚠️  Port ${PORT} is in use. Retrying with port ${nextPort}...`);
            PORT = nextPort;
            setTimeout(() => {
                server.listen({ port: PORT, host: BIND_ADDRESS, exclusive: true }, onServerListening);
            }, 500);
            return;
        }

        logger.error(`❌ Server error: ${err.message}`);
        process.exit(1);
    });

    server.listen({ port: PORT, host: BIND_ADDRESS, exclusive: true }, onServerListening);
})(); // Schließe async IIFE

// Graceful Shutdown (shared handler for SIGINT and SIGTERM)
let _isShuttingDown = false;
async function gracefulShutdown(signal) {
    // Prevent multiple invocations (e.g. SIGINT + SIGTERM arriving close together)
    if (_isShuttingDown) return;
    _isShuttingDown = true;

    logger.info(`\n\n🛑 Shutting down gracefully (${signal})...`);

    // Force-Exit nach 5 Sekunden falls server.close() hängt
    const forceExitTimer = setTimeout(() => {
        logger.warn('⚠️  Graceful shutdown timed out after 5s, forcing exit...');
        process.exit(0);
    }, 5000);
    forceExitTimer.unref();

    // Plugins own routes, sockets, timers and optional servers. Release them
    // first and in reverse load order so dependants disappear before providers.
    const loadedPluginIds = Array.from(pluginLoader.plugins.keys()).reverse();
    for (const pluginId of loadedPluginIds) {
        try {
            const unloaded = await pluginLoader.unloadPlugin(pluginId);
            if (!unloaded) logger.error(`Plugin ${pluginId} reported cleanup errors during shutdown`);
        } catch (error) {
            logger.error(`Failed to unload plugin ${pluginId} during shutdown: ${error.message}`);
        }
    }

    // TikTok-Verbindung trennen
    if (tiktok.isActive()) {
        tiktok.disconnect();
    }

    // OBS-Verbindung trennen
    if (obs.isConnected()) {
        try { await obs.disconnect(); } catch (e) { logger.debug('OBS disconnect error:', e.message); }
    }

    // Cloud Sync beenden
    try {
        await cloudSync.shutdown();
    } catch (error) {
        logger.error('Error shutting down cloud sync:', error);
    }

    // Network Manager beenden (stops any running tunnel)
    try {
        networkManager.shutdown();
    } catch (error) {
        logger.error('Error shutting down network manager:', error);
    }

    // Alle Socket.io-Verbindungen sofort trennen damit server.close() nicht endlos wartet
    io.disconnectSockets(true);

    // Datenbank schließen
    db.close();

    // Server schließen
    server.close(() => {
        clearTimeout(forceExitTimer);
        logger.info('✅ Server closed');
        process.exit(0);
    });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Error Handling
process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, server, io, db, tiktok, alerts, iftttEngine, goals, leaderboard, subscriptionTiers };
