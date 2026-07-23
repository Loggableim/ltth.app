const Database = require('better-sqlite3');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');

function createApi({ gcce = null, streamMonstersEnabled = true } = {}) {
  const events = [];
  const routes = [];
  const emitted = [];
  const settings = new Map([['streamalchemy_config', {
    enabled: true,
    streamMonsters: { enabled: streamMonstersEnabled, hatchDurationMs: 1, maxUnhatchedEggs: 3 }
  }]]);
  const sqlite = new Database(':memory:');
  return {
    events,
    routes,
    emitted,
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
      pluginLoader: gcce ? { loadedPlugins: new Map([['gcce', { instance: gcce }]]) } : undefined
    }
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
});
