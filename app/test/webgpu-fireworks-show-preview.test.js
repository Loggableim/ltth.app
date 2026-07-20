'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { BUILT_IN_SHOW_DEFINITIONS } = require('../plugins/webgpu-fireworks/lib/built-in-shows');
const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');
const { RevisionedShowRepository } = require('../plugins/webgpu-fireworks/lib/show-repository');
const { createShowPreviewPlan } = require('../plugins/webgpu-fireworks/lib/show-preview-plan');

const PREVIEW_ROUTE = '/api/webgpu-fireworks/shows/:id/preview';
const CUSTOM_UUID = '00000000-0000-4000-8000-000000000777';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createApi(dataDir) {
  const routes = [];
  return {
    routes,
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
    registerSocketConnection: jest.fn()
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function json(body) {
      this.body = body;
      return this;
    })
  };
}

async function invokePreview(api, body = {}, id = 'classic-crescendo') {
  const previewRoute = api.routes.find(candidate => (
    candidate.method === 'post' && candidate.route === PREVIEW_ROUTE
  ));
  expect(previewRoute).toBeDefined();
  const response = createResponse();
  await previewRoute.handler({
    params: { id },
    body: {
      scope: 'cue',
      variant: 'short',
      cueIndex: 0,
      intensity: 4,
      seed: 123,
      ...body
    }
  }, response);
  return response;
}

function createHarness() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-show-preview-'));
  const api = createApi(dataDir);
  const plugin = new FireworksPlugin(api);
  plugin.config = normalizeConfig({
    audioEnabled: false,
    audioVolume: 0.35,
    orientation: 'portrait'
  });
  const repository = new RevisionedShowRepository({ dataDir });
  repository.idFactory = () => CUSTOM_UUID;
  repository.load();
  plugin.showRepository = repository;
  plugin.showRepositoryLoadError = null;
  plugin.registerRoutes();
  return { api, dataDir, plugin, repository };
}

function setTelemetry(plugin, values) {
  const sockets = [];
  plugin.overlayTelemetry = new Map(values.map((value, index) => {
    const rendererId = `renderer-${index + 1}`;
    const socket = {
      id: rendererId,
      connected: true,
      emit: jest.fn((event, payload) => {
        if (event === 'webgpu-fireworks:preview') {
          plugin.handlePreviewAck({
            requestId: payload.requestId,
            rendererId,
            accepted: true
          }, socket);
        }
        return true;
      })
    };
    sockets.push(socket);
    return [rendererId, {
      registered: true,
      benchmark: false,
      state: 'ready',
      finaleActive: false,
      previewActive: false,
      finaleQueueLength: 0,
      statusUpdatedAt: Date.now(),
      ...value
    }];
  }));
  plugin.connectedSockets = new Set(sockets);
  plugin.api.__previewSockets = sockets;
}

function emittedPreviews(api) {
  return (api.__previewSockets || []).flatMap(socket => socket.emit.mock.calls
    .filter(([event]) => event === 'webgpu-fireworks:preview')
    .map(([, payload]) => payload));
}

function emittedPreview(api) {
  return emittedPreviews(api)[0];
}

