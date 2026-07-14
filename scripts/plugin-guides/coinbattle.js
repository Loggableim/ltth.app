'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'coinbattle',
  route: '/plugins/coinbattle/ui.html',
  topic: ['Münzwerte, Kampfmodus und Match-Start', 'coin values, battle mode, and match start', 'valores de monedas, modo de batalla e inicio de partida', 'valeurs des pièces, mode de combat et démarrage du match'],
  test: ['ein lokales Testmatch', 'a local test match', 'una partida de prueba local', 'un match de test local'],
  expected: ['die Spielansicht zeigt ein gestartetes Demo-Match ohne LIVE-Ereignis', 'the game view shows a started demo match without a LIVE event', 'la vista de juego muestra una partida demo iniciada sin evento LIVE', 'la vue de jeu montre un match démo démarré sans événement LIVE'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/coinbattle/overlay/overlay.html', related: ['game-engine', 'quiz-show'] }
});
