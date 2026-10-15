'use strict';

const { createPluginPort } = require('./plugin-port');

// Demo plugins. Each returns plain text only.
function createDemoPorts() {
  const quiz = createPluginPort({
    id: 'quiz-show',
    commands: ['!quiz'],
    handle: async () => ({ text: 'Quiz: Welche Farbe hat der Himmel bei klarem Tag? Antwort im Chat.' })
  });
  const music = createPluginPort({
    id: 'music-sound',
    commands: ['!song', '!sound'],
    handle: async (command) => ({
      text: command === '!song' ? 'Song-Wunsch angenommen. Die Warteschlange ist aktualisiert.' : 'Sound abgespielt.'
    })
  });
  const connect4 = createPluginPort({
    id: 'connect4',
    commands: ['!connect4'],
    handle: async () => ({ text: 'Vier gewinnt startet. Wer macht den ersten Zug?' })
  });
  return [quiz, music, connect4];
}

module.exports = { createDemoPorts };
