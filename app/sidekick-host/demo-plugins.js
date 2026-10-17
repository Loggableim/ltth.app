'use strict';

const { createPluginPort } = require('./plugin-port');
const { createMusicBotAdapter } = require('./adapters/music-bot-adapter');
const { createConnect4Adapter } = require('./adapters/connect4-adapter');
const { createFakeMusicBot } = require('./testing/fake-music-bot');
const { createFakeGameEngine } = require('./testing/fake-game-engine');

// Fallback requester used only when a chat event carries no identity. HostCore now
// forwards the chat user through port.handle so per-viewer cooldowns and limits apply.
const DEFAULT_REQUESTED_BY = 'viewer_01';
const SONG_ACCEPTED = 'Song-Wunsch angenommen. Die Warteschlange ist aktualisiert.';

function createSongAdapter(options) {
  if (options.adapter) return options.adapter;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  return createMusicBotAdapter({
    transport: createFakeMusicBot({ now }).request
  });
}

function createConnect4(options) {
  if (options.connect4Adapter) return options.connect4Adapter;
  return createConnect4Adapter({ transport: createFakeGameEngine().request });
}

// Demo plugins. Each returns plain text only.
// !song goes through the Music-Bot adapter. !sound does not enqueue.
function createDemoPorts(options = {}) {
  const adapter = createSongAdapter(options);
  const connect4Adapter = createConnect4(options);
  const fallbackRequestedBy = typeof options.requestedBy === 'string' && options.requestedBy
    ? options.requestedBy
    : DEFAULT_REQUESTED_BY;

  // TODO(quiz): no start-question or check-answer surface exists for quiz-show.
  // Start/next/stop are Socket.IO only and answers are internal TikTok chat
  // events with no ack. Keep the stub until the plugin exposes a request/response
  // surface. Details in GAP.md.
  const quiz = createPluginPort({
    id: 'quiz-show',
    commands: ['!quiz'],
    handle: async () => ({ text: 'Quiz: Welche Farbe hat der Himmel bei klarem Tag? Antwort im Chat.' })
  });
  const music = createPluginPort({
    id: 'music-sound',
    commands: ['!song', '!sound'],
    handle: async (command, args, context) => {
      if (command !== '!song') return { text: 'Sound abgespielt.' };
      const query = Array.isArray(args) && typeof args[0] === 'string' ? args[0] : '';
      const requestedBy = typeof context?.user === 'string' && context.user
        ? context.user
        : fallbackRequestedBy;
      const result = await adapter.enqueue({ query, requestedBy });
      if (result && result.ok) return { text: SONG_ACCEPTED };
      const text = result && typeof result.text === 'string' && result.text
        ? result.text
        : 'Song-Wunsch abgelehnt.';
      return { text };
    }
  });
  // !connect4 without a column starts a game. With a column (A-G) it drops a
  // piece for the player whose turn it is. Game-engine sessions are created
  // through the adapter, never directly.
  let connect4SessionId = null;
  const connect4 = createPluginPort({
    id: 'connect4',
    commands: ['!connect4'],
    handle: async (command, args) => {
      const column = Array.isArray(args) && typeof args[0] === 'string' && /^[a-g]$/.test(args[0])
        ? args[0].toUpperCase()
        : null;

      if (connect4SessionId === null) {
        const started = await connect4Adapter.start({ player1Name: 'Streamer', player2Name: 'Chat' });
        if (!started.ok) return { text: started.text };
        connect4SessionId = started.sessionId;
        return { text: 'Vier gewinnt gestartet. Zug mit !connect4 A-G.' };
      }

      if (!column) return { text: 'Vier gewinnt läuft. Zug mit !connect4 A-G.' };

      const moved = await connect4Adapter.move({ sessionId: connect4SessionId, column });
      if (!moved.ok) return { text: moved.text };

      if (moved.gameOver) {
        connect4SessionId = null;
        if (moved.draw) return { text: 'Vier gewinnt: Unentschieden.' };
        return { text: `Vier gewinnt: Spieler ${moved.winner} gewinnt.` };
      }

      return { text: `Zug gesetzt. Spieler ${moved.nextPlayer} ist am Zug.` };
    }
  });
  return [quiz, music, connect4];
}

module.exports = { createDemoPorts, DEFAULT_REQUESTED_BY, SONG_ACCEPTED };
