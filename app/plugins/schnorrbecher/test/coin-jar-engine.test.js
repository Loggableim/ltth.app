const CoinJarEngine = require('../lib/coin-jar-engine');

function createEngine(overrides = {}, initialState = {}) {
  const state = {
    sessionId: null,
    totalCoinValue: 0,
    visualCoinCount: 0,
    lastProcessedEventIds: [],
    updatedAt: 0,
    ...initialState
  };
  const timers = [];
  const emitted = [];
  const logs = [];
  const store = {
    loadState: () => ({ ...state, lastProcessedEventIds: [...state.lastProcessedEventIds] }),
    saveState: next => {
      Object.assign(state, next, {
        lastProcessedEventIds: [...(next.lastProcessedEventIds || [])]
      });
      return { ...state };
    },
    clearState: () => {
      Object.assign(state, {
        sessionId: null,
        totalCoinValue: 0,
        visualCoinCount: 0,
        lastProcessedEventIds: [],
        updatedAt: 0
      });
      return { ...state };
    }
  };
  const engine = new CoinJarEngine({
    store,
    getConfig: () => ({
      enabled: true,
      persistenceMode: 'persistent',
      resetOnNewStream: true
    }),
    emit: (event, payload) => emitted.push({ event, payload }),
    log: (message, level) => logs.push({ message, level }),
    now: () => 1000,
    setTimeoutFn: callback => {
      timers.push(callback);
      return timers.length - 1;
    },
    clearTimeoutFn: jest.fn(),
    ...overrides
  });
  return { engine, state, emitted, timers, logs };
}

