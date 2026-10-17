'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const DatabaseManager = require('../modules/database');
const StreamMonstersPlugin = require('../plugins/stream-monsters');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const { DEMO_GIFT, seedStreamMonstersDocsCaptureProfile } = require('../../scripts/lib/docs-capture-stream-monsters-seed');

const repoRoot = path.resolve(__dirname, '../..');

describe('Stream Monsters capture seed database compatibility', () => {
  let profileDir;

  beforeEach(() => {
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-stream-monsters-schema-'));
    const fixtureDir = path.join(profileDir, 'docs-capture-app', 'plugins', 'stream-monsters');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, 'plugin.json'), JSON.stringify({
      id: 'stream-monsters',
      enabled: true
    }));
  });

  afterEach(() => {
    if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
  });

  test('StreamMonstersDatabase.initialize preserves and reads the seeded synthetic mapping', () => {
    const receipt = seedStreamMonstersDocsCaptureProfile(repoRoot, profileDir, ['stream-monsters']);
    const databasePath = path.join(profileDir, receipt.database);
    const database = new Database(databasePath);
    try {
      const store = new StreamMonstersDatabase(database);
      expect(() => store.initialize()).not.toThrow();
      expect(store.getGiftMappings()).toEqual([
        expect.objectContaining({
          gift_id: DEMO_GIFT.id,
          gift_name: DEMO_GIFT.name,
          effect: 'spawn',
          enabled: 1
        })
      ]);
      expect(database.prepare('SELECT id, name FROM gift_catalog').all()).toEqual([{
        id: DEMO_GIFT.id,
        name: DEMO_GIFT.name
      }]);
    } finally {
      database.close();
    }
  });

  test('capture gift-catalog GET reads the seeded row through the app DatabaseManager', async () => {
    const receipt = seedStreamMonstersDocsCaptureProfile(repoRoot, profileDir, ['stream-monsters']);
    const databasePath = path.join(profileDir, receipt.database);
    const appDatabase = new DatabaseManager(databasePath, 'default');
    const routes = [];
    const api = {
      pluginDir: path.join(repoRoot, 'app', 'plugins', 'stream-monsters'),
      isDocsCapture: true,
      log: jest.fn(),
      getConfig: jest.fn(() => {
        const row = appDatabase.db.prepare('SELECT value FROM settings WHERE key = ?')
          .get('plugin:stream-monsters:config');
        return row ? JSON.parse(row.value) : null;
      }),
      setConfig: jest.fn(),
      getDatabase: jest.fn(() => appDatabase),
      assertDocsCaptureDatabasePath: jest.fn(pathValue => {
        if (pathValue !== databasePath) {
          throw Object.assign(new Error('unexpected docs-capture database path'), {
            code: 'DOCS_CAPTURE_DATABASE_PATH_DENIED'
          });
        }
        return true;
      }),
      registerRoute: jest.fn((method, routePath, handler) => routes.push({ method, routePath, handler })),
      registerTikTokEvent: jest.fn(),
      on: jest.fn(() => true),
      emit: jest.fn(),
      getPluginDataDir: jest.fn(() => { throw new Error('capture must not access plugin data'); }),
      ensurePluginDataDir: jest.fn(() => { throw new Error('capture must not create plugin data'); })
    };
    const plugin = new StreamMonstersPlugin(api);
    const catalogRead = jest.spyOn(DatabaseManager.prototype, 'getGiftCatalog');
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; }
    };

    try {
      await plugin.init();
      const catalogRoute = routes.find(route => (
        route.method === 'GET' && route.routePath === '/api/streammonsters/gift-catalog'
      ));
      expect(catalogRoute).toBeDefined();
      catalogRoute.handler({ query: { q: 'Documentation Heart', locale: 'de', offset: '0', limit: '100' } }, response);

      expect(api.assertDocsCaptureDatabasePath).toHaveBeenCalledWith(databasePath);
      expect(catalogRead).toHaveBeenCalledWith('de');
      expect(response.statusCode).toBe(200);
      expect(response.payload).toMatchObject({
        success: true,
        total: 1,
        gifts: [{
          giftId: DEMO_GIFT.id,
          giftName: DEMO_GIFT.name,
          coinValue: DEMO_GIFT.diamondCount,
          imageUrl: null
        }]
      });
      expect(plugin.streamMonstersStore.getGiftMappings()).toEqual([
        expect.objectContaining({ gift_id: DEMO_GIFT.id, enabled: 1 })
      ]);
      expect(api.setConfig).not.toHaveBeenCalled();
      expect(api.registerTikTokEvent).not.toHaveBeenCalled();
      expect(api.on).not.toHaveBeenCalled();
      expect(api.emit).not.toHaveBeenCalled();
      expect(api.getPluginDataDir).not.toHaveBeenCalled();
      expect(api.ensurePluginDataDir).not.toHaveBeenCalled();
    } finally {
      catalogRead.mockRestore();
      await plugin.destroy();
      appDatabase.close();
    }
  });
});
