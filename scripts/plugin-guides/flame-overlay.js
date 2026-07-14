'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'flame-overlay',
  route: '/plugins/flame-overlay/ui/settings.html',
  topic: ['Rahmenstil, Intensität und Farbvorgabe', 'frame style, intensity, and color preset', 'estilo de marco, intensidad y preajuste de color', 'style de cadre, intensité et préréglage de couleur'],
  test: ['die lokale Rahmenvorschau', 'the local frame preview', 'la vista previa local del marco', 'l’aperçu local du cadre'],
  expected: ['der Rahmen ist sichtbar, ohne eine LIVE-Szene zu verändern', 'the frame is visible without changing a LIVE scene', 'el marco es visible sin cambiar una escena LIVE', 'le cadre est visible sans modifier une scène LIVE'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/flame-overlay/renderer/index.html', related: ['visual-fx-frame-webgpu', 'fireworks'] }
});
