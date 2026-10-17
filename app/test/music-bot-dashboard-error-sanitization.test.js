'use strict';

const EventEmitter = require('events');
const MusicBotPlugin = require('../plugins/music-bot/main');

function createFixture() {
  const routes = new Map();
  const resolver = { resolve: jest.fn() };
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    registerRoute: (method, route, ...handlers) => routes.set(`${method}:${route}`, handlers),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin.config.playback.autoPlay = false;
  plugin.musicResolver = resolver;
  plugin.queueManager = { addSong: jest.fn(), getQueue: jest.fn(() => []) };
  plugin.autoDJ = { setRequestSeed: jest.fn(), onSongRequested: jest.fn() };
  plugin._emitToast = jest.fn();
  plugin._getBanRejection = jest.fn(() => null);
  plugin._invalidateRadioPrefetch = jest.fn();
  plugin._cancelNextSongVote = jest.fn();
  plugin._schedulePreCache = jest.fn();
  plugin._emitSongAdded = jest.fn();
  plugin._registerRoutes();
  return { api, plugin, resolver, routes };
}

async function invokeRoute(handlers, { query, body }) {
  const req = Object.assign(new EventEmitter(), {
    socket: { remoteAddress: '192.0.2.10' },
    ip: '192.0.2.10',
    headers: {},
    query,
    body
  });
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    payload: null,
    writableFinished: false,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  });

  for (const handler of handlers) {
    let next = false;
    await handler(req, res, () => { next = true; });
    if (!next) break;
  }
  return res;
}

describe('Music Bot dashboard error sanitization', () => {
  const providerDetail = 'synthetic provider stderr marker';
  const providerError = () => new Error(providerDetail);

  test('resolve route returns and logs only a stable generic failure', async () => {
    const fixture = createFixture();
    fixture.resolver.resolve.mockRejectedValueOnce(providerError());

    const response = await invokeRoute(fixture.routes.get('get:/api/plugins/music-bot/resolve'), {
      query: { q: 'synthetic route query' }
    });

    expect(response.statusCode).toBe(503);
    expect(response.payload).toEqual({
      success: false,
      error: 'Music search failed. Please try again.',
      code: 'MUSIC_BOT_RESOLVE_FAILED'
    });
    expect(fixture.api.log).toHaveBeenCalledWith(
      '[music-bot] Resolve failed (MUSIC_BOT_RESOLVE_FAILED)',
      'error'
    );
    expect(JSON.stringify({ payload: response.payload, logs: fixture.api.log.mock.calls }))
      .not.toContain(providerDetail);
  });

  test('request route does not queue or expose a rejected provider detail', async () => {
    const fixture = createFixture();
    fixture.resolver.resolve.mockRejectedValueOnce(providerError());

    const response = await invokeRoute(fixture.routes.get('post:/api/plugins/music-bot/request'), {
      body: { query: 'synthetic route query' }
    });

    expect(response.statusCode).toBe(503);
    expect(response.payload).toEqual({
      success: false,
      error: 'Song request failed. Please try again.',
      code: 'MUSIC_BOT_REQUEST_FAILED'
    });
    expect(fixture.plugin.queueManager.addSong).not.toHaveBeenCalled();
    expect(fixture.api.log).toHaveBeenCalledWith(
      '[music-bot] Dashboard resolver failed (MUSIC_BOT_REQUEST_FAILED)',
      'error'
    );
    expect(JSON.stringify({ payload: response.payload, logs: fixture.api.log.mock.calls }))
      .not.toContain(providerDetail);
  });
});
