const Database = require('better-sqlite3');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const StreamMonstersRoutes = require('../plugins/streamalchemy/backend/streammonsters/routes');

function createStore() {
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  return store;
}

function createEngine({ now = () => 1_000, config = {} } = {}) {
  const store = createStore();
  const engine = new StreamMonstersEngine({
    store,
    now,
    config: { hatchDurationMs: 120_000, maxUnhatchedEggs: 3, ...config }
  });
  return { store, engine };
}

function createPlugin({ store, engine, config = {} }) {
  const plugin = new StreamAlchemyPlugin({
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    log: jest.fn()
  });
  plugin.config = {
    enabled: true,
    streamMonsters: { enabled: true, giftMappingCustomized: false, ...config }
  };
  plugin.streamMonstersStore = store;
  plugin.streamMonstersEngine = engine;
  plugin.resolveStreamMonstersViewerId = jest.fn(() => 'viewer-a');
  return plugin;
}

function createRoutes({ store, engine, config = {} }) {
  const registered = [];
  const routes = new StreamMonstersRoutes({
    api: { registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }) },
    pluginDir: __dirname,
    store,
    engine,
    generationPool: {},
    systemAnalyzer: {},
    managedRuntime: {},
    localModelInstaller: {},
    giftCatalogProvider: () => [{ id: 901, name: 'Heart Me', diamond_count: 1 }],
    configProvider: {
      getConfig: () => ({ streamMonsters: { enabled: true, hatchDurationMs: 120_000, ...config } }),
      updateConfig: jest.fn(update => ({ streamMonsters: { enabled: true, hatchDurationMs: 120_000, ...config, ...update.streamMonsters } }))
    }
  });
  routes.register();
  return {
    routes,
    find: (method, routePath) => registered.find(route => route.method === method && route.routePath === routePath).handler
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    sendFile: jest.fn()
  };
}

