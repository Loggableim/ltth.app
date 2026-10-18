/**
 * Sidekick Plugin - Animaze/ChatPal Test Doubles (Mock Endpoint)
 *
 * In-memory mock of the Animaze ChatPal side of the wire contract defined in
 * `animazeContract.js`. This lets the transport and any consumer be implemented
 * and unit-tested without a running Animaze instance (AC "Mock-Interface").
 *
 * Usage (inject into a transport that accepts a socket factory):
 *
 *   const { createMockServer } = require('../backend/animazeMock');
 *   const server = createMockServer({ speechDurationMs: 0 });
 *   const transport = new AnimazeTransport(api, config, {
 *     socketFactory: server.socketFactory
 *   });
 *   await transport.connect();
 *   await transport.send(buildSendMessageCommand('Hi'));
 *   server.commands; // [{ action: 'ChatbotSendMessage', message: 'Hi' }]
 *
 * Failure injection: create a socket with `server.createSocket(...)` and call
 * `socket.refuse()`, `socket.stall()`, `socket.emitMalformed()` or set
 * `server.failMode = 'error' | 'close'` before sending.
 */

'use strict';

const EventEmitter = require('events');

const {
  ANIMAZE_ACTIONS,
  decodeMessage,
  isValidCommand,
  buildSendMessageCommand
} = require('./animazeContract');

const SOCKET_STATE = Object.freeze({
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
});

/**
 * Minimal EventEmitter-based WebSocket double. Mirrors the small surface the
 * Sidekick transport uses (`on`, `send`, `close`, `readyState`) plus driver
 * helpers used by tests.
 */
class MockAnimazeSocket extends EventEmitter {
  /**
   * @param {MockAnimazeServer|null} server
   * @param {string} [uri]
   * @param {Object} [options]
   */
  constructor(server = null, uri = 'ws://127.0.0.1:9000', options = {}) {
    super();
    this.server = server;
    this.uri = uri;
    this.options = options;
    this.readyState = SOCKET_STATE.CONNECTING;
    this.sent = [];
    this.closeCalls = 0;
    this.closeArgs = null;
  }

  /** @returns {boolean} True once the socket is open. */
  get isOpen() {
    return this.readyState === SOCKET_STATE.OPEN;
  }

  /**
   * Send a raw frame to the mock server.
   * @param {string|Buffer} data
   * @returns {boolean}
   * @throws {Error} when the socket is not open (matches `ws` behavior).
   */
  send(data) {
    if (!this.isOpen) {
      throw new Error(`WebSocket is not open: readyState ${this.readyState}`);
    }
    this.sent.push(data);
    if (this.server) {
      this.server.handleClientMessage(this, data);
    }
    return true;
  }

  /**
   * Close the socket.
   * @param {number} [code]
   * @param {string} [reason]
   */
  close(code = 1000, reason = '') {
    this.closeCalls++;
    this.closeArgs = { code, reason };
    const wasOpen = this.readyState === SOCKET_STATE.OPEN;
    this.readyState = SOCKET_STATE.CLOSED;
    if (wasOpen) {
      this.emit('close', code, reason);
    }
  }

  /**
   * Open the socket (driver helper).
   * @returns {MockAnimazeSocket} this
   */
  open() {
    if (this.readyState === SOCKET_STATE.CONNECTING) {
      this.readyState = SOCKET_STATE.OPEN;
      this.emit('open');
    }
    return this;
  }

  /**
   * Simulate a connect failure (driver helper).
   * @param {Error|string} [error]
   * @returns {MockAnimazeSocket} this
   */
  refuse(error) {
    this.readyState = SOCKET_STATE.CLOSED;
    this.emit('error', normalizeError(error, 'mock connection refused'));
    return this;
  }

  /**
   * Keep the socket connecting forever to simulate a handshake timeout
   * (driver helper). This is a no-op on purpose.
   * @returns {MockAnimazeSocket} this
   */
  stall() {
    return this;
  }

  /**
   * Deliver a raw inbound frame to the socket (driver helper).
   * @param {string|Buffer|Object} data
   * @returns {MockAnimazeSocket} this
   */
  receive(data) {
    this.emit('message', data);
    return this;
  }

