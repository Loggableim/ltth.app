'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'vdoninja',
  route: '/plugins/vdoninja/ui.html',
  topic: ['Raumname, Gastlayout und Browserquelle', 'room name, guest layout, and browser source', 'nombre de sala, diseño de invitados y fuente de navegador', 'nom de salle, disposition des invités et source navigateur'],
  test: ['eine lokale URL-Vorschau mit Platzhalterraum', 'a local URL preview with a placeholder room', 'una vista previa de URL local con sala de marcador', 'un aperçu d’URL local avec salle fictive'],
  expected: ['die Browser-Quelle ist vorbereitet, ohne einen Gast zu verbinden', 'the browser source is prepared without connecting a guest', 'la fuente de navegador está preparada sin conectar un invitado', 'la source navigateur est préparée sans connecter d’invité'],
  options: { requirement: 'obs', safety: 'credentials', related: ['multicam', 'clarityhud'] }
});
