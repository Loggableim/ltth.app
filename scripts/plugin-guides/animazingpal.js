'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'animazingpal',
  route: '/plugins/animazingpal/ui.html',
  topic: ['Avatar- und Ereigniszuordnung', 'avatar and event mapping', 'asignación de avatar y eventos', 'mappage d’avatar et d’événements'],
  test: ['ein lokales Beispielereignis ohne Kontoanmeldung', 'a local sample event without account sign-in', 'un evento de ejemplo local sin iniciar sesión', 'un événement local sans connexion au compte'],
  expected: ['die Zuordnung wird gespeichert, ohne einen externen Dienst zu kontaktieren', 'the mapping is saved without contacting an external service', 'la asignación se guarda sin contactar un servicio externo', 'le mappage est enregistré sans contacter de service externe'],
  options: { requirement: 'network', safety: 'credentials', related: ['talking-heads', 'osc-bridge'] }
});
