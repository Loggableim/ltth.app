'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');
const { RevisionedShowRepository } = require('../plugins/webgpu-fireworks/lib/show-repository');

const PREVIEW_ROUTE = '/api/webgpu-fireworks/shows/:id/preview';

class FakeSocket {
  constructor(id) {
    this.id = id;
    this.connected = true;
    this.handlers = new Map();
    this.emitted = [];
    this.onPreview = null;
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
  }

  emit(event, payload) {
    this.emitted.push([event, payload]);
    if (event === 'webgpu-fireworks:preview') this.onPreview?.(payload);
    return true;
  }

  receive(event, payload) {
    for (const handler of this.handlers.get(event) || []) handler(payload);
  }

  removeAllListeners(event) {
    if (event) this.handlers.delete(event);
    else this.handlers.clear();
  }

  disconnect() {
    this.connected = false;
    this.receive('disconnect');
  }
}

function createApi(dataDir) {
  const routes = [];
  const connectionHandlers = [];
  return {
    routes,
    connectionHandlers,
    getPluginDataDir: () => dataDir,
    ensurePluginDataDir: jest.fn(() => fs.mkdirSync(dataDir, { recursive: true })),
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(),
    getDatabase: jest.fn(() => null),
    emit: jest.fn(() => true),
    log: jest.fn(),
    registerMiddleware: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => routes.push({ method, route, handler })),
    registerTikTokEvent: jest.fn(),
    registerSocketConnection: jest.fn(handler => connectionHandlers.push(handler))
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function createHarness() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-preview-ack-'));
  const api = createApi(dataDir);
  const plugin = new FireworksPlugin(api);
  plugin.config = normalizeConfig({ audioEnabled: false, goalFinaleIntensity: 4 });
  plugin.previewAckTimeoutMs = 25;
  plugin.showRepository = new RevisionedShowRepository({ dataDir });
  plugin.showRepository.load();
  plugin.showRepositoryLoadError = null;
  plugin.registerSocketHandlers();
  plugin.registerRoutes();

  const connect = (id, telemetry = {}) => {
    const socket = new FakeSocket(id);
    api.connectionHandlers[0](socket);
    socket.receive('webgpu-fireworks:register-overlay', {
      benchmark: telemetry.benchmark === true,
      visible: true
    });
    socket.receive('webgpu-fireworks:renderer-status', {
      state: telemetry.state || 'ready',
      finaleActive: telemetry.finaleActive === true,
      finaleQueueLength: telemetry.finaleQueueLength || 0,
      benchmark: telemetry.benchmark === true
    });
    if (telemetry.updatedAt) plugin.overlayTelemetry.get(id).statusUpdatedAt = telemetry.updatedAt;
    return socket;
  };

  const invoke = async (body = {}, id = 'classic-crescendo') => {
    const route = api.routes.find(candidate => candidate.method === 'post' && candidate.route === PREVIEW_ROUTE);
    const res = response();
    await route.handler({
      params: { id },
      body: { scope: 'cue', cueIndex: 0, variant: 'short', seed: 123, ...body }
    }, res);
    return res;
  };

  return { api, connect, dataDir, invoke, plugin };
}

