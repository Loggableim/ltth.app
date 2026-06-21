const TTSPlugin = require('../plugins/tts/main');
const Database = require('better-sqlite3');

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

class MockDatabase {
  constructor() {
    this.db = new Database(':memory:');
    this.db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    if (value === null || value === undefined) {
      this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
      return true;
    }
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
    return true;
  }

  close() {
    this.db.close();
  }
}

class MockAPI {
  constructor(db) {
    this.db = db;
    this.config = {};
    this.routes = [];
    this.logger = mockLogger;
  }

  getDatabase() {
    return this.db;
  }

  getConfig(key) {
    return this.config[key];
  }

  setConfig(key, value) {
    this.config[key] = value;
    return true;
  }

  getConfigPathManager() {
    return null;
  }

  emit() {}
  registerSocket() {}
  registerTikTokEvent() {}

  registerRoute(method, routePath, ...handlers) {
    this.routes.push({ method, path: routePath, handler: handlers[handlers.length - 1] });
  }
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe('TTS TikTok SessionID configuration', () => {
  let db;
  let api;
  let plugin;

  beforeEach(() => {
    jest.clearAllMocks();
    db = new MockDatabase();
    api = new MockAPI(db);
    plugin = new TTSPlugin(api);
    plugin._registerRoutes();
  });

  afterEach(async () => {
    if (plugin) {
      await plugin.destroy();
    }
    db.close();
  });

  test('persists manual TikTok SessionID from config route for the TikTok engine', async () => {
    const route = api.routes.find(item => item.method === 'POST' && item.path === '/api/tts/config');
    const res = createMockResponse();

    await route.handler({
      body: {
        defaultEngine: 'tiktok',
        defaultVoice: 'de_002',
        tiktokSessionId: '  manual_session_12345  '
      }
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(db.getSetting('tiktok_session_id')).toBe('manual_session_12345');
    expect(db.getSetting('tiktok_session_method')).toBe('manual_import');
    expect(api.config.config.tiktokSessionId).toBe('configured');
    expect(plugin.engines.tiktok.sessionId).toBe('manual_session_12345');
    expect(plugin._hasTikTokSessionConfigured()).toBe(true);
  });

  test('reports existing database TikTok SessionID as hidden in config response', async () => {
    await plugin.destroy();
    api.routes = [];
    db.setSetting('tiktok_session_id', 'existing_session_12345');
    db.setSetting('tiktok_session_method', 'manual_import');

    plugin = new TTSPlugin(api);
    plugin._registerRoutes();

    const route = api.routes.find(item => item.method === 'GET' && item.path === '/api/tts/config');
    const res = createMockResponse();

    route.handler({ body: {}, query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.config.tiktokSessionId).toBe('***HIDDEN***');
    expect(plugin.engines.tiktok.sessionId).toBe('existing_session_12345');
  });
});
