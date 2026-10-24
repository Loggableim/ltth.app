const schema = require('../lib/settings-schema');
const ClarityHUDBackend = require('../backend/api');

jest.mock('../../../modules/tiktok', () => class MockTikTokConnector {});

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function createBackend() {
  const routes = new Map();
  const api = {
    getConfig: jest.fn(async () => null),
    setConfig: jest.fn(async () => {}),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method} ${route}`, handler)),
    emit: jest.fn(),
    log: jest.fn(),
    getSocketIO: jest.fn(() => ({})),
    getDatabase: jest.fn(() => ({ getSetting: () => null, getGift: () => null, getGiftCatalog: () => [] }))
  };
  const backend = new ClarityHUDBackend(api);
  backend.registerRoutes();
  return { backend, api, routes };
}

async function call(routes, method, route, req = {}) {
  const handler = routes.get(`${method} ${route}`);
  expect(handler).toBeDefined();
  const res = response();
  await handler({ params: {}, body: {}, ...req }, res);
  return res;
}

describe('ClarityHUD profile import regressions', () => {
  test('accepts a complete own export including the two color-named boolean settings', async () => {
    const { backend, routes } = createBackend();
    const profile = schema.createProfile(backend.settings, backend.customPresets);

    expect(schema.validateProfile(profile)).toMatchObject({ valid: true, errors: [] });
    const imported = await call(routes, 'post', '/api/clarityhud/profile/import', { body: { profile } });
    expect(imported.statusCode).toBe(200);
    expect(imported.body.success).toBe(true);
    expect(imported.body.settings.chat.colorblindSafeMode).toBe(false);
    expect(imported.body.settings.chat.usernameColorByTeamLevel).toBe(true);
    expect(imported.body.settings.full.colorblindSafeMode).toBe(false);
    expect(imported.body.settings.full.usernameColorByTeamLevel).toBe(true);
  });

  test('restores an explicitly empty custom preset list and persists it', async () => {
    const { backend, api, routes } = createBackend();
    backend.customPresets = [{ id: 'custom-existing', name: 'Keep only if omitted', settings: {} }];
    const profile = schema.createProfile(backend.settings, []);

    const imported = await call(routes, 'post', '/api/clarityhud/profile/import', { body: { profile } });

    expect(imported.statusCode).toBe(200);
    expect(imported.body.customPresets).toEqual([]);
    expect(backend.customPresets).toEqual([]);
    expect(api.setConfig).toHaveBeenCalledWith('clarityhud.customPresets', []);
  });

  test('leaves custom presets unchanged for a partial profile that omits the field', async () => {
    const { backend, api, routes } = createBackend();
    const existing = [{ id: 'custom-existing', name: 'Keep this', settings: {} }];
    backend.customPresets = existing;

    const imported = await call(routes, 'post', '/api/clarityhud/profile/import', {
      body: { profile: { plugin: 'clarityhud', settings: {} } }
    });

    expect(imported.statusCode).toBe(200);
    expect(imported.body.customPresets).toEqual(existing);
    expect(api.setConfig).not.toHaveBeenCalledWith('clarityhud.customPresets', expect.anything());
  });
});

{
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { PluginAPI } = require('../../../modules/plugin-loader');
const Backend = require('../backend/api');
const schema = require('../lib/settings-schema');
jest.mock('../../../modules/tiktok', () => class MockTikTokConnector {});

describe('Original profile import with original PluginAPI SQLite persistence', () => {
  let directory, db, backend, routes, api;
  const existing = [{ id: 'custom-existing', name: 'Existing', settings: {} }];
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-preset-type-'));
    db = new Database(path.join(directory, 'settings.sqlite'));
    db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
    routes = new Map();
    api = {
      pluginId: 'clarityhud', db, log: jest.fn(), emit: jest.fn(),
      getConfig: () => null, setConfig: PluginAPI.prototype.setConfig,
      registerRoute: (method, route, handler) => routes.set(`${method} ${route}`, handler)
    };
    backend = new Backend(api);
    backend.customPresets = schema.clone(existing);
    api.setConfig('clarityhud.customPresets', existing);
    backend.registerRoutes();
  });
  afterEach(() => {
    if (db.open) db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  async function importProfile(profile) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await routes.get('post /api/clarityhud/profile/import')({ body: { profile } }, res);
    return res;
  }
  function persisted() {
    return JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get('plugin:clarityhud:clarityhud.customPresets').value);
  }
  test.each([null, 'invalid', {}, 7, false])('rejects explicit invalid preset type %p before settings mutation', async customPresets => {
    const before = schema.clone(backend.settings);
    const res = await importProfile({ settings: { full: { showSubs: false, showJoins: false } }, customPresets });
    expect(res.code).toBe(400);
    expect(backend.customPresets).toEqual(existing);
    expect(persisted()).toEqual(existing);
    expect(backend.settings).toEqual(before);
    expect(api.emit).not.toHaveBeenCalled();
  });
  test('empty array survives database reopen; omitted field preserves persisted list', async () => {
    expect((await importProfile({ settings: {}, customPresets: [] })).code).toBe(200);
    db.close();
    db = new Database(path.join(directory, 'settings.sqlite')); api.db = db;
    expect(persisted()).toEqual([]);
    api.setConfig('clarityhud.customPresets', existing); backend.customPresets = schema.clone(existing);
    expect((await importProfile({ settings: {} })).code).toBe(200);
    expect(persisted()).toEqual(existing);
  });
  test('full own export retains both boolean values and independent subscription/join display flags', async () => {
    backend.settings.full.showSubs = false;
    backend.settings.full.showJoins = true;
    backend.settings.full.colorblindSafeMode = true;
    backend.settings.full.usernameColorByTeamLevel = false;
    const profile = schema.createProfile(backend.settings, existing);
    const res = await importProfile(profile);
    expect(res.code).toBe(200);
    expect(res.body.settings).toEqual(profile.settings);
    expect(res.body.settings.full).toMatchObject({ showSubs: false, showJoins: true, colorblindSafeMode: true, usernameColorByTeamLevel: false });
  });
});

}
