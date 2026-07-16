const EventEmitter = require('events');
const EulerstreamAdapter = require('../modules/adapters/EulerstreamAdapter');

function createDb(savedStats = null) {
  return {
    loadStreamStats: jest.fn(() => savedStats),
    saveStreamStats: jest.fn(),
    resetStreamStats: jest.fn(),
    setSetting: jest.fn(),
    logEvent: jest.fn(),
    updateGiftCatalog: jest.fn(() => 0),
    getGiftCatalog: jest.fn(() => [])
  };
}

function createAdapter(savedStats = null) {
  const io = { emit: jest.fn() };
  const db = createDb(savedStats);
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  const adapter = new EulerstreamAdapter(io, db, logger);
  adapter._activeGeneration = 1;
  adapter._connectionGeneration = 1;
  adapter.currentUsername = 'streamer';
  adapter._startLiveTracking = jest.fn();
  adapter._schedulePostConnectTasks = jest.fn();
  return { adapter, db, io, logger };
}

describe('Eulerstream quota-safe connection state', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('transport open alone does not confirm LIVE or persist a username', async () => {
    const { adapter, db } = createAdapter();
    adapter.ws = new EventEmitter();
    adapter.eventEmitter = new EventEmitter();
    adapter._startHeartbeat = jest.fn();
    adapter._stopHeartbeat = jest.fn();
    const connected = jest.fn();
    adapter.on('connected', connected);

    await adapter._setupWebSocketHandlers(1);
    adapter.ws.emit('open');

    expect(connected).not.toHaveBeenCalled();
    expect(db.setSetting).not.toHaveBeenCalledWith('last_connected_username', expect.anything());
    expect(db.resetStreamStats).not.toHaveBeenCalled();
  });

  test.each([
    [4404, 'offline'],
    [4005, 'stream_ended'],
    [4401, 'auth_error'],
    [4400, 'configuration_error'],
    [1000, 'disconnected']
  ])('close code %s is terminal with state %s and no reconnect timer', (code, state) => {
    jest.useFakeTimers();
    const { adapter } = createAdapter();
    adapter._handleSocketClose(1, code, 'test');

    expect(adapter.connectionState).toBe(state);
    expect(adapter._autoReconnectTimer).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('4429 opens a 15 minute circuit without scheduling a reconnect', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-11T12:00:00Z'));
    const { adapter } = createAdapter();
    adapter._handleSocketClose(1, 4429, 'retry after 30 seconds');

    expect(adapter.connectionState).toBe('circuit_open');
    expect(adapter._autoReconnectTimer).toBeNull();
    expect(adapter._circuitOpenUntil).toBe(Date.now() + 15 * 60 * 1000);
    await expect(adapter.connect('streamer')).rejects.toMatchObject({
      connectionStatus: 'circuit_open',
      code: 4429
    });
  });

  test('transient reconnect uses the exact five delays and then stops', () => {
    jest.useFakeTimers();
    const { adapter, io } = createAdapter();
    const observedDelays = [];

    for (let index = 0; index < 5; index++) {
      adapter._scheduleBoundedReconnect('streamer', 1006);
      const retryStatus = io.emit.mock.calls.filter(call => call[0] === 'tiktok:status').at(-1)[1];
      observedDelays.push(retryStatus.delay);
      clearTimeout(adapter._autoReconnectTimer);
      adapter._autoReconnectTimer = null;
    }

    adapter._scheduleBoundedReconnect('streamer', 1006);
    expect(observedDelays).toEqual([5000, 15000, 30000, 60000, 120000]);
    expect(adapter.connectionState).toBe('circuit_open');
    expect(adapter._autoReconnectTimer).toBeNull();
  });

  test('same room resumes persisted stats while a different room resets once', async () => {
    const saved = {
      viewers: 12,
      likes: 34,
      totalCoins: 56,
      followers: 7,
      shares: 8,
      gifts: 9,
      username: 'streamer',
      roomId: '111',
      streamStartTime: 1700000000000
    };
    const { adapter, db } = createAdapter(saved);
    const sessionStarted = jest.fn();
    adapter.on('streamSessionStarted', sessionStarted);

    const resumed = await adapter._confirmLive({
      generation: 1,
      roomId: '111',
      source: 'roomInfo',
      payload: { roomId: '111', start_time: 1700000000 }
    });
    expect(resumed.isReconnect).toBe(true);
    expect(adapter.stats.likes).toBe(34);
    expect(db.resetStreamStats).not.toHaveBeenCalled();
    expect(sessionStarted).not.toHaveBeenCalled();

    adapter._connectedEventEmitted = false;
    const nextStream = await adapter._confirmLive({
      generation: 1,
      roomId: '222',
      source: 'roomInfo',
      payload: { roomId: '222', start_time: 1800000000 }
    });
    expect(nextStream.isNewStream).toBe(true);
    expect(db.resetStreamStats).toHaveBeenCalledTimes(1);
    expect(sessionStarted).toHaveBeenCalledTimes(1);
    expect(adapter.stats.likes).toBe(0);
  });

  test('same room after a terminal LIVE end starts a new session', async () => {
    const saved = {
      viewers: 12,
      likes: 34,
      totalCoins: 56,
      followers: 7,
      shares: 8,
      gifts: 9,
      username: 'streamer',
      roomId: '111',
      streamStartTime: 1700000000000
    };
    const { adapter, db } = createAdapter(saved);
    const sessionStarted = jest.fn();
    adapter.on('streamSessionStarted', sessionStarted);
    adapter._connectionHadLive = true;
    adapter._connectedEventEmitted = true;

    adapter._handleSocketClose(1, 4005, 'stream ended');
    adapter._connectedEventEmitted = false;
    const next = await adapter._confirmLive({
      generation: 1,
      roomId: '111',
      source: 'roomInfo',
      payload: { roomId: '111', start_time: 1800000000 }
    });

    expect(next).toMatchObject({ isNewStream: true, isReconnect: false });
    expect(db.resetStreamStats).toHaveBeenCalledTimes(1);
    expect(sessionStarted).toHaveBeenCalledTimes(1);
    expect(adapter.stats.likes).toBe(0);
  });

  test('events remain buffered until a room identity is confirmed', async () => {
    const { adapter } = createAdapter();
    adapter._startIdentityResolution = jest.fn();
    adapter._dispatchEulerstreamMessage = jest.fn();
    const message = { type: 'WebcastChatMessage', data: { comment: 'hello' } };

    const pending = await adapter._confirmLive({
      generation: 1,
      roomId: null,
      source: message.type,
      payload: message.data
    });
    expect(pending.identityPending).toBe(true);
    adapter._identityPendingBuffer.push(message);
    expect(adapter._dispatchEulerstreamMessage).not.toHaveBeenCalled();

    await adapter._confirmLive({
      generation: 1,
      roomId: '333',
      source: 'room-id-resolution',
      payload: {}
    });
    expect(adapter._dispatchEulerstreamMessage).toHaveBeenCalledWith(message);
  });
});
