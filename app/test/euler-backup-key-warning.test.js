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

describe('Eulerstream backup key warning', () => {
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

  test('does not show backup warning when automatic fallback key matches backup key', async () => {
    const EulerstreamAdapter = loadAdapterWithMockedNetwork();
    const io = { emit: jest.fn() };

    adapter = new EulerstreamAdapter(io, createMockDb(), createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser');
    await finishConnect(adapter, connectPromise);

    expect(io.emit).toHaveBeenCalledWith('fallback-key-warning', {
      message: 'Fallback API Key wird verwendet',
      duration: 10000
    });
    expect(io.emit).not.toHaveBeenCalledWith('euler-backup-key-warning', expect.any(Object));
  });

  test('shows backup warning when a configured user key is the backup key', async () => {
    const EulerstreamAdapter = loadAdapterWithMockedNetwork();
    const io = { emit: jest.fn() };
    const db = createMockDb({ tiktok_euler_api_key: FALLBACK_KEY });

    adapter = new EulerstreamAdapter(io, db, createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser');
    await finishConnect(adapter, connectPromise);

    expect(io.emit).toHaveBeenCalledWith('euler-backup-key-warning', {
      message: 'Euler Backup Key wird verwendet',
      duration: 10000
    });
  });

  test('does not show backup warning for a configured non-backup user key', async () => {
    const EulerstreamAdapter = loadAdapterWithMockedNetwork();
    const io = { emit: jest.fn() };
    const db = createMockDb({ tiktok_euler_api_key: USER_KEY });

    adapter = new EulerstreamAdapter(io, db, createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser');
    await finishConnect(adapter, connectPromise);

    expect(io.emit).not.toHaveBeenCalledWith('euler-backup-key-warning', expect.any(Object));
    expect(io.emit).not.toHaveBeenCalledWith('fallback-key-warning', expect.any(Object));
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

  test('uses an euler API key as the built-in fallback when no key is configured', async () => {
    delete process.env.EULER_FALLBACK_API_KEY;
    const createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket');
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({ createWebSocketUrl });
    const io = { emit: jest.fn() };

    adapter = new EulerstreamAdapter(io, createMockDb(), createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser');
    await finishConnect(adapter, connectPromise);

    expect(createWebSocketUrl).toHaveBeenCalledWith(expect.objectContaining({
      uniqueId: 'testuser',
      apiKey: expect.stringMatching(/^euler_/)
    }));
    expect(io.emit).toHaveBeenCalledWith('fallback-key-warning', expect.any(Object));
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
