/**
 * Unit tests for the Sidekick Animaze transport.
 *
 * Covers the wire contract (encode/decode), configuration handling and
 * connection error paths. All sockets are mocks - no Animaze instance needed.
 */

const EventEmitter = require('events');

const {
  AnimazeTransport,
  SpeechState,
  ANIMAZE_ACTIONS,
  encodeCommand,
  decodeMessage,
  buildSendMessageCommand,
  getAnimazeConfig
} = require('../backend/animazeTransport');

function createMockApi() {
  return {
    log: jest.fn(),
    getConfig: jest.fn(),
    setConfig: jest.fn()
  };
}

class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.readyState = 1;
    this.closeCalls = 0;
  }

  send(message) {
    this.sent.push(message);
  }

  close() {
    this.closeCalls++;
    this.readyState = 3;
  }

  openSocket() {
    this.emit('open');
  }

  receive(data) {
    this.emit('message', data);
  }

  fail(error) {
    this.emit('error', error || new Error('socket failure'));
  }

  serverClose(code = 1006, reason = 'lost') {
    this.emit('close', code, reason);
  }
}

function baseConfig(overrides = {}) {
  return {
    animaze: {
      host: '127.0.0.1',
      port: 9000,
      reconnectOnDisconnect: false,
      ...overrides
    }
  };
}

function createTransport({ config = baseConfig(), options } = {}) {
  const api = createMockApi();
  const sockets = [];
  const factory = (uri, opts) => {
    const socket = new MockSocket();
    socket.uri = uri;
    socket.opts = opts;
    sockets.push(socket);
    return socket;
  };
  const transport = new AnimazeTransport(api, config, {
    socketFactory: factory,
    ...(options || {})
  });
  return { api, transport, sockets };
}

describe('encodeCommand', () => {
  it('encodes a valid command envelope to JSON', () => {
    const encoded = encodeCommand({ action: 'ChatbotSendMessage', message: 'Hi' });
    expect(JSON.parse(encoded)).toEqual({ action: 'ChatbotSendMessage', message: 'Hi' });
  });

  it('rejects a missing or empty action', () => {
    expect(() => encodeCommand({ message: 'Hi' })).toThrow('action');
    expect(() => encodeCommand({ action: '   ' })).toThrow('action');
  });

  it('rejects non-object input', () => {
    expect(() => encodeCommand(null)).toThrow(TypeError);
    expect(() => encodeCommand('ChatbotSendMessage')).toThrow(TypeError);
    expect(() => encodeCommand(['a'])).toThrow(TypeError);
  });
});

describe('decodeMessage', () => {
  it('parses JSON strings and buffers', () => {
    expect(decodeMessage('{"action":"ChatbotSpeechStarted"}')).toEqual({
      action: 'ChatbotSpeechStarted'
    });
    expect(decodeMessage(Buffer.from('{"action":"ChatbotSpeechEnded"}'))).toEqual({
      action: 'ChatbotSpeechEnded'
    });
  });

  it('passes already parsed objects through', () => {
    const message = { action: 'ChatbotSpeechStarted' };
    expect(decodeMessage(message)).toBe(message);
  });

  it('returns null for empty, malformed or non-object payloads', () => {
    expect(decodeMessage('')).toBeNull();
    expect(decodeMessage('   ')).toBeNull();
    expect(decodeMessage(null)).toBeNull();
    expect(decodeMessage(undefined)).toBeNull();
    expect(decodeMessage('{not json')).toBeNull();
    expect(decodeMessage('5')).toBeNull();
    expect(decodeMessage('[1,2,3]')).toBeNull();
  });
});

describe('buildSendMessageCommand', () => {
  it('builds a ChatbotSendMessage envelope', () => {
    expect(buildSendMessageCommand('  Hello  ', { priority: 3 })).toEqual({
      action: ANIMAZE_ACTIONS.SEND_MESSAGE,
      message: 'Hello',
      priority: 3
    });
  });

  it('omits optional fields and rejects empty text', () => {
    expect(buildSendMessageCommand('Hi')).toEqual({
      action: ANIMAZE_ACTIONS.SEND_MESSAGE,
      message: 'Hi'
    });
    expect(() => buildSendMessageCommand('')).toThrow(TypeError);
    expect(() => buildSendMessageCommand(undefined)).toThrow(TypeError);
  });
});

