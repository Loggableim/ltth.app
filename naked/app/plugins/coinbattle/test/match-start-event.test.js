/**
 * Test for CoinBattle match start event emission
 * Verifies that the coinbattle:match-started event is properly emitted
 */

const CoinBattleEngine = require('../engine/game-engine');
const CoinBattleDatabase = require('../backend/database');

describe('CoinBattle Match Start Event', () => {
  let engine;
  let mockDb;
  let mockIo;
  let emittedEvents;

  beforeEach(() => {
    emittedEvents = [];

    // Mock database
    mockDb = {
      createMatch: jest.fn(() => 1),
      getMatchLeaderboard: jest.fn(() => []),
      getTeamScores: jest.fn(() => ({ red: 0, blue: 0 })),
      cleanupEventCache: jest.fn()
    };

    // Mock Socket.IO
    mockIo = {
      emit: jest.fn((event, data) => {
        emittedEvents.push({ event, data });
      })
    };

    // Mock logger
    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    // Create engine instance
    engine = new CoinBattleEngine(mockDb, mockIo, mockLogger);
  });

  afterEach(() => {
    if (engine) {
      engine.destroy();
    }
  });

  test('should emit coinbattle:match-started event when match starts', () => {
    // Start a match
    const match = engine.startMatch('solo', 300);

    // Verify match was created
    expect(match).toBeDefined();
    expect(match.id).toBe(1);
    expect(match.mode).toBe('solo');
    expect(match.duration).toBe(300);

    // Check that coinbattle:match-started event was emitted
    const matchStartedEvent = emittedEvents.find(e => e.event === 'coinbattle:match-started');
    expect(matchStartedEvent).toBeDefined();
    expect(matchStartedEvent.data).toMatchObject({
      matchId: 1,
      mode: 'solo',
      duration: 300
    });
    expect(matchStartedEvent.data.matchUuid).toBeDefined();
  });

  test('should emit coinbattle:match-state event when match starts', () => {
    // Start a match
    engine.startMatch('team', 600);

    // Check that coinbattle:match-state event was also emitted
    const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
    expect(matchStateEvent).toBeDefined();
    expect(matchStateEvent.data.active).toBe(true);
    expect(matchStateEvent.data.match.mode).toBe('team');
  });

  test('should emit both events in correct order', () => {
    // Start a match
    engine.startMatch('solo', 300);

    // Find the indices of both events
    const stateIndex = emittedEvents.findIndex(e => e.event === 'coinbattle:match-state');
    const startedIndex = emittedEvents.findIndex(e => e.event === 'coinbattle:match-started');

    // Both should exist
    expect(stateIndex).toBeGreaterThanOrEqual(0);
    expect(startedIndex).toBeGreaterThanOrEqual(0);

    // match-state should come before match-started (or at the same time)
    expect(stateIndex).toBeLessThanOrEqual(startedIndex);
  });

  test('should include all required data in match-started event', () => {
    // Start a match
    const match = engine.startMatch('team', 180);

    // Get the match-started event
    const matchStartedEvent = emittedEvents.find(e => e.event === 'coinbattle:match-started');

    // Verify all required fields are present
    expect(matchStartedEvent.data).toHaveProperty('matchId');
    expect(matchStartedEvent.data).toHaveProperty('matchUuid');
    expect(matchStartedEvent.data).toHaveProperty('mode');
    expect(matchStartedEvent.data).toHaveProperty('duration');

    // Verify the values match the started match
    expect(matchStartedEvent.data.matchId).toBe(match.id);
    expect(matchStartedEvent.data.matchUuid).toBe(match.uuid);
    expect(matchStartedEvent.data.mode).toBe('team');
    expect(matchStartedEvent.data.duration).toBe(180);
  });
});
