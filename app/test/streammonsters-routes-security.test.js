const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersRoutes = require('../plugins/streamalchemy/backend/streammonsters/routes');

function createSubject() {
  const registered = [];
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const config = {
    enabled: true,
    creatorName: 'private-creator',
    rulesVersion: 5,
    hatchDurationMs: 120_000,
    visualPack: 'furry'
  };
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }),
      emit: jest.fn()
    },
    pluginDir: __dirname,
    store,
    engine: { streamKey: null, hatchDurationFor: () => 120_000 },
    progression: { getCurrentSeason: () => null, getLeaderboard: () => [] },
    collection: { getHeartChain: () => null, getStreamMission: () => null },
    configProvider: {
      getConfig: () => ({ streamMonsters: config }),
      updateConfig: updates => ({ streamMonsters: { ...config, ...updates.streamMonsters } })
    }
  });
  routes.register();
  return {
    routes,
    find: (method, routePath) => registered.find(route => (
      route.method === method && route.routePath === routePath
    )).handler
  };
}

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

describe('Stream Monsters Rules v5 route security', () => {
  test('rejects unauthenticated remote creator-state reads', async () => {
    const { find } = createSubject();
    const res = response();
    await find('GET', '/api/streammonsters/creator-state')({
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' },
      headers: {},
      query: {}
    }, res);
    expect(res.statusCode).toBe(403);
  });

  test('keeps the public snapshot free of creator and viewer identity fields', async () => {
    const { find } = createSubject();
    const res = response();
    await find('GET', '/api/streammonsters/state')({
      query: { userId: 'arbitrary-viewer' }
    }, res);
    expect(JSON.stringify(res.payload)).not.toMatch(/private-creator|arbitrary-viewer|user_id/);
    expect(res.payload.config.visualPack).toBe('furry');
  });

  test.each([
    ['GET', '/api/streammonsters/pool'],
    ['POST', '/api/streammonsters/pool/prepare'],
    ['GET', '/api/streammonsters/local-runtime/status'],
    ['POST', '/api/streammonsters/local-runtime/install'],
    ['GET', '/api/streamalchemy/providers/status']
  ])('returns the same unauthenticated 410 contract for retired %s %s', async (method, routePath) => {
    const { find } = createSubject();
    const res = response();
    await find(method, routePath)({
      ip: '203.0.113.10',
      socket: { remoteAddress: '203.0.113.10' },
      headers: {},
      body: {}
    }, res);
    expect(res.statusCode).toBe(410);
    expect(res.payload).toEqual({ error: 'art_lab_removed' });
  });

  test('canonicalizes retired visual-pack updates to Furry', () => {
    const { routes } = createSubject();
    expect(routes.sanitizeConfigUpdate({ visualPack: 'art_lab' })).toEqual({
      visualPack: 'furry'
    });
    expect(routes.sanitizeConfigUpdate({ visualPack: 'kenney' })).toEqual({
      visualPack: 'furry'
    });
  });
});
