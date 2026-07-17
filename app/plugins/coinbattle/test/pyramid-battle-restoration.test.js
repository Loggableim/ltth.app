const fs = require('fs');
const path = require('path');

const CoinBattleEngine = require('../engine/game-engine');
const CoinBattlePlugin = require('../main');
const PyramidMode = require('../engine/pyramid-mode');

const createLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
});

const createIO = () => ({
  emit: jest.fn()
});

const createPyramidDb = () => ({
  prepare: () => ({
    run: jest.fn(),
    get: jest.fn(() => null),
    all: jest.fn(() => [])
  })
});

describe('Pyramid Battle restoration', () => {
  test('shows Pyramid Battle in the CoinBattle match mode select', () => {
    const html = fs.readFileSync(path.join(__dirname, '../ui.html'), 'utf8');

    expect(html).toMatch(/<option\s+value="pyramid"[^>]*>Pyramid Battle<\/option>/);
  });

  test('accepts pyramid as a CoinBattle match mode', () => {
    const plugin = new CoinBattlePlugin({
      getSocketIO: () => createIO(),
      log: jest.fn()
    });

    expect(plugin.parseMatchMode('pyramid')).toBe('pyramid');
  });

  test('starts Pyramid Battle rounds with the selected match duration', () => {
    const io = createIO();
    const pyramid = new PyramidMode(createPyramidDb(), io, createLogger());

    try {
      const result = pyramid.startRound(7, 45);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        duration: 45
      }));
      expect(io.emit).toHaveBeenCalledWith('pyramid:round-started', expect.objectContaining({
        matchId: 7,
        duration: 45
      }));
    } finally {
      pyramid.destroy();
    }
  });

  test('starts configured Pyramid Battle mode when start request omits mode', () => {
    const routes = new Map();
    const plugin = new CoinBattlePlugin({
      getSocketIO: () => createIO(),
      getConfig: jest.fn(() => ({ mode: 'pyramid', matchDuration: 45 })),
      setConfig: jest.fn(),
      registerRoute: jest.fn((method, route, handler) => {
        routes.set(`${method.toUpperCase()} ${route}`, handler);
      }),
      log: jest.fn()
    });

    plugin.engine = {
      startMatch: jest.fn(() => ({ id: 12, mode: 'pyramid', duration: 45 }))
    };
    plugin.pyramidMode = {
      active: false,
      startRound: jest.fn(() => ({ success: true, duration: 45 })),
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
      getState: jest.fn(),
      endRound: jest.fn(),
      getStats: jest.fn(),
      getRoundHistory: jest.fn()
    };
    plugin.db = {
      getLifetimeLeaderboard: jest.fn(),
      getWeeklyLeaderboard: jest.fn(),
      getSeasonLeaderboard: jest.fn(),
      getActiveSeason: jest.fn(),
      getAllPlayers: jest.fn(),
      deletePlayer: jest.fn(),
      getAllSeasons: jest.fn(),
      createOrUpdateSeason: jest.fn(),
      deleteSeason: jest.fn(),
      getMatchHistory: jest.fn(),
      getPlayerStats: jest.fn(),
      getPlayerBadges: jest.fn()
    };
    plugin.kothMode = { start: jest.fn(), getStats: jest.fn() };
    plugin.friendChallenges = { createChallenge: jest.fn(), acceptChallenge: jest.fn(), getChallenges: jest.fn() };
    plugin.avatarSystem = { getAvatar: jest.fn(), setAvatar: jest.fn() };
    plugin.teamNamesManager = { getTeamNames: jest.fn(), setTeamName: jest.fn() };
    plugin.likesPointsSystem = { getConfig: jest.fn(), updateConfig: jest.fn(), getPlayerPointsForMatch: jest.fn() };

    plugin.registerRoutes();

    const handler = routes.get('POST /api/plugins/coinbattle/match/start');
    const res = {
      json: jest.fn(),
      status: jest.fn(() => res)
    };

    handler({ body: {}, ip: '127.0.0.1', path: '/api/plugins/coinbattle/match/start' }, res);

    expect(plugin.engine.startMatch).toHaveBeenCalledWith('pyramid', 45);
    expect(plugin.pyramidMode.startRound).toHaveBeenCalledWith(12, 45);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        mode: 'pyramid',
        pyramid: expect.objectContaining({ success: true })
      })
    });
  });

  test('exposes overlay resolution controls in CoinBattle settings UI', () => {
    const html = fs.readFileSync(path.join(__dirname, '../ui.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../ui.js'), 'utf8');

    expect(html).toContain('id="setting-overlay-resolution"');
    expect(html).toContain('id="setting-overlay-width"');
    expect(html).toContain('id="setting-overlay-height"');
    expect(js).toContain("document.getElementById('setting-overlay-resolution')");
    expect(js).toContain("document.getElementById('setting-overlay-width')");
    expect(js).toContain("document.getElementById('setting-overlay-height')");
  });

  test('includes the match mode in match-ended payloads for Pyramid cleanup hooks', () => {
    const emittedEvents = [];
    const mockDb = {
      createMatch: jest.fn(() => 11),
      endMatch: jest.fn(),
      updatePlayerLifetimeStats: jest.fn(),
      checkAndAwardBadges: jest.fn(() => []),
      updateMatchStats: jest.fn(),
      getMatchLeaderboard: jest.fn(() => [
        {
          user_id: 'user-1',
          player_id: 'player-1',
          unique_id: 'user_one',
          nickname: 'User One',
          coins: 100,
          gifts: 1
        }
      ]),
      getTeamScores: jest.fn(() => ({ red: 0, blue: 0 })),
      cleanupEventCache: jest.fn()
    };
    const io = {
      emit: jest.fn((event, data) => {
        emittedEvents.push({ event, data });
      })
    };
    const engine = new CoinBattleEngine(mockDb, io, createLogger());

    try {
      engine.startMatch('pyramid', 45);
      engine.endMatch();

      const matchEnded = emittedEvents.find((entry) => entry.event === 'coinbattle:match-ended');
      expect(matchEnded.data).toMatchObject({
        matchId: 11,
        mode: 'pyramid'
      });
    } finally {
      engine.destroy();
    }
  });
});
