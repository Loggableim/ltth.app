const ChessGame = require('../games/chess');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

function createGame(timeControl = '5+0') {
  return new ChessGame(
    1,
    { username: 'viewer-1', role: 'viewer', side: 'white' },
    { username: 'streamer', role: 'streamer', side: 'black' },
    timeControl,
    logger
  );
}

describe('ChessGame safety invariants', () => {
  test.each(['bad', '0+0', '-1+0', '5+-1', '181+0', '5+301'])(
    'rejects invalid time control %s',
    timeControl => {
      expect(() => createGame(timeControl)).toThrow(/time control/i);
    }
  );

  test('accepts a positive fractional minute control used by timer tests', () => {
    expect(createGame('0.001+0').timeControl).toEqual({
      initial: 60,
      increment: 0
    });
  });

  test('does not mutate the board after resignation', () => {
    const game = createGame();
    const before = game.getFEN();

    expect(game.resign('viewer-1')).toMatchObject({
      success: true,
      gameOver: true,
      winReason: 'resignation'
    });

    expect(game.makeMove('e4', 'streamer')).toMatchObject({
      success: false,
      gameOver: true,
      winReason: 'resignation'
    });
    expect(game.getFEN()).toBe(before);
  });

  test('does not apply a move after the legacy clock expires', () => {
    const game = createGame();
    game.startTimer();
    game.timers.white = 100;
    game.lastMoveTime = Date.now() - 1000;
    const before = game.getFEN();

    const result = game.makeMove('e4', 'viewer-1');

    expect(result).toMatchObject({
      success: false,
      gameOver: true,
      winner: 'black',
      winReason: 'timeout'
    });
    expect(game.getFEN()).toBe(before);
    expect(game.status).toBe('completed');
  });

  test('does not allow an unknown player to force a draw', () => {
    const game = createGame();

    expect(game.offerDraw('intruder')).toMatchObject({
      success: false,
      error: expect.stringMatching(/player/i)
    });
    expect(game.status).toBe('active');
  });
});
