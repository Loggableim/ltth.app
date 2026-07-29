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
  adapter._startStreamWatchdog = jest.fn();
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

  test('keeps the first canonical session when one active connection reports a second room id without a new start', async () => {
    const { adapter, db } = createAdapter();
    const sessionStarted = jest.fn();
    adapter.on('streamSessionStarted', sessionStarted);

    const confirmCandidate = async (source, payload) => {
      const roomId = adapter._captureRoomIdFromPayload(payload, source);
      return adapter._confirmLive({
        generation: 1,
        roomId,
        source,
        payload
      });
    };

    const initial = await confirmCandidate('LiveIntro', { roomId: '111' });
    adapter.stats.likes = 34;
    const canonicalSessionId = adapter.streamSessionId;

    const refinement = await confirmCandidate('RoomMessage', { roomId: '222' });

    expect(initial).toMatchObject({ isNewStream: true, isReconnect: false });
    expect(refinement).toMatchObject({
      isNewStream: false,
      isReconnect: true,
      streamSessionId: canonicalSessionId
    });
    expect(adapter).toMatchObject({
      roomId: '111',
      confirmedRoomId: '111',
      streamIdentity: 'streamer:111',
      streamSessionId: canonicalSessionId
    });
    expect(adapter.stats.likes).toBe(34);
    expect(db.resetStreamStats).toHaveBeenCalledTimes(1);
    expect(sessionStarted).toHaveBeenCalledTimes(1);
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

  test('assigns a fresh session generation when a later LIVE reuses the same room', async () => {
    const { adapter } = createAdapter();
    const sessionStarted = jest.fn();
    adapter.on('streamSessionStarted', sessionStarted);

    await adapter._confirmLive({
      generation: 1,
      roomId: '111',
      source: 'roomInfo',
      payload: { roomId: '111', start_time: 1700000000 }
    });

    adapter._connectedEventEmitted = true;
    adapter._handleSocketClose(1, 4005, 'stream ended');
    adapter._connectedEventEmitted = false;

    await adapter._confirmLive({
      generation: 1,
      roomId: '111',
      source: 'roomInfo',
      payload: { roomId: '111', start_time: 1800000000 }
    });

    expect(sessionStarted.mock.calls.map(([payload]) => payload.streamSessionId)).toEqual([1, 2]);
    expect(adapter._buildConnectedPayload(true, false, false).streamSessionId).toBe(2);
  });

  test('treats a same-room LIVE with a different confirmed start time as a new session after restart', async () => {
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

    const next = await adapter._confirmLive({
      generation: 1,
      roomId: '111',
      source: 'roomInfo',
      payload: { roomId: '111', start_time: 1800000000 }
    });

    expect(next).toMatchObject({ isNewStream: true, isReconnect: false });
    expect(adapter.streamSessionId).toBe(1);
    expect(db.resetStreamStats).toHaveBeenCalledTimes(1);
  });

  test('watchdog ends a stale LIVE only after two consecutive confirmed TikTok offline checks', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00Z'));
    const { adapter } = createAdapter();
    const disconnected = jest.fn();
    adapter.on('disconnected', disconnected);
    adapter.isConnected = true;
    adapter.connectionState = 'live';
    adapter._connectionHadLive = true;
    adapter._connectedEventEmitted = true;
    adapter.confirmedRoomId = '111';
    adapter.streamIdentity = 'streamer:111';
    adapter.streamSessionId = 7;
    adapter._lastEulerstreamMessageAt = Date.now() - EulerstreamAdapter.STREAM_WATCHDOG_IDLE_MS;
    adapter._checkTikTokLivePage = jest.fn()
      .mockResolvedValueOnce({ status: 'offline' })
      .mockResolvedValueOnce({ status: 'offline' });

    await adapter._runStreamWatchdogCheck();
    expect(disconnected).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(EulerstreamAdapter.STREAM_WATCHDOG_INTERVAL_MS);
    await adapter._runStreamWatchdogCheck();

    expect(adapter.connectionState).toBe('stream_ended');
    expect(adapter.forceNewStreamOnNextConfirmation).toBe(true);
    expect(disconnected).toHaveBeenCalledWith(expect.objectContaining({
      code: 4005,
      wasLive: true,
      isTransient: false,
      source: 'tiktok-live-watchdog',
      streamSessionId: 7
    }));
  });

  test('watchdog never treats a challenge or an active Eulerstream frame as an offline result', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00Z'));
    const { adapter } = createAdapter();
    adapter.isConnected = true;
    adapter.connectionState = 'live';
    adapter._connectionHadLive = true;
    adapter._connectedEventEmitted = true;
    adapter._lastEulerstreamMessageAt = Date.now() - EulerstreamAdapter.STREAM_WATCHDOG_IDLE_MS;
    adapter._checkTikTokLivePage = jest.fn().mockResolvedValue({ status: 'unknown', reason: 'challenge' });

    await adapter._runStreamWatchdogCheck();
    expect(adapter._consecutiveWatchdogOfflineChecks).toBe(0);
    expect(adapter.connectionState).toBe('live');

    adapter._recordEulerstreamActivity();
    await jest.advanceTimersByTimeAsync(EulerstreamAdapter.STREAM_WATCHDOG_INTERVAL_MS);
    await adapter._runStreamWatchdogCheck();
    expect(adapter._checkTikTokLivePage).toHaveBeenCalledTimes(1);
    expect(adapter.connectionState).toBe('live');
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

  test('maps direct Eulerstream superFan events to the canonical superfan event', () => {
    const { adapter, logger } = createAdapter();
    adapter.eventEmitter = new EventEmitter();
    const superfan = jest.fn();
    const payload = {
      uniqueId: 's_c_o_r_p_i_o_n_pup',
      nickname: 'Scorpion'
    };
    adapter.eventEmitter.on('superfan', superfan);

    adapter._dispatchEulerstreamMessage({ type: 'superFan', data: payload });

    expect(superfan).toHaveBeenCalledWith(payload);
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Unknown event type: superFan')
    );
  });

  test('recognizes Eulerstream ttwid signing failures as eligible for the REST fallback', () => {
    const { adapter } = createAdapter();

    expect(adapter._isEulerstreamRestFallbackError({
      code: 1011,
      message: 'WS State Error - Fail /webcast/room_info: Failed to fetch ttwid for signing: status=2 code=503 message'
    })).toBe(true);

    expect(adapter._isEulerstreamRestFallbackError({
      code: 4401,
      message: 'Eulerstream authentication failed.'
    })).toBe(false);
  });
});
