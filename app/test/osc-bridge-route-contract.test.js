const OSCBridgePlugin = require('../plugins/osc-bridge/main');
const OSCQueryClient = require('../plugins/osc-bridge/modules/OSCQueryClient');

describe('OSC-Bridge route contracts', () => {
  let api;
  let plugin;
  let routes;
  let mdnsSpy;

  beforeEach(() => {
    routes = new Map();
    api = makeApi(routes);
    plugin = new OSCBridgePlugin(api);
    plugin.config = plugin.getDefaultConfig();
    mdnsSpy = jest.spyOn(OSCQueryClient, 'discoverVRChatOSCQuery').mockResolvedValue({ found: false, service: null });
    plugin.registerRoutes();
  });

  afterEach(async () => {
    await plugin.destroy();
    mdnsSpy.mockRestore();
  });

  test('registers the complete public route inventory and status socket', () => {
    expect([...routes.keys()].sort()).toEqual([
      'delete /api/osc/favorites/:avatarId',
      'delete /api/osc/presets/:id',
      'get /api/osc/avatar/available-actions',
      'get /api/osc/avatar/current',
      'get /api/osc/avatar/parameters/tree',
      'get /api/osc/avatar/state',
      'get /api/osc/avatars',
      'get /api/osc/commands',
      'get /api/osc/config',
      'get /api/osc/expressions/state',
      'get /api/osc/favorites',
      'get /api/osc/gift-mappings',
      'get /api/osc/health',
      'get /api/osc/monitor/history/:address',
      'get /api/osc/monitor/state',
      'get /api/osc/oscquery/parameters',
      'get /api/osc/oscquery/status',
      'get /api/osc/physbones/animations',
      'get /api/osc/physbones/discovered',
      'get /api/osc/presets',
      'get /api/osc/presets/export',
      'get /api/osc/status',
      'get /osc-bridge/ui',
      'post /api/osc/avatar/auto-detect',
      'post /api/osc/avatars',
      'post /api/osc/chatbox/send',
      'post /api/osc/commands',
      'post /api/osc/config',
      'post /api/osc/expressions/combo',
      'post /api/osc/expressions/queue',
      'post /api/osc/expressions/stop',
      'post /api/osc/expressions/trigger',
      'post /api/osc/favorites/:avatarId',
      'post /api/osc/gift-mappings',
      'post /api/osc/oscquery/discover',
      'post /api/osc/oscquery/scan-port',
      'post /api/osc/oscquery/subscribe',
      'post /api/osc/physbones/discover',
      'post /api/osc/physbones/stop',
      'post /api/osc/physbones/trigger',
      'post /api/osc/presets',
      'post /api/osc/presets/:id/apply',
      'post /api/osc/presets/import',
      'post /api/osc/send',
      'post /api/osc/start',
      'post /api/osc/stop',
      'post /api/osc/test',
      'post /api/osc/vrchat/avatar',
      'post /api/osc/vrchat/celebrate',
      'post /api/osc/vrchat/confetti',
      'post /api/osc/vrchat/dance',
      'post /api/osc/vrchat/emote',
      'post /api/osc/vrchat/gogoloco/fly',
      'post /api/osc/vrchat/gogoloco/grounded',
      'post /api/osc/vrchat/gogoloco/swim',
      'post /api/osc/vrchat/gogoloco/turn',
      'post /api/osc/vrchat/gogoloco/velocity',
      'post /api/osc/vrchat/hearts',
      'post /api/osc/vrchat/wave'
    ].sort());
    plugin.registerSocketEvents();
    expect(api.registerSocket).toHaveBeenCalledWith('osc:get-status', expect.any(Function));
  });

  test('lifecycle and config routes forward success and validation errors transparently', async () => {
    plugin.start = jest.fn().mockResolvedValue({ success: true });
    plugin.updateConfig = jest.fn().mockResolvedValue({ success: false, error: 'receivePort must be valid' });

    const start = await call(routes, 'post /api/osc/start');
    const config = await call(routes, 'get /api/osc/config');
    const invalidUpdate = await call(routes, 'post /api/osc/config', { body: { receivePort: 0 } });

    expect(start.body).toEqual({ success: true });
    expect(config.body).toEqual(expect.objectContaining({ success: true, config: expect.objectContaining({ sendHost: '127.0.0.1' }) }));
    expect(invalidUpdate.body).toEqual({ success: false, error: 'receivePort must be valid' });
  });

  test('UI, status, stop, and health routes expose stable lifecycle contracts', async () => {
    plugin.getStatus = jest.fn(() => ({ isRunning: false, state: 'stopped' }));
    plugin.stop = jest.fn().mockResolvedValue({ success: true, alreadyStopped: true });

    const ui = await call(routes, 'get /osc-bridge/ui');
    const status = await call(routes, 'get /api/osc/status');
    const stop = await call(routes, 'post /api/osc/stop');
    const health = await call(routes, 'get /api/osc/health');

    expect(ui.sendFile).toHaveBeenCalledWith(expect.stringMatching(/ui\.html$/));
    expect(status.body).toEqual(expect.objectContaining({ success: true, state: 'stopped' }));
    expect(stop.body).toEqual({ success: true, alreadyStopped: true });
    expect(health.body).toEqual(expect.objectContaining({ success: true, status: 'stopped', state: 'stopped' }));
  });

  test('raw send and test routes reject missing addresses and return service results', async () => {
    plugin.sendMessage = jest.fn().mockReturnValue({ success: true });
    plugin.test = jest.fn().mockReturnValue({ success: true, tested: '/avatar/parameters/Wave' });

    const missing = await call(routes, 'post /api/osc/send', { body: {} });
    const sent = await call(routes, 'post /api/osc/send', { body: { address: '/avatar/parameters/Wave', args: true } });
    const tested = await call(routes, 'post /api/osc/test', { body: { address: '/avatar/parameters/Wave', value: true } });

    expect(missing).toEqual(expect.objectContaining({ statusCode: 400, body: { success: false, error: 'Address is required' } }));
    expect(sent.body).toEqual(expect.objectContaining({ success: true, address: '/avatar/parameters/Wave', args: [true] }));
    expect(tested.body).toEqual({ success: true, tested: '/avatar/parameters/Wave' });
  });

  test('VRChat helper routes enforce invalid input and return supported standard, emote, and GoGo calls', async () => {
    plugin.wave = jest.fn().mockReturnValue(true);
    plugin.triggerEmote = jest.fn().mockReturnValue(true);
    plugin.setGoGoLocoVelocity = jest.fn().mockReturnValue(true);

    const invalidVelocity = await call(routes, 'post /api/osc/vrchat/gogoloco/velocity', { body: { velocity: 2 } });
    const wave = await call(routes, 'post /api/osc/vrchat/wave', { body: { duration: 123 } });
    const emote = await call(routes, 'post /api/osc/vrchat/emote', { body: { slot: 3, duration: 500 } });
    const velocity = await call(routes, 'post /api/osc/vrchat/gogoloco/velocity', { body: { velocity: 0.4 } });

    expect(invalidVelocity).toEqual(expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ success: false }) }));
    expect(wave.body).toEqual(expect.objectContaining({ success: true, action: 'wave', duration: 123 }));
    expect(emote.body).toEqual(expect.objectContaining({ success: true, action: 'emote', slot: 3 }));
    expect(velocity.body).toEqual(expect.objectContaining({ success: true, action: 'gogoloco_velocity', velocity: 0.4 }));
  });

  test('mapping, avatar, and command routes preserve payloads while rejecting invalid collections', async () => {
    plugin.unregisterGCCECommands = jest.fn();
    plugin.registerGCCECommands = jest.fn();

    const invalidMappings = await call(routes, 'post /api/osc/gift-mappings', { body: { mappings: {} } });
    const savedAvatars = await call(routes, 'post /api/osc/avatars', { body: { avatars: [{ id: 'avtr_a' }] } });
    const savedCommands = await call(routes, 'post /api/osc/commands', { body: { commands: [{ name: 'wave' }] } });

    expect(invalidMappings).toEqual(expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ error: 'Mappings must be an array' }) }));
    expect(savedAvatars.body).toEqual({ success: true, avatars: [{ id: 'avtr_a' }] });
    expect(savedCommands.body).toEqual({ success: true, commands: [{ name: 'wave' }] });
    expect(plugin.registerGCCECommands).toHaveBeenCalledTimes(1);
  });

  test('OSCQuery routes expose discovery success and reject malformed port scan requests', async () => {
    plugin.oscQueryClient = { discover: jest.fn().mockResolvedValue({ parameterCount: 3 }), destroy: jest.fn() };

    const discover = await call(routes, 'post /api/osc/oscquery/discover');
    const invalidScan = await call(routes, 'post /api/osc/oscquery/scan-port', { body: { startPort: 0 } });

    expect(discover.body).toEqual({ success: true, parameterCount: 3 });
    expect(invalidScan).toEqual(expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ success: false, error: expect.stringContaining('Invalid startPort') }) }));
  });

  test('OSCQuery subscribe forwards updates and avatar routes report unavailable and autodetect errors', async () => {
    const unavailableCurrent = await call(routes, 'get /api/osc/avatar/current');
    const unavailableActions = await call(routes, 'get /api/osc/avatar/available-actions');
    const scan = jest.spyOn(OSCQueryClient, 'scanForVRChatOSCQuery').mockResolvedValue({ found: false, scannedPorts: [], candidates: [] });
    const autodetect = await call(routes, 'post /api/osc/avatar/auto-detect');
    scan.mockRestore();

    let updateCallback;
    plugin.oscQueryClient = {
      subscribe: jest.fn(callback => { updateCallback = callback; return true; }),
      destroy: jest.fn()
    };
    const subscribed = await call(routes, 'post /api/osc/oscquery/subscribe');
    updateCallback({ path: '/avatar/parameters/Wave', value: true });

    expect(unavailableCurrent.body).toEqual({ success: false, error: 'OSCQuery not initialized' });
    expect(unavailableActions.body).toEqual({ success: false, error: 'OSCQuery not initialized', actions: [] });
    expect(autodetect).toEqual(expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ success: false, diagnostics: expect.any(Object) }) }));
    expect(subscribed.body).toEqual({ success: true });
    expect(api.emit).toHaveBeenCalledWith('osc:oscquery-update', expect.objectContaining({ value: true }));
  });

  test('monitoring, presets, and favorites routes return state and validate persistence input', async () => {
    plugin.avatarStateStore = {
      getState: jest.fn(() => ({ parameters: [{ address: '/avatar/parameters/Wave' }], physbones: [] })),
      destroy: jest.fn()
    };
    plugin.config.favorites = { avatars: ['avtr_saved'], maxFavorites: 10 };

    const state = await call(routes, 'get /api/osc/monitor/state');
    const invalidPreset = await call(routes, 'post /api/osc/presets', { body: {} });
    const duplicateFavorite = await call(routes, 'post /api/osc/favorites/:avatarId', { params: { avatarId: 'avtr_saved' } });

    expect(state.body).toEqual(expect.objectContaining({ success: true, state: expect.objectContaining({ parameters: expect.any(Array) }) }));
    expect(invalidPreset).toEqual(expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ error: 'Name and parameters required' }) }));
    expect(duplicateFavorite.body).toEqual({ success: false, error: 'Avatar already in favorites' });
  });

  test('monitor history, preset export/import/apply/delete, and favorite deletion have safe contracts', async () => {
    plugin.avatarStateStore = {
      getHistory: jest.fn(() => [{ value: true }]),
      destroy: jest.fn()
    };
    plugin.presetManager.presets.set('preset_one', {
      id: 'preset_one',
      name: 'Wave',
      parameters: { '/avatar/parameters/Wave': true }
    });
    plugin.send = jest.fn().mockReturnValue(true);
    plugin.config.favorites = { avatars: ['avtr_saved'], maxFavorites: 10 };

    const history = await call(routes, 'get /api/osc/monitor/history/:address', { params: { address: '%2Favatar%2Fparameters%2FWave' } });
    const exported = await call(routes, 'get /api/osc/presets/export');
    const invalidImport = await call(routes, 'post /api/osc/presets/import', { body: {} });
    const imported = await call(routes, 'post /api/osc/presets/import', { body: { presets: [{ name: 'Imported', parameters: { '/avatar/parameters/Test': 1 } }, {}] } });
    const applied = await call(routes, 'post /api/osc/presets/:id/apply', { params: { id: 'preset_one' } });
    const deleted = await call(routes, 'delete /api/osc/presets/:id', { params: { id: 'preset_one' } });
    const removedFavorite = await call(routes, 'delete /api/osc/favorites/:avatarId', { params: { avatarId: 'avtr_saved' } });
    const missingFavorite = await call(routes, 'delete /api/osc/favorites/:avatarId', { params: { avatarId: 'avtr_missing' } });

    expect(history.body).toEqual({ success: true, history: [{ value: true }] });
    expect(exported).toEqual(expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }), body: expect.objectContaining({ presets: expect.any(Array) }) }));
    expect(invalidImport).toEqual(expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ success: false }) }));
    expect(imported.body).toEqual({ success: true, imported: 1, total: 2 });
    expect(applied.body).toEqual({ success: true, applied: 1 });
    expect(plugin.send).toHaveBeenCalledWith('/avatar/parameters/Wave', true);
    expect(deleted.body).toEqual({ success: true });
    expect(removedFavorite.body).toEqual({ success: true, favorites: [] });
    expect(missingFavorite.body).toEqual({ success: false, error: 'Avatar not in favorites' });
  });

  test('PhysBone, expression, and chatbox routes report validation errors and successful delegated calls', async () => {
    plugin.sendToChatbox = jest.fn().mockReturnValue(true);
    plugin.triggerExpression = jest.fn().mockReturnValue(true);

    const missingBone = await call(routes, 'post /api/osc/physbones/trigger', { body: {} });
    const missingMessage = await call(routes, 'post /api/osc/chatbox/send', { body: {} });
    const sent = await call(routes, 'post /api/osc/chatbox/send', { body: { message: 'Hello VRChat', showTyping: false } });
    const missingSlot = await call(routes, 'post /api/osc/expressions/trigger', { body: {} });
    const expression = await call(routes, 'post /api/osc/expressions/trigger', { body: { slot: 2, hold: true } });

    expect(missingBone).toEqual(expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ error: 'Bone name required' }) }));
    expect(missingMessage).toEqual(expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ error: 'Message required' }) }));
    expect(sent.body).toEqual({ success: true });
    expect(missingSlot).toEqual(expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ error: 'Slot required' }) }));
    expect(expression.body).toEqual(expect.objectContaining({ success: true, type: 'Emote', slot: 2, hold: true }));
  });

  test('expression queue/stop/state and PhysBone discovery, stop, and animations expose component results', async () => {
    plugin.expressionController = {
      comboQueue: [],
      queueCombo: jest.fn(combo => plugin.expressionController.comboQueue.push(...combo)),
      stopCombo: jest.fn(),
      getState: jest.fn(() => ({ queueLength: 1 })),
      destroy: jest.fn()
    };
    plugin.oscQueryClient = { destroy: jest.fn() };
    plugin.physBonesController = {
      getDiscoveredBones: jest.fn(() => [{ name: 'Tail' }]),
      autoDiscover: jest.fn().mockResolvedValue({ success: true, discovered: 1 }),
      stopAnimation: jest.fn(() => 1),
      stopAllAnimations: jest.fn(() => 2),
      getActiveAnimations: jest.fn(() => [{ boneName: 'Tail' }]),
      destroy: jest.fn()
    };

    const invalidQueue = await call(routes, 'post /api/osc/expressions/queue', { body: {} });
    const queued = await call(routes, 'post /api/osc/expressions/queue', { body: { combo: [{ type: 'Gesture', slot: 1 }] } });
    const stopped = await call(routes, 'post /api/osc/expressions/stop');
    const expressionState = await call(routes, 'get /api/osc/expressions/state');
    const discovered = await call(routes, 'get /api/osc/physbones/discovered');
    const discovery = await call(routes, 'post /api/osc/physbones/discover');
    const stoppedBone = await call(routes, 'post /api/osc/physbones/stop', { body: { boneName: 'Tail' } });
    const stoppedAll = await call(routes, 'post /api/osc/physbones/stop');
    const animations = await call(routes, 'get /api/osc/physbones/animations');

    expect(invalidQueue).toEqual(expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ error: 'Combo array required' }) }));
    expect(queued.body).toEqual({ success: true, queueLength: 1 });
    expect(stopped.body).toEqual({ success: true });
    expect(expressionState.body).toEqual({ success: true, state: { queueLength: 1 } });
    expect(discovered.body).toEqual({ success: true, bones: [{ name: 'Tail' }] });
    expect(discovery.body).toEqual({ success: true, discovered: 1 });
    expect(stoppedBone.body).toEqual({ success: true, stopped: 1 });
    expect(stoppedAll.body).toEqual({ success: true, stopped: 2 });
    expect(animations.body).toEqual({ success: true, animations: [{ boneName: 'Tail' }] });
  });
});

function makeApi(routes) {
  return {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    log: jest.fn(),
    emit: jest.fn(),
    getConfig: jest.fn().mockResolvedValue(null),
    setConfig: jest.fn().mockResolvedValue(true),
    getPluginDir: jest.fn(() => __dirname),
    registerRoute: jest.fn((method, routePath, handler) => routes.set(`${method.toLowerCase()} ${routePath}`, handler)),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    pluginLoader: { loadedPlugins: new Map() },
    getDatabase: jest.fn(() => ({ prepare: jest.fn(() => ({ get: jest.fn(), all: jest.fn() })) }))
  };
}

async function call(routes, key, request = {}) {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    sendFile: jest.fn()
  };
  await routes.get(key)({ body: {}, query: {}, params: {}, ...request }, res);
  return res;
}
