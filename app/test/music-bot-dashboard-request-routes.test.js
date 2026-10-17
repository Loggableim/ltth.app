'use strict';

const EventEmitter = require('events');
const MusicBotPlugin = require('../plugins/music-bot/main');
const MusicResolver = require('../plugins/music-bot/lib/music-resolver');

const RESOLVE_ROUTE = 'get:/api/plugins/music-bot/resolve';
const REQUEST_ROUTE = 'post:/api/plugins/music-bot/request';
const HISTORY_REPLAY_ROUTE = 'post:/api/plugins/music-bot/history/:eventId/replay';
const MAX_QUERY_BYTES = 2048;

function createResponse() {
  const response = new EventEmitter();
  Object.assign(response, {
    statusCode: 200,
    payload: null,
    headers: {},
    writableFinished: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    }
  });
  return response;
}

async function invokeRoute(handlers, {
  peerAddress = '192.0.2.10',
  ip = '192.0.2.10',
  headers = {},
  query = { q: 'synthetic dashboard query' },
  body = { query: 'synthetic dashboard query' },
  params = {},
  lifecycle
} = {}) {
  const req = new EventEmitter();
  Object.assign(req, {
    socket: { remoteAddress: peerAddress },
    ip,
    headers,
    query,
    body,
    params
  });
  const response = createResponse();
  if (lifecycle) Object.assign(lifecycle, { req, response });

  async function dispatch(index) {
    const handler = handlers[index];
    if (!handler) return;
    await handler(req, response, () => dispatch(index + 1));
  }

  await dispatch(0);
  return response;
}

