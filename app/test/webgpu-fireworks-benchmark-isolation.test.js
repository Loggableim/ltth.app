'use strict';

const path = require('path');
const { randomUUID } = require('crypto');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');

class FakeSocket {
  constructor(id) {
    this.id = id;
    this.connected = true;
    this.handlers = new Map();
    this.emitted = [];
    this.ackEnabled = true;
    this.ackResponse = null;
    this.ackDelayMs = 0;
    this.ackTimeoutMs = null;
    this.pendingAcks = new Set();
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  timeout(timeoutMs) {
    this.ackTimeoutMs = timeoutMs;
    return this;
  }

  emit(event, payload, acknowledge) {
    const timeoutMs = this.ackTimeoutMs;
    this.ackTimeoutMs = null;
    this.emitted.push([event, payload]);
    if (typeof acknowledge === 'function') {
      if (this.ackEnabled) {
        const response = this.ackResponse || {
          accepted: true,
          benchmarkSessionId: payload?.benchmarkSessionId
        };
        if (this.ackDelayMs > 0) {
          const timer = setTimeout(() => {
            this.pendingAcks.delete(timer);
            acknowledge(null, response);
          }, this.ackDelayMs);
          this.pendingAcks.add(timer);
        } else acknowledge(null, response);
      } else if (Number.isFinite(timeoutMs)) {
        const timer = setTimeout(() => {
          this.pendingAcks.delete(timer);
          acknowledge(new Error('operation has timed out'));
        }, timeoutMs);
        this.pendingAcks.add(timer);
      }
    }
    return true;
  }

  receive(event, payload) {
    this.handlers.get(event)?.(payload);
  }

  removeAllListeners(event) {
    this.handlers.delete(event);
  }

  payloads(event) {
    return this.emitted
      .filter(([emittedEvent]) => emittedEvent === event)
      .map(([, payload]) => payload);
  }
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status: jest.fn(function setStatus(statusCode) {
      this.statusCode = statusCode;
      return this;
    }),
    json: jest.fn(function sendJson(body) {
      this.body = body;
      return this;
    })
  };
}

function createHarness(config = {}) {
  const routes = new Map();
  const connections = [];
  const api = {
    getPluginDataDir: jest.fn(() => path.join(__dirname, '.tmp-webgpu-fireworks-benchmark-isolation')),
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(),
    getDatabase: jest.fn(() => null),
    emit: jest.fn(() => true),
    log: jest.fn(),
    registerMiddleware: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    registerSocketConnection: jest.fn(handler => connections.push(handler))
  };
  const plugin = new FireworksPlugin(api);
  plugin.config = normalizeConfig({ enabled: true, ...config });
  plugin.spawnPlanner.plan = jest.fn(() => ({
    position: { x: 0.25, y: 0.4 },
    origin: { x: 0.5, y: 1 },
    seed: 1234
  }));
  plugin.registerRoutes();
  plugin.registerSocketHandlers();

  const request = ({ body = {}, query = {} } = {}) => ({
    body,
    query,
    protocol: 'http',
    get: jest.fn(name => name === 'host' ? 'localhost:3000' : undefined)
  });
  const callRoute = (method, route, req = request()) => {
    const response = createResponse();
    const handler = routes.get(`${method}:${route}`);
    if (!handler) throw new Error(`Missing route ${method}:${route}`);
    handler(req, response);
    return response;
  };
  const connect = id => {
    const socket = new FakeSocket(id);
    connections[0](socket);
    return socket;
  };

  return { api, callRoute, connect, plugin, request, routes };
}

function startSession(harness) {
  const response = harness.callRoute(
    'post',
    '/api/webgpu-fireworks/benchmark/start',
    harness.request()
  );
  expect(response.statusCode).toBe(201);
  return response.body;
}

function registerBenchmarkRenderer(socket, sessionId, {
  state = 'ready',
  visible = true,
  fps = 60
} = {}) {
  socket.receive('webgpu-fireworks:register-overlay', {
    benchmark: true,
    benchmarkSessionId: sessionId,
    visible
  });
  socket.receive('webgpu-fireworks:renderer-status', {
    benchmark: true,
    benchmarkSessionId: sessionId,
    state,
    visible
  });
  socket.receive('webgpu-fireworks:fps-update', {
    benchmark: true,
    benchmarkSessionId: sessionId,
    fps,
    visible
  });
}