  /**
   * Deliver a malformed inbound frame (driver helper).
   * @returns {MockAnimazeSocket} this
   */
  emitMalformed() {
    return this.receive('{not valid json');
  }

  /**
   * Simulate a server-initiated close (driver helper).
   * @param {number} [code]
   * @param {string} [reason]
   * @returns {MockAnimazeSocket} this
   */
  serverClose(code = 1006, reason = 'lost') {
    this.readyState = SOCKET_STATE.CLOSED;
    this.emit('close', code, reason);
    return this;
  }

  /**
   * Emit a `ChatbotSpeechStarted` frame (driver helper).
   * @returns {MockAnimazeSocket} this
   */
  speakStarted() {
    if (this.server) {
      return this.receive(this.server.serializeEvent({ action: ANIMAZE_ACTIONS.SPEECH_STARTED }));
    }
    return this.receive(JSON.stringify({ action: ANIMAZE_ACTIONS.SPEECH_STARTED }));
  }

  /**
   * Emit a `ChatbotSpeechEnded` frame (driver helper).
   * @returns {MockAnimazeSocket} this
   */
  speakEnded() {
    if (this.server) {
      return this.receive(this.server.serializeEvent({ action: ANIMAZE_ACTIONS.SPEECH_ENDED }));
    }
    return this.receive(JSON.stringify({ action: ANIMAZE_ACTIONS.SPEECH_ENDED }));
  }
}

/**
 * Normalize an error-ish input into an Error instance.
 * @param {Error|string|undefined} error
 * @param {string} fallback
 * @returns {Error}
 */
function normalizeError(error, fallback) {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' && error ? error : fallback);
}

/**
 * In-memory mock of the Animaze ChatPal endpoint. Records every outbound
 * message and, by default, answers a valid `ChatbotSendMessage` with the
 * documented speech events.
 */
