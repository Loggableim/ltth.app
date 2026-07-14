'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'music-bot',
  route: '/plugins/music-bot/ui.html',
  topic: ['MPV-Pfad, Anfragequeue und Moderationsregel', 'MPV path, request queue, and moderation rule', 'ruta de MPV, cola de solicitudes y regla de moderación', 'chemin MPV, file de demandes et règle de modération'],
  test: ['eine lokale Beispieldatei in der Queue', 'a local sample file in the queue', 'un archivo de ejemplo local en la cola', 'un fichier d’exemple local dans la file'],
  expected: ['die Queue zeigt den Eintrag; es startet keine externe Suche und keine Wiedergabe', 'the queue shows the entry; no external search or playback starts', 'la cola muestra la entrada; no inicia búsqueda externa ni reproducción', 'la file affiche l’entrée ; aucune recherche externe ni lecture ne démarre'],
  options: { requirement: 'audio', safety: 'local', overlay: '/plugins/music-bot/overlay.html', related: ['soundboard', 'tts'] }
});
