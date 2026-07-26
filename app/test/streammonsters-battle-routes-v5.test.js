const path = require('path');
const StreamMonstersRoutes = require(
  '../plugins/streamalchemy/backend/streammonsters/routes'
);

function createRoutes() {
  const registered = [];
  const battleMatchService = {
    getPublicSnapshot: jest.fn(() => ({
      rulesVersion: 5,
      matches: [{ matchId: 'match-a', state: 'action', fighters: [] }]
    })),
    getNormalizedReplay: jest.fn((battleId, cursor) => (
      battleId === 'missing'
        ? null
        : { battleId, rulesVersion: 5, cursor, actions: [], events: [] }
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
    route.handler({ params: { battleId: 'battle-a' }, query: { cursor: '7' } }, res);
    expect(battleMatchService.getNormalizedReplay).toHaveBeenCalledWith('battle-a', 7);
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
});
