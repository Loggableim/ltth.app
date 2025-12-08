// ===========================================================================
// ELECTRON MODE BOOTSTRAP (FALLBACK)
// Primary bootstrap is done via electron-bootstrap.js preloaded with -r flag.
// This is a fallback in case the preload doesn't work or for direct execution.
// ===========================================================================
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

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

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
const CloudSyncEngine = require('./modules/cloud-sync');

// ========== EXPRESS APP ==========
const app = express();
const server = http.createServer(app);

// Trust proxy configuration for rate limiting when behind a reverse proxy
// Set to 1 for single proxy (nginx, cloudflare, etc.), or 'loopback' for localhost only
// This ensures req.ip returns the correct client IP address
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// ========== SOCKET.IO CONFIGURATION ==========
// Configure Socket.IO with proper CORS and transport settings for OBS BrowserSource compatibility
const io = socketIO(server, {
    cors: {
        origin: function(origin, callback) {
            // Allow requests with no origin (like mobile apps, curl requests, or OBS BrowserSource)
            if (!origin) return callback(null, true);
            
            // Check if origin is in the allowed list
            const ALLOWED_ORIGINS = [
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                'http://localhost:8080',
                'http://127.0.0.1:8080',
                'null'
            ];
            
            if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                // For OBS BrowserSource and other local contexts, allow null origin
                callback(null, true);
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

// Middleware
app.use(express.json());

// CORS-Header mit Whitelist
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'null'
];

app.use((req, res, next) => {
    const origin = req.headers.origin;

    // Whitelist-basiertes CORS
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
    } else if (!origin) {
        // Requests ohne Origin (z.B. Server-to-Server)
        res.header('Access-Control-Allow-Origin', 'null');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Dashboard and plugin UIs need CSP policy
    const isDashboard = req.path === '/' || req.path.includes('/dashboard.html');
    const isPluginUI = req.path.includes('/goals/ui') || req.path.includes('/goals/overlay') ||
                       req.path.includes('/emoji-rain/ui') || req.path.includes('/gift-milestone/ui') ||
                       req.path.includes('/plugins/') ||
                       req.path.includes('/openshock/');

    if (isDashboard || isPluginUI) {
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
        res.header('Content-Security-Policy',
            `default-src 'self'; ` +
            `script-src 'self' 'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=' 'sha256-c4w6M/3j2U1Cx+Flf6JkYQY5MJP+YrJdgD4X3VC1Iho=' 'unsafe-eval' https://st.chatango.com; ` +  // Socket.IO hash + admin-panel hash + Chatango eval
            `script-src-elem 'self' 'unsafe-inline' https://st.chatango.com https://cdnjs.cloudflare.com; ` +  // Allow Chatango inline script elements with JSON config + GSAP from cdnjs
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
    } else {
        // Strict CSP for other routes (including overlays for OBS)
        res.header('Content-Security-Policy',
            `default-src 'self'; ` +
            `script-src 'self' 'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=' 'sha256-c4w6M/3j2U1Cx+Flf6JkYQY5MJP+YrJdgD4X3VC1Iho=' 'unsafe-eval' https://st.chatango.com; ` +  // Socket.IO hash + admin-panel hash + Chatango eval
            `script-src-elem 'self' 'unsafe-inline' https://st.chatango.com https://cdnjs.cloudflare.com; ` +  // Allow Chatango inline script elements with JSON config + GSAP from cdnjs
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

app.use(express.static('public'));

// Serve GSAP library for overlays
app.use('/gsap', express.static(path.join(__dirname, 'node_modules', 'gsap', 'dist')));

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
const db = new Database(dbPath, activeProfile); // Pass streamer_id as activeProfile
logger.info(`✅ Database initialized: ${dbPath}`);
logger.info(`💡 All settings (including API keys) are stored here and will survive app updates!`);
logger.info(`👤 Streamer ID for scoped data: ${activeProfile}`);
initState.setDatabaseReady();

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

// PERFORMANCE OPTIMIZATION: Session Extractor is now lazy-loaded
// It will be initialized on first use via getSessionExtractor()
// This saves ~50-100ms at startup for users who don't use session extraction

// New Modules
const obs = new OBSWebSocket(db, io, logger);
const subscriptionTiers = new SubscriptionTiers(db, io, logger);
const leaderboard = new Leaderboard(db, io, activeProfile); // Pass streamer_id as activeProfile
logger.info(`✅ Leaderboard initialized with streamer scope: ${activeProfile}`);

// Plugin-System initialisieren
const pluginsDir = path.join(__dirname, 'plugins');
const pluginLoader = new PluginLoader(pluginsDir, app, io, db, logger, configPathManager);
logger.info('🔌 Plugin Loader initialized');

// Set TikTok module reference for dynamic event registration
pluginLoader.setTikTokModule(tiktok);

// Set IFTTT engine reference for dynamic IFTTT component registration
pluginLoader.setIFTTTEngine(iftttEngine);

// Add pluginLoader to IFTTT services so actions can access plugins
iftttServices.pluginLoader = pluginLoader;

// PluginLoader an AlertManager übergeben (um doppelte Sounds zu vermeiden)
alerts.setPluginLoader(pluginLoader);

// Update-Manager initialisieren (mit Fehlerbehandlung)
let updateManager;
try {
    updateManager = new UpdateManager(logger);
    logger.info('🔄 Update Manager initialized');
} catch (error) {
    logger.warn(`⚠️  Update Manager konnte nicht initialisiert werden: ${error.message}`);
    logger.info('   Update-Funktionen sind nicht verfügbar, aber der Server läuft normal weiter.');
    // Erstelle einen Dummy-Manager für API-Kompatibilität
    updateManager = {
        currentVersion: '1.0.3',
        isGitRepo: false,
        checkForUpdates: async () => ({ success: false, error: 'Update Manager nicht verfügbar' }),
        performUpdate: async () => ({ success: false, error: 'Update Manager nicht verfügbar' }),
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
setupPluginRoutes(app, pluginLoader, apiLimiter, uploadLimiter, logger, io, pluginLimiter);

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
 * GET /api/update/check - Prüft auf neue Versionen
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
 * POST /api/update/download - Führt Update durch (Git Pull oder ZIP Download)
 */
app.post('/api/update/download', authLimiter, async (req, res) => {
    try {
        const result = await updateManager.performUpdate();
        res.json(result);
    } catch (error) {
        logger.error(`Update download failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/update/instructions - Gibt Anleitung für manuelles Update
 */
app.get('/api/update/instructions', apiLimiter, (req, res) => {
    // Manual update instructions
    const instructions = {
        method: updateManager.isGitRepo ? 'git' : 'download',
        steps: updateManager.isGitRepo
            ? [
                '1. Stoppe den Server (Ctrl+C)',
                '2. Führe "git pull" im Projektverzeichnis aus',
                '3. Falls package.json geändert wurde: "npm install"',
                '4. Starte den Server neu mit "npm start" oder "node launch.js"'
              ]
            : [
                '1. Lade die neueste Version von GitHub herunter',
                `2. https://github.com/${updateManager.githubRepo}/releases/latest`,
                '3. Entpacke das Archiv',
                '4. Kopiere deine "user_data" und "user_configs" Ordner',
                '5. Führe "npm install" aus',
                '6. Starte den Server mit "npm start" oder "node launch.js"'
              ]
    };

    res.json({
        success: true,
        instructions
    });
});

/**
 * GET /CHANGELOG.txt - Serves the changelog file
 */
app.get('/CHANGELOG.txt', (req, res) => {
    const changelogPath = path.join(__dirname, '..', 'CHANGELOG.txt');
    res.sendFile(changelogPath, (err) => {
        if (err) {
            logger.error(`Failed to serve CHANGELOG.txt: ${err.message}`);
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

        // Auto-create and switch profile for streamer if needed
        const currentProfile = profileManager.getActiveProfile();
        let profileSwitched = false;
        
        // Check if profile exists for this streamer
        if (!profileManager.profileExists(username)) {
            logger.info(`📝 Creating new profile for streamer: ${username}`);
            profileManager.createProfile(username);
        }
        
        // Switch to the streamer's profile if different from current
        if (currentProfile !== username) {
            logger.info(`🔄 Switching from profile "${currentProfile}" to "${username}"`);
            profileManager.setActiveProfile(username);
            profileSwitched = true;
            
            // Emit socket event to notify frontend
            io.emit('profile:switched', {
                from: currentProfile,
                to: username,
                requiresRestart: true
            });
            
            logger.info(`✅ Profile switched to: ${username} (restart required to activate)`);
            
            // Return early with profile switch notification
            return res.json({
                success: true,
                profileSwitched: true,
                message: `Profile switched to "${username}". Restarting application to activate new profile...`,
                requiresRestart: true,
                newProfile: username
            });
        }

        // Profile already active, proceed with connection
        await tiktok.connect(username);
        logger.info(`✅ Connected to TikTok user: ${username}`);
        res.json({ success: true, profileSwitched: false });
    } catch (error) {
        if (error instanceof ValidationError) {
            logger.warn(`Invalid connection attempt: ${error.message}`);
            return res.status(400).json({ success: false, error: error.message });
        }
        logger.error('Connection error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/disconnect', authLimiter, (req, res) => {
    tiktok.disconnect();
    logger.info('🔌 Disconnected from TikTok');
    res.json({ success: true });
});

app.get('/api/status', apiLimiter, (req, res) => {
    res.json({
        isConnected: tiktok.isActive(),
        username: tiktok.currentUsername,
        stats: tiktok.getStats()
    });
});

// Get live statistics in a standardized format for plugins
// This endpoint is designed for real-time polling (recommended: every 2 seconds)
app.get('/api/live-stats', apiLimiter, (req, res) => {
    try {
        const stats = tiktok.stats || {};
        const streamDuration = tiktok.streamStartTime 
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
    try {
        const health = await tiktok.getConnectionHealth();
        res.json(health);
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
        });

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
        const activeProfile = profileManager.getActiveProfile();

        res.json({
            profiles: profiles.map(p => ({
                username: p.username,
                created: p.created,
                modified: p.modified,
                size: p.size,
                isActive: p.username === activeProfile
            })),
            activeProfile
        });
    } catch (error) {
        logger.error('Error listing profiles:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Aktuelles aktives Profil
app.get('/api/profiles/active', apiLimiter, (req, res) => {
    try {
        const activeProfile = profileManager.getActiveProfile();
        res.json({ activeProfile });
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

        profileManager.setActiveProfile(username);
        logger.info(`🔄 Switched to profile: ${username} (restart required)`);

        res.json({
            success: true,
            message: 'Profile switched. Please restart the application.',
            requiresRestart: true
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

app.get('/api/flows', apiLimiter, (req, res) => {
    const flows = db.getFlows();
    res.json(flows);
});

app.get('/api/flows/:id', apiLimiter, (req, res) => {
    const flow = db.getFlow(req.params.id);
    if (!flow) {
        return res.status(404).json({ success: false, error: 'Flow not found' });
    }
    res.json(flow);
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
        const catalog = db.getGiftCatalog();
        const lastUpdate = db.getCatalogLastUpdate();
        res.json({ success: true, catalog, lastUpdate, count: catalog.length });
    } catch (error) {
        logger.error('Error getting gift catalog:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/gift-catalog/update', apiLimiter, async (req, res) => {
    try {
        const result = await tiktok.updateGiftCatalog();
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
    const filePath = path.join(uploadDir, filename);

    try {
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ========== EMOJI RAIN ROUTES ==========
// Moved to Emoji Rain Plugin (plugins/emoji-rain)

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
            status: 'connected',
            username: tiktok.currentUsername
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
            status: 'disconnected'
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
                subs: 'subscribe'
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

// ========== EMOJI RAIN HELPER ==========
// Moved to Emoji Rain Plugin (plugins/emoji-rain)

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
    await leaderboard.trackGift(data.username, data.giftName, data.coins);

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
    await leaderboard.trackFollow(data.username);

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
    await leaderboard.trackSubscription(data.username);

    await iftttEngine.processEvent('tiktok:subscribe', data);
});

// Share Event
tiktok.on('share', async (data) => {
    alerts.addAlert('share', data);

    // Leaderboard: Track share
    await leaderboard.trackShare(data.username);

    await iftttEngine.processEvent('tiktok:share', data);
});

// Chat Event
tiktok.on('chat', async (data) => {
    // Leaderboard: Track chat message
    await leaderboard.trackChat(data.username);

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
    await leaderboard.trackLike(data.username, data.likeCount || 1);

    // IFTTT Engine verarbeiten
    await iftttEngine.processEvent('tiktok:like', data);
});

// Connected Event (System)
tiktok.on('connected', async (data) => {
    debugLogger.log('system', 'TikTok connected', { username: data.username });
    await iftttEngine.processEvent('system:connected', data);
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

// Stream Changed Event - Reset goals and leaderboard session stats when connecting to different stream
tiktok.on('streamChanged', async (data) => {
    logger.info(`🔄 Stream changed from @${data.previousUsername} to @${data.newUsername} - resetting session data`);
    
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
    
    // Broadcast to clients that stream has changed
    io.emit('stream:changed', {
        previousUsername: data.previousUsername,
        newUsername: data.newUsername,
        timestamp: data.timestamp
    });
    
    debugLogger.log('system', 'Stream changed - session data reset', data);
    await iftttEngine.processEvent('system:streamChanged', data);
});

// ========== SERVER STARTEN ==========

const PORT = process.env.PORT || 3000;

// Async Initialisierung vor Server-Start
(async () => {
    // Plugins laden VOR Server-Start, damit alle Routen verfügbar sind
    logger.info('🔌 Loading plugins...');
    try {
        const plugins = await pluginLoader.loadAllPlugins();
        const loadedCount = pluginLoader.plugins.size;

        initState.setPluginsLoaded(loadedCount);

        // Mark each loaded plugin as initialized
        plugins.forEach(plugin => {
            if (plugin) {
                initState.setPluginInitialized(plugin.id, true);
            }
        });

        // TikTok-Events für Plugins registrieren
        pluginLoader.registerPluginTikTokEvents(tiktok);

        // ========== PLUGIN STATIC FILES ==========
        // Register static file serving AFTER plugins are loaded
        // This ensures plugin-registered routes take precedence over static file serving
        app.use('/plugins', express.static(path.join(__dirname, 'plugins')));
        logger.info('📂 Plugin static files served from /plugins/*');

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
            
            // Still register static file serving even with no plugins
            app.use('/plugins', express.static(path.join(__dirname, 'plugins')));
            logger.info('📂 Plugin static files served from /plugins/*');
            
            initState.setPluginsLoaded(0);
            initState.setPluginInjectionsComplete();
        }
    } catch (error) {
        logger.error(`⚠️  Error loading plugins: ${error.message}`);
        initState.addError('plugin-loader', 'Failed to load plugins', error);
    }

    // Jetzt Server starten
    server.listen(PORT, async () => {
        initState.setServerStarted();

        logger.info('\n' + '='.repeat(50));
        logger.info('✅ Pup Cids little TikTok Helper läuft!');
        logger.info('='.repeat(50));
        logger.info(`\n📊 Dashboard:     http://localhost:${PORT}/dashboard.html`);
        logger.info(`🎬 Overlay:       http://localhost:${PORT}/overlay.html`);
        logger.info(`📚 API Docs:      http://localhost:${PORT}/api-docs`);
        logger.info(`🐾 Pup Cid:       https://www.tiktok.com/@pupcid`);
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

    // Gift-Katalog automatisch beim Start aktualisieren (falls Username konfiguriert)
    const savedUsername = db.getSetting('last_connected_username');
    if (savedUsername) {
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
        }, 3000);
    }

        // Cloud Sync initialisieren (wenn aktiviert)
        try {
            await cloudSync.initialize();
        } catch (error) {
            logger.warn(`⚠️  Cloud Sync konnte nicht initialisiert werden: ${error.message}`);
        }

        // Auto-Update-Check starten (alle 24 Stunden)
        // Nur wenn Update-Manager verfügbar ist
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

        // Browser automatisch öffnen (mit Guard gegen Duplikate)
        // Respektiert OPEN_BROWSER Umgebungsvariable
        const shouldOpenBrowser = process.env.OPEN_BROWSER !== 'false' && !browserOpened;
        
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
        } else if (process.env.OPEN_BROWSER === 'false') {
            logger.info('ℹ️  Browser-Auto-Open deaktiviert (OPEN_BROWSER=false)\n');
        }
    });
})(); // Schließe async IIFE

// Graceful Shutdown
process.on('SIGINT', async () => {
    logger.info('\n\n🛑 Shutting down gracefully...');

    // TikTok-Verbindung trennen
    if (tiktok.isActive()) {
        tiktok.disconnect();
    }

    // OBS-Verbindung trennen
    if (obs.isConnected()) {
        await obs.disconnect();
    }

    // Cloud Sync beenden
    try {
        await cloudSync.shutdown();
    } catch (error) {
        logger.error('Error shutting down cloud sync:', error);
    }

    // Datenbank schließen
    db.close();

    // Server schließen
    server.close(() => {
        logger.info('✅ Server closed');
        process.exit(0);
    });
});

// Error Handling
process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, server, io, db, tiktok, alerts, iftttEngine, goals, leaderboard, subscriptionTiers };
