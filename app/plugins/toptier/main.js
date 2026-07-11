'use strict';

const path = require('path');

const TopTierDB = require('./backend/db');
const SessionManager = require('./backend/session-manager');
const ScoreEngine = require('./backend/score-engine');
const DecayScheduler = require('./backend/decay-scheduler');

/**
 * TopTier Plugin - Live Like & Gift Leaderboard with decay mechanics,
 * rank animations, and OBS overlay variants.
 * Session-only: no all-time tracking. Coins = score directly.
 */
class TopTierPlugin {
  /**
   * @param {object} api - PluginAPI instance
   */
  constructor(api) {
    this.api = api;
    this.dbHandler = null;
    this.sessionManager = null;
    this.scoreEngine = null;
    this.decayScheduler = null;
    this.streamMonitor = null;
  }

  /**
   * Initialize the plugin: create DB tables, subsystems, routes, and events.
   */
  async init() {
    try {
      this.api.log('[TopTier] Initializing...', 'info');

      // Init DB
      const rawDb = this.api.getDatabase();
      this.dbHandler = new TopTierDB(rawDb);
      this.dbHandler.initTables();

      // Init subsystems
      this.sessionManager = new SessionManager(this.api, this.dbHandler);
      this.scoreEngine = new ScoreEngine(this.api, this.dbHandler, this.sessionManager);
      this.decayScheduler = new DecayScheduler(this.api, this.dbHandler, this.sessionManager);

      // Load or init config
      let config = this.api.getConfig('toptier_config');
      if (!config) {
        config = this.scoreEngine._getDefaultConfig();
        this.api.setConfig('toptier_config', config);
      } else {
        // Merge with defaults for any missing keys
        const def = this.scoreEngine._getDefaultConfig();
        config = this._deepMerge(def, config);
      }

      // Start decay scheduler
      if (config.decay && config.decay.enabled) {
        this.decayScheduler.start(config);
      }

      this._registerRoutes();
      this._registerSocketEvents();
      this._registerTikTokEvents();
      this._startStreamMonitor();

      this.api.log('[TopTier] Plugin initialized successfully', 'info');
    } catch (err) {
      this.api.log(`[TopTier] Init error: ${err.message}`, 'error');
      throw err;
    }
  }

  /**
   * Destroy the plugin: stop scheduler, end session, clean up.
   */
  async destroy() {
    try {
      this._stopStreamMonitor();
      if (this.decayScheduler) this.decayScheduler.stop();
      if (this.sessionManager) this.sessionManager.endSession();
      this.api.log('[TopTier] Plugin destroyed', 'info');
    } catch (err) {
      this.api.log(`[TopTier] Destroy error: ${err.message}`, 'error');
    }
  }

