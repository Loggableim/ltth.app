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

    expect(html).toContain('<option value="pyramid">Pyramid Battle</option>');
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
