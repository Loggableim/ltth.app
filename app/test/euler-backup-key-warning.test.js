const EventEmitter = require('events');

const FALLBACK_KEY = 'a'.repeat(64);
const USER_KEY = 'b'.repeat(64);

function createMockDb(initialSettings = {}) {
  const settings = { ...initialSettings };

  return {
    getSetting: jest.fn((key) => settings[key] || null),
    getAllSettings: jest.fn(() => ({ ...settings })),
    setSetting: jest.fn((key, value) => {
      settings[key] = String(value);
    }),
    loadStreamStats: jest.fn(() => null),
    saveStreamStats: jest.fn(),
    resetStreamStats: jest.fn(),
    getGift: jest.fn(() => null),
    getGiftCatalog: jest.fn(() => []),
    updateGiftCatalog: jest.fn(() => 0),
    logEvent: jest.fn()
  };
}

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
}

function loadAdapterWithMockedNetwork(options = {}) {
  const {
    createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket'),
    deserializeWebSocketMessage = jest.fn(),
    SchemaVersion = {}
  } = options;

  class MockWebSocket extends EventEmitter {
    constructor(url) {
      super();
      this.url = url;
    }

    close() {}
    ping() {
      this.emit('pong');
    }
  }

  class MockWebcastEventEmitter extends EventEmitter {}

  jest.doMock('ws', () => MockWebSocket);
  jest.doMock('@eulerstream/euler-websocket-sdk', () => ({
    WebcastEventEmitter: MockWebcastEventEmitter,
    createWebSocketUrl,
    ClientCloseCode: {},
    deserializeWebSocketMessage,
    SchemaVersion
  }));

  return require('../modules/adapters/EulerstreamAdapter');
}

async function finishConnect(adapter, connectPromise) {
  if (!adapter.ws) {
    await jest.advanceTimersByTimeAsync(10000);
  }
  await Promise.resolve();
  expect(adapter.ws).toBeTruthy();
  adapter.ws.emit('open');
  await jest.advanceTimersByTimeAsync(0);
  adapter.ws.emit('message', JSON.stringify({
    messages: [{
      type: 'roomInfo',
      data: { roomId: '7654321', start_time: 1700000000 }
    }]
  }));
  await connectPromise;
}

