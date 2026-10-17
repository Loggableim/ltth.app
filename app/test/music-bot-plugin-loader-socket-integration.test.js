const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const PluginLoader = require('../modules/plugin-loader');
const MusicBotPlugin = require('../plugins/music-bot/main');

const MUTATION_EVENTS = [
  'musicbot:dashboard-skip',
  'musicbot:dashboard-volume',
  'musicbot:dashboard-pause',
  'musicbot:dashboard-resume'
];

function createMemorySocket(handshake) {
  const listeners = new Map();
  const outgoing = [];
  return {
    handshake,
    outgoing,
    on(event, listener) {
      const eventListeners = listeners.get(event) || [];
      eventListeners.push(listener);
      listeners.set(event, eventListeners);
      return this;
    },
    removeListener(event, listener) {
      const eventListeners = listeners.get(event) || [];
      listeners.set(event, eventListeners.filter((registered) => registered !== listener));
      return this;
    },
    listeners(event) {
      return [...(listeners.get(event) || [])];
    },
    listenerCount(event) {
      return (listeners.get(event) || []).length;
    },
    emit(event, ...args) {
      outgoing.push({ event, args });
      return true;
    },
    async receive(event, ...args) {
      for (const listener of this.listeners(event)) {
        await listener(...args);
      }
    }
  };
}

function createLoaderSocketFixture() {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const handshake = {
    headers: { 'x-fixture-header': 'handshake-preserved' },
    address: '127.0.0.1',
    auth: { role: 'admin' }
  };
  const socket = createMemorySocket(handshake);
  const io = { sockets: { sockets: new Map([['fixture-socket', socket]]) } };
  const loader = Object.create(PluginLoader.prototype);
  loader.io = io;
  loader.logger = logger;
  loader.plugins = new Map();
  loader.pluginRouters = new Map();
  loader.pluginConnectionHandlers = new Map();
  loader._pluginUnloadTails = new Map();

  const createPlugin = ({ actualDestroy = false } = {}) => {
    const api = new PluginLoader.PluginAPI(
      'music-bot',
      'fixture-plugin-directory',
      {},
      io,
      {},
      logger,
      loader,
      {}
    );
    const plugin = actualDestroy ? new MusicBotPlugin(api) : Object.create(MusicBotPlugin.prototype);
    plugin.api = api;
    plugin._isSafetyLocked = jest.fn(() => false);
    plugin._skipCurrent = jest.fn().mockResolvedValue(true);
    plugin._applySerializedConfigPatch = jest.fn().mockResolvedValue(undefined);
    plugin.playbackEngine = {
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined)
    };
    plugin._emitPaused = jest.fn();
    plugin._emitResumed = jest.fn();
    if (actualDestroy) {
      plugin._cancelNextSongVote = jest.fn();
      plugin._stopPlaybackSync = jest.fn();
      plugin._clearCrossfadeTimer = jest.fn();
      plugin._invalidateRadioPrefetch = jest.fn();
      plugin._cleanupDuckingHooks = jest.fn();
      plugin._stopPrecacheTasks = jest.fn().mockResolvedValue(undefined);
      plugin._drainOperations = jest.fn().mockResolvedValue(undefined);
      plugin.queueManager = {
        persistQueue: jest.fn(() => ({ success: true, blocked: false, count: 0 })),
        restoreQueue: jest.fn(() => ({ restored: 0, deduped: 0, banned: 0 })),
        getPersistenceStatus: jest.fn(() => ({ blocked: false }))
      };
      plugin.mediaCache = { destroy: jest.fn().mockResolvedValue(undefined) };
      plugin.musicResolver = { destroy: jest.fn().mockResolvedValue(undefined) };
      plugin.playlistImports = { destroy: jest.fn().mockResolvedValue(undefined) };
      plugin.radioSupervisor = { destroy: jest.fn() };
      plugin.autoDJ = { deactivate: jest.fn() };
      plugin.playbackEngine.removeAllListeners = jest.fn();
      plugin.playbackEngine.shutdown = jest.fn().mockResolvedValue(undefined);
    }
    loader.plugins.set('music-bot', { api, instance: plugin });
    plugin._registerSocketEvents();
    return plugin;
  };

  return { createPlugin, handshake, loader, logger, socket };
}

