const TopTierPlugin = require('../main');
const ScoreEngine = require('../backend/score-engine');
const { createOverlayFixture } = require('./helpers/obs-toptier-renderer-fixture');

const locales = ['de', 'en', 'es', 'fr'];
const syntheticEntries = {
  likes: [{ username: 'fixture-liker', nickname: 'Fixture Liker', profile_picture_url: '', score: 42, rank: 1 }],
  gifts: [{ username: 'fixture-gifter', nickname: 'Fixture Gifter', profile_picture_url: '', score: 17, rank: 1 }]
};

function createBackendContractFixture() {
  const handlers = new Map();
  const socketHandlers = new Map();
  const config = { likesBoard: { displayCount: 5 }, giftsBoard: { displayCount: 5 } };
  const liveSession = { active: true, sessionId: 'fixture-session-a' };
  const dbHandler = {
    getBoard: jest.fn(board => syntheticEntries[board].map(entry => ({ ...entry })))
  };
  const api = {
    registerRoute: jest.fn((method, route, handler) => handlers.set(`${method} ${route}`, handler)),
    registerSocket: jest.fn((event, handler) => socketHandlers.set(event, handler)),
    getConfig: jest.fn(() => config),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new TopTierPlugin(api);
  plugin.dbHandler = dbHandler;
  plugin.sessionManager = { getLiveSessionState: jest.fn(() => liveSession) };
  plugin.scoreEngine = { _getDefaultConfig: jest.fn(() => config) };
  plugin._registerRoutes();
  plugin._registerSocketEvents();

  return { api, plugin, dbHandler, handlers, socketHandlers, liveSession };
}

function invokeRoute(handler, req = {}) {
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    sendFile(file) { this.file = file; return this; }
  };
  handler(req, response);
  return response;
}

function makeScoreUpdate(board, entries, sessionId = 'fixture-session-a') {
  const emit = jest.fn();
  const engine = new ScoreEngine({ emit }, {}, {});
  engine._emitUpdate(board, entries, sessionId);
  return emit.mock.calls[0];
}

