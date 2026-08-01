const Database = require('better-sqlite3');
const GameEngineDatabase = require('../backend/database');
const InteractiveController = require('../backend/interactive-controller');
const Connect4Game = require('../games/connect4');
const ChessGame = require('../games/chess');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

function createDatabase(sqlite = new Database(':memory:')) {
  const database = new GameEngineDatabase({
    getDatabase: () => ({ db: sqlite }),
    log: jest.fn()
  }, logger);
  database.initialize();
  return { database, sqlite };
}

function createHarness(options = {}) {
  const dbContext = options.dbContext || createDatabase();
  let nextSessionId = options.nextSessionId || 1;
  const io = { emit: jest.fn() };
  const finishGame = jest.fn();
  const emitLegacyEvent = jest.fn();
  const discardRestoredGame = jest.fn();
  const settings = {
    connect4ViewerTimeoutEnabled: false,
    connect4ViewerResponseSeconds: 30,
    connect4ViewerWarningSeconds: 10,
    chessViewerResponseSeconds: 60,
    maxConcurrentInteractiveSessions: 20,
    interactiveResultDisplaySeconds: 3,
    ...options.settings
  };

  function buildGame({ sessionId, gameType, viewerId, viewerDisplayName, participants, config, timeControl }) {
    if (gameType === 'connect4') {
      if (Array.isArray(participants) && participants.length === 2) {
        return new Connect4Game(
          sessionId,
          { username: participants[0].id, role: 'viewer', nickname: participants[0].displayName },
          { username: participants[1].id, role: 'viewer', nickname: participants[1].displayName },
          logger
        );
      }
      const hostFirst = config.streamerRole === 'player1';
      return new Connect4Game(
        sessionId,
        hostFirst
          ? { username: 'streamer', role: 'streamer', nickname: 'Host' }
          : { username: viewerId, role: 'viewer', nickname: viewerDisplayName },
        hostFirst
          ? { username: viewerId, role: 'viewer', nickname: viewerDisplayName }
          : { username: 'streamer', role: 'streamer', nickname: 'Host' },
        logger
      );
    }
    const hostSide = config.streamerRole === 'black' ? 'black' : 'white';
    return new ChessGame(
      sessionId,
      hostSide === 'white'
        ? { username: 'streamer', role: 'streamer', nickname: 'Host', side: 'white' }
        : { username: viewerId, role: 'viewer', nickname: viewerDisplayName, side: 'white' },
      hostSide === 'black'
        ? { username: 'streamer', role: 'streamer', nickname: 'Host', side: 'black' }
        : { username: viewerId, role: 'viewer', nickname: viewerDisplayName, side: 'black' },
      timeControl || '5+0',
      logger
    );
  }

  const createGame = jest.fn(input => {
    const sessionId = nextSessionId++;
    return {
      sessionId,
      game: buildGame({ ...input, sessionId }),
      timeControl: input.timeControl || '5+0'
    };
  });
  const restoreGame = jest.fn(row => ({
    sessionId: row.sessionId,
    game: row.gameType === 'connect4'
      ? new Connect4Game(row.sessionId, row.state.player1, row.state.player2, logger)
      : new ChessGame(
        row.sessionId,
        row.state.whitePlayer,
        row.state.blackPlayer,
        row.timeControl || '5+0',
        logger
      ),
    timeControl: row.timeControl
  }));

  const controller = new InteractiveController({
    database: dbContext.database,
    io,
    logger,
    createGame,
    restoreGame,
    discardRestoredGame,
    finishGame,
    emitLegacyEvent,
    resolveHostName: () => 'RealHost',
    getConfig: gameType => gameType === 'connect4'
      ? {
        streamerRole: options.connect4HostStarts === false ? 'player2' : 'player1',
        animationSpeed: 500,
        leaderboardEnabled: true,
        leaderboardTypes: ['daily', 'elo'],
        leaderboardDisplayTime: 3,
        roundTimerEnabled: settings.connect4ViewerTimeoutEnabled,
        roundTimeLimit: settings.connect4ViewerResponseSeconds,
        roundWarningTime: settings.connect4ViewerWarningSeconds
      }
      : {
        streamerRole: options.chessHostStarts === false ? 'black' : 'white',
        animationSpeed: 300,
        leaderboardEnabled: true,
        leaderboardTypes: ['daily', 'elo'],
        leaderboardDisplayTime: 3,
        ...options.chessConfig
      },
    autoplayService: options.autoplayService,
    getSettings: () => settings,
    now: () => Date.now()
  });

  return {
    controller,
    database: dbContext.database,
    sqlite: dbContext.sqlite,
    dbContext,
    io,
    finishGame,
    emitLegacyEvent,
    createGame,
    restoreGame,
    discardRestoredGame,
    settings
  };
}

