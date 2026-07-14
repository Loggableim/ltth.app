'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'goals',
  route: '/plugins/goals/ui.html',
  topic: ['Zielwert, Fortschrittsanzeige und Reset-Regel', 'goal value, progress display, and reset rule', 'valor de objetivo, visualización de progreso y regla de reinicio', 'valeur d’objectif, affichage de progression et règle de remise à zéro'],
  test: ['einen lokalen Fortschrittsimpuls', 'a local progress pulse', 'un impulso de progreso local', 'une impulsion de progression locale'],
  expected: ['die Fortschrittsanzeige ändert sich nur im Testprofil', 'the progress display changes only in the test profile', 'la visualización de progreso cambia solo en el perfil de prueba', 'l’affichage de progression change uniquement dans le profil de test'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/goals/overlay/index.html', related: ['advanced-timer', 'milestone-leaderboard'] }
});
