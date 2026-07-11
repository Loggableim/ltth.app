const fs = require('fs');
const os = require('os');
const path = require('path');

class MockAPI {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.routes = [];
    this.logs = [];
    this.app = { use: jest.fn() };
    this.pluginLoader = { loadedPlugins: new Map() };
    this.db = {
      getEmojiRainConfig: () => ({ enabled: true })
    };
  }

  log(message, level) {
    this.logs.push({ message, level });
  }

  emit() {}

  getSocketIO() {
    return { emit: jest.fn() };
  }

  getDatabase() {
    return this.db;
  }

  getPluginDataDir() {
    return path.join(this.baseDir, 'plugin-data');
  }

  ensurePluginDataDir() {
    fs.mkdirSync(this.getPluginDataDir(), { recursive: true });
  }

  getConfigPathManager() {
    return {
      getUserConfigsDir: () => path.join(this.baseDir, 'user-configs')
    };
  }

  getApp() {
    return this.app;
  }

  registerRoute(method, routePath, handler) {
    this.routes.push({ method, routePath, handler });
  }

  registerMiddleware(routePath, handler) {
    this.routes.push({ method: 'use', routePath, handler });
  }

  registerTikTokEvent() {}
  registerFlowAction() {}
}

describe('WebGPU Emoji Rain timer lifecycle', () => {
  let tmpDir;

  beforeEach(() => {
    jest.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webgpu-emoji-rain-lifecycle-'));
  });

  afterEach(() => {
    jest.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('destroy clears all intervals started during init', async () => {
    jest.resetModules();
    const WebGPUEmojiRainPlugin = require('../main.js');
    const plugin = new WebGPUEmojiRainPlugin(new MockAPI(tmpDir));

    await plugin.init();
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    await plugin.destroy();

    expect(jest.getTimerCount()).toBe(0);
  });
});