describe('InteractiveController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1000000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('runs three simultaneous mixed games in one host-turn FIFO', () => {
    const harness = createHarness();
    harness.controller.init();

    const first = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'a', viewerDisplayName: 'A' });
    const second = harness.controller.startMatch({ gameType: 'chess', viewerId: 'b', viewerDisplayName: 'B' });
    const third = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'c', viewerDisplayName: 'C' });

    expect([first.success, second.success, third.success]).toEqual([true, true, true]);
    expect(harness.controller.getState().hostQueue.map(row => [row.sessionId, row.gameType])).toEqual([
      [first.sessionId, 'connect4'],
      [second.sessionId, 'chess'],
      [third.sessionId, 'connect4']
    ]);
    expect(harness.controller.getState().activeSessions).toHaveLength(3);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: first.sessionId,
      hostDisplayName: 'RealHost',
      viewerDisplayName: 'A'
    });

    expect(harness.controller.applyHostMove({
      sessionId: first.sessionId,
      gameType: 'connect4',
      sessionRevision: 1,
      displayRevision: harness.controller.getState().display.displayRevision,
      move: { column: 'D' }
    })).toMatchObject({ success: true });
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: first.sessionId,
      phase: 'animating'
    });
    jest.advanceTimersByTime(500);
    expect(harness.controller.getState().display.displaySessionId).toBe(second.sessionId);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('queues viewer and host turns together before selecting the first round-robin board', () => {
    const harness = createHarness({ connect4HostStarts: false });
    harness.controller.init();

    const first = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'anna', viewerDisplayName: 'Anna' });
    const second = harness.controller.startMatch({ gameType: 'chess', viewerId: 'ben', viewerDisplayName: 'Ben' });
    const third = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'carla', viewerDisplayName: 'Carla' });
    const fourth = harness.controller.startMatch({ gameType: 'chess', viewerId: 'david', viewerDisplayName: 'David' });
    const fifth = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'elif', viewerDisplayName: 'Elif' });

    expect(harness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual([
      first.sessionId,
      second.sessionId,
      third.sessionId,
      fourth.sessionId,
      fifth.sessionId
    ]);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: first.sessionId,
      gameType: 'connect4',
      currentTurnRole: 'viewer'
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('rejects a viewer move while another session owns the displayed round-robin turn', () => {
    const harness = createHarness({ connect4HostStarts: false });
    harness.controller.init();
    const visible = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'visible', viewerDisplayName: 'Visible' });
    const hidden = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'hidden', viewerDisplayName: 'Hidden' });
    const before = harness.controller.getState();

    expect(harness.controller.applyViewerMove({
      viewerId: 'hidden',
      gameType: 'connect4',
      move: { column: 'A' }
    })).toEqual({ success: false, error: 'not_queue_head' });
    expect(harness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual(
      before.hostQueue.map(row => row.sessionId)
    );
    expect(harness.controller.getState().display.displaySessionId).toBe(visible.sessionId);
    expect(harness.controller.registry.get(hidden.sessionId).sessionRevision).toBe(1);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('rotates a non-terminal host turn to the tail after its move animation', () => {
    const harness = createHarness();
    harness.controller.init();
    const first = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'first', viewerDisplayName: 'First' });
    const second = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'second', viewerDisplayName: 'Second' });
    const display = harness.controller.getState().display;

    expect(harness.controller.applyHostMove({
      sessionId: first.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { column: 'D' }
    })).toMatchObject({ success: true });
    expect(harness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual([
      second.sessionId,
      first.sessionId
    ]);

    jest.advanceTimersByTime(500);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: second.sessionId,
      currentTurnRole: 'host'
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('rejects out-of-order and stale host controls without changing queue order', () => {
    const harness = createHarness();
    harness.controller.init();
    const first = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'a', viewerDisplayName: 'A' });
    const second = harness.controller.startMatch({ gameType: 'chess', viewerId: 'b', viewerDisplayName: 'B' });
    const display = harness.controller.getState().display;

    expect(harness.controller.applyHostMove({
      sessionId: second.sessionId,
      gameType: 'chess',
      sessionRevision: 1,
      displayRevision: display.displayRevision,
      move: { move: 'e4' }
    })).toMatchObject({ success: false, error: 'not_queue_head' });
    expect(harness.controller.applyHostMove({
      sessionId: first.sessionId,
      gameType: 'connect4',
      sessionRevision: 0,
      displayRevision: display.displayRevision,
      move: { column: 'D' }
    })).toMatchObject({ success: false, error: 'stale_session_revision' });
    expect(harness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual([
      first.sessionId,
      second.sessionId
    ]);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('persists only visible elapsed chess host time when the host moves', () => {
    const harness = createHarness();
    harness.controller.init();
    const chess = harness.controller.startMatch({
      gameType: 'chess',
      viewerId: 'chess-viewer',
      viewerDisplayName: 'Chess Viewer',
      timeControl: '5+0'
    });
    jest.advanceTimersByTime(2000);
    const display = harness.controller.getState().display;

    expect(harness.controller.applyHostMove({
      sessionId: chess.sessionId,
      gameType: 'chess',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { move: 'e4' }
    })).toMatchObject({ success: true });

    expect(harness.database.getInteractiveState(chess.sessionId)).toMatchObject({
      hostTimeRemainingMs: 298000,
      state: {
        timers: { white: 298000, black: 300000 }
      }
    });
    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('rejects a chess host move when the visible clock already reached zero', () => {
    const harness = createHarness();
    harness.controller.init();
    const chess = harness.controller.startMatch({
      gameType: 'chess',
      viewerId: 'flagged-host-viewer',
      viewerDisplayName: 'Flagged Host Viewer',
      timeControl: '0.1+0'
    });
    const display = harness.controller.getState().display;
    harness.controller.timers.hostTimers.get(chess.sessionId).startedAt -= 6001;

    expect(harness.controller.applyHostMove({
      sessionId: chess.sessionId,
      gameType: 'chess',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { move: 'e4' }
    })).toMatchObject({ success: false, error: 'host_timeout' });
    expect(harness.controller.getState().activeSessions).toEqual([]);
    expect(harness.finishGame).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: chess.sessionId,
      reason: 'host_timeout',
      winnerRole: 'viewer'
    }));

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('uses the response deadline instead of the viewer total chess clock', () => {
    const harness = createHarness({
      settings: { chessViewerResponseSeconds: 60 }
    });
    harness.controller.init();
    const chess = harness.controller.startMatch({
      gameType: 'chess',
      viewerId: 'patient-viewer',
      viewerDisplayName: 'Patient Viewer',
      timeControl: '0.1+0'
    });
    let display = harness.controller.getState().display;
    expect(harness.controller.applyHostMove({
      sessionId: chess.sessionId,
      gameType: 'chess',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { move: 'e4' }
    })).toMatchObject({ success: true });

    jest.advanceTimersByTime(7000);
    expect(harness.controller.applyViewerMove({
      viewerId: 'patient-viewer',
      gameType: 'chess',
      move: { move: 'e5' },
      moveIdentity: 'chat-patient-1'
    })).toMatchObject({ success: true });

    const active = harness.controller.getState().activeSessions[0];
    expect(active).toMatchObject({ status: 'active', turnRole: 'host', moveCount: 2 });
    expect(active.state.timers.black).toBe(6000);
    expect(active.state.winner).toBeNull();

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('routes viewer chat moves only to the stable viewer session', () => {
    const harness = createHarness({ connect4HostStarts: false });
    harness.controller.init();
    const first = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'viewer-a', viewerDisplayName: 'A' });
    const second = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'viewer-b', viewerDisplayName: 'B' });

    expect(harness.controller.applyViewerMove({
      viewerId: 'viewer-a',
      gameType: 'connect4',
      move: { column: 'A' },
      moveIdentity: 'chat-a-1'
    })).toMatchObject({ success: true, sessionId: first.sessionId });
    expect(harness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual([
      second.sessionId,
      first.sessionId
    ]);

    const duplicate = harness.controller.applyViewerMove({
      viewerId: 'viewer-a',
      gameType: 'connect4',
      move: { column: 'A' },
      moveIdentity: 'chat-a-1'
    });
    expect(duplicate).toMatchObject({ success: true, duplicate: true });
    expect(harness.controller.getState().hostQueue).toHaveLength(2);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('keeps a committed viewer move authoritative when legacy publication throws', () => {
    const harness = createHarness({ connect4HostStarts: false });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'viewer-publication-fault',
      viewerDisplayName: 'Viewer Publication Fault'
    });
    harness.emitLegacyEvent.mockImplementationOnce(() => {
      throw new Error('legacy emitter offline');
    });

    expect(harness.controller.applyViewerMove({
      viewerId: 'viewer-publication-fault',
      gameType: 'connect4',
      move: { column: 'D' },
      moveIdentity: 'viewer-publication-fault-1'
    })).toMatchObject({ success: true, sessionId: match.sessionId });

    const active = harness.controller.registry.get(match.sessionId);
    const persisted = harness.database.getInteractiveState(match.sessionId);
    expect(active.sessionRevision).toBe(2);
    expect(active.sessionRevision).toBe(persisted.sessionRevision);
    expect(active.adapter.getState()).toEqual(persisted.state);
    expect(harness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual([match.sessionId]);
    expect(harness.database.getInteractiveQueue().map(row => row.sessionId)).toEqual([match.sessionId]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('publication failed'));

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('keeps a committed host move authoritative when display routing throws', () => {
    const harness = createHarness();
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'host-publication-fault',
      viewerDisplayName: 'Host Publication Fault'
    });
    const display = harness.controller.getState().display;
    jest.spyOn(harness.controller.router, 'beginAnimation').mockImplementationOnce(() => {
      throw new Error('display router offline');
    });

    expect(harness.controller.applyHostMove({
      sessionId: match.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { column: 'D' }
    })).toMatchObject({ success: true, sessionId: match.sessionId });

    const active = harness.controller.registry.get(match.sessionId);
    const persisted = harness.database.getInteractiveState(match.sessionId);
    expect(active.sessionRevision).toBe(2);
    expect(active.sessionRevision).toBe(persisted.sessionRevision);
    expect(active.adapter.getState()).toEqual(persisted.state);
    expect(harness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual([match.sessionId]);
    expect(harness.database.getInteractiveQueue().map(row => row.sessionId)).toEqual([match.sessionId]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('publication failed'));

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('reconciles a timed host move when animation fails before router state changes', () => {
    const harness = createHarness({
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 5
      }
    });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'animation-before-fault',
      viewerDisplayName: 'Animation Before Fault'
    });
    const display = harness.controller.getState().display;
    jest.spyOn(harness.controller.router, 'beginAnimation').mockImplementationOnce(() => {
      throw new Error('animation rejected before state change');
    });

    expect(harness.controller.applyHostMove({
      sessionId: match.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { column: 'D' }
    })).toMatchObject({ success: true, sessionId: match.sessionId });

    expect(harness.database.getInteractiveState(match.sessionId)).toMatchObject({
      sessionRevision: 2,
      turnRole: 'viewer',
      viewerDeadlineMs: Date.now() + 5000,
      viewerTimeRemainingMs: null
    });
    expect(harness.database.getInteractiveQueue().map(row => row.sessionId)).toEqual([match.sessionId]);
    expect(harness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual([match.sessionId]);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: match.sessionId,
      phase: 'playing',
      viewerDeadlineMs: Date.now() + 5000
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(1);
    expect(harness.controller.router.transitionTimer).toBeNull();
    expect(harness.controller.router.transitionDeadline).toBeNull();

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('reconciles a timed host move when animation publish leaves an unscheduled partial state', () => {
    const harness = createHarness({
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 5
      }
    });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'animation-partial-fault',
      viewerDisplayName: 'Animation Partial Fault'
    });
    const display = harness.controller.getState().display;
    harness.io.emit.mockImplementationOnce(() => {
      throw new Error('animation publish failed after state change');
    });

    expect(harness.controller.applyHostMove({
      sessionId: match.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { column: 'D' }
    })).toMatchObject({ success: true, sessionId: match.sessionId });

    expect(harness.database.getInteractiveState(match.sessionId)).toMatchObject({
      sessionRevision: 2,
      turnRole: 'viewer',
      viewerDeadlineMs: Date.now() + 5000,
      viewerTimeRemainingMs: null
    });
    expect(harness.database.getInteractiveQueue().map(row => row.sessionId)).toEqual([match.sessionId]);
    expect(harness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual([match.sessionId]);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: match.sessionId,
      phase: 'playing',
      viewerDeadlineMs: Date.now() + 5000
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(1);
    expect(harness.controller.router.transitionTimer).toBeNull();
    expect(harness.controller.router.transitionDeadline).toBeNull();

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('recovers the committed result for its full duration when result routing throws before mutation', () => {
    const harness = createHarness({
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 5
      }
    });
    harness.controller.init();
    const completed = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'result-before-fault',
      viewerDisplayName: 'Result Before Fault'
    });
    const getConfig = harness.controller.getConfig;
    harness.controller.getConfig = gameType => gameType === 'connect4'
      ? { ...getConfig(gameType), streamerRole: 'player2', leaderboardEnabled: false }
      : getConfig(gameType);
    const waiting = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'waiting-after-before-fault',
      viewerDisplayName: 'Waiting After Before Fault'
    });
    harness.controller.registry.get(completed.sessionId).config.leaderboardEnabled = false;
    jest.spyOn(harness.controller.router, 'showResult').mockImplementationOnce(() => {
      throw new Error('result rejected before router mutation');
    });

    const displayRevision = harness.controller.getState().display.displayRevision;
    const ended = harness.controller.end(completed.sessionId, {
      winner: 1,
      winnerRole: 'host',
      reason: 'win',
      gameResult: { gameOver: true, winner: 1 }
    });

    expect(ended).toMatchObject({ success: true });

    expect(harness.database.getInteractiveState(completed.sessionId)).toMatchObject({ status: 'completed' });
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: completed.sessionId,
      displayRevision: displayRevision + 1,
      phase: 'result',
      viewerDeadlineMs: null,
      result: ended.result
    });
    expect(harness.controller.router.resultQueue).toEqual([]);
    expect(harness.controller.timers.viewerTimers.size).toBe(0);

    jest.advanceTimersByTime(2999);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: completed.sessionId,
      phase: 'result',
      result: ended.result
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(0);

    jest.advanceTimersByTime(1);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: waiting.sessionId,
      displayRevision: displayRevision + 2,
      phase: 'playing',
      viewerDeadlineMs: Date.now() + 5000,
      result: null
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(1);
    expect(harness.controller.timers.viewerTimers.has(waiting.sessionId)).toBe(true);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('retains an already committed result idempotently when routing throws after mutation', () => {
    const harness = createHarness({
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 5
      }
    });
    harness.controller.init();
    const completed = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'result-after-fault',
      viewerDisplayName: 'Result After Fault'
    });
    const getConfig = harness.controller.getConfig;
    harness.controller.getConfig = gameType => gameType === 'connect4'
      ? { ...getConfig(gameType), streamerRole: 'player2', leaderboardEnabled: false }
      : getConfig(gameType);
    const waiting = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'waiting-after-result-fault',
      viewerDisplayName: 'Waiting After Result Fault'
    });
    harness.controller.registry.get(completed.sessionId).config.leaderboardEnabled = false;
    const showResult = harness.controller.router.showResult.bind(harness.controller.router);
    jest.spyOn(harness.controller.router, 'showResult').mockImplementationOnce((...args) => {
      showResult(...args);
      throw new Error('result failed after router mutation');
    });

    const displayRevision = harness.controller.getState().display.displayRevision;
    const ended = harness.controller.end(completed.sessionId, {
      winner: 1,
      winnerRole: 'host',
      reason: 'win',
      gameResult: { gameOver: true, winner: 1 }
    });

    expect(ended).toMatchObject({ success: true });

    expect(harness.database.getInteractiveState(completed.sessionId)).toMatchObject({ status: 'completed' });
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: completed.sessionId,
      displayRevision: displayRevision + 1,
      phase: 'result',
      viewerDeadlineMs: null,
      result: ended.result
    });
    expect(harness.controller.router.resultQueue).toEqual([]);
    expect(harness.controller.timers.viewerTimers.size).toBe(0);
    expect(harness.controller.router.transitionTimer).not.toBeNull();
    expect(harness.controller.router.transitionDeadline).toBe(Date.now() + 3000);
    expect(harness.controller.router.transitionAction).toEqual(expect.any(Function));

    jest.advanceTimersByTime(2999);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: completed.sessionId,
      phase: 'result',
      result: ended.result
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(0);

    jest.advanceTimersByTime(1);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: waiting.sessionId,
      displayRevision: displayRevision + 2,
      phase: 'playing',
      viewerDeadlineMs: Date.now() + 5000,
      result: null
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(1);
    expect(harness.controller.timers.viewerTimers.has(waiting.sessionId)).toBe(true);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('pauses the visible viewer timer while recovering a hidden result before router mutation', () => {
    const harness = createHarness({
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 5
      }
    });
    harness.controller.init();
    const visible = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'visible-result-recovery',
      viewerDisplayName: 'Visible Result Recovery'
    });
    const hidden = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'hidden-result-recovery',
      viewerDisplayName: 'Hidden Result Recovery'
    });
    harness.controller.registry.get(hidden.sessionId).config.leaderboardEnabled = false;
    jest.spyOn(harness.controller.router, 'showResult').mockImplementationOnce(() => {
      throw new Error('hidden result rejected before router mutation');
    });

    expect(harness.controller.timers.viewerTimers.has(visible.sessionId)).toBe(true);
    const ended = harness.controller.end(hidden.sessionId, {
      winner: 1,
      winnerRole: 'viewer',
      reason: 'win',
      gameResult: { gameOver: true, winner: 1 }
    });

    expect(ended).toMatchObject({ success: true });
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: hidden.sessionId,
      phase: 'result',
      result: ended.result
    });
    expect(harness.controller.getState().activeSessions.find(row => row.sessionId === visible.sessionId))
      .toMatchObject({
        viewerDeadlineMs: null,
        viewerTimeRemainingMs: 5000
      });
    expect(harness.controller.timers.viewerTimers.size).toBe(0);

    jest.advanceTimersByTime(2999);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: hidden.sessionId,
      phase: 'result',
      result: ended.result
    });
    expect(harness.controller.getState().activeSessions.find(row => row.sessionId === visible.sessionId))
      .toMatchObject({
        viewerDeadlineMs: null,
        viewerTimeRemainingMs: 5000
      });
    expect(harness.controller.timers.viewerTimers.size).toBe(0);

    jest.advanceTimersByTime(1);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: visible.sessionId,
      phase: 'playing',
      viewerDeadlineMs: Date.now() + 5000,
      viewerTimeRemainingMs: 5000,
      result: null
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(1);
    expect(harness.controller.timers.viewerTimers.has(visible.sessionId)).toBe(true);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('deduplicates a delayed viewer chat event after an intervening host move', () => {
    const harness = createHarness({ connect4HostStarts: false });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'viewer-delayed',
      viewerDisplayName: 'Delayed Viewer'
    });
    expect(harness.controller.applyViewerMove({
      viewerId: 'viewer-delayed',
      gameType: 'connect4',
      move: { column: 'A' },
      moveIdentity: 'chat-delayed-1'
    })).toMatchObject({ success: true });

    const display = harness.controller.getState().display;
    expect(harness.controller.applyHostMove({
      sessionId: match.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { column: 'B' }
    })).toMatchObject({ success: true });

    expect(harness.controller.applyViewerMove({
      viewerId: 'viewer-delayed',
      gameType: 'connect4',
      move: { column: 'A' },
      moveIdentity: 'chat-delayed-1'
    })).toMatchObject({ success: true, duplicate: true });
    expect(harness.controller.getState().activeSessions[0].moveCount).toBe(2);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('applies viewer timeout as one automatic loss and shows a background result', () => {
    const harness = createHarness({
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 5,
        interactiveResultDisplaySeconds: 3
      }
    });
    harness.controller.init();
    const waitingViewer = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'slow-viewer',
      viewerDisplayName: 'Slow Viewer'
    });

    jest.advanceTimersByTime(5000);
    jest.advanceTimersByTime(5000);

    expect(harness.finishGame).toHaveBeenCalledTimes(1);
    expect(harness.finishGame).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: waitingViewer.sessionId,
      reason: 'viewer_timeout',
      winnerRole: 'host'
    }));
    expect(harness.controller.getState().activeSessions).toEqual([]);
    expect(harness.controller.getState().display).toMatchObject({
      phase: 'leaderboard',
      gameType: 'connect4',
      leaderboard: { type: 'daily', index: 0, total: 2 }
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('prepares a new viewer timer before the display router schedules it', () => {
    const harness = createHarness({
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 5
      }
    });
    harness.controller.init();
    const createState = jest.spyOn(harness.database, 'createInteractiveState');

    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'prepared-viewer',
      viewerDisplayName: 'Prepared Viewer'
    });

    expect(createState).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: match.sessionId,
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 5000
    }));
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: match.sessionId,
      phase: 'playing',
      viewerDeadlineMs: Date.now() + 5000
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(1);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('runs a deadline for only the displayed viewer session', () => {
    const harness = createHarness({
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 5
      }
    });
    harness.controller.init();
    const first = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'visible-viewer',
      viewerDisplayName: 'Visible Viewer'
    });
    jest.advanceTimersByTime(2000);
    const second = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'hidden-viewer',
      viewerDisplayName: 'Hidden Viewer'
    });

    const sessions = harness.controller.getState().activeSessions;
    expect(sessions.find(row => row.sessionId === first.sessionId)).toMatchObject({
      viewerDeadlineMs: 1005000,
      viewerTimeRemainingMs: 3000
    });
    expect(sessions.find(row => row.sessionId === second.sessionId)).toMatchObject({
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 5000
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(1);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('rotates a completed game leaderboard only until a host board needs the overlay', () => {
    const harness = createHarness();
    harness.controller.init();
    const completed = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'leaderboard-viewer',
      viewerDisplayName: 'Leaderboard Viewer'
    });

    expect(harness.controller.end(completed.sessionId, {
      winner: 1,
      winnerRole: 'host',
      reason: 'win',
      gameResult: { gameOver: true, winner: 1 }
    })).toMatchObject({ success: true });
    jest.advanceTimersByTime(3000);

    expect(harness.controller.getState().display).toMatchObject({
      phase: 'leaderboard',
      gameType: 'connect4',
      leaderboard: { type: 'daily', index: 0, total: 2 }
    });

    const next = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'next-viewer',
      viewerDisplayName: 'Next Viewer'
    });
    expect(harness.controller.getState().display).toMatchObject({
      phase: 'playing',
      displaySessionId: next.sessionId,
      gameType: 'connect4'
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('does not consume a hidden viewer timer until that session owns the display', () => {
    const harness = createHarness({
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 5,
        interactiveResultDisplaySeconds: 3
      }
    });
    harness.controller.init();
    const hostBoard = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'host-wait', viewerDisplayName: 'Host Wait' });

    const viewerFirstConfig = { streamerRole: 'player2', animationSpeed: 500 };
    const originalGetConfig = harness.controller.getConfig;
    harness.controller.getConfig = gameType => gameType === 'connect4' ? viewerFirstConfig : originalGetConfig(gameType);
    const slow = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'slow', viewerDisplayName: 'Slow' });

    expect(harness.controller.getState().display.displaySessionId).toBe(hostBoard.sessionId);
    jest.advanceTimersByTime(5000);
    expect(harness.finishGame).not.toHaveBeenCalled();
    expect(harness.database.getInteractiveState(slow.sessionId)).toMatchObject({
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 5000
    });

    let display = harness.controller.getState().display;
    expect(harness.controller.applyHostMove({
      sessionId: hostBoard.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { column: 'D' }
    })).toMatchObject({ success: true });
    jest.advanceTimersByTime(500);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: slow.sessionId,
      phase: 'playing'
    });

    jest.advanceTimersByTime(4999);
    expect(harness.finishGame).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(harness.finishGame).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: slow.sessionId,
      reason: 'viewer_timeout'
    }));

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('restores active sessions, queue order, and viewer deadlines after restart', () => {
    const firstHarness = createHarness();
    firstHarness.controller.init();
    const first = firstHarness.controller.startMatch({ gameType: 'connect4', viewerId: 'a', viewerDisplayName: 'A' });
    const second = firstHarness.controller.startMatch({ gameType: 'chess', viewerId: 'b', viewerDisplayName: 'B' });
    firstHarness.controller.destroy();

    const secondHarness = createHarness({
      dbContext: firstHarness.dbContext,
      nextSessionId: 100
    });
    const recovered = secondHarness.controller.init();

    expect(recovered).toMatchObject({ recovered: 2 });
    expect(secondHarness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual([
      first.sessionId,
      second.sessionId
    ]);
    expect(secondHarness.controller.getState().display.displaySessionId).toBe(first.sessionId);
    expect(secondHarness.restoreGame).toHaveBeenCalledTimes(2);

    secondHarness.controller.destroy();
    firstHarness.sqlite.close();
  });

  test('clears a persisted Connect4 viewer deadline when the canonical timer is disabled before restart', () => {
    const firstHarness = createHarness({
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 30
      }
    });
    firstHarness.controller.init();
    const match = firstHarness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'disabled-after-restart',
      viewerDisplayName: 'Disabled After Restart'
    });
    expect(firstHarness.database.getInteractiveState(match.sessionId).viewerDeadlineMs).toBe(Date.now() + 30000);
    firstHarness.controller.destroy();

    const secondHarness = createHarness({
      dbContext: firstHarness.dbContext,
      nextSessionId: 100,
      connect4HostStarts: false,
      settings: { connect4ViewerTimeoutEnabled: false }
    });
    secondHarness.controller.init();

    expect(secondHarness.controller.getState().activeSessions[0].viewerDeadlineMs).toBeNull();
    expect(secondHarness.controller.getState().activeSessions[0].viewerTimeRemainingMs).toBeNull();
    expect(secondHarness.database.getInteractiveState(match.sessionId).viewerDeadlineMs).toBeNull();
    expect(secondHarness.database.getInteractiveState(match.sessionId).viewerTimeRemainingMs).toBeNull();
    expect(secondHarness.controller.timers.viewerTimers.size).toBe(0);

    secondHarness.controller.destroy();
    firstHarness.sqlite.close();
  });

  test('deduplicates a delayed host chat event after an intervening viewer move', () => {
    const harness = createHarness();
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'viewer-delayed-host',
      viewerDisplayName: 'Delayed Host Viewer'
    });
    let display = harness.controller.getState().display;
    expect(harness.controller.applyHostMove({
      sessionId: match.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { column: 'A' },
      moveIdentity: 'chat-host-delayed-1'
    })).toMatchObject({ success: true });

    expect(harness.controller.applyViewerMove({
      viewerId: 'viewer-delayed-host',
      gameType: 'connect4',
      move: { column: 'B' },
      moveIdentity: 'chat-viewer-after-host-1'
    })).toMatchObject({ success: true });

    display = harness.controller.getState().display;
    expect(harness.controller.applyHostMove({
      sessionId: match.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { column: 'C' },
      moveIdentity: 'chat-host-delayed-1'
    })).toMatchObject({ success: true, duplicate: true });
    expect(harness.controller.getState().activeSessions[0].moveCount).toBe(2);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('keeps Connect4 viewer turns untimed when the canonical round timer is disabled', () => {
    const harness = createHarness({ connect4HostStarts: false });
    harness.controller.init();

    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'untimed-viewer',
      viewerDisplayName: 'Untimed Viewer'
    });

    expect(harness.controller.getState()).toMatchObject({
      configuration: {
        connect4ViewerTimeoutEnabled: false,
        connect4ViewerResponseSeconds: 30,
        connect4ViewerWarningSeconds: 10
      },
      activeSessions: [{
        sessionId: match.sessionId,
        viewerDeadlineMs: null,
        viewerTimeRemainingMs: null
      }]
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(0);

    jest.advanceTimersByTime(120000);
    expect(harness.finishGame).not.toHaveBeenCalled();

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('reconciles an active Connect4 viewer timer immediately when canonical settings change', () => {
    const harness = createHarness({
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 30,
        connect4ViewerWarningSeconds: 10
      }
    });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'live-config-viewer',
      viewerDisplayName: 'Live Config Viewer'
    });

    harness.settings.connect4ViewerTimeoutEnabled = false;
    expect(harness.controller.refreshConnect4TimerConfiguration({
      roundTimerEnabled: false,
      roundTimeLimit: 30,
      roundWarningTime: 10
    })).toMatchObject({ updatedSessions: 1 });
    expect(harness.controller.getState().activeSessions[0].viewerDeadlineMs).toBeNull();
    expect(harness.database.getInteractiveState(match.sessionId).viewerDeadlineMs).toBeNull();
    expect(harness.controller.timers.viewerTimers.size).toBe(0);

    harness.settings.connect4ViewerTimeoutEnabled = true;
    harness.settings.connect4ViewerResponseSeconds = 45;
    expect(harness.controller.refreshConnect4TimerConfiguration({
      roundTimerEnabled: true,
      roundTimeLimit: 45,
      roundWarningTime: 10
    })).toMatchObject({ updatedSessions: 1 });
    expect(harness.controller.getState().activeSessions[0].viewerDeadlineMs).toBe(Date.now() + 45000);
    expect(harness.database.getInteractiveState(match.sessionId).viewerDeadlineMs).toBe(Date.now() + 45000);
    expect(harness.controller.timers.viewerTimers.size).toBe(1);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('keeps the original Connect4 viewer deadline live after only the warning time changes', () => {
    const harness = createHarness({
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 30,
        connect4ViewerWarningSeconds: 10
      }
    });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'warning-only-viewer',
      viewerDisplayName: 'Warning Only Viewer'
    });
    const originalDeadline = harness.controller.getState().activeSessions[0].viewerDeadlineMs;

    jest.advanceTimersByTime(10000);
    harness.settings.connect4ViewerWarningSeconds = 5;
    expect(harness.controller.refreshConnect4TimerConfiguration({
      roundTimerEnabled: true,
      roundTimeLimit: 30,
      roundWarningTime: 5
    })).toMatchObject({ updatedSessions: 1 });
    expect(harness.controller.getState().activeSessions[0]).toMatchObject({
      viewerDeadlineMs: originalDeadline,
      viewerTimeRemainingMs: 20000
    });

    jest.advanceTimersByTime(20000);
    expect(harness.finishGame).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: match.sessionId,
      reason: 'viewer_timeout'
    }));

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('refreshes active Connect4 audio config without rescheduling the viewer timer', () => {
    const harness = createHarness({
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 30,
        connect4ViewerWarningSeconds: 10
      }
    });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'audio-config-viewer',
      viewerDisplayName: 'Audio Config Viewer'
    });
    const original = harness.controller.getState().activeSessions[0];

    expect(harness.controller.refreshConnect4TimerConfiguration({
      soundEnabled: false,
      soundVolume: 0.25,
      roundTimerEnabled: true,
      roundTimeLimit: 30,
      roundWarningTime: 10
    })).toMatchObject({ updatedSessions: 1 });

    const refreshed = harness.controller.getState().activeSessions[0];
    expect(refreshed).toMatchObject({
      sessionId: match.sessionId,
      sessionRevision: original.sessionRevision + 1,
      viewerDeadlineMs: original.viewerDeadlineMs,
      viewerTimeRemainingMs: original.viewerTimeRemainingMs,
      config: expect.objectContaining({
        soundEnabled: false,
        soundVolume: 0.25
      })
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(1);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('starts the canonical Connect4 viewer deadline only after a host move when enabled', () => {
    const harness = createHarness({
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 45,
        connect4ViewerWarningSeconds: 12
      }
    });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'timed-viewer',
      viewerDisplayName: 'Timed Viewer'
    });
    const display = harness.controller.getState().display;

    expect(harness.controller.applyHostMove({
      sessionId: match.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { column: 'D' }
    })).toMatchObject({ success: true });

    expect(harness.controller.getState().activeSessions[0]).toMatchObject({
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 45000
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(0);

    jest.advanceTimersByTime(499);
    expect(harness.controller.getState().activeSessions[0]).toMatchObject({
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 45000
    });
    jest.advanceTimersByTime(1);
    expect(harness.controller.getState().activeSessions[0]).toMatchObject({
      viewerDeadlineMs: Date.now() + 45000,
      viewerTimeRemainingMs: 45000
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(1);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('pauses legacy viewer deadlines before recovery routes exactly one session', () => {
    const firstHarness = createHarness({
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 30
      }
    });
    firstHarness.controller.init();
    const first = firstHarness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'legacy-first',
      viewerDisplayName: 'Legacy First'
    });
    const second = firstHarness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'legacy-second',
      viewerDisplayName: 'Legacy Second'
    });
    firstHarness.controller.destroy();
    firstHarness.database.updateInteractiveState(first.sessionId, {
      viewerDeadlineMs: Date.now() + 20000,
      viewerTimeRemainingMs: null
    });
    firstHarness.database.updateInteractiveState(second.sessionId, {
      viewerDeadlineMs: Date.now() + 30000,
      viewerTimeRemainingMs: null
    });

    const secondHarness = createHarness({
      dbContext: firstHarness.dbContext,
      nextSessionId: 100,
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 30
      }
    });
    secondHarness.controller.init();

    const recovered = secondHarness.controller.getState().activeSessions;
    expect(secondHarness.controller.getState().display.displaySessionId).toBe(first.sessionId);
    expect(recovered.find(row => row.sessionId === first.sessionId)).toMatchObject({
      viewerDeadlineMs: Date.now() + 20000,
      viewerTimeRemainingMs: 20000
    });
    expect(recovered.find(row => row.sessionId === second.sessionId)).toMatchObject({
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 30000
    });
    expect(secondHarness.controller.timers.viewerTimers.size).toBe(1);

    secondHarness.controller.destroy();
    firstHarness.sqlite.close();
  });

  test('rejects a late viewer timeout when the session no longer owns the display', () => {
    const harness = createHarness({
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 5
      }
    });
    harness.controller.init();
    harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'displayed-timeout',
      viewerDisplayName: 'Displayed Timeout'
    });
    const hidden = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'hidden-timeout',
      viewerDisplayName: 'Hidden Timeout'
    });
    const hiddenSession = harness.controller.registry.get(hidden.sessionId);

    expect(harness.controller._handleViewerTimeout(hidden.sessionId, hiddenSession.sessionRevision)).toBe(false);
    expect(harness.finishGame).not.toHaveBeenCalled();
    expect(harness.controller.registry.get(hidden.sessionId)).toBe(hiddenSession);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('skips only the displayed FIFO head and preserves chess state while rotating it to the tail', () => {
    const harness = createHarness();
    harness.controller.init();
    const first = harness.controller.startMatch({
      gameType: 'chess',
      viewerId: 'first-chess-viewer',
      viewerDisplayName: 'First Chess Viewer',
      timeControl: '5+0'
    });
    const second = harness.controller.startMatch({
      gameType: 'chess',
      viewerId: 'second-chess-viewer',
      viewerDisplayName: 'Second Chess Viewer',
      timeControl: '5+0'
    });
    const before = harness.controller.getState();
    const firstSession = harness.controller.registry.get(first.sessionId);
    const stateBefore = firstSession.adapter.getState();

    expect(harness.controller.skipHostTurn({
      sessionId: first.sessionId,
      gameType: 'chess',
      sessionRevision: before.display.sessionRevision,
      displayRevision: before.display.displayRevision
    })).toMatchObject({ success: true, sessionId: first.sessionId });

    const after = harness.controller.getState();
    expect(after.hostQueue.map(row => row.sessionId)).toEqual([second.sessionId, first.sessionId]);
    expect(after.display).toMatchObject({
      displaySessionId: second.sessionId,
      phase: 'playing'
    });
    expect(after.display.displayRevision).toBeGreaterThan(before.display.displayRevision);
    expect(firstSession.sessionRevision).toBe(before.display.sessionRevision);
    expect(firstSession.adapter.getState()).toEqual(stateBefore);
    expect(harness.controller.timers.hostTimers.has(first.sessionId)).toBe(false);
    expect(harness.controller.timers.hostTimers.has(second.sessionId)).toBe(true);
    expect(harness.database.getInteractiveQueue().map(row => row.sessionId)).toEqual([second.sessionId, first.sessionId]);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('rejects a stale or undersized host-turn skip without changing queue order', () => {
    const harness = createHarness();
    harness.controller.init();
    const first = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'first', viewerDisplayName: 'First' });
    const display = harness.controller.getState().display;

    expect(harness.controller.skipHostTurn({
      sessionId: first.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision
    })).toMatchObject({ success: false, error: 'queue_too_short' });

    harness.controller.startMatch({ gameType: 'connect4', viewerId: 'second', viewerDisplayName: 'Second' });
    expect(harness.controller.skipHostTurn({
      sessionId: first.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision - 1
    })).toMatchObject({ success: false, error: 'stale_display_revision' });
    expect(harness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual([first.sessionId, 2]);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('cancels neutrally for exactly 1500ms before routing the next host board', () => {
    const harness = createHarness();
    harness.controller.init();
    const first = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'cancel-first', viewerDisplayName: 'Cancel First' });
    const second = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'cancel-second', viewerDisplayName: 'Cancel Second' });
    const display = harness.controller.getState().display;

    expect(harness.controller.cancel({
      sessionId: first.sessionId,
      gameType: 'connect4',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision
    })).toMatchObject({ success: true });
    expect(harness.finishGame).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: first.sessionId,
      reason: 'cancelled',
      winner: null,
      winnerRole: null,
      skipAccounting: true,
      leaderboard: null
    }));
    expect(harness.controller.getState().hostQueue.map(row => row.sessionId)).toEqual([second.sessionId]);
    expect(harness.database.getInteractiveState(first.sessionId)).toMatchObject({
      status: 'completed',
      terminalReason: 'cancelled'
    });
    expect(harness.controller.getState().display).toMatchObject({ phase: 'result' });

    jest.advanceTimersByTime(1499);
    expect(harness.controller.getState().display).toMatchObject({ phase: 'result' });
    jest.advanceTimersByTime(1);
    expect(harness.controller.getState().display).toMatchObject({
      phase: 'playing',
      displaySessionId: second.sessionId
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('completes a displayed chess session through host resignation and clears the shared queue', () => {
    const harness = createHarness();
    harness.controller.init();
    const chess = harness.controller.startMatch({
      gameType: 'chess',
      viewerId: 'resign-viewer',
      viewerDisplayName: 'Resign Viewer'
    });
    const display = harness.controller.getState().display;

    const result = harness.controller.resignHost({
      sessionId: chess.sessionId,
      gameType: 'chess',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision
    });

    expect(result).toMatchObject({
      success: true,
      result: {
        sessionId: chess.sessionId,
        winner: 'black',
        winnerRole: 'viewer',
        reason: 'resignation',
        gameResult: { gameOver: true, winner: 'black', winReason: 'resignation' }
      }
    });
    expect(harness.finishGame).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: chess.sessionId,
      reason: 'resignation',
      winnerRole: 'viewer'
    }));
    expect(harness.database.getInteractiveState(chess.sessionId)).toMatchObject({
      status: 'completed',
      terminalReason: 'resignation'
    });
    expect(harness.controller.getState().activeSessions).toEqual([]);
    expect(harness.controller.getState().hostQueue).toEqual([]);
    expect(harness.controller.getState().display).toMatchObject({
      phase: 'result',
      result: { reason: 'resignation' }
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('reconciles persisted interactive orphans but preserves manual game rows on init', () => {
    const harness = createHarness();
    const orphan = harness.database.createSession('connect4', 'orphan-viewer', 'viewer', 'command', '/c4start');
    harness.database.addPlayer2(orphan, 'streamer', 'streamer');
    harness.database.createInteractiveState({
      sessionId: orphan,
      gameType: 'connect4',
      viewerId: 'orphan-viewer',
      viewerDisplayName: 'Orphan Viewer',
      hostDisplayName: 'Host',
      state: new Connect4Game(
        orphan,
        { username: 'streamer', role: 'streamer', nickname: 'Host' },
        { username: 'orphan-viewer', role: 'viewer', nickname: 'Orphan Viewer' },
        logger
      ).getState(),
      sessionRevision: 1,
      displayRevision: 0,
      turnRole: 'viewer',
      viewerDeadlineMs: Date.now() + 30_000,
      hostTimeRemainingMs: null,
      timeControl: null,
      lastMoveIdentity: null,
      lastActivityAt: Date.now()
    });
    harness.sqlite.prepare(`
      UPDATE game_interactive_sessions
      SET status = 'completed', terminal_reason = 'interrupted'
      WHERE session_id = ?
    `).run(orphan);

    const manual = harness.database.createSession('chess', 'manual-viewer', 'viewer', 'command', '/chess');
    harness.database.addPlayer2(manual, 'streamer', 'streamer');

    expect(harness.controller.init()).toMatchObject({ reconciled: 1 });
    expect(harness.database.getSession(orphan)).toMatchObject({
      status: 'completed',
      win_reason: 'recovery_failed'
    });
    expect(harness.database.getSession(manual)).toMatchObject({ status: 'active' });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('persists the live chess host clock before an orderly restart', () => {
    const firstHarness = createHarness();
    firstHarness.controller.init();
    const chess = firstHarness.controller.startMatch({
      gameType: 'chess',
      viewerId: 'restart-viewer',
      viewerDisplayName: 'Restart Viewer',
      timeControl: '5+0'
    });
    jest.advanceTimersByTime(2500);
    firstHarness.controller.destroy();

    expect(firstHarness.database.getInteractiveState(chess.sessionId).hostTimeRemainingMs).toBe(297500);

    const secondHarness = createHarness({
      dbContext: firstHarness.dbContext,
      nextSessionId: 100
    });
    secondHarness.controller.init();
    expect(secondHarness.controller.getState().display.hostTimeRemainingMs).toBe(297500);

    secondHarness.controller.destroy();
    firstHarness.sqlite.close();
  });

  test('persists the exact live viewer remainder during orderly shutdown', () => {
    const harness = createHarness({
      connect4HostStarts: false,
      settings: {
        connect4ViewerTimeoutEnabled: true,
        connect4ViewerResponseSeconds: 5
      }
    });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'viewer-orderly-shutdown',
      viewerDisplayName: 'Viewer Orderly Shutdown'
    });

    jest.advanceTimersByTime(1750);
    harness.controller.destroy();

    expect(harness.database.getInteractiveState(match.sessionId)).toMatchObject({
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 3250
    });
    expect(harness.controller.timers.viewerTimers.size).toBe(0);
    harness.sqlite.close();
  });

  test('closes only a corrupt persisted session and restores the remaining games', () => {
    const firstHarness = createHarness();
    firstHarness.controller.init();
    const corrupt = firstHarness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'corrupt-viewer',
      viewerDisplayName: 'Corrupt Viewer'
    });
    const healthy = firstHarness.controller.startMatch({
      gameType: 'chess',
      viewerId: 'healthy-viewer',
      viewerDisplayName: 'Healthy Viewer'
    });
    firstHarness.controller.destroy();
    firstHarness.sqlite.prepare(`
      UPDATE game_interactive_sessions SET state_json = ? WHERE session_id = ?
    `).run('{not-json', corrupt.sessionId);

    const secondHarness = createHarness({
      dbContext: firstHarness.dbContext,
      nextSessionId: 100
    });
    expect(secondHarness.controller.init()).toMatchObject({ recovered: 1 });
    expect(secondHarness.controller.getState().activeSessions.map(row => row.sessionId)).toEqual([healthy.sessionId]);
    expect(firstHarness.sqlite.prepare(`
      SELECT status, terminal_reason FROM game_interactive_sessions WHERE session_id = ?
    `).get(corrupt.sessionId)).toEqual({ status: 'completed', terminal_reason: 'recovery_failed' });
    expect(secondHarness.discardRestoredGame).toHaveBeenCalledWith(corrupt.sessionId);

    secondHarness.controller.destroy();
    firstHarness.sqlite.close();
  });

  test('opens, claims, expires, and recovers one Connect4 challenge with a proxy avatar source', () => {
    const firstHarness = createHarness();
    firstHarness.controller.init();

    expect(firstHarness.controller.openConnect4Challenge({
      openerId: 'opener',
      openerDisplayName: 'Opener',
      openerAvatarSource: '/api/game-engine/avatar?url=https%3A%2F%2Fexample.com%2Fopener.png'
    })).toMatchObject({ success: true, challenge: expect.objectContaining({ expiresAtMs: 1030000 }) });
    expect(firstHarness.controller.openConnect4Challenge({
      openerId: 'other',
      openerDisplayName: 'Other',
      openerAvatarSource: 'https://example.com/not-a-proxy.png'
    })).toMatchObject({ success: false, error: 'challenge_already_open' });

    const recoveredHarness = createHarness({ dbContext: firstHarness.dbContext });
    expect(recoveredHarness.controller.init()).toMatchObject({ recoveredChallenge: true });
    const challenge = recoveredHarness.controller.recoverConnect4Challenge();
    expect(challenge).toMatchObject({ openerId: 'opener', status: 'open' });
    expect(recoveredHarness.controller.acceptConnect4Challenge({
      challengeId: challenge.challengeId,
      participantId: 'opener',
      participantDisplayName: 'Opener'
    })).toEqual({ success: false, error: 'self_challenge' });
    expect(recoveredHarness.controller.acceptConnect4Challenge({
      challengeId: challenge.challengeId,
      participantId: 'acceptor',
      participantDisplayName: 'Acceptor',
      participantAvatarSource: '/api/game-engine/avatar?url=https%3A%2F%2Fexample.com%2Facceptor.png'
    })).toMatchObject({ success: true, challenge: expect.objectContaining({ claimedById: 'acceptor' }) });

    const expiring = recoveredHarness.controller.openConnect4Challenge({
      openerId: 'slow-opener',
      openerDisplayName: 'Slow Opener',
      openerAvatarSource: ''
    });
    jest.advanceTimersByTime(30000);
    expect(recoveredHarness.controller.expireConnect4Challenge(expiring.challenge.challengeId))
      .toMatchObject({ success: true, challenge: expect.objectContaining({ status: 'expired' }) });
    expect(recoveredHarness.controller.recoverConnect4Challenge()).toBeNull();

    firstHarness.controller.destroy();
    recoveredHarness.controller.destroy();
    firstHarness.sqlite.close();
  });

  test('authorizes Connect4 viewer-versus-viewer moves by the persisted active participant', () => {
    const harness = createHarness({ connect4HostStarts: false });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'opener',
      viewerDisplayName: 'Opener',
      participants: [
        { id: 'opener', displayName: 'Opener', avatarSource: '' },
        { id: 'acceptor', displayName: 'Acceptor', avatarSource: '' }
      ]
    });

    expect(harness.controller.applyViewerMove({
      viewerId: 'acceptor',
      gameType: 'connect4',
      move: { column: 'A' }
    })).toEqual({ success: false, error: 'not_active_participant_turn' });
    expect(harness.controller.applyViewerMove({
      viewerId: 'opener',
      gameType: 'connect4',
      move: { column: 'A' }
    })).toMatchObject({ success: true, sessionId: match.sessionId });
    jest.advanceTimersByTime(500);
    expect(harness.controller.applyViewerMove({
      viewerId: 'acceptor',
      gameType: 'connect4',
      move: { column: 'B' }
    })).toMatchObject({ success: true, sessionId: match.sessionId });
    expect(harness.emitLegacyEvent).toHaveBeenLastCalledWith('move', expect.objectContaining({
      actorRole: 'viewer',
      actorId: 'acceptor',
      actorDisplayName: 'Acceptor'
    }));
    expect(harness.database.getInteractiveState(match.sessionId)).toMatchObject({
      participantIds: ['opener', 'acceptor'],
      turnPlayerId: 'opener'
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('awards a viewer-turn timeout to the other viewer rather than the legacy host identity', () => {
    const harness = createHarness({
      connect4HostStarts: false,
      settings: { connect4ViewerTimeoutEnabled: true, connect4ViewerResponseSeconds: 5 }
    });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'opener',
      viewerDisplayName: 'Opener',
      participants: [
        { id: 'opener', displayName: 'Opener', avatarSource: '' },
        { id: 'acceptor', displayName: 'Acceptor', avatarSource: '' }
      ]
    });

    expect(harness.controller._handleViewerTimeout(match.sessionId, 1)).toBe(true);
    expect(harness.finishGame).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: match.sessionId,
      winner: 2,
      winnerRole: 'viewer',
      winnerDisplayName: 'Acceptor',
      timedOutPlayerId: 'opener',
      reason: 'viewer_timeout'
    }));

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('recovers a host-starting Connect4 session with the streamer as its active participant', () => {
    const firstHarness = createHarness();
    firstHarness.controller.init();
    const match = firstHarness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'recovery-viewer',
      viewerDisplayName: 'Recovery Viewer'
    });
    firstHarness.controller.destroy();
    firstHarness.sqlite.prepare(`
      UPDATE game_interactive_sessions SET turn_player_id = NULL WHERE session_id = ?
    `).run(match.sessionId);

    const recoveredHarness = createHarness({ dbContext: firstHarness.dbContext });
    expect(recoveredHarness.controller.init()).toMatchObject({ recovered: 1 });
    expect(recoveredHarness.controller.getState().activeSessions[0]).toMatchObject({
      turnRole: 'host',
      turnPlayerId: 'streamer'
    });

    recoveredHarness.controller.destroy();
    firstHarness.sqlite.close();
  });

  test('keeps an open challenge unclaimed when its opener becomes active before acceptance', () => {
    const harness = createHarness();
    harness.controller.init();
    const opened = harness.controller.openConnect4Challenge({
      openerId: 'busy-opener',
      openerDisplayName: 'Busy Opener'
    });
    expect(harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'busy-opener',
      viewerDisplayName: 'Busy Opener'
    })).toMatchObject({ success: true });

    expect(harness.controller.acceptConnect4Challenge({
      challengeId: opened.challenge.challengeId,
      participantId: 'new-acceptor',
      participantDisplayName: 'New Acceptor'
    })).toEqual({ success: false, error: 'opener_active_session' });
    expect(harness.database.getOpenInteractiveChallenge()).toMatchObject({
      challengeId: opened.challenge.challengeId,
      status: 'open'
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('rolls a claimed Connect4 challenge back to open when match creation fails', () => {
    const harness = createHarness();
    harness.controller.init();
    const opened = harness.controller.openConnect4Challenge({
      openerId: 'opener',
      openerDisplayName: 'Opener'
    });
    harness.createGame.mockImplementation(() => {
      throw new Error('creation failed');
    });

    expect(harness.controller.acceptAndStartConnect4Challenge({
      challengeId: opened.challenge.challengeId,
      participantId: 'acceptor',
      participantDisplayName: 'Acceptor'
    })).toMatchObject({ success: false, error: 'creation failed' });
    expect(harness.database.getOpenInteractiveChallenge()).toMatchObject({
      challengeId: opened.challenge.challengeId,
      status: 'open'
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('rejects protocol-relative and external participant avatar sources before session creation', () => {
    const harness = createHarness();
    harness.controller.init();

    expect(harness.controller._isValidAvatarSource('//evil.example/api/game-engine/avatar?url=x')).toBe(false);
    expect(harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'opener',
      viewerDisplayName: 'Opener',
      participants: [
        { id: 'opener', displayName: 'Opener', avatarSource: '//evil.example/api/game-engine/avatar?url=x' },
        { id: 'acceptor', displayName: 'Acceptor', avatarSource: 'https://evil.example/avatar.png' }
      ]
    })).toEqual({ success: false, error: 'invalid_avatar_source' });
    expect(harness.createGame).not.toHaveBeenCalled();

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('closes recovery state carrying an external participant avatar source', () => {
    const firstHarness = createHarness({ connect4HostStarts: false });
    firstHarness.controller.init();
    const match = firstHarness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'opener',
      viewerDisplayName: 'Opener',
      participants: [
        { id: 'opener', displayName: 'Opener', avatarSource: '' },
        { id: 'acceptor', displayName: 'Acceptor', avatarSource: '' }
      ]
    });
    const persistedState = firstHarness.database.getInteractiveState(match.sessionId).state;
    firstHarness.database.updateInteractiveState(match.sessionId, {
      participants: [
        { id: 'opener', displayName: 'Opener', avatarSource: '//evil.example/api/game-engine/avatar?url=x' },
        { id: 'acceptor', displayName: 'Acceptor', avatarSource: '' }
      ],
      state: {
        ...persistedState,
        player1: { ...persistedState.player1, avatarSource: 'https://evil.example/avatar.png' }
      }
    });
    firstHarness.controller.destroy();

    const recoveredHarness = createHarness({ dbContext: firstHarness.dbContext });
    expect(recoveredHarness.controller.init()).toMatchObject({ recovered: 0 });
    expect(firstHarness.database.getInteractiveState(match.sessionId)).toMatchObject({
      status: 'completed',
      terminalReason: 'recovery_failed'
    });

    recoveredHarness.controller.destroy();
    firstHarness.sqlite.close();
  });

  test.each([
    'https://evil.example/avatar.png',
    '//evil.example/api/game-engine/avatar?url=x'
  ])('expires an unsafe recovered Connect4 challenge avatar source: %s', unsafeAvatarSource => {
    const harness = createHarness();
    harness.controller.init();
    const opened = harness.controller.openConnect4Challenge({
      openerId: 'opener',
      openerDisplayName: 'Opener',
      openerAvatarSource: ''
    });
    harness.sqlite.prepare(`
      UPDATE game_interactive_challenges SET opener_avatar_source = ? WHERE challenge_id = ?
    `).run(unsafeAvatarSource, opened.challenge.challengeId);

    expect(harness.controller.recoverConnect4Challenge()).toBeNull();
    expect(harness.database.getInteractiveChallenge(opened.challenge.challengeId)).toMatchObject({
      status: 'expired'
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('retains a same-origin recovered Connect4 challenge avatar source', () => {
    const harness = createHarness();
    harness.controller.init();
    const avatarSource = '/api/game-engine/avatar?url=https%3A%2F%2Fp16.tiktokcdn.com%2Favatar.webp';
    const opened = harness.controller.openConnect4Challenge({
      openerId: 'opener',
      openerDisplayName: 'Opener',
      openerAvatarSource: avatarSource
    });

    expect(harness.controller.recoverConnect4Challenge()).toMatchObject({
      challengeId: opened.challenge.challengeId,
      openerAvatarSource: avatarSource,
      status: 'open'
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('persists player two response time after a viewer-versus-viewer move and times out that player', () => {
    const harness = createHarness({
      connect4HostStarts: false,
      settings: { connect4ViewerTimeoutEnabled: true, connect4ViewerResponseSeconds: 5 }
    });
    harness.controller.init();
    const match = harness.controller.startMatch({
      gameType: 'connect4',
      viewerId: 'player-one',
      viewerDisplayName: 'Player One',
      participants: [
        { id: 'player-one', displayName: 'Player One', avatarSource: '' },
        { id: 'player-two', displayName: 'Player Two', avatarSource: '' }
      ]
    });

    expect(harness.controller.applyViewerMove({
      viewerId: 'player-one',
      gameType: 'connect4',
      move: { column: 'A' }
    })).toMatchObject({ success: true });
    expect(harness.database.getInteractiveState(match.sessionId)).toMatchObject({
      turnPlayerId: 'player-two',
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 5000
    });

    jest.advanceTimersByTime(500);
    expect(harness.database.getInteractiveState(match.sessionId)).toMatchObject({
      turnPlayerId: 'player-two',
      viewerDeadlineMs: Date.now() + 5000,
      viewerTimeRemainingMs: null
    });
    jest.advanceTimersByTime(5000);

    expect(harness.finishGame).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: match.sessionId,
      reason: 'viewer_timeout',
      timedOutPlayerId: 'player-two',
      winner: 1,
      winnerDisplayName: 'Player One'
    }));

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('retains an elapsed open challenge for startup fallback recovery instead of silently expiring it', () => {
    const harness = createHarness();
    harness.controller.init();
    const opened = harness.controller.openConnect4Challenge({
      openerId: 'fallback-opener',
      openerDisplayName: 'Fallback Opener'
    });
    jest.advanceTimersByTime(30000);

    expect(harness.controller.recoverConnect4Challenge({ includeExpired: true })).toMatchObject({
      challengeId: opened.challenge.challengeId,
      status: 'open',
      openerId: 'fallback-opener'
    });
    expect(harness.database.getInteractiveChallenge(opened.challenge.challengeId)).toMatchObject({ status: 'open' });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('matches Connect4 viewers in FIFO order without reserving session capacity for open searches', () => {
    const harness = createHarness();
    harness.controller.init();
    const avatarA = '/api/game-engine/avatar?url=https%3A%2F%2Fexample.com%2Fa.png';
    const avatarB = '/api/game-engine/avatar?url=https%3A%2F%2Fexample.com%2Fb.png';
    const avatarC = '/api/game-engine/avatar?url=https%3A%2F%2Fexample.com%2Fc.png';
    const avatarD = '/api/game-engine/avatar?url=https%3A%2F%2Fexample.com%2Fd.png';

    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'a', participantDisplayName: 'A', participantAvatarSource: avatarA
    })).toMatchObject({ success: true, action: 'opened', challenge: { challengeId: 1, openerId: 'a' } });
    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'a', participantDisplayName: 'A', participantAvatarSource: avatarA
    })).toEqual({ success: false, error: 'challenge_already_open' });
    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'b', participantDisplayName: 'B', participantAvatarSource: avatarB
    })).toMatchObject({ success: true, action: 'matched', challenge: { challengeId: 1, claimedById: 'b' }, sessionId: 1 });
    expect(harness.controller.registry.get(1).adapter.getState()).toMatchObject({
      player1: { username: 'a', nickname: 'A', role: 'viewer' },
      player2: { username: 'b', nickname: 'B', role: 'viewer' }
    });

    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'c', participantDisplayName: 'C', participantAvatarSource: avatarC
    })).toMatchObject({ success: true, action: 'opened', challenge: { challengeId: 2, openerId: 'c' } });
    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'd', participantDisplayName: 'D', participantAvatarSource: avatarD
    })).toMatchObject({ success: true, action: 'matched', challenge: { challengeId: 2, claimedById: 'd' }, sessionId: 2 });

    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'e', participantDisplayName: 'E', participantAvatarSource: ''
    })).toMatchObject({ success: true, action: 'opened', challenge: { challengeId: 3 } });
    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'f', participantDisplayName: 'F', participantAvatarSource: ''
    })).toMatchObject({ success: true, action: 'matched', challenge: { challengeId: 3 }, sessionId: 3 });
    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'g', participantDisplayName: 'G', participantAvatarSource: ''
    })).toMatchObject({ success: true, action: 'opened', challenge: { challengeId: 4 } });
    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'h', participantDisplayName: 'H', participantAvatarSource: ''
    })).toMatchObject({ success: true, action: 'matched', challenge: { challengeId: 4 }, sessionId: 4 });
    harness.database.createInteractiveChallenge({
      gameType: 'connect4', openerId: 'i', openerDisplayName: 'I',
      openerAvatarSource: '', createdAt: Date.now(), expiresAtMs: Date.now() + 30000
    });
    harness.database.createInteractiveChallenge({
      gameType: 'connect4', openerId: 'j', openerDisplayName: 'J',
      openerAvatarSource: '', createdAt: Date.now(), expiresAtMs: Date.now() + 30000
    });
    expect(harness.controller.getConnect4MatchmakingSnapshot()).toMatchObject({
      challengeId: 5,
      openerId: 'i',
      pendingCount: 2,
      pendingChallenges: [
        expect.objectContaining({ challengeId: 5, openerId: 'i' }),
        expect.objectContaining({ challengeId: 6, openerId: 'j' })
      ]
    });

    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'i', participantDisplayName: 'I', participantAvatarSource: ''
    })).toEqual({ success: false, error: 'challenge_already_open' });
    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'a', participantDisplayName: 'A', participantAvatarSource: avatarA
    })).toEqual({ success: false, error: 'active_session' });
    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'unsafe', participantDisplayName: 'Unsafe', participantAvatarSource: 'https://evil.example/avatar.png'
    })).toEqual({ success: false, error: 'invalid_avatar_source' });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('keeps an expired Connect4 fallback pending while all session capacity is occupied', () => {
    const harness = createHarness({ settings: { maxConcurrentInteractiveSessions: 1 } });
    harness.controller.init();
    const opened = harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'fallback-opener', participantDisplayName: 'Fallback Opener', participantAvatarSource: ''
    });
    jest.advanceTimersByTime(30000);

    expect(harness.controller.beginExpiredConnect4Fallback(opened.challenge.challengeId))
      .toMatchObject({ success: true, challenge: { status: 'fallback_pending' } });
    expect(harness.controller.startMatch({
      gameType: 'connect4', viewerId: 'occupied', viewerDisplayName: 'Occupied'
    })).toMatchObject({ success: true });
    expect(harness.controller.startPendingConnect4Fallback(opened.challenge.challengeId, 'Host'))
      .toEqual({ success: false, error: 'interactive_session_limit' });
    expect(harness.database.getInteractiveChallenge(opened.challenge.challengeId))
      .toMatchObject({ status: 'fallback_pending', openerId: 'fallback-opener' });
    expect(harness.controller.listRecoverableConnect4Challenges())
      .toEqual([expect.objectContaining({ challengeId: opened.challenge.challengeId, status: 'fallback_pending' })]);
    expect(harness.controller.end(1, { winner: 1, reason: 'test_complete' }))
      .toMatchObject({ success: true });
    expect(harness.controller.startPendingConnect4Fallback(opened.challenge.challengeId, 'Host'))
      .toMatchObject({ success: true, action: 'fallback_started', sessionId: 2 });
    expect(harness.database.getInteractiveChallenge(opened.challenge.challengeId))
      .toMatchObject({ status: 'expired' });
    expect(harness.controller.startPendingConnect4Fallback(opened.challenge.challengeId, 'Host'))
      .toEqual({ success: false, error: 'fallback_not_pending' });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('preserves an elapsed search as one fallback when a later matchmaking event arrives first', () => {
    const harness = createHarness();
    harness.controller.init();
    const opened = harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'elapsed-opener', participantDisplayName: 'Elapsed Opener', participantAvatarSource: ''
    });
    jest.advanceTimersByTime(30000);

    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'later-viewer', participantDisplayName: 'Later Viewer', participantAvatarSource: ''
    })).toMatchObject({ success: true, action: 'opened' });
    expect(harness.database.getInteractiveChallenge(opened.challenge.challengeId))
      .toMatchObject({ status: 'fallback_pending' });
    expect(harness.controller.beginExpiredConnect4Fallback(opened.challenge.challengeId))
      .toMatchObject({ success: true, challenge: { status: 'fallback_pending' } });
    expect(harness.controller.startPendingConnect4Fallback(opened.challenge.challengeId, 'Host'))
      .toMatchObject({ success: true, action: 'fallback_started', sessionId: 1 });
    expect(harness.controller.startPendingConnect4Fallback(opened.challenge.challengeId, 'Host'))
      .toEqual({ success: false, error: 'fallback_not_pending' });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test.each([
    ['active opener', '', harness => {
      expect(harness.controller.startMatch({
        gameType: 'connect4', viewerId: 'blocked-opener', viewerDisplayName: 'Blocked Opener'
      })).toMatchObject({ success: true });
    }],
    ['unsafe avatar opener', 'https://evil.example/avatar.png', () => {}]
  ])('skips a %s at the FIFO head and matches the next eligible Connect4 opener', (_label, blockedAvatarSource, prepareBlockedHead) => {
    const harness = createHarness();
    harness.controller.init();
    const blocked = harness.database.createInteractiveChallenge({
      gameType: 'connect4', openerId: 'blocked-opener', openerDisplayName: 'Blocked Opener',
      openerAvatarSource: blockedAvatarSource, createdAt: Date.now(), expiresAtMs: Date.now() + 30000
    });
    prepareBlockedHead(harness);
    const valid = harness.database.createInteractiveChallenge({
      gameType: 'connect4', openerId: 'valid-opener', openerDisplayName: 'Valid Opener',
      openerAvatarSource: '', createdAt: Date.now(), expiresAtMs: Date.now() + 30000
    });

    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'arriving-viewer', participantDisplayName: 'Arriving Viewer', participantAvatarSource: ''
    })).toMatchObject({
      success: true,
      action: 'matched',
      challenge: { challengeId: valid.challengeId, openerId: 'valid-opener', claimedById: 'arriving-viewer' }
    });
    expect(harness.database.listOpenInteractiveChallenges(Date.now())).toEqual([]);
    expect(harness.database.getInteractiveChallenge(blocked.challengeId)).toMatchObject({ status: 'expired' });
    expect(harness.database.getInteractiveChallenge(valid.challengeId)).toMatchObject({ status: 'claimed' });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('invalidates a FIFO opener locked after opening and matches the next eligible challenge', () => {
    const harness = createHarness();
    harness.controller.init();
    const locked = harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'locked-opener',
      participantDisplayName: 'Locked Opener',
      participantAvatarSource: ''
    });
    harness.database.setGamePlayerLockout('locked-opener', 'viewer_timeout', 86400000, Date.now());
    const eligible = harness.database.createInteractiveChallenge({
      gameType: 'connect4',
      openerId: 'eligible-opener',
      openerDisplayName: 'Eligible Opener',
      openerAvatarSource: '',
      createdAt: Date.now(),
      expiresAtMs: Date.now() + 30000
    });

    expect(harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'arriving-viewer',
      participantDisplayName: 'Arriving Viewer',
      participantAvatarSource: ''
    })).toMatchObject({
      success: true,
      action: 'matched',
      challenge: {
        challengeId: eligible.challengeId,
        openerId: 'eligible-opener',
        claimedById: 'arriving-viewer'
      }
    });
    expect(harness.database.getInteractiveChallenge(locked.challenge.challengeId))
      .toMatchObject({ status: 'expired' });
    expect(harness.controller.registry.get(1).adapter.getState()).toMatchObject({
      player1: { username: 'eligible-opener' },
      player2: { username: 'arriving-viewer' }
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('terminally closes a locked pending fallback and allows the next FIFO fallback to start', () => {
    const harness = createHarness();
    harness.controller.init();
    const locked = harness.controller.startOrJoinConnect4Matchmaking({
      participantId: 'locked-fallback',
      participantDisplayName: 'Locked Fallback',
      participantAvatarSource: ''
    });
    const eligible = harness.database.createInteractiveChallenge({
      gameType: 'connect4',
      openerId: 'eligible-fallback',
      openerDisplayName: 'Eligible Fallback',
      openerAvatarSource: '',
      createdAt: Date.now(),
      expiresAtMs: Date.now() + 30000
    });
    harness.database.setGamePlayerLockout('locked-fallback', 'viewer_timeout', 86400000, Date.now());
    jest.advanceTimersByTime(30000);
    expect(harness.controller.beginExpiredConnect4Fallback(locked.challenge.challengeId))
      .toMatchObject({ success: true });
    expect(harness.controller.beginExpiredConnect4Fallback(eligible.challengeId))
      .toMatchObject({ success: true });

    expect(harness.controller.startPendingConnect4Fallback(locked.challenge.challengeId, 'Host'))
      .toEqual({ success: false, error: 'game_lockout' });
    expect(harness.database.getInteractiveChallenge(locked.challenge.challengeId))
      .toMatchObject({ status: 'expired' });
    expect(harness.controller.startPendingConnect4Fallback(eligible.challengeId, 'Host'))
      .toMatchObject({ success: true, action: 'fallback_started', sessionId: 1 });
    expect(harness.controller.registry.get(1).adapter.getState()).toMatchObject({
      player1: { username: 'eligible-fallback' },
      player2: { username: 'streamer' }
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('snapshots opponent ELO and applies one visible streamer autoplay move', async () => {
    const autoplayService = {
      selectMove: jest.fn(() => Promise.resolve({ move: 'e2e4', source: 'fallback' })),
      destroy: jest.fn()
    };
    const harness = createHarness({
      autoplayService,
      chessConfig: {
        eloStartRating: 1250,
        eloEnabled: true,
        eloKFactor: 24,
        autoplay: { enabled: true, eloOffset: 150, moveDelayMs: 750 }
      }
    });
    harness.controller.init();

    const started = harness.controller.startMatch({
      gameType: 'chess', viewerId: 'elo-viewer', viewerDisplayName: 'ELO Viewer'
    });
    const session = harness.controller.registry.get(started.sessionId);

    expect(session.autoplay).toMatchObject({
      enabled: true,
      rated: true,
      kFactor: 24,
      viewerElo: 1250,
      targetElo: 1400,
      originRevision: 1
    });
    expect(harness.database.getInteractiveState(started.sessionId).autoplay).toMatchObject({
      targetElo: 1400,
      rated: true,
      kFactor: 24,
      originRevision: 1
    });
    expect(harness.controller.getState().activeSessions[0]).not.toHaveProperty('autoplay');

    await jest.advanceTimersByTimeAsync(749);
    expect(autoplayService.selectMove).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(autoplayService.selectMove).toHaveBeenCalledWith(expect.objectContaining({
      targetElo: 1400,
      seed: expect.any(String),
      legalMoves: expect.any(Array)
    }));
    expect(session.adapter.getState()).toMatchObject({ currentPlayer: 'black' });
    expect(session.lastMoveIdentity).toBe(`autoplay:${started.sessionId}:1`);

    harness.controller.destroy();
    expect(autoplayService.destroy).toHaveBeenCalledTimes(1);
    harness.sqlite.close();
  });

  test('cancels a pending autoplay intent when the streamer moves manually', async () => {
    const autoplayService = {
      selectMove: jest.fn(() => Promise.resolve({ move: 'd2d4', source: 'fallback' })),
      destroy: jest.fn()
    };
    const harness = createHarness({
      autoplayService,
      chessConfig: {
        autoplay: { enabled: true, eloOffset: 0, moveDelayMs: 750 }
      }
    });
    harness.controller.init();
    const started = harness.controller.startMatch({
      gameType: 'chess', viewerId: 'manual-viewer', viewerDisplayName: 'Manual Viewer'
    });
    const display = harness.controller.getState().display;

    expect(harness.controller.applyHostMove({
      sessionId: started.sessionId,
      gameType: 'chess',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { uci: 'e2e4' },
      moveIdentity: 'manual:opening'
    })).toMatchObject({ success: true });
    await jest.advanceTimersByTimeAsync(1000);

    expect(autoplayService.selectMove).not.toHaveBeenCalled();
    expect(harness.database.getInteractiveState(started.sessionId).autoplay).toMatchObject({
      status: 'cancelled',
      dueAtMs: null
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });
  test('waits for a visible viewer move before autoplaying the streamer black reply', async () => {
    const autoplayService = {
      selectMove: jest.fn(() => Promise.resolve({ move: 'e7e5', source: 'fallback' })),
      destroy: jest.fn()
    };
    const harness = createHarness({
      chessHostStarts: false,
      autoplayService,
      chessConfig: {
        autoplay: { enabled: true, eloOffset: 0, moveDelayMs: 750 }
      }
    });
    harness.controller.init();
    const started = harness.controller.startMatch({
      gameType: 'chess', viewerId: 'black-host-viewer', viewerDisplayName: 'Black Host Viewer'
    });
    const session = harness.controller.registry.get(started.sessionId);

    expect(session.turnRole).toBe('viewer');
    await jest.advanceTimersByTimeAsync(2000);
    expect(autoplayService.selectMove).not.toHaveBeenCalled();

    expect(harness.controller.applyViewerMove({
      viewerId: 'black-host-viewer',
      gameType: 'chess',
      move: { uci: 'e2e4' },
      moveIdentity: 'viewer-black-host-opening'
    })).toMatchObject({ success: true });
    expect(harness.controller.getState().display).toMatchObject({ phase: 'animating' });

    await jest.advanceTimersByTimeAsync(299);
    expect(autoplayService.selectMove).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: started.sessionId,
      phase: 'playing'
    });
    await jest.advanceTimersByTimeAsync(749);
    expect(autoplayService.selectMove).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(autoplayService.selectMove).toHaveBeenCalledWith(expect.objectContaining({
      legalMoves: expect.arrayContaining([
        expect.objectContaining({ from: 'e7', to: 'e5' })
      ])
    }));
    expect(session.adapter.getState()).toMatchObject({
      moveCount: 2,
      currentPlayer: 'white'
    });
    expect(session.lastMoveIdentity).toBe(`autoplay:${started.sessionId}:2`);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('does not schedule autoplay while a chess session is behind the visible FIFO head', async () => {
    const autoplayService = {
      selectMove: jest.fn(() => Promise.resolve({ move: 'e2e4', source: 'fallback' })),
      destroy: jest.fn()
    };
    const harness = createHarness({
      autoplayService,
      chessConfig: {
        autoplay: { enabled: true, eloOffset: 0, moveDelayMs: 750 }
      }
    });
    harness.controller.init();
    const first = harness.controller.startMatch({
      gameType: 'connect4', viewerId: 'fifo-first', viewerDisplayName: 'FIFO First'
    });
    const chess = harness.controller.startMatch({
      gameType: 'chess', viewerId: 'fifo-chess', viewerDisplayName: 'FIFO Chess'
    });

    await jest.advanceTimersByTimeAsync(2000);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: first.sessionId,
      phase: 'playing'
    });
    expect(autoplayService.selectMove).not.toHaveBeenCalled();

    const firstDisplay = harness.controller.getState().display;
    expect(harness.controller.applyHostMove({
      sessionId: first.sessionId,
      gameType: 'connect4',
      sessionRevision: firstDisplay.sessionRevision,
      displayRevision: firstDisplay.displayRevision,
      move: { column: 'A' },
      moveIdentity: 'fifo-first-host-move'
    })).toMatchObject({ success: true });
    await jest.advanceTimersByTimeAsync(500);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: chess.sessionId,
      phase: 'playing'
    });
    await jest.advanceTimersByTimeAsync(749);
    expect(autoplayService.selectMove).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(autoplayService.selectMove).toHaveBeenCalledTimes(1);
    expect(harness.controller.registry.get(chess.sessionId).lastMoveIdentity)
      .toBe(`autoplay:${chess.sessionId}:1`);

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('rejects a forged public autoplay identity before it can move the streamer side', () => {
    const autoplayService = {
      selectMove: jest.fn(() => Promise.resolve({ move: 'e2e4', source: 'fallback' })),
      destroy: jest.fn()
    };
    const harness = createHarness({
      autoplayService,
      chessConfig: {
        autoplay: { enabled: true, eloOffset: 0, moveDelayMs: 750 }
      }
    });
    harness.controller.init();
    const started = harness.controller.startMatch({
      gameType: 'chess', viewerId: 'forged-auto-viewer', viewerDisplayName: 'Forged Auto Viewer'
    });
    const display = harness.controller.getState().display;
    const session = harness.controller.registry.get(started.sessionId);

    expect(harness.controller.applyHostMove({
      sessionId: started.sessionId,
      gameType: 'chess',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move: { uci: 'e2e4' },
      moveIdentity: `autoplay:${started.sessionId}:1`
    })).toEqual({ success: false, error: 'autoplay_identity_reserved' });
    expect(session.adapter.getState()).toMatchObject({ moveCount: 0, currentPlayer: 'white' });
    expect(session.lastMoveIdentity).toBeNull();

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('cancelling an executing autoplay aborts its selection and cannot apply a late result', async () => {
    let resolveSelection;
    let receivedSignal;
    const autoplayService = {
      selectMove: jest.fn(({ signal }) => new Promise(resolve => {
        receivedSignal = signal;
        resolveSelection = resolve;
      })),
      destroy: jest.fn()
    };
    const harness = createHarness({
      autoplayService,
      chessConfig: {
        autoplay: { enabled: true, eloOffset: 0, moveDelayMs: 750 }
      }
    });
    harness.controller.init();
    const started = harness.controller.startMatch({
      gameType: 'chess', viewerId: 'cancel-auto-viewer', viewerDisplayName: 'Cancel Auto Viewer'
    });

    await jest.advanceTimersByTimeAsync(750);
    expect(autoplayService.selectMove).toHaveBeenCalledTimes(1);
    expect(receivedSignal.aborted).toBe(false);
    const display = harness.controller.getState().display;
    expect(harness.controller.cancel({
      sessionId: started.sessionId,
      gameType: 'chess',
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision
    })).toMatchObject({ success: true });
    expect(receivedSignal.aborted).toBe(true);

    resolveSelection({ move: 'e2e4', source: 'fallback' });
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.database.getInteractiveState(started.sessionId)).toMatchObject({
      status: 'completed',
      state: { moveCount: 0 }
    });

    harness.controller.destroy();
    harness.sqlite.close();
  });

  test('destroying the controller aborts an executing autoplay and ignores its late result', async () => {
    let resolveSelection;
    let receivedSignal;
    const autoplayService = {
      selectMove: jest.fn(({ signal }) => new Promise(resolve => {
        receivedSignal = signal;
        resolveSelection = resolve;
      })),
      destroy: jest.fn()
    };
    const harness = createHarness({
      autoplayService,
      chessConfig: {
        autoplay: { enabled: true, eloOffset: 0, moveDelayMs: 750 }
      }
    });
    harness.controller.init();
    const started = harness.controller.startMatch({
      gameType: 'chess', viewerId: 'destroy-auto-viewer', viewerDisplayName: 'Destroy Auto Viewer'
    });

    await jest.advanceTimersByTimeAsync(750);
    expect(autoplayService.selectMove).toHaveBeenCalledTimes(1);
    harness.controller.destroy();
    expect(receivedSignal.aborted).toBe(true);
    expect(autoplayService.destroy).toHaveBeenCalledTimes(1);

    resolveSelection({ move: 'e2e4', source: 'fallback' });
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.database.getInteractiveState(started.sessionId)).toMatchObject({
      status: 'active',
      state: { moveCount: 0 }
    });

    harness.sqlite.close();
  });

  test('recovers a persisted armed autoplay intent and honors its remaining delay', async () => {
    const firstAutoplayService = {
      selectMove: jest.fn(() => Promise.resolve({ move: 'e2e4', source: 'fallback' })),
      destroy: jest.fn()
    };
    const firstHarness = createHarness({
      autoplayService: firstAutoplayService,
      chessConfig: {
        autoplay: { enabled: true, eloOffset: 0, moveDelayMs: 750 }
      }
    });
    firstHarness.controller.init();
    const started = firstHarness.controller.startMatch({
      gameType: 'chess', viewerId: 'recover-auto-viewer', viewerDisplayName: 'Recover Auto Viewer'
    });
    expect(firstHarness.database.getInteractiveState(started.sessionId).autoplay).toMatchObject({
      status: 'armed',
      dueAtMs: Date.now() + 750,
      originRevision: 1
    });

    await jest.advanceTimersByTimeAsync(300);
    firstHarness.controller.destroy();

    const recoveredAutoplayService = {
      selectMove: jest.fn(() => Promise.resolve({ move: 'e2e4', source: 'fallback' })),
      destroy: jest.fn()
    };
    const recoveredHarness = createHarness({
      dbContext: firstHarness.dbContext,
      nextSessionId: 100,
      autoplayService: recoveredAutoplayService,
      chessConfig: {
        autoplay: { enabled: true, eloOffset: 0, moveDelayMs: 750 }
      }
    });
    expect(recoveredHarness.controller.init()).toMatchObject({ recovered: 1 });
    expect(recoveredHarness.controller.registry.get(started.sessionId).autoplay).toMatchObject({
      status: 'armed',
      dueAtMs: 1000750,
      originRevision: 1
    });

    await jest.advanceTimersByTimeAsync(449);
    expect(recoveredAutoplayService.selectMove).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(recoveredAutoplayService.selectMove).toHaveBeenCalledTimes(1);
    expect(recoveredHarness.controller.registry.get(started.sessionId).lastMoveIdentity)
      .toBe(`autoplay:${started.sessionId}:1`);

    recoveredHarness.controller.destroy();
    firstHarness.sqlite.close();
  });

  test('drops an autoplay result that races a display revision change', async () => {
    let resolveSelection;
    const autoplayService = {
      selectMove: jest.fn(() => new Promise(resolve => {
        resolveSelection = resolve;
      })),
      destroy: jest.fn()
    };
    const harness = createHarness({
      autoplayService,
      chessConfig: {
        autoplay: { enabled: true, eloOffset: 0, moveDelayMs: 750 }
      }
    });
    harness.controller.init();
    const started = harness.controller.startMatch({
      gameType: 'chess', viewerId: 'revision-race-viewer', viewerDisplayName: 'Revision Race Viewer'
    });
    const session = harness.controller.registry.get(started.sessionId);

    await jest.advanceTimersByTimeAsync(750);
    expect(autoplayService.selectMove).toHaveBeenCalledTimes(1);
    const beforeRevision = harness.controller.getState().display.displayRevision;
    harness.controller.router.suspend('test-revision-race');
    expect(harness.controller.getState().display.displayRevision).toBeGreaterThan(beforeRevision);

    resolveSelection({ move: 'e2e4', source: 'fallback' });
    await Promise.resolve();
    await Promise.resolve();
    expect(session.adapter.getState()).toMatchObject({ moveCount: 0, currentPlayer: 'white' });
    expect(session.lastMoveIdentity).toBeNull();

    harness.controller.destroy();
    harness.sqlite.close();
  });
  test('rearms autoplay after a transient host move persistence failure', async () => {
    const autoplayService = {
      selectMove: jest.fn(() => Promise.resolve({ move: 'e2e4', source: 'fallback' })),
      destroy: jest.fn()
    };
    const harness = createHarness({
      autoplayService,
      chessConfig: {
        autoplay: { enabled: true, eloOffset: 0, moveDelayMs: 750 }
      }
    });
    harness.controller.init();
    const started = harness.controller.startMatch({
      gameType: 'chess', viewerId: 'retry-auto-viewer', viewerDisplayName: 'Retry Auto Viewer'
    });
    const session = harness.controller.registry.get(started.sessionId);
    const originalUpdate = harness.database.updateInteractiveState.bind(harness.database);
    let rejectedMovePersist = false;
    jest.spyOn(harness.database, 'updateInteractiveState').mockImplementation((sessionId, state) => {
      if (!rejectedMovePersist && state?.state?.moveCount === 1) {
        rejectedMovePersist = true;
        throw new Error('transient persistence failure');
      }
      return originalUpdate(sessionId, state);
    });

    await jest.advanceTimersByTimeAsync(750);
    expect(rejectedMovePersist).toBe(true);
    expect(autoplayService.selectMove).toHaveBeenCalledTimes(1);
    expect(session.adapter.getState()).toMatchObject({ moveCount: 0, currentPlayer: 'white' });
    expect(session.autoplay).toMatchObject({ status: 'armed', dueAtMs: Date.now() + 750, originRevision: 1 });

    await jest.advanceTimersByTimeAsync(750);
    expect(autoplayService.selectMove).toHaveBeenCalledTimes(2);
    expect(session.adapter.getState()).toMatchObject({ moveCount: 1, currentPlayer: 'black' });
    expect(session.lastMoveIdentity).toBe(`autoplay:${started.sessionId}:1`);

    harness.controller.destroy();
    harness.sqlite.close();
  });

});
