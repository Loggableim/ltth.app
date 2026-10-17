const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('ws', () => ({
  Server: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    clients: { size: 0 },
    close: jest.fn()
  })),
  OPEN: 1
}));

const WebSocket = require('ws');
const MinecraftWebSocketServer = require('../plugins/minecraft-connect/helpers/minecraftWebSocket');
const { getWebSocketBindPolicy } = require('../plugins/minecraft-connect/helpers/websocketBindPolicy');
const MinecraftConnectPlugin = require('../plugins/minecraft-connect/main');

function createLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

describe('Minecraft Connect loopback-only WebSocket policy', () => {
  beforeEach(() => WebSocket.Server.mockClear());

  test('defaults to loopback and allows only the documented host values', () => {
    expect(getWebSocketBindPolicy(undefined)).toMatchObject({ allowed: true, bindHost: '127.0.0.1' });
    expect(getWebSocketBindPolicy('localhost')).toMatchObject({ allowed: true, bindHost: '127.0.0.1' });
    expect(getWebSocketBindPolicy('127.0.0.1')).toMatchObject({ allowed: true, bindHost: '127.0.0.1' });
    expect(getWebSocketBindPolicy('::1')).toMatchObject({ allowed: true, bindHost: '::1' });

    for (const host of ['0.0.0.0', '::', '192.168.1.10', 'minecraft.local', 'localhost.evil']) {
      expect(getWebSocketBindPolicy(host)).toMatchObject({ allowed: false, bindHost: null });
    }
  });

  test('bind path passes normalized loopback host to ws without creating a listener', () => {
    const service = new MinecraftWebSocketServer({ websocket: { host: 'localhost', port: 25560 } }, createLogger());

    service.start();

    expect(WebSocket.Server).toHaveBeenCalledWith(expect.objectContaining({ host: '127.0.0.1', port: 25560 }));
    expect(service.isRunning).toBe(true);
    expect(service.wss._server).toBeUndefined();
  });

  test('rejects non-loopback hosts before calling the ws server constructor', () => {
    const service = new MinecraftWebSocketServer({ websocket: { host: '0.0.0.0', port: 25560 } }, createLogger());

    expect(() => service.start()).toThrow(/only accepts localhost, 127\.0\.0\.1, or ::1/i);
    expect(WebSocket.Server).not.toHaveBeenCalled();
    expect(service.isRunning).toBe(false);
    expect(service.wss).toBeNull();
  });

  test('HTTP config update preserves a non-loopback host and returns a warning', async () => {
    const routes = new Map();
    const plugin = new MinecraftConnectPlugin({
      getPluginDataDir: () => path.join(os.tmpdir(), 'minecraft-connect-synthetic'),
      registerRoute: (method, route, handler) => routes.set(`${method} ${route}`, handler),
      registerSocket: jest.fn()
    });
    plugin.wsServer = { isConnected: () => false };
    plugin.commandQueue = { getStatus: () => ({ queueSize: 0 }) };
    plugin.actionMapper = { getMappings: () => [] };
    plugin.saveConfig = jest.fn().mockResolvedValue(undefined);
    plugin.registerRoutes();
    const response = { json: jest.fn() };

    await routes.get('PUT /api/minecraft-connect/config')({ body: { websocket: { host: '192.168.1.10' } } }, response);

    expect(plugin.config.websocket.host).toBe('192.168.1.10');
    expect(plugin.saveConfig).toHaveBeenCalledTimes(1);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      config: expect.objectContaining({ websocket: expect.objectContaining({ host: '192.168.1.10' }) }),
      warning: expect.stringMatching(/only accepts localhost/i)
    }));
    expect(WebSocket.Server).not.toHaveBeenCalled();
  });

  test('reload retains an existing LAN host and still refuses to bind it', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'minecraft-connect-config-'));
    const dataDir = path.join(tempRoot, 'plugin-data');
    const api = {
      getPluginDataDir: () => dataDir,
      ensurePluginDataDir: () => fs.mkdirSync(dataDir, { recursive: true }),
      pluginDir: path.join(tempRoot, 'plugin-source'),
      log: jest.fn()
    };

    try {
      const original = new MinecraftConnectPlugin(api);
      original.config.websocket.host = '192.168.1.10';
      await original.saveConfig();

      const reloaded = new MinecraftConnectPlugin(api);
      await reloaded.loadConfig();
      expect(reloaded.config.websocket.host).toBe('192.168.1.10');

      const service = new MinecraftWebSocketServer(reloaded.config, createLogger());
      expect(() => service.start()).toThrow(/only accepts localhost, 127\.0\.0\.1, or ::1/i);
      expect(WebSocket.Server).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
