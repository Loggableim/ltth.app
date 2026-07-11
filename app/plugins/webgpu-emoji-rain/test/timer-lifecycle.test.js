const fs = require('fs');
const os = require('os');
const path = require('path');

class MockAPI {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.routes = [];
    this.logs = [];
    this.emissions = [];
    this.app = { use: jest.fn() };
    this.pluginLoader = { loadedPlugins: new Map() };
    this.db = {
      getEmojiRainConfig: () => ({ enabled: true })
    };
  }

  log(message, level) {
    this.logs.push({ message, level });
  }

  emit(event, data) {
    this.emissions.push({ event, data });
  }

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

  test('spawn batch processor does not drain queued events while paused', async () => {
    jest.resetModules();
    const WebGPUEmojiRainPlugin = require('../main.js');
    const api = new MockAPI(tmpDir);
    const plugin = new WebGPUEmojiRainPlugin(api);
    plugin.overlayState.paused = true;
    plugin.spawnQueue.push({ emoji: '⏸️', count: 1, mode: 'rain' });

    plugin.startSpawnBatchProcessor();
    jest.advanceTimersByTime(250);

    expect(api.emissions).toEqual([]);
    expect(plugin.spawnQueue).toHaveLength(1);

    plugin.overlayState.paused = false;
    jest.advanceTimersByTime(50);

    expect(api.emissions).toEqual([
      expect.objectContaining({ event: 'webgpu-emoji-rain:spawn' })
    ]);
    expect(plugin.spawnQueue).toHaveLength(0);
    await plugin.destroy();
  });

  test('destroy cancels duration batches created by active rain effects', async () => {
    jest.resetModules();
    const WebGPUEmojiRainPlugin = require('../main.js');
    const api = new MockAPI(tmpDir);
    const plugin = new WebGPUEmojiRainPlugin(api);
    plugin.runtimeConfig = {
      enabled: true,
      emoji_set: ['🌧️'],
      max_count_per_event: 100,
      max_intensity: 3
    };

    plugin.triggerEmojiRain({
      emoji: '🌧️',
      count: 2,
      duration: 2000,
      reason: 'timer-cleanup-test'
    });
    expect(api.emissions).toHaveLength(1);
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    await plugin.destroy();
    const emissionsAfterDestroy = api.emissions.length;

    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(2500);
    expect(api.emissions).toHaveLength(emissionsAfterDestroy);
  });
});
