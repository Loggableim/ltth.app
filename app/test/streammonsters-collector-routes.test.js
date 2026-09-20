const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/stream-monsters/backend/streammonsters/game-engine');
const ProgressionService = require('../plugins/stream-monsters/backend/streammonsters/progression-service');
const StreamMonstersRoutes = require('../plugins/stream-monsters/backend/streammonsters/routes');
const CollectionService = require('../plugins/stream-monsters/backend/streammonsters/collection-service');

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

function createRoutes(options = {}) {
  const registered = [];
  const emitted = [];
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const engine = new StreamMonstersEngine({ store });
  engine.setStreamKey(options.streamKey || 'creator:routes');
  const progression = new ProgressionService({
    store,
    now: () => new Date('2026-07-23T12:00:00Z')
  });
  const collection = new CollectionService({
    store,
    now: () => 1,
    getActiveViewerCount: options.getActiveViewerCount,
    hasQualifyingHeartGift: options.hasQualifyingHeartGift
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
    collection,
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
  return { find, store, artPool, emitted, configProvider, collection };
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

  test('persists normalized Rules v5 controls through the admin config update', () => {
    const { find, configProvider } = createRoutes();
    const result = response();

    find('POST', '/api/streammonsters/config')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: {
        seasonDurationDays: 60,
        visualPack: 'art_lab',
        audioChannels: { battle: { enabled: true, volume: 0.55 } }
      }
    }, result);

    expect(result.statusCode).toBe(200);
    expect(result.body.config).toEqual(expect.objectContaining({
      seasonDurationDays: 60,
      visualPack: 'furry',
      audioChannels: { battle: { enabled: true, volume: 0.55 } }
    }));
    expect(configProvider.updateConfig).toHaveBeenCalledWith({
      streamMonsters: {
        seasonDurationDays: 60,
        visualPack: 'furry',
        audioChannels: { battle: { enabled: true, volume: 0.55 } }
      }
    }, { expectedRevision: undefined });
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

    const list = response();
    find('GET', '/api/streammonsters/gift-mappings')({}, list);
    expect(list.body.mappings).toHaveLength(1);

    const deleted = response();
    find('DELETE', '/api/streammonsters/gift-mappings/:giftId')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      params: { giftId: '150' }
    }, deleted);
    expect(deleted.body.removed).toBe(true);
  });

  test('redacts public state and exposes expanded viewer state only to the creator', () => {
    const { find, store } = createRoutes();
    store.addStreamHype('creator:routes', 40, 1);
    store.unlockAchievement('viewer-a', 'first_hatch', 1);

    const state = response();
    find('GET', '/api/streammonsters/state')({ query: { userId: 'viewer-a' } }, state);
    expect(state.body).toEqual(expect.objectContaining({
      hype: expect.objectContaining({ points: 40 }),
      season: expect.objectContaining({ season_id: expect.any(String) })
    }));
    expect(state.body).not.toHaveProperty('viewer');

    const creator = response();
    find('GET', '/api/streammonsters/creator-state')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      query: { userId: 'viewer-a' }
    }, creator);
    expect(creator.body.viewer).toEqual(expect.objectContaining({
      achievements: [expect.objectContaining({ achievement_key: 'first_hatch' })],
      rank: expect.objectContaining({ rank: 'Bronze' })
    }));

    const season = response();
    find('GET', '/api/streammonsters/season')({}, season);
    expect(season.body.season.ends_at_ms - season.body.season.starts_at_ms)
      .toBe(28 * 24 * 60 * 60 * 1000);
    const leaderboard = response();
    find('GET', '/api/streammonsters/leaderboard')({ query: { limit: '10' } }, leaderboard);
    expect(leaderboard.body.entries).toEqual([]);
  });

  test('status reads do not lock a zero-viewer mission before party Heart activity', () => {
    const streamKey = 'peek-heart-regression-3';
    const activeViewers = new Set();
    let qualifyingHeart = false;
    const { find, store, collection } = createRoutes({
      streamKey,
      getActiveViewerCount: () => activeViewers.size,
      hasQualifyingHeartGift: () => qualifyingHeart
    });

    const publicState = response();
    find('GET', '/api/streammonsters/state')({ query: {} }, publicState);
    expect(publicState.body.streamMission).toBeNull();
    expect(store.getStreamMission(streamKey)).toBeNull();

    const creatorState = response();
    find('GET', '/api/streammonsters/creator-state')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      query: {}
    }, creatorState);
    expect(creatorState.body.streamMission).toBeNull();
    expect(store.getStreamMission(streamKey)).toBeNull();

    ['viewer-a', 'viewer-b', 'viewer-c', 'viewer-d', 'viewer-e']
      .forEach(viewerId => activeViewers.add(viewerId));
    qualifyingHeart = true;
    collection.recordHeartMe({
      streamKey,
      userId: 'viewer-a',
      atMs: 1
    });

    expect(store.getStreamMission(streamKey)).toEqual(expect.objectContaining({
      mission_key: 'heart_chain_five',
      target: 3,
      progress: 1,
      completed_at_ms: null,
      population_band: 'party',
      population_peak: 5
    }));
  });

  test('tombstones retired AI preparation without mutating mappings or Art Pool state', async () => {
    const { find, artPool, store } = createRoutes();
    const legacyPool = response();
    await find('POST', '/api/streammonsters/pool')({
      ip: '203.0.113.10',
      headers: {},
      body: { giftId: 1, giftName: 'Rose' }
    }, legacyPool);
    expect(legacyPool.statusCode).toBe(410);
    expect(legacyPool.body).toEqual({ error: 'art_lab_removed' });
    expect(store.getGiftMappings()).toEqual([]);

    const remote = response();
    await find('POST', '/api/streammonsters/pool/prepare')({
      ip: '203.0.113.10',
      headers: {},
      body: { targetPerVariant: 8 }
    }, remote);
    expect(remote.statusCode).toBe(410);
    expect(remote.body).toEqual({ error: 'art_lab_removed' });
    expect(artPool.prepare).not.toHaveBeenCalled();

    const local = response();
    await find('POST', '/api/streammonsters/pool/prepare')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { targetPerVariant: 7 }
    }, local);
    expect(local.statusCode).toBe(410);
    expect(local.body).toEqual({ error: 'art_lab_removed' });
    expect(artPool.prepare).not.toHaveBeenCalled();
  });

  test('keeps manual gift mapping customization monotonic across later setup saves', () => {
    const { find, configProvider } = createRoutes();
    configProvider.getConfig = () => ({
      streamMonsters: {
        giftMappingCustomized: true,
        hatchDurationMs: 300000
      }
    });
    const result = response();
    find('POST', '/api/streammonsters/config')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      body: { creatorName: 'Creator', giftMappingCustomized: false }
    }, result);

    expect(configProvider.updateConfig).toHaveBeenCalledWith({
      streamMonsters: { creatorName: 'Creator', giftMappingCustomized: true }
    }, { expectedRevision: undefined });
  });

  test('keeps the public Dex redacted, exposes creator ownership, and tombstones pool preparation', async () => {
    const { find, artPool } = createRoutes();
    const catalog = response();
    find('GET', '/api/streammonsters/monster-catalog')({ query: { userId: 'viewer-a' } }, catalog);
    expect(catalog.body).toEqual(expect.objectContaining({
      dex: { owned: 0, total: 24 },
      templates: expect.arrayContaining([
        expect.objectContaining({ templateId: 'ashfang', silhouette: true, owned: false })
      ])
    }));

    const creatorCatalog = response();
    find('GET', '/api/streammonsters/creator-catalog')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      query: { userId: 'viewer-a' }
    }, creatorCatalog);
    expect(creatorCatalog.body).toEqual(expect.objectContaining({
      success: true,
      userId: 'viewer-a',
      dex: { owned: 0, total: 24 }
    }));

    const state = response();
    find('GET', '/api/streammonsters/state')({ query: { userId: 'viewer-a' } }, state);
    expect(state.body).toEqual(expect.objectContaining({
      visualPack: 'furry',
      eggCounts: { incubating: 0, queued: 0, ready: 0 }
    }));
    expect(state.body).not.toHaveProperty('dex');

    const prepared = response();
    await find('POST', '/api/streammonsters/pool/prepare')({
      ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, headers: {},
      body: { targetPerVariant: 2, templateIds: ['ashfang', 'cinder'] }
    }, prepared);
    expect(prepared.statusCode).toBe(410);
    expect(prepared.body).toEqual({ error: 'art_lab_removed' });
    expect(artPool.prepare).not.toHaveBeenCalled();
  });

  test('resolves creator-catalog aliases and returns owned mastery, essence and cosmetic indicators', () => {
    const { find, store } = createRoutes();
    const canonicalUserId = 'viewer-canonical';
    store.recordViewerAlias('viewer-alias', canonicalUserId, 1);
    const egg = store.createEgg({
      eggId: 'alias-egg',
      userId: canonicalUserId,
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      eggColor: '#ff7043',
      seed: 'alias-seed',
      state: 'ready',
      variant: 'standard',
      hatchDurationMs: 30000,
      createdAtMs: 1,
      readyAtMs: 1
    });
    store.createMonsterFromEgg(egg, {
      monsterId: 'alias-monster',
      name: 'Ashfang',
      rarity: 'standard',
      stats: { vitality: 7, might: 7, guard: 7, agility: 7 },
      personality: 'Brave',
      templateId: 'ashfang',
      createdAtMs: 2
    });
    store.setTemplateMastery(canonicalUserId, 'ashfang', 8, ['badge-bronze']);
    store.setElementEssence(canonicalUserId, 'Ember', 6, ['ember-aura']);
    store.unlockCollectionCosmetic(canonicalUserId, 'frame:ember', 1);

    const catalog = response();
    find('GET', '/api/streammonsters/creator-catalog')({
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
      query: { userId: 'viewer-alias' }
    }, catalog);
    expect(catalog.body.dex).toEqual({ owned: 1, total: 24 });
    expect(catalog.body.templates).toContainEqual(expect.objectContaining({
      templateId: 'ashfang',
      owned: true,
      silhouette: false,
      mastery: expect.objectContaining({ points: 8, unlocks: ['badge-bronze'] })
    }));
    expect(catalog.body.essence).toContainEqual(expect.objectContaining({
      element: 'Ember',
      amount: 6,
      unlocks: ['ember-aura']
    }));
    expect(catalog.body.cosmetics).toContain('frame:ember');
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
      'streammonsters:stream_started',
      'streammonsters:hype_changed',
      'streammonsters:hype_milestone',
      'streammonsters:egg_ready',
      'streammonsters:hatch_started',
      'streammonsters:egg_hatched',
      'streammonsters:monster_evolved',
      'streammonsters:battle_started',
      'streammonsters:stance_revealed',
      'streammonsters:battle_round',
      'streammonsters:battle_completed',
      'streammonsters:win_streak',
      'streammonsters:upset',
      'streammonsters:rivalry',
      'streammonsters:quest_completed',
      'streammonsters:achievement_unlocked',
      'streammonsters:arena_rating_changed',
      'streammonsters:season_rank_changed',
      'streammonsters:chat_result'
    ]));
    expect(emitted.find(entry => entry.event === 'streammonsters:chat_result')?.payload?.result)
      .toEqual(expect.objectContaining({
        status: 'rank',
        arena: { rating: 1011, tier: 'Silver' },
        collector: { points: 275, rank: 'Gold' }
      }));
    expect(emitted.filter(entry => entry.event === 'streammonsters:battle_round')).toHaveLength(3);
  });
});
