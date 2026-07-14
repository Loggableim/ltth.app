'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'webgpu-emoji-rain',
  route: '/plugins/webgpu-emoji-rain/ui.html',
  topic: ['WebGPU-Preset, Assets und Geschenkregel', 'WebGPU preset, assets, and gift rule', 'preajuste WebGPU, recursos y regla de regalo', 'préréglage WebGPU, assets et règle de cadeau'],
  test: ['ein lokales Emoji-Regen-Testereignis', 'a local emoji-rain test event', 'un evento de prueba local de lluvia de emoji', 'un événement local de test de pluie emoji'],
  expected: ['die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt', 'the GPU preview shows emojis and reports no LIVE connection', 'la vista previa GPU muestra emojis y no informa conexión LIVE', 'l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/webgpu-emoji-rain/overlay.html', related: ['emoji-rain', 'webgpu-fireworks'] }
});
