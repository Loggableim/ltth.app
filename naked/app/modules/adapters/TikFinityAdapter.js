'use strict';

const WebSocket = require('ws');
const BaseAdapter = require('./BaseAdapter');

/**
 * TikFinityAdapter – connects to the TikFinity Desktop App's local WebSocket API.
 *
 * TikFinity Desktop App (https://tikfinity.com) exposes a local WebSocket server
 * (default port 21213) that forwards TikTok LIVE events in real time.  This adapter
 * consumes those events and translates them into the same normalised event format
 * that EulerstreamAdapter produces, so all downstream consumers (server.js, plugins,
 * IFTTT engine …) receive identical payloads regardless of which adapter is active.
 *
 * Configuration (stored in the `settings` table):
 *   - `tikfinity_ws_port`  – override default port 21213
 *
 * @extends BaseAdapter
 */
class TikFinityAdapter extends BaseAdapter {
  /**
   * @param {object} io     - Socket.IO server instance
   * @param {object} db     - DatabaseManager instance
   * @param {object} logger - Winston logger (or compatible object)
   */
  constructor(io, db, logger) {
    super(io, db, logger);

    /** @type {WebSocket|null} */
    this.ws = null;

    /** @type {NodeJS.Timeout|null} */
    this._reconnectTimer = null;

    /** @type {number} */
    this._reconnectAttempts = 0;

    /** @type {number} */
    this._maxReconnectAttempts = 10;

    /** @type {number} ms between reconnect attempts (base delay) */
    this._reconnectDelay = 3000;

    /** @type {boolean} set to true when disconnect() is called intentionally */
    this._intentionalDisconnect = false;

    /** @type {boolean} true during _openWebSocket() – after error event no reconnect should start */
    this._initialConnectFailed = false;

    /** @type {NodeJS.Timeout|null} */
    this._pingInterval = null;

    /** @type {NodeJS.Timeout|null} */
    this.statsPersistenceInterval = null;
  }

  // ------------------------------------------------------------------
  // Private config helpers
  // ------------------------------------------------------------------

  /**
   * Returns the configured WebSocket port for TikFinity.
   * Falls back to 21213 when the setting is absent or invalid.
   * @returns {number}
   * @private
   */
  _getPort() {
    const raw = this.db.getSetting('tikfinity_ws_port');
    const port = parseInt(raw, 10);
    if (!isNaN(port) && port >= 1 && port <= 65535) {
      return port;
    }
    return 21213;
  }

  /**
   * Returns the full WebSocket URL for the TikFinity local server.
   * @returns {string}
   * @private
   */
  _getWsUrl() {
    return `ws://localhost:${this._getPort()}`;
  }

  // ------------------------------------------------------------------
  // Public interface
  // ------------------------------------------------------------------

  /**
   * Connect to the TikFinity Desktop App WebSocket.
   *
   * @param {string} username  - TikTok username the caller wants events for
   * @param {object} [options={}] - Unused; kept for interface compatibility
   * @returns {Promise<void>}
   */
  async connect(username, options = {}) {
    // Cancel any pending reconnect from a previous session
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._intentionalDisconnect = false;
    this._reconnectAttempts = 0;
    this.currentUsername = username;

    this.logger.info(`[TikFinity] 🔄 Connecting to TikFinity WebSocket: ${this._getWsUrl()}`);
    this.logger.info(`[TikFinity] 👤 Username context: @${username}`);
    this.logger.warn('[TikFinity] ⚠️  TikFinity Desktop App must be running and connected to the same TikTok account.');

    await this._openWebSocket();

    this.streamStartTime = Date.now();
    this._startDurationInterval();

    if (this.statsPersistenceInterval) {
      clearInterval(this.statsPersistenceInterval);
    }
    this.statsPersistenceInterval = setInterval(
      () => this.db.saveStreamStats(this.stats),
      30000
    );
  }

  /**
   * Opens the WebSocket connection to TikFinity and waits for it to be ready.
   * Handles automatic reconnection on unexpected close events.
   * @returns {Promise<void>}
   * @private
   */
  _openWebSocket() {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.ws.removeAllListeners();
        try { this.ws.terminate(); } catch (_) {}
        this.ws = null;
      }

      // Reset per-attempt flags
      this._initialConnectFailed = false;

      this.ws = new WebSocket(this._getWsUrl());

