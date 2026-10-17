'use strict';

const EventEmitter = require('events');
const {
  ALLOWED_ENDPOINT,
  ALLOWED_TARGET,
  API_KEY_ENV,
  MAX_CAPTURE_MS,
  createRuntimeDecoder,
  exitCodeForResult,
  formatDiagnostic,
  isSingleApiKey,
  loadRuntimeDependencies,
  projectApprovedDto,
  projectCloseDiagnostic,
  projectSocketErrorCode,
  runPassiveCapture,
  validateWebSocketUrl
} = require('../scripts/obs-pilot/eulerstream-passive-receiver');

const SYNTHETIC_KEY = 'synthetic-eulerstream-key-canary-123456789';

class FakeSocket extends EventEmitter {
  static instances = [];

  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.readyState = 0;
    this.close = jest.fn(() => { this.readyState = 2; });
    this.terminate = jest.fn(() => {
      this.readyState = 3;
      Promise.resolve().then(() => {
        this.emit('error', new Error('synthetic delayed transport error'));
        this.emit('close');
      });
    });
    FakeSocket.instances.push(this);
  }
}

function makeUser(overrides = {}) {
  return {
    nickname: 'Synthetic Viewer',
    fansClubInfo: { fansLevel: '4' },
    ...overrides
  };
}

function makeBarrage({ displayType = 'ttlive_superfan', user = makeUser() } = {}) {
  return {
    content: {
      displayType,
      piecesList: [{ userValue: { user } }]
    }
  };
}

function makeDependencies({ messages = [], urlBase = ALLOWED_ENDPOINT, decodeFrame } = {}) {
  return {
    createWebSocketUrl: jest.fn(({ uniqueId, apiKey }) => {
      const url = new URL(urlBase);
      url.searchParams.set('uniqueId', uniqueId);
      url.searchParams.set('apiKey', apiKey);
      return url.toString();
    }),
    WebSocket: FakeSocket,
    decodeFrame: decodeFrame || jest.fn(() => ({
      protoMessageFetchResult: { messages }
    }))
  };
}

