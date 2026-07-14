'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'toptier',
  route: '/plugins/toptier/ui.html',
  topic: ['Ranking-Regel, Schwelle und Anzeigestil', 'ranking rule, threshold, and display style', 'regla de ranking, umbral y estilo de visualización', 'règle de classement, seuil et style d’affichage'],
  test: ['einen lokalen Ranglistenwert', 'a local leaderboard value', 'un valor de clasificación local', 'une valeur de classement locale'],
  expected: ['die Top-Tier-Karte zeigt den Demo-Rang in der Vorschau', 'the Top Tier card shows the demo rank in preview', 'la tarjeta Top Tier muestra el rango demo en la vista previa', 'la carte Top Tier affiche le rang démo dans l’aperçu'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/toptier/overlay.html', related: ['milestone-leaderboard', 'spotlight'] }
});
