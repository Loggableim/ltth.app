class InteractiveGameAdapter {
  constructor(gameType, game) {
    this.gameType = gameType;
    this.game = game;
  }

  getState() {
    return this.game.getState();
  }

  restoreState(state) {
    this.game.restoreState(state);
    if (this.gameType === 'chess') {
      this.game.stopTimer?.();
      this.game.lastMoveTime = null;
    }
  }

  getCurrentTurnRole() {
    const role = this.game.getCurrentPlayerInfo()?.role;
    return role === 'streamer' ? 'host' : role;
  }

  _moveValue(move) {
    if (this.gameType === 'connect4') return move?.column ?? move;
    return move?.move ?? move?.san ?? move?.uci ?? move;
  }

  applyViewerMove(move, viewerId) {
    const current = this.game.getCurrentPlayerInfo();
    if (current?.role !== 'viewer' || current.username !== viewerId) {
      return { success: false, error: 'Move does not belong to this viewer turn' };
    }
    return this.gameType === 'connect4'
      ? this.game.dropPiece(this._moveValue(move))
      : this.game.makeMove(this._moveValue(move), viewerId);
  }

  applyHostMove(move) {
    const current = this.game.getCurrentPlayerInfo();
    if (current?.role !== 'streamer') {
      return { success: false, error: 'It is not the host turn' };
    }
    return this.gameType === 'connect4'
      ? this.game.dropPiece(this._moveValue(move))
      : this.game.makeMove(this._moveValue(move), current.username);
  }

  isComplete() {
    return this.game.status === 'completed';
  }

  getResult() {
    if (!this.isComplete()) return null;
    const state = this.getState();
    if (this.gameType === 'connect4') {
      return {
        winner: state.winner,
        draw: !state.winner,
        reason: state.winner ? 'win' : 'draw'
      };
    }
    return {
      winner: state.winner,
      draw: !state.winner,
      reason: state.winReason || (state.winner ? 'win' : 'draw')
    };
  }
}

function createInteractiveAdapter(gameType, game) {
  if (!['connect4', 'chess'].includes(gameType)) {
    throw new Error(`Unsupported interactive game type: ${gameType}`);
  }
  if (!game || typeof game.getState !== 'function') {
    throw new Error(`Invalid ${gameType} game instance`);
  }
  return new InteractiveGameAdapter(gameType, game);
}

module.exports = {
  InteractiveGameAdapter,
  createInteractiveAdapter
};
