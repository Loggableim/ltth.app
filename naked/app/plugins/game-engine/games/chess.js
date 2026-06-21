/**
 * Chess (Blitzschach) Game Logic
 * 
 * Blitz chess game with timer system for 1v1 matches (Streamer vs Viewer or Viewer vs Viewer).
 * Supports time controls like 3+0, 3+2, 5+0 with precise chess clocks.
 */

const { Chess } = require('chess.js');

class ChessGame {
  constructor(sessionId, player1, player2, timeControl, logger) {
    this.sessionId = sessionId;
    this.player1 = player1; // { username, role: 'streamer' | 'viewer', color: '#color', side: 'white' | 'black' }
    this.player2 = player2; // { username, role: 'streamer' | 'viewer', color: '#color', side: 'white' | 'black' }
    this.logger = logger;
    
    // Initialize chess.js instance for move validation
    this.chess = new Chess();
    
    // Parse time control (e.g., "3+0", "3+2", "5+0")
    // Format: "initialMinutes+incrementSeconds"
    const [initialMinutes, increment] = timeControl.split('+').map(Number);
    this.timeControl = {
      initial: initialMinutes * 60 * 1000, // Convert to milliseconds
      increment: increment * 1000 // Convert to milliseconds
    };
    
    // Timer state (in milliseconds)
    this.timers = {
      white: this.timeControl.initial,
      black: this.timeControl.initial
    };
    
    // Track when the last move was made (for timer calculation)
    this.lastMoveTime = null;
    this.timerInterval = null;
    
    // Game state
    this.currentPlayer = 'white'; // 'white' or 'black'
    this.moveCount = 0;
    this.winner = null;
    this.winReason = null; // 'checkmate', 'timeout', 'resignation', 'draw'
    this.status = 'active';
    this.lastMove = null;
    this.moveHistory = []; // Array of { san, uci, fen, timeLeft }
    
    // Ensure players have correct sides assigned
    if (this.player1.side === 'white') {
      this.whitePlayer = this.player1;
      this.blackPlayer = this.player2;
    } else {
      this.whitePlayer = this.player2;
      this.blackPlayer = this.player1;
    }
  }

  /**
   * Start the game timer
   */
  startTimer() {
    this.lastMoveTime = Date.now();
    this.updateTimer();
  }

  /**
   * Update timer (called every 100ms)
   */
  updateTimer() {
    if (this.status !== 'active' || !this.lastMoveTime) {
      return;
    }
    
    const now = Date.now();
    const elapsed = now - this.lastMoveTime;
    this.lastMoveTime = now;
    
    // Deduct time from current player
    this.timers[this.currentPlayer] -= elapsed;
    
    // Check for timeout
    if (this.timers[this.currentPlayer] <= 0) {
      this.timers[this.currentPlayer] = 0;
      this.handleTimeout();
    }
  }

  /**
   * Handle timeout (player runs out of time)
   */
  handleTimeout() {
    this.status = 'completed';
    this.winner = this.currentPlayer === 'white' ? 'black' : 'white';
    this.winReason = 'timeout';
    
    this.logger.info(`Chess game #${this.sessionId}: ${this.currentPlayer} timed out, ${this.winner} wins`);
  }

  /**
   * Stop the timer
   */
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Get current player info
   */
  getCurrentPlayerInfo() {
    return this.currentPlayer === 'white' ? this.whitePlayer : this.blackPlayer;
  }

  /**
   * Get opponent player info
   */
  getOpponentPlayerInfo() {
    return this.currentPlayer === 'white' ? this.blackPlayer : this.whitePlayer;
  }

