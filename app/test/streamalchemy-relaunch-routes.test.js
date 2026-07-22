const StreamAlchemyPlugin = require('../plugins/streamalchemy');
const StreamAlchemyRoutes = require('../plugins/streamalchemy/backend/routes');

function createApi() {
  const routes = [];
  const sockets = [];
  const tiktokEvents = [];
  const emitted = [];
  const settings = new Map();
  const Database = require('better-sqlite3');
  const sqlite = new Database(':memory:');
  return {
    routes,
    sockets,
    tiktokEvents,
    emitted,
    api: {
      pluginDir: require('path').join(process.cwd(), 'plugins', 'streamalchemy'),
      log: jest.fn(),
      getDatabase: () => sqlite,
      getConfig: key => settings.get(key) || null,
      setConfig: (key, value) => { settings.set(key, value); return true; },
      getPluginDataDir: () => require('os').tmpdir(),
      ensurePluginDataDir: () => require('os').tmpdir(),
      registerRoute: (method, path, handler) => { routes.push({ method, path, handler }); return true; },
      registerSocket: (event, handler) => { sockets.push({ event, handler }); return true; },
      registerTikTokEvent: (event, handler) => { tiktokEvents.push({ event, handler }); return true; },
      emit: (event, payload) => { emitted.push({ event, payload }); return true; }
    }
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    file: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    sendFile(file) { this.file = file; return this; },
    setHeader(key, value) { this.headers[key] = value; return this; }
  };
}

describe('StreamAlchemy relaunch plugin routes', () => {
  test('initializes focused runtime and registers public routes', async () => {
    const { api, routes, tiktokEvents } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    expect(tiktokEvents.map(event => event.event)).toEqual(expect.arrayContaining(['gift', 'chat', 'streamSessionStarted']));
    expect(routes.map(route => `${route.method} ${route.path}`)).toEqual(expect.arrayContaining([
      'GET /streamalchemy/ui',
      'GET /streamalchemy/overlay',
      'GET /api/streamalchemy/config',
      'GET /api/streamalchemy/items',
      'GET /api/streamalchemy/recipes',
      'GET /api/streamalchemy/generation-jobs',
      'GET /api/streamalchemy/model-catalog',
      'GET /api/streamalchemy/local-model/status',
      'POST /api/streamalchemy/local-model/install',
      'GET /api/streamalchemy/system-analysis',
      'POST /api/streamalchemy/local-generation/test'
    ]));
    expect(routes.map(route => `${route.method} ${route.path}`)).not.toContain('POST /api/streamalchemy/import-legacy');
  });

  test('config route masks provider secrets', async () => {
    const { api, routes } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    const route = routes.find(entry => entry.method === 'GET' && entry.path === '/api/streamalchemy/config');
    const res = createRes();
    await route.handler({}, res);

    expect(res.body.success).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('apiKey');
    expect(JSON.stringify(res.body)).not.toContain('hf_');
    expect(res.body.config.providerOrder).toContain('localComfy');
  });

  test('config updates keep stored model token when the settings form sends an empty token', async () => {
    const { api } = createApi();
    api.setConfig('streamalchemy_config', {
      localGeneration: {
        modelAuthToken: 'hf_existing_token'
      }
    });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    const config = plugin.updateConfig({
      localGeneration: {
        modelAuthToken: ''
      }
    });

    expect(config.localGeneration.modelAuthToken).toBe('hf_existing_token');
  });

  test('local model routes expose status and start one-click install', async () => {
    const { api, routes } = createApi();
    const localModelInstaller = {
      getStatus: jest.fn().mockResolvedValue({
        state: 'missing',
        model: 'sdxl_lightning_4step'
      }),
      startInstall: jest.fn().mockReturnValue({
        state: 'installing',
        model: 'sdxl_lightning_4step'
      })
    };
    const modelCatalog = {
      getUiCatalog: jest.fn().mockResolvedValue([
        { id: 'sdxl_lightning_4step', installMethod: 'one_click' }
      ])
    };
    const routeRegistrar = new StreamAlchemyRoutes({
      api,
      pluginDir: api.pluginDir,
      store: {
        getAllItems: jest.fn(),
        getAllRecipes: jest.fn(),
        getGenerationJobs: jest.fn()
      },
      generationService: {
        getProviderStatuses: jest.fn(),
        testLocalGeneration: jest.fn().mockResolvedValue({
          provider: 'localComfy',
          model: 'sdxl_lightning_4step',
          imageUrl: 'http://127.0.0.1:8188/view?filename=test.png&type=output'
        })
      },
      systemAnalyzer: {
        analyze: jest.fn()
      },
      modelCatalog,
      configProvider: {
        getConfig: () => ({
          localGeneration: {
            selectedPresetId: 'sdxl_lightning_4step',
            comfyRootDir: 'C:\\ComfyUI'
          }
        }),
        updateConfig: jest.fn()
      },
      localModelInstaller
    });
    routeRegistrar.register();

    const statusRoute = routes.find(entry => entry.method === 'GET' && entry.path === '/api/streamalchemy/local-model/status');
    const installRoute = routes.find(entry => entry.method === 'POST' && entry.path === '/api/streamalchemy/local-model/install');
    const catalogRoute = routes.find(entry => entry.method === 'GET' && entry.path === '/api/streamalchemy/model-catalog');
    const testRoute = routes.find(entry => entry.method === 'POST' && entry.path === '/api/streamalchemy/local-generation/test');

    const statusRes = createRes();
    await statusRoute.handler({}, statusRes);
    expect(statusRes.body).toEqual({
      success: true,
      model: {
        state: 'missing',
        model: 'sdxl_lightning_4step'
      }
    });

    const installRes = createRes();
    await installRoute.handler({ body: { presetId: 'sdxl_lightning_4step' } }, installRes);
    expect(installRes.body).toEqual({
      success: true,
      model: {
        state: 'installing',
        model: 'sdxl_lightning_4step'
      }
    });
    expect(localModelInstaller.startInstall).toHaveBeenCalledWith(expect.objectContaining({
      selectedPresetId: 'sdxl_lightning_4step'
    }));

    const catalogRes = createRes();
    await catalogRoute.handler({}, catalogRes);
    expect(catalogRes.body).toEqual({
      success: true,
      presets: [{ id: 'sdxl_lightning_4step', installMethod: 'one_click' }]
    });

    const testRes = createRes();
    await testRoute.handler({}, testRes);
    expect(testRes.body).toEqual(expect.objectContaining({
      success: true,
      result: expect.objectContaining({
        provider: 'localComfy',
        model: 'sdxl_lightning_4step'
      })
    }));
  });
});

