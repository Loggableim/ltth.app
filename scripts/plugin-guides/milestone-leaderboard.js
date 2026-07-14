'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'milestone-leaderboard',
  route: '/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html',
  topic: ['XP-Regeln, Meilenstein und Ranglistenanzeige', 'XP rules, milestone, and leaderboard display', 'reglas de XP, hito y visualización de clasificación', 'règles XP, jalon et affichage du classement'],
  test: ['einen lokalen XP-Impuls', 'a local XP pulse', 'un impulso de XP local', 'une impulsion XP locale'],
  expected: ['ein Demonutzer erscheint in der Ranglisten-Vorschau', 'a demo user appears in the leaderboard preview', 'un usuario demo aparece en la vista previa de clasificación', 'un utilisateur démo apparaît dans l’aperçu du classement'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html', related: ['goals', 'toptier'] }
});
