const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const ProgressionService = require('../plugins/streamalchemy/backend/streammonsters/progression-service');
const StreamMonstersRoutes = require('../plugins/streamalchemy/backend/streammonsters/routes');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    sendFile: jest.fn(),
    send: jest.fn()
  };
}

function createRoutes() {
  const registered = [];
  const emitted = [];
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const engine = new StreamMonstersEngine({ store });
  engine.setStreamKey('creator:routes');
  const progression = new ProgressionService({
    store,
    now: () => new Date('2026-07-23T12:00:00Z')
  });
  const catalog = Array.from({ length: 175 }, (_, index) => ({
    id: index + 1,
    name: index === 149 ? 'Crystal Comet' : `Gift ${index + 1}`,
    diamond_count: index + 1,
    image_url: `/gift-${index + 1}.png`
  }));
  const artPool = {
    prepare: jest.fn(async input => ({ targetPerVariant: input.targetPerVariant, coverage: [] }))
  };
  const configProvider = {
    getConfig: () => ({
      streamMonsters: {
        enabled: true,
        creatorName: 'Creator',
        hatchDurationMs: 300000,
        maxUnhatchedEggs: 3,
        artPoolTarget: 3
      },
      localGeneration: {}
    }),
    updateConfig: jest.fn(update => ({
      streamMonsters: {
        ...update.streamMonsters
      }
    }))
  };
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }),
      emit: (event, payload) => emitted.push({ event, payload })
    },
    pluginDir: 'C:\\LTTH\\plugins\\streamalchemy',
    dataDir: 'C:\\LTTH\\data\\streamalchemy',
    store,
    engine,
    progression,
    artPool,
    generationPool: { preparePending: jest.fn() },
    giftCatalogProvider: () => catalog,
    systemAnalyzer: { analyze: jest.fn(async () => ({ gpu: {} })) },
    managedRuntime: {
      current: null,
      getTrustedManifest: jest.fn(() => null),
      recommend: jest.fn(() => ({ supported: false })),
      resolveRuntimeRoot: jest.fn()
    },
    localModelInstaller: null,
    configProvider
  });
  routes.register();
  const find = (method, routePath) => registered.find(route => (
    route.method === method && route.routePath === routePath
  )).handler;
  return { find, store, artPool, emitted, configProvider, routes };
}

