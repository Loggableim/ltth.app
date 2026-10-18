/**
 * Sidekick Plugin - Animaze/ChatPal Transport
 *
 * Dedicated transport layer between LTTH (Sidekick) and Animaze ChatPal.
 * It owns the WebSocket channel, the wire codec and the speech-state machine.
 *
 * ---------------------------------------------------------------------------
 * Contract (lt-k02 T1/T2)
 * ---------------------------------------------------------------------------
 * Transport: WebSocket (default ws://<host>:<port>).
 *
 * Downstream (LTTH -> Animaze) command envelope:
 *   {
 *     action: 'ChatbotSendMessage',   // required, non-empty string
 *     message: 'text to speak',       // required for ChatbotSendMessage
 *     priority: 1,                     // optional, higher = earlier
 *     id: 'sidekick_1_<ts>'           // optional, only for request/response
 *   }
 *
 * Upstream (Animaze -> LTTH) message envelope:
 *   { action: 'ChatbotSpeechStarted' }        // avatar started speaking
 *   { action: 'ChatbotSpeechEnded' }          // avatar stopped speaking
 *   { id: 'sidekick_1_<ts>', ... }            // response to a command with id
 *   { error: 'description' }                  // server-side error
 *
 * The socket implementation is injected via `options.socketFactory`, which
 * allows the transport to be implemented and tested against mocks without a
 * running Animaze instance:
 *
 *   const transport = new AnimazeTransport(api, config, {
 *     socketFactory: (uri, opts) => new MockSocket(uri, opts)
 *   });
 *
 * Graceful degradation: when Animaze is unreachable (connection refused,
 * handshake timeout, missing websocket implementation, malformed payloads)
 * the transport NEVER throws. It logs a clear message, reports
 * `isConnected === false` and `connect()` resolves to `false`.
 */

const EventEmitter = require('events');
const path = require('path');

const ANIMAZE_ACTIONS = {
  SEND_MESSAGE: 'ChatbotSendMessage',
  SPEECH_STARTED: 'ChatbotSpeechStarted',
  SPEECH_ENDED: 'ChatbotSpeechEnded'
};

const DEFAULTS = {
  host: '127.0.0.1',
  port: 9000,
  reconnectOnDisconnect: true,
  reconnectDelay: 5000,
  maxReconnectAttempts: 10,
  maxReconnectDelayMs: 30000,
  connectTimeoutMs: 10000,
  requestTimeoutMs: 10000,
  handshakeTimeoutMs: 5000
};

/**
 * Resolve a WebSocket implementation. `ws` is a dependency of the LTTH app but
 * the plugin must also survive being loaded from an unexpected cwd.
 * @returns {Function|null}
 */
function resolveWebSocketImplementation() {
  const loaders = [
    () => require('ws'),
    () => require(require.resolve('ws', {
      paths: [
        path.join(__dirname, '..', '..', '..', 'node_modules'),
        path.resolve(process.cwd(), 'node_modules')
      ]
    }))
  ];

  for (const load of loaders) {
    try {
      const impl = load();
      if (impl) {
        return impl;
      }
    } catch (err) {
      // try next loader
    }
  }

  return global.WebSocket || null;
}

/**
 * Default socket factory using the real `ws` implementation.
 * @param {string} uri
 * @param {Object} options
 * @returns {Object|null} WebSocket instance or null when unavailable
 */
function defaultSocketFactory(uri, options) {
  const WebSocketImpl = resolveWebSocketImplementation();
  if (!WebSocketImpl) {
    return null;
  }
  return new WebSocketImpl(uri, options);
}

/**
 * Normalize the Animaze transport configuration with safe defaults.
 * @param {Object} [config]
 * @returns {Object}
 */
function getAnimazeConfig(config = {}) {
  const animaze = (config && config.animaze) || {};
  return {
    enabled: animaze.enabled === true,
    host: animaze.host || DEFAULTS.host,
    port: animaze.port || DEFAULTS.port,
    reconnectOnDisconnect: animaze.reconnectOnDisconnect !== false,
    reconnectDelay: animaze.reconnectDelay || DEFAULTS.reconnectDelay,
    maxReconnectAttempts: animaze.maxReconnectAttempts || DEFAULTS.maxReconnectAttempts,
    maxReconnectDelayMs: animaze.maxReconnectDelayMs || DEFAULTS.maxReconnectDelayMs,
    connectTimeoutMs: animaze.connectTimeoutMs || DEFAULTS.connectTimeoutMs,
    requestTimeoutMs: animaze.requestTimeoutMs || DEFAULTS.requestTimeoutMs,
    handshakeTimeoutMs: animaze.handshakeTimeoutMs || DEFAULTS.handshakeTimeoutMs
  };
}

