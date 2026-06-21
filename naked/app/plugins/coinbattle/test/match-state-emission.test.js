/**
 * Test for CoinBattle match state emission
 * Verifies that match state is properly emitted for all match control operations
 */

const CoinBattleEngine = require('../engine/game-engine');
const CoinBattleDatabase = require('../backend/database');

describe('CoinBattle Match State Emission', () => {
  let engine;
  let mockDb;
  let mockIo;
  let emittedEvents;

  beforeEach(() => {
    emittedEvents = [];

    // Mock database
    mockDb = {
      createMatch: jest.fn(() => 1),
      endMatch: jest.fn(),
      updatePlayerLifetimeStats: jest.fn(),
      checkAndAwardBadges: jest.fn(() => []),
      updateMatchStats: jest.fn(),
      incrementAutoExtension: jest.fn(),
      getMatchLeaderboard: jest.fn(() => [
        { user_id: 'user1', player_id: 1, coins: 100, gifts: 10, team: 'red' }
      ]),
      getTeamScores: jest.fn(() => ({ red: 100, blue: 50 })),
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

  describe('endMatch', () => {
    test('should emit coinbattle:match-state after ending match', () => {
      // Start a match first
      engine.startMatch('solo', 300);
      emittedEvents = []; // Clear events from start

      // End the match
      engine.endMatch();

      // Check that coinbattle:match-state event was emitted
      const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
      expect(matchStateEvent).toBeDefined();
      expect(matchStateEvent.data.active).toBe(false);
      expect(matchStateEvent.data.match).toBeNull();
    });

    test('should emit both match-ended and match-state events', () => {
      // Start a match first
      engine.startMatch('team', 300);
      emittedEvents = [];

      // End the match
      engine.endMatch();

      // Check both events were emitted
      const matchEndedEvent = emittedEvents.find(e => e.event === 'coinbattle:match-ended');
      const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');

      expect(matchEndedEvent).toBeDefined();
      expect(matchStateEvent).toBeDefined();
    });

    test('should emit match-state after match-ended', () => {
      // Start a match first
      engine.startMatch('solo', 300);
      emittedEvents = [];

      // End the match
      engine.endMatch();

      // Find indices
      const endedIndex = emittedEvents.findIndex(e => e.event === 'coinbattle:match-ended');
      const stateIndex = emittedEvents.findIndex(e => e.event === 'coinbattle:match-state');

      // State should come after ended
      expect(stateIndex).toBeGreaterThan(endedIndex);
    });
  });

  describe('pauseMatch', () => {
    test('should emit coinbattle:match-state after pausing match', () => {
      // Start a match first
      engine.startMatch('solo', 300);
      emittedEvents = [];

      // Pause the match
      engine.pauseMatch();

      // Check that coinbattle:match-state event was emitted
      const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
      expect(matchStateEvent).toBeDefined();
      expect(matchStateEvent.data.active).toBe(true);
      expect(matchStateEvent.data.match.isPaused).toBe(true);
    });

    test('should emit both match-paused and match-state events', () => {
      // Start a match first
      engine.startMatch('team', 300);
      emittedEvents = [];

      // Pause the match
      engine.pauseMatch();

      // Check both events were emitted
      const matchPausedEvent = emittedEvents.find(e => e.event === 'coinbattle:match-paused');
      const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');

      expect(matchPausedEvent).toBeDefined();
      expect(matchStateEvent).toBeDefined();
    });
  });

  describe('resumeMatch', () => {
    test('should emit coinbattle:match-state after resuming match', () => {
      // Start and pause a match first
      engine.startMatch('solo', 300);
      engine.pauseMatch();
      emittedEvents = [];

      // Resume the match
      engine.resumeMatch();

      // Check that coinbattle:match-state event was emitted
      const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
      expect(matchStateEvent).toBeDefined();
      expect(matchStateEvent.data.active).toBe(true);
      expect(matchStateEvent.data.match.isPaused).toBe(false);
    });

    test('should emit both match-resumed and match-state events', () => {
      // Start and pause a match first
      engine.startMatch('team', 300);
      engine.pauseMatch();
      emittedEvents = [];

      // Resume the match
      engine.resumeMatch();

      // Check both events were emitted
      const matchResumedEvent = emittedEvents.find(e => e.event === 'coinbattle:match-resumed');
      const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');

      expect(matchResumedEvent).toBeDefined();
      expect(matchStateEvent).toBeDefined();
    });
  });

  describe('extendMatch', () => {
    test('should emit coinbattle:match-state after extending match', () => {
      // Start a match first
      engine.startMatch('solo', 300);
      emittedEvents = [];

      // Extend the match
      engine.extendMatch(60);

      // Check that coinbattle:match-state event was emitted
      const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
      expect(matchStateEvent).toBeDefined();
      expect(matchStateEvent.data.active).toBe(true);
      expect(matchStateEvent.data.match).toBeDefined();
    });

    test('should emit both match-extended and match-state events', () => {
      // Start a match first
      engine.startMatch('team', 300);
      emittedEvents = [];

      // Extend the match
      engine.extendMatch(90);

      // Check both events were emitted
      const matchExtendedEvent = emittedEvents.find(e => e.event === 'coinbattle:match-extended');
      const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');

      expect(matchExtendedEvent).toBeDefined();
      expect(matchStateEvent).toBeDefined();
    });
  });

  describe('State consistency', () => {
    test('should always emit current state after any operation', () => {
      // Start match - should emit active state
      engine.startMatch('solo', 300);
      let stateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
      expect(stateEvent.data.active).toBe(true);

      // Pause match - should emit paused state
      emittedEvents = [];
      engine.pauseMatch();
      stateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
      expect(stateEvent.data.match.isPaused).toBe(true);

      // Resume match - should emit resumed state
      emittedEvents = [];
      engine.resumeMatch();
      stateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
      expect(stateEvent.data.match.isPaused).toBe(false);

      // End match - should emit inactive state
      emittedEvents = [];
      engine.endMatch();
      stateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
      expect(stateEvent.data.active).toBe(false);
    });
  });

  describe('startSimulation', () => {
    test('should emit coinbattle:match-state with enableOfflineSimulation=true', () => {
      // Start simulation
      engine.startSimulation();

      // Check that coinbattle:match-state event was emitted
      const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
      expect(matchStateEvent).toBeDefined();
      expect(matchStateEvent.data.config.enableOfflineSimulation).toBe(true);
    });

    test('should start a match if no match is active', () => {
      // Start simulation without a match
      engine.startSimulation();

      // Check that a match was started
      const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
      expect(matchStateEvent.data.active).toBe(true);
      expect(mockDb.createMatch).toHaveBeenCalled();
    });
  });

  describe('stopSimulation', () => {
    test('should emit coinbattle:match-state with enableOfflineSimulation=false', () => {
      // Start simulation first
      engine.startSimulation();
      emittedEvents = [];

      // Stop simulation
      engine.stopSimulation();

      // Check that coinbattle:match-state event was emitted
      const matchStateEvent = emittedEvents.find(e => e.event === 'coinbattle:match-state');
      expect(matchStateEvent).toBeDefined();
      expect(matchStateEvent.data.config.enableOfflineSimulation).toBe(false);
    });

    test('should clear simulation interval', () => {
      // Start simulation
      engine.startSimulation();
      expect(engine.simulationInterval).toBeDefined();

      // Stop simulation
      engine.stopSimulation();
      expect(engine.simulationInterval).toBeNull();
    });
  });
});
