'use strict';

const Database = require('better-sqlite3');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);
const StreamMonstersRoutes = require('../plugins/streamalchemy/backend/streammonsters/routes');
const {
  GAMEPLAY_PACES,
  HATCH_PRESETS,
  PORTRAIT_BATTLE_MODES,
  buildConfigPayload
} = require('../plugins/streamalchemy/streammonsters-creator-runtime');

function response() {
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

function localRequest(body) {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    body
  };
}

function createConfigRouteSubject(stored = {}) {
  const registered = [];
  let persisted = stored;
  const api = {
    getConfig: () => persisted,
    setConfig: (_key, value) => {
      persisted = value;
    },
    log: jest.fn()
  };
  const plugin = new StreamAlchemyPlugin(api);
  plugin.config = plugin.loadConfig(persisted);
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => registered.push({
        method,
        routePath,
        handler
      }),
      emit: jest.fn(),
      log: jest.fn()
    },
    pluginDir: __dirname,
    store: {},
    engine: {
      hatchDurationFor: () => plugin.config.streamMonsters.hatchDurationMs
    },
    configProvider: {
      getConfig: () => plugin.config,
      updateConfig: updates => plugin.updateConfig(updates)
    }
  });
  routes.register();
  return {
    plugin,
    routes,
    persisted: () => persisted,
    find: (method, routePath) => registered.find(route => (
      route.method === method && route.routePath === routePath
    )).handler
  };
}

