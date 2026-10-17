'use strict';

const { VNyanClient } = require('../backend/vnyanClient');
const { AnimazeClient } = require('../backend/animazeClient');
const SidekickPlugin = require('../main');

const captureApi = Object.freeze({
  isDocsCapture: true,
  log: jest.fn()
});

describe('Sidekick docs-capture transport guard', () => {
  test('blocks VNyan connect, reconnect scheduling, and payload sends despite enabled config', async () => {
    const client = new VNyanClient(captureApi, {
      avatar: { driver: 'vnyan', vnyan: { autoConnect: true, reconnectOnDisconnect: true } }
    });
    const wsSend = jest.fn();
    try {
      await expect(client.connect()).resolves.toBe(false);
      client._scheduleReconnect();
      client.isConnected = true;
      client.ws = { readyState: 1, send: wsSend };
      expect(client.send({ type: 'probe' })).toBe(false);
      expect(wsSend).not.toHaveBeenCalled();
      expect(client.reconnectTimer).toBeNull();
    } finally {
      client.destroy();
    }
  });

  test('blocks Animaze connect, reconnect scheduling, commands, and speech despite enabled config', async () => {
    const client = new AnimazeClient(captureApi, {
      animaze: { enabled: true, autoConnect: true, reconnectOnDisconnect: true }
    });
    const wsSend = jest.fn();
    try {
      await expect(client.connect()).resolves.toBe(false);
      client._scheduleReconnect();
      client.isConnected = true;
      client.ws = { send: wsSend };
      await expect(client.sendCommand({ action: 'probe' })).resolves.toBe(false);
      await expect(client.sendMessage('probe')).resolves.toBe(false);
      expect(wsSend).not.toHaveBeenCalled();
      expect(client.reconnectTimer).toBeNull();
    } finally {
      client.destroy();
    }
  });

  test('capture init hardens injected config and registers read-only routes only', async () => {
    const routes = new Map();
    const setConfig = jest.fn();
    const api = {
      isDocsCapture: true,
      log: jest.fn(),
      getSocketIO: () => ({ emit: jest.fn(), to: () => ({ emit: jest.fn() }) }),
      getDatabase: () => ({
        exec: jest.fn(),
        prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn(), all: jest.fn() }))
      }),
      getConfig: () => ({
        avatar: { driver: 'vnyan', vnyan: { host: 'remote.invalid', port: 8001, autoConnect: true, reconnectOnDisconnect: true } },
        animaze: { enabled: true, host: 'remote.invalid', port: 9001, autoConnect: true, reconnectOnDisconnect: true },
        injectedSecret: 'must-not-be-rendered',
        muted: false,
        comment: { enabled: true },
        joinRules: { enabled: true }
      }),
      setConfig,
      registerRoute: jest.fn((method, route, handler) => routes.set(`${method.toUpperCase()} ${route}`, handler)),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      registerCommand: jest.fn()
    };
    const plugin = new SidekickPlugin(api);

    try {
      await plugin.init();

      expect(plugin.config.avatar.vnyan).toMatchObject({
        host: '127.0.0.1', port: 8000, path: '/vnyan', autoConnect: false, reconnectOnDisconnect: false
      });
      expect(plugin.config.animaze).toMatchObject({
        enabled: false, host: '127.0.0.1', port: 9000, autoConnect: false, reconnectOnDisconnect: false
      });
      expect(plugin.config).toMatchObject({ muted: true, comment: { enabled: false }, joinRules: { enabled: false } });
      expect(plugin.vnyanClient.ws).toBeNull();
      expect(plugin.animazeClient.ws).toBeNull();
      expect(plugin.vnyanClient.reconnectTimer).toBeNull();
      expect(plugin.animazeClient.reconnectTimer).toBeNull();
      expect([...routes.keys()].every(key => key.startsWith('GET '))).toBe(true);
      expect([...routes.keys()].some(key => key.includes('/avatar/connect') || key.includes('/avatar/trigger'))).toBe(false);
      const configResponse = { json: jest.fn() };
      routes.get('GET /api/sidekick/config')({}, configResponse);
      const visibleConfig = configResponse.json.mock.calls[0][0];
      expect(JSON.stringify(visibleConfig)).not.toContain('must-not-be-rendered');
      expect(visibleConfig.config.avatar.vnyan.host).toBe('127.0.0.1');
      expect(api.registerSocket).not.toHaveBeenCalled();
      expect(api.registerTikTokEvent).not.toHaveBeenCalled();
      expect(api.registerCommand).not.toHaveBeenCalled();
      expect(setConfig).not.toHaveBeenCalled();
      expect(plugin.cleanupInterval).toBeNull();
      expect(plugin.joinAnnouncerInterval).toBeNull();
      expect(plugin.eventBus.cleanupInterval).toBeNull();
      expect(plugin.deduper.cleanupInterval).toBeNull();
      expect(plugin.rateLimiter.cleanupInterval).toBeNull();
      expect(plugin.metrics.rotationInterval).toBeNull();
      expect(plugin.outboxBatcher.checkInterval).toBeNull();
    } finally {
      await plugin.destroy();
    }
  });
});