describe('isolated EulerStream passive receiver', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('pins the one target, key source name, endpoint, and ten-minute ceiling', () => {
    expect(ALLOWED_TARGET).toBe('marry_backup');
    expect(API_KEY_ENV).toBe('EULER_FALLBACK_API_KEY');
    expect(MAX_CAPTURE_MS).toBe(600000);
    expect(ALLOWED_ENDPOINT).toBe('wss://ws.eulerstream.com');
    expect(exitCodeForResult({ status: 'deadline', acceptedCount: 1 })).toBe(0);
    expect(exitCodeForResult({ status: 'deadline', acceptedCount: 0 })).toBe(6);
    expect(exitCodeForResult({ status: 'closed', acceptedCount: 1 })).toBe(7);
    expect(exitCodeForResult({ status: 'socket-error', acceptedCount: 0 })).toBe(8);
    expect(exitCodeForResult({ status: 'decode-error', acceptedCount: 0 })).toBe(9);
    expect(isSingleApiKey(SYNTHETIC_KEY)).toBe(true);
    expect(isSingleApiKey(`${SYNTHETIC_KEY},second-key-canary-value`)).toBe(false);
    expect(isSingleApiKey(` ${SYNTHETIC_KEY}`)).toBe(false);
  });

  test.each([
    ['ENOTFOUND', 'ENOTFOUND'], ['ECONNRESET', 'ECONNRESET'],
    ['ETIMEDOUT', 'ETIMEDOUT'], ['ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_TLS_CERT_ALTNAME_INVALID'],
    ['private-canary', 'unknown'], [undefined, 'unknown']
  ])('projects socket error code %s without private error fields', (code, expected) => {
    const error = Object.assign(new Error('private-message-canary'), {
      code,
      stack: 'private-stack-canary',
      url: `wss://private-key-canary@secret.example/?apiKey=${SYNTHETIC_KEY}`
    });
    expect(projectSocketErrorCode(error)).toBe(expected);
    expect(JSON.stringify(projectSocketErrorCode(error))).not.toMatch(/private|secret|synthetic/);
  });

  test('formats diagnostics using only the projected allowlist fields', () => {
    const line = formatDiagnostic({
      status: 'socket-error',
      diagnostic: { event: 'error', code: 'ECONNRESET' },
      message: 'private-message',
      url: `wss://secret.example/?apiKey=${SYNTHETIC_KEY}`
    });
    expect(line).toBe('{"status":"socket-error","diagnostic":{"event":"error","code":"ECONNRESET"}}');
    expect(line).not.toMatch(/private|secret|synthetic|apiKey|wss:\/\//);
    expect(formatDiagnostic({ status: 'closed' })).toBe('');
  });

  test.each([
    [4401, 'auth-rejected'], [4403, 'permission-denied'], [4404, 'stream-not-live'],
    [4429, 'rate-limited'], [1011, 'server-error'], [4500, 'upstream-closed'],
    [4999, 'unknown'], ['4401', 'unknown'], [999, 'unknown']
  ])('projects close code %s into a normalized reason class', (code, reasonClass) => {
    if (!Number.isInteger(code) || code < 1000 || code > 4999) {
      expect(projectCloseDiagnostic(code)).toBeNull();
    } else {
      expect(projectCloseDiagnostic(code)).toEqual({ event: 'close', code, reasonClass });
    }
  });

  test('loads only the already-installed SDK and WebSocket client at the pinned endpoint', () => {
    const sdk = require('@eulerstream/euler-websocket-sdk');
    const runtime = loadRuntimeDependencies();
    expect(sdk.BASE_URL).toBe(ALLOWED_ENDPOINT);
    expect(typeof runtime.createWebSocketUrl).toBe('function');
    expect(typeof runtime.decodeFrame).toBe('function');
    expect(typeof runtime.WebSocket).toBe('function');
    expect(require('@eulerstream/euler-websocket-sdk/package.json').version).toBe('0.0.6');
  });

  test.each([
    ['wrong scheme', 'ws://ws.eulerstream.com'],
    ['foreign host', 'wss://evil.example'],
    ['alternate port', 'wss://ws.eulerstream.com:444'],
    ['extra query', 'wss://ws.eulerstream.com/?debug=true']
  ])('rejects %s before creating a socket', async (_label, base) => {
    const dependencies = makeDependencies({ urlBase: base });
    const result = await runPassiveCapture({ target: ALLOWED_TARGET, apiKey: SYNTHETIC_KEY }, dependencies);
    expect(result.status).toBe('url-rejected');
    expect(FakeSocket.instances).toHaveLength(0);
  });

  test('rejects an unapproved target or non-single key before URL creation', async () => {
    const dependencies = makeDependencies();
    const wrongTarget = await runPassiveCapture({ target: 'another_account', apiKey: SYNTHETIC_KEY }, dependencies);
    const multipleKeys = await runPassiveCapture({ target: ALLOWED_TARGET, apiKey: `${SYNTHETIC_KEY},other` }, dependencies);
    expect(wrongTarget.status).toBe('invalid-input');
    expect(multipleKeys.status).toBe('invalid-input');
    expect(dependencies.createWebSocketUrl).not.toHaveBeenCalled();
    expect(FakeSocket.instances).toHaveLength(0);
  });

  test('rejects an SDK URL bound to a different account before creating a socket', async () => {
    const dependencies = makeDependencies();
    dependencies.createWebSocketUrl = jest.fn(() =>
      `wss://ws.eulerstream.com/?uniqueId=other&apiKey=${SYNTHETIC_KEY}`);
    const result = await runPassiveCapture({ target: ALLOWED_TARGET, apiKey: SYNTHETIC_KEY }, dependencies);
    expect(result.status).toBe('url-rejected');
    expect(FakeSocket.instances).toHaveLength(0);
  });

  test('rejects an SDK URL carrying a different key before creating a socket', async () => {
    const dependencies = makeDependencies();
    dependencies.createWebSocketUrl = jest.fn(() =>
      'wss://ws.eulerstream.com/?uniqueId=marry_backup&apiKey=synthetic-wrong-key-canary-123456');
    const result = await runPassiveCapture({ target: ALLOWED_TARGET, apiKey: SYNTHETIC_KEY }, dependencies);
    expect(result.status).toBe('url-rejected');
    expect(FakeSocket.instances).toHaveLength(0);
  });

  test('validates the SDK URL shape without returning or logging its API key', () => {
    const url = new URL(ALLOWED_ENDPOINT);
    url.searchParams.set('uniqueId', ALLOWED_TARGET);
    url.searchParams.set('apiKey', SYNTHETIC_KEY);
    expect(validateWebSocketUrl(url.toString(), ALLOWED_TARGET, SYNTHETIC_KEY)).toBe(true);
    expect(validateWebSocketUrl(`${url.toString()}&uniqueId=extra`, ALLOWED_TARGET, SYNTHETIC_KEY)).toBe(false);
    expect(validateWebSocketUrl(url.toString(), ALLOWED_TARGET, 'synthetic-other-key-canary-123456789')).toBe(false);
    expect(validateWebSocketUrl('not-a-url', ALLOWED_TARGET, SYNTHETIC_KEY)).toBe(false);
  });

  test('emits only allowlisted SuperFan DTOs and discards other event types and raw fields', async () => {
    const avatar = 'https://p16-sign.tiktokcdn.com/synthetic.jpg';
    const messages = [
      { decodedData: { type: 'WebcastChatMessage', data: { comment: 'raw chat canary', userId: 'private-id' } } },
      { decodedData: { type: 'WebcastBarrageMessage', data: makeBarrage({ user: makeUser({
        userId: 'private-id-canary',
        profilePicture: { url: [avatar] },
        rawSecret: 'raw-payload-canary'
      }) }) } },
      { decodedData: { type: 'WebcastBarrageMessage', data: makeBarrage({
        user: makeUser({ nickname: 'Bad\nName', userId: 'invalid-name-canary' })
      }) } }
    ];
    const dependencies = makeDependencies({ messages });
    const receivedDtos = [];
    const resultPromise = runPassiveCapture({
      target: ALLOWED_TARGET,
      apiKey: SYNTHETIC_KEY,
      onDto: dto => receivedDtos.push(dto)
    }, dependencies);
    const socket = FakeSocket.instances[0];

    socket.emit('message', Buffer.from('synthetic-frame'));
    socket.readyState = 3;
    socket.emit('close');
    const result = await resultPromise;

    expect(result).toEqual({ status: 'closed', acceptedCount: 1 });
    expect(exitCodeForResult(result)).toBe(7);
    expect(receivedDtos).toEqual([{
      eventType: 'superfan',
      displayName: 'Synthetic Viewer',
      level: 4,
      profilePictureUrl: avatar
    }]);
    expect(Object.keys(receivedDtos[0]).sort()).toEqual([
      'displayName', 'eventType', 'level', 'profilePictureUrl'
    ]);
    expect(JSON.stringify(receivedDtos)).not.toMatch(/private-id|raw-payload|raw chat/);
    expect(socket.options).toMatchObject({ maxPayload: 1024 * 1024, perMessageDeflate: false });
    expect(socket.listenerCount('message')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('rejects invalid DTO markers and non-allowlisted avatars', () => {
    const wrongMarker = projectApprovedDto(makeBarrage({ displayType: 'ttlive_like_message' }));
    const hostileAvatar = projectApprovedDto(makeBarrage({
      user: makeUser({ profilePicture: { url: ['https://evil.example/avatar.jpg'] } })
    }));
    expect(wrongMarker).toBeNull();
    expect(hostileAvatar).toEqual({ eventType: 'superfan', displayName: 'Synthetic Viewer', level: 4 });
  });

  test('suppresses decoder console calls and never exposes the key in results or logs', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const dependencies = makeDependencies({
      decodeFrame: jest.fn(() => {
        console.info('decoder-secret-canary', SYNTHETIC_KEY);
        return { protoMessageFetchResult: { messages: [] } };
      })
    });
    const resultPromise = runPassiveCapture({ target: ALLOWED_TARGET, apiKey: SYNTHETIC_KEY }, dependencies);
    FakeSocket.instances[0].emit('message', Buffer.from('synthetic-frame'));
    FakeSocket.instances[0].readyState = 3;
    FakeSocket.instances[0].emit('close');
    const result = await resultPromise;

    expect(result).toEqual({ status: 'closed', acceptedCount: 0 });
    for (const spy of [log, info, warn, error]) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_KEY);
    expect(dependencies.createWebSocketUrl).toHaveBeenCalledTimes(1);
  });

  test('runtime JSON decoder discards non-barrage event payloads before the DTO projector', () => {
    const sdk = {
      SchemaVersion: { v2: 'v2' },
      deserializeWebSocketMessage: jest.fn(() => ({ binary: true }))
    };
    const decode = createRuntimeDecoder(sdk);
    const json = Buffer.from(JSON.stringify({ messages: [
      { type: 'WebcastChatMessage', data: { comment: 'raw-chat-canary' } },
      { type: 'WebcastBarrageMessage', data: { content: { displayType: 'ttlive_superfan' } } }
    ] }));

    const decoded = decode(json);
    expect(decoded.protoMessageFetchResult.messages).toEqual([{
      decodedData: {
        type: 'WebcastBarrageMessage',
        data: { content: { displayType: 'ttlive_superfan' } }
      }
    }]);
    expect(JSON.stringify(decoded)).not.toContain('raw-chat-canary');
    expect(sdk.deserializeWebSocketMessage).not.toHaveBeenCalled();
  });

  test('falls back to the SDK protobuf decoder and redacts decoder failures', async () => {
    const sdk = {
      SchemaVersion: { v2: 'v2' },
      deserializeWebSocketMessage: jest.fn(() => { throw new Error(SYNTHETIC_KEY); })
    };
    const dependencies = makeDependencies({ decodeFrame: createRuntimeDecoder(sdk) });
    const resultPromise = runPassiveCapture({ target: ALLOWED_TARGET, apiKey: SYNTHETIC_KEY }, dependencies);
    FakeSocket.instances[0].emit('message', Buffer.from([0xff, 0xfe, 0xfd]));

    const result = await resultPromise;
    expect(result).toEqual({ status: 'decode-error', acceptedCount: 0 });
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_KEY);
    expect(sdk.deserializeWebSocketMessage).toHaveBeenCalledWith(expect.any(Uint8Array), 'v2');
  });

  test('keeps the session open through 9:59 and force-terminates at the ten-minute cap', async () => {
    const dependencies = makeDependencies();
    const resultPromise = runPassiveCapture({ target: ALLOWED_TARGET, apiKey: SYNTHETIC_KEY }, dependencies);
    const socket = FakeSocket.instances[0];
    let resolved = false;
    resultPromise.then(() => { resolved = true; });

    await jest.advanceTimersByTimeAsync(MAX_CAPTURE_MS - 1);
    expect(socket.terminate).not.toHaveBeenCalled();
    expect(resolved).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await resultPromise).toEqual({ status: 'deadline', acceptedCount: 0 });
    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount('error')).toBe(0);
    expect(socket.listenerCount('close')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  test('terminates on errors, rejects async consumers, and removes listeners without retrying', async () => {
    const errorDependencies = makeDependencies();
    const errorPromise = runPassiveCapture({ target: ALLOWED_TARGET, apiKey: SYNTHETIC_KEY }, errorDependencies);
    const errorSocket = FakeSocket.instances[0];
    errorSocket.emit('error', new Error(SYNTHETIC_KEY));
    expect(await errorPromise).toEqual({
      status: 'socket-error', acceptedCount: 0,
      diagnostic: { event: 'error', code: 'unknown' }
    });
    expect(errorSocket.terminate).toHaveBeenCalledTimes(1);
    expect(errorSocket.listenerCount('error')).toBe(0);
    expect(errorSocket.listenerCount('close')).toBe(0);
    expect(errorSocket.listenerCount('message')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);

    FakeSocket.instances = [];
    const asyncDependencies = makeDependencies({
      messages: [{ decodedData: { type: 'WebcastBarrageMessage', data: makeBarrage() } }]
    });
    const asyncPromise = runPassiveCapture({
      target: ALLOWED_TARGET,
      apiKey: SYNTHETIC_KEY,
      onDto: () => Promise.resolve()
    }, asyncDependencies);
    const asyncSocket = FakeSocket.instances[0];
    asyncSocket.emit('message', Buffer.from('synthetic-frame'));
    expect(await asyncPromise).toEqual({ status: 'async-consumer-rejected', acceptedCount: 0 });
    expect(asyncSocket.terminate).toHaveBeenCalledTimes(1);
    expect(asyncSocket.listenerCount('message')).toBe(0);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  test.each([
    ['auth', { code: 4401, reason: `private-reason ${SYNTHETIC_KEY}`, expectedClass: 'auth-rejected' }],
    ['permission', { code: 4403, reason: 'private permission details', expectedClass: 'permission-denied' }],
    ['not-live', { code: 4404, reason: 'stream private', expectedClass: 'stream-not-live' }],
    ['rate-limit', { code: 4429, reason: 'account private', expectedClass: 'rate-limited' }],
    ['unknown-close', { code: 4999, reason: 'secret url and payload', expectedClass: 'unknown' }]
  ])('reports only numeric close code and normalized class for %s', async (_name, item) => {
    const dependencies = makeDependencies();
    const promise = runPassiveCapture({ target: ALLOWED_TARGET, apiKey: SYNTHETIC_KEY }, dependencies);
    const socket = FakeSocket.instances[0];
    socket.emit('close', item.code, Buffer.from(item.reason));
    const result = await promise;
    expect(result).toEqual({
      status: 'closed', acceptedCount: 0,
      diagnostic: { event: 'close', code: item.code, reasonClass: item.expectedClass }
    });
    expect(JSON.stringify(result)).not.toMatch(/private|secret|payload|synthetic-eulerstream|wss:\/\//);
  });

  test.each([
    ['DNS', 'ENOTFOUND'], ['TLS', 'CERT_HAS_EXPIRED'], ['socket', 'ECONNRESET'],
    ['unknown', 'PRIVATE_ERROR_CANARY']
  ])('reports only allowlisted error code for %s errors', async (_name, errorCode) => {
    const dependencies = makeDependencies();
    const promise = runPassiveCapture({ target: ALLOWED_TARGET, apiKey: SYNTHETIC_KEY }, dependencies);
    const socket = FakeSocket.instances[0];
    const error = Object.assign(new Error(`private message ${SYNTHETIC_KEY}`), {
      code: errorCode,
      stack: 'private stack',
      headers: { authorization: SYNTHETIC_KEY },
      payload: 'private payload'
    });
    socket.emit('error', error);
    const result = await promise;
    expect(result).toEqual({
      status: 'socket-error', acceptedCount: 0,
      diagnostic: { event: 'error', code: ['ENOTFOUND', 'CERT_HAS_EXPIRED', 'ECONNRESET'].includes(errorCode) ? errorCode : 'unknown' }
    });
    expect(JSON.stringify(result)).not.toMatch(/private|synthetic-eulerstream|authorization|payload|wss:\/\//);
  });
});