describe('getAnimazeConfig', () => {
  it('applies safe defaults', () => {
    const conf = getAnimazeConfig({});
    expect(conf.host).toBe('127.0.0.1');
    expect(conf.port).toBe(9000);
    expect(conf.connectTimeoutMs).toBe(10000);
    expect(conf.requestTimeoutMs).toBe(10000);
    expect(conf.maxReconnectDelayMs).toBe(30000);
  });

  it('honours overrides', () => {
    const conf = getAnimazeConfig({
      animaze: { host: '10.0.0.5', port: 1234, connectTimeoutMs: 250 }
    });
    expect(conf.host).toBe('10.0.0.5');
    expect(conf.port).toBe(1234);
    expect(conf.connectTimeoutMs).toBe(250);
  });
});

describe('SpeechState', () => {
  it('tracks speech transitions and notifies listeners', () => {
    const state = new SpeechState();
    const onStart = jest.fn();
    const onEnd = jest.fn();
    state.onStart(onStart);
    state.onEnd(onEnd);

    expect(state.isSpeaking).toBe(false);
    state.markStarted();
    expect(state.isSpeaking).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);

    state.markEnded();
    expect(state.isSpeaking).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('never breaks on a throwing listener', () => {
    const state = new SpeechState();
    state.onStart(() => {
      throw new Error('boom');
    });
    expect(() => state.markStarted()).not.toThrow();
  });
});

describe('AnimazeTransport', () => {
  let transports = [];

  afterEach(() => {
    transports.forEach(t => t.destroy());
    transports = [];
  });

  function make(opts) {
    const created = createTransport(opts);
    transports.push(created.transport);
    return created;
  }

  it('derives the WebSocket URI from config', () => {
    const { transport } = make();
    expect(transport.getUri()).toBe('ws://127.0.0.1:9000');
  });

  it('connects against a mock socket and reports connected', async () => {
    const { transport, sockets } = make();
    const onOpen = jest.fn();
    transport.on('open', onOpen);

    const promise = transport.connect();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].uri).toBe('ws://127.0.0.1:9000');
    sockets[0].openSocket();

    await expect(promise).resolves.toBe(true);
    expect(transport.isConnected).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(transport.stats.lastConnectedAt).toEqual(expect.any(Number));
  });

  it('degrades gracefully when the socket factory returns nothing', async () => {
    const api = createMockApi();
    const transport = new AnimazeTransport(api, baseConfig(), {
      socketFactory: () => null
    });
    transports.push(transport);

    await expect(transport.connect()).resolves.toBe(false);
    expect(transport.isConnected).toBe(false);
    expect(api.log).toHaveBeenCalledWith(
      expect.stringContaining('WebSocket implementation unavailable'),
      'warn'
    );
  });

  it('degrades gracefully when the socket factory throws', async () => {
    const api = createMockApi();
    const transport = new AnimazeTransport(api, baseConfig(), {
      socketFactory: () => {
        throw new Error('no ws module');
      }
    });
    transports.push(transport);

    await expect(transport.connect()).resolves.toBe(false);
    expect(transport.isConnected).toBe(false);
    expect(transport.stats.errors).toBe(1);
  });

  it('resolves false on socket error and does not throw without listeners', async () => {
    const { transport, sockets } = make();
    const promise = transport.connect();
    expect(() => sockets[0].fail(new Error('ECONNREFUSED'))).not.toThrow();

    await expect(promise).resolves.toBe(false);
    expect(transport.isConnected).toBe(false);
    expect(transport.stats.errors).toBe(1);
  });

  it('emits error to listeners when present', async () => {
    const { transport, sockets } = make();
    const onError = jest.fn();
    transport.on('error', onError);

    const promise = transport.connect();
    sockets[0].fail(new Error('boom'));
    await promise;

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('resolves false and closes the socket on connect timeout', async () => {
    const { transport, sockets } = make({
      config: baseConfig({ connectTimeoutMs: 20 })
    });

    const result = await transport.connect();
    expect(result).toBe(false);
    expect(transport.isConnected).toBe(false);
    expect(sockets[0].closeCalls).toBeGreaterThan(0);
  });

  it('refuses to send while disconnected', async () => {
    const { transport } = make();
    expect(transport.send({ action: 'ChatbotSendMessage', message: 'Hi' })).toBe(false);
    await expect(
      transport.send({ action: 'ChatbotSendMessage', message: 'Hi' }, { waitForResponse: true })
    ).resolves.toBeNull();
  });

  it('encodes and sends commands when connected', async () => {
    const { transport, sockets } = make();
    const promise = transport.connect();
    sockets[0].openSocket();
    await promise;

    const ok = transport.send({ action: 'ChatbotSendMessage', message: 'Hallo', priority: 2 });
    expect(ok).toBe(true);
    expect(sockets[0].sent).toHaveLength(1);
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      action: 'ChatbotSendMessage',
      message: 'Hallo',
      priority: 2
    });
    expect(transport.stats.messagesSent).toBe(1);
  });

  it('returns false for an invalid command envelope', async () => {
    const { transport, sockets } = make();
    const promise = transport.connect();
    sockets[0].openSocket();
    await promise;

    expect(transport.send({ message: 'missing action' })).toBe(false);
    expect(sockets[0].sent).toHaveLength(0);
    expect(transport.stats.errors).toBe(1);
  });

  it('resolves a request/response by matching id', async () => {
    const { transport, sockets } = make();
    const promise = transport.connect();
    sockets[0].openSocket();
    await promise;

    const responsePromise = transport.send(
      { action: 'ChatbotSendMessage', message: 'Ping' },
      { waitForResponse: true }
    );

    const sentCommand = JSON.parse(sockets[0].sent[0]);
    expect(sentCommand.id).toEqual(expect.any(String));

    sockets[0].receive(JSON.stringify({ id: sentCommand.id, ok: true }));
    await expect(responsePromise).resolves.toEqual({ id: sentCommand.id, ok: true });
  });

  it('times out a request without a matching response', async () => {
    const { transport, sockets } = make({
      config: baseConfig({ requestTimeoutMs: 20 })
    });
    const promise = transport.connect();
    sockets[0].openSocket();
    await promise;

    await expect(
      transport.send({ action: 'ChatbotSendMessage', message: 'Ping' }, { waitForResponse: true })
    ).resolves.toBeNull();
    expect(transport.pendingRequests.size).toBe(0);
  });

  it('tracks speech events from inbound messages', async () => {
    const { transport, sockets } = make();
    const onStarted = jest.fn();
    const onEnded = jest.fn();
    transport.on('speech-started', onStarted);
    transport.on('speech-ended', onEnded);

    const promise = transport.connect();
    sockets[0].openSocket();
    await promise;

    sockets[0].receive(JSON.stringify({ action: 'ChatbotSpeechStarted' }));
    expect(transport.speechState.isSpeaking).toBe(true);
    expect(onStarted).toHaveBeenCalledTimes(1);

    sockets[0].receive(JSON.stringify({ action: 'ChatbotSpeechEnded' }));
    expect(transport.speechState.isSpeaking).toBe(false);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed messages without crashing', async () => {
    const { transport, sockets } = make();
    const promise = transport.connect();
    sockets[0].openSocket();
    await promise;

    const onMessage = jest.fn();
    transport.on('message', onMessage);

    expect(() => sockets[0].receive('{not json')).not.toThrow();
    expect(onMessage).not.toHaveBeenCalled();
    expect(transport.stats.messagesReceived).toBe(0);
    expect(transport.stats.malformedMessages).toBe(1);
  });

  it('schedules a reconnect after an unexpected close', async () => {
    const { transport, sockets } = make({
      config: baseConfig({ reconnectOnDisconnect: true, reconnectDelay: 1000, maxReconnectDelayMs: 1000 })
    });
    const onClose = jest.fn();
    transport.on('close', onClose);

    const promise = transport.connect();
    sockets[0].openSocket();
    await promise;

    sockets[0].serverClose(1006, 'lost');

    expect(transport.isConnected).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(transport.reconnectAttempts).toBe(1);
    expect(transport.stats.reconnectCount).toBe(1);
    expect(transport.reconnectTimer).not.toBeNull();
  });

  it('does not reconnect on a manual disconnect', async () => {
    const { transport, sockets } = make({
      config: baseConfig({ reconnectOnDisconnect: true })
    });
    const promise = transport.connect();
    sockets[0].openSocket();
    await promise;

    transport.disconnect();
    sockets[0].serverClose(1000, 'normal');

    expect(transport.reconnectTimer).toBeNull();
    expect(transport.stats.reconnectCount).toBe(0);
  });

  it('returns a status snapshot', async () => {
    const { transport } = make();
    const status = transport.getStatus();
    expect(status.driver).toBe('animaze');
    expect(status.isConnected).toBe(false);
    expect(status.uri).toBe('ws://127.0.0.1:9000');
    expect(status.stats).toBeDefined();
  });

  it('clears pending requests on destroy', async () => {
    const { transport, sockets } = make();
    const promise = transport.connect();
    sockets[0].openSocket();
    await promise;

    transport.send({ action: 'ChatbotSendMessage', message: 'Ping' }, { waitForResponse: true });
    expect(transport.pendingRequests.size).toBe(1);

    transport.destroy();
    expect(transport.pendingRequests.size).toBe(0);
  });
});