describe('Stream Monsters rules version 3 core gift and incubation rules', () => {
  test('discovers Team Heart by catalog name without a fixed gift ID and never restores it after customization', () => {
    const { store, engine } = createEngine();
    const plugin = createPlugin({ store, engine });
    plugin.getStreamMonstersGiftCatalog = () => [
      { id: 77, name: 'Rose' },
      { id: 481516, name: '  TEAM   Heart  ', diamond_count: 1 }
    ];

    expect(plugin.ensureDefaultStreamMonstersGiftMapping()).toEqual(expect.objectContaining({
      gift_id: 481516,
      gift_name: '  TEAM   Heart  ',
      effect: 'spawn',
      element: 'Random'
    }));

    store.deleteGiftMapping(481516);
    plugin.config.streamMonsters.giftMappingCustomized = true;
    expect(plugin.ensureDefaultStreamMonstersGiftMapping()).toBeNull();
    expect(store.getGiftMappings()).toEqual([]);

    plugin.config.streamMonsters.giftMappingCustomized = false;
    store.upsertGiftMapping({ giftId: 42, giftName: 'Creator choice', effect: 'spawn', element: 'Volt', enabled: false });
    expect(plugin.ensureDefaultStreamMonstersGiftMapping()).toBeNull();
    expect(store.getGiftMapping(481516)).toBeNull();
  });

  test('learns the real Heart Me ID from an untouched live gift and processes that event once', async () => {
    const { store, engine } = createEngine();
    const plugin = createPlugin({ store, engine });

    await plugin.handleStreamMonstersGift({
      userId: 'platform-viewer-a',
      giftId: '987654',
      giftName: 'Heart Me',
      diamondCount: 1
    });

    expect(store.getGiftMapping(987654)).toEqual(expect.objectContaining({
      gift_id: 987654,
      effect: 'spawn',
      element: 'Random'
    }));
    expect(store.getViewerEggs('viewer-a')).toHaveLength(1);
  });

  test('uses a persistent six-element Random bag per stream and gift mapping', () => {
    const { store, engine } = createEngine();
    store.upsertGiftMapping({
      giftId: 901,
      giftName: 'Heart Me',
      element: 'Random',
      effect: 'spawn',
      enabled: true
    });
    engine.setStreamKey('creator:session-a');

    const elements = Array.from(
      { length: 12 },
      () => engine.selectRandomElement({ giftId: 901 })
    );
    const expected = new Set(['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar']);

    expect(new Set(elements.slice(0, 6))).toEqual(expected);
    expect(new Set(elements.slice(6, 12))).toEqual(expected);
    expect(store.getElementBag('creator:session-a', 901)).toEqual(expect.objectContaining({
      cycle: 1,
      position: 6
    }));
  });

  test('uses the seven approved presets, defaults fresh rules to 90 seconds, and preserves saved durations', () => {
    const plugin = new StreamAlchemyPlugin({ getConfig: jest.fn(), setConfig: jest.fn() });
    expect(plugin.loadConfig({ streamMonsters: {} }).streamMonsters).toEqual(expect.objectContaining({
      rulesVersion: 8,
      hatchDurationMs: 90_000
    }));
    expect(plugin.loadConfig({ streamMonsters: { hatchDurationMs: 1_800_000 } }).streamMonsters.hatchDurationMs)
      .toBe(1_800_000);
    expect(plugin.loadConfig({ streamMonsters: { rulesVersion: 2, hatchDurationMs: 300_000 } }).streamMonsters)
      .toEqual(expect.objectContaining({ rulesVersion: 8, hatchDurationMs: 300_000 }));

    const { store, engine } = createEngine();
    const { routes } = createRoutes({ store, engine });
    expect([30_000, 60_000, 90_000, 120_000, 300_000, 600_000, 1_800_000].map(value => (
      routes.sanitizeConfigUpdate({ hatchDurationMs: value }).hatchDurationMs
    ))).toEqual([30_000, 60_000, 90_000, 120_000, 300_000, 600_000, 1_800_000]);
  });

  test('queues paid overflow eggs, promotes them FIFO after ready eggs, and never boosts queued eggs', () => {
    let now = 1_000;
    const { store, engine } = createEngine({ now: () => now, config: { hatchDurationMs: 100 } });
    store.upsertGiftMapping({ giftId: 1, giftName: 'Spawn', element: 'Ember', effect: 'spawn', enabled: true });
    store.upsertGiftMapping({ giftId: 2, giftName: 'Boost', effect: 'boost', enabled: true });

    for (let index = 0; index < 5; index += 1) {
      engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Spawn', coinValue: 1 });
      now += 1;
    }
    const before = store.getViewerEggs('viewer-a');
    expect(before.map(egg => egg.state)).toEqual(['incubating', 'incubating', 'incubating', 'queued', 'queued']);
    expect(before.slice(3).map(egg => egg.incubating_at_ms)).toEqual([null, null]);

    engine.processGift({ userId: 'viewer-a', giftId: 2, giftName: 'Boost', coinValue: 10 });
    expect(store.getViewerEggs('viewer-a')[3].boost_ms).toBe(0);

    now = 1_101;
    engine.markReadyEggs();
    const after = store.getViewerEggs('viewer-a');
    expect(after.slice(0, 3).map(egg => egg.state)).toEqual(['ready', 'ready', 'incubating']);
    expect(after.slice(3).map(egg => egg.state)).toEqual(['incubating', 'incubating']);
    expect(after.slice(3).map(egg => egg.incubating_at_ms)).toEqual([1_101, 1_101]);
    expect(after.slice(3).map(egg => egg.ready_at_ms)).toEqual([1_201, 1_201]);
  });

  test('keeps pre-existing egg timestamps untouched and exposes queue plus effective duration in state', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE streammonsters_eggs (
        egg_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, gift_id INTEGER NOT NULL, gift_name TEXT NOT NULL,
        element TEXT NOT NULL, egg_color TEXT NOT NULL, seed TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'incubating',
        created_at_ms INTEGER NOT NULL, hatch_duration_ms INTEGER NOT NULL, boost_ms INTEGER NOT NULL DEFAULT 0,
        image_url TEXT, monster_id TEXT, variant TEXT NOT NULL DEFAULT 'standard', ready_at_ms INTEGER,
        visual_source TEXT NOT NULL DEFAULT 'egg_asset', visual_key TEXT
      );
      INSERT INTO streammonsters_eggs VALUES (
        'old', 'viewer-a', 1, 'Old', 'Ember', '#fff', 'seed', 'incubating', 1, 1800000, 0,
        NULL, NULL, 'standard', 1800001, 'egg_asset', NULL
      );
    `);
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    expect(store.getEgg('old')).toEqual(expect.objectContaining({
      created_at_ms: 1,
      hatch_duration_ms: 1_800_000,
      ready_at_ms: 1_800_001,
      queued_at_ms: null,
      incubating_at_ms: null
    }));

    const engine = new StreamMonstersEngine({ store, config: { hatchDurationMs: 120_000 } });
    const { find } = createRoutes({ store, engine });
    const state = response();
    find('GET', '/api/streammonsters/state')({ query: { userId: 'viewer-a' } }, state);
    expect(state.body).toEqual(expect.objectContaining({
      effectiveHatchDurationMs: 120_000,
      visualPack: 'furry'
    }));
  });

  test('accepts Random mappings and validates the approved visual configuration fields', () => {
    const { store, engine } = createEngine();
    const { routes, find } = createRoutes({ store, engine });
    expect(routes.sanitizeConfigUpdate({
      giftMappingCustomized: true,
      visualPack: 'kenney',
      landscapeAnchor: 'top-right',
      portraitAnchor: 'bottom-left',
      landscapeScale: 70,
      portraitScale: 130
    })).toEqual(expect.objectContaining({
      giftMappingCustomized: true,
      visualPack: 'furry',
      layouts: {
        landscape: { anchor: 'top-right', scale: 70 },
        portrait: { anchor: 'bottom-left', scale: 130 }
      }
    }));
    expect(routes.sanitizeConfigUpdate({ visualPack: 'other', landscapeScale: 69, portraitScale: 131 }))
      .toEqual({ visualPack: 'furry' });

    const put = response();
    find('PUT', '/api/streammonsters/gift-mappings/:giftId')({
      ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, headers: {},
      params: { giftId: '901' }, body: { enabled: true, effect: 'spawn', element: 'Random' }
    }, put);
    expect(put.body.mapping).toEqual(expect.objectContaining({ element: 'Random' }));
  });
});