describe('StreamAlchemy relaunch static shells', () => {
  test('ui shell contains relaunch dashboard sections', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'ui.html'), 'utf8');

    expect(html).toContain('data-view="overview"');
    expect(html).toContain('data-view="items"');
    expect(html).toContain('data-view="recipes"');
    expect(html).toContain('data-view="generation-jobs"');
    expect(html).toContain('data-view="settings"');
    expect(html).not.toContain('data-view="migration"');
    expect(html).not.toContain('id="importBtn"');
    expect(html).not.toContain('/api/streamalchemy/import-legacy');
    expect(html).toContain('id="installLocalModelBtn"');
    expect(html).toContain('/api/streamalchemy/model-catalog');
    expect(html).toContain('/api/streamalchemy/local-generation/test');
    expect(html).toContain('generationMode');
    expect(html).toContain('/api/streamalchemy/local-model/status');
    expect(html).toContain('/api/streamalchemy/local-model/install');
    expect(html).toContain('HF_TOKEN');
    expect(html).toContain('item-frame');
    expect(html).toContain('frameClass(item.rarity)');
    expect(html).toContain('frame-legendary');
  });

  test('overlay shell listens to semantic relaunch events', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'overlay.html'), 'utf8');

    expect(html).toContain('streamalchemy:base_item_obtained');
    expect(html).toContain('streamalchemy:crafting_started');
    expect(html).toContain('streamalchemy:item_crafting');
    expect(html).toContain('streamalchemy:crafting_completed');
    expect(html).toContain('streamalchemy:crafting_failed');
    expect(html).toContain('streamalchemy:recipe_cache_hit');
    expect(html).toContain('Item crafting...');
    expect(html).toContain('item-crafting');
    expect(html).toContain('function frameClass(rarity)');
    expect(html).toContain('rarity: item?.rarity');
    expect(html).toContain('toastFrame');
    expect(html).toContain('frame-mythic');
  });
});