describe('Stream Monsters 1.2 public API', () => {
  test('returns the complete catalog without paging and supports bounded search paging', () => {
    const { find } = createRoutes();
    const all = response();
    find('GET', '/api/streammonsters/gift-catalog')({ query: {} }, all);
    expect(all.body).toEqual(expect.objectContaining({
      gifts: expect.any(Array),
      total: 175,
      offset: 0,
      limit: 175
    }));
    expect(all.body.gifts).toHaveLength(175);

    const searched = response();
    find('GET', '/api/streammonsters/gift-catalog')({
      query: { q: 'crystal', offset: '0', limit: '20', locale: 'de' }
    }, searched);
    expect(searched.body).toEqual(expect.objectContaining({
      total: 1,
      offset: 0,
      limit: 20,
      gifts: [expect.objectContaining({ giftId: 150, giftName: 'Crystal Comet' })]
    }));

    const unknownLocale = response();
    expect(() => find('GET', '/api/streammonsters/gift-catalog')({
      query: { q: 'crystal', locale: 'not-a-real-locale' }
    }, unknownLocale)).not.toThrow();
    expect(unknownLocale.body.total).toBe(1);
  });

  test('persists a clamped art pool target through the public config update', () => {
    const { find, configProvider } = createRoutes();
    const result = response();

    find('POST', '/api/streammonsters/config')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { artPoolTarget: 99 }
    }, result);

    expect(result.statusCode).toBe(200);
    expect(result.body.config.artPoolTarget).toBe(8);
    expect(configProvider.updateConfig).toHaveBeenCalledWith({
      streamMonsters: { artPoolTarget: 8 }
    });
  });

  test('persists a readable bottom-overlay duration within the supported bounds', () => {
    const { find, configProvider, emitted } = createRoutes();
    const result = response();

    find('POST', '/api/streammonsters/config')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { bottomOverlayDurationMs: 99_999 }
    }, result);

    expect(result.statusCode).toBe(200);
    expect(result.body.config.bottomOverlayDurationMs).toBe(20_000);
    expect(configProvider.updateConfig).toHaveBeenCalledWith({
      streamMonsters: { bottomOverlayDurationMs: 20_000 }
    });
    expect(emitted).toContainEqual({
      event: 'streammonsters:config_changed',
      payload: { config: expect.objectContaining({ bottomOverlayDurationMs: 20_000 }) }
    });

    const minimum = response();
    find('POST', '/api/streammonsters/config')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { bottomOverlayDurationMs: 4_000 }
    }, minimum);
    expect(minimum.body.config.bottomOverlayDurationMs).toBe(8_000);
  });

  test('exposes the public match snapshot and the viewer-owned stat prompt in state', () => {
    const { find, routes } = createRoutes();
    routes.commandStatusProvider = () => ({ prefix: '/', gcceRegistered: true });
    routes.battleMatchService = {
      getPublicSnapshot: jest.fn(userId => ({
        match: { matchId: 'match-1', phase: 'skill_selection' },
        pendingStatChoice: { monsterId: 'monster-1', deadlineAtMs: 1234 },
        viewer: userId
      }))
    };
    const result = response();

    find('GET', '/api/streammonsters/state')({ query: { userId: 'viewer-a' } }, result);

    expect(result.body).toEqual(expect.objectContaining({
      battle: expect.objectContaining({ match: expect.objectContaining({ matchId: 'match-1' }) }),
      pendingStatChoice: expect.objectContaining({ monsterId: 'monster-1' }),
      commandPrefix: '/',
      gcceRegistered: true
    }));
  });

  test('persists furry as the selected visual pack', () => {
    const { find, configProvider } = createRoutes();
    const result = response();

    find('POST', '/api/streammonsters/config')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { visualPack: 'furry' }
    }, result);

    expect(result.statusCode).toBe(200);
    expect(result.body.config.visualPack).toBe('furry');
    expect(configProvider.updateConfig).toHaveBeenCalledWith({
      streamMonsters: { visualPack: 'furry' }
    });
  });

  test('accepts multiple sanitized chat aliases per Stream Monsters action', () => {
    const { find, configProvider } = createRoutes();
    const result = response();

    find('POST', '/api/streammonsters/config')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: {
        commandAliases: {
          eggs: ['Eierliste', '!MeineEier', 'eierliste', 'not valid'],
          hatch: 'schluepfen, ausbrueten',
          unknown: ['ignored']
        }
      }
    }, result);

    expect(result.statusCode).toBe(200);
    expect(configProvider.updateConfig).toHaveBeenCalledWith({
      streamMonsters: {
        commandAliases: {
          eggs: ['eierliste', 'meineeier'],
          hatch: ['schluepfen', 'ausbrueten']
        }
      }
    });
  });

  test('creates, lists and deletes only curated gift mappings', () => {
    const { find } = createRoutes();
    const remote = response();
    find('PUT', '/api/streammonsters/gift-mappings/:giftId')({
      ip: '203.0.113.10',
      headers: {},
      params: { giftId: '150' },
      body: { enabled: true, effect: 'spawn', element: 'Lunar' }
    }, remote);
    expect(remote.statusCode).toBe(403);

    const put = response();
    find('PUT', '/api/streammonsters/gift-mappings/:giftId')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      params: { giftId: '150' },
      body: { enabled: true, effect: 'spawn', element: 'Lunar' }
    }, put);
    expect(put.body.mapping).toEqual(expect.objectContaining({
      gift_id: 150,
      gift_name: 'Crystal Comet',
      element: 'Lunar',
      enabled: 1
    }));

    const random = response();
    find('PUT', '/api/streammonsters/gift-mappings/:giftId')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      params: { giftId: '149' },
      body: { enabled: true, effect: 'spawn', element: 'Random' }
    }, random);
    expect(random.statusCode).toBe(200);
    expect(random.body.mapping).toEqual(expect.objectContaining({
      gift_id: 149,
      element: 'Random',
      effect: 'spawn',
      enabled: 1
    }));

    const list = response();
    find('GET', '/api/streammonsters/gift-mappings')({}, list);
    expect(list.body.mappings).toHaveLength(2);

    const deleted = response();
    find('DELETE', '/api/streammonsters/gift-mappings/:giftId')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      params: { giftId: '150' }
    }, deleted);
    expect(deleted.body.removed).toBe(true);
  });

  test('exposes season, leaderboard and expanded viewer state', () => {
    const { find, store } = createRoutes();
    store.addStreamHype('creator:routes', 40, 1);
    store.unlockAchievement('viewer-a', 'first_hatch', 1);

    const state = response();
    find('GET', '/api/streammonsters/state')({ query: { userId: 'viewer-a' } }, state);
    expect(state.body).toEqual(expect.objectContaining({
      hype: expect.objectContaining({ points: 40 }),
      season: expect.objectContaining({ season_id: expect.any(String) }),
      viewer: expect.objectContaining({
        achievements: [expect.objectContaining({ achievement_key: 'first_hatch' })],
        rank: expect.objectContaining({ rank: 'Bronze' })
      })
    }));

    const season = response();
    find('GET', '/api/streammonsters/season')({}, season);
    expect(season.body.season.ends_at_ms - season.body.season.starts_at_ms)
      .toBe(28 * 24 * 60 * 60 * 1000);
    const leaderboard = response();
    find('GET', '/api/streammonsters/leaderboard')({ query: { limit: '10' } }, leaderboard);
    expect(leaderboard.body.entries).toEqual([]);
  });

  test('keeps AI preparation explicit, serial and admin protected with a target of one through eight', async () => {
    const { find, artPool, store } = createRoutes();
    const legacyPool = response();
    await find('POST', '/api/streammonsters/pool')({
      ip: '203.0.113.10',
      headers: {},
      body: { giftId: 1, giftName: 'Rose' }
    }, legacyPool);
    expect(legacyPool.statusCode).toBe(403);
    expect(store.getGiftMappings()).toEqual([]);

    const remote = response();
    await find('POST', '/api/streammonsters/pool/prepare')({
      ip: '203.0.113.10',
      headers: {},
      body: { targetPerVariant: 8 }
    }, remote);
    expect(remote.statusCode).toBe(403);
    expect(artPool.prepare).not.toHaveBeenCalled();

    const local = response();
    await find('POST', '/api/streammonsters/pool/prepare')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { targetPerVariant: 7 }
    }, local);
    expect(artPool.prepare).toHaveBeenCalledWith({ targetPerVariant: 7 });
  });

  test('sends a complete non-mutating overlay demo through the serialized event vocabulary', () => {
    const { find, emitted } = createRoutes();
    const remote = response();
    find('POST', '/api/streammonsters/demo')({
      ip: '203.0.113.10',
      headers: {},
      body: {}
    }, remote);
    expect(remote.statusCode).toBe(403);
    expect(emitted).toHaveLength(0);

    const result = response();

    find('POST', '/api/streammonsters/demo')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: {}
    }, result);

    expect(result.body).toEqual({ success: true, demo: true });
    expect(emitted.map(entry => entry.event)).toEqual(expect.arrayContaining([
      'streammonsters:egg_spawned',
      'streammonsters:hype_changed',
      'streammonsters:egg_ready',
      'streammonsters:hatch_started',
      'streammonsters:egg_hatched',
      'streammonsters:monster_visual_evolved',
      'streammonsters:battle_match_found',
      'streammonsters:battle_roster_locked',
      'streammonsters:battle_started',
      'streammonsters:battle_skill_prompt',
      'streammonsters:battle_skill_locked',
      'streammonsters:battle_action',
      'streammonsters:battle_knockout',
      'streammonsters:battle_round',
      'streammonsters:battle_completed',
      'streammonsters:monster_xp_awarded',
      'streammonsters:monster_level_up',
      'streammonsters:monster_stat_prompt',
      'streammonsters:achievement_unlocked',
      'streammonsters:season_rank_changed',
      'streammonsters:chat_result'
    ]));
    expect(emitted.filter(entry => entry.event === 'streammonsters:battle_round')).toHaveLength(3);
  });

  test('plays a single requested cinematic battle demo scene without mutating game state', () => {
    const { find, emitted } = createRoutes();
    const result = response();

    find('POST', '/api/streammonsters/demo')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { scene: 'knockout' }
    }, result);

    expect(result.body).toEqual({ success: true, demo: true, scene: 'knockout' });
    expect(emitted.map(entry => entry.event)).toEqual([
      'streammonsters:battle_knockout',
      'streammonsters:battle_completed'
    ]);
  });
});
