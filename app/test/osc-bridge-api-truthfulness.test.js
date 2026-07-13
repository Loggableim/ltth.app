const OSCBridgePlugin = require('../plugins/osc-bridge/main');
const OSCQueryClient = require('../plugins/osc-bridge/modules/OSCQueryClient');

describe('OSC-Bridge API truthfulness', () => {
  test('runtime defaults keep plugin loaded but bridge stopped with VRChat OSC ports', () => {
    const routes = new Map();
    const plugin = new OSCBridgePlugin(makeApi(routes));
    const config = plugin.getDefaultConfig();

    expect(config).toEqual(expect.objectContaining({
      enabled: false,
      sendHost: '127.0.0.1',
      sendPort: 9000,
      receivePort: 9001,
      autoRetryOnError: false
    }));
    expect(config.oscQuery).toEqual(expect.objectContaining({
      host: '127.0.0.1',
      port: 9001
    }));
  });

  test('legacy send boolean delegates to rich sendMessage result', () => {
    const routes = new Map();
    const plugin = new OSCBridgePlugin(makeApi(routes));

    plugin.sendMessage = jest.fn(() => ({
      success: false,
      error: 'rate limit exceeded',
      address: '/avatar/parameters/Wave',
      args: [1]
    }));

    expect(plugin.send('/avatar/parameters/Wave', 1)).toBe(false);
    expect(plugin.sendMessage).toHaveBeenCalledWith('/avatar/parameters/Wave', [1]);
  });

  test('VRChat helper route reports failure when the bridge is stopped', () => {
    const routes = new Map();
    const plugin = new OSCBridgePlugin(makeApi(routes));
    plugin.config = plugin.getDefaultConfig();
    plugin.registerRoutes();

    const handler = routes.get('post /api/osc/vrchat/wave');
    const res = makeRes();

    handler({ body: { duration: 1000 } }, res);

    expect(res.payload).toEqual(expect.objectContaining({
      success: false,
      action: 'wave',
      error: 'OSC action failed: wave'
    }));
    expect(plugin.resetTimers.size).toBe(0);
  });

  test('generic send route reports failure details when the bridge is stopped', () => {
    const routes = new Map();
    const plugin = new OSCBridgePlugin(makeApi(routes));
    plugin.config = plugin.getDefaultConfig();
    plugin.registerRoutes();

    const handler = routes.get('post /api/osc/send');
    const res = makeRes();

    handler({
      body: {
        address: '/avatar/parameters/Wave',
        args: [1]
      }
    }, res);

    expect(res.payload).toEqual(expect.objectContaining({
      success: false,
      error: 'OSC bridge is not running',
      address: '/avatar/parameters/Wave',
      args: [1]
    }));
  });

  test('health route does not report stale runtime metrics after stop', () => {
    const routes = new Map();
    const plugin = new OSCBridgePlugin(makeApi(routes));
    plugin.config = plugin.getDefaultConfig();
    plugin.isRunning = false;
    plugin.transport.state = 'stopped';
    plugin.stats.startTime = new Date(Date.now() - 60000);
    plugin.stats.lastMessageSent = {
      address: '/avatar/parameters/Wave',
      args: [1],
      timestamp: new Date(Date.now() - 30000)
    };
    plugin.registerRoutes();

    const handler = routes.get('get /api/osc/health');
    const res = makeRes();

    handler({}, res);

    expect(res.payload).toEqual(expect.objectContaining({
      success: true,
      status: 'stopped',
      state: 'stopped',
      uptime: 0,
      latency: null,
      messageRate: 0,
      vrchatConnected: false
    }));
    expect(res.payload.timers).toEqual(expect.objectContaining({
      resetTimers: 0,
      oscQueryReconnect: 0,
      oscQueryAvatarWatcher: 0
    }));
  });

  test('OSCQuery scan failure includes actionable diagnostics', async () => {
    const routes = new Map();
    const plugin = new OSCBridgePlugin(makeApi(routes));
    plugin.config = plugin.getDefaultConfig();
    plugin.registerRoutes();
    const mdnsSpy = jest.spyOn(OSCQueryClient, 'discoverVRChatOSCQuery').mockResolvedValue({ found: false, service: null });
    const scanSpy = jest.spyOn(OSCQueryClient, 'scanForVRChatOSCQuery').mockResolvedValue({
      found: false,
      scannedPorts: 20,
      candidates: []
    });

    const handler = routes.get('post /api/osc/oscquery/scan-port');
    const res = makeRes();

    await handler({
      body: {
        startPort: 9001,
        endPort: 9020,
        timeout: 500,
        autoSave: false
      }
    }, res);

    expect(res.payload).toEqual(expect.objectContaining({
      success: false,
      error: 'No VRChat OSCQuery server found',
      scannedPorts: 20,
      diagnostics: expect.objectContaining({
        host: '127.0.0.1',
        port: 9001,
        scannedRange: '9001-9020',
        actions: expect.arrayContaining([
          expect.stringContaining('Action Menu > OSC')
        ])
      })
    }));

    mdnsSpy.mockRestore();
    scanSpy.mockRestore();
  });
});

function makeApi(routes) {
  return {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    },
    emit: jest.fn(),
    getPluginDir: jest.fn(() => __dirname),
    registerRoute: jest.fn((method, path, handler) => {
      routes.set(`${method.toLowerCase()} ${path}`, handler);
    }),
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    pluginLoader: {
      loadedPlugins: new Map()
    },
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(() => ({
        get: jest.fn(),
        all: jest.fn()
      }))
    }))
  };
}

function makeRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    sendFile: jest.fn()
  };
}
