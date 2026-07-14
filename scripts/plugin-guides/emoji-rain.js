'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'emoji-rain',
  route: '/plugins/emoji-rain/ui.html',
  topic: ['Emoji-Preset, Spawn-Regeln und Geschenkzuordnung', 'emoji preset, spawn rules, and gift mapping', 'preajuste de emoji, reglas de aparición y asignación de regalos', 'préréglage emoji, règles d’apparition et mappage des cadeaux'],
  test: ['ein lokales Regen-Testereignis', 'a local rain test event', 'un evento de prueba de lluvia local', 'un événement local de test de pluie'],
  expected: ['Emojis erscheinen in der Vorschau, ohne TikTok LIVE zu verbinden', 'emojis appear in preview without connecting TikTok LIVE', 'los emojis aparecen en la vista previa sin conectar TikTok LIVE', 'les emojis apparaissent dans l’aperçu sans connecter TikTok LIVE'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/emoji-rain/overlay.html', related: ['webgpu-emoji-rain', 'fireworks'] }
});
