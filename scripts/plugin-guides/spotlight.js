'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'spotlight',
  route: '/plugins/spotlight/ui/main.html',
  topic: ['Ereignistyp, Anzeigedauer und Spotlight-Stil', 'event type, display duration, and spotlight style', 'tipo de evento, duración de visualización y estilo Spotlight', 'type d’événement, durée d’affichage et style Spotlight'],
  test: ['eine lokale Chatter-Vorschau', 'a local chatter preview', 'una vista previa local de chatter', 'un aperçu local de chatter'],
  expected: ['die Spotlight-Karte wird in der Vorschau gerendert', 'the spotlight card is rendered in preview', 'la tarjeta Spotlight se renderiza en la vista previa', 'la carte Spotlight est rendue dans l’aperçu'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/spotlight/overlays/chatter.html', related: ['clarityhud', 'toptier'] }
});
