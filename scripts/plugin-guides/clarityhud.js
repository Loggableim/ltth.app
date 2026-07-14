'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'clarityhud',
  route: '/clarityhud/ui',
  topic: ['HUD-Module, Chatbereich und Stream-Overlay', 'HUD modules, chat area, and stream overlay', 'módulos HUD, área de chat y overlay de stream', 'modules HUD, zone de chat et overlay de stream'],
  test: ['die Full-HUD-Vorschau mit Demo-Daten', 'the full HUD preview with demo data', 'la vista previa Full HUD con datos demo', 'l’aperçu Full HUD avec des données démo'],
  expected: ['die gewählten HUD-Bereiche sind in der Vorschau sichtbar', 'the selected HUD sections are visible in preview', 'las áreas HUD seleccionadas son visibles en la vista previa', 'les zones HUD sélectionnées sont visibles dans l’aperçu'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/overlay/clarity/full', related: ['spotlight', 'toptier'] }
});
