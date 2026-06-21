'use strict';

const EventEmitter = require('events');

/**
 * TikTokConnector - Facade / Router
 *
 * Public API is 100% identical to the original monolithic TikTokConnector.
 * All consumers (server.js, plugin-loader.js, plugins) continue to work
 * without any modification.
 *
 * Internally, the class delegates every call to the active adapter, which is
 * selected by the `tiktok_data_source` database setting:
 *
 *   - 'eulerstream' (default) -> EulerstreamAdapter (original full behaviour)
 *   - 'tikfinity'             -> TikFinityAdapter   (TikFinity Desktop App WS)
 *
 * The setting is re-read on every connect() call so that a change takes effect
 * the next time the user starts a stream - no server restart required.
 *
 * @extends EventEmitter
 */
class TikTokConnector extends EventEmitter {
  constructor(io, db, logger = console) {
    super();
    this.io = io;
    this.db = this._withDbDefaults(db);
    this.logger = logger;
    this.setMaxListeners(50);
    this._adapter = null;
    this._currentSource = '';
    this._eventForwarders = {};
    const source = this.db.getSetting('tiktok_data_source') || 'eulerstream';
    this._switchAdapter(source);
  }

  _withDbDefaults(db = {}) {
    const noop = () => {};
    const dbWithDefaults = db && typeof db === 'object' ? db : {};
    const defaults = {
      getSetting: () => null,
      setSetting: noop,
      deleteSetting: noop,
      loadStreamStats: () => null,
      saveStreamStats: noop,
      resetStreamStats: noop,
      logEvent: noop,
      updateGiftCatalog: () => 0,
      getGiftCatalog: () => []
    };

    Object.entries(defaults).forEach(([key, defaultValue]) => {
      if (typeof dbWithDefaults[key] !== 'function') {
        dbWithDefaults[key] = defaultValue;
      }
    });

    return dbWithDefaults;
  }

  _createAdapterForSource(source) {
    if (source === 'tikfinity') {
      const TikFinityAdapter = require('./adapters/TikFinityAdapter');
      return new TikFinityAdapter(this.io, this.db, this.logger);
    }
    const EulerstreamAdapter = require('./adapters/EulerstreamAdapter');
    return new EulerstreamAdapter(this.io, this.db, this.logger);
  }

  _bindAdapterEvents(adapter) {
    this._eventForwarders = {};
    const events = ['gift', 'chat', 'follow', 'like', 'share', 'subscribe',
      'join', 'emote', 'connected', 'disconnected', 'error', 'viewerChange', 'streamChanged'];
    events.forEach((event) => {
      const handler = (data) => this.emit(event, data);
      this._eventForwarders[event] = handler;
      adapter.on(event, handler);
    });
  }

  _unbindAdapterEvents(adapter) {
    Object.entries(this._eventForwarders).forEach(([event, handler]) => {
      adapter.removeListener(event, handler);
    });
    this._eventForwarders = {};
  }

  _switchAdapter(source) {
    const normalized = source === 'tikfinity' ? 'tikfinity' : 'eulerstream';
    if (this._adapter) {
      this._unbindAdapterEvents(this._adapter);
    }
    this._adapter = this._createAdapterForSource(normalized);
    this._currentSource = normalized;
    this._bindAdapterEvents(this._adapter);
    this.logger.info(`[TikTokConnector] Active adapter: ${normalized}`);
  }

  get isConnected() {
    return this._adapter ? this._adapter.isConnected : false;
  }

  set isConnected(value) {
    if (this._adapter) this._adapter.isConnected = value;
  }

  get currentUsername() {
    return this._adapter ? this._adapter.currentUsername : null;
  }

  set currentUsername(value) {
    if (this._adapter) this._adapter.currentUsername = value;
  }

  get stats() {
    return this._adapter
      ? this._adapter.stats
      : { viewers: 0, likes: 0, totalCoins: 0, followers: 0, shares: 0, gifts: 0 };
  }

