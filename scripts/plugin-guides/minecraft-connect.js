'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'minecraft-connect',
  route: '/plugins/minecraft-connect/minecraft-connect.html',
  topic: ['Serveradresse, Ereignisbindung und Nachrichtenformat', 'server address, event binding, and message format', 'dirección del servidor, enlace de eventos y formato de mensaje', 'adresse serveur, liaison d’événements et format de message'],
  test: ['eine lokale Offline-Nachricht', 'a local offline message', 'un mensaje local sin conexión', 'un message local hors ligne'],
  expected: ['die Konfiguration wird geprüft, ohne einen Minecraft-Server zu kontaktieren', 'the configuration is checked without contacting a Minecraft server', 'la configuración se comprueba sin contactar un servidor de Minecraft', 'la configuration est contrôlée sans contacter de serveur Minecraft'],
  options: { requirement: 'network', safety: 'credentials', overlay: '/plugins/minecraft-connect/overlay/minecraft_overlay.html', related: ['osc-bridge', 'api-bridge'] }
});