describe('Music Bot Socket.IO PluginLoader integration', () => {
  const originalLtthToken = process.env.LTTH_ADMIN_TOKEN;
  const originalAdminToken = process.env.ADMIN_TOKEN;

  afterEach(() => {
    if (originalLtthToken === undefined) delete process.env.LTTH_ADMIN_TOKEN;
    else process.env.LTTH_ADMIN_TOKEN = originalLtthToken;
    if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = originalAdminToken;
  });

  test('preserves Socket.IO handshake identity through binding and executes one mutation', async () => {
    delete process.env.LTTH_ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const { createPlugin, handshake, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin();
    const originalGate = plugin._requireDashboardSocketAdmin.bind(plugin);
    plugin._requireDashboardSocketAdmin = jest.fn((receivedSocket, eventName) => {
      expect(receivedSocket).toBe(socket);
      expect(receivedSocket.handshake).toBe(handshake);
      expect(receivedSocket.handshake.headers).toBe(handshake.headers);
      expect(receivedSocket.handshake.address).toBe('127.0.0.1');
      expect(receivedSocket.handshake.auth).toBe(handshake.auth);
      return originalGate(receivedSocket, eventName);
    });

    loader.registerPluginSocketEvents(socket);
    loader.attachPluginToConnectedClients('music-bot');
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(1);
    await socket.receive('musicbot:dashboard-pause');

    expect(plugin._requireDashboardSocketAdmin).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.pause).toHaveBeenCalledTimes(1);
    expect(socket.outgoing).toEqual([]);
  });

  test('unregister and reload leave one active handler and no stale mutation', async () => {
    delete process.env.LTTH_ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const oldPlugin = createPlugin();
    const oldApi = oldPlugin.api;

    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(1);
    oldApi.unregisterAll();
    loader.plugins.delete('music-bot');
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);

    const reloadedPlugin = createPlugin();
    loader.registerPluginSocketEvents(socket);
    loader.attachPluginToConnectedClients('music-bot');
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(1);
    await socket.receive('musicbot:dashboard-pause');

    expect(oldPlugin.playbackEngine.pause).not.toHaveBeenCalled();
    expect(reloadedPlugin.playbackEngine.pause).toHaveBeenCalledTimes(1);
    expect(socket.outgoing).toEqual([]);

    reloadedPlugin.api.unregisterAll();
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
  });

  test('successful destroy unbinds socket handlers before removing the plugin owner', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin();
    plugin.destroy = jest.fn().mockResolvedValue(undefined);

    expect(await loader.unloadPlugin('music-bot')).toBe(true);

    expect(plugin.destroy).toHaveBeenCalledTimes(1);
    expect(loader.plugins.has('music-bot')).toBe(false);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
    await socket.receive('musicbot:dashboard-pause');
    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();
  });

  test('failed normal destroy still unbinds handlers and removes its plugin owner', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin();
    plugin.destroy = jest.fn().mockRejectedValue(new Error('fixture normal-unload failure'));

    expect(await loader.unloadPlugin('music-bot')).toBe(false);

    expect(plugin.destroy).toHaveBeenCalledTimes(1);
    expect(loader.plugins.has('music-bot')).toBe(false);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
    await socket.receive('musicbot:dashboard-pause');
    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();
  });

  test('application-shutdown retry retains one owner but no active handlers until cleanup succeeds', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin();
    plugin.destroy = jest.fn()
      .mockRejectedValueOnce(new Error('fixture shutdown cleanup pending'))
      .mockResolvedValueOnce(undefined);

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(false);
    expect(loader.plugins.get('music-bot').api).toBe(plugin.api);
    expect(loader.plugins.get('music-bot').instance).toBe(plugin);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
    await socket.receive('musicbot:dashboard-pause');
    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(true);
    expect(plugin.destroy).toHaveBeenCalledTimes(2);
    expect(loader.plugins.has('music-bot')).toBe(false);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
    await socket.receive('musicbot:dashboard-pause');
    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();
  });

  test('real MusicBotPlugin destroy unbinds sockets and removes the owner after success', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    const destroy = jest.spyOn(plugin, 'destroy');

    expect(await loader.unloadPlugin('music-bot')).toBe(true);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(plugin.cleanupPending).toBe(false);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    expect(loader.plugins.has('music-bot')).toBe(false);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
    await socket.receive('musicbot:dashboard-pause');
    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();
  });

  test('normal unload retries a transient write failure before releasing the queue owner', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    const queuedSong = { id: 'normal-unload-pending-song', title: 'Pending song' };
    plugin.queueManager.queue = [queuedSong];
    plugin.queueManager.persistQueue
      .mockReturnValueOnce({ success: false, blocked: false, error: 'fixture write failure' })
      .mockImplementationOnce(() => {
        expect(loader.plugins.get('music-bot').instance).toBe(plugin);
        return { success: true, blocked: false, count: 1 };
      });
    const destroy = jest.spyOn(plugin, 'destroy');

    expect(await loader.unloadPlugin('music-bot')).toBe(true);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(plugin.cleanupPending).toBe(false);
    expect(plugin._queuePersistedOnDestroy).toBe(true);
    expect(plugin.queueManager.queue).toEqual([queuedSong]);
    expect(loader.plugins.has('music-bot')).toBe(false);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(2);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
  });

  test('Socket removeListener failure retains only the failed binding for retry without repeating destroy', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    const owner = loader.plugins.get('music-bot');
    const destroy = jest.spyOn(plugin, 'destroy');
    const queuedSong = { id: 'socket-unregister-queue-song', title: 'Queue survives listener retry' };
    plugin.queueManager.queue = [queuedSong];
    const eventName = 'fixture:partial-socket-unregister';
    plugin.api.registerSocket(eventName, jest.fn());
    const eventEntry = plugin.api.registeredSocketEvents.find((entry) => entry.event === eventName);
    const secondSocket = createMemorySocket({ address: '127.0.0.2', auth: { role: 'admin' } });
    loader.attachSocketEvent(plugin.api, secondSocket, eventName, eventEntry.callback);
    const removePrimary = socket.removeListener.bind(socket);
    let failedTargetRemoval = false;
    const removePrimarySpy = jest.spyOn(socket, 'removeListener').mockImplementation((event, callback) => {
      if (event === eventName && !failedTargetRemoval) {
        failedTargetRemoval = true;
        throw new Error('fixture socket remove failure');
      }
      return removePrimary(event, callback);
    });
    expect(socket.listenerCount(eventName)).toBe(1);
    expect(secondSocket.listenerCount(eventName)).toBe(1);
    expect(await loader.unloadPlugin('music-bot')).toBe(false);

    expect(loader.plugins.get('music-bot')).toBe(owner);
    expect(plugin.queueManager.queue).toEqual([queuedSong]);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount(eventName)).toBe(1);
    expect(secondSocket.listenerCount(eventName)).toBe(0);
    expect(Array.from(eventEntry.bindings.keys())).toEqual([socket]);

    expect(await loader.unloadPlugin('music-bot')).toBe(true);
    expect(loader.plugins.has('music-bot')).toBe(false);
    expect(plugin.queueManager.queue).toEqual([queuedSong]);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount(eventName)).toBe(0);
    expect(secondSocket.listenerCount(eventName)).toBe(0);
    expect(eventEntry.bindings.size).toBe(0);
    expect(removePrimarySpy.mock.calls.filter(([event]) => event === eventName)).toHaveLength(2);
  });

  test('inactive connection handler cannot bind a new socket while failed raw-listener cleanup awaits retry', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin();
    const owner = loader.plugins.get('music-bot');
    let holdOwner = true;
    plugin.destroy = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(plugin, 'cleanupPending', {
      configurable: true,
      get: () => holdOwner
    });
    const staleSideEffect = jest.fn();
    const staleEvent = 'fixture:raw-connection-event';
    plugin.api.registerSocketConnection((connectedSocket) => {
      connectedSocket.on(staleEvent, staleSideEffect);
    });
    const connectionHandlers = loader.pluginConnectionHandlers.get('music-bot');
    const staleHandler = Array.from(connectionHandlers)[0];
    const originalRemoveListener = socket.removeListener.bind(socket);
    let failOnce = true;
    jest.spyOn(socket, 'removeListener').mockImplementation((event, listener) => {
      if (event === staleEvent && failOnce) {
        failOnce = false;
        throw new Error('fixture raw connection listener remove failure');
      }
      return originalRemoveListener(event, listener);
    });
    const destroy = plugin.destroy;

    expect(socket.listenerCount(staleEvent)).toBe(1);
    expect(await loader.unloadPlugin('music-bot')).toBe(false);
    expect(loader.plugins.get('music-bot')).toBe(owner);
    expect(staleHandler.active).toBe(false);
    expect(socket.listenerCount(staleEvent)).toBe(1);

    const newSocket = createMemorySocket({ address: '127.0.0.3', auth: { role: 'admin' } });
    loader.io.sockets.sockets.set('fixture-new-socket', newSocket);
    loader.registerPluginSocketEvents(newSocket);
    expect(newSocket.listenerCount(staleEvent)).toBe(0);
    newSocket.emit(staleEvent);
    expect(staleSideEffect).not.toHaveBeenCalled();

    holdOwner = false;
    expect(await loader.unloadPlugin('music-bot')).toBe(true);
    expect(loader.plugins.has('music-bot')).toBe(false);
    expect(socket.listenerCount(staleEvent)).toBe(1);
    expect(loader.pluginConnectionHandlers.has('music-bot')).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);

    const newPlugin = createPlugin();
    const freshSideEffect = jest.fn();
    newPlugin.api.registerSocketConnection((connectedSocket) => {
      connectedSocket.on('fixture:new-owner-event', freshSideEffect);
    });
    const freshHandler = Array.from(loader.pluginConnectionHandlers.get('music-bot'))[0];
    expect(freshHandler.active).toBe(true);
    expect(socket.listenerCount('fixture:new-owner-event')).toBe(1);
    expect(newSocket.listenerCount('fixture:new-owner-event')).toBe(1);
    socket.listeners('fixture:new-owner-event')[0]();
    newSocket.listeners('fixture:new-owner-event')[0]();
    expect(freshSideEffect).toHaveBeenCalledTimes(2);
  });

  test('PluginAPI.unregisterAll returns errors and retains only bindings that still need removal', () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin();
    const eventName = 'fixture:unregister-all-partial';
    plugin.api.registerSocket(eventName, jest.fn());
    const eventEntry = plugin.api.registeredSocketEvents.find((entry) => entry.event === eventName);
    const secondSocket = createMemorySocket({ address: '127.0.0.2', auth: { role: 'admin' } });
    loader.attachSocketEvent(plugin.api, secondSocket, eventName, eventEntry.callback);
    const removePrimary = socket.removeListener.bind(socket);
    let failOnce = true;
    jest.spyOn(socket, 'removeListener').mockImplementation((event, callback) => {
      if (event === eventName && failOnce) {
        failOnce = false;
        throw new Error('fixture socket unregister failure');
      }
      return removePrimary(event, callback);
    });

    const errors = plugin.api.unregisterAll();

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('fixture socket unregister failure');
    expect(socket.listenerCount(eventName)).toBe(1);
    expect(secondSocket.listenerCount(eventName)).toBe(0);
    expect(Array.from(eventEntry.bindings.keys())).toEqual([socket]);

    expect(plugin.api.unregisterAll()).toEqual([]);
    expect(socket.listenerCount(eventName)).toBe(0);
    expect(eventEntry.bindings.size).toBe(0);
    expect(plugin.api.registeredSocketEvents).toHaveLength(0);
  });

  test('TikTok removeListener failure retains the callback and retries without losing queue state', async () => {
    const { createPlugin, loader } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    const owner = loader.plugins.get('music-bot');
    const queuedSong = { id: 'tiktok-unregister-queue-song', title: 'Queue survives TikTok retry' };
    plugin.queueManager.queue = [queuedSong];
    const tiktok = new EventEmitter();
    const eventCallback = jest.fn();
    loader.tiktok = tiktok;
    plugin.api.tiktok = tiktok;
    plugin.api.registerTikTokEvent('chat', eventCallback);
    loader.registerPluginTikTokEvents(tiktok, 'music-bot');
    const registeredCallback = plugin.api.registeredTikTokEvents[0].callback;
    const removeListener = tiktok.removeListener.bind(tiktok);
    const removeListenerSpy = jest.spyOn(tiktok, 'removeListener')
      .mockImplementationOnce(() => { throw new Error('fixture TikTok remove failure'); })
      .mockImplementation((event, callback) => removeListener(event, callback));
    const destroy = jest.spyOn(plugin, 'destroy');

    expect(tiktok.listenerCount('chat')).toBe(1);
    expect(await loader.unloadPlugin('music-bot')).toBe(false);

    expect(loader.plugins.get('music-bot')).toBe(owner);
    expect(plugin.queueManager.queue).toEqual([queuedSong]);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(tiktok.listenerCount('chat')).toBe(1);
    expect(plugin.api.registeredTikTokEvents).toEqual([
      { event: 'chat', callback: registeredCallback }
    ]);
    tiktok.emit('chat', {});
    expect(eventCallback).not.toHaveBeenCalled();

    expect(await loader.unloadPlugin('music-bot')).toBe(true);
    expect(loader.plugins.has('music-bot')).toBe(false);
    expect(tiktok.listenerCount('chat')).toBe(0);
    expect(plugin.api.registeredTikTokEvents).toHaveLength(0);
    expect(plugin.queueManager.queue).toEqual([queuedSong]);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(removeListenerSpy).toHaveBeenCalledTimes(2);
  });

  test('normal unload retries blocked queue restore until verified persistence before release', async () => {
    const { createPlugin, loader } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    const queuedSong = { id: 'normal-unload-blocked-song', title: 'Blocked song', requestedBy: 'fixture-viewer' };
    plugin.queueManager.queue = [queuedSong];
    plugin.queueManager.persistQueue
      .mockReturnValueOnce({ success: false, blocked: true, reason: 'restore-read-failed' })
      .mockReturnValueOnce({ success: false, blocked: true, reason: 'restore-read-failed' })
      .mockReturnValueOnce({ success: true, blocked: false, count: 1 });
    plugin.queueManager.restoreQueue
      .mockReturnValueOnce({ error: 'restore-read-failed', persistenceBlocked: true })
      .mockImplementationOnce(({ isAllowed }) => {
        expect(isAllowed(queuedSong)).toBe(true);
        return { restored: 1, deduped: 0, banned: 0 };
      });
    plugin.queueManager.getPersistenceStatus
      .mockReturnValueOnce({ blocked: true })
      .mockReturnValueOnce({ blocked: false });
    plugin._checkBans = jest.fn(() => false);

    expect(await loader.unloadPlugin('music-bot')).toBe(true);
    expect(plugin.cleanupPending).toBe(false);
    expect(plugin.queueManager.queue).toEqual([queuedSong]);
    expect(plugin._queuePersistedOnDestroy).toBe(true);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(3);
    expect(plugin.queueManager.restoreQueue).toHaveBeenCalledTimes(2);
    expect(plugin.queueManager.getPersistenceStatus).toHaveBeenCalledTimes(2);
    expect(plugin._checkBans).toHaveBeenCalledWith(queuedSong, 'fixture-viewer');
    expect(loader.plugins.has('music-bot')).toBe(false);
  });

  test('deletePlugin does not mutate installation files when an active owner refuses unload', async () => {
    const { createPlugin, loader } = createLoaderSocketFixture();
    const plugin = createPlugin();
    loader.pluginsDir = path.join(__dirname, 'fixture-plugins-root');
    loader.resolvePluginInstallation = jest.fn(() => ({
      path: path.join(loader.pluginsDir, 'music-bot')
    }));
    loader.unloadPlugin = jest.fn().mockResolvedValue(false);
    const removeSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {
      throw new Error('Unexpected filesystem deletion in mock-only Music Bot test');
    });

    try {
      expect(await loader.deletePlugin('music-bot')).toBe(false);
      expect(loader.unloadPlugin).toHaveBeenCalledWith('music-bot');
      expect(loader.plugins.get('music-bot').instance).toBe(plugin);
      expect(removeSpy).not.toHaveBeenCalled();
    } finally {
      removeSpy.mockRestore();
    }
  });

  test('application-shutdown retries a thrown queue write before finalization', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    plugin.queueManager.persistQueue
      .mockImplementationOnce(() => { throw new Error('fixture queue persistence failure'); })
      .mockImplementation(() => ({ success: true, blocked: false, count: 0 }));
    const destroy = jest.spyOn(plugin, 'destroy');
    plugin._pendingRequests.add('pending-request-fixture');

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(true);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(plugin.cleanupPending).toBe(false);
    expect(plugin._pendingRequests.size).toBe(0);
    expect(loader.plugins.has('music-bot')).toBe(false);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(2);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
  });

  test('application-shutdown retries transient queue persistence result failures in the same pending shutdown', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    plugin.queueManager.persistQueue
      .mockReturnValueOnce({ success: false, blocked: false, error: 'fixture transient write failure' })
      .mockReturnValueOnce({ success: true, blocked: false, count: 0 });
    const destroy = jest.spyOn(plugin, 'destroy');
    plugin._pendingRequests.add('pending-request-fixture');

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(plugin.cleanupPending).toBe(false);
    expect(plugin._pendingRequests.size).toBe(0);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(2);
    expect(loader.plugins.has('music-bot')).toBe(false);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
  });

  test('application-shutdown keeps blocked queue owner pending until restore and persistence succeed', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    const pendingSong = { id: 'pending-queue-fixture', requestedBy: 'viewer-fixture' };
    plugin.queueManager.queue = [pendingSong];
    plugin.queueManager._persistenceGuard = { blocked: true };
    plugin.queueManager.persistQueue
      .mockReturnValueOnce({ success: false, blocked: true, reason: 'restore-decode-failed' })
      .mockReturnValueOnce({ success: false, blocked: true, reason: 'restore-read-failed' })
      .mockReturnValueOnce({ success: true, blocked: false, count: 1 });
    plugin.queueManager.getPersistenceStatus
      .mockReturnValueOnce({ blocked: true })
      .mockReturnValueOnce({ blocked: false });
    plugin.queueManager.restoreQueue
      .mockReturnValueOnce({ restored: 0, error: 'restore-decode-failed', persistenceBlocked: true })
      .mockImplementationOnce(({ isAllowed }) => {
        expect(isAllowed(pendingSong)).toBe(true);
        plugin.queueManager._persistenceGuard.blocked = false;
        return { restored: 1, deduped: 0, banned: 0 };
      });
    plugin._checkBans = jest.fn(() => false);

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(true);
    expect(plugin.cleanupPending).toBe(false);
    expect(plugin.queueManager.queue).toEqual([pendingSong]);
    expect(plugin._queuePersistedOnDestroy).toBe(true);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(3);
    expect(plugin.queueManager.restoreQueue).toHaveBeenCalledTimes(2);
    expect(plugin.queueManager.getPersistenceStatus).toHaveBeenCalledTimes(2);
    expect(plugin.queueManager.restoreQueue.mock.calls[0][0]).toEqual({ isAllowed: expect.any(Function) });
    expect(plugin._checkBans).toHaveBeenCalledWith(pendingSong, 'viewer-fixture');
    expect(loader.plugins.has('music-bot')).toBe(false);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
  });

  test('real application-shutdown destroy retains owner for cleanup retry but removes socket listeners', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    const shutdownError = new Error('fixture playback cleanup pending');
    plugin.playbackEngine.shutdown = jest.fn()
      .mockRejectedValueOnce(shutdownError)
      .mockResolvedValueOnce(undefined);
    const destroy = jest.spyOn(plugin, 'destroy');

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(false);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(plugin.cleanupPending).toBe(true);
    expect(loader.plugins.get('music-bot').instance).toBe(plugin);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
    await socket.receive('musicbot:dashboard-pause');
    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(true);

    expect(destroy).toHaveBeenCalledTimes(2);
    expect(plugin.playbackEngine.shutdown).toHaveBeenCalledTimes(2);
    expect(plugin.cleanupPending).toBe(false);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    expect(loader.plugins.has('music-bot')).toBe(false);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
  });

  test.each([
    ['media cache', (plugin) => plugin.mediaCache],
    ['resolver', (plugin) => plugin.musicResolver],
    ['playlist imports', (plugin) => plugin.playlistImports]
  ])('real application-shutdown retries failed %s cleanup before releasing the owner', async (_label, getCleanupOwner) => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    const cleanupOwner = getCleanupOwner(plugin);
    cleanupOwner.destroy
      .mockRejectedValueOnce(new Error('fixture cleanup pending'))
      .mockResolvedValueOnce(undefined);
    const localListener = jest.fn();
    plugin.on('fixture:cleanup-listener', localListener);
    plugin._pendingRequests.add('pending-request-fixture');
    plugin._requestCredits.set('viewer-fixture', 1);
    plugin._userLikes.set('viewer-fixture', 5);
    const destroy = jest.spyOn(plugin, 'destroy');

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(false);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(plugin.cleanupPending).toBe(true);
    expect(loader.plugins.get('music-bot').instance).toBe(plugin);
    expect(plugin._pendingRequests.has('pending-request-fixture')).toBe(true);
    expect(plugin._requestCredits.get('viewer-fixture')).toBe(1);
    expect(plugin._userLikes.get('viewer-fixture')).toBe(5);
    expect(plugin.listenerCount('fixture:cleanup-listener')).toBe(1);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
    await socket.receive('musicbot:dashboard-pause');
    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(true);

    expect(destroy).toHaveBeenCalledTimes(2);
    expect(cleanupOwner.destroy).toHaveBeenCalledTimes(2);
    expect(plugin.cleanupPending).toBe(false);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    expect(plugin._pendingRequests.size).toBe(0);
    expect(plugin._requestCredits.size).toBe(0);
    expect(plugin._userLikes.size).toBe(0);
    expect(plugin.listenerCount('fixture:cleanup-listener')).toBe(0);
    expect(loader.plugins.has('music-bot')).toBe(false);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
  });

  test.each([
    ['media cache', (plugin) => plugin.mediaCache],
    ['resolver', (plugin) => plugin.musicResolver],
    ['playlist imports', (plugin) => plugin.playlistImports]
  ])('normal unload retries failed %s cleanup before releasing the owner', async (_label, getCleanupOwner) => {
    const { createPlugin, loader } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    const cleanupOwner = getCleanupOwner(plugin);
    cleanupOwner.destroy
      .mockImplementationOnce(() => { throw new Error('fixture normal cleanup pending'); })
      .mockResolvedValueOnce(undefined);

    expect(await loader.unloadPlugin('music-bot')).toBe(false);
    expect(plugin.cleanupPending).toBe(true);
    expect(loader.plugins.get('music-bot').instance).toBe(plugin);
    expect(plugin.queueManager.persistQueue).not.toHaveBeenCalled();

    expect(await loader.unloadPlugin('music-bot')).toBe(true);
    expect(cleanupOwner.destroy).toHaveBeenCalledTimes(2);
    expect(plugin.cleanupPending).toBe(false);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    expect(loader.plugins.has('music-bot')).toBe(false);
  });

  test('application-shutdown does not stop playback while cache cleanup remains pending', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    plugin.mediaCache.destroy
      .mockRejectedValueOnce(new Error('fixture cache cleanup failure one'))
      .mockRejectedValueOnce(new Error('fixture cache cleanup failure two'))
      .mockResolvedValueOnce(undefined);

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(false);
    expect(plugin.cleanupPending).toBe(true);
    expect(loader.plugins.get('music-bot').instance).toBe(plugin);
    expect(plugin.mediaCache.destroy).toHaveBeenCalledTimes(1);
    expect(plugin.musicResolver.destroy).toHaveBeenCalledTimes(1);
    expect(plugin.playlistImports.destroy).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.shutdown).not.toHaveBeenCalled();
    expect(plugin.queueManager.persistQueue).not.toHaveBeenCalled();

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(false);
    expect(plugin.cleanupPending).toBe(true);
    expect(loader.plugins.get('music-bot').instance).toBe(plugin);
    expect(plugin.mediaCache.destroy).toHaveBeenCalledTimes(2);
    expect(plugin.musicResolver.destroy).toHaveBeenCalledTimes(1);
    expect(plugin.playlistImports.destroy).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.shutdown).not.toHaveBeenCalled();
    expect(plugin.queueManager.persistQueue).not.toHaveBeenCalled();

    expect(await loader.unloadPlugin('music-bot', { reason: 'application-shutdown' })).toBe(true);
    expect(plugin.cleanupPending).toBe(false);
    expect(plugin.mediaCache.destroy).toHaveBeenCalledTimes(3);
    expect(plugin.musicResolver.destroy).toHaveBeenCalledTimes(1);
    expect(plugin.playlistImports.destroy).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.shutdown).toHaveBeenCalledTimes(1);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    expect(loader.plugins.has('music-bot')).toBe(false);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
  });

  test('normal playback shutdown failure retains owner and retries cleanup before releasing it', async () => {
    const { createPlugin, loader, socket } = createLoaderSocketFixture();
    const plugin = createPlugin({ actualDestroy: true });
    plugin.playbackEngine.shutdown
      .mockImplementationOnce(() => { throw new Error('fixture normal cleanup failure'); })
      .mockResolvedValueOnce(undefined);
    const destroy = jest.spyOn(plugin, 'destroy');

    expect(await loader.unloadPlugin('music-bot')).toBe(false);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(plugin.cleanupPending).toBe(true);
    expect(loader.plugins.get('music-bot').instance).toBe(plugin);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    for (const event of MUTATION_EVENTS) expect(socket.listenerCount(event)).toBe(0);
    await socket.receive('musicbot:dashboard-pause');
    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();

    expect(await loader.unloadPlugin('music-bot')).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(plugin.playbackEngine.shutdown).toHaveBeenCalledTimes(2);
    expect(plugin.cleanupPending).toBe(false);
    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    expect(loader.plugins.has('music-bot')).toBe(false);
  });

  test.each(['disablePlugin', 'reloadPlugin', 'deletePlugin'])(
    '%s does not create a second owner while normal cleanup keeps failing',
    async (operationName) => {
      const { createPlugin, loader } = createLoaderSocketFixture();
      const plugin = createPlugin({ actualDestroy: true });
      const pluginPath = path.join(__dirname, 'fixture-plugin-installation');
      loader.pluginsDir = path.dirname(pluginPath);
      loader.state = { 'music-bot': { enabled: true, version: 'fixture' } };
      loader.saveState = jest.fn(() => true);
      loader.resolvePluginInstallation = jest.fn(() => ({ path: pluginPath }));
      loader.loadPlugin = jest.fn(async () => ({ instance: {} }));
      plugin.playbackEngine.shutdown.mockRejectedValue(new Error('fixture cleanup remains pending'));

      expect(await loader.unloadPlugin('music-bot')).toBe(false);
      expect(plugin.cleanupPending).toBe(true);

      expect(await loader[operationName]('music-bot')).toBe(false);

      expect(loader.plugins.get('music-bot').instance).toBe(plugin);
      expect(loader.loadPlugin).not.toHaveBeenCalled();
      expect(plugin.playbackEngine.shutdown).toHaveBeenCalledTimes(2);
      expect(plugin.cleanupPending).toBe(true);
    }
  );
});
