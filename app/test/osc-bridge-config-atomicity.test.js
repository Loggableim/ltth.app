const OSCBridgePlugin = require('../plugins/osc-bridge/main');

describe('OSC-Bridge atomic configuration updates', () => {
  test('keeps a running bridge and its persisted configuration untouched when the candidate is invalid', async () => {
    const api = makeApi();
    const plugin = new OSCBridgePlugin(api);
    const previousConfig = plugin.getDefaultConfig();
    previousConfig.enabled = true;
    plugin.config = previousConfig;
    plugin.isRunning = true;
    plugin.transport.state = 'running';
    plugin.stop = jest.fn();
    plugin.start = jest.fn();

    const result = await plugin.updateConfig({ sendPort: 70000 });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      errors: expect.arrayContaining(['sendPort must be an integer between 1 and 65535'])
    }));
    expect(plugin.stop).not.toHaveBeenCalled();
    expect(plugin.start).not.toHaveBeenCalled();
    expect(plugin.config).toBe(previousConfig);
    expect(plugin.isRunning).toBe(true);
    expect(api.setConfig).not.toHaveBeenCalled();
  });

  test('rolls back the in-memory configuration and restarts the previous transport when reconfiguration cannot start', async () => {
    const api = makeApi();
    const plugin = new OSCBridgePlugin(api);
    const previousConfig = plugin.getDefaultConfig();
    previousConfig.enabled = true;
    plugin.config = previousConfig;
    plugin.isRunning = true;
    plugin.transport.state = 'running';
    plugin.stop = jest.fn(async () => {
      plugin.isRunning = false;
      plugin.transport.state = 'stopped';
      return { success: true };
    });
    plugin.start = jest.fn(async () => {
      if (plugin.config.sendPort === 9100) {
        return { success: false, error: 'EADDRINUSE' };
      }
      plugin.isRunning = true;
      plugin.transport.state = 'running';
      return { success: true };
    });

    const result = await plugin.updateConfig({ sendPort: 9100 });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('could not be started')
    }));
    expect(plugin.config).toBe(previousConfig);
    expect(plugin.isRunning).toBe(true);
    expect(plugin.stop).toHaveBeenCalledTimes(1);
    expect(plugin.start).toHaveBeenCalledTimes(2);
    expect(api.setConfig).not.toHaveBeenCalled();
  });

  test('stops the candidate transport before restoring the old transport and OSCQuery client after persistence fails', async () => {
    const api = makeApi();
    api.setConfig
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValueOnce(undefined);
    const plugin = new OSCBridgePlugin(api);
    const previousConfig = plugin.getDefaultConfig();
    previousConfig.enabled = true;
    previousConfig.oscQuery = {
      ...previousConfig.oscQuery,
      enabled: true,
      host: 'old-oscquery.local',
      port: 9001
    };
    plugin.config = previousConfig;
    plugin.isRunning = true;
    plugin.transport.state = 'running';
    plugin.autoDiscoverOSCQuery = jest.fn();
    plugin.oscQueryClient = { disconnect: jest.fn() };
    plugin.transport.stop = jest.fn(async () => {
      plugin.transport.state = 'stopped';
      return { success: true };
    });
    plugin.transport.start = jest.fn(async (config) => {
      plugin.transport.state = 'running';
      plugin.transport.port = config.receivePort;
      return { success: true };
    });

    const result = await plugin.updateConfig({
      sendPort: 9100,
      oscQuery: { port: 9102 }
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('previous configuration restored')
    }));
    expect(plugin.transport.stop).toHaveBeenCalledTimes(2);
    expect(plugin.transport.start).toHaveBeenCalledTimes(2);
    expect(plugin.transport.start.mock.calls.map(([config]) => config.sendPort)).toEqual([9100, 9000]);
    expect(plugin.config).toEqual(previousConfig);
    expect(plugin.isRunning).toBe(true);
    expect(plugin.transport.state).toBe('running');
    expect(plugin.oscQueryClient).toEqual(expect.objectContaining({
      host: 'old-oscquery.local',
      port: 9001
    }));
    expect(api.setConfig).toHaveBeenNthCalledWith(1, 'config', expect.objectContaining({ sendPort: 9100 }));
    expect(api.setConfig).toHaveBeenNthCalledWith(2, 'config', expect.objectContaining({ sendPort: 9000 }));
  });
});

function makeApi() {
  return {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    },
    log: jest.fn(),
    emit: jest.fn(),
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    getPluginDir: jest.fn(() => __dirname),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    pluginLoader: { loadedPlugins: new Map() }
  };
}
