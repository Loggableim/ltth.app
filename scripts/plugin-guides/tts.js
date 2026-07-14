'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'tts',
  route: '/plugins/tts/ui/admin-panel.html',
  topic: ['Stimme, Warteschlange und Moderationsfilter', 'voice, queue, and moderation filter', 'voz, cola y filtro de moderación', 'voix, file et filtre de modération'],
  test: ['eine stumme lokale Sprachvorschau', 'a muted local speech preview', 'una vista previa de voz local silenciada', 'un aperçu vocal local muet'],
  expected: ['die Vorschau validiert Text und Stimme, ohne Audio auszugeben', 'the preview validates text and voice without audio output', 'la vista previa valida texto y voz sin emitir audio', 'l’aperçu valide le texte et la voix sans sortie audio'],
  options: { requirement: 'audio', safety: 'credentials', related: ['talking-heads', 'soundboard'] }
});
