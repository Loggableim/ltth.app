const Database = require('better-sqlite3');
const { EventEmitter } = require('events');
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
  const pluginEvents = new EventEmitter();
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
  const commands = new Map();
  return {
    pluginConfig: { enabled, commandPrefix },
    parser: { commandPrefix },
    commands,
    unregisterCommandsForPlugin: jest.fn(() => commands.clear()),
    registerCommandsForPlugin: jest.fn((_pluginId, definitions) => {
      definitions.forEach(definition => commands.set(definition.name, definition));
      return {
        registered: definitions.map(definition => definition.name),
        failed: []
      };
    })
  };
}

describe('Stream Monsters plugin integration', () => {
  test('uses Stream Monsters for gifts, chat and new stream sessions without removing the plugin id', async () => {
    const { api, events, emitted } = createApi();
    const plugin = new StreamAlchemyPlugin(api);

    await plugin.init();

    expect(plugin.config.streamMonsters.visualPack).toBe('furry');
    expect(events.map(entry => entry.event)).toEqual(expect.arrayContaining(['gift', 'chat', 'streamSessionStarted']));
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

  test('gives every repeated gift unit a distinct event timestamp', async () => {
    const { api, events } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const processGift = jest.spyOn(plugin.streamMonstersEngine, 'processGift')
      .mockImplementation(() => ({ type: 'spawned' }));

    await events.find(entry => entry.event === 'gift').handler({
      uniqueId: 'viewer-a',
      giftId: 7934,
      giftName: 'Heart Me',
      diamondCount: 1,
      repeatCount: 3
    });

    const timestamps = processGift.mock.calls.map(([input]) => input.eventTimeMs);
    expect(timestamps).toHaveLength(3);
    expect(new Set(timestamps).size).toBe(3);
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
      'POST /api/streammonsters/local-runtime/install'
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
      registerCommandsForPlugin: jest.fn((_pluginId, commands) => ({
        registered: commands.map(command => command.name),
        failed: []
      }))
    };
    const { api } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);

    await plugin.init();

    expect(gcce.unregisterCommandsForPlugin).toHaveBeenCalledWith('streamalchemy');
    expect(gcce.registerCommandsForPlugin).toHaveBeenCalledWith('streamalchemy', expect.arrayContaining([
      expect.objectContaining({ name: 'eggs', permission: 'all' }),
      expect.objectContaining({ name: 'hatch', permission: 'all' }),
      expect.objectContaining({ name: 'battle', permission: 'all' }),
      expect.objectContaining({ name: 'monsterrank', permission: 'all' })
    ]));
    const definitions = gcce.registerCommandsForPlugin.mock.calls[0][1];
    expect(definitions.find(command => command.name === 'eggs').aliases)
      .toEqual(expect.arrayContaining(['eierliste', 'meineeier']));
    expect(definitions.find(command => command.name === 'hatch').aliases)
      .toEqual(expect.arrayContaining(['schluepfen', 'ausbrueten']));
    expect(definitions.find(command => command.name === 'hatch').cooldown.global).toBe(0);
  });

  test('re-registers GCCE with creator-selected aliases after config changes', async () => {
    const gcce = createGCCE('!');
    const { api } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    plugin.updateConfig({
      streamMonsters: {
        commandAliases: {
          eggs: ['eier', 'meineeier'],
          hatch: ['ausbrueten']
        }
      }
    });

    expect(gcce.registerCommandsForPlugin).toHaveBeenCalledTimes(2);
    expect(gcce.commands.get('eggs').aliases).toEqual(['eier', 'meineeier']);
    expect(gcce.commands.get('hatch').aliases).toEqual(['ausbrueten']);
    await plugin.destroy();
  });

  test('does not let a configurable alias shadow a command owned by another GCCE plugin', async () => {
    const gcce = createGCCE('!');
    gcce.registry = {
      getCommand: jest.fn(name => (
        name === 'rank' ? { name: 'rank', pluginId: 'viewer-xp' } : null
      ))
    };
    const { api } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    plugin.updateConfig({
      streamMonsters: {
        commandAliases: {
          rank: ['rank', 'monsterrang']
        }
      }
    });

    expect(gcce.commands.get('monsterrank').aliases).toEqual(['monsterrang']);
    await plugin.destroy();
  });

  test('does not activate GCCE when only part of the command set registers', async () => {
    const gcce = {
      unregisterCommandsForPlugin: jest.fn(),
      registerCommandsForPlugin: jest.fn((_pluginId, commands) => ({
        registered: commands.slice(0, 1).map(command => command.name),
        failed: commands.slice(1).map(command => command.name)
      }))
    };
    const { api, events } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const handle = jest.spyOn(plugin.streamMonstersChatCommands, 'handle');

    await events.find(entry => entry.event === 'chat').handler({
      uniqueId: 'viewer-a',
      comment: '!eggs'
    });

    expect(plugin.streamMonstersGCCE).toBeNull();
    expect(gcce.unregisterCommandsForPlugin).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenCalledTimes(1);
    await plugin.destroy();
  });

  test('switches idempotently across late GCCE load, reload and unload', async () => {
    const { api, events, pluginEvents } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const handle = jest.spyOn(plugin.streamMonstersChatCommands, 'handle');

    await events.find(entry => entry.event === 'chat').handler({
      uniqueId: 'fallback-a',
      comment: '!eggs'
    });

    const firstGCCE = createGCCE('/');
    api.pluginLoader.loadedPlugins.set('gcce', { instance: firstGCCE });
    pluginEvents.emit('plugin:loaded', { id: 'gcce', instance: firstGCCE });
    pluginEvents.emit('plugin:enabled', 'gcce');
    expect(firstGCCE.registerCommandsForPlugin).toHaveBeenCalledTimes(1);
    expect(firstGCCE.commands.get('eggs').syntax).toBe('/eggs');

    const secondGCCE = createGCCE('/');
    api.pluginLoader.loadedPlugins.set('gcce', { instance: secondGCCE });
    pluginEvents.emit('plugin:reloaded', { id: 'gcce', instance: secondGCCE });
    expect(firstGCCE.unregisterCommandsForPlugin).toHaveBeenCalledWith('streamalchemy');
    expect(secondGCCE.registerCommandsForPlugin).toHaveBeenCalledTimes(1);

    api.pluginLoader.loadedPlugins.delete('gcce');
    pluginEvents.emit('plugin:unloaded', 'gcce');
    await events.find(entry => entry.event === 'chat').handler({
      uniqueId: 'fallback-b',
      comment: '/eierliste'
    });

    expect(plugin.streamMonstersGCCE).toBeNull();
    expect(handle).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenLastCalledWith(
      expect.objectContaining({ username: 'fallback-b' }),
      '!eggs'
    );
    await plugin.destroy();
    expect(pluginEvents.eventNames()).toEqual([]);
  });

  test('routes a live hatch command through GCCE exactly once', async () => {
    let registeredCommands = [];
    const gcce = {
      unregisterCommandsForPlugin: jest.fn(),
      registerCommandsForPlugin: jest.fn((_pluginId, commands) => {
        registeredCommands = commands;
        return { registered: commands.map(command => command.name) };
      })
    };
    const { api, events } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const handle = jest.spyOn(plugin.streamMonstersChatCommands, 'handle');

    await events.find(entry => entry.event === 'chat').handler({
      uniqueId: 'viewer-a',
      nickname: 'Viewer A',
      comment: '!hatch 1'
    });
    await registeredCommands.find(command => command.name === 'hatch').handler(
      ['1'],
      { uniqueId: 'viewer-a', username: 'Viewer A', userId: '6992291432863663110' }
    );

    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'viewer-a' }),
      '!hatch 1'
    );
    await plugin.destroy();
  });

  test('uses the normalized TikTok username for GCCE commands when uniqueId is absent from chat events', async () => {
    let registeredCommands = [];
    const gcce = {
      unregisterCommandsForPlugin: jest.fn(),
      registerCommandsForPlugin: jest.fn((_pluginId, commands) => {
        registeredCommands = commands;
        return { registered: commands.map(command => command.name) };
      })
    };
    const { api } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const handle = jest.spyOn(plugin.streamMonstersChatCommands, 'handle');

    await registeredCommands.find(command => command.name === 'hatch').handler([], {
      userId: '6581370319188525062',
      uniqueId: '6581370319188525062',
      username: 'ScharasTheFolf 🇩🇪',
      rawData: {
        username: 'scharasthefolf',
        userId: '6581370319188525062'
      }
    });

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'scharasthefolf' }),
      '!hatch'
    );
    await plugin.destroy();
  });

  test('forwards GCCE command results to the Stream Monsters overlay', async () => {
    let registeredCommands = [];
    const gcce = {
      unregisterCommandsForPlugin: jest.fn(),
      registerCommandsForPlugin: jest.fn((_pluginId, commands) => {
        registeredCommands = commands;
        return { registered: commands.map(command => command.name) };
      })
    };
    const { api, emitted } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    await registeredCommands.find(command => command.name === 'hatch').handler([], {
      userId: '6581370319188525062',
      uniqueId: '6581370319188525062',
      username: 'ScharasTheFolf 🇩🇪',
      rawData: {
        username: 'scharasthefolf',
        userId: '6581370319188525062'
      }
    });

    expect(emitted).toContainEqual({
      event: 'streammonsters:chat_result',
      payload: {
        userId: 'scharasthefolf',
        bottomOverlayDurationMs: 8_000,
        result: expect.objectContaining({
          success: false,
          status: 'egg_not_ready',
          message: expect.any(String)
        })
      }
    });
    await plugin.destroy();
  });

  test('does not apply the domain global cooldown after GCCE already accepted a command', async () => {
    let registeredCommands = [];
    const gcce = {
      unregisterCommandsForPlugin: jest.fn(),
      registerCommandsForPlugin: jest.fn((_pluginId, commands) => {
        registeredCommands = commands;
        return { registered: commands.map(command => command.name) };
      })
    };
    const { api } = createApi({ gcce });
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();
    const eggs = registeredCommands.find(command => command.name === 'eggs');

    await expect(eggs.handler([], { uniqueId: 'viewer-a' }))
      .resolves.toEqual(expect.objectContaining({ status: 'eggs' }));
    await expect(eggs.handler([], { uniqueId: 'viewer-b' }))
      .resolves.toEqual(expect.objectContaining({ status: 'eggs' }));
    await plugin.destroy();
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
