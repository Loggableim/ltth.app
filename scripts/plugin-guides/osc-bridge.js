'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'osc-bridge',
  route: '/plugins/osc-bridge/ui.html',
  topic: ['Loopback-Adresse, UDP-Port und Nachrichtentyp', 'loopback address, UDP port, and message type', 'dirección loopback, puerto UDP y tipo de mensaje', 'adresse loopback, port UDP et type de message'],
  test: ['eine lokale Loopback-Prüfung', 'a local loopback check', 'una comprobación loopback local', 'un contrôle loopback local'],
  expected: ['die Eingaben bleiben auf 127.0.0.1 und es wird kein VRChat-Client gesteuert', 'inputs remain on 127.0.0.1 and no VRChat client is controlled', 'las entradas permanecen en 127.0.0.1 y no se controla ningún cliente VRChat', 'les entrées restent sur 127.0.0.1 et aucun client VRChat n’est contrôlé'],
  options: { requirement: 'network', safety: 'local', related: ['stt-ticker', 'minecraft-connect'] }
});
