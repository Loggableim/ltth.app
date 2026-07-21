const InteractiveTurnTimers = require('../backend/interactive-turn-timers');
const InteractiveDisplayRouter = require('../backend/interactive-display-router');

function session(overrides = {}) {
  return {
    sessionId: 1,
    gameType: 'connect4',
    viewerId: 'viewer-1',
    viewerDisplayName: 'Viewer One',
    hostDisplayName: 'Host',
    sessionRevision: 1,
    displayRevision: 0,
    turnRole: 'viewer',
    viewerDeadlineMs: null,
    viewerTimeRemainingMs: null,
    hostTimeRemainingMs: null,
    lastActivityAt: Date.now(),
    status: 'active',
    config: { animationSpeed: 500 },
    adapter: {
      getState: () => ({ moveCount: 0, board: [[0]] })
    },
    ...overrides
  };
}

describe('InteractiveTurnTimers', () => {
  let sessions;
  let database;
  let onViewerTimeout;
  let onHostTimeout;
  let timers;
  let displaySessionId;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(100000);
    sessions = new Map();
    database = { updateInteractiveState: jest.fn() };
    onViewerTimeout = jest.fn();
    onHostTimeout = jest.fn();
    displaySessionId = 1;
    timers = new InteractiveTurnTimers({
      getSession: sessionId => sessions.get(Number(sessionId)) || null,
      getDisplaySessionId: () => displaySessionId,
      database,
      onViewerTimeout,
      onHostTimeout,
      now: () => Date.now()
    });
  });

  afterEach(() => {
    timers.destroy();
    jest.useRealTimers();
  });

  test('ignores a stale viewer timeout after the session revision changes', () => {
    const active = session();
    sessions.set(1, active);
    timers.startViewer(active, 5);

    active.sessionRevision = 2;
    active.turnRole = 'host';
    jest.advanceTimersByTime(5000);

    expect(onViewerTimeout).not.toHaveBeenCalled();
  });

  test('fires one automatic viewer timeout for the matching deadline', () => {
    const active = session();
    sessions.set(1, active);
    const deadline = timers.startViewer(active, 5);

    expect(deadline).toBe(105000);
    jest.advanceTimersByTime(5000);
    jest.advanceTimersByTime(5000);

    expect(onViewerTimeout).toHaveBeenCalledTimes(1);
    expect(onViewerTimeout).toHaveBeenCalledWith(1, 1);
  });

  test('pauses and resumes viewer time with exact remaining milliseconds', () => {
    const active = session({ viewerTimeRemainingMs: 5000 });
    sessions.set(1, active);

    expect(timers.resumeViewer(active)).toBe(105000);
    expect(active.viewerTimeRemainingMs).toBeNull();
    jest.advanceTimersByTime(2000);

    expect(timers.pauseViewer(active)).toBe(3000);
    expect(active).toMatchObject({
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 3000
    });
    expect(database.updateInteractiveState).toHaveBeenLastCalledWith(1, {
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 3000
    });

    jest.advanceTimersByTime(10000);
    expect(onViewerTimeout).not.toHaveBeenCalled();

    expect(timers.resumeViewer(active)).toBe(115000);
    jest.advanceTimersByTime(3000);
    expect(onViewerTimeout).toHaveBeenCalledTimes(1);
  });

  test('ignores a viewer timeout after the authoritative display changes', () => {
    const active = session();
    sessions.set(1, active);
    timers.prepareViewer(active, 5);
    timers.resumeViewer(active);

    displaySessionId = 2;
    jest.advanceTimersByTime(5000);

    expect(onViewerTimeout).not.toHaveBeenCalled();
  });

  test('clears both viewer timer fields', () => {
    const active = session({ viewerTimeRemainingMs: 5000 });
    sessions.set(1, active);
    timers.resumeViewer(active);

    timers.clearViewer(1);

    expect(active).toMatchObject({
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: null
    });
    expect(database.updateInteractiveState).toHaveBeenLastCalledWith(1, {
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: null
    });
  });

  test('destroy clears a viewer timeout whose session was already removed', () => {
    const active = session({ viewerTimeRemainingMs: 5000 });
    sessions.set(1, active);
    timers.resumeViewer(active);
    sessions.delete(1);

    timers.destroy();

    expect(timers.viewerTimers.size).toBe(0);
    jest.advanceTimersByTime(5000);
    expect(onViewerTimeout).not.toHaveBeenCalled();
  });

  test('deducts chess host time only between resume and pause', () => {
    const queued = session({
      gameType: 'chess',
      turnRole: 'host',
      hostTimeRemainingMs: 10000
    });
    sessions.set(1, queued);

    jest.advanceTimersByTime(3000);
    expect(queued.hostTimeRemainingMs).toBe(10000);

    timers.resumeHostChess(queued);
    jest.advanceTimersByTime(3000);
    expect(timers.pauseHostChess(queued)).toBe(7000);
    expect(queued.hostTimeRemainingMs).toBe(7000);
    expect(onHostTimeout).not.toHaveBeenCalled();
  });

  test('checkpoints the visible chess host clock and persists its final value on destroy', () => {
    const visible = session({
      gameType: 'chess',
      turnRole: 'host',
      hostTimeRemainingMs: 10000
    });
    sessions.set(1, visible);
    timers.resumeHostChess(visible);

    jest.advanceTimersByTime(2100);
    expect(database.updateInteractiveState).toHaveBeenLastCalledWith(1, {
      hostTimeRemainingMs: 8000
    });

    jest.advanceTimersByTime(400);
    timers.destroy();
    expect(database.updateInteractiveState).toHaveBeenLastCalledWith(1, {
      hostTimeRemainingMs: 7500
    });
  });

  test('ends a visible chess host turn exactly once when its clock expires', () => {
    const visible = session({
      gameType: 'chess',
      turnRole: 'host',
      hostTimeRemainingMs: 1500
    });
    sessions.set(1, visible);
    timers.resumeHostChess(visible);

    jest.advanceTimersByTime(1500);
    jest.advanceTimersByTime(1500);

    expect(visible.hostTimeRemainingMs).toBe(0);
    expect(onHostTimeout).toHaveBeenCalledTimes(1);
    expect(onHostTimeout).toHaveBeenCalledWith(1, 1);
  });
});

