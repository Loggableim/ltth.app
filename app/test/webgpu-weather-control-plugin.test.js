const fs = require('fs');
const path = require('path');
const Sqlite = require('better-sqlite3');

const pluginPath = path.join(__dirname, '../plugins/webgpu-weather-control/main');

function createDatabase() {
  const db = new Sqlite(':memory:');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE gift_weather_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gift_id INTEGER UNIQUE NOT NULL,
      weather_effect TEXT NOT NULL,
      intensity REAL DEFAULT 0.5,
      duration INTEGER DEFAULT 10000,
      enabled INTEGER DEFAULT 1
    );
    CREATE TABLE webgpu_gift_weather_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gift_id INTEGER UNIQUE NOT NULL,
      weather_effect TEXT NOT NULL,
      intensity REAL DEFAULT 0.5,
      duration INTEGER DEFAULT 10000,
      enabled INTEGER DEFAULT 1
    );
  `);
  return db;
}

function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

function createMockApi(db) {
  const routes = [];
  const sockets = [];
  const flowActions = [];
  const emitted = [];
  const gcce = {
    registerCommandsForPlugin: jest.fn(() => ({ registered: ['wgweather', 'wgweatherlist', 'wgweatherstop'], failed: [] })),
    unregisterCommandsForPlugin: jest.fn()
  };
  return {
    routes,
    sockets,
    flowActions,
    emitted,
    log: jest.fn(),
    getDatabase: jest.fn(() => ({ db })),
    registerRoute: jest.fn((method, route, handler) => routes.push({ method, route, handler })),
    registerSocket: jest.fn((event, handler) => sockets.push({ event, handler })),
    registerTikTokEvent: jest.fn(),
    registerFlowAction: jest.fn((name, handler) => flowActions.push({ name, handler })),
    getPlugin: jest.fn((id) => id === 'gcce' ? gcce : null),
    emit: jest.fn((event, payload) => emitted.push({ event, payload })),
    gcce
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

describe('WebGPU Weather Control independent plugin surface', () => {
  let WebgpuWeatherControlPlugin;
  let migrateWebgpuWeatherStorage;

  beforeEach(() => {
    jest.resetModules();
    ({ WebgpuWeatherControlPlugin, migrateWebgpuWeatherStorage } = require(pluginPath));
  });

  test('migrates classic settings and mappings once in one transaction without runtime state', () => {
    const db = createDatabase();
    setSetting(db, 'plugin:weather-control:weather_config', {
      enabled: true,
      apiKey: 'classic-key',
      effects: { rain: { permanent: true, defaultIntensity: 0.8 } },
      gamification: { enabled: true, state: { communityMeter: { current: 99 } } }
    });
    db.prepare('INSERT INTO gift_weather_mappings (gift_id, weather_effect, intensity, duration, enabled) VALUES (?, ?, ?, ?, ?)')
      .run(42, 'storm', 0.8, 12000, 1);

    const first = migrateWebgpuWeatherStorage({ db }, () => 'webgpu-migration-key');
    const config = getSetting(db, 'plugin:webgpu-weather-control:weather_config');

    expect(first.migrated).toBe(true);
    expect(config).toMatchObject({
      enabled: false,
      apiKey: 'webgpu-migration-key',
      gamification: { enabled: false, overlay: { enabled: false }, state: { communityMeter: { current: 0 } } }
    });
    expect(config.effects.rain.permanent).toBe(false);
    expect(db.prepare('SELECT * FROM webgpu_gift_weather_mappings WHERE gift_id = 42').get()).toMatchObject({
      weather_effect: 'storm', intensity: 0.8, duration: 12000, enabled: 1
    });
    expect(getSetting(db, 'plugin:webgpu-weather-control:bootstrap_v1')).toMatchObject({ version: 1 });

    db.prepare('UPDATE gift_weather_mappings SET weather_effect = ? WHERE gift_id = 42').run('snow');
    const second = migrateWebgpuWeatherStorage({ db }, () => 'must-not-overwrite');
    expect(second.migrated).toBe(false);
    expect(getSetting(db, 'plugin:webgpu-weather-control:weather_config').apiKey).toBe('webgpu-migration-key');
    expect(db.prepare('SELECT weather_effect FROM webgpu_gift_weather_mappings WHERE gift_id = 42').get().weather_effect).toBe('storm');
    db.close();
  });

  test('rolls back the config and marker when a mapping import fails', () => {
    const db = createDatabase();
    setSetting(db, 'plugin:weather-control:weather_config', { enabled: true });
    db.prepare('INSERT INTO gift_weather_mappings (gift_id, weather_effect) VALUES (?, ?)').run(7, 'rain');
    db.exec(`CREATE TRIGGER fail_webgpu_mapping BEFORE INSERT ON webgpu_gift_weather_mappings BEGIN SELECT RAISE(ABORT, 'mapping failure'); END;`);

    expect(() => migrateWebgpuWeatherStorage({ db }, () => 'never-persisted')).toThrow('mapping failure');
    expect(getSetting(db, 'plugin:webgpu-weather-control:weather_config')).toBeNull();
    expect(getSetting(db, 'plugin:webgpu-weather-control:bootstrap_v1')).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS count FROM webgpu_gift_weather_mappings').get().count).toBe(0);
    db.close();
  });

  test('creates a safe disabled first config when the classic plugin data is absent', () => {
    const db = createDatabase();
    const result = migrateWebgpuWeatherStorage({ db }, () => 'fresh-webgpu-key');

    expect(result.config).toMatchObject({
      enabled: false,
      apiKey: 'fresh-webgpu-key',
      gamification: { enabled: false, overlay: { enabled: false } }
    });
    db.close();
  });

  test.each([
    ['a null config row', 'plugin:webgpu-weather-control:weather_config', 'null'],
    ['a corrupt config row', 'plugin:webgpu-weather-control:weather_config', '{invalid-json'],
    ['a null completion marker', 'plugin:webgpu-weather-control:bootstrap_v1', 'null'],
    ['a corrupt completion marker', 'plugin:webgpu-weather-control:bootstrap_v1', '{invalid-json']
  ])('never imports or overwrites when %s already exists', (label, key, rawValue) => {
    const db = createDatabase();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, rawValue);
    setSetting(db, 'plugin:weather-control:weather_config', { enabled: true });
    db.prepare('INSERT INTO gift_weather_mappings (gift_id, weather_effect) VALUES (?, ?)').run(91, 'storm');

    const result = migrateWebgpuWeatherStorage({ db }, () => 'must-not-be-used');

    expect(label).toBeTruthy();
    expect(result.migrated).toBe(false);
    expect(db.prepare('SELECT value FROM settings WHERE key = ?').get(key).value).toBe(rawValue);
    expect(db.prepare('SELECT COUNT(*) AS count FROM webgpu_gift_weather_mappings').get().count).toBe(0);
    db.close();
  });

  test('uses only the WebGPU routes, key header, sockets, flows, and GCCE commands', async () => {
    const db = createDatabase();
    const api = createMockApi(db);
    const plugin = new WebgpuWeatherControlPlugin(api);
    await plugin.init();

    expect(api.routes.map(({ route }) => route)).toEqual(expect.arrayContaining([
      '/webgpu-weather-control/ui',
      '/webgpu-weather-control/overlay',
      '/api/webgpu-weather/config',
      '/api/webgpu-weather/trigger'
    ]));
    expect(api.routes.map(({ route }) => route).some(route => route.startsWith('/api/weather/'))).toBe(false);
    expect(api.sockets.map(({ event }) => event)).toEqual(expect.arrayContaining([
      'webgpu-weather:trigger',
      'webgpu-weather:stop'
    ]));
    expect(api.sockets.map(({ event }) => event).some(event => event.startsWith('weather:'))).toBe(false);
    expect(api.flowActions.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'webgpu-weather.trigger',
      'webgpu-weather.stop'
    ]));
    expect(api.gcce.registerCommandsForPlugin).toHaveBeenCalledWith('webgpu-weather-control', expect.arrayContaining([
      expect.objectContaining({ name: 'wgweather' }),
      expect.objectContaining({ name: 'wgweatherlist' }),
      expect.objectContaining({ name: 'wgweatherstop' })
    ]));

    const triggerRoute = api.routes.find(({ route }) => route === '/api/webgpu-weather/trigger').handler;
    const denied = createResponse();
    await triggerRoute({ headers: {}, body: { action: 'rain' } }, denied);
    expect(denied.statusCode).toBe(401);

    plugin.config.enabled = true;
    const accepted = createResponse();
    await triggerRoute({ headers: { 'x-webgpu-weather-key': plugin.apiKey }, body: { action: 'rain', intensity: 0.5, duration: 1000 } }, accepted);
    expect(accepted.statusCode).toBe(200);
    expect(api.emitted).toContainEqual(expect.objectContaining({ event: 'webgpu-weather:trigger' }));
    expect(api.emitted.some(({ event }) => event.startsWith('weather:'))).toBe(false);
    db.close();
  });

  test('ships a transparent renderer-free overlay and four locale files under the new namespace', () => {
    const pluginDir = path.join(__dirname, '../plugins/webgpu-weather-control');
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
    const overlay = fs.readFileSync(path.join(pluginDir, 'overlay.html'), 'utf8');
    const ui = fs.readFileSync(path.join(pluginDir, 'ui.html'), 'utf8');

    expect(manifest).toMatchObject({ id: 'webgpu-weather-control', version: '1.0.0', enabled: false, devStatus: 'working-beta' });
    expect(manifest.description).toContain('WebGPU');
    expect(overlay).not.toContain('getContext(');
    expect(overlay).not.toContain('weather-engine.js');
    expect(overlay).toContain('webgpu-weather:diagnostics');
    expect(overlay).toContain('communityHud');
    expect(overlay).toContain('hudMeter');
    expect(overlay).toContain('hudQuest');
    expect(overlay).toContain('hudStreak');
    expect(overlay).toContain('hudRewardFeed');
    expect(ui).toContain('/api/webgpu-weather/config');

    const localeKeys = ['de', 'en', 'es', 'fr'].map((locale) => Object.keys(JSON.parse(
      fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8')
    )).sort());
    expect(localeKeys.every((keys) => JSON.stringify(keys) === JSON.stringify(localeKeys[0]))).toBe(true);
  });

  test('keeps the complete classic control surface on isolated WebGPU endpoints', async () => {
    const db = createDatabase();
    const api = createMockApi(db);
    const plugin = new WebgpuWeatherControlPlugin(api);
    await plugin.init();

    const routes = api.routes.map(({ route }) => route);
    expect(routes).toEqual(expect.arrayContaining([
      '/api/webgpu-weather/effects',
      '/api/webgpu-weather/gamification',
      '/api/webgpu-weather/gamification/reset',
      '/api/webgpu-weather/sequence/trigger',
      '/api/webgpu-weather/gift-mappings',
      '/api/webgpu-weather/gift-mappings/:giftId',
      '/api/webgpu-weather/reset-key'
    ]));

    const pluginDir = path.join(__dirname, '../plugins/webgpu-weather-control');
    const ui = fs.readFileSync(path.join(pluginDir, 'ui.html'), 'utf8');
    ['effect-rain-enabled', 'giftMappingList', 'sequenceSteps', 'audioEnabled', 'permissionsEnabled', 'gamificationEnabled', 'qualityPreset'].forEach((control) => {
      expect(ui).toContain(control);
    });
    expect(ui).toContain('/api/webgpu-weather/gift-mappings');
    expect(ui).toContain('webgpuStorageDiagnostic');
    expect(ui).not.toContain('/api/weather/');
    expect(ui).not.toContain("'weather:");
    db.close();
  });
});
