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

  test('persists the mover as the checkmate winner and keeps the terminal state aligned with FEN', () => {
    const game = createGame();

    expect(game.makeMove('f3', 'viewer-1')).toMatchObject({ success: true, gameOver: false });
    expect(game.makeMove('e5', 'streamer')).toMatchObject({ success: true, gameOver: false });
    expect(game.makeMove('g4', 'viewer-1')).toMatchObject({ success: true, gameOver: false });

    expect(game.makeMove('Qh4#', 'streamer')).toMatchObject({
      success: true,
      gameOver: true,
      winner: 'black',
      winReason: 'checkmate'
    });
    expect(game.getState()).toMatchObject({
      status: 'completed',
      winner: 'black',
      winReason: 'checkmate',
      currentPlayer: 'white'
    });
  });

  test('restores move history needed to detect a threefold repetition after recovery', () => {
    const game = createGame('1+2');
    const firstCycle = [
      ['Nf3', 'viewer-1'],
      ['Nf6', 'streamer'],
      ['Ng1', 'viewer-1'],
      ['Ng8', 'streamer']
    ];
    for (const [move, player] of firstCycle) {
      expect(game.makeMove(move, player)).toMatchObject({ success: true, gameOver: false });
    }

    const restored = createGame('5+0');
    const savedState = game.getState();
    restored.restoreState(savedState);
    expect(restored.timeControl).toEqual(savedState.timeControl);
    expect(restored.getPGN()).toBe(savedState.pgn);

    let result;
    for (const [move, player] of firstCycle) {
      result = restored.makeMove(move, player);
    }

    expect(result).toMatchObject({
      success: true,
      gameOver: true,
      winner: null,
      winReason: 'repetition'
    });
    expect(restored.getState()).toMatchObject({
      status: 'completed',
      winner: null,
      winReason: 'repetition',
      currentPlayer: 'white'
    });
  });

  test('rejects a recovered PGN whose final position differs from the saved FEN', () => {
    const game = createGame();
    expect(game.makeMove('e4', 'viewer-1')).toMatchObject({ success: true });
    const corrupted = game.getState();

    const differentPosition = createGame();
    expect(differentPosition.makeMove('d4', 'viewer-1')).toMatchObject({ success: true });
    corrupted.fen = differentPosition.getFEN();

    expect(() => createGame().restoreState(corrupted)).toThrow(
      'Invalid chess state: PGN does not match FEN'
    );

  });

  test('rejects a recovered side-to-move that conflicts with the FEN', () => {
    const game = createGame();
    expect(game.makeMove('e4', 'viewer-1')).toMatchObject({ success: true });

    const corrupted = { ...game.getState(), currentPlayer: 'white' };
    expect(() => createGame().restoreState(corrupted)).toThrow(
      'Invalid chess state: current player does not match FEN'
    );
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
