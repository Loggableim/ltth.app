'use strict';

const EventEmitter = require('events');
const EulerstreamAdapter = require('./adapters/EulerstreamAdapter');

/**
 * TikTokConnector - Facade / Router
 *
 * Public API is 100% identical to the original monolithic TikTokConnector.
 * All consumers (server.js, plugin-loader.js, plugins) continue to work
 * without any modification.
 *
 * Internally, the class delegates every call to the EulerStream adapter.
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
    this._currentSource = 'eulerstream';
    this._eventForwarders = {};
    this._removeLegacyDataSourceSettings();
    this._switchAdapter();
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

  _removeLegacyDataSourceSettings() {
    if (typeof this.db.deleteSetting !== 'function') return;

    for (const key of ['tiktok_data_source', 'tikfinity_ws_port']) {
      try {
        this.db.deleteSetting(key);
      } catch (error) {
        this.logger.warn?.(`[TikTokConnector] Could not remove obsolete ${key}: ${error.message}`);
      }
    }
  }

  _bindAdapterEvents(adapter) {
    this._eventForwarders = {};
    const events = ['gift', 'chat', 'follow', 'like', 'share', 'subscribe',
      'join', 'emote', 'connected', 'disconnected', 'error', 'viewerChange',
      'streamChanged'];
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

  _switchAdapter() {
    if (this._adapter) {
      this._unbindAdapterEvents(this._adapter);
    }
    this._adapter = new EulerstreamAdapter(this.io, this.db, this.logger);
    if (typeof this._adapter.setStreamSessionLifecycleHandler === 'function') {
      this._adapter.setStreamSessionLifecycleHandler(
        data => this._emitAsync('streamSessionStarted', data)
      );
    }
    this._currentSource = 'eulerstream';
    this._bindAdapterEvents(this._adapter);
    this.logger.info('[TikTokConnector] Active adapter: eulerstream');
  }

  async _emitAsync(event, data) {
    for (const listener of this.rawListeners(event)) {
      try {
        await listener.call(this, data);
      } catch (error) {
        this.logger.error(`[TikTokConnector] Async ${event} listener failed: ${error.message}`);
      }
    }
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

  get roomId() {
    return this._adapter ? this._adapter.roomId : null;
  }

  set roomId(value) {
    if (this._adapter) this._adapter.roomId = value;
  }

  get connectionState() {
    return this._adapter ? this._adapter.connectionState : 'idle';
  }

  get streamIdentity() {
    return this._adapter ? this._adapter.streamIdentity : null;
  }

  /**
   * Returns a stable key for the currently active live stream when the
   * active adapter can provide one. This is used by plugins that need to
   * distinguish a new live session from a reconnect to the same stream.
   * @returns {string|null}
   */
  getCurrentStreamKey() {
    if (!this._adapter) return null;

    // Prefer the adapter's local session generation. Eulerstream can reuse a
    // room ID for a later LIVE, while this token remains stable for reconnects
    // and changes only after LTTH confirms a new session.
    if (this._adapter.streamSessionId !== null && this._adapter.streamSessionId !== undefined) {
      return `euler:${this._adapter.streamSessionId}`;
    }
    if (this._adapter.streamIdentity) return this._adapter.streamIdentity;
    if (this._adapter.roomId && this.currentUsername) {
      return `${String(this.currentUsername).toLowerCase()}:${this._adapter.roomId}`;
    }

    return null;
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
    return this._adapter.connect(username, options);
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