function createFixture() {
  const routes = new Map();
  const queueCalls = [];
  const resolver = {
    resolve: jest.fn(async (query) => ({
      success: true,
      song: {
        id: `fixture:${query}`,
        trackKey: `fixture:${query}`,
        title: 'Synthetic route fixture',
        artist: 'Fixture Artist',
        duration: 120,
        url: 'https://example.test/fixture'
      }
    }))
  };
  const api = {
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    getDatabase: jest.fn(() => ({})),
    registerRoute: jest.fn((method, routePath, ...handlers) => {
      routes.set(`${method}:${routePath}`, handlers);
      return true;
    }),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin.config.playback.autoPlay = false;
  plugin.musicResolver = resolver;
  plugin.queueManager = {
    addSong: jest.fn((song) => {
      queueCalls.push(song);
      return { success: true, song, position: queueCalls.length };
    })
  };
  plugin.autoDJ = {
    setRequestSeed: jest.fn(),
    onSongRequested: jest.fn()
  };
  plugin._getBanRejection = jest.fn(() => null);
  plugin._invalidateRadioPrefetch = jest.fn();
  plugin._cancelNextSongVote = jest.fn();
  plugin._schedulePreCache = jest.fn();
  plugin._emitSongAdded = jest.fn();
  plugin._emitToast = jest.fn();
  plugin._registerRoutes();

  return { plugin, routes, resolver, queueCalls };
}

describe('Music Bot dashboard request route limits', () => {
  test('returns the exact synthetic resolver result to the dashboard preview without queueing it', async () => {
    const fixture = createFixture();
    const query = '  synthetic artist - exact title  ';
    const song = {
      id: 'fixture:exact-title',
      trackKey: 'fixture:exact-title',
      title: 'Exact Synthetic Title',
      artist: 'Fixture Artist',
      duration: 123,
      provider: 'fixture',
      providerId: 'exact-title',
      url: 'https://example.test/fixture-only'
    };
    fixture.resolver.resolve.mockResolvedValueOnce({ success: true, song });

    const response = await invokeRoute(fixture.routes.get(RESOLVE_ROUTE), {
      query: { q: query }
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({ success: true, song });
    expect(fixture.resolver.resolve).toHaveBeenCalledTimes(1);
    expect(fixture.resolver.resolve).toHaveBeenCalledWith('synthetic artist - exact title', {
      signal: expect.any(AbortSignal)
    });
    expect(fixture.queueCalls).toHaveLength(0);
  });

  test('maps the dashboard request query to the resolved song and trusted queue identity', async () => {
    const fixture = createFixture();
    const song = {
      id: 'fixture:queued-song',
      trackKey: 'fixture:queued-song',
      title: 'Resolved Queue Title',
      artist: 'Fixture Artist',
      duration: 123,
      provider: 'fixture',
      providerId: 'queued-song',
      url: 'https://example.test/fixture-only'
    };
    fixture.resolver.resolve.mockResolvedValueOnce({ success: true, song });

    const response = await invokeRoute(fixture.routes.get(REQUEST_ROUTE), {
      body: {
        query: '  synthetic queue query  ',
        username: 'forged-user',
        requesterAvatar: 'https://attacker.example/avatar.png'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({
      success: true,
      song: { ...song, requestedBy: 'dashboard', requesterAvatar: null },
      position: 1
    });
    expect(fixture.resolver.resolve).toHaveBeenCalledTimes(1);
    expect(fixture.resolver.resolve).toHaveBeenCalledWith('synthetic queue query', {
      signal: expect.any(AbortSignal)
    });
    expect(fixture.queueCalls).toEqual([{
      ...song,
      requestedBy: 'dashboard',
      requesterAvatar: null
    }]);
  });

  test('routes a normalized dashboard search through MusicResolver and queues one trusted result', async () => {
    const fixture = createFixture();
    const providerRunner = {
      run: jest.fn(async (_executable, args) => {
        expect(args.at(-1)).toBe('ytsearch5:fixture artist route song');
        return JSON.stringify({ entries: [{
          id: 'synthetic01',
          title: 'Fixture Artist Route Song',
          uploader: 'Fixture Artist',
          duration: 120,
          extractor: 'youtube',
          webpage_url: 'https://www.youtube.com/watch?v=synthetic01'
        }] });
      }),
      destroy: jest.fn(async () => {}),
      getStatus: jest.fn(() => ({ active: 0, queued: 0 }))
    };
    const resolver = new MusicResolver({
      ytdlpPath: 'synthetic-fake-runner',
      searchTimeout: 5000,
      maxDurationSeconds: 600
    }, { log: jest.fn() }, { runner: providerRunner });
    fixture.plugin.musicResolver = resolver;

    try {
      const response = await invokeRoute(fixture.routes.get(REQUEST_ROUTE), {
        body: {
          query: '  Fixture   Artist Route Song  ',
          username: 'forged-user',
          requesterAvatar: 'https://attacker.example/avatar.png'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.payload).toMatchObject({
        success: true,
        song: {
          title: 'Fixture Artist Route Song',
          artist: 'Fixture Artist',
          provider: 'youtube',
          providerId: 'synthetic01',
          trackKey: 'youtube:synthetic01',
          requestedBy: 'dashboard',
          requesterAvatar: null
        },
        position: 1
      });
      expect(providerRunner.run).toHaveBeenCalledTimes(1);
      expect(providerRunner.run.mock.calls[0][1].at(-1)).toBe('ytsearch5:fixture artist route song');
      expect(fixture.queueCalls).toHaveLength(1);
      expect(fixture.queueCalls[0]).toMatchObject({
        providerId: 'synthetic01',
        requestedBy: 'dashboard',
        requesterAvatar: null
      });
    } finally {
      await resolver.destroy();
    }
  });

  test.each([
    ['empty resolver result', { success: false, reason: 'not_found', message: 'No matching song.' }, null, 400, 400],
    ['resolver setup unavailable for a direct URL', { success: false, reason: 'resolver_unavailable', message: 'Resolver setup required.' }, null, 503, 503, 'https://www.youtube.com/watch?v=synthetic01'],
    ['resolver/provider error', new Error('Synthetic provider failure'), 'throw', 503, 503],
    ['resolver timeout', Object.assign(new Error('Synthetic timeout detail'), { code: 'ETIMEDOUT' }), 'throw', 504, 504]
  ])('fails closed without queueing on %s', async (_label, failure, failureMode, expectedResolveStatus, expectedRequestStatus, query = 'synthetic missing query') => {
    const fixture = createFixture();
    if (failureMode === 'throw') {
      fixture.resolver.resolve.mockRejectedValue(failure);
    } else {
      fixture.resolver.resolve.mockResolvedValue(failure);
    }

    const preview = await invokeRoute(fixture.routes.get(RESOLVE_ROUTE), {
      query: { q: query }
    });
    const request = await invokeRoute(fixture.routes.get(REQUEST_ROUTE), {
      body: { query }
    });

    expect(preview.statusCode).toBe(expectedResolveStatus);
    expect(request.statusCode).toBe(expectedRequestStatus);
    expect(request.payload).not.toHaveProperty('httpStatus');
    if (failureMode === 'throw') {
      expect(request.payload).toMatchObject({
        success: false,
        code: 'MUSIC_BOT_REQUEST_FAILED',
        error: 'Song request failed. Please try again.'
      });
      expect(JSON.stringify(request.payload)).not.toContain('Synthetic');
    }
    expect(fixture.resolver.resolve).toHaveBeenCalledTimes(2);
    expect(fixture.queueCalls).toHaveLength(0);
    expect(fixture.plugin._schedulePreCache).not.toHaveBeenCalled();
    expect(fixture.plugin._emitSongAdded).not.toHaveBeenCalled();
  });

  test.each([
    [400, 'Replay request could not be completed.'],
    [503, 'Replay service is temporarily unavailable. Please try again.'],
    [504, 'Replay service is temporarily unavailable. Please try again.']
  ])('maps history replay failure to safe HTTP %i response', async (statusCode, safeMessage) => {
    const fixture = createFixture();
    fixture.plugin.musicCatalog = {
      getHistoryEvent: jest.fn(() => ({ url: 'https://example.test/synthetic-track' }))
    };
    fixture.plugin._handleDashboardRequest = jest.fn(async () => ({
      success: false,
      httpStatus: statusCode,
      error: 'PRIVATE_PROVIDER_ERROR_CANARY',
      code: 'PRIVATE_RESOLVER_CODE_CANARY',
      providerDetails: { token: 'PRIVATE_TOKEN_CANARY' }
    }));

    const response = await invokeRoute(fixture.routes.get(HISTORY_REPLAY_ROUTE), {
      params: { eventId: 'synthetic-event' },
      body: { mode: 'queue' }
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.payload).toEqual({ success: false, error: safeMessage });
    expect(JSON.stringify(response.payload)).not.toContain('CANARY');
    expect(JSON.stringify(response.payload)).not.toContain('PRIVATE_TOKEN');
    expect(fixture.plugin._handleDashboardRequest).toHaveBeenCalledWith(
      'https://example.test/synthetic-track', 'dashboard'
    );
    expect(fixture.queueCalls).toHaveLength(0);
  });

  test.each([
    ['resolve preview', RESOLVE_ROUTE, { query: { q: 'https://example.invalid/watch?v=synthetic' } }],
    ['dashboard request', REQUEST_ROUTE, { body: { query: 'https://example.invalid/watch?v=synthetic' } }]
  ])('maps an unsupported direct URL to HTTP 400 for %s before provider work', async (_label, route, requestOptions) => {
    const fixture = createFixture();
    const providerRunner = {
      run: jest.fn(),
      destroy: jest.fn(async () => {}),
      getStatus: jest.fn(() => ({ active: 0, queued: 0 }))
    };
    const resolver = new MusicResolver({ ytdlpPath: 'synthetic-fake-runner' }, { log: jest.fn() }, { runner: providerRunner });
    fixture.plugin.musicResolver = resolver;

    try {
      const response = await invokeRoute(fixture.routes.get(route), requestOptions);

      expect(response.statusCode).toBe(400);
      expect(response.payload).toMatchObject({ success: false });
      expect(providerRunner.run).not.toHaveBeenCalled();
      expect(fixture.queueCalls).toHaveLength(0);
      expect(fixture.plugin._schedulePreCache).not.toHaveBeenCalled();
    } finally {
      await resolver.destroy();
    }
  });

  test('blocks the 31st resolve by direct peer before invoking the resolver', async () => {
    const fixture = createFixture();
    const handlers = fixture.routes.get(RESOLVE_ROUTE);
    expect(handlers[0]).toBe(fixture.plugin._dashboardRequestLimiters.resolve);

    for (let index = 0; index < 30; index += 1) {
      const response = await invokeRoute(handlers, {
        peerAddress: '192.0.2.10',
        ip: `198.51.100.${index + 1}`,
        headers: { 'x-forwarded-for': `203.0.113.${index + 1}` }
      });
      expect(response.statusCode).toBe(200);
    }

    const rejected = await invokeRoute(handlers, {
      peerAddress: '192.0.2.10',
      ip: '198.51.100.200',
      headers: { 'x-forwarded-for': '203.0.113.200' }
    });
    expect(rejected).toMatchObject({
      statusCode: 429,
      payload: { code: 'MUSIC_BOT_RATE_LIMITED' },
      headers: { 'retry-after': '60' }
    });
    expect(fixture.resolver.resolve).toHaveBeenCalledTimes(30);
    expect(fixture.queueCalls).toHaveLength(0);

    const differentPeer = await invokeRoute(handlers, { peerAddress: '192.0.2.11' });
    expect(differentPeer.statusCode).toBe(200);
    expect(fixture.resolver.resolve).toHaveBeenCalledTimes(31);
  });

  test('blocks the 11th request before resolver/queue and ignores caller identity fields', async () => {
    const fixture = createFixture();
    const handlers = fixture.routes.get(REQUEST_ROUTE);
    expect(handlers[0]).toBe(fixture.plugin._dashboardRequestLimiters.request);

    for (let index = 0; index < 10; index += 1) {
      const response = await invokeRoute(handlers, {
        peerAddress: '192.0.2.20',
        ip: `198.51.100.${index + 1}`,
        headers: { 'x-forwarded-for': `203.0.113.${index + 1}` },
        body: {
          query: `synthetic dashboard query ${index}`,
          username: `forged-viewer-${index}`,
          requesterAvatar: `https://attacker.example/${index}.png`
        }
      });
      expect(response.statusCode).toBe(200);
    }

    expect(fixture.queueCalls).toHaveLength(10);
    expect(fixture.queueCalls).toEqual(Array.from({ length: 10 }, () => expect.objectContaining({
      requestedBy: 'dashboard',
      requesterAvatar: null
    })));

    const rejected = await invokeRoute(handlers, {
      peerAddress: '192.0.2.20',
      ip: '198.51.100.250',
      headers: { 'x-forwarded-for': '203.0.113.250' },
      body: { query: 'eleventh synthetic request', username: 'another-forged-viewer' }
    });
    expect(rejected).toMatchObject({
      statusCode: 429,
      payload: { code: 'MUSIC_BOT_RATE_LIMITED' },
      headers: { 'retry-after': '60' }
    });
    expect(fixture.resolver.resolve).toHaveBeenCalledTimes(10);
    expect(fixture.queueCalls).toHaveLength(10);
  });

  test('keeps resolve and request budgets separate for the same direct peer', async () => {
    const fixture = createFixture();
    const resolveHandlers = fixture.routes.get(RESOLVE_ROUTE);
    const requestHandlers = fixture.routes.get(REQUEST_ROUTE);

    for (let index = 0; index < 30; index += 1) {
      await invokeRoute(resolveHandlers, { peerAddress: '192.0.2.30' });
    }
    expect((await invokeRoute(resolveHandlers, { peerAddress: '192.0.2.30' })).statusCode).toBe(429);

    const submission = await invokeRoute(requestHandlers, {
      peerAddress: '192.0.2.30',
      body: { query: 'one dashboard submission' }
    });
    expect(submission.statusCode).toBe(200);
    expect(fixture.queueCalls).toHaveLength(1);
    expect(fixture.queueCalls[0]).toMatchObject({ requestedBy: 'dashboard', requesterAvatar: null });
  });

  test.each([
    ['ASCII at byte limit', 'a'.repeat(MAX_QUERY_BYTES), MAX_QUERY_BYTES, 200],
    ['ASCII over byte limit', 'a'.repeat(MAX_QUERY_BYTES + 1), MAX_QUERY_BYTES + 1, 400],
    ['multibyte at byte limit', '🎵'.repeat(MAX_QUERY_BYTES / 4), MAX_QUERY_BYTES, 200],
    ['multibyte over byte limit', '🎵'.repeat(MAX_QUERY_BYTES / 4 + 1), MAX_QUERY_BYTES + 4, 400]
  ])('enforces UTF-8 query byte limit on resolve: %s', async (_label, query, expectedBytes, expectedStatus) => {
    const fixture = createFixture();
    const response = await invokeRoute(fixture.routes.get(RESOLVE_ROUTE), { query: { q: query } });

    expect(Buffer.byteLength(query, 'utf8')).toBe(expectedBytes);
    expect(response.statusCode).toBe(expectedStatus);
    if (expectedStatus === 400) {
      expect(response.payload).toMatchObject({
        success: false,
        code: 'MUSIC_BOT_QUERY_TOO_LONG',
        maxBytes: MAX_QUERY_BYTES
      });
      expect(fixture.resolver.resolve).not.toHaveBeenCalled();
    } else {
      expect(fixture.resolver.resolve).toHaveBeenCalledTimes(1);
    }
  });

  test.each([
    ['ASCII at byte limit', 'a'.repeat(MAX_QUERY_BYTES), MAX_QUERY_BYTES, 200],
    ['ASCII over byte limit', 'a'.repeat(MAX_QUERY_BYTES + 1), MAX_QUERY_BYTES + 1, 400],
    ['multibyte at byte limit', '🎵'.repeat(MAX_QUERY_BYTES / 4), MAX_QUERY_BYTES, 200],
    ['multibyte over byte limit', '🎵'.repeat(MAX_QUERY_BYTES / 4 + 1), MAX_QUERY_BYTES + 4, 400]
  ])('enforces UTF-8 query byte limit on request: %s', async (_label, query, expectedBytes, expectedStatus) => {
    const fixture = createFixture();
    const response = await invokeRoute(fixture.routes.get(REQUEST_ROUTE), { body: { query } });

    expect(Buffer.byteLength(query, 'utf8')).toBe(expectedBytes);
    expect(response.statusCode).toBe(expectedStatus);
    if (expectedStatus === 400) {
      expect(response.payload).toMatchObject({
        success: false,
        code: 'MUSIC_BOT_QUERY_TOO_LONG',
        maxBytes: MAX_QUERY_BYTES
      });
      expect(fixture.resolver.resolve).not.toHaveBeenCalled();
      expect(fixture.queueCalls).toHaveLength(0);
    } else {
      expect(fixture.resolver.resolve).toHaveBeenCalledTimes(1);
      expect(fixture.queueCalls).toHaveLength(1);
    }
  });

  test('aborts an active dashboard resolution on premature response close, but not after normal finish', () => {
    const fixture = createFixture();
    const req = new EventEmitter();
    const response = createResponse();

    const aborted = fixture.plugin._createRequestAbort(req, response);
    response.emit('close');
    expect(aborted.signal.aborted).toBe(true);
    aborted.cleanup();
    expect(req.listenerCount('aborted')).toBe(0);
    expect(response.listenerCount('finish')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);

    const requestAborted = fixture.plugin._createRequestAbort(req, response);
    req.emit('aborted');
    expect(requestAborted.signal.aborted).toBe(true);
    requestAborted.cleanup();

    const normallyFinished = fixture.plugin._createRequestAbort(req, response);
    response.emit('finish');
    response.writableFinished = true;
    response.emit('close');
    expect(normallyFinished.signal.aborted).toBe(false);
    normallyFinished.cleanup();
    expect(req.listenerCount('aborted')).toBe(0);
    expect(response.listenerCount('finish')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  test('does not enqueue a resolved song after the client disconnects during resolution', async () => {
    const fixture = createFixture();
    let resolverSignal;
    let finishResolution;
    fixture.resolver.resolve.mockImplementation((_query, { signal }) => {
      resolverSignal = signal;
      return new Promise((resolve) => { finishResolution = resolve; });
    });
    const lifecycle = {};
    const pendingResponse = invokeRoute(fixture.routes.get(REQUEST_ROUTE), {
      body: { query: 'synthetic dashboard query' },
      lifecycle
    });

    expect(resolverSignal).toBeDefined();
    lifecycle.response.emit('close');
    expect(resolverSignal.aborted).toBe(true);
    finishResolution({ success: true, song: { id: 'late-result', url: 'https://example.test/late' } });

    const response = await pendingResponse;
    expect(response.payload).toBeNull();
    expect(fixture.queueCalls).toHaveLength(0);
    expect(fixture.plugin._schedulePreCache).not.toHaveBeenCalled();
    expect(lifecycle.req.listenerCount('aborted')).toBe(0);
    expect(lifecycle.response.listenerCount('close')).toBe(0);
  });

  test('does not respond or run follow-up work after resolve disconnects and finishes late', async () => {
    const fixture = createFixture();
    let resolverSignal;
    let finishResolution;
    fixture.resolver.resolve.mockImplementation((_query, { signal }) => {
      resolverSignal = signal;
      return new Promise((resolve) => { finishResolution = resolve; });
    });
    const lifecycle = {};
    const pendingResponse = invokeRoute(fixture.routes.get(RESOLVE_ROUTE), {
      query: { q: 'synthetic dashboard preview' },
      lifecycle
    });
    const responseJson = jest.spyOn(lifecycle.response, 'json');
    const responseStatus = jest.spyOn(lifecycle.response, 'status');

    expect(resolverSignal).toBeDefined();
    lifecycle.response.emit('close');
    expect(resolverSignal.aborted).toBe(true);
    finishResolution({
      success: true,
      song: { id: 'late-preview-result', title: 'Late preview' }
    });

    const response = await pendingResponse;
    expect(response.payload).toBeNull();
    expect(responseJson).not.toHaveBeenCalled();
    expect(responseStatus).not.toHaveBeenCalled();
    expect(fixture.plugin._getBanRejection).not.toHaveBeenCalled();
    expect(fixture.queueCalls).toHaveLength(0);
    expect(fixture.plugin._schedulePreCache).not.toHaveBeenCalled();
    expect(lifecycle.req.listenerCount('aborted')).toBe(0);
    expect(lifecycle.response.listenerCount('finish')).toBe(0);
    expect(lifecycle.response.listenerCount('close')).toBe(0);
  });
});