describe('TopTier canonical OBS overlay offline fixture', () => {
  test.each(locales)('loads the real template and supported %s title locale, then renders inactive defaults', async locale => {
    const fixture = await createOverlayFixture({ locale, board: 'both', variant: 'spotlight' });
    const expectedTitle = require(`../locales/${locale}.json`).plugins.toptier.labels.toptier_overlay;

    expect(fixture.window.document.documentElement.lang).toBe(locale);
    expect(fixture.window.document.title).toBe(expectedTitle);
    expect(fixture.root.children).toHaveLength(0);
    fixture.fire('connect');
    expect(fixture.emittedSocketEvents).toEqual([
      { eventName: 'toptier:get-board', payload: { board: 'likes' } },
      { eventName: 'toptier:get-board', payload: { board: 'gifts' } }
    ]);

    fixture.fire('toptier:update', { board: 'likes', entries: [], sessionId: null, active: false });
    fixture.fire('toptier:update', { board: 'gifts', entries: [], sessionId: null, active: false });
    expect(fixture.root.querySelectorAll('.tt-no-entries')).toHaveLength(2);
    expect(fixture.root.textContent).toContain('Likes');
    expect(fixture.root.textContent).toContain('Gifts');
    expect(fixture.root.textContent).toContain('Keine Einträge');
    expect(fixture.consoleMessages.every(line => line.length <= 240)).toBe(true);
    fixture.close();
  });

  test('matches GET and socket snapshot contracts without backend initialization or database writes', () => {
    const fixture = createBackendContractFixture();
    const getBoard = fixture.handlers.get('GET /board/:boardType');
    const activeGet = invokeRoute(getBoard, { params: { boardType: 'likes' } });
    expect(activeGet.body).toEqual({
      success: true,
      board: syntheticEntries.likes,
      sessionId: 'fixture-session-a',
      active: true
    });
    expect(fixture.dbHandler.getBoard).toHaveBeenCalledWith('likes', 'fixture-session-a', 5);

    fixture.liveSession.active = false;
    const inactiveGet = invokeRoute(getBoard, { params: { boardType: 'gifts' } });
    expect(inactiveGet.body).toEqual({ success: true, board: [], sessionId: null, active: false });
    expect(invokeRoute(getBoard, { params: { boardType: 'combined' } }).statusCode).toBe(400);

    fixture.liveSession.active = true;
    const socketResponses = [];
    const socket = { emit: (eventName, data) => socketResponses.push({ eventName, data }) };
    const getBoardSocket = fixture.socketHandlers.get('toptier:get-board');
    getBoardSocket(socket, { board: 'likes' });
    expect(socketResponses[0]).toEqual({
      eventName: 'toptier:update',
      data: { board: 'likes', entries: syntheticEntries.likes, sessionId: 'fixture-session-a', active: true }
    });
    getBoardSocket(socket, { board: 'invalid' });
    expect(socketResponses).toHaveLength(1);

    fixture.dbHandler.getBoard.mockImplementation(() => { throw new Error('fixture read failure'); });
    const failedGet = invokeRoute(getBoard, { params: { boardType: 'likes' } });
    expect(failedGet.statusCode).toBe(500);
    expect(failedGet.body.success).toBe(false);
    expect(fixture.api.emit).not.toHaveBeenCalled();
  });

  test('renders real score-engine update payloads for likes and gifts with local fixture data only', async () => {
    const fixture = await createOverlayFixture({ locale: 'en', board: 'both', variant: 'spotlight' });
    const likesUpdate = makeScoreUpdate('likes', syntheticEntries.likes);
    const giftsUpdate = makeScoreUpdate('gifts', syntheticEntries.gifts);
    expect(likesUpdate[0]).toBe('toptier:update');
    expect(likesUpdate[1]).toEqual({ board: 'likes', entries: syntheticEntries.likes, sessionId: 'fixture-session-a' });
    expect(giftsUpdate[1]).toEqual({ board: 'gifts', entries: syntheticEntries.gifts, sessionId: 'fixture-session-a' });

    fixture.fire(likesUpdate[0], likesUpdate[1]);
    fixture.fire(giftsUpdate[0], giftsUpdate[1]);
    expect(fixture.root.textContent).toContain('Fixture Liker');
    expect(fixture.root.textContent).toContain('Fixture Gifter');
    expect(fixture.root.textContent).toContain('42');
    expect(fixture.root.textContent).toContain('17');
    expect(fixture.root.querySelectorAll('img')).toHaveLength(0);
    expect(fixture.consoleMessages.every(line => line.length <= 240)).toBe(true);
    fixture.close();
  });

  test('ignores wrong board IDs and contains malformed entry payloads without changing visible rows', async () => {
    const fixture = await createOverlayFixture({ locale: 'de', board: 'likes', variant: 'spotlight' });
    const update = makeScoreUpdate('likes', syntheticEntries.likes);
    fixture.fire(update[0], update[1]);
    const before = fixture.root.innerHTML;

    expect(() => fixture.fire('toptier:update', {
      board: 'gifts', entries: [{ username: 'fixture-wrong-board', nickname: 'fixture-wrong-board', score: 99, rank: 1 }], sessionId: 'fixture-session-a'
    })).not.toThrow();
    expect(() => fixture.fire('toptier:update', {
      board: 'unknown', entries: [{ username: 'fixture-unknown-board', nickname: 'fixture-unknown-board', score: 99, rank: 1 }], sessionId: 'fixture-session-a'
    })).not.toThrow();
    expect(() => fixture.fire('toptier:update', { board: 'likes', entries: { invalid: true }, sessionId: 'fixture-session-a' })).not.toThrow();
    expect(() => fixture.fire('toptier:update', { board: 'likes', entries: [null], sessionId: 'fixture-session-a' })).not.toThrow();
    expect(fixture.root.innerHTML).toBe(before);
    expect(fixture.root.textContent).not.toContain('fixture-wrong-board');
    expect(fixture.root.textContent).not.toContain('fixture-unknown-board');
    fixture.close();
  });

  test('pagehide disconnects once and cancels spotlight and score-tick timers; queued updates stay inert', async () => {
    const fixture = await createOverlayFixture({ locale: 'fr', board: 'likes', variant: 'spotlight' });
    const first = makeScoreUpdate('likes', syntheticEntries.likes);
    fixture.fire(first[0], first[1]);
    const changed = [{ ...syntheticEntries.likes[0], score: 43 }];
    const second = makeScoreUpdate('likes', changed);
    fixture.fire(second[0], second[1]);
    expect(fixture.intervals.size).toBe(1);
    expect(fixture.timeouts.size).toBeGreaterThan(0);

    const queuedUpdate = fixture.socketHandlers.get('toptier:update');
    fixture.window.dispatchEvent(new fixture.window.Event('pagehide'));
    const afterCleanup = fixture.root.innerHTML;
    fixture.window.dispatchEvent(new fixture.window.Event('beforeunload'));
    queuedUpdate({ board: 'likes', entries: [{ username: 'fixture-late', nickname: 'fixture-late', profile_picture_url: '', score: 1, rank: 1 }], sessionId: 'fixture-session-a' });

    expect(fixture.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(fixture.clearedIntervals).toHaveLength(1);
    expect(fixture.clearedTimeouts.length).toBeGreaterThan(0);
    expect(fixture.intervals.size).toBe(0);
    expect(fixture.timeouts.size).toBe(0);
    expect(fixture.root.innerHTML).toBe(afterCleanup);
    expect(fixture.root.textContent).not.toContain('fixture-late');
    fixture.close();
  });
});
