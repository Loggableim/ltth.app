const Database = require('better-sqlite3');
const GameEngineDatabase = require('../backend/database');

function createDatabase() {
  const sqlite = new Database(':memory:');
  const api = {
    getDatabase: () => ({ db: sqlite }),
    log: jest.fn()
  };
  const database = new GameEngineDatabase(api, {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  });
  database.initialize();
  return { database, sqlite };
}

function session(overrides = {}) {
  return {
    sessionId: 41,
    gameType: 'connect4',
    viewerId: 'viewer-41',
    viewerDisplayName: 'Viewer 41',
    hostDisplayName: 'Host',
    state: { board: [[0]], currentPlayer: 1 },
    sessionRevision: 1,
    displayRevision: 0,
    turnRole: 'viewer',
    viewerDeadlineMs: 123456,
    hostTimeRemainingMs: null,
    timeControl: null,
    lastMoveIdentity: null,
    lastActivityAt: 1000,
    ...overrides
  };
}

describe('GameEngineDatabase interactive persistence', () => {
  let database;
  let sqlite;

  beforeEach(() => {
    ({ database, sqlite } = createDatabase());
  });

  afterEach(() => {
    sqlite.close();
  });

  test('creates and reads active interactive state with parsed game data', () => {
    database.createInteractiveState(session());

    expect(database.getInteractiveState(41)).toMatchObject({
      sessionId: 41,
      gameType: 'connect4',
      viewerId: 'viewer-41',
      viewerDisplayName: 'Viewer 41',
      hostDisplayName: 'Host',
      state: { board: [[0]], currentPlayer: 1 },
      sessionRevision: 1,
      turnRole: 'viewer',
      viewerDeadlineMs: 123456,
      status: 'active'
    });
    expect(database.getActiveInteractiveStates()).toHaveLength(1);
  });

  test('allows only one active interactive session per viewer', () => {
    database.createInteractiveState(session());

    expect(() => database.createInteractiveState(session({
      sessionId: 42,
      gameType: 'chess'
    }))).toThrow(/unique/i);

    database.completeInteractiveState(41, 'cancelled');
    expect(() => database.createInteractiveState(session({
      sessionId: 42,
      gameType: 'chess'
    }))).not.toThrow();
  });

  test('persists mixed FIFO order and does not duplicate a queued session', () => {
    database.createInteractiveState(session());
    database.createInteractiveState(session({
      sessionId: 42,
      gameType: 'chess',
      viewerId: 'viewer-42',
      viewerDisplayName: 'Viewer 42'
    }));

    const first = database.enqueueInteractiveTurn({
      sessionId: 41,
      gameType: 'connect4',
      viewerId: 'viewer-41',
      viewerDisplayName: 'Viewer 41',
      sessionRevision: 2,
      enqueuedAt: 2000
    });
    const second = database.enqueueInteractiveTurn({
      sessionId: 42,
      gameType: 'chess',
      viewerId: 'viewer-42',
      viewerDisplayName: 'Viewer 42',
      sessionRevision: 3,
      enqueuedAt: 3000
    });
    const duplicate = database.enqueueInteractiveTurn({
      sessionId: 41,
      gameType: 'connect4',
      viewerId: 'viewer-41',
      viewerDisplayName: 'Viewer 41',
      sessionRevision: 99,
      enqueuedAt: 4000
    });

    expect(first).toMatchObject({ inserted: true, sequence: 1 });
    expect(second).toMatchObject({ inserted: true, sequence: 2 });
    expect(duplicate).toMatchObject({ inserted: false, sequence: 1 });
    expect(database.getInteractiveQueue().map(row => [row.sessionId, row.gameType, row.sequence])).toEqual([
      [41, 'connect4', 1],
      [42, 'chess', 2]
    ]);
  });

  test('rotates a persisted FIFO head to the tail without mutating its session revision', () => {
    database.createInteractiveState(session({ turnRole: 'host', sessionRevision: 7 }));
    database.createInteractiveState(session({
      sessionId: 42,
      gameType: 'chess',
      viewerId: 'viewer-42',
      viewerDisplayName: 'Viewer 42',
      turnRole: 'host',
      sessionRevision: 8
    }));
    database.enqueueInteractiveTurn({
      sessionId: 41,
      gameType: 'connect4',
      viewerId: 'viewer-41',
      viewerDisplayName: 'Viewer 41',
      sessionRevision: 7
    });
    database.enqueueInteractiveTurn({
      sessionId: 42,
      gameType: 'chess',
      viewerId: 'viewer-42',
      viewerDisplayName: 'Viewer 42',
      sessionRevision: 8
    });

    expect(database.rotateInteractiveTurnToTail(41)).toMatchObject({ moved: true });
    expect(database.getInteractiveQueue().map(row => [row.sessionId, row.sessionRevision])).toEqual([
      [42, 8],
      [41, 7]
    ]);
    expect(database.getInteractiveState(41).sessionRevision).toBe(7);
  });

  test('persists viewer move identities as a session-scoped deduplication ledger', () => {
    database.createInteractiveState(session());

    expect(database.hasInteractiveMoveIdentity(41, 'chat-1')).toBe(false);
    expect(database.recordInteractiveMoveIdentity(41, 'chat-1')).toBe(true);
    expect(database.recordInteractiveMoveIdentity(41, 'chat-1')).toBe(false);
    expect(database.hasInteractiveMoveIdentity(41, 'chat-1')).toBe(true);
    expect(database.hasInteractiveMoveIdentity(41, 'chat-2')).toBe(false);
  });

  test('returns a recoverable sentinel for corrupt state JSON and can close it without parsing', () => {
    sqlite.prepare(`
      INSERT INTO game_sessions (
        id, game_type, player1_username, player1_role, status
      ) VALUES (?, 'connect4', 'viewer-41', 'viewer', 'active')
    `).run(41);
    database.createInteractiveState(session());
    sqlite.prepare(`UPDATE game_interactive_sessions SET state_json = ? WHERE session_id = ?`)
      .run('{not-json', 41);

    expect(database.getActiveInteractiveStates()).toEqual([
      expect.objectContaining({ sessionId: 41, recoveryError: expect.any(String) })
    ]);
    expect(() => database.failInteractiveRecovery(41)).not.toThrow();
    expect(sqlite.prepare(`
      SELECT status, terminal_reason FROM game_interactive_sessions WHERE session_id = ?
    `).get(41)).toEqual({ status: 'completed', terminal_reason: 'recovery_failed' });
    expect(sqlite.prepare(`
      SELECT status, win_reason, ended_at IS NOT NULL AS has_ended
      FROM game_sessions WHERE id = ?
    `).get(41)).toEqual({ status: 'completed', win_reason: 'recovery_failed', has_ended: 1 });
  });

  test('rolls state and queue changes back atomically', () => {
    database.createInteractiveState(session());

    expect(() => database.transaction(() => {
      database.updateInteractiveState(41, {
        sessionRevision: 2,
        turnRole: 'host',
        state: { board: [[1]], currentPlayer: 2 }
      });
      database.enqueueInteractiveTurn({
        sessionId: 41,
        gameType: 'connect4',
        viewerId: 'viewer-41',
        viewerDisplayName: 'Viewer 41',
        sessionRevision: 2,
        enqueuedAt: 2000
      });
      throw new Error('rollback');
    })).toThrow('rollback');

    expect(database.getInteractiveState(41)).toMatchObject({
      sessionRevision: 1,
      turnRole: 'viewer',
      state: { board: [[0]], currentPlayer: 1 }
    });
    expect(database.getInteractiveQueue()).toEqual([]);
  });

  test('stores display metadata and removes queue membership on completion', () => {
    database.createInteractiveState(session());
    database.enqueueInteractiveTurn({
      sessionId: 41,
      gameType: 'connect4',
      viewerId: 'viewer-41',
      viewerDisplayName: 'Viewer 41',
      sessionRevision: 2,
      enqueuedAt: 2000
    });

    database.setInteractiveMeta('displayRevision', '7');
    database.completeInteractiveState(41, 'viewer_timeout');

    expect(database.getInteractiveMeta('displayRevision')).toBe('7');
    expect(database.getInteractiveQueue()).toEqual([]);
    expect(database.getInteractiveState(41)).toMatchObject({
      status: 'completed',
      terminalReason: 'viewer_timeout'
    });
    expect(database.getActiveInteractiveStates()).toEqual([]);
  });

  test('reconciles orphaned legacy rows and reports aborted games separately from completed and authoritative active games', () => {
    const completed = database.createSession('connect4', 'winner', 'viewer', 'command', '/c4start');
    database.addPlayer2(completed, 'streamer', 'streamer');
    database.endSession(completed, 'winner', { board: [[1]] }, 'win');

    const cancelled = database.createSession('connect4', 'cancelled', 'viewer', 'command', '/c4start');
    database.addPlayer2(cancelled, 'streamer', 'streamer');
    database.endSession(cancelled, null, { board: [[0]] }, 'cancelled');

    const recoverable = database.createSession('connect4', 'recoverable', 'viewer', 'command', '/c4start');
    database.addPlayer2(recoverable, 'streamer', 'streamer');
    database.createInteractiveState(session({
      sessionId: recoverable,
      viewerId: 'recoverable',
      viewerDisplayName: 'Recoverable',
      turnRole: 'host'
    }));

    const orphan = database.createSession('connect4', 'orphan', 'viewer', 'command', '/c4start');
    database.addPlayer2(orphan, 'streamer', 'streamer');

    expect(database.reconcileOrphanedInteractiveSessions()).toBe(1);
    expect(database.getSession(orphan)).toMatchObject({ status: 'completed', win_reason: 'recovery_failed' });
    expect(database.getGameStats('connect4')).toMatchObject({
      total_games: 4,
      completed_games: 1,
      aborted_games: 2,
      active_games: 1
    });
    expect(database.getPlayerStats('cancelled')).toEqual([]);
    expect(database.getDailyLeaderboard('connect4')).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ username: 'cancelled' })
    ]));
  });
});