describe('WebGPU Fireworks benchmark session isolation', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('starts an isolated UUID session and returns its overlay URL', () => {
    const harness = createHarness({ targetFps: 45, audioEnabled: true });

    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/start',
      harness.request()
    );

    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual({
      success: true,
      sessionId: expect.any(String),
      overlayUrl: expect.any(String)
    });
    expect(response.body.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(response.body.overlayUrl).toBe(
      `http://localhost:3000/webgpu-fireworks/overlay?benchmark=true&benchmarkSessionId=${response.body.sessionId}`
    );

    const session = harness.plugin.benchmarkSessions.get(response.body.sessionId);
    expect(session).toMatchObject({
      id: response.body.sessionId,
      socket: null,
      socketId: null,
      restored: false
    });
    expect(session.baseConfig).toEqual(harness.plugin.config);
    expect(session.config).toEqual(harness.plugin.config);
    expect(session.baseConfig).not.toBe(harness.plugin.config);
    expect(session.config).not.toBe(session.baseConfig);
  });

  test('normalizes a preset inside one session and emits it only to that session socket', () => {
    const harness = createHarness({ targetFps: 45, audioEnabled: true, colorMode: 'theme' });
    const first = startSession(harness);
    const second = startSession(harness);
    const firstSocket = harness.connect('benchmark-first');
    const secondSocket = harness.connect('benchmark-second');
    const liveConfig = JSON.parse(JSON.stringify(harness.plugin.config));

    registerBenchmarkRenderer(firstSocket, first.sessionId);
    registerBenchmarkRenderer(secondSocket, second.sessionId);
    firstSocket.emitted = [];
    secondSocket.emitted = [];
    harness.api.emit.mockClear();

    const preset = {
      targetFps: 999,
      maxTotalParticles: 999999,
      colorMode: 'rainbow',
      audioEnabled: false
    };
    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/set-preset',
      harness.request({ body: { sessionId: first.sessionId, preset } })
    );

    const expectedConfig = normalizeConfig({
      ...harness.plugin.benchmarkSessions.get(first.sessionId).baseConfig,
      ...preset
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      sessionId: first.sessionId,
      message: 'Preset applied for benchmark',
      config: expectedConfig
    });
    expect(harness.plugin.config).toEqual(liveConfig);
    expect(harness.plugin.benchmarkSessions.get(first.sessionId).config).toEqual(expectedConfig);
    expect(harness.plugin.benchmarkSessions.get(first.sessionId).baseConfig).toEqual(liveConfig);
    expect(harness.plugin.benchmarkSessions.get(second.sessionId).config).toEqual(liveConfig);
    expect(firstSocket.payloads('webgpu-fireworks:config-update')).toEqual([{
      config: expectedConfig,
      benchmarkSessionId: first.sessionId
    }]);
    expect(secondSocket.payloads('webgpu-fireworks:config-update')).toHaveLength(0);
    expect(harness.api.emit).not.toHaveBeenCalled();
    expect(harness.api.setConfig).not.toHaveBeenCalled();
  });

  test.each([
    ['missing session id', {}, 400],
    ['invalid session id', { sessionId: 'not-a-uuid' }, 400],
    ['unknown session id', { sessionId: randomUUID() }, 404]
  ])('rejects set-preset with %s', (_label, body, expectedStatus) => {
    const harness = createHarness();
    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/set-preset',
      harness.request({ body: { ...body, preset: { targetFps: 30 } } })
    );

    expect(response.statusCode).toBe(expectedStatus);
    expect(response.body).toMatchObject({ success: false, code: expect.any(String) });
    expect(harness.api.emit).not.toHaveBeenCalled();
    expect(harness.api.setConfig).not.toHaveBeenCalled();
  });

  test('returns 503 when a preset session has no connected renderer socket', () => {
    const harness = createHarness();
    const session = startSession(harness);

    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/set-preset',
      harness.request({ body: { sessionId: session.sessionId, preset: { targetFps: 30 } } })
    );

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: 'BENCHMARK_RENDERER_NOT_READY'
    });
  });

  test.each([
    ['initializing', { state: 'initializing', visible: true }],
    ['hidden', { state: 'ready', visible: false }],
    ['stale', { state: 'ready', visible: true, stale: true }]
  ])('returns 503 without changing preset config when its renderer is %s', (_label, options) => {
    const harness = createHarness({ targetFps: 45 });
    const sessionInfo = startSession(harness);
    const socket = harness.connect(`benchmark-preset-${_label}`);
    registerBenchmarkRenderer(socket, sessionInfo.sessionId, options);
    const session = harness.plugin.benchmarkSessions.get(sessionInfo.sessionId);
    const before = JSON.parse(JSON.stringify(session.config));
    if (options.stale) {
      Object.assign(harness.plugin.overlayTelemetry.get(socket.id), {
        statusUpdatedAt: Date.now() - 6000,
        fpsUpdatedAt: Date.now() - 6000
      });
    }
    socket.emitted = [];

    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/set-preset',
      harness.request({
        body: { sessionId: sessionInfo.sessionId, preset: { targetFps: 30 } }
      })
    );

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: 'BENCHMARK_RENDERER_NOT_READY'
    });
    expect(session.config).toEqual(before);
    expect(socket.payloads('webgpu-fireworks:config-update')).toHaveLength(0);
  });

  test('returns 503 without changing session config when targeted preset delivery fails', () => {
    const harness = createHarness({ targetFps: 45 });
    const sessionInfo = startSession(harness);
    const socket = harness.connect('benchmark');
    registerBenchmarkRenderer(socket, sessionInfo.sessionId);
    const session = harness.plugin.benchmarkSessions.get(sessionInfo.sessionId);
    const before = JSON.parse(JSON.stringify(session.config));
    socket.ackResponse = {
      accepted: false,
      benchmarkSessionId: sessionInfo.sessionId,
      reason: 'renderer-rejected-config'
    };

    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/set-preset',
      harness.request({
        body: { sessionId: sessionInfo.sessionId, preset: { targetFps: 30 } }
      })
    );

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: 'BENCHMARK_CONFIG_DELIVERY_FAILED'
    });
    expect(session.config).toEqual(before);
    expect(harness.plugin.config.targetFps).toBe(45);
    expect(harness.api.emit).not.toHaveBeenCalled();
  });

  test('times out a preset delivery that never receives a renderer acknowledgement', () => {
    jest.useFakeTimers();
    const harness = createHarness({ targetFps: 45 });
    const sessionInfo = startSession(harness);
    const socket = harness.connect('benchmark-timeout');
    registerBenchmarkRenderer(socket, sessionInfo.sessionId);
    socket.ackEnabled = false;
    harness.plugin.benchmarkDeliveryAckTimeoutMs = 25;
    const before = { ...harness.plugin.benchmarkSessions.get(sessionInfo.sessionId).config };

    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/set-preset',
      harness.request({ body: { sessionId: sessionInfo.sessionId, preset: { targetFps: 30 } } })
    );
    expect(response.body).toBeNull();
    jest.advanceTimersByTime(25);

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: 'BENCHMARK_CONFIG_DELIVERY_FAILED',
      reason: 'ack-timeout'
    });
    expect(harness.plugin.benchmarkSessions.get(sessionInfo.sessionId).config).toEqual(before);
    expect(socket.pendingAcks.size).toBe(0);
  });

  test('dispatches a benchmark trigger only to its ready session socket without live-load tracking', () => {
    jest.useFakeTimers();
    const harness = createHarness({
      audioEnabled: true,
      colorMode: 'theme',
      themeColors: ['#112233'],
      defaultShape: 'star'
    });
    const first = startSession(harness);
    const second = startSession(harness);
    const firstSocket = harness.connect('benchmark-first');
    const secondSocket = harness.connect('benchmark-second');
    registerBenchmarkRenderer(firstSocket, first.sessionId);
    registerBenchmarkRenderer(secondSocket, second.sessionId);
    firstSocket.emitted = [];
    secondSocket.emitted = [];
    harness.api.emit.mockClear();
    const timerCountBeforeTrigger = jest.getTimerCount();

    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/trigger',
      harness.request({
        body: {
          sessionId: first.sessionId,
          shape: 'heart',
          intensity: 1.5,
          giftImage: 'https://example.test/gift.png',
          userAvatar: 'https://example.test/avatar.png',
          playSound: true,
          reason: 'gift',
          trackLiveLoad: true,
          dispatchContext: {
            socket: secondSocket,
            config: { defaultShape: 'burst' },
            trackLiveLoad: true,
            playSound: true
          }
        }
      })
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      accepted: true,
      reason: 'submitted',
      sessionId: first.sessionId,
      payload: {
        shape: 'heart',
        intensity: 1.5,
        playSound: false,
        reason: 'benchmark',
        benchmarkSessionId: first.sessionId,
        benchmarkAdmissionDeadline: expect.any(Number),
        giftImage: null,
        userAvatar: null
      }
    });
    expect(firstSocket.payloads('webgpu-fireworks:trigger')).toEqual([response.body.payload]);
    expect(secondSocket.payloads('webgpu-fireworks:trigger')).toHaveLength(0);
    expect(harness.api.emit).not.toHaveBeenCalled();
    expect(harness.plugin.activeFireworkCount).toBe(0);
    expect(harness.plugin.activeFireworkTimers.size).toBe(0);
    expect(harness.plugin.queueTimestamps).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(timerCountBeforeTrigger);
    expect(response.body.payload).not.toHaveProperty('dispatchContext');
    expect(response.body.payload).not.toHaveProperty('trackLiveLoad');
    jest.useRealTimers();
  });

  test('does not let normal trigger input opt into the internal benchmark dispatch context', () => {
    jest.useFakeTimers();
    const harness = createHarness({ audioEnabled: true });
    const benchmark = startSession(harness);
    const benchmarkSocket = harness.connect('benchmark');
    registerBenchmarkRenderer(benchmarkSocket, benchmark.sessionId);
    benchmarkSocket.emitted = [];
    harness.api.emit.mockClear();

    const result = harness.plugin.triggerFirework({
      shape: 'heart',
      playSound: true,
      benchmarkSessionId: benchmark.sessionId,
      trackLiveLoad: false,
      dispatchContext: {
        socket: benchmarkSocket,
        trackLiveLoad: false,
        playSound: false
      }
    });

    expect(result).toMatchObject({ accepted: true, payload: { shape: 'heart', playSound: true } });
    expect(harness.api.emit).toHaveBeenCalledWith('webgpu-fireworks:trigger', result.payload);
    expect(benchmarkSocket.payloads('webgpu-fireworks:trigger')).toHaveLength(0);
    expect(harness.plugin.activeFireworkCount).toBe(1);
    expect(harness.plugin.activeFireworkTimers.size).toBe(1);
    expect(result.payload).not.toHaveProperty('benchmarkSessionId');
    expect(result.payload).not.toHaveProperty('trackLiveLoad');
    expect(result.payload).not.toHaveProperty('dispatchContext');
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('reports a targeted benchmark trigger as failed when its renderer rejects admission', () => {
    const harness = createHarness();
    const session = startSession(harness);
    const socket = harness.connect('benchmark-rejected-trigger');
    registerBenchmarkRenderer(socket, session.sessionId);
    socket.ackResponse = {
      accepted: false,
      benchmarkSessionId: session.sessionId,
      reason: 'renderer-not-ready'
    };

    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/trigger',
      harness.request({ body: { sessionId: session.sessionId, shape: 'burst' } })
    );

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      accepted: false,
      code: 'BENCHMARK_TRIGGER_DELIVERY_FAILED',
      reason: 'renderer-not-ready'
    });
    expect(harness.plugin.activeFireworkCount).toBe(0);
  });

  test.each([
    ['missing session id', {}, 400, 'BENCHMARK_SESSION_ID_REQUIRED'],
    ['invalid session id', { sessionId: 'invalid' }, 400, 'INVALID_BENCHMARK_SESSION_ID'],
    ['unknown session id', { sessionId: randomUUID() }, 404, 'BENCHMARK_SESSION_NOT_FOUND']
  ])('rejects benchmark trigger with %s', (_label, body, status, code) => {
    const harness = createHarness();
    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/trigger',
      harness.request({ body })
    );

    expect(response.statusCode).toBe(status);
    expect(response.body).toMatchObject({ success: false, accepted: false, code });
    expect(harness.api.emit).not.toHaveBeenCalled();
  });

  test.each([
    ['not connected', null, null],
    ['not ready', 'initializing', 60],
    ['hidden', 'ready', 60]
  ])('returns 503 when the benchmark renderer is %s', (_label, state, fps) => {
    const harness = createHarness();
    const session = startSession(harness);
    if (state) {
      const socket = harness.connect(`benchmark-${_label}`);
      registerBenchmarkRenderer(socket, session.sessionId, {
        state,
        visible: _label !== 'hidden',
        fps
      });
    }

    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/trigger',
      harness.request({ body: { sessionId: session.sessionId, shape: 'burst' } })
    );

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      accepted: false,
      code: 'BENCHMARK_RENDERER_NOT_READY'
    });
    expect(harness.api.emit).not.toHaveBeenCalled();
  });

  test('reports FPS exclusively from the requested session socket', () => {
    const harness = createHarness();
    const first = startSession(harness);
    const second = startSession(harness);
    const firstSocket = harness.connect('benchmark-first');
    const secondSocket = harness.connect('benchmark-second');
    registerBenchmarkRenderer(firstSocket, first.sessionId, { fps: 37 });
    registerBenchmarkRenderer(secondSocket, second.sessionId, { fps: 91 });

    const firstResponse = harness.callRoute(
      'get',
      '/api/webgpu-fireworks/benchmark/fps',
      harness.request({ query: { sessionId: first.sessionId } })
    );
    const secondResponse = harness.callRoute(
      'get',
      '/api/webgpu-fireworks/benchmark/fps',
      harness.request({ query: { sessionId: second.sessionId } })
    );

    expect(firstResponse.statusCode).toBe(200);
    expect(firstResponse.body).toMatchObject({
      success: true,
      sessionId: first.sessionId,
      fps: 37,
      sampleCount: 1,
      source: 'benchmark-session-overlay'
    });
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.body).toMatchObject({
      success: true,
      sessionId: second.sessionId,
      fps: 91,
      sampleCount: 1,
      source: 'benchmark-session-overlay'
    });
  });

  test.each([
    ['missing session id', {}, 400, 'BENCHMARK_SESSION_ID_REQUIRED'],
    ['invalid session id', { sessionId: 'invalid' }, 400, 'INVALID_BENCHMARK_SESSION_ID'],
    ['unknown session id', { sessionId: randomUUID() }, 404, 'BENCHMARK_SESSION_NOT_FOUND']
  ])('rejects benchmark FPS with %s', (_label, query, status, code) => {
    const harness = createHarness();
    const response = harness.callRoute(
      'get',
      '/api/webgpu-fireworks/benchmark/fps',
      harness.request({ query })
    );

    expect(response.statusCode).toBe(status);
    expect(response.body).toMatchObject({ success: false, code });
  });

  test('requires matching session markers on benchmark status and FPS messages', () => {
    const harness = createHarness();
    const session = startSession(harness);
    const socket = harness.connect('benchmark');
    socket.receive('webgpu-fireworks:register-overlay', {
      benchmark: true,
      benchmarkSessionId: session.sessionId,
      visible: true
    });
    socket.receive('webgpu-fireworks:renderer-status', {
      benchmark: true,
      benchmarkSessionId: randomUUID(),
      state: 'ready',
      visible: true
    });
    socket.receive('webgpu-fireworks:fps-update', {
      benchmark: true,
      fps: 88,
      visible: true
    });

    const response = harness.callRoute(
      'get',
      '/api/webgpu-fireworks/benchmark/fps',
      harness.request({ query: { sessionId: session.sessionId } })
    );

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: 'BENCHMARK_RENDERER_NOT_READY'
    });
    expect(harness.plugin.overlayTelemetry.get(socket.id)).toMatchObject({
      benchmarkSessionId: session.sessionId,
      fps: 0
    });
    expect(harness.plugin.overlayTelemetry.get(socket.id).state).toBeUndefined();
  });

  test('accepts fresh benchmark telemetry after a stale period without requiring reconnect', () => {
    const harness = createHarness();
    const session = startSession(harness);
    const socket = harness.connect('benchmark-resume');
    registerBenchmarkRenderer(socket, session.sessionId, { fps: 40 });
    Object.assign(harness.plugin.overlayTelemetry.get(socket.id), {
      statusUpdatedAt: Date.now() - 6000,
      fpsUpdatedAt: Date.now() - 6000
    });

    harness.plugin.getOverlayFps(false);
    socket.receive('webgpu-fireworks:renderer-status', {
      benchmark: true,
      benchmarkSessionId: session.sessionId,
      state: 'ready',
      visible: true
    });
    socket.receive('webgpu-fireworks:fps-update', {
      benchmark: true,
      benchmarkSessionId: session.sessionId,
      fps: 75,
      visible: true
    });
    const response = harness.callRoute(
      'get',
      '/api/webgpu-fireworks/benchmark/fps',
      harness.request({ query: { sessionId: session.sessionId } })
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.fps).toBe(75);
    expect(harness.plugin.benchmarkSessions.get(session.sessionId).socket).toBe(socket);
  });

  test.each([
    ['initializing', { state: 'initializing', visible: true, fps: 60 }],
    ['hidden', { state: 'ready', visible: false, fps: 60 }],
    ['stale', { state: 'ready', visible: true, fps: 60, stale: true }]
  ])('returns 503 for a %s benchmark renderer', (_label, options) => {
    const harness = createHarness();
    const session = startSession(harness);
    const socket = harness.connect(`benchmark-${_label}`);
    registerBenchmarkRenderer(socket, session.sessionId, options);
    if (options.stale) {
      Object.assign(harness.plugin.overlayTelemetry.get(socket.id), {
        statusUpdatedAt: Date.now() - 6000,
        fpsUpdatedAt: Date.now() - 6000
      });
    }

    const response = harness.callRoute(
      'get',
      '/api/webgpu-fireworks/benchmark/fps',
      harness.request({ query: { sessionId: session.sessionId } })
    );

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: 'BENCHMARK_RENDERER_NOT_READY'
    });
  });

  test('unbinds on disconnect and allows the same benchmark session to reconnect', () => {
    const harness = createHarness();
    const sessionInfo = startSession(harness);
    const firstSocket = harness.connect('benchmark-first');
    registerBenchmarkRenderer(firstSocket, sessionInfo.sessionId, { fps: 41 });
    const session = harness.plugin.benchmarkSessions.get(sessionInfo.sessionId);

    expect(session.socket).toBe(firstSocket);
    firstSocket.connected = false;
    firstSocket.receive('disconnect');
    expect(session.socket).toBeNull();
    expect(session.socketId).toBeNull();
    expect(harness.plugin.benchmarkSocketSessions.has(firstSocket.id)).toBe(false);

    const replacementSocket = harness.connect('benchmark-reconnected');
    registerBenchmarkRenderer(replacementSocket, sessionInfo.sessionId, { fps: 73 });
    const response = harness.callRoute(
      'get',
      '/api/webgpu-fireworks/benchmark/fps',
      harness.request({ query: { sessionId: sessionInfo.sessionId } })
    );

    expect(session.socket).toBe(replacementSocket);
    expect(session.socketId).toBe(replacementSocket.id);
    expect(response.statusCode).toBe(200);
    expect(response.body.fps).toBe(73);
  });

  test('does not let a second connected benchmark socket steal a bound session', () => {
    const harness = createHarness();
    const sessionInfo = startSession(harness);
    const firstSocket = harness.connect('benchmark-first');
    const secondSocket = harness.connect('benchmark-second');
    registerBenchmarkRenderer(firstSocket, sessionInfo.sessionId, { fps: 42 });
    registerBenchmarkRenderer(secondSocket, sessionInfo.sessionId, { fps: 99 });

    const response = harness.callRoute(
      'get',
      '/api/webgpu-fireworks/benchmark/fps',
      harness.request({ query: { sessionId: sessionInfo.sessionId } })
    );

    expect(harness.plugin.benchmarkSessions.get(sessionInfo.sessionId).socket).toBe(firstSocket);
    expect(harness.plugin.overlayTelemetry.get(secondSocket.id)).toMatchObject({
      registered: false,
      benchmark: true,
      benchmarkSessionId: null
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.fps).toBe(42);
  });

  test('blocks interactive triggers from benchmark and unregistered sockets', () => {
    const harness = createHarness({
      enabled: true,
      interactiveEnabled: true,
      clickTriggerEnabled: true
    });
    const session = startSession(harness);
    const unregisteredSocket = harness.connect('unregistered');
    const benchmarkSocket = harness.connect('benchmark');
    const liveSocket = harness.connect('live');
    registerBenchmarkRenderer(benchmarkSocket, session.sessionId);
    liveSocket.receive('webgpu-fireworks:register-overlay', { benchmark: false, visible: true });
    harness.plugin.triggerFirework = jest.fn(() => ({ accepted: true, reason: 'submitted' }));

    unregisteredSocket.receive('webgpu-fireworks:interactive-trigger', { position: { x: 0.1, y: 0.2 } });
    benchmarkSocket.receive('webgpu-fireworks:interactive-trigger', { position: { x: 0.3, y: 0.4 } });
    liveSocket.receive('webgpu-fireworks:interactive-trigger', { position: { x: 0.5, y: 0.6 } });

    expect(harness.plugin.triggerFirework).toHaveBeenCalledTimes(1);
    expect(harness.plugin.triggerFirework).toHaveBeenCalledWith(expect.objectContaining({
      type: 'click',
      position: { x: 0.5, y: 0.6 }
    }));
  });

  test('keeps live overlay registration after stale telemetry is excluded from FPS', () => {
    const harness = createHarness({
      enabled: true,
      interactiveEnabled: true,
      clickTriggerEnabled: true
    });
    const socket = harness.connect('live-resume');
    socket.receive('webgpu-fireworks:register-overlay', { benchmark: false, visible: true });
    harness.plugin.overlayTelemetry.get(socket.id).fpsUpdatedAt = Date.now() - 6000;
    harness.plugin.getOverlayFps(false);
    harness.plugin.triggerFirework = jest.fn(() => ({ accepted: true, reason: 'submitted' }));

    socket.receive('webgpu-fireworks:interactive-trigger', { position: { x: 0.4, y: 0.6 } });

    expect(harness.plugin.triggerFirework).toHaveBeenCalledTimes(1);
  });

  test('restores a benchmark session locally and remains idempotent on repeat', () => {
    const harness = createHarness({ targetFps: 45, audioEnabled: true });
    const sessionInfo = startSession(harness);
    const socket = harness.connect('benchmark');
    registerBenchmarkRenderer(socket, sessionInfo.sessionId);
    const session = harness.plugin.benchmarkSessions.get(sessionInfo.sessionId);
    const baseConfig = JSON.parse(JSON.stringify(session.baseConfig));
    session.config = normalizeConfig({ ...session.baseConfig, targetFps: 30, audioEnabled: false });
    socket.emitted = [];
    harness.api.emit.mockClear();

    const first = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/restore',
      harness.request({ body: { sessionId: sessionInfo.sessionId } })
    );
    const second = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/restore',
      harness.request({ body: { sessionId: sessionInfo.sessionId } })
    );

    expect(first.statusCode).toBe(200);
    expect(first.body).toEqual({
      success: true,
      sessionId: sessionInfo.sessionId,
      restored: true,
      message: 'Benchmark session restored'
    });
    expect(second.statusCode).toBe(200);
    expect(second.body).toEqual({
      success: true,
      sessionId: sessionInfo.sessionId,
      restored: false,
      message: 'Benchmark session already restored'
    });
    expect(session.restored).toBe(true);
    expect(session.config).toEqual(baseConfig);
    expect(session.socket).toBeNull();
    expect(session.socketId).toBeNull();
    expect(harness.plugin.benchmarkSocketSessions.has(socket.id)).toBe(false);
    expect(socket.payloads('webgpu-fireworks:config-update')).toEqual([{
      config: baseConfig,
      benchmarkSessionId: sessionInfo.sessionId
    }]);
    expect(harness.plugin.config.targetFps).toBe(45);
    expect(harness.plugin.config.audioEnabled).toBe(true);
    expect(harness.api.emit).not.toHaveBeenCalled();
    expect(harness.api.setConfig).not.toHaveBeenCalled();
  });

  test('keeps restore retryable when targeted base-config delivery fails', () => {
    const harness = createHarness({ targetFps: 45 });
    const sessionInfo = startSession(harness);
    const socket = harness.connect('benchmark');
    registerBenchmarkRenderer(socket, sessionInfo.sessionId);
    const session = harness.plugin.benchmarkSessions.get(sessionInfo.sessionId);
    const benchmarkConfig = normalizeConfig({ ...session.baseConfig, targetFps: 30 });
    session.config = benchmarkConfig;
    socket.ackResponse = {
      accepted: false,
      benchmarkSessionId: sessionInfo.sessionId,
      reason: 'renderer-rejected-config'
    };

    const failed = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/restore',
      harness.request({ body: { sessionId: sessionInfo.sessionId } })
    );

    expect(failed.statusCode).toBe(503);
    expect(failed.body).toMatchObject({
      success: false,
      code: 'BENCHMARK_CONFIG_DELIVERY_FAILED'
    });
    expect(session.restored).toBe(false);
    expect(session.config).toEqual(benchmarkConfig);
    expect(session.socket).toBe(socket);
    expect(harness.plugin.benchmarkSocketSessions.get(socket.id)).toBe(sessionInfo.sessionId);

    socket.ackResponse = null;
    const retried = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/restore',
      harness.request({ body: { sessionId: sessionInfo.sessionId } })
    );
    expect(retried.statusCode).toBe(200);
    expect(retried.body).toMatchObject({ success: true, restored: true });
    expect(session.restored).toBe(true);
  });

  test('serializes restore against preset, trigger, and duplicate restore deliveries', () => {
    jest.useFakeTimers();
    const harness = createHarness({ targetFps: 45 });
    const sessionInfo = startSession(harness);
    const socket = harness.connect('benchmark-restore-race');
    registerBenchmarkRenderer(socket, sessionInfo.sessionId);
    socket.emitted = [];
    socket.ackDelayMs = 50;

    const restoring = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/restore',
      harness.request({ body: { sessionId: sessionInfo.sessionId } })
    );
    expect(restoring.body).toBeNull();

    for (const [route, body] of [
      ['/api/webgpu-fireworks/benchmark/set-preset', {
        sessionId: sessionInfo.sessionId,
        preset: { targetFps: 30 }
      }],
      ['/api/webgpu-fireworks/benchmark/trigger', {
        sessionId: sessionInfo.sessionId,
        shape: 'burst'
      }],
      ['/api/webgpu-fireworks/benchmark/restore', { sessionId: sessionInfo.sessionId }]
    ]) {
      const blocked = harness.callRoute('post', route, harness.request({ body }));
      expect(blocked.statusCode).toBe(409);
      expect(blocked.body).toMatchObject({
        success: false,
        code: 'BENCHMARK_SESSION_BUSY',
        operation: 'restore'
      });
    }

    jest.advanceTimersByTime(50);
    const session = harness.plugin.benchmarkSessions.get(sessionInfo.sessionId);
    expect(restoring.statusCode).toBe(200);
    expect(session.restored).toBe(true);
    expect(session.config).toEqual(session.baseConfig);
    expect(socket.payloads('webgpu-fireworks:config-update')).toHaveLength(1);
    expect(socket.payloads('webgpu-fireworks:trigger')).toHaveLength(0);
  });

  test('does not let restore overtake an in-flight preset delivery', () => {
    jest.useFakeTimers();
    const harness = createHarness({ targetFps: 45 });
    const sessionInfo = startSession(harness);
    const socket = harness.connect('benchmark-preset-race');
    registerBenchmarkRenderer(socket, sessionInfo.sessionId);
    socket.ackDelayMs = 50;

    const preset = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/set-preset',
      harness.request({ body: {
        sessionId: sessionInfo.sessionId,
        preset: { targetFps: 30 }
      } })
    );
    expect(preset.body).toBeNull();

    const blockedRestore = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/restore',
      harness.request({ body: { sessionId: sessionInfo.sessionId } })
    );
    expect(blockedRestore.statusCode).toBe(409);
    expect(blockedRestore.body).toMatchObject({
      success: false,
      code: 'BENCHMARK_SESSION_BUSY',
      operation: 'set-preset'
    });

    jest.advanceTimersByTime(50);
    expect(preset.statusCode).toBe(200);
    expect(harness.plugin.benchmarkSessions.get(sessionInfo.sessionId).config.targetFps).toBe(30);

    socket.ackDelayMs = 0;
    const restored = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/restore',
      harness.request({ body: { sessionId: sessionInfo.sessionId } })
    );
    expect(restored.statusCode).toBe(200);
    expect(harness.plugin.benchmarkSessions.get(sessionInfo.sessionId).config.targetFps).toBe(45);
  });

  test('benchmark-only or rejected registrations never count as a live finale renderer', () => {
    const harness = createHarness();
    const session = startSession(harness);
    const benchmarkSocket = harness.connect('benchmark-only');
    registerBenchmarkRenderer(benchmarkSocket, session.sessionId);

    expect(harness.plugin.hasRegisteredRendererSocket()).toBe(false);
    const payload = { id: 'live-finale', style: 'crescendo', showPlan: { id: 'show' } };
    const dispatch = harness.plugin.dispatchFinalePayload(payload);
    expect(dispatch).toMatchObject({
      submitted: false,
      payload,
      reason: 'renderer-not-ready',
      code: 'RENDERER_NOT_READY'
    });
    expect(harness.api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', payload);

    const rejectedSocket = harness.connect('rejected-benchmark');
    rejectedSocket.receive('webgpu-fireworks:register-overlay', {
      benchmark: true,
      benchmarkSessionId: randomUUID(),
      visible: true
    });
    expect(harness.plugin.overlayTelemetry.get(rejectedSocket.id)).toMatchObject({
      registered: false,
      benchmark: true
    });
    expect(harness.plugin.hasRegisteredRendererSocket()).toBe(false);
  });

  test.each([
    ['missing session id', {}, 400, 'BENCHMARK_SESSION_ID_REQUIRED'],
    ['invalid session id', { sessionId: 'invalid' }, 400, 'INVALID_BENCHMARK_SESSION_ID'],
    ['unknown session id', { sessionId: randomUUID() }, 404, 'BENCHMARK_SESSION_NOT_FOUND']
  ])('rejects benchmark restore with %s', (_label, body, status, code) => {
    const harness = createHarness();
    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/restore',
      harness.request({ body })
    );

    expect(response.statusCode).toBe(status);
    expect(response.body).toMatchObject({ success: false, code });
  });

  test('treats a restored session as inactive on other benchmark routes', () => {
    const harness = createHarness();
    const session = startSession(harness);
    harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/restore',
      harness.request({ body: { sessionId: session.sessionId } })
    );

    const response = harness.callRoute(
      'post',
      '/api/webgpu-fireworks/benchmark/set-preset',
      harness.request({ body: { sessionId: session.sessionId, preset: { targetFps: 30 } } })
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      code: 'BENCHMARK_SESSION_NOT_FOUND'
    });
  });

  test('expires abandoned benchmark sessions through the TTL cleanup timer', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
    const harness = createHarness();
    const sessionInfo = startSession(harness);
    const session = harness.plugin.benchmarkSessions.get(sessionInfo.sessionId);

    expect(harness.plugin.benchmarkSessionCleanupTimer).not.toBeNull();
    expect(session.expiresAt).toBe(Date.now() + harness.plugin.benchmarkSessionTtlMs);
    jest.advanceTimersByTime(harness.plugin.benchmarkSessionTtlMs - 1);
    expect(harness.plugin.benchmarkSessions.has(sessionInfo.sessionId)).toBe(true);
    jest.advanceTimersByTime(harness.plugin.benchmarkSessionCleanupIntervalMs + 1);
    expect(harness.plugin.benchmarkSessions.has(sessionInfo.sessionId)).toBe(false);
    expect(harness.plugin.benchmarkSessionCleanupTimer).toBeNull();
  });

  test('refreshes the idle TTL when a benchmark renderer binds to an active session', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
    const harness = createHarness();
    const sessionInfo = startSession(harness);
    const session = harness.plugin.benchmarkSessions.get(sessionInfo.sessionId);
    const originalExpiry = session.expiresAt;
    jest.advanceTimersByTime(harness.plugin.benchmarkSessionTtlMs - 1000);

    const socket = harness.connect('benchmark-active');
    socket.receive('webgpu-fireworks:register-overlay', {
      benchmark: true,
      benchmarkSessionId: sessionInfo.sessionId,
      visible: true
    });

    expect(session.expiresAt).toBe(Date.now() + harness.plugin.benchmarkSessionTtlMs);
    expect(session.expiresAt).toBeGreaterThan(originalExpiry);
    jest.advanceTimersByTime(2000);
    expect(harness.plugin.benchmarkSessions.has(sessionInfo.sessionId)).toBe(true);
    jest.advanceTimersByTime(
      harness.plugin.benchmarkSessionTtlMs + harness.plugin.benchmarkSessionCleanupIntervalMs
    );
    expect(harness.plugin.benchmarkSessions.has(sessionInfo.sessionId)).toBe(false);
  });

  test('rejects an expired session before the next periodic cleanup tick', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
    const harness = createHarness();
    harness.plugin.benchmarkSessionCleanupIntervalMs = harness.plugin.benchmarkSessionTtlMs * 2;
    const sessionInfo = startSession(harness);
    jest.advanceTimersByTime(harness.plugin.benchmarkSessionTtlMs + 1);

    const response = harness.callRoute(
      'get',
      '/api/webgpu-fireworks/benchmark/fps',
      harness.request({ query: { sessionId: sessionInfo.sessionId } })
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      code: 'BENCHMARK_SESSION_NOT_FOUND'
    });
    expect(harness.plugin.benchmarkSessions.has(sessionInfo.sessionId)).toBe(false);
    expect(harness.plugin.benchmarkSessionCleanupTimer).toBeNull();
  });

  test('does not revive an expired session from late socket telemetry', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
    const harness = createHarness();
    harness.plugin.benchmarkSessionCleanupIntervalMs = harness.plugin.benchmarkSessionTtlMs * 2;
    const sessionInfo = startSession(harness);
    const socket = harness.connect('benchmark-late');
    registerBenchmarkRenderer(socket, sessionInfo.sessionId, { fps: 40 });
    jest.advanceTimersByTime(harness.plugin.benchmarkSessionTtlMs + 1);

    socket.receive('webgpu-fireworks:renderer-status', {
      benchmark: true,
      benchmarkSessionId: sessionInfo.sessionId,
      state: 'ready',
      visible: true
    });
    socket.receive('webgpu-fireworks:fps-update', {
      benchmark: true,
      benchmarkSessionId: sessionInfo.sessionId,
      fps: 90,
      visible: true
    });

    expect(harness.plugin.benchmarkSessions.has(sessionInfo.sessionId)).toBe(false);
    expect(harness.plugin.benchmarkSocketSessions.has(socket.id)).toBe(false);
  });

  test('destroy clears the benchmark cleanup timer, sessions and socket bindings', async () => {
    jest.useFakeTimers();
    const harness = createHarness();
    const sessionInfo = startSession(harness);
    const socket = harness.connect('benchmark');
    registerBenchmarkRenderer(socket, sessionInfo.sessionId);

    await harness.plugin.destroy();

    expect(harness.plugin.benchmarkSessionCleanupTimer).toBeNull();
    expect(harness.plugin.benchmarkSessions.size).toBe(0);
    expect(harness.plugin.benchmarkSocketSessions.size).toBe(0);
  });
});
