'use strict';

// Host port to the game-engine Connect4 manual routes. transport is injected.
// No network, no socket, no HostCore import. Failures stay inside { ok: false }.
const COLUMN_PATTERN = /^[A-G]$/i;
const OPPONENT_TYPES = new Set(['manual', 'bot']);

function fail(code, text) {
  return { ok: false, code, text };
}

function createConnect4Adapter({ transport } = {}) {
  if (typeof transport !== 'function') {
    throw new Error('connect4 adapter: transport is required');
  }

  async function call(method, path, body) {
    try {
      return await transport({ method, path, body });
    } catch {
      return null;
    }
  }

  return {
    async start({ opponentType = 'manual', player1Name, player2Name } = {}) {
      if (!OPPONENT_TYPES.has(opponentType)) {
        return fail('invalid-opponent', 'Ungültiger Gegnertyp.');
      }
      const body = { gameType: 'connect4', opponentType };
      if (typeof player1Name === 'string' && player1Name.trim()) body.player1Name = player1Name.trim();
      if (typeof player2Name === 'string' && player2Name.trim()) body.player2Name = player2Name.trim();

      const response = await call('POST', '/api/game-engine/manual/start', body);
      if (!response) return fail('engine', 'Die Spiel-Engine ist nicht erreichbar.');
      if (response.status === 200 && response.body?.success && Number.isInteger(response.body.sessionId)) {
        return { ok: true, sessionId: response.body.sessionId, gameType: response.body.gameType || 'connect4' };
      }
      const message = response.body?.error || 'Vier gewinnt konnte nicht gestartet werden.';
      if (/already active/i.test(message)) return fail('active', 'Es läuft bereits ein Spiel.');
      if (/challenge pending/i.test(message)) return fail('pending', 'Es wartet bereits eine Herausforderung.');
      return fail('engine', message);
    },

    async move({ sessionId, player, column } = {}) {
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return fail('no-session', 'Keine laufende Session.');
      }
      if (typeof column !== 'string' || !COLUMN_PATTERN.test(column)) {
        return fail('invalid-column', 'Ungültige Spalte. Erlaubt: A-G.');
      }
      if (player !== undefined && player !== 1 && player !== 2) {
        return fail('invalid-player', 'Ungültiger Spieler.');
      }

      const body = { sessionId, column: column.toUpperCase() };
      if (player !== undefined) body.player = player;

      const response = await call('POST', '/api/game-engine/manual/move', body);
      if (!response) return fail('engine', 'Die Spiel-Engine ist nicht erreichbar.');
      if (response.status === 404) return fail('no-session', 'Das Spiel ist nicht mehr aktiv.');

      const payload = response.body || {};
      if (response.status !== 200 || !payload.success) {
        return fail('move', payload.error || 'Zug nicht möglich.');
      }

      const result = payload.result || {};
      return {
        ok: true,
        column: result.move?.column ?? null,
        row: result.move?.row ?? null,
        player: result.move?.player ?? null,
        gameOver: Boolean(result.gameOver),
        winner: result.winner ?? null,
        draw: Boolean(result.draw),
        nextPlayer: payload.nextPlayer ?? null,
        message: payload.message || ''
      };
    }
  };
}

module.exports = { createConnect4Adapter };
