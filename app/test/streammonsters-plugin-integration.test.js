const Database = require('better-sqlite3');
const { EventEmitter } = require('events');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');

function createApi({ gcce = null, streamMonstersEnabled = true } = {}) {
  const events = [];
  const routes = [];
  const emitted = [];
  const pluginEvents = new EventEmitter();
  const settings = new Map([['streamalchemy_config', {
    enabled: true,
    streamMonsters: { enabled: streamMonstersEnabled, hatchDurationMs: 1, maxUnhatchedEggs: 3 }
  }]]);
  const sqlite = new Database(':memory:');
  const loadedPlugins = new Map();
  if (gcce) loadedPlugins.set('gcce', { instance: gcce });
  return {
    events,
    routes,
    emitted,
    pluginEvents,
    api: {
      pluginDir: require('path').join(process.cwd(), 'plugins', 'streamalchemy'),
      log: jest.fn(),
      getDatabase: () => sqlite,
      getConfig: key => settings.get(key) || null,
      setConfig: (key, value) => settings.set(key, value),
      getPluginDataDir: () => require('os').tmpdir(),
      ensurePluginDataDir: () => require('os').tmpdir(),
      registerRoute: (method, path, handler) => routes.push({ method, path, handler }),
      registerTikTokEvent: (event, handler) => events.push({ event, handler }),
      emit: (event, payload) => emitted.push({ event, payload }),
      on: (event, handler) => {
        pluginEvents.on(event, handler);
        return true;
      },
      removeListener: (event, handler) => pluginEvents.removeListener(event, handler),
      pluginLoader: { loadedPlugins }
    }
  };
}

function createGCCE(commandPrefix = '!', enabled = true) {
  const definitions = new Map();
  return {
    pluginConfig: { enabled, commandPrefix },
    parser: { commandPrefix },
    definitions,
    registerCommandsForPlugin: jest.fn((pluginId, commands) => {
      commands.forEach(command => definitions.set(command.name, command));
      return { pluginId, registered: commands.map(command => command.name), failed: [] };
    }),
    unregisterCommandsForPlugin: jest.fn(() => definitions.clear())
  };
}

