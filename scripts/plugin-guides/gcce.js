'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'gcce',
  route: '/plugins/gcce/ui.html',
  topic: ['Befehl, Berechtigung und Chat-Antwort', 'command, permission, and chat response', 'comando, permiso y respuesta de chat', 'commande, autorisation et réponse de chat'],
  test: ['einen lokalen Testbefehl', 'a local test command', 'un comando de prueba local', 'une commande de test locale'],
  expected: ['der Befehl wird validiert, ohne eine LIVE-Chatnachricht zu senden', 'the command is validated without sending a LIVE chat message', 'el comando se valida sin enviar un mensaje de chat LIVE', 'la commande est validée sans envoyer de message de chat LIVE'],
  options: { safety: 'local', related: ['api-bridge', 'game-engine'] }
});
