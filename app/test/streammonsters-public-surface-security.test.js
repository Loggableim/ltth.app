'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const StreamMonstersRoutes = require('../plugins/stream-monsters/backend/streammonsters/routes');

function createSubject(now = () => Date.now()) {
  const registered = [];
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const routes = new StreamMonstersRoutes({
    api: {
      registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }),
      log: jest.fn()
    },
    pluginDir: __dirname,
    store,
    engine: { streamKey: null, hatchDurationFor: () => 120_000 },
    configProvider: { getConfig: () => ({ streamMonsters: { enabled: true, hatchDurationMs: 120_000 } }) },
    now
  });
  routes.register();
  return registered.find(route => route.method === 'POST' && route.routePath === '/api/streammonsters/overlay/heartbeat').handler;
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

describe('Stream Monsters public mutation surface', () => {
  test('rejects malformed, cross-site, and burst public heartbeats with stable public errors', async () => {
    let nowMs = 20_000;
    const heartbeat = createSubject(() => nowMs);
    const request = (body, headers = {}) => ({
      ip: '198.51.100.2',
      socket: { remoteAddress: '198.51.100.2' },
      headers,
      body
    });

    const malformed = response();
    await heartbeat(request({ layout: 'portrait', secret: 'not-allowed' }), malformed);
    expect(malformed.statusCode).toBe(400);
    expect(malformed.payload).toEqual({
      success: false,
      code: 'STREAM_MONSTERS_HEARTBEAT_INVALID',
      correlationId: expect.any(String)
    });

    const crossSite = response();
    await heartbeat(request({ layout: 'portrait' }, {
      origin: 'https://attacker.invalid',
      'sec-fetch-site': 'cross-site',
      host: 'quiet-river.trycloudflare.com'
    }), crossSite);
    expect(crossSite.statusCode).toBe(403);
    expect(crossSite.payload).toEqual({
      success: false,
      code: 'STREAM_MONSTERS_CROSS_SITE_MUTATION_DENIED',
      correlationId: expect.any(String)
    });

    const validBody = {
      layout: 'portrait',
      renderer: { backend: 'webgpu', quality: 'high', fps: 60, deviceLost: false },
      audio: { muted: false, masterVolume: 0.5 }
    };
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const accepted = response();
      await heartbeat(request(validBody), accepted);
      expect(accepted.statusCode).toBe(200);
    }
    const limited = response();
    await heartbeat(request(validBody), limited);
    expect(limited.statusCode).toBe(429);
    expect(limited.payload).toEqual({
      success: false,
      code: 'STREAM_MONSTERS_HEARTBEAT_RATE_LIMITED',
      correlationId: expect.any(String)
    });
  });
});