  /**
   * Register all HTTP API routes.
   * @private
   */
  _registerRoutes() {
    this.api.registerRoute('GET', '/toptier/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui.html'));
    });

    // GET /api/plugins/toptier/board/:boardType
    this.api.registerRoute('GET', '/board/:boardType', (req, res) => {
      try {
        const { boardType } = req.params;
        if (!['likes', 'gifts'].includes(boardType)) return res.status(400).json({ success: false, error: 'Invalid board type' });
        const config = this.api.getConfig('toptier_config') || {};
        const limit = (boardType === 'likes' ? (config.likesBoard && config.likesBoard.displayCount) : (config.giftsBoard && config.giftsBoard.displayCount)) || 10;
        const liveSession = this.sessionManager.getLiveSessionState();
        if (!liveSession.active) {
          return res.json({ success: true, board: [], sessionId: null, active: false });
        }
        const sessionId = liveSession.sessionId;
        const board = this.dbHandler.getBoard(boardType, sessionId, limit);
        res.json({ success: true, board, sessionId, active: true });
      } catch (err) {
        this.api.log(`[TopTier] GET /board error: ${err.message}`, 'error');
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // POST /api/plugins/toptier/reset/:boardType
    this.api.registerRoute('POST', '/reset/:boardType', (req, res) => {
      try {
        const { boardType } = req.params;
        const liveSession = this.sessionManager.getLiveSessionState();
        if (!liveSession.active) {
          return res.json({ success: true, active: false, sessionId: null });
        }
        const sessionId = liveSession.sessionId;
        if (boardType === 'all') {
          this.dbHandler.resetBoard('likes', sessionId);
          this.dbHandler.resetBoard('gifts', sessionId);
          this.api.emit('toptier:update', { board: 'likes', entries: [], sessionId });
          this.api.emit('toptier:update', { board: 'gifts', entries: [], sessionId });
        } else {
          if (!['likes', 'gifts'].includes(boardType)) return res.status(400).json({ success: false, error: 'Invalid board type' });
          this.dbHandler.resetBoard(boardType, sessionId);
          this.api.emit('toptier:update', { board: boardType, entries: [], sessionId });
        }
        res.json({ success: true, active: true, sessionId });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET /api/plugins/toptier/config
    this.api.registerRoute('GET', '/config', (req, res) => {
      try {
        const config = this.api.getConfig('toptier_config') || this.scoreEngine._getDefaultConfig();
        res.json({ success: true, config });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // POST /api/plugins/toptier/config
    this.api.registerRoute('POST', '/config', (req, res) => {
      try {
        const newConfig = req.body;
        if (!newConfig || typeof newConfig !== 'object') return res.status(400).json({ success: false, error: 'Invalid config' });
        this.api.setConfig('toptier_config', newConfig);
        // Restart decay scheduler
        this.decayScheduler.stop();
        if (newConfig.decay && newConfig.decay.enabled) this.decayScheduler.start(newConfig);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // POST /api/plugins/toptier/session/new
    this.api.registerRoute('POST', '/session/new', (req, res) => {
      try {
        this.sessionManager.endSession();
        const sessionId = this.sessionManager.startNewSession();
        this.scoreEngine.reset();
        this._emitEmptyBoards(sessionId);
        res.json({ success: true, sessionId });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET /api/plugins/toptier/session/current
    this.api.registerRoute('GET', '/session/current', (req, res) => {
      try {
        const liveSession = this.sessionManager.getLiveSessionState();
        res.json({
          success: true,
          ...liveSession
        });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET /api/plugins/toptier/decay-log/:boardType
    this.api.registerRoute('GET', '/decay-log/:boardType', (req, res) => {
      try {
        const { boardType } = req.params;
        if (!['likes', 'gifts'].includes(boardType)) return res.status(400).json({ success: false, error: 'Invalid board type' });
        const liveSession = this.sessionManager.getLiveSessionState();
        if (!liveSession.active) {
          return res.json({ success: true, active: false, log: [] });
        }
        const sessionId = liveSession.sessionId;
        const log = this.dbHandler.getDecayLog(boardType, sessionId, 50);
        res.json({ success: true, active: true, log });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // POST /api/plugins/toptier/test-event
    this.api.registerRoute('POST', '/test-event', (req, res) => {
      try {
        const { board, username, score } = req.body || {};
        if (!board || !username || score == null) return res.status(400).json({ success: false, error: 'board, username, score required' });
        if (board === 'likes') {
          this.scoreEngine.handleLikeEvent({ uniqueId: username, nickname: username, likeCount: score });
        } else if (board === 'gifts') {
          this.scoreEngine.handleGiftEvent({ uniqueId: username, nickname: username, coins: score, repeatCount: 1 });
        }
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
  }

  /**
   * Register Socket.IO event handlers.
   * @private
   */
  _registerSocketEvents() {
    this.api.registerSocket('toptier:get-board', (socket, data) => {
      try {
        const boardType = data && data.board;
        if (!['likes', 'gifts'].includes(boardType)) return;
        const config = this.api.getConfig('toptier_config') || {};
        const limit = (boardType === 'likes' ? (config.likesBoard && config.likesBoard.displayCount) : (config.giftsBoard && config.giftsBoard.displayCount)) || 10;
        const liveSession = this.sessionManager.getLiveSessionState();
        if (!liveSession.active) {
          socket.emit('toptier:update', { board: boardType, entries: [], sessionId: null, active: false });
          return;
        }
        const sessionId = liveSession.sessionId;
        const board = this.dbHandler.getBoard(boardType, sessionId, limit);
        socket.emit('toptier:update', { board: boardType, entries: board, sessionId, active: true });
      } catch (err) {
        this.api.log(`[TopTier] Socket get-board error: ${err.message}`, 'error');
      }
    });

    this.api.registerSocket('toptier:get-config', (socket) => {
      try {
        const config = this.api.getConfig('toptier_config') || this.scoreEngine._getDefaultConfig();
        socket.emit('toptier:config', config);
      } catch (err) {
        this.api.log(`[TopTier] Socket get-config error: ${err.message}`, 'error');
      }
    });

    this.api.registerSocket('toptier:save-config', (socket, data) => {
      try {
        const config = data && data.config;
        if (!config) return;
        this.api.setConfig('toptier_config', config);
        this.decayScheduler.stop();
        if (config.decay && config.decay.enabled) this.decayScheduler.start(config);
        socket.emit('toptier:config-saved', { success: true });
      } catch (err) {
        this.api.log(`[TopTier] Socket save-config error: ${err.message}`, 'error');
      }
    });
  }

  /**
   * Register TikTok LIVE event handlers.
   * Stream identity changes rotate the session; short reconnects keep it.
   * @private
   */
  _registerTikTokEvents() {
    this.api.registerTikTokEvent('like', (data) => {
      this.scoreEngine.handleLikeEvent(data);
    });

    this.api.registerTikTokEvent('gift', (data) => {
      this.scoreEngine.handleGiftEvent(data);
    });

    this.api.registerTikTokEvent('chat', (data) => {
      this.scoreEngine.handleChatEvent(data);
    });

    this.api.registerTikTokEvent('connected', () => {
      this.decayScheduler.setConnected(true);
    });

    this.api.registerTikTokEvent('streamSessionStarted', (data) => {
      const streamUsername = (data && data.username) || null;
      const config = this.api.getConfig('toptier_config') || {};
      const streamKey = (data && data.streamIdentity) || this._getCurrentStreamKey();
      const isNewStream = this.sessionManager.handleConnect(streamUsername, streamKey);

      if (!isNewStream && streamKey && !this.sessionManager.getCurrentStreamKey()) {
        this.sessionManager.setCurrentStreamKey(streamKey);
      }

      if (isNewStream) {
        // New stream — reset score engine state, restart decay scheduler
        this.scoreEngine.reset();
        this._restartDecayScheduler(config);
        this._emitEmptyBoards();
      }
    });

    this.api.registerTikTokEvent('disconnected', () => {
      this.decayScheduler.setConnected(false);
      const config = this.api.getConfig('toptier_config') || {};
      if (config.decay && config.decay.decayOnlyWhenConnected) {
        this.decayScheduler.stop();
      }
      // End session on disconnect so a new stream always starts with a fresh leaderboard.
      // Temporary reconnects within the same stream will get a new session — this is the
      // expected behavior: every stream start = clean slate.
    });
  }

  /**
   * Start a lightweight monitor that watches the active TikTok stream identity.
   * This catches stream restarts with the same username even when the adapter
   * stays connected and does not emit a fresh connected event.
   * @private
   */
  _startStreamMonitor() {
    this._stopStreamMonitor();
    this.streamMonitor = setInterval(() => {
      this._syncSessionWithLiveStream();
    }, 5000);
    if (typeof this.streamMonitor.unref === 'function') {
      this.streamMonitor.unref();
    }
  }

  /**
   * Stop the stream monitor timer.
   * @private
   */
  _stopStreamMonitor() {
    if (this.streamMonitor) {
      clearInterval(this.streamMonitor);
      this.streamMonitor = null;
    }
  }

  /**
   * Return a stable identity key for the current live stream when the adapter
   * can provide one.
   * @returns {string|null}
   * @private
   */
  _getCurrentStreamKey() {
    if (!this.api.tiktok || typeof this.api.tiktok.getCurrentStreamKey !== 'function') {
      return null;
    }
    return this.api.tiktok.getCurrentStreamKey();
  }

  /**
   * Keep the current session aligned with the live stream identity.
   * If the adapter discovers a new stream while staying connected, rotate the
   * leaderboard session so old stream data does not leak into the new one.
   * @private
   */
  _syncSessionWithLiveStream() {
    if (!this.sessionManager || !this.sessionManager.hasCurrentSession()) return;
    if (!this.api.tiktok || (typeof this.api.tiktok.isActive === 'function' && !this.api.tiktok.isActive())) return;

    const streamUsername = this.api.tiktok.currentUsername || this.sessionManager.getCurrentStreamUsername() || null;
    const streamKey = this._getCurrentStreamKey();
    const currentKey = this.sessionManager.getCurrentStreamKey();

    if (streamKey && currentKey && streamKey !== currentKey) {
      const config = this.api.getConfig('toptier_config') || {};
      this.api.log(`[TopTier] Live stream identity changed (${currentKey} -> ${streamKey}); starting fresh session`, 'info');
      this.sessionManager.endSession();
      const sessionId = this.sessionManager.startNewSession(streamUsername, streamKey);
      this.scoreEngine.reset();
      this._emitEmptyBoards(sessionId);
      this._restartDecayScheduler(config);
      return;
    }

    if (streamKey && !currentKey) {
      this.sessionManager.setCurrentStreamKey(streamKey);
    }
  }

  /**
   * Restart the decay scheduler when the config enables it.
   * @param {object} config
   * @private
   */
  _restartDecayScheduler(config) {
    if (!this.decayScheduler) return;
    this.decayScheduler.stop();
    if (config.decay && config.decay.enabled) {
      this.decayScheduler.start(config);
    }
  }

  /**
   * Broadcast empty board payloads so connected overlays clear stale data
   * immediately after a session reset.
   * @param {string} [sessionId]
   * @private
   */
  _emitEmptyBoards(sessionId) {
    const sid = sessionId || this.sessionManager.getCurrentSessionId();
    this.api.emit('toptier:update', { board: 'likes', entries: [], sessionId: sid });
    this.api.emit('toptier:update', { board: 'gifts', entries: [], sessionId: sid });
  }

  /**
   * Deep merge two objects, preferring source values.
   * @param {object} target - Default values
   * @param {object} source - Override values
   * @returns {object} Merged result
   * @private
   */
  _deepMerge(target, source) {
    const out = Object.assign({}, target);
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        out[key] = this._deepMerge(target[key] || {}, source[key]);
      } else {
        out[key] = source[key];
      }
    }
    return out;
  }
}

module.exports = TopTierPlugin;
