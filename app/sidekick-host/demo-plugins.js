'use strict';

const { createPluginPort } = require('./plugin-port');
const { createMusicBotAdapter } = require('./adapters/music-bot-adapter');
const { createFakeMusicBot } = require('./testing/fake-music-bot');

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

// Demo plugins. Each returns plain text only.
// !song goes through the Music-Bot adapter. !sound does not enqueue.
function createDemoPorts(options = {}) {
  const adapter = createSongAdapter(options);
  const fallbackRequestedBy = typeof options.requestedBy === 'string' && options.requestedBy
    ? options.requestedBy
    : DEFAULT_REQUESTED_BY;

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
  const connect4 = createPluginPort({
    id: 'connect4',
    commands: ['!connect4'],
    handle: async () => ({ text: 'Vier gewinnt startet. Wer macht den ersten Zug?' })
  });
  return [quiz, music, connect4];
}

module.exports = { createDemoPorts, DEFAULT_REQUESTED_BY, SONG_ACCEPTED };
