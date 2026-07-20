const CoinBattleEngine = require('../engine/game-engine');

const createLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
});

const createIO = () => ({
  emit: jest.fn()
});

const createDatabase = (overrides = {}) => ({
  createMatch: jest.fn(() => 1),
  getMatchLeaderboard: jest.fn(() => []),
  getTeamScores: jest.fn(() => ({ red: 0, blue: 0 })),
  endMatch: jest.fn(),
  updatePlayerLifetimeStats: jest.fn(),
  checkAndAwardBadges: jest.fn(() => []),
  updateMatchStats: jest.fn(),
  cleanupEventCache: jest.fn(),
  isEventProcessed: jest.fn(() => false),
  markEventProcessed: jest.fn(),
  getOrCreatePlayer: jest.fn(() => ({ id: 1 })),
  addMatchParticipant: jest.fn(),
  recordGiftEvent: jest.fn(() => true),
  ...overrides
});

describe('CoinBattleEngine lifecycle regressions', () => {
  let engines;

  beforeEach(() => {
    engines = [];
  });

  afterEach(() => {
    engines.forEach(engine => engine.destroy());
    jest.useRealTimers();
  });

  const makeEngine = db => {
    const engine = new CoinBattleEngine(db, createIO(), createLogger());
    engines.push(engine);
    return engine;
  };

  test('represents a tied team match as a draw instead of awarding blue', () => {
    const db = createDatabase({
      getMatchLeaderboard: jest.fn(() => [
        { user_id: 'red-user', player_id: 1, team: 'red', coins: 10, gifts: 1 }
      ]),
      getTeamScores: jest.fn(() => ({ red: 10, blue: 10 }))
    });
    const engine = makeEngine(db);

    engine.startMatch('team', 60);
    engine.endMatch();

    const ended = engine.io.emit.mock.calls.find(([event]) => event === 'coinbattle:match-ended');
    expect(ended[1].winner).toMatchObject({
      winner_team: null,
      is_draw: true
    });
    expect(ended[1].winnersWithXP).toEqual([]);

  });

  test('auto-reset preserves the mode and duration of the ended match', () => {
    jest.useFakeTimers();
    const db = createDatabase();
    const engine = makeEngine(db);
    engine.config.autoReset = true;
    engine.config.postMatch = {
      showLeaderboard: false,
      showWinnerCredits: false
    };
    const startMatch = jest.spyOn(engine, 'startMatch');

    engine.startMatch('team', 42);
    engine.endMatch();
    jest.advanceTimersByTime(2000);

    expect(startMatch).toHaveBeenLastCalledWith('team', 42);
  });

  test('allows a failed gift write to be retried with the same event id', () => {
    let firstAttempt = true;
    const processed = new Set();
    const db = createDatabase({
      isEventProcessed: jest.fn((eventId) => processed.has(eventId)),
      markEventProcessed: jest.fn((eventId) => processed.add(eventId)),
      getOrCreatePlayer: jest.fn(() => {
        if (firstAttempt) {
          firstAttempt = false;
          throw new Error('temporary database failure');
        }
        return { id: 1 };
      })
    });
    const engine = makeEngine(db);
    engine.currentMatch = { id: 1, mode: 'solo' };

    expect(() => engine.processGift(
      { giftId: 1, giftName: 'Rose', coins: 1 },
      { userId: 'user-1', nickname: 'User 1' },
      'stable-event-1'
    )).toThrow('temporary database failure');

    const retry = engine.processGift(
      { giftId: 1, giftName: 'Rose', coins: 1 },
      { userId: 'user-1', nickname: 'User 1' },
      'stable-event-1'
    );

    expect(retry.duplicate).toBe(false);
    expect(db.recordGiftEvent).toHaveBeenCalledTimes(1);
  });

  test('does not attach offline simulation to an active match', () => {
    const engine = makeEngine(createDatabase());
    engine.currentMatch = { id: 1, mode: 'solo' };

    expect(() => engine.startSimulation()).toThrow('Cannot start offline simulation while a match is active');
  });
});
