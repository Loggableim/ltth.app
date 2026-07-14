'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'quiz-show',
  route: '/plugins/quiz-show/quiz_show.html',
  topic: ['Fragenpool, Antwortzeit und Punktelogik', 'question pool, answer time, and scoring logic', 'banco de preguntas, tiempo de respuesta y lógica de puntuación', 'banque de questions, temps de réponse et logique de score'],
  test: ['eine lokale Quizfrage', 'a local quiz question', 'una pregunta de cuestionario local', 'une question de quiz locale'],
  expected: ['die Spielansicht zeigt die Frage ohne LIVE-Chatinteraktion', 'the game view shows the question without LIVE chat interaction', 'la vista de juego muestra la pregunta sin interacción de chat LIVE', 'la vue de jeu affiche la question sans interaction de chat LIVE'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/quiz-show/quiz_show_overlay.html', related: ['game-engine', 'interactive-story'] }
});