describe('Eulerstream fallback key consent', () => {
  const originalEnv = process.env;
  let adapter;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    process.env = {
      ...originalEnv,
      EULER_FALLBACK_API_KEY: FALLBACK_KEY,
      EULER_BACKUP_API_KEY: FALLBACK_KEY
    };
    delete process.env.EULER_API_KEY;
    delete process.env.SIGN_API_KEY;
    adapter = null;
  });

  afterEach(() => {
    if (adapter) {
      adapter.disconnect();
    }
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.dontMock('ws');
    jest.dontMock('@eulerstream/euler-websocket-sdk');
    process.env = originalEnv;
  });

  test('requires explicit confirmation before a fallback key can open a socket', async () => {
    const createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket');
    const io = { emit: jest.fn() };

    jest.resetModules();
    const ConfirmingAdapter = loadAdapterWithMockedNetwork({ createWebSocketUrl });
    adapter = new ConfirmingAdapter(io, createMockDb(), createMockLogger());

    await expect(adapter.connect('testuser')).rejects.toMatchObject({
      connectionStatus: 'fallback_confirmation_required',
      confirmationDelayMs: 3000
    });
    expect(createWebSocketUrl).not.toHaveBeenCalled();
  });

  test('starts after explicit fallback consent and keeps normal user keys consent-free', async () => {
    const createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket');
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({ createWebSocketUrl });
    const io = { emit: jest.fn() };

    adapter = new EulerstreamAdapter(io, createMockDb(), createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser', { fallbackKeyConfirmed: true });
    await finishConnect(adapter, connectPromise);
    expect(createWebSocketUrl).toHaveBeenCalledTimes(1);

    adapter.disconnect();
    adapter = new EulerstreamAdapter(io, createMockDb({ tiktok_euler_api_key: USER_KEY }), createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));
    const personalKeyConnect = adapter.connect('testuser');
    await finishConnect(adapter, personalKeyConnect);
    expect(createWebSocketUrl).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: USER_KEY }));
  });

  test('reports configured database key as non-fallback in diagnostics', () => {
    const EulerstreamAdapter = loadAdapterWithMockedNetwork();
    adapter = new EulerstreamAdapter(
      { emit: jest.fn() },
      createMockDb({ tiktok_euler_api_key: USER_KEY }),
      createMockLogger()
    );

    expect(adapter.getEulerApiKeyInfo()).toEqual(expect.objectContaining({
      activeSource: 'Database Setting',
      configured: true,
      usingFallback: false
    }));
  });

  test('falls back to settings listing when direct setting lookup misses database key', () => {
    const EulerstreamAdapter = loadAdapterWithMockedNetwork();
    const db = createMockDb({ tiktok_euler_api_key: USER_KEY });
    db.getSetting.mockReturnValue(null);
    adapter = new EulerstreamAdapter(
      { emit: jest.fn() },
      db,
      createMockLogger()
    );

    expect(adapter.getEulerApiKeyInfo()).toEqual(expect.objectContaining({
      activeSource: 'Database Setting',
      configured: true,
      usingFallback: false
    }));
  });

  test('uses configured database key when creating WebSocket URL', async () => {
    const createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket');
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({ createWebSocketUrl });
    const io = { emit: jest.fn() };

    adapter = new EulerstreamAdapter(io, createMockDb({ tiktok_euler_api_key: USER_KEY }), createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser');
    await finishConnect(adapter, connectPromise);

    expect(createWebSocketUrl).toHaveBeenCalledWith(expect.objectContaining({
      uniqueId: 'testuser',
      apiKey: USER_KEY
    }));
  });

  test('uses an euler API key as the built-in fallback only after consent', async () => {
    delete process.env.EULER_FALLBACK_API_KEY;
    const createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket');
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({ createWebSocketUrl });
    const io = { emit: jest.fn() };

    adapter = new EulerstreamAdapter(io, createMockDb(), createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser', { fallbackKeyConfirmed: true });
    await finishConnect(adapter, connectPromise);

    expect(createWebSocketUrl).toHaveBeenCalledWith(expect.objectContaining({
      uniqueId: 'testuser',
      apiKey: expect.stringMatching(/^euler_/)
    }));
    expect(io.emit).not.toHaveBeenCalledWith('fallback-key-warning', expect.any(Object));
  });

  test('tries the remaining random fallback keys after authentication failures and then stops', async () => {
    const fallbackKeys = ['f'.repeat(64), 'e'.repeat(64), 'd'.repeat(64)];
    process.env.EULER_FALLBACK_API_KEY = fallbackKeys.join(',');
    jest.resetModules();
    const createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket');
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({ createWebSocketUrl });
    const io = { emit: jest.fn() };

    adapter = new EulerstreamAdapter(io, createMockDb(), createMockLogger());
    const connection = adapter.connect('testuser', { fallbackKeyConfirmed: true });
    const exhausted = expect(connection).rejects.toMatchObject({
      connectionStatus: 'fallback_keys_exhausted'
    });

    for (let attempt = 0; attempt < fallbackKeys.length; attempt++) {
      const socket = adapter.ws;
      socket.emit('open');
      await jest.advanceTimersByTimeAsync(0);
      socket.emit('close', 4401, 'invalid API key');
      await jest.advanceTimersByTimeAsync(0);
    }

    await exhausted;
    expect(createWebSocketUrl).toHaveBeenCalledTimes(fallbackKeys.length);
    expect(new Set(createWebSocketUrl.mock.calls.map(([options]) => options.apiKey))).toEqual(new Set(fallbackKeys));
    expect(adapter._autoReconnectTimer).toBeNull();
  });

  test('uses lowercase SDK v2 schema when decoding protobuf websocket frames', async () => {
    const deserializeWebSocketMessage = jest.fn(() => ({
      protoMessageFetchResult: {
        messages: []
      }
    }));
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({
      deserializeWebSocketMessage,
      SchemaVersion: { v2: 'v2' }
    });
    const io = { emit: jest.fn() };
    const db = createMockDb({ tiktok_euler_api_key: USER_KEY });

    adapter = new EulerstreamAdapter(io, db, createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser');
    await finishConnect(adapter, connectPromise);

    adapter.ws.emit('message', Buffer.from([0, 1, 2, 3]));

    expect(deserializeWebSocketMessage).toHaveBeenCalledWith(expect.any(Uint8Array), 'v2');
  });

  test('logs protobuf SDK decoded chat messages to the event log', async () => {
    const decodedChat = {
      type: 'WebcastChatMessage',
      data: {
        comment: 'hello from protobuf',
        user: {
          uniqueId: 'viewer_one',
          nickname: 'Viewer One',
          userId: 'user-1'
        }
      }
    };
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({
      deserializeWebSocketMessage: jest.fn(() => ({
        protoMessageFetchResult: {
          messages: [
            {
              type: 'WebcastChatMessage',
              decodedData: decodedChat
            }
          ]
        }
      }))
    });
    const io = { emit: jest.fn() };
    const db = createMockDb({ tiktok_euler_api_key: USER_KEY });

    adapter = new EulerstreamAdapter(io, db, createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser');
    await finishConnect(adapter, connectPromise);

    adapter.ws.emit('message', Buffer.from([0, 1, 2, 3]));
    await jest.advanceTimersByTimeAsync(0);

    expect(io.emit).toHaveBeenCalledWith('tiktok:event', {
      type: 'chat',
      data: expect.objectContaining({
        username: 'viewer_one',
        nickname: 'Viewer One',
        message: 'hello from protobuf'
      })
    });
    expect(db.logEvent).toHaveBeenCalledWith(
      'chat',
      'viewer_one',
      expect.objectContaining({
        username: 'viewer_one',
        message: 'hello from protobuf'
      })
    );
  });

  test('does not schedule a not-live reconnect and manual disconnect keeps timers clear', async () => {
    const EulerstreamAdapter = loadAdapterWithMockedNetwork();
    const io = { emit: jest.fn() };

    adapter = new EulerstreamAdapter(io, createMockDb({ tiktok_euler_api_key: USER_KEY }), createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('old_streamer');
    await finishConnect(adapter, connectPromise);

    const reconnectSpy = jest.spyOn(adapter, 'connect').mockImplementation(async () => {});
    adapter.ws.emit('close', 4404, 'not live');
    adapter.disconnect();

    await jest.advanceTimersByTimeAsync(30000);

    expect(reconnectSpy).not.toHaveBeenCalled();
  });
});
