'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'thermal-printer',
  route: '/plugins/thermal-printer/ui.html',
  topic: ['Druckerprofil, Zeichensatz und Warteschlange', 'printer profile, character set, and queue', 'perfil de impresora, juego de caracteres y cola', 'profil d’imprimante, jeu de caractères et file'],
  test: ['den Offline-Queue-Test', 'the offline queue test', 'la prueba de cola sin conexión', 'le test de file hors ligne'],
  expected: ['ein Testeintrag bleibt in der Queue; es wird nichts gedruckt', 'a test item remains in the queue; nothing is printed', 'una entrada de prueba permanece en la cola; no se imprime nada', 'une entrée de test reste dans la file ; rien n’est imprimé'],
  options: { requirement: 'hardware', safety: 'hardware', related: ['openshock', 'config-import'] }
});
