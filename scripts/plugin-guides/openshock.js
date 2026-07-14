'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'openshock',
  route: '/plugins/openshock/ui.html',
  topic: ['Sicherheitslimit, Queue und Gerätezuordnung', 'safety limit, queue, and device mapping', 'límite de seguridad, cola y asignación de dispositivo', 'limite de sécurité, file et mappage d’appareil'],
  test: ['die eingebaute Simulation ohne Token und Gerät', 'the built-in simulation without a token or device', 'la simulación integrada sin token ni dispositivo', 'la simulation intégrée sans jeton ni appareil'],
  expected: ['der Ablauf wird als Simulation angezeigt und löst keine Haptik aus', 'the flow is shown as a simulation and triggers no haptics', 'el flujo se muestra como simulación y no activa háptica', 'le flux est affiché comme simulation et ne déclenche aucune haptique'],
  options: { requirement: 'hardware', safety: 'hardware', overlay: '/plugins/openshock/overlay/openshock_overlay.html', related: ['game-engine', 'thermal-printer'] }
});
