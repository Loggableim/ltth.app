'use strict';

const EventEmitter = require('events');

/**
 * BaseAdapter – Abstract base class for all TikTok data-source adapters.
 *
 * Provides shared state, helper methods and event infrastructure so that
 * concrete adapters (EulerstreamAdapter, TikFinityAdapter, …) can focus
 * solely on their protocol logic.
 *
 * Concrete subclasses MUST implement:
 *   - async connect(username, options)
 *   - disconnect()
 *
 * @extends EventEmitter
 */
class BaseAdapter extends EventEmitter {
  /**
   * @param {object} io     - Socket.IO server instance
   * @param {object} db     - DatabaseManager instance
   * @param {object} logger - Winston logger (or compatible object)
   */
  constructor(io, db, logger) {
    super();

    this.io = io;
    this.db = db;
    this.logger = logger;

    /** @type {boolean} */
    this.isConnected = false;

    /** @type {string|null} */
    this.currentUsername = null;

    /** @type {number|null} */
    this.streamStartTime = null;

    /** @type {NodeJS.Timeout|null} */
    this.durationInterval = null;

    /** @type {{ viewers: number, likes: number, totalCoins: number, followers: number, shares: number, gifts: number }} */
    this.stats = {
      viewers: 0,
      likes: 0,
      totalCoins: 0,
      followers: 0,
      shares: 0,
      gifts: 0
    };

    this.setMaxListeners(20);
  }

  // ------------------------------------------------------------------
  // State helpers
  // ------------------------------------------------------------------

  /**
   * Returns true when the adapter has an active connection.
   * @returns {boolean}
   */
  isActive() {
    return this.isConnected;
  }

  /**
   * Returns a shallow copy of the current stats object.
   * @returns {object}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Resets all in-memory stats to zero, persists the reset to the database
   * and broadcasts the empty stats to connected clients.
   */
  resetStats() {
    this.stats = {
      viewers: 0,
      likes: 0,
      totalCoins: 0,
      followers: 0,
      shares: 0,
      gifts: 0
    };
    this.db.resetStreamStats();
    this.broadcastStats();
  }

  // ------------------------------------------------------------------
  // Broadcast helpers
  // ------------------------------------------------------------------

  /**
   * Emits the current stats (plus a calculated stream duration) to all
   * connected Socket.IO clients via 'tiktok:stats'.
   */
  broadcastStats() {
    const streamDuration = (this.isConnected && this.streamStartTime)
      ? Math.floor((Date.now() - this.streamStartTime) / 1000)
      : 0;

    this.io.emit('tiktok:stats', {
      ...this.stats,
      streamDuration
    });
  }

  /**
   * Emits a status update to all connected Socket.IO clients via
   * 'tiktok:status'.
   *
   * @param {string} status - Status string (e.g. 'connected', 'disconnected')
   * @param {object} [data={}] - Additional payload fields
   */
  broadcastStatus(status, data = {}) {
    this.io.emit('tiktok:status', {
      status,
      username: this.currentUsername,
      ...data
    });
  }

  // ------------------------------------------------------------------
  // Event handling
  // ------------------------------------------------------------------

  /**
   * Emits a TikTok event on this adapter's EventEmitter AND broadcasts it
   * to all Socket.IO clients via 'tiktok:event'.
   *
   * @param {string} eventType - Event name (e.g. 'gift', 'chat')
   * @param {object} data      - Event payload
   * @returns {boolean} Always true
   */
  handleEvent(eventType, data) {
    this.emit(eventType, data);
    this.io.emit('tiktok:event', { type: eventType, data });
    return true;
  }

  // ------------------------------------------------------------------
  // Duration interval helpers (used by subclasses)
  // ------------------------------------------------------------------

  /**
   * Starts (or restarts) the 1-second interval that keeps 'tiktok:stats'
   * up-to-date with the current stream duration.
   * @private
   */
  _startDurationInterval() {
    this._stopDurationInterval();
    this.durationInterval = setInterval(() => this.broadcastStats(), 1000);
  }

  /**
   * Clears the duration broadcast interval.
   * @private
   */
  _stopDurationInterval() {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
  }

  // ------------------------------------------------------------------
  // Abstract interface (must be implemented by subclass)
  // ------------------------------------------------------------------

  /**
   * Establishes a connection for the given TikTok username.
   *
   * @param {string} username - TikTok username (without @)
   * @param {object} [options={}] - Adapter-specific options
   * @returns {Promise<void>}
   * @abstract
   */
  async connect(username, options = {}) {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Closes the active connection and cleans up all resources.
   * @abstract
   */
  disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }
}

module.exports = BaseAdapter;
