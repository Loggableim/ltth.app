/**
 * Chess lifecycle regression tests.
 */

const GameEnginePlugin = require('../main');

const createPlugin = () => {
  const mockSocketIO = {
    on: jest.fn(),
    emit: jest.fn()
  };

  const addXP = jest.fn();
  const mockApi = {
    log: jest.fn(),
    getSocketIO: () => mockSocketIO,
    getDatabase: () => ({
      createSession: jest.fn(() => 1),
      addPlayer2: jest.fn()
    }),
    getPlugin: jest.fn(() => ({
      db: { addXP }
    }))
  };

  const plugin = new GameEnginePlugin(mockApi);
  plugin.db = {
    createSession: jest.fn(() => 1),
    addPlayer2: jest.fn(),
    updateSession: jest.fn(),
    getGameMedia: jest.fn(() => null),
    getSession: jest.fn(() => null),
    getXPRewards: jest.fn(() => ({
      win_xp: 100,
      loss_xp: 25,
      draw_xp: 50,
      participation_xp: 10
    })),
    updateChessPlayerStats: jest.fn(() => ({ isNewRecord: false })),
    updatePlayerStats: jest.fn(() => ({ isNewRecord: false }))
  };

  return { plugin, mockApi, mockSocketIO, addXP };
};

describe('Chess lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('timer timeout ends the active chess session', () => {
    jest.useFakeTimers();
    const { plugin } = createPlugin();
    plugin.endGame = jest.fn();

    plugin.startChessGame(
      'viewer1',
      'Viewer One',
      'command',
      '/chessstart',
      '0.001+0',
      {
        streamerRole: 'black',
        whiteColor: '#fff',
        blackColor: '#000'
      }
    );

    jest.advanceTimersByTime(500);

    expect(plugin.endGame).toHaveBeenCalledWith(
      1,
      'black',
      'timeout',
      expect.objectContaining({
        gameOver: true,
        winner: 'black',
        winReason: 'timeout',
        timeout: true
      })
    );
  });

  test('awards chess win and loss XP by player side', () => {
    const { plugin, addXP } = createPlugin();
    const session = {
      id: 7,
      game_type: 'chess',
      player1_username: 'alice',
      player2_username: 'bob'
    };

    plugin.activeSessions.set(session.id, {
      player1: { username: 'alice', side: 'white' },
      player2: { username: 'bob', side: 'black' }
    });

    plugin.awardGameXP(session, 'black', 'timeout', {
      win_xp: 100,
      loss_xp: 25,
      draw_xp: 50,
      participation_xp: 10
    });

    expect(addXP).toHaveBeenCalledWith(
      'alice',
      35,
      'game_loss',
      expect.objectContaining({ gameType: 'chess', sessionId: 7 })
    );
    expect(addXP).toHaveBeenCalledWith(
      'bob',
      110,
      'game_win',
      expect.objectContaining({ gameType: 'chess', sessionId: 7 })
    );
    expect(plugin.db.updateChessPlayerStats).toHaveBeenCalledWith(
      'bob',
      'chess',
      true,
      false,
      false,
      'black',
      110
    );
  });

  test('calculates chess ELO by white and black winner side', () => {
    const { plugin } = createPlugin();
    const updatePlayerELO = jest.fn((username, gameType, change) => ({
      username,
      gameType,
      oldELO: 1000,
      newELO: 1000 + change,
      change
    }));

    plugin.db = {
      getPlayerELO: jest.fn(() => 1000),
      calculateELOChange: jest.fn((playerELO, opponentELO, score) => {
        if (score === 1) return 16;
        if (score === 0) return -16;
        return 0;
      }),
      updatePlayerELO
    };

    const session = {
      id: 8,
      game_type: 'chess',
      player1_username: 'alice',
      player2_username: 'bob'
    };

    plugin.activeSessions.set(session.id, {
      player1: { username: 'alice', side: 'white' },
      player2: { username: 'bob', side: 'black' }
    });

    const result = plugin.calculateAndApplyELO(session, 'black', 'timeout', { eloKFactor: 32 });

    expect(result).toBeDefined();
    expect(updatePlayerELO).toHaveBeenCalledWith('alice', 'chess', -16);
    expect(updatePlayerELO).toHaveBeenCalledWith('bob', 'chess', 16);
  });
});
