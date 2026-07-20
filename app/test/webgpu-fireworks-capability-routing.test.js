'use strict';

const path = require('path');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');

class FakeSocket {
  constructor(id) {
    this.id = id;
    this.connected = true;
    this.handlers = new Map();
    this.emitted = [];
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  emit(event, payload) {
    this.emitted.push([event, payload]);
    return true;
  }

  receive(event, payload) {
    this.handlers.get(event)?.(payload);
  }

  finalePayloads() {
    return this.emitted
      .filter(([event]) => event === 'webgpu-fireworks:finale')
      .map(([, payload]) => payload);
  }
}

function createHarness() {
  const connections = [];
  const api = {
    getPluginDataDir: () => path.join(__dirname, '.tmp-webgpu-fireworks-capability-routing'),
    emit: jest.fn(() => true),
    log: jest.fn(),
    registerSocketConnection: jest.fn(handler => connections.push(handler))
  };
  const plugin = new FireworksPlugin(api);
  plugin.config = normalizeConfig({ enabled: true, audioEnabled: false });
  plugin.registerSocketHandlers();

  const connect = ({
    id,
    current,
    updatedAt = Date.now(),
    benchmark = false,
    visible = true,
    state = 'ready',
    connected = true,
    registered = true
  }) => {
    const socket = new FakeSocket(id);
    connections[0](socket);
    if (registered) {
      socket.receive('webgpu-fireworks:register-overlay', {
        benchmark,
        visible,
        rendererProtocol: current ? 3 : 2,
        capabilities: current ? ['depth3d-v1', 'boykisser-v1'] : []
      });
    }
    socket.receive('webgpu-fireworks:renderer-status', { state });
    const telemetry = plugin.overlayTelemetry.get(id);
    if (telemetry) telemetry.statusUpdatedAt = updatedAt;
    socket.connected = connected;
    return socket;
  };

  return { api, connect, plugin };
}

describe('WebGPU Fireworks capability-aware finale routing', () => {
  test.each([
    ['old renderer has newest telemetry', 100, 200],
    ['current renderer has newest telemetry', 200, 100]
  ])('accepts a Furry test when any ready renderer is capable: %s', (_label, oldOffset, newOffset) => {
    const now = Date.now();
    const { api, connect, plugin } = createHarness();
    const oldRenderer = connect({ id: 'old', current: false, updatedAt: now - oldOffset });
    const currentRenderer = connect({ id: 'current', current: true, updatedAt: now - newOffset });

    const result = plugin.triggerFinale({
      style: 'furry-celebration', length: 'short', seed: 701, eventId: 'test-mixed', testRequest: true
    });

    expect(result).toMatchObject({ accepted: true, style: 'furry-celebration' });
    expect(result.showPlan).toMatchObject({ planVersion: 2, style: 'furry-celebration' });
    expect(currentRenderer.finalePayloads()).toHaveLength(1);
    expect(currentRenderer.finalePayloads()[0].showPlan).toMatchObject({ planVersion: 2 });
    expect(oldRenderer.finalePayloads()).toHaveLength(0);
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
  });

  test.each([
    ['old renderer has newest telemetry', 100, 200],
    ['current renderer has newest telemetry', 200, 100]
  ])('routes one normal Furry event exactly once per renderer: %s', (_label, oldOffset, newOffset) => {
    const now = Date.now();
    const { api, connect, plugin } = createHarness();
    const oldRenderer = connect({ id: 'old', current: false, updatedAt: now - oldOffset });
    const currentRenderer = connect({ id: 'current', current: true, updatedAt: now - newOffset });

    const result = plugin.triggerFinale({
      style: 'furry-celebration', length: 'short', seed: 702, eventId: 'normal-mixed'
    });

    expect(result).toMatchObject({ accepted: true, id: 'normal-mixed' });
    expect(currentRenderer.finalePayloads()).toHaveLength(1);
    expect(currentRenderer.finalePayloads()[0]).toMatchObject({
      id: 'normal-mixed', showPlan: { planVersion: 2, style: 'furry-celebration' }
    });
    expect(oldRenderer.finalePayloads()).toHaveLength(1);
    expect(oldRenderer.finalePayloads()[0]).toMatchObject({
      id: 'normal-mixed', showPlan: null, rendererFallback: 'legacy-outdated-overlay', burstCount: 15
    });
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
  });

  test('delivers non-Furry shows unchanged once to every registered overlay', () => {
    const now = Date.now();
    const { api, connect, plugin } = createHarness();
    const oldRenderer = connect({ id: 'old', current: false, updatedAt: now - 10 });
    const currentRenderer = connect({ id: 'current', current: true, updatedAt: now - 20 });

    const result = plugin.triggerFinale({
      style: 'classic-crescendo', length: 'short', seed: 703, eventId: 'classic-mixed'
    });

    expect(result.showPlan).toMatchObject({ style: 'classic-crescendo' });
    for (const renderer of [oldRenderer, currentRenderer]) {
      expect(renderer.finalePayloads()).toHaveLength(1);
      expect(renderer.finalePayloads()[0]).toEqual(result);
      expect(renderer.finalePayloads()[0]).not.toHaveProperty('rendererFallback');
    }
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
  });

  test.each([
    ['old', false, null, 'legacy-outdated-overlay'],
    ['current', true, 2, null]
  ])('preserves one-renderer normal Furry behavior for %s overlays', (_label, current, planVersion, fallback) => {
    const { api, connect, plugin } = createHarness();
    const renderer = connect({ id: _label, current, updatedAt: Date.now() });

    const result = plugin.triggerFinale({
      style: 'furry-celebration', length: 'short', seed: 704, eventId: `single-${_label}`
    });

    expect(renderer.finalePayloads()).toHaveLength(1);
    expect(renderer.finalePayloads()[0].showPlan?.planVersion ?? null).toBe(planVersion);
    expect(renderer.finalePayloads()[0].rendererFallback ?? null).toBe(fallback);
    expect(result).toEqual(renderer.finalePayloads()[0]);
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
  });

  test('routes a normal finale only to connected fresh visible ready non-benchmark overlays', () => {
    const now = Date.now();
    const { api, connect, plugin } = createHarness();
    const currentRenderer = connect({ id: 'current-ready', current: true, updatedAt: now - 100 });
    const oldRenderer = connect({ id: 'old-ready', current: false, updatedAt: now - 200 });
    const ineligibleRenderers = [
      connect({ id: 'stale', current: true, updatedAt: now - 6000 }),
      connect({ id: 'initializing', current: true, state: 'initializing', updatedAt: now - 100 }),
      connect({ id: 'error', current: true, state: 'error', updatedAt: now - 100 }),
      connect({ id: 'hidden', current: true, visible: false, updatedAt: now - 100 }),
      connect({ id: 'benchmark', current: true, benchmark: true, updatedAt: now - 100 }),
      connect({ id: 'disconnected', current: true, connected: false, updatedAt: now - 100 })
    ];

    const result = plugin.triggerFinale({
      style: 'furry-celebration', length: 'short', seed: 707, eventId: 'eligible-only'
    });

    expect(result).toMatchObject({ accepted: true, id: 'eligible-only' });
    expect(currentRenderer.finalePayloads()).toHaveLength(1);
    expect(currentRenderer.finalePayloads()[0].showPlan).toMatchObject({ planVersion: 2 });
    expect(oldRenderer.finalePayloads()).toHaveLength(1);
    expect(oldRenderer.finalePayloads()[0]).toMatchObject({
      showPlan: null,
      rendererFallback: 'legacy-outdated-overlay'
    });
    for (const renderer of ineligibleRenderers) {
      expect(renderer.finalePayloads()).toHaveLength(0);
    }
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
  });

  test('rejects a normal finale without global broadcast when registered overlays are all ineligible', () => {
    const now = Date.now();
    const { api, connect, plugin } = createHarness();
    const ineligibleRenderers = [
      connect({ id: 'stale', current: true, updatedAt: now - 6000 }),
      connect({ id: 'initializing', current: true, state: 'initializing', updatedAt: now - 100 }),
      connect({ id: 'hidden', current: true, visible: false, updatedAt: now - 100 })
    ];

    const result = plugin.triggerFinale({
      style: 'classic-crescendo', length: 'short', seed: 708, eventId: 'none-eligible'
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: 'renderer-not-ready',
      code: 'RENDERER_NOT_READY'
    });
    for (const renderer of ineligibleRenderers) {
      expect(renderer.finalePayloads()).toHaveLength(0);
    }
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
  });

  test('ignores ready telemetry from an unregistered connected socket and never delivers to it', () => {
    const { api, connect, plugin } = createHarness();
    const socket = connect({
      id: 'unregistered',
      current: true,
      registered: false,
      state: 'ready'
    });

    const result = plugin.triggerFinale({
      style: 'classic-crescendo',
      length: 'short',
      seed: 712,
      eventId: 'unregistered-live'
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: 'renderer-not-ready',
      code: 'RENDERER_NOT_READY'
    });
    expect(plugin.overlayTelemetry.has(socket.id)).toBe(false);
    expect(socket.finalePayloads()).toHaveLength(0);
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
  });

  test('FPS updates cannot keep renderer readiness fresh', () => {
    const now = 50_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const { connect, plugin } = createHarness();
    const socket = connect({ id: 'status-stale', current: true, updatedAt: now - 5001 });
    const telemetry = plugin.overlayTelemetry.get(socket.id);
    telemetry.statusUpdatedAt = now - 5001;

    socket.receive('webgpu-fireworks:fps-update', { fps: 60, visible: true });

    expect(plugin.getOverlayFps(false)).toEqual({ fps: 60, sampleCount: 1 });
    expect(plugin.getFinaleRendererTargets()).toHaveLength(0);
    expect(plugin.getRendererStatus()).toMatchObject({ state: 'offline' });
    jest.restoreAllMocks();
  });

  test('renderer status updates cannot keep an FPS sample fresh', () => {
    const now = 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const { connect, plugin } = createHarness();
    const socket = connect({ id: 'fps-stale', current: true, updatedAt: now - 5001 });
    const telemetry = plugin.overlayTelemetry.get(socket.id);
    telemetry.fps = 48;
    telemetry.fpsUpdatedAt = now - 5001;

    socket.receive('webgpu-fireworks:renderer-status', { state: 'ready', visible: true });

    expect(plugin.getRendererStatus()).toMatchObject({ state: 'ready' });
    expect(plugin.getOverlayFps(false)).toEqual({ fps: 0, sampleCount: 0 });
    jest.restoreAllMocks();
  });

  test('treats a fresh hidden renderer as unavailable for finale test requests', () => {
    const { api, connect, plugin } = createHarness();
    const hiddenRenderer = connect({ id: 'hidden', current: true, visible: false });

    const result = plugin.triggerFinale({
      style: 'furry-celebration', length: 'short', seed: 709, eventId: 'hidden-test', testRequest: true
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: 'renderer-not-ready',
      code: 'RENDERER_NOT_READY'
    });
    expect(hiddenRenderer.finalePayloads()).toHaveLength(0);
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
  });

  test('treats a fresh disconnected renderer as unavailable for Furry test requests', () => {
    const { api, connect, plugin } = createHarness();
    const disconnectedRenderer = connect({ id: 'disconnected', current: true, connected: false });

    const result = plugin.triggerFinale({
      style: 'furry-celebration', length: 'short', seed: 710, eventId: 'disconnected-test', testRequest: true
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: 'renderer-not-ready',
      code: 'RENDERER_NOT_READY'
    });
    expect(disconnectedRenderer.finalePayloads()).toHaveLength(0);
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
  });

  test('never globally emits a test request for fresh telemetry without a registered socket', () => {
    const { api, plugin } = createHarness();
    plugin.overlayTelemetry.set('unregistered-current', {
      registered: true,
      benchmark: false,
      visible: true,
      rendererProtocol: 3,
      capabilities: ['depth3d-v1', 'boykisser-v1'],
      state: 'ready',
      statusUpdatedAt: Date.now()
    });

    const result = plugin.triggerFinale({
      style: 'furry-celebration', length: 'short', seed: 711, eventId: 'unregistered-test', testRequest: true
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: 'renderer-not-ready',
      code: 'RENDERER_NOT_READY'
    });
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
  });

  test('keeps offline global dispatch and test rejection semantics', () => {
    const { api, plugin } = createHarness();

    const normal = plugin.triggerFinale({
      style: 'furry-celebration', length: 'short', seed: 705, eventId: 'offline-normal'
    });
    const test = plugin.triggerFinale({
      style: 'furry-celebration', length: 'short', seed: 706, eventId: 'offline-test', testRequest: true
    });

    expect(normal.showPlan).toMatchObject({ planVersion: 2 });
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:finale', normal);
    expect(test).toMatchObject({ accepted: false, code: 'RENDERER_NOT_READY' });
  });
});
