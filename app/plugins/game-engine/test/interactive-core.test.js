const Connect4Game = require('../games/connect4');
const ChessGame = require('../games/chess');
const InteractiveSessionRegistry = require('../backend/interactive-session-registry');
const InteractiveTurnQueue = require('../backend/interactive-turn-queue');
const { createInteractiveAdapter } = require('../backend/interactive-game-adapters');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

function makeSession(overrides = {}) {
  return {
    sessionId: 1,
    gameType: 'connect4',
    viewerId: 'viewer-1',
    viewerDisplayName: 'Viewer One',
    hostDisplayName: 'Host',
    adapter: { getState: () => ({ moveCount: 2 }) },
    sessionRevision: 1,
    displayRevision: 0,
    turnRole: 'host',
    viewerDeadlineMs: null,
    hostTimeRemainingMs: null,
    lastActivityAt: 1000,
    status: 'active',
    ...overrides
  };
}

describe('InteractiveSessionRegistry', () => {
  test('indexes sessions by numeric ID and stable viewer identity', () => {
    const registry = new InteractiveSessionRegistry({ maxSessions: 2 });
    const added = registry.add(makeSession({ sessionId: '1' }));

    expect(added.sessionId).toBe(1);
    expect(registry.get(1)).toBe(added);
    expect(registry.getByViewer('viewer-1')).toBe(added);
    expect(registry.list()).toEqual([added]);
  });

  test('rejects a second active session for one viewer and the configured capacity', () => {
    const registry = new InteractiveSessionRegistry({ maxSessions: 2 });
    registry.add(makeSession());

    expect(() => registry.add(makeSession({ sessionId: 2 }))).toThrow(/active interactive match/i);

    registry.add(makeSession({ sessionId: 2, viewerId: 'viewer-2' }));
    expect(() => registry.add(makeSession({ sessionId: 3, viewerId: 'viewer-3' }))).toThrow(/limit/i);
  });

  test('creates read-only admin summaries with remaining viewer time', () => {
    const registry = new InteractiveSessionRegistry({ maxSessions: 20 });
    registry.add(makeSession({
      viewerDeadlineMs: 9000,
      turnRole: 'viewer',
      adapter: { getState: () => ({ moveCount: 4, board: [[0]] }) }
    }));

    expect(registry.summaries(4000)).toEqual([
      expect.objectContaining({
        sessionId: 1,
        gameType: 'connect4',
        viewerDisplayName: 'Viewer One',
        turnRole: 'viewer',
        viewerTimeRemainingMs: 5000,
        moveCount: 4,
        lastActivityAt: 1000,
        state: { moveCount: 4, board: [[0]] }
      })
    ]);
    expect(registry.summaries(4000)[0]).not.toHaveProperty('adapter');
  });
});

