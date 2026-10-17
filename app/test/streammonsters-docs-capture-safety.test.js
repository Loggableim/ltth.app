const Database = require('better-sqlite3');
const path = require('path');
const StreamMonstersPlugin = require('../plugins/stream-monsters');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');

const PLUGIN_DIR = path.join(__dirname, '..', 'plugins', 'stream-monsters');

function createDocsCaptureApi() {
  const database = new Database(':memory:');
  database.dbPath = ':memory:';
  const routes = [];
  const storedConfig = {
    enabled: true,
    streamMonsters: {
      enabled: true,
      creatorName: 'Synthetic Creator'
    }
  };
  const api = {
    pluginDir: PLUGIN_DIR,
    isDocsCapture: true,
    log: jest.fn(),
    getConfig: jest.fn(() => storedConfig),
    setConfig: jest.fn(),
    getDatabase: jest.fn(() => database),
    assertDocsCaptureDatabasePath: jest.fn(() => true),
    getPluginDataDir: jest.fn(() => {
      throw new Error('Docs capture runtime must not request plugin data directory');
    }),
    ensurePluginDataDir: jest.fn(() => {
      throw new Error('Docs capture runtime must not create plugin data directory');
    }),
    registerRoute: jest.fn((method, routePath, handler) => {
      routes.push({ method, routePath, handler });
    }),
    registerTikTokEvent: jest.fn(),
    on: jest.fn(() => true),
    emit: jest.fn()
  };
  return { api, database, routes };
}

function createResponse() {
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
    }
  };
}