/**
 * Encode an outbound command as a JSON string.
 * @param {Object} command
 * @returns {string}
 * @throws {TypeError} when the command envelope is invalid
 */
function encodeCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    throw new TypeError('command must be a plain object');
  }
  if (typeof command.action !== 'string' || command.action.trim() === '') {
    throw new TypeError('command.action must be a non-empty string');
  }
  return JSON.stringify(command);
}

/**
 * Decode an inbound message. Accepts a JSON string, a Buffer or an already
 * parsed object. Malformed or non-object payloads return null instead of
 * throwing (graceful degradation).
 * @param {string|Buffer|Object|null} raw
 * @returns {Object|null}
 */
function decodeMessage(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) {
    return raw;
  }

  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  if (text.trim() === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    return null;
  }
}

/**
 * Build a ChatbotSendMessage command envelope.
 * @param {string} text
 * @param {Object} [options]
 * @param {number} [options.priority]
 * @param {string} [options.requestId]
 * @returns {Object}
 * @throws {TypeError} when text is empty
 */
function buildSendMessageCommand(text, options = {}) {
  const message = typeof text === 'string' ? text.trim() : '';
  if (!message) {
    throw new TypeError('text must be a non-empty string');
  }

  const command = {
    action: ANIMAZE_ACTIONS.SEND_MESSAGE,
    message
  };

  if (options.priority !== undefined) {
    command.priority = options.priority;
  }
  if (options.requestId) {
    command.id = options.requestId;
  }

  return command;
}

/**
 * Speech state tracker for Animaze ChatPal.
 * Emits nothing itself; listeners are invoked defensively so a throwing
 * listener can never break the transport.
 */
class SpeechState {
  constructor() {
    this.isSpeaking = false;
    this.speechStartedAt = null;
    this.speechEndedAt = null;
    this.listeners = {
      start: [],
      end: []
    };
  }

  markStarted() {
    this.isSpeaking = true;
    this.speechStartedAt = Date.now();
    this._notify('start');
  }

  markEnded() {
    this.isSpeaking = false;
    this.speechEndedAt = Date.now();
    this._notify('end');
  }

  onStart(callback) {
    this.listeners.start.push(callback);
  }

  onEnd(callback) {
    this.listeners.end.push(callback);
  }

  _notify(type) {
    this.listeners[type].forEach(cb => {
      try {
        cb();
      } catch (err) {
        // listener errors must not break the transport
      }
    });
  }

  /**
   * Wait for speech to end.
   * @param {number} [timeoutMs=15000]
   * @returns {Promise<boolean>} true if speech ended, false on timeout
   */
  waitForEnd(timeoutMs = 15000) {
    return new Promise((resolve) => {
      if (!this.isSpeaking) {
        resolve(true);
        return;
      }

      let resolved = false;

      this.onEnd(() => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, timeoutMs);
    });
  }
}

/**
 * Animaze/ChatPal WebSocket transport.
 *
 * Events: 'open', 'close', 'error', 'message', 'speech-started',
 * 'speech-ended', 'reconnect-scheduled'.
 */