describe('InteractiveTurnQueue', () => {
  function createQueue() {
    let next = 0;
    const rows = [];
    const database = {
      enqueueInteractiveTurn: jest.fn(entry => {
        const existing = rows.find(row => row.sessionId === entry.sessionId);
        if (existing) return { inserted: false, ...existing };
        const row = { ...entry, sequence: ++next };
        rows.push(row);
        return { inserted: true, sequence: row.sequence };
      }),
      removeInteractiveTurn: jest.fn(sessionId => {
        const index = rows.findIndex(row => row.sessionId === sessionId);
        if (index === -1) return false;
        rows.splice(index, 1);
        return true;
      })
    };
    return { queue: new InteractiveTurnQueue(database, logger, () => 5000), database };
  }

  test('keeps Connect 4 and chess host turns in one FIFO', () => {
    const { queue } = createQueue();
    queue.enqueue(makeSession());
    queue.enqueue(makeSession({
      sessionId: 2,
      gameType: 'chess',
      viewerId: 'viewer-2',
      viewerDisplayName: 'Viewer Two'
    }));

    expect(queue.list().map(row => [row.sessionId, row.gameType, row.sequence])).toEqual([
      [1, 'connect4', 1],
      [2, 'chess', 2]
    ]);
    expect(queue.head().sessionId).toBe(1);
  });

  test('does not duplicate a session and removes it from persistence', () => {
    const { queue, database } = createQueue();
    const active = makeSession();

    expect(queue.enqueue(active)).toMatchObject({ inserted: true, sequence: 1 });
    expect(queue.enqueue(active)).toMatchObject({ inserted: false, sequence: 1 });
    expect(queue.list()).toHaveLength(1);
    expect(queue.remove(1)).toBe(true);
    expect(queue.list()).toEqual([]);
    expect(database.removeInteractiveTurn).toHaveBeenCalledWith(1);
  });

  test('rejects non-host turns and restores persisted sequence order', () => {
    const { queue } = createQueue();
    expect(() => queue.enqueue(makeSession({ turnRole: 'viewer' }))).toThrow(/host turn/i);

    queue.restore([
      { sessionId: 3, gameType: 'connect4', viewerId: 'c', viewerDisplayName: 'C', sequence: 9, enqueuedAt: 9, sessionRevision: 2 },
      { sessionId: 2, gameType: 'chess', viewerId: 'b', viewerDisplayName: 'B', sequence: 4, enqueuedAt: 4, sessionRevision: 3 }
    ]);
    expect(queue.list().map(row => row.sessionId)).toEqual([2, 3]);
  });
});

describe('interactive game adapters', () => {
  test('applies viewer and host Connect 4 moves through a common role contract', () => {
    const game = new Connect4Game(
      1,
      { username: 'viewer-1', role: 'viewer' },
      { username: 'streamer', role: 'streamer' },
      logger
    );
    const adapter = createInteractiveAdapter('connect4', game);

    expect(adapter.getCurrentTurnRole()).toBe('viewer');
    expect(adapter.applyViewerMove({ column: 'D' }, 'viewer-1')).toMatchObject({ success: true });
    expect(adapter.getCurrentTurnRole()).toBe('host');
    expect(adapter.applyHostMove({ column: 'C' })).toMatchObject({ success: true });
    expect(adapter.getState().moveCount).toBe(2);
  });

  test('applies viewer and host chess moves and restores serialized state', () => {
    const game = new ChessGame(
      2,
      { username: 'viewer-2', role: 'viewer', side: 'white' },
      { username: 'streamer', role: 'streamer', side: 'black' },
      '5+0',
      logger
    );
    const adapter = createInteractiveAdapter('chess', game);

    expect(adapter.getCurrentTurnRole()).toBe('viewer');
    expect(adapter.applyViewerMove({ move: 'e4' }, 'viewer-2')).toMatchObject({ success: true });
    expect(adapter.getCurrentTurnRole()).toBe('host');
    expect(adapter.applyHostMove({ move: 'e5' })).toMatchObject({ success: true });

    const restoredGame = new ChessGame(
      2,
      { username: 'viewer-2', role: 'viewer', side: 'white' },
      { username: 'streamer', role: 'streamer', side: 'black' },
      '5+0',
      logger
    );
    const restored = createInteractiveAdapter('chess', restoredGame);
    restored.restoreState(adapter.getState());
    expect(restored.getState()).toMatchObject({
      fen: adapter.getState().fen,
      currentPlayer: 'white',
      moveCount: 2
    });
  });

  test('rejects unsupported game types and wrong viewers', () => {
    expect(() => createInteractiveAdapter('slot', {})).toThrow(/unsupported/i);

    const game = new Connect4Game(
      1,
      { username: 'viewer-1', role: 'viewer' },
      { username: 'streamer', role: 'streamer' },
      logger
    );
    const adapter = createInteractiveAdapter('connect4', game);
    expect(adapter.applyViewerMove({ column: 'A' }, 'other-viewer')).toMatchObject({
      success: false,
      error: expect.stringMatching(/viewer/i)
    });
  });
});
