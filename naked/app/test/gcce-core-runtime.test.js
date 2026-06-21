const path = require('path');

const GCCE = require('../plugins/gcce');
const CommandRegistry = require('../plugins/gcce/commandRegistry');

function createLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
}

function createMockApi(initialConfig = {}) {
  const configStore = { ...initialConfig };
  const api = {
    pluginDir: path.join(__dirname, '..', 'plugins', 'gcce'),
    logs: [],
    emitted: [],
    routes: {},
    socketHandlers: {},
    tiktokHandlers: {},
    flowActions: {},
    iftttActions: {},
    pluginLoader: { loadedPlugins: new Map() },
    iftttEngine: null,
    log(message, level = 'info') {
      this.logs.push({ message, level });
    },
    getConfig(key) {
      return configStore[key] || null;
    },
    setConfig(key, value) {
      configStore[key] = value;
      return true;
    },
    registerTikTokEvent(event, handler) {
      this.tiktokHandlers[event] = handler;
      return true;
    },
    registerRoute(method, routePath, handler) {
      this.routes[`${method.toUpperCase()} ${routePath}`] = handler;
      return true;
    },
    registerSocket(event, handler) {
      this.socketHandlers[event] = handler;
      return true;
    },
    registerFlowAction(actionName, handler) {
      this.flowActions[actionName] = handler;
      return true;
    },
    registerIFTTTAction(actionName, config) {
      this.iftttActions[actionName] = config;
      return true;
    },
    emit(event, data) {
      this.emitted.push({ event, data });
      return true;
    },
    on() {
      return true;
    },
    getDatabase() {
      return {
        prepare: () => ({
          get: () => null
        })
      };
    },
    getSocketIO() {
      return {
        emit: (event, data) => api.emitted.push({ event, data })
      };
    },
    ensurePluginDataDir() {
      return path.join(__dirname, '..', 'tmp', 'gcce-test');
    },
    getPluginDataDir() {
      return path.join(__dirname, '..', 'tmp', 'gcce-test');
    }
  };

  return api;
}

async function createInitializedGCCE(initialConfig = {}) {
  const api = createMockApi(initialConfig);
  const gcce = new GCCE(api);
  await gcce.init();
  gcce.pluginConfig.enableOverlayMessages = false;
  return { api, gcce };
}

describe('GCCE core runtime', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('executes built-in chat commands when the plugin API is used as the runtime logger', async () => {
    const { api, gcce } = await createInitializedGCCE();

    await gcce.handleChatMessage({
      comment: '/commands',
      uniqueId: 'viewer-1',
      nickname: 'Viewer One'
    });

    const recent = gcce.auditLog.getRecentLogs(1);
    expect(recent[0]).toMatchObject({
      command: 'commands',
      username: 'Viewer One',
      success: true
    });
    expect(api.logs.some(log => log.level === 'error' && log.message.includes('Error handling chat message'))).toBe(false);

    await gcce.destroy();
  });

  test('uses configured command prefix for chat parsing', async () => {
    const { gcce } = await createInitializedGCCE({
      gcce_config: {
        commandPrefix: '!',
        enableOverlayMessages: false
      }
    });

    await gcce.handleChatMessage({
      comment: '!commands',
      uniqueId: 'viewer-2',
      nickname: 'Viewer Two'
    });

    const recent = gcce.auditLog.getRecentLogs(1);
    expect(recent[0]).toMatchObject({
      command: 'commands',
      username: 'Viewer Two',
      success: true
    });

    await gcce.destroy();
  });

  test('executes registered flow commands through the parser API', async () => {
    const { api, gcce } = await createInitializedGCCE();

    const result = await api.flowActions['gcce.execute_command']({
      command: '/commands',
      username: 'Flow User',
      userId: 'flow-user'
    });

    expect(result).toMatchObject({
      success: true
    });

    await gcce.destroy();
  });

  test('executes HUD text command with active element and audit entry', async () => {
    const { gcce } = await createInitializedGCCE();

    const result = await gcce.hudManager.handleTextCommand(['5', 'Hello', 'HUD'], {
      userId: 'viewer-3',
      username: 'Viewer Three',
      userRole: 'all'
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        duration: 5
      }
    });
    expect(gcce.hudManager.getActiveElements()).toHaveLength(1);
    expect(gcce.auditLog.getRecentLogs(1)[0]).toMatchObject({
      command: 'hudtext',
      userId: 'viewer-3',
      success: true
    });

    await gcce.destroy();
  });
});

describe('GCCE command registry consistency', () => {
  test('invalidates cached commands when commands are unregistered and re-registered', () => {
    const registry = new CommandRegistry(createLogger());

    registry.registerCommand({
      pluginId: 'plugin-a',
      name: 'demo',
      handler: async () => ({ success: true })
    });
    expect(registry.getCommand('demo').pluginId).toBe('plugin-a');

    expect(registry.unregisterCommand('demo', 'plugin-a')).toBe(true);
    expect(registry.getCommand('demo')).toBeNull();

    registry.registerCommand({
      pluginId: 'plugin-b',
      name: 'demo',
      handler: async () => ({ success: true })
    });
    expect(registry.getCommand('demo').pluginId).toBe('plugin-b');
  });

  test('registers aliases declared on command definitions', () => {
    const registry = new CommandRegistry(createLogger());

    registry.registerCommand({
      pluginId: 'games',
      name: 'move',
      aliases: ['m'],
      handler: async () => ({ success: true })
    });

    expect(registry.getCommand('m')).toMatchObject({
      name: 'move',
      pluginId: 'games'
    });
  });
});