describe('WebGPU Fireworks explicit show preview', () => {
  const dataDirs = [];

  afterEach(() => {
    for (const dataDir of dataDirs.splice(0)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test.each([
    ['offline', []],
    ['initializing', [{ state: 'initializing' }]],
    ['error', [{ state: 'error' }]],
    ['stale', [{ state: 'ready', statusUpdatedAt: Date.now() - 5001 }]]
  ])('rejects an %s renderer with structured readiness details', async (_label, telemetry) => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, telemetry);

    const response = await invokePreview(api);

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: 'RENDERER_NOT_READY',
      details: { readyRendererCount: 0 }
    });
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:preview', expect.anything());
  });

  test.each([
    ['active', { finaleActive: true }],
    ['queued', { finaleQueueLength: 1 }]
  ])('rejects a fresh renderer with an %s finale', async (_label, busyState) => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [busyState]);

    const response = await invokePreview(api);

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      code: 'FINALE_BUSY',
      details: { busyRendererCount: 1 }
    });
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:preview', expect.anything());
  });

  test('ready idle renderer receives exactly one dedicated preview without finale or queue mutation', async () => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{}]);
    plugin.queueTimestamps = [101, 202];
    const triggerFinale = jest.spyOn(plugin, 'triggerFinale');

    const response = await invokePreview(api);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      requestId: expect.any(String),
      id: expect.any(String)
    });
    expect(response.body.id).toBe(response.body.requestId);
    expect(emittedPreviews(api)).toHaveLength(1);
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:preview', expect.anything());
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
    expect(triggerFinale).not.toHaveBeenCalled();
    expect(plugin.queueTimestamps).toEqual([101, 202]);
  });

  test('cue preview rebases its first explosion to 2000ms and includes the complete layer tail', async () => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{}]);

    await invokePreview(api);

    const payload = emittedPreview(api);
    expect(payload).toBeDefined();
    expect(payload.showPlan.cues).toHaveLength(1);
    const [cue] = payload.showPlan.cues;
    expect(cue.timeMs).toBe(2000);
    expect(cue.beatAtMs).toBe(2000);
    const tailMs = Math.max(...cue.shells.flatMap(shell => (
      shell.layers.map(layer => layer.delayMs + layer.lifetimeMs)
    )));
    expect(payload.showPlan.durationMs).toBe(2000 + tailMs);
    expect(payload.durationMs).toBe(payload.showPlan.durationMs);
  });

  test('phase preview preserves cue spacing and every layer delay while rebasing the first beat', async () => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{}]);
    const sourceCues = BUILT_IN_SHOW_DEFINITIONS['classic-crescendo']
      .variants.medium.cues.filter(cue => cue.phase === 'build');

    await invokePreview(api, {
      scope: 'phase',
      variant: 'medium',
      phase: 'build',
      seed: 456
    });

    const cues = emittedPreview(api).showPlan.cues;
    expect(cues[0].timeMs).toBe(2000);
    expect(cues.map(cue => cue.timeMs - cues[0].timeMs))
      .toEqual(sourceCues.map(cue => cue.timeMs - sourceCues[0].timeMs));
    expect(cues.map(cue => cue.shells.map(shell => shell.layers.map(layer => layer.delayMs))))
      .toEqual(sourceCues.map(cue => cue.shells.map(shell => shell.layers.map(layer => layer.delayMs))));
  });

  test('full-show preview retains exact source timing and duration', async () => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{}]);

    await invokePreview(api, { scope: 'show', variant: 'short', seed: 789 });

    const plan = emittedPreview(api).showPlan;
    expect(plan.durationMs).toBe(10000);
    expect(plan.cues.map(cue => cue.timeMs))
      .toEqual(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo'].variants.short.cues.map(cue => cue.timeMs));
  });

  test.each([
    ['scope', { scope: 'segment' }, 400, 'INVALID_PREVIEW_SCOPE'],
    ['variant', { variant: 'epic' }, 400, 'INVALID_PREVIEW_VARIANT'],
    ['cue', { cueIndex: 999 }, 400, 'INVALID_PREVIEW_CUE'],
    ['phase', { scope: 'phase', phase: 'breath' }, 400, 'INVALID_PREVIEW_PHASE']
  ])('rejects invalid %s with a structured preview error', async (_label, body, status, code) => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{}]);

    const response = await invokePreview(api, body);

    expect(response.statusCode).toBe(status);
    expect(response.body).toMatchObject({ success: false, code, details: expect.any(Object) });
  });

  test('custom preview requires the exact current draft revision without requiring publication', async () => {
    const { api, dataDir, plugin, repository } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{}]);
    const definition = clone(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo']);
    definition.metadata.name = 'Current Unpublished Draft';
    definition.variants.short.cues[0].shells[0].target.x = 0.37;
    const created = repository.create(definition);
    const planDefinition = jest.spyOn(plugin.finaleShowPlanner, 'planDefinition');

    const missing = await invokePreview(api, {}, created.id);
    const conflict = await invokePreview(api, { expectedRevision: 0 }, created.id);
    const accepted = await invokePreview(api, { expectedRevision: created.revision }, created.id);

    expect(missing).toMatchObject({ statusCode: 400, body: { code: 'EXPECTED_REVISION_REQUIRED' } });
    expect(conflict).toMatchObject({ statusCode: 409, body: { code: 'REVISION_CONFLICT' } });
    expect(accepted.statusCode).toBe(200);
    expect(planDefinition).toHaveBeenCalledTimes(1);
    expect(planDefinition.mock.calls[0][0]).toEqual(created.definition);
    expect(emittedPreview(api)).toMatchObject({
      sourceId: created.id,
      sourceRevision: created.revision,
      builtIn: false,
      metadata: { name: 'Current Unpublished Draft' }
    });
  });

  test('built-in preview uses the normal built-in finale planner', async () => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{}]);
    const plan = jest.spyOn(plugin.finaleShowPlanner, 'plan');
    const planDefinition = jest.spyOn(plugin.finaleShowPlanner, 'planDefinition');

    await invokePreview(api, { scope: 'show', variant: 'long' });

    expect(plan).toHaveBeenCalledTimes(1);
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({
      style: 'classic-crescendo',
      length: 'long'
    }));
    expect(planDefinition).not.toHaveBeenCalled();
  });

  test('emitted custom snapshot stays deeply immutable across later draft edits and archive', async () => {
    const { api, dataDir, plugin, repository } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{}]);
    const definition = clone(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo']);
    definition.metadata.name = 'Snapshot Before Edit';
    const created = repository.create(definition);

    await invokePreview(api, { expectedRevision: created.revision }, created.id);
    const payload = emittedPreview(api);
    const before = clone(payload);
    const edited = clone(created.definition);
    edited.metadata.name = 'Edited After Emit';
    const saved = repository.saveDraft(created.id, edited, created.revision);
    repository.archive(created.id, saved.revision);

    expect(payload).toEqual(before);
    expect(payload.metadata.name).toBe('Snapshot Before Edit');
    expect(Object.isFrozen(payload.showPlan)).toBe(true);
    expect(Object.isFrozen(payload.showPlan.cues[0].shells[0].layers[0])).toBe(true);
  });

  test('payload carries material, audio, config, and correlated unique request identity', async () => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{}]);

    await invokePreview(api, { seed: 42, intensity: 7 });
    await invokePreview(api, { seed: 42, intensity: 7 });

    const previews = emittedPreviews(api);
    expect(previews).toHaveLength(2);
    expect(previews[0]).toMatchObject({
      id: expect.any(String),
      requestId: expect.any(String),
      eventId: expect.any(String),
      style: 'classic-crescendo',
      variant: 'short',
      length: 'short',
      intensity: 7,
      seed: 42,
      materialProfile: 'classic',
      visualStyle: plugin.config.visualStyle,
      playSound: false,
      audioVolume: 0.35,
      audioMuted: true,
      audioMasterVolume: 0.35,
      audio: { muted: true, masterVolume: 0.35 },
      rocketSound: plugin.config.rocketSound,
      explosionSound: plugin.config.explosionSound
    });
    expect(previews[0].id).toBe(previews[0].requestId);
    expect(previews[0].eventId).toBe(previews[0].requestId);
    expect(previews[0].showPlan.id).toBe(previews[0].requestId);
    expect(previews[1].requestId).not.toBe(previews[0].requestId);
    expect(previews[1].showPlan.cues[0].shells.map(shell => shell.target))
      .toEqual(previews[0].showPlan.cues[0].shells.map(shell => shell.target));
  });

  test('preview intensity is clamped to the renderer-supported 1..10 range', async () => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{}]);

    await invokePreview(api, { intensity: 0.2 });
    await invokePreview(api, { intensity: 99 });

    const previews = emittedPreviews(api);
    expect(previews.map(payload => payload.intensity)).toEqual([1, 10]);
  });

  test.each([
    ['string', '7'],
    ['null', null],
    ['boolean', true],
    ['object', {}],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY]
  ])('rejects an explicit %s intensity with a typed 400', async (_label, intensity) => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{}]);

    const response = await invokePreview(api, { intensity });

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_PREVIEW_INTENSITY',
      details: { receivedType: typeof intensity }
    });
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:preview', expect.anything());
  });

  test.each([
    ['empty shells', { shells: [] }],
    ['empty layers', { shells: [{ layers: [] }] }]
  ])('rejects a malformed selected cue with %s instead of producing an invalid tail', (_label, cueShape) => {
    const sourcePlan = {
      durationMs: 10000,
      cues: [{
        timeMs: 1000,
        beatAtMs: 1000,
        phase: 'opening',
        ...cueShape
      }]
    };

    expect(() => createShowPreviewPlan(sourcePlan, { scope: 'cue', cueIndex: 0 }))
      .toThrow(expect.objectContaining({
        code: 'INVALID_PREVIEW_PLAN',
        status: 422
      }));
  });

  test('aggregates all fresh renderer entries while ignoring stale and benchmark entries', async () => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [
      { state: 'ready' },
      { state: 'ready', benchmark: true, finaleActive: true, finaleQueueLength: 5 },
      { state: 'ready', finaleActive: true, statusUpdatedAt: Date.now() - 5001 }
    ]);

    const accepted = await invokePreview(api);

    expect(accepted.statusCode).toBe(200);
    api.emit.mockClear();
    setTelemetry(plugin, [
      { state: 'ready' },
      { state: 'ready', finaleQueueLength: 2 }
    ]);
    const busy = await invokePreview(api);
    expect(busy).toMatchObject({
      statusCode: 409,
      body: { code: 'FINALE_BUSY', details: { readyRendererCount: 2, busyRendererCount: 1 } }
    });
    setTelemetry(plugin, [{ state: 'ready', benchmark: true }]);
    const benchmarkOnly = await invokePreview(api);
    expect(benchmarkOnly).toMatchObject({
      statusCode: 503,
      body: { code: 'RENDERER_NOT_READY', details: { readyRendererCount: 0 } }
    });
  });

  test('fresh active or queued finale takes precedence when no renderer is ready', async () => {
    const { api, dataDir, plugin } = createHarness();
    dataDirs.push(dataDir);
    setTelemetry(plugin, [{
      state: 'initializing',
      finaleActive: true,
      finaleQueueLength: 1
    }]);

    const response = await invokePreview(api);

    expect(response).toMatchObject({
      statusCode: 409,
      body: {
        success: false,
        code: 'FINALE_BUSY',
        details: { readyRendererCount: 0, busyRendererCount: 1 }
      }
    });
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:preview', expect.anything());
  });
});
