'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'soundboard',
  route: '/plugins/soundboard/ui/index.html',
  topic: ['Sound-Slot, Lautstärke und Ereigniszuordnung', 'sound slot, volume, and event mapping', 'ranura de sonido, volumen y asignación de evento', 'slot sonore, volume et mappage d’événement'],
  test: ['einen stummen lokalen Soundtest', 'a muted local sound test', 'una prueba local de sonido silenciada', 'un test sonore local muet'],
  expected: ['die Zuordnung wird sichtbar, ohne Audio auszugeben', 'the mapping becomes visible without audio output', 'la asignación se hace visible sin emitir audio', 'le mappage devient visible sans sortie audio'],
  options: { requirement: 'audio', safety: 'local', related: ['music-bot', 'tts'] }
});
