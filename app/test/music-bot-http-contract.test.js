'use strict';

const {
  CONTRACT_VERSION,
  COMMAND_NAME,
  DEFAULT_BASE_URL,
  BASE_PATH,
  DEFAULT_TIMEOUT_MS,
  MAX_QUERY_LENGTH,
  DEFAULT_REQUEST_USERNAME,
  DEFAULT_SKIP_REASON,
  HTTP_STATUS,
  ENDPOINTS,
  ERROR_CODES,
  MESSAGE_KEY_TO_ERROR_CODE,
  MESSAGE_KEYS,
  DEFAULT_MESSAGES,
  REQUIRED_CLIENT_METHODS,
  OPTIONAL_CLIENT_METHODS,
  normalizeSongQuery,
  assertSongRequest,
  isSongRequest,
  buildRequestPayload,
  buildQueuePlayPayload,
  buildSkipPayload,
  resolveEndpoint,
  buildRequestUrl,
  createFailure,
  createSuccess,
  mapResponseToFailure,
  assertMusicBotClient,
  isMusicBotClient,
  createMusicBotHttpClient,
  createInMemoryMusicBotServer
} = require('../modules/music-bot-http-contract');

describe('music-bot-http-contract constants', () => {
  test('exposes a version and the documented constants', () => {
    expect(typeof CONTRACT_VERSION).toBe('string');
    expect(CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(COMMAND_NAME).toBe('song');
    expect(DEFAULT_BASE_URL).toBe('http://127.0.0.1:3000');
    expect(BASE_PATH).toBe('/api/plugins/music-bot');
    expect(DEFAULT_TIMEOUT_MS).toBe(5000);
    expect(MAX_QUERY_LENGTH).toBe(200);
    expect(DEFAULT_REQUEST_USERNAME).toBe('dashboard');
    expect(DEFAULT_SKIP_REASON).toBe('host');
  });

  test('documents the HTTP routes of the real plugin', () => {
    expect(ENDPOINTS.queue).toEqual({
      method: 'GET',
      path: '/api/plugins/music-bot/queue',
      pathTemplate: '/api/plugins/music-bot/queue'
    });
    expect(ENDPOINTS.request.method).toBe('POST');
    expect(ENDPOINTS.request.path).toBe('/api/plugins/music-bot/request');
    expect(ENDPOINTS.play.method).toBe('POST');
    expect(ENDPOINTS.play.path).toBeNull();
    expect(ENDPOINTS.play.pathTemplate).toBe('/api/plugins/music-bot/queue/:index/play');
    expect(ENDPOINTS.skip.path).toBe('/api/plugins/music-bot/skip');
    expect(ENDPOINTS.status.path).toBe('/api/plugins/music-bot/status');
    expect(HTTP_STATUS).toEqual({
      OK: 200,
      BAD_REQUEST: 400,
      NOT_FOUND: 404,
      CONFLICT: 409,
      LOCKED: 423,
      SERVER_ERROR: 500
    });
  });

  test('freezes every exported constant', () => {
    for (const value of [
      HTTP_STATUS,
      ENDPOINTS,
      ERROR_CODES,
      MESSAGE_KEY_TO_ERROR_CODE,
      MESSAGE_KEYS,
      DEFAULT_MESSAGES,
      REQUIRED_CLIENT_METHODS,
      OPTIONAL_CLIENT_METHODS
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  test('documents a message key and fallback for every error code', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(typeof MESSAGE_KEYS[code]).toBe('string');
      expect(MESSAGE_KEYS[code].length).toBeGreaterThan(0);
      expect(typeof DEFAULT_MESSAGES[code]).toBe('string');
      expect(DEFAULT_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });

  test('REQUIRED_CLIENT_METHODS matches the documented interface', () => {
    expect(REQUIRED_CLIENT_METHODS).toEqual(['queue', 'enqueue', 'play', 'skip', 'status']);
    expect(OPTIONAL_CLIENT_METHODS).toEqual(['getBaseUrl', 'getTimeoutMs']);
  });
});

describe('music-bot-http-contract normalizeSongQuery', () => {
  test('trims and collapses whitespace', () => {
    expect(normalizeSongQuery('  never   gonna  give you up ')).toBe('never gonna give you up');
    expect(normalizeSongQuery('https://youtu.be/abc')).toBe('https://youtu.be/abc');
  });

  test('rejects unusable queries', () => {
    for (const value of [
      '',
      '   ',
      'bad\u0000query',
      'x'.repeat(MAX_QUERY_LENGTH + 1),
      null,
      undefined,
      42,
      {}
    ]) {
      expect(normalizeSongQuery(value)).toBe('');
    }
  });

  test('accepts a query at the maximum length', () => {
    expect(normalizeSongQuery('x'.repeat(MAX_QUERY_LENGTH))).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe('music-bot-http-contract assertSongRequest', () => {
  test('normalizes a request and freezes it', () => {
    const request = assertSongRequest({
      query: '  Song   Name ',
      requestedBy: ' viewer-1 ',
      requesterAvatar: ' https://cdn.example/a.png ',
      timestamp: 1234
    });

    expect(request).toEqual({
      query: 'Song Name',
      requestedBy: 'viewer-1',
      requesterAvatar: 'https://cdn.example/a.png',
      timestamp: 1234
    });
    expect(Object.isFrozen(request)).toBe(true);
  });

  test('defaults optional fields', () => {
    const before = Date.now();
    const request = assertSongRequest({ query: 'song' });
    expect(request.requestedBy).toBeNull();
    expect(request.requesterAvatar).toBeNull();
    expect(request.timestamp).toBeGreaterThanOrEqual(before);
  });

  test('flags an empty query', () => {
    expect(() => assertSongRequest({ query: '   ' })).toThrow(TypeError);
    try {
      assertSongRequest({ query: '   ' });
    } catch (error) {
      expect(error.code).toBe(ERROR_CODES.EMPTY_QUERY);
    }
  });

  test('flags control characters and over-long queries as invalid', () => {
    for (const query of ['bad\u0001query', 'x'.repeat(MAX_QUERY_LENGTH + 1)]) {
      try {
        assertSongRequest({ query });
        throw new Error('expected assertSongRequest to throw');
      } catch (error) {
        expect(error.code).toBe(ERROR_CODES.INVALID_QUERY);
      }
    }
  });

  test('rejects non-object input', () => {
    for (const value of [null, undefined, 'song', 42, []]) {
      expect(() => assertSongRequest(value)).toThrow(TypeError);
    }
  });

  test('isSongRequest is the boolean variant', () => {
    expect(isSongRequest({ query: 'song' })).toBe(true);
    expect(isSongRequest({ query: '  ' })).toBe(false);
    expect(isSongRequest(null)).toBe(false);
  });
});

describe('music-bot-http-contract payload builders', () => {
  test('buildRequestPayload uses the requester as username and falls back to dashboard', () => {
    expect(buildRequestPayload({ query: ' a  song ', requestedBy: 'viewer-7' })).toEqual({
      query: 'a song',
      username: 'viewer-7',
      requesterAvatar: null
    });
    expect(buildRequestPayload({ query: 'a song' })).toEqual({
      query: 'a song',
      username: DEFAULT_REQUEST_USERNAME,
      requesterAvatar: null
    });
    expect(buildRequestPayload({ query: 'a song' }, { username: 'host' })).toEqual({
      query: 'a song',
      username: 'host',
      requesterAvatar: null
    });
  });

  test('buildQueuePlayPayload requires a non-negative integer index', () => {
    expect(buildQueuePlayPayload({ index: 0 })).toEqual({ songId: null });
    expect(buildQueuePlayPayload({ index: 3, songId: ' song-9 ' })).toEqual({ songId: 'song-9' });
    for (const index of [-1, 1.5, '2', null, undefined]) {
      try {
        buildQueuePlayPayload({ index });
        throw new Error('expected buildQueuePlayPayload to throw');
      } catch (error) {
        expect(error.code).toBe(ERROR_CODES.BAD_INDEX);
      }
    }
  });

  test('buildSkipPayload defaults the reason to host', () => {
    expect(buildSkipPayload()).toEqual({ reason: DEFAULT_SKIP_REASON });
    expect(buildSkipPayload({ reason: 'viewer' })).toEqual({ reason: 'viewer' });
    expect(buildSkipPayload({ reason: '   ' })).toEqual({ reason: DEFAULT_SKIP_REASON });
  });
});

describe('music-bot-http-contract resolveEndpoint', () => {
  test('resolves named endpoints', () => {
    expect(resolveEndpoint('queue')).toEqual({
      method: 'GET',
      path: '/api/plugins/music-bot/queue'
    });
    expect(resolveEndpoint('play', { index: 2 })).toEqual({
      method: 'POST',
      path: '/api/plugins/music-bot/queue/2/play'
    });
  });

  test('encodes path params', () => {
    expect(resolveEndpoint('play', { index: 'a/b' }).path).toBe('/api/plugins/music-bot/queue/a%2Fb/play');
  });

  test('rejects unknown endpoints and missing params', () => {
    expect(() => resolveEndpoint('unknown')).toThrow(TypeError);
    expect(() => resolveEndpoint('play', {})).toThrow(TypeError);
  });

  test('buildRequestUrl joins base and path', () => {
    expect(buildRequestUrl('http://127.0.0.1:3000/', '/api/plugins/music-bot/status'))
      .toBe('http://127.0.0.1:3000/api/plugins/music-bot/status');
    expect(buildRequestUrl('http://127.0.0.1:3000', 'api/plugins/music-bot/status'))
      .toBe('http://127.0.0.1:3000/api/plugins/music-bot/status');
  });
});

describe('music-bot-http-contract result builders', () => {
  test('createFailure freezes and renders params', () => {
    const failure = createFailure(ERROR_CODES.USER_LIMIT, { maxPerUser: 2 });
    expect(failure).toEqual({
      ok: false,
      code: ERROR_CODES.USER_LIMIT,
      message: 'Pro Nutzer sind maximal 2 aktive Requests erlaubt.',
      messageKey: 'queueUserLimit',
      params: { maxPerUser: 2 }
    });
    expect(Object.isFrozen(failure)).toBe(true);
    expect(Object.isFrozen(failure.params)).toBe(true);
  });

  test('createFailure rejects unknown codes', () => {
    expect(() => createFailure('nope')).toThrow(TypeError);
  });

  test('createSuccess freezes the result', () => {
    const success = createSuccess({ length: 3 });
    expect(success).toEqual({ ok: true, length: 3 });
    expect(Object.isFrozen(success)).toBe(true);
  });

  test('maps locked and stale responses', () => {
    expect(mapResponseToFailure({ status: HTTP_STATUS.LOCKED, body: {} }).code)
      .toBe(ERROR_CODES.LOCKED);
    expect(mapResponseToFailure({ status: HTTP_STATUS.CONFLICT, body: { staleQueue: true } }).code)
      .toBe(ERROR_CODES.STALE);
  });

  test('maps messageKey values', () => {
    expect(mapResponseToFailure({
      status: HTTP_STATUS.BAD_REQUEST,
      body: { messageKey: 'queueDuplicate', params: { position: 2, title: 'x' } }
    })).toMatchObject({ ok: false, code: ERROR_CODES.DUPLICATE, messageKey: 'queueDuplicate' });
  });

  test('falls back for bad requests and unknown responses', () => {
    expect(mapResponseToFailure({ status: HTTP_STATUS.BAD_REQUEST, body: {} }).code)
      .toBe(ERROR_CODES.REQUEST_FAILED);
    expect(mapResponseToFailure({ status: HTTP_STATUS.SERVER_ERROR, body: {} }).code)
      .toBe(ERROR_CODES.UNAVAILABLE);
    expect(mapResponseToFailure(null).code).toBe(ERROR_CODES.UNAVAILABLE);
  });
});

describe('music-bot-http-contract client interface', () => {
  test('rejects a client without the required methods', () => {
    expect(isMusicBotClient(null)).toBe(false);
    expect(isMusicBotClient({})).toBe(false);
    expect(() => assertMusicBotClient({ queue() {} })).toThrow(TypeError);
  });

  test('accepts a client with all required methods', () => {
    const client = createMusicBotHttpClient({
      transport: createInMemoryMusicBotServer().transport
    });
    expect(isMusicBotClient(client)).toBe(true);
    expect(assertMusicBotClient(client)).toBe(client);
    expect(client.getBaseUrl()).toBe(DEFAULT_BASE_URL);
    expect(client.getTimeoutMs()).toBe(DEFAULT_TIMEOUT_MS);
  });

  test('requires a transport', () => {
    expect(() => createMusicBotHttpClient()).toThrow(/transport is required/);
    expect(() => createMusicBotHttpClient({ transport: 'nope' })).toThrow(/transport is required/);
  });

  test('honours a custom base URL and timeout', () => {
    const client = createMusicBotHttpClient({
      transport: createInMemoryMusicBotServer().transport,
      baseUrl: 'http://10.0.0.5:3210/',
      timeoutMs: 250
    });
    expect(client.getBaseUrl()).toBe('http://10.0.0.5:3210');
    expect(client.getTimeoutMs()).toBe(250);
  });
});

describe('music-bot-http-contract client against the in-memory server', () => {
  function createFixture() {
    const server = createInMemoryMusicBotServer({
      nowPlaying: { id: 'song-1', title: 'First' },
      playbackState: 'playing'
    });
    const client = createMusicBotHttpClient({ transport: server.transport });
    return { server, client };
  }

  test('enqueue adds a song and reports position and title', async () => {
    const { server, client } = createFixture();
    const result = await client.enqueue({ query: '  Never   Gonna ', requestedBy: 'viewer-1' });

    expect(result).toEqual({
      ok: true,
      position: 1,
      title: 'Never Gonna',
      song: expect.objectContaining({ title: 'Never Gonna', requestedBy: 'viewer-1' })
    });
    expect(server.calls[0]).toMatchObject({
      method: 'POST',
      path: '/api/plugins/music-bot/request',
      body: { query: 'Never Gonna', username: 'viewer-1', requesterAvatar: null }
    });
  });

  test('queue reports the current length', async () => {
    const { client } = createFixture();
    await client.enqueue({ query: 'one' }, { username: 'viewer-1' });
    await client.enqueue({ query: 'two' }, { username: 'viewer-2' });

    const result = await client.queue();
    expect(result).toMatchObject({ ok: true, length: 2 });
    expect(result.queue).toHaveLength(2);
  });

  test('play moves a queued song to the front', async () => {
    const { server, client } = createFixture();
    await client.enqueue({ query: 'new song' }, { username: 'viewer-1' });

    const result = await client.play({ index: 0 });
    expect(result).toEqual({ ok: true, title: 'new song', alreadyPlaying: false });
    expect(server.state().nowPlaying.title).toBe('new song');
  });

  test('play by unknown songId reports a stale queue', async () => {
    const { client } = createFixture();
    const result = await client.play({ index: 0, songId: 'missing' });
    expect(result).toMatchObject({ ok: false, code: ERROR_CODES.STALE });
  });

  test('play rejects an invalid index without calling the backend', async () => {
    const { server, client } = createFixture();
    const result = await client.play({ index: -1 });
    expect(result).toMatchObject({ ok: false, code: ERROR_CODES.BAD_INDEX });
    expect(server.calls).toHaveLength(0);
  });

  test('skip reports the next title', async () => {
    const { server, client } = createFixture();
    await client.enqueue({ query: 'next up' }, { username: 'viewer-1' });

    const result = await client.skip();
    expect(result).toEqual({ ok: true, nextTitle: 'next up' });
    expect(server.state().nowPlaying.title).toBe('next up');
  });

  test('status mirrors the plugin payload', async () => {
    const { client } = createFixture();
    const result = await client.status();
    expect(result).toEqual({
      ok: true,
      nowPlayingTitle: 'First',
      queueLength: 0,
      playbackState: 'playing',
      locked: false
    });
  });

  test('enqueue rejects an empty query before calling the backend', async () => {
    const { server, client } = createFixture();
    const result = await client.enqueue({ query: '   ' });
    expect(result).toMatchObject({ ok: false, code: ERROR_CODES.EMPTY_QUERY });
    expect(server.calls).toHaveLength(0);
  });

  test('a locked backend maps to LOCKED for every route', async () => {
    const { server, client } = createFixture();
    server.setLocked(true);

    for (const result of [
      await client.enqueue({ query: 'song' }),
      await client.play({ index: 0 }),
      await client.skip()
    ]) {
      expect(result).toMatchObject({ ok: false, code: ERROR_CODES.LOCKED });
    }
  });
});

describe('music-bot-http-contract transport failures', () => {
  test('maps a backend messageKey rejection', async () => {
    const server = createInMemoryMusicBotServer();
    server.failWith(ENDPOINTS.request.path, {
      status: HTTP_STATUS.BAD_REQUEST,
      body: {
        success: false,
        error: 'Queue is full',
        messageKey: 'queueFull',
        params: { maxLength: 5 }
      }
    });
    const client = createMusicBotHttpClient({ transport: server.transport });

    const result = await client.enqueue({ query: 'song' });
    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.QUEUE_FULL,
      messageKey: 'queueFull',
      params: { maxLength: 5 }
    });
  });

  test('maps a stale 409 on play', async () => {
    const server = createInMemoryMusicBotServer();
    server.failWith(/\/queue\/0\/play$/, {
      status: HTTP_STATUS.CONFLICT,
      body: { success: false, staleQueue: true }
    });
    const client = createMusicBotHttpClient({ transport: server.transport });

    const result = await client.play({ index: 0 });
    expect(result).toMatchObject({ ok: false, code: ERROR_CODES.STALE });
  });

  test('maps a throwing transport to UNAVAILABLE', async () => {
    const client = createMusicBotHttpClient({
      transport: async () => {
        throw new Error('ECONNREFUSED');
      }
    });
    await expect(client.status()).resolves.toMatchObject({
      ok: false,
      code: ERROR_CODES.UNAVAILABLE
    });
  });

  test('maps a malformed transport response to UNAVAILABLE', async () => {
    const client = createMusicBotHttpClient({ transport: async () => ({ body: {} }) });
    await expect(client.queue()).resolves.toMatchObject({
      ok: false,
      code: ERROR_CODES.UNAVAILABLE
    });
  });

  test('times out when the transport does not settle', async () => {
    const client = createMusicBotHttpClient({
      transport: () => new Promise(() => {}),
      timeoutMs: 20
    });
    await expect(client.status()).resolves.toMatchObject({
      ok: false,
      code: ERROR_CODES.TIMEOUT
    });
  });
});

describe('music-bot-http-contract in-memory server controls', () => {
  test('records calls and supports failure overrides for all routes', async () => {
    const server = createInMemoryMusicBotServer();
    server.failWith('*', { status: HTTP_STATUS.SERVER_ERROR, body: { success: false } });
    const client = createMusicBotHttpClient({ transport: server.transport });

    const result = await client.status();
    expect(result).toMatchObject({ ok: false, code: ERROR_CODES.UNAVAILABLE });
    expect(server.calls).toHaveLength(1);

    server.clearFailure();
    server.setQueue([{ id: 'song-1', title: 'A' }]);
    expect(server.state().queue).toHaveLength(1);

    server.reset();
    expect(server.state()).toEqual({
      queue: [],
      nowPlaying: null,
      playbackState: 'idle',
      locked: false
    });
    expect(server.calls).toHaveLength(0);
  });
});
