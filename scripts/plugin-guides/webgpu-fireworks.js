'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'webgpu-fireworks',
  route: '/webgpu-fireworks/ui',
  topic: ['WebGPU-Qualität, Auslöser und Performance-Grenze', 'WebGPU quality, trigger, and performance limit', 'calidad WebGPU, disparador y límite de rendimiento', 'qualité WebGPU, déclencheur et limite de performance'],
  test: ['den lokalen Follower-Test und die Overlay-Vorschau', 'the local follower test and overlay preview', 'la prueba local de follower y la vista previa del overlay', 'le test local de follower et l’aperçu overlay'],
  expected: ['das WebGPU-Feuerwerk wird gerendert, ohne TikTok LIVE zu verbinden', 'the WebGPU fireworks render without connecting TikTok LIVE', 'los fuegos WebGPU se renderizan sin conectar TikTok LIVE', 'les feux WebGPU sont rendus sans connecter TikTok LIVE'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/webgpu-fireworks/overlay', related: ['fireworks', 'visual-fx-frame-webgpu'] }
});
