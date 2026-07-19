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

  const connect = ({ id, current, updatedAt }) => {
    const socket = new FakeSocket(id);
    connections[0](socket);
    socket.receive('webgpu-fireworks:register-overlay', {
      benchmark: false,
      visible: true,
      rendererProtocol: current ? 3 : 2,
      capabilities: current ? ['depth3d-v1', 'boykisser-v1'] : []
    });
    socket.receive('webgpu-fireworks:renderer-status', { state: 'ready' });
    plugin.overlayTelemetry.get(id).updatedAt = updatedAt;
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
