'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'game-engine',
  route: '/plugins/game-engine/ui.html',
  topic: ['Spielmodus, Queue und Geschenk- oder Chat-Trigger', 'game mode, queue, and gift or chat trigger', 'modo de juego, cola y disparador de regalo o chat', 'mode de jeu, file et déclencheur cadeau ou chat'],
  test: ['eine lokale Runde im Testmodus', 'a local test round', 'una ronda local en modo de prueba', 'une manche locale en mode test'],
  expected: ['die Testqueue wird abgearbeitet und die Spielansicht aktualisiert sich', 'the test queue is processed and the game view updates', 'la cola de prueba se procesa y la vista del juego se actualiza', 'la file de test est traitée et la vue de jeu se met à jour'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/game-engine/overlay/game-hud.html', related: ['coinbattle', 'quiz-show', 'gcce'] }
});