describe('Stream Monsters plugin integration', () => {
  test('uses Stream Monsters for gifts, chat and new stream sessions without removing the plugin id', async () => {
    const { api, events, emitted } = createApi();
    const plugin = new StreamAlchemyPlugin(api);

    await plugin.init();

    expect(events.map(entry => entry.event)).toEqual(expect.arrayContaining(['gift', 'chat', 'streamSessionStarted']));
    expect(plugin.config.localGeneration.generationMode).toBe('local_preferred');
    expect(plugin.streamMonstersEngine.artPool).toBeDefined();
    plugin.streamMonstersStore.upsertGiftMapping({
      giftId: 1, giftName: 'Rose', element: 'Ember', effect: 'spawn', enabled: true
    });
    await events.find(entry => entry.event === 'gift').handler({
      uniqueId: 'viewer-a', giftId: 1, giftName: 'Rose', diamondCount: 1
    });

    expect(emitted.map(entry => entry.event)).toContain('streammonsters:egg_spawned');

    await events.find(entry => entry.event === 'streamSessionStarted').handler({
      username: 'creator', streamSessionId: 7, streamIdentity: 'creator:room-7'
    });
    expect(plugin.streamMonstersStore.getStreamEvent('creator:room-7')).toEqual(expect.objectContaining({ boost_multiplier: 2 }));
  });

  test('exposes Stream Monsters setup, state and safe demo routes', async () => {
    const { api, routes } = createApi();
    const plugin = new StreamAlchemyPlugin(api);

    await plugin.init();

    expect(routes.map(route => `${route.method} ${route.path}`)).toEqual(expect.arrayContaining([
      'GET /streammonsters/ui',
      'GET /streammonsters/overlay',
      'GET /api/streammonsters/state',
      'POST /api/streammonsters/demo',
      'GET /api/streammonsters/pool',
      'POST /api/streammonsters/pool',
      'POST /api/streammonsters/pool/prepare',
      'GET /api/streammonsters/gift-catalog',
      'GET /api/streammonsters/local-runtime/status',
      'POST /api/streammonsters/local-runtime/install',
      'GET /api/streammonsters/local-runtime/install/:jobId',
      'DELETE /api/streammonsters/local-runtime/install/:jobId',
      'POST /api/streammonsters/local-runtime/start',
      'POST /api/streammonsters/local-runtime/stop',
      'POST /api/streammonsters/local-runtime/verify'
    ]));
    const legacyUi = routes.find(route => route.method === 'GET' && route.path === '/streamalchemy/ui');
    const legacyOverlay = routes.find(route => route.method === 'GET' && route.path === '/streamalchemy/overlay');
    let uiFile = null;
    let overlayFile = null;
    await legacyUi.handler({}, { sendFile: file => { uiFile = file; } });
    await legacyOverlay.handler({}, { sendFile: file => { overlayFile = file; } });
    expect(uiFile).toContain('streammonsters-ui.html');
    expect(overlayFile).toContain('streammonsters-overlay.html');
  });

  test('connects the local provider to the current managed runtime port', async () => {
    const { api } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    plugin.streamMonstersManagedRuntime.processState = {
      state: 'running',
      pid: 42,
      port: 8307,
      baseUrl: 'http://127.0.0.1:8307'
    };

    expect(plugin.providers.localComfy.resolveBaseUrl()).toBe('http://127.0.0.1:8307');

    await plugin.destroy();
  });

  test('registers the public Stream Monsters commands with GCCE when available', async () => {
    const gcce = {
      unregisterCommandsForPlugin: jest.fn(),
      registerCommandsForPlugin: jest.fn().mockReturnValue({ registered: ['inventory', 'monsters', 'choose', 'battle', 'leavebattle', 'monstershelp'] })
    };
    const { api } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);

    await plugin.init();
    expect(gcce.unregisterCommandsForPlugin).toHaveBeenCalledWith('streamalchemy');
    expect(gcce.registerCommandsForPlugin).toHaveBeenCalledWith('streamalchemy', expect.arrayContaining([
      expect.objectContaining({ name: 'eggs', permission: 'all' }),
      expect.objectContaining({ name: 'hatch', permission: 'all' }),
      expect.objectContaining({ name: 'battle', permission: 'all' })
    ]));
  });

  test('cleans the ready timer and volatile queues during reload shutdown', async () => {
    const { api } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const destroyRuntime = jest.spyOn(plugin.streamMonstersManagedRuntime, 'destroy');
    plugin.streamMonstersEngine.recentGifts.set('viewer-a', { giftId: 1, timestamp: 1 });
    plugin.streamMonstersChatCommands.queue.push({ userId: 'viewer-a', queuedAt: 1 });

    expect(plugin.streamMonstersReadyTimer).toBeDefined();
    await plugin.destroy();

    expect(plugin.streamMonstersReadyTimer).toBeNull();
    expect(plugin.streamMonstersEngine.recentGifts.size).toBe(0);
    expect(plugin.streamMonstersChatCommands.queue).toEqual([]);
    expect(destroyRuntime).toHaveBeenCalledTimes(1);
  });

  test('honors the nested Stream Monsters enable switch for gifts and chat', async () => {
    const { api, events, emitted } = createApi({ streamMonstersEnabled: false });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    plugin.streamMonstersStore.upsertGiftMapping({
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });

    await events.find(entry => entry.event === 'gift').handler({
      uniqueId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      diamondCount: 1
    });
    await events.find(entry => entry.event === 'chat').handler({
      uniqueId: 'viewer-a',
      comment: '!eggs'
    });

    expect(plugin.streamMonstersStore.getViewerEggs('viewer-a')).toEqual([]);
    expect(emitted).toEqual([]);
    await plugin.destroy();
  });

  test('uses GCCE as the only ingress and emits one personalized result for one input', async () => {
    const gcce = createGCCE('!');
    const { api, events, emitted, routes } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const progression = jest.spyOn(plugin.streamMonstersProgression, 'recordCommand');
    const chat = events.find(entry => entry.event === 'chat').handler;

    await gcce.definitions.get('eggs').handler([], {
      userId: 'viewer-a',
      username: 'Viewer A',
      uniqueId: 'viewer-a'
    });
    await chat({ uniqueId: 'viewer-a', nickname: 'Viewer A', comment: '!eggs' });

    expect(progression).toHaveBeenCalledTimes(1);
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          userId: 'viewer-a',
          username: 'Viewer A',
          result: expect.objectContaining({ status: 'eggs' })
        })
      })
    ]);
    const stateRoute = routes.find(route => route.method === 'GET' && route.path === '/api/streammonsters/state');
    let state = null;
    stateRoute.handler({ query: {} }, { json: payload => { state = payload; } });
    expect(state.gcce).toEqual({
      commandPrefix: '!',
      registrationState: 'active',
      commandsRegistered: true
    });
    await plugin.destroy();
  });

  test('enqueues and grants command progression once when both transports see a battle input', async () => {
    const gcce = createGCCE('!');
    const { api, events, emitted } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    plugin.streamMonstersEngine.config.hatchDurationMs = 0;
    plugin.streamMonstersStore.upsertGiftMapping({
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });
    plugin.streamMonstersEngine.processGift({
      userId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      coinValue: 1
    });
    plugin.streamMonstersEngine.hatchReadyEggs('viewer-a');
    const progression = jest.spyOn(plugin.streamMonstersProgression, 'recordCommand');

    await gcce.definitions.get('battle').handler([], {
      userId: 'viewer-a',
      username: 'Viewer A'
    });
    await events.find(entry => entry.event === 'chat').handler({
      uniqueId: 'viewer-a',
      nickname: 'Viewer A',
      comment: '!battle'
    });

    expect(plugin.streamMonstersChatCommands.queue).toHaveLength(1);
    expect(progression).toHaveBeenCalledTimes(1);
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          userId: 'viewer-a',
          result: expect.objectContaining({ status: 'queued' })
        })
      })
    ]);
    await plugin.destroy();
  });

  test('switches idempotently across late GCCE load, reload and unload while preserving the prefix', async () => {
    const { api, events, emitted, pluginEvents, routes } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const chat = events.find(entry => entry.event === 'chat').handler;

    await chat({ uniqueId: 'fallback-user', nickname: 'Fallback User', comment: '!eggs' });
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toHaveLength(1);

    const firstGCCE = createGCCE('/');
    api.pluginLoader.loadedPlugins.set('gcce', { instance: firstGCCE });
    pluginEvents.emit('plugin:loaded', { id: 'gcce', instance: firstGCCE });
    pluginEvents.emit('plugin:enabled', 'gcce');
    pluginEvents.emit('gcce:ready', { timestamp: Date.now() });
    expect(firstGCCE.registerCommandsForPlugin).toHaveBeenCalledTimes(1);
    expect(firstGCCE.definitions.get('eggs').syntax).toBe('/eggs');

    const secondGCCE = createGCCE('/');
    api.pluginLoader.loadedPlugins.set('gcce', { instance: secondGCCE });
    pluginEvents.emit('plugin:reloaded', 'gcce');
    expect(firstGCCE.unregisterCommandsForPlugin).toHaveBeenCalledWith('streamalchemy');
    expect(secondGCCE.registerCommandsForPlugin).toHaveBeenCalledTimes(1);

    api.pluginLoader.loadedPlugins.delete('gcce');
    pluginEvents.emit('plugin:unloaded', 'gcce');
    await chat({ uniqueId: 'fallback-user-2', nickname: 'Fallback User 2', comment: '/eggs' });
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toHaveLength(2);

    const stateRoute = routes.find(route => route.method === 'GET' && route.path === '/api/streammonsters/state');
    let state = null;
    stateRoute.handler({ query: {} }, { json: payload => { state = payload; } });
    expect(state.gcce).toEqual(expect.objectContaining({
      commandPrefix: '/',
      registrationState: 'fallback',
      commandsRegistered: false
    }));

    await plugin.destroy();
    expect(pluginEvents.eventNames()).toEqual([]);
    expect(secondGCCE.unregisterCommandsForPlugin).toHaveBeenCalledWith('streamalchemy');
  });

  test('uses the configured GCCE prefix for fallback when GCCE is disabled', async () => {
    const gcce = createGCCE('/', false);
    const { api, events, emitted } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    await events.find(entry => entry.event === 'chat').handler({
      uniqueId: 'viewer-a',
      nickname: 'Viewer A',
      comment: '/eggs'
    });

    expect(gcce.registerCommandsForPlugin).not.toHaveBeenCalled();
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          userId: 'viewer-a',
          result: expect.objectContaining({ status: 'eggs' })
        })
      })
    ]);
    await plugin.destroy();
  });

  test('enforces fallback global and user cooldowns before domain side effects', async () => {
    const { api, events, emitted } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    let now = 10_000;
    plugin.streamMonstersCommandIngress.now = () => now;
    const progression = jest.spyOn(plugin.streamMonstersProgression, 'recordCommand');
    const chat = events.find(entry => entry.event === 'chat').handler;

    await chat({ uniqueId: 'viewer-a', comment: '!eggs' });
    await chat({ uniqueId: 'viewer-b', comment: '!eggs' });
    now += 251;
    await chat({ uniqueId: 'viewer-a', comment: '!eggs' });
    now += 750;
    await chat({ uniqueId: 'viewer-a', comment: '!eggs' });

    expect(progression).toHaveBeenCalledTimes(2);
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result').map(entry => entry.payload.result.status)).toEqual([
      'eggs',
      'global_cooldown',
      'cooldown',
      'eggs'
    ]);
    await plugin.destroy();
  });

  test('translates a GCCE cooldown rejection into one personalized Stream Monsters result', async () => {
    const gcce = createGCCE('!');
    const { api, emitted, pluginEvents } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    pluginEvents.emit('gcce:command_result', {
      success: false,
      error: 'Command is on cooldown.',
      errorCode: 'COMMAND_ON_COOLDOWN',
      cooldownType: 'user',
      commandName: 'eggs',
      pluginId: 'streamalchemy',
      userId: 'viewer-a',
      username: 'Viewer A'
    });

    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          userId: 'viewer-a',
          username: 'Viewer A',
          result: expect.objectContaining({
            success: false,
            status: 'cooldown'
          })
        })
      })
    ]);
    await plugin.destroy();
  });
});