describe('Stream Monsters 1.11 creator configuration contract', () => {
  test('defaults only fresh setups to 90 seconds and preserves every stored creator duration', () => {
    const plugin = new StreamAlchemyPlugin({
      getConfig: jest.fn(),
      setConfig: jest.fn()
    });

    expect(plugin.loadConfig({}).streamMonsters).toEqual(expect.objectContaining({
      hatchDurationMs: 90_000,
      incubationPresetsMs: [
        30_000,
        60_000,
        90_000,
        120_000,
        300_000,
        600_000,
        1_800_000
      ],
      gameplayPace: 'arcade-rally',
      portraitBattleMode: 'takeover-74'
    }));
    expect(plugin.loadConfig({
      streamMonsters: { hatchDurationMs: 120_000 }
    }).streamMonsters.hatchDurationMs).toBe(120_000);
    expect(plugin.loadConfig({
      streamMonsters: { hatchDurationMs: 1_800_000 }
    }).streamMonsters.hatchDurationMs).toBe(1_800_000);
  });

  test('uses the fresh 90-second default in the standalone game engine', () => {
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();

    const engine = new StreamMonstersEngine({ store });

    expect(engine.config.hatchDurationMs).toBe(90_000);
    sqlite.close();
  });

  test('normalizes the documented portrait boolean once and reloads canonical enums idempotently', () => {
    let saved = null;
    const plugin = new StreamAlchemyPlugin({
      getConfig: jest.fn(),
      setConfig: (_key, value) => {
        saved = value;
      }
    });
    const legacy = {
      streamMonsters: {
        hatchDurationMs: 120_000,
        gameplayPace: 'arcade-rally',
        portraitBattleMode: true
      }
    };

    plugin.config = plugin.loadConfig(legacy);
    expect(plugin.config.streamMonsters).toEqual(expect.objectContaining({
      hatchDurationMs: 120_000,
      gameplayPace: 'arcade-rally',
      portraitBattleMode: 'takeover-74'
    }));
    expect(plugin.persistSanitizedConfigIfNeeded(legacy)).toBe(true);
    const reloaded = new StreamAlchemyPlugin({
      getConfig: jest.fn(),
      setConfig: jest.fn()
    }).loadConfig(saved);
    expect(reloaded.streamMonsters).toEqual(expect.objectContaining({
      hatchDurationMs: 120_000,
      gameplayPace: 'arcade-rally',
      portraitBattleMode: 'takeover-74'
    }));
    expect(plugin.loadConfig(saved)).toEqual(reloaded);
  });

  test('accepts canonical enums and 90 seconds through the real admin route and reloads them', async () => {
    const subject = createConfigRouteSubject({
      streamMonsters: { hatchDurationMs: 120_000 }
    });
    const res = response();

    await subject.find('POST', '/api/streammonsters/config')(localRequest({
      hatchDurationMs: 90_000,
      gameplayPace: 'arcade-rally',
      portraitBattleMode: 'takeover-74'
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.config).toEqual(expect.objectContaining({
      hatchDurationMs: 90_000,
      gameplayPace: 'arcade-rally',
      portraitBattleMode: 'takeover-74'
    }));
    const reloaded = new StreamAlchemyPlugin({
      getConfig: jest.fn(),
      setConfig: jest.fn()
    }).loadConfig(subject.persisted());
    expect(reloaded.streamMonsters).toEqual(expect.objectContaining({
      hatchDurationMs: 90_000,
      gameplayPace: 'arcade-rally',
      portraitBattleMode: 'takeover-74'
    }));
  });

  test.each([
    [{ gameplayPace: 'cinematic' }, 'STREAM_MONSTERS_GAMEPLAY_PACE_INVALID'],
    [{ portraitBattleMode: 'fullscreen' }, 'STREAM_MONSTERS_PORTRAIT_BATTLE_MODE_INVALID'],
    [{ portraitBattleMode: false }, 'STREAM_MONSTERS_PORTRAIT_BATTLE_MODE_INVALID']
  ])('rejects malformed canonical configuration through the real route', async (body, error) => {
    const subject = createConfigRouteSubject();
    const res = response();

    await subject.find('POST', '/api/streammonsters/config')(localRequest(body), res);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ success: false, error });
  });

  test('accepts the documented true portrait legacy value at the admin boundary', async () => {
    const subject = createConfigRouteSubject();
    const res = response();

    await subject.find('POST', '/api/streammonsters/config')(localRequest({
      portraitBattleMode: true
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.config.portraitBattleMode).toBe('takeover-74');
  });

  test('projects only canonical presentation enums into public config and battle snapshots', () => {
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    const service = new BattleMatchService({
      store,
      rulesVersion: 8,
      gameplayPace: 'arcade-rally',
      portraitBattleMode: 'takeover-74',
      autoStart: false
    });
    const routes = new StreamMonstersRoutes({
      api: {},
      pluginDir: __dirname,
      store,
      engine: {},
      battleMatchService: service,
      configProvider: {}
    });

    expect(routes.publicConfig({
      enabled: true,
      gameplayPace: 'arcade-rally',
      portraitBattleMode: 'takeover-74'
    })).toEqual(expect.objectContaining({
      hatchDurationMs: 90_000,
      gameplayPace: 'arcade-rally',
      portraitBattleMode: 'takeover-74'
    }));
    expect(service.getPublicSnapshot()).toEqual(expect.objectContaining({
      gameplayPace: 'arcade-rally',
      portraitBattleMode: 'takeover-74',
      matches: []
    }));
    service.destroy();
    sqlite.close();
  });

  test('keeps persisted egg incubation and ready deadlines unchanged during configuration migration', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE streammonsters_eggs (
        egg_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        gift_id INTEGER NOT NULL,
        gift_name TEXT NOT NULL,
        element TEXT NOT NULL,
        egg_color TEXT NOT NULL,
        seed TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'incubating',
        created_at_ms INTEGER NOT NULL,
        hatch_duration_ms INTEGER NOT NULL,
        boost_ms INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        monster_id TEXT,
        variant TEXT NOT NULL DEFAULT 'standard',
        ready_at_ms INTEGER,
        visual_source TEXT NOT NULL DEFAULT 'egg_asset',
        visual_key TEXT
      );
      INSERT INTO streammonsters_eggs (
        egg_id, user_id, gift_id, gift_name, element, egg_color, seed,
        created_at_ms, hatch_duration_ms, ready_at_ms
      ) VALUES (
        'existing-120s-egg', 'viewer-a', 1, 'Team Heart', 'Volt', '#fff', 'seed',
        1000, 120000, 121000
      );
    `);
    const store = new StreamMonstersDatabase(sqlite);

    store.initialize();

    expect(store.getEgg('existing-120s-egg')).toEqual(expect.objectContaining({
      hatch_duration_ms: 120_000,
      ready_at_ms: 121_000
    }));
    sqlite.close();
  });

  test('creator runtime emits the full preset list and canonical presentation values', () => {
    expect(HATCH_PRESETS).toEqual([
      30_000,
      60_000,
      90_000,
      120_000,
      300_000,
      600_000,
      1_800_000
    ]);
    expect(GAMEPLAY_PACES).toEqual(['arcade-rally']);
    expect(PORTRAIT_BATTLE_MODES).toEqual(['takeover-74']);
    expect(buildConfigPayload({
      values: {
        hatchDurationMs: '90000',
        gameplayPace: 'arcade-rally',
        portraitBattleMode: 'takeover-74'
      }
    })).toEqual(expect.objectContaining({
      hatchDurationMs: 90_000,
      gameplayPace: 'arcade-rally',
      portraitBattleMode: 'takeover-74'
    }));
  });
});
