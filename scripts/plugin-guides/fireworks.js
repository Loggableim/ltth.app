'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'fireworks',
  route: '/plugins/fireworks/ui/settings.html',
  topic: ['Effektprofil, Auslöser und Audio-Lautstärke', 'effect profile, trigger, and audio volume', 'perfil de efecto, disparador y volumen de audio', 'profil d’effet, déclencheur et volume audio'],
  test: ['den eingebauten Feuerwerk-Test', 'the built-in fireworks test', 'la prueba integrada de fuegos artificiales', 'le test intégré de feux d’artifice'],
  expected: ['das Feuerwerk erscheint in der lokalen Overlay-Vorschau', 'the fireworks appear in the local overlay preview', 'los fuegos artificiales aparecen en la vista previa local', 'les feux d’artifice apparaissent dans l’aperçu local'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/fireworks/overlay.html', related: ['webgpu-fireworks', 'flame-overlay'] }
});