describe('Stream Monsters docs-capture safety', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('initializes only the local read runtime without persistence, integrations, or timers', async () => {
    jest.useFakeTimers();
    const { api, database, routes } = createDocsCaptureApi();
    const plugin = new StreamMonstersPlugin(api);
    try {
      await plugin.init();

      expect(Object.getOwnPropertyDescriptor(plugin, 'isDocsCapture')).toEqual(
        expect.objectContaining({ value: true, writable: false, configurable: false })
      );
      expect(api.setConfig).not.toHaveBeenCalled();
      expect(api.registerTikTokEvent).not.toHaveBeenCalled();
      expect(api.on).not.toHaveBeenCalled();
      expect(api.emit).not.toHaveBeenCalled();
      expect(api.getPluginDataDir).not.toHaveBeenCalled();
      expect(api.ensurePluginDataDir).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
      expect(plugin.streamMonstersFreeEggDrops).toBeUndefined();
      expect(plugin.streamMonstersRetention).toBeUndefined();
      expect(plugin.streamMonstersProgression).toBeUndefined();
      expect(plugin.streamMonstersRoutes.progression).toBeNull();
      expect(plugin.streamMonstersBattleMatchService).toBeUndefined();
      expect(plugin.streamMonstersDeadlineScheduler).toBeUndefined();
      expect(plugin.streamMonstersStore.getGiftMappings()).toEqual([]);

      const stateRoute = routes.find(route => (
        route.method === 'GET' && route.routePath === '/api/streammonsters/creator-state'
      ));
      const response = createResponse();
      const ensureSeason = jest.spyOn(plugin.streamMonstersStore, 'ensureSeason');
      stateRoute.handler({
        socket: { remoteAddress: '127.0.0.1' },
        headers: {},
        query: {}
      }, response);

      expect(response.statusCode).toBe(200);
      expect(response.payload.config.creatorName).toBe('Synthetic Creator');
      expect(response.payload.season).toBeNull();
      expect(ensureSeason).not.toHaveBeenCalled();
      expect(response.payload.hype).toEqual(expect.objectContaining({
        stream_key: 'offline',
        points: 0,
        charged_eggs: 0
      }));
      expect(database.prepare('SELECT COUNT(*) AS count FROM streammonsters_hype').get().count).toBe(0);
      expect(database.prepare('SELECT COUNT(*) AS count FROM streammonsters_stream_metrics').get().count).toBe(0);
      expect(database.prepare('SELECT COUNT(*) AS count FROM streammonsters_seasons').get().count).toBe(0);

      let configWriteError;
      try {
        plugin.updateConfig({ streamMonsters: { creatorName: 'Changed' } });
      } catch (error) {
        configWriteError = error;
      }
      expect(configWriteError?.code).toBe('STREAM_MONSTERS_DOCS_CAPTURE_READ_ONLY');
    } finally {
      await plugin.destroy();
      database.close();
    }
  });

  test('fails closed for mutating, external-provider, overlay, and unapproved API routes', () => {
    const { api, database, routes } = createDocsCaptureApi();
    try {
      const StreamMonstersRoutes = require('../plugins/stream-monsters/backend/streammonsters/routes');
      const routeSet = new StreamMonstersRoutes({
        api,
        pluginDir: PLUGIN_DIR,
        store: { db: database },
        engine: { streamKey: null },
        configProvider: { getConfig: () => ({ streamMonsters: {} }) }
      });
      routeSet.register();

      for (const [method, routePath] of [
        ['POST', '/api/streammonsters/config'],
        ['PUT', '/api/streammonsters/gift-mappings/:giftId'],
        ['DELETE', '/api/streammonsters/gift-mappings/:giftId'],
        ['POST', '/api/streammonsters/overlay/heartbeat'],
        ['GET', '/api/streammonsters/avatar/:token'],
        ['GET', '/api/streammonsters/state'],
        ['GET', '/api/streammonsters/balance-report'],
        ['GET', '/stream-monsters/overlay']
      ]) {
        const route = routes.find(entry => entry.method === method && entry.routePath === routePath);
        expect(route).toBeDefined();
        const response = createResponse();
        route.handler({}, response);
        expect(response.statusCode).toBe(404);
        expect(response.payload).toEqual({ error: 'docs_capture_route_disabled' });
      }
    } finally {
      database.close();
    }
  });

  test('asserts the app database path before initializing Stream Monsters schema', async () => {
    const { api, database } = createDocsCaptureApi();
    const sequence = [];
    api.assertDocsCaptureDatabasePath.mockImplementation(databasePath => {
      sequence.push(['guard', databasePath]);
      return true;
    });
    const originalInitialize = StreamMonstersDatabase.prototype.initialize;
    const initialize = jest.spyOn(StreamMonstersDatabase.prototype, 'initialize')
      .mockImplementation(function initializeAfterGuard() {
        sequence.push(['initialize']);
        return originalInitialize.call(this);
      });
    const plugin = new StreamMonstersPlugin(api);

    try {
      await plugin.init();
      expect(sequence.slice(0, 2)).toEqual([
        ['guard', ':memory:'],
        ['initialize']
      ]);
    } finally {
      initialize.mockRestore();
      await plugin.destroy();
      database.close();
    }
  });

  test('does not initialize Stream Monsters schema when database path guard rejects', async () => {
    const { api, database } = createDocsCaptureApi();
    const error = Object.assign(new Error('outside capture profile'), {
      code: 'DOCS_CAPTURE_DATABASE_PATH_DENIED'
    });
    api.assertDocsCaptureDatabasePath.mockImplementation(() => { throw error; });
    const initialize = jest.spyOn(StreamMonstersDatabase.prototype, 'initialize');
    const plugin = new StreamMonstersPlugin(api);

    try {
      await expect(plugin.init()).rejects.toMatchObject({ code: 'DOCS_CAPTURE_DATABASE_PATH_DENIED' });
      expect(api.assertDocsCaptureDatabasePath).toHaveBeenCalledWith(':memory:');
      expect(initialize).not.toHaveBeenCalled();
      expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'streammonsters_eggs'").get()).toBeUndefined();
    } finally {
      initialize.mockRestore();
      await plugin.destroy();
      database.close();
    }
  });
});
