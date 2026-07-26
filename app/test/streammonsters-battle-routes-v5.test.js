const path = require('path');
const Database = require('better-sqlite3');
const StreamMonstersRoutes = require(
  '../plugins/streamalchemy/backend/streammonsters/routes'
);
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const BattleService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-service'
);
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);

function createRoutes() {
  const registered = [];
  const battleMatchService = {
    getPublicSnapshot: jest.fn(() => ({
      rulesVersion: 5,
      matches: [{ matchId: 'match-a', state: 'action', fighters: [] }]
    })),
    getPublicNormalizedReplay: jest.fn((battleId, cursor, limit) => (
      battleId === 'missing'
        ? null
        : { battleId, rulesVersion: 5, cursor, limit, actions: [], decisions: [], events: [] }
    ))
  };
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute(method, routePath, handler) {
        registered.push({ method: method.toUpperCase(), routePath, handler });
      },
      emit: jest.fn()
    },
    pluginDir: path.join(process.cwd(), 'plugins', 'streamalchemy'),
    dataDir: path.join(process.cwd(), 'tmp', 'streammonsters-routes-v5'),
    store: {
      getEggStateCounts: () => ({}),
      getStreamHype: () => null,
      getGiftMappings: () => [],
      getQueuedEggs: () => []
    },
    engine: { streamKey: null, hatchDurationFor: () => 120_000 },
    battleMatchService,
    giftCatalogProvider: () => [],
    configProvider: {
      getConfig: () => ({ streamMonsters: { hatchDurationMs: 120_000 } }),
      updateConfig: jest.fn()
    }
  });
  routes.register();
  return { registered, battleMatchService };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    sendFile: jest.fn()
  };
}

function insertMonster(sqlite, { id, userId, element, templateId, agility }) {
  sqlite.prepare(`
    INSERT INTO streammonsters_monsters (
      monster_id, user_id, egg_id, name, element, rarity, level, xp,
      stats_json, personality, template_id, is_selected, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, 'Common', 5, 0, ?, 'Adaptive', ?, 1, 1)
  `).run(
    id,
    userId,
    `egg-${id}`,
    `Public ${element}`,
    element,
    JSON.stringify({ vitality: 10, might: 20, guard: 10, agility }),
    templateId
  );
}

function createRealRoutes() {
  const registered = [];
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  const battleMatchService = new BattleMatchService({
    store,
    battleService: new BattleService({ store }),
    now: () => 1_000,
    autoStart: false
  });
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute(method, routePath, handler) {
        registered.push({ method: method.toUpperCase(), routePath, handler });
      },
      emit: jest.fn()
    },
    pluginDir: path.join(process.cwd(), 'plugins', 'streamalchemy'),
    dataDir: path.join(process.cwd(), 'tmp', 'streammonsters-routes-v5-real'),
    store,
    engine: { streamKey: null, hatchDurationFor: () => 120_000 },
    battleMatchService,
    giftCatalogProvider: () => [],
    configProvider: {
      getConfig: () => ({ streamMonsters: { hatchDurationMs: 120_000 } }),
      updateConfig: jest.fn()
    }
  });
  routes.register();
  return { registered, sqlite, battleMatchService };
}

describe('Stream Monsters rules-v5 battle routes', () => {
  test('serves a redacted public battle snapshot', () => {
    const { registered, battleMatchService } = createRoutes();
    const route = registered.find(entry => (
      entry.method === 'GET' && entry.routePath === '/api/streammonsters/battle-state'
    ));
    const res = response();

    expect(route).toBeDefined();
    route.handler({}, res);
    expect(res.body).toEqual({
      success: true,
      rulesVersion: 5,
      matches: [{ matchId: 'match-a', state: 'action', fighters: [] }]
    });
    expect(battleMatchService.getPublicSnapshot).toHaveBeenCalledTimes(1);
  });

  test('normalizes legacy/v5 replay by id with an ordered cursor and 404s missing rows', () => {
    const { registered, battleMatchService } = createRoutes();
    const route = registered.find(entry => (
      entry.method === 'GET' &&
      entry.routePath === '/api/streammonsters/battles/:battleId/replay'
    ));
    const res = response();

    expect(route).toBeDefined();
    route.handler({
      params: { battleId: 'battle-a' },
      query: { cursor: '7', limit: '4' }
    }, res);
    expect(battleMatchService.getPublicNormalizedReplay).toHaveBeenCalledWith(
      'battle-a',
      7,
      4
    );
    expect(res.body).toEqual(expect.objectContaining({
      success: true,
      battleId: 'battle-a',
      cursor: 7
    }));

    const missing = response();
    route.handler({ params: { battleId: 'missing' }, query: {} }, missing);
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toEqual({ error: 'battle_not_found' });
  });

  test('serves service-backed replay from public payloads and redacted action projections only', () => {
    const { registered, sqlite, battleMatchService } = createRealRoutes();
    try {
      insertMonster(sqlite, {
        id: 'db-secret-alpha',
        userId: 'viewer-private-a',
        element: 'Ember',
        templateId: 'ashfang',
        agility: 30
      });
      insertMonster(sqlite, {
        id: 'db-secret-beta',
        userId: 'viewer-private-b',
        element: 'Tide',
        templateId: 'ripple',
        agility: 1
      });
      battleMatchService.join({ userId: 'viewer-private-a' });
      const joined = battleMatchService.join({ userId: 'viewer-private-b' });
      battleMatchService.lockRoster({ userId: 'viewer-private-a' });
      battleMatchService.lockRoster({ userId: 'viewer-private-b' });
      battleMatchService.submitChoice({
        userId: 'viewer-private-a',
        choice: 'A',
        eventId: 'provider-event-private-a'
      });
      battleMatchService.submitChoice({
        userId: 'viewer-private-b',
        choice: 'B',
        eventId: 'provider-event-private-b'
      });
      const route = registered.find(entry => (
        entry.method === 'GET' &&
        entry.routePath === '/api/streammonsters/battles/:battleId/replay'
      ));
      const res = response();

      route.handler({
        params: { battleId: joined.match.matchId },
        query: { cursor: '0', limit: '50' }
      }, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.actions).toEqual([
        expect.objectContaining({
          actorSlot: 2,
          targetSlot: 1,
          choice: 'A',
          actorState: expect.objectContaining({ hp: expect.any(Number), charge: expect.any(Number) }),
          targetState: expect.objectContaining({ hp: expect.any(Number), shield: expect.any(Number) })
        }),
        expect.objectContaining({
          actorSlot: 1,
          targetSlot: 2,
          choice: 'B',
          actorState: expect.objectContaining({ shield: expect.any(Number), charge: expect.any(Number) }),
          targetState: expect.objectContaining({ hp: expect.any(Number) })
        })
      ]);
      expect(res.body.decisions).toHaveLength(2);
      expect(res.body.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          eventId: expect.stringMatching(
            new RegExp(`^${joined.match.matchId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:event:\\d+$`)
          ),
          correlationId: joined.match.matchId
        })
      ]));
      const serialized = JSON.stringify(res.body);
      [
        'viewer-private',
        'db-secret',
        'provider-event',
        'participantId',
        '"before"',
        '"after"',
        'payload_json'
      ].forEach(secret => expect(serialized).not.toContain(secret));
      expect(JSON.stringify(
        battleMatchService.getPrivateNormalizedReplay(joined.match.matchId)
      )).toContain('db-secret-alpha');
    } finally {
      sqlite.close();
    }
  });
});
