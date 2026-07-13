const VisualFxFrameWebGPUPlugin = require('../../plugin-store/sources/visual-fx-frame-webgpu/main');

function createResponse() {
  const response = {
    statusCode: 200,
    status: jest.fn(code => {
      response.statusCode = code;
      return response;
    }),
    json: jest.fn(),
    sendFile: jest.fn()
  };
  return response;
}

function createHarness() {
  const routes = new Map();
  const sockets = new Map();
  const rows = new Map([
    ['plugin:flame-overlay:settings', JSON.stringify({
      effectType: 'energy',
      qualityMode: 'max-quality',
      flameColor: '#abcdef',
      triggerCooldown: 3456,
      unknownSecret: 'drop-me'
    })],
    ['plugin:flame-overlay:presets', JSON.stringify({ legacy: { config: { effectType: 'flames' } } })]
  ]);
  const database = {
    prepare: jest.fn(sql => ({
      get: jest.fn(key => {
        const value = rows.get(key);
        return value === undefined ? undefined : { value };
      })
    })),
    getGiftCatalog: jest.fn(() => [])
  };
  const api = {
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(() => true),
    emit: jest.fn(),
    log: jest.fn(),
    getDatabase: jest.fn(() => database),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method.toUpperCase()} ${route}`, handler)),
    registerSocket: jest.fn((event, handler) => sockets.set(event, handler)),
    registerTikTokEvent: jest.fn(),
    registerFlowAction: jest.fn()
  };
  const plugin = new VisualFxFrameWebGPUPlugin(api);
  plugin.loadConfig();
  plugin.registerRoutes();
  plugin.registerFlowActions();
  return { api, database, plugin, routes, sockets };
}

describe('Visual FX Frame WEBGPU backend integration', () => {
  test('returns a normalized, reportable legacy import preview', () => {
    const { routes } = createHarness();
    const response = createResponse();

    routes.get('GET /api/visual-fx-frame-webgpu/import/flame-overlay')({}, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      available: true,
      sourcePlugin: 'flame-overlay',
      fieldsImported: expect.any(Number),
      config: expect.objectContaining({
        renderer: 'webgpu',
        effectType: 'energy',
        qualityMode: 'max-quality',
        flameColor: '#abcdef',
        triggerCooldown: 3456,
        visualProfileVersion: 5
      })
    }));
    const payload = response.json.mock.calls[0][0];
    expect(payload.fieldsImported).toBeGreaterThan(3);
    expect(payload.config.triggerCooldown).toBe(3456);
    expect(payload.config).not.toHaveProperty('unknownSecret');
  });

  test('requires confirmation and keeps legacy presets opt-in', () => {
    const { api, routes } = createHarness();
    const rejectResponse = createResponse();
    routes.get('POST /api/visual-fx-frame-webgpu/import/flame-overlay')({ body: {} }, rejectResponse);
    expect(rejectResponse.status).toHaveBeenCalledWith(400);

    const importResponse = createResponse();
    routes.get('POST /api/visual-fx-frame-webgpu/import/flame-overlay')({
      body: { confirm: true, overwritePresets: false }
    }, importResponse);

    expect(importResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      sourcePlugin: 'flame-overlay',
      presetsImported: false,
      fieldsImported: expect.any(Number)
    }));
    expect(api.setConfig).toHaveBeenCalledWith('settings', expect.objectContaining({ renderer: 'webgpu' }));
    expect(api.setConfig).not.toHaveBeenCalledWith('presets', expect.anything());
    expect(api.emit).toHaveBeenCalledWith('visual-fx-frame-webgpu:config-update', expect.any(Object));
  });

  test('reports namespaced renderer state without touching the original plugin', () => {
    const { plugin, routes, sockets } = createHarness();
    sockets.get('visual-fx-frame-webgpu:renderer-status')({
      state: 'ready',
      adapter: { description: 'Test GPU' },
      fps: 60,
      gpuFrameTimeMs: 4.2,
      renderScale: 0.9
    });

    const response = createResponse();
    routes.get('GET /api/visual-fx-frame-webgpu/status')({}, response);

    expect(plugin.rendererStatus).toMatchObject({ state: 'ready', backend: 'webgpu', fps: 60 });
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      renderer: expect.objectContaining({ state: 'ready', backend: 'webgpu' })
    }));
  });

  test('serves only the allowlisted WebGPU runtime assets', () => {
    const { routes } = createHarness();
    const allowed = createResponse();
    routes.get('GET /visual-fx-frame-webgpu/:asset')(
      { params: { asset: 'webgpu-effects-engine.js' } },
      allowed
    );
    expect(allowed.sendFile).toHaveBeenCalledWith(expect.stringMatching(/renderer[\\/]webgpu-effects-engine\.js$/));

    const denied = createResponse();
    routes.get('GET /visual-fx-frame-webgpu/:asset')(
      { params: { asset: 'effects-engine.js' } },
      denied
    );
    expect(denied.status).toHaveBeenCalledWith(404);
  });
});
