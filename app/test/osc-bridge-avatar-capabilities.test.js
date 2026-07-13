const OSCBridgePlugin = require('../plugins/osc-bridge/main');

describe('OSC-Bridge avatar capability profiles', () => {
  let plugin;
  let api;

  beforeEach(() => {
    api = makeApi();
    plugin = new OSCBridgePlugin(api);
    plugin.config = plugin.getDefaultConfig();
  });

  test('replaces scan-owned fields without overwriting user avatar metadata', async () => {
    plugin.config.avatars = [{
      id: 'saved-profile',
      avatarId: 'avtr_example',
      name: 'My renamed avatar',
      description: 'User description',
      favorite: true,
      availableActions: { standard: { Wave: false } },
      parameterCount: 1,
      detectedAt: 1
    }];

    const availableActions = { standard: { Wave: true }, emotes: {}, gogoloco: {}, physbones: [], custom: [] };
    const result = await plugin.upsertAvatarCapabilities('avtr_example', availableActions, 12);

    expect(result.isNew).toBe(false);
    expect(result.profile).toEqual(expect.objectContaining({
      id: 'saved-profile',
      name: 'My renamed avatar',
      description: 'User description',
      favorite: true,
      availableActions,
      parameterCount: 12,
      detectedAt: expect.any(Number)
    }));
    expect(api.setConfig).toHaveBeenCalledWith('config', plugin.config);
  });

  test('activates and refreshes the profile when the watcher reports an avatar change', async () => {
    const watcher = jest.fn();
    plugin.oscQueryClient = {
      startAvatarWatcher: watcher,
      avatarWatcher: null,
      parameters: new Map([['/avatar/parameters/Celebrate', {}]])
    };
    plugin.avatarStateStore = { setCurrentAvatar: jest.fn() };
    plugin.physBonesController = { onAvatarChanged: jest.fn() };
    plugin.getAvailableActions = jest.fn(() => ({
      standard: { Celebrate: true }, emotes: {}, gogoloco: {}, physbones: [], custom: []
    }));

    plugin.startAvatarCapabilitiesWatcher();
    plugin.startAvatarCapabilitiesWatcher();

    expect(watcher).toHaveBeenCalledTimes(1);
    const callback = watcher.mock.calls[0][1];
    await callback({ id: 'avtr_changed' });

    expect(plugin.activeAvatarProfile).toEqual(expect.objectContaining({
      avatarId: 'avtr_changed',
      parameterCount: 1,
      availableActions: expect.objectContaining({ standard: { Celebrate: true } })
    }));
    expect(api.setConfig).toHaveBeenCalledWith('config', plugin.config);
    expect(api.emit).toHaveBeenCalledWith('osc:avatar-capabilities', expect.objectContaining({
      avatarId: 'avtr_changed',
      profile: expect.objectContaining({ avatarId: 'avtr_changed' })
    }));
  });

  test('blocks an unsupported known helper after a scan but leaves raw OSC unrestricted', () => {
    const routes = new Map();
    api.registerRoute.mockImplementation((method, path, handler) => routes.set(`${method.toLowerCase()} ${path}`, handler));
    plugin.activeAvatarProfile = {
      avatarId: 'avtr_without_wave',
      availableActions: { standard: { Wave: false }, emotes: {}, gogoloco: {}, physbones: [], custom: [] }
    };
    plugin.isRunning = true;
    plugin.sendMessage = jest.fn(() => ({ success: true }));
    plugin.registerRoutes();

    const waveResponse = makeResponse();
    routes.get('post /api/osc/vrchat/wave')({ body: { duration: 500 } }, waveResponse);

    expect(waveResponse.statusCode).toBe(422);
    expect(waveResponse.payload).toEqual(expect.objectContaining({
      success: false,
      error: 'Unsupported by active avatar: wave'
    }));
    expect(plugin.sendMessage).not.toHaveBeenCalled();

    const rawResponse = makeResponse();
    routes.get('post /api/osc/send')({ body: { address: '/avatar/parameters/Custom', args: [1] } }, rawResponse);
    expect(rawResponse.payload.success).toBe(true);
    expect(plugin.sendMessage).toHaveBeenCalledWith('/avatar/parameters/Custom', [1]);
  });

  test('allows legacy helpers before an avatar capability scan', () => {
    const routes = new Map();
    api.registerRoute.mockImplementation((method, path, handler) => routes.set(`${method.toLowerCase()} ${path}`, handler));
    plugin.isRunning = true;
    plugin.sendMessage = jest.fn(() => ({ success: true }));
    plugin.registerRoutes();

    const response = makeResponse();
    routes.get('post /api/osc/vrchat/wave')({ body: {} }, response);

    expect(response.payload.success).toBe(true);
    expect(plugin.sendMessage).toHaveBeenCalledWith('/avatar/parameters/Wave', [1]);
  });

  test('returns the active scanned profile to the avatar capabilities UI route', async () => {
    const routes = new Map();
    api.registerRoute.mockImplementation((method, path, handler) => routes.set(`${method.toLowerCase()} ${path}`, handler));
    plugin.oscQueryClient = { parameters: new Map([['/avatar/parameters/Wave', {}]]) };
    plugin.activeAvatarProfile = {
      avatarId: 'avtr_cached',
      availableActions: { standard: { Wave: false }, emotes: {}, gogoloco: {}, physbones: [], custom: [] }
    };
    plugin.registerRoutes();

    const response = makeResponse();
    await routes.get('get /api/osc/avatar/available-actions')({}, response);

    expect(response.payload).toEqual(expect.objectContaining({
      success: true,
      actions: plugin.activeAvatarProfile.availableActions,
      profile: plugin.activeAvatarProfile
    }));
  });

  test('stops the avatar watcher and clears its marker when the bridge stops', async () => {
    const watcherClient = { stopAvatarWatcher: jest.fn(), disconnect: jest.fn() };
    plugin.oscQueryClient = watcherClient;
    plugin.avatarCapabilitiesWatcherClient = watcherClient;
    plugin.transport.stop = jest.fn().mockResolvedValue({ success: true });

    await plugin.stop();

    expect(watcherClient.stopAvatarWatcher).toHaveBeenCalledTimes(1);
    expect(plugin.avatarCapabilitiesWatcherClient).toBeNull();
  });

  test('stops and clears the old watcher before disabling OSCQuery configuration', async () => {
    const watcherClient = { stopAvatarWatcher: jest.fn(), disconnect: jest.fn() };
    plugin.config.oscQuery = { enabled: true, host: '127.0.0.1', port: 9001 };
    plugin.oscQueryClient = watcherClient;
    plugin.avatarCapabilitiesWatcherClient = watcherClient;

    await plugin.updateConfig({ oscQuery: { enabled: false } });

    expect(watcherClient.stopAvatarWatcher).toHaveBeenCalledTimes(1);
    expect(watcherClient.disconnect).toHaveBeenCalledTimes(1);
    expect(plugin.avatarCapabilitiesWatcherClient).toBeNull();
  });

  test('stops and clears the old watcher before replacing its OSCQuery client', async () => {
    const watcherClient = { stopAvatarWatcher: jest.fn(), disconnect: jest.fn() };
    plugin.config.oscQuery = { enabled: true, host: '127.0.0.1', port: 9001 };
    plugin.oscQueryClient = watcherClient;
    plugin.avatarCapabilitiesWatcherClient = watcherClient;

    await plugin.updateConfig({ oscQuery: { host: '127.0.0.1', port: 9002 } });

    expect(watcherClient.stopAvatarWatcher).toHaveBeenCalledTimes(1);
    expect(watcherClient.disconnect).toHaveBeenCalledTimes(1);
    expect(plugin.avatarCapabilitiesWatcherClient).toBeNull();
  });

  test('ignores a watcher callback after its OSCQuery client is replaced', async () => {
    const startAvatarWatcher = jest.fn();
    const oldClient = { startAvatarWatcher };
    plugin.oscQueryClient = oldClient;
    plugin.startAvatarCapabilitiesWatcher();
    const callback = startAvatarWatcher.mock.calls[0][1];
    plugin.oscQueryClient = { startAvatarWatcher: jest.fn() };
    plugin.refreshAvatarCapabilities = jest.fn().mockResolvedValue({});

    await callback({ id: 'avtr_stale' });

    expect(plugin.refreshAvatarCapabilities).not.toHaveBeenCalled();
  });

  test('blocks unsupported Emote steps in expression combos and queues', async () => {
    const routes = new Map();
    api.registerRoute.mockImplementation((method, path, handler) => routes.set(`${method.toLowerCase()} ${path}`, handler));
    plugin.activeAvatarProfile = {
      avatarId: 'avtr_no_emotes',
      availableActions: { standard: {}, emotes: { Emote0: true }, gogoloco: {}, physbones: [], custom: [] }
    };
    plugin.expressionController = { playCombo: jest.fn(), queueCombo: jest.fn(), comboQueue: [] };
    plugin.registerRoutes();

    for (const path of ['/api/osc/expressions/combo', '/api/osc/expressions/queue']) {
      const response = makeResponse();
      await routes.get(`post ${path}`)({ body: { combo: [{ type: 'Emote', slot: 1 }] } }, response);
      expect(response.statusCode).toBe(422);
      expect(response.payload.error).toBe('Unsupported by active avatar: emote');
    }
    expect(plugin.expressionController.playCombo).not.toHaveBeenCalled();
    expect(plugin.expressionController.queueCombo).not.toHaveBeenCalled();
  });

  test('reports helper failures truthfully for GoGo, PhysBone, and expression triggers', () => {
    const routes = new Map();
    api.registerRoute.mockImplementation((method, path, handler) => routes.set(`${method.toLowerCase()} ${path}`, handler));
    plugin.setGoGoLocoVelocity = jest.fn(() => false);
    plugin.triggerPhysBoneAnimation = jest.fn(() => false);
    plugin.expressionController = { triggerExpression: jest.fn(() => false) };
    plugin.registerRoutes();

    const velocity = makeResponse();
    routes.get('post /api/osc/vrchat/gogoloco/velocity')({ body: { velocity: 0.5 } }, velocity);
    expect(velocity.payload).toEqual(expect.objectContaining({ success: false, error: 'OSC action failed: gogoloco_velocity' }));

    const physbone = makeResponse();
    routes.get('post /api/osc/physbones/trigger')({ body: { boneName: 'Tail', animation: 'wiggle' } }, physbone);
    expect(physbone.payload).toEqual(expect.objectContaining({ success: false, error: 'PhysBone animation failed' }));

    const expression = makeResponse();
    routes.get('post /api/osc/expressions/trigger')({ body: { slot: 0 } }, expression);
    expect(expression.payload).toEqual(expect.objectContaining({ success: false, error: 'Expression trigger failed' }));
  });

  test('persists and activates only the newest queued avatar change from one watcher client', async () => {
    const startAvatarWatcher = jest.fn();
    plugin.oscQueryClient = { startAvatarWatcher, parameters: new Map() };
    plugin.getAvailableActions = jest.fn(() => ({ standard: {}, emotes: {}, gogoloco: {}, physbones: [], custom: [] }));
    plugin.startAvatarCapabilitiesWatcher();
    const callback = startAvatarWatcher.mock.calls[0][1];

    await Promise.all([
      callback({ id: 'avtr_old' }),
      callback({ id: 'avtr_new' })
    ]);

    expect(plugin.activeAvatarProfile).toEqual(expect.objectContaining({ avatarId: 'avtr_new' }));
    expect(plugin.config.avatars).toEqual([expect.objectContaining({ avatarId: 'avtr_new' })]);
    expect(api.setConfig).toHaveBeenCalledTimes(1);
    expect(api.emit).toHaveBeenCalledWith('osc:avatar-capabilities', expect.objectContaining({ avatarId: 'avtr_new' }));
    expect(api.emit).not.toHaveBeenCalledWith('osc:avatar-capabilities', expect.objectContaining({ avatarId: 'avtr_old' }));
  });

  test('lets a newer manual scan intent win over a queued watcher change', async () => {
    const startAvatarWatcher = jest.fn();
    const client = { startAvatarWatcher, parameters: new Map() };
    plugin.oscQueryClient = client;
    plugin.getAvailableActions = jest.fn(() => ({ standard: {}, emotes: {}, gogoloco: {}, physbones: [], custom: [] }));
    plugin.startAvatarCapabilitiesWatcher();
    const watcherCallback = startAvatarWatcher.mock.calls[0][1];

    const watcherChange = watcherCallback({ id: 'avtr_watcher' });
    const manualScan = plugin.queueAvatarCapabilitiesRefresh('avtr_manual', 'manual_scan');
    await Promise.all([manualScan, watcherChange]);

    expect(plugin.activeAvatarProfile).toEqual(expect.objectContaining({ avatarId: 'avtr_manual' }));
    expect(plugin.config.avatars).toEqual([expect.objectContaining({ avatarId: 'avtr_manual' })]);
    expect(api.setConfig).toHaveBeenCalledTimes(1);
    expect(api.emit).toHaveBeenCalledWith('osc:avatar-capabilities', expect.objectContaining({
      avatarId: 'avtr_manual',
      source: 'manual_scan'
    }));
  });

  test('compensates a stale in-flight watcher write so final durable state contains only the newest avatar', async () => {
    const startAvatarWatcher = jest.fn();
    plugin.oscQueryClient = { startAvatarWatcher, parameters: new Map() };
    plugin.getAvailableActions = jest.fn(() => ({ standard: {}, emotes: {}, gogoloco: {}, physbones: [], custom: [] }));
    plugin.startAvatarCapabilitiesWatcher();
    const callback = startAvatarWatcher.mock.calls[0][1];

    let resolveFirstWrite;
    let firstWriteStarted;
    const firstWrite = new Promise(resolve => { resolveFirstWrite = resolve; });
    const writeStarted = new Promise(resolve => { firstWriteStarted = resolve; });
    let durableConfig = null;
    let writeCount = 0;
    api.setConfig.mockImplementation(async (_key, config) => {
      const snapshot = JSON.parse(JSON.stringify(config));
      writeCount++;
      if (writeCount === 1) {
        firstWriteStarted();
        await firstWrite;
      }
      durableConfig = snapshot;
      return true;
    });

    const oldRefresh = callback({ id: 'avtr_old_inflight' });
    await writeStarted;
    const newestRefresh = callback({ id: 'avtr_newest' });
    resolveFirstWrite();
    await Promise.all([oldRefresh, newestRefresh]);

    expect(durableConfig.avatars).toEqual([expect.objectContaining({ avatarId: 'avtr_newest' })]);
    expect(plugin.config.avatars).toEqual([expect.objectContaining({ avatarId: 'avtr_newest' })]);
    expect(plugin.activeAvatarProfile).toEqual(expect.objectContaining({ avatarId: 'avtr_newest' }));
    expect(api.emit).not.toHaveBeenCalledWith('osc:avatar-capabilities', expect.objectContaining({ avatarId: 'avtr_old_inflight' }));
  });
});

function makeApi() {
  return {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    log: jest.fn(),
    emit: jest.fn(),
    getPluginDir: jest.fn(() => __dirname),
    getConfig: jest.fn(),
    setConfig: jest.fn().mockResolvedValue(true),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    pluginLoader: { loadedPlugins: new Map() },
    getDatabase: jest.fn(() => ({ prepare: jest.fn(() => ({ get: jest.fn(), all: jest.fn() })) }))
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    sendFile: jest.fn()
  };
}