      // 10-second connection timeout
      const connectTimeout = setTimeout(() => {
        // Prevent the close-handler from starting an uncontrolled reconnect loop.
        // _intentionalDisconnect will be reset to false on the next connect() call.
        this._intentionalDisconnect = true;
        const wsRef = this.ws;
        this.ws = null;
        // Reject before terminating so the promise settles before any close events fire
        reject(new Error(`[TikFinity] Connection timeout after 10s – is TikFinity running at ${this._getWsUrl()}?`));
        if (wsRef) {
          wsRef.removeAllListeners();
          try { wsRef.terminate(); } catch (_) {}
        }
      }, 10000);

      this.ws.once('open', () => {
        clearTimeout(connectTimeout);
        this.isConnected = true;
        this._reconnectAttempts = 0;
        this.logger.info(`[TikFinity] ✅ Connected to TikFinity WebSocket at ${this._getWsUrl()}`);
        this.broadcastStatus('connected', {
          username: this.currentUsername,
          method: 'TikFinity WebSocket'
        });
        this.emit('connected', {
          username: this.currentUsername,
          timestamp: new Date().toISOString()
        });
        this._setupPing();
        resolve();
      });

      this.ws.once('error', (err) => {
        clearTimeout(connectTimeout);
        this._initialConnectFailed = true;
        this.isConnected = false;
        this.logger.error(`[TikFinity] ❌ WebSocket error: ${err.message}`);
        this.broadcastStatus('error', {
          error: err.message,
          suggestion: 'Stelle sicher, dass die TikFinity Desktop App läuft und mit TikTok verbunden ist.'
        });
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        this._stopPing();

        const reasonText = Buffer.isBuffer(reason)
          ? reason.toString('utf-8')
          : (typeof reason === 'string' ? reason : '');

        this.logger.info(`[TikFinity] 🔴 WebSocket closed: code=${code}${reasonText ? ' reason=' + reasonText : ''}`);
        this.broadcastStatus('disconnected');
        this.emit('disconnected', {
          username: this.currentUsername,
          timestamp: new Date().toISOString(),
          reason: reasonText || 'Code ' + code
        });

        if (!this._intentionalDisconnect && !this._initialConnectFailed && this._reconnectAttempts < this._maxReconnectAttempts) {
          this._reconnectAttempts++;
          const delay = Math.min(this._reconnectDelay * this._reconnectAttempts, 30000);
          this.logger.info(`[TikFinity] 🔄 Reconnect attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts} in ${delay / 1000}s…`);
          this._reconnectTimer = setTimeout(() => {
            this._openWebSocket()
              .then(() => {
                // Restore session state if it was lost during an initial connect failure
                if (!this.streamStartTime) {
                  this.streamStartTime = Date.now();
                  this._startDurationInterval();
                }
                if (!this.statsPersistenceInterval) {
                  this.statsPersistenceInterval = setInterval(
                    () => this.db.saveStreamStats(this.stats),
                    30000
                  );
                }
              })
              .catch((err) => {
                this.logger.error(`[TikFinity] Reconnect attempt ${this._reconnectAttempts} failed: ${err.message}`);
              });
          }, delay);
        } else if (!this._intentionalDisconnect && this._reconnectAttempts >= this._maxReconnectAttempts) {
          this.logger.warn(`[TikFinity] ⚠️  Max reconnect attempts (${this._maxReconnectAttempts}) reached.`);
          this.broadcastStatus('max_reconnects_reached', {
            maxReconnects: this._maxReconnectAttempts,
            message: 'Bitte TikFinity App prüfen und manuell neu verbinden.'
          });
        }
      });

