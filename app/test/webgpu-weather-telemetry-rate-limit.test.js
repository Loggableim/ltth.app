const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pluginPath = path.join(__dirname, '../plugins/webgpu-weather-control/main');
const overlayPath = path.join(__dirname, '../plugins/webgpu-weather-control/overlay.html');

function getOverlayScript() {
  const html = fs.readFileSync(overlayPath, 'utf8');
  const start = html.lastIndexOf('<script>');
  const end = html.indexOf('</script>', start);
  return html.slice(start + '<script>'.length, end);
}

function bootOverlay(getMetrics) {
  let now = 0;
  const elements = new Map();
  const makeElement = () => ({
    hidden: true,
    textContent: '',
    classList: { add: jest.fn(), remove: jest.fn() }
  });
  const document = {
    querySelector: jest.fn((selector) => {
      if (!elements.has(selector)) elements.set(selector, makeElement());
      return elements.get(selector);
    })
  };
  const socketHandlers = new Map();
  const socket = {
    on: jest.fn((event, handler) => socketHandlers.set(event, handler)),
    emit: jest.fn()
  };
  const engine = {
    init: jest.fn().mockResolvedValue(false),
    applyConfig: jest.fn(),
    getMetrics: jest.fn(getMetrics),
    render: jest.fn(),
    resize: jest.fn(),
    stop: jest.fn(),
    trigger: jest.fn()
  };

  function CinematicWeatherEngine() {
    return engine;
  }

  const context = {
    CinematicWeatherEngine,
    URLSearchParams,
    addEventListener: jest.fn(),
    clearTimeout,
    console,
    document,
    fetch: jest.fn(),
    innerHeight: 1080,
    innerWidth: 1920,
    io: jest.fn(() => socket),
    location: { search: '' },
    performance: { now: () => now },
    requestAnimationFrame: (callback) => setTimeout(() => {
      now += 16;
      callback(now);
    }, 16),
    setTimeout
  };

  vm.runInNewContext(getOverlayScript(), context, { filename: overlayPath });
  return { engine, socket, socketHandlers };
}

function createSocket(handshake) {
  const handlers = new Map();
  return {
    handshake,
    on: jest.fn((event, handler) => handlers.set(event, handler)),
    off: jest.fn((event) => handlers.delete(event)),
    emit: jest.fn(),
    trigger(event, payload) {
      return handlers.get(event)?.(payload);
    }
  };
}

