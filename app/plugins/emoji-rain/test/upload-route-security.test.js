const fs = require('fs');
const os = require('os');
const path = require('path');

class MockAPI {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.routes = [];
    this.logs = [];
    this.app = { use: jest.fn() };
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

  registerTikTokEvent() {}
  registerFlowAction() {}
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    sentFile: null,
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function json(payload) {
      this.body = payload;
      return this;
    }),
    sendFile: jest.fn(function sendFile(filePath) {
      this.sentFile = filePath;
      return this;
    })
  };
}

describe('EmojiRain upload route security', () => {
  let tmpDir;
  let secretPath;
  let plugin;
  let api;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-rain-routes-'));

    jest.resetModules();
    const EmojiRainPlugin = require('../main.js');
    api = new MockAPI(tmpDir);
    plugin = new EmojiRainPlugin(api);
    fs.mkdirSync(plugin.uploadDir, { recursive: true });
    secretPath = path.join(path.dirname(plugin.uploadDir), 'secret.txt');
    fs.writeFileSync(secretPath, 'secret');
    plugin.registerRoutes();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('does not serve files outside the upload directory', () => {
    const route = api.routes.find(
      entry => entry.method === 'get' && entry.routePath === '/emoji-rain/uploads/:filename'
    );
    const res = createResponse();

    route.handler({ params: { filename: '../secret.txt' } }, res);

    expect(res.sendFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(expect.objectContaining({ success: false }));
  });

  test('does not delete files outside the upload directory', () => {
    const route = api.routes.find(
      entry => entry.method === 'delete' && entry.routePath === '/api/emoji-rain/images/:filename'
    );
    const res = createResponse();

    route.handler({ params: { filename: '../secret.txt' } }, res);

    expect(fs.existsSync(secretPath)).toBe(true);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual(expect.objectContaining({ success: false }));
  });
});
