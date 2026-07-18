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
    connect4ViewerResponseSeconds: 30,
    chessViewerResponseSeconds: 60,
    maxConcurrentInteractiveSessions: 20,
    interactiveResultDisplaySeconds: 3,
    ...options.settings
  };

  function buildGame({ sessionId, gameType, viewerId, viewerDisplayName, config, timeControl }) {
    if (gameType === 'connect4') {
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
        leaderboardDisplayTime: 3
      }
      : {
        streamerRole: options.chessHostStarts === false ? 'black' : 'white',
        animationSpeed: 300,
        leaderboardEnabled: true,
        leaderboardTypes: ['daily', 'elo'],
        leaderboardDisplayTime: 3
      },
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
    discardRestoredGame
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
    harness.controller.startMatch({ gameType: 'connect4', viewerId: 'viewer-b', viewerDisplayName: 'B' });

    expect(harness.controller.applyViewerMove({
      viewerId: 'viewer-a',
      gameType: 'connect4',
      move: { column: 'A' },
      moveIdentity: 'chat-a-1'
    })).toMatchObject({ success: true, sessionId: first.sessionId });
    expect(harness.controller.getState().hostQueue).toHaveLength(1);
    expect(harness.controller.getState().hostQueue[0].sessionId).toBe(first.sessionId);

    const duplicate = harness.controller.applyViewerMove({
      viewerId: 'viewer-a',
      gameType: 'connect4',
      move: { column: 'A' },
      moveIdentity: 'chat-a-1'
    });
    expect(duplicate).toMatchObject({ success: true, duplicate: true });
    expect(harness.controller.getState().hostQueue).toHaveLength(1);

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
      settings: { connect4ViewerResponseSeconds: 5, interactiveResultDisplaySeconds: 3 }
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

  test('suspends and resumes the same host board for a background viewer timeout result', () => {
    const harness = createHarness({
      settings: { connect4ViewerResponseSeconds: 5, interactiveResultDisplaySeconds: 3 }
    });
    harness.controller.init();
    const hostBoard = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'host-wait', viewerDisplayName: 'Host Wait' });

    const viewerFirstConfig = { streamerRole: 'player2', animationSpeed: 500 };
    const originalGetConfig = harness.controller.getConfig;
    harness.controller.getConfig = gameType => gameType === 'connect4' ? viewerFirstConfig : originalGetConfig(gameType);
    harness.controller.startMatch({ gameType: 'connect4', viewerId: 'slow', viewerDisplayName: 'Slow' });

    expect(harness.controller.getState().display.displaySessionId).toBe(hostBoard.sessionId);
    jest.advanceTimersByTime(5000);
    expect(harness.controller.getState().display).toMatchObject({ phase: 'result' });
    jest.advanceTimersByTime(3000);
    expect(harness.controller.getState().display).toMatchObject({
      displaySessionId: hostBoard.sessionId,
      phase: 'playing'
    });

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
});
