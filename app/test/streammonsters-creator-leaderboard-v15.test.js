'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const StreamMonstersRoutes = require(
  '../plugins/streamalchemy/backend/streammonsters/routes'
);

function response() {
  return {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

describe('Stream Monsters public leaderboards', () => {
  test('serves Collector and Arena rankings without persistent viewer identifiers', () => {
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    const collectorId = store.resolveViewerIdentity({
      platformUserId: 'platform-collector',
      legacyUserId: 'CollectorHero',
      updatedAtMs: 1_000
    });
    const arenaMasterId = store.resolveViewerIdentity({
      platformUserId: 'platform-arena-master',
      legacyUserId: 'ArenaMaster',
      updatedAtMs: 1_001
    });
    const arenaSilverId = store.resolveViewerIdentity({
      platformUserId: 'platform-arena-silver',
      legacyUserId: 'ArenaSilver',
      updatedAtMs: 1_002
    });
    sqlite.prepare(`
      INSERT INTO streammonsters_arena_seasons (
        season_id, starts_at_ms, ends_at_ms, duration_days
      ) VALUES
        ('arena-current', 1000, 999999, 28),
        ('arena-other-duration', 2000, 999999, 7)
    `).run();
    sqlite.prepare(`
      INSERT INTO streammonsters_arena_ratings (
        season_id, viewer_id, rating, battles_rated, updated_at_ms
      ) VALUES
        ('arena-current', ?, 1510, 12, 2000),
        ('arena-current', ?, 1060, 4, 1900),
        ('arena-other-duration', 'wrong-season-leader', 1900, 20, 2200)
    `).run(arenaMasterId, arenaSilverId);
    const registered = [];
    const routes = new StreamMonstersRoutes({
      api: {
        registerRoute(method, routePath, handler) {
          registered.push({ method, routePath, handler });
        },
        emit: jest.fn()
      },
      pluginDir: path.join(process.cwd(), 'plugins', 'streamalchemy'),
      store,
      engine: { streamKey: null, hatchDurationFor: () => 120_000 },
      progression: {
        getCurrentSeason: () => null,
        getLeaderboard: () => [{
          season_id: 'collector-current',
          user_id: collectorId,
          points: 920,
          rank: 'Monster Master',
          updated_at_ms: 2_000
        }]
      },
      battleMatchService: {
        getCurrentArenaSeason: () => ({ seasonId: 'arena-current', durationDays: 28 })
      },
      collection: {},
      configProvider: {
        getConfig: () => ({ streamMonsters: { hatchDurationMs: 120_000 } }),
        updateConfig: jest.fn()
      }
    });
    routes.register();
    const handler = registered.find(route => (
      route.method === 'GET' &&
      route.routePath === '/api/streammonsters/leaderboard'
    )).handler;

    const collector = response();
    handler({ query: { limit: '25' } }, collector);
    expect(collector.payload).toEqual({
      success: true,
      type: 'collector',
      entries: [{
        displayName: 'CollectorHero',
        points: 920,
        rank: 'Monster Master'
      }]
    });

    const arena = response();
    handler({ query: { type: 'arena', limit: '25' } }, arena);
    expect(arena.payload).toEqual({
      success: true,
      type: 'arena',
      entries: [
        {
          displayName: 'ArenaMaster',
          rating: 1510,
          battles_rated: 12,
          tier: 'Monster Master'
        },
        {
          displayName: 'ArenaSilver',
          rating: 1060,
          battles_rated: 4,
          tier: 'Silver'
        }
      ]
    });
    expect(JSON.stringify({
      collector: collector.payload,
      arena: arena.payload
    })).not.toMatch(
      /user_id|viewer_id|canonical_user_id|platform-collector|platform-arena|tiktok:/
    );
    sqlite.close();
  });
});
