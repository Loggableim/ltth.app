const { Chess } = require('chess.js');
const ChessGame = require('../games/chess');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

function createGame() {
  return new ChessGame(
    1,
    { username: 'viewer-1', role: 'viewer', side: 'white' },
    { username: 'streamer', role: 'streamer', side: 'black' },
    '5+0',
    logger
  );
}

function makeMove(game, move, player) {
  return game.makeMove(move, player, { skipElapsedTime: true, applyIncrement: false });
}

function positionGame(fen) {
  const game = createGame();
  game.chess.load(fen);
  game.currentPlayer = game.chess.turn() === 'w' ? 'white' : 'black';
  return game;
}

function perft(chess, depth) {
  if (depth === 0) return 1;

  let nodes = 0;
  for (const move of chess.moves({ verbose: true })) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    nodes += perft(chess, depth - 1);
    chess.undo();
  }
  return nodes;
}

describe('ChessGame rule integration', () => {
  test('has the standard 20 opening moves and known start-position perft counts', () => {
    const game = createGame();

    expect(game.getLegalMoves()).toHaveLength(20);
    expect(perft(new Chess(), 1)).toBe(20);
    expect(perft(new Chess(), 2)).toBe(400);
    expect(perft(new Chess(), 3)).toBe(8902);
  });

  test('executes castling and en passant as atomic legal moves', () => {
    const castling = createGame();
    for (const [move, player] of [
      ['Nf3', 'viewer-1'], ['Nf6', 'streamer'],
      ['g3', 'viewer-1'], ['g6', 'streamer'],
      ['Bg2', 'viewer-1'], ['Bg7', 'streamer']
    ]) {
      expect(makeMove(castling, move, player)).toMatchObject({ success: true, gameOver: false });
    }
    expect(makeMove(castling, 'O-O', 'viewer-1').move).toMatchObject({ san: 'O-O', uci: 'e1g1' });

    const enPassant = createGame();
    for (const [move, player] of [
      ['e4', 'viewer-1'], ['a6', 'streamer'],
      ['e5', 'viewer-1'], ['d5', 'streamer']
    ]) {
      expect(makeMove(enPassant, move, player)).toMatchObject({ success: true, gameOver: false });
    }
    expect(makeMove(enPassant, 'exd6', 'viewer-1').move).toMatchObject({
      captured: 'p',
      san: 'exd6',
      uci: 'e5d6'
    });
  });

  test.each(['q', 'r', 'b', 'n'])('supports %s promotion', promotion => {
    const game = positionGame('8/P7/8/8/8/8/8/k6K w - - 0 1');

    expect(makeMove(game, `a7a8${promotion}`, 'viewer-1').move).toMatchObject({ promotion });
  });

  test('does not offer en passant or castling when either would expose the king', () => {
    const enPassantPinned = positionGame('k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    expect(enPassantPinned.getLegalMoves().some(move => move.from === 'e5' && move.to === 'd6')).toBe(false);

    const castlingThroughCheck = positionGame('4k3/8/8/8/2b5/8/8/4K2R w K - 0 1');
    expect(castlingThroughCheck.getLegalMoves().some(move => move.san === 'O-O')).toBe(false);
  });

  test('replays an identical action sequence deterministically', () => {
    const replay = () => {
      const game = createGame();
      for (const [move, player] of [
        ['e4', 'viewer-1'], ['e5', 'streamer'],
        ['Nf3', 'viewer-1'], ['Nc6', 'streamer']
      ]) {
        expect(makeMove(game, move, player)).toMatchObject({ success: true, gameOver: false });
      }
      const state = game.getState();
      return {
        fen: state.fen,
        pgn: state.pgn,
        currentPlayer: state.currentPlayer,
        moveCount: state.moveCount,
        lastMove: state.lastMove,
        moveHistory: state.moveHistory,
        timers: state.timers
      };
    };

    expect(replay()).toEqual(replay());
  });
});