class MockAnimazeServer {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.autoRespond=true]          Answer valid commands with speech events.
   * @param {('none'|'error'|'close')} [options.failMode='none']  Failure injection on inbound commands.
   * @param {('none'|'open'|'refuse'|'stall')} [options.connectBehavior='none'] Applied when a socket is created.
   * @param {boolean} [options.respondOnMalformed=true]   Reply with an error frame for malformed input.
   * @param {Function|null} [options.logger=null]         Optional `(level, message) => void` logger.
   */
  constructor(options = {}) {
    this.options = {
      autoRespond: options.autoRespond !== false,
      failMode: options.failMode || 'none',
      connectBehavior: options.connectBehavior || 'none',
      respondOnMalformed: options.respondOnMalformed !== false
    };
    this.logger = options.logger || null;
    this.connectBehavior = this.options.connectBehavior;
    this.failMode = this.options.failMode;
    /** @type {Array<Object>} valid downstream commands received */
    this.commands = [];
    /** @type {Array<string|Buffer>} raw downstream frames received */
    this.rawMessages = [];
    /** @type {Array<string>} raw upstream frames emitted */
    this.events = [];
    /** @type {MockAnimazeSocket[]} sockets handed out by the factory */
    this.sockets = [];
    this.malformedMessages = 0;
    this.closedConnections = 0;
  }

  /**
   * Create a socket bound to this server.
   * @param {string} [uri]
   * @param {Object} [options]
   * @returns {MockAnimazeSocket}
   */
  createSocket(uri, options) {
    const socket = new MockAnimazeSocket(this, uri, options);
    this.sockets.push(socket);

    if (this.connectBehavior === 'refuse') {
      setImmediate(() => socket.refuse('mock connection refused'));
    } else if (this.connectBehavior === 'open') {
      setImmediate(() => socket.open());
    }
    // 'stall' and 'none' leave the socket connecting until a driver helper runs.

    return socket;
  }

  /**
   * Socket factory compatible with injectable transports.
   * @type {(uri: string, options?: Object) => MockAnimazeSocket}
   */
  get socketFactory() {
    return (uri, options) => this.createSocket(uri, options);
  }

  /**
   * Serialize an upstream event to a wire frame and record it.
   * @param {Object} payload
   * @returns {string}
   */
  serializeEvent(payload) {
    const frame = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.events.push(frame);
    return frame;
  }

  /**
   * Emit an upstream frame to a socket.
   * @param {MockAnimazeSocket} socket
   * @param {Object|string} payload
   * @returns {string} The emitted frame.
   */
  emitTo(socket, payload) {
    const frame = this.serializeEvent(payload);
    socket.receive(frame);
    return frame;
  }

  /**
   * Emit the full speech cycle (`started` then `ended`) to a socket.
   * @param {MockAnimazeSocket} socket
   * @returns {MockAnimazeSocket} The socket.
   */
  speak(socket) {
    this.emitTo(socket, { action: ANIMAZE_ACTIONS.SPEECH_STARTED });
    this.emitTo(socket, { action: ANIMAZE_ACTIONS.SPEECH_ENDED });
    return socket;
  }

  /**
   * Handle a raw downstream frame. Records it, validates it and (unless
   * disabled) answers valid commands. Never throws.
   * @param {MockAnimazeSocket} socket
   * @param {string|Buffer} raw
   * @returns {Object|null} The parsed command, or `null` when malformed.
   */
  handleClientMessage(socket, raw) {
    this.rawMessages.push(raw);

    const message = decodeMessage(raw);
    if (!isValidCommand(message)) {
      this.malformedMessages++;
      this.log('warn', 'mock Animaze received a malformed command');
      if (this.options.respondOnMalformed) {
        this.emitTo(socket, { error: 'malformed command' });
      }
      return null;
    }

    if (this.failMode === 'error') {
      this.emitTo(socket, { error: 'mock server error' });
      return message;
    }
    if (this.failMode === 'close') {
      this.closedConnections++;
      socket.serverClose(1011, 'mock server close');
      return message;
    }

    this.commands.push(message);

    if (this.options.autoRespond) {
      if (message.id) {
        this.emitTo(socket, { id: message.id, ok: true });
      }
      if (message.action === ANIMAZE_ACTIONS.SEND_MESSAGE) {
        this.speak(socket);
      }
    }

    return message;
  }

  /**
   * A freshly opened socket wired to this server (driver helper for
   * auto-open-free tests).
   * @param {string} [uri]
   * @returns {MockAnimazeSocket}
   */
  openSocket(uri) {
    return this.createSocket(uri).open();
  }

  /**
   * Reset all recorded state.
   * @returns {MockAnimazeServer} this
   */
  reset() {
    this.commands = [];
    this.rawMessages = [];
    this.events = [];
    this.sockets = [];
    this.malformedMessages = 0;
    this.closedConnections = 0;
    return this;
  }

  /**
   * @param {string} level
   * @param {string} message
   * @private
   */
  log(level, message) {
    if (typeof this.logger === 'function') {
      this.logger(level, message);
    }
  }
}

/**
 * Create a mock Animaze server.
 * @param {ConstructorParameters<typeof MockAnimazeServer>[0]} [options]
 * @returns {MockAnimazeServer}
 */
function createMockServer(options) {
  return new MockAnimazeServer(options);
}

/**
 * Create a socket factory that hands out sockets of a mock server. Accepts
 * either a server instance or the same options as {@link createMockServer}.
 * @param {MockAnimazeServer|Object} [serverOrOptions]
 * @returns {{server: MockAnimazeServer, factory: Function}}
 */
function createMockSocketFactory(serverOrOptions) {
  const server = serverOrOptions instanceof MockAnimazeServer
    ? serverOrOptions
    : createMockServer(serverOrOptions);
  return { server, factory: server.socketFactory };
}

/**
 * Build a valid `ChatbotSendMessage` frame for tests.
 * @param {string} text
 * @param {{priority?: number, requestId?: string}} [options]
 * @returns {string}
 */
function buildCommandFrame(text, options) {
  return JSON.stringify(buildSendMessageCommand(text, options));
}

module.exports = {
  SOCKET_STATE,
  MockAnimazeSocket,
  MockAnimazeServer,
  createMockServer,
  createMockSocketFactory,
  buildCommandFrame
};