describe('WebGPU preview acknowledgement routing', () => {
  const dataDirs = [];

  afterEach(() => {
    jest.useRealTimers();
    for (const dataDir of dataDirs.splice(0)) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('targets the freshest ready renderer and returns only after its correlated reservation ACK', async () => {
    const harness = createHarness();
    dataDirs.push(harness.dataDir);
    const older = harness.connect('renderer-old');
    harness.plugin.overlayTelemetry.get(older.id).statusUpdatedAt -= 10;
    const target = harness.connect('renderer-target');
    target.onPreview = payload => queueMicrotask(() => target.receive('webgpu-fireworks:preview-ack', {
      requestId: payload.requestId,
      rendererId: target.id,
      accepted: true
    }));

    const res = await harness.invoke();
    const preview = target.emitted.find(([event]) => event === 'webgpu-fireworks:preview')?.[1];

    expect(res).toMatchObject({
      statusCode: 200,
      body: { success: true, requestId: preview.requestId, rendererId: target.id }
    });
    expect(preview).toMatchObject({ requestId: expect.any(String), rendererId: target.id });
    expect(preview).not.toHaveProperty('accepted');
    expect(older.emitted.some(([event]) => event === 'webgpu-fireworks:preview')).toBe(false);
    expect(harness.api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:preview', expect.anything());
    expect(harness.plugin.pendingPreviewRequests.size).toBe(0);
  });

  test('preserves an atomic renderer busy rejection as a typed HTTP 409', async () => {
    const harness = createHarness();
    dataDirs.push(harness.dataDir);
    const target = harness.connect('renderer-race');
    target.onPreview = payload => target.receive('webgpu-fireworks:preview-ack', {
      requestId: payload.requestId,
      rendererId: target.id,
      accepted: false,
      reason: 'FINALE_BUSY'
    });

    const res = await harness.invoke();

    expect(res).toMatchObject({ statusCode: 409, body: { success: false, code: 'FINALE_BUSY' } });
    expect(harness.plugin.pendingPreviewRequests.size).toBe(0);
  });

  test('settles a correlated renderer-not-ready rejection after telemetry leaves ready', async () => {
    const harness = createHarness();
    dataDirs.push(harness.dataDir);
    const target = harness.connect('renderer-transitioning');
    target.onPreview = payload => {
      target.receive('webgpu-fireworks:renderer-status', {
        state: 'initializing',
        finaleActive: false,
        finaleQueueLength: 0,
        benchmark: false
      });
      target.receive('webgpu-fireworks:preview-ack', {
        requestId: payload.requestId,
        rendererId: target.id,
        accepted: false,
        reason: 'RENDERER_NOT_READY'
      });
    };

    const res = await harness.invoke();

    expect(res).toMatchObject({
      statusCode: 503,
      body: { success: false, code: 'RENDERER_NOT_READY' }
    });
    expect(harness.plugin.pendingPreviewRequests.size).toBe(0);
  });

  test('maps a correlated invalid-preview renderer rejection to a typed HTTP 422', async () => {
    const harness = createHarness();
    dataDirs.push(harness.dataDir);
    const target = harness.connect('renderer-invalid');
    target.onPreview = payload => target.receive('webgpu-fireworks:preview-ack', {
      requestId: payload.requestId,
      rendererId: target.id,
      accepted: false,
      reason: 'INVALID_PREVIEW'
    });

    const res = await harness.invoke();

    expect(res).toMatchObject({ statusCode: 422, body: { success: false, code: 'INVALID_PREVIEW' } });
    expect(harness.plugin.pendingPreviewRequests.size).toBe(0);
  });

  test('rejects a Furry preview on an outdated renderer with actionable refresh guidance', async () => {
    const harness = createHarness();
    dataDirs.push(harness.dataDir);
    const target = harness.connect('renderer-outdated');

    const res = await harness.invoke({}, 'furry-celebration');

    expect(res).toMatchObject({
      statusCode: 426,
      body: {
        success: false,
        code: 'RENDERER_UPGRADE_REQUIRED',
        error: expect.stringMatching(/refresh.*OBS browser source/i)
      }
    });
    expect(target.emitted.some(([event]) => event === 'webgpu-fireworks:preview')).toBe(false);
    expect(harness.plugin.pendingPreviewRequests.size).toBe(0);
  });

  test('detects advanced capability requirements from preview plan hints, not only the style ID', async () => {
    const harness = createHarness();
    dataDirs.push(harness.dataDir);
    const target = harness.connect('renderer-outdated-custom');

    await expect(harness.plugin.dispatchPreview({
      requestId: 'preview:custom-depth',
      style: 'custom:00000000-0000-4000-8000-000000000901',
      showPlan: {
        cues: [{ shells: [{ renderHints: { depthEnabled: true }, layers: [] }] }]
      }
    })).rejects.toMatchObject({
      code: 'RENDERER_UPGRADE_REQUIRED',
      status: 426,
      message: expect.stringMatching(/refresh.*OBS browser source/i)
    });
    expect(target.emitted.some(([event]) => event === 'webgpu-fireworks:preview')).toBe(false);
  });

  test('ignores a matching request ACK from the wrong socket before accepting the target renderer ACK', async () => {
    const harness = createHarness();
    dataDirs.push(harness.dataDir);
    const wrong = harness.connect('renderer-wrong');
    harness.plugin.overlayTelemetry.get(wrong.id).statusUpdatedAt -= 10;
    const target = harness.connect('renderer-target');
    target.onPreview = payload => {
      wrong.receive('webgpu-fireworks:preview-ack', {
        requestId: payload.requestId,
        rendererId: target.id,
        accepted: true
      });
      expect(harness.plugin.pendingPreviewRequests.size).toBe(1);
      queueMicrotask(() => target.receive('webgpu-fireworks:preview-ack', {
        requestId: payload.requestId,
        rendererId: target.id,
        accepted: true
      }));
    };

    const res = await harness.invoke();

    expect(res).toMatchObject({ statusCode: 200, body: { rendererId: target.id } });
  });

  test.each([
    ['stale', telemetry => { telemetry.statusUpdatedAt = Date.now() - 6000; }],
    ['benchmark', telemetry => { telemetry.benchmark = true; }]
  ])('ignores a %s target ACK and times out without leaking its waiter or timer', async (_label, invalidate) => {
    jest.useFakeTimers();
    const harness = createHarness();
    dataDirs.push(harness.dataDir);
    const target = harness.connect(`renderer-${_label}`);
    target.onPreview = payload => {
      invalidate(harness.plugin.overlayTelemetry.get(target.id));
      target.receive('webgpu-fireworks:preview-ack', {
        requestId: payload.requestId,
        rendererId: target.id,
        accepted: true
      });
    };

    const pending = harness.invoke();
    await Promise.resolve();
    expect(harness.plugin.pendingPreviewRequests.size).toBe(1);
    jest.advanceTimersByTime(26);
    const res = await pending;

    expect(res).toMatchObject({ statusCode: 503, body: { success: false, code: 'PREVIEW_ACK_TIMEOUT' } });
    expect(harness.plugin.pendingPreviewRequests.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['disconnect', 'destroy'])('%s cancels a targeted preview waiter deterministically', async mode => {
    const harness = createHarness();
    dataDirs.push(harness.dataDir);
    harness.plugin.previewAckTimeoutMs = 1000;
    const target = harness.connect(`renderer-${mode}`);

    const pending = harness.invoke();
    await new Promise(resolve => setImmediate(resolve));
    expect(harness.plugin.pendingPreviewRequests.size).toBe(1);
    if (mode === 'disconnect') target.disconnect();
    else await harness.plugin.destroy();
    const res = await pending;

    expect(res).toMatchObject({ statusCode: 503, body: { success: false, code: 'RENDERER_NOT_READY' } });
    expect(harness.plugin.pendingPreviewRequests.size).toBe(0);
  });
});
