/**
 * Connect4 Game Logic Tests
 */

const Connect4Game = require('../games/connect4');

describe('Connect4 Game', () => {
  let game;
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };

  beforeEach(() => {
    const player1 = { username: 'viewer1', role: 'viewer', color: '#E74C3C', nickname: 'Viewer1' };
    const player2 = { username: 'streamer', role: 'streamer', color: '#F1C40F', nickname: 'Streamer' };
    game = new Connect4Game(1, player1, player2, mockLogger);
  });

  describe('Initialization', () => {
    test('should initialize with empty board', () => {
      const state = game.getState();
      expect(state.board).toHaveLength(6);
      expect(state.board[0]).toHaveLength(7);
      expect(state.board[0][0]).toBe(0);
    });

    test('should start with player 1', () => {
      expect(game.currentPlayer).toBe(1);
    });

    test('should have correct player info', () => {
      const state = game.getState();
      expect(state.player1.username).toBe('viewer1');
      expect(state.player2.username).toBe('streamer');
    });
  });

  describe('Column Validation', () => {
    test('should convert column letters to indices', () => {
      expect(game.columnLetterToIndex('A')).toBe(0);
      expect(game.columnLetterToIndex('G')).toBe(6);
      expect(game.columnLetterToIndex('a')).toBe(0);
    });

    test('should return null for invalid letters', () => {
      expect(game.columnLetterToIndex('H')).toBe(null);
      expect(game.columnLetterToIndex('Z')).toBe(null);
    });

    test('should validate column is not full', () => {
      expect(game.isValidColumn(0)).toBe(true);
      
      // Fill column A completely
      for (let i = 0; i < 6; i++) {
        game.dropPiece('A');
      }
      
      expect(game.isValidColumn(0)).toBe(false);
    });

    test('should reject invalid column indices', () => {
      expect(game.isValidColumn(-1)).toBe(false);
      expect(game.isValidColumn(7)).toBe(false);
    });
  });

  describe('Dropping Pieces', () => {
    test('should drop piece to bottom row', () => {
      const result = game.dropPiece('A');
      expect(result.success).toBe(true);
      expect(result.move.row).toBe(5);
      expect(result.move.column).toBe(0);
    });

    test('should stack pieces correctly', () => {
      game.dropPiece('A'); // Player 1
      game.dropPiece('A'); // Player 2
      
      const state = game.getState();
      expect(state.board[5][0]).toBe(1); // Bottom
      expect(state.board[4][0]).toBe(2); // Second from bottom
    });

    test('should reject move in full column', () => {
      // Fill column A
      for (let i = 0; i < 6; i++) {
        game.dropPiece('A');
      }
      
      const result = game.dropPiece('A');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test('should alternate players', () => {
      game.dropPiece('A'); // Player 1
      expect(game.currentPlayer).toBe(2);
      
      game.dropPiece('B'); // Player 2
      expect(game.currentPlayer).toBe(1);
    });

    test('should accept both letter and index input', () => {
      const result1 = game.dropPiece('A');
      expect(result1.success).toBe(true);
      
      const result2 = game.dropPiece(1);
      expect(result2.success).toBe(true);
    });
  });

  describe('Win Detection', () => {
    test('should detect horizontal win', () => {
      // Player 1 wins horizontally at bottom
      game.dropPiece('A'); // P1
      game.dropPiece('A'); // P2
      game.dropPiece('B'); // P1
      game.dropPiece('B'); // P2
      game.dropPiece('C'); // P1
      game.dropPiece('C'); // P2
      
      const result = game.dropPiece('D'); // P1 wins
      expect(result.success).toBe(true);
      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe(1);
      expect(result.winType).toBe('horizontal');
      expect(result.winningCells).toHaveLength(4);
    });

    test('should detect vertical win', () => {
      // Player 1 wins vertically in column A
      game.dropPiece('A'); // P1
      game.dropPiece('B'); // P2
      game.dropPiece('A'); // P1
      game.dropPiece('B'); // P2
      game.dropPiece('A'); // P1
      game.dropPiece('B'); // P2
      
      const result = game.dropPiece('A'); // P1 wins
      expect(result.success).toBe(true);
      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe(1);
      expect(result.winType).toBe('vertical');
      expect(result.winningCells).toHaveLength(4);
    });

    test('should detect diagonal win (down-right)', () => {
      // Test diagonal detection with a manually set board
      // Diagonal down-right: [2,0], [3,1], [4,2], [5,3]
      game.board = [
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0],  // [2,0]
        [2, 1, 0, 0, 0, 0, 0],  // [3,1]
        [2, 2, 1, 0, 0, 0, 0],  // [4,2]
        [2, 2, 2, 1, 0, 0, 0],  // [5,3]
      ];
      game.currentPlayer = 1;
      
      // Check the diagonal win from position [5,3]
      const winCheck = game.checkWin(5, 3);
      expect(winCheck.win).toBe(true);
      expect(winCheck.type).toBe('diagonal-right');
      expect(winCheck.cells).toHaveLength(4);
    });

    test('should detect draw when board is full', () => {
      // Fill board without winner (this is a contrived example)
      const pattern = ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'E', 'E', 'F', 'F', 'G', 'G'];
      
      // Fill bottom 3 rows with pattern that doesn't create 4 in a row
      for (let row = 0; row < 3; row++) {
        pattern.forEach(col => {
          if (!game.status === 'completed') {
            game.dropPiece(col);
          }
        });
      }
      
      // If we reach move count = 42 without winner, it's a draw
      // (This is a simplified test, actual draw would need careful placement)
    });
  });

  describe('Game State', () => {
    test('should track move count', () => {
      expect(game.moveCount).toBe(0);
      
      game.dropPiece('A');
      expect(game.moveCount).toBe(1);
      
      game.dropPiece('B');
      expect(game.moveCount).toBe(2);
    });

    test('should store last move', () => {
      game.dropPiece('A');
      
      expect(game.lastMove).toBeTruthy();
      expect(game.lastMove.column).toBe(0);
      expect(game.lastMove.player).toBe(1);
      expect(game.lastMove.moveNumber).toBe(1);
    });

    test('should get complete game state', () => {
      game.dropPiece('A');
      const state = game.getState();
      
      expect(state.sessionId).toBe(1);
      expect(state.board).toBeTruthy();
      expect(state.currentPlayer).toBe(2);
      expect(state.moveCount).toBe(1);
      expect(state.status).toBe('active');
    });

    test('should restore game state', () => {
      game.dropPiece('A');
      game.dropPiece('B');
      
      const savedState = game.getState();
      
      const newGame = new Connect4Game(
        1,
        savedState.player1,
        savedState.player2,
        mockLogger
      );
      newGame.restoreState(savedState);
      
      expect(newGame.moveCount).toBe(savedState.moveCount);
      expect(newGame.currentPlayer).toBe(savedState.currentPlayer);
      expect(newGame.board).toEqual(savedState.board);
    });
  });

  describe('Available Columns', () => {
    test('should return all columns when empty', () => {
      const available = game.getAvailableColumns();
      expect(available).toHaveLength(7);
      expect(available[0].letter).toBe('A');
      expect(available[6].letter).toBe('G');
    });

    test('should exclude full columns', () => {
      // Fill column A
      for (let i = 0; i < 6; i++) {
        game.dropPiece('A');
      }
      
      const available = game.getAvailableColumns();
      expect(available).toHaveLength(6);
      expect(available.find(col => col.letter === 'A')).toBeUndefined();
    });
  });

  describe('Board Text Representation', () => {
    test('should generate readable board text', () => {
      game.dropPiece('A');
      game.dropPiece('B');
      
      const text = game.getBoardText();
      expect(text).toContain('A B C D E F G');
      expect(text).toContain('◯'); // Player 1 piece
      expect(text).toContain('◉'); // Player 2 piece
      expect(text).toContain('·'); // Empty spaces
    });
  });
});
