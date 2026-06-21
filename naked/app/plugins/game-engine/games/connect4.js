/**
 * Connect4 (Vier Gewinnt) Game Logic
 * 
 * Classic Connect4 game with 7 columns (A-G) and 6 rows.
 * Players alternate dropping pieces, trying to get 4 in a row.
 */

class Connect4Game {
  constructor(sessionId, player1, player2, logger) {
    this.sessionId = sessionId;
    this.player1 = player1; // { username, role: 'streamer' | 'viewer', color: '#color' }
    this.player2 = player2; // { username, role: 'streamer' | 'viewer', color: '#color' }
    this.logger = logger;
    
    // Game constants
    this.COLUMNS = 7; // A-G
    this.ROWS = 6;
    this.COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    
    // Initialize empty board (0 = empty, 1 = player1, 2 = player2)
    this.board = Array(this.ROWS).fill(null).map(() => Array(this.COLUMNS).fill(0));
    
    // Game state
    this.currentPlayer = 1; // 1 or 2
    this.moveCount = 0;
    this.winner = null;
    this.winningCells = [];
    this.status = 'active';
    this.lastMove = null;
  }

  /**
   * Get current player info
   */
  getCurrentPlayerInfo() {
    return this.currentPlayer === 1 ? this.player1 : this.player2;
  }

  /**
   * Convert column letter to index (A=0, B=1, etc.)
   */
  columnLetterToIndex(letter) {
    const upperLetter = letter.toUpperCase();
    const index = this.COLUMN_LETTERS.indexOf(upperLetter);
    return index >= 0 ? index : null;
  }

  /**
   * Convert column index to letter
   */
  columnIndexToLetter(index) {
    return this.COLUMN_LETTERS[index] || null;
  }

  /**
   * Check if a column is valid and not full
   */
  isValidColumn(columnIndex) {
    if (columnIndex < 0 || columnIndex >= this.COLUMNS) {
      return false;
    }
    
    // Check if top row is empty
    return this.board[0][columnIndex] === 0;
  }

  /**
   * Drop a piece in a column
   */
  dropPiece(columnInput) {
    // Convert letter to index if needed
    let columnIndex;
    if (typeof columnInput === 'string') {
      columnIndex = this.columnLetterToIndex(columnInput);
      if (columnIndex === null) {
        return { success: false, error: 'Invalid column letter' };
      }
    } else {
      columnIndex = columnInput;
    }

    // Validate column
    if (!this.isValidColumn(columnIndex)) {
      return { success: false, error: 'Column is full or invalid' };
    }

    // Find the lowest empty row in this column
    let rowIndex = this.ROWS - 1;
    while (rowIndex >= 0 && this.board[rowIndex][columnIndex] !== 0) {
      rowIndex--;
    }

    // Place the piece
    this.board[rowIndex][columnIndex] = this.currentPlayer;
    this.moveCount++;
    
    this.lastMove = {
      player: this.currentPlayer,
      column: columnIndex,
      row: rowIndex,
      moveNumber: this.moveCount
    };

    // Check for win
    const winCheck = this.checkWin(rowIndex, columnIndex);
    if (winCheck.win) {
      this.winner = this.currentPlayer;
      this.winningCells = winCheck.cells;
      this.status = 'completed';
      
      return {
        success: true,
        move: this.lastMove,
        gameOver: true,
        winner: this.currentPlayer,
        winningCells: this.winningCells,
        winType: winCheck.type
      };
    }

    // Check for draw (board full)
    if (this.moveCount >= this.ROWS * this.COLUMNS) {
      this.status = 'completed';
      return {
        success: true,
        move: this.lastMove,
        gameOver: true,
        draw: true
      };
    }

    // Switch player
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;

    return {
      success: true,
      move: this.lastMove,
      gameOver: false,
      nextPlayer: this.currentPlayer
    };
  }

  /**
   * Check for win condition from a specific position
   */
  checkWin(row, col) {
    const player = this.board[row][col];
    
    // Check all 4 directions: horizontal, vertical, diagonal-right, diagonal-left
    const directions = [
      { dr: 0, dc: 1 },  // Horizontal
      { dr: 1, dc: 0 },  // Vertical
      { dr: 1, dc: 1 },  // Diagonal down-right
      { dr: 1, dc: -1 }  // Diagonal down-left
    ];

    for (const { dr, dc } of directions) {
      const cells = this.checkDirection(row, col, dr, dc, player);
      if (cells.length >= 4) {
        return {
          win: true,
          cells: cells,
          type: this.getWinType(dr, dc)
        };
      }
    }

    return { win: false };
  }

  /**
   * Check a specific direction for consecutive pieces
   */
  checkDirection(row, col, dr, dc, player) {
    const cells = [[row, col]];
    
    // Check positive direction
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < this.ROWS && c >= 0 && c < this.COLUMNS && this.board[r][c] === player) {
      cells.push([r, c]);
      r += dr;
      c += dc;
    }
    
    // Check negative direction
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < this.ROWS && c >= 0 && c < this.COLUMNS && this.board[r][c] === player) {
      cells.unshift([r, c]);
      r -= dr;
      c -= dc;
    }
    
    return cells;
  }

  /**
   * Get win type name from direction
   */
  getWinType(dr, dc) {
    if (dr === 0) return 'horizontal';
    if (dc === 0) return 'vertical';
    if (dr === 1 && dc === 1) return 'diagonal-right';
    if (dr === 1 && dc === -1) return 'diagonal-left';
    return 'unknown';
  }

  /**
   * Get game state for storage/transmission
   */
  getState() {
    return {
      sessionId: this.sessionId,
      board: this.board,
      currentPlayer: this.currentPlayer,
      player1: this.player1,
      player2: this.player2,
      moveCount: this.moveCount,
      winner: this.winner,
      winningCells: this.winningCells,
      status: this.status,
      lastMove: this.lastMove
    };
  }

  /**
   * Restore game state from saved data
   */
  restoreState(state) {
    this.board = state.board;
    this.currentPlayer = state.currentPlayer;
    this.moveCount = state.moveCount;
    this.winner = state.winner;
    this.winningCells = state.winningCells;
    this.status = state.status;
    this.lastMove = state.lastMove;
  }

  /**
   * Get board as text representation (for debugging)
   */
  getBoardText() {
    let text = '  A B C D E F G\n';
    for (let r = 0; r < this.ROWS; r++) {
      text += `${r + 1} `;
      for (let c = 0; c < this.COLUMNS; c++) {
        const cell = this.board[r][c];
        text += cell === 0 ? '· ' : (cell === 1 ? '◯ ' : '◉ ');
      }
      text += '\n';
    }
    return text;
  }

  /**
   * Get available columns
   */
  getAvailableColumns() {
    const available = [];
    for (let c = 0; c < this.COLUMNS; c++) {
      if (this.isValidColumn(c)) {
        available.push({
          index: c,
          letter: this.columnIndexToLetter(c)
        });
      }
    }
    return available;
  }
}

module.exports = Connect4Game;