  /**
   * Parse and validate a chess move
   * Accepts SAN (e4, Nf3, O-O) or UCI (e2e4, g1f3) format
   */
  parseMove(moveInput) {
    try {
      // Try to parse as SAN first
      let move = this.chess.move(moveInput, { sloppy: true });
      
      if (move) {
        return {
          success: true,
          san: move.san,
          uci: move.from + move.to + (move.promotion || ''),
          from: move.from,
          to: move.to,
          piece: move.piece,
          captured: move.captured,
          promotion: move.promotion,
          flags: move.flags
        };
      }
      
      // If SAN parsing failed, try UCI format (e.g., "e2e4")
      if (moveInput.length >= 4) {
        const from = moveInput.substring(0, 2);
        const to = moveInput.substring(2, 4);
        const promotion = moveInput.length > 4 ? moveInput[4] : undefined;
        
        move = this.chess.move({
          from: from,
          to: to,
          promotion: promotion
        });
        
        if (move) {
          return {
            success: true,
            san: move.san,
            uci: move.from + move.to + (move.promotion || ''),
            from: move.from,
            to: move.to,
            piece: move.piece,
            captured: move.captured,
            promotion: move.promotion,
            flags: move.flags
          };
        }
      }
      
      return { success: false, error: 'Invalid move' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Make a move in the game
   */
  makeMove(moveInput, playerUsername) {
    // Validate it's the correct player's turn
    const currentPlayer = this.getCurrentPlayerInfo();
    if (currentPlayer.username !== playerUsername) {
      return { 
        success: false, 
        error: 'Not your turn' 
      };
    }
    
    // Validate and make the move
    const moveResult = this.parseMove(moveInput);
    
    if (!moveResult.success) {
      return moveResult;
    }
    
    // Update timer (add increment and switch player)
    this.updateTimer();
    this.timers[this.currentPlayer] += this.timeControl.increment;
    
    // Record move
    this.moveCount++;
    this.lastMove = {
      player: this.currentPlayer,
      username: playerUsername,
      san: moveResult.san,
      uci: moveResult.uci,
      from: moveResult.from,
      to: moveResult.to,
      piece: moveResult.piece,
      captured: moveResult.captured,
      promotion: moveResult.promotion,
      moveNumber: this.moveCount,
      timeLeft: {
        white: this.timers.white,
        black: this.timers.black
      }
    };
    
    this.moveHistory.push({
      san: moveResult.san,
      uci: moveResult.uci,
      fen: this.chess.fen(),
      timeLeft: { ...this.timers }
    });
    
    // Check game end conditions
    const gameResult = this.checkGameEnd();
    
    if (gameResult.gameOver) {
      this.status = 'completed';
      this.stopTimer();
      
      return {
        success: true,
        move: this.lastMove,
        gameOver: true,
        winner: gameResult.winner,
        winReason: gameResult.reason,
        fen: this.chess.fen(),
        pgn: this.chess.pgn(),
        capturedPieces: this.getCapturedPieces()
      };
    }
    
    // Switch player
    this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
    this.lastMoveTime = Date.now();
    
    return {
      success: true,
      move: this.lastMove,
      gameOver: false,
      nextPlayer: this.currentPlayer,
      fen: this.chess.fen(),
      inCheck: this.chess.inCheck(),
      capturedPieces: this.getCapturedPieces()
    };
  }

  /**
   * Check for game end conditions
   */
  checkGameEnd() {
    // Checkmate
    if (this.chess.isCheckmate()) {
      return {
        gameOver: true,
        winner: this.currentPlayer === 'white' ? 'black' : 'white',
        reason: 'checkmate'
      };
    }
    
    // Stalemate
    if (this.chess.isStalemate()) {
      return {
        gameOver: true,
        winner: null,
        reason: 'stalemate'
      };
    }
    
    // Draw by threefold repetition
    if (this.chess.isThreefoldRepetition()) {
      return {
        gameOver: true,
        winner: null,
        reason: 'repetition'
      };
    }
    
    // Draw by insufficient material
    if (this.chess.isInsufficientMaterial()) {
      return {
        gameOver: true,
        winner: null,
        reason: 'insufficient_material'
      };
    }
    
    // Draw by 50-move rule
    if (this.chess.isDraw()) {
      return {
        gameOver: true,
        winner: null,
        reason: 'fifty_move_rule'
      };
    }
    
    return { gameOver: false };
  }

  /**
   * Resign the game
   */
  resign(playerUsername) {
    const currentPlayer = this.getCurrentPlayerInfo();
    const opponent = this.getOpponentPlayerInfo();
    
    let resigningSide;
    if (currentPlayer.username === playerUsername) {
      resigningSide = this.currentPlayer;
    } else if (opponent.username === playerUsername) {
      resigningSide = this.currentPlayer === 'white' ? 'black' : 'white';
    } else {
      return { success: false, error: 'Player not in game' };
    }
    
    this.status = 'completed';
    this.winner = resigningSide === 'white' ? 'black' : 'white';
    this.winReason = 'resignation';
    this.stopTimer();
    
    return {
      success: true,
      gameOver: true,
      winner: this.winner,
      winReason: 'resignation',
      resignedPlayer: resigningSide
    };
  }

  /**
   * Offer or accept a draw
   */
  offerDraw(playerUsername) {
    // For simplicity, auto-accept draws in this version
    this.status = 'completed';
    this.winner = null;
    this.winReason = 'draw_agreement';
    this.stopTimer();
    
    return {
      success: true,
      gameOver: true,
      winner: null,
      winReason: 'draw_agreement'
    };
  }

  /**
   * Get captured pieces
   */
  getCapturedPieces() {
    const captured = {
      white: { p: 0, n: 0, b: 0, r: 0, q: 0 },
      black: { p: 0, n: 0, b: 0, r: 0, q: 0 }
    };
    
    for (const move of this.moveHistory) {
      // Parse the move from history
      const tempChess = new Chess();
      const moves = this.moveHistory.slice(0, this.moveHistory.indexOf(move));
      for (const m of moves) {
        tempChess.move(m.san);
      }
      const moveObj = tempChess.move(move.san);
      
      if (moveObj && moveObj.captured) {
        const capturingSide = moveObj.color === 'w' ? 'white' : 'black';
        captured[capturingSide][moveObj.captured]++;
      }
    }
    
    return captured;
  }

  /**
   * Get legal moves for current position
   */
  getLegalMoves() {
    return this.chess.moves({ verbose: true });
  }

  /**
   * Get game state for storage/transmission
   */
  getState() {
    return {
      sessionId: this.sessionId,
      fen: this.chess.fen(),
      pgn: this.chess.pgn(),
      currentPlayer: this.currentPlayer,
      whitePlayer: this.whitePlayer,
      blackPlayer: this.blackPlayer,
      timers: { ...this.timers },
      timeControl: this.timeControl,
      moveCount: this.moveCount,
      winner: this.winner,
      winReason: this.winReason,
      status: this.status,
      lastMove: this.lastMove,
      moveHistory: this.moveHistory,
      inCheck: this.chess.inCheck(),
      capturedPieces: this.getCapturedPieces()
    };
  }

  /**
   * Restore game state from saved data
   */
  restoreState(state) {
    this.chess.load(state.fen);
    this.currentPlayer = state.currentPlayer;
    this.timers = { ...state.timers };
    this.moveCount = state.moveCount;
    this.winner = state.winner;
    this.winReason = state.winReason;
    this.status = state.status;
    this.lastMove = state.lastMove;
    this.moveHistory = state.moveHistory;
    
    if (this.status === 'active') {
      this.startTimer();
    }
  }

  /**
   * Get board as FEN string
   */
  getFEN() {
    return this.chess.fen();
  }

  /**
   * Get PGN (Portable Game Notation)
   */
  getPGN() {
    return this.chess.pgn();
  }

  /**
   * Get ASCII representation of the board (for debugging)
   */
  getASCII() {
    return this.chess.ascii();
  }
}

module.exports = ChessGame;