describe('CoinJarEngine', () => {
  test.each([
    [1, 1],
    [100, 10],
    [1000, 32]
  ])('maps value %i to %i visual coins', (value, expected) => {
    expect(CoinJarEngine.calculateVisualCoins(value)).toBe(expected);
  });

  test('adds a completed gift exactly once and emits one spawn', () => {
    const { engine, state, emitted } = createEngine();
    const gift = {
      eventId: 'gift-1',
      senderId: '42',
      giftId: 'rose',
      diamondValue: 10,
      repeatCount: 2,
      repeatEnd: true
    };

    expect(engine.handleGift(gift)).toMatchObject({
      accepted: true,
      totalValue: 20,
      visualCoins: 2
    });
    expect(engine.handleGift(gift)).toMatchObject({
      accepted: false,
      reason: 'duplicate'
    });
    expect(state.totalCoinValue).toBe(20);
    expect(emitted.filter(item => item.event === 'coinJar.add')).toHaveLength(1);
  });

  test('renders each completed Rose repeat as an individual falling gift', () => {
    const { engine, state } = createEngine();

    expect(engine.handleGift({
      eventId: 'ten-roses',
      comboId: 'ten-roses',
      giftId: 'rose',
      giftName: 'Rose',
      diamondValue: 1,
      repeatCount: 10,
      repeatEnd: true
    })).toMatchObject({
      accepted: true,
      totalValue: 10,
      visualCoins: 10
    });
    expect(state.visualCoinCount).toBe(10);
  });

  test('keeps actual catalog gift art available for an overlay resync', () => {
    const { engine, state } = createEngine();

    engine.handleGift({
      eventId: 'gift-art',
      giftId: 'rose',
      giftName: 'Rose',
      giftImage: 'https://catalog.example/rose.png',
      diamondValue: 1,
      repeatCount: 1,
      repeatEnd: true
    });

    expect(state.recentGifts).toEqual([{
      giftId: 'rose',
      giftName: 'Rose',
      giftImage: 'https://catalog.example/rose.png'
    }]);
    expect(engine.syncPayload().recentGifts).toEqual(state.recentGifts);
  });

  test('keeps gift metadata without catalog art so an overlay resync can render a fallback coin', () => {
    const { engine, state } = createEngine();

    engine.handleGift({
      eventId: 'gift-without-art',
      giftId: 'unknown-gift',
      giftName: 'Unknown Gift',
      diamondValue: 1,
      repeatCount: 1,
      repeatEnd: true
    });

    expect(state.recentGifts).toEqual([{
      giftId: 'unknown-gift',
      giftName: 'Unknown Gift',
      giftImage: ''
    }]);
    expect(engine.syncPayload().recentGifts).toEqual(state.recentGifts);
  });

  test('defers a combo until its terminal event and uses its largest repeat count', () => {
    const { engine, state } = createEngine();
    expect(engine.handleGift({
      eventId: 'combo-1',
      senderId: '42',
      giftId: 'rose',
      diamondValue: 3,
      repeatCount: 2,
      repeatEnd: false
    })).toMatchObject({ accepted: true, pending: true });
    expect(engine.handleGift({
      eventId: 'combo-1',
      senderId: '42',
      giftId: 'rose',
      diamondValue: 3,
      repeatCount: 5,
      repeatEnd: true
    })).toMatchObject({ accepted: true, totalValue: 15 });
    expect(state.totalCoinValue).toBe(15);
  });

  test('finalizes a malformed combo once after inactivity', () => {
    const { engine, state, timers } = createEngine();
    engine.handleGift({
      eventId: 'combo-timeout',
      senderId: '42',
      giftId: 'rose',
      diamondValue: 2,
      repeatCount: 4,
      repeatEnd: false
    });

    timers[0]();
    timers[0]();

    expect(state.totalCoinValue).toBe(8);
    expect(engine.handleGift({
      eventId: 'combo-timeout',
      senderId: '42',
      giftId: 'rose',
      diamondValue: 2,
      repeatCount: 4,
      repeatEnd: true
    })).toMatchObject({ accepted: false, reason: 'duplicate' });
  });

  test('ignores invalid values and reset changes the spawn generation', () => {
    const { engine, state, emitted, logs } = createEngine();
    expect(engine.addValue(-1)).toMatchObject({
      accepted: false,
      reason: 'invalid-value'
    });
    expect(logs).toHaveLength(1);
    engine.addValue(200, { eventId: 'manual-1' });
    expect(engine.reset('admin')).toMatchObject({
      generation: 1,
      totalCoinValue: 0
    });
    expect(state.totalCoinValue).toBe(0);
    expect(emitted.at(-1)).toMatchObject({
      event: 'coinJar.reset',
      payload: { reason: 'admin', generation: 1 }
    });
  });

  test('resets a session only once for a confirmed new stream identity', () => {
    const { engine } = createEngine({
      getConfig: () => ({ persistenceMode: 'session', resetOnNewStream: true })
    });
    expect(engine.handleStreamSession({ streamIdentity: 'room:1', isNewStream: true })).toBe(true);
    expect(engine.handleStreamSession({ streamIdentity: 'room:1', isNewStream: true })).toBe(false);
    expect(engine.handleStreamSession({ streamIdentity: 'room:2', isNewStream: false }, { requireIsNewStream: true })).toBe(false);
  });

  test('keeps persistent state when a new stream starts', () => {
    const { engine, state } = createEngine();
    engine.addValue(200, { eventId: 'persistent-1' });
    expect(engine.handleStreamSession({ streamIdentity: 'room:persistent', isNewStream: true })).toBe(false);
    expect(state.totalCoinValue).toBe(200);
  });

  test('reports the current live connection without resetting persistent state', () => {
    const { engine, state } = createEngine();
    engine.addValue(200, { eventId: 'persistent-live-1' });

    expect(engine.handleStreamSession({ streamIdentity: 'room:persistent', isNewStream: true })).toBe(false);
    expect(engine.isLive()).toBe(true);
    expect(state.totalCoinValue).toBe(200);

    engine.handleStreamDisconnect();
    expect(engine.isLive()).toBe(false);
  });

  test('clears stale state when the session-mode plugin starts', () => {
    const { engine, state } = createEngine({
      getConfig: () => ({ persistenceMode: 'session', resetOnNewStream: true })
    }, {
      totalCoinValue: 500,
      visualCoinCount: 23,
      lastProcessedEventIds: ['old-session-event']
    });

    expect(engine.syncPayload()).toMatchObject({ totalCoinValue: 0, visualCoinCount: 0 });
    expect(state).toMatchObject({ totalCoinValue: 0, visualCoinCount: 0, lastProcessedEventIds: [] });
  });

  test('retains the real value of a huge gift while capping its visual coins', () => {
    const { engine, state } = createEngine();
    const result = engine.addValue(1000000000, { eventId: 'huge-1' });

    expect(result.visualCoins).toBe(100);
    expect(state.totalCoinValue).toBe(1000000000);
  });

  test('resets both an empty jar and a jar containing 200 coins', () => {
    const empty = createEngine();
    expect(empty.engine.reset('empty')).toMatchObject({ totalCoinValue: 0, visualCoinCount: 0 });

    const filled = createEngine();
    filled.engine.addValue(200, { eventId: 'two-hundred' });
    expect(filled.state.totalCoinValue).toBe(200);
    expect(filled.engine.reset('filled')).toMatchObject({ totalCoinValue: 0, visualCoinCount: 0 });
    expect(filled.state.totalCoinValue).toBe(0);
  });
});