  set stats(value) {
    if (this._adapter) this._adapter.stats = value;
  }

  get streamStartTime() {
    return this._adapter ? this._adapter.streamStartTime : null;
  }

  set streamStartTime(value) {
    if (this._adapter) this._adapter.streamStartTime = value;
  }

  /**
   * Provides access to the adapter's sessionGifts Map for backward-compatibility.
   * Returns a no-op Map when no adapter is active.
   * @returns {Map}
   */
  get sessionGifts() {
    if (this._adapter && this._adapter.sessionGifts) {
      return this._adapter.sessionGifts;
    }
    // Return a Map stub to prevent TypeError on .clear() / .set() calls
    return new Map();
  }

  /**
   * Provides access to the adapter's processedEvents Map for backward-compatibility.
   * @returns {Map}
   */
  get processedEvents() {
    if (this._adapter && this._adapter.processedEvents) {
      return this._adapter.processedEvents;
    }
    return new Map();
  }

  async connect(username, options = {}) {
    const newSource = this.db.getSetting('tiktok_data_source') || 'eulerstream';
    if (newSource !== this._currentSource) {
      this.logger.info(`[TikTokConnector] Data source changed: ${this._currentSource} -> ${newSource}`);
      if (this._adapter && this._adapter.isActive()) {
        // Promise.resolve() safely handles both sync and async disconnect() implementations
        await Promise.resolve(this._adapter.disconnect());
      }
      this._switchAdapter(newSource);
    }
    return this._adapter.connect(username, options);
  }

  /**
   * Switches the active adapter immediately.
   * If currently connected, disconnects first, then switches.
   * Does NOT reconnect automatically – caller is responsible.
   * @param {string} source - 'eulerstream' | 'tikfinity'
   * @returns {Promise<void>}
   */
  async switchSourceNow(source) {
    const normalized = source === 'tikfinity' ? 'tikfinity' : 'eulerstream';
    if (normalized === this._currentSource) return;
    this.logger.info(`[TikTokConnector] Live source switch: ${this._currentSource} → ${normalized}`);
    if (this._adapter && this._adapter.isActive()) {
      // Promise.resolve() safely handles both sync and async disconnect() implementations
      await Promise.resolve(this._adapter.disconnect());
    }
    this._switchAdapter(normalized);
  }

  disconnect() {
    return this._adapter ? this._adapter.disconnect() : undefined;
  }

  isActive() {
    return this._adapter ? this._adapter.isActive() : false;
  }

  getStats() {
    if (!this._adapter) {
      return { viewers: 0, likes: 0, totalCoins: 0, followers: 0, shares: 0, gifts: 0 };
    }
    return this._adapter.getStats();
  }

  resetStats() {
    return this._adapter ? this._adapter.resetStats() : undefined;
  }

  broadcastStats() {
    return this._adapter ? this._adapter.broadcastStats() : undefined;
  }

  broadcastStatus(status, data = {}) {
    return this._adapter ? this._adapter.broadcastStatus(status, data) : undefined;
  }

  handleEvent(eventType, data) {
    return this._adapter ? this._adapter.handleEvent(eventType, data) : false;
  }

  getDeduplicationStats() {
    if (this._adapter && typeof this._adapter.getDeduplicationStats === 'function') {
      return this._adapter.getDeduplicationStats();
    }
    return { cacheSize: 0, maxCacheSize: 0, expirationMs: 0 };
  }

  clearDeduplicationCache() {
    if (this._adapter && typeof this._adapter.clearDeduplicationCache === 'function') {
      return this._adapter.clearDeduplicationCache();
    }
  }

  async fetchRoomId(username) {
    if (this._adapter && typeof this._adapter.fetchRoomId === 'function') {
      return this._adapter.fetchRoomId(username);
    }
    return null;
  }