describe('WebGPU Weather overlay telemetry boundaries', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.resetModules();
  });

  test('throttles changing client metrics to at most two updates per second across overlays', () => {
    jest.useFakeTimers();
    let revision = 0;
    const overlays = Array.from({ length: 3 }, () => bootOverlay(() => ({
      state: 'ready',
      fps: 60 + revision++,
      gpuFrameMs: 4,
      activeParticles: 100,
      quality: 'high',
      resolution: { width: 1920, height: 1080 }
    })));

    jest.advanceTimersByTime(2500);

    const updateCounts = overlays.map(({ socket }) => socket.emit.mock.calls
      .filter(([event]) => event === 'webgpu-weather:overlay-state').length);
    expect(updateCounts.every((count) => count >= 3 && count <= 6)).toBe(true);
    expect(updateCounts.reduce((total, count) => total + count, 0)).toBeLessThanOrEqual(18);
  });

  test('deduplicates unchanged client metrics while the render loop remains active', () => {
    jest.useFakeTimers();
    const metrics = {
      state: 'ready',
      fps: 60,
      gpuFrameMs: 4,
      activeParticles: 100,
      quality: 'high',
      resolution: { width: 1920, height: 1080 }
    };
    const { engine, socket } = bootOverlay(() => metrics);

    jest.advanceTimersByTime(3000);

    expect(engine.render.mock.calls.length).toBeGreaterThan(150);
    expect(engine.getMetrics.mock.calls.length).toBeLessThanOrEqual(7);
    expect(socket.emit.mock.calls.filter(([event]) => event === 'webgpu-weather:overlay-state')).toHaveLength(1);
  });

  test('keeps a plugin-wide publish budget across overlay sockets and sends only to an authorized admin subscriber', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-22T12:00:00.000Z'));
    let connectionHandler;
    const io = {
      on: jest.fn((event, handler) => {
        if (event === 'connection') connectionHandler = handler;
      }),
      off: jest.fn()
    };
    const api = {
      emit: jest.fn(),
      getSocketIO: jest.fn(() => io),
      log: jest.fn()
    };
    const { WebgpuWeatherControlPlugin } = require(pluginPath);
    const plugin = new WebgpuWeatherControlPlugin(api);
    plugin.config = { enabled: false, effects: {} };
    const snapshotSpy = jest.spyOn(plugin, 'getGamificationSnapshot');
    plugin.registerSocketSync();

    const admin = createSocket({
      address: '127.0.0.1',
      auth: { role: 'admin' },
      headers: { referer: 'http://localhost:3000/webgpu-weather-control/ui' }
    });
    const unauthorizedAdmin = createSocket({
      address: '203.0.113.10',
      auth: { role: 'admin' },
      headers: { referer: 'http://localhost:3000/webgpu-weather-control/ui' }
    });
    const overlayA = createSocket({
      address: '127.0.0.1',
      auth: { role: 'overlay' },
      headers: { referer: 'http://localhost:3000/webgpu-weather-control/overlay' }
    });
    const overlayB = createSocket({
      address: '127.0.0.1',
      auth: { role: 'overlay' },
      headers: { referer: 'http://localhost:3000/webgpu-weather-control/overlay' }
    });
    [admin, unauthorizedAdmin, overlayA, overlayB].forEach(connectionHandler);
    admin.trigger('webgpu-weather:subscribe-diagnostics');
    unauthorizedAdmin.trigger('webgpu-weather:subscribe-diagnostics');
    snapshotSpy.mockClear();

    for (let elapsed = 0; elapsed < 2000; elapsed += 100) {
      for (let burst = 0; burst < 20; burst += 1) {
        const payload = {
          state: 'ready',
          fps: elapsed + burst,
          gpuFrameMs: 4,
          activeParticles: elapsed + burst,
          quality: 'high',
          resolution: { width: 1920, height: 1080 }
        };
        overlayA.trigger('webgpu-weather:overlay-state', payload);
        overlayB.trigger('webgpu-weather:overlay-state', payload);
      }
      jest.advanceTimersByTime(100);
    }

    const diagnostics = admin.emit.mock.calls.filter(([event]) => event === 'webgpu-weather:diagnostics');
    const activeStates = admin.emit.mock.calls.filter(([event]) => event === 'webgpu-weather:active-state');
    expect(snapshotSpy).toHaveBeenCalledTimes(4);
    expect(diagnostics).toHaveLength(4);
    expect(activeStates).toHaveLength(4);
    expect(unauthorizedAdmin.emit.mock.calls.some(([event]) => event === 'webgpu-weather:diagnostics')).toBe(false);
    expect(api.emit.mock.calls.some(([event]) => (
      event === 'webgpu-weather:diagnostics' || event === 'webgpu-weather:active-state'
    ))).toBe(false);
  });

  test('initializes and resets the plugin-wide telemetry publication state', async () => {
    const { WebgpuWeatherControlPlugin } = require(pluginPath);
    const plugin = new WebgpuWeatherControlPlugin({
      emit: jest.fn(),
      getSocketIO: jest.fn(() => null),
      log: jest.fn()
    });

    expect(plugin.lastOverlayTelemetryPublishedAt).toBe(Number.NEGATIVE_INFINITY);
    expect(plugin.lastOverlayTelemetrySignature).toBeNull();
    expect(plugin.lastOverlayTelemetryPayload).toBeNull();

    plugin.lastOverlayTelemetryPublishedAt = Date.now();
    plugin.lastOverlayTelemetrySignature = 'published-state';
    plugin.lastOverlayTelemetryPayload = { diagnostics: {}, activeState: {} };
    await plugin.destroy();

    expect(plugin.lastOverlayTelemetryPublishedAt).toBe(Number.NEGATIVE_INFINITY);
    expect(plugin.lastOverlayTelemetrySignature).toBeNull();
    expect(plugin.lastOverlayTelemetryPayload).toBeNull();
  });

  test('replays one cached stable state to an admin that subscribes after the overlay published', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-22T12:00:00.000Z'));
    let connectionHandler;
    const io = {
      on: jest.fn((event, handler) => {
        if (event === 'connection') connectionHandler = handler;
      }),
      off: jest.fn()
    };
    const api = {
      emit: jest.fn(),
      getSocketIO: jest.fn(() => io),
      log: jest.fn()
    };
    const { WebgpuWeatherControlPlugin } = require(pluginPath);
    const plugin = new WebgpuWeatherControlPlugin(api);
    plugin.config = { enabled: false, effects: {} };
    const snapshotSpy = jest.spyOn(plugin, 'getGamificationSnapshot');
    plugin.registerSocketSync();

    const overlay = createSocket({
      address: '127.0.0.1',
      auth: { role: 'overlay' },
      headers: { referer: 'http://localhost:3000/webgpu-weather-control/overlay' }
    });
    connectionHandler(overlay);
    overlay.trigger('webgpu-weather:overlay-state', {
      state: 'device-lost',
      fps: 0,
      gpuFrameMs: 0,
      activeParticles: 0,
      quality: 'auto',
      resolution: { width: 1920, height: 1080 }
    });
    const publishedAt = plugin.lastOverlayTelemetryPublishedAt;
    const signature = plugin.lastOverlayTelemetrySignature;

    const lateAdmin = createSocket({
      address: '127.0.0.1',
      auth: { role: 'admin' },
      headers: { referer: 'http://localhost:3000/webgpu-weather-control/ui' }
    });
    connectionHandler(lateAdmin);
    lateAdmin.emit.mockClear();
    snapshotSpy.mockClear();

    lateAdmin.trigger('webgpu-weather:subscribe-diagnostics');
    lateAdmin.trigger('webgpu-weather:subscribe-diagnostics');

    expect(lateAdmin.emit.mock.calls.filter(([event]) => event === 'webgpu-weather:diagnostics')).toHaveLength(1);
    expect(lateAdmin.emit.mock.calls.filter(([event]) => event === 'webgpu-weather:active-state')).toHaveLength(1);
    expect(lateAdmin.emit).toHaveBeenCalledWith('webgpu-weather:diagnostics', expect.objectContaining({ state: 'device-lost' }));
    expect(snapshotSpy).not.toHaveBeenCalled();
    expect(plugin.lastOverlayTelemetryPublishedAt).toBe(publishedAt);
    expect(plugin.lastOverlayTelemetrySignature).toBe(signature);
  });
});
