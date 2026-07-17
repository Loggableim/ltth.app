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
});