  async fetchRoomInfo() {
    if (this._adapter && typeof this._adapter.fetchRoomInfo === 'function') {
      return this._adapter.fetchRoomInfo();
    }
    return null;
  }

  async updateGiftCatalog(options = {}) {
    if (this._adapter && typeof this._adapter.updateGiftCatalog === 'function') {
      return this._adapter.updateGiftCatalog(options);
    }
    const catalog = this.db.getGiftCatalog();
    return {
      success: true,
      message: catalog.length > 0
        ? `Using existing catalog with ${catalog.length} gifts`
        : 'Gift catalog not available for the active data source.',
      count: catalog.length,
      catalog
    };
  }

  getGiftCatalog() {
    return this.db.getGiftCatalog();
  }

  getEulerApiKeyInfo() {
    if (this._adapter && typeof this._adapter.getEulerApiKeyInfo === 'function') {
      return this._adapter.getEulerApiKeyInfo();
    }
    return { activeKey: null, activeSource: null, configured: false };
  }

  /**
   * Returns information about the currently active adapter and data source.
   * @returns {{ dataSource: string, isConnected: boolean, currentUsername: string|null, adapterInfo: object }}
   */
  getActiveAdapterInfo() {
    const adapterInfo = (this._adapter && typeof this._adapter.getAdapterInfo === 'function')
      ? this._adapter.getAdapterInfo()
      : {};
    return {
      dataSource: this._currentSource,
      isConnected: this.isActive(),
      currentUsername: this.currentUsername,
      adapterInfo
    };
  }

  async runDiagnostics(username) {
    if (this._adapter && typeof this._adapter.runDiagnostics === 'function') {
      return this._adapter.runDiagnostics(username);
    }
    const adapterInfo = (this._adapter && typeof this._adapter.getAdapterInfo === 'function')
      ? this._adapter.getAdapterInfo()
      : {};
    return {
      timestamp: new Date().toISOString(),
      dataSource: this._currentSource,
      adapter: adapterInfo,
      connection: { isConnected: this.isActive(), currentUsername: this.currentUsername },
      stats: this.stats
    };
  }

  async getConnectionHealth() {
    if (this._adapter && typeof this._adapter.getConnectionHealth === 'function') {
      return this._adapter.getConnectionHealth();
    }
    return {
      status: this.isActive() ? 'healthy' : 'disconnected',
      message: this.isActive() ? `Connected via ${this._currentSource}` : 'Not connected',
      isConnected: this.isActive(),
      currentUsername: this.currentUsername,
      dataSource: this._currentSource
    };
  }

  analyzeConnectionError(error) {
    if (this._adapter && typeof this._adapter.analyzeConnectionError === 'function') {
      return this._adapter.analyzeConnectionError(error);
    }
    return {
      type: 'UNKNOWN_ERROR',
      message: error.message || String(error),
      suggestion: 'Check the console logs for more details. If the problem persists, report this error.',
      retryable: true
    };
  }

  extractUserData(data) {
    if (this._adapter && typeof this._adapter.extractUserData === 'function') {
      return this._adapter.extractUserData(data);
    }
    return { username: null, nickname: null, userId: null,
      profilePictureUrl: '', teamMemberLevel: 0, isModerator: false, isSubscriber: false };
  }

  extractProfilePictureUrl(user) {
    if (this._adapter && typeof this._adapter.extractProfilePictureUrl === 'function') {
      return this._adapter.extractProfilePictureUrl(user);
    }
    return '';
  }

  extractGiftData(data) {
    if (this._adapter && typeof this._adapter.extractGiftData === 'function') {
      return this._adapter.extractGiftData(data);
    }
    return { giftName: null, giftId: null, giftPictureUrl: null,
      diamondCount: 0, repeatCount: 1, giftType: 0, repeatEnd: true };
  }
}

TikTokConnector.PING_INTERVAL_MS = 30000;

module.exports = TikTokConnector;
