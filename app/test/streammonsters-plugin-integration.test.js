const Database = require('better-sqlite3');
const { EventEmitter } = require('events');
const GCCE = require('../plugins/gcce');
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
  const rawHandlers = new Map();
  return {
    pluginConfig: { enabled, commandPrefix },
    parser: { commandPrefix },
    definitions,
    rawHandlers,
    registerCommandsForPlugin: jest.fn((pluginId, commands) => {
      commands.forEach(command => definitions.set(command.name, command));
      return { pluginId, registered: commands.map(command => command.name), failed: [] };
    }),
    unregisterCommandsForPlugin: jest.fn(() => definitions.clear()),
    registerRawResponseHandlerForPlugin: jest.fn((pluginId, handler) => {
      const replaced = rawHandlers.has(pluginId);
      rawHandlers.set(pluginId, handler);
      return { pluginId, registered: true, replaced };
    }),
    unregisterRawResponseHandlerForPlugin: jest.fn(pluginId => rawHandlers.delete(pluginId))
  };
}

describe('Stream Monsters plugin integration', () => {
  test('uses Stream Monsters for gifts, chat and new stream sessions without removing the plugin id', async () => {
    const { api, events, emitted } = createApi();
    const plugin = new StreamAlchemyPlugin(api);

    await plugin.init();

    expect(events.map(entry => entry.event)).toEqual(expect.arrayContaining(['gift', 'chat', 'streamSessionStarted']));
    expect(plugin.config.streamMonsters.visualPack).toBe('furry');
    expect(plugin.providers).toBeUndefined();
    expect(plugin.streamMonstersEngine.artPool).toBeUndefined();
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

  test('applies an allowed creator incubation update to future eggs without restarting', async () => {
    const { api } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    plugin.streamMonstersStore.upsertGiftMapping({
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });

    plugin.updateConfig({ streamMonsters: { hatchDurationMs: 120_000 } });
    const result = plugin.streamMonstersEngine.processGift({
      userId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      coinValue: 1
    });

    expect(result.egg.hatch_duration_ms).toBe(120_000);
    await plugin.destroy();
  });

  test('does not expose starter adoption across stable viewer handle changes', async () => {
    const { api, events, emitted } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const chat = events.find(entry => entry.event === 'chat').handler;

    await chat({
      userId: '7123456789012345678',
      uniqueId: 'old_handle',
      nickname: 'Viewer',
      comment: '!adopt'
    });
    plugin.streamMonstersCommandIngress.clear();
    await chat({
      userId: '7123456789012345678',
      uniqueId: 'new_handle',
      nickname: 'Viewer',
      comment: '!adopt'
    });

    const canonicalId = plugin.streamMonstersStore.resolveKnownViewerId('7123456789012345678');
    expect(plugin.streamMonstersStore.getViewerEggs(canonicalId)).toHaveLength(0);
    expect(emitted.filter(entry => entry.event === 'streammonsters:starter_claimed')).toHaveLength(0);
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toHaveLength(0);
    await plugin.destroy();
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

  test('does not construct provider or managed-runtime services', async () => {
    const { api, routes } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    expect(plugin.providers).toBeUndefined();
    expect(plugin.streamMonstersManagedRuntime).toBeUndefined();
    const tombstone = routes.find(route => (
      route.method === 'GET' && route.path === '/api/streammonsters/local-runtime/status'
    ));
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    tombstone.handler({}, response);
    expect(response.status).toHaveBeenCalledWith(410);
    expect(response.json).toHaveBeenCalledWith({ error: 'art_lab_removed' });

    await plugin.destroy();
  });

  test('registers the public Stream Monsters commands with GCCE when available', async () => {
    const gcce = {
      unregisterCommandsForPlugin: jest.fn(),
      registerCommandsForPlugin: jest.fn((pluginId, commands) => ({
        registered: commands.map(command => command.name)
      }))
    };
    const { api } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);

    await plugin.init();
    expect(gcce.unregisterCommandsForPlugin).toHaveBeenCalledWith('streamalchemy');
    expect(gcce.registerCommandsForPlugin).toHaveBeenCalledWith('streamalchemy', expect.arrayContaining([
      expect.objectContaining({ name: 'eier', permission: 'all' }),
      expect.objectContaining({ name: 'eierliste', permission: 'all' }),
      expect.objectContaining({ name: 'meineeier', permission: 'all' }),
      expect.objectContaining({ name: 'hatch', permission: 'all' }),
      expect.objectContaining({ name: 'battle', minArgs: 0, maxArgs: 1, permission: 'all' })
    ]));
  });

  test('cleans the ready timer and volatile queues during reload shutdown', async () => {
    const { api } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    plugin.streamMonstersEngine.recentGifts.set('viewer-a', { giftId: 1, timestamp: 1 });
    plugin.streamMonstersChatCommands.queue.push({ userId: 'viewer-a', queuedAt: 1 });

    expect(plugin.streamMonstersReadyTimer).toBeDefined();
    await plugin.destroy();

    expect(plugin.streamMonstersReadyTimer).toBeNull();
    expect(plugin.streamMonstersEngine.recentGifts.size).toBe(0);
    expect(plugin.streamMonstersChatCommands.queue).toEqual([]);
  });

  test('deduplicates retried provider gifts while processing each repeat in the event once', async () => {
    const { api, events } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    plugin.streamMonstersStore.upsertGiftMapping({
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });
    const gift = events.find(entry => entry.event === 'gift').handler;
    const payload = {
      eventId: 'provider-event-1',
      userId: 'stable-viewer',
      uniqueId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      repeatCount: 2
    };

    await gift(payload);
    await gift(payload);

    const canonicalId = plugin.streamMonstersStore.resolveKnownViewerId('stable-viewer');
    expect(plugin.streamMonstersStore.getViewerEggs(canonicalId)).toHaveLength(2);
    expect(plugin.streamMonstersStore.getViewerProgress(canonicalId).gifts_sent).toBe(2);
    await plugin.destroy();
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

    await gcce.definitions.get('eier').handler([], {
      userId: 'viewer-a',
      username: 'Viewer A',
      uniqueId: 'viewer-a'
    });
    await chat({ uniqueId: 'viewer-a', nickname: 'Viewer A', comment: '!eier' });

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
      registrationError: null,
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

    await chat({ uniqueId: 'fallback-user', nickname: 'Fallback User', comment: '!eier' });
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toHaveLength(1);

    const firstGCCE = createGCCE('/');
    api.pluginLoader.loadedPlugins.set('gcce', { instance: firstGCCE });
    pluginEvents.emit('plugin:loaded', { id: 'gcce', instance: firstGCCE });
    pluginEvents.emit('plugin:enabled', 'gcce');
    pluginEvents.emit('gcce:ready', { timestamp: Date.now() });
    expect(firstGCCE.registerCommandsForPlugin).toHaveBeenCalledTimes(1);
    expect(firstGCCE.registerRawResponseHandlerForPlugin).toHaveBeenCalledTimes(1);
    expect(firstGCCE.definitions.get('eier').syntax).toBe('/eier');

    const secondGCCE = createGCCE('/');
    api.pluginLoader.loadedPlugins.set('gcce', { instance: secondGCCE });
    pluginEvents.emit('plugin:reloaded', 'gcce');
    expect(firstGCCE.unregisterCommandsForPlugin).toHaveBeenCalledWith('streamalchemy');
    expect(firstGCCE.unregisterRawResponseHandlerForPlugin).toHaveBeenCalledWith('streamalchemy');
    expect(secondGCCE.registerCommandsForPlugin).toHaveBeenCalledTimes(1);
    expect(secondGCCE.registerRawResponseHandlerForPlugin).toHaveBeenCalledTimes(1);

    api.pluginLoader.loadedPlugins.delete('gcce');
    pluginEvents.emit('plugin:unloaded', 'gcce');
    await chat({ uniqueId: 'fallback-user-2', nickname: 'Fallback User 2', comment: '/eier' });
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
    expect(secondGCCE.unregisterRawResponseHandlerForPlugin).toHaveBeenCalledWith('streamalchemy');
  });

  test('blocks direct fallback when available GCCE only partially registers commands', async () => {
    const gcce = createGCCE('!');
    gcce.registerCommandsForPlugin.mockImplementationOnce((pluginId, commands) => {
      gcce.definitions.set(commands[0].name, commands[0]);
      return {
        pluginId,
        registered: [commands[0].name],
        failed: commands.slice(1).map(command => command.name)
      };
    });
    const { api, events, emitted, routes } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const progression = jest.spyOn(plugin.streamMonstersProgression, 'recordCommand');

    await events.find(entry => entry.event === 'chat').handler({
      uniqueId: 'viewer-a',
      nickname: 'Viewer A',
      comment: '!eier'
    });

    const stateRoute = routes.find(route => route.method === 'GET' && route.path === '/api/streammonsters/state');
    let state = null;
    stateRoute.handler({ query: {} }, { json: payload => { state = payload; } });
    expect(state.gcce).toEqual({
      commandPrefix: '!',
      registrationState: 'blocked',
      registrationError: 'partial_registration',
      commandsRegistered: false
    });
    expect(gcce.definitions.size).toBe(0);
    expect(progression).not.toHaveBeenCalled();
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toEqual([]);
    await plugin.destroy();
  });

  test('recovers a blocked partial registration on GCCE reload without double processing', async () => {
    const gcce = createGCCE('!');
    gcce.registerCommandsForPlugin.mockImplementationOnce((pluginId, commands) => ({
      pluginId,
      registered: [],
      failed: commands.map(command => command.name)
    }));
    const { api, events, emitted, pluginEvents, routes } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    pluginEvents.emit('plugin:reloaded', 'gcce');
    const progression = jest.spyOn(plugin.streamMonstersProgression, 'recordCommand');
    await gcce.definitions.get('eier').handler([], {
      userId: 'viewer-a',
      username: 'Viewer A'
    });
    await events.find(entry => entry.event === 'chat').handler({
      uniqueId: 'viewer-a',
      nickname: 'Viewer A',
      comment: '!eier'
    });

    const stateRoute = routes.find(route => route.method === 'GET' && route.path === '/api/streammonsters/state');
    let state = null;
    stateRoute.handler({ query: {} }, { json: payload => { state = payload; } });
    expect(state.gcce).toEqual({
      commandPrefix: '!',
      registrationState: 'active',
      registrationError: null,
      commandsRegistered: true
    });
    expect(progression).toHaveBeenCalledTimes(1);
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toHaveLength(1);
    await plugin.destroy();
  });

  test('uses the configured GCCE prefix for fallback when GCCE is disabled', async () => {
    const gcce = createGCCE('/', false);
    const { api, events, emitted } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    await events.find(entry => entry.event === 'chat').handler({
      uniqueId: 'viewer-a',
      nickname: 'Viewer A',
      comment: '/eier'
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

    await chat({ uniqueId: 'viewer-a', comment: '!eier' });
    await chat({ uniqueId: 'viewer-b', comment: '!eier' });
    now += 251;
    await chat({ uniqueId: 'viewer-a', comment: '!eier' });
    now += 750;
    await chat({ uniqueId: 'viewer-a', comment: '!eier' });

    expect(progression).toHaveBeenCalledTimes(2);
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result').map(entry => entry.payload.result.status)).toEqual([
      'eggs',
      'global_cooldown',
      'cooldown',
      'eggs'
    ]);
    await plugin.destroy();
  });

  test('validates fallback !monster and !choose arguments before progression side effects', async () => {
    const { api, events, emitted } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const progression = jest.spyOn(plugin.streamMonstersProgression, 'recordCommand');
    const chat = events.find(entry => entry.event === 'chat').handler;

    await chat({ uniqueId: 'viewer-a', nickname: 'Viewer A', comment: '!monster' });
    await chat({ uniqueId: 'viewer-b', nickname: 'Viewer B', comment: '!choose' });

    expect(progression).not.toHaveBeenCalled();
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          userId: 'viewer-a',
          command: 'monster',
          result: expect.objectContaining({
            status: 'invalid_arguments',
            errorCode: 'VALIDATION_ERROR'
          })
        })
      }),
      expect.objectContaining({
        payload: expect.objectContaining({
          userId: 'viewer-b',
          command: 'choose',
          result: expect.objectContaining({
            status: 'invalid_arguments',
            errorCode: 'VALIDATION_ERROR'
          })
        })
      })
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
      commandName: 'eier',
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

  test('translates owned validation, permission and rate-limit rejections exactly once', async () => {
    const gcce = createGCCE('!');
    const { api, emitted, pluginEvents } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const rejections = [
      {
        error: 'Missing arguments.',
        errorCode: 'VALIDATION_ERROR',
        commandName: 'monster',
        userId: 'viewer-a',
        username: 'Viewer A'
      },
      {
        error: 'Permission denied.',
        errorCode: 'PERMISSION_DENIED',
        commandName: 'choose',
        userId: 'viewer-b',
        username: 'Viewer B'
      },
      {
        error: 'Rate limit exceeded.',
        errorCode: 'RATE_LIMIT_USER',
        commandName: 'eier',
        userId: 'viewer-c',
        username: 'Viewer C'
      }
    ];
    rejections.forEach(rejection => pluginEvents.emit('gcce:command_result', {
      ...rejection,
      success: false,
      pluginId: 'streamalchemy'
    }));
    pluginEvents.emit('gcce:command_result', {
      ...rejections[0],
      success: false,
      pluginId: 'another-plugin'
    });

    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result').map(entry => entry.payload)).toEqual([
      expect.objectContaining({
        userId: 'viewer-a',
        command: 'monster',
        result: expect.objectContaining({ status: 'invalid_arguments', errorCode: 'VALIDATION_ERROR' })
      }),
      expect.objectContaining({
        userId: 'viewer-b',
        command: 'choose',
        result: expect.objectContaining({ status: 'permission_denied', errorCode: 'PERMISSION_DENIED' })
      }),
      expect.objectContaining({
        userId: 'viewer-c',
        command: 'eier',
        result: expect.objectContaining({ status: 'rate_limited', errorCode: 'RATE_LIMIT_USER' })
      })
    ]);
    await plugin.destroy();
  });

  test('translates owned disabled and GCCE handler failures exactly once', async () => {
    const gcce = createGCCE('!');
    const { api, emitted, pluginEvents } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    pluginEvents.emit('gcce:command_result', {
      success: false,
      error: 'Command is disabled.',
      errorCode: 'COMMAND_DISABLED',
      commandName: 'eier',
      pluginId: 'streamalchemy',
      userId: 'viewer-a',
      username: 'Viewer A'
    });
    pluginEvents.emit('gcce:command_result', {
      success: false,
      error: 'Command failed: handler exploded.',
      errorCode: 'EXECUTION_FAILED',
      commandName: 'battle',
      pluginId: 'streamalchemy',
      userId: 'viewer-b',
      username: 'Viewer B'
    });

    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result').map(entry => entry.payload)).toEqual([
      expect.objectContaining({
        userId: 'viewer-a',
        command: 'eier',
        transport: 'gcce',
        result: expect.objectContaining({
          status: 'command_disabled',
          errorCode: 'COMMAND_DISABLED'
        })
      }),
      expect.objectContaining({
        userId: 'viewer-b',
        command: 'battle',
        transport: 'gcce',
        result: expect.objectContaining({
          status: 'execution_failed',
          errorCode: 'EXECUTION_FAILED'
        })
      })
    ]);
    await plugin.destroy();
  });

  test('returns and emits one execution failure when the fallback domain handler throws', async () => {
    const { api, emitted } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    plugin.streamMonstersCommandIngress.execute = jest.fn().mockRejectedValue(new Error('handler exploded'));

    await expect(plugin.handleStreamMonstersChat({
      uniqueId: 'viewer-a',
      nickname: 'Viewer A',
      comment: '!eier'
    })).resolves.toEqual(expect.objectContaining({
      success: false,
      status: 'execution_failed',
      errorCode: 'EXECUTION_FAILED',
      message: expect.stringContaining('handler exploded')
    }));

    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          userId: 'viewer-a',
          command: 'eier',
          transport: 'fallback',
          result: expect.objectContaining({
            status: 'execution_failed',
            errorCode: 'EXECUTION_FAILED'
          })
        })
      })
    ]);
    await plugin.destroy();
  });

  test('publishes one result when a real GCCE Stream Monsters handler throws', async () => {
    const { api, emitted, pluginEvents } = createApi();
    api.pluginLoader.emit = (event, payload) => pluginEvents.emit(event, payload);
    api.registerSocket = jest.fn();
    api.registerFlowAction = jest.fn();
    api.registerIFTTTAction = jest.fn();
    api.getSocketIO = () => ({ emit: jest.fn() });
    api.pluginDir = require('path').join(process.cwd(), 'plugins', 'gcce');
    const gcce = new GCCE(api);
    await gcce.init();
    api.pluginLoader.loadedPlugins.set('gcce', { instance: gcce });
    api.pluginDir = require('path').join(process.cwd(), 'plugins', 'streamalchemy');
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    plugin.streamMonstersCommandIngress.execute = jest.fn().mockRejectedValue(new Error('handler exploded'));
    const publishedResults = [];
    pluginEvents.on('gcce:command_result', payload => publishedResults.push(payload));
    emitted.length = 0;

    await gcce.handleChatMessage({
      comment: `${gcce.parser.commandPrefix}eier`,
      uniqueId: 'viewer-a',
      nickname: 'Viewer A'
    });

    expect(publishedResults).toEqual([
      expect.objectContaining({
        success: false,
        errorCode: 'EXECUTION_FAILED',
        commandName: 'eier',
        pluginId: 'streamalchemy',
        userId: 'viewer-a'
      })
    ]);
    expect(emitted.filter(entry => entry.event === 'streammonsters:chat_result')).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          userId: 'viewer-a',
          command: 'eier',
          transport: 'gcce',
          result: expect.objectContaining({
            status: 'execution_failed',
            errorCode: 'EXECUTION_FAILED'
          })
        })
      })
    ]);

    await plugin.destroy();
    await gcce.destroy();
  });
});
