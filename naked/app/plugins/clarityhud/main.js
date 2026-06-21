/**
 * ClarityHUD Plugin
 *
 * Provides two ultra-minimalistic, VR-optimized and accessible HUD overlays:
 * - /overlay/clarity/chat - Chat-only HUD
 * - /overlay/clarity/full - Full Activity HUD with layout modes
 */

const path = require('path');
const ClarityHUDBackend = require('./backend/api');

class ClarityHUDPlugin {
  constructor(api) {
    this.api = api;
    this.pluginId = 'clarityhud';
    this.backend = null;
  }

  /**
   * Initialize plugin
   */
  async init() {
    this.api.log('ClarityHUD plugin loading...');

    // Initialize backend
    this.backend = new ClarityHUDBackend(this.api);
    await this.backend.initialize();

    // Register routes
    this.registerRoutes();

    // Register event listeners
    this.registerEventListeners();

    this.api.log('ClarityHUD plugin loaded successfully');
  }

  /**
   * Register HTTP routes
   */
  registerRoutes() {
    // Helper function to set no-cache headers
    const setNoCacheHeaders = (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    };

    // Serve chat overlay
    this.api.registerRoute('GET', '/overlay/clarity/chat', (req, res) => {
      const overlayPath = path.join(__dirname, 'overlays', 'chat.html');
      setNoCacheHeaders(res);
      res.sendFile(overlayPath);
    });

    // Serve full activity overlay
    this.api.registerRoute('GET', '/overlay/clarity/full', (req, res) => {
      const overlayPath = path.join(__dirname, 'overlays', 'full.html');
      setNoCacheHeaders(res);
      res.sendFile(overlayPath);
    });

    // Serve multi-stream overlay
    this.api.registerRoute('GET', '/overlay/clarity/multi', (req, res) => {
      const overlayPath = path.join(__dirname, 'overlays', 'multi.html');
      setNoCacheHeaders(res);
      res.sendFile(overlayPath);
    });

    // Serve stream overlay
    this.api.registerRoute('GET', '/overlay/clarity/stream', (req, res) => {
      const overlayPath = path.join(__dirname, 'overlays', 'stream.html');
      setNoCacheHeaders(res);
      res.sendFile(overlayPath);
    });

    // Serve plugin UI
    this.api.registerRoute('GET', '/clarityhud/ui', (req, res) => {
      const uiPath = path.join(__dirname, 'ui', 'main.html');
      setNoCacheHeaders(res);
      res.sendFile(uiPath);
    });

    // P8: Single wildcard handler for all static plugin files.
    // Validates against allowed subdirectories and file extensions to block
    // path traversal attacks.
    const ALLOWED_DIRS = new Set(['lib', 'overlays', 'ui', 'assets']);
    const ALLOWED_EXTS = new Set(['.js', '.css', '.png', '.svg', '.woff2']);

    this.api.registerRoute('GET', '/plugins/clarityhud/*', (req, res) => {
      // req.params[0] contains everything after '/plugins/clarityhud/'
      const requestedPath = req.params[0] || '';

      // Block path traversal
      if (requestedPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      const parts = requestedPath.split('/');
      const subDir = parts[0];
      const ext = path.extname(parts[parts.length - 1]).toLowerCase();

      if (!ALLOWED_DIRS.has(subDir) || !ALLOWED_EXTS.has(ext)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const filePath = path.join(__dirname, ...parts);
      setNoCacheHeaders(res);
      res.sendFile(filePath, (err) => {
        if (err) {
          res.status(404).json({ error: 'File not found' });
        }
      });
    });

    // API routes handled by backend
    this.backend.registerRoutes();

    this.api.log('Routes registered');
  }

  /**
   * Register TikTok event listeners
   */
  registerEventListeners() {
    // Chat events (both overlays)
    this.api.registerTikTokEvent('chat', async (data) => {
      await this.backend.handleChatEvent(data);
    });

    // Activity events (full overlay only)
    this.api.registerTikTokEvent('follow', async (data) => {
      await this.backend.handleFollowEvent(data);
    });

    this.api.registerTikTokEvent('share', async (data) => {
      await this.backend.handleShareEvent(data);
    });

    this.api.registerTikTokEvent('like', async (data) => {
      await this.backend.handleLikeEvent(data);
    });

    this.api.registerTikTokEvent('gift', async (data) => {
      await this.backend.handleGiftEvent(data);
    });

    this.api.registerTikTokEvent('subscribe', async (data) => {
      await this.backend.handleSubscribeEvent(data);
    });

    this.api.registerTikTokEvent('superfan', async (data) => {
      await this.backend.handleSubscribeEvent(data);
    });

    this.api.registerTikTokEvent('join', async (data) => {
      await this.backend.handleJoinEvent(data);
    });

    this.api.log('Event listeners registered');
  }

  /**
   * Cleanup on plugin unload
   */
  async destroy() {
    this.api.log('ClarityHUD plugin unloading...');
    if (this.backend) {
      await this.backend.cleanup();
    }
  }
}

module.exports = ClarityHUDPlugin;
