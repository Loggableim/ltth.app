'use strict';

const TopTierDB = require('./backend/db');
const SessionManager = require('./backend/session-manager');
const ScoreEngine = require('./backend/score-engine');
const DecayScheduler = require('./backend/decay-scheduler');

/**
 * TopTier Plugin - Live Like & Gift Leaderboard with decay mechanics,
 * rank animations, and 7 OBS overlay variants.
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
    // GET /api/plugins/toptier/board/:boardType
    this.api.registerRoute('GET', '/board/:boardType', (req, res) => {
      try {
        const { boardType } = req.params;
        if (!['likes', 'gifts'].includes(boardType)) return res.status(400).json({ success: false, error: 'Invalid board type' });
        const config = this.api.getConfig('toptier_config') || {};
        const limit = (boardType === 'likes' ? (config.likesBoard && config.likesBoard.displayCount) : (config.giftsBoard && config.giftsBoard.displayCount)) || 10;
        const sessionId = this.sessionManager.getCurrentSessionId();
        const board = this.dbHandler.getBoard(boardType, sessionId, limit);
        res.json({ success: true, board, sessionId });
      } catch (err) {
        this.api.log(`[TopTier] GET /board error: ${err.message}`, 'error');
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET /api/plugins/toptier/alltime/:boardType
    this.api.registerRoute('GET', '/alltime/:boardType', (req, res) => {
      try {
        const { boardType } = req.params;
        if (!['likes', 'gifts'].includes(boardType)) return res.status(400).json({ success: false, error: 'Invalid board type' });
        const board = this.dbHandler.getAllTime(boardType, 20);
        res.json({ success: true, board });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // POST /api/plugins/toptier/reset/:boardType
    this.api.registerRoute('POST', '/reset/:boardType', (req, res) => {
      try {
        const { boardType } = req.params;
        const sessionId = this.sessionManager.getCurrentSessionId();
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
        res.json({ success: true });
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
        res.json({ success: true, sessionId });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET /api/plugins/toptier/session/current
    this.api.registerRoute('GET', '/session/current', (req, res) => {
      try {
        res.json({ success: true, sessionId: this.sessionManager.getCurrentSessionId() });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET /api/plugins/toptier/decay-log/:boardType
    this.api.registerRoute('GET', '/decay-log/:boardType', (req, res) => {
      try {
        const { boardType } = req.params;
        if (!['likes', 'gifts'].includes(boardType)) return res.status(400).json({ success: false, error: 'Invalid board type' });
        const sessionId = this.sessionManager.getCurrentSessionId();
        const log = this.dbHandler.getDecayLog(boardType, sessionId, 50);
        res.json({ success: true, log });
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
        const sessionId = this.sessionManager.getCurrentSessionId();
        const board = this.dbHandler.getBoard(boardType, sessionId, limit);
        socket.emit('toptier:update', { board: boardType, entries: board, sessionId });
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
      const config = this.api.getConfig('toptier_config') || {};
      const auto = !config.decay || config.decay.decayOnlyWhenConnected !== false;
      if (auto) {
        this.sessionManager.endSession();
        this.sessionManager.startNewSession();
        if (config.decay && config.decay.enabled) {
          this.decayScheduler.stop();
          this.decayScheduler.start(config);
        }
      }
    });

    this.api.registerTikTokEvent('disconnected', () => {
      this.decayScheduler.setConnected(false);
      const config = this.api.getConfig('toptier_config') || {};
      if (config.decay && config.decay.decayOnlyWhenConnected) {
        this.decayScheduler.stop();
      }
      this.sessionManager.endSession();
    });
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