describe('InteractiveDisplayRouter', () => {
  let registryRows;
  let queueRows;
  let database;
  let timers;
  let snapshots;
  let router;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(200000);
    registryRows = new Map();
    queueRows = [];
    database = {
      getInteractiveMeta: jest.fn(() => '0'),
      setInteractiveMeta: jest.fn()
    };
    timers = {
      resumeHostChess: jest.fn(),
      pauseHostChess: jest.fn(),
      resumeViewer: jest.fn(),
      pauseViewer: jest.fn()
    };
    snapshots = [];
    router = new InteractiveDisplayRouter({
      registry: {
        get: id => registryRows.get(Number(id)) || null,
        list: () => Array.from(registryRows.values())
      },
      queue: {
        head: () => queueRows[0] || null,
        list: () => queueRows.map(row => ({ ...row }))
      },
      timers,
      database,
      onChange: snapshot => snapshots.push(snapshot),
      now: () => Date.now()
    });
  });

  afterEach(() => {
    router.destroy();
    jest.useRealTimers();
  });

  test('selects the FIFO head and exposes a full authoritative snapshot', () => {
    const first = session({ turnRole: 'host' });
    const second = session({
      sessionId: 2,
      gameType: 'chess',
      viewerId: 'viewer-2',
      viewerDisplayName: 'Viewer Two',
      turnRole: 'host',
      hostTimeRemainingMs: 300000
    });
    registryRows.set(1, first);
    registryRows.set(2, second);
    queueRows.push({ sessionId: 1, sequence: 1 }, { sessionId: 2, sequence: 2 });

    router.sync();

    expect(router.snapshot()).toMatchObject({
      displaySessionId: 1,
      gameType: 'connect4',
      phase: 'playing',
      hostDisplayName: 'Host',
      viewerDisplayName: 'Viewer One',
      sessionRevision: 1,
      waitingQueueCount: 1,
      activeSessionCount: 2,
      state: { moveCount: 0, board: [[0]] }
    });
    expect(snapshots).toHaveLength(1);
  });

  test('always displays the FIFO host head before an older viewer turn', () => {
    registryRows.set(1, session({ lastActivityAt: 1 }));
    registryRows.set(2, session({
      sessionId: 2,
      viewerId: 'viewer-2',
      viewerDisplayName: 'Viewer Two',
      turnRole: 'host',
      lastActivityAt: 2
    }));
    queueRows.push({ sessionId: 2, sequence: 1 });

    router.sync();

    expect(router.snapshot()).toMatchObject({
      displaySessionId: 2,
      phase: 'playing'
    });
    expect(timers.resumeViewer).not.toHaveBeenCalled();
  });

  test('displays the oldest active viewer turn with session ID as the tie breaker', () => {
    registryRows.set(2, session({
      sessionId: 2,
      viewerId: 'viewer-2',
      viewerDisplayName: 'Viewer Two',
      lastActivityAt: 100
    }));
    registryRows.set(1, session({ lastActivityAt: 100 }));
    registryRows.set(3, session({
      sessionId: 3,
      viewerId: 'viewer-3',
      viewerDisplayName: 'Viewer Three',
      lastActivityAt: 200
    }));

    router.sync();

    expect(router.snapshot()).toMatchObject({
      displaySessionId: 1,
      phase: 'playing'
    });
    expect(timers.resumeViewer).toHaveBeenCalledWith(registryRows.get(1));
  });

  test('pauses the old viewer and resumes the next viewer when display ownership changes', () => {
    const first = session({ lastActivityAt: 100 });
    const second = session({
      sessionId: 2,
      viewerId: 'viewer-2',
      viewerDisplayName: 'Viewer Two',
      lastActivityAt: 200
    });
    registryRows.set(1, first);
    registryRows.set(2, second);
    router.sync();
    timers.pauseViewer.mockClear();
    timers.resumeViewer.mockClear();

    first.status = 'completed';
    router.sync();

    expect(timers.pauseViewer).toHaveBeenCalledWith(first);
    expect(timers.resumeViewer).toHaveBeenCalledWith(second);
    expect(router.snapshot()).toMatchObject({ displaySessionId: 2, phase: 'playing' });
  });

  test('pauses viewer time during animation and resumes it on the same board', () => {
    const active = session();
    registryRows.set(1, active);
    router.sync();
    timers.pauseViewer.mockClear();
    timers.resumeViewer.mockClear();

    router.beginAnimation(1, 500);
    expect(timers.pauseViewer).toHaveBeenCalledWith(active);
    expect(router.snapshot()).toMatchObject({ displaySessionId: 1, phase: 'animating' });

    jest.advanceTimersByTime(500);
    expect(timers.resumeViewer).toHaveBeenCalledWith(active);
    expect(router.snapshot()).toMatchObject({ displaySessionId: 1, phase: 'playing' });
  });

  test('pauses viewer time for results and resumes after presentation', () => {
    const active = session();
    registryRows.set(1, active);
    router.sync();
    timers.pauseViewer.mockClear();
    timers.resumeViewer.mockClear();

    router.showResult({ sessionId: 8 }, 1000);
    expect(timers.pauseViewer).toHaveBeenCalledWith(active);
    expect(router.snapshot()).toMatchObject({ phase: 'result' });

    jest.advanceTimersByTime(1000);
    expect(timers.resumeViewer).toHaveBeenCalledWith(active);
    expect(router.snapshot()).toMatchObject({ displaySessionId: 1, phase: 'playing' });
  });

  test('keeps viewer time paused through leaderboard presentation', () => {
    const active = session();
    registryRows.set(1, active);
    router.sync();
    timers.pauseViewer.mockClear();
    timers.resumeViewer.mockClear();

    router.showResult({ sessionId: 8, gameType: 'connect4' }, 1000, {
      enabled: true,
      types: ['daily'],
      displayTimeMs: 1000
    });
    jest.advanceTimersByTime(1000);
    expect(router.snapshot()).toMatchObject({ phase: 'leaderboard' });
    expect(timers.resumeViewer).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    expect(timers.resumeViewer).toHaveBeenCalledWith(active);
    expect(router.snapshot()).toMatchObject({ displaySessionId: 1, phase: 'playing' });
  });

  test('suspends viewer time and resumes only the same displayed session', () => {
    const displayed = session({ lastActivityAt: 200 });
    registryRows.set(1, displayed);
    router.sync();
    timers.pauseViewer.mockClear();
    timers.resumeViewer.mockClear();

    router.suspend('overlay-hidden');
    registryRows.set(2, session({
      sessionId: 2,
      viewerId: 'viewer-2',
      viewerDisplayName: 'Viewer Two',
      lastActivityAt: 100
    }));
    router.resume();

    expect(timers.pauseViewer).toHaveBeenCalledWith(displayed);
    expect(timers.resumeViewer).toHaveBeenCalledTimes(1);
    expect(timers.resumeViewer).toHaveBeenCalledWith(displayed);
    expect(router.snapshot()).toMatchObject({
      displaySessionId: 1,
      phase: 'playing',
      suspendedReason: null
    });
  });

  test('holds the old board through animation before selecting the next head', () => {
    registryRows.set(1, session({ turnRole: 'host' }));
    registryRows.set(2, session({
      sessionId: 2,
      viewerId: 'viewer-2',
      viewerDisplayName: 'Viewer Two',
      turnRole: 'host'
    }));
    queueRows.push({ sessionId: 1, sequence: 1 }, { sessionId: 2, sequence: 2 });
    router.sync();

    queueRows.shift();
    router.beginAnimation(1, 500);
    jest.advanceTimersByTime(499);
    expect(router.snapshot()).toMatchObject({ displaySessionId: 1, phase: 'animating' });

    jest.advanceTimersByTime(1);
    expect(router.snapshot()).toMatchObject({ displaySessionId: 2, phase: 'playing' });
  });

  test('an older animation callback cannot hide a newer result revision', () => {
    registryRows.set(1, session({ turnRole: 'host' }));
    queueRows.push({ sessionId: 1, sequence: 1 });
    router.sync();
    router.beginAnimation(1, 500);
    const animationRevision = router.snapshot().displayRevision;

    router.showResult({ sessionId: 9, winnerDisplayName: 'Viewer Nine' }, 1000);
    const resultRevision = router.snapshot().displayRevision;
    expect(resultRevision).toBeGreaterThan(animationRevision);

    jest.advanceTimersByTime(500);
    expect(router.snapshot()).toMatchObject({
      phase: 'result',
      displayRevision: resultRevision,
      result: { sessionId: 9 }
    });
  });

  test('resumes a waiting host board after the current result and suppresses queued background results', () => {
    registryRows.set(1, session({ turnRole: 'host' }));
    queueRows.push({ sessionId: 1, sequence: 1 });
    router.sync();

    router.showResult({ sessionId: 8 }, 1000);
    router.showResult({ sessionId: 9 }, 1000);
    expect(router.snapshot()).toMatchObject({ phase: 'result', result: { sessionId: 8 } });

    jest.advanceTimersByTime(1000);
    expect(router.snapshot()).toMatchObject({
      displaySessionId: 1,
      phase: 'playing',
      result: null
    });
    jest.advanceTimersByTime(1000);
    expect(router.snapshot()).toMatchObject({
      displaySessionId: 1,
      phase: 'playing',
      result: null
    });
  });
});
