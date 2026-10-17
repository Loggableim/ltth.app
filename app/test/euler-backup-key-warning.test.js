const EventEmitter = require('events');

const FALLBACK_KEY = 'a'.repeat(64);
const USER_KEY = 'b'.repeat(64);
const CANARY_KEY = 'SYNTHETIC-CANARY-EULER-KEY-DO-NOT-LOG-9F3A7C21';

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
    SchemaVersion = {},
    axios = { get: jest.fn().mockResolvedValue({ status: 200 }) }
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
  jest.doMock('axios', () => axios);

  return require('../modules/adapters/EulerstreamAdapter');
}

function expectKeyMaterialAbsent(value, key) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (const fragment of [key, key.slice(0, 8), key.slice(-4)]) {
    expect(serialized).not.toContain(fragment);
  }
}

function expectNoCanary(value) {
  expectKeyMaterialAbsent(value, CANARY_KEY);
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
    jest.dontMock('axios');
    process.env = originalEnv;
  });

  test('reports missing configuration without opening a socket when no explicit key exists', async () => {
    delete process.env.EULER_FALLBACK_API_KEY;
    const createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket');
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({ createWebSocketUrl });
    adapter = new EulerstreamAdapter(
      { emit: jest.fn() },
      createMockDb(),
      createMockLogger()
    );

    await expect(adapter.connect('testuser')).rejects.toThrow('No API key configured.');
    expect(createWebSocketUrl).not.toHaveBeenCalled();
    expect(adapter.getEulerApiKeyInfo()).toEqual(expect.objectContaining({
      configured: false,
      usingFallback: false
    }));
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

  test('uses an explicitly configured synthetic fallback only after consent', async () => {
    process.env.EULER_FALLBACK_API_KEY = FALLBACK_KEY;
    jest.resetModules();
    const createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket');
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({ createWebSocketUrl });
    const io = { emit: jest.fn() };
    const logger = createMockLogger();

    adapter = new EulerstreamAdapter(io, createMockDb(), logger);
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser', { fallbackKeyConfirmed: true });
    await finishConnect(adapter, connectPromise);

    expect(createWebSocketUrl).toHaveBeenCalledWith(expect.objectContaining({
      uniqueId: 'testuser',
      apiKey: FALLBACK_KEY
    }));
    expect(io.emit).not.toHaveBeenCalledWith('fallback-key-warning', expect.any(Object));
    const diagnostics = await adapter.runDiagnostics('testuser');
    const health = await adapter.getConnectionHealth();
    const logCalls = Object.values(logger).flatMap(method => method.mock.calls);
    expect(diagnostics.eulerApiKey).toEqual({
      activeKey: null,
      activeSource: 'Fallback Key',
      configured: true,
      usingFallback: true
    });
    expect(logCalls.flat().join(' ')).toContain('Eulerstream fallback key selected: true');
    expectKeyMaterialAbsent({ diagnostics, health, logCalls }, FALLBACK_KEY);
  });

  test('manual disconnect expires fallback consent and blocks reconnect without fresh confirmation', async () => {
    const createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket');
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({ createWebSocketUrl });
    adapter = new EulerstreamAdapter({ emit: jest.fn() }, createMockDb(), createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser', { fallbackKeyConfirmed: true });
    await finishConnect(adapter, connectPromise);
    expect(adapter._fallbackKeySessionConfirmed).toBe(true);

    adapter.disconnect();

    expect(adapter._fallbackKeySessionConfirmed).toBe(false);
    expect(adapter._resumeConfirmedSession).toBe(false);
    await expect(adapter.connect('testuser', { resumeConfirmedSession: true })).rejects.toMatchObject({
      connectionStatus: 'fallback_confirmation_required'
    });
    await expect(adapter.connect('testuser')).rejects.toMatchObject({
      connectionStatus: 'fallback_confirmation_required'
    });
    expect(createWebSocketUrl).toHaveBeenCalledTimes(1);
  });

  test('confirmed fallback session cannot resume for a different username', async () => {
    const createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket');
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({ createWebSocketUrl });
    adapter = new EulerstreamAdapter({ emit: jest.fn() }, createMockDb(), createMockLogger());
    adapter.fetchRoomInfo = jest.fn(async () => null);
    adapter.updateGiftCatalog = jest.fn(async () => ({ message: 'skipped' }));

    const connectPromise = adapter.connect('testuser', { fallbackKeyConfirmed: true });
    await finishConnect(adapter, connectPromise);

    await expect(adapter.connect('anotheruser', { resumeConfirmedSession: true })).rejects.toMatchObject({
      connectionStatus: 'fallback_confirmation_required'
    });
    expect(createWebSocketUrl).toHaveBeenCalledTimes(1);
  });

  test('key errors, logs, and connection diagnostics never expose key material', async () => {
    process.env.EULER_API_KEY = CANARY_KEY;
    const createWebSocketUrl = jest.fn(() => 'ws://eulerstream.test/socket');
    const axios = { get: jest.fn().mockRejectedValue(new Error(`diagnostic transport failed for ${CANARY_KEY}`)) };
    const logger = createMockLogger();
    const db = createMockDb();
    db.getSetting.mockImplementation(key => {
      if (key === 'tiktok_connect_with_unique_id') return null;
      throw new Error(`synthetic database failure ${CANARY_KEY}`);
    });
    db.getAllSettings.mockImplementation(() => {
      throw new Error(`synthetic settings failure ${CANARY_KEY}`);
    });
    const EulerstreamAdapter = loadAdapterWithMockedNetwork({ createWebSocketUrl, axios });
    adapter = new EulerstreamAdapter({ emit: jest.fn() }, db, logger);
    adapter.on('error', () => {});

    const connectPromise = adapter.connect('testuser');
    adapter.ws.emit('error', new Error(`WebSocket handshake failed for ${CANARY_KEY}`));
    const connectError = await connectPromise.catch(error => error);
    const disconnected = [];
    adapter._connectedEventEmitted = true;
    adapter.on('disconnected', event => disconnected.push(event));
    adapter._handleSocketClose(adapter._activeGeneration, 4000, CANARY_KEY);
    adapter._logConnectionAttempt('testuser', false, 'WEBSOCKET_ERROR', `failed with ${CANARY_KEY}`);
    const analysis = adapter.analyzeConnectionError(new Error(`Unexpected transport failure ${CANARY_KEY}`));
    const keyErrorAnalysis = adapter.analyzeConnectionError(new Error(`401 Sign Error: API Key is invalid ${CANARY_KEY}`));
    const keyInfo = adapter.getEulerApiKeyInfo();
    const health = await adapter.getConnectionHealth();
    const diagnostics = await adapter.runDiagnostics('testuser');
    const logCalls = Object.values(logger).flatMap(method => method.mock.calls);

    expect(connectError).toBeInstanceOf(Error);
    expect(connectError.message).toBe('Eulerstream WebSocket connection failed.');
    expect(keyInfo).toEqual({
      activeKey: null,
      activeSource: 'Environment Variable (EULER_API_KEY)',
      configured: true,
      usingFallback: false
    });
    expect(diagnostics.eulerApiKey.activeKey).toBeNull();
    expect(adapter.connectionAttempts[0]).not.toHaveProperty('errorMessage');
    expectNoCanary({ connectError: connectError.message, analysis, keyErrorAnalysis, keyInfo, health, diagnostics, logCalls, disconnected });
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

describe('manual Euler key diagnostic redaction', () => {
  test('logs backup-key status only and keeps backup and fallback names distinct', () => {
    const fs = require('fs');
    const path = require('path');
    const manualSource = fs.readFileSync(path.join(__dirname, 'euler-backup-key-warning.manual.js'), 'utf8');
    const adapterSource = fs.readFileSync(path.join(__dirname, '../modules/adapters/EulerstreamAdapter.js'), 'utf8');
    const keyLogLines = manualSource.split(/\r?\n/).filter(line =>
      /\bconsole\.(?:log|info|warn|error)\s*\(/.test(line) && /\b(?:backupKey|fallbackKey)\b/i.test(line)
    );

    expect(keyLogLines).toEqual([]);
    expect(manualSource).not.toMatch(/\b(?:backupKey|fallbackKey)\.(?:substring|slice)\s*\(/i);
    expect(manualSource).toContain('Backup key configured: ${configured}');
    expect(manualSource).toContain('process.env.EULER_BACKUP_API_KEY');
    expect(manualSource).toContain('process.env.EULER_FALLBACK_API_KEY');
    expect(adapterSource).toContain('process.env.EULER_FALLBACK_API_KEY');
    expect(adapterSource).not.toContain('EULER_BACKUP_API_KEY');
  });
});
