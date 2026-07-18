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
    if (this.status !== 'active') {
      return { success: false, error: 'Game is already completed' };
    }

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
    const restored = this._validateRestoredState(state);
    this.player1 = restored.player1;
    this.player2 = restored.player2;
    this.board = restored.board;
    this.currentPlayer = restored.currentPlayer;
    this.moveCount = restored.moveCount;
    this.winner = restored.winner;
    this.winningCells = restored.winningCells;
    this.status = restored.status;
    this.lastMove = restored.lastMove;
  }

  _getBoardWinningPlayers(board) {
    const winners = new Set();
    const directions = [
      { dr: 0, dc: 1 },
      { dr: 1, dc: 0 },
      { dr: 1, dc: 1 },
      { dr: 1, dc: -1 }
    ];
    for (let row = 0; row < this.ROWS; row++) {
      for (let column = 0; column < this.COLUMNS; column++) {
        const player = board[row][column];
        if (player === 0) continue;
        for (const { dr, dc } of directions) {
          const endRow = row + (dr * 3);
          const endColumn = column + (dc * 3);
          if (endRow < 0 || endRow >= this.ROWS || endColumn < 0 || endColumn >= this.COLUMNS) continue;
          if ([1, 2, 3].every(step => board[row + (dr * step)][column + (dc * step)] === player)) {
            winners.add(player);
          }
        }
      }
    }
    return winners;
  }

  _validateRestoredState(state) {
    const invalid = reason => {
      throw new Error(`Invalid Connect4 state: ${reason}`);
    };
    if (!state || typeof state !== 'object' || Array.isArray(state)) invalid('state must be an object');

    const players = [state.player1, state.player2];
    if (players.some(player => !player || typeof player !== 'object' || Array.isArray(player))) {
      invalid('players are required');
    }
    if (players.some(player => typeof player.username !== 'string' || !player.username.trim())) {
      invalid('player usernames are required');
    }
    const roles = players.map(player => player.role);
    if (roles.filter(role => role === 'streamer').length !== 1 || roles.filter(role => role === 'viewer').length !== 1) {
      invalid('players must include one streamer and one viewer');
    }

    if (!Array.isArray(state.board) || state.board.length !== this.ROWS ||
      state.board.some(row => !Array.isArray(row) || row.length !== this.COLUMNS)) {
      invalid('board must be 6 by 7');
    }

    let player1Pieces = 0;
    let player2Pieces = 0;
    for (let column = 0; column < this.COLUMNS; column++) {
      let sawEmptyBelow = false;
      for (let row = this.ROWS - 1; row >= 0; row--) {
        const cell = state.board[row][column];
        if (!Number.isInteger(cell) || ![0, 1, 2].includes(cell)) invalid('board contains an invalid cell');
        if (cell === 0) {
          sawEmptyBelow = true;
        } else {
          if (sawEmptyBelow) invalid('board contains floating pieces');
          if (cell === 1) player1Pieces += 1;
          if (cell === 2) player2Pieces += 1;
        }
      }
    }
    const occupied = player1Pieces + player2Pieces;
    const boardWinners = this._getBoardWinningPlayers(state.board);
    if (!Number.isInteger(state.moveCount) || state.moveCount !== occupied) invalid('move count does not match occupancy');
    if (player1Pieces < player2Pieces || player1Pieces > player2Pieces + 1) invalid('player move counts are invalid');
    if (![1, 2].includes(state.currentPlayer)) invalid('current player is invalid');
    if (!['active', 'completed'].includes(state.status)) invalid('status is invalid');
    if (state.winner !== null && ![1, 2].includes(state.winner)) invalid('winner is invalid');

    const expectedLastPlayer = player1Pieces === player2Pieces ? 2 : 1;
    const lastMove = state.lastMove;
    if (occupied === 0) {
      if (state.lastMove !== null) invalid('empty games cannot have a last move');
    } else {
      const move = lastMove;
      if (!move || typeof move !== 'object' || ![1, 2].includes(move.player) ||
        !Number.isInteger(move.row) || !Number.isInteger(move.column) ||
        !Number.isInteger(move.moveNumber) || move.moveNumber !== occupied ||
        move.row < 0 || move.row >= this.ROWS || move.column < 0 || move.column >= this.COLUMNS ||
        state.board[move.row][move.column] !== move.player || move.player !== expectedLastPlayer) {
        invalid('last move is invalid');
      }
      for (let row = 0; row < move.row; row++) {
        if (state.board[row][move.column] !== 0) invalid('last move is not the top piece in its column');
      }
    }

    const winningLines = [];
    if (occupied > 0) {
      for (const { dr, dc } of [
        { dr: 0, dc: 1 },
        { dr: 1, dc: 0 },
        { dr: 1, dc: 1 },
        { dr: 1, dc: -1 }
      ]) {
        const cells = [[lastMove.row, lastMove.column]];
        for (const direction of [1, -1]) {
          let row = lastMove.row + (dr * direction);
          let column = lastMove.column + (dc * direction);
          while (row >= 0 && row < this.ROWS && column >= 0 && column < this.COLUMNS &&
            state.board[row][column] === lastMove.player) {
            if (direction === 1) cells.push([row, column]);
            else cells.unshift([row, column]);
            row += dr * direction;
            column += dc * direction;
          }
        }
        winningLines.push(cells);
      }
    }

    if (!Array.isArray(state.winningCells) || state.winningCells.length > 7) invalid('winning cells are invalid');
    const winningCellKeys = new Set();
    for (const cell of state.winningCells) {
      if (!Array.isArray(cell) || cell.length !== 2 || !Number.isInteger(cell[0]) || !Number.isInteger(cell[1]) ||
        cell[0] < 0 || cell[0] >= this.ROWS || cell[1] < 0 || cell[1] >= this.COLUMNS) {
        invalid('winning cells are out of bounds');
      }
      const key = `${cell[0]}:${cell[1]}`;
      if (winningCellKeys.has(key)) invalid('winning cells are duplicated');
      winningCellKeys.add(key);
    }

    if (state.status === 'active') {
      const expectedCurrentPlayer = player1Pieces === player2Pieces ? 1 : 2;
      if (state.winner !== null || state.winningCells.length !== 0 || state.currentPlayer !== expectedCurrentPlayer ||
        occupied === this.ROWS * this.COLUMNS || boardWinners.size !== 0 || winningLines.some(cells => cells.length >= 4)) {
        invalid('active game state is inconsistent');
      }
    } else if (state.winner === null) {
      if (occupied !== this.ROWS * this.COLUMNS || state.winningCells.length !== 0 || state.currentPlayer !== expectedLastPlayer ||
        boardWinners.size !== 0) {
        invalid('completed draw state is inconsistent');
      }
    } else {
      const winningCellsMatch = winningLines.some(cells => cells.length >= 4 && cells.length === state.winningCells.length &&
        cells.every(([row, column]) => winningCellKeys.has(`${row}:${column}`)));
      if (state.currentPlayer !== state.winner || expectedLastPlayer !== state.winner ||
        boardWinners.size !== 1 || !boardWinners.has(state.winner) ||
        state.winningCells.length < 4 || state.winningCells.length > 7 ||
        !winningCellKeys.has(`${state.lastMove.row}:${state.lastMove.column}`) ||
        state.winningCells.some(([row, column]) => state.board[row][column] !== state.winner) || !winningCellsMatch) {
        invalid('completed winner state is inconsistent');
      }
    }

    return {
      player1: { ...state.player1 },
      player2: { ...state.player2 },
      board: state.board.map(row => [...row]),
      currentPlayer: state.currentPlayer,
      moveCount: state.moveCount,
      winner: state.winner,
      winningCells: state.winningCells.map(cell => [...cell]),
      status: state.status,
      lastMove: state.lastMove ? { ...state.lastMove } : null
    };
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
