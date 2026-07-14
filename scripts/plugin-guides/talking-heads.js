'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'talking-heads',
  route: '/plugins/talking-heads/ui.html',
  topic: ['Charakter, Sprachereignis und Lippenbewegung', 'character, speech event, and lip movement', 'personaje, evento de voz y movimiento de labios', 'personnage, événement vocal et mouvement des lèvres'],
  test: ['eine lokale Textvorschau', 'a local text preview', 'una vista previa de texto local', 'un aperçu de texte local'],
  expected: ['der Charakter reagiert in der Vorschau ohne TTS-Provider', 'the character reacts in preview without a TTS provider', 'el personaje reacciona en la vista previa sin proveedor TTS', 'le personnage réagit dans l’aperçu sans fournisseur TTS'],
  options: { requirement: 'audio', safety: 'credentials', overlay: '/plugins/talking-heads/overlay.html', related: ['tts', 'animazingpal'] }
});
