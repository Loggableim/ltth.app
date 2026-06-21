const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const InteractiveStoryPlugin = require('../plugins/interactive-story/main');
const TalkingHeadsPlugin = require('../plugins/talking-heads/main');

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    sentFile: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    },
    sendFile(filePath) {
      this.sentFile = filePath;
      return this;
    }
  };
}

function createMockApi(pluginDataDir, db) {
  const routes = [];

  return {
    routes,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    },
    log: jest.fn(),
    getSocketIO: () => ({
      emit: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn()
    }),
    getDatabase: () => db,
    getPluginDataDir: () => pluginDataDir,
    getConfig: () => null,
    setConfig: jest.fn(),
    registerRoute(method, routePath, handler) {
      routes.push({ method, path: routePath, handler });
    },
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    ensurePluginDataDir: jest.fn()
  };
}

function findRoute(api, method, routePath) {
  return api.routes.find(route => route.method === method && route.path === routePath);
}

describe('plugin file route security', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-file-routes-'));
    db = new Database(':memory:');
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('interactive story image route rejects path traversal', () => {
    const pluginDataDir = path.join(tmpDir, 'interactive-story-data');
    const imagesDir = path.join(pluginDataDir, 'images');
    const secretPath = path.join(pluginDataDir, 'secret.txt');
    fs.mkdirSync(imagesDir, { recursive: true });
    fs.writeFileSync(secretPath, 'outside cache');

    const api = createMockApi(pluginDataDir, db);
    const plugin = new InteractiveStoryPlugin(api);
    plugin._registerRoutes();

    const route = findRoute(api, 'get', '/api/interactive-story/image/:filename');
    const res = createResponse();

    route.handler({ params: { filename: '../secret.txt' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.sentFile).toBeNull();
  });

  test('talking heads sprite route rejects path traversal', async () => {
    const pluginDataDir = path.join(tmpDir, 'talking-heads-data');
    const avatarsDir = path.join(pluginDataDir, 'avatars');
    const secretPath = path.join(pluginDataDir, 'secret.txt');
    fs.mkdirSync(avatarsDir, { recursive: true });
    fs.writeFileSync(secretPath, 'outside avatars');

    const api = createMockApi(pluginDataDir, db);
    const plugin = new TalkingHeadsPlugin(api);
    plugin._registerRoutes();

    const route = findRoute(api, 'get', '/api/talkingheads/sprite/:filename');
    const res = createResponse();

    await route.handler({ params: { filename: '../secret.txt' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.sentFile).toBeNull();
  });
});
