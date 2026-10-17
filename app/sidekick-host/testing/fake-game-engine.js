'use strict';

// In-memory stand-in for the game-engine Connect4 manual routes.
// Not production code. It uses the real Connect4Game logic so the adapter is
// exercised against the actual rules. Nothing here opens a socket or reads a key.
const Connect4Game = require('../../plugins/game-engine/games/connect4');

const SILENT_LOGGER = { info() {}, warn() {}, error() {}, debug() {} };

function createFakeGameEngine() {
  const sessions = new Map();
  let nextId = 1;

  function reject(status, error) {
    return { status, body: { success: false, error } };
  }

  function start(body) {
    if (sessions.size > 0) return reject(400, 'Game already active');

    const sessionId = nextId++;
    const opponentType = body?.opponentType === 'bot' ? 'bot' : 'manual';
    const player1Name = body?.player1Name || 'Test Player 1';
    const player2Name = body?.player2Name || (opponentType === 'bot' ? 'Bot' : 'Test Player 2');
    const player1 = { username: player1Name, role: 'test_player', color: '#E74C3C', nickname: player1Name };
    const player2 = {
      username: player2Name,
      role: opponentType === 'bot' ? 'bot' : 'test_player',
      color: '#F1C40F',
      nickname: player2Name
    };

    sessions.set(sessionId, new Connect4Game(sessionId, player1, player2, SILENT_LOGGER));
    return {
      status: 200,
      body: {
        success: true,
        sessionId,
        gameType: 'connect4',
        message: `Manual game started: ${player1Name} vs ${player2Name}`
      }
    };
  }

  function move(body) {
    const { sessionId, player, column } = body || {};
    if (!sessionId) return reject(400, 'Session ID required');
    if (typeof column !== 'string' || !/^[A-G]$/i.test(column)) return reject(400, 'Invalid column. Use A-G.');

    const game = sessions.get(sessionId);
    if (!game) return reject(404, 'Game not found or already ended');

    const currentPlayer = game.currentPlayer;
    if (player && currentPlayer !== player) {
      return { status: 200, body: { success: false, error: `It's player ${currentPlayer}'s turn, not player ${player}` } };
    }

    const result = game.dropPiece(column.toUpperCase());
    if (!result.success) return { status: 200, body: result };
    if (result.gameOver) sessions.delete(sessionId);

    return {
      status: 200,
      body: {
        success: true,
        result,
        message: result.gameOver
          ? (result.draw ? 'Game ended in a draw!' : `Player ${result.winner} won!`)
          : 'Move made successfully!',
        nextPlayer: game.currentPlayer
      }
    };
  }

  async function request({ method, path, body } = {}) {
    if (method === 'POST' && path === '/api/game-engine/manual/start') return start(body);
    if (method === 'POST' && path === '/api/game-engine/manual/move') return move(body);
    return reject(404, 'Unknown game-engine route');
  }

  return {
    request,
    activeSessions() {
      return sessions.size;
    }
  };
}

module.exports = { createFakeGameEngine };