      this.ws.on('message', (data) => {
        this._handleMessage(data);
      });
    });
  }

  /**
   * Starts a 20-second ping interval to keep the connection alive.
   * @private
   */
  _setupPing() {
    clearInterval(this._pingInterval);
    this._pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 20000);
  }

  /**
   * Clears the ping interval.
   * @private
   */
  _stopPing() {
    clearInterval(this._pingInterval);
    this._pingInterval = null;
  }

  /**
   * Parses and dispatches an incoming TikFinity WebSocket message.
   * @param {Buffer|string} raw - Raw message data
   * @private
   */
  _handleMessage(raw) {
    let payload;
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
      payload = JSON.parse(text);
    } catch (err) {
      this.logger.warn(`[TikFinity] ⚠️  Could not parse message: ${err.message}`);
      return;
    }

    const eventType = (payload.event || payload.type || payload.action || '').toLowerCase();

    if (!eventType) {
      this.logger.debug('[TikFinity] Received message without event type – skipping');
      return;
    }

    this.logger.info(`[TikFinity] 📨 Event: ${eventType}`);

    switch (eventType) {
      case 'gift':
        this._onGift(payload);
        break;
      case 'chat':
      case 'comment':
        this._onChat(payload);
        break;
      case 'follow':
        this._onFollow(payload);
        break;
      case 'like':
        this._onLike(payload);
        break;
      case 'share':
        this._onShare(payload);
        break;
      case 'subscribe':
      case 'sub':
        this._onSubscribe(payload);
        break;
      case 'join':
      case 'member':
        this._onJoin(payload);
        break;
      case 'viewer':
      case 'viewercount':
      case 'viewerupdate':
        this._onViewerUpdate(payload);
        break;
      case 'roomstats':
      case 'stats':
        this._onRoomStats(payload);
        break;
      case 'connected':
        this.logger.info('[TikFinity] 📡 TikFinity reported connected status');
        break;
      default:
        this.logger.debug(`[TikFinity] Unknown event type: ${eventType}`);
    }
  }

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  /**
   * @param {object} p - Raw TikFinity gift payload
   * @private
   */
  _onGift(p) {
    const username = p.user || p.username || p.uniqueId || null;
    const nickname = p.nickname || p.displayName || username;
    const giftName = p.giftName || p.name || p.gift || null;
    const giftId = p.giftId || p.id || null;
    const diamondCount = p.diamondCount || p.diamonds || p.value || p.cost || 0;
    const repeatCount = p.amount || p.repeatCount || p.count || 1;
    const coins = diamondCount * repeatCount;

    this.stats.totalCoins += coins;
    this.stats.gifts++;

    const eventData = {
      uniqueId: username,
      username,
      nickname,
      userId: p.userId || p.uid || null,
      profilePictureUrl: p.profilePictureUrl || p.avatar || '',
      giftName,
      giftId,
      giftPictureUrl: p.giftPictureUrl || p.giftImage || p.image || null,
      repeatCount,
      diamondCount,
      coins,
      totalCoins: this.stats.totalCoins,
      isStreakEnd: true,
      giftType: 0,
      timestamp: new Date().toISOString()
    };

    this.logger.info(`[TikFinity] 🎁 Gift: ${giftName} x${repeatCount} (${coins} coins) from ${username}`);

    this.handleEvent('gift', eventData);
    this.db.logEvent('gift', username, eventData);
    this.broadcastStats();
  }

  /**
   * @param {object} p - Raw TikFinity chat payload
   * @private
   */
  _onChat(p) {
    const username = p.user || p.username || p.uniqueId || null;
    const nickname = p.nickname || p.displayName || username;

    const eventData = {
      username,
      nickname,
      message: p.comment || p.message || p.text || '',
      userId: p.userId || p.uid || null,
      profilePictureUrl: p.profilePictureUrl || p.avatar || '',
      isModerator: p.isModerator || false,
      isSubscriber: p.isSubscriber || p.isSub || false,
      teamMemberLevel: p.teamMemberLevel || p.subLevel || 0,
      timestamp: new Date().toISOString()
    };

    this.handleEvent('chat', eventData);
    this.db.logEvent('chat', username, eventData);
  }

  /**
   * @param {object} p - Raw TikFinity follow payload
   * @private
   */
  _onFollow(p) {
    this.stats.followers++;

    const username = p.user || p.username || p.uniqueId || null;
    const nickname = p.nickname || p.displayName || username;

    const eventData = {
      username,
      nickname,
      userId: p.userId || p.uid || null,
      profilePictureUrl: p.profilePictureUrl || p.avatar || '',
      isModerator: p.isModerator || false,
      isSubscriber: p.isSubscriber || p.isSub || false,
      teamMemberLevel: p.teamMemberLevel || p.subLevel || 0,
      timestamp: new Date().toISOString()
    };

    this.logger.info(`[TikFinity] 👤 Follow from: ${username}`);

    this.handleEvent('follow', eventData);
    this.db.logEvent('follow', username, eventData);
    this.broadcastStats();
  }

  /**
   * @param {object} p - Raw TikFinity like payload
   * @private
   */
  _onLike(p) {
    const likeCount = p.likeCount || p.count || p.amount || 1;
    const totalLikes = p.totalLikes || p.totalLikeCount || null;

    if (totalLikes !== null) {
      this.stats.likes = totalLikes;
    } else {
      this.stats.likes += likeCount;
    }

    const username = p.user || p.username || p.uniqueId || null;
    const nickname = p.nickname || p.displayName || username;

    const eventData = {
      username,
      nickname,
      userId: p.userId || p.uid || null,
      profilePictureUrl: p.profilePictureUrl || p.avatar || '',
      likeCount,
      totalLikes: this.stats.likes,
      isModerator: p.isModerator || false,
      isSubscriber: p.isSubscriber || p.isSub || false,
      teamMemberLevel: p.teamMemberLevel || p.subLevel || 0,
      timestamp: new Date().toISOString()
    };

    this.handleEvent('like', eventData);
    this.db.logEvent('like', username, eventData);
    this.broadcastStats();
  }

  /**
   * @param {object} p - Raw TikFinity share payload
   * @private
   */
  _onShare(p) {
    this.stats.shares++;

    const username = p.user || p.username || p.uniqueId || null;
    const nickname = p.nickname || p.displayName || username;

    const eventData = {
      username,
      nickname,
      userId: p.userId || p.uid || null,
      profilePictureUrl: p.profilePictureUrl || p.avatar || '',
      isModerator: p.isModerator || false,
      isSubscriber: p.isSubscriber || p.isSub || false,
      teamMemberLevel: p.teamMemberLevel || p.subLevel || 0,
      timestamp: new Date().toISOString()
    };

    this.handleEvent('share', eventData);
    this.db.logEvent('share', username, eventData);
    this.broadcastStats();
  }

  /**
   * @param {object} p - Raw TikFinity subscribe payload
   * @private
   */
  _onSubscribe(p) {
    const username = p.user || p.username || p.uniqueId || null;
    const nickname = p.nickname || p.displayName || username;

    const eventData = {
      username,
      nickname,
      userId: p.userId || p.uid || null,
      profilePictureUrl: p.profilePictureUrl || p.avatar || '',
      isModerator: p.isModerator || false,
      isSubscriber: true,
      teamMemberLevel: p.teamMemberLevel || p.subLevel || 0,
      timestamp: new Date().toISOString()
    };

    this.handleEvent('subscribe', eventData);
    this.db.logEvent('subscribe', username, eventData);
  }

  /**
   * @param {object} p - Raw TikFinity join / member payload
   * @private
   */
  _onJoin(p) {
    const username = p.user || p.username || p.uniqueId || null;
    const nickname = p.nickname || p.displayName || username;

    const eventData = {
      uniqueId: username,
      username,
      nickname,
      userId: p.userId || p.uid || null,
      profilePictureUrl: p.profilePictureUrl || p.avatar || '',
      isModerator: p.isModerator || false,
      isSubscriber: p.isSubscriber || p.isSub || false,
      teamMemberLevel: p.teamMemberLevel || p.subLevel || 0,
      timestamp: new Date().toISOString()
    };

    this.handleEvent('join', eventData);
    this.db.logEvent('join', username, eventData);
  }

  /**
   * @param {object} p - Raw TikFinity viewer-count update payload
   * @private
   */
  _onViewerUpdate(p) {
    this.stats.viewers = p.viewerCount || p.viewers || p.count || p.value || 0;
    this.broadcastStats();
    this.emit('viewerChange', {
      viewerCount: this.stats.viewers,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * @param {object} p - Raw TikFinity room-stats payload
   * @private
   */
  _onRoomStats(p) {
    if (typeof p.viewerCount === 'number') this.stats.viewers = p.viewerCount;
    if (typeof p.likeCount === 'number') this.stats.likes = p.likeCount;
    if (typeof p.followerCount === 'number') this.stats.followers = p.followerCount;
    this.broadcastStats();
  }

  // ------------------------------------------------------------------
  // Disconnect
  // ------------------------------------------------------------------

  /**
   * Closes the WebSocket connection and cleans up all resources.
   */
  disconnect() {
    this._intentionalDisconnect = true;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this._stopPing();
    this._stopDurationInterval();

    if (this.statsPersistenceInterval) {
      clearInterval(this.statsPersistenceInterval);
      this.statsPersistenceInterval = null;
    }

    this.db.saveStreamStats(this.stats);

    if (this.ws) {
      this.ws.removeAllListeners();
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }

    this.isConnected = false;
    this.currentUsername = null;
    this.streamStartTime = null;

    this.stats = {
      viewers: 0,
      likes: 0,
      totalCoins: 0,
      followers: 0,
      shares: 0,
      gifts: 0
    };

    this.broadcastStats();
    this.broadcastStatus('disconnected');
    this.logger.info('[TikFinity] ⚫ Disconnected from TikFinity WebSocket');
  }

  // ------------------------------------------------------------------
  // Diagnostics
  // ------------------------------------------------------------------

  /**
   * Returns metadata about this adapter instance.
   * @returns {{ name: string, wsUrl: string, port: number, connected: boolean, reconnectAttempts: number }}
   */
  getAdapterInfo() {
    return {
      name: 'TikFinity',
      wsUrl: this._getWsUrl(),
      port: this._getPort(),
      connected: this.isConnected,
      reconnectAttempts: this._reconnectAttempts
    };
  }
}

module.exports = TikFinityAdapter;
