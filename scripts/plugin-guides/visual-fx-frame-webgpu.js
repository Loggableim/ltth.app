'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'visual-fx-frame-webgpu',
  route: '/visual-fx-frame-webgpu/ui',
  topic: ['WebGPU-Rahmen, Premium-Stile und Qualitätsprofil', 'WebGPU frame, premium styles, and quality profile', 'marco WebGPU, estilos premium y perfil de calidad', 'cadre WebGPU, styles premium et profil de qualité'],
  test: ['eine lokale WebGPU-Vorschau', 'a local WebGPU preview', 'una vista previa WebGPU local', 'un aperçu WebGPU local'],
  expected: ['der Rahmen wird gerendert und die Qualitätsanzeige bleibt im Testprofil', 'the frame is rendered and the quality indicator stays in the test profile', 'el marco se renderiza y el indicador de calidad permanece en el perfil de prueba', 'le cadre est rendu et l’indicateur de qualité reste dans le profil de test'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/visual-fx-frame-webgpu/overlay', related: ['webgpu-fireworks', 'flame-overlay'] }
});