class AnimazeTransport extends EventEmitter {
  constructor(api, config, options = {}) {
    super();
    this.api = api;
    this.config = config;
    this.setMaxListeners(50);

    this._socketFactory = options.socketFactory || defaultSocketFactory;
    this._setTimeout = options.setTimeout || setTimeout;
    this._clearTimeout = options.clearTimeout || clearTimeout;

    this.ws = null;
    this._isConnected = false;
    this._manualDisconnect = false;
    this._connectTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;

    this.speechState = new SpeechState();

    this.requestIdCounter = 0;
    this.pendingRequests = new Map();

    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      reconnectCount: 0,
      errors: 0,
      malformedMessages: 0,
      lastConnectedAt: null,
      lastDisconnectedAt: null
    };
  }

  /**
   * @returns {boolean}
   */
  get isConnected() {
    return this._isConnected;
  }

  /**
   * @returns {Object} normalized animaze config
   */
  getAnimazeConfig() {
    return getAnimazeConfig(this.config);
  }

  /**
   * @returns {string} WebSocket URI
   */
  getUri() {
    const conf = this.getAnimazeConfig();
    return `ws://${conf.host}:${conf.port}`;
  }

  /**
   * Connect to Animaze. Never rejects.
   * @returns {Promise<boolean>} true when the socket opened
   */
  async connect() {
    if (this._isConnected) {
      return true;
    }

    this._manualDisconnect = false;
    this._teardownSocket();

    const uri = this.getUri();
    const conf = this.getAnimazeConfig();
    this.api.log(`[Animaze] Connecting to ${uri}...`, 'info');

    let socket;
    try {
      socket = this._socketFactory(uri, { handshakeTimeout: conf.handshakeTimeoutMs });
    } catch (error) {
      this.stats.errors++;
      this.api.log(`[Animaze] Failed to create WebSocket: ${error.message}`, 'error');
      return false;
    }

    if (!socket || typeof socket.on !== 'function') {
      this.stats.errors++;
      this.api.log('[Animaze] WebSocket implementation unavailable - avatar output disabled (graceful degradation)', 'warn');
      return false;
    }

    this.ws = socket;

    return new Promise((resolve) => {
      let settled = false;
      const settle = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        this._clearConnectTimer();
        resolve(value);
      };

      socket.on('open', () => {
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.stats.lastConnectedAt = Date.now();
        this.api.log(`[Animaze] Connected to ${uri}`, 'info');
        this.emit('open');
        settle(true);
      });

      socket.on('message', (data) => {
        this._handleMessage(data);
      });

      socket.on('close', (code, reason) => {
        const wasConnected = this._isConnected;
        this._isConnected = false;
        this.stats.lastDisconnectedAt = Date.now();

        if (wasConnected) {
          this.api.log(`[Animaze] Disconnected from Animaze (code: ${code})`, 'warn');
          this.emit('close', { code, reason });
        }

        const current = this.getAnimazeConfig();
        if (!this._manualDisconnect && current.reconnectOnDisconnect) {
          this._scheduleReconnect();
        }

        settle(false);
      });

      socket.on('error', (error) => {
        this.stats.errors++;
        this.api.log(`[Animaze] WebSocket error: ${error && error.message ? error.message : error}`, 'error');
        this._isConnected = false;
        this._emitError(error);
        settle(false);
      });

      this._connectTimer = this._setTimeout(() => {
        this.api.log(`[Animaze] Connection to ${uri} timed out after ${conf.connectTimeoutMs}ms`, 'warn');
        this._teardownSocket();
        settle(false);
      }, conf.connectTimeoutMs);
    });
  }

  /**
   * Disconnect and stop reconnecting.
   */
  disconnect() {
    this._manualDisconnect = true;
    this._clearConnectTimer();

    if (this.reconnectTimer) {
      this._clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this._isConnected = false;
    this.reconnectAttempts = 0;
    this._teardownSocket();
    this.speechState.markEnded();

    this.api.log('[Animaze] Disconnected from Animaze', 'info');
  }

  /**
   * Send a command over the socket.
   * @param {Object} command - command envelope (see contract)
   * @param {Object} [options]
   * @param {boolean} [options.waitForResponse=false]
   * @param {number} [options.timeoutMs]
   * @returns {boolean|Promise<Object|null>} false/success when fire-and-forget,
   *   Promise resolving to the response (or null) when waiting
   */
  send(command, options = {}) {
    const { waitForResponse = false, timeoutMs } = options;

    if (!this._isConnected || !this.ws) {
      this.api.log('[Animaze] Cannot send command: not connected', 'warn');
      return waitForResponse ? Promise.resolve(null) : false;
    }

    let envelope = command;
    if (waitForResponse) {
      envelope = {
        ...command,
        id: (command && command.id) || `sidekick_${++this.requestIdCounter}_${Date.now()}`
      };
    }

    let payload;
    try {
      payload = encodeCommand(envelope);
    } catch (error) {
      this.stats.errors++;
      this.api.log(`[Animaze] Invalid command: ${error.message}`, 'error');
      return waitForResponse ? Promise.resolve(null) : false;
    }

    try {
      this.ws.send(payload);
      this.stats.messagesSent++;
    } catch (error) {
      this.stats.errors++;
      this.api.log(`[Animaze] Failed to send command: ${error.message}`, 'error');
      return waitForResponse ? Promise.resolve(null) : false;
    }

    if (!waitForResponse) {
      return true;
    }

    const id = envelope.id;
    return new Promise((resolve) => {
      const timer = this._setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve(null);
        }
      }, timeoutMs || this.getAnimazeConfig().requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve: (message) => {
          this._clearTimeout(timer);
          resolve(message);
        }
      });
    });
  }

  /**
   * Handle an inbound raw message.
   * @private
   */
  _handleMessage(raw) {
    const message = decodeMessage(raw);
    if (!message) {
      this.stats.malformedMessages++;
      this.api.log('[Animaze] Ignored malformed message', 'warn');
      return;
    }

    this.stats.messagesReceived++;
    this.emit('message', message);

    const action = message.action || message.event || '';

    if (action === ANIMAZE_ACTIONS.SPEECH_STARTED) {
      this.speechState.markStarted();
      this.emit('speech-started');
      this.api.log('[Animaze] ChatPal started speaking', 'debug');
    } else if (action === ANIMAZE_ACTIONS.SPEECH_ENDED) {
      this.speechState.markEnded();
      this.emit('speech-ended');
      this.api.log('[Animaze] ChatPal finished speaking', 'debug');
    }

    if (message.id && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      pending.resolve(message);
    }

    if (message.error) {
      this.stats.errors++;
      this.api.log(`[Animaze] Server error: ${message.error}`, 'error');
    }
  }

  /**
   * Schedule a reconnect attempt with exponential backoff + jitter.
   * @private
   */
  _scheduleReconnect() {
    const conf = this.getAnimazeConfig();

    if (this.reconnectAttempts >= conf.maxReconnectAttempts) {
      this.api.log('[Animaze] Max reconnect attempts reached', 'warn');
      return;
    }

    this.reconnectAttempts++;
    this.stats.reconnectCount++;

    const delay = Math.min(
      conf.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1) + Math.random() * 1000,
      conf.maxReconnectDelayMs
    );

    this.api.log(`[Animaze] Scheduling reconnect attempt ${this.reconnectAttempts} in ${Math.round(delay)}ms`, 'debug');
    this.emit('reconnect-scheduled', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = this._setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, delay);
  }

  /**
   * Emit an 'error' event only when someone listens, so a missing listener can
   * never crash the process (EventEmitter throws on unhandled 'error').
   * @private
   */
  _emitError(error) {
    if (this.listenerCount('error') > 0) {
      this.emit('error', error);
    }
  }

  /**
   * @private
   */
  _clearConnectTimer() {
    if (this._connectTimer) {
      this._clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }
  }

  /**
   * Close and drop the current socket without touching reconnect state.
   * @private
   */
  _teardownSocket() {
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      try {
        socket.close();
      } catch (err) {
        // ignore
      }
    }
  }

  /**
   * @returns {Object} transport status snapshot
   */
  getStatus() {
    return {
      driver: 'animaze',
      isConnected: this._isConnected,
      isSpeaking: this.speechState.isSpeaking,
      reconnectAttempts: this.reconnectAttempts,
      uri: this.getUri(),
      stats: { ...this.stats }
    };
  }

  /**
   * @param {Object} config
   */
  updateConfig(config) {
    this.config = config;
  }

  /**
   * Clean up resources.
   */
  destroy() {
    this.disconnect();
    this.pendingRequests.clear();
    this.removeAllListeners();
  }
}

module.exports = {
  AnimazeTransport,
  SpeechState,
  ANIMAZE_ACTIONS,
  DEFAULTS,
  encodeCommand,
  decodeMessage,
  buildSendMessageCommand,
  getAnimazeConfig,
  defaultSocketFactory,
  resolveWebSocketImplementation
};
